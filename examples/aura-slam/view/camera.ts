import { camera } from "@aura3d/engine";
import type { Vec3 } from "../contract/units";

export const CAMERA_EYE: Vec3 = [0, 25.5, 37.1];
export const CAMERA_TARGET: Vec3 = [0, 0, 0.7];
export const CAMERA_FOV_DEG = 15;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 180;

/**
 * Horizontal half-width the court camera must keep, as tan(half horizontal FOV): 0.19 keeps both doubles sidelines and an
 * athlete stretched wide of them (x = +-7 m at the near baseline, about 38.7 m from the eye) inside the frame.
 */
export const CAMERA_MIN_TAN_HALF_HFOV = 0.19;
/** Widest vertical FOV the aspect compensation may use (tall, narrow canvases). */
export const CAMERA_MAX_FOV_DEG = 60;

/** A broadcast camera: eye, aim, base vertical FOV and the horizontal coverage the aspect compensation keeps. */
export interface BroadcastCameraRig {
  readonly id: "classic" | "v2";
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly fovDeg: number;
  readonly minTanHalfHFov: number;
}

/** The 4.6.1 camera (`?cam=classic`, and always with `?look=original`). */
export const CAMERA_CLASSIC: BroadcastCameraRig = { id: "classic", eye: CAMERA_EYE, target: CAMERA_TARGET, fovDeg: CAMERA_FOV_DEG, minTanHalfHFov: CAMERA_MIN_TAN_HALF_HFOV };

/**
 * GU47 TT-C1 broadcast camera v2: lower and closer (eye [0, 15.5, 33.5], aim [0, 0, -1.5], 26 degrees), so the far athlete
 * reads larger against the stands and the grandstand fills the top of the frame. An athlete 1.1 court lengths deep (z 8.8)
 * sits 28.9 m deep in view; keeping one stretched 7.3 m wide (sim x 1.2 plus racket reach) in frame needs
 * tan(half hfov) >= 0.253: 0.255 keeps a margin and stays under the 60-degree cap on a 390 x 844 phone.
 */
export const CAMERA_V2: BroadcastCameraRig = { id: "v2", eye: [0, 15.5, 33.5], target: [0, 0, -1.5], fovDeg: 26, minTanHalfHFov: 0.255 };

/** TT-C1: the damped pan follows play sideways by at most this many metres (eye and aim move together). */
export const CAMERA_PAN_LIMIT = 0.6;
/** Pan smoothing half-life (seconds). */
export const CAMERA_PAN_HALF_LIFE = 0.45;
/** The deepest near-athlete point the frame must hold (z, metres) and the half-width it may need (sim x 1.2 + reach). */
const NEAR_ATHLETE_Z = 8.8;
const NEAR_ATHLETE_HALF_WIDTH = 7.3;

/** `?cam=classic` or `?look=original` keep the 4.6.1 camera; the World Tour look uses v2. */
export function cameraRigFor(search?: string): BroadcastCameraRig {
  const raw = search ?? (typeof location !== "undefined" ? location.search : "");
  const params = new URLSearchParams(raw);
  return params.get("cam") === "classic" || params.get("look") === "original" ? CAMERA_CLASSIC : CAMERA_V2;
}

/**
 * Aspect-aware vertical FOV (C2). Wide canvases keep the rig's base FOV, so desktop frames do not change (classic: it applies
 * at aspect >= 1.44, which includes 16:10 and 16:9). Narrower canvases widen the vertical FOV until the horizontal coverage
 * reaches the rig's `minTanHalfHFov`, so both athletes stay in frame on a portrait phone.
 */
export function cameraFovForAspect(aspect: number, rig: BroadcastCameraRig = CAMERA_CLASSIC): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const base = Math.tan((rig.fovDeg * Math.PI) / 360);
  const need = rig.minTanHalfHFov / a;
  if (need <= base) return rig.fovDeg;
  return Math.min(CAMERA_MAX_FOV_DEG, (Math.atan(need) * 360) / Math.PI);
}

