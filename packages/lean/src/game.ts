/*
 * T4.6 (PRD-15 §7.5) — @aura3d/lean/game is deprecated.
 *
 * The lean arcade runtime is deleted (ArcadeRuntime.ts had no consumers; the
 * §7.5 engine surface covers its builders). `game`, `AuraNodeBuilder` and the
 * platformer event types map onto the engine equivalents. Removed in 4.0.0.
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
  defineAuraAssets,
  game
} from "@aura3d/engine";

/** @deprecated Use `AuraNodeBuilder` from "@aura3d/engine". Removed in 4.0.0. */
export type { AuraNodeBuilder as AuraLeanNodeBuilder } from "@aura3d/engine";
/** @deprecated Use `GamePlatformerEvent` from "@aura3d/engine". Removed in 4.0.0. */
export type { GamePlatformerEvent as LeanPlatformerEvent } from "@aura3d/engine";
