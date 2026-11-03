import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectionalLight, PointLight, RectAreaLight, SpotLight } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import "../../../packages/rendering/src/lanes/prd06";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { createClusteredForwardLighting } from "../../../packages/rendering/src/ClusteredForwardLighting";
import { clippingRetainsPoint, createClippingBinding, createClippingUniforms } from "../../../packages/rendering/src/ClippingPlanes";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { packEnvSH } from "../../../packages/rendering/src/environment/EnvUniforms";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { compileShaderGraph } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import {
  createGeneratedPbrProgram,
  GENERATED_PBR_MATERIAL_LAYOUT,
  GENERATED_PBR_MATERIAL_OFFSETS,
  packGeneratedPbrMaterialUniforms,
  validateGeneratedPbrTarget,
  type GeneratedPbrDescriptor
} from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 0, hemisphere: false, point: 0, rect: 0, spot: 0 } as const;
const shadow = { cascades: 0, contact: false, localShadows: 0, pcfTaps: 4 } as const;
const extensions = [
  { lobe: "emissive-strength", bits: { map: false }, maps: [] },
  { lobe: "sheen", bits: { colorMap: false, roughnessMap: false }, maps: [] }
] as const;

function descriptor(overrides: Partial<ProgramFeatures> = {}): GeneratedPbrDescriptor {
  const features = normalizeProgramFeatures({
    lighting: "lit", doubleSided: true, specularAntialiasing: true,
    maps: { baseColor: { uvSet: 0, transform: false } }, lights, shadows: shadow, extensions,
    environment: "pmrem-cube", features: { "prd02.ibl": true, "prd02.shadowFilter": 3, "prd03.indirectFraction": "indirectFraction" },
    ...overrides
  });
  const generated = generateProgramImpl(features, { flags });
  expect(generated.descriptor).toBeDefined();
  return generated.descriptor!;
}

