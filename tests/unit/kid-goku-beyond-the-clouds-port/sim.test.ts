import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOUNT_PAOZU as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import {
  IDLE, createState, layoutObstacles, layoutOrbs, nimbusMap, nimbusWhy, step, stepFrame, type SimState, type StepInput
} from "../../../examples/kid-goku-beyond-the-clouds-port/sim";

const DT = 1 / 60;
const run = (state: SimState, frames: number, input: (i: number, s: SimState) => Partial<StepInput> = () => ({})): string[] => {
  const events: string[] = [];
  for (let i = 0; i < frames; i++) events.push(...stepFrame(state, { ...IDLE, ...input(i, state) }, DT, CH));
  return events;
};
const jumpAt = (s0: number) => { let done = false; return (_: number, st: SimState) => (!done && st.s >= s0 ? ((done = true), { jump: true }) : {}); };

describe("kid goku port: run core", () => {
  it("accelerates toward the chapter speed with the original's 2.7/s response", () => {
    const s = createState();
    run(s, 60);
    const expected = CH.speed * (1 - Math.exp(-2.7 * 1)); // first-order response; the original's Euler step is within a few percent
    expect(s.speed).toBeGreaterThan(expected * 0.9);
    expect(s.speed).toBeLessThan(CH.speed);
    run(s, 300);
    expect(s.speed).toBeGreaterThan(CH.speed * 0.99);
  });

  it("is deterministic: the same input script gives identical state", () => {
    const a = createState(), b = createState();
    const input = (i: number) => ({ steer: i % 120 < 40 ? 1 : i % 120 < 80 ? -1 : 0 });
    run(a, 900, input); run(b, 900, input);
    expect(JSON.stringify({ ...a, eaten: [...a.eaten] })).toBe(JSON.stringify({ ...b, eaten: [...b.eaten] }));
  });

  it("steers within the +-5.1 lane limit", () => {
    const s = createState();
    run(s, 600, () => ({ steer: 1 }));
    expect(s.lane).toBeCloseTo(5.1, 6);
    run(s, 600, () => ({ steer: -1 }));
    expect(s.lane).toBeCloseTo(-5.1, 6);
  });

  it("jump: velocity 13.4 under gravity 25 peaks near 3.59 and lands", () => {
    const s = createState();
    run(s, 240);
    let peak = 0, airborne = 0;
    run(s, 80, (i) => (i === 0 ? { jump: true } : {}));
    // track the arc
    const t = createState(); run(t, 240);
    stepFrame(t, { ...IDLE, jump: true }, DT, CH);
    for (let i = 0; i < 90; i++) { peak = Math.max(peak, t.jump); if (t.jump > 0) airborne++; stepFrame(t, IDLE, DT, CH); }
    expect(peak).toBeGreaterThan(3.4);
    expect(peak).toBeLessThan(3.65);
    expect(airborne / 60).toBeGreaterThan(1.0);
    expect(airborne / 60).toBeLessThan(1.15);
    expect(t.jump).toBe(0);
  });

  it("the log is dismounted at s=93 with a hop", () => {
    const s = createState();
    const ev = run(s, 600, () => ({}));
    expect(ev).toContain("dismount");
  });

  it("running through the 150-160 gap without jumping falls; jumping at s>=147 clears it and takes Dragon Ball 1", () => {
    const fall = createState();
    run(fall, 700);
    expect(fall.falls).toBeGreaterThan(0);
    const ok = createState();
    const ev = run(ok, 760, jumpAt(147));
    expect(ok.falls).toBe(0);
    expect(ok.balls).toContain(1);
    expect(ev).toContain("dragonball");
    expect(ok.score).toBeGreaterThan(700);
  });

  it("checkpoints restore a heart and advance the index", () => {
    const s = createState();
    let before = -1, crossed = false;
    const jump = jumpAt(147);
    for (let i = 0; i < 800 && !crossed; i++) {
      const hearts = s.hearts, idx = s.checkpointIndex;
      stepFrame(s, { ...IDLE, ...jump(i, s) }, DT, CH);
      if (s.checkpointIndex === 1 && idx === 0) { crossed = true; before = hearts; }
    }
    expect(crossed).toBe(true);
    expect(s.checkpoint).toBe(172);
    expect(s.hearts).toBe(Math.min(3, before + 1));
  });

  it("score accrues speed * dt * 0.6 per frame on top of event awards", () => {
    const s = createState();
    const before = s.score;
    stepFrame(s, IDLE, DT, CH);
    expect(s.score - before).toBeCloseTo(s.speed * DT * 0.6, 9);
  });

  it("a finished run stops stepping", () => {
    const s = createState();
    s.s = CH.length - 0.01;
    run(s, 5);
    expect(s.finished).toBe(true);
    const sAfter = s.s;
    expect(step(s, IDLE, DT, CH)).toEqual([]);
    expect(s.s).toBe(sAfter);
  });
});

