/**
 * `feel/presets.ts` — the six `app.feel.preset(name)` tables (C-23).
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
    "collect": { punch: { fov: 3 }, screen: { vignette: 0.12 } },
    "hit": { shake: 0.4, punch: { fov: -3, dolly: 0.25 }, haptics: { strong: 0.5, weak: 0.3, ms: 60 }, screen: { flash: 0.15, chroma: 0.35 } },
    "boost": { punch: { fov: 6 }, screen: { radialBlur: 0.25 } },
    "explode": { shake: 0.6, punch: { fov: -4, dolly: 0.4 }, haptics: { strong: 0.9, weak: 0.5, ms: 140 }, screen: { flash: 0.35, chroma: 0.6, vignette: 0.3 } }
  },
  fighting: {
    "hit-light": { shake: 0.22, punch: { dolly: 0.12 }, hitStop: { seconds: 0.045, scope: "actors" }, haptics: { strong: 0.35, weak: 0.2, ms: 40 } },
    "hit-heavy": { shake: 0.55, punch: { fov: -4, dolly: 0.35 }, hitStop: { seconds: 0.07, scope: "actors" }, haptics: { strong: 0.8, weak: 0.4, ms: 90 }, screen: { flash: 0.25, chroma: 0.6, radialBlur: 0.2 } },
    "ko": { shake: 0.7, punch: { fov: -6, dolly: 0.5 }, hitStop: { seconds: 0.12, scope: "actors" }, haptics: { strong: 1, weak: 0.6, ms: 180 }, screen: { flash: 0.4, chroma: 0.8, vignette: 0.4 } },
    "block": { shake: 0.12, hitStop: { seconds: 0.02, scope: "actors" }, haptics: { weak: 0.25, ms: 25 } },
    "whiff": { punch: { fov: 1.5 } }
  },
  racing: {
    "boost": { punch: { fov: 8 }, screen: { radialBlur: 0.3 } },
    "drift": { punch: { fov: 2 }, shake: 0.1 },
    "collision": { shake: 0.5, punch: { fov: -3, dolly: 0.3 }, haptics: { strong: 0.7, weak: 0.5, ms: 120 }, screen: { flash: 0.2, chroma: 0.4 } },
    "lap": { screen: { vignette: 0.2 } },
    "spinout": { shake: 0.6, hitStop: { seconds: 0.05 }, screen: { chroma: 0.5, radialBlur: 0.25 } }
  },
  platformer: {
    "jump": { punch: { fov: 2 } },
    "land": { shake: 0.15, punch: { dolly: 0.1 }, haptics: { weak: 0.3, ms: 30 } },
    "collect": { punch: { fov: 2.5 }, screen: { vignette: 0.08 } },
    "hurt": { shake: 0.35, punch: { fov: -3, dolly: 0.2 }, haptics: { strong: 0.5, weak: 0.4, ms: 80 }, screen: { flash: 0.3, vignette: 0.25 } },
    "checkpoint": { screen: { flash: 0.1, vignette: 0.15 } }
  },
  puzzle: {
    "place": { punch: { fov: 1.5 } },
    "drop": { shake: 0.25, punch: { dolly: 0.18 }, haptics: { weak: 0.35, ms: 40 } },
    "clear": { shake: 0.15, punch: { fov: 3 }, screen: { flash: 0.12 } },
    "combo": { shake: 0.2, punch: { fov: 4 }, screen: { chroma: 0.3, vignette: 0.15 } }
  },
  calm: {
    "interact": { punch: { fov: 1 } },
    "nudge": { shake: 0.08, haptics: { weak: 0.15, ms: 20 } },
    "success": { screen: { vignette: 0.08 } },
    "settle": { punch: { dolly: 0.06 } }
  }
};
