import type { FastifyInstance } from 'fastify';
import type { SitePlugin } from './core/site-plugin.interface.js';

// Import site plugins here as they are added
import { parentPaySite } from './sites/parentpay/index.js';
import { mcasSite } from './sites/mcas/index.js';
import { playstationSite } from './sites/playstation/index.js';
import { ocadoSite } from './sites/ocado/index.js';
import { churchSuiteSite } from './sites/churchsuite/index.js';

const SITES: SitePlugin[] = [parentPaySite, mcasSite, playstationSite, ocadoSite, churchSuiteSite];

/**
 * Registers all site plugins with the Fastify application.
 * Each site's routes are prefixed with /api/{siteId}/
 */
export async function registerSites(app: FastifyInstance): Promise<void> {
  for (const site of SITES) {
    app.log.info(`Registering site: ${site.name} [/api/${site.siteId}]`);
    await app.register(site.plugin, { prefix: `/api/${site.siteId}` });
  }
}
