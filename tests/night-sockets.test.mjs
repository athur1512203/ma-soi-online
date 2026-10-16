import {scopedRequest} from './client-request.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as clientIO } from 'socket.io-client';
import { attachLobby } from '../lobby.js';
import { GAME_DURATIONS } from '../game-config.js';
import { fakeClock } from './fake-clock.mjs';

const clock = fakeClock(), durations = Object.fromEntries(Object.keys(GAME_DURATIONS).map(key => [key, 10]));
const server = http.createServer(), io = new Server(server), clients = [];
const lobby = attachLobby(io, { durations, engineClock: clock, reconnectMs: 2000 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (p, event, value) => new Promise((resolve, reject) => p.timeout(2000).emit(event, scopedRequest(p, event, value), (error, response) => error ? reject(error) : resolve(response)));
async function connect(token) {
  const p = clientIO(url, { forceNew: true, reconnection: false, transports: ['websocket'], auth: { reconnectToken: token } });
  clients.push(p); p.events = [];
  p.onAny((event, value) => p.events.push({ event, value })); p.on('session', value => { p.session = value; }); p.on('state', value => { p.state = value; }); p.on('game:state', value => { p.game = value; });
  await new Promise((resolve, reject) => { p.once('connect', resolve); p.once('connect_error', reject); }); await wait(5); return p;
}
async function group(count, config) {
  const host = await connect(), { roomCode } = await emit(host, 'room:create', { name: 'Host' }), players = [host];
  for (let i = 1; i < count; i++) { const p = await connect(); players.push(p); await emit(p, 'room:join', { name: `Player ${i}`, roomCode }); await emit(p, 'room:ready', { ready: true }); }
  if (config) assert.equal((await emit(host, 'roles:config:update', { config })).ok, true);
  assert.equal((await emit(host, 'game:start')).ok, true);
  return { host, players, roomCode, room: lobby.rooms.get(roomCode) };
}
const state = async p => (await emit(p, 'game:state-request')).gameState;
const submit = async (p, payload) => emit(p, 'game:ability:submit', { phaseVersion: (await state(p)).phaseVersion, ...payload });
const publicEvents = ['state', 'room:updated', 'game:started', 'game:phase-changed', 'game:step-changed', 'game:night:resolved', 'game:day:announcement'];
function publicOnly(data) {
  if (!data || typeof data !== 'object') return;
  for (const [key, value] of Object.entries(data)) {
    assert.equal(['role', 'team', 'roleId', 'token', 'reconnectToken', 'roleAssignments', 'ability', 'abilityResult', 'seerResult', 'lover', 'lovers', 'victim', 'potions', 'wolfTarget', 'guardTarget', 'poisonTarget', 'cause', 'targets', 'currentStep', 'actionStep', 'canComplete', 'hasCompleted'].includes(key), false, `Leaked ${key}`);
    publicOnly(value);
  }
}
try {
  const g = await group(10, { werewolf: 2, villager: 1, seer: 1, witch: 1, guard: 1, cupid: 1, elder: 1, hunter: 1, idiot: 1 });
  const actor = role => g.players.find(p => g.room.roleAssignments.get(p.state.me.id) === role);
  const cupid = actor('cupid'), seer = actor('seer'), guard = actor('guard'), witch = actor('witch'), villager = actor('villager'), elder = actor('elder');
  const wolves = g.players.filter(p => g.room.roleAssignments.get(p.state.me.id) === 'werewolf');
  const outsider = await connect('fake-token'); assert.equal((await emit(outsider, 'game:ability:submit', { phaseVersion: g.room.engine.publicState().phaseVersion, targetIds: [cupid.state.me.id, seer.state.me.id] })).ok, false);
  clock.advance(20);
  assert.equal((await submit(villager, { targetIds: [cupid.state.me.id, seer.state.me.id] })).ok, false);
  assert.equal((await submit(cupid, { targetIds: [cupid.state.me.id, cupid.state.me.id] })).ok, false);
  assert.equal((await submit(cupid, { targetIds: [cupid.state.me.id, seer.state.me.id] })).ok, true);
  assert.equal((await state(seer)).lover.id, cupid.state.me.id);
  for (const p of g.players.filter(p => p !== cupid && p !== seer)) assert.equal((await state(p)).lover, null);
  clock.advance(10);
  assert.equal((await submit(guard, { targetId: villager.state.me.id, isHost: true })).ok, false);
  assert.equal((await submit(guard, { targetId: villager.state.me.id })).ok, true);
  const savedVersion = (await state(guard)).phaseVersion;
  assert.equal((await submit(seer, { targetId: wolves[0].state.me.id })).result.isWolf, true);
  for (const p of g.players.filter(p => p !== seer)) assert.equal((await state(p)).seerResult, null);
  assert.equal(seer.events.filter(e => e.event === 'game:ability:result').at(-1).value.isWolf, true);
  assert.equal((await submit(wolves[0], { targetId: wolves[1].state.me.id })).ok, false);
  assert.equal((await submit(wolves[0], { targetId: villager.state.me.id })).ok, true);
  assert.equal((await state(wolves[0])).ability.teammates.length, 2);
  for (const p of g.players.filter(p => !wolves.includes(p))) assert.equal((await state(p)).ability, null);
  const before = await state(wolves[0]), token = wolves[0].session.reconnectToken;
  wolves[0].disconnect(); await wait(20);
  assert.equal(g.room.engine.publicState().phaseVersion, before.phaseVersion, 'Disconnect must not advance the wolf step');
  const resumed = await connect(token);
  assert.equal(resumed.game.phaseVersion, before.phaseVersion); assert.equal(resumed.game.stepEndsAt, before.stepEndsAt);
  assert.equal(resumed.game.hasCompleted, true); assert.equal(resumed.game.ability.selected.targetId, villager.state.me.id); assert.equal(resumed.game.ability.canSubmit, true);
  assert.equal((await submit(resumed, { targetId: elder.state.me.id })).ok, true);
  assert.equal((await submit(resumed, { targetId: villager.state.me.id })).ok, true);
  assert.equal((await submit(wolves[1], { targetId: villager.state.me.id })).ok, true);
  assert.equal((await state(witch)).ability.victim.id, villager.state.me.id);
  const witchVersion = (await state(witch)).phaseVersion;
  const action = { phaseVersion: witchVersion, save: true, poisonTargetId: elder.state.me.id };
  const responses = await Promise.all([emit(witch, 'game:ability:submit', action), emit(witch, 'game:ability:submit', action)]);
  assert.equal(responses.filter(r => r.ok).length, 1);
  assert.equal(g.room.players.find(p => p.id === elder.state.me.id).alive, true, 'Deaths remain private until dawn');
  assert.equal((await emit(guard, 'game:ability:submit', { phaseVersion: savedVersion, targetId: witch.state.me.id })).ok, false);
  const viewer = g.players.find(p => p.connected && p !== seer);
  clock.advance(10); await state(viewer);
  assert.equal(viewer.state.players.find(p => p.id === elder.state.me.id).alive, false);
  assert.equal(viewer.state.players.find(p => p.id === villager.state.me.id).alive, true);
  for (const p of [...g.players.filter(p => p.connected), resumed]) {
    const notices = p.events.filter(e => e.event === 'game:day:announcement');
    assert.equal(notices.length, 1); assert.deepEqual(notices[0].value.eliminated.map(p => p.id), [elder.state.me.id]);
  }
  const seerToken = seer.session.reconnectToken; seer.disconnect(); await wait(20); const seerAgain = await connect(seerToken);
  assert.equal(seerAgain.game.seerResult.isWolf, true); assert.equal(seerAgain.game.lover.id, cupid.state.me.id);
  assert.equal((await emit(elder, 'game:ability:submit', { phaseVersion: witchVersion, save: false, poisonTargetId: witch.state.me.id })).ok, false);
  for (const p of clients) for (const e of p.events.filter(e => publicEvents.includes(e.event))) publicOnly(e.value);
  // Full nights using normal default configurations at every supported room size.
  for (let count = 6; count <= 12; count++) {
    const h = await group(count); while (h.room.engine.publicState().phase !== 'nomination_vote') clock.advance(10); await state(h.host);
    assert.equal(h.host.game.phase, 'nomination_vote'); assert.equal(h.host.game.nightNumber, 1);
    assert.equal(h.host.state.players.every(p => p.alive), true);
    assert.equal(h.host.game.announcement.message, 'Đêm qua là một đêm bình yên');
    for (const p of h.players) await emit(p, 'room:leave');
  }
  console.log('PASS: private skill Socket.IO, lover/seer secrecy, wolf reconnect/revote, atomic duplicate rejection, dawn announcements and full nights for 6–12 players');
} finally { clients.forEach(p => p.disconnect()); lobby.close(); await new Promise(resolve => io.close(resolve)); }
