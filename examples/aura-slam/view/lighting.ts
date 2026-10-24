import { effects, lights } from "@aura3d/engine";

/** Four-light rig and post stack, values verbatim from the live scene. */
/**
 * One sun-shadow cascade by default: the camera is fixed (fov 15, ~45 m back) and the court is small, so a single cascade covers it and
 * keeps the draw budget (three cascades re-draw every caster three times: 199 draw calls vs 117). `?cascades=auto|1|2|3|4` overrides.
 */
export function viewTuning(): { cascades?: 1 | 2 | 3 | 4 | "auto" } {
  if (typeof location === "undefined") return { cascades: 1 };
  const raw = new URLSearchParams(location.search).get("cascades");
  if (raw === "auto") return { cascades: "auto" };
  const c = Number(raw);
  return c >= 1 && c <= 4 ? { cascades: c as 1 | 2 | 3 | 4 } : { cascades: 1 };
}

export function sceneLights() {
  const tune = viewTuning();
  return [
    lights.ambient({ color: "#dce8f2", intensity: 0.62 }),
    lights.hemisphere({ skyColor: "#eef6ff", groundColor: "#4d6358", intensity: 0.72 }),
    lights.directional({ color: "#fff6e5", intensity: 1.95, position: [14, 24, 12], shadow: tune.cascades === "auto" ? true : { cascades: tune.cascades ?? 1 } }),
    lights.point({ color: "#d8ff3e", intensity: 1.4, position: [0, 11, 0], distance: 42 })
  ];
}

export function postEffects() {
  return [
    effects.bloom({ intensity: 0.14, threshold: 0.86, radius: 0.45 }),
    effects.vignette({ intensity: 0.18, smoothness: 0.65 }),
    effects.colorGrade({ contrast: 1.05, saturation: 1.08 })
  ];
}

/** Flags the live page passes to createAuraApp since the 15-game pin removal (7e5475d2d): the engine defaults plus the game lane (post, VFX fog and the compiler are ON). */
export const QUALITY_REBUILD = { flags: ["game"] } as const;
