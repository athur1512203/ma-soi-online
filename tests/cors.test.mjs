import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const serverUrl = process.env.TEST_SERVER_URL || 'http://localhost:3001';
const connectWithOrigin = origin => new Promise(resolve => {
  const client = io(serverUrl, {
    forceNew: true,
    reconnection: false,
    timeout: 1500,
    transports: ['websocket'],
    extraHeaders: { Origin: origin }
  });
  client.once('connect', () => { client.disconnect(); resolve(true); });
  client.once('connect_error', () => { client.disconnect(); resolve(false); });
});

assert.equal(await connectWithOrigin('http://localhost:5173'), true, 'Local frontend origin should connect');
assert.equal(await connectWithOrigin('https://example.com'), false, 'Unknown origin should be rejected');
console.log('PASS: Socket.IO accepts configured local origins and rejects unknown origins');
