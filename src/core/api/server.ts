import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { registerErrorHandler } from './error-handler.js';

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await app.register(sensible);
  registerErrorHandler(app);

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
