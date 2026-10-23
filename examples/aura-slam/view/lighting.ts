import { effects, lights } from "@aura3d/engine";

/** Four-light rig and post stack, values verbatim from the live scene. */
export function sceneLights() {
  return [
    lights.ambient({ color: "#dce8f2", intensity: 0.62 }),
    lights.hemisphere({ skyColor: "#eef6ff", groundColor: "#4d6358", intensity: 0.72 }),
    lights.directional({ color: "#fff6e5", intensity: 1.95, position: [14, 24, 12], shadow: true }),
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

/** Flags the live page passes to createAuraApp: the post lane is off, exactly like the original renderer. */
export const QUALITY_REBUILD = { flags: ["game", "-compiler", "-post", "-vfxFog"] } as const;
