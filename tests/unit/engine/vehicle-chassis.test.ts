import { describe, expect, it } from "vitest";
import {
  createVehicleChassis,
  flatVehicleSurface,
  groundedFittedModelPosition,
  vehicleChassisSpecFromBounds,
  type VehiclePlanarState,
  type VehicleSurface
} from "../../../packages/engine/src/agent-api/VehicleChassis";

/**
 * Regression cases for the reported vehicle defects: the car sinking into the
 * tarmac at speed, contact not matching the visible tyres, and no suspension.
 *
 * The route previously pinned the car's rendered Y to a single literal
 * (`TRACK_SURFACE_Y`), so it could not respond to the surface it was over and the
 * chassis never pitched or rolled. These tests hold the reusable chassis to the
 * properties that make grounding a fact rather than a claim about a screenshot.
 */

const SPEC = {
  wheelbase: 1.2,
  trackWidth: 0.8,
  wheelRadius: 0.16,
  rideHeight: 0.3,
  suspensionTravel: 0.07
} as const;

function driving(overrides: Partial<VehiclePlanarState> = {}): VehiclePlanarState {
  return { x: 0, z: 0, heading: 0, speed: 20, steer: 0, throttle: 1, brake: 0, slip: 0, ...overrides };
}

/** Sloped surface, to prove the chassis follows terrain rather than a constant. */
function rampSurface(slope: number): VehicleSurface {
  return { sample: (x) => ({ height: x * slope, normal: [0, 1, 0], grip: 1 }) };
}

