import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {io} from 'socket.io-client';
import {GAME_DURATIONS} from '../game-config.js';

const probe=http.createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const allowed='https://forest-frontend.example', second='https://second-frontend.example';
const url=`http://127.0.0.1:${port}`, clients=[];
const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production',DEV_BOT_TEST:'1',CORS_ORIGINS:`${allowed}, ${second}`,LOBBY_RECONNECT_MS:'30000'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
const exited=new Promise(resolve=>child.once('exit',resolve));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(origin,transport='websocket'){
 const s=io(url,{forceNew:true,reconnection:false,transports:[transport],extraHeaders:{Origin:origin},timeout:1200});clients.push(s);s.on('state',state=>s.state=state);
 const ok=await new Promise(resolve=>{s.once('connect',()=>resolve(true));s.once('connect_error',()=>resolve(false));});return {s,ok};
}
const emit=(s,event,payload={})=>new Promise((resolve,reject)=>s.timeout(2000).emit(event,{...payload,gameId:s.state?.gameId},(error,result)=>error?reject(error):resolve(result)));
try{
 let response;
 for(let i=0;i<60;i++){if(child.exitCode!==null)throw new Error('Production backend exited: '+output);try{response=await fetch(url);if(response.ok)break;}catch{}await delay(50);}
 assert.equal(response?.status,200);assert.equal((await response.json()).service,'ma-soi-server');
 assert.ok(output.includes(`0.0.0.0:${port}`),'Backend must bind explicitly to 0.0.0.0 and configured PORT');
 assert.equal((await fetch(url,{headers:{Origin:allowed}})).headers.get('access-control-allow-origin'),allowed);
 assert.equal((await fetch(url,{headers:{Origin:'https://untrusted.example'}})).headers.get('access-control-allow-origin'),null);
 const host=await connect(allowed);assert.equal(host.ok,true);
 const polling=await connect(second,'polling');assert.equal(polling.ok,true);polling.s.disconnect();
 const rejected=await connect('https://untrusted.example');assert.equal(rejected.ok,false);rejected.s.disconnect();
 const created=await emit(host.s,'room:create',{name:'Production Host'});assert.equal(created.ok,true);
 const timeout=await new Promise(resolve=>host.s.timeout(250).emit('dev:test:configure',{gameId:host.s.state.gameId,speed:5},error=>resolve(!!error)));
 assert.equal(timeout,true,'Dev test event must not be registered in production, even with DEV_BOT_TEST=1');
 assert.equal(host.s.state.devBotTest,false);assert.equal(host.s.state.testSpeed,null);
 for(let i=0;i<5;i++){const p=await connect(allowed);assert.equal(p.ok,true);assert.equal((await emit(p.s,'room:join',{name:'Player '+i,roomCode:created.roomCode})).ok,true);assert.equal((await emit(p.s,'room:ready',{ready:true})).ok,true);}
 assert.equal((await emit(host.s,'room:start-request')).ok,true);
 const {gameState}=await emit(host.s,'game:state-request');assert.equal(gameState.phase,'role_reveal');
 assert.equal(gameState.stepEndsAt-gameState.stepStartedAt,GAME_DURATIONS.role_reveal,'Production must retain standard durations');
 console.log('PASS: production PORT/0.0.0.0, HTTP health, configured/rejected CORS, polling/WebSocket, test mode blocked and standard timers');
}finally{clients.forEach(s=>s.disconnect());child.kill();await exited;}
