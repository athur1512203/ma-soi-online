import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachLobby} from '../lobby.js';
import {createRoomClient} from '../src/create-room-client.js';
import {resolveServerConfig} from '../src/socket-config.js';
const server=http.createServer(),io=new Server(server),lobby=attachLobby(io),clients=[];
let received=0;io.on('connection',s=>s.on('room:create',()=>received++));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const config=resolveServerConfig(` http://127.0.0.1:${server.address().port}/ `,{dev:false,location:{protocol:'http:'}});
const until=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,10));assert.ok(predicate(),'Client did not receive lobby snapshot');};
async function socket(){const s=connect(config.url,{autoConnect:false,forceNew:true,reconnection:false});clients.push(s);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);s.connect();});return s;}
try{
 const s=await socket(),messages=[];let snapshot;
 const client=createRoomClient(s,{onMessage:m=>messages.push(m)});s.on('state',p=>{snapshot=p;client.observe(p);});s.on('session',p=>client.observe(p));
 for(let i=0;i<100;i++)client.create(' Production Host ');
 await until(()=>!!snapshot?.me);assert.equal(received,1);assert.equal(lobby.rooms.size,1);assert.match(snapshot.roomCode,/^[A-Z0-9]{6}$/);assert.equal(snapshot.me.isHost,true);assert.equal(snapshot.me.seatIndex,0);assert.equal(snapshot.players.length,1);assert.equal(snapshot.me.name,'Production Host');assert.equal(snapshot.phase,'lobby');assert.equal(snapshot.status,'waiting');assert.match(messages.at(-1),/Đã tạo phòng/);assert.equal(client.create('Again'),false);
 await new Promise((r,j)=>s.timeout(1000).emit('room:leave',{},(e,a)=>e?j(e):r(a)));client.observe({me:null});client.create('Second Host');await until(()=>snapshot?.me?.name==='Second Host');assert.equal(lobby.rooms.size,1);
 // Simulate a stale UI that did not observe membership: server rejection is shown.
 const staleMessages=[],stale=createRoomClient(s,{onMessage:m=>staleMessages.push(m)});stale.create('Already in room');await until(()=>staleMessages.some(m=>m.startsWith('Không thể tạo phòng:')));assert.match(staleMessages.at(-1),/đang ở trong một phòng/);assert.equal(lobby.rooms.size,1);stale.dispose();
 s.disconnect();client.connectionLost();assert.equal(client.create('Offline'),false);client.dispose();
 console.log('PASS: production URL config with real Socket.IO room:create, 100-click deduplication, Host/lobby/code snapshot, leave/recreate and server rejection');
}finally{clients.forEach(s=>s.disconnect());lobby.close();await new Promise(r=>io.close(r));}