export function cameraNode(rig: BroadcastCameraRig = CAMERA_CLASSIC) {
  return camera.perspective({ fov: rig.fovDeg, near: CAMERA_NEAR, far: CAMERA_FAR, position: [...rig.eye], target: [...rig.target] });
}

/**
 * TT-C1: how far the pan may go on this canvas: the slack between the frame's half-width at the deepest near-athlete point
 * and what a wide athlete needs, capped at CAMERA_PAN_LIMIT. Desktop aspects get the full +-0.6 m; portrait canvases,
 * whose width is already sized to the athletes, get none (both athletes stay in frame). Classic: no pan.
 */
export function panLimitFor(aspect: number, rig: BroadcastCameraRig = CAMERA_V2): number {
  if (rig.id !== "v2") return 0;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const f = [rig.target[0] - rig.eye[0], rig.target[1] - rig.eye[1], rig.target[2] - rig.eye[2]];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!) || 1;
  const depth = (-rig.eye[1] * f[1]! + (NEAR_ATHLETE_Z - rig.eye[2]) * f[2]!) / fl;
  const halfWidth = depth * Math.tan((cameraFovForAspect(a, rig) * Math.PI) / 360) * a;
  return Math.max(0, Math.min(CAMERA_PAN_LIMIT, halfWidth - NEAR_ATHLETE_HALF_WIDTH));
}

/** TT-C1: where the pan wants to sit for this frame: toward the ball, a third of the way, clamped to +-limit. */
export function panGoal(ballX: number, limit: number = CAMERA_PAN_LIMIT): number {
  const goal = Number.isFinite(ballX) ? ballX / 3 : 0;
  return Math.max(-limit, Math.min(limit, goal));
}

/** Frame-rate independent exponential damping of the pan toward `goal` (dt in seconds; reduced motion: no pan). */
export function dampPan(current: number, goal: number, dt: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  const k = 1 - Math.pow(0.5, step / CAMERA_PAN_HALF_LIFE);
  return current + (goal - current) * k;
}

/**
 * TT-V2 ace punch: on an ace the broadcast lens zooms in by ACE_PUNCH_DEG (fast attack, short hold, eased release) and
 * returns to the exact rig FOV after ACE_PUNCH_SECONDS. Presentation only; never under reduced motion (the caller skips it).
 */
export const ACE_PUNCH_DEG = 2.4;
const ACE_PUNCH_ATTACK = 0.12;
const ACE_PUNCH_HOLD = 0.22;
const ACE_PUNCH_RELEASE = 0.6;
export const ACE_PUNCH_SECONDS = ACE_PUNCH_ATTACK + ACE_PUNCH_HOLD + ACE_PUNCH_RELEASE;

/** Degrees to subtract from the FOV `t` seconds after the ace (0 before, after, or for a non-finite t). */
export function acePunchOffset(t: number): number {
  if (!Number.isFinite(t) || t < 0 || t >= ACE_PUNCH_SECONDS) return 0;
  if (t < ACE_PUNCH_ATTACK) { const k = t / ACE_PUNCH_ATTACK; return ACE_PUNCH_DEG * (1 - (1 - k) * (1 - k)); }
  if (t < ACE_PUNCH_ATTACK + ACE_PUNCH_HOLD) return ACE_PUNCH_DEG;
  const k = (t - ACE_PUNCH_ATTACK - ACE_PUNCH_HOLD) / ACE_PUNCH_RELEASE;
  return ACE_PUNCH_DEG * (1 - k * k * (3 - 2 * k));
}

/**
 * TT-V2: the punch clock after this frame. A new ace (`aces` above `acesSeen`) restarts it when `enabled` (World Tour);
 * a running punch advances by dt; reduced motion stops it (Infinity = no punch, so the FOV is exactly the rig's).
 */
export function nextPunchT(punchT: number, aces: number, acesSeen: number, dt: number | undefined, enabled: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return Number.POSITIVE_INFINITY;
  if (aces > acesSeen && enabled) return 0;
  if (punchT < ACE_PUNCH_SECONDS) return punchT + (Number.isFinite(dt) && dt! > 0 ? Math.min(dt!, 0.25) : 1 / 60);
  return punchT;
}

