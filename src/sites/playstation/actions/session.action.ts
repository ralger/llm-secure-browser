import { BrowserContext, Page } from 'playwright';
import { ICredentialProvider } from '../../../core/credentials/index.js';
import { BrowserManager } from '../../../core/browser-manager.js';
import { LoginPage } from '../pages/login.page.js';
import { PLAYSTATION_CONFIG } from '../config.js';

const { credentials } = PLAYSTATION_CONFIG;

/**
 * Creates a fresh browser context, logs in to PlayStation Account Management
 * (handling TOTP automatically), runs the given action, then closes the context.
 *
 * Each API endpoint call gets its own isolated session.
 */
export async function withFreshSession<T>(
  credentialProvider: ICredentialProvider,
  action: (page: Page, context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await BrowserManager.getInstance().createContext();
  const page = await context.newPage();

  const username = await credentialProvider.get(credentials.usernameKey);
  const password = await credentialProvider.get(credentials.passwordKey);
  const totpSecret = await credentialProvider.get(credentials.totpSecretKey);

  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.fillCredentials(username, password);
  await loginPage.submitCredentials();
  await loginPage.enterTotp(totpSecret);
  await loginPage.waitForFamilyManagement();

  try {
    return await action(page, context);
  } finally {
    await context.close().catch(() => {});
  }
}

/** Returns true when the page URL indicates a session-expired redirect to login */
export function isLoginRedirect(url: string): boolean {
  return url.includes('id.sonyentertainmentnetwork.com/signin');
}
