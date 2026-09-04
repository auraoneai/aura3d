import {
  createAuraApp as createProductApp,
  type AuraLeanApp,
  type AuraLeanAppTarget,
  type AuraLeanCreateAppOptions
} from "./product.js";
import {
  createLeanGameInput,
  createLeanPlatformer,
  type LeanGameInputController,
  type LeanGameInputOptions
} from "./ArcadeRuntime.js";
import {
  createSdfFontAtlas,
  layoutSdfText,
  SDF_FONT_SCOPE_NOTE,
  SDF_SUPPORTED_GLYPHS,
  type SdfFontAtlas,
  type SdfFontAtlasOptions,
  type SdfTextLayout,
  type SdfTextLayoutOptions
} from "@aura3d/rendering";

export * from "./product.js";
export type * from "./ArcadeRuntime.js";

export interface AuraLeanGameApp extends AuraLeanApp {
  input(options: LeanGameInputOptions): LeanGameInputController;
}

/**
 * Creates the deterministic arcade entry. Physical simulation is intentionally
 * absent: add `@aura3d/physics-rapier` explicitly when a game claims rigid-body,
 * character-controller, or vehicle physics.
 */
export function createAuraApp(target: AuraLeanAppTarget, options: AuraLeanCreateAppOptions): AuraLeanGameApp {
  const base = createProductApp(target, options);
  const inputs = new Set<LeanGameInputController>();
  const stopInputUpdates = base.onFrame((deltaSeconds) => {
    for (const input of inputs) input.update(deltaSeconds);
  });
  return {
    ...base,
    input(inputOptions) {
      const input = createLeanGameInput(inputOptions);
      inputs.add(input);
      return input;
    },
    dispose() {
      stopInputUpdates();
      for (const input of inputs) input.dispose();
      inputs.clear();
      base.dispose();
    }
  };
}

export type LeanCameraRigKind = "side-view-follow" | "top-down-follow";

export interface LeanCameraRigOptions {
  readonly kind?: LeanCameraRigKind;
  /** World offset from the focus point (side-view default frames the fight plane). */
  readonly offset?: readonly [number, number, number];
  /** Exponential smoothing rate per second; higher snaps faster. */
  readonly smoothing?: number;
}

export interface LeanCameraRig {
  readonly kind: LeanCameraRigKind;
  readonly position: readonly [number, number, number];
  follow(focus: readonly [number, number, number], dtSeconds: number): readonly [number, number, number];
  snap(focus: readonly [number, number, number]): readonly [number, number, number];
}

/**
 * J3 camera rigs (F2 surface for lean, tree-shaken). Pure follow math — the
 * route feeds the returned position into its own camera each frame.
 */
export function createLeanCameraRig(options: LeanCameraRigOptions = {}): LeanCameraRig {
  const kind = options.kind ?? "side-view-follow";
  const offset = options.offset ?? (kind === "top-down-follow" ? [0, 9, 0.001] : [0, 1.6, 6.4]);
  const smoothing = Math.max(0.1, options.smoothing ?? 6);
  let position: readonly [number, number, number] = [offset[0], offset[1], offset[2]];
  const target = (focus: readonly [number, number, number]): readonly [number, number, number] => [
    focus[0] + offset[0],
    focus[1] + offset[1],
    focus[2] + offset[2]
  ];
  return {
    kind,
    get position() {
      return position;
    },
    follow(focus, dtSeconds) {
      const goal = target(focus);
      const alpha = 1 - Math.exp(-smoothing * Math.max(0, dtSeconds));
      position = [
        position[0] + (goal[0] - position[0]) * alpha,
        position[1] + (goal[1] - position[1]) * alpha,
        position[2] + (goal[2] - position[2]) * alpha
      ];
      return position;
    },
    snap(focus) {
      position = target(focus);
      return position;
    }
  };
}

export interface LeanGameFeelOptions {
  /** Trauma decay per second (default 1.6). */
  readonly traumaDecay?: number;
  /** Maximum shake offset in world units at full trauma. */
  readonly maxShake?: number;
  /** Hit-stop freeze duration in seconds applied per impact. */
  readonly hitStopDuration?: number;
}

export interface LeanGameFeel {
  addTrauma(amount: number): number;
  hitStop(): void;
  update(dtSeconds: number): { readonly trauma: number; readonly shake: readonly [number, number]; readonly frozen: boolean };
  snapshot(): { readonly trauma: number; readonly frozen: boolean };
}

/**
 * J3 game feel (F3 surface for lean, tree-shaken). Trauma/screen-shake/hit-stop
 * as pure state: routes add trauma on hits and apply the shake offset to their
 * camera. No renderer coupling, deterministic for replays.
 */
export function createLeanGameFeel(options: LeanGameFeelOptions = {}): LeanGameFeel {
  const traumaDecay = Math.max(0.1, options.traumaDecay ?? 1.6);
  const maxShake = Math.max(0, options.maxShake ?? 0.25);
  const hitStopDuration = Math.max(0, options.hitStopDuration ?? 0.06);
  let trauma = 0;
  let frozenTime = 0;
  // Deterministic pseudo-random shake (seeded counter, not Math.random) so replays stay exact.
  let shakeTick = 0;
  const shakePhase = (): readonly [number, number] => {
    shakeTick += 1;
    const a = Math.sin(shakeTick * 12.9898) * 43758.5453;
    const b = Math.sin(shakeTick * 78.233) * 12543.1234;
    return [a - Math.floor(a) - 0.5, b - Math.floor(b) - 0.5];
  };
  return {
    addTrauma(amount) {
      trauma = Math.min(1, Math.max(0, trauma + Math.max(0, amount)));
      return trauma;
    },
    hitStop() {
      frozenTime = hitStopDuration;
    },
    update(dtSeconds) {
      const dt = Math.max(0, dtSeconds);
      if (frozenTime > 0) {
        frozenTime = Math.max(0, frozenTime - dt);
        return { trauma, shake: [0, 0] as const, frozen: frozenTime > 0 };
      }
      trauma = Math.max(0, trauma - traumaDecay * dt);
      const magnitude = trauma * trauma * maxShake;
      const [px, py] = shakePhase();
      return { trauma, shake: [px * 2 * magnitude, py * 2 * magnitude] as const, frozen: false };
    },
    snapshot() {
      return { trauma, frozen: frozenTime > 0 };
    }
  };
}

