import type { FastifyPluginAsync } from 'fastify';
import type { SitePlugin } from '../../core/site-plugin.interface.js';
import { EnvCredentialProvider } from '../../core/credentials/index.js';
import { churchSuiteRoutes } from './routes.js';
import { CHURCHSUITE_CONFIG } from './config.js';

const credentialProvider = new EnvCredentialProvider();

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(churchSuiteRoutes, { credentialProvider });
};

export const churchSuiteSite: SitePlugin = {
  siteId: CHURCHSUITE_CONFIG.siteId,
  name: CHURCHSUITE_CONFIG.name,
  requiredCredentials: [
    CHURCHSUITE_CONFIG.credentials.usernameKey,
    CHURCHSUITE_CONFIG.credentials.passwordKey,
  ],
  plugin,
};
