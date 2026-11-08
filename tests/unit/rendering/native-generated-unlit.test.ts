import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { createClippingBinding, createClippingUniforms } from "../../../packages/rendering/src/ClippingPlanes";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { GENERATED_PROGRAM_MARKER, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import {
  createGeneratedUnlitProgram, GENERATED_UNLIT_MATERIAL_OFFSETS, packGeneratedUnlitMaterialUniforms
} from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { GENERATED_PBR_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

function generated(primitive: "triangles" | "lines" | "points" = "triangles", options: Parameters<typeof normalizeProgramFeatures>[0] = {}) {
  return generateProgramImpl(normalizeProgramFeatures({ ...options, lighting: "unlit",
    features: { ...options?.features, "a3d.nativePrimitive": primitive } }));
}

describe("native generated unlit source", () => {
  it("specializes transformed vertex colors, maps, clipping and fog from the producer descriptor", () => {
    const source = generated("lines", { vertexColors: true, alphaMode: "mask", fog: "height", instancing: { color: true },
      maps: { baseColor: { uvSet: 1, transform: true }, emissive: { uvSet: 0, transform: true } },
      features: { "a3d.clipping": true, "a3d.output.srgb": true } });
    const program = createGeneratedUnlitProgram(source.descriptor!);
    expect(program.primitive).toBe("lines");
    expect(program.requiredVertexLocations).toEqual([0, 2, 4, 7]);
    expect(program.requiredInstanceLocations).toEqual([8, 9, 10, 11, 12]);
    expect(program.resources.map(resource => [resource.uniform, resource.samplerBinding, resource.textureBinding]))
      .toEqual([["u_baseColorMap", 1, 2], ["u_emissiveMap", 3, 4]]);
    expect(program.vertex).toContain("material.model * mat4x4f(instance0, instance1, instance2, instance3) * local");
    expect(program.vertex).toContain("let local = material.geometry * vec4f(position, 1.0)");
    expect(program.fragment).toContain("generatedUnlitMapUv(input.uv1, material.baseUv, material.mapControls.x)");
    expect(program.fragment).toContain("generatedUnlitClipRetains(input.world, input.local)");
    expect(program.fragment).toContain("exp(-max(input.world.y, 0.0) * material.fogParams.w)");
    expect(program.fragment).toContain("generatedUnlitEncodeOutput(color)");
  });

  it("stages point source but rejects nonselected, unknown and inconsistent structural variants", () => {
    const point = createGeneratedUnlitProgram(generated("points").descriptor!);
    expect(point).toMatchObject({ primitive: "points", rasterTopology: "triangles", point: { attenuated: false, mapped: false, round: false } });
    const source = generated();
    const missingPrimitive = { ...source.descriptor!, features: { ...source.descriptor!.features, features: {} } };
    expect(() => createGeneratedUnlitProgram(missingPrimitive)).toThrow(/primitive undefined/);
    const unknown = generated("triangles", { features: { "prd15.paritySprite": true } });
    expect(() => createGeneratedUnlitProgram(unknown.descriptor!)).toThrow(/paritySprite/);
    const malformed = { ...source.descriptor!, defines: { ...source.descriptor!.defines, A3D_CLIPPING: true as const } };
    expect(() => createGeneratedUnlitProgram(malformed)).toThrow(/A3D_CLIPPING/);
    const extra = { ...source.descriptor!, activeFeatures: [{ id: "custom.material", value: true }] };
    expect(() => createGeneratedUnlitProgram(extra)).toThrow(/contributor/);
  });

  it("packs the real clipping and UV values at the WGSL uniform offsets", () => {
    const clipping = createClippingBinding({ backend: "webgpu", global: { planes: [[1, 0, 0, -2]] },
      material: { space: "local", combine: "union", planes: [[0, 1, 0, 0], [0, 0, 1, 0]] } });
    const uniforms = new Map<string, UniformValue>(createClippingUniforms(clipping));
    uniforms.set("u_baseColorTextureOffset", [0.25, 0.5]);
    uniforms.set("u_baseColorTextureScale", [2, 3]);
    const bytes = packGeneratedUnlitMaterialUniforms(uniforms);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipControl!, true)).toBe(2);
    expect([0, 1, 2, 3].map(index => view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipGroups! + 16 + index * 4, true))).toEqual([1, 2, 1, 1]);
    expect(view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipPlanes! + 12, true)).toBe(-2);
    expect([0, 1, 2, 3].map(index => view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.baseUv! + index * 4, true))).toEqual([0.25, 0.5, 2, 3]);
    uniforms.set("u_alphaCutoff", Number.MAX_VALUE);
    expect(() => packGeneratedUnlitMaterialUniforms(uniforms)).toThrow(/u_alphaCutoff/);
  });
});

