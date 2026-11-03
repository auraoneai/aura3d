import { describe, expect, it } from "vitest";
import { DirectionalLight, PointLight } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { LightUniforms } from "../../../packages/rendering/src/LightUniforms";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { PhotometricProfileAtlas } from "../../../packages/rendering/src/lighting/PhotometricProfileAtlas";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { createGeneratedPbrProgram, GENERATED_PBR_MATERIAL_OFFSETS, packGeneratedPbrMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 1, point: 1, spot: 0, rect: 0, hemisphere: false } as const;
const table = { verticalAngles: [0, 60, 180], horizontalAngles: [0], candela: [100, 50, 0], symmetry: "rotational" as const };

function source(overrides: Partial<ProgramFeatures> = {}) {
  const features = normalizeProgramFeatures({ lighting: "lit", environment: "none", lights, maps: {}, extensions: [], ...overrides });
  const generated = generateProgramImpl(features, { flags });
  if (!generated.descriptor) throw new Error("missing generated descriptor");
  const descriptor = { ...generated.descriptor, features: { ...generated.descriptor.features,
    features: { ...generated.descriptor.features.features, "a3d.photometricProfile": true } },
    defines: { ...generated.descriptor.defines, A3D_PHOTOMETRIC_PROFILE: true as const } };
  return { generated, descriptor };
}

function packet(atlas: PhotometricProfileAtlas): Map<string, UniformValue> {
  const sun = new DirectionalLight("sun"), point = new PointLight("measured");
  // The profile still emits with an authored scalar of zero.
  point.intensity = 0;
  const packed = LightUniforms.pack([collectLight(sun), collectLight(point)]);
  const args = atlas.shaderArguments("measured");
  const offsets = new Float32Array(64), meta = new Float32Array(64);
  offsets.set(args.offsetsAndVerticalCount, 4);
  meta.set([args.horizontalCountAndSymmetry[0]!, args.horizontalCountAndSymmetry[1]!, args.scaleRotation[0]!, args.scaleRotation[1]!], 4);
  return new Map<string, UniformValue>([
    ["u_lightCount", packed.lightCount], ["u_lightData", packed.data],
    ["u_a3dPhotometricOffsets", offsets], ["u_a3dPhotometricMeta", meta],
    ["u_a3dPhotometricAtlas", new TextureBinding({ name: "u_a3dPhotometricAtlas", texture: atlas.texture, sampler: atlas.sampler, required: true })]
  ]);
}

