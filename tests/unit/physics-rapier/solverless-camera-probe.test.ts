import { describe, expect, it, vi } from "vitest";
import { CAMERA_PROBE_TIER_BUDGETS, createCameraProbe } from "../../../packages/engine/src/agent-api/camera/Probe.js";
import {
  Collider,
  RigidBody,
  Shape,
  raycastCollider,
  sphereCastCollider,
  type RaycastOptions,
  type SphereCastHit
} from "@aura3d/physics/solverless";

// If either the public query entry or the probe reaches the optional adapter,
// evaluating this test module fails before any geometry assertions can pass.
vi.mock("@aura3d/physics-rapier", () => {
  throw new Error("The solverless query path loaded the optional physics backend.");
});

describe("solverless collider queries and camera probe", () => {
  it("queries collider geometry without constructing a world", () => {
    const body = new RigidBody(1, { type: "static" });
    const sensor = new Collider(1, body.id, {
      shape: Shape.sphere(1),
      sensor: true,
      filter: { layer: 0b10 }
    });
    const origin = [0, 0, 5] as const;
    const direction = [0, 0, -1] as const;
    const options: RaycastOptions = { includeSensors: true, mask: 0b10, maxDistance: 4 };

    expect(sphereCastCollider(origin, 0.5, direction, sensor, body)).toBeUndefined();
    expect(sphereCastCollider(origin, 0.5, direction, sensor, body, { ...options, mask: 0b01 })).toBeUndefined();
    expect(sphereCastCollider(origin, 0.5, direction, sensor, body, { ...options, maxDistance: 3 })).toBeUndefined();
    const hit: SphereCastHit | undefined = sphereCastCollider(origin, 0.5, direction, sensor, body, options);
    expect(hit).toMatchObject({ colliderId: 1, bodyId: 1, distance: 3.5, castCenter: [0, 0, 1.5], castRadius: 0.5 });
    expect(hit?.point).toEqual([0, 0, 1]);
    expect(raycastCollider(origin, direction, sensor, body, options)?.distance).toBe(4);
    expect(() => sphereCastCollider(origin, 0, direction, sensor, body, options)).toThrow(/radius/);
  });

  it("selects the nearest non-sensor collider using its rotated body pose and cast radius", () => {
    const rotatedBody = new RigidBody(1, {
      type: "static",
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2]
    });
    const rotated = new Collider(1, rotatedBody.id, { shape: Shape.box(2, 0.5, 0.5) });
    const farBody = new RigidBody(2, { type: "static", position: [0, 0, -3] });
    const far = new Collider(2, farBody.id, { shape: Shape.sphere(0.5) });
    const sensorBody = new RigidBody(3, { type: "static", position: [0, 0, 4] });
    const sensor = new Collider(3, sensorBody.id, { shape: Shape.sphere(0.2), sensor: true });
    const probe = createCameraProbe({
      colliders: () => [
        { id: "far", collider: far, body: farBody },
        { id: "sensor", collider: sensor, body: sensorBody },
        { id: "rotated", collider: rotated, body: rotatedBody }
      ]
    });

    const hit = probe.sphereCast([0, 0, 5], [0, 0, -5], 0.25);
    expect(hit).toMatchObject({ hit: true, node: "rotated" });
    expect(hit.distance).toBeCloseTo(2.75, 6);
    expect(probe.sphereCast([0, 0, 5], [0, 0, 3], 0.25).hit).toBe(false);
  });

  it("falls back to visible bounds and preserves per-frame cast and occluder budgets", () => {
    const sensorBody = new RigidBody(1, { type: "static" });
    const sensor = new Collider(1, sensorBody.id, { shape: Shape.box(1, 1, 1), sensor: true });
    let budget = CAMERA_PROBE_TIER_BUDGETS.low;
    const probe = createCameraProbe({
      budget: () => budget,
      colliders: () => [{ id: "sensor", collider: sensor, body: sensorBody }],
      bounds: () => [
        { id: "subject", min: [-0.5, -0.5, 4.5], max: [0.5, 0.5, 5.5] },
        { id: "ignored", min: [-1, -1, 2], max: [1, 1, 3] },
        { id: "wall", min: [-1, -1, -1], max: [1, 1, 1] }
      ],
      ignore: (id) => id === "ignored"
    });
    const from = [0, 0, 5] as const;
    const to = [0, 0, -5] as const;

    const hit = probe.sphereCast(from, to, 0.2);
    expect(hit).toMatchObject({ hit: true, node: "wall" });
    expect(hit.distance).toBeCloseTo(3.8, 6);
    expect(probe.sphereCast(from, to, 0.2).hit).toBe(false);
    expect(probe.occluders(from, to)).toEqual([]);
    expect(probe.stats()).toEqual({ sphereCasts: 1, occluderQueries: 0, deniedCasts: 1, deniedOccluderQueries: 1 });

    budget = CAMERA_PROBE_TIER_BUDGETS.ultra;
    probe.beginFrame();
    expect(probe.occluders(from, to)).toEqual(["wall"]);
    expect(probe.sphereCast(from, to, 0.2).hit).toBe(true);
    expect(probe.stats()).toEqual({ sphereCasts: 1, occluderQueries: 1, deniedCasts: 0, deniedOccluderQueries: 0 });
  });
});
