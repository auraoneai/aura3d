/**
 * `rigs.orbit` (PRD-08 §6.4, §7.1 R-6): yaw/pitch springs around a fixed or
 * node-bound target, clamped pitch, optional C-10 collision. `bindOrbitPointer`
 * (also exposed as `rig.bindPointer`) maps pointer drag to target yaw/pitch at
 * 0.25°/px by default. At the pitch limits the up vector keeps the previous
 * frame's camera up so `lookAtMat4` never degenerates (§6.4).
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraProbe, AuraCameraRig } from "../../../contracts/camera.js";
import {
  acquirePointerCapture,
  acquireTouchAction,
  releasePointerCaptureLease,
  releaseTouchAction,
  type PointerCaptureTargetLike,
  type TouchActionTargetLike
} from "@aura3d/input";
import { springDamp } from "../Spring.js";
import { createCollisionDamper, type CollisionDamper } from "../collision.js";
import { distanceForFractionInContext } from "../framing.js";
import { add, mul, probeForSubject, sub, subjectHeight, type CameraSubjectRef } from "./rigUtils.js";

const DEG = Math.PI / 180;

export interface OrbitRigOptions {
  readonly target?: AuraVec3 | CameraSubjectRef;
  readonly distance?: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly pitchLimits?: readonly [number, number];
  readonly halflife?: number;
  readonly collision?: boolean | { readonly radius?: number };
  readonly fov?: number;
  /** When set (and `target` is a subject), distance is solved so the subject fills this fraction of frame height (#76). */
  readonly framing?: { readonly subjectHeightFraction: number };
}

export interface AuraOrbitRig extends AuraCameraRig {
  /** Set the damped angles' targets (degrees). */
  setAngles(yawDeg: number, pitchDeg: number): void;
  /** Drag deltas in pixels → degrees (used by bindOrbitPointer). */
  dragBy(dxPx: number, dyPx: number, sensitivityDegPerPx?: number): void;
}

export function createOrbitRig(o: OrbitRigOptions = {}): AuraOrbitRig {
  const distance = o.distance ?? 6;
  const [pitchMin, pitchMax] = o.pitchLimits ?? [-85, 85];
  const halflife = o.halflife ?? 0.08;
  const fov = o.fov ?? 50;

  let yawT = o.yaw ?? 0;
  let pitchT = o.pitch ?? 15;
  let yaw = yawT;
  let pitch = pitchT;
  let damper: CollisionDamper | undefined;
  let damperProbe: AuraCameraProbe | undefined;
  let prevUp: AuraVec3 = [0, 1, 0];

  return {
    id: "orbit",
    continuous: true,
    setAngles(y, p) {
      yawT = y;
      pitchT = Math.min(pitchMax, Math.max(pitchMin, p));
    },
    dragBy(dxPx, dyPx, sensitivity = 0.25) {
      yawT -= dxPx * sensitivity;
      pitchT = Math.min(pitchMax, Math.max(pitchMin, pitchT + dyPx * sensitivity));
    },
    reset(pose) {
      damper?.reset();
      if (pose) {
        const d = sub(pose.position, pose.target);
        const r = Math.hypot(d[0], d[1], d[2]);
        if (r > 1e-6) {
          yaw = yawT = Math.atan2(d[0], d[2]) / DEG;
          pitch = pitchT = Math.asin(d[1] / r) / DEG;
        }
      }
    },
    update(ctx) {
      const ref = typeof o.target === "string" || (o.target !== undefined && !Array.isArray(o.target))
        ? o.target as CameraSubjectRef
        : undefined;
      const subject = ref !== undefined ? ctx.subject(ref) : undefined;
      const target: AuraVec3 | undefined =
        ref !== undefined
          ? subject?.position
          : ((o.target as AuraVec3 | undefined) ?? [0, 0, 0]);
      if (!target) return ctx.previous;
      // Framing solver wins over the fixed distance when set (#76).
      const dist =
        o.framing !== undefined && subject !== undefined
          ? distanceForFractionInContext(subjectHeight(subject), fov, o.framing.subjectHeightFraction, { aspect: ctx.aspect })
          : distance;

      yaw = springDamp(yaw, yawT, halflife, ctx.dt);
      pitch = springDamp(pitch, pitchT, halflife, ctx.dt);
      const yr = yaw * DEG;
      const pr = pitch * DEG;
      const dir: AuraVec3 = [
        Math.sin(yr) * Math.cos(pr),
        Math.sin(pr),
        Math.cos(yr) * Math.cos(pr)
      ];
      const desiredEye = add(target, mul(dir, dist));
      let eye = desiredEye;
      if (o.collision) {
        const probe = ref === undefined ? ctx.probe : probeForSubject(ctx.probe, ref);
        if (!damper || damperProbe !== probe) {
          damperProbe = probe;
          damper = createCollisionDamper(probe, typeof o.collision === "object" ? o.collision : {});
        }
        eye = damper.resolve(target, desiredEye, ctx.dt);
      }
      // Degeneracy: near ±90° pitch, keep the previous frame's up (§6.4).
      const up: AuraVec3 = Math.abs(pitch) > 89.5 ? prevUp : [0, 1, 0];
      prevUp = up;
      return {
        position: eye,
        target,
        up,
        roll: 0,
        fov,
        near: Math.max(0.05, 0.02 * dist),
        far: ctx.previous.far
      };
    }
  };
}

