/**
 * C-22 `lookAt` layer (PRD-08 §6.5): temporary weighted target override with a
 * half-life weight spring. Weight 1 aims the view axis at the point.
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraLayer } from "../../../contracts/camera.js";
import { springDamp } from "../Spring.js";
import { add, scale, sub } from "./shared.js";

export interface AuraLookAtLayer extends AuraCameraLayer {
  set(point: AuraVec3, weight?: number): void;
  clear(): void;
}

/** Temporary look-target override with a half-life weight spring (§6.5). */
export function createLookAtLayer(weightHalflife = 0.1): AuraLookAtLayer {
  let target: AuraVec3 | undefined;
  let weight = 0;
  let targetWeight = 1;
  return {
    id: "lookAt",
    set(point, w = 1) {
      target = point;
      targetWeight = w;
    },
    clear() {
      target = undefined;
      weight = 0;
    },
    apply(pose, ctx) {
      if (!target) return pose;
      weight = springDamp(weight, targetWeight, weightHalflife, ctx.dt);
      return { ...pose, target: add(pose.target, scale(sub(target, pose.target), weight)) };
    },
    energy: () => (target ? weight : 0)
  };
}
