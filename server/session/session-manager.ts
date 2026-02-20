import { randomBytes } from 'crypto';
import { UserSession } from './user-session.js';
import { loadSession, listSessions, ensureDir } from './storage.js';
import type { SessionTokens } from './storage.js';
import type { createTriangleCache } from '../cache/triangle-cache.js';
import { refreshAccessToken } from '../spotify/auth.js';
import { spotifyClient } from '../spotify/api.js';

const CLEANUP_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const CAST_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CastTokenEntry {
  sessionId: string;
  createdAt: number;
}

export class SessionManager {
  private sessions = new Map<string, UserSession>();
  private castTokens = new Map<string, CastTokenEntry>();

  constructor(private triangleCache: ReturnType<typeof createTriangleCache>) {}

  create(tokens?: SessionTokens): { sessionId: string; session: UserSession } {
    const sessionId = randomBytes(32).toString('hex');
    const sessionTokens: SessionTokens = tokens ?? {
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    const session = new UserSession(
      sessionId,
      sessionTokens,
      this.triangleCache,
      this.getAccessTokenForSession.bind(this),
    );
    this.sessions.set(sessionId, session);
    return { sessionId, session };
  }

  get(sessionId: string): UserSession | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.destroy();
      session.deleteTokens();
      this.sessions.delete(sessionId);
      spotifyClient.removeSession(sessionId);
    }
  }

  restoreFromDisk(): number {
    ensureDir();
    const ids = listSessions();
    let restored = 0;

    for (const id of ids) {
      const tokens = loadSession(id);
      if (!tokens) continue;

      const session = new UserSession(
        id,
        tokens,
        this.triangleCache,
        this.getAccessTokenForSession.bind(this),
      );
      this.sessions.set(id, session);
      restored++;
    }

    if (restored > 0) {
      console.log(`Restored ${restored} session(s) from disk`);
    }
    return restored;
  }

  /** Generate a single-use, time-limited cast token for a session */
  createCastToken(sessionId: string): string | null {
    if (!this.sessions.has(sessionId)) return null;
    const token = randomBytes(32).toString('hex');
    this.castTokens.set(token, { sessionId, createdAt: Date.now() });
    return token;
  }

  /** Redeem a cast token — returns session if valid, consumes the token */
  redeemCastToken(token: string): UserSession | null {
    const entry = this.castTokens.get(token);
    if (!entry) return null;

    // Always consume — single use
    this.castTokens.delete(token);

    // Check expiry
    if (Date.now() - entry.createdAt > CAST_TOKEN_TTL_MS) return null;

    return this.sessions.get(entry.sessionId) ?? null;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.tokens.lastActivity > CLEANUP_MAX_AGE_MS) {
        this.delete(id);
        removed++;
      }
    }

    // Also purge expired cast tokens
    for (const [token, entry] of this.castTokens) {
      if (now - entry.createdAt > CAST_TOKEN_TTL_MS) {
        this.castTokens.delete(token);
      }
    }

    if (removed > 0) {
      console.log(`Cleaned up ${removed} inactive session(s)`);
    }
    return removed;
  }

  /** Broadcast a message to all connected sessions. */
  broadcastAll(message: object): void {
    for (const session of this.sessions.values()) {
      session.broadcast(message);
    }
  }

  get size(): number {
    return this.sessions.size;
  }

  private async getAccessTokenForSession(session: UserSession): Promise<string | null> {
    if (!session.tokens.accessToken) return null;

    // Refresh if within 60 seconds of expiry
    if (Date.now() > session.tokens.expiresAt - 60000) {
      const refreshed = await refreshAccessToken(session.tokens.refreshToken);
      session.tokens.accessToken = refreshed.accessToken;
      if (refreshed.refreshToken) {
        session.tokens.refreshToken = refreshed.refreshToken;
      }
      session.tokens.expiresAt = refreshed.expiresAt;
      await session.saveTokens();
    }

    return session.tokens.accessToken;
  }
}
