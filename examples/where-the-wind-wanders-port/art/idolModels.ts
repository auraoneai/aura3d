/**
 * Idol wow pass (render layer only): the Bellkeeper, the three villagers, the cottages, windmill tower and sails,
 * bell frame and bell, wayside shrine, packhorse bridge, ancient oak, rowboat and lantern posts are high-detail Idol
 * GLBs (handcrafted storybook miniatures in gouache colours). Placement, sizes and pivots match the procedural models
 * they replace (measured from the procedural builders); the simulation never reads any of it. `?idol=0` restores the
 * procedural assemblies.
 *
 * The Bellkeeper is a rigged Idol GLB posed every frame from the same `BellkeeperRigPose` that drove the procedural
 * joint groups (hips height, torso, head gaze, arm swing and the two-bone leg IK whose planted soles match the stride),
 * written through the runtime handle's live pose (`setAnimationPose`, object-form local rotations); the bell-staff stays a procedural part carried in the
 * right hand of the posed skeleton.
 */
import { group, instances, model, type AuraAssetRef, type AuraNodeBuilder, type AuraSceneNode, type AuraTransformSpec } from "@aura3d/engine";
import { IDOL_ASSETS } from "../../../apps/showcase-where-the-wind-wanders-port/src/idol-assets";
import { createIdolRigDriver, qFromEngineEuler, qFromTo, qMul, qRot, qToEngineEuler, qX, qZ, type IdolRigData, type IdolRigDriver, type IdolSegmentPose, type Quat, type V3 } from "./idolRig";
import { IDOL_RIGS } from "./idolRigData";
import { terrainHeight } from "../terrain";
import type { BellkeeperMotionFrame } from "./idolMotion";

/** `?idol=0` keeps every procedural model (comparison captures). */
export const IDOL_MODELS = !(typeof location !== "undefined" && new URLSearchParams(location.search).get("idol") === "0");

type ModelKey = string;
type ModelRef = AuraAssetRef<"model">;
/** Admitted Idol model by key, or undefined (that piece then stays procedural). */
export const idolAsset = (key: string): ModelRef | undefined => IDOL_ASSETS[key];
const boundsOf = (key: ModelKey): readonly [number, number, number] => {
  const b = (idolAsset(key) as { bounds?: readonly number[] } | undefined)?.bounds;
  return b && b.length >= 3 ? [b[0]!, b[1]!, b[2]!] : [1, 1, 1];
};
type P3 = readonly [number, number, number];
const asNode = <T>(b: T): AuraNodeBuilder<AuraSceneNode> => b as unknown as AuraNodeBuilder<AuraSceneNode>;

/**
 * Grounding (owner QA: Idol models are grounded at their lowest vertex, so a base set from the terrain under the centre
 * floats on a slope): share of each model's half-extents that actually meets the ground — walls inside the eaves, a
 * trunk inside the crown, feet inside the coat — and how far the base sinks under the lowest ground there.
 */
export const IDOL_FOOTPRINT: Readonly<Record<string, number>> = {
  bkCottageA: 0.7, bkCottageB: 0.7, bkWindmill: 0.45, bkShrine: 0.6, bkBelfry: 0.6, bkOak: 0.12, bkLantern: 0.25,
  bkVillagerShepherdess: 0.3, bkVillagerMiller: 0.3, bkVillagerKeeper: 0.3
};
export const IDOL_GROUND_SINK = 0.15;
/** Footprint sample points (centre, edge midpoints and corners of a yawed half-extent box) in world x/z. */
export function footprintPoints(x: number, z: number, hx: number, hz: number, yaw: number): [number, number][] {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([u, v]) => {
    const lx = u * hx, lz = v * hz;
    return [x + lx * c + lz * sn, z - lx * sn + lz * c];
  });
}
/** Lowest terrain under the ground-touching footprint of an Idol model with this world plan size (x, z) and yaw. */
export function idolFootprintGround(key: ModelKey, x: number, z: number, planX: number, planZ: number, yaw: number): number {
  const f = IDOL_FOOTPRINT[key] ?? 0.5;
  return Math.min(...footprintPoints(x, z, (planX / 2) * f, (planZ / 2) * f, yaw).map(([px, pz]) => terrainHeight(px, pz)));
}

