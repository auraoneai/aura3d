import { describe, expect, it, vi } from "vitest";
import {
  createLegacyPhysicsWorldAccess,
  createPhysicsWorldProvider,
  type PhysicsWorldModule
} from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js";
import { Shape } from "../../../packages/physics/src/Shape.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function worldModule(PhysicsWorld: unknown, ensurePhysics: () => Promise<unknown>): PhysicsWorldModule {
  return { PhysicsWorld, ensurePhysics } as unknown as PhysicsWorldModule;
}

class BackendWorld {}
class PhysicsWorldStub {}
const readyBackend = { World: BackendWorld, init: async () => {} };

describe("staged isolated physics provider", () => {
  it("does not import the world while importing the provider or reading an unready accessor", async () => {
    const evaluated = vi.fn();
    const initialized = vi.fn(async () => readyBackend);
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      evaluated();
      return { PhysicsWorld: PhysicsWorldStub, ensurePhysics: initialized };
    });
    try {
      const provider = await import("../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js");
      expect(evaluated).not.toHaveBeenCalled();
      expect(() => provider.requirePhysicsWorld()).toThrow(/await preloadPhysics\(\)/i);
      expect(evaluated).not.toHaveBeenCalled();
      const first = provider.preloadPhysics(), second = provider.preloadPhysics();
      expect(first).toBe(second);
      await first;
      expect(evaluated).toHaveBeenCalledTimes(1);
      expect(initialized).toHaveBeenCalledTimes(1);
      expect(provider.requirePhysicsWorld()).toBe(PhysicsWorldStub);
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  });

  it("shares reentrant and concurrent preload through initialization without constructing a world", async () => {
    const loading = deferred<PhysicsWorldModule>();
    const initialized = deferred<unknown>();
    const initStarted = deferred<void>();
    let physicsConstructions = 0, backendConstructions = 0;
    class PhysicsWorldWithoutAllocation { constructor() { physicsConstructions += 1; } }
    class BackendWithoutAllocation { constructor() { backendConstructions += 1; } }
    let nested: Promise<void> | undefined;
    let provider!: ReturnType<typeof createPhysicsWorldProvider>;
    const load = vi.fn(() => {
      nested = provider.preload();
      return loading.promise;
    });
    provider = createPhysicsWorldProvider(load);
    const first = provider.preload(), second = provider.preload();
    expect(first).toBe(second);
    expect(load).not.toHaveBeenCalled();
    expect(() => provider.requireReady()).toThrow(/still loading.*preloadPhysics/i);
    await Promise.resolve();
    expect(nested).toBe(first);
    const ensure = vi.fn(() => { initStarted.resolve(); return initialized.promise; });
    loading.resolve(worldModule(PhysicsWorldWithoutAllocation, ensure));
    await initStarted.promise;
    expect(() => provider.requireReady()).toThrow(/still loading.*preloadPhysics/i);
    expect(physicsConstructions).toBe(0);
    expect(backendConstructions).toBe(0);
    initialized.resolve({ World: BackendWithoutAllocation, init: async () => {} });
    await first;
    expect(provider.requireReady()).toBe(PhysicsWorldWithoutAllocation);
    expect(physicsConstructions).toBe(0);
    expect(backendConstructions).toBe(0);
    await provider.preload();
    expect(load).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it.each(["import", "initialization"] as const)("preserves the %s error and retries safely", async (phase) => {
    const original = new Error(`${phase} failed`);
    const successful = worldModule(PhysicsWorldStub, async () => readyBackend);
    const failed = phase === "import"
      ? () => Promise.reject(original)
      : () => Promise.resolve(worldModule(PhysicsWorldStub, () => Promise.reject(original)));
    const load = vi.fn().mockImplementationOnce(failed).mockResolvedValue(successful);
    const provider = createPhysicsWorldProvider(load);
    const first = provider.preload(), joined = provider.preload();
    expect(first).toBe(joined);
    const failure = await first.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).cause).toBe(original);
    await expect(joined).rejects.toBe(failure);
    try {
      provider.requireReady();
      expect.fail("Expected the unready accessor to throw.");
    } catch (error) {
      expect((error as Error).cause).toBe(failure);
      expect((error as Error).message).toMatch(/await preloadPhysics\(\)/i);
    }
    await provider.preload();
    expect(load).toHaveBeenCalledTimes(2);
    expect(provider.requireReady()).toBe(PhysicsWorldStub);
  });

  it("rejects an absent backend and can retry a loader that later succeeds", async () => {
    const ensure = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(readyBackend);
    const load = vi.fn(async () => worldModule(PhysicsWorldStub, ensure));
    const provider = createPhysicsWorldProvider(load);
    const failure = await provider.preload().catch((error: unknown) => error);
    // An absent backend is the typed PHYSICS_BACKEND_MISSING error (code + install command), not a generic preload failure.
    expect((failure as Error & { code?: string }).code).toBe("PHYSICS_BACKEND_MISSING");
    expect((failure as Error).message).toMatch(/npm install @dimforge\/rapier3d-compat@0\.20\.0/);
    expect(((failure as Error).cause as Error).message).toMatch(/optional.*rapier.*unavailable/i);
    expect(() => provider.requireReady()).toThrow(/PHYSICS_BACKEND_MISSING/);
    await provider.preload();
    expect(load).toHaveBeenCalledTimes(2);
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(provider.requireReady()).toBe(PhysicsWorldStub);
  });

  it("starts a new attempt from a rejection handler without reusing the failed promise", async () => {
    const firstLoad = deferred<PhysicsWorldModule>();
    const load = vi.fn().mockImplementationOnce(() => firstLoad.promise)
      .mockResolvedValue(worldModule(PhysicsWorldStub, async () => readyBackend));
    const provider = createPhysicsWorldProvider(load);
    const first = provider.preload();
    let retry: Promise<void> | undefined;
    const recovered = first.catch(() => { retry = provider.preload(); return retry; });
    const failure = new Error("first import failed");
    firstLoad.reject(failure);
    await recovered;
    expect(retry).toBeDefined();
    expect(retry).not.toBe(first);
    expect(load).toHaveBeenCalledTimes(2);
    expect(provider.requireReady()).toBe(PhysicsWorldStub);
  });

  it("preserves errors thrown while inspecting a constructor", async () => {
    const original = new Error("prototype getter failed");
    const malformed = new Proxy(class {}, {
      get(target, key, receiver) {
        if (key === "prototype") throw original;
        return Reflect.get(target, key, receiver);
      }
    });
    const provider = createPhysicsWorldProvider(async () => worldModule(malformed, async () => readyBackend));
    const failure = await provider.preload().catch((error: unknown) => error);
    expect(((failure as Error).cause as Error).cause).toBe(original);
    expect(() => provider.requireReady()).toThrow(/await preloadPhysics\(\)/i);
  });

  it.each([
    { label: "undefined", reason: undefined },
    { label: "an object", reason: { kind: "initialization-failed" } },
    { label: "a string", reason: "backend refused" }
  ])("preserves a rejection whose cause is $label", async ({ reason }) => {
    const provider = createPhysicsWorldProvider(async () => worldModule(PhysicsWorldStub, () => Promise.reject(reason)));
    const failure = await provider.preload().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(Object.hasOwn(failure as object, "cause")).toBe(true);
    expect((failure as Error).cause).toBe(reason);
    expect(() => provider.requireReady()).toThrow(/await preloadPhysics\(\)/i);
  });

  it("observes a failed preload even when the caller discards the promise", async () => {
    const loading = deferred<PhysicsWorldModule>();
    const provider = createPhysicsWorldProvider(() => loading.promise);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      void provider.preload();
      loading.reject(new Error("background import failed"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(() => provider.requireReady()).toThrow(/await preloadPhysics\(\)/i);
    } finally { process.off("unhandledRejection", onUnhandled); }
  });

  it.each([
    ["missing initializer", {}],
    ["nonconstructable physics world", { PhysicsWorld: () => undefined, ensurePhysics: async () => readyBackend }],
    ["missing backend initializer", { PhysicsWorld: PhysicsWorldStub, ensurePhysics: async () => ({ World: BackendWorld }) }],
    ["nonconstructable backend world", { PhysicsWorld: PhysicsWorldStub, ensurePhysics: async () => ({ World: () => undefined, init: async () => {} }) }],
    ["missing backend world", { PhysicsWorld: PhysicsWorldStub, ensurePhysics: async () => ({ init: async () => {} }) }]
  ])("does not publish a %s", async (_label, invalid) => {
    const load = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValue(worldModule(PhysicsWorldStub, async () => readyBackend));
    const provider = createPhysicsWorldProvider(load);
    const failure = await provider.preload().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).cause).toBeInstanceOf(Error);
    expect(() => provider.requireReady()).toThrow(/await preloadPhysics\(\)/i);
    await provider.preload();
    expect(provider.requireReady()).toBe(PhysicsWorldStub);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("preloads the real backend for later synchronous world construction and stepping", async () => {
    const provider = createPhysicsWorldProvider();
    await provider.preload();
    const Constructor = provider.requireReady();
    const world = new Constructor({ gravity: [0, -10, 0] });
    try {
      const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
      world.createCollider(floor, { shape: Shape.box(2, 0.5, 2) });
      const body = world.createRigidBody({ position: [0, 1, 0] });
      world.createCollider(body, { shape: Shape.sphere(0.2) });
      for (let index = 0; index < 120; index += 1) world.step(1 / 60);
      expect(world.snapshot().backend.active).toBe("rapier");
      expect(body.position[1]).toBeGreaterThan(0.19);
      expect(body.position[1]).toBeLessThan(0.3);
      expect(world.snapshot().contacts.length).toBeGreaterThan(0);
    } finally { world.dispose(); }
  });
});

