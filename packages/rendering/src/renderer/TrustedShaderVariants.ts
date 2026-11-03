import type { ShaderPreprocessOptions } from "../ShaderPreprocessor";

interface ObjectSnapshot {
  readonly target: object;
  readonly prototype: object | null;
  readonly descriptors: PropertyDescriptorMap;
  readonly children: readonly ObjectSnapshot[];
}

interface VariantRecord {
  readonly value: object;
  readonly snapshot: ObjectSnapshot;
}

interface VariantLibrary {
  readonly cache: Map<string, unknown>;
  readonly verify: (shaderName?: string) => boolean;
  readonly records: Map<string, VariantRecord>;
  invalidated: boolean;
  inFlight: boolean;
}

interface PendingCompile {
  readonly state: VariantLibrary;
  readonly entries: readonly (readonly [string, VariantRecord])[];
}

const trustedOptions = new WeakSet<object>();
const libraries = new WeakMap<object, VariantLibrary>();
const pending = new WeakMap<object, PendingCompile>();
const mapGet = Map.prototype.get;
const mapHas = Map.prototype.has;
const mapDelete = Map.prototype.delete;
const mapSize = Object.getOwnPropertyDescriptor(Map.prototype, "size")!.get!;

/** Make an immutable, data-only copy for the engine's own variant requests.
 * Unknown options continue to compile normally, without acquiring a proof. */
export function trustedShaderVariantOptions(defines: ShaderPreprocessOptions["defines"]): ShaderPreprocessOptions {
  try {
    if (!defines || (Object.getPrototypeOf(defines) !== Object.prototype && Object.getPrototypeOf(defines) !== null)) return { defines };
    const copy: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
    for (const key of Reflect.ownKeys(defines)) {
      const descriptor = Object.getOwnPropertyDescriptor(defines, key);
      if (typeof key !== "string" || !descriptor || !("value" in descriptor)) return { defines };
      if (!descriptor.enumerable) continue;
      const value = descriptor.value as unknown;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return { defines };
      Object.defineProperty(copy, key, { value, enumerable: true, writable: false, configurable: false });
    }
    const options = Object.freeze({ defines: Object.freeze(copy) });
    trustedOptions.add(options);
    return options;
  } catch {
    return { defines };
  }
}

/** Called once by the default-library factory's identity proof. */
export function registerTrustedVariantLibrary(library: object, cache: Map<string, unknown>, verify: (shaderName?: string) => boolean): void {
  if (!libraries.has(library)) libraries.set(library, { cache, verify, records: new Map(), invalidated: false, inFlight: false });
}

function snapshotPlainTree(target: object, seen = new Set<object>()): ObjectSnapshot | undefined {
  if (seen.has(target)) return undefined;
  const prototype = Object.getPrototypeOf(target) as object | null;
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return undefined;
  seen.add(target);
  const descriptors = Object.getOwnPropertyDescriptors(target);
  const children: ObjectSnapshot[] = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Reflect.get(descriptors, key) as PropertyDescriptor;
    if (!("value" in descriptor) || typeof descriptor.value === "function") return undefined;
    if (typeof descriptor.value === "object" && descriptor.value !== null) {
      const child = snapshotPlainTree(descriptor.value, seen);
      if (!child) return undefined;
      children.push(child);
    }
  }
  seen.delete(target);
  return { target, prototype, descriptors, children };
}

function unchanged(snapshot: ObjectSnapshot): boolean {
  const { target, prototype, descriptors, children } = snapshot;
  if (Object.getPrototypeOf(target) !== prototype) return false;
  const keys = Reflect.ownKeys(descriptors);
  if (Reflect.ownKeys(target).length !== keys.length) return false;
  for (const key of keys) {
    const before = Reflect.get(descriptors, key) as PropertyDescriptor;
    const after = Object.getOwnPropertyDescriptor(target, key);
    if (!after || after.value !== before.value || after.get !== before.get || after.set !== before.set
      || after.writable !== before.writable || after.enumerable !== before.enumerable || after.configurable !== before.configurable) return false;
  }
  return children.every(unchanged);
}

