// Server-owned identities; original assignments remain immutable for rematches/results.
export const wolfRoles = new Set(['werewolf','white_wolf','cursed_wolf']);
export function ensureRoleStates(room) {
  if (!room.roleStates) room.roleStates = new Map(room.players.map(p => {
    const role=room.roleAssignments.get(p.id);
    return [p.id,{originalRole:role,currentRole:role,currentFaction:wolfRoles.has(role)?'wolves':role==='angel'?'independent':'village',abilities:[role],abilityUsage:{},winConditions:role==='angel'?['first_day_execution']:role==='white_wolf'?['sole_wolf','faction']:['faction'],roleState:{}}];
  }));
  return room.roleStates;
}
export const stateFor=(room,p)=>ensureRoleStates(room).get(typeof p==='string'?p:p.id);
export const factionFor=(room,p)=>stateFor(room,p)?.currentFaction;
export const currentRoleFor=(room,p)=>stateFor(room,p)?.currentRole;
export function ownAssignment(room,id) {
 const s=stateFor(room,id);if(!s)return null;
 return {role:s.currentRole,team:s.currentFaction,originalRole:s.originalRole,currentRole:s.currentRole,currentFaction:s.currentFaction,abilities:[...s.abilities],abilityUsage:{...s.abilityUsage},winConditions:[...s.winConditions],roleState:{...s.roleState}};
}
export function becomeVillager(state) {state.currentRole='villager';state.currentFaction='village';state.abilities=['villager'];state.winConditions=['faction'];}
