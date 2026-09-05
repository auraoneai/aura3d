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
    expect(meshElevations.size).toBeGreaterThan(centrelineElevations.size * 6);
  });

  function binding() {
    const route = game.assetBoundRacingRoute({
      vehicleAsset: "turboRaceCar",
      trackAsset: "turboFormulaCircuit",
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
      trackAsset: "turboFormulaCircuit",
      // Match the current mounted route exactly; stale pre-redesign fit constants
      // cannot prove contact on the geometry the browser actually renders.
      targetSceneSize: 55.518,
      trackModelTargetMaxDimension: 128.386,
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

  it("the continuous Formula asphalt stays contactable at a former sparse-seam review point without hiding the verge", () => {
    const scene = binding();
    const firstRoutePoint = routeGeometry.points[0]!;
    const authoredAsphaltPoint = scene.toScenePoint({ x: firstRoutePoint.x, y: firstRoutePoint.y }, 0);
    const point = scene.vehicleSurface()!.sample(authoredAsphaltPoint[0], authoredAsphaltPoint[2]);
    const fittedTyreRadius = 0.124676;
    const finiteTyre = scene.vehicleSurface({ contactPatchRadius: fittedTyreRadius * 2 })!
      .sample(authoredAsphaltPoint[0], authoredAsphaltPoint[2]);

    // The new asset intentionally removes the old narrow extraction's sparse seam:
    // point contact is now continuous, while the finite tyre envelope remains an
    // independent wheel-footprint query rather than a hidden flat fallback.
    expect(point.hit, "the authored asphalt must be continuously contactable").toBe(true);
    expect(finiteTyre.hit, "the fitted tyre envelope must contact the same real mesh").toBe(true);
    expect(finiteTyre.grip ?? 0).toBeGreaterThan(0.8);
    // Far beyond the circuit remains a real miss; continuous contact is not a broad fallback.
    expect(scene.vehicleSurface({ contactPatchRadius: fittedTyreRadius * 2 })!.sample(9999, 9999).hit).toBe(false);
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

  it("a chassis driven the full lap never dives below the rendered road", () => {
    // The shipped defect, stated as arithmetic: the extracted mesh is sparse
    // (whole segments miss every triangle), a miss samples the mesh's lowest
    // vertex, and the old chassis treated that fallback as ground -- so the car
    // rendered ~0.3 units under a correctly miss-filled road ribbon while
    // reporting itself grounded. Drive the lap with the route's own surface
    // config and require the contact plane to stay at road level throughout.
    const scene = binding();
    const wheelRadius = 0.109;
    const surface = scene.vehicleSurface({ offRoadGrip: 0.55, contactPatchRadius: wheelRadius * 3 })!;
    const query = scene.surfaceQuery()!;
    const chassis = createVehicleChassis(
      {
        wheelbase: 0.576,
        trackWidth: 0.304,
        wheelRadius,
        rideHeight: 0.136,
        suspensionTravel: 0.046,
        contactTolerance: 0.03
      },
      surface
    );
    const points = routeGeometry.points;
    const at = (t: number) => {
      const f = (((t % 1) + 1) % 1) * points.length;
      const i0 = Math.floor(f) % points.length;
      const i1 = (i0 + 1) % points.length;
      const a = points[i0]!, b = points[i1]!, k = f - Math.floor(f);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    };
    const start = scene.toScenePoint({ x: points[0]!.x, y: points[0]!.y }, 0);
    chassis.reset({ x: start[0], z: start[2], heading: 0, speed: 0, steer: 0 });

    let roadRef = query.sample(start[0], start[2]).height;
    let worstDive = 0;
    const steps = 720;
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const c = at(t), c2 = at(t + 0.003);
      const p = scene.toScenePoint({ x: c.x, y: c.y }, 0);
      const hit = query.sample(p[0], p[2]);
      if (hit.hit) roadRef = hit.height;
      const pose = chassis.step(1 / 60, {
        x: p[0],
        z: p[2],
        heading: Math.atan2(c2.y - c.y, c2.x - c.x),
        speed: 8,
        steer: 0,
        throttle: 1
      });
      expect(Number.isFinite(pose.groundedPosition[1])).toBe(true);
      worstDive = Math.min(worstDive, pose.groundedPosition[1] - roadRef);
    }
    // Rendering adds a small lift above this plane; anything beyond a wheel
    // radius below the road is the burial defect, not suspension.
    expect(worstDive).toBeGreaterThan(-0.08);
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
