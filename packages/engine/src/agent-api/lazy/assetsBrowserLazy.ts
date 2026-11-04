/**
 * Narrow lazy facade for `@aura3d/assets/browser`.
 *
 * `import("@aura3d/assets/browser")` made the whole barrel namespace live, so every loader, exporter,
 * corpus and inspection helper in that barrel landed on the static critical path of "." even though the
 * synchronous consumers named only a handful of exports. Lazy call sites import this module instead:
 * it re-exports exactly what they destructure, so the barrel stays tree-shakeable.
 */
export { GaussianSplatLoader, createGLTFSceneAnimationRuntime, parseEXR } from "@aura3d/assets/browser";
