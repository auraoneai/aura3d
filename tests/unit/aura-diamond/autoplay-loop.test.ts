/**
 * `?autoplay=1` hands-free loop (AUTOPLAY addendum): boots the real main.ts phase machine headless — a stub DOM, a stub
 * renderer app (no GPU) and the real fixed-step sim loop, rules and scene graph — with autoplay on and no input, then
 * drives N simulated seconds of frames. Play must start by itself, make progress (pitches, hits, runs, outs), never stall
 * for 5 s, and roll into a new match after a final.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AUTOPLAY_RESULTS_SEC, AutoplayWatchdog, autoplayRequested, nextAutoplayPark } from "../../../apps/showcase-aura-diamond-3d/src/autoplay";
import { PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

/** A permissive stand-in for any engine/DOM object: every property and call yields another stub; it reads as 0 / "". */
function stub(): any {
  const props = new Map<PropertyKey, unknown>();
  return new Proxy(function () {}, {
    get(_t, p) {
      if (p === "then") return undefined;
      if (p === Symbol.toPrimitive) return (hint: string) => (hint === "string" ? "" : 0);
      if (p === Symbol.iterator) return function* () {};
      if (p === "length") return 0;
      if (p === "toJSON") return () => null;
      if (!props.has(p)) props.set(p, stub());
      return props.get(p);
    },
    set(_t, p, v) {
      props.set(p, v);
      return true;
    },
    apply: () => stub(),
    construct: () => stub()
  });
}

const harness = vi.hoisted(() => ({ frames: [] as ((f: { dt: number }) => void)[] }));

vi.mock("@aura3d/engine", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    createAuraApp: () => {
      const base: Record<string, unknown> = {
        onFrame: (cb: (f: { dt: number }) => void) => harness.frames.push(cb),
        ready: () => Promise.resolve(),
        setScene: () => undefined,
        input: () => ({ update: () => undefined, axis: () => 0, pressed: () => false })
      };
      const fallback = stub();
      return new Proxy(base, { get: (t, p) => (p in t ? t[p as string] : fallback[p]) });
    },
    createGameAudio: () => stub(),
    installQaHooks: () => undefined
  };
});
vi.mock("@aura3d/engine/game", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    warmPrograms: async () => ({}),
    installGameBeacon: () => stub(),
    createFxParticlePass: () => stub(),
    createOverlayDriver: () => stub(),
    createRumbleDriver: () => stub(),
    attachToBone: () => stub(),
    boneWorldPosition: () => null
  };
});
vi.mock("@aura3d/engine/worker", () => ({ createWorkerRendererWorker: () => stub() }));
vi.mock("@aura3d/debug", () => ({ installBlackFrameGuard: () => stub() }));
vi.mock("../../../apps/showcase-port-shared/backend-report", () => ({ publishBackendReport: async () => undefined }));

type DiamondState = {
  mode: string;
  phase: string;
  park: string;
  inning: number;
  half: string;
  outs: number;
  balls: number;
  strikes: number;
  score: { player: number; cpu: number };
  hits: { player: number; cpu: number };
  pitchNo: number;
  gameNo: number;
  over: boolean;
  autopilot: boolean;
  autoplayRecoveries: number;
  simTime: number;
};

const saved: Record<string, unknown> = {};
const GLOBALS = ["window", "document", "localStorage", "requestAnimationFrame", "addEventListener"] as const;

function installDom(search: string): void {
  for (const k of GLOBALS) saved[k] = (globalThis as any)[k];
  const store = new Map<string, string>();
  const g = globalThis as any;
  g.window = g;
  g.location = { search, href: `http://127.0.0.1/${search}`, pathname: "/" };
  g.addEventListener = () => undefined;
  g.removeEventListener = () => undefined;
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined });
  g.innerWidth = 1280;
  g.innerHeight = 720;
  g.devicePixelRatio = 1;
  g.requestAnimationFrame = () => 0;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const element = (): any => {
    const el = stub();
    el.getContext = () => null;
    el.dataset = {};
    el.style = { setProperty: () => undefined };
    return el;
  };
  g.document = {
    readyState: "complete",
    hidden: false,
    body: element(),
    documentElement: element(),
    getElementById: (id: string) => (id === "app" ? element() : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => element(),
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };
}

describe("autoplay rules (src/autoplay.ts)", () => {
  it("?autoplay=1, ?autopilot=1 and ?demo=1 turn it on; nothing else does", () => {
    expect(autoplayRequested("?autoplay=1")).toBe(true);
    expect(autoplayRequested("?autopilot=1&park=ivy")).toBe(true);
    expect(autoplayRequested("?demo=1")).toBe(true);
    expect(autoplayRequested("")).toBe(false);
    expect(autoplayRequested("?autoplay=0")).toBe(false);
  });

  it("cycles every ballpark forever unless ?park= pins one", () => {
    let p = PARK_ORDER[0]!;
    const seen = new Set<string>();
    for (let i = 0; i < PARK_ORDER.length * 2; i++) {
      seen.add(p);
      p = nextAutoplayPark(p, false);
    }
    expect(seen.size).toBe(PARK_ORDER.length);
    expect(nextAutoplayPark("ivy", true)).toBe("ivy");
  });

  it("the watchdog fires only after the signature has been frozen for its limit", () => {
    const w = new AutoplayWatchdog(5);
    for (let t = 0; t < 4.9; t += 0.1) expect(w.note("a", 0.1)).toBe(false);
    expect(w.note("b", 0.1)).toBe(false);
    let fired = false;
    for (let t = 0; t < 5.2 && !fired; t += 0.1) fired = w.note("b", 0.1);
    expect(fired).toBe(true);
    expect(w.recoveries).toBe(1);
  });
});

