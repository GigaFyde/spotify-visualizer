export interface QualityPreset {
  name: string;
  canvasDownsample: number;
  rttResolution: number;
  useFullPost: boolean;
  maxTriangles: number;
}

export const PRESETS: Record<string, QualityPreset> = {
  high:   { name: 'High',   canvasDownsample: 1, rttResolution: 1024, useFullPost: true,  maxTriangles: 5000 },
  medium: { name: 'Medium', canvasDownsample: 2, rttResolution: 512,  useFullPost: true,  maxTriangles: 3000 },
  low:    { name: 'Low',    canvasDownsample: 3, rttResolution: 256,  useFullPost: false, maxTriangles: 1500 },
  potato: { name: 'Potato', canvasDownsample: 4, rttResolution: 256,  useFullPost: false, maxTriangles: 800  },
};

export const PRESET_ORDER = ['potato', 'low', 'medium', 'high'];
