// Bunker Zero uses the shared root catalog exclusively — every model below is a
// typed AuraAssetRef resolved through `model(assets.<key>)`; no route-local GLBs
// were needed (genuinely-new assets would land in public/aura-assets/ + a
// bz-specific defineAuraAssets map per the top-tennis-v2 pattern).
export { assets } from "../../../src/aura-assets";
