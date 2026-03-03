import { ICredentialProvider } from '../../../core/credentials/index.js';
import { HomePage, ChildInfo } from '../pages/home.page.js';
import { StatementsPage, ParentAccountInfo } from '../pages/statements.page.js';
import { ensureLoggedIn } from './login.action.js';

export interface BalancesResult {
  parentAccount: ParentAccountInfo;
  children: ChildInfo[];
}

/**
 * Retrieves all balance information in a single call:
 * - Each child's dinner money balance (from Home page)
 * - Parent Account credit balance (from Statements page)
 *
 * Both pages are loaded in parallel on the same BrowserContext for speed.
 */
export async function getBalances(
  credentialProvider: ICredentialProvider,
): Promise<BalancesResult> {
  const { context, basePath } = await ensureLoggedIn(credentialProvider);

  const [homePage_p, statementsPage_p] = await Promise.all([
    context.newPage(),
    context.newPage(),
  ]);

  try {
    const [children, parentAccount] = await Promise.all([
      (async () => {
        const homePage = new HomePage(homePage_p, basePath);
        await homePage.navigate();
        return homePage.getChildren();
      })(),
      (async () => {
        const statementsPage = new StatementsPage(statementsPage_p, basePath);
        await statementsPage.navigate();
        return statementsPage.getParentAccountBalance();
      })(),
    ]);

    return { parentAccount, children };
  } finally {
    await Promise.all([
      homePage_p.close().catch(() => {}),
      statementsPage_p.close().catch(() => {}),
    ]);
  }
}

