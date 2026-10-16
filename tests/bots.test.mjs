import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {Server} from 'socket.io';
import {attachLobby} from '../lobby.js';
import {GAME_DURATIONS} from '../game-config.js';
import {createBot,seededRandom} from '../dev/bot-client.js';
const count=Number(process.env.BOT_GAMES||8), seed=process.env.BOT_SEED||'rules07-2026';
if(!Number.isInteger(count)||count<1||count>100)throw new Error('BOT_GAMES phải từ 1 đến 100.');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const durations=Object.fromEntries(Object.keys(GAME_DURATIONS).map(k=>[k,120]));
const server=http.createServer(), io=new Server(server), lobby=attachLobby(io,{durations,reconnectMs:3000});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const reports=[], stats={pass:0,fail:0,games:0,VILLAGE_WIN:0,WEREWOLF_WIN:0,DRAW:0,rematch:0,reconnect:0,phaseTimeouts:0,privacyLeaks:0}, coverage=new Set();
let active=[], currentAttempt=null;
function noSecrets(value){if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){if(['token','reconnectToken','roleAssignments','role','team','lover','seerResult','ability'].includes(k))throw new Error('Secret field in public snapshot: '+k);noSecrets(v);}}
async function until(check,timeout=15000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('Phase/game timeout');await wait(5);}}
try{
 const r1=seededRandom('repeat'),r2=seededRandom('repeat');assert.deepEqual(Array.from({length:20},()=>r1()),Array.from({length:20},()=>r2()));stats.pass++;
 for(let n=0;n<count;n++){
   const events=[], matchSeed=seed+':'+n;
   currentAttempt={seed:matchSeed,events};
   const bots=Array.from({length:12},(_,i)=>createBot({url,name:`Bot ${String(i+1).padStart(2,'0')}`,seed:matchSeed,enabled:n!==0,delay:5,onLog:e=>events.push(e)}));active=bots;
   const host=bots[0];await host.connect();const made=await host.create();assert.equal(made.ok,true);const roomCode=made.roomCode;
   for(const b of bots.slice(1)){await b.connect();assert.equal((await b.join(roomCode)).ok,true);}
   if(n===0){await wait(20);assert.ok(host.publicState().players.slice(1).every(p=>!p.ready));bots.forEach(b=>b.setEnabled(true));stats.pass++;}
   await until(()=>host.publicState()?.canStart && host.publicState().players.length===12);assert.equal(host.publicState().players.length,12);noSecrets(host.publicState());stats.pass++;
   for(let round=0;round<(n===0?2:1);round++){
     const oldId=host.publicState().gameId, seats=host.publicState().players.map(p=>[p.id,p.seatIndex]);
     assert.equal((await host.request('game:start')).ok,true);
     let reconnectDone=false, lastVersion=null, lastChange=Date.now();const start=Date.now(), stages=new Set();
     while(host.publicState()?.game?.phase!=='game_over'){
       const s=host.publicState(),g=s?.game;
       if(g){stages.add(g.phase);if(g.dayResult?.survived)coverage.add('idiot_survival');if(g.nominationRound===2)coverage.add('nomination_runoff');if(g.phaseVersion!==lastVersion){lastVersion=g.phaseVersion;lastChange=Date.now();}if(g.nightNumber>30||Date.now()-start>15000||Date.now()-lastChange>3000){stats.phaseTimeouts++;throw new Error('Game/phase limit exceeded, seed='+matchSeed);} }
       for(const b of bots){const s=b.publicState();if(s&&s.game?.phase!=='game_over'){try{noSecrets(s);}catch(e){stats.privacyLeaks++;throw e;}}}
       if(n===0&&round===0&&!reconnectDone&&g?.phase==='night_start'){
         const before=bots[5].publicState().me.id;await bots[5].reconnect();assert.equal(bots[5].publicState().me.id,before);reconnectDone=true;stats.reconnect++;stats.pass++;
       }
       await wait(5);
     }
     const result=host.publicState().game.result;assert.ok(['VILLAGE_WIN','WEREWOLF_WIN','DRAW'].includes(result.winner));assert.equal(result.players.length,12);assert.equal(new Set(result.players.map(p=>p.id)).size,12);
     const failed=events.filter(e=>!e.ok&&!['disconnected'].includes(e.event));assert.deepEqual(failed,[],'Unexpected bot request failure');
     for(const e of events.filter(e=>e.gameId===result.gameId&&e.ok&&e.event==='game:ability:submit')){const p=result.players.find(p=>p.name===e.name);if(p)coverage.add('night:'+p.role);}
     for(const phase of stages)coverage.add(phase);
     if(host.publicState().game.dayResult?.survived)coverage.add('idiot_survival');
     stats.games++;stats[result.winner]++;stats.pass++;
     reports.push({seed:matchSeed,round,winner:result.winner,days:result.dayNumber,nights:result.nightNumber,roles:result.players.map(p=>({name:p.name,role:p.role})),events:[...events]});
     if(n===0&&round===0){
       const oldResult=result;await bots[5].reconnect();assert.deepEqual(bots[5].publicState().game.result,oldResult);stats.reconnect++;stats.pass++;
       assert.equal((await host.request('game:rematch-request')).ok,true);await until(()=>host.publicState()?.canStart);
       assert.notEqual(host.publicState().gameId,oldId);assert.deepEqual(host.publicState().players.map(p=>[p.id,p.seatIndex]),seats);assert.equal(host.publicState().game,null);stats.rematch++;stats.pass++;
     }
   }
   await Promise.all(bots.map(b=>b.leave()));active=[];
 }
 console.log('PASS: independent 12-client full games, seeded decisions, private-state boundary, reconnect and rematch');
}catch(error){stats.fail++;console.error('FAIL:',error.message);process.exitCode=1;reports.push({failure:error.message,attempt:currentAttempt,snapshot:active[0]?.publicState()});}
finally{
 for(const b of active)b.dispose();lobby.close();await new Promise(r=>io.close(r));
 const summary={seed,requestedSeeds:count,...stats,coverage:[...coverage].sort(),note:'Seed reproduces bot randomness; cryptographic role dealing remains server-owned. Post-game roles are included for diagnosis only.'};
 await fs.writeFile('bot-test-report.json',JSON.stringify({summary,matches:reports},null,2));console.log(JSON.stringify(summary,null,2));
}
