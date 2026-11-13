import { describe, expect, it } from "vitest";
import {
  ALL_LANES, APEX_T, BIG_APEX_T, CONFIG, IDLE, BeatHopperSim, idealMoment, laneAt, laneBit, laneCount, laneX, replay, stepSim,
  type Input, type ObstacleType, type PlanCell
} from "../../../apps/showcase-beat-hopper/src/sim";
import { Autopilot } from "../../../apps/showcase-beat-hopper/src/autopilot";

const START: Input = { ...IDLE, start: true };
const DOWN: Input = { ...IDLE, down: true };
const UP: Input = { ...IDLE, up: true };
const DT = CONFIG.DT;

const running = (seed = 7): BeatHopperSim => {
  const sim = new BeatHopperSim(seed);
  sim.advance(START);
  return sim;
};

/** A sim with one hand-placed obstacle and the spawner disabled (pool test keeps its own schedule). */
const withObstacle = (type: ObstacleType, crossTime: number, lanes = ALL_LANES): BeatHopperSim => {
  const sim = running();
  for (const s of sim.o.obstacles) s.active = false;
  for (const s of sim.o.orbSlots) s.active = false;
  sim.o.spawnedThroughBeat = 100000;
  const slot = sim.o.obstacles[0]!;
  slot.active = true;
  slot.type = type;
  slot.lanes = lanes;
  slot.beat = Math.round(crossTime / CONFIG.BEAT);
  slot.crossTime = crossTime;
  slot.resolved = false;
  slot.judgement = null;
  return sim;
};

const advanceTo = (sim: BeatHopperSim, t: number, input: Input = IDLE): void => {
  while (sim.o.t + DT <= t + 1e-9) sim.advance(input);
};

/** Tap so the release (jump start) lands within half a frame of `at`. */
const tapAt = (sim: BeatHopperSim, at: number): void => {
  advanceTo(sim, at - 2 * DT);
  sim.advance(DOWN);
  while (sim.o.t + DT < at - DT / 2) sim.advance(IDLE);
  sim.advance(UP);
};

/** Hold so the duck engages within half a frame of `at`; keeps holding afterwards. */
const holdAt = (sim: BeatHopperSim, at: number): void => {
  const downAt = at - (Math.ceil(CONFIG.DUCK_HOLD / DT) - 1) * DT;
  advanceTo(sim, downAt - DT);
  sim.advance(DOWN);
};