/** A static Idol model scaled so `axis` (0 x, 1 y, 2 z) spans `size` metres, base on the node origin. */
export function idolStaticNode(key: ModelKey, opts: {
  readonly name: string; readonly position: P3; readonly yaw?: number; readonly axis: 0 | 1 | 2; readonly size: number;
  readonly castShadow: boolean; readonly receiveShadow: boolean; readonly id?: string; readonly lift?: number;
  /** Extra plan (x/z) scale to hold a wider Idol model to the procedural footprint. */ readonly planScale?: number;
  /** Stand on the lowest terrain under the footprint (minus the sink) instead of `position[1]`. */ readonly ground?: boolean;
  /** With `ground`: stretch the height so the top stays where it was (the belfry's yoke carries the bell). */ readonly keepTop?: boolean;
}): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset(key);
  if (!ref) return null;
  const b = boundsOf(key);
  const k = opts.size / b[opts.axis];
  const ps = k * (opts.planScale ?? 1);
  const y = opts.ground
    ? idolFootprintGround(key, opts.position[0], opts.position[2], b[0] * ps, b[2] * ps, opts.yaw ?? 0) - IDOL_GROUND_SINK
    : opts.position[1];
  const node = model(ref, {
    name: opts.name,
    scaleMode: "world",
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow,
    position: [opts.position[0], y + (opts.lift ?? 0), opts.position[2]],
    rotation: [0, opts.yaw ?? 0, 0],
    scale: [ps, opts.ground && opts.keepTop ? k * (b[1] * k + opts.position[1] - y) / (b[1] * k) : k, ps]
  });
  return asNode(opts.id ? node.runtime({ id: opts.id }) : node);
}

/** Measured procedural sizes (m) each Idol model is fitted to. */
export const IDOL_FIT = {
  cottageWidth: 8.38,
  windmillHeight: 18.78,
  sailsSpan: 22.01,
  belfryHeight: 5.13,
  bellHeight: 1.16,
  shrineHeight: 2.76,
  bridgeLength: 6.4,
  oakHeight: 13.1,
  boatLength: 5.67,
  boatKeel: -0.22,
  villagerHeight: [1.95, 1.94, 1.97] as const,
  lanternHeight: 2.5
} as const;

const VILLAGERS = ["bkVillagerShepherdess", "bkVillagerMiller", "bkVillagerKeeper"] as const;
export function idolVillagerNode(name: string, position: P3, yaw: number, variant: number, castShadow: boolean, receiveShadow: boolean): AuraNodeBuilder<AuraSceneNode> | null {
  const v = ((variant % 3) + 3) % 3;
  return idolStaticNode(VILLAGERS[v]!, { name, position, yaw, axis: 1, size: IDOL_FIT.villagerHeight[v]!, castShadow, receiveShadow, ground: true });
}

export function idolCottageNode(name: string, position: P3, yaw: number, scale: number, variant: number, castShadow: boolean, receiveShadow: boolean): AuraNodeBuilder<AuraSceneNode> | null {
  const key = variant % 2 === 0 && idolAsset("bkCottageA") ? "bkCottageA" : idolAsset("bkCottageB") ? "bkCottageB" : "bkCottageA";
  return idolStaticNode(key, { name, position, yaw, axis: 0, size: IDOL_FIT.cottageWidth * scale, castShadow, receiveShadow, ground: true });
}

/**
 * Windmill tower: the Idol tower (18.78 m tall as normalised) is slimmed to the procedural tower's footprint (~10 m
 * across instead of 15) and scaled in height so its windshaft tip, measured at (-0.57, 16.1, 5.04) on the normalised
 * model, lands on the sails hub the world spins (`scenery.ts` windmillHub: base + (0, 14.7, 3.15)).
 */
