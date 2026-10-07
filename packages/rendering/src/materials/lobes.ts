/**
 * materials/lobes.ts — C-03 `registerMaterialLobe` calls for the eleven PRD-04
 * lobes (P3-2). Registration is registry state only (owner "prd04", flag
 * `A3D_QR_MATERIALS`); lobes take render effect once the C-02 generator is
 * real. `bind()` writes the same `u_*` uniform names the production runtime
 * already uses (`GLTFRenderResources`), so the overrides/inspect seam reads
 * generated-path values identically.
 *
 * `MaterialLobeInput.parameters` keys are glTF factor names
 * (`clearcoatFactor`, `iridescenceIor`, …) as produced by
 * `physicalMaterialLobeInput()`; `textures` keys are `PhysicalMapSlot` names.
 */
import {
  registerMaterialLobe,
  type MaterialLobe,
  type MaterialLobeInput
} from "../contracts/materialLobes";
import type { Texture } from "../Texture";

const FLAG = "A3D_QR_MATERIALS";
const OWNER = "prd04";
const PARS = "a3d_prd04_bsdf_lobes_common";

type Params = MaterialLobeInput["parameters"];
type Textures = MaterialLobeInput["textures"];

const num = (p: Params, key: string, fallback = 0): number =>
  typeof p[key] === "number" ? (p[key] as number) : fallback;

const vec3 = (p: Params, key: string, fallback: readonly number[]): readonly number[] =>
  Array.isArray(p[key]) ? (p[key] as readonly number[]) : fallback;

const tex = (t: Textures, slot: string): Texture | undefined => t[slot];

/** Slots actually bound, intersected with the lobe's sampler slots. */
const boundSlots = (t: Textures, slots: readonly string[]): readonly string[] =>
  slots.filter((slot) => t[slot] !== undefined);

function lobe(entry: {
  readonly id: MaterialLobe["id"];
  readonly glTFExtension: string;
  readonly chunk: string;
  readonly samplerSlots: readonly string[];
  readonly active: (p: Params, t: Textures) => boolean;
  readonly bits?: (p: Params, t: Textures) => Record<string, string | number | boolean>;
  readonly bind: (p: Params, set: (u: string, v: number | readonly number[]) => void) => void;
}): MaterialLobe {
  return {
    id: entry.id,
    owner: OWNER,
    flag: FLAG,
    glTFExtension: entry.glTFExtension,
    chunks: { pars: PARS, fragment: entry.chunk },
    samplerSlots: entry.samplerSlots,
    feature(material) {
      return entry.active(material.parameters, material.textures)
        ? {
            lobe: entry.id,
            maps: boundSlots(material.textures, entry.samplerSlots),
            bits: entry.bits?.(material.parameters, material.textures) ?? {}
          }
        : undefined;
    },
    bind(material, set) {
      entry.bind(material.parameters, (u, v) => set(u, v as never));
    }
  };
}

