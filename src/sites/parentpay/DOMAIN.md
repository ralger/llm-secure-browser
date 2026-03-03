# ParentPay — Domain Knowledge

> This document captures everything learned about the ParentPay website during automated
> exploration (Playwright MCP, 2026-03-03). Read this before modifying any automation code.

---

## What is ParentPay?

ParentPay is a UK school cashless payment system. Parents create an account and:
- Load money onto a **Parent Account** (a wallet held by ParentPay)
- Top up their children's **dinner money balance** from that Parent Account
- Pay for school trips, uniform, stationery, etc.
- Monitor what their child ate each day ("Taken meals")

The platform lives at `https://app.parentpay.com`.

---

## Authentication

### Login URL
```
https://app.parentpay.com/public/client/security/v5/#/login
```
> Note: The marketing site is `www.parentpay.com` but the app is on `app.parentpay.com`.
> The login is a **single-page app** (Angular/React) — the `#/login` fragment is part of the route.
> Earlier versions used `/v2/` and `/v3/` — as of 2026-03-03 the active version is **v5**.

### Login form selectors (confirmed)
| Field | Selector |
|-------|----------|
| Username/email | `[data-test-id="security-username-login-field-input"]` |
| Password | `[data-test-id="security-login-password-field-input"]` |
| Submit button | `[data-test-id="security-login-btn"]` |

These are `data-test-id` attributes — they are more stable than class names or positional selectors.

### Post-login redirect
After login the browser is redirected to:
```
https://app.parentpay.com/{BASE_PATH}/Payer/Default.aspx
```
Where `{BASE_PATH}` is a user-specific segment (e.g. `V3Payer4W3`). **This value must be
extracted from the post-login URL** — it is not constant across accounts.

**Why BASE_PATH matters:** Every subsequent URL in the application uses this prefix:
```
/V3Payer4W3/Home/ChildSummary.aspx?ConsumerId=22780839
/V3Payer4W3/Payer/MenusAndChoices.aspx?ConsumerId=22780839&Date=2026-02-23
```

---

## Key Concepts

### Consumer ID
Each child has a unique `ConsumerId` (integer). It appears in URLs as a query parameter.
- Samuel: `22780839`
- Emmanuel: `22780840`

To discover children and their IDs programmatically, scrape the home page:
- Find all `a[href*="ChildSummary.aspx"]` that contain an `h2` element
- The `ConsumerId` is in the href query string

### Parent Account
The Parent Account is a pre-loaded wallet (like a top-up card) held by ParentPay.
- Balance shown in the page header: `a[href*="Statements.aspx"]` — text contains `"credit: £XX.XX"`
- Top-ups to children's dinner money come FROM this account (no new card charge)
- Current balance (2026-03-03): £46.00

### Dinner Money Balance
Each child has a "School Dinner Money - St Ignatius College" payment item with a running balance.
- Minimum top-up: **£0.01** (system enforced), **£5.00** (school preference shown in UI)
- Maximum per transaction: **£150.00**
- The payment item has a numeric HTML `id` attribute on its "View" button (e.g. `id="46334"`)
  — this is the **item ID** used to target the correct payment panel

### Payment Items
Payment items are things the school charges for. Two types:
1. **Balance-based** (Dinner Money): has a running balance that you top up
2. **Fixed-price** (uniform, stationery, trips): one-off purchases with a set price

Visible on: `/V3Payer4W3/Home/PaymentItems/PaymentItems.aspx?consumerId={id}`

The page has two filters:
- Show: `Active items` | `Historical items`
- Filter by: `All item types` | `FeesOrContribution` | `Meal` | `Uniform` | `Other`

---

## URL Map

| Page | URL Pattern |
|------|-------------|
| Login | `https://app.parentpay.com/public/client/security/v5/#/login` |
| Home / Dashboard | `/{BASE}/Payer/Default.aspx` |
| Child Summary | `/{BASE}/Home/ChildSummary.aspx?ConsumerId={id}` |
| All Payment Items | `/{BASE}/Home/PaymentItems/PaymentItems.aspx?consumerId={id}` |
| Taken Meals Calendar | `/{BASE}/Payer/MenusAndChoices.aspx?ConsumerId={id}&Date={YYYY-MM-DD}` |
| Parent Account Statements | `/{BASE}/MyAccount/Statements/Statements.aspx` |

> `{Date}` in the meals URL must be a **Monday** (the calendar shows Mon–Fri).
> Navigating with a non-Monday date works but the displayed week may shift.
> Navigation via Previous/Next week links also works:
> `MenusAndChoices.aspx?ConsumerId={id}&Date=2026-02-16`

---

## Taken Meals Calendar — Table Structure

This is the most complex page to parse. URL:
```
/{BASE}/Payer/MenusAndChoices.aspx?ConsumerId={id}&Date={YYYY-MM-DD}
```

