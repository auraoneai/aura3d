import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src";

/**
 * Regression coverage for the unsigned-offset defect found while building the FS-102 duration proof.
 *
 * `nearestRacePoint` derived the lateral offset with `Math.hypot`, so `trackOffset` was a pure
 * magnitude. A controller or opponent AI reading it could tell *how far* off the racing line the car
 * was but not *which side*, which makes steering back a coin flip. Measured symptom: a proportional
 * controller using `trackOffset` pinned the car at the track edge (offset saturated at 0.88 of a
 * 1.792-wide road), drove progress backwards, and spent 2,105 of 3,600 frames off-track. Full
 * opposite lock could not recover it.
 *
 * `signedTrackOffset` reports the same magnitude with a sign from the 2D cross product of the
 * segment direction and the vector to the car. `trackOffset` keeps its unsigned meaning because the
 * on-track test and the wall-clamp logic both depend on it.
 */
function straightRoute() {
  // A straight route along +X, so "left of travel" is unambiguously +Y.
  return {
    id: "signed-offset-straight",
    width: 4,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 }
    ],
    checkpoints: [0.25, 0.5, 0.75],
    // Open route, so the segment set is the straight line rather than a closed loop back to the
    // origin, which would make "left of travel" ambiguous.
    closed: false
  };
}

describe("racing surface query reports a signed lateral offset", () => {
  it("signs the offset by side of the racing line while keeping trackOffset unsigned", () => {
    const query = game.racingSurfaceQuery(straightRoute());

    const left = query.query({ x: 5, y: 1.2 });
    const right = query.query({ x: 5, y: -1.2 });

    // Magnitudes agree: the two points are equidistant from the line.
    expect(left.trackOffset).toBeCloseTo(1.2, 6);
    expect(right.trackOffset).toBeCloseTo(1.2, 6);
    // The unsigned field cannot distinguish them, which is exactly why the signed one is needed.
    expect(left.trackOffset).toBeCloseTo(right.trackOffset, 6);

    // Signed field separates the sides.
    expect(left.signedTrackOffset).toBeCloseTo(1.2, 6);
    expect(right.signedTrackOffset).toBeCloseTo(-1.2, 6);
    expect(Math.sign(left.signedTrackOffset)).not.toBe(Math.sign(right.signedTrackOffset));
  });

  it("reports zero signed offset exactly on the line", () => {
    const query = game.racingSurfaceQuery(straightRoute());
    const onLine = query.query({ x: 7.5, y: 0 });
    expect(onLine.trackOffset).toBeCloseTo(0, 6);
    expect(onLine.signedTrackOffset).toBeCloseTo(0, 6);
    expect(onLine.onTrack).toBe(true);
  });

  it("keeps the unsigned magnitude driving the on-track decision", () => {
    // roadHalfWidth is 2 for a width-4 route, so 1.2 is on-track on either side and 3 is off.
    const query = game.racingSurfaceQuery(straightRoute());
    expect(query.query({ x: 5, y: 1.2 }).onTrack).toBe(true);
    expect(query.query({ x: 5, y: -1.2 }).onTrack).toBe(true);
    expect(query.query({ x: 5, y: 3 }).onTrack).toBe(false);
    expect(query.query({ x: 5, y: -3 }).onTrack).toBe(false);
  });

  it("lets a proportional controller hold the racing line using the signed offset", () => {
    // This is the behavioural consequence, not just the field value: steering on the signed offset
    // must converge, where steering on the unsigned magnitude cannot.
    const racing = game.racing({
      route: straightRoute(),
      startProgress: 0,
      checkpointRadius: 0.1,
      lapsToWin: 3,
      acceleration: 12,
      drag: 0.28,
      steerRate: 0.62
    });

    // Push the car off-line first, so there is a real error to correct.
    let snapshot = racing.snapshot();
    for (let frame = 0; frame < 30; frame += 1) {
      snapshot = racing.step(1 / 60, { throttle: true, brake: false, drift: false, steer: 0.8 });
    }
    const displaced = Math.abs(snapshot.signedTrackOffset);
    expect(displaced).toBeGreaterThan(0);
    // The car is still drifting away from the line at this point, so the error keeps growing for a
    // few frames before the correction takes hold. Record the true peak to compare against.
    const displacedSign = Math.sign(snapshot.signedTrackOffset);

    // Now steer proportionally against the signed offset and watch the error shrink. The window is
    // bounded to the part of the run still on the route: this fixture is a short open straight, so
    // driving past its end leaves the road legitimately and says nothing about the controller.
    let worstOffsetAfterCorrection = 0;
    for (let frame = 0; frame < 70; frame += 1) {
      const steer = Math.max(-1, Math.min(1, -snapshot.signedTrackOffset * 2.2));
      snapshot = racing.step(1 / 60, { throttle: true, brake: false, drift: false, steer });
      worstOffsetAfterCorrection = Math.max(worstOffsetAfterCorrection, Math.abs(snapshot.signedTrackOffset));
    }

    // The controller pulls the car back across the line rather than pinning it against the edge:
    // the offset ends up on the opposite side from where it started, which is only possible if the
    // steering knew which way to correct. Steering on the unsigned magnitude saturates instead and
    // drives the car off the road (measured: 2,105 of 3,600 frames off-track on the real circuit).
    expect(Math.sign(snapshot.signedTrackOffset)).toBe(-displacedSign);
    // The error stays bounded rather than running away to the track edge. Steering on the unsigned
    // magnitude saturated at the road half-width and never came back.
    expect(worstOffsetAfterCorrection).toBeLessThan(2);
    expect(snapshot.offTrack).toBe(false);
    expect(snapshot.speed).toBeGreaterThan(0);
  });
});
