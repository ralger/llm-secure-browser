import type { FastifyPluginAsync } from 'fastify';
import { ICredentialProvider } from '../../core/credentials/index.js';
import { getMealInfo } from './actions/get-meal-info.action.js';
import { topUp, TopUpRequest } from './actions/top-up.action.js';
import { PARENTPAY_CONFIG } from './config.js';

interface RoutesOptions {
  credentialProvider: ICredentialProvider;
}

// ── Shared schema fragments ─────────────────────────────────────────────────

const ErrorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

const WeekMealsSchema = {
  type: 'object',
  properties: {
    weekCommencing: { type: 'string', format: 'date', example: '2026-02-23' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date', example: '2026-02-24' },
          dayLabel: { type: 'string', example: 'Tue 24 Feb' },
          session: { type: 'string', enum: ['morning', 'lunch', 'unknown'], example: 'lunch' },
          item: { type: 'string', example: 'MEAL DEAL' },
          taken: { type: 'boolean', example: true },
        },
      },
    },
    dayTakenStatus: {
      type: 'object',
      additionalProperties: { type: 'boolean' },
      description: 'Day label → whether the calendar header shows "Taken" for that day',
    },
  },
};

// ── Routes ──────────────────────────────────────────────────────────────────

export const parentPayRoutes: FastifyPluginAsync<RoutesOptions> = async (app, options) => {
  const { credentialProvider } = options;
  const siteId = PARENTPAY_CONFIG.siteId;

  // ── GET /meal-info ─────────────────────────────────────────────────────────
  app.get('/meal-info', {
    schema: {
      tags: ['parentpay'],
      summary: 'Full meal snapshot — balances + 3 weeks of meal history',
      description: `
Returns everything needed for a daily picture of the account in a single call:

- **Parent Account** credit balance (the wallet that funds top-ups)
- Each **child's dinner money balance**
- **3 weeks of taken meal history** per child (current week + 2 prior)

**Loading strategy**
Home page and Statements page are loaded in **parallel** first (~5 s).
Meal calendar pages are then loaded **sequentially** with randomised human-like
delays (1.2–2 s between weeks, 2.5–3.5 s between children) to avoid unusual
traffic patterns.

**Typical response time:** 30–60 s on a warm session; add ~10 s for first-call login.

**Session recovery:** if the server-side session has expired, a re-login is performed
automatically and the call is retried — no manual intervention needed.

**Meal \`session\` values**

| Value | Meaning |
|-------|---------|
| \`"morning"\` | Morning break period |
| \`"lunch"\` | Lunch period |
| \`"unknown"\` | Could not be determined |

**Note:** item prices are not exposed anywhere on the ParentPay front-end.

\`\`\`bash
curl http://localhost:3000/api/parentpay/meal-info
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'parentpay' },
            fetchedAt: { type: 'string', format: 'date-time' },
            parentAccount: {
              type: 'object',
              properties: {
                balanceGbp: { type: 'number', example: 45.97 },
                rawText: { type: 'string', example: 'Parent Account credit: £45.97' },
              },
            },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Samuel' },
                  consumerId: { type: 'string', example: '22780839' },
                  balance: {
                    type: 'object',
                    properties: {
                      balanceGbp: { type: 'number', example: 0.12 },
                      balanceText: { type: 'string', example: 'Dinner money balance: £0.12' },
                    },
                  },
                  meals: {
                    type: 'object',
                    properties: {
                      weeksIncluded: { type: 'number', example: 3 },
                      weeks: { type: 'array', items: WeekMealsSchema },
                    },
                  },
                },
              },
            },
          },
        },
        500: ErrorSchema,
      },
    },
  }, async (_req, reply) => {
    try {
      const result = await getMealInfo(credentialProvider);
      return { site: siteId, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve meal info.');
    }
  });

  // ── POST /meal-topup ───────────────────────────────────────────────────────
  app.post<{ Body: { topUps: TopUpRequest[] } }>(
    '/meal-topup',
    {
      schema: {
        tags: ['parentpay'],
        summary: 'Top up one or more children\'s dinner money (multi-child)',
        description: `
Transfers money from the **Parent Account credit** to one or more children's dinner money
balances in a single request. Children are processed **sequentially** through the browser.

- **No new card charge** — debits the pre-loaded Parent Account wallet only
- Check \`parentAccount.balanceGbp\` from \`GET /meal-info\` before calling this
- \`consumerId\` values come from \`GET /meal-info\` \`children[].consumerId\`
- **Maximum per child: £${PARENTPAY_CONFIG.topUp.maxAmountGbp.toFixed(2)}** — all items are validated before any browser work begins
- The system enforces a minimum of £0.01 per child
- After all top-ups are attempted, live balances are read from the home page and returned
- Per-child success/failure is reported in \`topUps[]\`; HTTP 200 is returned even for partial failures
- Automatically re-authenticates if the session has expired

**Typical response time:** 15–40 s for two children

\`\`\`bash
curl -X POST http://localhost:3000/api/parentpay/meal-topup \\
  -H "Content-Type: application/json" \\
  -d '{"topUps":[{"consumerId":"22780839","amountGbp":5.00},{"consumerId":"22780840","amountGbp":5.00}]}'
\`\`\`
`.trim(),
        body: {
          type: 'object',
          required: ['topUps'],
          properties: {
            topUps: {
              type: 'array',
              minItems: 1,
              description: 'One or more top-up requests. Processed sequentially.',
              items: {
                type: 'object',
                required: ['consumerId', 'amountGbp'],
                properties: {
                  consumerId: {
                    type: 'string',
                    description: 'Child consumer ID from GET /meal-info children[].consumerId',
                    example: '22780839',
                  },
                  amountGbp: {
                    type: 'number',
                    minimum: 0.01,
                    maximum: PARENTPAY_CONFIG.topUp.maxAmountGbp,
                    description: `Amount in GBP (min £0.01 / max £${PARENTPAY_CONFIG.topUp.maxAmountGbp.toFixed(2)} per child)`,
                    example: 5.0,
                  },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              site: { type: 'string', example: 'parentpay' },
              processedAt: { type: 'string', format: 'date-time' },
              topUps: {
                type: 'array',
                description: 'Per-child top-up outcome. Check success flag for each entry.',
                items: {
                  type: 'object',
                  properties: {
                    consumerId: { type: 'string', example: '22780839' },
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Top-up of £5.00 submitted successfully.' },
                    receiptBalanceGbp: {
                      type: 'number',
                      nullable: true,
                      description: 'New balance from the confirmation receipt, if available',
                      example: 6.50,
                    },
                  },
                },
              },
              balances: {
                type: 'array',
                description: 'Live balances read from the home page after all top-ups.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'Samuel' },
                    consumerId: { type: 'string', example: '22780839' },
                    balanceGbp: { type: 'number', example: 6.50 },
                    balanceText: { type: 'string', example: 'Dinner money balance: £6.50' },
                  },
                },
              },
            },
          },
          400: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const { topUps } = req.body ?? {};
      if (!Array.isArray(topUps) || topUps.length === 0) {
        return reply.badRequest('Body must contain a non-empty "topUps" array');
      }
      for (const item of topUps) {
        if (!item.consumerId || typeof item.amountGbp !== 'number') {
          return reply.badRequest('Each topUps entry must have consumerId (string) and amountGbp (number)');
        }
      }
      try {
        const result = await topUp(credentialProvider, topUps);
        return { site: siteId, ...result };
      } catch (err) {
        if (err instanceof Error) {
          // Validation errors thrown synchronously from topUp() before any browser work
          const isValidationError =
            err.message.includes('exceeds the maximum') ||
            err.message.includes('must be between');
          if (isValidationError) {
            return reply.badRequest(err.message);
          }
        }
        app.log.error(err);
        return reply.internalServerError(
          'Top-up failed. Check site availability and Parent Account balance.',
        );
      }
    },
  );
};
