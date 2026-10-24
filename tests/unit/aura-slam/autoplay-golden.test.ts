import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { engineModule } from "../../../examples/aura-slam/sim/engine";
import { appearance as appearanceTs } from "../../../examples/aura-slam/sim/appearance";
import { roster as rosterTs } from "../../../examples/aura-slam/sim/roster";
import { createMatchEngine } from "../../../examples/aura-slam/sim/create";
import { humanPolicy, mulberry32 } from "../../browser/aura-slam-policy";

/**
 * Autoplay golden (docs/aura-slam/ARCHITECTURE.md G1/G4 support): a seeded scripted human plays full matches against the
 * CPU on (a) the ORIGINAL match-engine.js and (b) the shipped native engine; the digests must be identical. The result is
 * written to tests/browser/aura-slam-golden.json, which the remote browser spec replays inside a real browser against the
 * same engine code (the runner image does not ship the original scripts). UPDATE_GOLDEN=1 rewrites the file.
 */
const DIR = fileURLToPath(new URL("../../../tests/fixtures/aura-slam-original/toptennis/", import.meta.url));
const GOLDEN = fileURLToPath(new URL("../../browser/aura-slam-golden.json", import.meta.url));

function loadUmd(file: string, modules: Record<string, unknown> = {}): any {
  const source = readFileSync(DIR + file, "utf8");
  const module = { exports: {} as any };
  new Function("module", "require", "exports", source)(module, (name: string) => modules[name], module.exports);
  return module.exports;
}
const physicsJs = loadUmd("physics.js");
const strokesJs = loadUmd("strokes.js", { "./physics.js": physicsJs });
const Original = loadUmd("match-engine.js", {
  "./physics.js": physicsJs, "./strokes.js": strokesJs, "./player-roster.js": loadUmd("player-roster.js"), "./player-appearance.js": loadUmd("player-appearance.js")
});
void engineModule; void appearanceTs; void rosterTs;

/** Digest of a snapshot with numbers rounded to 1e-6: libm rounding differs between the Mac arm64 and the Linux x64 runner by about 1e-16. */
const round = (_k: string, v: unknown): unknown => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v);
const digest = (engine: { snapshot(): unknown }): string => fnv(JSON.stringify(engine.snapshot(), round));
const fnv = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
};

export interface AutoplayScenario { options: Record<string, unknown>; seed: number; maxTicks: number; every: number }
export interface AutoplayResult { checkpoints: Array<{ tick: number; hash: string }>; final: { tick: number; mode: string; winner: string | null; games: [number, number]; events: number; hash: string } }

function play(engine: any, scenario: AutoplayScenario, events: { n: number }): AutoplayResult {
  const rng = mulberry32(scenario.seed);
  const checkpoints: AutoplayResult["checkpoints"] = [];
  let tick = 0;
  for (; tick < scenario.maxTicks; tick++) {
    humanPolicy(engine, rng, tick);
    engine.step(1 / 60);
    if (tick % scenario.every === 0) checkpoints.push({ tick, hash: digest(engine) });
    if (engine.state.mode === "gameover") break;
  }
  const s = engine.state;
  return { checkpoints, final: { tick, mode: s.mode, winner: s.winner ?? null, games: [s.score.playerGames, s.score.aiGames], events: events.n, hash: digest(engine) } };
}

const SCENARIOS: AutoplayScenario[] = [
  { options: { difficulty: "club", venue: "hard" }, seed: 20261023, maxTicks: 400_000, every: 2000 },
  { options: { difficulty: "pro", venue: "clay" }, seed: 7, maxTicks: 400_000, every: 2000 }
];

describe("aura-slam autoplay golden", () => {
  it("the original engine and the shipped native engine play identical full matches", () => {
    const out: Array<{ scenario: AutoplayScenario; result: AutoplayResult }> = [];
    for (const scenario of SCENARIOS) {
      const eo = { n: 0 }, en = { n: 0 };
      const a = Original.create({ ...scenario.options, onEvent: () => { eo.n++; } });
      const b = (createMatchEngine as any)({ ...scenario.options, onEvent: () => { en.n++; } });
      const ra = play(a, scenario, eo);
      const rb = play(b, scenario, en);
      expect(rb.final, `${JSON.stringify(scenario.options)} final`).toEqual(ra.final);
      expect(rb.checkpoints).toEqual(ra.checkpoints);
      expect(ra.final.mode, "the scripted match completes").toBe("gameover");
      expect(ra.final.games[0] + ra.final.games[1], "at least one game was played").toBeGreaterThan(0);
      out.push({ scenario, result: ra });
    }
    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(GOLDEN)) writeFileSync(GOLDEN, JSON.stringify({ generatedBy: "tests/unit/aura-slam/autoplay-golden.test.ts", scenarios: out }, null, 1) + "\n");
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { scenarios: typeof out };
    expect(golden.scenarios).toEqual(out);
  });
});
