import { BrowserContext } from 'playwright';

/** How long (ms) a session may be idle before it is automatically closed. */
const IDLE_TIMEOUT_MS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MS ?? '600000', 10); // 10 min

/** How often the reaper runs (ms). */
const REAPER_INTERVAL_MS = 60_000; // 1 min

interface SessionEntry {
  context: BrowserContext;
  loggedIn: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  /** Arbitrary site-specific data stored alongside the session */
  metadata: Record<string, unknown>;
}

/**
 * In-memory store mapping a site ID to its active BrowserContext.
 *
 * Keeps login state between API requests so we don't re-authenticate
 * on every call. Invalidate with `clearSession(siteId)` to force re-login.
 *
 * An idle-reaper runs every minute and closes any session that has not been
 * used within SESSION_IDLE_TIMEOUT_MS (default: 10 minutes).
 */
export class SessionStore {
  private static instance: SessionStore | null = null;
  private sessions = new Map<string, SessionEntry>();
  private reaperTimer: ReturnType<typeof setInterval>;

  private constructor() {
    this.reaperTimer = setInterval(() => void this.reapIdleSessions(), REAPER_INTERVAL_MS);
    // Don't block process exit while waiting for the timer
    this.reaperTimer.unref();
  }

  static getInstance(): SessionStore {
    if (!SessionStore.instance) {
      SessionStore.instance = new SessionStore();
    }
    return SessionStore.instance;
  }

  set(siteId: string, context: BrowserContext, loggedIn = false): void {
    const now = new Date();
    this.sessions.set(siteId, { context, loggedIn, createdAt: now, lastUsedAt: now, metadata: {} });
  }

  get(siteId: string): SessionEntry | undefined {
    const entry = this.sessions.get(siteId);
    if (entry) {
      entry.lastUsedAt = new Date(); // touch on every access
    }
    return entry;
  }

  isLoggedIn(siteId: string): boolean {
    return this.get(siteId)?.loggedIn ?? false;
  }

  markLoggedIn(siteId: string, metadata: Record<string, unknown> = {}): void {
    const entry = this.sessions.get(siteId);
    if (entry) {
      entry.loggedIn = true;
      entry.lastUsedAt = new Date();
      entry.metadata = { ...entry.metadata, ...metadata };
    }
  }

  async clearSession(siteId: string): Promise<void> {
    const entry = this.sessions.get(siteId);
    if (entry) {
      this.sessions.delete(siteId);
      await entry.context.close().catch(() => {}); // best-effort
    }
  }

  async clearAll(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.clearSession(id);
    }
  }

  stopReaper(): void {
    clearInterval(this.reaperTimer);
  }

  private async reapIdleSessions(): Promise<void> {
    const cutoff = Date.now() - IDLE_TIMEOUT_MS;
    for (const [siteId, entry] of this.sessions) {
      if (entry.lastUsedAt.getTime() < cutoff) {
        console.log(
          `[SessionStore] Idle session for "${siteId}" expired after ${IDLE_TIMEOUT_MS / 1000}s — closing.`,
        );
        await this.clearSession(siteId);
      }
    }
  }
}
