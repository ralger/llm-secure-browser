import { ICredentialProvider } from '../../../core/credentials/index.js';
import { DashboardPage, ChildBalance } from '../pages/dashboard.page.js';
import { ensureLoggedIn } from './login.action.js';

/**
 * Retrieves the current lunch money balances for all children.
 */
export async function getBalances(
  credentialProvider: ICredentialProvider,
): Promise<ChildBalance[]> {
  const { page } = await ensureLoggedIn(credentialProvider);
  try {
    const dashboard = new DashboardPage(page);
    return await dashboard.getChildBalances();
  } finally {
    await page.close();
  }
}
