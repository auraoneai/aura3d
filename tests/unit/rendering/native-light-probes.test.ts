import { describe, expect, it } from "vitest";
import { NativeLightProbeGrid } from "../../../packages/rendering/src/lighting/NativeLightProbeGrid";
import { VoxelIndirectLighting } from "../../../packages/rendering/src/lighting/VoxelIndirectLighting";
import { bakeIndirectFromVoxel, bakeOptionsFromUVAtlas, NativeLightmapBake, NativeProbeBake } from "../../../packages/rendering/src/lighting/NativeLightBaking";
import { buildUVAtlas } from "../../../packages/engine/src/agent-api/geometry/UVAtlas";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

function mockWebGLTextureUploads() {
  const uploads: number[][] = [];
  let allocations = 0;
  let deletions = 0;
  let signaled = false;
  const gl = {
    TEXTURE_2D: 0x0de1, RGBA: 0x1908, RGBA32F: 0x8814, FLOAT: 0x1406,
    TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d, TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800, NEAREST: 0x2600, UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    UNPACK_ALIGNMENT: 0x0cf5, UNPACK_ROW_LENGTH: 0x0cf2, UNPACK_IMAGE_HEIGHT: 0x806e,
    UNPACK_SKIP_PIXELS: 0x0cf4, UNPACK_SKIP_ROWS: 0x0cf3, UNPACK_SKIP_IMAGES: 0x806d, NONE: 0,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, TIMEOUT_EXPIRED: 0x911b,
    createTexture: () => ({}), deleteTexture: () => { deletions += 1; }, bindTexture() {},
    fenceSync: () => ({}), flush() {}, clientWaitSync: () => signaled ? 0x911a : 0x911b, deleteSync() {},
    getParameter: () => 0, getExtension: () => null, pixelStorei() {}, texParameteri() {},
    texStorage2D: () => { allocations += 1; },
    texSubImage2D: (...args: unknown[]) => { uploads.push(Array.from(args[8] as Float32Array)); }
  };
  const host = { gl, stateCache: { invalidate() {} }, counters: { releasedTextureHandles: 0 },
    lifecycle: { readError: () => null }, device: {} } as unknown as WebGL2DeviceHost;
  return { registry: new WebGL2TextureRegistry(host), uploads, allocations: () => allocations, deletions: () => deletions,
    signalFences: () => { signaled = true; } };
}

