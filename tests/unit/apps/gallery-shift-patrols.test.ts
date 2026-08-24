import { describe, expect, it } from "vitest";
import {
  ESCALATION_SPEED_PER_LIFT,
  FLOOR_LAYOUTS,
  GAIT_SPEED,
  LASER_ALERT_SECONDS,
  LIFT_HOLD_SECONDS,
  LIFT_INTERACT_RANGE,
  NOISE_RADIUS,
  THIEF_RADIUS,
  createFloorWorld,
  escalationWaypoints,
  guardSpeedAfterLifts,
  layoutCircles,
  layoutRects,
  pushOutOfCircle,
  pushOutOfRect,
  resolveThiefPosition,
  routeLength
} from "../../../apps/showcase-gallery-shift/src/floor";
import { GUARD_STRIDE_METERS, GuardAgent, guardHearsNoise } from "../../../apps/showcase-gallery-shift/src/guard";
import { NOISE_SAMPLE_SECONDS, ThiefPlayer } from "../../../apps/showcase-gallery-shift/src/thief";

/**
 * PRD definition-of-done pins for Gallery Shift patrols (GS-13):
 * - waypoint patrols are deterministic (identical inputs -> identical poses);
 * - escalation tables: each lift grows both routes and bumps speed +10% cumulatively;
 * - noise radii per gait: walk 3 m, sneak 0 m, sprint 6 m, lift 5 m, sampled on a cadence;
 * - laser sensors fire once per entry through engine sensor events and the burst is 4 s;
 * - authored wall collision keeps the thief sphere out of the hall solid geometry.
 */

const DT = 1 / 60;

function makeGuard(id = "guard-1"): GuardAgent {
  return new GuardAgent(FLOOR_LAYOUTS[0]!.guards[0]! ?? { id, x: 0, z: 0, route: [], baseSpeed: 1.5 });
}

function makeThief(layoutIndex = 0): { thief: ThiefPlayer; floor: ReturnType<typeof createFloorWorld> } {
  const layout = FLOOR_LAYOUTS[layoutIndex]!;
  const floor = createFloorWorld(layout);
  const thief = new ThiefPlayer(layout, layoutRects(layout), layoutCircles(layout), floor.thiefBody, layout.thiefSpawn);
  return { thief, floor };
}

describe("gallery shift patrol determinism", () => {
  it("identical scripted runs produce identical guard trajectories", () => {
    const run = (): string => {
      const guard = makeGuard();
      const trace: string[] = [];
      for (let frame = 0; frame < 60 * 30; frame += 1) {
        const steps = guard.update({
          dt: DT,
          detection: 0,
          suspiciousThreshold: 0.35,
          alertThreshold: 0.7,
          lastSeen: null,
          laserAlertPoint: null
        });
        void steps;
        if (frame % 30 === 0) {
          const snap = guard.snapshot();
          trace.push(`${snap.x.toFixed(3)},${snap.z.toFixed(3)},${snap.yaw.toFixed(3)}`);
        }
      }
      return trace.join("|");
    };
    expect(run()).toBe(run());
  });

  it("the patrol loops the authored route and moves at the authored speed", () => {
    const guard = makeGuard();
    const spawn = FLOOR_LAYOUTS[0]!.guards[0]!;
    let firstMoveDistance = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const before = { x: guard.x, z: guard.z };
      guard.update({ dt: DT, detection: 0, suspiciousThreshold: 0.35, alertThreshold: 0.7, lastSeen: null, laserAlertPoint: null });
      firstMoveDistance += Math.hypot(guard.x - before.x, guard.z - before.z);
    }
    // ~1.5 m/s authored base speed for one second of patrol.
    expect(firstMoveDistance).toBeGreaterThan(1.2);
    expect(firstMoveDistance).toBeLessThan(1.8);
    // Still on the west loop (route x in [-8.5, -2.5]).
    expect(guard.x).toBeLessThan(-2);
    void spawn;
  });

  it("footsteps emit on the authored gait: ~2 per stride cycle", () => {
    const guard = makeGuard();
    let steps = 0;
    for (let frame = 0; frame < 60 * 5; frame += 1) {
      steps += guard.update({ dt: DT, detection: 0, suspiciousThreshold: 0.35, alertThreshold: 0.7, lastSeen: null, laserAlertPoint: null }).length;
    }
    // 5 s at ~1.5 m/s = 7.5 m traveled; one stride cycle per 2*GUARD_STRIDE_METERS.
    const expectedCycles = (1.5 * 5) / (GUARD_STRIDE_METERS * 2);
    expect(steps).toBeGreaterThanOrEqual(Math.floor(expectedCycles) * 2 - 1);
    expect(steps).toBeLessThanOrEqual(Math.ceil(expectedCycles) * 2 + 1);
  });
});

