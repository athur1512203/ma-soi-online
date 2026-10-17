import {randomInt} from 'node:crypto';
import {stateFor,currentRoleFor,factionFor,becomeVillager} from './role-state.js';
// Server-only private match data. Only explicit serializers may leave this module.
export function createNightAbilities(room) {
  const roleOf = p => currentRoleFor(room,p);
  const wolf = p => factionFor(room,p)==='wolves';
  const actionKey=(p,step)=>`${p.id}:${step}`;
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
    night = { number, actions: new Map(), wolfVotes: new Map(), wolfTarget: null, guardTarget: null, saved: false, poisonTarget: null, whiteTarget:null, curse:null, resolved: false };
  }
  function targetsFor(p, step) {
    return living().filter(candidate => step === 'werewolf' ? !wolf(candidate)
      : step === 'white_wolf' ? wolf(candidate)&&candidate.id!==p.id
      : step === 'cursed_wolf' ? candidate.id===night.wolfTarget
      : step === 'wild_child' ? candidate.id!==p.id
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
    if (!night || p.alive === false) return false;
    if(step==='werewolf')return wolf(p)&&targetsFor(p,step).length>0;
    if(roleOf(p)!==step)return false;
    const state=stateFor(room,p);
    if(step==='wolf_dog')return night.number===1&&!state.roleState.chosen;
    if(step==='wild_child')return night.number===1&&!state.roleState.fosterId&&targetsFor(p,step).length>0;
    if(step==='white_wolf')return night.number%2===1&&targetsFor(p,step).length>0;
    if(step==='cursed_wolf')return !state.abilityUsage.curse&&!!target(night.wolfTarget);
    if (step === 'cupid') return night.number === 1 && !cupidUsed && living().length >= 2;
    if (step === 'witch') { const options = witchOptions(p); return options.canSave || options.canPoison; }
    return ['guard', 'seer', 'werewolf'].includes(step) && targetsFor(p, step).length > 0;
  }
  function submit(p, step, payload) {
    const allowed = step === 'wolf_dog' ? ['gameId','phaseVersion','choice'] : step === 'cupid' ? ['gameId', 'phaseVersion', 'targetIds'] : step === 'witch' ? ['gameId', 'phaseVersion', 'save', 'poisonTargetId'] : ['gameId', 'phaseVersion', 'targetId'];
    if (Object.keys(payload).some(key => !allowed.includes(key))) return { error: 'Payload kỹ năng có trường không hợp lệ.' };
    const previous = night.actions.get(actionKey(p,step));
    if (previous && step !== 'werewolf') return { error: 'Bạn đã xác nhận kỹ năng trong đêm này.' };
    let action, result;
    if(step==='wolf_dog') {
      if(!['wolves','village'].includes(payload.choice))return {error:'Hãy chọn phe Sói hoặc Dân.'};
      const state=stateFor(room,p);state.roleState.chosen=true;state.abilityUsage.choose=1;
      if(payload.choice==='wolves')state.currentFaction='wolves';else becomeVillager(state);
      action={choice:payload.choice};result={type:step,nightNumber:night.number,message:'Đã xác nhận phe '+(payload.choice==='wolves'?'Sói.':'Dân.')};
    } else if (step === 'cupid') {
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
      if (payload.save) { remaining.save = false;stateFor(room,p).abilityUsage.save=1; night.saved = true; }
      if (payload.poisonTargetId !== null) { remaining.poison = false;stateFor(room,p).abilityUsage.poison=1; night.poisonTarget = payload.poisonTargetId; }
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
        const check = { nightNumber: night.number, target: identity(chosen), isWolf: wolf(chosen) };
        seerResults.set(p.id, check);
        result = { type: step, ...check, message: check.isWolf ? 'Thuộc phe Ma Sói' : 'Không thuộc phe Ma Sói' };
      } else if (step === 'werewolf') {
        if (night.wolfVotes.get(p.id) === chosen.id) return { error: 'Bạn đã chọn mục tiêu này.' };
        night.wolfVotes.set(p.id, chosen.id);
        result = { type: step, nightNumber: night.number, message: `Đã chọn ${chosen.name}. Bạn có thể đổi phiếu khi lượt còn mở.` };
      } else if(step==='wild_child') {
        stateFor(room,p).roleState.fosterId=chosen.id;stateFor(room,p).abilityUsage.foster=1;
        result={type:step,nightNumber:night.number,message:'Cha nuôi của bạn: '+chosen.name};
      } else if(step==='white_wolf') {
        night.whiteTarget=chosen.id;result={type:step,nightNumber:night.number,message:'Đã chọn Sói để loại.'};
      } else if(step==='cursed_wolf') {
        if(stateFor(room,p).abilityUsage.curse||chosen.id!==night.wolfTarget)return {error:'Lời nguyền không hợp lệ.'};
        night.curse={casterId:p.id,targetId:chosen.id};result={type:step,nightNumber:night.number,message:'Đã chọn lời nguyền; chỉ tiêu hao nếu chuyển phe thành công.'};
      } else return { error: 'Vai trò không có kỹ năng ban đêm.' };
    }
    if(step!=='cursed_wolf'){const usage=stateFor(room,p).abilityUsage;usage[step]=(usage[step]||0)+1;}
    night.actions.set(actionKey(p,step), action); results.set(p.id, result);
    return { result };
  }
  function skip(p, step) {
    if (night.actions.has(actionKey(p,step))) return 'Bạn đã xác nhận lượt này.';
    night.actions.set(actionKey(p,step), { skipped: true });
    results.set(p.id, { type: step, nightNumber: night.number, message: 'Đã bỏ qua lượt; không dùng kỹ năng.' });
    return null;
  }
  function closeStep(step) {
    if (step === 'cupid') cupidUsed = true;
    if(step==='wolf_dog'||step==='wild_child')for(const p of living().filter(p=>roleOf(p)===step)) {
      const state=stateFor(room,p);
      if(step==='wolf_dog'&&!state.roleState.chosen){state.roleState.chosen=true;becomeVillager(state);}
      if(step==='wild_child'&&!state.roleState.fosterId){const choices=targetsFor(p,step);if(choices.length){state.roleState.fosterId=choices[randomInt(choices.length)].id;state.abilityUsage.foster=1;}}
    }
    if (step !== 'werewolf') return;
    const counts = new Map();
    for (const [id, targetId] of night.wolfVotes) {
      const wolf = target(id), victim = target(targetId);
      if (wolf && factionFor(room,wolf)==='wolves' && victim && factionFor(room,victim)!=='wolves') counts.set(targetId, (counts.get(targetId) || 0) + 1);
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
      else if(night.curse?.targetId===victim.id&&night.poisonTarget!==victim.id&&night.whiteTarget!==victim.id) {
        const caster=stateFor(room,night.curse.casterId),state=stateFor(room,victim);
        if(caster&&!caster.abilityUsage.curse){caster.abilityUsage.curse=1;state.currentFaction='wolves';state.roleState.cursed=true;}
        else deaths.add(victim.id);
      } else deaths.add(victim.id);
    }
    const whiteVictim=target(night.whiteTarget);if(whiteVictim)deaths.add(whiteVictim.id);
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
    refreshFactions();
    return eliminated;
  }
  function refreshFactions() {
    for(const p of living()) {
      const state=stateFor(room,p);
      if(state.originalRole==='wild_child'&&state.roleState.fosterId&&!state.roleState.transformed&&!target(state.roleState.fosterId)) {
        state.currentFaction='wolves';state.roleState.transformed=true;
      }
    }
  }
  function endFirstDay() {for(const p of room.players){const state=stateFor(room,p);if(state.currentRole==='angel'){const faction=state.currentFaction;becomeVillager(state);if(faction==='wolves')state.currentFaction='wolves';}}}
  function abilityFor(p, step, completed) {
    const options = step === 'witch' ? witchOptions(p) : {};
    return { type: step, targets: targetsFor(p, step).map(identity), selected: night.actions.get(actionKey(p,step)) || null, canSubmit: canAct(p, step) && (!completed || step === 'werewolf'), ...options,
      ...(step === 'werewolf' ? { teammates: living().filter(t => wolf(t)).map(t => ({ ...identity(t), hasSelected: night.actions.has(actionKey(t,'werewolf')), connected: t.connected })) } : {}),
    };
  }
  return {
    begin, canAct, submit, skip, closeStep, resolve, abilityFor, eliminate, refreshFactions, endFirstDay,
    drainDeaths() { return deathRecords.splice(0); },
    hasLovers: () => !!lovers,
    notifyLovers() { loversNotified = !!lovers; },
    privateExtras(p) {
      const partnerId = loversNotified && lovers?.includes(p.id) ? lovers.find(id => id !== p.id) : null;
      return { lover: identity(room.players.find(t => t.id === partnerId)), seerResult: roleOf(p) === 'seer' ? seerResults.get(p.id) || null : null, abilityResult: results.get(p.id) || null };
    },
  };
}
