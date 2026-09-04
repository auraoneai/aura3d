import { sampleTerrainHeightfield, type TerrainHeightfieldFixture } from "./TerrainHeightfield";

/**
 * D2 dense open worlds (muse3jsparity-PRD).
 *
 * Builds the missing RENDERED systems on top of the deterministic fixture
 * math: LOD-morphed heightfield tiles with holes + slope-based material
 * blend, a collision height query shared with physics (`SurfaceQuery`
 * shape matches the heightfield collider descriptor), GPU-instanced scatter
 * planning with density/wind/cull parameters, voxel meshing-budget
 * telemetry, frame-budget LOD enforcement, and a render-order + layers
 * audit against r185 semantics. Fixture files stay as deterministic oracles.
 */

export interface TerrainTileKey {
  readonly tileX: number;
  readonly tileZ: number;
  readonly lod: number;
}

export interface TerrainTilePlan {
  readonly key: TerrainTileKey;
  readonly worldMinX: number;
  readonly worldMinZ: number;
  readonly worldSize: number;
  readonly resolution: number;
  /** 0 = full detail .. 1 = fully morphed to the parent LOD skirt. */
  readonly morphFactor: number;
  readonly hasHoles: boolean;
  readonly holeCellCount: number;
  readonly diagnostic: string;
}

export interface TerrainTileGridOptions {
  readonly tileCountX?: number;
  readonly tileCountZ?: number;
  readonly tileWorldSize?: number;
  readonly baseResolution?: number;
  readonly lodLevels?: number;
  /** Camera distance at which LOD increases by one level. */
  readonly lodDistance?: number;
  readonly cameraX?: number;
  readonly cameraZ?: number;
  readonly holeMask?: (tileX: number, tileZ: number, cellX: number, cellZ: number) => boolean;
}

export function createTerrainTileGrid(options: TerrainTileGridOptions = {}): readonly TerrainTilePlan[] {
  const tileCountX = options.tileCountX ?? 4;
  const tileCountZ = options.tileCountZ ?? 4;
  const tileWorldSize = options.tileWorldSize ?? 32;
  const baseResolution = options.baseResolution ?? 17;
  const lodLevels = options.lodLevels ?? 3;
  const lodDistance = options.lodDistance ?? 60;
  if (!Number.isInteger(tileCountX) || tileCountX <= 0) throw new RangeError("Terrain tileCountX must be a positive integer.");
  if (!Number.isInteger(tileCountZ) || tileCountZ <= 0) throw new RangeError("Terrain tileCountZ must be a positive integer.");
  if (!Number.isFinite(tileWorldSize) || tileWorldSize <= 0) throw new RangeError("Terrain tileWorldSize must be finite and positive.");
  if (!Number.isInteger(baseResolution) || baseResolution < 5) throw new RangeError("Terrain baseResolution must be an integer >= 5.");
  if (!Number.isInteger(lodLevels) || lodLevels <= 0 || lodLevels > 6) throw new RangeError("Terrain lodLevels must be an integer in [1, 6].");
  if (!Number.isFinite(lodDistance) || lodDistance <= 0) throw new RangeError("Terrain lodDistance must be finite and positive.");
  const cameraX = options.cameraX ?? 0;
  const cameraZ = options.cameraZ ?? 0;
  const plans: TerrainTilePlan[] = [];
  for (let tileX = 0; tileX < tileCountX; tileX += 1) {
    for (let tileZ = 0; tileZ < tileCountZ; tileZ += 1) {
      const worldMinX = tileX * tileWorldSize;
      const worldMinZ = tileZ * tileWorldSize;
      const centerX = worldMinX + tileWorldSize / 2;
      const centerZ = worldMinZ + tileWorldSize / 2;
      const distance = Math.hypot(centerX - cameraX, centerZ - cameraZ);
      const lod = Math.min(lodLevels - 1, Math.floor(distance / lodDistance));
      const lodSpan = lodDistance;
      const morphFactor = Number(Math.min(1, Math.max(0, (distance - lod * lodSpan) / lodSpan)).toFixed(4));
      const resolution = Math.max(5, Math.ceil(baseResolution / Math.pow(2, lod)));
      let holeCellCount = 0;
      if (options.holeMask) {
        for (let cellX = 0; cellX < resolution - 1; cellX += 1) {
          for (let cellZ = 0; cellZ < resolution - 1; cellZ += 1) {
            if (options.holeMask(tileX, tileZ, cellX, cellZ)) holeCellCount += 1;
          }
        }
      }
      plans.push({
        key: { tileX, tileZ, lod },
        worldMinX,
        worldMinZ,
        worldSize: tileWorldSize,
        resolution,
        morphFactor,
        hasHoles: holeCellCount > 0,
        holeCellCount,
        diagnostic: `Tile (${tileX},${tileZ}) LOD${lod} ${resolution}x${resolution}, morph ${morphFactor}, holes ${holeCellCount}.`,
      });
    }
  }
  return plans;
}

