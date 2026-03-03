import { BrowserContext } from 'playwright';

interface SessionEntry {
  context: BrowserContext;
  loggedIn: boolean;
  createdAt: Date;
}

/**
 * In-memory store mapping a site ID to its active BrowserContext.
 *
 * Keeps login state between API requests so we don't re-authenticate
 * on every call. Invalidate with `clearSession(siteId)` to force re-login.
 */
export class SessionStore {
  private static instance: SessionStore | null = null;
  private sessions = new Map<string, SessionEntry>();

  private constructor() {}

  static getInstance(): SessionStore {
    if (!SessionStore.instance) {
      SessionStore.instance = new SessionStore();
    }
    return SessionStore.instance;
  }

  set(siteId: string, context: BrowserContext, loggedIn = false): void {
    this.sessions.set(siteId, { context, loggedIn, createdAt: new Date() });
  }

  get(siteId: string): SessionEntry | undefined {
    return this.sessions.get(siteId);
  }

  isLoggedIn(siteId: string): boolean {
    return this.sessions.get(siteId)?.loggedIn ?? false;
  }

  markLoggedIn(siteId: string): void {
    const entry = this.sessions.get(siteId);
    if (entry) entry.loggedIn = true;
  }

  async clearSession(siteId: string): Promise<void> {
    const entry = this.sessions.get(siteId);
    if (entry) {
      await entry.context.close();
      this.sessions.delete(siteId);
    }
  }

  async clearAll(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.clearSession(id);
    }
  }
}
