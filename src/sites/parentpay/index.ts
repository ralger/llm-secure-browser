import type { FastifyPluginAsync } from 'fastify';
import type { SitePlugin } from '../../core/site-plugin.interface.js';
import { EnvCredentialProvider } from '../../core/credentials/index.js';
import { parentPayRoutes } from './routes.js';
import { PARENTPAY_CONFIG } from './config.js';

const credentialProvider = new EnvCredentialProvider();

const plugin: FastifyPluginAsync = async (app) => {
  // Fastify requires explicit body parsing for POST routes
  await app.register(import('@fastify/formbody'));
  await app.register(parentPayRoutes, { credentialProvider });
};

export const parentPaySite: SitePlugin = {
  siteId: PARENTPAY_CONFIG.siteId,
  name: PARENTPAY_CONFIG.name,
  requiredCredentials: [
    PARENTPAY_CONFIG.credentials.usernameKey,
    PARENTPAY_CONFIG.credentials.passwordKey,
  ],
  plugin,
};
