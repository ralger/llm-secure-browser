/**
 * ParentPay site configuration.
 * All URLs and CSS selectors live here — update this file if the site changes.
 *
 * Explored via Playwright MCP on 2026-03-03.
 * Login app host: app.parentpay.com
 * Base path after login: /V3Payer4W3/ (extracted from post-login redirect URL)
 */
export const PARENTPAY_CONFIG = {
  siteId: 'parentpay',
  name: 'ParentPay',
  appBaseUrl: 'https://app.parentpay.com',
  loginUrl: 'https://app.parentpay.com/public/client/security/v5/#/login',

  /** Env-var keys for credential lookup */
  credentials: {
    usernameKey: 'SITE_PARENTPAY_USERNAME',
    passwordKey: 'SITE_PARENTPAY_PASSWORD',
  },

  selectors: {
    login: {
      usernameInput: '[data-test-id="security-username-login-field-input"]',
      passwordInput: '[data-test-id="security-login-password-field-input"]',
      submitButton: '[data-test-id="security-login-btn"]',
    },

    /** Home page: /V3Payer4W3/Payer/Default.aspx */
    home: {
      /** Links to child summary pages — filter to those containing an h2 */
      childSummaryLinks: 'a[href*="ChildSummary.aspx"]',
      childNameHeading: 'h2',
      /** Paragraph inside the link that contains "balance" */
      balanceParagraph: 'p',
      /** Parent account credit link */
      parentCreditLink: 'a[href*="Statements.aspx"]',
    },

    /** Child summary page: /V3Payer4W3/Home/ChildSummary.aspx?ConsumerId={id} */
    childSummary: {
      /** Term/definition list inside each payment item card */
      paymentItemContainer: 'dl',
      paymentItemNameDd: 'dd:first-of-type',
      balanceDd: 'dd:nth-of-type(2)',
      /** The "View" button to open the payment panel — match by item name context */
      viewButton: 'button:has-text("View"), a:has-text("View")',
      /** Dinner money item name substring for matching */
      dinnerMoneyItemName: 'School Dinner Money',
      /** Lunchtime meal activity table */
      mealActivityTable: 'table',
    },

    /** Payment items panel (after clicking View on ChildSummary) */
    paymentPanel: {
      amountInput: '[id="edit-amount"], input[name*="amount"], input[aria-label*="amount"]',
      payByParentAccountBtn: 'button:has-text("Pay by Parent Account")',
      addToBasketBtn: 'button:has-text("Add to basket")',
      cancelBtn: 'button:has-text("Cancel")',
      confirmationHeading: 'h2, h3',
    },

    /** Taken meals calendar: /V3Payer4W3/Payer/MenusAndChoices.aspx */
    mealsCalendar: {
      table: 'table[summary="Menus and Choices"]',
      headerRow: 'thead tr',
      headerCells: 'thead th',
      bodyRows: 'tbody tr',
    },
  },

  /** URL path builders — call after extracting basePath from post-login URL */
  paths: {
    home: (base: string) => `${base}Payer/Default.aspx`,
    statements: (base: string) => `${base}MyAccount/Statements/Statements.aspx`,
    childSummary: (base: string, consumerId: string) =>
      `${base}Home/ChildSummary.aspx?ConsumerId=${consumerId}`,
    paymentItems: (base: string, consumerId: string) =>
      `${base}Home/PaymentItems/PaymentItems.aspx?consumerId=${consumerId}`,
    mealsCalendar: (base: string, consumerId: string, mondayDate: string) =>
      `${base}Payer/MenusAndChoices.aspx?ConsumerId=${consumerId}&Date=${mondayDate}`,
  },
} as const;