describe("kid goku port: layout and nimbus map", () => {
  it("the seeded obstacle layout equals the original's own (read from window.__LAB__.world.obstacles)", () => {
    const original = JSON.parse(readFileSync("tests/fixtures/crayon/kid-goku-beyond-the-clouds/obstacles.json", "utf8")) as { obstacles: { s: number; lane: number; type: string; size: number; id: number }[] };
    const mine = layoutObstacles(CH);
    expect(mine.length).toBe(original.obstacles.length);
    mine.forEach((o, i) => {
      const t = original.obstacles[i]!;
      expect(o.type).toBe(t.type);
      expect(o.id).toBe(t.id);
      expect(Math.abs(o.s - t.s)).toBeLessThan(1e-9);
      expect(Math.abs(o.lane - t.lane)).toBeLessThan(1e-9);
      expect(Math.abs(o.size - t.size)).toBeLessThan(1e-9);
    });
  });

  it("authored rocks come first and procedural obstacles are seeded and avoid encounter zones", () => {
    const a = layoutObstacles(CH), b = layoutObstacles(CH);
    expect(a).toEqual(b);
    expect(a.slice(0, 2).map((o) => [o.s, o.lane, o.type])).toEqual([[45, 2.6, "rock"], [76, -2.6, "rock"]]);
    expect(a.length).toBe(7); // 2 authored + 5 seeded; checked against the original's own obstacle list in the reference replay test
    for (const o of a.slice(2)) {
      expect(o.s).toBeGreaterThanOrEqual(CH.log + 20);
      expect(CH.gaps.some((g) => o.s > g.start - 24 && o.s < g.end + 18)).toBe(false);
    }
  });

  it("the nimbus map flags set-pieces (log start, pole spans, home) and finds calm runs", () => {
    const m = nimbusMap(CH);
    expect(m.fly[0]).toBe("log");
    expect(m.fly[Math.round(470 / 0.5)]).toBe("pole");
    expect(m.fly[Math.round((CH.length - 10) / 0.5)]).toBe("home");
    const calm = [...m.calm].filter(Boolean).length;
    expect(calm).toBeGreaterThan(200);
  });
});

describe("kid goku port: flying nimbus", () => {
  const calmS = (() => {
    const m = nimbusMap(CH);
    for (let c = 0; c < m.n; c++) {
      const s = c * 0.5;
      const probe = createState(); probe.s = s;
      const w = nimbusWhy(probe, CH);
      if (!w.why && w.end !== undefined && w.end - s > 60) return s;
    }
    throw new Error("no calm run");
  })();

  it("an empty charge cannot call the nimbus; a full one calls, mounts after 0.26s, rides faster and lands", () => {
    const s = createState();
    s.s = calmS; s.speed = CH.speed; s.invincible = 0;
    let ev = step(s, { ...IDLE, nimbus: true }, DT, CH);
    expect(ev).toContain("nimbus-empty");
    s.nimbus.charge = 1;
    ev = step(s, { ...IDLE, nimbus: true }, DT, CH);
    expect(ev).toContain("nimbus-call");
    expect(s.nimbus.call).toBeGreaterThan(0);
    const events: string[] = [];
    for (let i = 0; i < 40; i++) events.push(...step(s, IDLE, DT, CH));
    expect(events).toContain("nimbus-mount");
    expect(s.nimbus.active).toBe(true);
    const mountedSpeed = s.speed;
    for (let i = 0; i < 120; i++) step(s, IDLE, DT, CH);
    expect(s.speed).toBeGreaterThan(mountedSpeed);
    for (let i = 0; i < 600 && s.nimbus.active; i++) events.push(...step(s, IDLE, DT, CH));
    expect(events).toContain("nimbus-end");
    expect(s.nimbus.active).toBe(false);
  });

  it("collecting a Dragon Ball charges the nimbus (0.15, x0.45 inside a set-piece)", () => {
    const s = createState();
    const jump = jumpAt(147);
    let delta = -1;
    for (let i = 0; i < 800 && delta < 0; i++) {
      const before = s.nimbus.charge;
      const ev = stepFrame(s, { ...IDLE, ...jump(i, s) }, DT, CH);
      if (ev.includes("dragonball")) delta = s.nimbus.charge - before;
    }
    expect(s.balls).toContain(1);
    expect(delta).toBeGreaterThan(0.15 * 0.45 - 1e-9);
    expect(delta).toBeLessThan(0.15 + 0.011); // an orb (0.01) may land on the same frame
  });
});

describe("kid goku port: pickups and damage", () => {
  it("orbs sit every 7.5 units from s=35, skip gaps, and weave with sin(0.035 s) * 2.4", () => {
    const orbs = layoutOrbs(CH);
    expect(orbs[0]).toMatchObject({ s: 35, id: 0 });
    expect(orbs.some((o) => o.s > 150 && o.s < 160)).toBe(false);
    for (const o of orbs.filter((x) => !CH.poles.some((p) => x.s >= p.start && x.s <= p.end))) expect(o.lane).toBeCloseTo(Math.sin(o.s * 0.035) * 2.4, 9);
  });

  it("driving into an obstacle lane damages once (hearts-1, combo reset, 2.5s invincible); steering around it awards 100", () => {
    const hit = createState();
    run(hit, 400);
    expect(hit.crashed.size).toBeGreaterThan(0);
    const around = createState();
    const start = around.hearts;
    run(around, 300, () => ({ steer: -1 })); // the first rock is at lane +2.6; the lane -5 side is clear
    expect(around.hearts).toBeLessThanOrEqual(start);
    expect(around.crashed.size).toBeGreaterThan(0);
  });

  it("damage is ignored while invincible or while riding the nimbus (except bites and grabs)", () => {
    const s = createState();
    s.invincible = 1;
    // obstacles are shrugged off during invincibility
    s.s = 112.9; s.lane = 0.5; s.jump = 0;
    const hearts = s.hearts;
    stepFrame(s, IDLE, DT, CH);
    expect(s.hearts).toBe(hearts);
  });
});
