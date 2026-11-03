/**
 * Reviewable option probes. A row identifies a specific downstream observation;
 * it does not assert rendered-pixel or device coverage. The values are authored
 * against each builder's real option type, not synthesized from TypeScript's
 * broad primitive types. New documented options require a row and a matching
 * consumer test before they can be treated as covered.
 */
import { registerOptionCoverage } from "../../contracts/compiler.js";
import type { OptionCoverageRow } from "../../contracts/compiler.js";
import type { AuraModelOptions, AuraPrimitiveOptions, AuraCustomMaterialSpec } from "../nodes/types.js";
import type { AuraInstancedModelOptions, AuraInstancedPrimitiveOptions } from "../nodes/instances.js";
import type { AuraOrbitOptions, interactions } from "../nodes/interactions.js";
import type { lights } from "../nodes/lights.js";
import type { vfxEffectBuilders } from "../nodes/effects.js";
import type { postEffectBuilders } from "../nodes/effects.post.js";
import type { material } from "../nodes/material.js";
import type { AuraToonOptions } from "../nodes/effects.toon.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";

type OptionProbe<T> = <K extends keyof T & string>(
  builder: string, field: K, a: T[K], b: T[K], observation: string
) => OptionCoverageRow;

function forOptions<T>(): OptionProbe<T> {
  return (builder, field, probeValueA, probeValueB, observation) => ({
    builder, field, probeValueA, probeValueB, ownerPrd: 19,
    disposition: "runtime", observation
  });
}

type UnsupportedProbe<T> = <K extends keyof T & string>(
  builder: string, field: K, a: T[K], b: T[K], observation: string, reason: string
) => OptionCoverageRow;

/** A typed option the runtime rejects with the named error; `reason` is the actionable fix. */
function unsupportedFor<T>(): UnsupportedProbe<T> {
  return (builder, field, probeValueA, probeValueB, observation, reason) => ({
    builder, field, probeValueA, probeValueB, ownerPrd: 19,
    disposition: "unsupported", observation, reason
  });
}

const primitive = forOptions<AuraPrimitiveOptions>();
const instanced = forOptions<AuraInstancedPrimitiveOptions>();
const model = forOptions<AuraModelOptions>();
const modelInstances = forOptions<AuraInstancedModelOptions>();
const orbit = forOptions<AuraOrbitOptions>();
const directional = forOptions<NonNullable<Parameters<typeof lights.directional>[0]>>();
const studio = forOptions<NonNullable<Parameters<typeof lights.studio>[0]>>();
const fog = forOptions<NonNullable<Parameters<typeof vfxEffectBuilders.fog>[0]>>();
const bloom = forOptions<NonNullable<Parameters<typeof postEffectBuilders.bloom>[0]>>();
const hemisphere = forOptions<NonNullable<Parameters<typeof lights.hemisphere>[0]>>();
const toon = forOptions<AuraToonOptions>();
const customMaterial = forOptions<AuraCustomMaterialSpec>();
const customGeometry = forOptions<Omit<AuraCustomGeometrySpec, "kind">>();
const pbr = forOptions<NonNullable<Parameters<typeof material.pbr>[0]>>();
const metal = forOptions<NonNullable<Parameters<typeof material.metal>[0]>>();
const hover = forOptions<NonNullable<Parameters<typeof interactions.hover>[0]>>();
const pointer = forOptions<NonNullable<Parameters<typeof interactions.pointer>[0]>>();
const bloomUnsupported = unsupportedFor<NonNullable<Parameters<typeof postEffectBuilders.bloom>[0]>>();

const aMaterial = { color: "#ff0000" } as const;
const bMaterial = { color: "#00ff00" } as const;
const aTransforms = [{ position: [0, 0, 0] as const }];
const bTransforms = [{ position: [2, 1, -1] as const }];

