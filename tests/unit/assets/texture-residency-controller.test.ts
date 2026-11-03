import { describe, expect, it } from "vitest";
import {
  TextureResidencyController,
  type TextureResidencyAdapter,
  type TextureResidencyLoadedMip,
  type TextureResidencyMip,
  type TextureResidencySource
} from "../../../packages/assets/src/TextureResidencyController";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function ticks(count = 20): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

type Native = {
  readonly id: number;
  readonly bytes: number;
  readonly levels: readonly number[];
  readonly pixels: readonly Uint8Array[];
  destroyed: boolean;
};

/** Byte-backed allocation, exact reservation and controllable queue fences. */
class DeviceAdapter implements TextureResidencyAdapter<Uint8Array, Native> {
  readonly device = {};
  readonly fallbacks = new Map<object, Uint8Array>();
  readonly retiringFallbacks = new Set<Uint8Array>();
  readonly fallbackFences = new Map<Uint8Array, ReturnType<typeof deferred<void>>>();
  readonly limits = new Set<{ value: number }>();
  readonly unprepared: object[] = [];
  fallbackAllowance = 4;
  readonly published = new Map<object, Native>();
  readonly allocations = new Set<Native>();
  readonly uploads: Native[] = [];
  readonly publications: { readonly texture: object; readonly levels: readonly number[] | null }[] = [];
  readonly retired: Native[] = [];
  readonly lossListeners = new Set<() => void>();
  readonly restoreListeners = new Set<() => void>();
  readonly fences = new Map<Native, ReturnType<typeof deferred<void>>>();
  readonly blockedUploads = new Map<Native, ReturnType<typeof deferred<void>>>();
  generationValue = 1;
  lost = false;
  externalBytes = 0;
  formatMultiplier = 1;
  holdFences = false;
  holdFallbackFences = false;
  holdNextUpload = false;
  failNextUpload = false;
  failNextPublish = false;
  failNextPrepare = false;
  failNextUnprepare = false;
  onPublish?: () => void;
  nextId = 0;

