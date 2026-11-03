import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Scene } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime, type GLTFSceneAnimationMaterialSink } from "../../../packages/assets/src/GLTFAnimationRuntime";
import "../../../packages/rendering/src/lanes/prd01";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { GENERATED_PBR_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

// These mocks capture backend submissions; they do not compile or execute the
// shaders, and do not establish browser, driver, or pixel correctness. The actor
// bridge is covered separately: this test exercises the runtime sink ABI through
// actual material binding, forward submission, and native device uploads.
const materialName = "Coat.Metal.Blue";
const samples = [
  { time: 0, normal: 0.2, occlusion: 0.8 },
  { time: 0.25, normal: 0.5, occlusion: 0.65 },
  { time: 0.75, normal: 1.1, occlusion: 0.35 }
] as const;

function animatedMaterial() {
  const normal = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]), generateMipmaps: false });
  const occlusion = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([120, 120, 120, 255]), generateMipmaps: false });
  const material = new TexturedPBRMaterial({ normalTexture: normal, occlusionTexture: occlusion, normalScale: 0.2, occlusionStrength: 0.8 });
  const geometry = new Geometry(new VertexBuffer(VertexFormat.P3N3T4T2, 3));
  const tracks = [
    new AnimationTrack({ target: `material:${materialName}.normalTexture.scale`, valueType: "scalar",
      keyframes: [{ time: 0, value: 0.2 }, { time: 1, value: 1.4 }] }),
    new AnimationTrack({ target: `material:${materialName}.occlusionTexture.strength`, valueType: "scalar",
      keyframes: [{ time: 0, value: 0.8 }, { time: 1, value: 0.2 }] })
  ];
  const clip = new AnimationClip({ name: "detail", tracks });
  const sink: GLTFSceneAnimationMaterialSink = {
    name: materialName,
    setAnimationParameter() { throw new Error("pointer detail tracks must use the validated material sink"); },
    animationParameterStatus(parameter) {
      return parameter === "u_normalScale" || parameter === "u_occlusionStrength" ? "available" : "unsupported";
    },
    applyAnimationParameter(parameter, value) {
      if (parameter !== "u_normalScale" && parameter !== "u_occlusionStrength") return "unsupported";
      material.setParameter(parameter, value);
      return "applied";
    }
  };
  const runtime = createGLTFSceneAnimationRuntime({ scene: new Scene(), clips: [clip],
    resolveAnimationMaterial: name => name === materialName ? sink : undefined });
  return { material, geometry, normal, occlusion, runtime,
    sample(time: number) {
      const result = runtime.applyClipByName("detail", time);
      expect(result.materialTracksApplied).toBe(2);
      expect(result.missingTargets).toEqual([]);
    },
    dispose() { runtime.dispose(); geometry.dispose(); material.dispose(); normal.dispose(); occlusion.dispose(); } };
}

function enableGeneratedPbr(device: WebGL2Device | WebGPUDevice) {
  setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_MATERIALS: true }), device);
}

function webglHarness() {
  const constants = new Map<string, number>();
  const constant = (name: string) => {
    if (!constants.has(name)) constants.set(name, constants.size + 1);
    return constants.get(name)!;
  };
  const values = new Map<string, number>();
  const drawValues: Map<string, number>[] = [];
  const shaderSources: string[] = [];
  const attributes = ["a_position", "a_normal", "a_uv", "a_tangent"];
  const uniforms = ["u_normalScale", "u_occlusionStrength", "u_normalMap", "u_occlusionMap"];
  let currentProgram: unknown = null;
  let nextId = 0;
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name === "NO_ERROR") return 0;
    if (name === "getError") return () => 0;
    if (name === "getExtension") return () => null;
    if (name === "isContextLost" || name === "isEnabled") return () => false;
    if (name === "getContextAttributes") return () => ({ alpha: false, premultipliedAlpha: false });
    if (name === "getParameter") return (parameter: number) => {
      if (parameter === constant("CURRENT_PROGRAM")) return currentProgram;
      if (parameter === constant("ACTIVE_TEXTURE")) return constant("TEXTURE0");
      return 32;
    };
    if (name === "useProgram") return (program: unknown) => { currentProgram = program; };
    if (name === "shaderSource") return (_shader: unknown, source: string) => { shaderSources.push(source); };
    if (name === "getShaderParameter") return () => true;
    if (name === "getProgramParameter") return (_program: unknown, parameter: number) => {
      if (parameter === constant("LINK_STATUS")) return true;
      if (parameter === constant("ACTIVE_ATTRIBUTES")) return attributes.length;
      if (parameter === constant("ACTIVE_UNIFORMS")) return uniforms.length;
      return 0;
    };
    if (name === "getActiveAttrib") return (_program: unknown, index: number) => ({ name: attributes[index], size: 1, type: constant("FLOAT") });
    if (name === "getAttribLocation") return (_program: unknown, attribute: string) => attributes.indexOf(attribute);
    if (name === "getActiveUniform") return (_program: unknown, index: number) => ({ name: uniforms[index], size: 1,
      type: constant(index < 2 ? "FLOAT" : "SAMPLER_2D") });
    if (name === "getUniformBlockIndex") return () => constant("INVALID_INDEX");
    if (name === "getUniformLocation") return (_program: unknown, uniform: string) => uniform;
    if (name === "uniform1f" || name === "uniform1i") return (uniform: string, value: number) => { values.set(uniform, value); };
    if (name === "drawArrays" || name === "drawElements") return () => { drawValues.push(new Map(values)); };
    if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
    if (name.startsWith("create")) return () => ({ id: ++nextId });
    return () => undefined;
  } }) as unknown as WebGL2RenderingContext;
  const canvas = { width: 8, height: 8, getContext: () => gl, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  enableGeneratedPbr(device);
  return { device, drawValues, shaderSources };
}

