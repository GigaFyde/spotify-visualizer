import { PRESET_ORDER } from './presets.js';

export function createAdaptiveQuality(initialPreset = 'medium') {
  let currentIndex = PRESET_ORDER.indexOf(initialPreset);
  let frameTimes: number[] = [];
  let windowStart = performance.now();
  let lastChange = 0;

  return {
    update(dt: number): string | null {
      frameTimes.push(dt);
      const now = performance.now();

      if (now - windowStart < 2000) return null;

      const avgDt = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const fps = 1000 / avgDt;
      frameTimes = [];
      windowStart = now;

      if (now - lastChange < 5000) return null;

      if (fps < 25 && currentIndex > 0) {
        currentIndex--;
        lastChange = now;
        return PRESET_ORDER[currentIndex];
      }
      if (fps > 50 && currentIndex < PRESET_ORDER.length - 1) {
        currentIndex++;
        lastChange = now;
        return PRESET_ORDER[currentIndex];
      }
      return null;
    },
    currentPreset() { return PRESET_ORDER[currentIndex]; },
    forcePreset(name: string) {
      const idx = PRESET_ORDER.indexOf(name);
      if (idx >= 0) currentIndex = idx;
    },
  };
}
