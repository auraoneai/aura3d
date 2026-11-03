import { describe, expect, it, vi } from "vitest";
import type { PhysicsWorldModule } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js";

// Exercise the real app, provider and scene bridge without starting Rapier.
vi.mock("@aura3d/physics/world", async () => {
  const { RigidBody } = await import("../../../packages/physics/src/RigidBody.js");
  class FakeWorld {
    readonly fixedDelta = 1 / 60;
    readonly gravity = [0, -9.81, 0];
    readonly records = new Map<number, InstanceType<typeof RigidBody>>();
    nextId = 1;
    disposed = false;
    createRigidBody(descriptor: ConstructorParameters<typeof RigidBody>[1] = {}) {
      const body = new RigidBody(this.nextId++, descriptor);
      this.records.set(body.id, body);
      return body;
    }
    createCollider() { return {}; }
    removeRigidBody(id: number) { this.records.delete(id); }
    getBody(id: number) { return this.records.get(id); }
    bodies() { return [...this.records.values()]; }
    colliders() { return []; }
    snapshot() {
      return { backend: { active: "mock" }, stats: { bodies: this.records.size, colliders: this.records.size, steps: 0 }, contacts: [] };
    }
    dispose() { this.disposed = true; this.records.clear(); }
  }
  return { PhysicsWorld: FakeWorld, ensurePhysics: async () => ({ World: class {}, init: async () => {} }) };
});

import { PhysicsWorld, ensurePhysics } from "@aura3d/physics/world";
import { createAuraApp, createAuraAppWithPhysicsWorldAccess as compatibilityAuraFactory } from "../../../packages/engine/src/agent-api/app/createAuraApp.js";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore.js";
import { createGameAppWithPhysicsWorldAccess as compatibilityGameFactory } from "../../../packages/engine/src/agent-api/app/createGameApp.js";
import { createGameAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createGameAppCore.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createLegacyPhysicsWorldAccess, createPhysicsWorldProvider } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js";

const headless = undefined as never;
const box = (name?: string) => primitives.box({ name }).runtime({ id: name ?? "unnamed" }).physics({ type: "dynamic", shape: "box" });
const loader = (World: typeof PhysicsWorld) => async (): Promise<PhysicsWorldModule> => ({ PhysicsWorld: World, ensurePhysics });

