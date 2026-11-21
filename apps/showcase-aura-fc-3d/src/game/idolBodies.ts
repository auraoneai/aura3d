// Aura FC 3D — Idol image-to-3D bodies (Nov 2026 "Idol wow pass").
//
// Footballers, keepers, the referee and the front-row fans render as rigged Idol GLBs (speridlabs/idol/max; one
// generation per kit, unbranded, tools/idol/specs/aura-fc-3d.json). Their bones are driven every frame from the SAME
// stateless joint pose the procedural rig uses (`computeFootballerJointPose`, `poseArticulatedPitchFan`) through the
// shared humanoid driver, so gameplay animation, foot planting and kick contact timing are unchanged; only the body
// that renders the pose is new. `?idol=off` mounts the procedural articulated bodies instead.
// The Idol match ball and set pieces (dugouts, camera cranes, trophy) live here too. Pitch, goals with their rippling
// nets, stands, crowd, floodlight towers, ball trolley and every gameplay marker stay procedural.

import { game, model } from "@aura3d/engine";
import { assets } from "../aura-assets.route";
import {
  createHumanoidAnimator,
  eulerZYX,
  humanoidEventTime,
  humanoidLocomotionTime,
  loadIdolHumanoid,
  type HumanoidAnimator,
  type HumanoidDriver,
  type HumanoidMotionRequest,
  type HumanoidPoseInput
} from "@aura3d/engine/animation";
import type { FootballerJointPose } from "../art/proceduralModels";
import { MOTION_CLIPS, type MotionClipName } from "./motion.generated";

/** Procedural pelvis height above the soles in canonical rig units (computeFootballerJointPose rest). */
const SOURCE_HIP_HEIGHT = 0.96;

/** Rigged Idol bodies (literal references so `assets typegen --route` emits each into src/aura-assets.route.ts). */
const BODY_ASSETS = {
  fcIdolHomeA: assets.fcIdolHomeA,
  fcIdolHomeB: assets.fcIdolHomeB,
  fcIdolAwayA: assets.fcIdolAwayA,
  fcIdolAwayB: assets.fcIdolAwayB,
  fcIdolKeeperHome: assets.fcIdolKeeperHome,
  fcIdolKeeperAway: assets.fcIdolKeeperAway,
  fcIdolReferee: assets.fcIdolReferee,
  fcIdolFanA: assets.fcIdolFanA,
  fcIdolFanB: assets.fcIdolFanB,
  fcIdolFanC: assets.fcIdolFanC
};
export type IdolBodyKey = keyof typeof BODY_ASSETS;
export const IDOL_BODY_KEYS = Object.keys(BODY_ASSETS) as IdolBodyKey[];

/** Idol bodies are on unless the URL carries `?idol=off`. */
export function idolBodiesEnabled(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("idol") !== "off";
}

/** Body model per athlete id: "h-*" home, "a-*" away, "*-gk" keepers; two faces per outfield kit, alternating. */
export function idolKeyForAthlete(id: string): IdolBodyKey {
  const away = id.startsWith("a-");
  if (id.endsWith("-gk")) return away ? "fcIdolKeeperAway" : "fcIdolKeeperHome";
  const b = id.endsWith("-df1") || id.endsWith("-fw");
  return away ? (b ? "fcIdolAwayB" : "fcIdolAwayA") : (b ? "fcIdolHomeB" : "fcIdolHomeA");
}

/** Front-row fan palette variant (0..2) -> Idol fan body. */
export function idolKeyForFan(variant: 0 | 1 | 2): IdolBodyKey {
  return (["fcIdolFanA", "fcIdolFanB", "fcIdolFanC"] as const)[variant];
}

/**
 * Uniform node scale that renders body `key` at `targetHeight` metres. Uses the admitted T-pose bounds, so it holds both
 * for GLBs normalised to their spec height and for unscaled rigged GLBs (generator `normalized.sceneScale`, Nov 2026).
 */
export function idolBodyScale(key: IdolBodyKey, targetHeight: number): number {
  const h = BODY_ASSETS[key].bounds?.[1] ?? 0;
  return h > 0 ? targetHeight / h : 1;
}

