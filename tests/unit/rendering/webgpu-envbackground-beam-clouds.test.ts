import { describe, expect, it } from "vitest";
import { sky } from "../../../packages/engine/src/agent-api/nodes/sky";
import { SkyBackgroundPass } from "../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { EnvironmentBackgroundPass } from "../../../packages/rendering/src/EnvironmentBackgroundPass";
import {
  createCubemapEnvironmentBackgroundOptions,
  createEquirectEnvironmentBackgroundOptions,
  ENVIRONMENT_BACKGROUND_CUBE_FACES
} from "../../../packages/rendering/src/EnvironmentBackgroundResources";
import { createPrd02EnvironmentBackgroundShaderLibrary } from "../../../packages/rendering/src/environment/Prd02BackgroundShaderLibrary";
import { MockRenderDevice, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import type { RenderPassContext } from "../../../packages/rendering/src/RenderPass";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { BeamPass } from "../../../packages/rendering/src/vfx/BeamPass";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

type Module = { readonly label: string; readonly code: string };
type Entry = { readonly binding: number; readonly resource: unknown };
type RecordedPass = {
  pipeline?: { readonly descriptor: { readonly vertex: { readonly module: Module }; readonly fragment: { readonly module: Module } } };
  group?: { readonly entries: readonly Entry[] };
  vertices?: number;
};

// Host-side WebGPUDevice path only: records modules, bind groups and draws;
// it does not compile WGSL or produce pixels (the real GPU capture does).
async function nativeFixture() {
  const modules: Module[] = [];
  const submissions: RecordedPass[] = [];
  const textures: { readonly label?: string; readonly size?: unknown }[] = [];
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: { writeBuffer() {}, writeTexture() {}, submit(commands: readonly { readonly passes: readonly RecordedPass[] }[]) { submissions.push(...commands.flatMap(command => command.passes)); }, onSubmittedWorkDone: async () => {} },
    createBuffer: () => ({ destroy() {} }),
    createTexture: (descriptor: { readonly label?: string; readonly size?: unknown }) => {
      textures.push(descriptor);
      const texture = { label: descriptor.label, createView: (view?: unknown) => ({ texture, view }), destroy() {} };
      return texture;
    },
    createSampler: (descriptor: unknown) => ({ sampler: descriptor }),
    createShaderModule(descriptor: Module) { modules.push(descriptor); return descriptor; },
    createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: RecordedPass["pipeline"] extends infer P ? P extends { descriptor: infer D } ? D : never : never) { return { descriptor, getBindGroupLayout: () => ({}) }; },
    createBindGroup(descriptor: { readonly entries: readonly Entry[] }) { return { entries: descriptor.entries }; },
    createCommandEncoder() {
      const passes: RecordedPass[] = [];
      return {
        beginRenderPass() {
          const pass: RecordedPass = {};
          passes.push(pass);
          return {
            setPipeline(pipeline: RecordedPass["pipeline"]) { pass.pipeline = pipeline; },
            setBindGroup(index: number, group: RecordedPass["group"]) { if (index === 0) pass.group = group; },
            setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(count: number) { pass.vertices = count; }, drawIndexed(count: number) { pass.vertices = count; }, end() {}
          };
        },
        finish: () => ({ passes })
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  return { device, modules, submissions, textures };
}

const draws = (f: { submissions: RecordedPass[] }) => f.submissions.filter(record => record.vertices !== undefined);

function equirect() {
  return createEquirectEnvironmentBackgroundOptions({ width: 2, height: 1, data: new Uint8Array(8).fill(128), inverseViewProjectionMatrix: IDENTITY } as never);
}

function cubemap() {
  return createCubemapEnvironmentBackgroundOptions({
    size: 1, faces: ENVIRONMENT_BACKGROUND_CUBE_FACES.map(face => ({ face, data: new Uint8Array(4).fill(200) }))
  } as never);
}

describe("WebGPU environment background", () => {
  for (const [name, library] of [["lean", createLeanCoreShaderLibrary], ["prd02", createPrd02EnvironmentBackgroundShaderLibrary]] as const) {
    it(`draws equirect and cubemap backgrounds natively (${name} library)`, async () => {
      const f = await nativeFixture();
      try {
        f.device.beginFrame(4, 4);
        f.device.setRenderTarget(f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false }));
        const shaderLibrary = library();
        new EnvironmentBackgroundPass({ ...equirect(), inverseViewProjectionMatrix: IDENTITY, shaderLibrary }).execute({ device: f.device, width: 4, height: 4 } as RenderPassContext);
        new EnvironmentBackgroundPass({ ...cubemap(), inverseViewProjectionMatrix: IDENTITY, shaderLibrary }).execute({ device: f.device, width: 4, height: 4 } as RenderPassContext);
        f.device.endFrame?.();
        const recorded = draws(f);
        expect(recorded.map(draw => draw.vertices)).toEqual([3, 3]);
        const fragment = recorded[0]!.pipeline!.descriptor.fragment.module.code;
        expect(fragment).toContain("var u_environmentBackgroundTextureTexture: texture_2d<f32>");
        expect(fragment).toContain("var u_environmentBackgroundCubeTextureTexture: texture_cube<f32>");
        expect(fragment).toContain("@aura3d-shader:environment-background");
        expect(fragment).not.toContain("@aura3d-bindings");
        expect(fragment.includes("aura.u_environmentBackgroundLod")).toBe(name === "prd02");
        // uniform buffer + (sampler, view) for each of the two textures
        expect(recorded[0]!.group!.entries.map(entry => entry.binding)).toEqual([0, 1, 2, 3, 4]);
        // The unused cube slot of the equirect draw is a 1x1 six-layer fallback.
        expect(f.textures.some(texture => texture.label === "aura3d-native-empty-probe-cube")).toBe(true);
      } finally {
        f.device.dispose();
      }
    });
  }

  it("keeps the WebGL2 background program on GLSL", () => {
    const device = new MockRenderDevice();
    const sources: ShaderSources[] = [];
    const create = device.createShaderProgram.bind(device);
    device.createShaderProgram = (source: ShaderSources) => { sources.push(source); return create(source); };
    try {
      device.beginFrame(2, 2);
      new EnvironmentBackgroundPass({ ...equirect(), inverseViewProjectionMatrix: IDENTITY }).execute({ device, width: 2, height: 2 } as RenderPassContext);
      expect(sources[0]!.vertex).toContain("#version 300 es");
      expect(device.drawCommands).toHaveLength(1);
    } finally {
      device.dispose();
    }
  });
});

