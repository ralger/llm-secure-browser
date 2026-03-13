import { ICredentialProvider } from '../../../core/credentials/index.js';
import { PaymentItemsPage } from '../pages/dashboard.page.js';
import { HomePage } from '../pages/home.page.js';
import { ensureLoggedIn, withAutoRelogin } from './login.action.js';
import { PARENTPAY_CONFIG } from '../config.js';

export interface TopUpRequest {
  consumerId: string;
  /** Amount in GBP. Must be between £0.01 and the configured maximum. */
  amountGbp: number;
}

export interface ChildTopUpResult {
  consumerId: string;
  success: boolean;
  message: string;
  /** New balance from the confirmation receipt, when available. */
  receiptBalanceGbp?: number;
}

export interface LiveBalance {
  name: string;
  consumerId: string;
  balanceGbp: number;
  balanceText: string;
}

export interface MultiTopUpResult {
  processedAt: string;
  topUps: ChildTopUpResult[];
  /** Live balances read from the home page after all top-ups complete. */
  balances: LiveBalance[];
}

/**
 * Validates then tops up one or more children's dinner money balances sequentially.
 * Returns per-child success/failure results and a live balance snapshot from the
 * home page, read after all top-ups have been attempted.
 *
 * Throws a plain Error with a user-facing message if any request exceeds the
 * configured maximum top-up amount — the caller should translate this to a 400.
 */
export function topUp(
  credentialProvider: ICredentialProvider,
  requests: TopUpRequest[],
): Promise<MultiTopUpResult> {
  const max = PARENTPAY_CONFIG.topUp.maxAmountGbp;
  for (const req of requests) {
    if (req.amountGbp <= 0 || req.amountGbp > 150) {
      throw new Error(
        `Amount for consumerId ${req.consumerId} (£${req.amountGbp.toFixed(2)}) must be between £0.01 and £150.00`,
      );
    }
    if (req.amountGbp > max) {
      throw new Error(
        `Top-up amount for consumerId ${req.consumerId} (£${req.amountGbp.toFixed(2)}) exceeds the maximum of £${max.toFixed(2)}`,
      );
    }
  }
  return withAutoRelogin(credentialProvider, () => _multiTopUp(credentialProvider, requests));
}

async function _multiTopUp(
  credentialProvider: ICredentialProvider,
  requests: TopUpRequest[],
): Promise<MultiTopUpResult> {
  const { context, page: firstPage, basePath } = await ensureLoggedIn(credentialProvider);
  await firstPage.close();

  const topUpResults: ChildTopUpResult[] = [];

  // ── Process each child sequentially ────────────────────────────────────────
  for (const req of requests) {
    const page = await context.newPage();
    try {
      const paymentItemsPage = new PaymentItemsPage(page, basePath);
      await paymentItemsPage.navigate(req.consumerId);
      const result = await paymentItemsPage.topUpDinnerMoney(req.amountGbp);
      topUpResults.push({
        consumerId: req.consumerId,
        success: result.success,
        message: result.message,
        ...(result.newBalanceGbp !== undefined && { receiptBalanceGbp: result.newBalanceGbp }),
      });
    } catch (err) {
      topUpResults.push({
        consumerId: req.consumerId,
        success: false,
        message: err instanceof Error ? err.message : 'Unexpected error during top-up',
      });
    } finally {
      await page.close().catch(() => {});
    }
  }

  // ── Fetch live balances from home page ─────────────────────────────────────
  let balances: LiveBalance[] = [];
  const homePage = await context.newPage();
  try {
    const home = new HomePage(homePage, basePath);
    await home.navigate();
    const children = await home.getChildren();
    balances = children.map((c) => ({
      name: c.name,
      consumerId: c.consumerId,
      balanceGbp: c.balanceGbp,
      balanceText: c.balanceText,
    }));
  } catch {
    // Balance read failure is non-fatal — return empty array
  } finally {
    await homePage.close().catch(() => {});
  }

  return {
    processedAt: new Date().toISOString(),
    topUps: topUpResults,
    balances,
  };
}
