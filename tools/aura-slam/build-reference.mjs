#!/usr/bin/env node
// Compose evidence/aura-slam/{reference.json,trace-*.json,frames-reference.json} from the raw files that
// tools/aura-slam/extract.mjs decoded out of a remote run log.
//   node tools/aura-slam/build-reference.mjs <raw-dir> [--out evidence/aura-slam] [--commit <sha>]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const rawDir = args.find((a) => !a.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
if (!rawDir) { console.error("usage: build-reference.mjs <raw-dir> [--out dir] [--commit sha]"); process.exit(2); }
const out = opt("out", "evidence/aura-slam");
const commit = opt("commit", "unknown");
const root = resolve(new URL("../..", import.meta.url).pathname);
const read = (f) => JSON.parse(readFileSync(join(rawDir, f), "utf8"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);

const gameDir = join(root, "apps/showcase-top-tennis/public/toptennis");
const scripts = Object.fromEntries(readdirSync(gameDir).filter((f) => f.endsWith(".js")).sort().map((f) => [f, sha(join(gameDir, f))]));

const thin = (rows) => rows.filter((r) => r[0] < 200 || r[0] % 50 === 0);
const scenarios = [];
for (const f of readdirSync(rawDir).filter((x) => x.endsWith(".summary.json")).sort()) {
  const id = f.replace(".summary.json", "");
  const summary = read(f);
  const ref = read(`${id}.reference.json`);
  if (ref.trace) { writeFileSync(join(out, `trace-${id}.json`), JSON.stringify({ schema: "a3d-slam-trace/1", scenario: id, columns: ["t", "mode", "phase", "server", "serveNumber", "playerPoints", "aiPoints", "playerGames", "aiGames", "rallyHits", "tiebreak", "bx", "by", "bz", "bvx", "bvy", "bvz", "ballActive", "bounceCount", "lastHit", "ballKph", "px", "py", "pvx", "pvy", "pSwing", "pStroke", "pMoveBlend", "pStride", "ax", "ay", "avx", "avy", "aSwing", "aStroke", "aMoveBlend", "aStride", "message", "energy"], rows: ref.trace }) + "\n"); }
  scenarios.push({
    id,
    setup: { difficulty: ref.difficulty, venue: ref.venue, mode: "single (Quick Match)", fixedStepSeconds: 1 / 60 },
    script: { encoding: "inputs", inputs: ref.inputs, note: ref.inputs.length ? "Key events dispatched on document.body at the listed step (before that step's advanceTime). Produced by the state-only 'human' policy in tests/browser/aura-slam-capture.spec.ts." : "No input: the game's own Auto (autoplay) path plays the player side." },
    reference: { steps: ref.steps, finalMode: ref.finalMode, finalPhase: ref.finalPhase, winner: ref.winner, matchWon: ref.matchWon, score: ref.score, stats: ref.stats, eventCounts: ref.eventCounts, eventCount: ref.eventCount, timeline: ref.timeline, captureSteps: ref.preds, digest: ref.digest, renders: ref.renders },
    events: ref.events,
    sampled: { columns: ["step", "t", "mode", "phase", "server", "serveNumber", "playerPoints", "aiPoints", "playerGames", "aiGames", "rallyHits", "tiebreak", "bx", "by", "bz", "bvx", "bvy", "bvz", "ballActive", "bounceCount", "lastHit", "ballKph", "px", "py", "pvx", "pvy", "pSwing", "pStroke", "pMoveBlend", "pStride", "ax", "ay", "avx", "avy", "aSwing", "aStroke", "aMoveBlend", "aStride", "message", "energy"], note: "every step below 200, then every 50th step", rows: thin(ref.sampled) },
    sessions: summary.sessions, variance: { identical: summary.identical, divergence: summary.divergence ?? [] }
  });
}

const allIdentical = scenarios.filter((s) => s.variance.identical);
const diverging = scenarios.filter((s) => !s.variance.identical).map((s) => ({ id: s.id, divergence: s.variance.divergence }));
const reference = {
  schema: "a3d-crayon-capture/1",
  game: "aura-slam-3d",
  kind: "first-party baseline (own game); not a third-party capture",
  url: "https://aura3d.auraone.ai/apps/showcase-top-tennis/",
  capturedAt: new Date().toISOString(),
  source: { repoCommit: commit, scriptSha256Prefix16: scripts, adapter: "apps/showcase-top-tennis/src/main.ts" },
  method: {
    determinism: "Page booted without ?autoplay; in ONE synchronous evaluate the match is configured through the page's own controls (difficulty button, venue toolbar button, Auto toggle) and launched with TennisMenu.launch(); window.advanceTime(1000/60) is then called once per step so the real-time rAF loop never interleaves (the first advanceTime switches the game to manual stepping). The sim is seeded from game time/serve counters only (no Date.now/Math.random in match-engine.js); audio and tournament code use Math.random but never touch sim state.",
    hooks: ["window.advanceTime(ms)", "window.render_game_to_text()", "window.__TOP_TENNIS_CONTROL__.getState()/getEngine()", "window.TennisMenu.launch()/debug()", "window.TennisLocal.selectVenue()", "wrapped window.TennisEngine.create(opts.onEvent) for engine events", "wrapped window.TennisScene.createRenderer().render to count renders"],
    couplings: ["autoplay and serve-phase player movement/assist-swing live in the Aura3D adapter (stepTopTennisPlayerControl, called from renderer.render once per render): extra renders (window resize, venue change) advance that logic too", "render() is called once per advanceTime(); the port must keep one render per step to reproduce autoplay"],
    viewport: "320x180 for state sessions (render cost is irrelevant to the sim)",
    sessionsPerScenario: scenarios[0]?.sessions.length ?? 0
  },
  scenarios,
  variance: { scenariosIdentical: allIdentical.map((s) => s.id), scenariosDiverging: diverging },
  tolerance: { basis: "digest is an FNV-1a hash over every per-step snapshot rounded to 1e-6; identical sessions mean the sim is bit-reproducible on the same JS engine", exactDigestRequired: allIdentical.map((s) => s.id), sampledAbsTolerance: 1e-6, eventStepTolerance: 0 }
};
writeFileSync(join(out, "reference.json"), JSON.stringify(reference) + "\n");

if (existsSync(join(rawDir, "frames.metrics.json"))) {
  const metrics = read("frames.metrics.json");
  const preds = existsSync(join(rawDir, "frames.predicates.json")) ? read("frames.predicates.json") : null;
  writeFileSync(join(out, "frames-reference.json"), JSON.stringify({ schema: "a3d-slam-frames/1", capturedAt: reference.capturedAt, capture: "fresh page; replay the pure autoplay beginner/hard scenario to the listed step at 320x180; resize the viewport to the target size; one more advanceTime; screenshot (page, DOM HUD included)", predicates: preds, frames: metrics }, null, 1) + "\n");
}
console.log(`reference.json: ${scenarios.length} scenarios, identical=${allIdentical.length}, diverging=${diverging.length}`);
