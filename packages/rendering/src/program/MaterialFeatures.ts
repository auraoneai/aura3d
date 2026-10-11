/**
 * `program/MaterialFeatures.ts` (PRD-01 §15 Phase-3) — material → C-02 record.
 *
 * `defaultProgramFeatures(material, ctx)` derives the record every allow-listed
 * material produces from its parameters, so `Material.programFeatures(ctx)`
 * has a real default instead of a per-subclass override:
 *   lighting    — `lit` for PBR-family shaderKeys, `unlit` otherwise
 *   maps        — `u_<slot>Texture` TextureBinding with a texture bound;
 *                 `u_<slot>TextureTexCoord` selects uvSet; a bound transform
 *                 sets `transform`
 *   alphaMode   — `blend`/`blendMode!=="opaque"` → "blend",
 *                 `u_alphaCutoff > 0` → "mask", else "opaque"
 *   doubleSided — `renderState.cullMode === "none"`
 *   vertexColors/instancing/skinning/morph — from `requiredAttributes`
 *   extensions  — extension factor params > 0 → `MaterialExtensionFeature`s
 *                 (lobe chunks come from `materialLobes(flags)`; an unregistered
 *                 extension records `extension-lobe-pending` at generate time)
 *
 * Allow-list: materials outside `ALLOWLIST_PROGRAM_SHADERS` keep `shaderKey`
 * (the ForwardPass flag-off path). `materialFeatureWarning` returns the
 * "nearest superset" note for an allow-listed shader with unrecognized state.
 */

import type { Material } from "../Material";
import type { MaterialExtensionFeature, ProgramFeatures, TextureSlotFeature } from "../contracts/program";
import type { MaterialFeatureContext } from "../contracts/materialLobes";
import { isTextureBinding } from "../TextureBinding";

type FeatureRecord = Omit<ProgramFeatures, "lights" | "shadows" | "environment" | "fog" | "pass" | "target" | "backgroundCoverage">;

// Lit iff the shader key names a PBR or skinned-lit program ("unlit" must not match).
const LIT_SHADER_MARKERS = /pbr|skinned-lit/i;

/** Texture parameter → maps slot. */
const MAP_PARAMS: readonly [string, keyof ProgramFeatures["maps"]][] = [
  ["u_baseColorTexture", "baseColor"],
  ["u_normalTexture", "normal"],
  ["u_metallicRoughnessTexture", "metallicRoughness"],
  ["u_occlusionTexture", "occlusion"],
  ["u_emissiveTexture", "emissive"]
];

/** Extension factor parameter → glTF extension id (C-03). */
const EXTENSION_PARAMS: readonly [string, string][] = [
  ["u_clearcoatFactor", "KHR_materials_clearcoat"],
  ["u_anisotropyStrength", "KHR_materials_anisotropy"],
  ["u_iridescenceFactor", "KHR_materials_iridescence"],
  ["u_transmissionFactor", "KHR_materials_transmission"],
  ["u_volumeThicknessFactor", "KHR_materials_volume"],
  ["u_diffuseTransmissionFactor", "KHR_materials_diffuse_transmission"],
  ["u_dispersion", "KHR_materials_dispersion"]
];

const SPECIAL_EXTENSIONS = ["KHR_materials_sheen", "KHR_materials_ior", "KHR_materials_specular", "KHR_materials_emissive_strength"] as const;

/** Extensions whose presence test is not a plain `param > 0`. */
function specialExtensionPresent(material: Material, glTF: string): boolean {
  const num = (n: string) => (typeof material.getParameter(n) === "number" ? (material.getParameter(n) as number) : undefined);
  switch (glTF) {
    case "KHR_materials_sheen": {
      const color = material.getParameter("u_sheenColorFactor");
      const anyColor = (Array.isArray(color) || color instanceof Float32Array) && [...color].some((c) => c > 0);
      return anyColor === true || (num("u_sheenRoughnessFactor") ?? 0) > 0;
    }
    case "KHR_materials_ior":
      return (num("u_ior") ?? 1.5) !== 1.5;
    case "KHR_materials_specular":
      return (num("u_specularFactor") ?? 1) < 1;
    case "KHR_materials_emissive_strength":
      return (num("u_emissiveStrength") ?? 1) > 1;
    default:
      return false;
  }
}

