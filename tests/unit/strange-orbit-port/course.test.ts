import { describe, expect, it } from "vitest";
import {
  COURSE_LENGTH,
  GATES,
  ISLAND_TILES,
  OPAL,
  SPLIT,
  applyRouteTransitions,
  collectibles,
  groundHeight,
  islandHeight,
  islandRecoverS,
  islandSurface,
  normalizeDifficulty,
  rampAt,
  rampHeightAt,
  rampsFor,
  rivalForcedLane,
  routeOffset,
  sectionLabel,
  wrapS,
  type Route
} from "../../../examples/strange-orbit-port/course";
import { mainFrame, routeFrame, routeLengthScale, setActiveCourse } from "../../../examples/strange-orbit-port/track";
import { findReentry, resetReentryCache } from "../../../examples/strange-orbit-port/reentry";

describe("strange-orbit-port course topology", () => {
  it("wraps distances into one orbit", () => {
    expect(COURSE_LENGTH).toBe(1450);
    expect(wrapS(-1)).toBe(1449);
    expect(wrapS(1450)).toBe(0);
    expect(wrapS(3 * 1450 + 12.5)).toBeCloseTo(12.5, 10);
  });

  it("route offsets: main is wide (narrow inside the split), upper/lower meet the main lane at both ends", () => {
    expect(routeOffset(10, "main").half).toBe(11.5);
    expect(routeOffset(200, "main").half).toBeCloseTo(23 / 6, 12);
    for (const route of ["upper", "lower"] as const) {
      const start = routeOffset(SPLIT.start, route);
      const end = routeOffset(SPLIT.end, route);
      expect(Math.abs(start.side)).toBeCloseTo(23 / 3, 12);
      expect(Math.abs(end.side)).toBeCloseTo(23 / 3, 12);
      expect(start.height).toBeCloseTo(0, 12);
      expect(end.height).toBeCloseTo(0, 12);
    }
    expect(routeOffset(227.5, "upper").height).toBeCloseTo(17, 12);
    expect(routeOffset(227.5, "lower").height).toBeCloseTo(-14, 12);
    expect(routeOffset(OPAL.start, "bypass").side).toBeCloseTo(6.75, 12);
    expect(routeOffset(1250, "islands")).toEqual({ side: -4.75, height: 0, half: 6.75 });
  });

  it("island surface: tiles have height, gaps are null, the approach ramps from 0", () => {
    expect(islandHeight(100, "main")).toBe(0);
    expect(islandHeight(OPAL.start, "islands")).toBeCloseTo(0, 12);
    expect(islandHeight(1181, "islands")).toBeCloseTo(0.7, 12);
    const gap = (ISLAND_TILES[0]!.end + ISLAND_TILES[1]!.start) / 2;
    expect(islandHeight(gap, "islands")).toBeNull();
    expect(groundHeight(gap, 0, "islands", "bike")).toBeNull();
    expect(groundHeight(gap, 0, "main", "bike")).toBe(0);
    expect(islandHeight(ISLAND_TILES.at(-1)!.end + 5, "islands")).toBe(0);
    expect(islandSurface(1190, 0, "bike")?.tile?.id).toBe(0);
    expect(islandSurface(1190, 9, "bike")).toBeNull();
    expect(islandSurface(100, 0, "bike")).toBeNull();
  });

  it("falling between tiles recovers to the last tile's centre line", () => {
    const s = 1450 + 1199;
    expect(islandRecoverS(s, "main")).toBe(s);
    expect(islandRecoverS(s, "islands")).toBe(1450 + Math.min(1199, (1181 + 1195) / 2 - 2));
  });

  it("ramps: lookup, height curve and the skate-only extras", () => {
    expect(rampsFor("bike")).toHaveLength(3);
    expect(rampsFor("skate")).toHaveLength(7);
    expect(rampAt(110, -5.5, "bike")?.id).toBe("moon-hop");
    expect(rampAt(110, 5.5, "bike")).toBeUndefined();
    expect(rampAt(350, -5.5, "bike")).toBeUndefined();
    expect(rampAt(350, -5.5, "skate")?.id).toBe("crystal-pop");
    expect(rampHeightAt(105, -5.5, "bike")).toBe(0);
    expect(rampHeightAt(105 + 18 * 0.5, -5.5, "bike")).toBeCloseTo(1.8 * 0.25, 12);
    expect(rampHeightAt(105 + 17.999, -5.5, "bike")).toBeCloseTo(1.8, 2);
  });

  it("splits: lane at entry chooses the route and the lane is re-expressed", () => {
    const pick = (lane: number, at: number): { route: Route; lane: number } => {
      const rider = { s: at + 0.5, lane, route: "main" as Route };
      applyRouteTransitions(rider, at - 0.5);
      return { route: rider.route, lane: rider.lane };
    };
    expect(pick(-5, SPLIT.start).route).toBe("upper");
    expect(pick(5, SPLIT.start).route).toBe("lower");
    expect(pick(0, SPLIT.start).route).toBe("main");
    expect(pick(3, OPAL.start).route).toBe("bypass");
    expect(pick(0, OPAL.start).route).toBe("islands");
    expect(pick(-5, SPLIT.start).lane).toBeCloseTo(-5 - routeOffset(SPLIT.start, "upper").side, 12);
    const exiting = { s: SPLIT.end + 0.5, lane: 0, route: "upper" as Route };
    applyRouteTransitions(exiting, SPLIT.end - 0.5);
    expect(exiting.route).toBe("main");
    expect(exiting.lane).toBeCloseTo(routeOffset(SPLIT.end - 0.001, "upper").side, 12);
  });

  it("rivals are steered to fixed lanes before the splits and nowhere else", () => {
    expect(rivalForcedLane(SPLIT.start - 10, 0, 0)).toBe(-8);
    expect(rivalForcedLane(SPLIT.start - 10, 1, 0)).toBe(0);
    expect(rivalForcedLane(SPLIT.start - 10, 1, 1)).toBe(8);
    expect(rivalForcedLane(OPAL.start - 30, 3, 0)).toBe(7);
    expect(rivalForcedLane(OPAL.start - 30, 1, 0)).toBe(-5);
    expect(rivalForcedLane(500, 2)).toBeNull();
  });

  it("collectibles: deterministic, 96 slots spread over the orbit, cached", () => {
    const list = collectibles("painted");
    expect(collectibles("painted")).toBe(list);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
    expect(list.every((c) => c.s >= 25 && c.s < COURSE_LENGTH)).toBe(true);
    expect(list.filter((c) => c.route === "upper")).toHaveLength(list.filter((c) => c.route === "lower").length);
    expect(list.filter((c) => c.kind === "meteor").length).toBeGreaterThan(5);
    expect(list.filter((c) => c.route === "islands").every((c) => islandHeight(c.s, "islands") !== null)).toBe(true);
  });

  it("gates, labels and difficulty aliases", () => {
    expect(GATES.map((g) => g.s)).toEqual([90, 305, 600, 1080, 1370]);
    expect(sectionLabel(200, "upper")).toBe("Painted split · upper lane");
    expect(sectionLabel(1200, "bypass")).toBe("Opal · lower bypass");
    expect(sectionLabel(1400)).toBe("The homeward ribbon");
    expect(normalizeDifficulty("normal")).toBe("racer");
    expect(normalizeDifficulty("relaxed")).toBe("explorer");
    expect(normalizeDifficulty("nonsense")).toBe("racer");
  });
});

