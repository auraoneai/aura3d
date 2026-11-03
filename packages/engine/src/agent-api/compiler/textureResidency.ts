import type { GLTFTextureResidencyMip, TextureResidencyAdapter, TextureResidencyLease, TextureResidencySource } from "@aura3d/assets/gltf-runtime";
import type { RenderItem } from "@aura3d/rendering";
import type { TypedGLBActor } from "../../production-runtime/TypedGLBActor.js";

type Source = TextureResidencySource<GLTFTextureResidencyMip>;
type Adapter = TextureResidencyAdapter<GLTFTextureResidencyMip, object>;
type ActorSources = Pick<TypedGLBActor, "pipeline">;
type RetiringActor = ActorSources & { dispose(): void };
type Lease = TextureResidencyLease & { whenReleased(): Promise<void> };

interface ActorEntry {
  readonly leases: Map<object, { readonly source: Source; readonly lease: Lease }>;
  observed: boolean;
}

/** Actual device accounting, plus explicitly identified unmanaged sources. */
export interface AppTextureResidencySnapshot {
  readonly mode: "device-residency";
  readonly budgetBytes: number;
  readonly usedBytes: number;
  readonly residentBytes: number;
  readonly retiringBytes: number;
  readonly requestedBytes: number;
  readonly overBudget: boolean;
  readonly overBudgetBytes: number;
  readonly residentEntries: number;
  readonly evictedEntries: readonly string[];
  readonly loadingEntries: number;
  readonly unmanagedEntries: readonly string[];
  readonly errors: readonly string[];
}

/** Per-mount owner: device allocations are never stored on a shared Texture. */
export interface AppTextureResidency {
  trackActor(actor: ActorSources): void;
  /** Remove immediately from demand; dispose the actor only after this resolves. */
  untrackActor(actor: ActorSources): Promise<void>;
  /** Defer actor-owned texture disposal until its own device leases retire. */
  retireActor(actor: ActorSources & { dispose(): void }): void;
  beginFrame(): void;
  observeActor(actor: ActorSources, items: readonly RenderItem[], eye: readonly [number, number, number]): void;
  endFrame(): void;
  snapshot(): AppTextureResidencySnapshot;
  /** Subscribe to actual device binding changes, not planner estimates. */
  onChange(listener: () => void): () => void;
  dispose(): void;
  whenSettled(): Promise<void>;
}

