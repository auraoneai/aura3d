import { afterAll, describe, expect, it } from "vitest";
import { injectedEngine, pristineEngine, shippedEngine, useShipped } from "./oracle";
import { humanPolicy, mulberry32 } from "./scenario";

const DIFFICULTIES = ["beginner", "club", "ace", "pro", "legend"] as const;
const VENUES = ["hard", "grass", "clay"] as const;

/** Snapshots of realistic mid-match states, captured from the pristine engine under the scripted human policy. */
function captureSnapshots(count: number): Array<{ snap: any; difficulty: string; venue: string }> {
  const out: Array<{ snap: any; difficulty: string; venue: string }> = [];
  const Pristine = pristineEngine();
  let k = 0;
  while (out.length < count) {
    const difficulty = DIFFICULTIES[k % 5], venue = VENUES[Math.floor(k / 5) % 3];
    const E = Pristine.create({ difficulty, venue, allowSwipe: k % 4 === 3, controlStyle: k % 4 === 3 ? "swipe" : "classic" });
    const rng = mulberry32(777 + k);
    const steps = 400 + Math.floor(rng() * 2600);
    for (let i = 0; i < steps; i++) {
      humanPolicy(E, rng, i, k % 4 === 3);
      E.step(1 / 60);
      if (i > 120 && i % Math.max(40, Math.floor(steps / 6)) === 0) out.push({ snap: E.snapshot(), difficulty, venue });
    }
    k++;
  }
  return out;
}

const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
const u = (rng: () => number, a: number, b: number) => a + (b - a) * rng();

/** Identical random perturbation of both engines' state (pure function of the rng stream). */
function mutate(E: any, rng: () => number): void {
  const s = E.state, b = s.ball, ai = s.ai, p = s.player;
  if (rng() < 0.8) { b.x = u(rng, -1.1, 1.1); b.y = u(rng, -1.1, 1.1); b.z = u(rng, 0, 1); b.vx = u(rng, -1.2, 1.2); b.vy = u(rng, -3, 3); b.vz = u(rng, -2, 2); }
  if (rng() < 0.5) { b.lastHit = pick(rng, ["player", "ai"]); b.bounceCount = Math.floor(rng() * 3); b.targetX = rng() < 0.2 ? null : u(rng, -1, 1); b.targetY = rng() < 0.2 ? null : u(rng, -1, 1); b.active = rng() < 0.9; b.shotType = pick(rng, ["serve", "neutral", "deep", "short", "lob"]); }
  if (rng() < 0.7) { ai.x = u(rng, -1, 1); ai.y = u(rng, -1.1, -0.1); ai.vx = u(rng, -1, 1); ai.vy = u(rng, -1, 1); }
  if (rng() < 0.7) { p.x = u(rng, -1, 1); p.y = u(rng, 0.1, 1.1); p.vx = u(rng, -1, 1); p.vy = u(rng, -1, 1); }
  if (rng() < 0.5) { s.rallyHits = Math.floor(rng() * 12); s.rallyTime = u(rng, 0, 20); s.time += u(rng, 0, 5); }
  if (rng() < 0.3) { ai.swingAge = u(rng, 0, 0.5); ai.swing = rng() < 0.5 ? 0 : u(rng, 0, 1); ai.swingCooldown = rng() < 0.5 ? 0 : u(rng, 0, 0.5); }
  if (rng() < 0.3) { s.phase = pick(rng, ["rally", "serve", "serveToss", "point"]); s.server = pick(rng, ["player", "ai"]); s.serveNumber = rng() < 0.5 ? 1 : 2; }
}

