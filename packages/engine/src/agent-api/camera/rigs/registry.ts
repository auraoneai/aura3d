/**
 * Rig-factory registry — lets `controller.rigs` stay complete for every
 * barrel consumer while rig modules tree-shake out of bundles that never
 * import them (PRD-08 §17 S19: "rigs must tree-shake").
 *
 * Each `rigs/<name>.ts` registers itself on import; `CameraController`
 * resolves `rigs.<name>` through the registry at call time instead of
 * statically importing every factory. `static`/`fromSpec` stay eager on the
 * controller (core surface, no optional deps).
 */
export type AuraRigFactoryFn = (options: unknown, deps?: unknown) => unknown;

const RIG_REGISTRY = new Map<string, AuraRigFactoryFn>();

export function registerRigFactory(name: string, factory: AuraRigFactoryFn): void {
  RIG_REGISTRY.set(name, factory);
}

export function rigFactory(name: string): AuraRigFactoryFn | undefined {
  return RIG_REGISTRY.get(name);
}
