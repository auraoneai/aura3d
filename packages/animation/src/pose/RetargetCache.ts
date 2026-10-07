/**
 * T3.8 (PRD-06 §7.2, R11) — IndexedDB retarget-bake cache. Entries are keyed by
 * `(engineVersion, sourceHash, targetHash)` so an engine rollback ignores caches
 * written by a newer build (the key namespace changes with the version). Store
 * "bakes" holds `{key → Map<string, CompiledClip>}`; typed arrays survive
 * structured-clone round-trips so clips are stored verbatim.
 */

import type { CompiledClip } from "./CompiledClip.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";

/** Bump when the bake semantics change; older namespaces are simply never read. */
export const AURA3D_RETARGET_ENGINE_VERSION = "prd06-retarget/v1";

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
  });
}

/** Cache-key component: skeleton joint names + rest pose + clip identity. */
export function retargetSkeletonHash(skeleton: SkeletonBinding): string {
  const rest = skeleton.restPose;
  return fnv1a(
    `${skeleton.boneCount}|${skeleton.jointNames.join(",")}|${skeleton.parentIndices.join(",")}` +
      `|${floatDigest(rest.positions)}|${floatDigest(rest.rotations)}|${floatDigest(rest.scales)}`
  );
}

/** Cache-key component: clip names + durations + track count + key times. */
export function retargetClipsHash(clips: ReadonlyMap<string, CompiledClip>): string {
  let acc = "";
  for (const [name, clip] of clips) {
    const tracks = clip.tracks.map((t) => `${t.target}:${t.valueType}:${t.keyframeCount}:${t.times[0] ?? 0}-${t.times[t.keyframeCount - 1] ?? 0}`);
    acc += `${name}|${clip.duration}|${tracks.join(";")}\n`;
  }
  return fnv1a(acc);
}

export function retargetCacheKey(engineVersion: string, sourceHash: string, targetHash: string): string {
  return `${engineVersion}|${sourceHash}|${targetHash}`;
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
        request.onsuccess = () => resolve(request.result as ReadonlyMap<string, CompiledClip> | undefined);
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
      });
    } finally {
      db.close();
    }
  } catch {
    /* cache is best-effort */
  }
}

function floatDigest(values: Float32Array): string {
  // 64-bit-ish digest over rounded floats — cheap and stable across sessions.
  let h = 0;
  for (let i = 0; i < values.length; i += 1) {
    h = (h * 33 + Math.round(values[i]! * 4096)) | 0;
  }
  return h.toString(36);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
