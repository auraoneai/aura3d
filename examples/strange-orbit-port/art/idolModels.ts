/**
 * Craterline GP Idol pass (2026-11): image-to-3D GLBs (`speridlabs/idol/max`, spec `tools/idol/specs/craterline-gp.json`)
 * for the six racing motorcycles with their tucked spacesuit riders and the landmark set pieces. Render layer only:
 * every node keeps the id, pivot, footprint and forward axis of the procedural builder it replaces
 * (`art/proceduralModels.ts`, still used for the skate, the `?look=original` variant and everything not listed here).
 *
 * Bikes: each livery is one Idol bike+rider generated WITHOUT wheels (bare front-fork and swingarm axle hubs); the rig
 * keeps its procedural spinning `wheelF` / `wheelR` parts. Idol GLBs face +Z; the procedural bike model space faces -Z
 * (nose); under an Idol body the rig puts its hubs at `[0, 0.315, -0.78]` and `[0, 0.315, +0.78]` (`riderRig`), and each
 * body is turned 180 degrees and scaled/offset so its measured axle hubs (`IDOL_BIKE_HUBS`) land on those points.
 */
import { group, material, model, primitives, type AuraMaterialSpec } from "@aura3d/engine";
import { CRATERLINE_IDOL_ASSETS as assets } from "../../../apps/showcase-strange-orbit-port/src/idol-assets";
import { IDOL_BIKE_HUBS, IDOL_BIKE_SEAT, type IdolBikeKey } from "./idolFit";
import { RIDER_FOR_BIKE, RIDER_HEIGHT, type RiderKey } from "./idolRider";

type GroupBuilder = ReturnType<typeof group>;
type V3 = [number, number, number];

/** Rig hub points in the procedural bike model space (`riderRig` wheel offsets after `MODEL_YAW`). */
export const BIKE_HUB = { y: 0.315, frontZ: -0.78, rearZ: 0.78, radius: 0.315 } as const;
/** Rig forward offsets of the wheel hubs under an Idol body (its wheelbase is longer than the procedural bike's 1.24 m). */
export const IDOL_BIKE_WHEEL_OFFSET = { front: -BIKE_HUB.frontZ, rear: -BIKE_HUB.rearZ, y: BIKE_HUB.y } as const;
/** Rig offsets of the boost exhaust cones at the Idol bikes' stacked tail pipes. */
export const IDOL_BIKE_CONE_OFFSET = { forward: -0.97, up: 0.68, side: 0.06 } as const;

/** Hero rider (Sol, Ciel, Ember) liveries, then the five rival liveries in `GOUACHE_LIVERIES` order. */
export const HERO_BIKES: readonly IdolBikeKey[] = ["cgBikeAlabasterNR", "cgBikeCobaltNR", "cgBikeCrimsonNR"];
export const RIVAL_BIKES: readonly IdolBikeKey[] = ["cgBikeCobaltNR", "cgBikeCrimsonNR", "cgBikeVioletNR", "cgBikeSandNR2", "cgBikeTealNR"];

/** Inner transform that puts an Idol bike body (facing +Z, metres) into the procedural bike model space. */
export function bikeBodyTransform(key: IdolBikeKey): { readonly position: V3; readonly rotation: V3; readonly scale: number } {
  const hubs = IDOL_BIKE_HUBS[key];
  const k = (BIKE_HUB.rearZ - BIKE_HUB.frontZ) / (hubs.front[1] - hubs.rear[1]);
  const hubY = (hubs.front[0] + hubs.rear[0]) / 2;
  // p' = Ry(pi) * (k p) + t, so z -> -k z: the front hub (Idol +z) lands on the rig's -Z front hub.
  return { position: [0, BIKE_HUB.y - k * hubY, BIKE_HUB.frontZ + k * hubs.front[1]], rotation: [0, Math.PI, 0], scale: k };
}

type Rig3 = [number, number, number];

