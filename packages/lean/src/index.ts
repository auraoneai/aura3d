/*
 * T4.6 (PRD-15 §7.5) — @aura3d/lean is deprecated.
 *
 * The lean package's own runtime, renderer and builders are gone; every
 * surviving name is the engine's public surface re-exported. Removed in 4.0.0.
 */

declare global {
  var __AURA3D_LEAN_DEPRECATION_WARNED__: boolean | undefined;
}

if (typeof globalThis !== "undefined" && !globalThis.__AURA3D_LEAN_DEPRECATION_WARNED__) {
  globalThis.__AURA3D_LEAN_DEPRECATION_WARNED__ = true;
  console.warn("[aura3d] @aura3d/lean is deprecated; import from @aura3d/engine. Removed in 4.0.0.");
}

/** @deprecated Use "@aura3d/engine". Removed in 4.0.0. */
export {
  createAuraApp,
  scene,
  model,
  primitives,
  material,
  lights,
  camera,
  environments,
  interactions,
  defineAuraAssets
} from "@aura3d/engine";
