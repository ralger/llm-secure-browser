import { Page } from 'playwright';
import { PLAYSTATION_CONFIG } from '../config.js';
import { generateTotpCode } from '../../../core/totp/index.js';

const { selectors, loginUrl, familyManagementUrl } = PLAYSTATION_CONFIG;

/**
 * Page Object Model for the Sony ID sign-in flow.
 *
 * Sony uses an OAuth redirect: navigating to the family management URL while
 * unauthenticated redirects here. After successful login + TOTP, Sony redirects
 * back to account.sonyentertainmentnetwork.com/familyManagement automatically.
 *
 * Login steps:
 *   1. navigate() → triggers the OAuth redirect to the sign-in page
 *   2. fillCredentials() → enter email and password
 *   3. submitCredentials() → click Sign In
 *   4. enterTotp() → wait for TOTP prompt, generate code, submit
 *   5. waitForFamilyManagement() → wait for post-login redirect
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  /** Navigate to family management, which redirects to sign-in if not authenticated */
  async navigate(): Promise<void> {
    await this.page.goto(familyManagementUrl, { waitUntil: 'domcontentloaded' });
    // Wait for the Sony sign-in page to fully render
    await this.page.waitForURL((url) => url.hostname.includes('sonyentertainmentnetwork.com'), {
      timeout: 15_000,
    });
    await this.page.waitForSelector(selectors.login.emailInput, { timeout: 15_000 });
  }

  async fillCredentials(username: string, password: string): Promise<void> {
    // Use pressSequentially (dispatches key events) to trigger Ember's two-way data
    // bindings — plain fill() sets the value directly and can miss Ember's input handlers.
    await this.page.locator(selectors.login.emailInput).pressSequentially(username, { delay: 60 });
    await this.page.locator(selectors.login.passwordInput).pressSequentially(password, { delay: 60 });
  }

  async submitCredentials(): Promise<void> {
    // Wait for the button to become enabled (Sony enables it only once both fields are non-empty)
    await this.page.waitForSelector(`${selectors.login.signInButton}:not([disabled])`, {
      timeout: 5_000,
    });
    await this.page.click(selectors.login.signInButton);
  }

  /**
   * Handles the TOTP 2FA step.
   * Waits for the OTP input to appear, generates the current code from the stored
   * secret, enters it, and submits — all within the 30-second TOTP window.
   *
   * The input selector is confirmed from Sony's Ember source (kekka bundle):
   *   pdr-text-field-v4 renders <input autocomplete="one-time-code"> with maxlength=6.
   */
  async enterTotp(totpSecret: string): Promise<void> {
    // Wait for TOTP page — Sony renders the code input after valid email+password
    await this.page.waitForSelector(selectors.totp.codeInput, { timeout: 15_000 });

    const code = await generateTotpCode(totpSecret);
    // Use fill() here — at this point the TOTP page is fully loaded and fill() is fine
    await this.page.fill(selectors.totp.codeInput, code);
    await this.page.click(selectors.totp.submitButton);
  }

  /** Waits for the post-login redirect back to the family management page */
  async waitForFamilyManagement(): Promise<void> {
    await this.page.waitForURL(
      (url) => url.toString().includes('familyManagement'),
      { timeout: 20_000 },
    );
    await this.page.waitForLoadState('networkidle');
  }

  isOnSignInPage(): boolean {
    return this.page.url().includes(loginUrl);
  }

  isOnFamilyManagement(): boolean {
    return this.page.url().includes('familyManagement');
  }
}
