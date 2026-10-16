import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as clientIO} from 'socket.io-client';
import {attachLobby} from '../lobby.js';
import {GAME_DURATIONS} from '../game-config.js';
import {testDurations,localTestSocket} from '../dev/test-config.js';
const clients=[],servers=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(options){const httpServer=http.createServer(),io=new Server(httpServer),lobby=attachLobby(io,options);await new Promise(r=>httpServer.listen(0,'127.0.0.1',r));servers.push({io,lobby});return {url:`http://127.0.0.1:${httpServer.address().port}`,io,lobby};}
async function connect(url,origin){const s=clientIO(url,{forceNew:true,reconnection:false,transports:['websocket'],extraHeaders:origin?{origin}:undefined});clients.push(s);s.on('state',p=>s.state=p);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});return s;}
const emit=(s,event,payload={})=>new Promise(r=>s.timeout(250).emit(event,{...payload,gameId:s.state?.gameId},(error,response)=>r(error?{timeout:true}:response)));
let passed=0;
try{
 assert.equal(testDurations().defense,5000);assert.equal(testDurations().day_discussion,10000);assert.equal(testDurations(.5).defense,10000);assert.equal(testDurations(2).execution_vote,5000);assert.throws(()=>testDurations(0));passed++;
 assert.equal(localTestSocket({handshake:{address:'192.168.1.2',headers:{origin:'http://localhost:5173'}}}),false);passed++;
 const disabled=await setup({devTest:false}),s=await connect(disabled.url);await emit(s,'room:create',{name:'Normal'});assert.equal((await emit(s,'dev:test:configure',{speed:1})).timeout,true);assert.equal(s.state.devBotTest,false);passed++;
 const oldEnv=process.env.NODE_ENV;process.env.NODE_ENV='production';const production=await setup({devTest:true});if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;
 const p=await connect(production.url);await emit(p,'room:create',{name:'Production'});assert.equal((await emit(p,'dev:test:configure',{speed:1})).timeout,true);assert.equal(p.state.devBotTest,false);passed++;
 const dev=await setup({devTest:true}),host=await connect(dev.url),guest=await connect(dev.url);const {roomCode}=await emit(host,'room:create',{name:'Host'});await emit(guest,'room:join',{name:'Guest',roomCode});
 assert.equal((await emit(guest,'dev:test:configure',{speed:1})).ok,false);passed++;
 assert.equal((await emit(host,'dev:test:configure',{speed:1,roles:{werewolf:12}})).ok,false);assert.equal((await emit(host,'dev:test:configure',{speed:0})).ok,false);passed++;
 const baseline={...GAME_DURATIONS};assert.equal((await emit(host,'dev:test:configure',{speed:2})).ok,true);const room=dev.lobby.rooms.get(roomCode);assert.equal(room.testTiming.defense,2500);assert.deepEqual(GAME_DURATIONS,baseline);passed++;
 const other=await connect(dev.url);const otherRoom=await emit(other,'room:create',{name:'Other'});assert.equal(dev.lobby.rooms.get(otherRoom.roomCode).testTiming,undefined);passed++;
 const foreign=await connect(dev.url,'http://untrusted.example');await emit(foreign,'room:create',{name:'Foreign'});assert.equal((await emit(foreign,'dev:test:configure',{speed:1})).ok,false);assert.equal(foreign.state.devBotTest,false);passed++;
 for(let i=0;i<4;i++){const c=await connect(dev.url);await emit(c,'room:join',{name:'Player'+i,roomCode});await emit(c,'room:ready',{ready:true});}await emit(guest,'room:ready',{ready:true});await wait(5);
 assert.equal((await emit(host,'game:start')).ok,true);assert.equal(room.engine.publicState().stepEndsAt-room.engine.publicState().stepStartedAt,2500);assert.equal((await emit(host,'dev:test:configure',{speed:5})).ok,false);passed++;
 console.log(`PASS: ${passed} Bot Test security/configuration checks; Host/local only, production disabled, per-room timers and payload validation`);
}finally{clients.forEach(s=>s.disconnect());for(const {io,lobby} of servers){lobby.close();await new Promise(r=>io.close(r));}}