describe("independent legacy and isolated physics access", () => {
  it("keeps isolated readiness independent when legacy initialization finishes", async () => {
    const initialization = deferred<unknown>();
    const started = deferred<void>();
    let backendReady = false;
    const notReady = new Error("legacy no-TLA world is not ready");
    class LegacyWorld {
      constructor() { if (!backendReady) throw notReady; }
    }
    const ensure = vi.fn(() => { started.resolve(); return initialization.promise; });
    const module = worldModule(LegacyWorld, ensure);
    const legacy = createLegacyPhysicsWorldAccess(module);
    const isolated = createPhysicsWorldProvider(async () => module);

    // Legacy exposes the actual 4.x constructor immediately; the constructor
    // itself still enforces the existing no-TLA initialization boundary.
    const LegacyConstructor = legacy.requireReady();
    expect(LegacyConstructor).toBe(LegacyWorld);
    expect(() => new LegacyConstructor()).toThrow(notReady);
    expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);
    const first = legacy.preload(), concurrent = legacy.preload();
    expect(first).toBe(concurrent);
    await started.promise;
    expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);
    backendReady = true;
    initialization.resolve(readyBackend);
    await first;
    expect(new LegacyConstructor()).toBeInstanceOf(LegacyWorld);
    expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);

    await isolated.preload();
    expect(isolated.requireReady()).toBe(LegacyWorld);
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it("keeps a ready isolated access usable when legacy initialization fails", async () => {
    const failure = new Error("legacy WASM initialization failed");
    class IsolatedWorld {}
    class LegacyWorld {
      constructor() { throw new Error("legacy physics is unavailable", { cause: failure }); }
    }
    const isolated = createPhysicsWorldProvider(async () => worldModule(IsolatedWorld, async () => readyBackend));
    await isolated.preload();
    const legacy = createLegacyPhysicsWorldAccess(worldModule(LegacyWorld, () => Promise.reject(failure)));
    expect(legacy.requireReady()).toBe(LegacyWorld);
    try {
      new (legacy.requireReady())();
      expect.fail("Expected the legacy constructor to report its backend failure.");
    } catch (error) {
      expect((error as Error).cause).toBe(failure);
    }
    const preloadFailure = await legacy.preload().catch((error: unknown) => error);
    expect((preloadFailure as Error).cause).toBe(failure);
    expect(isolated.requireReady()).toBe(IsolatedWorld);
  });

  it("does not publish an isolated constructor when a legacy peer is absent", async () => {
    const unavailable = new Error("optional Rapier peer is unavailable");
    class LegacyWorld {
      constructor() { throw unavailable; }
    }
    const module = worldModule(LegacyWorld, async () => null);
    const legacy = createLegacyPhysicsWorldAccess(module);
    const isolated = createPhysicsWorldProvider(async () => module);
    expect(() => new (legacy.requireReady())()).toThrow(unavailable);
    await expect(legacy.preload()).rejects.toThrow(/PHYSICS_BACKEND_MISSING/);
    expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);
    await expect(isolated.preload()).rejects.toThrow(/PHYSICS_BACKEND_MISSING/);
    expect(() => isolated.requireReady()).toThrow(/PHYSICS_BACKEND_MISSING/);
  });

  it("preserves real default 4.x synchronous construction without legacy preload", async () => {
    const module = await import("@aura3d/physics/world");
    const legacy = createLegacyPhysicsWorldAccess(module);
    const Constructor = legacy.requireReady();
    const world = new Constructor({ gravity: [0, -10, 0] });
    try {
      const body = world.createRigidBody({ position: [0, 1, 0] });
      world.step(1 / 60);
      expect(body.position[1]).toBeLessThan(1);
      expect(world.snapshot().backend.active).toBe("rapier");
    } finally { world.dispose(); }
  });
});
