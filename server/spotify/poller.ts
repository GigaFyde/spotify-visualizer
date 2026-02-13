import { getCurrentlyPlaying } from './api.js';

type PollCallback = {
  onTrackChange: (track: {
    name: string;
    artist: string;
    album: string;
    albumUri: string;
    albumImageUrl: string;
    uri: string;
  }) => void;
  onPlaybackState: (positionMs: number, durationMs: number, isPlaying: boolean) => void;
};

export function createPoller(callbacks: PollCallback) {
  let currentTrackUri = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  async function poll() {
    try {
      const data = await getCurrentlyPlaying();
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
          data.is_playing ?? false,
        );
      }
    } catch (err) {
      console.error('Poll error:', err);
    }

    if (running) {
      timer = setTimeout(poll, 4000);
    }
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
