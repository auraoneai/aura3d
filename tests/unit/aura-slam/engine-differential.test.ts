import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { engineModule } from "../../../examples/aura-slam/sim/engine";
import { appearance as appearanceTs } from "../../../examples/aura-slam/sim/appearance";
import { roster as rosterTs } from "../../../examples/aura-slam/sim/roster";
import { SERVE, SHOT, makeServeStats } from "../../../examples/aura-slam/sim/serve";
import { SERVE_CPU } from "../../../examples/aura-slam/sim/aiTables";
import { pointLabel } from "../../../examples/aura-slam/sim/scoring";
import { physics as physicsTs } from "../../../examples/aura-slam/sim/physics";
import { strokes as strokesTs } from "../../../examples/aura-slam/sim/strokes";
import { createMatchEngine, viewMatch } from "../../../examples/aura-slam/sim/create";
import { DIFFICULTY_LEVELS, GRAVITY, MATCH_RULES } from "../../../examples/aura-slam/contract";

const DIR = fileURLToPath(new URL("../../../tests/fixtures/aura-slam-original/toptennis/", import.meta.url));
/** The originals are UMD scripts in an ES-module package: evaluate them as CommonJS data with an explicit require table. */
function loadUmd(file: string, modules: Record<string, unknown> = {}): any {
  const source = readFileSync(DIR + file, "utf8");
  const module = { exports: {} as any };
  new Function("module", "require", "exports", source)(module, (name: string) => modules[name], module.exports);
  return module.exports;
}
const physics = loadUmd("physics.js");
const strokes = loadUmd("strokes.js", { "./physics.js": physics });
const rosterJs = loadUmd("player-roster.js");
const appearanceJs = loadUmd("player-appearance.js");
const Original = loadUmd("match-engine.js", { "./physics.js": physics, "./strokes.js": strokes, "./player-roster.js": rosterJs, "./player-appearance.js": appearanceJs });
const Ported = engineModule(physics, strokes, rosterTs, appearanceTs);
/** The shipped wiring: typed physics and strokes as well. */
const PortedTyped = engineModule(physicsTs, strokesTs, rosterTs, appearanceTs);

type AnyEngine = ReturnType<typeof Original.create>;

const seededDraw = (i: number) => { const x = Math.sin(i * 9283.17 + 78.31) * 43758.5453; return x - Math.floor(x); };

/**
 * A deterministic human player, a pure function of the engine state and the tick: serves on the toss apex, tracks the
 * incoming ball's landing point, swings when it is in reach (missing a seeded fraction of the time) and varies presets.
 */
function makePolicy(missRate: number) {
  return (engine: AnyEngine, tick: number): Record<string, unknown> => {
    const s = engine.state;
    const ball = s.ball;
    const me = s.player;
    const input: Record<string, unknown> = { x: 0, y: 0, vertical: false, power: false };
    if (s.phase === "serve") {
      if (s.server === "player" && tick % 30 === 3) Object.assign(input, { serveAimX: Math.sin(tick * 0.013) * 0.6, serveAimY: 0.4, swing: true });
      return input;
    }
    if (s.phase === "serveToss") {
      if (s.server === "player") Object.assign(input, { serveAimX: Math.sin(tick * 0.013) * 0.6, serveAimY: 0.4, swing: ball.vz <= 0.4 });
      return input;
    }
    const incoming = ball.lastHit === "ai" && ball.vy > 0;
    let tx = incoming ? physics.landing(ball).x : 0;
    if (incoming && Number.isFinite(ball.targetX)) tx = ball.targetX;
    input.x = Math.max(-1, Math.min(1, (tx - me.x) * 8));
    input.y = Math.max(-1, Math.min(1, ((incoming ? 0.85 : 0.77) - me.y) * 4));
    input.shot = ["neutral", "short", "deep", "lob"][Math.floor(tick / 331) % 4];
    input.power = tick % 313 < 40;
    if (incoming && ball.y > 0.45 && ball.y < 1.0 && Math.abs(ball.x - me.x) < 0.3 && seededDraw(tick * 0.37) >= missRate) input.swing = true;
    return input;
  };
}

