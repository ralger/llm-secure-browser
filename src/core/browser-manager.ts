import { chromium, Browser, BrowserContext, LaunchOptions } from 'playwright';

/**
 * Singleton manager for the Playwright Browser instance.
 *
 * - Launches a single headless Chromium instance shared across all sites.
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
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // Write renderer memory to /tmp instead of /dev/shm.
        // This is a safety net for environments where shm_size is not set.
        // When shm_size IS set (docker-compose), Chrome still prefers /dev/shm.
        '--disable-dev-shm-usage',
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
    return this.browser!.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
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
