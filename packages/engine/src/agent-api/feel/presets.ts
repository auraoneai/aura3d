/**
 * `feel/presets.ts` — the six `app.feel.preset(name)` tables (C-23, PRD-08 F-3).
 *
 * Every preset defines the same ten event names (`land`, `jump`, `hit-light`,
 * `hit-heavy`, `ko`, `collect`, `boost`, `explode`, `score`, `fail`); events a
 * preset does not use map to an empty spec. `calm` stays inside its reduced
 * budget (shake ≤ 0.1, punch fov ≥ −1 / dolly 0, no haptics, no screen).
 *
 * Canonical values (PRD-08 §14; retune only with a recorded review in
 * `evidence/prd08/tuning.md`):
 *
 * | event (preset) | shake | punch fov / dolly | hitStop s (scope) | haptics strong/weak/ms | screen |
 * |---|---|---|---|---|---|
 * | `hit-light` (fighting) | 0.25 | −1.5 / 0.10 | 0.045 (actors) | 0.3 / 0.2 / 40 | flash 0.08 |
 * | `hit-heavy` (fighting) | 0.55 | −4 / 0.35 | 0.07 (actors) | 0.8 / 0.4 / 90 | flash 0.25, chroma 0.6, radialBlur 0.2 |
 * | `ko` (fighting) | 0.8 | −6 / 0.5 | 0.10 (global) — the spec's slow-mo tail rides on `hitStop` decay | 1.0 / 0.6 / 180 | flash 0.4, vignette 0.5 |
 * | `land` (platformer) | 0.15 × strength | — | — | 0 / 0.2 / 30 | — |
 * | `boost` (racing) | 0.1 | +8 punch (fovKick channel rides the same FOV lane, half-life 0.25) | — | 0.2 / 0.4 / 120 | radialBlur 0.3 |
 * | `explode` (arcade) | 0.7 | −3 / 0.25 | 0.03 (global) | 0.9 / 0.5 / 150 | flash 0.3, chroma 0.4 |
 * | `score` (puzzle) | 0.1 | −2 / 0.15 | — | 0.2 / 0.1 / 40 | vignette 0.15 |
 * | any (calm) | ≤ 0.1 | ≤ −1 / 0 | — | 0 | none |
 *
 * Presets only declare specs; channel providers decide execution. Audio cues
 * and VFX kinds are left to games (preset specs stick to camera/haptics/screen
 * channels + hitStop, which always have a lane-08 provider).
 */
import type { AuraFeelEventSpec } from "../../contracts/time.js";

export type AuraFeelPresetName = "arcade" | "fighting" | "racing" | "platformer" | "puzzle" | "calm";

