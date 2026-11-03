/* §6.9 skip registry — shared by `renderer/PostprocessExecution` (CPU-pass
 * record-and-skip), `webgl2/LegacyPost` (v2-route degradations) and
 * `post/v2Stages` (HDR-stage degradations). Dependency-free, so the v2
 * drivers can record without importing the renderer barrel (import-cycle
 * safe); kept out of `post/` so PostprocessExecution has no static `post/`
 * import (§9 bundle gate, prd03-post-bundle-split). `postSections` folds these into `diagnostics().post.skipped`. */
import { postDiagnostics, type PostDiagnosticToken } from "./PostDiagnosticsScope";

// The no-token channel preserves the legacy helper API for direct callers.
// Renderer-owned frames use only their explicit per-view token.
const postSkippedReasonsSet = new Set<string>();
let selectiveBloomByCanvas = new WeakMap<object, string>();
let latestSelectiveBloomReason: string | undefined;

/** Per-canvas transient outcome: one app's successful frame cannot hide another's fallback. */
export function setSelectiveBloomSkipped(key: object, reason?: string): void {
  const value = reason ? `POST_SELECTIVE_BLOOM_UNAVAILABLE:${reason}` : undefined;
  if (value) selectiveBloomByCanvas.set(key, value);
  else selectiveBloomByCanvas.delete(key);
  latestSelectiveBloomReason = value;
}

export function recordPostSkipped(reason: string, token?: PostDiagnosticToken): void {
  if (token) postDiagnostics.recordSkipped(token, reason);
  else postSkippedReasonsSet.add(reason);
}

/**
 * Withdraws a transient reason once its condition has resolved (GU47: a
 * `LUT_PENDING:<url>` recorded while a `.cube` loads must not outlive the
 * load; the registry is otherwise cumulative for the page).
 */
export function clearPostSkipped(reason: string, token?: PostDiagnosticToken): void {
  if (token) postDiagnostics.clearSkipped(token, reason);
  else postSkippedReasonsSet.delete(reason);
}

/**
 * `canvas` (4.7.x) appends that canvas's selective-bloom outcome (or the most
 * recent one when omitted); `token` (native 5.0) reads the per-view scoped
 * registry instead of the legacy page-wide channel.
 */
export function postSkippedReasons(canvas?: object, token?: PostDiagnosticToken): readonly string[] {
  const base = token ? postDiagnostics.snapshotToken(token)?.skipped ?? [] : [...postSkippedReasonsSet];
  const bloom = canvas ? selectiveBloomByCanvas.get(canvas) : latestSelectiveBloomReason;
  return bloom ? [...base, bloom] : [...base];
}

/**
 * C-31 stage trace: the v2 HDR stages that executed on the most recent frame
 * (e.g. `S5:taa-history`, `S5:taa-seed`). Replaced per frame by
 * `beginPostStageTrace`; read through `diagnostics().post.stagesRan`.
 */
let postStagesRanList: string[] = [];

export function beginPostStageTrace(token?: PostDiagnosticToken): void {
  // begin() already starts a fresh per-view trace once per authored frame;
  // repeated passes keep the same token and append instead of erasing it.
  if (!token) postStagesRanList = [];
}

export function recordPostStage(stage: string, token?: PostDiagnosticToken): void {
  if (token) postDiagnostics.recordStage(token, stage);
  else postStagesRanList.push(stage);
}

export function postStagesRan(token?: PostDiagnosticToken): readonly string[] {
  return token ? postDiagnostics.snapshotToken(token)?.stagesRan ?? [] : [...postStagesRanList];
}

/** S5 writes belong to an exact renderer, view and authored frame. */
const taaHistoryWrites = new WeakMap<object, Map<string | number, Set<number>>>();
const postV2Presentations = new WeakMap<object, Map<string | number, Set<number>>>();

