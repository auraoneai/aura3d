/**
 * `rigs.chase` (PRD-08 §6.4, §7.1 R-1): arm-space chase camera. Yaw spring on
 * subject heading, distance/height springs, look-point spring, springed
 * velocity look-ahead, speed-aware distance/FOV, lateral-acceleration bank,
 * optional framing solver and C-10 collision.
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig, AuraCameraRigContext } from "../../../contracts/camera.js";
import { springDamp, springDampVec3 } from "../Spring.js";
import { distanceForFractionInContext } from "../framing.js";
import { createCollisionDamper, type CollisionDamper } from "../collision.js";
import {
  add,
  headingYaw,
  length3,
  mul,
  nearForDistance,
  normalize,
  resolvePerSpeed,
  springAngle,
  subjectHeight,
  yawDir
} from "./rigUtils.js";

export interface ChaseRigOptions {
  readonly target: string;
  readonly distance?:
    | number
    | { readonly base: number; readonly perSpeed?: number; readonly max?: number };
  readonly height?: number;
  readonly lookHeight?: number;
  readonly lookAhead?: { readonly seconds: number; readonly max: number; readonly halflife?: number };
  readonly armHalflife?: number;
  readonly lookHalflife?: number;
  readonly yawHalflife?: number;
  readonly fov?:
    | number
    | { readonly base: number; readonly perSpeed?: number; readonly max?: number; readonly halflife?: number };
  readonly bank?: { readonly gain: number; readonly maxDeg: number; readonly halflife?: number };
  readonly framing?: { readonly subjectHeightFraction: number };
  readonly collision?:
    | boolean
    | { readonly radius?: number; readonly pullInHalflife?: number; readonly pushOutHalflife?: number };
}

export function createChaseRig(o: ChaseRigOptions): AuraCameraRig {
  const armHalflife = o.armHalflife ?? 0.1;
  const lookHalflife = o.lookHalflife ?? 0.025;
  const yawHalflife = o.yawHalflife ?? 0.12;
  const height = o.height ?? 1.8;
  const lookHeight = o.lookHeight ?? 1.2;
  const lookAhead = o.lookAhead ?? { seconds: 0.35, max: 3, halflife: 0.25 };
  const bank = o.bank ?? { gain: 0.012, maxDeg: 8, halflife: 0.25 };
  const fovHalflife = typeof o.fov === "object" ? (o.fov.halflife ?? 0.15) : 0.15;
  let yaw = Number.NaN;
  let dist = Number.NaN;
  let eye: AuraVec3 | undefined;
  let look: AuraVec3 | undefined;
  let lead = 0;
  let fovVal = Number.NaN;
  let bankDeg = 0;
  let prevYaw = Number.NaN;
  let damper: CollisionDamper | undefined;
  const collisionEnabled = o.collision !== undefined && o.collision !== false;
  const collisionOpts = typeof o.collision === "object" ? o.collision : {};

  return {
    id: "chase",
    continuous: true,
    reset(pose) {
      yaw = dist = prevYaw = Number.NaN;
      fovVal = Number.NaN;
      bankDeg = 0;
      lead = 0;
      damper?.reset();
      if (pose) {
        eye = [...pose.position];
        look = [...pose.target];
        fovVal = pose.fov;
      }
    },
    update(ctx) {
      const subject = ctx.subject(o.target);
      if (!subject) return ctx.previous;
      // V-6: bicycle telemetry vLong feeds perSpeed when published, else |v|.
      const speed = subject.telemetry?.vLong ?? length3(subject.velocity);

      // Yaw of subject heading (springed through the shortest arc).
      const targetYaw =
        Math.abs(subject.forward[0]) + Math.abs(subject.forward[2]) > 1e-6
          ? headingYaw(subject.forward)
          : Number.isNaN(yaw)
            ? headingYaw([0, 0, 1])
            : yaw;
      yaw = Number.isNaN(yaw) ? targetYaw : springAngle(yaw, targetYaw, yawHalflife, ctx.dt);
      const yawRate = Number.isNaN(prevYaw) ? 0 : shortestAngleDelta(prevYaw, yaw) / Math.max(ctx.dt, 1e-6);
      prevYaw = yaw;

      // Distance: framing solver wins when provided, else the speed curve.
      const fovTarget = resolvePerSpeed(o.fov, 50, speed);
      fovVal = Number.isNaN(fovVal) ? fovTarget : springDamp(fovVal, fovTarget, fovHalflife, ctx.dt);
      const distanceTarget =
        o.framing !== undefined
          ? Math.max(
              resolvePerSpeed(o.distance, 4, speed),
              distanceForFractionInContext(subjectHeight(subject), fovVal, o.framing.subjectHeightFraction, { aspect: ctx.aspect })
            )
          : resolvePerSpeed(o.distance, 4, speed);
      dist = Number.isNaN(dist) ? distanceTarget : springDamp(dist, distanceTarget, armHalflife, ctx.dt);

      // Velocity look-ahead.
      const leadTarget = Math.min(length3(subject.velocity) * lookAhead.seconds, lookAhead.max);
      lead = springDamp(lead, leadTarget, lookAhead.halflife ?? 0.25, ctx.dt);
      const leadDir = speed > 1e-3 ? normalize(subject.velocity) : [0, 0, 0];

      const aimPoint = add(add(subject.position, mul(leadDir as AuraVec3, lead)), [0, lookHeight, 0]);
      look = look === undefined ? aimPoint : springDampVec3(look, aimPoint, lookHalflife, ctx.dt);

      // §6.3 arm-space damping: the arm parameters (yaw/dist/height) are
      // springed, so the eye tracks a moving subject without steady-state lag.
      const desiredEye = add(add(subject.position, mul(yawDir(yaw), -dist)), [0, height, 0]);
      eye = desiredEye;

      // Bank from lateral acceleration — V-6 prefers published lateralG over
      // the centripetal estimate yawRate·speed.
      if (bank.gain !== 0) {
        const latAccel = subject.telemetry?.lateralG ?? yawRate * speed;
        const targetBank = clamp(-latAccel * bank.gain, bank.maxDeg) * (Math.PI / 180);
        bankDeg = springDamp(bankDeg, targetBank, bank.halflife ?? 0.25, ctx.dt);
      }
      let finalEye = eye;
      if (collisionEnabled) {
        damper ??= createCollisionDamper(ctx.probe, collisionOpts);
        finalEye = damper.resolve(look, eye, ctx.dt);
      }
      return {
        position: finalEye,
        target: look,
        up: [0, 1, 0],
        roll: bankDeg,
        fov: fovVal,
        near: nearForDistance(dist),
        far: ctx.previous.far
      };
    }
  };

}

function clamp(x: number, max: number): number {
  return Math.max(-max, Math.min(max, x));
}
function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

import { registerRigFactory } from "./registry.js";

registerRigFactory("chase", (o: unknown) => createChaseRig(o as Parameters<typeof createChaseRig>[0]));
