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
  "prd07-trails-beams"
] as const;
