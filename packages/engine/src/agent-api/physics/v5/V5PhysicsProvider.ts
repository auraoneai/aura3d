import type { PhysicsWorldConstructor, PhysicsWorldProvider } from "../PhysicsWorldAccess.js";
import { V5PhysicsConnectorError, type V5PhysicsConnector, type V5PhysicsConnectorLoader } from "./V5PhysicsConnector.js";
import { v5PhysicsCore } from "./V5PhysicsCore.js";

export interface V5PhysicsProvider extends PhysicsWorldProvider {
  /**
   * Select the loader for this provider. It may be replaced after a failed
   * attempt, but never while loading or after a constructor has been published.
   */
  setConnector(loader: V5PhysicsConnectorLoader): void;
}

const missingConnector = (): V5PhysicsConnectorError => new V5PhysicsConnectorError(
  "CONNECTOR_MISSING",
  "Physics connector is not configured. Install a compatible v5 connector, call setConnector with its loader, then await preloadPhysics()."
);

/** Validate the constructor without allocating a physics or backend world. */
function requireConstructor(value: unknown): asserts value is PhysicsWorldConstructor {
  if (typeof value !== "function") {
    throw new V5PhysicsConnectorError("CONNECTOR_INVALID", "The v5 physics connector did not return a world constructor.");
  }
  try {
    Reflect.construct(Object, [], value);
  } catch (cause) {
    throw new V5PhysicsConnectorError("CONNECTOR_INVALID", "The v5 physics connector returned a non-constructable world.", { cause });
  }
}

/**
 * Source-level provider for an explicitly installed connector. It has no
 * built-in solver import or fallback. All providers use the same v5 core,
 * while readiness and failure state stay private to each provider.
 */
export function createV5PhysicsProvider(): V5PhysicsProvider {
  let loader: V5PhysicsConnectorLoader | undefined;
  let ready: PhysicsWorldConstructor | undefined;
  let pending: Promise<void> | undefined;
  let lastFailure: V5PhysicsConnectorError | undefined;

  return {
    setConnector(nextLoader) {
      if (typeof nextLoader !== "function") throw new TypeError("The v5 physics connector loader must be a function.");
      if (pending || ready) {
        throw new V5PhysicsConnectorError(
          "CONNECTOR_LOCKED",
          "Cannot replace a v5 physics connector while loading or after it is ready."
        );
      }
      loader = nextLoader;
    },

    preload(): Promise<void> {
      if (ready) return Promise.resolve();
      if (pending) return pending;
      const selectedLoader = loader;
      lastFailure = undefined;

      // Defer loading until pending is visible to concurrent and reentrant calls.
      const attempt = Promise.resolve().then(async () => {
        if (!selectedLoader) throw missingConnector();

        let connector: V5PhysicsConnector;
        try {
          connector = await selectedLoader();
        } catch (cause) {
          throw new V5PhysicsConnectorError(
            "CONNECTOR_LOAD_FAILED",
            "Could not load the v5 physics connector. Check its installation and retry preloadPhysics().",
            { cause }
          );
        }
        if (!connector || (typeof connector !== "object" && typeof connector !== "function")) {
          throw new V5PhysicsConnectorError("CONNECTOR_INVALID", "The v5 physics connector loader did not return a connector.");
        }
        if (connector.core !== v5PhysicsCore) {
          throw new V5PhysicsConnectorError(
            "CONNECTOR_CORE_MISMATCH",
            "The v5 physics connector uses a different physics core. Resolve duplicate v5 core packages and retry."
          );
        }
        const initialize = connector.initialize;
        if (typeof initialize !== "function") {
          throw new V5PhysicsConnectorError("CONNECTOR_INVALID", "The v5 physics connector has no initialize function.");
        }

        let constructor: unknown;
        try {
          constructor = await initialize.call(connector, v5PhysicsCore);
        } catch (cause) {
          throw new V5PhysicsConnectorError(
            "CONNECTOR_INITIALIZATION_FAILED",
            "Could not initialize the v5 physics connector. Check the optional backend and retry preloadPhysics().",
            { cause }
          );
        }
        requireConstructor(constructor);
        ready = constructor;
      }).catch((cause: unknown) => {
        const failure = cause instanceof V5PhysicsConnectorError
          ? cause
          : new V5PhysicsConnectorError("CONNECTOR_INVALID", "Could not inspect the v5 physics connector.", { cause });
        lastFailure = failure;
        throw failure;
      });
      pending = attempt;
      // Observe both outcomes, including discarded failures, and clear only
      // this attempt so a rejection handler can immediately start a retry.
      void attempt.then(
        () => { if (pending === attempt) pending = undefined; },
        () => { if (pending === attempt) pending = undefined; }
      );
      return attempt;
    },

    requireReady(): PhysicsWorldConstructor {
      if (ready) return ready;
      if (pending) {
        throw new V5PhysicsConnectorError("PHYSICS_LOADING", "Physics is still loading. Await preloadPhysics() before constructing a world.");
      }
      if (!loader) {
        if (!lastFailure) throw missingConnector();
        throw new V5PhysicsConnectorError("CONNECTOR_MISSING", missingConnector().message, { cause: lastFailure });
      }
      throw new V5PhysicsConnectorError(
        "PHYSICS_NOT_READY",
        "Physics is not ready. Await preloadPhysics() before constructing a world.",
        lastFailure ? { cause: lastFailure } : undefined
      );
    }
  };
}
