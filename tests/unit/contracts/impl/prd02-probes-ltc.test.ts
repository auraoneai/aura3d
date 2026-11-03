// PRD-02 §6.6/§8.5 Phase 5 — reflection probes, irradiance volume, LTC LUTs.

import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd01";
import { MockRenderDevice, type DrawCommand, type RenderShaderProgram, type ShaderSources, type UniformValue } from "../../../../packages/rendering/src/RenderDevice";
import { ForwardPass } from "../../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { createDefaultShaderLibrary } from "../../../../packages/rendering/src/ShaderLibrary";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { PRD02_IRRADIANCE_VOLUME_FEATURE } from "../../../../packages/rendering/src/probes/ProbeBoxProjection";
import { shaderGraph } from "../../../../packages/engine/src/agent-api/nodes/shaderGraph";
import { createCustomShaderMaterial } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import type { ShaderGraphDocument } from "../../../../packages/rendering/src/program/ShaderGraphCompiler";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../../packages/rendering/src/WebGPUDevice";
import { WebGL2TextureRegistry } from "../../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import { halfToFloat } from "../../../../packages/rendering/src/environment/probeBuild";
import { Prd02LightingRuntime } from "../../../../packages/engine/src/lanes/prd02";
import {
  ReflectionProbeSystem, boxWeight, type ReflectionProbeSpec
} from "../../../../packages/rendering/src/probes/ReflectionProbeSystem";
import {
  IrradianceVolumeSystem
} from "../../../../packages/rendering/src/probes/IrradianceVolume";
import {
  createPrd02ProbesContributor, probeNodesFromSource,
  applyProbeEnvironmentCubes, prd02ItemProbeBindings, prd02ItemIrradianceBindings, PROBE_SELECTION_BLACKBOARD_KEY, IRRADIANCE_VOLUME_BLACKBOARD_KEY,
  IRRADIANCE_VOLUMES_BLACKBOARD_KEY, disposePrd02Probes, prd02BeforeFrame, prd02BeforeFrameAsync, prd02IrradianceVolumes, withPrd02ProbeFrameLock,
  ENV_SPECULAR_BLACKBOARD_KEY, ROUGHNESS_TO_LOD_BLACKBOARD_KEY,
  PROBE_RENDER_FACE_KEY
} from "../../../../packages/rendering/src/probes/Prd02ProbesContributor";
import {
  fetchLtcLutTextures, gaussLegendreRectDiffuse, rectDiffuseReference,
  LTC_LUT_SIZE, LTC_LUT_BYTES
} from "../../../../packages/rendering/src/probes/LtcLuts";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import type { RenderSource } from "../../../../packages/rendering/src/contracts/renderSource";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

const spec = (over: Partial<ReflectionProbeSpec> = {}): ReflectionProbeSpec => ({
  name: "p1",
  position: [0, 0, 0],
  boxHalfExtents: [1, 1, 1],
  blendDistance: 0.5,
  update: "once",
  ...over
});

const flatFace: Float32Array[] = Array.from({ length: 6 }, () => {
  const f = new Float32Array(4 * 4 * 4);
  f.fill(0.5);
  return f;
});

const flatRenderer = (face: number, target: RenderTarget) => {
  void face; void target;
};

class IrradianceReadbackDevice extends MockRenderDevice {
  private faceIndex = 0;

  constructor(private readonly brightness = 1) { super(); }

  override readFloatPixels(_x: number, _y: number, width: number, height: number): Float32Array {
    const cell = Math.floor(this.faceIndex / 6);
    const face = this.faceIndex++ % 6;
    // Distinct cells and a brighter +X face exercise both signed SH terms and
    // layer order; RGB channels remain distinct multiples of the same signal.
    const signal = this.brightness * (cell + 1) * (face === 0 ? 2 : 1);
    const pixels = new Float32Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([signal, signal * 2, signal * 3, 1], i);
    return pixels;
  }
}

function bakeIrradiance(resolution: readonly [number, number, number], brightness = 1) {
  const device = new IrradianceReadbackDevice(brightness);
  const system = new IrradianceVolumeSystem(device, flatRenderer);
  system.configure({ name: "grid", min: [0, 0, 0], max: resolution, resolution, captureFaceSize: 8 });
  system.update();
  const volume = system.get();
  if (!volume) throw new Error("Irradiance bake returned no volume");
  return { device, system, volume };
}

function releaseIrradiance(grid: ReturnType<typeof bakeIrradiance>): void {
  grid.volume.textures.forEach((texture) => texture.dispose());
  grid.device.dispose();
}

describe("prd02 ReflectionProbeSystem (PRD-02 §6.6)", () => {
  it("boxWeight fades over blendDistance outside the box", () => {
    const s = spec();
    expect(boxWeight(s, [0, 0, 0])).toBe(1);            // inside box
    expect(boxWeight(s, [1, 0, 0])).toBe(1);            // on the box surface
    expect(boxWeight(s, [1.25, 0, 0])).toBeCloseTo(0.5); // halfway across blend
    expect(boxWeight(s, [1.5, 0, 0])).toBe(0);          // at/behind blend edge
    expect(boxWeight(s, [3, 0, 0])).toBe(0);            // beyond box+blend
  });

  it("uses authored world-space bounds rather than the capture position for influence", () => {
    const s = spec({ position: [0, 0, 0], box: { min: [9, -1, -1], max: [11, 1, 1] } });
    expect(boxWeight(s, [10, 0, 0])).toBe(1);
    expect(boxWeight(s, [0, 0, 0])).toBe(0);
    expect(boxWeight({ ...s, infinite: true }, [1000, 0, 0])).toBe(1);
  });

  it("spaces periodic capture starts by the authored interval without overlapping six-face captures", () => {
    const device = new MockRenderDevice();
    let faces = 0;
    const system = new ReflectionProbeSystem(device, () => { faces += 1; });
    system.register(spec({ name: "periodic", update: "every-n-frames", everyNFrames: 10, resolution: 64 }));
    for (let frame = 1; frame <= 6; frame += 1) system.update(1);
    expect(faces).toBe(6);
    expect(system.probes()[0]?.faceSize).toBe(64);
    for (let frame = 7; frame <= 10; frame += 1) system.update(1);
    expect(faces).toBe(6);
    system.update(1);
    expect(faces).toBe(7);
    system.dispose();
    device.dispose();
  });

  it("rejects reflection capture sizes beyond the device limit before allocating", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    Object.defineProperty(device, "nativeGpuDevice", { value: { limits: { maxTextureDimension2D: 32 } } });
    const system = new ReflectionProbeSystem(device, flatRenderer);
    expect(() => system.register(spec({ resolution: 64 }))).toThrow(/device cube texture size limit/);
    expect(device.getDiagnostics().renderTargets).toBe(0);
    system.dispose();
    device.dispose();
  });

  it("owns its reflection bounds and detects later caller edits on registration", () => {
    const device = new MockRenderDevice();
    const min: [number, number, number] = [-1, -1, -1];
    const max: [number, number, number] = [1, 1, 1];
    const options = spec({ name: "mutable", resolution: 64, box: { min, max } });
    const system = new ReflectionProbeSystem(device, flatRenderer);
    system.register(options);
    min[0] = 9; max[0] = 11;
    system.update();
    expect(system.assign({ position: [0, 0, 0] }).a).not.toBeNull();
    expect(system.assign({ position: [10, 0, 0] }).a).toBeNull();
    const old = system.probes()[0]!.specularCube;
    system.register(options);
    expect(old.disposed).toBe(true);
    system.update();
    expect(system.assign({ position: [10, 0, 0] }).a).not.toBeNull();
    system.dispose();
    device.dispose();
  });

  it("assign picks ≤2 nearest probes and leaves the remainder to global", () => {
    const device = new MockRenderDevice();
    const sys = new ReflectionProbeSystem(device, flatRenderer, { defaultFaceSize: 128 });
    sys.register(spec({ name: "near", position: [0, 0, 0], blendDistance: 2 }));
    sys.register(spec({ name: "far", position: [10, 0, 0], blendDistance: 0.5 }));
    sys.update(); // build captured probes so assign() can see them
    const item = { position: [0, 0, 0] as [number, number, number] };
    const a = sys.assign(item);
    expect(a.a?.spec.name).toBe("near");
    expect(a.b).toBeNull();                            // "far" has no weight here
    expect(a.globalWeight).toBeCloseTo(0, 5);          // inside "near" fully
    const a2 = sys.assign({ position: [5, 0, 0] });
    expect(a2.globalWeight).toBe(1);                   // outside all boxes
    device.dispose();
  });

  it("update captures 6 faces for once-mode and on-demand only when flagged", () => {
    const device = new MockRenderDevice();
    let renders = 0;
    const sys = new ReflectionProbeSystem(device, () => { renders += 1; });
    sys.register(spec({ name: "once" }));
    sys.register(spec({ name: "lazy", update: "on-demand" }));
    sys.update();
    expect(renders).toBe(6);                           // once → 6 faces
    expect(sys.update()).toEqual([]);                  // done; nothing re-captured
    sys.updateProbe("lazy");
    sys.update();
    expect(renders).toBe(12);
    device.dispose();
  });
});

