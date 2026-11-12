// Thermal Drift's own asset manifest: zero GLB models (100% @aura3d/engine procedural multi-material meshes).
// Retains only the three CC0 1k circuit HDRIs, CC0 ambientCG Asphalt033 PBR maps, and authored Foundry display LUT.
import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetRef } from "@aura3d/engine";

const definitions = {} satisfies Record<string, AuraAssetDefinition>;

export const assets = defineAuraAssets(definitions);
export const HEATSINK_ASSET_KEYS = Object.keys(definitions) as readonly (keyof typeof definitions)[];

// GU47 WP-13 HS-03: the three circuit skies, from the E-A HDRI catalogue (1k copies served at /hdri/<id>_1k.hdr;
// licences in public/hdri/ATTRIBUTION.md; sha256 of the committed files).
const hdriDefinitions = {
  heatsinkHdriKloppenheim02: { type: "texture", format: "hdr", url: "/hdri/kloppenheim_02_1k.hdr", hash: "sha256-c122eb29c259d8c2ef0093c20130faa67ea216f5a1407c409ee4fc97cd5ba002", sizeBytes: 1744238 },
  heatsinkHdriIndustrialSunset: { type: "texture", format: "hdr", url: "/hdri/industrial_sunset_puresky_1k.hdr", hash: "sha256-988320101df317784b2a869b40b0e23519726bf8827def4ed8eef806df2601cd", sizeBytes: 1180675 },
  heatsinkHdriSpruitSunrise: { type: "texture", format: "hdr", url: "/hdri/spruit_sunrise_1k.hdr", hash: "sha256-3ac30651cde16d2a80521273ec917ba3feca172ea4b842335431201879f39593", sizeBytes: 1527279 }
} satisfies Record<string, AuraAssetDefinition>;

export const hdris = defineAuraAssets(hdriDefinitions);

// GU47 WP-13 HS-07: worn asphalt, ambientCG Asphalt033 (CC0) from the repo library, downsized to 512 px into this app
// (WebP, textures/asphalt033/provenance.json; 157 KB of the 1.5 MB set budget).
const textureDefinitions = {
  heatsinkAsphaltColor: { type: "texture", format: "webp", url: new URL("../textures/asphalt033/color-512.webp", import.meta.url).href, hash: "sha256-330c78ff0be2672746d6bd818ecff520424aa1b62f7d734d2251a00a2e3f3b53", sizeBytes: 11724 },
  heatsinkAsphaltNormal: { type: "texture", format: "webp", url: new URL("../textures/asphalt033/normal-gl-512.webp", import.meta.url).href, hash: "sha256-3f8bf69f92abb855dab0b862e261ffc362b4f4a1af456eeefde422158b272d0e", sizeBytes: 114358 },
  heatsinkAsphaltRoughness: { type: "texture", format: "webp", url: new URL("../textures/asphalt033/roughness-512.webp", import.meta.url).href, hash: "sha256-b19fc248b500b1d185b21b1a9bb2e76ce6a6e8a313976ebbf33a7051225526e1", sizeBytes: 31220 }
} satisfies Record<string, AuraAssetDefinition>;

export const textures = defineAuraAssets(textureDefinitions);

// GU47 WP-13 HS-12: the authored display LUT (src/lut.ts generates it; 132 KB of text, gzip about 40 KB).
const lutDefinitions = {
  heatsinkFoundryLut: { type: "lut", format: "cube", url: new URL("../textures/luts/td-foundry.cube", import.meta.url).href, hash: "sha256-8f423f10cd68cf396f5c54dc791a314d4d5cae3f570d71efead9d0faf8e094ee", sizeBytes: 132859 }
} satisfies Record<string, AuraAssetDefinition>;

export const luts = defineAuraAssets(lutDefinitions);
/** Mean of the asphalt roughness map (provenance.json): a material roughness factor of `target / mean` lands on `target`. */
export const ASPHALT_ROUGHNESS_MEAN = 0.745;
/** Circuit sky texture by catalogue id (src/look.ts `CircuitLook.hdri`). */
export const HDRI_BY_ID: Readonly<Record<"kloppenheim_02" | "industrial_sunset_puresky" | "spruit_sunrise", AuraAssetRef<"texture">>> = {
  kloppenheim_02: hdris.heatsinkHdriKloppenheim02,
  industrial_sunset_puresky: hdris.heatsinkHdriIndustrialSunset,
  spruit_sunrise: hdris.heatsinkHdriSpruitSunrise
};
