import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";
import { parseArgs } from "./index.mjs";
import {
  MOTION_DEFAULTS, analyzeMotion, buildMotionScenario, captureMotionFrames, evaluateMotionRow, extractScreenshots,
  lumaGrid, meanAbsDiff, renderMotionSummary, resolveMotionTargets, validateMotionConfig
} from "./motion.mjs";

const W = 128, H = 72;
const image = (fill) => {
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = fill(x, y); const i = (y * W + x) * 3; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; }
  return { width: W, height: H, rgb };
};
const flat = (v) => image(() => [v, v, v]);

test("lumaGrid is 64x36 by default, box-averages, and uses Rec.709 luma", () => {
  const grid = lumaGrid(image(() => [255, 0, 0]));
  assert.equal(grid.length, 64 * 36);
  assert.ok(Math.abs(grid[0] - 0.2126 * 255) < 1e-9);
  // a 2x2 pixel block per cell: left half black, right half white averages per cell, not across cells
  const split = lumaGrid(image((x) => (x < W / 2 ? [0, 0, 0] : [255, 255, 255])));
  assert.equal(split[0], 0); assert.ok(Math.abs(split[63] - 255) < 1e-9);
  assert.equal(lumaGrid(flat(10), 4, 2).length, 8);
  assert.throws(() => lumaGrid({ width: 2, height: 2, rgb: new Uint8Array(3) }), /malformed/);
  assert.throws(() => lumaGrid(flat(1), 0, 4), /at least 1x1/);
});

test("meanAbsDiff: identical frames are 0, constant offset is that offset, size mismatch throws", () => {
  const a = lumaGrid(flat(100)), b = lumaGrid(flat(110));
  assert.equal(meanAbsDiff(a, a), 0);
  assert.ok(Math.abs(meanAbsDiff(a, b) - 10) < 1e-9);
  assert.throws(() => meanAbsDiff([1], [1, 2]), /differ in size/);
  assert.throws(() => meanAbsDiff([], []), /differ in size/);
});

test("analyzeMotion: identical frames are frozen at 0.000, a visible change is moving, threshold is configurable", () => {
  const frozen = analyzeMotion(flat(90), flat(90));
  assert.equal(frozen.diff, 0); assert.equal(frozen.moving, false); assert.match(frozen.reasons[0], /frozen: frame difference 0 <= 0.2/);
  const moved = analyzeMotion(flat(90), flat(95));
  assert.equal(moved.diff, 5); assert.equal(moved.moving, true); assert.deepEqual(moved.reasons, []);
  // threshold boundary is strict: diff must be ABOVE the threshold
  assert.equal(analyzeMotion(flat(90), flat(91), { threshold: 1 }).moving, false);
  assert.equal(analyzeMotion(flat(90), flat(92), { threshold: 1 }).moving, true);
  assert.equal(analyzeMotion(flat(90), flat(90.0 + 0.5)).threshold, MOTION_DEFAULTS.threshold);
  assert.throws(() => analyzeMotion(flat(1), flat(1), { threshold: -1 }), /threshold/);
});

test("analyzeMotion: PNG buffers, missing frames, size mismatch and garbage fail instead of passing", () => {
  const a = encodePng(flat(80)), b = encodePng(flat(120));
  assert.equal(analyzeMotion(a, b).moving, true);
  assert.match(analyzeMotion(a, null).reasons[0], /need two frames/);
  assert.match(analyzeMotion(flat(1), { width: 4, height: 4, rgb: new Uint8Array(48) }).reasons[0], /sizes differ/);
  assert.match(analyzeMotion(Buffer.from("nope"), a).reasons[0], /unreadable/);
});

test("analyzeMotion: a moving region too small to cross the threshold is reported as frozen (documented grid sensitivity)", () => {
  const base = flat(60);
  const tiny = image((x, y) => (x < 2 && y < 2 ? [255, 255, 255] : [60, 60, 60]));
  const r = analyzeMotion(base, tiny);
  assert.ok(r.diff < 0.2); assert.equal(r.moving, false);
  assert.equal(analyzeMotion(base, tiny, { threshold: 0.01 }).moving, true);
});

test("evaluateMotionRow: animated rows fail when frozen, informational rows never fail, per-entry threshold wins", () => {
  const t = { id: "recipe-x", kind: "recipe", url: "u", animated: true };
  assert.equal(evaluateMotionRow(t, [flat(50), flat(50)]).pass, false);
  assert.equal(evaluateMotionRow(t, [flat(50), flat(60)]).pass, true);
  assert.equal(evaluateMotionRow(t, null).pass, false);
  const info = evaluateMotionRow({ ...t, animated: false }, [flat(50), flat(50)]);
  assert.equal(info.pass, true); assert.equal(info.diff, 0); assert.equal(info.moving, false);
  assert.equal(evaluateMotionRow({ ...t, threshold: 20 }, [flat(50), flat(60)]).pass, false);
});

test("extractScreenshots returns every captured step screenshot in order, from either envelope shape", () => {
  const shot = (buf) => ({ artifacts: { screenshot: { state: "captured", value: { data_base64: buf.toString("base64") } } } });
  const a = encodePng(flat(10)), b = encodePng(flat(200));
  const env = { steps: [shot(a), { artifacts: { screenshot: { state: "skipped" } } }, shot(b)] };
  assert.equal(extractScreenshots({ normalized_result: env }).length, 2);
  assert.ok(extractScreenshots(JSON.stringify({ result: env }))[1].equals(b));
  assert.throws(() => extractScreenshots({ nope: 1 }), /unrecognised/);
});

