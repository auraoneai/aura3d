/**
 * PRD-05 lane asset table — §6.3 pipeline outputs.
 *
 * Every entry is a GLB derived by `tools/asset-optimize` (weld → dedup/prune →
 * resize → MikkTSpace tangents → quantize → meshopt → KTX2/UASTC+ETC1S) and
 * committed under `derived/` so benchmark runs load the same bytes the
 * admission gates measured. `sha256` is the full output digest (the filename
 * carries its first 8 chars); regenerate with:
 *
 *   tsx tools/asset-optimize/index.ts --allow-local-small \
 *     --out-dir benchmarks/quality-rebuild/scenes/prd05/derived \
 *     --files '<path>:<profile>,...'
 *
 * All derived files declare extensionsUsed/Required
 * [EXT_meshopt_compression, KHR_mesh_quantization, KHR_texture_basisu]; Aura
 * loads them through the C-16 decoder registry, three through
 * GLTFLoader+MeshoptDecoder+KTX2Loader.
 */

export type Prd05AssetId =
  | "damagedHelmet"
  | "antiqueCamera"
  | "soldier"
  | "cesiumMan"
  | "fox"
  | "rockA"
  | "rockB"
  | "crate";

export interface Prd05AssetEntry {
  readonly id: Prd05AssetId;
  /** GLB the optimizer consumed. */
  readonly source: string;
  /** Derived file under this directory (fetchable from the repo root). */
  readonly repoPath: string;
  readonly url: string;
  readonly sha256: string;
  readonly profile: string;
  readonly triangles: number;
  readonly lfs: boolean;
  readonly gltfExtensions: readonly string[];
  readonly provenance: string;
}

const OPT_EXTS = ["EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_basisu"] as const;
const dir = "benchmarks/quality-rebuild/scenes/prd05/derived";

const entry = (
  id: Prd05AssetId,
  file: string,
  source: string,
  sha256: string,
  profile: string,
  triangles: number,
  provenance: string
): Prd05AssetEntry => ({
  id,
  source,
  repoPath: `${dir}/${file}`,
  url: `/${dir}/${file}`,
  sha256: `sha256-${sha256}`,
  profile,
  triangles,
  lfs: false,
  gltfExtensions: OPT_EXTS,
  provenance
});

export const prd05Assets: Readonly<Record<Prd05AssetId, Prd05AssetEntry>> = {
  damagedHelmet: entry(
    "damagedHelmet",
    "damaged-helmet.e562904d.glb",
    "fixtures/asset-corpus/damaged-helmet.glb",
    "e562904d62803ec6a7a1c00beaa24e172e21bec5f287d426c8efb8a3397e8667",
    "prop-large",
    15452,
    "Khronos glTF-Sample-Assets DamagedHelmet (CC0), optimized via §6.3 prop-large"
  ),
  antiqueCamera: entry(
    "antiqueCamera",
    "antique-camera.47ad03e6.glb",
    "fixtures/asset-corpus/antique-camera.glb",
    "47ad03e689df8436fe0acead471827e4e946fe502bd2555fdd338d7736120615",
    "prop-large",
    20066,
    "Khronos glTF-Sample-Assets AntiqueCamera (CC0), optimized via §6.3 prop-large"
  ),
  soldier: entry(
    "soldier",
    "soldier.4d0d1424.glb",
    "fixtures/threejs-parity/assets/character/soldier.glb",
    "4d0d14246e327365e293fdd5d7fd04145e14d88d2bfb05e224142b1dab5c69dd",
    "hero-character",
    11376,
    "three.js Soldier (MIT), optimized via §6.3 hero-character"
  ),
  cesiumMan: entry(
    "cesiumMan",
    "cesium-man.10a1f637.glb",
    "fixtures/three-compat/assets/corpus/cesium-man.glb",
    "10a1f6370adf634faf3b74b6874eabad1c36da879b45472deed974a6bef7116d",
    "hero-character",
    4672,
    "Khronos CesiumMan (CC-BY 4.0), optimized via §6.3 hero-character"
  ),
  fox: entry(
    "fox",
    "Fox.dfb28f27.glb",
    "tests/assets/corpus/khronos/Fox/Fox.glb",
    "dfb28f27e21cf19861d4fdbbf0fdcf6bd18e37176df6078f881821b66a278aee",
    "hero-character",
    576,
    "Khronos glTF-Sample-Models Fox (CC-BY 4.0, PixelMannen/Łukasz), optimized via §6.3 hero-character"
  ),
  rockA: entry(
    "rockA",
    "propRockA.fbecd1bb.glb",
    "public/aura-assets/propRockA.52dd1f0f.glb",
    "fbecd1bbd637f2ff539154da2c18d695fecc30e2f3dff77d5f033cfdb9d72a76",
    "prop-large",
    30006,
    "Aura3D propRockA catalog GLB, optimized via §6.3 prop-large"
  ),
  rockB: entry(
    "rockB",
    "propRockB.3f980139.glb",
    "public/aura-assets/propRockB.c94b2733.glb",
    "3f98013939a00c72afceb17d2de75e0eda967a9cf653e945960571da5f9f43e9",
    "prop-large",
    10596,
    "Aura3D propRockB catalog GLB, optimized via §6.3 prop-large"
  ),
  crate: entry(
    "crate",
    "crate-1x1.900c373b.glb",
    "packages/engine/assets/world/kits/interior/crate-1x1.glb",
    "900c373bcd0ed0678d0e788f4891bb3bb6c30f1289a47ef5bda4922b370ddc94",
    "prop-small",
    12,
    "Aura3D interior-kit 1x1 crate, optimized via §6.3 prop-small"
  )
};
