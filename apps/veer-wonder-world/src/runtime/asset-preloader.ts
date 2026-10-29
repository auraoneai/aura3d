// Wonder World model preloader (PRD 04 B09).
//
// Before a story's scene is mounted, every model it needs (cast, props and the
// world dressing) is fetched from its same-origin URL with a timeout and, where
// Web Crypto is available, checked against the sha256 in src/aura-assets.ts.
// The engine loads all of a scene's GLBs together when it mounts, so one
// missing, corrupt or stuck file would otherwise hold or blank the whole
// scene. Anything that is not confirmed here is drawn as its primitive
// stand-in instead, so a missing or slow model never deadlocks the story.
// Fetched files also warm the browser cache for the engine's own load.
//
// prefetch() warms the next story in the background (current + next).

import { MODEL_INFO, models, modelRef, type ModelKey } from "../aura-assets.js";
import { CHARACTERS } from "../characters/character-registry.js";
import { worldDressingKeys } from "../scenes/worlds.js";
import type { StorySpec } from "../types.js";

export type ModelLoadStatus =
  /** Fetched and the sha256 matched. */
  | "ready"
  /** Fetched; no hash check was possible (no Web Crypto or no hash). */
  | "unverified"
  /** No admitted file for this key yet (generation still running). */
  | "not-admitted"
  /** Drawn from scene geometry by design (MODEL_INFO.procedural), never fetched. */
  | "procedural"
  /** Models are switched off (`?models=0`). */
  | "disabled"
  /** The server answered 404. */
  | "missing"
  | "hash-mismatch"
  | "timeout"
  | "error"
  /** Fetched, but mounting the scene with it failed; drawn as a stand-in for the rest of the session. */
  | "failed";

/** Statuses whose model may be mounted. */
export function isUsableStatus(status: ModelLoadStatus | undefined): boolean {
  return status === "ready" || status === "unverified";
}

/** Results that are retried on the next preload (a slow network may recover). */
function isRetryable(status: ModelLoadStatus): boolean {
  return status === "timeout" || status === "error";
}

export interface ModelSource {
  readonly url: string;
  readonly sha256?: string;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (url: string, init?: { readonly signal?: AbortSignal }) => Promise<FetchResponseLike>;

export interface AssetPreloaderOptions {
  readonly fetch?: FetchLike;
  /** Per-model timeout. Default 10000 ms. */
  readonly timeoutMs?: number;
  /** SHA-256 hex of the bytes; null skips the check. Default: Web Crypto when available. */
  readonly digest?: ((bytes: ArrayBuffer) => Promise<string>) | null;
  /** Models switched on. Default `models.enabled` (false with `?models=0`). */
  readonly enabled?: boolean;
  /** URL and hash of an admitted model. Default: the generated `modelRef(key)`. */
  readonly source?: (key: ModelKey) => ModelSource | undefined;
  /** Runs `callback` after `ms`; returns a cancel function. Default setTimeout. */
  readonly schedule?: (callback: () => void, ms: number) => () => void;
}

export interface PreloadResult {
  readonly status: ReadonlyMap<ModelKey, ModelLoadStatus>;
  /** Keys whose models may be mounted. */
  readonly available: ReadonlySet<ModelKey>;
}

export interface AssetPreloader {
  /** Fetches (and checks) every key; resolves once each one is settled or timed out. Never rejects. */
  preload(keys: readonly ModelKey[]): Promise<PreloadResult>;
  /** Background preload (for the next story); errors are swallowed. */
  prefetch(keys: readonly ModelKey[]): void;
  status(key: ModelKey): ModelLoadStatus | "pending" | "unknown";
  isAvailable(key: ModelKey): boolean;
  /** Records that models broke a scene mount after preload; they are drawn as stand-ins for the rest of the session. */
  markFailed(keys: readonly ModelKey[]): void;
  summary(): Readonly<Partial<Record<ModelLoadStatus, number>>>;
  dispose(): void;
}

function normalizeHash(value: string): string {
  return value.trim().toLowerCase().replace(/^sha256-/, "");
}

function hex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i += 1) out += (view[i] ?? 0).toString(16).padStart(2, "0");
  return out;
}

function defaultDigest(): ((bytes: ArrayBuffer) => Promise<string>) | null {
  const subtle = typeof globalThis.crypto !== "undefined" ? globalThis.crypto.subtle : undefined;
  if (!subtle) return null;
  return async (bytes) => hex(await subtle.digest("SHA-256", bytes));
}

