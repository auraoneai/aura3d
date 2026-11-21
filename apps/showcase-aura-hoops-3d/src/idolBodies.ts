// Aura Hoops 3D — Idol image-to-3D athlete bodies (Nov 2026 "Idol wow pass").
//
// Every streetballer renders as a rigged Idol GLB (speridlabs/idol/max, one generation per kit colour, unbranded;
// tools/idol/specs/aura-hoops-3d.json). The bones are driven each frame from the SAME stateless 14-joint pose the
// procedural rig uses (`computeHoopsAthleteJointPose`, which also keeps returning the palm / foot / head FK the
// dribble, ball-hold and head-look code reads), through the shared humanoid driver — so gameplay animation is unchanged
// and only the body that renders it is new. `?idol=off` mounts the procedural articulated athletes instead.
//
// Kits are dynamic (8 squads, Player Studio fits, the light/dark alternates of rules.teamKits), so each side wears the
// generated kit whose jersey colour is nearest in RGB: orange, gold, cyan (also the aqua squad), green, violet, red,
// cream and charcoal (the dark HOME_ALT_JERSEY #22262e). The team rings / markers keep the exact squad colour.

import { game, model } from "@aura3d/engine";
import { assets } from "./aura-assets.route";
import { BALL_CART, SCORER_TABLE } from "./courtObstacles";
import {
  createHumanoidAnimator,
  eulerZYX,
  humanoidAirTime,
  humanoidEventTime,
  humanoidLocomotionRate,
  loadIdolHumanoid,
  type HumanoidAnimator,
  type HumanoidDriver,
  type HumanoidMotionRequest,
  type HumanoidPoseInput
} from "@aura3d/engine/animation";
import { MOTION_CLIPS, type MotionClipName } from "./motion.generated";
import {
  HOOPS_BIG_HEIGHT,
  HOOPS_GUARD_HEIGHT,
  type HoopsAthletePoseResult
} from "./art/proceduralModels";

/** Kit colour of each generated body (the `size.height` it was normalised to is 1.92 m, the Big ones 1.99 m). */
export const IDOL_KITS = [
  { key: "hoopsIdolOrange", color: "#ff7a1a", big: "hoopsIdolOrangeBig" },
  { key: "hoopsIdolGold", color: "#ffd257" },
  { key: "hoopsIdolCyan", color: "#39d7ff" },
  { key: "hoopsIdolGreen", color: "#66e37f" },
  { key: "hoopsIdolViolet", color: "#e26bff", big: "hoopsIdolVioletBig" },
  { key: "hoopsIdolRed", color: "#ff3b5c" },
  { key: "hoopsIdolCream", color: "#f2f0e2" },
  { key: "hoopsIdolCharcoal", color: "#22262e" }
] as const;

export type IdolBodyKey = (typeof IDOL_KITS)[number]["key"] | "hoopsIdolOrangeBig" | "hoopsIdolVioletBig";

/**
 * Literal references so `assets typegen --route apps/showcase-aura-hoops-3d` puts every Idol body into the route
 * manifest (the root src/aura-assets.ts is a 2.6 MB shared catalogue the route must not import).
 */
export const IDOL_BODY_ASSETS = {
  hoopsIdolOrange: assets.hoopsIdolOrange,
  hoopsIdolOrangeBig: assets.hoopsIdolOrangeBig,
  hoopsIdolGold: assets.hoopsIdolGold,
  hoopsIdolCyan: assets.hoopsIdolCyan,
  hoopsIdolGreen: assets.hoopsIdolGreen,
  hoopsIdolViolet: assets.hoopsIdolViolet,
  hoopsIdolVioletBig: assets.hoopsIdolVioletBig,
  hoopsIdolRed: assets.hoopsIdolRed,
  hoopsIdolCream: assets.hoopsIdolCream,
  hoopsIdolCharcoal: assets.hoopsIdolCharcoal
} as const;

