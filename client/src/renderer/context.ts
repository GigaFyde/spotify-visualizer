export interface GLContext {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  viewportWidth: number;
  viewportHeight: number;
  setDownsample(factor: number): void;
}

export interface GLOptions {
  alpha?: boolean;
  preserveDrawingBuffer?: boolean;
}

export function initWebGL(canvas: HTMLCanvasElement, downsample = 2, useDPR = false, options?: GLOptions): GLContext {
  const gl = canvas.getContext('webgl', {
    alpha: options?.alpha ?? true,
    preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
  });
  if (!gl) throw new Error('WebGL not supported');

  const ctx: GLContext = {
    gl, canvas,
    viewportWidth: 0, viewportHeight: 0,
    setDownsample(factor: number) { downsample = factor; fit(); }
  };

  function fit() {
    const dpr = useDPR ? (window.devicePixelRatio || 1) : 1;
    const w = window.innerWidth * dpr;
    const h = window.innerHeight * dpr;
    canvas.width = Math.floor(w / downsample);
    canvas.height = Math.floor(h / downsample);
    ctx.viewportWidth = canvas.width;
    ctx.viewportHeight = canvas.height;
  }

  window.addEventListener('resize', fit);
  fit();
  return ctx;
}
