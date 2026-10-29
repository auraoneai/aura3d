import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/motionGate";
import {
  DRILLS, DRILL_LANE, PLATFORM_SNAP, RESTART_LOCKOUT, ROW0_GRACE, SIM_STEP, bindApp, displayCoins, endToTitle,
  evidenceExtra, lane, renderTime, restartRun, startRun, st, step, syncVisuals
} from "../../../apps/showcase-cross-hop/src/game/core";
import {
  HIT_MARGIN, MOVER_LENGTH, TRAIN_CARS, TRAIN_CAR_LENGTH, TRAM_WARN_SECONDS, laneFor, laneMovers, moverHalf, railCycle,
  railWarning, wrapSpan, type Lane
} from "../../../apps/showcase-cross-hop/src/game/world";
import { FIELD_HALF, STRIP_W } from "../../../apps/showcase-cross-hop/src/game/themes";

/** Keyboard stand-in with the engine's buffered/consume contract: a press stays buffered until consumed. */
function fakeInput() {
  const held = new Set<string>();
  return {
    press(d: string) { held.add(d); },
    buffered: (d: string) => held.has(d),
    consume: (d: string) => held.delete(d)
  };
}

/** End the run through the hawk (past the row 0 grace period). */
function kill(): void {
  st.time = Math.max(st.time, ROW0_GRACE);
  st.idle = 99;
  run(SIM_STEP);
}

function run(seconds: number, input = fakeInput()): void {
  const n = Math.round(seconds / SIM_STEP);
  for (let i = 0; i < n; i++) step(SIM_STEP, input);
}

const XS = new Float32Array(32);

beforeEach(() => {
  st.profile = { best: 0, coins: 0, unlocked: ["hop"], selected: "hop", drills: [], seenIntro: true };
  st.autopilot = false;
  st.banked = true;
});

describe("cross hop coin banking (CH-1)", () => {
  it("a 20-coin run then a 0-coin run leave 20 coins in the bank", () => {
    startRun("quick", null, 11);
    st.coins = 20;
    expect(displayCoins()).toBe(20);
    kill();
    expect(st.mode).toBe("dead");
    expect(st.profile.coins).toBe(20);
    expect(displayCoins()).toBe(20);
    startRun("quick", null, 12);
    expect(st.coins).toBe(0);
    kill();
    expect(st.profile.coins).toBe(20);
    expect(displayCoins()).toBe(20);
  });
  it("a run abandoned to the menu or replaced while live banks once", () => {
    startRun("quick", null, 13);
    st.coins = 30;
    startRun("quick", null, 14);
    expect(st.profile.coins).toBe(30);
    st.coins = 10;
    endToTitle();
    endToTitle();
    expect(st.profile.coins).toBe(40);
  });
});

describe("cross hop scoring (CH-2)", () => {
  it("hopping back and forth scores each row once", () => {
    startRun("quick", null, 21);
    const input = fakeInput();
    for (let i = 0; i < 12; i++) {
      input.press(i % 2 === 0 ? "up" : "down");
      run(0.25, input);
      if (st.mode !== "run") break;
    }
    expect(st.mode).toBe("run");
    expect(st.row).toBe(1);
    expect(st.score).toBe(1);
  });
});

describe("cross hop drills (CH-3)", () => {
  it("drill lanes carry their own spacing; a rail lane holds one train", () => {
    expect(DRILL_LANE.rail.spacing).toBeGreaterThanOrEqual(60);
    startRun("drill", DRILLS.find((d) => d.id === "train-dodges")!, 1);
    for (let r = 2; r < 9; r++) {
      const l = lane(r);
      if (l.type !== "rail") continue;
      for (let t = 0; t < 20; t += 0.05) expect(laneMovers(l, t, XS)).toBeLessThanOrEqual(1);
    }
  });
  for (const drill of DRILLS) {
    for (const seed of [1, 2, 3]) {
      it(`the autopilot clears ${drill.id} (seed ${seed})`, () => {
        st.autopilot = true;
        startRun("drill", drill, seed);
        let deaths = 0;
        for (let i = 0; i < 90 / SIM_STEP && !st.profile.drills.includes(drill.id); i++) {
          const wasDead = st.dead !== null;
          step(SIM_STEP, fakeInput());
          if (!wasDead && st.dead) deaths++;
        }
        expect(st.profile.drills).toContain(drill.id);
        expect(deaths).toBeLessThanOrEqual(3);
      });
    }
  }
});

