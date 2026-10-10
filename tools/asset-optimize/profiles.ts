/**
 * PRD-05 §6.2 — optimize profiles.
 *
 * Replaces the descriptive `AssetImportPreflight` settings (E4): these are the
 * numbers the optimizer enforces and G1 reads back. Triangle numbers are LOD0
 * target/ceilings; floors are admission minima. Normal maps always UASTC —
 * ETC1S block artefacts are visible in normals.
 */

import type { AssetOptimizeProfile, ColliderKind, Ktx2Codec } from "./types.js";

export type AssetOptimizeProfileId =
  | "hero-character" | "npc-character" | "hero-vehicle" | "traffic-vehicle"
  | "product" | "weapon" | "prop-large" | "prop-small"
  | "world-chunk" | "track" | "backdrop" | "hdri" | "proxy";

function profile(
  id: AssetOptimizeProfileId,
  roles: readonly string[],
  triangles: [number, number, number],
  lodRatios: readonly number[],
  screenCoverage: readonly number[],
  baseColor: Ktx2Codec,
  orm: Ktx2Codec,
  maxSize: number,
  geometry: { readonly quantize: boolean; readonly draco?: boolean },
  collider: ColliderKind,
  opts: { readonly palette?: boolean; readonly ultraMaxSize?: number; readonly join?: boolean } = {}
): AssetOptimizeProfile {
  return {
    id,
    roles,
    triangles: { floor: triangles[0], target: triangles[1], ceiling: triangles[2] },
    lodRatios,
    lodTargetErrors: [0.01, 0.02, 0.05].slice(0, Math.max(0, lodRatios.length - 1)),
    screenCoverage,
    textures: { baseColor, normal: baseColor === "none" ? "none" : "uastc", orm: orm === "none" ? "none" : orm, maxSize, ultraMaxSize: opts.ultraMaxSize },
    geometry: { meshopt: true, quantize: geometry.quantize, draco: geometry.draco ?? false },
    collider,
    paletteAllowed: opts.palette ?? false,
    joinAllowed: opts.join ?? true
  };
}

export const ASSET_OPTIMIZE_PROFILES: Record<AssetOptimizeProfileId, AssetOptimizeProfile> = {
  "hero-character": profile("hero-character", ["hero", "character"], [5000, 25000, 60000], [1, 0.5, 0.25], [0.25, 0.08, 0.02], "uastc", "uastc", 2048, { quantize: false }, "capsule"),
  "npc-character": profile("npc-character", ["character", "enemy"], [2000, 10000, 25000], [1, 0.5, 0.2], [0.25, 0.08, 0.02], "etc1s", "etc1s", 1024, { quantize: false }, "capsule"),
  "hero-vehicle": profile("hero-vehicle", ["vehicle"], [8000, 40000, 80000], [1, 0.5, 0.2, 0.08], [0.25, 0.08, 0.02, 0.005], "uastc", "uastc", 2048, { quantize: true }, "convex"),
  "traffic-vehicle": profile("traffic-vehicle", ["vehicle"], [3000, 12000, 25000], [1, 0.4, 0.12], [0.25, 0.08, 0.02], "etc1s", "etc1s", 1024, { quantize: true }, "convex"),
  product: profile("product", ["prop"], [10000, 60000, 150000], [1, 0.5], [0.25, 0.08], "uastc", "uastc", 2048, { quantize: true }, "none", { ultraMaxSize: 4096 }),
  weapon: profile("weapon", ["prop"], [1500, 6000, 15000], [1, 0.4], [0.25, 0.08], "etc1s", "etc1s", 1024, { quantize: true }, "box"),
  "prop-large": profile("prop-large", ["prop"], [500, 4000, 15000], [1, 0.4, 0.12], [0.25, 0.08, 0.02], "etc1s", "etc1s", 1024, { quantize: true }, "convex"),
  "prop-small": profile("prop-small", ["prop", "set-dressing"], [100, 1000, 5000], [1, 0.35], [0.25, 0.08], "etc1s", "etc1s", 512, { quantize: true }, "box", { palette: true }),
  "world-chunk": profile("world-chunk", ["world"], [0, 120000, 250000], [1, 0.4, 0.12], [0.25, 0.08, 0.02], "etc1s", "etc1s", 2048, { quantize: true, draco: true }, "trimesh", { palette: true }),
  track: profile("track", ["world"], [0, 60000, 150000], [1, 0.4], [0.25, 0.08], "etc1s", "etc1s", 1024, { quantize: true, draco: true }, "trimesh"),
  proxy: profile("proxy", ["proxy"], [0, 4000, 15000], [1, 0.4], [0.25, 0.08], "etc1s", "etc1s", 1024, { quantize: true }, "box", { palette: true }),
  backdrop: profile("backdrop", ["backdrop", "set-dressing"], [4, 1000, 2000], [1], [0.02], "etc1s", "none", 2048, { quantize: true }, "none"),
  hdri: profile("hdri", ["hdri"], [0, 0, 0], [1], [1], "none", "none", 2048, { quantize: false }, "none", { join: false })
};

/**
 * Role → profile fallback. `assets optimize --profile` overrides; this only
 * fires when the caller does not name one. Character/vehicle default to the
 * hero profiles (the visual-quality showcase path); bounds pick prop-large vs
 * prop-small at the 1 m split from §6.2.
 */
export function profileForRole(role: string | undefined, bounds?: readonly [number, number, number]): AssetOptimizeProfile {
  const maxDim = bounds ? Math.max(...bounds.map(Math.abs)) : 0;
  switch (role) {
    case "hero":
    case "character":
      return ASSET_OPTIMIZE_PROFILES["hero-character"];
    case "enemy":
      return ASSET_OPTIMIZE_PROFILES["npc-character"];
    case "vehicle":
      return ASSET_OPTIMIZE_PROFILES["hero-vehicle"];
    case "world":
      return ASSET_OPTIMIZE_PROFILES["world-chunk"];
    case "environment":
      return ASSET_OPTIMIZE_PROFILES["world-chunk"];
    case "track":
      return ASSET_OPTIMIZE_PROFILES["track"];
    case "proxy":
      return ASSET_OPTIMIZE_PROFILES["proxy"];
    case "backdrop":
      return ASSET_OPTIMIZE_PROFILES["backdrop"];
    case "hdri":
      return ASSET_OPTIMIZE_PROFILES["hdri"];
    case "set-dressing":
      return ASSET_OPTIMIZE_PROFILES["prop-small"];
    case "prop":
    default:
      return maxDim > 0 && maxDim < 1 ? ASSET_OPTIMIZE_PROFILES["prop-small"] : ASSET_OPTIMIZE_PROFILES["prop-large"];
  }
}
