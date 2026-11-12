import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import "../../../packages/rendering/src/lanes/prd06";
import "../../../packages/rendering/src/lanes/prd07";
import "../../../packages/rendering/src/lanes/prd10";
import "../../../packages/engine/src/agent-api/compiler/lines";
import { PerspectiveCamera, identityMat4 } from "@aura3d/scene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import {
  detectWebGPUCompressedTextureCapabilities,
  setActiveWebGPUCompressedFeatureSource,
  typedGLBActorDecoderOptions,
  WEBGPU_COMPRESSED_CAPS
} from "../../../packages/engine/src/agent-api/AssetDecoders";
import { VolumetricFogPass, type FroxelGridSpec } from "../../../packages/rendering/src/atmosphere/VolumetricFogPass";
import type { FrameCamera, FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { PostResources } from "../../../packages/rendering/src/post/PostResources";
import { runV2HdrStages } from "../../../packages/rendering/src/post/v2Stages";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { MockRenderDevice, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { rendererProgramCache } from "../../../packages/rendering/src/renderer/qrSubFlags";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { BeamPass } from "../../../packages/rendering/src/vfx/BeamPass";
import { DecalBatch } from "../../../packages/rendering/src/vfx/DecalBatch";
import { DecalPass } from "../../../packages/rendering/src/vfx/DecalPass";
import { MeshParticleBatch } from "../../../packages/rendering/src/vfx/MeshParticleBatch";
import { MeshParticlePass } from "../../../packages/rendering/src/vfx/MeshParticlePass";
import { RibbonBatch } from "../../../packages/rendering/src/vfx/RibbonBatch";
import { RibbonPass } from "../../../packages/rendering/src/vfx/RibbonPass";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import {
  createGeneratedUnlitProgram,
  GENERATED_UNLIT_MATERIAL_OFFSETS,
  packGeneratedUnlitMaterialUniforms
} from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { registerPrd10WindFeatures } from "../../../packages/rendering/src/world/vegetation/WindField";
import { fakeWebGLCanvas } from "./static-unlit-fake-webgl";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const ALL_ON_FLAGS: QrFlags = { values: {}, on: () => true };

type RecordedModule = { readonly label: string; readonly code: string };
type RecordedEntry = { readonly binding: number; readonly resource: unknown };
type RecordedPass = {
  pipeline?: { readonly descriptor: { readonly vertex: { readonly module: RecordedModule }; readonly fragment: { readonly module: RecordedModule } } };
  group?: { readonly entries: readonly RecordedEntry[] };
  vertices?: number;
};

async function createNativeWebGpuFixture(featureNames: readonly string[] = []) {
  const modules: RecordedModule[] = [];
  const submissions: RecordedPass[] = [];
  const native = {
    features: new Set<string>(featureNames),
    limits: {
      maxColorAttachments: 4,
      maxColorAttachmentBytesPerSample: 32,
      maxTextureDimension2D: 2048,
      maxBufferSize: 16_000_000,
      maxVertexBuffers: 8
    },
    queue: {
      writeBuffer() {},
      writeTexture() {},
      submit(commands: readonly { readonly passes: readonly RecordedPass[] }[]) {
        submissions.push(...commands.flatMap((c) => c.passes));
      },
      onSubmittedWorkDone: async () => {}
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture: (descriptor: { readonly label?: string }) => {
      const texture = { label: descriptor.label, createView: (view?: unknown) => ({ texture, view }), destroy() {} };
      return texture;
    },
    createSampler: (descriptor: unknown) => ({ sampler: descriptor }),
    createShaderModule(descriptor: RecordedModule) {
      modules.push(descriptor);
      return descriptor;
    },
    createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: NonNullable<RecordedPass["pipeline"]>["descriptor"]) {
      return { descriptor, getBindGroupLayout: () => ({}) };
    },
    createBindGroup(descriptor: { readonly entries: readonly RecordedEntry[] }) {
      return { entries: descriptor.entries };
    },
    createCommandEncoder() {
      const passes: RecordedPass[] = [];
      return {
        beginRenderPass() {
          const pass: RecordedPass = {};
          passes.push(pass);
          return {
            setPipeline(pipeline: RecordedPass["pipeline"]) { pass.pipeline = pipeline; },
            setBindGroup(index: number, group: RecordedPass["group"]) { if (index === 0) pass.group = group; },
            setVertexBuffer() {},
            setIndexBuffer() {},
            setViewport() {},
            setScissorRect() {},
            setBlendConstant() {},
            setStencilReference() {},
            draw(count: number) { pass.vertices = count; },
            drawIndexed(count: number) { pass.vertices = count; },
            end() {}
          };
        },
        finish: () => ({ passes })
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  return { device, modules, submissions };
}

afterEach(() => {
  setActiveWebGPUCompressedFeatureSource(null);
});

describe("WP-07 D1: Renderer sync warmup, PostResources resize/trim & renderScale", () => {
  it("warms >8 distinct scene variants including off-frustum items on frame 0 so rapid camera turns never compile or skip", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true } });
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: flags });
    const tex = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    try {
      const cam = new PerspectiveCamera({ fovYRadians: 1, aspect: 16 / 9, near: 0.1, far: 100 });
      cam.transform.setPosition(0, 0, 10);
      cam.updateCameraMatrices();

      // Create 12 distinct generated program keys: 6 in front of camera (z = 0) and 6 behind camera (z = 40, outside frustum).
      const items = Array.from({ length: 12 }, (_, i) => {
        const z = i < 6 ? 0 : 40;
        const mat = new TexturedPBRMaterial({
          name: `mat-${i}`,
          baseColorTexture: (i & 1) ? tex : undefined,
          metallicRoughnessTexture: (i & 2) ? tex : undefined,
          normalTexture: (i & 4) ? tex : undefined,
          emissiveTexture: (i & 8) ? tex : undefined,
          renderState: {
            cullMode: "back",
            blend: false,
            depthWrite: true
          }
        });
        const m = Float32Array.from(identityMat4());
        m[14] = z;
        return {
          geometry: Geometry.texturedCube(1),
          material: mat,
          modelMatrix: m,
          worldBounds: {
            min: [-1, -1, z - 1] as const,
            max: [1, 1, z + 1] as const
          },
          label: `mesh-${i}`
        };
      });

      const sceneSource = { renderItems: items, collectedLights: [] };
      renderer.render(sceneSource as never, cam);
      const cache = rendererProgramCache(renderer.device, flags);
      expect(cache.stats().compiled).toBeGreaterThanOrEqual(9); // exceeds maxSyncCompilesPerFrame = 8

      // Rapid 180-degree camera turn onto the previously culled z = 40 meshes:
      cam.transform.setRotation(0, 1, 0, 0);
      cam.updateCameraMatrices();
      renderer.render(sceneSource as never, cam);
      expect(cache.stats().compiledSinceReady).toBe(0);
    } finally {
      tex.dispose();
      renderer.dispose();
    }
  });

  it("trims orphaned PostResources pooled targets on Renderer.resize and Renderer.dispose", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_POST: true } });
    const renderer = await Renderer.create({ backend: "mock", width: 1280, height: 720, qrFlags: flags });
    const pool = new PostResources(renderer.device, flags);
    const oldFull = pool.acquire({ width: 1280, height: 720, format: "rgba16f", samples: 1, depth: false });
    const oldHalf = pool.acquire({ width: 640, height: 360, format: "rgba16f", samples: 1, depth: false });
    pool.releaseAll();
    expect(oldFull.disposed).toBe(false);

    // Simulate mobile URL-bar viewport resize to 1280x700:
    renderer.resize(1280, 700);
    expect(oldFull.disposed).toBe(true);
    expect(oldHalf.disposed).toBe(true);

    const active = pool.acquire({ width: 1280, height: 700, format: "rgba16f", samples: 1, depth: false });
    pool.releaseAll();
    expect(active.disposed).toBe(false);

    renderer.dispose();
    expect(active.disposed).toBe(true);
  });

  it("honors dynamic renderScale < 1 on post-processed forward targets while leaving renderScale === 1 unchanged", () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_POST: true } });
    const { canvas, gl } = fakeWebGLCanvas();
    // Reflect only declared `in` attributes per shader so fullscreen post passes do not demand mesh attributes:
    (gl as unknown as Record<string, unknown>).linkProgram = (prog: { shaders: Array<{ source: string }>; attributes: unknown[]; uniforms: unknown[] }) => {
      const vs = prog.shaders[0]?.source ?? "";
      const attrs: Array<{ name: string; type: number; size: number }> = [];
      for (const match of vs.matchAll(/\bin\s+(?:vec[234]|float)\s+([A-Za-z0-9_]+)\s*;/g)) {
        attrs.push({ name: match[1]!, type: gl.FLOAT_VEC3, size: 1 });
      }
      prog.attributes = attrs;
      prog.uniforms = [];
    };
    const device = WebGL2Device.create({ canvas });
    const createdSizes: Array<{ width: number; height: number; format: string }> = [];
    const origCreateRt = device.createRenderTarget.bind(device);
    device.createRenderTarget = (desc) => {
      createdSizes.push({ width: desc.width, height: desc.height, format: desc.format ?? "rgba8" });
      return origCreateRt(desc);
    };
    const renderer = new Renderer(
      device,
      { shaderLibrary: createLeanCoreShaderLibrary(), width: 640, height: 360, qrFlags: flags },
      new TemporalHistory()
    );
    try {
      const cam = new PerspectiveCamera({ fovYRadians: 1, aspect: 16 / 9, near: 0.1, far: 50 });
      cam.transform.setPosition(0, 0, 5);
      cam.updateCameraMatrices();
      const sceneSource = {
        renderItems: [{ geometry: Geometry.litCube(1), material: new PBRMaterial({ name: "box" }), modelMatrix: Float32Array.from(identityMat4()) }],
        collectedLights: []
      };

      createdSizes.length = 0;
      renderer.setRenderScaleCeiling(0.5);
      (renderer.render as (...args: unknown[]) => void)(sceneSource, cam, {
        postprocess: { v2: true, pipeline: { bloom: { intensity: 0.4 } } }
      });
      expect(createdSizes.some((rt) => rt.width === 320 && rt.height === 180)).toBe(true);
      expect(createdSizes.some((rt) => rt.width === 640 && rt.height === 360 && rt.format === "rgba16f")).toBe(false);

      createdSizes.length = 0;
      renderer.setRenderScaleCeiling(1);
      (renderer.render as (...args: unknown[]) => void)(sceneSource, cam, {
        postprocess: { v2: true, pipeline: { bloom: { intensity: 0.4 } } }
      });
      expect(createdSizes.some((rt) => rt.width === 640 && rt.height === 360)).toBe(true);
    } finally {
      renderer.dispose();
    }
  });
});