export function idolWindmillNode(name: string, position: P3, castShadow: boolean, receiveShadow: boolean): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset("bkWindmill");
  if (!ref) return null;
  const b = boundsOf("bkWindmill");
  const k = IDOL_FIT.windmillHeight / b[1];
  const sxz = 0.72 * k;
  const shaft: V3 = [-0.57 * 0.72, 16.1, 5.04 * 0.72];
  const at: [number, number] = [position[0] - shaft[0], position[2] + 3.15 - shaft[2] - 0.25];
  // the tower stands on the lowest ground under its base (it sits by the cliff edge) and grows so its windshaft still
  // ends on the sails hub (base + 14.7) the world spins
  const base = Math.min(position[1], idolFootprintGround("bkWindmill", at[0], at[1], b[0] * sxz, b[2] * sxz, 0) - IDOL_GROUND_SINK);
  const sy = (position[1] + 14.7 - base) / 16.1;
  return asNode(model(ref, {
    name, scaleMode: "world", castShadow, receiveShadow,
    position: [at[0], base, at[1]],
    scale: [sxz, sy, sxz]
  }));
}

/**
 * Windmill sails, measured on the normalised GLB: the sail plane's centre (the hub) and its normal toward the hub cap
 * (the reconstruction leans the cross back ~49 degrees). The model is turned so that normal faces +Z (out of the tower's
 * cap) and centred on the `sails` node, which the world spins about its local Z at the hub.
 */
const SAILS_FRAME = { centre: [-0.005, 9.996, 0.036] as V3, normal: [0.0006, 0.7497, 0.6617] as V3 };
export function idolSailsNode(id: string, hub: P3, castShadow: boolean, receiveShadow: boolean): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset("bkWindmillSails");
  if (!ref) return null;
  const b = boundsOf("bkWindmillSails");
  const k = IDOL_FIT.sailsSpan / Math.max(b[0], b[1], b[2]);
  const q = qFromTo(SAILS_FRAME.normal, [0, 0, 1]);
  const c = qRot(q, SAILS_FRAME.centre);
  return asNode(group(id, [
    model(ref, { name: `${id}-idol`, scaleMode: "world", castShadow, receiveShadow, position: [-c[0] * k, -c[1] * k, 0.35 - c[2] * k], rotation: qToEngineEuler(q), scale: [k, k, k] })
  ], { position: [hub[0], hub[1], hub[2]] }).runtime({ id }));
}

/** The bell hangs from its yoke at the node origin (the procedural bell spans y -1.01 .. +0.15 about the axle). */
export function idolBellNode(name: string, id: string, position: P3, castShadow: boolean, receiveShadow: boolean): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset("bkBell");
  if (!ref) return null;
  const b = boundsOf("bkBell");
  const k = IDOL_FIT.bellHeight / b[1];
  return asNode(group(name, [
    model(ref, { name: `${name}-idol`, scaleMode: "world", castShadow, receiveShadow, position: [0, -1.01, 0], scale: [k, k, k] })
  ], { position: [position[0], position[1], position[2]] }).runtime({ id }));
}

/** Rowboat: bow +Z, waterline at the node origin (keel 0.22 m under it). */
export function idolBoatNode(name: string, id: string, castShadow: boolean, receiveShadow: boolean): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset("bkBoat");
  if (!ref) return null;
  const b = boundsOf("bkBoat");
  const k = IDOL_FIT.boatLength / b[2];
  return asNode(group(name, [
    model(ref, { name: `${name}-idol`, scaleMode: "world", castShadow, receiveShadow, position: [0, IDOL_FIT.boatKeel, 0], scale: [k, k, k] })
  ]).runtime({ id }));
}

