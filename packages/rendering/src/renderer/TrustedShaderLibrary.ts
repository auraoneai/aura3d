import { DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME, ShaderLibrary, type CompiledShaderSource } from "../ShaderLibraryCore";
import { ShaderPreprocessor } from "../ShaderPreprocessor";
import { registerTrustedVariantLibrary, trustedVariantCacheIsValid } from "./TrustedShaderVariants";

interface ObjectSnapshot {
  readonly target: object;
  readonly prototype: object | null;
  readonly descriptors: PropertyDescriptorMap;
  readonly children: readonly ObjectSnapshot[];
}

interface LibraryProof {
  readonly revision: number;
  readonly library: ObjectSnapshot;
  readonly preprocessor: ObjectSnapshot;
  readonly shaders: Map<string, object>;
  readonly shaderEntries: readonly (readonly [string, object, ObjectSnapshot])[];
  readonly chunks: Map<string, string>;
  readonly chunkEntries: readonly (readonly [string, string])[];
  readonly variantCache: Map<string, unknown>;
  readonly lineSource: CompiledShaderSource;
}

const libraryPrototype = snapshotDescriptors(ShaderLibrary.prototype);
const preprocessorPrototype = snapshotDescriptors(ShaderPreprocessor.prototype);
const originalGetRevision = ShaderLibrary.prototype.getRevision;
const originalCompileSource = ShaderLibrary.prototype.compileSource;
const mapGet = Map.prototype.get;
const mapHas = Map.prototype.has;
const mapEntries = Map.prototype.entries;
const mapSize = Object.getOwnPropertyDescriptor(Map.prototype, "size")!.get!;
const defaultLibraries = new WeakMap<ShaderLibrary, LibraryProof>();

function snapshotDescriptors(target: object): ObjectSnapshot {
  return { target, prototype: Object.getPrototypeOf(target) as object | null,
    descriptors: Object.getOwnPropertyDescriptors(target), children: [] };
}

/** Capture only ordinary data trees created by the built-in shader factory. */
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

function ownValue(target: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function copySource(source: CompiledShaderSource): CompiledShaderSource {
  return {
    label: source.label, marker: source.marker, vertex: source.vertex, fragment: source.fragment,
    ...(source.webgpu ? { webgpu: { vertex: source.webgpu.vertex, fragment: source.webgpu.fragment,
      ...(source.webgpu.storageBindings ? { storageBindings: source.webgpu.storageBindings.map((binding) => ({ ...binding })) } : {}) } } : {}),
    ...(source.portableBindings ? { portableBindings: source.portableBindings.map((binding) => ({ ...binding })) } : {})
  };
}

/** Only the built-in factory records an identity, after registering its sources. */
export function recordDefaultShaderLibrary(library: ShaderLibrary): void {
  try {
    if (defaultLibraries.has(library)) return;
    if (Object.getPrototypeOf(library) !== ShaderLibrary.prototype || !unchanged(libraryPrototype) || !unchanged(preprocessorPrototype)) return;
    const shaders = ownValue(library, "shaders"), chunks = ownValue(library, "chunks");
    const preprocessor = ownValue(library, "preprocessor"), variantCache = ownValue(library, "variantCache");
    if (!(shaders instanceof Map) || !(chunks instanceof Map) || !(variantCache instanceof Map)
      || !(preprocessor instanceof ShaderPreprocessor) || Object.getPrototypeOf(preprocessor) !== ShaderPreprocessor.prototype) return;
    const shaderEntries: [string, object, ObjectSnapshot][] = [];
    for (const [key, value] of Reflect.apply(mapEntries, shaders, []) as IterableIterator<[unknown, unknown]>) {
      if (typeof key !== "string" || typeof value !== "object" || value === null) return;
      const tree = snapshotPlainTree(value);
      if (!tree) return;
      shaderEntries.push([key, value, tree]);
    }
    const chunkEntries: [string, string][] = [];
    for (const [key, value] of Reflect.apply(mapEntries, chunks, []) as IterableIterator<[unknown, unknown]>) {
      if (typeof key !== "string" || typeof value !== "string") return;
      chunkEntries.push([key, value]);
    }
    const preprocessorSnapshot = snapshotDescriptors(preprocessor);
    const librarySnapshot = snapshotDescriptors(library);
    const revision = Reflect.apply(originalGetRevision, library, []) as number;
    const lineSource = copySource(Reflect.apply(originalCompileSource, library, [DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME]) as CompiledShaderSource);
    defaultLibraries.set(library, { revision, library: librarySnapshot, preprocessor: preprocessorSnapshot,
      shaders, shaderEntries, chunks, chunkEntries, variantCache, lineSource });
    registerTrustedVariantLibrary(library, variantCache, (shaderName) => {
      const proof = baseProof(library);
      return !!proof && (shaderName === undefined || Reflect.apply(mapHas, proof.shaders, [shaderName]));
    });
  } catch {
    // Ordinary custom/replaced libraries remain usable, but receive no proof.
  }
}

function baseProof(library: ShaderLibrary): LibraryProof | undefined {
  const proof = defaultLibraries.get(library);
  if (!proof) return undefined; // Identity check comes before inspecting an unknown object.
  try {
    if (!unchanged(libraryPrototype) || !unchanged(preprocessorPrototype) || !unchanged(proof.library) || !unchanged(proof.preprocessor)
      || Reflect.apply(originalGetRevision, library, []) !== proof.revision
      || Reflect.apply(mapSize, proof.shaders, []) !== proof.shaderEntries.length
      || Reflect.apply(mapSize, proof.chunks, []) !== proof.chunkEntries.length) return undefined;
    for (const [key, value, snapshot] of proof.shaderEntries) {
      if (!Reflect.apply(mapHas, proof.shaders, [key]) || Reflect.apply(mapGet, proof.shaders, [key]) !== value || !unchanged(snapshot)) return undefined;
    }
    for (const [key, value] of proof.chunkEntries) {
      if (!Reflect.apply(mapHas, proof.chunks, [key]) || Reflect.apply(mapGet, proof.chunks, [key]) !== value) return undefined;
    }
    return proof;
  } catch { return undefined; }
}

/** Replay cannot trust caller-modified variant-cache entries. */
export function isUnmodifiedDefaultShaderLibrary(library: ShaderLibrary): boolean {
  const proof = baseProof(library);
  return !!proof && trustedVariantCacheIsValid(library, proof.variantCache);
}

/** Return the factory-captured source after verifying the live library and
 * preprocessing methods. The copy cannot be altered through the library's maps. */
export function certifiedDefaultScreenLineSource(library: ShaderLibrary): CompiledShaderSource | undefined {
  const proof = baseProof(library);
  return proof ? copySource(proof.lineSource) : undefined;
}
