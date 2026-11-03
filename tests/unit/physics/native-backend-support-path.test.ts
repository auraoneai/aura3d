import { describe, expect, it } from "vitest";
import { Collider, type ColliderDescriptor } from "../../../packages/physics/src/Collider.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { addVec3, rotateVec3ByQuat, scaleVec3, Shape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { certifyNativeSphereSupportPath, certifyNativeSupportPath, type NativeSphereSupportPathRequest, type NativeSupportObstacle } from "../../../packages/physics/src/native/NativeSupportPath.js";

function character() {
  const body = new RigidBody(1, { type: "kinematic" });
  const collider = new Collider(1, body.id, { shape: Shape.sphere(0.1), filter: { layer: 1, mask: 1 } });
  return { body, collider };
}

function box(id: number, position: Vec3, half: Vec3, extra: Partial<ColliderDescriptor> = {}): NativeSupportObstacle {
  const body = new RigidBody(id, { type: "static", position });
  const collider = new Collider(id, body.id, { shape: Shape.box(...half), ...extra });
  return { body, collider };
}

function plane(id: number, normal: Vec3 = [0, 1, 0]): NativeSupportObstacle {
  const body = new RigidBody(id, { type: "static" });
  return { body, collider: new Collider(id, body.id, { shape: Shape.plane(normal) }) };
}

function request(overrides: Partial<NativeSphereSupportPathRequest> = {}): NativeSphereSupportPathRequest {
  return {
    ...character(), origin: [0.125, 0.125, 0], displacement: [0.25, 0, 0], offset: 0.025,
    maxSlopeClimbAngle: Math.PI / 4, obstacles: [], ...overrides
  };
}

