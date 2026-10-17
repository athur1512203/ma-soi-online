import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as clientIO} from 'socket.io-client';
import {attachLobby} from '../lobby.js';
import {GAME_DURATIONS} from '../game-config.js';
import {fakeClock} from './fake-clock.mjs';
import {scopedRequest} from './client-request.mjs';
const clock=fakeClock(), durations=Object.fromEntries(Object.keys(GAME_DURATIONS).map(k=>[k,10]));
const server=http.createServer(), io=new Server(server), clients=[];
const lobby=attachLobby(io,{durations,engineClock:clock,reconnectMs:5000});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const raw=(p,event,value)=>new Promise((resolve,reject)=>p.timeout(2000).emit(event,value,(error,result)=>error?reject(error):resolve(result)));
const emit=(p,event,value)=>raw(p,event,scopedRequest(p,event,value));
async function connect(token){const p=clientIO(url,{forceNew:true,reconnection:false,transports:['websocket'],auth:{reconnectToken:token}});clients.push(p);p.events=[];p.onAny((event,value)=>p.events.push({event,value}));p.on('state',s=>p.state=s);p.on('game:state',s=>p.game=s);p.on('session',s=>p.session=s);p.on('game:role-assigned',s=>p.role=s);await new Promise((r,j)=>{p.once('connect',r);p.once('connect_error',j);});await wait(5);return p;}
const state=async p=>(await emit(p,'game:state-request')).gameState;
const noRoles=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){assert.ok(!['role','team','token','reconnectToken','roleAssignments'].includes(k));noRoles(v);}};
try{
 let host=await connect();const {roomCode}=await emit(host,'room:create',{name:'Host'});const players=[host];
 for(let i=1;i<11;i++){const p=await connect();players.push(p);await emit(p,'room:join',{name:'Player '+i,roomCode});await emit(p,'room:ready',{ready:true});}
 const outsider=await connect();assert.equal((await emit(outsider,'game:rematch-request',{gameId:host.state.gameId})).ok,false);
 assert.equal((await emit(host,'game:rematch-request')).ok,false);
 assert.equal((await emit(host,'game:start')).ok,true);const room=lobby.rooms.get(roomCode), engine=room.engine, originalId=room.gameId;
 const actor=role=>players.find(p=>room.roleAssignments.get(p.state.me.id)===role);
 const wolves=players.filter(p=>room.roleAssignments.get(p.state.me.id)==='werewolf');
 const villagers=players.filter(p=>room.roleAssignments.get(p.state.me.id)==='villager');
 const guard=actor('guard'),seer=actor('seer'),witch=actor('witch'),cupid=actor('cupid'),hunter=actor('hunter'),idiot=actor('idiot'),elder=actor('elder');
 const at=phase=>{for(let i=0;i<200&&engine.publicState().phase!==phase;i++){assert.notEqual(engine.publicState().phase,'game_over');clock.advance(10);}assert.equal(engine.publicState().phase,phase);};
 const step=async(role)=>{const p=actor(role);for(let i=0;i<100&&engine.privateState(room.players.find(t=>t.id===p.state.me.id)).actionStep!==role;i++)clock.advance(10);assert.equal((await state(p)).actionStep,role);};
 const ability=async(p,extra)=>{assert.equal((await emit(p,'game:ability:submit',{phaseVersion:(await state(p)).phaseVersion,...extra})).ok,true);};
 const act=async(p,event,extra={})=>emit(p,event,{phaseVersion:(await state(p)).phaseVersion,...extra});
 await step('cupid');await ability(cupid,{targetIds:[villagers[1].state.me.id,elder.state.me.id]});
 await step('guard');await ability(guard,{targetId:seer.state.me.id});
 await step('seer');await ability(seer,{targetId:wolves[0].state.me.id});
 await step('werewolf');for(const p of wolves)await ability(p,{targetId:villagers[0].state.me.id});
 await step('witch');await ability(witch,{save:true,poisonTargetId:wolves[0].state.me.id});
 at('nomination_vote');
 const nominationVersion=engine.publicState().phaseVersion;
 const execute=async(candidate)=>{await act(villagers[0],'game:nominate',{targetId:candidate.state.me.id});clock.advance(10);assert.equal(engine.publicState().phase,'defense');await act(candidate,'game:defense:end');await act(villagers[0],'game:execution:vote',{choice:'EXECUTE'});clock.advance(10);assert.equal(engine.publicState().phase,'day_result');};
 await execute(idiot);assert.equal((await state(idiot)).dayAction.votingRight,false);
 at('nomination_vote');await execute(hunter);at('triggered_abilities');
 assert.equal((await act(hunter,'game:hunter:shoot',{targetId:wolves[1].state.me.id})).ok,true);
 at('game_over');await state(host);await wait(5);
 const result=host.game.result;assert.equal(result.winner,'VILLAGE_WIN');assert.equal(room.status,'finished');assert.equal(result.players.length,11);
 assert.ok(result.players.every(p=>room.roleAssignments.get(p.id)===p.role));assert.equal(JSON.stringify(result).includes('token'),false);
 for(const p of players){assert.equal(p.events.filter(e=>e.event==='game:finished').length,1);assert.deepEqual((await state(p)).result,result);for(const e of p.events.filter(e=>['state','room:updated','game:phase-changed','game:step-changed'].includes(e.event))){if((e.value.game?.phase||e.value.phase)!=='game_over')noRoles(e.value);}}
 const endedVersion=host.game.phaseVersion;clock.advance(1000);for(const cb of [...clock.callbacks])cb();assert.equal(engine.publicState().phaseVersion,endedVersion);assert.equal(clock.pendingCount,0);
 assert.equal((await act(villagers[0],'game:nominate',{targetId:host.state.me.id})).ok,false);
 assert.equal((await emit(outsider,'game:finished',{winner:'DRAW'})).ok,false);assert.equal((await emit(players.find(p=>!p.state.me.isHost),'game:rematch-request')).ok,false);
 const hostToken=host.session.reconnectToken;host.disconnect();await wait(10);host=await connect(hostToken);assert.deepEqual((await state(host)).result,result);assert.equal(host.state.me.isHost,true);assert.equal(host.events.filter(e=>e.event==='game:finished').length,0,'Reconnect receives snapshot, not another finish event');
 const before=room.players.map(p=>({id:p.id,seatIndex:p.seatIndex})), savedAssignments=room.roleAssignments;
 const oldReady={gameId:originalId,ready:true}, oldVote={gameId:originalId,phaseVersion:nominationVersion,targetId:idiot.state.me.id};
 const answers=await Promise.all([raw(host,'game:rematch-request',{gameId:originalId}),raw(host,'game:rematch-request',{gameId:originalId})]);assert.equal(answers.filter(r=>r.ok).length,1);await wait(5);
 assert.equal(room.code,roomCode);assert.equal(room.status,'waiting');assert.notEqual(room.gameId,originalId);assert.equal(room.gameVersion,2);assert.equal(room.engine,null);assert.equal(room.roleAssignments,null);assert.deepEqual(room.publicChat,[]);assert.deepEqual(room.players.map(p=>({id:p.id,seatIndex:p.seatIndex})),before);assert.ok(room.players.every(p=>p.alive&&p.ready===false));assert.equal(clock.pendingCount,0);
 assert.equal((await raw(villagers[0],'room:ready',oldReady)).ok,false);assert.equal((await raw(host,'room:start-request',{gameId:originalId})).ok,false);
 assert.equal((await raw(host,'roles:config:update',{gameId:originalId,config:room.roleConfig})).ok,false);assert.equal((await raw(host,'room:leave',{gameId:originalId})).ok,false);
 assert.equal((await raw(villagers[0],'chat:public',{gameId:originalId,text:'stale',phaseVersion:nominationVersion})).ok,false);
 for(const p of room.players){const socket=p.id===host.state.me.id?host:players.find(t=>t.state.me.id===p.id);assert.equal(socket.state.game,null);assert.equal(socket.state.phase,'lobby');if(p.id!==room.hostId)assert.equal((await emit(socket,'room:ready',{ready:true})).ok,true);}
 assert.equal((await emit(host,'game:start')).ok,true);assert.notEqual(room.engine,engine);assert.notEqual(room.roleAssignments,savedAssignments);assert.equal(room.roleAssignments.size,11);assert.equal(room.engine.publicState().phase,'role_reveal');assert.equal(room.engine.publicState().dayNumber,0);assert.equal(room.engine.publicState().nightNumber,0);assert.equal(room.engine.publicState().result,null);assert.ok(room.engine.publicState().phaseVersion>endedVersion);
 for(const p of room.players){const fresh=room.engine.privateState(p);assert.equal(fresh.lover,null);assert.equal(fresh.seerResult,null);assert.equal(fresh.abilityResult,null);assert.equal(fresh.dayResult,null);assert.equal(fresh.candidate,null);assert.equal(fresh.speaker,null);assert.equal(fresh.dayAction.votingRight,true);assert.equal(fresh.dayAction.hasVoted,false);}
 assert.equal((await raw(villagers[0],'game:nominate',oldVote)).ok,false);
 const newVersion=room.engine.publicState().phaseVersion;for(const cb of [...clock.callbacks].slice(0,-1))cb();assert.equal(room.engine.publicState().phaseVersion,newVersion);
 // New Cupid and Witch must get their full skills again, regardless of new identities.
 const freshActor=role=>room.players.find(p=>room.roleAssignments.get(p.id)===role);
 for(let i=0;i<100&&!room.engine.privateState(freshActor('cupid')).actionStep;i++)clock.advance(10);
 const cupidState=room.engine.privateState(freshActor('cupid'));assert.equal(cupidState.actionStep,'cupid');assert.equal(cupidState.ability.canSubmit,true);assert.equal(cupidState.ability.selected,null);
 for(let i=0;i<100&&room.engine.privateState(freshActor('witch')).actionStep!=='witch';i++)clock.advance(10);
 assert.deepEqual(room.engine.privateState(freshActor('witch')).ability.potions,{save:true,poison:true});assert.equal(room.engine.privateState(freshActor('witch')).ability.selected,null);
 console.log('PASS: Rules 06 Socket.IO exactly-once result/reveal, reconnect, Host-only atomic rematch, stable room/seats, full new engine/deal, stale events/timers rejected');
} finally {clients.forEach(p=>p.disconnect());lobby.close();await new Promise(r=>io.close(r));}