describe("vehicle grounding", () => {
  it("keeps every wheel on a flat surface at speed", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    chassis.reset(driving({ speed: 0, throttle: 0 }));
    // Drive for two seconds at 111 km/h, the speed at which the car was reported
    // to sink.
    for (let step = 0; step < 120; step += 1) {
      chassis.step(1 / 60, driving({ x: step * 0.5, speed: 30.8 }));
    }
    const pose = chassis.pose();
    expect(pose.grounded).toBe(true);
    expect(chassis.telemetry().groundedWheels).toBe(4);
    expect(chassis.telemetry().maxContactGap).toBeLessThan(SPEC.suspensionTravel * 0.5);
  });

  it("never places the chassis below the road surface", () => {
    const surfaceHeight = 0.35;
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(surfaceHeight));
    chassis.reset(driving({ speed: 0, throttle: 0 }));
    for (let step = 0; step < 240; step += 1) {
      const pose = chassis.step(1 / 60, driving({
        x: step * 0.4,
        speed: 28,
        throttle: step % 40 < 20 ? 1 : 0,
        brake: step % 40 < 20 ? 0 : 1,
        steer: Math.sin(step / 12),
        slip: 0.4
      }));
      // The lowest wheel contact patch must stay at or above the road, and the
      // body must stay above it. This is the sinking defect stated as arithmetic.
      for (const wheel of pose.wheels) {
        expect(wheel.position[1] - SPEC.wheelRadius).toBeGreaterThanOrEqual(surfaceHeight - 1e-6);
      }
      expect(pose.position[1]).toBeGreaterThan(surfaceHeight);
    }
  });

  it("distinguishes the body centre from the contact plane", () => {
    /*
     * Regression: the chassis reported only its body-centre height, and Turbo passed that
     * to a `scaleMode: "fit"` model. The safe renderer grounds a fitted model's *lowest
     * point* on its node position, so the car was lifted by its whole ride height and
     * visibly hovered above the tarmac -- the sinking defect's mirror image, introduced
     * while fixing the sinking. Both values are now published and their relationship is
     * pinned.
     */
    const surfaceHeight = 0.5;
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(surfaceHeight));
    const pose = chassis.reset(driving({ speed: 0, throttle: 0 }));
    // The contact plane is the road; the body centre is a ride height above it.
    expect(pose.groundedPosition[1]).toBeCloseTo(surfaceHeight, 6);
    expect(pose.position[1]).toBeGreaterThan(pose.groundedPosition[1]);
    expect(pose.position[1] - pose.groundedPosition[1]).toBeCloseTo(SPEC.rideHeight, 2);
    // Both share the planar position.
    expect(pose.groundedPosition[0]).toBe(pose.position[0]);
    expect(pose.groundedPosition[2]).toBe(pose.position[2]);
  });

  it("keeps the contact plane on the road while driving", () => {
    const surfaceHeight = 0.35;
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(surfaceHeight));
    chassis.reset(driving({ speed: 0, throttle: 0 }));
    for (let step = 0; step < 180; step += 1) {
      const pose = chassis.step(1 / 60, driving({
        x: step * 0.4, speed: 26, steer: Math.sin(step / 11), brake: step % 50 < 12 ? 1 : 0, slip: 0.3
      }));
      // A fitted model placed here must never be above or below the road.
      expect(pose.groundedPosition[1]).toBeCloseTo(surfaceHeight, 4);
    }
  });

  it("lifts a bottom-grounded fitted model by the vertical sweep of pitch and roll", () => {
    const pose = {
      groundedPosition: [4, 0.35, -2] as const,
      rotation: [0.08, 1.2, -0.12] as const
    };
    const size = [1.4, 0.8, 3.2] as const;
    const rendered = groundedFittedModelPosition(pose, size);
    const expectedLift = Math.abs(Math.sin(pose.rotation[0])) * size[2] / 2
      + Math.abs(Math.sin(pose.rotation[2])) * size[0] / 2;

    expect(rendered[0]).toBe(pose.groundedPosition[0]);
    expect(rendered[2]).toBe(pose.groundedPosition[2]);
    expect(rendered[1]).toBeCloseTo(pose.groundedPosition[1] + expectedLift, 8);
    // Presentation compensation must not mutate the physical contact-plane evidence.
    expect(pose.groundedPosition[1]).toBe(0.35);
  });

  it("follows a sloped surface instead of a frozen plane", () => {
    const chassis = createVehicleChassis(SPEC, rampSurface(0.1));
    const low = chassis.reset(driving({ x: 0, speed: 0, throttle: 0 }));
    const high = chassis.reset(driving({ x: 20, speed: 0, throttle: 0 }));
    // 20 units along a 0.1 slope raises the surface by 2 units; the chassis must
    // rise with it.
    expect(high.position[1] - low.position[1]).toBeCloseTo(2, 1);
  });

  it("reports a wheel off the ground over a drop", () => {
    // A surface with a hole under the front-left wheel's contact point.
    const surface: VehicleSurface = {
      sample: (x, z) => ({ height: x > 0.3 && z < -0.1 ? -3 : 0, normal: [0, 1, 0], grip: 1 })
    };
    const chassis = createVehicleChassis(SPEC, surface);
    chassis.reset(driving({ speed: 0, throttle: 0 }));
    for (let step = 0; step < 30; step += 1) chassis.step(1 / 60, driving({ speed: 5 }));
    const pose = chassis.pose();
    expect(pose.grounded).toBe(false);
    expect(pose.wheels.filter((wheel) => !wheel.grounded).length).toBeGreaterThan(0);
  });

  it("holds the body on the road when a whole axle misses a mesh seam", () => {
    // A sparse-mesh seam: the query reports an explicit miss with a fallback
    // height far below the road, the way a mesh query falls back to its lowest
    // vertex. Both front wheels miss at once, which used to drag the support
    // median halfway to the fallback and bury the rendered car under the road.
    const surface: VehicleSurface = {
      sample: (x) => x > 0.3
        ? { height: -2, normal: [0, 1, 0], grip: 0.2, hit: false }
        : { height: 0, normal: [0, 1, 0], grip: 1, hit: true }
    };
    const chassis = createVehicleChassis(SPEC, surface);
    chassis.reset(driving({ x: -2, speed: 0, throttle: 0 }));
    let pose = chassis.pose();
    for (let step = 0; step < 20; step += 1) {
      pose = chassis.step(1 / 60, driving({ x: -2 + step * 0.1, speed: 5 }));
    }
    // Front axle is past the seam (x + 0.6 > 0.3); rear axle is still on it.
    expect(chassis.telemetry().groundedWheels).toBe(2);
    expect(pose.grounded).toBe(false);
    // The contact plane stays on the road instead of splitting the difference
    // with the fallback depth.
    expect(pose.groundedPosition[1]).toBeCloseTo(0, 1);
    for (const wheel of pose.wheels) {
      for (const component of wheel.position) expect(component).not.toBeNaN();
      expect(wheel.position[1] - SPEC.wheelRadius).toBeGreaterThan(-0.5);
    }
  });

  it("freezes the pose instead of diving when every wheel misses the mesh", () => {
    const surface: VehicleSurface = {
      sample: (x) => x > 0.3
        ? { height: -2, normal: [0, 1, 0], grip: 0.2, hit: false }
        : { height: 0, normal: [0, 1, 0], grip: 1, hit: true }
    };
    const chassis = createVehicleChassis(SPEC, surface);
    chassis.reset(driving({ x: -2, speed: 0, throttle: 0 }));
    for (let step = 0; step < 10; step += 1) {
      chassis.step(1 / 60, driving({ x: -2 + step * 0.1, speed: 5 }));
    }
    const before = chassis.pose().groundedPosition[1];
    // Drive the whole car past the seam edge so no wheel has a surface.
    for (let step = 0; step < 30; step += 1) {
      chassis.step(1 / 60, driving({ x: -1 + step * 0.3, speed: 15 }));
    }
    const pose = chassis.pose();
    expect(chassis.telemetry().groundedWheels).toBe(0);
    expect(pose.groundedPosition[1]).toBeCloseTo(before, 6);
    for (const wheel of pose.wheels) {
      expect(wheel.grounded).toBe(false);
      for (const component of wheel.position) expect(component).not.toBeNaN();
    }
  });
});