function markFrame(registry: WeakMap<object, Map<string | number, Set<number>>>, scopeId?: object, viewId?: string | number, frameId?: number): void {
  // A direct post-stage invocation without an identity cannot authorize a
  // renderer to promote history. It remains useful to render the output.
  if (!scopeId || viewId === undefined || !Number.isSafeInteger(frameId) || frameId! < 0) return;
  let views = registry.get(scopeId);
  if (!views) { views = new Map(); registry.set(scopeId, views); }
  let frames = views.get(viewId);
  if (!frames) { frames = new Set(); views.set(viewId, frames); }
  frames.add(frameId!);
}

function consumeFrame(registry: WeakMap<object, Map<string | number, Set<number>>>, scopeId?: object, viewId?: string | number, frameId?: number): boolean {
  if (!scopeId || viewId === undefined || !Number.isSafeInteger(frameId) || frameId! < 0) return false;
  const views = registry.get(scopeId);
  const frames = views?.get(viewId);
  const written = frames?.delete(frameId!) ?? false;
  if (frames?.size === 0) views!.delete(viewId);
  if (views?.size === 0) registry.delete(scopeId);
  return written;
}

export function markTaaHistoryWritten(scopeId?: object, viewId?: string | number, frameId?: number): void {
  markFrame(taaHistoryWrites, scopeId, viewId, frameId);
}

export function consumeTaaHistoryWritten(scopeId?: object, viewId?: string | number, frameId?: number): boolean {
  return consumeFrame(taaHistoryWrites, scopeId, viewId, frameId);
}

/** A completed v2 presentation can authorize only its own motion history. */
export function markPostV2Presented(scopeId?: object, viewId?: string | number, frameId?: number): void {
  markFrame(postV2Presentations, scopeId, viewId, frameId);
}

export function consumePostV2Presented(scopeId?: object, viewId?: string | number, frameId?: number): boolean {
  return consumeFrame(postV2Presentations, scopeId, viewId, frameId);
}

/** Retire abandoned markers when a view or its renderer is released. */
export function clearTaaHistoryWrites(scopeId: object, viewId?: string | number): void {
  for (const registry of [taaHistoryWrites, postV2Presentations]) {
    if (viewId === undefined) { registry.delete(scopeId); continue; }
    const views = registry.get(scopeId);
    views?.delete(viewId);
    if (views?.size === 0) registry.delete(scopeId);
  }
}

/**
 * Lifecycle hooks registered by the lazily loaded post graph. Keeping this
 * seam dependency-free lets a device retire resources synchronously without
 * importing the graph or allocating it for devices that never use it.
 */
export interface NativePostEffectLifecycle {
  /**
   * Optional shared cleanup identity. Registrations using the same identity
   * must each dispatch to the same owner, including its retired generations.
   */
  readonly cleanupOwner?: object;
  releaseView(scopeId: object, viewId: string | number): void;
  releaseScope(scopeId: object): void;
  dispose(): void;
}

type NativePostLifecycleRegistration = { readonly lifecycle: NativePostEffectLifecycle };
const entireScope = Symbol("entire-post-scope");
type ScopedPostCleanup = {
  readonly attempted: Map<object, WeakMap<object, Set<string | number | typeof entireScope>>>;
  readonly errors: unknown[];
};

interface NativePostLifecycleOwners {
  active?: NativePostLifecycleRegistration;
  readonly pending: Set<NativePostLifecycleRegistration>;
  disposing: boolean;
  scopedCleanup?: ScopedPostCleanup;
}

const nativePostLifecycles = new WeakMap<object, NativePostLifecycleOwners>();

export function registerNativePostEffectLifecycle(host: object, lifecycle: NativePostEffectLifecycle): void {
  let owners = nativePostLifecycles.get(host);
  if (!owners) {
    owners = { pending: new Set(), disposing: false };
    nativePostLifecycles.set(host, owners);
  }
  if (owners.disposing) {
    // The current host is already being retired. Queue a newly registered
    // generation for the same pass rather than leaving it silently active.
    owners.pending.add({ lifecycle });
    return;
  }
  if (owners.active?.lifecycle === lifecycle) return;
  if (owners.active) owners.pending.add(owners.active);
  owners.active = { lifecycle };
}

export function releaseNativePostEffectViewForHost(host: object, scopeId: object, viewId: string | number): void {
  releaseNativePostLifecycle(host, scopeId, viewId, lifecycle => lifecycle.releaseView(scopeId, viewId));
}

