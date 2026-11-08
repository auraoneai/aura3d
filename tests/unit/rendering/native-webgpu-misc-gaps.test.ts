// W5 WebGPU gaps: native WGSL for the stock prd07.fog contributor (generated PBR and unlit), prd15.paritySprite
// billboards (generated unlit) and prd10.wind sway (generated PBR forward + PRD-02 depth casters). Source and packing
// checks only; real-GPU frames are captured separately.
import { afterEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd07";
import "../../../packages/rendering/src/lanes/prd10";
import "../../../packages/engine/src/agent-api/compiler/lines";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderChunk, type ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import type { DepthVariantFeature, ShadowCasterVariantKey } from "../../../packages/rendering/src/contracts/shadows";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createGeneratedPbrProgram, GENERATED_PBR_MATERIAL_OFFSETS, packGeneratedPbrMaterialUniforms, type GeneratedPbrDescriptor } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { createGeneratedUnlitProgram, GENERATED_UNLIT_MATERIAL_OFFSETS, packGeneratedUnlitMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { prd02DepthWgsl } from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import { registerPrd10WindFeatures } from "../../../packages/rendering/src/world/vegetation/WindField";
import { a3d_prd10_wind_deform } from "../../../packages/rendering/src/world/vegetation/shaders/wind";
import { PRD07_FOG_CHUNK_GLSL } from "../../../packages/rendering/src/atmosphere/shaders/fog.glsl";
import { prd07FogWgsl } from "../../../packages/rendering/src/atmosphere/shaders/fog.wgsl";

const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 } as const;

function lit(features: ProgramFeatures["features"], overrides: Partial<ProgramFeatures> = {}): GeneratedPbrDescriptor {
  const generated = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", lights, maps: {}, extensions: [], environment: "none", features, ...overrides }), { flags });
  return generated.descriptor!;
}
function unlit(features: ProgramFeatures["features"], overrides: Partial<ProgramFeatures> = {}): GeneratedPbrDescriptor {
  const generated = generateProgramImpl(normalizeProgramFeatures({ ...overrides, lighting: "unlit", features: { "a3d.nativePrimitive": "triangles", ...features } }), { flags });
  return generated.descriptor!;
}
function floats(packed: Uint8Array, offset: number, count: number): number[] {
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  return Array.from({ length: count }, (_, index) => view.getFloat32(offset + index * 4, true));
}