function defaultFetch(): FetchLike | null {
  if (typeof globalThis.fetch !== "function") return null;
  return (url, init) => globalThis.fetch(url, init?.signal ? { signal: init.signal } : undefined);
}

function defaultSource(key: ModelKey): ModelSource | undefined {
  const ref = modelRef(key);
  if (!ref) return undefined;
  const hash = ref.sha256 ?? ref.hash;
  return hash ? { url: ref.url, sha256: hash } : { url: ref.url };
}

export function createAssetPreloader(options: AssetPreloaderOptions = {}): AssetPreloader {
  const fetchFn = options.fetch ?? defaultFetch();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const digest = options.digest === undefined ? defaultDigest() : options.digest;
  const enabled = options.enabled ?? models.enabled;
  const source = options.source ?? defaultSource;
  const schedule = options.schedule ?? ((callback: () => void, ms: number): (() => void) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  });
  const settled = new Map<ModelKey, ModelLoadStatus>();
  const inflight = new Map<ModelKey, Promise<ModelLoadStatus>>();
  let disposed = false;

  async function load(key: ModelKey): Promise<ModelLoadStatus> {
    if (MODEL_INFO[key].procedural) return "procedural";
    if (!enabled) return "disabled";
    const src = source(key);
    if (!src) return "not-admitted";
    if (!fetchFn) return "unverified";
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timedOut = false;
    let cancel: () => void = () => undefined;
    const timeout = new Promise<ModelLoadStatus>((resolve) => {
      cancel = schedule(() => {
        timedOut = true;
        controller?.abort();
        resolve("timeout");
      }, timeoutMs);
    });
    const work = (async (): Promise<ModelLoadStatus> => {
      try {
        const response = await fetchFn(src.url, controller ? { signal: controller.signal } : undefined);
        if (!response.ok) return response.status === 404 ? "missing" : "error";
        const bytes = await response.arrayBuffer();
        if (!digest || !src.sha256) return "unverified";
        const actual = await digest(bytes);
        return normalizeHash(actual) === normalizeHash(src.sha256) ? "ready" : "hash-mismatch";
      } catch {
        return timedOut ? "timeout" : "error";
      }
    })();
    const status = await Promise.race([work, timeout]);
    cancel();
    return status;
  }

  function start(key: ModelKey): Promise<ModelLoadStatus> {
    const known = settled.get(key);
    if (known !== undefined && !isRetryable(known)) return Promise.resolve(known);
    const running = inflight.get(key);
    if (running) return running;
    const promise = load(key).then((status) => {
      inflight.delete(key);
      if (!disposed) settled.set(key, status);
      return status;
    });
    inflight.set(key, promise);
    return promise;
  }

  return {
    async preload(keys) {
      const unique = [...new Set(keys)];
      const results = await Promise.all(unique.map(async (key) => [key, await start(key)] as const));
      const status = new Map<ModelKey, ModelLoadStatus>(results);
      const available = new Set<ModelKey>();
      for (const [key, value] of results) if (isUsableStatus(value)) available.add(key);
      return { status, available };
    },
    prefetch(keys) {
      for (const key of new Set(keys)) void start(key).catch(() => undefined);
    },
    status(key) {
      if (inflight.has(key)) return "pending";
      return settled.get(key) ?? "unknown";
    },
    isAvailable(key) {
      return isUsableStatus(settled.get(key));
    },
    markFailed(keys) {
      for (const key of keys) settled.set(key, "failed");
    },
    summary() {
      const out: Partial<Record<ModelLoadStatus, number>> = {};
      for (const value of settled.values()) out[value] = (out[value] ?? 0) + 1;
      return out;
    },
    dispose() {
      disposed = true;
      settled.clear();
      inflight.clear();
    }
  };
}

/** Model keys a story needs: its cast, its props (the bubble is procedural) and its world dressing. Stable order, no duplicates. */
export function storyModelKeys(story: StorySpec): readonly ModelKey[] {
  const keys: ModelKey[] = [];
  const add = (key: ModelKey): void => {
    if (!keys.includes(key)) keys.push(key);
  };
  for (const member of story.cast) add(CHARACTERS[member.id].modelKey);
  for (const prop of story.props) if (prop.asset !== "bubble") add(prop.asset);
  for (const key of worldDressingKeys(story.world)) add(key);
  return keys;
}

/** Keys of a story whose files are admitted (worth fetching). */
export function admittedKeys(keys: readonly ModelKey[]): readonly ModelKey[] {
  return keys.filter((key) => MODEL_INFO[key].admitted);
}
