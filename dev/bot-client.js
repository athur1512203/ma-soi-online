import {io} from 'socket.io-client';

export function seededRandom(seed) {
  let value=2166136261;
  for(const c of String(seed)) value=Math.imul(value^c.charCodeAt(0),16777619);
  return ()=>{value+=0x6D2B79F5;let n=value;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}
const sorted=targets=>[...targets].sort((a,b)=>a.name.localeCompare(b.name,'en'));

// One closure owns one client/session. No room, engine, assignment Map, or other
// bot's private snapshot is passed into this policy.
export function createBot({url,name,seed='ma-soi',enabled=true,delay=350,onLog=()=>{},onChange=()=>{}}) {
  const random=seededRandom(seed+':'+name), completed=new Set(), seenWolves=new Set();
  let token=null, state=null, game=null, timer=null, busy=false, disposed=false, epoch=null;
  const socket=io(url,{autoConnect:false,forceNew:true,reconnection:true,auth:cb=>cb(token?{reconnectToken:token}:{})});
  const log=(event,ok=true,context={})=>onLog({name,event,ok,gameId:state?.gameId,phase:game?.phase||state?.phase||'lobby',version:game?.phaseVersion||0,...context});
  const notify=()=>onChange({name,connected:socket.connected,inRoom:!!state?.me});
  const key=()=>state?.gameId+':'+(game?.phaseVersion||'lobby');
  function accept(s) {
    if(epoch!==s.gameId){epoch=s.gameId;game=null;completed.clear();seenWolves.clear();}
    const {reconnectToken,role,...publicSnapshot}=s;
    state=publicSnapshot;if(!s.game)game=null;schedule();notify();
  }
  socket.on('session',s=>{token=s.reconnectToken;accept(s);});
  socket.on('state',accept);
  socket.on('game:state',s=>{if(s.gameId!==state?.gameId)return;game=s;if(s.seerResult?.isWolf)seenWolves.add(s.seerResult.target.id);schedule();});
  socket.on('connect',()=>{log('connected');notify();schedule();});
  socket.on('disconnect',()=>{clearTimeout(timer);timer=null;log('disconnected');notify();});
  socket.on('connect_error',()=>{log('connect_error',false);notify();});
  socket.on('room:error',()=>log('room:error',false));
  async function request(event,payload={}) {
    const value={...payload,gameId:state?.gameId};
    const context={gameId:state?.gameId,phase:game?.phase||state?.phase||'lobby',version:game?.phaseVersion||0};
    return new Promise(resolve=>socket.timeout(4000).emit(event,value,(error,response)=>{
      const result=error?{ok:false,error:'ack_timeout'}:response;
      log(event,!!result?.ok,context);resolve(result||{ok:false,error:'missing_ack'});
    }));
  }
  const pick=targets=>{const list=sorted(targets);return list[Math.floor(random()*list.length)];};
  function schedule(){if(disposed||!enabled||busy||timer||!socket.connected||!state?.me)return;timer=setTimeout(()=>{timer=null;void pump();},delay);}
  async function pump(){
    if(disposed||!enabled||busy||!socket.connected||!state?.me)return;
    busy=true;const version=key(), g=game, s=state;
    const send=async(event,payload={})=>{if(!enabled||disposed||key()!==version)return {ok:false};return request(event,{phaseVersion:g?.phaseVersion,...payload});};
    try{
      if(s.status==='waiting'){
        if(!s.me.isHost&&!s.me.ready&&!completed.has(version+':ready')){completed.add(version+':ready');await request('room:ready',{ready:true});}
        return;
      }
      if(!g||g.phase==='game_over'||completed.has(version))return;
      const a=g.dayAction||{}, ability=g.ability;
      completed.add(version);
      if(ability?.canSubmit && !g.hasCompleted){
        let payload;
        if(ability.type==='cupid'){const list=sorted(ability.targets);const first=list.splice(Math.floor(random()*list.length),1)[0];payload={targetIds:[first.id,pick(list).id]};}
        else if(ability.type==='witch')payload={save:!!ability.canSave&&random()<.65,poisonTargetId:ability.canPoison&&random()<.4?pick(ability.targets).id:null};
        else if(ability.type==='werewolf'){
          // All wolves have the same legal target list. Agreement uses names and
          // public night number, never a shared collection of private wolf data.
          const list=sorted(ability.targets), agree=seededRandom(seed+':wolves:'+g.nightNumber);
          payload={targetId:list[Math.floor(agree()*list.length)].id};
        }else payload={targetId:pick(ability.targets).id};
        await send('game:ability:submit',payload);
      }else if(a.canNominate){const known=a.targets.filter(p=>seenWolves.has(p.id));await send('game:nominate',{targetId:pick(known.length?known:a.targets).id});}
      else if(a.canVote)await send('game:execution:vote',{choice:random()<.75?'EXECUTE':'PARDON'});
      else if(a.canShoot)await send('game:hunter:shoot',{targetId:a.targets.length?pick(a.targets).id:null});
      else if(a.canEndDefense){await send('chat:public',{text:'Tôi nghĩ làng nên cân nhắc trước khi phán quyết.'});await send('game:defense:end');}
      else if(a.canEndLastWords){await send('chat:public',{text:'Chúc những người còn lại tìm được Ma Sói.'});await send('game:last-words:end');}
      else if(g.canPublicChat&&g.phase==='day_discussion')await send('chat:public',{text:['Mọi người cùng xem lại những gì đã xảy ra đêm qua.','Tôi chưa chắc ai là Sói. Hãy cùng thảo luận.','Tôi sẽ cân nhắc trước khi bỏ phiếu.'][Math.floor(random()*3)]});
    }finally{busy=false;if(key()!==version)schedule();}
  }
  return {
    name,
    async connect(){if(socket.connected)return;await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect();});},
    async join(roomCode){return request('room:join',{name,roomCode});},
    async create(){return request('room:create',{name});},
    request,
    setEnabled(value){enabled=!!value;if(!enabled){clearTimeout(timer);timer=null;completed.delete(key());}else schedule();},
    async reconnect(){socket.disconnect();await new Promise(r=>setTimeout(r,40));await new Promise((r,j)=>{socket.once('session',r);socket.once('connect_error',j);socket.connect();});},
    async leave(){clearTimeout(timer);timer=null;disposed=true;if(socket.connected&&state?.me)await request('room:leave');socket.disconnect();notify();},
    dispose(){disposed=true;clearTimeout(timer);socket.disconnect();notify();},
    status:()=>({name,connected:socket.connected,inRoom:!!state?.me}),
    // Test observer gets public data only; bot policy retains its own private state.
    publicState:()=>state,
  };
}
