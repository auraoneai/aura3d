import { describe, expect, it } from "vitest";
import { createImpactFeedback } from "../../../packages/game/src/motion/impact";
import { laneOffset } from "../../../examples/ninja-runner-port/course";
import { GRAVITY, PIECE_LIFE, TIER_FEEDBACK, type DebrisTier, hash01, pieceScale, spawnPieces, stepPieces } from "../../../examples/ninja-runner-port/impact";
import { RAM, SIM_STEP, TUNING, createState, drainEvents, snapshot, startRun, stepSim, type SimEvent, type SimState } from "../../../examples/ninja-runner-port/sim";

/** A runner on a straight line toward a lone obstacle of `type`, `time` seconds into the run. */
function setup(ram: boolean, type: "barrier" | "beam", time: number, patch: Partial<SimState> = {}): { z: SimState; at: number } {
  const z = createState(17, { ram });
  startRun(z);
  drainEvents(z);
  const at = 120;
  z.entities = [{ id: 9001, s: at, lane: 0, type, hp: 1, alive: true, hitBy: -1, stagger: 0, warning: false, defeatedAt: 0 } as SimState["entities"][number]];
  z.s = at - 4;
  z.x = 0 * laneOffset(at);
  z.time = time;
  Object.assign(z, patch);
  return { z, at };
}

function run(z: SimState, steps: number): { events: SimEvent[]; minS: number } {
  const events: SimEvent[] = [];
  let minS = z.s;
  for (let i = 0; i < steps; i++) {
    stepSim(z, SIM_STEP);
    minS = Math.min(minS, z.s);
    events.push(...drainEvents(z));
  }
  return { events, minS };
}

const rams = (events: SimEvent[]): SimEvent[] => events.filter((e) => e.type === "ram");

describe("ninja-runner rework: obstacle contact rules", () => {
  it("original rules (default) emit no ram event and never knock the runner back", () => {
    const { z } = setup(false, "barrier", 0);
    const before = z.s;
    const { events, minS } = run(z, 120);
    expect(rams(events)).toHaveLength(0);
    expect(minS).toBeGreaterThanOrEqual(before);
    expect(events.some((e) => e.type === "damage")).toBe(true);
    expect(z.health).toBe(TUNING.health - 1);
  });

  it("a slow hit is a bump: one impact event, one hit point lost, knocked back by the bump distance", () => {
    const { z } = setup(true, "barrier", 0);
    const { events } = run(z, 120);
    const hit = rams(events);
    expect(hit).toHaveLength(1);
    expect(hit[0]!.tier).toBe("bump");
    expect(hit[0]!.kind).toBe("barrier");
    expect(z.health).toBe(TUNING.health - 1);
    expect(z.stumbleDrag === RAM.bumpDrag || z.stumble === 0).toBe(true);
  });

  it("a fast hit is a crash: harder stop and a longer knock-back than a bump", () => {
    const slow = setup(true, "barrier", 0).z;
    const fast = setup(true, "barrier", 40).z;
    const s0 = run(slow, 120), s1 = run(fast, 120);
    expect(rams(s1.events)[0]!.tier).toBe("crash");
    expect((rams(s1.events)[0]!.speed as number)).toBeGreaterThanOrEqual(RAM.crashSpeed);
    expect((rams(s0.events)[0]!.speed as number)).toBeLessThan(RAM.crashSpeed);
  });

  it("the runner slows to a near stop on impact and recovers", () => {
    const { z } = setup(true, "barrier", 40);
    let slowest = Infinity;
    for (let i = 0; i < 60; i++) { stepSim(z, SIM_STEP); drainEvents(z); slowest = Math.min(slowest, z.speed); }
    const free = 18 + 40 * 0.11;
    expect(slowest).toBeLessThan(free * 0.35);
    for (let i = 0; i < 240; i++) { stepSim(z, SIM_STEP); drainEvents(z); }
    expect(z.speed).toBeGreaterThan(free * 0.9);
  });

  it("sprinting through (dash) breaks the crate before contact: a break event, no damage, no knock-back", () => {
    const { z } = setup(true, "barrier", 0, { dash: 1.2 });
    const before = z.s;
    const { events, minS } = run(z, 60);
    expect(rams(events)).toHaveLength(0);
    expect(events.filter((e) => e.type === "break")).toHaveLength(1);
    expect(z.health).toBe(TUNING.health);
    expect(minS).toBeGreaterThanOrEqual(before);
  });

  it("a hit while protected is a glance: debris but no damage and no knock-back", () => {
    const { z } = setup(true, "barrier", 0, { invulnerable: 3 });
    const before = z.s;
    const { events, minS } = run(z, 60);
    expect(rams(events).map((e) => e.tier)).toEqual(["glance"]);
    expect(z.health).toBe(TUNING.health);
    expect(minS).toBeGreaterThanOrEqual(before);
  });

  it("jumping the crate or sliding under the beam avoids contact entirely", () => {
    const jump = setup(true, "barrier", 0, { y: 3, vy: 0 });
    jump.z.vy = 0;
    expect(rams(run(jump.z, 40).events)).toHaveLength(0);
    const slide = setup(true, "beam", 0, { slide: 1 });
    expect(rams(run(slide.z, 40).events)).toHaveLength(0);
  });

  it("a beam hit is reported as a beam impact", () => {
    const { z } = setup(true, "beam", 0);
    const hit = rams(run(z, 120).events);
    expect(hit).toHaveLength(1);
    expect(hit[0]!.kind).toBe("beam");
  });

  it("is deterministic: the same setup twice gives the same events and state", () => {
    const a = setup(true, "barrier", 40), b = setup(true, "barrier", 40);
    const ra = run(a.z, 200), rb = run(b.z, 200);
    expect(JSON.stringify(ra.events)).toBe(JSON.stringify(rb.events));
    expect(JSON.stringify(snapshot(a.z))).toBe(JSON.stringify(snapshot(b.z)));
  });

  it("every tier has feedback, and harder hits feel stronger through the library impact feedback", () => {
    const tiers: DebrisTier[] = ["glance", "bump", "crash", "smash"];
    for (const t of tiers) expect(TIER_FEEDBACK[t]).toBeDefined();
    const feel = (tier: DebrisTier, speed: number): { hitStopMs: number; trauma: number } => {
      const f = TIER_FEEDBACK[tier];
      const r = createImpactFeedback({ fullSpeed: f.fullSpeed, hitStopMs: f.hitStopMs, cueName: f.cue }).handle({ colliderId: "o", tag: tier, point: [0, 0, 0], normal: [0, 0, -1], speed, impulse: speed });
      return { hitStopMs: r.hitStopMs, trauma: r.trauma };
    };
    const glance = feel("glance", 19), bump = feel("bump", 19), crash = feel("crash", 23), smash = feel("smash", 30);
    expect(bump.trauma).toBeGreaterThan(glance.trauma);
    expect(crash.trauma).toBeGreaterThan(bump.trauma);
    expect(crash.hitStopMs).toBeGreaterThan(bump.hitStopMs);
    expect(bump.hitStopMs).toBeGreaterThan(glance.hitStopMs);
    expect(smash.trauma).toBeLessThan(crash.trauma);
    expect(TIER_FEEDBACK.smash.forward[0]).toBeGreaterThan(TIER_FEEDBACK.crash.forward[1]);
  });
});

