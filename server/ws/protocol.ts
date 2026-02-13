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
