import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";
import { IDLE, STEP, createSim, objectiveOf, progressStep, stepSim, targetOf, type Input, type Sim } from "../../../examples/silt-and-signal-port/sim";

const GO: Input = { ...IDLE, throttle: 1 };
const run = (sim: Sim, input: Input, steps: number): void => { for (let i = 0; i < steps; i++) stepSim(sim, input, STEP); };

describe("silt-and-signal chapters (extracted from the captured bundle)", () => {
  it("has the seven chapters and their objective kinds", () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(["home", "aqueduct", "forest", "nursery", "orchard", "crown", "return"]);
    expect(CHAPTERS.map((c) => c.objectives.map((o) => o.kind).join(","))).toEqual([
      "ride,care,ride,portal",
      "ride,lift,stealth,portal",
      "ride,resonate,care,timed,portal",
      "ride,wake,tow,resonate,care,portal",
      "climb,pollen,timed,portal",
      "ride,relay,lift,resonate,herd,portal",
      "ride,resonate,lift,herd,finish"
    ]);
  });

  it("every objective has points with finite coordinates and a radius", () => {
    for (const c of CHAPTERS) for (const o of c.objectives) {
      expect(o.points.length).toBeGreaterThan(0);
      expect(o.radius).toBeGreaterThan(0);
      for (const p of o.points) for (const k of ["x", "y", "z"] as const) expect(Number.isFinite(p[k])).toBe(true);
    }
  });
});

describe("flight model (original e0)", () => {
  it("starts 40 m behind the objective's first point at its altitude (qa.chapter)", () => {
    const sim = createSim(0, 2);
    const t = targetOf(sim.state);
    expect(sim.state).toMatchObject({ x: t.x, y: t.y, z: t.z + 40, yaw: 0, objective: 2, point: 0 });
    expect(sim.state.restored).toEqual(["clinic", "board"]);
  });

  it("idle input keeps the rider at rest", () => {
    const sim = createSim(0, 2);
    const before = { ...sim.state };
    run(sim, IDLE, 120);
    expect(sim.state.x).toBe(before.x);
    expect(sim.state.z).toBe(before.z);
    expect(sim.flight.speed).toBe(0);
  });

  it("full throttle follows speed = 42 (1 - exp(-t)) (exact exponential per step)", () => {
    const sim = createSim(0, 2, { floor: () => -100 });
    for (let k = 1; k <= 180; k++) {
      stepSim(sim, GO, STEP);
      expect(sim.flight.speed).toBeCloseTo(42 * (1 - Math.exp(-k * STEP)), 9);
    }
  });

  it("boost raises the top speed to 76 and drains energy; it locks out below 0.18", () => {
    const sim = createSim(0, 2, { floor: () => -100 });
    const boost: Input = { ...GO, boost: true };
    run(sim, boost, 60);
    expect(sim.flight.boosting).toBe(true);
    expect(sim.flight.energy).toBeLessThan(1);
    expect(sim.flight.boostMode).toBe("Turbo");
    run(sim, boost, 60 * 8);
    expect(sim.flight.boostLocked).toBe(true);
    expect(sim.flight.boosting).toBe(false);
  });

  it("steer right (D) lowers yaw; steer left raises it; reversing flips the sense", () => {
    const right = createSim(0, 2, { floor: () => -100 });
    run(right, GO, 30);
    run(right, { ...GO, steer: 1 }, 60);
    expect(right.state.yaw).toBeLessThan(0);
    const left = createSim(0, 2, { floor: () => -100 });
    run(left, GO, 30);
    run(left, { ...GO, steer: -1 }, 60);
    expect(left.state.yaw).toBeGreaterThan(0);
  });

  it("heading vector is (-sin yaw, -cos yaw): yaw 0 moves toward -z", () => {
    const sim = createSim(0, 2, { floor: () => -100 });
    const z0 = sim.state.z;
    run(sim, GO, 60);
    expect(sim.state.z).toBeLessThan(z0);
    expect(sim.state.x).toBeCloseTo(createSim(0, 2).state.x, 9);
  });

  it("lift climbs and the floor clamps the descent at floor + 2.4", () => {
    const up = createSim(0, 2, { floor: () => 0 });
    const y0 = up.state.y;
    run(up, { ...IDLE, lift: 1 }, 60);
    expect(up.state.y).toBeGreaterThan(y0 + 5);
    const down = createSim(0, 2, { floor: () => 1 });
    run(down, { ...IDLE, lift: -1 }, 600);
    expect(down.state.y).toBeCloseTo(3.4, 9);
  });

  it("clamps x to +-640, z to [-length - 50, 150] and y to the ceiling", () => {
    const sim = createSim(0, 2, { floor: () => -100 }, { x: 700, z: 400, y: 500 });
    stepSim(sim, IDLE, STEP);
    expect(sim.state.x).toBeCloseTo(640, 9);
    expect(sim.state.z).toBeCloseTo(150, 9);
    expect(sim.state.y).toBe(205);
  });

  it("brake decays speed faster than coasting", () => {
    const a = createSim(0, 2, { floor: () => -100 });
    const b = createSim(0, 2, { floor: () => -100 });
    run(a, GO, 120); run(b, GO, 120);
    run(a, IDLE, 60);
    run(b, { ...IDLE, brake: true }, 60);
    expect(b.flight.speed).toBeLessThan(a.flight.speed);
  });
});