describe("app factories with entry-bound physics", () => {
  it("keeps legacy, isolated and game apps independent before and after preload", async () => {
    expect(compatibilityAuraFactory).toBe(createAuraAppWithPhysicsWorldAccess);
    expect(compatibilityGameFactory).toBe(createGameAppWithPhysicsWorldAccess);
    const isolatedWorlds: PhysicsWorld[] = [];
    class IsolatedWorld extends PhysicsWorld {
      constructor(...args: ConstructorParameters<typeof PhysicsWorld>) { super(...args); isolatedWorlds.push(this); }
    }
    const legacyWorlds: PhysicsWorld[] = [];
    class LegacyWorld extends PhysicsWorld {
      constructor(...args: ConstructorParameters<typeof PhysicsWorld>) { super(...args); legacyWorlds.push(this); }
    }
    const isolated = createPhysicsWorldProvider(loader(IsolatedWorld));
    const legacy = createLegacyPhysicsWorldAccess({ PhysicsWorld: LegacyWorld, ensurePhysics });
    const legacyApp = createAuraAppWithPhysicsWorldAccess(legacy, headless, { scene: scene().add(box("legacy")), autoStart: false });
    const defaultApp = createAuraApp(headless, { scene: scene(), autoStart: false });
    const isolatedApp = createAuraAppWithPhysicsWorldAccess(isolated, headless, { scene: scene(), autoStart: false });
    const game = createGameAppWithPhysicsWorldAccess(isolated, headless, { scene: scene(), autoStart: false });
    try {
      expect(legacyApp.physics.bodies.has("legacy")).toBe(true);
      expect(defaultApp.physics.bodies.ids()).toEqual([]);
      expect(() => isolatedApp.physics).toThrow(/await preloadPhysics\(\)/i);
      expect(() => game.app.physics).toThrow(/await preloadPhysics\(\)/i);
      expect(() => createAuraAppWithPhysicsWorldAccess(isolated, "#unresolved", { scene: scene().add(box("too-early")) })).toThrow(/await preloadPhysics\(\)/i);
      expect(isolatedWorlds).toHaveLength(0);

      await isolated.preload();
      isolatedApp.setScene(scene().add(box("isolated")));
      game.app.setScene(scene().add(box("game")));
      expect(isolatedApp.physics.bodies.has("isolated")).toBe(true);
      expect(game.app.physics.bodies.has("game")).toBe(true);
      expect(isolatedWorlds).toHaveLength(4); // public and preview worlds per app
      expect(legacyWorlds).toHaveLength(2);
      isolatedApp.dispose();
      expect(isolatedWorlds.slice(0, 2).every((world) => (world as unknown as { disposed: boolean }).disposed)).toBe(true);
      expect(isolatedWorlds.slice(2).every((world) => !(world as unknown as { disposed: boolean }).disposed)).toBe(true);
      expect(legacyApp.physics.bodies.has("legacy")).toBe(true);
    } finally {
      isolatedApp.dispose(); game.dispose(); legacyApp.dispose(); defaultApp.dispose();
    }
    expect(isolatedWorlds.every((world) => (world as unknown as { disposed: boolean }).disposed)).toBe(true);
    expect(legacyWorlds.every((world) => (world as unknown as { disposed: boolean }).disposed)).toBe(true);
  });

  it("preflights construction before canvas acquisition and releases an already-created world", async () => {
    const failure = new Error("constructor refused");
    let construction = 0;
    const worlds: PhysicsWorld[] = [];
    class FailingWorld extends PhysicsWorld {
      constructor(...args: ConstructorParameters<typeof PhysicsWorld>) {
        if (++construction === 2) throw failure;
        super(...args);
        worlds.push(this);
      }
    }
    const access = createPhysicsWorldProvider(loader(FailingWorld));
    await access.preload();
    // Headless mode also owns a preview world: fail the second constructor.
    expect(() => createAuraAppWithPhysicsWorldAccess(access, headless, { scene: scene().add(box("new")) })).toThrow(failure);
    expect(worlds).toHaveLength(1);
    expect((worlds[0] as unknown as { disposed: boolean }).disposed).toBe(true);
    construction = 1;
    expect(() => createAuraAppWithPhysicsWorldAccess(access, "#unresolved", { scene: scene().add(box("new")) })).toThrow(failure);
  });

  it("does not change a live scene when its replacement world constructor fails", async () => {
    const failure = new Error("replacement constructor refused");
    let failNext = false;
    class FailingReplacementWorld extends PhysicsWorld {
      constructor(...args: ConstructorParameters<typeof PhysicsWorld>) {
        if (failNext) throw failure;
        super(...args);
      }
    }
    const access = createPhysicsWorldProvider(loader(FailingReplacementWorld));
    await access.preload();
    const app = createAuraAppWithPhysicsWorldAccess(access, headless, { scene: scene().add(box("old")), autoStart: false });
    try {
      const before = app.scene;
      const handle = app.nodes.require("old");
      const ids = app.physics.bodies.ids();
      failNext = true;
      expect(() => app.setScene(scene().add(box("new")))).toThrow(failure);
      expect(app.scene).toBe(before);
      expect(app.nodes.require("old")).toBe(handle);
      expect(app.physics.bodies.ids()).toEqual(ids);
      expect(app.physics.bodies.has("old")).toBe(true);
    } finally { app.dispose(); }
  });

  it("disposes both staged worlds if the first declarative swap fails", async () => {
    const failure = new Error("first app-world collider refused");
    const worlds: PhysicsWorld[] = [];
    class FailingFirstSwapWorld extends PhysicsWorld {
      constructor(...args: ConstructorParameters<typeof PhysicsWorld>) { super(...args); worlds.push(this); }
      override createCollider(...args: Parameters<PhysicsWorld["createCollider"]>) {
        if (this === worlds[1]) throw failure;
        return super.createCollider(...args);
      }
    }
    const access = createPhysicsWorldProvider(loader(FailingFirstSwapWorld));
    await access.preload();
    const app = createAuraAppWithPhysicsWorldAccess(access, headless, {
      scene: scene().add(primitives.box({ name: "old" }).runtime({ id: "old" })), autoStart: false
    });
    try {
      const before = app.scene;
      const handle = app.nodes.require("old");
      expect(() => app.setScene(scene().add(box("new")))).toThrow(failure);
      expect(app.scene).toBe(before);
      expect(app.nodes.require("old")).toBe(handle);
      expect(worlds).toHaveLength(2);
      expect(worlds.every((world) => (world as unknown as { disposed: boolean }).disposed)).toBe(true);
      // Failed construction did not leave a disposed world cached on the app.
      expect(app.physics.bodies.ids()).toEqual([]);
      expect(worlds).toHaveLength(3);
    } finally { app.dispose(); }
  });

  it("disposes the staged world if a later app initialization fails", async () => {
    const worlds: PhysicsWorld[] = [];
    class TrackingWorld extends PhysicsWorld {
      constructor(...args: ConstructorParameters<typeof PhysicsWorld>) { super(...args); worlds.push(this); }
    }
    const access = createPhysicsWorldProvider(loader(TrackingWorld));
    await access.preload();
    expect(() => createAuraAppWithPhysicsWorldAccess(access, "#missing", { scene: scene().add(box("staged")) })).toThrow(/document is unavailable/i);
    expect(worlds).toHaveLength(1);
    expect((worlds[0] as unknown as { disposed: boolean }).disposed).toBe(true);
  });

  it("rolls back a failed replacement and retains scene handles and runtime bodies", async () => {
    const failure = new Error("collider refused");
    const worlds: PhysicsWorld[] = [];
    let failOnPublicWorld = false;
    class FailingColliderWorld extends PhysicsWorld {
      constructor(...args: ConstructorParameters<typeof PhysicsWorld>) { super(...args); worlds.push(this); }
      override createCollider(...args: Parameters<PhysicsWorld["createCollider"]>) {
        if (this === worlds[0] && failOnPublicWorld) throw failure;
        return super.createCollider(...args);
      }
    }
    const access = createPhysicsWorldProvider(loader(FailingColliderWorld));
    await access.preload();
    const app = createAuraAppWithPhysicsWorldAccess(access, headless, {
      scene: scene().add(box("old")).add(box()), autoStart: false
    });
    try {
      const oldScene = app.scene;
      const oldHandle = app.nodes.require("old");
      const retained = app.physics.createBody({ name: "runtime" });
      const oldIds = app.physics.bodies.ids();
      failOnPublicWorld = true;
      expect(() => app.setScene(scene().add(box("replacement")))).toThrow(failure);
      expect(app.scene).toBe(oldScene);
      expect(app.nodes.require("old")).toBe(oldHandle);
      expect(app.physics.bodies.ids()).toEqual(oldIds);
      expect(app.physics.bodies.has("old")).toBe(true);
      expect(app.physics.bodies.get("runtime")?.id).toBe(retained.id);
      expect((worlds[2] as unknown as { disposed: boolean }).disposed).toBe(true);

      failOnPublicWorld = false;
      app.setScene(scene().add(box("replacement")));
      expect(app.physics.bodies.has("old")).toBe(false);
      expect(app.physics.bodies.has("replacement")).toBe(true);
      expect(app.physics.bodies.get("runtime")?.id).toBe(retained.id);
      expect(app.physics.bodies.ids()).toHaveLength(2); // named and unnamed old declarations retired
    } finally { app.dispose(); }
  });

  it("leaves an existing scene intact when an unready provider rejects a swap", async () => {
    const isolated = createPhysicsWorldProvider(loader(PhysicsWorld));
    const app = createAuraAppWithPhysicsWorldAccess(isolated, headless, {
      scene: scene().add(primitives.box({ name: "still-here" }).runtime({ id: "still-here" })), autoStart: false
    });
    try {
      const before = app.scene;
      const handle = app.nodes.require("still-here");
      expect(() => app.setScene(scene().add(box("too-early")))).toThrow(/await preloadPhysics\(\)/i);
      expect(app.scene).toBe(before);
      expect(app.nodes.require("still-here")).toBe(handle);
      await isolated.preload();
      app.setScene(scene().add(box("ready")));
      expect(app.physics.bodies.has("ready")).toBe(true);
    } finally { app.dispose(); }
  });

  it("imports both injected cores without evaluating the legacy physics world", async () => {
    const evaluated = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      evaluated();
      return { PhysicsWorld: class {}, ensurePhysics: async () => ({ World: class {}, init: async () => {} }) };
    });
    try {
      const appCore = await import("../../../packages/engine/src/agent-api/app/createAuraAppCore.js");
      const gameCore = await import("../../../packages/engine/src/agent-api/app/createGameAppCore.js");
      expect(appCore.createAuraAppWithPhysicsWorldAccess).toBeTypeOf("function");
      expect(gameCore.createGameAppWithPhysicsWorldAccess).toBeTypeOf("function");
      expect(evaluated).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  });
});