describe("suspension and attitude", () => {
  it("pitches nose-down under braking and nose-up under throttle", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    chassis.reset(driving({ speed: 20, throttle: 0 }));
    for (let step = 0; step < 60; step += 1) chassis.step(1 / 60, driving({ speed: 20, throttle: 0, brake: 1 }));
    const braking = chassis.telemetry().pitch;
    chassis.reset(driving({ speed: 20, throttle: 0 }));
    for (let step = 0; step < 60; step += 1) chassis.step(1 / 60, driving({ speed: 20, throttle: 1, brake: 0 }));
    const accelerating = chassis.telemetry().pitch;
    expect(braking).toBeGreaterThan(0);
    expect(accelerating).toBeLessThan(0);
    expect(braking).not.toBeCloseTo(accelerating, 3);
  });

  it("rolls into a corner and reverses roll the other way", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    chassis.reset(driving({ speed: 25, throttle: 0 }));
    for (let step = 0; step < 90; step += 1) chassis.step(1 / 60, driving({ speed: 25, steer: 1, slip: 0.5 }));
    const rightRoll = chassis.telemetry().roll;
    chassis.reset(driving({ speed: 25, throttle: 0 }));
    for (let step = 0; step < 90; step += 1) chassis.step(1 / 60, driving({ speed: 25, steer: -1, slip: 0.5 }));
    const leftRoll = chassis.telemetry().roll;
    expect(Math.sign(rightRoll)).toBe(-Math.sign(leftRoll));
    expect(Math.abs(rightRoll)).toBeGreaterThan(0.01);
  });

  it("does not roll when travelling straight", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    chassis.reset(driving({ speed: 25, throttle: 0 }));
    for (let step = 0; step < 90; step += 1) chassis.step(1 / 60, driving({ speed: 25, steer: 0 }));
    expect(Math.abs(chassis.telemetry().roll)).toBeLessThan(0.001);
  });

  it("moves suspension over an uneven surface", () => {
    // A uniform slope legitimately produces constant compression -- all four wheels
    // see the same relative height -- so the surface must actually be uneven for
    // this to test the spring rather than the ramp.
    const bumpy: VehicleSurface = { sample: (x) => ({ height: Math.sin(x * 2.4) * 0.05, normal: [0, 1, 0], grip: 1 }) };
    const chassis = createVehicleChassis(SPEC, bumpy);
    chassis.reset(driving({ x: 0, speed: 0, throttle: 0 }));
    const compressions = new Set<number>();
    for (let step = 0; step < 60; step += 1) {
      const pose = chassis.step(1 / 60, driving({ x: step * 0.3, speed: 18 }));
      compressions.add(Number(pose.averageCompression.toFixed(4)));
    }
    // A frozen plane would produce one constant value; a spring produces many.
    expect(compressions.size).toBeGreaterThan(3);
  });
});

