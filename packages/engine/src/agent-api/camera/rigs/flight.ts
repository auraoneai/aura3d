/**
 * `rigs.flight` (PRD-08 §6.4, §7.1 R-2): full-orientation follow. The arm sits
 * in the subject's local frame (pitch included when `followPitch`), `up` blends
 * between subject-up and world-up by `horizonLock`, and presented roll is
 * subject roll × `bankGain` (default 0.6), clamped (default 25°) and springed.
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig, AuraCameraSubject } from "../../../contracts/camera.js";
import { springDamp, springDampVec3 } from "../Spring.js";
import { quatRotateVec3, type AuraQuat } from "../quat.js";
import { createCollisionDamper, type CollisionDamper } from "../collision.js";
import {
  add,
  headingYaw,
  length3,
  mix3,
  mul,
  nearForDistance,
  normalize,
  resolvePerSpeed,
  yawDir
} from "./rigUtils.js";

const DEG = Math.PI / 180;

export interface FlightRigOptions {
  readonly target: string;
  readonly distance?: number | { readonly base: number; readonly perSpeed?: number; readonly max?: number };
  readonly height?: number;
  readonly lookHeight?: number;
  readonly armHalflife?: number;
  readonly lookHalflife?: number;
  readonly bank?: { readonly gain?: number; readonly maxDeg?: number; readonly halflife?: number };
  /** 0 = camera follows subject up fully; 1 = horizon stays level. */
  readonly horizonLock?: number;
  /** 0 = yaw-only arm; 1 = full pitch follow (default 1). */
  readonly followPitch?: number;
  readonly fov?: number | { readonly base: number; readonly perSpeed?: number; readonly max?: number; readonly halflife?: number };
  readonly collision?: boolean | { readonly radius?: number; readonly pullInHalflife?: number; readonly pushOutHalflife?: number };
}

/** CCR-08-2: `rotation` is additive until the CCR merges into C-22. */
const subjectRotation = (s: AuraCameraSubject): AuraQuat | undefined =>
  (s as { readonly rotation?: AuraQuat }).rotation;

/** Bank angle (radians about `forward`) of a subject orientation. */
function subjectRoll(subject: AuraCameraSubject): number {
  const q = subjectRotation(subject);
  if (!q) return 0;
  const f = normalize(subject.forward);
  const up = quatRotateVec3(q, [0, 1, 0]);
  // Camera basis ⊥ forward: right = up_world × f, flat = f × right.
  const r = crossNorm([0, 1, 0], f);
  const flat = crossNorm(f, r);
  return Math.atan2(dot(up, r), dot(up, flat));
}
const dot = (a: AuraVec3, b: AuraVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossNorm = (a: AuraVec3, b: AuraVec3): AuraVec3 =>
  normalize([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);

export function createFlightRig(o: FlightRigOptions): AuraCameraRig {
  const armHalflife = o.armHalflife ?? 0.08;
  const lookHalflife = o.lookHalflife ?? 0.03;
  const height = o.height ?? 0.6;
  const lookHeight = o.lookHeight ?? 0;
  const horizonLock = Math.min(1, Math.max(0, o.horizonLock ?? 0.4));
  const followPitch = Math.min(1, Math.max(0, o.followPitch ?? 1));
  const bank = { gain: o.bank?.gain ?? 0.6, maxDeg: o.bank?.maxDeg ?? 25, halflife: o.bank?.halflife ?? 0.2 };
  const fovHalflife = typeof o.fov === "object" ? (o.fov.halflife ?? 0.15) : 0.15;

  let eye: AuraVec3 | undefined;
  let look: AuraVec3 | undefined;
  let bankRad = 0;
  let dist = Number.NaN;
  let fovVal = Number.NaN;
  let damper: CollisionDamper | undefined;

  return {
    id: "flight",
    reset(pose) {
      eye = look = undefined;
      bankRad = 0;
      dist = fovVal = Number.NaN;
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
      const speed = length3(subject.velocity);
      const q = subjectRotation(subject);
      const yaw = headingYaw(subject.forward);

      const fovTarget = resolvePerSpeed(o.fov, 60, speed);
      fovVal = Number.isNaN(fovVal) ? fovTarget : springDamp(fovVal, fovTarget, fovHalflife, ctx.dt);
      const distTarget = resolvePerSpeed(o.distance, 6, speed);
      dist = Number.isNaN(dist) ? distTarget : springDamp(dist, distTarget, armHalflife, ctx.dt);

      // Arm: yaw-only vector blended toward the full pitched arm by followPitch.
      const yawArm = add(mul(yawDir(yaw), -dist), [0, height, 0]);
      const localArm = q ? quatRotateVec3(q, [0, height, -dist]) : yawArm;
      const arm = mix3(yawArm, localArm, followPitch);
      const desiredEye = add(subject.position, arm);
      eye = eye === undefined ? desiredEye : springDampVec3(eye, desiredEye, armHalflife, ctx.dt);

      const aimPoint = add(
        add(subject.position, mul(subject.forward, 6)),
        [0, lookHeight, 0]
      );
      look = look === undefined ? aimPoint : springDampVec3(look, aimPoint, lookHalflife, ctx.dt);

      // up: subject-up ←→ world-up by horizonLock.
      const subjectUp = q ? quatRotateVec3(q, [0, 1, 0]) : ([0, 1, 0] as AuraVec3);
      const up = normalize(mix3(subjectUp, [0, 1, 0], horizonLock));

      // Bank: subject roll × gain, clamped, springed.
      const rollTarget = clamp(subjectRoll(subject) * bank.gain, bank.maxDeg * DEG);
      bankRad = springDamp(bankRad, rollTarget, bank.halflife, ctx.dt);

      let finalEye = eye;
      if (o.collision) {
        damper ??= createCollisionDamper(
          ctx.probe,
          typeof o.collision === "object" ? o.collision : {}
        );
        finalEye = damper.resolve(look, eye, ctx.dt);
      }
      return {
        position: finalEye,
        target: look,
        up,
        roll: bankRad,
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

import { registerRigFactory } from "./registry.js";

registerRigFactory("flight", (o: unknown) => createFlightRig(o as Parameters<typeof createFlightRig>[0]));
