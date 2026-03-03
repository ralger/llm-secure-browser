import type { FastifyPluginAsync } from 'fastify';
import { ICredentialProvider } from '../../core/credentials/index.js';
import { SessionStore } from '../../core/session-store.js';
import { getBalances } from './actions/get-balances.action.js';
import { PARENTPAY_CONFIG } from './config.js';

interface RoutesOptions {
  credentialProvider: ICredentialProvider;
}

export const parentPayRoutes: FastifyPluginAsync<RoutesOptions> = async (app, options) => {
  const { credentialProvider } = options;

  /**
   * GET /api/parentpay/balances
   * Returns the current lunch money balances for all children.
   */
  app.get('/balances', async (_request, reply) => {
    try {
      const balances = await getBalances(credentialProvider);
      return { site: PARENTPAY_CONFIG.siteId, data: balances };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve balances. Check credentials and site availability.');
    }
  });

  /**
   * POST /api/parentpay/session/refresh
   * Clears the cached session, forcing a fresh login on the next request.
   */
  app.post('/session/refresh', async () => {
    await SessionStore.getInstance().clearSession(PARENTPAY_CONFIG.siteId);
    return { message: 'Session cleared. Next request will re-authenticate.' };
  });
};
