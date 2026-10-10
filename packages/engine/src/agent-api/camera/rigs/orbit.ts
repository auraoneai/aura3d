/**
 * `rigs.orbit` (PRD-08 §6.4, §7.1 R-6): yaw/pitch springs around a fixed or
 * node-bound target, clamped pitch, optional C-10 collision. `bindOrbitPointer`
 * (also exposed as `rig.bindPointer`) maps pointer drag to target yaw/pitch at
 * 0.25°/px by default. At the pitch limits the up vector keeps the previous
 * frame's camera up so `lookAtMat4` never degenerates (§6.4).
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig } from "../../../contracts/camera.js";
import { springDamp } from "../Spring.js";
import { createCollisionDamper, type CollisionDamper } from "../collision.js";
import { distanceForFractionInContext } from "../framing.js";
import { add, mul, sub, subjectHeight } from "./rigUtils.js";

const DEG = Math.PI / 180;

export interface OrbitRigOptions {
  readonly target?: AuraVec3 | string;
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
      const subject = typeof o.target === "string" ? ctx.subject(o.target) : undefined;
      const target: AuraVec3 | undefined =
        typeof o.target === "string"
          ? subject?.position
          : (o.target ?? [0, 0, 0]);
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
      const eye = o.collision
        ? (damper ??= createCollisionDamper(ctx.probe, typeof o.collision === "object" ? o.collision : {})).resolve(
            target,
            desiredEye,
            ctx.dt
          )
        : desiredEye;
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
    setPointerCapture?(id: number): unknown;
  },
  rig: AuraOrbitRig,
  options: { readonly sensitivity?: number } = {}
): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const down = (e: unknown) => {
    const ev = e as { clientX: number; clientY: number; pointerId?: number };
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (ev.pointerId !== undefined) element.setPointerCapture?.(ev.pointerId);
  };
  const move = (e: unknown) => {
    if (!dragging) return;
    const ev = e as { clientX: number; clientY: number };
    rig.dragBy(ev.clientX - lastX, ev.clientY - lastY, options.sensitivity ?? 0.25);
    lastX = ev.clientX;
    lastY = ev.clientY;
  };
  const up = () => {
    dragging = false;
  };
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  return () => {
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", up);
  };
}

import { registerRigFactory } from "./registry.js";

registerRigFactory("orbit", (o: unknown) => createOrbitRig(o as Parameters<typeof createOrbitRig>[0]));