const BIG_KEYS: ReadonlySet<IdolBodyKey> = new Set(["hoopsIdolOrangeBig", "hoopsIdolVioletBig"]);
/** Height each Idol GLB was normalised to. */
export function idolBodyHeight(key: IdolBodyKey): number {
  return BIG_KEYS.has(key) ? 1.99 : 1.92;
}

/** Idol bodies are on unless the URL carries `?idol=off`. */
export function idolBodiesEnabled(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("idol") !== "off";
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** The generated kit nearest the jersey colour; big athletes (ids ending 1, 2, 4) take the Big body when it has one. */
export function idolKeyForKit(jersey: string, big: boolean): IdolBodyKey {
  const [r, g, b] = rgb(jersey);
  let best: (typeof IDOL_KITS)[number] = IDOL_KITS[0];
  let bestD = Infinity;
  for (const kit of IDOL_KITS) {
    const [kr, kg, kb] = rgb(kit.color);
    const d = (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2;
    if (d < bestD) { bestD = d; best = kit; }
  }
  return big && "big" in best ? best.big : best.key;
}

/**
 * Uniform node scale: the procedural rig's height for this athlete over the GLB's admitted T-pose height (manifest
 * bounds; falls back to the spec height), so it holds for scaled and for unscaled (generator `sceneScale`) rigged GLBs.
 */
export function idolBodyScale(key: IdolBodyKey, big: boolean): number {
  const h = (IDOL_BODY_ASSETS[key] as { bounds?: readonly number[] }).bounds?.[1] ?? idolBodyHeight(key);
  return (big ? HOOPS_BIG_HEIGHT : HOOPS_GUARD_HEIGHT) / (h > 0 ? h : idolBodyHeight(key));
}

/** The athlete root as an Idol model node, named like the procedural root group (`p0`, `a3`, ...). */
export function idolAthleteNode(id: string, key: IdolBodyKey, scale: number, position: readonly [number, number, number]) {
  // scaleMode "world": the GLB is authored in metres; the default normalises every model to a 1 m box.
  return model(IDOL_BODY_ASSETS[key], { name: id, position: [...position] as [number, number, number], scale: [scale, scale, scale], castShadow: true, receiveShadow: true, scaleMode: "world" })
    .runtime(game.runtimeNode(id));
}

/* ---- drivers ---- */

const drivers = new Map<IdolBodyKey, HumanoidDriver>();
const pending = new Set<IdolBodyKey>();

export function idolDriver(key: IdolBodyKey): HumanoidDriver | undefined {
  const ready = drivers.get(key);
  if (ready || pending.has(key)) return ready;
  pending.add(key);
  loadIdolHumanoid(IDOL_BODY_ASSETS[key].url)
    .then((d) => { drivers.set(key, d); })
    .catch((e: unknown) => { pending.delete(key); console.warn(`[hoops] idol skeleton ${key}`, e); });
  return undefined;
}

/** Load the given bodies' skeleton drivers up front (boot awaits this before warmPrograms, so no body starts parked). */
export function preloadIdolDrivers(keys: Iterable<IdolBodyKey>): Promise<void> {
  return Promise.all([...new Set(keys)].map((key) => loadIdolHumanoid(IDOL_BODY_ASSETS[key].url).then((d) => { drivers.set(key, d); }, (e: unknown) => {
    console.warn(`[hoops] idol skeleton ${key}`, e);
  }))).then(() => undefined);
}

const eul = (v: readonly [number, number, number]) => eulerZYX(v[0], v[1], v[2]);

/** The procedural 14-joint `"ZYX"` pose (rest: arms down, facing +Z, left = +X) as a canonical humanoid pose. */
export function hoopsHumanoidPose(p: Pick<HoopsAthletePoseResult, "hipsPos" | "rotations">, big: boolean): HumanoidPoseInput {
  const r = p.rotations;
  const hipsBindY = 0.96 * (big ? HOOPS_BIG_HEIGHT : HOOPS_GUARD_HEIGHT) / 1.748;
  return {
    rotations: {
      hips: eul(r.hips), spine: eul(r.spine), chest: eul(r.chest), head: eul(r.head),
      leftUpperArm: eul(r["arm-l"]), leftLowerArm: eul(r["forearm-l"]),
      rightUpperArm: eul(r["arm-r"]), rightLowerArm: eul(r["forearm-r"]),
      leftUpperLeg: eul(r["leg-l"]), leftLowerLeg: eul(r["calf-l"]), leftFoot: eul(r["shoe-l"]),
      rightUpperLeg: eul(r["leg-r"]), rightLowerLeg: eul(r["calf-r"]), rightFoot: eul(r["shoe-r"])
    },
    hipsOffset: [p.hipsPos[0] / hipsBindY, (p.hipsPos[1] - hipsBindY) / hipsBindY, p.hipsPos[2] / hipsBindY]
  };
}

export interface IdolPalms {
  /** World-space palm centres of the drawn Idol hands (anchor the ball here, not on the procedural palm). */
  readonly left: [number, number, number];
  readonly right: [number, number, number];
}

/** Model-space point -> world, for a body node at `at` with yaw `yaw` (engine Y rotation) and uniform scale `s`. */
export function idolModelToWorld(p: readonly [number, number, number], at: readonly [number, number, number], yaw: number, s: number): [number, number, number] {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  return [at[0] + s * (c * p[0] + n * p[2]), at[1] + s * p[1], at[2] + s * (-n * p[0] + c * p[2])];
}

/** Drawn centre-to-centre spacing for Idol bodies (the sim keeps its own 0.55 m shoulder-width separation). */
export const VISUAL_SEPARATION = 0.8;

/**
 * Render-only spacing: Idol bodies are broader than the procedural rigs the sim's 0.55 m separation was tuned for, so
 * crowded players are drawn pushed apart to `min` (pairwise, a few passes). Pinned bodies (the ball handler, whose palm
 * carries the ball; a dunker) do not move. Returns per-body [dx, dz] draw offsets; the inputs (sim positions) are untouched.
 */
export function visualSeparation(bodies: readonly { readonly x: number; readonly z: number; readonly pinned?: boolean }[], min = VISUAL_SEPARATION, passes = 4): [number, number][] {
  const p = bodies.map((b) => ({ x: b.x, z: b.z, pinned: Boolean(b.pinned) }));
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      const a = p[i]!, b = p[j]!;
      if (a.pinned && b.pinned) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const push = min - d, ux = dx / d, uz = dz / d;
      const wa = a.pinned ? 0 : b.pinned ? 1 : 0.5, wb = 1 - wa;
      a.x -= ux * push * wa; a.z -= uz * push * wa;
      b.x += ux * push * wb; b.z += uz * push * wb;
      moved = true;
    }
    if (!moved) break;
  }
  return p.map((q, i) => [q.x - bodies[i]!.x, q.z - bodies[i]!.z]);
}