export function idolLanternPosts(transforms: readonly AuraTransformSpec[], receiveShadow: boolean): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset("bkLantern");
  if (!ref) return null;
  const b = boundsOf("bkLantern");
  const k = IDOL_FIT.lanternHeight / b[1];
  // posts on the ground stand on the lowest terrain under the post foot; the jetty post stands on the deck (above ground)
  const grounded = transforms.map((t) => {
    const p = (t.position ?? [0, 0, 0]) as readonly number[];
    const g = terrainHeight(p[0]!, p[2]!);
    if (p[1]! > g + 0.3) return t;
    const yaw = ((t.rotation ?? [0, 0, 0]) as readonly number[])[1] ?? 0;
    return { ...t, position: [p[0]!, idolFootprintGround("bkLantern", p[0]!, p[2]!, b[0] * k, b[2] * k, yaw) - 0.08, p[2]!] as [number, number, number] };
  });
  transforms = grounded;
  return asNode(instances.model(ref, {
    name: "village-lantern-posts-idol",
    scaleMode: "world",
    transforms: transforms.map((t) => {
      const s = (t.scale ?? [1, 1, 1]) as readonly number[] | number;
      const sv = typeof s === "number" ? [s, s, s] : s;
      return { ...t, scale: [sv[0]! * k, sv[1]! * k, sv[2]! * k] as [number, number, number] };
    }),
    castShadow: false,
    receiveShadow
  }));
}

/* ------------------------------------------------------------------ the Bellkeeper */

/** Procedural rig numbers the pose sampler works in (`BELLKEEPER_RIG_SPEC`). */
const PROC_HIPS_REST = 1.37;
const PROC_GRIP: V3 = [-0.04, -0.44, 0.24];

/** The minimal pose shape read here (structurally `BellkeeperRigPose`). */
export interface IdolBellkeeperPose {
  readonly hipsPos: readonly number[]; readonly hipsRot: readonly number[]; readonly torsoRot: readonly number[]; readonly headRot: readonly number[];
  readonly leftArmRot: readonly number[]; readonly rightArmRot: readonly number[];
  readonly staffChimeRot: readonly number[]; readonly staffRibbonRot: readonly number[];
  readonly leftLegRot: readonly number[]; readonly leftShinRot: readonly number[]; readonly leftFootRot: readonly number[];
  readonly rightLegRot: readonly number[]; readonly rightShinRot: readonly number[]; readonly rightFootRot: readonly number[];
}

/** Arms hang a little outward of the carved coat; the right forearm reaches forward to the staff grip. */
const ARM_SPLAY = 0.14;
const LEFT_ELBOW = 0.22;
const RIGHT_ELBOW = 0.9;

export function bellkeeperSegments(p: IdolBellkeeperPose): IdolSegmentPose {
  const E = (r: readonly number[]): Quat => qFromEngineEuler(r);
  const hips = E(p.hipsRot);
  const torso = qMul(hips, E(p.torsoRot));
  const head = qMul(torso, E(p.headRot));
  const armL = qMul(torso, qMul(E(p.leftArmRot), qZ(ARM_SPLAY)));
  const armR = qMul(torso, qMul(E(p.rightArmRot), qZ(-ARM_SPLAY)));
  const legL = qMul(hips, E(p.leftLegRot)), shinL = qMul(legL, E(p.leftShinRot)), footL = qMul(shinL, E(p.leftFootRot));
  const legR = qMul(hips, E(p.rightLegRot)), shinR = qMul(legR, E(p.rightShinRot)), footR = qMul(shinR, E(p.rightFootRot));
  return {
    pelvis: hips, body: torso, head,
    armL, foreL: qMul(armL, qX(-LEFT_ELBOW)),
    armR, foreR: qMul(armR, qX(-RIGHT_ELBOW)),
    legL, shinL, footL, legR, shinR, footR
  };
}

let heroDriver: IdolRigDriver | null = null;
const driver = (): IdolRigDriver => (heroDriver ??= createIdolRigDriver((IDOL_RIGS as Record<string, IdolRigData>).bkHero!));

/**
 * The Idol Bellkeeper on Aura3D 5.7.0+ parent-local nested handles:
 * - `group`: the `hero` group the world moves every frame, carrying BOTH the rigged Idol Bellkeeper (`hero-idol`) and
 *   the bell-staff (`hero-staff`, chime and ribbon) as direct children in parent-local space so body, staff and kite
 *   stay locked together with zero matrix lag or world-space sync drift.
 */
