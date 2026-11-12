import { describe, expect, it, vi } from "vitest";
import {
  WebGPUDevice,
  type WebGPUAdapterLike,
  type WebGPUCanvasContextLike,
  type WebGPUDeviceLike,
  type WebGPURenderPassDescriptorLike
} from "../../../packages/rendering/src/WebGPUDevice";
import {
  WEBGPU_PRECHECK_ASSUMES_DEPTH_TEXTURES,
  webgpuNativeDepthPostStages
} from "../../../packages/rendering/src/post/WebGPUScreenSpaceReflections";
import {
  WEBGPU_BLOOM_V2_PREFILTER_FRAGMENT,
  WEBGPU_OUTLINE_FRAGMENT,
  WEBGPU_SMAA_BLEND_FRAGMENT,
  WEBGPU_SMAA_EDGES_FRAGMENT,
  WEBGPU_SMAA_WEIGHTS_FRAGMENT,
  webgpuBrightExtractFragment
} from "../../../packages/rendering/src/webgpu/WebGPUPostShaders";
import { registerPostPass, type PostPassDescriptor } from "../../../packages/rendering/src/contracts/post";
import { postSkippedReasons, postStagesRan } from "../../../packages/rendering/src/renderer/postSkipped";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import type { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

interface RecordedPass {
  readonly label: string;
  readonly descriptor: WebGPURenderPassDescriptorLike;
  pipelineLabel?: string;
  entryPoint?: string;
  bindGroupEntries?: readonly { readonly binding: number; readonly resource: unknown }[];
  draws: number;
}

interface FakeHarness {
  readonly device: WebGPUDevice;
  readonly passes: RecordedPass[];
  readonly encoders: string[];
  readonly submissions: number[];
  readonly createdTextures: { readonly label?: string; readonly size: readonly number[]; readonly format: string; readonly usage: number; readonly sampleCount?: number; destroyed: boolean }[];
  readonly requestedFeatures: string[][];
  readonly writtenUniforms: { readonly label?: string; readonly floats: number[] }[];
  close(): void;
}

async function createHarness(options: {
  readonly adapterFeatures?: readonly string[];
  readonly displayP3Canvas?: boolean;
  readonly nativeDrawBatching?: boolean;
} = {}): Promise<FakeHarness> {
  const passes: RecordedPass[] = [];
  const encoders: string[] = [];
  const submissions: number[] = [];
  const createdTextures: FakeHarness["createdTextures"] = [];
  const requestedFeatures: string[][] = [];
  const writtenUniforms: FakeHarness["writtenUniforms"] = [];
  const featureSet = new Set(options.adapterFeatures ?? []);

  let activeCanvasConfig: Record<string, unknown> | null = null;
  const canvasTexture = {
    label: "canvas-surface",
    format: "bgra8unorm",
    usage: 0x10,
    sampleCount: 1,
    createView: () => ({ label: "canvas-surface-view", canvas: true }),
    destroy() {}
  };
  const canvasContext: WebGPUCanvasContextLike = {
    configure(config) {
      activeCanvasConfig = { ...(config as unknown as Record<string, unknown>) };
    },
    unconfigure() {
      activeCanvasConfig = null;
    },
    getConfiguration: () => activeCanvasConfig as never,
    getCurrentTexture: () => canvasTexture as never
  };

  const native: WebGPUDeviceLike = {
    features: featureSet,
    limits: {
      maxTextureDimension2D: 4096,
      maxBufferSize: 16 * 1024 * 1024,
      maxUniformBufferBindingSize: 65536,
      minUniformBufferOffsetAlignment: 256
    },
    queue: {
      submit(cmds: readonly unknown[]) {
        submissions.push(cmds.length);
      },
      writeBuffer(buffer: unknown, _offset: number, data: ArrayBufferView) {
        const b = buffer as { readonly label?: string };
        const view = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
        writtenUniforms.push({ label: b.label, floats: Array.from(view) });
      },
      writeTexture() {},
      onSubmittedWorkDone: () => Promise.resolve()
    },
    createBuffer: (desc: { label?: string; size: number; usage: number }) => ({
      label: desc.label,
      size: desc.size,
      usage: desc.usage,
      destroy() {}
    }),
    createTexture: (desc: { label?: string; size: readonly number[]; format: string; usage: number; sampleCount?: number }) => {
      const record = {
        label: desc.label,
        size: [...desc.size],
        format: desc.format,
        usage: desc.usage,
        sampleCount: desc.sampleCount,
        destroyed: false,
        createView: (viewDesc?: { aspect?: string }) => ({ label: `${desc.label ?? "tex"}-view`, aspect: viewDesc?.aspect, owner: desc.label }),
        destroy() {
          record.destroyed = true;
        }
      };
      createdTextures.push(record);
      return record as never;
    },
    createSampler: () => ({}),
    createShaderModule: (desc: { label?: string; code: string }) => ({ label: desc.label, code: desc.code }),
    createBindGroupLayout: (desc: { label?: string; entries: readonly unknown[] }) => ({ label: desc.label, entries: desc.entries }),
    createPipelineLayout: (desc: { label?: string }) => ({ label: desc.label }),
    createRenderPipeline: (desc: { label?: string; fragment?: { entryPoint?: string } }) => ({
      label: desc.label,
      entryPoint: desc.fragment?.entryPoint,
      getBindGroupLayout: (index: number) => ({ group: index, pipeline: desc.label })
    }),
    createBindGroup: (desc: { label?: string; entries: readonly { readonly binding: number; readonly resource: unknown }[] }) => ({
      label: desc.label,
      entries: desc.entries
    }),
    createCommandEncoder: (desc?: { label?: string }) => {
      encoders.push(desc?.label ?? "");
      return {
        beginRenderPass(passDesc: WebGPURenderPassDescriptorLike) {
          const rec: RecordedPass = { label: passDesc.label ?? "", descriptor: passDesc, draws: 0 };
          passes.push(rec);
          return {
            setPipeline(p: unknown) {
              const pl = p as { label?: string; entryPoint?: string };
              rec.pipelineLabel = pl.label;
              rec.entryPoint = pl.entryPoint;
            },
            setBindGroup(slot: number, group: unknown) {
              if (slot === 0 && group && typeof group === "object" && "entries" in group) {
                rec.bindGroupEntries = (group as { entries: readonly { binding: number; resource: unknown }[] }).entries;
              }
            },
            setVertexBuffer() {},
            setIndexBuffer() {},
            setViewport() {},
            setScissorRect() {},
            setBlendConstant() {},
            setStencilReference() {},
            draw() {
              rec.draws += 1;
            },
            drawIndexed() {
              rec.draws += 1;
            },
            end() {}
          };
        },
        copyTextureToTexture() {},
        finish: () => ({})
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;

  const adapter: WebGPUAdapterLike = {
    features: featureSet,
    requestDevice: async (descriptor?: { requiredFeatures?: readonly string[] }) => {
      requestedFeatures.push([...(descriptor?.requiredFeatures ?? [])]);
      return native;
    }
  };

  const device = await WebGPUDevice.create({
    adapter,
    canvas: { getContext: () => canvasContext } as unknown as HTMLCanvasElement,
    presentationFormat: "bgra8unorm",
    nativeDrawBatching: options.nativeDrawBatching ?? true
  });
  if (options.displayP3Canvas) {
    expect(device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
  }
  return {
    device,
    passes,
    encoders,
    submissions,
    createdTextures,
    requestedFeatures,
    writtenUniforms,
    close() {
      if (!device.disposed) device.dispose();
    }
  };
}

describe("WP-06 WebGPUDevice parity & hot-path overhaul", () => {
  it("D1: enables 1x SSR & AO depth-texture precheck on WebGPU", () => {
    expect(WEBGPU_PRECHECK_ASSUMES_DEPTH_TEXTURES).toBe(true);
    expect(webgpuNativeDepthPostStages()).toEqual(["ssr", "ssr:msaa"]);
    expect(webgpuNativeDepthPostStages(false)).toEqual(["ssr:msaa"]);
  });

  it("D2a: scrubs NaN/Inf texels and clamps knee = 0 in WGSL bloom prefilter shaders", async () => {
    const j2 = webgpuBrightExtractFragment();
    expect(j2).toContain("bitcast<vec3<u32>>");
    expect(j2).toContain("max(u_bloom.knee, 1e-4)");
    expect(WEBGPU_BLOOM_V2_PREFILTER_FRAGMENT).toContain("bitcast<vec3<u32>>");
    expect(WEBGPU_BLOOM_V2_PREFILTER_FRAGMENT).toContain("max(params.y, 1e-4)");

    const h = await createHarness();
    const hdr = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false, label: "bloom-src" });
    try {
      const outJ2 = h.device.executeWebGPUBloom(hdr, { threshold: 1, knee: 0, strength: 0.5 });
      const outV2 = h.device.executeWebGPUBloom(hdr, { v2: true, threshold: 1, softKnee: 0, intensity: 0.5 } as never);
      expect(outJ2.width).toBe(8);
      expect(outV2.width).toBe(8);
      // Verify 2D bloom targets do not allocate accidental depth24plus attachments.
      expect(h.createdTextures.some(t => (t.label ?? "").includes("bloom") && (t.label ?? "").endsWith("-depth"))).toBe(false);
      outJ2.dispose();
      outV2.dispose();
    } finally {
      hdr.dispose();
      h.close();
    }
  });

  it("D2b: executes full-frame WGSL outline and 3-pass WGSL SMAA 1x without throwing WEBGPU_POSTPROCESS_UNSUPPORTED", async () => {
    expect(WEBGPU_OUTLINE_FRAGMENT).toContain("fn fs_outline");
    expect(WEBGPU_SMAA_EDGES_FRAGMENT).toContain("fn fs_smaa_edges");
    expect(WEBGPU_SMAA_WEIGHTS_FRAGMENT).toContain("fn fs_smaa_weights");
    expect(WEBGPU_SMAA_BLEND_FRAGMENT).toContain("fn fs_smaa_blend");

    const h = await createHarness();
    const scene = h.device.createRenderTarget({ width: 16, height: 16, format: "rgba16f", depth: "texture", label: "scene-1x" });
    const scopeId = {};
    const token = postDiagnostics.begin(scopeId, "main", 1);
    try {
      h.device.presentLdrPostprocess(scene, {
        passes: [
          { name: "tone-mapping", options: { operator: "aces" } },
          { name: "outline", options: { color: [1, 0.2, 0.1, 1], thickness: 2 } },
          { name: "smaa" as never, options: {} }
        ],
        cameraFrame: { near: 0.1, far: 200, projection: "perspective" },
        postFrameContext: { scopeId, viewId: "main", frameId: 1, timeSeconds: 0.5, diagnosticToken: token }
      });
      const entries = h.passes.filter(p => p.draws > 0).map(p => p.entryPoint);
      expect(entries).toContain("fs_chain_linear_depth");
      expect(entries).toContain("fs_outline");
      expect(entries).toContain("fs_smaa_edges");
      expect(entries).toContain("fs_smaa_weights");
      expect(entries).toContain("fs_smaa_blend");
      expect(postStagesRan(token)).toContain("S11:outline");
      expect(postStagesRan(token)).toContain("S11:smaa");

      const areaLuts = h.createdTextures.filter(t => t.label === "a3d-webgpu-smaa-area-lut");
      const searchLuts = h.createdTextures.filter(t => t.label === "a3d-webgpu-smaa-search-lut");
      expect(areaLuts).toHaveLength(1);
      expect(areaLuts[0]!.size).toEqual([81, 1]);
      expect(searchLuts).toHaveLength(1);
      expect(searchLuts[0]!.size).toEqual([256, 1]);
    } finally {
      scene.dispose();
      h.close();
    }
  });

  it("D2c: binds linearized scene depth at @binding(3) for custom WGSL passes while keeping 3-binding layout when @binding(3) is absent", async () => {
    const h = await createHarness();
    const scene = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: "texture", label: "custom-depth-src" });
    const scopeId = {};
    const token = postDiagnostics.begin(scopeId, "main", 1);
    const unregisterThreeBinding = registerPostPass({
      id: "wp06-three-binding-depth-declared",
      owner: "wp06",
      flag: "A3D_QR_POST",
      gpuOnly: true,
      insertAt: "after-tonemap",
      space: "display",
      inputs: ["color", "depth"],
      fragment: {
        glsl: "void main(){}",
        wgsl: `
          @group(0) @binding(0) var<uniform> u_p: array<vec4<f32>, 1>;
          @group(0) @binding(1) var u_s: sampler;
          @group(0) @binding(2) var u_c: texture_2d<f32>;
          @fragment fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
            return textureSample(u_c, u_s, uv);
          }
        `
      }
    } as unknown as PostPassDescriptor);
    try {
      h.device.presentLdrPostprocess(scene, {
        passes: [{ name: "tone-mapping", options: { operator: "reinhard" } }],
        cameraFrame: { near: 0.1, far: 100, projection: "perspective" },
        customPasses: [{
          id: "wp06-pipeline-four-binding-depth",
          owner: "wp06",
          flag: "A3D_QR_POST",
          gpuOnly: true,
          insertAt: "before-tonemap",
          space: "linear-hdr",
          inputs: ["color", "depth"],
          fragment: {
            glsl: "void main(){}",
            wgsl: `
              @group(0) @binding(0) var<uniform> u_p: array<vec4<f32>, 1>;
              @group(0) @binding(1) var u_s: sampler;
              @group(0) @binding(2) var u_c: texture_2d<f32>;
              @group(0) @binding(3) var u_depth: texture_2d<f32>;
              @fragment fn fs_depth_fog(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
                let c = textureSample(u_c, u_s, uv);
                let z = textureSample(u_depth, u_s, uv).r;
                return vec4<f32>(c.rgb * clamp(z * 0.01, 0.0, 1.0), c.a);
              }
            `
          }
        } as unknown as PostPassDescriptor],
        postFrameContext: { scopeId, viewId: "main", frameId: 1, timeSeconds: 1, diagnosticToken: token }
      });

      expect(postSkippedReasons(token)).toEqual([]);
      const fourBindPass = h.passes.find(p => p.label === "webgpu-post:webgpu-custom:wp06-pipeline-four-binding-depth-pass" || p.pipelineLabel?.includes("wp06-pipeline-four-binding-depth"));
      const threeBindPass = h.passes.find(p => p.pipelineLabel?.includes("wp06-three-binding-depth-declared"));
      expect(fourBindPass?.bindGroupEntries?.map(e => e.binding)).toEqual([0, 1, 2, 3]);
      expect(threeBindPass?.bindGroupEntries?.map(e => e.binding)).toEqual([0, 1, 2]);
    } finally {
      unregisterThreeBinding();
      scene.dispose();
      h.close();
    }
  });

  it("D3: runs full Display-P3 post chains (bloom, hdrGrade, tone, color-grade, LUT, vignette, outline, SMAA, finalize) and v2 HDR TAA", async () => {
    const h = await createHarness({ displayP3Canvas: true });
    const scene = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: "texture", label: "p3-scene" });
    const scopeId = {};
    const token = postDiagnostics.begin(scopeId, "p3", 2);
    const cubeLut = [
      "LUT_3D_SIZE 2",
      "0 0 0", "1 0 0", "0 1 0", "1 1 0",
      "0 0 1", "1 0 1", "0 1 1", "1 1 1"
    ].join("\n");
    try {
      expect(() => h.device.presentLdrPostprocess(scene, {
        passes: [
          { name: "bloom", options: { strength: 0.4 } },
          { name: "tone-mapping", options: { operator: "aces", outputColorSpace: "display-p3" } },
          { name: "color-grade", options: { saturation: 1.1 } },
          { name: "outline", options: { thickness: 1 } }
        ],
        nativeSmaa: true,
        nativeHdrGrade: {
          whiteBalance: [1, 1, 1], lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
          shadows: [1, 1, 1], midtones: [1, 1, 1], highlights: [1, 1, 1]
        },
        nativeLut: { source: "test-p3.cube", cube: cubeLut, intensity: 0.8 },
        nativeDofDisplay: {
          vignette: { intensity: 0.25, smoothness: 0.5, roundness: 1, color: [0.1, 0.05, 0.02] },
          finalize: { grainIntensity: 0.05, grainSize: 1.5, grainLuminanceResponse: 0.8 }
        },
        toneMappingDefaults: { outputColorSpace: "display-p3", alphaMode: "opaque" },
        cameraFrame: { near: 0.1, far: 100, projection: "perspective" },
        postFrameContext: { scopeId, viewId: "p3", frameId: 2, timeSeconds: 0.2, diagnosticToken: token }
      })).not.toThrow();

      expect(postSkippedReasons(token)).toEqual([]);
      const gradeUniform = h.writtenUniforms.find(u => (u.label ?? "").includes("webgpu-color-grade-uniforms"));
      expect(gradeUniform?.floats[3]).toBe(1);
      const lutUniform = h.writtenUniforms.find(u => (u.label ?? "").includes("webgpu-display-lut-uniforms"));
      expect(lutUniform?.floats[2]).toBe(1);

      // Verify v2 HDR TAA executes cleanly without throwing WEBGPU_TEMPORAL_V2_UNSUPPORTED.
      const velocity = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false, label: "taa-vel" });
      const history = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false, label: "taa-hist" });
      const historyOut = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false, label: "taa-hist-out" });
      const linZ = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false, label: "taa-linz-prev" });
      const linZOut = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false, label: "taa-linz-cur" });
      const reactive = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false, label: "taa-reactive" });
      const taaOut = h.device.executeWebGPUTaa(scene, {
        velocity,
        history,
        historyOutput: historyOut,
        historyValid: true,
        v2: {
          reconstruction: "temporal",
          motionSource: "object",
          linZ,
          linZOutput: linZOut,
          reactive,
          jitterClip: [0.125, -0.125],
          previousJitterClip: [-0.125, 0.125],
          depthNear: 0.1,
          unsupportedMotion: []
        } as never
      });
      expect(taaOut.width).toBe(8);
      expect(h.passes.some(p => p.entryPoint === "fs_taa_v2_resolve")).toBe(true);
      expect(h.passes.some(p => p.entryPoint === "fs_taa_v2_upscale")).toBe(true);
      for (const t of [taaOut, velocity, history, historyOut, linZ, linZOut, reactive]) t.dispose();
    } finally {
      scene.dispose();
      h.close();
    }
  });

  it("D4: requests ASTC/ETC2/BC features, uses storeOp='discard' on 4x MSAA color while preserving depth 'store' for depth consumers, and trims #postTargetPool on resize", async () => {
    const h = await createHarness({
      adapterFeatures: ["texture-compression-astc", "texture-compression-etc2", "texture-compression-bc"]
    });
    expect(h.requestedFeatures[0]).toEqual(expect.arrayContaining([
      "texture-compression-astc",
      "texture-compression-etc2",
      "texture-compression-bc"
    ]));

    const msaaWithDepthConsumers = h.device.createRenderTarget({
      width: 16,
      height: 16,
      format: "rgba16f",
      sampleCount: 4,
      label: "msaa-scene"
    });
    const msaaTransientDepth = h.device.createRenderTarget({
      width: 16,
      height: 16,
      format: "rgba16f",
      sampleCount: 4,
      transientDepth: true,
      label: "msaa-transient"
    } as never);
    const shadowScratch = h.device.createRenderTarget({
      width: 8,
      height: 8,
      format: "rgba8",
      depth: false,
      label: "offscreen-scratch"
    });
    const shader = h.device.createShaderProgram({
      label: "basic-wgsl",
      marker: "basic-wgsl",
      vertex: "/* basic-wgsl */ void main(){}",
      fragment: "/* basic-wgsl */ void main(){}",
      webgpu: {
        vertex: "@vertex fn vs(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p, 1.0); }",
        fragment: "@fragment fn fs() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
      }
    });
    const vbo = h.device.createBuffer("vertex", 36, new Float32Array(9));
    try {
      h.device.beginFrame(16, 16);
      // clear() followed by draw() on the same target fuses into loadOp='clear' without a standalone clear pass.
      h.device.setRenderTarget(msaaWithDepthConsumers);
      h.device.clear([0.1, 0.2, 0.3, 1]);
      h.device.beginDrawBatch();
      h.device.draw({ label: "msaa-draw", topology: "triangles", vertexBuffer: vbo, vertexCount: 3, shader });
      h.device.endDrawBatch();

      expect(h.passes.some(p => p.label === "msaa-scene-native-clear-pass")).toBe(false);
      const scenePass = h.passes.find(p => p.label === "msaa-draw-pass")!;
      expect(scenePass.descriptor.colorAttachments?.[0]?.loadOp).toBe("clear");
      expect(scenePass.descriptor.colorAttachments?.[0]?.storeOp).toBe("discard");
      // CRITICAL: default 4x MSAA scene target MUST keep depthStoreOp = "store" for SSR/GTAO/DoF/custom depth passes!
      expect(scenePass.descriptor.depthStencilAttachment?.depthStoreOp).toBe("store");

      h.device.setRenderTarget(msaaTransientDepth);
      h.device.clear([0, 0, 0, 1]);
      h.device.beginDrawBatch();
      h.device.draw({ label: "transient-draw", topology: "triangles", vertexBuffer: vbo, vertexCount: 3, shader });
      h.device.endDrawBatch();
      const transientPass = h.passes.find(p => p.label === "transient-draw-pass")!;
      expect(transientPass.descriptor.colorAttachments?.[0]?.storeOp).toBe("discard");
      expect(transientPass.descriptor.depthStencilAttachment?.depthStoreOp).toBe("discard");
      h.device.endFrame();

      // Verify #postTargetPool trims stale sizes immediately on root resize.
      const postA = h.device.createRenderTarget({ width: 32, height: 32, format: "rgba16f", depth: false, label: "post-32" });
      const postB = h.device.createRenderTarget({ width: 64, height: 64, format: "rgba16f", depth: false, label: "post-64" });
      h.device.presentLdrPostprocess(postA, {
        passes: [{ name: "tone-mapping", options: { operator: "reinhard" } }, { name: "fxaa", options: {} }]
      });
      const pooled32 = h.createdTextures.filter(t => t.size[0] === 32 && t.size[1] === 32 && t.label !== "post-32");
      expect(pooled32.length).toBeGreaterThan(0);
      expect(pooled32.every(t => !t.destroyed)).toBe(true);

      h.device.presentLdrPostprocess(postB, {
        passes: [{ name: "tone-mapping", options: { operator: "reinhard" } }, { name: "fxaa", options: {} }]
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(pooled32.every(t => t.destroyed)).toBe(true);
      postA.dispose();
      postB.dispose();
    } finally {
      vbo.dispose();
      shader.dispose();
      shadowScratch.dispose();
      msaaTransientDepth.dispose();
      msaaWithDepthConsumers.dispose();
      h.close();
    }
  });

  it("D5: memoizes morph maxVertexIndex across repeated draws and batches morph draws into one submission", async () => {
    const h = await createHarness();
    const rt = h.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false, label: "morph-rt" });
    const morphShader = h.device.createShaderProgram({
      label: "morph-test",
      marker: "morph-unlit",
      vertex: "/* morph-unlit */\n#version 300 es\nin vec3 a_position; void main(){ gl_Position = vec4(a_position, 1.0); }",
      fragment: "/* morph-unlit */\n#version 300 es\nprecision highp float; out vec4 c; void main(){ c = vec4(1.0); }"
    });
    const vertexFormat = {
      streams: [{ slot: 0, stride: 12, stepMode: "vertex", divisor: 0 }],
      attributes: [{ name: "a_position", shaderLocation: 0, bufferSlot: 0, offset: 0, type: "float32", components: 3, normalized: false, byteLength: 12 }]
    } as unknown as VertexFormat;
    const vbo = h.device.createBuffer("vertex", 4 * 12, new Float32Array(12));
    const ibo = h.device.createBuffer("index", 12, new Uint16Array([0, 1, 2, 0, 2, 3]));
    const getUint16Spy = vi.spyOn(DataView.prototype, "getUint16");
    const weights = new Float32Array([0.5, 0, 0, 0]);
    const deltas = new Float32Array(64 * 4);
    try {
      h.device.beginFrame(8, 8);
      h.device.setRenderTarget(rt);
      h.device.clear([0, 0, 0, 1]);
      getUint16Spy.mockClear();
      const submissionsBefore = h.submissions.length;

      h.device.beginDrawBatch();
      for (let i = 0; i < 5; i += 1) {
        h.device.draw({
          label: `morph-${i}`,
          topology: "triangles",
          vertexBuffer: vbo,
          vertexCount: 4,
          vertexFormat,
          indexBuffer: ibo,
          indexCount: 6,
          indexType: "uint16",
          shader: morphShader,
          uniforms: new Map<string, unknown>([
            ["u_morphUsesTexture", 0],
            ["u_morphTargetCount", 1],
            ["u_morphWeights", weights],
            ["u_morphPositionDeltas", deltas]
          ]) as never
        });
      }
      h.device.endDrawBatch();

      // 6 indices scanned once on draw 0; draws 1..4 hit the WeakMap memo (0 extra scans).
      expect(getUint16Spy).toHaveBeenCalledTimes(6);
      // All 5 morph draws coalesced into a single queue.submit!
      expect(h.submissions.length - submissionsBefore).toBe(1);

      // Updating the index buffer bumps writeRevision and invalidates the memo cleanly.
      h.device.updateBuffer(ibo, 0, new Uint16Array([0, 1, 2, 1, 2, 3]));
      h.device.draw({
        label: "morph-after-write",
        topology: "triangles",
        vertexBuffer: vbo,
        vertexCount: 4,
        vertexFormat,
        indexBuffer: ibo,
        indexCount: 6,
        indexType: "uint16",
        shader: morphShader,
        uniforms: new Map<string, unknown>([
          ["u_morphUsesTexture", 0],
          ["u_morphTargetCount", 1],
          ["u_morphWeights", weights],
          ["u_morphPositionDeltas", deltas]
        ]) as never
      });
      expect(getUint16Spy).toHaveBeenCalledTimes(12);
      h.device.endFrame();
    } finally {
      getUint16Spy.mockRestore();
      ibo.dispose();
      vbo.dispose();
      morphShader.dispose();
      rt.dispose();
      h.close();
    }
  });
});
