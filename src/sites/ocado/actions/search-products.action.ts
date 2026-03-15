import { BrowserManager } from '../../../core/browser-manager.js';
import { SearchPage, OcadoProduct, SortOrder } from '../pages/search.page.js';

export async function searchProducts(
  query: string,
  sort: SortOrder = 'priceAscending',
  maxItems = 20,
): Promise<{ query: string; sort: SortOrder; fetchedAt: string; products: OcadoProduct[] }> {
  const browser = BrowserManager.getInstance();
  const context = await browser.createContext();

  try {
    const page = await context.newPage();
    const searchPage = new SearchPage(page);
    const products = await searchPage.search(query, sort);
    await page.close();

    return {
      query,
      sort,
      fetchedAt: new Date().toISOString(),
      products: products.slice(0, maxItems),
    };
  } finally {
    await context.close();
  }
}
