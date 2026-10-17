import {currentRoleFor,factionFor,ownAssignment,stateFor} from './role-state.js';
import { randomUUID } from 'node:crypto';
import { checkWinner, winnerReasons } from './game-result.js';
import { gameDurations } from './game-config.js';
import { createNightAbilities } from './night-abilities.js';

export const nightSteps = nightNumber => [
  ...(nightNumber === 1 ? ['wolf_dog', 'wild_child', 'cupid', 'lovers_notice'] : []),
  'guard', 'seer', 'werewolf', 'cursed_wolf',
  ...(nightNumber % 2 === 1 ? ['white_wolf'] : []), 'witch',
];

// Each engine owns its flow and private ability state; sockets remain in lobby.js.
export function createGameEngine(room, { durations, onChange = () => {}, clock = { now: Date.now, setTimeout, clearTimeout } } = {}) {
  const timing = gameDurations(durations);
  let timer = null, disposed = false, started = false, queue = [], announcement = null;
  let phase = null, currentStep = null, nightNumber = 0, dayNumber = 0, phaseVersion = room.phaseSerial || 0;
  let stepStartedAt = null, stepEndsAt = null;
  const gameId = room.gameId || randomUUID();
  let result = null, angelWinner=null;
  const roster = room.players.map(p => ({player:p, id:p.id, name:p.name, seatIndex:p.seatIndex, role:room.roleAssignments.get(p.id)}));
  const completed = new Set();
  function finishIfDecided() {
    if (disposed || result || hunters.length || lastWords.length) return !!result;
    const living = room.players.filter(p => p.alive !== false);
    const wolves = living.filter(p => factionFor(room,p) === 'wolves').length;
    let winner = angelWinner ? 'ANGEL_WIN' : checkWinner(wolves, living.length - wolves);
    const white=living.find(p=>currentRoleFor(room,p)==='white_wolf'&&factionFor(room,p)==='wolves');
    if(winner==='WEREWOLF_WIN'&&wolves===1&&white)winner='WHITE_WOLF_WIN';
    if (winner === 'CONTINUE') return false;
    result = {gameId, winner, reason:winner==='ANGEL_WIN'?'first_day_execution':winner==='WHITE_WOLF_WIN'?'sole_wolf_controls_village':winnerReasons[winner], endedAt:clock.now(), dayNumber, nightNumber,
      aliveWolves:wolves, aliveVillagers:living.length-wolves,
      winnerIds:roster.filter(({player,id})=>winner==='ANGEL_WIN'?id===angelWinner:winner==='WHITE_WOLF_WIN'?id===white.id:winner==='DRAW'?false:winner==='WEREWOLF_WIN'?factionFor(room,player)==='wolves':factionFor(room,player)==='village').map(p=>p.id),
      players:roster.map(({player,...p}) => ({...p,originalRole:p.role,currentRole:currentRoleFor(room,p.id),currentFaction:factionFor(room,p.id),team:factionFor(room,p.id)==='wolves'?'werewolf':factionFor(room,p.id),alive:room.players.includes(player) && player.alive !== false}))};
    room.status = 'finished'; speaker = null;
    enter('game_over', null, null, {finished:result});
    return true;
  }
  let candidate = null, nominationRound = 1, runoff = null, verdict = null, speaker = null, aftermathDestination = 'next_night';
  const nominations = new Map(), judgments = new Map(), lostVote = new Set(), idiotUsed = new Set(), hunterUsed = new Set();
  const hunters = [], lastWords = [];
  const identity = p => p ? {id:p.id,name:p.name} : null;
  const eligible = p => room.players.includes(p) && alive(p) && !lostVote.has(p.id);
  const executionEligible = p => eligible(p) && p.id !== candidate?.id;
  const nominationTargets = p => room.players.filter(t => alive(t) && t.id !== p.id && (!runoff || runoff.includes(t.id)));
  const inTime = () => !disposed && started && stepEndsAt !== null && clock.now() < stepEndsAt;
  function dayError(p, payload, expected, fields) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(k => !fields.includes(k))) return 'Payload không hợp lệ.';
    if ((payload.gameId !== undefined && payload.gameId !== gameId) || !inTime() || phase !== expected || payload.phaseVersion !== phaseVersion || !Number.isSafeInteger(payload.phaseVersion)) return 'Lượt cũ hoặc đã hết hạn.';
    if (!room.players.includes(p) || !p.connected) return 'Bạn không có quyền hành động.';
    return null;
  }
  function collectDeaths(daytime) {
    for (const death of abilities.drainDeaths()) {
      const p = room.players.find(p => p.id === death.id);
      if (!p) continue;
      if (room.roleAssignments.get(p.id) === 'hunter' && !death.poisoned && !hunterUsed.has(p.id)) { hunterUsed.add(p.id);stateFor(room,p).abilityUsage.hunter=1; hunters.push(p.id); }
      if (daytime && !lastWords.includes(p.id)) lastWords.push(p.id);
    }
  }
  function aftermath(destination = aftermathDestination) {
    aftermathDestination = destination; speaker = null;
    while (hunters.length) {
      const id = hunters.shift(), p = room.players.find(p => p.id === id);
      if (p && room.players.some(t => alive(t))) { speaker = p; return enter('triggered_abilities', null, timing.triggered_abilities); }
    }
    while (lastWords.length) {
      const id = lastWords.shift(), p = room.players.find(p => p.id === id);
      if (p) { speaker = p; return enter('last_words', null, timing.last_words); }
    }
    if (finishIfDecided()) return;
    return enter(destination, null, timing[destination]);
  }
  function openNomination() {
    candidate = null; verdict = null; runoff = null; nominationRound = 1; nominations.clear(); judgments.clear();
    enter('nomination_vote', null, timing.nomination_vote);
  }
  function closeNomination() {
    const counts = new Map();
    for (const [id, targetId] of nominations) {
      const voter = room.players.find(p => p.id === id);
      if (voter && eligible(voter) && nominationTargets(voter).some(t => t.id === targetId)) counts.set(targetId, (counts.get(targetId) || 0) + 1);
    }
    const max = Math.max(0, ...counts.values()), tied = [...counts].filter(([,n]) => n === max).map(([id]) => id);
    if (!tied.length || (tied.length > 1 && nominationRound === 2)) {
      verdict = {decision:'NO_NOMINATION', message: tied.length ? 'Hòa lần hai. Không đề cử ai.' : 'Không có phiếu đề cử hợp lệ.'};
      return enter('day_result', null, timing.day_result);
    }
    if (tied.length > 1) { runoff = tied; nominationRound = 2; nominations.clear(); return enter('nomination_vote', null, timing.nomination_vote); }
    candidate = room.players.find(p => p.id === tied[0]);
    return enter('defense', null, timing.defense);
  }
  function closeExecution() {
    let execute = 0, pardon = 0;
    for (const [id, choice] of judgments) {
      const p = room.players.find(p => p.id === id);
      if (p && executionEligible(p)) choice === 'EXECUTE' ? execute++ : pardon++;
    }
    const approved = execute > (execute + pardon) / 2 && candidate && alive(candidate);
    let survived = false, eliminated = [];
    if (approved) {
      if (room.roleAssignments.get(candidate.id) === 'idiot' && !idiotUsed.has(candidate.id)) { idiotUsed.add(candidate.id); lostVote.add(candidate.id); survived = true; }
      else {if(dayNumber===1&&currentRoleFor(room,candidate)==='angel')angelWinner=candidate.id;eliminated = abilities.eliminate([candidate.id], 'execution');}
    }
    verdict = {decision: approved ? 'EXECUTE' : 'PARDON', execute, pardon, valid:execute+pardon, survived, eliminated,
      message: approved ? survived ? candidate.name + ' sống sót và mất quyền bỏ phiếu.' : candidate.name + ' bị treo cổ.' : 'Tha cho ' + (candidate?.name || 'ứng viên') + '.'};
    collectDeaths(true);
    return enter('day_result', null, timing.day_result);
  }
  const alive = p => p.alive !== false;
  const abilities = createNightAbilities(room);
  // A temporary disconnect keeps the player's action slot until the timer expires.
  const actors = () => room.players.filter(p => alive(p) && abilities.canAct(p, currentStep));
  const actionStep = () => phase === 'night_actions' && currentStep !== 'lovers_notice';
  const canChat = player => room.players.includes(player) && player.connected && inTime() && (phase === 'day_discussion' && alive(player) || phase === 'defense' && candidate?.id === player.id && alive(player) || phase === 'last_words' && speaker?.id === player.id);
  const publicState = () => ({ roomCode: room.code, gameId, result, phase, nightNumber, dayNumber, phaseVersion, stepStartedAt, stepEndsAt, serverNow: clock.now(), abilitiesImplemented: true, awaitingDayResolution: false, candidate: identity(candidate), nominationRound, runoffCandidates: runoff ? room.players.filter(p => runoff.includes(p.id)).map(identity) : [], dayResult: verdict, speaker: identity(speaker), announcement: dayNumber === nightNumber ? announcement : null });
  function privateState(player) {
    const ownsTurn = !disposed && actionStep() && alive(player) && player.connected && abilities.canAct(player, currentStep);
    const hasCompleted = ownsTurn && completed.has(player.id);
    return { ...publicState(), dayAction: {
      canNominate: phase === 'nomination_vote' && inTime() && player.connected && eligible(player) && !nominations.has(player.id),
      targets: phase === 'nomination_vote' ? nominationTargets(player).map(identity) : phase === 'triggered_abilities' && speaker?.id === player.id ? room.players.filter(alive).map(identity) : [],
      hasVoted: phase === 'nomination_vote' ? nominations.has(player.id) : phase === 'execution_vote' ? judgments.has(player.id) : false,
      canEndDefense: phase === 'defense' && inTime() && player.connected && candidate?.id === player.id && alive(player),
      canVote: phase === 'execution_vote' && inTime() && player.connected && executionEligible(player) && !judgments.has(player.id),
      canShoot: phase === 'triggered_abilities' && inTime() && player.connected && speaker?.id === player.id,
      canEndLastWords: phase === 'last_words' && inTime() && player.connected && speaker?.id === player.id,
      votingRight: !lostVote.has(player.id),
    }, assignment:ownAssignment(room,player.id), actionStep: ownsTurn ? currentStep : null, canComplete: ownsTurn && !hasCompleted && clock.now() < stepEndsAt, hasCompleted, canPublicChat: canChat(player), ability: ownsTurn ? abilities.abilityFor(player, currentStep, hasCompleted) : null, ...abilities.privateExtras(player) };
  }
  function enter(nextPhase, step, duration, events = {}) {
    if (disposed || (phase === 'game_over')) return;
    clock.clearTimeout(timer); timer = null;
    const previousPhase = phase;
    phase = nextPhase; currentStep = step; phaseVersion++; room.phaseSerial = phaseVersion;
    completed.clear(); stepStartedAt = clock.now(); stepEndsAt = duration !== null && duration !== undefined ? stepStartedAt + duration : null;
    const version = phaseVersion;
    if (duration !== null && duration !== undefined) {
      timer = clock.setTimeout(() => {
        if (!disposed && version === phaseVersion) { timer = null; advance(); }
      }, duration);
      timer?.unref?.();
    }
    onChange({ phaseChanged: previousPhase !== phase, ...events });
  }
  function beginNight() {
    candidate = null; verdict = null; speaker = null; runoff = null;
    nightNumber++; queue = nightSteps(nightNumber); abilities.begin(nightNumber);
    enter('night_start', null, timing.night_start);
  }
  function nextNightStep() {
    while (queue.length) {
      const step = queue.shift();
      if (step === 'lovers_notice') {
        if (abilities.hasLovers()) { abilities.notifyLovers(); return enter('night_actions', step, timing[step]); }
      } else if (room.players.some(p => abilities.canAct(p, step))) {
        return enter('night_actions', step, timing[step]);
      }
    }
    enter('night_resolve', null, timing.night_resolve);
  }
  function advance() {
    if (disposed) return;
    switch (phase) {
      case 'role_reveal': return beginNight();
      case 'night_start': return nextNightStep();
      case 'night_actions': abilities.closeStep(currentStep); return nextNightStep();
      case 'night_resolve':
        announcement = abilities.resolve(); dayNumber = nightNumber; collectDeaths(false);
        return enter('day_start', null, timing.day_start, { nightResolved: announcement });
      case 'day_start': return aftermath('day_discussion');
      case 'day_discussion': return openNomination();
      case 'nomination_vote': return closeNomination();
      case 'defense': judgments.clear(); return enter('execution_vote', null, timing.execution_vote);
      case 'execution_vote': return closeExecution();
      case 'day_result': if(dayNumber===1&&!angelWinner)abilities.endFirstDay();return aftermath('next_night');
      case 'triggered_abilities': case 'last_words': return aftermath();
      case 'next_night': return beginNight();
    }
  }
  function actionError(player, version) {
    if (disposed || !started) return 'Trận chưa sẵn sàng.';
    if (!Number.isSafeInteger(version) || version !== phaseVersion) return 'Yêu cầu thuộc lượt cũ hoặc không hợp lệ.';
    if (!actionStep() || clock.now() >= stepEndsAt) return 'Lượt đã kết thúc hoặc không có lượt để xác nhận.';
    if (!room.players.includes(player) || !alive(player) || !player.connected || !abilities.canAct(player,currentStep)) return 'Bạn không có quyền xác nhận lượt này.';
    return null;
  }
  function finishAction(player) {
    completed.add(player.id);
    if (actors().every(p => completed.has(p.id))) advance();
    else onChange({ phaseChanged: false, progressOnly: true });
  }
  function complete(player, version) {
    const error = actionError(player, version); if (error) return error;
    if (completed.has(player.id)) return 'Bạn đã xác nhận lượt này.';
    const skipped = abilities.skip(player, currentStep); if (skipped) return skipped;
    finishAction(player);
    return null;
  }
  return {
    start() { if (started || disposed) return false; started = true; enter('role_reveal', null, timing.role_reveal); return true; },
    publicState, privateState, canChat, complete,
    dayAction(p, kind, payload) {
      const expected = {nominate:'nomination_vote',defense:'defense',vote:'execution_vote',shoot:'triggered_abilities',lastWords:'last_words'}[kind];
      const error = dayError(p, payload, expected, ['gameId', 'phaseVersion', ...(kind === 'nominate' || kind === 'shoot' ? ['targetId'] : kind === 'vote' ? ['choice'] : [])]);
      if (error) return error;
      if (kind === 'nominate') {
        if (!eligible(p) || nominations.has(p.id) || !nominationTargets(p).some(t => t.id === payload.targetId)) return 'Đề cử không hợp lệ hoặc đã bỏ phiếu.';
        nominations.set(p.id, payload.targetId);
      } else if (kind === 'vote') {
        if (!executionEligible(p) || judgments.has(p.id) || !['EXECUTE','PARDON'].includes(payload.choice)) return 'Phiếu không hợp lệ hoặc đã bỏ phiếu.';
        judgments.set(p.id, payload.choice);
      } else if (kind === 'defense') {
        if (candidate?.id !== p.id || !alive(p)) return 'Chỉ ứng viên được kết thúc biện hộ.';
        advance(); return null;
      } else if (kind === 'lastWords') {
        if (speaker?.id !== p.id) return 'Không phải lượt trăn trối của bạn.';
        advance(); return null;
      } else if (kind === 'shoot') {
        if (speaker?.id !== p.id || !(payload.targetId === null || room.players.some(t => alive(t) && t.id === payload.targetId))) return 'Mục tiêu hoặc quyền bắn không hợp lệ.';
        const eliminated = payload.targetId ? abilities.eliminate([payload.targetId], 'hunter') : [];
        if (verdict && eliminated.length) verdict = {...verdict, eliminated:[...(verdict.eliminated || []), ...eliminated]};
        if (aftermathDestination === 'day_discussion' && eliminated.length) announcement = {...announcement, eliminated:[...announcement.eliminated,...eliminated],message:announcement.message + ' Thợ Săn đã bắn: ' + eliminated.map(p => p.name).join(', ') + '.'};
        collectDeaths(aftermathDestination === 'next_night'); aftermath(); return null;
      }
      onChange({phaseChanged:false,progressOnly:true}); return null;
    },
    submitAbility(player, payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'Payload kỹ năng không hợp lệ.' };
      if (payload.gameId !== undefined && payload.gameId !== gameId) return {error:'Yêu cầu thuộc trận cũ.'};
      const error = actionError(player, payload.phaseVersion); if (error) return { error };
      if (!abilities.canAct(player, currentStep)) return { error: 'Kỹ năng không còn khả dụng trong lượt này.' };
      const result = abilities.submit(player, currentStep, payload);
      if (result.error) return result;
      finishAction(player); return result;
    },
    participantsChanged() {
      abilities.refreshFactions();
      if (disposed || !actionStep()) return;
      if (actors().every(p => completed.has(p.id))) advance();
    },
    dispose() { disposed = true; clock.clearTimeout(timer); timer = null; },
  };
}