export function releaseNativePostEffectScopeForHost(host: object, scopeId: object): void {
  releaseNativePostLifecycle(host, scopeId, entireScope, lifecycle => lifecycle.releaseScope(scopeId));
}

function releaseNativePostLifecycle(
  host: object, scopeId: object, key: string | number | typeof entireScope,
  release: (lifecycle: NativePostEffectLifecycle) => void
): void {
  const owners = nativePostLifecycles.get(host);
  if (!owners) return;
  const outermost = !owners.scopedCleanup;
  const cleanup: ScopedPostCleanup = owners.scopedCleanup ?? { attempted: new Map(), errors: [] };
  owners.scopedCleanup = cleanup;
  const lifecycles = new Map<object, NativePostEffectLifecycle>();
  if (owners.active) {
    const lifecycle = owners.active.lifecycle;
    lifecycles.set(lifecycle.cleanupOwner ?? lifecycle, lifecycle);
  }
  if (!owners.disposing) for (const { lifecycle } of owners.pending) {
    const key = lifecycle.cleanupOwner ?? lifecycle;
    if (!lifecycles.has(key)) lifecycles.set(key, lifecycle);
  }
  try {
    for (const [owner, lifecycle] of lifecycles) {
      let scopes = cleanup.attempted.get(owner);
      if (!scopes) { scopes = new WeakMap(); cleanup.attempted.set(owner, scopes); }
      let keys = scopes.get(scopeId);
      if (!keys) { keys = new Set(); scopes.set(scopeId, keys); }
      if (keys.has(key)) continue;
      keys.add(key);
      try { release(lifecycle); } catch (error) { cleanup.errors.push(error); }
    }
  } finally {
    if (outermost) owners.scopedCleanup = undefined;
  }
  if (outermost && cleanup.errors.length === 1) throw cleanup.errors[0];
  if (outermost && cleanup.errors.length) throw new AggregateError(cleanup.errors, "Native post lifecycle release failed");
}

export function disposeNativePostEffectsForHost(host: object): void {
  const owners = nativePostLifecycles.get(host);
  if (!owners) return;
  if (owners.active) {
    owners.pending.add(owners.active);
    owners.active = undefined;
  }
  if (owners.disposing) return;
  owners.disposing = true;
  const errors: unknown[] = [];
  const attempted = new Set<object>();
  try {
    for (const registration of owners.pending) {
      const { lifecycle } = registration;
      const owner = lifecycle.cleanupOwner ?? lifecycle;
      if (attempted.has(owner)) continue;
      attempted.add(owner);
      // Only retire registrations that existed when the callback began; a
      // reentrant registration may represent newly created resources.
      const cohort = [...owners.pending].filter(entry => (entry.lifecycle.cleanupOwner ?? entry.lifecycle) === owner);
      try {
        lifecycle.dispose();
        for (const entry of cohort) owners.pending.delete(entry);
      } catch (error) { errors.push(error); }
    }
  } finally {
    owners.disposing = false;
    if (!owners.active && owners.pending.size === 0) nativePostLifecycles.delete(host);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, "Native post lifecycle disposal failed");
  if (owners.pending.size) {
    // A callback can register the same owner again while it is in flight.
    // Do not invoke it twice in this attempt, but do not report completion.
    throw new Error("Native post lifecycle disposal deferred by reentrant registration");
  }
}

/** Test hook — clears the §6.9 skip registry. */
export function resetPostSkipped(): void {
  postSkippedReasonsSet.clear();
  selectiveBloomByCanvas = new WeakMap<object, string>();
  latestSelectiveBloomReason = undefined;
}

/** `import.meta.env.PROD` / `process.env.NODE_ENV === "production"`. */
export function postProductionBuild(): boolean {
  const meta = import.meta as unknown as { readonly env?: { readonly PROD?: boolean } };
  if (meta.env?.PROD) return true;
  return (globalThis as { readonly process?: { readonly env?: { readonly NODE_ENV?: string } } })
    .process?.env?.NODE_ENV === "production";
}