/** World point -> the body's model space (inverse of idolModelToWorld). */
export function idolWorldToModel(w: readonly [number, number, number], at: readonly [number, number, number], yaw: number, s: number): [number, number, number] {
  const c = Math.cos(yaw), n = Math.sin(yaw), dx = (w[0] - at[0]) / s, dz = (w[2] - at[2]) / s;
  return [c * dx - n * dz, (w[1] - at[1]) / s, n * dx + c * dz];
}

/**
 * Pose a mounted Idol athlete and return its drawn palms in world space; parks it at a tiny scale (returns undefined)
 * while its skeleton is still loading. `at`/`yaw` are the node transform main.ts set this frame. `rightPalmTarget`
 * (world; the procedural rig's palm while it holds or dribbles the ball) bends the Idol arm onto it with two-bone IK,
 * so the ball keeps its procedural line and the drawn hand meets it.
 */
export interface HoopsMotion {
  /** Real app time in seconds (performance.now() / 1000): the animator advances by the frame time between calls. */
  readonly t: number;
  /** The game clip name (Ready, Crouch_Idle_Loop, Walk_Loop, Run, Sprint_Loop, Load, Shoot, Release, Attack, Contest, Jump_Loop, ...). */
  readonly clip: string;
  readonly vx: number;
  readonly vz: number;
  /** A timed move is playing (shot, release, crossover, dunk, jump, contest, stumble). */
  readonly action: boolean;
  /** Holding or dribbling the ball (the right palm is IK-pinned to the ball line on top of the clip). */
  readonly ballArms: boolean;
  /** Airborne state (main.ts jump physics): height, vertical speed and gravity sync generated jumps to the sim's arc. */
  readonly y?: number;
  readonly vy?: number;
  readonly gravity?: number;
  readonly jumping?: boolean;
  /** Dunk progress 0..1 (dunkT / 0.62). */
  readonly dunkU?: number;
  readonly shooting?: boolean;
  /** Seconds left on the current timed move (actionUntil - game time), for the 0.42 s crossover. */
  readonly actionLeft?: number;
  /** Seconds since this athlete threw a pass (render-side bookkeeping; undefined when none is recent). */
  readonly passAge?: number;
}