describe("native prd07.fog", () => {
  it("replaces the default fog body with the WGSL fog chunk for the verified stock contributor", () => {
    const fogged = lit({ "prd07.fog": "volumetric" }, { fog: "height" });
    expect(fogged.verifiedFeatures).toContain("prd07.fog");
    expect(fogged.defines.A3D_FOG).toBe(1);
    const program = createGeneratedPbrProgram(fogged);
    expect(program.prd07Fog).toBe(true);
    expect(program.fragment).toContain(prd07FogWgsl());
    expect(program.fragment).toContain("let color = a3dPrd07ApplyFog(unfoggedColor, input.worldPosition);");
    // The GLSL fragment:fog hook replaces the default fog body; so does the native template.
    expect(program.fragment).not.toContain("let fogDepth");
    const plain = createGeneratedPbrProgram(lit({}, { fog: "height" }));
    expect(plain.prd07Fog).toBe(false);
    expect(plain.fragment).not.toContain("a3dPrd07");
    expect(plain.fragment).toContain("let fogDepth");

    const unlitProgram = createGeneratedUnlitProgram(unlit({ "prd07.fog": "height" }));
    expect(unlitProgram.prd07Fog).toBe(true);
    expect(unlitProgram.fragment).toContain("let color = a3dPrd07ApplyFog(unfogged, input.world);");
  });

  it("fails closed on an unverified contributor or inconsistent metadata", () => {
    const fogged = lit({ "prd07.fog": "height" });
    expect(() => createGeneratedPbrProgram({ ...fogged, verifiedFeatures: [] })).toThrow(/unverified prd07.fog/);
    const noDefine = { ...fogged.defines }; delete (noDefine as Record<string, unknown>).A3D_FOG;
    expect(() => createGeneratedPbrProgram({ ...fogged, defines: noDefine })).toThrow(/fog define/);
    expect(() => createGeneratedPbrProgram({ ...fogged, activeFeatures: fogged.activeFeatures.map((item) => item.id === "prd07.fog" ? { ...item, value: "froxel" } : item) }))
      .toThrow(/fog metadata/);
    expect(() => createGeneratedUnlitProgram({ ...unlit({ "prd07.fog": "height" }), verifiedFeatures: [] })).toThrow(/unverified prd07.fog/);
  });

  it("keeps the GLSL chunk's modes and formulas", () => {
    const wgsl = prd07FogWgsl();
    for (const mode of ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"]) expect(wgsl).toContain(`mode == ${mode}`);
    for (const constant of ["12.5663706", "1e-4", "1e-9", "1e-12", "0.000001", "1.5"]) {
      expect(PRD07_FOG_CHUNK_GLSL).toContain(constant);
      expect(wgsl).toContain(constant);
    }
  });

  it("packs the u_fog* uniforms only for programs that selected the feature", () => {
    const volumes = new Float32Array(64); volumes.set([1, 2, 3, 1, 4, 5, 6, 0.25]);
    const uniforms = new Map<string, UniformValue>([
      ["u_fogA", [0.1, 0.2, 0.3, 0.4]], ["u_fogB", [5, 0.9, 0.5, 0.2]], ["u_fogColor", [0.6, 0.7, 0.8]], ["u_fogAbsorption", [0.01, 0.02, 0.03]],
      ["u_fogMode", 1], ["u_fogNear", 2], ["u_fogFar", 90], ["u_fogVolumes", volumes],
      ["u_cameraPosition", [1, 10, -3]], ["u_sunDirection", [0, 1, 0]], ["u_sunColor", [2, 2, 1.5]]
    ]);
    const packed = packGeneratedPbrMaterialUniforms(uniforms);
    const offset = (name: string): number => GENERATED_PBR_MATERIAL_OFFSETS[name]!;
    expect(floats(packed, offset("prd07FogA"), 4).map((v) => Math.fround(v))).toEqual([0.1, 0.2, 0.3, 0.4].map(Math.fround));
    expect(floats(packed, offset("prd07FogAbsorption"), 4)[3]).toBe(1);
    expect(floats(packed, offset("prd07FogRange"), 2)).toEqual([2, 90]);
    expect(floats(packed, offset("prd07FogCamera"), 3)).toEqual([1, 10, -3]);
    expect(floats(packed, offset("prd07FogVolumes"), 8)).toEqual([1, 2, 3, 1, 4, 5, 6, 0.25]);
    expect(floats(packed, offset("fogColor"), 3).map(Math.fround)).toEqual([0.6, 0.7, 0.8].map(Math.fround));
    const unlitPacked = packGeneratedUnlitMaterialUniforms(uniforms);
    expect(floats(unlitPacked, GENERATED_UNLIT_MATERIAL_OFFSETS.prd07FogSunColor!, 3)).toEqual([2, 2, 1.5]);
    // A program without the feature never receives u_fogMode; its other u_* names are left alone.
    const none = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_cameraPosition", [1, 2, 3, 4]]]));
    expect(floats(none, offset("prd07FogCamera"), 3)).toEqual([0, 0, 0]);
  });
});

describe("native prd15.paritySprite", () => {
  it("rebuilds the billboard in view space like the GLSL sprite chunk", () => {
    const descriptor = unlit({ "prd15.paritySprite": true });
    expect(descriptor.defines.A3D_PARITY_SPRITE).toBe(1);
    const program = createGeneratedUnlitProgram(descriptor);
    expect(program.sprite).toBe(true);
    expect(program.vertex).toContain("let spriteCenterWorld = material.model * vec4f(0.0, 0.0, 0.0, 1.0);");
    expect(program.vertex).toContain("if (material.sprite.w < 0.5 && frame.projection[2][3] < -0.5)");
    expect(program.vertex).toContain("let clip = frame.projection * spriteView;");
    expect(program.vertex).not.toContain("let clip = frame.viewProjection * world;");
    const instanced = createGeneratedUnlitProgram(unlit({ "prd15.paritySprite": true }, { instancing: { color: false } }));
    expect(instanced.vertex).toContain("material.model * mat4x4f(instance0, instance1, instance2, instance3) * vec4f(0.0, 0.0, 0.0, 1.0)");
    expect(createGeneratedUnlitProgram(unlit({})).sprite).toBe(false);
  });

  it("rejects clipped sprites, sprite lines and inconsistent metadata", () => {
    expect(() => createGeneratedUnlitProgram(unlit({ "prd15.paritySprite": true, "a3d.clipping": true }))).toThrow(/clipped billboard sprites/);
    expect(() => createGeneratedUnlitProgram(unlit({ "prd15.paritySprite": true, "a3d.nativePrimitive": "lines" }))).toThrow(/paritySprite/);
    const descriptor = unlit({ "prd15.paritySprite": true });
    expect(() => createGeneratedUnlitProgram({ ...descriptor, activeFeatures: descriptor.activeFeatures.filter((item) => item.id !== "prd15.paritySprite") }))
      .toThrow(/paritySprite/);
  });

  it("packs rotation, anchor and size attenuation", () => {
    const packed = packGeneratedUnlitMaterialUniforms(new Map<string, UniformValue>([["u_spriteRotation", 0.5], ["u_spriteCenter", [0.25, 1]], ["u_spriteSizeAttenuation", 0]]));
    expect(floats(packed, GENERATED_UNLIT_MATERIAL_OFFSETS.sprite!, 4)).toEqual([0.5, 0.25, 1, 0]);
    expect(floats(packGeneratedUnlitMaterialUniforms(new Map()), GENERATED_UNLIT_MATERIAL_OFFSETS.sprite!, 4)).toEqual([0, 0.5, 0.5, 1]);
  });
});

describe("native prd10.wind", () => {
  let unregister: (() => void) | undefined;
  afterEach(() => { unregister?.(); unregister = undefined; });
  const windDepthFeature: DepthVariantFeature = {
    id: "prd10.wind", owner: "prd10", flag: "A3D_QR_WORLD_WIND", passes: ["depth", "distance"],
    select: () => 1, defines: () => ({ A3D_PRD10_WIND: 1 }), chunks: [a3d_prd10_wind_deform.name], hooks: ["vertex:deform"]
  };
  const key: ShadowCasterVariantKey = { skinning: 0, skinningTexture: false, morphTargets: false, instanced: false, batched: false, alphaTest: false, alphaHash: false, doubleSided: false, features: { "prd10.wind": 1 } };

  it("lowers the stock wind deform in native depth casters and binds the wind uniforms", () => {
    const { webgpu, portableBindings } = prd02DepthWgsl(key, [windDepthFeature]);
    expect(portableBindings.map(({ name }) => name)).toEqual(expect.arrayContaining(["u_windDirStrength", "u_windGust", "u_windAssetHeight", "u_windNoise"]));
    expect(webgpu.vertex).toContain("textureSampleLevel(u_windNoiseTexture, u_windNoiseSampler, gustUv, 0.0)");
    // WebGL2 depth defines set neither USE_INSTANCING nor VERTEX_COLORS: zero origin, trunk-bend weights.
    expect(webgpu.vertex).toContain("a3dWindOffsetNative(localPos, vec3<f32>(0.0), vec4<f32>(1.0, 1.0, 0.5, 1.0), assetHeight)");
    expect(webgpu.vertex.indexOf("a3dDepthWindOffset(local.xyz")).toBeLessThan(webgpu.vertex.indexOf("let geometryLocal"));
    expect(prd02DepthWgsl({ ...key, features: {} }, [windDepthFeature]).webgpu.vertex).not.toContain("Wind");
  });

  it("still rejects a replaced or unknown deform chunk", () => {
    registerShaderChunk({ name: "test_custom_deform", owner: "prd10", stage: "vertex", glsl: "void a3dDeform(inout vec4 p, inout vec3 n, inout vec4 t) {}" });
    const custom: DepthVariantFeature = { ...windDepthFeature, id: "test.deform", chunks: ["test_custom_deform"] };
    expect(() => prd02DepthWgsl({ ...key, features: { "test.deform": 1 } }, [custom])).toThrow(expect.objectContaining({ code: "WGSL_DEPTH_DEFORM_UNSUPPORTED" }));
    const renamed: DepthVariantFeature = { ...windDepthFeature, chunks: ["test_custom_deform"] };
    expect(() => prd02DepthWgsl(key, [renamed])).toThrow(expect.objectContaining({ code: "WGSL_DEPTH_DEFORM_UNSUPPORTED" }));
  });

  it("sways generated PBR vertices with a vertex-stage gust texture", () => {
    unregister = registerPrd10WindFeatures();
    const windy = lit({ "prd10.wind": 1 });
    expect(windy.verifiedFeatures).toContain("prd10.wind");
    const program = createGeneratedPbrProgram(windy);
    expect(program.wind).toBe(true);
    expect(program.resources).toContainEqual({ uniform: "u_windNoise", samplerBinding: 76, textureBinding: 77, dimension: "2d", sampleType: "filterable-float" });
    expect(program.vertex).toContain("deformedPosition += generatedWindOffset(deformedPosition, vec3f(0.0), vec4f(1.0, 1.0, 0.5, 1.0), max(material.windParams.x, 0.01));");
    expect(program.fragment).not.toContain("u_windNoise");
    const instanced = createGeneratedPbrProgram(lit({ "prd10.wind": 1 }, { instancing: { color: false }, vertexColors: true }));
    expect(instanced.vertex).toContain("generatedWindOffset(deformedPosition, instance3.xyz, color,");
    expect(() => createGeneratedPbrProgram({ ...windy, verifiedFeatures: [] })).toThrow(/unverified prd10.wind/);

    const packed = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_windDirStrength", [1, 0, 0.5, 3]], ["u_windGust", [0.2, 0.1, 0, 0]], ["u_windAssetHeight", 4]]));
    expect(floats(packed, GENERATED_PBR_MATERIAL_OFFSETS.windDirStrength!, 4)).toEqual([1, 0, 0.5, 3]);
    expect(floats(packed, GENERATED_PBR_MATERIAL_OFFSETS.windParams!, 1)).toEqual([4]);
  });
});

describe("GLSL-only particle batches on WebGPU", () => {
  it("are skipped with one warning instead of throwing out of every frame", async () => {
    const { vi } = await import("vitest");
    const { MockRenderDevice, RenderDeviceError } = await import("../../../packages/rendering/src/RenderDevice");
    const { ParticleBatchPass } = await import("../../../packages/rendering/src/vfx/ParticleBatchPass");
    const { Texture } = await import("../../../packages/rendering/src/Texture");
    const { QUALITY_TIERS } = await import("../../../packages/rendering/src/contracts/quality");
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const create = vi.spyOn(device, "createShaderProgram").mockImplementation(() => { throw new RenderDeviceError("No WGSL program for shader", "WGSL_PROGRAM_MISSING"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const atlas = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    const pass = new ParticleBatchPass(device);
    try {
      const handle = pass.upsertBatch({ key: "dust", capacity: 8, source: "cpu", atlas, blend: "alpha", shading: "unlit", softDepth: false, stretch: false, frameBlend: false });
      const data = new Float32Array(16); data[4] = 1; data.fill(1, 8, 12);
      pass.writeInstances(handle, data, 1);
      const ctx = { device, width: 32, height: 32, camera: null, blackboard: new Map(), tier: QUALITY_TIERS.high,
        sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 100, orthographic: false } } } as never;
      for (let frame = 0; frame < 3; frame += 1) {
        device.beginFrame(32, 32);
        for (const item of pass.transparentItems(ctx)) expect(() => item.draw(ctx)).not.toThrow();
        device.endFrame();
      }
      expect(device.drawCommands).toHaveLength(0);
      expect(create).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls.filter(([line]) => String(line).includes("VFX_PARTICLES_WGSL_MISSING"))).toHaveLength(1);
    } finally { warn.mockRestore(); pass.dispose(); atlas.dispose(); device.dispose(); }
  });
});
