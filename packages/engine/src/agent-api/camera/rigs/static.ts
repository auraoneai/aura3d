/**
 * C-22 `rigs.static` (PRD-08 R-9): a fixed-pose rig from `Partial<AuraCameraPose>`
 * — unspecified fields take the spec's DEFAULT_POSE. Implemented in fromSpec.ts
 * next to the legacy-spec rig that shares its pose defaults.
 */
export { staticRig } from "./fromSpec.js";
