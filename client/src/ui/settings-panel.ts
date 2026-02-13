import { animConfig, setAnimationPreset, ANIMATION_PRESETS, type AnimationConfig } from '../config/animation.js';
import { PRESET_ORDER } from '../quality/presets.js';

type AdaptiveQuality = {
  currentPreset(): string;
  isAuto(): boolean;
  setAuto(enabled: boolean): void;
  forcePreset(name: string): string;
  enableAuto(): void;
};

type QualityChangeCallback = (presetName: string) => void;

interface SliderDef {
  key: keyof AnimationConfig;
  label: string;
  min: number;
  max: number;
  step: number;
}

const CAMERA_SLIDERS: SliderDef[] = [
  { key: 'cameraMovement', label: 'Movement', min: 0, max: 3, step: 0.1 },
  { key: 'fovBreathing', label: 'FOV Breathing', min: 0, max: 3, step: 0.1 },
  { key: 'cameraRoll', label: 'Roll', min: 0, max: 3, step: 0.1 },
];

const ANIM_SLIDERS: SliderDef[] = [
  { key: 'intensity', label: 'Intensity', min: 0, max: 3, step: 0.1 },
  { key: 'wobble', label: 'Wobble', min: 0, max: 3, step: 0.1 },
  { key: 'beatReactivity', label: 'Beat Reactivity', min: 0, max: 3, step: 0.1 },
];

const POSTFX_SLIDERS: SliderDef[] = [
  { key: 'vhsEffect', label: 'VHS Effect', min: 0, max: 3, step: 0.1 },
  { key: 'scanlines', label: 'Scanlines', min: 0, max: 3, step: 0.1 },
  { key: 'chromaticAberration', label: 'Chromatic Aberration', min: 0, max: 3, step: 0.1 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 3, step: 0.1 },
];

const ANIM_PRESET_NAMES = Object.keys(ANIMATION_PRESETS);

export function createSettingsPanel(
  adaptiveQuality: AdaptiveQuality,
  onQualityChange: QualityChangeCallback,
) {
  // Build DOM
  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  const toggle = document.createElement('button');
  toggle.className = 'settings-toggle';
  toggle.textContent = '\u2699';

  let visible = false;
  const sliderInputs = new Map<string, HTMLInputElement>();
  const sliderValueEls = new Map<string, HTMLSpanElement>();
  let animPresetButtons: HTMLButtonElement[] = [];
  let qualityPresetButtons: HTMLButtonElement[] = [];
  let autoButton: HTMLButtonElement;

  // Header
  const header = document.createElement('div');
  header.className = 'settings-header';
  const title = document.createElement('span');
  title.textContent = 'Settings';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'settings-close';
  closeBtn.textContent = '\u00d7';
  header.append(title, closeBtn);
  panel.appendChild(header);

  // Animation presets
  const animSection = createSection('Animation');
  const animBtnRow = document.createElement('div');
  animBtnRow.className = 'preset-buttons';
  for (const name of ANIM_PRESET_NAMES) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      setAnimationPreset(name);
      syncSliders();
      highlightAnimPreset();
    });
    animBtnRow.appendChild(btn);
    animPresetButtons.push(btn);
  }
  animSection.appendChild(animBtnRow);
  panel.appendChild(animSection);

  // Quality presets
  const qualSection = createSection('Quality');
  const qualBtnRow = document.createElement('div');
  qualBtnRow.className = 'preset-buttons';

  autoButton = document.createElement('button');
  autoButton.className = 'preset-btn';
  autoButton.textContent = 'Auto';
  autoButton.addEventListener('click', () => {
    adaptiveQuality.enableAuto();
    highlightQualityPreset();
  });
  qualBtnRow.appendChild(autoButton);

  for (const name of PRESET_ORDER) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      const applied = adaptiveQuality.forcePreset(name);
      onQualityChange(applied);
      highlightQualityPreset();
    });
    qualBtnRow.appendChild(btn);
    qualityPresetButtons.push(btn);
  }
  qualSection.appendChild(qualBtnRow);
  panel.appendChild(qualSection);

  // Slider sections
  panel.appendChild(createSliderSection('Camera', CAMERA_SLIDERS));
  panel.appendChild(createSliderSection('Animation', ANIM_SLIDERS));
  panel.appendChild(createSliderSection('Post-FX', POSTFX_SLIDERS));

  // Events
  toggle.addEventListener('click', () => setVisible(!visible));
  closeBtn.addEventListener('click', () => setVisible(false));

  // Attach to DOM
  document.body.appendChild(panel);
  document.body.appendChild(toggle);

  // Initial state
  syncSliders();
  highlightAnimPreset();
  highlightQualityPreset();

  function setVisible(v: boolean) {
    visible = v;
    panel.classList.toggle('open', visible);
    toggle.classList.toggle('hidden', visible);
  }

  function createSection(label: string): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'settings-section';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    section.appendChild(lbl);
    return section;
  }

  function createSliderSection(label: string, sliders: SliderDef[]): HTMLDivElement {
    const section = createSection(label);
    for (const s of sliders) {
      const row = document.createElement('div');
      row.className = 'slider-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'slider-label';
      nameEl.textContent = s.label;

      const valueEl = document.createElement('span');
      valueEl.className = 'slider-value';
      valueEl.textContent = String(animConfig[s.key]);
      sliderValueEls.set(s.key, valueEl);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(animConfig[s.key]);
      sliderInputs.set(s.key, input);

      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        (animConfig as any)[s.key] = val;
        valueEl.textContent = val.toFixed(1);
        highlightAnimPreset();
      });

      row.append(nameEl, input, valueEl);
      section.appendChild(row);
    }
    return section;
  }

  function syncSliders() {
    for (const [key, input] of sliderInputs) {
      const val = animConfig[key as keyof AnimationConfig] as number;
      input.value = String(val);
      const valueEl = sliderValueEls.get(key);
      if (valueEl) valueEl.textContent = val.toFixed(1);
    }
  }

  function highlightAnimPreset() {
    let matched = '';
    for (const name of ANIM_PRESET_NAMES) {
      const preset = ANIMATION_PRESETS[name];
      const keys = Object.keys(preset) as (keyof AnimationConfig)[];
      const isMatch = keys.every(k => Math.abs((animConfig[k] as number) - (preset[k] as number)) < 0.01);
      if (isMatch) { matched = name; break; }
    }
    for (const btn of animPresetButtons) {
      btn.classList.toggle('active', btn.textContent === matched);
    }
  }

  function highlightQualityPreset() {
    const isAuto = adaptiveQuality.isAuto();
    const current = adaptiveQuality.currentPreset();
    autoButton.classList.toggle('active', isAuto);
    for (const btn of qualityPresetButtons) {
      btn.classList.toggle('active', !isAuto && btn.textContent === current);
    }
  }

  return {
    toggle() { setVisible(!visible); },
    show() { setVisible(true); },
    hide() { setVisible(false); },
    isVisible() { return visible; },
    /** Call periodically to sync quality preset highlight when auto-quality changes it */
    syncQuality() { highlightQualityPreset(); },
  };
}
