/**
 * Idol wow pass (Nov 2026): high-detail image-to-3D GLBs (speridlabs/idol/max on fal.ai, tools/idol/specs/silt-and-signal-port.json)
 * replace the procedural sand skiff, courier rider, tow relic, buggy and the chapter-0 landmarks (viaducts, gatehouse,
 * canyon gate, relay tower, obelisk, bazaar stall, mesas and signal pylons). Render layer only: runtime ids, positions,
 * yaws and footprints match the procedural builders (collision lives in colliders-ch0.ts and is untouched). Every GLB is
 * normalised to metres, grounded at y = 0 and faces +Z; the offsets below put each base where the procedural base was.
 * The rider is a rigged Idol courier mounted inside the skiff node (it banks about the deck) whose bones world.ts drives
 * every frame (art/idolRider.ts); the empty articulation chain keeps its runtime ids so the per-frame posing still binds.
 */
import { group, instances, model, type AuraNodeBuilder, type AuraSceneNode, type AuraTransformSpec } from "@aura3d/engine";
import { DUNE_IDOL as assets } from "../../../apps/showcase-silt-and-signal-port/src/idol-assets";
import { SURFER_PELVIS_REST } from "./proceduralModels";

type V3 = readonly [number, number, number];
type Node = AuraNodeBuilder<AuraSceneNode>;

const glb = (asset: Parameters<typeof model>[0], name: string, opts: { castShadow?: boolean; receiveShadow?: boolean; role?: "primaryCharacter" | "setDressing" } = {}) =>
  model(asset, { name, scaleMode: "world", role: opts.role ?? "setDressing", castShadow: opts.castShadow ?? false, receiveShadow: opts.receiveShadow ?? true });

/**
 * Where the Idol skiff's keel sits in board space (unscaled metres): its deck (about 0.48 m above the keel) lands on the
 * procedural deck height 0.192 that world.ts's DECK_TOP puts the rider's boots on.
 */
export const IDOL_SKIFF_KEEL_Y = -0.29;

/** The rigged courier renders 1.72 m tall in its T-pose (the rigged GLB is unscaled; scale from its admitted bounds). */
export const RIDER_RIG_HEIGHT = 1.72;
export const RIDER_RIG_SCALE = RIDER_RIG_HEIGHT / Math.max(1e-3, (assets.duneRiderRig as { readonly bounds?: readonly number[] }).bounds?.[1] ?? RIDER_RIG_HEIGHT);

/**
 * Render-only enlargement of the hero pair (skiff + courier) about the board origin: at the chase distance the 1.72 m
 * courier read at about 30 x 60 px (real-GPU QA F2); 1.3x restores a readable hero. Sim, colliders and camera unchanged.
 */
export const HERO_VISUAL_SCALE = 1.3;

/** The Idol courier's feet in board space (unscaled metres): over the Idol hull's deck centre (0.3 m aft of the origin). */
export const IDOL_RIDER_ON_DECK: V3 = [-0.3, 0.192, 0];

/**
 * The Idol sand skiff (`id: "board"`), +X forward in board space like the procedural hull (BOARD_YAW turns it to -Z),
 * with the rigged Idol courier (`rider-body`) standing on its deck. Riding inside the board node, the courier banks,
 * pitches and bobs about the deck with the hull and can never slide off it; world.ts poses its bones every frame
 * (art/idolRider.ts). The rig faces +Z, so a quarter turn faces it along the board's +X; the 1 / scale cancels the
 * board's BOARD_SCALE so the figure keeps its height.
 */
export function createIdolSkiffNode(options: { readonly scale: number }): Node {
  const inv = 1 / options.scale;
  const v = HERO_VISUAL_SCALE;
  return group("board", [
    // skiff + courier share one visual scale about the board origin, so the courier stays on the (scaled) deck
    group("board-hero", [
      glb(assets.duneSkiffAlt, "board-idol", { castShadow: true, role: "primaryCharacter" }).position(0, IDOL_SKIFF_KEEL_Y, 0).rotate(0, Math.PI / 2, 0),
      model(assets.duneRiderRig, { name: "rider-idol", scaleMode: "world", role: "primaryCharacter", castShadow: true, receiveShadow: true })
        .position(...IDOL_RIDER_ON_DECK)
        .rotate(0, Math.PI / 2, 0)
        .scale([inv * RIDER_RIG_SCALE, inv * RIDER_RIG_SCALE, inv * RIDER_RIG_SCALE])
        .runtime({ id: "rider-body" })
    ], { scale: [v, v, v] })
  ], {
    position: [0, 4, 0],
    scale: [options.scale, options.scale, options.scale]
  }).runtime({ id: "board" }) as Node;
}

/**
 * The courier's runtime chain (`id: "rider"`): the figure itself rides on the board (createIdolSkiffNode); these empty
 * groups keep `rider`, `rider-pelvis`, `rider-torso`, head, arms and scarf bindable for world.ts's per-frame posing,
 * the wake motes and the rider blob.
 */
