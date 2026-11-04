/**
 * Narrow lazy facade for `@aura3d/rendering` (see `assetsBrowserLazy.ts`).
 * A bare `import("@aura3d/rendering")` keeps the entire rendering barrel namespace alive; lazy call
 * sites import this module instead and receive exactly the names they destructure.
 */
export {
  GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES,
  GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS,
  GaussianSplatRenderer,
  PostProcessComposer,
  bindShaderFailureStore,
  createPrd06ProgramCacheWarmup,
  createShaderFailureStore,
  gaussianSplatGpuInstanceBytes,
  paletteKeyOf,
  releaseMorphScratchGeometry,
  releaseMorphTargetTexture,
  setShaderFailureMode,
  skinningPaletteCache
} from "@aura3d/rendering";