/** Shader keys the generated-program path covers (the §15 allow-list). */
export const ALLOWLIST_PROGRAM_SHADERS: ReadonlySet<string> = new Set([
  "aura3d/pbr-direct",
  "aura3d/instanced-pbr",
  "aura3d/pbr-textured",
  "aura3d/pbr-normal-map",
  "aura3d/skinned-lit",
  "aura3d/skinned-lit-8",
  "aura3d/unlit",
  "aura3d/textured-unlit",
  "aura3d/instanced-unlit"
]);

function paramNumber(material: Material, name: string): number | undefined {
  const v = material.getParameter(name);
  return typeof v === "number" ? v : undefined;
}

function mapSlot(material: Material, param: string): TextureSlotFeature | undefined {
  const binding = material.getParameter(param);
  if (!isTextureBinding(binding) || binding.texture === undefined) return undefined;
  const texCoord = paramNumber(material, `${param}TexCoord`);
  const transform = material.getParameter(`${param}Transform`);
  const hasTransform =
    transform !== undefined &&
    !(Array.isArray(transform) && transform.length >= 8 && transform.every((v, i) => v === (i % 4 === 0 || i === 4 ? 1 : 0)));
  return { uvSet: texCoord === 1 ? 1 : 0, transform: hasTransform };
}

export function defaultProgramFeatures(material: Material, ctx: MaterialFeatureContext): FeatureRecord {
  const maps = {} as { -readonly [K in keyof ProgramFeatures["maps"]]: ProgramFeatures["maps"][K] };
  for (const [param, slot] of MAP_PARAMS) {
    const feature = mapSlot(material, param);
    if (feature) maps[slot] = feature;
  }

  const extensions: MaterialExtensionFeature[] = [];
  const push = (glTF: string) => {
    if (!extensions.some((e) => e.lobe === glTF)) extensions.push({ lobe: glTF, maps: [], bits: {} });
  };
  for (const [param, glTF] of EXTENSION_PARAMS) {
    const value = paramNumber(material, param);
    if (value !== undefined && value > 0) push(glTF);
  }
  for (const glTF of SPECIAL_EXTENSIONS) {
    if (specialExtensionPresent(material, glTF)) push(glTF);
  }

  const attrs = new Set(material.requiredAttributes);
  const skinned = attrs.has("a_joints");
  const instanced = attrs.has("a_instanceMatrix0") || attrs.has("a_instanceMatrix") || /instanced/i.test(material.shaderKey);
  const alphaCutoff = paramNumber(material, "u_alphaCutoff") ?? 0;
  const transparent = material.renderState.blend === true || (material.renderState.blendMode !== undefined && material.renderState.blendMode !== "opaque");

  const features: Record<string, string | number | boolean> = {};
  if (skinned) features["prd06.deform"] = true;

  void ctx;
  return {
    lighting: LIT_SHADER_MARKERS.test(material.shaderKey) ? "lit" : "unlit",
    maps,
    extensions,
    alphaMode: transparent ? "blend" : alphaCutoff > 0 ? "mask" : "opaque",
    doubleSided: material.renderState.cullMode === "none",
    vertexColors: attrs.has("a_color"),
    flatShading: paramNumber(material, "u_flatShading") === 1,
    // PRD-01 §8.3: Lambert by default (glTF / three.js); Burley is opt-in
    // (`u_diffuseModel = 1` → DIFFUSE_BURLEY). 01-GENTEST / C-02 + C-03.
    diffuseModel: paramNumber(material, "u_diffuseModel") === 1 ? "burley" : "lambert",
    specularAntialiasing: paramNumber(material, "u_specularAntialiasing") !== 0,
    skinning: skinned ? { influences: attrs.has("a_joints1") ? 8 : 4, palette: "uniform" } : undefined,
    morph: attrs.has("a_morphTarget") ? { targetBucket: 4, normals: attrs.has("a_morphNormal"), tangents: attrs.has("a_morphTangent") } : undefined,
    instancing: instanced ? { color: attrs.has("a_instanceColor") } : undefined,
    features
  };
}

