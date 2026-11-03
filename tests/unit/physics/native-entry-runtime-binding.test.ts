import { describe, expect, it, vi } from "vitest";
import type { PhysicsWorldDescriptor } from "@aura3d/physics";
import {
  createGameCollisionWorldWithPhysicsWorldAccess,
  createGamePlanarCollisionWorldWithPhysicsWorldAccess,
  addVec3 as coreAddVec3,
  vec3 as coreVec3
} from "../../../packages/engine/src/agent-api/GameRuntimeCore.js";
import { addVec3, vec3 } from "../../../packages/engine/src/agent-api/GameVectorMath.js";
import { createPhysicsWithAccess, createRuntimeScenePhysicsWithAccess } from "../../../packages/engine/src/agent-api/nodes/physics-core.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import {
  createLegacyPhysicsWorldAccess,
  createPhysicsWorldProvider,
  type PhysicsWorldAccess,
  type PhysicsWorldModule
} from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js";
import { PhysicsWorld, ensurePhysics } from "../../../packages/physics/src/world.js";
import { PhysicsDebugDraw } from "../../../packages/physics/src/PhysicsDebugDraw.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

/** Track actual Rapier-backed worlds, including game worlds without a public dispose method. */
function trackedWorlds() {
  const live = new Set<PhysicsWorld>();
  let constructions = 0;
  let disposals = 0;
  let nextFailure: Error | undefined;
  class TrackedWorld extends PhysicsWorld {
    constructor(descriptor: PhysicsWorldDescriptor = {}) {
      if (nextFailure) {
        const error = nextFailure;
        nextFailure = undefined;
        throw error;
      }
      super(descriptor);
      constructions += 1;
      live.add(this);
    }
    override dispose(): void {
      if (live.delete(this)) disposals += 1;
      super.dispose();
    }
  }
  return {
    World: TrackedWorld,
    get constructions() { return constructions; },
    get disposals() { return disposals; },
    get liveCount() { return live.size; },
    failNext(error: Error) { nextFailure = error; },
    disposeAll() { for (const world of live) world.dispose(); }
  };
}

function moduleWithWorld(World: typeof PhysicsWorld): PhysicsWorldModule {
  return { PhysicsWorld: World, ensurePhysics };
}

function invalidScene() {
  return scene()
    .add(primitives.box().physics({ type: "dynamic", shape: "box" }))
    .add(primitives.plane().physics({ type: "dynamic", shape: "plane" }));
}

