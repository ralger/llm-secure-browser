/**
 * Abstraction for credential retrieval.
 * Swap implementations without changing application code:
 *   EnvCredentialProvider  → reads process.env / .env
 *   VaultCredentialProvider → HashiCorp Vault (future)
 *   AwsSecretsProvider      → AWS Secrets Manager (future)
 */
export interface ICredentialProvider {
  /**
   * Retrieve a secret by key.
   * Throws if the key is not found.
   */
  get(key: string): Promise<string>;
}
