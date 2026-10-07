/**
 * @deprecated The CPU post-process kernels moved to `./reference` (PRD-03
 * Phase 3): the v2 chain executes them on the GPU, so they are
 * reference/test code now. This shim keeps the old path compiling; import
 * `@aura3d/rendering/reference` or `./reference/PostProcessPass` directly.
 * Dropping the root re-export is Q-15-4.
 */
export * from "./reference/PostProcessPass";