export function createIdolBellkeeperNode(opts: {
  readonly name: string; readonly id: string; readonly castShadow: boolean; readonly receiveShadow: boolean;
  /** The procedural staff, chime and ribbon parts in right-arm space (`proceduralModels.ts`). */
  readonly staff: AuraNodeBuilder<AuraSceneNode>; readonly chime: AuraNodeBuilder<AuraSceneNode>; readonly ribbon: AuraNodeBuilder<AuraSceneNode>;
  readonly chimeOffset: V3; readonly ribbonOffset: V3;
}): { readonly group: AuraNodeBuilder<AuraSceneNode>; readonly body: AuraNodeBuilder<AuraSceneNode>; readonly nested: true } | null {
  const ref = idolAsset("bkHero");
  if (!ref || !("bkHero" in IDOL_RIGS)) return null;
  const off = (v: V3): V3 => [v[0] - PROC_GRIP[0], v[1] - PROC_GRIP[1], v[2] - PROC_GRIP[2]];
  const staffGroup = group("hero-staff", [
    group("hero-staff-mesh", [opts.staff], { position: off([0, 0, 0]) }),
    group("hero-staff-chime", [opts.chime], { position: off(opts.chimeOffset) }).runtime({ id: "hero-staff-chime" }),
    group("hero-staff-ribbon", [opts.ribbon], { position: off(opts.ribbonOffset) }).runtime({ id: "hero-staff-ribbon" })
  ]).runtime({ id: "hero-staff" });
  const body = asNode(model(ref, { name: "hero-idol", role: "primaryCharacter", scaleMode: "world", castShadow: opts.castShadow, receiveShadow: opts.receiveShadow }).runtime({ id: "hero-idol" }));
  return {
    group: asNode(group(opts.name, [body, staffGroup]).runtime({ id: opts.id })),
    body,
    nested: true
  };
}

/** World pose of the `hero` group (set by the world every frame) and the body's local hips lift above it. */
const heroWorld = { p: [0, 0, 0] as [number, number, number], r: [0, 0, 0] as [number, number, number], lift: 0, placed: false };
/** The rigged body's resolved world transform (parent `hero` world pose composed with parent-local `[0, lift, 0]`). */
export function idolBellkeeperBodyWorld(): { readonly position: V3; readonly rotation: V3; readonly placed: boolean } {
  const [rx, ry, rz] = heroWorld.r;
  // the engine's Euler (composed as Rz*Ry*Rx in matrixToEulerZYX): up axis column
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const up: V3 = [cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx];
  const l = heroWorld.lift;
  return { position: [heroWorld.p[0] + up[0] * l, heroWorld.p[1] + up[1] * l, heroWorld.p[2] + up[2] * l], rotation: [rx, ry, rz], placed: heroWorld.placed };
}
const writeBody = (h: PoseHandle): void => {
  // 5.7.0 parent-local nested handle: `hero-idol` inherits `hero`'s transform and only carries its local hips lift.
  h.setPosition(0, heroWorld.lift, 0);
  h.setRotation(0, 0, 0);
};
/** Records the `hero` group's world pose and keeps `hero-idol`'s parent-local transform synced. */
export function syncIdolBellkeeperBody(getNode: (id: string) => unknown, position: V3, rotation: V3): void {
  heroWorld.p = [position[0], position[1], position[2]];
  heroWorld.r = [rotation[0], rotation[1], rotation[2]];
  heroWorld.placed = true;
  const h = getNode("hero-idol") as PoseHandle | undefined;
  if (h) writeBody(h);
}

interface PoseHandle {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setAnimationPose?(pose: IdolAnimationPose): unknown;
}

/** Structurally an engine `AnimationPose`: parent-space local rotations in OBJECT form (tuples do not survive the clone). */
export interface IdolAnimationPose {
  readonly bones: Record<string, { readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number } }>;
  readonly mode: "replace";
}
/** Solves the Idol Bellkeeper's live pose from a `BellkeeperRigPose`. */
export function bellkeeperAnimationPose(pose: IdolBellkeeperPose): IdolAnimationPose {
  const d = driver();
  const locals = d.solve(bellkeeperSegments(pose));
  const bones: Record<string, { rotation: { x: number; y: number; z: number; w: number } }> = {};
  d.data.bones.forEach((b, i) => { const q = locals[i]!; bones[b.name] = { rotation: { x: q[0], y: q[1], z: q[2], w: q[3] } }; });
  return { bones, mode: "replace" };
}
let lastHand: V3 | null = null;