const side = (rng: () => number) => pick(rng, ["player", "ai"] as const);
const bool = (rng: () => number) => rng() < 0.5;
type ArgGen = (E: any, rng: () => number) => any[];
const randBall = (E: any, rng: () => number) => { const b = JSON.parse(JSON.stringify(E.state.ball)); b.x = u(rng, -1.1, 1.1); b.y = u(rng, -1.1, 1.1); b.z = u(rng, 0, 1); b.vx = u(rng, -1.2, 1.2); b.vy = u(rng, -3, 3); b.vz = u(rng, -2, 2); b.bounceCount = Math.floor(rng() * 3); return b; };
const randPoint = (rng: () => number) => ({ x: u(rng, -1, 1), y: u(rng, -1.1, 1.1) });
const randRead = (E: any, r: () => number) => {
  const t0 = E.state.time;
  const ball = () => ({ x: u(r, -1, 1), y: u(r, -1.1, 0.4), z: u(r, 0.02, 0.9), vx: u(r, -1, 1), vy: u(r, -2, 2), vz: u(r, -1.5, 1.5), bounceCount: Math.floor(r() * 3), active: r() < 0.9, crossedNet: bool(r), isServe: bool(r), shotType: "serve", lastHit: "player", serveOriginX: u(r, -0.5, 0.5) });
  const read: any = { previous: { x: u(r, -1, 1), y: u(r, -1.1, 0.4), z: u(r, 0.02, 0.9), bounceCount: Math.floor(r() * 3), time: t0 - u(r, 0.01, 0.3) }, errorX: u(r, -0.05, 0.05), errorY: u(r, -0.05, 0.05), speedError: u(r, -0.1, 0.1), nextAt: t0 };
  if (r() < 0.85) { read.observed = ball(); read.observedAt = t0 - u(r, 0.01, 0.3); }
  return read;
};
const GEN: Record<string, ArgGen> = {
  makeSwipeState: (_E, r) => [pick(r, ["swipe", "classic", undefined])],
  swipeEligible: () => [], swipeActive: () => [], swipeBallKey: () => [], clearSwipeAttempt: () => [],
  swipeBoundary: (_E, r) => [bool(r)], setControlStyle: (_E, r) => [pick(r, ["swipe", "classic", "x"])],
  cancelSwipeShot: () => [], recordSwipeFlight: () => [], getSwipeState: () => [],
  queueSwipeShot: (_E, r) => [{ targetX: u(r, -1, 1), targetDepth: r(), directionX: u(r, -1, 1), directionY: -1, strength: r() }],
  swipeMove: (E, r) => [E.state.player, randPoint(r), 1 / 60, bool(r)],
  swipeIntercept: () => [], swipeContactAhead: () => [1 / 60], updateSwipePlayer: () => [1 / 60],
  personalityWeight: (_E, r) => [pick(r, ["crosscourt", "open-court", "wrong-foot", "change-pace", "drop", "volley-finish", "approach"])],
  makeAITactics: () => [], serveAnticipation: (E, r) => [E.getServeGeometry(side(r))], serveReceiverDepth: () => [],
  planCPUServe: () => [], overheadTarget: (E, r) => [randBall(E, r)], advanceReturnPrediction: (E, r) => [randBall(E, r), pick(r, [1 / 60, 0.1, 0.3])],
  canPrepareAceReturn: (E, r) => [E.state.ai, randBall(E, r), bool(r)], moveServeReceiver: (E, r) => [E.state.ai, randPoint(r), 1 / 60, bool(r)],
  moveAI: (E, r) => [E.state.ai, randPoint(r), 1 / 60, bool(r), bool(r)], copyAIRunner: () => [], proBalanceLoad: () => [],
  proContactPressure: (E, r) => [E.state.ai, randBall(E, r), r()], recordProContact: (_E, r) => [r()], readProPattern: () => [],
  readLegendPattern: (E, r) => [E.state.ai.pro], canReachAITarget: (_E, r) => [randPoint(r), u(r, 0, 1.2), u(r, 0, 0.4), u(r, 0, 0.3)],
  aceSwingContact: (_E, r) => [1 / 60, bool(r), bool(r), bool(r)], proBalancedContactAhead: (E) => [E.state.ai, 1 / 60], proCanWaitForBalancedReturn: () => [1 / 60],
  netVolleyTarget: (E, r) => [randBall(E, r)], contactTarget: (E, r) => [randBall(E, r), side(r)], scheduleAIRead: () => [], aiRecoveryTarget: () => [],
  updateAI: (_E, r) => [pick(r, [1 / 60, 1 / 30])], predictObservedServe: (E, r) => { const rd = randRead(E, r); return [rd, E.state.time + u(r, 0, 0.6)]; },
  observeServe: (E, r) => { const rd = randRead(E, r); return [rd, E.state.time + u(r, 0.0, 0.2)]; },
  updateServeReceiver: (E, r) => { if (r() < 0.9) E.state.ai.serveRead = randRead(E, r); return [1 / 60]; }, observedServeIntercept: (E, r) => { const rd = randRead(E, r); return [rd, E.state.time + u(r, 0, 0.3)]; },
  chooseAIShot: () => [], canContinueNet: (_E, r) => [r(), { name: "x", net: bool(r), shot: "neutral", targetX: u(r, -1, 1), pace: r() }],
  basicNetPlan: (_E, r) => [r(), u(r, -1, 1), side(r)], netReplyPlan: (_E, r) => [r()], legendShotPlan: (_E, r) => [r()], proShotPlan: (_E, r) => [r()],
  aiServeReturnPlan: (_E, r) => [r()], aiShotPlan: (_E, r) => [r()], aiRallyShotPlan: (_E, r) => [r()],
  basicPersonalityPlan: (_E, r) => [r(), side(r), u(r, 0.2, 1), bool(r)], serveBalancedContactAhead: (E, r) => [E.state.ai, 1 / 60, r()],
};

