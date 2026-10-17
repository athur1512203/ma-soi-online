import assert from 'node:assert/strict';
import {checkWinner} from '../game-result.js';
import {createGameEngine} from '../game-engine.js';
import {GAME_DURATIONS} from '../game-config.js';
import {fakeClock} from './fake-clock.mjs';
const cases=[[0,5,'VILLAGE_WIN'],[0,1,'VILLAGE_WIN'],[3,3,'WEREWOLF_WIN'],[2,2,'WEREWOLF_WIN'],[1,1,'WEREWOLF_WIN'],[2,1,'WEREWOLF_WIN'],[1,4,'CONTINUE'],[2,5,'CONTINUE'],[0,0,'DRAW']];
const durations=Object.fromEntries(Object.keys(GAME_DURATIONS).map(k=>[k,10]));
function fixture(roles,dead=[]) {
 const players=roles.map((r,i)=>({id:String(i),name:r+'-'+i,seatIndex:i,connected:true,alive:!dead.includes(i)}));
 const room={code:'END',status:'playing',players,roleAssignments:new Map(players.map((p,i)=>[p.id,roles[i]]))};
 const clock=fakeClock(), changes=[];const engine=createGameEngine(room,{clock,durations,onChange:c=>changes.push(c)});engine.start();
 const state=()=>engine.publicState();
 const at=phase=>{for(let i=0;i<200&&state().phase!==phase;i++){assert.notEqual(state().phase,'game_over','Unexpected game over before '+phase);clock.advance(10);}assert.equal(state().phase,phase);};
 const step=role=>{const p=players.find(p=>room.roleAssignments.get(p.id)===role);for(let i=0;i<100&&engine.privateState(p).actionStep!==role;i++)clock.advance(10);assert.equal(engine.privateState(p).actionStep,role);return p;};
 const ability=(role,extra)=>{const p=step(role);const r=engine.submitAbility(p,{gameId:state().gameId,phaseVersion:state().phaseVersion,...extra});assert.ok(r.result,r.error);};
 const act=(p,kind,extra={})=>engine.dayAction(p,kind,{gameId:state().gameId,phaseVersion:state().phaseVersion,...extra});
 return {players,room,clock,engine,changes,state,at,step,ability,act};
}
function assertNoRoles(value) {if(!value||typeof value!=='object')return;assert.equal(Object.hasOwn(value,'role'),false);assert.equal(Object.hasOwn(value,'team'),false);Object.values(value).forEach(assertNoRoles);}
for(const [w,v,winner] of cases) {
 assert.equal(checkWinner(w,v),winner);
 // Dead original wolves must not affect the outcome.
 const f=fixture([...Array(w).fill('werewolf'),...Array(v).fill('villager'),'werewolf'],[w+v]);
 assertNoRoles(f.state());const {assignment,...privateState}=f.engine.privateState(f.players[0]);assertNoRoles(privateState);assert.equal(assignment.originalRole,f.room.roleAssignments.get(f.players[0].id));
 if(winner==='CONTINUE'){f.at('day_discussion');assert.equal(f.state().result,null);}else{
  f.at('game_over');assert.equal(f.state().result.winner,winner);assert.equal(f.state().result.aliveWolves,w);assert.equal(f.state().result.aliveVillagers,v);
  assert.equal(f.clock.pendingCount,0);assert.equal(f.changes.filter(c=>c.finished).length,1);
  const frozen=JSON.stringify(f.state());f.clock.advance(10000);for(const cb of [...f.clock.callbacks])cb();
  // serverNow changes, but phase/version/result and timer do not.
  const old=JSON.parse(frozen);assert.equal(f.state().phaseVersion,old.phaseVersion);assert.deepEqual(f.state().result,old.result);assert.equal(f.clock.pendingCount,0);
  assert.ok(f.engine.complete(f.players[0],f.state().phaseVersion));assert.ok(f.engine.submitAbility(f.players[0],{phaseVersion:f.state().phaseVersion,targetId:'0'}).error);
  for(const kind of ['nominate','vote','shoot','defense','lastWords'])assert.ok(f.act(f.players[0],kind,{targetId:'0',choice:'EXECUTE'}));
  assert.equal(f.engine.canChat(f.players[0]),false);assert.equal(f.changes.filter(c=>c.finished).length,1);
  assert.ok(f.state().result.players.every(p=>p.role && ['village','werewolf'].includes(p.team)));assert.equal(JSON.stringify(f.state().result).includes('token'),false);
 }
 f.engine.dispose();
}
// Last wolf dies at dawn, but Hunter can still change a village win into a draw.
{
 const f=fixture(['werewolf','hunter','witch','cupid']);const [wolf,hunter,witch,cupid]=f.players;
 f.ability('cupid',{targetIds:[witch.id,cupid.id]});f.ability('werewolf',{targetId:hunter.id});f.ability('witch',{save:false,poisonTargetId:wolf.id});
 f.at('day_start');assert.equal(f.state().result,null);assertNoRoles(f.state());f.clock.advance(10);assert.equal(f.state().phase,'triggered_abilities');assert.equal(f.state().result,null);
 assert.equal(f.act(hunter,'shoot',{targetId:witch.id}),null);assert.equal(f.state().phase,'game_over');assert.equal(f.state().result.winner,'DRAW');
 assert.deepEqual(f.state().result.players.map(p=>p.team),['werewolf','village','village','village']);f.engine.dispose();
}
// Parity after execution waits for Hunter and both last words before choosing a winner.
for(const timeout of [false,true]) {
 const f=fixture(['werewolf','hunter','villager']);const [wolf,hunter,villager]=f.players;
 f.at('nomination_vote');f.act(wolf,'nominate',{targetId:hunter.id});f.clock.advance(10);f.act(hunter,'defense');f.act(villager,'vote',{choice:'EXECUTE'});f.clock.advance(10);
 assert.equal(f.state().phase,'day_result');assert.equal(f.state().result,null);f.clock.advance(10);assert.equal(f.state().phase,'triggered_abilities');assert.equal(f.state().result,null);
 if(timeout)f.clock.advance(10);else assert.equal(f.act(hunter,'shoot',{targetId:wolf.id}),null);
 assert.equal(f.state().phase,'last_words');assert.equal(f.state().result,null);f.at('game_over');assert.equal(f.state().result.winner,timeout?'WEREWOLF_WIN':'VILLAGE_WIN');f.engine.dispose();
}
// Idiot survival keeps the living village count, and doesn't end a continuing game.
{
 const f=fixture(['werewolf','idiot','villager']);const [wolf,idiot,villager]=f.players;
 f.at('nomination_vote');f.act(wolf,'nominate',{targetId:idiot.id});f.clock.advance(10);f.act(idiot,'defense');f.act(villager,'vote',{choice:'EXECUTE'});f.clock.advance(10);
 assert.equal(idiot.alive,true);assert.equal(f.state().dayResult.survived,true);f.at('night_start');assert.equal(f.state().result,null);
 f.ability('werewolf',{targetId:villager.id});f.at('game_over');assert.equal(f.state().result.winner,'WEREWOLF_WIN');assert.equal(f.state().result.aliveVillagers,1);f.engine.dispose();
}
// Elder resists the first bite, so only the second bite can produce parity.
{
 const f=fixture(['werewolf','elder','villager']);f.ability('werewolf',{targetId:f.players[1].id});f.at('day_discussion');assert.equal(f.players[1].alive,true);f.at('next_night');f.clock.advance(10);
 f.ability('werewolf',{targetId:f.players[1].id});f.at('game_over');assert.equal(f.players[1].alive,false);assert.equal(f.state().result.winner,'WEREWOLF_WIN');f.engine.dispose();
}
// A pardon still evaluates the server's current roster after a departure.
{
 const f=fixture(['werewolf','villager','villager']);f.at('nomination_vote');f.act(f.players[0],'nominate',{targetId:f.players[1].id});f.clock.advance(10);f.act(f.players[1],'defense');f.room.players=f.room.players.filter(p=>p!==f.players[0]);f.engine.participantsChanged();f.clock.advance(10);
 assert.equal(f.state().dayResult.decision,'PARDON');f.at('game_over');assert.equal(f.state().result.winner,'VILLAGE_WIN');assert.equal(f.state().result.players[0].alive,false);f.engine.dispose();
}
console.log('PASS: Rules 06 nine winner cases, server alive counts, Hunter/Cupid chains and timeout, last words, Idiot/Elder, pardon, role reveal and immutable one-time game over');