/** Hero-root-space position of the staff hand after the last `applyIdolBellkeeperPose` (null before the Idol hero posed). */
export const idolBellkeeperRightHand = (): V3 | null => (lastHand ? [lastHand[0], lastHand[1], lastHand[2]] : null);

/** Poses the Idol Bellkeeper and its staff from a `BellkeeperRigPose`. Returns false when the Idol hero is not mounted. */
export function applyIdolBellkeeperPose(getNode: (id: string) => unknown, pose: IdolBellkeeperPose): boolean {
  const h = getNode("hero-idol") as PoseHandle | undefined;
  if (!h) return false;
  const d = driver();
  const seg = bellkeeperSegments(pose);
  const dy = ((pose.hipsPos[1] ?? PROC_HIPS_REST) - PROC_HIPS_REST) * (d.hipsHeight / PROC_HIPS_REST);
  heroWorld.lift = dy;
  writeBody(h);
  // Live pose through the runtime handle (the engine applies it to the skinned actor every frame).
  h.setAnimationPose?.(bellkeeperAnimationPose(pose));
  const hand = d.jointPosition(d.data.map.armR[3]!);
  lastHand = [hand[0], hand[1] + dy, hand[2]];
  const staff = getNode("hero-staff") as PoseHandle | undefined;
  if (staff) {
    // The staff keeps its procedural arm-space frame: the forearm's swing about the hand, the grip at the node origin.
    const e = qToEngineEuler(seg.armR);
    staff.setPosition(lastHand[0], lastHand[1], lastHand[2]);
    staff.setRotation(e[0], e[1], e[2]);
  }
  const chime = getNode("hero-staff-chime") as PoseHandle | undefined;
  chime?.setRotation(pose.staffChimeRot[0]!, pose.staffChimeRot[1]!, pose.staffChimeRot[2]!);
  const ribbon = getNode("hero-staff-ribbon") as PoseHandle | undefined;
  ribbon?.setRotation(pose.staffRibbonRot[0]!, pose.staffRibbonRot[1]!, pose.staffRibbonRot[2]!);
  return true;
}

let staffRest: Quat | null = null;
/**
 * Poses the Idol Bellkeeper from a motion frame (art/idolMotion.ts: captured clips + gaze) and carries the staff at the
 * drawn right palm, upright in its procedural idle grip frame and leaning with the captured forearm. The chime and ribbon
 * keep the procedural wind swing. Returns false when the Idol hero is not mounted.
 */
export function applyIdolBellkeeperMotion(getNode: (id: string) => unknown, frame: BellkeeperMotionFrame, procPose: IdolBellkeeperPose, idlePose: IdolBellkeeperPose): boolean {
  const h = getNode("hero-idol") as PoseHandle | undefined;
  if (!h) return false;
  heroWorld.lift = 0; // the driver's pose carries the hips height
  writeBody(h);
  h.setAnimationPose?.(frame.pose as unknown as IdolAnimationPose);
  lastHand = [frame.hand[0], frame.hand[1], frame.hand[2]];
  const staff = getNode("hero-staff") as PoseHandle | undefined;
  if (staff) {
    staffRest ??= bellkeeperSegments(idlePose).armR;
    const e = qToEngineEuler(qMul(frame.staffTilt as Quat, staffRest));
    staff.setPosition(lastHand[0], lastHand[1], lastHand[2]);
    staff.setRotation(e[0], e[1], e[2]);
  }
  const chime = getNode("hero-staff-chime") as PoseHandle | undefined;
  chime?.setRotation(procPose.staffChimeRot[0]!, procPose.staffChimeRot[1]!, procPose.staffChimeRot[2]!);
  const ribbon = getNode("hero-staff-ribbon") as PoseHandle | undefined;
  ribbon?.setRotation(procPose.staffRibbonRot[0]!, procPose.staffRibbonRot[1]!, procPose.staffRibbonRot[2]!);
  return true;
}