describe("generated native PBR program contract", () => {
  it("emits the selected PBR WGSL through the real program generator with the same resource manifest", () => {
    const features = normalizeProgramFeatures({
      target: "wgsl", lighting: "lit", vertexColors: true, alphaMode: "mask", fog: "linear",
      maps: { baseColor: { uvSet: 1, transform: true }, normal: { uvSet: 0, transform: false } },
      lights: { ...lights, dir: 1 }, features: { "prd06.deform": "skin4", "a3d.clipping": true }
    });
    const generated = generateProgramImpl(features, { flags });
    const expected = createGeneratedPbrProgram(generated.descriptor!);
    expect(generated.vertex).toContain(expected.vertex);
    expect(generated.fragment).toContain(expected.fragment);
    expect(generated.vertex).toContain("generatedSkin4");
    expect(generated.fragment).toContain("generatedClipRetains");
    expect(generated.fragment).toContain("textureSample(u_baseColorMapTexture");
    expect(expected.resources.map(resource => [resource.uniform, resource.textureBinding]))
      .toEqual([["u_baseColorMap", 2], ["u_dfgLut", 4], ["u_normalMap", 21], ["u_boneTexture", 48]]);
    expect(generated.vertex).toContain("@group(0) @binding(48) var u_boneTextureTexture");
    expect(generated.fragment).toContain("@group(0) @binding(21) var u_normalMapTexture");
    expect(generated.fragment).toContain("@group(1) @binding(0) var<uniform> frame");
    expect(generateProgramImpl(features, { flags })).toEqual(generated);
  });

  it("fails closed on generated WGSL graph, unknown lobe and unresolved provider variants", () => {
    const base = normalizeProgramFeatures({ target: "wgsl", lighting: "lit" });
    const graph = compileShaderGraph({ version: 1, stage: "material",
      nodes: [{ id: "color", op: "constant", type: "vec3", value: [0.2, 0.4, 0.8] }], outputs: { color: "color" } }, "wgsl");
    expect(() => generateProgramImpl(normalizeProgramFeatures({ ...base, graph }), { flags })).toThrow(/shader graphs/);
    expect(() => generateProgramImpl({ ...base, features: { "unknown.effect": true } }, { flags })).toThrow(/unknown.effect/);
    expect(() => generateProgramImpl({ ...base, extensions: [{ lobe: "not-a-lobe", bits: {}, maps: [] }] }, { flags }))
      .toThrow(/inactive, unregistered, or duplicate/);
    expect(() => generateProgramImpl({ ...base, extensions: [
      { lobe: "clearcoat", bits: {}, maps: [] }, { lobe: "KHR_materials_clearcoat", bits: {}, maps: [] }
    ] }, { flags })).toThrow(/duplicate material extension/);
    expect(() => generateProgramImpl({ ...base, features: { "prd02.ibl": true }, environment: "pmrem-cube" }))
      .toThrow(/prd02\.ibl.*no active contributor/);
  });

  it("uses the registered clearcoat preview through the WGSL generator, not a generic PBR stub", () => {
    const features = normalizeProgramFeatures({ target: "wgsl", lighting: "lit",
      lights: { ...lights, dir: 1 }, features: { "a3d.independentPhysicalPreview": true },
      extensions: [{ lobe: "clearcoat", bits: {}, maps: [] }] });
    const program = generateProgramImpl(features, { flags });
    expect(program.descriptor?.activeExtensions.map(extension => extension.lobe)).toEqual(["clearcoat"]);
    expect(program.fragment).toContain("a3dPrd04ClearcoatDirect");
    expect(program.fragment).toContain("coatDirect +=");
    expect(program.fragment).toContain("@group(0) @binding(4) var u_dfgLutTexture");
  });

  it("specializes selected bone-texture skinning and rejects unimplemented deformation combinations", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none", features: { "prd06.deform": "skin4" } });
    const program = createGeneratedPbrProgram(generateProgramImpl(features, { flags }).descriptor!);
    expect(program.skinning).toBe(4);
    expect(program.requiredVertexLocations).toEqual([0, 1, 5, 6]);
    expect(program.resources).toEqual([{ uniform: "u_boneTexture", textureBinding: 48, dimension: "2d", sampleType: "unfilterable-float" }]);
    expect(program.vertex).toContain("textureLoad(u_boneTextureTexture");
    expect(program.vertex).toContain("if (weightSum > 0.0001)");
    expect(program.vertex).toContain("deformedNormal = (skin * vec4f(deformedNormal, 0.0)).xyz");
    expect(program.vertex).toContain("generatedSkin4(vec4f(joints), weights)");
    const skin8 = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...features, features: { "prd06.deform": "skin8" } }), { flags }).descriptor!);
    expect(skin8.requiredVertexLocations).toEqual([0, 1, 5, 6, 8, 9]);
    expect(skin8.vertex).toContain("generatedSkin4(vec4f(joints1), weights1)");
    const instancedSkin8 = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...features, features: { "prd06.deform": "skin8" }, instancing: { color: true } }), { flags }).descriptor!);
    expect(instancedSkin8.requiredInstanceLocations).toEqual([10, 11, 12, 13, 14]);
    expect(instancedSkin8.vertex).toContain("@location(8) joints1: vec4f");
    expect(instancedSkin8.vertex).toContain("@location(10) instance0: vec4f");
    expect(instancedSkin8.vertex).toContain("@location(14) instanceColor: vec4f");
    const morph = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...features, features: { "prd06.deform": "skin4|morph4n|k8" } }), { flags }).descriptor!);
    expect(morph.morph).toEqual({ bucket: 4, normals: true, tangents: false, maxActive: 8 });
    expect(morph.vertex.indexOf("generatedMorphFetch(vertexIndex, target, 0) * weight")).toBeLessThan(morph.vertex.indexOf("generatedSkin4(vec4f(joints), weights)"));
    expect(morph.vertex).toContain("generatedMorphFetch(vertexIndex, target, 1) * weight");
    const tangentMorph = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...features, features: { "prd06.deform": "morph4t|k8" } }), { flags }).descriptor!);
    expect(tangentMorph.morph).toEqual({ bucket: 4, normals: false, tangents: true, maxActive: 8 });
    expect(tangentMorph.requiredVertexLocations).toEqual([0, 1, 3]);
    expect(tangentMorph.vertex).toContain("generatedMorphFetch(vertexIndex, target, 2) * weight");
    expect(tangentMorph.vertex).not.toContain("generatedMorphFetch(vertexIndex, target, 1) * weight");
  });

  it("specializes instance transforms and optional instance color using producer metadata", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", instancing: { color: true }, maps: {}, extensions: [], environment: "none" });
    const program = createGeneratedPbrProgram(generateProgramImpl(features, { flags }).descriptor!);
    expect(program.requiredVertexLocations).toEqual([0, 1]);
    expect(program.requiredInstanceLocations).toEqual([8, 9, 10, 11, 12]);
    expect(program.vertex).toContain("mat4x4f(instance0, instance1, instance2, instance3)");
    expect(program.vertex).toContain("instanceMatrix * material.geometry");
    expect(program.vertex).toContain("generatedWorldNormal(deformedNormal, localTransform)");
    expect(program.fragment).toContain("material.baseColor * input.instanceColor");
    const noColor = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...features, instancing: { color: false } }), { flags }).descriptor!);
    expect(noColor.requiredInstanceLocations).toEqual([8, 9, 10, 11]);
    expect(noColor.fragment).not.toContain("input.instanceColor");
    expect(() => createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...features, instancing: { color: false, emissive: true } }), { flags }).descriptor!)).toThrow(/per-instance emissive/i);
  });

  it("carries vertex RGBA separately from instance color and deformation inputs", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", vertexColors: true, alphaMode: "mask", environment: "none",
      maps: { baseColor: { uvSet: 0, transform: false } }, instancing: { color: true },
      features: { "prd06.deform": "skin8" } });
    const source = generateProgramImpl(features, { flags }).descriptor!;
    const program = createGeneratedPbrProgram(source);
    expect(program.requiredVertexLocations).toEqual([0, 1, 2, 4, 5, 6, 8, 9]);
    expect(program.requiredInstanceLocations).toEqual([10, 11, 12, 13, 14]);
    expect(program.vertex).toContain("@location(4) color: vec4f");
    expect(program.vertex).toContain("@location(9) color: vec4f");
    expect(program.vertex).toContain("output.color = color");
    expect(program.fragment).toContain("material.baseColor * input.color * textureSample(");
    expect(program.fragment).toContain(" * input.instanceColor");
    expect(program.fragment).toContain("base.a < material.controls.x");
    const inconsistent = { ...source.defines }; delete inconsistent.VERTEX_COLORS;
    expect(() => createGeneratedPbrProgram({ ...source, defines: inconsistent })).toThrow(/VERTEX_COLORS/);
  });

  it("uses framebuffer-correct flat normals and the generated Burley direct-diffuse response", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", flatShading: true, diffuseModel: "burley", doubleSided: true,
      lights: { ...lights, dir: 1 }, environment: "none", maps: { normal: { uvSet: 0, transform: false } }, extensions: [] });
    const source = generateProgramImpl(features, { flags }).descriptor!;
    const program = createGeneratedPbrProgram(source);
    expect(program.fragment).toContain("normalize(cross(dpdy(input.worldPosition), dpdx(input.worldPosition)))");
    expect(program.fragment).toContain("select(-interpolatedNormal, interpolatedNormal, frontFacing)");
    expect(program.fragment).toContain("let tangent = (positionDx * uvDy.y - positionDy * uvDx.y)");
    expect(program.fragment).toContain("let grazing = 0.5 + 2.0 * lh * lh * clamp(roughness, 0.0, 1.0)");
    expect(program.fragment).toContain("directDiffuse += directResult.diffuse * generatedBurley(n, view, light.direction, roughness); directSpecular += directResult.specular");
    const cross = (a: readonly number[], b: readonly number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    cross([0, -1, 0], [1, 0, 0]).forEach((value, index) => expect(value).toBeCloseTo(cross([1, 0, 0], [0, 1, 0])[index]!));
    const flatMismatch = { ...source.defines }; delete flatMismatch.FLAT_SHADING;
    expect(() => createGeneratedPbrProgram({ ...source, defines: flatMismatch })).toThrow(/FLAT_SHADING/);
    const diffuseMismatch = { ...source.defines }; delete diffuseMismatch.DIFFUSE_BURLEY;
    expect(() => createGeneratedPbrProgram({ ...source, defines: diffuseMismatch })).toThrow(/DIFFUSE_BURLEY/);
  });

  it("clips world and deformed local geometry with grouped all/any planes", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none", vertexColors: true,
      instancing: { color: true }, features: { "a3d.clipping": true, "prd06.deform": "skin8|morph4n|k8" } });
    const source = generateProgramImpl(features, { flags }).descriptor!;
    const program = createGeneratedPbrProgram(source);
    expect(program.clipping).toBe(true);
    expect(program.vertex).toContain("output.clipLocal = (material.geometry * vec4f(deformedPosition, 1.0)).xyz");
    expect(program.vertex.indexOf("deformedPosition = (skin * vec4f(deformedPosition, 1.0)).xyz"))
      .toBeLessThan(program.vertex.indexOf("output.clipLocal ="));
    expect(program.vertex).toContain("let world = material.model * localTransform * vec4f(deformedPosition, 1.0)");
    expect(program.fragment).toContain("select(worldPosition, localPosition, params.w > 0.5)");
    expect(program.fragment).toContain("retained = retained || inside");
    expect(program.fragment).toContain("retained = retained && inside");
    expect(program.fragment.indexOf("if (!generatedClipRetains(input.worldPosition, input.clipLocal)) { discard; }"))
      .toBeGreaterThan(program.fragment.indexOf("let color = max("));
    const inconsistent = { ...source.defines }; delete inconsistent.A3D_CLIPPING;
    expect(() => createGeneratedPbrProgram({ ...source, defines: inconsistent })).toThrow(/A3D_CLIPPING/);
    const binding = createClippingBinding({ backend: "webgpu", global: { planes: [[1, 0, 0, 0]] },
      material: { space: "local", combine: "union", planes: [[0, 1, 0, 0], [0, 0, 1, 0]] } });
    expect(clippingRetainsPoint(binding, [1, 0, 0], [0, -1, 1])).toBe(true);
    expect(clippingRetainsPoint(binding, [1, 0, 0], [0, -1, -1])).toBe(false);
    expect(clippingRetainsPoint(binding, [-1, 0, 0], [0, 1, 1])).toBe(false);
    const packed = packGeneratedPbrMaterialUniforms(createClippingUniforms(binding));
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.clipControl!, true)).toBe(2);
    expect([0, 1, 2, 3].map(index => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.clipGroups! + 16 + index * 4, true))).toEqual([1, 2, 1, 1]);
    expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.clipPlanes!, true)).toBe(1);
  });

  it("consumes the real producer descriptor for probe IBL, sheen and tagged indirect output", () => {
    const source = descriptor();
    expect(source.activeFeatures.map(({ id }) => id)).toEqual(expect.arrayContaining(["prd02.ibl", "prd02.shadowFilter", "prd03.indirectFraction"]));
    expect(source.lighting).toEqual({ compilerLightingConjunction: true, iblReplacesIndirect: true });
    expect(source.activeExtensions.map(({ lobe }) => lobe)).toEqual(expect.arrayContaining(["sheen", "emissive-strength"]));
    const program = createGeneratedPbrProgram(source);
    expect(program.frameBinding).toEqual({ group: 1, binding: 0, minimumByteLength: 304 });
    expect(program.materialBinding).toEqual({ group: 0, binding: 0, byteLength: GENERATED_PBR_MATERIAL_LAYOUT.size });
    expect(program.resources.map((resource) => [resource.uniform, "samplerBinding" in resource ? resource.samplerBinding : null, resource.textureBinding, resource.dimension])).toEqual([
      ["u_baseColorMap", 1, 2, "2d"], ["u_dfgLut", 3, 4, "2d"],
      ["u_envSpecular", 5, 6, "cube"]
    ]);
    expect(program.requiredVertexLocations).toEqual([0, 1, 2]);
    expect(program.requiresFloatColorAttachment).toBe(true);
    expect(() => validateGeneratedPbrTarget(program, "rgba16float")).not.toThrow();
    expect(() => validateGeneratedPbrTarget(program, "rgba8unorm")).toThrow(/floating target/);
    expect(() => validateGeneratedPbrTarget(program, "rgba16float", true)).toThrow(/authored-alpha/);
    expect(program.vertex).toContain("frame.viewProjection * world");
    expect(program.vertex).toContain("mat3x3f(crossBC, cross(c, a), cross(a, b)) * normal");
    expect(program.vertex).toContain("material.normal * vec4f(localNormal, 0.0)");
    expect(program.fragment).toContain("dpdx(geometryNormal)");
    expect(program.fragment).toContain("generatedProbeIrradiance(n)");
    expect(program.fragment).toContain("material.sh[6].xyz");
    expect(program.fragment).toContain("textureSampleLevel(u_envSpecularTexture");
    expect(program.fragment).toContain("generatedSheenAlbedo");
    expect(program.fragment).toContain("material.ambient.rgb * material.ambient.a + irradiance / A3D_PHYSICAL_PI");
    expect(program.fragment).toContain("indirectDiffuse + indirectSpecular");
    expect(program.fragment).toContain("let alpha = 2.0 +");
  });

  it("selects procedural hemisphere resources and retains authored alpha for blended draws", () => {
    const source = descriptor({
      lights: { ...lights, hemisphere: true }, environment: "none", alphaMode: "blend",
      features: { "prd02.shadowFilter": 3, "prd03.indirectFraction": "indirectFraction" }
    });
    const program = createGeneratedPbrProgram(source);
    expect(program.resources.map(({ uniform }) => uniform)).toEqual(["u_baseColorMap", "u_dfgLut"]);
    expect(program.fragment).toContain("generatedProceduralDiffuse(n)");
    expect(program.fragment).toContain("generatedProceduralSpecular(reflected, roughness)");
    expect(program.fragment).toContain("let alpha = base.a;");
    expect(program.fragment).not.toContain("let alpha = 2.0 +");
    expect(program.requiresFloatColorAttachment).toBe(false);
    expect(() => validateGeneratedPbrTarget(program, "rgba8unorm", true)).not.toThrow();
  });

  it("samples cube or equirectangular environments with the resolved compiler-lighting conjunction", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "equirect", lights: { ...lights, hemisphere: true }, features: { "prd02.localProbe": true } });
    const conjunction = generateProgramImpl(features, { flags });
    const program = createGeneratedPbrProgram(conjunction.descriptor!);
    expect(program.resources.map(({ uniform, dimension }) => [uniform, dimension])).toEqual([
      ["u_dfgLut", "2d"], ["u_environmentMap", "2d"], ["u_prd02ProbeCubeA", "cube"], ["u_prd02ProbeCubeB", "cube"]
    ]);
    expect(program.fragment).toContain("atan2(normalize(direction).z, normalize(direction).x)");
    expect(program.fragment).toContain("acos(clamp(normalize(direction).y, -1.0, 1.0))");
    expect(program.fragment).toContain("exp2(exponent - 128.0)");
    expect(program.fragment).toContain("generatedSampleEnvironment(n, 8.0)");
    expect(program.fragment).not.toContain("let extraProcedural =");
    const flagsOff: QrFlags = { values: {}, on: (flag) => flag !== "A3D_QR_COMPILER" };
    const withoutConjunction = createGeneratedPbrProgram(generateProgramImpl(features, { flags: flagsOff }).descriptor!);
    expect(withoutConjunction.fragment).toContain("let extraProcedural = generatedProceduralSpecular(reflected, roughness) * material.localWeights.z");
    const cubeFeatures = normalizeProgramFeatures({ ...features, environment: "pmrem-cube", lights, features: {} });
    const cube = createGeneratedPbrProgram(generateProgramImpl(cubeFeatures, { flags }).descriptor!);
    expect(cube.resources.map(({ uniform, dimension }) => [uniform, dimension])).toEqual([["u_dfgLut", "2d"], ["u_environmentCubeMap", "cube"]]);
    expect(cube.fragment).toContain("generatedRotateY(normalize(direction), material.envMap.y * (2.0 * A3D_PHYSICAL_PI))");
  });

  it("uses explicitly selected local probes with separate box centers and capture origins", () => {
    const features = { "prd02.ibl": true, "prd02.shadowFilter": 3, "prd03.indirectFraction": "indirectFraction", "prd02.localProbe": true };
    const program = createGeneratedPbrProgram(descriptor({ features }));
    expect(program.resources.slice(-2)).toEqual([
      { uniform: "u_prd02ProbeCubeA", samplerBinding: 9, textureBinding: 10, dimension: "cube", sampleType: "filterable-float", optionalWhenWeightZero: { uniform: "u_prd02ProbeWeights", component: 0 } },
      { uniform: "u_prd02ProbeCubeB", samplerBinding: 11, textureBinding: 12, dimension: "cube", sampleType: "filterable-float", optionalWhenWeightZero: { uniform: "u_prd02ProbeWeights", component: 1 } }
    ]);
    expect(program.fragment).toContain("if (center.w <= 0.5) { return ray; }");
    expect(program.fragment).toContain("select(center.xyz, capture.xyz, capture.w > 0.5)");
    expect(program.fragment).toContain("world + ray * hitDistance - origin");
    expect(program.fragment).toContain("globalRadiance * material.localWeights.z + generatedLocalProbeRadiance");
    expect(program.fragment).toContain("material.localWeights.w - 1.0");
    // SH irradiance remains unweighted: local probes alter reflected radiance only.
    expect(program.fragment).toContain("let irradiance = generatedProbeIrradiance(n);");
    const localOnly = createGeneratedPbrProgram(descriptor({ environment: "none", features: { "prd02.localProbe": true } }));
    expect(localOnly.resources.map(({ uniform }) => uniform)).toEqual(["u_baseColorMap", "u_dfgLut", "u_prd02ProbeCubeA", "u_prd02ProbeCubeB"]);
    expect(localOnly.fragment).toContain("localRadiance, localIrradiance, pbr, dfg");
  });

  it("binds completed irradiance-volume arrays and mixes raw SH into the selected global diffuse path", () => {
    const feature = { "prd02.ibl": true, "prd02.shadowFilter": 3, "prd03.indirectFraction": "indirectFraction", "prd02.irradianceVolume": true };
    const program = createGeneratedPbrProgram(descriptor({ features: feature }));
    expect(program.resources.slice(-3)).toEqual([
      { uniform: "u_prd02IrradianceR", textureBinding: 13, dimension: "2d-array", sampleType: "unfilterable-float" },
      { uniform: "u_prd02IrradianceG", textureBinding: 14, dimension: "2d-array", sampleType: "unfilterable-float" },
      { uniform: "u_prd02IrradianceB", textureBinding: 15, dimension: "2d-array", sampleType: "unfilterable-float" }
    ]);
    expect(program.fragment).toContain("texture_2d_array<f32>");
    expect(program.fragment).toContain("textureLoad(source, lower.xy, lower.z, 0)");
    expect(program.fragment).toContain("world + n * cell * 0.5");
    expect(program.fragment).toContain("0.282095 * A3D_PHYSICAL_PI");
    expect(program.fragment).toContain("2.0 * A3D_PHYSICAL_PI / 3.0");
    expect(program.fragment).toContain("mix(globalIrradiance, local, fade)");
    expect(program.fragment).toContain("generatedVolumeIrradiance(input.worldPosition, n, generatedProbeIrradiance(n))");
    expect(program.fragment).toContain("material.ambientIrradiance.rgb + hemi / A3D_PHYSICAL_PI");
    const procedural = createGeneratedPbrProgram(descriptor({ environment: "none", lights: { ...lights, hemisphere: true }, features: { "prd02.irradianceVolume": true } }));
    expect(procedural.fragment).toContain("generatedVolumeIrradiance(input.worldPosition, n, A3D_PHYSICAL_PI * generatedProceduralDiffuse(n))");
    const volumeOnly = createGeneratedPbrProgram(descriptor({ environment: "none", features: { "prd02.irradianceVolume": true } }));
    expect(volumeOnly.fragment).toContain("generatedVolumeIrradiance(input.worldPosition, n, vec3f(0.0))");
    expect(volumeOnly.fragment).toContain("indirectDiffuse += indirect.diffuse; indirectSpecular += indirect.specular;");
    const uniforms = new Map<string, UniformValue>([["u_prd02IrradianceMin", [-3, -2, -1, 0]], ["u_prd02IrradianceMax", [3, 4, 5, 0]], ["u_prd02IrradianceGrid", [2, 3, 4, 0.75]]]);
    const bytes = packGeneratedPbrMaterialUniforms(uniforms);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const get = (name: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true);
    expect([get("volumeMin", 0), get("volumeMax", 2), get("volumeGrid", 2), get("volumeGrid", 3)]).toEqual([-3, 5, 4, 0.75]);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([["u_prd02IrradianceGrid", [2, 2, 2, 1]]]))).toThrow(/Incomplete irradiance-volume/);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([...uniforms, ["u_prd02IrradianceGrid", [0, 2, 2, 1]]]))).toThrow(/Invalid irradiance-volume/);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([...uniforms, ["u_prd02IrradianceMin", [1, -2, -1, 0]], ["u_prd02IrradianceMax", [1 + 1e-12, 4, 5, 0]]]))).toThrow(/Invalid irradiance-volume/);
  });

  it("packs real draw values in the declared WGSL layout without dropping SH coefficients", () => {
    const matrix = Array.from({ length: 16 }, (_, index) => index + 1);
    const sh = Float32Array.from({ length: 28 }, (_, index) => (index + 1) / 4);
    const uniforms = new Map<string, UniformValue>([
      ["u_modelMatrix", matrix], ["u_baseColor", [0.2, 0.4, 0.6, 0.8]],
      ["u_metallic", 0.7], ["u_roughness", 0.3], ["u_ior", 1.4], ["u_specularIntensity", 0.9],
      ["u_envSH", sh], ["u_envMipCount", 7], ["u_envRotation", 0.6],
      ["u_ambientIrradiance", [0.1, 0.2, 0.3]], ["u_hemiSky", [0.6, 0.7, 0.8]],
      ["u_a3dProceduralSkyColor", [0.4, 0.5, 0.6]], ["u_a3dProceduralIntensity", 2],
      ["u_prd02ProbeCenterA", [5, 6, 7, 1]], ["u_prd02ProbeOriginA", [1, 2, 3, 1]],
      ["u_prd02ProbeHalfA", [2, 3, 4, 0]], ["u_prd02ProbeWeights", [0.25, 0, 0.75, 5]], ["u_a3dLocalProbeIntensity", 0.8]
    ]);
    const bytes = packGeneratedPbrMaterialUniforms(uniforms);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const get = (name: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true);
    expect(bytes.byteLength).toBe(GENERATED_PBR_MATERIAL_LAYOUT.size);
    expect(GENERATED_PBR_MATERIAL_OFFSETS).toMatchObject({ model: 0, geometry: 64, normal: 128, baseColor: 192 });
    expect([get("model", 0), get("model", 15), get("geometry", 0), get("geometry", 15)]).toEqual([1, 16, 1, 1]);
    expect([get("baseColor", 0), get("baseColor", 3)]).toEqual([expect.closeTo(0.2), expect.closeTo(0.8)]);
    expect([get("surface", 0), get("surface", 1), get("surface", 2), get("surface", 3)]).toEqual([expect.closeTo(0.7), expect.closeTo(0.3), expect.closeTo(1.4), expect.closeTo(0.9)]);
    expect([get("probe", 0), get("probe", 1)]).toEqual([7, expect.closeTo(0.6)]);
    expect([get("procSky", 0), get("procSky", 3)]).toEqual([expect.closeTo(0.4), 2]);
    expect([get("localCenterA", 0), get("localCenterA", 1), get("localCenterA", 2)]).toEqual([5, 6, 7]);
    expect([get("localOriginA", 0), get("localOriginA", 1), get("localOriginA", 2)]).toEqual([1, 2, 3]);
    expect([get("localHalfA", 0), get("localHalfA", 1), get("localHalfA", 2)]).toEqual([2, 3, 4]);
    expect([get("localWeights", 0), get("localWeights", 2), get("localWeights", 3), get("controls", 1)]).toEqual([0.25, 0.75, 5, expect.closeTo(0.8)]);
    for (let index = 0; index < 28; index += 1) expect(get("sh", index)).toBe(sh[index]);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([["u_envSH", new Float32Array(27)]]))).toThrow(/u_envSH/);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([["u_metallic", Number.NaN]]))).toThrow(/u_metallic/);
  });

  it("retains the once-convolved environment SH coefficients in its material bytes", () => {
    const radiance = new Float32Array(27).fill(1);
    const irradiance = packEnvSH(radiance);
    const bytes = packGeneratedPbrMaterialUniforms(new Map([["u_envSH", irradiance]]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < 27; index += 1) {
      const bandFactor = index < 3 ? Math.PI : index < 12 ? 2 * Math.PI / 3 : Math.PI / 4;
      expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.sh! + 4 * index, true)).toBeCloseTo(bandFactor, 6);
    }
    const program = createGeneratedPbrProgram(descriptor());
    expect(program.fragment).toContain("let irradiance = c0 * 0.282095");
    expect(program.fragment).toContain("return max(irradiance, vec3f(0.0)) * material.probe.z;");
  });

  it("binds packed non-shadowed direct lights and uses their rough diffuse inputs", () => {
    const source = descriptor({ lights: { ...lights, dir: 1, point: 1, spot: 1 }, environment: "none", features: {} });
    const program = createGeneratedPbrProgram(source);
    expect(program.resources.map(({ uniform }) => uniform)).toEqual(["u_baseColorMap", "u_dfgLut"]);
    expect(program.fragment).toContain("slot < 3u");
    expect(program.fragment).toContain("let spot = material.lights[index * 6u + 3u]");
    expect(program.fragment).toContain("attenuation *= smoothstep(outer, inner, cone)");
    expect(program.fragment).toContain("a3dPhysicalDirect(n, view, light.direction, light.radiance, pbr, viewDfg, lightDfg)");
    expect(program.fragment).toContain("generatedSheenDirect(n, view, light.direction");
    const lightData = Float32Array.from({ length: 24 }, (_, index) => index + 0.5);
    const bytes = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
      ["u_lightCount", 1], ["u_lightData", lightData], ["u_diffuseRoughness", 0.3], ["u_retroreflection", 0.4]
    ]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const get = (name: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true);
    expect([get("direct", 0), get("direct", 1), get("direct", 2)]).toEqual([1, expect.closeTo(0.3), expect.closeTo(0.4)]);
    for (let index = 0; index < 24; index += 1) expect(get("lights", index)).toBe(lightData[index]);
    expect(get("lights", 24)).toBe(0);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([["u_lightCount", 17]]))).toThrow(/u_lightCount/);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([["u_lightCount", 1]]))).toThrow(/u_lightData/);
    expect(() => packGeneratedPbrMaterialUniforms(new Map([["u_lightData", new Float32Array([NaN])]]))).toThrow(/u_lightData/);
  });

  it("selects clustered light rows, fixed-size edge tiles and per-light shadow packets", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none",
      lights: { ...lights, dir: 8, point: 8, spot: 8, clustered: true }, shadows: { ...shadow, cascades: 1, localShadows: 6, contact: true },
      features: { "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true } });
    const source = generateProgramImpl(features, { flags }).descriptor!;
    const program = createGeneratedPbrProgram(source);
    expect([program.clustered, program.directLightBound]).toEqual([true, 0]);
    expect(program.resources).toEqual(expect.arrayContaining([
      { uniform: "u_clusterLightData", textureBinding: 73, dimension: "2d", sampleType: "unfilterable-float" },
      { uniform: "u_clusterLightIndices", textureBinding: 74, dimension: "2d", sampleType: "unfilterable-float" }
    ]));
    expect(program.fragment).toContain("vec2f(input.position.x, material.clusterGrid.w - input.position.y)");
    expect(program.fragment).toContain("floor(clusterPixel / 64.0)");
    expect(program.fragment).toContain("textureLoad(u_clusterLightIndicesTexture, vec2i(i32(slot), cluster), 0).r");
    expect(program.fragment).toContain("textureLoad(u_clusterLightDataTexture, vec2i(4, i32(index)), 0)");
    expect(program.fragment).not.toContain("material.lights[index * 6u");
    expect(program.fragment).toContain("f32(index) == material.contactShadow.w");
    expect(program.fragment).toContain("generatedForwardShadow(input.worldPosition, n, light.direction)");
    expect(program.fragment).toContain("generatedLocalShadow(directionKind.w, areaRight.w");
    expect(program.fragment).toContain("generatedPointShadow(input.worldPosition, n, light.direction)");
    expect(program.fragment).toContain("generatedSpotShadow(input.worldPosition, n, light.direction)");
    const invalid = { ...source.defines }; delete invalid.LIGHTS_CLUSTERED;
    expect(() => createGeneratedPbrProgram({ ...source, defines: invalid })).toThrow(/LIGHTS_CLUSTERED/);
  });

  it("integrates finite one-sided rectangle samples through the same direct lobes", () => {
    for (const clustered of [false, true]) {
      const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, environment: "none",
        lights: { ...lights, rect: 1, clustered }, extensions: [
          { lobe: "clearcoat", maps: [], bits: {} }, { lobe: "sheen", maps: [], bits: {} },
          { lobe: "diffuse-transmission", maps: [], bits: {} }
        ] });
      const program = createGeneratedPbrProgram(generateProgramImpl(features, { flags }).descriptor!);
      expect(program.rectLights).toBe(true);
      expect(program.directLightBound).toBe(clustered ? 0 : 1);
      expect(program.fragment).toContain("0.28867513459");
      expect(program.fragment).toContain("(width * height * 0.25) * emitterCosine * cutoff / max(distanceToLight * distanceToLight, 0.01)");
      // One-sided emitters clamp the emitter cosine; the packed two-sided bit
      // (areaUp.w, shared with the GLSL path) is the only way to light the back.
      expect(program.fragment).toContain("let facing = dot(emitterNormal, -light.direction);");
      expect(program.fragment).toContain("select(max(facing, 0.0), abs(facing), areaUp.w > 0.5)");
      expect(program.fragment).toContain("select(1u, 4u, directionKind.w > 2.5)");
      expect(program.fragment).toContain("directDiffuse += directResult.diffuse; directSpecular += directResult.specular");
      expect(program.fragment).toContain("sheenDirect += light.radiance");
      expect(program.fragment).toContain("coatDirect += light.radiance");
      expect(program.fragment).toContain("diffuseTransmissionDirect += max(light.radiance");
      expect(program.fragment).toContain(clustered ? "textureLoad(u_clusterLightDataTexture, vec2i(5, i32(index)), 0)" : "material.lights[index * 6u + 5u]");
    }
  });

  it("uses the selected forward cascade and PCF kernel only on casting directional and spot lights", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none",
      lights: { ...lights, dir: 1, point: 1, spot: 1 }, shadows: { ...shadow, cascades: 3 } });
    const program = createGeneratedPbrProgram(generateProgramImpl(features, { flags }).descriptor!);
    expect(program.resources).toContainEqual({ uniform: "u_shadowMapTexture", samplerBinding: 50, textureBinding: 51, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
    expect(program.fragment).toContain("material.shadowMatrix * vec4f(world + receiverNormal * material.shadowTexel.z, 1.0)");
    expect(program.fragment).toContain("vec2f(uv.x + offset.x, 1.0 - uv.y - offset.y)");
    expect(program.fragment).toContain("material.shadowSamples[u32(i)]");
    expect(program.fragment).toContain("receiver - bias > stored");
    expect(program.fragment).toContain("let castsShadow = spot.z");
    expect(program.fragment).toContain("light.radiance *= generatedForwardShadow(input.worldPosition, n, light.direction)");
    const samples = new Float32Array(128); samples.set([2, -1, 0.25, 0], 4);
    const packed = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
      ["u_shadowMapMatrix", Float32Array.from({ length: 16 }, (_, i) => i)],
      ["u_shadowMapEnabled", 1], ["u_shadowMapStrength", 0.75], ["u_shadowMapBias", 0.02],
      ["u_shadowMapSlopeBias", 0.5], ["u_shadowMapNormalBias", 0.1], ["u_shadowMapTexelSize", [0.125, 0.25]],
      ["u_shadowPcfSampleCount", 2], ["u_shadowPcfSamples", samples]
    ]));
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    const get = (name: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true);
    expect([get("shadowMatrix", 15), get("shadowParams", 0), get("shadowParams", 1)]).toEqual([15, 1, 0.75]);
    expect([get("shadowTexel", 0), get("shadowTexel", 1), get("shadowTexel", 3)]).toEqual([0.125, 0.25, 2]);
    expect([get("shadowSamples", 4), get("shadowSamples", 5), get("shadowSamples", 6)]).toEqual([2, -1, 0.25]);
    const noLights = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...features, lights }), { flags }).descriptor!);
    expect(noLights.resources.some(resource => resource.uniform === "u_shadowMapTexture")).toBe(false);
  });

  it("selects local-only shadow tiles and reproduces the filtered atlas comparison", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none",
      lights: { ...lights, point: 1, spot: 1 }, shadows: { ...shadow, cascades: 0, localShadows: 6 } });
    const program = createGeneratedPbrProgram(generateProgramImpl(features, { flags }).descriptor!);
    expect(program.resources).toContainEqual({ uniform: "u_localShadowAtlas", samplerBinding: 52, textureBinding: 53, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
    expect(program.resources.some(resource => resource.uniform === "u_shadowMapTexture")).toBe(false);
    expect(program.fragment).toContain("1.0 - uv.y");
    expect(program.fragment).toContain("mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y)");
    expect(program.fragment).toContain("direction.x >= 0.0");
    expect(program.fragment).toContain("let areaRight = material.lights[index * 6u + 4u]");
    expect(program.fragment).toContain("generatedLocalShadow(directionKind.w, areaRight.w");
    expect(program.fragment).toContain("light.radiance *= generatedLocalShadow");
    const matrices = Float32Array.from({ length: 96 }, (_, index) => index);
    const rects = Float32Array.from({ length: 24 }, (_, index) => index / 32);
    const bytes = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
      ["u_localShadowMatrices", matrices], ["u_localShadowRects", rects],
      ["u_localShadowTexelScale", [1, 2, 3, 4, 5, 6, 0, 0]], ["u_localShadowParams", [1, 2, 3, 4]], ["u_localShadowAtlasTexel", [0.25, 0.125]]
    ]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const get = (name: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true);
    expect([get("localShadowMatrices", 95), get("localShadowRects", 23), get("localShadowScales", 5)]).toEqual([95, rects[23], 6]);
    expect([get("localShadowParams", 3), get("localShadowTexel", 0), get("localShadowTexel", 1)]).toEqual([4, 0.25, 0.125]);
    const invalid = { ...generateProgramImpl(features, { flags }).descriptor!, defines: { ...generateProgramImpl(features, { flags }).descriptor!.defines, NUM_LOCAL_SHADOWS: 7 } };
    expect(() => createGeneratedPbrProgram(invalid)).toThrow(/local shadow metadata/);
  });

  it("uses the selected capture for scalar, mapped, volume and dispersive refraction", () => {
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, environment: "none",
      extensions: [{ lobe: "transmission", bits: { map: false }, maps: [] }], features: { "prd04.transmissionTarget": true } });
    const source = generateProgramImpl(features, { flags }).descriptor!;
    const program = createGeneratedPbrProgram(source);
    expect(program.transmission).toBe(true);
    expect(program.resources).toEqual([
      { uniform: "u_dfgLut", samplerBinding: 3, textureBinding: 4, dimension: "2d", sampleType: "filterable-float" },
      { uniform: "a3d_prd04_transmissionSampler", samplerBinding: 54, textureBinding: 55, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" }
    ]);
    expect(program.fragment).toContain("frame.projection * frame.view * vec4f(world + ray, 1.0)");
    expect(program.fragment).toContain("vec2f(uv.x, 1.0 - uv.y), lod");
    expect(program.fragment).toContain("textureNumLevels(a3d_prd04_transmissionSamplerTexture)");
    expect(program.fragment).toContain("(vec3f(1.0) - transReflectance) * diffuseColor * transmittedScene");
    expect(program.fragment).toContain("mix(directDiffuse + indirectDiffuse, transmitted, clamp(material.transmission.x, 0.0, 1.0))");
    const packed = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_transmissionFactor", 0.75], ["a3d_prd04_transmissionSamplerSize", [8, 4]]]));
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect([0, 1, 2].map(index => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.transmission! + index * 4, true))).toEqual([0.75, 8, 4]);
    const missingCapture = { ...source, activeFeatures: source.activeFeatures.filter(item => item.id !== "prd04.transmissionTarget") };
    expect(() => createGeneratedPbrProgram(missingCapture)).toThrow(/captured target/);
    const mappedFeatures = normalizeProgramFeatures({ ...features, extensions: [
      { lobe: "transmission", bits: { map: true }, maps: ["transmission"], mapUvSets: { transmission: 1 } },
      { lobe: "volume", bits: { thicknessMap: true }, maps: ["volumeThickness"], mapUvSets: { volumeThickness: 0 } },
      { lobe: "dispersion", bits: {}, maps: [] }
    ] });
    const mapped = createGeneratedPbrProgram(generateProgramImpl(mappedFeatures, { flags }).descriptor!);
    expect([mapped.transmissionMap, mapped.materialVolume, mapped.thicknessMap, mapped.dispersion]).toEqual([true, true, true, true]);
    expect(mapped.requiredVertexLocations).toEqual([0, 1, 2, 7]);
    expect(mapped.resources).toEqual(expect.arrayContaining([
      { uniform: "u_transmissionTexture", samplerBinding: 59, textureBinding: 60, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_volumeThicknessTexture", samplerBinding: 61, textureBinding: 62, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" }
    ]));
    expect(mapped.fragment).toContain("material.transmissionTransform * vec3f(input.uv1, 1.0)");
    expect(mapped.fragment).toContain("material.thicknessTransform * vec3f(input.uv, 1.0)");
    expect(mapped.fragment).toContain("max(material.volumeMaterial.x * thicknessSample, 0.0)");
    expect(mapped.fragment).toContain("material.transmission.x * transmissionSample");
    expect(mapped.fragment).toContain("transmittedScene[band] = sampleValue[band]");
    expect(mapped.fragment).toContain("generatedVolumeAttenuation(length(ray))");
    expect(mapped.fragment).toContain("let volumeWorld = material.model * material.geometry");
    expect(mapped.fragment).toContain("vec3f(dot(row0, direction), dot(row1, direction), dot(row2, direction)) / det");
    expect(mapped.fragment).toContain("bandIor[band], thickness, volumeLinear");
    const geometry = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1];
    const model = [-1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const volumePacked = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_volumeAttenuationDistance", Infinity], ["u_volumeThicknessFactor", 2], ["u_dispersion", 0.5], ["u_modelMatrix", model], ["u_geometryMatrix", geometry]]));
    const volumeView = new DataView(volumePacked.buffer, volumePacked.byteOffset, volumePacked.byteLength);
    expect(volumeView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.volumeMaterial!, true)).toBe(2);
    expect(Number.isFinite(volumeView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.volumeMaterial! + 4, true))).toBe(true);
    expect([0, 5, 10].map(index => volumeView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.geometry! + index * 4, true))).toEqual([2, 3, 4]);
    expect([0, 5, 10].map(index => volumeView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.model! + index * 4, true))).toEqual([-1, 2, 1]);
    const instancedSource = generateProgramImpl(normalizeProgramFeatures({ ...mappedFeatures, instancing: { color: false } }), { flags }).descriptor!;
    expect(instancedSource.defines.A3D_INSTANCE_VOLUME_TRANSFORM).toBe(true);
    const instanced = createGeneratedPbrProgram(instancedSource);
    expect(instanced.requiredInstanceLocations).toEqual([8, 9, 10, 11]);
    expect(instanced.vertex).toContain("let volumeWorld = material.model * localTransform");
    expect(instanced.vertex).toContain("@location(6) @interpolate(flat) volume0: vec3f");
    expect(instanced.vertex).toContain("output.volume2 = volumeWorld[2].xyz");
    expect(instanced.fragment).toContain("let volumeLinear = mat3x3f(input.volume0, input.volume1, input.volume2)");
    expect(instanced.fragment).toContain("bandIor[band], thickness, volumeLinear");
    const invalidDefines = { ...instancedSource.defines }; delete invalidDefines.A3D_INSTANCE_VOLUME_TRANSFORM;
    expect(() => createGeneratedPbrProgram({ ...instancedSource, defines: invalidDefines })).toThrow(/A3D_INSTANCE_VOLUME_TRANSFORM/);
  });

  it("uses opposite-side lighting and independent glTF diffuse-transmission maps", () => {
    const feature = normalizeProgramFeatures({ lighting: "lit", environment: "none", lights: { ...lights, dir: 1 }, maps: {},
      extensions: [{ lobe: "KHR_materials_diffuse_transmission", maps: ["diffuseTransmission", "diffuseTransmissionColor"],
        mapUvSets: { diffuseTransmission: 1, diffuseTransmissionColor: 0 }, bits: { map: true, colorMap: true } }] });
    const source = generateProgramImpl(feature, { flags }).descriptor!;
    const program = createGeneratedPbrProgram(source);
    expect([program.diffuseTransmission, program.diffuseTransmissionMap, program.diffuseTransmissionColorMap]).toEqual([true, true, true]);
    expect(program.requiredVertexLocations).toEqual([0, 1, 2, 7]);
    expect(program.resources).toEqual(expect.arrayContaining([
      { uniform: "u_diffuseTransmissionTexture", samplerBinding: 69, textureBinding: 70, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_diffuseTransmissionColorTexture", samplerBinding: 71, textureBinding: 72, dimension: "2d", sampleType: "filterable-float" }
    ]));
    expect(program.fragment).toContain("material.diffuseTransmissionTransform * vec3f(input.uv1, 1.0)).xy).a");
    expect(program.fragment).toContain("material.diffuseTransmissionColorTransform * vec3f(input.uv, 1.0)).xy).rgb");
    expect(program.fragment).toContain("clamp(clamp(material.diffuseTransmission.w, 0.0, 1.0) * diffuseTransmissionSample, 0.0, 1.0)");
    expect(program.fragment).toContain("clamp(clamp(material.diffuseTransmission.rgb, vec3f(0.0), vec3f(1.0)) * diffuseTransmissionColorSample, vec3f(0.0), vec3f(1.0))");
    expect(program.fragment).toContain("let backNl = clamp(-dot(n, light.direction), 0.0, 1.0)");
    expect(program.fragment).toContain("diffuseTransmissionWeight = diffuseTransmissionFactor * (1.0 - clamp(metallic, 0.0, 1.0))");
    expect(program.fragment).toContain("a3dPhysicalFresnel(diffuseF0, f90, backNl)");
    expect(program.fragment).toContain("directDiffuse = directDiffuse * (1.0 - diffuseTransmissionFactor) + diffuseTransmissionDirect");
    const packed = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_diffuseTransmissionFactor", 0.25],
      ["u_diffuseTransmissionColorFactor", [0.25, 0.5, 0.75]], ["u_diffuseTransmissionTextureUvTransform", [2, 0, 0, 0, 3, 0, 0.25, 0.5, 1]]]));
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect([0, 1, 2, 3].map(index => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.diffuseTransmission! + index * 4, true))).toEqual([0.25, 0.5, 0.75, 0.25]);
    expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.diffuseTransmissionTransform!, true)).toBe(2);
    const withProbe = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...feature, environment: "pmrem-cube",
      features: { "prd02.ibl": true, "prd02.irradianceVolume": true } }), { flags }).descriptor!);
    expect(withProbe.fragment).toContain("generatedVolumeIrradiance(input.worldPosition, -n, generatedProbeIrradiance(-n))");
    expect(withProbe.fragment).toContain("dot(-n, material.hemiDirection.xyz)");
    const withProcedural = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...feature,
      lights: { ...feature.lights, hemisphere: true } }), { flags }).descriptor!);
    expect(withProcedural.fragment).toContain("A3D_PHYSICAL_PI * generatedProceduralDiffuse(-n)");
    const withGrid = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...feature,
      features: { "a3d.nativeProbeGrid": true } }), { flags }).descriptor!);
    expect(withGrid.fragment).toContain("generatedAdvancedIrradiance(input.worldPosition, -n, vec3f(0.0))");
    const withRefraction = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...feature,
      features: { "prd04.transmissionTarget": true }, extensions: [...feature.extensions, { lobe: "transmission", maps: [], bits: {} }] }), { flags }).descriptor!);
    expect(withRefraction.fragment.indexOf("directDiffuse = directDiffuse * (1.0 - diffuseTransmissionFactor)"))
      .toBeLessThan(withRefraction.fragment.indexOf("let transmittedScene = generatedTransmissionSample"));
    expect(() => generateProgramImpl(normalizeProgramFeatures({ ...feature, features: { "a3d.nativeBakedLightmap": "add-indirect", "a3d.nativeLightmapUv": 0 } }), { flags })).toThrow(/DIFFUSE_TRANSMISSION_SOURCE_UNSUPPORTED/);
    expect(() => generateProgramImpl(normalizeProgramFeatures({ ...feature, extensions: [...feature.extensions,
      { lobe: "volume", maps: [], bits: {} }] }), { flags })).toThrow(/DIFFUSE_TRANSMISSION_SOURCE_UNSUPPORTED/);
  });

  it("applies the selected generated fog equation before output encoding", () => {
    const make = (fog: ProgramFeatures["fog"]) => createGeneratedPbrProgram(descriptor({
      fog, lighting: "lit", maps: {}, extensions: [], environment: "none", features: { "a3d.output.srgb": true }
    }));
    const linear = make("linear");
    expect(linear.fog).toBe("linear");
    expect(linear.fragment).toContain("let fogDepth = input.position.z / input.position.w");
    expect(linear.fragment).toContain("(fogDepth - material.fogParams.x) / max(material.fogParams.y - material.fogParams.x, 0.0001)");
    expect(linear.fragment.indexOf("let color = mix(unfoggedColor, material.fogColor.rgb, fogAmount)"))
      .toBeLessThan(linear.fragment.indexOf("generatedEncodeOutput(color)"));
    const exp2 = make("exp2");
    expect(exp2.fragment).toContain("let fogDistance = fogDensity * fogDepth");
    expect(exp2.fragment).toContain("1.0 - exp(-fogDistance * fogDistance)");
    expect(exp2.fragment).not.toContain("max(input.worldPosition.y, 0.0)");
    const height = make("height");
    expect(height.fragment).toContain("exp(-max(input.worldPosition.y, 0.0) * material.fogParams.w)");
    expect(() => make("volumetric")).toThrow(/fog volumetric/i);
    const packed = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
      ["u_fogColor", [0.25, 0.5, 0.75]], ["u_fogRange", [2, 20]], ["u_fogDensity", 0.25], ["u_fogHeightFalloff", 0.5]
    ]));
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect([0, 1, 2].map(index => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.fogColor! + index * 4, true))).toEqual([0.25, 0.5, 0.75]);
    expect([0, 1, 2, 3].map(index => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.fogParams! + index * 4, true))).toEqual([2, 20, 0.25, 0.5]);
  });

  it("composes probe, voxel and lightmap irradiance from the selected typed feature", () => {
    const base = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none" });
    const make = (features: ProgramFeatures["features"]) => createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...base, features }), { flags }).descriptor!);
    const probe = make({ "a3d.nativeProbeGrid": true });
    expect(probe.resources.at(-1)).toEqual({ uniform: "u_a3dNativeProbeTexture", textureBinding: 56, dimension: "2d", sampleType: "unfilterable-float" });
    expect(probe.fragment).toContain("a3dNativeProbeCoefficient");
    expect(probe.fragment).toContain("generatedAdvancedIrradiance(input.worldPosition, n, vec3f(0.0))");
    expect(probe.fragment).toContain("mix(global, value.rgb * material.advancedIntensity.x, value.a)");
    const iridescent = createGeneratedPbrProgram(generateProgramImpl(normalizeProgramFeatures({ ...base,
      features: { "a3d.nativeProbeGrid": true }, extensions: [{ lobe: "iridescence", maps: [], bits: { film: true } }] }), { flags }).descriptor!);
    expect(iridescent.fragment).toContain("let irIrradiance = localIrradiance");
    expect(iridescent.fragment).toContain("let irRadiance = generatedLobeRadiance");
    const voxel = make({ "a3d.nativeVoxelIndirect": true });
    expect(voxel.resources.at(-1)).toEqual({ uniform: "u_a3dNativeVoxelTexture", textureBinding: 57, dimension: "2d", sampleType: "unfilterable-float" });
    expect(voxel.fragment).toContain("a3dNativeVoxelCone");
    expect(voxel.fragment).toContain("material.advancedLevels");
    const baked = make({ "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 1 });
    expect(baked.requiredVertexLocations).toContain(7);
    expect(baked.resources.at(-1)).toEqual({ uniform: "u_a3dNativeLightmapTexture", textureBinding: 58, dimension: "2d", sampleType: "unfilterable-float" });
    expect(baked.fragment).toContain("a3dNativeLightmapIrradiance(u_a3dNativeLightmapTextureTexture, input.uv1)");
    expect(baked.fragment).toContain("directDiffuse *= 1.0 - baked.a; indirectDiffuse = mix(indirectDiffuse, bakedDiffuse, baked.a)");
    const additive = make({ "a3d.nativeBakedLightmap": "add-indirect", "a3d.nativeLightmapUv": 0 });
    expect(additive.fragment).toContain("indirectDiffuse += bakedDiffuse * baked.a");
    expect(() => make({ "a3d.nativeProbeGrid": true, "prd02.irradianceVolume": true })).toThrow(/conflict/i);
  });

  it("samples surface-detail maps with their selected UV sets, transforms and factors", () => {
    const program = createGeneratedPbrProgram(descriptor({ environment: "none", features: {}, lights: { ...lights, dir: 1 },
      maps: { baseColor: { uvSet: 1, transform: true }, normal: { uvSet: 0, transform: true }, diffuseRoughness: { uvSet: 0, transform: true }, bump: { uvSet: 1, transform: true } } }));
    expect(program.requiredVertexLocations).toEqual([0, 1, 2, 7]);
    expect(program.resources.slice(-3)).toEqual([
      { uniform: "u_diffuseRoughnessTexture", samplerBinding: 16, textureBinding: 17, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_bumpTexture", samplerBinding: 18, textureBinding: 19, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_normalMap", samplerBinding: 20, textureBinding: 21, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" }
    ]);
    expect(program.vertex).toContain("@location(7) uv1: vec2f");
    expect(program.fragment).toContain("generatedMapUv(input.uv1, material.baseUv, material.mapControls.x)");
    expect(program.fragment).toContain("generatedMapUv(input.uv, material.diffuseUv, material.mapControls.y)");
    expect(program.fragment).toContain("generatedMapUv(input.uv1, material.bumpUv, material.mapControls.z)");
    expect(program.fragment).toContain("generatedMapUv(input.uv, material.normalUv, material.normalControls.x)");
    expect(program.fragment).toContain("n = normalize(mapped)");
    expect(program.fragment).toContain("material.direct.y * mix(1.0, diffuseSample, clamp(material.detailControls.x, 0.0, 1.0))");
    expect(program.fragment).toContain("let dhdx = dpdx(height); let dhdy = dpdy(height)");
    expect(program.fragment).toContain("n - (dualX * dhdx + dualY * dhdy) / bumpDeterminant");
    const uniforms = new Map<string, UniformValue>([
      ["u_baseColorTextureOffset", [0.1, 0.2]], ["u_baseColorTextureScale", [2, 3]], ["u_baseColorTextureRotation", 0.3],
      ["u_diffuseRoughnessTextureOffset", [0.4, 0.5]], ["u_diffuseRoughnessTextureScale", [4, 5]], ["u_diffuseRoughnessTextureRotation", 0.6], ["u_diffuseRoughnessTextureEnabled", 1],
      ["u_bumpTextureOffset", [0.7, 0.8]], ["u_bumpTextureScale", [6, 7]], ["u_bumpTextureRotation", 0.9], ["u_bumpTextureEnabled", 1], ["u_bumpFactor", 0.25],
      ["u_normalTextureOffset", [0.2, 0.3]], ["u_normalTextureScale", [1.2, 1.3]], ["u_normalTextureRotation", 0.4], ["u_normalScale", 0.6]
    ]);
    const bytes = packGeneratedPbrMaterialUniforms(uniforms);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const get = (name: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true);
    expect([get("baseUv", 0), get("baseUv", 2), get("diffuseUv", 1), get("diffuseUv", 3), get("bumpUv", 2)]).toEqual([expect.closeTo(0.1), 2, 0.5, 5, 6]);
    expect([get("mapControls", 0), get("mapControls", 1), get("mapControls", 2), get("mapControls", 3)]).toEqual([expect.closeTo(0.3), expect.closeTo(0.6), expect.closeTo(0.9), 0.25]);
    expect([get("detailControls", 0), get("detailControls", 1)]).toEqual([1, 1]);
    expect([get("normalUv", 0), get("normalUv", 2), get("normalControls", 0), get("normalControls", 1)]).toEqual([expect.closeTo(0.2), expect.closeTo(1.2), expect.closeTo(0.4), expect.closeTo(0.6)]);
  });

  it("applies metallic-roughness, occlusion strength and emissive core maps", () => {
    const program = createGeneratedPbrProgram(descriptor({ environment: "none", features: {}, lights: { ...lights, dir: 1 },
      maps: { metallicRoughness: { uvSet: 1, transform: true }, occlusion: { uvSet: 0, transform: false }, emissive: { uvSet: 1, transform: true } } }));
    expect(program.requiredVertexLocations).toEqual([0, 1, 2, 7]);
    expect(program.resources.slice(-3)).toEqual([
      { uniform: "u_metallicRoughnessMap", samplerBinding: 22, textureBinding: 23, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_occlusionMap", samplerBinding: 24, textureBinding: 25, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_emissiveMap", samplerBinding: 26, textureBinding: 27, dimension: "2d", sampleType: "filterable-float" }
    ]);
    expect(program.fragment).toContain("material.metalRoughUv, material.coreMapControls.x)).bg");
    expect(program.fragment).toContain("material.surface.x * metalRoughSample.x");
    expect(program.fragment).toContain("material.surface.y * metalRoughSample.y + aa");
    expect(program.fragment).toContain("mix(1.0, occlusionSample, clamp(material.coreMapControls.w, 0.0, 1.0))");
    expect(program.fragment).toContain("indirectDiffuse *= occlusion; indirectSpecular *= occlusion;");
    expect(program.fragment).toContain("material.emissive.rgb * material.emissive.a * emissiveSample");
    const bytes = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
      ["u_metallicRoughnessTextureOffset", [0.1, 0.2]], ["u_metallicRoughnessTextureRotation", 0.3],
      ["u_occlusionTextureScale", [2, 3]], ["u_occlusionTextureRotation", 0.4], ["u_occlusionStrength", 0.25],
      ["u_emissiveTextureOffset", [0.5, 0.6]], ["u_emissiveTextureRotation", 0.7]
    ]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const get = (name: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true);
    expect([get("metalRoughUv", 0), get("occlusionUv", 2), get("emissiveUv", 1)]).toEqual([expect.closeTo(0.1), 2, expect.closeTo(0.6)]);
    expect([get("coreMapControls", 0), get("coreMapControls", 1), get("coreMapControls", 2), get("coreMapControls", 3)]).toEqual([expect.closeTo(0.3), expect.closeTo(0.4), expect.closeTo(0.7), 0.25]);
  });

  it("recognizes actual glTF lobe names and preserves scalar IOR and specular factors", () => {
    const source = descriptor({ environment: "none", features: {}, extensions: [
      { lobe: "KHR_materials_ior", bits: { ior: 1.33 }, maps: [] },
      { lobe: "KHR_materials_specular", bits: { specularMap: false, specularColorMap: false }, maps: [] },
      { lobe: "KHR_materials_sheen", bits: { colorMap: false, roughnessMap: false }, maps: [] },
      { lobe: "KHR_materials_emissive_strength", bits: { map: false }, maps: [] }
    ] });
    expect(source.activeExtensions.map(({ lobe }) => lobe)).toEqual(expect.arrayContaining(["KHR_materials_ior", "KHR_materials_specular", "KHR_materials_sheen", "KHR_materials_emissive_strength"]));
    const program = createGeneratedPbrProgram(source);
    expect(program.fragment).toContain("pbr.ior = material.surface.z; pbr.specularIntensity = material.surface.w");
    expect(program.fragment).toContain("generatedSheenAlbedo");
    const bytes = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_ior", 1.33], ["u_specularFactor", 0.7], ["u_specularColorFactor", [0.1, 0.2, 0.3]]]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.surface! + 8, true)).toBeCloseTo(1.33);
    expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.surface! + 12, true)).toBeCloseTo(0.7);
    expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.specular!, true)).toBeCloseTo(0.1);
    const emissive = createGeneratedPbrProgram(descriptor({ environment: "none", features: {}, maps: { emissive: { uvSet: 1, transform: true } },
      extensions: [{ lobe: "emissive-strength", maps: ["emissive"], mapUvSets: { emissive: 1 }, bits: { map: true } }] }));
    expect(emissive.requiredVertexLocations).toEqual([0, 1, 7]);
    expect(emissive.fragment).toContain("material.emissive.rgb * material.emissive.a * emissiveSample");
  });

  it("uses independent UV sets, transforms and channels for specular and sheen maps", () => {
    const lobeFeatures: ProgramFeatures["extensions"] = [
      { lobe: "KHR_materials_specular", maps: ["specular", "specularColor"], mapUvSets: { specular: 0 as const, specularColor: 1 as const }, bits: { specularMap: true, specularColorMap: true } },
      { lobe: "KHR_materials_sheen", maps: ["sheenColor", "sheenRoughness"], mapUvSets: { sheenColor: 1 as const, sheenRoughness: 0 as const }, bits: { colorMap: true, roughnessMap: true } }
    ];
    const program = createGeneratedPbrProgram(descriptor({ environment: "none", features: {}, maps: {}, lights: { ...lights, dir: 1 }, extensions: lobeFeatures }));
    expect(program.requiredVertexLocations).toEqual([0, 1, 2, 7]);
    expect(program.resources.map(({ uniform }) => uniform)).toEqual(["u_dfgLut", "u_specularTexture", "u_specularColorTexture", "u_sheenColorTexture", "u_sheenRoughnessTexture"]);
    expect(program.fragment).toContain("material.specularTransform * vec3f(input.uv, 1.0)");
    expect(program.fragment).toContain("material.specularColorTransform * vec3f(input.uv1, 1.0)");
    expect(program.fragment).toContain("material.sheenColorTransform * vec3f(input.uv1, 1.0)");
    expect(program.fragment).toContain("material.sheenRoughnessTransform * vec3f(input.uv, 1.0)");
    expect(program.fragment).toContain("pbr.specularIntensity = material.surface.w * specularSample");
    expect(program.fragment).toContain("material.sheen.rgb * sheenColorSample");
    expect(program.fragment).toContain("material.sheen.a * sheenRoughnessSample");
    const transform = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const bytes = packGeneratedPbrMaterialUniforms(new Map([["u_specularTextureUvTransform", transform]]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = GENERATED_PBR_MATERIAL_OFFSETS.specularTransform!;
    expect([view.getFloat32(offset, true), view.getFloat32(offset + 8, true), view.getFloat32(offset + 16, true), view.getFloat32(offset + 40, true)]).toEqual([1, 3, 4, 9]);
    const everyCoreMap = Object.fromEntries(["baseColor", "normal", "metallicRoughness", "occlusion", "emissive", "diffuseRoughness", "bump"].map((key) => [key, { uvSet: 0, transform: false }]));
    expect(() => createGeneratedPbrProgram(descriptor({ maps: everyCoreMap, extensions: lobeFeatures,
      features: { "prd02.ibl": true, "prd02.localProbe": true, "prd02.irradianceVolume": true } }))).toThrow(/more than 16 sampled textures/);
  });

  it("composes clearcoat over direct light and local and global reflected radiance", () => {
    const program = createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1 }, features: { "prd02.ibl": true, "prd02.localProbe": true }, extensions: [
      { lobe: "KHR_materials_clearcoat", maps: ["clearcoat", "clearcoatRoughness", "clearcoatNormal"], mapUvSets: { clearcoat: 0, clearcoatRoughness: 1, clearcoatNormal: 1 }, bits: { map: true, roughnessMap: true, normalMap: true } }
    ] }));
    expect(program.resources.slice(-3)).toEqual([
      { uniform: "u_clearcoatTexture", samplerBinding: 36, textureBinding: 37, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_clearcoatRoughnessTexture", samplerBinding: 38, textureBinding: 39, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_clearcoatNormalTexture", samplerBinding: 40, textureBinding: 41, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" }
    ]);
    expect(program.fragment).toContain("material.coatTransform * vec3f(input.uv, 1.0)");
    expect(program.fragment).toContain("material.coatRoughnessTransform * vec3f(input.uv1, 1.0)");
    expect(program.fragment).toContain("material.coatNormalTransform * vec3f(input.uv1, 1.0)");
    expect(program.fragment).toContain("coatGeometryRoughness");
    expect(program.fragment).toContain("coatDirect += light.radiance");
    expect(program.fragment).toContain("generatedLobeRadiance(input.worldPosition, coatReflection, coatRoughness)");
    expect(program.fragment).toContain("generatedLocalProbeRadiance(world, direction, roughness)");
    expect(program.fragment).toContain("directSpecular = directSpecular * coatBase + coatDirect * coatFactor");
    expect(program.fragment).toContain("indirectSpecular = indirectSpecular * coatBase + coatIndirect * coatFactor");
    const bytes = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_clearcoatFactor", 0.5], ["u_clearcoatRoughnessFactor", 0.25], ["u_clearcoatNormalScale", 0.75]]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = GENERATED_PBR_MATERIAL_OFFSETS.coat!;
    expect([view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)]).toEqual([0.5, 0.25, 0.75]);
  });

  it("uses the spectral iridescence evaluator and the authored factor and thickness channels", () => {
    const program = createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1 }, features: { "prd02.ibl": true, "prd02.localProbe": true }, extensions: [
      { lobe: "KHR_materials_iridescence", maps: ["iridescence", "iridescenceThickness"], mapUvSets: { iridescence: 1, iridescenceThickness: 0 }, bits: { map: true, thicknessMap: true, film: true } }
    ] }));
    expect(program.resources.slice(-2)).toEqual([
      { uniform: "u_iridescenceTexture", samplerBinding: 42, textureBinding: 43, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" },
      { uniform: "u_iridescenceThicknessTexture", samplerBinding: 44, textureBinding: 45, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" }
    ]);
    expect(program.fragment).toContain("fn a3dPrd04EvalIridescence(");
    expect(program.fragment).toContain("for (var i = 0; i <= 40; i++)");
    expect(program.fragment).toContain("material.iridescenceTransform * vec3f(input.uv1, 1.0)");
    expect(program.fragment).toContain("material.iridescenceThicknessTransform * vec3f(input.uv, 1.0)");
    expect(program.fragment).toContain("mix(material.iridescence.z, material.iridescence.w, clamp(iridescenceThicknessSample, 0.0, 1.0))");
    expect(program.fragment).toContain("directSpecular += light.radiance * irNl * (irMixed - irFresnel) * irGgx");
    expect(program.fragment).toContain("generatedLobeRadiance(input.worldPosition, irReflection, roughness)");
    expect(program.fragment).toContain("irRadiance * irSingle - max(irRadiance, vec3f(0.0)) * baseSingle");
    const bytes = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_iridescenceFactor", 0.4], ["u_iridescenceIor", 4], ["u_iridescenceThicknessMinimum", 500], ["u_iridescenceThicknessMaximum", 100]]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = GENERATED_PBR_MATERIAL_OFFSETS.iridescence!;
    expect([view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true), view.getFloat32(offset + 12, true)]).toEqual([expect.closeTo(0.4), 4, 500, 100]);
  });

  it("uses the resolved geometry tangent or a derivative fallback for anisotropy", () => {
    const extension = [{ lobe: "KHR_materials_anisotropy", maps: ["anisotropy"], mapUvSets: { anisotropy: 1 as const }, bits: { map: true } }];
    const withTangent = createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1 }, extensions: extension,
      features: { "prd02.ibl": true, "prd02.localProbe": true, "prd04.tangentFrame": true, "prd04.geometryTangent": true } }));
    expect(withTangent.requiredVertexLocations).toEqual([0, 1, 2, 3, 7]);
    expect(withTangent.vertex).toContain("@location(3) tangent: vec4f");
    expect(withTangent.vertex).toContain("deformedTangent.w * select(1.0, -1.0, tangentDet < 0.0)");
    expect(withTangent.fragment).toContain("material.anisotropyTransform * vec3f(input.uv1, 1.0)");
    expect(withTangent.fragment).toContain("generatedAnisotropicGgx(n, view, light.direction, anT, anB");
    expect(withTangent.fragment).toContain("generatedLobeRadiance(input.worldPosition, anBentDirection, roughness)");
    expect(withTangent.resources.at(-1)).toEqual({ uniform: "u_anisotropyTexture", samplerBinding: 46, textureBinding: 47, dimension: "2d", sampleType: "filterable-float", colorSpace: "linear" });
    const withoutTangent = createGeneratedPbrProgram(descriptor({ extensions: extension, features: { "prd02.ibl": true, "prd04.tangentFrame": true } }));
    expect(withoutTangent.requiredVertexLocations).toEqual([0, 1, 2, 7]);
    expect(withoutTangent.vertex).toContain("output.tangent = vec4f(0.0)");
    expect(withoutTangent.fragment).toContain("anPositionDx * anUvDy.y - anPositionDy * anUvDx.y");
    expect(() => createGeneratedPbrProgram(descriptor({ extensions: extension, features: { "prd02.ibl": true } }))).toThrow(/tangent-frame/);
    const bytes = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([["u_anisotropyStrength", 0.6], ["u_anisotropyRotation", 0.4]]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = GENERATED_PBR_MATERIAL_OFFSETS.anisotropy!;
    expect(view.getFloat32(offset, true)).toBeCloseTo(0.6); expect(view.getFloat32(offset + 4, true)).toBeCloseTo(0.4);
  });

  it("fails closed on unsupported lighting, graph, maps and unknown contributors", () => {
    const base = descriptor();
    const altered = (features: Partial<ProgramFeatures>): GeneratedPbrDescriptor => ({ ...base, features: { ...base.features, ...features } });
    expect(() => createGeneratedPbrProgram(altered({ lights: { ...lights, clustered: true } }))).toThrow(/LIGHTS_CLUSTERED/);
    expect(() => createGeneratedPbrProgram(altered({ lights: { ...lights, rect: 3 as never } }))).toThrow(/rectangular light bucket/);
    expect(() => createGeneratedPbrProgram(altered({ shadows: { ...shadow, cascades: 1 } }))).toThrow(/shadow/);
    expect(() => createGeneratedPbrProgram(altered({ maps: { normal: { uvSet: 2 as never, transform: false } } }))).toThrow(/unsupported UV set/);
    expect(() => createGeneratedPbrProgram(altered({ fog: "volumetric" }))).toThrow(/fog/);
    expect(() => createGeneratedPbrProgram({ ...base, activeFeatures: [...base.activeFeatures, { id: "unknown.effect", value: true }] })).toThrow(/unknown.effect/);
    expect(() => createGeneratedPbrProgram({ ...base, activeExtensions: [...base.activeExtensions, { lobe: "volume", maps: [], bits: {} }] })).toThrow(/volume/);
    expect(() => createGeneratedPbrProgram(altered({ extensions: [...base.features.extensions, { lobe: "unknown.lobe", maps: [], bits: {} }] }))).toThrow(/inactive or unregistered/);
    expect(() => createGeneratedPbrProgram({ ...base, defines: { ...base.defines, A3D_UNKNOWN: true } })).toThrow(/A3D_UNKNOWN/);
    const malformed = { ...base.defines }; delete (malformed as Record<string, unknown>).A3D_PRD02_IBL;
    expect(() => createGeneratedPbrProgram({ ...base, defines: malformed })).toThrow(/A3D_PRD02_IBL/);
  });

  it("supports untextured ambient and direct-sRGB output without sampling hidden resources", () => {
    const program = createGeneratedPbrProgram(descriptor({ maps: {}, extensions: [], environment: "none", features: { "a3d.output.srgb": true } }));
    expect(program.resources).toEqual([]);
    expect(program.requiredVertexLocations).toEqual([0, 1]);
    expect(program.fragment).toContain("generatedEncodeOutput(color)");
    expect(program.fragment).not.toContain("textureSample(");
    expect(program.requiresFloatColorAttachment).toBe(false);
  });
});

