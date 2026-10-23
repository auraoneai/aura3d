import type { AuraRuntimeNodeHandle } from "../index";
import { directionToEulerXYZ, localDirToWorld, localToWorld, orientCylinderBetween, solveArmElbow } from "./racketGeometry";

/**
 * Procedural racket-sport athlete rig: a pure locomotion solver (stride cycle, split step, slide, planted-stroke stance)
 * and a limb applicator that poses leg, arm and racket cylinders from a pose. Costume, colours and the stroke-specific
 * arm poses stay game code.
 */
export type RigVec3 = readonly [number, number, number];

export interface AthleteLocomotionInput {
  /** "player" faces the camera end (face +1), anything else is the far end (face -1). */
  side: string;
  /** 0..1 blend between standing and running. */
  moveBlend: number;
  /** Stride phase in radians (advance it with speed). */
  stride: number;
  /** Court-space velocity; scaled to render units by `unitsX`/`unitsY`. */
  vx: number;
  vy: number;
  /** Seconds left of the split-step hop (0 when idle). */
  splitStep: number;
  strokeContactAge?: number;
  swingAge: number;
  strokeConnected: boolean;
  /** Seconds left of the swing (0 when not swinging). */
  swing: number;
  stroke: string;
  /** Seconds left of a slide; omitted or 0 when not sliding. */
  slideRemaining?: number;
  slidePoseStatic?: boolean;
}

export interface AthleteLocomotionOptions {
  /** Render units per court unit along x and y (default 5.5 and 8, the tennis court). */
  unitsX?: number;
  unitsY?: number;
}

export interface AthleteLeg {
  hip: [number, number, number];
  knee: [number, number, number];
  foot: [number, number, number];
  planted: boolean;
}

export interface AthleteLocomotion {
  /** Clamped moveBlend. */
  move: number;
  face: 1 | -1;
  /** Unit move direction in the athlete's local frame (dz defaults to -1 when standing). */
  dx: number;
  dz: number;
  split: number;
  /** Stroke timing: windup, follow-through and settle blends, all 0..1. */
  wind: number;
  follow: number;
  settle: number;
  plantedStroke: boolean;
  coil: number;
  slide: number;
  hipY: number;
  legs: readonly [AthleteLeg, AthleteLeg];
}

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Two-bone knee position: bends toward the athlete's forward (-z) over a 0.48 thigh. */
export function solveKnee(hip: RigVec3, foot: RigVec3): [number, number, number] {
  const delta = [foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]];
  const d = Math.max(0.001, Math.hypot(delta[0]!, delta[1]!, delta[2]!));
  const dir = delta.map((v) => v / d);
  const forward = [0, 0, -1];
  const dot = dir[2]! * -1;
  const bend = forward.map((v, i) => v - dir[i]! * dot);
  const length = Math.hypot(bend[0]!, bend[1]!, bend[2]!) || 1;
  const height = Math.sqrt(Math.max(0.001, 0.48 ** 2 - (Math.min(0.95, d) / 2) ** 2));
  return [
    hip[0] + delta[0]! * 0.5 + (bend[0]! / length) * height,
    hip[1] + delta[1]! * 0.5 + (bend[1]! / length) * height,
    hip[2] + delta[2]! * 0.5 + (bend[2]! / length) * height
  ];
}