export interface LeanDebugDraw {
  readonly enabled: boolean;
  setEnabled(enabled: boolean): boolean;
  toggle(): boolean;
}

/** J3 debug-draw toggle (tree-shaken). Routes gate collision-volume overlays on it. */
export function createLeanDebugDraw(initial = false): LeanDebugDraw {
  let enabled = initial;
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(next) {
      enabled = next;
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    }
  };
}

export type LeanPerformanceGovernorMode = "off" | "conservative" | "aggressive";

export interface LeanPerformanceGovernorSettings {
  readonly resolutionScale: number;
  readonly particleScale: number;
}

/**
 * J3 perf governor (J1 policy for lean, tree-shaken). Same two-rung headroom
 * discipline as the engine governor, reduced to the knobs a lean route owns
 * (resolution + particle scale). Engine routes use the full governor from
 * `@aura3d/engine/production-runtime` instead.
 */
export function createLeanPerformanceGovernor(mode: LeanPerformanceGovernorMode = "conservative") {
  const resolutions = [1, 0.85, 0.7, 0.5];
  const particles = [1, 0.7, 0.4, 0.2];
  let settings: LeanPerformanceGovernorSettings = { resolutionScale: 1, particleScale: 1 };
  let headroomFrames = 0;
  const degraded: string[] = [];
  const atFloor = (): boolean => settings.resolutionScale === 0.5 && settings.particleScale === 0.2;
  return {
    mode,
    get settings(): LeanPerformanceGovernorSettings {
      return settings;
    },
    get degraded(): readonly string[] {
      return degraded;
    },
    step(frameTimeMs: number): LeanPerformanceGovernorSettings {
      if (mode === "off") return settings;
      if (frameTimeMs > 16.7) {
        headroomFrames = 0;
        const steps = mode === "aggressive" ? 2 : 1;
        for (let i = 0; i < steps && !atFloor(); i += 1) {
          if (settings.resolutionScale !== 0.5) {
            settings = {
              ...settings,
              resolutionScale: resolutions[Math.min(3, resolutions.indexOf(settings.resolutionScale) + 1)] ?? 0.5
            };
            degraded.push("resolutionScale");
          } else {
            settings = {
              ...settings,
              particleScale: particles[Math.min(3, particles.indexOf(settings.particleScale) + 1)] ?? 0.2
            };
            degraded.push("particleScale");
          }
        }
        return settings;
      }
      if (frameTimeMs <= 16.7 * 0.8) {
        headroomFrames += 1;
        const threshold = mode === "aggressive" ? 2 : 4;
        if (headroomFrames >= threshold && (settings.resolutionScale !== 1 || settings.particleScale !== 1)) {
          headroomFrames = 0;
          if (settings.particleScale !== 1) {
            settings = {
              ...settings,
              particleScale: particles[Math.max(0, particles.indexOf(settings.particleScale) - 1)] ?? 1
            };
            degraded.push("recovered:particleScale");
          } else {
            settings = {
              ...settings,
              resolutionScale: resolutions[Math.max(0, resolutions.indexOf(settings.resolutionScale) - 1)] ?? 1
            };
            degraded.push("recovered:resolutionScale");
          }
        }
      } else {
        headroomFrames = 0;
      }
      return settings;
    }
  };
}

export interface LeanTextOptions {
  readonly atlas?: SdfFontAtlasOptions;
  readonly layout?: SdfTextLayoutOptions;
}

export interface LeanText {
  readonly atlas: SdfFontAtlas;
  readonly supportedGlyphs: typeof SDF_SUPPORTED_GLYPHS;
  readonly scopeNote: typeof SDF_FONT_SCOPE_NOTE;
  /**
   * Layout-only until the G1 sampler lands: quads + atlas UVs are resolved
   * here, but no atlas upload / quad submission / pixel backing happens in
   * lean, so `pixelBacked` stays false (matches root fail-loud wording).
   */
  readonly pixelBacked: false;
  layout(text: string, options?: SdfTextLayoutOptions): SdfTextLayout;
}

/**
 * J3 text surface for lean (G1 SDF scope, tree-shaken). Pure atlas bake +
 * quad layout over the uppercase-alphanumeric catalog; the native sampler +
 * pixel proof remain G1 work, hence `pixelBacked: false` by construction.
 */
export function createLeanText(options: LeanTextOptions = {}): LeanText {
  const atlas = createSdfFontAtlas(options.atlas);
  const baseLayout = options.layout;
  return {
    atlas,
    supportedGlyphs: SDF_SUPPORTED_GLYPHS,
    scopeNote: SDF_FONT_SCOPE_NOTE,
    pixelBacked: false as const,
    layout(text, layoutOptions) {
      return layoutSdfText(text, atlas, { ...baseLayout, ...layoutOptions });
    }
  };
}

export const game = {
  input: createLeanGameInput,
  platformer: createLeanPlatformer,
  cameraRig: createLeanCameraRig,
  gameFeel: createLeanGameFeel,
  debugDraw: createLeanDebugDraw,
  performanceGovernor: createLeanPerformanceGovernor,
  text: createLeanText,
  runtime: "lean-deterministic-arcade"
} as const;
