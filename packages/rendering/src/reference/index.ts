/**
 * `reference/` — CPU reference kernels retired off the v2 post chain
 * (PRD-03 Phase 3). Everything here executes on the CPU or is a legacy
 * descriptor factory: useful to tests, external-parity tooling and
 * `cpu-deterministic` runs, but never part of the flag-on GPU path. The
 * `@aura3d/rendering/reference` subpath export was reserved in PR 0a.
 */

export * from "./PostProcessPass";
export * from "./EffectComposer";
export * from "./SSAOPass";
export * from "./BloomPass";
export * from "./VignettePass";
export * from "./FilmGrainPass";
export * from "./DepthHazePass";