describe("native light probe grids", () => {
  it("interpolates 3D irradiance, respects bounds, and clamps only when requested", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [2, 2, 2], dimensions: [2, 2, 2] });
    for (let z = 0; z < 2; z += 1) for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) {
      grid.setProbeIrradiance(x, y, z, [x * 2, y * 4, z * 6]);
    }
    const middle = grid.evaluate([1, 1, 1], [0, 1, 0])!;
    expect(middle[0]).toBeCloseTo(1);
    expect(middle[1]).toBeCloseTo(2);
    expect(middle[2]).toBeCloseTo(3);
    expect(grid.evaluate([-1, 1, 1], [0, 1, 0])).toBeNull();
    const clamped = grid.evaluate([-1, 1, 1], [0, 1, 0], "clamp")!;
    expect(clamped[0]).toBeCloseTo(0);
    expect(clamped[1]).toBeCloseTo(2);
    expect(clamped[2]).toBeCloseTo(3);
    expect(grid.getProbePosition(1, 0, 1)).toEqual([2, 0, 2]);
  });

  it("handles singleton axes, copies inputs and snapshots, and tracks updates", () => {
    const bounds: [number, number, number] = [0, 0, 0];
    const grid = new NativeLightProbeGrid({ min: bounds, max: [2, 4, 6], dimensions: [1, 1, 1], backend: "webgpu" });
    const coefficients = new Float32Array(27);
    coefficients[0] = 4;
    grid.setProbe(0, 0, 0, coefficients);
    coefficients[0] = 50;
    bounds[0] = 100;
    expect(grid.getProbePosition(0, 0, 0)).toEqual([1, 2, 3]);
    const snapshot = grid.snapshot();
    expect(snapshot.revision).toBe(1);
    snapshot.radianceSH9[0] = 99;
    expect(grid.sample([0, 0, 0])![0]).toBe(4);
    grid.setProbeIrradiance(0, 0, 0, [1, 2, 3]);
    expect(grid.revision).toBe(2);
    expect(grid.evaluate([2, 4, 6], [0, 0, 5])![2]).toBeCloseTo(3);
    grid.dispose();
    grid.dispose();
    expect(() => grid.sample([0, 0, 0])).toThrow(/disposed/);
  });

  it("evaluates directional SH rather than treating it as constant ambient", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    const sh = new Float32Array(27);
    sh[0] = 2;
    sh[6] = 1; // L1 z coefficient, red
    grid.setProbe(0, 0, 0, sh);
    expect(grid.evaluate([0.5, 0.5, 0.5], [0, 0, 1])![0]).toBeGreaterThan(grid.evaluate([0.5, 0.5, 0.5], [0, 0, -1])![0]);
  });

  it("packs every SH coefficient for explicit renderer uploads and synchronizes changes", () => {
    const grid = new NativeLightProbeGrid({ min: [1, 2, 3], max: [4, 5, 6], dimensions: [2, 1, 2] });
    for (let z = 0; z < 2; z += 1) for (let x = 0; x < 2; x += 1) {
      const coefficients = Float32Array.from({ length: 27 }, (_, i) => (z * 2 + x) * 100 + i - 30);
      grid.setProbe(x, 0, z, coefficients);
    }
    const first = grid.renderData();
    expect(first.dimensions).toEqual([2, 1, 2]);
    expect(first.texture.dimension).toBe("2d");
    expect(first.texture.format).toBe("rgba32f");
    expect([first.texture.width, first.texture.height]).toEqual([18, 2]);
    const packed = first.texture.getMipLevel(0)!.data as Float32Array;
    for (let z = 0; z < 2; z += 1) for (let x = 0; x < 2; x += 1) for (let coefficient = 0; coefficient < 9; coefficient += 1) {
      const texel = (z * 18 + x * 9 + coefficient) * 4;
      const base = (z * 2 + x) * 100 + coefficient * 3 - 30;
      expect(Array.from(packed.subarray(texel, texel + 4))).toEqual([base, base + 1, base + 2, 0]);
    }
    expect(grid.renderData().texture.revision).toBe(0);
    grid.setProbeIrradiance(1, 0, 1, [2, 3, 4]);
    const next = grid.renderData();
    expect(next.texture).toBe(first.texture);
    expect(next.revision).toBe(first.revision + 1);
    expect(next.texture.revision).toBe(1);
    const changed = next.texture.getMipLevel(0)!.data as Float32Array;
    expect(changed[(18 + 9) * 4]).toBeCloseTo(2 / (Math.PI * 0.28209479177387814));
    expect(changed[(18 + 9 + 1) * 4]).toBe(0);
    grid.dispose();
    expect(first.texture.disposed).toBe(true);
    expect(() => grid.renderData()).toThrow(/disposed/);
  });

  it("rejects invalid budgets, positions, indices and non-finite coefficients without partial writes", () => {
    expect(() => new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 0, 1], dimensions: [1, 1, 1] })).toThrow(/max/);
    expect(() => new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [17, 1, 1] })).toThrow(/dimensions/);
    expect(() => new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [2, 2, 2], maxProbes: 7 })).toThrow(/budget/);
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    grid.setProbeIrradiance(0, 0, 0, [1, 1, 1]);
    const invalid = new Float32Array(27).fill(10);
    invalid[26] = NaN;
    expect(() => grid.setProbe(0, 0, 0, invalid)).toThrow(/finite/);
    expect(grid.revision).toBe(1);
    expect(grid.evaluate([0, 0, 0], [0, 1, 0])![0]).toBeCloseTo(1);
    expect(() => grid.setProbe(-1, 0, 0, invalid)).toThrow(/index/);
    expect(() => grid.sample([NaN, 0, 0])).toThrow(/position/);
    expect(() => grid.evaluate([0, 0, 0], [0, 0, 0])).toThrow(/normal/);
  });
});