function nativeFixture() {
  const groups: { layout: { index: number }; entries: readonly { binding: number; resource: unknown }[] }[] = [];
  const modules: { code: string }[] = [];
  const pipelines: { primitive: { topology: string }; vertex: { buffers: readonly ({ attributes: readonly { shaderLocation: number }[] } | null)[] } }[] = [];
  const submissions: unknown[] = [];
  const writes = new Map<string, Uint8Array>();
  const buffers: { descriptor: { label?: string }; destroyed: boolean; destroy(): void }[] = [];
  const textures: { descriptor: { label?: string }; destroyed: boolean; destroy(): void }[] = [];
  let completeFence!: () => void;
  const fence = new Promise<void>(resolve => { completeFence = resolve; });
  let lose!: (info: { reason: string }) => void;
  const lost = new Promise<{ reason: string }>(resolve => { lose = resolve; });
  let failTexture = false;
  let failView = false;
  const native = {
    lost,
    queue: {
      submit(commands: readonly unknown[]) { submissions.push(...commands); }, onSubmittedWorkDone: () => fence,
      writeBuffer(buffer: { label?: string; descriptor: { label?: string } }, _offset: number, data: ArrayBufferView) {
        // Pooled per-draw uniforms carry the current draw's label on the buffer itself.
        writes.set(buffer.label ?? buffer.descriptor.label ?? "", new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
      },
      writeTexture() {}
    },
    createBuffer(descriptor: { label?: string }) {
      const buffer = { descriptor, destroyed: false, destroy() { this.destroyed = true; } }; buffers.push(buffer); return buffer;
    },
    createTexture(descriptor: { label?: string }) {
      if (failTexture) throw new Error("texture allocation failed");
      const texture = { descriptor, destroyed: false, destroy() { this.destroyed = true; }, createView: (view?: object) => {
        if (failView) throw new Error("texture view failed");
        return { texture, view };
      } };
      textures.push(texture); return texture;
    },
    createSampler: () => ({}), createShaderModule(descriptor: { code: string }) { modules.push(descriptor); return descriptor; },
    createBindGroupLayout: (descriptor: object) => descriptor, createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: typeof pipelines[number]) { pipelines.push(descriptor); return { getBindGroupLayout: (index: number) => ({ index }) }; },
    createBindGroup(group: typeof groups[number]) { groups.push(group); return group; },
    createCommandEncoder: (descriptor: { label: string }) => ({
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw() {}, drawIndexed() {}, end() {} }),
      finish: () => ({ label: descriptor.label })
    }),
    destroy() {}
  };
  return { native: native as unknown as WebGPUDeviceLike, groups, modules, pipelines, submissions, writes, buffers, textures, completeFence, lose,
    failNextTexture(value: boolean) { failTexture = value; }, failNextView(value: boolean) { failView = value; } };
}