describe("prd02 IrradianceVolumeSystem (PRD-02 §6.6)", () => {
  it("captures large grids incrementally and retains the previous texture until a replacement is complete", () => {
    const device = new MockRenderDevice();
    let faces = 0;
    const system = new IrradianceVolumeSystem(device, () => { faces += 1; });
    system.configure({ name: "grid", min: [0, 0, 0], max: [16, 16, 16], resolution: [16, 16, 16], captureFaceSize: 1 });
    expect(system.step(2)).toEqual({ work: 2, completed: false });
    expect(faces).toBe(12);
    expect(system.get()).toBeNull();
    system.configure({ name: "small", min: [0, 0, 0], max: [2, 2, 2], resolution: [2, 2, 2], captureFaceSize: 1 });
    for (let i = 0; i < 3; i += 1) expect(system.step(2)).toEqual({ work: 2, completed: false });
    expect(system.step(2)).toEqual({ work: 2, completed: true });
    const old = system.get()!;
    system.updateProbe();
    expect(system.step(2)).toEqual({ work: 2, completed: false });
    expect(system.get()).toBe(old);
    expect(old.textures.every((texture) => !texture.disposed)).toBe(true);
    for (let i = 0; i < 3; i += 1) system.step(2);
    expect(system.get()).not.toBe(old);
    expect(old.textures.every((texture) => texture.disposed)).toBe(true);
    system.dispose();
    device.dispose();
  });

  it("enforces reported device texture limits and bounded per-frame updates", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    Object.defineProperty(device, "nativeGpuDevice", { value: { limits: { maxTextureDimension2D: 64, maxTextureArrayLayers: 2 } } });
    const system = new IrradianceVolumeSystem(device, flatRenderer);
    expect(() => system.configure({ name: "too-deep", min: [0, 0, 0], max: [1, 1, 1], resolution: [2, 2, 3] })).toThrow(/device texture/);
    expect(() => system.configure({ name: "bad-budget", min: [0, 0, 0], max: [1, 1, 1], resolution: [2, 2, 2], maxUpdatesPerFrame: 65 })).toThrow(/updates per frame/);
    expect(() => system.configure({ name: "too-wide", min: [0, 0, 0], max: [1, 1, 1], resolution: [17, 2, 2] })).toThrow(/resolution/);
    system.configure({ name: "valid", min: [0, 0, 0], max: [1, 1, 1], resolution: [2, 2, 2] });
    expect(() => system.step(0)).toThrow(/updates per frame/);
    system.dispose();
    device.dispose();
  });

  it("uses the same cell budget and atomic publication with async readback", async () => {
    class AsyncDevice extends MockRenderDevice {
      reads = 0;
      override readFloatPixels(): Float32Array { throw new Error("synchronous readback called"); }
      async readFloatPixelsAsync(_x: number, _y: number, width: number, height: number): Promise<Float32Array> {
        this.reads += 1;
        return new Float32Array(width * height * 4).fill(0.5);
      }
    }
    const device = new AsyncDevice();
    const system = new IrradianceVolumeSystem(device, flatRenderer);
    system.configure({ name: "async-grid", min: [0, 0, 0], max: [2, 1, 1], resolution: [2, 1, 1], captureFaceSize: 1 });
    expect(await system.stepAsync(1)).toEqual({ work: 1, completed: false });
    expect(device.reads).toBe(6);
    expect(system.get()).toBeNull();
    expect(await system.stepAsync(1)).toEqual({ work: 1, completed: true });
    expect(device.reads).toBe(12);
    expect(system.get()?.textures[0].layers).toBe(1);
    system.dispose();
    device.dispose();
  });
  it("cosine-convolves captured radiance into irradiance", () => {
    class UniformDevice extends MockRenderDevice {
      override readFloatPixels(_x: number, _y: number, width: number, height: number): Float32Array {
        const pixels = new Float32Array(width * height * 4);
        for (let i = 0; i < pixels.length; i += 4) pixels.set([1, 2, 3, 1], i);
        return pixels;
      }
    }
    const device = new UniformDevice();
    const system = new IrradianceVolumeSystem(device, flatRenderer);
    system.configure({ name: "uniform", min: [0, 0, 0], max: [1, 1, 1], resolution: [1, 1, 1] });
    system.update();
    const sample = system.sample([0.5, 0.5, 0], [0, 0, 1])!;
    expect(sample[0]).toBeCloseTo(Math.PI, 2);
    expect(sample[1]).toBeCloseTo(2 * Math.PI, 2);
    expect(sample[2]).toBeCloseTo(3 * Math.PI, 2);
    system.dispose();
    device.dispose();
  });

  it("does not publish a stale async capture after its volume is reconfigured", async () => {
    let resume!: () => void;
    class DeferredDevice extends MockRenderDevice {
      reads = 0;
      async readFloatPixelsAsync(_x: number, _y: number, width: number, height: number): Promise<Float32Array> {
        this.reads += 1;
        if (this.reads === 1) await new Promise<void>((resolve) => { resume = resolve; });
        return new Float32Array(width * height * 4).fill(1);
      }
    }
    const device = new DeferredDevice();
    const system = new IrradianceVolumeSystem(device, flatRenderer);
    system.configure({ name: "old", min: [0, 0, 0], max: [1, 1, 1], resolution: [1, 1, 1] });
    const first = system.updateAsync();
    system.configure({ name: "new", min: [2, 2, 2], max: [3, 3, 3], resolution: [1, 1, 1] });
    resume();
    expect(await first).toBe(false);
    expect(system.get()).toBeNull();
    expect(await system.updateAsync()).toBe(true);
    expect(system.get()?.spec.name).toBe("new");
    system.dispose();
    device.dispose();
  });

  it("samples SH-L1 irradiance with bounds fade", () => {
    const device = new MockRenderDevice();
    // readFloatPixels returns zeros — fill via a renderer that writes the target
    // is not possible through the mock; capture produces 0-radiance SH, which is
    // still a valid sample (fade + trilinear exercised).
    const sys = new IrradianceVolumeSystem(device, flatRenderer);
    sys.configure({ name: "vol", min: [-1, -1, -1], max: [1, 1, 1], resolution: [2, 2, 2] });
    sys.update();
    const vol = sys.get();
    expect(vol).not.toBeNull();
    const s = sys.sample([0, 0, 0], [0, 1, 0]);
    expect(s).not.toBeNull();
    expect(s![0]).toBeCloseTo(0, 5); expect(s![1]).toBeCloseTo(0, 5); expect(s![2]).toBeCloseTo(0, 5);
    // Outside bounds + fade shell → null (no contribution)
    expect(sys.sample([50, 50, 50], [0, 1, 0])).toBeNull();
    void flatFace;
    device.dispose();
  });

  it("packs signed coefficients for distinct grid layers into one RGBA16F mip", () => {
    const grid = bakeIrradiance([2, 2, 2]);
    const channels = [grid.volume.shR, grid.volume.shG, grid.volume.shB];
    for (const [channel, texture] of grid.volume.textures.entries()) {
      expect([texture.dimension, texture.width, texture.height, texture.layers, texture.format, texture.mipLevelCount])
        .toEqual(["2d-array", 2, 2, 2, "rgba16f", 1]);
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.mipLevels).toHaveLength(1);
      const packed = texture.mipLevels[0]!.data as Uint16Array;
      expect(packed).toHaveLength(2 * 2 * 2 * 4);
      const expected = channels[channel]!;
      expect(expected[3]).toBeLessThan(0);
      for (let i = 0; i < expected.length; i += 1) {
        const error = Math.abs(halfToFloat(packed[i]!) - expected[i]!);
        expect(error).toBeLessThanOrEqual(Math.max(2 ** -24, Math.abs(expected[i]!) * 0.001));
      }
      expect(halfToFloat(packed[16]!)).toBeGreaterThan(halfToFloat(packed[0]!) * 4.9);
    }
    releaseIrradiance(grid);
  });

  it("preserves small positive and negative half-float coefficients", () => {
    const grid = bakeIrradiance([1, 1, 1], 1e-6);
    const values = grid.volume.shR;
    const packed = grid.volume.textures[0].mipLevels[0]!.data as Uint16Array;
    expect(values[0]).toBeGreaterThan(0);
    expect(values[3]).toBeLessThan(0);
    for (const i of [0, 3]) {
      expect(Math.abs(values[i]!)).toBeLessThan(2 ** -14);
      expect(halfToFloat(packed[i]!)).not.toBe(0);
      expect(Math.abs(halfToFloat(packed[i]!) - values[i]!)).toBeLessThan(2 ** -25 + 1e-12);
    }
    releaseIrradiance(grid);
  });

  it("samples singleton axes and grid endpoints without bias", () => {
    const normal = [0, 0, 1] as const;
    const firstPoint = [0.5, 0.5, 0] as const; // +0.5-cell normal offset reaches the first cell center.
    const single = bakeIrradiance([1, 1, 1]);
    const first = single.system.sample(firstPoint, normal)!;
    expect(first.every(Number.isFinite)).toBe(true);
    expect(first[0]).toBeGreaterThan(0.5);
    expect(first[1]).toBeCloseTo(first[0] * 2, 5);
    expect(first[2]).toBeCloseTo(first[0] * 3, 4);
    for (const resolution of [[1, 2, 2], [2, 1, 2], [2, 2, 1], [2, 2, 2]] as const) {
      const grid = bakeIrradiance(resolution);
      const atFirst = grid.system.sample(firstPoint, normal)!;
      for (let ch = 0; ch < 3; ch += 1) expect(atFirst[ch]).toBeCloseTo(first[ch]!, 5);
      if (resolution[0] === 2 && resolution[1] === 2 && resolution[2] === 2) {
        for (const [point, cells] of [
          [[1.5, 0.5, 0], [1]], [[0.5, 1.5, 0], [2]], [[0.5, 0.5, 1], [4]],
          [[1.5, 1.5, 1], [7]], [[1, 1, 0.5], [0, 1, 2, 3, 4, 5, 6, 7]]
        ] as const) {
          const sample = grid.system.sample(point, normal)!;
          for (const [ch, values] of [grid.volume.shR, grid.volume.shG, grid.volume.shB].entries()) {
            const reference = cells.reduce<number>((sum, cell) => sum + Math.PI * 0.282095 * values[cell * 4]!
              + (2 * Math.PI / 3) * 0.488603 * values[cell * 4 + 2]!, 0) / cells.length;
            expect(sample[ch]).toBeCloseTo(reference, 4);
          }
        }
      }
      releaseIrradiance(grid);
    }
    releaseIrradiance(single);
  });

  it("uploads the packed array through the WebGL and WebGPU source paths", async () => {
    const grid = bakeIrradiance([2, 2, 2]);
    const texture = grid.volume.textures[0];
    const packed = texture.mipLevels[0]!.data as Uint16Array;
    const storage: unknown[][] = [], glWrites: unknown[][] = [];
    const gl = {
      TEXTURE_2D_ARRAY: 0x8c1a, RGBA16F: 0x881a, RGBA: 0x1908, HALF_FLOAT: 0x140b,
      TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d, TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800, NEAREST: 0x2600,
      createTexture: () => ({}), deleteTexture: () => {}, bindTexture: () => {},
      texStorage3D: (...args: unknown[]) => storage.push(args),
      texSubImage3D: (...args: unknown[]) => glWrites.push(args),
      texParameteri: () => {}, pixelStorei: () => {}, getParameter: () => 0, getExtension: () => null
    };
    const host = { gl, device: {}, stateCache: { invalidate: () => {} },
      counters: { releasedTextureHandles: 0 }, lifecycle: { readError: () => null } } as unknown as WebGL2DeviceHost;
    const registry = new WebGL2TextureRegistry(host);
    registry.getTextureHandle(texture);
    expect(storage).toEqual([[gl.TEXTURE_2D_ARRAY, 1, gl.RGBA16F, 2, 2, 2]]);
    expect(glWrites).toHaveLength(2);
    for (let layer = 0; layer < 2; layer += 1) {
      expect(glWrites[layer]!.slice(0, 10)).toEqual([gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, 2, 2, 1, gl.RGBA, gl.HALF_FLOAT]);
      expect(Array.from(glWrites[layer]![10] as Uint16Array)).toEqual(Array.from(packed.subarray(layer * 16, (layer + 1) * 16)));
    }

    const gpuTextures: unknown[] = [], gpuWrites: { destination: unknown; data: number[]; layout: unknown; size: unknown }[] = [];
    const native = {
      queue: {
        writeBuffer: () => {}, submit: () => {},
        writeTexture: (destination: unknown, data: Uint16Array, layout: unknown, size: unknown) => {
          gpuWrites.push({ destination, data: Array.from(data), layout, size });
        }
      },
      createBuffer: () => ({ destroy: () => {} }),
      createTexture: (descriptor: unknown) => { gpuTextures.push(descriptor); return { createView: () => ({}), destroy: () => {} }; }
    };
    const gpu = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    gpu.getNativeTexture(texture);
    expect(gpuTextures[0]).toMatchObject({ size: { width: 2, height: 2, depthOrArrayLayers: 2 }, format: "rgba16float", mipLevelCount: 1 });
    expect(gpuWrites).toHaveLength(1);
    expect(gpuWrites[0]).toMatchObject({ destination: { mipLevel: 0 }, layout: { bytesPerRow: 16, rowsPerImage: 2 }, size: { width: 2, height: 2, depthOrArrayLayers: 2 } });
    expect(gpuWrites[0]!.data).toEqual(Array.from(packed));
    releaseIrradiance(grid);
    registry.releaseDisposedTextureHandles();
    gpu.dispose();
  });
});

