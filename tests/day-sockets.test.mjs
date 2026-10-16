import {scopedRequest} from './client-request.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as clientIO } from 'socket.io-client';
import { attachLobby } from '../lobby.js';
import { GAME_DURATIONS } from '../game-config.js';
import { fakeClock } from './fake-clock.mjs';

const clock = fakeClock(), durations = Object.fromEntries(Object.keys(GAME_DURATIONS).map(key => [key, 10]));
const server = http.createServer(), io = new Server(server), clients = [];
const lobby = attachLobby(io, { durations, engineClock: clock, reconnectMs: 2000 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (p, event, value) => new Promise((resolve, reject) => p.timeout(2000).emit(event, scopedRequest(p, event, value), (error, response) => error ? reject(error) : resolve(response)));
async function connect(token) {
  const p = clientIO(url, { forceNew: true, reconnection: false, transports: ['websocket'], auth: { reconnectToken: token } });
  clients.push(p); p.events = [];
  p.onAny((event, value) => p.events.push({ event, value })); p.on('session', value => { p.session = value; }); p.on('state', value => { p.state = value; }); p.on('game:state', value => { p.game = value; });
  await new Promise((resolve, reject) => { p.once('connect', resolve); p.once('connect_error', reject); }); await wait(5); return p;
}
async function group(count, config) {
  const host = await connect(), { roomCode } = await emit(host, 'room:create', { name: 'Host' }), players = [host];
  for (let i = 1; i < count; i++) { const p = await connect(); players.push(p); await emit(p, 'room:join', { name: `Player ${i}`, roomCode }); await emit(p, 'room:ready', { ready: true }); }
  if (config) assert.equal((await emit(host, 'roles:config:update', { config })).ok, true);
  assert.equal((await emit(host, 'game:start')).ok, true);
  return { host, players, roomCode, room: lobby.rooms.get(roomCode) };
}
const state = async p => (await emit(p, 'game:state-request')).gameState;

try {
 const g=await group(6), [a,b,c]=g.players;
 const at=phase=>{for(let i=0;i<100&&g.room.engine.publicState().phase!==phase;i++)clock.advance(10);assert.equal(g.room.engine.publicState().phase,phase);};
 const act=async(p,event,extra={})=>emit(p,event,{phaseVersion:(await state(p)).phaseVersion,...extra});
 at('nomination_vote');assert.equal((await act(a,'game:nominate',{targetId:b.state.me.id})).ok,true);
 assert.equal((await act(a,'game:nominate',{targetId:c.state.me.id})).ok,false);clock.advance(10);
 const defense=await state(b);assert.equal(defense.phase,'defense');assert.equal(defense.canPublicChat,true);assert.equal((await state(a)).canPublicChat,false);
 assert.equal((await emit(a,'chat:public',{text:'Không được',phaseVersion:defense.phaseVersion})).ok,false);
 assert.equal((await emit(b,'chat:public',{text:'Tôi biện hộ',phaseVersion:defense.phaseVersion})).ok,true);
 assert.equal((await emit(b,'chat:public','Không có version')).ok,false);
 assert.equal((await act(a,'game:defense:end')).ok,false);
 const candidateToken=b.session.reconnectToken, candidateId=b.state.me.id;
 b.disconnect();await wait(10);const resumed=await connect(candidateToken);
 assert.equal(resumed.state.me.id,candidateId);assert.equal((await state(resumed)).phaseVersion,defense.phaseVersion);assert.equal((await state(resumed)).stepEndsAt,defense.stepEndsAt);
 assert.equal((await act(resumed,'game:defense:end')).ok,true);assert.equal((await act(resumed,'game:execution:vote',{choice:'EXECUTE'})).ok,false);
 assert.equal((await act(a,'game:execution:vote',{choice:'EXECUTE'})).ok,true);
 assert.equal((await state(c)).dayResult,null);assert.equal((await state(c)).dayAction.hasVoted,false);
 for(const p of [a,c]) for(const e of p.events.filter(e=>['state','room:updated','game:state'].includes(e.event))) {
   assert.equal(JSON.stringify(e.value).includes('EXECUTE'),false,'No execution choices before close');
 }
 const token=a.session.reconnectToken, before=await state(a);a.disconnect();await wait(10);const rejoined=await connect(token);
 assert.equal((await state(rejoined)).phaseVersion,before.phaseVersion);assert.equal((await state(rejoined)).dayAction.hasVoted,true);
 assert.equal((await act(rejoined,'game:execution:vote',{choice:'PARDON'})).ok,false);
 clock.advance(10);assert.equal((await state(c)).dayResult.execute,1);assert.equal((await state(c)).dayResult.decision,'EXECUTE');
 assert.equal((await emit(resumed,'chat:public',{text:'Lượt cũ',phaseVersion:defense.phaseVersion})).ok,false);
 assert.equal((await act(rejoined,'game:execution:vote',{choice:'EXECUTE'})).ok,false);
 console.log('PASS: Rules 05 Socket.IO exclusive/versioned defense chat, private judgment, candidate exclusion, reconnect deadlines and duplicate protection');
} finally {clients.forEach(p=>p.disconnect());lobby.close();await new Promise(resolve=>io.close(resolve));}
