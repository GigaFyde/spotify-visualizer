import type { TrackInfo } from './state/app-state.js';
import type { VectorData } from './renderer/mesh.js';

// Binary protocol constants (must match server/ws/protocol.ts)
const BINARY_MSG_TRIANGLES = 0x01;
const FLOATS_PER_TRI = 9; // x0, y0, x1, y1, x2, y2, r, g, b

function unpackVectorData(buffer: ArrayBuffer): VectorData {
  const view = new DataView(buffer);
  const headerSize = 12; // [type:u8][pad:3][width:f32][height:f32]
  const width = view.getFloat32(4, true);
  const height = view.getFloat32(8, true);
  const floats = new Float32Array(buffer, headerSize);
  const numTris = floats.length / FLOATS_PER_TRI;

  const tris: VectorData['tris'] = new Array(numTris);
  for (let i = 0; i < numTris; i++) {
    const off = i * FLOATS_PER_TRI;
    tris[i] = {
      x0: floats[off],     y0: floats[off + 1],
      x1: floats[off + 2], y1: floats[off + 3],
      x2: floats[off + 4], y2: floats[off + 5],
      r: floats[off + 6],  g: floats[off + 7], b: floats[off + 8],
    };
  }

  return { width, height, tris };
}

interface WSCallbacks {
  onTrackUpdate(track: TrackInfo): void;
  onTriangles(data: VectorData): void;
  onBeat(beat1: number, beat2: number, beat4: number): void;
  onPlaybackState(positionMs: number, durationMs: number, isPlaying: boolean): void;
  onConnect(): void;
  onDisconnect(): void;
  onAuthRequired?(): void;
}

export function createWSClient(url: string, callbacks: WSCallbacks) {
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

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
      // Binary message - triangle data
      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        const msgType = view.getUint8(0);
        if (msgType === BINARY_MSG_TRIANGLES) {
          callbacks.onTriangles(unpackVectorData(event.data));
        }
        return;
      }

      // JSON message - everything else
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
          case 'beat':
            callbacks.onBeat(msg.beat1, msg.beat2, msg.beat4);
            break;
          case 'playback_state':
            callbacks.onPlaybackState(msg.positionMs, msg.durationMs, msg.isPlaying);
            break;
          case 'auth_required':
            callbacks.onAuthRequired?.();
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
