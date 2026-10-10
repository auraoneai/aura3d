/**
 * `rigs.rail` (PRD-08 §6.4, §7.1 Q-2): arc-length-parameterised centripetal
 * Catmull-Rom position track with a look-at track (node, point, or second
 * spline) and a per-point FOV track. `loop:"loop"` closes the position spline
 * (S11: no end snap); "pingpong" mirrors it.
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig, AuraCameraRailOptions, AuraCameraSubject } from "../../../contracts/camera.js";
import { ease } from "../ease.js";
import { createSpline, type AuraCameraSpline } from "../Spline.js";
import { mix3 } from "./rigUtils.js";

function lerpTrack(values: readonly number[], u: number, fallback: number): number {
  if (values.length === 0) return fallback;
  if (values.length === 1) return values[0];
  const scaled = Math.max(0, Math.min(1, u)) * (values.length - 1);
  const i = Math.min(values.length - 2, Math.floor(scaled));
  const t = scaled - i;
  return values[i] + (values[i + 1] - values[i]) * t;
}

export function createRailRig(o: AuraCameraRailOptions): AuraCameraRig {
  if (o.points.length < 2) throw new Error("rigs.rail needs >= 2 points");
  const spline = createSpline(o.points, { closed: o.loop === "loop", alpha: o.alpha ?? 0.5 });
  // lookAt: string id | single vec3 | vec3 track. A vec3 is an array too —
  // distinguish by element type.
  const lookTrack =
    Array.isArray(o.lookAt) && o.lookAt.length > 0 && typeof o.lookAt[0] !== "number"
      ? createSpline(o.lookAt as readonly AuraVec3[], { alpha: o.alpha ?? 0.5 })
      : undefined;
  const easeFn = ease[o.ease ?? "inOutSine"];
  const fovTrack = Array.isArray(o.fov) ? o.fov : undefined;
  const fovScalar = typeof o.fov === "number" ? o.fov : 50;

  const u = (time: number): number => {
    const raw = o.duration > 0 ? time / o.duration : 1;
    if (o.loop === "pingpong") {
      const cycle = raw % 2;
      return easeFn(cycle < 1 ? cycle : 2 - cycle);
    }
    if (o.loop === "loop") return easeFn(raw % 1);
    return easeFn(Math.min(1, raw));
  };

  return {
    id: "rail",
    reset() {},
    update(ctx) {
      const t = ctx.time / 1000;
      const uu = u(t);
      const position = spline.pointAt(uu);
      let target: AuraVec3;
      if (typeof o.lookAt === "string") {
        target = (ctx.subject(o.lookAt) as AuraCameraSubject | undefined)?.position ?? ctx.previous.target;
      } else if (lookTrack) {
        target = lookTrack.pointAt(uu);
      } else {
        target = (o.lookAt as AuraVec3) ?? ctx.previous.target;
      }
      const fov = fovTrack ? lerpTrack(fovTrack, uu, fovScalar) : fovScalar;
      return {
        position,
        target,
        up: ctx.previous.up,
        roll: ctx.previous.roll,
        fov,
        near: ctx.previous.near,
        far: ctx.previous.far
      };
    }
  };
}

import { registerRigFactory } from "./registry.js";

registerRigFactory("rail", (o: unknown) => createRailRig(o as Parameters<typeof createRailRig>[0]));