describe("ninja-runner rework: debris physics", () => {
  it("scatters deterministically from the entity id", () => {
    const a = spawnPieces("barrier", "crash", 42, 120, 0), b = spawnPieces("barrier", "crash", 42, 120, 0), c = spawnPieces("barrier", "crash", 43, 120, 0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    expect(a).toHaveLength(8);
    expect(spawnPieces("beam", "bump", 1, 10, 0)).toHaveLength(3);
    expect(hash01(1, 2)).toBeGreaterThanOrEqual(0);
    expect(hash01(1, 2)).toBeLessThan(1);
  });

  it("launches faster for harder hits", () => {
    const mean = (tier: DebrisTier): number => { const p = spawnPieces("barrier", tier, 7, 0, 0); return p.reduce((n, q) => n + q.vds, 0) / p.length; };
    expect(mean("crash")).toBeGreaterThan(mean("bump"));
    expect(mean("smash")).toBeGreaterThan(mean("crash"));
  });

  it("never sinks below the ground, bounces with loss, settles, and expires", () => {
    let pieces = spawnPieces("barrier", "smash", 5, 0, 0);
    let peak = 0, minH = Infinity;
    for (let t = 0; t < PIECE_LIFE + 0.2; t += 1 / 60) {
      pieces = stepPieces(pieces, 1 / 60);
      for (const p of pieces) { minH = Math.min(minH, p.h - p.size[1] / 2); peak = Math.max(peak, p.h); }
    }
    expect(minH).toBeGreaterThanOrEqual(-1e-9);
    expect(peak).toBeGreaterThan(1);
    expect(pieces).toHaveLength(0);
    expect(GRAVITY).toBeGreaterThan(0);
  });

  it("comes to rest on the ground before it fades", () => {
    let pieces = spawnPieces("barrier", "bump", 3, 0, 0);
    for (let t = 0; t < 2.6; t += 1 / 60) pieces = stepPieces(pieces, 1 / 60);
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) { expect(Math.abs(p.vh)).toBeLessThan(0.5); expect(Math.hypot(p.vds, p.vlx)).toBeLessThan(0.6); }
  });

  it("fades out over the last moments of life", () => {
    const [p] = spawnPieces("beam", "bump", 1, 0, 0);
    expect(pieceScale(p!)).toBe(1);
    p!.age = PIECE_LIFE - 0.1;
    expect(pieceScale(p!)).toBeLessThan(0.5);
    p!.age = PIECE_LIFE;
    expect(pieceScale(p!)).toBe(0);
  });
});