/** Geometry attribute presence test, by shader name (`a_uv`, `a_joints`, …). */
export type GeometryAttributeTest = (shaderName: string) => boolean;

/** True when the geometry carries a full skin (joints + weights). */
export function geometryHasSkin(has: GeometryAttributeTest): boolean {
  return has("a_joints") && has("a_weights");
}

/**
 * #867 (games): the program's feature set follows the geometry, as in
 * three.js. A primitive or procedural mesh with no `a_uv` cannot sample
 * uv-set-0 maps (they and the extension lobe maps are dropped); no `a_uv1`
 * drops uv-set-1 maps; no `a_color` drops vertex colors; no joints/weights
 * drops skinning segments from `prd06.deform` (morph is texture-driven and
 * untouched). Normal maps need only uv: the generated program never reads `a_tangent`
 * (derivative TBN when the geometry has none). Returns `record` itself when
 * nothing is dropped, so program keys stay stable for complete geometry.
 */
export function featuresForGeometry<T extends FeatureRecord>(record: T, has: GeometryAttributeTest): T {
  const uv0 = has("a_uv");
  const uv1 = has("a_uv1");
  const skin = geometryHasSkin(has);
  let changed = false;
  const maps = {} as { -readonly [K in keyof ProgramFeatures["maps"]]: ProgramFeatures["maps"][K] };
  for (const [slot, feature] of Object.entries(record.maps) as [keyof ProgramFeatures["maps"], TextureSlotFeature | undefined][]) {
    if (!feature) continue;
    if ((feature.uvSet === 1 ? uv1 : uv0)) maps[slot] = feature;
    else changed = true;
  }
  const extensions = uv0
    ? record.extensions
    : record.extensions.map((ext) => {
        if (ext.maps.length === 0) return ext;
        changed = true;
        return { ...ext, maps: [] };
      });
  const vertexColors = record.vertexColors && has("a_color");
  if (vertexColors !== record.vertexColors) changed = true;
  const extraSkin = skin && has("a_joints1") && has("a_weights1");
  const skinning = skin
    ? record.skinning?.influences === 8 && !extraSkin
      ? { ...record.skinning, influences: 4 as const }
      : record.skinning
    : undefined;
  if (skinning !== record.skinning) changed = true;
  let features = record.features;
  const deform = features["prd06.deform"];
  if (deform !== undefined) {
    // Selection may combine skinning and texture-driven morphs. Dropping the
    // whole feature for a geometry without joint attributes freezes morphs.
    const masked = typeof deform === "string"
      ? deform.split("|").flatMap((part) => {
          if (part === "skin4" || part === "skin8") return skin ? [part === "skin8" && !extraSkin ? "skin4" : part] : [];
          return [part];
        }).join("|") || undefined
      : skin ? deform : undefined;
    if (masked !== deform) {
      features = { ...features };
      if (masked === undefined) delete (features as Record<string, string | number | boolean>)["prd06.deform"];
      else features = { ...features, "prd06.deform": masked };
      changed = true;
    }
  }
  if (!changed) return record;
  return { ...record, maps, extensions, vertexColors, skinning, features };
}

/** Allow-listed shader → covered by the generated path. */
export function materialUsesGeneratedProgram(material: Material): boolean {
  return ALLOWLIST_PROGRAM_SHADERS.has(material.shaderKey);
}

/**
 * §15: "nearest superset" warning when an allow-listed material carries state
 * the feature derivation cannot see. A `shaderVariant` override is the one
 * such state today (variants are legacy-library axes the generator does not
 * model) — the feature record describes the base shader, which is a superset
 * of nothing; warn so the silent-widening rule is observable.
 */
export function materialFeatureWarning(material: Material): string | null {
  if (!materialUsesGeneratedProgram(material)) return null;
  if (material.shaderVariant !== undefined) {
    return `material "${material.name}" (${material.shaderKey}) sets shaderVariant "${material.shaderVariant}" — the generated-program path does not model variants; the base feature record (a strict superset's complement) is used`;
  }
  return null;
}
