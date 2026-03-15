import type { FastifyPluginAsync } from 'fastify';
import type { SitePlugin } from '../../core/site-plugin.interface.js';
import { ocadoRoutes } from './routes.js';
import { OCADO_CONFIG } from './config.js';

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(ocadoRoutes);
};

export const ocadoSite: SitePlugin = {
  siteId: OCADO_CONFIG.siteId,
  name: OCADO_CONFIG.name,
  requiredCredentials: [],
  plugin,
};
