import { describe, expect, it, vi } from "vitest";
import { geometry, texture } from "@aura3d/engine";
import { isTextureBinding, MockRenderDevice, PortableShaderMaterial } from "@aura3d/rendering";
import { createProductionPrimitiveMaterial } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { Sculptor } from "../../../packages/addons/src/tools/Sculptor";
import { TubePainter } from "../../../packages/addons/src/tools/TubePainter";
import { fractureConvex } from "../../../packages/addons/src/tools/Fracture";
import { MarchingCubes } from "../../../packages/addons/src/objects/MarchingCubes";
import { generateTerrain, generateTree, generateForest, generateCity, generateStreetAssets } from "../../../packages/addons/src/generators/EnvironmentGenerators";
import { createGroundedSky, createShadowProjection, VolumeSlice } from "../../../packages/addons/src/objects/SpecializedObjects";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";

const square = {
  positions: new Float32Array([0, 0, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]),
  uvs: new Float32Array([0.5, 0.5, 0, 0, 1, 0, 1, 1, 0, 1]),
  groups: [{ start: 0, count: 12, materialIndex: 2 }]
};

function faceDotNormal(positions: Float32Array, normals: Float32Array, indices: Uint32Array, offset: number): number {
  const [a, b, c] = Array.from(indices.slice(offset, offset + 3), (index) => index * 3);
  const ax = positions[b]! - positions[a]!, ay = positions[b + 1]! - positions[a + 1]!, az = positions[b + 2]! - positions[a + 2]!;
  const bx = positions[c]! - positions[a]!, by = positions[c + 1]! - positions[a + 1]!, bz = positions[c + 2]! - positions[a + 2]!;
  return (ay * bz - az * by) * normals[a]! + (az * bx - ax * bz) * normals[a + 1]! + (ax * by - ay * bx) * normals[a + 2]!;
}

const box = {
  positions: [-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1],
  indices: [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]
};

describe("editable isosurfaces", () => {
  it("polygonizes a sampled sphere with outward normals and material/color data", () => {
    const surface = new MarchingCubes({ resolution: [9, 9, 9], maxTriangles: 5000 });
    surface.fill(([x, y, z]) => ({ value: 0.55 - Math.hypot(x, y, z), color: [1, 0.25, 0, 1], materialIndex: 3 }));
    const mesh = surface.generate()!;
    expect(mesh.kind).toBe("aura-custom-geometry");
    expect(geometry.custom(mesh).toJSON().kind).toBe("primitive");
    expect(mesh.indices.length / 3).toBeGreaterThan(50);
    expect(mesh.positions.length).toBe(mesh.normals.length);
    expect(mesh.colors!.length).toBe(mesh.positions.length / 3 * 4);
    expect(mesh.groups!.reduce((sum, group) => sum + group.count, 0)).toBe(mesh.indices.length);
    expect(mesh.groups!.every((group) => group.materialIndex === 3)).toBe(true);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const length = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
      const radial = mesh.positions[i]! * mesh.normals[i]! + mesh.positions[i + 1]! * mesh.normals[i + 1]! + mesh.positions[i + 2]! * mesh.normals[i + 2]!;
      expect(length).toBeCloseTo(1, 4);
      expect(radial).toBeGreaterThan(0);
    }
    for (let i = 0; i < mesh.indices.length; i += 3) expect(faceDotNormal(mesh.positions, mesh.normals, mesh.indices, i)).toBeGreaterThan(0);
    const before = surface.getSample(4, 4, 4);
    const edit = surface.setSample(4, 4, 4, -1, [0, 1, 0, 1], 2);
    surface.applyEdit(edit, "undo"); expect(surface.getSample(4, 4, 4)).toEqual(before);
    surface.applyEdit(edit, "redo"); expect(surface.getSample(4, 4, 4)).toEqual(edit.after);
    surface.dispose(); surface.dispose(); expect(() => surface.generate()).toThrow(/disposed/);
    expect(mesh.positions.length).toBeGreaterThan(0);
  });

  it("enforces grid/output bounds and rolls back failed fills", () => {
    expect(() => new MarchingCubes({ resolution: [1024, 1024, 2] })).toThrow(/samples/);
    expect(() => new MarchingCubes({ resolution: [1, 2, 2] })).toThrow(/resolution/);
    const surface = new MarchingCubes({ resolution: [3, 3, 3], maxTriangles: 1 });
    expect(surface.generate(1)).toBeNull();
    surface.fill(([x]) => x);
    const oldSample = surface.getSample(1, 1, 1);
    expect(() => surface.fill((_position, [x]) => x === 1 ? NaN : 3)).toThrow();
    expect(surface.getSample(1, 1, 1)).toEqual(oldSample);
    expect(() => surface.generate(0.25)).toThrow(/maxTriangles/);
    expect(() => surface.setSample(3, 0, 0, 1)).toThrow();
  });
});

