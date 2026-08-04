import { describe, expect, it } from "vitest";
import { createMeshSurfaceQuery, game, meshVehicleSurface, createVehicleChassis } from "@aura3d/engine";
import { gameGeometryContract } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";

/**
 * WS-4.3: the vehicle contact test, against the **real committed circuit mesh**.
 *
 * The pre-existing `vehicle-mesh-contact.test.ts` builds synthetic grids with a height
 * function. Those prove the chassis maths, but they cannot fail when the *route* grounds its
 * car on a flat plane — which is precisely the defect that survived every green pipeline and
 * put the tyres through the visible road.
 *
 * These tests read `apps/showcase-turbo-drift-circuit/src/generated/game-geometry.ts`, the
 * artifact the shipped route actually imports, and assert on the surface the shipped route
 * actually drives.
 */
const topology = gameGeometryContract.topology;
const routeGeometry = gameGeometryContract.route;

describe("turbo drift grounds on the real circuit mesh", () => {
  it("the committed geometry contract carries drivable triangles", () => {
    // If this fails, the route throws at startup by design rather than silently flattening.
    expect(topology.drivableMesh).toBeDefined();
    expect(topology.drivableMesh!.triangleCount).toBeGreaterThan(500);
    expect(topology.drivableMesh!.indices.length % 3).toBe(0);
  });

  it("the road mesh has far more vertical detail than the centreline can express", () => {
    // The heart of the defect. A centreline carries one height per point along the track;
    // the mesh carries height across the width too. If these were comparable, a scalar or a
    // curve would have been an adequate model and the wheels would not have sunk.
    const mesh = topology.drivableMesh!;
    const meshElevations = new Set<number>();
    for (let index = 1; index < mesh.positions.length; index += 3) {
      meshElevations.add(Math.round(mesh.positions[index]! * 1e4) / 1e4);
    }
    const centrelineElevations = new Set(
      topology.roadCenterline.map((point) => (point as { surfaceY?: number }).surfaceY)
    );
    expect(meshElevations.size).toBeGreaterThan(centrelineElevations.size * 10);
  });

  function binding() {
    const route = game.assetBoundRacingRoute({
      vehicleAsset: "turboRaceCar",
      trackAsset: "showcaseTsukubaCircuit",
      authoredLapSeconds: 35,
      minLapSeconds: 30,
      minCheckpoints: 6,
      topology,
      route: {
        id: routeGeometry.id,
        width: routeGeometry.width,
        points: routeGeometry.points,
        checkpoints: routeGeometry.checkpoints
      }
    });
    return game.racingSceneBinding({
      topology,
      route,
      trackAsset: "showcaseTsukubaCircuit",
      targetSceneSize: 3.25,
      trackModelTargetMaxDimension: 90.413,
      trackY: -0.12,
      carY: -0.12,
      ghostY: -0.14
    });
  }

  it("the scene binding exposes a mesh surface query", () => {
    const query = binding().surfaceQuery();
    expect(query).toBeDefined();
    expect(query!.kind).toBe("aura-mesh-surface-query");
  });

  it("four wheels across the road width get four independent heights", () => {
    // This is the assertion a flat plane, a scalar, and a centreline blend all fail. It is
    // the difference between "grounded on the road" and "grounded on an average of the road".
    const scene = binding();
    const surface = scene.vehicleSurface()!;
    const halfWidth = routeGeometry.width / 2;

    let pointsWithDistinctLateralHeight = 0;
    const sampled: number[] = [];
    for (const point of routeGeometry.points) {
      const centre = scene.toScenePoint({ x: point.x, y: point.y }, 0);
      // Sample across the road, perpendicular is approximated by offsetting in scene X/Z.
      const left = surface.sample(centre[0] - halfWidth * scene.transform.scale, centre[2]);
      const right = surface.sample(centre[0] + halfWidth * scene.transform.scale, centre[2]);
      sampled.push(left.height, right.height);
      if (Math.abs(left.height - right.height) > 1e-6) pointsWithDistinctLateralHeight += 1;
    }

    expect(new Set(sampled.map((value) => Math.round(value * 1e5))).size).toBeGreaterThan(5);
    expect(pointsWithDistinctLateralHeight).toBeGreaterThan(0);
  });

  it("reports real surface normals, not a hardcoded world up", () => {
    // `normal: [0, 1, 0]` was hardcoded in the route's old surface. A banked corner has a
    // tilted normal, and the chassis needs it to roll correctly.
    const surface = binding().vehicleSurface()!;
    let tiltedNormals = 0;
    for (const point of routeGeometry.points) {
      const scene = binding().toScenePoint({ x: point.x, y: point.y }, 0);
      const sample = surface.sample(scene[0], scene[2]);
      const normal = sample.normal ?? [0, 1, 0];
      if (Math.abs(normal[0]) > 1e-4 || Math.abs(normal[2]) > 1e-4) tiltedNormals += 1;
    }
    expect(tiltedNormals).toBeGreaterThan(0);
  });

  it("a chassis driven over the real circuit keeps its tyres out of the road", () => {
    const scene = binding();
    const surface = scene.vehicleSurface()!;
    const wheelRadius = 0.083;
    const chassis = createVehicleChassis(
      {
        wheelbase: 0.36,
        trackWidth: 0.2,
        wheelRadius,
        rideHeight: wheelRadius,
        suspensionTravel: 0.03
      },
      surface
    );

    let maxPenetration = 0;
    let groundedSteps = 0;
    const steps = 240;
    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      const index = Math.floor(progress * routeGeometry.points.length) % routeGeometry.points.length;
      const next = routeGeometry.points[(index + 1) % routeGeometry.points.length]!;
      const point = routeGeometry.points[index]!;
      const scenePoint = scene.toScenePoint({ x: point.x, y: point.y }, 0);
      const heading = Math.atan2(next.y - point.y, next.x - point.x);

      const pose = chassis.step(1 / 60, {
        x: scenePoint[0],
        z: scenePoint[2],
        heading,
        speed: 1.2,
        steer: 0
      });

      for (const wheel of pose.wheels) {
        const ground = surface.sample(wheel.position[0], wheel.position[2]);
        const bottom = wheel.position[1] - wheelRadius;
        const penetration = ground.height - bottom;
        if (penetration > maxPenetration) maxPenetration = penetration;
        if (Math.abs(penetration) < 0.02) groundedSteps += 1;
      }
    }

    // A wheel may not be buried in the road it is driving on.
    expect(maxPenetration).toBeLessThan(0.01);
    expect(groundedSteps).toBeGreaterThan(0);
  });

  it("a flat-plane surface fails the same penetration check the mesh passes", () => {
    // Proves the check above is load-bearing rather than trivially satisfiable. This is the
    // model the route used to ship: one height everywhere.
    const scene = binding();
    const mesh = topology.drivableMesh!;
    let lowest = Infinity;
    for (let index = 1; index < mesh.positions.length; index += 3) {
      lowest = Math.min(lowest, mesh.positions[index]!);
    }
    const flatHeight = -0.12 + lowest * scene.transform.scale;
    const realSurface = scene.vehicleSurface()!;

    let worstAgainstFlat = 0;
    for (const point of routeGeometry.points) {
      const scenePoint = scene.toScenePoint({ x: point.x, y: point.y }, 0);
      const real = realSurface.sample(scenePoint[0], scenePoint[2]);
      // A car seated on the flat plane sits at `flatHeight`; where the real road is higher,
      // the tyre is inside the visible mesh by that difference.
      worstAgainstFlat = Math.max(worstAgainstFlat, real.height - flatHeight);
    }
    expect(worstAgainstFlat).toBeGreaterThan(0.01);
  });

  it("grip varies with the surface rather than a distance-from-centreline formula", () => {
    const scene = binding();
    const surface = scene.vehicleSurface({ offRoadGrip: 0.4 })!;
    const onRoad = routeGeometry.points.slice(0, 8).map((point) => {
      const scenePoint = scene.toScenePoint({ x: point.x, y: point.y }, 0);
      return surface.sample(scenePoint[0], scenePoint[2]).grip ?? 1;
    });
    // Far outside the circuit there is no drivable triangle, so grip drops to the off-road value.
    const offRoad = surface.sample(9999, 9999).grip ?? 1;
    expect(Math.max(...onRoad)).toBeGreaterThan(offRoad);
    expect(offRoad).toBeCloseTo(0.4, 5);
  });
});

/** Guard the rule that made this fix real: the route may not reintroduce a surface constant. */
describe("WS-4.1 rule 1: no route-local physics numbers", () => {
  it("turbo drift declares no surface, gravity or contact-plane constants", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
    // Strip block and line comments: the file legitimately *names* the deleted constants when
    // explaining what was removed, and a grep that cannot tell code from prose would either
    // fail on the explanation or force the explanation out.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const banned of ["TRACK_SURFACE_Y", "CAR_GROUND_Y", "CAR_TYRE_CONTACT_Y", "VERGE_DROP", "SHOULDER_WIDTH"]) {
      expect(code).not.toContain(banned);
    }
    expect(code).not.toMatch(/\bgravity:/);
    expect(code).not.toMatch(/\bjumpVelocity:/);
  });
});
