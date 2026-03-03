import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';

const { selectors } = PARENTPAY_CONFIG;

export interface LoginResult {
  /** The user-specific base path, e.g. "/V3Payer4W3/" — extracted from post-login URL */
  basePath: string;
}

/**
 * Page Object Model for the ParentPay login page.
 * URL: https://app.parentpay.com/public/client/security/v5/#/login
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto(PARENTPAY_CONFIG.loginUrl, { waitUntil: 'domcontentloaded' });
  }

  async login(username: string, password: string): Promise<LoginResult> {
    await this.page.waitForSelector(selectors.login.usernameInput, { timeout: 10_000 });
    await this.page.fill(selectors.login.usernameInput, username);
    await this.page.fill(selectors.login.passwordInput, password);
    await this.page.click(selectors.login.submitButton);

    // Wait for redirect to the home/payer page (URL will contain the user base path)
    await this.page.waitForURL((url) => url.toString().includes('/Payer/Default.aspx'), {
      timeout: 20_000,
    });

    // Extract the user-specific base path, e.g. "/V3Payer4W3/"
    const match = new URL(this.page.url()).pathname.match(/^(\/[^/]+\/)/);
    const basePath = match ? match[1] : '/';

    return { basePath };
  }

  async isOnLoginPage(): Promise<boolean> {
    return this.page.url().includes('/login');
  }
}

