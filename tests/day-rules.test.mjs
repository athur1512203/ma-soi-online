import assert from 'node:assert/strict';
import {createGameEngine} from '../game-engine.js';
import {GAME_DURATIONS} from '../game-config.js';
import {fakeClock} from './fake-clock.mjs';
const durations=Object.fromEntries(Object.keys(GAME_DURATIONS).map(k=>[k,10]));
function fixture(roles=['werewolf','villager','idiot','hunter','cupid','witch']) {
 const clock=fakeClock(), players=roles.map((r,i)=>({id:String(i),name:r,alive:true,connected:true}));
 const room={code:'DAY',players,roleAssignments:new Map(players.map((p,i)=>[p.id,roles[i]]))};
 const engine=createGameEngine(room,{clock,durations}); engine.start();
 const state=()=>engine.publicState();
 const at=phase=>{for(let i=0;i<150&&state().phase!==phase;i++)clock.advance(10);assert.equal(state().phase,phase);};
 const act=(p,kind,extra={})=>engine.dayAction(p,kind,{phaseVersion:state().phaseVersion,...extra});
 const nominate=p=>{at('nomination_vote');assert.equal(act(players.find(t=>t!==p),'nominate',{targetId:p.id}),null);clock.advance(10);assert.equal(state().phase,'defense');};
 const vote=(p,choices)=>{nominate(p);assert.equal(act(p,'defense'),null);for(const [i,choice] of choices)assert.equal(act(players[i],'vote',{choice}),null);clock.advance(10);};
 return {clock,players,room,engine,state,at,act,nominate,vote};
}
{
 const f=fixture(),[a,b]=f.players;f.nominate(b);
 assert.equal(b.alive,true);assert.equal(f.engine.canChat(a),false);assert.equal(f.engine.canChat(b),true);
 assert.ok(f.act(a,'defense'));const v=f.state().phaseVersion;
 assert.equal(f.act(b,'defense'),null);assert.equal(f.engine.canChat(b),false);
 assert.ok(f.act(b,'vote',{choice:'EXECUTE'}));
 assert.equal(f.act(a,'vote',{choice:'EXECUTE'}),null);assert.ok(f.act(a,'vote',{choice:'PARDON'}));
 assert.equal(f.state().dayResult,null);assert.equal(f.engine.privateState(a).dayAction.hasVoted,true);
 assert.ok(!JSON.stringify(f.state()).includes('EXECUTE'));assert.ok(f.engine.dayAction(b,'defense',{phaseVersion:v}));
 f.clock.advance(10);assert.equal(f.state().dayResult.decision,'EXECUTE');assert.equal(b.alive,false);
 f.clock.advance(10);assert.equal(f.state().phase,'last_words');assert.equal(f.engine.canChat(b),true);assert.equal(f.engine.canChat(a),false);
 assert.ok(f.act(a,'lastWords'));assert.equal(f.act(b,'lastWords'),null);assert.equal(f.state().phase,'next_night');
 f.clock.advance(10);assert.equal(f.state().nightNumber,2);f.engine.dispose();
}
for(const choices of [[],[[0,'EXECUTE'],[2,'PARDON']],[[0,'EXECUTE'],[2,'PARDON'],[3,'PARDON']]]){
 const f=fixture();f.vote(f.players[1],choices);assert.equal(f.state().dayResult.decision,'PARDON');assert.equal(f.players[1].alive,true);f.engine.dispose();
}
{
 const f=fixture();f.at('nomination_vote');const [a,b,c,d]=f.players;
 assert.ok(f.act(a,'nominate',{targetId:a.id}));assert.equal(f.act(a,'nominate',{targetId:b.id}),null);assert.ok(f.act(a,'nominate',{targetId:c.id}));assert.equal(f.act(c,'nominate',{targetId:d.id}),null);
 f.clock.advance(10);assert.equal(f.state().nominationRound,2);assert.deepEqual(f.state().runoffCandidates.map(p=>p.id),[b.id,d.id]);assert.ok(f.act(a,'nominate',{targetId:c.id}));
 assert.equal(f.act(a,'nominate',{targetId:b.id}),null);assert.equal(f.act(c,'nominate',{targetId:d.id}),null);f.clock.advance(10);assert.equal(f.state().dayResult.decision,'NO_NOMINATION');f.engine.dispose();
}
{
 const f=fixture();f.at('nomination_vote');f.clock.elapseWithoutTimers(10);assert.ok(f.act(f.players[0],'nominate',{targetId:f.players[1].id}));f.engine.dispose();
}
{
 const f=fixture();f.vote(f.players[2],[[0,'EXECUTE']]);assert.equal(f.players[2].alive,true);assert.equal(f.state().dayResult.survived,true);assert.equal(f.engine.privateState(f.players[2]).dayAction.votingRight,false);
 f.at('nomination_vote');assert.ok(f.act(f.players[2],'nominate',{targetId:f.players[1].id}));f.engine.dispose();
}
{
 const f=fixture(),[wolf,villager,idiot,hunter,cupid]=f.players;
 while(f.engine.privateState(cupid).actionStep!=='cupid')f.clock.advance(10);
 assert.ok(f.engine.submitAbility(cupid,{phaseVersion:f.state().phaseVersion,targetIds:[hunter.id,villager.id]}).result);
 f.vote(hunter,[[0,'EXECUTE']]);assert.equal(hunter.alive,false);assert.equal(villager.alive,false);
 f.clock.advance(10);assert.equal(f.state().phase,'triggered_abilities');assert.ok(f.act(wolf,'shoot',{targetId:idiot.id}));
 assert.equal(f.act(hunter,'shoot',{targetId:idiot.id}),null);assert.equal(idiot.alive,false);assert.ok(f.act(hunter,'shoot',{targetId:wolf.id}));
 const speakers=[];while(f.state().phase==='last_words'){speakers.push(f.state().speaker.id);f.clock.advance(10);}assert.deepEqual(new Set(speakers),new Set([hunter.id,villager.id,idiot.id]));assert.equal(f.state().phase,'next_night');f.engine.dispose();
}
{
 const f=fixture(),hunter=f.players[3],witch=f.players[5];
 while(f.engine.privateState(witch).actionStep!=='witch')f.clock.advance(10);
 assert.ok(f.engine.submitAbility(witch,{phaseVersion:f.state().phaseVersion,save:false,poisonTargetId:hunter.id}).result);
 f.at('day_discussion');assert.equal(hunter.alive,false);assert.equal(f.engine.privateState(hunter).dayAction.canShoot,false);f.engine.dispose();
}
{
 const f=fixture();f.at('nomination_vote');const [a,b,c,d]=f.players;
 f.act(a,'nominate',{targetId:b.id});f.act(c,'nominate',{targetId:d.id});f.clock.advance(10);
 assert.equal(f.state().nominationRound,2);f.act(a,'nominate',{targetId:b.id});f.clock.advance(10);
 assert.equal(f.state().candidate.id,b.id);assert.equal(b.alive,true);const defenseEnds=f.state().stepEndsAt;
 b.connected=false;f.clock.advance(10);assert.equal(f.state().phase,'execution_vote');assert.equal(f.state().stepStartedAt,defenseEnds);b.connected=true;
 f.players[4].alive=false;assert.ok(f.act(f.players[4],'vote',{choice:'EXECUTE'}));
 f.clock.advance(10);assert.equal(f.state().dayResult.decision,'PARDON');f.engine.dispose();
}
console.log('PASS: Rules 05 nomination/runoff, exclusive defense, hidden/duplicate/late judgments, majority/abstention, Idiot, Hunter, Cupid and last words');
