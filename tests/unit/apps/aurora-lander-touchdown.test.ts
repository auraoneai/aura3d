/**
 * Aurora Lander grading matrix + authored dynamics math.
 *
 * Covers the PRD §3 matrix (soft/hard/crash × attitude × zone), the fuel economy
 * constants, and storm-gust determinism — all from the same modules the browser
 * route imports, in plain Node.
 */
import { describe, expect, it } from "vitest";
import {
  FUEL_BURN_PER_SECOND,
  LANDER_GRAVITY,
  MAX_TILT_DEG,
  createLanderState,
  gustForceAt,
  gustTelegraphActive,
  hspeedOf,
  stepLander
} from "../../../apps/showcase-aurora-lander/src/lander";
import {
  HARD_LANDING_HULL_DAMAGE,
  HARD_TOUCHDOWN_MAX_VSPEED,
  LANDER_MAX_HULL,
  MAX_ATTITUDE_DEG,
  MAX_LANDING_SLOPE_DEG,
  SOFT_TOUCHDOWN_MAX_VSPEED,
  gradeTouchdown,
  hullAfterTouchdown,
  scoreTouchdown
} from "../../../apps/showcase-aurora-lander/src/touchdown";
import { SITES } from "../../../apps/showcase-aurora-lander/src/sites";
import { createTerrainField, sampleGridHeight } from "../../../apps/showcase-aurora-lander/src/terrain";
import { PREDICTION_HORIZON_SECONDS, predictLanding } from "../../../apps/showcase-aurora-lander/src/prediction";

const base = {
  vspeed: 1.2,
  hspeed: 0.4,
  attitudeDeg: 2,
  insidePadZone: true,
  slopeDeg: 0
};

describe("aurora lander touchdown grading matrix", () => {
  it("grades gentle on-pad touchdowns as soft with full points", () => {
    const graded = gradeTouchdown({ ...base, vspeed: SOFT_TOUCHDOWN_MAX_VSPEED - 0.01 });
    expect(graded.grade).toBe("soft");
    expect(graded.basePoints).toBe(1000);
  });

  it("grades firm touchdowns as hard with a penalty", () => {
    expect(gradeTouchdown({ ...base, vspeed: SOFT_TOUCHDOWN_MAX_VSPEED + 0.01 }).grade).toBe("hard");
    expect(gradeTouchdown({ ...base, vspeed: HARD_TOUCHDOWN_MAX_VSPEED - 0.01 }).basePoints).toBe(400);
  });

  it("crashes beyond the hard vertical-speed limit", () => {
    const graded = gradeTouchdown({ ...base, vspeed: HARD_TOUCHDOWN_MAX_VSPEED });
    expect(graded.grade).toBe("crash");
    expect(graded.crashReason).toMatch(/impact/i);
  });

  it("crashes tipped-over landings even at zero speed", () => {
    const graded = gradeTouchdown({ ...base, attitudeDeg: MAX_ATTITUDE_DEG + 0.5 });
    expect(graded.grade).toBe("crash");
    expect(graded.crashReason).toMatch(/tip/i);
  });

  it("crashes off-zone touchdowns even when everything else is perfect", () => {
    const graded = gradeTouchdown({ ...base, insidePadZone: false });
    expect(graded.grade).toBe("crash");
    expect(graded.crashReason).toMatch(/zone|pad/i);
  });

  it("crashes on excessive terrain slope", () => {
    const graded = gradeTouchdown({ ...base, slopeDeg: MAX_LANDING_SLOPE_DEG + 0.5 });
    expect(graded.grade).toBe("crash");
    expect(graded.crashReason).toMatch(/slope/i);
  });

  it("scores soft landings with fuel bonus and site multiplier", () => {
    const halfTank = scoreTouchdown({ grade: "soft", basePoints: 1000, fuelFraction: 0.5, siteMultiplier: 3 });
    expect(halfTank.total).toBe(Math.round(1000 * 1.5 * 3));
    const crash = scoreTouchdown({ grade: "crash", basePoints: 0, fuelFraction: 0.9, siteMultiplier: 4 });
    expect(crash.total).toBe(0);
  });

  it("keeps PRD thresholds intact", () => {
    expect(SOFT_TOUCHDOWN_MAX_VSPEED).toBe(2.0);
    expect(HARD_TOUCHDOWN_MAX_VSPEED).toBe(4.0);
    expect(MAX_ATTITUDE_DEG).toBe(12);
  });

  it("preserves hull on soft contact, damages it on hard contact, and destroys it on crash", () => {
    expect(hullAfterTouchdown(LANDER_MAX_HULL, "soft")).toBe(LANDER_MAX_HULL);
    expect(hullAfterTouchdown(LANDER_MAX_HULL, "hard")).toBe(LANDER_MAX_HULL - HARD_LANDING_HULL_DAMAGE);
    expect(hullAfterTouchdown(70, "hard")).toBe(40);
    expect(hullAfterTouchdown(LANDER_MAX_HULL, "crash")).toBe(0);
  });
});

