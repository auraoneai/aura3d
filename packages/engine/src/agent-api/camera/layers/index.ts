/**
 * Built-in C-22 camera layers (PRD-08 §6.5): lookAt override, punch, fovKick,
 * trauma shake. All additive in camera-local space, applied after rig output.
 *
 * Reduced motion (ctx.reducedMotion): trauma ×0.25, roll ×0, punch dolly ×0,
 * fovKick ×0.5 — routes may not bypass this.
 */
export { createLookAtLayer, type AuraLookAtLayer } from "./lookAt.js";
export { createPunchLayer } from "./punch.js";
export { createFovKickLayer } from "./fovKick.js";
export { createTraumaLayer } from "./trauma.js";