export const FEEL_PRESETS: Readonly<Record<AuraFeelPresetName, Readonly<Record<string, AuraFeelEventSpec>>>> = {
  arcade: {
    "land": { shake: 0.18, punch: { dolly: 0.12 }, haptics: { weak: 0.3, ms: 35 } },
    "jump": { punch: { fov: 2 } },
    "hit-light": { shake: 0.25, punch: { fov: -1.5, dolly: 0.1 }, hitStop: { seconds: 0.045, scope: "actors" }, haptics: { strong: 0.3, weak: 0.2, ms: 40 }, screen: { flash: 0.08 } },
    "hit-heavy": { shake: 0.55, punch: { fov: -4, dolly: 0.35 }, hitStop: { seconds: 0.07, scope: "actors" }, haptics: { strong: 0.8, weak: 0.4, ms: 90 }, screen: { flash: 0.25, chroma: 0.6, radialBlur: 0.2 } },
    "ko": { shake: 0.8, punch: { fov: -6, dolly: 0.5 }, hitStop: { seconds: 0.1 }, haptics: { strong: 1, weak: 0.6, ms: 180 }, screen: { flash: 0.4, vignette: 0.5 } },
    "collect": { punch: { fov: 3 }, screen: { vignette: 0.12 } },
    "boost": { shake: 0.1, punch: { fov: 8 }, haptics: { strong: 0.2, weak: 0.4, ms: 120 }, screen: { radialBlur: 0.3 } },
    "explode": { shake: 0.7, punch: { fov: -3, dolly: 0.25 }, hitStop: { seconds: 0.03 }, haptics: { strong: 0.9, weak: 0.5, ms: 150 }, screen: { flash: 0.3, chroma: 0.4 } },
    "score": { shake: 0.1, punch: { fov: -2, dolly: 0.15 }, haptics: { strong: 0.2, weak: 0.1, ms: 40 }, screen: { vignette: 0.15 } },
    "fail": { shake: 0.3, punch: { fov: -2 }, hitStop: { seconds: 0.08 }, screen: { flash: 0.2, vignette: 0.3 } }
  },
  fighting: {
    "land": {},
    "jump": {},
    "hit-light": { shake: 0.25, punch: { fov: -1.5, dolly: 0.1 }, hitStop: { seconds: 0.045, scope: "actors" }, haptics: { strong: 0.3, weak: 0.2, ms: 40 }, screen: { flash: 0.08 } },
    "hit-heavy": { shake: 0.55, punch: { fov: -4, dolly: 0.35 }, hitStop: { seconds: 0.07, scope: "actors" }, haptics: { strong: 0.8, weak: 0.4, ms: 90 }, screen: { flash: 0.25, chroma: 0.6, radialBlur: 0.2 } },
    "ko": { shake: 0.8, punch: { fov: -6, dolly: 0.5 }, hitStop: { seconds: 0.1 }, haptics: { strong: 1, weak: 0.6, ms: 180 }, screen: { flash: 0.4, vignette: 0.5 } },
    "collect": {},
    "boost": {},
    "explode": {},
    "score": {},
    "fail": {},
    "block": { shake: 0.12, hitStop: { seconds: 0.02, scope: "actors" }, haptics: { weak: 0.25, ms: 25 } },
    "whiff": { punch: { fov: 1.5 } }
  },
  racing: {
    "land": {},
    "jump": {},
    "hit-light": {},
    "hit-heavy": {},
    "ko": {},
    "collect": {},
    "boost": { shake: 0.1, punch: { fov: 8 }, haptics: { strong: 0.2, weak: 0.4, ms: 120 }, screen: { radialBlur: 0.3 } },
    "explode": {},
    "score": {},
    "fail": {},
    "drift": { punch: { fov: 2 }, shake: 0.1 },
    "collision": { shake: 0.5, punch: { fov: -3, dolly: 0.3 }, haptics: { strong: 0.7, weak: 0.5, ms: 120 }, screen: { flash: 0.2, chroma: 0.4 } },
    "lap": { screen: { vignette: 0.2 } },
    "spinout": { shake: 0.6, hitStop: { seconds: 0.05 }, screen: { chroma: 0.5, radialBlur: 0.25 } }
  },
  platformer: {
    "land": { shake: 0.15, haptics: { weak: 0.2, ms: 30 } },
    "jump": { punch: { fov: 2 } },
    "hit-light": {},
    "hit-heavy": {},
    "ko": {},
    "collect": { punch: { fov: 2.5 }, screen: { vignette: 0.08 } },
    "boost": {},
    "explode": {},
    "score": {},
    "fail": {},
    "hurt": { shake: 0.35, punch: { fov: -3, dolly: 0.2 }, haptics: { strong: 0.5, weak: 0.4, ms: 80 }, screen: { flash: 0.3, vignette: 0.25 } },
    "checkpoint": { screen: { flash: 0.1, vignette: 0.15 } }
  },
  puzzle: {
    "land": {},
    "jump": {},
    "hit-light": {},
    "hit-heavy": {},
    "ko": {},
    "collect": { punch: { fov: 1.5 }, screen: { vignette: 0.08 } },
    "boost": {},
    "explode": {},
    "score": { shake: 0.1, punch: { fov: -2, dolly: 0.15 }, haptics: { strong: 0.2, weak: 0.1, ms: 40 }, screen: { vignette: 0.15 } },
    "fail": { shake: 0.15, hitStop: { seconds: 0.05 }, screen: { vignette: 0.2 } },
    "place": { punch: { fov: 1.5 } },
    "drop": { shake: 0.25, punch: { dolly: 0.18 }, haptics: { weak: 0.35, ms: 40 } },
    "clear": { shake: 0.15, punch: { fov: 3 }, screen: { flash: 0.12 } },
    "combo": { shake: 0.2, punch: { fov: 4 }, screen: { chroma: 0.3, vignette: 0.15 } }
  },
  calm: {
    "land": {},
    "jump": {},
    "hit-light": {},
    "hit-heavy": {},
    "ko": {},
    "collect": {},
    "boost": {},
    "explode": {},
    "score": {},
    "fail": {},
    "interact": { punch: { fov: 1 } },
    "nudge": { shake: 0.08 },
    "success": {},
    "settle": { punch: { dolly: 0.06 } }
  }
};

/** F-3: exported under the contract name for tests. */
export const feelPresets = FEEL_PRESETS;

/** The ten canonical preset events every table must define (F-3). */
export const FEEL_PRESET_EVENTS = [
  "land", "jump", "hit-light", "hit-heavy", "ko", "collect", "boost", "explode", "score", "fail"
] as const;
