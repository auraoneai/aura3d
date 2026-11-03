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
  {
    builder: "interactions.pointer", field: "target",
    probeValueA: "crate-a", probeValueB: "crate-b", ownerPrd: 19,
    disposition: "unsupported", observation: "interaction.pointerTarget",
    reason: "interactions.pointer records its target declaratively but no runtime consumer picks per target; use interactions.hover({ target }) for per-node picking evidence or handle canvas pointer events in the app"
  },

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
  {
    builder: "primitives.plane", field: "params.radius",
    probeValueA: { widthSegments: 2 }, probeValueB: { radius: 2 }, ownerPrd: 19,
    disposition: "unsupported", observation: "primitive.unsupportedParams",
    reason: "plane dimensions are controlled by size; use widthSegments or heightSegments for tessellation"
  }
];

registerOptionCoverage(OPTION_COVERAGE_ROWS);