  generation(): number { return this.generationValue; }
  isLost(): boolean { return this.lost; }
  acquireBudgetLimit(maxBytes: number): { setLimit(maxBytes: number): void; release(): void } {
    const record = { value: maxBytes };
    this.limits.add(record);
    return {
      setLimit: (bytes) => { if (!this.limits.has(record)) throw new Error("limit released"); record.value = bytes; },
      release: () => { this.limits.delete(record); }
    };
  }
  reserveExternal(bytes: number): void {
    const limit = Math.min(Infinity, ...[...this.limits].map((item) => item.value));
    if (this.usageBytes() + bytes > limit) throw new Error("device budget exceeded");
    this.externalBytes += bytes;
  }
  usageBytes(): number {
    return this.externalBytes + (this.fallbacks.size + this.retiringFallbacks.size) * 4 + [...this.allocations].filter((allocation) => !allocation.destroyed).reduce((sum, allocation) => sum + allocation.bytes, 0);
  }
  estimate(source: TextureResidencySource<Uint8Array>, count: number): number {
    return source.levels.slice(-count).reduce((sum, level) => sum + level.bytes * this.formatMultiplier, 0);
  }
  prepare(source: TextureResidencySource<Uint8Array>, options: { readonly maxBytes: number; readonly generation: number }): void {
    if (this.lost || options.generation !== this.generationValue) throw new Error("stale device generation");
    if (this.failNextPrepare) { this.failNextPrepare = false; throw new Error("fallback preparation failed"); }
    if (this.fallbacks.has(source.texture)) throw new Error("fallback already registered");
    const limit = Math.min(options.maxBytes, ...[...this.limits].map((item) => item.value));
    if (this.usageBytes() + 4 > limit) throw new Error("fallback exceeds budget");
    this.fallbacks.set(source.texture, new Uint8Array(source.fallback));
  }
  allocate(source: TextureResidencySource<Uint8Array>, levels: readonly { readonly level: number; readonly value: Uint8Array }[], options: { readonly maxBytes: number; readonly signal: AbortSignal }): Promise<{ allocation: Native; bytes: number }> {
    const bytes = this.estimate(source, levels.length);
    const limit = Math.min(options.maxBytes, ...[...this.limits].map((item) => item.value));
    if (this.usageBytes() + bytes > limit) return Promise.reject(new Error("device budget exceeded"));
    const expected = source.levels.map((_, index) => index).slice(-levels.length);
    if (levels.some((level, index) => level.level !== expected[index] || level.value.byteLength !== source.levels[level.level]!.bytes)) {
      return Promise.reject(new Error("invalid uploaded mip tail"));
    }
    const allocation: Native = {
      id: ++this.nextId, bytes, levels: levels.map((level) => level.level),
      pixels: levels.map((level) => new Uint8Array(level.value)), destroyed: false
    };
    // Reservation is in the authoritative ledger before this method returns.
    this.allocations.add(allocation);
    this.uploads.push(allocation);
    if (this.failNextUpload) {
      this.failNextUpload = false;
      this.destroy(allocation);
      return Promise.reject(new Error("upload failed"));
    }
    if (this.holdNextUpload) {
      this.holdNextUpload = false;
      const hold = deferred<void>();
      this.blockedUploads.set(allocation, hold);
      // Intentionally ignore cancellation to exercise late ownership transfer.
      return hold.promise.then(() => ({ allocation, bytes }));
    }
    return Promise.resolve({ allocation, bytes });
  }
  publish(texture: object, allocation: Native | null, generation: number): void {
    if (this.lost || generation !== this.generationValue) throw new Error("stale device generation");
    if (this.failNextPublish) { this.failNextPublish = false; throw new Error("binding switch failed"); }
    if (allocation) {
      if (allocation.destroyed) throw new Error("cannot publish destroyed texture");
      this.published.set(texture, allocation);
    } else this.published.delete(texture);
    this.publications.push({ texture, levels: allocation?.levels ?? null });
    this.onPublish?.();
  }
  retire(allocation: Native): Promise<void> {
    if (allocation.destroyed) return Promise.resolve();
    if (this.retired.includes(allocation)) throw new Error("allocation retired twice");
    this.retired.push(allocation);
    if (!this.holdFences) { this.destroy(allocation); return Promise.resolve(); }
    const hold = deferred<void>();
    this.fences.set(allocation, hold);
    return hold.promise;
  }
  unprepare(source: TextureResidencySource<Uint8Array>, generation: number): Promise<void> {
    if (this.lost || generation !== this.generationValue) throw new Error("stale device generation");
    if (this.failNextUnprepare) { this.failNextUnprepare = false; throw new Error("fallback unprepare failed"); }
    const fallback = this.fallbacks.get(source.texture);
    if (!fallback) throw new Error("fallback is not registered");
    this.unprepared.push(source.texture);
    this.fallbacks.delete(source.texture);
    if (this.holdFallbackFences) {
      const hold = deferred<void>();
      this.retiringFallbacks.add(fallback);
      this.fallbackFences.set(fallback, hold);
      return hold.promise.then(() => { this.retiringFallbacks.delete(fallback); });
    }
    return Promise.resolve();
  }
  completeFallbackFence(fallback: Uint8Array): void {
    const hold = this.fallbackFences.get(fallback);
    if (!hold) throw new Error("missing fallback fence");
    this.fallbackFences.delete(fallback);
    hold.resolve();
  }
  failFallbackFence(fallback: Uint8Array): void {
    const hold = this.fallbackFences.get(fallback);
    if (!hold) throw new Error("missing fallback fence");
    this.fallbackFences.delete(fallback);
    hold.reject(new Error("fallback fence failed"));
  }
  completeFence(allocation: Native): void {
    const hold = this.fences.get(allocation);
    if (!hold) throw new Error("missing fence");
    this.fences.delete(allocation);
    this.destroy(allocation);
    hold.resolve();
  }
  failFence(allocation: Native): void {
    const hold = this.fences.get(allocation);
    if (!hold) throw new Error("missing fence");
    this.fences.delete(allocation);
    hold.reject(new Error("fence failed"));
  }
  onDeviceLost(listener: () => void): () => void { this.lossListeners.add(listener); return () => this.lossListeners.delete(listener); }
  onDeviceRestored(listener: () => void): () => void { this.restoreListeners.add(listener); return () => this.restoreListeners.delete(listener); }
  lose(): void {
    this.lost = true;
    this.generationValue += 1;
    this.published.clear();
    this.fallbacks.clear();
    for (const fence of this.fallbackFences.values()) fence.resolve();
    this.fallbackFences.clear();
    this.retiringFallbacks.clear();
    for (const allocation of this.allocations) this.destroy(allocation);
    for (const fence of this.fences.values()) fence.resolve();
    this.fences.clear();
    for (const listener of [...this.lossListeners]) listener();
  }
  restore(): void { this.lost = false; for (const listener of [...this.restoreListeners]) listener(); }
  private destroy(allocation: Native): void { allocation.destroyed = true; }
}

/** Budgets in the tests describe available mip bytes, plus explicit fallback capacity. */
class TestController extends TextureResidencyController<Uint8Array, Native> {
  constructor(private readonly testAdapter: DeviceAdapter, options: { readonly budgetBytes: number }) {
    super(testAdapter, { budgetBytes: options.budgetBytes + testAdapter.fallbackAllowance });
  }
  override setBudget(bytes: number): void { super.setBudget(bytes + this.testAdapter.fallbackAllowance); }
}

function makeSource(options: {
  readonly texture?: object;
  readonly identity?: object;
  readonly label?: string;
  readonly fallback?: readonly [number, number, number, number];
  readonly levels?: readonly TextureResidencyMip[];
  readonly load?: (level: number, signal: AbortSignal) => Promise<TextureResidencyLoadedMip<Uint8Array>>;
} = {}) {
  const levels = options.levels ?? [
    { width: 4, height: 4, bytes: 64 }, { width: 2, height: 2, bytes: 16 }, { width: 1, height: 1, bytes: 4 }
  ];
  const loaded: number[] = [];
  const released: number[] = [];
  const source: TextureResidencySource<Uint8Array> = {
    texture: options.texture ?? {}, identity: options.identity ?? {}, label: options.label ?? "same-label", levels,
    fallback: options.fallback ?? [255, 255, 255, 255],
    async loadMip(level, signal) {
      loaded.push(level);
      if (options.load) return options.load(level, signal);
      return { value: new Uint8Array(levels[level]!.bytes).fill(level + 1), release: () => { released.push(level); } };
    }
  };
  return { source, loaded, released };
}

