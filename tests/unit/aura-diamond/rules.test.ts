import { describe, expect, it } from "vitest";
import {
  CONTACT_PLANE_T,
  countAfterPitch,
  DRESSING,
  FOUL_DEG,
  GRASS_Y,
  HARBOR_WATER,
  PARKS,
  PARK_ORDER,
  PITCHES,
  PLAYER_SWING_PRE,
  PROP_SPOTS,
  RELEASE_PT,
  SIM_STEP,
  WHIFF_WINDOW,
  ZONE_CY,
  ZONE_HH,
  ZONE_HW,
  advanceBracket,
  bleacherPlacements,
  calledPitch,
  createBracket,
  crowdPlacements,
  currentFixture,
  fenceRadius,
  gradeSwing,
  halfEndDecision,
  isMidInningMercy,
  isWalkoff,
  makeRng,
  polarOf,
  predictLanding,
  propSpot,
  sacFlyScores,
  scoreboardPlacement,
  shellPlacements,
  shouldResumeClassic,
  stepFlight,
  swingTimingError,
  timeToContactPlane,
  type PitchPath,
  type Vec3
} from "../../../apps/showcase-aura-diamond-3d/src/rules";

const path = (aimX: number, aimY: number, type: keyof typeof PITCHES = "fourseam", breakScale = 1): PitchPath => ({
  spec: PITCHES[type],
  start: [...RELEASE_PT],
  target: [aimX * ZONE_HW, ZONE_CY + aimY * ZONE_HH, 0],
  breakX: PITCHES[type].breakX * breakScale,
  breakY: PITCHES[type].breakY * breakScale
});

describe("called pitches (C1)", () => {
  it("a pitch with no swing that crosses the zone is a called strike", () => {
    expect(calledPitch(path(0, 0.2))).toBe("strike");
    expect(calledPitch(path(-0.5, 0.4, "slider", 0))).toBe("strike");
  });

  it("a pitch with no swing outside the zone is a ball", () => {
    expect(calledPitch(path(2.2, 0))).toBe("ball");
    expect(calledPitch(path(0, -2.6, "curve"))).toBe("ball");
  });
});

describe("ball-strike count", () => {
  it("a third strike is a strikeout", () => {
    expect(countAfterPitch({ balls: 3, strikes: 2 }, "strike")).toEqual({ balls: 3, strikes: 3, ends: "strikeout" });
  });
  it("a fourth ball is a walk", () => {
    expect(countAfterPitch({ balls: 3, strikes: 2 }, "ball")).toEqual({ balls: 4, strikes: 2, ends: "walk" });
  });
  it("a foul is a strike below two strikes and never the third", () => {
    expect(countAfterPitch({ balls: 0, strikes: 1 }, "foul")).toEqual({ balls: 0, strikes: 2, ends: null });
    expect(countAfterPitch({ balls: 0, strikes: 2 }, "foul")).toEqual({ balls: 0, strikes: 2, ends: null });
  });
});

describe("swing timing (C1)", () => {
  const flight = 16 / 42;
  it("a press exactly PLAYER_SWING_PRE before the ball reaches the plane is on time", () => {
    const t = CONTACT_PLANE_T - PLAYER_SWING_PRE / flight;
    expect(swingTimingError(timeToContactPlane("pitch", 0, t, flight))).toBeCloseTo(0, 9);
  });

  it("an earlier press is early and a later one is late, by the real time difference", () => {
    const onTime = CONTACT_PLANE_T - PLAYER_SWING_PRE / flight;
    const early = swingTimingError(timeToContactPlane("pitch", 0, onTime - 0.08 / flight, flight));
    const late = swingTimingError(timeToContactPlane("pitch", 0, onTime + 0.06 / flight, flight));
    expect(early).toBeCloseTo(-0.08, 9);
    expect(late).toBeCloseTo(0.06, 9);
  });

  it("a press during the windup is far too early and misses", () => {
    const err = swingTimingError(timeToContactPlane("windup", 0.1, 0, flight));
    expect(err).toBeLessThan(-WHIFF_WINDOW);
    expect(gradeSwing(err, 0, 1).grade).toBe("WHIFF");
  });

  it("grades follow timing and PCI distance instead of always PERFECT", () => {
    expect(gradeSwing(0.01, 0.05, 0.85).grade).toBe("PERFECT");
    expect(gradeSwing(-0.1, 0.05, 0.85).grade).toBe("EARLY");
    expect(gradeSwing(0.1, 0.05, 0.85).grade).toBe("LATE");
    expect(gradeSwing(0.03, 0.4, 0.85).grade).toBe("GOOD");
    expect(gradeSwing(0.2, 0.05, 0.85).grade).toBe("WHIFF");
    expect(gradeSwing(0, 1.4, 0.85).grade).toBe("WHIFF");
  });
});

