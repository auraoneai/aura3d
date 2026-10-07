// PRD-13 T1.8 — prompt-plan v2 mapping tables (PRD §6.3), exported as frozen
// data. Consumed by `compilePromptPlanV2` (T1.10); every table is complete over
// its 1.0 key type and frozen so the tables are spec, not code paths.

import type {
  AuraPromptCameraPreset,
  AuraPromptEffectId,
  AuraPromptLightingPreset,
  AuraPromptSceneType
} from "../../index.js";
import type { AuraLookId } from "../../../contracts/looks.js";
import type { AuraPostPresetId } from "../../../contracts/post.js";

/** lighting.preset → look id (§6.3). `material-studio` adds a rotating env. */
export interface PromptPlanLightingMapping {
  readonly look: AuraLookId;
  readonly rotatingEnv?: boolean;
}
export const PROMPT_PLAN_LIGHTING_TO_LOOK: Readonly<Record<AuraPromptLightingPreset, PromptPlanLightingMapping>> =
  Object.freeze({
    "studio-softbox": Object.freeze({ look: "product-studio" }),
    "neon-practicals": Object.freeze({ look: "neon-arcade" }),
    "game-readable": Object.freeze({ look: "outdoor-day" }),
    "material-studio": Object.freeze({ look: "product-studio", rotatingEnv: true })
  });

/** environment (free string) → look id via keyword table (§6.3). Ordered; the
 *  first row containing a keyword substring of the environment text wins. */
export interface PromptPlanEnvironmentKeywordRow {
  readonly keywords: readonly string[];
  readonly look: AuraLookId;
}
export const PROMPT_PLAN_ENVIRONMENT_KEYWORDS: readonly PromptPlanEnvironmentKeywordRow[] = Object.freeze([
  Object.freeze({ keywords: Object.freeze(["forest", "meadow", "park"]), look: "outdoor-day" }),
  Object.freeze({ keywords: Object.freeze(["sunset", "dusk", "golden"]), look: "golden-hour" }),
  Object.freeze({ keywords: Object.freeze(["night", "neon", "city"]), look: "night-city" }),
  Object.freeze({ keywords: Object.freeze(["space", "orbit", "planet"]), look: "space" }),
  Object.freeze({ keywords: Object.freeze(["underwater", "ocean floor"]), look: "underwater" }),
  Object.freeze({ keywords: Object.freeze(["room", "interior", "cabin", "gallery"]), look: "interior-warm" }),
  Object.freeze({ keywords: Object.freeze(["studio", "product", "turntable"]), look: "product-studio" }),
  Object.freeze({ keywords: Object.freeze(["snow", "alpine"]), look: "alpine-snow" }),
  Object.freeze({ keywords: Object.freeze(["overcast", "rain"]), look: "overcast" })
]);

/** style (free string) → post grade + optional post preset (§6.3). */
export interface PromptPlanStyleGrade {
  readonly contrast: number;
  readonly saturation: number;
  readonly lift: number;
}
export interface PromptPlanStyleRow {
  readonly keywords: readonly string[];
  readonly grade: PromptPlanStyleGrade;
  /** Present → the style also selects this post preset (e.g. `neon-night`). */
  readonly post?: AuraPostPresetId;
}
export const PROMPT_PLAN_STYLE_TO_GRADE: readonly PromptPlanStyleRow[] = Object.freeze([
  // "noir" → desaturate 0.3 + contrast 1.15 (§6.3; noir is near-monochrome).
  Object.freeze({ keywords: Object.freeze(["noir"]), grade: Object.freeze({ contrast: 1.15, saturation: 0.3, lift: 0 }) }),
  Object.freeze({ keywords: Object.freeze(["pastel"]), grade: Object.freeze({ contrast: 1, saturation: 0.85, lift: 0.02 }) }),
  Object.freeze({ keywords: Object.freeze(["vibrant", "toy", "cartoon"]), grade: Object.freeze({ contrast: 1, saturation: 1.1, lift: 0 }) }),
  Object.freeze({ keywords: Object.freeze(["realistic", "photo"]), grade: Object.freeze({ contrast: 1, saturation: 1, lift: 0 }) }),
  Object.freeze({
    keywords: Object.freeze(["retro", "synthwave"]),
    grade: Object.freeze({ contrast: 1, saturation: 1, lift: 0 }),
    post: "neon-night"
  })
]);

