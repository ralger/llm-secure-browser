import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';

const { selectors } = PARENTPAY_CONFIG;

export interface ChildBalance {
  name: string;
  balance: string;
}

/**
 * Page Object Model for the ParentPay dashboard / account overview.
 *
 * NOTE: Selectors are placeholders — update after MCP site exploration.
 */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  async getChildBalances(): Promise<ChildBalance[]> {
    // TODO: implement after MCP exploration reveals the correct selectors
    await this.page.waitForSelector(selectors.dashboard.childBalanceRows, { timeout: 10_000 });
    const rows = await this.page.$$(selectors.dashboard.childBalanceRows);
    const balances: ChildBalance[] = [];
    for (const row of rows) {
      const name = await row.$eval(selectors.dashboard.childName, (el) => el.textContent?.trim() ?? '');
      const balance = await row.$eval(selectors.dashboard.balance, (el) => el.textContent?.trim() ?? '');
      balances.push({ name, balance });
    }
    return balances;
  }
}
