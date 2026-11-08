import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { ParticleBatchPass } from "../../../packages/rendering/src/vfx/ParticleBatchPass";
import { particleWgsl } from "../../../packages/rendering/src/vfx/shaders/particle.wgsl";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import type { ParticleBatchDescriptor } from "../../../packages/rendering/src/contracts/particles";
import { Texture } from "../../../packages/rendering/src/Texture";

type Module = { readonly label: string; readonly code: string };
type PipelineDescriptor = {
  readonly vertex: { readonly module: Module; readonly buffers?: readonly unknown[] };
  readonly fragment: { readonly module: Module };
  readonly depthStencil?: { readonly depthCompare: string; readonly depthWriteEnabled: boolean };
};
type RecordedPass = {
  readonly descriptor: { readonly colorAttachments: readonly { readonly view: unknown }[] };
  pipeline?: { readonly descriptor: PipelineDescriptor };
  group?: { readonly bytes?: Uint8Array };
  vertexBytes?: Uint8Array;
  vertices?: number;
};

// Exercises the real host-side WebGPUDevice path. This recorder neither
// compiles WGSL nor claims to establish rendered pixels.
async function nativeFixture() {
  const modules: Module[] = [];
  const writes = new Map<object, Uint8Array>();
  const submissions: RecordedPass[] = [];
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.set(buffer, bytes.slice());
      },
      writeTexture() {},
      submit(commands: readonly { readonly passes: readonly RecordedPass[] }[]) { submissions.push(...commands.flatMap(command => command.passes)); },
      onSubmittedWorkDone: async () => {}
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture: ({ label }: { readonly label?: string }) => {
      const texture = { label, createView: () => ({ texture }), destroy() {} };
      return texture;
    },
    createSampler: (descriptor: object) => ({ ...descriptor }),
    createShaderModule(descriptor: Module) { modules.push(descriptor); return descriptor; },
    createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: PipelineDescriptor) { return { descriptor, getBindGroupLayout: () => ({}) }; },
    createBindGroup(descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }) {
      const resource = descriptor.entries.find(entry => entry.binding === 0)?.resource as { readonly buffer?: object } | undefined;
      const bytes = resource?.buffer && writes.get(resource.buffer);
      return { ...(bytes ? { bytes: bytes.slice() } : {}) };
    },
    createCommandEncoder() {
      const passes: RecordedPass[] = [];
      return {
        beginRenderPass(descriptor: RecordedPass["descriptor"]) {
          const pass: RecordedPass = { descriptor };
          passes.push(pass);
          return {
            setPipeline(pipeline: RecordedPass["pipeline"]) { pass.pipeline = pipeline; },
            setBindGroup(_index: number, group: RecordedPass["group"]) { pass.group = group; },
            setVertexBuffer(_slot: number, buffer: object) { pass.vertexBytes = writes.get(buffer)?.slice(); },
            setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(count: number) { pass.vertices = count; },
            setIndexBuffer() {}, drawIndexed(count: number) { pass.vertices = count; }, end() {}
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


const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function batch(key: string, overrides: Partial<ParticleBatchDescriptor> = {}): ParticleBatchDescriptor {
  return {
    key, capacity: 8, source: "cpu",
    atlas: new Texture({ width: 2, height: 2, label: `${key}-atlas`, data: new Uint8Array(16).fill(255) }),
    blend: "alpha", shading: "unlit", softDepth: false, stretch: false, frameBlend: false, ...overrides
  };
}

function instances(count: number): Float32Array {
  const data = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) {
    data[i * 16 + 2] = -5; data[i * 16 + 3] = 1;
    data[i * 16 + 8] = 1; data[i * 16 + 9] = 0.5; data[i * 16 + 10] = 0.25; data[i * 16 + 11] = 1;
  }
  return data;
}

describe("native WebGPU particle batches", () => {
  it("draws instanced billboards with the WGSL twin instead of skipping them", async () => {
    const f = await nativeFixture();
    const target = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: true });
    const pass = new ParticleBatchPass(f.device);
    try {
      const alpha = pass.upsertBatch(batch("smoke"));
      pass.writeInstances(alpha, instances(3), 3);
      const additive = pass.upsertBatch(batch("sparks", { blend: "additive", stretch: true }));
      pass.writeInstances(additive, instances(2), 2);
      const ctx = {
        device: f.device, width: 8, height: 8,
        camera: { viewMatrix: IDENTITY, viewProjectionMatrix: IDENTITY, near: 0.1 },
        sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 100, orthographic: false } },
        blackboard: new Map(), tier: QUALITY_TIERS.high
      } as never as FrameContributorContext;
      const queue = pass.transparentItems(ctx);
      f.device.beginFrame(8, 8);
      f.device.setRenderTarget(target);
      for (const item of queue) item.draw(ctx);
      f.device.endFrame();
      expect(pass.diagnostics.errors.map(error => error.code)).not.toContain("VFX_PARTICLES_WGSL_MISSING");
      expect(pass.diagnostics.drawCalls).toBe(2);
      expect(pass.diagnostics.instancesDrawn).toBe(5);
      const draws = f.submissions.filter(record => record.vertices !== undefined);
      expect(draws).toHaveLength(2);
      const vertex = draws[0]!.pipeline!.descriptor.vertex;
      expect(vertex.module.code).toContain("@vertex fn vs_main(");
      expect(vertex.module.code).toContain("override a3dZeroToOneProjection");
      // Corner quad in slot 0, the four §6.2.1 vec4 instance attributes at locations 1..4.
      expect(vertex.buffers).toEqual(expect.arrayContaining([
        expect.objectContaining({ stepMode: "instance", arrayStride: 64, attributes: [
          { shaderLocation: 1, offset: 0, format: "float32x4" },
          { shaderLocation: 2, offset: 16, format: "float32x4" },
          { shaderLocation: 3, offset: 32, format: "float32x4" },
          { shaderLocation: 4, offset: 48, format: "float32x4" }
        ] })
      ]));
      const fragment = draws[0]!.pipeline!.descriptor.fragment.module.code;
      expect(fragment).toContain("var u_atlasTexture: texture_2d<f32>");
      expect(fragment).toContain("textureSample(u_atlasTexture, u_atlasSampler, v.uv0)");
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });

  it("ports every particle define the GLSL program has", () => {
    const soft = particleWgsl({ stretch: true, frameBlend: true, softParticles: true, blendAdditive: false, blendAdditiveFallback: true,
      unpremultiplyOutput: true, proceduralSoftDot: false, fogAnalytic: true, straightAlpha: true });
    expect(soft.vertex).toContain("velView");
    expect(soft.fragment).toContain("textureLoad(u_sceneDepthTexture");
    expect(soft.fragment).toContain("t = mix(t, textureSample(u_atlasTexture, u_atlasSampler, v.uv1)");
    expect(soft.fragment).toContain("rgb *= 1.6;");
    expect(soft.fragment).toContain("rgb = rgb / max(a, 1e-4);");
    expect(soft.fragment).toContain("t = vec4<f32>(t.rgb * t.a, t.a);");
    const dot = particleWgsl({ stretch: false, frameBlend: false, softParticles: false, blendAdditive: true, blendAdditiveFallback: false,
      unpremultiplyOutput: false, proceduralSoftDot: true, fogAnalytic: false });
    expect(dot.fragment).not.toContain("textureSample");
    expect(dot.fragment).toContain("return vec4<f32>(rgb, 0.0);");
  });
});