const LOBES: readonly MaterialLobe[] = [
  lobe({
    id: "ior",
    glTFExtension: "KHR_materials_ior",
    chunk: "a3d_prd04_specular_ior",
    samplerSlots: [],
    active: (p) =>
      num(p, "ior", 1.5) !== 1.5 ||
      num(p, "specularFactor") > 0 ||
      num(p, "transmissionFactor") > 0 ||
      num(p, "clearcoatFactor") > 0,
    bits: (p) => ({ ior: num(p, "ior", 1.5) }),
    bind: (p, set) => set("u_ior", num(p, "ior", 1.5))
  }),
  lobe({
    id: "specular",
    glTFExtension: "KHR_materials_specular",
    chunk: "a3d_prd04_specular_ior",
    samplerSlots: ["specular", "specularColor"],
    active: (p, t) =>
      p.specularFactor !== undefined ||
      tex(t, "specular") !== undefined ||
      tex(t, "specularColor") !== undefined,
    bits: (p, t) => ({
      specularMap: tex(t, "specular") !== undefined,
      specularColorMap: tex(t, "specularColor") !== undefined
    }),
    bind: (p, set) => {
      set("u_specularFactor", num(p, "specularFactor", 1));
      set("u_specularColorFactor", vec3(p, "specularColorFactor", [1, 1, 1]));
    }
  }),
  lobe({
    id: "clearcoat",
    glTFExtension: "KHR_materials_clearcoat",
    chunk: "a3d_prd04_clearcoat",
    samplerSlots: ["clearcoat", "clearcoatRoughness", "clearcoatNormal"],
    active: (p, t) =>
      num(p, "clearcoatFactor") > 0 ||
      tex(t, "clearcoat") !== undefined ||
      tex(t, "clearcoatRoughness") !== undefined ||
      tex(t, "clearcoatNormal") !== undefined,
    bits: (p, t) => ({
      map: tex(t, "clearcoat") !== undefined,
      roughnessMap: tex(t, "clearcoatRoughness") !== undefined,
      normalMap: tex(t, "clearcoatNormal") !== undefined
    }),
    bind: (p, set) => {
      set("u_clearcoatFactor", num(p, "clearcoatFactor"));
      set("u_clearcoatRoughnessFactor", num(p, "clearcoatRoughnessFactor"));
      set("u_clearcoatNormalScale", num(p, "clearcoatNormalScale", 1));
    }
  }),
  lobe({
    id: "sheen",
    glTFExtension: "KHR_materials_sheen",
    chunk: "a3d_prd04_sheen",
    samplerSlots: ["sheenColor", "sheenRoughness"],
    active: (p, t) =>
      p.sheenColorFactor !== undefined ||
      tex(t, "sheenColor") !== undefined ||
      tex(t, "sheenRoughness") !== undefined,
    bits: (p, t) => ({
      colorMap: tex(t, "sheenColor") !== undefined,
      roughnessMap: tex(t, "sheenRoughness") !== undefined
    }),
    bind: (p, set) => {
      set("u_sheenColorFactor", vec3(p, "sheenColorFactor", [0, 0, 0]));
      set("u_sheenRoughnessFactor", num(p, "sheenRoughnessFactor"));
    }
  }),
  lobe({
    id: "iridescence",
    glTFExtension: "KHR_materials_iridescence",
    chunk: "a3d_prd04_iridescence",
    samplerSlots: ["iridescence", "iridescenceThickness"],
    active: (p, t) =>
      num(p, "iridescenceFactor") > 0 ||
      tex(t, "iridescence") !== undefined,
    bits: (p, t) => ({
      map: tex(t, "iridescence") !== undefined,
      thicknessMap: tex(t, "iridescenceThickness") !== undefined
      // `film` is seeded by physicalFeatureSet from ctx.tier (Low → Schlick).
    }),
    bind: (p, set) => {
      set("u_iridescenceFactor", num(p, "iridescenceFactor"));
      set("u_iridescenceIor", num(p, "iridescenceIor", 1.3));
      set("u_iridescenceThicknessMinimum", num(p, "iridescenceThicknessMinimum", 100));
      set("u_iridescenceThicknessMaximum", num(p, "iridescenceThicknessMaximum", 400));
    }
  }),
  lobe({
    id: "anisotropy",
    glTFExtension: "KHR_materials_anisotropy",
    chunk: "a3d_prd04_anisotropy",
    samplerSlots: ["anisotropy"],
    active: (p, t) => num(p, "anisotropyStrength") > 0 || tex(t, "anisotropy") !== undefined,
    bits: (p, t) => ({ map: tex(t, "anisotropy") !== undefined }),
    bind: (p, set) => {
      set("u_anisotropyStrength", num(p, "anisotropyStrength"));
      set("u_anisotropyRotation", num(p, "anisotropyRotation"));
    }
  }),
  lobe({
    id: "transmission",
    glTFExtension: "KHR_materials_transmission",
    chunk: "a3d_prd04_transmission",
    samplerSlots: ["transmission"],
    active: (p, t) => num(p, "transmissionFactor") > 0 || tex(t, "transmission") !== undefined,
    bits: (p, t) => ({ map: tex(t, "transmission") !== undefined }),
    bind: (p, set) => set("u_transmissionFactor", num(p, "transmissionFactor"))
  }),
  lobe({
    id: "volume",
    glTFExtension: "KHR_materials_volume",
    chunk: "a3d_prd04_volume",
    samplerSlots: ["volumeThickness"],
    active: (p, t) =>
      p.volumeThicknessFactor !== undefined || tex(t, "volumeThickness") !== undefined,
    bits: (p, t) => ({ thicknessMap: tex(t, "volumeThickness") !== undefined }),
    bind: (p, set) => {
      set("u_volumeThicknessFactor", num(p, "volumeThicknessFactor"));
      set("u_volumeAttenuationDistance", num(p, "volumeAttenuationDistance", Number.POSITIVE_INFINITY));
      set("u_volumeAttenuationColor", vec3(p, "volumeAttenuationColor", [1, 1, 1]));
    }
  }),
  lobe({
    id: "dispersion",
    glTFExtension: "KHR_materials_dispersion",
    chunk: "a3d_prd04_dispersion",
    samplerSlots: [],
    active: (p) => num(p, "dispersion") > 0,
    bind: (p, set) => set("u_dispersion", num(p, "dispersion"))
  }),
  lobe({
    id: "emissive-strength",
    glTFExtension: "KHR_materials_emissive_strength",
    chunk: "a3d_prd04_emissive_strength",
    samplerSlots: ["emissive"],
    active: (p) =>
      num(p, "emissiveStrength", 1) !== 1 ||
      vec3(p, "emissiveFactor", [0, 0, 0]).some((v) => v !== 0),
    bits: (p, t) => ({ map: tex(t, "emissive") !== undefined }),
    bind: (p, set) => set("u_emissiveStrength", num(p, "emissiveStrength", 1))
  }),
  lobe({
    id: "unlit",
    glTFExtension: "KHR_materials_unlit",
    chunk: "a3d_prd04_unlit",
    samplerSlots: ["baseColor", "emissive"],
    active: (p) => p.unlit === true,
    bind: () => {}
  })
];

let registered = false;

/** Registers all PRD-04 lobes; idempotent (lane barrel + tests may both call). */
export function registerPrd04MaterialLobes(): void {
  if (registered) return;
  for (const entry of LOBES) registerMaterialLobe(entry);
  registered = true;
}