describe("WP-07 D2: WebGL2Device TBDR gl.invalidateFramebuffer & zero getParameter stalls", () => {
  it("resolves MSAA targets with zero getParameter/isEnabled readbacks and invalidates tile memory only on final resolve", () => {
    const { canvas, gl } = fakeWebGLCanvas();
    const invalidated: Array<{ target: number; attachments: number[] }> = [];
    (gl as unknown as Record<string, unknown>).invalidateFramebuffer = (target: number, attachments: readonly number[]) => {
      invalidated.push({ target, attachments: [...attachments] });
    };
    const device = WebGL2Device.create({ canvas });
    try {
      const msaa = device.createRenderTarget({ width: 64, height: 64, format: "rgba8", depth: true, sampleCount: 4 });
      device.beginFrame(64, 64);
      device.setRenderTarget(msaa);
      device.clear([0.1, 0.2, 0.3, 1]);

      const getParamSpy = vi.spyOn(gl, "getParameter");
      const isEnabledSpy = vi.spyOn(gl, "isEnabled");

      // Mid-frame setRenderTarget(null) resolves colorTexture for sampling without discarding MSAA depth/color:
      device.setRenderTarget(null);
      expect(getParamSpy).not.toHaveBeenCalled();
      expect(isEnabledSpy).not.toHaveBeenCalled();
      expect(invalidated).toHaveLength(0);

      // Final end-of-scene present resolves AND invalidates READ_FRAMEBUFFER color + depth-stencil on TBDR GPUs:
      device.setRenderTarget(msaa);
      device.clear([0.2, 0.3, 0.4, 1]);
      device.presentRenderTarget(msaa);
      device.endFrame();
      expect(getParamSpy).not.toHaveBeenCalled();
      expect(isEnabledSpy).not.toHaveBeenCalled();
      expect(invalidated).toHaveLength(1);
      expect(invalidated[0]!.target).toBe(gl.READ_FRAMEBUFFER);
      expect(invalidated[0]!.attachments).toContain(gl.COLOR_ATTACHMENT0);
      expect(invalidated[0]!.attachments).toContain(gl.DEPTH_STENCIL_ATTACHMENT);
    } finally {
      device.dispose();
    }
  });
});

