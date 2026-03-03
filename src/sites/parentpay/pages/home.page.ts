import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';

const { selectors, appBaseUrl, paths } = PARENTPAY_CONFIG;

export interface ChildInfo {
  name: string;
  consumerId: string;
  /** Raw balance text e.g. "Dinner money balance: £0.10" */
  balanceText: string;
  /** Numeric balance parsed from balanceText, e.g. 0.10 */
  balanceGbp: number;
}

/**
 * Page Object Model for the ParentPay home/dashboard page.
 * URL: /V3Payer4W3/Payer/Default.aspx
 *
 * This page shows all children with their dinner money balances
 * and the parent account credit.
 */
export class HomePage {
  constructor(
    private readonly page: Page,
    private readonly basePath: string,
  ) {}

  async navigate(): Promise<void> {
    const url = `${appBaseUrl}${paths.home(this.basePath)}`;
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  async getChildren(): Promise<ChildInfo[]> {
    await this.page.waitForSelector(selectors.home.childSummaryLinks, { timeout: 10_000 });

    return this.page.evaluate(({ childSummaryLinks }) => {
      const links = Array.from(document.querySelectorAll(childSummaryLinks))
        .filter((a) => a.querySelector('h2')) as HTMLAnchorElement[];

      return links.map((link) => {
        const nameEl = link.querySelector('h2');
        const balancePara = Array.from(link.querySelectorAll('p')).find((p) =>
          p.textContent?.includes('balance'),
        );
        const href = link.getAttribute('href') ?? '';
        const consumerId = href.split('ConsumerId=')[1] ?? '';
        const balanceText = balancePara?.textContent?.trim() ?? '';
        // Parse "Dinner money balance: £3.00" → 3.00
        const balanceMatch = balanceText.match(/£([\d.]+)/);
        const balanceGbp = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

        return {
          name: nameEl?.textContent?.trim() ?? '',
          consumerId,
          balanceText,
          balanceGbp,
        };
      });
    }, { childSummaryLinks: selectors.home.childSummaryLinks });
  }

  async getParentAccountBalance(): Promise<number> {
    // Wait for the navbar credit link to be populated (loaded via JS after page render)
    await this.page.waitForSelector(selectors.home.parentCreditLink, { timeout: 8_000 }).catch(() => {});
    const creditLink = await this.page.$(selectors.home.parentCreditLink);
    const text = await creditLink?.textContent() ?? '';
    const match = text.match(/£([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }
}
