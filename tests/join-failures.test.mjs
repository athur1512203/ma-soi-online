import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {createRoomClient} from '../src/create-room-client.js';
const server=http.createServer(),io=new Server(server),clients=[];
const received=[];
io.on('connection',s=>s.on('room:join',payload=>{received.push(payload);if(payload.roomCode==='DROP00')s.disconnect(true);}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const until=async predicate=>{for(let i=0;i<200&&!predicate();i++)await new Promise(r=>setTimeout(r,10));assert.ok(predicate());};
try{
 for(const code of ['NOACK0','DROP00']){
  const s=connect(url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket']});clients.push(s);
  const messages=[],busy=[];
  const controller=createRoomClient(s,{timeoutMs:150,onMessage:m=>messages.push(m),onBusy:b=>busy.push(b)});
  // Match the App's disconnect handler: unlock pending requests and explain the lost connection.
  s.on('disconnect',()=>{controller.connectionLost();messages.push('Mất kết nối');});
  await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);s.connect();});
  for(let i=0;i<100;i++)controller.join('Guest',code);
  await until(()=>busy.length===2);assert.deepEqual(busy,[true,false]);assert.equal(received.filter(p=>p.roomCode===code).length,1);
  assert.ok(messages.some(m=>code==='DROP00'?m.includes('Mất kết nối'):/chưa được xác nhận|Không nhận được phản hồi/.test(m)));
  controller.dispose();s.disconnect();
 }
 console.log('PASS: real Socket.IO missing-ack timeout and in-flight server disconnect unlock join; 100 clicks send one request');
}finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));}
