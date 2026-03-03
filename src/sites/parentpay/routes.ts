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

// ── Shared schema fragments ─────────────────────────────────────────────────

const ParentAccountSchema = {
  type: 'object',
  properties: {
    balanceGbp: { type: 'number', example: 45.97 },
    rawText: { type: 'string', example: 'Parent Account credit: £45.97' },
  },
};

const ChildInfoSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', example: 'Samuel' },
    consumerId: { type: 'string', example: '22780839' },
    balanceText: { type: 'string', example: 'Dinner money balance: £0.12' },
    balanceGbp: { type: 'number', example: 0.12 },
  },
};

const MealEntrySchema = {
  type: 'object',
  properties: {
    date: { type: 'string', format: 'date', example: '2026-02-24' },
    dayLabel: { type: 'string', example: 'Tue 24 Feb' },
    session: { type: 'string', enum: ['morning', 'lunch', 'unknown'], example: 'morning' },
    item: { type: 'string', example: 'CHICKEN BURRITO' },
    taken: { type: 'boolean', example: true },
  },
};

const ErrorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

// ── Routes ──────────────────────────────────────────────────────────────────

export const parentPayRoutes: FastifyPluginAsync<RoutesOptions> = async (app, options) => {
  const { credentialProvider } = options;
  const siteId = PARENTPAY_CONFIG.siteId;

  app.get('/balances', {
    schema: {
      tags: ['parentpay'],
      summary: 'Get all balances',
      description:
        'Returns the Parent Account credit balance and each child\'s dinner money balance in a single call. ' +
        'Both pages (Home and Statements) are loaded in parallel on the same browser context. ' +
        'Logs in if no active session exists. Typical response time: 8–20 seconds.',
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'parentpay' },
            parentAccount: ParentAccountSchema,
            children: { type: 'array', items: ChildInfoSchema },
          },
        },
        500: ErrorSchema,
      },
    },
  }, async (_req, reply) => {
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

  app.get<{ Params: { consumerId: string }; Querystring: { weeks?: string } }>(
    '/meals/:consumerId',
    {
      schema: {
        tags: ['parentpay'],
        summary: 'Get taken meal history',
        description:
          'Returns items each child took (morning snacks and lunch) for the last N weeks. ' +
          'One browser page is loaded per week — allow 5–10 seconds per week requested. ' +
          'Item prices are not available on the ParentPay front-end.',
        params: {
          type: 'object',
          required: ['consumerId'],
          properties: {
            consumerId: {
              type: 'string',
              description: 'Child consumer ID (see GET /balances to discover IDs)',
              example: '22780839',
            },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            weeks: {
              type: 'string',
              description: 'Number of past weeks to retrieve (default: 4, max: 12)',
              example: '4',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              site: { type: 'string', example: 'parentpay' },
              consumerId: { type: 'string', example: '22780839' },
              weeks: { type: 'number', example: 4 },
              meals: { type: 'array', items: MealEntrySchema },
            },
          },
          400: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const { consumerId } = req.params;
      const weeks = Math.min(parseInt(req.query.weeks ?? '4', 10), 12);
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

  app.post<{ Body: { consumerId: string; amountGbp: number } }>(
    '/topup',
    {
      schema: {
        tags: ['parentpay'],
        summary: 'Top up dinner money',
        description:
          "Transfers money from the Parent Account credit to a child's dinner money balance. " +
          'No new card charge occurs — uses the pre-loaded Parent Account wallet. ' +
          'Check GET /balances first to confirm parentAccount.balanceGbp is sufficient.',
        body: {
          type: 'object',
          required: ['consumerId', 'amountGbp'],
          properties: {
            consumerId: {
              type: 'string',
              description: 'Child consumer ID',
              example: '22780839',
            },
            amountGbp: {
              type: 'number',
              minimum: 0.01,
              maximum: 150,
              description: 'Amount in GBP (min £0.01 system / max £150.00 per transaction)',
              example: 5.0,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: {
                type: 'string',
                example: 'Top-up of £5.00 submitted successfully.',
              },
              newBalanceGbp: { type: 'number', nullable: true },
            },
          },
          400: ErrorSchema,
          422: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
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
        return reply.internalServerError(
          'Top-up failed. Check site availability and Parent Account balance.',
        );
      }
    },
  );

  app.post('/session/refresh', {
    schema: {
      tags: ['parentpay'],
      summary: 'Force session re-authentication',
      description:
        'Closes the cached Playwright browser context for ParentPay and removes it from the ' +
        'session store. The next request to any ParentPay endpoint will trigger a fresh login. ' +
        'Use this if the session has become stale (e.g. after a ParentPay server-side timeout).',
      response: {
        200: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Session cleared. Next request will re-authenticate.',
            },
          },
        },
      },
    },
  }, async () => {
    await SessionStore.getInstance().clearSession(siteId);
    return { message: 'Session cleared. Next request will re-authenticate.' };
  });
};