describe("autoplay drives the real game loop hands-free", () => {
  let state: () => DiamondState;
  const FRAME = 0.05; // the frame clamp: 6 fixed steps of 1/120 s per frame

  beforeAll(async () => {
    installDom("?autoplay=1&tier=low");
    await import("../../../apps/showcase-aura-diamond-3d/src/main");
    // Let the boot's asset/warm promise chain settle (appReady).
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    const hook = (globalThis as any).__AURA3D_GAME_DIAMOND__;
    expect(hook, "main.ts booted and published its hook").toBeTruthy();
    state = hook.state;
  }, 120_000);

  afterAll(() => {
    for (const k of GLOBALS) (globalThis as any)[k] = saved[k];
  });

  it("starts by itself, plays competently on both sides, never stalls 5 s, and restarts after the final", async () => {
    expect(harness.frames.length).toBeGreaterThan(0);
    const step = (): void => {
      for (const f of harness.frames) f({ dt: FRAME });
    };
    const first = state();
    expect(first.autopilot).toBe(true);
    expect(first.phase).not.toBe("menu");

    // Play starts within ~3 s: the first pitch is thrown.
    let t = 0;
    while (state().pitchNo === 0 && t < 3) {
      step();
      t += FRAME;
    }
    expect(state().pitchNo, `first pitch after ${t.toFixed(2)} s`).toBeGreaterThan(0);

    const SIM_SECONDS = 3600;
    let lastSig = "";
    let still = 0;
    let longestStill = 0;
    let longestStillAt = "";
    let maxPitch = 0;
    let maxOuts = 0;
    let runs = 0;
    let hits = 0;
    const games = new Set<number>([state().gameNo]);
    const parks = new Set<string>([state().park]);
    const phases = new Set<string>();
    let finals = 0;
    let wasOver = false;
    let gameoverHold = 0;
    let longestGameover = 0;
    for (let n = 0; n < SIM_SECONDS / FRAME; n++) {
      // Let promise chains (a park switch re-warms with the sim held) settle as they would between real frames.
      if (n % 20 === 0) await new Promise((r) => setTimeout(r, 0));
      step();
      const s = state();
      phases.add(s.phase);
      maxPitch = Math.max(maxPitch, s.pitchNo);
      maxOuts = Math.max(maxOuts, s.outs);
      runs = Math.max(runs, s.score.player + s.score.cpu);
      hits = Math.max(hits, s.hits.player + s.hits.cpu);
      games.add(s.gameNo);
      parks.add(s.park);
      if (s.over && !wasOver) finals++;
      wasOver = s.over;
      gameoverHold = s.phase === "gameover" ? gameoverHold + FRAME : 0;
      longestGameover = Math.max(longestGameover, gameoverHold);
      // Progress: anything about the play moves (the sim clock alone does not count).
      const sig = `${s.mode}|${s.phase}|${s.inning}${s.half}|${s.outs}|${s.balls}-${s.strikes}|${s.score.player}-${s.score.cpu}|${s.pitchNo}|${s.gameNo}`;
      if (sig === lastSig && s.phase !== "batted") still += FRAME;
      else still = 0;
      lastSig = sig;
      if (still > longestStill) {
        longestStill = still;
        longestStillAt = sig;
      }
      // Done once a final has rolled into a new match that is already pitching.
      if (finals >= 1 && games.size >= 2 && !s.over && s.pitchNo > 0) break;
    }
    const s = state();
    const summary = `pitches=${maxPitch} hits=${hits} runs=${runs} games=${games.size} finals=${finals} parks=${[...parks].join(",")} phases=${[...phases].join(",")} recoveries=${s.autoplayRecoveries} longestStill=${longestStill.toFixed(2)}s at ${longestStillAt}`;
    console.info(`[autoplay-loop] ${summary} simTime=${s.simTime.toFixed(0)}s`);
    expect(maxPitch, summary).toBeGreaterThan(20);
    expect(hits, summary).toBeGreaterThan(0);
    expect(runs, summary).toBeGreaterThan(0);
    expect(maxOuts, summary).toBeGreaterThan(0);
    // The human side pitches too (pitch select and meter run under autoplay) and the CPU side bats.
    expect(phases.has("pitchSelect") && phases.has("pitchMeter"), summary).toBe(true);
    expect(longestStill, summary).toBeLessThan(5);
    expect(s.autoplayRecoveries, summary).toBe(0);
    // A final shows results ~3 s, then the next match starts in the next ballpark.
    expect(finals, summary).toBeGreaterThanOrEqual(1);
    expect(games.size, summary).toBeGreaterThanOrEqual(2);
    expect(parks.size, summary).toBeGreaterThanOrEqual(2);
    expect(longestGameover, summary).toBeLessThan(AUTOPLAY_RESULTS_SEC + 0.5);
  }, 600_000);
});