function run(ticks: number, options: Record<string, unknown>, missRate = 0.2, Port: typeof Ported = Ported) {
  const policy = makePolicy(missRate);
  const logA: unknown[] = [];
  const logB: unknown[] = [];
  const a = Original.create({ ...options, onEvent: (e: unknown) => logA.push(clean(e)) });
  const b = Port.create({ ...options, onEvent: (e: unknown) => logB.push(clean(e)) });
  let maxPoints = 0;
  let firstDiff: string | null = null;
  for (let tick = 0; tick < ticks; tick++) {
    const input = policy(a, tick);
    a.applyInput("player", input);
    b.applyInput("player", input);
    a.step(1 / 60);
    b.step(1 / 60);
    // Cheap invariants every tick, the full deep state every 20 ticks and on any event: keeps the run fast without hiding drift.
    const cheapA = fingerprint(a.state);
    const cheapB = fingerprint(b.state);
    if (cheapA !== cheapB && firstDiff === null) firstDiff = `tick ${tick} (fingerprint)`;
    if (tick % 20 === 0 && firstDiff === null && JSON.stringify(a.state) !== JSON.stringify(b.state)) firstDiff = `tick ${tick} (deep)`;
    maxPoints = Math.max(maxPoints, a.state.score.playerPoints + a.state.score.aiPoints + 4 * (a.state.score.playerGames + a.state.score.aiGames));
  }
  return { a, b, logA, logB, firstDiff, maxPoints };
}
const fingerprint = (s: any) => [s.tick, s.phase, s.server, s.ball.x, s.ball.y, s.ball.z, s.ball.vx, s.ball.vy, s.ball.vz, s.player.x, s.player.y, s.ai.x, s.ai.y, s.score.playerPoints, s.score.aiPoints, s.score.playerGames, s.score.aiGames, s.rallyHits].join("|");
const clean = (e: unknown) => JSON.parse(JSON.stringify(e));

describe("ported match engine is identical to match-engine.js", () => {
  it("roster and appearance data modules match the originals", () => {
    expect(JSON.stringify(rosterTs)).toBe(JSON.stringify(rosterJs));
    expect(JSON.stringify(appearanceTs)).toBe(JSON.stringify(appearanceJs));
  });

  const cases: Array<[string, Record<string, unknown>, number, number]> = [
    ["beginner hard, strong player", { difficulty: "beginner", venue: "hard" }, 12000, 0],
    ["club grass", { difficulty: "club", venue: "grass" }, 12000, 0.2],
    ["ace clay", { difficulty: "ace", venue: "clay" }, 12000, 0.3],
    ["pro hard", { difficulty: "pro", venue: "hard" }, 12000, 0.2],
    ["legend hard, weak player", { difficulty: "legend", venue: "hard" }, 12000, 0.5],
    ["legend, rival serves first", { difficulty: "legend", venue: "grass", firstServer: "ai" }, 12000, 0.1],
    ["beginner desert", { difficulty: "beginner", venue: "desert" }, 12000, 0.4],
  ];
  for (const [name, options, ticks, miss] of cases) {
    it(`state and events are identical every tick: ${name}`, () => {
      const r = run(ticks, options, miss);
      expect(r.firstDiff).toBeNull();
      expect(r.logB).toEqual(r.logA);
      expect(r.logA.length).toBeGreaterThan(100);
      expect(r.maxPoints).toBeGreaterThan(3);
    }, 120000);
  }

  it("snapshot/restore round trip is identical", () => {
    const a = Original.create({ difficulty: "pro" });
    const b = Ported.create({ difficulty: "pro" });
    for (let t = 0; t < 1500; t++) { const i = makePolicy(0.2)(a, t); a.applyInput("player", i); b.applyInput("player", i); a.step(1 / 60); b.step(1 / 60); }
    const snapA = a.snapshot();
    const snapB = b.snapshot();
    expect(snapB).toEqual(snapA);
    for (let t = 1500; t < 2500; t++) { const i = makePolicy(0.2)(a, t); a.applyInput("player", i); a.step(1 / 60); }
    a.restore(snapA);
    b.restore(snapB);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    for (let t = 1500; t < 2200; t++) { const i = makePolicy(0.2)(a, t); a.applyInput("player", i); b.applyInput("player", i); a.step(1 / 60); b.step(1 / 60); }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });

  it("view() mirrors the same snapshot identically for both sides", () => {
    const a = Original.create({ difficulty: "club" });
    const b = Ported.create({ difficulty: "club" });
    for (let t = 0; t < 900; t++) { const i = makePolicy(0.2)(a, t); a.applyInput("player", i); b.applyInput("player", i); a.step(1 / 60); b.step(1 / 60); }
    for (const side of ["player", "ai"]) expect(JSON.stringify(Ported.view(b.snapshot(), side))).toBe(JSON.stringify(Original.view(a.snapshot(), side)));
  });

  it("typed constants equal the original tables and physics", () => {
    expect(GRAVITY).toBe(physics.GRAVITY);
    expect(JSON.parse(JSON.stringify(SERVE))).toEqual(JSON.parse(JSON.stringify(Original.SERVE)));
    expect(JSON.parse(JSON.stringify(SHOT))).toEqual(JSON.parse(JSON.stringify(Original.SHOT)));
    expect(JSON.parse(JSON.stringify(SERVE_CPU))).toEqual(JSON.parse(JSON.stringify(Original.SERVE_CPU)));
    expect(Object.is(SERVE.apexZ, Original.SERVE.apexZ)).toBe(true);
    const engine = Original.create();
    expect(DIFFICULTY_LEVELS).toEqual(Object.fromEntries(["beginner", "club", "ace", "pro", "legend"].map((d) => (engine.state.difficulty = d, [d, { ...engine.level() }]))));
    expect(makeServeStats()).toEqual(engine.state.stats.serve);
    expect(MATCH_RULES).toMatchObject({ pointsToGame: 4, winBy: 2, gamesToMatch: 3, tiebreakAt: 3, tiebreakPoints: 7, pointResultDelay: 1.65, matchWonDelay: 2 });
  });

  it("pointLabel matches the original over every score pair", () => {
    const engine = Original.create();
    for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) expect(pointLabel(a, b)).toBe(engine.pointLabel(a, b));
  });

  it("seeded() draws are bit-identical", () => {
    const a = Original.create();
    const b = Ported.create();
    for (let i = -50; i < 5000; i += 7) expect(Object.is(b.seeded(i), a.seeded(i))).toBe(true);
  });
});