describe("native WebGPU measured-candela handoff", () => {
  it("injects an opt-in load-only profile before attenuation, shadows and direct lobes", () => {
    const { descriptor } = source();
    const program = createGeneratedPbrProgram(descriptor);
    expect(program.photometricProfile).toBe(true);
    expect(program.resources).toContainEqual({ uniform: "u_a3dPhotometricAtlas", textureBinding: 75,
      dimension: "2d", sampleType: "unfilterable-float" });
    expect(program.fragment).toContain("textureLoad(source");
    expect(program.fragment).toContain("input.worldPosition - positionRange.xyz, directionKind.xyz");
    expect(program.fragment).toContain("effectiveColorIntensity.a = a3dPhotometricCandela(");
    expect(program.fragment).toContain("generatedDirectLight(effectiveColorIntensity, positionRange");
    expect(program.fragment.indexOf("effectiveColorIntensity.a = a3dPhotometricCandela"))
      .toBeLessThan(program.fragment.indexOf("let directResult ="));
    expect(program.fragment).not.toContain("effectiveColorIntensity.a *=");
    expect(program.fragment).not.toContain("effectiveColorIntensity.a / colorIntensity.a");
    const ordinary = source().generated.descriptor!;
    expect(createGeneratedPbrProgram(ordinary).resources.some((resource) => resource.uniform === "u_a3dPhotometricAtlas")).toBe(false);
  });

  it("retains independently generated clearcoat and anisotropy on the measured direct light", () => {
    const { descriptor } = source({ extensions: [{ lobe: "anisotropy", maps: [], bits: {} }, { lobe: "clearcoat", maps: [], bits: {} }],
      features: { "a3d.independentPhysicalPreview": true, "prd04.tangentFrame": true } });
    const fragment = createGeneratedPbrProgram(descriptor).fragment;
    expect(fragment).toContain("a3dPrd04AnisotropyDirect(light.direction");
    expect(fragment).toContain("a3dPrd04ClearcoatDirect(light.direction");
    expect(fragment).toContain("generatedDirectLight(effectiveColorIntensity");
  });

  it("packs selected slots, preserving zero scale as an enabled dark profile", () => {
    const atlas = new PhotometricProfileAtlas([{ id: "measured", profile: table, scale: 2 }]);
    try {
      const uniforms = packet(atlas);
      const meta = uniforms.get("u_a3dPhotometricMeta") as Float32Array;
      meta[6] = 0;
      const bytes = packGeneratedPbrMaterialUniforms(uniforms, false, true);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.photometricOffsets! + 16 + 12, true)).toBe(3);
      expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.photometricMeta! + 16 + 8, true)).toBe(0);
      expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.lights! + 24 * 4 + 12, true)).toBe(0);
      expect(() => packGeneratedPbrMaterialUniforms(uniforms)).toThrow(/require.*shader feature/i);
      const wrongOffset = new Float32Array(uniforms.get("u_a3dPhotometricOffsets") as Float32Array);
      wrongOffset[5] = wrongOffset[5]! + 1;
      const malformed = new Map(uniforms); malformed.set("u_a3dPhotometricOffsets", wrongOffset);
      expect(() => packGeneratedPbrMaterialUniforms(malformed, false, true)).toThrow(/photometric packet/i);
    } finally { atlas.dispose(); }
  });

  it("rejects clustered or missing punctual feature descriptions", () => {
    const clustered = source({ lights: { ...lights, clustered: true } }).descriptor;
    expect(() => createGeneratedPbrProgram(clustered)).toThrow(/non-clustered punctual/i);
    const noPunctual = source({ lights: { ...lights, point: 0 } }).descriptor;
    expect(() => createGeneratedPbrProgram(noPunctual)).toThrow(/non-clustered punctual/i);
    const inconsistent = source().descriptor;
    const missing: Record<string, string | number | true> = { ...inconsistent.defines };
    delete missing.A3D_PHOTOMETRIC_PROFILE;
    expect(() => createGeneratedPbrProgram({ ...inconsistent, defines: missing })).toThrow(/A3D_PHOTOMETRIC_PROFILE/);
  });

  it("binds an unchanged R32F atlas without float filtering and rejects bad packet/texture inputs", async () => {
    const layouts: { entries?: readonly { binding: number; texture?: { sampleType: string } }[] }[] = [];
    const groups: { entries: readonly { binding: number; resource: unknown }[] }[] = [];
    const textures: { format: string; label?: string }[] = [];
    let draws = 0;
    const native = {
      features: { has: () => false }, limits: { maxTextureDimension2D: 4096 },
      queue: { submit() {}, onSubmittedWorkDone: async () => {}, writeTexture() {}, writeBuffer() {} },
      createBuffer: ({ label, size, usage }: { label?: string; size: number; usage: number }) => ({ label, size, usage, destroy() {} }),
      createTexture(descriptor: { format: string; label?: string }) {
        textures.push(descriptor);
        const texture = { descriptor, destroy() {}, createView(view?: object) { return { texture, view }; } };
        return texture;
      },
      createSampler: () => ({}), createShaderModule: () => ({}),
      createBindGroupLayout: (descriptor: { entries?: readonly { binding: number; texture?: { sampleType: string } }[] }) => { layouts.push(descriptor); return descriptor; },
      createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (group: { entries: readonly { binding: number; resource: unknown }[] }) => { groups.push(group); return group; },
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() { draws += 1; }, end() {} }), finish: () => ({}) }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const atlas = new PhotometricProfileAtlas([{ id: "measured", profile: table }]);
    const dfg = new Texture({ width: 1, height: 1, format: "rgba16f", colorSpace: "linear", data: new Uint16Array(4), generateMipmaps: false });
    const { generated, descriptor } = source();
    const shader = device.createShaderProgram({ label: "photo", marker: GENERATED_PROGRAM_MARKER,
      vertex: generated.vertex, fragment: generated.fragment, generatedProgram: descriptor });
    const vertices = device.createBuffer("vertex", 72), frame = device.createBuffer("uniform", 304, new Float32Array(76));
    const target = device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const uniforms = packet(atlas);
    uniforms.set("u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg }));
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader, uniforms };
    try {
      device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
      device.draw(draw);
      expect(draws).toBe(1);
      expect(textures).toContainEqual(expect.objectContaining({ label: "photometric-profile-atlas", format: "r32float" }));
      expect(layouts.some((layout) => layout.entries?.some((entry) => entry.binding === 75 && entry.texture?.sampleType === "unfilterable-float"))).toBe(true);
      expect(groups.some((group) => group.entries.some((entry) => entry.binding === 75))).toBe(true);
      const missing = new Map(uniforms); missing.delete("u_a3dPhotometricAtlas");
      expect(() => device.draw({ ...draw, uniforms: missing })).toThrow(/R32F load-only atlas/i);
      const wrongSampler = new Map(uniforms);
      wrongSampler.set("u_a3dPhotometricAtlas", new TextureBinding({ name: "u_a3dPhotometricAtlas", texture: atlas.texture, sampler: new Sampler({ minFilter: "linear", magFilter: "linear" }) }));
      expect(() => device.draw({ ...draw, uniforms: wrongSampler })).toThrow(/R32F load-only atlas/i);
      const invalidOffsets = new Float32Array(uniforms.get("u_a3dPhotometricOffsets") as Float32Array);
      invalidOffsets[4] = atlas.texture.width * atlas.texture.height;
      const bad = new Map(uniforms); bad.set("u_a3dPhotometricOffsets", invalidOffsets);
      expect(() => device.draw({ ...draw, uniforms: bad })).toThrow(/photometric packet/i);
      atlas.texture.updateMip(0, new Float32Array(atlas.texture.data as Float32Array));
      expect(() => device.draw(draw)).toThrow(/R32F load-only atlas/i);
    } finally {
      device.endFrame(); atlas.dispose(); dfg.dispose(); device.dispose();
    }
  });
});
