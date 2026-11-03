// Top-level-await-free solver initialisation, selected by the `aura3d-no-tla` condition for bundlers that cannot
// emit top-level await. Rapier starts loading when this module is evaluated but is only usable once
// `ensureRapier()` (re-exported as `ensurePhysics()`) has resolved: await it before `createAuraApp` or before the
// first `new PhysicsWorld()`.
type RapierModule = typeof import("@dimforge/rapier3d-compat");

let loaded: RapierModule | null = null;
let pending: Promise<RapierModule | null> | null = null;
let initializationError: { readonly cause: unknown } | null = null;

export const rapierInitMode: "top-level-await" | "lazy" = "lazy";

export function getRapierModule(): RapierModule | null {
  return loaded;
}

/** @internal Failed initialization is reported only when physics is requested. */
export function getRapierInitializationError(): { readonly cause: unknown } | null {
  return initializationError;
}

export function ensureRapier(): Promise<RapierModule | null> {
  pending ??= (async () => {
    const mod = (await import("@dimforge/rapier3d-compat").catch(() => null)) as RapierModule | null;
    const init = (mod as unknown as { init?: (input?: unknown) => Promise<unknown> } | null)?.init;
    if (mod && init) {
      try { await init({}); }
      catch (cause) { initializationError = { cause }; throw cause; }
    }
    loaded = mod;
    return mod;
  })();
  return pending;
}

// Background preload is observed even if no consumer requests physics. The
// original promise remains rejected for a later explicit ensureRapier call.
void ensureRapier().catch(() => {});
