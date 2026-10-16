export function fakeClock() {
  let time = 1000000, sequence = 0;
  const pending = new Map(), callbacks = [];
  const clock = {
    now: () => time,
    setTimeout(callback, delay) { const id = ++sequence; pending.set(id, { at: time + delay, callback }); callbacks.push(callback); return id; },
    clearTimeout(id) { pending.delete(id); },
    advance(ms) {
      const target = time + ms;
      while (true) {
        const next = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        time = next[1].at; pending.delete(next[0]); next[1].callback();
      }
      time = target;
    },
    elapseWithoutTimers(ms) { time += ms; },
    get pendingCount() { return pending.size; },
    callbacks,
  };
  return clock;
}