test("buildMotionScenario: two waits, a screenshot after each step, reduced motion off", () => {
  const s = buildMotionScenario("http://127.0.0.1:1/", { settleMs: 111, intervalMs: 222 });
  assert.deepEqual(s.actions.map((x) => x.duration_ms), [111, 222]);
  assert.deepEqual(s.capture.after_each_step, ["screenshot", "url"]);
  assert.equal(s.environment.reduced_motion, "no-preference");
  assert.equal(s.start_url.url, "http://127.0.0.1:1/");
});

test("captureMotionFrames drives REA through an injectable runner and returns the two PNGs", async () => {
  const shot = (buf) => ({ artifacts: { screenshot: { state: "captured", value: { data_base64: buf.toString("base64") } } } });
  const calls = [];
  const runner = async (bin, args) => { calls.push([bin, ...args.slice(0, 1)]); return { stdout: JSON.stringify({ normalized_result: { steps: [shot(encodePng(flat(10))), shot(encodePng(flat(90)))] } }) }; };
  const frames = await captureMotionFrames("http://x/", { runner, reaBin: "rea-stub" });
  assert.equal(frames.length, 2);
  assert.deepEqual(calls, [["rea-stub", "capture-browser-scenario"]]);
  assert.equal(analyzeMotion(frames[0], frames[1]).moving, true);
});

test("the shipped motion-config.json validates, flags the 8 recipes, and every flagged recipe exists", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(dir, "motion-config.json"), "utf8"));
  assert.deepEqual(validateMotionConfig(config), []);
  const recipes = config.entries.filter((e) => e.kind === "recipe");
  assert.equal(recipes.length, 8);
  assert.ok(recipes.filter((e) => e.animated).length >= 5);
  assert.ok(config.entries.some((e) => e.kind === "template" && e.animated));
  assert.ok(config.entries.some((e) => e.kind === "game" && e.animated));
  for (const r of recipes) readFileSync(join(dir, "../../../docs/agents/recipes-src", r.id, "main.ts"), "utf8");
});

test("validateMotionConfig reports schema, duplicate, kind, animated and reason problems", () => {
  assert.ok(validateMotionConfig({}).length >= 2);
  const problems = validateMotionConfig({ schema: "aura3d-render-gate-motion/1", entries: [{ id: "a", kind: "recipe", animated: true, reason: "r" }, { id: "a", kind: "recipe", animated: "yes" }, { id: "b", kind: "bogus", animated: true, reason: "r", threshold: -1 }] });
  assert.match(problems.join("|"), /duplicate entry recipe:a/);
  assert.match(problems.join("|"), /animated must be boolean/);
  assert.match(problems.join("|"), /reason is required/);
  assert.match(problems.join("|"), /kind must be/);
  assert.match(problems.join("|"), /threshold must be/);
});

test("resolveMotionTargets maps entries to URLs and reports skipped bases", () => {
  const config = { entries: [
    { id: "r1", kind: "recipe", animated: true, reason: "x" }, { id: "g1", kind: "game", animated: true, reason: "x" }, { id: "t1", kind: "template", animated: false, reason: "x" }
  ] };
  const none = resolveMotionTargets(config, {});
  assert.deepEqual(none.targets, []); assert.deepEqual(none.skipped, ["recipe:r1", "game:g1", "template:t1"]);
  const all = resolveMotionTargets(config, { recipeBase: "http://127.0.0.1:4173", gameUrls: { g1: "http://h/apps/g1/" }, templateUrl: (id) => `http://t/${id}/` });
  assert.deepEqual(all.targets.map((t) => [t.id, t.url, t.animated]), [["recipe-r1", "http://127.0.0.1:4173/r1/index.html", true], ["game-g1", "http://h/apps/g1/", true], ["template-t1", "http://t/t1/", false]]);
  assert.deepEqual(resolveMotionTargets(config, { recipeBase: "http://b/", only: ["recipe:r1"] }).targets.map((t) => t.id), ["recipe-r1"]);
  assert.deepEqual(resolveMotionTargets(config, { recipeBase: "http://b/", kinds: ["game"] }).targets, []);
});

test("renderMotionSummary: PASS only when every row passes and there is at least one row", () => {
  const ok = evaluateMotionRow({ id: "a", kind: "recipe", animated: true }, [flat(1), flat(50)]);
  const bad = evaluateMotionRow({ id: "b", kind: "recipe", animated: true }, [flat(1), flat(1)]);
  assert.equal(renderMotionSummary([ok]).ok, true);
  const failed = renderMotionSummary([ok, bad]);
  assert.equal(failed.ok, false); assert.deepEqual(failed.failed, ["b"]); assert.match(failed.markdown, /MOTION GATE FAIL/);
  assert.equal(renderMotionSummary([]).ok, false);
});

test("parseArgs accepts the motion flags", () => {
  const o = parseArgs(["--out", "x", "--motion", "--motion-threshold", "0.5", "--motion-grid", "32x18", "--interval-ms", "900", "--recipe-base", "http://b/"]);
  assert.equal(o.motion, true); assert.equal(o.motionThreshold, 0.5); assert.deepEqual(o.motionGrid, { gridWidth: 32, gridHeight: 18 });
  assert.equal(o.intervalMs, 900); assert.equal(o.recipeBase, "http://b/");
  assert.throws(() => parseArgs(["--motion-grid", "bad"]), /WxH/);
});
