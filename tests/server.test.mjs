import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const clients = [];
const serverUrl = process.env.TEST_SERVER_URL || 'http://localhost:3001';
const connect = () => new Promise((resolve, reject) => {
  const client = io(serverUrl, { transports: ['websocket'], forceNew: true });
  clients.push(client);
  client.once('session', session => resolve({ client, session }));
  client.once('connect_error', reject);
});
const emit = (client, event, value) => new Promise(resolve => client.emit(event, value, resolve));
const nextState = client => new Promise(resolve => client.once('state', resolve));

try {
  const wolfA = await connect();
  const wolfB = await connect();
  const villager = await connect();
  assert.equal(wolfA.session.role, null, 'Lobby must not expose a role');
  await emit(wolfA.client, 'game:start');
  const daytimeReject = await emit(wolfA.client, 'chat:wolf', 'secret');
  assert.match(daytimeReject.error, /không có quyền/i);
  const wolfStatePromise = nextState(wolfA.client);
  const villagerStatePromise = nextState(villager.client);
  await emit(wolfA.client, 'phase:set', 'wolf');
  const wolfState = await wolfStatePromise;
  assert.equal(wolfState.role.key, 'wolf');
  assert.equal(wolfState.permissions.canWolfChat, true);
  const villagerState = await villagerStatePromise;
  assert.equal(villagerState.permissions.canSeeWolfChat, false);
  assert.deepEqual(villagerState.wolfChat, []);
  const sent = await emit(wolfA.client, 'chat:wolf', 'Chọn Minh');
  assert.equal(sent.ok, true);
  const denied = await emit(villager.client, 'chat:wolf', 'intrusion');
  assert.match(denied.error, /không có quyền/i);
  const targetWolf = await emit(wolfA.client, 'night:target', wolfB.session.me.id);
  assert.match(targetWolf.error, /không hợp lệ/i);
  await emit(wolfA.client, 'phase:set', 'vote');
  const selfVote = await emit(villager.client, 'vote:cast', villager.session.me.id);
  assert.match(selfVote.error, /không hợp lệ/i);
  const vote = await emit(villager.client, 'vote:cast', wolfA.session.me.id);
  assert.equal(vote.ok, true);
  const secondVote = await emit(villager.client, 'vote:cast', wolfB.session.me.id);
  assert.match(secondVote.error, /đã bỏ phiếu/i);
  console.log('PASS: role privacy, chat authorization, night targets, and secret vote rules');
} finally {
  clients.forEach(client => client.disconnect());
}
