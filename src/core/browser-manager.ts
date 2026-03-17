import { chromium, Browser, BrowserContext, LaunchOptions } from 'playwright';

/**
 * Singleton manager for the Playwright Browser instance.
 *
 * - Launches a single Chromium instance shared across all sites.
 *   Headless by default; set `BROWSER_HEADLESS=false` for headed mode (required
 *   by sites that use Cloudflare challenge, e.g. ChurchSuite — run with xvfb-run).
 * - Each site gets its own isolated BrowserContext (separate cookies/storage).
 * - Registers SIGTERM/SIGINT handlers for graceful container shutdown.
 */
export class BrowserManager {
  private static instance: BrowserManager | null = null;
  private browser: Browser | null = null;

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  async launch(options: LaunchOptions = {}): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: process.env.BROWSER_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // Write renderer memory to /tmp instead of /dev/shm.
        // This is a safety net for environments where shm_size is not set.
        // When shm_size IS set (docker-compose), Chrome still prefers /dev/shm.
        '--disable-dev-shm-usage',
        // Suppress the navigator.webdriver flag so bot-detection scripts don't
        // immediately identify the browser as headless automation.
        '--disable-blink-features=AutomationControlled',
      ],
      ...options,
    });

    this.browser.on('disconnected', () => {
      console.error('[BrowserManager] Browser disconnected unexpectedly — will re-launch on next request');
      this.browser = null;
    });

    process.once('SIGTERM', () => void this.teardown());
    process.once('SIGINT', () => void this.teardown());
  }

  async createContext(): Promise<BrowserContext> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.launch();
    }
    const context = await this.browser!.newContext({
      // A realistic Windows/Chrome UA reduces the chance of bot-detection rejections
      // from sites that fingerprint the User-Agent string (e.g. Sony's Kasada shield).
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      viewport: { width: 1280, height: 800 },
    });
    // Remove the navigator.webdriver flag that headless Chrome sets by default.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    return context;
  }

  async teardown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  isRunning(): boolean {
    return this.browser !== null;
  }
}
