import { Page } from 'playwright';
import { CHURCHSUITE_CONFIG } from '../config.js';

/**
 * Page Object Model for ChurchSuite member login.
 *
 * Flow:
 *  1. goto /my  → Cloudflare challenge auto-solves → /my/landing
 *  2. Click "Log in" → redirects to login.churchsuite.com (with OAuth state param)
 *  3. Fill username + password → click Next → redirects back to /my
 *
 * NOTE: Cloudflare WILL block headless browsers. Run with BROWSER_HEADLESS=false + xvfb-run.
 */
export class ChurchSuiteLoginPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    // This triggers Cloudflare → challenge auto-solves → lands on /my/landing
    await this.page.goto(CHURCHSUITE_CONFIG.myUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await this.page.waitForURL(
      (url) => this.isPostChallengeUrl(url.toString()),
      { timeout: 30_000 },
    );
  }

  async login(username: string, password: string): Promise<void> {
    const currentUrl = this.page.url();

    // Already logged in
    if (!currentUrl.includes('/my/landing')) return;

    await this.page.click(CHURCHSUITE_CONFIG.selectors.landing.loginButton);

    // Wait for login.churchsuite.com (OAuth redirect with state param)
    await this.page.waitForURL(
      (url) => url.hostname === CHURCHSUITE_CONFIG.loginHost,
      { timeout: 15_000 },
    );

    await this.page.waitForSelector(CHURCHSUITE_CONFIG.selectors.login.usernameInput, {
      timeout: 10_000,
    });
    await this.page.fill(CHURCHSUITE_CONFIG.selectors.login.usernameInput, username);
    await this.page.fill(CHURCHSUITE_CONFIG.selectors.login.passwordInput, password);
    await this.page.click(CHURCHSUITE_CONFIG.selectors.login.nextButton);

    // Wait for redirect back to member portal
    await this.page.waitForURL(
      (url) => url.hostname.endsWith('churchsuite.com') && url.toString().includes('/my'),
      { timeout: 20_000 },
    );
  }

  /** Returns true if the URL is any post-Cloudflare-challenge /my/* page */
  private isPostChallengeUrl(url: string): boolean {
    return url.includes(`${CHURCHSUITE_CONFIG.baseUrl}/my/`);
  }

  async isOnLandingPage(): Promise<boolean> {
    return this.page.url().includes('/my/landing');
  }
}