describe("wheel visuals", () => {
  it("spins wheels in proportion to speed and not at all when stopped", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    chassis.reset(driving({ speed: 0, throttle: 0 }));
    const stationary = chassis.step(1 / 60, driving({ speed: 0, throttle: 0 })).wheels[0].spin;
    const after = chassis.step(1 / 60, driving({ speed: 0, throttle: 0 })).wheels[0].spin;
    expect(after).toBeCloseTo(stationary, 10);
    expect(chassis.telemetry().wheelSpinRate).toBe(0);

    chassis.reset(driving({ speed: 0, throttle: 0 }));
    chassis.step(1 / 60, driving({ speed: 30 }));
    expect(chassis.telemetry().wheelSpinRate).toBeCloseTo(30 / SPEC.wheelRadius, 6);
  });

  it("steers only the front wheels", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    const pose = chassis.reset(driving({ steer: 1 }));
    const front = pose.wheels.filter((wheel) => wheel.id.startsWith("front"));
    const rear = pose.wheels.filter((wheel) => wheel.id.startsWith("rear"));
    for (const wheel of front) expect(wheel.steerAngle).toBeGreaterThan(0);
    for (const wheel of rear) expect(wheel.steerAngle).toBe(0);
  });

  it("places wheels at the corners of the wheelbase and track", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    const pose = chassis.reset(driving({ x: 0, z: 0, heading: 0, speed: 0, steer: 0 }));
    const byId = new Map(pose.wheels.map((wheel) => [wheel.id, wheel.position]));
    // Heading 0 faces +X, so front wheels sit at +x and the track spans z.
    expect(byId.get("front-left")![0]).toBeCloseTo(SPEC.wheelbase * 0.5, 6);
    expect(byId.get("rear-left")![0]).toBeCloseTo(-SPEC.wheelbase * 0.5, 6);
    expect(Math.abs(byId.get("front-left")![2] - byId.get("front-right")![2])).toBeCloseTo(SPEC.trackWidth, 6);
  });

  it("rotates the wheel layout with heading", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0));
    const pose = chassis.reset(driving({ heading: Math.PI / 2, speed: 0 }));
    const front = pose.wheels.find((wheel) => wheel.id === "front-left")!;
    // Facing +Z now, so the front axle is displaced along z, not x.
    expect(front.position[2]).toBeCloseTo(SPEC.wheelbase * 0.5, 6);
  });
});

describe("vehicleChassisSpecFromBounds", () => {
  it("derives proportional geometry from a rendered asset size", () => {
    const spec = vehicleChassisSpecFromBounds([4.2, 1.2, 1.8]);
    expect(spec.wheelbase).toBeCloseTo(4.2 * 0.6, 6);
    expect(spec.trackWidth).toBeCloseTo(1.8 * 0.82, 6);
    expect(spec.wheelRadius).toBeCloseTo(1.2 * 0.42 / 2, 6);
    // Ride height must lift the body clear of the contact patch.
    expect(spec.rideHeight).toBeGreaterThan(spec.wheelRadius);
  });

  it("produces different geometry for a different vehicle, unlike a frozen constant", () => {
    const hatchback = vehicleChassisSpecFromBounds([3.6, 1.5, 1.7]);
    const supercar = vehicleChassisSpecFromBounds([4.6, 1.1, 2.0]);
    expect(supercar.wheelbase).toBeGreaterThan(hatchback.wheelbase);
    expect(supercar.rideHeight).toBeLessThan(hatchback.rideHeight);
  });

  it("treats the longest horizontal axis as body length regardless of orientation", () => {
    const alongX = vehicleChassisSpecFromBounds([4.2, 1.2, 1.8]);
    const alongZ = vehicleChassisSpecFromBounds([1.8, 1.2, 4.2]);
    expect(alongZ.wheelbase).toBeCloseTo(alongX.wheelbase, 6);
    expect(alongZ.trackWidth).toBeCloseTo(alongX.trackWidth, 6);
  });
});
