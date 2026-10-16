import React, { useState } from 'react';

export default function NightAction({ game, connected, expired, onSubmit, onSkip }) {
  const { ability } = game;
  const [chosen, setChosen] = useState(ability.selected?.targetIds || []);
  const [targetId, setTargetId] = useState(ability.selected?.targetId || '');
  const [save, setSave] = useState(false);
  const [poison, setPoison] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const disabled = !connected || expired || busy || !ability.canSubmit;
  const valid = ability.type === 'cupid' ? chosen.length === 2 : ability.type === 'witch' ? true : !!targetId;
  const labels = { cupid: 'Xác nhận ghép đôi', guard: 'Xác nhận bảo vệ', seer: 'Soi', werewolf: game.hasCompleted ? 'Đổi phiếu' : 'Xác nhận mục tiêu', witch: 'Xác nhận hành động' };
  async function submit(event) {
    event.preventDefault(); if (disabled || !valid) return;
    const payload = ability.type === 'cupid' ? { targetIds: chosen }
      : ability.type === 'witch' ? { save, poisonTargetId: poison || null } : { targetId };
    setBusy(true); setError('');
    try { const response = await onSubmit({ phaseVersion: game.phaseVersion, ...payload }); if (!response.ok) setError(response.error); }
    catch { setError('Không nhận được phản hồi. Hãy kiểm tra kết nối.'); }
    finally { setBusy(false); }
  }
  return <form data-ability={ability.type} className="night-ability" onSubmit={submit}>
    {ability.teammates && <div className="night-teammates"><b>Đồng đội Ma Sói</b>{ability.teammates.map(p => <span key={p.id}>{p.name} · {p.hasSelected ? 'Đã chọn' : 'Chưa chọn'}{!p.connected && ' · Mất kết nối'}</span>)}<small>Có thể đổi phiếu khi lượt còn mở. Hòa phiếu sẽ không có mục tiêu.</small></div>}
    {ability.type === 'cupid' ? <fieldset disabled={disabled}><legend>Chọn đúng hai người</legend><div className="night-cupid-targets">{ability.targets.map(p => <label key={p.id}><input type="checkbox" checked={chosen.includes(p.id)} disabled={!chosen.includes(p.id) && chosen.length === 2} onChange={() => setChosen(current => current.includes(p.id) ? current.filter(id => id !== p.id) : [...current, p.id])} />{p.name}</label>)}</div><p>Đã chọn: {chosen.map(id => ability.targets.find(p => p.id === id)?.name).join(' và ') || 'Chưa chọn'}</p></fieldset>
      : ability.type === 'witch' ? <fieldset disabled={disabled}><legend>Hai bình thuốc</legend><p>Bình cứu: {ability.potions.save ? 'Còn' : 'Đã hết'} · Bình độc: {ability.potions.poison ? 'Còn' : 'Đã hết'}</p><p>Mục tiêu Sói: {ability.victim?.name || 'Không có'}</p><label><input type="checkbox" checked={save} disabled={!ability.canSave} onChange={e => setSave(e.target.checked)} />Dùng bình cứu{ability.victim ? ` cho ${ability.victim.name}` : ''}</label><label>Mục tiêu bình độc<select aria-label="Mục tiêu bình độc" value={poison} disabled={!ability.canPoison} onChange={e => setPoison(e.target.value)}><option value="">Không dùng bình độc</option>{ability.targets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><small>Có thể dùng cả hai bình cùng đêm. Chỉ được tự cứu đêm đầu.</small></fieldset>
      : <label>Mục tiêu<select aria-label="Mục tiêu kỹ năng" disabled={disabled} value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Chọn người chơi</option>{ability.targets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {error && <p role="alert" className="night-ability-error">{error}</p>}
    <div className="night-ability-buttons"><button disabled={disabled || !valid}>{busy ? 'Đang gửi…' : labels[ability.type]}</button><button data-tone="secondary" type="button" disabled={!connected || expired || busy || !game.canComplete} onClick={() => onSkip(game.phaseVersion)}>Bỏ qua lượt</button></div>
  </form>;
}
