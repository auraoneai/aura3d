/**
 * Regression: the bicycle vehicle model shares the GameArcadeVehicle heading
 * convention (motion along (cos h, sin h) on x/z, +steer increases heading).
 * BicycleModel itself integrates along (sin h, cos h); before the adapter
 * mirrored headings, every bicycle-model racer (A3D_QR_CAMERA default-on)
 * drove at 90 degrees to its heading, sliding sideways off the track
 * (showcase-turbo-drift-circuit: car slid left into the verge on throttle).
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags.js";
import { createGameArcadeVehicle } from "../../../../packages/engine/src/agent-api/GameRuntime.js";
import { createGameRacingKit } from "../../../../packages/engine/src/agent-api/GameGenreKits.js";

const drive = (model: "bicycle" | "unicycle", heading: number, steer: number, frames: number) => {
  const vehicle = createGameArcadeVehicle({ maxSpeed: 20, model });
  let s = vehicle.reset({ x: 0, z: 0, heading });
  for (let i = 0; i < frames; i += 1) s = vehicle.step(1 / 60, { throttle: 1, steer });
  return s;
};

describe("bicycle arcade vehicle heading convention", () => {
  for (const heading of [0, Math.PI / 2, -Math.PI / 2, Math.PI, 0.7]) {
    it(`throttle moves along (cos h, sin h) for h=${heading.toFixed(3)}`, () => {
      const s = drive("bicycle", heading, 0, 90);
      const dist = Math.hypot(s.x, s.z);
      expect(dist).toBeGreaterThan(1);
      // Motion direction matches the heading (no sideways slide).
      expect(s.x / dist).toBeCloseTo(Math.cos(heading), 3);
      expect(s.z / dist).toBeCloseTo(Math.sin(heading), 3);
      expect(s.heading).toBeCloseTo(heading, 6);
    });
  }

  it("reset reports the heading it was given", () => {
    const vehicle = createGameArcadeVehicle({ maxSpeed: 20, model: "bicycle" });
    expect(vehicle.reset({ heading: -Math.PI / 2 }).heading).toBeCloseTo(-Math.PI / 2, 9);
    expect(vehicle.reset({}).heading).toBeCloseTo(0, 9);
  });

  it("+steer turns the same way as the unicycle model", () => {
    for (const steer of [1, -1]) {
      const bike = drive("bicycle", 0, steer, 90);
      const uni = drive("unicycle", 0, steer, 90);
      expect(Math.sign(bike.heading)).toBe(Math.sign(uni.heading));
      expect(Math.sign(bike.z)).toBe(Math.sign(uni.z));
    }
  });

  it("constrain keeps the caller's heading", () => {
    const vehicle = createGameArcadeVehicle({ maxSpeed: 20, model: "bicycle" });
    vehicle.reset({ heading: 0 });
    expect(vehicle.constrain({ x: 1, z: 2, heading: 1.2 }).heading).toBeCloseTo(1.2, 9);
  });
});

describe("racing kit on the default (bicycle) model", () => {
  const route = {
    id: "straight-loop",
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    closed: true,
    width: 12
  } as never;

  it("throttle drives along the track without leaving it", () => {
    const kit = createGameRacingKit({ route, flags: resolveQrFlags({}) });
    const start = kit.snapshot();
    let snap = start;
    for (let i = 0; i < 120; i += 1) {
      snap = kit.step(1 / 60, { throttle: 1 });
      expect(snap.offTrack).toBe(false);
    }
    expect(Math.abs(snap.signedTrackOffset)).toBeLessThan(0.5);
    expect(snap.progress).toBeGreaterThan(start.progress);
    expect(snap.progress).toBeLessThan(0.5);
    expect(snap.speed).toBeGreaterThan(5);
  });
});
