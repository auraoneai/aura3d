import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Texture,
  createProceduralTexture,
  createProceduralTextureFixture,
  createProceduralTextureFixtureManifest,
  createProductTurntableFixture,
  createProductTurntableRenderKit,
  createTerrainHeightfieldFixture,
  createTerrainHeightfieldGeometry,
  normalFromHeightMap,
  proceduralTextureFixtureKinds,
  sampleTerrainHeightfield,
  sampleOceanFixture,
  createSpaceEnvironment,
  sampleVegetationFixture,
  createVoxelWorld,
  createWeatherState
} from "../../../packages/rendering/src";

describe("procedural texture fixtures", () => {
  it("generates deterministic local texture fixtures for every ExternalParity material category", () => {
    const expectedKinds = [
      "metallic-paint",
      "metallic-roughness-map",
      "racing-stripes",
      "racing-number-decal",
      "carbon-fiber",
      "tire-tread",
      "concrete-asphalt",
      "sci-fi-panel",
      "wood-plank",
      "marble",
      "starfield-nebula",
      "normal-from-height"
    ];
    expect([...proceduralTextureFixtureKinds]).toEqual(expectedKinds);

    const hashes = new Set<string>();
    for (const kind of proceduralTextureFixtureKinds) {
      const first = createProceduralTextureFixture(kind, { width: 32, height: 32 });
      const second = createProceduralTextureFixture(kind, { width: 32, height: 32 });
      expect(first.hash).toBe(second.hash);
      expect(first.data).toEqual(second.data);
      expect(first.data.byteLength).toBe(32 * 32 * 4);
      expect(first.hash).toMatch(/^[0-9a-f]{8}$/);
      expect(first.knownLimits.join(" ")).toContain("not a production scanned material");
      hashes.add(first.hash);
    }
    expect(hashes.size).toBe(proceduralTextureFixtureKinds.length);
  });

  it("generates a transparent racing number decal ported from the old racing texture generator", () => {
    const decal = createProceduralTextureFixture("racing-number-decal", { width: 64, height: 64 });
    let transparent = 0;
    let opaque = 0;
    let darkGlyph = 0;
    for (let index = 0; index < decal.data.length; index += 4) {
      const alpha = decal.data[index + 3] ?? 0;
      if (alpha === 0) transparent += 1;
      if (alpha > 240) opaque += 1;
      if (alpha > 240 && (decal.data[index] ?? 255) < 64 && (decal.data[index + 1] ?? 255) < 64 && (decal.data[index + 2] ?? 255) < 64) darkGlyph += 1;
    }

    expect(decal.semantic).toBe("albedo");
    expect(decal.colorSpace).toBe("srgb");
    expect(transparent).toBeGreaterThan(700);
    expect(opaque).toBeGreaterThan(1_000);
    expect(darkGlyph).toBeGreaterThan(120);
    expect(createProceduralTextureFixture("racing-number-decal", { width: 64, height: 64 }).hash).toBe(decal.hash);
  });

  it("adapts old ecommerce turntable concepts as deterministic bounded product evidence", () => {
    const first = createProductTurntableFixture({
      elapsedSeconds: 3.25,
      canvasWidth: 960,
      canvasHeight: 540,
      lightingPreset: "studio"
    });
    const second = createProductTurntableFixture({
      elapsedSeconds: 3.25,
      canvasWidth: 960,
      canvasHeight: 540,
      lightingPreset: "studio"
    });
    const paused = createProductTurntableFixture({
      elapsedSeconds: 3.25,
      interactionCount: 1,
      interactionAgeMs: 250,
      lightingPreset: "soft",
      captureRequested: true,
      exportedBytes: 4096
    });

    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.sourceFiles).toContain("master:src/ecommerce/turntable/TurntableController.ts");
    expect(first.sourceFiles).toContain("master:src/ecommerce/turntable/HotspotManager.ts");
    expect(first.hotspots).toHaveLength(3);
    expect(first.visibleHotspotCount).toBeGreaterThan(0);
    expect(first.lighting.presets).toEqual(["studio", "soft", "inspection", "dramatic", "neutral"]);
    expect(first.capture.screenshotFormats).toEqual(["png", "jpeg", "webp"]);
    expect(first.capture.spinFrameCount).toBe(72);
    expect(first.capture.batchTasks).toEqual(["thumbnail", "screenshot", "360-spin", "ar-export"]);
    expect(first.capture.blockedExportClaims).toContain("native-USDZ-export");
    expect(paused.pausedByInteraction).toBe(true);
    expect(paused.currentSpeedRadiansPerSecond).toBe(0);
    expect(paused.lighting.activePreset).toBe("soft");
    expect(paused.capture.completedBatchTasks).toBe(3);
    expect(paused.claimBoundary).toContain("does not claim a complete ecommerce pipeline");
  });

  it("creates a ready-to-render product turntable source with lighting, textures, and postprocess", () => {
    const kit = createProductTurntableRenderKit({
      elapsedSeconds: 1.5,
      canvasWidth: 960,
      canvasHeight: 540,
      lightingPreset: "studio"
    });

    expect(kit.fixture.manifestHash).toMatch(/^[0-9a-f]{8}$/);
    expect(kit.source.cameraPolicy).toBe("auto-frame");
    expect(kit.source.cameraFrameBounds).toEqual({ min: [-1.35, -0.52, -0.38], max: [1.35, 1, 0.42] });
    expect(kit.source.frustumCulling).toBe(false);
    const collectedLights = Array.from(kit.source.collectedLights ?? []);
    expect(collectedLights.length).toBeGreaterThanOrEqual(3);
    expect(collectedLights.filter((light) => light.castsShadow)).toHaveLength(1);
    expect(kit.source.shadow).toMatchObject({
      enabled: true,
      filter: "pcf"
    });
    expect(kit.source.environmentLighting).toMatchObject({
      intensity: expect.any(Number),
      environmentMapMipCount: expect.any(Number)
    });
    expect(kit.postprocess.targetFormat).toBe("rgba16f");
    expect(kit.postprocess.toneMapping).toMatchObject({ operator: "filmic", outputColorSpace: "srgb" });
    expect(kit.renderItems.length).toBeGreaterThanOrEqual(10);
    expect(kit.geometryLibrary.size).toBeGreaterThanOrEqual(6);
    expect(kit.materialLibrary.size).toBeGreaterThanOrEqual(6);
    expect(kit.renderItems.every((entry) => entry.geometry && entry.material && entry.modelMatrix)).toBe(true);

    expect(() => kit.dispose()).not.toThrow();
  });

  it("creates Texture resources with the expected color-space contract", () => {
    const albedo = createProceduralTexture("carbon-fiber", { width: 16, height: 16 });
    expect(albedo).toBeInstanceOf(Texture);
    expect(albedo).toMatchObject({ width: 16, height: 16, colorSpace: "srgb", label: "external-parity-procedural-carbon-fiber" });
    expect(albedo.data?.byteLength).toBe(16 * 16 * 4);

    const normal = createProceduralTexture("normal-from-height", { width: 16, height: 16 });
    expect(normal.colorSpace).toBe("linear");
    expect(normal.data?.byteLength).toBe(16 * 16 * 4);

    const metallicRoughness = createProceduralTexture("metallic-roughness-map", { width: 16, height: 16 });
    expect(metallicRoughness.colorSpace).toBe("linear");
    expect(metallicRoughness.data?.byteLength).toBe(16 * 16 * 4);
  });

  it("records manifest-ready descriptors without embedding pixel payloads", () => {
    const manifest = createProceduralTextureFixtureManifest({ width: 24, height: 24 });
    expect(manifest).toHaveLength(proceduralTextureFixtureKinds.length);
    expect(manifest.find((entry) => entry.id === "starfield-nebula")).toMatchObject({
      semantic: "emissive-background",
      colorSpace: "srgb",
      width: 24,
      height: 24
    });
    expect("data" in manifest[0]!).toBe(false);
  });

  it("creates deterministic layered space environment render data", () => {
    const fixture = createSpaceEnvironment({ width: 320, height: 180, elapsedSeconds: 1.25, seed: 2026, starCount: 24, nebulaCount: 3, dustCount: 32 });
    const repeat = createSpaceEnvironment({ width: 320, height: 180, elapsedSeconds: 1.25, seed: 2026, starCount: 24, nebulaCount: 3, dustCount: 32 });
    const advanced = createSpaceEnvironment({ width: 320, height: 180, elapsedSeconds: 2.25, seed: 2026, starCount: 24, nebulaCount: 3, dustCount: 32 });

    expect(fixture.hash).toBe(repeat.hash);
    expect(fixture.hash).not.toBe(advanced.hash);
    expect(fixture.starCount).toBe(24);
    expect(fixture.nebulaCount).toBe(3);
    expect(fixture.dustCount).toBe(32);
    expect(fixture.stars).toHaveLength(24);
    expect(fixture.nebulae).toHaveLength(3);
    expect(fixture.dust).toHaveLength(32);
    expect(fixture.visibleStarCount).toBeGreaterThan(0);
    expect(fixture.averageStarBrightness).toBeGreaterThan(0);
    expect(fixture.nebulaCoverage).toBeGreaterThan(0);
    expect(fixture.dustAlpha).toBeGreaterThan(0);
    expect(fixture.layerScroll.foregroundStars).toBeGreaterThan(fixture.layerScroll.distantStars);
    expect(() => createSpaceEnvironment({ width: 0 })).toThrow(/width/);
    expect(() => createSpaceEnvironment({ elapsedSeconds: Number.NaN })).toThrow(/elapsedSeconds/);
  });

  it("keeps the checked-in procedural manifest aligned with generated default hashes", () => {
    const manifest = JSON.parse(readFileSync("fixtures/procedural-textures/manifest.json", "utf8")) as {
      readonly fixtures: readonly { readonly id: string; readonly hash: string; readonly width: number; readonly height: number }[];
    };
    expect(manifest.fixtures.map((entry) => entry.id)).toEqual([...proceduralTextureFixtureKinds]);
    for (const entry of manifest.fixtures) {
      const generated = createProceduralTextureFixture(entry.id as never, { width: entry.width, height: entry.height });
      expect(entry.hash).toBe(generated.hash);
    }
  });

  it("builds a normal map from a seeded height field", () => {
    const normal = normalFromHeightMap(18, 18, 1234);
    const repeated = normalFromHeightMap(18, 18, 1234);
    expect(normal).toEqual(repeated);
    expect(normal.byteLength).toBe(18 * 18 * 4);
    expect(normal[3]).toBe(255);
    expect(new Set(Array.from(normal.filter((_, index) => index % 4 === 1))).size).toBeGreaterThan(2);
  });

  it("creates deterministic terrain heightfield and biome telemetry adapted from the old terrain generator", () => {
    const terrain = createTerrainHeightfieldFixture({ width: 24, height: 24, seed: 90210 });
    const repeated = createTerrainHeightfieldFixture({ width: 24, height: 24, seed: 90210 });
    const sample = sampleTerrainHeightfield(terrain, 0.45, 0.52);

    expect(terrain.source).toBe("origin-master-terrain-generator-adapted");
    expect(terrain.id).toBe("external-parity-old-branch-terrain-heightfield");
    expect(terrain.hash).toBe(repeated.hash);
    expect(Array.from(terrain.data)).toEqual(Array.from(repeated.data));
    expect(terrain.data.byteLength).toBe(24 * 24 * 4);
    expect(terrain.samples.length).toBeGreaterThanOrEqual(16);
    expect(terrain.riverCellCount).toBeGreaterThan(0);
    expect(terrain.roughness).toBeGreaterThan(0);
    expect(Object.values(terrain.biomeCounts).reduce((sum, count) => sum + count, 0)).toBe(24 * 24);
    expect(Object.values(terrain.biomeCounts).filter((count) => count > 0).length).toBeGreaterThanOrEqual(3);
    expect(sample.height).toBeGreaterThanOrEqual(terrain.minHeight);
    expect(sample.height).toBeLessThanOrEqual(terrain.maxHeight);
    expect(sample.biome).toMatch(/water|beach|grassland|forest|rock|snow/);
    expect(terrain.claimBoundary).toContain("not full terrain ECS");
    expect(() => createTerrainHeightfieldFixture({ width: 4 })).toThrow(/dimensions/);
    expect(() => createTerrainHeightfieldFixture({ minHeight: 1, maxHeight: 1 })).toThrow(/maxHeight/);
  });

  it("builds reusable indexed terrain geometry and a cell-aligned collider descriptor", () => {
    const fixture = createTerrainHeightfieldFixture({ width: 12, height: 10, seed: 2718 });
    const terrain = createTerrainHeightfieldGeometry(fixture, {
      sizeX: 22,
      sizeZ: 9,
      heightScale: 3,
      yOffset: 1
    });

    expect(terrain.vertexCount).toBe(120);
    expect(terrain.triangleCount).toBe(11 * 9 * 2);
    expect(terrain.geometry.vertexBuffer.vertexCount).toBe(120);
    expect(terrain.geometry.indexBuffer?.count).toBe(terrain.triangleCount * 3);
    expect(terrain.geometry.vertexBuffer.format).toBeDefined();
    const firstPosition = terrain.geometry.vertexBuffer.getAttribute(0, "position");
    expect(firstPosition[0]).toBe(-11);
    expect(firstPosition[1]).toBeCloseTo(1 + fixture.data[0]! * 3, 5);
    expect(firstPosition[2]).toBe(-4.5);
    const centerNormal = terrain.geometry.vertexBuffer.getAttribute(5 * 12 + 6, "normal");
    expect(Math.hypot(...centerNormal)).toBeCloseTo(1, 5);
    expect(centerNormal[1]).toBeGreaterThan(0);
    expect(terrain.geometry.bounds.min[0]).toBe(-11);
    expect(terrain.geometry.bounds.max[0]).toBe(11);
    expect(terrain.geometry.bounds.min[2]).toBe(-4.5);
    expect(terrain.geometry.bounds.max[2]).toBe(4.5);
    expect(terrain.collider).toMatchObject({
      kind: "heightfield",
      columns: 12,
      rows: 10,
      cellSizeX: 2,
      cellSizeZ: 1,
      origin: [-11, 0, -4.5]
    });
    expect(terrain.collider.heights).not.toBe(fixture.data);
    expect(terrain.collider.heights[0]).toBeCloseTo(1 + fixture.data[0]! * 3, 5);
    expect(terrain.claimBoundary).toMatch(/collision response.*separate capabilities/i);
    expect(() => createTerrainHeightfieldGeometry(fixture, { sizeX: 0 })).toThrow(/sizeX/);
  });

  it("samples deterministic weather telemetry adapted from the old weather system", () => {
    const storm = createWeatherState({ type: "thunderstorm", elapsedSeconds: 2.5, seed: 42, cameraX: 3, cameraZ: -2 });
    const repeat = createWeatherState({ type: "thunderstorm", elapsedSeconds: 2.5, seed: 42, cameraX: 3, cameraZ: -2 });
    const clear = createWeatherState({ type: "clear", elapsedSeconds: 2.5, seed: 42 });

    expect(storm.hash).toBe(repeat.hash);
    expect(storm.cloudCoverage).toBe(1);
    expect(storm.rainIntensity).toBe(1);
    expect(storm.lightningFrequency).toBeGreaterThan(0);
    expect(storm.visibleDropCount).toBeGreaterThan(400);
    expect(storm.visualDrops.length).toBeGreaterThan(0);
    expect(storm.visualDrops[0]?.length ?? 0).toBeGreaterThan(0);
    expect(storm.visualDrops[0]?.alpha ?? 0).toBeGreaterThan(0);
    expect(storm.splashCount).toBeGreaterThan(0);
    expect(storm.puddleDepth).toBeGreaterThan(0);
    expect(storm.puddlePatches.length).toBeGreaterThan(0);
    expect(storm.puddlePatches[0]?.depth ?? 0).toBeGreaterThan(0);
    expect(storm.wetness).toBeGreaterThan(0);
    expect(storm.visibilityMeters).toBeLessThan(clear.visibilityMeters);
    expect(clear.visibleDropCount).toBeGreaterThanOrEqual(0);
    expect(clear.rainIntensity).toBe(0);
    expect(() => createWeatherState({ elapsedSeconds: Number.NaN })).toThrow(/elapsedSeconds/);
  });

  it("samples deterministic vegetation placement, LOD, culling, and wind telemetry", () => {
    const terrain = createTerrainHeightfieldFixture({ width: 32, height: 32, seed: 2025 });
    const vegetation = sampleVegetationFixture({ terrain, seed: 2025, cameraX: 0, elapsedSeconds: 1.25, maxInstances: 120 });
    const repeat = sampleVegetationFixture({ terrain, seed: 2025, cameraX: 0, elapsedSeconds: 1.25, maxInstances: 120 });
    const shifted = sampleVegetationFixture({ terrain, seed: 2025, cameraX: 2.2, elapsedSeconds: 1.25, maxInstances: 120 });

    expect(vegetation.id).toBe("external-parity-old-branch-vegetation-fixture");
    expect(vegetation.source).toBe("origin-master-vegetation-system-adapted");
    expect(vegetation.hash).toBe(repeat.hash);
    expect(vegetation.instanceCount).toBeGreaterThan(0);
    expect(vegetation.visibleCount).toBeGreaterThan(0);
    expect(vegetation.culledCount).toBeGreaterThan(0);
    expect(vegetation.meshLodCount + vegetation.impostorLodCount + vegetation.culledCount).toBe(vegetation.instanceCount);
    expect(vegetation.treeCount + vegetation.grassCount + vegetation.shrubCount).toBe(vegetation.instanceCount);
    expect(vegetation.maxWindOffset).toBeGreaterThan(0);
    expect(vegetation.lsystem.source).toBe("origin-master-lsystem-turtle-adapted");
    expect(vegetation.lsystem.axiom).toBe("F");
    expect(vegetation.lsystem.rule).toBe("F -> F[+F][-F]!F");
    expect(vegetation.lsystem.generatedSymbolLength).toBeGreaterThan(vegetation.lsystem.iterations);
    expect(vegetation.lsystem.branchSegmentCount).toBeGreaterThan(0);
    expect(vegetation.lsystem.renderedBranchSegmentCount).toBeGreaterThan(0);
    expect(vegetation.lsystem.branchTipCount).toBeGreaterThan(0);
    expect(vegetation.lsystem.maxDepth).toBeGreaterThan(0);
    expect(vegetation.lsystem.hash).toBe(repeat.lsystem.hash);
    expect(vegetation.lsystem.segments[0]).toMatchObject({ instanceId: expect.stringMatching(/^veg-/) });
    expect(vegetation.lsystem.claimBoundary).toContain("does not claim production procedural tree meshes");
    expect(vegetation.claimBoundary).toContain("not instanced vegetation rendering");
    expect(shifted.visibleCount).not.toBe(vegetation.visibleCount);
    expect(() => sampleVegetationFixture({ terrain, seed: 1.25 })).toThrow(/seed/);
  });

  it("samples deterministic voxel-world block registry, chunk LOD, and visible block telemetry", () => {
    const fixture = createVoxelWorld({ seed: 4096, chunkSize: 16, viewDistance: 4 });
    const repeat = createVoxelWorld({ seed: 4096, chunkSize: 16, viewDistance: 4 });
    const shifted = createVoxelWorld({ seed: 4096, chunkSize: 16, viewDistance: 4, cameraChunkX: 2 });

    expect(fixture.hash).toBe(repeat.hash);
    expect(fixture.hash).not.toBe(shifted.hash);
    expect(fixture.blockTypeCount).toBe(20);
    expect(fixture.solidBlockTypes).toBeGreaterThan(10);
    expect(fixture.transparentBlockTypes).toBeGreaterThanOrEqual(4);
    expect(fixture.animatedBlockTypes).toBeGreaterThanOrEqual(2);
    expect(fixture.emittingBlockTypes).toBe(1);
    expect(fixture.registry.find((block) => block.type === "lava")).toMatchObject({ lightLevel: 12, animated: true });
    expect(fixture.registry.find((block) => block.type === "diamond-ore")).toMatchObject({ toolRequired: "pickaxe" });
    expect(fixture.chunkQueueSize).toBeGreaterThan(0);
    expect(fixture.generatingChunks).toBeGreaterThan(0);
    expect(fixture.meshingChunks).toBeGreaterThan(0);
    expect(fixture.lodCounts.near + fixture.lodCounts.mid + fixture.lodCounts.far + fixture.lodCounts.culled).toBe(fixture.chunkQueueSize);
    expect(fixture.blockCounts.grass ?? 0).toBeGreaterThan(0);
    expect(fixture.blockCounts.stone ?? 0).toBeGreaterThan(0);
    expect(fixture.visibleBlocks.length).toBeGreaterThan(0);
    expect(fixture.visibleBlocks.some((block) => block.lod === "near")).toBe(true);
    expect(fixture.visibleFaceEstimate).toBeGreaterThan(0);
    expect(fixture.memoryBytes).toBeGreaterThan(0);
    expect(() => createVoxelWorld({ seed: 1.5 })).toThrow(/seed/);
    expect(() => createVoxelWorld({ chunkSize: 4 })).toThrow(/chunkSize/);
  });

  it("samples deterministic ocean wave, foam, and buoyancy telemetry adapted from the old ocean system", () => {
    const fixture = sampleOceanFixture({ preset: "rough", seed: 9090, elapsedSeconds: 2.25, sampleCount: 11, cameraX: 0.4 });
    const repeat = sampleOceanFixture({ preset: "rough", seed: 9090, elapsedSeconds: 2.25, sampleCount: 11, cameraX: 0.4 });
    const shifted = sampleOceanFixture({ preset: "rough", seed: 9090, elapsedSeconds: 2.25, sampleCount: 11, cameraX: 1.2 });

    expect(fixture.id).toBe("external-parity-old-branch-ocean-fixture");
    expect(fixture.source).toBe("origin-master-ocean-gerstner-foam-buoyancy-adapted");
    expect(fixture.sourceFiles).toContain("origin/master:src/ocean/GerstnerWaves.ts");
    expect(fixture.sourceFiles).toContain("origin/master:src/ocean/FoamGenerator.ts");
    expect(fixture.sourceFiles).toContain("origin/master:src/ocean/BuoyancySystem.ts");
    expect(fixture.hash).toBe(repeat.hash);
    expect(fixture.hash).not.toBe(shifted.hash);
    expect(fixture.waveCount).toBeGreaterThanOrEqual(3);
    expect(fixture.samples).toHaveLength(11);
    expect(fixture.samples.some((sample) => sample.height !== 0)).toBe(true);
    expect(fixture.maxHeight).toBeGreaterThan(fixture.minHeight);
    expect(fixture.maxFoam).toBeGreaterThan(0);
    expect(fixture.foamPatches.length).toBeGreaterThan(0);
    expect(fixture.foamPatches[0]?.intensity ?? 0).toBeGreaterThan(0);
    expect(fixture.buoyancy.samplePointCount).toBeGreaterThan(0);
    expect(fixture.buoyancy.submergedPointCount).toBeGreaterThan(0);
    expect(fixture.buoyancy.submergedVolume).toBeGreaterThan(0);
    expect(Math.abs(fixture.buoyancy.force[1])).toBeGreaterThan(0);
    expect(fixture.blockedClaims).toContain("Unity HDRP water parity");
    expect(fixture.blockedClaims).toContain("Unreal Water plugin parity");
    expect(fixture.claimBoundary).toContain("does not implement a production ocean renderer");
    expect(() => sampleOceanFixture({ seed: 1.5 })).toThrow(/seed/);
    expect(() => sampleOceanFixture({ sampleCount: 4 })).toThrow(/sampleCount/);
  });

  it("rejects invalid dimensions and seeds", () => {
    expect(() => createProceduralTextureFixture("marble", { width: 4 })).toThrow(/dimensions/);
    expect(() => createProceduralTextureFixture("marble", { height: 4 })).toThrow(/dimensions/);
    expect(() => createProceduralTextureFixture("marble", { seed: 1.5 })).toThrow(/seed/);
  });
});
