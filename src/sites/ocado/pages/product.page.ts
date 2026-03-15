import { Page } from 'playwright';
import { OCADO_CONFIG } from '../config.js';

const { timeouts } = OCADO_CONFIG;

// ── Types mirroring the /api/webproductpagews/v5/products/bop response ────────

export interface OcadoProductDetail {
  /** Internal UUID, e.g. "7af52d5a-b86e-47a5-9047-aa1d222b365f" */
  productId: string;
  /** Numeric ID matching the URL, e.g. "78920011" */
  retailerProductId: string;
  name: string;
  brand: string;
  /** Pack size description, e.g. "2.272L" */
  packSizeDescription: string;
  type: string;
  price: { amount: string; currency: string };
  unitPrice: { price: { amount: string; currency: string }; unit: string } | null;
  available: boolean;
  /** Shelf life guarantee, e.g. { quantity: 1, unit: "WEEK" } */
  guaranteedProductLife: { quantity: number; unit: string } | null;
  /** Category breadcrumb, e.g. ["Fresh & Chilled Food", "Dairy & Eggs", "Milk", "Fresh Milk", "Whole"] */
  categoryPath: string[];
  /** Lifestyle/quality badges e.g. [{label: "Vegetarian", file: "vegetarian"}] */
  iconAttributes: Array<{ label: string; file: string }>;
  promotions: Array<{
    promoId: string;
    retailerPromotionId: string;
    description: string;
    longDescription: string;
    type: string;
    presentationMode: string;
  }>;
  ratingSummary: { overallRating: string; count: number } | null;
  /** Primary image URL (300x300 jpg) */
  imageUrl: string;
  /** Available image resolutions and formats */
  imageConfig: { availableFormats: string[]; availableResolutions: string[] };
  /**
   * Structured product fields from bopData.fields.
   * Keys: countryOfOrigin, nutritionalData (HTML table), storage, packageType,
   *       recyclingInformation, otherInformation, brand, manufacturer, recipes, ingredients, allergens, etc.
   */
  fields: Record<string, string>;
  /** Full product description (may contain HTML) */
  detailedDescription: string;
  /** Category breadcrumb items with IDs and URLs */
  breadcrumbs: Array<{ name: string; id: string }>;
}

/**
 * Page Object Model for Ocado product detail — uses the public BOP REST API.
 * No login required. Navigate to any Ocado page first so the session/cookies are set.
 *
 * API: GET /api/webproductpagews/v5/products/bop?retailerProductId={id}
 */
export class ProductPage {
  constructor(private readonly page: Page) {}

  /**
   * Fetches full product details for the given `retailerProductId` (the numeric ID in the product URL).
   * Navigate to ocado.com first if you haven't already — the API is same-origin.
   */
  async getProduct(retailerProductId: string): Promise<OcadoProductDetail> {
    // Ensure we're on the Ocado domain so the same-origin API fetch works
    const currentUrl = this.page.url();
    if (!currentUrl.includes('ocado.com')) {
      await this.page.goto(OCADO_CONFIG.paths.home(), {
        waitUntil: 'domcontentloaded',
        timeout: timeouts.pageLoad,
      });
    }

    return this.page.evaluate(async (productId: string) => {
      const res = await fetch(`/api/webproductpagews/v5/products/bop?retailerProductId=${productId}`);
      if (!res.ok) throw new Error(`BOP API returned ${res.status} for product ${productId}`);
      const data = await res.json();

      const p = data.product;
      const bop = data.bopData ?? {};
      const fields: Record<string, string> = {};
      (bop.fields ?? []).forEach((f: { title: string; content: string }) => {
        fields[f.title] = f.content;
      });

      const breadcrumbs = (bop.breadcrumbs ?? []).map((b: { name: string; item?: { '@id': string } }) => ({
        name: b.name,
        id: b.item?.['@id'] ?? '',
      }));

      return {
        productId: p.productId,
        retailerProductId: p.retailerProductId,
        name: p.name,
        brand: p.brand,
        packSizeDescription: p.packSizeDescription,
        type: p.type,
        price: p.price,
        unitPrice: p.unitPrice ?? null,
        available: p.available,
        guaranteedProductLife: p.guaranteedProductLife ?? null,
        categoryPath: p.categoryPath ?? [],
        iconAttributes: p.iconAttributes ?? [],
        promotions: (data.bopPromotions ?? []).map((pr: {
          promoId: string; retailerPromotionId: string; description: string;
          longDescription: string; type: string; presentationMode: string;
        }) => ({
          promoId: pr.promoId,
          retailerPromotionId: pr.retailerPromotionId,
          description: pr.description,
          longDescription: pr.longDescription,
          type: pr.type,
          presentationMode: pr.presentationMode,
        })),
        ratingSummary: p.ratingSummary ?? null,
        imageUrl: p.image?.src ?? '',
        imageConfig: p.imageConfig ?? { availableFormats: [], availableResolutions: [] },
        fields,
        detailedDescription: bop.detailedDescription ?? '',
        breadcrumbs,
      };
    }, retailerProductId);
  }
}