/**
 * TT-P2 long-lens depth of field (the engine runs the DOF stage at High and Ultra only). A 120 mm lens at f/4 focused
 * 34 m out holds about 26.5-47.4 m sharp (hyperfocal f^2 / (N c), c = 0.03 mm): both athletes (about 27-45 m from the v2
 * eye) stay sharp while the far stands (50 m and beyond) soften. Cut-aways (TT-C2 intro and changeover) open to f/2 and
 * focus on their shot's target.
 */
export const BROADCAST_DOF = { focusDistance: 34, fStop: 4, focalLength: 120 } as const;
export const CUT_DOF_FSTOP = 2;

/** Sharp range of a thin lens (metres) for a focus distance, f-number and focal length (mm), circle of confusion 0.03 mm. */
export function dofSharpRange(focusDistance: number, fStop: number, focalLengthMm: number): { near: number; far: number } {
  const h = (focalLengthMm * focalLengthMm) / (fStop * 0.03) / 1000;
  return { near: (h * focusDistance) / (h + focusDistance), far: focusDistance >= h ? Number.POSITIVE_INFINITY : (h * focusDistance) / (h - focusDistance) };
}

/** A live camera pose (the rig moved by the pan). */
export interface CameraPose { readonly eye: Vec3; readonly target: Vec3 }

/** The rig's pose with the eye and aim moved sideways by `pan` metres. */
export function panPose(rig: BroadcastCameraRig, pan: number): CameraPose {
  return { eye: [rig.eye[0] + pan, rig.eye[1], rig.eye[2]], target: [rig.target[0] + pan, rig.target[1], rig.target[2]] };
}

export interface ProjectedPoint { x: number; y: number; visible: boolean; ndc: Vec3 }

/**
 * Pinhole projection of a scene-space point to canvas pixels (HUD anchors, QA crops), with the aspect-aware FOV. `pose`
 * defaults to the classic camera; the World Tour renderer passes its live v2 pose (TT-C1: within 4 px of the frame).
 */
export function projectWorldPoint(viewportWidth: number, viewportHeight: number, wx: number, wy: number, wz: number, fovDeg?: number, pose: CameraPose = CAMERA_CLASSIC): ProjectedPoint {
  const eye = pose.eye;
  const target = pose.target;
  const fxRaw = target[0] - eye[0];
  const fyRaw = target[1] - eye[1];
  const fzRaw = target[2] - eye[2];
  const fLen = Math.hypot(fxRaw, fyRaw, fzRaw) || 1;
  const fx = fxRaw / fLen;
  const fy = fyRaw / fLen;
  const fz = fzRaw / fLen;
  const rLen = Math.hypot(fz, fx) || 1;
  const rx = -fz / rLen;
  const ry = 0;
  const rz = fx / rLen;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const dx = wx - eye[0];
  const dy = wy - eye[1];
  const dz = wz - eye[2];
  const cx = dx * rx + dy * ry + dz * rz;
  const cy = dx * ux + dy * uy + dz * uz;
  const cz = -(dx * fx + dy * fy + dz * fz);
  if (cz >= -0.1) return { x: viewportWidth * 0.5, y: viewportHeight * 0.5, visible: false, ndc: [0, 0, 2] };
  const aspect = Math.max(0.2, viewportWidth / Math.max(1, viewportHeight));
  const tanHalfFov = Math.tan(((fovDeg ?? cameraFovForAspect(viewportWidth / Math.max(1, viewportHeight))) * Math.PI) / 360);
  const ndcX = cx / (-cz * tanHalfFov * aspect);
  const ndcY = cy / (-cz * tanHalfFov);
  const screenX = (ndcX + 1) * 0.5 * viewportWidth;
  const screenY = (1 - ndcY) * 0.5 * viewportHeight;
  const visible = Math.abs(ndcX) <= 1.05 && Math.abs(ndcY) <= 1.05 && cz < -0.1;
  return { x: screenX, y: screenY, visible, ndc: [ndcX, ndcY, 0.5] };
}
