import { BrowserManager } from '../../../core/browser-manager.js';
import { ProductPage, OcadoProductDetail } from '../pages/product.page.js';

/**
 * Fetches full product details from the public Ocado BOP API.
 * No login required.
 *
 * @param retailerProductId  The numeric ID from the product URL, e.g. "78920011"
 */
export async function getProduct(retailerProductId: string): Promise<OcadoProductDetail> {
  const browser = BrowserManager.getInstance();
  const context = await browser.createContext();

  try {
    const page = await context.newPage();
    const productPage = new ProductPage(page);
    const result = await productPage.getProduct(retailerProductId);
    await page.close();
    return result;
  } finally {
    await context.close();
  }
}
