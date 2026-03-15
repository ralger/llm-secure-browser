import type { FastifyPluginAsync } from 'fastify';
import { searchProducts } from './actions/search-products.action.js';
import { getProduct } from './actions/get-product.action.js';
import { checkDeliverability } from './actions/check-deliverability.action.js';
import { OCADO_CONFIG } from './config.js';

const ErrorSchema = { type: 'object', properties: { error: { type: 'string' } } };

const SearchProductSchema = {
  type: 'object',
  properties: {
    retailerProductId: { type: 'string',  example: '78920011' },
    name:       { type: 'string',  example: 'Ocado British Whole Milk 4 Pints' },
    price:      { type: 'string',  example: '£1.65' },
    pricePence: { type: 'number',  example: 165 },
    perUnit:    { type: 'string',  nullable: true, example: '(£0.73 per litre)' },
    url:        { type: 'string',  example: 'https://www.ocado.com/products/ocado-british-whole-milk-4-pints/78920011' },
  },
};

export const ocadoRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /search ───────────────────────────────────────────────────────────
  app.get<{ Querystring: { q: string; sort?: string; limit?: string } }>(
    '/search',
    {
      schema: {
        tags: ['ocado'],
        summary: 'Search Ocado products (no login required)',
        description: `
Searches the public Ocado product catalogue and returns matching products with prices.

**No login required** — product search is fully accessible without authentication.

Sort options:
| Value | Meaning |
|-------|---------|
| \`priceAscending\` | Cheapest first (default) |
| \`priceDescending\` | Most expensive first |
| \`relevance\` | Ocado relevance ranking |

\`\`\`bash
curl "http://localhost:3000/api/ocado/search?q=4+pint+full+cream+milk"
\`\`\`
`.trim(),
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q:     { type: 'string', description: 'Search query', example: '4 pint full cream milk' },
            sort:  { type: 'string', enum: ['priceAscending', 'priceDescending', 'relevance'], default: 'priceAscending' },
            limit: { type: 'string', description: 'Max results (1–50, default 20)', default: '20' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              site:      { type: 'string', example: 'ocado' },
              query:     { type: 'string', example: '4 pint full cream milk' },
              sort:      { type: 'string', example: 'priceAscending' },
              fetchedAt: { type: 'string', format: 'date-time' },
              count:     { type: 'number', example: 3 },
              products:  { type: 'array', items: SearchProductSchema },
            },
          },
          400: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const { q, sort = 'priceAscending', limit = '20' } = req.query;
      if (!q?.trim()) return reply.badRequest('Query parameter "q" is required');

      const maxItems = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
      const validSort = ['priceAscending', 'priceDescending', 'relevance'].includes(sort)
        ? (sort as 'priceAscending' | 'priceDescending' | 'relevance')
        : 'priceAscending';

      try {
        const result = await searchProducts(q.trim(), validSort, maxItems);
        return { site: OCADO_CONFIG.siteId, ...result, count: result.products.length };
      } catch (err) {
        app.log.error(err);
        return reply.internalServerError('Failed to search Ocado products.');
      }
    },
  );

  // ── GET /product/:id ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/product/:id',
    {
      schema: {
        tags: ['ocado'],
        summary: 'Get full product details by ID (no login required)',
        description: `
Returns rich product details from the Ocado public BOP API, including:
- Price, unit price, availability
- Shelf life guarantee
- Category path (full hierarchy)
- Lifestyle badges (Vegetarian, Organic, etc.)
- Current promotions/offers
- Ratings summary
- Structured fields: country of origin, nutritional data, storage, packaging, ingredients, allergens, manufacturer

**No login required.**

The \`id\` is the numeric product ID from the Ocado product URL:
\`https://www.ocado.com/products/ocado-british-whole-milk-4-pints/**78920011**\`

\`\`\`bash
curl "http://localhost:3000/api/ocado/product/78920011"
\`\`\`
`.trim(),
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Numeric retailer product ID', example: '78920011' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      if (!id || !/^\d+$/.test(id)) return reply.badRequest('Product ID must be numeric, e.g. 78920011');

      try {
        const product = await getProduct(id);
        return { site: OCADO_CONFIG.siteId, ...product };
      } catch (err) {
        app.log.error(err);
        return reply.internalServerError(`Failed to fetch product ${id}.`);
      }
    },
  );

  // ── GET /deliverability ───────────────────────────────────────────────────
  app.get<{ Querystring: { postcode: string } }>(
    '/deliverability',
    {
      schema: {
        tags: ['ocado'],
        summary: 'Check if Ocado delivers to a UK postcode (no login required)',
        description: `
Checks whether Ocado's home delivery service covers the given UK postcode.

Geocodes the postcode via [api.postcodes.io](https://api.postcodes.io) (no API key needed),
then calls Ocado's deliverability API.

When deliverable, also returns the delivery type, region ID used in Ocado's APIs, and available propositions.

**No login required.**

\`\`\`bash
curl "http://localhost:3000/api/ocado/deliverability?postcode=SW1A+1AA"
curl "http://localhost:3000/api/ocado/deliverability?postcode=IV2+3EE"
\`\`\`
`.trim(),
        querystring: {
          type: 'object',
          required: ['postcode'],
          properties: {
            postcode: { type: 'string', description: 'UK postcode', example: 'SW1A 1AA' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const { postcode } = req.query;
      if (!postcode?.trim()) return reply.badRequest('Query parameter "postcode" is required');

      try {
        const result = await checkDeliverability(postcode.trim());
        return { site: OCADO_CONFIG.siteId, ...result };
      } catch (err: any) {
        app.log.error(err);
        if (err?.message?.includes('Postcode not found') || err?.message?.includes('geocode')) {
          return reply.badRequest(err.message);
        }
        return reply.internalServerError(`Failed to check deliverability for ${postcode}.`);
      }
    },
  );
};