/** Inspect only values whose identities were already recorded, never an unknown cache value. */
function currentEntries(state: VariantLibrary): readonly (readonly [string, VariantRecord])[] | undefined {
  const entries: [string, VariantRecord][] = [];
  for (const [key, record] of state.records) {
    if (!Reflect.apply(mapHas, state.cache, [key])) {
      Reflect.apply(mapDelete, state.records, [key]);
      continue;
    }
    if (Reflect.apply(mapGet, state.cache, [key]) !== record.value || !unchanged(record.snapshot)) return undefined;
    entries.push([key, record]);
  }
  return Reflect.apply(mapSize, state.cache, []) === entries.length ? entries : undefined;
}

export function trustedVariantCacheIsValid(library: object, cache: Map<string, unknown>): boolean {
  const state = libraries.get(library);
  if (!state || state.cache !== cache || state.invalidated || state.inFlight) return false;
  try { return state.verify() && currentEntries(state) !== undefined; }
  catch { return false; }
}

/** Hooks below never alter ordinary compilation, even when verification fails. */
export function beginTrustedVariantCompile(library: object, name: unknown, variantName: unknown, options: unknown): object | undefined {
  const state = libraries.get(library);
  if (!state) return undefined;
  try {
    if (state.invalidated || state.inFlight || typeof name !== "string" || typeof variantName !== "string"
      || typeof options !== "object" || options === null || !trustedOptions.has(options) || !state.verify(name)) {
      state.invalidated = true;
      return undefined;
    }
    const entries = currentEntries(state);
    if (!entries) { state.invalidated = true; return undefined; }
    const token = {};
    state.inFlight = true;
    pending.set(token, { state, entries });
    return token;
  } catch {
    state.invalidated = true;
    return undefined;
  }
}

function takePending(token: object | undefined): PendingCompile | undefined {
  if (!token) return undefined;
  const operation = pending.get(token);
  if (operation) { pending.delete(token); operation.state.inFlight = false; }
  return operation;
}

function matchesPriorEntries(operation: PendingCompile, expectedSize: number): boolean {
  if (Reflect.apply(mapSize, operation.state.cache, []) !== expectedSize) return false;
  return operation.entries.every(([key, record]) => Reflect.apply(mapHas, operation.state.cache, [key])
    && Reflect.apply(mapGet, operation.state.cache, [key]) === record.value && unchanged(record.snapshot));
}

export function completeTrustedVariantHit(token: object | undefined, key: string, value: unknown): void {
  const operation = takePending(token);
  if (!operation) return;
  try {
    if (!operation.state.verify() || !matchesPriorEntries(operation, operation.entries.length)
      || !operation.entries.some(([priorKey, record]) => priorKey === key && record.value === value)) operation.state.invalidated = true;
  } catch { operation.state.invalidated = true; }
}

export function completeTrustedVariantCompile(token: object | undefined, key: string, value: unknown): void {
  const operation = takePending(token);
  if (!operation) return;
  try {
    if (typeof key !== "string" || typeof value !== "object" || value === null || !operation.state.verify()
      || operation.entries.some(([priorKey]) => priorKey === key)
      || !matchesPriorEntries(operation, operation.entries.length + 1)
      || Reflect.apply(mapGet, operation.state.cache, [key]) !== value) {
      operation.state.invalidated = true;
      return;
    }
    const snapshot = snapshotPlainTree(value);
    if (!snapshot) { operation.state.invalidated = true; return; }
    operation.state.records.set(key, { value, snapshot });
  } catch { operation.state.invalidated = true; }
}

export function abortTrustedVariantCompile(token: object | undefined): void {
  const operation = takePending(token);
  if (operation) operation.state.invalidated = true;
}
