/**
 * Idol wow pass (Nov 2026): high-detail image-to-3D GLBs (speridlabs/idol/max on fal.ai, tools/idol/specs/heatsink-port.json)
 * replace Ion Circuit's procedural player craft (hull + trim + canopy), sentry and heavy strike targets, checkpoint
 * pylons, canyon scenery (mesas, cryo vents, coolant towers, boost arches), barrels and pickups. Render layer only: the
 * runtime ids, deterministic placements (models.ts) and hit radii are unchanged, and both quality tiers share the GLBs.
 * Every GLB is normalised to metres, grounded at y = 0 and faces +Z; centred nodes (targets, pickups, barrels) drop the
 * model by the procedural lower extent so the visual centre stays where the old sculpt's was.
 */
import { group, instances, model, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { ION_IDOL as assets } from "../../../apps/showcase-heatsink-port/src/idol-assets";
import { gatePylonTransforms, scenerySpots } from "../models";
import type { Frame, Track } from "../track";
import { buildTargetFanNode } from "./proceduralModels";

type Node = AuraNodeBuilder<AuraSceneNode>;
type Asset = Parameters<typeof model>[0];

/** The procedural hull's belly sits 0.21 m below its origin; the grounded Idol hull is dropped by the same amount. */
export const IDOL_HULL_BELLY_Y = -0.21;

const heightOf = (asset: Asset): number => (asset as { readonly bounds?: readonly number[] }).bounds?.[1] ?? 1;
const glb = (asset: Asset, name: string, castShadow = false) => model(asset, { name, scaleMode: "world", role: "setDressing", castShadow, receiveShadow: true });

/** Player craft hull (`drone-hull`): world.ts sets its position/rotation every frame (and the 8-step heat emissive). */
export function idolDroneHull(casts: boolean): Node {
  return model(assets.ioncDrone, { name: "drone-hull", scaleMode: "world", role: "primaryCharacter", castShadow: casts, receiveShadow: true }) as unknown as Node;
}

/**
 * A strike target core centred on the procedural sculpt's bounds centre (`centreY`) and scaled up to its span (`span`
 * metres across the wings; the spec generated the GLB at the old `r * k` size argument, which was the body, not the span).
 */
function target(asset: Asset, id: number, generatedMaxDim: number, span: number, centreY: number, ducts: TargetDucts): Node {
  const k = span / generatedMaxDim;
  const drop = centreY - (heightOf(asset) * k) / 2;
  const fans = targetFanPlacements(ducts, k, drop).map((f, j) =>
    group(`target-${id}-fan-${j}`, [buildTargetFanNode(`target-${id}-fan-${j}-mesh`)], { position: f.position }).scale(f.scale).runtime({ id: `target-${id}-fan-${j}`, mutable: true })
  );
  return group(`target-${id}`, [glb(asset, `target-${id}-idol`).position(0, drop, 0).scale([k, k, k]), ...fans]) as Node;
}

/**
 * The two wingtip rotor ducts of each target GLB in its normalised frame (metres, grounded at y = 0), measured from the
 * vertex data (audit 2026-11-19): the duct centre (x, z), the top of the baked blades / duct lip (`lipY`) and the blade
 * radius. The baked blades are static, so a spinning fan (`buildTargetFanNode`) sits just on the lip over each one.
 */
export type TargetDucts = { readonly centres: readonly (readonly [number, number])[]; readonly lipY: number; readonly bladeRadius: number };
export const SENTRY_DUCTS: TargetDucts = { centres: [[-2.24, -0.72], [2.24, -0.72]], lipY: 1.16, bladeRadius: 0.58 };
export const HEAVY_DUCTS: TargetDucts = { centres: [[-2.82, -1.1], [2.82, -1.1]], lipY: 2.08, bladeRadius: 0.6 };
/** the procedural fan's blade tip radius (`buildTargetFanNode`) */
const FAN_RADIUS = 0.57;

/** Fan node offsets in the target group (the GLB is scaled by `k` and dropped by `drop`) and their uniform scale. */
export function targetFanPlacements(ducts: TargetDucts, k: number, drop: number): { position: [number, number, number]; scale: number }[] {
  return ducts.centres.map(([x, z]) => ({ position: [x * k, drop + (ducts.lipY + 0.02) * k, z * k], scale: (ducts.bladeRadius / FAN_RADIUS) * k }));
}

/** Sentry: procedural span 10.23 m, bounds y -2.06 .. 3.71 (centre 0.83); generated at 6.63 m. */
export const SENTRY_FIT = { generatedMaxDim: 6.63, span: 10.23, centreY: 0.83 } as const;
export const idolSentry = (id: number): Node => target(assets.ioncSentry, id, SENTRY_FIT.generatedMaxDim, SENTRY_FIT.span, SENTRY_FIT.centreY, SENTRY_DUCTS);
/** Heavy: procedural span 13.9 m, bounds y -2.08 .. 2.56 (centre 0.24); generated at 7.99 m. */
export const HEAVY_FIT = { generatedMaxDim: 7.99, span: 13.9, centreY: 0.24 } as const;
export const idolHeavy = (id: number): Node => target(assets.ioncHeavy, id, HEAVY_FIT.generatedMaxDim, HEAVY_FIT.span, HEAVY_FIT.centreY, HEAVY_DUCTS);
/** fan ids per target (world.ts spins them) */
export const TARGET_FANS = 2;

/** Pickup cell, centred (procedural y -h .. +h). */
export function idolPickup(i: number, shield: boolean): Node {
  const asset = shield ? assets.ioncPickupShield : assets.ioncPickupRepair;
  return group(`pickup-${i}`, [glb(asset, `pickup-${i}-idol`).position(0, -heightOf(asset) / 2, 0)]) as Node;
}

/** Plasma drum: the procedural drum spans y -1.1 .. +1.24 around the node origin. */
export function idolBarrel(i: number): Node {
  return group(`barrel-${i}`, [glb(assets.ioncBarrel, `barrel-${i}-idol`).position(0, -1.1, 0)]) as Node;
}

/**
 * Canyon scenery: one `instances.model` pool per kind at the deterministic `scenerySpots` placements. Both quality tiers
 * share the GLBs; the pools keep the procedural tier tag (`tier:/models/` or `tier:/models-lite/`, HP-12).
 */
export function idolSceneryNodes(track: Track, lite: boolean, seed = 733): Node[] {
  const tags = [lite ? "tier:/models-lite/" : "tier:/models/"];
  const spots = scenerySpots(track, seed);
  /*
   * Grounding (Idol wow pass sweep): the procedural pieces sat 0.55 m into the banked shoulder; the Idol mesas are wider
   * (about 12 m against 7.6 m), so on a shoulder falling ~0.17 m per metre their downhill edge would lift off. Each pool
   * sinks a further `sink` metres (about half its footprint times the steepest shoulder slope, scaled per instance).
   */
  const pool = (asset: Asset, name: string, list: typeof spots.caps, sink = 0): Node | null =>
    list.length === 0
      ? null
      : (instances
          .model(asset, {
            name,
            scaleMode: "world",
            role: "setDressing",
            castShadow: false,
            receiveShadow: true,
            transforms: list.map((p) => ({ position: [p.position[0], p.position[1] - sink * p.scale, p.position[2]] as [number, number, number], rotation: p.rotation, scale: [p.scale, p.scale, p.scale] as [number, number, number] }))
          })
          .runtime({ id: name, tags }) as unknown as Node);
  return [
    pool(assets.ioncMesa, "scenery-caps", spots.caps, IDOL_POOL_SINK.caps),
    pool(assets.ioncCryoVent, "scenery-corals", spots.corals, IDOL_POOL_SINK.corals),
    pool(assets.ioncCoolantTower, "scenery-ruins", spots.ruins, IDOL_POOL_SINK.ruins),
    pool(assets.ioncBoostArch, "scenery-arches", spots.arches, IDOL_POOL_SINK.arches)
  ].filter((n): n is Node => n !== null);
}

/** Extra sink (metres per unit instance scale) of each canyon pool: half its Idol footprint times a 0.17 shoulder slope. */
export const IDOL_POOL_SINK = { caps: 1.0, corals: 0.3, ruins: 0.85, arches: 0.7 } as const;

/** Checkpoint pylons (two per gate on the road edges), 22 m tall like the procedural pylons. */
export function idolGatePylonNodes(track: Track, rotationOf: (fr: Frame) => readonly [number, number, number]): Node[] {
  const transforms = gatePylonTransforms(track, rotationOf);
  if (transforms.length === 0) return [];
  return [
    instances
      .model(assets.ioncGatePylon, { name: "gate-pylons", scaleMode: "world", role: "setDressing", castShadow: false, receiveShadow: true, transforms })
      .runtime({ id: "gate-pylons" }) as unknown as Node
  ];
}
