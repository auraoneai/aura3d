/**
 * C-22 `rigs.static` (PRD-08 R-9): a fixed-pose rig from `Partial<AuraCameraPose>`
 * — unspecified fields take DEFAULT_POSE. Real implementation lives here (S19
 * tree-shake); `fromSpec.ts` re-exports both names for flag-off compatibility.
 */
import type { AuraCameraPose, AuraCameraRig } from "../../../contracts/camera.js";

export const DEFAULT_POSE: AuraCameraPose = {
  position: [0, 1.6, 5],
  target: [0, 1, 0],
  up: [0, 1, 0],
  roll: 0,
  fov: 50,
  near: 0.1,
  far: 1000
};

/** `rigs.static` — fixed pose; layers still apply to it downstream. */
export function staticRig(pose: Partial<AuraCameraPose> = {}, id = "static"): AuraCameraRig {
  const full: AuraCameraPose = { ...DEFAULT_POSE, ...pose };
  return {
    id,
    update: () => full,
    reset: () => {
      /* static rig keeps its authored pose */
    }
  };
}

import { registerRigFactory } from "./registry.js";

registerRigFactory("static", (pose: unknown) => staticRig(pose as Partial<AuraCameraPose>, "static"));
