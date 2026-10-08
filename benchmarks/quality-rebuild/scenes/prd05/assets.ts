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
  | "crate"
  | "courierSedan"
  | "roadHeroCar";

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
    "damaged-helmet.2f5f6eef.glb",
    "fixtures/asset-corpus/damaged-helmet.glb",
    "2f5f6eef263fccd51618351bc1465770577af3c15988db7ca9f184379baa7678",
    "prop-large",
    25856,
    "Khronos glTF-Sample-Assets DamagedHelmet (CC0), optimized via §6.3 prop-large"
  ),
  antiqueCamera: entry(
    "antiqueCamera",
    "antique-camera.62e492c6.glb",
    "fixtures/asset-corpus/antique-camera.glb",
    "62e492c6c768e828ab1a029e8b01cad3f9ab8f185e633aadf8ce47d0e467a1cc",
    "prop-large",
    33853,
    "Khronos glTF-Sample-Assets AntiqueCamera (CC0), optimized via §6.3 prop-large"
  ),
  soldier: entry(
    "soldier",
    "soldier.3062baba.glb",
    "fixtures/threejs-parity/assets/character/soldier.glb",
    "3062baba403281c26eb60d5db4b4c6bbe1b0eb0f79e2524f4593ce960e5df009",
    "hero-character",
    17127,
    "three.js Soldier (MIT), optimized via §6.3 hero-character"
  ),
  cesiumMan: entry(
    "cesiumMan",
    "cesium-man.f330915f.glb",
    "fixtures/three-compat/assets/corpus/cesium-man.glb",
    "f330915f714cb6c45804d458669e5dd57641826adf37a5fe22641d91bf44fd8f",
    "hero-character",
    7008,
    "Khronos CesiumMan (CC-BY 4.0), optimized via §6.3 hero-character"
  ),
  fox: entry(
    "fox",
    "Fox.c1c4514e.glb",
    "tests/assets/corpus/khronos/Fox/Fox.glb",
    "c1c4514e89156f644e080e65ac6e8af1b318675363a89fd6b8fe3db106063873",
    "hero-character",
    864,
    "Khronos glTF-Sample-Models Fox (CC-BY 4.0, PixelMannen/Łukasz), optimized via §6.3 hero-character"
  ),
  rockA: entry(
    "rockA",
    "propRockA.78a8121c.glb",
    "public/aura-assets/propRockA.52dd1f0f.glb",
    "78a8121cdbf27e67f4fd2ccf564f442f8c3e572b996c2980bf4dc4478dbca062",
    "prop-large",
    48942,
    "Aura3D propRockA catalog GLB, optimized via §6.3 prop-large"
  ),
  rockB: entry(
    "rockB",
    "propRockB.4b4d2684.glb",
    "public/aura-assets/propRockB.c94b2733.glb",
    "4b4d26845b441ed3d1f755aa55831fd9939b5e8d103784c31c5b952d936cc16c",
    "prop-large",
    16104,
    "Aura3D propRockB catalog GLB, optimized via §6.3 prop-large"
  ),
  crate: entry(
    "crate",
    "crate-1x1.f94574e5.glb",
    "packages/engine/assets/world/kits/interior/crate-1x1.glb",
    "f94574e559537f7e93aeb62776e3e6c051b984d3a11c40ca4e2990da10a3f94f",
    "prop-small",
    24,
    "Aura3D interior-kit 1x1 crate, optimized via §6.3 prop-small"
  ),
  courierSedan: {
    ...entry(
      "courierSedan",
      "courierTrafficSedan.c724602f.glb",
      "public/aura-assets/courierTrafficSedan.69f41bfa.glb",
      "c724602f2b0513ecc4a373f4a95ca58b2577c0ec3ed1639ba31a187a8204da1b",
      "hero-vehicle",
      46983,
      "Aura3D courier traffic sedan catalog GLB, optimized via §6.3 hero-vehicle (4-level MSFT_lod)"
    ),
    gltfExtensions: [...OPT_EXTS, "MSFT_lod"],
  },
  roadHeroCar: {
    ...entry(
      "roadHeroCar",
      "quaternius-sports-car.0dbac342.glb",
      "assets/library/vehicles/road/quaternius-sports-car.glb",
      "0dbac342d94afabe49a7cade4100f180cbdb63d8dcbf8875d7372ec6d659cbc7",
      "hero-vehicle",
      12160,
      "Quaternius sports car (CC0) — vehicles/road library hero car, optimized via §6.3 hero-vehicle (4-level MSFT_lod)"
    ),
    gltfExtensions: [...OPT_EXTS, "MSFT_lod"],
  }
};