describe("WP-07 D3: WebGPU compressed texture capabilities & Texture CPU RAM release", () => {
  it("detects ASTC/ETC2/BC7 from active WebGPU device features and restores headless all-false on Renderer.dispose", async () => {
    expect(WEBGPU_COMPRESSED_CAPS).toEqual({ astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false });

    const { device } = await createNativeWebGpuFixture([
      "texture-compression-astc",
      "texture-compression-etc2",
      "texture-compression-bc"
    ]);
    const renderer = new Renderer(
      device,
      { shaderLibrary: createLeanCoreShaderLibrary(), width: 64, height: 64 },
      new TemporalHistory()
    );
    try {
      expect(detectWebGPUCompressedTextureCapabilities(device as never)).toEqual({
        astc: true,
        bptc: true,
        etc2: true,
        s3tc: false,
        s3tcSrgb: false
      });
      expect(WEBGPU_COMPRESSED_CAPS).toEqual({
        astc: true,
        bptc: true,
        etc2: true,
        s3tc: false,
        s3tcSrgb: false
      });
      const actorOpts = typedGLBActorDecoderOptions(ALL_ON_FLAGS, undefined);
      expect(actorOpts.compressedTextureCapabilities).toEqual({
        astc: true,
        bptc: true,
        etc2: true,
        s3tc: false,
        s3tcSrgb: false
      });
    } finally {
      renderer.dispose();
    }
    expect(WEBGPU_COMPRESSED_CAPS).toEqual({ astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false });
  });

  it("supports zero-copy CPU mip ownership (copyCpuData: false) and post-upload releaseCpuData() without disposing texture", () => {
    const mip0 = new Uint8Array(16).fill(200);
    const fallback = new Uint8Array(64).fill(120);
    const tex = new Texture({
      width: 4,
      height: 4,
      format: "bc7-rgba-unorm",
      data: mip0,
      mipmaps: [{ width: 4, height: 4, data: mip0 }],
      fallbackFormat: "rgba8",
      fallbackData: fallback,
      copyCpuData: false
    } as ConstructorParameters<typeof Texture>[0]);
    expect(tex.data).toBe(mip0); // zero-copy buffer reference
    expect(tex.fallbackData).toBe(fallback);

    tex.releaseCpuData({ keepFallback: true });
    expect(tex.disposed).toBe(false);
    expect(tex.width).toBe(4);
    expect(tex.data).toBeNull();
    expect((tex as { mipmaps?: unknown }).mipmaps).toBeUndefined();
    expect(tex.fallbackData).toBe(fallback);

    tex.releaseFallbackCpuData();
    expect(tex.fallbackData).toBeNull();
    expect(tex.disposed).toBe(false);
    tex.dispose();
    expect(tex.disposed).toBe(true);
  });
});

