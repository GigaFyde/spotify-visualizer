import type { TrackInfo } from './state/app-state.js';
import type { VectorData } from './renderer/mesh.js';

interface WSCallbacks {
  onTrackUpdate(track: TrackInfo): void;
  onTriangles(data: VectorData): void;
  onBeat(beat1: number, beat2: number, beat4: number): void;
  onPlaybackState(positionMs: number, durationMs: number, isPlaying: boolean): void;
  onConnect(): void;
  onDisconnect(): void;
}

export function createWSClient(url: string, callbacks: WSCallbacks) {
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectDelay = 1000;
      callbacks.onConnect();
    };

    ws.onclose = () => {
      callbacks.onDisconnect();
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'track_update':
            callbacks.onTrackUpdate({
              name: msg.name,
              artist: msg.artist,
              album: msg.album,
              albumUri: msg.albumUri,
              albumImageUrl: msg.albumImageUrl,
              durationMs: msg.durationMs,
            });
            break;
          case 'triangles':
            callbacks.onTriangles(msg.data);
            break;
          case 'beat':
            callbacks.onBeat(msg.beat1, msg.beat2, msg.beat4);
            break;
          case 'playback_state':
            callbacks.onPlaybackState(msg.positionMs, msg.durationMs, msg.isPlaying);
            break;
        }
      } catch (e) {
        console.error('WS message parse error:', e);
      }
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay);
  }

  function send(msg: any) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function close() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    ws?.close();
  }

  connect();
  return { send, close };
}
