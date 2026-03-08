import type { FastifyPluginAsync } from 'fastify';
import type { ICredentialProvider } from '../../core/credentials/index.js';
import { getPlaytime } from './actions/get-playtime.action.js';
import { setPlaytime } from './actions/set-playtime.action.js';
import { PLAYSTATION_CONFIG } from './config.js';

interface RoutesOptions {
  credentialProvider: ICredentialProvider;
}

// ── Shared schema fragments ───────────────────────────────────────────────────

const ErrorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

const PlaytimeSettingsSchema = {
  type: 'object',
  properties: {
    psnOnlineId: {
      type: 'string',
      description: 'Full PSN Online ID as shown on PS5 and in account management',
      example: 'solar_sam',
    },
    friendlyName: {
      type: 'string',
      description: 'Friendly name (Sam or Manu)',
      example: 'Sam',
    },
    restrictPlaytime: {
      type: 'boolean',
      description: 'Whether Restrict Playtime is enabled (always true when managed)',
      example: true,
    },
    dailyMinutes: {
      type: 'integer',
      nullable: true,
      description: 'Current Everyday duration in minutes. null if not set.',
      example: 60,
    },
    dailyLimitLabel: {
      type: 'string',
      description: 'Dropdown label text as shown in PlayStation UI',
      example: '1 Hour',
    },
  },
};

/** Valid dailyMinutes values (must match PLAYSTATION_CONFIG.playtimeOptions keys) */
const VALID_DAILY_MINUTES = Object.keys(PLAYSTATION_CONFIG.playtimeOptions).map(Number);

const SetPlaytimeBodySchema = {
  type: 'object',
  required: ['dailyMinutes'],
  properties: {
    dailyMinutes: {
      type: 'integer',
      enum: VALID_DAILY_MINUTES,
      description: `
Daily playtime limit in minutes. Must be one of the values PlayStation supports:

| Minutes | PlayStation label       |
|---------|------------------------|
| \`0\`   | No Playtime (blocked)  |
| \`15\`  | 15 Minutes             |
| \`30\`  | 30 Minutes             |
| \`45\`  | 45 Minutes             |
| \`60\`  | 1 Hour                 |
| \`90\`  | 1 Hour 30 Minutes      |
| \`120\` | 2 Hours                |
| \`150\` | 2 Hours 30 Minutes     |
| \`180\` | 3 Hours                |
| \`210\` | 3 Hours 30 Minutes     |
| \`240\` | 4 Hours                |
| \`270\` | 4 Hours 30 Minutes     |
| \`300\` | 5 Hours                |
| \`360\` | 6 Hours                |

**Restrict Playtime is always set to "Restrict"** — only the time amount changes.
`.trim(),
      example: 60,
    },
  },
};

const SetPlaytimeResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    psnOnlineId: { type: 'string', example: 'solar_sam' },
    friendlyName: { type: 'string', example: 'Sam' },
    dailyMinutes: { type: 'integer', example: 60 },
    dailyLimitLabel: { type: 'string', example: '1 Hour' },
  },
};

// ── Routes ────────────────────────────────────────────────────────────────────

