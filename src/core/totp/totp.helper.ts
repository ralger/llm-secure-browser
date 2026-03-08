import { generate } from 'otplib/functional';

/**
 * Generates a TOTP code from a base32-encoded secret.
 * Compatible with Google Authenticator / Sony 2FA (SHA-1, 6 digits, 30-second window).
 *
 * Reads the TOTP secret from the otpauth:// URI's `secret` parameter.
 * The code is computed locally using the system clock — no network call is made.
 */
export async function generateTotpCode(secret: string): Promise<string> {
  return generate({ strategy: 'totp', secret, algorithm: 'sha1', digits: 6, period: 30 });
}
