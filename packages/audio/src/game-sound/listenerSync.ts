/**
 * game-sound/listenerSync.ts — §6.8/1728 listener pose sync.
 *
 * `AudioListener.positionX…upZ` AudioParams ramped with `setTargetAtTime`
 * where they exist; Firefox never implemented them, so
 * `"positionX" in listener` feature-detects and falls back to
 * `setPosition`/`setOrientation`.
 */

import { vec3, type Vec3 } from "./types";

export interface ListenerLike {
  positionX?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  positionY?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  positionZ?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  forwardX?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  forwardY?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  forwardZ?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  upX?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  upY?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  upZ?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  setPosition?(x: number, y: number, z: number): void;
  setOrientation?(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
}

const TAU = 0.02;

export function syncListener(
  listener: ListenerLike,
  now: number,
  pose: { position: Vec3; forward: Vec3; up: Vec3 }
): "audioparam" | "legacy" | "none" {
  const p = vec3(pose.position);
  const f = vec3(pose.forward);
  const u = vec3(pose.up);

  if ("positionX" in listener && listener.positionX !== undefined) {
    const ramp = (param: { setTargetAtTime?(v: number, t: number, tau: number): void } | undefined, v: number) =>
      param?.setTargetAtTime
        ? param.setTargetAtTime(v, now, TAU)
        : param !== undefined && ((param as { value: number }).value = v);
    ramp(listener.positionX, p.x);
    ramp(listener.positionY, p.y);
    ramp(listener.positionZ, p.z);
    ramp(listener.forwardX, f.x);
    ramp(listener.forwardY, f.y);
    ramp(listener.forwardZ, f.z);
    ramp(listener.upX, u.x);
    ramp(listener.upY, u.y);
    ramp(listener.upZ, u.z);
    return "audioparam";
  }
  if (listener.setPosition && listener.setOrientation) {
    listener.setPosition(p.x, p.y, p.z);
    listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    return "legacy";
  }
  return "none";
}