/** A rigged Idol body as a runtime model node named `name` (uniform scale = rendered height / normalised height). */
export function idolBodyNode(name: string, key: IdolBodyKey, scale: number) {
  return model(BODY_ASSETS[key], { name, scale: [scale, scale, scale], castShadow: true, receiveShadow: true, scaleMode: "world" })
    .runtime(game.runtimeNode(name));
}

/* ---- humanoid drivers (one per body GLB, loaded once from the same URL the model node fetches) ---- */

const drivers = new Map<IdolBodyKey, HumanoidDriver>();
const pending = new Set<IdolBodyKey>();

/** The body's driver once its skeleton has been read; undefined until then (callers keep the body parked). */
export function idolDriver(key: IdolBodyKey): HumanoidDriver | undefined {
  const ready = drivers.get(key);
  if (ready || pending.has(key)) return ready;
  pending.add(key);
  loadIdolHumanoid(BODY_ASSETS[key].url)
    .then((d) => { drivers.set(key, d); })
    .catch((e: unknown) => { pending.delete(key); console.warn(`[fc3d] idol skeleton ${key}`, e); });
  return undefined;
}

/** Load every body's skeleton driver up front (boot awaits this before warmPrograms, so no body starts parked). */
export function preloadIdolDrivers(keys: readonly IdolBodyKey[] = IDOL_BODY_KEYS): Promise<void> {
  return Promise.all(keys.map((key) => loadIdolHumanoid(BODY_ASSETS[key].url).then((d) => { drivers.set(key, d); }, (e: unknown) => {
    console.warn(`[fc3d] idol skeleton ${key}`, e);
  }))).then(() => undefined);
}

const eul = (v: readonly [number, number, number]) => eulerZYX(v[0], v[1], v[2]);

/** The procedural rig's 13-joint `"ZYX"` Euler pose as a canonical humanoid pose (both rest poses are identical). */
export function footballerHumanoidPose(p: FootballerJointPose): HumanoidPoseInput {
  return {
    rotations: {
      hips: eul(p.pelvis), chest: eul(p.chest), head: eul(p.head),
      leftUpperArm: eul(p.armL), leftLowerArm: eul(p.forearmL),
      rightUpperArm: eul(p.armR), rightLowerArm: eul(p.forearmR),
      leftUpperLeg: eul(p.legL), leftLowerLeg: eul(p.calfL), leftFoot: eul(p.bootL),
      rightUpperLeg: eul(p.legR), rightLowerLeg: eul(p.calfR), rightFoot: eul(p.bootR)
    },
    hipsOffset: [0, (p.pelvisOffsetY - SOURCE_HIP_HEIGHT) / SOURCE_HIP_HEIGHT, p.pelvisOffsetZ / SOURCE_HIP_HEIGHT]
  };
}

type E3 = [number, number, number];
const ZERO: E3 = [0, 0, 0];

/**
 * Run a procedural pose function that writes joints through `lookup(\`${id}-<joint>\`).setRotation/.setPosition`
 * (e.g. `poseArticulatedPitchFan`) against a recorder, and return what it wrote as a footballer joint pose.
 */
export function recordFootballerPose(id: string, write: (lookup: (nodeId: string) => unknown) => void): FootballerJointPose {
  const rot = new Map<string, E3>();
  let pelvisPos: E3 = [0, SOURCE_HIP_HEIGHT, 0];
  write((nodeId: string) => {
    const suffix = nodeId.startsWith(`${id}-`) ? nodeId.slice(id.length + 1) : nodeId;
    const rec = {
      setRotation(x: number, y: number, z: number) { rot.set(suffix, [x, y, z]); return rec; },
      setPosition(x: number, y: number, z: number) { if (suffix === "pelvis") pelvisPos = [x, y, z]; return rec; }
    };
    return rec;
  });
  const r = (s: string): E3 => rot.get(s) ?? ZERO;
  return {
    pelvisOffsetY: pelvisPos[1], pelvisOffsetZ: pelvisPos[2],
    pelvis: r("pelvis"), chest: r("chest"), head: r("head"),
    armL: r("arm-l"), forearmL: r("forearm-l"), armR: r("arm-r"), forearmR: r("forearm-r"),
    legL: r("leg-l"), calfL: r("calf-l"), bootL: r("boot-l"),
    legR: r("leg-r"), calfR: r("calf-r"), bootR: r("boot-r")
  };
}