export function createIdolRiderNode(): Node {
  const marker = (name: string) => group(name, [], { rotationOrder: "ZYX" }).runtime({ id: name });
  const pelvis = group(
    "rider-pelvis",
    [marker("rider-torso"), marker("rider-head"), marker("rider-arm-lead"), marker("rider-arm-trail"), group("rider-scarf", [marker("rider-scarf-tip")], { rotationOrder: "ZYX" }).runtime({ id: "rider-scarf" })],
    { position: [...SURFER_PELVIS_REST], rotationOrder: "ZYX" }
  ).runtime({ id: "rider-pelvis" });
  return group("rider", [pelvis], { position: [0, 4, 0], rotationOrder: "ZYX" }).runtime({ id: "rider" }) as Node;
}

/** The Idol tow relic shell (`id: "tow-shell"`), centred like the lathed procedural vessel (y -0.95 .. +1.08). */
export function createIdolTowShellNode(farPos: V3): Node {
  return group("tow-shell", [glb(assets.duneTowShell, "tow-shell-idol", { castShadow: true }).position(0, -0.95, 0)], { position: [...farPos] }).runtime({ id: "tow-shell" }) as Node;
}

/** One static landmark: `baseY` is where the procedural builder's lowest vertex sat relative to its origin. */
function landmark(asset: Parameters<typeof model>[0], name: string, position: V3, yaw: number, baseY: number, uniform = 1): Node {
  return group(name, [glb(asset, `${name}-idol`).position(0, baseY, 0)], { position: [...position], rotation: [0, yaw, 0], scale: [uniform, uniform, uniform] }) as Node;
}

export const createIdolViaduct = (name: string, position: V3, yaw: number): Node => landmark(assets.duneViaduct, name, position, yaw, -4);
export const createIdolGatehouse = (name: string, position: V3, yaw: number): Node => landmark(assets.duneGatehouse, name, position, yaw, -2.4);
export const createIdolCanyonGate = (name: string, position: V3, yaw: number): Node => landmark(assets.duneCanyonGate, name, position, yaw, -3.5);
export const createIdolRelayTower = (name: string, position: V3, yaw: number): Node => landmark(assets.duneRelayTower, name, position, yaw, -2.5);
export const createIdolStall = (name: string, position: V3, yaw: number): Node => landmark(assets.duneStall, name, position, yaw, -0.6);
/** Wind banner mast (procedural base sits 1.2 m below the origin; the Idol mast is 21.95 m tall like the procedural one). */
export const createIdolBannerMast = (name: string, position: V3, yaw: number): Node =>
  // the Idol mast's pole and plinth sit 3.0 m to the GLB's -X of its bounds centre; shift it onto the origin like the
  // procedural mast (pole at the origin, cloth streaming towards +X)
  group(name, [glb(assets.duneBannerMast, `${name}-idol`).position(3.0, -1.2, 0)], { position: [...position], rotation: [0, yaw, 0] }) as Node;
export const createIdolBuggy = (name: string, position: V3, yaw: number): Node => landmark(assets.duneBuggy, name, position, yaw, 0);
/** The procedural obelisk spans y -1.98 .. +25.9 for `height` 24; the Idol one is generated at that 27.9 m span. */
export const createIdolObelisk = (name: string, position: V3, yaw: number, height: number): Node =>
  landmark(assets.duneObelisk, name, position, yaw, -1.98 * (height / 24), height / 24);
/** Mesa spire: the batched unit mesa (2.05 m tall, base -0.09) at `scale`, like `createStratifiedMesaSpire`. */
export const createIdolMesaSpire = (name: string, position: V3, yaw: number, scale: number): Node =>
  group(name, [glb(assets.duneMesa, `${name}-idol`).position(0, -0.09, 0)], { position: [...position], rotation: [0, yaw, 0], scale: [scale, scale, scale] }) as Node;

/** Batched mesas: the same transforms as the procedural `batched-mesa-spires` pool (unit mesa, uniform scale). */
export function idolMesaBatch(transforms: readonly AuraTransformSpec[]): Node {
  return instances.model(assets.duneMesa, { name: "batched-mesa-spires", scaleMode: "world", role: "setDressing", castShadow: false, receiveShadow: true, transforms }) as unknown as Node;
}

/** Batched signal pylons: one Idol pylon (unit height 1.08 incl. dish) per procedural body + dish + solar triple. */
export function idolPylonBatch(transforms: readonly { readonly position: readonly [number, number, number]; readonly yaw: number; readonly height: number }[]): Node {
  return instances.model(assets.duneSignalPylon, {
    name: "batched-signal-pylons",
    scaleMode: "world",
    role: "setDressing",
    castShadow: false,
    receiveShadow: true,
    transforms: transforms.map((t) => ({ position: [...t.position] as [number, number, number], rotation: [0, t.yaw, 0] as [number, number, number], scale: [t.height, t.height, t.height] as [number, number, number] }))
  }) as unknown as Node;
}
