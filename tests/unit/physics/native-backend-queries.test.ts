import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody, type Quat, type RigidBodyDescriptor } from "../../../packages/physics/src/RigidBody.js";
import { Shape, rotateVec3ByQuat, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { nativeOverlapCollider, nativeRaycastCollider, nativeSphereCastCollider, nativeSweepCollider, nativeWheelRaycastCollider } from "../../../packages/physics/src/native/NativeQueries.js";

function fixture(shape: PhysicsShape, descriptor: RigidBodyDescriptor = {}, sensor = false) {
  const body = new RigidBody(7, { type: "static", ...descriptor });
  return { body, collider: new Collider(11, body.id, { shape, sensor, filter: { layer: 4, mask: 0xffffffff } }) };
}
function close(actual: readonly number[], expected: Vec3): void {
  expect(actual).toHaveLength(3);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 6));
}
const boxVertices = [[-1, -0.5, -1], [1, -0.5, -1], [1, 0.5, -1], [-1, 0.5, -1], [-1, -0.5, 1], [1, -0.5, 1], [1, 0.5, 1], [-1, 0.5, 1]] as const;
const boxIndices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];

async function publicWheel(shape: PhysicsShape, position: Vec3, rotation: Quat, origin: Vec3, direction: Vec3, distance: number) {
  const { PhysicsWorld } = await import("../../../packages/physics/src/PhysicsWorld.js");
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  try {
    const target = world.createRigidBody({ type: "static", position, rotation });
    world.createCollider(target, { shape });
    const chassis = world.createRigidBody({ type: "dynamic", position: [0, 4, 0], mass: 10 });
    world.createCollider(chassis, { shape: Shape.box(0.1, 0.1, 0.1) });
    const vehicle = world.createVehicleController(chassis);
    const axle: Vec3 = Math.abs(direction[1]) < 0.9 ? [-direction[2], 0, direction[0]] : [0, -direction[2], direction[1]];
    vehicle.addWheel({ connection: [origin[0], origin[1] - 4, origin[2]], direction, axle, radius: distance / 2, restLength: distance / 2 });
    vehicle.setAxes(1, 2);
    vehicle.step(1 / 60);
    return vehicle.wheelState(0);
  } finally { world.dispose(); }
}

