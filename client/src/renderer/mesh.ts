export interface VectorData {
  width: number;
  height: number;
  tris: Array<{
    x0: number; y0: number; x1: number; y1: number; x2: number; y2: number;
    r: number; g: number; b: number;
  }>;
}

export interface MeshBuffers {
  position: WebGLBuffer;
  color: WebGLBuffer;
  data1: WebGLBuffer;
  data2: WebGLBuffer;
  index: WebGLBuffer;
  numItems: number;
}

export interface PostBuffers {
  position: WebGLBuffer;
  texture: WebGLBuffer;
  index: WebGLBuffer;
  numItems: number;
}

export function createMeshBuffers(gl: WebGLRenderingContext): MeshBuffers {
  return {
    position: gl.createBuffer()!,
    color: gl.createBuffer()!,
    data1: gl.createBuffer()!,
    data2: gl.createBuffer()!,
    index: gl.createBuffer()!,
    numItems: 0,
  };
}

export function updateMeshBuffers(gl: WebGLRenderingContext, buffers: MeshBuffers, vectorData: VectorData): void {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const data1: number[] = [];
  const data2: number[] = [];

  const scale = 1.0 / vectorData.height;
  const xoffset = vectorData.width / 2;
  const yoffset = vectorData.height / 2;

  for (let i = 0; i < vectorData.tris.length; i++) {
    const t = vectorData.tris[i];
    const x0 = -((t.x0 + xoffset) * scale - 1.0);
    const y0 = -((t.y0 + yoffset) * scale - 1.0);
    const x1 = -((t.x1 + xoffset) * scale - 1.0);
    const y1 = -((t.y1 + yoffset) * scale - 1.0);
    const x2 = -((t.x2 + xoffset) * scale - 1.0);
    const y2 = -((t.y2 + yoffset) * scale - 1.0);
    const r = t.r / 255.0;
    const g = t.g / 255.0;
    const b = t.b / 255.0;

    // Centroid
    const xc = (x0 + x1 + x2) / 3.0;
    const yc = (y0 + y1 + y2) / 3.0;

    // Random rotation index
    let R = 0.0;
    R += xc * 4.0;
    R += -0.05 + Math.random() * 0.1;
    R += r - b;

    const dx = 0.0 - xc;
    const dy = 0.0 - yc;
    const d = Math.sqrt(dx * dx + dy * dy);

    const rx = -1.0 + Math.random() * 2.0;
    const ry = d * 0.2 + -1.0 + Math.random() * 2.0;
    const rz = d * d;

    // Position (vec3) x3 vertices
    vertices.push(x0, y0, 0.0, x1, y1, 0.0, x2, y2, 0.0);

    // Color (vec4) x3 vertices
    colors.push(r, g, b, 1.0, r, g, b, 1.0, r, g, b, 1.0);

    // Indices - must push one at a time so indices.length increments between each
    const baseIdx = i * 3;
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);

    // Data1: R, pivotX, pivotY, 0 (vec4) x3
    data1.push(R, xc, yc, 0.0, R, xc, yc, 0.0, R, xc, yc, 0.0);

    // Data2: rx, ry, rz, 0 (vec4) x3
    data2.push(rx, ry, rz, 0.0, rx, ry, rz, 0.0, rx, ry, rz, 0.0);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.data1);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data1), gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.data2);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data2), gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  buffers.numItems = indices.length;
}

export function createPostBuffers(gl: WebGLRenderingContext): PostBuffers {
  return {
    position: gl.createBuffer()!,
    texture: gl.createBuffer()!,
    index: gl.createBuffer()!,
    numItems: 0,
  };
}

export function initPostBuffers(gl: WebGLRenderingContext, buffers: PostBuffers): void {
  const R = 1.0;
  const vertices = new Float32Array([
    -R, -R, 0,  R, -R, 0,  R, R, 0,
    -R, -R, 0,  -R, R, 0,  R, R, 0
  ]);
  const texcoords = new Float32Array([
    0, 0,  1, 0,  1, 1,
    0, 0,  0, 1,  1, 1
  ]);
  const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texture);
  gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  buffers.numItems = 6;
}