type HoopsRequest = HumanoidMotionRequest<MotionClipName>;
const C = MOTION_CLIPS;
const CROSSOVER_SECONDS = 0.42;
/** The generated shuffle travels toward the body's left when travelX > 0; the other side is its mirror. */
const SHUFFLE_SIDE: "left" | "right" = Number(C.ShuffleLeft.meta?.travelX ?? 1) >= 0 ? "left" : "right";
const takeoffOf = (c: MotionClipName) => Math.max(0, Number(C[c].meta?.lowTime ?? 0) + 0.1);

/**
 * Generated clip for a streetballer's state — every state is text-to-motion: athletic idle, walk / run / sprint and the
 * defensive shuffle (rate matched to ground speed), standing and moving dribbles, crossover (over the 0.42 s move),
 * jump shot / block / rebound jumps (synced to the sim's ballistic arc), set shot, dunk (apex at mid-dunk) and the chest
 * pass. The right palm is IK-pinned to the ball line on top whenever the athlete has the ball.
 */
export function hoopsMotionRequest(m: HoopsMotion, yaw: number, hipHeight: number): HoopsRequest {
  const g = m.gravity ?? -10.4;
  const speed = Math.hypot(m.vx, m.vz);
  const rate = (c: MotionClipName, lo: number, hi: number) => Math.max(lo, Math.min(hi, humanoidLocomotionRate(C[c], speed, hipHeight)));
  if (m.dunkU !== undefined && m.dunkU > 0) return { clip: "Dunk", time: humanoidEventTime(C.Dunk, m.dunkU, 0.5, "apexTime"), loop: false, fade: 0.08 };
  if (m.jumping) {
    const clip: MotionClipName = m.shooting ? "JumpShot" : m.clip === "Contest" ? "Block" : "Rebound";
    return { clip, time: humanoidAirTime(C[clip], m.y ?? 0, m.vy ?? 0, g, takeoffOf(clip)), loop: false, fade: 0.08 };
  }
  if (m.shooting || m.clip === "Load" || m.clip === "Shoot" || m.clip === "Release" || m.clip === "FollowThrough") return { clip: "SetShot", rate: 1.1, loop: false, fade: 0.1 };
  if (m.clip === "Attack" && m.action) {
    const u = 1 - Math.max(0, Math.min(1, (m.actionLeft ?? 0) / CROSSOVER_SECONDS));
    return { clip: "Crossover", time: 0.25 + u * (C.Crossover.duration - 0.45), loop: false, fade: 0.06 };
  }
  if (m.passAge !== undefined && m.passAge < C.ChestPass.duration / 1.3) return { clip: "ChestPass", rate: 1.3, loop: false, fade: 0.08 };
  const fwd = m.vx * Math.sin(yaw) + m.vz * Math.cos(yaw);
  const side = m.vx * Math.cos(yaw) - m.vz * Math.sin(yaw); // + = toward the body's left (+X)
  if (speed > 0.35 && speed < 3.2 && Math.abs(side) > Math.abs(fwd) * 1.2) {
    return { clip: "ShuffleLeft", rate: rate("ShuffleLeft", 0.5, 2.2), mirror: (side > 0 ? "left" : "right") !== SHUFFLE_SIDE };
  }
  if (m.ballArms) return speed > 0.35 ? { clip: "DribbleMove", rate: rate("DribbleMove", 0.5, 1.8) } : { clip: "DribbleStand", rate: 1 };
  if (m.clip === "Sprint_Loop") return { clip: "Sprint", rate: rate("Sprint", 0.6, 1.8) };
  if (m.clip === "Run") return { clip: "Run", rate: rate("Run", 0.6, 1.8) };
  if (m.clip === "Walk_Loop") return { clip: "Walk", rate: rate("Walk", 0.5, 2.5) };
  return { clip: "Idle", rate: 1 };
}