describe("native generated unlit WebGPU submission", () => {
  it("compiles a target-WGSL C-02 cache entry and binds its generated texture, material and frame", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const cache = new ProgramCache(device, { parallelCompile: false });
    const features = normalizeProgramFeatures({ target: "wgsl", alphaMode: "mask",
      maps: { baseColor: { uvSet: 0, transform: true } },
      features: { "a3d.nativePrimitive": "lines", "a3d.clipping": true } });
    const generated = generateProgramImpl(features);
    const handle = cache.acquire(features);
    const texture = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([64, 128, 255, 255]), generateMipmaps: false });
    const vertices = device.createBuffer("vertex", 40);
    const frame = device.createBuffer("uniform", 304);
    const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    try {
      expect(handle.status, handle.error).toBe("ready");
      const shader = handle.program!;
      expect((shader as typeof shader & { nativeUniformLayout: string }).nativeUniformLayout).toBe("generated-program-unlit");
      expect(shader.reflection.attributes.get("a_position")).toBe(0);
      expect(shader.reflection.uniforms.has("u_a3dClipGroupCount")).toBe(true);
      // The device currently regenerates the deterministic native template
      // from its descriptor; the public source additionally has a key marker.
      expect(fixture.modules).toHaveLength(2);
      expect(generated.vertex.endsWith(fixture.modules[0]!.code)).toBe(true);
      expect(generated.fragment.endsWith(fixture.modules[1]!.code)).toBe(true);
      const uniforms = new Map<string, UniformValue>(createClippingUniforms(createClippingBinding({
        backend: "webgpu", global: { planes: [[1, 0, 0, -1]] }
      })));
      uniforms.set("u_baseColorMap", new TextureBinding({ name: "u_baseColorMap", texture, sampler: new Sampler() }));
      uniforms.set("u_baseColor", [0.25, 0.5, 0.75, 1]);
      const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 },
        { semantic: "uv", components: 2, offset: 12 }], 20);
      device.beginFrame(4, 4); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
      device.drawChecked({ label: "target-wgsl-line", topology: "lines", vertexBuffer: vertices,
        vertexFormat: format, vertexCount: 2, shader, uniforms });
      const group = fixture.groups.find(value => value.layout.index === 0)!;
      expect(group.entries.map(entry => entry.binding)).toEqual([0, 1, 2]);
      expect((group.entries[2]!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(texture));
      expect(fixture.groups.some(value => value.layout.index === 1)).toBe(true);
      const packed = fixture.writes.get("target-wgsl-line-generated-unlit-material")!;
      expect(new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
        .getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipControl!, true)).toBe(1);
      expect(() => device.draw({ label: "wrong-topology", topology: "triangles", vertexBuffer: vertices,
        vertexFormat: format, vertexCount: 2, shader, uniforms })).toThrow(/topology does not match/);
      device.endFrame();
    } finally {
      fixture.completeFence(); cache.dispose(); target.dispose(); texture.dispose(); vertices.dispose(); frame.dispose(); device.dispose();
    }
  });

  it("compiles a target-WGSL PBR cache entry and binds its actual base-color and normal textures", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const cache = new ProgramCache(device, { parallelCompile: false });
    const features = normalizeProgramFeatures({ target: "wgsl", lighting: "lit",
      maps: { baseColor: { uvSet: 0, transform: false }, normal: { uvSet: 0, transform: false } } });
    const generated = generateProgramImpl(features);
    const handle = cache.acquire(features);
    const color = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([64, 128, 255, 255]), generateMipmaps: false });
    const normal = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]), generateMipmaps: false });
    const vertices = device.createBuffer("vertex", 96);
    const frame = device.createBuffer("uniform", 304);
    const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    try {
      expect(handle.status, handle.error).toBe("ready");
      const shader = handle.program!;
      expect((shader as typeof shader & { nativeUniformLayout: string }).nativeUniformLayout).toBe("generated-program-pbr");
      expect(shader.reflection.attributes.get("a_normal")).toBe(1);
      expect(shader.reflection.uniforms.has("u_normalMap")).toBe(true);
      expect(fixture.modules).toHaveLength(2);
      expect(generated.vertex.endsWith(fixture.modules[0]!.code)).toBe(true);
      expect(generated.fragment.endsWith(fixture.modules[1]!.code)).toBe(true);
      const uniforms = new Map<string, UniformValue>([
        ["u_baseColor", [0.25, 0.5, 0.75, 1]],
        ["u_baseColorMap", new TextureBinding({ name: "u_baseColorMap", texture: color, sampler: new Sampler() })],
        ["u_normalMap", new TextureBinding({ name: "u_normalMap", texture: normal, sampler: new Sampler() })]
      ]);
      const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 },
        { semantic: "normal", components: 3, offset: 12 }, { semantic: "uv", components: 2, offset: 24 }], 32);
      device.beginFrame(4, 4); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
      device.drawChecked({ label: "target-wgsl-pbr", topology: "triangles", vertexBuffer: vertices,
        vertexFormat: format, vertexCount: 3, shader, uniforms });
      const group = fixture.groups.find(value => value.layout.index === 0)!;
      expect(group.entries.map(entry => entry.binding)).toEqual([0, 1, 2, 20, 21]);
      expect((group.entries[2]!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(color));
      expect((group.entries[4]!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(normal));
      expect(fixture.groups.some(value => value.layout.index === 1)).toBe(true);
      const packed = fixture.writes.get("target-wgsl-pbr-generated-pbr-material")!;
      expect(new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
        .getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.baseColor!, true)).toBeCloseTo(0.25);
      device.endFrame();
    } finally {
      fixture.completeFence(); cache.dispose(); target.dispose(); color.dispose(); normal.dispose(); vertices.dispose(); frame.dispose(); device.dispose();
    }
  });

  it("draws clipped unlit triangles and thin lines through ForwardPass, reusing variants for live plane edits", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: true });
    const triangle = Geometry.triangle();
    const line = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]], [[1, 0, 0, 1], [0, 1, 0, 1]]);
    const point = Geometry.points([[0, 0, 0]]);
    const plain = new UnlitMaterial({ color: [0.25, 0.5, 0.75, 1], renderState: { cullMode: "none" } });
    const colored = new UnlitMaterial({ vertexColors: true });
    const globalPlanes: [number, number, number, number][] = [[1, 0, 0, -1]];
    const globalClipping = { planes: globalPlanes };
    const localClipping = { space: "local" as const, combine: "union" as const, planes: [[0, 1, 0, 0] as const, [0, 0, 1, 0] as const] };
    const linePass = new ForwardPass({ items: [{ label: "forward-line", geometry: line, material: colored,
      materialClipping: localClipping }], globalClipping });
    try {
      device.beginFrame(8, 8); device.setRenderTarget(target);
      linePass.execute({ device, width: 8, height: 8 });
      expect(fixture.pipelines.some(pipeline => pipeline.primitive.topology === "line-list")).toBe(true);
      expect(fixture.submissions.some(command => (command as { label?: string }).label?.includes("forward-line"))).toBe(true);
      const first = fixture.writes.get("forward-line-generated-unlit-material")!;
      const firstView = new DataView(first.buffer, first.byteOffset, first.byteLength);
      expect(firstView.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipControl!, true)).toBe(2);
      expect(firstView.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipPlanes! + 12, true)).toBe(-1);
      expect([0, 1, 2, 3].map(index => firstView.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipGroups! + 16 + index * 4, true))).toEqual([1, 2, 1, 1]);
      expect(fixture.modules.some(module => module.code.includes("material.baseColor * input.color"))).toBe(true);
      const compiledModules = fixture.modules.length;
      globalPlanes[0] = [1, 0, 0, -4];
      linePass.execute({ device, width: 8, height: 8 });
      const second = fixture.writes.get("forward-line-generated-unlit-material")!;
      expect(new DataView(second.buffer, second.byteOffset, second.byteLength).getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipPlanes! + 12, true)).toBe(-4);
      expect(fixture.modules).toHaveLength(compiledModules);
      new ForwardPass({ items: [{ label: "forward-triangle", geometry: triangle, material: plain }], globalClipping })
        .execute({ device, width: 8, height: 8 });
      expect(fixture.pipelines.some(pipeline => pipeline.primitive.topology === "triangle-list")).toBe(true);
      expect(fixture.submissions.some(command => (command as { label?: string }).label?.includes("forward-triangle"))).toBe(true);
      const geometryMatrix = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1];
      const modelMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1];
      const reflectedInstance = [-1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1];
      new ForwardPass({ items: [{ label: "forward-instance", geometry: triangle, material: plain, geometryMatrix, modelMatrix,
        instanceTransforms: new Float32Array(reflectedInstance), instanceColors: new Float32Array([0.5, 0.25, 1, 1]),
        materialClipping: localClipping }], globalClipping }).execute({ device, width: 8, height: 8 });
      const instanceBytes = fixture.writes.get("forward-instance-generated-unlit-material")!;
      const instanceView = new DataView(instanceBytes.buffer, instanceBytes.byteOffset, instanceBytes.byteLength);
      expect(geometryMatrix.map((_, index) => instanceView.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.geometry! + index * 4, true))).toEqual(geometryMatrix);
      expect(modelMatrix.map((_, index) => instanceView.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.model! + index * 4, true))).toEqual(modelMatrix);
      expect(fixture.pipelines.some(pipeline => [8, 9, 10, 11, 12].every(location =>
        pipeline.vertex.buffers.some(buffer => buffer?.attributes.some(attribute => attribute.shaderLocation === location))))).toBe(true);
      expect(fixture.modules.some(module => module.code.includes("material.model * mat4x4f(instance0, instance1, instance2, instance3) * local"))).toBe(true);
      const submitted = fixture.submissions.length;
      expect(() => new ForwardPass({ items: [{ geometry: point, material: plain }] })
        .execute({ device, width: 8, height: 8 })).toThrow(/reported device buffer limits/i);
      expect(() => new ForwardPass({ items: [{ geometry: point, material: plain }], globalClipping })
        .execute({ device, width: 8, height: 8 })).toThrow(/point.quad/i);
      expect(fixture.submissions).toHaveLength(submitted);
      device.endFrame();
    } finally {
      fixture.completeFence(); triangle.dispose(); line.dispose(); point.dispose(); plain.dispose(); colored.dispose(); target.dispose(); device.dispose();
    }
  });

  it("binds the selected texture, AuraFrame and grouped clipping packet and pools its uniforms", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const source = generated("lines", { vertexColors: true, maps: { baseColor: { uvSet: 0, transform: true } }, features: { "a3d.clipping": true } });
    const shader = device.createShaderProgram({ label: "clipped-line", marker: GENERATED_PROGRAM_MARKER,
      vertex: source.vertex, fragment: source.fragment, generatedProgram: source.descriptor! });
    const texture = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([64, 128, 255, 255]), generateMipmaps: false });
    const uniforms = new Map<string, UniformValue>(createClippingUniforms(createClippingBinding({ backend: "webgpu", global: { planes: [[1, 0, 0, -1]] } })));
    uniforms.set("u_baseColorMap", new TextureBinding({ name: "u_baseColorMap", texture, sampler: new Sampler() }));
    uniforms.set("u_baseColor", [0.25, 0.5, 0.75, 1]);
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "uv", components: 2, offset: 12 },
      { semantic: "color", components: 4, offset: 20 }], 36);
    const vertices = device.createBuffer("vertex", 72);
    const frame = device.createBuffer("uniform", 304);
    const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false });
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
      const command = { label: "clipped-line", topology: "lines" as const, vertexBuffer: vertices, vertexFormat: format, vertexCount: 2, shader, uniforms };
      device.drawChecked(command);
      const group = fixture.groups.find(value => value.layout.index === 0)!;
      expect(group.entries.map(entry => entry.binding)).toEqual([0, 1, 2]);
      expect((group.entries[2]!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(texture));
      expect(fixture.groups.some(value => value.layout.index === 1)).toBe(true);
      expect(fixture.modules.some(value => value.code.includes("generatedUnlitClipRetains(input.world, input.local)"))).toBe(true);
      const packed = fixture.writes.get("clipped-line-generated-unlit-material")!;
      const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
      expect(view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipControl!, true)).toBe(1);
      expect(view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.clipPlanes! + 12, true)).toBe(-1);
      const before = fixture.submissions.length;
      expect(() => device.draw({ ...command, topology: "triangles" })).toThrow(/topology does not match/);
      expect(() => device.draw({ ...command, topology: "points" })).toThrow(/topology does not match/);
      expect(fixture.submissions).toHaveLength(before);
      const draw = device.draw.bind(device);
      device.draw = value => draw({ ...value, label: "unrelated-draw" });
      try {
        expect(() => device.drawChecked(command)).toThrow(/could not be submitted/i);
        expect(fixture.submissions).toHaveLength(before + 1);
      } finally { device.draw = draw; }
      const materialBuffer = fixture.buffers.find(buffer => buffer.descriptor.label === "clipped-line-generated-unlit-material")!;
      expect(materialBuffer.destroyed).toBe(false);
      fixture.completeFence(); await Promise.resolve();
      // Per-draw uniforms return to the device pool after submission; the device retires them on disposal.
      expect(materialBuffer.destroyed).toBe(false);
      device.endFrame();
    } finally { target.dispose(); texture.dispose(); vertices.dispose(); frame.dispose(); device.dispose(); }
  });

  it("issues distinct frame tokens and revokes them on end, loss and disposal", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    expect(device.activeFrameToken).toBeNull();
    device.beginFrame(2, 2); const first = device.activeFrameToken;
    expect(first).not.toBeNull();
    expect(() => device.beginFrame(2, 2)).toThrow(/already active/);
    expect(device.activeFrameToken).toBe(first);
    device.endFrame(); expect(device.activeFrameToken).toBeNull();
    device.beginFrame(2, 2); expect(device.activeFrameToken).not.toBe(first);
    fixture.lose({ reason: "test" }); await Promise.resolve();
    expect(device.activeFrameToken).toBeNull();
    device.dispose(); expect(device.activeFrameToken).toBeNull();

    const replacementFixture = nativeFixture();
    const replacement = await WebGPUDevice.create({ adapter: { requestDevice: async () => replacementFixture.native } });
    expect(replacement.generation).not.toBe(device.generation);
    replacement.beginFrame(2, 2);
    expect(replacement.activeFrameToken).not.toBe(first);
    expect(replacement.activeFrameToken).not.toBeNull();
    replacement.dispose();
    expect(replacement.activeFrameToken).toBeNull();
  });

  it("does not leave a frame active when late native setup fails", async () => {
    const fixture = nativeFixture();
    const canvas = { getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native }, canvas: canvas as unknown as HTMLCanvasElement });
    try {
      fixture.failNextTexture(true);
      expect(() => device.beginFrame(2, 2)).toThrow(/texture allocation failed/);
      expect(device.activeFrameToken).toBeNull();
      fixture.failNextTexture(false);
      device.beginFrame(2, 2); expect(device.activeFrameToken).not.toBeNull();
      device.endFrame();
    } finally { fixture.completeFence(); device.dispose(); }
  });

  it("keeps the old canvas depth attachment usable after a failed resize and retires a partial replacement safely", async () => {
    const fixture = nativeFixture();
    const canvas = { getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native }, canvas: canvas as unknown as HTMLCanvasElement });
    try {
      device.beginFrame(2, 2); const firstToken = device.activeFrameToken; device.endFrame();
      const oldDepth = fixture.textures.find(texture => texture.descriptor.label === "aura3d-webgpu-canvas-depth")!;
      fixture.failNextTexture(true);
      expect(() => device.beginFrame(4, 4)).toThrow(/texture allocation failed/);
      expect(device.activeFrameToken).toBeNull();
      expect(() => device.resourceInterop.assertUsable(oldDepth)).not.toThrow();
      fixture.failNextTexture(false); fixture.failNextView(true);
      expect(() => device.beginFrame(4, 4)).toThrow(/texture view failed/);
      const partial = fixture.textures.at(-1)!;
      expect(partial).not.toBe(oldDepth);
      expect(partial.destroyed).toBe(false);
      expect(() => device.resourceInterop.assertUsable(oldDepth)).not.toThrow();
      expect(() => device.resourceInterop.assertUsable(partial)).toThrow(/RETIRED_RESOURCE/);
      fixture.failNextView(false);
      device.beginFrame(2, 2);
      expect(device.activeFrameToken).not.toBe(firstToken);
      expect(() => device.resourceInterop.assertUsable(oldDepth)).not.toThrow();
      device.endFrame();
      fixture.completeFence(); await Promise.resolve();
      expect(partial.destroyed).toBe(true);
      expect(oldDepth.destroyed).toBe(false);
    } finally { fixture.completeFence(); device.dispose(); }
  });
});