describe("WebGPU gradient sky clouds", () => {
  const cloudy = () => (sky.gradient({ zenith: "#2860a0", horizon: "#b0c0e0", ground: "#405020", clouds: { coverage: 0.3, speed: 0.4, color: "#fbe9db" } })
    .toJSON() as unknown as { spec: Readonly<Record<string, unknown>> }).spec;

  it("compiles the cloud variant with the cloud uniforms instead of rejecting it", async () => {
    const f = await nativeFixture();
    const pass = new SkyBackgroundPass(f.device);
    try {
      f.device.beginFrame(2, 2);
      f.device.setRenderTarget(f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false }));
      pass.setSpec(cloudy(), 2);
      pass.drawSky(IDENTITY);
      const recorded = draws(f);
      expect(recorded).toHaveLength(1);
      const fragment = recorded[0]!.pipeline!.descriptor.fragment.module.code;
      expect(fragment).toContain("fn skyApplyClouds");
      expect(fragment).toContain("color = skyApplyClouds(color * aura.u_intensity, direction)");
      for (const name of ["u_time", "u_cloudCoverage", "u_cloudDensity", "u_cloudElevation", "u_cloudScaleSpeed", "u_cloudTint"]) {
        expect(fragment).toContain(name);
      }
    } finally {
      pass.dispose();
      f.device.dispose();
    }
  });
});

describe("WebGPU light beam", () => {
  const context = (blackboard = new Map<string, unknown>()) => ({
    camera: { position: [0, 0, 5], viewProjectionMatrix: IDENTITY },
    timeSeconds: 1,
    blackboard,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false }
  }) as unknown as FrameContributorContext;

  it("draws light beams and aurora curtains with the WGSL twin", async () => {
    const f = await nativeFixture();
    const pass = new BeamPass(f.device);
    try {
      f.device.beginFrame(4, 4);
      f.device.setRenderTarget(f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: true }));
      const items = pass.transparentItems([
        { nodeId: "beam", kind: "light-beam", color: [1, 0.9, 0.6, 1], intensity: 2, from: [0, 2, 0], to: [0, 0, 0], widthWorld: 0.5 },
        { nodeId: "aurora", kind: "auroraRibbon", color: [0.2, 1, 0.5, 1], intensity: 1, width: 4, height: 2, segments: 8, sway: 0.3, shimmer: 0.5 }
      ], context());
      for (const item of items) item.draw(context());
      f.device.endFrame?.();
      const recorded = draws(f);
      expect(recorded).toHaveLength(2);
      const beamFragment = recorded[0]!.pipeline!.descriptor.fragment.module.code;
      const auroraFragment = recorded[1]!.pipeline!.descriptor.fragment.module.code;
      const beamVertex = recorded[0]!.pipeline!.descriptor.vertex.module.code;
      expect(beamVertex).toContain("@location(4) a_color: vec4<f32>");
      // GL clip depth is remapped into WebGPU's [0, w] (zero-to-one reversed frames pass it through).
      expect(beamVertex).toContain("override a3dZeroToOneProjection: bool = false;");
      expect(beamVertex).toContain("select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection)");
      expect(beamFragment).toContain("prd07-beam-v1");
      expect(beamFragment).not.toContain("u_sceneDepthTexture");
      expect(beamFragment).not.toContain("curtain folds");
      expect(auroraFragment).toContain("curtain folds");
    } finally {
      (pass as { dispose?: () => void }).dispose?.();
      f.device.dispose();
    }
  });

  it("keeps the WebGL2 beam program on GLSL", () => {
    const device = new MockRenderDevice();
    const sources: ShaderSources[] = [];
    const create = device.createShaderProgram.bind(device);
    device.createShaderProgram = (source: ShaderSources) => { sources.push(source); return create(source); };
    const pass = new BeamPass(device);
    try {
      device.beginFrame(2, 2);
      for (const item of pass.transparentItems([{ nodeId: "beam", kind: "light-beam", color: [1, 1, 1, 1], intensity: 1, from: [0, 1, 0], to: [0, 0, 0] }], context())) item.draw(context());
      expect(sources[0]!.webgpu).toBeUndefined();
      expect(sources[0]!.portableBindings).toBeUndefined();
    } finally {
      (pass as { dispose?: () => void }).dispose?.();
      device.dispose();
    }
  });
});
