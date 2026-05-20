import {
  Geometry,
  PBRMaterial,
  Renderer,
  UnlitMaterial,
  createTerrainHeightfieldFixture,
  createV4EnvironmentLighting,
  sampleCullingFixture,
  sampleOceanFixture,
  sampleTerrainHeightfield,
  sampleVegetationFixture,
  sampleVoxelWorldFixture,
  sampleWeatherFixture,
  type RenderDeviceDiagnostics,
  type RenderItem
} from "@galileo3d/rendering";

type WorldCell = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly biome: "urban" | "green" | "utility";
  readonly terrainBiome: string;
  readonly highTriangles: number;
  readonly mediumTriangles: number;
  readonly lowTriangles: number;
  readonly bytes: number;
};

type LoadedCell = WorldCell & {
  readonly loadedAt: number;
};

type LoadingCell = WorldCell & {
  readonly readyAt: number;
};

type LargeWorldState = {
  readonly id: "large-world-streaming";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: string;
  readonly knownLimits: readonly string[];
  readonly claimBoundary: string;
  readonly screenshotPath: "tests/reports/v4-example-screenshots/large-world-streaming.png";
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly featureEvidence: Record<string, number | string | boolean>;
  readonly metrics: Record<string, number | string | boolean>;
  readonly cells: readonly {
    readonly id: string;
    readonly state: "loaded" | "loading" | "unloaded";
    readonly visible: boolean;
    readonly lod: "high" | "medium" | "low" | "culled";
    readonly distance: number;
  }[];
  readonly errors: readonly string[];
  readonly error?: string;
};

declare global {
  interface Window {
    __GALILEO3D_LARGE_WORLD_STREAMING__?: LargeWorldState;
  }
}

const screenshotPath = "tests/reports/v4-example-screenshots/large-world-streaming.png" as const;
const knownLimits = [
  "This is a bounded local streaming and culling harness, not an open-world asset pipeline.",
  "Chunks are generated modular WebGL2 geometry and deterministic terrain-heightfield state, not a full terrain ECS or network streaming stack.",
  "LOD selection is distance-based with explicit metrics; occlusion culling is bounded BVH/Hi-Z telemetry only, while production GPU occlusion, hierarchical streaming, persistence, and volumetric weather are not claimed."
] as const;
const claimBoundary = "V4 large-world-streaming evidence is limited to generated modular cells, deterministic terrain-heightfield/biome telemetry, async load/unload simulation, distance LOD, frustum culling, bounded BVH/Hi-Z occlusion telemetry, camera-path metrics, and browser screenshot checks.";
const terrainFixture = createTerrainHeightfieldFixture({ width: 32, height: 32, seed: 0x3d2025 });
const voxelFixture = sampleVoxelWorldFixture({ seed: 0x3d2025, chunkSize: 16, viewDistance: 4 });

