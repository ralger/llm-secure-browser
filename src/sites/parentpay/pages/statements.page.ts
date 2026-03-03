import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';

const { appBaseUrl, paths, selectors } = PARENTPAY_CONFIG;

export interface ParentAccountInfo {
  /** Current credit balance in GBP */
  balanceGbp: number;
  /** Raw text from the navbar link, e.g. "Parent Account credit available: £45.97" */
  rawText: string;
}

/**
 * Page Object Model for the ParentPay Parent Account Statements page.
 * URL: /V3Payer4W3/MyAccount/Statements/Statements.aspx
 *
 * This is the most reliable page to read the Parent Account credit balance:
 * the navbar link "Parent Account credit available: £XX.XX" is the primary
 * information on this page and is always populated before content renders.
 *
 * The statement table also shows running balances after each transaction,
 * but the navbar credit link is simpler and always current.
 */
export class StatementsPage {
  constructor(
    private readonly page: Page,
    private readonly basePath: string,
  ) {}

  async navigate(): Promise<void> {
    const url = `${appBaseUrl}${paths.statements(this.basePath)}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    // Dismiss OneTrust / Usabilla overlays that may block JS balance injection.
    await this.page
      .locator('#onetrust-accept-btn-handler')
      .click({ timeout: 3_000 })
      .catch(() => {});
  }

  async getParentAccountBalance(): Promise<ParentAccountInfo> {
    // Multiple links match a[href*="Statements.aspx"] — the sidebar "Parent Account"
    // link AND the navbar "Parent Account credit available: £X.XX" link.
    // We must check ALL matching elements, not just the first.
    await this.page.waitForFunction(
      (selector: string) => {
        const els = document.querySelectorAll(selector);
        return Array.from(els).some((el) => (el.textContent ?? '').includes('£'));
      },
      selectors.home.parentCreditLink,
      { timeout: 20_000 },
    );

    const texts = await this.page.$$eval(
      selectors.home.parentCreditLink,
      (els) => els.map((el) => el.textContent?.trim() ?? ''),
    );
    const rawText = texts.find((t) => t.includes('£')) ?? '';

    const match = rawText.match(/£([\d.]+)/);
    const balanceGbp = match ? parseFloat(match[1]) : 0;

    return { balanceGbp, rawText };
  }
}
