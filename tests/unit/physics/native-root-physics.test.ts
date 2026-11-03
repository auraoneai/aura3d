import { describe, expect, it, vi } from "vitest";
import { createRuntimeScenePhysics, physics } from "../../../packages/engine/src/agent-api/nodes/physics.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { ScenePhysicsBridge } from "../../../packages/physics/src/ScenePhysicsBridge.js";
import { PhysicsWorld } from "../../../packages/physics/src/PhysicsWorld.js";
import { Shape, rotateVec3ByQuat } from "../../../packages/physics/src/Shape.js";
import { createCollisionLayers, createPhysicsRuntime } from "../../../packages/engine/src/agent-api/PhysicsRuntime.js";
import { createGameCollisionWorld } from "../../../packages/engine/src/agent-api/GameRuntime.js";

const tetra = [[0, 0.5, 0], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0, -0.5, 0.5]] as const;
const tetraTriangles = [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2] as const;
const floorVertices = [[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]] as const;
const floorTriangles = [0, 2, 1, 0, 3, 2] as const;
const dt = 1 / 60;

function expectVectorClose(actual: readonly number[], expected: readonly number[]): void {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 5));
}

describe("root physics world contracts", () => {
  it("allows the root module to load if optional WASM initialization fails", async () => {
    const failure = new Error("root optional WASM failure");
    vi.resetModules();
    vi.doMock("@dimforge/rapier3d-compat", () => ({ init: async () => { throw failure; } }));
    try {
      const root = await import("../../../packages/engine/src/public/index.js");
      expect(root.createAuraApp).toBeTypeOf("function");
      expect(root.physics.world).toBeTypeOf("function");
      try {
        root.physics.world();
        expect.fail("Expected physics construction to report the initialization failure.");
      } catch (error) {
        expect((error as Error).cause).toBe(failure);
      }
    } finally {
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });

  it("waits for backend initialization in both asynchronous world constructors", async () => {
    let release = () => {};
    let notifyStarted = () => {};
    let ready: Promise<void> = Promise.resolve();
    vi.doMock("@aura3d/physics", () => ({
      ensurePhysics: () => { notifyStarted(); return ready; }
    }));
    try {
      for (const create of [() => physics.worldAsync(), () => physics.worldFromSceneAsync(scene())]) {
        const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
        ready = new Promise<void>((resolve) => { release = resolve; });
        const pending = create();
        try {
          const outcome = await Promise.race([started.then(() => "initializing"), pending.then(() => "constructed")]);
          expect(outcome).toBe("initializing");
        } finally {
          release();
          const world = await pending;
          world.dispose();
        }
      }
    } finally {
      vi.doUnmock("@aura3d/physics");
    }
  });

  it("releases partial scene worlds when a later collider is invalid", async () => {
    const invalidScene = () => scene()
      .add(primitives.box().physics({ type: "dynamic", shape: "box" }))
      .add(primitives.plane().physics({ type: "dynamic", shape: "plane" }));
    const dispose = vi.spyOn(PhysicsWorld.prototype, "dispose");
    try {
      expect(() => physics.worldFromScene(invalidScene())).toThrow(/static bodies/);
      await expect(physics.worldFromSceneAsync(invalidScene())).rejects.toThrow(/static bodies/);
      expect(() => createRuntimeScenePhysics(invalidScene().toJSON())).toThrow(/static bodies/);
      expect(dispose).toHaveBeenCalledTimes(3);
    } finally {
      dispose.mockRestore();
    }
  });
  it("replays body and joint handles across reset, isolates worlds and disposes ownership", () => {
    const one = physics.world({ gravity: [0, 0, 0], enableSleeping: false });
    const two = physics.world({ gravity: [0, 0, 0], enableSleeping: false });
    const staticBody = one.createBody({ type: "static", shape: physics.box(0.25, 0.25, 0.25) });
    const body = one.createBody({ position: [2, 0, 0], shape: physics.sphere(0.25) });
    const other = two.createBody({ shape: physics.sphere(0.25) });
    const node = { position: [2, 0, 0] as [number, number, number] };
    one.bindNode(body, node);
    const joint = one.createConstraint({ type: "fixed", bodyA: staticBody, bodyB: body });
    expect(() => one.createCollider(other, { shape: physics.sphere() })).toThrow(/does not belong/);
    expect(() => one.createConstraint({ type: "fixed", bodyA: other, bodyB: body })).toThrow(/does not belong/);
    body.setPosition([4, 0, 0]);
    one.step(dt);
    one.reset();
    expect(one.getBody(body.id)).toBe(body);
    expectVectorClose(body.position, [2, 0, 0]);
    expectVectorClose(node.position, [2, 0, 0]);
    expect(joint.bodyA).toBe(staticBody);
    joint.setEnabled(false);
    body.setVelocity([1, 0, 0]);
    one.step(dt);
    expect(body.position[0]).toBeGreaterThan(2);
    expect(two.snapshot().bodies).toBe(1);
    one.dispose();
    one.dispose();
    expect(() => one.step()).toThrow(/disposed/);
    expect(() => body.setPosition([0, 0, 0])).toThrow(/disposed/);
    // Releasing the first world's binding lets another world own the scene node.
    two.bindNode(other, node);
    two.dispose();
  });

  it("retains shape, sensor, layer and material options across reset and returns all step events", () => {
    const world = physics.world({ gravity: [0, 0, 0], enableSleeping: false });
    const trigger = world.createBody({ type: "static", shape: physics.sphere(1), sensor: true, filter: { layer: 2, mask: 4 } });
    const visitor = world.createBody({ position: [0, 0, 0], shape: physics.sphere(0.25), filter: { layer: 4, mask: 2 } });
    world.createBody({ type: "static", position: [5, 0, 0], shape: physics.box(0.5, 0.5, 0.5), filter: { layer: 8, mask: 8 } });
    const events = world.step({ dt, steps: 2 });
    expect(events.some((event) => event.type === "begin")).toBe(true);
    expect(world.contacts().some((contact) => contact.sensor)).toBe(true);
    expect(world.raycast([-4, 0, 0], [1, 0, 0], { mask: 2, includeSensors: true })?.bodyId).toBe(trigger.id);
    expect(world.raycast([-4, 0, 0], [1, 0, 0], { mask: 4 })?.bodyId).toBe(visitor.id);
    expect(world.raycast([-4, 0, 0], [1, 0, 0], { mask: 2 })).toBeUndefined();
    world.reset();
    expect(world.step(dt).some((event) => event.type === "begin")).toBe(true);
    expect(world.contacts().some((contact) => contact.sensor)).toBe(true);
    expect(() => world.step({ dt, steps: 0 })).toThrow(/positive integer/);
    expect(() => world.step({ dt: NaN })).toThrow(/finite and positive/);
    world.dispose();
  });

  for (const [label, surface] of [
    ["mesh", () => physics.mesh(floorVertices, floorTriangles)],
    ["heightfield", () => physics.heightfield([[0, 0], [0, 0]], 6)]
  ] as const) {
    it(`collides a convex hull with a static ${label}`, () => {
      const world = physics.world({ gravity: [0, -9.81, 0], enableSleeping: false });
      world.createBody({ type: "static", shape: surface() });
      const body = world.createBody({ position: [0, 2, 0], shape: physics.convexHull(tetra, tetraTriangles) });
      world.step({ dt, steps: 240 });
      expect(body.position[1]).toBeGreaterThan(0.3);
      expect(body.position[1]).toBeLessThan(0.8);
      expect(world.contacts().length).toBeGreaterThan(0);
      world.dispose();
    });
  }

  it("detects real heightfield sensor overlap for supported convex shapes", () => {
    const shapes = [Shape.sphere(0.3), Shape.box(0.3, 0.3, 0.3), Shape.capsule(0.3, 0.4), Shape.convexHull(tetra, tetraTriangles)];
    for (const shape of shapes) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
      try {
        const terrain = world.createRigidBody({ type: "static" });
        const terrainCollider = world.createCollider(terrain, { shape: Shape.heightfield([[0, 0], [0, 0]], 2), sensor: true });
        const visitor = world.createRigidBody({ position: [0, 0.15, 0] });
        const visitorCollider = world.createCollider(visitor, { shape });
        const begin = world.step();
        expect(begin.map((event) => event.type), shape.kind).toEqual(["begin"]);
        expect(begin[0]?.contact).toMatchObject({ colliderA: terrainCollider.id, colliderB: visitorCollider.id, sensor: true });
        expect(world.step().map((event) => event.type), shape.kind).toEqual(["stay"]);
        visitor.setPosition([0, 2, 0]);
        expect(world.step().map((event) => event.type), shape.kind).toEqual(["end"]);
      } finally { world.dispose(); }
    }
  });

  it("queries box overlap against the real transformed heightfield", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const terrain = world.createRigidBody({ type: "static" });
      const collider = world.createCollider(terrain, { shape: Shape.heightfield([[0, 0], [0, 0]], 2), filter: { layer: 2 } });
      const box = Shape.box(0.3, 0.3, 0.3);
      expect(world.overlapShape([0, 0.15, 0], box)).toEqual([collider]);
      expect(world.overlapShape([1.25, 0.15, 0], box)).toEqual([collider]);
      expect(world.overlapShape([1.4, 0.15, 0], box)).toEqual([]);
      expect(world.overlapShape([1.15, 0.15, 1.15], Shape.sphere(0.3))).toEqual([collider]);
      expect(world.overlapShape([1.25, 0.15, 1.25], Shape.sphere(0.3))).toEqual([]);
      expect(world.overlapShape([0, 0.15, 0], box, { mask: 4 })).toEqual([]);
      terrain.setPosition([2, 3, 4]);
      terrain.setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2]);
      expect(world.overlapShape([0, 0.15, 0], box)).toEqual([]);
      expect(world.overlapShape([2.15, 3, 4], box)).toEqual([collider]);
      expect(world.overlapShape([2.8, 3, 4], box)).toEqual([]);
    } finally { world.dispose(); }
  });

  it("uses heightfield sensor geometry rather than overlapping bounds and honors filters", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    try {
      const terrain = world.createRigidBody({ type: "static" });
      world.createCollider(terrain, { shape: Shape.heightfield([[0, 0], [0, 0]], 2), filter: { layer: 1, mask: 2 } });
      const visitor = world.createRigidBody({ position: [1.25, 0.15, 1.25] });
      world.createCollider(visitor, { shape: Shape.capsule(0.3, 0.4), sensor: true, filter: { layer: 2, mask: 1 } });
      expect(world.step()).toEqual([]);
      expect(world.snapshot().stats.broadphasePairs).toBe(1);
      visitor.setPosition([1.15, 0.15, 1.15]);
      expect(world.step().map((event) => event.type)).toEqual(["begin"]);

      const excluded = world.createRigidBody({ position: [0, 0.15, 0] });
      world.createCollider(excluded, { shape: Shape.capsule(0.3, 0.4), sensor: true, filter: { layer: 4, mask: 1 } });
      expect(world.step().map((event) => event.type)).toEqual(["stay"]);
      expect(world.snapshot().contacts).toHaveLength(1);
    } finally { world.dispose(); }
  });

  it("detects heightfield sensor contact using transformed collider geometry", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    try {
      const terrain = world.createRigidBody({ type: "static", position: [2, 3, 4], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
      world.createCollider(terrain, { shape: Shape.heightfield([[0, 0], [0, 0]], 2), sensor: true });
      const visitor = world.createRigidBody({ position: [2.15, 3, 4] });
      world.createCollider(visitor, { shape: Shape.capsule(0.3, 0.4) });
      expect(world.step().map((event) => event.type)).toEqual(["begin"]);
      visitor.setPosition([2.8, 3, 4]);
      expect(world.step().map((event) => event.type)).toEqual(["end"]);
    } finally { world.dispose(); }
  });

  it("reports heightfield sensors for fixed and kinematic visitors and ends them on removal", () => {
    for (const type of ["static", "kinematic"] as const) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
      try {
        const terrain = world.createRigidBody({ type: "static" });
        world.createCollider(terrain, { shape: Shape.heightfield([[0, 0], [0, 0]], 2), sensor: true });
        const visitor = world.createRigidBody({ type, position: [0, 0.15, 0] });
        const collider = world.createCollider(visitor, { shape: Shape.box(0.3, 0.3, 0.3) });
        expect(world.step().map((event) => event.type), type).toEqual(["begin"]);
        world.drainEvents();
        world.removeCollider(collider.id);
        expect(world.drainEvents().map((event) => event.type), type).toEqual(["end"]);
        expect(world.snapshot().contacts).toEqual([]);
      } finally { world.dispose(); }
    }
  });

  it("replays deterministic seeded steps and rejects unsupported input explicitly", () => {
    const run = () => {
      const world = physics.world({ gravity: [0, -9.81, 0], seed: 42, enableSleeping: false });
      world.createBody({ type: "static", shape: physics.box(2, 0.5, 2), position: [0, -0.5, 0] });
      world.createBody({ position: [0, 2, 0], shape: physics.capsule(0.2, 0.3) });
      world.step({ dt, steps: 30 });
      const result = world.snapshot().snapshot.bodies;
      world.dispose();
      return result;
    };
    expect(run()).toEqual(run());
    expect(() => physics.world({ backend: "aura-js" as never })).toThrow(/backend/i);
    expect(() => physics.resolveShape({ shape: "unknown" as never })).toThrow(/Unsupported physics shape/);
    expect(() => physics.resolveShape({ shape: "sphere", halfExtents: [1, 1, 1] })).toThrow(/halfExtents/);
    expect(() => physics.resolveShape({ density: 2 })).toThrow(/density/);
  });
});

