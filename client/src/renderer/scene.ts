import type { ShaderProgram } from './shader-manager.js';
import type { MeshBuffers, PostBuffers } from './mesh.js';
import type { Framebuffer } from './framebuffers.js';
import type { GLContext } from './context.js';
import { mat4, vec3 } from 'gl-matrix';
import { drawGeometryPass } from './geometry-pass.js';
import { drawPostPass } from './post-pass.js';
import { updateCamera } from './camera.js';
import { animConfig } from '../config/animation.js';

export interface RenderState {
  globalTime: number;
  progress: number;
  beatValue: number;
  beatValue2: number;
  beatValue4: number;
  beatDelta: number;
  mvMatrix: mat4;
  pMatrix: mat4;
  eyeVector: vec3;
}

export function render(
  ctx: GLContext,
  geometryShader: ShaderProgram,
  postShader: ShaderProgram,
  meshBuffers: MeshBuffers,
  postBuffers: PostBuffers,
  colorFb: Framebuffer,
  depthFb: Framebuffer,
  noiseTex: WebGLTexture,
  state: RenderState
): void {
  const { gl } = ctx;
  const w = animConfig.wobble;
  const br = animConfig.beatReactivity;

  // Update camera
  updateCamera(state.globalTime, state.beatDelta, state.mvMatrix, state.pMatrix, state.eyeVector, ctx.viewportWidth, ctx.viewportHeight);

  // Compute wobble values scaled by config
  const t2base = w * Math.sin(state.globalTime / 1000.0) * Math.max(0, 0.3 + 0.5 * Math.sin(state.globalTime / 4600.0));
  const t3base = w * Math.cos(state.globalTime / 1300.0) * Math.max(0, 0.3 + 0.5 * Math.cos(state.globalTime / 5400.0));
  const wobble1 = t2base + state.beatValue * 0.2 * br * Math.max(0, 0.3 + 0.5 * Math.sin(state.globalTime / 3600.0));
  const wobble2 = t3base + state.beatValue2 * 0.2 * br * Math.max(0, 0.3 + 0.5 * Math.sin(state.globalTime / 5100.0));

  // Scale beat values for post shader by VHS intensity
  const vhs = animConfig.vhsEffect;
  const postBeat1 = state.beatValue * vhs;
  const postBeat2 = state.beatValue2 * vhs;
  const postBeat4 = state.beatValue4 * vhs;
  // Time drives scanlines/noise in the post shader - scale to 0 when VHS off
  const postTime = vhs > 0 ? state.globalTime : 0;

  // Pass 1: Render geometry to color FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, colorFb.framebuffer);
  gl.useProgram(geometryShader.program);
  gl.uniform1f(geometryShader.uniforms['time'], state.globalTime);
  gl.uniform1f(geometryShader.uniforms['progress'], state.progress);
  gl.uniform1f(geometryShader.uniforms['wobble1'], wobble1);
  gl.uniform1f(geometryShader.uniforms['wobble2'], wobble2);
  gl.uniform1i(geometryShader.uniforms['uWriteDepth'], 0);

  gl.viewport(0, 0, colorFb.width, colorFb.height);
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawGeometryPass(gl, geometryShader, meshBuffers, state.mvMatrix, state.pMatrix, state.eyeVector);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Pass 2: Render geometry to depth FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, depthFb.framebuffer);
  gl.uniform1f(geometryShader.uniforms['time'], state.globalTime);
  gl.uniform1f(geometryShader.uniforms['progress'], state.progress);
  gl.uniform1f(geometryShader.uniforms['wobble1'], wobble1);
  gl.uniform1f(geometryShader.uniforms['wobble2'], wobble2);
  gl.uniform1i(geometryShader.uniforms['uWriteDepth'], 1);

  gl.viewport(0, 0, depthFb.width, depthFb.height);
  gl.clearColor(1.0, 1.0, 1.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawGeometryPass(gl, geometryShader, meshBuffers, state.mvMatrix, state.pMatrix, state.eyeVector);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Pass 3: Render geometry to screen + post-processing overlay
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, ctx.viewportWidth, ctx.viewportHeight);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform1i(geometryShader.uniforms['uWriteDepth'], 0);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  drawGeometryPass(gl, geometryShader, meshBuffers, state.mvMatrix, state.pMatrix, state.eyeVector);

  // Post-processing pass
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(postShader.program);
  gl.uniform1f(postShader.uniforms['time'], postTime);
  gl.uniform1f(postShader.uniforms['fBeat1'], postBeat1);
  gl.uniform1f(postShader.uniforms['fBeat2'], postBeat2);
  gl.uniform1f(postShader.uniforms['fBeat3'], postBeat4);
  drawPostPass(gl, postShader, postBuffers, colorFb.texture, depthFb.texture, noiseTex);
}
