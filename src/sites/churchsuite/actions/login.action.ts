import { BrowserContext, Page } from 'playwright';
import { ICredentialProvider } from '../../../core/credentials/index.js';
import { SessionStore } from '../../../core/session-store.js';
import { BrowserManager } from '../../../core/browser-manager.js';
import { SessionExpiredError } from '../../../core/errors.js';
import { ChurchSuiteLoginPage } from '../pages/login.page.js';
import { CHURCHSUITE_CONFIG } from '../config.js';

const { siteId, credentials } = CHURCHSUITE_CONFIG;

/**
 * Returns true if the current page URL indicates the session has expired
 * and the browser has been redirected to the landing page.
 */
export function isLoginRedirect(url: string): boolean {
  return url.includes('/my/landing');
}

/**
 * Wraps an action so that if a SessionExpiredError is thrown the session is
 * cleared and the action is retried exactly once with a fresh login.
 */
export async function withAutoRelogin<T>(
  credentialProvider: ICredentialProvider,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      await SessionStore.getInstance().clearSession(siteId);
      return action();
    }
    throw err;
  }
}

/**
 * Ensures the ChurchSuite member session is authenticated.
 * Returns an active Page ready for use inside the member portal.
 *
 * - Re-uses an existing logged-in context if available.
 * - Creates a new context, resolves the Cloudflare challenge (headed browser
 *   required — set BROWSER_HEADLESS=false + xvfb-run), and logs in if not.
 */
export async function ensureLoggedIn(
  credentialProvider: ICredentialProvider,
): Promise<{ context: BrowserContext; page: Page }> {
  const sessionStore = SessionStore.getInstance();
  const browserManager = BrowserManager.getInstance();

  const entry = sessionStore.get(siteId);

  if (entry && entry.loggedIn) {
    try {
      const page = await entry.context.newPage();
      return { context: entry.context, page };
    } catch {
      await sessionStore.clearSession(siteId);
    }
  }

  if (entry) {
    await sessionStore.clearSession(siteId);
  }

  const context = await browserManager.createContext();
  sessionStore.set(siteId, context, false);

  const page = await context.newPage();
  const loginPage = new ChurchSuiteLoginPage(page);

  const username = await credentialProvider.get(credentials.usernameKey);
  const password = await credentialProvider.get(credentials.passwordKey);

  await loginPage.navigate();
  await loginPage.login(username, password);

  sessionStore.markLoggedIn(siteId);

  return { context, page };
}
