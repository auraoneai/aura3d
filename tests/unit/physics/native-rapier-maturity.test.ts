import { describe, expect, it, vi } from "vitest";
import {
  createCollidersFromSidecar,
  createRapierPhysicsSync,
  type RapierJointSpec,
  type RapierShapeSpec
} from "../../../packages/physics-rapier/src/index.js";

const sphere = { kind: "sphere", radius: 0.5 } as const;
const joint: RapierJointSpec = {
  type: "hinge", localAnchorA: [0, 0, 0], localAnchorB: [0, 0, 0], axis: [0, 1, 0],
  restLength: 0, stiffness: 1, damping: 0, motorSpeed: 0, maxMotorTorque: 10
};

describe("Rapier adapter capabilities and lifetime", () => {
  it("isolates worlds and rejects use of handles after removal or disposal", () => {
    const first = createRapierPhysicsSync();
    const second = createRapierPhysicsSync();
    try {
      const firstBody = first.createBody({ shape: sphere });
      const secondBody = second.createBody({ shape: sphere });
      // Native handles overlap between worlds, so checking only the numeric id is unsafe.
      expect(firstBody.id).toBe(secondBody.id);
      expect(() => first.createCollider(secondBody, { shape: sphere })).toThrow(/different world/);
      expect(() => first.removeBody(secondBody)).toThrow(/different world/);
      expect(() => first.createJoint(joint, firstBody, secondBody)).toThrow(/different world/);
      expect(first.bodies()).toHaveLength(1);
      expect(second.bodies()).toHaveLength(1);
      firstBody.remove();
      expect(() => firstBody.position()).toThrow(/removed/);
      expect(() => firstBody.remove()).not.toThrow();
      second.dispose();
      expect(() => secondBody.position()).toThrow(/disposed/);
      expect(() => secondBody.remove()).not.toThrow();
      expect(() => second.dispose()).not.toThrow();
    } finally { first.dispose(); second.dispose(); }
  });

  it("removes joints and vehicle controllers when their chassis is removed", () => {
    const world = createRapierPhysicsSync();
    try {
      const anchor = world.createBody({ type: "fixed", shape: sphere });
      const chassis = world.createBody({ shape: sphere });
      const hinge = world.createJoint(joint, anchor, chassis);
      const vehicle = world.createVehicleController(chassis);
      chassis.remove();
      expect(() => hinge.configureMotor(1, 1)).toThrow(/removed/);
      expect(() => vehicle.wheelCount()).toThrow(/disposed/);
      expect(() => hinge.remove()).not.toThrow();
      expect(() => vehicle.dispose()).not.toThrow();
      expect(world.bodies()).toEqual([anchor]);
    } finally { world.dispose(); }
  });

  it("rejects unsupported or malformed geometry without retaining partial bodies", () => {
    const world = createRapierPhysicsSync();
    try {
      const mesh = { kind: "mesh", vertices: [[0, 0, 0], [1, 0, 0], [0, 0, 1]], indices: [0, 1, 2] } as const;
      expect(() => world.createBody({ shape: mesh })).toThrow(/mesh.*fixed/);
      expect(world.bodies()).toHaveLength(0);
      const floor = world.createRigidBody({ type: "fixed" });
      expect(() => world.createCollider(floor, { shape: { ...mesh, indices: [0, 1, 99] } })).toThrow(/index/);
      expect(() => world.createCollider(floor, { shape: { kind: "heightfield", rows: 2, columns: 2, heights: [0, 0, NaN, 0], cellSize: 1 } })).toThrow(/sample/);
      expect(() => world.createCollider(floor, { shape: { kind: "plane", normal: [0, 0, 0], constant: 0 } })).toThrow(/normal/);
      expect(() => world.createCollider(floor, { shape: { kind: "unknown" } as unknown as RapierShapeSpec })).toThrow(/Unsupported.*shape/);
      expect(() => world.createCollider(floor, { shape: mesh })).not.toThrow();
      expect(world.bodies()).toEqual([floor]);
    } finally { world.dispose(); }
  });

  it("detects fixed sensors against kinematic bodies and refreshes moved queries", () => {
    const world = createRapierPhysicsSync({ gravity: [0, 0, 0] });
    try {
      const fixed = world.createRigidBody({ type: "fixed" });
      const sensor = world.createCollider(fixed, { shape: sphere, sensor: true });
      const player = world.createRigidBody({ type: "kinematic-position" });
      const playerCollider = world.createCollider(player, { shape: sphere });
      world.step();
      expect(world.unsafeRapierWorld().intersectionPair(sensor.unsafeRapierCollider(), playerCollider.unsafeRapierCollider())).toBe(true);
      player.setPosition([5, 0, 0]);
      expect(world.raycast([5, 0, 2], [0, 0, -3], 3)?.body).toBe(player);
      expect(world.unsafeRapierWorld().intersectionPair(sensor.unsafeRapierCollider(), playerCollider.unsafeRapierCollider())).toBe(false);
    } finally { world.dispose(); }
  });

  it("rejects unsupported joint options and invalid motor or step inputs", () => {
    const world = createRapierPhysicsSync();
    try {
      const a = world.createBody({ type: "fixed", shape: sphere });
      const b = world.createBody({ shape: sphere });
      expect(() => world.createJoint({ ...joint, type: "fixed", limits: [0, 1] }, a, b)).toThrow(/do not support limits/);
      expect(() => world.createJoint({ ...joint, type: "unknown" } as unknown as RapierJointSpec, a, b)).toThrow(/Unsupported.*joint/);
      expect(() => world.createJoint({ ...joint, axis: [0, 0, 0] }, a, b)).toThrow(/axis/);
      const fixedJoint = world.createJoint({ ...joint, type: "fixed" }, a, b);
      expect(() => fixedJoint.configureMotor(1, 1)).toThrow(/revolute/);
      expect(() => world.step(0)).toThrow(/greater than zero/);
      const motor = world.createJoint({ ...joint, type: "motorised-hinge" }, a, b);
      expect(() => motor.configureMotor(1, -1)).toThrow(/torque/);
    } finally { world.dispose(); }
  });

  it("preserves relative orientation through fixed joint local frames", () => {
    const world = createRapierPhysicsSync({ gravity: [0, 0, 0] });
    try {
      const anchor = world.createBody({ type: "fixed", shape: sphere });
      const halfAngle = Math.PI / 8;
      const orientation = [0, 0, Math.sin(halfAngle), Math.cos(halfAngle)] as const;
      const body = world.createBody({ rotation: orientation, shape: sphere });
      world.createJoint({ ...joint, type: "fixed", localRotationA: orientation }, anchor, body);
      for (let i = 0; i < 30; i += 1) world.step();
      const solved = body.unsafeRapierBody().rotation();
      expect(solved.z).toBeCloseTo(orientation[2], 4);
      expect(solved.w).toBeCloseTo(orientation[3], 4);
    } finally { world.dispose(); }
  });

  it("rolls back sidecar colliders when a later node is invalid", async () => {
    const { Document, NodeIO } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document.createAccessor().setBuffer(buffer).setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const scene = document.createScene();
    const good = document.createMesh().setExtras({ aura3dCollider: { shape: "box", halfExtents: [1, 1, 1], center: [0, 0, 0] } });
    good.addPrimitive(document.createPrimitive().setAttribute("POSITION", positions));
    const bad = document.createMesh().setExtras({ aura3dCollider: { shape: "box", halfExtents: [1, 1, 1] } });
    bad.addPrimitive(document.createPrimitive().setAttribute("POSITION", positions));
    scene.addChild(document.createNode("good").setMesh(good));
    scene.addChild(document.createNode("bad").setMesh(bad));
    const bytes = await new NodeIO().writeBinary(document);
    const world = createRapierPhysicsSync();
    try {
      await expect(createCollidersFromSidecar(world, bytes)).rejects.toThrow(/missing halfExtents\/center/);
      expect(world.bodies()).toHaveLength(0);
      const existing = world.createBody({ type: "fixed", shape: sphere });
      await expect(createCollidersFromSidecar(world, bytes, { body: existing })).rejects.toThrow(/missing halfExtents\/center/);
      expect(world.bodies()).toEqual([existing]);
      expect(existing.unsafeRapierBody().numColliders()).toBe(1);
    } finally { world.dispose(); }
  });

  it("validates vehicle changes before mutating wheel inputs or chassis pose", () => {
    const world = createRapierPhysicsSync();
    try {
      const body = world.createBody({ shape: sphere });
      const vehicle = world.createVehicleController(body);
      const wheel = { connection: [0, 0, 0], direction: [0, -1, 0], axle: [1, 0, 0], radius: 0.3, restLength: 0.3 } as const;
      expect(() => vehicle.addWheel({ ...wheel, frictionSlip: -1 })).toThrow(/frictionSlip/);
      expect(vehicle.wheelCount()).toBe(0);
      vehicle.addWheel(wheel).setWheelCommand(0, { engineForce: 5 });
      expect(() => vehicle.setWheelCommand(0, { engineForce: 20, brake: -1 })).toThrow(/brake/);
      expect(vehicle.wheelState(0).engineForce).toBe(5);
      expect(() => vehicle.setChassisPose([1, 2, 3], undefined, undefined, [0, NaN, 0])).toThrow(/angular velocity/);
      expect(vehicle.chassisPosition()).toEqual([0, 0, 0]);
      vehicle.setChassisPose([1, 2, 3], [0, 1, 0, 0]);
      vehicle.setChassisPose([4, 5, 6]);
      expect(vehicle.chassisRotation()).toEqual([0, 0, 0, 1]);
      expect(vehicle.wheelState(0).engineForce).toBe(0);
    } finally { world.dispose(); }
  });

  it("casts against the actual mesh faces and respects backface and distance options", () => {
    const world = createRapierPhysicsSync({ gravity: [0, 0, 0] });
    try {
      const body = world.createRigidBody({ type: "fixed" });
      const mesh = world.createCollider(body, { shape: { kind: "mesh", vertices: [
        [-2, 1, -2], [2, 1, -2], [-2, 1, 2],
        [-2, 0, -2], [-2, 0, 2], [2, 0, -2]
      ], indices: [0, 1, 2, 3, 4, 5] } });
      const ray = mesh.castRay([-0.5, 2, -0.5], [0, -2, 0], 3);
      expect(ray?.distance).toBeCloseTo(2, 5);
      expect(ray?.normal[1]).toBeCloseTo(1, 5);
      expect(mesh.castRay([-0.5, 2, -0.5], [0, -1, 0], 1.5)).toBeUndefined();
      expect(mesh.castRay([-0.5, 2, -0.5], [0, -1, 0], 3, true)?.distance).toBeCloseTo(1, 5);
      const sphereHit = mesh.castSphere([-0.5, 2, -0.5], 0.25, [0, -1, 0], 3);
      expect(sphereHit?.distance).toBeCloseTo(1.75, 4);
      expect(sphereHit?.point[1]).toBeCloseTo(0, 4);
      expect(mesh.castSphere([-0.5, 2, -0.5], 0.25, [0, -1, 0], 3, true)?.distance).toBeCloseTo(0.75, 4);
    } finally { world.dispose(); }
  });

  it("queries terrain and translated, rotated planes at solver geometry positions", () => {
    const world = createRapierPhysicsSync({ gravity: [0, 0, 0] });
    try {
      const terrainBody = world.createRigidBody({ type: "fixed" });
      const terrain = world.createCollider(terrainBody, { shape: { kind: "heightfield", rows: 2, columns: 2, heights: [0, 0, 0, 2], cellSize: 2 } });
      const hit = terrain.castRay([0.5, 3, 0.5], [0, -1, 0], 4);
      expect(hit?.point[1]).toBeCloseTo(1, 4);
      expect(hit?.normal[1]).toBeGreaterThan(0.5);
      expect(terrain.castRay([0.5, -1, 0.5], [0, 1, 0], 4)).toBeUndefined();
      expect(terrain.castRay([0.5, -1, 0.5], [0, 1, 0], 4, true)).toBeDefined();
      const planeBody = world.createRigidBody({ type: "fixed", position: [10, 2, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
      const plane = world.createCollider(planeBody, { shape: { kind: "plane", normal: [0, 1, 0], constant: 1 } });
      const planeHit = plane.castRay([7, 2, 0], [1, 0, 0], 4);
      expect(planeHit?.point[0]).toBeCloseTo(9, 4);
      expect(planeHit?.normal[0]).toBeCloseTo(-1, 4);
      expect(plane.castSphere([7, 2, 0], 0.25, [1, 0, 0], 4)?.distance).toBeCloseTo(1.75, 4);
    } finally { world.dispose(); }
  });

  it("uses the native terrain layout for asymmetric heightfields", () => {
    const world = createRapierPhysicsSync({ gravity: [0, 0, 0] });
    try {
      const body = world.createRigidBody({ type: "fixed" });
      const terrain = world.createCollider(body, { shape: { kind: "heightfield", rows: 3, columns: 4, heights: [0, 0.1, 0.3, 0.6, 0.2, 0.9, 1.5, 1, 0.5, 1.3, 0.4, 0.7], cellSize: 2 } });
      for (const x of [-2.7, -1.3, -0.7, 0.3, 1.3, 2.7]) {
        for (const z of [-1.6, -0.4, 0.4, 1.6]) {
          const front = terrain.castRay([x, 4, z], [0, -1, 0], 10);
          const native = terrain.castRay([x, 4, z], [0, -1, 0], 10, true);
          expect(front, `terrain front at ${x}, ${z}`).toBeDefined();
          expect(native, `terrain native at ${x}, ${z}`).toBeDefined();
          expect(front!.distance, `height at ${x}, ${z}`).toBeCloseTo(native!.distance, 4);
          expect(front!.normal[1], `normal at ${x}, ${z}`).toBeCloseTo(native!.normal[1], 4);
        }
      }
    } finally { world.dispose(); }
  });

  it("sweeps spheres and rays against convex hulls without box approximations", () => {
    const world = createRapierPhysicsSync({ gravity: [0, 0, 0] });
    try {
      const body = world.createRigidBody({ position: [3, 0, 0] });
      const hull = world.createCollider(body, { shape: { kind: "convex-hull", vertices: [[-1, -1, -1], [1, -1, -1], [0, 1, -1], [0, 0, 1]] } });
      const ray = hull.castRay([3, 3, 0], [0, -1, 0], 10);
      expect(ray).toBeDefined();
      expect(ray!.distance).toBeGreaterThan(2);
      expect(ray!.distance).toBeLessThan(3.5);
      const sweep = hull.castSphere([3, 3, 0], 0.25, [0, -1, 0], 10);
      expect(sweep).toBeDefined();
      expect(sweep!.distance).toBeLessThan(ray!.distance);
      expect(sweep!.castCenter[1] - sweep!.point[1]).toBeGreaterThan(0);
    } finally { world.dispose(); }
  });
});

describe("optional Rapier initialization failures", () => {
  it.each(["default", "lazy"] as const)("preserves absent-peer behavior in the %s initializer", async (mode) => {
    vi.resetModules();
    vi.doMock("@dimforge/rapier3d-compat", () => { throw new Error("optional module is unavailable"); });
    try {
      const initializer = mode === "default"
        ? await import("../../../packages/physics-rapier/src/rapierInit.js")
        : await import("../../../packages/physics-rapier/src/rapierInit.lazy.js");
      await expect(initializer.ensureRapier()).resolves.toBeNull();
      expect(initializer.getRapierModule()).toBeNull();
      expect(initializer.getRapierInitializationError()).toBeNull();
    } finally {
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });

  it("shares successful no-TLA initialization across concurrent preload calls", async () => {
    let release!: () => void;
    let reportStarted!: () => void;
    const started = new Promise<void>((resolve) => { reportStarted = resolve; });
    const completion = new Promise<void>((resolve) => { release = resolve; });
    const init = vi.fn(() => { reportStarted(); return completion; });
    vi.resetModules();
    vi.doMock("@dimforge/rapier3d-compat", () => ({ init }));
    try {
      const initializer = await import("../../../packages/physics-rapier/src/rapierInit.lazy.js");
      await started;
      const first = initializer.ensureRapier();
      const second = initializer.ensureRapier();
      expect(first).toBe(second);
      expect(initializer.getRapierModule()).toBeNull();
      release();
      expect((await first)?.init).toBe(init);
      expect(initializer.getRapierModule()?.init).toBe(init);
      expect(init).toHaveBeenCalledTimes(1);
    } finally {
      release();
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });

  it("defers a failed default WASM initialization to physics use", async () => {
    const failure = new Error("WASM initialization failed in test");
    vi.resetModules();
    vi.doMock("@dimforge/rapier3d-compat", () => ({ init: async () => { throw failure; } }));
    try {
      const initializer = await import("../../../packages/physics-rapier/src/rapierInit.js");
      expect(initializer.getRapierModule()).toBeNull();
      await expect(initializer.ensureRapier()).rejects.toBe(failure);
      const adapter = await import("../../../packages/physics-rapier/src/index.js");
      expect(() => adapter.createRapierPhysicsSync()).toThrow(/initializ/i);
      try { adapter.createRapierPhysicsSync(); } catch (error) { expect((error as Error).cause).toBe(failure); }
    } finally {
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });

  it("observes a failed background initialization and preserves its rejection", async () => {
    const failure = new Error("lazy WASM initialization failed in test");
    let rejectInitialization!: (reason: Error) => void;
    let reportStarted!: () => void;
    const started = new Promise<void>((resolve) => { reportStarted = resolve; });
    const initialization = new Promise<never>((_resolve, reject) => { rejectInitialization = reject; });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    vi.resetModules();
    vi.doMock("@dimforge/rapier3d-compat", () => ({ init: () => { reportStarted(); return initialization; } }));
    try {
      const initializer = await import("../../../packages/physics-rapier/src/rapierInit.lazy.js");
      await started;
      rejectInitialization(failure);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      await expect(initializer.ensureRapier()).rejects.toBe(failure);
      expect(initializer.getRapierModule()).toBeNull();
    } finally {
      process.off("unhandledRejection", onUnhandled);
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });
});
