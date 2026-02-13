import Delaunator from 'delaunator';

export function triangulate(points: number[]): Uint32Array {
  const d = new Delaunator(points);
  return d.triangles;
}
