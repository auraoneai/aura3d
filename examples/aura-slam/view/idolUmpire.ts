/**
 * Idol wow pass: the chair umpire is a rigged Idol GLB (T-pose official) seated on the Idol high chair by the humanoid retarget:
 * pelvis on the seat, thighs forward, shins down to the footrest, hands on the lap. The head follows the ball with the yaw the
 * renderer already computes for the procedural `umpire-head` node (that node stays in the scene, hidden, so its handle resolves).
 */
import { game, model, type AuraRuntimeNodeHandle, type AuraSceneNode } from "@aura3d/engine";
import { IDOL_BINDS } from "./idolBind.generated";
import { createIdolHumanoid, qAxis, qMul, vAdd, type HumanoidTargets, type IdolHumanoid, type V3 } from "./idolHumanoid";
import { idolModels } from "./assets";

export const UMPIRE_IDOL_ID = "umpire-idol";
/**
 * Chair position and the seat-top height of the Idol high chair (m). The GLB is 2.74 m deep (ladder in front, canopy behind), so
 * it stands 0.6 m further from the court than the procedural chair (-6.76) to keep the ladder foot off the doubles alley.
 */
export const UMPIRE_CHAIR_X = -7.35;
export const UMPIRE_SEAT_TOP = 2.0;
/** standing height the umpire GLB is scaled to (m) */
export const UMPIRE_HEIGHT = 1.76;
/**
 * Seated pelvis offset from the chair origin toward the court (m; model +Z = scene +X). The Idol chair's backrest front is at
 * z = -0.15 and its seat runs to z = +0.8, so the pelvis sits 0.12 m in front of the origin, against the backrest.
 */
const SEAT_FORWARD = 0.12;

let humanoid: IdolHumanoid | undefined;
const umpireHumanoid = (): IdolHumanoid => (humanoid ??= createIdolHumanoid(IDOL_BINDS.slamUmpireOfficial!));
export const umpireScale = (): number => UMPIRE_HEIGHT / idolModels.slamUmpireOfficial.bounds[1];

/** The seated targets in GLB model space (node scale k, facing +Z; the node turns it to face the court, +X). */
export function umpireSeatedTargets(h: IdolHumanoid, k: number, headYaw: number, time = 0): HumanoidTargets {
  const m = h.map;
  const hipL = h.bindPos(m.upperLegL);
  const hipR = h.bindPos(m.upperLegR);
  const hipBindY = (hipL[1] + hipR[1]) / 2;
  const thigh = Math.hypot(...(h.bindPos(m.lowerLegL).map((v, i) => v - hipL[i]!) as [number, number, number]));
  const shin = Math.hypot(...(h.bindPos(m.footL).map((v, i) => v - h.bindPos(m.lowerLegL)[i]!) as [number, number, number]));
  // hip joints sit ~9 cm above the seat top (thigh thickness); the model's ground is at y = 0
  const hipY = (UMPIRE_SEAT_TOP + 0.09) / k;
  const back = SEAT_FORWARD / k;
  const foot = (hip: V3): V3 => [hip[0] * 1.15, hipY - shin * 0.98, back + thigh * 0.92];
  const shoulderL = h.bindPos(m.upperArmL);
  const shoulderR = h.bindPos(m.upperArmR);
  // Visible at broadcast distance: breathing (chest and head), a slow glance on top of the ball follow, and every 5 s the
  // pen hand lifts to the scorecard on the left hand and writes for 1.4 s (a small scribble), then settles back on the lap.
  const breath = Math.sin(time * 1.6);
  const cycle = time % 5;
  const write = cycle < 1.4 ? Math.sin((cycle / 1.4) * Math.PI) : 0;
  const scribble = write * Math.sin(time * 22);
  const lap = (s: V3, side: number): V3 => [s[0] * 0.55 + side * 0.01, hipY + 0.12, back + thigh * 0.55];
  const card: V3 = [0.02, hipY + 0.34, back + thigh * 0.62];
  const penHand = (s: V3): V3 => {
    const rest = lap(s, -1);
    return [rest[0] + (card[0] - 0.05 + 0.03 * scribble - rest[0]) * write, rest[1] + (card[1] + 0.03 - rest[1]) * write, rest[2] + (card[2] - rest[2]) * write];
  };
  return {
    hipsOffset: [0, hipY - hipBindY, back],
    pelvis: qAxis([1, 0, 0], -0.06),
    chest: qMul(qAxis([1, 0, 0], 0.06 + 0.05 * breath + 0.12 * write), qAxis([0, 1, 0], 0.08 * Math.sin(time * 0.37))),
    head: qMul(qAxis([0, 1, 0], headYaw + 0.12 * Math.sin(time * 0.71)), qAxis([1, 0, 0], 0.05 * breath + 0.35 * write)),
    legL: { end: foot(hipL), pole: [0, 0.3, 1] },
    legR: { end: foot(hipR), pole: [0, 0.3, 1] },
    armL: { end: vAdd(lap(shoulderL, 1), [-0.12 * write, 0.2 * write, 0.06 * write]), pole: [0.6, -0.3, -1] },
    armR: { end: penHand(shoulderR), pole: [-0.6, -0.3, -1] }
  };
}

/** `y`: the chair's base height (the seated pose is relative to the chair's ground) */
export function buildUmpireIdolNode(y = 0): AuraSceneNode {
  const k = umpireScale();
  return model(idolModels.slamUmpireOfficial, { name: UMPIRE_IDOL_ID, role: "setDressing", scaleMode: "world", castShadow: true, receiveShadow: true })
    .position(UMPIRE_CHAIR_X, y, 0)
    .rotate(0, Math.PI / 2, 0)
    .scale([k, k, k])
    .runtime(game.runtimeNode(UMPIRE_IDOL_ID))
    .toJSON() as AuraSceneNode;
}

/** Per-frame umpire: the head follows the ball, the chest breathes and the pen hand drifts (bones driven every frame). */
export function createUmpireIdol(handle: AuraRuntimeNodeHandle) {
  const h = umpireHumanoid();
  const k = umpireScale();
  return {
    /** `yaw`: the head turn from facing the court (radians); `time`: match time (s) for the breathing cycle */
    update(yaw: number, time: number): void {
      handle.setAnimationPose({ bones: h.solve(umpireSeatedTargets(h, k, yaw, time)).bones, morphTargets: {} } as never);
    }
  };
}