describe("WP-07 D4: LegacyPost lazy bloom ping-pong & v2Stages compact float formats", () => {
  it("skips allocating full-res rgba16f bloom ping-pong targets when fused mip-pyramid bloom runs", () => {
    const { canvas, gl } = fakeWebGLCanvas();
    const device = WebGL2Device.create({ canvas });
    device.bloomFusedPasses = true;
    const host = webgl2DeviceHost(device)!;
    const allocatedTextures: Array<{ width: number; height: number }> = [];
    const origTexImage2D = gl.texImage2D.bind(gl);
    (gl as unknown as Record<string, unknown>).texImage2D = (...args: unknown[]) => {
      if (typeof args[3] === "number" && typeof args[4] === "number") {
        allocatedTextures.push({ width: args[3], height: args[4] });
      }
      return (origTexImage2D as (...a: unknown[]) => unknown)(...args);
    };
    try {
      const hdrSource = device.createRenderTarget({ width: 128, height: 128, format: "rgba16f", depth: true });
      const hdrDest = device.createRenderTarget({ width: 128, height: 128, format: "rgba16f", depth: false });
      allocatedTextures.length = 0;
      device.beginFrame(128, 128);
      host.post.presentHdrBloom(
        hdrSource,
        { quality: "cinematic", intensity: 0.5, threshold: 0.8 },
        hdrDest
      );
      device.endFrame();
      // Fused mip-pyramid allocates 64x64..4x4 pyramid levels only, ZERO 128x128 full-res ping-pong targets:
      expect(allocatedTextures.filter((t) => t.width === 128 && t.height === 128)).toEqual([]);
      expect(allocatedTextures.some((t) => t.width === 64 && t.height === 64)).toBe(true);
      hdrSource.dispose();
      hdrDest.dispose();
    } finally {
      device.dispose();
    }
  });

  it("allocates rgba16f instead of rgba32f for v2Stages auto-exposure and GTAO depth scratch when far <= 65000", () => {
    const { canvas } = fakeWebGLCanvas();
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_POST: true } });
    const device = WebGL2Device.create({ canvas });
    setRendererQrFlags(flags, device);
    const host = webgl2DeviceHost(device)!;
    const created: Array<{ width: number; height: number; format?: string }> = [];
    const origCreateRt = device.createRenderTarget.bind(device);
    device.createRenderTarget = (desc) => {
      created.push({ width: desc.width, height: desc.height, format: desc.format });
      return origCreateRt(desc);
    };
    try {
      const hdrSource = origCreateRt({ width: 128, height: 128, format: "rgba16f", depth: "texture" });
      const frameCamera: FrameCamera = {
        viewMatrix: IDENTITY,
        projectionMatrix: IDENTITY,
        viewProjectionMatrix: IDENTITY,
        previousViewProjectionMatrix: null,
        near: 0.1,
        far: 500,
        projection: "perspective",
        position: [0, 0, 5]
      };
      created.length = 0;
      device.beginFrame(128, 128);
      const out = runV2HdrStages(
        host,
        hdrSource,
        {
          autoExposure: { key: 0.18, minEv: -4, maxEv: 4, adaptUp: 3, adaptDown: 1 },
          ao: { radius: 0.5, strength: 1 }
        } as never,
        frameCamera
      );
      out.exposureCompletion?.commit();
      out.outputLease?.release();
      device.endFrame();
      expect(created.filter((rt) => rt.format === "rgba32f")).toEqual([]);
      expect(created.some((rt) => rt.width === 1 && rt.height === 1 && rt.format === "rgba16f")).toBe(true);
      expect(created.some((rt) => rt.width === 128 && rt.height === 128 && rt.format === "rgba16f")).toBe(true);
      hdrSource.dispose();
    } finally {
      device.dispose();
    }
  });
});