describe("gallery shift escalation tables", () => {
  it("each lift appends that pedestal's quarter waypoints to both guards", () => {
    const guardA = makeGuard();
    const guardB = new GuardAgent(FLOOR_LAYOUTS[0]!.guards[1]!);
    const baseLengthA = guardA.snapshot().routeLength;
    const baseLengthB = guardB.snapshot().routeLength;
    const lengths: number[] = [baseLengthA];
    const lifted: string[] = [];
    for (const pedestalId of ["p1", "p2", "p3"]) {
      lifted.push(pedestalId);
      // main.ts passes the full lift list each time (cumulative escalation).
      guardA.registerLift(lifted);
      guardB.registerLift(lifted);
      const lengthA = guardA.snapshot().routeLength;
      lengths.push(lengthA);
      // Both guards gain the SAME appended quarter waypoints per lift even
      // though their authored base loops differ.
      expect(guardA.route.slice(guardA.route.length - escalationWaypoints(lifted).length)).toEqual(escalationWaypoints(lifted));
      expect(guardB.route.slice(guardB.route.length - escalationWaypoints(lifted).length)).toEqual(escalationWaypoints(lifted));
      expect(guardB.snapshot().waypointCount).toBe(guardA.snapshot().waypointCount);
    }
    // Monotone growth after every lift.
    for (let index = 1; index < lengths.length; index += 1) {
      expect(lengths[index]!).toBeGreaterThan(lengths[index - 1]!);
    }
    expect(escalationWaypoints(["p1", "p3"])).toEqual([
      ...escalationWaypoints(["p1"]),
      ...escalationWaypoints(["p3"])
    ]);
  });

  it("guard speed rises a cumulative +10% per lift", () => {
    expect(ESCALATION_SPEED_PER_LIFT).toBeCloseTo(1.1, 12);
    expect(guardSpeedAfterLifts(1.5, 0)).toBeCloseTo(1.5, 12);
    expect(guardSpeedAfterLifts(1.5, 1)).toBeCloseTo(1.65, 12);
    expect(guardSpeedAfterLifts(1.5, 4)).toBeCloseTo(1.5 * Math.pow(1.1, 4), 12);
  });

  it("escalated patrol waypoints stay clear of the wing walls (walkable)", () => {
    const layout = FLOOR_LAYOUTS[0]!;
    const rects = layoutRects(layout).filter((rect) => rect.minX < -4 && rect.maxX > -6);
    for (const point of escalationWaypoints(["p1", "p2", "p3"])) {
      for (const rect of rects) {
        const inside = point.x > rect.minX - 0.3 && point.x < rect.maxX + 0.3 && point.z > rect.minZ - 0.3 && point.z < rect.maxZ + 0.3;
        expect(inside).toBe(false);
      }
    }
  });

  it("route length helper computes the looping perimeter", () => {
    expect(routeLength([{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }])).toBeCloseTo(12, 12);
    expect(routeLength([{ x: 0, z: 0 }])).toBe(0);
  });
});

