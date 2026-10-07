/**
 * C-10 (PRD-08 §6.4): camera collision damper shared by chase/shoulder/orbit/
 * flight. Sphere-cast from the look-at point to the desired eye; pull-in is a
 * fast spring (default half-life 0.04 s), push-out a slow one (0.35 s) so the
 * arm does not pump when an occluder jitters. The cast radius defaults to 0.2 m.
 */
import type { AuraVec3 } from "../index.js";
import type { AuraCameraProbe } from "../../contracts/camera.js";
import { springDamp } from "./Spring.js";

export interface CollisionDamperOptions {
  readonly radius?: number;
  readonly pullInHalflife?: number;
  readonly pushOutHalflife?: number;
}

export interface CollisionDamper {
  /**
   * Resolve the camera eye for this frame. `desired` is where the rig wants the
   * eye; the returned point sits on the lookAt→desired segment at the damped
   * distance. Call once per rig update.
   */
  resolve(lookAt: AuraVec3, desired: AuraVec3, dt: number): AuraVec3;
  /** Current damped distance along the segment (for tests/evidence). */
  readonly distance: number;
  /** Clear damped state so the next resolve snaps to the desired distance. */
  reset(): void;
}

const sub = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: AuraVec3, s: number): AuraVec3 => [a[0] * s, a[1] * s, a[2] * s];

export function createCollisionDamper(
  probe: AuraCameraProbe,
  options: CollisionDamperOptions = {}
): CollisionDamper {
  const radius = options.radius ?? 0.2;
  const pullIn = options.pullInHalflife ?? 0.04;
  const pushOut = options.pushOutHalflife ?? 0.35;
  let dampedDistance = Number.NaN;

  return {
    get distance() {
      return dampedDistance;
    },
    reset() {
      dampedDistance = Number.NaN;
    },
    resolve(lookAt, desired, dt) {
      const segment = sub(desired, lookAt);
      const desiredDistance = Math.hypot(segment[0], segment[1], segment[2]);
      if (desiredDistance <= 1e-6) return desired;

      const cast = probe.sphereCast(lookAt, desired, radius);
      // Small backoff so the eye never kisses the hit surface.
      const allowed = cast.hit ? Math.max(cast.distance - radius * 0.5, radius) : desiredDistance;
      const clampedAllowed = Math.min(allowed, desiredDistance);

      if (Number.isNaN(dampedDistance)) {
        dampedDistance = clampedAllowed; // first frame snaps
      } else if (clampedAllowed < dampedDistance) {
        dampedDistance = springDamp(dampedDistance, clampedAllowed, pullIn, dt);
      } else {
        dampedDistance = springDamp(dampedDistance, clampedAllowed, pushOut, dt);
      }
      // Never let the spring overshoot past the geometry.
      if (clampedAllowed < dampedDistance - 1e-9) dampedDistance = clampedAllowed;
      const dir = mul(segment, 1 / desiredDistance);
      return add(lookAt, mul(dir, Math.min(dampedDistance, desiredDistance)));
    }
  };
}
