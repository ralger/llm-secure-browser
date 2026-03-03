import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';
import { isLoginRedirect } from '../actions/login.action.js';
import { SessionExpiredError } from '../../../core/errors.js';

const { appBaseUrl, paths, selectors } = PARENTPAY_CONFIG;

export interface TopUpResult {
  success: boolean;
  message: string;
  newBalanceGbp?: number;
}

/**
 * Page Object Model for the ParentPay Payment Items page.
 * URL: /V3Payer4W3/Home/PaymentItems/PaymentItems.aspx?consumerId={id}
 *
 * Shows all active payment items for a child with inline top-up form.
 * Each item card lives in a repeater: #body_body_rptPaymentItems_PaymentItem_N
 * Clicking the View link expands an inline form with #edit-amount input.
 * Successful payment redirects to PostPaymentReceipt.aspx.
 */
export class PaymentItemsPage {
  constructor(
    private readonly page: Page,
    private readonly basePath: string,
  ) {}

  async navigate(consumerId: string): Promise<void> {
    const url = `${appBaseUrl}${paths.paymentItems(this.basePath, consumerId)}`;
    await this.page.goto(url, { waitUntil: 'networkidle' });
    if (isLoginRedirect(this.page.url())) throw new SessionExpiredError();
    await this._dismissOverlays();
  }

  /** Dismiss any overlays (cookie consent, feedback widgets) that block clicks */
  private async _dismissOverlays(): Promise<void> {
    // OneTrust cookie consent
    const cookieBtn = this.page.locator('#onetrust-accept-btn-handler');
    if (await cookieBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cookieBtn.click();
      await this.page.waitForSelector('#onetrust-consent-sdk', { state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    // Usabilla / GetFeedback overlay — hide via JS (no reliable close button)
    await this.page.evaluate(() => {
      document.querySelectorAll('.usabilla__overlay, [title="Usabilla Feedback Form"]').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    });
  }

  /**
   * Tops up the School Dinner Money balance using the Parent Account credit.
   * Finds the dinner money card, clicks View, fills amount, submits.
   */
  async topUpDinnerMoney(amountGbp: number): Promise<TopUpResult> {
    const dinnerMoneyName = selectors.childSummary.dinnerMoneyItemName;

    // Find the item card for School Dinner Money (repeater items: PaymentItem_0, _1, ...)
    const dinnerCard = this.page
      .locator('[id*="rptPaymentItems_PaymentItem_"]')
      .filter({ hasText: dinnerMoneyName });

    if ((await dinnerCard.count()) === 0) {
      return { success: false, message: `No "${dinnerMoneyName}" payment item found` };
    }

    // Click the View link to open the inline payment form
    await dinnerCard.getByRole('link', { name: 'View' }).click();

    // Wait for the amount input to appear inside the expanded form
    await this.page.waitForSelector('#edit-amount', { timeout: 8_000 });
    await this.page.fill('#edit-amount', amountGbp.toFixed(2));

    // Submit via Parent Account
    await this.page.getByRole('button', { name: /Pay by Parent Account/i }).click();

    // Successful payment redirects to PostPaymentReceipt.aspx
    try {
      await this.page.waitForURL(/PostPaymentReceipt/i, { timeout: 20_000 });

      // Extract new balance from the receipt table
      const receiptText = await this.page.locator('table').first().textContent().catch(() => '');
      const balanceMatch = receiptText?.match(/New balance:\s*£([\d.]+)/);
      const newBalanceGbp = balanceMatch ? parseFloat(balanceMatch[1]) : undefined;

      return {
        success: true,
        message: `Top-up of £${amountGbp.toFixed(2)} submitted successfully.`,
        newBalanceGbp,
      };
    } catch {
      const alertText = await this.page
        .$eval('[role="alert"]', (el) => el.textContent?.trim() ?? '')
        .catch(() => '');
      return { success: false, message: alertText || 'Top-up may have failed — check Parent Account.' };
    }
  }
}
