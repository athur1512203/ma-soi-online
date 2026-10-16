import {scopedRequest} from './client-request.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as clientIO } from 'socket.io-client';
import { attachLobby } from '../lobby.js';
import { GAME_DURATIONS } from '../game-config.js';
import { fakeClock } from './fake-clock.mjs';

const clock = fakeClock(), durations = Object.fromEntries(Object.keys(GAME_DURATIONS).map(key => [key, 10]));
const server = http.createServer(), io = new Server(server);
const lobby = attachLobby(io, { reconnectMs: 2000, durations, engineClock: clock });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`, clients = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (socket, event, value) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, scopedRequest(socket, event, value), (error, result) => error ? reject(error) : resolve(result)));
async function connect(token) {
  const socket = clientIO(url, { forceNew: true, transports: ['websocket'], reconnection: false, auth: { reconnectToken: token } });
  clients.push(socket); socket.events = [];
  socket.onAny((event, value) => socket.events.push({ event, value }));
  socket.on('state', state => { socket.state = state; });
  socket.on('game:state', state => { socket.game = state; });
  socket.on('session', session => { socket.session = session; });
  socket.on('game:role-assigned', role => { socket.role = role; });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await wait(5); return socket;
}
async function group() {
  const host = await connect(), { roomCode } = await emit(host, 'room:create', { name: 'Host' });
  const players = [host];
  for (let i = 1; i < 8; i++) {
    const p = await connect(); players.push(p);
    await emit(p, 'room:join', { name: `Player${i}`, roomCode }); await emit(p, 'room:ready', { ready: true });
  }
  const config = { werewolf: 2, villager: 1, seer: 1, witch: 1, guard: 1, cupid: 1, hunter: 1, elder: 0, idiot: 0 };
  assert.equal((await emit(host, 'roles:config:update', { config })).ok, true);
  assert.equal((await emit(host, 'game:start')).ok, true);
  return { players, host, roomCode, room: lobby.rooms.get(roomCode) };
}
const state = async p => (await emit(p, 'game:state-request')).gameState;
const actor = (group, role) => group.players.find(p => group.room.roleAssignments.get(p.state.me.id) === role);
function advanceUntil(room, phase) { for (let i = 0; i < 30 && room.engine.publicState().phase !== phase; i++) clock.advance(10); assert.equal(room.engine.publicState().phase, phase); }
function safePublic(value) {
  const secret = ['role', 'team', 'roleId', 'roleAssignments', 'token', 'reconnectToken', 'actionStep', 'currentStep', 'canComplete', 'hasCompleted', 'actors', 'actorIds', 'completed'];
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { assert.equal(secret.includes(key), false, `Secret ${key} leaked`); safePublic(child); }
}
try {
  const outsider = await connect(); assert.equal((await emit(outsider, 'game:state-request')).ok, false);
  const a = await group(), b = await group();
  assert.notEqual(a.room.engine, b.room.engine);
  assert.equal(a.room.engine.publicState().phase, 'role_reveal'); assert.equal(clock.pendingCount, 2);
  assert.equal((await emit(a.host, 'chat:public', 'night message')).ok, false);
  clock.advance(20);
  const cupid = actor(a, 'cupid'), spectator = actor(a, 'villager');
  const first = await state(cupid); assert.equal(first.actionStep, 'cupid'); assert.equal(first.canComplete, true);
  assert.equal((await state(spectator)).actionStep, null);
  assert.equal((await emit(spectator, 'game:step-complete', { phaseVersion: first.phaseVersion, isHost: true })).ok, false);
  assert.equal((await emit(spectator, 'game:step-complete', { phaseVersion: first.phaseVersion })).ok, false);
  const internalCupid = a.room.players.find(p => p.id === cupid.state.me.id);
  internalCupid.alive = false;
  assert.equal((await emit(cupid, 'game:step-complete', { phaseVersion: first.phaseVersion })).ok, false);
  internalCupid.alive = true;
  const bVersion = b.room.engine.publicState().phaseVersion;
  assert.equal((await emit(cupid, 'game:ability:submit', {phaseVersion:first.phaseVersion,targetIds:[cupid.state.me.id,spectator.state.me.id]})).ok, true);
  assert.equal(b.room.engine.publicState().phaseVersion, bVersion, 'Other room must not advance');
  assert.equal((await emit(cupid, 'game:step-complete', { phaseVersion: first.phaseVersion })).ok, false);
  assert.equal((await state(cupid)).canComplete, false, 'Lovers notice is system-only');
  clock.advance(10);
  const guard = actor(a, 'guard'); assert.equal((await state(guard)).actionStep, 'guard');
  const stable = a.room.engine.publicState(), oldRole = spectator.role, token = spectator.session.reconnectToken;
  spectator.disconnect(); await wait(20);
  const resumed = await connect(token);
  assert.equal(resumed.game.phaseVersion, stable.phaseVersion); assert.equal(resumed.game.stepEndsAt, stable.stepEndsAt);
  assert.deepEqual(resumed.role, oldRole); assert.equal(resumed.game.actionStep, null);
  assert.equal(clock.pendingCount, 2, 'Reconnect must not add engine timers');
  const before = a.room.engine.publicState().phaseVersion;
  for (const event of ['phase:set', 'phase:resolve', 'night:finish', 'night:target', 'seer:inspect', 'witch:act', 'vote:cast', 'chat:wolf']) assert.equal((await emit(a.host, event, 'day')).ok, false);
  assert.equal(a.room.engine.publicState().phaseVersion, before);
  const guardState = await state(guard);
  assert.equal((await emit(guard, 'game:step-complete', { phaseVersion: guardState.phaseVersion, targetId: spectator.state.me.id })).ok, false);
  assert.equal((await emit(guard, 'game:step-complete', { phaseVersion: guardState.phaseVersion })).ok, true);
  const seer = actor(a, 'seer'); assert.equal((await state(seer)).actionStep, 'seer');
  await emit(seer, 'game:step-complete', { phaseVersion: (await state(seer)).phaseVersion });
  const wolves = a.players.filter(p => a.room.roleAssignments.get(p.state.me.id) === 'werewolf');
  const wolfState = await state(wolves[0]); assert.equal(wolfState.actionStep, 'werewolf');
  assert.equal((await emit(wolves[0], 'game:step-complete', { phaseVersion: wolfState.phaseVersion })).ok, true);
  assert.equal((await emit(wolves[0], 'game:step-complete', { phaseVersion: wolfState.phaseVersion })).ok, false);
  assert.equal((await state(wolves[1])).phaseVersion, wolfState.phaseVersion);
  assert.equal((await state(wolves[0])).hasCompleted, true);
  assert.equal((await emit(wolves[1], 'game:step-complete', { phaseVersion: wolfState.phaseVersion })).ok, true);
  assert.equal((await state(actor(a, 'witch'))).actionStep, 'witch');
  advanceUntil(a.room, 'day_discussion');
  const day = await state(resumed); assert.equal(day.canPublicChat, true); assert.equal(resumed.state.permissions.canPublicChat, true);
  assert.equal((await emit(resumed, 'chat:public', 'Xin chào ban ngày')).ok, true);
  assert.equal((await emit(resumed, 'chat:public', ' ')).ok, false);
  assert.equal((await emit(resumed, 'chat:public', { text: 'bad payload' })).ok, false);
  await wait(5); assert.equal(a.host.state.publicChat.at(-1).text, 'Xin chào ban ngày'); assert.equal(b.host.state.publicChat.length, 0);
  const resumedInternal = a.room.players.find(p => p.id === resumed.state.me.id);
  resumedInternal.alive = false; assert.equal((await emit(resumed, 'chat:public', 'not allowed')).ok, false); resumedInternal.alive = true;
  advanceUntil(a.room, 'nomination_vote');
  const parked = a.room.engine.publicState().phaseVersion;
  assert.equal(a.room.engine.publicState().phaseVersion, parked); assert.equal(a.room.engine.publicState().nightNumber, 1);
  assert.equal((await emit(resumed, 'chat:public', 'too late')).ok, false);
  assert.equal((await emit(resumed, 'game:step-complete', { phaseVersion: day.phaseVersion })).ok, false);
  assert.equal(a.room.players.every(p => p.alive), true);
  assert.equal(Object.hasOwn(a.room, 'victims'), false); assert.equal(Object.hasOwn(a.room, 'lovers'), false);
  for (const p of clients) for (const e of p.events.filter(e => ['room:updated', 'state', 'game:started', 'game:phase-changed', 'game:step-changed'].includes(e.event))) safePublic(e.value);
  // Deleting a room cancels its timer. Even queued old callbacks cannot mutate it.
  const pendingBefore = clock.pendingCount;
  const c = await group(), disposedEngine = c.room.engine;
  const oldVersion = disposedEngine.publicState().phaseVersion;
  for (const p of c.players) await emit(p, 'room:leave');
  assert.equal(lobby.rooms.has(c.roomCode), false); assert.equal(clock.pendingCount, pendingBefore);
  for (const callback of [...clock.callbacks]) callback();
  assert.equal(disposedEngine.publicState().phaseVersion, oldVersion);
  console.log('PASS: Socket.IO engine initialization, permissions, privacy, phase replay protection, reconnect, independent rooms, day chat and cleanup');
} finally {
  clients.forEach(p => p.disconnect()); lobby.close(); await new Promise(resolve => io.close(resolve));
}

