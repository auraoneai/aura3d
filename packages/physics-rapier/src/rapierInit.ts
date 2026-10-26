// Default solver initialisation: one top-level WASM init at module evaluation, so `new PhysicsWorld()` and
// `app.physics` are live synchronously. `@dimforge/rapier3d-compat` is an OPTIONAL peer and must be
// absent-tolerant here; failure defers to call time.
// Bundlers that cannot emit top-level await (esbuild with an es2020 target or iife/cjs output, Rollup iife)
// select `rapierInit.lazy.ts` instead through the `aura3d-no-tla` condition (see `imports` in package.json).
type RapierModule = typeof import("@dimforge/rapier3d-compat");

const loaded = (await import("@dimforge/rapier3d-compat").catch(() => null)) as RapierModule | null;
const init = (loaded as unknown as { init?: (input?: unknown) => Promise<unknown> } | null)?.init;
if (loaded && init) await init({});

export const rapierInitMode: "top-level-await" | "lazy" = "top-level-await";

export function getRapierModule(): RapierModule | null {
  return loaded;
}

export function ensureRapier(): Promise<RapierModule | null> {
  return Promise.resolve(loaded);
}
