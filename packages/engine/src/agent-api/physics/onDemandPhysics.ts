// `app.physics` while the Rapier backend is still loading (`physics: { load: "on-demand" }` or a build made with
// `aura3d({ physics: "lazy" })`). The facade is the stable identity of `app.physics` in that mode: before the backend is
// ready it queues what can be queued and fails loudly (typed) on everything that needs an answer; once ready it forwards
// every member to the real runtime, so code written for the eager build keeps working after `await app.physics.ready()`.
import type { AuraCollisionEvent, AuraCollisionLayers, AuraPhysicsRuntime } from "../PhysicsRuntime.js";

/** Stable code of the error thrown by `app.physics` members that need the backend before it has loaded. */
export const PHYSICS_NOT_READY_CODE = "PHYSICS_NOT_READY";

/** Structural check for the typed not-ready error. */
export function isPhysicsNotReady(error: unknown): boolean {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) return false;
  try { return Reflect.get(error, "code") === PHYSICS_NOT_READY_CODE; } catch { return false; }
}

export function physicsNotReadyError(member: string): Error {
  return Object.assign(
    new Error(
      `${PHYSICS_NOT_READY_CODE}: app.physics.${member} was called before the on-demand Rapier backend finished loading. ` +
      "Await app.physics.ready() (or app.ready()) first. Declared .physics({...}) bodies and onCollision/onTrigger* handlers are queued " +
      "and applied on load; step() and contacts() return [] until then."
    ),
    { name: "PhysicsNotReadyError", code: PHYSICS_NOT_READY_CODE, member }
  );
}

export interface OnDemandPhysicsHost {
  /** True once the backend has loaded and the deferred declared bodies were created. */
  isReady(): boolean;
  /** Start (or join) the backend load; rejects with the typed load failure. */
  load(): Promise<void>;
  /** The last load failure, if the most recent attempt failed. */
  failure(): unknown;
  /** The real runtime; only called once {@link isReady} is true. */
  real(): AuraPhysicsRuntime;
  readonly layers: AuraCollisionLayers | undefined;
}

export interface OnDemandPhysicsFacade {
  readonly facade: AuraPhysicsRuntime;
  /** Register the queued event handlers on the real runtime; called once when the backend is ready. */
  flush(): void;
}

const QUEUEABLE = new Set(["onCollision", "onCollisionWith", "onTriggerEnter", "onTriggerExit"]);
const EMPTY: readonly AuraCollisionEvent[] = Object.freeze([]);

export function createOnDemandPhysicsFacade(host: OnDemandPhysicsHost): OnDemandPhysicsFacade {
  type Queued = { readonly method: string; readonly args: readonly unknown[]; cancelled: boolean; unsubscribe?: () => void };
  const queued: Queued[] = [];
  const forward = (target: object, key: PropertyKey): unknown => {
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  };
  const unavailable = (member: string): Error => {
    const failure = host.failure();
    return failure instanceof Error ? failure : physicsNotReadyError(member);
  };
  const nested = (name: "bodies" | "queries"): object => new Proxy({}, {
    get(_target, key) {
      if (typeof key === "symbol" || key === "then") return undefined;
      if (host.isReady()) return forward(host.real()[name], key);
      return () => { throw unavailable(`${name}.${key}()`); };
    }
  });
  const bodies = nested("bodies");
  const queries = nested("queries");
  const facade = new Proxy({}, {
    get(_target, key) {
      // Never look like a thenable, so `await app.physics` or returning it from an async function is safe.
      if (typeof key === "symbol" || key === "then") return undefined;
      if (key === "ready") return () => host.load();
      if (host.isReady()) return forward(host.real(), key);
      if (key === "layers") return host.layers;
      if (key === "bodies") return bodies;
      if (key === "queries") return queries;
      if (key === "step" || key === "contacts") {
        return () => {
          const failure = host.failure();
          if (failure !== undefined) throw failure;
          return EMPTY;
        };
      }
      if (QUEUEABLE.has(key)) {
        return (...args: unknown[]) => {
          const entry: Queued = { method: key, args, cancelled: false };
          queued.push(entry);
          return () => {
            entry.cancelled = true;
            const unsubscribe = entry.unsubscribe;
            entry.unsubscribe = undefined;
            unsubscribe?.();
          };
        };
      }
      return () => { throw unavailable(`${key}()`); };
    },
    has(_target, key) {
      return host.isReady() ? Reflect.has(host.real(), key) : key !== "then";
    }
  }) as AuraPhysicsRuntime;
  return {
    facade,
    flush() {
      const real = host.real() as unknown as Record<string, (...args: unknown[]) => () => void>;
      for (const entry of queued.splice(0)) {
        if (entry.cancelled) continue;
        entry.unsubscribe = real[entry.method]!(...entry.args);
      }
    }
  };
}