describe("scoring rules: awardPoint sequences match the original (game, deuce, advantage, 3-3 tiebreak, match point)", () => {
  type Seq = Array<"player" | "ai">;
  const repeat = (side: "player" | "ai", n: number): Seq => Array.from({ length: n }, () => side);
  const game = (side: "player" | "ai"): Seq => repeat(side, 4);
  const deuceGame = (side: "player" | "ai"): Seq => ["player", "ai", "player", "ai", "player", "ai", side === "player" ? "player" : "ai", side === "player" ? "player" : "ai"];
  const sequences: Array<[string, Seq, Record<string, unknown>?]> = [
    ["love game then deuce game", [...game("player"), ...deuceGame("ai")]],
    ["advantage swings", ["player", "player", "player", "ai", "ai", "ai", "player", "ai", "player", "ai", "ai", "ai"]],
    ["3-0 shutout match", [...game("player"), ...game("player"), ...game("player")]],
    ["3-3 into a tiebreak the player wins", [...game("player"), ...game("ai"), ...game("player"), ...game("ai"), ...game("player"), ...game("ai"), ...repeat("player", 7)]],
    ["tiebreak decided 9-7 for the rival", [...game("player"), ...game("ai"), ...game("player"), ...game("ai"), ...game("player"), ...game("ai"), ...Array.from({ length: 6 }, () => ["player", "ai"] as Seq).flat(), "player", "ai", "ai", "ai"]],
    ["rival serves first, 3-1 then 3-2 close", [...game("ai"), ...game("player"), ...game("ai"), ...game("player"), ...game("ai"), ...game("ai")], { firstServer: "ai" }],
  ];
  for (const [name, seq, extra] of sequences) {
    it(name, () => {
      const options = { difficulty: "club", venue: "hard", ...extra };
      const logA: unknown[] = [];
      const logB: unknown[] = [];
      const a = Original.create({ ...options, onEvent: (e: unknown) => logA.push(clean(e)) });
      const b = Ported.create({ ...options, onEvent: (e: unknown) => logB.push(clean(e)) });
      let steps = 0;
      let sawTiebreak = false;
      let sawMatchWon = false;
      for (const winner of seq) {
        if (a.state.mode !== "playing") break;
        for (const engine of [a, b]) { engine.state.phase = "rally"; engine.awardPoint(winner, "WINNER"); }
        for (let i = 0; i < 400 && a.state.phase === "point"; i++, steps++) { a.step(1 / 60); b.step(1 / 60); }
        expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
        sawTiebreak ||= a.state.tiebreak;
        sawMatchWon ||= a.state.matchWon;
      }
      expect(logB).toEqual(logA);
      expect(steps).toBeGreaterThan(0);
      if (/tiebreak/.test(name)) expect(sawTiebreak).toBe(true);
      if (/match|tiebreak/.test(name)) expect(sawMatchWon).toBe(true);
    });
  }
});

describe("shipped wiring (typed physics + strokes + create.ts) is identical to the original", () => {
  const cases: Array<[string, Record<string, unknown>, number]> = [
    ["beginner hard", { difficulty: "beginner", venue: "hard" }, 0],
    ["club grass", { difficulty: "club", venue: "grass" }, 0.2],
    ["ace clay", { difficulty: "ace", venue: "clay" }, 0.3],
    ["pro hard", { difficulty: "pro", venue: "hard" }, 0.2],
    ["legend, rival serves first", { difficulty: "legend", venue: "grass", firstServer: "ai" }, 0.1],
    ["beginner desert", { difficulty: "beginner", venue: "desert" }, 0.4],
  ];
  for (const [name, options, miss] of cases) {
    it(`${name}: 12000 ticks, state and events`, () => {
      const r = run(12000, options, miss, PortedTyped);
      expect(r.firstDiff).toBeNull();
      expect(r.logB).toEqual(r.logA);
      expect(r.logA.length).toBeGreaterThan(100);
    }, 120000);
  }
  it("createMatchEngine/viewMatch from create.ts behave like the original", () => {
    const a = Original.create({ difficulty: "pro" });
    const b = createMatchEngine({ difficulty: "pro" });
    const policy = makePolicy(0.2);
    for (let t = 0; t < 2000; t++) { const i = policy(a, t); a.applyInput("player", i); b.applyInput("player", i as never); a.step(1 / 60); b.step(1 / 60); }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    for (const side of ["player", "ai"] as const) expect(JSON.stringify(viewMatch(b.snapshot(), side))).toBe(JSON.stringify(Original.view(a.snapshot(), side)));
  });
});
