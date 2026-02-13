/** Controls how expressive/intense all animations are. 0 = frozen, 1 = original, >1 = exaggerated */
export interface AnimationConfig {
  /** Overall multiplier for all animation (0 = static, 1 = default, 2 = wild) */
  intensity: number;

  /** Camera orbit amplitude (0 = locked, 1 = original gentle orbit) */
  cameraMovement: number;

  /** Camera FOV breathing amplitude (0 = fixed 80°, 1 = original ±20°) */
  fovBreathing: number;

  /** Triangle wobble/jitter amount (0 = flat, 1 = original) */
  wobble: number;

  /** Beat reactivity multiplier (0 = no beat response, 1 = original) */
  beatReactivity: number;

  /** Camera roll/tilt amount (0 = level, 1 = original) */
  cameraRoll: number;

  /** Fade-in duration in ms (default 14000) */
  fadeInDuration: number;

  /** Fade-out duration in ms (default 5000) */
  fadeOutDuration: number;

  /** VHS post-processing (0 = off, 1 = full) */
  vhsEffect: number;

  /** Scanline/noise intensity (0 = clean, 1 = original) */
  scanlines: number;

  /** Chromatic aberration / RGB shift (0 = off, 1 = original) */
  chromaticAberration: number;

  /** Vignette darkening (0 = off, 1 = original) */
  vignette: number;
}

export const ANIMATION_PRESETS: Record<string, AnimationConfig> = {
  frozen: {
    intensity: 0, cameraMovement: 0, fovBreathing: 0, wobble: 0,
    beatReactivity: 0, cameraRoll: 0, fadeInDuration: 0, fadeOutDuration: 0,
    vhsEffect: 0, scanlines: 0, chromaticAberration: 0, vignette: 0,
  },
  clean: {
    intensity: 0.5, cameraMovement: 0.3, fovBreathing: 0.2, wobble: 0.2,
    beatReactivity: 0.5, cameraRoll: 0.1, fadeInDuration: 10000, fadeOutDuration: 3000,
    vhsEffect: 0, scanlines: 0, chromaticAberration: 0, vignette: 0.3,
  },
  subtle: {
    intensity: 0.3, cameraMovement: 0.2, fovBreathing: 0.1, wobble: 0.2,
    beatReactivity: 0.5, cameraRoll: 0.1, fadeInDuration: 10000, fadeOutDuration: 3000,
    vhsEffect: 0.3, scanlines: 0.2, chromaticAberration: 0.2, vignette: 0.5,
  },
  default: {
    intensity: 1.0, cameraMovement: 1.0, fovBreathing: 1.0, wobble: 1.0,
    beatReactivity: 1.0, cameraRoll: 1.0, fadeInDuration: 14000, fadeOutDuration: 5000,
    vhsEffect: 1.0, scanlines: 1.0, chromaticAberration: 1.0, vignette: 1.0,
  },
  expressive: {
    intensity: 1.5, cameraMovement: 1.5, fovBreathing: 1.3, wobble: 1.8,
    beatReactivity: 2.0, cameraRoll: 1.5, fadeInDuration: 10000, fadeOutDuration: 4000,
    vhsEffect: 1.3, scanlines: 1.2, chromaticAberration: 1.5, vignette: 1.2,
  },
  wild: {
    intensity: 2.5, cameraMovement: 2.5, fovBreathing: 2.0, wobble: 3.0,
    beatReactivity: 3.0, cameraRoll: 2.0, fadeInDuration: 7000, fadeOutDuration: 3000,
    vhsEffect: 2.0, scanlines: 1.5, chromaticAberration: 2.5, vignette: 1.5,
  },
};

/** Active animation config - mutate this to change at runtime */
export let animConfig: AnimationConfig = { ...ANIMATION_PRESETS.default };

export function setAnimationPreset(name: string): void {
  const preset = ANIMATION_PRESETS[name];
  if (preset) Object.assign(animConfig, preset);
}
