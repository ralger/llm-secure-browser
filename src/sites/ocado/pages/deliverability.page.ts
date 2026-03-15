import { Page } from 'playwright';
import { OCADO_CONFIG } from '../config.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OcadoDeliverabilityResult {
  postcode: string;
  /** "DELIVERABLE" | "NOT_DELIVERABLE" */
  deliverability: string;
  /** Only present when deliverable */
  deliveryDetails?: {
    /** UUID for this temporary delivery destination */
    deliveryDestinationId: string;
    formattedAddress: string;
    coordinates: { latitude: number; longitude: number };
    /** "BRANDED_VAN" | "THIRD_PARTY" */
    deliveryType: string;
    /** "HOME_DELIVERY" */
    deliveryMethod: string;
    /** Ocado's region UUID — used in search/cart APIs */
    resolvedRegionId: string;
    timeZoneId: string;
    propositions: Array<{
      deliveryPropositionId: string;
      propositionType: string;
      regionId: string;
    }>;
  };
}

interface PostcodesIoResult {
  latitude: number;
  longitude: number;
  /** e.g. "Manchester" */
  admin_district: string;
  /** e.g. "England" */
  country: string;
  postcode: string;
}

/**
 * Page Object for Ocado delivery area check.
 *
 * Uses the public deliverability API (same-origin, CSRF-protected) to check
 * whether a given UK postcode falls within Ocado's delivery area.
 *
 * Geocoding is done via the free api.postcodes.io — no API key required.
 *
 * Discovered via Playwright MCP, 2026-03-15.
 * API flow:
 *   1. PUT  /api/ecomdeliverydestinations/v2/deliverability   → DELIVERABLE / NOT_DELIVERABLE
 *   2. POST /api/ecomdeliverydestinations/v2/temporary-delivery-destinations → UUID
 *   3. GET  /api/ecomdeliverydestinations/v4/delivery-addresses/{UUID} → full address
 */
export class DeliverabilityPage {
  constructor(private readonly page: Page) {}

  async checkDeliverability(postcode: string): Promise<OcadoDeliverabilityResult> {
    const normalised = postcode.trim().toUpperCase().replace(/\s+/g, ' ');

    // 1. Geocode the postcode via postcodes.io (free, no auth needed)
    const geo = await this.geocodePostcode(normalised);

    // 2. Ensure we are on ocado.com so same-origin APIs work and CSRF token is set
    if (!this.page.url().includes('ocado.com')) {
      await this.page.goto(OCADO_CONFIG.paths.home(), {
        waitUntil: 'domcontentloaded',
        timeout: OCADO_CONFIG.timeouts.pageLoad,
      });
    }

    // 3. Run the deliverability check and optional destination set inside the page
    const result = await this.page.evaluate(
      async ({ geo, postcode: pc }: { geo: PostcodesIoResult; postcode: string }) => {
        const state = (window as any).__INITIAL_STATE__;
        const csrfToken: string = state?.session?.csrf?.token ?? '';
        const visitorId: string = state?.session?.metadata?.visitorId ?? crypto.randomUUID();

        const headers = {
          'X-CSRF-TOKEN': csrfToken,
          'client-route-id': crypto.randomUUID(),
          'ecom-request-source': 'web',
          'accept': 'application/json; charset=utf-8',
          'content-type': 'application/json; charset=utf-8',
        };

        // PUT deliverability check
        const delivRes = await fetch('/api/ecomdeliverydestinations/v2/deliverability', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            latitude: geo.latitude,
            longitude: geo.longitude,
            postalCode: pc,
          }),
        });
        const delivBody: { deliverability: string } = await delivRes.json();

        if (delivBody.deliverability !== 'DELIVERABLE') {
          return { deliverability: delivBody.deliverability };
        }

        // POST to create a temporary delivery destination
        const postRes = await fetch('/api/ecomdeliverydestinations/v2/temporary-delivery-destinations', {
          method: 'POST',
          headers: { ...headers, 'client-route-id': crypto.randomUUID() },
          body: JSON.stringify({
            visitorId,
            latitude: geo.latitude,
            longitude: geo.longitude,
            postalCode: pc,
            formattedAddress: `${pc}, UK`,
          }),
        });
        const destId: string = await postRes.json();

        // GET full address details
        const addrRes = await fetch(`/api/ecomdeliverydestinations/v4/delivery-addresses/${destId}`);
        const addr = await addrRes.json();

        return {
          deliverability: 'DELIVERABLE',
          deliveryDetails: {
            deliveryDestinationId: addr.deliveryDestinationId,
            formattedAddress: addr.formattedAddress,
            coordinates: addr.coordinates,
            deliveryType: addr.deliveryType,
            deliveryMethod: addr.deliveryMethod,
            resolvedRegionId: addr.resolvedRegionId,
            timeZoneId: addr.timeZoneId,
            propositions: addr.propositions ?? [],
          },
        };
      },
      { geo, postcode: normalised },
    );

    return { postcode: normalised, ...result };
  }

  private async geocodePostcode(postcode: string): Promise<PostcodesIoResult> {
    // Use fetch inside Node (via page.evaluate would mean same-origin); use Node's fetch
    const encoded = encodeURIComponent(postcode);
    const res = await fetch(`https://api.postcodes.io/postcodes/${encoded}`);
    if (!res.ok) {
      throw new Error(`Postcode not found: ${postcode} (api.postcodes.io returned ${res.status})`);
    }
    const json = (await res.json()) as { result: PostcodesIoResult };
    const r = json.result;
    if (!r?.latitude || !r?.longitude) {
      throw new Error(`Could not geocode postcode: ${postcode}`);
    }
    return r;
  }
}
