import type { ICredentialProvider } from './provider.interface.js';

/**
 * Reads credentials from environment variables.
 * In development, populate via a .env file (loaded by dotenv at startup).
 * Convention: keys are UPPER_SNAKE_CASE, e.g. SITE_PARENTPAY_USERNAME
 */
export class EnvCredentialProvider implements ICredentialProvider {
  async get(key: string): Promise<string> {
    const value = process.env[key];
    if (value === undefined || value === '') {
      throw new Error(`Credential not found: ${key}. Ensure it is set in your .env file.`);
    }
    return value;
  }
}
