import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src";

/**
 * Coverage for the missing-capability defect behind the turbo-drift steering failure.
 *
 * The racing surface query reported *how far* the car was from the racing line
 * (`signedTrackOffset`) but nothing about the line itself. With a kinematic car that is enough:
 * heading is integrated straight from the steering input, so the car always travels exactly where
 * it points and a proportional offset controller converges.
 *
 * A force-based car separates heading from direction of travel — under slip the two differ by the
 * slip angle — so an offset-only controller has no heading-error term and oscillates instead of
 * tracking. It also cannot brake for a corner it cannot see, because grip is finite and load
 * transfer takes time.
 *
 * `tangentHeading` and `curvature` are the two terms that close both gaps, and `sampleAt` makes
 * anticipation possible by sampling the line ahead of the car rather than under it. Classification:
 * missing-capability in the engine kit, not application authoring.
 */
function straightRoute() {
  return {
    id: "tangent-straight",
    width: 4,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 }
    ],
    closed: false
  };
}

/** A closed regular N-gon inscribed in a circle of radius R: known constant curvature 1/R. */
function circleRoute(radius: number, sides: number) {
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return { id: "tangent-circle", width: 4, points, closed: true };
}

describe("racing surface query exposes the racing line's own geometry", () => {
  it("reports the tangent heading of the line, not the car's bearing to it", () => {
    const query = game.racingSurfaceQuery(straightRoute());

    // The line runs along +X, so its heading is 0 everywhere regardless of which side the car sits.
    for (const y of [0, 1.2, -1.2]) {
      expect(query.query({ x: 5, y }).tangentHeading).toBeCloseTo(0, 6);
    }
  });

  it("reports zero curvature on a straight and 1/radius on a circle", () => {
    expect(query0Curvature()).toBeCloseTo(0, 6);

    const radius = 25;
    const query = game.racingSurfaceQuery(circleRoute(radius, 64));
    // Sample away from the seam so the estimate is taken from a fully interior vertex.
    for (const progress of [0.2, 0.45, 0.7]) {
      const sample = query.sampleAt(progress);
      // Counter-clockwise winding is a left-hand corner, so curvature is positive.
      expect(sample.curvature).toBeGreaterThan(0);
      // Discrete estimate on a 64-gon lands within a couple of percent of the true 1/R.
      expect(sample.curvature).toBeCloseTo(1 / radius, 2);
    }
  });

  function query0Curvature(): number {
    return game.racingSurfaceQuery(straightRoute()).query({ x: 5, y: 0 }).curvature;
  }

  it("signs curvature by corner direction so a controller knows which way the line bends", () => {
    const left = game.racingSurfaceQuery(circleRoute(25, 64));
    // Reversing the winding makes the same geometry a right-hand corner.
    const reversed = circleRoute(25, 64);
    const right = game.racingSurfaceQuery({ ...reversed, points: [...reversed.points].reverse() });

    expect(left.sampleAt(0.45).curvature).toBeGreaterThan(0);
    expect(right.sampleAt(0.45).curvature).toBeLessThan(0);
  });

  it("keeps curvature constant across the +/-pi heading wrap", () => {
    // On a closed circle the line's heading sweeps the full 2*pi, so it crosses the atan2 branch cut
    // once per lap. Subtracting raw headings there yields a ~2*pi spike, which a controller reads as
    // an impossibly tight corner and brakes hard for on a section that is not a corner at all.
    // Sweeping every sample point is what makes this test see the seam.
    const radius = 25;
    const query = game.racingSurfaceQuery(circleRoute(radius, 64));
    const curvatures = Array.from({ length: 256 }, (_, index) => query.sampleAt(index / 256).curvature);

    const max = Math.max(...curvatures);
    const min = Math.min(...curvatures);
    // Every sample must be the same constant 1/R; no spike anywhere on the lap.
    expect(min).toBeGreaterThan(0);
    expect(max).toBeCloseTo(1 / radius, 2);
    expect(min).toBeCloseTo(1 / radius, 2);
    expect(max - min).toBeLessThan(0.005);
  });

  it("samples ahead of the car, which is what makes corner anticipation possible", () => {
    const query = game.racingSurfaceQuery(circleRoute(25, 64));
    const here = query.query({ x: 25, y: 0 });
    // A lookahead distance converts to progress through the exposed centreline length.
    const ahead = query.sampleAt(here.progress + 12 / query.length);

    // The line has turned by the time the car gets there: that heading change is the signal a
    // reactive controller cannot see until it is already running wide.
    expect(Math.abs(ahead.heading - here.tangentHeading)).toBeGreaterThan(0.1);
    expect(query.length).toBeGreaterThan(0);
  });
});
