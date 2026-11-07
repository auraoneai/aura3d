// On-demand solver initialisation, selected by the `aura3d-physics-on-demand` condition (the Aura3D Vite plugin sets it for
// `aura3d({ physics: "lazy" })`). Unlike `rapierInit.lazy.ts` (the `aura3d-no-tla` variant) it does NOT start loading Rapier
// when it is evaluated: nothing is fetched until the first `ensureRapier()` (re-exported as `ensurePhysics()`), which
// `createAuraApp` calls when a scene declares physics bodies or `app.physics` is first touched. An app that never uses
// physics therefore never downloads the Rapier chunk.
type RapierModule = typeof import("@dimforge/rapier3d-compat");

let loaded: RapierModule | null = null;
let pending: Promise<RapierModule | null> | null = null;
let initializationError: { readonly cause: unknown } | null = null;

export const rapierInitMode: "top-level-await" | "lazy" = "lazy";
/** How this build loads Rapier: `on-demand` means on the first `ensureRapier()` call and never before. */
export const rapierLoadMode: "eager" | "on-demand" | "stripped" = "on-demand";

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