export function athleteLocomotion(player: AthleteLocomotionInput, options: AthleteLocomotionOptions = {}): AthleteLocomotion {
  const unitsX = options.unitsX ?? 5.5;
  const unitsY = options.unitsY ?? 8;
  const move = clamp(player.moveBlend, 0, 1);
  const phase = player.stride;
  const face: 1 | -1 = player.side === "player" ? 1 : -1;
  const speed = Math.hypot(player.vx * unitsX, player.vy * unitsY);
  const dx = speed > 0.01 ? ((player.vx * unitsX) / speed) * face : 0;
  const dz = speed > 0.01 ? ((player.vy * unitsY) / speed) * face : -1;
  const split = player.splitStep > 0 ? Math.sin(clamp(1 - player.splitStep / 0.22, 0, 1) * Math.PI) : 0;
  const hitAge = player.strokeContactAge || 0.17;
  const wind = smooth(player.swingAge / hitAge);
  const follow = player.strokeConnected ? smooth((player.swingAge - hitAge) / Math.max(0.08, 0.33 - hitAge)) : 0;
  // A connected stroke settles back into the ready grip before its timer expires.
  const settle =
    player.swing > 0 && player.strokeConnected
      ? smooth(1 - player.swing / 0.065) * smooth((player.swingAge - hitAge) / 0.055)
      : 0;
  const plantedStroke = player.swing > 0 && move < 0.2 && player.stroke !== "serve";
  const coil = plantedStroke ? Math.sin(wind * Math.PI) * (1 - follow) : 0;
  const slideRemaining = player.slideRemaining as number;
  const slide =
    slideRemaining > 0
      ? player.slidePoseStatic
        ? 1
        : smooth((0.32 - slideRemaining) / 0.055) * smooth(slideRemaining / 0.065)
      : 0;
  const hipY =
    0.887 - 0.025 * move + Math.cos(phase * 2) * 0.018 * move * (1 - slide) - 0.04 * split - 0.028 * coil - 0.22 * slide;
  const legs = [-1, 1].map((side, i): AthleteLeg => {
    const t = (((phase / TAU + i * 0.5) % 1) + 1) % 1;
    const stance = t < 0.58;
    const swing = clamp((t - 0.58) / 0.42, 0, 1);
    const along = stance ? mix(0.46, -0.46, t / 0.58) : mix(-0.46, 0.46, swing * swing * (3 - 2 * swing));
    // Side shuffles stay low; a forward run has more knee drive.
    const lift = stance ? 0 : Math.sin(swing * Math.PI) * mix(0.17, 0.23, Math.abs(dz)) * move;
    const hip: [number, number, number] = [side * 0.15, hipY, 0];
    // Lateral footwork is a shuffle: keep the feet on their own side instead of crossing.
    const foot: [number, number, number] = [
      side * (0.25 + 0.035 * split) + dx * along * move * 0.4,
      0.09 + lift,
      dz * along * move + 0.025 + side * 0.025 * (1 - move)
    ];
    if (plantedStroke) {
      const turn = player.stroke === "backhand" ? -1 : 1;
      foot[2] += side * turn * 0.075 * Math.sin(wind * Math.PI) * (1 - follow);
    }
    if (slide) {
      const leading = side === (dx < 0 ? -1 : 1);
      const reach = leading ? 0.63 : -0.38;
      const target: [number, number, number] = [side * 0.24 + dx * reach, 0.075, dz * reach + 0.025];
      for (let axis = 0; axis < 3; axis++) foot[axis] = mix(foot[axis]!, target[axis]!, slide);
    }
    return { hip, knee: solveKnee(hip, foot), foot, planted: slide > 0 || stance || move < 0.04 };
  }) as [AthleteLeg, AthleteLeg];
  return { move, face, dx, dz, split, wind, follow, settle, plantedStroke, coil, slide, hipY, legs };
}

export interface AthleteLimbHandles {
  leftUpperLeg: AuraRuntimeNodeHandle;
  leftLowerLeg: AuraRuntimeNodeHandle;
  leftKnee: AuraRuntimeNodeHandle;
  leftShoe: AuraRuntimeNodeHandle;
  rightUpperLeg: AuraRuntimeNodeHandle;
  rightLowerLeg: AuraRuntimeNodeHandle;
  rightKnee: AuraRuntimeNodeHandle;
  rightShoe: AuraRuntimeNodeHandle;
  leftUpperArm: AuraRuntimeNodeHandle;
  leftLowerArm: AuraRuntimeNodeHandle;
  leftHand: AuraRuntimeNodeHandle;
  rightUpperArm: AuraRuntimeNodeHandle;
  rightLowerArm: AuraRuntimeNodeHandle;
  rightHand: AuraRuntimeNodeHandle;
  racketHandle: AuraRuntimeNodeHandle;
  racketThroatLeft: AuraRuntimeNodeHandle;
  racketThroatRight: AuraRuntimeNodeHandle;
  racketHoop: AuraRuntimeNodeHandle;
  racketStrings: AuraRuntimeNodeHandle;
}

