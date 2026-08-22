import { startServer } from './runtime.js';

const runtime = await startServer();
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await runtime.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
