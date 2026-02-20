import { getCurrentlyPlaying } from './api.js';
import {
  CircuitOpenError,
  BudgetExceededError,
  RequestDroppedError,
  QueueTimeoutError,
} from './spotify-client.js';

// Adaptive interval constants
const INTERVAL_PLAYING_MS = 4000;
const INTERVAL_PAUSED_MS = 10000;
const BACKOFF_INTERVALS_MS = [4000, 8000, 16000, 30000];
const RECOVERY_INTERVALS_MS = [16000, 8000, 4000];
const RECOVERY_THRESHOLD = 3;

type PollCallback = {
  sessionId?: string;
  getAccessToken: () => Promise<string | null>;
  onTrackChange: (track: {
    name: string;
    artist: string;
    album: string;
    albumUri: string;
    albumImageUrl: string;
    uri: string;
  }) => void;
  onPlaybackState: (positionMs: number, durationMs: number, isPlaying: boolean) => void;
  onAuthError?: () => void;
};

export function createPoller(callbacks: PollCallback) {
  let currentTrackUri = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  // Adaptive interval state
  let backoffLevel = 0;
  let inBackoff = false;
  let consecutiveSuccesses = 0;
  let recoveryStep = 0;
  let inRecovery = false;
  let lastIsPlaying = true;

  function getNextInterval(): number {
    if (inRecovery) {
      return RECOVERY_INTERVALS_MS[recoveryStep] ?? INTERVAL_PLAYING_MS;
    }
    if (inBackoff) {
      return BACKOFF_INTERVALS_MS[Math.min(backoffLevel, BACKOFF_INTERVALS_MS.length - 1)];
    }
    return lastIsPlaying ? INTERVAL_PLAYING_MS : INTERVAL_PAUSED_MS;
  }

  function recordSuccess(isPlaying: boolean): void {
    lastIsPlaying = isPlaying;

    if (inBackoff) {
      consecutiveSuccesses++;
      if (consecutiveSuccesses >= RECOVERY_THRESHOLD) {
        inBackoff = false;
        inRecovery = true;
        recoveryStep = 0;
        consecutiveSuccesses = 0;
      }
    } else if (inRecovery) {
      recoveryStep++;
      if (recoveryStep >= RECOVERY_INTERVALS_MS.length) {
        inRecovery = false;
        recoveryStep = 0;
      }
    }
  }

  function recordRateLimitError(): void {
    if (!inBackoff) {
      inBackoff = true;
      backoffLevel = 0;
    } else {
      backoffLevel = Math.min(backoffLevel + 1, BACKOFF_INTERVALS_MS.length - 1);
    }
    inRecovery = false;
    consecutiveSuccesses = 0;
    recoveryStep = 0;
  }

  function scheduleNext(): void {
    if (running) {
      timer = setTimeout(poll, getNextInterval());
    }
  }

  async function poll() {
    try {
      const token = await callbacks.getAccessToken();
      if (!token) {
        callbacks.onAuthError?.();
        scheduleNext();
        return;
      }

      const data = await getCurrentlyPlaying(token, callbacks.sessionId);

      const isPlaying = data?.is_playing ?? false;
      recordSuccess(isPlaying);

      if (data && data.item) {
        const track = data.item;
        const uri = track.uri as string;

        if (uri !== currentTrackUri) {
          currentTrackUri = uri;
          const albumImages = track.album?.images ?? [];
          const albumImageUrl = albumImages[0]?.url ?? '';

          callbacks.onTrackChange({
            name: track.name,
            artist: (track.artists ?? []).map((a: any) => a.name).join(', '),
            album: track.album?.name ?? '',
            albumUri: track.album?.uri ?? '',
            albumImageUrl,
            uri,
          });
        }

        callbacks.onPlaybackState(
          data.progress_ms ?? 0,
          track.duration_ms ?? 0,
          isPlaying,
        );
      }
    } catch (err: any) {
      if (err instanceof CircuitOpenError) {
        // Circuit open — poll skipped (no API call made), keep current backoff interval
        if (!inBackoff) {
          inBackoff = true;
          backoffLevel = 0;
        }
      } else if (
        err instanceof BudgetExceededError ||
        err instanceof RequestDroppedError ||
        err instanceof QueueTimeoutError
      ) {
        recordRateLimitError();
      } else {
        console.error('Poll error:', err);
        if (err?.message?.includes('Not authenticated') || err?.message?.includes('401')) {
          callbacks.onAuthError?.();
        }
      }
    }

    scheduleNext();
  }

  return {
    start() {
      if (running) return;
      running = true;
      poll();
    },

    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    pollNow() {
      if (!running) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      poll();
    },
  };
}
