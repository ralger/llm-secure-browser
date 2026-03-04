import type { FastifyPluginAsync } from 'fastify';
import type { SitePlugin } from '../../core/site-plugin.interface.js';
import { EnvCredentialProvider } from '../../core/credentials/index.js';
import { mcasRoutes } from './routes.js';
import { MCAS_CONFIG } from './config.js';

const credentialProvider = new EnvCredentialProvider();

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(mcasRoutes, { credentialProvider });
};

export const mcasSite: SitePlugin = {
  siteId: MCAS_CONFIG.siteId,
  name: MCAS_CONFIG.name,
  requiredCredentials: [
    MCAS_CONFIG.credentials.usernameKey,
    MCAS_CONFIG.credentials.passwordKey,
  ],
  plugin,
};