describe("voxel indirect lighting", () => {
  it("traces updated linear radiance and preserves explicit CPU fallback", () => {
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [4, 4, 4] }, quality: "low", resolution: 4, backend: "webgl2" });
    expect(volume.execution.implementation).toBe("cpu");
    expect(volume.execution.fallbackReason).toMatch(/CPU/);
    volume.updateVoxel([1, 1, 1], { radiance: [2, 1, 0], opacity: 0.5 });
    expect(volume.sampleVoxel([1.5, 1.5, 1.5])).toEqual({ radiance: [2, 1, 0], opacity: 0.5 });
    const ray = volume.traceCone({ origin: [0, 1.5, 1.5], direction: [1, 0, 0], halfAngle: 0, startDistance: 0.5 });
    expect(ray.radiance[0]).toBeGreaterThan(0);
    expect(ray.transmittance).toBeLessThan(1);
    const snapshot = volume.snapshot();
    snapshot.rgba.fill(0);
    expect(volume.sampleVoxel([1.5, 1.5, 1.5]).radiance).toEqual([2, 1, 0]);
    volume.clear();
    expect(volume.traceCone({ origin: [0, 1.5, 1.5], direction: [1, 0, 0], halfAngle: 0 }).radiance).toEqual([0, 0, 0]);
    volume.dispose();
    expect(() => volume.snapshot()).toThrow(/disposed/);
  });

  it("collects triangle coverage and leaves existing volume intact after invalid input", () => {
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [4, 4, 4] }, quality: "low", resolution: 4 });
    const report = volume.collectTriangles([{ vertices: [[1.1, 1.1, 1.5], [2.9, 1.1, 1.5], [1.1, 2.9, 1.5]], radiance: [0, 2, 0] }]);
    expect(report.voxelWrites).toBeGreaterThan(1);
    expect(volume.sampleVoxel([1.5, 1.5, 1.5]).radiance[1]).toBeCloseTo(2);
    const before = volume.snapshot();
    expect(() => volume.collectTriangles([{ vertices: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], radiance: [1, 1, 1] }], { replace: true })).toThrow(/Degenerate/);
    expect(volume.revision).toBe(before.revision);
    expect(Array.from(volume.snapshot().rgba)).toEqual(Array.from(before.rgba));
    expect(() => volume.updateVoxel([4, 0, 0], { radiance: [1, 0, 0], opacity: 1 })).toThrow(/outside/);
    expect(() => volume.traceCone({ origin: [0, 0, 0], direction: [0, 0, 0] })).toThrow(/nonzero/);
    expect(() => new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [1, 1, 1] }, quality: "low", resolution: 17 })).toThrow(/resolution/);
  });

  it("traverses anisotropic cells and invalidates filtered levels after updates", () => {
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [100, 1, 1] }, quality: "low", resolution: [10, 10, 2] });
    const options = { origin: [0, 0.05, 0.25] as const, direction: [100, 0.9, 0] as const, halfAngle: 0, startDistance: 0 };
    expect(volume.traceCone(options).radiance).toEqual([0, 0, 0]);
    volume.updateVoxel([5, 5, 0], { radiance: [0, 3, 0], opacity: 1 });
    expect(volume.traceCone(options).radiance[1]).toBeGreaterThan(0);
    volume.clear();
    expect(volume.traceCone(options).radiance).toEqual([0, 0, 0]);
  });

  it("packs a weighted odd-sized pyramid and refreshes the same volume-owned handle", () => {
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [3, 1, 1] }, quality: "low", resolution: [3, 1, 1], backend: "webgpu" });
    volume.updateVoxel([0, 0, 0], { radiance: [2, 0, 0], opacity: 1 });
    volume.updateVoxel([1, 0, 0], { radiance: [4, 0, 0], opacity: 1 });
    volume.updateVoxel([2, 0, 0], { radiance: [8, 0, 0], opacity: 1 });
    const first = volume.renderData();
    expect(first.texture.format).toBe("rgba32f");
    expect([first.texture.width, first.texture.height]).toEqual([3, 2]);
    expect(first.levels).toEqual([
      { dimensions: [3, 1, 1], scale: 1, offset: 0 },
      { dimensions: [2, 1, 1], scale: 2, offset: 3 },
      { dimensions: [1, 1, 1], scale: 4, offset: 5 }
    ]);
    const rgba = first.texture.getMipLevel(0)!.data as Float32Array;
    expect([rgba[0], rgba[4], rgba[8], rgba[12], rgba[16]]).toEqual([2, 4, 8, 3, 8]);
    expect(rgba[20]).toBeCloseTo(14 / 3);
    expect(rgba[23]).toBe(1);
    expect(first.maxConeSteps).toBe(32);
    expect(first.hemisphereCones).toBe(1);
    expect(volume.execution.implementation).toBe("cpu");
    expect(volume.renderData().texture.revision).toBe(0);
    volume.clear();
    const next = volume.renderData();
    expect(next.texture).toBe(first.texture);
    expect(next.revision).toBe(first.revision + 1);
    expect(next.texture.revision).toBe(1);
    expect(Array.from(next.texture.getMipLevel(0)!.data)).toEqual(new Array(24).fill(0));
    volume.dispose();
    expect(first.texture.disposed).toBe(true);
    expect(() => volume.renderData()).toThrow(/disposed/);
  });
});

