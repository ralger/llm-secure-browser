import { ICredentialProvider } from '../../../core/credentials/index.js';
import { ChildSummaryPage, TopUpResult } from '../pages/dashboard.page.js';
import { ensureLoggedIn } from './login.action.js';
import { PARENTPAY_CONFIG } from '../config.js';

export interface TopUpOptions {
  consumerId: string;
  /** Amount in GBP. Minimum £0.01 (system), but school may require £5 minimum. */
  amountGbp: number;
}

/**
 * Tops up a child's dinner money balance via the Parent Account credit.
 * Uses the pre-loaded Parent Account balance (no new card charges).
 * Maximum £150 per transaction.
 */
export async function topUp(
  credentialProvider: ICredentialProvider,
  options: TopUpOptions,
): Promise<TopUpResult> {
  if (options.amountGbp <= 0 || options.amountGbp > 150) {
    return { success: false, message: 'Amount must be between £0.01 and £150.00' };
  }

  const { page, basePath } = await ensureLoggedIn(credentialProvider);
  try {
    const summaryPage = new ChildSummaryPage(page, basePath);
    await summaryPage.navigate(options.consumerId);

    const dinnerItem = await summaryPage.getDinnerMoneyItem();
    if (!dinnerItem) {
      return {
        success: false,
        message: `No "${PARENTPAY_CONFIG.selectors.childSummary.dinnerMoneyItemName}" payment item found for consumerId ${options.consumerId}`,
      };
    }

    return await summaryPage.topUpByParentAccount(dinnerItem.itemId, options.amountGbp);
  } finally {
    await page.close();
  }
}
