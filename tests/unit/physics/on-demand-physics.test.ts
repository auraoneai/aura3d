import { describe, expect, it, vi } from "vitest";
import { createAuraApp, material, primitives, scene } from "@aura3d/engine";
import * as worldModule from "../../../packages/physics/src/world.js";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore.js";
import { createLegacyPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js";
import type { PhysicsWorldAccess } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldAccess.js";

/**
 * Lane 519: `physics: { load: "on-demand" }` (and the `aura3d({ physics: "lazy" })` build, which reports
 * `loadMode: "on-demand"` through the world module). The backend is only requested when a scene declares bodies or
 * `app.physics` is touched; declared bodies and event handlers queue until it has loaded; queries before that throw
 * the typed PHYSICS_NOT_READY error; the resulting simulation is identical to the eager one.
 */
const crateScene = () => scene().add(
  primitives.box({ name: "ground", material: material.pbr({ color: "#888" }) })
    .position(0, -0.5, 0)
    .physics({ type: "static", shape: "box", halfExtents: [5, 0.5, 5] })
).add(
  primitives.box({ name: "crate", material: material.pbr({ color: "#c98b4b" }) })
    .position(0, 2, 0)
    .physics({ type: "dynamic", shape: "box", halfExtents: [0.25, 0.25, 0.25], mass: 1 })
);
const plainScene = () => scene().add(primitives.box({ name: "plain", material: material.pbr({ color: "#fff" }) }));

/** The real (already initialised) world module behind an access that reports on-demand loading and counts preloads. */
function onDemandAccess(gate?: Promise<void>): PhysicsWorldAccess & { preloads: number } {
  const real = createLegacyPhysicsWorldAccess(worldModule);
  const access = {
    preloads: 0,
    loadMode: "on-demand" as const,
    preload: () => { access.preloads += 1; return (gate ?? Promise.resolve()).then(() => real.preload()); },
    requireReady: () => real.requireReady()
  };
  return access;
}

function stepped(positions: Array<readonly number[]>, app: ReturnType<typeof createAuraApp>, steps: number): void {
  for (let index = 0; index < steps; index += 1) app.physics.step(1 / 60);
  positions.push([...app.physics.bodies.require("crate").position()]);
}

describe("on-demand physics", { timeout: 60_000 }, () => {
  it("never requests the backend for an app that does not use physics", async () => {
    const access = onDemandAccess();
    const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, { scene: plainScene() });
    await app.ready();
    app.setScene(plainScene());
    await app.ready();
    expect(access.preloads).toBe(0);
    // Touching app.physics is the signal: it starts the load.
    void app.physics;
    expect(access.preloads).toBe(1);
    app.dispose();
  });

  it("starts loading when the initial scene declares bodies, queues them, and creates them on load", async () => {
    let open!: () => void;
    const access = onDemandAccess(new Promise<void>((resolve) => { open = resolve; }));
    const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, { scene: crateScene() });
    expect(access.preloads).toBe(1);
    const physics = app.physics;
    // Before load: typed error for anything that needs an answer, empty results for step/contacts.
    expect(() => physics.bodies.require("crate")).toThrowError(/^PHYSICS_NOT_READY: app\.physics\.bodies\.require\(\)/);
    try { physics.queries.raycast([0, 5, 0], [0, -1, 0]); expect.unreachable(); }
    catch (error) { expect(error).toMatchObject({ code: "PHYSICS_NOT_READY", name: "PhysicsNotReadyError" }); }
    expect(() => physics.createBody({ name: "late" })).toThrowError(/PHYSICS_NOT_READY/);
    expect(physics.step(1 / 60)).toEqual([]);
    expect(physics.contacts()).toEqual([]);
    open();
    await physics.ready();
    expect(app.physics).toBe(physics);
    expect(physics.bodies.has("crate")).toBe(true);
    expect(physics.bodies.has("ground")).toBe(true);
    expect(physics.createBody({ name: "late", shape: "sphere", radius: 0.1 }).nodeName).toBe("late");
    app.dispose();
  });

  it("simulates exactly like the eager app after N steps", async () => {
    const eager = createAuraApp(undefined as never, { scene: crateScene() });
    const lazy = createAuraApp(undefined as never, { scene: crateScene(), physics: { load: "on-demand" } });
    await lazy.physics.ready();
    const eagerPositions: Array<readonly number[]> = [];
    const lazyPositions: Array<readonly number[]> = [];
    for (const steps of [1, 30, 120]) {
      stepped(eagerPositions, eager, steps);
      stepped(lazyPositions, lazy, steps);
    }
    expect(lazyPositions).toEqual(eagerPositions);
    expect(eager.physics.bodies.require("crate").velocity()).toEqual(lazy.physics.bodies.require("crate").velocity());
    eager.dispose();
    lazy.dispose();
  });

  it("queues collision handlers registered before load and honours an early unsubscribe", async () => {
    const app = createAuraApp(undefined as never, { scene: crateScene(), physics: { load: "on-demand" } });
    const kept = vi.fn();
    const dropped = vi.fn();
    app.physics.onCollision(kept);
    const unsubscribe = app.physics.onCollision(dropped);
    unsubscribe();
    await app.ready();
    for (let index = 0; index < 180; index += 1) app.physics.step(1 / 60);
    expect(kept).toHaveBeenCalled();
    expect(dropped).not.toHaveBeenCalled();
    app.dispose();
  });

  it("app.ready() waits for a load in flight", async () => {
    let open!: () => void;
    const access = onDemandAccess(new Promise<void>((resolve) => { open = resolve; }));
    const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, { scene: crateScene() });
    let settled = false;
    const ready = app.ready().then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    open();
    await ready;
    expect(app.physics.bodies.has("crate")).toBe(true);
    app.dispose();
  });

  it("a scene replaced while loading only creates the current scene's bodies", async () => {
    let open!: () => void;
    const access = onDemandAccess(new Promise<void>((resolve) => { open = resolve; }));
    const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, { scene: crateScene() });
    app.setScene(scene().add(
      primitives.box({ name: "other", material: material.pbr({ color: "#fff" }) })
        .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 })
    ));
    open();
    await app.physics.ready();
    expect(app.physics.bodies.has("other")).toBe(true);
    expect(app.physics.bodies.has("crate")).toBe(false);
    app.dispose();
  });

  it("creates bodies for runtime nodes added while loading, and none for ones removed again", async () => {
    let open!: () => void;
    const access = onDemandAccess(new Promise<void>((resolve) => { open = resolve; }));
    const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, { scene: plainScene() });
    app.nodes.add(primitives.box({ name: "kept", material: material.pbr({ color: "#fff" }) }).runtime({ id: "kept" })
      .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 }));
    app.nodes.add(primitives.box({ name: "gone", material: material.pbr({ color: "#fff" }) }).runtime({ id: "gone" })
      .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 }));
    expect(access.preloads).toBe(1);
    app.nodes.remove("gone");
    open();
    await app.physics.ready();
    expect(app.physics.bodies.has("kept")).toBe(true);
    expect(app.physics.bodies.has("gone")).toBe(false);
    app.dispose();
  });

  it("surfaces a failed load as the typed error on ready(), in diagnostics, and on later calls", async () => {
    const stripped = Object.assign(new Error("PHYSICS_BACKEND_MISSING: physics was stripped at build time because no physics usage was found; set aura3d({ physics: true }) in vite.config"), { code: "PHYSICS_BACKEND_MISSING" });
    const access: PhysicsWorldAccess = {
      loadMode: "on-demand",
      preload: () => Promise.reject(stripped),
      requireReady: () => { throw stripped; }
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const app = createAuraAppWithPhysicsWorldAccess(access, undefined as never, { scene: crateScene() });
      await expect(app.physics.ready()).rejects.toBe(stripped);
      await app.ready();
      expect(app.diagnostics().errors.some((message) => message.includes("physics was stripped at build time"))).toBe(true);
      expect(() => app.physics.bodies.require("crate")).toThrow(stripped);
      expect(() => app.physics.step(1 / 60)).toThrow(stripped);
      app.dispose();
    } finally { errors.mockRestore(); }
  });

  it("leaves the default eager app unchanged: synchronous bodies and an already resolved ready()", async () => {
    const app = createAuraApp(undefined as never, { scene: crateScene() });
    expect(app.physics.bodies.has("crate")).toBe(true);
    await expect(app.physics.ready()).resolves.toBeUndefined();
    expect(app.physics).toBe(app.physics);
    app.dispose();
  });
});
