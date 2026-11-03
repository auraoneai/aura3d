/**
 * Staged versioned entry with entry-scoped, opt-in physics. Call
 * `await preloadPhysics()` before synchronous physics-backed construction.
 *
 * The source entry exposes the 4.x root's named runtime values and explicit
 * type exports, but packed compatibility has not been established. Use
 * `@aura3d/engine/v5/game` for the full game runtime.
 */
import "../lanes/index.js";

export * from "../agent-api/isolated-index.js";
export { createAuraApp, createGameApp, game, games, physics, preloadPhysics, sceneKits } from "./v5-context.js";
export { createGame } from "./v5-internal.js";

/** Explicit scope of this staged entry relative to the current 4.x root. */
export const V5_ISOLATED_ENTRY_SCOPE = Object.freeze({
  status: "staged" as const,
  omittedRootExports: Object.freeze([] as const),
  omittedRootTypeExports: Object.freeze([] as const),
  compatibility: "Named legacy runtime values and explicit type exports are present in source; installed declarations and complete 4.x behavior remain unverified. Preload v5 physics and migrate full games to @aura3d/engine/v5/game." as const,
  migration: Object.freeze({
    physics: "Call await preloadPhysics() before constructing a physics-backed world or game; v5 owns a separate provider.",
    game: "Import createGame from @aura3d/engine/v5/game for the full game runtime; the v5 root reports a migration error.",
    types: "Legacy root type names are present in source; verify the staged or installed declarations before migrating type imports."
  } as const)
});
