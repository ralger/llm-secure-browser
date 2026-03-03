/**
 * Contract that every site plugin must satisfy.
 *
 * A site plugin is a Fastify plugin function that:
 *   - registers routes under /api/{siteId}/
 *   - declares the credential keys it needs
 */
import type { FastifyPluginAsync } from 'fastify';

export interface SitePlugin {
  siteId: string;
  /** Human-readable name, used in logs */
  name: string;
  /** Credential env-var keys this site requires — used for startup validation */
  requiredCredentials: string[];
  /** The Fastify plugin to register */
  plugin: FastifyPluginAsync;
}
