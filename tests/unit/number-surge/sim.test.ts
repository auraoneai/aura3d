import { describe, expect, it } from "vitest";
import { CONFIG, IDLE, NumberSurgeSim, TRACE_COLUMNS, applyOp, opLabel, replay, type Input } from "../../../apps/showcase-number-surge/src/sim";
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

  it("wall HP follows 40 + 30·wallsPassed + floor(rng·20)", () => {
    const sim = new NumberSurgeSim(11);
    const pilot = new Autopilot();
    const hps: number[] = [];
    let passed = 0;
    for (let i = 0; i < 9000 && (i === 0 || sim.o.phase === "playing"); i += 1) {
      sim.advance(pilot.next(sim, i));
      for (const w of sim.o.walls) {
        if (w.active && !hps.includes(w.hp)) hps.push(w.hp);
      }
      passed = sim.o.wallsPassed;
      if (passed >= 3) break;
    }
    expect(hps.length).toBeGreaterThanOrEqual(2);
    for (const [i, hp] of hps.entries()) {
      expect(hp).toBeGreaterThanOrEqual(40 + 30 * i);
      expect(hp).toBeLessThanOrEqual(40 + 30 * i + 19);
    }
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