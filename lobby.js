import {defaultTimeConfig,validateTimeConfig,timeDurations} from './shared/time-settings.js';
import {testDurations,localTestSocket} from './dev/test-config.js';
import crypto from 'node:crypto';
import { defaultRoleConfig, validateRoleConfig, ROLES } from './shared/roles.js';
import { dealRoles, privateRole } from './role-dealer.js';
import { createGameEngine } from './game-engine.js';
import { gameDurations } from './game-config.js';

export function attachLobby(io, { reconnectMs = Number(process.env.LOBBY_RECONNECT_MS || 30000), durations, engineClock, devTest = false } = {}) {
  if (!Number.isFinite(reconnectMs) || reconnectMs < 1) throw new Error('LOBBY_RECONNECT_MS must be positive');
  const timing = gameDurations(durations);
  const allowDevTest = devTest && process.env.NODE_ENV !== 'production';
  const rooms = new Map(), sessions = new Map();
  const publicPlayer = p => ({ id: p.id, name: p.name, seatIndex: p.seatIndex, ready: p.ready, connected: p.connected, alive: p.alive !== false, isHost: p.room.hostId === p.id });
  const configState = room => ({ roleConfig: { ...room.roleConfig }, roleConfigCustomized: room.roleConfigCustomized, timeConfig:{...room.timeConfig}, roleConfigError: validateRoleConfig(room.roleConfig, room.players.length), playerCount: room.players.length });
  const refreshDefault = room => { if (room.status === 'waiting' && !room.roleConfigCustomized) room.roleConfig = defaultRoleConfig(room.players.length); };
  const startReason = room => room.status !== 'waiting' || room.roleAssignments ? 'Phòng đã bắt đầu trận.' : room.players.length < 6 ? 'Cần ít nhất 6 người chơi.' : room.players.some(p => p.id !== room.hostId && !p.ready) ? 'Tất cả người chơi thường phải sẵn sàng.' : room.players.some(p => !p.connected) ? 'Hãy chờ người chơi kết nối lại.' : validateRoleConfig(room.roleConfig, room.players.length);
  // Both state events are safe to expose: assignments only travel in private events.
  const snapshot = (room, p) => {
    const game = room.engine?.publicState() || null;
    return { roomCode: room.code, gameId:room.gameId, gameVersion:room.gameVersion, devBotTest:allowDevTest && localTestSocket(p.socket || {handshake:{}}), testSpeed:room.testSpeed || null, status: room.status, phase: game?.phase || 'lobby', round: Math.max(game?.nightNumber || 0, game?.dayNumber || 0, 1), game, players: room.players.map(publicPlayer), me: publicPlayer(p), canStart: !startReason(room), startReason: startReason(room), ...configState(room), result: game?.announcement?.message || '', publicChat: room.publicChat, wolfChat: [], wolfTeammates: [], permissions: { canPublicChat: !!room.engine?.canChat(p) } };
  };
  const sync = room => { for (const p of room.players) if (p.socket) { const state = snapshot(room, p); p.socket.emit('state', state); p.socket.emit('room:updated', state); if (room.engine) p.socket.emit('game:state', room.engine.privateState(p)); } };
  function close() { for (const p of sessions.values()) clearTimeout(p.timer); for (const room of rooms.values()) room.engine?.dispose(); }
  function remove(p) {
    clearTimeout(p.timer); sessions.delete(p.token);
    const room = p.room;
    room.players = room.players.filter(other => other !== p);
    refreshDefault(room);
    if (p.socket) { p.socket.data.lobbyPlayer = null; p.socket.leave(room.code); }
    p.socket = null;
    if (!room.players.length) { room.engine?.dispose(); rooms.delete(room.code); }
    else { if (room.hostId === p.id) room.hostId = room.players[0].id; room.engine?.participantsChanged(); sync(room); }
  }
  const validName = value => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 32 && !/[<>\x00-\x1f\x7f]/.test(value);
  const validObject = value => value && typeof value === 'object' && !Array.isArray(value);
  io.on('connection', socket => {
    function fail(ack, error, event = 'room:error') { socket.emit(event, error); if (typeof ack === 'function') ack({ ok: false, error }); }
    function bind(p) {
      clearTimeout(p.timer); p.timer = null; p.connected = true; p.socket = socket; socket.data.lobbyPlayer = p;
      socket.join(p.room.code);
      socket.emit('session', { reconnectToken: p.token, ...snapshot(p.room, p), role: privateRole(p.room, p.id) });
      const role = privateRole(p.room, p.id); if (role) socket.emit('game:role-assigned', role);
      sync(p.room);
    }
    const token = socket.handshake.auth?.reconnectToken;
    if (token) {
      const p = typeof token === 'string' ? sessions.get(token) : null;
      if (!p || p.connected) fail(null, 'Session không hợp lệ, đã hết hạn hoặc đang được sử dụng.');
      else bind(p);
    }
    function request(event, handler) {
      socket.on(event, (value, ack) => {
        if (typeof value === 'function' && ack === undefined) { ack = value; value = undefined; }
        const p = socket.data.lobbyPlayer;
        const matchAction = ['game:step-complete','game:ability:submit','game:nominate','game:defense:end','game:execution:vote','game:hunter:shoot','game:last-words:end','game:rematch-request','chat:public'].includes(event);
        const lobbyMutation = ['room:ready','room:start-request','game:start','roles:config:update','time:config:update','room:leave'].includes(event);
        if (p && (matchAction || lobbyMutation && p.room.gameVersion > 1) && (!validObject(value) || value.gameId !== p.room.gameId)) return fail(ack, 'Yêu cầu thiếu mã trận hiện tại hoặc thuộc trận cũ.', 'game:error');
        const error = handler(value, p);
        if (typeof error === 'string') return fail(ack, error, event === 'game:ability:submit' ? 'game:ability:error' : event.startsWith('roles:') ? 'roles:config:error' : event.startsWith('game:') || event.startsWith('phase:') || event.startsWith('night:') || event.startsWith('seer:') || event.startsWith('witch:') || event.startsWith('vote:') || event === 'chat:wolf' ? 'game:error' : 'room:error');
        if (typeof ack === 'function') ack({ ok: true, ...error });
      });
    }
    function enter(room, name) {
      const occupied = new Set(room.players.map(p => p.seatIndex));
      const seatIndex = Array.from({ length: 12 }, (_, i) => i).find(i => !occupied.has(i));
      const p = { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex'), name: name.trim(), seatIndex, ready: false, alive: true, room, timer: null };
      room.players.push(p); refreshDefault(room); room.hostId ||= p.id; sessions.set(p.token, p); bind(p);
      return { roomCode: room.code };
    }
    request('room:create', (value, p) => {
      if (p) return 'Bạn đang ở trong một phòng.';
      if (!validObject(value) || !validName(value.name)) return 'Tên hiển thị phải có 1–32 ký tự hợp lệ.';
      let code; do { code = Array.from({ length: 6 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[crypto.randomInt(36)]).join(''); } while (rooms.has(code));
      const room = { code, gameId:crypto.randomUUID(), gameVersion:1, phaseSerial:0, status: 'waiting', hostId: null, players: [], publicChat: [], engine: null, roleConfig: defaultRoleConfig(6), roleConfigCustomized: false, roleAssignments: null, roleStates:null, timeConfig:defaultTimeConfig() }; rooms.set(code, room);
      return enter(room, value.name);
    });
    request('room:join', (value, p) => {
      if (p) return 'Bạn đã ở trong một phòng, không thể chiếm thêm ghế.';
      if (!validObject(value) || !validName(value.name)) return 'Tên hiển thị phải có 1–32 ký tự hợp lệ.';
      if (typeof value.roomCode !== 'string' || !/^[A-Za-z0-9]{6}$/.test(value.roomCode.trim())) return 'Mã phòng phải gồm 6 ký tự chữ và số.';
      const room = rooms.get(value.roomCode.trim().toUpperCase());
      if (!room) return 'Phòng không tồn tại.';
      if (room.status !== 'waiting') return 'Phòng đã bắt đầu trận.';
      if (room.players.length >= 12) return 'Phòng đã đủ 12 người.';
      return enter(room, value.name);
    });
    request('room:leave', (_, p) => { if (!p) return 'Bạn chưa tham gia phòng.'; remove(p); return {}; });
    request('room:ready', (value, p) => {
      if (!p) return 'Bạn chưa tham gia phòng.';
      if (p.room.status !== 'waiting') return 'Phòng đã bắt đầu trận.';
      if (p.room.hostId === p.id) return 'Chủ phòng không cần bật Ready.';
      if (!validObject(value) || typeof value.ready !== 'boolean') return 'Trạng thái Ready không hợp lệ.';
      p.ready = value.ready; sync(p.room); return {};
    });
    request('roles:config:get', (_, p) => {
      if (!p) return 'Bạn chưa tham gia phòng.';
      return configState(p.room);
    });
    request('roles:config:update', (value, p) => {
      if (!p || p.room.hostId !== p.id) return 'Chỉ chủ phòng được lưu cấu hình vai trò.';
      if (p.room.status !== 'waiting') return 'Không thể sửa bộ thẻ khi trận đã bắt đầu.';
      if (!validObject(value)) return 'Cấu hình bộ thẻ không hợp lệ.';
      const error = validateRoleConfig(value.config, p.room.players.length); if (error) return error;
      // Copy only the validated, supported keys. Never accept role assignments.
      p.room.roleConfig = Object.fromEntries(ROLES.map(role => [role.id, value.config[role.id]??0]));
      p.room.roleConfigCustomized = true;
      for (const member of p.room.players) member.socket?.emit('roles:config:updated', configState(p.room));
      sync(p.room); return configState(p.room);
    });
    request('time:config:update',(value,p)=>{
      if(!p||p.room.hostId!==p.id)return 'Chỉ Host được chỉnh thời gian.';
      if(p.room.status!=='waiting')return 'Cài đặt thời gian đã khóa khi trận bắt đầu.';
      if(!validObject(value)||Object.keys(value).some(k=>!['config','gameId'].includes(k)))return 'Payload thời gian không hợp lệ.';
      const error=validateTimeConfig(value.config);if(error)return error;
      p.room.timeConfig={...value.config};sync(p.room);return {timeConfig:{...p.room.timeConfig}};
    });
    if (allowDevTest) request('dev:test:configure', (value,p) => {
      if (!p || p.room.hostId !== p.id || !localTestSocket(socket)) return 'Chỉ Host localhost được cấu hình phòng test.';
      if (!validObject(value) || value.gameId !== p.room.gameId || Object.keys(value).some(k=>!['gameId','speed'].includes(k))) return 'Yêu cầu test không hợp lệ.';
      if (p.room.status !== 'waiting') return 'Chỉ chỉnh timer trước khi bắt đầu trận.';
      if (![.5,1,2,5].includes(value.speed)) return 'Tốc độ test không hợp lệ.';
      p.room.testSpeed = value.speed; p.room.testTiming = testDurations(value.speed); sync(p.room); return {};
    });
    const start = (_, p) => {
      if (!p || p.room.hostId !== p.id) return 'Chỉ chủ phòng được bắt đầu.';
      const reason = startReason(p.room); if (reason) return reason;
      const room = p.room;
      // Synchronous validation + commit prevent concurrent starts from dealing twice.
      room.roleAssignments = dealRoles(room.roleConfig, room.players);
      room.status = 'playing';
      for (const member of room.players) member.socket.emit('game:role-assigned', privateRole(room, member.id));
      room.engine = createGameEngine(room, { durations: {...timing,...timeDurations(room.timeConfig),...durations,...room.testTiming}, clock: engineClock, onChange: change => {
        sync(room);
        if (change.finished) for (const member of room.players) member.socket?.emit('game:finished', change.finished);
        if (change.nightResolved) for (const member of room.players) if (member.socket) {
          member.socket.emit('game:night:resolved', change.nightResolved);
          member.socket.emit('game:day:announcement', change.nightResolved);
        }
        if (!change.progressOnly) for (const member of room.players) if (member.socket) {
          if (change.phaseChanged) member.socket.emit('game:phase-changed', room.engine.publicState());
          member.socket.emit('game:step-changed', room.engine.publicState());
        }
      } });
      room.engine.start();
      for (const member of room.players) member.socket.emit('game:started', { roomCode: room.code, status: 'playing', phase: 'role_reveal' });
      return { eligible: true, message: 'Đã phân vai bí mật. Hãy xem thẻ của bạn.', roomCode: room.code };
    };
    request('room:start-request', start); request('game:start', start);
    request('game:rematch-request', (value,p) => {
      if (!p || p.room.hostId !== p.id) return 'Chỉ chủ phòng được yêu cầu chơi lại.';
      const room = p.room;
      if (Object.keys(value).some(key => key !== 'gameId')) return 'Yêu cầu chơi lại không hợp lệ.';
      if (room.status !== 'finished' || room.engine?.publicState().phase !== 'game_over') return 'Chỉ được chơi lại khi trận đã kết thúc.';
      room.engine.dispose(); room.engine = null; room.roleAssignments = null; room.roleStates=null;
      room.status = 'waiting'; room.gameId = crypto.randomUUID(); room.gameVersion++;
      room.publicChat = [];
      for (const member of room.players) { member.alive = true; member.ready = false; }
      refreshDefault(room); sync(room);
      for (const member of room.players) member.socket?.emit('game:rematch-started', {roomCode:room.code,gameId:room.gameId,gameVersion:room.gameVersion,phase:'lobby'});
      return {gameId:room.gameId};
    });
    request('game:state-request', (_, p) => {
      if (!p || !p.room.engine) return 'Bạn chưa tham gia trận đang chạy.';
      const gameState = p.room.engine.privateState(p); socket.emit('game:state', gameState); return { gameState };
    });
    request('game:step-complete', (value, p) => {
      if (!p || !p.room.engine) return 'Bạn chưa tham gia trận đang chạy.';
      if (!validObject(value) || Object.keys(value).some(key => !['phaseVersion','gameId'].includes(key)) || !Number.isSafeInteger(value.phaseVersion)) return 'Yêu cầu xác nhận lượt không hợp lệ.';
      const error = p.room.engine.complete(p, value.phaseVersion); if (error) return error;
      return { message: 'Đã bỏ qua lượt, không dùng kỹ năng.' };
    });
    request('game:ability:submit', (value, p) => {
      if (!p || !p.room.engine) return 'Bạn chưa tham gia trận đang chạy.';
      const response = p.room.engine.submitAbility(p, value);
      if (response.error) return response.error;
      socket.emit('game:ability:result', response.result);
      return { result: response.result };
    });
    for (const [event, kind] of Object.entries({'game:nominate':'nominate','game:defense:end':'defense','game:execution:vote':'vote','game:hunter:shoot':'shoot','game:last-words:end':'lastWords'})) request(event, (payload,p) => {
      if (!p?.room.engine) return 'Bạn chưa tham gia trận đang chạy.';
      return p.room.engine.dayAction(p, kind, payload) || {};
    });
    request('chat:public', (raw, p) => {
      if (!p || !p.room.engine?.canChat(p)) return 'Chat chung chỉ mở cho người còn sống trong thảo luận ban ngày.';
      {
        if (!validObject(raw) || Object.keys(raw).some(k => !['gameId','text','phaseVersion'].includes(k)) || raw.phaseVersion !== p.room.engine.publicState().phaseVersion) return 'Tin nhắn thuộc lượt cũ hoặc không hợp lệ.';
        raw = raw.text;
      }
      if (typeof raw !== 'string' || raw.trim().length < 1 || raw.trim().length > 240) return 'Tin nhắn phải có 1–240 ký tự.';
      const text = raw.trim().replace(/[<>]/g, ''); if (!text) return 'Tin nhắn không hợp lệ.';
      p.room.publicChat.push({ id: crypto.randomUUID(), sender: p.name, text, time: new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()) });
      p.room.publicChat = p.room.publicChat.slice(-80); sync(p.room); return {};
    });
    for (const event of ['phase:set', 'phase:resolve', 'night:finish', 'night:target', 'seer:inspect', 'witch:act', 'vote:cast', 'chat:wolf', 'game:finished', 'game:result']) request(event, () => 'Chức năng chưa được triển khai. Client không được tự chuyển giai đoạn hoặc dùng kỹ năng.');
    socket.on('disconnect', () => {
      const p = socket.data.lobbyPlayer; if (!p || p.socket !== socket) return;
      p.connected = false; p.socket = null; p.room.engine?.participantsChanged(); sync(p.room);
      p.timer = setTimeout(() => remove(p), reconnectMs); p.timer.unref();
    });
  });
  io.httpServer?.once('close', close);
  return { rooms, close };
}