export const playstationRoutes: FastifyPluginAsync<RoutesOptions> = async (app, options) => {
  const { credentialProvider } = options;
  const siteId = PLAYSTATION_CONFIG.siteId;

  // ── GET /playtime ──────────────────────────────────────────────────────────
  app.get('/playtime', {
    schema: {
      tags: ['playstation'],
      summary: 'Get current playtime settings for both children',
      description: `
Returns the current Restrict Playtime setting and Everyday duration for both children.

**Children on this account**

| PSN Online ID prefix | Friendly name | Full name  |
|----------------------|---------------|------------|
| \`solar\` (e.g. \`solar_xxxx\`) | **Sam**  | Samuel     |
| \`reactive\` (e.g. \`reactive_xxxx\`) | **Manu** | Emmanuel   |

**Typical response time:** 30–60 seconds (full browser login with TOTP + page navigation)

\`\`\`bash
curl http://localhost:3000/api/playstation/playtime
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'playstation' },
            fetchedAt: { type: 'string', format: 'date-time' },
            children: {
              type: 'array',
              items: PlaytimeSettingsSchema,
            },
          },
        },
        500: ErrorSchema,
      },
    },
  }, async (_req, reply) => {
    try {
      const result = await getPlaytime(credentialProvider);
      return { site: siteId, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve PlayStation playtime settings.');
    }
  });

  // ── PUT /solar/playtime ────────────────────────────────────────────────────
  app.put<{ Body: { dailyMinutes: number } }>('/solar/playtime', {
    schema: {
      tags: ['playstation'],
      summary: "Set Sam's daily playtime limit",
      description: `
Sets the **Everyday** playtime duration for **Sam (Samuel)** — the child whose PSN Online ID starts with \`solar\`.

- Restrict Playtime is always set to **Restrict** (never disabled)
- Only the daily time amount is changed
- Use \`dailyMinutes: 0\` to block play entirely ("No Playtime")

**PSN account:** \`solar...\` (full Online ID resolved at runtime from family member list)

**Typical response time:** 30–50 seconds

\`\`\`bash
# Give Sam 1 hour today
curl -X PUT http://localhost:3000/api/playstation/solar/playtime \\
  -H "Content-Type: application/json" \\
  -d '{"dailyMinutes": 60}'

# Block Sam
curl -X PUT http://localhost:3000/api/playstation/solar/playtime \\
  -H "Content-Type: application/json" \\
  -d '{"dailyMinutes": 0}'
\`\`\`
`.trim(),
      body: SetPlaytimeBodySchema,
      response: {
        200: SetPlaytimeResponseSchema,
        400: ErrorSchema,
        500: ErrorSchema,
      },
    },
  }, async (req, reply) => {
    const { dailyMinutes } = req.body ?? {};
    if (typeof dailyMinutes !== 'number' || !VALID_DAILY_MINUTES.includes(dailyMinutes)) {
      return reply.badRequest(
        `dailyMinutes must be one of: ${VALID_DAILY_MINUTES.join(', ')}`,
      );
    }
    try {
      const result = await setPlaytime(credentialProvider, { slug: 'solar', dailyMinutes });
      return { success: true, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError("Failed to set Sam's playtime.");
    }
  });

  // ── PUT /reactive/playtime ─────────────────────────────────────────────────
  app.put<{ Body: { dailyMinutes: number } }>('/reactive/playtime', {
    schema: {
      tags: ['playstation'],
      summary: "Set Manu's daily playtime limit",
      description: `
Sets the **Everyday** playtime duration for **Manu (Emmanuel)** — the child whose PSN Online ID starts with \`reactive\`.

- Restrict Playtime is always set to **Restrict** (never disabled)
- Only the daily time amount is changed
- Use \`dailyMinutes: 0\` to block play entirely ("No Playtime")

**PSN account:** \`reactive...\` (full Online ID resolved at runtime from family member list)

**Typical response time:** 30–50 seconds

\`\`\`bash
# Give Manu 2 hours today
curl -X PUT http://localhost:3000/api/playstation/reactive/playtime \\
  -H "Content-Type: application/json" \\
  -d '{"dailyMinutes": 120}'

# Block Manu
curl -X PUT http://localhost:3000/api/playstation/reactive/playtime \\
  -H "Content-Type: application/json" \\
  -d '{"dailyMinutes": 0}'
\`\`\`
`.trim(),
      body: SetPlaytimeBodySchema,
      response: {
        200: SetPlaytimeResponseSchema,
        400: ErrorSchema,
        500: ErrorSchema,
      },
    },
  }, async (req, reply) => {
    const { dailyMinutes } = req.body ?? {};
    if (typeof dailyMinutes !== 'number' || !VALID_DAILY_MINUTES.includes(dailyMinutes)) {
      return reply.badRequest(
        `dailyMinutes must be one of: ${VALID_DAILY_MINUTES.join(', ')}`,
      );
    }
    try {
      const result = await setPlaytime(credentialProvider, { slug: 'reactive', dailyMinutes });
      return { success: true, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError("Failed to set Manu's playtime.");
    }
  });
};
