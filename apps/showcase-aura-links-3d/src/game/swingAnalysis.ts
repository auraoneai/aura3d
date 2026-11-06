/**
 * Aura Links 3D: swing pose analysis (pure, no engine). Forward kinematics of a solved swing on the virtual skeleton plus the
 * golf-specific joint read-outs (elbow flexion, shoulder elevation, shoulder / hip turn, arm crossing, palm facing) that the
 * old "hands within 5 mm of the grip" check could not see. Used by the swing contact-sheet tool and the unit tests.
 *
 * Frame: GLB model space (golfer faces +Z, the golfer's left is +X, the target is +X, up is +Y). Turn angles are positive for
 * the BACKSWING direction (chest turning away from the target), negative toward the target.
 */
import {
  LEG, RIG, SKELETON, qRotate, toModel, unit, vAdd, vDot, vLen, vScale, vSub,
  type RootFrame, type SolvedSwing, type V3
} from "./swingMath";

const DEG = 180 / Math.PI;
const angleBetween = (a: V3, b: V3): number => Math.acos(Math.max(-1, Math.min(1, vDot(unit(a), unit(b))))) * DEG;

export interface PoseJoints {
  hips: V3; spine: V3; chest: V3; neck: V3; head: V3;
  shoulderL: V3; shoulderR: V3; elbowL: V3; elbowR: V3; palmL: V3; palmR: V3;
  hipJointL: V3; hipJointR: V3; kneeL: V3; kneeR: V3; ankleL: V3; ankleR: V3;
  grip: V3; clubHead: V3;
}

/** joints of a solved swing (model space), from the solved world rotations and the active skeleton profile */
export function poseJoints(s: SolvedSwing, root: RootFrame): PoseJoints {
  const d = s.deltas;
  const hips = s.hipsPos;
  const spine = vAdd(hips, qRotate(d.hips, RIG.tSpine));
  const chest = vAdd(spine, qRotate(d.spine, RIG.tChest));
  const head = vAdd(chest, qRotate(d.chest, RIG.tHead));
  const neck = vAdd(chest, qRotate(d.chest, vScale(RIG.tHead, 0.35)));
  const shoulderL = vAdd(chest, qRotate(d.chest, RIG.tShoulderL));
  const shoulderR = vAdd(chest, qRotate(d.chest, RIG.tShoulderR));
  const elbowL = vAdd(shoulderL, qRotate(d.upperArmL, RIG.tForearmL));
  const elbowR = vAdd(shoulderR, qRotate(d.upperArmR, RIG.tForearmR));
  const palmL = vAdd(elbowL, qRotate(d.foreArmL, RIG.palmL));
  const palmR = vAdd(elbowR, qRotate(d.foreArmR, RIG.palmR));
  const hipJointL = vAdd(hips, qRotate(d.hips, LEG.hipJointL));
  const hipJointR = vAdd(hips, qRotate(d.hips, LEG.hipJointR));
  const lg = SKELETON.leg;
  const kneeL = vAdd(hipJointL, qRotate(d.thighL, vScale(lg.thighBindL, lg.thighL)));
  const kneeR = vAdd(hipJointR, qRotate(d.thighR, vScale(lg.thighBindR, lg.thighR)));
  return {
    hips, spine, chest, neck, head, shoulderL, shoulderR, elbowL, elbowR, palmL, palmR,
    hipJointL, hipJointR, kneeL, kneeR, ankleL: lg.ankleL, ankleR: lg.ankleR,
    grip: toModel(root, s.grip), clubHead: toModel(root, s.clubHead)
  };
}

/** elbow flexion (deg): 0 = straight arm, 90 = right angle */
export const elbowFlexionDeg = (shoulder: V3, elbow: V3, palm: V3): number =>
  180 - angleBetween(vSub(shoulder, elbow), vSub(palm, elbow));

/** yaw (deg, + = backswing direction) of a left-minus-right line in the horizontal plane, 0 = square to the target line */
export const lineTurnDeg = (left: V3, right: V3): number => {
  const v = vSub(left, right);
  return -Math.atan2(-v[2], v[0]) * DEG;
};

