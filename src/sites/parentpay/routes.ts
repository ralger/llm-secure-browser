import type { FastifyPluginAsync } from 'fastify';
import { ICredentialProvider } from '../../core/credentials/index.js';
import { SessionStore } from '../../core/session-store.js';
import { getBalances } from './actions/get-balances.action.js';
import { getMeals } from './actions/get-meals.action.js';
import { topUp } from './actions/top-up.action.js';
import { PARENTPAY_CONFIG } from './config.js';

interface RoutesOptions {
  credentialProvider: ICredentialProvider;
}

export const parentPayRoutes: FastifyPluginAsync<RoutesOptions> = async (app, options) => {
  const { credentialProvider } = options;
  const siteId = PARENTPAY_CONFIG.siteId;

  /**
   * GET /api/parentpay/balances
   * Returns dinner money balances for all children + parent account credit.
   *
   * Response:
   *   { site, parentAccountBalanceGbp, children: [{ name, consumerId, balanceText, balanceGbp }] }
   */
  app.get('/balances', async (_req, reply) => {
    try {
      const result = await getBalances(credentialProvider);
      return { site: siteId, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError(
        'Failed to retrieve balances. Check credentials and site availability.',
      );
    }
  });

  /**
   * GET /api/parentpay/meals/:consumerId
   * Returns taken meal entries for the specified child over the last N weeks.
   *
   * Query params:
   *   weeks  (default: 4) — number of past weeks to retrieve
   *
   * Response:
   *   { site, consumerId, weeks, meals: [{ date, dayLabel, session, item, taken }] }
   */
  app.get<{ Params: { consumerId: string }; Querystring: { weeks?: string } }>(
    '/meals/:consumerId',
    async (req, reply) => {
      const { consumerId } = req.params;
      const weeks = Math.min(parseInt(req.query.weeks ?? '4', 10), 12); // cap at 12 weeks
      if (isNaN(weeks) || weeks < 1) {
        return reply.badRequest('weeks must be a positive integer (max 12)');
      }
      try {
        const meals = await getMeals(credentialProvider, { consumerId, weeks });
        return { site: siteId, consumerId, weeks, meals };
      } catch (err) {
        app.log.error(err);
        return reply.internalServerError('Failed to retrieve meal data.');
      }
    },
  );

  /**
   * POST /api/parentpay/topup
   * Tops up a child's dinner money from the Parent Account credit.
   * Uses the existing Parent Account balance — no new card charge.
   *
   * Body: { consumerId: string, amountGbp: number }
   * Response: { success, message, newBalanceGbp? }
   *
   * NOTE: Do not send more than the available Parent Account balance.
   *       Minimum: £0.01 (system), Maximum: £150.00 per transaction.
   */
  app.post<{ Body: { consumerId: string; amountGbp: number } }>(
    '/topup',
    async (req, reply) => {
      const { consumerId, amountGbp } = req.body ?? {};
      if (!consumerId || typeof amountGbp !== 'number') {
        return reply.badRequest('Body must contain consumerId (string) and amountGbp (number)');
      }
      try {
        const result = await topUp(credentialProvider, { consumerId, amountGbp });
        if (!result.success) {
          return reply.status(422).send({ error: result.message });
        }
        return result;
      } catch (err) {
        app.log.error(err);
        return reply.internalServerError('Top-up failed. Check site availability and Parent Account balance.');
      }
    },
  );

  /**
   * POST /api/parentpay/session/refresh
   * Clears the cached browser session, forcing a fresh login on the next request.
   */
  app.post('/session/refresh', async () => {
    await SessionStore.getInstance().clearSession(siteId);
    return { message: 'Session cleared. Next request will re-authenticate.' };
  });
};