describe("native sphere support-path certificates", () => {
  it("merges exact adjacent planar support intervals without a sampling gap", () => {
    const result = certifyNativeSphereSupportPath(request({ obstacles: [
      box(2, [0.125, -0.25, 0], [0.125, 0.25, 1]),
      box(3, [0.375, -0.25, 0], [0.125, 0.25, 1])
    ] }));
    expect(result.status).toBe("certified");
    expect(result.intervals.map(({ start, end, colliderId }) => [start, end, colliderId])).toEqual([[0, 0.5, 2], [0.5, 1, 3]]);
    expect(result.tolerance).toBe(1e-9);
  });

  it("does not certify a narrow gap between valid endpoint supports", () => {
    const delta = 1e-12;
    const result = certifyNativeSphereSupportPath(request({ obstacles: [
      box(2, [0.125, -0.25, 0], [0.125, 0.25, 1]),
      box(3, [(0.25 + delta + 0.5) / 2, -0.25, 0], [(0.5 - 0.25 - delta) / 2, 0.25, 1])
    ] }));
    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") throw new Error("Expected unproven support.");
    expect(result.firstUncovered).toBeCloseTo(0.5, 10);
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[1]!.start).toBeGreaterThan(result.intervals[0]!.end);
  });

  it("certifies a rising path tangent to a walkable sloped plane", () => {
    const rootHalf = Math.SQRT1_2;
    const slope = plane(2, [-rootHalf, rootHalf, 0]);
    const options = request({ origin: [0, 0.125 / rootHalf, 0], displacement: [0.5, 0.5, 0], obstacles: [slope], maxSlopeClimbAngle: Math.PI / 3 });
    const result = certifyNativeSphereSupportPath(options);
    expect(result.status).toBe("certified");
    expect(result.intervals).toMatchObject([{ start: 0, end: 1, colliderId: 2 }]);
    expect(certifyNativeSphereSupportPath({ ...options, maxSlopeClimbAngle: Math.PI / 6 }).status).toBe("unsupported");
  });

  it("uses the offset sphere's contact point on a rotated sloped box face", () => {
    const angle = 0.2;
    const rotation = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const;
    const body = new RigidBody(2, { type: "static", rotation });
    const collider = new Collider(2, body.id, { shape: Shape.box(0.75, 0.25, 1) });
    const normal = rotateVec3ByQuat([0, 1, 0], rotation);
    const witness = rotateVec3ByQuat([-0.5, 0.25, 0], rotation);
    const origin = addVec3(witness, scaleVec3(normal, 0.125));
    const displacement = rotateVec3ByQuat([1, 0, 0], rotation);
    const result = certifyNativeSphereSupportPath(request({ origin, displacement, obstacles: [{ body, collider }], maxSlopeClimbAngle: 0.3 }));
    expect(result.status).toBe("certified");
    expect(result.intervals).toMatchObject([{ start: 0, end: 1, colliderId: 2 }]);
  });

  it("certifies an upright capsule across adjacent boxes and rejects an actual gap", () => {
    const body = new RigidBody(1, { type: "kinematic" });
    const collider = new Collider(1, body.id, { shape: Shape.capsule(0.1, 0.5) });
    const a = box(2, [0.125, -0.25, 0], [0.125, 0.25, 1]);
    const b = box(3, [0.375, -0.25, 0], [0.125, 0.25, 1]);
    const input = request({ body, collider, origin: [0.125, 0.625, 0], obstacles: [a, b] });
    expect(certifyNativeSupportPath(input).status).toBe("certified");
    const separated = box(3, [0.4, -0.25, 0], [0.1, 0.25, 1]);
    expect(certifyNativeSupportPath({ ...input, obstacles: [a, separated] })).toMatchObject({ status: "unsupported", firstUncovered: 0.5 });
  });

  it("certifies a capsule aligned to a rotated sloping box", () => {
    const angle = 0.2;
    const rotation = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const;
    const body = new RigidBody(1, { type: "kinematic", rotation });
    const collider = new Collider(1, body.id, { shape: Shape.capsule(0.1, 0.5) });
    const support = new RigidBody(2, { type: "static", rotation });
    const obstacle = new Collider(2, support.id, { shape: Shape.box(0.75, 0.25, 1) });
    const origin = rotateVec3ByQuat([-0.5, 0.25 + 0.5 + 0.125, 0], rotation);
    const displacement = rotateVec3ByQuat([1, 0, 0], rotation);
    const result = certifyNativeSupportPath(request({ body, collider, origin, displacement, obstacles: [{ body: support, collider: obstacle }], maxSlopeClimbAngle: 0.3 }));
    expect(result.status).toBe("certified");
  });

  it("uses a box's bottom footprint to distinguish a bridgeable gap from a wider one", () => {
    const supports = [box(2, [0.125, -0.25, 0], [0.125, 0.25, 1]), box(3, [0.5, -0.25, 0], [0.125, 0.25, 1])];
    const run = (halfWidth: number) => {
      const body = new RigidBody(1, { type: "kinematic" });
      const collider = new Collider(1, body.id, { shape: Shape.box(halfWidth, 0.5, 0.1) });
      return certifyNativeSupportPath(request({ body, collider, origin: [0.125, 0.525, 0], displacement: [0.375, 0, 0], obstacles: supports }));
    };
    const bridging = run(0.07);
    expect(bridging.status).toBe("certified");
    expect(bridging.intervals[0]!.end).toBeGreaterThan(bridging.intervals[1]!.start);
    expect(run(0.05).status).toBe("unsupported");
  });

  it("can require the box center to remain over the actual landing face", () => {
    const body = new RigidBody(1, { type: "kinematic" });
    const collider = new Collider(1, body.id, { shape: Shape.box(0.3, 0.5, 0.1) });
    const narrow = box(2, [0.05, -0.25, 0], [0.05, 0.25, 1]);
    const input = request({ body, collider, origin: [0, 0.525, 0], displacement: [0.2, 0, 0], obstacles: [narrow] });
    // The footprint overlaps the entire short path, but the actual face is
    // only 0.1 units long and cannot provide 0.2 units of centered support.
    expect(certifyNativeSupportPath(input).status).toBe("certified");
    expect(certifyNativeSupportPath({ ...input, requireCenterSupport: true })).toMatchObject({ status: "unsupported", firstUncovered: 0.5 });
  });

  it("accepts authored decimal face endpoints within floating-point roundoff", () => {
    const body = new RigidBody(1, { type: "kinematic" });
    const collider = new Collider(1, body.id, { shape: Shape.box(0.2, 0.5, 0.1) });
    for (const [center, half] of [[1.1, 0.6], [0.6, 0.1], [0.8, 0.3]] as const) {
      const input = request({
        body, collider, origin: [0.5, 0.525, 0], displacement: [0.2, 0, 0], requireCenterSupport: true,
        obstacles: [box(2, [center, -0.25, 0], [half, 0.25, 1])]
      });
      expect(certifyNativeSupportPath(input).status).toBe("certified");
    }
  });

  it("handles a rotated box's support radius on a sloped plane", () => {
    const normal: Vec3 = [-Math.SQRT1_2, Math.SQRT1_2, 0];
    const body = new RigidBody(1, { type: "kinematic" });
    const collider = new Collider(1, body.id, { shape: Shape.box(0.1, 0.2, 0.1) });
    const support = 0.1 * Math.SQRT1_2 + 0.2 * Math.SQRT1_2 + 0.025;
    const result = certifyNativeSupportPath(request({ body, collider, origin: [0, support / Math.SQRT1_2, 0], displacement: [0.5, 0.5, 0], maxSlopeClimbAngle: Math.PI / 3, obstacles: [plane(2, normal)] }));
    expect(result.status).toBe("certified");
  });

  it("rejects non-aligned box/capsule pairs and zero-skin box clearance", () => {
    const rotation = [0, 0, Math.sin(0.1), Math.cos(0.1)] as const;
    const obstacleBody = new RigidBody(2, { type: "static", rotation });
    const obstacleCollider = new Collider(2, obstacleBody.id, { shape: Shape.box(1, 0.25, 1) });
    for (const shape of [Shape.box(0.1, 0.2, 0.1), Shape.capsule(0.1, 0.5)]) {
      const body = new RigidBody(1, { type: "kinematic" });
      const collider = new Collider(1, body.id, { shape });
      expect(certifyNativeSupportPath(request({ body, collider, obstacles: [{ body: obstacleBody, collider: obstacleCollider }] }))).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/orientations/) });
    }
    const body = new RigidBody(1, { type: "kinematic" });
    const collider = new Collider(1, body.id, { shape: Shape.box(0.1, 0.2, 0.1) });
    expect(certifyNativeSupportPath(request({ body, collider, offset: 0, obstacles: [plane(2)] })).status).toBe("unsupported");
  });

  it("detects a full-sphere clearance obstruction between endpoint probes", () => {
    const result = certifyNativeSphereSupportPath(request({
      origin: [0, 0.125, 0], displacement: [0.5, 0, 0],
      obstacles: [plane(2), box(3, [0.25, 0.25, 0], [0.025, 0.05, 0.5])]
    }));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("Expected obstruction.");
    expect(result.colliderId).toBe(3);
    expect(result.witnessFraction).toBeGreaterThan(0);
    expect(result.witnessFraction).toBeLessThan(1);
  });

  it("does not merge support at incompatible heights through an intersecting obstacle", () => {
    const result = certifyNativeSphereSupportPath(request({ obstacles: [
      box(2, [0.125, -0.25, 0], [0.125, 0.25, 1]),
      box(3, [0.375, -0.23, 0], [0.125, 0.25, 1])
    ] }));
    expect(result).toMatchObject({ status: "blocked", colliderId: 3 });
  });

  it("honors both masks and ignores sensors, including unsupported geometry", () => {
    const ignoredDynamic = new RigidBody(3, { type: "dynamic" });
    const masked = new Collider(3, ignoredDynamic.id, { shape: Shape.sphere(1), filter: { layer: 2, mask: 1 } });
    const trigger = box(4, [0.25, 0.2, 0], [0.2, 0.2, 1], { sensor: true });
    const oppositeMask = box(5, [0.25, 0.2, 0], [0.2, 0.2, 1], { filter: { layer: 1, mask: 0 } });
    const result = certifyNativeSphereSupportPath(request({ obstacles: [plane(2), { body: ignoredDynamic, collider: masked }, trigger, oppositeMask] }));
    expect(result.status).toBe("certified");
    expect(result.intervals.map((interval) => interval.colliderId)).toEqual([2]);
  });

  it("explicitly rejects moving and unsupported eligible geometry", () => {
    const dynamic = new RigidBody(2, { type: "dynamic" });
    const dynamicCollider = new Collider(2, dynamic.id, { shape: Shape.box(1, 1, 1) });
    const moving = certifyNativeSphereSupportPath(request({ obstacles: [{ body: dynamic, collider: dynamicCollider }] }));
    expect(moving).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/Moving/) });
    const body = new RigidBody(3, { type: "static" });
    const sphere = new Collider(3, body.id, { shape: Shape.sphere(1) });
    expect(certifyNativeSphereSupportPath(request({ obstacles: [{ body, collider: sphere }] }))).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/sphere/) });
  });

  it("uses dynamic box snapshots only as allowed support, while retaining their clearance", () => {
    const dynamic = new RigidBody(2, { type: "dynamic", position: [0.25, -0.25, 0], velocity: [5, 0, 0] });
    const dynamicCollider = new Collider(2, dynamic.id, { shape: Shape.box(0.5, 0.25, 1) });
    const input = request({ obstacles: [{ body: dynamic, collider: dynamicCollider }], includeDynamicBodies: true });
    expect(certifyNativeSphereSupportPath(input)).toMatchObject({ status: "certified", intervals: [{ colliderId: 2 }] });
    expect(certifyNativeSphereSupportPath({ ...input, includeDynamicBodies: false })).toMatchObject({ status: "unsupported", firstUncovered: 0 });

    // An excluded dynamic object still blocks a path if it intrudes into the
    // moving shape; it cannot disappear from a valid static-floor proof.
    dynamic.setPosition([0.25, 0.125, 0]);
    expect(certifyNativeSphereSupportPath({ ...input, includeDynamicBodies: false, obstacles: [plane(3), { body: dynamic, collider: dynamicCollider }] }))
      .toMatchObject({ status: "blocked", colliderId: 2 });
    dynamic.setPosition([100, 0, 0]);
    expect(certifyNativeSphereSupportPath({ ...input, obstacles: [plane(3), { body: dynamic, collider: dynamicCollider }] })).toMatchObject({ status: "certified", intervals: [{ colliderId: 3 }] });
  });

  it("prunes distant unsupported static and dynamic geometry in the current snapshot", () => {
    const support = plane(2);
    for (const type of ["static", "dynamic", "kinematic"] as const) {
      const body = new RigidBody(3, { type, position: [100, 0, 0], velocity: [1000, 0, 0] });
      const collider = new Collider(3, body.id, { shape: Shape.sphere(0.5) });
      const result = certifyNativeSphereSupportPath(request({ obstacles: [support, { body, collider }] }));
      expect(result.status).toBe("certified");
      expect(result.intervals.map((interval) => interval.colliderId)).toEqual([2]);
    }
  });

  it("retains nearby unsupported and dynamic shapes, including mid-path collisions", () => {
    const support = plane(2);
    for (const type of ["static", "dynamic", "kinematic"] as const) {
      const body = new RigidBody(3, { type, position: [0, 0.125, 0] });
      const collider = new Collider(3, body.id, { shape: Shape.sphere(0.05) });
      const result = certifyNativeSphereSupportPath(request({ origin: [-2, 0.125, 0], displacement: [4, 0, 0], obstacles: [support, { body, collider }] }));
      expect(result.status).toBe("unsupported");
      if (result.status !== "unsupported") throw new Error("Expected unsupported nearby geometry.");
      expect(result.reason).toMatch(type === "static" ? /sphere/ : /Moving/);
    }
  });

  it("retains large or off-center geometry that reaches the path from a distant body", () => {
    const support = plane(2);
    const body = new RigidBody(3, { type: "static", position: [100, 0, 0] });
    const sphere = new Collider(3, body.id, { shape: Shape.sphere(100) });
    expect(certifyNativeSphereSupportPath(request({ obstacles: [support, { body, collider: sphere }] }))).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/sphere/) });
    const mesh = new Collider(4, body.id, { shape: Shape.mesh([[-100, -0.2, -0.2], [-99, -0.2, -0.2], [-100, 0.2, 0.2]], [0, 1, 2]) });
    expect(certifyNativeSphereSupportPath(request({ obstacles: [support, { body, collider: mesh }] }))).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/mesh/) });
  });

  it("does not prune touching or numerically uncertain bounds", () => {
    const body = new RigidBody(3, { type: "static", position: [0.25, 0.125, 0.175 + 1e-12] });
    const collider = new Collider(3, body.id, { shape: Shape.sphere(0.05) });
    expect(certifyNativeSphereSupportPath(request({ obstacles: [plane(2), { body, collider }] }))).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/sphere/) });
  });

  it("uses the rotated full character bounds before pruning", () => {
    const rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const body = new RigidBody(1, { type: "kinematic", rotation });
    const collider = new Collider(1, body.id, { shape: Shape.capsule(0.1, 0.5) });
    const obstacle = new RigidBody(3, { type: "static", position: [0.55, 0.125, 0] });
    const other = new Collider(3, obstacle.id, { shape: Shape.sphere(0.05) });
    const result = certifyNativeSupportPath(request({ body, collider, origin: [0, 0.125, 0], displacement: [0, 0, 0], obstacles: [plane(2), { body: obstacle, collider: other }] }));
    expect(result).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/sphere/) });
  });

  it("does not prune invalid transforms even for far geometry", () => {
    const body = new RigidBody(3, { type: "static", position: [100, 0, 0] });
    const collider = new Collider(3, body.id, { shape: Shape.sphere(0.5) });
    body.rotation = [0, 0, 0, 0];
    expect(certifyNativeSphereSupportPath(request({ obstacles: [plane(2), { body, collider }] }))).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/transform/) });
  });

  it("rejects non-sphere characters and validates numerical input and ownership", () => {
    const { body } = character();
    const capsule = new Collider(1, body.id, { shape: Shape.capsule(0.1, 0.2) });
    expect(certifyNativeSphereSupportPath(request({ body, collider: capsule }))).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/spherical/) });
    expect(() => certifyNativeSphereSupportPath(request({ origin: [0, NaN, 0] }))).toThrow(/finite/);
    expect(() => certifyNativeSphereSupportPath(request({ maxSlopeClimbAngle: Math.PI }))).toThrow(/slope/);
    expect(() => certifyNativeSphereSupportPath(request({ offset: -1 }))).toThrow(/offset/);
    const other = new RigidBody(7, { type: "static" });
    const mismatched = new Collider(8, 8, { shape: Shape.box(1, 1, 1) });
    expect(() => certifyNativeSphereSupportPath(request({ obstacles: [{ body: other, collider: mismatched }] }))).toThrow(/ownership/);
  });

  it("returns unsupported when the requested tolerance is too small for the coordinate scale", () => {
    const remote = box(2, [1e12, -0.25, 0], [1, 0.25, 1]);
    const result = certifyNativeSphereSupportPath(request({ origin: [1e12, 0.125, 0], obstacles: [remote] }));
    expect(result).toMatchObject({ status: "unsupported", reason: expect.stringMatching(/numeric scale/) });
  });
});
