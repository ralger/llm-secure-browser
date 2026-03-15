import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import { BrowserManager } from '../../../core/browser-manager.js';
import { DeliverabilityPage } from '../pages/deliverability.page.js';
import type { OcadoDeliverabilityResult } from '../pages/deliverability.page.js';

/**
 * Integration tests for Ocado deliverability check.
 * Tests real postcodes against the live Ocado API.
 */

let sharedContext: BrowserContext;
let sharedPage: Page;
let londonResult: OcadoDeliverabilityResult;
let invernessResult: OcadoDeliverabilityResult;

beforeAll(async () => {
  const browser = BrowserManager.getInstance();
  sharedContext = await browser.createContext();
  sharedPage = await sharedContext.newPage();

  const delivPage = new DeliverabilityPage(sharedPage);

  // Run both checks — London (deliverable) and Inverness (not deliverable)
  londonResult = await delivPage.checkDeliverability('SW1A 1AA');
  invernessResult = await delivPage.checkDeliverability('IV1 1EH');
}, 120_000);

afterAll(async () => {
  await sharedPage?.close();
  await sharedContext?.close();
});

describe('Ocado DeliverabilityPage — SW1A 1AA (central London)', () => {
  it('returns DELIVERABLE for central London', () => {
    expect(londonResult.postcode).toBe('SW1A 1AA');
    expect(londonResult.deliverability).toBe('DELIVERABLE');
  });

  it('includes delivery details when deliverable', () => {
    expect(londonResult.deliveryDetails).toBeDefined();
    const d = londonResult.deliveryDetails!;
    expect(d.deliveryDestinationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(d.formattedAddress).toContain('SW1A 1AA');
    expect(d.deliveryType).toBe('BRANDED_VAN');
    expect(d.deliveryMethod).toBe('HOME_DELIVERY');
    expect(d.resolvedRegionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(d.coordinates.latitude).toBeCloseTo(51.5, 0);
    expect(d.coordinates.longitude).toBeCloseTo(-0.14, 0);
  });

  it('includes delivery propositions', () => {
    expect(londonResult.deliveryDetails!.propositions.length).toBeGreaterThan(0);
    const prop = londonResult.deliveryDetails!.propositions[0];
    expect(prop.deliveryPropositionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(prop.regionId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('Ocado DeliverabilityPage — IV1 1EH (Inverness, Highlands)', () => {
  it('returns NOT_DELIVERABLE for remote Highland postcode', () => {
    expect(invernessResult.postcode).toBe('IV1 1EH');
    expect(invernessResult.deliverability).toBe('NOT_DELIVERABLE');
    expect(invernessResult.deliveryDetails).toBeUndefined();
  });
});
