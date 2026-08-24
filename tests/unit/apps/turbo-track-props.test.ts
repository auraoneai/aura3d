import { describe, expect, it } from "vitest";
import { game } from "@aura3d/engine";
import { gameGeometryContract } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";
import { turboVisualAsphaltWidth } from "../../../apps/showcase-turbo-drift-circuit/src/passing-lane";
import {
  auditTurboPropCorridorClearance,
  createTurboPropRng,
  planTurboTrackProps,
  simulateTurboPropScatter,
  type TurboScatterImpact
} from "../../../apps/showcase-turbo-drift-circuit/src/track-props";

/**
 * PRD TDC-A2 placement law, proven against the engine's own surface query:
 * every prop disc rests outside the passing-lane corridor (visual asphalt plus a
 * margin), and cosmetic scatter settles deterministically under a fixed seed.
 */

const routeGeometry = gameGeometryContract.route;
// The mounted route derives its sampler from the same contract, so the test can use
// the engine surface query directly rather than trusting route-local arithmetic.
const racingLine = game.racingSurfaceQuery(routeGeometry);
const ROAD_WIDTH = routeGeometry.width;
const VISUAL_ASPHALT_HALF = turboVisualAsphaltWidth(ROAD_WIDTH) / 2;
const LANE_MARGIN = 0.008;

function planProps(seed: number) {
  return planTurboTrackProps({
    sampleAt: (progress) => {
      const sample = racingLine.sampleAt(progress);
      return { x: sample.x, y: sample.y, heading: sample.heading };
    },
    visualAsphaltHalfWidthGame: VISUAL_ASPHALT_HALF,
    laneMarginGame: LANE_MARGIN,
    maxOffsetGame: ROAD_WIDTH * 0.85,
    radiusGameByKind: { cone: 0.012, "tire-stack": 0.02 },
    massKgByKind: { cone: 4, "tire-stack": 12 },
    coneCount: 14,
    tireStackCount: 8,
    seed,
    signedOffsetAt: (point) => Math.abs(racingLine.query(point).signedTrackOffset)
  });
}

describe("turbo track props placement", () => {
  const plan = planProps(20260821);

  it("places the committed prop set", () => {
    expect(plan.placements.length).toBe(22);
    expect(plan.placements.filter((prop) => prop.kind === "cone").length).toBe(14);
    expect(plan.placements.filter((prop) => prop.kind === "tire-stack").length).toBe(8);
  });

  it("keeps every prop AABB clear of the passing-lane corridors", () => {
    // Audited through the engine's own signed-offset probe, not planner arithmetic.
    const report = auditTurboPropCorridorClearance({
      placements: plan.placements,
      signedOffsetAt: (point) => Math.abs(racingLine.query(point).signedTrackOffset),
      corridorHalfWidthGame: plan.corridorHalfWidthGame
    });
    expect(report.violations).toEqual([]);
    expect(report.clear).toBe(true);
    // The closest prop edge still leaves the whole visual asphalt plus margin free.
    expect(report.minMeasuredEdgeGame).toBeGreaterThanOrEqual(VISUAL_ASPHALT_HALF + LANE_MARGIN - 1e-6);
    for (const prop of plan.placements) {
      // AABB half-extent equals the collision disc radius on both axes.
      expect(Math.abs(prop.signedOffsetGame)).toBeGreaterThanOrEqual(
        VISUAL_ASPHALT_HALF + LANE_MARGIN + prop.radiusGame - 1e-6
      );
    }
  });

  it("is deterministic for a fixed seed and varies across seeds", () => {
    const again = planProps(20260821);
    expect(again.placements).toEqual(plan.placements);
    const other = planProps(99);
    expect(other.placements).not.toEqual(plan.placements);
  });

  it("keeps props on the verge band rather than deep in the infield", () => {
    for (const prop of plan.placements) {
      expect(Math.abs(prop.signedOffsetGame)).toBeLessThanOrEqual(ROAD_WIDTH * 0.85 + 1e-6);
    }
  });
});

describe("turbo track props scatter predictor", () => {
  const plan = planProps(20260821);
  const impacts: TurboScatterImpact[] = plan.placements.slice(0, 6).map((prop, index) => ({
    id: prop.id,
    dx: Math.cos(index),
    dz: Math.sin(index * 1.7),
    strength: 30 + index * 6
  }));

  it("settles deterministically under a fixed seed", () => {
    const runA = simulateTurboPropScatter({
      placements: plan.placements,
      impacts,
      seed: 424242,
      visualAsphaltHalfWidthGame: VISUAL_ASPHALT_HALF,
      laneMarginGame: LANE_MARGIN,
      sampleAt: (progress) => {
        const sample = racingLine.sampleAt(progress);
        return { x: sample.x, y: sample.y, heading: sample.heading };
      }
    });
    const runB = simulateTurboPropScatter({
      placements: plan.placements,
      impacts,
      seed: 424242,
      visualAsphaltHalfWidthGame: VISUAL_ASPHALT_HALF,
      laneMarginGame: LANE_MARGIN,
      sampleAt: (progress) => {
        const sample = racingLine.sampleAt(progress);
        return { x: sample.x, y: sample.y, heading: sample.heading };
      }
    });
    expect(runA.points).toEqual(runB.points);
    expect(runA.steps).toBe(runB.steps);
  });

  it("produces different scatter under different seeds", () => {
    const runA = simulateTurboPropScatter({
      placements: plan.placements,
      impacts,
      seed: 424242,
      visualAsphaltHalfWidthGame: VISUAL_ASPHALT_HALF,
      laneMarginGame: LANE_MARGIN,
      sampleAt: (progress) => {
        const sample = racingLine.sampleAt(progress);
        return { x: sample.x, y: sample.y, heading: sample.heading };
      }
    });
    const runC = simulateTurboPropScatter({
      placements: plan.placements,
      impacts,
      seed: 777,
      visualAsphaltHalfWidthGame: VISUAL_ASPHALT_HALF,
      laneMarginGame: LANE_MARGIN,
      sampleAt: (progress) => {
        const sample = racingLine.sampleAt(progress);
        return { x: sample.x, y: sample.y, heading: sample.heading };
      }
    });
    expect(runC.points).not.toEqual(runA.points);
  });

  it("leaves every impacted prop displaced and every rest point off the corridor", () => {
    const run = simulateTurboPropScatter({
      placements: plan.placements,
      impacts,
      seed: 424242,
      visualAsphaltHalfWidthGame: VISUAL_ASPHALT_HALF,
      laneMarginGame: LANE_MARGIN,
      sampleAt: (progress) => {
        const sample = racingLine.sampleAt(progress);
        return { x: sample.x, y: sample.y, heading: sample.heading };
      }
    });
    expect(run.allRestingOutsideCorridor).toBe(true);
    const byId = new Map(run.points.map((point) => [point.id, point]));
    for (const impact of impacts) {
      const prop = plan.placements.find((candidate) => candidate.id === impact.id)!;
      const rest = byId.get(impact.id)!;
      const displacement = Math.hypot(rest.x - prop.point.x, rest.y - prop.point.y);
      expect(displacement, "+" + impact.id + " must visibly move").toBeGreaterThan(0.001);
    }
    for (const point of run.points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(point.settledFrame).toBeGreaterThan(0);
    }
  });

  it("drives an unbiased PRNG stream so layout jitter is reproducible", () => {
    const rngA = createTurboPropRng(5);
    const rngB = createTurboPropRng(5);
    for (let index = 0; index < 32; index += 1) {
      expect(rngA()).toBe(rngB());
    }
  });
});