/**
 * `rigs.altitude` (PRD-08 §6.4, §7.1 R-8): lander camera. Distance grows with
 * subject altitude so the ground point and the goal both stay framed; the look
 * target leads 30 % toward the goal; subject occupies ~10 % frame height.
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig } from "../../../contracts/camera.js";
import { springDamp, springDampVec3 } from "../Spring.js";
import { distanceForFraction } from "../framing.js";
import { add, mix3, mul, nearForDistance, normalize, sub, subjectHeight } from "./rigUtils.js";

export interface AltitudeRigOptions {
  readonly target: string;
  /** Ground reference point (the landing terrain under the subject). */
  readonly ground: AuraVec3 | string;
  /** Optional goal node id; the look target leads toward it. */
  readonly goal?: string;
  readonly lead?: number;
  readonly framing?: { readonly subjectHeightFraction: number };
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly fov?: number;
  /** Camera pitch above the subject→ground line in degrees (default 50). */
  readonly pitchDeg?: number;
}

export function createAltitudeRig(o: AltitudeRigOptions): AuraCameraRig {
  const lead = o.lead ?? 0.3;
  const fraction = o.framing?.subjectHeightFraction ?? 0.1;
  const minDistance = o.minDistance ?? 2;
  const maxDistance = o.maxDistance ?? 60;
  const fov = o.fov ?? 50;
  const pitch = (o.pitchDeg ?? 50) * (Math.PI / 180);

  let dist = Number.NaN;
  let look: AuraVec3 | undefined;

  return {
    id: "altitude",
    continuous: true,
    reset(pose) {
      dist = Number.NaN;
      look = pose ? [...pose.target] : undefined;
    },
    update(ctx) {
      const subject = ctx.subject(o.target);
      if (!subject) return ctx.previous;
      const ground =
        typeof o.ground === "string" ? ctx.subject(o.ground)?.position : (o.ground as AuraVec3 | undefined);
      const goal = o.goal ? ctx.subject(o.goal)?.position : undefined;
      if (!ground) return ctx.previous;

      const h = subjectHeight(subject);

      // Eye above-behind at fixed pitch; aim leads toward ground/goal.
      const away = goal
        ? normalize(sub(subject.position, goal))
        : ([0, 0, -1] as AuraVec3);
      const vFov = (fov * Math.PI) / 180;
      const halfFov = vFov / 2;
      const armAt = (d: number): AuraVec3 =>
        add(subject.position, [
          away[0] * Math.cos(pitch) * d,
          Math.sin(pitch) * d,
          away[2] * Math.cos(pitch) * d
        ]);
      const aimAt = (): AuraVec3 =>
        goal ? mix3(mix3(subject.position, ground, 0.25), goal, lead) : mix3(subject.position, ground, 0.25);
      /** Angular gap between `point` (seen from `eye`) and the view axis. */
      const axisGap = (eye: AuraVec3, aim: AuraVec3, point: AuraVec3): number => {
        const axis = normalize(sub(aim, eye));
        const to = normalize(sub(point, eye));
        const c = Math.min(1, Math.max(-1, axis[0] * to[0] + axis[1] * to[1] + axis[2] * to[2]));
        return Math.acos(c);
      };

      // Fit (§6.4): subject at `fraction`, ground+goal inside 90% of the half-FOV.
      const dSubject = distanceForFraction(h, fov, fraction);
      const margin = halfFov * 0.9;
      const fits = (d: number): boolean => {
        const eye = armAt(d);
        const aim = aimAt();
        if (axisGap(eye, aim, ground) > margin) return false;
        return !goal || axisGap(eye, aim, goal) <= margin;
      };
      let dTarget = Math.max(minDistance, dSubject);
      if (!fits(dTarget)) {
        // Bisection: larger distance flattens the geometry toward fitting.
        let lo = dTarget;
        let hi = maxDistance;
        for (let i = 0; i < 24 && hi - lo > 1e-3; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) hi = mid;
          else lo = mid;
        }
        dTarget = hi;
      }
      dTarget = Math.min(maxDistance, dTarget);
      dist = Number.isNaN(dist) ? dTarget : springDamp(dist, dTarget, 0.25, ctx.dt);

      const eye = armAt(dist);
      const aim = aimAt();
      look = look === undefined ? aim : springDampVec3(look, aim, 0.1, ctx.dt);

      return {
        position: eye,
        target: look,
        up: [0, 1, 0],
        roll: 0,
        fov,
        near: nearForDistance(dist),
        far: ctx.previous.far
      };
    }
  };
}

import { registerRigFactory } from "./registry.js";

registerRigFactory("altitude", (o: unknown) => createAltitudeRig(o as Parameters<typeof createAltitudeRig>[0]));
