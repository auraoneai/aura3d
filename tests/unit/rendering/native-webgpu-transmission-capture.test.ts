import { describe, expect, it, vi } from "vitest";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Texture } from "../../../packages/rendering/src/Texture";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import "../../../packages/rendering/src/lanes/prd04";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { GENERATED_PBR_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { TRANSMISSION_COPY_FRAGMENT, TRANSMISSION_COPY_MARKER, TRANSMISSION_COPY_VERTEX } from "../../../packages/rendering/src/shaders/physical/transmission_copy.glsl";
import { TRANSMISSION_COPY_WGSL_FRAGMENT, TRANSMISSION_COPY_WGSL_VERTEX } from "../../../packages/rendering/src/shaders/physical/transmission_copy.wgsl";

async function fixture(render = true, options: { readonly noLayout?: boolean; readonly noSetBindGroup?: boolean } = {}) {
  let finish!: () => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  const textures: { descriptor: { label?: string; format: string; mipLevelCount?: number }; destroy: ReturnType<typeof vi.fn>; createView(descriptor?: object): unknown }[] = [];
  const groups: { entries: readonly { binding: number; resource: unknown }[] }[] = [];
  const layouts: { readonly entries: readonly { readonly binding: number; readonly texture?: { readonly sampleType?: string; readonly multisampled?: boolean } }[] }[] = [];
  const passes: { colorAttachments: readonly { view: unknown }[] }[] = [];
  const shaderCode: string[] = [];
  const drawInstances: number[] = [];
  const writes = new Map<string, Uint8Array>();
  const buffers: { label?: string; destroy: ReturnType<typeof vi.fn> }[] = [];
  let failSubmit = false;
  const native = {
    queue: { writeBuffer(buffer: { label?: string }, _offset: number, data: ArrayBuffer | ArrayBufferView) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (buffer.label) writes.set(buffer.label, Uint8Array.from(bytes));
    }, writeTexture() {}, submit: vi.fn(() => { if (failSubmit) { failSubmit = false; throw new Error("injected submit failure"); } }), onSubmittedWorkDone: () => fence },
    createBuffer: ({ label }: { label?: string }) => { const buffer = { label, destroy: vi.fn() }; buffers.push(buffer); return buffer; },
    createTexture(descriptor: { label?: string; format: string; mipLevelCount?: number }) {
      const texture = { descriptor, destroy: vi.fn(), createView: (view?: object) => ({ texture, view }) };
      textures.push(texture); return texture;
    },
    createShaderModule: ({ code }: { code: string }) => { shaderCode.push(code); return {}; }, createSampler: () => ({}),
    ...(render ? {
      createBindGroupLayout: (descriptor: { readonly entries: readonly { readonly binding: number; readonly texture?: { readonly sampleType?: string; readonly multisampled?: boolean } }[] }) => { layouts.push(descriptor); return descriptor; },
      createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: () => options.noLayout ? {} : ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup(group: { entries: readonly { binding: number; resource: unknown }[] }) { groups.push(group); return group; },
      createCommandEncoder: () => ({
        beginRenderPass(pass: { colorAttachments: readonly { view: unknown }[] }) {
          passes.push(pass); return { setPipeline() {}, ...(options.noSetBindGroup ? {} : { setBindGroup() {} }), setVertexBuffer() {}, setViewport() {}, draw(_vertices: number, instances: number) { drawInstances.push(instances); }, end() {} };
        }, finish: () => ({})
      })
    } : {}),
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  return { device, native, textures, groups, layouts, passes, shaderCode, writes, buffers, drawInstances, finish, failNextSubmit: () => { failSubmit = true; } };
}

function copyShader(device: WebGPUDevice) {
  return device.createShaderProgram({ label: "transmission-copy", marker: TRANSMISSION_COPY_MARKER,
    vertex: TRANSMISSION_COPY_VERTEX, fragment: TRANSMISSION_COPY_FRAGMENT,
    webgpu: { vertex: TRANSMISSION_COPY_WGSL_VERTEX, fragment: TRANSMISSION_COPY_WGSL_FRAGMENT },
    portableBindings: [{ name: "u_source", kind: "texture2d", required: true }] });
}

describe("WebGPU transmission capture device contract", () => {
  it("reports persistent default output overrides without confusing frame-scoped view state", async () => {
    const f = await fixture();
    expect(f.device.hasDefaultOutputOverride()).toBe(false);
    f.device.setViewport(1, 1, 2, 2, { persistent: true });
    expect(f.device.hasDefaultOutputOverride()).toBe(true);
    f.device.beginFrame(4, 4);
    expect(f.device.hasDefaultOutputOverride()).toBe(true);
    f.device.resetViewport();
    expect(f.device.hasDefaultOutputOverride()).toBe(false);
    f.device.setScissor(0, 0, 2, 2); f.device.setScissorTest(true);
    expect(f.device.hasDefaultOutputOverride()).toBe(false);
    f.device.setScissorTest(false);
    const target = f.device.createRenderTarget({ width: 4, height: 4, depth: false });
    f.device.setRenderTarget(target); f.device.setViewport(0, 0, 2, 2);
    expect(f.device.hasDefaultOutputOverride()).toBe(false);
    f.device.setRenderTarget(null); f.device.setViewport(0, 0, 2, 2);
    expect(f.device.hasDefaultOutputOverride()).toBe(false);
    f.device.endFrame();
    expect(f.device.hasDefaultOutputOverride()).toBe(false);
    f.device.dispose(); f.finish();
  });

  it("binds a separate multisampled depth alias only to the matching depth layout and holds it through submission", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ label: "msaa-depth-source", width: 2, height: 2, depth: true, sampleCount: 4 });
    const output = f.device.createRenderTarget({ width: 2, height: 2, depth: "texture", sampleCount: 1 });
    const alias = source.multisampledDepthTexture!;
    expect(alias).toBeDefined(); expect(source.depthTexture).toBeUndefined(); expect(output.multisampledDepthTexture).toBeUndefined();
    const makeShader = (kind: "depth2d" | "depth2d-multisampled") => f.device.createShaderProgram({ label: `copy-${kind}`, marker: "depth-alias-test",
      vertex: "// depth-alias-test\nin vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }",
      fragment: "// depth-alias-test\nvoid main() {}",
      webgpu: { vertex: "/* @aura3d-bindings */\n@vertex fn vs_main(@location(0) p: vec2f) -> @builtin(position) vec4f { return vec4f(p, 0.0, 1.0); }",
        fragment: "/* @aura3d-bindings */\n@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f { return vec4f(textureLoad(u_depthTexture, vec2i(p.xy), 0)); }" },
      portableBindings: [{ name: "u_depth", kind, required: true }] });
    const multisampled = makeShader("depth2d-multisampled"), single = makeShader("depth2d");
    const vertices = f.device.createBuffer("vertex", 24);
    const withTexture = (texture: Texture) => new Map([["u_depth", new TextureBinding({ name: "u_depth", texture })]]);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexCount: 3, shader: multisampled, uniforms: withTexture(alias) };
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source);
    expect(() => f.device.drawChecked(draw)).toThrow(/attached for writing/);
    f.device.setRenderTarget(output);
    const nativeDepth = f.textures.find(value => value.descriptor.label === "msaa-depth-source-depth")!;
    f.device.drawChecked(draw);
    expect(f.shaderCode.some(code => code.includes("var u_depthTexture: texture_depth_multisampled_2d"))).toBe(true);
    expect(f.layouts.some(layout => layout.entries.some(entry => entry.binding === 1 && entry.texture?.sampleType === "depth" && entry.texture.multisampled === true))).toBe(true);
    expect(f.groups.at(-1)!.entries.find(entry => entry.binding === 1)!.resource).toEqual({ texture: nativeDepth, view: { aspect: "depth-only" } });
    expect(() => f.device.drawChecked({ ...draw, shader: single })).toThrow(/matching same-device sampleable depth/i);
    expect(() => f.device.drawChecked({ ...draw, uniforms: withTexture(output.depthTexture!) })).toThrow(/attached for writing|matching same-device sampleable depth/i);
    const other = await fixture();
    const foreign = other.device.createRenderTarget({ width: 2, height: 2, depth: true, sampleCount: 4 });
    expect(() => f.device.drawChecked({ ...draw, uniforms: withTexture(foreign.multisampledDepthTexture!) })).toThrow(/matching same-device sampleable depth/i);
    f.device.endFrame(); source.dispose();
    expect(alias.disposed).toBe(true); expect(nativeDepth.destroy).not.toHaveBeenCalled();
    f.finish(); await Promise.resolve(); await Promise.resolve();
    expect(nativeDepth.destroy).toHaveBeenCalledOnce();
    f.device.dispose(); other.device.dispose(); other.finish();
  });

  it("submits the scaled copy, creates disjoint mip views, and samples the generated full chain", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ label: "opaque", width: 8, height: 8, format: "rgba16f", depth: false });
    const target = f.device.createRenderTarget({ label: "transmission", width: 4, height: 4, format: "rgba16f", depth: false, mipLevelCount: 3 });
    const nativeTarget = f.textures.find(texture => texture.descriptor.label === "transmission")!;
    expect(nativeTarget.descriptor.mipLevelCount).toBe(3);
    expect(target.colorTexture.mipLevelCount).toBe(3);
    expect(() => f.device.getNativeTexture(target.colorTexture)).toThrow(/mip chain/);
    const shader = copyShader(f.device), vertices = f.device.createBuffer("vertex", 24);
    f.device.beginFrame(8, 8); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
    f.device.drawTransmissionCapture({ label: "transmission-copy", topology: "triangles", vertexBuffer: vertices, vertexCount: 3, shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) });
    expect(f.passes.at(-1)!.colorAttachments[0]!.view).toMatchObject({ texture: nativeTarget, view: { baseMipLevel: 0, mipLevelCount: 1 } });
    const countBeforeMip = f.native.queue.submit.mock.calls.length;
    f.device.generateRenderTargetMipmaps(target);
    expect(f.native.queue.submit.mock.calls.length - countBeforeMip).toBe(2);
    const mipViews = f.passes.slice(-2).map(pass => pass.colorAttachments[0]!.view);
    expect(mipViews).toEqual([
      { texture: nativeTarget, view: { baseMipLevel: 1, mipLevelCount: 1 } },
      { texture: nativeTarget, view: { baseMipLevel: 2, mipLevelCount: 1 } }
    ]);
    const mipSources = f.groups.slice(-2).map(group => group.entries.find(entry => entry.binding === 2)!.resource);
    expect(mipSources).toEqual([
      { texture: nativeTarget, view: { baseMipLevel: 0, mipLevelCount: 1 } },
      { texture: nativeTarget, view: { baseMipLevel: 1, mipLevelCount: 1 } }
    ]);
    expect(f.device.getNativeTexture(target.colorTexture)).toBe(nativeTarget);
    const odd = f.device.createRenderTarget({ label: "odd-mips", width: 3, height: 3, format: "rgba16f", depth: false, mipLevelCount: 2 });
    f.device.generateRenderTargetMipmaps(odd);
    expect(f.shaderCode.some(code => code.includes("textureLoad(source, p, 0) * weight") && code.includes("min(hi.x, f32(p.x + 1))"))).toBe(true);
    expect(f.device.getNativeTexture(odd.colorTexture)).toBe(f.textures.find(texture => texture.descriptor.label === "odd-mips"));
    odd.dispose();
    f.device.setRenderTarget(source);
    const pbrFeatures = normalizeProgramFeatures({ lighting: "lit", maps: {}, environment: "none",
      extensions: [{ lobe: "transmission", bits: { map: false }, maps: [] }], features: { "prd04.transmissionTarget": true } });
    const generated = generateProgramImpl(pbrFeatures, { flags: { values: {}, on: () => true } });
    const pbr = f.device.createShaderProgram({ label: "refractive-pbr", marker: GENERATED_PROGRAM_MARKER, vertex: generated.vertex,
      fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const dfg = new Texture({ width: 1, height: 1, format: "rgba16f", colorSpace: "linear", data: new Uint16Array(4), generateMipmaps: false });
    const frame = f.device.createBuffer("uniform", 304, new Float32Array(76));
    const pbrVertices = f.device.createBuffer("vertex", 72);
    f.device.bindUniformBuffer(frame, 0);
    const pbrUniforms = new Map<string, import("../../../packages/rendering/src/RenderDevice").UniformValue>([
      ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["a3d_prd04_transmissionSampler", new TextureBinding({ name: "a3d_prd04_transmissionSampler", texture: target.colorTexture, sampler: Sampler.trilinear({ wrap: "clamp" }) })],
      ["a3d_prd04_transmissionSamplerSize", [4, 4]], ["u_transmissionFactor", 0.7]
    ]);
    const pbrDraw = { topology: "triangles" as const, vertexBuffer: pbrVertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader: pbr, uniforms: pbrUniforms };
    f.device.setViewport(2, 1, 4, 3);
    f.device.draw(pbrDraw);
    const packed = f.writes.get("draw-generated-pbr-material")!;
    const packedView = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect([0, 1, 2, 3].map(index => packedView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.transmissionViewport! + index * 4, true))).toEqual([0.25, 0.125, 0.5, 0.375]);
    expect(f.shaderCode.some(code => code.includes("material.transmissionViewport.xy + (clip.xy / w"))).toBe(true);
    expect(f.groups.at(-2)!.entries.find(entry => entry.binding === 55)!.resource).toEqual({ texture: nativeTarget, view: undefined });
    const badCapture = new Map(pbrUniforms); badCapture.set("a3d_prd04_transmissionSamplerSize", [2, 2]);
    expect(() => f.device.draw({ ...pbrDraw, uniforms: badCapture })).toThrow(/complete, live trilinear/);
    const badVolume = new Map(pbrUniforms); badVolume.set("u_volumeThicknessFactor", 1);
    expect(() => f.device.draw({ ...pbrDraw, uniforms: badVolume })).toThrow(/refractive transmission/);
    const mappedFeatures = normalizeProgramFeatures({ ...pbrFeatures, extensions: [
      { lobe: "transmission", bits: { map: true }, maps: ["transmission"], mapUvSets: { transmission: 1 } },
      { lobe: "volume", bits: { thicknessMap: true }, maps: ["volumeThickness"], mapUvSets: { volumeThickness: 0 } },
      { lobe: "dispersion", bits: {}, maps: [] }
    ] });
    const mappedGenerated = generateProgramImpl(mappedFeatures, { flags: { values: {}, on: () => true } });
    const mappedShader = f.device.createShaderProgram({ label: "mapped-volume", marker: GENERATED_PROGRAM_MARKER, vertex: mappedGenerated.vertex,
      fragment: mappedGenerated.fragment, generatedProgram: mappedGenerated.descriptor! });
    const dataMap = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 128, 0, 255]), colorSpace: "linear", generateMipmaps: false });
    const mappedUniforms = new Map(pbrUniforms);
    mappedUniforms.set("u_transmissionTexture", new TextureBinding({ name: "u_transmissionTexture", texture: dataMap }));
    mappedUniforms.set("u_volumeThicknessTexture", new TextureBinding({ name: "u_volumeThicknessTexture", texture: dataMap }));
    mappedUniforms.set("u_volumeThicknessFactor", 1); mappedUniforms.set("u_volumeAttenuationDistance", Infinity); mappedUniforms.set("u_dispersion", 0.2);
    const mappedVertices = f.device.createBuffer("vertex", 168);
    f.device.draw({ ...pbrDraw, vertexBuffer: mappedVertices, vertexFormat: VertexFormat.P3N3T4T2T2, shader: mappedShader, uniforms: mappedUniforms });
    const mappedGroup = f.groups.at(-2)!;
    expect(mappedGroup.entries.map(entry => entry.binding)).toEqual([0, 3, 4, 54, 55, 59, 60, 61, 62]);
    expect((mappedGroup.entries.find(entry => entry.binding === 60)!.resource as { texture: unknown }).texture).toBe(f.device.getNativeTexture(dataMap));
    // Without a scoped capture the lobe draws without refraction (the WebGL2 program's A3D_TRANSMISSION guard).
    const degradedGenerated = generateProgramImpl(normalizeProgramFeatures({ ...mappedFeatures, features: {} }), { flags: { values: {}, on: () => true } });
    const degradedShader = f.device.createShaderProgram({ label: "degraded-transmission", marker: GENERATED_PROGRAM_MARKER, vertex: degradedGenerated.vertex,
      fragment: degradedGenerated.fragment, generatedProgram: degradedGenerated.descriptor! });
    const degradedUniforms = new Map(mappedUniforms); degradedUniforms.delete("a3d_prd04_transmissionSampler"); degradedUniforms.delete("a3d_prd04_transmissionSamplerSize");
    f.device.draw({ ...pbrDraw, vertexBuffer: mappedVertices, vertexFormat: VertexFormat.P3N3T4T2T2, shader: degradedShader, uniforms: degradedUniforms });
    expect(f.groups.at(-2)!.entries.map(entry => entry.binding).filter(binding => [54, 55, 59, 60, 61, 62].includes(binding))).toEqual([]);
    const instancedFeatures = normalizeProgramFeatures({ ...mappedFeatures, instancing: { color: false } });
    const instancedSources = generateProgramImpl(instancedFeatures, { flags: { values: {}, on: () => true } });
    const instancedShader = f.device.createShaderProgram({ label: "instanced-volume", marker: GENERATED_PROGRAM_MARKER, vertex: instancedSources.vertex,
      fragment: instancedSources.fragment, generatedProgram: instancedSources.descriptor! });
    const instanceData = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      -3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1
    ]);
    const instances = f.device.createBuffer("vertex", instanceData.byteLength, instanceData);
    const instanceAttributes = [0, 1, 2, 3].map(index => ({ shaderName: `a_instanceMatrix${index}`, buffer: instances, components: 4 as const, offset: index * 16, stride: 64, divisor: 1 }));
    const instancedUniforms = new Map(mappedUniforms);
    instancedUniforms.set("u_geometryMatrix", [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]);
    f.device.draw({ ...pbrDraw, vertexBuffer: mappedVertices, vertexFormat: VertexFormat.P3N3T4T2T2, shader: instancedShader,
      uniforms: instancedUniforms, instanceCount: 2, instanceAttributes });
    expect(f.drawInstances.at(-1)).toBe(2);
    expect(f.shaderCode.some(code => code.includes("let volumeWorld = material.model * localTransform") && code.includes("@interpolate(flat) volume0"))).toBe(true);
    expect(f.shaderCode.some(code => code.includes("mat3x3f(input.volume0, input.volume1, input.volume2)"))).toBe(true);
    const instancePacked = f.writes.get("draw-generated-pbr-material")!;
    const instanceView = new DataView(instancePacked.buffer, instancePacked.byteOffset, instancePacked.byteLength);
    expect([0, 5, 10].map(index => instanceView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.geometry! + index * 4, true))).toEqual([2, 3, 4]);
    const missingMap = new Map(mappedUniforms); missingMap.delete("u_volumeThicknessTexture");
    expect(() => f.device.draw({ ...pbrDraw, vertexBuffer: mappedVertices, vertexFormat: VertexFormat.P3N3T4T2T2, shader: mappedShader, uniforms: missingMap })).toThrow(/live sampled texture/);
    f.device.drawTransmissionCapture({ label: "sample-chain", topology: "triangles", vertexBuffer: vertices, vertexCount: 3, shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: target.colorTexture })]]) });
    expect(f.groups.at(-1)!.entries.find(entry => entry.binding === 2)!.resource).toEqual({ texture: nativeTarget, view: undefined });
    f.device.setRenderTarget(target);
    f.device.drawTransmissionCapture({ label: "rewrite-base", topology: "triangles", vertexBuffer: vertices, vertexCount: 3, shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) });
    expect(() => f.device.getNativeTexture(target.colorTexture)).toThrow(/mip chain/);
    f.device.endFrame(); target.dispose();
    expect(nativeTarget.destroy).not.toHaveBeenCalled();
    f.finish(); await Promise.resolve(); await Promise.resolve();
    expect(nativeTarget.destroy).toHaveBeenCalledOnce();
    f.device.dispose();
  });

  it("rejects failed or skipped copy and mip submissions, and requires float32 filtering", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false, mipLevelCount: 2 });
    const shader = copyShader(f.device), vertices = f.device.createBuffer("vertex", 24);
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexCount: 3, shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) };
    f.failNextSubmit();
    expect(() => f.device.drawTransmissionCapture(draw)).toThrow(/injected submit/);
    const failedUniform = f.buffers.find(buffer => buffer.label === "draw-portable-uniforms")!;
    expect(failedUniform.destroy).not.toHaveBeenCalled();
    f.finish(); await Promise.resolve(); await Promise.resolve();
    // A failed draw hands its per-draw uniform back to the device pool instead of destroying it.
    expect(failedUniform.destroy).not.toHaveBeenCalled();
    expect(() => f.device.getNativeTexture(target.colorTexture)).toThrow(/mip chain/);
    f.device.drawTransmissionCapture(draw);
    expect(f.buffers.filter(buffer => buffer.label === "draw-portable-uniforms")).toEqual([failedUniform]);
    f.failNextSubmit();
    expect(() => f.device.generateRenderTargetMipmaps(target)).toThrow(/injected submit/);
    expect(() => f.device.getNativeTexture(target.colorTexture)).toThrow(/mip chain/);
    const float = f.device.createRenderTarget({ width: 2, height: 2, depth: false, format: "rgba32f", mipLevelCount: 2 });
    expect(() => f.device.generateRenderTargetMipmaps(float)).toThrow(/float32-filterable/);
    expect(() => f.device.createRenderTarget({ width: 2, height: 2, mipLevelCount: 3 })).toThrow(/mip count/);
    expect(() => f.device.createRenderTarget({ width: 2, height: 2, sampleCount: 4, mipLevelCount: 2 })).toThrow(/single-sampled/);
    f.device.endFrame(); f.device.dispose(); f.finish();
    const skipped = await fixture(false);
    const skippedTarget = skipped.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const skippedShader = copyShader(skipped.device), buffer = skipped.device.createBuffer("vertex", 24);
    skipped.device.beginFrame(2, 2); skipped.device.setRenderTarget(skippedTarget);
    expect(() => skipped.device.drawTransmissionCapture({ topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader: skippedShader })).toThrow(/could not be submitted/);
    skipped.device.endFrame(); skipped.device.dispose(); skipped.finish();
  });

  it.each([{ noLayout: true }, { noSetBindGroup: true }])("refuses a checked portable draw without its bind group: %o", async options => {
    const f = await fixture(true, options);
    const source = f.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const target = f.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const shader = copyShader(f.device), buffer = f.device.createBuffer("vertex", 24);
    f.device.beginFrame(1, 1); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
    const before = f.native.queue.submit.mock.calls.length;
    expect(() => f.device.drawChecked({ topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) })).toThrow(/bind group|bind its resources/i);
    expect(f.native.queue.submit.mock.calls.length).toBe(before);
    const failedUniform = f.buffers.find(value => value.label === "draw-portable-uniforms")!;
    expect(failedUniform.destroy).not.toHaveBeenCalled();
    f.finish(); await Promise.resolve(); await Promise.resolve();
    // A failed draw hands its per-draw uniform back to the device pool instead of destroying it.
    expect(failedUniform.destroy).not.toHaveBeenCalled();
    f.device.endFrame(); f.device.dispose();
  });

  it("pools uniforms after a required portable texture or generated material binding is missing", async () => {
    const portable = await fixture();
    const target = portable.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const shader = copyShader(portable.device), vertices = portable.device.createBuffer("vertex", 24);
    portable.device.beginFrame(1, 1); portable.device.setRenderTarget(target);
    const submissions = portable.native.queue.submit.mock.calls.length;
    expect(() => portable.device.drawChecked({ topology: "triangles", vertexBuffer: vertices, vertexCount: 3, shader })).toThrow(/binding is unavailable/);
    const portableUniform = portable.buffers.find(value => value.label === "draw-portable-uniforms")!;
    expect(portable.native.queue.submit.mock.calls.length).toBe(submissions);
    expect(portableUniform.destroy).not.toHaveBeenCalled();
    portable.finish(); await Promise.resolve(); await Promise.resolve();
    // A failed draw hands its per-draw uniform back to the device pool instead of destroying it.
    expect(portableUniform.destroy).not.toHaveBeenCalled();
    portable.device.endFrame(); portable.device.dispose();

    const generated = await fixture(true, { noLayout: true });
    const generatedTarget = generated.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, environment: "none" });
    const sources = generateProgramImpl(features, { flags: { values: {}, on: () => true } });
    const material = generated.device.createShaderProgram({ label: "generated", marker: GENERATED_PROGRAM_MARKER,
      vertex: sources.vertex, fragment: sources.fragment, generatedProgram: sources.descriptor! });
    const pbrVertices = generated.device.createBuffer("vertex", 72);
    const frame = generated.device.createBuffer("uniform", 304, new Float32Array(76));
    generated.device.beginFrame(1, 1); generated.device.setRenderTarget(generatedTarget); generated.device.bindUniformBuffer(frame, 0);
    const before = generated.native.queue.submit.mock.calls.length;
    expect(() => generated.device.drawChecked({ topology: "triangles", vertexBuffer: pbrVertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader: material })).toThrow(/bind its material/);
    const generatedUniform = generated.buffers.find(value => value.label === "draw-generated-pbr-material")!;
    expect(generated.native.queue.submit.mock.calls.length).toBe(before);
    expect(generatedUniform.destroy).not.toHaveBeenCalled();
    generated.finish(); await Promise.resolve(); await Promise.resolve();
    // A failed draw hands its per-draw uniform back to the device pool instead of destroying it.
    expect(generatedUniform.destroy).not.toHaveBeenCalled();
    generated.device.endFrame(); generated.device.dispose();
  });
});
