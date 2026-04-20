#!/usr/bin/env node
// @asolaria/whiteroom-consumer daemon entrypoint
// Starts a WhiteroomConsumer polling the BEHCS inbox on a 10s loop.

import { WhiteroomConsumer } from './index.mjs';

const busUrl = process.env.BEHCS_SEND_URL || 'http://127.0.0.1:4947/behcs/send';
const pollUrl = process.env.BEHCS_INBOX_URL || 'http://127.0.0.1:4947/behcs/inbox';

const consumer = new WhiteroomConsumer({ busUrl, pollUrl });

const startedAt = new Date().toISOString();
console.log(JSON.stringify({ event: 'whiteroom-consumer.boot', ts: startedAt, busUrl, pollUrl }));

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ event: 'whiteroom-consumer.shutdown', signal, ts: new Date().toISOString() }));
  consumer.stop();
  setTimeout(() => process.exit(0), 150);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

consumer.start().catch((e) => {
  console.error(JSON.stringify({ event: 'whiteroom-consumer.start_failed', err: e?.message }));
  process.exit(1);
});
