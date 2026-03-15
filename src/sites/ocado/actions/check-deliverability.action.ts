import { BrowserManager } from '../../../core/browser-manager.js';
import { DeliverabilityPage } from '../pages/deliverability.page.js';
import type { OcadoDeliverabilityResult } from '../pages/deliverability.page.js';

/**
 * Checks whether Ocado delivers to the given UK postcode.
 * No login required — uses the public deliverability API.
 */
export async function checkDeliverability(postcode: string): Promise<OcadoDeliverabilityResult> {
  const browser = BrowserManager.getInstance();
  const context = await browser.createContext();

  try {
    const page = await context.newPage();
    const delivPage = new DeliverabilityPage(page);
    const result = await delivPage.checkDeliverability(postcode);
    await page.close();
    return result;
  } finally {
    await context.close();
  }
}