describe("generated PBR irradiance-volume WebGPU bindings", () => {
  it("binds a real encoded forward shadow map and only substitutes a fallback when the receiver is disabled", async () => {
    type Group = { readonly layout: { readonly index: number }; readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] };
    const groups: Group[] = [];
    let submissions = 0;
    const native = {
      queue: { submit() { submissions += 1; }, onSubmittedWorkDone: async () => {}, writeBuffer() {}, writeTexture() {} },
      createBuffer: ({ label, size }: { label?: string; size: number }) => ({ label, size, destroy() {} }),
      createTexture(descriptor: { label?: string }) {
        const texture = { descriptor, destroy() {}, createView(viewDescriptor?: object) { return { texture, viewDescriptor }; } };
        return texture;
      },
      createSampler: () => ({}), createShaderModule: () => ({}),
      createBindGroupLayout: (descriptor: object) => descriptor, createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (group: Group) => { groups.push(group); return group; },
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none",
      lights: { ...lights, dir: 1 }, shadows: { ...shadow, cascades: 1 } });
    const generated = generateProgramImpl(features, { flags });
    const shader = device.createShaderProgram({ label: "shadow", marker: GENERATED_PROGRAM_MARKER,
      vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const texture = new Texture({ width: 2, height: 2, colorSpace: "linear", label: "forward-shadow", data: new Uint8Array(16), generateMipmaps: false });
    const dfg = new Texture({ width: 1, height: 1, format: "rgba16f", colorSpace: "linear", data: new Uint16Array(4), generateMipmaps: false });
    const uniforms = new Map<string, UniformValue>([
      ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["u_shadowMapTexture", new TextureBinding({ name: "u_shadowMapTexture", texture })],
      ["u_shadowMapEnabled", 1], ["u_lightCount", 1], ["u_lightData", new Float32Array(24)]
    ]);
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false, format: "rgba16f" });
    const vertices = device.createBuffer("vertex", 72);
    const frame = device.createBuffer("uniform", 304, new Float32Array(76));
    device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader, uniforms };
    device.draw(draw);
    const group = groups.find(value => value.layout.index === 0)!;
    expect(group.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 50, 51]);
    expect((group.entries.find(({ binding }) => binding === 51)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(texture));
    const missing = new Map(uniforms); missing.delete("u_shadowMapTexture");
    const submittedBeforeFailure = submissions;
    expect(() => device.draw({ ...draw, uniforms: missing })).toThrow(/live sampled texture/);
    expect(submissions).toBe(submittedBeforeFailure);
    missing.set("u_shadowMapEnabled", 0);
    const residency = device.createTextureResidencyAdapter();
    const beforeFallback = residency.usageBytes();
    expect(() => device.draw({ ...draw, uniforms: missing })).not.toThrow();
    expect(residency.usageBytes()).toBe(beforeFallback + 4);
    const srgb = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array(4), generateMipmaps: false });
    const bad = new Map(uniforms); bad.set("u_shadowMapTexture", new TextureBinding({ name: "u_shadowMapTexture", texture: srgb }));
    expect(() => device.draw({ ...draw, uniforms: bad })).toThrow(/linear/);
    const contactFeatures = normalizeProgramFeatures({ ...features, shadows: { ...features.shadows, contact: true } });
    const contactGenerated = generateProgramImpl(contactFeatures, { flags });
    const contactProgram = createGeneratedPbrProgram(contactGenerated.descriptor!);
    expect(contactProgram.fragment).toContain("let contactUv = input.position.xy / material.contactShadow.yz");
    expect(contactProgram.fragment).toContain("castsShadow >= 0.5 && shadowKind <= 0.5 && material.contactShadow.x > 0.0 && f32(index) == material.contactShadow.w");
    expect(contactProgram.fragment).toContain("light.radiance *= mix(1.0, visibility, clamp(material.contactShadow.x, 0.0, 1.0))");
    const contactShader = device.createShaderProgram({ label: "contact", marker: GENERATED_PROGRAM_MARKER,
      vertex: contactGenerated.vertex, fragment: contactGenerated.fragment, generatedProgram: contactGenerated.descriptor! });
    const mask = device.createRenderTarget({ width: 1, height: 1, depth: false, format: "rgba8" });
    device.setRenderTarget(mask); device.clear([1, 1, 1, 1]); device.setRenderTarget(target);
    const contactUniforms = new Map(uniforms);
    const contactLights = new Float32Array(24); contactLights[14] = 1;
    contactUniforms.set("u_lightData", contactLights); contactUniforms.set("u_contactShadowLightIndex", 0);
    contactUniforms.set("u_contactShadowMask", new TextureBinding({ name: "u_contactShadowMask", texture: mask.colorTexture }));
    contactUniforms.set("u_contactShadowMaskStrength", 0.5); contactUniforms.set("u_contactShadowMaskViewport", [2, 2]);
    const contactDraw = { ...draw, shader: contactShader, uniforms: contactUniforms };
    device.draw(contactDraw);
    const contactGroup = groups.filter(value => value.layout.index === 0).at(-1)!;
    expect(contactGroup.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 50, 51, 63, 64]);
    expect((contactGroup.entries.find(({ binding }) => binding === 64)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(mask.colorTexture));
    const badViewport = new Map(contactUniforms); badViewport.set("u_contactShadowMaskViewport", [1, 2]);
    expect(() => device.draw({ ...contactDraw, uniforms: badViewport })).toThrow(/mask and viewport/);
    const badLight = new Map(contactUniforms); badLight.set("u_contactShadowLightIndex", 1);
    expect(() => device.draw({ ...contactDraw, uniforms: badLight })).toThrow(/mask and viewport/);
    const badMask = new Map(contactUniforms); badMask.set("u_contactShadowMask", new TextureBinding({ name: "u_contactShadowMask", texture: target.colorTexture }));
    expect(() => device.draw({ ...contactDraw, uniforms: badMask })).toThrow(/attached for writing/);
    const missingMask = new Map(contactUniforms); missingMask.delete("u_contactShadowMask");
    expect(() => device.draw({ ...contactDraw, uniforms: missingMask })).toThrow(/mask and viewport/);
    missingMask.set("u_contactShadowMaskStrength", 0);
    expect(() => device.draw({ ...contactDraw, uniforms: missingMask })).not.toThrow();
    const contactOnly = normalizeProgramFeatures({ ...contactFeatures, shadows: { ...contactFeatures.shadows, cascades: 0 } });
    const contactOnlySource = generateProgramImpl(contactOnly, { flags });
    const contactOnlyProgram = createGeneratedPbrProgram(contactOnlySource.descriptor!);
    expect(contactOnlyProgram.resources.some(resource => resource.uniform === "u_shadowMapTexture")).toBe(false);
    expect(contactOnlyProgram.fragment).toContain("f32(index) == material.contactShadow.w");
    const contactOnlyShader = device.createShaderProgram({ label: "contact-only", marker: GENERATED_PROGRAM_MARKER,
      vertex: contactOnlySource.vertex, fragment: contactOnlySource.fragment, generatedProgram: contactOnlySource.descriptor! });
    device.draw({ ...contactDraw, shader: contactOnlyShader });
    expect(groups.filter(value => value.layout.index === 0).at(-1)!.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 63, 64]);
    const twoSunFeatures = normalizeProgramFeatures({ ...contactOnly, lights: { ...contactOnly.lights, dir: 2 } });
    const twoSunSource = generateProgramImpl(twoSunFeatures, { flags });
    const twoSunShader = device.createShaderProgram({ label: "two-sun-contact", marker: GENERATED_PROGRAM_MARKER,
      vertex: twoSunSource.vertex, fragment: twoSunSource.fragment, generatedProgram: twoSunSource.descriptor! });
    const twoSunLights = new Float32Array(48); twoSunLights[14] = 1; twoSunLights[38] = 1;
    const twoSunUniforms = new Map(contactUniforms); twoSunUniforms.set("u_lightCount", 2); twoSunUniforms.set("u_lightData", twoSunLights);
    twoSunUniforms.set("u_contactShadowLightIndex", 1);
    device.draw({ ...contactDraw, shader: twoSunShader, uniforms: twoSunUniforms });
    const contactPacked = packGeneratedPbrMaterialUniforms(twoSunUniforms);
    expect(new DataView(contactPacked.buffer, contactPacked.byteOffset, contactPacked.byteLength).getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.contactShadow! + 12, true)).toBe(1);
    const uncompiledLight = new Map(twoSunUniforms); uncompiledLight.set("u_contactShadowLightIndex", 1);
    expect(() => device.draw({ ...contactDraw, shader: contactOnlyShader, uniforms: uncompiledLight })).toThrow(/lights exceed the selected/);
    const localFeatures = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none",
      lights: { ...lights, point: 1 }, shadows: { ...shadow, cascades: 0, localShadows: 6 } });
    const localGenerated = generateProgramImpl(localFeatures, { flags });
    const localShader = device.createShaderProgram({ label: "local-shadow", marker: GENERATED_PROGRAM_MARKER,
      vertex: localGenerated.vertex, fragment: localGenerated.fragment, generatedProgram: localGenerated.descriptor! });
    const localUniforms = new Map<string, UniformValue>([
      ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })], ["u_lightCount", 1], ["u_lightData", new Float32Array(24)],
      ["u_localShadowAtlas", new TextureBinding({ name: "u_localShadowAtlas", texture, sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) })],
      ["u_localShadowMatrices", new Float32Array(96)], ["u_localShadowRects", new Float32Array(24)], ["u_localShadowTexelScale", new Float32Array(8)],
      ["u_localShadowParams", [1, 0.1, 0.2, 0.3]], ["u_localShadowAtlasTexel", [0.5, 0.5]]
    ]);
    const localDraw = { ...draw, shader: localShader, uniforms: localUniforms };
    device.draw(localDraw);
    const localGroup = groups.filter(value => value.layout.index === 0).at(-1)!;
    expect(localGroup.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 52, 53]);
    expect((localGroup.entries.find(({ binding }) => binding === 53)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(texture));
    const missingAtlas = new Map(localUniforms); missingAtlas.delete("u_localShadowAtlas");
    expect(() => device.draw({ ...localDraw, uniforms: missingAtlas })).toThrow(/raw atlas/);
    missingAtlas.set("u_localShadowParams", [0, 0, 0, 0]);
    expect(() => device.draw({ ...localDraw, uniforms: missingAtlas })).not.toThrow();
    const badSampler = new Map(localUniforms); badSampler.set("u_localShadowAtlas", new TextureBinding({ name: "u_localShadowAtlas", texture }));
    expect(() => device.draw({ ...localDraw, uniforms: badSampler })).toThrow(/nearest-sampled/);
    const badTexel = new Map(localUniforms); badTexel.set("u_localShadowAtlasTexel", [0.25, 0.5]);
    expect(() => device.draw({ ...localDraw, uniforms: badTexel })).toThrow(/raw atlas/);
    const punctualFeatures = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none",
      lights: { ...lights, dir: 1, point: 1, spot: 1 }, shadows: { ...shadow, cascades: 1, localShadows: 6 },
      features: { "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true } });
    const punctualSource = generateProgramImpl(punctualFeatures, { flags });
    const punctualProgram = createGeneratedPbrProgram(punctualSource.descriptor!);
    expect([punctualProgram.pointShadow, punctualProgram.spotShadow]).toEqual([true, true]);
    expect(punctualProgram.fragment).toContain("distance(positionRange.xyz, material.pointShadowPositionRange.xyz) <= 0.0001");
    expect(punctualProgram.fragment).toContain("material.spotShadowDirectionAngle.xyz / max(length(material.spotShadowDirectionAngle.xyz), 0.0001)) >= 0.9999");
    expect(punctualProgram.fragment).toContain("areaRight.w < 0.5");
    expect(punctualProgram.fragment).toContain("if (castsShadow >= 0.5 && (shadowKind <= 0.5))");
    expect(punctualProgram.fragment).toContain("vec2f(coord.x, 1.0 - coord.y)");
    const punctualShader = device.createShaderProgram({ label: "punctual", marker: GENERATED_PROGRAM_MARKER,
      vertex: punctualSource.vertex, fragment: punctualSource.fragment, generatedProgram: punctualSource.descriptor! });
    const matrices = new Float32Array(96);
    for (let face = 0; face < 6; face += 1) for (let diagonal = 0; diagonal < 4; diagonal += 1) matrices[face * 16 + diagonal * 5] = 1;
    const rects = new Float32Array(Array.from({ length: 6 }, (_, face) => [(face % 3) / 3, Math.floor(face / 3) / 2, 1 / 3, 1 / 2]).flat());
    const taps = new Float32Array(128); taps[2] = 1;
    const punctualUniforms = new Map(localUniforms);
    punctualUniforms.set("u_shadowMapTexture", new TextureBinding({ name: "u_shadowMapTexture", texture }));
    punctualUniforms.set("u_pointShadowMapTexture", new TextureBinding({ name: "u_pointShadowMapTexture", texture }));
    punctualUniforms.set("u_pointShadowMapEnabled", 1); punctualUniforms.set("u_pointShadowLightPosition", [1, 2, 3]);
    punctualUniforms.set("u_pointShadowRange", 10); punctualUniforms.set("u_pointShadowFaceMatrices", matrices); punctualUniforms.set("u_pointShadowFaceRects", rects);
    punctualUniforms.set("u_pointShadowStrength", 0.8); punctualUniforms.set("u_pointShadowBias", 0.001); punctualUniforms.set("u_pointShadowSlopeBias", 1);
    punctualUniforms.set("u_pointShadowTexelSize", [0.5, 0.5]); punctualUniforms.set("u_pointShadowPcfSampleCount", 1); punctualUniforms.set("u_pointShadowPcfSamples", taps);
    punctualUniforms.set("u_spotShadowMapTexture", new TextureBinding({ name: "u_spotShadowMapTexture", texture }));
    punctualUniforms.set("u_spotShadowMapEnabled", 1); punctualUniforms.set("u_spotShadowLightPosition", [4, 5, 6]);
    punctualUniforms.set("u_spotShadowLightDirection", [0, -1, 0]); punctualUniforms.set("u_spotShadowRange", 8);
    punctualUniforms.set("u_spotShadowMatrix", matrices.slice(0, 16)); punctualUniforms.set("u_spotShadowCone", [0.5, 0.2]);
    punctualUniforms.set("u_spotShadowStrength", 0.7); punctualUniforms.set("u_spotShadowBias", 0.002); punctualUniforms.set("u_spotShadowSlopeBias", 1);
    punctualUniforms.set("u_spotShadowTexelSize", [0.5, 0.5]); punctualUniforms.set("u_spotShadowPcfSampleCount", 1); punctualUniforms.set("u_spotShadowPcfSamples", taps);
    const punctualDraw = { ...draw, shader: punctualShader, uniforms: punctualUniforms };
    device.draw(punctualDraw);
    expect(groups.filter(value => value.layout.index === 0).at(-1)!.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 50, 51, 52, 53, 65, 66, 67, 68]);
    const noPoint = new Map(punctualUniforms); noPoint.delete("u_pointShadowMapTexture");
    expect(() => device.draw({ ...punctualDraw, uniforms: noPoint })).toThrow(/complete light and PCF packet/);
    const noTaps = new Map(punctualUniforms); noTaps.delete("u_spotShadowPcfSamples");
    expect(() => device.draw({ ...punctualDraw, uniforms: noTaps })).toThrow(/complete light and PCF packet/);
    const invalidRects = new Map(punctualUniforms); invalidRects.set("u_pointShadowFaceRects", new Float32Array(24));
    expect(() => device.draw({ ...punctualDraw, uniforms: invalidRects })).toThrow(/complete light and PCF packet/);
    noPoint.set("u_pointShadowMapEnabled", 0);
    expect(() => device.draw({ ...punctualDraw, uniforms: noPoint })).not.toThrow();
    device.endFrame(); device.dispose();
  });

  it("uses an unfilterable bone texture and a joint-typed vertex shader", async () => {
    const modules: { readonly label?: string; readonly code: string }[] = [];
    const layouts: { readonly entries: readonly Record<string, unknown>[] }[] = [];
    const groups: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }[] = [];
    const native = {
      queue: { submit() {}, onSubmittedWorkDone: async () => {}, writeBuffer() {}, writeTexture() {} },
      createBuffer: ({ size, usage }: { readonly size: number; readonly usage: number }) => ({ size, usage, destroy() {} }),
      createTexture: () => ({ createView: (descriptor?: object) => ({ descriptor }), destroy() {} }),
      createShaderModule: (descriptor: { readonly label?: string; readonly code: string }) => { modules.push(descriptor); return descriptor; },
      createBindGroupLayout: (descriptor: { readonly entries: readonly Record<string, unknown>[] }) => { layouts.push(descriptor); return descriptor; },
      createPipelineLayout: (descriptor: { readonly bindGroupLayouts: readonly unknown[] }) => descriptor,
      createRenderPipeline: (descriptor: { readonly layout: { readonly bindGroupLayouts: readonly unknown[] } }) => ({ getBindGroupLayout: (index: number) => descriptor.layout.bindGroupLayouts[index] }),
      createBindGroup: (descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }) => { groups.push(descriptor); return {}; },
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none", features: { "prd06.deform": "skin4" } });
    const generated = generateProgramImpl(features, { flags });
    const shader = device.createShaderProgram({ label: "generated-skinned", marker: GENERATED_PROGRAM_MARKER,
      vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const vertexFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24, type: "uint16", integer: true },
      { semantic: "weights", components: 4, offset: 32, type: "uint8", normalized: true }
    ], 36);
    const vertices = device.createBuffer("vertex", 108), frame = device.createBuffer("uniform", 304, new Float32Array(76));
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false, format: "rgba16f" });
    const bone = new Texture({ width: 4, height: 1, format: "rgba32f", colorSpace: "linear", data: new Float32Array(16) });
    const uniforms = new Map<string, UniformValue>([["u_boneTexture", new TextureBinding({ name: "u_boneTexture", texture: bone })], ["u_boneTextureWidth", 4]]);
    device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat, vertexCount: 3, shader, uniforms };
    device.draw(draw);
    expect(modules.some(module => module.label?.includes("vertex-skin-uint") && module.code.includes("@location(5) joints: vec4u"))).toBe(true);
    expect(layouts[0]?.entries).toContainEqual({ binding: 48, visibility: 1, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } });
    expect(groups.some(group => group.entries.some(entry => entry.binding === 48))).toBe(true);
    const missing = new Map(uniforms); missing.delete("u_boneTexture");
    expect(() => device.draw({ ...draw, uniforms: missing })).toThrow(/bone texture/i);
    const badWidth = new Map(uniforms); badWidth.set("u_boneTextureWidth", 8);
    expect(() => device.draw({ ...draw, uniforms: badWidth })).toThrow(/bone texture/i);
    const skin8Features = normalizeProgramFeatures({ ...features, skinning: { influences: 8, palette: "texture" },
      features: { "prd06.deform": "skin8", "prd06.joint0Type": "uint", "prd06.joint1Type": "sint" }, instancing: { color: true } });
    const skin8Generated = generateProgramImpl(skin8Features, { flags });
    const skin8Shader = device.createShaderProgram({ label: "generated-skinned-eight", marker: GENERATED_PROGRAM_MARKER,
      vertex: skin8Generated.vertex, fragment: skin8Generated.fragment, generatedProgram: skin8Generated.descriptor! });
    const skin8Format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24, type: "uint16", integer: true },
      { semantic: "weights", components: 4, offset: 32, type: "uint8", normalized: true },
      { semantic: "joints1", components: 4, offset: 36, type: "int16", integer: true },
      { semantic: "weights1", components: 4, offset: 44, type: "uint8", normalized: true }
    ], 48);
    const vertices8 = device.createBuffer("vertex", 144), matrix = device.createBuffer("vertex", 128), color = device.createBuffer("vertex", 32);
    const instanceAttributes = [0, 1, 2, 3].map(index => ({ shaderName: `a_instanceMatrix${index}`, buffer: matrix, components: 4 as const, offset: index * 16, stride: 64, divisor: 1 }));
    instanceAttributes.push({ shaderName: "a_instanceColor", buffer: color, components: 4, offset: 0, stride: 16, divisor: 1 });
    device.draw({ ...draw, vertexBuffer: vertices8, vertexFormat: skin8Format, shader: skin8Shader, instanceCount: 2, instanceAttributes });
    expect(modules.some(module => module.label?.includes("vertex-skin-uint:sint") && module.code.includes("@location(8) joints1: vec4i")
      && module.code.includes("@location(10) instance0: vec4f"))).toBe(true);
    const morphFeatures = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none", features: { "prd06.deform": "morph4n|k8" } });
    const morphGenerated = generateProgramImpl(morphFeatures, { flags });
    const morphShader = device.createShaderProgram({ label: "generated-morphed", marker: GENERATED_PROGRAM_MARKER,
      vertex: morphGenerated.vertex, fragment: morphGenerated.fragment, generatedProgram: morphGenerated.descriptor! });
    const morphTexture = new Texture({ width: 6, height: 1, layers: 4, dimension: "2d-array", format: "rgba32f", colorSpace: "linear", data: new Float32Array(96) });
    const morphUniforms = new Map<string, UniformValue>([["u_morphTexture", new TextureBinding({ name: "u_morphTexture", texture: morphTexture })],
      ["u_morphStride", 2], ["u_morphTexWidth", 6], ["u_morphActiveCount", 2], ["u_morphActiveIndex4", [0, 1, 0, 0]], ["u_morphActiveWeight4", [0.75, 0.25, 0, 0]]]);
    const morphVertices = device.createBuffer("vertex", 72);
    const morphDraw = { ...draw, vertexBuffer: morphVertices, vertexFormat: VertexFormat.P3N3, shader: morphShader, uniforms: morphUniforms };
    device.draw(morphDraw);
    expect(layouts.some(layout => layout.entries.some(entry => entry.binding === 49 && (entry.texture as { sampleType?: string })?.sampleType === "unfilterable-float"))).toBe(true);
    expect(groups.some(group => group.entries.some(entry => entry.binding === 49))).toBe(true);
    const badMorph = new Map(morphUniforms); badMorph.set("u_morphActiveIndex4", [0, 4, 0, 0]);
    expect(() => device.draw({ ...morphDraw, uniforms: badMorph })).toThrow(/morph texture or active weights/i);
    const tangentFeatures = normalizeProgramFeatures({ ...morphFeatures, features: { "prd06.deform": "morph4t|k8" } });
    const tangentGenerated = generateProgramImpl(tangentFeatures, { flags });
    const tangentShader = device.createShaderProgram({ label: "generated-tangent-morph", marker: GENERATED_PROGRAM_MARKER,
      vertex: tangentGenerated.vertex, fragment: tangentGenerated.fragment, generatedProgram: tangentGenerated.descriptor! });
    const tangentTexture = new Texture({ width: 9, height: 1, layers: 4, dimension: "2d-array", format: "rgba32f", colorSpace: "linear", data: new Float32Array(144) });
    const tangentUniforms = new Map(morphUniforms); tangentUniforms.set("u_morphTexture", new TextureBinding({ name: "u_morphTexture", texture: tangentTexture }));
    tangentUniforms.set("u_morphStride", 3); tangentUniforms.set("u_morphTexWidth", 9);
    const tangentFormat = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "tangent", components: 4, offset: 24 }], 40);
    const tangentVertices = device.createBuffer("vertex", 120);
    device.draw({ ...morphDraw, vertexBuffer: tangentVertices, vertexFormat: tangentFormat, shader: tangentShader, uniforms: tangentUniforms });
    const wrongStride = new Map(tangentUniforms); wrongStride.set("u_morphStride", 2);
    expect(() => device.draw({ ...morphDraw, vertexBuffer: tangentVertices, vertexFormat: tangentFormat, shader: tangentShader, uniforms: wrongStride })).toThrow(/morph texture or active weights/i);
    tangentTexture.dispose();
    morphTexture.dispose();
    device.endFrame(); device.dispose(); bone.dispose();
  });

  it("requires and submits instance-rate matrix and color streams", async () => {
    const vertexLayouts: { readonly stepMode?: string; readonly attributes: readonly { readonly shaderLocation: number }[] }[][] = [];
    const draws: number[][] = [];
    const native = {
      queue: { submit() {}, onSubmittedWorkDone: async () => {}, writeBuffer() {} },
      createBuffer: ({ size, usage }: { readonly size: number; readonly usage: number }) => ({ size, usage, destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createShaderModule: () => ({}),
      createRenderPipeline: (descriptor: { vertex: { buffers?: typeof vertexLayouts[number] } }) => {
        vertexLayouts.push(descriptor.vertex.buffers ?? []); return { getBindGroupLayout: (index: number) => ({ index }) };
      },
      createBindGroup: () => ({}),
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {},
        draw: (...args: number[]) => draws.push(args), end() {} }), finish: () => ({}) }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const features = normalizeProgramFeatures({ lighting: "lit", instancing: { color: true }, maps: {}, extensions: [], environment: "none" });
    const generated = generateProgramImpl(features, { flags });
    const shader = device.createShaderProgram({ label: "generated-instanced", marker: GENERATED_PROGRAM_MARKER,
      vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const vertices = device.createBuffer("vertex", 72), matrix = device.createBuffer("vertex", 128), color = device.createBuffer("vertex", 32);
    const frame = device.createBuffer("uniform", 304, new Float32Array(76));
    const target = device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
    const instanceAttributes = [0, 1, 2, 3].map(index => ({ shaderName: `a_instanceMatrix${index}`, buffer: matrix, components: 4 as const, offset: index * 16, stride: 64, divisor: 1 }));
    const colorAttribute = { shaderName: "a_instanceColor", buffer: color, components: 4 as const, offset: 0, stride: 16, divisor: 1 };
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, instanceCount: 2, shader };
    expect(() => device.draw({ ...draw, instanceAttributes })).toThrow(/instance-rate matrix and color/i);
    expect(() => device.draw({ ...draw, instanceAttributes: [...instanceAttributes, { ...colorAttribute, components: 3 }] })).toThrow(/instance-rate matrix and color/i);
    device.draw({ ...draw, instanceAttributes: [...instanceAttributes, colorAttribute] });
    expect(vertexLayouts[0]?.slice(1).map(layout => [layout.stepMode, layout.attributes.map(attribute => attribute.shaderLocation)])).toEqual([["instance", [8, 9, 10, 11]], ["instance", [12]]]);
    expect(draws).toEqual([[3, 2, 0]]);
    device.endFrame(); device.dispose();
  });

  it("binds volume and surface-detail textures and rejects invalid resources", async () => {
    type Entry = { readonly binding: number; readonly resource: unknown };
    type Group = { readonly layout: { readonly index: number }; readonly entries: readonly Entry[] };
    const groups: Group[] = [];
    const layouts: { entries?: readonly { binding: number; texture?: { sampleType: string } }[] }[] = [];
    const writes = new Map<string, Uint8Array>();
    const native = {
      queue: {
        submit() {}, onSubmittedWorkDone: async () => {}, writeTexture() {},
        writeBuffer(buffer: { label?: string }, _offset: number, data: ArrayBuffer | ArrayBufferView) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          if (buffer.label) writes.set(buffer.label, Uint8Array.from(bytes));
        }
      },
      createBuffer: ({ label, size, usage }: { label?: string; size: number; usage: number }) => ({ label, size, usage, destroy() {} }),
      createTexture(descriptor: { label?: string }) {
        const texture = { descriptor, destroy() {}, createView(viewDescriptor?: object) { return { texture, viewDescriptor }; } };
        return texture;
      },
      createSampler: () => ({}), createShaderModule: () => ({}),
      createBindGroupLayout: (descriptor: { entries?: readonly { binding: number; texture?: { sampleType: string } }[] }) => { layouts.push(descriptor); return descriptor; }, createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (group: Group) => { groups.push(group); return group; },
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }),
        finish: () => ({})
      }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none", features: { "prd02.irradianceVolume": true } });
    const generated = generateProgramImpl(features, { flags });
    const shader = device.createShaderProgram({ label: "volume", marker: GENERATED_PROGRAM_MARKER,
      vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const volumeTexture = (label: string, width = 2) => new Texture({ width, height: 3, layers: 4, dimension: "2d-array", format: "rgba16f", colorSpace: "linear", label,
      data: new Uint16Array(width * 3 * 4 * 4), generateMipmaps: false });
    const volumes = [volumeTexture("volume-r"), volumeTexture("volume-g"), volumeTexture("volume-b")];
    const dfg = new Texture({ width: 1, height: 1, format: "rgba16f", colorSpace: "linear", data: new Uint16Array(4), generateMipmaps: false });
    const uniforms = new Map<string, UniformValue>([
      ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ...volumes.map((texture, index): [string, UniformValue] => {
        const name = `u_prd02Irradiance${["R", "G", "B"][index]}`;
        return [name, new TextureBinding({ name, texture })];
      }),
      ["u_prd02IrradianceMin", [-3, -2, -1, 0]], ["u_prd02IrradianceMax", [3, 4, 5, 0]], ["u_prd02IrradianceGrid", [2, 3, 4, 0.75]]
    ]);
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false, format: "rgba16f" });
    const vertices = device.createBuffer("vertex", 72);
    const frame = device.createBuffer("uniform", 304, new Float32Array(76));
    device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader, uniforms };
    device.draw(draw);
    const group = groups.find((value) => value.layout.index === 0)!;
    expect(group.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 13, 14, 15]);
    for (let index = 0; index < volumes.length; index += 1) {
      const view = group.entries.find(({ binding }) => binding === 13 + index)!.resource as { texture: unknown; viewDescriptor: unknown };
      expect(view.texture).toBe(device.getNativeTexture(volumes[index]!));
      expect(view.viewDescriptor).toEqual({ dimension: "2d-array" });
    }
    const bytes = writes.get("draw-generated-pbr-material")!;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.volumeGrid! + 12, true)).toBe(0.75);
    const missing = new Map(uniforms); missing.delete("u_prd02IrradianceR");
    expect(() => device.draw({ ...draw, uniforms: missing })).toThrow(/live sampled rgba16f array texture/);
    const wrongDimension = new Map(uniforms);
    wrongDimension.set("u_prd02IrradianceR", new TextureBinding({ name: "u_prd02IrradianceR", texture: dfg }));
    expect(() => device.draw({ ...draw, uniforms: wrongDimension })).toThrow(/dimension/);
    const wrongSizeTexture = volumeTexture("wrong-size", 1);
    const wrongSize = new Map(uniforms);
    wrongSize.set("u_prd02IrradianceR", new TextureBinding({ name: "u_prd02IrradianceR", texture: wrongSizeTexture }));
    expect(() => device.draw({ ...draw, uniforms: wrongSize })).toThrow(/grid|dimensions/i);
    const detailFeatures = normalizeProgramFeatures({ lighting: "lit", environment: "none", lights: { ...lights, dir: 1 },
      maps: { normal: { uvSet: 0, transform: false }, diffuseRoughness: { uvSet: 0, transform: true }, bump: { uvSet: 1, transform: true },
        metallicRoughness: { uvSet: 0, transform: false }, occlusion: { uvSet: 1, transform: false }, emissive: { uvSet: 0, transform: false } },
      extensions: [{ lobe: "specular", maps: ["specular", "specularColor"], mapUvSets: { specular: 0, specularColor: 1 }, bits: {} },
        { lobe: "sheen", maps: ["sheenColor", "sheenRoughness"], mapUvSets: { sheenColor: 1, sheenRoughness: 0 }, bits: {} },
        { lobe: "clearcoat", maps: ["clearcoat", "clearcoatRoughness", "clearcoatNormal"], mapUvSets: { clearcoat: 0, clearcoatRoughness: 1, clearcoatNormal: 1 }, bits: {} },
        { lobe: "iridescence", maps: ["iridescence", "iridescenceThickness"], mapUvSets: { iridescence: 1, iridescenceThickness: 0 }, bits: { film: true } }] });
    const detailGenerated = generateProgramImpl(detailFeatures, { flags });
    const detailShader = device.createShaderProgram({ label: "detail", marker: GENERATED_PROGRAM_MARKER,
      vertex: detailGenerated.vertex, fragment: detailGenerated.fragment, generatedProgram: detailGenerated.descriptor! });
    const detailTextures = ["roughness", "bump", "normal", "metal-rough", "occlusion", "emissive", "specular", "specular-color", "sheen-color", "sheen-roughness", "coat", "coat-roughness", "coat-normal", "iridescence", "iridescence-thickness"].map((label) => new Texture({ width: 2, height: 2, colorSpace: "linear", label, data: new Uint8Array(16), generateMipmaps: false }));
    const detailUniforms = new Map<string, UniformValue>([
      ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["u_diffuseRoughnessTexture", new TextureBinding({ name: "u_diffuseRoughnessTexture", texture: detailTextures[0] })],
      ["u_bumpTexture", new TextureBinding({ name: "u_bumpTexture", texture: detailTextures[1] })],
      ["u_normalMap", new TextureBinding({ name: "u_normalMap", texture: detailTextures[2] })],
      ["u_metallicRoughnessMap", new TextureBinding({ name: "u_metallicRoughnessMap", texture: detailTextures[3] })],
      ["u_occlusionMap", new TextureBinding({ name: "u_occlusionMap", texture: detailTextures[4] })],
      ["u_emissiveMap", new TextureBinding({ name: "u_emissiveMap", texture: detailTextures[5] })],
      ["u_specularTexture", new TextureBinding({ name: "u_specularTexture", texture: detailTextures[6] })],
      ["u_specularColorTexture", new TextureBinding({ name: "u_specularColorTexture", texture: detailTextures[7] })],
      ["u_sheenColorTexture", new TextureBinding({ name: "u_sheenColorTexture", texture: detailTextures[8] })],
      ["u_sheenRoughnessTexture", new TextureBinding({ name: "u_sheenRoughnessTexture", texture: detailTextures[9] })],
      ["u_clearcoatTexture", new TextureBinding({ name: "u_clearcoatTexture", texture: detailTextures[10] })],
      ["u_clearcoatRoughnessTexture", new TextureBinding({ name: "u_clearcoatRoughnessTexture", texture: detailTextures[11] })],
      ["u_clearcoatNormalTexture", new TextureBinding({ name: "u_clearcoatNormalTexture", texture: detailTextures[12] })],
      ["u_iridescenceTexture", new TextureBinding({ name: "u_iridescenceTexture", texture: detailTextures[13] })],
      ["u_iridescenceThicknessTexture", new TextureBinding({ name: "u_iridescenceThicknessTexture", texture: detailTextures[14] })],
      ["u_lightCount", 1], ["u_lightData", new Float32Array(24)],
      ["u_diffuseRoughnessTextureEnabled", 1], ["u_bumpTextureEnabled", 1], ["u_bumpFactor", 0.25]
    ]);
    const detailVertices = device.createBuffer("vertex", 168);
    const detailDraw = { ...draw, vertexBuffer: detailVertices, vertexFormat: VertexFormat.P3N3T4T2T2, shader: detailShader, uniforms: detailUniforms };
    device.draw(detailDraw);
    const detailGroup = groups.filter((value) => value.layout.index === 0).at(-1)!;
    expect(detailGroup.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]);
    expect((detailGroup.entries.find(({ binding }) => binding === 17)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(detailTextures[0]!));
    expect((detailGroup.entries.find(({ binding }) => binding === 19)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(detailTextures[1]!));
    expect((detailGroup.entries.find(({ binding }) => binding === 21)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(detailTextures[2]!));
    expect((detailGroup.entries.find(({ binding }) => binding === 23)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(detailTextures[3]!));
    expect((detailGroup.entries.find(({ binding }) => binding === 25)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(detailTextures[4]!));
    expect((detailGroup.entries.find(({ binding }) => binding === 27)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(detailTextures[5]!));
    for (let index = 0; index < 4; index += 1) {
      const bound = detailGroup.entries.find(({ binding }) => binding === 29 + index * 2)!.resource as { texture: unknown };
      expect(bound.texture).toBe(device.getNativeTexture(detailTextures[index + 6]!));
    }
    for (let index = 0; index < 3; index += 1) {
      const bound = detailGroup.entries.find(({ binding }) => binding === 37 + index * 2)!.resource as { texture: unknown };
      expect(bound.texture).toBe(device.getNativeTexture(detailTextures[index + 10]!));
    }
    for (let index = 0; index < 2; index += 1) {
      const bound = detailGroup.entries.find(({ binding }) => binding === 43 + index * 2)!.resource as { texture: unknown };
      expect(bound.texture).toBe(device.getNativeTexture(detailTextures[index + 13]!));
    }
    const encoded = new Texture({ width: 2, height: 2, colorSpace: "srgb", data: new Uint8Array(16), generateMipmaps: false });
    const srgbDetail = new Map(detailUniforms);
    srgbDetail.set("u_bumpTexture", new TextureBinding({ name: "u_bumpTexture", texture: encoded }));
    expect(() => device.draw({ ...detailDraw, uniforms: srgbDetail })).toThrow(/linear/i);
    const diffuseTransmission = new Map(detailUniforms); diffuseTransmission.set("u_diffuseTransmissionFactor", 0.5);
    expect(() => device.draw({ ...detailDraw, uniforms: diffuseTransmission })).toThrow(/diffuse transmission/i);
    const contact = new Map(detailUniforms); contact.set("u_contactShadowMaskStrength", 0.5);
    expect(() => device.draw({ ...detailDraw, uniforms: contact })).toThrow(/contact shadow/i);
    contact.set("u_contactShadowMaskStrength", 0);
    expect(() => device.draw({ ...detailDraw, uniforms: contact })).not.toThrow();
    const transmission = new Map(detailUniforms); transmission.set("u_transmissionFactor", 0.5);
    expect(() => device.draw({ ...detailDraw, uniforms: transmission })).toThrow(/refractive transmission/i);
    const transmissionMap = new Map(detailUniforms);
    transmissionMap.set("u_transmissionTexture", new TextureBinding({ name: "u_transmissionTexture", texture: detailTextures[0] }));
    expect(() => device.draw({ ...detailDraw, uniforms: transmissionMap })).toThrow(/refractive transmission/i);
    const diffuseFeatures = normalizeProgramFeatures({ lighting: "lit", environment: "none", lights: { ...lights, dir: 1 },
      extensions: [{ lobe: "KHR_materials_diffuse_transmission", maps: ["diffuseTransmission", "diffuseTransmissionColor"],
        mapUvSets: { diffuseTransmission: 1, diffuseTransmissionColor: 0 }, bits: { map: true, colorMap: true } }] });
    const diffuseGenerated = generateProgramImpl(diffuseFeatures, { flags });
    const diffuseShader = device.createShaderProgram({ label: "diffuse-transmission", marker: GENERATED_PROGRAM_MARKER,
      vertex: diffuseGenerated.vertex, fragment: diffuseGenerated.fragment, generatedProgram: diffuseGenerated.descriptor! });
    const diffuseFactorTexture = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([0, 255, 0, 128]), generateMipmaps: false });
    const diffuseUniforms = new Map<string, UniformValue>([
      ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })], ["u_lightCount", 1], ["u_lightData", new Float32Array(24)],
      ["u_diffuseTransmissionFactor", 0.5], ["u_diffuseTransmissionColorFactor", [0.2, 0.6, 0.8]],
      ["u_diffuseTransmissionTexture", new TextureBinding({ name: "u_diffuseTransmissionTexture", texture: diffuseFactorTexture })], ["u_diffuseTransmissionTextureEnabled", 1],
      ["u_diffuseTransmissionColorTexture", new TextureBinding({ name: "u_diffuseTransmissionColorTexture", texture: encoded })], ["u_diffuseTransmissionColorTextureEnabled", 1]
    ]);
    const diffuseDraw = { ...detailDraw, shader: diffuseShader, uniforms: diffuseUniforms };
    device.draw(diffuseDraw);
    const diffuseGroup = groups.filter(value => value.layout.index === 0).at(-1)!;
    expect(diffuseGroup.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 69, 70, 71, 72]);
    expect((diffuseGroup.entries.find(({ binding }) => binding === 70)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(diffuseFactorTexture));
    expect((diffuseGroup.entries.find(({ binding }) => binding === 72)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(encoded));
    expect((device.getNativeTexture(encoded) as unknown as { descriptor: { format: string } }).descriptor.format).toBe("rgba8unorm-srgb");
    const diffuseMissing = new Map(diffuseUniforms); diffuseMissing.delete("u_diffuseTransmissionColorTexture");
    expect(() => device.draw({ ...diffuseDraw, uniforms: diffuseMissing })).toThrow(/live sampled texture/);
    const diffuseWrongSpace = new Map(diffuseUniforms); diffuseWrongSpace.set("u_diffuseTransmissionTexture", new TextureBinding({ name: "u_diffuseTransmissionTexture", texture: encoded }));
    expect(() => device.draw({ ...diffuseDraw, uniforms: diffuseWrongSpace })).toThrow(/linear/);
    expect(() => device.draw({ ...detailDraw, renderState: { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal", alphaToCoverage: true } })).toThrow(/alpha-to-coverage/i);
    const anisotropyFeatures = normalizeProgramFeatures({ lighting: "lit", environment: "none", lights: { ...lights, dir: 1 },
      features: { "prd04.tangentFrame": true, "prd04.geometryTangent": true },
      extensions: [{ lobe: "anisotropy", maps: ["anisotropy"], mapUvSets: { anisotropy: 0 }, bits: { map: true } }] });
    const anisotropyGenerated = generateProgramImpl(anisotropyFeatures, { flags });
    const anisotropyShader = device.createShaderProgram({ label: "anisotropy", marker: GENERATED_PROGRAM_MARKER,
      vertex: anisotropyGenerated.vertex, fragment: anisotropyGenerated.fragment, generatedProgram: anisotropyGenerated.descriptor! });
    const anisotropyTexture = new Texture({ width: 2, height: 2, colorSpace: "linear", data: new Uint8Array(16), generateMipmaps: false });
    const anisotropyUniforms = new Map<string, UniformValue>([["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["u_anisotropyTexture", new TextureBinding({ name: "u_anisotropyTexture", texture: anisotropyTexture })],
      ["u_lightCount", 1], ["u_lightData", new Float32Array(24)], ["u_anisotropyStrength", 0.5]]);
    const anisotropyDraw = { ...detailDraw, shader: anisotropyShader, uniforms: anisotropyUniforms };
    expect(() => device.draw({ ...anisotropyDraw, vertexFormat: VertexFormat.P3N3T2 })).toThrow(/declared position, normal and UV attributes/);
    device.draw(anisotropyDraw);
    const anisotropyGroup = groups.filter((value) => value.layout.index === 0).at(-1)!;
    expect(anisotropyGroup.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 46, 47]);
    expect((anisotropyGroup.entries.find(({ binding }) => binding === 47)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(anisotropyTexture));
    const environmentFeatures = normalizeProgramFeatures({ lighting: "lit", environment: "equirect", lights: { ...lights, hemisphere: true } });
    const environmentGenerated = generateProgramImpl(environmentFeatures, { flags });
    const environmentShader = device.createShaderProgram({ label: "environment", marker: GENERATED_PROGRAM_MARKER,
      vertex: environmentGenerated.vertex, fragment: environmentGenerated.fragment, generatedProgram: environmentGenerated.descriptor! });
    const environmentTexture = new Texture({ width: 2, height: 2, colorSpace: "linear", data: new Uint8Array(16), generateMipmaps: false });
    const environmentUniforms = new Map<string, UniformValue>([["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["u_environmentMap", new TextureBinding({ name: "u_environmentMap", texture: environmentTexture })],
      ["u_environmentMapIntensity", 2], ["u_environmentMapRotation", 0.25], ["u_environmentMapMaxLod", 3], ["u_environmentMapEncoding", 1]]);
    device.draw({ ...draw, shader: environmentShader, uniforms: environmentUniforms });
    const environmentGroup = groups.filter((value) => value.layout.index === 0).at(-1)!;
    expect(environmentGroup.entries.map(({ binding }) => binding)).toEqual([0, 3, 4, 7, 8]);
    expect((environmentGroup.entries.find(({ binding }) => binding === 8)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(environmentTexture));
    const environmentBytes = writes.get("draw-generated-pbr-material")!;
    const environmentView = new DataView(environmentBytes.buffer, environmentBytes.byteOffset, environmentBytes.byteLength);
    expect([0, 1, 2, 3].map((index) => environmentView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.envMap! + index * 4, true))).toEqual([2, 0.25, 3, 1]);
    const loadTexture = (width: number, height: number) => new Texture({ width, height, format: "rgba32f", colorSpace: "linear", data: new Float32Array(width * height * 4), generateMipmaps: false });
    const nearest = new Sampler({ minFilter: "nearest", magFilter: "nearest" });
    const programFor = (featureBits: ProgramFeatures["features"]) => {
      const feature = normalizeProgramFeatures({ lighting: "lit", environment: "none", maps: {}, extensions: [], features: featureBits });
      const result = generateProgramImpl(feature, { flags });
      return device.createShaderProgram({ label: "advanced", marker: GENERATED_PROGRAM_MARKER, vertex: result.vertex, fragment: result.fragment, generatedProgram: result.descriptor! });
    };
    const probeTexture = loadTexture(18, 4);
    const probeUniforms = new Map<string, UniformValue>([["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["u_a3dNativeProbeTexture", new TextureBinding({ name: "u_a3dNativeProbeTexture", texture: probeTexture, sampler: nearest })],
      ["u_a3dNativeProbeMin", [-1, -1, -1, 0]], ["u_a3dNativeProbeMax", [1, 1, 1, 0]], ["u_a3dNativeProbeDimensions", [2, 2, 2, 0]],
      ["u_a3dNativeProbeIntensity", 1], ["u_a3dNativeProbeOutside", 0]]);
    const probeShader = programFor({ "a3d.nativeProbeGrid": true });
    device.draw({ ...draw, shader: probeShader, uniforms: probeUniforms });
    expect(groups.filter(group => group.layout.index === 0).at(-1)!.entries.map(entry => entry.binding)).toEqual([0, 3, 4, 56]);
    expect(layouts.some(layout => layout.entries?.some(entry => entry.binding === 56 && entry.texture?.sampleType === "unfilterable-float"))).toBe(true);
    const malformedProbe = new Map(probeUniforms); malformedProbe.set("u_a3dNativeProbeDimensions", [3, 2, 2, 0]);
    expect(() => device.draw({ ...draw, shader: probeShader, uniforms: malformedProbe })).toThrow(/probe-grid/i);
    const voxelTexture = loadTexture(3, 3);
    const levels = new Float32Array(28); levels.set([2, 2, 2, 0, 1, 1, 1, 8]);
    const voxelUniforms = new Map<string, UniformValue>([["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["u_a3dNativeVoxelTexture", new TextureBinding({ name: "u_a3dNativeVoxelTexture", texture: voxelTexture, sampler: nearest })],
      ["u_a3dNativeVoxelMin", [-1, -1, -1, 0]], ["u_a3dNativeVoxelMax", [1, 1, 1, 0]], ["u_a3dNativeVoxelResolution", [2, 2, 2, 0]],
      ["u_a3dNativeVoxelLevels", levels], ["u_a3dNativeVoxelConfig", [2, 32, 1, 1]], ["u_a3dNativeVoxelIntensity", 1]]);
    const voxelShader = programFor({ "a3d.nativeVoxelIndirect": true });
    device.draw({ ...draw, shader: voxelShader, uniforms: voxelUniforms });
    expect(groups.filter(group => group.layout.index === 0).at(-1)!.entries.map(entry => entry.binding)).toEqual([0, 3, 4, 57]);
    const badLevels = new Float32Array(levels); badLevels[7] = 7;
    const malformedVoxel = new Map(voxelUniforms); malformedVoxel.set("u_a3dNativeVoxelLevels", badLevels);
    expect(() => device.draw({ ...draw, shader: voxelShader, uniforms: malformedVoxel })).toThrow(/pyramid/i);
    const lightmapTexture = loadTexture(2, 2);
    const lightmapUniforms = new Map<string, UniformValue>([["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
      ["u_a3dNativeLightmapTexture", new TextureBinding({ name: "u_a3dNativeLightmapTexture", texture: lightmapTexture, sampler: nearest })], ["u_a3dNativeLightmapIntensity", 0.5]]);
    const lightmapShader = programFor({ "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 1 });
    device.draw({ ...draw, vertexBuffer: detailVertices, vertexFormat: VertexFormat.P3N3T4T2T2, shader: lightmapShader, uniforms: lightmapUniforms });
    expect(groups.filter(group => group.layout.index === 0).at(-1)!.entries.map(entry => entry.binding)).toEqual([0, 3, 4, 58]);
    expect(layouts.some(layout => layout.entries?.some(entry => entry.binding === 58 && entry.texture?.sampleType === "unfilterable-float"))).toBe(true);
    probeTexture.dispose(); voxelTexture.dispose(); lightmapTexture.dispose();
    device.endFrame(); device.dispose(); volumes.forEach((texture) => texture.dispose()); dfg.dispose(); wrongSizeTexture.dispose();
    detailTextures.forEach((texture) => texture.dispose()); encoded.dispose(); diffuseFactorTexture.dispose(); anisotropyTexture.dispose(); environmentTexture.dispose();
  });

  it("validates and submits float and normalized vertex colors in the native pipeline", async () => {
    const pipelines: { vertex: { buffers: readonly { attributes: readonly { shaderLocation: number; format: string }[] }[] } }[] = [];
    let submissions = 0;
    const native = {
      queue: { submit() { submissions += 1; }, onSubmittedWorkDone: async () => {}, writeBuffer() {}, writeTexture() {} },
      createBuffer: (descriptor: object) => ({ descriptor, destroy() {} }),
      createTexture(descriptor: object) {
        const texture = { descriptor, destroy() {}, createView: (view?: object) => ({ texture, view }) };
        return texture;
      },
      createShaderModule: (descriptor: object) => descriptor, createSampler: () => ({}),
      createBindGroupLayout: (descriptor: object) => descriptor, createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline(descriptor: typeof pipelines[number]) { pipelines.push(descriptor); return { getBindGroupLayout: (index: number) => ({ index }) }; },
      createBindGroup: (descriptor: object) => descriptor,
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const features = normalizeProgramFeatures({ lighting: "lit", vertexColors: true, maps: {}, extensions: [], environment: "none" });
    const source = generateProgramImpl(features, { flags });
    const shader = device.createShaderProgram({ label: "colored", marker: GENERATED_PROGRAM_MARKER,
      vertex: source.vertex, fragment: source.fragment, generatedProgram: source.descriptor! });
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false, format: "rgba16f" });
    const vertex = device.createBuffer("vertex", 120), frame = device.createBuffer("uniform", 304, new Float32Array(76));
    const format = (color: { components: 3 | 4; type?: "float32" | "uint8"; normalized?: boolean; integer?: boolean }, stride: number) => new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "color", offset: 24, ...color }
    ], stride);
    const normalized = format({ components: 4, type: "uint8", normalized: true }, 28);
    const floating = format({ components: 4, type: "float32" }, 40);
    try {
      device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
      const draw = { topology: "triangles" as const, vertexBuffer: vertex, vertexFormat: normalized, vertexCount: 3, shader };
      device.draw(draw); device.draw({ ...draw, vertexFormat: floating });
      expect(pipelines.map(pipeline => pipeline.vertex.buffers.flatMap(buffer => buffer.attributes)
        .find(attribute => attribute.shaderLocation === 4)?.format)).toEqual(["unorm8x4", "float32x4"]);
      const before = submissions;
      expect(() => device.draw({ ...draw, vertexFormat: VertexFormat.P3N3 })).toThrow(/declared position, normal and UV attributes/);
      expect(() => device.draw({ ...draw, vertexFormat: format({ components: 3, type: "float32" }, 36) })).toThrow(/declared position, normal and UV attributes/);
      expect(() => device.draw({ ...draw, vertexFormat: format({ components: 4, type: "uint8", integer: true }, 28) })).toThrow(/declared position, normal and UV attributes/);
      expect(submissions).toBe(before);
      const fogShader = (fog: "linear" | "exp2" | "height") => {
        const generated = generateProgramImpl(normalizeProgramFeatures({ ...features, fog }), { flags });
        return device.createShaderProgram({ label: `fog-${fog}`, marker: GENERATED_PROGRAM_MARKER,
          vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
      };
      const linear = fogShader("linear"), exp2 = fogShader("exp2"), height = fogShader("height");
      const fogUniforms = new Map<string, UniformValue>([["u_fogColor", [0.25, 0.5, 0.75]], ["u_fogRange", [2, 20]],
        ["u_fogDensity", 0.25], ["u_fogHeightFalloff", 0.5]]);
      device.draw({ ...draw, shader: linear, uniforms: fogUniforms });
      device.draw({ ...draw, shader: exp2, uniforms: fogUniforms });
      device.draw({ ...draw, shader: height, uniforms: fogUniforms });
      const fogBefore = submissions;
      const invalid = new Map(fogUniforms); invalid.set("u_fogRange", [4, 4]);
      expect(() => device.draw({ ...draw, shader: linear, uniforms: invalid })).toThrow(/fog requires/);
      invalid.set("u_fogDensity", -0.1);
      expect(() => device.draw({ ...draw, shader: exp2, uniforms: invalid })).toThrow(/fog requires/);
      invalid.set("u_fogDensity", 0.25); invalid.delete("u_fogHeightFalloff");
      expect(() => device.draw({ ...draw, shader: height, uniforms: invalid })).toThrow(/fog requires/);
      invalid.delete("u_fogColor");
      expect(() => device.draw({ ...draw, shader: exp2, uniforms: invalid })).toThrow(/fog requires/);
      expect(submissions).toBe(fogBefore);
      const clippedSource = generateProgramImpl(normalizeProgramFeatures({ ...features, features: { "a3d.clipping": true } }), { flags });
      const clippedShader = device.createShaderProgram({ label: "clipped", marker: GENERATED_PROGRAM_MARKER,
        vertex: clippedSource.vertex, fragment: clippedSource.fragment, generatedProgram: clippedSource.descriptor! });
      const clipping = createClippingBinding({ backend: "webgpu", global: { planes: [[1, 0, 0, 0]] },
        material: { space: "local", combine: "union", planes: [[0, 1, 0, 0], [0, 0, 1, 0]] } });
      const clipUniforms = new Map<string, UniformValue>(createClippingUniforms(clipping));
      device.draw({ ...draw, shader: clippedShader, uniforms: clipUniforms });
      const clipBefore = submissions;
      expect(() => device.draw({ ...draw, uniforms: clipUniforms })).toThrow(/clipping group count/i);
      const badClip = new Map(clipUniforms); badClip.delete("u_a3dClipPlanes");
      expect(() => device.draw({ ...draw, shader: clippedShader, uniforms: badClip })).toThrow(/clipping requires/i);
      badClip.set("u_a3dClipPlanes", new Float32Array(32));
      expect(() => device.draw({ ...draw, shader: clippedShader, uniforms: badClip })).toThrow(/clipping plane has no normal/i);
      badClip.set("u_a3dClipPlanes", clipUniforms.get("u_a3dClipPlanes")!);
      badClip.set("u_a3dClipGroups", new Float32Array([7, 2, 0, 0, 0, 0, 0, 0]));
      expect(() => device.draw({ ...draw, shader: clippedShader, uniforms: badClip })).toThrow(/clipping group range/i);
      badClip.set("u_a3dClipGroups", new Float32Array([0, 1, 2, 0, 0, 0, 0, 0]));
      expect(() => device.draw({ ...draw, shader: clippedShader, uniforms: badClip })).toThrow(/clipping group range/i);
      expect(submissions).toBe(clipBefore);
      const facetedSource = generateProgramImpl(normalizeProgramFeatures({ ...features, flatShading: true, diffuseModel: "burley", lights: { ...lights, dir: 1 } }), { flags });
      const faceted = device.createShaderProgram({ label: "faceted-burley", marker: GENERATED_PROGRAM_MARKER,
        vertex: facetedSource.vertex, fragment: facetedSource.fragment, generatedProgram: facetedSource.descriptor! });
      const dfg = new Texture({ width: 1, height: 1, format: "rgba16f", colorSpace: "linear", data: new Uint16Array(4), generateMipmaps: false });
      try {
        const lighting = new Map<string, UniformValue>([["u_lightCount", 1], ["u_lightData", new Float32Array(24)],
          ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })]]);
        device.draw({ ...draw, shader: faceted, uniforms: lighting });
        expect(submissions).toBe(clipBefore + 1);
        const clusteredLights = Array.from({ length: 17 }, (_, index) => {
          const light = new DirectionalLight(`cluster-source-${index}`); light.castsShadow = index === 16;
          light.transform.updateWorld(undefined, true); return collectLight(light);
        });
        const cluster = createClusteredForwardLighting(clusteredLights, 2, 2);
        try {
          const source = generateProgramImpl(normalizeProgramFeatures({ ...features, lights: { ...lights, dir: 8, clustered: true } }), { flags });
          const clusteredShader = device.createShaderProgram({ label: "clustered", marker: GENERATED_PROGRAM_MARKER,
            vertex: source.vertex, fragment: source.fragment, generatedProgram: source.descriptor! });
          const clusterUniforms = new Map<string, UniformValue>([["u_lightCount", 0], ["u_dfgLut", new TextureBinding({ name: "u_dfgLut", texture: dfg })],
            ["u_clusterGridSize", [1, 1]], ["u_clusterViewportSize", [2, 2]],
            ["u_clusterLightData", cluster.lightData], ["u_clusterLightIndices", cluster.lightIndices]]);
          const clusterDraw = { ...draw, shader: clusteredShader, uniforms: clusterUniforms };
          device.draw(clusterDraw);
          const clusterBefore = submissions;
          const missing = new Map(clusterUniforms); missing.delete("u_clusterLightIndices");
          expect(() => device.draw({ ...clusterDraw, uniforms: missing })).toThrow(/clustered lighting requires/i);
          const wrongGrid = new Map(clusterUniforms); wrongGrid.set("u_clusterGridSize", [2, 1]);
          expect(() => device.draw({ ...clusterDraw, uniforms: wrongGrid })).toThrow(/clustered lighting requires/i);
          const wrongViewport = new Map(clusterUniforms); wrongViewport.set("u_clusterViewportSize", [1, 2]);
          expect(() => device.draw({ ...clusterDraw, uniforms: wrongViewport })).toThrow(/clustered lighting requires/i);
          device.setViewport(0, 0, 1, 2);
          expect(() => device.draw(clusterDraw)).toThrow(/clustered lighting requires/i);
          device.resetViewport();
          const indexTexture = cluster.lightIndices.texture!;
          const indexData = (indexTexture.getMipLevel(0)!.data as Float32Array).slice();
          const invalidIndices = indexData.slice(); invalidIndices[0] = 17; indexTexture.updateMip(0, invalidIndices);
          expect(() => device.draw(clusterDraw)).toThrow(/index is outside/i);
          indexTexture.updateMip(0, indexData);
          expect(submissions).toBe(clusterBefore);
          device.draw(clusterDraw);
          const adapter = device.createTextureResidencyAdapter();
          const streamSource = { texture: indexTexture, identity: {}, fallback: [0, 0, 0, 255] as const,
            levels: [{ width: 64, height: 1, bytes: 1024 }] };
          const generation = adapter.generation();
          adapter.prepare(streamSource, { generation, maxBytes: 1_000_000 });
          expect(() => device.draw(clusterDraw)).toThrow(/clustered lighting requires/i);
          await adapter.unprepare(streamSource, generation);
          device.draw(clusterDraw);
          const rectSource = generateProgramImpl(normalizeProgramFeatures({ ...features, lights: { ...lights, dir: 8, rect: 1, clustered: true } }), { flags });
          const rectShader = device.createShaderProgram({ label: "clustered-rectangle", marker: GENERATED_PROGRAM_MARKER,
            vertex: rectSource.vertex, fragment: rectSource.fragment, generatedProgram: rectSource.descriptor! });
          const lightTexture = cluster.lightData.texture!;
          const originalLights = (lightTexture.getMipLevel(0)!.data as Float32Array).slice();
          const rectLights = originalLights.slice(); rectLights[11] = 3; rectLights[12] = 2; rectLights[13] = 1; rectLights[14] = 1;
          lightTexture.updateMip(0, rectLights);
          expect(() => device.draw({ ...clusterDraw, shader: rectShader })).toThrow(/rectangle shadow flag/i);
          rectLights[14] = 0; lightTexture.updateMip(0, rectLights);
          expect(() => device.draw(clusterDraw)).toThrow(/rectangle shadow flag/i);
          device.draw({ ...clusterDraw, shader: rectShader });
          lightTexture.updateMip(0, originalLights);
          const contactSource = generateProgramImpl(normalizeProgramFeatures({ ...features, lights: { ...lights, dir: 8, clustered: true },
            shadows: { ...shadow, contact: true } }), { flags });
          const contactShader = device.createShaderProgram({ label: "cluster-contact", marker: GENERATED_PROGRAM_MARKER,
            vertex: contactSource.vertex, fragment: contactSource.fragment, generatedProgram: contactSource.descriptor! });
          const mask = device.createRenderTarget({ width: 2, height: 2, depth: false, format: "rgba8" });
          try {
            device.setRenderTarget(mask); device.clear([1, 1, 1, 1]); device.setRenderTarget(target);
            const contact = new Map(clusterUniforms);
            contact.set("u_contactShadowMask", new TextureBinding({ name: "u_contactShadowMask", texture: mask.colorTexture }));
            contact.set("u_contactShadowMaskStrength", 0.5); contact.set("u_contactShadowMaskViewport", [2, 2]);
            contact.set("u_contactShadowLightIndex", 16);
            device.draw({ ...clusterDraw, shader: contactShader, uniforms: contact });
            const lightData = (lightTexture.getMipLevel(0)!.data as Float32Array).slice();
            const changedLight = lightData.slice(); changedLight[16 * 24 + 14] = 0; lightTexture.updateMip(0, changedLight);
            expect(() => device.draw({ ...clusterDraw, shader: contactShader, uniforms: contact })).toThrow(/contact shadow requires/i);
            lightTexture.updateMip(0, lightData);
            contact.set("u_contactShadowLightIndex", 15);
            expect(() => device.draw({ ...clusterDraw, shader: contactShader, uniforms: contact })).toThrow(/contact shadow requires/i);
          } finally { mask.dispose(); }
        } finally { cluster.dispose(); }
      } finally { dfg.dispose(); }
      device.endFrame();
    } finally { target.dispose(); device.dispose(); }
  });

  it("submits a ForwardPass diffuse-transmission material with vertex color and its actual mapped resources", async () => {
    type Group = { entries: readonly { binding: number; resource: unknown }[] };
    const groups: Group[] = [];
    const modules: { code: string }[] = [];
    const pipelines: { vertex: { buffers: readonly { attributes: readonly { shaderLocation: number; format: string }[] }[] } }[] = [];
    const writes = new Map<string, Uint8Array>();
    const textureWrites = new Map<string, Uint8Array>();
    const submissions: unknown[] = [];
    let completeFence!: () => void;
    const fence = new Promise<void>(resolve => { completeFence = resolve; });
    const native = {
      queue: {
        submit(commands: readonly unknown[]) { submissions.push(...commands); },
        onSubmittedWorkDone: () => fence,
        writeBuffer(buffer: { descriptor: { label?: string } }, _offset: number, data: ArrayBufferView) {
          writes.set(buffer.descriptor.label ?? "", new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
        },
        writeTexture(destination: { texture: { descriptor: { label?: string } } }, data: ArrayBufferView) {
          textureWrites.set(destination.texture.descriptor.label ?? "", new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
        }
      },
      createBuffer: (descriptor: { label?: string }) => ({ descriptor, destroy() {} }),
      createTexture(descriptor: { format: string }) {
        const texture = { descriptor, destroyed: false, destroy() { this.destroyed = true; }, createView: (view?: object) => ({ texture, view }) };
        return texture;
      },
      createShaderModule(descriptor: { code: string }) { modules.push(descriptor); return descriptor; },
      createSampler: () => ({}), createBindGroupLayout: (descriptor: object) => descriptor,
      createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline(descriptor: typeof pipelines[number]) { pipelines.push(descriptor); return { getBindGroupLayout: (index: number) => ({ index }) }; },
      createBindGroup(group: Group) { groups.push(group); return group; },
      createCommandEncoder: (descriptor: { label: string }) => ({
        beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw() {}, drawIndexed() {}, end() {} }),
        finish: () => ({ label: descriptor.label })
      }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const qrFlags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true });
    setRendererQrFlags(qrFlags, device);
    const factor = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([0, 0, 0, 128]), generateMipmaps: false });
    const color = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([128, 64, 255, 255]), generateMipmaps: false });
    const material = new TexturedPBRMaterial({ diffuseTransmissionFactor: 0.6, diffuseTransmissionColorFactor: [0.2, 0.8, 0.3],
      diffuseTransmissionTexture: factor, diffuseTransmissionColorTexture: color,
      diffuseTransmissionTextureTransform: { offset: [0.1, 0.2] }, diffuseTransmissionColorTextureTransform: { scale: [2, 3] },
      textureTexCoords: { diffuseTransmission: 0, diffuseTransmissionColor: 1 } });
    const coloredFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "tangent", components: 4, offset: 24 }, { semantic: "uv", components: 2, offset: 40 },
      { semantic: "uv1", components: 2, offset: 48 }, { semantic: "color", components: 4, type: "uint8", normalized: true, offset: 56 }
    ], 60);
    const geometry = new Geometry(new VertexBuffer(coloredFormat, 3));
    const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: true });
    const sun = new DirectionalLight("sun"); sun.transform.updateWorld(undefined, true);
    try {
      device.beginFrame(8, 8); device.setRenderTarget(target);
      new ForwardPass({ items: [{ label: "diffuse-forward", geometry, material }], lights: [collectLight(sun)],
        environmentFog: { mode: "linear", color: [0.25, 0.5, 0.75], near: 2, far: 20, density: 0.25 } })
        .execute({ device, width: 8, height: 8 });
      expect(submissions.some(command => (command as { label?: string }).label?.includes("diffuse-forward"))).toBe(true);
      const group = groups.find(entry => entry.entries.some(binding => binding.binding === 70))!;
      expect(group.entries.map(entry => entry.binding)).toEqual(expect.arrayContaining([69, 70, 71, 72]));
      expect((group.entries.find(entry => entry.binding === 70)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(factor));
      expect((group.entries.find(entry => entry.binding === 72)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(color));
      expect((device.getNativeTexture(color) as unknown as { descriptor: { format: string } }).descriptor.format).toBe("rgba8unorm-srgb");
      const shader = modules.find(module => module.code.includes("let diffuseTransmissionFactor ="))!.code;
      expect(pipelines.some(pipeline => pipeline.vertex.buffers.flatMap(buffer => buffer.attributes)
        .some(attribute => attribute.shaderLocation === 4 && attribute.format === "unorm8x4"))).toBe(true);
      expect(shader).toContain("material.baseColor * input.color");
      expect(shader).toContain("material.diffuseTransmissionTransform * vec3f(input.uv, 1.0)");
      expect(shader).toContain("material.diffuseTransmissionColorTransform * vec3f(input.uv1, 1.0)");
      expect(shader).toContain("let backNl = clamp(-dot(n, light.direction)");
      expect(shader).toContain("let color = mix(unfoggedColor, material.fogColor.rgb, fogAmount)");
      const bytes = writes.get("diffuse-forward-generated-pbr-material")!;
      const packed = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const values = GENERATED_PBR_MATERIAL_OFFSETS.diffuseTransmission!;
      [0.2, 0.8, 0.3, 0.6].forEach((value, index) => expect(packed.getFloat32(values + index * 4, true)).toBeCloseTo(value));
      const uv0 = GENERATED_PBR_MATERIAL_OFFSETS.diffuseTransmissionTransform!;
      const uv1 = GENERATED_PBR_MATERIAL_OFFSETS.diffuseTransmissionColorTransform!;
      expect(packed.getFloat32(uv0 + 32, true)).toBeCloseTo(0.1);
      expect(packed.getFloat32(uv0 + 36, true)).toBeCloseTo(0.2);
      expect(packed.getFloat32(uv1, true)).toBeCloseTo(2);
      expect(packed.getFloat32(uv1 + 20, true)).toBeCloseTo(3);
      const fogColor = GENERATED_PBR_MATERIAL_OFFSETS.fogColor!, fogParams = GENERATED_PBR_MATERIAL_OFFSETS.fogParams!;
      expect([0, 1, 2].map(index => packed.getFloat32(fogColor + index * 4, true))).toEqual([0.25, 0.5, 0.75]);
      expect([packed.getFloat32(fogParams, true), packed.getFloat32(fogParams + 4, true)]).toEqual([2, 20]);
      new ForwardPass({ items: [{ label: "diffuse-clipped", geometry, material }],
        globalClipping: { planes: [[1, 0, 0, -1]] },
        materialClippingFor: () => ({ space: "local", combine: "union", planes: [[0, 1, 0, 0], [0, 0, 1, 0]] }) })
        .execute({ device, width: 8, height: 8 });
      const clipped = modules.find(module => module.code.includes("fn generatedClipRetains("))!.code;
      expect(clipped).toContain("generatedClipRetains(input.worldPosition, input.clipLocal)");
      const clippedBytes = writes.get("diffuse-clipped-generated-pbr-material")!;
      const clippedPacked = new DataView(clippedBytes.buffer, clippedBytes.byteOffset, clippedBytes.byteLength);
      expect(clippedPacked.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.clipControl!, true)).toBe(2);
      expect([0, 1, 2, 3].map(index => clippedPacked.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.clipGroups! + 16 + index * 4, true))).toEqual([1, 2, 1, 1]);
      expect(clippedPacked.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.clipPlanes! + 12, true)).toBe(-1);
      const rect = new RectAreaLight("finite-rectangle"); rect.width = 2; rect.height = 1; rect.range = 10; rect.intensity = 2;
      rect.castsShadow = true; rect.transform.updateWorld(undefined, true);
      new ForwardPass({ items: [{ label: "diffuse-rectangle", geometry, material }], lights: [collectLight(rect)] })
        .execute({ device, width: 8, height: 8 });
      const rectangleShader = modules.find(module => module.code.includes("fn generatedRectLight("))!.code;
      expect(rectangleShader).toContain("generatedRectLight(colorIntensity, positionRange, directionKind, spot, areaRight, areaUp, sampleIndex");
      const rectangleBytes = writes.get("diffuse-rectangle-generated-pbr-material")!;
      const rectanglePacked = new DataView(rectangleBytes.buffer, rectangleBytes.byteOffset, rectangleBytes.byteLength);
      const lightOffset = GENERATED_PBR_MATERIAL_OFFSETS.lights!;
      expect([11, 12, 13, 14].map(index => rectanglePacked.getFloat32(lightOffset + index * 4, true))).toEqual([3, 2, 1, 0]);
      const rectangles = Array.from({ length: 5 }, (_, index) => {
        const area = new RectAreaLight(`area-${index}`); area.transform.updateWorld(undefined, true); return collectLight(area);
      });
      new ForwardPass({ items: [{ label: "diffuse-five-rectangles", geometry, material }], lights: rectangles })
        .execute({ device, width: 8, height: 8 });
      expect(modules.some(module => module.code.includes("fn generatedRectLight(") && module.code.includes("slot < 16u"))).toBe(true);
      const fiveBytes = writes.get("diffuse-five-rectangles-generated-pbr-material")!;
      const five = new DataView(fiveBytes.buffer, fiveBytes.byteOffset, fiveBytes.byteLength);
      expect(five.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.direct!, true)).toBe(5);
      expect(five.getFloat32(lightOffset + (4 * 24 + 11) * 4, true)).toBe(3);
      const clusteredLights = Array.from({ length: 17 }, (_, index) => {
        const light = index === 14 ? new RectAreaLight(`cluster-${index}`) : index === 15 ? new PointLight(`cluster-${index}`)
          : index === 16 ? new SpotLight(`cluster-${index}`) : new DirectionalLight(`cluster-${index}`);
        light.transform.updateWorld(undefined, true); return collectLight(light);
      });
      const beforeCluster = submissions.length;
      new ForwardPass({ items: [{ label: "diffuse-clustered", geometry, material }], lights: clusteredLights })
        .execute({ device, width: 8, height: 8 });
      expect(submissions.length).toBeGreaterThan(beforeCluster);
      const clusterGroup = groups.find(entry => entry.entries.some(binding => binding.binding === 73))!;
      const clusterData = clusterGroup.entries.find(entry => entry.binding === 73)!.resource as { texture: { destroyed: boolean; descriptor: { label: string; format: string } } };
      const clusterIndices = clusterGroup.entries.find(entry => entry.binding === 74)!.resource as { texture: { destroyed: boolean; descriptor: { label: string; format: string } } };
      expect(clusterData.texture.descriptor).toMatchObject({ label: "clustered-forward-light-data", format: "rgba32float" });
      expect(clusterIndices.texture.descriptor).toMatchObject({ label: "clustered-forward-light-indices", format: "rgba32float" });
      const lightBytes = textureWrites.get("clustered-forward-light-data")!;
      const lightRows = new DataView(lightBytes.buffer, lightBytes.byteOffset, lightBytes.byteLength);
      expect([14, 15, 16].map(index => lightRows.getFloat32((index * 24 + 11) * 4, true))).toEqual([3, 1, 2]);
      const clusterShader = modules.find(module => module.code.includes("let clusterPixel ="))!.code;
      expect(clusterShader).toContain("textureLoad(u_clusterLightDataTexture, vec2i(3, i32(index)), 0)");
      expect(clusterShader).toContain("floor(clusterPixel / 64.0)");
      const clusterBytes = writes.get("diffuse-clustered-generated-pbr-material")!;
      const clusterPacked = new DataView(clusterBytes.buffer, clusterBytes.byteOffset, clusterBytes.byteLength);
      expect([0, 1, 2, 3].map(index => clusterPacked.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.clusterGrid! + index * 4, true))).toEqual([1, 1, 8, 8]);
      expect([clusterData.texture.destroyed, clusterIndices.texture.destroyed]).toEqual([false, false]);
      completeFence(); await fence; await Promise.resolve();
      expect([clusterData.texture.destroyed, clusterIndices.texture.destroyed]).toEqual([true, true]);
      device.endFrame();
    } finally {
      target.dispose(); geometry.dispose(); material.dispose(); factor.dispose(); color.dispose(); device.dispose();
    }
  });
});

