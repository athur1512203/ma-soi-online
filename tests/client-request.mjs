// Encode the current match like the UI does; explicit stale IDs stay untouched.
export function scopedRequest(socket, event, value) {
  const id = socket.state?.gameId;
  if (!id) return value;
  if (event === 'chat:public' && typeof value === 'string' && socket.game?.phase === 'day_discussion') return {text:value,gameId:id,phaseVersion:socket.game.phaseVersion};
  if (value && typeof value === 'object' && !Array.isArray(value)) return {gameId:id,...value};
  if (value === undefined && ['room:leave','room:start-request','game:start','game:rematch-request'].includes(event)) return {gameId:id};
  return value;
}
