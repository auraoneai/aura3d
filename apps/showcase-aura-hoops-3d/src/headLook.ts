/**
 * H47-AN1 head look-at: off-ball athletes turn their head toward the ball.
 *
 * Visual only (PRD D8): reads the ball and athlete poses, writes one bone
 * through `node.animation.pose.setLocalRotation("Head", ...)`, which the engine
 * applies last (after the clip and the live/overlay pose), before skinning.
 * No RNG draw, no sim state.
 */

export type Vec3 = [number, number, number];
export type Quat = { x: number; y: number; z: number; w: number };

/** Largest head turn left/right from the parent bone (about 69 deg; the neck and chest carry the rest). */
export const HEAD_YAW_LIMIT = 1.2;
/** Largest head tilt up/down (about 29 deg). */
export const HEAD_PITCH_LIMIT = 0.5;
/** Turn rate toward the goal, rad/s (a quick glance; 360 deg/s). */
export const HEAD_TURN_RATE = 2 * Math.PI;
/** Reduced motion: a slow, calm turn (90 deg/s). */
export const HEAD_TURN_RATE_REDUCED = Math.PI / 2;

export interface HeadLookAngles { yaw: number; pitch: number }

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Rotate v by unit quaternion q. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx)
  ];
}

/**
 * World point -> actor-local frame, the inverse of the route's
 * `world = (a.x + cos*x + sin*z, 0.96 + a.y + y, a.z - sin*x + cos*z)`.
 */
export function worldToActor(p: Vec3, ax: number, ay: number, az: number, yaw: number): Vec3 {
  const dx = p[0] - ax;
  const dz = p[2] - az;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * dx - s * dz, p[1] - 0.96 - ay, s * dx + c * dz];
}

/**
 * Head yaw/pitch (in the head's parent frame, +z forward, +y up, +x left)
 * that aims the face at `target`. Both points are actor-local; `parent` is the
 * parent bone's actor-frame rotation. Positive pitch looks down (qX convention).
 */
export function headLookAngles(head: Vec3, target: Vec3, parent: Quat): HeadLookAngles {
  const d: Vec3 = [target[0] - head[0], target[1] - head[1], target[2] - head[2]];
  const local = qRotate({ x: -parent.x, y: -parent.y, z: -parent.z, w: parent.w }, d);
  const horiz = Math.hypot(local[0], local[2]);
  if (horiz < 1e-6 && Math.abs(local[1]) < 1e-6) return { yaw: 0, pitch: 0 };
  return {
    yaw: clamp(Math.atan2(local[0], local[2]), -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT),
    pitch: clamp(Math.atan2(-local[1], horiz), -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT)
  };
}

/** Move `current` toward `goal` at the turn rate (reduced motion turns slower). */
export function stepHeadLook(current: HeadLookAngles, goal: HeadLookAngles, dt: number, reducedMotion: boolean): HeadLookAngles {
  const max = (reducedMotion ? HEAD_TURN_RATE_REDUCED : HEAD_TURN_RATE) * Math.max(0, dt);
  const toward = (a: number, b: number): number => a + clamp(b - a, -max, max);
  return { yaw: toward(current.yaw, goal.yaw), pitch: toward(current.pitch, goal.pitch) };
}

/** Local head rotation as the engine's `[x, y, z, w]`: yaw about +y, then pitch about +x. */
export function headLookQuat(angles: HeadLookAngles): [number, number, number, number] {
  const cy = Math.cos(angles.yaw / 2), sy = Math.sin(angles.yaw / 2);
  const cp = Math.cos(angles.pitch / 2), sp = Math.sin(angles.pitch / 2);
  // qY(yaw) * qX(pitch)
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}