/* ---- text-to-motion animation (fal.ai hunyuan-motion, tools/idol/motion-specs/aura-fc-3d.json -> motion.generated.ts) ---- */

type FcRequest = HumanoidMotionRequest<MotionClipName>;
const C = MOTION_CLIPS;

/** Sim fraction of a kick swing at which the boot meets the ball (sim.ts KICK_CONTACT_FRAC). */
export const KICK_CONTACT_FRAC = 0.74;
/** Side the generated keeper dive travels to (measured at conversion: + = the body's left). */
export const DIVE_CLIP_SIDE: "left" | "right" = Number(C.KeeperDive.meta?.travelX ?? 1) >= 0 ? "left" : "right";

export interface FcMotionState {
  /** Clip and phase from locomotion.ts athleteAnimation (the same state the procedural rig plays). */
  readonly clip: string;
  readonly phase: number;
  readonly duration: number;
  /** Metres travelled (gait / GAIT_PER_METRE, or the referee's patrol distance) for planted-foot locomotion. */
  readonly metres: number;
  readonly isKeeper?: boolean;
  readonly diveDir?: number;
  readonly yaw?: number;
  readonly celebrateKind?: number;
  readonly celebrateT?: number;
  /** App time (s) for free-running idles (desynchronised per athlete by the caller). */
  readonly now: number;
  /** Walk with the referee's clip instead of the players'. */
  readonly referee?: boolean;
}

/**
 * Which generated clip an FC athlete plays for its sim state. Every state is generated motion: idle / keeper ready,
 * walk, run, sprint (distance-locked), kicks (the boot meets the ball on the sim's contact frame), keeper dives (mirrored
 * to the dive side), slide tackle, and the four celebrations (knee slide, airplane spin, leap, hands-heart).
 */
export function fcMotionRequest(m: FcMotionState, bodyHipHeight: number): FcRequest {
  const u = m.duration > 0 ? m.phase / m.duration : 0;
  const celebrating = (m.celebrateT ?? 0) > 0.2;
  const walk: MotionClipName = m.referee ? "RefWalk" : "Walk";
  switch (m.clip) {
    case "Walk_Loop": return { clip: walk, time: humanoidLocomotionTime(C[walk], m.metres, bodyHipHeight) };
    case "Run": return { clip: "Run", time: humanoidLocomotionTime(C.Run, m.metres, bodyHipHeight) };
    case "Sprint_Loop": return { clip: "Sprint", time: humanoidLocomotionTime(C.Sprint, m.metres, bodyHipHeight) };
    case "KickTap": case "KickPass": case "KickShot":
      return { clip: "Kick", time: humanoidEventTime(C.Kick, u, KICK_CONTACT_FRAC, "footRPeakTime"), loop: false, fade: 0.08 };
    case "Jump_Loop": {
      if (m.isKeeper && !celebrating) {
        // procedural roll sign: dir * facing > 0 tilts toward the body's right (-X)
        const dir = m.diveDir && m.diveDir !== 0 ? Math.sign(m.diveDir) : 1;
        const facing = Math.cos(m.yaw ?? 0) >= 0 ? 1 : -1;
        const want = dir * facing > 0 ? "right" : "left";
        return { clip: "KeeperDive", time: Math.max(0, Math.min(1, u)) * C.KeeperDive.duration * 0.85, loop: false, mirror: want !== DIVE_CLIP_SIDE, fade: 0.06 };
      }
      return m.celebrateKind === 1 ? { clip: "Airplane", rate: 1 } : { clip: "Leap", rate: 1 };
    }
    case "Attack":
      if (celebrating && m.celebrateKind === 0) return { clip: "KneeSlide", rate: 1, loop: false, fade: 0.2 };
      return { clip: "SlideTackle", time: Math.max(0, Math.min(1, u)) * C.SlideTackle.duration * 0.8, loop: false, fade: 0.08 };
    case "Ready":
      if (celebrating && m.celebrateKind === 3) return { clip: "HandsHeart", rate: 1 };
      if (m.isKeeper) return { clip: "KeeperIdle", time: m.now % C.KeeperIdle.duration };
      return { clip: "Idle", time: m.now % C.Idle.duration };
    default:
      return { clip: "Idle", time: m.now % C.Idle.duration };
  }
}

