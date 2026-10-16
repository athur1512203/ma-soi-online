import {scopedRequest} from './client-request.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as clientIO } from 'socket.io-client';
import { attachLobby } from '../lobby.js';
import { ROLES, defaultRoleConfig, validateRoleConfig } from '../shared/roles.js';

const server = http.createServer(), io = new Server(server);
const lobby = attachLobby(io, { reconnectMs: 2000 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`, clients = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (socket, event, value) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, scopedRequest(socket, event, value), (error, result) => error ? reject(error) : resolve(result)));
async function connect(token) {
  const socket = clientIO(url, { forceNew: true, transports: ['websocket'], reconnection: false, auth: { reconnectToken: token } });
  clients.push(socket); socket.events = []; socket.roles = [];
  socket.onAny((event, value) => { socket.events.push({ event, value }); });
  socket.on('state', state => { socket.state = state; });
  socket.on('session', session => { socket.session = session; });
  socket.on('game:role-assigned', role => { socket.roles.push(role); });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await wait(5); return socket;
}
async function group(count) {
  const host = await connect(); const { roomCode } = await emit(host, 'room:create', { name: 'Host' });
  const players = [host];
  for (let i = 1; i < count; i++) {
    const p = await connect(); players.push(p);
    assert.equal((await emit(p, 'room:join', { name: `P${i}`, roomCode })).ok, true);
  }
  return { host, players, room: lobby.rooms.get(roomCode), roomCode };
}
async function ready(players) { for (const p of players.slice(1)) assert.equal((await emit(p, 'room:ready', { ready: true })).ok, true); }
function assertPublic(value) {
  const prohibited = new Set(['role', 'team', 'roleAssignments', 'roleId', 'reconnectToken', 'token']);
  function visit(object) { if (!object || typeof object !== 'object') return; for (const [key, child] of Object.entries(object)) { assert.equal(prohibited.has(key), false, `Secret field ${key} in public event`); visit(child); } }
  visit(value);
}
try {
  const twelve = defaultRoleConfig(12);
  assert.deepEqual(twelve, { werewolf: 3, villager: 2, seer: 1, witch: 1, guard: 1, hunter: 1, cupid: 1, elder: 1, idiot: 1 });
  assert.equal(ROLES.find(role => role.id === 'cupid').team, 'village');
  const { host, players, room, roomCode } = await group(6);
  const config = { ...defaultRoleConfig(6), witch: 0, guard: 1 };
  assert.equal((await emit(players[1], 'roles:config:update', { config, isHost: true })).ok, false);
  assert.equal((await emit(host, 'roles:config:update', { config })).ok, true);
  await wait(10);
  for (const p of players) {
    assert.deepEqual(p.state.roleConfig, config);
    assert.deepEqual(p.events.findLast(e => e.event === 'roles:config:updated').value.roleConfig, config);
    assert.deepEqual((await emit(p, 'roles:config:get', { playerId: host.state.me.id })).roleConfig, config);
  }
  const invalid = [null, [], {}, { ...config, extra: 0 }, { ...config, villager: 3 }, { ...config, werewolf: 6 }, { ...config, seer: 2 }, { ...config, seer: -1 }, { ...config, seer: .5 }, { ...config, seer: '1' }, { ...config, seer: null }, { ...config, seer: false }, { ...config, seer: 0 }, { ...config, werewolf: 0 }, { ...config, werewolf: 3, guard: 0 }];
  for (const bad of invalid) {
    const response = await emit(host, 'roles:config:update', { config: bad });
    assert.equal(response.ok, false, JSON.stringify(bad)); assert.ok(response.error);
    assert.deepEqual(room.roleConfig, config, 'Invalid saves must not mutate saved config');
  }
  await ready(players);
  assert.equal((await emit(players[1], 'game:start', { isHost: true })).ok, false);
  // Start revalidates stored config rather than trusting the earlier save or client input.
  for (const bad of [{ ...config, werewolf: 0 }, { ...config, werewolf: 3, guard: 0 }]) {
    room.roleConfig = bad;
    assert.equal((await emit(host, 'game:start')).ok, false);
    assert.equal(room.roleAssignments, null);
  }
  room.roleConfig = config;
  const extra = await connect();
  await emit(extra, 'room:join', { name: 'Extra', roomCode });
  await emit(extra, 'room:ready', { ready: true });
  assert.deepEqual(room.roleConfig, config, 'Membership changes must preserve saved config');
  assert.match(host.state.roleConfigError, /Tổng số thẻ/);
  assert.equal((await emit(host, 'game:start')).ok, false);
  await emit(extra, 'room:leave');
  players[2].disconnect(); await wait(20);
  assert.equal((await emit(host, 'game:start')).ok, false);
  players[2] = await connect(players[2].session.reconnectToken);
  assert.equal(players[2].roles.length, 0);
  const starts = await Promise.all([emit(host, 'game:start', { role: 'werewolf' }), emit(host, 'room:start-request')]);
  assert.equal(starts.filter(result => result.ok).length, 1);
  assert.equal(room.status, 'playing'); assert.equal(room.roleAssignments.size, 6);
  await wait(10);
  const assignedCounts = Object.fromEntries(ROLES.map(role => [role.id, 0]));
  for (const p of players) {
    assert.equal(p.roles.length, 1, 'One private assignment per player');
    const assignment = p.roles[0]; const expected = room.roleAssignments.get(p.state.me.id);
    assert.equal(assignment.role, expected); assert.equal(assignment.team, ROLES.find(role => role.id === expected).team);
    assert.deepEqual(Object.keys(assignment).sort(), ['role', 'team']); assignedCounts[expected]++;
    for (const e of p.events.filter(e => ['state', 'room:updated', 'game:started', 'roles:config:updated'].includes(e.event))) assertPublic(e.value);
    assert.equal(p.state.phase, 'role_reveal');
  }
  assert.deepEqual(assignedCounts, config);
  const assignments = [...room.roleAssignments];
  assert.equal((await emit(host, 'game:start')).ok, false);
  assert.deepEqual([...room.roleAssignments], assignments);
  assert.equal((await emit(host, 'roles:config:update', { config })).ok, false);
  assert.equal((await emit(players[1], 'room:ready', { ready: false })).ok, false);
  assert.equal((await emit(extra, 'room:join', { name: 'Late', roomCode })).ok, false);
  const id = players[1].state.me.id, token = players[1].session.reconnectToken, oldRole = players[1].roles[0];
  const fake = await connect('fake-session'); assert.equal(fake.session, undefined); assert.equal(fake.roles.length, 0);
  const duplicate = await connect(token); assert.equal(duplicate.session, undefined); assert.equal(duplicate.roles.length, 0);
  players[1].disconnect(); await wait(20);
  const resumed = await connect(token);
  assert.equal(resumed.state.me.id, id); assert.deepEqual(resumed.session.role, oldRole); assert.deepEqual(resumed.roles, [oldRole]);
  assert.deepEqual([...room.roleAssignments], assignments, 'Reconnect must not redeal');
  assert.equal(host.roles.length, 1, 'Host must never receive another player assignment');
  const unrelated = await group(1);
  assert.equal((await emit(unrelated.host, 'roles:config:update', { config })).ok, false);
  assert.equal((await emit(unrelated.host, 'game:start')).ok, false);
  assert.deepEqual(unrelated.host.roles, []);
  for (let count = 6; count <= 12; count++) {
    const g = await group(count);
    const expectedConfig = defaultRoleConfig(count);
    assert.equal(validateRoleConfig(expectedConfig, count), null);
    assert.deepEqual(g.room.roleConfig, expectedConfig);
    assert.equal((await emit(g.host, 'roles:config:update', { config: expectedConfig })).ok, true);
    await ready(g.players);
    assert.equal((await emit(g.host, count % 2 ? 'game:start' : 'room:start-request')).ok, true);
    await wait(5);
    const counts = Object.fromEntries(ROLES.map(role => [role.id, 0]));
    for (const p of g.players) { assert.equal(p.roles.length, 1); counts[p.roles[0].role]++; assertPublic(p.state); }
    assert.deepEqual(counts, expectedConfig); assert.equal(g.room.roleAssignments.size, count);
    for (const p of g.players) await emit(p, 'room:leave');
  }
  // New host inherits customized settings and authority after the old host leaves.
  const transfer = await group(7);
  await emit(transfer.host, 'roles:config:update', { config: defaultRoleConfig(7) });
  await emit(transfer.host, 'room:leave');
  assert.equal((await emit(transfer.host, 'roles:config:get')).ok, false);
  assert.equal((await emit(transfer.players[1], 'roles:config:update', { config: defaultRoleConfig(6) })).ok, true);
  console.log('PASS: Rules 02 configuration validation, synchronization, private dealing, replay protection, reconnect and rooms 6–12');
} finally {
  clients.forEach(socket => socket.disconnect()); lobby.close(); await new Promise(resolve => io.close(resolve));
}