const animators = new WeakMap<object, { anim: HumanoidAnimator<MotionClipName>; lastT: number }>();

export function driveIdolAthlete(
  handle: any, key: IdolBodyKey, pose: Pick<HoopsAthletePoseResult, "hipsPos" | "rotations">, big: boolean,
  at: readonly [number, number, number], yaw: number, rightPalmTarget?: readonly [number, number, number], motion?: HoopsMotion
): IdolPalms | undefined {
  const driver = idolDriver(key);
  if (!driver) {
    handle?.setScale?.([1e-4, 1e-4, 1e-4]);
    return undefined;
  }
  const s = idolBodyScale(key, big);
  let base = hoopsHumanoidPose(pose, big);
  if (motion && handle) {
    let st = animators.get(handle);
    if (!st) { st = { anim: createHumanoidAnimator(MOTION_CLIPS), lastT: motion.t }; animators.set(handle, st); }
    const dt = motion.t - st.lastT;
    st.lastT = motion.t;
    base = st.anim.update(dt, hoopsMotionRequest(motion, yaw, driver.map.hipHeight * s));
  }
  const input = rightPalmTarget ? { ...base, handTargets: { right: idolWorldToModel(rightPalmTarget, at, yaw, s) } } : base;
  handle?.setScale?.([s, s, s]);
  handle?.setAnimationPose?.(driver.pose(input));
  const palms = driver.palmPoints(input);
  return { left: idolModelToWorld(palms.left, at, yaw, s), right: idolModelToWorld(palms.right, at, yaw, s) };
}

/* ---- Idol courtside set pieces (same placements as the procedural pieces they replace) ---- */

type V3 = [number, number, number];

/** Chrome ball rack (procedural buildTubularBallCartNode: [-8.9, 0, 9.4], yaw 0.5, 1.3 m wide). */
export function idolBallCartNode() {
  return model(assets.hoopsIdolBallCart, { name: "idol-ball-cart", position: [BALL_CART.x, 0, BALL_CART.z], rotation: [0, BALL_CART.yaw, 0], castShadow: false, receiveShadow: true, scaleMode: "world" });
}

/** Championship trophy on the 0.78 m scorer's table (runtime id "trophy-case", as procedural). */
export function idolTrophyNode() {
  return model(assets.hoopsIdolTrophy, { name: "trophy-case", position: [SCORER_TABLE.x, SCORER_TABLE.height, SCORER_TABLE.z], rotation: [0, SCORER_TABLE.yaw, 0], castShadow: false, receiveShadow: true, scaleMode: "world" })
    .runtime(game.runtimeNode("trophy-case"));
}
