import { describe, expect, it } from "vitest";
import { CONFIG, IDLE, NumberSurgeSim, TRACE_COLUMNS, applyOp, opLabel, replay, wallFloor, wallHp, wallT, type Input } from "../../../apps/showcase-number-surge/src/sim";
import { Autopilot } from "../../../apps/showcase-number-surge/src/autopilot";

const START: Input = { ...IDLE, start: true };

const running = (seed = 3): NumberSurgeSim => {
  const sim = new NumberSurgeSim(seed);
  for (let i = 0; i < 30; i += 1) sim.advance(IDLE);
  sim.advance(START);
  return sim;
};

const script = (n: number): Input[] => {
  const pilot = new Autopilot();
  const sim = new NumberSurgeSim(11);
  const inputs: Input[] = [];
  for (let i = 0; i < n; i += 1) {
    const input = pilot.next(sim, i);
    inputs.push(input);
    sim.advance(input);
  }
  return inputs;
};

describe("number-surge sim: determinism and contract", () => {
  it("double replay is identical; different seeds differ", () => {
    const inputs = script(900);
    const a = replay(11, 30, inputs).trace;
    const b = replay(11, 30, inputs).trace;
    const c = replay(12, 30, inputs).trace;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(900);
    expect(a[0]).toHaveLength(TRACE_COLUMNS.length);
  });

  it("all gameplay randomness comes from the counted stream (idle splash draws none)", () => {
    const sim = new NumberSurgeSim(1);
    const before = sim.rngCount;
    for (let i = 0; i < 60; i += 1) sim.advance(IDLE);
    expect(sim.rngCount).toBe(before);
    sim.advance(START);
    expect(sim.rngCount).toBeGreaterThan(before);
  });

  it("pools are fixed and never grow", () => {
    const sim = running();
    for (let i = 0; i < 3000; i += 1) sim.advance(IDLE);
    expect(sim.o.rows).toHaveLength(CONFIG.GATES / 2);
    expect(sim.o.gates).toHaveLength(CONFIG.GATES);
    expect(sim.o.walls).toHaveLength(CONFIG.WALLS);
    expect(sim.o.powerups).toHaveLength(CONFIG.POWERUPS);
    expect(sim.o.particles).toHaveLength(CONFIG.PARTICLES);
    expect(sim.o.shards).toHaveLength(CONFIG.SHARDS);
    expect(sim.o.gates.filter((g) => g.active).length).toBeLessThanOrEqual(CONFIG.GATES);
  });
});