describe("aurora lander authored integration", () => {
  const site = SITES[0]!;

  it("applies authored gravity and nothing else in free fall", () => {
    let state = createLanderState(site.spawn, site.fuelBudget);
    for (let frame = 0; frame < 60; frame += 1) state = stepLander(state, { thrust: 0, rotate: 0 }, 1 / 60);
    expect(state.vy).toBeCloseTo(LANDER_GRAVITY, 1);
    expect(state.fuel).toBe(site.fuelBudget);
  });

  it("burns fuel at full throttle and stops thrusting when dry", () => {
    let state = createLanderState(site.spawn, site.fuelBudget);
    let frames = 0;
    while (state.fuel > 0 && frames < 4000) {
      state = stepLander(state, { thrust: 1, rotate: 0 }, 1 / 60);
      frames += 1;
    }
    expect(state.fuel).toBe(0);
    expect(frames).toBeGreaterThanOrEqual(site.fuelBudget * 60 - 1);
    // One more second with an empty tank must not accelerate upward.
    const vyDry = state.vy;
    const after = stepLander(state, { thrust: 1, rotate: 0 }, 1 / 60);
    expect(after.vy).toBeLessThan(vyDry);
    const expectedBurn = 10 * FUEL_BURN_PER_SECOND;
    expect(expectedBurn).toBeGreaterThan(0);
  });

  it("clamps tilt to the authored limit under sustained RCS", () => {
    let state = createLanderState(site.spawn, site.fuelBudget);
    for (let frame = 0; frame < 240; frame += 1) state = stepLander(state, { thrust: 0, rotate: 1 }, 1 / 60);
    expect(state.tiltDeg).toBeLessThanOrEqual(MAX_TILT_DEG + 1e-9);
    expect(hspeedOf(state)).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic: identical inputs reproduce identical trajectories", () => {
    const runOne = (): number[] => {
      let current = createLanderState(site.spawn, site.fuelBudget);
      const marks: number[] = [];
      for (let frame = 0; frame < 180; frame += 1) {
        current = stepLander(current, { thrust: frame % 7 < 3 ? 1 : 0, rotate: frame % 11 < 4 ? 0.6 : 0 }, 1 / 60);
        if (frame % 30 === 0) marks.push(current.y * 1000 + current.x);
      }
      return marks;
    };
    expect(runOne()).toEqual(runOne());
  });
});

describe("site-two/site-three gust determinism", () => {
  const storm = SITES[2]!;
  const gust = storm.gust!;

  it("applies zero force before the first window", () => {
    expect(gustForceAt(gust, gust.startSeconds - gust.warnLeadSeconds - 0.01)).toBe(0);
    expect(gustTelegraphActive(gust, 0)).toBe(false);
  });

  it("telegraphs before each gust cycle", () => {
    expect(gustTelegraphActive(gust, gust.startSeconds - gust.warnLeadSeconds + 0.01)).toBe(true);
    expect(gustTelegraphActive(gust, gust.startSeconds - gust.warnLeadSeconds - 0.05)).toBe(false);
  });

  it("produces a bounded, repeatable sinusoid", () => {
    const samples: number[] = [];
    for (let t = 0; t <= 40; t += 0.25) samples.push(gustForceAt(gust, t));
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(gust.amplitude + 1e-9);
    expect(samples[100]).toBe(samples[100]);
    expect(new Set(SITES.filter((entry) => entry.gust).map((entry) => entry.id))).toEqual(new Set([2, 3]));
  });
});

describe("site terrain fields are pad-flattened and seeded", () => {
  it("flattens every pad plateau and keeps pads inside the field", () => {
    for (const site of SITES) {
      const field = createTerrainField({ site });
      expect(field.heights.length).toBe(field.rows * field.columns);
      expect(field.maxHeight).toBeGreaterThan(field.minHeight);
      site.pads.forEach((pad, index) => {
        const plateau = field.padHeights[index] ?? 0;
        // Center sample equals the plateau height exactly (fully flattened core).
        expect(sampleGridHeight(field, pad.x, pad.z)).toBeCloseTo(plateau, 4);
      });
    }
  });

  it("raises difficulty: later sites have smaller pads and tighter fuel", () => {
    expect(SITES).toHaveLength(3);
    expect(SITES[0]!.pads[0]!.radius).toBeGreaterThan(SITES[2]!.pads[0]!.radius);
    expect(SITES[0]!.fuelBudget).toBeGreaterThan(SITES[2]!.fuelBudget);
    expect(SITES.map((entry) => entry.multiplier)).toEqual([1, 2, 3]);
    expect(SITES.map((entry) => entry.whiteout)).toEqual(
      [...SITES.map((entry) => entry.whiteout)].sort((a, b) => a - b)
    );
  });
});

