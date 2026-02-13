import { mat4, vec3 } from 'gl-matrix';

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
  const fov = 80 + 20 * Math.sin(globalTime / 5000.0);
  mat4.perspective(pMatrix, fov * DEG_TO_RAD, viewportWidth / viewportHeight, 0.1, 100.0);

  const T = globalTime + 150 * beatDelta;

  const eyeFrom: [number, number, number] = [
    0.0 + 0.3 * Math.sin(T / 1950),
    0.0 + 0.3 * Math.cos(T / 1730),
    0.0 + 0.4 * Math.cos(T / 1463) - 0.6,
  ];

  const eyeTo: [number, number, number] = [
    0.0 + 0.1 * Math.sin(T / 2250),
    0.0 + 0.1 * Math.cos(T / 1730),
    0.0 + 0.1 * Math.cos(T / 1963) + 0.0,
  ];

  // gl-matrix v3: subtract(out, a, b)
  vec3.subtract(eyeVector, eyeTo as vec3, eyeFrom as vec3);
  vec3.normalize(eyeVector, eyeVector);

  // gl-matrix v3: lookAt(out, eye, center, up)
  mat4.lookAt(mvMatrix, eyeFrom as vec3, eyeTo as vec3, [
    0.0 + 0.1 * Math.sin(globalTime / 3650),
    1.0,
    0.0 + 0.1 * Math.cos(globalTime / 2650),
  ] as vec3);
}
