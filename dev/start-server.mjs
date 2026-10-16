// Dedicated local development entry; production server defaults stay unchanged.
if(process.env.NODE_ENV==='production')throw new Error('Bot Test không chạy trong production.');
process.env.DEV_BOT_TEST='1';
await import('../server.js');
