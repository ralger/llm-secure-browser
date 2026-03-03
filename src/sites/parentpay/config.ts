/**
 * ParentPay site configuration.
 * Centralise all URLs and selector constants here so Page Objects
 * never contain magic strings.
 */
export const PARENTPAY_CONFIG = {
  siteId: 'parentpay',
  name: 'ParentPay',
  baseUrl: 'https://www.parentpay.com',
  loginUrl: 'https://www.parentpay.com/public/client/security/v2/#/login',

  /** Env-var keys for credential lookup */
  credentials: {
    usernameKey: 'SITE_PARENTPAY_USERNAME',
    passwordKey: 'SITE_PARENTPAY_PASSWORD',
  },

  /**
   * CSS / text selectors — update here if the site changes.
   * These are placeholders until we explore the live site via MCP.
   */
  selectors: {
    login: {
      usernameInput: '[name="username"], #username, input[type="text"]',
      passwordInput: '[name="password"], #password, input[type="password"]',
      submitButton: 'button[type="submit"], input[type="submit"]',
    },
    dashboard: {
      /** To be filled in after MCP site exploration */
      childBalanceRows: 'TODO',
      childName: 'TODO',
      balance: 'TODO',
    },
  },
} as const;
