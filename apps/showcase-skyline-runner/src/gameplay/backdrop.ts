/**
 * distanceLod skyline backdrop bands (SR-A3).
 *
 * Two background district silhouette bands -- far range and near range -- split into
 * one chunk per certified district. Every chunk is a public distanceLod node with
 * hysteresis, so as the follow camera travels the course the chunks ahead and behind
 * drop to their cheap level and the journey reads as a city receding at constant
 * cost. Heights derive from the authored terrain profiles; nothing is hand-placed.
 *
 * Pure planner: main.ts converts game-x anchors into scene positions and builds the
 * actual nodes.
 */
import {
  geometry,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraRootLodLevelSpec
} from "@aura3d/engine";
import type { SkylineDistrictAnchor } from "./level";

export type SkylineBackdropBand = "far" | "near";

export interface SkylineBackdropChunk {
  readonly id: string;
  readonly band: SkylineBackdropBand;
  readonly section: number;
  readonly act: number;
  readonly district: number;
  readonly districtId: SkylineDistrictAnchor["districtId"];
  /** Game-x centre of the chunk (main.ts maps this through the scene binding). */
  readonly centerX: number;
  /** Chunk extents in game units. */
  readonly width: number;
  /** Silhouette height in scene units at the backdrop depth. */
  readonly height: number;
}