interface MockGroup { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }
interface MockBuffer { readonly descriptor: { readonly label?: string }; destroy(): void }
interface MockCommand { readonly label: string; readonly draws: readonly MockGroup[] }

async function webgpuHarness() {
  const writes = new Map<MockBuffer, Uint8Array>();
  const modules: { readonly code: string }[] = [];
  const submitted: MockCommand[] = [];
  const native = {
    queue: {
      submit(commands: readonly MockCommand[]) { submitted.push(...commands); },
      onSubmittedWorkDone: async () => undefined,
      writeBuffer(buffer: MockBuffer, _offset: number, data: ArrayBufferView) {
        writes.set(buffer, new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
      },
      writeTexture() {}
    },
    createBuffer: (descriptor: { label?: string }) => ({ descriptor, destroy() {} }),
    createTexture(descriptor: object) {
      const texture = { descriptor, destroy() {}, createView: () => ({ texture }) };
      return texture;
    },
    createShaderModule(module: { readonly code: string }) { modules.push(module); return module; },
    createSampler: () => ({}), createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup: (group: MockGroup) => group,
    createCommandEncoder(descriptor: { label: string }) {
      const draws: MockGroup[] = [];
      return {
        beginRenderPass() {
          let materialGroup: MockGroup | undefined;
          const draw = () => {
            if (!materialGroup) throw new Error("native draw did not bind its material group");
            draws.push(materialGroup);
          };
          return { setPipeline() {}, setBindGroup(index: number, group: MockGroup) { if (index === 0) materialGroup = group; },
            setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw, drawIndexed: draw, end() {} };
        },
        finish: () => ({ label: descriptor.label, draws })
      };
    },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  enableGeneratedPbr(device);
  return { device, writes, modules, submitted };
}

describe("material pointer animation backend bindings", () => {
  it("uploads sampled material values to active WebGL uniforms on successive draws", () => {
    const f = webglHarness();
    const input = animatedMaterial();
    try {
      f.device.beginFrame(8, 8);
      for (const sample of samples) {
        input.sample(sample.time);
        new ForwardPass({ items: [{ label: "pointer-draw", geometry: input.geometry, material: input.material }] })
          .execute({ device: f.device, width: 8, height: 8 });
      }
      expect(f.drawValues).toHaveLength(samples.length);
      for (let index = 0; index < samples.length; index += 1) {
        const draw = f.drawValues[index]!;
        expect(draw.get("u_normalScale")).toBeCloseTo(samples[index]!.normal);
        expect(draw.get("u_occlusionStrength")).toBeCloseTo(samples[index]!.occlusion);
        expect(draw.has("u_normalMap")).toBe(true);
        expect(draw.has("u_occlusionMap")).toBe(true);
        expect(draw.get("u_normalMap")).not.toBe(draw.get("u_occlusionMap"));
      }
      expect(f.shaderSources.some(source => source.includes("u_normalScale") && source.includes("u_occlusionStrength"))).toBe(true);
      f.device.endFrame();
    } finally { input.dispose(); f.device.dispose(); }
  });

  it("uploads sampled values and both actual texture bindings to native WebGPU PBR draws", async () => {
    const f = await webgpuHarness();
    const input = animatedMaterial();
    const target = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: true });
    try {
      f.device.beginFrame(8, 8);
      f.device.setRenderTarget(target);
      for (const sample of samples) {
        input.sample(sample.time);
        const previousSubmissions = f.submitted.length;
        new ForwardPass({ items: [{ label: "pointer-draw", geometry: input.geometry, material: input.material }] })
          .execute({ device: f.device, width: 8, height: 8 });
        expect(f.submitted.length).toBeGreaterThan(previousSubmissions);
        const draws = f.submitted.slice(previousSubmissions).flatMap(command => command.draws);
        expect(draws).toHaveLength(1);
        const group = draws[0]!;
        const materialBuffer = (group.entries.find(entry => entry.binding === 0)!.resource as { readonly buffer: MockBuffer }).buffer;
        expect(materialBuffer.descriptor.label).toBe("pointer-draw-generated-pbr-material");
        const bytes = f.writes.get(materialBuffer);
        expect(bytes).toBeDefined();
        const packed = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
        expect(packed.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.normalControls! + 4, true)).toBeCloseTo(sample.normal);
        expect(packed.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.coreMapControls! + 12, true)).toBeCloseTo(sample.occlusion);
        expect((group.entries.find(entry => entry.binding === 21)!.resource as { texture: unknown }).texture).toBe(f.device.getNativeTexture(input.normal));
        expect((group.entries.find(entry => entry.binding === 25)!.resource as { texture: unknown }).texture).toBe(f.device.getNativeTexture(input.occlusion));
      }
      expect(f.modules.some(module => module.code.includes("material.normalControls.y") && module.code.includes("material.coreMapControls.w"))).toBe(true);
      f.device.endFrame();
    } finally { target.dispose(); input.dispose(); f.device.dispose(); }
  });
});
