import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { startBuffer, stopBuffer } from './services/eventBuffer.js';
import { startAlertJob } from './jobs/alerts.js';

await connectDb();
startBuffer();
startAlertJob();

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`[api] Server running on port ${env.port} (env: ${process.env.NODE_ENV || 'development'})`);
});

let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[api] Received ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    try {
      await stopBuffer();
      await mongoose.disconnect();
      console.log('[api] Graceful shutdown completed.');
      process.exit(0);
    } catch (err) {
      console.error('[api] Error during shutdown:', err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('[api] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

