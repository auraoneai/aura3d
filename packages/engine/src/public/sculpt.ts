// @aura3d/engine/sculpt (5.5.6, additive): procedural 3D sculpting kernel — vector/noise helpers, curve and surface
// builders (lathe, loft, tube sweeps, extrusions, bevels), implicit-SDF sculpting (dual surface nets + Taubin fairing),
// G1 SDF limb chains with mitten hands, vertex painting, and `geometry.define` / `geometry.multiMaterial` assemblers.
// Every builder returns plain mesh data or a custom geometry spec; nothing runs per frame.
export * from "../sculpt/proceduralKernel.js";
export * from "../sculpt/sdfLimbs.js";