export async function createAppTextureResidency(device: object, budgetBytes: number): Promise<AppTextureResidency> {
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 1) throw new Error("textureResidency.budgetBytes must be a positive safe integer");
  const make = (device as { createTextureResidencyAdapter?: () => Adapter }).createTextureResidencyAdapter;
  if (typeof make !== "function") throw new Error("TEXTURE_RESIDENCY_UNSUPPORTED: the selected device has no residency adapter");
  const adapter = make.call(device);
  const { TextureResidencyController } = await import("@aura3d/assets/gltf-runtime");
  const controller = new TextureResidencyController(adapter, { budgetBytes });
  const actors = new Map<ActorSources, ActorEntry>();
  const actorReleases = new WeakMap<ActorSources, Promise<void>>();
  const pendingActors = new Map<RetiringActor, Promise<void>>();
  const failedActorLeases = new Map<RetiringActor, unknown>();
  const actorFailures = new Map<RetiringActor, unknown>();
  const actorFailureWaiters = new Set<() => void>();
  const retiredActors = new WeakSet<RetiringActor>();
  const listeners = new Set<() => void>();
  let closed = false;
  let drained = false;
  const unsubscribeController = controller.onChange(() => {
    for (const listener of [...listeners]) listener();
  });

  const syncSources = (actor: ActorSources, entry: ActorEntry): void => {
    for (const [texture, source] of actor.pipeline.resources.textureResidencySources ?? []) {
      if (entry.leases.has(texture)) continue;
      const lease = controller.acquire(source, { distanceMeters: Number.MAX_SAFE_INTEGER, priority: -1 }) as Lease;
      entry.leases.set(texture, { source, lease });
    }
  };

  const disposeActor = (actor: RetiringActor): void => {
    if (retiredActors.has(actor)) return;
    // Actor disposal is one-shot, including when it partially throws.
    retiredActors.add(actor);
    try { actor.dispose(); }
    catch (error) {
      actorFailures.set(actor, error);
      for (const waiter of [...actorFailureWaiters]) waiter();
      throw error;
    }
  };

  const api: AppTextureResidency = {
    trackActor(actor) {
      if (closed) throw new Error("Texture residency owner is disposed");
      if (actors.has(actor)) return;
      const entry: ActorEntry = { leases: new Map(), observed: false };
      actorReleases.delete(actor);
      actors.set(actor, entry);
      // If a later registration fails, keep earlier leases owned so the
      // caller can retire the actor before disposing its logical textures.
      syncSources(actor, entry);
    },
    untrackActor(actor) {
      const previous = actorReleases.get(actor);
      if (previous) return previous;
      const entry = actors.get(actor);
      if (!entry) return Promise.resolve();
      let resolveRelease!: () => void;
      let rejectRelease!: (error: unknown) => void;
      const release = new Promise<void>((resolve, reject) => { resolveRelease = resolve; rejectRelease = reject; });
      // Publish before a lease's unpublication can reenter actor removal.
      actorReleases.set(actor, release);
      void release.catch(() => undefined);
      actors.delete(actor);
      const leases = [...entry.leases.values()].map(({ lease }) => lease);
      const failures: unknown[] = [];
      for (const lease of leases) {
        try { lease.release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) rejectRelease(cleanupFailure(failures));
      else {
        try { void Promise.all(leases.map((lease) => lease.whenReleased())).then(() => resolveRelease(), rejectRelease); }
        catch (error) { rejectRelease(error); }
      }
      return release;
    },
    retireActor(actor) {
      if (retiredActors.has(actor) || pendingActors.has(actor) || failedActorLeases.has(actor) || actorFailures.has(actor)) return;
      if (drained) { disposeActor(actor); return; }
      let release: Promise<void>;
      try { release = api.untrackActor(actor); }
      catch (error) {
        // An unexpected synchronous release failure has no retry contract.
        actorFailures.set(actor, error);
        for (const waiter of [...actorFailureWaiters]) waiter();
        return;
      }
      // A synchronous lease callback may already have adopted this actor.
      if (pendingActors.has(actor) || retiredActors.has(actor) || failedActorLeases.has(actor)) return;
      const pending = release.then(
        () => { disposeActor(actor); },
        (error: unknown) => {
          // Keep the actor itself, not just its error. A successful controller
          // teardown after retry is the proof needed to dispose it safely.
          failedActorLeases.set(actor, error);
        }
      );
      pendingActors.set(actor, pending);
      void pending.then(() => pendingActors.delete(actor), () => pendingActors.delete(actor));
    },
    beginFrame() { for (const entry of actors.values()) entry.observed = false; },
    observeActor(actor, items, eye) {
      const entry = actors.get(actor);
      if (!entry || closed) return;
      // Material variants can create new sources after the actor was mounted.
      syncSources(actor, entry);
      entry.observed = true;
      const distanceMeters = closestItemDistance(items, eye);
      for (const { lease } of entry.leases.values()) lease.updateDemand({ distanceMeters, priority: 0 });
    },
    endFrame() {
      for (const entry of actors.values()) if (!entry.observed) {
        for (const { lease } of entry.leases.values()) lease.updateDemand({ distanceMeters: Number.MAX_SAFE_INTEGER, priority: -1 });
      }
    },
    snapshot() {
      const current = controller.snapshot();
      const sources = new Map<object, Source>();
      const unmanaged = new Map<object, string>();
      for (const [actor, entry] of actors) {
        for (const [texture, value] of entry.leases) sources.set(texture, value.source);
        for (const [texture, reason] of actor.pipeline.resources.unmanagedTextureResidency ?? []) {
          unmanaged.set(texture, `${texture.label}: ${reason}`);
        }
      }
      let requestedBytes = 0;
      let overBudgetBytes = 0;
      const errors = current.error === undefined ? [] : [errorText(current.error)];
      for (const item of current.entries) {
        const source = sources.get(item.texture);
        if (item.error !== undefined) errors.push(`${item.label ?? "texture"}: ${errorText(item.error)}`);
        if (!source) continue;
        try {
          const requested = adapter.estimate(source, source.levels.length);
          const funded = item.desiredLevels ? adapter.estimate(source, item.desiredLevels) : 0;
          requestedBytes += requested;
          if (item.status !== "lost" && item.status !== "error") overBudgetBytes += Math.max(0, requested - funded);
        } catch (error) { errors.push(`${item.label ?? "texture"}: ${errorText(error)}`); }
      }
      return {
        mode: "device-residency",
        budgetBytes: current.budgetBytes, usedBytes: current.usedBytes,
        residentBytes: current.residentBytes, retiringBytes: current.retiringBytes,
        requestedBytes, overBudget: overBudgetBytes > 0, overBudgetBytes,
        residentEntries: current.entries.filter((entry) => entry.residentLevels > 0).length,
        evictedEntries: current.entries.filter((entry) => entry.consumers > 0 && entry.residentLevels === 0).map((entry) => entry.label ?? "texture"),
        loadingEntries: current.entries.filter((entry) => entry.status === "loading").length,
        unmanagedEntries: [...unmanaged.values()], errors
      };
    },
    onChange(listener) {
      if (closed) throw new Error("Texture residency owner is disposed");
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (drained) return;
      if (!closed) {
        closed = true;
        unsubscribeController();
        listeners.clear();
        // Keep actor-to-lease ownership while disposal fences are in flight:
        // a late actor removal must still join its own release receipt.
      }
      // A later renderer disposal is an explicit retry of unfinished work.
      controller.dispose();
    },
    async whenSettled() {
      if (!closed) throw new Error("Texture residency must be disposed before teardown can settle");
      if (actorFailures.size) throw cleanupFailure([...actorFailures.values()]);
      let reportActorFailure!: () => void;
      const actorFailure = new Promise<never>((_resolve, reject) => {
        reportActorFailure = () => reject(cleanupFailure([...actorFailures.values()]));
        actorFailureWaiters.add(reportActorFailure);
      });
      try {
        // Include actors retired after this wait starts: their failure must
        // not be held behind another source's unsignaled fence.
        await Promise.race([controller.whenDisposed(), actorFailure]);
        for (;;) {
          while (pendingActors.size) await Promise.race([Promise.all([...pendingActors.values()]), actorFailure]);
          if (!failedActorLeases.size) break;
          // Previously rejected lease receipts are immutable. Only the completed
          // controller teardown proves that their retained actors are now safe.
          for (const actor of [...failedActorLeases.keys()]) {
            failedActorLeases.delete(actor);
            try { disposeActor(actor); } catch { /* Report all one-shot failures below. */ }
          }
        }
        if (actorFailures.size) throw cleanupFailure([...actorFailures.values()]);
        drained = true;
        actors.clear();
      } finally {
        actorFailureWaiters.delete(reportActorFailure);
      }
    }
  };
  return api;
}

