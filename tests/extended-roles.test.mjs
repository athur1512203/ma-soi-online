import assert from 'node:assert/strict';
import {createGameEngine} from '../game-engine.js';
import {createNightAbilities} from '../night-abilities.js';
import {stateFor} from '../role-state.js';
import {GAME_DURATIONS} from '../game-config.js';
import {defaultRoleConfig,validateRoleConfig} from '../shared/roles.js';
import {fakeClock} from './fake-clock.mjs';
const timing=Object.fromEntries(Object.keys(GAME_DURATIONS).map(k=>[k,10]));
function fixture(roles){
 const players=roles.map((r,i)=>({id:'p'+i,name:r+i,seatIndex:i,alive:true,connected:true}));
 const room={code:'NEWROL',players,roleAssignments:new Map(players.map((p,i)=>[p.id,roles[i]]))};
 const clock=fakeClock();const engine=createGameEngine(room,{durations:timing,clock});engine.start();
 const at=(phase,step=null)=>{for(let i=0;i<150;i++){if(engine.publicState().phase===phase&&(!step||players.some(p=>engine.privateState(p).actionStep===step)))return;assert.notEqual(engine.publicState().phase,'game_over','Unexpected game over');clock.advance(10);}assert.fail('Missing '+phase+'/'+step);};
 const action=(p,payload)=>engine.submitAbility(p,{phaseVersion:engine.publicState().phaseVersion,...payload});
 const day=(p,kind,payload={})=>engine.dayAction(p,kind,{phaseVersion:engine.publicState().phaseVersion,...payload});
 return {players,room,engine,clock,at,action,day};
}
function nightFixture(roles){const players=roles.map((r,i)=>({id:'n'+i,name:r+i,alive:true,connected:true})),room={players,roleAssignments:new Map(players.map((p,i)=>[p.id,roles[i]]))};const abilities=createNightAbilities(room);abilities.begin(1);return {players,room,a:abilities};}
const good=r=>assert.ok(r.result,r.error);
// Angel: only a valid first-day execution wins; no nomination expires the condition.
{
 const f=fixture(['angel','werewolf','villager','villager','seer','guard']);const [angel,wolf,voter]=f.players;
 f.at('nomination_vote');assert.equal(f.day(voter,'nominate',{targetId:angel.id}),null);f.at('defense');f.day(angel,'defense');f.day(wolf,'vote',{choice:'EXECUTE'});f.at('day_result');f.at('game_over');
 assert.equal(f.engine.publicState().result.winner,'ANGEL_WIN');assert.deepEqual(f.engine.publicState().result.winnerIds,[angel.id]);assert.equal(f.clock.pendingCount,0);f.engine.dispose();
}
{
 const f=fixture(['angel','werewolf','villager','villager','seer','guard']);f.at('day_result');f.at('night_start');assert.equal(stateFor(f.room,f.players[0]).currentRole,'villager');assert.deepEqual(stateFor(f.room,f.players[0]).winConditions,['faction']);f.engine.dispose();
}
{
 const f=fixture(['angel','werewolf','villager','villager','seer','guard']);f.at('night_actions','werewolf');good(f.action(f.players[1],{targetId:f.players[0].id}));f.at('day_discussion');assert.equal(f.players[0].alive,false);assert.equal(f.engine.publicState().result,null);f.engine.dispose();
}
// Dog: explicit, single choice; skips default village and never disclose the pack to village.
for(const choice of ['wolves','village',null]){
 const f=fixture(['wolf_dog','werewolf','villager','seer','guard','witch']);f.at('night_actions','wolf_dog');const dog=f.players[0];
 assert.equal(f.engine.privateState(dog).ability.teammates,undefined);
 if(choice)good(f.action(dog,{choice}));else f.clock.advance(10);
 assert.equal(stateFor(f.room,dog).currentFaction,choice==='wolves'?'wolves':'village');
 f.at('night_actions','werewolf');assert.equal(f.engine.privateState(dog).actionStep,choice==='wolves'?'werewolf':null);
 assert.ok(f.action(dog,{choice:'wolves'}).error);f.engine.dispose();
}
// Wild child: timeout always selects another living player; every death source triggers once.
for(const cause of ['execution','night','hunter']){
 const {a,room,players:[child,parent,wolf]}=nightFixture(['wild_child','seer','werewolf','villager']);
 good(a.submit(child,'wild_child',{targetId:parent.id}));assert.equal(stateFor(room,child).currentFaction,'village');a.eliminate([parent.id],cause);assert.equal(stateFor(room,child).currentFaction,'wolves');assert.equal(stateFor(room,child).roleState.transformed,true);assert.equal(a.canAct(child,'werewolf'),true);
}
{
 const {a,room,players:[child]}=nightFixture(['wild_child','werewolf','villager']);a.closeStep('wild_child');assert.notEqual(stateFor(room,child).roleState.fosterId,child.id);assert.ok(stateFor(room,child).roleState.fosterId);
}
{
 const {a,room,players:[child,parent,cupid,partner]}=nightFixture(['wild_child','seer','cupid','guard']);good(a.submit(child,'wild_child',{targetId:parent.id}));good(a.submit(cupid,'cupid',{targetIds:[parent.id,partner.id]}));a.eliminate([partner.id],'hunter');assert.equal(parent.alive,false);assert.equal(stateFor(room,child).currentFaction,'wolves');
}
// Curse: preserve the seer's ability, pack membership/target rules, one successful use.
{
 const {a,room,players:[curse,wolf,seer,villager]}=nightFixture(['cursed_wolf','werewolf','seer','villager']);
 good(a.submit(wolf,'werewolf',{targetId:seer.id}));good(a.submit(curse,'werewolf',{targetId:seer.id}));a.closeStep('werewolf');
 assert.ok(a.submit(curse,'cursed_wolf',{targetId:villager.id}).error);good(a.submit(curse,'cursed_wolf',{targetId:seer.id}));a.resolve();assert.equal(seer.alive,true);assert.equal(stateFor(room,seer).currentFaction,'wolves');assert.equal(stateFor(room,seer).currentRole,'seer');assert.deepEqual(stateFor(room,seer).abilities,['seer']);assert.equal(stateFor(room,curse).abilityUsage.curse,1);
 a.begin(2);assert.equal(a.canAct(seer,'seer'),true);assert.equal(a.canAct(seer,'werewolf'),true);good(a.submit(seer,'seer',{targetId:curse.id}));good(a.submit(seer,'werewolf',{targetId:villager.id}));good(a.submit(wolf,'werewolf',{targetId:villager.id}));a.closeStep('werewolf');assert.equal(a.canAct(curse,'cursed_wolf'),false);assert.ok(a.submit(curse,'cursed_wolf',{targetId:villager.id}).error);
}
for(const blocked of ['guard','save','elder','poison']){
 const {a,room,players:[curse,wolf,victim,guard,witch]}=nightFixture(['cursed_wolf','werewolf',blocked==='elder'?'elder':'seer','guard','witch']);
 if(blocked==='guard')good(a.submit(guard,'guard',{targetId:victim.id}));
 good(a.submit(wolf,'werewolf',{targetId:victim.id}));a.closeStep('werewolf');good(a.submit(curse,'cursed_wolf',{targetId:victim.id}));
 if(blocked==='save'||blocked==='poison')good(a.submit(witch,'witch',{save:blocked==='save',poisonTargetId:blocked==='poison'?victim.id:null}));
 a.resolve();assert.equal(stateFor(room,victim).currentFaction,'village');assert.equal(stateFor(room,curse).abilityUsage.curse,undefined);assert.equal(victim.alive,blocked!=='poison');
}
// White Wolf: odd nights only, no self/non-wolf, special vs shared victory.
{
 const {a,players:[white,wolf,villager]}=nightFixture(['white_wolf','werewolf','villager']);assert.equal(a.canAct(white,'white_wolf'),true);assert.ok(a.submit(white,'white_wolf',{targetId:white.id}).error);assert.ok(a.submit(white,'white_wolf',{targetId:villager.id}).error);good(a.submit(white,'white_wolf',{targetId:wolf.id}));a.resolve();assert.equal(wolf.alive,false);a.begin(2);assert.equal(a.canAct(white,'white_wolf'),false);
}
{
 const f=fixture(['white_wolf','werewolf','villager','seer']);f.at('night_actions','werewolf');good(f.action(f.players[0],{targetId:f.players[2].id}));good(f.action(f.players[1],{targetId:f.players[2].id}));f.at('night_actions','white_wolf');assert.equal(f.engine.publicState().result,null);good(f.action(f.players[0],{targetId:f.players[1].id}));f.at('game_over');assert.equal(f.engine.publicState().result.winner,'WHITE_WOLF_WIN');assert.deepEqual(f.engine.publicState().result.winnerIds,[f.players[0].id]);f.engine.dispose();
}
{
 const f=fixture(['white_wolf','werewolf','villager','seer','guard']);f.at('night_actions','werewolf');good(f.action(f.players[0],{targetId:f.players[2].id}));good(f.action(f.players[1],{targetId:f.players[2].id}));f.at('night_actions','white_wolf');assert.equal(f.engine.complete(f.players[0],f.engine.publicState().phaseVersion),null);f.at('game_over');assert.equal(f.engine.publicState().result.winner,'WEREWOLF_WIN');assert.ok(f.engine.publicState().result.winnerIds.includes(f.players[0].id));f.engine.dispose();
}
console.log('PASS: extended role mechanics');
// Transforming a victim can determine parity without a death; win checks use current factions.
{
 const f=fixture(['cursed_wolf','seer','villager','guard']);f.at('night_actions','werewolf');good(f.action(f.players[0],{targetId:f.players[1].id}));f.at('night_actions','cursed_wolf');good(f.action(f.players[0],{targetId:f.players[1].id}));f.at('game_over');assert.equal(f.engine.publicState().result.winner,'WEREWOLF_WIN');assert.equal(f.players.every(p=>p.alive),true);assert.equal(f.engine.publicState().result.aliveWolves,2);assert.ok(f.engine.publicState().result.winnerIds.includes(f.players[1].id));f.engine.dispose();
}
{
 const f=fixture(['angel','werewolf','villager','villager','seer','guard']);f.at('nomination_vote');f.day(f.players[2],'nominate',{targetId:f.players[0].id});f.at('defense');f.day(f.players[0],'defense');f.day(f.players[1],'vote',{choice:'PARDON'});f.at('day_result');assert.equal(f.players[0].alive,true);f.at('night_start');assert.equal(stateFor(f.room,f.players[0]).currentRole,'villager');f.engine.dispose();
}
{
 const {a,players:[white,wolf]}=nightFixture(['white_wolf','werewolf','cursed_wolf','villager']);good(a.submit(white,'white_wolf',{targetId:wolf.id}));a.resolve();a.begin(2);assert.equal(a.canAct(white,'white_wolf'),false);a.begin(3);assert.equal(a.canAct(white,'white_wolf'),true);
}
{
 const {a,room,players:[curse,wolf,victim]}=nightFixture(['cursed_wolf','werewolf','seer','villager']);good(a.submit(wolf,'werewolf',{targetId:victim.id}));a.closeStep('werewolf');good(a.submit(curse,'cursed_wolf',{targetId:victim.id}));a.eliminate([victim.id],'hunter');a.resolve();assert.equal(stateFor(room,curse).abilityUsage.curse,undefined);
}
{
 const config={...defaultRoleConfig(6),werewolf:0,white_wolf:1,cursed_wolf:1};assert.equal(validateRoleConfig(config,6),null);assert.ok(validateRoleConfig({...config,werewolf:1,villager:1},6));
}
console.log('PASS: conversion parity, Angel pardon expiry, White Wolf third-night eligibility, dead curse target and combined wolf-deck limits');
