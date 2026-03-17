import { ICredentialProvider } from '../../../core/credentials/index.js';
import { SessionExpiredError } from '../../../core/errors.js';
import { ensureLoggedIn, isLoginRedirect, withAutoRelogin } from './login.action.js';
import { ChurchSuiteRotasPage, ChurchSuiteRota } from '../pages/rotas.page.js';
import { CHURCHSUITE_CONFIG } from '../config.js';

export interface GetRotasResult {
  fetchedAt: string;
  rotas: ChurchSuiteRota[];
}

export async function getRotas(credentialProvider: ICredentialProvider): Promise<GetRotasResult> {
  return withAutoRelogin(credentialProvider, async () => {
    const { page } = await ensureLoggedIn(credentialProvider);

    try {
      await page.goto(`${CHURCHSUITE_CONFIG.myUrl}/rotas`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      if (isLoginRedirect(page.url())) {
        throw new SessionExpiredError('ChurchSuite session expired before rotas fetch');
      }

      const rotasPage = new ChurchSuiteRotasPage(page);
      const rotas = await rotasPage.getRotas();

      return { fetchedAt: new Date().toISOString(), rotas };
    } finally {
      await page.close();
    }
  });
}
