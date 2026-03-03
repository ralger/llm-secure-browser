import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';

const { appBaseUrl, paths } = PARENTPAY_CONFIG;

export interface PaymentItem {
  name: string;
  /** Running balance (e.g. for dinner money). Null for fixed-price items. */
  balanceGbp: number | null;
  /** Fixed price for one-off items. Null for balance-based items. */
  priceGbp: number | null;
  /** The internal item ID — used when initiating a top-up */
  itemId: string;
}

export interface TopUpResult {
  success: boolean;
  message: string;
  newBalanceGbp?: number;
}

/**
 * Page Object Model for the ParentPay child summary page.
 * URL: /V3Payer4W3/Home/ChildSummary.aspx?ConsumerId={id}
 *
 * Shows payment items (including dinner money balance) and recent meal activity.
 */
export class ChildSummaryPage {
  constructor(
    private readonly page: Page,
    private readonly basePath: string,
  ) {}

  async navigate(consumerId: string): Promise<void> {
    const url = `${appBaseUrl}${paths.childSummary(this.basePath, consumerId)}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /** Returns all visible payment items on the child summary page */
  async getPaymentItems(): Promise<PaymentItem[]> {
    await this.page.waitForSelector('dl', { timeout: 10_000 });
    return this.page.evaluate(() => {
      const items: Array<{ name: string; balanceGbp: number | null; priceGbp: number | null; itemId: string }> = [];
      // Each payment item card has a containing div with a View button whose id is the item id
      const viewButtons = document.querySelectorAll<HTMLButtonElement>('button[id]');
      viewButtons.forEach((btn) => {
        if (!btn.id || isNaN(Number(btn.id))) return;
        const card = btn.closest('[class]') || btn.parentElement?.parentElement;
        if (!card) return;
        const dds = card.querySelectorAll('dd');
        const name = dds[0]?.textContent?.trim() ?? '';
        const balanceText = dds[1]?.textContent?.trim() ?? '';
        const priceEl = btn.previousElementSibling;
        const priceText = priceEl?.textContent?.trim() ?? '';
        const balanceMatch = balanceText.match(/£([\d.]+)/);
        const priceMatch = priceText.match(/£([\d.]+)/);
        items.push({
          name,
          balanceGbp: balanceMatch ? parseFloat(balanceMatch[1]) : null,
          priceGbp: priceMatch && !balanceMatch ? parseFloat(priceMatch[1]) : null,
          itemId: btn.id,
        });
      });
      return items;
    });
  }

  /** Returns the dinner money payment item (School Dinner Money) for this child */
  async getDinnerMoneyItem(): Promise<PaymentItem | null> {
    const items = await this.getPaymentItems();
    return (
      items.find((i) => i.name.includes(PARENTPAY_CONFIG.selectors.childSummary.dinnerMoneyItemName)) ?? null
    );
  }

  /**
   * Top up the dinner money balance via the Parent Account credit.
   * Safe: only triggers "Pay by Parent Account" which deducts from the pre-loaded Parent Account balance.
   * @param itemId  The payment item ID (from getDinnerMoneyItem)
   * @param amountGbp  Amount in GBP (minimum £0.01)
   */
  async topUpByParentAccount(itemId: string, amountGbp: number): Promise<TopUpResult> {
    // Click the View button to open the payment panel
    await this.page.click(`button[id="${itemId}"]`);

    // Wait for the amount input
    const amountSelector = 'input[aria-label*="amount" i], #edit-amount, input[id*="amount"]';
    await this.page.waitForSelector(amountSelector, { timeout: 5_000 });

    await this.page.fill(amountSelector, amountGbp.toFixed(2));

    // Click "Pay by Parent Account"
    const payBtn = this.page.getByRole('button', { name: /Pay by Parent Account/i });
    await payBtn.click();

    // Wait for confirmation or error (page title or heading change)
    try {
      await this.page.waitForURL(/confirmation|receipt|success|Default/i, { timeout: 15_000 });
      return { success: true, message: `Top-up of £${amountGbp.toFixed(2)} submitted successfully.` };
    } catch {
      const heading = await this.page.$eval('h2, h3', (el) => el.textContent?.trim() ?? '').catch(() => '');
      return { success: false, message: heading || 'Top-up may have failed — check Parent Account.' };
    }
  }
}

