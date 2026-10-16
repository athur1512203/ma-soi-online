import {gameDurations} from '../game-config.js';
export function testDurations(speed=1) {
  if(![.5,1,2,5].includes(speed))throw new Error('Tốc độ test không hợp lệ.');
  const base={role_reveal:5000,night_start:1000,cupid:5000,lovers_notice:1000,guard:5000,seer:5000,werewolf:5000,witch:5000,night_resolve:1000,day_start:1000,day_discussion:10000,nomination_vote:10000,defense:5000,execution_vote:10000,day_result:1000,triggered_abilities:5000,last_words:5000,next_night:1000};
  return gameDurations(Object.fromEntries(Object.entries(base).map(([k,v])=>[k,Math.round(v/speed)])));
}
export function localTestSocket(socket) {
 const address=socket.handshake.address;
 const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
 const origin=socket.handshake.headers?.origin;
 return local&&(!origin||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}