describe("per-entry physics runtime bindings", () => {
  it.each(["game", "physics"] as const)("imports the %s core without evaluating the optional world or backend", async (entry) => {
    const worldEvaluated = vi.fn();
    const backendEvaluated = vi.fn();
    const backend = { World: class BackendWorld {}, init: async () => {} };
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      worldEvaluated();
      return { PhysicsWorld: class DeferredWorld {}, ensurePhysics: async () => backend };
    });
    vi.doMock("@dimforge/rapier3d-compat", () => {
      backendEvaluated();
      return backend;
    });
    try {
      const core = entry === "game"
        ? await import("../../../packages/engine/src/agent-api/GameRuntimeCore.js")
        : await import("../../../packages/engine/src/agent-api/nodes/physics-core.js");
      expect(core).toBeDefined();
      expect(worldEvaluated).not.toHaveBeenCalled();
      expect(backendEvaluated).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });

  it("preserves vector utility exports and fallback identity after removing the runtime cycle", () => {
    const fallback = [4, 5, 6] as const;
    const source = [1, 2, 3] as const;
    expect(coreVec3).toBe(vec3);
    expect(coreAddVec3).toBe(addVec3);
    expect(vec3(undefined, fallback)).toBe(fallback);
    expect(vec3(source, fallback)).toEqual(source);
    expect(vec3(source, fallback)).not.toBe(source);
    expect(addVec3(source, fallback)).toEqual([5, 7, 9]);
  });

  it("preserves synchronous no-TLA readiness and the legacy async preload path", async () => {
    const loading = deferred<void>();
    const started = deferred<void>();
    const notReady = new Error("backend is not initialized");
    let ready = false;
    class DeferredWorld {
      constructor() { if (!ready) throw notReady; }
      dispose() {}
    }
    const backend = { init: async () => {}, World: class BackendWorld {} };
    const ensure = vi.fn(async () => {
      started.resolve();
      await loading.promise;
      ready = true;
      return backend;
    });
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => ({ PhysicsWorld: DeferredWorld, ensurePhysics: ensure }));
    try {
      const [{ physics }, game, providers] = await Promise.all([
        import("../../../packages/engine/src/agent-api/nodes/physics.js"),
        import("../../../packages/engine/src/agent-api/GameRuntime.js"),
        import("../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js")
      ]);
      const isolated = providers.createPhysicsWorldProvider(async () => ({
        PhysicsWorld: DeferredWorld,
        ensurePhysics: ensure
      } as unknown as PhysicsWorldModule));
      expect(ensure).not.toHaveBeenCalled();
      expect(() => physics.world()).toThrow(notReady);
      expect(() => game.createGameCollisionWorld()).toThrow(notReady);
      expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);

      // Legacy worldAsync historically imports ensurePhysics from the full
      // physics entry, while isolated access owns an independent preload.
      vi.doMock("@aura3d/physics", () => ({ ensurePhysics: ensure }));
      const pending = physics.worldAsync();
      await Promise.race([
        started.promise,
        pending.then(() => { throw new Error("worldAsync did not wait for initialization"); })
      ]);
      expect(() => physics.world()).toThrow(notReady);
      loading.resolve();
      const world = await pending;
      world.dispose();
      const gameWorld = game.createGameCollisionWorld();
      gameWorld.clear();
      expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);
      await isolated.preload();
      expect(isolated.requireReady()).toBe(DeferredWorld);
    } finally {
      loading.resolve();
      vi.doUnmock("@aura3d/physics");
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  });

  it("does not fall back to legacy physics when access is missing or malformed", async () => {
    expect(() => createPhysicsWithAccess(undefined as unknown as PhysicsWorldAccess)).toThrow(/physics world access/i);
    expect(() => createPhysicsWithAccess({} as PhysicsWorldAccess)).toThrow(/physics world access/i);
    const broken: PhysicsWorldAccess = {
      preload: async () => {},
      requireReady: () => undefined as unknown as typeof PhysicsWorld
    };
    const api = createPhysicsWithAccess(broken);
    expect(() => api.world()).toThrow();
    expect(() => api.worldFromScene(scene())).toThrow();
    await expect(api.worldAsync()).rejects.toThrow();
    await expect(api.worldFromSceneAsync(scene())).rejects.toThrow();
  });

  it("keeps legacy and isolated readiness, worlds and reset ownership separate", async () => {
    const legacyWorlds = trackedWorlds();
    const isolatedWorlds = trackedWorlds();
    const legacy = createLegacyPhysicsWorldAccess(moduleWithWorld(legacyWorlds.World));
    const isolated = createPhysicsWorldProvider(async () => moduleWithWorld(isolatedWorlds.World));
    const legacyPhysics = createPhysicsWithAccess(legacy);
    const isolatedPhysics = createPhysicsWithAccess(isolated);
    try {
      const first = legacyPhysics.world({ gravity: [0, 0, 0] });
      const firstBody = first.createBody({ position: [2, 0, 0], shape: legacyPhysics.sphere() });
      expect(() => isolatedPhysics.world()).toThrow(/await preloadPhysics\(\)/i);
      expect(() => createGameCollisionWorldWithPhysicsWorldAccess(isolated)).toThrow(/await preloadPhysics\(\)/i);
      expect(isolatedWorlds.constructions).toBe(0);

      await isolated.preload();
      const second = isolatedPhysics.world({ gravity: [0, 0, 0] });
      const secondBody = second.createBody({ shape: isolatedPhysics.sphere() });
      expect(() => first.createCollider(secondBody, { shape: legacyPhysics.sphere() })).toThrow(/does not belong/);
      expect(() => second.createCollider(firstBody, { shape: isolatedPhysics.sphere() })).toThrow(/does not belong/);
      const firstReady = vi.spyOn(legacy, "requireReady").mockImplementation(() => { throw new Error("legacy access changed"); });
      const secondReady = vi.spyOn(isolated, "requireReady").mockImplementation(() => { throw new Error("isolated access changed"); });
      firstBody.setPosition([5, 0, 0]);
      first.reset();
      second.reset();
      expect(firstBody.position[0]).toBeCloseTo(2);
      expect(first.getBody(firstBody.id)).toBe(firstBody);
      expect(second.getBody(secondBody.id)).toBe(secondBody);
      expect(firstReady).not.toHaveBeenCalled();
      expect(secondReady).not.toHaveBeenCalled();
      expect(legacyWorlds.constructions).toBe(2);
      expect(isolatedWorlds.constructions).toBe(2);
      expect(legacyWorlds.disposals).toBe(1);
      expect(isolatedWorlds.disposals).toBe(1);
      first.dispose();
      second.dispose();
      expect(legacyWorlds.liveCount).toBe(0);
      expect(isolatedWorlds.liveCount).toBe(0);
    } finally {
      legacyWorlds.disposeAll();
      isolatedWorlds.disposeAll();
    }
  });

  it("binds collision and planar worlds independently and keeps their constructor for clear", async () => {
    const legacyWorlds = trackedWorlds();
    const isolatedWorlds = trackedWorlds();
    const legacy = createLegacyPhysicsWorldAccess(moduleWithWorld(legacyWorlds.World));
    const isolated = createPhysicsWorldProvider(async () => moduleWithWorld(isolatedWorlds.World));
    try {
      const first = createGameCollisionWorldWithPhysicsWorldAccess(legacy, { gravity: [0, 0, 0] });
      const firstBody = first.addSphere("one", 0.5, { position: [0, 2, 0] });
      await isolated.preload();
      const second = createGamePlanarCollisionWorldWithPhysicsWorldAccess(isolated);
      const secondBody = second.addSphere("two", 0.5, { position: [0, 2, 0] });
      for (let i = 0; i < 60; i += 1) second.step(1 / 60);
      expect(secondBody.position[1]).toBeCloseTo(2, 4);

      const firstReady = vi.spyOn(legacy, "requireReady").mockImplementation(() => { throw new Error("legacy access changed"); });
      const secondReady = vi.spyOn(isolated, "requireReady").mockImplementation(() => { throw new Error("isolated access changed"); });
      first.clear();
      expect(() => firstBody.snapshot()).toThrow(/removed/);
      expect(second.require("two")).toBe(secondBody);
      second.clear();
      expect(() => secondBody.snapshot()).toThrow(/removed/);
      expect(firstReady).not.toHaveBeenCalled();
      expect(secondReady).not.toHaveBeenCalled();
      expect(legacyWorlds.constructions).toBe(2);
      expect(isolatedWorlds.constructions).toBe(2);
      expect(legacyWorlds.disposals).toBe(1);
      expect(isolatedWorlds.disposals).toBe(1);
    } finally {
      legacyWorlds.disposeAll();
      isolatedWorlds.disposeAll();
    }
  });

  it("preserves existing worlds and handles when reset or clear cannot construct a replacement", () => {
    const worlds = trackedWorlds();
    const access = createLegacyPhysicsWorldAccess(moduleWithWorld(worlds.World));
    const api = createPhysicsWithAccess(access);
    try {
      const physicsWorld = api.world({ gravity: [0, 0, 0] });
      const body = physicsWorld.createBody({ position: [2, 0, 0], shape: api.sphere() });
      const collision = createGameCollisionWorldWithPhysicsWorldAccess(access, { gravity: [0, 0, 0] });
      const gameBody = collision.addSphere("player", 0.25, { position: [1, 0, 0] });
      const failure = new Error("replacement unavailable");
      worlds.failNext(failure);
      expect(() => physicsWorld.reset()).toThrow(failure);
      expect(physicsWorld.getBody(body.id)).toBe(body);
      body.setVelocity([1, 0, 0]);
      physicsWorld.step(1 / 60);
      expect(body.position[0]).toBeGreaterThan(2);
      expect(physicsWorld.snapshot().resets).toBe(0);
      worlds.failNext(failure);
      expect(() => collision.clear()).toThrow(failure);
      expect(collision.require("player")).toBe(gameBody);
      gameBody.setPosition([3, 0, 0]);
      expect(gameBody.position[0]).toBeCloseTo(3);
      expect(worlds.constructions).toBe(2);
      expect(worlds.disposals).toBe(0);
      physicsWorld.dispose();
    } finally {
      worlds.disposeAll();
    }
  });

  it.each(["worldAsync", "worldFromSceneAsync"] as const)("%s awaits its own access before constructing", async (method) => {
    const worlds = trackedWorlds();
    const loading = deferred<PhysicsWorldModule>();
    const access = createPhysicsWorldProvider(() => loading.promise);
    const api = createPhysicsWithAccess(access);
    try {
      const pending = method === "worldAsync" ? api.worldAsync() : api.worldFromSceneAsync(scene());
      await Promise.resolve();
      expect(worlds.constructions).toBe(0);
      expect(() => access.requireReady()).toThrow(/still loading/i);
      loading.resolve(moduleWithWorld(worlds.World));
      const world = await pending;
      expect(worlds.constructions).toBe(1);
      world.dispose();
    } finally {
      worlds.disposeAll();
    }
  });

  it.each(["worldAsync", "worldFromSceneAsync"] as const)("%s surfaces its own preload failure without constructing", async (method) => {
    const worlds = trackedWorlds();
    const reason = new Error("entry-specific preload failure");
    const access = createPhysicsWorldProvider(() => Promise.reject(reason));
    const api = createPhysicsWithAccess(access);
    try {
      const pending = method === "worldAsync" ? api.worldAsync() : api.worldFromSceneAsync(scene());
      const failure = await pending.catch((error: unknown) => error);
      expect((failure as Error).cause).toBe(reason);
      expect(worlds.constructions).toBe(0);
    } finally {
      worlds.disposeAll();
    }
  });

  it("does not require physics for an empty scene and leaves an unready scene untouched", () => {
    const worlds = trackedWorlds();
    const access = createPhysicsWorldProvider(async () => moduleWithWorld(worlds.World));
    const empty = scene().add(primitives.box()).toJSON();
    const authored = scene().add(primitives.box().physics({ type: "dynamic", shape: "box" })).toJSON();
    const before = structuredClone(authored);
    expect(createRuntimeScenePhysicsWithAccess(access, empty)).toBeUndefined();
    expect(() => createRuntimeScenePhysicsWithAccess(access, authored)).toThrow(/await preloadPhysics\(\)/i);
    expect(authored).toEqual(before);
    expect(worlds.constructions).toBe(0);
  });

  it("disposes failed scene construction and leaves its snapshot unchanged", () => {
    const worlds = trackedWorlds();
    const access = createLegacyPhysicsWorldAccess(moduleWithWorld(worlds.World));
    const api = createPhysicsWithAccess(access);
    try {
      const authored = invalidScene().toJSON();
      const before = structuredClone(authored);
      expect(() => createRuntimeScenePhysicsWithAccess(access, authored)).toThrow(/static bodies/);
      expect(authored).toEqual(before);
      expect(worlds.liveCount).toBe(0);
      expect(() => api.worldFromScene(invalidScene())).toThrow(/static bodies/);
      expect(worlds.liveCount).toBe(0);
      expect(worlds.constructions).toBe(2);
      expect(worlds.disposals).toBe(2);
    } finally {
      worlds.disposeAll();
    }
  });

  it.each(["snapshot", "debug"] as const)("disposes the staged world if initial %s creation fails", (phase) => {
    const worlds = trackedWorlds();
    const access = createLegacyPhysicsWorldAccess(moduleWithWorld(worlds.World));
    const authored = scene().add(primitives.box().physics({ type: "dynamic", shape: "box" })).toJSON();
    const before = structuredClone(authored);
    const failure = new Error(`initial ${phase} failed`);
    const failing = phase === "snapshot"
      ? vi.spyOn(worlds.World.prototype, "snapshot").mockImplementationOnce(() => { throw failure; })
      : vi.spyOn(PhysicsDebugDraw.prototype, "buildLines").mockImplementationOnce(() => { throw failure; });
    try {
      expect(() => createRuntimeScenePhysicsWithAccess(access, authored)).toThrow(failure);
      expect(failing).toHaveBeenCalledTimes(1);
      expect(authored).toEqual(before);
      expect(worlds.constructions).toBe(1);
      expect(worlds.disposals).toBe(1);
      expect(worlds.liveCount).toBe(0);
    } finally {
      failing.mockRestore();
      worlds.disposeAll();
    }
  });

  it("constructs a scene runtime from its bound ready access", async () => {
    const worlds = trackedWorlds();
    const access: PhysicsWorldAccess = createPhysicsWorldProvider(async () => moduleWithWorld(worlds.World));
    const snapshot = scene().add(primitives.box().physics({ type: "dynamic", shape: "box" })).toJSON();
    try {
      await access.preload();
      const runtime = createRuntimeScenePhysicsWithAccess(access, snapshot);
      expect(runtime).toBeDefined();
      expect(snapshot.physics?.bodies).toBe(1);
      runtime!.step(1 / 60);
      runtime!.dispose();
      expect(worlds.disposals).toBe(1);
    } finally {
      worlds.disposeAll();
    }
  });
});
