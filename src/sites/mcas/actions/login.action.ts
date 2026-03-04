import { BrowserContext, Page } from 'playwright';
import { ICredentialProvider } from '../../../core/credentials/index.js';
import { BrowserManager } from '../../../core/browser-manager.js';
import { LoginPage } from '../pages/login.page.js';
import { MCAS_CONFIG } from '../config.js';

const { credentials, apiProxyGetUrl, schoolSwitchParam } = MCAS_CONFIG;

// ── Session helper ────────────────────────────────────────────────────────────

/**
 * Returns true if the given URL indicates the browser was redirected to the
 * MCAS login page.
 */
export function isLoginRedirect(url: string): boolean {
  return url.includes('/MCSParentLogin');
}

/**
 * Creates a fresh browser context, logs in to MCAS, runs the given action,
 * then closes the context — regardless of success or failure.
 *
 * Each API endpoint call gets its own isolated session; there is no shared
 * state between requests.
 */
export async function withFreshSession<T>(
  credentialProvider: ICredentialProvider,
  action: (page: Page, context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await BrowserManager.getInstance().createContext();
  const page = await context.newPage();

  const username = await credentialProvider.get(credentials.usernameKey);
  const password = await credentialProvider.get(credentials.passwordKey);

  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(username, password);

  try {
    return await action(page, context);
  } finally {
    await context.close().catch(() => {});
  }
}

// ── Child context helper ──────────────────────────────────────────────────────

/**
 * Switches the MCAS application's active student context to the given studentId.
 * This is required before scraping page-rendered content (attendance calendar,
 * timetable) — API proxy calls do NOT need this as they include studentId in the URL.
 *
 * Calls the site's built-in JS function and waits for the resulting page reload.
 */
export async function switchChild(page: Page, studentId: number): Promise<void> {
  // Navigate to the dashboard first to ensure a predictable state
  if (!page.url().includes('/MCAS/')) {
    await page.goto(MCAS_CONFIG.dashboardUrl, { waitUntil: 'networkidle' });
  }

  await page.evaluate(
    ({ param, id }: { param: number; id: number }) => {
      // @ts-ignore — runtime MCAS JS function
      // eslint-disable-next-line no-undef
      onClickStudentDropdownItem(param, id, true);
    },
    { param: schoolSwitchParam, id: studentId },
  );

  // The function triggers a full page reload
  await page.waitForLoadState('networkidle');

  if (isLoginRedirect(page.url())) throw new Error('Login did not persist — redirected back to MCAS login page');
}

// ── API proxy helper ──────────────────────────────────────────────────────────

/**
 * Calls the MCAS internal API proxy (CreateGetRequest) from within the logged-in
 * browser context and returns the decoded payload.
 *
 * The proxy returns `{ "d": "..." }` where `d` is a JSON-encoded string that may
 * itself contain JSON or HTML.
 *
 * @returns The decoded `d` value — a plain string (HTML) or parsed object (JSON)
 */
export async function callProxy(page: Page, apiUrl: string): Promise<unknown> {
  const { status, body: raw } = await page.evaluate(
    async ({ proxyUrl, url }: { proxyUrl: string; url: string }) => {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ url, schoolID: '', contactID: '' }),
      });
      return { status: res.status, body: await res.text() };
    },
    { proxyUrl: apiProxyGetUrl, url: apiUrl },
  );

  if (status === 401 || status === 403) throw new Error(`MCAS proxy rejected request (HTTP ${status}) for ${apiUrl}`);
  if (status !== 200) {
    throw new Error(`MCAS proxy returned HTTP ${status} for ${apiUrl} — school portal may be unavailable`);
  }

  // Outer parse: { "d": "..." }
  let outer: { d: string };
  try {
    outer = JSON.parse(raw) as { d: string };
  } catch {
    throw new Error(`MCAS proxy returned non-JSON response for ${apiUrl} — school portal may be unavailable`);
  }
  const inner = outer.d;

  // `d` may be a JSON-encoded string (double-encoded) or plain HTML
  try {
    return JSON.parse(inner);
  } catch {
    // Not valid JSON — return as raw HTML string
    return inner;
  }
}

/**
 * Calls the MCAS internal API proxy and asserts the result is a string (HTML).
 * Throws if the proxy returns an error message.
 */
export async function callProxyHtml(page: Page, apiUrl: string): Promise<string> {
  const result = await callProxy(page, apiUrl);
  if (typeof result !== 'string') {
    throw new Error(`Expected HTML string from proxy for ${apiUrl}, got ${typeof result}`);
  }
  if (result.startsWith('Error 404')) {
    throw new Error(`Proxy 404 for ${apiUrl}: ${result}`);
  }
  return result;
}

/**
 * Calls the MCAS internal API proxy and asserts the result is an object (parsed JSON).
 */
export async function callProxyJson<T = unknown>(page: Page, apiUrl: string): Promise<T> {
  const result = await callProxy(page, apiUrl);
  if (typeof result !== 'object' || result === null) {
    const str = String(result);
    if (str.startsWith('Error 404')) throw new Error(`Proxy 404 for ${apiUrl}: ${str}`);
    throw new Error(`Expected JSON object from proxy for ${apiUrl}, got: ${str.substring(0, 100)}`);
  }
  return result as T;
}

// ── HTML parsing helpers ──────────────────────────────────────────────────────

/**
 * Parses an HTML table string (as returned by the MCAS proxy) and returns
 * each row as an array of cell text values.
 *
 * Uses a temporary DOM element created in the Playwright browser context.
 */
export async function parseHtmlTableRows(
  page: Page,
  html: string,
): Promise<string[][]> {
  return page.evaluate((htmlStr: string) => {
    const div = document.createElement('div');
    div.innerHTML = htmlStr;
    const rows = Array.from(div.querySelectorAll('tbody tr'));
    return rows.map((row) =>
      Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
    );
  }, html);
}

/**
 * Parses an HTML table string and returns rows as arrays of (text, attributes) per cell.
 */
export async function parseHtmlTableCells(
  page: Page,
  html: string,
): Promise<Array<Array<{ text: string; title: string; classes: string; style: string }>>> {
  return page.evaluate((htmlStr: string) => {
    const div = document.createElement('div');
    div.innerHTML = htmlStr;
    const rows = Array.from(div.querySelectorAll('tbody tr'));
    return rows.map((row) =>
      Array.from(row.querySelectorAll('td')).map((td) => {
        const icon = td.querySelector('i');
        return {
          text: td.textContent?.trim() ?? '',
          title: icon?.getAttribute('title') ?? td.getAttribute('title') ?? '',
          classes: icon?.className ?? '',
          style: icon?.getAttribute('style') ?? '',
        };
      }),
    );
  }, html);
}
