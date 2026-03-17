import type { FastifyPluginAsync } from 'fastify';
import { ICredentialProvider } from '../../core/credentials/index.js';
import { getEvents } from './actions/get-events.action.js';
import { getRotas } from './actions/get-rotas.action.js';

interface RoutesOptions {
  credentialProvider: ICredentialProvider;
}

const ErrorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

export const churchSuiteRoutes: FastifyPluginAsync<RoutesOptions> = async (app, options) => {
  const { credentialProvider } = options;

  // ── GET /events ────────────────────────────────────────────────────────────
  app.get('/events', {
    schema: {
      tags: ['churchsuite'],
      summary: 'Upcoming events (next 6 weeks, member-visible)',
      description: `
Returns all events visible to the authenticated member over the next 6 weeks.

This uses the member portal AJAX endpoint (\`/my/ajax/events?month=next_6\`) which
returns more events than the public embed JSON feed (which only includes events the
admin has explicitly marked as embed-visible).

**Requires:** \`BROWSER_HEADLESS=false\` + Xvfb (Cloudflare bypass).

\`\`\`bash
curl http://localhost:3000/api/churchsuite/events
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'churchsuite' },
            fetchedAt: { type: 'string', format: 'date-time' },
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: '2694' },
                  name: { type: 'string', example: 'Youth Club Night' },
                  date: { type: 'string', example: 'Friday, 20-Mar-2026' },
                  time: { type: 'string', example: '7:30pm - 9:30pm' },
                  location: { type: 'string', example: 'Upper Hall' },
                  url: { type: 'string', example: '/my/events/2694' },
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
      const result = await getEvents(credentialProvider);
      return { site: 'churchsuite', ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve ChurchSuite events.');
    }
  });

  // ── GET /rotas ─────────────────────────────────────────────────────────────
  app.get('/rotas', {
    schema: {
      tags: ['churchsuite'],
      summary: 'Upcoming rota schedules with full team per date',
      description: `
Returns all rotas the member belongs to, with upcoming scheduled dates and the
full team assigned to each date (names + roles).

Useful for seeing who else is serving alongside you on a given Sunday.

**Endpoints used internally:**
- \`/my/rotas\` — list of rota IDs
- \`/my/rotas/{id}\` — rota name
- \`/my/ajax/rota_view?rota_id={id}&show=all&period=future\` — dates + team

**Requires:** \`BROWSER_HEADLESS=false\` + Xvfb (Cloudflare bypass).

\`\`\`bash
curl http://localhost:3000/api/churchsuite/rotas
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'churchsuite' },
            fetchedAt: { type: 'string', format: 'date-time' },
            rotas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: '61' },
                  name: { type: 'string', example: 'Audio & Visuals' },
                  dates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        dateId: { type: 'string', example: '3217' },
                        date: { type: 'string', example: '22-Mar-2026' },
                        time: { type: 'string', example: '8:45am' },
                        notes: { type: 'string', example: 'Team Prayer 10am' },
                        team: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: { type: 'string', example: 'Beverley Knights' },
                              role: { type: 'string', example: 'Computer' },
                            },
                          },
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
      const result = await getRotas(credentialProvider);
      return { site: 'churchsuite', ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve ChurchSuite rotas.');
    }
  });
};
