import assert from 'node:assert/strict';
import { createGameEngine } from '../game-engine.js';
import { GAME_DURATIONS } from '../game-config.js';
import { fakeClock } from './fake-clock.mjs';

const durations = Object.fromEntries(Object.keys(GAME_DURATIONS).map(key => [key, 10]));
let serial = 0;
function fixture(roles = ['cupid', 'guard', 'seer', 'werewolf', 'werewolf', 'witch', 'elder', 'villager', 'hunter', 'idiot']) {
  const prefix = `case${++serial}`, clock = fakeClock(), events = [];
  const players = roles.map((role, index) => ({ id: `${prefix}-${index}`, name: `${role}-${index}`, alive: true, connected: true }));
  const room = { code: prefix, players, roleAssignments: new Map(players.map((p, i) => [p.id, roles[i]])) };
  let engine; engine = createGameEngine(room, { durations, clock, onChange: change => events.push({ ...change, state: engine.publicState() }) });
  engine.start();
  const role = (key, index = 0) => players.filter(p => room.roleAssignments.get(p.id) === key)[index];
  const at = key => {
    const p = role(key);
    for (let i = 0; i < 30; i++) {
      if (engine.privateState(p).actionStep === key) return engine.privateState(p);
      if (['day_start', 'day_discussion', 'awaiting_day_resolution'].includes(engine.publicState().phase)) break;
      clock.advance(10);
    }
    throw new Error(`Step ${key} unavailable in ${prefix}`);
  };
  const submit = (key, payload, index = 0) => engine.submitAbility(role(key, index), { phaseVersion: engine.publicState().phaseVersion, ...payload });
  const dawn = () => { for (let i = 0; i < 30 && engine.publicState().phase !== 'day_start'; i++) clock.advance(10); assert.equal(engine.publicState().phase, 'day_start'); return engine.publicState().announcement; };
  const next = () => {
    const n = engine.publicState().nightNumber;
    for (let i = 0; i < 60 && engine.publicState().nightNumber === n; i++) clock.advance(10);
    assert.equal(engine.publicState().nightNumber, n + 1);
  };
  const wolves = victim => { at('werewolf'); for (let i = 0; i < roles.filter(role => role === 'werewolf').length; i++) assert.ok(submit('werewolf', { targetId: victim.id }, i).result); };
  return { engine, clock, room, players, events, role, at, submit, dawn, next, wolves };
}
const good = response => { assert.ok(response.result, response.error); return response.result; };
const bad = response => assert.ok(response.error, 'Must reject invalid action');

