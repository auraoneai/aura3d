// Default solver initialisation: one top-level WASM init at module evaluation, so `new PhysicsWorld()` and
// `app.physics` are live synchronously. `@dimforge/rapier3d-compat` is an OPTIONAL peer and must be
// absent-tolerant here; failure defers to call time.
// Bundlers that cannot emit top-level await (esbuild with an es2020 target or iife/cjs output, Rollup iife)
// select `rapierInit.lazy.ts` instead through the `aura3d-no-tla` condition (see `imports` in package.json).
type RapierModule = typeof import("@dimforge/rapier3d-compat");

let loaded = (await import("@dimforge/rapier3d-compat").catch(() => null)) as RapierModule | null;
let initializationError: { readonly cause: unknown } | null = null;
const init = (loaded as unknown as { init?: (input?: unknown) => Promise<unknown> } | null)?.init;
if (loaded && init) {
  try { await init({}); }
  catch (cause) {
    // A broken optional WASM backend must not reject imports which never use
    // physics. Preserve the original failure for an explicit physics request.
    initializationError = { cause };
    loaded = null;
  }
}

export const rapierInitMode: "top-level-await" | "lazy" = "top-level-await";
/** How this build loads Rapier: `eager` means at module evaluation (top-level await). */
export const rapierLoadMode: "eager" | "on-demand" | "stripped" = "eager";

export function getRapierModule(): RapierModule | null {
  return loaded;
}

/** @internal Failed initialization is reported only when physics is requested. */
export function getRapierInitializationError(): { readonly cause: unknown } | null {
  return initializationError;
}

export function ensureRapier(): Promise<RapierModule | null> {
  return initializationError ? Promise.reject(initializationError.cause) : Promise.resolve(loaded);
}
