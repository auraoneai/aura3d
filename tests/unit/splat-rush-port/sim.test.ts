import { describe, expect, it } from "vitest";
import { TRACE_FIELDS } from "../../../tools/crayon-capture/splat-rush-lib";
import { CONFIG, IDLE, POOL, SplatRushSim, TRACE_COLUMNS, parseScript, expandScript, replay, virtualNow } from "../../../examples/splat-rush-port/sim";

const START = { start: true, down: false, up: false, dx: 0 };
const DOWN = { start: false, down: true, up: false, dx: 0 };
type Priv = {
  spawnSplatter(x: number, z: number, c: number): void;
  spawnGateRow(z: number): void;
  burst(x: number, y: number, z: number, color: string, count: number, power: number): void;
  spawnPowerup(z: number): void;
};
const priv = (s: SplatRushSim): Priv => s as unknown as Priv;
const running = (seed = 3): SplatRushSim => {
  const sim = new SplatRushSim(seed);
  for (let i = 0; i < 30; i++) sim.advance(IDLE);
  sim.advance(START);
  sim.advance(DOWN);
  return sim;
};

describe("splat-rush-port: stream and clock", () => {
  it("consumes exactly the original's 1210 init draws (ball 300, clouds 310, streaks 200, ramp 400)", () => {
    const sim = new SplatRushSim(1);
    expect(sim.rng.count).toBe(300 + (30 * 6 + 26 * 5) + 50 * 4 + (120 * 2 + 10 * 16));
    expect(sim.paint.ball).toHaveLength(60);
    expect(sim.paint.speckles).toHaveLength(120);
    expect(sim.paint.blobs).toHaveLength(10);
    expect(sim.paint.blobs.every((b) => b.lobes.length === 6)).toBe(true);
    expect(sim.clouds).toHaveLength(56);
    expect(sim.streaks).toHaveLength(50);
  });

  it("is deterministic per seed and differs across seeds", () => {
    const a = replay(5, 30, expandScript(parseScript("1xS dx=0\n1xD dx=0\n200x- dx=0"))).trace;
    const b = replay(5, 30, expandScript(parseScript("1xS dx=0\n1xD dx=0\n200x- dx=0"))).trace;
    const c = replay(6, 30, expandScript(parseScript("1xS dx=0\n1xD dx=0\n200x- dx=0"))).trace;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("the module-eval frame has dt 0 and every later frame uses the virtual-clock difference", () => {
    const sim = new SplatRushSim(1);
    expect(sim.n).toBe(0);
    expect(sim.elapsed).toBe(0);
    let expected = 0;
    for (let n = 1; n <= 90; n++) {
      sim.advance(IDLE);
      expected += (virtualNow(n) - virtualNow(n - 1)) / 1000;
    }
    expect(sim.elapsed).toBe(expected);
    expect(sim.n).toBe(90);
  });

  it("trace column order matches the capture tool's TRACE_FIELDS", () => {
    expect([...TRACE_COLUMNS]).toEqual([...TRACE_FIELDS]);
    expect(new SplatRushSim(1).traceRow(0)).toHaveLength(TRACE_FIELDS.length);
  });
});

describe("splat-rush-port: starting a run", () => {
  it("pointerdown on the splash screen starts the run and resets state; it does not begin a drag", () => {
    const sim = new SplatRushSim(2);
    sim.advance(START);
    expect(sim.o.phase).toBe("playing");
    expect(sim.dragging).toBe(false);
    expect(sim.segments).toHaveLength(200);
    expect(sim.gates).toHaveLength(15);
    expect(sim.o.lastGateZ).toBeLessThan(-40);
    expect(sim.o.lives).toBe(3);
    sim.advance(DOWN);
    expect(sim.dragging).toBe(true);
  });

  it("steering moves only while dragging in the playing phase, by 0.012 * dx * (10/6), clamped to the lane", () => {
    const sim = running();
    sim.advance({ ...IDLE, dx: 10 });
    expect(sim.ye).toBe(0 + 0.012 * 10 * (CONFIG.STEER_SPEED / 6));
    for (let i = 0; i < 200; i++) sim.advance({ ...IDLE, dx: 50 });
    expect(sim.ye).toBe(CONFIG.LANE_HALF_WIDTH);
    sim.advance({ ...IDLE, up: true });
    const before = sim.ye;
    sim.advance({ ...IDLE, dx: -50 });
    expect(sim.ye).toBe(before);
  });

  it("each gate row has exactly one gate matching the ball colour", () => {
    const sim = running(11);
    for (let row = 0; row < 5; row++) {
      const rowGates = sim.gates.slice(row * 3, row * 3 + 3);
      expect(rowGates).toHaveLength(3);
      expect(rowGates.filter((g) => g.colorIndex === sim.o.playerColorIndex)).toHaveLength(1);
    }
  });
});

describe("splat-rush-port: gate rules (original `Ye`/`$e`/frame collision branch)", () => {
  const lone = (sim: SplatRushSim, gate: { laneX: number; colorIndex: number }) => {
    sim.gates = [{ z: -0.6, x: 0, laneX: gate.laneX, colorIndex: gate.colorIndex, passed: false, row: -1 }];
    sim.powerups = [];
  };

  it("a matching gate scores 40 + 60 (perfect) times the multiplier, grows the ball and speeds up", () => {
    const sim = running();
    lone(sim, { laneX: 0, colorIndex: sim.o.playerColorIndex });
    const before = { score: sim.o.score, speed: sim.o.speed };
    sim.advance(IDLE);
    expect(sim.o.combo).toBe(1);
    expect(sim.o.score - before.score).toBeGreaterThan(100);
    expect(sim.o.score - before.score).toBeLessThan(101);
    expect(sim.o.ballScale).toBeCloseTo(1.15 * CONFIG.GROW_FACTOR, 12);
    expect(sim.o.speed).toBeGreaterThan(before.speed + 0.44);
    expect(sim.popups.some((p) => p.text.startsWith("PERFECT!"))).toBe(true);
  });

  it("a non-perfect match (lane offset 0.8) scores 40 and grows by GROW_FACTOR only", () => {
    const sim = running();
    sim.o.laneOffset = 0.8;
    sim.ye = 0.8;
    lone(sim, { laneX: 0, colorIndex: sim.o.playerColorIndex });
    sim.advance(IDLE);
    expect(sim.o.combo).toBe(1);
    expect(sim.o.ballScale).toBeCloseTo(CONFIG.GROW_FACTOR, 12);
    expect(sim.popups.some((p) => p.text.startsWith("PERFECT!"))).toBe(false);
  });

  it("a wrong gate costs a life, resets combo, shrinks the ball and shakes the camera", () => {
    const sim = running();
    sim.o.combo = 4;
    lone(sim, { laneX: 0, colorIndex: (sim.o.playerColorIndex + 1) % 4 });
    sim.advance(IDLE);
    expect(sim.o.lives).toBe(2);
    expect(sim.o.combo).toBe(0);
    expect(sim.o.multiplier).toBe(1);
    expect(sim.o.ballScale).toBeCloseTo(CONFIG.SHRINK_FACTOR, 12);
    expect(sim.o.shakeTimer).toBeGreaterThan(0.38);
    expect(sim.popups.some((p) => p.text === "OUCH!")).toBe(true);
  });

  it("a shield absorbs a wrong gate (no life lost) and is consumed", () => {
    const sim = running();
    sim.o.shieldActive = true;
    lone(sim, { laneX: 0, colorIndex: (sim.o.playerColorIndex + 1) % 4 });
    sim.advance(IDLE);
    expect(sim.o.lives).toBe(3);
    expect(sim.o.shieldActive).toBe(false);
    expect(sim.popups.some((p) => p.text === "BLOCKED!")).toBe(true);
  });

  it("rainbow matches any gate colour", () => {
    const sim = running();
    sim.o.rainbowTimer = 5;
    sim.o.isRainbowActive = true;
    lone(sim, { laneX: 0, colorIndex: (sim.o.playerColorIndex + 2) % 4 });
    sim.advance(IDLE);
    expect(sim.o.combo).toBe(1);
    expect(sim.o.lives).toBe(3);
  });

  it("a gate more than 1.2 lanes away is passed without any effect", () => {
    const sim = running();
    lone(sim, { laneX: 2.3, colorIndex: (sim.o.playerColorIndex + 1) % 4 });
    sim.advance(IDLE);
    expect(sim.o.lives).toBe(3);
    expect(sim.o.combo).toBe(0);
    expect(sim.gates[0]?.passed).toBe(true);
  });

  it("losing the last life bursts, then reaches gameOver after burstT 1.15 s", () => {
    const sim = running();
    sim.o.lives = 1;
    lone(sim, { laneX: 0, colorIndex: (sim.o.playerColorIndex + 1) % 4 });
    sim.advance(IDLE);
    expect(sim.o.phase).toBe("bursting");
    expect(sim.player.visible).toBe(false);
    let frames = 0;
    while (sim.o.phase === "bursting" && frames++ < 200) sim.advance(IDLE);
    expect(sim.o.phase).toBe("gameOver");
    expect(frames).toBeGreaterThan(60);
    expect(frames).toBeLessThan(75);
  });

  it("milestone at 750 adds 100 points and moves the next milestone by 750", () => {
    const sim = running();
    sim.o.score = 749.9;
    sim.advance(IDLE);
    expect(sim.o.milestone).toBe(1500);
    expect(sim.o.score).toBeGreaterThan(849);
    expect(sim.popups.some((p) => p.text.startsWith("MILESTONE!"))).toBe(true);
  });
});

describe("splat-rush-port: exhausted pools skip spawns and therefore skip draws", () => {
  it("a splatter is not spawned (and nothing is drawn) when all 20 slots are in use", () => {
    const sim = running();
    for (let i = sim.splatters.length; i < POOL.splatters; i++) priv(sim).spawnSplatter(0, 0, 0);
    expect(sim.splatters).toHaveLength(POOL.splatters);
    const before = sim.rng.count;
    priv(sim).spawnSplatter(0, 0, 0);
    expect(sim.rng.count).toBe(before);
    expect(sim.splatters).toHaveLength(POOL.splatters);
    sim.splatters.pop();
    priv(sim).spawnSplatter(0, 0, 0);
    expect(sim.rng.count).toBe(before + 2); // rotation + target scale
  });

  it("a power-up is not spawned (and nothing is drawn) when all 10 slots are in use", () => {
    const sim = running();
    sim.powerups = [];
    for (let i = 0; i < POOL.powerups; i++) priv(sim).spawnPowerup(-5);
    const before = sim.rng.count;
    priv(sim).spawnPowerup(-5);
    expect(sim.rng.count).toBe(before);
  });

  it("particles draw 6 numbers each and only fill free pool slots", () => {
    const sim = running();
    const before = sim.rng.count;
    priv(sim).burst(0, 0, 0, "#fff", 10, 1.6);
    expect(sim.rng.count - before).toBe(60);
    for (const p of sim.particles) p.visible = true;
    sim.particles[0]!.visible = false;
    sim.particles[1]!.visible = false;
    const mid = sim.rng.count;
    priv(sim).burst(0, 0, 0, "#fff", 26, 2.6);
    expect(sim.rng.count - mid).toBe(12); // only two free slots
  });

  it("camera shake draws two numbers per frame while the timer runs", () => {
    const sim = running();
    sim.o.shakeTimer = 0.5;
    sim.gates = [];
    const a = sim.rng.count;
    sim.advance(IDLE);
    expect(sim.rng.count - a).toBeGreaterThanOrEqual(2);
    expect(sim.o.shakeTimer).toBeLessThan(0.5);
  });
});
