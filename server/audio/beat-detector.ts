export function createBeatDetector(bpm = 120) {
  let beatIntervalMs = 60000 / bpm;
  let beatCount = 0;

  return {
    update(trackPositionMs: number, isPlaying: boolean): { beat1: number; beat2: number; beat4: number } | null {
      if (!isPlaying) return null;

      const currentBeat = Math.floor(trackPositionMs / beatIntervalMs);
      if (currentBeat > beatCount) {
        beatCount = currentBeat;
        return {
          beat1: 1.0,
          beat2: currentBeat % 2 === 0 ? 1.0 : 0.0,
          beat4: currentBeat % 4 === 0 ? 1.0 : 0.0,
        };
      }
      return null;
    },

    reset() {
      beatCount = 0;
    },

    setBpm(newBpm: number) {
      beatIntervalMs = 60000 / newBpm;
    },
  };
}