export interface SwingMetrics {
  elbowFlexL: number; elbowFlexR: number;
  /** upper-arm angle from the trunk's downward axis (deg): 0 hanging at the side, 90 level with the shoulder */
  shoulderElevL: number; shoulderElevR: number;
  shoulderTurn: number; hipTurn: number; xFactor: number;
  /** palm height above the lead shoulder (m, > 0 = hands above it) */
  handsAboveLeadShoulder: number;
  /** lateral offset (m) of each palm from the torso mid-plane, positive on the palm's OWN side (lead = left, trail = right) */
  sideL: number; sideR: number;
  /** angle of the shaft above the horizontal (deg) and of the shaft's horizontal projection from the target line (deg) */
  shaftElevation: number;
  /** head-centre distance to the shaft segment (m) */
  headClearance: number;
  /** hips displacement along the target line (m, + toward the target) from the stance centre */
  hipShift: number;
  /** 1 = the two palms face each other across the grip, -1 = back to back, from the solved forearm rolls */
  palmFacing: number;
  /** elbow height over its shoulder (m, > 0 = the elbow flies above the shoulder line) per arm */
  elbowRiseL: number; elbowRiseR: number;
  /** reach used (palm distance over arm length) per arm */
  extensionL: number; extensionR: number;
  /** trail foot heel lift (m): ankle height over the bind stance */
  trailHeelLift: number;
}

export function swingMetrics(s: SolvedSwing, root: RootFrame): SwingMetrics {
  const j = poseJoints(s, root);
  const lat = unit(vSub(j.shoulderL, j.shoulderR));
  const mid = vScale(vAdd(j.shoulderL, j.shoulderR), 0.5);
  const down = unit(vSub(j.hips, j.chest));
  const lenL = vLen(RIG.tForearmL) + vLen(RIG.palmL);
  const lenR = vLen(RIG.tForearmR) + vLen(RIG.palmR);
  const shaftDir = unit(vSub(j.clubHead, j.grip));
  // distance from the head centre to the shaft segment grip..clubHead
  const seg = vSub(j.clubHead, j.grip);
  const u = Math.max(0, Math.min(1, vDot(vSub(j.head, j.grip), seg) / vDot(seg, seg)));
  const headClearance = vLen(vSub(j.head, vAdd(j.grip, vScale(seg, u))));
  const stanceX = (SKELETON.leg.ankleL[0] + SKELETON.leg.ankleR[0]) / 2;
  // palm normals from the forearm rolls: bind palm normal is down (-Y) (Meshy T-pose hands: palm forward, +Z; see scripts/golfer-hand-axes.mjs)
  const nBind: V3 = SKELETON.palmNormalBind ?? [0, 0, 1];
  const nL = qRotate(s.deltas.foreArmL, nBind);
  const nR = qRotate(s.deltas.foreArmR, nBind);
  return {
    elbowFlexL: elbowFlexionDeg(j.shoulderL, j.elbowL, j.palmL),
    elbowFlexR: elbowFlexionDeg(j.shoulderR, j.elbowR, j.palmR),
    shoulderElevL: angleBetween(vSub(j.elbowL, j.shoulderL), down),
    shoulderElevR: angleBetween(vSub(j.elbowR, j.shoulderR), down),
    shoulderTurn: lineTurnDeg(j.shoulderL, j.shoulderR),
    hipTurn: lineTurnDeg(j.hipJointL, j.hipJointR),
    xFactor: lineTurnDeg(j.shoulderL, j.shoulderR) - lineTurnDeg(j.hipJointL, j.hipJointR),
    handsAboveLeadShoulder: j.palmL[1] - j.shoulderL[1],
    sideL: vDot(vSub(j.palmL, mid), lat),
    sideR: -vDot(vSub(j.palmR, mid), lat),
    shaftElevation: Math.asin(Math.max(-1, Math.min(1, shaftDir[1]))) * DEG,
    headClearance,
    hipShift: j.hips[0] - stanceX,
    palmFacing: -vDot(nL, nR),
    elbowRiseL: j.elbowL[1] - j.shoulderL[1],
    elbowRiseR: j.elbowR[1] - j.shoulderR[1],
    extensionL: vLen(vSub(j.palmL, j.shoulderL)) / lenL,
    extensionR: vLen(vSub(j.palmR, j.shoulderR)) / lenR,
    trailHeelLift: s.posture.trailHeelLiftM ?? 0
  };
}
