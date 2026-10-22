/**
 * Re-export shim — the transform lives in the shipped CLI package
 * (`packages/aura3d-cli/src/codemods/core-v2.ts`) so the packed `aura3d` bin
 * never reaches outside its package root at runtime.
 */
export * from "../../packages/aura3d-cli/src/codemods/core-v2.js";
