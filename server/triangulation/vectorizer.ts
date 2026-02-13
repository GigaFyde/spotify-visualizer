import { loadImage } from './image-loader.js';
import { triangulate } from './delaunay.js';
import type { VectorData } from '../ws/protocol.js';

export async function vectorize(imageUrl: string, cutoff = 25000, threshold = 15): Promise<VectorData> {
  const img = await loadImage(imageUrl);
  const { width, height, data } = img;

  // Grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Edge detection (4-neighbor max diff)
  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const c = gray[idx];
      const diff = Math.max(
        Math.abs(c - gray[idx - 1]),
        Math.abs(c - gray[idx + 1]),
        Math.abs(c - gray[idx - width]),
        Math.abs(c - gray[idx + width])
      );
      edges[idx] = diff;
    }
  }

  // Sample points from edges
  const points: number[] = [];
  const maxPoints = Math.min(Math.floor(cutoff / 3), 10000);

  // Add corners
  points.push(0, 0, width, 0, 0, height, width, height);

  // Add grid points for coverage with jitter to avoid regular rectangular patterns
  const gridStep = Math.max(4, Math.floor(width / 20));
  for (let y = 0; y <= height; y += gridStep) {
    for (let x = 0; x <= width; x += gridStep) {
      // Keep corners and edges exact, jitter interior points
      const isEdge = x === 0 || x >= width - gridStep || y === 0 || y >= height - gridStep;
      const jitter = isEdge ? 0 : gridStep * 0.3;
      points.push(
        x + (Math.random() - 0.5) * jitter,
        y + (Math.random() - 0.5) * jitter
      );
    }
  }

  // Collect ALL edge candidates first, then subsample uniformly
  // This prevents top-heavy bias from sequential scanning
  const edgeCandidates: Array<{ x: number; y: number; weight: number }> = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const e = edges[y * width + x];
      if (e > threshold) {
        edgeCandidates.push({ x, y, weight: e });
      }
    }
  }

  // Shuffle candidates for uniform spatial distribution
  for (let i = edgeCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [edgeCandidates[i], edgeCandidates[j]] = [edgeCandidates[j], edgeCandidates[i]];
  }

  // Add edge points weighted by edge strength
  for (const c of edgeCandidates) {
    if (points.length / 2 >= maxPoints) break;
    const probability = Math.min(1.0, c.weight / 60.0);
    if (Math.random() < probability) {
      points.push(c.x + (Math.random() - 0.5) * 0.5, c.y + (Math.random() - 0.5) * 0.5);
    }
  }

  // Triangulate
  const indices = triangulate(points);

  // Build triangle data with colors
  const tris: VectorData['tris'] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
    const x0 = points[i0 * 2], y0 = points[i0 * 2 + 1];
    const x1 = points[i1 * 2], y1 = points[i1 * 2 + 1];
    const x2 = points[i2 * 2], y2 = points[i2 * 2 + 1];

    // Sample color at centroid
    const cx = Math.floor((x0 + x1 + x2) / 3);
    const cy = Math.floor((y0 + y1 + y2) / 3);
    const ci = (Math.min(Math.max(cy, 0), height - 1) * width + Math.min(Math.max(cx, 0), width - 1)) * 4;

    tris.push({
      x0, y0, x1, y1, x2, y2,
      r: data[ci], g: data[ci + 1], b: data[ci + 2],
    });
  }

  return { width, height, tris };
}