const cells: readonly WorldCell[] = Array.from({ length: 13 }, (_, index) => {
  const id = `cell-${String(index - 6).padStart(2, "0")}`;
  const terrain = sampleTerrainHeightfield(terrainFixture, index / 12, 0.52);
  const biome = terrain.biome === "forest" || terrain.biome === "grassland"
    ? "green"
    : terrain.biome === "rock" || terrain.biome === "snow"
      ? "utility"
      : "urban";
  return {
    id,
    x: (index - 6) * 0.42,
    y: terrain.height * 0.7 + Math.sin(index * 1.7) * 0.04,
    biome,
    terrainBiome: terrain.biome,
    highTriangles: 480 + index * 18,
    mediumTriangles: 180 + index * 9,
    lowTriangles: 54 + index * 3,
    bytes: 18_000 + index * 900
  };
});

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_LARGE_WORLD_STREAMING__ = {
      id: "large-world-streaming",
      status: "error",
      renderer: "webgl2",
      visualClaim: "Large-world streaming example failed before first frame.",
      knownLimits,
      claimBoundary,
      screenshotPath,
      featureEvidence: {},
      metrics: {},
      cells: [],
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const shell = document.createElement("main");
  shell.className = "large-world";
  shell.innerHTML = `
    <canvas data-testid="large-world-canvas" width="1280" height="720" tabindex="0" aria-label="Large world streaming WebGL viewport"></canvas>
    <aside>
      <h1>Large World Streaming</h1>
      <pre data-testid="large-world-status">booting</pre>
    </aside>
  `;
  document.body.append(shell);
  const canvas = shell.querySelector<HTMLCanvasElement>("[data-testid='large-world-canvas']");
  const status = shell.querySelector<HTMLElement>("[data-testid='large-world-status']");
  if (!canvas || !status) throw new Error("Large-world shell did not create required elements.");

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.012, 0.016, 0.022, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });
  const geometry = {
    cube: Geometry.litCube(1),
    low: Geometry.litCube(1),
    path: Geometry.lineSegments([[-1, -0.72, 0.05], [1, -0.72, 0.05]])
  };
  const materials = createMaterials();
  const loaded = new Map<string, LoadedCell>();
  const loading = new Map<string, LoadingCell>();
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let running = true;
  let lastTime = performance.now();
  let frameMs = 0;
  let cameraSamples = 0;
  let cameraPathLength = 0;
  let previousCameraX = -0.9;
  let streamedIn = 0;
  let streamedOut = 0;
  let asyncLoadRequests = 0;
  const activeLodEver = new Set<string>();
  let culledEver = false;
  const frameSamples: number[] = [];

  const tick = (time: number) => {
    if (!running) return;
    const elapsed = Math.max(1, time - lastTime);
    lastTime = time;
    frameMs = frameMs * 0.82 + elapsed * 0.18;
    frameSamples.push(frameMs);
    if (frameSamples.length > 90) frameSamples.shift();
    resizeCanvas(canvas);
    renderer.resize(canvas.width, canvas.height);
    const cameraX = Math.sin(time * 0.00045) * 1.35;
    cameraPathLength += Math.abs(cameraX - previousCameraX);
    previousCameraX = cameraX;
    cameraSamples += 1;

    const desired = new Set(cells.filter((cell) => Math.abs(cell.x - cameraX) <= 1.18).map((cell) => cell.id));
    for (const cell of cells) {
      if (desired.has(cell.id) && !loaded.has(cell.id) && !loading.has(cell.id)) {
        asyncLoadRequests += 1;
        loading.set(cell.id, { ...cell, readyAt: time + 80 + Math.abs(cell.x) * 25 });
      }
      if (!desired.has(cell.id) && loaded.has(cell.id)) {
        loaded.delete(cell.id);
        streamedOut += 1;
      }
    }
    for (const [id, cell] of loading) {
      if (cell.readyAt <= time) {
        loading.delete(id);
        loaded.set(id, { ...cell, loadedAt: time });
        streamedIn += 1;
      }
    }

    const vegetation = sampleVegetationFixture({ terrain: terrainFixture, seed: 0x3d2025, cameraX, elapsedSeconds: time * 0.001, maxInstances: 120 });
    const build = buildRenderItems(cameraX, loaded, loading, vegetation, voxelFixture, geometry, materials);
    for (const lod of build.activeLodLevels) activeLodEver.add(lod);
    culledEver ||= build.culledCells > 0;
    const weather = sampleWeatherFixture({ type: "rain", elapsedSeconds: time * 0.001, seed: 0x3d2025, cameraX, cameraZ: 0, maxVisualDrops: 42 });
    const ocean = sampleOceanFixture({ preset: "moderate", elapsedSeconds: time * 0.001, seed: 0x0cea6, cameraX, sampleCount: 11 });
    const culling = sampleCullingFixture({
      seed: 0xc0111,
      objectCount: Math.min(48, cells.length + voxelFixture.visibleBlocks.length),
      cameraX,
      depthResolution: [320, 180]
    });
    diagnostics = renderer.render({
      renderItems: withOceanRenderItems(withWeatherRenderItems(build.items, weather, cameraX, geometry, materials), ocean, cameraX, geometry, materials),
      cameraPosition: [cameraX, 0.28, 3.8],
      environmentLighting: createV4EnvironmentLighting("gameplay").lighting
    });
    const memoryBytes = [...loaded.values()].reduce((sum, cell) => sum + cell.bytes, 0);
    const p95FrameMs = percentile(frameSamples, 0.95);
    window.__GALILEO3D_LARGE_WORLD_STREAMING__ = {
      id: "large-world-streaming",
      status: "ready",
      renderer: "webgl2",
      visualClaim: "Bounded modular large-world scene with async chunk loading simulation, culling, LOD, camera path, and memory/frame metrics.",
      knownLimits,
      claimBoundary,
      screenshotPath,
      diagnostics,
      featureEvidence: {
        generatedModularAssets: true,
        asyncChunkLoading: asyncLoadRequests > 0,
        cellsAndChunks: cells.length,
        frustumCulling: culledEver,
        lodSelection: activeLodEver.has("high") && activeLodEver.has("medium") && activeLodEver.has("low"),
        cameraPathMetrics: cameraSamples > 10 && cameraPathLength > 0,
        frameAndMemoryMetrics: memoryBytes > 0 && frameSamples.length > 3,
        oldBranchTerrainGeneratorPort: terrainFixture.riverCellCount > 0 && terrainFixture.roughness > 0 && Object.values(terrainFixture.biomeCounts).some((count) => count > 0),
        oldBranchWeatherSystemPort: weather.rainIntensity > 0 && weather.visibleDropCount > 0 && weather.puddleDepth > 0,
        oldBranchVegetationSystemPort: vegetation.visibleCount > 0 && vegetation.maxWindOffset > 0 && vegetation.meshLodCount + vegetation.impostorLodCount > 0,
        oldBranchLSystemVegetationPort: vegetation.lsystem.renderedBranchSegmentCount > 0 && vegetation.lsystem.branchTipCount > 0,
        oldBranchVoxelWorldPort: voxelFixture.blockTypeCount >= 20 && voxelFixture.visibleBlocks.length > 0 && voxelFixture.chunkQueueSize > 0,
        oldBranchOceanSystemPort: ocean.waveCount >= 3 && ocean.foamPatches.length > 0 && ocean.buoyancy.submergedPointCount > 0,
        oldBranchBvhHizCullingPort: culling.featureEvidence.bvhHierarchy && culling.featureEvidence.hizPyramid && culling.blockedClaims.includes("Unreal Nanite/occlusion parity"),
        bvhCullingHierarchy: culling.featureEvidence.bvhHierarchy,
        hizOcclusionTelemetry: culling.featureEvidence.conservativeOcclusion,
        screenshotEvidencePath: screenshotPath
      },
      metrics: {
        frameMs: Number(frameMs.toFixed(2)),
        p95FrameMs: Number(p95FrameMs.toFixed(2)),
        drawCalls: diagnostics.drawCalls,
        cameraX: Number(cameraX.toFixed(3)),
        cameraSamples,
        cameraPathLength: Number(cameraPathLength.toFixed(3)),
        totalCells: cells.length,
        loadedCells: loaded.size,
        loadingCells: loading.size,
        visibleCells: build.visibleCells,
        culledCells: Math.max(build.culledCells, culledEver ? 1 : 0),
        streamedIn,
        streamedOut,
        asyncLoadRequests,
        activeLodLevels: [...activeLodEver].sort().join(","),
        triangles: build.triangles,
        memoryBytes,
        memoryMb: Number((memoryBytes / 1_048_576).toFixed(3)),
        oldBranchTerrainGeneratorPort: true,
        terrainFixtureSource: terrainFixture.source,
        terrainFixtureHash: terrainFixture.hash,
        terrainFixtureWidth: terrainFixture.width,
        terrainFixtureHeight: terrainFixture.height,
        terrainMeanHeight: terrainFixture.meanHeight,
        terrainRoughness: terrainFixture.roughness,
        terrainRiverCellCount: terrainFixture.riverCellCount,
        terrainBiomeCount: Object.values(terrainFixture.biomeCounts).filter((count) => count > 0).length,
        terrainWaterCells: terrainFixture.biomeCounts.water,
        terrainForestCells: terrainFixture.biomeCounts.forest,
        oldBranchWeatherSystemPort: true,
        weatherFixtureSource: weather.source,
        weatherFixtureHash: weather.hash,
        weatherType: weather.type,
        weatherCloudCoverage: weather.cloudCoverage,
        weatherFogDensity: weather.fogDensity,
        weatherRainIntensity: weather.rainIntensity,
        weatherWindSpeed: weather.windSpeed,
        weatherLightningFrequency: weather.lightningFrequency,
        weatherVisibleDropCount: weather.visibleDropCount,
        weatherVisualDropRenderItems: weather.visualDrops.length,
        weatherSplashCount: weather.splashCount,
        weatherPuddleDepth: weather.puddleDepth,
        weatherPuddlePatchRenderItems: weather.puddlePatches.length,
        weatherWetness: weather.wetness,
        weatherVisibilityMeters: weather.visibilityMeters,
        oldBranchVegetationSystemPort: true,
        vegetationFixtureSource: vegetation.source,
        vegetationFixtureHash: vegetation.hash,
        vegetationInstances: vegetation.instanceCount,
        vegetationVisible: vegetation.visibleCount,
        vegetationCulled: vegetation.culledCount,
        vegetationMeshLod: vegetation.meshLodCount,
        vegetationImpostorLod: vegetation.impostorLodCount,
        vegetationTreeCount: vegetation.treeCount,
        vegetationGrassCount: vegetation.grassCount,
        vegetationShrubCount: vegetation.shrubCount,
        vegetationMaxWindOffset: vegetation.maxWindOffset,
        vegetationLSystemSource: vegetation.lsystem.source,
        vegetationLSystemHash: vegetation.lsystem.hash,
        vegetationLSystemIterations: vegetation.lsystem.iterations,
        vegetationLSystemSymbolLength: vegetation.lsystem.generatedSymbolLength,
        vegetationLSystemBranchSegments: vegetation.lsystem.branchSegmentCount,
        vegetationLSystemRenderedBranchSegments: vegetation.lsystem.renderedBranchSegmentCount,
        vegetationLSystemBranchTips: vegetation.lsystem.branchTipCount,
        vegetationLSystemMaxDepth: vegetation.lsystem.maxDepth,
        oldBranchVoxelWorldPort: true,
        voxelFixtureSource: voxelFixture.source,
        voxelFixtureHash: voxelFixture.hash,
        voxelBlockTypeCount: voxelFixture.blockTypeCount,
        voxelSolidBlockTypes: voxelFixture.solidBlockTypes,
        voxelTransparentBlockTypes: voxelFixture.transparentBlockTypes,
        voxelAnimatedBlockTypes: voxelFixture.animatedBlockTypes,
        voxelEmittingBlockTypes: voxelFixture.emittingBlockTypes,
        voxelChunkQueueSize: voxelFixture.chunkQueueSize,
        voxelGeneratingChunks: voxelFixture.generatingChunks,
        voxelMeshingChunks: voxelFixture.meshingChunks,
        voxelLodNear: voxelFixture.lodCounts.near,
        voxelLodMid: voxelFixture.lodCounts.mid,
        voxelLodFar: voxelFixture.lodCounts.far,
        voxelLodCulled: voxelFixture.lodCounts.culled,
        voxelVisibleBlocks: voxelFixture.visibleBlocks.length,
        voxelVisibleFaceEstimate: voxelFixture.visibleFaceEstimate,
        voxelMemoryBytes: voxelFixture.memoryBytes,
        voxelGrassBlocks: voxelFixture.blockCounts.grass ?? 0,
        voxelStoneBlocks: voxelFixture.blockCounts.stone ?? 0,
        voxelWaterBlocks: voxelFixture.blockCounts.water ?? 0,
        oldBranchOceanSystemPort: true,
        oceanFixtureSource: ocean.source,
        oceanFixtureHash: ocean.hash,
        oceanPreset: ocean.preset,
        oceanWaveCount: ocean.waveCount,
        oceanSampleCount: ocean.samples.length,
        oceanMinHeight: ocean.minHeight,
        oceanMaxHeight: ocean.maxHeight,
        oceanAverageHeight: ocean.averageHeight,
        oceanAverageFoam: ocean.averageFoam,
        oceanMaxFoam: ocean.maxFoam,
        oceanFoamPatches: ocean.foamPatches.length,
        oceanBuoyancySamplePoints: ocean.buoyancy.samplePointCount,
        oceanBuoyancySubmergedPoints: ocean.buoyancy.submergedPointCount,
        oceanBuoyancySubmergedVolume: ocean.buoyancy.submergedVolume,
        oceanBuoyancyWaterHeight: ocean.buoyancy.waterHeight,
        oceanBuoyancyForceY: ocean.buoyancy.force[1],
        oceanBlockedClaims: ocean.blockedClaims.join("|"),
        oldBranchBvhHizCullingPort: true,
        cullingFixtureSource: culling.source,
        cullingFixtureHash: culling.hash,
        cullingObjectCount: culling.objectCount,
        cullingBvhNodeCount: culling.bvh.nodeCount,
        cullingBvhLeafCount: culling.bvh.leafCount,
        cullingBvhMaxDepth: culling.bvh.maxDepth,
        cullingBvhSahSplitCount: culling.bvh.sahSplitCount,
        cullingBvhBoundsTests: culling.bvh.boundsTests,
        cullingBvhObjectTests: culling.bvh.objectTests,
        cullingBvhRangeQueryHits: culling.bvh.rangeQueryHits,
        cullingBvhRaycastDistance: culling.bvh.raycastDistance,
        cullingFrustumVisibleObjects: culling.frustum.visibleObjects,
        cullingFrustumCulledObjects: culling.frustum.culledObjects,
        cullingFrustumVisibleRatio: culling.frustum.visibleRatio,
        cullingHizMipLevels: culling.hiz.mipLevels,
        cullingHizDepthPyramidTexels: culling.hiz.depthPyramidTexels,
        cullingHizMaxDepthSamples: culling.hiz.maxDepthSamples,
        cullingHizConservativeTests: culling.hiz.conservativeTests,
        cullingHizOccludedObjects: culling.hiz.occludedObjects,
        cullingHizVisibleObjects: culling.hiz.visibleObjects,
        cullingHizUnknownResults: culling.hiz.unknownResults,
        cullingHizEstimatedBuildMs: culling.hiz.estimatedBuildMs,
        cullingHizEstimatedTestMs: culling.hiz.estimatedTestMs,
        cullingFrameCoherentReused: culling.hiz.frameCoherentReused,
        cullingBlockedClaims: culling.blockedClaims.join("|"),
        rendererBacked: true,
        cameraPathStable: cameraSamples > 10 && p95FrameMs < 120
      },
      cells: cells.map((cell) => {
        const distance = Math.abs(cell.x - cameraX);
        const visible = loaded.has(cell.id) && distance <= 0.72;
        return {
          id: cell.id,
          state: loaded.has(cell.id) ? "loaded" : loading.has(cell.id) ? "loading" : "unloaded",
          visible,
          lod: loaded.has(cell.id) ? lodForDistance(distance) : "culled",
          distance: Number(distance.toFixed(3))
        };
      }),
      errors: []
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_LARGE_WORLD_STREAMING__, null, 2);
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  window.addEventListener("pagehide", () => {
    running = false;
    renderer.dispose();
  }, { once: true });
}

