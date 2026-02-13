export interface TrackInfo {
  name: string;
  artist: string;
  album: string;
  albumUri: string;
  albumImageUrl: string;
  durationMs: number;
}

export interface AppState {
  connected: boolean;
  track: TrackInfo | null;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  beatValue: number;
  beatValue2: number;
  beatValue4: number;
  beatDelta: number;
  globalTime: number;
  firstTime: number;
  lastFrameTime: number;
  visibleAlbumUri: string;
}

export function createAppState(): AppState {
  return {
    connected: false,
    track: null,
    positionMs: 0,
    durationMs: 180000,
    isPlaying: false,
    beatValue: 0,
    beatValue2: 0,
    beatValue4: 0,
    beatDelta: 0,
    globalTime: 0,
    firstTime: 0,
    lastFrameTime: 0,
    visibleAlbumUri: '',
  };
}
