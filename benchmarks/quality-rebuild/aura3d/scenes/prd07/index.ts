/**
 * Lane prd07 Aura adapters index — named scene modules keyed by scene id so
 * the bench router resolves `aura3d/scenes/prd07/<id>.ts`.
 */
export const adapterSceneIds = [
  "prd07-particles-fountain",
  "prd07-flipbook",
  "prd07-particles-stress",
  // Aura-only lane scenes — no three.js adapter by design (admittedAsReference: false).
  "prd07-impact-library",
  "prd07-trails-beams",
  // P3-T7 sky scenes (three adapters exist).
  "prd07-sky-timeofday",
  "prd07-outdoor-sky",
  // P4-T8 fog scenes — fog-transition and underwater are Aura-only (C-30).
  "prd07-fog-height",
  "prd07-fog-transition",
  "prd07-underwater",
  // P5-T8 weather/volumetric/I2 scenes.
  "prd07-rain-night",
  "prd07-snow",
  "prd07-volumetric-shafts",
  "prd07-lit-smoke",
  "prd07-soft-particles",
  "prd07-water-interleave"
] as const;
