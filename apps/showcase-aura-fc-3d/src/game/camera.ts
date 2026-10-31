// Aura FC 3D — camera framing helpers (pure, unit-tested in tests/unit/aura-fc-3d/audit-fixes.test.ts).

type Vec3 = [number, number, number];

/** Widest vertical FOV the portrait fit may use before it pulls the eye back instead (degrees). */
export const PORTRAIT_MAX_FOV = 62;
/** The fit keeps the horizontal coverage the shot has at this aspect (about 20 m of pitch for the broadcast rig). */
export const DESIGN_MIN_ASPECT = 1.3;

/**
 * FC-09: the director authors every shot for a landscape frame. On a narrower screen (portrait phone) keep the
 * horizontal coverage the shot would have at DESIGN_MIN_ASPECT: widen the vertical FOV up to PORTRAIT_MAX_FOV, then
 * move the eye back along its view line for the rest. Landscape frames pass through unchanged.
 */
export function fitCameraToAspect(eye: Vec3, target: Vec3, fovDeg: number, aspect: number): { eye: Vec3; fov: number } {
  if (!(aspect > 0) || aspect >= DESIGN_MIN_ASPECT) return { eye, fov: fovDeg };
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  // tan of the vertical half-angle that gives the design horizontal coverage at this aspect
  const want = (tanHalf * DESIGN_MIN_ASPECT) / aspect;
  const capped = Math.tan((PORTRAIT_MAX_FOV * Math.PI) / 360);
  const useTan = Math.min(want, capped);
  const fov = (Math.atan(useTan) * 360) / Math.PI;
  const pull = want / useTan;   // >= 1: how much further back the eye goes
  const dx = eye[0] - target[0], dy = eye[1] - target[1], dz = eye[2] - target[2];
  return { eye: [target[0] + dx * pull, target[1] + dy * pull, target[2] + dz * pull], fov };
}

/** Width of ground (m) a camera covers across the frame at its target distance. */
export function horizontalCoverage(eye: Vec3, target: Vec3, fovDeg: number, aspect: number): number {
  const d = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
  return 2 * d * Math.tan((fovDeg * Math.PI) / 360) * aspect;
}

/* ---------------- FC47-C1 broadcast package (GU47 WP-19, lane g09): pure shot poses, unit-tested ---------------- */

/** Main gantry camera: eye 14 m above the turf, looking down 30 degrees at the play. */
export const BROADCAST_HEIGHT = 14;
export const BROADCAST_PITCH_DEG = 30;
/** Vertical FOV that keeps the old rig's ~28 m of landscape coverage from the higher, farther gantry. */
export const BROADCAST_FOV = 32;
/** Tunnel-to-gantry rail intro length (seconds) with letterbox bars. */
export const INTRO_RAIL_S = 4;

export interface ShotPose { eye: Vec3; target: Vec3; fov: number }

/** Gantry shot over the play: `followX` is the eased ball x, `ballZ` the ball's z (the eye eases toward near-side play). */
export function broadcastPose(followX: number, ballX: number, ballZ: number): ShotPose {
  const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const target: Vec3 = [ballX, 0.9, -1 + clampN(ballZ * 0.3, -4, 4)];
  const back = (BROADCAST_HEIGHT - target[1]) / Math.tan((BROADCAST_PITCH_DEG * Math.PI) / 180);
  return { eye: [followX, BROADCAST_HEIGHT, target[2] + back + clampN(ballZ * 0.25, -2.5, 2.5)], target, fov: BROADCAST_FOV };
}

/** PRD D11 original look path: the 4.6.2 broadcast rig (eye 9.5 m up, 20 m back, easing toward near-side play; FOV 38). */
export function originalBroadcastPose(followX: number, ballX: number, ballZ: number): ShotPose {
  const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { eye: [followX, 9.5, 20 + clampN(ballZ * 0.55, -5.5, 5.5)], target: [ballX, 0.9, -1 + clampN(ballZ * 0.3, -4, 4)], fov: 38 };
}

