# LLM Secure Browser

A multi-site Playwright browser-automation platform that exposes scraped data via a REST API.

## Architecture

```
src/
  core/
    credentials/        # ICredentialProvider interface + EnvCredentialProvider
    browser-manager.ts  # Singleton Playwright Browser lifecycle
    session-store.ts    # Per-site BrowserContext cache (preserves login state)
    api/
      server.ts         # Fastify instance + /health endpoint
      error-handler.ts  # Centralised error → HTTP mapping
  sites/
    parentpay/          # First integration (https://www.parentpay.com)
      config.ts         # Base URL, selectors, credential key names
      pages/            # Page Object Model classes
      actions/          # Discrete scraping operations
      routes.ts         # Fastify routes (/api/parentpay/...)
      index.ts          # Site plugin registration
  site-registry.ts      # Registers all site plugins into Fastify
  index.ts              # Entry point
```

## Quick Start

```bash
# 1. Copy and fill in credentials
cp .env.example .env
# Edit .env and set SITE_PARENTPAY_USERNAME / SITE_PARENTPAY_PASSWORD

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Run
npm start
# → API listening on http://localhost:3000
```

### Development (watch mode)
```bash
npm run dev
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/api/parentpay/balances` | Dinner money balances for all children + parent account credit |
| `GET` | `/api/parentpay/meals/:consumerId?weeks=4` | Taken meal entries for the last N weeks |
| `POST` | `/api/parentpay/topup` | Top up dinner money from Parent Account credit |
| `POST` | `/api/parentpay/session/refresh` | Force re-authentication on next request |

### `GET /api/parentpay/balances`
```json
{
  "site": "parentpay",
  "parentAccountBalanceGbp": 46.00,
  "children": [
    { "name": "Samuel", "consumerId": "22780839", "balanceText": "Dinner money balance: £0.10", "balanceGbp": 0.10 },
    { "name": "Emmanuel", "consumerId": "22780840", "balanceText": "Dinner money balance: £3.00", "balanceGbp": 3.00 }
  ]
}
```

### `GET /api/parentpay/meals/:consumerId?weeks=4`
```json
{
  "site": "parentpay",
  "consumerId": "22780839",
  "weeks": 4,
  "meals": [
    { "date": "2026-02-23", "dayLabel": "Mon 23 Feb", "session": "morning", "item": "Simple Baguette", "taken": true },
    { "date": "2026-02-24", "dayLabel": "Tue 24 Feb", "session": "morning", "item": "CHICKEN BURRITO", "taken": true },
    { "date": "2026-02-24", "dayLabel": "Tue 24 Feb", "session": "lunch",   "item": "FLAVOURED MILK",  "taken": true }
  ]
}
```

### `POST /api/parentpay/topup`
```json
// Request body
{ "consumerId": "22780839", "amountGbp": 5.00 }

// Response
{ "success": true, "message": "Top-up of £5.00 submitted successfully." }
```

> **Note:** Top-ups use the pre-loaded Parent Account balance only. No new card charge occurs.
> Minimum: £0.01 (system). Maximum: £150.00 per transaction.

## Credentials

Credentials are never hardcoded. They are provided via environment variables:

| Variable | Description |
|----------|-------------|
| `SITE_PARENTPAY_USERNAME` | ParentPay login username |
| `SITE_PARENTPAY_PASSWORD` | ParentPay login password |

The `ICredentialProvider` interface in `src/core/credentials/provider.interface.ts` can be implemented to source credentials from Vault, AWS Secrets Manager, etc. without any application code changes.

## Docker

```bash
# Build & run
docker compose up --build

# Or build the image directly
docker build -t llm-secure-browser .
docker run -p 3000:3000 --env-file .env llm-secure-browser
```

## Adding a New Site

1. Create `src/sites/{site-name}/`
2. Add `config.ts` with base URL, credential keys, and selector constants
3. Add `pages/` with Page Object Model classes
4. Add `actions/` with discrete scraping functions
5. Add `routes.ts` with Fastify routes under `/api/{site-name}/`
6. Add `index.ts` exporting a `SitePlugin` object
7. Import and add to the `SITES` array in `src/site-registry.ts`
8. Add credential keys to `.env.example`

## Site Exploration Workflow

New sites are explored interactively using the Playwright MCP server before any automation code is written:

1. Describe the site and what data you want in the chat
2. The AI agent navigates the live site via MCP
3. Once the flow is understood, selectors and page objects are codified
4. The `config.ts` `selectors` object is updated with confirmed values
