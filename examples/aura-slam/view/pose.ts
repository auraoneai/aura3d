/**
 * M-POSE: pure articulated pose (transcription of public/toptennis/player-pose.js).
 * It never changes gameplay position or input. Every constant, branch order and
 * expression is kept exactly as in the source so the output is bit-identical.
 */
import { racketSports } from "@aura3d/engine";
import type { ActorState, AthletePose, MatchState, PoseResult, Side } from "../contract";

type V3 = [number, number, number];

/** Presentation fields the pose solver reads that are not (yet) in the contract ActorState. */
export interface PoseActor extends Omit<ActorState, "side"> {
  side: Side;
  slideRemaining?: number;
  slidePoseStatic?: boolean;
  serveContactPoint?: readonly [number, number, number] | null;
}

export type PoseMatchState = Pick<MatchState, "phase" | "time" | "serveAttempt"> & Partial<Pick<MatchState, "server">>;

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const blend = (a: readonly number[], b: readonly number[], t: number): V3 =>
  [mix(a[0]!, b[0]!, t), mix(a[1]!, b[1]!, t), mix(a[2]!, b[2]!, t)];
const blend1 = (a: number, b: number, t: number): number => mix(a, b, t);
const smooth = (t: number): number => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

export function pose(player: PoseActor, state: PoseMatchState): PoseResult {
  const serve = state.serveAttempt?.server === player.side ? state.serveAttempt : null;
  const serveWindup = state.phase === "serveToss" && serve?.swingAt != null;
  const serveAge = serveWindup ? Math.max(0, state.time - (serve as { swingAt: number }).swingAt) : 0;
  const serveProgress = serveWindup
    ? clamp(serveAge / Math.max(0.001, (serve as { contactAt: number }).contactAt - (serve as { swingAt: number }).swingAt), 0, 1)
    : 0;
  // Stride cycle, split step, slide and planted-stroke stance come from the library's racket-sport athlete rig.
  const { move, face, dx, dz, wind, follow, settle, slide, hipY, legs } = racketSports.athleteRig.locomotion(player, {
    unitsX: 5.5,
    unitsY: 8
  });
  const phase = player.stride;
  const bodyBob = hipY - 0.91;
  let right: V3 = [0.15, 1.05 + bodyBob, -0.35];
  let left: V3 = [0.075, 1.16 + bodyBob, -0.37];
  const breath = Math.sin((state.time || 0) * 2.2) * 0.003 * (1 - move);
  right[1] += breath;
  left[1] += breath;
  let racketDirection: V3 = [-0.1, 0.82, -0.2];
  let torsoYaw = dx * 0.085 * move + Math.sin(phase) * 0.055 * move * Math.abs(dz);
  let strokeLean = 0;
  let mode: string = move > 0.55 ? "run" : move > 0.08 ? "shuffle" : "ready";
  const pumping = clamp((move - 0.28) / 0.72, 0, 1);
  right = blend(right, [0.28, 1.05 + Math.cos(phase) * 0.08, -0.23 - Math.sin(phase) * 0.13], pumping * 0.8);
  left = blend(left, [-0.32, 1.05 - Math.cos(phase) * 0.1, -0.08 + Math.sin(phase) * 0.28], pumping);
  const readyRight: V3 = [right[0], right[1], right[2]];
  const readyLeft: V3 = [left[0], left[1], left[2]];
  const readyRacket: V3 = [racketDirection[0], racketDirection[1], racketDirection[2]];
  const readyYaw = torsoYaw;
  // Reach from the original low stance with the unchanged arm and racket. The
  // model supplies a root-local point; undo the torso pivot so contact stays
  // on the strings when the shoulders turn, with no stretched limbs.
  const serveReach = (): { hand: V3; direction: V3 } => {
    if (!player.serveContactPoint) return { hand: [0.19, 1.96, -0.08], direction: [0.02, 1, -0.12] };
    let x = player.serveContactPoint[0];
    let y = player.serveContactPoint[1];
    let z = player.serveContactPoint[2];
    y -= hipY;
    const rx = -0.035 + clamp(player.vy * face * 0.055, -0.065, 0.075) + strokeLean;
    const rz = -clamp(player.vx * face * 0.09, -0.11, 0.11);
    [y, z] = [Math.cos(rx) * y + Math.sin(rx) * z, -Math.sin(rx) * y + Math.cos(rx) * z];
    [x, z] = [Math.cos(torsoYaw) * x - Math.sin(torsoYaw) * z, Math.sin(torsoYaw) * x + Math.cos(torsoYaw) * z];
    [x, y] = [Math.cos(rz) * x + Math.sin(rz) * y, -Math.sin(rz) * x + Math.cos(rz) * y];
    const shoulder: V3 = [0.225, 1.39 + bodyBob, 0];
    const delta = [x - shoulder[0], y + hipY - shoulder[1], z];
    const length = Math.hypot(delta[0]!, delta[1]!, delta[2]!);
    const direction: V3 = [delta[0]! / length, delta[1]! / length, delta[2]! / length];
    const armReach = Math.min(0.578, Math.max(0.12, length - 0.46));
    return {
      hand: [
        shoulder[0] + direction[0] * armReach,
        shoulder[1] + direction[1] * armReach,
        shoulder[2] + direction[2] * armReach
      ],
      direction
    };
  };
  if (serveWindup) {
    mode = "serve-windup";
    const drive = smooth(serveProgress);
    torsoYaw = mix(-0.23, 0.3, drive);
    strokeLean = mix(-0.025, 0, drive);
    const contact = serveReach();
    right = blend([0.35, 1.2, 0.24], contact.hand, drive);
    left = blend([-0.13, 1.88, -0.19], [-0.3, 1.3, -0.2], drive);
    racketDirection = blend([0.15, 0.7, 0.42], contact.direction, drive);
  } else if (state.phase === "serveToss" && state.server === player.side) {
    mode = "toss";
    right = [0.35, 1.2, 0.24];
    left = [-0.13, 1.88, -0.19];
    racketDirection = [0.15, 0.7, 0.42];
    torsoYaw = -0.23;
    strokeLean = -0.025;
  } else if (player.serveMotion > 0) {
    mode = "serve";
    const p = clamp(1 - player.serveMotion / 0.42, 0, 1);
    const drive = smooth(p / 0.72);
    const recover = smooth((p - 0.72) / 0.28);
    torsoYaw = mix(0.3 - 0.72 * drive, readyYaw, recover);
    strokeLean = 0.09 * Math.sin(p * Math.PI);
    const contact = serveReach();
    right = blend(blend(contact.hand, [-0.16, 1.06, -0.36], drive), readyRight, recover);
    left = blend(blend([-0.3, 1.3, -0.2], [-0.34, 1.05, 0.04], drive), readyLeft, recover);
    racketDirection = blend(blend(contact.direction, [-0.25, -0.48, -0.5], drive), readyRacket, recover);
  } else if (player.swing > 0) {
    mode = player.stroke;
    // Ready → loaded racket → contact → follow-through. Contact stays high
    // on overheads instead of dropping the arm before the ball is struck.
    const path = (ready: V3, loaded: V3, contact: V3, finish: V3): V3 =>
      follow > 0
        ? blend(contact, finish, follow)
        : wind < 0.5
          ? blend(ready, loaded, smooth(wind * 2))
          : blend(loaded, contact, smooth((wind - 0.5) * 2));
    const path1 = (ready: number, loaded: number, contact: number, finish: number): number =>
      follow > 0
        ? blend1(contact, finish, follow)
        : wind < 0.5
          ? blend1(ready, loaded, smooth(wind * 2))
          : blend1(loaded, contact, smooth((wind - 0.5) * 2));
    const height = clamp((player.strokeContactZ ?? 0.5) * 2.177 - 0.23, 0.78, 1.46);
    if (mode === "smash") {
      const overheadWrist = clamp((player.strokeContactZ ?? 1.08) * 2.177 - 0.43, 1.44, 1.96);
      right = path(right, [0.33, 1.65, 0.22], [0.24, overheadWrist, -0.08], [-0.18, 1.1, -0.34]);
      left = path(left, [-0.18, 1.88, -0.18], [-0.25, 1.48, -0.3], [-0.4, 1.08, -0.08]);
      racketDirection = path(racketDirection, [0.12, 0.55, 0.65], [0.02, 1, -0.13], [-0.4, -0.45, -0.5]);
      torsoYaw = path1(0, -0.6, -0.1, 0.5);
      strokeLean = path1(0, -0.09, 0.02, 0.12);
    } else if (mode.endsWith("-volley")) {
      const back = mode === "backhand-volley";
      const side = back ? -1 : 1;
      right = path(
        right,
        [back ? -0.12 : 0.38, height + 0.03, -0.14],
        [back ? -0.2 : 0.43, height, -0.32],
        [back ? -0.14 : 0.34, height - 0.06, -0.43]
      );
      left = path(left, [-0.25, 1.24, -0.18], [-0.4, 1.22, 0.02], [-0.36, 1.13, 0.06]);
      racketDirection = path(
        racketDirection,
        [side * 0.65, 0.75, 0.02],
        [side * 0.65, 0.7, -0.12],
        [side * 0.55, 0.65, -0.2]
      );
      torsoYaw = path1(0, -side * 0.25, -side * 0.1, side * 0.08);
      strokeLean = 0.045 * wind;
    } else if (mode === "backhand") {
      right = path(right, [-0.24, 1.13, 0.12], [-0.24, height, -0.29], [0.33, 1.38, -0.22]);
      racketDirection = path(racketDirection, [-0.78, 0.34, 0.38], [-0.8, 0.32, -0.32], [0.62, 0.63, -0.24]);
      left = [right[0] + -0.075, right[1] + 0.05, right[2] + 0.055];
      torsoYaw = path1(0, 0.62, 0.14, -0.5);
    } else {
      right = path(right, [0.56, 1.05, 0.16], [0.52, height, -0.3], [-0.12, 1.4, -0.29]);
      left = path(left, [-0.28, 1.23, -0.3], [-0.36, 1.15, 0.02], [-0.28, 1.07, 0.08]);
      racketDirection = path(racketDirection, [0.7, 0.4, 0.34], [0.75, 0.25, -0.45], [-0.55, 0.62, -0.22]);
      torsoYaw = path1(0, -0.55, -0.12, 0.48);
    }
    right = blend(right, readyRight, settle);
    left = blend(left, readyLeft, settle);
    racketDirection = blend(racketDirection, readyRacket, settle);
    torsoYaw = mix(torsoYaw, readyYaw, settle);
    strokeLean *= 1 - settle;
  }
  // Keep the wrists within human arm reach even on cross-body follow-throughs.
  const reach = (hand: readonly number[], side: number): V3 => {
    const shoulder: V3 = [side * 0.225, 1.39 + bodyBob, 0];
    const delta = [hand[0]! - shoulder[0], hand[1]! - shoulder[1], hand[2]! - shoulder[2]];
    const scale = Math.min(1, 0.578 / Math.max(0.001, Math.hypot(delta[0]!, delta[1]!, delta[2]!)));
    return [shoulder[0] + delta[0]! * scale, shoulder[1] + delta[1]! * scale, shoulder[2] + delta[2]! * scale];
  };
  right = reach(right, 1);
  if (mode === "backhand") {
    const rr = [readyLeft[0] - readyRight[0], readyLeft[1] - readyRight[1], readyLeft[2] - readyRight[2]];
    const grip = blend([-0.075, 0.05, 0.055], rr, settle);
    // Project the shared grip into both arms' reachable space, keeping the
    // hands together instead of stretching an arm or letting go mid-stroke.
    for (let i = 0; i < 16; i++) {
      const second = reach([right[0] + grip[0], right[1] + grip[1], right[2] + grip[2]], -1);
      right = reach([second[0] - grip[0], second[1] - grip[1], second[2] - grip[2]], 1);
    }
    left = [right[0] + grip[0], right[1] + grip[1], right[2] + grip[2]];
  } else left = reach(left, -1);
  return {
    mode: slide > 0 ? "slide" : mode,
    sliding: slide > 0,
    legs,
    right,
    left,
    racketDirection,
    hipY,
    torsoYaw,
    shoulderY: 1.39 + bodyBob,
    headY: 1.66 + bodyBob + breath,
    leanX: -0.035 + clamp(player.vy * face * 0.055, -0.065, 0.075) + strokeLean,
    leanZ: -clamp(player.vx * face * 0.09, -0.11, 0.11)
  };
}

export function createAthletePose(): AthletePose {
  return { pose: (actor, state) => pose(actor as unknown as PoseActor, state as PoseMatchState) };
}
