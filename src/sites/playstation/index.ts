import type { FastifyPluginAsync } from 'fastify';
import type { SitePlugin } from '../../core/site-plugin.interface.js';
import { EnvCredentialProvider } from '../../core/credentials/index.js';
import { playstationRoutes } from './routes.js';
import { PLAYSTATION_CONFIG } from './config.js';

const credentialProvider = new EnvCredentialProvider();

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(import('@fastify/formbody'));
  await app.register(playstationRoutes, { credentialProvider });
};

export const playstationSite: SitePlugin = {
  siteId: PLAYSTATION_CONFIG.siteId,
  name: PLAYSTATION_CONFIG.name,
  requiredCredentials: [
    PLAYSTATION_CONFIG.credentials.usernameKey,
    PLAYSTATION_CONFIG.credentials.passwordKey,
    PLAYSTATION_CONFIG.credentials.totpSecretKey,
  ],
  plugin,
};
