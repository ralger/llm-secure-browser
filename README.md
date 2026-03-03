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
| `GET` | `/api/parentpay/balances` | Current lunch money balances for all children |
| `POST` | `/api/parentpay/session/refresh` | Force re-authentication on next request |

### Example response — `/api/parentpay/balances`
```json
{
  "site": "parentpay",
  "data": [
    { "name": "Child One", "balance": "£4.50" },
    { "name": "Child Two", "balance": "£2.20" }
  ]
}
```

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