describe("strange-orbit-port track geometry", () => {
  setActiveCourse("painted");

  it("frames are orthonormal and the centreline is a closed loop", () => {
    for (const s of [0, 120, 333, 700, 1100, 1449]) {
      const f = mainFrame(s);
      expect(f.tangent.length()).toBeCloseTo(1, 12);
      expect(f.side.length()).toBeCloseTo(1, 12);
      expect(f.up.length()).toBeCloseTo(1, 12);
      expect(Math.abs(f.tangent.dot(f.side))).toBeLessThan(1e-9);
      expect(Math.abs(f.tangent.dot(f.up))).toBeLessThan(1e-9);
    }
    const a = mainFrame(0).p, b = mainFrame(COURSE_LENGTH).p;
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
    expect(mainFrame(0.5 * COURSE_LENGTH).p.length()).toBeGreaterThan(150);
  });

  it("route frames blend into the main frame at the section ends", () => {
    for (const route of ["upper", "lower"] as const) {
      const at = routeFrame(SPLIT.start, route);
      const main = mainFrame(SPLIT.start);
      expect(at.tangent.dot(main.tangent)).toBeGreaterThan(0.999);
      expect(routeFrame(200, route).p.distanceTo(mainFrame(200).p)).toBeGreaterThan(5);
    }
    expect(routeLengthScale(10, "main")).toBe(1);
    expect(routeLengthScale(200, "upper")).toBeGreaterThanOrEqual(0.45);
    expect(routeLengthScale(200, "upper")).toBeLessThanOrEqual(1.25);
  });

  it("reentry sweep from above the surface lands at the same distance and lane", () => {
    resetReentryCache();
    const f = routeFrame(500, "main");
    const target = (lane: number) => f.p.clone().addScaledVector(f.side, lane);
    const from = target(2.5).addScaledVector(f.up, 3);
    const to = target(2.5).addScaledVector(f.up, -0.5);
    const hit = findReentry(from, to, "bike", 500);
    expect(hit?.route).toBe("main");
    expect(hit!.s).toBeCloseTo(500, 0);
    expect(hit!.lane).toBeCloseTo(2.5, 1);
    expect(findReentry(from.clone().addScaledVector(f.up, 400), to.clone().addScaledVector(f.up, 400), "bike", 500)).toBeNull();
  });
});
