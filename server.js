import { attachLobby } from './lobby.js';
import http from 'node:http';
import crypto from 'node:crypto';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 3001);
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const isAllowedOrigin = origin => !origin
  || configuredOrigins.includes(origin)
  || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const names = ['Bạn', 'Linh', 'Minh', 'Dương', 'An', 'Hà', 'Nam', 'Vy', 'Quân', 'Mai', 'Khoa', 'Trúc'];
const roleDeck = [
  { key:'wolf', name:'Ma Sói', team:'Sói', icon:'♜', description:'Ẩn mình giữa dân làng và săn mồi trong đêm.', ability:'Cùng đồng đội chọn một mục tiêu vào lượt Ma Sói.' },
  { key:'wolf', name:'Ma Sói', team:'Sói', icon:'♜', description:'Ẩn mình giữa dân làng và săn mồi trong đêm.', ability:'Cùng đồng đội chọn một mục tiêu vào lượt Ma Sói.' },
  { key:'seer', name:'Tiên tri', team:'Làng', icon:'◉', description:'Người dẫn đường cho dân làng trong bóng tối.', ability:'Có thể soi thân phận một người trong lượt riêng.' },
  { key:'witch', name:'Phù thủy', team:'Làng', icon:'⚗', description:'Nắm giữ hai bình thuốc có thể xoay chuyển số phận.', ability:'Có thể cứu hoặc đầu độc trong lượt riêng.' },
  ...Array.from({length:8},()=>({ key:'villager', name:'Dân làng', team:'Làng', icon:'♟', description:'Tìm ra Ma Sói qua thảo luận và suy luận.', ability:'Tham gia thảo luận và bỏ phiếu vào ban ngày.' }))
];
const game = { roomCode:'7K9D3A', phase:'lobby', round:1, result:'', players:[], publicChat:[], wolfChat:[], votes:new Map(), nightVotes:new Map(), seerChecks:new Map(), witchActions:new Map(), pendingWolfVictim:null, pendingPoisonVictim:null, witchPotions:{heal:true,poison:true}, transitionTimer:null };
const tokenToPlayer = new Map();
const server = http.createServer((req,res)=>{
  const origin = req.headers.origin;
  const headers = {'content-type':'application/json'};
  if (origin && isAllowedOrigin(origin)) headers['access-control-allow-origin'] = origin;
  res.writeHead(200, headers);
  res.end(JSON.stringify({ok:true,service:'ma-soi-server'}));
});
const io = new Server(server,{
  cors:{origin:(origin,callback)=>callback(null,isAllowedOrigin(origin)),credentials:true},
  allowRequest:(request,callback)=>callback(null,isAllowedOrigin(request.headers.origin))
});
const uid = () => crypto.randomUUID();
const now = () => new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit'}).format(new Date());
const clean = value => typeof value === 'string' ? value.trim().replace(/[<>]/g,'').slice(0,240) : '';
const roleFor = player => roleDeck[player.seat];
const authorizedWolves = () => game.players.filter(p=>p.connected&&p.alive&&roleFor(p)?.key==='wolf');
const aliveRole = key => game.players.find(p=>p.alive&&roleFor(p)?.key===key);
const isNightPhase = phase => ['night','wolf','seer','witch'].includes(phase);
function permissions(player){
  const role=roleFor(player)?.key;
  const activeRole=game.phase==='wolf'?'wolf':game.phase==='seer'?'seer':game.phase==='witch'?'witch':null;
  const roleAwake=player.alive&&role===activeRole;
  const acted=game.phase==='vote'?game.votes.has(player.id):game.phase==='wolf'?game.nightVotes.has(player.id):game.phase==='seer'?game.seerChecks.has(player.id):game.phase==='witch'?game.witchActions.has(player.id):false;
  return {
    canPublicChat:player.alive&&game.phase==='day',
    canSeeWolfChat:player.alive&&role==='wolf'&&game.phase==='wolf',
    canWolfChat:player.alive&&role==='wolf'&&game.phase==='wolf',
    canSelect:player.alive&&!acted&&(game.phase==='vote'||(game.phase==='wolf'&&role==='wolf')||(game.phase==='seer'&&role==='seer')||(game.phase==='witch'&&role==='witch'&&game.witchPotions.poison)),
    canFinishNightTurn:roleAwake&&['seer','witch'].includes(game.phase),
    hasActed:acted,
    screenBlocked:isNightPhase(game.phase)&&!roleAwake,
    voice:{implemented:false,canTransmit:player.alive&&['day','vote'].includes(game.phase),transportActive:false}
  };
}
function publicPlayers(viewer){ return game.players.map(p=>({id:p.id,name:p.name,alive:p.alive,connected:p.connected,teamHint:game.phase==='wolf'&&roleFor(viewer)?.key==='wolf'&&roleFor(p)?.key==='wolf'?'Sói':undefined})); }
function payload(player){
  const perm=permissions(player); const role=roleFor(player)?.key;
  const seerResult=role==='seer'?game.seerChecks.get(player.id)?.result:null;
  const witchOptions=role==='witch'&&game.phase==='witch'?{canSave:game.witchPotions.heal&&!!game.pendingWolfVictim,victimName:game.players.find(p=>p.id===game.pendingWolfVictim)?.name||null,canPoison:game.witchPotions.poison}:null;
  return {roomCode:game.roomCode,phase:game.phase,round:game.round,result:game.result,players:publicPlayers(player),me:{id:player.id,name:player.name,isHost:player.seat===0},role:game.phase==='lobby'?null:roleFor(player),publicChat:game.publicChat,wolfChat:perm.canSeeWolfChat?game.wolfChat:[],wolfTeammates:perm.canSeeWolfChat?authorizedWolves().map(p=>({id:p.id,name:p.name})):[],seerResult,witchOptions,permissions:perm};
}
function sync(){ for(const p of game.players){ if(p.connected&&p.socketId) io.to(p.socketId).emit('state',payload(p)); } }
function ackError(ack,msg){ if(typeof ack==='function') ack({error:msg}); }
function countAndResolve(map){ const counts=new Map(); for(const target of map.values()) counts.set(target,(counts.get(target)||0)+1); const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]); if(!sorted.length||(sorted.length>1&&sorted[0][1]===sorted[1][1])) return null; return game.players.find(p=>p.id===sorted[0][0]); }
function schedule(callback,delay=800){ clearTimeout(game.transitionTimer); game.transitionTimer=setTimeout(callback,delay); }
function enterPhase(phase){ game.phase=phase; game.result=''; sync(); }
function enterRoleOrContinue(role,next){
  enterPhase('night');
  schedule(()=>{ if(aliveRole(role)){ enterPhase(role); } else { next(); } });
}
function applyNightCasualties(){
  const ids=new Set([game.pendingWolfVictim,game.pendingPoisonVictim].filter(Boolean));
  const eliminated=[];
  for(const id of ids){ const target=game.players.find(p=>p.id===id); if(target?.alive){target.alive=false;eliminated.push(target.name);} }
  game.pendingWolfVictim=null; game.pendingPoisonVictim=null;
  game.result=eliminated.length?`${eliminated.join(' và ')} đã bị loại trong đêm.`:'Đêm qua không ai bị loại.';
}
function dawn(){ enterPhase('night'); schedule(()=>{ applyNightCasualties(); game.round+=1; game.phase='day'; sync(); }); }
function beginWitchTurn(){ enterRoleOrContinue('witch',dawn); }
function beginSeerTurn(){ enterRoleOrContinue('seer',beginWitchTurn); }
function resolveWolfTurn(){ const target=countAndResolve(game.nightVotes); game.pendingWolfVictim=target?.id||null; beginSeerTurn(); }
function beginNight(){ game.nightVotes.clear();game.seerChecks.clear();game.witchActions.clear();game.wolfChat=[];game.pendingWolfVictim=null;game.pendingPoisonVictim=null;enterPhase('night');schedule(()=>{ if(authorizedWolves().length) enterPhase('wolf'); else beginSeerTurn(); }); }

