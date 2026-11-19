/**
 * Splat Turf karts never interpenetrate. Recycled rival karts (pool rows +300 m) all land on the same row, so the sim
 * keeps them CONFIG.ERASER_GAP apart and bounces them off each other; a kart the rover hits pops clear and flies off
 * with any kart in its knock path (a strike). Checked on what world.ts actually draws (the "bots" instance matrices),
 * every frame of full runs: autoplay (dodges) and the reckless autopilot (rams every kart it can).
 */
import { describe, expect, it } from "vitest";
import { BOT_FOOTPRINT_LENGTH, CONFIG, IDLE, SplatTurfSim, type Input } from "../../../apps/showcase-splat-turf/src/sim";
import { AutoplayDriver, TurfAutopilot } from "../../../apps/showcase-splat-turf/src/autopilot";
import { buildWorld } from "../../../apps/showcase-splat-turf/src/world";
import { IDOL_DIMS } from "../../../apps/showcase-splat-turf/src/art/idol";

type Call = { matrices?: Float32Array; count?: number };

function recordingApp() {
  const calls = new Map<string, Call>();
  const handle = (id: string) => {
    const c: Call = calls.get(id) ?? {};
    calls.set(id, c);
    const h: Record<string, unknown> = {};
    const chain = () => h;
    Object.assign(h, {
      setPosition: chain, setRotation: chain, setScale: chain, setLight: chain, setMaterial: chain, setVisible: chain,
      setUniform: chain, updateAttribute: chain, setDrawRange: chain, setInstances: chain, setAnimationPose: chain,
      setInstanceMatrices: (m: Float32Array, n: number) => { c.matrices = m.slice(0, n * 16); c.count = n; return h; }
    });
    return h;
  };
  const app = { nodes: { require: handle, get: handle }, camera: { setPose: () => undefined } };
  return { app: app as never, calls };
}

const KART_HALF = CONFIG.ERASER_HALF_WIDTH;
const PAIR_GAP = CONFIG.ROVER_HALF_WIDTH + CONFIG.ERASER_HALF_WIDTH;
/** A kart lifted by more than a kart's height (shell + seated driver) clears the other kart's roof. */
const KART_HEIGHT = IDOL_DIMS.turfRivalKartShell[1] + 0.7;
const EPS = 1e-6;

interface RunStats { frames: number; sharedRowFrames: number; hits: number }

function run(seed: number, pilot: (sim: SplatTurfSim, step: number) => Input): RunStats {
  const sim = new SplatTurfSim(seed);
  const world = buildWorld({ sim, aspect: 16 / 9 });
  const { app, calls } = recordingApp();
  const rt = world.bind(app);
  for (let i = 0; i < 30; i++) sim.advance(IDLE);
  const stats: RunStats = { frames: 0, sharedRowFrames: 0, hits: 0 };
  for (let step = 0; step < 120 * 60; step++) {
    sim.advance(pilot(sim, step));
    if (step > 2 && sim.o.phase !== "playing" && sim.o.phase !== "bursting") break;
    rt.update(sim, 16 / 9);
    stats.frames++;
    const c = calls.get("bots");
    const karts: { x: number; y: number; row: number }[] = [];
    for (let k = 0; k < (c?.count ?? 0); k++) {
      const m = c!.matrices!.subarray(k * 16, k * 16 + 16);
      if (Math.hypot(m[0]!, m[1]!, m[2]!) < 0.01) continue; // the parked 0.001-scale placeholder, not a kart
      karts.push({ x: m[12]!, y: m[13]!, row: sim.o.distance - m[14]! });
    }
    // Rival vs rival.
    let shared = false;
    for (let a = 0; a < karts.length; a++) {
      for (let b = a + 1; b < karts.length; b++) {
        const p = karts[a]!, q = karts[b]!;
        if (Math.abs(p.row - q.row) >= BOT_FOOTPRINT_LENGTH || Math.abs(p.y - q.y) >= KART_HEIGHT) continue;
        shared = true;
        expect(Math.abs(p.x - q.x), `seed ${seed} step ${step}: rivals at x ${p.x.toFixed(3)} / ${q.x.toFixed(3)}`).toBeGreaterThanOrEqual(2 * KART_HALF - EPS);
      }
    }
    if (shared) stats.sharedRowFrames++;
    // Rover vs rival (the same along-road footprint test the sim's contact uses).
    const d = sim.o.distance;
    for (const k of karts) {
      const alongOverlap = d + CONFIG.ROVER_REACH_FRONT > k.row - CONFIG.ERASER_REACH_FRONT && d - CONFIG.ROVER_REACH_BACK < k.row + CONFIG.ERASER_REACH_BACK;
      if (!alongOverlap || k.y >= KART_HEIGHT) continue;
      expect(Math.abs(k.x - sim.o.laneOffset), `seed ${seed} step ${step}: rover ${sim.o.laneOffset.toFixed(3)} vs rival ${k.x.toFixed(3)}`).toBeGreaterThanOrEqual(PAIR_GAP - EPS);
    }
  }
  stats.hits = sim.o.eraserHits;
  return stats;
}

describe("splat turf karts never interpenetrate", () => {
  it("a full ?autoplay=1 run: rivals sharing rows stay apart and never overlap the rover", () => {
    const driver = new AutoplayDriver();
    const stats = run(20261121, (sim) => driver.next(sim));
    expect(stats.frames).toBeGreaterThan(50 * 60);
    expect(stats.sharedRowFrames).toBeGreaterThan(0); // the recycled trio really rides side by side
  });

  it("the reckless autopilot rams rivals: every hit kart pops clear and strikes its neighbours instead of passing through", () => {
    let hits = 0, shared = 0;
    for (const seed of [1, 7, 42]) {
      const pilot = new TurfAutopilot({ maxDx: 0.5, reckless: true });
      const stats = run(seed, (sim, step) => pilot.next(sim, step));
      hits += stats.hits;
      shared += stats.sharedRowFrames;
    }
    expect(hits).toBeGreaterThan(0);
    expect(shared).toBeGreaterThan(0);
  });

  it("sim: recycled rivals on one row keep ERASER_GAP and bounce apart", () => {
    const sim = new SplatTurfSim(3);
    sim.advance({ ...IDLE, start: true });
    const [a, b, c] = sim.o.bots;
    for (const bot of [a!, b!, c!]) { bot.active = true; bot.hit = false; bot.row = 400; }
    a!.x = 0; a!.dir = 1; b!.x = 0.3; b!.dir = -1; c!.x = 2.5; c!.dir = -1;
    for (let i = 0; i < 600; i++) {
      sim.advance(IDLE);
      const xs = sim.o.bots.filter((k) => k.active && !k.hit).map((k) => k.x).sort((p, q) => p - q);
      for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeGreaterThanOrEqual(CONFIG.ERASER_GAP - EPS);
      for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(CONFIG.LANE_LIMIT + EPS);
    }
  });
});