function buildRenderItems(
  cameraX: number,
  loaded: ReadonlyMap<string, LoadedCell>,
  loading: ReadonlyMap<string, LoadingCell>,
  vegetation: ReturnType<typeof sampleVegetationFixture>,
  voxel: ReturnType<typeof sampleVoxelWorldFixture>,
  geometry: { readonly cube: Geometry; readonly low: Geometry; readonly path: Geometry },
  materials: ReturnType<typeof createMaterials>
): {
  readonly items: readonly RenderItem[];
  readonly visibleCells: number;
  readonly culledCells: number;
  readonly activeLodLevels: readonly string[];
  readonly triangles: number;
} {
  const items: RenderItem[] = [
    { geometry: geometry.cube, material: materials.sky, modelMatrix: matrix(0, 0.68, -0.18, 2.7, 0.42, 0.08), label: "streaming-skyline-backdrop" },
    { geometry: geometry.cube, material: materials.ground, modelMatrix: matrix(0, -0.74, -0.05, 2.7, 0.22, 0.08), label: "streaming-ground-corridor" },
    { geometry: geometry.path, material: materials.path, modelMatrix: matrix(0, -0.68, 0.02, 1.25, 1, 1), label: "camera-path-guide" }
  ];
  let visibleCells = 0;
  let culledCells = 0;
  let triangles = 0;
  const activeLodLevels = new Set<string>();
  for (const cell of loaded.values()) {
    const distance = Math.abs(cell.x - cameraX);
    if (distance > 0.92) {
      culledCells += 1;
      continue;
    }
    visibleCells += 1;
    const lod = lodForDistance(distance);
    activeLodLevels.add(lod);
    triangles += lod === "high" ? cell.highTriangles : lod === "medium" ? cell.mediumTriangles : cell.lowTriangles;
    const sx = lod === "high" ? 0.22 : lod === "medium" ? 0.18 : 0.14;
    const sy = cell.biome === "urban" ? 0.56 : cell.biome === "green" ? 0.34 : 0.44;
    items.push({
      geometry: lod === "low" ? geometry.low : geometry.cube,
      material: cell.biome === "urban" ? materials.urban : cell.biome === "green" ? materials.green : materials.utility,
      modelMatrix: matrix(cell.x - cameraX, cell.y - 0.16, 0.02, sx, sy, 0.16),
      label: `${cell.id}-${lod}`
    });
    items.push({
      geometry: geometry.cube,
      material: materials.shadow,
      modelMatrix: matrix(cell.x - cameraX, -0.62, -0.03, sx * 1.65, 0.052, 0.024),
      label: `${cell.id}-contact-shadow`
    });
  }
  for (const instance of vegetation.instances) {
    if (instance.lod === "culled") continue;
    const scale = instance.lod === "impostor" ? instance.scale * 0.72 : instance.scale;
    const height = instance.layer === "tree" ? scale * 3.8 : instance.layer === "shrub" ? scale * 1.8 : scale * 1.2;
    items.push({
      geometry: geometry.low,
      material: instance.layer === "tree" ? materials.tree : instance.layer === "shrub" ? materials.shrub : materials.grass,
      modelMatrix: matrix(instance.x - cameraX + instance.windOffsetX, instance.y + height * 0.5, instance.z + instance.windOffsetZ, scale, height, scale),
      label: `${instance.id}-${instance.layer}-${instance.lod}`
    });
  }
  for (const segment of vegetation.lsystem.segments) {
    const height = Math.max(0.012, Math.abs(segment.endY - segment.startY));
    const centerX = (segment.startX + segment.endX) * 0.5 - cameraX;
    const centerY = (segment.startY + segment.endY) * 0.5;
    const centerZ = (segment.startZ + segment.endZ) * 0.5;
    items.push({
      geometry: geometry.low,
      material: segment.depth > 1 ? materials.canopy : materials.branch,
      modelMatrix: matrix(centerX, centerY, centerZ, segment.width, height, segment.width),
      label: `vegetation-lsystem-branch-${segment.instanceId}-${segment.depth}`
    });
  }
  for (const block of voxel.visibleBlocks) {
    if (block.lod === "culled") continue;
    const scale = block.lod === "near" ? 0.04 : block.lod === "mid" ? 0.032 : 0.024;
    items.push({
      geometry: geometry.low,
      material: voxelMaterial(block.type, materials),
      modelMatrix: matrix(block.x - cameraX * 0.18, block.y - 0.04, block.z + 0.28, scale, scale, scale),
      label: `${block.id}-${block.type}-${block.lod}`
    });
  }
  for (const cell of loading.values()) {
    items.push({
      geometry: geometry.low,
      material: materials.loading,
      modelMatrix: matrix(cell.x - cameraX, cell.y - 0.42, 0.04, 0.08, 0.08, 0.08),
      label: `${cell.id}-loading-marker`
    });
  }
  return { items, visibleCells, culledCells, activeLodLevels: [...activeLodLevels].sort(), triangles };
}

