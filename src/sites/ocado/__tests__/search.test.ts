import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import { BrowserManager } from '../../../core/browser-manager.js';
import { SearchPage, OcadoProduct } from '../pages/search.page.js';
import { ProductPage, OcadoProductDetail } from '../pages/product.page.js';

/**
 * Integration tests for Ocado product search and product detail (no login required).
 * One shared browser context for the whole file — avoids repeated cold navigations.
 */

let sharedContext: BrowserContext;
let sharedPage: Page;
let products: OcadoProduct[];
let milkDetail: OcadoProductDetail;

beforeAll(async () => {
  const browser = BrowserManager.getInstance();
  sharedContext = await browser.createContext();
  sharedPage = await sharedContext.newPage();

  // Search (navigates to ocado.com — establishes session)
  const searchPage = new SearchPage(sharedPage);
  products = await searchPage.search('4 pint full cream milk', 'priceAscending');

  // Product detail via BOP API (same-origin fetch, page already on ocado.com)
  const productPage = new ProductPage(sharedPage);
  milkDetail = await productPage.getProduct('78920011');
}, 120_000);

afterAll(async () => {
  await sharedPage?.close();
  await sharedContext?.close();
});

describe('Ocado SearchPage — 4 pint full cream milk', () => {
  it('returns at least one product with a numeric retailerProductId', () => {
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(product.retailerProductId).toMatch(/^\d+$/);
    }
  });

  it('returns products sorted cheapest first with valid prices', () => {
    for (const product of products) {
      expect(product.name.length).toBeGreaterThan(0);
      expect(product.pricePence).toBeGreaterThan(0);
      expect(Number.isInteger(product.pricePence)).toBe(true);
      expect(product.price).toMatch(/^£\d+\.\d{2}$/);
      expect(product.url).toMatch(/^https:\/\/www\.ocado\.com\/products\//);
      expect(product.retailerProductId).toMatch(/^\d+$/);
    }
    for (let i = 1; i < products.length; i++) {
      expect(products[i].pricePence).toBeGreaterThanOrEqual(products[i - 1].pricePence);
    }
    // Cheapest 4-pint milk is under £2 (market expectation)
    expect(products[0].pricePence).toBeLessThan(200);
  });

  it('includes at least one product with "milk" in the name', () => {
    const milkProducts = products.filter(p => /milk/i.test(p.name));
    expect(milkProducts.length).toBeGreaterThan(0);
  });
});

describe('Ocado ProductPage — BOP API (78920011)', () => {
  it('returns correct IDs', () => {
    expect(milkDetail.retailerProductId).toBe('78920011');
    expect(milkDetail.productId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('has name, brand, size and price', () => {
    expect(milkDetail.name).toContain('Milk');
    expect(milkDetail.brand).toBeTruthy();
    expect(milkDetail.packSizeDescription).toBeTruthy();
    expect(milkDetail.price.currency).toBe('GBP');
    expect(parseFloat(milkDetail.price.amount)).toBeGreaterThan(0);
  });

  it('is in stock with shelf life and category path', () => {
    expect(milkDetail.available).toBe(true);
    expect(milkDetail.guaranteedProductLife).not.toBeNull();
    expect(milkDetail.categoryPath.length).toBeGreaterThan(0);
  });

  it('has image URL and nutritional data', () => {
    expect(milkDetail.imageUrl).toMatch(/^https:\/\/www\.ocado\.com\/images/);
    expect(milkDetail.fields['nutritionalData']).toBeTruthy();
  });
});
