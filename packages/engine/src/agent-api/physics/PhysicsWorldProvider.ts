/**
 * Staged provider for an isolated engine entry. This module is intentionally
 * not connected to the 4.x root, whose synchronous first use remains intact.
 */
import type { LegacyPhysicsWorldAccess, PhysicsWorldConstructor, PhysicsWorldProvider } from "./PhysicsWorldAccess.js";

export type { LegacyPhysicsWorldAccess, PhysicsWorldAccess, PhysicsWorldConstructor, PhysicsWorldProvider } from "./PhysicsWorldAccess.js";

import { isPhysicsBackendMissing, physicsBackendMissingError } from "./backendMissing.js";

export { isPhysicsBackendMissing } from "./backendMissing.js";

export type PhysicsWorldModule = Pick<typeof import("@aura3d/physics/world"), "PhysicsWorld" | "ensurePhysics">
  & Partial<Pick<typeof import("@aura3d/physics/world"), "physicsLoadMode">>;
export type PhysicsWorldLoader = () => Promise<PhysicsWorldModule>;

/** Check whether a value is constructable without invoking its constructor. */
function requireConstructor(value: unknown, label: string): void {
  if (typeof value !== "function") throw new TypeError(`${label} is not constructable.`);
  try {
    Reflect.construct(Object, [], value);
  } catch (cause) {
    throw new TypeError(`${label} is not constructable.`, { cause });
  }
}

/**
 * Create an isolated readiness provider. The loader parameter is an internal
 * injection seam; the default imports the real, narrow physics-world entry.
 * The loader and initializer must not await this same provider's preload,
 * which would form a dependency cycle.
 */
export function createPhysicsWorldProvider(
  loader: PhysicsWorldLoader = () => import("@aura3d/physics/world")
): PhysicsWorldProvider {
  let ready: PhysicsWorldConstructor | undefined;
  let pending: Promise<void> | undefined;
  let lastFailure: Error | undefined;

  return {
    preload(): Promise<void> {
      if (ready) return Promise.resolve();
      if (pending) return pending;
      lastFailure = undefined;
      let backendAbsent = false;

      // Start the loader on a microtask so `pending` is visible even if an
      // injected loader calls preload reentrantly before returning.
      const attempt = Promise.resolve().then(loader).then(async (module) => {
        if (!module || typeof module.ensurePhysics !== "function") {
          throw new TypeError("The physics world module has no ensurePhysics function.");
        }
        const constructor = module.PhysicsWorld;
        requireConstructor(constructor, "The physics world module's PhysicsWorld");
        const backend = await module.ensurePhysics();
        if (backend == null) backendAbsent = true;
        if (backend == null) throw new Error("The optional @dimforge/rapier3d-compat backend is unavailable.");
        if (typeof backend !== "object" && typeof backend !== "function") throw new TypeError("The initialized physics backend is not a module.");
        if (typeof backend.init !== "function") throw new TypeError("The initialized Rapier backend has no init function.");
        requireConstructor(backend.World, "The initialized physics backend's World");
        // ensurePhysics resolves only after Rapier initialization. Do not
        // allocate a native world merely to check preload readiness.
        ready = constructor;
      }).catch((cause: unknown) => {
        const missing = backendAbsent || isPhysicsBackendMissing(cause);
        const failure = missing
          ? physicsBackendMissingError(cause)
          : new Error("Could not preload physics. Check the optional Rapier backend before trying again.", { cause });
        lastFailure = failure;
        throw failure;
      });
      pending = attempt;
      // Clear only this attempt, and observe both outcomes without creating an
      // unhandled rejection. A later call may safely try the loader again.
      void attempt.then(
        () => { if (pending === attempt) pending = undefined; },
        () => { if (pending === attempt) pending = undefined; }
      );
      return attempt;
    },

    requireReady(): PhysicsWorldConstructor {
      if (ready) return ready;
      const message = pending
        ? "Physics is still loading. Await preloadPhysics() before constructing a physics world."
        : "Physics is not preloaded. Await preloadPhysics() before constructing a physics world.";
      if (lastFailure && isPhysicsBackendMissing(lastFailure)) throw lastFailure;
      throw lastFailure ? new Error(message, { cause: lastFailure }) : new Error(message);
    }
  };
}

/**
 * Bind a legacy entry to the world module it statically imported. This never
 * seeds the isolated provider: default 4.x imports have already awaited their
 * top-level initialization, while no-TLA construction keeps its existing
 * readiness/error behavior until callers await the backend.
 */
export function createLegacyPhysicsWorldAccess(module: PhysicsWorldModule): LegacyPhysicsWorldAccess {
  if (!module || typeof module.ensurePhysics !== "function") {
    throw new TypeError("The legacy physics world module has no ensurePhysics function.");
  }
  const constructor = module.PhysicsWorld;
  requireConstructor(constructor, "The legacy physics world module's PhysicsWorld");
  const ensurePhysics = module.ensurePhysics;
  const preloadProvider = createPhysicsWorldProvider(async () => ({
    PhysicsWorld: constructor,
    ensurePhysics: () => ensurePhysics.call(module)
  }));
  return {
    preload: () => preloadProvider.preload(),
    requireReady: () => constructor,
    // Read when an app is created, never at access creation: absent on world modules older than lane 519 (and on
    // strict test doubles), which load eagerly.
    get loadMode(): "eager" | "on-demand" | "stripped" | undefined {
      try {
        const mode = Reflect.get(module, "physicsLoadMode") as unknown;
        return mode === "on-demand" || mode === "stripped" ? mode : undefined;
      } catch { return undefined; }
    }
  };
}

const defaultProvider = createPhysicsWorldProvider();

/** Stage the real optional physics backend for later synchronous construction. */
export function preloadPhysics(): Promise<void> { return defaultProvider.preload(); }

/** @internal Synchronous access for a future isolated engine entry. */
export function requirePhysicsWorld(): PhysicsWorldConstructor { return defaultProvider.requireReady(); }