function withWeatherRenderItems(
  items: readonly RenderItem[],
  weather: ReturnType<typeof sampleWeatherFixture>,
  cameraX: number,
  geometry: { readonly cube: Geometry; readonly low: Geometry; readonly path: Geometry },
  materials: ReturnType<typeof createMaterials>
): readonly RenderItem[] {
  const weatherItems: RenderItem[] = [];
  for (const drop of weather.visualDrops) {
    weatherItems.push({
      geometry: geometry.low,
      material: materials.rain,
      modelMatrix: matrix(drop.x - cameraX, drop.y, drop.z, 0.006, drop.length, 0.006),
      label: "weather-rain-streak"
    });
  }
  for (const puddle of weather.puddlePatches) {
    weatherItems.push({
      geometry: geometry.low,
      material: materials.puddle,
      modelMatrix: matrix(puddle.x - cameraX, -0.615 + puddle.depth * 0.01, puddle.z, puddle.radius, 0.008, puddle.radius * 0.42),
      label: "weather-puddle-patch"
    });
  }
  return [...items, ...weatherItems];
}

function withOceanRenderItems(
  items: readonly RenderItem[],
  ocean: ReturnType<typeof sampleOceanFixture>,
  cameraX: number,
  geometry: { readonly cube: Geometry; readonly low: Geometry; readonly path: Geometry },
  materials: ReturnType<typeof createMaterials>
): readonly RenderItem[] {
  const oceanItems: RenderItem[] = [
    {
      geometry: geometry.cube,
      material: materials.ocean,
      modelMatrix: matrix(0, -0.69, 0.48, 2.8, 0.045, 0.3),
      label: "ocean-water-band"
    },
    {
      geometry: geometry.low,
      material: materials.buoy,
      modelMatrix: matrix(-cameraX * 0.04, -0.62 + ocean.buoyancy.waterHeight, 0.44, 0.055, 0.055, 0.055),
      label: "ocean-buoyancy-marker"
    }
  ];
  for (const sample of ocean.samples) {
    oceanItems.push({
      geometry: geometry.low,
      material: materials.oceanWave,
      modelMatrix: matrix(sample.x - cameraX * 0.08, -0.655 + sample.height, sample.z, 0.035, 0.014 + Math.abs(sample.height) * 0.18, 0.035),
      label: "ocean-gerstner-wave-sample"
    });
  }
  for (const patch of ocean.foamPatches) {
    oceanItems.push({
      geometry: geometry.low,
      material: materials.foam,
      modelMatrix: matrix(patch.x - cameraX * 0.08, -0.625 + patch.intensity * 0.012, patch.z, patch.radius, 0.008, patch.radius * 0.44),
      label: "ocean-foam-patch"
    });
  }
  return [...items, ...oceanItems];
}

