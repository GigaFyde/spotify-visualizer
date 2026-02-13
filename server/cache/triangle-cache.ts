import type { VectorData } from '../ws/protocol.js';

const MAX_SIZE = 50;

export function createTriangleCache() {
  const map = new Map<string, VectorData>();

  return {
    has(key: string): boolean {
      return map.has(key);
    },

    get(key: string): VectorData | undefined {
      const value = map.get(key);
      if (value !== undefined) {
        // Move to end (most recently used)
        map.delete(key);
        map.set(key, value);
      }
      return value;
    },

    set(key: string, value: VectorData) {
      if (map.has(key)) {
        map.delete(key);
      }
      map.set(key, value);
      // Evict oldest if over capacity
      if (map.size > MAX_SIZE) {
        const oldest = map.keys().next().value!;
        map.delete(oldest);
      }
    },

    get size() {
      return map.size;
    },
  };
}
