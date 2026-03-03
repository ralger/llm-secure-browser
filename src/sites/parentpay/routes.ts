import type { FastifyPluginAsync } from 'fastify';
import { ICredentialProvider } from '../../core/credentials/index.js';
import { SessionStore } from '../../core/session-store.js';
import { getBalances } from './actions/get-balances.action.js';
import { getAllMeals } from './actions/get-meals.action.js';
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
      description: `
Returns the **Parent Account credit balance** and every **child's dinner money balance** in a single call.
The Home page and Statements page are loaded in parallel on the same browser context.

Logs in automatically if no active session exists.

**Typical response time:** 8–20 s (first call includes login; ~5 s on warm session)

**Notes**
- \`parentAccount.balanceGbp\` is the wallet that funds top-ups — check this before calling \`POST /topup\`
- \`children[].consumerId\` values are needed for \`POST /topup\`
- Children are discovered dynamically from the Home page, so new children appear automatically

\`\`\`bash
curl http://localhost:3000/api/parentpay/balances
\`\`\`
`.trim(),
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

  app.get('/meals', {
    schema: {
      tags: ['parentpay'],
      summary: 'Get meal history for all children',
      description: `
Returns taken meal entries for **all children** across the **current week plus the previous 2 weeks** (3 weeks total).
Children are discovered dynamically — no parameters needed.

Pages are loaded **strictly sequentially** with randomised human-like delays (1.2–2 s between weeks,
2.5–3.5 s between children) to avoid unusual traffic patterns on the ParentPay site.

**Typical response time:** 30–60 s

**Response structure**

Each child has a \`weeks\` array (oldest → newest). Each week contains:

| Field | Description |
|-------|-------------|
| \`weekCommencing\` | ISO date of the Monday that starts the week |
| \`entries\` | Items actually taken that week (only taken items are included) |
| \`dayTakenStatus\` | Map of day label → whether the calendar header shows "Taken" for that day |

Each entry's \`session\` field:

| Value | Meaning |
|-------|---------|
| \`"morning"\` | Taken during the morning break period |
| \`"lunch"\` | Taken during the lunch period |
| \`"unknown"\` | Could not be determined from the calendar layout |

**Item prices are not available** — the ParentPay UI does not expose per-item costs.

\`\`\`bash
curl http://localhost:3000/api/parentpay/meals
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'parentpay' },
            fetchedAt: { type: 'string', format: 'date-time' },
            weeksIncluded: { type: 'number', example: 3 },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Samuel' },
                  consumerId: { type: 'string', example: '22780839' },
                  weeks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        weekCommencing: { type: 'string', format: 'date', example: '2026-02-23' },
                        entries: { type: 'array', items: MealEntrySchema },
                        dayTakenStatus: {
                          type: 'object',
                          additionalProperties: { type: 'boolean' },
                          description: 'Map of day label → whether the day header shows Taken',
                        },
                      },
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
      const result = await getAllMeals(credentialProvider);
      return { site: siteId, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve meal data.');
    }
  });

  app.post<{ Body: { consumerId: string; amountGbp: number } }>(
    '/topup',
    {
      schema: {
        tags: ['parentpay'],
        summary: 'Top up dinner money',
        description: `
Transfers money from the **Parent Account credit** to a child's dinner money balance.

- **No new card charge** — uses the pre-loaded Parent Account wallet only
- Always check \`parentAccount.balanceGbp\` from \`GET /balances\` before calling this
- The school recommends a minimum top-up of £5.00; the system technically allows £0.01
- Returns \`newBalanceGbp\` parsed from the confirmation receipt page

**Typical response time:** 10–20 s

\`\`\`bash
curl -X POST http://localhost:3000/api/parentpay/topup \\
  -H "Content-Type: application/json" \\
  -d '{"consumerId":"22780839","amountGbp":5.00}'
\`\`\`
`.trim(),
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
      description: `
Closes the cached Playwright BrowserContext for ParentPay and removes it from the session store.
The **next request** to any \`/api/parentpay/*\` endpoint will automatically perform a fresh login.

**When to call this:**
- Other endpoints are returning unexpected errors (session may have expired server-side)
- After a ParentPay maintenance window
- If you suspect login cookies have been invalidated

You do **not** need to call a login endpoint separately — re-authentication is fully automatic.

\`\`\`bash
curl -X POST http://localhost:3000/api/parentpay/session/refresh
\`\`\`
`.trim(),
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