function attempt(fn: (...a: any[]) => any, args: any[]): { ok: true; value: string } | { ok: false; error: string } {
  try { const v = fn(...args); return { ok: true, value: JSON.stringify(v === undefined ? "__undefined__" : v) }; }
  catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

describe("M-AI/swipe: every owned function matches the original on randomised engine states", () => {
  const snaps = captureSnapshots(40);
  const Pristine = pristineEngine();
  const Injected = useShipped ? shippedEngine() : injectedEngine();
  const names = Object.keys(GEN);
  const stats: string[] = [];
  afterAll(() => { console.log("FUZZSTATS\n" + stats.join("\n")); });
  it("covers every owned function", async () => {
    const { AI_OWNED_NAMES } = await import("../../../examples/aura-slam/sim/ai");
    const { SWIPE_OWNED_NAMES } = await import("../../../examples/aura-slam/sim/swipe");
    const owned = [...AI_OWNED_NAMES, ...SWIPE_OWNED_NAMES].filter((n) => !["netPreference", "cpuStyle"].includes(n)).sort();
    expect(names.sort()).toEqual(owned);
  });
  for (const name of names) {
    it(`${name}: 300 randomised cases identical (result, thrown error and resulting state)`, () => {
      let compared = 0, threw = 0;
      for (let c = 0; c < 300; c++) {
        const pool = name === "readLegendPattern" ? snaps.filter((s) => s.difficulty === "pro" || s.difficulty === "legend") : snaps;
        const { snap, difficulty, venue } = pool[c % pool.length]!;
        const swipeFn = /^(swipe|recordSwipe|updateSwipe|queueSwipe|clearSwipe|cancelSwipe|getSwipe|setControl|makeSwipe)/.test(name);
        const o = { difficulty, venue, allowSwipe: swipeFn || c % 3 === 0, controlStyle: swipeFn || c % 3 === 0 ? "swipe" : "classic" };
        const A = Pristine.create(o), B = Injected.create(o);
        A.restore(snap); B.restore(snap);
        if (swipeFn) { A.setControlStyle("swipe"); B.setControlStyle("swipe"); }
        const seed = 90000 + c * 31 + name.length;
        const ma = mulberry32(seed), mb = mulberry32(seed);
        mutate(A, ma); mutate(B, mb);
        const aa = GEN[name]!(A, ma), ab = GEN[name]!(B, mb);
        const ra = attempt(A.__fn[name], aa), rb = attempt(B.__fn[name], ab);
        expect(rb).toEqual(ra);
        expect(JSON.stringify(B.snapshot())).toBe(JSON.stringify(A.snapshot()));
        compared++; if (!ra.ok) threw++;
      }
      stats.push(`${name}: ${compared} cases, ${threw} threw (identically)`);
      expect(compared).toBe(300);
      expect(threw).toBeLessThan(250);
    }, 120_000);
  }
});
