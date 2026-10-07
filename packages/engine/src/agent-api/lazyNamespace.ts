/*
 * T3 (PRD-15 §CCR-15-2) — deferred namespace construction.
 *
 * The agent-api namespace aggregates (`game`, `prefabs`, `material`, ...)
 * mutually embed each other's exports. In the single-file barrel this was
 * harmless; after the leaf split those reads became ESM module-eval reads and
 * every leaf↔leaf cycle is a potential `Cannot access 'X' before
 * initialization` crash in the packed dist. Wrapping an aggregate's literal in
 * `lazyNamespace(() => ({ ... }))` defers evaluation to first property access,
 * by which point every module in the graph has finished initializing. The
 * proxy forwards every introspection trap to the realized object, so reads,
 * enumeration, spread, JSON.stringify, and identity of members are unchanged.
 *
 * This module intentionally imports nothing: it must stay outside the import
 * cycle it exists to break.
 */

export function lazyNamespace<T extends object>(init: () => T): T {
  let cached: T | undefined;
  const realize = () => (cached ??= init());
  return new Proxy({} as T, {
    get: (_target, prop, receiver) => Reflect.get(realize(), prop, receiver),
    has: (_target, prop) => prop in realize(),
    set: (_target, prop, value, receiver) => Reflect.set(realize(), prop, value, receiver),
    deleteProperty: (_target, prop) => Reflect.deleteProperty(realize(), prop),
    ownKeys: () => Reflect.ownKeys(realize()),
    getOwnPropertyDescriptor: (_target, prop) => Reflect.getOwnPropertyDescriptor(realize(), prop),
    getPrototypeOf: () => Object.getPrototypeOf(realize()),
    setPrototypeOf: (_target, proto) => Object.setPrototypeOf(realize(), proto),
    isExtensible: () => Object.isExtensible(realize()),
    preventExtensions: () => {
      Object.preventExtensions(realize());
      return true;
    },
    defineProperty: (_target, prop, descriptor) => {
      Object.defineProperty(realize(), prop, descriptor);
      return true;
    }
  });
}

/** Same as lazyNamespace for callable values (e.g. `Object.assign(fn, {...})`). */
export function lazyCallable<T extends object>(init: () => T): T {
  let cached: T | undefined;
  const realize = () => (cached ??= init());
  const callableTarget = function (this: unknown) {
    return Reflect.apply(realize() as never, this, []);
  };
  return new Proxy(callableTarget as unknown as T, {
    get: (_target, prop, receiver) => Reflect.get(realize(), prop, receiver),
    has: (_target, prop) => prop in realize(),
    set: (_target, prop, value, receiver) => Reflect.set(realize(), prop, value, receiver),
    deleteProperty: (_target, prop) => Reflect.deleteProperty(realize(), prop),
    ownKeys: () => Reflect.ownKeys(realize()),
    getOwnPropertyDescriptor: (_target, prop) => Reflect.getOwnPropertyDescriptor(realize(), prop),
    getPrototypeOf: () => Object.getPrototypeOf(realize()),
    apply: (_target, thisArg, args) => Reflect.apply(realize() as never, thisArg, args),
    construct: (_target, args, newTarget) => Reflect.construct(realize() as never, args, newTarget)
  });
}
