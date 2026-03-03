import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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

  // OpenAPI / Swagger
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'LLM Secure Browser API',
        description:
          'Browser-automation REST API. Each request may take 5–30 seconds as it drives a real browser session. ' +
          'Sessions are cached between calls; use POST /api/{site}/session/refresh to force re-authentication.',
        version: '0.1.0',
        contact: { name: 'GitHub', url: 'https://github.com' },
      },
      tags: [
        { name: 'system', description: 'Health and status endpoints' },
        { name: 'parentpay', description: 'ParentPay school dinner money automation' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    staticCSP: true,
  });

  registerErrorHandler(app);

  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness probe',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async () => ({ status: 'ok', timestamp: new Date().toISOString() }),
  );

  return app;
}

