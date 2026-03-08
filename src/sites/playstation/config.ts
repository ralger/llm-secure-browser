/**
 * PlayStation family management site configuration.
 *
 * All URLs, selectors, and child account definitions live here.
 * Update this file if Sony changes their UI or if PSN online IDs change.
 *
 * ── Authentication ────────────────────────────────────────────────────────────
 * Sony uses an OAuth2/OIDC flow. Navigating to familyManagementUrl while
 * unauthenticated redirects to the Sony ID sign-in page with the correct scopes
 * and redirect_uri pre-set. After successful login (email + password + TOTP),
 * Sony redirects back to the family management page automatically.
 *
 * ── TOTP ──────────────────────────────────────────────────────────────────────
 * Sony 2FA uses standard TOTP: SHA-1, 6 digits, 30-second period.
 * The base32 secret is extracted from the otpauth:// URI shown during 2FA setup
 * (the "Can't scan? Enter key manually" link on account.sonyentertainmentnetwork.com).
 *
 * ── Children ─────────────────────────────────────────────────────────────────
 * Each child is identified by their PSN Online ID prefix (visible in the
 * PlayStation app and on the console). The full Online ID is resolved at
 * runtime by matching the prefix against the family member list.
 *
 * Explored via Playwright MCP on 2026-03-08.
 * Note: post-login selectors (TOTP page, family management page) are marked
 * TODO where they require live-session verification.
 */
export const PLAYSTATION_CONFIG = {
  siteId: 'playstation',
  name: 'PlayStation Family Management',

  /** Entry point — redirects to sign-in if not authenticated, then returns here */
  familyManagementUrl: 'https://account.sonyentertainmentnetwork.com/familyManagement',

  /** Sony ID sign-in page (the page we land on after the OAuth redirect) */
  loginUrl: 'https://id.sonyentertainmentnetwork.com',

  /** Env-var keys for credential lookup */
  credentials: {
    usernameKey: 'SITE_PLAYSTATION_USERNAME',
    passwordKey: 'SITE_PLAYSTATION_PASSWORD',
    /** Base32 TOTP secret from the otpauth:// URI shown during 2FA setup */
    totpSecretKey: 'SITE_PLAYSTATION_TOTP_SECRET',
  },

  /**
   * Children managed by this account.
   *
   * slug          — used as the URL path segment in the REST API
   * psnPrefix     — prefix of their PSN Online ID (used to locate them in the
   *                 family member list; full ID is resolved at runtime)
   * friendlyName  — short alias (Sam / Manu)
   * fullName      — full given name (Samuel / Emmanuel)
   */
  children: [
    {
      slug: 'solar',
      psnPrefix: 'solar',
      friendlyName: 'Sam',
      fullName: 'Samuel',
    },
    {
      slug: 'reactive',
      psnPrefix: 'reactive',
      friendlyName: 'Manu',
      fullName: 'Emmanuel',
    },
  ] as const,

  /**
   * Valid "Everyday" playtime duration values (in minutes) and their corresponding
   * dropdown label text as shown in the PlayStation family management UI.
   *
   * TODO: verify these labels against the live UI on first run.
   * The set 0 → "No Playtime" / "0 Minutes" may render differently.
   */
  playtimeOptions: {
    0: 'No Playtime',
    15: '15 Minutes',
    30: '30 Minutes',
    45: '45 Minutes',
    60: '1 Hour',
    90: '1 Hour 30 Minutes',
    120: '2 Hours',
    150: '2 Hours 30 Minutes',
    180: '3 Hours',
    210: '3 Hours 30 Minutes',
    240: '4 Hours',
    270: '4 Hours 30 Minutes',
    300: '5 Hours',
    360: '6 Hours',
  } as Record<number, string>,

  selectors: {
    /**
     * Sony ID sign-in page.
     * Confirmed from live browser run: the Ember app renders these exact name attrs.
     * URL: id.sonyentertainmentnetwork.com/signin/  (Ember hash route: #/signin)
     */
    login: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="current-password"]',
      signInButton: 'button[type="submit"]',
    },

    /**
     * Sony 2FA / TOTP verification page — shown after successful email+password.
     *
     * Confirmed from Sony's Ember source (kekka bundle, pdr-2sv-method component):
     *   The pdr-text-field-v4 component renders <input autocomplete="one-time-code">
     *   with type="text" and maxlength=6 for the AUTHENTICATOR (app-based TOTP) flow.
     *
     * The submit button caption is "msg_sf_regcam_verify" (rendered as "Verify").
     */
    totp: {
      codeInput: 'input[autocomplete="one-time-code"]',
      submitButton: 'button[type="submit"]',
    },

    /**
     * PlayStation Account Management — Family Management page.
     * URL: account.sonyentertainmentnetwork.com/familyManagement
     * TODO: verify all selectors below on first live run using the Playwright MCP.
     * The page is a React SPA; selectors may use data-qa or data-testid attributes.
     */
    familyManagement: {
      /**
       * Each family member's clickable row/card on the family list page.
       * Matched via the PSN Online ID text it contains.
       */
      memberLinkByPsnId: (psnId: string) => `a:has-text("${psnId}"), [data-qa*="member"]:has-text("${psnId}")`,

      /** "Edit" button next to the playtime section on the child detail page */
      editPlaytimeButton: 'button:has-text("Edit"), a:has-text("Edit")',

      /**
       * "Restrict Playtime" control (select or toggle).
       * The target value text is "Restrict" (not "Do Not Restrict").
       */
      restrictPlaytimeSelect: 'select[name*="restrict"], select[id*="restrict"], [data-qa*="restrict-playtime"]',
      restrictPlaytimeOption: 'Restrict',

      /**
       * "Everyday" duration dropdown.
       * Set this after ensuring Restrict Playtime is "Restrict".
       */
      everydayDurationSelect: 'select[name*="everyday"], select[id*="everyday"], select[data-qa*="everyday"]',

      /** Save / confirm button */
      saveButton: 'button:has-text("Save"), button[type="submit"]',
    },
  },
} as const;

/** Derived type for a child entry from the config */
export type ChildConfig = (typeof PLAYSTATION_CONFIG.children)[number];

/** Resolve a child config by its URL slug — throws if not found */
export function getChildBySlug(slug: string): ChildConfig {
  const child = PLAYSTATION_CONFIG.children.find((c) => c.slug === slug);
  if (!child) throw new Error(`Unknown PlayStation child slug: "${slug}"`);
  return child;
}
