import { buildMeshBVH, raycastMesh, type MeshBVH } from "./MeshBVH.js";
import type { Vec3 } from "./Shape.js";

/**
 * Height and normal of a real mesh under a world point.
 *
 * ## The defect class this closes
 *
 * Grounding anything in this library previously meant inventing a surface model and
 * baking it into a route constant. Turbo Drift's vehicle surface was
 * `TRACK_SURFACE_Y - VERGE_DROP * shoulderFraction`: one frozen scalar plus an analytic
 * ramp. That is wrong the moment the track is banked, crowned, kerbed or swapped, and it
 * is why the car's tyres pass through the visible road on corners. The 30-line comment
 * block defending `CAR_GROUND_Y` in that route is the symptom of a missing capability,
 * not a well-understood constant.
 *
 * A surface query removes the need to model the surface at all: ask the triangles.
 *
 * ## Caching
 *
 * A vehicle samples four times per frame, a character once or twice, a crowd hundreds of
 * times. Sampling is cached per integer cell so repeated queries in the same spot are
 * free, and the cache is cleared per frame by the caller rather than by a timer — a
 * time-based cache silently returns stale heights on a moving platform.
 */

export interface SurfaceSample {
  /** World Y of the surface. */
  readonly height: number;
  /** Unit surface normal, oriented upward. */
  readonly normal: Vec3;
  /** Grip multiplier for this point. 1 unless a grip map is supplied. */
  readonly grip: number;
  /** False when no triangle was found under the point. */
  readonly hit: boolean;
  /** Triangle index, for callers that map triangles to materials. */
  readonly triangle?: number | undefined;
}

export interface MeshSurfaceQueryOptions {
  /**
   * Height the downward ray starts from, above the highest point of the mesh.
   *
   * Too low and the ray starts inside overhanging geometry; the default derives it from
   * the mesh bounds so it is correct for any scale without tuning.
   */
  readonly rayStartHeight?: number | undefined;
  /** Grid size for the sample cache, in world units. */
  readonly cacheCellSize?: number | undefined;
  /** Grip per triangle index. Absent triangles use 1. */
  readonly gripByTriangle?: ReadonlyMap<number, number> | undefined;
  /** Fallback height when nothing is under the point. */
  readonly fallbackHeight?: number | undefined;
}

export interface MeshSurfaceQuery {
  readonly kind: "aura-mesh-surface-query";
  sampleHeight(x: number, z: number): number;
  sampleNormal(x: number, z: number): Vec3;
  sampleGrip(x: number, z: number): number;
  sample(x: number, z: number): SurfaceSample;
  /** Drop cached samples. Call once per frame if the mesh moves. */
  invalidate(): void;
  readonly bvh: MeshBVH;
  /** Cache statistics, so a caller can prove the query is not thrashing. */
  stats(): { readonly samples: number; readonly cacheHits: number; readonly cachedCells: number };
}

/** Transform positions by a column-major 4x4 world matrix. */
function transformPositions(positions: Float32Array, worldMatrix?: readonly number[]): Float32Array {
  if (!worldMatrix) return positions;
  if (worldMatrix.length !== 16) throw new Error("createMeshSurfaceQuery worldMatrix must have 16 elements.");
  const out = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    out[index] = worldMatrix[0]! * x + worldMatrix[4]! * y + worldMatrix[8]! * z + worldMatrix[12]!;
    out[index + 1] = worldMatrix[1]! * x + worldMatrix[5]! * y + worldMatrix[9]! * z + worldMatrix[13]!;
    out[index + 2] = worldMatrix[2]! * x + worldMatrix[6]! * y + worldMatrix[10]! * z + worldMatrix[14]!;
  }
  return out;
}

export function createMeshSurfaceQuery(
  geometry: { readonly positions: Float32Array; readonly indices: Uint32Array },
  worldMatrix?: readonly number[],
  options: MeshSurfaceQueryOptions = {}
): MeshSurfaceQuery {
  const positions = transformPositions(geometry.positions, worldMatrix);
  const bvh = buildMeshBVH(positions, geometry.indices);

  let highest = -Infinity;
  let lowest = Infinity;
  for (let index = 1; index < positions.length; index += 3) {
    const y = positions[index]!;
    if (y > highest) highest = y;
    if (y < lowest) lowest = y;
  }
  if (!Number.isFinite(highest)) { highest = 0; lowest = 0; }

  // Start above the mesh and cast the full vertical extent plus margin, so an
  // overhang never shadows the surface beneath a sample point.
  const span = Math.max(1, highest - lowest);
  const rayStart = options.rayStartHeight ?? highest + span;
  const maxDistance = (rayStart - lowest) + span;
  const cellSize = Math.max(1e-4, options.cacheCellSize ?? 0.05);
  const fallbackHeight = options.fallbackHeight ?? lowest;

  const cache = new Map<string, SurfaceSample>();
  let samples = 0;
  let cacheHits = 0;

  function computeSample(x: number, z: number): SurfaceSample {
    const hit = raycastMesh(bvh, [x, rayStart, z], [0, -1, 0], { maxDistance });
    if (!hit) {
      return { height: fallbackHeight, normal: [0, 1, 0], grip: 1, hit: false };
    }
    // Force the normal upward: a downward ray against a double-sided road surface can
    // legitimately return either orientation, and a downward "up" normal would invert
    // every attitude calculation built on it.
    const normal: Vec3 = hit.normal[1]! < 0
      ? [-hit.normal[0]!, -hit.normal[1]!, -hit.normal[2]!]
      : hit.normal;
    return {
      height: hit.point[1]!,
      normal,
      grip: options.gripByTriangle?.get(hit.triangle) ?? 1,
      hit: true,
      triangle: hit.triangle
    };
  }

  function sample(x: number, z: number): SurfaceSample {
    samples += 1;
    const key = `${Math.round(x / cellSize)}:${Math.round(z / cellSize)}`;
    const cached = cache.get(key);
    if (cached) {
      cacheHits += 1;
      return cached;
    }
    const computed = computeSample(x, z);
    cache.set(key, computed);
    return computed;
  }

  return {
    kind: "aura-mesh-surface-query",
    bvh,
    sample,
    sampleHeight: (x, z) => sample(x, z).height,
    sampleNormal: (x, z) => sample(x, z).normal,
    sampleGrip: (x, z) => sample(x, z).grip,
    invalidate: () => {
      cache.clear();
    },
    stats: () => ({ samples, cacheHits, cachedCells: cache.size })
  };
}