/** camera.preset → a C-22 rig (or the tuned fallback while the slot is a stub). */
export interface PromptPlanCameraMapping {
  /** C-22 rig factory name when the slot is real. */
  readonly rig: "orbit" | "topDown" | "chase" | "flight" | "follow2d" | "fighting" | "shoulder";
  /** Static rig fallback while C-22 is a stub (today: a tuned camera spec). */
  readonly fallback: "perspective" | "dolly" | "topDown" | "orbit";
  /** Autoframe subject-height fraction where the rig supports it. */
  readonly subjectHeightFraction?: readonly [number, number];
  readonly fovDeg?: number;
  readonly pitchDeg?: number;
}
export const PROMPT_PLAN_CAMERA_TO_RIG: Readonly<Record<AuraPromptCameraPreset, PromptPlanCameraMapping>> =
  Object.freeze({
    // §6.3: orbit rig, autoframe 45–70% subject height.
    "product-orbit": Object.freeze({ rig: "orbit", fallback: "orbit", subjectHeightFraction: Object.freeze([0.45, 0.7] as const) }),
    // §6.3: rail dolly — no C-22 dolly factory; `flight` is the moving rig,
    // `dolly` the tuned fallback.
    "cinematic-dolly": Object.freeze({ rig: "flight", fallback: "dolly" }),
    // §6.3: topDown 55°.
    "game-board": Object.freeze({ rig: "topDown", fallback: "topDown", pitchDeg: 55 }),
    // §6.3: orbit, close.
    "material-inspection": Object.freeze({ rig: "orbit", fallback: "orbit", subjectHeightFraction: Object.freeze([0.45, 0.7] as const) })
  });

/** effects[] → apply path or reject (§6.3). */
export type PromptPlanEffectKind =
  | "post"           // applied through the look's post pipeline (bloom)
  | "look-fog"       // the look's fog node on (density × densityScale if already on)
  | "pixel-backed"   // C-20 emitter, only when pixelBacked && sim !== "primitive-pool"
  | "contract"       // needs the named contracts real (wet-reflection: C-21 + C-13 SSR)
  | "reject";        // never applied (hud is DOM)

export interface PromptPlanEffectMapping {
  readonly kind: PromptPlanEffectKind;
  /** Node/pipeline name emitted when applied. */
  readonly emits?: string;
  /** fog density multiplier when the look already has fog (§6.3: ×1.5). */
  readonly densityScale?: number;
  /** Contracts that must be real for `contract` kinds. */
  readonly requires?: readonly string[];
  readonly rejectCode?: "unsupported-effect" | "hud-is-dom";
  readonly rejectMessage?: string;
}
export const PROMPT_PLAN_EFFECT_MAP: Readonly<Record<AuraPromptEffectId, PromptPlanEffectMapping>> =
  Object.freeze({
    bloom: Object.freeze({ kind: "post", emits: "bloom" }),
    fog: Object.freeze({ kind: "look-fog", emits: "fog", densityScale: 1.5 }),
    rain: Object.freeze({ kind: "pixel-backed", emits: "rain", rejectCode: "unsupported-effect" }),
    particles: Object.freeze({ kind: "pixel-backed", emits: "particles", rejectCode: "unsupported-effect" }),
    "wet-reflection": Object.freeze({
      kind: "contract",
      requires: Object.freeze(["C-21", "C-13"]),
      rejectCode: "unsupported-effect"
    }),
    "motion-trail": Object.freeze({ kind: "pixel-backed", emits: "trail", rejectCode: "unsupported-effect" }),
    hud: Object.freeze({
      kind: "reject",
      rejectCode: "hud-is-dom",
      rejectMessage: "HUDs are DOM; use the `@aura3d/game` Hud (C-24)"
    })
  });

/** sceneType default look (§6.3): used when no plan field maps a look. Values
 *  follow the §6.4 template table (mini-game→outdoor-day, viewers→studio). */
export const PROMPT_PLAN_SCENE_DEFAULT_LOOK: Readonly<Record<AuraPromptSceneType, AuraLookId>> = Object.freeze({
  "product-viewer": "product-studio",
  "material-studio": "product-studio",
  "mini-game": "outdoor-day",
  "cinematic-scene": "golden-hour"
});