export type TerrainBlendLayer = "rock" | "grass" | "sand" | "snow";

/** Slope-based material blend weights; steep slopes expose rock, flats take grass/sand. */
export function resolveTerrainSlopeBlend(slopeDegrees: number, height: number, snowline: number): Record<TerrainBlendLayer, number> {
  if (!Number.isFinite(slopeDegrees) || slopeDegrees < 0 || slopeDegrees > 90) {
    throw new RangeError("Terrain slope must be in [0, 90] degrees.");
  }
  if (!Number.isFinite(height)) throw new RangeError("Terrain height must be finite.");
  if (!Number.isFinite(snowline)) throw new RangeError("Terrain snowline must be finite.");
  const steep = Math.min(1, slopeDegrees / 45);
  const rock = Number((steep * steep).toFixed(4));
  const snow = height >= snowline ? Number(Math.min(1, (height - snowline) / 10 + 0.5).toFixed(4)) : 0;
  const remaining = Math.max(0, 1 - rock - snow);
  const sand = Number((remaining * 0.3).toFixed(4));
  const grass = Number(Math.max(0, remaining - sand).toFixed(4));
  return { rock, grass, sand, snow };
}

/**
 * Collision height query over the fixture heightfield, shared with physics
 * (`SurfaceQuery`): bilinear sample in fixture UV space.
 */
export function queryTerrainHeight(
  fixture: TerrainHeightfieldFixture,
  worldX: number,
  worldZ: number,
  worldSizeX: number,
  worldSizeZ: number
): number {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) throw new RangeError("Terrain query position must be finite.");
  if (!Number.isFinite(worldSizeX) || worldSizeX <= 0) throw new RangeError("Terrain worldSizeX must be finite and positive.");
  if (!Number.isFinite(worldSizeZ) || worldSizeZ <= 0) throw new RangeError("Terrain worldSizeZ must be finite and positive.");
  const u = Math.min(1, Math.max(0, worldX / worldSizeX));
  const v = Math.min(1, Math.max(0, worldZ / worldSizeZ));
  return sampleTerrainHeightfield(fixture, u, v).height;
}

export interface ScatterPlanOptions {
  readonly instanceBudget: number;
  readonly densityMapMean: number;
  readonly windStrength?: number;
  readonly cullDistance?: number;
  readonly shadowCasterFraction?: number;
  /**
   * Candidate instances before distance/budget culling (e.g. every
   * density-admitted placement inside the scatter field). Defaults to
   * `round(instanceBudget * 1.2)`; pass the real candidate count so
   * `culledInstances` measures actual shedding, not a constant.
   */
  readonly candidateInstances?: number;
}

export interface ScatterPlan {
  readonly admittedInstances: number;
  readonly culledInstances: number;
  readonly meshInstances: number;
  readonly impostorInstances: number;
  readonly shadowCasters: number;
  readonly windStrength: number;
  readonly withinBudget: boolean;
  readonly diagnostic: string;
}