/**
 * Rig-frame (x forward, y up, z = rider's right; before the display scale) saddle and grip points of an Idol bike body
 * placed by `bikeBodyTransform`: GLB (x, y, z) -> rig (rearHubRigX + k (z - zRear)... ) = (0.78 + k (z - zf), hubY' + k (y - hubY), -k x).
 */
export function bikeRiderFrame(key: IdolBikeKey): { readonly saddle: Rig3; readonly grips: { readonly left: Rig3; readonly right: Rig3 }; readonly k: number } {
  const hubs = IDOL_BIKE_HUBS[key];
  const k = (BIKE_HUB.rearZ - BIKE_HUB.frontZ) / (hubs.front[1] - hubs.rear[1]);
  const hubY = (hubs.front[0] + hubs.rear[0]) / 2;
  const toRig = (x: number, y: number, z: number): Rig3 => [-BIKE_HUB.frontZ + k * (z - hubs.front[1]), BIKE_HUB.y + k * (y - hubY), -k * x];
  const { saddle, grip, gripHalfX } = IDOL_BIKE_SEAT;
  // the rider's left grip is the bike's left (+X in the GLB) -> rig -z
  return { saddle: toRig(0, saddle[0], saddle[1]), grips: { left: toRig(gripHalfX, grip[0], grip[1]), right: toRig(-gripHalfX, grip[0], grip[1]) }, k };
}

/** The rider generation that suits a bike livery. */
export const riderKeyFor = (bike: IdolBikeKey): RiderKey => RIDER_FOR_BIKE[bike] ?? "cgRiderCream";

/** Uniform rider node scale in rig metres (the rigged GLB is 1 m tall; `RIDER_HEIGHT` is the racer's standing height). */
export function riderScale(key: RiderKey): number {
  const h = (assets[key] as { readonly bounds?: readonly number[] }).bounds?.[1] ?? 1;
  return RIDER_HEIGHT / (h > 0 ? h : 1);
}

/** Rigged Idol racer (`rider-i-rider`), posed every frame by `world.ts` through the shared humanoid driver. */
export function createIdolRiderNode(id: string, key: RiderKey, opts: { readonly castShadow: boolean; readonly material?: AuraMaterialSpec }) {
  return model(assets[key], { name: id, scaleMode: "world", castShadow: opts.castShadow, receiveShadow: true, ...(opts.material ? { material: opts.material } : {}) }).runtime({ id });
}

/** URL of a rider GLB (the humanoid driver reads its skeleton). */
export const riderUrl = (key: RiderKey): string => assets[key].url;

/**
 * `wheelF` / `wheelR` under an Idol bike: the Idol moto wheel (chunky block tread, six wide gold spokes), axle on its
 * local X, 0.63 m across like the rig's 0.315 m wheel radius; plus `blurF` / `blurR` discs (translucent radial blur shown
 * above ~25 rad/s, when per-frame spoke steps alias into a frozen or backward-turning wheel).
 */
/**
 * Hub of the admitted cgBikeWheel GLB in its own frame (bounds [0.109, 0.63, 0.63], lowest point at y = 0, centred on x and
 * z): the wheel's origin is its contact point, not its hub. Owner QA (Nov 18, "the tire is literally shaking" and
 * "disappearing"): spinning the node about that origin swung the tyre around its contact point, up into the body and back
 * down through the road. The model now sits hub-centred in its spin node.
 */
export const CG_WHEEL_HUB: readonly [number, number, number] = [0, 0.315, 0];
export function createIdolBikeWheelNode(id: string) {
  return group(id, [model(assets.cgBikeWheel, { name: `${id}-idol`, scaleMode: "world", position: [-CG_WHEEL_HUB[0], -CG_WHEEL_HUB[1], -CG_WHEEL_HUB[2]], castShadow: false, receiveShadow: true })]).runtime({ id });
}

