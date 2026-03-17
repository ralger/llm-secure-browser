import { ICredentialProvider } from '../../../core/credentials/index.js';
import { SessionExpiredError } from '../../../core/errors.js';
import { ensureLoggedIn, isLoginRedirect, withAutoRelogin } from './login.action.js';
import { ChurchSuiteEventsPage, ChurchSuiteEvent } from '../pages/events.page.js';
import { CHURCHSUITE_CONFIG } from '../config.js';

export interface GetEventsResult {
  fetchedAt: string;
  events: ChurchSuiteEvent[];
}

export async function getEvents(credentialProvider: ICredentialProvider): Promise<GetEventsResult> {
  return withAutoRelogin(credentialProvider, async () => {
    const { page } = await ensureLoggedIn(credentialProvider);

    try {
      // Navigate to the member portal events area to ensure we have a valid session page
      await page.goto(`${CHURCHSUITE_CONFIG.myUrl}/events`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      if (isLoginRedirect(page.url())) {
        throw new SessionExpiredError('ChurchSuite session expired before events fetch');
      }

      const eventsPage = new ChurchSuiteEventsPage(page);
      const events = await eventsPage.getEvents();

      return { fetchedAt: new Date().toISOString(), events };
    } finally {
      await page.close();
    }
  });
}
