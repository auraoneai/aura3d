/**
 * Idol wow pass (render layer only): the hero, shadow clones, sage and ember forms, foot soldiers, oni brutes, casters
 * and scouts are high-detail rigged Idol GLBs (hand-carved, hand-painted woodblock-print figures) posed every frame from
 * the same clip angles that drove the six procedural parts (`proceduralActors.ts` `sampleClipAngles`). Each actor slot
 * is one `model(assets.nr*)` node; its bones are written through the runtime handle's live pose (`setAnimationPose`, object-form local rotations), and the posed
 * skeleton's hand and spine joints feed the weapon and scarf sockets. `?idol=0` restores the procedural parts.
 */
import { model, type AuraApp, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { IDOL_ASSETS } from "../../../apps/showcase-ninja-runner-port/src/idol-assets";
import type { CharacterId } from "../models";
import { createIdolRigDriver, qMul, qX, qY, qZ, type IdolRigDriver, type IdolSegmentPose, type Quat, type V3 } from "./idolRig";
import { IDOL_RIGS } from "./idolRigData";
import { MOTION_CLIPS, type MotionClipName } from "../../../apps/showcase-ninja-runner-port/src/motion.generated";
import { sampleHumanoidClip } from "../../../apps/showcase-port-shared/idol/humanoid";
import { buildStrideTable, createSlotMotion, finishMotionPose, motionRequest, segmentsFromHumanoid, strideTableTime, uprightRun, type GameClipState, type IdolMotionContext, type SlotMotion, type StrideTable } from "./idolMotion";

export type IdolActorKey = keyof typeof IDOL_RIGS;
export type IdolVariant = "std" | "clone" | "ember";

/** `?idol=0` keeps the procedural six-part actors (comparison captures). */
export const IDOL_ACTORS = !(typeof location !== "undefined" && new URLSearchParams(location.search).get("idol") === "0");

const WANTED: Readonly<Record<CharacterId, string>> = { hero: "nrHero", sage: "nrSage", soldier: "nrSoldier", brute: "nrBrute", caster: "nrCaster", scout: "nrScout" };
/** The Idol model of a slot; a model not admitted yet falls back to the hero (sage/ember forms) or the foot soldier. */
export function idolKeyFor(id: CharacterId, variant: IdolVariant): IdolActorKey {
  const want = variant === "clone" ? "nrHeroClone" : variant === "ember" ? "nrEmber" : WANTED[id];
  const ok = (k: string): k is IdolActorKey => k in IDOL_RIGS && IDOL_ASSETS[k] !== undefined;
  if (ok(want)) return want;
  return id === "hero" || id === "sage" || variant !== "std" ? "nrHero" : "nrSoldier";
}

const nodeId = (slot: number): string => `actor-${slot}-idol`;
const slotKey = new Map<number, IdolActorKey>();
const slotChar = new Map<number, CharacterId>();
const slotMotion = new Map<number, SlotMotion>();

export function buildIdolActorNode(slot: number, id: CharacterId, castShadow: boolean, variant: IdolVariant): AuraNodeBuilder<AuraSceneNode> {
  const key = idolKeyFor(id, variant);
  slotKey.set(slot, key);
  slotChar.set(slot, id);
  return model(IDOL_ASSETS[key]!, {
    name: nodeId(slot),
    role: slot === 0 ? "primaryCharacter" : "setDressing",
    scaleMode: "world",
    castShadow,
    receiveShadow: true,
    visible: false,
    position: [0, -500, 0]
  }).runtime({ id: nodeId(slot) }) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/** The clip angles the procedural slots expose (`ProceduralNinjaActor.__angles`). */
export interface IdolPoseAngles {
  lift: number; bodyPitch: number; bodyYaw: number; bodyRoll: number; headPitch: number;
  legLPitch: number; legRPitch: number; armLPitch: number; armRPitch: number; armLSplay: number; armRSplay: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/**
 * Clip angles -> model-space segment rotations. Sign reading of the clip table (its intent: runs lean forward, slides
 * lean back with the feet first, jumps raise both arms): body and head pitch + forward; leg and arm pitch + swings the
 * limb back, - forward/up; splay + outward for the left side, - for the right. Knees and elbows (rigid in the
 * procedural parts) bend with the swing so the carved figures run instead of scissoring.
 */
export function segmentsFromAngles(a: IdolPoseAngles, legScale = 1): IdolSegmentPose {
  const body = qMul(qY(a.bodyYaw), qMul(qZ(a.bodyRoll), qX(a.bodyPitch)));
  const head = qMul(qY(a.bodyYaw * 0.45), qMul(qZ(a.bodyRoll * 0.35), qX(a.bodyPitch + a.headPitch)));
  const limb = (pitch: number, splay: number, yaw: number): Quat => qMul(qY(yaw), qMul(qZ(splay), qX(pitch)));
  const armL = limb(a.armLPitch, a.armLSplay, a.bodyYaw * 0.58);
  const armR = limb(a.armRPitch, a.armRSplay, a.bodyYaw * 0.58);
  const elbow = (pitch: number): number => clamp(0.28 + 0.55 * Math.max(0, -pitch) + 0.25 * Math.max(0, pitch), 0, 1.25);
  const legL = limb(a.legLPitch * legScale, 0.03, a.bodyYaw * 0.28);
  const legR = limb(a.legRPitch * legScale, -0.03, a.bodyYaw * 0.28);
  const knee = (pitch: number): number => clamp(0.1 + 0.95 * Math.max(0, pitch) + 0.9 * Math.max(0, -pitch - 0.35), 0, 1.6);
  const kL = knee(a.legLPitch) * legScale, kR = knee(a.legRPitch) * legScale;
  const shinL = qMul(legL, qX(kL)), shinR = qMul(legR, qX(kR));
  return {
    body, head,
    armL, foreL: qMul(armL, qX(-elbow(a.armLPitch))),
    armR, foreR: qMul(armR, qX(-elbow(a.armRPitch))),
    legL, shinL, footL: qMul(shinL, qX(-kL * 0.7)),
    legR, shinR, footR: qMul(shinR, qX(-kR * 0.7))
  };
}

/** The robed sorcerer's ankle-length robe is skinned to the thighs: it glides with short steps so the robe never tears. */
const LEG_SCALE: Partial<Record<IdolActorKey, number>> = { nrCaster: 0.35 };

const drivers = new Map<IdolActorKey, IdolRigDriver>();
/** The shared rig driver of an Idol key (its last solve's joint positions: sockets, tests). */
export const driverFor = (key: IdolActorKey): IdolRigDriver => {
  let d = drivers.get(key);
  if (!d) drivers.set(key, (d = createIdolRigDriver(IDOL_RIGS[key])));
  return d;
};

interface PoseHandle {
  setVisible(v: boolean): unknown;
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(s: number): unknown;
  setAnimationPose?(pose: IdolAnimationPose): unknown;
}

/** Structurally an engine `AnimationPose`: parent-space local rotations in OBJECT form (tuples do not survive the clone). */
export interface IdolAnimationPose {
  readonly bones: Record<string, { readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }; readonly position?: { readonly x: number; readonly y: number; readonly z: number } }>;
  readonly mode: "replace";
}
/** Solves one Idol actor pose (segment rotations) into the runtime handle's live-pose form (object-form, hips position). */
export function idolSegmentsPose(key: IdolActorKey, segments: IdolSegmentPose): IdolAnimationPose {
  const driver = driverFor(key);
  const locals = driver.solve(segments);
  const bones: Record<string, { rotation: { x: number; y: number; z: number; w: number }; position?: { x: number; y: number; z: number } }> = {};
  // unit quaternions only (the decoded clip rotations drift ~1e-3 off unit length; the skinning matrices must not scale)
  driver.data.bones.forEach((b, i) => { const q = locals[i]!, n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; bones[b.name] = { rotation: { x: q[0] / n, y: q[1] / n, z: q[2] / n, w: q[3] / n } }; });
  const ht = driver.hipsTranslation();
  if (ht) bones[driver.data.bones[driver.data.map.hips]!.name]!.position = { x: ht[0], y: ht[1], z: ht[2] };
  return { bones, mode: "replace" };
}
/** Solves one Idol actor pose from clip angles into the runtime handle's live-pose form. */
export function idolActorPose(key: IdolActorKey, angles: IdolPoseAngles): IdolAnimationPose {
  return idolSegmentsPose(key, segmentsFromAngles(angles, LEG_SCALE[key] ?? 1));
}

const strideTables = new Map<string, StrideTable>();
/** Stride table of a locomotion clip on an Idol body (built once, from the body's own posed feet). */
export function strideTableFor(key: IdolActorKey, clip: MotionClipName, legScale = 1): StrideTable {
  const id = `${key}:${clip}:${legScale}`;
  let tab = strideTables.get(id);
  if (!tab) {
    const driver = driverFor(key), m = driver.data.map, c = MOTION_CLIPS[clip];
    tab = buildStrideTable(c.duration, (t) => {
      driver.solve(segmentsFromHumanoid(sampleHumanoidClip(c, t, { loop: true }), legScale));
      return { l: driver.jointPosition(m.legL[2]!), r: driver.jointPosition(m.legR[2]!) };
    });
    strideTables.set(id, tab);
  }
  return tab;
}

/**
 * The captured-motion pose of a slot this frame, or null when the game clip has no captured counterpart (then the
 * procedural clip angles drive it as before). Cross-fades run on `ctx.dt`; locomotion follows the distance covered.
 */
export function idolMotionPose(slot: number, key: IdolActorKey, id: CharacterId, game: GameClipState, ctx: IdolMotionContext, scale: number): { pose: IdolAnimationPose; clip: string } | null {
  let st = slotMotion.get(slot);
  // each slot starts at its own point of the cycle (golden-ratio spread): two echo clones spawned together never step in unison
  if (!st) { slotMotion.set(slot, (st = createSlotMotion())); st.stride = ((slot * 0.6180339887) % 1) * 2.4; }
  const driver = driverFor(key);
  const legScale = LEG_SCALE[key] ?? 1;
  // At running speed the cycle plays at a UNIFORM rate over the distance (one loop per measured stride cycle). Mapping
  // distance through the stance foot's slide (`strideTableTime`) froze the clip through every flight phase and then
  // jumped it (0 then 7-35 degrees of torso turn between frames): a stutter at every step.
  // At walking pace (under the cadence cap) the stance foot's slide still maps distance to clip time so it stays
  // planted; the two mappings agree at every loop boundary and `plant` eases between them.
  const sm = st;
  const req = motionRequest(st, id, game, ctx, driver.hipsHeight * scale, (clip, metres) => {
    const tab = strideTableFor(key, clip, legScale), u = metres / scale / tab.cycle, frac = u - Math.floor(u);
    const uniform = frac * MOTION_CLIPS[clip].duration;
    return sm.plant < 1e-3 ? uniform : uniform + (strideTableTime(tab, frac * tab.cycle) - uniform) * sm.plant;
  },
    // footfalls per loop are the clip's own (counted on the full-length legs: the caster's short robe steps hide them)
    (clip) => (strideTableFor(key, clip, legScale).cycle / strideTableFor(key, clip, 1).steps) * scale);
  if (!req || !("clip" in req)) return null;
  const input = finishMotionPose(req.clip, st.anim.update(ctx.dt, req));
  let seg = segmentsFromHumanoid(input, legScale);
  if (req.clip === "Run" || req.clip === "Dash") {
    seg = uprightRun(seg);
    // The capture's sideways weight shift went with its root motion: the hips take it back so the stance foot (the
    // lower one) does not skate sideways; the shift eases out slowly beyond 6 cm so it never builds up.
    const m = driver.data.map;
    driver.solve(seg);
    // The hips lock holds a PLANTED stance foot; at speed the cadence cap lets the feet glide, and the lock would only
    // swing the hips sideways every step: it eases out instead.
    if (st.capped) st.lockFoot = -1;
    const fl = driver.jointPosition(m.legL[2]!), fr = driver.jointPosition(m.legR[2]!);
    const foot = fl[1] <= fr[1] ? 0 : 1, x = foot === 0 ? fl[0] : fr[0];
    if (foot === st.lockFoot) st.lockX -= x - st.lockPrevX;
    else if (st.capped) st.lockX *= Math.exp(-ctx.dt * 6);
    st.lockFoot = st.capped ? -1 : foot;
    st.lockPrevX = x;
    const free = 0.06;
    if (Math.abs(st.lockX) > free) st.lockX = Math.sign(st.lockX) * (free + (Math.abs(st.lockX) - free) * Math.exp(-ctx.dt * 2));
    const off = seg.hipsOffset ?? [0, 0, 0];
    seg.hipsOffset = [off[0] + st.lockX / driver.hipsHeight, off[1], off[2]];
  } else {
    st.lockX *= Math.exp(-ctx.dt * 6);
    st.lockFoot = -1;
  }
  groundFeet(driver, seg);
  return { pose: idolSegmentsPose(key, seg), clip: req.clip };
}


/** Lowest point of the legs (knees, feet, toes; model space) after `driver.solve`. */
export function lowestLegPoint(driver: IdolRigDriver): number {
  const m = driver.data.map;
  let y = Infinity;
  for (const b of [m.legL[1]!, m.legL[2]!, m.legL[3]!, m.legR[1]!, m.legR[2]!, m.legR[3]!]) if (b >= 0) y = Math.min(y, driver.jointPosition(b)[1]);
  return y;
}
const I: Quat = [0, 0, 0, 1];
const STANDING: IdolSegmentPose = { body: I, head: I, armL: I, foreL: I, armR: I, foreR: I, legL: I, shinL: I, footL: I, legR: I, shinR: I, footR: I };
const standLow = new WeakMap<IdolRigDriver, number>();
/** Lowest leg joint of the body standing straight (its toe / ankle height over the sole when the sole is on the road). */
export function standingSole(driver: IdolRigDriver): number {
  let y = standLow.get(driver);
  if (y === undefined) { driver.solve(STANDING); standLow.set(driver, (y = lowestLegPoint(driver))); }
  return y;
}
/** No captured pose sinks into the road (the hips rise until the lowest knee/foot/toe joint is at its standing height), nor hovers more than the stride's flight. */
export function groundFeet(driver: IdolRigDriver, seg: IdolSegmentPose): IdolSegmentPose {
  const sole = standingSole(driver);
  driver.solve(seg);
  const low = lowestLegPoint(driver);
  // below the road: lift all the way; above it (the clip's hip bob in a stride's flight): settle up to 3 cm back down
  const lift = low < sole ? sole - low : -Math.min(low - sole, 0.03);
  if (Math.abs(lift) < 1e-6) return seg;
  const off = seg.hipsOffset ?? [0, 0, 0];
  seg.hipsOffset = [off[0], off[1] + lift / driver.hipsHeight, off[2]];
  return seg;
}

/**
 * Places, shows and poses the Idol actor of visual slot `slot`; returns the measured actor-space joints the weapon,
 * orb and scarf sockets read (`Spine`, `Spine01`, `Spine02`, `LeftForeArm`, `LeftHand`, `RightForeArm`, `RightHand`).
 */
export function syncIdolActorNode(
  node: (id: string) => ReturnType<AuraApp["nodes"]["require"]>,
  slot: number,
  angles: IdolPoseAngles | null,
  show: boolean,
  wx: number, wy: number, wz: number, yaw: number, scale: number,
  game?: GameClipState | null,
  motion?: IdolMotionContext
): Record<string, V3> | null {
  const h = node(nodeId(slot)) as unknown as PoseHandle;
  if (!show || !angles) {
    h.setVisible(false);
    const st = slotMotion.get(slot);
    if (st) st.lastTravel = null;
    return null;
  }
  const key = slotKey.get(slot) ?? "nrSoldier";
  const driver = driverFor(key);
  // Captured motion when the game clip has a counterpart (the body's own hips carry crouch and jump tuck: no lift).
  const captured = game && motion ? idolMotionPose(slot, key, slotChar.get(slot) ?? "soldier", game, motion, scale) : null;
  const lift = captured ? 0 : angles.lift;
  h.setVisible(true);
  h.setPosition(wx, wy + lift * scale, wz);
  h.setRotation(0, yaw, 0);
  h.setScale(scale);
  // Live pose through the runtime handle (the engine applies it to the skinned actor every frame).
  h.setAnimationPose?.(captured ? captured.pose : idolActorPose(key, angles));
  const m = driver.data.map;
  const at = (b: number): V3 => { const p = driver.jointPosition(b); return [p[0], p[1] + lift, p[2]]; };
  const spine = m.spine;
  return {
    Spine: at(m.hips),
    Spine01: at(spine[Math.floor(spine.length / 2)] ?? m.hips),
    Spine02: at(spine[spine.length - 1] ?? m.hips),
    LeftForeArm: at(m.armL[2]!),
    LeftHand: at(m.armL[3]!),
    RightForeArm: at(m.armR[2]!),
    RightHand: at(m.armR[3]!)
  };
}
