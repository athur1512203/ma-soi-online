import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachLobby} from '../lobby.js';
import {fakeClock} from './fake-clock.mjs';
import {defaultTimeConfig,validateTimeConfig,TIME_SETTINGS} from '../shared/time-settings.js';
import {defaultRoleConfig,ROLES} from '../shared/roles.js';
const defaults=defaultTimeConfig();assert.deepEqual(defaults,{introduction:120,discussion:180,execution:60,nightAction:30,result:10});
for(const t of TIME_SETTINGS)for(const value of [t.min-1,t.max+1,1.5,'30',null])assert.ok(validateTimeConfig({...defaults,[t.id]:value}));
for(const invalid of [null,[],{}, {...defaults,extra:1}])assert.ok(validateTimeConfig(invalid));
const clock=fakeClock(),server=http.createServer(),io=new Server(server),lobby=attachLobby(io,{engineClock:clock}),clients=[];
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const wait=()=>new Promise(r=>setTimeout(r,20));
const emit=(s,event,value={})=>new Promise((r,j)=>s.timeout(3000).emit(event,{...value,gameId:s.state?.gameId},(e,a)=>e?j(e):r(a)));
async function client(token){const s=connect(url,{forceNew:true,autoConnect:false,reconnection:false,auth:{reconnectToken:token}});clients.push(s);s.public=[];s.on('state',p=>{s.state=p;s.public.push(p);});s.on('game:state',p=>s.game=p);s.on('session',p=>s.session=p);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);s.connect();});return s;}
try{
 const host=await client();assert.equal((await emit(host,'room:create',{name:'Timer Host'})).ok,true);const code=host.state.roomCode,room=lobby.rooms.get(code);
 const group=[host];for(let i=1;i<6;i++){const s=await client();assert.equal((await emit(s,'room:join',{name:'Timer '+i,roomCode:code.toLowerCase()})).ok,true);group.push(s);}
 await wait();for(const s of group)assert.deepEqual(s.state.timeConfig,defaults);
 const config={...defaults,introduction:0,discussion:30,execution:15,nightAction:10,result:3};
 assert.equal((await emit(group[1],'time:config:update',{config})).ok,false);
 assert.equal((await emit(host,'time:config:update',{config:{...config,nightAction:9}})).ok,false);assert.deepEqual(room.timeConfig,defaults);
 assert.equal((await emit(host,'time:config:update',{config})).ok,true);await wait();for(const s of group)assert.deepEqual(s.state.timeConfig,config);
 const roles={...Object.fromEntries(ROLES.map(r=>[r.id,0])),werewolf:1,angel:1,wolf_dog:1,wild_child:1,seer:1,villager:1};
 assert.equal((await emit(host,'roles:config:update',{config:roles})).ok,true);
 for(const s of group.slice(1))assert.equal((await emit(s,'room:ready',{ready:true})).ok,true);
 assert.equal((await emit(host,'room:start-request')).ok,true);assert.equal(clock.pendingCount,1);assert.equal(room.engine.publicState().stepEndsAt,clock.now());
 assert.equal((await emit(host,'time:config:update',{config:defaults})).ok,false);
 clock.advance(0);assert.equal(room.engine.publicState().phase,'night_start');clock.advance(5000);await wait();
 const actor=role=>group.find(s=>room.roleAssignments.get(s.state.me.id)===role);
 const dog=actor('wolf_dog');assert.equal(dog.game.actionStep,'wolf_dog');assert.equal(dog.game.stepEndsAt-dog.game.stepStartedAt,10000);
 assert.equal((await emit(dog,'game:ability:submit',{phaseVersion:dog.game.phaseVersion,choice:'village'})).ok,true);await wait();
 let child=actor('wild_child');assert.equal(child.game.actionStep,'wild_child');const deadline=child.game.stepEndsAt,version=child.game.phaseVersion,id=child.state.me.id,token=child.session.reconnectToken;
 child.disconnect();await wait();clock.advance(2000);child=await client(token);await wait();assert.equal(child.state.me.id,id);assert.equal(child.game.stepEndsAt,deadline);assert.equal(child.game.phaseVersion,version);assert.equal(child.game.stepEndsAt-child.game.serverNow,8000);assert.equal(clock.pendingCount,1);
 const parent=actor('seer').state.me.id;assert.equal((await emit(child,'game:ability:submit',{phaseVersion:version,targetId:parent})).ok,true);await wait();
 assert.equal(child.game.assignment.roleState.fosterId,parent);
 for(const s of group.filter(s=>s.connected)){assert.notEqual(s.game.assignment.roleState.fosterId,parent);assert.equal(s.game.assignment.originalRole,room.roleAssignments.get(s.state.me.id));}
 const forbidden=new Set(['originalRole','currentRole','currentFaction','roleState','abilityUsage','fosterId','assignment','abilities','winConditions']);
 const safe=o=>{if(!o||typeof o!=='object')return;for(const [k,v] of Object.entries(o)){assert.equal(forbidden.has(k),false,'Private field in public state: '+k);safe(v);}};
 group.forEach(s=>s.public.forEach(safe));
 for(let i=0;i<30&&room.engine.publicState().phase!=='day_discussion';i++)clock.advance(1000);
 assert.equal(room.engine.publicState().phase,'day_discussion');assert.equal(room.engine.publicState().stepEndsAt-room.engine.publicState().stepStartedAt,30000);
 clock.advance(30000);assert.equal(room.engine.publicState().phase,'nomination_vote');assert.equal(clock.pendingCount,1);
 const before=room.engine.publicState().phaseVersion;clock.callbacks[0]();assert.equal(room.engine.publicState().phaseVersion,before);
 for(const s of clients.filter(s=>s.connected))assert.equal((await emit(s,'room:leave')).ok,true);
 assert.equal(lobby.rooms.size,0);assert.equal(clock.pendingCount,0);
 console.log('PASS: time defaults/bounds, Host-only save and lobby sync, start lock, zero intro, action/discussion deadlines, reconnect identity/remaining time, single/stale timer cleanup and extended-role private serializers');
}finally{clients.forEach(s=>s.disconnect());lobby.close();await new Promise(r=>io.close(r));}