describe("deterministic environment generators", () => {
  it("produces repeatable bounded terrain compatible with the heightfield API", () => {
    const opts = { seed: 42, columns: 7, rows: 5, size: [12, 8] as const, origin: [-6, 2, -4] as const, height: 3 };
    const first = generateTerrain(opts), same = generateTerrain(opts), other = generateTerrain({ ...opts, seed: 43 });
    const geometry = first.parts[0]!.geometry;
    expect(geometry.positions).toEqual(same.parts[0]!.geometry.positions);
    expect(geometry.positions).not.toEqual(other.parts[0]!.geometry.positions);
    expect(first.vertexCount).toBe(35);
    expect(first.triangleCount).toBe(48);
    expect(first.terrainOptions.height.kind).toBe("array");
    const heights = (first.terrainOptions.height as { readonly heights: Float32Array }).heights;
    expect(first.heightAt(-6, -4)).toBeCloseTo(2 + heights[0]!, 5);
    expect(first.heightAt(-100, -100)).toBeCloseTo(first.heightAt(-6, -4), 5);
    expect(first.heightAt(0, 0)).toBeCloseTo(2 + heights[2 * 7 + 3]!, 5);
    const positions = geometry.positions as Float32Array, normals = geometry.normals as Float32Array, indices = geometry.indices as Uint32Array;
    for (let i = 0; i < indices.length; i += 3) expect(faceDotNormal(positions, normals, indices, i)).toBeGreaterThan(0);
    const held = geometry.positions;
    first.dispose(); first.dispose();
    expect(first.parts).toHaveLength(0); expect(first.disposed).toBe(true);
    expect(() => first.heightAt(0, 0)).toThrow(/disposed/);
    expect(held.length).toBe(35 * 3);
    same.dispose(); other.dispose();
  });

  it("generates seeded tree, forest, city and street geometry with outward faces and budgets", () => {
    const factory = () => [
      generateTree({ seed: 8, branchLevels: 2, radialSegments: 5 }),
      generateForest({ seed: 8, count: 3, min: [-8, -8], max: [8, 8], minDistance: 2, ground: () => 1, branchLevels: 1, radialSegments: 4 }),
      generateCity({ seed: 8, columns: 2, rows: 2 }),
      generateStreetAssets({ seed: 8, path: [[0, 0, 0], [0, 0, 30]], spacing: 10, sides: "both" })
    ];
    const generated = factory(), repeated = factory();
    for (let i = 0; i < generated.length; i += 1) {
      const result = generated[i]!;
      expect(result.vertexCount).toBeGreaterThan(0);
      expect(result.triangleCount).toBeGreaterThan(0);
      expect(result.bounds).not.toBeNull();
      expect(result.placements).toEqual(repeated[i]!.placements);
      expect(result.parts.map((part) => part.geometry.positions)).toEqual(repeated[i]!.parts.map((part) => part.geometry.positions));
      for (const { geometry } of result.parts) {
        const positions = geometry.positions as Float32Array, normals = geometry.normals as Float32Array, indices = geometry.indices as Uint32Array;
        expect(geometry.kind).toBe("aura-custom-geometry");
        expect(positions.length).toBe(normals.length);
        for (let j = 0; j < normals.length; j += 3) expect(Math.hypot(...normals.slice(j, j + 3))).toBeCloseTo(1, 4);
        for (let j = 0; j < indices.length; j += 3) expect(faceDotNormal(positions, normals, indices, j)).toBeGreaterThan(0);
      }
      for (const part of result.parts) expect(geometry.custom(part.geometry).toJSON().kind).toBe("primitive");
      result.dispose(); repeated[i]!.dispose();
    }
    expect(generated[1]!.disposed).toBe(true);
    expect(() => generateTerrain({ columns: 100, rows: 100, budget: { maxVertices: 20 } })).toThrow(/budget/);
    expect(() => generateForest({ count: 3, budget: { maxInstances: 2 } })).toThrow(/budget/);
    expect(() => generateCity({ columns: 0 })).toThrow();
    expect(() => generateStreetAssets({ path: [[0, 0, 0], [0, 1, 0]] })).toThrow(/horizontal/);
  });
});

