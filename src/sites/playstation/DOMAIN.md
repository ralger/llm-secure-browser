# PlayStation Family Management — Domain Notes

## Overview
Automates daily playtime limit management for two child PS5 accounts via the
PlayStation Account Management web portal at `account.sonyentertainmentnetwork.com`.

## Authentication flow
Sony uses OAuth2/OIDC. The automation triggers it by navigating directly to the
family management URL, which redirects unauthenticated users to the sign-in page.

**Steps:**
1. Navigate to `https://account.sonyentertainmentnetwork.com/familyManagement`
2. Auto-redirect to `https://id.sonyentertainmentnetwork.com/signin/`
3. Fill email and password → click **Sign In**  
   (the button only becomes enabled once both fields are non-empty)
4. Sony shows a **TOTP verification page** — enter the 6-digit code  
   (generated locally by `otplib` from `SITE_PLAYSTATION_TOTP_SECRET`)
5. Sony redirects back to `account.sonyentertainmentnetwork.com/familyManagement`

## TOTP secret
The TOTP secret is the base32 value from the `otpauth://` URI that Sony shows
during 2FA setup ("Can't scan? Enter key manually"). Extract it from the `secret=`
query parameter and store it in `SITE_PLAYSTATION_TOTP_SECRET`.

Algorithm: SHA-1, 6 digits, 30-second period — same as Google Authenticator.

## Children

| Endpoint slug | PSN Online ID prefix | Friendly name | Full name   |
|--------------|----------------------|---------------|-------------|
| `solar`      | `solar...`           | Sam           | Samuel      |
| `reactive`   | `reactive...`        | Manu          | Emmanuel    |

The full PSN Online ID is resolved at runtime by matching the prefix against
the family member list. If the prefix changes, update `config.ts`.

## Family Management UI (as of 2026-03)
Based on PlayStation documentation and web research. Requires live verification
on first run — Sony uses a React SPA whose CSS class names change frequently.

1. Family member list shows cards/rows with each child's PSN Online ID
2. Clicking a child opens their management panel
3. The **Playtime Settings** section has an **Edit** button
4. Edit modal shows:
   - **Restrict Playtime**: `Restrict` | `Do Not Restrict`  
     → always kept on `Restrict`
   - **Everyday** duration: dropdown of preset values (15 min, 30 min, ... 6 hours)
   - **Save** button

## Valid playtime duration values

| `dailyMinutes` | PlayStation dropdown label |
|----------------|---------------------------|
| 0              | No Playtime                |
| 15             | 15 Minutes                 |
| 30             | 30 Minutes                 |
| 45             | 45 Minutes                 |
| 60             | 1 Hour                     |
| 90             | 1 Hour 30 Minutes          |
| 120            | 2 Hours                    |
| 150            | 2 Hours 30 Minutes         |
| 180            | 3 Hours                    |
| 210            | 3 Hours 30 Minutes         |
| 240            | 4 Hours                    |
| 270            | 4 Hours 30 Minutes         |
| 300            | 5 Hours                    |
| 360            | 6 Hours                    |

**TODO:** Verify the exact label text (especially for 0 minutes) on first live run.

## Selector discovery (if Sony changes their UI)

Use the Playwright MCP from a machine with access to Sony's auth servers:

```bash
# Start the dev server with PLAYWRIGHT_HEADLESS=false to watch the browser
```

Then use the MCP to:
1. Navigate to `https://account.sonyentertainmentnetwork.com/familyManagement`
2. Log in manually (or let the automation do it)
3. Snapshot the family member list → find the selector for child rows
4. Click a child → snapshot the detail page → find "Edit" button selector
5. Click Edit → snapshot the playtime modal → find:
   - Restrict Playtime select selector
   - Everyday duration select selector
   - Save button selector
6. Update `config.ts` `selectors.familyManagement`

## Known limitations

- **Session timeout**: Each API call creates a new browser session (no session reuse).
  This means every call does a full login + TOTP. Typical response time: 30–60 s.
  A session-caching layer could reduce this to ~5 s for warm calls.

- **TOTP window**: The TOTP code is generated just before submission.
  If the code is within 1–2 seconds of the 30-second boundary, Sony may reject it.
  `otplib` handles this gracefully — the window is lenient.

- **Sony UI changes**: The family management page is a React SPA.
  CSS class names change; prefer `data-qa`, `aria-label`, and text-based selectors.
  All selectors are centralised in `config.ts` for easy updates.

- **"When Playtime Ends"** setting (Notify Only / Log Out) is **not managed** by this
  automation. Only the Everyday duration is changed. The current setting is preserved.
