import { ICredentialProvider } from '../../../core/credentials/index.js';
import { StatementsPage, ParentAccountInfo } from '../pages/statements.page.js';
import { ensureLoggedIn } from './login.action.js';

/**
 * Fetches the current Parent Account credit balance by navigating to the
 * Statements page — the most reliable source for this figure.
 */
export async function getParentAccount(
  credentialProvider: ICredentialProvider,
): Promise<ParentAccountInfo> {
  const { page, basePath } = await ensureLoggedIn(credentialProvider);
  try {
    const statementsPage = new StatementsPage(page, basePath);
    await statementsPage.navigate();
    return await statementsPage.getParentAccountBalance();
  } finally {
    await page.close();
  }
}