describe("independent native collider queries", () => {
  it("normalizes direction, reports surface points and enforces filter options", () => {
    const { body, collider } = fixture(Shape.sphere(1), { position: [3, 0, 0] }, true);
    expect(nativeRaycastCollider([0, 0, 0], [10, 0, 0], collider, body)).toBeUndefined();
    const hit = nativeRaycastCollider([0, 0, 0], [10, 0, 0], collider, body, { includeSensors: true, mask: 4 });
    expect(hit?.distance).toBeCloseTo(2);
    close(hit!.point, [2, 0, 0]);
    close(hit!.normal, [-1, 0, 0]);
    expect(nativeRaycastCollider([0, 0, 0], [1, 0, 0], collider, body, { includeSensors: true, mask: 2 })).toBeUndefined();
    expect(nativeRaycastCollider([0, 0, 0], [1, 0, 0], collider, body, { includeSensors: true, ignoreBodies: [7] })).toBeUndefined();
    expect(nativeRaycastCollider([0, 0, 0], [1, 0, 0], collider, body, { includeSensors: true, ignoreColliders: [11] })).toBeUndefined();
    expect(nativeRaycastCollider([0, 0, 0], [1, 0, 0], collider, body, { includeSensors: true, maxDistance: 1.9 })).toBeUndefined();
    expect(() => nativeRaycastCollider([0, 0, 0], [0, 0, 0], collider, body)).toThrow(/non-zero/);
    expect(() => nativeRaycastCollider([0, 0, 0], [1, 0, 0], collider, body, { maxDistance: -1 })).toThrow(/maxDistance/);
  });

  it("intersects rotated boxes, capsules and planes in the collider frame", () => {
    const rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const box = fixture(Shape.box(2, 0.5, 0.5), { position: [2, 0, 0], rotation });
    const hit = nativeRaycastCollider([0, 0, 0], [1, 0, 0], box.collider, box.body)!;
    expect(hit.distance).toBeCloseTo(1.5);
    close(hit.normal, [-1, 0, 0]);
    const capsule = fixture(Shape.capsule(0.5, 1), { position: [3, 0, 0], rotation });
    expect(nativeRaycastCollider([0, 0, 0], [1, 0, 0], capsule.collider, capsule.body)?.distance).toBeCloseTo(1.5);
    expect(nativeRaycastCollider([0, 0.6, 0], [1, 0, 0], capsule.collider, capsule.body)).toBeUndefined();
    const plane = fixture(Shape.plane([0, 1, 0], 1), { position: [10, 2, 0], rotation });
    const planeHit = nativeRaycastCollider([7, 2, 0], [1, 0, 0], plane.collider, plane.body)!;
    expect(planeHit.distance).toBeCloseTo(2);
    close(planeHit.normal, [-1, 0, 0]);
  });

  it("uses the inside box exit normal only for wheel rays with enough travel", () => {
    const box = fixture(Shape.box(20, 0.5, 20), { position: [0, -0.5, 0] });
    const theta = 1.75, direction = [0, -Math.cos(theta), -Math.sin(theta)] as const, origin = [0, -0.01, 0] as const;
    const wheel = nativeWheelRaycastCollider(origin, direction, box.collider, box.body, { maxDistance: 0.7 })!;
    expect(wheel.distance).toBe(0);
    close(wheel.point, origin);
    close(wheel.normal, [0, -1, 0]);
    const ordinary = nativeRaycastCollider(origin, direction, box.collider, box.body, { maxDistance: 0.7 })!;
    close(ordinary.normal, [0, Math.cos(theta), Math.sin(theta)]);
    const short = nativeWheelRaycastCollider(origin, direction, box.collider, box.body, { maxDistance: 0.01 })!;
    close(short.normal, ordinary.normal);
    expect(nativeWheelRaycastCollider(origin, direction, box.collider, box.body, { mask: 2 })).toBeUndefined();
  });

  it("rotates an inside wheel exit normal and preserves a surface ray hit", () => {
    const angle = 0.3, q = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const;
    const box = fixture(Shape.box(20, 0.5, 20), { rotation: q });
    const origin = [-0.49 * Math.sin(angle), 0.49 * Math.cos(angle), 0] as const;
    const direction = [-Math.sin(angle) * 0.2, Math.cos(angle) * 0.2, -Math.sqrt(0.96)] as const;
    const wheel = nativeWheelRaycastCollider(origin, direction, box.collider, box.body, { maxDistance: 0.7 })!;
    close(wheel.normal, [Math.sin(angle), -Math.cos(angle), 0]);
    const mesh = fixture(Shape.mesh([[0, 0, 0], [0, 0, 1], [1, 0, 0]], [0, 1, 2]));
    expect(nativeWheelRaycastCollider([0.2, 0, 0.2], [0, -1, 0], mesh.collider, mesh.body)?.distance).toBe(0);
  });

  it("uses a rotated halfspace exit for a wheel and its normal fallback beyond travel", () => {
    const angle = 0.3, q = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const;
    const plane = fixture(Shape.plane(), { rotation: q });
    const origin = [0.01 * Math.sin(angle), -0.01 * Math.cos(angle), 0] as const;
    const direction = [-Math.sin(angle) * 0.2, Math.cos(angle) * 0.2, -Math.sqrt(0.96)] as const;
    const wheel = nativeWheelRaycastCollider(origin, direction, plane.collider, plane.body, { maxDistance: 0.7 })!;
    expect(wheel.distance).toBe(0);
    close(wheel.normal, [Math.sin(angle), -Math.cos(angle), 0]);
    const short = nativeWheelRaycastCollider(origin, direction, plane.collider, plane.body, { maxDistance: 0.01 })!;
    close(short.normal, [-direction[0], -direction[1], -direction[2]]);
  });

  it("uses the sphere exit normal for a wheel and the radial fallback when no exit is reached", () => {
    const sphere = fixture(Shape.sphere(1)), origin = [0, 0.9, 0] as const;
    const theta = 1.75, direction = [0, -Math.cos(theta), -Math.sin(theta)] as const;
    const projection = 0.9 * direction[1], exit = -projection + Math.sqrt(projection ** 2 + 1 - 0.9 ** 2);
    const wheel = nativeWheelRaycastCollider(origin, direction, sphere.collider, sphere.body, { maxDistance: 0.7 })!;
    close(wheel.normal, [0, -(0.9 + direction[1] * exit), -direction[2] * exit]);
    const short = nativeWheelRaycastCollider(origin, direction, sphere.collider, sphere.body, { maxDistance: 0.01 })!;
    close(short.normal, [0, -1, 0]);
    const ordinary = nativeRaycastCollider(origin, direction, sphere.collider, sphere.body, { maxDistance: 0.7 })!;
    close(ordinary.normal, [0, Math.cos(theta), Math.sin(theta)]);
    expect(() => nativeWheelRaycastCollider([0, 0, 0], [1, 0, 0], sphere.collider, sphere.body, { maxDistance: 0.1 })).toThrow(/sphere center/);
    close(nativeWheelRaycastCollider([0, 0, 0], [1, 0, 0], sphere.collider, sphere.body, { maxDistance: 2 })!.normal, [-1, 0, 0]);
    expect(() => nativeWheelRaycastCollider([0, 1, 0], [0, -1, 0], sphere.collider, sphere.body, { maxDistance: 0.7 })).toThrow(/sphere boundary/);
  });

  it("matches the public finite wheel normal at a sphere center when the ray reaches the exit", async () => {
    const { PhysicsWorld } = await import("../../../packages/physics/src/PhysicsWorld.js");
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const target = world.createRigidBody({ type: "static" });
      world.createCollider(target, { shape: Shape.sphere(1) });
      const body = world.createRigidBody({ type: "dynamic", position: [0, 3, 0], mass: 10 });
      world.createCollider(body, { shape: Shape.box(0.1, 0.1, 0.1) });
      const vehicle = world.createVehicleController(body);
      vehicle.addWheel({ connection: [0, -3, 0], direction: [0, -1, 0], axle: [1, 0, 0], radius: 0.7, restLength: 0.7 });
      vehicle.step(1 / 60);
      const wheel = vehicle.wheelState(0);
      expect(wheel.grounded).toBe(true);
      const sphere = fixture(Shape.sphere(1));
      const native = nativeWheelRaycastCollider([0, 0, 0], [0, -1, 0], sphere.collider, sphere.body, { maxDistance: 1.4 })!;
      close(native.normal, wheel.contactNormal!);
      close(native.point, wheel.contactPoint!);
    } finally {
      world.dispose();
    }
  });

  it("matches public wheel normals for capsule-axis symmetry cases", async () => {
    const { PhysicsWorld } = await import("../../../packages/physics/src/PhysicsWorld.js");
    const cases = [{ y: 0, theta: 0 }, { y: 0, theta: Math.PI / 2 }, { y: 1.4, theta: 0 }, { y: 1.4, theta: Math.PI }];
    for (const { y, theta } of cases) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0] });
      try {
        const target = world.createRigidBody({ type: "static" });
        world.createCollider(target, { shape: Shape.capsule(0.5, 1) });
        const cy = 3, offset = y - cy, rotation = [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)] as const;
        const body = world.createRigidBody({ type: "dynamic", position: [0, cy, 0], rotation, mass: 10 });
        world.createCollider(body, { shape: Shape.box(0.1, 0.1, 0.1) });
        const vehicle = world.createVehicleController(body);
        vehicle.addWheel({ connection: [0, offset * Math.cos(theta), -offset * Math.sin(theta)], direction: [0, -1, 0], axle: [1, 0, 0], radius: 0.3, restLength: 0.4 });
        vehicle.setAxes(1, 2);
        vehicle.resetToPose({ position: [0, cy, 0], rotation });
        vehicle.step(1 / 60);
        const wheel = vehicle.wheelState(0);
        expect(wheel.grounded).toBe(true);
        const capsule = fixture(Shape.capsule(0.5, 1));
        const native = nativeWheelRaycastCollider([0, y, 0], [0, -Math.cos(theta), -Math.sin(theta)], capsule.collider, capsule.body, { maxDistance: 0.7 })!;
        for (let axis = 0; axis < 3; axis++) expect(native.normal[axis]).toBeCloseTo(wheel.contactNormal![axis]!, 4);
      } finally {
        world.dispose();
      }
    }
    const capsule = fixture(Shape.capsule(0.5, 1));
    expect(() => nativeWheelRaycastCollider([0, 0, 0], [0, -Math.cos(1.75), -Math.sin(1.75)], capsule.collider, capsule.body, { maxDistance: 0.7 })).toThrow(/capsule/);
  });

  it("certifies long inside-convex rays through opposing faces across lengths and rotations", async () => {
    const shape = Shape.convexHull(boxVertices, boxIndices), angle = 0.3;
    const length = Math.hypot(0.2, 0.3, 0.1, 0.9);
    const rotations: readonly Quat[] = [[0, 0, 0, 1], [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], [0.2 / length, 0.3 / length, 0.1 / length, 0.9 / length]];
    const position: Vec3 = [2, 0.5, -0.5], localDirection: Vec3 = [0, -0.9, -Math.sqrt(0.19)];
    for (const rotation of rotations) for (const distance of [1.7, 3, 7]) {
      const direction = rotateVec3ByQuat(localDirection, rotation);
      const hull = fixture(shape, { position, rotation });
      const native = nativeWheelRaycastCollider(position, direction, hull.collider, hull.body, { maxDistance: distance })!;
      const expected = rotateVec3ByQuat([0, 1, 0], rotation);
      expect(native.distance).toBe(0);
      close(native.point, position);
      close(native.normal, expected);
      const wheel = await publicWheel(shape, position, rotation, position, direction, distance);
      expect(wheel.grounded).toBe(true);
      for (let axis = 0; axis < 3; axis++) expect(wheel.contactNormal![axis]).toBeCloseTo(expected[axis]!, 5);
    }
    const hull = fixture(shape);
    for (const distance of [1.4, 1.65]) {
      const wheel = await publicWheel(shape, [0, 0, 0], [0, 0, 0, 1], [0, 0, 0], localDirection, distance);
      expect(wheel.grounded).toBe(true);
      expect(() => nativeWheelRaycastCollider([0, 0, 0], localDirection, hull.collider, hull.body, { maxDistance: distance })).toThrow(/too short/);
    }
  });

  it("certifies a skewed rotated convex hull with an interior origin near one face", async () => {
    const shear = (v: Vec3): Vec3 => [v[0] + 0.5 * v[1] + 0.2 * v[2], v[1] + 0.2 * v[2], v[2]];
    const shape = Shape.convexHull(boxVertices.map(shear), boxIndices), angle = 0.3;
    const rotation: Quat = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], position: Vec3 = [0.2, 0.3, -0.1];
    const localOrigin = shear([0, 0.49, 0]), shifted = rotateVec3ByQuat(localOrigin, rotation);
    const origin: Vec3 = [position[0] + shifted[0], position[1] + shifted[1], position[2] + shifted[2]];
    const localDirection = shear([0.1, -0.9, 0.3]), direction = rotateVec3ByQuat(localDirection, rotation);
    const localNormal: Vec3 = [0, 1 / Math.sqrt(1.04), -0.2 / Math.sqrt(1.04)];
    const expected = rotateVec3ByQuat(localNormal, rotation), hull = fixture(shape, { position, rotation });
    for (const distance of [4, 7]) {
      const native = nativeWheelRaycastCollider(origin, direction, hull.collider, hull.body, { maxDistance: distance })!;
      close(native.normal, expected);
      close(native.point, origin);
      expect(native.distance).toBe(0);
      const wheel = await publicWheel(shape, position, rotation, origin, direction, distance);
      expect(wheel.grounded).toBe(true);
      for (let axis = 0; axis < 3; axis++) expect(wheel.contactNormal![axis]).toBeCloseTo(expected[axis]!, 5);
    }
    const short = await publicWheel(shape, position, rotation, origin, direction, 3);
    expect(short.grounded).toBe(true);
    expect(() => nativeWheelRaycastCollider(origin, direction, hull.collider, hull.body, { maxDistance: 3 })).toThrow(/too short/);
  });

  it("certifies an asymmetric triangular prism through its opposing faces", async () => {
    const shape = Shape.convexHull([[-1, -0.5, -1], [1, -0.5, -1], [0, -0.5, 1], [-1, 0.5, -1], [1, 0.5, -1], [0, 0.5, 1]], [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]);
    const angle = 0.3, rotation: Quat = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
    const origin: Vec3 = [0, 0, 0], direction = rotateVec3ByQuat([0.1, -0.98, 0.17], rotation);
    const expected = rotateVec3ByQuat([0, 1, 0], rotation), hull = fixture(shape, { rotation });
    for (const distance of [3, 5]) {
      const native = nativeWheelRaycastCollider(origin, direction, hull.collider, hull.body, { maxDistance: distance })!;
      expect(native.distance).toBe(0);
      close(native.normal, expected);
      const wheel = await publicWheel(shape, origin, rotation, origin, direction, distance);
      expect(wheel.grounded).toBe(true);
      for (let axis = 0; axis < 3; axis++) expect(wheel.contactNormal![axis]).toBeCloseTo(expected[axis]!, 5);
    }
  });

  it("matches the public wheel normal across a deterministic interior convex sample", async () => {
    const shear = (v: Vec3): Vec3 => [v[0] + 0.5 * v[1] + 0.2 * v[2], v[1] + 0.2 * v[2], v[2]];
    const prism = Shape.convexHull([[-1, -0.5, -1], [1, -0.5, -1], [0, -0.5, 1], [-1, 0.5, -1], [1, 0.5, -1], [0, 0.5, 1]], [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]);
    const shapes = [
      { shape: Shape.convexHull(boxVertices, boxIndices), transform: (v: Vec3): Vec3 => v, span: 2, normal: [0, 1, 0] as Vec3 },
      { shape: Shape.convexHull(boxVertices.map(shear), boxIndices), transform: shear, span: 2.9, normal: [0, 1 / Math.sqrt(1.04), -0.2 / Math.sqrt(1.04)] as Vec3 },
      { shape: prism, transform: (v: Vec3): Vec3 => v, span: 2, normal: [0, 1, 0] as Vec3 }
    ];
    const qLength = Math.hypot(0.2, 0.3, 0.1, 0.9);
    const rotations: readonly Quat[] = [[0, 0, 0, 1], [0, 0, Math.sin(0.15), Math.cos(0.15)], [0.2 / qLength, 0.3 / qLength, 0.1 / qLength, 0.9 / qLength]];
    const rays: readonly Vec3[] = [[0.1, -0.96, 0.17], [-0.15, -0.96, 0.1], [0.1, 0.96, -0.17], [0, 0.95, 0.2]];
    const position: Vec3 = [0.2, -0.2, 0.3];
    let compared = 0;
    for (const { shape, transform, span, normal } of shapes) {
      const nearFace = 0.5 - 2 * span * 2 ** -17;
      for (const y of [-nearFace, -0.2, 0, 0.2, nearFace]) for (const ray of rays) for (const rotation of rotations) {
        const offset = rotateVec3ByQuat(transform([0, y, 0]), rotation);
        const origin: Vec3 = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]];
        const localDirection = transform(ray), direction = rotateVec3ByQuat(localDirection, rotation), sign = ray[1] < 0 ? 1 : -1;
        const expected = rotateVec3ByQuat([sign * normal[0], sign * normal[1], sign * normal[2]], rotation);
        const hull = fixture(shape, { position, rotation });
        const lower = 1.01 * 3 * (0.5 + Math.abs(y)) * Math.hypot(...localDirection) / Math.abs(ray[1]), upper = 0.99 * 4 * span;
        for (const distance of [lower, (lower + upper) / 2, upper]) {
          const native = nativeWheelRaycastCollider(origin, direction, hull.collider, hull.body, { maxDistance: distance })!;
          const wheel = await publicWheel(shape, position, rotation, origin, direction, distance);
          expect(native.distance).toBe(0);
          expect(wheel.grounded).toBe(true);
          expect(Math.hypot(...native.point.map((value, axis) => value - wheel.contactPoint![axis]!))).toBeLessThan(2e-6);
          const error = Math.hypot(...native.normal.map((value, axis) => value - wheel.contactNormal![axis]!));
          expect(error).toBeLessThan(2e-4);
          close(native.normal, expected);
          compared++;
        }
      }
    }
    expect(compared).toBe(540);
  });

  it("rejects ambiguous convex wheel rays at faces, edges, short travel and nonparallel exits", () => {
    const hull = fixture(Shape.convexHull(boxVertices, boxIndices));
    expect(() => nativeWheelRaycastCollider([0, 0.5 - 1e-7, 0], [0, -0.9, -Math.sqrt(0.19)], hull.collider, hull.body, { maxDistance: 7 })).toThrow(/boundary/);
    expect(() => nativeWheelRaycastCollider([0, 0, 0], [1, 0.5, 0], hull.collider, hull.body, { maxDistance: 7 })).toThrow(/edge/);
    expect(() => nativeWheelRaycastCollider([0, 0, 0], [0, -0.9, -Math.sqrt(0.19)], hull.collider, hull.body, { maxDistance: 100 })).toThrow(/travel range/);
    expect(() => nativeWheelRaycastCollider([0, 0, 0], [0, -0.9, -Math.sqrt(0.19)], hull.collider, hull.body)).toThrow(/travel range/);
    const tetra = fixture(Shape.convexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]));
    expect(() => nativeWheelRaycastCollider([0.2, 0.2, 0.2], [1, 0, 0], tetra.collider, tetra.body, { maxDistance: 3 })).toThrow(/parallel/);
    const tilted = fixture(Shape.convexHull(boxVertices.map(([x, y, z]) => [x, y + (y > 0 ? x * 1e-8 : 0), z]), boxIndices));
    expect(() => nativeWheelRaycastCollider([0, 0, 0], [0, -1, 0], tilted.collider, tilted.body, { maxDistance: 3 })).toThrow(/parallel/);
    const outside = nativeWheelRaycastCollider([0, 2, 0], [0, -1, 0], hull.collider, hull.body, { maxDistance: 3 })!;
    expect(outside.distance).toBeCloseTo(1.5);
    close(outside.normal, [0, 1, 0]);
  });

  it("rejects an oblique capsule wheel ray whose public inside normal changes with ray length", async () => {
    const shape = Shape.capsule(0.5, 1), capsule = fixture(shape), theta = 0.3;
    const origin: Vec3 = [0, 0, 0], direction: Vec3 = [0, -Math.cos(theta), -Math.sin(theta)];
    const short = await publicWheel(shape, origin, [0, 0, 0, 1], origin, direction, 0.1);
    const long = await publicWheel(shape, origin, [0, 0, 0, 1], origin, direction, 0.2);
    expect(short.grounded && long.grounded).toBe(true);
    expect(Math.hypot(...short.contactNormal!.map((value, axis) => value - long.contactNormal![axis]!))).toBeGreaterThan(0.1);
    for (const distance of [0.1, 0.2]) {
      expect(() => nativeWheelRaycastCollider(origin, direction, capsule.collider, capsule.body, { maxDistance: distance })).toThrow(/capsule/);
    }
    const angle = 0.3, rotation: Quat = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
    const rotated = fixture(shape, { rotation }), rotatedDirection = rotateVec3ByQuat(direction, rotation);
    expect(() => nativeWheelRaycastCollider(origin, rotatedDirection, rotated.collider, rotated.body, { maxDistance: 0.2 })).toThrow(/capsule/);
    expect(() => nativeWheelRaycastCollider([0.5 - 1e-7, 0, 0], direction, capsule.collider, capsule.body, { maxDistance: 0.2 })).toThrow(/capsule/);
  });

  it("sweeps a sphere against rounded box corners rather than an inflated box", () => {
    const { body, collider } = fixture(Shape.box(0.5, 0.5, 0.5));
    const hit = nativeSphereCastCollider([-2, 0.65, 0.65], 0.25, [1, 0, 0], collider, body)!;
    const xOffset = Math.sqrt(0.25 ** 2 - 2 * 0.15 ** 2);
    expect(hit.distance).toBeCloseTo(1.5 - xOffset, 6);
    close(hit.normal, [-xOffset / 0.25, 0.6, 0.6]);
    expect(nativeSphereCastCollider([-2, 0.7, 0.7], 0.25, [1, 0, 0], collider, body)).toBeUndefined();
    expect(() => nativeSphereCastCollider([0, 0, 0], 0, [1, 0, 0], collider, body)).toThrow(/radius/);
  });

  it("casts against triangle faces and edges with explicit backface handling", () => {
    const mesh = fixture(Shape.mesh([[0, 0, 0], [0, 0, 2], [2, 0, 0]], [0, 1, 2]));
    const front = nativeRaycastCollider([0.4, 2, 0.4], [0, -1, 0], mesh.collider, mesh.body)!;
    expect(front.distance).toBeCloseTo(2);
    close(front.normal, [0, 1, 0]);
    expect(nativeRaycastCollider([0.4, -1, 0.4], [0, 1, 0], mesh.collider, mesh.body)).toBeUndefined();
    const back = nativeRaycastCollider([0.4, -1, 0.4], [0, 1, 0], mesh.collider, mesh.body, { includeBackfaces: true })!;
    close(back.normal, [0, -1, 0]);
    const edge = nativeSphereCastCollider([1.1, 2, 1.1], 0.25, [0, -1, 0], mesh.collider, mesh.body)!;
    expect(edge.distance).toBeCloseTo(2 - Math.sqrt(0.25 ** 2 - 0.2 ** 2 / 2), 6);
    expect(edge.normal[0]).toBeCloseTo(0.4, 6);
    expect(edge.normal[2]).toBeCloseTo(0.4, 6);
    expect(nativeSphereCastCollider([1.3, 2, 1.3], 0.25, [0, -1, 0], mesh.collider, mesh.body)).toBeUndefined();
    const grazing = nativeSphereCastCollider([-1, 0.1, 0.5], 0.25, [1, 0, 0], mesh.collider, mesh.body)!;
    const horizontalOffset = Math.sqrt(0.25 ** 2 - 0.1 ** 2);
    expect(grazing.distance).toBeCloseTo(1 - horizontalOffset, 6);
    close(grazing.normal, [-horizontalOffset / 0.25, 0.4, 0]);
    expect(nativeSphereCastCollider([-1, -0.1, 0.5], 0.25, [1, 0, 0], mesh.collider, mesh.body)).toBeUndefined();
    expect(nativeSphereCastCollider([-1, -0.1, 0.5], 0.25, [1, 0, 0], mesh.collider, mesh.body, { includeBackfaces: true })).toBeDefined();
  });

  it("uses row-major heightfield triangles and their actual winding", () => {
    const terrain = fixture(Shape.heightfield([[0, 0], [0, 2]], 2));
    const hit = nativeRaycastCollider([0.5, 3, 0.5], [0, -1, 0], terrain.collider, terrain.body)!;
    expect(hit.point[1]).toBeCloseTo(1);
    expect(hit.normal[1]).toBeGreaterThan(0.5);
    expect(nativeRaycastCollider([0.5, -1, 0.5], [0, 1, 0], terrain.collider, terrain.body)).toBeUndefined();
    expect(nativeRaycastCollider([0.5, -1, 0.5], [0, 1, 0], terrain.collider, terrain.body, { includeBackfaces: true })).toBeDefined();
  });

  it("uses every convex-hull vertex rather than only display triangles", () => {
    const hull = fixture(Shape.convexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [2, 0, 0]], [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]));
    const hit = nativeRaycastCollider([3, 0.1, 0.1], [-1, 0, 0], hull.collider, hull.body)!;
    expect(hit.distance).toBeCloseTo(1.4, 6);
    expect(nativeRaycastCollider([3, 0.8, 0.8], [-1, 0, 0], hull.collider, hull.body)).toBeUndefined();
    const cast = nativeSphereCastCollider([3, 0.1, 0.1], 0.1, [-1, 0, 0], hull.collider, hull.body)!;
    expect(cast.distance).toBeLessThan(hit.distance);
    expect(cast.normal[0]).toBeGreaterThan(0);
  });

  it("tests sphere and box overlaps against actual oriented geometry", () => {
    const large = fixture(Shape.box(2.5, 0.2, 0.2), { position: [3, 0, 0] });
    expect(nativeOverlapCollider([0, 0, 0], Shape.sphere(0.6), large.collider, large.body)).toBe(true);
    expect(nativeOverlapCollider([0, 0, 0], Shape.box(0.6, 0.3, 0.3), large.collider, large.body)).toBe(true);
    const rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] as const;
    const diagonal = fixture(Shape.box(1, 0.1, 0.1), { position: [1.2, -1.2, 0], rotation });
    expect(nativeOverlapCollider([0, 0, 0], Shape.box(0.5, 0.5, 0.5), diagonal.collider, diagonal.body)).toBe(false);
    const capsule = fixture(Shape.capsule(0.25, 1), { position: [1.3, 0, 0] });
    expect(nativeOverlapCollider([0, 0, 0], Shape.box(1, 0.5, 0.5), capsule.collider, capsule.body)).toBe(false);
    capsule.body.setPosition([1.2, 0, 0]);
    expect(nativeOverlapCollider([0, 0, 0], Shape.box(1, 0.5, 0.5), capsule.collider, capsule.body)).toBe(true);
  });

  it("distinguishes small separated shapes from initial overlap", () => {
    const target = fixture(Shape.sphere(0.0001), { position: [0.000201, 0, 0] });
    expect(nativeOverlapCollider([0, 0, 0], Shape.sphere(0.0001), target.collider, target.body)).toBe(false);
    expect(nativeSphereCastCollider([0, 0, 0], 0.0001, [1, 0, 0], target.collider, target.body)!.distance).toBeCloseTo(0.000001, 10);
    target.body.setPosition([0.000104, 0, 0]);
    expect(nativeRaycastCollider([0, 0, 0], [1, 0, 0], target.collider, target.body)!.distance).toBeCloseTo(0.000004, 10);
    const capsule = fixture(Shape.capsule(0.00001, 0.00001), { position: [0.00008, 0.000015, 0] });
    const hit = nativeSweepCollider(Shape.capsule(0.00001, 0.00001), [0, 0, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [0.0001, 0, 0], capsule.collider, capsule.body)!;
    expect(hit.fraction).toBeCloseTo((0.00007 - Math.sqrt(0.00002 ** 2 - 0.000005 ** 2)) / 0.0001, 6);
    target.body.setPosition([1e200, 0, 0]);
    expect(() => nativeOverlapCollider([0, 0, 0], Shape.sphere(0.0001), target.collider, target.body)).toThrow(/numeric range/);
  });

  it("does not inflate sweep tolerance to the length of a long displacement", () => {
    const sphere = fixture(Shape.sphere(0.5), { position: [1000, 0.9, 0] });
    const hit = nativeSweepCollider(Shape.sphere(0.5), [0, 0, 0], [0, 0, 0, 1], [1e9, 0, 0], sphere.collider, sphere.body)!;
    expect(hit.fraction * 1e9).toBeCloseTo(1000 - Math.sqrt(1 - 0.9 ** 2), 3);
    const extreme = nativeSweepCollider(Shape.sphere(0.5), [0, 0, 0], [0, 0, 0, 1], [1e15, 0, 0], sphere.collider, sphere.body)!;
    expect(extreme.fraction * 1e15).toBeCloseTo(1000 - Math.sqrt(1 - 0.9 ** 2), 3);
  });

  it("skips a tangential graze while retaining a shallow entering collision", () => {
    const target = fixture(Shape.sphere(0.5), { position: [3, 1, 0] });
    const shape = Shape.sphere(0.5), q = [0, 0, 0, 1] as const, displacement = [4, 0, 0] as const;
    expect(nativeSweepCollider(shape, [0, 0, 0], q, displacement, target.collider, target.body)).toBeUndefined();
    target.body.setPosition([3, 0.999, 0]);
    const hit = nativeSweepCollider(shape, [0, 0, 0], q, displacement, target.collider, target.body)!;
    expect(hit.fraction).toBeCloseTo((3 - Math.sqrt(1 - 0.999 ** 2)) / 4, 6);
  });

  it("rejects convex-hull bounding-box false positives for box overlaps", () => {
    const hull = fixture(Shape.convexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]));
    expect(nativeOverlapCollider([0.1, 0.1, 0.1], Shape.box(0.05, 0.05, 0.05), hull.collider, hull.body)).toBe(true);
    expect(nativeOverlapCollider([0.8, 0.8, 0.8], Shape.box(0.1, 0.1, 0.1), hull.collider, hull.body)).toBe(false);
    expect(nativeOverlapCollider([0.8, 0.8, 0.8], Shape.sphere(0.1), hull.collider, hull.body)).toBe(false);
  });

  it("reports sphere sweep fractions and collider identity", () => {
    const target = fixture(Shape.box(0.5, 0.5, 0.5), { position: [3, 0, 0] });
    const hit = nativeSweepCollider(Shape.sphere(0.25), [0, 0, 0], [0, 0, 0, 1], [4, 0, 0], target.collider, target.body)!;
    expect(hit.fraction).toBeCloseTo(2.25 / 4);
    close(hit.normal, [-1, 0, 0]);
    expect(hit.collider).toBe(target.collider);
    expect(hit.body).toBe(target.body);
  });

  it("sweeps rotated capsules against spheres and all moving shapes against planes", () => {
    const sphere = fixture(Shape.sphere(0.5), { position: [3, 0, 0] });
    const horizontal = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const hit = nativeSweepCollider(Shape.capsule(0.25, 0.5), [0, 0, 0], horizontal, [4, 0, 0], sphere.collider, sphere.body)!;
    expect(hit.fraction).toBeCloseTo(1.75 / 4, 6);
    close(hit.normal, [-1, 0, 0]);
    close(hit.point, [2.5, 0, 0]);
    const plane = fixture(Shape.plane());
    const falling = nativeSweepCollider(Shape.capsule(0.2, 0.5), [0, 2, 0], [0, 0, 0, 1], [0, -3, 0], plane.collider, plane.body)!;
    expect(falling.fraction).toBeCloseTo(1.3 / 3, 6);
    close(falling.normal, [0, 1, 0]);
    close(falling.point, [0, 0, 0]);
    expect(nativeSweepCollider(Shape.box(0.5, 0.5, 0.5), [0, 2, 0], [0, 0, 0, 1], [0, 2, 0], plane.collider, plane.body)).toBeUndefined();
  });

  it("sweeps full capsule geometry with an offset against boxes and capsules", () => {
    const target = fixture(Shape.box(0.5, 0.5, 0.5), { position: [3, 0, 0] });
    const shape = Shape.capsule(0.2, 0.5);
    const hit = nativeSweepCollider(shape, [0, 0, 0], [0, 0, 0, 1], [4, 0, 0], target.collider, target.body, 0.1)!;
    expect(hit.fraction).toBeCloseTo(2.2 / 4, 6);
    close(hit.normal, [-1, 0, 0]);
    expect(hit.point[0]).toBeCloseTo(2.5, 6);
    const horizontal = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const rotated = nativeSweepCollider(shape, [0, 0, 0], horizontal, [4, 0, 0], target.collider, target.body)!;
    expect(rotated.fraction).toBeCloseTo(1.8 / 4, 6);
    const other = fixture(Shape.capsule(0.5, 0.5), { position: [3, 0, 0] });
    const capsule = nativeSweepCollider(Shape.capsule(0.25, 0.5), [0, 0, 0], [0, 0, 0, 1], [4, 0, 0], other.collider, other.body)!;
    expect(capsule.fraction).toBeCloseTo(2.25 / 4, 6);
    close(capsule.normal, [-1, 0, 0]);
    expect(capsule.point[0]).toBeCloseTo(2.5, 6);
  });

  it("sweeps capsules against convex hull and heightfield surfaces", () => {
    const hull = fixture(Shape.convexHull([
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
    ], [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]), { position: [3, 0, 0] });
    const shape = Shape.capsule(0.2, 0.5);
    const hullHit = nativeSweepCollider(shape, [0, 0, 0], [0, 0, 0, 1], [4, 0, 0], hull.collider, hull.body)!;
    expect(hullHit.fraction).toBeCloseTo(2.3 / 4, 6);
    close(hullHit.normal, [-1, 0, 0]);
    const field = fixture(Shape.heightfield([[0, 0], [0, 0]], 4));
    const floor = nativeSweepCollider(shape, [0, 2, 0], [0, 0, 0, 1], [0, -3, 0], field.collider, field.body, 0.1)!;
    expect(floor.fraction).toBeCloseTo(1.2 / 3, 6);
    close(floor.normal, [0, 1, 0]);
    close(floor.point, [0, 0, 0]);
  });

  it("does not let tangent floor contacts hide a later wall on the same mesh", () => {
    const mesh = fixture(Shape.mesh([
      [-3, 0, -3], [-3, 0, 3], [3, 0, -3], [3, 0, 3],
      [2, 0, -3], [2, 3, -3], [2, 0, 3], [2, 3, 3]
    ], [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]));
    const hit = nativeSweepCollider(Shape.capsule(0.25, 0.5), [0, 0.85, 0], [0, 0, 0, 1], [3, 0, 0], mesh.collider, mesh.body, 0.1)!;
    expect(hit.fraction).toBeCloseTo(1.65 / 3, 6);
    close(hit.normal, [-1, 0, 0]);
    expect(hit.point[0]).toBeCloseTo(2, 6);
    expect(hit.collider).toBe(mesh.collider);
    expect(hit.body).toBe(mesh.body);
    const acrossSeam = nativeSweepCollider(Shape.capsule(0.25, 0.5), [-2, 0.85, 0], [0, 0, 0, 1], [5, 0, 0], mesh.collider, mesh.body, 0.1)!;
    expect(acrossSeam.fraction).toBeCloseTo(3.65 / 5, 6);
    close(acrossSeam.normal, [-1, 0, 0]);
  });

  it("ignores tangent or separating initial contact for convex targets", () => {
    const plane = fixture(Shape.plane());
    expect(nativeSweepCollider(Shape.capsule(0.25, 0.5), [0, 0.85, 0], [0, 0, 0, 1], [1, 0, 0], plane.collider, plane.body, 0.1)).toBeUndefined();
    const sphere = fixture(Shape.sphere(0.5));
    expect(nativeSweepCollider(Shape.sphere(0.5), [-1, 0, 0], [0, 0, 0, 1], [0, 1, 0], sphere.collider, sphere.body)).toBeUndefined();
    expect(nativeSweepCollider(Shape.box(0.5, 0.5, 0.5), [-1, 0, 0], [0, 0, 0, 1], [-1, 0, 0], sphere.collider, sphere.body)).toBeUndefined();
    const box = fixture(Shape.box(0.5, 0.5, 0.5));
    expect(nativeSweepCollider(Shape.box(0.5, 0.5, 0.5), [-1, 0, 0], [0, 0, 0, 1], [0, 1, 0], box.collider, box.body)).toBeUndefined();
  });

  it("sweeps oriented boxes against boxes and spheres without expanding their AABBs", () => {
    const target = fixture(Shape.box(0.5, 0.5, 0.5), { position: [3, 0, 0] });
    const rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] as const;
    const box = nativeSweepCollider(Shape.box(0.5, 0.5, 0.5), [0, 0, 0], rotation, [4, 0, 0], target.collider, target.body)!;
    expect(box.fraction).toBeCloseTo((2.5 - Math.SQRT1_2) / 4, 6);
    close(box.normal, [-1, 0, 0]);
    expect(box.point[0]).toBeCloseTo(2.5, 6);
    const sphere = fixture(Shape.sphere(0.5), { position: [3, 0, 0] });
    const contact = nativeSweepCollider(Shape.box(0.5, 0.5, 0.5), [0, 0, 0], [0, 0, 0, 1], [4, 0, 0], sphere.collider, sphere.body)!;
    expect(contact.fraction).toBeCloseTo(0.5, 6);
    close(contact.normal, [-1, 0, 0]);
    close(contact.point, [2.5, 0, 0]);
  });

  it("uses rounded box clearance for offset sweeps, including diagonal edges", () => {
    const shape = Shape.box(0.5, 0.5, 0.5), q = [0, 0, 0, 1] as const;
    const target = fixture(Shape.box(0.5, 0.5, 0.5), { position: [3, 1.15, 0] });
    const hit = nativeSweepCollider(shape, [0, 0, 0], q, [4, 0, 0], target.collider, target.body, 0.25)!;
    expect(hit.fraction).toBeCloseTo(1.8 / 4, 6);
    close(hit.normal, [-0.8, -0.6, 0]);
    expect(hit.point[0]).toBeCloseTo(2.5, 6);
    expect(hit.point[1]).toBeCloseTo(0.65, 6);
    target.body.setPosition([3, 1.3, 0]);
    expect(nativeSweepCollider(shape, [0, 0, 0], q, [4, 0, 0], target.collider, target.body, 0.25)).toBeUndefined();
  });

  it("matches analytic offset box face, edge, and corner contact distances", () => {
    const shape = Shape.box(0.5, 0.5, 0.5), q = [0, 0, 0, 1] as const, radius = 0.25;
    for (const [dy, dz] of [[0, 0], [0.1, 0], [0.15, 0.1], [0.18, 0.15], [0, 0.24]] as const) {
      const target = fixture(Shape.box(0.5, 0.5, 0.5), { position: [3, 1 + dy, 1 + dz] });
      const x = Math.sqrt(radius * radius - dy * dy - dz * dz);
      const hit = nativeSweepCollider(shape, [0, 0, 0], q, [4, 0, 0], target.collider, target.body, radius)!;
      expect(hit.fraction).toBeCloseTo((2 - x) / 4, 6);
      close(hit.normal, [-x / radius, -dy / radius, -dz / radius]);
      expect(hit.point[0]).toBeCloseTo(2.5, 6);
    }
  });

  it("sweeps rotated boxes with positive offset against rotated boxes and hulls", () => {
    const rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] as const;
    const direction = [Math.SQRT1_2, Math.SQRT1_2, 0] as const;
    const position = [3 * direction[0], 3 * direction[1], 0] as const;
    const movement = [4 * direction[0], 4 * direction[1], 0] as const;
    const box = fixture(Shape.box(0.5, 0.5, 0.5), { position, rotation });
    const shape = Shape.box(0.5, 0.5, 0.5);
    const hit = nativeSweepCollider(shape, [0, 0, 0], rotation, movement, box.collider, box.body, 0.2)!;
    expect(hit.fraction).toBeCloseTo(0.45, 6);
    close(hit.normal, [-direction[0], -direction[1], 0]);
    expect(hit.point[0] * direction[0] + hit.point[1] * direction[1]).toBeCloseTo(2.5, 6);
    const hull = fixture(Shape.convexHull([
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
    ], [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]), { position, rotation });
    const convex = nativeSweepCollider(shape, [0, 0, 0], rotation, movement, hull.collider, hull.body, 0.2)!;
    expect(convex.fraction).toBeCloseTo(0.45, 6);
    close(convex.normal, [-direction[0], -direction[1], 0]);
    const direct = nativeSweepCollider(shape, [0, 0, 0], rotation, movement, hull.collider, hull.body)!;
    expect(direct.fraction).toBeCloseTo(0.5, 6);
    close(direct.normal, [-direction[0], -direction[1], 0]);
  });

  it("sweeps boxes across mesh seams toward walls with and without offset", () => {
    const mesh = fixture(Shape.mesh([
      [-3, 0, -3], [-3, 0, 3], [3, 0, -3], [3, 0, 3],
      [2, 0, -3], [2, 3, -3], [2, 0, 3], [2, 3, 3]
    ], [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]));
    const shape = Shape.box(0.2, 0.5, 0.2), q = [0, 0, 0, 1] as const;
    const hit = nativeSweepCollider(shape, [-2, 0.6, 0], q, [5, 0, 0], mesh.collider, mesh.body, 0.1)!;
    expect(hit.fraction).toBeCloseTo(3.7 / 5, 6);
    close(hit.normal, [-1, 0, 0]);
    expect(hit.point[0]).toBeCloseTo(2, 6);
    const noOffset = nativeSweepCollider(shape, [-2, 0.5, 0], q, [5, 0, 0], mesh.collider, mesh.body)!;
    expect(noOffset.fraction).toBeCloseTo(3.8 / 5, 6);
    close(noOffset.normal, [-1, 0, 0]);
  });

  it("sweeps an offset box against an exposed mesh edge and a sloped heightfield", () => {
    const edge = fixture(Shape.mesh([[0, 0, -2], [0, 0, 2], [2, 0, -2]], [0, 1, 2]));
    const shape = Shape.box(0.1, 0.1, 0.1), q = [0, 0, 0, 1] as const;
    const hit = nativeSweepCollider(shape, [-1, 0.25, 0], q, [2, 0, 0], edge.collider, edge.body, 0.25)!;
    expect(hit.fraction).toBeCloseTo(0.35, 6);
    close(hit.normal, [-0.8, 0.6, 0]);
    expect(hit.point[0]).toBeCloseTo(0, 6);
    expect(hit.point[1]).toBeCloseTo(0, 6);
    const field = fixture(Shape.heightfield([[0, 4], [0, 4]], 4));
    const terrain = nativeSweepCollider(Shape.box(0.2, 0.2, 0.2), [0, 4, 0], q, [0, -4, 0], field.collider, field.body, 0.1)!;
    expect(terrain.fraction).toBeCloseTo((2 - 0.4 - 0.1 * Math.SQRT2) / 4, 6);
    close(terrain.normal, [-Math.SQRT1_2, Math.SQRT1_2, 0]);
    expect(terrain.point[1]).toBeCloseTo(terrain.point[0] + 2, 6);
  });

  it("sweeps a box against a capsule and explicitly rejects ambiguous initial penetration", () => {
    const capsule = fixture(Shape.capsule(0.25, 0.5), { position: [3, 0, 0] });
    const shape = Shape.box(0.5, 0.5, 0.5), q = [0, 0, 0, 1] as const;
    const hit = nativeSweepCollider(shape, [0, 0, 0], q, [4, 0, 0], capsule.collider, capsule.body, 0.1)!;
    expect(hit.fraction).toBeCloseTo(2.15 / 4, 6);
    close(hit.normal, [-1, 0, 0]);
    expect(hit.point[0]).toBeCloseTo(2.75, 6);
    const mesh = fixture(Shape.mesh([[0, 0, -2], [0, 0, 2], [2, 0, -2]], [0, 1, 2]));
    expect(() => nativeSweepCollider(shape, [0.2, 0, 0], q, [1, 0, 0], mesh.collider, mesh.body, 0.1)).toThrow(/initially penetrating/);
  });

  it("does not turn a separating corner contact into a blocking offset hit", () => {
    const target = fixture(Shape.box(0.5, 0.5, 0.5), { position: [1, 1, 0] });
    const shape = Shape.box(0.5, 0.5, 0.5), q = [0, 0, 0, 1] as const;
    expect(nativeSweepCollider(shape, [0, 0, 0], q, [1, -1, 0], target.collider, target.body, 0.1)).toBeUndefined();
    expect(nativeSweepCollider(shape, [0, 0, 0], q, [1, 1, 0], target.collider, target.body, 0.1)?.fraction).toBe(0);
  });

  it("ignores degenerate mesh triangles in overlaps as well as casts", () => {
    const degenerate = fixture(Shape.mesh([[0, 0, 0], [1, 0, 0], [2, 0, 0], [10, 0, 0], [10, 0, 1], [11, 0, 0]], [0, 1, 2, 3, 4, 5]));
    expect(nativeOverlapCollider([1, 0, 0], Shape.sphere(0.1), degenerate.collider, degenerate.body)).toBe(false);
    expect(nativeOverlapCollider([1, 0, 0], Shape.box(0.1, 0.1, 0.1), degenerate.collider, degenerate.body)).toBe(false);
  });
});
