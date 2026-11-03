import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { Shape, rotateVec3ByQuat, type BoxShape, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { collideNative } from "../../../packages/physics/src/native/NativeCollision.js";
import { convexContact, convexPoints, convexShape } from "../../../packages/physics/src/native/NativeConvex.js";

function pair(shape: PhysicsShape, position: Vec3, id: number, rotation: readonly [number, number, number, number] = [0, 0, 0, 1]) {
  const body = new RigidBody(id, { position, rotation });
  return { body, collider: new Collider(id, id, { shape }) };
}

function closeVector(actual: Vec3, expected: Vec3, digits = 5): void {
  for (let axis = 0; axis < 3; axis += 1) expect(actual[axis]).toBeCloseTo(expected[axis]!, digits);
}

/** Independent separating-axis reference for two oriented rectangular boxes. */
function referenceBoxPenetration(a: BoxShape, bodyA: RigidBody, b: BoxShape, bodyB: RigidBody): number | undefined {
  const basis = (body: RigidBody) => ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]).map((axis) => rotateVec3ByQuat(axis, body.rotation));
  const aAxes = basis(bodyA), bAxes = basis(bodyB);
  const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const delta: Vec3 = [bodyB.position[0] - bodyA.position[0], bodyB.position[1] - bodyA.position[1], bodyB.position[2] - bodyA.position[2]];
  let minimum = Infinity;
  for (const axis of [...aAxes, ...bAxes, ...aAxes.flatMap((x) => bAxes.map((y) => cross(x, y)))]) {
    const magnitude = Math.hypot(...axis);
    if (magnitude < 1e-9) continue;
    const spanA = aAxes.reduce((sum, basisAxis, index) => sum + Math.abs(dot(axis, basisAxis)) * a.halfExtents[index]!, 0);
    const spanB = bAxes.reduce((sum, basisAxis, index) => sum + Math.abs(dot(axis, basisAxis)) * b.halfExtents[index]!, 0);
    const overlap = (spanA + spanB - Math.abs(dot(delta, axis))) / magnitude;
    if (overlap < -1e-8) return undefined;
    minimum = Math.min(minimum, overlap);
  }
  return minimum;
}

/** Squared distance from a point to a triangle using a plane projection and edge distances. */
function pointTriangleDistanceSquared(point: Vec3, triangle: readonly [Vec3, Vec3, Vec3]): number {
  const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const u = subtract(triangle[1], triangle[0]), v = subtract(triangle[2], triangle[0]);
  const w = subtract(point, triangle[0]);
  const uu = dot(u, u), uv = dot(u, v), vv = dot(v, v), wu = dot(w, u), wv = dot(w, v);
  const denominator = uu * vv - uv * uv;
  const x = (vv * wu - uv * wv) / denominator, y = (uu * wv - uv * wu) / denominator;
  if (x >= 0 && y >= 0 && x + y <= 1) {
    const offset: Vec3 = [w[0] - x * u[0] - y * v[0], w[1] - x * u[1] - y * v[1], w[2] - x * u[2] - y * v[2]];
    return dot(offset, offset);
  }
  return Math.min(...triangle.map((start, index) => {
    const edge = subtract(triangle[(index + 1) % 3]!, start), relative = subtract(point, start);
    const fraction = Math.max(0, Math.min(1, dot(relative, edge) / dot(edge, edge)));
    const offset: Vec3 = [relative[0] - fraction * edge[0], relative[1] - fraction * edge[1], relative[2] - fraction * edge[2]];
    return dot(offset, offset);
  }));
}

function expectBoxSurface(point: Vec3, shape: BoxShape, body: RigidBody, label: string): void {
  const inverse = [-body.rotation[0], -body.rotation[1], -body.rotation[2], body.rotation[3]] as const;
  const local = rotateVec3ByQuat([point[0] - body.position[0], point[1] - body.position[1], point[2] - body.position[2]], inverse);
  for (let axis = 0; axis < 3; axis += 1) expect(Math.abs(local[axis]!), `${label} axis ${axis}`).toBeLessThanOrEqual(shape.halfExtents[axis]! + 1e-5);
  expect(Math.min(...[0, 1, 2].map((axis) => Math.abs(Math.abs(local[axis]!) - shape.halfExtents[axis]!))), label).toBeLessThan(1e-5);
}