/** Small deterministic hash so silhouettes vary without a second RNG surface. */
function chunkJitter(section: number, band: SkylineBackdropBand): number {
  let h = (section + 1) * 0x9e3779b9;
  if (band === "far") h ^= 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

export function skylineBackdropChunkId(band: SkylineBackdropBand, section: number): string {
  return "skyline-backdrop-" + band + "-" + section;
}

export function planSkylineBackdropChunks(
  anchors: readonly SkylineDistrictAnchor[]
): readonly SkylineBackdropChunk[] {
  return anchors.flatMap((anchor) => {
    const width = (anchor.endX - anchor.startX) * 0.985;
    const farJitter = chunkJitter(anchor.section, "far");
    const nearJitter = chunkJitter(anchor.section, "near");
    return [
      {
        id: skylineBackdropChunkId("far", anchor.section),
        band: "far" as const,
        section: anchor.section,
        act: anchor.act,
        district: anchor.district,
        districtId: anchor.districtId,
        centerX: anchor.centerX,
        width,
        // The far range towers: it carries the receding-city read.
        height: 2.4 + anchor.elevation * 2.1 + farJitter * 0.9
      },
      {
        id: skylineBackdropChunkId("near", anchor.section),
        band: "near" as const,
        section: anchor.section,
        act: anchor.act,
        district: anchor.district,
        districtId: anchor.districtId,
        centerX: anchor.centerX,
        width,
        // The near range is lower and denser so depth reads from parallax alone.
        height: 1.15 + anchor.elevation * 0.95 + nearJitter * 0.5
      }
    ];
  });
}

const BACKDROP_LOD_HYSTERESIS = 0.4;
/**
 * Camera-to-chunk distance past which a chunk drops to its cheap silhouette.
 *
 * The planned skyline plane is roughly 30 scene units behind the follow camera;
 * the former 9.5 value therefore selected the distant level for all 20 chunks at
 * every course position. 31.5 admits the horizontally-nearest district chunks
 * while keeping the majority distant on both accepted camera compositions.
 */
export const SKYLINE_BACKDROP_NEAR_LOD_MAX_DISTANCE = 31.5;

function backdropBandMaterial(band: SkylineBackdropBand): AuraMaterialSpec {
  return band === "near"
    ? material.emissive({
        name: "skyline near-band silhouette",
        color: "#16283c",
        emissive: "#23405e",
        emissiveIntensity: 0.5,
        roughness: 0.86
      })
    : material.emissive({
        name: "skyline far-band silhouette",
        color: "#0d1928",
        emissive: "#152738",
        emissiveIntensity: 0.32,
        roughness: 0.92
      });
}

/**
 * Six coplanar facade spans keep the close mesh's certified subdivision while
 * sharing the distant box's exact silhouette. The former 3% roof notches were
 * still several pixels tall after the chunk scale and produced a measurable
 * pop at the mounted LOD boundary.
 */
const BACKDROP_CLOSE_ROOF_PROFILE = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as const;
export const SKYLINE_BACKDROP_CLOSE_TRIANGLES = 52;
export const SKYLINE_BACKDROP_DISTANT_TRIANGLES = 12;
export const SKYLINE_BACKDROP_MAX_NORMALIZED_SILHOUETTE_DELTA = 0;

/**
 * Depth-bearing close silhouette with the same normalized bounds as the distant
 * box. Its facade remains subdivided for the certified close-detail budget, but
 * its outer contour exactly matches the 12-triangle distant box so the
 * 31.5-unit switch cannot alter the skyline outline. The mesh has 52 triangles;
 * the distant box has 12.
 */
export function createSkylineBackdropCloseGeometry(): AuraCustomGeometrySpec {
  const positions: [number, number, number][] = [];
  const columns = BACKDROP_CLOSE_ROOF_PROFILE.length;
  for (const z of [0.5, -0.5] as const) {
    for (let index = 0; index < columns; index += 1) {
      const x = -0.5 + index / (columns - 1);
      positions.push([x, -0.5, z], [x, BACKDROP_CLOSE_ROOF_PROFILE[index]!, z]);
    }
  }
  const front = (column: number, top: boolean) => column * 2 + (top ? 1 : 0);
  const back = (column: number, top: boolean) => columns * 2 + column * 2 + (top ? 1 : 0);
  const indices: number[] = [];
  for (let index = 0; index < columns - 1; index += 1) {
    // Front and back facade cells.
    indices.push(
      front(index, false), front(index + 1, false), front(index + 1, true),
      front(index, false), front(index + 1, true), front(index, true),
      back(index, false), back(index + 1, true), back(index + 1, false),
      back(index, false), back(index, true), back(index + 1, true),
      // Roof and floor strips join the two facade planes.
      front(index, true), front(index + 1, true), back(index + 1, true),
      front(index, true), back(index + 1, true), back(index, true),
      front(index, false), back(index + 1, false), front(index + 1, false),
      front(index, false), back(index, false), back(index + 1, false)
    );
  }
  // Close the left and right ends.
  indices.push(
    front(0, false), front(0, true), back(0, true),
    front(0, false), back(0, true), back(0, false),
    front(columns - 1, false), back(columns - 1, true), front(columns - 1, true),
    front(columns - 1, false), back(columns - 1, false), back(columns - 1, true)
  );
  return geometry.define({
    positions,
    indices,
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  });
}

export interface SkylineBackdropLodSpec {
  readonly levels: readonly [AuraRootLodLevelSpec, AuraRootLodLevelSpec];
  readonly hysteresis: number;
  readonly triangleCounts: readonly [number, number];
  readonly distantTriangleReductionRatio: number;
  readonly maximumNormalizedSilhouetteDelta: number;
}

/**
 * LOD levels for one chunk: detailed silhouette when the camera is close, flat dim
 * box beyond SKYLINE_BACKDROP_NEAR_LOD_MAX_DISTANCE, held across a 0.4-unit hysteresis band
 * so traversal cannot flicker a chunk between levels (no visible pop).
 */
export function skylineBackdropLodSpec(chunk: SkylineBackdropChunk): SkylineBackdropLodSpec {
  const sharedBandMaterial = backdropBandMaterial(chunk.band);
  return {
    levels: [
      {
        name: chunk.id + "-close",
        maxDistance: SKYLINE_BACKDROP_NEAR_LOD_MAX_DISTANCE,
        geometry: createSkylineBackdropCloseGeometry(),
        material: sharedBandMaterial
      },
      {
        name: chunk.id + "-distant",
        primitive: "box",
        material: sharedBandMaterial
      }
    ],
    hysteresis: BACKDROP_LOD_HYSTERESIS,
    triangleCounts: [SKYLINE_BACKDROP_CLOSE_TRIANGLES, SKYLINE_BACKDROP_DISTANT_TRIANGLES],
    distantTriangleReductionRatio: 1 - SKYLINE_BACKDROP_DISTANT_TRIANGLES / SKYLINE_BACKDROP_CLOSE_TRIANGLES,
    maximumNormalizedSilhouetteDelta: SKYLINE_BACKDROP_MAX_NORMALIZED_SILHOUETTE_DELTA
  };
}
