/**
 * PRD-10 §7.1.10 — C-26 `AuraWorldQueries` real implementation.
 *
 * Semantics (verbatim from §7.1.10):
 * - `ground().raycastDown(x, z, fromY = 1e4, maxDistance = 2e4)` tests terrain
 *   heightfields first (CPU Float32Array with bilinear sampling), then physics
 *   colliders through `packages/physics/src/Raycast.ts` via `app.physics.queries`,
 *   then static kit instance AABBs. Returns the nearest hit with `nodeId`.
 * - `height().heightAt/normalAt` return the bilinear terrain value under (x, z),
 *   or the highest water rest height when only water covers the point, else 0/up.
 *   `occluderHeightAt` reads the 1 m occluder grid baked at build.
 * - `wind()` returns the normalized current `Required<AuraWindSpec>`;
 *   `biome()` the active rig or null; `describeBiome`/`listBiomes` are pure.
 *
 * Terrain/water/kit/occluder providers are registered by the lane modules that
 * own them (terrain lands in Phase 2, water Phase 4, kits Phase 5); with none
 * registered the queries still answer correctly over physics and the y=0 plane.
 */
import type { QrFlags } from "@aura3d/rendering/contracts";
import type { AuraApp, AuraVec3 } from "../index.js";
import type {
  AuraBiomeId,
  AuraBiomeRig,
  AuraHeightQuery,
  AuraWindSpec,
  AuraWorldQueries,
  GroundRaycaster
} from "../../contracts/world.js";
import { describeBiome, listBiomes } from "./biomes.js";
import { normalizeWind, type AuraWindOptions } from "./wind.js";
import type { AuraWorldQualityTier } from "./types.js";

// ---------------------------------------------------------------------------
// Lane-internal provider seam. Phase 2+ modules register themselves here; the
// queries object resolves over whatever is registered at call time.
// ---------------------------------------------------------------------------

export interface WorldTerrainProvider {
  readonly nodeId: string;
  /** Bilinear height under (x, z), or null when (x, z) is outside the footprint. */
  heightAt(x: number, z: number): number | null;
  normalAt(x: number, z: number): AuraVec3 | null;
}

export interface WorldWaterProvider {
  readonly nodeId: string;
  /** Rest height of the surface under (x, z), or null when outside the water footprint. */
  restHeightAt(x: number, z: number): number | null;
}

