import React, { useEffect, useRef, useState } from 'react';
import { ROLES, defaultRoleConfig, validateRoleConfig } from '../shared/roles.js';
import './role-settings.css';

export default function RoleSettings({ config, playerCount, isHost, waiting, connected, onSave, onClose }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(config);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editable = isHost && waiting && connected && !saving;
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => { if (!dirty || !isHost || !waiting) setDraft(config); }, [config, dirty, isHost, waiting]);
  const validation = validateRoleConfig(draft, playerCount);
  const total = Object.values(draft || {}).reduce((sum, value) => sum + value, 0);
  function change(id, amount) { setDraft(current => ({ ...current, [id]: current[id] + amount })); setDirty(true); setError(''); }
  async function save() {
    if (!editable || validation) return;
    setSaving(true); setError('');
    try {
      const response = await onSave(draft);
      if (response.ok) { setDirty(false); onClose(); }
      else setError(response.error);
    } catch { setError('Không thể lưu cấu hình. Kiểm tra kết nối rồi thử lại.'); }
    finally { setSaving(false); }
  }
  return <dialog className="role-settings" ref={dialog} aria-labelledby="role-settings-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <div className="role-settings-heading"><h2 id="role-settings-title">THIẾT LẬP VAI TRÒ</h2><button type="button" aria-label="Đóng thiết lập vai trò" onClick={onClose}>×</button></div>
    <p>Người chơi: <b>{playerCount}</b> · Tổng số thẻ: <b>{total}/{playerCount}</b></p>
    {!isHost && <p>Chỉ chủ phòng có thể chỉnh sửa cấu hình.</p>}
    {!waiting && <p>Trận đã bắt đầu. Bộ thẻ đã khóa.</p>}
    <div className="role-settings-list">{ROLES.map(role => <div className="role-settings-row" key={role.id}>
      <span className="role-settings-icon" aria-hidden="true">{role.icon}</span>
      <div className="role-settings-name"><b>{role.name}</b><small>Phe {role.teamName} · Tối đa {role.max}</small></div>
      <button type="button" disabled={!editable || !draft?.[role.id]} aria-label={`Giảm ${role.name}`} onClick={() => change(role.id, -1)}>−</button>
      <output aria-label={`Số thẻ ${role.name}`}>{draft?.[role.id] || 0}</output>
      <button type="button" disabled={!editable || draft?.[role.id] >= role.max} aria-label={`Tăng ${role.name}`} onClick={() => change(role.id, 1)}>+</button>
    </div>)}</div>
    <p className="role-settings-warning" role="status">{error || validation || (dirty ? 'Cấu hình chưa lưu.' : 'Bộ thẻ hợp lệ.')}</p>
    {isHost && waiting && <div className="role-settings-actions"><button data-tone="secondary" type="button" disabled={!editable} onClick={() => { setDraft(defaultRoleConfig(playerCount)); setDirty(true); setError(''); }}>Khôi phục mặc định</button><button type="button" disabled={!editable || !!validation} onClick={save}>{saving ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div>}
  </dialog>;
}