describe("batted-ball flight (C4)", () => {
  it("the live flight, stepped from clean fence flags, reproduces the prediction including a wall hit", () => {
    const park = PARKS.sandlot;
    // A low line drive to centre that reaches the wall below its top.
    const pos0: Vec3 = [0, 1, 0.3];
    let vel0: Vec3 | null = null;
    for (let la = 4; la <= 20 && !vel0; la += 0.5) {
      for (let ev = 30; ev <= 60; ev += 1) {
        const v: Vec3 = [0, ev * Math.sin((la * Math.PI) / 180), -ev * Math.cos((la * Math.PI) / 180)];
        if (predictLanding(pos0, v, park).wallHit) {
          vel0 = v;
          break;
        }
      }
    }
    expect(vel0).not.toBeNull();
    const pr = predictLanding(pos0, vel0!, park);
    const live = { pos: [...pos0] as Vec3, vel: [...vel0!] as Vec3, crossedFence: false, hrCrossed: false, wallHit: false };
    let bounced = false;
    for (let t = 0; t < pr.hangT - SIM_STEP / 2; t += SIM_STEP) {
      stepFlight(live, park, SIM_STEP);
      if (live.wallHit && !bounced) {
        bounced = true;
        // After the rebound the ball is back inside the wall, moving toward home.
        expect(Math.hypot(live.pos[0], live.pos[2])).toBeLessThan(fenceRadius(park, 0));
        expect(live.vel[2]).toBeGreaterThan(0);
      }
    }
    expect(bounced).toBe(true);
    expect(live.wallHit).toBe(pr.wallHit);
    expect(live.hrCrossed).toBe(false);
    expect(Math.hypot(live.pos[0] - pr.landPos[0], live.pos[2] - pr.landPos[2])).toBeLessThan(0.5);
  });
});

describe("half-inning ends, mercy and walk-off (C7)", () => {
  it("a visiting 10-run lead after the top does not end the game before the home team bats", () => {
    expect(halfEndDecision("top", 2, 3, { away: 12, home: 1 })).toBe("bottom");
  });

  it("a home 10-run lead after the top of the 2nd ends it", () => {
    expect(halfEndDecision("top", 2, 3, { away: 0, home: 10 })).toBe("mercy");
  });

  it("a home lead after the top of the last inning is final; a tie goes to the bottom", () => {
    expect(halfEndDecision("top", 3, 3, { away: 2, home: 3 })).toBe("final");
    expect(halfEndDecision("top", 3, 3, { away: 3, home: 3 })).toBe("bottom");
  });

  it("after the bottom: decided games end, ties go to extras, a 10-run lead is mercy", () => {
    expect(halfEndDecision("bottom", 3, 3, { away: 4, home: 2 })).toBe("final");
    expect(halfEndDecision("bottom", 3, 3, { away: 2, home: 2 })).toBe("next-inning");
    expect(halfEndDecision("bottom", 1, 3, { away: 2, home: 2 })).toBe("next-inning");
    expect(halfEndDecision("bottom", 2, 3, { away: 11, home: 1 })).toBe("mercy");
  });

  it("the home team taking the lead in the bottom of the last or an extra inning is a walk-off", () => {
    expect(isWalkoff("bottom", 3, 3, { away: 2, home: 3 })).toBe(true);
    expect(isWalkoff("bottom", 4, 3, { away: 5, home: 6 })).toBe(true);
    expect(isWalkoff("bottom", 2, 3, { away: 2, home: 3 })).toBe(false);
    expect(isWalkoff("bottom", 3, 3, { away: 3, home: 3 })).toBe(false);
    expect(isWalkoff("top", 3, 3, { away: 2, home: 3 })).toBe(false);
  });

  it("a home lead of the mercy margin during a bottom half ends the game at once", () => {
    expect(isMidInningMercy("bottom", { away: 0, home: 10 })).toBe(true);
    expect(isMidInningMercy("bottom", { away: 0, home: 9 })).toBe(false);
    expect(isMidInningMercy("top", { away: 0, home: 12 })).toBe(false);
  });
});

describe("sacrifice fly (C6)", () => {
  it("scores the runner from third on a deep fly with fewer than two outs", () => {
    expect(sacFlyScores(true, 70, 0)).toBe(true);
    expect(sacFlyScores(true, 70, 1)).toBe(true);
  });

  it("does not score when the catch is the third out", () => {
    expect(sacFlyScores(true, 70, 2)).toBe(false);
  });

  it("needs a runner on third and a deep fly", () => {
    expect(sacFlyScores(false, 70, 0)).toBe(false);
    expect(sacFlyScores(true, 40, 0)).toBe(false);
  });
});

