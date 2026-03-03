import { ICredentialProvider } from '../../../core/credentials/index.js';
import { HomePage, ChildInfo } from '../pages/home.page.js';
import { ensureLoggedIn } from './login.action.js';

/**
 * Retrieves the current lunch money balances for all children
 * plus the parent account credit.
 */
export interface BalancesResult {
  children: ChildInfo[];
  parentAccountBalanceGbp: number;
}

export async function getBalances(
  credentialProvider: ICredentialProvider,
): Promise<BalancesResult> {
  const { page, basePath } = await ensureLoggedIn(credentialProvider);
  try {
    const homePage = new HomePage(page, basePath);
    await homePage.navigate();
    const children = await homePage.getChildren();
    const parentAccountBalanceGbp = await homePage.getParentAccountBalance();
    return { children, parentAccountBalanceGbp };
  } finally {
    await page.close();
  }
}