describe("WP-07 D5: WebGPU W5(ii)-(iv) shader parity & VFX multi-draw buffer slots", () => {
  it("composes prd06.deform (skinning + morph) with prd10.wind sequentially and enforces 0.002 alpha floor + 65504 clamp", () => {
    const unregisterWind = registerPrd10WindFeatures();
    try {
      const generated = generateProgramImpl(
        normalizeProgramFeatures({
          lighting: "lit",
          lights: { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 },
          maps: {},
          extensions: [
            { lobe: "clearcoat", bits: {}, maps: [] },
            { lobe: "sheen", bits: {}, maps: [] }
          ],
          environment: "none",
          skinning: { influences: 4, palette: "texture" },
          morph: { targetBucket: 4, normals: true, tangents: false },
          features: { "prd06.deform": "skin4|morph4n|k8", "prd10.wind": 1 } as ProgramFeatures["features"]
        }),
        { flags: ALL_ON_FLAGS }
      );
      const program = createGeneratedPbrProgram(generated.descriptor!);
      expect(program.wind).toBe(true);
      const vsMain = program.vertex.slice(program.vertex.indexOf("@vertex fn vs_main"));
      const morphIdx = vsMain.indexOf("generatedMorphFetch");
      const skinIdx = vsMain.indexOf("generatedSkin4");
      const windIdx = vsMain.indexOf("generatedWindOffset");
      expect(morphIdx).toBeGreaterThan(-1);
      expect(skinIdx).toBeGreaterThan(morphIdx);
      expect(windIdx).toBeGreaterThan(skinIdx);
      expect(program.fragment).toContain("max(roughness * roughness, 0.002)");
      expect(program.fragment).toContain("clamp(color, vec3f(0.0), vec3f(65504.0))");
    } finally {
      unregisterWind();
    }
  });

  it("emits v_worldPos/v_localPos and packs inverse view/model matrices for clipped billboard sprites", () => {
    const generated = generateProgramImpl(
      normalizeProgramFeatures({
        lighting: "unlit",
        features: { "a3d.nativePrimitive": "triangles", "prd15.paritySprite": true, "a3d.clipping": true }
      }),
      { flags: ALL_ON_FLAGS }
    );
    const program = createGeneratedUnlitProgram(generated.descriptor!);
    expect(program.sprite).toBe(true);
    expect(program.clipping).toBe(true);
    expect(program.vertex).toContain("@location(8) v_worldPos: vec3f");
    expect(program.vertex).toContain("material.spriteViewToWorld * spriteView");
    const viewToWorld = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1]);
    const packed = packGeneratedUnlitMaterialUniforms(
      new Map<string, UniformValue>([["u_a3dSpriteViewToWorld", viewToWorld]])
    );
    const dv = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect(dv.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.spriteViewToWorld! + 12 * 4, true)).toBe(3);
  });

  it("executes VolumetricFogPass, DecalPass, and MeshParticlePass natively on WebGPU with paired WGSL shaders", async () => {
    const f = await createNativeWebGpuFixture();
    try {
      const sceneRt = f.device.createRenderTarget({ width: 16, height: 16, format: "rgba16f", depth: "texture" });
      const outRt = f.device.createRenderTarget({ width: 16, height: 16, format: "rgba16f", depth: true });
      const depthTex = sceneRt.depthTexture!;
      f.device.beginFrame(16, 16);
      f.device.setRenderTarget(outRt);

      const ctx = {
        device: f.device,
        width: 16,
        height: 16,
        frameIndex: 0,
        timeSeconds: 0.5,
        camera: {
          position: [0, 1, 5],
          viewMatrix: IDENTITY,
          projectionMatrix: IDENTITY,
          viewProjectionMatrix: IDENTITY,
          previousViewProjectionMatrix: null,
          near: 0.1,
          far: 64,
          projection: "perspective"
        },
        blackboard: new Map(),
        sceneDepth: { texture: depthTex, available: true, linearize: { near: 0.1, far: 64, orthographic: false } }
      } as unknown as FrameContributorContext;

      // 1) VolumetricFogPass (inject + integrate + apply):
      const grid: FroxelGridSpec = {
        tileWidth: 8,
        tileHeight: 8,
        slices: 4,
        tilesX: 2,
        tilesY: 2,
        atlasWidth: 16,
        atlasHeight: 16,
        near: 0.5,
        far: 32,
        temporal: false,
        note: null
      };
      const volPass = new VolumetricFogPass(f.device, grid);
      const { apply } = volPass.update(
        {
          fog: null,
          fogColor: [0.6, 0.7, 0.8],
          volumes: [],
          sunDirection: [0, 1, 0],
          sunColor: [1, 1, 1],
          ambientColor: [0.2, 0.2, 0.25],
          sceneDepth: depthTex,
          depthLinearize: [0.1, 64, 0, 0]
        },
        ctx
      );
      apply(outRt);

      // 2) DecalPass:
      const decalBatch = new DecalBatch(8);
      const quadVerts = new Float32Array([
        -0.5, 0, -0.5, 0, 1, 0, 0, 0,
         0.5, 0, -0.5, 0, 1, 0, 1, 0,
         0.5, 0,  0.5, 0, 1, 0, 1, 1,
        -0.5, 0,  0.5, 0, 1, 0, 0, 1
      ]);
      const quadIndices = new Uint32Array([0, 1, 2, 0, 2, 3]);
      decalBatch.upsert({ id: "d1", pageKey: "p1", blend: "alpha", geometry: { vertices: quadVerts, indices: quadIndices } }, 0);
      const decalPass = new DecalPass(f.device);
      expect(decalPass.draw(decalBatch, ctx, 0.1)).toBe(1);

      // 3) MeshParticlePass:
      const meshBatch = new MeshParticleBatch({ capacity: 8 });
      meshBatch.spawn({ position: [0, 1, 0], scale: 0.5, color: [1, 0.5, 0.2, 1], emissive: [0.1, 0, 0], life: 5 });
      const meshPass = new MeshParticlePass(f.device);
      const meshItems = meshPass.transparentItems([{ nodeId: "sparks", batch: meshBatch }], ctx);
      expect(meshItems).toHaveLength(1);
      for (const item of meshItems) item.draw(ctx);

      f.device.endFrame?.();

      const shaderCodes = f.modules.map((m) => m.code);
      expect(shaderCodes.some((c) => c.includes("textureLoad(u_sceneDepthTexture") && c.includes("u_integrateAtlasTexture"))).toBe(true);
      expect(shaderCodes.some((c) => c.includes("prd07-decal-v1") && !c.includes("@aura3d-bindings"))).toBe(true);
      expect(shaderCodes.some((c) => c.includes("prd07-mesh-particle-v1") && c.includes("@location(6) a_color"))).toBe(true);
      expect(f.submissions.filter((s) => s.vertices !== undefined).length).toBeGreaterThanOrEqual(8);

      volPass.dispose();
      decalPass.dispose();
      meshPass.dispose();
      sceneRt.dispose();
      outRt.dispose();
    } finally {
      f.device.dispose();
    }
  });

  it("allocates distinct per-draw VBOs within the same frame across RibbonPass, BeamPass, MeshParticlePass & DecalPass and reuses them next frame", () => {
    const device = new MockRenderDevice();
    try {
      const makeCtx = (frameIndex: number) => ({
        device,
        width: 32,
        height: 32,
        frameIndex,
        timeSeconds: frameIndex * 0.016,
        camera: { position: [0, 0, 5], viewProjectionMatrix: IDENTITY },
        blackboard: new Map(),
        sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 100, orthographic: false } }
      }) as unknown as FrameContributorContext;

      // 1) BeamPass: two beams in frame 0 must NOT share vertexBuffer
      const beamPass = new BeamPass(device);
      device.beginFrame(32, 32);
      const beamSpecs = [
        { nodeId: "b1", kind: "light-beam" as const, color: [1, 1, 1, 1] as const, intensity: 1, from: [0, 2, 0] as const, to: [0, 0, 0] as const },
        { nodeId: "b2", kind: "auroraRibbon" as const, color: [0, 1, 0.5, 1] as const, intensity: 1, width: 4, height: 2, segments: 6 }
      ];
      for (const item of beamPass.transparentItems(beamSpecs, makeCtx(0))) item.draw(makeCtx(0));
      expect(device.drawCommands).toHaveLength(2);
      const beamVb0 = device.drawCommands[0]!.vertexBuffer;
      const beamVb1 = device.drawCommands[1]!.vertexBuffer;
      expect(beamVb0).not.toBe(beamVb1);
      device.endFrame();

      // Frame 1 reuses those exact two slot buffers without allocating new ones:
      device.beginFrame(32, 32);
      for (const item of beamPass.transparentItems(beamSpecs, makeCtx(1))) item.draw(makeCtx(1));
      expect(device.drawCommands[0]!.vertexBuffer).toBe(beamVb0);
      expect(device.drawCommands[1]!.vertexBuffer).toBe(beamVb1);
      device.endFrame();

      // 2) RibbonPass: camera + surface orientation groups in frame 0 use distinct buffers
      const ribbonBatch = new RibbonBatch();
      const camTrail = ribbonBatch.upsertTrail({ id: "t-cam", orientation: "camera" });
      camTrail.push([0, 0, 0], 0);
      camTrail.push([1, 0, 0], 0.1);
      const surfTrail = ribbonBatch.upsertTrail({ id: "t-surf", orientation: "surface", surfaceNormal: [0, 1, 0] });
      surfTrail.push([0, 0, 0], 0);
      surfTrail.push([0, 0, 1], 0.1);
      const ribbonPass = new RibbonPass(device);
      device.beginFrame(32, 32);
      for (const item of ribbonPass.transparentItems(ribbonBatch, makeCtx(0))) item.draw(makeCtx(0));
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands[0]!.vertexBuffer).not.toBe(device.drawCommands[1]!.vertexBuffer);
      device.endFrame();

      // 3) MeshParticlePass: two particle emitters in frame 0 use distinct instance buffers
      const mpA = new MeshParticleBatch({ capacity: 4 });
      mpA.spawn({ position: [0, 0, 0], life: 2 });
      const mpB = new MeshParticleBatch({ capacity: 8 });
      mpB.spawn({ position: [1, 0, 0], life: 2 });
      const meshPass = new MeshParticlePass(device);
      device.beginFrame(32, 32);
      for (const item of meshPass.transparentItems([{ nodeId: "a", batch: mpA }, { nodeId: "b", batch: mpB }], makeCtx(0))) {
        item.draw(makeCtx(0));
      }
      expect(device.drawCommands).toHaveLength(2);
      const instBufA = device.drawCommands[0]!.instanceAttributes?.[0]?.buffer;
      const instBufB = device.drawCommands[1]!.instanceAttributes?.[0]?.buffer;
      expect(instBufA).toBeDefined();
      expect(instBufA).not.toBe(instBufB);
      device.endFrame();

      // 4) DecalPass: two page groups in frame 0 use distinct VBOs
      const decalBatch = new DecalBatch(8);
      const qv = new Float32Array([
        -0.5, 0, -0.5, 0, 1, 0, 0, 0,
         0.5, 0, -0.5, 0, 1, 0, 1, 0,
         0.5, 0,  0.5, 0, 1, 0, 1, 1,
        -0.5, 0,  0.5, 0, 1, 0, 0, 1
      ]);
      const qi = new Uint32Array([0, 1, 2, 0, 2, 3]);
      decalBatch.upsert({ id: "d1", pageKey: "pageA", blend: "alpha", geometry: { vertices: qv, indices: qi } }, 0);
      decalBatch.upsert({ id: "d2", pageKey: "pageB", blend: "alpha", geometry: { vertices: qv, indices: qi } }, 0);
      const decalPass = new DecalPass(device);
      device.beginFrame(32, 32);
      expect(decalPass.draw(decalBatch, makeCtx(0), 0.1)).toBe(2);
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands[0]!.vertexBuffer).not.toBe(device.drawCommands[1]!.vertexBuffer);
      device.endFrame();

      beamPass.dispose();
      ribbonPass.dispose();
      meshPass.dispose();
      decalPass.dispose();
    } finally {
      device.dispose();
    }
  });
});
