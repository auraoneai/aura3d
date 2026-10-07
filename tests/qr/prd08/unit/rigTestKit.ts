/**
 * Shared rig-test harness for tests/qr/prd08 (PRD-08 §16): a scripted-subject
 * `AuraCameraRigContext` driver plus the NDC projection helper the R-* specs
 * assert against. Not a test file — imported by the `*.test.ts` suites.
 */
import { Matrix4, Vector3 } from "@aura3d/math";
import {
  lookAtMat4,
  multiplyMat4,
  perspectiveMat4,
  rollUpVector
} from "@aura3d/scene/math";
import type {
  AuraCameraPose,
  AuraCameraRig,
  AuraCameraSubject,
  AuraCameraProbe
} from "@aura3d/engine/contracts";

export type V3 = readonly [number, number, number];
export const ASPECT = 16 / 9;
export const NO_PROBE: AuraCameraProbe = {
  sphereCast: () => ({ hit: false, distance: Number.POSITIVE_INFINITY }),
  occluders: () => []
};

export const pose0 = (over: Partial<AuraCameraPose> = {}): AuraCameraPose => ({
  position: [0, 0, 0],
  target: [0, 0, 1],
  up: [0, 1, 0],
  roll: 0,
  fov: 50,
  near: 0.05,
  far: 500,
  ...over
});

export function subjectAt(position: V3, over: Partial<AuraCameraSubject> = {}): AuraCameraSubject {
  return {
    position,
    velocity: [0, 0, 0],
    forward: [0, 0, 1],
    bounds: {
      min: [position[0] - 0.4, position[1] - 0.9, position[2] - 0.4],
      max: [position[0] + 0.4, position[1] + 0.9, position[2] + 0.4]
    },
    ...over
  };
}

/** Drive a rig `frames` steps at `dt` seconds; `script(t)` → subject map. */
export function run(
  rig: AuraCameraRig,
  frames: number,
  dt: number,
  script: (t: number) => Record<string, AuraCameraSubject>,
  aspect = ASPECT,
  probe: AuraCameraProbe = NO_PROBE
): AuraCameraPose[] {
  let previous = pose0();
  const poses: AuraCameraPose[] = [];
  for (let i = 0; i < frames; i++) {
    const t = i * dt;
    const map = script(t);
    previous = rig.update({
      dt,
      time: t * 1000,
      aspect,
      previous,
      subject: (ref) => (typeof ref === "string" ? map[ref] : undefined),
      probe
    });
    poses.push(previous);
  }
  return poses;
}

/** Perspective NDC of a world point under a pose (roll applied to `up`). */
export function project(point: V3, pose: AuraCameraPose, aspect = ASPECT): { x: number; y: number; z: number } {
  const mut = (v: V3): [number, number, number] => [v[0], v[1], v[2]];
  const fwd: V3 = [
    pose.target[0] - pose.position[0],
    pose.target[1] - pose.position[1],
    pose.target[2] - pose.position[2]
  ];
  const len = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1;
  const up = rollUpVector([fwd[0] / len, fwd[1] / len, fwd[2] / len], mut(pose.up), pose.roll);
  const vp = new Matrix4(
    multiplyMat4(
      perspectiveMat4((pose.fov * Math.PI) / 180, aspect, pose.near, pose.far),
      lookAtMat4(mut(pose.position), mut(pose.target), up)
    )
  );
  const p = vp.transformPoint(new Vector3(point[0], point[1], point[2]));
  return { x: p.x, y: p.y, z: p.z };
}

export const dist3 = (a: V3, b: V3): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
export const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** Camera yaw of a pose about `anchor` (eye sits on -yawDir(camYaw)). */
export const cameraYawOf = (pose: AuraCameraPose, anchor: V3): number =>
  Math.atan2(anchor[0] - pose.position[0], anchor[2] - pose.position[2]);