/**
 * The engine's prd02 lane compiles probe nodes onto the RenderSource as
 * `prd02.probes.<name>` keys, which RenderSource has no typed slot for.
 */
function probeSource<T extends Record<string, unknown>>(entries: T): RenderSource & T {
  return Object.assign<RenderSource, T>({}, entries);
}

describe("prd02 probes contributor (PRD-02 §6.6)", () => {
  const node = {
    kind: "probe", probe: "reflection", name: "lounge",
    options: { position: [1, 1, 1], boxHalfExtents: [2, 2, 2], blendDistance: 1, update: "once" }
  };
  const ctxFor = (source: Record<string, unknown>): FrameContributorContext => ({
    device: new MockRenderDevice(),
    width: 64, height: 64, frameIndex: 0, timeSeconds: 0,
    camera: null, source, items: [], tier: null,
    flags: { on: () => true }, sceneDepth: null,
    blackboard: new Map<string, unknown>()
  }) as unknown as FrameContributorContext;

  it("reads `prd02.probes.*` nodes from the compiled source", () => {
    const ctx = ctxFor({ "prd02.probes.lounge": node, other: 1 });
    const nodes = probeNodesFromSource(ctx);
    expect(nodes.map((n) => n.name)).toEqual(["lounge"]);
  });

  it("honors authored reflection bounds, face size and update interval", () => {
    const device = new MockRenderDevice();
    const source = probeSource({ "prd02.probes.offset": { kind: "probe", probe: "reflection", name: "offset", options: {
      position: [0, 0, 0], box: { min: [9, -1, -1], max: [11, 1, 1] }, resolution: 64, update: { everyNFrames: 10 }
    } } });
    const flags = ctxFor(source).flags;
    const sizes: number[] = [];
    const renderer = { device, renderProbeFace: (_source: unknown, _face: number, target: RenderTarget) => { sizes.push(target.width); } };
    for (let frame = 0; frame < 6; frame += 1) prd02BeforeFrame(renderer, source, flags);
    expect(sizes).toEqual([64, 64, 64, 64, 64, 64]);
    const itemAt = (x: number) => ({ geometry: {} as never, modelMatrix: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]) });
    const [inside, outside] = applyProbeEnvironmentCubes([itemAt(10), itemAt(0)], device);
    expect(inside.environmentCube).toBeDefined();
    expect(outside.environmentCube).toBeUndefined();
    for (let frame = 0; frame < 4; frame += 1) prd02BeforeFrame(renderer, source, flags);
    expect(sizes).toHaveLength(6);
    prd02BeforeFrame(renderer, source, flags);
    expect(sizes).toHaveLength(7);
    disposePrd02Probes(device);
    device.dispose();
  });

  it("dispatches named app updates to an on-demand reflection probe", async () => {
    const device = new MockRenderDevice();
    const owner = {};
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const source = probeSource({ "prd02.probes.mirror": { kind: "probe", probe: "reflection", name: "mirror", options: {
      position: [0, 0, 0], resolution: 64, update: "on-demand"
    } } });
    const flags = ctxFor(source).flags;
    let faces = 0;
    const renderer = { device, renderProbeFace: () => { faces += 1; } };
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(faces).toBe(0);
    await runtime.updateProbe("mirror");
    expect(prd02BeforeFrame(renderer, source, flags, owner)).toEqual(["mirror"]);
    expect(faces).toBe(6);
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(faces).toBe(6);
    disposePrd02Probes(device);
    device.dispose();
  });

  it("retains an update request until a matching on-demand probe is registered", async () => {
    const device = new MockRenderDevice();
    const owner = {};
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const flags = ctxFor({}).flags;
    let faces = 0;
    const renderer = { device, renderProbeFace: () => { faces += 1; } };
    await runtime.updateProbe("later");
    prd02BeforeFrame(renderer, {}, flags, owner);
    expect(faces).toBe(0);
    const source = probeSource({ "prd02.probes.later": { kind: "probe", probe: "reflection", name: "later", options: {
      position: [0, 0, 0], resolution: 64, update: "on-demand"
    } } });
    expect(prd02BeforeFrame(renderer, source, flags, owner)).toEqual(["later"]);
    expect(faces).toBe(6);
    disposePrd02Probes(device, owner);
    device.dispose();
  });

  it("shares a bounded cell budget fairly across volumes", () => {
    const device = new MockRenderDevice();
    const options = (x: number) => ({ bounds: { min: [x, 0, 0], max: [x + 2, 2, 2] }, resolution: [2, 2, 2], maxUpdatesPerFrame: 2 });
    const source = probeSource({
      "prd02.probes.a": { kind: "probe", probe: "irradiance-volume", name: "a", options: options(0) },
      "prd02.probes.b": { kind: "probe", probe: "irradiance-volume", name: "b", options: options(4) }
    });
    let faces = 0;
    const renderer = { device, renderProbeFace: () => { faces += 1; } };
    const flags = ctxFor(source).flags;
    for (let frame = 1; frame <= 3; frame += 1) {
      prd02BeforeFrame(renderer, source, flags);
      expect(faces).toBe(frame * 24);
      expect(prd02IrradianceVolumes(device)).toHaveLength(0);
    }
    prd02BeforeFrame(renderer, source, flags);
    expect(faces).toBe(96);
    expect(prd02IrradianceVolumes(device).map((volume) => volume.spec.name)).toEqual(["a", "b"]);
    disposePrd02Probes(device);
    device.dispose();
  });

  it("binds completed owner-scoped irradiance volumes selected by the transformed item centre", () => {
    const device = new MockRenderDevice();
    const owner = {}, otherOwner = {};
    const options = (x: number) => ({ bounds: { min: [x, 0, 0], max: [x + 2, 2, 2] }, resolution: [2, 2, 2], intensity: 1.5, maxUpdatesPerFrame: 1 });
    const source = probeSource({
      "prd02.probes.a": { kind: "probe", probe: "irradiance-volume", name: "a", options: options(0) },
      "prd02.probes.b": { kind: "probe", probe: "irradiance-volume", name: "b", options: options(10) }
    });
    const renderer = { device, renderProbeFace: () => {} };
    const flags = ctxFor(source).flags;
    const item = { geometry: {} as never, boundingBoxCenter: [1, 1, 1] as const,
      modelMatrix: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]) };
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(prd02ItemIrradianceBindings(applyProbeEnvironmentCubes([item], device, owner)[0], device, owner)).toBeNull();
    for (let frame = 1; frame < 8; frame += 1) prd02BeforeFrame(renderer, source, flags, owner);
    const tagged = applyProbeEnvironmentCubes([item], device, owner)[0];
    const selection = prd02ItemIrradianceBindings(tagged, device, owner)!;
    expect(selection.volume.spec.name).toBe("b");
    expect(prd02ItemIrradianceBindings(tagged, device, otherOwner)).toBeNull();
    expect(selection.uniforms.u_prd02IrradianceMin).toEqual(new Float32Array([10, 0, 0, 0]));
    expect(selection.uniforms.u_prd02IrradianceMax).toEqual(new Float32Array([12, 2, 2, 0]));
    expect(selection.uniforms.u_prd02IrradianceGrid).toEqual(new Float32Array([2, 2, 2, 1.5]));
    for (const [channel, texture] of ["R", "G", "B"].map((channel, i) => [channel, selection.volume.textures[i]] as const)) {
      const binding = selection.uniforms[`u_prd02Irradiance${channel}`] as TextureBinding;
      expect(binding.texture).toBe(texture);
      expect(binding.validate().ok).toBe(true);
      expect(binding.sampler.minFilter).toBe("nearest");
      expect(binding.texture).toMatchObject({ width: 2, height: 2, layers: 2, dimension: "2d-array", format: "rgba16f" });
    }
    const tie = { ...item, boundingBoxCenter: [-4, 1, 1] as const };
    expect(prd02ItemIrradianceBindings(applyProbeEnvironmentCubes([tie], device, owner)[0], device, owner)?.volume.spec.name).toBe("a");
    disposePrd02Probes(device, owner);
    expect(selection.volume.textures.every((texture) => texture.disposed)).toBe(true);
    expect(prd02ItemIrradianceBindings(tagged, device, owner)).toBeNull();
    device.dispose();
  });

  it("rejects volume uniforms that collapse or overflow at GPU float32 precision", () => {
    const bind = (minX: number, maxX: number, intensity: number, check: (draw: () => ReturnType<typeof prd02ItemIrradianceBindings>) => void) => {
      const device = new MockRenderDevice();
      const owner = {};
      const source = probeSource({ "prd02.probes.room": { kind: "probe", probe: "irradiance-volume", name: "room", options: {
        bounds: { min: [minX, 0, 0], max: [maxX, 1, 1] }, resolution: [1, 1, 1], intensity
      } } });
      try {
        prd02BeforeFrame({ device, renderProbeFace: () => {} }, source, ctxFor(source).flags, owner);
        check(() => prd02ItemIrradianceBindings(applyProbeEnvironmentCubes([{ geometry: {} as never }], device, owner)[0], device, owner));
      } finally { disposePrd02Probes(device, owner); device.dispose(); }
    };
    bind(0, 1e-8, 1, (draw) => {
      const max = draw()!.uniforms.u_prd02IrradianceMax as Float32Array;
      expect(max[0]).toBe(Math.fround(1e-8));
      expect(max[0]).toBeGreaterThan(0);
    });
    bind(1e20, 1e20 + 1e6, 1, (draw) => expect(draw).toThrow(/bounds and cell widths.*GPU float32/));
    bind(-3e38, 3e38, 1, (draw) => expect(draw).toThrow(/bounds and cell widths.*GPU float32/));
    bind(0, 1e-45, 1, (draw) => expect(draw).toThrow(/bounds and cell widths.*GPU float32/));
    bind(0, 1e-38, 1, (draw) => expect(draw).toThrow(/bounds and cell widths.*GPU float32/));
    bind(3e38, 3.3e38, 1, (draw) => expect(draw).toThrow(/bounds and cell widths.*GPU float32/));
    bind(0, 1, 1e100, (draw) => expect(draw).toThrow(/grid and intensity.*GPU float32/));
  });

  it("passes a completed volume into a generated forward draw only on its owning device", () => {
    class CaptureDevice extends IrradianceReadbackDevice {
      readonly sources: ShaderSources[] = [];
      readonly packets: Map<string, UniformValue>[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
      override draw(command: DrawCommand): void {
        this.packets.push(new Map(command.uniforms));
        super.draw(command);
      }
    }
    const device = new CaptureDevice();
    const foreign = new CaptureDevice();
    const generatorFlags = { values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true },
      on: (name: string) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" };
    setRendererQrFlags(generatorFlags, device);
    setRendererQrFlags(generatorFlags, foreign);
    const geometry = Geometry.box();
    const material = new PBRMaterial();
    const owner = {};
    const source = probeSource({ "prd02.probes.room": { kind: "probe", probe: "irradiance-volume", name: "room", options: {
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] }, resolution: [1, 1, 1], intensity: 2
    } } });
    try {
      prd02BeforeFrame({ device, renderProbeFace: () => {} }, source, ctxFor(source).flags, owner);
      const item = applyProbeEnvironmentCubes([{ geometry, material }], device, owner)[0];
      const selection = prd02ItemIrradianceBindings(item, device, owner)!;
      const draw = (target: CaptureDevice) => {
        target.beginFrame(8, 8);
        new ForwardPass({ items: [item], shaderLibrary: createDefaultShaderLibrary() }).execute({ device: target, width: 8, height: 8 });
        target.endFrame();
      };
      draw(device);
      const generated = device.sources.find((entry) => entry.generatedProgram?.features.features[PRD02_IRRADIANCE_VOLUME_FEATURE] === true);
      expect(generated?.fragment).toContain("#define A3D_IRRADIANCE_VOLUME 1");
      expect(generated?.fragment).toContain("u_prd02IrradianceR");
      for (const [name, value] of Object.entries(selection.uniforms)) expect(device.packets.at(-1)?.get(name)).toBe(value);
      draw(foreign);
      expect(foreign.sources.some((entry) => entry.generatedProgram?.features.features[PRD02_IRRADIANCE_VOLUME_FEATURE] === true)).toBe(false);
      expect(foreign.packets.at(-1)?.has("u_prd02IrradianceR")).toBe(false);
    } finally {
      disposePrd02Probes(device, owner);
      geometry.dispose(); material.dispose(); device.dispose(); foreign.dispose();
    }
  });

  it("passes captured probes and the authored global cube into a scoped portable graph draw", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material",
      nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.4 }], outputs: { roughness: "rough" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const device = new IrradianceReadbackDevice();
    const foreignDevice = new MockRenderDevice();
    const owner = {}, otherOwner = {};
    const geometry = Geometry.litCube(1);
    const globalCube = new Texture({ width: 1, height: 1, dimension: "cube", renderAttachment: true });
    const globalBinding = new TextureBinding({ name: "authored-global", texture: globalCube, expectedDimension: "cube" });
    const source = {
      renderItems: [],
      "prd02.probes.room": { kind: "probe", probe: "reflection", name: "room", options: {
        position: [0.25, 0, 0], resolution: 64, box: { min: [-1, -1, -1], max: [1, 1, 1] }
      } },
      "prd02.probes.volume": { kind: "probe", probe: "irradiance-volume", name: "volume", options: {
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] }, resolution: [1, 1, 1], intensity: 2
      } }
    };
    // The standalone tsc invocation resolves engine imports to the installed
    // rendering declarations, while Vitest aliases both packages to source.
    const item: RenderItem = { geometry, material: material as unknown as RenderItem["material"], environmentCube: globalBinding, environmentCubeMip: 1 };
    const draw = (target: MockRenderDevice, selected: RenderItem) => {
      target.beginFrame(8, 8);
      new ForwardPass({ items: [selected] }).execute({ device: target, width: 8, height: 8 });
      target.endFrame();
      expect(target.drawCommands).toHaveLength(1);
      return target.drawCommands[0]!;
    };
    try {
      prd02BeforeFrame({ device, renderProbeFace: () => {} }, source, ctxFor(source).flags, owner);
      const selected = applyProbeEnvironmentCubes([item], device, owner)[0];
      const probe = prd02ItemProbeBindings(selected, device, owner)!;
      const volume = prd02ItemIrradianceBindings(selected, device, owner)!;
      expect(probe.originalEnvironmentCube).toBe(globalBinding);
      expect(selected.environmentCube?.texture).not.toBe(globalCube);
      const drawOnOwner = draw(device, selected);
      expect(drawOnOwner.shader?.reflection.uniforms.has("u_prd02ProbeOriginA")).toBe(true);
      expect(drawOnOwner.shader?.reflection.uniforms.has("u_prd02IrradianceR")).toBe(true);
      expect(drawOnOwner.uniforms?.get("u_prd02ProbeOriginA")).toEqual(new Float32Array([0.25, 0, 0, 1]));
      expect((drawOnOwner.uniforms?.get("u_prd02ProbeCubeA") as TextureBinding).texture).toBe((probe.uniforms.u_prd02ProbeCubeA as TextureBinding).texture);
      for (const [index, channel] of ["R", "G", "B"].entries()) {
        expect((drawOnOwner.uniforms?.get(`u_prd02Irradiance${channel}`) as TextureBinding).texture).toBe(volume.volume.textures[index]);
      }
      expect((drawOnOwner.uniforms?.get("u_graphGlobalEnvCube") as TextureBinding).texture).toBe(globalCube);

      const reused = applyProbeEnvironmentCubes([selected], device, otherOwner)[0];
      expect(prd02ItemProbeBindings(reused, device)).toBeNull();
      expect(prd02ItemIrradianceBindings(reused, device)).toBeNull();
      const drawOnOtherOwner = draw(device, reused);
      expect(drawOnOtherOwner.shader?.reflection.uniforms.has("u_prd02ProbeOriginA")).toBe(false);
      expect(drawOnOtherOwner.shader?.reflection.uniforms.has("u_prd02IrradianceR")).toBe(false);
      expect((drawOnOtherOwner.uniforms?.get("u_graphGlobalEnvCube") as TextureBinding).texture).toBe(globalCube);

      const drawOnForeignDevice = draw(foreignDevice, selected);
      expect(drawOnForeignDevice.shader?.reflection.uniforms.has("u_prd02ProbeOriginA")).toBe(false);
      expect(drawOnForeignDevice.shader?.reflection.uniforms.has("u_prd02IrradianceR")).toBe(false);
      expect((drawOnForeignDevice.uniforms?.get("u_graphGlobalEnvCube") as TextureBinding).texture).toBe(globalCube);
    } finally {
      disposePrd02Probes(device, owner);
      geometry.dispose(); material.dispose(); globalCube.dispose(); device.dispose(); foreignDevice.dispose();
    }
  });

  it("isolates capture resources and per-item selections for apps sharing a device", () => {
    const device = new MockRenderDevice();
    const ownerA = {}, ownerB = {};
    const source = (x: number) => probeSource({
      "prd02.probes.room": { kind: "probe", probe: "irradiance-volume", name: "room", options: {
        bounds: { min: [x, 0, 0], max: [x + 1, 1, 1] }, resolution: [1, 1, 1]
      } },
      "prd02.probes.mirror": { kind: "probe", probe: "reflection", name: "mirror", options: {
        position: [x, 0, 0], resolution: 64, box: { min: [x - 1, -1, -1], max: [x + 1, 1, 1] }
      } }
    });
    const a = source(0), b = source(10);
    const flags = ctxFor(a).flags;
    const renderer = { device, renderProbeFace: () => {} };
    prd02BeforeFrame(renderer, a, flags, ownerA);
    prd02BeforeFrame(renderer, b, flags, ownerB);
    const volA = prd02IrradianceVolumes(device, ownerA)[0]!;
    const volB = prd02IrradianceVolumes(device, ownerB)[0]!;
    expect(volA.spec.min).toEqual([0, 0, 0]);
    expect(volB.spec.min).toEqual([10, 0, 0]);
    const authored = new TextureBinding({ name: "authored-environment" });
    const item = { geometry: {} as never, environmentCube: authored, environmentCubeMip: 7,
      modelMatrix: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
    const selectedA = applyProbeEnvironmentCubes([item], device, ownerA)[0];
    const selection = prd02ItemProbeBindings(selectedA, device, ownerA);
    expect(selection?.uniforms.u_prd02ProbeCubeA).toMatchObject({ expectedDimension: "cube" });
    expect(selection?.originalEnvironmentCube).toBe(authored);
    expect(selection?.originalEnvironmentCubeMip).toBe(7);
    expect(prd02ItemProbeBindings(selectedA, device, ownerB)).toBeNull();
    expect(prd02ItemProbeBindings(applyProbeEnvironmentCubes([item], device, ownerB)[0], device, ownerB)).toBeNull();
    const reusedB = applyProbeEnvironmentCubes([selectedA], device, ownerB)[0];
    expect(prd02ItemProbeBindings(reusedB, device)).toBeNull();
    expect(prd02ItemIrradianceBindings(reusedB, device, ownerB)?.volume).toBe(volB);
    expect(reusedB.environmentCube).toBe(authored);
    expect(reusedB.environmentCubeMip).toBe(7);
    const withoutProbes = applyProbeEnvironmentCubes([selectedA], device, {})[0];
    expect(prd02ItemProbeBindings(withoutProbes, device)).toBeNull();
    expect(prd02ItemIrradianceBindings(withoutProbes, device)).toBeNull();
    expect(withoutProbes.environmentCube).toBe(authored);
    disposePrd02Probes(device, ownerA);
    expect(volA.textures.every((texture) => texture.disposed)).toBe(true);
    expect(volB.textures.every((texture) => !texture.disposed)).toBe(true);
    expect(prd02IrradianceVolumes(device, ownerB)[0]).toBe(volB);
    disposePrd02Probes(device, ownerB);
    device.dispose();
  });

  it("serializes async capture and frame work on one device and rejects overlapping synchronous work", async () => {
    const device = new MockRenderDevice();
    const events: string[] = [];
    let resume!: () => void;
    const first = withPrd02ProbeFrameLock(device, async () => {
      events.push("first-start");
      await new Promise<void>((resolve) => { resume = resolve; });
      events.push("first-render");
    });
    const second = withPrd02ProbeFrameLock(device, async () => { events.push("second-start"); });
    await Promise.resolve();
    expect(events).toEqual(["first-start"]);
    const source = {};
    expect(() => prd02BeforeFrame({ device, renderProbeFace: () => {} }, source, ctxFor(source).flags)).toThrow(/PROBE_ASYNC_FRAME_IN_PROGRESS/);
    resume();
    await Promise.all([first, second]);
    expect(events).toEqual(["first-start", "first-render", "second-start"]);
    expect(() => prd02BeforeFrame({ device, renderProbeFace: () => {} }, source, ctxFor(source).flags)).not.toThrow();
    device.dispose();
  });

  it("pass publishes probe selection + env/roughness keys on the blackboard", () => {
    const ctx = ctxFor({ "prd02.probes.lounge": node });
    ctx.blackboard.set(PROBE_RENDER_FACE_KEY, flatRenderer);
    const contrib = createPrd02ProbesContributor();
    const [pass] = contrib.passes!("shadows", ctx);
    expect(pass).toBeDefined();
    pass!.execute({ device: ctx.device, width: 64, height: 64 });
    expect(ctx.blackboard.has(PROBE_SELECTION_BLACKBOARD_KEY)).toBe(true);
    const envSpec = ctx.blackboard.get(ENV_SPECULAR_BLACKBOARD_KEY) as { width: number } | null;
    expect(envSpec?.width).toBe(128); // dominant probe's PMREM cube
    expect(typeof ctx.blackboard.get(ROUGHNESS_TO_LOD_BLACKBOARD_KEY)).toBe("function");
    expect(ctx.blackboard.has(IRRADIANCE_VOLUME_BLACKBOARD_KEY)).toBe(false);
  });

  it("captures authored bounds and applies named and all-volume requests only to the owning app", async () => {
    const device = new MockRenderDevice();
    const owner = {};
    const otherOwner = {};
    const runtime = new Prd02LightingRuntime(undefined, owner);
    let faces = 0;
    const renderer = { device, renderProbeFace: () => { faces += 1; } };
    const source = probeSource({
      "prd02.probes.first": { kind: "probe", probe: "irradiance-volume", name: "first", options: {
        bounds: { min: [10, 20, 30], max: [14, 24, 34] }, resolution: [1, 1, 1], update: "on-demand"
      } },
      "prd02.probes.second": { kind: "probe", probe: "irradiance-volume", name: "second", options: {
        bounds: { min: [-5, -4, -3], max: [-1, 0, 1] }, resolution: [1, 1, 1], update: "on-demand"
      } }
    });
    const ctx = { ...ctxFor(source), device };
    prd02BeforeFrame(renderer, source, ctx.flags, owner);
    expect(faces).toBe(12);
    const volumes = prd02IrradianceVolumes(device);
    expect(volumes.map((volume) => [volume.spec.name, volume.spec.min, volume.spec.max])).toEqual([
      ["first", [10, 20, 30], [14, 24, 34]],
      ["second", [-5, -4, -3], [-1, 0, 1]]
    ]);
    const [pass] = createPrd02ProbesContributor().passes!("shadows", ctx);
    pass!.execute({ device, width: 64, height: 64 });
    expect(ctx.blackboard.get(IRRADIANCE_VOLUME_BLACKBOARD_KEY)).toBe(volumes[0]);
    expect(ctx.blackboard.get(IRRADIANCE_VOLUMES_BLACKBOARD_KEY)).toEqual(volumes);
    prd02BeforeFrame(renderer, source, ctx.flags, otherOwner);
    expect(faces).toBe(24);
    await runtime.rebakeIrradiance("first");
    prd02BeforeFrame(renderer, source, ctx.flags, otherOwner);
    expect(faces).toBe(24);
    prd02BeforeFrame(renderer, source, ctx.flags, owner);
    expect(faces).toBe(30);
    await runtime.rebakeIrradiance();
    prd02BeforeFrame(renderer, source, ctx.flags, owner);
    expect(faces).toBe(42);
    await runtime.updateProbe("second");
    prd02BeforeFrame(renderer, source, ctx.flags, owner);
    expect(faces).toBe(48);
    const retained = prd02IrradianceVolumes(device);
    const remainingSource = probeSource({ "prd02.probes.second": source["prd02.probes.second"] });
    prd02BeforeFrame(renderer, remainingSource, ctx.flags, owner);
    expect(retained[0]!.textures.every((texture) => texture.disposed)).toBe(true);
    expect(prd02IrradianceVolumes(device).map((volume) => volume.spec.name)).toEqual(["second"]);
    disposePrd02Probes(device);
    expect(retained[1]!.textures.every((texture) => texture.disposed)).toBe(true);
    device.dispose();
  });

  it("retains queued recaptures after a failure and preserves requests made during capture", async () => {
    const device = new MockRenderDevice();
    const owner = {};
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const source = probeSource({ "prd02.probes.room": { kind: "probe", probe: "irradiance-volume", name: "room", options: {
      bounds: { min: [0, 0, 0], max: [1, 1, 1] }, resolution: [1, 1, 1]
    } } });
    const flags = ctxFor(source).flags;
    let faces = 0;
    let fail = false;
    let enqueueDuringCapture = false;
    const renderer = { device, renderProbeFace: () => {
      faces += 1;
      if (fail) { fail = false; throw new Error("capture failed"); }
      if (enqueueDuringCapture) { enqueueDuringCapture = false; void runtime.rebakeIrradiance("room"); }
    } };
    prd02BeforeFrame(renderer, source, flags, owner);
    await runtime.rebakeIrradiance("room");
    fail = true;
    expect(() => prd02BeforeFrame(renderer, source, flags, owner)).toThrow("capture failed");
    enqueueDuringCapture = true;
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(faces).toBe(13);
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(faces).toBe(19);
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(faces).toBe(19);
    disposePrd02Probes(device);
    device.dispose();
  });

  it("uses asynchronous float readback for WebGPU-shaped capture and refuses synchronous capture", async () => {
    class AsyncMockDevice extends MockRenderDevice {
      reads = 0;
      override readFloatPixels(): Float32Array { throw new Error("synchronous readback called"); }
      async readFloatPixelsAsync(_x: number, _y: number, width: number, height: number): Promise<Float32Array> {
        this.reads += 1;
        return new Float32Array(width * height * 4).fill(0.5);
      }
    }
    const device = new AsyncMockDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const source = probeSource({ "prd02.probes.room": { kind: "probe", probe: "irradiance-volume", name: "room", options: {
      bounds: { min: [2, 3, 4], max: [3, 4, 5] }, resolution: [1, 1, 1]
    } } });
    const flags = ctxFor(source).flags;
    const renderer = { device, renderProbeFace: () => {} };
    expect(() => prd02BeforeFrame(renderer, source, flags)).toThrow(/WEBGPU_PROBE_CAPTURE_ASYNC_REQUIRED/);
    expect(device.reads).toBe(0);
    await prd02BeforeFrameAsync(renderer, source, flags);
    expect(device.reads).toBe(6);
    expect(prd02IrradianceVolumes(device)[0]!.spec.min).toEqual([2, 3, 4]);
    await prd02BeforeFrameAsync(renderer, source, flags);
    expect(device.reads).toBe(6);
    disposePrd02Probes(device);
    device.dispose();
  });

  it("captures asynchronous reflection probes and retires a pending capture on disposal", async () => {
    class AsyncMockDevice extends MockRenderDevice {
      reads = 0;
      override readFloatPixels(): Float32Array { throw new Error("synchronous readback called"); }
      async readFloatPixelsAsync(_x: number, _y: number, width: number, height: number): Promise<Float32Array> {
        this.reads += 1;
        return new Float32Array(width * height * 4).fill(0.5);
      }
    }
    const device = new AsyncMockDevice();
    const system = new ReflectionProbeSystem(device, flatRenderer);
    system.register(spec({ name: "async" }));
    expect(await system.updateAsync()).toEqual(["async"]);
    expect(device.reads).toBe(6);
    expect(system.probes()[0]!.sh9[0]).toBeGreaterThan(0);
    const probeTexture = system.probes()[0]!.specularCube;
    system.dispose();
    expect(probeTexture.disposed).toBe(true);
    device.dispose();

    let resolveRead!: (pixels: Float32Array) => void;
    class PendingDevice extends MockRenderDevice {
      async readFloatPixelsAsync(_x: number, _y: number, width: number, height: number): Promise<Float32Array> {
        return new Promise((resolve) => { resolveRead = () => resolve(new Float32Array(width * height * 4)); });
      }
    }
    const pendingDevice = new PendingDevice();
    const pendingSystem = new ReflectionProbeSystem(pendingDevice, flatRenderer);
    pendingSystem.register(spec({ name: "pending" }));
    const pending = pendingSystem.updateAsync();
    const target = pendingDevice.getRenderTarget()!;
    pendingSystem.dispose();
    resolveRead(new Float32Array());
    expect(await pending).toEqual([]);
    expect(target.disposed).toBe(true);
    expect(pendingDevice.getRenderTarget()).toBeNull();
    pendingDevice.dispose();
  });

  it("carries a built probe through the scene compiler into pre-frame capture", async () => {
    await import("@aura3d/engine");
    const { compileScene, updateCompiledScene } = await import("../../../../packages/engine/src/contracts/compiler");
    const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
    const { probes } = await import("../../../../packages/engine/src/agent-api/nodes/probes");
    const device = new MockRenderDevice();
    const owner = { get: () => undefined };
    const flags = resolveQrFlags({ options: ["compiler", "lighting"] });
    const probe = probes.irradianceVolume({ name: "compiled-room", bounds: { min: [4, 5, 6], max: [6, 7, 8] }, resolution: [2, 2, 2] }).toJSON();
    const snapshot = { schema: "aura3d-scene-snapshot/1.0", background: "#000000", diagnostics: { enabled: false },
      camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
      nodes: [{ kind: "primitive", primitive: "box", name: "box", size: 1 }, probe] };
    let faces = 0;
    const renderer = { device, renderProbeFace: () => { faces += 1; } };
    const ctx = { renderer, assets: undefined, quality: { tier: "high" }, strict: false, flags, degrade: () => {},
      canvas: { width: 100, height: 100 }, environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }),
      collectedLights: [], runtimeWarnings: new Set<string>(), runtimeNodes: owner };
    const compiled = await compileScene(snapshot as never, ctx as never);
    const source = updateCompiledScene(compiled, snapshot as never, owner as never, 0, flags) as Record<string, unknown>;
    expect(source["prd02.probes.compiled-room"]).toBeDefined();
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(faces).toBe(24);
    expect(prd02IrradianceVolumes(device)).toHaveLength(0);
    prd02BeforeFrame(renderer, source, flags, owner);
    expect(faces).toBe(48);
    expect(prd02IrradianceVolumes(device)[0]!.spec.min).toEqual([4, 5, 6]);
    compiled.dispose();
    disposePrd02Probes(device);
    device.dispose();
  });

  it("validates builder bounds, dimensions, interval and per-frame budget", async () => {
    const { probes } = await import("../../../../packages/engine/src/agent-api/nodes/probes");
    const bounds = { min: [0, 0, 0], max: [1, 1, 1] } as const;
    const node = probes.irradianceVolume({ name: "large", bounds, resolution: [16, 16, 16], maxUpdatesPerFrame: 2 }).toJSON();
    expect((node as unknown as { options: { maxUpdatesPerFrame: number } }).options.maxUpdatesPerFrame).toBe(2);
    expect(() => probes.irradianceVolume({ name: "small", bounds, resolution: [1, 2, 2] })).toThrow(/resolution/);
    expect(() => probes.irradianceVolume({ name: "large", bounds, resolution: [16, 16, 16], maxUpdatesPerFrame: 65 })).toThrow(/maxUpdatesPerFrame/);
    expect(() => probes.reflection({ name: "bad", position: [0, 0, 0], update: { everyNFrames: 0 } })).toThrow(/interval/);
    expect(() => probes.reflection({ name: "bad", position: [0, 0, 0], box: { min: [0, 0, 0], max: [0, 1, 1] } })).toThrow(/extents/);
  });

  it("submits the same completed source only after capture in both production render paths", async () => {
    const { renderProductionSourceWithProbes, renderProductionSourceWithProbesAsync } = await import("../../../../packages/engine/src/agent-api/compiler/renderer");
    const device = new MockRenderDevice();
    const owner = {};
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const source = probeSource({ "prd02.probes.room": { kind: "probe", probe: "irradiance-volume", name: "room", options: {
      bounds: { min: [0, 0, 0], max: [1, 1, 1] }, resolution: [1, 1, 1]
    } } });
    const flags = ctxFor(source).flags;
    const events: string[] = [];
    const renderer = {
      device,
      renderProbeFace: (capturedSource: unknown) => { expect(capturedSource).toBe(source); events.push("capture"); },
      render: (renderedSource: unknown) => { expect(renderedSource).toBe(source); events.push("render"); return device.getDiagnostics(); },
      renderAsync: async (renderedSource: unknown) => { expect(renderedSource).toBe(source); events.push("render-async"); return device.getDiagnostics(); }
    };
    renderProductionSourceWithProbes(renderer as never, source, undefined, flags, owner);
    expect(events).toEqual([...Array(6).fill("capture"), "render"]);
    events.length = 0;
    await runtime.rebakeIrradiance();
    await renderProductionSourceWithProbesAsync(renderer as never, source, undefined, flags, owner, () => false);
    expect(events).toEqual([...Array(6).fill("capture"), "render-async"]);
    events.length = 0;
    await expect(renderProductionSourceWithProbesAsync(renderer as never, source, undefined, flags, owner, () => true)).rejects.toThrow(/disposed/);
    expect(events).toEqual([]);
    disposePrd02Probes(device);
    device.dispose();
  });
});

