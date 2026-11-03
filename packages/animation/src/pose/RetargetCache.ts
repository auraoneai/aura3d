/**
 * T3.8 (PRD-06 §7.2, R11) — IndexedDB retarget-bake cache. Entries are keyed by
 * `(formatVersion, engineVersion, sourceHash, targetHash, bakeOptions)` so an
 * engine rollback ignores caches written by another build. Store
 * "bakes" holds `{key → Map<string, CompiledClip>}`; typed arrays survive
 * structured-clone round-trips so clips are stored verbatim.
 */

import type { CompiledClip } from "./CompiledClip.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";
import type { BakeRetargetedClipsOptions } from "./Retarget.js";

/** Bump when the bake semantics change; older namespaces are simply never read. */
export const AURA3D_RETARGET_ENGINE_VERSION = "prd06-retarget/v2";

const DB_NAME = "aura3d-retarget";
const STORE = "bakes";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => {
      // The request may later succeed even though the caller already moved on.
      request.onsuccess = () => request.result.close();
      reject(new Error("IndexedDB open blocked"));
    };
  });
}

/** Exact, content-addressed identity of the skeleton fields used by baking. */
export function retargetSkeletonHash(skeleton: SkeletonBinding): string {
  const buffers = new WeakSet<object>([skeleton.restPose.positions, skeleton.restPose.rotations, skeleton.restPose.scales]);
  return canonicalHash({
    boneCount: skeleton.boneCount,
    jointNames: skeleton.jointNames,
    parentIndices: skeleton.parentIndices,
    jointNodeIndices: skeleton.jointNodeIndices,
    missingNodeIndices: skeleton.missingNodeIndices,
    jointIndicesByName: skeleton.jointIndicesByName,
    restPose: skeleton.restPose
  }, buffers);
}

/** Include every compiled field, precision sidecar, event, and event payload. */
export function retargetClipsHash(clips: ReadonlyMap<string, CompiledClip>): string {
  const trackBuffers = new WeakSet<object>();
  for (const clip of clips.values()) {
    for (const track of clip.tracks) {
      // Sampling only consumes numeric elements of direct track buffers; avoid
      // enumerating millions of typed-array indices merely to hash those bytes.
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(track))) {
        if ("value" in descriptor && ArrayBuffer.isView(descriptor.value)) trackBuffers.add(descriptor.value);
      }
    }
  }
  return canonicalHash(clips, trackBuffers);
}

/**
 * An unsafe payload/option throws; callers must bypass the cache and bake in
 * process. In particular functions, accessors, cycles, shared references and
 * unsupported host objects must never be silently dropped from the identity.
 */
export function retargetCacheKey(engineVersion: string, sourceHash: string, targetHash: string, options: BakeRetargetedClipsOptions = {}): string {
  return `${AURA3D_RETARGET_ENGINE_VERSION}|${canonicalHash([engineVersion, sourceHash, targetHash, options])}`;
}

/** Read a cached bake, or `undefined` when absent/unavailable. */
export async function readRetargetCache(key: string): Promise<ReadonlyMap<string, CompiledClip> | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  try {
    const db = await openDatabase();
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result instanceof Map ? request.result as ReadonlyMap<string, CompiledClip> : undefined);
        request.onerror = () => resolve(undefined);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

/** Write a bake; fire-and-forget safe (storage failures are ignored). */
export async function writeRetargetCache(key: string, clips: ReadonlyMap<string, CompiledClip>): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(clips, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    /* cache is best-effort */
  }
}