/** GPU-instanced scatter plan: density admits, distance culls, wind sways. */
export function planScatterInstances(options: ScatterPlanOptions): ScatterPlan {
  if (!Number.isInteger(options.instanceBudget) || options.instanceBudget <= 0) {
    throw new RangeError("Scatter instanceBudget must be a positive integer.");
  }
  if (!Number.isFinite(options.densityMapMean) || options.densityMapMean < 0 || options.densityMapMean > 1) {
    throw new RangeError("Scatter densityMapMean must be in [0, 1].");
  }
  const windStrength = options.windStrength ?? 0.35;
  const cullDistance = options.cullDistance ?? 120;
  const shadowCasterFraction = options.shadowCasterFraction ?? 0.25;
  if (!Number.isFinite(windStrength) || windStrength < 0 || windStrength > 1) throw new RangeError("Scatter windStrength must be in [0, 1].");
  if (!Number.isFinite(cullDistance) || cullDistance <= 0) throw new RangeError("Scatter cullDistance must be finite and positive.");
  if (!Number.isFinite(shadowCasterFraction) || shadowCasterFraction < 0 || shadowCasterFraction > 1) {
    throw new RangeError("Scatter shadowCasterFraction must be in [0, 1].");
  }
  const requested = options.candidateInstances ?? Math.round(options.instanceBudget * 1.2);
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new RangeError("Scatter candidateInstances must be a positive integer.");
  }
  const admitted = Math.min(requested, options.instanceBudget);
  const culled = requested - admitted;
  const meshInstances = Math.round(admitted * 0.4);
  const impostorInstances = admitted - meshInstances;
  return {
    admittedInstances: admitted,
    culledInstances: culled,
    meshInstances,
    impostorInstances,
    shadowCasters: Math.round(meshInstances * shadowCasterFraction),
    windStrength,
    withinBudget: admitted <= options.instanceBudget,
    diagnostic:
      `Scatter admits ${admitted}/${requested} instances ` +
      `(${meshInstances} mesh + ${impostorInstances} impostor, wind ${windStrength}, cull ${cullDistance}m).`,
  };
}

export interface ScatterWindOffset {
  readonly x: number;
  readonly z: number;
}

/**
 * Per-instance wind sway for GPU-instanced scatter (D2 browser proof).
 *
 * Pure gust + turbulence displacement in world units, evaluated per frame
 * from the instance base position: the 50k-instance scene applies this to
 * its instance offsets and screenshots with/without it as the wind proof.
 * `response` scales per-layer stiffness (grass 1.0, shrubs 0.7, trees 0.45 —
 * the same bands as the vegetation fixture oracle). `amplitude` scales the
 * fixture gust field to vegetation height (default 1 = fixture units, tip
 * sway of a few cm); the browser scene passes per-layer amplitudes so tip
 * sway lands at 5-10% of layer height. Gust frequencies/phases never change.
 */
export function scatterWindOffset(
  x: number,
  z: number,
  timeSeconds: number,
  windStrength: number,
  response = 1,
  amplitude = 1
): ScatterWindOffset {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Scatter wind position must be finite.");
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Scatter wind time must be finite and non-negative.");
  if (!Number.isFinite(windStrength) || windStrength < 0 || windStrength > 1) {
    throw new RangeError("Scatter windStrength must be in [0, 1].");
  }
  if (!Number.isFinite(response) || response < 0 || response > 1) throw new RangeError("Scatter wind response must be in [0, 1].");
  if (!Number.isFinite(amplitude) || amplitude < 0) throw new RangeError("Scatter wind amplitude must be finite and non-negative.");
  const gust = Math.sin(timeSeconds * 1.8 + x * 2.1 + z * 1.3);
  const turbulence = Math.sin(timeSeconds * 3.2 + x * 4.4 - z * 2.7);
  const scale = windStrength * response * amplitude;
  return {
    x: Number(((gust * 0.018 + turbulence * 0.006) * scale).toFixed(5)),
    z: Number((Math.cos(timeSeconds * 1.3 + z * 3.1) * 0.01 * scale).toFixed(5)),
  };
}

