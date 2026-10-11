/**
 * Lane prd07 three.js adapters index — named scene modules keyed by scene id.
 */
export const adapterSceneIds = [
  "prd07-particles-fountain", "prd07-flipbook", "prd07-particles-stress", "prd07-sky-timeofday",
  // 07 Phase D S4 hours (Sky.js at the same dayNight sun).
  "prd07-sky-h06", "prd07-sky-h09", "prd07-sky-h12", "prd07-sky-h18", "prd07-sky-h21",
  "prd07-outdoor-sky", "prd07-fog-height",
  // P5-T8 three r185 approximations (S8/S9 instanced weather; I4/I2 share the handled kinds).
  "prd07-rain-night", "prd07-snow", "prd07-volumetric-shafts", "prd07-lit-smoke", "prd07-soft-particles", "prd07-water-interleave",
  // P6-T7 §6.9 merged decals — r185 DecalGeometry projections.
  "prd07-decals"
] as const;