describe("gallery shift noise radii and hearing", () => {
  it("gaits and radii match the binding spec", () => {
    expect(GAIT_SPEED).toEqual({ walk: 3.2, sneak: 1.4, sprint: 5.6 });
    expect(NOISE_RADIUS).toEqual({ walk: 3, sneak: 0, sprint: 6 });
  });

  it("sneaking emits no noise, walking emits 3 m samples on the cadence", () => {
    const sneak = makeThief();
    let sneakNoise = 0;
    for (let frame = 0; frame < 60 * 4; frame += 1) {
      const noises = sneak.thief.update(DT, { moveX: 0, moveZ: -1, gait: "sneak", liftHeld: false }, sneak.floor.layout.pedestals);
      sneakNoise += noises.length;
    }
    expect(sneakNoise).toBe(0);

    const walk = makeThief();
    let walkSamples = 0;
    let walkRadius = -1;
    for (let frame = 0; frame < 60 * 4; frame += 1) {
      for (const noise of walk.thief.update(DT, { moveX: 0, moveZ: -1, gait: "walk", liftHeld: false }, walk.floor.layout.pedestals)) {
        walkSamples += 1;
        walkRadius = noise.radius;
      }
    }
    expect(walkSamples).toBeGreaterThanOrEqual(Math.floor((4 - NOISE_SAMPLE_SECONDS) / NOISE_SAMPLE_SECONDS));
    expect(walkSamples).toBeLessThanOrEqual(Math.ceil(4 / NOISE_SAMPLE_SECONDS));
    expect(walkRadius).toBe(NOISE_RADIUS.walk);
  });

  it("guards hear inside the authored radius and not outside it", () => {
    const guard = { x: 0, z: 0 };
    expect(guardHearsNoise(guard, { x: 2.9, z: 0, radius: 3 })).toBe(true);
    expect(guardHearsNoise(guard, { x: 3.1, z: 0, radius: 3 })).toBe(false);
    // Sneak radius zero: never heard.
    expect(guardHearsNoise(guard, { x: 0.5, z: 0, radius: 0 })).toBe(false);
  });

  it("a heard noise sends the guard to investigate the noise point", () => {
    const guard = makeGuard();
    guard.hearNoise({ x: -8.5, z: -2 });
    expect(guard.snapshot().state).toBe("investigate");
    let closest = Number.POSITIVE_INFINITY;
    let returnedToPatrol = false;
    for (let frame = 0; frame < 60 * 12; frame += 1) {
      guard.update({ dt: DT, detection: 0, suspiciousThreshold: 0.35, alertThreshold: 0.7, lastSeen: null, laserAlertPoint: null });
      closest = Math.min(closest, Math.hypot(guard.x - -8.5, guard.z - -2));
      if (frame > 60 * 8 && guard.snapshot().state === "idle") returnedToPatrol = true;
    }
    // The guard reaches the noise point, then returns to patrol.
    expect(closest).toBeLessThan(0.5);
    expect(returnedToPatrol).toBe(true);
  });
});

describe("gallery shift thief authored movement and collision", () => {
  it("gait displacement matches the authored speeds", () => {
    const cases: readonly ["walk" | "sprint" | "sneak", number][] = [["walk", GAIT_SPEED.walk], ["sneak", GAIT_SPEED.sneak], ["sprint", GAIT_SPEED.sprint]];
    for (const [gait, speed] of cases) {
      const { thief } = makeThief();
      const startZ = thief.z;
      for (let frame = 0; frame < 60; frame += 1) {
        thief.update(DT, { moveX: 0, moveZ: -1, gait, liftHeld: false }, FLOOR_LAYOUTS[0]!.pedestals);
      }
      expect(Math.abs(thief.z - startZ) - speed).toBeLessThan(0.03);
    }
  });

  it("circle pushout clears rect and circle solids", () => {
    const outOfWall = pushOutOfRect(2.5, 0, THIEF_RADIUS, { minX: 2.4, maxX: 4, minZ: -1, maxZ: 1 });
    expect(outOfWall.x).toBeLessThan(2.4 - THIEF_RADIUS + 1e-9);
    const inside = pushOutOfRect(3, 0, THIEF_RADIUS, { minX: 2.4, maxX: 4, minZ: -1, maxZ: 1 });
    expect(inside.x).toBeLessThan(2.4 - THIEF_RADIUS + 1e-9);
    const outOfPost = pushOutOfCircle(0.95, 0, THIEF_RADIUS, { x: 0, z: 0, radius: 0.45 });
    expect(Math.hypot(outOfPost.x, outOfPost.z)).toBeGreaterThanOrEqual(0.45 + THIEF_RADIUS - 1e-9);
  });

  it("resolveThiefPosition keeps the spawn corridor inside the hall bounds", () => {
    const layout = FLOOR_LAYOUTS[0]!;
    const resolved = resolveThiefPosition(0, 6.5, layout, layoutRects(layout), layoutCircles(layout));
    expect(resolved.x).toBe(0);
    expect(resolved.z).toBe(6.5);
    // Far outside: clamped back inside the walkable bounds (wall pushout may
    // pull the exact edge in by the sphere radius).
    const clamped = resolveThiefPosition(50, 50, layout, layoutRects(layout), layoutCircles(layout));
    expect(clamped.x).toBeLessThanOrEqual(layout.bounds.maxX);
    expect(clamped.x).toBeGreaterThanOrEqual(layout.bounds.minX);
    expect(clamped.z).toBeLessThanOrEqual(layout.bounds.maxZ);
    expect(clamped.z).toBeGreaterThanOrEqual(layout.bounds.minZ);
    expect(clamped.x).toBeGreaterThan(9);
    expect(clamped.z).toBeGreaterThan(6);
  });

  it("hold-to-lift completes after the authored duration and slows movement", () => {
    const { thief, floor } = makeThief();
    const layout = floor.layout;
    const pedestal = layout.pedestals[0]!;
    thief.teleport(pedestal.x, pedestal.z + LIFT_INTERACT_RANGE - 0.15);
    let progressAtHalf = 0;
    let completedAt: number | null = null;
    for (let frame = 0; frame < 60 * 3 && completedAt === null; frame += 1) {
      thief.update(DT, { moveX: 0, moveZ: 0, gait: "walk", liftHeld: true }, layout.pedestals);
      if (frame === Math.round(60 * LIFT_HOLD_SECONDS / 2)) progressAtHalf = thief.liftProgress;
      const done = thief.takeCompletedLift();
      if (done) completedAt = frame;
    }
    expect(completedAt).not.toBeNull();
    expect(completedAt!).toBeGreaterThanOrEqual(Math.round(60 * LIFT_HOLD_SECONDS) - 1);
    expect(progressAtHalf).toBeGreaterThan(0.3);
    expect(progressAtHalf).toBeLessThan(0.7);
    expect(thief.carrying).toBe(true);
  });
});