describe("prd02 LTC rect lights (PRD-02 §8.5)", () => {
  it("LUT fetch is lazy, cached, and validates byte size", async () => {
    const device = new MockRenderDevice();
    let calls = 0;
    const lut = new Float32Array(LTC_LUT_SIZE * LTC_LUT_SIZE * 4).fill(0.25);
    const luts = await fetchLtcLutTextures(device, {
      fetch: async () => { calls += 1; return lut; }
    });
    expect(calls).toBe(2);
    expect(luts.mInv.width).toBe(LTC_LUT_SIZE);
    // cached — no second fetch
    await fetchLtcLutTextures(device, { fetch: async () => { calls += 9; return lut; } });
    expect(calls).toBe(2);
    expect(LTC_LUT_BYTES).toBe(64 * 64 * 16);
    device.dispose();
  });

  it("rejects a LUT with a byte-size mismatch", async () => {
    const device = new MockRenderDevice();
    await expect(fetchLtcLutTextures(device, {
      fetch: async () => new Float32Array(8)
    })).rejects.toThrow(/size mismatch/);
    device.dispose();
  });

  it("Gauss–Legendre 4-tap stays within 10% total energy of dense integration", () => {
    // Facing rect above a reference plane point (PRD §8.5 acceptance).
    const center: [number, number, number] = [0, 1.5, 0];
    const right: [number, number, number] = [1, 0, 0];
    const up: [number, number, number] = [0, 0, 1];
    const half: [number, number] = [1, 0.75];
    const rgb: [number, number, number] = [10, 10, 10];
    const pos: [number, number, number] = [0, 0, 0];
    const n: [number, number, number] = [0, 1, 0];
    const gl = gaussLegendreRectDiffuse(center, right, up, half, rgb, pos, n);
    const ref = rectDiffuseReference(center, right, up, half, rgb, pos, n, 48);
    const glE = gl[0] + gl[1] + gl[2];
    const refE = ref[0] + ref[1] + ref[2];
    expect(refE).toBeGreaterThan(0);
    expect(Math.abs(glE - refE) / refE).toBeLessThanOrEqual(0.10);
  });
});
