/**
 * `@aura3d/engine/sculpt` — procedural 3D sculpting kernel (5.5.6, additive public subpath).
 *
 * Pure TypeScript curve, surface, implicit-SDF, and multi-material sub-assembly builders
 * targeting `geometry.define`, `geometry.multiMaterial`, and `instances.custom`
 * with precomputed local bounding boxes and zero `three` dependencies.
 * Promoted from the showcase kernel (`apps/showcase-port-shared/proceduralKernel.ts`,
 * which now re-exports this module); function behaviour is unchanged.
 *
 * The kernel is split into cohesive modules; this file is the stable barrel that `public/sculpt.ts`,
 * `sdfLimbs.ts` and the showcase shim import from.
 */
export * from "./kernelMath.js";
export * from "./meshPrimitives.js";
export * from "./prefabSlots.js";
export * from "./meshFairing.js";
export * from "./sdfSculpt.js";
export * from "./meshAssembly.js";
export * from "./hairMass.js";