### Table structure

```
<table summary="Menus and Choices">
  <thead>
    <tr>
      <th>Mon 23 Feb <img alt="Not taken"></th>
      <th>Tue 24 Feb <img alt="Taken"></th>
      <th>Wed 25 Feb <img alt="Not taken"></th>
      <th>Thu 26 Feb <img alt="Not taken"></th>
      <th>Fri 27 Feb <img alt="Not taken"></th>
    </tr>
  </thead>
  <tbody>
    <!-- Section label row: strong with "Morning" or "Lunch time", no img -->
    <tr>
      <td><strong>Morning</strong></td>
      <td><strong>Morning</strong></td>
      <td><strong>Morning</strong></td>
      <td><strong>Morning</strong></td>
      <td></td>
    </tr>
    <!-- Item row: strong with item name + img[alt="Taken"] -->
    <tr>
      <td><strong><img alt="Taken">Simple Baguette</strong></td>
      <td><strong><img alt="Taken">CHICKEN BURRITO</strong></td>
      ...
    </tr>
    <!-- Separator row: single TD with colspan="5" -->
    <tr><td colspan="5"></td></tr>
    <!-- Lunch section label (only in columns that have lunch items) -->
    <tr>
      <td></td>
      <td><strong>Lunch time</strong></td>
      ...
    </tr>
  </tbody>
</table>
```

### Parsing algorithm
1. Parse column headers (index 0–4 = Mon–Fri): extract day label + `img[alt]` (Taken/Not taken)
2. Track **per-column** current section (`morning` / `lunch`) — initialise to `'unknown'`
3. For each body row:
   - Skip separator rows (single TD with `colspan` attribute)
   - For each cell: if `strong` exists but no `img` → section label, update section for that column
   - If `img[alt="Taken"]` + `strong` text → record `{ column→day, section, item }` as a meal entry
4. Map column index → day/date using the header data

### Key observations
- The `img[alt]` in the **header** (`Taken`/`Not taken`) indicates whether a **formal school lunch** was taken — NOT whether morning snacks were taken
- A child can have morning snacks (`Not taken` header) but still appear in morning item rows
- The section label "Morning" or "Lunch time" appears only in columns where that session has items
- Item prices are **not visible anywhere** on the front end (confirmed by exploration)
- "Taken" status at item level is always `true` in the output (only taken items are listed)

---

## Top-Up Flow

```
1. Navigate to /{BASE}/Home/ChildSummary.aspx?ConsumerId={id}
2. Find the "View" button whose id = the dinner money payment item ID
   - Locate via: button[id] where id is numeric AND adjacent dl contains "School Dinner Money"
3. Click the View button → a payment panel slides into view
4. Fill the amount input (selector: #edit-amount or input[aria-label*="amount"])
5. Click "Pay by Parent Account" button
6. Wait for URL to change to a confirmation/receipt page
```

### Confirmation page
After clicking "Pay by Parent Account", the URL changes to include `Default.aspx` or a receipt path.
No intermediate confirmation dialog was observed — the payment is submitted immediately.

---

## Hints for Future Agents

### If login breaks
- Check whether the login app version has changed (v5 → v6 etc.) by visiting `www.parentpay.com` and following the login link
- The `data-test-id` attributes are intentional test hooks and unlikely to change often
- If redirected to a different URL pattern after login, update `LoginPage.login()` to wait for the new pattern

### If balance scraping breaks
- The child cards on the home page are `<a href*="ChildSummary.aspx">` links containing `<h2>` (name) and `<p>` with text "balance"
- If the balance text format changes (e.g. "Current balance: £X"), update the regex in `HomePage.getChildren()`

### If meal parsing breaks
- Use `page.evaluate()` to dump the raw table HTML and compare against the structure above
- The most likely change: section label text ("Morning" or "Lunch time") changing capitalisation or wording
- If columns shift (e.g. weekend days added), the column→date mapping in `MealsCalendarPage.parseDayLabelToISO()` still works as it reads dates from the header text

### If top-up breaks
- Verify the payment item ID by inspecting the "View" button's `id` attribute on the ChildSummary page
- Check whether a confirmation dialog has been added (look for `dialog` or `modal` elements after clicking "Pay by Parent Account")
- If the school changes the minimum top-up amount, the UI shows a warning but the system minimum remains £0.01

### BASE_PATH
- Currently `V3Payer4W3` for this account — stored in `SessionStore` metadata after login
- If the path ever changes structure, update the regex in `LoginPage.login()`:
  ```ts
  const match = new URL(this.page.url()).pathname.match(/^(\/[^/]+\/)/);
  ```

### Navigation note
- The site uses ASP.NET WebForms (`__doPostBack`, `.aspx` pages) on the authenticated side
- The login page is a modern SPA (likely Angular)
- Avoid using browser Back button navigation — always navigate by URL directly
