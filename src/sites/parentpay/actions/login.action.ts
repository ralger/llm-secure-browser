import { BrowserContext, Page } from 'playwright';
import { ICredentialProvider } from '../../../core/credentials/index.js';
import { SessionStore } from '../../../core/session-store.js';
import { BrowserManager } from '../../../core/browser-manager.js';
import { LoginPage } from '../pages/login.page.js';
import { PARENTPAY_CONFIG } from '../config.js';

const { siteId, credentials } = PARENTPAY_CONFIG;

/**
 * Ensures the ParentPay session is authenticated.
 * Returns an active Page ready for use.
 *
 * - Re-uses an existing logged-in context if available.
 * - Creates a new context and logs in if not.
 */
export async function ensureLoggedIn(
  credentialProvider: ICredentialProvider,
): Promise<{ context: BrowserContext; page: Page }> {
  const sessionStore = SessionStore.getInstance();
  const browserManager = BrowserManager.getInstance();

  let entry = sessionStore.get(siteId);

  if (entry && entry.loggedIn) {
    const page = await entry.context.newPage();
    return { context: entry.context, page };
  }

  // No session or not logged in — create a fresh context
  if (entry) {
    await sessionStore.clearSession(siteId);
  }

  const context = await browserManager.createContext();
  sessionStore.set(siteId, context, false);

  const page = await context.newPage();
  const loginPage = new LoginPage(page);

  const username = await credentialProvider.get(credentials.usernameKey);
  const password = await credentialProvider.get(credentials.passwordKey);

  await loginPage.navigate();
  await loginPage.login(username, password);

  sessionStore.markLoggedIn(siteId);

  return { context, page };
}