describe("offline generated PBR shader validation", () => {
  const nagaAvailable = spawnSync("naga", ["--version"], { encoding: "utf8" }).status === 0;
  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires Naga when requested by the source gate", () => {
    expect(nagaAvailable, "naga is required for generated PBR WGSL validation").toBe(true);
  });
  it.runIf(nagaAvailable)("validates probe and procedural vertex/fragment modules", () => {
    const programs = [
      generateProgramImpl(normalizeProgramFeatures({ target: "wgsl" })),
      generateProgramImpl(normalizeProgramFeatures({ target: "wgsl", alphaMode: "mask", vertexColors: true,
        maps: { baseColor: { uvSet: 1, transform: true } }, features: { "a3d.nativePrimitive": "lines", "a3d.clipping": true } })),
      generateProgramImpl(normalizeProgramFeatures({ target: "wgsl", lighting: "lit", lights: { ...lights, dir: 1 },
        maps: { baseColor: { uvSet: 0, transform: true }, normal: { uvSet: 1, transform: false } } }), { flags }),
      createGeneratedPbrProgram(descriptor()),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, hemisphere: true }, environment: "none", features: { "prd02.shadowFilter": 3, "prd03.indirectFraction": "indirectFraction" } })),
      createGeneratedPbrProgram(descriptor({ features: { "prd02.ibl": true, "prd02.shadowFilter": 3, "prd03.indirectFraction": "indirectFraction", "prd02.localProbe": true } })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1, point: 1, spot: 1 }, environment: "none", features: {} })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1, point: 1, spot: 1 }, environment: "none", features: {}, shadows: { ...shadow, cascades: 3, localShadows: 6 } })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1, point: 1, spot: 1 }, environment: "none", features: { "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true }, shadows: { ...shadow, cascades: 1, localShadows: 6, contact: true } })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 8, point: 8, spot: 8, clustered: true }, environment: "none",
        features: { "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true }, shadows: { ...shadow, cascades: 1, localShadows: 6, contact: true } })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1, rect: 4, clustered: true }, environment: "none", features: {}, extensions: [
        { lobe: "clearcoat", maps: [], bits: {} }, { lobe: "sheen", maps: [], bits: {} }, { lobe: "diffuse-transmission", maps: [], bits: {} }
      ] })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1 }, environment: "none", features: {}, shadows: { ...shadow, contact: true } })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, point: 1 }, environment: "none", features: {}, shadows: { ...shadow, localShadows: 6 } })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1 }, environment: "none", vertexColors: true, features: { "prd06.deform": "skin8|morph4nt|k8", "a3d.clipping": true }, instancing: { color: true } })),
      createGeneratedPbrProgram(descriptor({ environment: "none", fog: "height", vertexColors: true, flatShading: true,
        diffuseModel: "burley", lights: { ...lights, dir: 1 }, features: {} })),
      createGeneratedPbrProgram(descriptor({ environment: "none", features: { "a3d.nativeProbeGrid": true } })),
      createGeneratedPbrProgram(descriptor({ environment: "none", features: { "a3d.nativeVoxelIndirect": true } })),
      createGeneratedPbrProgram(descriptor({ environment: "none", features: { "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 1 } })),
      createGeneratedPbrProgram(descriptor({ environment: "none", features: { "prd04.transmissionTarget": true }, extensions: [
        { lobe: "transmission", maps: ["transmission"], mapUvSets: { transmission: 1 }, bits: { map: true } },
        { lobe: "volume", maps: ["volumeThickness"], mapUvSets: { volumeThickness: 0 }, bits: { thicknessMap: true } },
        { lobe: "dispersion", maps: [], bits: {} }
      ] })),
      createGeneratedPbrProgram(descriptor({ environment: "none", features: { "prd04.transmissionTarget": true }, instancing: { color: true }, extensions: [
        { lobe: "transmission", maps: [], bits: {} }, { lobe: "volume", maps: [], bits: {} }, { lobe: "dispersion", maps: [], bits: {} }
      ] })),
      createGeneratedPbrProgram(descriptor({ environment: "none", lights: { ...lights, dir: 1, hemisphere: true }, features: {}, extensions: [
        { lobe: "KHR_materials_diffuse_transmission", maps: ["diffuseTransmission", "diffuseTransmissionColor"],
          mapUvSets: { diffuseTransmission: 1, diffuseTransmissionColor: 0 }, bits: { map: true, colorMap: true } }
      ] })),
      createGeneratedPbrProgram(descriptor({ environment: "pmrem-cube", features: { "prd02.ibl": true, "prd02.irradianceVolume": true, "prd04.transmissionTarget": true }, extensions: [
        { lobe: "diffuse-transmission", maps: [], bits: {} }, { lobe: "transmission", maps: [], bits: {} }
      ] })),
      createGeneratedPbrProgram(descriptor({ features: { "prd02.ibl": true, "prd03.indirectFraction": "indirectFraction", "prd02.irradianceVolume": true } })),
      createGeneratedPbrProgram(descriptor({ environment: "none", features: {}, lights: { ...lights, dir: 1 }, maps: {
        normal: { uvSet: 0, transform: false }, diffuseRoughness: { uvSet: 0, transform: true }, bump: { uvSet: 1, transform: true },
        metallicRoughness: { uvSet: 0, transform: true }, occlusion: { uvSet: 1, transform: false }, emissive: { uvSet: 1, transform: true }
      } })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1 }, features: { "prd02.ibl": true, "prd02.localProbe": true }, extensions: [
        { lobe: "clearcoat", maps: ["clearcoat", "clearcoatRoughness", "clearcoatNormal"], mapUvSets: { clearcoat: 0, clearcoatRoughness: 1, clearcoatNormal: 1 }, bits: {} },
        { lobe: "iridescence", maps: ["iridescence", "iridescenceThickness"], mapUvSets: { iridescence: 1, iridescenceThickness: 0 }, bits: { film: true } }
      ] })),
      createGeneratedPbrProgram(descriptor({ lights: { ...lights, dir: 1 }, features: { "prd02.ibl": true, "prd04.tangentFrame": true, "prd04.geometryTangent": true }, extensions: [
        { lobe: "anisotropy", maps: ["anisotropy"], mapUvSets: { anisotropy: 1 }, bits: { map: true } }
      ] })),
      createGeneratedPbrProgram(descriptor({ environment: "equirect", lights: { ...lights, hemisphere: true }, features: { "prd02.localProbe": true } }))
    ];
    const directory = mkdtempSync(join(tmpdir(), "aura-generated-pbr-"));
    try {
      for (const [index, program] of programs.entries()) {
        for (const [stage, source] of [["vertex", program.vertex], ["fragment", program.fragment]] as const) {
          const file = join(directory, `${index}-${stage}.wgsl`);
          writeFileSync(file, source);
          expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
        }
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