/** Each observation has a named consumer exercised by the source tests. */
export const OPTION_COVERAGE_ROWS: OptionCoverageRow[] = [
  fog("effects.fog", "color", "#ff0000", "#00ff00", "fog.color"),
  fog("effects.fog", "density", 0.05, 0.25, "fog.density"),
  bloom("effects.bloom", "intensity", 0.2, 0.8, "bloom.intensity"),
  bloom("effects.bloom", "threshold", 0.2, 0.8, "bloom.threshold"),
  bloom("effects.bloom", "radius", 0.2, 0.8, "bloom.radius"),

  directional("lights.directional", "name", "key-a", "key-b", "light.name"),
  directional("lights.directional", "color", "#ff0000", "#00ff00", "light.color"),
  directional("lights.directional", "intensity", 1, 3, "light.intensity"),
  directional("lights.directional", "position", [1, 2, 3], [3, 2, 1], "light.position"),
  directional("lights.directional", "target", [0, 0, 0], [1, 0, 0], "light.direction"),
  directional("lights.directional", "shadow", false, true, "light.shadow"),
  studio("lights.studio", "intensity", 0.5, 1.5, "light.intensity"),
  hemisphere("lights.hemisphere", "skyColor", "#ff0000", "#00ff00", "hemisphere.skyColor"),
  hemisphere("lights.hemisphere", "groundColor", "#ff0000", "#00ff00", "hemisphere.groundColor"),
  hemisphere("lights.hemisphere", "intensity", 0.5, 1.5, "hemisphere.intensity"),

  primitive("primitives.box", "name", "box-a", "box-b", "primitive.name"),
  primitive("primitives.box", "material", aMaterial, bMaterial, "primitive.material.color"),
  primitive("primitives.capsule", "size", 1, 2, "primitive.size"),
  primitive("primitives.cylinder", "size", 1, 2, "primitive.size"),
  primitive("primitives.plane", "name", "plane-a", "plane-b", "primitive.name"),
  primitive("primitives.plane", "material", aMaterial, bMaterial, "primitive.material.color"),
  primitive("primitives.plane", "size", [1, 1, 1], [2, 1, 3], "primitive.size"),
  primitive("primitives.plane", "castShadow", false, true, "primitive.castShadow"),
  primitive("primitives.plane", "params", { widthSegments: 1 }, { widthSegments: 3 }, "primitive.segments"),
  primitive("geometry.custom", "name", "custom-a", "custom-b", "primitive.name"),
  primitive("geometry.custom", "material", aMaterial, bMaterial, "primitive.material.color"),
  instanced("instances.cone", "name", "cones-a", "cones-b", "primitive.name"),
  instanced("instances.cone", "material", aMaterial, bMaterial, "primitive.material.color"),
  instanced("instances.cone", "params", { radialSegments: 4 }, { radialSegments: 8 }, "primitive.segments"),
  instanced("instances.cone", "transforms", aTransforms, bTransforms, "instances.transforms"),
  instanced("instances.cone", "colors", ["#ff0000"], ["#00ff00"], "instances.colors"),
  instanced("instances.cylinder", "name", "cylinders-a", "cylinders-b", "primitive.name"),
  instanced("instances.cylinder", "material", aMaterial, bMaterial, "primitive.material.color"),
  instanced("instances.cylinder", "params", { radialSegments: 4 }, { radialSegments: 8 }, "primitive.segments"),
  instanced("instances.cylinder", "transforms", aTransforms, bTransforms, "instances.transforms"),
  modelInstances("instances.model", "transforms", aTransforms, bTransforms, "model.instances"),
  model("model", "material", aMaterial, bMaterial, "model.material"),

  orbit("interactions.orbit", "target", [0, 0, 0], [1, 1, 0], "orbit.target"),
  orbit("interactions.orbit", "position", [3, 2, 3], [5, 2, 3], "orbit.position"),
  orbit("interactions.orbit", "autoRotate", 0.5, 1, "orbit.autoRotate"),
  hover("interactions.hover", "target", "crate-a", "crate-b", "interaction.hoverTargets"),
  pointer("interactions.pointer", "target", "crate-a", "crate-b", "interaction.pointerTarget"),

  toon("effects.toon", "name", "toon-a", "toon-b", "toon.name"),
  toon("effects.toon", "bands", 3, 7, "toon.bands"),
  toon("effects.toon", "outline", 0.25, 0.75, "toon.outline"),
  toon("effects.toon", "size", [640, 360], [1280, 720], "toon.size"),

  customGeometry("geometry.define", "positions", [[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [2, 0, 0], [0, 1, 0]], "geometry.positions"),
  customGeometry("geometry.define", "normals", [[0, 0, 1], [0, 0, 1], [0, 0, 1]], [[0, 1, 0], [0, 1, 0], [0, 1, 0]], "geometry.normals"),
  customGeometry("geometry.define", "indices", [0, 1, 2], [0, 2, 1], "geometry.indices"),
  customGeometry("geometry.define", "bounds", { min: [0, 0, 0], max: [1, 1, 1] }, { min: [-1, -1, -1], max: [2, 2, 2] }, "geometry.bounds"),

  customMaterial("material.custom", "glsl", { fragment: "out vec4 outColor; void main(){outColor=vec4(0.25);}" }, { fragment: "out vec4 outColor; void main(){outColor=vec4(0.75);}" }, "custom.glsl"),
  customMaterial("material.custom", "wgsl", { fragment: "@fragment fn main() -> @location(0) vec4f { return vec4f(0.25); }" }, { fragment: "@fragment fn main() -> @location(0) vec4f { return vec4f(0.75); }" }, "custom.wgsl"),
  customMaterial("material.custom", "uniforms", { strength: { type: "f32", value: 0.25 } }, { strength: { type: "f32", value: 0.75 } }, "custom.uniforms"),
  customMaterial("material.custom", "defines", { TINT: 1 }, { TINT: 2 }, "custom.defines"),
  customMaterial("material.custom", "transparent", false, true, "custom.transparent"),
  customMaterial("material.custom", "depthWrite", false, true, "custom.depthWrite"),
  customMaterial("material.custom", "depthTest", false, true, "custom.depthTest"),
  customMaterial("material.custom", "side", "front", "double", "custom.side"),
  customMaterial("material.custom", "blending", "normal", "additive", "custom.blending"),
  customMaterial("material.custom", "fog", false, true, "custom.fog"),
  customMaterial("material.custom", "receiveShadow", false, true, "custom.receiveShadow"),

  pbr("material.pbr", "color", "#ff0000", "#00ff00", "pbr.color"),
  pbr("material.pbr", "metallic", 0.1, 0.9, "pbr.metallic"),
  pbr("material.pbr", "roughness", 0.2, 0.8, "pbr.roughness"),
  metal("material.metal", "color", "#ff0000", "#00ff00", "pbr.color"),
  // S5-WP19-04: render-item, post-chain and post-pass observations (tests/qr/prd15/compiler/optionProbes.test.ts).
  primitive("primitives.box", "position", [0, 0, 0], [2, 1, -1], "renderItem.modelMatrix"),
  primitive("primitives.box", "rotation", [0, 0, 0], [0, 1.2, 0], "renderItem.modelMatrix"),
  primitive("primitives.box", "scale", 1, 2, "renderItem.modelMatrix"),
  primitive("primitives.box", "pivot", [0, 0, 0], [0.5, 0, 0], "renderItem.modelMatrix"),
  primitive("primitives.box", "castShadow", false, true, "renderItem.castShadow"),
  primitive("primitives.box", "frustumCulled", true, false, "renderItem.frustumCulled"),
  primitive("primitives.box", "renderOrder", 0, 3, "renderItem.renderOrder"),
  primitive("primitives.box", "layers", 1, 2, "renderItem.layerMask"),
  primitive("primitives.box", "userData", { tag: "a" }, { tag: "b" }, "renderItem.userData"),
  primitive("primitives.box", "size", 1, 2, "renderItem.modelMatrix"),
  primitive("primitives.capsule", "position", [0, 0, 0], [2, 1, -1], "renderItem.modelMatrix"),
  primitive("primitives.capsule", "rotation", [0, 0, 0], [0, 1.2, 0], "renderItem.modelMatrix"),
  primitive("primitives.capsule", "scale", 1, 2, "renderItem.modelMatrix"),
  primitive("primitives.capsule", "pivot", [0, 0, 0], [0.5, 0, 0], "renderItem.modelMatrix"),
  primitive("primitives.capsule", "castShadow", false, true, "renderItem.castShadow"),
  primitive("primitives.capsule", "frustumCulled", true, false, "renderItem.frustumCulled"),
  primitive("primitives.capsule", "renderOrder", 0, 3, "renderItem.renderOrder"),
  primitive("primitives.capsule", "layers", 1, 2, "renderItem.layerMask"),
  primitive("primitives.capsule", "userData", { tag: "a" }, { tag: "b" }, "renderItem.userData"),
  primitive("primitives.capsule", "name", "capsule-a", "capsule-b", "renderItem.label"),
  primitive("primitives.capsule", "material", aMaterial, bMaterial, "renderItem.material.u_baseColor"),
  primitive("primitives.capsule", "params", { radialSegments: 6 }, { radialSegments: 12 }, "renderItem.geometry.bounds"),
  primitive("primitives.cylinder", "position", [0, 0, 0], [2, 1, -1], "renderItem.modelMatrix"),
  primitive("primitives.cylinder", "rotation", [0, 0, 0], [0, 1.2, 0], "renderItem.modelMatrix"),
  primitive("primitives.cylinder", "scale", 1, 2, "renderItem.modelMatrix"),
  primitive("primitives.cylinder", "pivot", [0, 0, 0], [0.5, 0, 0], "renderItem.modelMatrix"),
  primitive("primitives.cylinder", "castShadow", false, true, "renderItem.castShadow"),
  primitive("primitives.cylinder", "frustumCulled", true, false, "renderItem.frustumCulled"),
  primitive("primitives.cylinder", "renderOrder", 0, 3, "renderItem.renderOrder"),
  primitive("primitives.cylinder", "layers", 1, 2, "renderItem.layerMask"),
  primitive("primitives.cylinder", "userData", { tag: "a" }, { tag: "b" }, "renderItem.userData"),
  primitive("primitives.cylinder", "name", "cylinder-a", "cylinder-b", "renderItem.label"),
  primitive("primitives.cylinder", "material", aMaterial, bMaterial, "renderItem.material.u_baseColor"),
  primitive("primitives.cylinder", "params", { radialSegments: 6 }, { radialSegments: 12 }, "renderItem.geometry.bounds"),
  primitive("primitives.plane", "position", [0, 0, 0], [2, 1, -1], "renderItem.modelMatrix"),
  primitive("primitives.plane", "rotation", [0, 0, 0], [0, 1.2, 0], "renderItem.modelMatrix"),
  primitive("primitives.plane", "scale", 1, 2, "renderItem.modelMatrix"),
  primitive("primitives.plane", "pivot", [0, 0, 0], [0.5, 0, 0], "renderItem.modelMatrix"),
  primitive("primitives.plane", "frustumCulled", true, false, "renderItem.frustumCulled"),
  primitive("primitives.plane", "renderOrder", 0, 3, "renderItem.renderOrder"),
  primitive("primitives.plane", "layers", 1, 2, "renderItem.layerMask"),
  primitive("primitives.plane", "userData", { tag: "a" }, { tag: "b" }, "renderItem.userData"),
  primitive("geometry.custom", "position", [0, 0, 0], [2, 1, -1], "renderItem.modelMatrix"),
  primitive("geometry.custom", "rotation", [0, 0, 0], [0, 1.2, 0], "renderItem.modelMatrix"),
  primitive("geometry.custom", "scale", 1, 2, "renderItem.modelMatrix"),
  primitive("geometry.custom", "pivot", [0, 0, 0], [0.5, 0, 0], "renderItem.modelMatrix"),
  primitive("geometry.custom", "castShadow", false, true, "renderItem.castShadow"),
  primitive("geometry.custom", "frustumCulled", true, false, "renderItem.frustumCulled"),
  primitive("geometry.custom", "renderOrder", 0, 3, "renderItem.renderOrder"),
  primitive("geometry.custom", "layers", 1, 2, "renderItem.layerMask"),
  primitive("geometry.custom", "userData", { tag: "a" }, { tag: "b" }, "renderItem.userData"),
  primitive("geometry.custom", "size", 1, 2, "renderItem.modelMatrix"),
  instanced("instances.cone", "position", [0, 0, 0], [2, 1, -1], "renderItem.modelMatrix"),
  instanced("instances.cone", "rotation", [0, 0, 0], [0, 1.2, 0], "renderItem.modelMatrix"),
  instanced("instances.cone", "scale", 1, 2, "renderItem.modelMatrix"),
  instanced("instances.cone", "pivot", [0, 0, 0], [0.5, 0, 0], "renderItem.modelMatrix"),
  instanced("instances.cone", "castShadow", false, true, "renderItem.castShadow"),
  instanced("instances.cone", "frustumCulled", true, false, "renderItem.frustumCulled"),
  instanced("instances.cone", "renderOrder", 0, 3, "renderItem.renderOrder"),
  instanced("instances.cone", "layers", 1, 2, "renderItem.layerMask"),
  instanced("instances.cone", "userData", { tag: "a" }, { tag: "b" }, "renderItem.userData"),
  instanced("instances.cone", "size", 1, 2, "renderItem.instanceTransforms"),
  instanced("instances.cylinder", "position", [0, 0, 0], [2, 1, -1], "renderItem.modelMatrix"),
  instanced("instances.cylinder", "rotation", [0, 0, 0], [0, 1.2, 0], "renderItem.modelMatrix"),
  instanced("instances.cylinder", "scale", 1, 2, "renderItem.modelMatrix"),
  instanced("instances.cylinder", "pivot", [0, 0, 0], [0.5, 0, 0], "renderItem.modelMatrix"),
  instanced("instances.cylinder", "castShadow", false, true, "renderItem.castShadow"),
  instanced("instances.cylinder", "frustumCulled", true, false, "renderItem.frustumCulled"),
  instanced("instances.cylinder", "renderOrder", 0, 3, "renderItem.renderOrder"),
  instanced("instances.cylinder", "layers", 1, 2, "renderItem.layerMask"),
  instanced("instances.cylinder", "userData", { tag: "a" }, { tag: "b" }, "renderItem.userData"),
  instanced("instances.cylinder", "size", 1, 2, "renderItem.instanceTransforms"),
  instanced("instances.cylinder", "colors", ["#ff0000", "#ff0000"], ["#00ff00", "#00ff00"], "renderItem.instanceColors"),
  pbr("material.pbr", "emissive", "#ff0000", "#00ff00", "renderItem.material.u_emissiveColor"),
  pbr("material.pbr", "emissiveIntensity", 0.5, 2, "renderItem.material.u_emissiveStrength"),
  pbr("material.pbr", "opacity", 0.4, 0.8, "renderItem.material.u_baseColor"),
  pbr("material.pbr", "transmission", 0.2, 0.7, "renderItem.material.u_transmissionFactor"),
  pbr("material.pbr", "clearcoat", 0.2, 0.7, "renderItem.material.u_clearcoatFactor"),
  pbr("material.pbr", "clearcoatRoughness", 0.2, 0.7, "renderItem.material.u_clearcoatRoughnessFactor"),
  pbr("material.pbr", "thickness", 0.2, 0.7, "renderItem.material.u_volumeThicknessFactor"),
  pbr("material.pbr", "ior", 1.3, 1.8, "renderItem.material.u_ior"),
  pbr("material.pbr", "sheen", 0.2, 0.7, "renderItem.material.u_sheenColorFactor"),
  pbr("material.pbr", "sheenRoughness", 0.2, 0.7, "renderItem.material.u_sheenRoughnessFactor"),
  pbr("material.pbr", "sheenColor", "#ff0000", "#00ff00", "renderItem.material.u_sheenColorFactor"),
  pbr("material.pbr", "iridescence", 0.2, 0.7, "renderItem.material.u_iridescenceFactor"),
  pbr("material.pbr", "iridescenceIOR", 1.2, 1.8, "renderItem.material.u_iridescenceIor"),
  pbr("material.pbr", "iridescenceThicknessRange", [100, 300], [200, 500], "renderItem.material.u_iridescenceThicknessMinimum"),
  pbr("material.pbr", "iridescenceThicknessMinimum", 100, 200, "renderItem.material.u_iridescenceThicknessMinimum"),
  pbr("material.pbr", "iridescenceThicknessMaximum", 300, 500, "renderItem.material.u_iridescenceThicknessMaximum"),
  pbr("material.pbr", "anisotropy", 0.2, 0.7, "renderItem.material.u_anisotropyStrength"),
  pbr("material.pbr", "anisotropyRotation", 0.2, 1.2, "renderItem.material.u_anisotropyRotation"),
  pbr("material.pbr", "attenuationColor", "#ff0000", "#00ff00", "renderItem.material.u_volumeAttenuationColor"),
  pbr("material.pbr", "attenuationDistance", 1, 4, "renderItem.material.u_volumeAttenuationDistance"),
  pbr("material.pbr", "envMapIntensity", 0.5, 1.5, "renderItem.material.u_materialEnvironmentIntensity"),
  pbr("material.pbr", "bumpFactor", 0.5, 1.5, "renderItem.material.u_bumpFactor"),
  pbr("material.pbr", "diffuseRoughness", 0.2, 0.7, "renderItem.material.u_diffuseRoughness"),
  pbr("material.pbr", "retroreflection", 0.2, 0.7, "renderItem.material.u_retroreflection"),
  pbr("material.pbr", "metalness", 0.1, 0.9, "renderItem.material.u_metallic"),
  pbr("material.pbr", "rim", { color: "#ff0000", power: 2 }, { color: "#00ff00", power: 4 }, "renderItem.material.u_prd04RimColor"),
  pbr("material.pbr", "doubleSided", false, true, "renderItem.material.renderState.cullMode"),
  pbr("material.pbr", "fog", false, true, "renderItem.material.fog"),
  pbr("material.pbr", "bloom", 0.5, 1.5, "renderItem.bloomWeight"),
  metal("material.metal", "emissive", "#ff0000", "#00ff00", "renderItem.material.u_emissiveColor"),
  metal("material.metal", "emissiveIntensity", 0.5, 2, "renderItem.material.u_emissiveStrength"),
  metal("material.metal", "opacity", 0.4, 0.8, "renderItem.material.u_baseColor"),
  metal("material.metal", "transmission", 0.2, 0.7, "renderItem.material.u_transmissionFactor"),
  metal("material.metal", "clearcoat", 0.2, 0.7, "renderItem.material.u_clearcoatFactor"),
  metal("material.metal", "clearcoatRoughness", 0.2, 0.7, "renderItem.material.u_clearcoatRoughnessFactor"),
  metal("material.metal", "thickness", 0.2, 0.7, "renderItem.material.u_volumeThicknessFactor"),
  metal("material.metal", "ior", 1.3, 1.8, "renderItem.material.u_ior"),
  metal("material.metal", "sheen", 0.2, 0.7, "renderItem.material.u_sheenColorFactor"),
  metal("material.metal", "sheenRoughness", 0.2, 0.7, "renderItem.material.u_sheenRoughnessFactor"),
  metal("material.metal", "sheenColor", "#ff0000", "#00ff00", "renderItem.material.u_sheenColorFactor"),
  metal("material.metal", "iridescence", 0.2, 0.7, "renderItem.material.u_iridescenceFactor"),
  metal("material.metal", "iridescenceIOR", 1.2, 1.8, "renderItem.material.u_iridescenceIor"),
  metal("material.metal", "iridescenceThicknessRange", [100, 300], [200, 500], "renderItem.material.u_iridescenceThicknessMinimum"),
  metal("material.metal", "iridescenceThicknessMinimum", 100, 200, "renderItem.material.u_iridescenceThicknessMinimum"),
  metal("material.metal", "iridescenceThicknessMaximum", 300, 500, "renderItem.material.u_iridescenceThicknessMaximum"),
  metal("material.metal", "anisotropy", 0.2, 0.7, "renderItem.material.u_anisotropyStrength"),
  metal("material.metal", "anisotropyRotation", 0.2, 1.2, "renderItem.material.u_anisotropyRotation"),
  metal("material.metal", "attenuationColor", "#ff0000", "#00ff00", "renderItem.material.u_volumeAttenuationColor"),
  metal("material.metal", "attenuationDistance", 1, 4, "renderItem.material.u_volumeAttenuationDistance"),
  metal("material.metal", "envMapIntensity", 0.5, 1.5, "renderItem.material.u_materialEnvironmentIntensity"),
  metal("material.metal", "bumpFactor", 0.5, 1.5, "renderItem.material.u_bumpFactor"),
  metal("material.metal", "diffuseRoughness", 0.2, 0.7, "renderItem.material.u_diffuseRoughness"),
  metal("material.metal", "retroreflection", 0.2, 0.7, "renderItem.material.u_retroreflection"),
  metal("material.metal", "metalness", 0.1, 0.9, "renderItem.material.u_metallic"),
  metal("material.metal", "rim", { color: "#ff0000", power: 2 }, { color: "#00ff00", power: 4 }, "renderItem.material.u_prd04RimColor"),
  metal("material.metal", "doubleSided", false, true, "renderItem.material.renderState.cullMode"),
  metal("material.metal", "fog", false, true, "renderItem.material.fog"),
  metal("material.metal", "bloom", 0.5, 1.5, "renderItem.bloomWeight"),
  metal("material.metal", "metallic", 0.1, 0.9, "renderItem.material.u_metallic"),
  metal("material.metal", "roughness", 0.2, 0.8, "renderItem.material.u_roughness"),
  toon("effects.toon", "bandMix", 0.2, 0.8, "toon.uniform.u_band_mix"),
  toon("effects.toon", "edgeStart", 0.05, 0.2, "toon.uniform.u_edge"),
  toon("effects.toon", "edgeEnd", 0.3, 0.6, "toon.uniform.u_edge"),
  toon("effects.toon", "fadeDistance", 10, 40, "toon.uniform.u_fade"),
  toon("effects.toon", "ink", [0, 0, 0], [0.2, 0.1, 0], "toon.uniform.u_ink"),
  toon("effects.toon", "inkColor", "#000000", "#330000", "toon.uniform.u_ink"),
  toon("effects.toon", "inkSource", "color", "depth", "toon.fragment"),
  toon("effects.toon", "order", "before-tonemap", "after-tonemap", "toon.order"),
  bloom("effects.bloom", "knee", 0.1, 0.6, "bloom.v2.knee"),
  bloom("effects.bloom", "scatter", 0.2, 0.8, "bloom.v2.scatter"),
  bloom("effects.bloom", "clampLuminance", 4, 16, "bloom.v2.clampLuminance"),
  bloom("effects.bloom", "maxIntensity", 0.2, 0.3, "bloom.v2.clampLuminance"),

  bloomUnsupported("effects.bloom", "size", 1, 2, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"size\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "angle", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"angle\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "strength", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"strength\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "seed", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"seed\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "progress", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"progress\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "invert", false, true, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"invert\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "opacity", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"opacity\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "decay", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"decay\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "density", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"density\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "speed", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"speed\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "wind", [0, 0, 0], [1, 2, 3], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"wind\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "particleCount", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"particleCount\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "emitter", "fountain", "swirl", "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"emitter\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "height", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"height\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "exposure", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"exposure\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "contrast", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"contrast\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "saturation", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"saturation\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "shadows", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"shadows\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "highlights", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"highlights\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "lut", "a", "b", "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"lut\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "mode", "fxaa", "taa", "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"mode\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "shutter", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"shutter\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "samples", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"samples\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "tileSize", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"tileSize\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "timeScale", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"timeScale\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "falloff", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"falloff\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "multiBounce", false, true, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"multiBounce\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "focusDistance", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"focusDistance\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "fStop", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"fStop\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "focalLength", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"focalLength\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "sharpness", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"sharpness\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "width", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"width\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "focus", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"focus\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "aperture", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"aperture\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "maxBlur", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"maxBlur\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "volumetricQuality", "quality", "balanced", "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"volumetricQuality\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "lightPosition", [0.5, 0.5], [0.25, 0.75], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"lightPosition\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "heightFalloff", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"heightFalloff\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "heightReference", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"heightReference\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "emissionRate", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"emissionRate\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "gravity", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"gravity\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "groundCollision", false, true, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"groundCollision\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "lifetimeColorRamp", ["#ffffff"], ["#000000"], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"lifetimeColorRamp\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "materialMode", "spark", "smoke", "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"materialMode\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "texturedBillboard", false, true, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"texturedBillboard\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "sizeOverLife", [1, 0], [0, 1], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"sizeOverLife\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "alphaOverLife", [1, 0], [0, 1], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"alphaOverLife\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "velocityOverLife", [1, 0], [0, 1], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"velocityOverLife\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "turbulence", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"turbulence\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "noise", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"noise\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "splashes", false, true, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"splashes\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "mist", false, true, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"mist\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "spriteColumns", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"spriteColumns\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "spriteRows", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"spriteRows\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "frameRate", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"frameRate\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "from", [0, 0, 0], [1, 2, 3], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"from\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "to", [0, 0, 0], [1, 2, 3], "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"to\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "widthWorld", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"widthWorld\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "segmentCount", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"segmentCount\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "renderOrder", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"renderOrder\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "frustumCulled", false, true, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"frustumCulled\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "layers", 0.25, 0.75, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"layers\" or author it on the effect that owns it"),
  bloomUnsupported("effects.bloom", "userData", { tag: "a" }, { tag: "b" }, "post.POST_FIELD_UNSUPPORTED", "effects.bloom accepts only intensity, threshold, knee, scatter, color and clampLuminance on the v2 post chain; remove \"userData\" or author it on the effect that owns it"),

  bloomUnsupported("effects.bloom", "quality", "performance", "cinematic", "post.post-field-deprecated", "effects.bloom quality is deprecated and ignored on the v2 post chain; the bloom pass quality follows the renderer quality tier"),
  bloomUnsupported("effects.bloom", "softKnee", 0.1, 0.5, "post.post-field-deprecated", "effects.bloom softKnee is deprecated and ignored on the v2 post chain; use knee"),
  bloomUnsupported("effects.bloom", "shoulder", 0.1, 0.5, "post.post-field-deprecated", "effects.bloom shoulder is deprecated and ignored on the v2 post chain; use knee"),
  bloomUnsupported("effects.bloom", "antiBlowout", false, true, "post.post-field-deprecated", "effects.bloom antiBlowout is deprecated on the v2 post chain; set clampLuminance to cap bright pixels"),
  {
    builder: "primitives.plane", field: "params.radius",
    probeValueA: { widthSegments: 2 }, probeValueB: { radius: 2 }, ownerPrd: 19,
    disposition: "unsupported", observation: "primitive.unsupportedParams",
    reason: "plane dimensions are controlled by size; use widthSegments or heightSegments for tessellation"
  }
];

registerOptionCoverage(OPTION_COVERAGE_ROWS);
