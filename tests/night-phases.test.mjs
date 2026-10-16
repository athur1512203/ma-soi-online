import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const serverUrl = process.env.TEST_SERVER_URL;
const clients = [];
const connect = token => new Promise((resolve,reject)=>{
  const client=io(serverUrl,{transports:['websocket'],forceNew:true,auth:token?{reconnectToken:token}:{}});
  clients.push(client);
  client.once('session',session=>resolve({client,session}));
  client.once('connect_error',reject);
});
const emit=(client,event,value)=>new Promise(resolve=>client.emit(event,value,resolve));
const waitPhase=(client,phase,timeout=5000)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{client.off('state',handler);reject(new Error(`Timed out waiting for ${phase}`));},timeout);
  const handler=state=>{if(state.phase===phase){clearTimeout(timer);client.off('state',handler);resolve(state);}};
  client.on('state',handler);
});

try {
  const wolfA=await connect(); const wolfB=await connect(); const seer=await connect(); let witch=await connect();
  const dayStates=[wolfA,wolfB,seer,witch].map(({client})=>waitPhase(client,'day'));
  await emit(wolfA.client,'game:start');
  for(const state of await Promise.all(dayStates)){assert.equal(state.permissions.screenBlocked,false);assert.equal(state.permissions.voice.canTransmit,true);assert.equal(state.permissions.voice.transportActive,false);}

  const sleepStates=[wolfA,wolfB,seer,witch].map(({client})=>waitPhase(client,'night'));
  const wolfTurns=[wolfA,wolfB,seer,witch].map(({client})=>waitPhase(client,'wolf'));
  await emit(wolfA.client,'phase:set','night');
  for(const state of await Promise.all(sleepStates)){assert.equal(state.permissions.screenBlocked,true);assert.equal(state.permissions.voice.canTransmit,false);}
  const [wolfAState,wolfBState,seerSleeping,witchSleeping]=await Promise.all(wolfTurns);
  assert.equal(wolfAState.permissions.screenBlocked,false); assert.equal(wolfBState.permissions.screenBlocked,false);
  assert.equal(seerSleeping.permissions.screenBlocked,true); assert.equal(witchSleeping.permissions.screenBlocked,true);
  assert.equal(seerSleeping.wolfChat.length,0);

  const seerTurns=[wolfA,wolfB,seer,witch].map(({client})=>waitPhase(client,'seer'));
  assert.equal((await emit(wolfA.client,'night:target',seer.session.me.id)).ok,true);
  assert.equal((await emit(wolfB.client,'night:target',seer.session.me.id)).ok,true);
  const [wolfSleepA,wolfSleepB,seerAwake,witchSleep]=await Promise.all(seerTurns);
  assert.equal(wolfSleepA.permissions.screenBlocked,true); assert.equal(wolfSleepB.permissions.screenBlocked,true);
  assert.equal(seerAwake.permissions.screenBlocked,false); assert.equal(witchSleep.permissions.screenBlocked,true);
  assert.ok((await emit(wolfA.client,'seer:inspect',witch.session.me.id)).error);
  witch.client.disconnect();
  witch=await connect(witch.session.reconnectToken);
  assert.equal(witch.session.phase,'seer');
  assert.equal(witch.session.permissions.screenBlocked,true);
  assert.equal(witch.session.seerResult,null);

  const witchTurns=[wolfA,wolfB,seer,witch].map(({client})=>waitPhase(client,'witch'));
  const inspect=await emit(seer.client,'seer:inspect',wolfA.session.me.id);
  assert.equal(inspect.result.isWolf,true);
  const [wolfSleepC,,seerSleep,witchAwake]=await Promise.all(witchTurns);
  assert.equal(wolfSleepC.permissions.screenBlocked,true); assert.equal(seerSleep.permissions.screenBlocked,true);
  assert.equal(witchAwake.permissions.screenBlocked,false); assert.equal(witchAwake.witchOptions.canSave,true);
  assert.ok((await emit(wolfA.client,'witch:act',{type:'save'})).error);

  const dawnStates=[wolfA,wolfB,seer,witch].map(({client})=>waitPhase(client,'day'));
  assert.equal((await emit(witch.client,'witch:act',{type:'save'})).ok,true);
  for(const state of await Promise.all(dawnStates)){assert.equal(state.permissions.screenBlocked,false);assert.equal(state.permissions.voice.canTransmit,true);}

  seer.client.disconnect();
  const seerReconnect=await connect(seer.session.reconnectToken);
  assert.equal(seerReconnect.session.role.key,'seer');
  assert.equal(seerReconnect.session.phase,'day');
  assert.equal(seerReconnect.session.permissions.screenBlocked,false);
  console.log('PASS: sleep screen, role-only wake phases, voice permissions, dawn, and reconnect state');
} finally { clients.forEach(client=>client.disconnect()); }
