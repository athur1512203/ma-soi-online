import assert from 'node:assert/strict';
import {createRoomClient} from '../src/create-room-client.js';
import {resolveServerConfig} from '../src/socket-config.js';
import {fakeClock} from './fake-clock.mjs';
const local={protocol:'http:',hostname:'localhost'};
assert.equal(resolveServerConfig(undefined,{dev:true,location:local}).url,'http://localhost:3001');
assert.ok(resolveServerConfig(undefined,{location:local}).error.includes('Thiếu VITE_SERVER_URL'));
assert.equal(resolveServerConfig('  https://backend.example/ ',{location:{protocol:'https:'}}).url,'https://backend.example');
assert.equal(resolveServerConfig('http://127.0.0.1:3004',{location:local}).url,'http://127.0.0.1:3004');
for(const value of ['not-a-url','wss://backend.example','https://user:secret@backend.example','https://backend.example/?key=x','https://backend.example/#test','https://<backend>.onrender.com'])assert.ok(resolveServerConfig(value,{location:local}).error);
assert.ok(resolveServerConfig('https://backend.example/socket.io',{location:local}).error.includes('không thêm /socket.io'));
assert.ok(resolveServerConfig('http://backend.example',{location:{protocol:'https:'}}).error.includes('HTTPS'));
function fixture(){
 const requests=[],messages=[],pending=[],codes=[],clock=fakeClock();
 const socket={connected:true,timeout(){return this;},emit(event,payload,ack){requests.push({event,payload,ack});}};
 const client=createRoomClient(socket,{clock,timeoutMs:100,onBusy:x=>pending.push(x),onMessage:m=>messages.push(m),onCode:c=>codes.push(c)});
 return {requests,messages,pending,codes,clock,socket,client};
}
{
 const f=fixture();for(let i=0;i<100;i++)f.client.create(' Host ');assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].payload,{name:'Host'});assert.equal(f.requests[0].event,'room:create');
 f.client.observe({me:{id:'host'},roomCode:'ABC123'});assert.deepEqual(f.pending,[true,false]);assert.deepEqual(f.codes,['ABC123']);assert.match(f.messages.at(-1),/Đã tạo phòng ABC123/);
 f.requests[0].ack(new Error('late timeout'));assert.match(f.messages.at(-1),/Đã tạo phòng ABC123/);assert.equal(f.client.create('Again'),false);assert.equal(f.requests.length,1);
 f.client.observe({me:null});assert.equal(f.client.create('Again'),true);assert.equal(f.requests.length,2);f.client.dispose();
}
{
 const f=fixture();f.client.create('Host');f.requests[0].ack(null,{ok:true,roomCode:'ABC123'});assert.deepEqual(f.codes,['ABC123']);assert.deepEqual(f.pending,[true]);assert.equal(f.client.create('Repeat'),false);
 f.client.observe({me:{id:'host'},roomCode:'ABC123'});assert.deepEqual(f.pending,[true,false]);f.client.dispose();
}
for(const response of [{ok:false,error:'Phòng chưa sẵn sàng'},undefined,{ok:true,roomCode:'bad'}]){
 const f=fixture();f.client.create('Host');f.requests[0].ack(null,response);assert.deepEqual(f.pending,[true,false]);assert.ok(f.messages.at(-1).length>20);assert.equal(f.client.create('Retry'),true);f.client.dispose();
}
{
 const f=fixture();f.client.create('Host');f.clock.advance(100);assert.deepEqual(f.pending,[true,false]);assert.match(f.messages.at(-1),/chưa được xác nhận/);
 f.requests[0].ack(null,{ok:true,roomCode:'ABC123'});assert.deepEqual(f.codes,[]);f.client.observe({me:{id:'host'},roomCode:'ABC123'});assert.equal(f.client.create('Repeat'),false);f.client.dispose();
}
{
 const f=fixture();f.socket.connected=false;assert.equal(f.client.create('Host'),false);assert.match(f.messages.at(-1),/Chưa kết nối/);assert.equal(f.requests.length,0);f.socket.connected=true;
 for(const name of ['', '  ','<bad>','x'.repeat(33),'bad\u0000name'])assert.equal(f.client.create(name),false);assert.equal(f.requests.length,0);
 f.client.create('Host');f.client.connectionLost();f.requests[0].ack(null,{ok:true,roomCode:'ABC123'});assert.deepEqual(f.codes,[]);assert.equal(f.client.create('Retry'),true);f.client.dispose();
}
{
 const f=fixture();f.socket.emit=()=>{throw new Error('transport failed');};assert.equal(f.client.create('Host'),false);assert.deepEqual(f.pending,[true,false]);assert.match(f.messages.at(-1),/Không thể gửi/);f.client.dispose();
}
console.log('PASS: create-room frontend config, single in-flight request, validation, server errors, ack/snapshot order, timeout, disconnect and leave/retry');