function closestItemDistance(items: readonly RenderItem[], eye: readonly [number, number, number]): number {
  let nearest = Number.MAX_SAFE_INTEGER;
  for (const item of items) {
    const m = item.modelMatrix;
    const instances = item.instanceTransforms;
    if (instances && instances.length >= 16) {
      for (let offset = 0; offset + 15 < instances.length; offset += 16) {
        const x = instances[offset + 12]!, y = instances[offset + 13]!, z = instances[offset + 14]!;
        const worldX = m ? m[0]! * x + m[4]! * y + m[8]! * z + m[12]! : x;
        const worldY = m ? m[1]! * x + m[5]! * y + m[9]! * z + m[13]! : y;
        const worldZ = m ? m[2]! * x + m[6]! * y + m[10]! * z + m[14]! : z;
        nearest = Math.min(nearest, Math.hypot(worldX - eye[0], worldY - eye[1], worldZ - eye[2]));
      }
    } else {
      nearest = Math.min(nearest, Math.hypot((m?.[12] ?? 0) - eye[0], (m?.[13] ?? 0) - eye[1], (m?.[14] ?? 0) - eye[2]));
    }
  }
  return Number.isFinite(nearest) ? nearest : Number.MAX_SAFE_INTEGER;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : error === undefined ? "pending resources" : String(error);
}

function cleanupFailure(errors: readonly unknown[]): unknown {
  const distinct = errors.filter((error, index) => errors.findIndex((other) => Object.is(other, error)) === index);
  return distinct.length === 1 ? distinct[0] : new AggregateError(distinct, "Texture residency actor cleanup failed", { cause: distinct[0] });
}
