import type { ServerWebSocket } from 'bun';
import { createPoller } from '../spotify/poller.js';
import { createBeatDetector } from '../audio/beat-detector.js';
import { vectorize } from '../triangulation/vectorizer.js';
import { packVectorData } from '../ws/protocol.js';
import type { VectorData } from '../ws/protocol.js';
import { saveSession, deleteSession } from './storage.js';
import type { SessionTokens } from './storage.js';
import type { createTriangleCache } from '../cache/triangle-cache.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class UserSession {
  readonly sessionId: string;
  tokens: SessionTokens;
  private poller: ReturnType<typeof createPoller> | null = null;
  private beatDetector = createBeatDetector();
  private wsConnections = new Set<ServerWebSocket<unknown>>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  currentTrack: {
    name: string;
    artist: string;
    album: string;
    albumUri: string;
    albumImageUrl: string;
    durationMs: number;
  } | null = null;

  currentPlaybackState = { positionMs: 0, durationMs: 0, isPlaying: false };
  currentVectorData: VectorData | null = null;

  // Stored per-session for auth flow
  private codeVerifier = '';
  private redirectUrl = '/';

  constructor(
    sessionId: string,
    tokens: SessionTokens,
    private triangleCache: ReturnType<typeof createTriangleCache>,
    private getAccessToken: (session: UserSession) => Promise<string | null>,
  ) {
    this.sessionId = sessionId;
    this.tokens = tokens;
  }

  setCodeVerifier(v: string) {
    this.codeVerifier = v;
  }

  getCodeVerifier(): string {
    return this.codeVerifier;
  }

  setRedirectUrl(url: string) {
    this.redirectUrl = url;
  }

  getRedirectUrl(): string {
    return this.redirectUrl;
  }

  startPolling(): void {
    if (this.poller) return;

    this.poller = createPoller({
      sessionId: this.sessionId,
      getAccessToken: () => this.getAccessToken(this),

      onTrackChange: async (track) => {
        this.currentTrack = {
          name: track.name,
          artist: track.artist,
          album: track.album,
          albumUri: track.albumUri,
          albumImageUrl: track.albumImageUrl,
          durationMs: 0,
        };

        this.broadcast({
          type: 'track_update',
          name: track.name,
          artist: track.artist,
          album: track.album,
          albumUri: track.albumUri,
          albumImageUrl: track.albumImageUrl,
          durationMs: this.currentPlaybackState.durationMs,
        });

        // Check shared triangle cache first
        if (this.triangleCache.has(track.albumUri)) {
          this.currentVectorData = this.triangleCache.get(track.albumUri)!;
        } else {
          try {
            this.currentVectorData = await vectorize(track.albumImageUrl);
            this.triangleCache.set(track.albumUri, this.currentVectorData);
          } catch (e) {
            console.error(`[${this.sessionId}] Vectorization failed:`, e);
          }
        }

        if (this.currentVectorData) {
          this.broadcastBinary(packVectorData(this.currentVectorData));
        }

        this.beatDetector.reset();
      },

      onAuthError: () => {
        this.broadcast({ type: 'auth_required' });
        this.stopPolling();
        console.log(`[${this.sessionId}] Auth expired — clients notified`);
      },

      onPlaybackState: (positionMs, durationMs, isPlaying) => {
        this.currentPlaybackState = { positionMs, durationMs, isPlaying };
        if (this.currentTrack) {
          this.currentTrack.durationMs = durationMs;
        }

        this.broadcast({ type: 'playback_state', positionMs, durationMs, isPlaying });

        const beat = this.beatDetector.update(positionMs, isPlaying);
        if (beat) {
          this.broadcast({ type: 'beat', ...beat });
        }
      },
    });

    this.poller.start();
    this.clearIdleTimer();
  }

  stopPolling(): void {
    if (this.poller) {
      this.poller.stop();
      this.poller = null;
    }
  }

  pollNow(): void {
    this.poller?.pollNow();
  }

  isPolling(): boolean {
    return this.poller !== null;
  }

  broadcast(message: object): void {
    const json = JSON.stringify(message);
    for (const ws of this.wsConnections) {
      try {
        ws.send(json);
      } catch {
        this.wsConnections.delete(ws);
      }
    }
  }

  broadcastBinary(data: ArrayBuffer): void {
    for (const ws of this.wsConnections) {
      try {
        ws.send(data);
      } catch {
        this.wsConnections.delete(ws);
      }
    }
  }

  addConnection(ws: ServerWebSocket<unknown>): void {
    this.wsConnections.add(ws);
    this.clearIdleTimer();
  }

  removeConnection(ws: ServerWebSocket<unknown>): void {
    this.wsConnections.delete(ws);
    if (this.wsConnections.size === 0) {
      this.scheduleIdleStop();
    }
  }

  get connectionCount(): number {
    return this.wsConnections.size;
  }

  async saveTokens(): Promise<void> {
    this.tokens.lastActivity = Date.now();
    await saveSession(this.sessionId, this.tokens);
  }

  deleteTokens(): void {
    deleteSession(this.sessionId);
  }

  destroy(): void {
    this.stopPolling();
    this.clearIdleTimer();
    // Close all WS connections
    for (const ws of this.wsConnections) {
      try {
        ws.close(1000, 'Session destroyed');
      } catch { /* ignore */ }
    }
    this.wsConnections.clear();
  }

  private scheduleIdleStop(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.wsConnections.size === 0 && this.poller) {
        console.log(`[${this.sessionId}] No connections for 30min — stopping poller`);
        this.stopPolling();
      }
    }, IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