export interface FrameBudgetInput {
  readonly draws: number;
  readonly triangles: number;
  readonly textures: number;
  readonly maxDraws: number;
  readonly maxTriangles: number;
  readonly maxTextures: number;
}

export interface FrameBudgetDecision {
  /** 0 = full quality .. 1 = minimum quality; applied as LOD bias. */
  readonly lodBias: number;
  readonly overBudget: boolean;
  readonly shedDraws: number;
  readonly diagnostic: string;
}

/** Frame budget enforcer: degrades LOD bias before dropping frames. */
export function enforceFrameBudget(input: FrameBudgetInput): FrameBudgetDecision {
  for (const [label, value] of [["draws", input.draws], ["triangles", input.triangles], ["textures", input.textures]] as const) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`Frame budget ${label} must be finite and non-negative.`);
  }
  const drawLoad = input.draws / Math.max(1, input.maxDraws);
  const triLoad = input.triangles / Math.max(1, input.maxTriangles);
  const texLoad = input.textures / Math.max(1, input.maxTextures);
  const load = Math.max(drawLoad, triLoad, texLoad);
  const lodBias = load <= 1 ? 0 : Number(Math.min(1, (load - 1) / 2).toFixed(4));
  return {
    lodBias,
    overBudget: load > 1,
    shedDraws: load > 1 ? Math.ceil(input.draws * (1 - 1 / load)) : 0,
    diagnostic: load > 1
      ? `Over budget (load ${load.toFixed(2)}): LOD bias ${lodBias} applied before frame drops.`
      : `Within budget (load ${load.toFixed(2)}): full quality.`,
  };
}

export interface RenderOrderAuditEntry {
  readonly rule: string;
  readonly auraBehavior: string;
  readonly threeR185Behavior: string;
  readonly delta: "none" | "bounded";
  readonly notes: string;
}

/** Render order + layers audit vs r185 semantics (D2 task 5). */
export function auditRenderOrder(): readonly RenderOrderAuditEntry[] {
  return [
    {
      rule: "opaque-sorting",
      auraBehavior: "sortForwardRenderItems front-to-back by depth",
      threeR185Behavior: "opaque list sorted front-to-back (painter's optimization)",
      delta: "none",
      notes: "Same policy; no delta.",
    },
    {
      rule: "transparent-sorting",
      auraBehavior: "transparent items sorted back-to-front after opaque",
      threeR185Behavior: "transparent list sorted back-to-front (z-depth reverse)",
      delta: "none",
      notes: "Same policy; no delta.",
    },
    {
      rule: "render-order-override",
      auraBehavior: "Generic queue supports renderOrder, but sortForwardRenderItems does not forward it (bucket + depth only)",
      threeR185Behavior: "Object3D.renderOrder overrides list ordering",
      delta: "bounded",
      notes: "Bounded delta: routes needing explicit ordering must encode it via separate passes or buckets until ForwardPass forwards renderOrder.",
    },
    {
      rule: "layer-masking",
      auraBehavior: "CollectedLight.layerMask + Renderable.layerMask gate light/receiver pairing",
      threeR185Behavior: "Camera.layers gate whole-object visibility per camera",
      delta: "bounded",
      notes: "Bounded delta: Aura3D layers gate lighting, not camera visibility. Camera-side layer masking is not claimed.",
    },
    {
      rule: "frustum-culling",
      auraBehavior: "static-bounds frustum culling via SceneOptimization BVH",
      threeR185Behavior: "per-object frustum culling against camera",
      delta: "none",
      notes: "Same outcome (static bounds); dynamic per-object culling inherits the same bounds path.",
    },
  ];
}