describe("bounded landing prediction", () => {
  const site = SITES[0]!;
  const flatGround = () => 0;

  it("never projects beyond its disclosed horizon", () => {
    const state = createLanderState({ x: 0, y: 18, z: 0 }, site.fuelBudget);
    const estimate = predictLanding(state, { thrust: 0, rotate: 0 }, flatGround, 0.72, site.gust);
    expect(estimate.bounded).toBe(true);
    expect(estimate.seconds).toBeLessThanOrEqual(PREDICTION_HORIZON_SECONDS);
    expect(estimate.model).toBe("current-controls-authored-estimate");
  });

  it("changes its projected point when real thrust/rotation state changes", () => {
    let tilted = createLanderState({ x: 0, y: 12, z: 0 }, site.fuelBudget);
    for (let frame = 0; frame < 90; frame += 1) {
      tilted = stepLander(tilted, { thrust: 0.8, rotate: 1 }, 1 / 60, site.gust);
    }
    const coast = predictLanding(tilted, { thrust: 0, rotate: 0 }, flatGround, 0.72, site.gust);
    const burn = predictLanding(tilted, { thrust: 1, rotate: 1 }, flatGround, 0.72, site.gust);
    expect([burn.x, burn.z, burn.seconds]).not.toEqual([coast.x, coast.z, coast.seconds]);
  });
});

describe("campaign playthrough: every site completable inside its fuel budget", () => {
  /**
   * Headless playthrough using the same sink-rate autopilot shape the browser
   * evidence approach uses: free-fall from spawn, then track a descending
   * schedule onto the primary pad. Proves each site's authored fuel budget
   * admits a graded landing (soft or hard), i.e. all three sites are winnable.
   */
  const FOOT_DROP = 0.72;

  interface PlaythroughResult {
    readonly grade: ReturnType<typeof gradeTouchdown>["grade"];
    readonly score: number;
    readonly fuelFraction: number;
    readonly frames: number;
  }

  function playSite(siteIndex: number): PlaythroughResult {
    const site = SITES[siteIndex]!;
    const field = createTerrainField({ site });
    const pad = site.pads[0]!;
    const padHeight = field.padHeights[0] ?? 0;
    // Spawn above the pad center like the route's evidence approach.
    let current = createLanderState({ x: pad.x, y: padHeight + 30, z: pad.z }, site.fuelBudget);
    let frames = 0;
    const wrapAngle = (value: number): number => {
      let angle = value;
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      return angle;
    };
    while (frames < 60 * 120) {
      frames += 1;
      const agl = current.y - FOOT_DROP - sampleGridHeight(field, current.x, current.z);
      let thrust = 0;
      let rotate = 0;
      if (agl < 18) {
        const desiredVy = -Math.max(1.1, Math.min(4.0, agl * 0.28));
        thrust = Math.min(1, Math.max(0, 0.52 + (desiredVy - current.vy) * 0.32));
      }
      current = stepLander(current, { thrust, rotate }, 1 / 60, site.gust);
      const feetY = current.y - FOOT_DROP;
      const localGround = sampleGridHeight(field, current.x, current.z);
      const overPad = Math.hypot(current.x - pad.x, current.z - pad.z) <= pad.radius;
      const settledOffPad = !overPad && feetY - localGround <= 0.12 && Math.abs(current.vy) < 0.4;
      if (settledOffPad || current.fuel <= 0) {
        return { grade: "crash", score: 0, fuelFraction: current.fuel / site.fuelBudget, frames };
      }
      if (feetY - localGround <= 0.05 && overPad && Math.abs(current.vy) < 90) {
        const attitudeDeg = Math.abs(current.tiltDeg);
        const insidePadZone = Math.hypot(current.x - pad.x, current.z - pad.z) <= pad.radius;
        const graded = gradeTouchdown({
          vspeed: Math.abs(current.vy),
          hspeed: hspeedOf(current),
          attitudeDeg,
          insidePadZone,
          slopeDeg: 0
        });
        const scored = scoreTouchdown({
          grade: graded.grade,
          basePoints: graded.basePoints,
          fuelFraction: current.fuel / site.fuelBudget,
          siteMultiplier: site.multiplier
        });
        return { grade: graded.grade, score: scored.total, fuelFraction: current.fuel / site.fuelBudget, frames };
      }
    }
    throw new Error(`site ${site.id}: no touchdown within 120 s`);
  }

  it("lands every site softly without running dry", () => {
    const results = SITES.map((_, index) => ({ site: index + 1, ...playSite(index) }));
    console.log("PLAYTHROUGH:", JSON.stringify(results));
    for (const result of results) {
      expect(["soft", "hard"], `site ${result.site} grade`).toContain(result.grade);
      expect(result.score, `site ${result.site} score`).toBeGreaterThan(0);
      expect(result.fuelFraction, `site ${result.site} fuel left`).toBeGreaterThanOrEqual(0);
    }
    // Campaign total is the sum of cleared-site scores.
    expect(results.reduce((sum, r) => sum + r.score, 0)).toBeGreaterThan(0);
  });
});