/** Smoky rim-coloured blur (dark gunmetal + a hint of the gold spokes), clearly see-through so the tread and hub read. */
export const WHEEL_BLUR_MATERIAL: AuraMaterialSpec = material.physical({ color: "#5a5248", roughness: 0.5, opacity: 0.3, clearcoat: 0 });
/** Blur disc size: 0.5 m across (inside the 0.63 m tyre so the tread shows), 2.4 cm thick. */
export const WHEEL_BLUR_SIZE: readonly [number, number, number] = [0.5, 0.024, 0.5];

export function createWheelBlurNode(id: string) {
  // The cylinder's axis is local +Y; world.ts turns it onto the axle every frame (`BLUR_DISC_AXIS` then the wheel turn)
  return primitives.cylinder({ name: id, size: [...WHEEL_BLUR_SIZE], material: WHEEL_BLUR_MATERIAL, castShadow: false, receiveShadow: false }).runtime({ id });
}

/** Spin rate (rad/s) above which the blur disc shows. */
export const WHEEL_BLUR_RATE = 25;
/**
 * Highest drawn spin rate (rad/s): above it the tread would step more than ~0.3 rad a frame and strobe (temporal aliasing
 * reads as a shaking or stopped wheel). The see-through blur disc layered over the always-visible tyre carries the speed.
 */
export const WHEEL_SPIN_SHOWN_MAX = 18;

function bikeBodyModel(key: IdolBikeKey, name: string, opts: { readonly castShadow: boolean; readonly receiveShadow: boolean; readonly material?: AuraMaterialSpec }) {
  return model(assets[key], { name, scaleMode: "world", ...bikeBodyTransform(key), castShadow: opts.castShadow, receiveShadow: opts.receiveShadow, ...(opts.material ? { material: opts.material } : {}) });
}

/** `rider-i-model`: the Idol bike body with its tucked rider (the wheels stay the separate spinning procedural parts). */
export function createIdolBikeBodyNode(options: { readonly id: string; readonly key: IdolBikeKey; readonly castShadow: boolean }): GroupBuilder {
  return group(options.id, [bikeBodyModel(options.key, `${options.id}-idol`, { castShadow: options.castShadow, receiveShadow: true })]).runtime({ id: options.id });
}

/** A rig part the Idol body already shows (fairing, torso, visor, nozzles): kept as an empty node so the rig ids exist. */
export function createCoveredRiderPartNode(id: string): GroupBuilder {
  return group(id, []).runtime({ id });
}

/** Time-trial ghost: the hero Idol bike body plus two wheel discs under the translucent cyan hologram material (its rigged racer is the separate `ghost-rider-rider` node, posed by world.ts). */
export function createIdolGhostRiderNode(key: IdolBikeKey, ghostMaterial: AuraMaterialSpec): GroupBuilder {
  const wheel = (name: string, z: number) =>
    primitives.cylinder({ name, size: [BIKE_HUB.radius * 2, 0.2, BIKE_HUB.radius * 2], position: [0, BIKE_HUB.y, z], rotation: [0, 0, Math.PI / 2], material: ghostMaterial, castShadow: false, receiveShadow: false });
  return group("ghost-rider", [
    bikeBodyModel(key, "ghost-rider-body", { castShadow: false, receiveShadow: false, material: ghostMaterial }),
    wheel("ghost-rider-wheel-front", BIKE_HUB.frontZ),
    wheel("ghost-rider-wheel-rear", BIKE_HUB.rearZ)
  ]).runtime({ id: "ghost-rider" });
}

export const GHOST_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#9fe8ff",
  emissive: "#5fd8ff",
  emissiveIntensity: 0.85,
  practical: true,
  roughness: 0.08,
  opacity: 0.36,
  clearcoat: 1,
  ior: 1.46
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* Set pieces: same group name, placement and scale contract as the procedural builders.                              */
/* ------------------------------------------------------------------------------------------------------------------ */

