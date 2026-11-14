/**
 * Showcase compatibility shim: the procedural sculpting kernel now ships in the engine as the public
 * `@aura3d/engine/sculpt` subpath (packages/engine/src/sculpt/proceduralKernel.ts). Kept so existing
 * showcase/example import paths keep resolving; new code should import from "@aura3d/engine/sculpt".
 */
export * from "@aura3d/engine/sculpt";
