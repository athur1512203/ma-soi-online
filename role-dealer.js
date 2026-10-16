import { randomInt } from 'node:crypto';
import { ROLES } from './shared/roles.js';

export function dealRoles(config, players) {
  const deck = ROLES.flatMap(role => Array(config[role.id]).fill(role.id));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return new Map(players.map((player, index) => [player.id, deck[index]]));
}

export function privateRole(room, playerId) {
  const id = room.roleAssignments?.get(playerId);
  const role = ROLES.find(role => role.id === id);
  return role ? { role: role.id, team: role.team } : null;
}
