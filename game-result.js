// The role catalog keeps its historical "wolves" team; match results use the
// canonical Rules 06 team ID without changing role dealing or night abilities.
export const teamForRole = role => role === 'werewolf' ? 'werewolf' : 'village';

export function checkWinner(aliveWolves, aliveVillagers) {
  if (aliveWolves === 0 && aliveVillagers === 0) return 'DRAW';
  if (aliveWolves === 0) return 'VILLAGE_WIN';
  if (aliveWolves >= aliveVillagers) return 'WEREWOLF_WIN';
  return 'CONTINUE';
}

export const winnerReasons = Object.freeze({
  DRAW: 'no_survivors',
  VILLAGE_WIN: 'all_werewolves_eliminated',
  WEREWOLF_WIN: 'werewolves_control_village',
});
