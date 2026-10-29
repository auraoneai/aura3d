import { describe, expect, it } from "vitest";
import { DROP_MAX, DROP_MIN, DROP_RADIUS, JOB_SECONDS, SHIFT_SECONDS, createShift, deliveryScore, dropoffFor, formatClock, recordBest, stepShift, type ShiftEvent } from "../../../examples/drift-and-deliver-port/shift";
import { buildBlocks, buildBuildings, buildingSolids } from "../../../examples/drift-and-deliver-port/world";

/** Audit rows C3 (no end state) and C14 (no delivery loop, no drift score). */
const DT = 1 / 60;
const idle = { x: 30.1, z: -120, speed: 0, drifting: false };
const ctx = { combo: 0, collected: 0, total: 174 };
const run = (s: ReturnType<typeof createShift>, steps: number, car = idle, c = ctx): ShiftEvent[] => {
  const out: ShiftEvent[] = [];
  for (let i = 0; i < steps; i++) out.push(...stepShift(s, DT, car, c));
  return out;
};

describe("courier shift (C3)", () => {
  it("lasts three minutes, then ends once with reason 'time'", () => {
    const s = createShift();
    expect(s.length).toBe(SHIFT_SECONDS);
    const events = run(s, SHIFT_SECONDS * 60 + 10);
    const over = events.filter((e) => e.kind === "over");
    expect(over).toEqual([{ kind: "over", reason: "time" }]);
    expect(s.over).toBe(true);
    expect(s.timeLeft).toBe(0);
    expect(run(s, 10)).toEqual([]);
  });

  it("ends early with 'cleared' when every pickup is collected", () => {
    const s = createShift();
    const events = run(s, 2, idle, { combo: 3, collected: 174, total: 174 });
    expect(events.at(-1)).toEqual({ kind: "over", reason: "cleared" });
    expect(s.bestStreak).toBe(3);
  });

  it("formats the HUD clock", () => {
    expect(formatClock(180)).toBe("3:00");
    expect(formatClock(61.2)).toBe("1:02");
    expect(formatClock(0)).toBe("0:00");
  });

  it("keeps the best score in storage and reports a new best", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(recordBest(storage, "k", 500)).toEqual({ best: 500, isNew: true });
    expect(recordBest(storage, "k", 300)).toEqual({ best: 500, isNew: false });
    expect(recordBest(null, "k", 10)).toEqual({ best: 10, isNew: true });
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(recordBest(broken, "k", 7)).toEqual({ best: 7, isNew: true });
  });
});

describe("delivery jobs and drift score (C14)", () => {
  it("opens a job on the first step, 140 to 320 m away on a street centre line, clear of every building", () => {
    const s = createShift();
    const [first] = run(s, 1);
    expect(first?.kind).toBe("job");
    const solids = buildingSolids(buildBuildings(buildBlocks()));
    for (let n = 1; n <= 40; n++) {
      const p = dropoffFor(n, idle);
      const d = Math.hypot(p.x - idle.x, p.z - idle.z);
      expect(d).toBeGreaterThanOrEqual(DROP_MIN);
      expect(d).toBeLessThanOrEqual(DROP_MAX);
      expect(solids.some((b) => Math.abs(p.x - b.x) < b.hw + DROP_RADIUS && Math.abs(p.z - b.z) < b.hd + DROP_RADIUS)).toBe(false);
    }
  });

  it("pays 300 + 10 per second left on arrival and opens the next job", () => {
    const s = createShift();
    run(s, 1);
    const job = s.job!;
    run(s, 10 * 60);
    const at = { x: job.x, z: job.z + 1, speed: 5, drifting: false };
    const events = run(s, 1, at);
    const done = events.find((e) => e.kind === "delivered");
    expect(done && done.kind === "delivered" && done.score).toBe(deliveryScore(JOB_SECONDS - 10 - 2 * DT));
    expect(deliveryScore(39.5)).toBe(690);
    expect(s.deliveries).toBe(1);
    expect(s.job!.n).toBe(2);
  });

  it("a job left too long is missed and replaced", () => {
    const s = createShift();
    run(s, 1);
    const events = run(s, JOB_SECONDS * 60 + 2);
    expect(events.some((e) => e.kind === "missed")).toBe(true);
    expect(s.missed).toBe(1);
    expect(s.job!.n).toBe(2);
  });

  it("drifting builds a chain that is banked 0.6 s after the drift ends", () => {
    const s = createShift();
    run(s, 120, { ...idle, speed: 20, drifting: true });
    expect(s.drift).toBeCloseTo(20 * 2 * 1.5, 6);
    const early = run(s, 30);
    expect(early.some((e) => e.kind === "drift")).toBe(false);
    const banked = run(s, 10).filter((e) => e.kind === "drift");
    expect(banked).toEqual([{ kind: "drift", score: 60 }]);
    expect(s.drift).toBe(0);
  });
});
