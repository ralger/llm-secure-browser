/**
 * ChurchSuite site configuration.
 * Explored via Playwright MCP on 2026-03-17.
 *
 * Login flow: navigate /my → Cloudflare auto-solves → /my/landing → click "Log in"
 *   → login.churchsuite.com → fill credentials → /my
 *
 * Member portal: login.churchsuite.com client_id=f4yyteh9zvk88hyb4nc6
 * Admin portal:  login.churchsuite.com client_id=bvwbocu4qpp9zqjnjgs9  (NOT used here)
 *
 * IMPORTANT: Requires headless: false + Xvfb to bypass Cloudflare.
 * Set BROWSER_HEADLESS=false in the environment before starting the server.
 */

const subdomain = process.env.SITE_CHURCHSUITE_SUBDOMAIN ?? 'enfieldvineyard';
const baseUrl = `https://${subdomain}.churchsuite.com`;

export const CHURCHSUITE_CONFIG = {
  siteId: 'churchsuite',
  name: 'ChurchSuite',
  subdomain,
  baseUrl,
  myUrl: `${baseUrl}/my`,
  loginHost: 'login.churchsuite.com',

  credentials: {
    usernameKey: 'SITE_CHURCHSUITE_USERNAME',
    passwordKey: 'SITE_CHURCHSUITE_PASSWORD',
  },

  selectors: {
    landing: {
      loginButton: 'a:has-text("Log in")',
    },
    login: {
      usernameInput: 'input[name="username"]',
      passwordInput: 'input[name="password"]',
      nextButton: 'button[type="submit"]:has-text("Next")',
    },
  },

  ajax: {
    events: `${baseUrl}/my/ajax/events?month=next_6`,
    rotaView: (rotaId: string) => `${baseUrl}/my/ajax/rota_view?rota_id=${rotaId}&show=all&period=future`,
  },
} as const;
