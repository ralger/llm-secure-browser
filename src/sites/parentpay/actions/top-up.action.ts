import { ICredentialProvider } from '../../../core/credentials/index.js';
import { PaymentItemsPage, TopUpResult } from '../pages/dashboard.page.js';
import { ensureLoggedIn, withAutoRelogin } from './login.action.js';

export interface TopUpOptions {
  consumerId: string;
  /** Amount in GBP. Minimum £0.01 (system), but school may recommend £5 minimum. */
  amountGbp: number;
}

/**
 * Tops up a child's dinner money balance via the Parent Account credit.
 * Uses the pre-loaded Parent Account balance (no new card charges).
 * Maximum £150 per transaction.
 */
export function topUp(
  credentialProvider: ICredentialProvider,
  options: TopUpOptions,
): Promise<TopUpResult> {
  if (options.amountGbp <= 0 || options.amountGbp > 150) {
    return Promise.resolve({ success: false, message: 'Amount must be between £0.01 and £150.00' });
  }
  return withAutoRelogin(credentialProvider, () => _topUp(credentialProvider, options));
}

async function _topUp(
  credentialProvider: ICredentialProvider,
  options: TopUpOptions,
): Promise<TopUpResult> {
  const { page, basePath } = await ensureLoggedIn(credentialProvider);
  try {
    const paymentItemsPage = new PaymentItemsPage(page, basePath);
    await paymentItemsPage.navigate(options.consumerId);
    return await paymentItemsPage.topUpDinnerMoney(options.amountGbp);
  } finally {
    await page.close();
  }
}
