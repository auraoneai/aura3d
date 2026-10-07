/**
 * PRD-10 §7.1.8 / T5.5 — `world.street`: road surface + sidewalks extruded
 * along a spline, buildings placed from the city kit along the setback line,
 * street props via `world.placeAlong`, and lane markings as emissive strips.
 *
 * Emission follows the kit/placement contract: kit pieces become ONE `scatter`
 * node per unique asset; road/sidewalk/marking surfaces become `custom`
 * primitive nodes from `world.extrude`. `wet` is accepted for API stability
 * and warns once — the wet-look material variant lands with PRD-11 shaders.
 */
import type { AuraMaterialSpec, AuraSceneNode, AuraVec3 } from "../index.js";
import { material } from "../index.js";
import type { AuraKit, AuraKitPlacement } from "./kits.js";
import { worldKits } from "./kits.js";
import { worldPlaceAlong } from "./placement.js";
import { worldExtrude, worldSpline, type AuraSplineHandle } from "./spline.js";
import type { AuraTerrainHandle } from "./terrain.js";

export interface AuraStreetBuildings {
  /** Relative fill weight per building piece id (default: all equal). */
  readonly pieces?: Readonly<Record<string, number>>;
  readonly density?: number;                 // default 0.65 of setback cells
  readonly setback?: number;                 // metres behind the sidewalk edge
  readonly heightRange?: readonly [number, number]; // metres; scales piece
  readonly seed?: number;
}

export interface AuraStreetProps {
  /** Street lamps at `spacing` metres; default {spacing: 30}. */
  readonly lamps?: boolean | { readonly spacing?: number };
  /** Planters interleaved between lamps; default true. */
  readonly planters?: boolean;
  readonly seed?: number;
}

export interface AuraStreetOptions {
  /** Centerline control points (or a pre-built spline). */
  readonly path: readonly (readonly [number, number, number])[] | AuraSplineHandle;
  readonly lanes?: 2 | 4;
  readonly sidewalkWidth?: number;           // metres per side, default 3
  readonly kit?: AuraKit;                    // default world.kits.city
  readonly buildings?: AuraStreetBuildings | false;
  readonly props?: AuraStreetProps | false;
  readonly markings?: boolean;               // default true
  /** Accepted; emits a warning (wet-look shader variant lands separately). */
  readonly wet?: boolean;
  readonly conformToTerrain?: AuraTerrainHandle | string;
  readonly roadMaterial?: AuraMaterialSpec;
  readonly sidewalkMaterial?: AuraMaterialSpec;
  readonly name?: string;
}

