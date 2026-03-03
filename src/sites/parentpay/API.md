# ParentPay — REST API Reference

> **Interactive documentation**: start the server and open **http://localhost:3000/docs**
> for the full Swagger UI with live "Try it out" capability.
>
> This document is a quick-reference companion.

---

## Important: Response times

This API drives a **real browser session** against the live ParentPay website.
Every endpoint that contacts ParentPay will take several seconds.

| Endpoint | Typical time |
|----------|-------------|
| `/balances` | 5–15 s (login on first call, ~3 s on subsequent) |
| `/meals/:consumerId?weeks=4` | 20–40 s (one page load per week) |
| `/topup` | 10–20 s |
| `/session/refresh` | < 1 s |

Set your HTTP client timeout to **at least 60 seconds**.

---

## Session & State Model

```
┌─────────────────────────────────────────────────────┐
│  In-process memory only (lost on restart)           │
│                                                     │
│  SessionStore (singleton Map)                       │
│    "parentpay" → {                                  │
│       context: BrowserContext   ← holds cookies     │
│       loggedIn: boolean                             │
│       metadata: { basePath: "/V3Payer4W3/" }        │
│    }                                                │
│                                                     │
│  BrowserManager (singleton)                         │
│    browser: Browser  ← single Chromium instance     │
└─────────────────────────────────────────────────────┘
```

**First request** → `ensureLoggedIn()` → creates `BrowserContext` → logs in → stores in `SessionStore`

**Subsequent requests** → `ensureLoggedIn()` → finds existing context → skips login

**`POST /session/refresh`** → closes `BrowserContext` → removes from `SessionStore` → next request re-authenticates

**Process restart** → all state lost → first request re-authenticates automatically

---

## Base URL

```
http://localhost:3000        (development)
http://<host>:3000           (Docker)
```

---

## Endpoints

### `GET /health`

Liveness probe. No authentication, no browser interaction.

**Response `200`**
```json
{ "status": "ok", "timestamp": "2026-03-03T10:00:00.000Z" }
```

---

### `GET /api/parentpay/balances`

Returns the current dinner money balance for **all children** and the **Parent Account credit**.

**Response `200`**
```json
{
  "site": "parentpay",
  "parentAccountBalanceGbp": 46.00,
  "children": [
    {
      "name": "Samuel",
      "consumerId": "22780839",
      "balanceText": "Dinner money balance: £0.10",
      "balanceGbp": 0.10
    },
    {
      "name": "Emmanuel",
      "consumerId": "22780840",
      "balanceText": "Dinner money balance: £3.00",
      "balanceGbp": 3.00
    }
  ]
}
```

> **Note:** `consumerId` values are needed for the `/meals` and `/topup` endpoints.

---

### `GET /api/parentpay/meals/:consumerId`

Returns every item a child took (morning snacks and school lunch) for the last N weeks,
as a flat list sorted by date.

**Path parameter**

| Parameter | Type | Description |
|-----------|------|-------------|
| `consumerId` | string | Child ID from `/balances` (e.g. `22780839`) |

**Query parameter**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `weeks` | integer | `4` | `12` | How many past weeks to retrieve |

**Response `200`**
```json
{
  "site": "parentpay",
  "consumerId": "22780839",
  "weeks": 4,
  "meals": [
    { "date": "2026-02-23", "dayLabel": "Mon 23 Feb", "session": "morning", "item": "Simple Baguette", "taken": true },
    { "date": "2026-02-24", "dayLabel": "Tue 24 Feb", "session": "morning", "item": "CHICKEN BURRITO", "taken": true },
    { "date": "2026-02-24", "dayLabel": "Tue 24 Feb", "session": "morning", "item": "FLAVOURED MILK",  "taken": true },
    { "date": "2026-02-24", "dayLabel": "Tue 24 Feb", "session": "lunch",   "item": "FLAVOURED MILK",  "taken": true }
  ]
}
```

**`session` values**

| Value | Meaning |
|-------|---------|
| `"morning"` | Taken during the morning break period |
| `"lunch"` | Taken during the lunch period |
| `"unknown"` | Session could not be determined (should not occur in practice) |

> **Prices are not available** — the ParentPay UI does not expose item-level prices.
> Only items actually taken are included (all have `taken: true`).

---

### `POST /api/parentpay/topup`

Transfers money from the **Parent Account credit** to a child's dinner money balance.

- **No new card charge** — uses the pre-loaded Parent Account wallet
- Always check `parentAccountBalanceGbp` from `/balances` before calling this
- The school recommends a minimum of £5.00 but the system enforces £0.01

**Request body** `application/json`
```json
{
  "consumerId": "22780839",
  "amountGbp": 5.00
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `consumerId` | string | ✓ | Child ID from `/balances` |
| `amountGbp` | number | ✓ | min `0.01`, max `150.00` |

**Response `200`**
```json
{ "success": true, "message": "Top-up of £5.00 submitted successfully." }
```

**Response `422`** (top-up rejected)
```json
{ "error": "No \"School Dinner Money\" payment item found for consumerId 22780839" }
```

**Response `400`** (bad request)
```json
{ "error": "Body must contain consumerId (string) and amountGbp (number)" }
```

---

### `POST /api/parentpay/session/refresh`

Explicitly clears the cached browser session for ParentPay.

**When to call this:**
- If other endpoints start returning unexpected errors (session may have expired server-side)
- After a ParentPay maintenance window
- If you suspect the login cookies have been invalidated

The **next request** to any `/api/parentpay/*` endpoint will automatically perform a fresh login — you do not need to call any separate login endpoint.

**Response `200`**
```json
{ "message": "Session cleared. Next request will re-authenticate." }
```

---

## Error responses

All errors follow this shape:

```json
{ "error": "Human-readable error message" }
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad request — invalid parameters |
| `422` | Request valid but operation failed (e.g. payment item not found) |
| `500` | Internal server error — usually a Playwright/site error; check server logs |

---

## Curl examples

```bash
# Get balances
curl http://localhost:3000/api/parentpay/balances

# Get last 4 weeks of meals for Samuel
curl "http://localhost:3000/api/parentpay/meals/22780839?weeks=4"

# Top up Samuel's dinner money by £5
curl -X POST http://localhost:3000/api/parentpay/topup \
  -H "Content-Type: application/json" \
  -d '{"consumerId":"22780839","amountGbp":5.00}'

# Force re-login
curl -X POST http://localhost:3000/api/parentpay/session/refresh
```