describe("lighting texture upload handoff", () => {
  it("feeds updates and fence-retired disposal through the WebGL2 texture registry with a mocked context", async () => {
    const { registry, uploads, allocations, deletions, signalFences } = mockWebGLTextureUploads();
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    const voxel = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [1, 1, 1] }, quality: "low", resolution: 1 });
    grid.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    voxel.updateVoxel([0, 0, 0], { radiance: [4, 0, 0], opacity: 0.5 });
    const probeTexture = grid.renderData().texture;
    const voxelTexture = voxel.renderData().texture;
    const probeHandle = registry.getTextureHandle(probeTexture);
    const voxelHandle = registry.getTextureHandle(voxelTexture);
    expect(uploads[0][0]).toBeCloseTo(1 / (Math.PI * 0.28209479177387814));
    expect(uploads[1].slice(0, 4)).toEqual([2, 0, 0, 0.5]);
    grid.setProbeIrradiance(0, 0, 0, [2, 0, 0]);
    voxel.clear();
    grid.renderData();
    voxel.renderData();
    expect(registry.getTextureHandle(probeTexture)).toBe(probeHandle);
    expect(registry.getTextureHandle(voxelTexture)).toBe(voxelHandle);
    expect(uploads[2][0]).toBeCloseTo(2 / (Math.PI * 0.28209479177387814));
    expect(uploads[3].slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(allocations()).toBe(2);
    grid.dispose();
    voxel.dispose();
    registry.releaseDisposedTextureHandles();
    expect(deletions()).toBe(0);
    signalFences();
    await new Promise<void>((resolve) => registry.onNativeRetirementsDrained(resolve));
    expect(deletions()).toBe(2);
  });
});