describe("World Classic bracket (C2)", () => {
  const ratings = Array.from({ length: 32 }, (_, i) => 0.5 + (i % 7) * 0.05);

  it("winning the Round of 32 resumes into the Round of 16 fixture", () => {
    const b = createBracket(32, makeRng(7));
    expect(currentFixture(b)).not.toBeNull();
    expect(shouldResumeClassic(b)).toBe(false);
    advanceBracket(b, true, 5, 2, ratings, makeRng(11));
    expect(b.round).toBe(1);
    expect(b.rounds[1]!.length).toBe(8);
    expect(shouldResumeClassic(b)).toBe(true);
    const next = currentFixture(b);
    expect(next).not.toBeNull();
    expect(next!.game.me).toBe(true);
  });

  it("a loss ends the run and the rest of the bracket is simulated to a champion", () => {
    const b = createBracket(32, makeRng(3));
    advanceBracket(b, false, 1, 4, ratings, makeRng(5));
    expect(shouldResumeClassic(b)).toBe(false);
    expect(b.alive).toBe(false);
    expect(b.champion).not.toBeNull();
    expect(b.champion).not.toBe(b.player);
  });

  it("five straight wins make the player champion", () => {
    const b = createBracket(32, makeRng(9));
    for (let r = 0; r < 5; r++) {
      expect(currentFixture(b)).not.toBeNull();
      advanceBracket(b, true, 4, 1, ratings, makeRng(100 + r));
    }
    expect(b.champion).toBe(b.player);
    expect(shouldResumeClassic(b)).toBe(false);
  });
});

describe("set dressing stays outside the fence in every park (C3, C13)", () => {
  const outside = (parkId: (typeof PARK_ORDER)[number], x: number, z: number, margin: number, what: string): void => {
    const park = PARKS[parkId];
    const { theta, r } = polarOf(x, z);
    if (Math.abs(theta) > FOUL_DEG + 4) return;
    expect(r, `${parkId} ${what} r=${r.toFixed(1)} fence=${fenceRadius(park, theta).toFixed(1)} θ=${theta.toFixed(1)}`).toBeGreaterThanOrEqual(fenceRadius(park, theta) + margin);
  };

  for (const id of PARK_ORDER) {
    it(`${id}: crowd, bleachers, shells, scoreboard and props`, () => {
      const park = PARKS[id];
      for (const c of crowdPlacements(park)) outside(id, c.x, c.z, 4, "crowd");
      for (const b of bleacherPlacements(park)) outside(id, b.x, b.z, DRESSING.bleacherDepth / 2 + 5, `bleacher ${b.sec}-${b.row}`);
      for (const s of shellPlacements(park)) outside(id, s.x, s.z, 24, s.name);
      const sb = scoreboardPlacement(park);
      outside(id, sb.rig[0], sb.rig[2], 15, "scoreboard");
      outside(id, sb.screen[0], sb.screen[2], 13.4, "scoreboard screen");
      for (const p of PROP_SPOTS[id]) {
        const [x, z] = propSpot(park, p.name);
        outside(id, x, z, p.min - 1e-6, p.name);
      }
    });
  }

  it("bleachers stand behind the crowd and the scoreboard behind the bleachers", () => {
    for (const id of PARK_ORDER) {
      const park = PARKS[id];
      const back = Math.max(...bleacherPlacements(park).filter((b) => b.theta === 0).map((b) => b.r + DRESSING.bleacherDepth / 2));
      expect(DRESSING.bleacherFront - DRESSING.bleacherDepth / 2).toBeGreaterThan(DRESSING.crowd + 0.5);
      expect(scoreboardPlacement(park).screen[2]).toBeLessThan(-back);
    }
  });

  it("the harbor water lies above the grass and wholly outside the Harbor Sandlot fence and stands", () => {
    expect(HARBOR_WATER.y).toBeGreaterThan(GRASS_Y + 0.1);
    const park = PARKS.sandlot;
    for (let ix = 0; ix <= 10; ix++) {
      for (let iz = 0; iz <= 10; iz++) {
        const x = HARBOR_WATER.x - HARBOR_WATER.w / 2 + (HARBOR_WATER.w * ix) / 10;
        const z = HARBOR_WATER.z - HARBOR_WATER.d / 2 + (HARBOR_WATER.d * iz) / 10;
        outside("sandlot", x, z, DRESSING.bleacherFront + DRESSING.bleacherRowStep * 2 + DRESSING.bleacherDepth, "water");
      }
    }
    void park;
  });
});
