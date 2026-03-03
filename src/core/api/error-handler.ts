import { FastifyInstance, FastifyError } from 'fastify';

/**
 * Maps known error types to appropriate HTTP responses.
 * Registered as a Fastify error handler.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error.statusCode ?? 500;
    app.log.error(error);
    reply.status(status).send({ error: error.message });
  });
}