/**
 * Phase 3 hybrid rig: the 4.6.2 side-follow rig 1 m higher with a 34 degree lens aimed nearer the play, so the
 * players read larger (the 38 degree frame left a third of the screen as empty near touchline). The aim point sits
 * 2 m up so the view still looks down about 22 degrees and the stands and gantry stay in frame (round 1 aimed at
 * 0.7 m and cropped the bowl to one tier). Same easing toward near-side play.
 */
export function hybridBroadcastPose(followX: number, ballX: number, ballZ: number): ShotPose {
  const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { eye: [followX, 10.5, 20 + clampN(ballZ * 0.55, -5.5, 5.5)], target: [ballX, 2.0, -0.5 + clampN(ballZ * 0.32, -4, 4)], fov: 34 };
}

/** Rail control points (eye) from the players' tunnel mouth on the near touchline up to the gantry over the centre spot. */
export const INTRO_RAIL: readonly Vec3[] = [[-3, 1.7, 20.5], [-9, 4.5, 23], [-6, 10, 25], [0, BROADCAST_HEIGHT, -1 + (BROADCAST_HEIGHT - 0.9) / Math.tan((BROADCAST_PITCH_DEG * Math.PI) / 180)]];
const INTRO_LOOK: readonly Vec3[] = [[-1, 1.4, 14], [0, 1.2, 4], [0, 0.9, -1]];

function catmull(points: readonly Vec3[], u: number): Vec3 {
  const n = points.length - 1;
  const f = Math.min(n - 1e-9, Math.max(0, u) * n);
  const i = Math.floor(f), t = f - i;
  const p0 = points[Math.max(0, i - 1)]!, p1 = points[i]!, p2 = points[Math.min(n, i + 1)]!, p3 = points[Math.min(n, i + 2)]!;
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((k) => 0.5 * (2 * p1[k]! + (-p0[k]! + p2[k]!) * t + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * t2 + (-p0[k]! + 3 * p1[k]! - 3 * p2[k]! + p3[k]!) * t3)) as Vec3;
}
function lerp3(points: readonly Vec3[], u: number): Vec3 {
  const n = points.length - 1;
  const f = Math.min(n, Math.max(0, u) * n);
  const i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const a = points[i]!, b = points[i + 1]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Intro rail at `elapsed` seconds: smoothstep along a Catmull-Rom through INTRO_RAIL; ends on the centred gantry shot. */
export function introRailPose(elapsed: number): ShotPose {
  const x = Math.min(1, Math.max(0, elapsed / INTRO_RAIL_S));
  const u = x * x * (3 - 2 * x);
  return { eye: catmull(INTRO_RAIL, u), target: lerp3(INTRO_LOOK, u), fov: 44 + (BROADCAST_FOV - 44) * u };
}

/**
 * Goal replay shot: low behind the scoring corner flag side, framing the replayed ball and the goal mouth it entered.
 * `side` is the goal's x sign. Reduced motion holds the start framing (no tracking sweep).
 */
export function replayPose(side: number, ballX: number, ballZ: number, reducedMotion: boolean, goalX: number): ShotPose {
  const gx = side * goalX;
  const target: Vec3 = reducedMotion ? [gx - side * 6, 1.2, 0] : [ballX * 0.6 + gx * 0.4, 1.1, ballZ * 0.7];
  return { eye: [gx - side * 15, 3.4, 12.5], target, fov: 34 };
}

/** Full-time orbit: a slow rising orbit of the whole bowl. Reduced motion holds one wide frame. */
export function fullTimeOrbitPose(elapsed: number, reducedMotion: boolean): ShotPose {
  const a = reducedMotion ? 0.6 : 0.6 + elapsed * 0.09;
  const rise = reducedMotion ? 0 : Math.min(1, elapsed / 12);
  return { eye: [Math.sin(a) * 36, 14 + rise * 6, Math.cos(a) * 36], target: [0, 1, 0], fov: 46 };
}
