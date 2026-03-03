import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';

const { selectors } = PARENTPAY_CONFIG;

/**
 * Page Object Model for the ParentPay login page.
 * Encapsulates all interaction with the login form.
 *
 * NOTE: Selectors are placeholders — update after MCP site exploration.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto(PARENTPAY_CONFIG.loginUrl, { waitUntil: 'networkidle' });
  }

  async login(username: string, password: string): Promise<void> {
    await this.page.fill(selectors.login.usernameInput, username);
    await this.page.fill(selectors.login.passwordInput, password);
    await this.page.click(selectors.login.submitButton);
    // Wait for navigation away from the login page
    await this.page.waitForURL((url) => !url.toString().includes('/login'), {
      timeout: 15_000,
    });
  }

  async isOnLoginPage(): Promise<boolean> {
    return this.page.url().includes('/login');
  }
}
