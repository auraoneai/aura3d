// Bunker Zero draws almost everything from the shared root catalog; assets generated for this route alone live in
// aura-assets.local.ts (admitted through `aura3d assets import-meshy`, same-origin URL + sha256 + provenance).
import { assets as rootAssets } from "../../../src/aura-assets";
import { assets as localAssets } from "./aura-assets.local";

export const assets: typeof rootAssets & typeof localAssets = { ...rootAssets, ...localAssets };