/** Canonical tagged encoding, hashed incrementally to avoid materializing animation buffers as strings. */
function canonicalHash(value: unknown, trackBuffers = new WeakSet<object>()): string {
  const hash = new Sha256();
  const encoder = new TextEncoder();
  const seen = new WeakSet<object>();
  const payloadBuffers = new WeakSet<object>();
  const frame = (tag: string, bytes: Uint8Array = new Uint8Array(0)): void => {
    const header = encoder.encode(`${tag}:${bytes.length}:`);
    hash.write(header);
    hash.write(bytes);
  };
  const stringBytes = (value: string): Uint8Array => {
    // UTF-16 code units retain lone surrogates rather than conflating them
    // through UTF-8's replacement-character conversion.
    const bytes = new Uint8Array(value.length * 2);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < value.length; index++) view.setUint16(index * 2, value.charCodeAt(index), false);
    return bytes;
  };
  const visit = (item: unknown): void => {
    if (item === null) { frame("null"); return; }
    if (item === undefined) { frame("undefined"); return; }
    if (typeof item === "string") { frame("string", stringBytes(item)); return; }
    if (typeof item === "boolean") { frame(item ? "true" : "false"); return; }
    if (typeof item === "bigint") { frame("bigint", encoder.encode(item.toString())); return; }
    if (typeof item === "number") {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, item, false);
      frame("number", bytes);
      return;
    }
    if (typeof item !== "object") throw new TypeError("Retarget cache identity contains an unsupported value.");
    if (seen.has(item)) throw new TypeError("Retarget cache identity contains cyclic or shared references.");
    seen.add(item);
    if (ArrayBuffer.isView(item)) {
      if (typeof SharedArrayBuffer !== "undefined" && item.buffer instanceof SharedArrayBuffer) {
        throw new TypeError("Retarget cache identity cannot use shared mutable buffers.");
      }
      if ((item.buffer as ArrayBuffer & { readonly resizable?: boolean }).resizable) {
        throw new TypeError("Retarget cache identity cannot use resizable buffers.");
      }
      if (!SUPPORTED_VIEW_PROTOTYPES.has(Object.getPrototypeOf(item)) || Object.getOwnPropertySymbols(item).length > 0) {
        throw new TypeError("Retarget cache identity cannot use custom typed-array properties.");
      }
      if (!trackBuffers.has(item)) {
        if (payloadBuffers.has(item.buffer)) throw new TypeError("Retarget cache identity cannot preserve aliased payload buffers.");
        payloadBuffers.add(item.buffer);
        const length = "length" in item && typeof item.length === "number" ? item.length : 0;
        if (length > 65_536) throw new TypeError("Retarget cache identity payload view is too large to inspect safely.");
        const keys = Object.getOwnPropertyNames(item);
        if (keys.length !== length || keys.some((key, index) => key !== String(index))) {
          throw new TypeError("Retarget cache identity cannot use custom typed-array properties.");
        }
      }
      const viewType = `view:${Object.prototype.toString.call(item)}`;
      if (trackBuffers.has(item)) {
        frame(viewType, new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
      } else {
        // A payload exposes its backing buffer and byte offset, not only the
        // viewed bytes. Those observable details must participate in identity.
        frame(viewType, encoder.encode(`${item.byteOffset},${item.byteLength}`));
        frame("view-buffer", new Uint8Array(item.buffer));
      }
      return;
    }
    if (item instanceof ArrayBuffer) {
      if ((item as ArrayBuffer & { readonly resizable?: boolean }).resizable) {
        throw new TypeError("Retarget cache identity cannot use resizable buffers.");
      }
      if (payloadBuffers.has(item)) throw new TypeError("Retarget cache identity cannot preserve aliased payload buffers.");
      payloadBuffers.add(item);
      if (Object.getPrototypeOf(item) !== ArrayBuffer.prototype || Object.getOwnPropertyNames(item).length > 0 || Object.getOwnPropertySymbols(item).length > 0) {
        throw new TypeError("Retarget cache identity cannot use custom buffer properties.");
      }
      frame("buffer", new Uint8Array(item)); return;
    }
    if (item instanceof Map) {
      if (Object.getPrototypeOf(item) !== Map.prototype || Object.getOwnPropertyNames(item).length > 0 || Object.getOwnPropertySymbols(item).length > 0) {
        throw new TypeError("Retarget cache identity cannot use custom map properties.");
      }
      frame("map", encoder.encode(String(item.size)));
      for (const [key, entry] of item) { visit(key); visit(entry); }
      return;
    }
    const prototype = Object.getPrototypeOf(item);
    if (!((Array.isArray(item) && prototype === Array.prototype) || prototype === Object.prototype) || Object.getOwnPropertySymbols(item).length > 0) {
      throw new TypeError("Retarget cache identity contains an unsupported object.");
    }
    const names = Object.getOwnPropertyNames(item);
    frame(Array.isArray(item) ? "array" : "object", encoder.encode(String(names.length)));
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(item, name)!;
      if (!("value" in descriptor)) throw new TypeError("Retarget cache identity cannot evaluate accessors.");
      const arrayLength = Array.isArray(item) && name === "length";
      if (arrayLength ? (descriptor.enumerable || descriptor.configurable || !descriptor.writable)
        : (!descriptor.enumerable || !descriptor.configurable || !descriptor.writable)) {
        throw new TypeError("Retarget cache identity cannot retain this property descriptor through structured clone.");
      }
      frame("key", stringBytes(name));
      visit(descriptor.value);
    }
  };
  visit(value);
  return hash.finish();
}

// SHA-256, as specified by FIPS 180-4. Streaming keeps the extra memory bounded
// even for large animation arrays; numeric typed-array bytes are hashed exactly.
class Sha256 {
  private readonly state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private readonly buffer = new Uint8Array(64);
  private used = 0;
  private length = 0;

  write(bytes: Uint8Array): void {
    this.length += bytes.length;
    for (let offset = 0; offset < bytes.length;) {
      const count = Math.min(64 - this.used, bytes.length - offset);
      this.buffer.set(bytes.subarray(offset, offset + count), this.used);
      this.used += count;
      offset += count;
      if (this.used === 64) { this.compress(); this.used = 0; }
    }
  }

  finish(): string {
    const length = this.length;
    this.write(new Uint8Array([0x80]));
    if (this.used > 56) this.write(new Uint8Array(64 - this.used));
    if (this.used < 56) this.write(new Uint8Array(56 - this.used));
    const end = new Uint8Array(8);
    const view = new DataView(end.buffer);
    view.setUint32(0, Math.floor(length / 0x20000000), false);
    view.setUint32(4, (length * 8) >>> 0, false);
    this.write(end);
    return Array.from(this.state, (word) => word.toString(16).padStart(8, "0")).join("");
  }

  private compress(): void {
    const w = new Uint32Array(64);
    const block = new DataView(this.buffer.buffer);
    for (let i = 0; i < 16; i++) w[i] = block.getUint32(i * 4, false);
    const rotate = (x: number, count: number) => (x >>> count) | (x << (32 - count));
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this.state as unknown as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + SHA256_CONSTANTS[i]! + w[i]!) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const result = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) this.state[i] = (this.state[i]! + result[i]!) >>> 0;
  }
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const SUPPORTED_VIEW_PROTOTYPES = new Set<object>([
  Int8Array.prototype, Uint8Array.prototype, Uint8ClampedArray.prototype,
  Int16Array.prototype, Uint16Array.prototype, Int32Array.prototype, Uint32Array.prototype,
  Float32Array.prototype, Float64Array.prototype, BigInt64Array.prototype, BigUint64Array.prototype, DataView.prototype
]);
