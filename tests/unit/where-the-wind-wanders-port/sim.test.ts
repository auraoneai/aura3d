import { describe, expect, it } from "vitest";
import {
  AXIS_RIGHT,
  AXIS_UP,
  BELL,
  BOUNDS,
  CIRCLES,
  LETTERS,
  RAILS,
  START,
  VIRTUAL_STEP_MS,
  buildFenceRails,
  buildStaticRails,
  clampWalkable,
  createState,
  expandScript,
  nearbyInteraction,
  nextFacing,
  runScript,
  slideAlongRails,
  stepFrame,
  type ScriptSegment
} from "../../../examples/where-the-wind-wanders-port/sim";

const walk = (keys: string, steps: number): ScriptSegment => ({ keys, act: null, steps });

describe("walking axes", () => {
  it("right/up are unit vectors from the constant camera offset (-1.4, 4.5, 20.5)", () => {
    expect(Math.hypot(AXIS_RIGHT.x, AXIS_RIGHT.z)).toBeCloseTo(1, 12);
    expect(AXIS_RIGHT.x).toBeCloseTo(20.5 / Math.hypot(20.5, 1.4), 12);
    expect(AXIS_RIGHT.z).toBeCloseTo(1.4 / Math.hypot(20.5, 1.4), 12);
    expect(AXIS_UP.x * AXIS_RIGHT.x + AXIS_UP.z * AXIS_RIGHT.z).toBeCloseTo(0, 12);
  });

  it("the first step of D is exactly 3.2 u/s along the rest right vector (the camera has not lagged yet)", () => {
    const { state } = runScript([walk("D", 1)]);
    const expected = 3.2 * 0.0167;
    expect(state.pos.x - START.x).toBeCloseTo(AXIS_RIGHT.x * expected, 12);
    expect(state.pos.z - START.z).toBeCloseTo(AXIS_RIGHT.z * expected, 12);
  });

  it("walking covers 3.2 u/s overall; the camera lag only tilts the direction slightly", () => {
    const { state } = runScript([walk("D", 60)]);
    const travelled = Math.hypot(state.pos.x - START.x, state.pos.z - START.z);
    expect(travelled).toBeCloseTo(3.2 * 0.0167 * 60, 3); // chord of a slightly curved path
    const heading = Math.atan2(state.pos.z - START.z, state.pos.x - START.x);
    expect(Math.abs(heading - Math.atan2(AXIS_RIGHT.z, AXIS_RIGHT.x))).toBeLessThan(0.03);
  });

  it("the camera lags the traveller: its look target eases toward (x + 2, z - 3.5) at rate 2.5", () => {
    const s = createState();
    for (let i = 0; i < 300; i++) stepFrame(s, { keys: "", act: null });
    expect(s.cam.bx).toBeCloseTo(s.pos.x + 2, 6);
    expect(s.cam.bz).toBeCloseTo(s.pos.z - 3.5, 6);
    const walking = createState();
    for (let i = 0; i < 120; i++) stepFrame(walking, { keys: "D", act: null });
    expect(walking.cam.bx).toBeLessThan(walking.pos.x + 2);
  });

  it("W walks away from the camera (towards -z in the world)", () => {
    const { state } = runScript([walk("W", 30)]);
    expect(state.pos.z).toBeLessThan(START.z);
  });

  it("diagonals are normalised: WD covers the same distance as D", () => {
    const a = runScript([walk("D", 40)]).state.pos;
    const b = runScript([walk("WD", 40)]).state.pos;
    expect(Math.hypot(b.x - START.x, b.z - START.z)).toBeCloseTo(Math.hypot(a.x - START.x, a.z - START.z), 3);
  });

  it("opposite keys cancel", () => {
    const { state } = runScript([walk("AD", 30)]);
    expect(state.pos).toEqual(START);
  });
});