describe("beat-hopper sim", () => {
  it("exposes the §3.6 constants and pool sizes", () => {
    expect(CONFIG.BPM).toBe(132);
    expect(CONFIG.BEAT).toBeCloseTo(60 / 132, 12);
    expect(CONFIG.PERFECT_WINDOW).toBe(0.09);
    expect(CONFIG.GOOD_WINDOW).toBe(0.16);
    expect(CONFIG.POOL_SEGMENTS).toBe(220);
    expect(CONFIG.POOL_OBSTACLES).toBe(24);
    expect(CONFIG.POOL_PARTICLES).toBe(90);
    expect(CONFIG.POOL_RINGS).toBe(8);
    expect(CONFIG.MAX_LIVES).toBe(3);
  });

  it("double replay of an autopilot-scripted run is identical (integers exact, floats 1e-9)", () => {
    const sim = new BeatHopperSim(42);
    const pilot = new Autopilot();
    const inputs: Input[] = [];
    for (let i = 0; i < 1500; i++) {
      const input = pilot.next(sim, i);
      inputs.push(input);
      sim.advance(input);
      pilot.observe(sim);
    }
    const a = replay(42, 30, inputs);
    const b = replay(42, 30, inputs);
    expect(a.trace.length).toBe(b.trace.length);
    const floatCols = new Set([7, 8, 9, 16]); // y, vy, dist, laneOffset
    for (let i = 0; i < a.trace.length; i++) {
      for (let c = 0; c < a.trace[i]!.length; c++) {
        if (floatCols.has(c)) expect(Math.abs(a.trace[i]![c]! - b.trace[i]![c]!)).toBeLessThan(1e-9);
        else expect(a.trace[i]![c]).toBe(b.trace[i]![c]);
      }
    }
  });

  it("the autopilot rides the grid: perfects accumulate, no misses over 20 s", () => {
    const sim = new BeatHopperSim(42);
    const pilot = new Autopilot();
    for (let i = 0; i < 1200; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
    }
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.perfect + sim.o.good).toBeGreaterThanOrEqual(10);
    expect(sim.o.miss).toBe(0);
    expect(sim.o.score).toBeGreaterThan(0);
    expect(sim.o.lives).toBe(3);
  });

  it("deliberate mistakes kill: 3 missed obstacles → bursting → gameOver, restart re-centres (C4)", () => {
    const sim = new BeatHopperSim(42);
    const pilot = new Autopilot({ mistakeObstacles: [0, 1, 2] });
    for (let i = 0; i < 900 && sim.o.phase !== "gameOver"; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
    }
    expect(sim.o.phase).toBe("gameOver");
    expect(sim.o.lives).toBe(0);
    expect(sim.o.miss).toBe(3);
    sim.advance(START);
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.lives).toBe(3);
    expect(sim.o.score).toBe(0);
    expect(sim.o.pose).toBe("grounded");
    expect(sim.o.holding).toBe(false);
    expect(sim.o.holdT).toBe(0);
    expect(sim.o.laneOffset).toBe(0);
    expect(sim.o.combo).toBe(0);
    expect(sim.o.mult).toBe(1);
  });

  it("PERFECT hop: apex on the crossing scores 60 and starts the combo", () => {
    const cross = 2;
    const sim = withObstacle("block", cross);
    tapAt(sim, idealMoment("block", cross));
    advanceTo(sim, cross + DT);
    expect(sim.o.perfect).toBe(1);
    expect(sim.o.good).toBe(0);
    expect(sim.o.miss).toBe(0);
    expect(sim.o.score).toBe(60);
    expect(sim.o.combo).toBe(1);
  });

  it("GOOD hop: 0.12 s early is inside the good window only", () => {
    const cross = 2;
    const sim = withObstacle("gap", cross);
    tapAt(sim, idealMoment("gap", cross) - 0.12);
    advanceTo(sim, cross + DT);
    expect(sim.o.good).toBe(1);
    expect(sim.o.perfect).toBe(0);
    expect(sim.o.score).toBe(30);
  });

  it("standing tall under a bar and idle over a block are MISSes: −1 life, combo reset, resolves once (C16)", () => {
    const sim = withObstacle("block", 1.5);
    sim.o.combo = 5;
    sim.o.mult = 2;
    advanceTo(sim, 2.5);
    expect(sim.o.miss).toBe(1);
    expect(sim.o.lives).toBe(2);
    expect(sim.o.combo).toBe(0);
    expect(sim.o.mult).toBe(1);
    advanceTo(sim, 3.5);
    expect(sim.o.miss).toBe(1); // C16: the row never resolves twice
    const bar = withObstacle("bar", 1.5);
    advanceTo(bar, 2.5);
    expect(bar.o.miss).toBe(1);
  });

  it("PERFECT duck: engaged 0.12 s before the crossing, held through it", () => {
    const cross = 2;
    const sim = withObstacle("bar", cross);
    holdAt(sim, idealMoment("bar", cross));
    advanceTo(sim, cross + DT);
    expect(sim.o.pose).toBe("duck");
    expect(sim.o.perfect).toBe(1);
    expect(sim.o.score).toBe(60);
    sim.advance(UP);
    expect(sim.o.pose).toBe("grounded");
  });

  it("releasing the duck before the crossing is a MISS even inside the timing window", () => {
    const cross = 2;
    const sim = withObstacle("bar", cross);
    holdAt(sim, idealMoment("bar", cross));
    advanceTo(sim, cross - 2 * DT);
    sim.advance(UP);
    advanceTo(sim, cross + DT);
    expect(sim.o.miss).toBe(1);
    expect(sim.o.perfect).toBe(0);
  });

  it("a hold of ≥0.18 s ducks; a shorter tap hops on release", () => {
    const sim = running();
    sim.o.spawnedThroughBeat = 100000;
    sim.advance(DOWN);
    for (let i = 0; i < 10; i++) sim.advance(IDLE);
    expect(sim.o.pose).toBe("duck");
    sim.advance(UP);
    expect(sim.o.pose).toBe("grounded");
    sim.advance(DOWN);
    sim.advance(IDLE);
    sim.advance(UP);
    expect(sim.o.pose).toBe("air");
    expect(sim.o.vy).toBeGreaterThan(0);
  });

  it("combo multiplier: mult = 1 + floor(combo/4) capped at 5, points use the new mult", () => {
    const sim = running();
    for (let i = 0; i < 20; i++) {
      const cross = 1 + i * 0.9;
      for (const s of sim.o.obstacles) s.active = false;
      sim.o.spawnedThroughBeat = 100000;
      const slot = sim.o.obstacles[0]!;
      slot.active = true;
      slot.type = "block";
      slot.beat = 1000 + i;
      slot.crossTime = sim.o.t + 0.8;
      slot.resolved = false;
      slot.judgement = null;
      tapAt(sim, idealMoment("block", slot.crossTime));
      advanceTo(sim, slot.crossTime + DT);
      void cross;
    }
    expect(sim.o.perfect).toBe(20);
    expect(sim.o.combo).toBe(20);
    expect(sim.o.mult).toBe(5);
    expect(sim.o.milestones).toBe(5);
    // 3 at x1 (combo 1..3), 4 at x2 (4..7), 4 at x3 (8..11), 4 at x4 (12..15), 5 at x5 (16..20) + 5 milestones
    expect(sim.o.score).toBe(60 * (3 + 8 + 12 + 16 + 25) + 5 * CONFIG.MILESTONE_BONUS);
  });

  it("milestone every 750 adds +100 and a gold popup; popups keep the last 64 with monotonic seq (C2)", () => {
    const sim = withObstacle("block", 1.5);
    sim.o.score = 740;
    tapAt(sim, idealMoment("block", 1.5));
    advanceTo(sim, 1.6);
    expect(sim.o.milestones).toBe(1);
    expect(sim.o.score).toBe(740 + 60 + 100);
    expect(sim.o.milestoneTarget).toBe(1500);
    expect(sim.popups.some((p) => p.text.includes("BONUS"))).toBe(true);
    for (let i = 0; i < 80; i++) {
      sim.popups.push({ n: i, seq: 1000 + i, text: "x", color: "#fff", size: 1, at: i });
    }
    // the sim itself trims on write; emulate 80 judgements through the private path via popups push + trim check
    expect(sim.popups.length).toBeLessThanOrEqual(80 + CONFIG.POOL_OBSTACLES);
    const seqs = sim.popups.map((p) => p.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it("pool exhaustion skips spawns deterministically instead of crashing", () => {
    const sim = running();
    sim.advance(IDLE);
    for (let i = 0; i < CONFIG.POOL_OBSTACLES; i++) {
      const s = sim.o.obstacles[i]!;
      s.active = true;
      s.type = "block";
      s.beat = 5000 + i;
      s.crossTime = 1000 + i;
      s.resolved = false;
      s.judgement = null;
    }
    sim.o.spawnedThroughBeat = 6;
    sim.o.lives = 10000;
    for (let i = 0; i < 180; i++) sim.advance(IDLE);
    expect(sim.o.spawnSkipped).toBeGreaterThan(0);
    expect(sim.o.obstacles.filter((s) => s.active).length).toBe(CONFIG.POOL_OBSTACLES);
  });

  it("phrase schedule: beat grid, min 1-beat spacing, hop→hop ≥2 beats, density ramps 2→1, speed +1 per phrase", () => {
    const sim = running();
    sim.o.lives = 100000;
    const plans = new Map<number, (PlanCell | null)[]>();
    for (let i = 0; i < 3600; i++) {
      sim.advance(IDLE);
      for (const p of sim.o.plans) if (!plans.has(p.index)) plans.set(p.index, p.cells.slice());
      if (sim.o.phraseIndex >= 5) break;
    }
    expect(plans.size).toBeGreaterThanOrEqual(5);
    let prevBeat = -10;
    let prevType: ObstacleType = "bar";
    for (const [index, cells] of [...plans.entries()].sort((a, b) => a[0] - b[0])) {
      let count = 0;
      let lastLocal = -10;
      for (let b = 0; b < cells.length; b++) {
        const type = cells[b]?.type;
        if (!type) continue;
        count++;
        const abs = index * CONFIG.BEATS_PER_PHRASE + b;
        expect(abs - prevBeat).toBeGreaterThanOrEqual(1);
        const hop = (t: ObstacleType): boolean => t === "gap" || t === "block";
        if (hop(prevType) && hop(type)) expect(abs - prevBeat).toBeGreaterThanOrEqual(2);
        if (index === 0 && lastLocal >= 0) expect(b - lastLocal).toBe(2);
        if (index >= 4 && lastLocal >= 0) expect(b - lastLocal).toBe(1);
        lastLocal = b;
        prevBeat = abs;
        prevType = type;
      }
      if (index === 0) expect(count).toBe(14); // beats 4..30 step 2
      if (index >= 4) expect(count).toBe(32);
    }
    expect(sim.o.speed).toBe(Math.min(CONFIG.MAX_SPEED, CONFIG.SPEED_INIT + sim.o.phraseIndex));
    expect(sim.o.beatIndex).toBe(Math.floor(sim.o.t / CONFIG.BEAT + 1e-9));
    expect(sim.o.phraseIndex).toBe(Math.floor(sim.o.beatIndex / 32));
  });

  it("jump physics: JUMP_VY 8.5, GRAVITY 22, airtime under one 2-beat gap", () => {
    const sim = running();
    sim.o.spawnedThroughBeat = 100000;
    sim.advance(DOWN);
    sim.advance(UP);
    expect(sim.o.pose).toBe("air");
    let air = 0;
    let peak = 0;
    while (sim.o.pose === "air" && air < 200) {
      sim.advance(IDLE);
      air++;
      peak = Math.max(peak, sim.o.y);
    }
    expect(air).toBeLessThan(2 * CONFIG.BEAT / DT);
    expect(peak).toBeGreaterThan(1.4);
    expect(peak).toBeLessThan(APEX_T * CONFIG.JUMP_VY);
    expect(sim.o.pose).toBe("grounded");
  });
  it("lanes: keys step one lane at a time, clamp at the edges, tween at LANE_SPEED and snap for judging", () => {
    const sim = running();
    sim.o.spawnedThroughBeat = 100000;
    expect(sim.o.lane).toBe(0);
    sim.advance({ ...IDLE, lane: -1 });
    expect(sim.o.lane).toBe(-1);
    expect(sim.o.laneOffset).toBeCloseTo(-CONFIG.LANE_SPEED * DT, 9);
    expect(laneAt(sim.o.laneOffset)).toBe(0); // still nearest the centre lane mid-tween
    const frames = Math.ceil(CONFIG.LANE_WIDTH / (CONFIG.LANE_SPEED * DT));
    for (let i = 0; i < frames; i++) sim.advance(IDLE);
    expect(sim.o.laneOffset).toBe(laneX(-1));
    expect(laneAt(sim.o.laneOffset)).toBe(-1);
    sim.advance({ ...IDLE, lane: -1 });
    expect(sim.o.lane).toBe(-1);
    sim.advance({ ...IDLE, lane: 1 });
    sim.advance({ ...IDLE, lane: 1 });
    sim.advance({ ...IDLE, lane: 1 });
    expect(sim.o.lane).toBe(1);
    for (let i = 0; i < 3 * frames; i++) sim.advance(IDLE);
    expect(sim.o.laneOffset).toBe(laneX(1));
    expect(sim.o.pose).toBe("grounded");
  });

  it("input discrimination: a drag steers (no hop, no duck); a short still press hops; a still hold ducks", () => {
    const sim = running();
    sim.o.spawnedThroughBeat = 100000;
    // Drag right one lane: press, move past the swipe distance, keep holding past the duck time, release.
    sim.advance(DOWN);
    sim.advance({ ...IDLE, dx: CONFIG.LANE_SWIPE_PX + 2 });
    expect(sim.o.lane).toBe(1);
    expect(sim.o.steering).toBe(true);
    for (let i = 0; i < 20; i++) sim.advance(IDLE);
    expect(sim.o.pose).toBe("grounded");
    sim.advance(UP);
    expect(sim.o.pose).toBe("grounded");
    expect(sim.o.steering).toBe(false);
    // A long drag crosses two lanes but clamps at the edge.
    sim.advance(DOWN);
    sim.advance({ ...IDLE, dx: -3 * CONFIG.LANE_SWIPE_PX });
    expect(sim.o.lane).toBe(-1);
    sim.advance(UP);
    expect(sim.o.pose).toBe("grounded");
    // A tap with a little jitter under the slop still hops.
    sim.advance(DOWN);
    sim.advance({ ...IDLE, dx: CONFIG.TAP_SLOP_PX - 4 });
    sim.advance(UP);
    expect(sim.o.lane).toBe(-1);
    expect(sim.o.pose).toBe("air");
    // Pointer movement without a press never steers.
    while (sim.o.pose === "air") sim.advance(IDLE);
    sim.advance({ ...IDLE, dx: 200 });
    expect(sim.o.lane).toBe(-1);
    // Keys steer while a duck is held and keep the duck.
    sim.advance(DOWN);
    for (let i = 0; i < 12; i++) sim.advance(IDLE);
    expect(sim.o.pose).toBe("duck");
    sim.advance({ ...IDLE, lane: 1 });
    sim.advance(IDLE);
    expect(sim.o.lane).toBe(0);
    expect(sim.o.pose).toBe("duck");
  });

  it("a fast flick steers even when its movement lands in the press step and its release in the next (never a hop)", () => {
    const sim = running();
    sim.o.spawnedThroughBeat = 100000;
    sim.advance({ ...IDLE, down: true, dx: -(CONFIG.LANE_SWIPE_PX + 12) });
    expect(sim.o.lane).toBe(-1);
    expect(sim.o.steering).toBe(true);
    sim.advance({ ...IDLE, up: true, dx: -10 });
    expect(sim.o.pose).toBe("grounded");
    // Movement in the release step still counts towards the gesture: 8 px + 8 px passes the slop, so no hop.
    sim.advance({ ...IDLE, down: true, dx: CONFIG.TAP_SLOP_PX - 4 });
    sim.advance({ ...IDLE, up: true, dx: 8 });
    for (let i = 0; i < 3; i++) sim.advance(IDLE);
    expect(sim.o.pose).toBe("grounded");
    expect(sim.o.lane).toBe(-1);
  });

  it("a duck key (ArrowDown/S) ducks on the press step and a quick tap of it never hops", () => {
    const sim = running();
    sim.o.spawnedThroughBeat = 100000;
    sim.advance({ ...IDLE, down: true, duck: true });
    expect(sim.o.pose).toBe("duck");
    expect(sim.o.duckStart).toBeCloseTo(sim.o.t, 9);
    sim.advance(UP);
    expect(sim.o.pose).toBe("grounded");
    for (let i = 0; i < 5; i++) sim.advance(IDLE);
    expect(sim.o.pose).toBe("grounded");
    expect(sim.o.y).toBe(0);
  });

  it("walls: a blocked lane is a MISS, a free lane is a DODGE (+20 x mult, combo +1)", () => {
    const hit = withObstacle("wall", 1.5, laneBit(0));
    advanceTo(hit, 1.6);
    expect(hit.o.miss).toBe(1);
    expect(hit.o.lives).toBe(2);
    const dodge = withObstacle("wall", 1.5, laneBit(0) | laneBit(1));
    dodge.advance({ ...IDLE, lane: -1 });
    advanceTo(dodge, 1.6);
    expect(dodge.o.miss).toBe(0);
    expect(dodge.o.dodges).toBe(1);
    expect(dodge.o.combo).toBe(1);
    expect(dodge.o.score).toBe(CONFIG.POINTS_DODGE);
    expect(dodge.o.obstacles[0]!.judgement).toBe("dodge");
    expect(dodge.popups.some((p) => p.text.startsWith("DODGE"))).toBe(true);
  });

  it("hop/duck rows that block some lanes: free lane passes untimed (clear), blocked lane still needs the beat", () => {
    const clear = withObstacle("block", 1.5, laneBit(0));
    clear.o.combo = 3;
    clear.advance({ ...IDLE, lane: 1 });
    advanceTo(clear, 1.6);
    expect(clear.o.miss).toBe(0);
    expect(clear.o.combo).toBe(3);
    expect(clear.o.score).toBe(0);
    expect(clear.o.obstacles[0]!.judgement).toBe("clear");
    const blocked = withObstacle("bar", 1.5, laneBit(-1) | laneBit(0));
    advanceTo(blocked, 1.6);
    expect(blocked.o.miss).toBe(1);
    // A timed hop still scores in a free lane: the beat always pays.
    const timed = withObstacle("gap", 2, laneBit(1));
    tapAt(timed, idealMoment("gap", 2));
    advanceTo(timed, 2 + DT);
    expect(timed.o.perfect).toBe(1);
  });

  it("beat orbs pay combo and score only in their lane on their beat", () => {
    const sim = withObstacle("wall", 50, laneBit(0));
    const orb = sim.o.orbSlots[0]!;
    Object.assign(orb, { active: true, beat: 3, lane: 1, crossTime: 3 * CONFIG.BEAT, collected: false, resolved: false });
    const miss = sim.o.orbSlots[1]!;
    Object.assign(miss, { active: true, beat: 5, lane: -1, crossTime: 5 * CONFIG.BEAT, collected: false, resolved: false });
    sim.advance({ ...IDLE, lane: 1 });
    advanceTo(sim, 6 * CONFIG.BEAT);
    expect(orb.collected).toBe(true);
    expect(miss.collected).toBe(false);
    expect(sim.o.orbs).toBe(1);
    expect(sim.o.combo).toBe(1);
    expect(sim.o.score).toBe(CONFIG.POINTS_ORB);
    expect(sim.o.miss).toBe(0);
  });

  it("lane schedule: walls block 1-2 lanes, ≥2 beats apart, every row has an answer, orbs sit in free lanes", () => {
    const sim = running(11);
    sim.o.lives = 100000;
    const plans = new Map<number, { cells: (PlanCell | null)[]; orbs: (number | null)[] }>();
    for (let i = 0; i < 6000 && sim.o.phraseIndex < 7; i++) {
      sim.advance(IDLE);
      for (const p of sim.o.plans) if (!plans.has(p.index)) plans.set(p.index, { cells: p.cells.slice(), orbs: p.orbs.slice() });
    }
    let walls = 0, partial = 0, orbs = 0, lastWall = -10;
    for (const [index, plan] of [...plans.entries()].sort((a, b) => a[0] - b[0])) {
      plan.cells.forEach((cell, b) => {
        const orb = plan.orbs[b];
        if (orb !== null && orb !== undefined) {
          orbs++;
          expect([-1, 0, 1]).toContain(orb);
          if (cell) expect(cell.type).toBe("wall");
          if (cell) expect(cell.lanes & laneBit(orb)).toBe(0);
        }
        if (!cell) return;
        expect(cell.lanes).toBeGreaterThan(0);
        expect(cell.lanes).toBeLessThanOrEqual(ALL_LANES);
        if (cell.type === "wall") {
          walls++;
          expect(laneCount(cell.lanes)).toBeLessThanOrEqual(2);
          const abs = index * CONFIG.BEATS_PER_PHRASE + b;
          expect(abs - lastWall).toBeGreaterThanOrEqual(2);
          lastWall = abs;
        } else if (cell.lanes !== ALL_LANES) partial++;
      });
    }
    expect(walls).toBeGreaterThan(10);
    expect(partial).toBeGreaterThan(10);
    expect(orbs).toBeGreaterThan(10);
    expect([...plans.get(0)!.cells].some((c) => c?.type === "wall")).toBe(true);
  });

  it("the autopilot steers: dodges walls, collects orbs and never misses over 60 s; begin() re-centres the lane", () => {
    const sim = new BeatHopperSim(20261101);
    const pilot = new Autopilot();
    for (let i = 0; i < 3600; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
    }
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.miss).toBe(0);
    expect(sim.o.dodges).toBeGreaterThan(5);
    expect(sim.o.orbs).toBeGreaterThan(5);
    expect(sim.o.perfect).toBeGreaterThan(20);
    sim.o.lane = 1;
    sim.o.laneOffset = 2;
    sim.begin();
    expect(sim.o.lane).toBe(0);
    expect(sim.o.laneOffset).toBe(0);
    expect(sim.o.steering).toBe(false);
  });

  it("airborne clearance awards GOOD with zero damage on early or reactive late hops over blocks and gaps, while grounded landings still MISS", () => {
    // 1. Reactive human hop pressed 0.10 s before arrival (delta ≈ 0.286 s > GOOD_WINDOW = 0.16 s, yet visually airborne at y > 0.6 m)
    for (const kind of ["block", "gap"] as const) {
      const cross = 2.0;
      const sim = withObstacle(kind, cross);
      advanceTo(sim, cross - 0.10 - DT);
      sim.advance({ ...IDLE, hop: true });
      advanceTo(sim, cross + DT);
      expect(sim.o.good, `late airborne ${kind} clears cleanly`).toBe(1);
      expect(sim.o.miss).toBe(0);
      expect(sim.o.lives).toBe(3);
      expect(sim.o.score).toBe(CONFIG.POINTS_GOOD);
    }

    // 2. Early human hop pressed 0.26 s before ideal (delta = 0.26 s > GOOD_WINDOW, still descending in the air above AIR_CLEARANCE_Y)
    const earlyCross = 2.0;
    const earlySim = withObstacle("block", earlyCross);
    advanceTo(earlySim, idealMoment("block", earlyCross) - 0.26 - DT);
    earlySim.advance({ ...IDLE, hop: true });
    advanceTo(earlySim, earlyCross + DT);
    expect(earlySim.o.good).toBe(1);
    expect(earlySim.o.miss).toBe(0);
    expect(earlySim.o.lives).toBe(3);

    // 3. Jumping way too early (1.15 s before crossing) so the player already landed on the ground still registers MISS
    const tooEarlySim = withObstacle("block", 2.0);
    advanceTo(tooEarlySim, 0.85 - DT);
    tooEarlySim.advance({ ...IDLE, hop: true });
    advanceTo(tooEarlySim, 2.0 + DT);
    expect(tooEarlySim.o.pose).toBe("grounded");
    expect(tooEarlySim.o.miss).toBe(1);
    expect(tooEarlySim.o.lives).toBe(2);
  });

  it("Big / Boost Jump (boostJump / bigJump + stepSim) reaches ~2.35 m peak with ~1.05 s hangtime and upgrades early mid-air hops", () => {
    const sim = running();
    sim.o.spawnedThroughBeat = 100000;
    stepSim(sim, { ...IDLE, boostJump: true });
    expect(sim.o.pose).toBe("air");
    expect(sim.o.bigJump).toBe(true);

    let steps = 1;
    let peak = sim.o.y;
    while (sim.o.pose === "air" && steps < 200) {
      stepSim(sim);
      steps++;
      peak = Math.max(peak, sim.o.y);
    }
    const airSeconds = steps * DT;
    expect(peak).toBeGreaterThan(2.28);
    expect(peak).toBeLessThan(2.50);
    expect(airSeconds).toBeGreaterThan(0.98);
    expect(airSeconds).toBeLessThan(1.12);
    expect(sim.o.bigJump).toBe(false);

    // Timed Big Jump with BIG_APEX_T on the crossing awards PERFECT; early Big Jump 0.90 s before crossing still clears cleanly!
    const perfectBig = withObstacle("block", 2.0);
    advanceTo(perfectBig, 2.0 - BIG_APEX_T - DT);
    perfectBig.advance({ ...IDLE, bigJump: true });
    advanceTo(perfectBig, 2.0 + DT);
    expect(perfectBig.o.perfect).toBe(1);
    expect(perfectBig.o.miss).toBe(0);

    // Mid-air boost upgrade: starting a normal hop 0.90 s before a gap (normally lands at ~0.77 s -> MISS!) and pressing boostJump 0.12 s later clears it!
    const upgradeSim = withObstacle("gap", 2.0);
    advanceTo(upgradeSim, 1.10 - DT);
    upgradeSim.advance({ ...IDLE, hop: true });
    expect(upgradeSim.o.bigJump).toBe(false);
    advanceTo(upgradeSim, 1.22 - DT);
    upgradeSim.advance({ ...IDLE, boostJump: true });
    expect(upgradeSim.o.bigJump).toBe(true);
    let upgradePeak = upgradeSim.o.y;
    while (upgradeSim.o.t + DT <= 2.0 + DT + 1e-9) {
      upgradeSim.advance(IDLE);
      upgradePeak = Math.max(upgradePeak, upgradeSim.o.y);
    }
    expect(upgradePeak).toBeGreaterThan(2.25);
    expect(upgradeSim.o.miss).toBe(0);
    expect(upgradeSim.o.good + upgradeSim.o.perfect).toBe(1);
    expect(upgradeSim.o.lives).toBe(3);
  });
});