describe("scene physics ownership and parent transforms", () => {
  it("pushes and pulls through rotated, translated, scaled ancestors", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const kinematic = world.createRigidBody({ type: "kinematic" });
    const dynamic = world.createRigidBody({ position: [10, 4, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    const parent = { position: [10, 0, 0] as [number, number, number], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number], scale: [2, 2, 2] as const };
    const platform = { parent, position: [1, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] };
    const moving = { parent, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: kinematic.id, node: platform, mode: "kinematic" });
    bridge.bind({ bodyId: dynamic.id, node: moving });
    bridge.update(world);
    expectVectorClose(kinematic.position, [10, 2, 0]);
    expectVectorClose(kinematic.rotation, parent.rotation);
    expectVectorClose(moving.position, [2, 0, 0]);
    expectVectorClose(moving.rotation, [0, 0, 0, 1]);
    bridge.dispose();
    world.dispose();
  });

  it("rejects cross-world and duplicate-node ownership, and releases it on unbind/dispose", () => {
    const first = new PhysicsWorld();
    const second = new PhysicsWorld();
    const a = first.createRigidBody();
    const b = second.createRigidBody();
    const node = { position: [0, 0, 0] as [number, number, number] };
    const left = new ScenePhysicsBridge();
    const right = new ScenePhysicsBridge();
    left.bind({ bodyId: a.id, node });
    expect(() => right.bind({ bodyId: b.id, node })).toThrow(/already bound/);
    left.pullDynamic(first);
    expect(() => left.pullDynamic(second)).toThrow(/different world/);
    left.unbind(a.id);
    right.bind({ bodyId: b.id, node });
    right.dispose();
    left.bind({ bodyId: a.id, node });
    left.dispose();
    expect(() => left.pullDynamic(first)).toThrow(/disposed/);
    first.dispose(); second.dispose();
  });

  it("updates bound parents before children even when the child is bound first", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const parentBody = world.createRigidBody({ position: [10, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    const childBody = world.createRigidBody({ position: [10, 2, 0] });
    const parent = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] };
    const child = { parent, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: childBody.id, node: child });
    bridge.bind({ bodyId: parentBody.id, node: parent });
    bridge.pullDynamic(world);
    expectVectorClose(parent.position, [10, 0, 0]);
    expectVectorClose(child.position, [2, 0, 0]);
    expectVectorClose(child.rotation, [0, 0, -Math.SQRT1_2, Math.SQRT1_2]);
    bridge.dispose();
    world.dispose();
  });

  it("composes local ancestors with non-uniform scale even when world getters exist", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const pushed = world.createRigidBody({ type: "kinematic" });
    const pulled = world.createRigidBody({ position: [0, 0, 0] });
    const grandparent = { position: [0, 0, 0] as [number, number, number], scale: [2, 1, 1] as const };
    const parent = {
      parent: grandparent,
      position: [1, 0, 0] as [number, number, number],
      rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number],
      getWorldPosition: () => [2, 0, 0] as const,
      getWorldQuaternion: () => [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const
    };
    const kinematic = { parent, position: [0, 1, 0] as [number, number, number] };
    const dynamic = { parent, position: [0, 0, 0] as [number, number, number] };
    const bridge = new ScenePhysicsBridge();
    bridge.bind({ bodyId: pushed.id, node: kinematic, mode: "kinematic" });
    bridge.bind({ bodyId: pulled.id, node: dynamic });
    bridge.update(world);
    expectVectorClose(pushed.position, [0, 0, 0]);
    expectVectorClose(dynamic.position, [0, 1, 0]);
    bridge.dispose();
    world.dispose();
  });
});

