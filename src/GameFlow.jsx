import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import NightAction from './NightAction.jsx';
import './game-flow.css';

export const isNight = phase => ['night_start', 'night_actions', 'night_resolve'].includes(phase);
const stepNames = { cupid: 'Cupid', guard: 'Bảo Vệ', seer: 'Tiên Tri', werewolf: 'Ma Sói', witch: 'Phù Thủy', wolf_dog:'Chó Săn', wild_child:'Cậu Bé', cursed_wolf:'Sói Nguyền', white_wolf:'Sói Trắng' };

export default function GameFlow({ game, connected, onComplete, onAbility, onDayAction }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setNow(Date.now()); const interval = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(interval); }, [game.phaseVersion, game.stepEndsAt]);
  const serverNow = game.serverNow + now - game.receivedAt;
  const seconds = game.stepEndsAt === null ? null : Math.max(0, Math.ceil((game.stepEndsAt - serverNow) / 1000));
  const night = isNight(game.phase);
  useEffect(() => {
    if (!night) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [night]);
  const title = night ? `Đêm thứ ${game.nightNumber}` : game.phase === 'role_reveal' ? 'Vai trò đã được phân' : `Ngày thứ ${game.dayNumber}`;
  const message = game.phase === 'role_reveal' ? 'Xem thẻ bí mật của bạn. Đêm sẽ bắt đầu khi hết giờ.'
    : game.phase === 'night_start' ? 'Đêm đang bắt đầu. Hãy chờ lượt của bạn.'
    : game.phase === 'night_resolve' ? 'Đêm sắp kết thúc. Hãy chờ thông báo khi trời sáng.'
    : game.phase === 'day_start' ? 'Trời đã sáng.'
    : game.phase === 'day_discussion' ? 'Thảo luận bằng chat chung trước khi đề cử.'
    : game.phase === 'nomination_vote' ? 'Đề cử một người khác còn sống. Lượt ' + game.nominationRound
    : game.phase === 'defense' ? 'Chỉ ứng viên được chat để biện hộ.'
    : game.phase === 'execution_vote' ? 'Phán quyết kín. Quá nửa phiếu hợp lệ mới treo cổ.'
    : game.phase === 'day_result' ? game.dayResult?.message
    : game.phase === 'last_words' ? 'Lời trăn trối: ' + game.speaker?.name
    : game.phase === 'triggered_abilities' ? 'Đang xử lý kỹ năng khi bị loại.'
    : game.phase === 'next_night' ? 'Ngày đã kết thúc. Chuẩn bị đêm tiếp theo.'
    : game.hasCompleted ? 'Đã xác nhận hành động. Đang đợi lượt kết thúc.'
    : game.actionStep ? `Lượt ${stepNames[game.actionStep]}. Hãy chọn hành động của bạn.`
    : 'Đang chờ. Bạn sẽ được thông báo riêng khi đến lượt.';
  const content = <div className={night ? 'engine-night-overlay' : 'engine-day-panel'} role={night ? 'dialog' : undefined} aria-modal={night ? true : undefined} aria-label={night ? 'Giao diện ban đêm' : 'Trạng thái trận đấu'}>
    <div className="engine-flow-card">
      {night && <span className="engine-moon" aria-hidden="true">☾</span>}
      <h2>{title}</h2>
      <p role="status">{message}</p>
      {seconds !== null && <output className="engine-countdown" aria-label="Thời gian còn lại">{Math.floor(seconds / 60).toString().padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}</output>}
      {!night && <DayActions key={game.phaseVersion} game={game} disabled={!connected || seconds === 0} onAction={onDayAction} />}
      {game.ability && <NightAction key={game.phaseVersion} game={game} connected={connected} expired={seconds === 0} onSubmit={onAbility} onSkip={onComplete} />}
      {game.lover && <p className="night-private-note">Người yêu của bạn: <b>{game.lover.name}</b></p>}
      {game.seerResult && <p className="night-private-note">Kết quả soi đêm {game.seerResult.nightNumber}: {game.seerResult.target.name} — {game.seerResult.isWolf ? 'Thuộc phe Ma Sói' : 'Không thuộc phe Ma Sói'}</p>}
      {game.abilityResult && game.abilityResult.type !== 'seer' && night && <p className="night-private-note">Đêm {game.abilityResult.nightNumber}: {game.abilityResult.message}</p>}
      {!night && game.announcement && <p className="night-announcement" role="status">{game.announcement.message}</p>}
      {!connected && <p className="engine-offline">Mất kết nối — đang kết nối lại…</p>}
      <small>{night ? 'Chỉ bạn nhìn thấy hành động riêng của mình' : 'Kết quả do server xác thực'}</small>
    </div>
  </div>;
  return night ? createPortal(content, document.body) : content;
}

function DayActions({game,disabled,onAction}) {
  const [target,setTarget] = useState('');
  const a = game.dayAction || {};
  const act = (event, extra = {}) => onAction(event,{phaseVersion:game.phaseVersion,...extra});
  return <div className="day-actions">
    {game.candidate && <p className="day-candidate">Ứng viên: <strong>{game.candidate.name}</strong></p>}
    {(a.canNominate || a.canShoot) && <><select aria-label={a.canShoot ? 'Mục tiêu Thợ Săn' : 'Người được đề cử'} value={target} onChange={e=>setTarget(e.target.value)} disabled={disabled}><option value="">Chọn người chơi</option>{a.targets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button disabled={disabled || !target} onClick={()=>act(a.canShoot ? 'game:hunter:shoot' : 'game:nominate',{targetId:target})}>{a.canShoot ? 'Bắn' : 'Xác nhận đề cử'}</button></>}
    {a.canShoot && <button disabled={disabled} onClick={()=>act('game:hunter:shoot',{targetId:null})}>Bỏ qua bắn</button>}
    {a.canEndDefense && <button disabled={disabled} onClick={()=>act('game:defense:end')}>Kết thúc biện hộ</button>}
    {game.phase === 'execution_vote' && <div className="day-verdict-buttons"><button data-tone="danger" disabled={disabled || !a.canVote} onClick={()=>act('game:execution:vote',{choice:'EXECUTE'})}>Treo cổ</button><button disabled={disabled || !a.canVote} onClick={()=>act('game:execution:vote',{choice:'PARDON'})}>Tha</button></div>}
    {a.hasVoted && <p>Đã ghi nhận phiếu kín của bạn.</p>}
    {a.canEndLastWords && <button disabled={disabled} onClick={()=>act('game:last-words:end')}>Kết thúc trăn trối</button>}
    {game.dayResult?.valid !== undefined && <p>Treo cổ: {game.dayResult.execute} · Tha: {game.dayResult.pardon}</p>}
  </div>;
}