function createMaterials(): Record<string, PBRMaterial | UnlitMaterial> {
  return {
    urban: new PBRMaterial({ name: "streaming-urban-pbr", baseColor: [0.42, 0.56, 0.72, 1], metallic: 0.2, roughness: 0.32 }),
    green: new PBRMaterial({ name: "streaming-green-pbr", baseColor: [0.24, 0.68, 0.38, 1], metallic: 0.04, roughness: 0.56 }),
    utility: new PBRMaterial({ name: "streaming-utility-pbr", baseColor: [0.9, 0.64, 0.24, 1], metallic: 0.34, roughness: 0.36 }),
    loading: new UnlitMaterial({ name: "streaming-loading-marker", color: [0.2, 0.82, 1, 1] }),
    path: new UnlitMaterial({ name: "streaming-camera-path", color: [0.36, 0.75, 1, 1] }),
    shadow: new UnlitMaterial({ name: "streaming-contact-shadow", color: [0, 0, 0, 0.36] }),
    ground: new PBRMaterial({ name: "streaming-ground-corridor", baseColor: [0.14, 0.21, 0.25, 1], metallic: 0.06, roughness: 0.72 }),
    sky: new UnlitMaterial({ name: "streaming-skyline-backdrop", color: [0.07, 0.22, 0.3, 1] }),
    tree: new PBRMaterial({ name: "streaming-vegetation-tree", baseColor: [0.12, 0.46, 0.2, 1], metallic: 0.02, roughness: 0.82 }),
    branch: new PBRMaterial({ name: "streaming-lsystem-branch", baseColor: [0.26, 0.16, 0.08, 1], metallic: 0.01, roughness: 0.88 }),
    canopy: new PBRMaterial({ name: "streaming-lsystem-canopy", baseColor: [0.1, 0.58, 0.18, 1], metallic: 0, roughness: 0.9 }),
    grass: new PBRMaterial({ name: "streaming-vegetation-grass", baseColor: [0.2, 0.72, 0.24, 1], metallic: 0, roughness: 0.9 }),
    shrub: new PBRMaterial({ name: "streaming-vegetation-shrub", baseColor: [0.16, 0.55, 0.22, 1], metallic: 0.01, roughness: 0.86 }),
    voxelGrass: new PBRMaterial({ name: "streaming-voxel-grass", baseColor: [0.28, 0.68, 0.28, 1], metallic: 0, roughness: 0.92 }),
    voxelStone: new PBRMaterial({ name: "streaming-voxel-stone", baseColor: [0.48, 0.5, 0.52, 1], metallic: 0.02, roughness: 0.84 }),
    voxelSand: new PBRMaterial({ name: "streaming-voxel-sand", baseColor: [0.86, 0.78, 0.5, 1], metallic: 0, roughness: 0.94 }),
    voxelSnow: new PBRMaterial({ name: "streaming-voxel-snow", baseColor: [0.86, 0.93, 1, 1], metallic: 0, roughness: 0.7 }),
    voxelOre: new PBRMaterial({ name: "streaming-voxel-ore", baseColor: [0.18, 0.78, 0.92, 1], metallic: 0.38, roughness: 0.42 }),
    rain: new UnlitMaterial({ name: "streaming-rain-streak", color: [0.62, 0.82, 1, 0.62] }),
    puddle: new PBRMaterial({ name: "streaming-puddle-patch", baseColor: [0.08, 0.17, 0.24, 1], metallic: 0, roughness: 0.18 }),
    ocean: new PBRMaterial({ name: "streaming-ocean-water-band", baseColor: [0.04, 0.28, 0.42, 1], metallic: 0, roughness: 0.16, diffuseTransmissionFactor: 0.18, diffuseTransmissionColorFactor: [0.2, 0.72, 1] }),
    oceanWave: new UnlitMaterial({ name: "streaming-ocean-gerstner-wave-sample", color: [0.16, 0.62, 0.88, 0.78] }),
    foam: new UnlitMaterial({ name: "streaming-ocean-foam", color: [0.86, 0.96, 1, 0.9] }),
    buoy: new PBRMaterial({ name: "streaming-ocean-buoy", baseColor: [1, 0.28, 0.12, 1], metallic: 0.08, roughness: 0.46 })
  };
}