describe("app physics runtime integration", () => {
  it("cleans failed game body creation and disposes the previous world on clear", () => {
    const disposed = vi.spyOn(PhysicsWorld.prototype, "dispose");
    const snapshots = vi.spyOn(PhysicsWorld.prototype, "snapshot");
    const collision = createGameCollisionWorld({ gravity: [0, 0, 0] });
    try {
      const body = collision.addSphere("player", 0.25);
      expect(() => collision.add({ id: "bad", shape: Shape.plane() })).toThrow(/static bodies/);
      expect(collision.snapshot().stats.bodies).toBe(1);
      collision.clear();
      expect(disposed).toHaveBeenCalledTimes(1);
      expect(collision.snapshot().stats.bodies).toBe(0);
      expect(() => body.setPosition([1, 0, 0])).toThrow(/removed/);
      const reused = collision.addSphere("player", 0.25);
      expect(() => body.snapshot()).toThrow(/removed/);
      expect(collision.remove("player")).toBe(true);
      expect(() => reused.setVelocity([1, 0, 0])).toThrow(/removed/);
    } finally {
      (snapshots.mock.contexts.at(-1) as PhysicsWorld | undefined)?.dispose();
      snapshots.mockRestore();
      disposed.mockRestore();
    }
  });

  it("converts joint anchors and axis from world space for both rotated bodies", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    const a = world.createRigidBody({ type: "static", position: [2, 1, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    const b = world.createRigidBody({ position: [2, 2, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
    const runtime = createPhysicsRuntime(world);
    runtime.createJoint({ kind: "slider", bodyA: a.id, bodyB: b.id, anchor: [2, 1, 0], axis: [0, 1, 0] });
    const joint = world.constraints()[0]!;
    for (const [body, local] of [[a, joint.localAnchorA], [b, joint.localAnchorB]] as const) {
      const offset = rotateVec3ByQuat(local, body.rotation);
      expectVectorClose(offset.map((value, i) => value + body.position[i]!), [2, 1, 0]);
    }
    b.applyImpulse([0, 1, 0]);
    for (let i = 0; i < 60; i++) runtime.step(dt);
    expect(b.position[1]).toBeGreaterThan(2.4);
    expect(b.position[0]).toBeCloseTo(2, 3);
    expect(b.position[2]).toBeCloseTo(0, 3);
    world.dispose();
  });

  it("uses world up as the default hinge axis with differently rotated bodies", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    const a = world.createRigidBody({ type: "static", rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    const b = world.createRigidBody({ rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
    const runtime = createPhysicsRuntime(world);
    runtime.createJoint({ kind: "hinge", bodyA: a.id, bodyB: b.id });
    b.applyAngularImpulse([0, 1, 0]);
    for (let i = 0; i < 60; i++) runtime.step(dt);
    expect(Math.abs(b.angularVelocity[1])).toBeGreaterThan(0.5);
    expect(b.angularVelocity[0]).toBeCloseTo(0, 2);
    expect(b.angularVelocity[2]).toBeCloseTo(0, 2);
    world.dispose();
  });

  it("uses collider geometry for overlaps, filters, ray ignores and moved bodies", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const layers = createCollisionLayers({ solid: ["solid"], sensor: ["sensor"] });
    const runtime = createPhysicsRuntime(world, { layers });
    const large = runtime.createBody({ name: "large", type: "static", position: [3, 0, 0], shape: "box", halfExtents: [2.5, 0.2, 0.2], layer: "solid" });
    runtime.createBody({ name: "near", type: "static", position: [0, 0.9, 0], shape: "sphere", radius: 0.1, sensor: true, layer: "sensor" });
    expect(runtime.queries.overlapSphere([0, 0, 0], 0.6).map((body) => body.nodeName)).toEqual(["large"]);
    expect(runtime.queries.overlapBox([0, 0, 0], [0.6, 0.3, 0.3], { layers: ["solid"] }).map((body) => body.nodeName)).toEqual(["large"]);
    expect(runtime.queries.overlapSphere([0, 0.9, 0], 0.2, { layers: ["sensor"] }).map((body) => body.nodeName)).toEqual(["near"]);
    expect(runtime.queries.raycast([-1, 0, 0], [1, 0, 0], { ignore: [large.id] })).toBeUndefined();
    large.setPosition([8, 0, 0]);
    expect(runtime.queries.overlapBox([0, 0, 0], [0.6, 0.3, 0.3])).toEqual([]);
    expect(() => runtime.queries.overlapSphere([0, 0, 0], -1)).toThrow(/radius/i);
    expect(() => runtime.queries.overlapSphere([0, 0, 0], 1, { layers: ["unknown"] })).toThrow(/Unknown collision layer/);
    world.dispose();
  });

  it("does not leak bodies on invalid creation and keeps names and joint lifetimes unambiguous", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const runtime = createPhysicsRuntime(world);
    expect(() => runtime.createBody({ layer: "missing" })).toThrow(/createCollisionLayers/);
    expect(() => runtime.createBody({ type: "static", shape: "mesh" })).toThrow(/needs geometry/);
    expect(() => runtime.createBody({ friction: -1 })).toThrow();
    expect(world.snapshot().stats.bodies).toBe(0);
    const a = runtime.createBody({ name: "a", type: "static" });
    runtime.createBody({ name: "b", position: [2, 0, 0] });
    expect(() => runtime.createBody({ name: "a" })).toThrow(/already exists/);
    expect(world.snapshot().stats.bodies).toBe(2);
    const first = runtime.createJoint({ kind: "fixed", bodyA: "a", bodyB: "b" });
    first.remove();
    first.remove();
    expect(world.snapshot().stats.constraints).toBe(0);
    expect(() => first.setEnabled(true)).toThrow(/removed/);
    const second = runtime.createJoint({ kind: "fixed", bodyA: "a", bodyB: "b" });
    expect(second.id).not.toBe(first.id);
    runtime.removeBody(a.id);
    expect(() => a.setPosition([0, 0, 0])).toThrow(/removed/);
    expect(() => a.position()).toThrow(/removed/);
    expect(() => second.setEnabled(true)).toThrow(/removed/);
    world.dispose();
  });

  it("rejects layer matrices that exceed the native collision-group capacity", () => {
    const layers = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`layer${i}`, []]));
    expect(() => createCollisionLayers(layers)).toThrow(/16 layers/);
  });

  it("places a runtime plane at the body's position only once", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const runtime = createPhysicsRuntime(world);
    runtime.createBody({ type: "static", shape: "plane", position: [0, 3, 0] });
    const hit = runtime.queries.raycast([0, 8, 0], [0, -1, 0]);
    expect(hit?.point[1]).toBeCloseTo(3, 5);
    world.dispose();
  });

  it("emits one trigger exit when an overlapping body is removed", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const runtime = createPhysicsRuntime(world);
    runtime.createBody({ type: "static", name: "trigger", sensor: true, shape: "sphere", radius: 1 });
    const visitor = runtime.createBody({ name: "visitor", shape: "sphere", radius: 0.25 });
    const events: string[] = [];
    runtime.onTriggerEnter(() => events.push("enter"));
    runtime.onTriggerExit(() => events.push("exit"));
    runtime.step(dt);
    runtime.removeBody(visitor.id);
    runtime.step(dt);
    expect(events).toEqual(["enter", "exit"]);
    world.dispose();
  });

  it("tests rotated collider shapes and deduplicates bodies with multiple colliders", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody({ type: "static", rotation: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] });
    world.createCollider(body, { shape: Shape.box(2, 0.1, 0.1) });
    world.createCollider(body, { shape: Shape.box(1.5, 0.1, 0.1) });
    const runtime = createPhysicsRuntime(world);
    expect(runtime.queries.overlapSphere([1, 1, 0], 0.1).map((hit) => hit.id)).toEqual([body.id]);
    expect(runtime.queries.overlapSphere([1, -1, 0], 0.1)).toEqual([]);
    world.dispose();
  });
});
