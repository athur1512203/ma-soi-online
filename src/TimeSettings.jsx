import React,{useEffect,useState} from 'react';
import {TIME_SETTINGS,defaultTimeConfig,validateTimeConfig} from '../shared/time-settings.js';
export default function TimeSettings({config,editable,isHost,waiting,onSave}) {
 const [draft,setDraft]=useState(config||defaultTimeConfig),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!dirty||!isHost||!waiting)setDraft(config||defaultTimeConfig());},[config,dirty,isHost,waiting]);
 const error=validateTimeConfig(draft),canEdit=editable&&!busy;
 async function save(){if(!canEdit||error)return;setBusy(true);setMessage('');try{const response=await onSave(draft);if(response.ok){setDirty(false);setMessage('Đã lưu thời gian.');}else setMessage(response.error);}catch{setMessage('Không thể lưu thời gian. Kiểm tra kết nối rồi thử lại.');}finally{setBusy(false);}}
 return <section className="time-settings" aria-labelledby="time-settings-title"><h3 id="time-settings-title">Cài đặt thời gian</h3>
 {TIME_SETTINGS.map(t=><label className="time-settings-row" key={t.id}><span>{t.name}<small>{t.min}–{t.max} giây</small></span><input type="number" aria-label={t.name} min={t.min} max={t.max} step="1" value={draft[t.id]} disabled={!canEdit} onChange={e=>{setDraft(d=>({...d,[t.id]:Number(e.target.value)}));setDirty(true);setMessage('');}} /></label>)}
 <p role="status">{error||message||(dirty?'Thời gian chưa lưu.':'Đồng hồ do server quản lý.')}</p>
 {isHost&&waiting&&<div className="role-settings-actions"><button type="button" data-tone="secondary" disabled={!canEdit} onClick={()=>{setDraft(defaultTimeConfig());setDirty(true);setMessage('');}}>Khôi phục thời gian mặc định</button><button type="button" disabled={!canEdit||!!error||!dirty} onClick={save}>{busy?'Đang lưu…':'Lưu thời gian'}</button></div>}
 </section>;
}
