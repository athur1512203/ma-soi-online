import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachLobby} from '../lobby.js';
import {createRoomClient} from '../src/create-room-client.js';
const live=process.env.LIVE_SERVER_URL;
const origin='https://ma-soi-online-wkqy.vercel.app';
const server=live?null:http.createServer();
const io=server?new Server(server):null;
const lobby=io?attachLobby(io):null;
if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=live||`http://127.0.0.1:${server.address().port}`;
const clients=[];
const until=async predicate=>{for(let i=0;i<200&&!predicate();i++)await new Promise(r=>setTimeout(r,25));assert.ok(predicate(),'Lobby snapshot did not converge');};
async function client(transport){
 const s=connect(url,{autoConnect:false,forceNew:true,reconnection:false,transports:[transport],extraHeaders:{Origin:origin},timeout:60000,auth:{}});
 const item={s,state:null,token:null,messages:[],requests:0};clients.push(item);
 item.controller=createRoomClient(s,{onMessage:m=>item.messages.push(m)});
 s.on('session',p=>{item.token=p.reconnectToken;item.state=p;item.controller.observe(p);});
 s.on('state',p=>{item.state=p;item.controller.observe(p);});
 s.on('disconnect',()=>item.controller.connectionLost());
 s.onAnyOutgoing(event=>{if(['room:create','room:join'].includes(event))item.requests++;});
 await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);s.connect();});return item;
}
const emit=(p,event,payload={})=>new Promise((r,j)=>p.s.timeout(10000).emit(event,payload,(e,a)=>e?j(e):r(a)));
try{
 const a=await client('polling');
 for(let i=0;i<100;i++)a.controller.create('QA Host');
 await until(()=>!!a.state?.me);assert.equal(a.requests,1);assert.equal(a.state.me.isHost,true);assert.equal(a.state.me.seatIndex,0);
 assert.equal(a.state.devBotTest,false);assert.equal(a.state.testSpeed,null);
 const code=a.state.roomCode;
 const b=await client('websocket');
 for(let i=0;i<100;i++){b.controller.join('QA Join',` ${code.toLowerCase()} `);b.controller.create('Race');}
 await until(()=>a.state.players.length===2&&b.state?.players.length===2);
 assert.equal(b.requests,1);assert.match(b.messages.at(-1),/Đã tham gia phòng/);
 const c=await client('polling');c.controller.join('QA Third',code);
 await until(()=>clients.every(p=>p.state?.players.length===3));
 const ids=a.state.players.map(p=>p.id);
 for(const p of clients)assert.deepEqual(p.state.players.map(p=>p.id),ids);
 const id=b.state.me.id,seat=b.state.me.seatIndex;
 b.s.disconnect();await until(()=>a.state.players.find(p=>p.id===id)?.connected===false);
 assert.equal(b.controller.create('Offline'),false);assert.equal(b.controller.join('Offline',code),false);
 b.s.auth={reconnectToken:b.token};b.s.connect();
 await until(()=>b.s.connected&&a.state.players.find(p=>p.id===id)?.connected===true);
 assert.equal(b.state.me.id,id);assert.equal(b.state.me.seatIndex,seat);assert.equal(a.state.players.length,3);
 assert.equal((await emit(c,'room:leave')).ok,true);c.controller.observe({me:null});
 await until(()=>a.state.players.length===2&&b.state.players.length===2);
 // An impossible-length code is rejected locally; a generated then removed room is deterministically absent.
 assert.equal(c.controller.join('Invalid','bad!'),false);
 c.controller.create('QA Temporary');await until(()=>c.state?.me?.name==='QA Temporary');const missing=c.state.roomCode;
 assert.equal((await emit(c,'room:leave')).ok,true);c.controller.observe({me:null});
 c.controller.join('Missing',missing);await until(()=>c.messages.some(m=>m.includes('Phòng không tồn tại')));
 assert.equal(c.state.me.name,'QA Temporary'); // No success snapshot for failed join.
 console.log(`PASS: ${live?'LIVE '+url:'local'} polling + WebSocket, create, 3 clients, identical players, leave, reconnect same id/seat, offline, invalid/missing room, 100-click create/join + cross-operation gate, production bot flags`);
}finally{
 for(const p of clients){if(p.s.connected&&p.state?.me)try{await emit(p,'room:leave');}catch{}p.controller.dispose();p.s.disconnect();}
 lobby?.close();if(io)await new Promise(r=>io.close(r));
}
