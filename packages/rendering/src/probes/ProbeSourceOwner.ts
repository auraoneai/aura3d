/**
 * Probe capture and frame contributors must agree on the app that owns a
 * source. Keep this association private and weak: a caller's RenderSource is
 * neither mutated nor allowed to select another app through a property.
 */
const sourceOwners = new WeakMap<object, object>();

export function setProbeSourceOwner(source: object, owner: object): void {
  sourceOwners.set(source, owner);
}

export function probeSourceOwner(source: object): object | undefined {
  return sourceOwners.get(source);
}

/** Carry the captured owner across renderer-created source copies. */
export function inheritProbeSourceOwner<T extends object>(source: object, copy: T): T {
  const owner = sourceOwners.get(source);
  if (owner === undefined) sourceOwners.delete(copy);
  else sourceOwners.set(copy, owner);
  return copy;
}
