import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerErrorHandler } from './error-handler.js';

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    ajv: {
      customOptions: {
        strict: false, // allows OpenAPI `example` fields in schemas
      },
    },
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
        version: '0.1.0',
        contact: { name: 'GitHub', url: 'https://github.com' },
        description: `
Browser-automation REST API that drives real Chromium browser sessions against supported websites.
Each request navigates live web pages — expect response times of **8–60 seconds** depending on the endpoint.
Set your HTTP client timeout to **at least 90 seconds**.

---

## Session & state model

\`\`\`
┌──────────────────────────────────────────────────────┐
│  In-process memory only — lost on server restart     │
│                                                      │
│  SessionStore (singleton)                            │
│    "parentpay" → {                                   │
│       context: BrowserContext  ← holds cookies       │
│       loggedIn: boolean                              │
│       metadata: { basePath: "/V3Payer4W3/" }         │
│    }                                                 │
│                                                      │
│  BrowserManager (singleton)                          │
│    browser: Browser  ← single Chromium instance      │
└──────────────────────────────────────────────────────┘
\`\`\`

- **First request** → \`ensureLoggedIn()\` → creates BrowserContext → logs in → stores in SessionStore
- **Subsequent requests** → finds existing context → skips login (~3 s faster)
- **\`POST /session/refresh\`** → closes context → next request re-authenticates automatically
- **Idle reaper** → sessions inactive for more than 10 minutes are automatically closed
  (configurable via \`SESSION_IDLE_TIMEOUT_MS\` environment variable)
- **Process restart** → all session state is lost; first request re-authenticates

---

## Error responses

All errors share this shape:

\`\`\`json
{ "error": "Human-readable message" }
\`\`\`

| Status | Meaning |
|--------|---------|
| \`400\` | Bad request — invalid parameters |
| \`422\` | Valid request but operation rejected (e.g. payment item not found) |
| \`500\` | Internal error — Playwright or site problem; check server logs |
`.trim(),
      },
      tags: [
        { name: 'system', description: 'Health and liveness probes' },
        {
          name: 'parentpay',
          description: `
Automation endpoints for **ParentPay** (https://app.parentpay.com) — a UK school cashless
payment system used to manage children's dinner money.

**Key concepts**

| Concept | Description |
|---------|-------------|
| **Parent Account** | A pre-loaded credit wallet. Topping up a child debits this account — no new card charge occurs. |
| **Dinner money balance** | Per-child balance used at the school canteen. |
| **Consumer ID** | ParentPay's internal ID for each child. Returned by \`GET /balances\` and stable over time. |
| **Meal deal** | The expected daily purchase: a main meal + side. Anything else (snacks, drinks only) is non-compliant. |
| **Base path** | A user-specific path segment (e.g. \`/V3Payer4W3/\`) extracted from the post-login redirect URL and cached in the session. |

**Item prices are not available** — the ParentPay front-end does not expose per-item costs anywhere.
`.trim(),
        },
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

