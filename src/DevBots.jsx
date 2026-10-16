import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createBot} from '../dev/bot-client.js';
import './dev-bots.css';

export default function DevBots({state,url,onRequest,onReset}) {
 const bots=useRef([]), [status,setStatus]=useState([]), [logs,setLogs]=useState([]), [auto,setAuto]=useState(true), [speed,setSpeed]=useState(1), [seed,setSeed]=useState('ma-soi-07'), [busy,setBusy]=useState(false), [error,setError]=useState('');
 const mounted=useRef(true);
 const refresh=()=>{if(mounted.current)setStatus(bots.current.map(b=>b.status()));};
 const log=entry=>{if(mounted.current)setLogs(old=>[...old,`${entry.name} · ${entry.phase} · ${entry.event} · ${entry.ok?'OK':'FAIL'}`].slice(-100));};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const b of bots.current)void b.leave();bots.current=[];};},[]);
 useEffect(()=>{for(const b of bots.current)b.setEnabled(auto);},[auto]);
 async function remove(){await Promise.all(bots.current.map(b=>b.leave()));bots.current=[];refresh();}
 async function run(task){setBusy(true);setError('');try{await task();}catch(e){setError(e.message||'Thao tác thất bại.');}finally{if(mounted.current)setBusy(false);}}
 async function configure(value){const r=await onRequest('dev:test:configure',{speed:value});if(!r?.ok)throw new Error(r?.error||'Backend chưa bật DEV_BOT_TEST.');}
 async function add(){
   await configure(speed);
   const missing=Math.min(11-bots.current.length,12-state.players.length);
   for(let i=0;i<missing;i++){
     const b=createBot({url,name:`Bot ${String(bots.current.length+1).padStart(2,'0')}`,seed,enabled:auto,onLog:log,onChange:refresh});
     bots.current.push(b);refresh();await b.connect();const r=await b.join(state.roomCode);if(!r.ok){await b.leave();bots.current=bots.current.filter(t=>t!==b);refresh();throw new Error(r.error);}
   }
   refresh();
 }
 const waiting=state.status==='waiting';
 return createPortal(<details className="dev-bot-panel"><summary>DEV · Bot Test · {status.filter(b=>b.connected&&b.inRoom).length}/11 Bot</summary>
   <p>Chỉ localhost · Bot dùng session độc lập</p>
   <div className="dev-bot-controls"><button disabled={busy||!waiting||status.length>=11||state.players.length>=12} onClick={()=>run(add)}>Thêm 11 Bot</button><button data-tone="danger" disabled={busy||!status.length} onClick={()=>run(remove)}>Xóa Bot</button></div>
   <label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} />Bot tự động</label>
   <label>Tốc độ kiểm thử<select value={speed} disabled={busy||!waiting} onChange={e=>{const v=Number(e.target.value);setSpeed(v);void run(()=>configure(v));}}><option value="0.5">0.5× — chậm, dễ thao tác</option><option value="1">1× — timer test mặc định</option><option value="2">2× — nhanh</option><option value="5">5× — rất nhanh</option></select></label>
   <label>Seed Bot<input value={seed} maxLength={64} disabled={busy||status.length>0} onChange={e=>setSeed(e.target.value)} /></label>
   <p>Timer áp dụng từ trận tiếp theo. Tắt Bot tự động để tự quan sát; đồng hồ server vẫn chạy.</p>
   <button data-tone="secondary" disabled={busy} onClick={()=>run(async()=>{await remove();await onReset();})}>Reset phòng test</button>
   {error&&<p role="alert">{error}</p>}
   <details><summary>Log sự kiện ({logs.length})</summary><pre aria-label="Log Bot">{logs.join('\n')||'Chưa có sự kiện.'}</pre></details>
 </details>,document.body);
}
