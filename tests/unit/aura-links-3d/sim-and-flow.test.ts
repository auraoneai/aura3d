import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain, pondGeometry } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  ACC_DEAD_ZONE,
  CUP_LIP_R,
  PLAYER_NAME,
  advanceTour,
  closestApproach,
  createSwingMeter,
  createTour,
  lipOutVelocity,
  makeRng,
  needleResult
} from "../../../apps/showcase-aura-links-3d/src/game/sim";
import {
  PICKUP_OVER_PAR,
  TOUR_COURSES,
  bracketRows,
  cameraModeFor,
  menuCanOpen,
  pickupScore,
  scorePuttingLab,
  shouldPickUp,
  tourCourseFor,
  tourFinished
} from "../../../apps/showcase-aura-links-3d/src/game/flow";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

describe("swing meter (audit C2)", () => {
  it("never presses itself: ticking alone holds power at 1 and only snaps at the needle's far end", () => {
    const m = createSwingMeter();
    m.press(); // idle -> power
    for (let i = 0; i < 200; i++) m.tick(1 / 60);
    expect(m.state().phase).toBe("power");
    expect(m.state().meter).toBe(1);
  });

  it("a centred press inside the pure strip is pure with zero spin; the strip follows the difficulty", () => {
    expect(needleResult(0.05)).toEqual({ accuracy: 0, spin: 0 });
    expect(needleResult(ACC_DEAD_ZONE + 0.01).accuracy).toBeGreaterThan(0);
    expect(needleResult(0.2, 0.3)).toEqual({ accuracy: 0, spin: 0 });
    expect(needleResult(0.2, 0.05).accuracy).toBeGreaterThan(0);
    expect(Math.sign(needleResult(-0.6).spin)).toBe(-1);
    expect(Math.sign(needleResult(0.6).spin)).toBe(1);
    const m = createSwingMeter({ deadZone: 0.3 });
    expect(m.deadZone()).toBe(0.3);
    m.setDeadZone(0.05);
    expect(m.deadZone()).toBe(0.05);
  });
});

describe("cup lip-out (audit C4)", () => {
  it("a dead-centre hot putt deflects 25-60 degrees sideways and keeps 60-80% of its speed, never reversing", () => {
    for (const offset of [0, 0.25, 0.5, 1]) {
      for (const side of [1, -1]) {
        const [vx, vz] = lipOutVelocity(0, 4, side, offset);
        const speed = Math.hypot(vx, vz);
        expect(speed / 4).toBeGreaterThanOrEqual(0.6 - 1e-9);
        expect(speed / 4).toBeLessThanOrEqual(0.8 + 1e-9);
        expect(vz).toBeGreaterThan(0); // still travelling forward
        const deg = (Math.acos(vz / speed) * 180) / Math.PI;
        expect(deg).toBeGreaterThanOrEqual(25 - 1e-6);
        expect(deg).toBeLessThanOrEqual(60 + 1e-6);
      }
    }
  });

  it("the swept test finds the cup between two frame positions", () => {
    const pass = closestApproach(0, -1, 0, 1, 0.02, 0);
    expect(pass.dist).toBeCloseTo(0.02, 6);
    expect(pass.dist).toBeLessThan(CUP_LIP_R);
    expect(pass.inSegment).toBe(true);
    expect(pass.u).toBeCloseTo(0.5, 6);
  });
});

describe("sim details (audit C17)", () => {
  it("makeRng stays below 1 so a shuffle index never runs past the array", () => {
    const rng = makeRng(0xffffffff);
    for (let i = 0; i < 20000; i++) expect(rng()).toBeLessThan(1);
  });
});

describe("pond hazard matches its zone (audit C6)", () => {
  it("every drawn pond and rim is sized to the hazard diameter", () => {
    let ponds = 0;
    for (const course of Object.values(COURSES)) {
      for (const hole of course.holes) {
        const terrain = buildHoleTerrain(course, hole);
        const water = hole.layout.water;
        for (const w of water) {
          const g = pondGeometry(terrain, w);
          expect(g.rimDiameter).toBeCloseTo(w.radius * 2, 6);
          expect(g.pondDiameter / 2).toBeGreaterThanOrEqual(w.radius * 0.95);
          // the drawn water edge (0.98r) sits inside the sim hazard: what looks like water plays as water
          expect(terrain.zone(w.center[0] + w.radius * 0.9, w.center[1])).toBe("water");
          ponds++;
        }
      }
    }
    expect(ponds).toBeGreaterThan(0);
  });
});

describe("round flow (audit C1 pickup, C5, C8, C9, C10, C3)", () => {
  it("picks a hole up at par+5", () => {
    expect(PICKUP_OVER_PAR).toBe(5);
    expect(shouldPickUp(8, 4)).toBe(false);
    expect(shouldPickUp(9, 4)).toBe(true);
    expect(pickupScore(4)).toBe(9);
  });

  it("Putting Lab counts a miss as an attempt and resets the streak", () => {
    let lab = { mode: "puttinglab" as const, attempts: 0, hits: 0, best: 0, streak: 0 };
    lab = scorePuttingLab(lab, true) as typeof lab;
    lab = scorePuttingLab(lab, true) as typeof lab;
    expect(lab).toMatchObject({ attempts: 2, hits: 2, streak: 2, best: 2 });
    lab = scorePuttingLab(lab, false) as typeof lab;
    expect(lab).toMatchObject({ attempts: 3, hits: 2, streak: 0, best: 2 });
  });

  it("each Pro Circuit round has its own course and a tour continues until a cut or the title", () => {
    expect(tourCourseFor("r32")).toBe("stAuroras");
    expect(tourCourseFor("final")).toBe("mareCourse");
    expect(new Set(TOUR_COURSES).size).toBe(5);
    for (const id of TOUR_COURSES) expect(COURSES[id as CourseId]).toBeTruthy();
    let tour = createTour(0x4a32);
    expect(tourFinished(tour)).toBe(false);
    expect(tourFinished(null)).toBe(true);
    tour = advanceTour(tour, -12);
    expect(tour.playerAlive).toBe(true);
    expect(tourCourseFor(tour.round)).toBe("mapleHollow");
  });

  it("the bracket always shows the player", () => {
    const tour = advanceTour(createTour(0x4a32), 30); // a bad round: the player is outside the top 8
    const rows = bracketRows(tour.results, "r32", 8, PLAYER_NAME);
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.you)).toHaveLength(1);
    expect(rows.find((r) => r.you)!.name).toBe(PLAYER_NAME);
  });

  it("Escape is blocked on the hole card and the camera mode depends only on the phase", () => {
    expect(menuCanOpen("card")).toBe(false);
    expect(menuCanOpen("menu")).toBe(false);
    expect(menuCanOpen("flight")).toBe(true);
    // the next hole's address after a celebration frames the tee, not the celebrate orbit
    expect(cameraModeFor({ phase: "address", ballMoving: false, strikeHold: false, lie: "tee" })).toBe("aim");
    expect(cameraModeFor({ phase: "card", ballMoving: false, strikeHold: false, lie: "green" })).toBe("celebrate");
    expect(cameraModeFor({ phase: "flight", ballMoving: true, strikeHold: false, lie: "fairway" })).toBe("flight");
  });
});