describe("objective progression (original Mx / $T)", () => {
  it("advances a ride point when inside the radius and altitude band, then completes the objective", () => {
    const sim = createSim(0, 2, { floor: () => -100 });
    const o = objectiveOf(sim.state);
    for (let i = 0; i < o.points.length; i++) {
      const p = o.points[i] as { x: number; y: number; z: number };
      Object.assign(sim.state, { x: p.x, y: p.y, z: p.z, point: i });
      const ev = progressStep(sim.state, sim.flight, STEP, IDLE, sim.time);
      expect(ev?.type).toBe(i === o.points.length - 1 ? "complete" : "point");
    }
    expect(sim.state.objective).toBe(3);
    expect(sim.state.restored).toContain("departure");
  });

  it("does not advance outside the radius or outside the altitude band", () => {
    const sim = createSim(0, 2, { floor: () => -100 });
    const p = targetOf(sim.state);
    Object.assign(sim.state, { x: p.x + 100, y: p.y, z: p.z });
    expect(progressStep(sim.state, sim.flight, STEP, IDLE, 0)).toBeNull();
    Object.assign(sim.state, { x: p.x, y: p.y + 30, z: p.z });
    expect(progressStep(sim.state, sim.flight, STEP, IDLE, 0)).toBeNull();
  });

  it("care objectives need a hold of 2.5 s with the interact key and a slow rider", () => {
    const sim = createSim(0, 1, { floor: () => -100 });
    const p = targetOf(sim.state);
    Object.assign(sim.state, { x: p.x, y: p.y, z: p.z });
    const care: Input = { ...IDLE, interact: true };
    let steps = 0;
    let ev = null as ReturnType<typeof progressStep>;
    while (!ev && steps < 400) { ev = progressStep(sim.state, sim.flight, STEP, care, 0); steps++; }
    expect(ev?.type).toBe("complete");
    expect(steps * STEP).toBeGreaterThanOrEqual(2.5);
    expect(steps * STEP).toBeLessThan(2.6);
    expect(sim.state.scene).toBe("boarding");
    const noKey = createSim(0, 1);
    Object.assign(noKey.state, { x: p.x, y: p.y, z: p.z });
    expect(progressStep(noKey.state, noKey.flight, STEP, IDLE, 0)).toBeNull();
    expect(noKey.state.hold).toBe(0);
  });

  it("a portal's last point needs speed < 12 and interact; completing it queues the next chapter", () => {
    const sim = createSim(0, 3, { floor: () => -100 });
    const p = targetOf(sim.state);
    Object.assign(sim.state, { x: p.x, y: p.y, z: p.z });
    const fast = { ...sim.flight, speed: 20 };
    expect(progressStep(sim.state, fast, STEP, { ...IDLE, interact: true }, 0)).toBeNull();
    let ev = null as ReturnType<typeof progressStep>;
    for (let i = 0; i < 300 && !ev; i++) ev = progressStep(sim.state, sim.flight, STEP, { ...IDLE, interact: true }, 0);
    expect(ev?.type).toBe("complete");
    expect(sim.state.pendingChapter).toBe(1);
    expect(sim.state.scene).toBe("departure");
  });

  it("timed gates only count while open (time % period < open)", () => {
    const sim = createSim(2, 3, { floor: () => -100 });
    const o = objectiveOf(sim.state);
    const p = targetOf(sim.state);
    Object.assign(sim.state, { x: p.x, y: p.y, z: p.z });
    const closedAt = (o.open || 7) + 0.5;
    expect(progressStep(sim.state, sim.flight, STEP, IDLE, closedAt)).toBeNull();
    expect(progressStep(sim.state, sim.flight, STEP, IDLE, 0.5)?.type).toBe("point");
  });

  it("stepSim is deterministic for the same inputs", () => {
    const a = createSim(0, 2), b = createSim(0, 2);
    const inputs: Input[] = [GO, { ...GO, steer: 1 }, { ...GO, lift: 1 }, GO];
    for (let i = 0; i < 400; i++) { const inp = inputs[i % 4] as Input; stepSim(a, inp); stepSim(b, inp); }
    expect(a.state).toEqual(b.state);
    expect(a.flight).toEqual(b.flight);
  });
});

import { autopilot } from "../../../examples/silt-and-signal-port/autopilot";

describe("autopilot over whole objectives", () => {
  const fly = (chapter: number, objective: number, max = 5400): { sim: Sim; steps: number } => {
    const sim = createSim(chapter, objective, { floor: () => -100 });
    let steps = 0;
    while (steps < max && !sim.state.scene && !sim.state.completed && sim.state.objective === objective) { stepSim(sim, autopilot(sim), STEP); steps++; }
    return { sim, steps };
  };

  it("completes the departure ride", () => {
    const { sim, steps } = fly(0, 2);
    expect(sim.state.objective).toBe(3);
    expect(steps).toBeGreaterThan(300);
    expect(steps).toBeLessThan(1500);
  });

  it("brakes to a stop inside the radius and completes the care hold with the boarding scene", () => {
    const { sim, steps } = fly(0, 1);
    expect(sim.state.scene).toBe("boarding");
    expect(sim.state.restored).toContain("board");
    expect(steps).toBeLessThan(2000);
  });

  it("completes the portal at the chapter's end and queues the next chapter", () => {
    const { sim } = fly(0, 3);
    expect(sim.state.scene).toBe("departure");
    expect(sim.state.pendingChapter).toBe(1);
  });
});