describe("collision and bounds", () => {
  it("builds the original rail inventory: 8 static lines, 3 structure arcs of 21 points, 8 fence rails", () => {
    const stat = buildStaticRails();
    expect(stat).toHaveLength(8 + 3);
    expect(stat.slice(8).every((arc) => arc.length === 21)).toBe(true);
    const fences = buildFenceRails();
    expect(fences).toHaveLength(3 + 5);
    expect(RAILS).toHaveLength(stat.length + fences.length);
  });

  it("fence rails use half length 0.46 * scale * 570/290", () => {
    const [first] = buildFenceRails();
    expect(first![1]!.x - first![0]!.x).toBeCloseTo(2 * 0.46 * 1.45 * (570 / 290), 9);
    expect(first![0]!.z).toBeCloseTo(-4, 12);
  });

  it("static rail segment spacing is ceil(len / 2.4) subdivisions", () => {
    const west = buildStaticRails()[0]!;
    expect(west).toHaveLength(Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / 2.4) + 1);
  });

  it("clamps to the world bounds", () => {
    expect(clampWalkable({ x: -500, z: 500 })).toEqual({ x: BOUNDS.minX, z: BOUNDS.maxZ });
  });

  it("holds the cliff line at z = -13 east of x = 12 except at the jetty gaps", () => {
    expect(clampWalkable({ x: 40, z: -20 }).z).toBe(-13);
    expect(clampWalkable({ x: 31, z: -20 }).z).toBe(-18);
    expect(clampWalkable({ x: 55, z: -20 }).z).toBe(-20);
  });

  it("pushes points out of the fixed circle colliders", () => {
    const c = CIRCLES[0]!;
    const p = clampWalkable({ x: c.x + 0.1, z: c.z });
    expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(c.r - 1e-9);
  });

  it("slides along a rail instead of crossing it", () => {
    const rail = [[{ x: 0, z: 0 }, { x: 0, z: 10 }]] as const;
    const out = slideAlongRails({ x: -1, z: 2 }, { x: 1, z: 4 }, rail);
    expect(out.x).toBeLessThan(0);
    expect(out.z).toBeGreaterThan(2);
  });

  it("walking north into a fence stops at the player radius instead of crossing it", () => {
    const s = createState();
    s.pos = { x: -14, z: -2 };
    for (let i = 0; i < 100; i++) stepFrame(s, { keys: "W", act: null });
    expect(s.pos.z).toBeGreaterThanOrEqual(-4 + 0.38 - 1e-3);
    expect(s.pos.z).toBeLessThan(-3);
  });
});

describe("interaction", () => {
  it("finds the nearest un-found letter within 2.65 and the bell within 3.1", () => {
    expect(nearbyInteraction({ x: LETTERS[0].x + 2, z: LETTERS[0].z }, []).letter).toBe(0);
    expect(nearbyInteraction({ x: LETTERS[0].x + 3, z: LETTERS[0].z }, []).letter).toBe(-1);
    expect(nearbyInteraction({ x: LETTERS[0].x + 1, z: LETTERS[0].z }, [0]).letter).toBe(-1);
    expect(nearbyInteraction({ x: BELL.x - 3, z: BELL.z }, []).bell).toBe(true);
    expect(nearbyInteraction({ x: BELL.x - 3.2, z: BELL.z }, []).bell).toBe(false);
  });

  it("E collects a letter once; the bell needs all three", () => {
    const s = createState();
    s.pos = { x: LETTERS[0].x + 1, z: LETTERS[0].z };
    stepFrame(s, { keys: "", act: "E" });
    expect(s.found).toEqual([0]);
    stepFrame(s, { keys: "", act: "E" });
    expect(s.found).toEqual([0]);
    s.pos = { x: BELL.x - 1, z: BELL.z };
    stepFrame(s, { keys: "", act: "E" });
    expect(s.complete).toBe(false);
    s.found = [0, 1, 2];
    stepFrame(s, { keys: "", act: "E" });
    expect(s.complete).toBe(true);
  });
});

describe("facing, stride and hop", () => {
  it("keeps the facing inside the hysteresis cone and snaps outside it", () => {
    expect(nextFacing(0, 1, "front")).toBe("front");
    expect(nextFacing(1, 0, "front")).toBe("right");
    expect(nextFacing(0, 0, "left")).toBe("left");
    expect(nextFacing(0.2, 1, "front")).toBe("front");
  });

  it("stride accumulates travelled distance / 2.2", () => {
    const { state } = runScript([walk("D", 100)]);
    expect(state.stride).toBeCloseTo((3.2 * 0.0167 * 100) / 2.2, 6);
  });

  it("a hop runs takeoff 0.1 s, air 11.2/13 s, landing 0.16 s, then idles; it does not move the player", () => {
    const s = createState();
    stepFrame(s, { keys: "", act: "Space" });
    expect(s.hop.phase).not.toBe("idle");
    let peak = 0;
    for (let i = 0; i < 120; i++) { stepFrame(s, { keys: "", act: null }); peak = Math.max(peak, s.hop.height); }
    expect(peak).toBeGreaterThan(0.5);
    expect(s.hop.phase).toBe("idle");
    expect(s.pos).toEqual(START);
  });
});

describe("determinism", () => {
  const script: ScriptSegment[] = [walk("D", 120), walk("WD", 80), { keys: "", act: "E", steps: 1 }, walk("S", 50)];

  it("the same script reproduces the same trajectory bit for bit", () => {
    const a = runScript(script);
    const b = runScript(script);
    expect(a.xs).toEqual(b.xs);
    expect(a.zs).toEqual(b.zs);
  });

  it("expandScript applies a segment's action on its first step only", () => {
    const frames = expandScript([{ keys: "D", act: "E", steps: 3 }]);
    expect(frames.map((f) => f.act)).toEqual(["E", null, null]);
  });

  it("uses the 16.7 ms virtual frame period", () => {
    expect(VIRTUAL_STEP_MS).toBe(16.7);
  });
});