describe("device texture residency controller", () => {
  it("settles a shared consumer independently while the final consumer waits for both fences", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const first = controller.acquire(fixture.source, { distanceMeters: 0 });
    const second = controller.acquire(fixture.source, { distanceMeters: 1 });
    await controller.whenSettled();
    const resident = adapter.published.get(fixture.source.texture)!;
    const fallback = adapter.fallbacks.get(fixture.source.texture)!;
    const firstDone = first.whenReleased();
    first.release();
    await firstDone;
    expect(adapter.published.get(fixture.source.texture)).toBe(resident);
    adapter.holdFences = true;
    adapter.holdFallbackFences = true;
    let done = false;
    const secondDone = second.whenReleased().then(() => { done = true; });
    second.release();
    expect(adapter.published.has(fixture.source.texture)).toBe(false);
    expect(adapter.fences.has(resident)).toBe(true);
    await ticks();
    expect(done).toBe(false);
    adapter.completeFence(resident);
    await ticks();
    expect(done).toBe(false);
    expect(adapter.fallbackFences.has(fallback)).toBe(true);
    adapter.completeFallbackFence(fallback);
    await secondDone;
    expect(adapter.usageBytes()).toBe(0);
    first.release(); second.release();
    controller.dispose();
    await controller.whenSettled();
  });

  it("does not make one source's release wait for an unrelated source's fence", async () => {
    const first = makeSource(), second = makeSource();
    const adapter = new DeviceAdapter();
    adapter.fallbackAllowance = 8;
    const controller = new TestController(adapter, { budgetBytes: 8 });
    const a = controller.acquire(first.source, { distanceMeters: 0 });
    const b = controller.acquire(second.source, { distanceMeters: 1 });
    await controller.whenSettled();
    const pendingResident = adapter.published.get(second.source.texture)!;
    adapter.holdFences = true;
    b.release();
    let otherDone = false;
    const otherRelease = b.whenReleased().then(() => { otherDone = true; });
    adapter.holdFences = false;
    a.release();
    await a.whenReleased();
    expect(otherDone).toBe(false);
    expect(adapter.fences.has(pendingResident)).toBe(true);
    adapter.completeFence(pendingResident);
    await otherRelease;
    controller.dispose();
    await controller.whenSettled();
  });

  it("waits for a cancelled late load and releases its CPU data before the final lease settles", async () => {
    const gate = deferred<TextureResidencyLoadedMip<Uint8Array>>();
    let releasedMip = false;
    let observedSignal!: AbortSignal;
    const fixture = makeSource({ load: async (_level, signal) => { observedSignal = signal; return gate.promise; } });
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const abort = new AbortController();
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 }, abort.signal);
    await ticks();
    let settled = false;
    const releaseDone = lease.whenReleased().then(() => { settled = true; });
    abort.abort();
    expect(observedSignal.aborted).toBe(true);
    await ticks();
    expect(settled).toBe(false);
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(true);
    gate.resolve({ value: new Uint8Array(4), release() { releasedMip = true; } });
    await releaseDone;
    expect(releasedMip).toBe(true);
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("waits for a late upload and its retirement before releasing the final source", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    adapter.holdNextUpload = true;
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await ticks();
    const upload = adapter.uploads[0]!;
    adapter.holdFences = true;
    let settled = false;
    const releaseDone = lease.whenReleased().then(() => { settled = true; });
    lease.release();
    adapter.blockedUploads.get(upload)!.resolve();
    await ticks();
    expect(adapter.fences.has(upload)).toBe(true);
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(true);
    expect(settled).toBe(false);
    adapter.completeFence(upload);
    await releaseDone;
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("settles a prior final release when a new consumer pins the same source", async () => {
    const gate = deferred<TextureResidencyLoadedMip<Uint8Array>>();
    let calls = 0;
    const fixture = makeSource({ load: async () => {
      calls += 1;
      return calls === 1 ? gate.promise : { value: new Uint8Array(4), release() {} };
    } });
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const old = controller.acquire(fixture.source, { distanceMeters: 0 });
    await ticks();
    const oldDone = old.whenReleased();
    old.release();
    const replacement = controller.acquire(fixture.source, { distanceMeters: 0 });
    await oldDone;
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(true);
    gate.resolve({ value: new Uint8Array(4), release() {} });
    await controller.whenSettled();
    replacement.release();
    await replacement.whenReleased();
    controller.dispose();
    await controller.whenSettled();
  });

  it("settles a final lease after confirmed device loss without waiting for a dead GPU fence", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    adapter.holdFences = true;
    const releaseDone = lease.whenReleased();
    lease.release();
    adapter.lose();
    await releaseDone;
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("does not treat a loss flag as proof that native cleanup has completed", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    adapter.lost = true;
    let settled = false;
    const done = lease.whenReleased().then(() => { settled = true; });
    lease.release();
    await ticks();
    expect(settled).toBe(false);
    expect(adapter.usageBytes()).toBe(8);
    adapter.lose();
    await done;
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("rejects per-lease completion when CPU or GPU cleanup fails", async () => {
    const gate = deferred<TextureResidencyLoadedMip<Uint8Array>>();
    const cpuFixture = makeSource({ load: async () => gate.promise });
    const firstAdapter = new DeviceAdapter();
    const firstController = new TestController(firstAdapter, { budgetBytes: 4 });
    const cpuLease = firstController.acquire(cpuFixture.source, { distanceMeters: 0 });
    await ticks();
    cpuLease.release();
    const cpuDone = cpuLease.whenReleased();
    gate.resolve({ value: new Uint8Array(4), release() { throw new Error("CPU cleanup failed"); } });
    await expect(cpuDone).rejects.toThrow("CPU cleanup failed");
    firstController.dispose();
    await firstController.whenSettled();

    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const resident = adapter.published.get(fixture.source.texture)!;
    adapter.holdFences = true;
    lease.release();
    const done = lease.whenReleased();
    adapter.failFence(resident);
    await expect(done).rejects.toThrow("fence failed");
    expect(adapter.usageBytes()).toBe(8);
    adapter.lose();
    controller.dispose();
    await controller.whenSettled();
  });

  it("rejects the final lease if the fallback fence fails and retains its device charge", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const fallback = adapter.fallbacks.get(fixture.source.texture)!;
    adapter.holdFallbackFences = true;
    lease.release();
    const done = lease.whenReleased();
    await ticks();
    expect(adapter.fallbackFences.has(fallback)).toBe(true);
    adapter.failFallbackFence(fallback);
    await expect(done).rejects.toThrow("fallback fence failed");
    expect(adapter.usageBytes()).toBe(4);
    adapter.lose();
    controller.dispose();
    await controller.whenSettled();
  });

  it("reports binding changes and device transitions, and unsubscribes on disposal", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const observations: string[] = [];
    const unsubscribe = controller.onChange(() => {
      observations.push(adapter.isLost() ? "lost" : adapter.published.has(fixture.source.texture) ? "resident" : "fallback");
    });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    expect(observations).toEqual(["resident"]);
    adapter.lose();
    adapter.restore();
    await controller.whenSettled();
    expect(observations).toEqual(["resident", "lost", "fallback", "resident"]);
    unsubscribe(); unsubscribe();
    lease.release();
    await lease.whenReleased();
    expect(observations).toHaveLength(4);
    let afterDispose = 0;
    controller.onChange(() => { afterDispose += 1; });
    controller.dispose();
    adapter.lose();
    await controller.whenSettled();
    expect(afterDispose).toBe(0);
  });

  it("enforces a mutable device-wide budget lease without changing other owners' limits", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    adapter.reserveExternal(4);
    expect(() => adapter.reserveExternal(1)).toThrow(/budget/);
    await controller.whenSettled();
    expect(adapter.published.has(fixture.source.texture)).toBe(false);
    controller.setBudget(8);
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.levels).toEqual([2]);
    controller.setBudget(0);
    expect(() => adapter.reserveExternal(1)).toThrow(/budget/);
    const otherLimit = adapter.acquireBudgetLimit(3);
    lease.release();
    await lease.whenReleased();
    controller.dispose();
    expect(() => adapter.reserveExternal(1)).toThrow(/budget/);
    otherLimit.release();
    adapter.reserveExternal(100);
    await controller.whenSettled();
  });

  it("installs the semantic fallback before acquire returns and rolls back failed preparation", async () => {
    const adapter = new DeviceAdapter();
    const controller = new TextureResidencyController(adapter, { budgetBytes: 3 });
    const fixture = makeSource({ fallback: [128, 128, 255, 255] });
    expect(() => controller.acquire(fixture.source, { distanceMeters: 0 })).toThrow(/fallback exceeds budget/);
    expect(adapter.fallbacks.size).toBe(0);
    expect(controller.snapshot().entries).toHaveLength(0);
    controller.setBudget(8);
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    expect([...adapter.fallbacks.get(fixture.source.texture)!]).toEqual([128, 128, 255, 255]);
    expect(adapter.usageBytes()).toBe(4);
    expect(adapter.uploads).toHaveLength(0);
    expect(() => controller.acquire({ ...fixture.source, fallback: [255, 255, 255, 255] }, { distanceMeters: 0 })).toThrow(/fallback/);
    await controller.whenSettled();
    lease.release();
    await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("uploads coarse first, replaces real bytes in GPU mip order, evicts and reloads", async () => {
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const fixture = makeSource();
    const lease = controller.acquire(fixture.source, { distanceMeters: 1 });
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toMatchObject({ levels: [2], bytes: 4 });
    expect(fixture.loaded).toEqual([2]);
    expect(controller.snapshot()).toMatchObject({ usedBytes: 8, residentBytes: 4, retiringBytes: 0 });

    controller.setBudget(88);
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toMatchObject({ levels: [0, 1, 2], bytes: 84 });
    expect(fixture.loaded.slice(1)).toEqual([2, 1, 2, 1, 0]);
    expect(adapter.publications.filter((event) => event.levels !== null).map((event) => event.levels))
      .toEqual([[2], [1, 2], [0, 1, 2]]);
    expect(adapter.published.get(fixture.source.texture)!.pixels.map((pixels) => pixels[0])).toEqual([1, 2, 3]);
    expect(controller.snapshot().usedBytes).toBe(88);

    controller.setBudget(20);
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toMatchObject({ levels: [1, 2], bytes: 20 });
    controller.setBudget(0);
    await controller.whenSettled();
    expect(adapter.published.has(fixture.source.texture)).toBe(false);
    expect(controller.snapshot()).toMatchObject({ usedBytes: 4, residentBytes: 0 });
    controller.setBudget(84);
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.levels).toEqual([0, 1, 2]);
    lease.release(); lease.release();
    await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    expect(fixture.released).toHaveLength(fixture.loaded.length);
    controller.dispose();
    await controller.whenSettled();
  });

  it("coalesces shared consumers, isolates duplicate labels and follows their current demands", async () => {
    const adapter = new DeviceAdapter();
    adapter.fallbackAllowance = 8;
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const near = makeSource(), far = makeSource();
    const first = controller.acquire(near.source, { distanceMeters: 1 });
    const second = controller.acquire(near.source, { distanceMeters: 40 });
    const distant = controller.acquire(far.source, { distanceMeters: 10 });
    await controller.whenSettled();
    expect(controller.snapshot().entries).toHaveLength(2);
    expect(adapter.published.has(near.source.texture)).toBe(true);
    expect(adapter.published.has(far.source.texture)).toBe(false);
    first.release();
    await controller.whenSettled();
    expect(adapter.published.has(near.source.texture)).toBe(false);
    expect(adapter.published.has(far.source.texture)).toBe(true);
    second.updateDemand({ distanceMeters: 100, priority: 3 });
    await controller.whenSettled();
    expect(adapter.published.has(near.source.texture)).toBe(true);
    expect(adapter.published.has(far.source.texture)).toBe(false);
    second.release(); distant.release();
    await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("publishes every funded coarse mip before refining either texture", async () => {
    const near = makeSource(), far = makeSource();
    const adapter = new DeviceAdapter();
    adapter.fallbackAllowance = 8;
    adapter.holdNextUpload = true;
    const controller = new TestController(adapter, { budgetBytes: 168 });
    const a = controller.acquire(near.source, { distanceMeters: 1 });
    const b = controller.acquire(far.source, { distanceMeters: 2 });
    await ticks();
    const blocked = adapter.uploads[0]!;
    expect(adapter.published.get(far.source.texture)?.levels).toEqual([2]);
    expect(adapter.uploads).toHaveLength(2);
    adapter.blockedUploads.get(blocked)!.resolve();
    await controller.whenSettled();
    const committed = adapter.publications.filter((event) => event.levels !== null);
    expect(committed.slice(0, 2).map((event) => event.levels)).toEqual([[2], [2]]);
    expect(adapter.published.get(near.source.texture)?.levels).toEqual([0, 1, 2]);
    expect(adapter.published.get(far.source.texture)?.levels).toEqual([0, 1, 2]);
    a.release(); b.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("isolates devices sharing a logical texture and the last lease releases only its device", async () => {
    const fixture = makeSource();
    const one = new DeviceAdapter(), two = new DeviceAdapter();
    const first = new TestController(one, { budgetBytes: 4 });
    const second = new TestController(two, { budgetBytes: 20 });
    const a = first.acquire(fixture.source, { distanceMeters: 0 });
    const b = second.acquire(fixture.source, { distanceMeters: 0 });
    await Promise.all([first.whenSettled(), second.whenSettled()]);
    expect(one.published.get(fixture.source.texture)?.levels).toEqual([2]);
    expect(two.published.get(fixture.source.texture)?.levels).toEqual([1, 2]);
    a.release();
    await first.whenSettled();
    expect(one.usageBytes()).toBe(0);
    expect(two.usageBytes()).toBe(24);
    b.release();
    await second.whenSettled();
    first.dispose(); second.dispose();
    await Promise.all([first.whenSettled(), second.whenSettled()]);
  });

  it("cancels a shared load only after its last subscriber and releases a late mip", async () => {
    const gate = deferred<TextureResidencyLoadedMip<Uint8Array>>();
    let sourceSignal!: AbortSignal;
    let released = 0;
    const fixture = makeSource({ load: async (_level, signal) => { sourceSignal = signal; return gate.promise; } });
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const one = new AbortController(), two = new AbortController();
    controller.acquire(fixture.source, { distanceMeters: 1 }, one.signal);
    controller.acquire(fixture.source, { distanceMeters: 1 }, two.signal);
    await ticks();
    expect(sourceSignal.aborted).toBe(false);
    one.abort();
    expect(sourceSignal.aborted).toBe(false);
    two.abort();
    expect(sourceSignal.aborted).toBe(true);
    gate.resolve({ value: new Uint8Array(4), release: () => { released += 1; } });
    await controller.whenSettled();
    expect(released).toBe(1);
    expect(adapter.uploads).toHaveLength(0);
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("retires a stale late upload without disturbing a new subscriber", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    adapter.holdNextUpload = true;
    const controller = new TestController(adapter, { budgetBytes: 8 });
    const oldLease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await ticks();
    const oldAllocation = adapter.uploads[0]!;
    expect(adapter.blockedUploads.has(oldAllocation)).toBe(true);
    oldLease.release();
    const newLease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await ticks();
    const newAllocation = adapter.published.get(fixture.source.texture)!;
    expect(newAllocation).not.toBe(oldAllocation);
    adapter.blockedUploads.get(oldAllocation)!.resolve();
    await controller.whenSettled();
    expect(oldAllocation.destroyed).toBe(true);
    expect(adapter.published.get(fixture.source.texture)).toBe(newAllocation);
    expect(adapter.usageBytes()).toBe(8);
    newLease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("does not publish a late upload after another consumer changes the winning priority", async () => {
    const near = makeSource(), far = makeSource();
    const adapter = new DeviceAdapter();
    adapter.fallbackAllowance = 8;
    adapter.holdNextUpload = true;
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const first = controller.acquire(near.source, { distanceMeters: 1 });
    const second = controller.acquire(far.source, { distanceMeters: 10 });
    await ticks();
    const stale = adapter.uploads[0]!;
    second.updateDemand({ distanceMeters: 10, priority: 1 });
    await ticks();
    expect(adapter.published.size).toBe(0);
    adapter.blockedUploads.get(stale)!.resolve();
    await controller.whenSettled();
    expect(stale.destroyed).toBe(true);
    expect(adapter.published.has(near.source.texture)).toBe(false);
    expect(adapter.published.get(far.source.texture)?.levels).toEqual([2]);
    first.release(); second.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("keeps an in-flight mip load while changing distances do not change its target", async () => {
    const gate = deferred<TextureResidencyLoadedMip<Uint8Array>>();
    let sourceSignal!: AbortSignal;
    let calls = 0;
    const fixture = makeSource({ load: async (_level, signal) => {
      calls += 1; sourceSignal = signal; return gate.promise;
    } });
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 1 });
    await ticks();
    for (let frame = 0; frame < 10; frame += 1) {
      lease.updateDemand({ distanceMeters: frame + 2 });
      await ticks(2);
    }
    expect(sourceSignal.aborted).toBe(false);
    expect(calls).toBe(1);
    gate.resolve({ value: new Uint8Array(4).fill(7), release() {} });
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.pixels[0]?.[0]).toBe(7);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("keeps retiring storage charged until its fence, while unrelated release remains responsive", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 84 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const original = adapter.published.get(fixture.source.texture)!;
    const uploadCount = adapter.uploads.length;
    adapter.holdFences = true;
    controller.setBudget(20);
    await ticks();
    expect(adapter.published.has(fixture.source.texture)).toBe(false);
    expect(controller.snapshot()).toMatchObject({ usedBytes: 88, residentBytes: 0, retiringBytes: 84 });
    const abort = new AbortController();
    const wait = controller.whenSettled(abort.signal);
    abort.abort(new Error("stop waiting"));
    await expect(wait).rejects.toThrow("stop waiting");
    lease.release();
    expect(controller.snapshot().entries[0]?.consumers).toBe(0);
    adapter.completeFence(original);
    await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    expect(adapter.uploads).toHaveLength(uploadCount);
    controller.dispose();
    await controller.whenSettled();
  });

  it("continues unrelated uploads while another allocation is waiting on its fence", async () => {
    const first = makeSource(), second = makeSource(), third = makeSource();
    const adapter = new DeviceAdapter();
    adapter.fallbackAllowance = 12;
    const controller = new TestController(adapter, { budgetBytes: 12 });
    const a = controller.acquire(first.source, { distanceMeters: 1 });
    const b = controller.acquire(second.source, { distanceMeters: 2 });
    await controller.whenSettled();
    const retiring = adapter.published.get(second.source.texture)!;
    adapter.holdFences = true;
    b.release();
    await ticks();
    expect(adapter.fences.has(retiring)).toBe(true);
    const c = controller.acquire(third.source, { distanceMeters: 3 });
    await ticks();
    expect(adapter.published.get(third.source.texture)?.levels).toEqual([2]);
    expect(adapter.usageBytes()).toBe(24);
    adapter.completeFence(retiring);
    await ticks();
    adapter.holdFences = false;
    a.release(); c.release();
    await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("waits for resident retirement before unpreparing, then tracks the fallback fence", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const original = adapter.published.get(fixture.source.texture)!;
    const fallback = adapter.fallbacks.get(fixture.source.texture)!;
    adapter.holdFences = true;
    adapter.holdFallbackFences = true;
    lease.release();
    await ticks();
    expect(adapter.unprepared).toHaveLength(0);
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(true);
    expect(adapter.usageBytes()).toBe(8);
    adapter.completeFence(original);
    await ticks();
    expect(adapter.unprepared).toEqual([fixture.source.texture]);
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(false);
    expect(adapter.usageBytes()).toBe(4);
    const abort = new AbortController();
    const waiting = controller.whenSettled(abort.signal);
    abort.abort(new Error("fallback fence pending"));
    await expect(waiting).rejects.toThrow("fallback fence pending");
    adapter.completeFallbackFence(fallback);
    await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
    await controller.whenSettled();
  });

  it("rebuilds two downgraded textures after their old allocations retire", async () => {
    const first = makeSource(), second = makeSource();
    const adapter = new DeviceAdapter();
    adapter.fallbackAllowance = 8;
    const controller = new TestController(adapter, { budgetBytes: 168 });
    const a = controller.acquire(first.source, { distanceMeters: 1 });
    const b = controller.acquire(second.source, { distanceMeters: 2 });
    await controller.whenSettled();
    const oldFirst = adapter.published.get(first.source.texture)!;
    const oldSecond = adapter.published.get(second.source.texture)!;
    adapter.holdFences = true;
    controller.setBudget(40);
    await ticks();
    expect(adapter.published.size).toBe(0);
    adapter.completeFence(oldFirst);
    adapter.completeFence(oldSecond);
    await controller.whenSettled();
    expect(adapter.published.get(first.source.texture)?.levels).toEqual([1, 2]);
    expect(adapter.published.get(second.source.texture)?.levels).toEqual([1, 2]);
    adapter.holdFences = false;
    a.release(); b.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("preserves the old allocation on a failed decode, upload or binding switch and retries", async () => {
    let failLoad = false;
    const fixture = makeSource({ load: async (level) => {
      if (failLoad && level === 1) { failLoad = false; throw new Error("transient decode"); }
      return { value: new Uint8Array([64, 16, 4][level]!).fill(level + 1), release() {} };
    } });
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const coarse = adapter.published.get(fixture.source.texture)!;
    failLoad = true;
    controller.setBudget(88);
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toBe(coarse);
    expect(controller.snapshot().entries[0]).toMatchObject({ status: "error", residentLevels: 1 });
    adapter.failNextUpload = true;
    controller.reconcile();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toBe(coarse);
    expect(adapter.usageBytes()).toBe(8);
    adapter.failNextPublish = true;
    controller.reconcile();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toBe(coarse);
    expect(adapter.usageBytes()).toBe(8);
    controller.reconcile();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.levels).toEqual([0, 1, 2]);
    expect(adapter.usageBytes()).toBe(88);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("retains failed-fence charges and releases them only after device loss", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const original = adapter.published.get(fixture.source.texture)!;
    adapter.holdFences = true;
    controller.setBudget(0);
    await ticks();
    adapter.failFence(original);
    await controller.whenSettled();
    expect(controller.snapshot()).toMatchObject({ usedBytes: 8, retiringBytes: 4 });
    controller.setBudget(4);
    await controller.whenSettled();
    expect(adapter.published.has(fixture.source.texture)).toBe(false);
    adapter.lose();
    expect(controller.snapshot()).toMatchObject({ usedBytes: 0, retiringBytes: 0 });
    adapter.holdFences = false;
    adapter.restore();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.levels).toEqual([2]);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("ignores a late load from a lost generation and reloads after restoration", async () => {
    const gate = deferred<TextureResidencyLoadedMip<Uint8Array>>();
    let calls = 0, releases = 0;
    const fixture = makeSource({ load: async () => {
      calls += 1;
      if (calls === 1) return gate.promise;
      return { value: new Uint8Array(4).fill(9), release: () => { releases += 1; } };
    } });
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await ticks();
    adapter.lose();
    adapter.restore();
    await ticks();
    expect(adapter.published.get(fixture.source.texture)?.pixels[0]?.[0]).toBe(9);
    gate.resolve({ value: new Uint8Array(4).fill(2), release: () => { releases += 1; } });
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.pixels[0]?.[0]).toBe(9);
    expect(releases).toBe(2);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("does not upload after a failed restore preparation until preparation succeeds on retry", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const previousUploads = adapter.uploads.length;
    adapter.lose();
    adapter.failNextPrepare = true;
    adapter.restore();
    lease.updateDemand({ distanceMeters: 1 });
    await controller.whenSettled();
    expect(controller.snapshot().entries[0]).toMatchObject({ status: "error", residentLevels: 0 });
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(false);
    expect(adapter.uploads).toHaveLength(previousUploads);
    controller.reconcile();
    await controller.whenSettled();
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(true);
    expect(adapter.published.get(fixture.source.texture)?.levels).toEqual([2]);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("rejects a late device upload across loss and never revives the destroyed allocation", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    adapter.holdNextUpload = true;
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await ticks();
    const stale = adapter.uploads[0]!;
    adapter.lose();
    expect(stale.destroyed).toBe(true);
    adapter.restore();
    expect(adapter.fallbacks.has(fixture.source.texture)).toBe(true);
    await ticks();
    const current = adapter.published.get(fixture.source.texture)!;
    expect(current).not.toBe(stale);
    adapter.blockedUploads.get(stale)!.resolve();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toBe(current);
    expect(controller.snapshot()).toMatchObject({ usedBytes: 8, residentBytes: 4 });
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("handles a subscriber release during publication and retires the newly published allocation", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    adapter.onPublish = () => { adapter.onPublish = undefined; lease.release(); };
    await controller.whenSettled();
    expect(adapter.published.has(fixture.source.texture)).toBe(false);
    expect(adapter.usageBytes()).toBe(0);
    expect(adapter.uploads[0]?.destroyed).toBe(true);
    controller.dispose();
    await controller.whenSettled();
  });

  it("does not revive an allocation when the device is lost during its binding switch", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    adapter.onPublish = () => { adapter.onPublish = undefined; adapter.lose(); };
    await controller.whenSettled();
    expect(adapter.published.size).toBe(0);
    expect(adapter.usageBytes()).toBe(0);
    expect(controller.snapshot().entries[0]).toMatchObject({ status: "lost", residentLevels: 0 });
    adapter.restore();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.levels).toEqual([2]);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("accounts for other device allocations and the selected fallback's real size", async () => {
    const levels = [{ width: 5, height: 3, bytes: 16 }, { width: 2, height: 1, bytes: 8 }, { width: 1, height: 1, bytes: 8 }];
    const fixture = makeSource({ levels });
    const adapter = new DeviceAdapter();
    adapter.formatMultiplier = 2;
    adapter.externalBytes = 8;
    const controller = new TestController(adapter, { budgetBytes: 24 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toMatchObject({ levels: [2], bytes: 16 });
    expect(controller.snapshot()).toMatchObject({ usedBytes: 28, residentBytes: 16 });
    adapter.externalBytes = 0;
    controller.setBudget(80);
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toMatchObject({ levels: [0, 1, 2], bytes: 64 });
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("rejects incompatible sources and invalid mip chains and preserves exclusive device ownership", async () => {
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    expect(() => new TestController(adapter, { budgetBytes: 4 })).toThrow(/already owns/);
    const fixture = makeSource();
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    expect(() => controller.acquire({ ...fixture.source, identity: {} }, { distanceMeters: 0 })).toThrow(/identity/);
    expect(() => controller.acquire({ ...fixture.source, levels: [{ width: 5, height: 3, bytes: 60 }, { width: 3, height: 2, bytes: 24 }] }, { distanceMeters: 0 })).toThrow(/consecutive/);
    expect(() => controller.acquire(fixture.source, { distanceMeters: -1 })).toThrow(/distance/);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
    const next = new TestController(adapter, { budgetBytes: 4 });
    next.dispose();
    await next.whenSettled();
  });

  it("rejects zero-byte backend estimates without claiming a resident texture", async () => {
    const adapter = new DeviceAdapter();
    adapter.formatMultiplier = 0;
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const fixture = makeSource();
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    expect(controller.snapshot().entries[0]).toMatchObject({ status: "error", residentBytes: 0 });
    expect(adapter.published.size).toBe(0);
    expect(adapter.uploads).toHaveLength(0);
    adapter.formatMultiplier = 1;
    controller.reconcile();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)?.levels).toEqual([2]);
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("snapshots mip metadata so caller mutations cannot change an admitted source", async () => {
    const levels = [{ width: 2, height: 2, bytes: 16 }, { width: 1, height: 1, bytes: 4 }];
    const fixture = makeSource({ levels });
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    const lease = controller.acquire(fixture.source, { distanceMeters: 0 });
    levels[0]!.width = 999;
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toMatchObject({ bytes: 4, levels: [1] });
    lease.release();
    await controller.whenSettled();
    controller.dispose();
    await controller.whenSettled();
  });

  it("retries disposal when a fallback switch fails, without retiring a bound texture", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const original = adapter.published.get(fixture.source.texture)!;
    adapter.failNextPublish = true;
    controller.dispose();
    await controller.whenSettled();
    expect(adapter.published.get(fixture.source.texture)).toBe(original);
    expect(original.destroyed).toBe(false);
    controller.dispose();
    await controller.whenSettled();
    expect(original.destroyed).toBe(true);
    expect(adapter.usageBytes()).toBe(0);
  });

  it("unpublishes a resident synchronously during disposal before device teardown", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    adapter.holdFences = true;
    const resident = adapter.published.get(fixture.source.texture)!;
    controller.dispose();
    expect(adapter.published.has(fixture.source.texture)).toBe(false);
    expect(adapter.fences.has(resident)).toBe(true);
    adapter.completeFence(resident);
    await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
  });

  it("disposes a previously published texture after a failed refinement", async () => {
    const fixture = makeSource();
    const adapter = new DeviceAdapter();
    const controller = new TestController(adapter, { budgetBytes: 4 });
    controller.acquire(fixture.source, { distanceMeters: 0 });
    await controller.whenSettled();
    const original = adapter.published.get(fixture.source.texture)!;
    adapter.failNextUpload = true;
    controller.setBudget(88);
    await controller.whenSettled();
    expect(controller.snapshot().entries[0]?.status).toBe("error");
    expect(adapter.published.get(fixture.source.texture)).toBe(original);
    controller.dispose();
    await controller.whenSettled();
    expect(original.destroyed).toBe(true);
    expect(adapter.usageBytes()).toBe(0);
  });
});
