export const DEFAULT_AURA_ASSET_MANIFEST = "aura.assets.json";
export const DEFAULT_AURA_ASSET_OUTPUT_DIR = "public/aura-assets";
export const DEFAULT_AURA_ASSET_PUBLIC_PATH = "/aura-assets/";
export const DEFAULT_AURA_ASSET_TYPEGEN = "src/aura-assets.ts";

/** Root-renderable WP-08 catalog model formats admitted by `admitNativeFormat` (3DM is refused without a supplied codec). */
export const NATIVE_CATALOG_MODEL_FORMATS: ReadonlySet<string> = new Set(["fbx", "usd", "usda", "usdz", "dae", "3dm", "amf", "3ds", "wrl", "vrml", "ldr", "mpd", "kmz", "pcd", "pdb", "vtk", "xyz", "gcode", "gco", "md2", "svg"]);
