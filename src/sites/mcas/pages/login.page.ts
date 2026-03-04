import { Page } from 'playwright';
import { MCAS_CONFIG } from '../config.js';

const { selectors, loginUrl, dashboardUrl } = MCAS_CONFIG;

/**
 * Page Object Model for the MCAS parent login page.
 * URL: https://www.mychildatschool.com/MCAS/MCSParentLogin
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  }

  async login(username: string, password: string): Promise<void> {
    await this.page.waitForSelector(selectors.login.emailInput, { timeout: 10_000 });
    await this.page.fill(selectors.login.emailInput, username);
    await this.page.fill(selectors.login.passwordInput, password);
    await this.page.click(selectors.login.loginButton);

    // Wait until redirected to the dashboard
    await this.page.waitForURL(
      (url) => url.toString().includes('/MCAS/MCSDashboardPage'),
      { timeout: 20_000 },
    );
  }

  isOnLoginPage(): boolean {
    return this.page.url().includes('/MCSParentLogin');
  }

  isDashboard(): boolean {
    return this.page.url().includes('/MCSDashboardPage');
  }
}