describe("specialized scene objects", () => {
  it("lowers all specialized object materials with paired stages and retains their resource and render-state contracts", () => {
    const panorama = texture.data({ width: 1, height: 1, data: new Uint8Array([32, 64, 128, 255]), format: "rgba8", colorSpace: "linear" });
    const slice = new VolumeSlice({ dimensions: [1, 1, 1], values: [0.5], opacity: 0.6 });
    const ground = createGroundedSky({ center: [2, 0, 3], radius: 10 });
    const projected = createGroundedSky({ panorama, radius: 10 });
    const shadow = createShadowProjection({ casterBounds: { min: [0, 1, 0], max: [1, 2, 1] }, lightDirection: [0, -1, 0], color: [0.1, 0.2, 0.3], opacity: 0.4 });
    const nodes = [ground.ground.toJSON(), projected.ground.toJSON(), shadow.node.toJSON(), slice.node.toJSON()];
    const device = new MockRenderDevice();
    const materials: PortableShaderMaterial[] = [];
    try {
      for (const node of nodes) {
        expect(node.castShadow).toBe(false);
        expect(node.receiveShadow).toBe(false);
        const compiled = createProductionPrimitiveMaterial(node);
        if (!(compiled instanceof PortableShaderMaterial)) {
          compiled.dispose();
          throw new Error("Specialized objects require a portable shader material.");
        }
        materials.push(compiled);
        expect(compiled.sources.glsl.vertex).toBeTruthy();
        expect(compiled.sources.glsl.fragment).toBeTruthy();
        expect(compiled.sources.wgsl?.vertex).toContain("@vertex");
        expect(compiled.sources.wgsl?.fragment).toContain("@fragment");
        expect(compiled.compile(device)).toMatchObject({ ok: true, diagnostics: [] });
      }

      const [groundMaterial, panoramaMaterial, shadowMaterial, sliceMaterial] = materials;
      expect(groundMaterial!.getParameter("u_groundCenter")).toEqual([2, 3]);
      expect(groundMaterial!.getParameter("u_groundRadius")).toBe(10);
      expect(shadowMaterial!.getParameter("u_shadowTint")).toEqual([0.1, 0.2, 0.3]);
      expect(shadowMaterial!.getParameter("u_shadowOpacity")).toBe(0.4);
      for (const material of [groundMaterial!, panoramaMaterial!]) {
        expect(material.renderState).toMatchObject({ blend: false, depthTest: true, depthWrite: true, cullMode: "none" });
      }
      for (const material of [shadowMaterial!, sliceMaterial!]) {
        expect(material.renderState).toMatchObject({ blend: true, blendMode: "alpha", depthTest: true, depthWrite: false, cullMode: "none" });
      }
      const panoramaBinding = panoramaMaterial!.getParameter("u_panoramaMap");
      const sliceBinding = sliceMaterial!.getParameter("u_sliceMap");
      expect(isTextureBinding(panoramaBinding) && panoramaBinding.texture).toBe(panorama.texture);
      expect(isTextureBinding(sliceBinding) && sliceBinding.texture).toBe(slice.texture.texture);
    } finally {
      for (const material of materials) material.dispose();
      device.dispose();
      // Releasing materials must not dispose either texture: the caller owns the
      // panorama, and the volume slice owns its own editable texture.
      expect(panorama.texture.disposed).toBe(false);
      expect(slice.texture.texture.disposed).toBe(false);
      panorama.dispose();
      slice.dispose();
    }
  });

  it("builds a bounded ground and projects caster bounds onto a receiver", () => {
    const sky = createGroundedSky({ hour: 12, radius: 10, segments: 12, center: [2, 0, 3] });
    expect(sky.nodes).toHaveLength(2);
    expect(sky.dayFactor).toBeGreaterThan(0);
    expect(() => createGroundedSky({ radius: -1 })).toThrow(/radius/);
    const projection = createShadowProjection({ casterBounds: { min: [0, 1, 0], max: [1, 2, 1] }, lightDirection: [0, -1, 0] });
    expect(projection.points.length).toBeGreaterThanOrEqual(4);
    expect(projection.bounds.min[0]).toBeCloseTo(0);
    expect(projection.bounds.max[2]).toBeCloseTo(1);
    const positions = Float32Array.from(projection.geometry.positions as number[]);
    const normals = Float32Array.from(projection.geometry.normals as number[]);
    const indices = Uint32Array.from(projection.geometry.indices as number[]);
    for (let i = 0; i < indices.length; i += 3) expect(faceDotNormal(positions, normals, indices, i)).toBeGreaterThan(0);
    expect(() => createShadowProjection({ casterBounds: { min: [0, 1, 0], max: [1, 2, 1] }, lightDirection: [1, 0, 0] })).toThrow(/down/);
    expect(() => createShadowProjection({ casterBounds: { min: [0, -1, 0], max: [1, 2, 1] }, lightDirection: [0, -1, 0] })).toThrow(/receiver/);
  });

  it("uploads edited volume slices, synchronizes geometry and releases owned texture", () => {
    const slice = new VolumeSlice({ dimensions: [2, 2, 2], values: [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25] });
    const uploads = slice.texture.texture;
    expect(Array.from(slice.getPixels())).toEqual([0,0,0,255, 64,64,64,255, 128,128,128,255, 191,191,191,255]);
    const initialRevision = uploads.revision;
    let livePositions: Float32Array | undefined;
    slice.bind({ setGeometry: (spec) => { livePositions = spec.positions as Float32Array; } });
    expect(livePositions![2]).toBeCloseTo(-0.5);
    slice.setSlice(1);
    expect(livePositions![2]).toBeCloseTo(0.5);
    expect(Array.from(slice.getPixels())).toEqual([255,255,255,255, 191,191,191,255, 128,128,128,255, 64,64,64,255]);
    expect(uploads.revision).toBeGreaterThan(initialRevision);
    expect(Array.from(uploads.data as Uint8Array)).toEqual(Array.from(slice.getPixels()));
    slice.setWindow([0, 2]); slice.setOpacity(0.5);
    expect(slice.getPixels()[0]).toBe(128);
    expect(slice.getPixels()[3]).toBe(128);
    const before = slice.getPixels();
    expect(() => slice.setSlice(2)).toThrow(/index/);
    expect(slice.getPixels()).toEqual(before);
    expect(() => slice.setValues([1])).toThrow(/exactly/);
    slice.dispose(); slice.dispose();
    expect(uploads.disposed).toBe(true);
    expect(() => slice.getPixels()).toThrow(/disposed/);
    expect(() => slice.texture).toThrow(/disposed/);
    expect(() => slice.node).toThrow(/disposed/);
  });

  it("addresses x and y slices correctly and rolls back a rejected live update", () => {
    const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const xslice = new VolumeSlice({ dimensions: [2, 2, 2], values, axis: "x", index: 1 });
    const yslice = new VolumeSlice({ dimensions: [2, 2, 2], values, axis: "y", index: 1 });
    expect(Array.from(xslice.getPixels()).filter((_value, i) => i % 4 === 0)).toEqual([26, 128, 77, 178]);
    expect(Array.from(yslice.getPixels()).filter((_value, i) => i % 4 === 0)).toEqual([51, 77, 153, 178]);
    const oldPixels = xslice.getPixels();
    let calls = 0;
    xslice.bind({ setGeometry: () => { if (++calls > 1) throw new Error("rejected"); } });
    expect(() => xslice.setSlice(0)).toThrow(/rejected/);
    expect(xslice.index).toBe(1);
    expect(xslice.getPixels()).toEqual(oldPixels);
    xslice.dispose(); yslice.dispose();
  });

  it("reuploads updated slice bytes to the same WebGL texture and releases it after its fence", async () => {
    const uploads: number[][] = [];
    const deleted: unknown[] = [];
    const deletedSyncs: unknown[] = [];
    const fences: unknown[] = [];
    const fence = {};
    let signaled = false;
    let waits = 0;
    const gl = {
      TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_CUBE_MAP: 0x8513,
      RGBA32F: 0x8814, RGBA16F: 0x881a, RGBA8: 0x8058, RGBA: 0x1908,
      FLOAT: 0x1406, HALF_FLOAT: 0x140b, UNSIGNED_BYTE: 0x1401, NONE: 0,
      TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d, TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
      NEAREST: 0x2600, LINEAR: 0x2601, SRGB: 0x8c42, SRGB8_ALPHA8: 0x8c43,
      UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
      UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243, BROWSER_DEFAULT_WEBGL: 0x9244,
      SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a,
      TIMEOUT_EXPIRED: 0x911b, CONDITION_SATISFIED: 0x911c,
      createTexture: () => ({}), deleteTexture(handle: unknown) { deleted.push(handle); }, bindTexture() {}, pixelStorei() {},
      texParameteri() {}, texImage2D() {}, texStorage2D() {}, generateMipmap() {},
      texSubImage2D(...args: unknown[]) { uploads.push(Array.from(args.at(-1) as Uint8Array)); },
      fenceSync() { fences.push(fence); return fence; }, flush() {},
      clientWaitSync() { waits += 1; return signaled ? 0x911c : 0x911b; },
      deleteSync(sync: unknown) { deletedSyncs.push(sync); },
      getExtension: () => null, getParameter: () => 4096
    };
    const device = { kind: "webgl2" } as const;
    const host = { gl, device, stateCache: { invalidate() {} }, counters: { releasedTextureHandles: 0 }, lifecycle: { readError: () => null } };
    const registry = new WebGL2TextureRegistry(host as never);
    const slice = new VolumeSlice({ dimensions: [2, 2, 2], values: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7] });
    const native = slice.texture.texture;
    const handle = registry.getTextureHandle(native);
    expect(uploads.at(-1)).toEqual(Array.from(slice.getPixels()));
    slice.setSlice(1);
    expect(registry.getTextureHandle(native)).toBe(handle);
    expect(uploads.at(-1)).toEqual(Array.from(slice.getPixels()));
    expect(textureBudgetReport(device as never).textureBytes).toBe(16);

    vi.useFakeTimers();
    try {
      slice.dispose();
      registry.releaseDisposedTextureHandles();
      expect(native.disposed).toBe(true);
      expect(registry.textures.has(native)).toBe(false);
      expect(host.counters.releasedTextureHandles).toBe(1);
      expect(deleted).toEqual([]);
      expect(fences).toEqual([]); // the fence is inserted after the current draw stack
      expect(textureBudgetReport(device as never).textureBytes).toBe(16);
      let drained = false;
      const retirement = new Promise<void>((resolve) => registry.onNativeRetirementsDrained(() => { drained = true; resolve(); }));
      await Promise.resolve();
      expect(fences).toEqual([fence]);
      await vi.advanceTimersByTimeAsync(0);
      expect(waits).toBe(1);
      expect(deleted).toEqual([]);
      expect(drained).toBe(false);
      expect(textureBudgetReport(device as never).textureBytes).toBe(16);
      signaled = true;
      await vi.advanceTimersByTimeAsync(8);
      expect(drained).toBe(true);
      await retirement;
      expect(deleted).toEqual([handle]);
      expect(deletedSyncs).toEqual([fence]);
      expect(textureBudgetReport(device as never).textureBytes).toBe(0);
      slice.dispose();
      registry.releaseDisposedTextureHandles();
      expect(deleted).toEqual([handle]);
      expect(host.counters.releasedTextureHandles).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("bounded sculpting", () => {
  it("moves nearby vertices along normals, limits total displacement, refreshes bounds/normals, and round-trips undo", () => {
    const sculptor = new Sculptor(square, { maxDisplacement: 0.25 });
    const initial = sculptor.geometry();
    expect(initial.normals.slice(0, 3)).toEqual(new Float32Array([0, 0, 1]));
    const edit = sculptor.applyBrush({ center: [0, 0, 0], radius: 0.75, strength: 2 });
    const moved = sculptor.geometry();
    expect(Array.from(edit.indices)).toEqual([0]);
    expect(moved.positions[2]).toBe(0.25);
    expect(Array.from(moved.positions.slice(3))).toEqual(Array.from(initial.positions.slice(3)));
    expect(moved.normals[3]).not.toBe(0);
    expect(moved.bounds.max[2]).toBe(0.25);
    expect(moved.uvs).toEqual(square.uvs);
    expect(moved.groups).toEqual(square.groups);
    expect(moved.dynamic).toBe(true);
    expect(geometry.custom(moved).toJSON().kind).toBe("primitive");
    sculptor.applyEdit(edit, "undo");
    expect(sculptor.geometry().positions).toEqual(initial.positions);
    expect(sculptor.geometry().normals).toEqual(initial.normals);
    expect(() => sculptor.applyEdit(edit, "undo")).toThrow(/conflict/);
    sculptor.applyEdit(edit, "redo");
    expect(sculptor.geometry().positions).toEqual(moved.positions);
    moved.positions[2] = 99;
    square.positions[2] = 99;
    expect(sculptor.geometry().positions[2]).toBe(0.25);
    square.positions[2] = 0;
    sculptor.dispose(); sculptor.dispose();
    expect(() => sculptor.geometry()).toThrow(/disposed/);
    expect(edit.after[2]).toBe(0.25);
  });

  it("rejects malformed budgets, geometry, brushes and conflicting edits without mutating geometry", () => {
    expect(() => new Sculptor(square, { maxVertices: 4 })).toThrow(/budget/);
    expect(() => new Sculptor({ positions: [0, 0, NaN] })).toThrow();
    expect(() => new Sculptor({ ...square, indices: [0, 1, 9] })).toThrow(/index/i);
    expect(() => new Sculptor({ ...square, morphTargets: [] })).toThrow(/morphTargets/);
    const sculptor = new Sculptor(square);
    const before = sculptor.geometry();
    expect(() => sculptor.applyBrush({ center: [0, 0, 0], radius: 0, strength: 1 })).toThrow();
    expect(() => sculptor.applyBrush({ center: [0, 0, 0], radius: 1, strength: 1, direction: [0, 0, 0] })).toThrow();
    const edit = sculptor.applyBrush({ center: [0, 0, 0], radius: 0.5, strength: 0.1, direction: [0, 0, 1] });
    const changed = sculptor.geometry();
    const broken = { ...edit, indices: new Uint32Array([0, 0]), before: new Float32Array(6), after: new Float32Array(6) };
    expect(() => sculptor.applyEdit(broken, "undo")).toThrow();
    expect(sculptor.geometry().positions).toEqual(changed.positions);
    sculptor.applyEdit(edit, "undo");
    expect(sculptor.geometry().positions).toEqual(before.positions);
  });

  it("normalizes small triangle areas without underflow", () => {
    const sculptor = new Sculptor({ positions: [0, 0, 0, 1e-23, 0, 0, 0, 1e-23, 0] });
    expect(Array.from(sculptor.geometry().normals.slice(0, 3))).toEqual([0, 0, 1]);
    sculptor.dispose();
  });
});

describe("tube drawing", () => {
  it("creates outward facing side and cap triangles, stable UVs, normals and bounds", () => {
    const painter = new TubePainter({ radius: 0.5, radialSegments: 8 });
    expect(painter.geometry()).toBeNull();
    painter.addPoint([0, 0, 0]); painter.addPoint([0, 0, 2]); painter.addPoint([1, 0, 3]);
    const tube = painter.geometry()!;
    expect(tube.positions.length / 3).toBe(3 * 9 + 2 * 10);
    expect(geometry.custom(tube).toJSON().kind).toBe("primitive");
    expect(tube.indices.length / 3).toBe(2 * 2 * 8 + 2 * 8);
    for (let i = 0; i < tube.indices.length; i += 3) expect(faceDotNormal(tube.positions, tube.normals, tube.indices, i)).toBeGreaterThan(0);
    for (let i = 0; i < tube.normals.length; i += 3) expect(Math.hypot(...tube.normals.slice(i, i + 3))).toBeCloseTo(1, 5);
    expect(tube.bounds.min[2]).toBeLessThanOrEqual(0);
    expect(tube.bounds.max[2]).toBeGreaterThanOrEqual(3);
    expect(tube.uvs[0]).toBe(0);
    expect(tube.uvs[(3 - 1) * 9 * 2]).toBe(1);
    expect(painter.removeLastPoint()).toEqual([1, 0, 3]);
    expect(painter.geometry()!.indices.length).toBeLessThan(tube.indices.length);
    painter.clear(); expect(painter.geometry()).toBeNull();
    painter.dispose(); painter.dispose();
    expect(() => painter.addPoint([1, 2, 3])).toThrow(/disposed/);
    expect(tube.positions.length).toBeGreaterThan(0);
  });

  it("honors open caps and input budgets without modifying a path on failure", () => {
    const painter = new TubePainter({ radialSegments: 4, capped: false, maxPoints: 2, maxTriangles: 8 });
    painter.addPoint([0, 0, 0]); painter.addPoint([0, 1, 0]);
    expect(painter.geometry()!.indices.length).toBe(24);
    expect(() => painter.addPoint([1, 1, 0])).toThrow(/budget/);
    expect(painter.pointCount).toBe(2);
    painter.removeLastPoint();
    expect(() => painter.addPoint([0, 0, 0])).toThrow(/differ/);
    expect(painter.pointCount).toBe(1);
    expect(() => new TubePainter({ radius: -1 })).toThrow();
    expect(() => new TubePainter({ radialSegments: 2 })).toThrow();
    const precision = new TubePainter({ radius: 0.01 });
    precision.addPoint([1e9, 0, 0]); precision.addPoint([1e9, 1, 0]);
    expect(() => precision.geometry()).toThrow(/collapsed|inverted/);
    const turn = new TubePainter();
    turn.addPoint([0, 0, 0]); turn.addPoint([0, 1, 0]);
    expect(() => turn.addPoint([0, 0, 0])).toThrow(/reverse/);
  });
});

describe("convex fracture", () => {
  it("caps a deterministic split and conserves the original solid's volume", () => {
    const a = fractureConvex(box, { planes: [{ normal: [1, 0, 0], constant: 0 }], capMaterialIndex: 5 });
    expect(a.fragments).toHaveLength(2);
    expect(a.fragments.reduce((sum, f) => sum + f.volume, 0)).toBeCloseTo(8, 5);
    for (const fragment of a.fragments) expect(fragment.volume).toBeCloseTo(4, 8);
    for (const fragment of a.fragments) {
      expect(fragment.geometry.kind).toBe("aura-custom-geometry");
      expect(geometry.custom(fragment.geometry).toJSON().kind).toBe("primitive");
      expect(fragment.geometry.groups.some((group) => group.materialIndex === 5)).toBe(true);
      for (let i = 0; i < fragment.geometry.indices.length; i += 3) expect(faceDotNormal(fragment.geometry.positions, fragment.geometry.normals, fragment.geometry.indices, i)).toBeGreaterThan(0);
    }
    const snapshot = a.fragments[0]!.geometry.positions;
    a.dispose(); a.dispose(); expect(a.fragments).toHaveLength(0); expect(snapshot.length).toBeGreaterThan(0);
  });

  it("repeats seeded cuts and rejects unsupported or unbounded inputs", () => {
    const first = fractureConvex(box, { pieces: 4, seed: 123 });
    const second = fractureConvex(box, { pieces: 4, seed: 123 });
    expect(first.fragments.map((f) => Array.from(f.geometry.positions))).toEqual(second.fragments.map((f) => Array.from(f.geometry.positions)));
    expect(first.fragments.reduce((sum, f) => sum + f.volume, 0)).toBeCloseTo(8, 5);
    const original = first.fragments[0]!;
    const recut = fractureConvex(original.geometry, { pieces: 2, seed: 99 });
    expect(recut.fragments).toHaveLength(2);
    expect(recut.fragments.reduce((sum, f) => sum + f.volume, 0)).toBeCloseTo(original.volume, 5);
    for (const { geometry } of recut.fragments) {
      for (let i = 0; i < geometry.indices.length; i += 3) expect(faceDotNormal(geometry.positions, geometry.normals, geometry.indices, i)).toBeGreaterThan(0);
    }
    expect(() => fractureConvex({ ...box, uvs: [] })).toThrow(/uvs/i);
    expect(() => fractureConvex({ ...box, indices: box.indices.slice(3) })).toThrow(/closed|manifold/i);
    expect(() => fractureConvex(box, { pieces: 129 })).toThrow();
    first.dispose(); second.dispose(); recut.dispose();
  });
});
