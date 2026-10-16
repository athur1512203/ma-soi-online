import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ROLES } from '../shared/roles.js';
import './game-result.css';

const headings = {
  VILLAGE_WIN: ['PHE DÂN CHIẾN THẮNG', 'Tất cả Ma Sói đã bị loại.'],
  WEREWOLF_WIN: ['PHE MA SÓI CHIẾN THẮNG', 'Ma Sói đã giành quyền kiểm soát ngôi làng.'],
  DRAW: ['TRẬN ĐẤU HÒA', 'Không còn người chơi sống sót.'],
};

export default function GameResult({ result, isHost, connected, onRematch, onLeave }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  const [title, subtitle] = headings[result.winner];
  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const buttons = [...panel.current.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
  }
  return createPortal(<div className="match-result-overlay" data-winner={result.winner}>
    <section className="match-result-card" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="match-result-title" onKeyDown={trapFocus}>
      <span className="match-result-sigil" aria-hidden="true">✦</span>
      <p className="match-result-eyebrow">KẾT THÚC TRẬN</p>
      <h1 id="match-result-title">{title}</h1>
      <p>{subtitle}</p>
      <p className="match-result-rounds">{result.dayNumber} ngày · {result.nightNumber} đêm</p>
      <div className="match-result-list"><table><caption>Vai trò được tiết lộ sau trận</caption>
        <thead><tr><th>Ghế</th><th>Người chơi</th><th>Vai trò</th><th>Phe</th><th>Trạng thái</th></tr></thead>
        <tbody>{[...result.players].sort((a,b)=>a.seatIndex-b.seatIndex).map(p => <tr key={p.id}>
          <td>{p.seatIndex + 1}</td><th scope="row">{p.name}</th><td>{ROLES.find(r=>r.id===p.role)?.name || p.role}</td>
          <td>{p.team === 'werewolf' ? 'Ma Sói' : 'Dân'}</td><td>{p.alive ? 'Còn sống' : 'Bị loại'}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="match-result-actions"><button disabled={!connected || !isHost} onClick={onRematch}>Chơi lại</button><button data-tone="danger" disabled={!connected} onClick={onLeave}>Rời phòng</button></div>
      {!isHost && <p role="status">Đang chờ Host tổ chức trận mới.</p>}
      {!connected && <p role="status">Mất kết nối — đang kết nối lại…</p>}
    </section>
  </div>, document.body);
}