// Legacy gameplay kept for future engine integration; Rules 01 uses attachLobby below.
function attachLegacyGameplay(){ io.on('connection',socket=>{
  let token=socket.handshake.auth?.reconnectToken; let player=tokenToPlayer.get(token);
  if(!player){ const seat=game.players.length; if(seat>=12){ socket.emit('error:message','Phòng đã đủ 12 người.'); return socket.disconnect(); } token=uid(); player={id:uid(),name:names[seat],seat,alive:true,connected:true,socketId:socket.id}; game.players.push(player); tokenToPlayer.set(token,player); }
  player.connected=true; player.socketId=socket.id; socket.emit('session',{reconnectToken:token,...payload(player)}); sync();
  socket.on('chat:public',(raw,ack)=>{ const text=clean(raw); if(!player.alive||game.phase!=='day') return ackError(ack,'Chat chung chỉ mở cho người còn sống vào ban ngày.'); if(!text) return ackError(ack,'Tin nhắn không được để trống.'); game.publicChat.push({id:uid(),sender:player.name,text,time:now()}); game.publicChat=game.publicChat.slice(-80); sync(); ack?.({ok:true}); });
  socket.on('chat:wolf',(raw,ack)=>{ const text=clean(raw); if(!permissions(player).canWolfChat) return ackError(ack,'Bạn không có quyền truy cập chat Ma Sói lúc này.'); if(!text) return ackError(ack,'Tin nhắn không được để trống.'); game.wolfChat.push({id:uid(),sender:player.name,text,time:now()}); game.wolfChat=game.wolfChat.slice(-80); for(const wolf of authorizedWolves()) io.to(wolf.socketId).emit('state',payload(wolf)); ack?.({ok:true}); });
  socket.on('vote:cast',(targetId,ack)=>{ const target=game.players.find(p=>p.id===targetId); if(game.phase!=='vote'||!player.alive||game.votes.has(player.id)||!target?.alive||target.id===player.id) return ackError(ack,'Phiếu không hợp lệ hoặc bạn đã bỏ phiếu.'); game.votes.set(player.id,target.id); sync(); ack?.({ok:true}); });
  socket.on('night:target',(targetId,ack)=>{ const target=game.players.find(p=>p.id===targetId); if(game.phase!=='wolf'||!player.alive||roleFor(player)?.key!=='wolf'||game.nightVotes.has(player.id)||!target?.alive||roleFor(target)?.key==='wolf') return ackError(ack,'Mục tiêu ban đêm không hợp lệ.'); game.nightVotes.set(player.id,target.id); sync(); ack?.({ok:true}); if(authorizedWolves().every(wolf=>game.nightVotes.has(wolf.id))) schedule(resolveWolfTurn,650); });
  socket.on('seer:inspect',(targetId,ack)=>{ const target=game.players.find(p=>p.id===targetId); if(game.phase!=='seer'||!player.alive||roleFor(player)?.key!=='seer'||game.seerChecks.has(player.id)||!target?.alive||target.id===player.id) return ackError(ack,'Bạn không thể soi mục tiêu này lúc này.'); const result={targetId:target.id,targetName:target.name,isWolf:roleFor(target)?.key==='wolf'}; game.seerChecks.set(player.id,{targetId:target.id,result}); sync(); ack?.({ok:true,result}); schedule(beginWitchTurn,1800); });
  socket.on('witch:act',(action,ack)=>{ if(game.phase!=='witch'||!player.alive||roleFor(player)?.key!=='witch'||game.witchActions.has(player.id)) return ackError(ack,'Bạn không thể dùng năng lực Phù thủy lúc này.'); if(action?.type==='save'){ if(!game.witchPotions.heal||!game.pendingWolfVictim) return ackError(ack,'Bình cứu không khả dụng.'); game.witchPotions.heal=false; game.pendingWolfVictim=null; game.witchActions.set(player.id,{type:'save'}); } else if(action?.type==='poison'){ const target=game.players.find(p=>p.id===action.targetId); if(!game.witchPotions.poison||!target?.alive||target.id===player.id) return ackError(ack,'Mục tiêu đầu độc không hợp lệ.'); game.witchPotions.poison=false; game.pendingPoisonVictim=target.id; game.witchActions.set(player.id,{type:'poison',targetId:target.id}); } else return ackError(ack,'Năng lực không hợp lệ.'); sync(); ack?.({ok:true}); schedule(dawn,1200); });
  socket.on('night:finish',(_,ack)=>{ const role=roleFor(player)?.key; if(!player.alive||!((game.phase==='seer'&&role==='seer')||(game.phase==='witch'&&role==='witch'))) return ackError(ack,'Bạn không có quyền kết thúc lượt này.'); ack?.({ok:true}); if(game.phase==='seer') beginWitchTurn(); else dawn(); });
  socket.on('game:start',(_,ack)=>{ if(player.seat!==0||game.phase!=='lobby') return ackError(ack,'Chỉ chủ phòng được bắt đầu.'); game.phase='day'; game.result=''; sync(); ack?.({ok:true}); });
  socket.on('phase:set',(phase,ack)=>{ if(player.seat!==0||!['day','vote','night','wolf','seer','witch'].includes(phase)) return ackError(ack,'Không có quyền đổi giai đoạn.'); clearTimeout(game.transitionTimer); if(phase==='night') beginNight(); else { game.phase=phase; game.result=''; if(phase==='vote') game.votes.clear(); if(phase==='wolf'){game.nightVotes.clear();game.wolfChat=[];} if(phase==='seer') game.seerChecks.clear(); if(phase==='witch') game.witchActions.clear(); sync(); } ack?.({ok:true}); });
  socket.on('phase:resolve',(_,ack)=>{ if(player.seat!==0) return ackError(ack,'Chỉ chủ phòng được kết thúc lượt.'); if(game.phase==='vote'){ const target=countAndResolve(game.votes); if(target){target.alive=false;game.result=`${target.name} đã bị loại.`;}else game.result='Hòa phiếu — không ai bị loại.'; game.phase='result'; sync(); } else if(game.phase==='wolf') resolveWolfTurn(); else if(game.phase==='seer') beginWitchTurn(); else if(game.phase==='witch') dawn(); else return ackError(ack,'Không có lượt nào cần kết thúc.'); ack?.({ok:true}); });
  socket.on('disconnect',()=>{ player.connected=false; player.socketId=null; sync(); });
});
}
attachLobby(io, {devTest:process.env.DEV_BOT_TEST === '1' && process.env.NODE_ENV !== 'production'});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Không thể khởi động server: cổng ${PORT} đang được sử dụng.`);
    console.error('Hãy dùng server đang chạy hoặc đặt cổng khác, ví dụ: $env:PORT=3002; npm run server');
    process.exitCode = 1;
    return;
  }
  console.error(`Không thể khởi động server: ${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, '0.0.0.0', ()=>console.log(`Ma Sói server running at http://0.0.0.0:${PORT}`));