type SetPieceKey = "cgLander" | "cgObservatory" | "cgHabitat" | "cgDish" | "cgSolarArray" | "cgTrailer" | "cgFuelTank" | "cgGantry";

function setPiece(key: SetPieceKey, name: string, placement: { readonly position: V3; readonly rotation: V3; readonly scale?: number }, inner: { readonly rotation?: V3 } = {}): GroupBuilder {
  return group(name, [model(assets[key], { name: `${name}-idol`, scaleMode: "world", rotation: inner.rotation, castShadow: true, receiveShadow: true })], {
    position: placement.position,
    rotation: placement.rotation,
    scale: placement.scale ?? 1
  });
}

/** `dress-lander`: unit-height lander (scaled by `size`, like `createLunarLanderNode`). */
export const createIdolLanderNode = (o: { readonly name: string; readonly position: V3; readonly rotation: V3; readonly size: number }) =>
  setPiece("cgLander", o.name, { position: o.position, rotation: o.rotation, scale: o.size });
/** `dress-observatory*`: unit-height observatory (scaled by `size`). */
export const createIdolObservatoryNode = (o: { readonly name: string; readonly position: V3; readonly rotation: V3; readonly size: number }) =>
  setPiece("cgObservatory", o.name, { position: o.position, rotation: o.rotation, scale: o.size });

type ColonyOpts = { readonly name: string; readonly position: V3; readonly rotation: V3; readonly scale?: number };
export const createIdolHabitatNode = (o: ColonyOpts) => setPiece("cgHabitat", o.name, o);
export const createIdolDishNode = (o: ColonyOpts) => setPiece("cgDish", o.name, o);
/** The procedural array runs along local Z; the Idol array is wide along X, so it turns 90 degrees. */
export const createIdolSolarArrayNode = (o: ColonyOpts) => setPiece("cgSolarArray", o.name, o, { rotation: [0, Math.PI / 2, 0] });
export const createIdolTrailerNode = (o: ColonyOpts) => setPiece("cgTrailer", o.name, o);
export const createIdolFuelTankNode = (o: ColonyOpts) => setPiece("cgFuelTank", o.name, o);

/**
 * `start-finish-gantry`: track frame basis, +X along the track, +Z across it. The Idol gantry spans X facing +Z, so it
 * turns 90 degrees to span the road (towers at about +-13.6 m like the procedural truss).
 */
export const createIdolStartGantryNode = (o: { readonly name: string; readonly position: V3; readonly rotation: V3 }) =>
  setPiece("cgGantry", o.name, o, { rotation: [0, Math.PI / 2, 0] });


/**
 * Footprint islets (local frame, prop units, before the node scale): centre (x, z) and top radius, from each Idol set
 * piece's measured size (manifest bounds / 2, +8%). The gantry stands on two, one under each tower (its model is 33.8 m
 * wide along local Z after the inner quarter turn; towers at |z| ~ 15.1, 2.4 m footprint), clear of the 11.5 m ribbon.
 */
export const SET_PIECE_ISLETS: Readonly<Record<SetPieceKey, readonly { readonly x: number; readonly z: number; readonly r: number }[]>> = {
  cgLander: [{ x: 0, z: 0, r: 0.46 }],
  cgObservatory: [{ x: 0, z: 0, r: 0.52 }],
  cgHabitat: [{ x: 0, z: 0, r: 6.0 }],
  cgDish: [{ x: 0, z: 0, r: 4.3 }],
  cgSolarArray: [{ x: 0, z: 0, r: 3.1 }],
  cgTrailer: [{ x: 0, z: 0, r: 1.6 }],
  cgFuelTank: [{ x: 0, z: 0, r: 2.25 }],
  cgGantry: [{ x: 0, z: 15.1, r: 2.4 }, { x: 0, z: -15.1, r: 2.4 }]
};
export type { SetPieceKey };
