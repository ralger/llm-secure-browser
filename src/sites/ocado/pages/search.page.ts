import { Page } from 'playwright';
import { OCADO_CONFIG } from '../config.js';

const { paths, timeouts } = OCADO_CONFIG;

export type SortOrder = 'priceAscending' | 'priceDescending' | 'relevance';

export interface OcadoProduct {
  name: string;
  /** Numeric product ID from URL, e.g. "78920011" */
  retailerProductId: string;
  /** Total product price e.g. "£1.65" */
  price: string;
  /** Numeric price in pence for sorting, e.g. 165 */
  pricePence: number;
  /** Per-unit price string e.g. "(£0.73 per litre)" */
  perUnit: string | null;
  url: string;
}

/**
 * Page Object Model for Ocado product search results.
 * No login required — fully public.
 *
 * Ocado uses hashed CSS class names; we anchor on:
 *   - `a[href*="/products/"]`        → product links
 *   - `button[aria-label*="Add"]`    → signals we're in a product card
 *   - `>£X.XX<` in innerHTML         → price text nodes
 */
export class SearchPage {
  constructor(private readonly page: Page) {}

  async search(query: string, sort: SortOrder = 'priceAscending'): Promise<OcadoProduct[]> {
    await this.page.goto(paths.search(query, sort), {
      waitUntil: 'domcontentloaded',
      timeout: timeouts.pageLoad,
    });

    // Wait for at least one product link to be present, or a no-results message
    await this.page
      .locator('a[href*="/products/"], h2:has-text("no results"), h1:has-text("no results")')
      .first()
      .waitFor({ state: 'visible', timeout: timeouts.searchResults })
      .catch(() => {});

    return this.extractProducts();
  }

  private extractProducts(): Promise<OcadoProduct[]> {
    return this.page.evaluate(() => {
      const productLinks = document.querySelectorAll<HTMLAnchorElement>('a[href*="/products/"]');
      const seen = new Set<string>();
      const results: Array<{
        name: string;
        retailerProductId: string;
        price: string;
        pricePence: number;
        perUnit: string | null;
        url: string;
      }> = [];

      productLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || seen.has(href)) return;
        seen.add(href);

        const name = link.textContent?.trim();
        if (!name || name.length < 5) return;

        // Walk up the DOM until we reach a container that holds an "Add to trolley" button
        let card: Element | null = link;
        for (let i = 0; i < 12; i++) {
          card = card?.parentElement ?? null;
          if (!card) break;
          if (!card.querySelector('button[aria-label*="Add"]')) continue;

          // Extract price: match >£X.XX< (text node boundaries) to avoid per-unit prices in parens
          const priceMatches = (card.innerHTML.match(/>£(\d+\.\d{2})</g) ?? []).map(m =>
            m.replace('>', '').replace('<', ''),
          );

          const perUnitMatch = card.textContent?.match(/\(£[\d.]+ per [^)]+\)/);
          const totalPrice = priceMatches[0] ?? null;

          if (totalPrice) {
            // Extract numeric ID from URL: /products/{slug}/{id}
            const idMatch = href.match(/\/products\/[^/]+\/(\d+)/);
            results.push({
              name,
              retailerProductId: idMatch ? idMatch[1] : '',
              price: totalPrice,
              pricePence: Math.round(parseFloat(totalPrice.replace('£', '')) * 100),
              perUnit: perUnitMatch ? perUnitMatch[0] : null,
              url: `https://www.ocado.com${href}`,
            });
          }
          break;
        }
      });

      return results;
    });
  }
}