export function worldStreet(options: AuraStreetOptions): readonly AuraSceneNode[] {
  const spline = "pointAt" in options.path ? options.path : worldSpline(options.path);
  const lanes = options.lanes ?? 2;
  const profile = lanes === 4 ? "road-4-lane" : "road-2-lane";
  const roadHalf = lanes === 4 ? 7.4 : 3.7;
  const sidewalkWidth = options.sidewalkWidth ?? 3;
  const kit = options.kit ?? worldKits.city;
  const name = options.name ?? "street";
  const nodes: AuraSceneNode[] = [];
  const roadMat = options.roadMaterial ?? material.pbr({ color: "#2b2f33", roughness: 0.82 });

  if (options.wet) {
    console.warn("world.street: `wet` is accepted but the wet-look material variant is not wired yet (see PRD-10 §7.1.8); emitting dry asphalt");
  }

  // ---------------- road surface ----------------
  nodes.push(worldExtrude(spline, {
    profile,
    material: roadMat,
    name: `${name}-road`,
    uv: { uScale: 0.5, vMetersPerTile: 8 },
    ...(options.conformToTerrain ? { conformToTerrain: { terrain: options.conformToTerrain } } : {})
  }));

  // ---------------- sidewalks (raised slabs beside the road) ---------------
  if (sidewalkWidth > 0) {
    const sidewalkMat = options.sidewalkMaterial ?? material.pbr({ color: "#9aa3a8", roughness: 0.86 });
    const slab: readonly [number, number][] = [
      [-sidewalkWidth, 0.12], [0, 0.12], [0, -0.03], [-sidewalkWidth, -0.03]
    ];
    for (const side of [-1, 1] as const) {
      // offset the profile outward by road edge + sidewalk half-width
      const off = (roadHalf + sidewalkWidth) * side;
      const shifted: readonly [number, number][] = slab.map(([x, y]) => [x + off, y]);
      nodes.push(worldExtrude(spline, {
        profile: shifted,
        material: sidewalkMat,
        name: `${name}-sidewalk-${side === -1 ? "l" : "r"}`,
        uv: { uScale: 0.4, vMetersPerTile: 4 }
      }));
    }
  }

  // ---------------- lane markings ----------------
  if (options.markings !== false) {
    const markingMat = material.emissive({ color: "#e8e4da", emissive: "#d9d2c4", emissiveIntensity: 0.35 });
    nodes.push(worldExtrude(spline, {
      profile: "marking-line",
      material: markingMat,
      name: `${name}-centerline`,
      segmentsPerMeter: 1
    }));
    if (lanes === 4) {
      for (const side of [-3.7, 3.7] as const) {
        const shifted: readonly [number, number][] = [[side - 0.075, 0.015], [side + 0.075, 0.015], [side + 0.075, 0.0175], [side - 0.075, 0.0175]];
        nodes.push(worldExtrude(spline, {
          profile: shifted,
          material: markingMat,
          name: `${name}-lane-${side}`,
          segmentsPerMeter: 1
        }));
      }
    }
  }

  // ---------------- buildings on the setback line ----------------
  const buildings = options.buildings === false ? undefined : (options.buildings ?? {});
  if (buildings) {
    const density = buildings.density ?? 0.65;
    const setback = buildings.setback ?? 4;
    const placements: AuraKitPlacement[] = [];
    const rng = mulberryish(buildings.seed ?? 7);
    const buildingPieces = kit.definition.pieces.filter((p) => p.footprint[0] >= 4 || p.id === "tower");
    const spacing = 12;
    const rows: { side: "left" | "right" }[] = [{ side: "left" }, { side: "right" }];
    for (const { side } of rows) {
      for (let s = spacing / 2; s < spline.length; s += spacing) {
        if (rng() > density) continue;
        const t = s / spline.length;
        const center = spline.pointAt(t);
        const frame = spline.frameAt(t);
        const sign = side === "left" ? -1 : 1;
        const p = buildingPieces[Math.floor(rng() * buildingPieces.length)]!;
        const off = sign * (roadHalf + sidewalkWidth + setback + p.footprint[0] / 2);
        const pos: AuraVec3 = [
          center[0] + frame.right[0] * off,
          0,
          center[2] + frame.right[2] * off
        ];
        // face the street: yaw so the piece's +x runs along the tangent
        const yawSteps = Math.round((Math.atan2(frame.forward[0], frame.forward[2]) * 180) / Math.PI / 90);
        placements.push({ piece: p.id, position: pos, rotationSteps: side === "left" ? yawSteps + 2 : yawSteps });
      }
    }
    if (placements.length > 0) nodes.push(...kit.place(placements).nodes);
  }

  // ---------------- props: lamps + planters along the sidewalk -------------
  const props = options.props === false ? undefined : (options.props ?? {});
  if (props) {
    const lampSpacing = typeof props.lamps === "object" ? (props.lamps.spacing ?? 30) : (props.lamps === false ? 0 : 30);
    const inner = roadHalf + sidewalkWidth - 0.4;
    try {
      if (lampSpacing > 0) {
        const lampPiece = kit.piece("street-lamp");
        for (const side of ["left", "right"] as const) {
          nodes.push(...worldPlaceAlong(spline, lampPiece, {
            spacing: lampSpacing,
            offset: inner,
            side,
            alignToTangent: false,
            seed: (props.seed ?? 11) + (side === "left" ? 1 : 0)
          }).nodes);
        }
      }
      if (props.planters !== false) {
        const planterPiece = kit.piece("planter");
        nodes.push(...worldPlaceAlong(spline, planterPiece, {
          spacing: lampSpacing > 0 ? lampSpacing : 20,
          offset: inner - 0.8,
          side: "right",
          alignToTangent: true,
          jitter: [2, 0.2, 15],
          seed: (props.seed ?? 11) + 5,
          start: 0.02,
          end: 0.98
        }).nodes);
      }
    } catch (e) {
      console.warn(`world.street: prop placement skipped — ${(e as Error).message}`);
    }
  }
  return nodes;
}

/** Deterministic 0..1 stream (same mulberry32 core as scatterRng). */
function mulberryish(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
