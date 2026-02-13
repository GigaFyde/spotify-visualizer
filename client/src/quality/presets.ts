export interface QualityPreset {
  name: string;
  canvasDownsample: number;
  rttResolution: number;
  useFullPost: boolean;
  maxTriangles: number;
}

export const PRESETS: Record<string, QualityPreset> = {
  extreme: { name: 'Extreme', canvasDownsample: 1, rttResolution: 2048, useFullPost: true,  maxTriangles: 20000 },
  ultra:   { name: 'Ultra',   canvasDownsample: 1, rttResolution: 2048, useFullPost: true,  maxTriangles: 12000 },
  high:    { name: 'High',    canvasDownsample: 1, rttResolution: 1024, useFullPost: true,  maxTriangles: 7000  },
  medium:  { name: 'Medium',  canvasDownsample: 2, rttResolution: 512,  useFullPost: true,  maxTriangles: 3000  },
  low:     { name: 'Low',     canvasDownsample: 3, rttResolution: 256,  useFullPost: false, maxTriangles: 1500  },
  potato:  { name: 'Potato',  canvasDownsample: 4, rttResolution: 256,  useFullPost: false, maxTriangles: 800   },
};

export const PRESET_ORDER = ['potato', 'low', 'medium', 'high', 'ultra', 'extreme'];
