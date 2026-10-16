// Milliseconds. Server-owned defaults; tests can inject shorter durations.
export const GAME_DURATIONS = Object.freeze({
  role_reveal: 8000,
  night_start: 5000,
  cupid: 30000,
  lovers_notice: 10000,
  guard: 30000,
  seer: 30000,
  werewolf: 45000,
  witch: 30000,
  night_resolve: 5000,
  day_start: 5000,
  day_discussion: 180000,
  day_end: 1000,
  nomination_vote: 30000,
  defense: 60000,
  execution_vote: 30000,
  day_result: 5000,
  triggered_abilities: 30000,
  last_words: 30000,
  next_night: 3000,
});

export function gameDurations(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Invalid game duration config');
  if (Object.keys(overrides).some(key => !Object.hasOwn(GAME_DURATIONS, key))) throw new Error('Unknown game duration');
  const result = { ...GAME_DURATIONS, ...overrides };
  for (const value of Object.values(result)) if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new Error('Game durations must be positive integer milliseconds');
  return Object.freeze(result);
}
