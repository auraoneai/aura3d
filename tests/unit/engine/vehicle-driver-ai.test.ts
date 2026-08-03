import { describe, expect, it } from "vitest";
import {
  angleDelta,
  createVehicleDriverAi,
  type DriverRoute,
  type DriverVehicleState
} from "../../../packages/engine/src/agent-api/VehicleDriverAi";

/**
 * Regression cases for the reported opponent-driving defects: the AI car moving
 * sideways, leaving the intended track, and having no discernible objective.
 *
 * The previous route-local controller steered only to null its present lateral
 * offset (`-signedTrackOffset * gain`). A proportional term on present error has no
 * notion of where the track goes next, so it drives straight at a corner until it
 * has already left the road and then over-corrects. It also had no braking model
 * tied to the corner ahead.
 *
 * These tests hold the reusable driver to the behaviours that distinguish driving
 * from offset-nulling: it turns before a corner, it slows for curvature, and it
 * recovers deliberately.
 */

/** Straight route along +X. */
function straightRoute(length = 100, halfWidth = 4): DriverRoute {
  return {
    length,
    halfWidth: () => halfWidth,
    sample: (progress) => ({ x: progress * length, y: 0, heading: 0 })
  };
}

/** Circular route, so curvature is a known constant. */
function circleRoute(radius = 40, halfWidth = 5): DriverRoute {
  const length = 2 * Math.PI * radius;
  return {
    length,
    halfWidth: () => halfWidth,
    sample: (progress) => {
      const angle = progress * Math.PI * 2;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        // Tangent direction, one quarter turn ahead of the radius.
        heading: angle + Math.PI / 2
      };
    }
  };
}

/**
 * Route that is straight then turns hard left, to test whether the driver acts on
 * what is ahead rather than on where it currently is.
 */
function hairpinRoute(): DriverRoute {
  const length = 120;
  return {
    length,
    halfWidth: () => 4,
    sample: (progress) => {
      if (progress < 0.5) return { x: progress * 120, y: 0, heading: 0 };
      // After halfway the line bends 90 degrees over a short distance.
      const t = (progress - 0.5) / 0.5;
      return { x: 60 + Math.sin(t * Math.PI / 2) * 30, y: (1 - Math.cos(t * Math.PI / 2)) * 30, heading: t * Math.PI / 2 };
    }
  };
}

function state(overrides: Partial<DriverVehicleState> = {}): DriverVehicleState {
  return {
    progress: 0,
    speed: 20,
    heading: 0,
    signedTrackOffset: 0,
    position: { x: 0, y: 0 },
    offTrack: false,
    ...overrides
  };
}

describe("driver steering", () => {
  it("holds a straight line with no correction needed", () => {
    const driver = createVehicleDriverAi(straightRoute(), { maxSpeed: 30, seed: 5, reactionSeconds: 0, aggression: "cautious" });
    const input = driver.decide(1 / 60, state());
    // Cautious profile has the least line variation; the steer must be near zero.
    expect(Math.abs(input.steer)).toBeLessThan(0.2);
    expect(input.throttle).toBeGreaterThan(0);
  });

  it("steers back toward the line when displaced", () => {
    const driver = createVehicleDriverAi(straightRoute(), { maxSpeed: 30, seed: 5, reactionSeconds: 0 });
    // Positive offset means left of travel, so the correction must be to the right.
    const right = driver.decide(1 / 60, state({ signedTrackOffset: 3, position: { x: 0, y: 3 } }));
    driver.reset();
    const left = driver.decide(1 / 60, state({ signedTrackOffset: -3, position: { x: 0, y: -3 } }));
    expect(Math.sign(right.steer)).toBe(-Math.sign(left.steer));
    expect(Math.abs(right.steer)).toBeGreaterThan(0.1);
  });

  it("normalizes lateral correction by road width, so a gain does not under-correct on a narrow track", () => {
    const wide = createVehicleDriverAi(straightRoute(100, 12), { maxSpeed: 30, seed: 5, reactionSeconds: 0, aggression: "cautious" });
    const narrow = createVehicleDriverAi(straightRoute(100, 2), { maxSpeed: 30, seed: 5, reactionSeconds: 0, aggression: "cautious" });
    const offset = { signedTrackOffset: 1.5, position: { x: 0, y: 1.5 } };
    const wideSteer = Math.abs(wide.decide(1 / 60, state(offset)).steer);
    const narrowSteer = Math.abs(narrow.decide(1 / 60, state(offset)).steer);
    // The same absolute offset is a bigger problem on a narrow road.
    expect(narrowSteer).toBeGreaterThan(wideSteer);
  });

  it("turns into a corner before reaching it", () => {
    const route = hairpinRoute();
    const driver = createVehicleDriverAi(route, { maxSpeed: 30, seed: 5, reactionSeconds: 0, lookAheadSeconds: 1.5, aggression: "cautious" });
    // Sitting on the racing line just before the bend, with zero lateral error. An
    // offset-nulling controller steers zero here; a driver has already begun to turn.
    const approach = route.sample(0.46);
    const input = driver.decide(1 / 60, state({
      progress: 0.46,
      speed: 24,
      heading: approach.heading,
      signedTrackOffset: 0,
      position: { x: approach.x, y: approach.y }
    }));
    expect(Math.abs(input.steer)).toBeGreaterThan(0.05);
  });
});