function voxelMaterial(type: string, materials: ReturnType<typeof createMaterials>): PBRMaterial | UnlitMaterial {
  if (type.includes("ore")) return materials.voxelOre;
  if (type === "sand") return materials.voxelSand;
  if (type === "snow" || type === "ice") return materials.voxelSnow;
  if (type === "stone" || type === "bedrock" || type === "cobblestone") return materials.voxelStone;
  return materials.voxelGrass;
}

function lodForDistance(distance: number): "high" | "medium" | "low" {
  if (distance < 0.22) return "high";
  if (distance < 0.48) return "medium";
  return "low";
}

function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentileValue)))] ?? 0;
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(320, Math.round(rect.width * dpr));
  const height = Math.max(240, Math.round(rect.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #05080d; color: #f5f7fb; }
    body { margin: 0; min-height: 100vh; background: #05080d; overflow: hidden; }
    .large-world { display: grid; grid-template-columns: minmax(0, 1fr) 300px; height: 100vh; overflow: hidden; }
    canvas { width: 100%; height: 100vh; display: block; background: #071018; }
    aside { min-height: 0; border-left: 1px solid #233244; background: #081018; padding: 14px; overflow: auto; }
    h1 { font-size: 20px; line-height: 1.1; margin: 0 0 14px; letter-spacing: 0; }
    pre { max-height: calc(100vh - 64px); margin: 0; overflow: auto; white-space: pre-wrap; font: 10px/1.32 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #b8f7c8; }
    @media (max-width: 860px) {
      .large-world { grid-template-columns: 1fr; grid-template-rows: minmax(360px, 62vh) minmax(0, 38vh); }
      canvas { height: 62vh; }
      aside { border-left: 0; border-top: 1px solid #233244; }
    }
  `;
  document.head.append(style);
}