describe("cross hop rail and tram warnings (CH-4)", () => {
  const rails: Lane[] = [];
  for (const seed of [1, 2, 3, 7, 42]) for (let r = 4; r < 160; r++) { const l = laneFor(r, seed, 0.5); if (l.type === "rail") rails.push(l); }
  it("rail lanes exist in the sample", () => expect(rails.length).toBeGreaterThan(10));
  it("every train crossing comes after a warning window of at least 1.3 s", () => {
    for (const l of rails) {
      let warnRun = 0, prevTrain = false;
      for (let t = 0; t < 30; t += 0.01) {
        const train = laneMovers(l, t, XS) > 0;
        const warn = railWarning(l, t) > 0;
        if (train) expect(warn).toBe(true);
        if (train && !prevTrain && t > 2) expect(warnRun).toBeGreaterThanOrEqual(1.3);
        warnRun = warn && !train ? warnRun + 0.01 : train ? warnRun : 0;
        prevTrain = train;
      }
    }
  });
  it("a rail lane carries one train, which starts and ends beyond the strip", () => {
    for (const l of rails) {
      const cyc = railCycle(l);
      for (let t = 0; t < cyc.period * 2; t += 0.01) {
        const n = laneMovers(l, t, XS);
        expect(n).toBeLessThanOrEqual(1);
      }
      const u0 = (cyc.warn + 0.001);
      const t0 = u0 - l.phase + cyc.period * 100;
      laneMovers(l, t0, XS);
      expect(Math.abs(XS[0]!) - moverHalf(l)).toBeGreaterThan(STRIP_W / 2);
    }
  });
  it("a tram lane lights before a tram reaches the column, and not when none is coming", () => {
    let lit = 0, samples = 0, hitsWithoutWarning = 0;
    for (const seed of [1, 2, 3, 7]) {
      for (let r = 4; r < 200; r++) {
        const l = laneFor(r, seed, 0.5, 1);
        if (l.type !== "tram") continue;
        for (let t = 0; t < 20; t += 0.02) {
          samples++;
          const warn = railWarning(l, t, 0) > 0;
          if (warn) lit++;
          // A tram that is not on column 0 now but covers it 0.9 s from now must already be signalled.
          const covers = (tt: number) => { const n = laneMovers(l, tt, XS); for (let i = 0; i < n; i++) if (Math.abs(XS[i]!) < moverHalf(l) + 0.3) return true; return false; };
          if (!covers(t) && covers(t + TRAM_WARN_SECONDS * 0.9) && !warn) hitsWithoutWarning++;
        }
      }
    }
    expect(samples).toBeGreaterThan(0);
    expect(lit / samples).toBeGreaterThan(0.05);
    expect(lit / samples).toBeLessThan(0.9);
    expect(hitsWithoutWarning).toBe(0);
  });
});

describe("cross hop hitboxes match the drawn models (CH-5)", () => {
  const drawnHalf: Record<string, number> = {
    car: MOVER_LENGTH.pickup / 2, truck: MOVER_LENGTH.truck / 2, tram: MOVER_LENGTH.tram / 2,
    train: (TRAIN_CARS * TRAIN_CAR_LENGTH) / 2, log: MOVER_LENGTH.log / 2, pad: MOVER_LENGTH.pad / 2, stone: MOVER_LENGTH.stone / 2
  };
  for (const [kind, half] of Object.entries(drawnHalf)) {
    it(`${kind}: moverHalf is within 0.2 m of half the drawn length`, () => {
      const l = { ...laneFor(10, 1, 0), moverKind: kind as Lane["moverKind"] };
      expect(Math.abs(moverHalf(l) - half)).toBeLessThanOrEqual(0.2);
    });
  }
  it("core.ts sizes every vehicle pool from MOVER_LENGTH / TRAIN_CAR_LENGTH", () => {
    const core = readFileSync(path.resolve("apps/showcase-cross-hop/src/game/core.ts"), "utf8");
    const dims = [...core.matchAll(/targetMaxDimension: ([^,}]+)/g)].map((m) => m[1]!.trim());
    expect(dims.length).toBeGreaterThanOrEqual(10);
    for (const d of dims) expect(d).toMatch(/^(MOVER_LENGTH\.\w+|TRAIN_CAR_LENGTH)$/);
    expect(HIT_MARGIN).toBeLessThanOrEqual(0.2);
  });
});

describe("cross hop restart (CH-6, CH-8, CH-9)", () => {
  const calls: string[] = [];
  const handle = { setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setInstances() {}, setMaterial() {} };
  bindApp({
    nodes: { add: (n: { id?: string; runtimeId?: string }) => calls.push(`add`), remove: (id: string) => calls.push(`remove:${id}`), require: () => handle, get: () => handle },
    camera: { setPose() {} },
    output: { setOutputOverlay() {} },
    effects: { burst() {} }
  } as never);

  it("a quick run after a Neon District run puts the theme 0 look back", () => {
    startRun("tour", null, 5 * 97777 + 13, 4);
    expect((evidenceExtra().state as Record<string, unknown>).lookTheme).toBe("Neon District");
    calls.length = 0;
    startRun("quick", null);
    expect(calls).toContain("remove:look");
    expect((evidenceExtra().state as Record<string, unknown>).lookTheme).toBe("Meadow Roads");
    calls.length = 0;
    startRun("quick", null);
    expect(calls).not.toContain("remove:look");
  });
  it("restart keeps the World Tour theme and seed; Quick Play rolls a new seed", () => {
    startRun("tour", null, 4 * 97777 + 13, 3);
    restartRun();
    expect(st.runKind).toBe("tour");
    expect(st.forceTheme).toBe(3);
    expect(st.seed).toBe(4 * 97777 + 13);
    startRun("quick", null);
    const s0 = st.seed;
    restartRun();
    expect(st.forceTheme).toBeUndefined();
    expect(st.seed).not.toBe(s0);
  });
  it("a key pressed as the critter dies does not skip the death card", () => {
    startRun("quick", null, 31);
    kill();
    expect(st.mode).toBe("dead");
    const input = fakeInput();
    input.press("up");
    run(RESTART_LOCKOUT * 0.8, input);
    expect(st.mode).toBe("dead");
    run(RESTART_LOCKOUT, input);
    expect(st.mode).toBe("dead"); // the early press was dropped
    input.press("up");
    run(SIM_STEP * 2, input);
    expect(st.mode).toBe("run");
    expect(st.playerRow).toBe(0); // the restart press is consumed, not turned into a hop
  });
  it("syncVisuals runs against the bound app without node errors", () => {
    startRun("quick", null, 41);
    run(1);
    syncVisuals(0.5);
    syncVisuals(1);
    expect(evidenceExtra().nodesOk).toBe(true);
  });
});

