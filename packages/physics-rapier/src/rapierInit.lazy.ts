// Top-level-await-free solver initialisation, selected by the `aura3d-no-tla` condition for bundlers that cannot
// emit top-level await. Rapier starts loading when this module is evaluated but is only usable once
// `ensureRapier()` (re-exported as `ensurePhysics()`) has resolved: await it before `createAuraApp` or before the
// first `new PhysicsWorld()`.
type RapierModule = typeof import("@dimforge/rapier3d-compat");

let loaded: RapierModule | null = null;
let pending: Promise<RapierModule | null> | null = null;

export const rapierInitMode: "top-level-await" | "lazy" = "lazy";

export function getRapierModule(): RapierModule | null {
  return loaded;
}

export function ensureRapier(): Promise<RapierModule | null> {
  pending ??= (async () => {
    const mod = (await import("@dimforge/rapier3d-compat").catch(() => null)) as RapierModule | null;
    const init = (mod as unknown as { init?: (input?: unknown) => Promise<unknown> } | null)?.init;
    if (mod && init) await init({});
    loaded = mod;
    return mod;
  })();
  return pending;
}

void ensureRapier();