describe("independent native narrow phase", () => {
  it.each(["capsule", "heightfield", "both"] as const)("reports public heightfield sensor lifecycle when %s is a sensor", async (sensor) => {
    const { PhysicsWorld } = await import("../../../packages/physics/src/PhysicsWorld.js");
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const ground = world.createRigidBody({ type: "static" });
      const surface = world.createCollider(ground, { shape: Shape.heightfield([[0, 0], [0, 0]], 2), sensor: sensor === "heightfield" || sensor === "both" });
      const body = world.createRigidBody({ position: [1.31, 0.15, 0] });
      const collider = world.createCollider(body, { shape: Shape.capsule(0.3, 0.4), sensor: sensor === "capsule" || sensor === "both" });
      expect(world.step(1 / 60)).toEqual([]);
      expect(collideNative(collider, body, surface, ground)).toEqual([]);
      body.setPosition([0, 0.15, 0]);
      const begin = world.step(1 / 60);
      expect(world.snapshot().stats.broadphasePairs).toBe(1);
      expect(world.overlapShape([0, 0.1, 0], Shape.sphere(0.3)).some((item) => item.id === surface.id)).toBe(true);
      expect(collideNative(collider, body, surface, ground).length).toBeGreaterThan(0);
      expect(begin).toMatchObject([{ type: "begin", contact: { colliderA: surface.id, colliderB: collider.id, sensor: true } }]);
      expect(world.snapshot().contacts).toMatchObject([{ colliderA: surface.id, colliderB: collider.id, sensor: true }]);
      expect(world.step(1 / 60)).toMatchObject([{ type: "stay", contact: { sensor: true } }]);
      body.setPosition([1.31, 0.15, 0]);
      expect(world.step(1 / 60)).toMatchObject([{ type: "end", contact: { sensor: true } }]);
      expect(world.snapshot().contacts).toEqual([]);
      expect(world.step(1 / 60)).toEqual([]);
    } finally { world.dispose(); }
  });
  it("keeps frictionless box motion close to the public world across a terrain seam", async () => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld(), new NativePhysicsWorld()];
    try {
      const runs = worlds.map((world) => {
        const floor = world.createRigidBody({ type: "static" });
        world.createCollider(floor, { shape: Shape.mesh([[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]], [0, 1, 2, 0, 2, 3]), material: { friction: 0 } });
        const body = world.createRigidBody({ position: [-0.6, 0.22, 0], rotation: [0, Math.sin(0.2), 0, Math.cos(0.2)], velocity: [1.2, 0, 0], mass: 10, inertia: [3, 3, 3] });
        world.createCollider(body, { shape: Shape.box(0.4, 0.2, 0.5), material: { friction: 0 } });
        const snapshots: Array<{ position: Vec3; velocity: Vec3 }> = [];
        for (let frame = 0; frame < 60; frame += 1) {
          world.step(1 / 60);
          if ([9, 29, 59].includes(frame)) snapshots.push({ position: [...body.position], velocity: [...body.velocity] });
        }
        return snapshots;
      });
      for (let index = 0; index < 3; index += 1) {
        const existing = runs[0]![index]!, native = runs[1]![index]!;
        for (let axis = 0; axis < 3; axis += 1) {
          expect(Math.abs(native.position[axis]! - existing.position[axis]!)).toBeLessThan(0.001);
          expect(Math.abs(native.velocity[axis]! - existing.velocity[axis]!)).toBeLessThan(0.001);
        }
        expect(native.velocity[0]).toBeCloseTo(1.2, 6);
        expect(Math.abs(native.velocity[2])).toBeLessThan(1e-6);
      }
    } finally { for (const world of worlds) world.dispose(); }
  });
  it("keeps a coupled box stack near the public-world result", async () => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld(), new NativePhysicsWorld()];
    try {
      const samples = worlds.map((world) => {
        const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        world.createCollider(floor, { shape: Shape.box(5, 0.5, 5) });
        const boxes = [0.5, 1.5, 2.5].map((y) => {
          const body = world.createRigidBody({ position: [0, y, 0], mass: 1, inertia: [1, 1, 1] });
          world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
          return body;
        });
        for (let frame = 0; frame < 90; frame += 1) {
          world.step(1 / 60);
        }
        return boxes.map((body) => ({ position: [...body.position] as Vec3, velocity: [...body.velocity] as Vec3 }));
      });
      const [existing, native] = samples;
      for (let index = 0; index < 3; index += 1) {
        expect(Math.abs(native![index]!.position[1] - (index + 0.5))).toBeLessThan(0.005);
        expect(Math.abs(native![index]!.position[1] - existing![index]!.position[1])).toBeLessThan(0.005);
        expect(Math.hypot(native![index]!.position[0], native![index]!.position[2])).toBeLessThan(0.01);
        expect(Math.hypot(...native![index]!.velocity)).toBeLessThan(0.02);
      }
    } finally { for (const world of worlds) world.dispose(); }
  });

  it("keeps a yawed box stack balanced near the public-world result", async () => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld(), new NativePhysicsWorld()];
    try {
      const results = worlds.map((world) => {
        const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        world.createCollider(floor, { shape: Shape.box(5, 0.5, 5) });
        const bodies = [0, 1].map((index) => {
          const body = world.createRigidBody({ position: [0, index + 0.5, 0], rotation: index ? [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)] : [0, 0, 0, 1], mass: 1, inertia: [1, 1, 1] });
          world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
          return body;
        });
        for (let frame = 0; frame < 90; frame += 1) world.step(1 / 60);
        return bodies.map((body) => ({ position: [...body.position] as Vec3, velocity: [...body.velocity] as Vec3 }));
      });
      for (let index = 0; index < 2; index += 1) {
        const expected = results[0]![index]!, native = results[1]![index]!;
        expect(Math.abs(native.position[1] - expected.position[1])).toBeLessThan(0.01);
        expect(Math.hypot(native.position[0], native.position[2])).toBeLessThan(0.02);
        expect(Math.hypot(...native.velocity)).toBeLessThan(0.05);
      }
    } finally { for (const world of worlds) world.dispose(); }
  });
  it("converges on the same symmetric chassis contact response in either row order", async () => {
    const [{ NativePhysicsWorld }, { solveNativeContacts }] = await Promise.all([
      import("../../../packages/physics/src/native/NativePhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativeContacts.js")
    ]);
    const results: Array<{ velocity: Vec3; angular: Vec3 }> = [];
    for (const reverse of [false, true]) {
      const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
      try {
        const ground = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        const floor = world.createCollider(ground, { shape: Shape.box(50, 0.5, 50) });
        const angle = 1.7;
        const height = 0.2 * Math.abs(Math.cos(angle)) + 0.5 * Math.abs(Math.sin(angle)) - 0.001;
        const body = world.createRigidBody({ position: [0, height, 0], rotation: [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)], velocity: [0, -3.1, 2.49], angularVelocity: [2.57, 0, 0], mass: 10, inertia: [3, 3, 3] });
        const box = world.createCollider(body, { shape: Shape.box(0.4, 0.2, 0.5) });
        const contacts = collideNative(floor, ground, box, body);
        expect(contacts).toHaveLength(2);
        expect(contacts[0]!.point[0]).toBeCloseTo(-0.4, 8);
        expect(contacts[1]!.point[0]).toBeCloseTo(0.4, 8);
        for (const contact of contacts) {
          closeVector(contact.normal, [0, 1, 0]);
          expect(contact.penetration).toBeCloseTo(0.001, 8);
        }
        const rows = contacts.map((contact) => ({ bodyA: ground, bodyB: body, ...contact, friction: 0.25, restitution: 0 }));
        solveNativeContacts(reverse ? rows.reverse() : rows, 1 / 600, 16);
        results.push({ velocity: [...body.velocity], angular: [...body.angularVelocity] });
      } finally { world.dispose(); }
    }
    for (const result of results) {
      expect(Math.abs(result.velocity[0])).toBeLessThan(0.001);
      expect(Math.abs(result.angular[1])).toBeLessThan(0.001);
      expect(Math.abs(result.angular[2])).toBeLessThan(0.001);
    }
    expect(results[0]!.velocity[2]).toBeCloseTo(results[1]!.velocity[2], 3);
    expect(results[0]!.angular[0]).toBeCloseTo(results[1]!.angular[0], 3);
  });

  it("stays close to the public world through a tilted chassis-floor impact", async () => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld(), new NativePhysicsWorld()];
    try {
      const samples = worlds.map((world) => {
        const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        world.createCollider(floor, { shape: Shape.box(50, 0.5, 50) });
        const body = world.createRigidBody({ mass: 10, inertia: [3, 3, 3], position: [0, 0.9131, 1.3121], rotation: [0.631768, 0, 0, 0.775158], velocity: [0, -1.6645, 2.49366], angularVelocity: [2.5724, 0, 0] });
        world.createCollider(body, { shape: Shape.box(0.4, 0.2, 0.5) });
        let before: { position: Vec3; velocity: Vec3 } | undefined;
        for (let frame = 0; frame <= 10; frame += 1) {
          world.step(1 / 60);
          if (frame === 6) before = { position: [...body.position], velocity: [...body.velocity] };
        }
        return { before: before!, position: [...body.position] as Vec3, velocity: [...body.velocity] as Vec3, angular: [...body.angularVelocity] as Vec3 };
      });
      const [existing, native] = samples;
      closeVector(native!.before.position, existing!.before.position, 4);
      closeVector(native!.before.velocity, existing!.before.velocity, 4);
      expect(native!.velocity[2]).toBeLessThan(native!.before.velocity[2] - 0.5);
      expect(existing!.velocity[2]).toBeLessThan(existing!.before.velocity[2] - 0.5);
      expect(Math.abs(native!.velocity[2] - existing!.velocity[2])).toBeLessThan(0.05);
      expect(Math.abs(native!.position[2] - existing!.position[2])).toBeLessThan(0.02);
      expect(Math.abs(native!.velocity[0])).toBeLessThan(0.05);
      expect(Math.abs(native!.angular[1])).toBeLessThan(0.05);
      expect(Math.abs(native!.angular[2])).toBeLessThan(0.05);
    } finally {
      for (const world of worlds) world.dispose();
    }
  });
  it("computes sphere contacts and tangency in either order", () => {
    const a = pair(Shape.sphere(1), [0, 0, 0], 1);
    const b = pair(Shape.sphere(1), [1.5, 0, 0], 2);
    const [hit] = collideNative(a.collider, a.body, b.collider, b.body);
    expect(hit?.penetration).toBeCloseTo(0.5, 8);
    closeVector(hit!.normal, [1, 0, 0]);
    closeVector(hit!.point, [0.75, 0, 0]);
    const [reverse] = collideNative(b.collider, b.body, a.collider, a.body);
    closeVector(reverse!.normal, [-1, 0, 0]);
    closeVector(reverse!.point, hit!.point);
    b.body.setPosition([2, 0, 0]);
    expect(collideNative(a.collider, a.body, b.collider, b.body)[0]?.penetration).toBe(0);
    b.body.setPosition([2.001, 0, 0]);
    expect(collideNative(a.collider, a.body, b.collider, b.body)).toEqual([]);
  });

  it("preserves primitive contacts and separation across geometric scales", () => {
    for (const scale of [1e-9, 1, 1e9]) {
      const sphere = pair(Shape.sphere(scale), [0, 0, 0], 1);
      const other = pair(Shape.sphere(scale), [1.5 * scale, 0, 0], 2);
      const contact = collideNative(sphere.collider, sphere.body, other.collider, other.body)[0];
      expect(contact!.penetration / scale).toBeCloseTo(0.5, 6);
      closeVector(contact!.normal, [1, 0, 0]);
      other.body.setPosition([2.0001 * scale, 0, 0]);
      expect(collideNative(sphere.collider, sphere.body, other.collider, other.body)).toEqual([]);

      const box = pair(Shape.box(scale, scale, scale), [0, 0, 0], 3);
      sphere.body.setPosition([2.0001 * scale, 0, 0]);
      expect(collideNative(sphere.collider, sphere.body, box.collider, box.body)).toEqual([]);

      const ground = pair(Shape.plane(), [0, 0, 0], 4);
      sphere.body.setPosition([0, 1.0001 * scale, 0]);
      expect(collideNative(sphere.collider, sphere.body, ground.collider, ground.body)).toEqual([]);

      const capsule = pair(Shape.capsule(0.2 * scale, scale), [0, 0, 0], 5);
      const smallBall = pair(Shape.sphere(0.2 * scale), [0.3 * scale, 0.8 * scale, 0], 6);
      const capsuleContact = collideNative(capsule.collider, capsule.body, smallBall.collider, smallBall.body)[0];
      expect(capsuleContact!.penetration / scale).toBeCloseTo(0.1, 6);
      closeVector(capsuleContact!.normal, [1, 0, 0]);
      smallBall.body.setPosition([0.4001 * scale, 0.8 * scale, 0]);
      expect(collideNative(capsule.collider, capsule.body, smallBall.collider, smallBall.body)).toEqual([]);
    }
  });

  it("uses the rotated box frame for sphere contacts, including containment", () => {
    const box = pair(Shape.box(1, 0.5, 0.5), [3, 0, 0], 1, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    const sphere = pair(Shape.sphere(0.3), [3.7, 0, 0], 2);
    const [hit] = collideNative(sphere.collider, sphere.body, box.collider, box.body);
    expect(hit?.penetration).toBeCloseTo(0.1, 6);
    closeVector(hit!.normal, [-1, 0, 0]);
    sphere.body.setPosition([3, 0, 0]);
    const [inside] = collideNative(sphere.collider, sphere.body, box.collider, box.body);
    expect(inside?.penetration).toBeCloseTo(0.8, 6);
    expect(Math.hypot(...inside!.normal)).toBeCloseTo(1, 8);
  });

  it("finds true closest points for tilted capsules without an axis-aligned approximation", () => {
    const capsule = pair(Shape.capsule(0.2, 1), [0, 0, 0], 1, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    const sphere = pair(Shape.sphere(0.2), [0.8, 0.3, 0], 2);
    const [contact] = collideNative(capsule.collider, capsule.body, sphere.collider, sphere.body);
    expect(contact?.penetration).toBeCloseTo(0.1, 6);
    closeVector(contact!.normal, [0, 1, 0]);
    sphere.body.setPosition([0, 1.1, 0]);
    expect(collideNative(capsule.collider, capsule.body, sphere.collider, sphere.body)).toEqual([]);
  });

  it("chooses a radial normal when capsule axes and witness points coincide", () => {
    const rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const a = pair(Shape.capsule(0.2, 1), [0, 0, 0], 1, rotation);
    const b = pair(Shape.capsule(0.3, 1), [0, 0, 0], 2, rotation);
    const forward = collideNative(a.collider, a.body, b.collider, b.body)[0]!;
    const reverse = collideNative(b.collider, b.body, a.collider, a.body)[0]!;
    expect(Math.abs(forward.normal[0])).toBeLessThan(1e-8);
    expect(forward.penetration).toBeCloseTo(0.5, 8);
    closeVector(forward.normal, [-reverse.normal[0], -reverse.normal[1], -reverse.normal[2]]);
  });

  it("returns a stable four-point manifold for broad resting box faces", () => {
    const a = pair(Shape.box(1, 0.5, 1), [0, 0, 0], 1);
    const b = pair(Shape.box(1, 0.5, 1), [0, 0.9, 0], 2);
    const contacts = collideNative(a.collider, a.body, b.collider, b.body);
    expect(contacts).toHaveLength(4);
    for (const contact of contacts) {
      closeVector(contact.normal, [0, 1, 0]);
      expect(contact.penetration).toBeCloseTo(0.1, 5);
    }
    expect(new Set(contacts.map((contact) => `${contact.point[0]},${contact.point[2]}`)).size).toBe(4);
    expect(collideNative(a.collider, a.body, b.collider, b.body)).toEqual(contacts);
  });

  it("keeps a box manifold through tangency and shallow penetration", () => {
    const a = pair(Shape.box(0.5, 0.5, 0.5), [0, 0, 0], 1);
    const b = pair(Shape.box(0.5, 0.5, 0.5), [0, 1, 0], 2);
    for (const depth of [0, 1e-12, 1e-9, 1e-6]) {
      b.body.setPosition([0, 1 - depth, 0]);
      const contacts = collideNative(a.collider, a.body, b.collider, b.body);
      expect(contacts, `depth ${depth}`).toHaveLength(4);
      for (const contact of contacts) {
        closeVector(contact.normal, [0, 1, 0]);
        expect(Math.abs(contact.penetration - depth)).toBeLessThan(1e-10);
      }
    }
    b.body.setPosition([0, 1 + 1e-6, 0]);
    expect(collideNative(a.collider, a.body, b.collider, b.body)).toEqual([]);
  });

  it("spreads a four-point manifold across a rotated face intersection", () => {
    const box = Shape.box(1, 0.5, 1);
    const a = pair(box, [0, 0, 0], 1);
    const b = pair(box, [0, 0.9, 0], 2, [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]);
    const contacts = collideNative(a.collider, a.body, b.collider, b.body);
    expect(contacts).toHaveLength(4);
    for (const contact of contacts) {
      closeVector(contact.normal, [0, 1, 0]);
      expect(contact.penetration).toBeCloseTo(0.1, 6);
    }
    expect(Math.abs(contacts.reduce((sum, contact) => sum + contact.point[0], 0))).toBeLessThan(1e-6);
    expect(Math.abs(contacts.reduce((sum, contact) => sum + contact.point[2], 0))).toBeLessThan(1e-6);
  });

  it("clips resting box manifolds to the overlapping faces at small and large scales", () => {
    for (const scale of [1e-9, 1, 1e9]) {
      const a = pair(Shape.box(scale, 0.5 * scale, scale), [0, 0, 0], 1);
      const b = pair(Shape.box(scale, 0.5 * scale, scale), [0.7 * scale, 0.9 * scale, 0], 2);
      const contacts = collideNative(a.collider, a.body, b.collider, b.body);
      expect(contacts).toHaveLength(4);
      for (const contact of contacts) {
        expect(contact.point[0] / scale).toBeGreaterThanOrEqual(-0.300001);
        expect(contact.point[0] / scale).toBeLessThanOrEqual(1.000001);
        expect(contact.penetration / scale).toBeCloseTo(0.1, 6);
      }
    }
  });

  it("agrees with a separating-axis reference on rotated boxes", () => {
    let seed = 0x176ced;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const rotation = (): readonly [number, number, number, number] => {
      const axis: Vec3 = [random() - 0.5, random() - 0.5, random() - 0.5];
      const length = Math.hypot(...axis) || 1;
      const half = random() * Math.PI;
      const sine = Math.sin(half) / length;
      return [axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half)];
    };
    for (let index = 0; index < 1000; index += 1) {
      const shapeA = Shape.box(0.2 + random(), 0.2 + random(), 0.2 + random());
      const shapeB = Shape.box(0.2 + random(), 0.2 + random(), 0.2 + random());
      const a = pair(shapeA, [0, 0, 0], 1, rotation());
      const b = pair(shapeB, [3 * (random() - 0.5), 3 * (random() - 0.5), 3 * (random() - 0.5)], 2, rotation());
      const expected = referenceBoxPenetration(shapeA, a.body, shapeB, b.body);
      const contacts = collideNative(a.collider, a.body, b.collider, b.body);
      expect(contacts.length > 0, `box pair ${index}`).toBe(expected !== undefined);
      if (expected !== undefined) {
        expect(Math.hypot(...contacts[0]!.normal), `box pair ${index} normal`).toBeCloseTo(1, 5);
        const direction = contacts[0]!.normal;
        const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        const basis: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const extent = (shape: BoxShape, body: RigidBody) => basis.reduce((sum, axis, n) => sum + Math.abs(dot(direction, rotateVec3ByQuat(axis, body.rotation))) * shape.halfExtents[n]!, 0);
        const delta: Vec3 = [b.body.position[0] - a.body.position[0], b.body.position[1] - a.body.position[1], b.body.position[2] - a.body.position[2]];
        expect(extent(shapeA, a.body) + extent(shapeB, b.body) - Math.abs(dot(direction, delta)), `box pair ${index} axis depth`).toBeCloseTo(expected, 4);
        const reverse = collideNative(b.collider, b.body, a.collider, a.body);
        expect(reverse.length, `box pair ${index} reverse`).toBeGreaterThan(0);
        const normal = contacts[0]!.normal, opposite = reverse[0]!.normal;
        expect(normal[0] * opposite[0] + normal[1] * opposite[1] + normal[2] * opposite[2], `box pair ${index} reversed normal`).toBeCloseTo(-1, 5);
        const minimum = convexContact(convexShape(shapeA, a.body), convexShape(shapeB, b.body));
        expect(minimum!.penetration, `box pair ${index} penetration`).toBeCloseTo(expected, 4);
        for (const contact of contacts) {
          const half = contact.penetration / 2;
          const witnessA: Vec3 = [contact.point[0] + contact.normal[0] * half, contact.point[1] + contact.normal[1] * half, contact.point[2] + contact.normal[2] * half];
          const witnessB: Vec3 = [contact.point[0] - contact.normal[0] * half, contact.point[1] - contact.normal[1] * half, contact.point[2] - contact.normal[2] * half];
          expectBoxSurface(witnessA, shapeA, a.body, `box pair ${index}, witness A`);
          expectBoxSurface(witnessB, shapeB, b.body, `box pair ${index}, witness B`);
        }
      }
    }
  });

  it("tests rotated convex hulls against boxes without accepting an AABB-only overlap", () => {
    const hull = Shape.convexHull([[0, 1, 0], [-1, -1, -1], [1, -1, -1], [0, -1, 1]], [0, 2, 1, 0, 3, 2, 0, 1, 3, 1, 2, 3]);
    const a = pair(hull, [0, 0, 0], 1);
    const b = pair(Shape.box(0.2, 0.2, 0.2), [0, 0, 0], 2, [0, Math.sin(0.2), 0, Math.cos(0.2)]);
    const contact = collideNative(a.collider, a.body, b.collider, b.body)[0];
    expect(contact).toBeDefined();
    expect(contact!.penetration).toBeGreaterThan(0);
    expect(Math.hypot(...contact!.normal)).toBeCloseTo(1, 5);
    b.body.setPosition([0.9, 0.8, 0.9]);
    expect(collideNative(a.collider, a.body, b.collider, b.body)).toEqual([]);
  });

  it("handles every finite convex pair at overlap and separation", () => {
    const shapes: PhysicsShape[] = [
      Shape.sphere(0.5), Shape.box(0.5, 0.5, 0.5), Shape.capsule(0.4, 0.5),
      Shape.convexHull([[0, 1, 0], [-1, -1, -1], [1, -1, -1], [0, -1, 1]], [0, 2, 1, 0, 3, 2, 0, 1, 3, 1, 2, 3])
    ];
    for (const shapeA of shapes) for (const shapeB of shapes) {
      const a = pair(shapeA, [0, 0, 0], 1, [0, Math.sin(0.2), 0, Math.cos(0.2)]);
      const b = pair(shapeB, [0, 0, 0], 2, [Math.sin(0.15), 0, 0, Math.cos(0.15)]);
      const label = `${shapeA.kind}/${shapeB.kind}`;
      const contact = collideNative(a.collider, a.body, b.collider, b.body)[0];
      expect(contact, label).toBeDefined();
      expect(contact!.penetration, label).toBeGreaterThan(0);
      expect(Math.hypot(...contact!.normal), label).toBeCloseTo(1, 5);
      b.body.setPosition([5, 0, 0]);
      expect(collideNative(a.collider, a.body, b.collider, b.body), label).toEqual([]);
    }
  });

  it("uses the touching face normal rather than the center direction for convex tangency", () => {
    const box = pair(Shape.box(1, 1, 1), [0, 0, 0], 1);
    const capsule = pair(Shape.capsule(0.25, 0.4), [1.25, 0.6, 0], 2);
    const contact = collideNative(box.collider, box.body, capsule.collider, capsule.body)[0];
    expect(contact).toBeDefined();
    expect(contact!.penetration).toBeCloseTo(0, 5);
    closeVector(contact!.normal, [1, 0, 0], 4);
    const reverse = collideNative(capsule.collider, capsule.body, box.collider, box.body)[0];
    closeVector(reverse!.normal, [-1, 0, 0], 4);
    capsule.body.setPosition([1.25001, 0.6, 0]);
    expect(collideNative(box.collider, box.body, capsule.collider, capsule.body)).toEqual([]);
  });

  it("uses transformed mesh triangles and heightfield samples as surfaces", () => {
    const floor = Shape.mesh([[-2, 0, -2], [2, 0, -2], [2, 0, 2], [-2, 0, 2]], [0, 2, 1, 0, 3, 2]);
    const mesh = pair(floor, [2, 1, 0], 1);
    const ball = pair(Shape.sphere(0.5), [2, 1.4, 0], 2);
    const contact = collideNative(mesh.collider, mesh.body, ball.collider, ball.body)[0];
    expect(contact?.penetration).toBeCloseTo(0.1, 4);
    expect(contact!.normal[1]).toBeGreaterThan(0.9);
    ball.body.setPosition([5, 1.4, 0]);
    expect(collideNative(mesh.collider, mesh.body, ball.collider, ball.body)).toEqual([]);

    const terrain = pair(Shape.heightfield([[0, 0], [1, 1]], 2), [0, 0, 0], 3);
    ball.body.setPosition([0, 0.95, 0]);
    const terrainHit = collideNative(terrain.collider, terrain.body, ball.collider, ball.body)[0];
    expect(terrainHit).toBeDefined();
    expect(terrainHit!.normal[1]).toBeGreaterThan(0.8);
  });

  it("recognizes sphere-to-triangle tangency while rejecting a visible gap", () => {
    const mesh = pair(Shape.mesh([[-1, 0, -1], [1, 0, -1], [0, 0, 1]], [0, 1, 2]), [0, 0, 0], 1);
    const ball = pair(Shape.sphere(0.3), [0, 0.3, 0], 2);
    const contact = collideNative(ball.collider, ball.body, mesh.collider, mesh.body)[0];
    expect(contact).toBeDefined();
    expect(contact!.penetration).toBeCloseTo(0, 5);
    closeVector(contact!.normal, [0, -1, 0], 4);
    ball.body.setPosition([0, 0.30001, 0]);
    expect(collideNative(ball.collider, ball.body, mesh.collider, mesh.body)).toEqual([]);
  });

  it("handles every finite solid against each supported surface in both orders", () => {
    const solids: PhysicsShape[] = [
      Shape.sphere(0.4), Shape.box(0.4, 0.4, 0.4), Shape.capsule(0.3, 0.4),
      Shape.convexHull([[0, 0.7, 0], [-0.6, -0.6, -0.6], [0.6, -0.6, -0.6], [0, -0.6, 0.6]], [0, 2, 1, 0, 3, 2, 0, 1, 3, 1, 2, 3])
    ];
    const surfaces: PhysicsShape[] = [
      Shape.plane(), Shape.mesh([[-3, 0, -3], [3, 0, -3], [0, 0, 3]], [0, 1, 2]),
      Shape.heightfield([[0, 0], [0, 0]], 6)
    ];
    for (const solid of solids) for (const surface of surfaces) {
      const a = pair(solid, [0, 0.1, 0], 1);
      const b = pair(surface, [0, 0, 0], 2);
      const label = `${solid.kind}/${surface.kind}`;
      const forward = collideNative(a.collider, a.body, b.collider, b.body);
      const reverse = collideNative(b.collider, b.body, a.collider, a.body);
      expect(forward.length, label).toBeGreaterThan(0);
      expect(reverse.length, label).toBe(forward.length);
      expect(forward[0]!.normal[1], label).toBeLessThan(-0.9);
      closeVector(forward[0]!.normal, [-reverse[0]!.normal[0], -reverse[0]!.normal[1], -reverse[0]!.normal[2]]);
      a.body.setPosition([0, 3, 0]);
      expect(collideNative(a.collider, a.body, b.collider, b.body), label).toEqual([]);
    }
  });

  it("uses only capsule surface supports for plane contacts", () => {
    const ground = pair(Shape.plane(), [0, 0, 0], 1);
    const capsule = pair(Shape.capsule(0.3, 0.5), [0, -1, 0], 2);
    const vertical = collideNative(capsule.collider, capsule.body, ground.collider, ground.body);
    expect(vertical).toHaveLength(1);
    expect(vertical[0]!.penetration).toBeCloseTo(1.8, 8);
    capsule.body.setPosition([0, 0.2, 0]);
    capsule.body.setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    const horizontal = collideNative(capsule.collider, capsule.body, ground.collider, ground.body);
    expect(horizontal).toHaveLength(2);
    for (const contact of horizontal) expect(contact.penetration).toBeCloseTo(0.1, 8);
  });

  it("does not introduce sideways contacts when a capsule straddles a flat terrain seam", () => {
    const ground = pair(Shape.heightfield([[0, 0], [0, 0]], 6), [0, 0, 0], 1);
    const capsule = pair(Shape.capsule(0.3, 0.4), [0, 0.1, 0], 2);
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) {
      capsule.body.setPosition([x, 0.1, 0]);
      const contacts = collideNative(capsule.collider, capsule.body, ground.collider, ground.body);
      expect(contacts.length).toBeGreaterThan(0);
      for (const contact of contacts) expect(contact.normal[1], `x=${x}`).toBeLessThan(-0.99);
    }
  });

  it("retains an edge normal at the exposed boundary of a single triangle", () => {
    const triangle = pair(Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]), [0, 0, 0], 1);
    const ball = pair(Shape.sphere(0.3), [1.1, 0.1, 1.1], 2);
    const [contact] = collideNative(ball.collider, ball.body, triangle.collider, triangle.body);
    expect(contact).toBeDefined();
    expect(contact!.normal[0]).toBeLessThan(-0.2);
    expect(contact!.normal[2]).toBeLessThan(-0.2);
  });

  it("retains an exposed box-triangle edge at exact horizontal tangency", () => {
    const ground = pair(Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]), [0, 0, 0], 1);
    const box = pair(Shape.box(0.2, 0.2, 0.2), [1.2, 0.1, 1.2], 2);
    const contacts = collideNative(box.collider, box.body, ground.collider, ground.body);
    const edge = contacts.find((contact) => contact.normal[0] < -0.7 && contact.normal[2] < -0.7);
    expect(edge).toBeDefined();
    closeVector(edge!.point, [1, 0, 1], 5);
    expect(edge!.penetration).toBeCloseTo(0, 8);
    box.body.setPosition([1.2001, 0.1, 1.2001]);
    expect(collideNative(box.collider, box.body, ground.collider, ground.body)).toEqual([]);
  });

  it("resolves capsule and convex-hull contacts at an exposed triangle edge", () => {
    const triangle = pair(Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]), [0, 0, 0], 1);
    const capsule = pair(Shape.capsule(0.3, 0.4), [1.2, 0.15, 1.2], 2);
    const [capsuleHit] = collideNative(capsule.collider, capsule.body, triangle.collider, triangle.body);
    expect(capsuleHit).toBeDefined();
    expect(capsuleHit!.penetration).toBeCloseTo(0.3 - Math.hypot(0.2, 0.2), 5);
    closeVector(capsuleHit!.normal, [-Math.SQRT1_2, 0, -Math.SQRT1_2], 4);
    capsule.body.setPosition([1.3, 0.15, 1.3]);
    expect(collideNative(capsule.collider, capsule.body, triangle.collider, triangle.body)).toEqual([]);

    const hull = Shape.convexHull([[0.4, 0, 0], [-0.4, 0, 0], [0, 0.4, 0], [0, -0.4, 0], [0, 0, 0.4], [0, 0, -0.4]], [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5]);
    const convex = pair(hull, [1.2, 0, 1.2], 3);
    const [touch] = collideNative(convex.collider, convex.body, triangle.collider, triangle.body);
    expect(touch).toBeDefined();
    expect(touch!.penetration).toBeCloseTo(0, 5);
    const a = convexShape(hull, convex.body).support(touch!.normal);
    const b = convexPoints([[0, 0, 0], [2, 0, 0], [0, 0, 2]]).support([-touch!.normal[0], -touch!.normal[1], -touch!.normal[2]]);
    expect((a[0] - b[0]) * touch!.normal[0] + (a[1] - b[1]) * touch!.normal[1] + (a[2] - b[2]) * touch!.normal[2]).toBeCloseTo(0, 5);
    convex.body.setPosition([1.19, 0, 1.19]);
    const [overlap] = collideNative(convex.collider, convex.body, triangle.collider, triangle.body);
    expect(overlap).toBeDefined();
    expect(overlap!.penetration).toBeCloseTo(0.02 / Math.sqrt(3), 4);
    convex.body.setPosition([1.21, 0, 1.21]);
    expect(collideNative(convex.collider, convex.body, triangle.collider, triangle.body)).toEqual([]);
  });

  it("tracks capsule penetration through an exposed edge using segment distance", () => {
    const triangle = pair(Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]), [0, 0, 0], 1);
    const capsule = pair(Shape.capsule(0.3, 0.4), [0, 0.15, 0], 2);
    for (const offset of [0.01, 0.1, 0.15, 0.2, 0.21, 0.3 / Math.SQRT2, 0.22, 0.3]) {
      capsule.body.setPosition([1 + offset, 0.15, 1 + offset]);
      let contacts: ReturnType<typeof collideNative>;
      try { contacts = collideNative(capsule.collider, capsule.body, triangle.collider, triangle.body); }
      catch (error) { throw new Error(`offset ${offset}: ${String(error)}`); }
      if (offset > 0.3 / Math.SQRT2 + 1e-8) expect(contacts, `offset ${offset}`).toEqual([]);
      else {
        expect(contacts, `offset ${offset}`).toHaveLength(1);
        expect(contacts[0]!.penetration, `offset ${offset}`).toBeCloseTo(0.3 - offset * Math.SQRT2, 5);
        closeVector(contacts[0]!.normal, [-Math.SQRT1_2, 0, -Math.SQRT1_2], 4);
      }
    }
  });

  it("preserves capsule-edge witnesses under rotation, pair reversal and a large triangle", () => {
    const shape = Shape.capsule(0.3, 0.4);
    for (const rotation of [[0, 0, 0, 1], [Math.sin(0.17), 0, 0, Math.cos(0.17)], [0, 0, Math.sin(0.31), Math.cos(0.31)]] as const) {
      for (const edgeLength of [2, 2e9]) {
        const triangle = pair(Shape.mesh([[0, 0, 0], [edgeLength, 0, 0], [0, 0, edgeLength]], [0, 1, 2]), [3, 1, -2], 1, rotation);
        const local: Vec3 = [edgeLength / 2 + 0.2, 0.15, edgeLength / 2 + 0.2];
        const offset = rotateVec3ByQuat(local, rotation);
        const capsule = pair(shape, [3 + offset[0], 1 + offset[1], -2 + offset[2]], 2, rotation);
        const [contact] = collideNative(capsule.collider, capsule.body, triangle.collider, triangle.body);
        expect(contact, `length ${edgeLength} rotation ${rotation}`).toBeDefined();
        expect(contact!.penetration).toBeCloseTo(0.3 - 0.2 * Math.SQRT2, 4);
        const direction = rotateVec3ByQuat([-Math.SQRT1_2, 0, -Math.SQRT1_2], rotation);
        closeVector(contact!.normal, direction, 4);
        const [reverse] = collideNative(triangle.collider, triangle.body, capsule.collider, capsule.body);
        closeVector(reverse!.normal, [-direction[0], -direction[1], -direction[2]], 4);
        closeVector(reverse!.point, contact!.point, 5);
        const surfacePoint: Vec3 = [contact!.point[0] - contact!.normal[0] * contact!.penetration / 2, contact!.point[1] - contact!.normal[1] * contact!.penetration / 2, contact!.point[2] - contact!.normal[2] * contact!.penetration / 2];
        const relative: Vec3 = [surfacePoint[0] - 3, surfacePoint[1] - 1, surfacePoint[2] + 2];
        const localPoint = rotateVec3ByQuat(relative, [-rotation[0], -rotation[1], -rotation[2], rotation[3]]);
        expect(localPoint[0] / edgeLength + localPoint[2] / edgeLength).toBeCloseTo(1, 8);
        expect(localPoint[1]).toBeCloseTo(0, 4);
      }
    }
  });

  it("finds an interior capsule-axis witness along a long nearly parallel mesh edge", () => {
    const slope = 1e-8;
    const length = Math.hypot(1, slope, slope);
    const direction: Vec3 = [1 / length, slope / length, slope / length];
    const factor = Math.sqrt(2 * (1 + direction[1]));
    const rotation = [direction[2] / factor, 0, -direction[0] / factor, (1 + direction[1]) / factor] as const;
    const triangle = pair(Shape.mesh([[-1e8, 0, 0], [1e8, 0, 0], [-1e8, 0, 2]], [0, 1, 2]), [0, 0, 0], 1);
    const capsule = pair(Shape.capsule(0.3, 5e7), [0, 0.2, -0.2], 2, rotation);
    const [contact] = collideNative(capsule.collider, capsule.body, triangle.collider, triangle.body);
    expect(contact).toBeDefined();
    expect(contact!.penetration).toBeCloseTo(0.3 - Math.SQRT2 * 0.2, 6);
    closeVector(contact!.normal, [0, -Math.SQRT1_2, Math.SQRT1_2], 5);
    const [reverse] = collideNative(triangle.collider, triangle.body, capsule.collider, capsule.body);
    closeVector(reverse!.normal, [0, Math.SQRT1_2, -Math.SQRT1_2], 5);
    closeVector(reverse!.point, contact!.point, 5);
    capsule.body.setPosition([0, 0.225, -0.225]);
    expect(collideNative(capsule.collider, capsule.body, triangle.collider, triangle.body)).toEqual([]);
    expect(collideNative(triangle.collider, triangle.body, capsule.collider, capsule.body)).toEqual([]);
  });

  it("finds interior witnesses for two long nearly parallel capsules", () => {
    const slope = 1e-8;
    const direction: Vec3 = [1 / Math.hypot(1, slope, slope), slope / Math.hypot(1, slope, slope), slope / Math.hypot(1, slope, slope)];
    const factor = Math.sqrt(2 * (1 + direction[1]));
    const tilted = [direction[2] / factor, 0, -direction[0] / factor, (1 + direction[1]) / factor] as const;
    const parallel = [0, 0, -Math.SQRT1_2, Math.SQRT1_2] as const;
    const a = pair(Shape.capsule(0.15, 5e7), [0, 0.2, -0.2], 1, tilted);
    const b = pair(Shape.capsule(0.15, 5e7), [0, 0, 0], 2, parallel);
    const [contact] = collideNative(a.collider, a.body, b.collider, b.body);
    expect(contact).toBeDefined();
    expect(contact!.penetration).toBeCloseTo(0.3 - Math.SQRT2 * 0.2, 6);
    closeVector(contact!.normal, [0, -Math.SQRT1_2, Math.SQRT1_2], 5);
    const [reverse] = collideNative(b.collider, b.body, a.collider, a.body);
    closeVector(reverse!.normal, [0, Math.SQRT1_2, -Math.SQRT1_2], 5);
    closeVector(reverse!.point, contact!.point, 5);
  });

  it("tracks a convex hull through shallow exposed-edge contact", () => {
    const mesh = Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]);
    const shape = Shape.convexHull([[0.4, 0, 0], [-0.4, 0, 0], [0, 0.4, 0], [0, -0.4, 0], [0, 0, 0.4], [0, 0, -0.4]], [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5]);
    const rotations = [[0, 0, 0, 1], [0, Math.sin(0.23), 0, Math.cos(0.23)], [Math.sin(0.17), 0, 0, Math.cos(0.17)]] as const;
    for (const rotation of rotations) for (const offset of [0.01, 0.1, 0.15, 0.19, 0.1999, 0.2 - 1e-7, 0.2, 0.2001]) {
      const triangle = pair(mesh, [3, 1, -2], 1, rotation);
      const center = rotateVec3ByQuat([1 + offset, 0, 1 + offset], rotation);
      const hull = pair(shape, [center[0] + 3, center[1] + 1, center[2] - 2], 2, rotation);
      let contacts: ReturnType<typeof collideNative>;
      try { contacts = collideNative(hull.collider, hull.body, triangle.collider, triangle.body); }
      catch (error) { throw new Error(`offset ${offset}: ${String(error)}`); }
      if (offset > 0.2) expect(contacts, `offset ${offset}`).toEqual([]);
      else {
        expect(contacts, `offset ${offset}`).toHaveLength(1);
        const contact = contacts[0]!;
        expect(contact.penetration, `offset ${offset}`).toBeCloseTo((0.4 - 2 * offset) / Math.sqrt(3), offset > 0.199999 ? 8 : 5);
        const reverse = collideNative(triangle.collider, triangle.body, hull.collider, hull.body)[0]!;
        closeVector(reverse.normal, [-contact.normal[0], -contact.normal[1], -contact.normal[2]]);
        closeVector(reverse.point, contact.point);
        const inverse = [-rotation[0], -rotation[1], -rotation[2], rotation[3]] as const;
        const pointA: Vec3 = [contact.point[0] + contact.normal[0] * contact.penetration / 2 - hull.body.position[0], contact.point[1] + contact.normal[1] * contact.penetration / 2 - hull.body.position[1], contact.point[2] + contact.normal[2] * contact.penetration / 2 - hull.body.position[2]];
        const pointB: Vec3 = [contact.point[0] - contact.normal[0] * contact.penetration / 2 - 3, contact.point[1] - contact.normal[1] * contact.penetration / 2 - 1, contact.point[2] - contact.normal[2] * contact.penetration / 2 + 2];
        const localA = rotateVec3ByQuat(pointA, inverse), localB = rotateVec3ByQuat(pointB, inverse);
        expect(Math.abs(localA[0]) + Math.abs(localA[1]) + Math.abs(localA[2]), `hull witness ${offset}`).toBeCloseTo(0.4, 5);
        expect(localB[1], `triangle witness ${offset}`).toBeCloseTo(0, 5);
        expect(localB[0]).toBeGreaterThanOrEqual(-1e-5);
        expect(localB[2]).toBeGreaterThanOrEqual(-1e-5);
        expect(localB[0] + localB[2]).toBeLessThanOrEqual(2 + 1e-5);
      }
    }
  });

  it("keeps shallow hull-edge contact with redundant vertices and reordered inputs", () => {
    const corners: Vec3[] = [[0.4, 0, 0], [-0.4, 0, 0], [0, 0.4, 0], [0, -0.4, 0], [0, 0, 0.4], [0, 0, -0.4]];
    const triangles = [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5];
    const mesh = Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]);
    for (const [kind, count] of [["segment", 27], ["segment", 160], ["interior", 27]] as const) {
      const additional = Array.from({ length: count }, (_, index): Vec3 => {
        const t = (index + 1) * 0.002;
        return kind === "segment" ? [t, 0, 0] : [t, t * t, t * t * t];
      });
      const points = [...corners, ...additional, ...corners.slice(0, 2)];
      for (const reverse of [false, true]) {
        const order = points.map((_, index) => index);
        if (reverse) order.reverse();
        const shape = Shape.convexHull(order.map((index) => points[index]!), triangles.map((index) => order.indexOf(index)));
        for (const rotation of [[0, 0, 0, 1], [Math.sin(0.17), 0, 0, Math.cos(0.17)]] as const) {
          const ground = pair(mesh, [3, 1, -2], 1, rotation);
          for (const offset of [0.2 - 1e-7, 0.2, 0.2001]) {
            const local: Vec3 = [1 + offset, 0, 1 + offset];
            const center = rotateVec3ByQuat(local, rotation);
            const hull = pair(shape, [3 + center[0], 1 + center[1], -2 + center[2]], 2, rotation);
            const contacts = collideNative(hull.collider, hull.body, ground.collider, ground.body);
            const label = `${kind} count=${count} reverse=${reverse} rotation=${rotation} offset=${offset}`;
            if (offset > 0.2) { expect(contacts, label).toEqual([]); continue; }
            expect(contacts, label).toHaveLength(1);
            const contact = contacts[0]!;
            expect(contact.penetration, label).toBeCloseTo((0.4 - 2 * offset) / Math.sqrt(3), 8);
            const opposite = collideNative(ground.collider, ground.body, hull.collider, hull.body)[0]!;
            closeVector(opposite.normal, [-contact.normal[0], -contact.normal[1], -contact.normal[2]]);
            closeVector(opposite.point, contact.point);
            const inverse = [-rotation[0], -rotation[1], -rotation[2], rotation[3]] as const;
            const pointA: Vec3 = [contact.point[0] + contact.normal[0] * contact.penetration / 2 - hull.body.position[0], contact.point[1] + contact.normal[1] * contact.penetration / 2 - hull.body.position[1], contact.point[2] + contact.normal[2] * contact.penetration / 2 - hull.body.position[2]];
            const pointB: Vec3 = [contact.point[0] - contact.normal[0] * contact.penetration / 2 - 3, contact.point[1] - contact.normal[1] * contact.penetration / 2 - 1, contact.point[2] - contact.normal[2] * contact.penetration / 2 + 2];
            const localA = rotateVec3ByQuat(pointA, inverse), localB = rotateVec3ByQuat(pointB, inverse);
            expect(Math.abs(localA[0]) + Math.abs(localA[1]) + Math.abs(localA[2]), label).toBeCloseTo(0.4, 5);
            expect(localB[1], label).toBeCloseTo(0, 5);
            expect(localB[0]).toBeGreaterThanOrEqual(-1e-5);
            expect(localB[2]).toBeGreaterThanOrEqual(-1e-5);
            expect(localB[0] + localB[2]).toBeLessThanOrEqual(2 + 1e-5);
          }
        }
      }
    }
  });

  it("retains a near-collinear point that changes the hull surface", () => {
    const corners: Vec3[] = [[0.4, 0, 0], [-0.4, 0, 0], [0, 0.4, 0], [0, -0.4, 0], [0, 0, 0.4], [0, 0, -0.4]];
    const additional = Array.from({ length: 32 }, (_, index): Vec3 => {
      const t = (index + 1) / 1000;
      return [t, t * t, t * t * t];
    });
    const mesh = Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]);
    for (const protrusion of [1e-7, 1e-6, 1e-5]) for (const rotation of [[0, 0, 0, 1], [Math.sin(0.17), 0, 0, Math.cos(0.17)], [0, Math.sin(0.21), 0, Math.cos(0.21)]] as const) {
      const shape = Shape.convexHull([...corners, [-0.2, -0.2 - protrusion, 0], ...additional], [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5]);
      const ground = pair(mesh, [3, 1, -2], 1, rotation);
      const offset = rotateVec3ByQuat([1.1, 0.2, 1.1], rotation);
      const hull = pair(shape, [3 + offset[0], 1 + offset[1], -2 + offset[2]], 2, rotation);
      const [contact] = collideNative(hull.collider, hull.body, ground.collider, ground.body);
      expect(contact, `protrusion ${protrusion}`).toBeDefined();
      // The limiting plane contains both the protruding hull edge and the
      // triangle edge. Its normal is proportional to [-(1+5d), -1, -(1+5d)].
      const expected = protrusion / Math.sqrt(2 * (1 + 5 * protrusion) ** 2 + 1);
      expect(contact!.penetration, `protrusion ${protrusion}`).toBeCloseTo(expected, 10);
      const opposite = collideNative(ground.collider, ground.body, hull.collider, hull.body)[0]!;
      closeVector(opposite.normal, [-contact!.normal[0], -contact!.normal[1], -contact!.normal[2]]);
      closeVector(opposite.point, contact!.point);
      const surface: Vec3 = [contact!.point[0] - contact!.normal[0] * contact!.penetration / 2, contact!.point[1] - contact!.normal[1] * contact!.penetration / 2, contact!.point[2] - contact!.normal[2] * contact!.penetration / 2];
      const localSurface = rotateVec3ByQuat([surface[0] - 3, surface[1] - 1, surface[2] + 2], [-rotation[0], -rotation[1], -rotation[2], rotation[3]]);
      expect(localSurface[1]).toBeCloseTo(0, 7);
      expect(localSurface[0] + localSurface[2]).toBeCloseTo(2, 7);
    }
  });

  it("reports an explicit bounded-work failure for a complex ambiguous hull edge", () => {
    const corners: Vec3[] = [[0.4, 0, 0], [-0.4, 0, 0], [0, 0.4, 0], [0, -0.4, 0], [0, 0, 0.4], [0, 0, -0.4]];
    const points = Array.from({ length: 160 }, (_, index): Vec3 => {
      const t = (index + 1) / 1000;
      return [t, t * t, t * t * t];
    });
    const shape = Shape.convexHull([...corners, ...points], [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5]);
    const ground = pair(Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]), [0, 0, 0], 1);
    const hull = pair(shape, [1.1999999, 0, 1.1999999], 2);
    expect(() => collideNative(hull.collider, hull.body, ground.collider, ground.body)).toThrow(/feature search.*work/i);
  });

  it("matches public sensor overlap at rotated mesh and heightfield edges", async () => {
    const { PhysicsWorld } = await import("../../../packages/physics/src/PhysicsWorld.js");
    const hull = Shape.convexHull([[0.4, 0, 0], [-0.4, 0, 0], [0, 0.4, 0], [0, -0.4, 0], [0, 0, 0.4], [0, 0, -0.4]], [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5]);
    const surfaces = [Shape.mesh([[0, 0, 0], [2, 0, 0], [0, 0, 2]], [0, 1, 2]), Shape.heightfield([[0, 0], [0, 0]], 2)];
    const shapes = [Shape.capsule(0.3, 0.4), hull];
    const rotations = [[0, 0, 0, 1], [Math.sin(0.17), 0, 0, Math.cos(0.17)]] as const;
    for (const surface of surfaces) for (const shape of shapes) for (const rotation of rotations) {
      for (const inside of [true, false]) {
        const center: Vec3 = surface.kind === "mesh"
          ? shape.kind === "capsule" ? [inside ? 1.19 : 1.23, 0.15, inside ? 1.19 : 1.23] : [inside ? 1.19 : 1.21, 0, inside ? 1.19 : 1.21]
          : shape.kind === "capsule" ? [inside ? 1.2 : 1.4, 0.15, 0] : [inside ? 1.3 : 1.5, 0, 0];
        const world = new PhysicsWorld({ gravity: [0, 0, 0] });
        try {
          const ground = world.createRigidBody({ type: "static", position: [3, 1, -2], rotation });
          const groundCollider = world.createCollider(ground, { shape: surface });
          const offset = rotateVec3ByQuat(center, rotation);
          const body = world.createRigidBody({ position: [3 + offset[0], 1 + offset[1], -2 + offset[2]], rotation });
          const collider = world.createCollider(body, { shape, sensor: true });
          world.step(1 / 60);
          const publicHit = world.snapshot().contacts.length > 0;
          const nativeHit = collideNative(collider, body, groundCollider, ground).length > 0;
          const label = `${surface.kind}/${shape.kind} inside=${inside} rotation=${rotation}`;
          expect(publicHit, label).toBe(inside);
          expect(nativeHit, label).toBe(publicHit);
        } finally { world.dispose(); }
      }
    }
  });

  it("preserves geometric seam contacts through rotation, scale, and pair reversal", () => {
    const rotation = [0, 0, Math.sin(0.31), Math.cos(0.31)] as const;
    const up = rotateVec3ByQuat([0, 1, 0], rotation);
    for (const scale of [0.000000001, 0.000001, 0.0001, 0.01, 1, 100, 10000]) {
      const ground = pair(Shape.heightfield([[0, 0], [0, 0]], 6 * scale), [3 * scale, -2 * scale, scale], 1, rotation);
      const local: Vec3 = [0.1 * scale, 0.1 * scale, 0];
      const offset = rotateVec3ByQuat(local, rotation);
      const capsule = pair(Shape.capsule(0.3 * scale, 0.4 * scale), [3 * scale + offset[0], -2 * scale + offset[1], scale + offset[2]], 2, rotation);
      const contacts = collideNative(capsule.collider, capsule.body, ground.collider, ground.body);
      const reverse = collideNative(ground.collider, ground.body, capsule.collider, capsule.body);
      expect(contacts.length, `scale ${scale}`).toBeGreaterThan(0);
      expect(reverse).toHaveLength(contacts.length);
      for (let index = 0; index < contacts.length; index += 1) {
        const contact = contacts[index]!, opposite = reverse[index]!;
        closeVector(contact.normal, [-up[0], -up[1], -up[2]], 4);
        closeVector(opposite.normal, up, 4);
        expect(contact.penetration / scale).toBeCloseTo(0.6, 3);
        closeVector(contact.point, opposite.point);
      }
    }
  });

  it("keeps flat seam normals for tilted boxes and capsules", () => {
    const rotations = [
      [0, 0, 0, 1],
      [Math.sin(0.3), 0, 0, Math.cos(0.3)],
      [0, 0, Math.sin(0.4), Math.cos(0.4)],
      [Math.sin(0.23) / Math.SQRT2, 0, Math.sin(0.23) / Math.SQRT2, Math.cos(0.23)]
    ] as const;
    const ground = pair(Shape.heightfield([[0, 0], [0, 0]], 6), [0, 0, 0], 1);
    for (const shape of [Shape.box(0.3, 0.4, 0.2), Shape.capsule(0.3, 0.4)]) {
      for (const rotation of rotations) for (const x of [-0.2, -0.05, 0.05, 0.2]) {
        const body = pair(shape, [x, 0.2, 0], 2, rotation);
        const contacts = collideNative(body.collider, body.body, ground.collider, ground.body);
        expect(contacts.length, `${shape.kind} at ${x}`).toBeGreaterThan(0);
        for (const contact of contacts) closeVector(contact.normal, [0, -1, 0], 3);
      }
    }
  });

  it("distinguishes small solids near a very large rotated terrain", () => {
    const rotation = [0, 0, Math.sin(0.31), Math.cos(0.31)] as const;
    const ground = pair(Shape.heightfield([[0, 0], [0, 0]], 2e6), [0, 0, 0], 1, rotation);
    const sphere = pair(Shape.sphere(0.3), rotateVec3ByQuat([0, 0.2, 0], rotation), 2);
    const contacts = collideNative(sphere.collider, sphere.body, ground.collider, ground.body);
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts[0]!.penetration).toBeCloseTo(0.1, 4);
    for (const distance of [0.3001, 0.4]) {
      sphere.body.setPosition(rotateVec3ByQuat([0, distance, 0], rotation));
      expect(collideNative(sphere.collider, sphere.body, ground.collider, ground.body), `distance ${distance}`).toEqual([]);
    }
  });

  it("resolves a small sphere against the exposed edge of a very large triangle", () => {
    for (const length of [2e6, 2e9]) {
      const ground = pair(Shape.mesh([[0, 0, 0], [length, 0, 0], [0, 0, length]], [0, 1, 2]), [0, 0, 0], 1);
      const sphere = pair(Shape.sphere(0.3), [length / 2 + 0.199, 0.1, length / 2 + 0.199], 2);
      const [contact] = collideNative(sphere.collider, sphere.body, ground.collider, ground.body);
      const distance = Math.hypot(0.199, 0.1, 0.199);
      expect(contact).toBeDefined();
      expect(contact!.penetration).toBeCloseTo(0.3 - distance, 5);
      closeVector(contact!.normal, [-0.199 / distance, -0.1 / distance, -0.199 / distance], 4);
      sphere.body.setPosition([length / 2 + 0.201, 0.1, length / 2 + 0.201]);
      expect(collideNative(sphere.collider, sphere.body, ground.collider, ground.body)).toEqual([]);
    }
  });

  it("does not accept a small box separated from the edge of a very large triangle", () => {
    for (const length of [2e6, 2e9]) {
      const ground = pair(Shape.mesh([[0, 0, 0], [length, 0, 0], [0, 0, length]], [0, 1, 2]), [0, 0, 0], 1);
      const box = pair(Shape.box(0.2, 0.2, 0.2), [length / 2 + 0.20005, 0.1, length / 2 + 0.20005], 2);
      expect(collideNative(box.collider, box.body, ground.collider, ground.body)).toEqual([]);
      box.body.setPosition([length / 2 + 0.1999, 0.1, length / 2 + 0.1999]);
      const [contact] = collideNative(box.collider, box.body, ground.collider, ground.body);
      expect(contact).toBeDefined();
      expect(contact!.penetration).toBeCloseTo(0.0002 / Math.SQRT2, 6);
      closeVector(contact!.normal, [-Math.SQRT1_2, 0, -Math.SQRT1_2], 4);
    }
  });

  it("retains a convex ridge and both faces of a concave heightfield valley", () => {
    const ball = pair(Shape.sphere(0.3), [0, 1.2, 0], 2);
    const ridge = pair(Shape.heightfield([[0, 1, 0], [0, 1, 0]], 1), [0, 0, 0], 1);
    const ridgeContacts = collideNative(ball.collider, ball.body, ridge.collider, ridge.body);
    expect(ridgeContacts.length).toBeGreaterThan(0);
    for (const contact of ridgeContacts) {
      closeVector(contact.normal, [0, -1, 0], 3);
      expect(contact.penetration).toBeCloseTo(0.1, 3);
    }

    const valley = pair(Shape.heightfield([[1, 0, 1], [1, 0, 1]], 1), [0, 0, 0], 3);
    ball.body.setPosition([0, 0.2, 0]);
    const contacts = collideNative(ball.collider, ball.body, valley.collider, valley.body);
    const reverse = collideNative(valley.collider, valley.body, ball.collider, ball.body);
    expect(contacts.some((contact) => contact.normal[0] < -0.7 && contact.normal[1] < -0.7)).toBe(true);
    expect(contacts.some((contact) => contact.normal[0] > 0.7 && contact.normal[1] < -0.7)).toBe(true);
    expect(reverse).toHaveLength(contacts.length);
    for (let index = 0; index < contacts.length; index += 1) {
      const normal = contacts[index]!.normal;
      closeVector(reverse[index]!.normal, [-normal[0], -normal[1], -normal[2]]);
    }
  });

  it("follows the actual closest surface while a sphere crosses a heightfield ridge", () => {
    const terrain = pair(Shape.heightfield([[0, 1, 0], [0, 1, 0]], 1), [0, 0, 0], 1);
    const ball = pair(Shape.sphere(0.3), [0, 1.1, 0], 2);
    for (const x of [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]) {
      ball.body.setPosition([x, 1.1, 0]);
      const left = Math.max(-1, Math.min(0, (x + 0.1) / 2));
      const right = Math.max(0, Math.min(1, (x - 0.1) / 2));
      const candidates: Vec3[] = [[left, 1 + left, 0], [right, 1 - right, 0]];
      const [point] = candidates.sort((a, b) => Math.hypot(a[0] - x, a[1] - 1.1) - Math.hypot(b[0] - x, b[1] - 1.1));
      const distance = Math.hypot(point![0] - x, point![1] - 1.1);
      const normal: Vec3 = [(point![0] - x) / distance, (point![1] - 1.1) / distance, 0];
      const contacts = collideNative(ball.collider, ball.body, terrain.collider, terrain.body);
      expect(contacts.length, `x=${x}`).toBeGreaterThan(0);
      for (const contact of contacts) {
        expect(contact.normal[0], `x=${x} contacts=${JSON.stringify(contacts)}`).toBeCloseTo(normal[0], 4);
        closeVector(contact.normal, normal, 4);
        expect(contact.penetration).toBeCloseTo(0.3 - distance, 5);
      }
      const reverse = collideNative(terrain.collider, terrain.body, ball.collider, ball.body);
      expect(reverse).toHaveLength(contacts.length);
      for (let index = 0; index < contacts.length; index += 1) {
        const forward = contacts[index]!.normal;
        closeVector(reverse[index]!.normal, [-forward[0], -forward[1], -forward[2]], 5);
      }
    }
  });

  it("keeps both normals at an extremely shallow, non-coplanar valley", () => {
    const terrain = pair(Shape.heightfield([[1e-8, 0, 1e-8], [1e-8, 0, 1e-8]], 1), [0, 0, 0], 1);
    const ball = pair(Shape.sphere(0.3), [0, 0.2, 0], 2);
    const contacts = collideNative(ball.collider, ball.body, terrain.collider, terrain.body);
    expect(contacts.some((contact) => contact.normal[0] < -5e-9)).toBe(true);
    expect(contacts.some((contact) => contact.normal[0] > 5e-9)).toBe(true);
  });

  it("agrees with point-to-triangle distance for a sphere around a rotated mesh", () => {
    const vertices: readonly [Vec3, Vec3, Vec3] = [[-1, 0, -1], [1, 0, -1], [0, 0, 1]];
    const rotation = [Math.sin(0.43), 0, 0, Math.cos(0.43)] as const;
    const surface = pair(Shape.mesh(vertices, [0, 1, 2]), [1, 2, 3], 1, rotation);
    const triangle = vertices.map((vertex) => {
      const point = rotateVec3ByQuat(vertex, rotation);
      return [point[0] + 1, point[1] + 2, point[2] + 3] as Vec3;
    }) as unknown as readonly [Vec3, Vec3, Vec3];
    const sphere = pair(Shape.sphere(0.3), [0, 0, 0], 2);
    let seed = 0xd50f6a;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let index = 0; index < 300; index += 1) {
      sphere.body.setPosition([1 + 3 * (random() - 0.5), 2 + 3 * (random() - 0.5), 3 + 3 * (random() - 0.5)]);
      const expected = pointTriangleDistanceSquared(sphere.body.position, triangle) <= 0.3 ** 2;
      const actual = collideNative(sphere.collider, sphere.body, surface.collider, surface.body).length > 0;
      expect(actual, `sphere/triangle case ${index}`).toBe(expected);
    }
  });

  it("keeps multiple support points for a broad box resting on a triangle mesh", () => {
    const floor = Shape.mesh([[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]], [0, 2, 1, 0, 3, 2]);
    const ground = pair(floor, [0, 0, 0], 1);
    const box = pair(Shape.box(1, 0.5, 1), [0, 0.49, 0], 2);
    const contacts = collideNative(ground.collider, ground.body, box.collider, box.body);
    expect(contacts.length).toBeGreaterThanOrEqual(3);
    for (const contact of contacts) {
      expect(contact.normal[1]).toBeGreaterThan(0.99);
      expect(contact.penetration).toBeCloseTo(0.01, 4);
    }
  });

  it("supports a broad box on a smaller triangulated patch", () => {
    const surface = Shape.mesh([[-0.25, 0, -0.25], [0.25, 0, -0.25], [0.25, 0, 0.25], [-0.25, 0, 0.25]], [0, 1, 2, 0, 2, 3]);
    const rotations = [[0, 0, 0, 1], [Math.sin(0.23), 0, 0, Math.cos(0.23)]] as const;
    for (const rotation of rotations) {
      const center: Vec3 = [2, 1, 3];
      const floor = pair(surface, center, 1, rotation);
      const up = rotateVec3ByQuat([0, 1, 0], rotation);
      const box = pair(Shape.box(1, 0.5, 1), [center[0] + 0.49 * up[0], center[1] + 0.49 * up[1], center[2] + 0.49 * up[2]], 2, rotation);
      const contacts = collideNative(floor.collider, floor.body, box.collider, box.body);
      const reverse = collideNative(box.collider, box.body, floor.collider, floor.body);
      expect(contacts).toHaveLength(4);
      expect(reverse).toHaveLength(4);
      const inverse = [-rotation[0], -rotation[1], -rotation[2], rotation[3]] as const;
      for (const [index, contact] of contacts.entries()) {
        closeVector(contact.normal, up);
        closeVector(reverse[index]!.normal, [-up[0], -up[1], -up[2]]);
        const local = rotateVec3ByQuat([contact.point[0] - center[0], contact.point[1] - center[1], contact.point[2] - center[2]], inverse);
        expect(Math.abs(local[0])).toBeCloseTo(0.25, 5);
        expect(Math.abs(local[2])).toBeCloseTo(0.25, 5);
        expect(contact.penetration).toBeCloseTo(0.01, 5);
      }
    }
  });

  it("preserves a balanced box manifold on a finely tessellated flat heightfield", () => {
    const rows = Array.from({ length: 11 }, () => Array<number>(11).fill(0));
    const ground = pair(Shape.heightfield(rows, 0.2), [0, 0, 0], 1);
    const body = pair(Shape.box(0.9, 0.5, 0.9), [0, 0.5, 0], 2);
    for (const rotation of [[0, 0, 0, 1], [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]] as const) for (const y of [0.5, 0.49]) {
      body.body.setPosition([0, y, 0]);
      body.body.setRotation(rotation);
      const contacts = collideNative(ground.collider, ground.body, body.collider, body.body);
      expect(contacts).toHaveLength(4);
      expect(Math.abs(contacts.reduce((sum, contact) => sum + contact.point[0], 0))).toBeLessThan(1e-5);
      expect(Math.abs(contacts.reduce((sum, contact) => sum + contact.point[2], 0))).toBeLessThan(1e-5);
      for (const contact of contacts) closeVector(contact.normal, [0, 1, 0]);
    }
  });

  it("holds a broad box over a small mesh patch near the public-world result", async () => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld(), new NativePhysicsWorld()];
    try {
      const results = worlds.map((world) => {
        const ground = world.createRigidBody({ type: "static" });
        world.createCollider(ground, { shape: Shape.mesh([[-0.25, 0, -0.25], [0.25, 0, -0.25], [0.25, 0, 0.25], [-0.25, 0, 0.25]], [0, 1, 2, 0, 2, 3]) });
        const body = world.createRigidBody({ position: [0, 0.5, 0], mass: 5, inertia: [3, 3, 3] });
        world.createCollider(body, { shape: Shape.box(1, 0.5, 1) });
        for (let frame = 0; frame < 60; frame += 1) world.step(1 / 60);
        return { position: [...body.position] as Vec3, velocity: [...body.velocity] as Vec3 };
      });
      expect(Math.abs(results[1]!.position[1] - results[0]!.position[1])).toBeLessThan(0.01);
      expect(Math.hypot(results[1]!.position[0], results[1]!.position[2])).toBeLessThan(0.02);
      expect(Math.hypot(...results[1]!.velocity)).toBeLessThan(0.05);
    } finally { for (const world of worlds) world.dispose(); }
  });

  it("matches a plane's resting-box contacts across flat mesh and heightfield seams", () => {
    const plane = pair(Shape.plane(), [0, 0, 0], 1);
    const surfaces = [
      Shape.mesh([[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]], [0, 1, 2, 0, 2, 3]),
      Shape.mesh([[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]], [0, 1, 3, 1, 2, 3]),
      Shape.heightfield([[0, 0], [0, 0]], 6)
    ];
    const rotations = [
      [0, 0, 0, 1],
      [Math.sin(0.12), 0, 0, Math.cos(0.12)],
      [0, 0, Math.sin(0.1), Math.cos(0.1)],
      [Math.sin(0.12) / Math.SQRT2, 0, Math.sin(0.12) / Math.SQRT2, Math.cos(0.12)]
    ] as const;
    for (const rotation of rotations) for (const x of [-0.2, 0, 0.2]) {
      const shape = Shape.box(0.4, 0.2, 0.5);
      const up: Vec3 = [0, 1, 0];
      const basis: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const height = basis.reduce((sum, axis, index) => sum + Math.abs(rotateVec3ByQuat(axis, rotation)[1]) * shape.halfExtents[index]!, 0);
      const body = pair(shape, [x, height - 0.01, 0], 2, rotation);
      const reference = collideNative(plane.collider, plane.body, body.collider, body.body);
      for (const surface of surfaces) {
        const ground = pair(surface, [0, 0, 0], 3);
        const contacts = collideNative(ground.collider, ground.body, body.collider, body.body);
        expect(contacts.length, `${surface.kind} x=${x} rotation=${rotation}`).toBeGreaterThanOrEqual(reference.length);
        for (const contact of contacts) {
          closeVector(contact.normal, up, 4);
          const groundPoint: Vec3 = [contact.point[0], contact.point[1] + contact.penetration / 2, contact.point[2]];
          const boxPoint: Vec3 = [contact.point[0], contact.point[1] - contact.penetration / 2, contact.point[2]];
          expect(groundPoint[1]).toBeCloseTo(0, 6);
          expectBoxSurface(boxPoint, shape, body.body, `${surface.kind} x=${x}`);
        }
        for (const expected of reference) expect(contacts.some((contact) => Math.hypot(...contact.point.map((value, index) => value - expected.point[index]!)) < 1e-5)).toBe(true);
      }
    }
  });

  it("reports plane halfspace intersections for sensors, including opposing and rotated planes", () => {
    const a = pair(Shape.plane(), [0, 0, 0], 1);
    const b = pair(Shape.plane([0, -1, 0]), [0, 0, 0], 2);
    expect(collideNative(a.collider, a.body, b.collider, b.body)[0]?.penetration).toBe(0);
    b.body.setPosition([0, 1, 0]);
    expect(collideNative(a.collider, a.body, b.collider, b.body)).toEqual([]);
    b.body.setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    const contact = collideNative(a.collider, a.body, b.collider, b.body)[0];
    expect(contact).toBeDefined();
    expect(contact!.point[1]).toBeLessThanOrEqual(1e-7);
    expect(contact!.point[0]).toBeLessThanOrEqual(1e-7);
  });

  it("tests a finite surface against the solid halfspace of a transformed plane", () => {
    const plane = pair(Shape.plane(), [0, 1, 0], 1);
    const shape = Shape.mesh([[-2, 0, -2], [2, 0, -2], [0, 0, 2]], [0, 1, 2]);
    const mesh = pair(shape, [0, 2, 0], 2);
    expect(collideNative(plane.collider, plane.body, mesh.collider, mesh.body)).toEqual([]);
    mesh.body.setPosition([0, 1, 0]);
    const forward = collideNative(plane.collider, plane.body, mesh.collider, mesh.body);
    const reverse = collideNative(mesh.collider, mesh.body, plane.collider, plane.body);
    expect(forward).toHaveLength(1);
    expect(forward[0]!.point[1]).toBeCloseTo(1, 8);
    closeVector(forward[0]!.normal, [-reverse[0]!.normal[0], -reverse[0]!.normal[1], -reverse[0]!.normal[2]]);
    mesh.body.setPosition([0, -1, 0]);
    expect(collideNative(plane.collider, plane.body, mesh.collider, mesh.body)).toHaveLength(1);
  });

  it("recognizes coplanar and crossing surface triangles without accepting a separated surface", () => {
    const horizontal = pair(Shape.mesh([[-2, 0, -1], [2, 0, -1], [0, 0, 2]], [0, 1, 2]), [0, 0, 0], 1);
    const vertical = pair(Shape.mesh([[0, -1, -1], [0, 1, -1], [0, 0, 1]], [0, 1, 2]), [0, 0, 0], 2);
    expect(collideNative(horizontal.collider, horizontal.body, vertical.collider, vertical.body)).toHaveLength(1);
    vertical.body.setPosition([3, 0, 0]);
    expect(collideNative(horizontal.collider, horizontal.body, vertical.collider, vertical.body)).toEqual([]);

    const coplanar = pair(Shape.mesh([[-2, 0, 1], [2, 0, 1], [0, 0, -2]], [0, 1, 2]), [0, 0, 0], 3);
    expect(collideNative(horizontal.collider, horizontal.body, coplanar.collider, coplanar.body)).toHaveLength(1);
    coplanar.body.setPosition([0, 0.01, 0]);
    expect(collideNative(horizontal.collider, horizontal.body, coplanar.collider, coplanar.body)).toEqual([]);

    const terrain = pair(Shape.heightfield([[0, 0], [0, 0]], 1), [0, 0, 0], 4);
    expect(collideNative(horizontal.collider, horizontal.body, terrain.collider, terrain.body)).toHaveLength(1);
    terrain.body.setPosition([0, 0.1, 0]);
    expect(collideNative(horizontal.collider, horizontal.body, terrain.collider, terrain.body)).toEqual([]);
  });

  it("rejects mismatched collider ownership", () => {
    const a = pair(Shape.plane(), [0, 0, 0], 1);
    const b = pair(Shape.plane(), [0, 0, 0], 2);
    expect(() => collideNative(a.collider, b.body, b.collider, b.body)).toThrow(/body/i);
  });
});