/**
 * Attach pointer-drag orbit control (R-6): pointerdown/move/up on the element,
 * 0.25° per pixel by default. Returns a disposer.
 */
export function bindOrbitPointer(
  element: {
    addEventListener(type: string, fn: (e: unknown) => void): unknown;
    removeEventListener(type: string, fn: (e: unknown) => void): unknown;
  } & PointerCaptureTargetLike & TouchActionTargetLike,
  rig: AuraOrbitRig,
  options: { readonly sensitivity?: number } = {}
): () => void {
  type Event = { clientX?: number; clientY?: number; pointerId?: number; button?: number };
  const sensitivity = options.sensitivity ?? 0.25;
  if (!Number.isFinite(sensitivity)) throw new Error("Orbit pointer sensitivity must be finite.");
  let active: { pointerId: number | undefined; x: number; y: number } | undefined;
  let disposed = false;
  let touchActionOwned = false;
  const owner = {};
  const down = (e: unknown) => {
    const ev = e as Event;
    if (disposed || active || (ev.button !== undefined && ev.button !== 0) ||
        !Number.isFinite(ev.clientX) || !Number.isFinite(ev.clientY) ||
        (ev.pointerId !== undefined && !Number.isInteger(ev.pointerId))) return;
    const contact = { pointerId: ev.pointerId, x: ev.clientX!, y: ev.clientY! };
    active = contact;
    if (contact.pointerId !== undefined) {
      try { acquirePointerCapture(element, contact.pointerId, owner); }
      catch { /* Synthetic or already inactive pointers may not be captured. */ }
    }
  };
  const move = (e: unknown) => {
    const ev = e as Event;
    const contact = active;
    if (disposed || !contact || ev.pointerId !== contact.pointerId ||
        !Number.isFinite(ev.clientX) || !Number.isFinite(ev.clientY)) return;
    const dx = ev.clientX! - contact.x, dy = ev.clientY! - contact.y;
    if (!Number.isFinite(dx * sensitivity) || !Number.isFinite(dy * sensitivity)) return;
    contact.x = ev.clientX!;
    contact.y = ev.clientY!;
    rig.dragBy(dx, dy, sensitivity);
  };
  const end = (e: unknown, release: boolean) => {
    const ev = e as Event;
    const contact = active;
    if (!contact || ev.pointerId !== contact.pointerId) return;
    active = undefined;
    if (contact.pointerId !== undefined) releasePointerCaptureLease(element, contact.pointerId, owner, release);
  };
  const up = (e: unknown) => end(e, true);
  const lost = (e: unknown) => end(e, false);
  const listeners: Array<[string, (event: unknown) => void]> = [
    ["pointerdown", down], ["pointermove", move], ["pointerup", up],
    ["pointercancel", up], ["lostpointercapture", lost]
  ];
  const installed: Array<[string, (event: unknown) => void]> = [];
  const dispose = () => {
    disposed = true;
    const failures: unknown[] = [];
    const contact = active;
    active = undefined;
    if (contact?.pointerId !== undefined) {
      try { releasePointerCaptureLease(element, contact.pointerId, owner, true); }
      catch (error) { failures.push(error); }
    }
    for (let index = installed.length - 1; index >= 0; index--) {
      const [type, listener] = installed[index]!;
      try {
        element.removeEventListener(type, listener);
        installed.splice(index, 1);
      } catch (error) { failures.push(error); }
    }
    if (touchActionOwned) {
      try { releaseTouchAction(element, owner); touchActionOwned = false; }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Could not dispose orbit pointer controls");
  };
  try {
    touchActionOwned = acquireTouchAction(element, owner);
    for (const entry of listeners) {
      installed.push(entry);
      element.addEventListener(...entry);
    }
  } catch (error) {
    try { dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Could not bind orbit pointer controls"); }
    throw error;
  }
  return dispose;
}

import { registerRigFactory } from "./registry.js";

registerRigFactory("orbit", (o: unknown) => createOrbitRig(o as Parameters<typeof createOrbitRig>[0]));