/** Axis-aligned box contributed by a static kit instance. */
export interface WorldKitAabb {
  readonly nodeId: string;
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

/** 1 m occluder grid baked at build (C-20/C-21 rain occlusion). */
export interface WorldOccluderGrid {
  heightAt(x: number, z: number): number | null;
}

interface WorldQueriesState {
  wind: Required<AuraWindSpec>;
  biome: AuraBiomeRig | null;
  flags: QrFlags | null;
  terrains: WorldTerrainProvider[];
  waters: WorldWaterProvider[];
  kitAABBs: WorldKitAabb[];
  occluder: WorldOccluderGrid | null;
}

const states = new WeakMap<AuraApp, WorldQueriesState>();

function freshState(): WorldQueriesState {
  return { wind: normalizeWind(), biome: null, flags: null, terrains: [], waters: [], kitAABBs: [], occluder: null };
}

/** Lane-internal: shared mutable world-query state for an app (created on demand). */
export function worldStateFor(app: AuraApp): WorldQueriesState {
  let state = states.get(app);
  if (!state) {
    state = freshState();
    states.set(app, state);
  }
  return state;
}

/** Lane-internal: `world.setWind` (AuraWorldRuntime, Phase 2+) writes here. */
export function setWorldWind(app: AuraApp, options: AuraWindOptions): void {
  worldStateFor(app).wind = normalizeWind(options);
}

/** Lane-internal: the active resolved biome rig (`biome`/`time-of-day` handlers write here). */
export function setWorldActiveBiome(app: AuraApp, rig: AuraBiomeRig | null): void {
  worldStateFor(app).biome = rig;
}

/** Lane-internal: the C-38 extension records the app's flags for later per-frame queries. */
export function setWorldFlags(app: AuraApp, flags: QrFlags): void {
  worldStateFor(app).flags = flags;
}

interface GroundHit {
  readonly point: AuraVec3;
  readonly normal: AuraVec3;
  readonly distance: number;
  readonly nodeId?: string;
}

function raycastTerrain(x: number, z: number, fromY: number, maxDistance: number, state: WorldQueriesState): GroundHit | null {
  // A straight-down ray over a heightfield hits at terrain height directly:
  // heightAt is the bilinear surface value; no marching needed for x/z fixed.
  let nearest: GroundHit | null = null;
  for (const terrain of state.terrains) {
    const h = terrain.heightAt(x, z);
    if (h === null || !Number.isFinite(h)) continue;
    const distance = fromY - h;
    if (distance < 0 || distance > maxDistance) continue;
    if (!nearest || distance < nearest.distance) {
      nearest = {
        point: [x, h, z],
        normal: terrain.normalAt(x, z) ?? [0, 1, 0],
        distance,
        nodeId: terrain.nodeId
      };
    }
  }
  return nearest;
}

function raycastPhysics(app: AuraApp, x: number, z: number, fromY: number, maxDistance: number): GroundHit | null {
  const physics = app.physics;
  if (!physics) return null;
  const hit = physics.queries.raycast([x, fromY, z], [0, -1, 0], { maxDistance });
  if (!hit) return null;
  return {
    point: [hit.point[0], hit.point[1], hit.point[2]],
    normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
    distance: hit.distance,
    nodeId: hit.nodeName ?? undefined
  };
}

function raycastKitAABBs(x: number, z: number, fromY: number, maxDistance: number, state: WorldQueriesState): GroundHit | null {
  let nearest: GroundHit | null = null;
  for (const box of state.kitAABBs) {
    if (x < box.min[0] || x > box.max[0] || z < box.min[2] || z > box.max[2]) continue;
    const top = box.max[1];
    const bottom = box.min[1];
    if (top > fromY && bottom > fromY) continue; // AABB fully above the ray start
    const hitY = top <= fromY ? top : bottom; // ray starts inside -> exits through the bottom face
    const distance = fromY - hitY;
    if (distance < 0 || distance > maxDistance) continue;
    if (!nearest || distance < nearest.distance) {
      nearest = {
        point: [x, hitY, z],
        normal: [0, hitY === top ? 1 : -1, 0],
        distance,
        nodeId: box.nodeId
      };
    }
  }
  return nearest;
}

/**
 * Real C-26 implementation. Bound via `worldQueriesSlot.provide` in
 * `lanes/prd10.ts`; the C-38 `world` app extension resolves it through
 * `worldQueriesSlot.get(flags)` so flag-off apps keep the stub.
 */
export function createWorldQueries(app: AuraApp): AuraWorldQueries {
  const state = worldStateFor(app);
  return {
    ground(): GroundRaycaster {
      return {
        raycastDown(x: number, z: number, fromY = 1e4, maxDistance = 2e4) {
          // Terrain first, then physics colliders, then kit AABBs; nearest wins.
          const terrainHit = raycastTerrain(x, z, fromY, maxDistance, state);
          const physicsHit = raycastPhysics(app, x, z, fromY, maxDistance);
          const kitHit = raycastKitAABBs(x, z, fromY, maxDistance, state);
          let nearest: GroundHit | null = null;
          for (const hit of [terrainHit, physicsHit, kitHit]) {
            if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
          }
          return nearest;
        }
      };
    },
    height(): AuraHeightQuery {
      return {
        heightAt(x: number, z: number) {
          let best = Number.NEGATIVE_INFINITY;
          for (const terrain of state.terrains) {
            const h = terrain.heightAt(x, z);
            if (h !== null && h > best) best = h;
          }
          if (Number.isFinite(best)) return best;
          for (const water of state.waters) {
            const h = water.restHeightAt(x, z);
            if (h !== null && h > best) best = h;
          }
          return Number.isFinite(best) ? best : 0;
        },
        normalAt(x: number, z: number) {
          let best = Number.NEGATIVE_INFINITY;
          let normal: AuraVec3 = [0, 1, 0];
          for (const terrain of state.terrains) {
            const h = terrain.heightAt(x, z);
            if (h !== null && h > best) {
              best = h;
              normal = terrain.normalAt(x, z) ?? [0, 1, 0];
            }
          }
          return normal;
        },
        occluderHeightAt(x: number, z: number) {
          return state.occluder?.heightAt(x, z) ?? 0;
        }
      };
    },
    wind(): Required<AuraWindSpec> {
      return state.wind;
    },
    biome(): AuraBiomeRig | null {
      return state.biome;
    },
    describeBiome(id: AuraBiomeId, tier?: AuraWorldQualityTier): AuraBiomeRig {
      return describeBiome(id, tier);
    },
    listBiomes(): readonly AuraBiomeId[] {
      return listBiomes();
    }
  };
}