describe("gallery shift laser sensors and exit sensor", () => {
  it("floor 2 carries four lasers and the trip burst is 4 s", () => {
    expect(FLOOR_LAYOUTS[1]!.lasers).toHaveLength(4);
    expect(LASER_ALERT_SECONDS).toBe(4);
  });

  it("a laser fires once per entry through engine sensor events", () => {
    const layout = FLOOR_LAYOUTS[1]!;
    const floor = createFloorWorld(layout);
    // Park the thief far from every laser first.
    floor.thiefBody.wake();
    floor.thiefBody.setPosition([0, THIEF_RADIUS, 6.4]);
    for (let frame = 0; frame < 10; frame += 1) floor.stepFixed(1);
    expect(floor.consumeSensorEvents().length).toBe(0);
    // Walk into the south laser at (0, -2.0): the 0.3 m sphere overlaps the
    // thin sensor volume from center z = -1.7.
    floor.thiefBody.setPosition([0, THIEF_RADIUS, -1.7]);
    let laserEvents = 0;
    let exitEvents = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      for (const event of floor.stepFixed(1)) {
        if (event.kind === "laser") laserEvents += 1;
        if (event.kind === "exit") exitEvents += 1;
      }
    }
    expect(laserEvents).toBe(1);
    expect(exitEvents).toBe(0);
    // Leaving and re-entering re-arms once per entry.
    floor.thiefBody.setPosition([0, THIEF_RADIUS, 3.5]);
    for (let frame = 0; frame < 30; frame += 1) floor.stepFixed(1);
    floor.thiefBody.setPosition([0, THIEF_RADIUS, -1.7]);
    let secondTrip = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      for (const event of floor.stepFixed(1)) {
        if (event.kind === "laser") secondTrip += 1;
      }
    }
    expect(secondTrip).toBe(1);
  });

  it("the exit sensor fires only inside the service alcove", () => {
    const layout = FLOOR_LAYOUTS[0]!;
    const floor = createFloorWorld(layout);
    floor.thiefBody.wake();
    floor.thiefBody.setPosition([0, THIEF_RADIUS, 5]);
    let fired = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      for (const event of floor.stepFixed(1)) {
        if (event.kind === "exit") fired += 1;
      }
    }
    expect(fired).toBe(0);
    floor.thiefBody.setPosition([layout.exit.x, THIEF_RADIUS, layout.exit.z]);
    for (let frame = 0; frame < 30; frame += 1) {
      for (const event of floor.stepFixed(1)) {
        if (event.kind === "exit") fired += 1;
      }
    }
    expect(fired).toBe(1);
  });
});
