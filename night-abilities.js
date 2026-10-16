// Server-only private match data. Only explicit serializers may leave this module.
export function createNightAbilities(room) {
  const roleOf = p => room.roleAssignments.get(p.id);
  const living = () => room.players.filter(p => p.alive !== false);
  const target = id => living().find(p => p.id === id);
  const identity = p => p ? { id: p.id, name: p.name } : null;
  let night = null, lovers = null, loversNotified = false, cupidUsed = false, announcement = null;
  const guardHistory = new Map(), potions = new Map(), elderResistance = new Set();
  const seerResults = new Map(), results = new Map();
  for (const p of room.players) {
    if (roleOf(p) === 'witch') potions.set(p.id, { save: true, poison: true });
    if (roleOf(p) === 'elder') elderResistance.add(p.id);
  }
  function begin(number) {
    night = { number, actions: new Map(), wolfVotes: new Map(), wolfTarget: null, guardTarget: null, saved: false, poisonTarget: null, resolved: false };
  }
  function targetsFor(p, step) {
    return living().filter(candidate => step === 'werewolf' ? roleOf(candidate) !== 'werewolf'
      : step === 'witch' ? candidate.id !== p.id
      : step === 'guard' ? !(guardHistory.get(p.id)?.number === night.number - 1 && guardHistory.get(p.id)?.targetId === candidate.id)
      : true);
  }
  function witchOptions(p) {
    const remaining = potions.get(p.id) || { save: false, poison: false };
    const victim = target(night.wolfTarget);
    return { potions: { ...remaining }, victim: identity(victim), canSave: remaining.save && !!victim && (victim.id !== p.id || night.number === 1), canPoison: remaining.poison && targetsFor(p, 'witch').length > 0 };
  }
  function canAct(p, step) {
    if (!night || p.alive === false || roleOf(p) !== step) return false;
    if (step === 'cupid') return night.number === 1 && !cupidUsed && living().length >= 2;
    if (step === 'witch') { const options = witchOptions(p); return options.canSave || options.canPoison; }
    return ['guard', 'seer', 'werewolf'].includes(step) && targetsFor(p, step).length > 0;
  }
  function submit(p, step, payload) {
    const allowed = step === 'cupid' ? ['gameId', 'phaseVersion', 'targetIds'] : step === 'witch' ? ['gameId', 'phaseVersion', 'save', 'poisonTargetId'] : ['gameId', 'phaseVersion', 'targetId'];
    if (Object.keys(payload).some(key => !allowed.includes(key))) return { error: 'Payload kỹ năng có trường không hợp lệ.' };
    const previous = night.actions.get(p.id);
    if (previous && step !== 'werewolf') return { error: 'Bạn đã xác nhận kỹ năng trong đêm này.' };
    let action, result;
    if (step === 'cupid') {
      const ids = payload.targetIds;
      if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1] || !ids.every(id => typeof id === 'string' && target(id))) return { error: 'Cupid phải chọn đúng hai người khác nhau, tồn tại và còn sống.' };
      if (cupidUsed || night.number !== 1) return { error: 'Cupid chỉ ghép đôi một lần trong đêm đầu.' };
      lovers = [...ids]; cupidUsed = true;
      action = { targetIds: [...ids] };
      result = { type: step, nightNumber: night.number, message: 'Đã xác nhận ghép đôi.', selected: ids.map(id => identity(target(id))) };
    } else if (step === 'witch') {
      if (typeof payload.save !== 'boolean' || !(payload.poisonTargetId === null || typeof payload.poisonTargetId === 'string')) return { error: 'Cần gửi save dạng boolean và poisonTargetId dạng ID hoặc null.' };
      const options = witchOptions(p);
      if (payload.save && !options.potions.save) return { error: 'Bình cứu đã hết.' };
      if (payload.save && !options.victim) return { error: 'Không có mục tiêu Sói để cứu.' };
      if (payload.save && !options.canSave) return { error: 'Chỉ được tự cứu trong đêm đầu tiên.' };
      if (payload.poisonTargetId !== null && !options.potions.poison) return { error: 'Bình độc đã hết.' };
      if (payload.poisonTargetId !== null && (!options.canPoison || !targetsFor(p, step).some(t => t.id === payload.poisonTargetId))) return { error: 'Không thể dùng bình độc cho mục tiêu này.' };
      // Validate everything before spending either potion. Synchronous commit is atomic.
      const remaining = potions.get(p.id);
      if (payload.save) { remaining.save = false; night.saved = true; }
      if (payload.poisonTargetId !== null) { remaining.poison = false; night.poisonTarget = payload.poisonTargetId; }
      action = { save: payload.save, poisonTargetId: payload.poisonTargetId };
      result = { type: step, nightNumber: night.number, message: payload.save || payload.poisonTargetId !== null ? 'Đã xác nhận dùng thuốc.' : 'Đã bỏ qua, không dùng thuốc.' };
    } else {
      if (typeof payload.targetId !== 'string' || !targetsFor(p, step).some(t => t.id === payload.targetId)) return { error: 'Mục tiêu không hợp lệ hoặc không được chọn trong lượt này.' };
      const chosen = target(payload.targetId);
      action = { targetId: chosen.id };
      if (step === 'guard') {
        night.guardTarget = chosen.id; guardHistory.set(p.id, { number: night.number, targetId: chosen.id });
        result = { type: step, nightNumber: night.number, message: `Đã bảo vệ ${chosen.name}.` };
      } else if (step === 'seer') {
        const check = { nightNumber: night.number, target: identity(chosen), isWolf: roleOf(chosen) === 'werewolf' };
        seerResults.set(p.id, check);
        result = { type: step, ...check, message: check.isWolf ? 'Thuộc phe Ma Sói' : 'Không thuộc phe Ma Sói' };
      } else if (step === 'werewolf') {
        if (night.wolfVotes.get(p.id) === chosen.id) return { error: 'Bạn đã chọn mục tiêu này.' };
        night.wolfVotes.set(p.id, chosen.id);
        result = { type: step, nightNumber: night.number, message: `Đã chọn ${chosen.name}. Bạn có thể đổi phiếu khi lượt còn mở.` };
      } else return { error: 'Vai trò không có kỹ năng ban đêm.' };
    }
    night.actions.set(p.id, action); results.set(p.id, result);
    return { result };
  }
  function skip(p, step) {
    if (night.actions.has(p.id)) return 'Bạn đã xác nhận lượt này.';
    night.actions.set(p.id, { skipped: true });
    results.set(p.id, { type: step, nightNumber: night.number, message: 'Đã bỏ qua lượt; không dùng kỹ năng.' });
    return null;
  }
  function closeStep(step) {
    if (step === 'cupid') cupidUsed = true;
    if (step !== 'werewolf') return;
    const counts = new Map();
    for (const [id, targetId] of night.wolfVotes) {
      const wolf = target(id), victim = target(targetId);
      if (wolf && roleOf(wolf) === 'werewolf' && victim && roleOf(victim) !== 'werewolf') counts.set(targetId, (counts.get(targetId) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    night.wolfTarget = ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
  }
  function resolve() {
    if (night.resolved) return announcement;
    night.resolved = true;
    const deaths = new Set(), victim = target(night.wolfTarget);
    if (victim && victim.id !== night.guardTarget && !night.saved) {
      if (roleOf(victim) === 'elder' && elderResistance.has(victim.id)) elderResistance.delete(victim.id);
      else deaths.add(victim.id);
    }
    const poisoned = target(night.poisonTarget); if (poisoned) deaths.add(poisoned.id);
    const eliminated = eliminate([...deaths], 'night', new Set(poisoned ? [poisoned.id] : []));
    announcement = { nightNumber: night.number, eliminated, message: eliminated.length ? `Những người bị loại trong đêm: ${eliminated.map(p => p.name).join(', ')}.` : 'Đêm qua là một đêm bình yên' };
    return announcement;
  }
  const deathRecords = [];
  function eliminate(ids, cause, poisoned = new Set()) {
    const pending = [...new Set(ids)], eliminated = [];
    for (const id of pending) {
      const p = target(id); if (!p) continue;
      p.alive = false; eliminated.push(identity(p));
      deathRecords.push({ id, cause, poisoned: poisoned.has(id) });
      const partner = lovers?.includes(id) ? lovers.find(other => other !== id) : null;
      if (partner && target(partner) && !pending.includes(partner)) pending.push(partner);
    }
    return eliminated;
  }
  function abilityFor(p, step, completed) {
    const options = step === 'witch' ? witchOptions(p) : {};
    return { type: step, targets: targetsFor(p, step).map(identity), selected: night.actions.get(p.id) || null, canSubmit: canAct(p, step) && (!completed || step === 'werewolf'), ...options,
      ...(step === 'werewolf' ? { teammates: living().filter(t => roleOf(t) === 'werewolf').map(t => ({ ...identity(t), hasSelected: night.actions.has(t.id), connected: t.connected })) } : {}),
    };
  }
  return {
    begin, canAct, submit, skip, closeStep, resolve, abilityFor, eliminate,
    drainDeaths() { return deathRecords.splice(0); },
    hasLovers: () => !!lovers,
    notifyLovers() { loversNotified = !!lovers; },
    privateExtras(p) {
      const partnerId = loversNotified && lovers?.includes(p.id) ? lovers.find(id => id !== p.id) : null;
      return { lover: identity(room.players.find(t => t.id === partnerId)), seerResult: roleOf(p) === 'seer' ? seerResults.get(p.id) || null : null, abilityResult: results.get(p.id) || null };
    },
  };
}