describe("driver speed control", () => {
  it("slows for curvature and runs at pace on a straight", () => {
    const driver = createVehicleDriverAi(straightRoute(400), { maxSpeed: 40, seed: 3, reactionSeconds: 0 });
    driver.decide(1 / 60, state({ speed: 10 }));
    const straightTarget = driver.telemetry().targetSpeed;

    const tight = createVehicleDriverAi(circleRoute(12), { maxSpeed: 40, seed: 3, reactionSeconds: 0 });
    const point = circleRoute(12).sample(0);
    tight.decide(1 / 60, state({ speed: 10, heading: point.heading, position: { x: point.x, y: point.y } }));
    const cornerTarget = tight.telemetry().targetSpeed;

    expect(cornerTarget).toBeLessThan(straightTarget);
    expect(tight.telemetry().upcomingCurvature).toBeGreaterThan(0);
  });

  it("brakes when carrying too much speed for the corner ahead", () => {
    const route = circleRoute(10);
    const driver = createVehicleDriverAi(route, { maxSpeed: 60, seed: 3, reactionSeconds: 0 });
    const point = route.sample(0);
    const input = driver.decide(1 / 60, state({ speed: 55, heading: point.heading, position: { x: point.x, y: point.y } }));
    expect(input.brake).toBeGreaterThan(0);
    expect(input.throttle).toBe(0);
  });

  it("carries more corner speed when aggressive than when cautious", () => {
    const route = circleRoute(25);
    const point = route.sample(0);
    const at = (aggression: "cautious" | "aggressive") => {
      const driver = createVehicleDriverAi(route, { maxSpeed: 40, seed: 3, reactionSeconds: 0, aggression });
      driver.decide(1 / 60, state({ speed: 20, heading: point.heading, position: { x: point.x, y: point.y } }));
      return driver.telemetry().targetSpeed;
    };
    expect(at("aggressive")).toBeGreaterThan(at("cautious"));
  });

  it("scales look-ahead with speed", () => {
    const driver = createVehicleDriverAi(straightRoute(400), { maxSpeed: 40, seed: 3, reactionSeconds: 0 });
    driver.decide(1 / 60, state({ speed: 5 }));
    const slow = driver.telemetry().lookAheadDistance;
    driver.decide(1 / 60, state({ speed: 38 }));
    const fast = driver.telemetry().lookAheadDistance;
    expect(fast).toBeGreaterThan(slow);
  });
});