describe("incremental native lighting bakes", () => {
  function quadAtlas() {
    const secondary = new Float32Array([1 / 6, 1 / 6, 5 / 6, 1 / 6, 5 / 6, 5 / 6, 1 / 6, 5 / 6]);
    return {
      width: 6, height: 6, gutter: 1, texelDensity: 4, destination: "uv1s" as const,
      charts: [{ contentBounds: { x: 1, y: 1, width: 4, height: 4 }, triangles: [0, 1] }],
      geometry: {
        positions: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] as const,
        normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]] as const,
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), uv1s: secondary,
        indices: new Uint16Array([0, 1, 2, 0, 2, 3])
      }
    };
  }

  it("consumes actual generated chart bounds and preserves the authored UV channel", () => {
    const authoredUV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const generated = buildUVAtlas({
      kind: "aura-custom-geometry",
      positions: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
      uvs: authoredUV,
      indices: [0, 1, 2, 0, 2, 3]
    }, { destination: "uv1s", width: 16, height: 16, gutter: 1, texelDensity: 8 });
    const bake = new NativeLightmapBake(bakeOptionsFromUVAtlas(generated, {
      lights: [{ type: "ambient", color: [1, 1, 1], intensity: 1 }]
    }));
    while (bake.status !== "complete") bake.step(128);
    const result = bake.result();
    expect(result.uvChannel).toBe(1);
    expect(result.coverage.some((value) => value === 1)).toBe(true);
    expect(result.coverage.some((value) => value === 2)).toBe(true);
    expect(Array.from(authoredUV)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(generated.geometry.uvs).toEqual(authoredUV);
  });

  it("uses remapped secondary UVs and chart metadata, dilates gutters, and owns output", () => {
    const atlas = quadAtlas();
    const originalUVs = atlas.geometry.uvs.slice();
    const bake = new NativeLightmapBake(bakeOptionsFromUVAtlas(atlas, {
      lights: [
        { type: "ambient", color: [1, 0.5, 0], intensity: 2 },
        { type: "directional", color: [1, 1, 1], intensity: 3, directionToLight: [0, 0, 1] }
      ],
      visibility: () => 0.5
    }));
    expect(() => bake.createRenderData()).toThrow(/completion/);
    let steps = 0;
    while (bake.status !== "complete") {
      expect(bake.step(3).work).toBeLessThanOrEqual(3);
      if (++steps > 100) throw new Error("bake did not finish");
    }
    expect(steps).toBeGreaterThan(1);
    const result = bake.result();
    expect(result.uvChannel).toBe(1);
    expect(result.texelDensity).toBe(4);
    expect(result.coverage[1 * 6 + 1]).toBe(1);
    expect(result.coverage[0]).toBe(2);
    const index = (1 * 6 + 1) * 3;
    expect(result.irradiance[index]).toBeCloseTo(3.5);
    expect(result.irradiance[index + 1]).toBeCloseTo(2.5);
    expect(result.irradiance[index + 2]).toBeCloseTo(1.5);
    expect(atlas.geometry.uvs).toEqual(originalUVs);
    result.irradiance[index] = 0;
    expect(bake.result().irradiance[index]).toBeCloseTo(3.5);
    const output = bake.createRenderData();
    expect([output.uvChannel, output.gutter, output.texelDensity]).toEqual([1, 1, 4]);
    expect(output.texture.format).toBe("rgba32f");
    const rgba = output.texture.getMipLevel(0)!.data as Float32Array;
    const surface = (1 * 6 + 1) * 4;
    expect(Array.from(rgba.subarray(surface, surface + 4))).toEqual([3.5, 2.5, 1.5, 1]);
    expect(Array.from(rgba.subarray(0, 4))).toEqual([3.5, 2.5, 1.5, 1]); // dilated gutter
    const separate = bake.createRenderData();
    expect(separate.texture).not.toBe(output.texture);
    output.texture.dispose();
    expect(separate.texture.disposed).toBe(false);
    separate.texture.dispose();
  });

  it("converts voxel outgoing radiance to irradiance before lightmap baking", () => {
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [4, 4, 4] }, quality: "low", resolution: 4 });
    volume.updateVoxel([1, 1, 1], { radiance: [2, 1, 0], opacity: 1 });
    const position = [0, 1.5, 1.5] as const;
    const normal = [1, 0, 0] as const;
    const outgoing = volume.sampleIndirect(position, normal);
    expect(outgoing[0]).toBeGreaterThan(0);
    const irradiance = bakeIndirectFromVoxel(volume)(position, normal);
    expect(irradiance[0]).toBeCloseTo(outgoing[0] * Math.PI);
    expect(irradiance[1]).toBeCloseTo(outgoing[1] * Math.PI);
    const bake = new NativeLightmapBake(bakeOptionsFromUVAtlas(quadAtlas(), {
      lights: [], indirect: bakeIndirectFromVoxel({ sampleIndirect: () => [1, 2, 3] })
    }));
    while (bake.status !== "complete") bake.step(128);
    const result = bake.result();
    const index = (1 * 6 + 1) * 3;
    expect(result.irradiance[index]).toBeCloseTo(Math.PI);
    expect(result.irradiance[index + 1]).toBeCloseTo(2 * Math.PI);
    expect(result.irradiance[index + 2]).toBeCloseTo(3 * Math.PI);
  });

  it("marks uncovered atlas texels separately from chart padding", () => {
    const atlas = quadAtlas();
    atlas.width = 8;
    atlas.height = 8;
    atlas.geometry.uv1s = new Float32Array([1 / 8, 1 / 8, 5 / 8, 1 / 8, 5 / 8, 5 / 8, 1 / 8, 5 / 8]);
    const bake = new NativeLightmapBake(bakeOptionsFromUVAtlas(atlas, {
      lights: [{ type: "ambient", color: [1, 1, 1], intensity: 1 }]
    }));
    while (bake.status !== "complete") bake.step(128);
    const output = bake.createRenderData();
    const rgba = output.texture.getMipLevel(0)!.data as Float32Array;
    expect(Array.from(rgba.subarray(0, 4))).toEqual([1, 1, 1, 1]);
    expect(Array.from(rgba.subarray((7 * 8 + 7) * 4, (7 * 8 + 8) * 4))).toEqual([0, 0, 0, 0]);
    output.texture.dispose();
  });

  it("honors cancellation without publishing a partial lightmap", () => {
    const controller = new AbortController();
    const bake = new NativeLightmapBake(bakeOptionsFromUVAtlas(quadAtlas(), {
      lights: [{ type: "directional", color: [1, 1, 1], intensity: 1, directionToLight: [0, 0, 1] }],
      visibility: () => { controller.abort(); return 1; }, signal: controller.signal
    }));
    expect(bake.step(1).status).toBe("cancelled");
    expect(() => bake.result()).toThrow(/completion/);
    expect(() => bake.createRenderData()).toThrow(/completion/);
    expect(bake.step(1)).toEqual({ status: "cancelled", work: 0 });
  });

  it("incrementally projects constant radiance into SH9 and commits only on completion", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [2, 1, 1] });
    const bake = new NativeProbeBake({ grid, samplesPerProbe: 256, sampleRadiance: () => [1, 2, 3] });
    expect(() => bake.writeToGrid(grid)).toThrow(/completion/);
    expect(grid.revision).toBe(0);
    while (bake.status !== "complete") bake.step(31);
    const result = bake.result();
    bake.writeToGrid(grid);
    expect(grid.revision).toBe(2);
    const irradiance = grid.evaluate([0.5, 0.5, 0.5], [0, 0, 1])!;
    expect(irradiance[0]).toBeCloseTo(Math.PI, 2);
    expect(irradiance[1]).toBeCloseTo(2 * Math.PI, 2);
    expect(irradiance[2]).toBeCloseTo(3 * Math.PI, 2);
    result.coefficients.fill(0);
    expect(grid.evaluate([0.5, 0.5, 0.5], [0, 0, 1])![0]).toBeCloseTo(Math.PI, 2);
  });

  it("accepts WebGPU grids larger than the WebGL2 limit while respecting the work cap", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [17, 17, 17], backend: "webgpu" });
    const options = { grid, samplesPerProbe: 16, sampleRadiance: () => [1, 1, 1] as const };
    const bake = new NativeProbeBake(options);
    expect(bake.step(1)).toEqual({ status: "running", work: 1 });
    expect(() => new NativeProbeBake({ ...options, samplesPerProbe: 4096 })).toThrow(/work limit/);
    bake.cancel();
    grid.dispose();
  });

  it("does not mutate the target grid when a probe capture is cancelled", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    grid.setProbeIrradiance(0, 0, 0, [2, 0, 0]);
    const signal = new AbortController();
    const bake = new NativeProbeBake({ grid, signal: signal.signal, sampleRadiance: () => { signal.abort(); return [1, 1, 1]; } });
    expect(bake.step(1).status).toBe("cancelled");
    expect(() => bake.writeToGrid(grid)).toThrow(/completion/);
    expect(grid.revision).toBe(1);
    expect(grid.evaluate([0.5, 0.5, 0.5], [0, 1, 0])![0]).toBeCloseTo(2);
  });
});
