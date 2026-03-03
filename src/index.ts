import 'dotenv/config';
import { createServer } from './core/api/server.js';
import { BrowserManager } from './core/browser-manager.js';
import { SessionStore } from './core/session-store.js';
import { registerSites } from './site-registry.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  // Launch browser up-front so it's ready for first request
  await BrowserManager.getInstance().launch();

  const app = await createServer();
  await registerSites(app);

  await app.listen({ port: PORT, host: HOST });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    SessionStore.getInstance().stopReaper();
    await SessionStore.getInstance().clearAll();
    await BrowserManager.getInstance().teardown();
    process.exit(0);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