// Cupid validates a single permanent pair; notifications reveal identities only.
{
  const f = fixture(), cupid = f.role('cupid'), guard = f.role('guard');
  const version = f.at('cupid').phaseVersion;
  bad(f.submit('cupid', { targetIds: [cupid.id, cupid.id] }));
  bad(f.submit('cupid', { targetIds: [cupid.id, 'foreign-player'] }));
  guard.alive = false; bad(f.submit('cupid', { targetIds: [cupid.id, guard.id] })); guard.alive = true;
  bad(f.submit('cupid', { targetIds: [cupid.id, guard.id], role: 'cupid' }));
  good(f.submit('cupid', { targetIds: [cupid.id, guard.id] }));
  assert.deepEqual(f.engine.privateState(cupid).lover, { id: guard.id, name: guard.name });
  assert.deepEqual(f.engine.privateState(guard).lover, { id: cupid.id, name: cupid.name });
  assert.equal(f.engine.privateState(f.role('seer')).lover, null);
  bad(f.engine.submitAbility(cupid, { phaseVersion: version, targetIds: [guard.id, f.role('seer').id] }));
  f.wolves(cupid); f.at('witch'); good(f.submit('witch', { save: false, poisonTargetId: guard.id }));
  assert.equal(cupid.alive, true, 'No public death before dawn');
  const result = f.dawn(); assert.equal(result.eliminated.length, 2); assert.equal(new Set(result.eliminated.map(p => p.id)).size, 2);
  assert.equal(cupid.alive, false); assert.equal(guard.alive, false);
  assert.equal(f.events.filter(e => e.nightResolved).length, 1);
  const versionAtDawn = f.engine.publicState().phaseVersion;
  for (const callback of f.clock.callbacks.slice(0, -1)) callback();
  assert.equal(f.engine.publicState().phaseVersion, versionAtDawn);
  assert.equal(f.events.filter(e => e.nightResolved).length, 1);
  f.next(); assert.equal(f.engine.privateState(cupid).canComplete, false);
  bad(f.submit('cupid', { targetIds: [f.role('seer').id, f.role('witch').id] })); f.engine.dispose();
}
{
  const f = fixture(); f.at('cupid'); f.clock.advance(10);
  assert.equal(f.engine.privateState(f.role('cupid')).lover, null);
  assert.equal(f.engine.privateState(f.role('guard')).actionStep, 'guard', 'Cupid timeout skips lovers notice');
  f.dawn(); f.next(); f.at('guard'); bad(f.submit('cupid', { targetIds: [f.role('guard').id, f.role('seer').id] })); f.engine.dispose();
}
// Guard: self protection, consecutive-night restriction, timeout breaks the streak.
{
  const f = fixture(), v = f.role('villager'), seer = f.role('seer');
  f.at('cupid'); good(f.submit('cupid', { targetIds: [v.id, seer.id] }));
  f.at('guard'); good(f.submit('guard', { targetId: seer.id })); f.wolves(v);
  assert.deepEqual(new Set(f.dawn().eliminated.map(p => p.id)), new Set([v.id, seer.id]), 'Guard cannot stop the lover chain'); f.engine.dispose();
}
{
  const f = fixture(), guard = f.role('guard'), villager = f.role('villager');
  f.at('guard'); good(f.submit('guard', { targetId: guard.id })); f.wolves(guard);
  assert.equal(f.dawn().eliminated.length, 0); assert.equal(guard.alive, true);
  f.next(); f.at('guard'); bad(f.submit('guard', { targetId: guard.id })); good(f.submit('guard', { targetId: villager.id })); f.dawn();
  f.next(); f.at('guard'); f.clock.advance(10); f.dawn();
  f.next(); f.at('guard'); good(f.submit('guard', { targetId: villager.id })); f.engine.dispose();
}
// Seer only receives a team bit, never an exact role. Results survive sync/reconnect.
{
  const f = fixture(); f.at('seer'); const seer = f.role('seer'), wolf = f.role('werewolf');
  const result = good(f.submit('seer', { targetId: wolf.id }));
  assert.equal(result.isWolf, true); assert.equal(Object.hasOwn(result, 'role'), false);
  assert.equal(f.engine.privateState(seer).seerResult.isWolf, true);
  for (const p of f.players.filter(p => p !== seer)) assert.equal(f.engine.privateState(p).seerResult, null);
  f.dawn(); f.next(); f.at('seer'); assert.equal(good(f.submit('seer', { targetId: f.role('elder').id })).isWolf, false); f.engine.dispose();
}
// Wolves can change a vote while another wolf is still choosing; ties and no votes do not kill.
{
  const f = fixture(), v = f.role('villager'), elder = f.role('elder'); f.at('werewolf');
  bad(f.submit('werewolf', { targetId: f.role('werewolf').id })); bad(f.submit('werewolf', { targetId: f.role('werewolf', 1).id }));
  good(f.submit('werewolf', { targetId: v.id })); bad(f.submit('werewolf', { targetId: v.id }));
  good(f.submit('werewolf', { targetId: elder.id })); good(f.submit('werewolf', { targetId: v.id }));
  const old = f.engine.publicState().phaseVersion;
  good(f.submit('werewolf', { targetId: v.id }, 1));
  bad(f.engine.submitAbility(f.role('werewolf'), { phaseVersion: old, targetId: elder.id }));
  assert.deepEqual(f.dawn().eliminated.map(p => p.id), [v.id]); f.engine.dispose();
}
{
  const f = fixture(); f.at('werewolf'); good(f.submit('werewolf', { targetId: f.role('villager').id })); good(f.submit('werewolf', { targetId: f.role('seer').id }, 1));
  assert.equal(f.dawn().eliminated.length, 0); f.engine.dispose();
}
{
  const f = fixture(['werewolf', 'villager', 'seer']); f.wolves(f.role('villager')); assert.equal(f.dawn().eliminated.length, 1); f.engine.dispose();
}
{
  const f = fixture(); f.at('werewolf'); good(f.submit('werewolf', { targetId: f.role('villager').id })); f.clock.advance(10);
  bad(f.submit('werewolf', { targetId: f.role('seer').id }, 1)); assert.equal(f.dawn().eliminated[0].id, f.role('villager').id); f.engine.dispose();
}
{
  const f = fixture(); assert.equal(f.dawn().message, 'Đêm qua là một đêm bình yên'); f.engine.dispose();
}
// Witch commits both potions atomically, including redundant rescue of a guarded victim.
{
  const f = fixture(), v = f.role('villager'), elder = f.role('elder');
  f.at('guard'); good(f.submit('guard', { targetId: v.id })); f.wolves(v);
  const witch = f.at('witch'); assert.equal(witch.ability.victim.id, v.id); assert.equal(witch.ability.canSave, true);
  bad(f.submit('witch', { save: true, poisonTargetId: f.role('witch').id }));
  assert.deepEqual(f.engine.privateState(f.role('witch')).ability.potions, { save: true, poison: true });
  good(f.submit('witch', { save: true, poisonTargetId: elder.id }));
  assert.deepEqual(f.dawn().eliminated.map(p => p.id), [elder.id]); assert.equal(v.alive, true);
  f.next(); f.wolves(v); assert.equal(f.engine.privateState(f.role('witch')).actionStep, null, 'No remaining potions skips witch turn');
  bad(f.submit('witch', { save: true, poisonTargetId: f.role('seer').id })); f.engine.dispose();
}
{
  const f = fixture(), witch = f.role('witch'); f.wolves(witch); f.at('witch'); good(f.submit('witch', { save: true, poisonTargetId: null }));
  assert.equal(f.dawn().eliminated.length, 0);
  f.next(); f.wolves(f.role('villager')); f.at('witch');
  bad(f.submit('witch', { save: true, poisonTargetId: f.role('seer').id }));
  assert.deepEqual(f.engine.privateState(witch).ability.potions, { save: false, poison: true });
  good(f.submit('witch', { save: false, poisonTargetId: f.role('werewolf').id }));
  const dead = f.dawn().eliminated.map(p => p.id); assert.ok(dead.includes(f.role('villager').id)); assert.ok(dead.includes(f.role('werewolf').id)); f.engine.dispose();
}
{
  const f = fixture(); f.dawn(); f.next(); f.wolves(f.role('witch')); f.at('witch');
  bad(f.submit('witch', { save: true, poisonTargetId: null }));
  assert.deepEqual(f.engine.privateState(f.role('witch')).ability.potions, { save: true, poison: true });
  good(f.submit('witch', { save: false, poisonTargetId: f.role('seer').id }));
  assert.equal(f.dawn().eliminated.length, 2); f.engine.dispose();
}
// Poison beats protection and rescue; a player hit by multiple lethal effects appears once.
{
  const f = fixture(), v = f.role('villager'); f.at('guard'); good(f.submit('guard', { targetId: v.id })); f.wolves(v); f.at('witch');
  good(f.submit('witch', { save: true, poisonTargetId: v.id })); assert.deepEqual(f.dawn().eliminated.map(p => p.id), [v.id]); f.engine.dispose();
}
// Elder resistance is consumed only by a successful, unblocked wolf attack.
{
  const f = fixture(), elder = f.role('elder'); f.wolves(elder); assert.equal(f.dawn().eliminated.length, 0);
  f.next(); f.wolves(elder); assert.equal(f.dawn().eliminated[0].id, elder.id); f.engine.dispose();
}
{
  const f = fixture(), elder = f.role('elder'); f.at('guard'); good(f.submit('guard', { targetId: elder.id })); f.wolves(elder); f.at('witch');
  good(f.submit('witch', { save: true, poisonTargetId: null })); assert.equal(f.dawn().eliminated.length, 0);
  f.next(); f.wolves(elder); assert.equal(f.dawn().eliminated.length, 0, 'Guard/rescue did not consume resistance');
  f.next(); f.wolves(elder); assert.equal(f.dawn().eliminated[0].id, elder.id); f.engine.dispose();
}
{
  const f = fixture(); f.at('witch'); good(f.submit('witch', { save: false, poisonTargetId: f.role('elder').id })); assert.equal(f.dawn().eliminated[0].id, f.role('elder').id); f.engine.dispose();
}
{
  const f = fixture(), elder = f.role('elder'); f.wolves(elder); f.at('witch'); good(f.submit('witch', { save: true, poisonTargetId: null }));
  assert.equal(f.dawn().eliminated.length, 0);
  f.next(); f.wolves(elder); assert.equal(f.dawn().eliminated.length, 0, 'Rescue alone did not spend elder resistance');
  f.next(); f.wolves(elder); assert.equal(f.dawn().eliminated[0].id, elder.id); f.engine.dispose();
}
{
  const f = fixture(); f.at('werewolf'); good(f.submit('werewolf', { targetId: f.role('villager').id }));
  f.role('werewolf').alive = false; f.clock.advance(10);
  assert.equal(f.dawn().eliminated.length, 0, 'Dead wolf vote cannot count'); f.engine.dispose();
}
// Late, fake-session-like outsiders and dead-player requests cannot mutate ability state.
{
  const f = fixture(), other = fixture(); const version = f.at('guard').phaseVersion;
  bad(f.engine.submitAbility(other.role('guard'), { phaseVersion: version, targetId: f.role('guard').id }));
  f.role('guard').alive = false; bad(f.submit('guard', { targetId: f.role('villager').id })); f.role('guard').alive = true;
  f.clock.elapseWithoutTimers(11); bad(f.submit('guard', { targetId: f.role('villager').id })); f.engine.dispose(); other.engine.dispose();
}
console.log('PASS: Cupid, guard, seer, wolf voting, atomic potions, elder resistance, lover chains, timeout and exactly-once night resolution');