export interface AthleteLimbPose {
  shoulderY: number;
  legs?: ReadonlyArray<{ hip: RigVec3; knee: RigVec3; foot: RigVec3 }>;
  left?: RigVec3;
  right?: RigVec3;
  racketDirection?: RigVec3;
}

export interface AthleteLimbRoot {
  position: RigVec3;
  yaw: number;
  scale: RigVec3;
}

const DEFAULT_LEFT_LEG = { hip: [-0.11, 0.88, 0], knee: [-0.12, 0.48, -0.05], foot: [-0.12, 0.05, 0] } as const;
const DEFAULT_RIGHT_LEG = { hip: [0.11, 0.88, 0], knee: [0.12, 0.48, 0.05], foot: [0.12, 0.05, 0] } as const;

/** Pose leg, arm and racket cylinders from root-local pose points. Torso, head and costume are the caller's. */
export function applyAthleteLimbs(handles: AthleteLimbHandles, pose: AthleteLimbPose, root: AthleteLimbRoot): void {
  const rootPos = root.position;
  const yaw = root.yaw;
  const scale = root.scale;
  const leftLeg = pose.legs?.[0] ?? DEFAULT_LEFT_LEG;
  const rightLeg = pose.legs?.[1] ?? DEFAULT_RIGHT_LEG;

  const lHipW = localToWorld(rootPos, yaw, scale, leftLeg.hip);
  const lKneeW = localToWorld(rootPos, yaw, scale, leftLeg.knee);
  const lFootW = localToWorld(rootPos, yaw, scale, leftLeg.foot);
  orientCylinderBetween(handles.leftUpperLeg, lHipW, lKneeW, 0.135);
  orientCylinderBetween(handles.leftLowerLeg, lKneeW, lFootW, 0.11);
  handles.leftKnee.setPosition(lKneeW[0], lKneeW[1], lKneeW[2]).setScale([1, 1, 1]).setVisible(true);
  handles.leftShoe
    .setPosition(lFootW[0], Math.max(0.045, lFootW[1]), lFootW[2])
    .setRotation(0, yaw, 0)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(true);

  const rHipW = localToWorld(rootPos, yaw, scale, rightLeg.hip);
  const rKneeW = localToWorld(rootPos, yaw, scale, rightLeg.knee);
  const rFootW = localToWorld(rootPos, yaw, scale, rightLeg.foot);
  orientCylinderBetween(handles.rightUpperLeg, rHipW, rKneeW, 0.135);
  orientCylinderBetween(handles.rightLowerLeg, rKneeW, rFootW, 0.11);
  handles.rightKnee.setPosition(rKneeW[0], rKneeW[1], rKneeW[2]).setScale([1, 1, 1]).setVisible(true);
  handles.rightShoe
    .setPosition(rFootW[0], Math.max(0.045, rFootW[1]), rFootW[2])
    .setRotation(0, yaw, 0)
    .setScale([scale[0], scale[1], scale[2]])
    .setVisible(true);

  // Arms: two-bone IK elbows.
  const lShoulderLocal: RigVec3 = [-0.225, pose.shoulderY, 0];
  const rShoulderLocal: RigVec3 = [0.225, pose.shoulderY, 0];
  const lHandLocal: RigVec3 = pose.left ?? [-0.28, 1.05, -0.14];
  const rHandLocal: RigVec3 = pose.right ?? [0.3, 1.08, -0.16];
  const lElbowLocal = solveArmElbow(lShoulderLocal, lHandLocal, -1);
  const rElbowLocal = solveArmElbow(rShoulderLocal, rHandLocal, 1);

  const lShoulderW = localToWorld(rootPos, yaw, scale, lShoulderLocal);
  const lElbowW = localToWorld(rootPos, yaw, scale, lElbowLocal);
  const lHandW = localToWorld(rootPos, yaw, scale, lHandLocal);
  orientCylinderBetween(handles.leftUpperArm, lShoulderW, lElbowW, 0.105);
  orientCylinderBetween(handles.leftLowerArm, lElbowW, lHandW, 0.09);
  handles.leftHand.setPosition(lHandW[0], lHandW[1], lHandW[2]).setScale([1, 1, 1]).setVisible(true);

  const rShoulderW = localToWorld(rootPos, yaw, scale, rShoulderLocal);
  const rElbowW = localToWorld(rootPos, yaw, scale, rElbowLocal);
  const rHandW = localToWorld(rootPos, yaw, scale, rHandLocal);
  orientCylinderBetween(handles.rightUpperArm, rShoulderW, rElbowW, 0.105);
  orientCylinderBetween(handles.rightLowerArm, rElbowW, rHandW, 0.09);
  handles.rightHand.setPosition(rHandW[0], rHandW[1], rHandW[2]).setScale([1, 1, 1]).setVisible(true);

  // Racket along racketDirection from the right hand.
  const rDirLocal: RigVec3 = pose.racketDirection ?? [0.4, 0.7, -0.4];
  const rDirWorld = localDirToWorld(yaw, rDirLocal);
  const rDirLen = Math.hypot(rDirWorld[0], rDirWorld[1], rDirWorld[2]) || 1;
  const rx = rDirWorld[0] / rDirLen;
  const ry = rDirWorld[1] / rDirLen;
  const rz = rDirWorld[2] / rDirLen;

  // Orthogonal side vector in the racket plane.
  let sx = -rz;
  let sy = 0;
  let sz = rx;
  const sLen = Math.hypot(sx, sy, sz) || 1;
  sx /= sLen;
  sy /= sLen;
  sz /= sLen;

  const gripStart: RigVec3 = [rHandW[0] - rx * 0.04, rHandW[1] - ry * 0.04, rHandW[2] - rz * 0.04];
  const gripEnd: RigVec3 = [rHandW[0] + rx * 0.17, rHandW[1] + ry * 0.17, rHandW[2] + rz * 0.17];
  const throatLeftEnd: RigVec3 = [
    rHandW[0] + rx * 0.31 - sx * 0.075,
    rHandW[1] + ry * 0.31 - sy * 0.075,
    rHandW[2] + rz * 0.31 - sz * 0.075
  ];
  const throatRightEnd: RigVec3 = [
    rHandW[0] + rx * 0.31 + sx * 0.075,
    rHandW[1] + ry * 0.31 + sy * 0.075,
    rHandW[2] + rz * 0.31 + sz * 0.075
  ];
  const hoopCenter: RigVec3 = [rHandW[0] + rx * 0.49, rHandW[1] + ry * 0.49, rHandW[2] + rz * 0.49];

  orientCylinderBetween(handles.racketHandle, gripStart, gripEnd, 0.032);
  orientCylinderBetween(handles.racketThroatLeft, gripEnd, throatLeftEnd, 0.022);
  orientCylinderBetween(handles.racketThroatRight, gripEnd, throatRightEnd, 0.022);

  const racketRot = directionToEulerXYZ(rx, ry, rz);
  handles.racketHoop
    .setPosition(hoopCenter[0], hoopCenter[1], hoopCenter[2])
    .setRotation(racketRot[0] + Math.PI * 0.5, racketRot[1], racketRot[2])
    .setScale([0.92, 1.18, 0.92])
    .setVisible(true);
  handles.racketStrings
    .setPosition(hoopCenter[0], hoopCenter[1], hoopCenter[2])
    .setRotation(racketRot[0] + Math.PI * 0.5, racketRot[1], racketRot[2])
    .setScale([0.9, 0.6, 1.14])
    .setVisible(true);
}

export interface RacketAthleteRigKit {
  locomotion(player: AthleteLocomotionInput, options?: AthleteLocomotionOptions): AthleteLocomotion;
  solveKnee(hip: RigVec3, foot: RigVec3): [number, number, number];
  applyLimbs(handles: AthleteLimbHandles, pose: AthleteLimbPose, root: AthleteLimbRoot): void;
}

export const racketAthleteRig: RacketAthleteRigKit = {
  locomotion: athleteLocomotion,
  solveKnee,
  applyLimbs: applyAthleteLimbs
};