const animators = new WeakMap<object, { anim: HumanoidAnimator<MotionClipName>; lastT: number }>();
function animatorFor(handle: object, t: number) {
  let st = animators.get(handle);
  if (!st) { st = { anim: createHumanoidAnimator(MOTION_CLIPS), lastT: t }; animators.set(handle, st); }
  const dt = t - st.lastT;
  st.lastT = t;
  return { anim: st.anim, dt };
}

/**
 * Pose a mounted Idol body from generated motion for this sim state; returns false (parking the body) while its
 * skeleton is loading. `t` is app time in seconds: the animator advances by the real frame time between calls.
 */
export function animateIdolBody(handle: any, key: IdolBodyKey, m: FcMotionState, scale: number, t: number): boolean {
  const driver = idolDriver(key);
  if (!driver || !handle) {
    handle?.setScale?.([1e-4, 1e-4, 1e-4]);
    return false;
  }
  const { anim, dt } = animatorFor(handle, t);
  const pose = anim.update(dt, fcMotionRequest(m, driver.map.hipHeight * scale));
  handle.setScale?.([scale, scale, scale]);
  handle.setAnimationPose?.(driver.pose(pose));
  return true;
}

/** Fan clip -> generated clip: idle sway and clap, cheer with both hands up, fist pump. */
export function fanMotionRequest(clip: "idle" | "cheer" | "pump", t: number, index: number): FcRequest {
  const c: MotionClipName = clip === "idle" ? "FanIdle" : clip === "cheer" ? "FanCheer" : "FanPump";
  return { clip: c, time: (t + index * 0.83) % C[c].duration, fade: 0.3 };
}

/** Drive one fan body from generated motion (same parking rule as animateIdolBody). */
export function animateIdolFan(handle: any, key: IdolBodyKey, clip: "idle" | "cheer" | "pump", t: number, index: number, scale: number): boolean {
  const driver = idolDriver(key);
  if (!driver || !handle) { handle?.setScale?.([1e-4, 1e-4, 1e-4]); return false; }
  const { anim, dt } = animatorFor(handle, t);
  handle.setScale?.([scale, scale, scale]);
  handle.setAnimationPose?.(driver.pose(anim.update(dt, fanMotionRequest(clip, t, index))));
  return true;
}

/** Pose a mounted Idol body; returns false (and parks the body at a tiny scale) while its skeleton is still loading. */
export function driveIdolBody(handle: any, key: IdolBodyKey, pose: FootballerJointPose, scale: number): boolean {
  const driver = idolDriver(key);
  if (!driver) {
    handle?.setScale?.([1e-4, 1e-4, 1e-4]);
    return false;
  }
  handle?.setScale?.([scale, scale, scale]);
  handle?.setAnimationPose?.(driver.pose(footballerHumanoidPose(pose)));
  return true;
}

/* ---- Idol set pieces ---- */

/** Match ball: Idol GLB grounded at its lowest point, the same pivot the procedural ball used (centre at y = r). */
export function idolMatchBallNode(name: string, position: readonly [number, number, number], castShadow = true) {
  return model(assets.fcIdolBall, { name, position: [...position] as [number, number, number], castShadow, receiveShadow: true, scaleMode: "world" });
}

/** Technical-area dugout (open side +Z, 4.66 m wide), placed like the procedural batch. */
export function idolDugoutNodes(placements: readonly { readonly pos: readonly [number, number, number]; readonly rotY: number }[]) {
  return placements.map((p, i) => model(assets.fcIdolDugout, {
    name: `fc-idol-dugout-${i}`, position: [...p.pos] as [number, number, number], rotation: [0, p.rotY, 0], castShadow: true, receiveShadow: true, scaleMode: "world"
  }));
}

export function idolCraneNodes(placements: readonly { readonly pos: readonly [number, number, number]; readonly yaw: number }[]) {
  return placements.map((p, i) => model(assets.fcIdolCrane, {
    name: `fc-idol-crane-${i}`, position: [...p.pos] as [number, number, number], rotation: [0, p.yaw, 0], castShadow: false, receiveShadow: true, scaleMode: "world"
  }));
}

export function idolTrophyNode(position: readonly [number, number, number], rotY: number) {
  return model(assets.fcIdolTrophy, { name: "fc-trophy-case", position: [...position] as [number, number, number], rotation: [0, rotY, 0], castShadow: false, receiveShadow: true, scaleMode: "world" });
}
