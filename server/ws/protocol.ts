// Server→Client message types
export interface TrackUpdateMessage {
  type: 'track_update';
  name: string;
  artist: string;
  album: string;
  albumUri: string;
  albumImageUrl: string;
  durationMs: number;
}

export interface TrianglesMessage {
  type: 'triangles';
  data: VectorData;
}

export interface BeatMessage {
  type: 'beat';
  beat1: number;
  beat2: number;
  beat4: number;
}

export interface PlaybackStateMessage {
  type: 'playback_state';
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
}

export type ServerMessage = TrackUpdateMessage | TrianglesMessage | BeatMessage | PlaybackStateMessage;

// Client→Server message types
export interface CommandMessage {
  type: 'command';
  action: 'play' | 'pause' | 'next' | 'previous' | 'seek';
  seekMs?: number;
}

export type ClientMessage = CommandMessage;

// Shared data types
export interface VectorData {
  width: number;
  height: number;
  tris: Array<{
    x0: number; y0: number;
    x1: number; y1: number;
    x2: number; y2: number;
    r: number; g: number; b: number;
  }>;
}

// Binary protocol constants
// Message type byte: 0x01 = triangles
export const BINARY_MSG_TRIANGLES = 0x01;

// Floats per triangle: x0, y0, x1, y1, x2, y2, r, g, b
const FLOATS_PER_TRI = 9;

// Header size padded to 12 bytes for Float32Array alignment (must be multiple of 4)
export const BINARY_HEADER_SIZE = 12; // [type:u8] [pad:3] [width:f32] [height:f32]

/**
 * Pack VectorData into a binary ArrayBuffer for efficient WebSocket transfer.
 * Layout: [type:u8][pad:3][width:f32][height:f32] [tris: f32[] x0,y0,x1,y1,x2,y2,r,g,b per tri]
 */
export function packVectorData(data: VectorData): ArrayBuffer {
  const triDataSize = data.tris.length * FLOATS_PER_TRI * 4;
  const buffer = new ArrayBuffer(BINARY_HEADER_SIZE + triDataSize);
  const view = new DataView(buffer);

  // Header (12 bytes, aligned)
  view.setUint8(0, BINARY_MSG_TRIANGLES);
  // bytes 1-3: padding
  view.setFloat32(4, data.width, true);
  view.setFloat32(8, data.height, true);

  // Triangle data as packed floats
  const floats = new Float32Array(buffer, BINARY_HEADER_SIZE);
  for (let i = 0; i < data.tris.length; i++) {
    const t = data.tris[i];
    const off = i * FLOATS_PER_TRI;
    floats[off]     = t.x0;
    floats[off + 1] = t.y0;
    floats[off + 2] = t.x1;
    floats[off + 3] = t.y1;
    floats[off + 4] = t.x2;
    floats[off + 5] = t.y2;
    floats[off + 6] = t.r;
    floats[off + 7] = t.g;
    floats[off + 8] = t.b;
  }

  return buffer;
}