describe("cross hop river hops (CH-11)", () => {
  it("a hop into open water drowns instead of snapping to a far log", () => {
    startRun("quick", null, 51);
    // Row 2 is always a log river (logs 5.4 m apart). Wait for a moment when column 0 is open water at landing time.
    // The old code snapped such a hop onto the nearest log anywhere on the field.
    expect(PLATFORM_SNAP).toBeLessThan(1);
    const l = lane(2);
    const input = fakeInput();
    input.press("up"); run(0.3, input);
    expect(st.playerRow).toBe(1);
    let t = st.time;
    for (let k = 0; k < 2000; k++, t += SIM_STEP) {
      const n = laneMovers(l, t + 0.16 + SIM_STEP, XS);
      let near = Infinity;
      for (let i = 0; i < n; i++) near = Math.min(near, Math.abs(XS[i]!));
      if (near > moverHalf(l) + 0.35) break;
    }
    run(t - st.time);
    input.press("up"); run(0.4, input);
    expect(st.mode).toBe("dead");
    expect(st.dead?.kind).toBe("drowned");
  });
});

describe("cross hop traffic stays off the drawn strip when it wraps (CH-12)", () => {
  it("looping movers wrap only once they are fully past the strip", () => {
    for (let r = 4; r < 120; r++) {
      const l = laneFor(r, 9, 0.4);
      if (l.moverKind === "none" || l.moverKind === "train") continue;
      expect(wrapSpan(l) / 2 - moverHalf(l)).toBeGreaterThan(STRIP_W / 2);
      let prev = laneMovers(l, 0, XS) > 0 ? XS[0]! : 0;
      for (let t = 0.02; t < 30; t += 0.02) {
        laneMovers(l, t, XS);
        if (Math.abs(XS[0]! - prev) > 5) expect(Math.abs(prev)).toBeGreaterThan(STRIP_W / 2 + moverHalf(l));
        prev = XS[0]!;
      }
    }
    expect(FIELD_HALF).toBeLessThan(STRIP_W / 2);
  });
  it("spectators and scenery stand beyond the strip (source check)", () => {
    const core = readFileSync(path.resolve("apps/showcase-cross-hop/src/game/core.ts"), "utf8");
    expect(core).toMatch(/const SCENERY_X = STRIP_W \/ 2 \+ 0\.5;/);
    expect(core).toMatch(/lane\(r\)\.type === "meadow"\) \{ specRow = r; break; \}/);
  });
});

describe("cross hop hawk on row 0 (CH-17)", () => {
  it("standing on row 0 is safe for the grace period, then the hawk comes", () => {
    startRun("quick", null, 61);
    run(ROW0_GRACE - 0.2);
    expect(st.mode).toBe("run");
    run(6);
    expect(st.dead?.kind).toBe("snatched");
  });
  it("drills do not change Best", () => {
    startRun("drill", DRILLS[0]!, 1);
    st.score = 500; kill();
    expect(st.profile.best).toBe(0);
    startRun("quick", null, 62);
    st.score = 7; kill();
    expect(st.profile.best).toBe(7);
    expect(st.newBest).toBe(true);
  });
});

describe("cross hop fixed step drawn between steps (CH-E1)", () => {
  for (const hz of [60, 120, 144]) {
    it(`traffic drawn at renderTime(alpha) passes the motion gate at ${hz} Hz`, () => {
      startRun("quick", null, 71);
      const road = { ...laneFor(10, 71, 0), type: "road" as const, moverKind: "car" as const, speed: 3, spacing: 7, dir: 1 as const, phase: 0 };
      const report = runMotionGate({
        displayHz: hz,
        seconds: 3,
        jitterSeconds: 0.0005,
        step: (dt) => { st.time += dt; },
        drawn: (alpha) => { laneMovers(road, renderTime(alpha), XS); return [XS[0]!]; }
      });
      expect(report.failures).toEqual([]);
      expect(report.passed).toBe(true);
    });
  }
});