describe("driver recovery", () => {
  it("enters recovery when off track and slows down", () => {
    const driver = createVehicleDriverAi(straightRoute(), { maxSpeed: 40, seed: 3, reactionSeconds: 0 });
    driver.decide(1 / 60, state({ speed: 35 }));
    const pace = driver.telemetry().targetSpeed;
    driver.decide(1 / 60, state({ speed: 35, offTrack: true, signedTrackOffset: 6, position: { x: 0, y: 6 } }));
    expect(driver.telemetry().recovering).toBe(true);
    expect(driver.telemetry().targetSpeed).toBeLessThan(pace);
  });

  it("steers hard back to the line while recovering", () => {
    const driver = createVehicleDriverAi(straightRoute(), { maxSpeed: 40, seed: 3, reactionSeconds: 0, aggression: "cautious" });
    const input = driver.decide(1 / 60, state({ speed: 20, offTrack: true, signedTrackOffset: 5, position: { x: 0, y: 5 } }));
    // Offset is to the left, so the recovery steer must be to the right and strong.
    expect(input.steer).toBeLessThan(-0.3);
  });

  it("detects being stuck when speed stays near zero", () => {
    const driver = createVehicleDriverAi(straightRoute(), { maxSpeed: 40, seed: 3, reactionSeconds: 0 });
    for (let step = 0; step < 120; step += 1) driver.decide(1 / 60, state({ speed: 0.1 }));
    expect(driver.telemetry().stuckSeconds).toBeGreaterThan(1.2);
    expect(driver.telemetry().recovering).toBe(true);
  });

  it("leaves recovery once back on track and moving", () => {
    const driver = createVehicleDriverAi(straightRoute(), { maxSpeed: 40, seed: 3, reactionSeconds: 0 });
    driver.decide(1 / 60, state({ speed: 20, offTrack: true, signedTrackOffset: 6, position: { x: 0, y: 6 } }));
    expect(driver.telemetry().recovering).toBe(true);
    for (let step = 0; step < 30; step += 1) driver.decide(1 / 60, state({ speed: 25 }));
    expect(driver.telemetry().recovering).toBe(false);
  });
});

describe("driver determinism and reaction", () => {
  it("produces identical decisions for the same seed", () => {
    const run = () => {
      const driver = createVehicleDriverAi(circleRoute(30), { maxSpeed: 30, seed: 99 });
      const inputs = [];
      const route = circleRoute(30);
      for (let step = 0; step < 200; step += 1) {
        const progress = (step / 200) % 1;
        const point = route.sample(progress);
        inputs.push(driver.decide(1 / 60, state({
          progress,
          speed: 22,
          heading: point.heading,
          position: { x: point.x, y: point.y }
        })));
      }
      return JSON.stringify(inputs);
    };
    expect(run()).toBe(run());
  });

  it("holds a decision for the reaction delay rather than reacting instantly", () => {
    const driver = createVehicleDriverAi(straightRoute(), { maxSpeed: 30, seed: 3, reactionSeconds: 0.2 });
    const first = driver.decide(1 / 60, state({ signedTrackOffset: 0 }));
    // A large new error arrives, but within the reaction window the input is held.
    const held = driver.decide(1 / 60, state({ signedTrackOffset: 3.5, position: { x: 0, y: 3.5 } }));
    expect(held).toEqual(first);
    // After the delay it reacts.
    for (let step = 0; step < 14; step += 1) driver.decide(1 / 60, state({ signedTrackOffset: 3.5, position: { x: 0, y: 3.5 } }));
    expect(driver.telemetry().decisionCount).toBeGreaterThan(1);
    expect(Math.abs(driver.telemetry().input.steer)).toBeGreaterThan(0.1);
  });

  it("does not handbrake while stationary", () => {
    const driver = createVehicleDriverAi(circleRoute(8), { maxSpeed: 30, seed: 3, reactionSeconds: 0 });
    expect(driver.decide(1 / 60, state({ speed: 0 })).drift).toBe(false);
  });
});

describe("angleDelta", () => {
  it("returns the shortest signed angle across the wrap", () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(0.2, 10);
    expect(angleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(0.2, 10);
    expect(Math.abs(angleDelta(Math.PI, -Math.PI))).toBeLessThan(1e-9);
  });
});
