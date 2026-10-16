await import('./room-flow.test.mjs');
await import('./create-room-client.test.mjs');
await import('./create-room-sockets.test.mjs');
import { spawn } from 'node:child_process';

// Legacy gameplay suites remain preserved for a future gameplay engine.
await import('./lobby.test.mjs');
await import('./roles.test.mjs');
await import('./game-engine.test.mjs');
await import('./game-flow.test.mjs');
await import('./night-abilities.test.mjs');
await import('./night-sockets.test.mjs');
await import('./day-rules.test.mjs');
await import('./day-sockets.test.mjs');
await import('./game-result.test.mjs');
await import('./rematch.test.mjs');
await import('./bot-security.test.mjs');
await import('./deployment.test.mjs');
const tests=['cors.test.mjs'];
const basePort=3210;
const waitForServer=async url=>{for(let i=0;i<40;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server did not start at ${url}`);};
for(let index=0;index<tests.length;index++){
  const port=basePort+index; const url=`http://localhost:${port}`;
  const server=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let errors=''; server.stderr.on('data',chunk=>{errors+=chunk;});
  try{
    await waitForServer(url);
    await new Promise((resolve,reject)=>{
      const test=spawn(process.execPath,[`tests/${tests[index]}`],{cwd:process.cwd(),env:{...process.env,TEST_SERVER_URL:url},stdio:'inherit'});
      test.once('exit',code=>code===0?resolve():reject(new Error(`${tests[index]} failed with exit code ${code}`)));
      test.once('error',reject);
    });
  } finally {
    server.kill();
    await new Promise(resolve=>server.once('exit',resolve));
  }
  if(errors) process.stderr.write(errors);
}
console.log('PASS: all isolated backend test suites');
