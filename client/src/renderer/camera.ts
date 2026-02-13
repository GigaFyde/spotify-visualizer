import { mat4, vec3 } from 'gl-matrix';
import { animConfig } from '../config/animation.js';

const DEG_TO_RAD = Math.PI / 180;

export function updateCamera(
  globalTime: number,
  beatDelta: number,
  mvMatrix: mat4,
  pMatrix: mat4,
  eyeVector: vec3,
  viewportWidth: number,
  viewportHeight: number
): void {
  const cam = animConfig.cameraMovement;
  const fovAmp = animConfig.fovBreathing;
  const roll = animConfig.cameraRoll;

  const fov = 80 + 20 * fovAmp * Math.sin(globalTime / 5000.0);
  mat4.perspective(pMatrix, fov * DEG_TO_RAD, viewportWidth / viewportHeight, 0.1, 100.0);

  const T = globalTime + 150 * beatDelta * animConfig.beatReactivity;

  const eyeFrom: [number, number, number] = [
    0.0 + 0.3 * cam * Math.sin(T / 1950),
    -0.05 + 0.3 * cam * Math.cos(T / 1730),
    0.0 + 0.4 * cam * Math.cos(T / 1463) - 0.6,
  ];

  const eyeTo: [number, number, number] = [
    0.0 + 0.1 * cam * Math.sin(T / 2250),
    -0.05 + 0.1 * cam * Math.cos(T / 1730),
    0.0 + 0.1 * cam * Math.cos(T / 1963) + 0.0,
  ];

  vec3.subtract(eyeVector, eyeTo as vec3, eyeFrom as vec3);
  vec3.normalize(eyeVector, eyeVector);

  mat4.lookAt(mvMatrix, eyeFrom as vec3, eyeTo as vec3, [
    0.0 + 0.1 * roll * Math.sin(globalTime / 3650),
    1.0,
    0.0 + 0.1 * roll * Math.cos(globalTime / 2650),
  ] as vec3);
}