describe("number-surge sim: ops and rows", () => {
  it("applyOp implements +n, ×2, −n, ÷2-ceil with the ≥1 clamp", () => {
    expect(applyOp(10, "add", 25)).toBe(35);
    expect(applyOp(10, "mul2", 0)).toBe(20);
    expect(applyOp(10, "sub", 50)).toBe(1);
    expect(applyOp(11, "div2", 0)).toBe(6);
    expect(applyOp(1, "sub", 5)).toBe(1);
    expect(applyOp(CONFIG.NUMBER_CAP, "mul2", 0)).toBe(CONFIG.NUMBER_CAP);
    expect(opLabel("add", 7)).toBe("+7");
    expect(opLabel("mul2", 0)).toBe("×2");
    expect(opLabel("sub", 9)).toBe("−9");
    expect(opLabel("div2", 0)).toBe("÷2");
  });

  it("every spawned row has at least one non-negative op and +n/−n stay in 5..50", () => {
    const sim = running(21);
    const seen = new Set<object>();
    for (let i = 0; i < 6000; i += 1) {
      sim.advance(IDLE);
      for (let r = 0; r < sim.o.rows.length; r += 1) {
        const row = sim.o.rows[r]!;
        if (!row.active || seen.has(row) && row.resolved) continue;
        const a = sim.o.gates[r * 2]!;
        const b = sim.o.gates[r * 2 + 1]!;
        if (!a.active || !b.active) continue;
        const key = `${r}:${a.kind}${a.n}:${b.kind}${b.n}:${Math.round(row.z + sim.o.distance)}`;
        if (seen.has(key as unknown as object)) continue;
        seen.add(key as unknown as object);
        const nonNeg = (k: string): boolean => k === "add" || k === "mul2";
        expect(nonNeg(a.kind) || nonNeg(b.kind)).toBe(true);
        for (const g of [a, b]) {
          if (g.kind === "add" || g.kind === "sub") {
            expect(g.n).toBeGreaterThanOrEqual(5);
            expect(g.n).toBeLessThanOrEqual(50);
          }
          expect(CONFIG.GATE_LANES).toContain(g.x);
        }
      }
      if (sim.o.phase === "gameOver") break;
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it("C16: a row resolves exactly once against the nearest gate", () => {
    const sim = running(5);
    let goodBefore = 0;
    let resolutions = 0;
    const counted = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      sim.advance(IDLE);
      for (let r = 0; r < sim.o.rows.length; r += 1) {
        const row = sim.o.rows[r]!;
        if (row.active && row.resolved && !counted.has(r)) {
          counted.add(r);
          resolutions += 1;
        }
        if (row.active && !row.resolved) counted.delete(r);
      }
      const total = sim.o.events.pickGood + sim.o.events.pickBad;
      expect(total).toBeLessThanOrEqual(resolutions);
      goodBefore = sim.o.events.pickGood;
      if (sim.o.phase !== "playing") break;
    }
    expect(resolutions).toBeGreaterThan(3);
    expect(goodBefore + sim.o.events.pickBad).toBeLessThanOrEqual(resolutions);
  });
});

describe("number-surge sim: scoring, walls, death, restart", () => {
  it("autopilot scores, smashes walls and persists the biggest smash in state", () => {
    const sim = new NumberSurgeSim(11);
    const pilot = new Autopilot();
    for (let i = 0; i < 6000 && (i === 0 || sim.o.phase === "playing"); i += 1) sim.advance(pilot.next(sim, i));
    expect(sim.o.score).toBeGreaterThan(0);
    expect(sim.o.wallsSmashed).toBeGreaterThanOrEqual(1);
    expect(sim.o.biggestSmash).toBeGreaterThanOrEqual(40);
    expect(sim.o.events.smash).toBe(sim.o.wallsSmashed);
    expect(sim.o.goodPicks).toBeGreaterThan(sim.o.badPicks);
    expect(sim.o.mult).toBeLessThanOrEqual(CONFIG.MAX_MULT);
  });

  it("a too-small number without a shield bursts then ends the run; shield consumes instead", () => {
    const doomed = running(7);
    doomed.o.number = 1;
    doomed.o.walls[0]!.active = true;
    doomed.o.walls[0]!.z = 0.5;
    doomed.o.walls[0]!.hp = 50;
    doomed.advance(IDLE);
    expect(doomed.o.phase).toBe("playing");
    doomed.advance(IDLE);
    expect(doomed.o.phase).toBe("bursting");
    expect(doomed.o.events.wallFail).toBe(1);
    for (let i = 0; i < 120 && doomed.o.phase !== "gameOver"; i += 1) doomed.advance(IDLE);
    expect(doomed.o.phase).toBe("gameOver");
    expect(doomed.o.events.gameover).toBe(1);

    const guarded = running(7);
    guarded.o.number = 1;
    guarded.o.shieldActive = true;
    guarded.o.walls[0]!.active = true;
    guarded.o.walls[0]!.z = 0.5;
    guarded.o.walls[0]!.hp = 50;
    guarded.advance(IDLE);
    guarded.advance(IDLE);
    expect(guarded.o.wallsPassed).toBe(1);
    expect(guarded.o.wallsSmashed).toBe(0);
    expect(guarded.o.shieldActive).toBe(false);
    expect(guarded.o.events.wallBlock).toBe(1);
    expect(guarded.o.phase).toBe("playing");

    const smasher = running(7);
    smasher.o.number = 80;
    smasher.o.walls[0]!.active = true;
    smasher.o.walls[0]!.z = 0.5;
    smasher.o.walls[0]!.hp = 50;
    smasher.advance(IDLE);
    smasher.advance(IDLE);
    expect(smasher.o.number).toBe(30);
    expect(smasher.o.score).toBe(500);
    expect(smasher.o.wallsSmashed).toBe(1);
    expect(smasher.o.biggestSmash).toBe(50);
    expect(smasher.o.shards.filter((s) => s.active).length).toBeGreaterThan(0);
  });

  it("wall HP rules: distance floor, worst/best blend, always beatable by best picks while t < 1", () => {
    expect(wallFloor(0, 0)).toBe(CONFIG.WALL_BASE);
    expect(wallFloor(3, 0)).toBe(Math.round(CONFIG.WALL_BASE * CONFIG.WALL_GROWTH ** 3));
    expect(wallFloor(3, 0.99)).toBeGreaterThan(wallFloor(3, 0));
    for (let k = 1; k < 20; k += 1) {
      expect(wallFloor(k, 0)).toBeGreaterThan(wallFloor(k - 1, 0.99));
      expect(wallT(k)).toBeGreaterThanOrEqual(wallT(k - 1));
      expect(wallT(k)).toBeLessThan(1);
    }
    // Floor dominates when the reachable numbers are small.
    expect(wallHp(2, 170, 20, 60)).toBe(170);
    // Otherwise the wall sits between the worst-pick and best-pick numbers.
    const hp = wallHp(1, 50, 400, 2000);
    expect(hp).toBe(Math.ceil(400 + wallT(1) * 1600));
    expect(hp).toBeGreaterThan(400);
    expect(hp).toBeLessThan(2000);
    // No choice to make: the best (= worst) path still clears it.
    expect(wallHp(4, 10, 900, 900)).toBe(899);
  });

  it("spawned walls respect the floor and grow with distance", () => {
    const sim = new NumberSurgeSim(11);
    const pilot = new Autopilot();
    const hps: number[] = [];
    const seen = new Set<object>();
    for (let i = 0; i < 9000 && (i === 0 || sim.o.phase === "playing"); i += 1) {
      sim.advance(pilot.next(sim, i));
      for (const w of sim.o.walls) {
        if (w.active && !seen.has(w)) {
          seen.add(w);
          hps.push(w.hp);
        }
        if (!w.active) seen.delete(w);
      }
      if (hps.length >= 4) break;
    }
    expect(hps.length).toBeGreaterThanOrEqual(3);
    for (const [i, hp] of hps.entries()) expect(hp).toBeGreaterThanOrEqual(wallFloor(i, 0));
  });

  const playOut = (seed: number, policy: "idle" | "greedy", maxSeconds = 600): { seconds: number; phase: string; peak: number } => {
    const sim = new NumberSurgeSim(seed);
    const pilot = new Autopilot();
    sim.advance(START);
    let peak = sim.o.number;
    let steps = 0;
    for (; steps < maxSeconds * 60 && sim.o.phase === "playing"; steps += 1) {
      const input = policy === "greedy" ? pilot.next(sim, steps + 1) : steps === 0 ? { ...IDLE, dx: 5 } : IDLE;
      sim.advance(input);
      peak = Math.max(peak, sim.o.number);
    }
    return { seconds: steps / 60, phase: sim.o.phase, peak };
  };

  it("idle play (parked in one lane) loses within about a minute and never hits the cap", () => {
    const runs = Array.from({ length: 24 }, (_, i) => playOut(i + 1, "idle"));
    for (const run of runs) {
      expect(run.phase).not.toBe("playing");
      expect(run.seconds).toBeLessThan(120);
      expect(run.peak).toBeLessThan(CONFIG.NUMBER_CAP);
    }
    const underMinute = runs.filter((r) => r.seconds <= 60).length;
    expect(underMinute / runs.length).toBeGreaterThanOrEqual(0.75);
  });

  it("best-gate play lasts much longer than idle but still ends, and rarely reaches the cap", () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const greedy = seeds.map((s) => playOut(s, "greedy"));
    const idle = seeds.map((s) => playOut(s, "idle"));
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (const run of greedy) expect(run.phase).not.toBe("playing");
    expect(mean(greedy.map((r) => r.seconds))).toBeGreaterThan(2 * mean(idle.map((r) => r.seconds)));
    expect(greedy.filter((r) => r.peak >= CONFIG.NUMBER_CAP).length).toBeLessThanOrEqual(1);
  });

  it("×2 gates are the rare draw and +n/−n ranges stay bounded", () => {
    const sim = running(31);
    const counts: Record<string, number> = { add: 0, mul2: 0, sub: 0, div2: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i += 1) {
      sim.advance(IDLE);
      if (sim.o.phase === "gameOver") sim.begin();
      for (let r = 0; r < sim.o.rows.length; r += 1) {
        const row = sim.o.rows[r]!;
        if (!row.active || row.resolved) continue;
        const key = `${r}:${Math.round(row.z + sim.o.distance)}:${sim.o.events.gameover}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const g of [sim.o.gates[r * 2]!, sim.o.gates[r * 2 + 1]!]) if (g.active) counts[g.kind]! += 1;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(200);
    expect(counts.mul2! / total).toBeLessThan(0.12);
    expect(counts.mul2!).toBeGreaterThan(0);
    expect(counts.add!).toBeGreaterThan(counts.sub!);
  });

  it("C4: begin re-centres steering target AND drag state", () => {
    const sim = running(9);
    sim.advance({ ...IDLE, down: true, dx: 1.2 });
    for (let i = 0; i < 60; i += 1) sim.advance({ ...IDLE, down: true });
    expect(Math.abs(sim.o.laneOffset)).toBeGreaterThan(0.5);
    sim.begin();
    expect(sim.o.laneOffset).toBe(0);
    expect(sim.o.number).toBe(CONFIG.START_NUMBER);
    expect(sim.o.score).toBe(0);
    expect(sim.o.distance).toBe(0);
    // Drag state cleared: a held pointer without a fresh down must not keep steering.
    for (let i = 0; i < 60; i += 1) sim.advance({ ...IDLE, down: true });
    expect(sim.o.laneOffset).toBe(0);
  });

  it("steering clamps to the lane limit and eases toward the drag target", () => {
    const sim = running(2);
    sim.advance({ ...IDLE, down: true, dx: 10 });
    for (let i = 0; i < 120; i += 1) sim.advance({ ...IDLE, down: true });
    expect(sim.o.laneOffset).toBeLessThanOrEqual(CONFIG.LANE_LIMIT);
    expect(sim.o.laneOffset).toBeGreaterThan(1.4);
    sim.advance({ ...IDLE, up: true });
    sim.advance({ ...IDLE, dx: -100 });
    for (let i = 0; i < 120; i += 1) sim.advance(IDLE);
    expect(sim.o.laneOffset).toBeGreaterThanOrEqual(-CONFIG.LANE_LIMIT);
  });

  it("popups keep the last 64 with monotonic seq across restarts", () => {
    const sim = running(4);
    const pilot = new Autopilot();
    for (let i = 0; i < 4000; i += 1) {
      sim.advance(pilot.next(sim, i));
      if (sim.o.phase === "gameOver") sim.begin();
    }
    expect(sim.popups.length).toBeLessThanOrEqual(64);
    for (let i = 1; i < sim.popups.length; i += 1) {
      expect(sim.popups[i]!.seq).toBeGreaterThan(sim.popups[i - 1]!.seq);
    }
  });

  it("milestones add the bonus and fire the milestone event", () => {
    const sim = running(6);
    sim.o.score = 749;
    // A good pick worth ≥1 point crosses 750.
    const pilot = new Autopilot();
    for (let i = 0; i < 600 && sim.o.events.milestone === 0; i += 1) sim.advance(pilot.next(sim, i + 1));
    expect(sim.o.events.milestone).toBeGreaterThanOrEqual(1);
    expect(sim.o.score).toBeGreaterThanOrEqual(850);
  });
});