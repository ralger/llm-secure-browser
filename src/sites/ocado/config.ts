/**
 * Ocado site configuration.
 * All URLs and selectors live here — update this file if the site changes.
 *
 * Explored via Playwright MCP on 2026-03-15.
 *
 * Product search, browse, and pricing are fully accessible WITHOUT login.
 * Search URL: /search?q={query}&sortBy=priceAscending
 * Product cards use hashed CSS class names but expose stable link href patterns.
 */
export const OCADO_CONFIG = {
  siteId: 'ocado',
  name: 'Ocado',
  appBaseUrl: 'https://www.ocado.com',

  selectors: {
    /**
     * Product search results page.
     * Products: anchor with href="/products/..." → walk up to container with Add button.
     * Price: >£X.XX< text pattern in container innerHTML.
     */
    search: {
      productLink: 'a[href*="/products/"]',
      addToTrolleyButton: 'button[aria-label*="Add"]',
      pricePattern: />£(\d+\.\d{2})</g,
      perUnitPattern: /\(£[\d.]+ per [^)]+\)/,
    },
  },

  paths: {
    home: () => 'https://www.ocado.com/',
    search: (query: string, sort: 'priceAscending' | 'priceDescending' | 'relevance' = 'relevance') =>
      `https://www.ocado.com/search?q=${encodeURIComponent(query)}&sortBy=${sort}`,
    product: (slug: string) => `https://www.ocado.com/products/${slug}`,
  },

  timeouts: {
    pageLoad: 60_000,
    searchResults: 30_000,
  },
} as const;
