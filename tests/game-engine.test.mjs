import assert from 'node:assert/strict';
import { createGameEngine, nightSteps } from '../game-engine.js';
import { GAME_DURATIONS, gameDurations } from '../game-config.js';
import { fakeClock } from './fake-clock.mjs';

const durations = Object.fromEntries(Object.keys(GAME_DURATIONS).map(key => [key, 10]));
function fixture(roles = ['cupid', 'guard', 'seer', 'werewolf', 'werewolf', 'witch', 'villager']) {
  const clock = fakeClock(), history = [];
  const players = roles.map((role, i) => ({ id: `player-${i}`, alive: true, connected: true }));
  const room = { code: 'ENGINE', players, roleAssignments: new Map(players.map((p, i) => [p.id, roles[i]])) };
  let engine;
  engine = createGameEngine(room, { durations, clock, onChange: change => history.push({ ...engine.publicState(), ...change, privateStates: players.map(p => engine.privateState(p)) }) });
  const state = () => engine.publicState();
  const step = () => players.map(p => engine.privateState(p)).find(p => p.actionStep)?.actionStep || null;
  return { clock, history, players, room, engine, state, step };
}

assert.throws(() => gameDurations({ seer: 0 }));
assert.throws(() => gameDurations({ unknown: 1 }));
assert.deepEqual(nightSteps(1), ['wolf_dog','wild_child','cupid','lovers_notice','guard','seer','werewolf','cursed_wolf','white_wolf','witch']);
assert.deepEqual(nightSteps(2), ['guard','seer','werewolf','cursed_wolf','witch']);

const f = fixture();
assert.equal(f.engine.start(), true); assert.equal(f.engine.start(), false);
assert.equal(f.state().phase, 'role_reveal'); assert.equal(f.state().nightNumber, 0); assert.equal(f.clock.pendingCount, 1);
f.clock.advance(10); assert.equal(f.state().phase, 'night_start'); assert.equal(f.state().nightNumber, 1);
f.clock.advance(10); assert.equal(f.step(), 'cupid');
const cupidVersion = f.state().phaseVersion;
assert.match(f.engine.complete(f.players[1], cupidVersion), /không có quyền/);
f.players[0].alive = false; assert.match(f.engine.complete(f.players[0], cupidVersion), /không có quyền/); f.players[0].alive = true;
assert.ok(f.engine.submitAbility(f.players[0], {phaseVersion:cupidVersion, targetIds:[f.players[0].id,f.players[1].id]}).result);
assert.equal(f.step(), null, 'Lovers notice must not be an actor turn');
assert.equal(f.state().phase, 'night_actions');
assert.match(f.engine.complete(f.players[0], cupidVersion), /lượt cũ/);
assert.match(f.engine.complete(f.players[0], f.state().phaseVersion), /không có lượt/);
assert.equal(f.clock.pendingCount, 1, 'Early completion cancels the old timer');
const afterCupid = f.state().phaseVersion;
f.clock.callbacks[2](); assert.equal(f.state().phaseVersion, afterCupid, 'Canceled Cupid callback cannot advance new step');
f.clock.advance(10); assert.equal(f.step(), 'guard');
assert.equal(f.engine.complete(f.players[1], f.state().phaseVersion), null); assert.equal(f.step(), 'seer');
f.clock.advance(10); assert.equal(f.step(), 'werewolf');
const wolfVersion = f.state().phaseVersion;
assert.equal(f.engine.complete(f.players[3], wolfVersion), null); assert.equal(f.state().phaseVersion, wolfVersion);
assert.match(f.engine.complete(f.players[3], wolfVersion), /đã xác nhận/);
assert.equal(f.engine.privateState(f.players[3]).hasCompleted, true);
assert.equal(f.engine.complete(f.players[4], wolfVersion), null); assert.equal(f.step(), 'witch');
assert.match(f.engine.complete(f.players[4], wolfVersion), /lượt cũ/);
f.clock.advance(10); assert.equal(f.state().phase, 'night_resolve');
f.clock.advance(10); assert.equal(f.state().phase, 'day_start'); assert.equal(f.state().dayNumber, 1);
assert.equal(f.engine.canChat(f.players[0]), false);
f.clock.advance(10); assert.equal(f.state().phase, 'day_discussion'); assert.equal(f.engine.canChat(f.players[0]), true);
f.players[0].alive = false; assert.equal(f.engine.canChat(f.players[0]), false); f.players[0].alive = true;
f.clock.advance(10); assert.equal(f.state().phase, 'nomination_vote'); assert.equal(f.engine.canChat(f.players[0]), false);
f.clock.advance(10); assert.equal(f.state().phase, 'day_result');
assert.equal(f.state().dayResult.decision, 'NO_NOMINATION');
f.clock.advance(20); assert.equal(f.state().phase, 'night_start'); assert.equal(f.state().nightNumber, 2);
const offset = f.history.length;
while (f.state().phase !== 'day_start') f.clock.advance(10);
const secondSteps = f.history.slice(offset).filter(h => h.phase === 'night_actions').map(h => h.privateStates.find(p => p.actionStep)?.actionStep);
assert.deepEqual(secondSteps, ['guard', 'seer', 'werewolf', 'witch']);
f.engine.dispose();

const skip = fixture(['cupid', 'guard', 'werewolf', 'villager']);
skip.players[0].alive = false; skip.players[1].connected = false;
skip.engine.start(); skip.clock.advance(20); assert.equal(skip.step(), null, 'Disconnected guard retains a timed turn');
skip.clock.advance(10); assert.equal(skip.step(), 'werewolf');
skip.players[2].connected = false; skip.engine.participantsChanged(); assert.equal(skip.state().phase, 'night_actions');
skip.clock.advance(10); assert.equal(skip.state().phase, 'night_resolve');
skip.players[2].connected = true; assert.equal(skip.engine.privateState(skip.players[2]).canComplete, false);
skip.engine.dispose(); assert.equal(skip.clock.pendingCount, 0);
const disposedVersion = skip.state().phaseVersion;
for (const callback of skip.clock.callbacks) callback();
assert.equal(skip.state().phaseVersion, disposedVersion, 'Disposed engine cannot be mutated by stale callbacks');

const late = fixture(['werewolf']); late.engine.start(); late.clock.advance(20);
late.clock.elapseWithoutTimers(11);
assert.match(late.engine.complete(late.players[0], late.state().phaseVersion), /kết thúc/);
late.engine.dispose();
// Also exercise native timers, not only the deterministic clock used above.
const realRoom = { code: 'REAL', players: [{ id: 'village-player', alive: true, connected: true }], roleAssignments: new Map([['village-player', 'villager']]) };
const realEngine = createGameEngine(realRoom, { durations: Object.fromEntries(Object.keys(GAME_DURATIONS).map(key => [key, 2])) });
try {
  realEngine.start();
  const deadline = Date.now() + 2000;
  while (realEngine.publicState().phase !== 'game_over' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(realEngine.publicState().phase, 'game_over');
  assert.equal(realEngine.publicState().result.winner, 'VILLAGE_WIN');
} finally { realEngine.dispose(); }
console.log('PASS: engine timing, first/second night order, skipping, authorization, all-actor completion, stale timers and automatic next night');
