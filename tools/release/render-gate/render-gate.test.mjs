import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeFrame, classifyEvents, evaluateRow, normalizeCapture, renderSummary } from "./analysis.mjs";
import { decodePng, encodePng } from "./png.mjs";
import { createFunctionDriver, createSavedDriver, buildScenario } from "./drivers.mjs";
import { gameTargets, parseArgs, parseTemplateSource } from "./index.mjs";
import { scaffoldCommands, entryPage } from "./templates.mjs";

const W = 320, H = 180;
function image(fill) {
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = fill(x, y); const i = (y * W + x) * 3; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; }
  return { width: W, height: H, rgb };
}
// Deterministic "scene": gradient sky, ground with checker detail and a few bright blobs.
const scene = (gain) => image((x, y) => {
  const checker = ((x >> 3) + (y >> 3)) & 1 ? 40 : 90;
  const v = y < 80 ? 120 + y : checker + ((x * 7 + y * 13) % 30);
  return [Math.min(255, v * gain), Math.min(255, (v * 0.8 + (x % 17)) * gain), Math.min(255, (v * 0.6 + (y % 11)) * gain)];
});
const black = image(() => [0, 0, 0]);
const clearColour = image(() => [30, 60, 90]);
const menuCardOnBlack = image((x, y) => (x > 100 && x < 220 && y > 50 && y < 130 ? [235, 235, 235] : [0, 0, 0]));

test("PNG round trip", () => {
  const img = scene(1);
  const dec = decodePng(encodePng(img));
  assert.equal(dec.width, W); assert.deepEqual(Array.from(dec.rgb.subarray(0, 60)), Array.from(img.rgb.subarray(0, 60)));
  assert.throws(() => decodePng(Buffer.from("nope")), /not a PNG/);
});

test("lit scene is drawn; black, flat clear colour and an opaque card on black are not", () => {
  assert.equal(analyzeFrame(scene(1)).drawn, true);
  assert.equal(analyzeFrame(black).drawn, false);
  assert.match(analyzeFrame(black).reasons.join(), /black frame/);
  assert.equal(analyzeFrame(clearColour).drawn, false);
  assert.equal(analyzeFrame(menuCardOnBlack).drawn, false);
});

test("a dim scene behind a dark overlay is detected by the brightened heuristic, not mean brightness", () => {
  const dim = analyzeFrame(scene(0.07));
  assert.ok(dim.meanLuma < 12, `mean luma ${dim.meanLuma} should be near black`);
  assert.ok(dim.gain > 1);
  assert.equal(dim.drawn, true);
  // Opaque dark overlay hiding the scene entirely leaves nothing to brighten.
  assert.equal(analyzeFrame(image(() => [3, 3, 3])).drawn, false);
});

test("console classification ignores 404 resource loads only", () => {
  const c = classifyEvents([
    { kind: "console", level: "error", text: "Failed to load resource: the server responded with a status of 404 ()" },
    { kind: "console", level: "error", text: "Failed to load resource: the server responded with a status of 500 ()" },
    { kind: "page-error", text: "TypeError: x is not a function" },
    { kind: "console", level: "warning", text: "CONTACT_SHADOW_DEGRADED: unverified-graph-passes" },
    { kind: "console", level: "error", text: "RENDERER_MOUNT_FAILED: boom" }
  ]);
  assert.equal(c.errors.length, 3);
  assert.equal(c.mountFailed, true);
  assert.deepEqual(c.degradeCodes, ["CONTACT_SHADOW_DEGRADED"]);
});

test("normalizeCapture reads the REA envelope with an embedded screenshot", () => {
  const png = encodePng(scene(1));
  const envelope = { normalized_result: { scenario: { start_url: { url: "https://x/y/" } }, steps: [{ after_url: { url: "https://x/y/" }, artifacts: { screenshot: { state: "captured", value: { data_base64: png.toString("base64") } } } }], events: { items: [{ kind: "console", level: "warning", text: "ok" }] }, completeness: { status: "complete" } } };
  const cap = normalizeCapture(JSON.stringify([envelope][0]));
  assert.equal(cap.png.length, png.length);
  assert.equal(cap.events.length, 1);
  assert.equal(evaluateRow({ id: "y", kind: "game", url: "https://x/y/" }, cap).pass, true);
  assert.throws(() => normalizeCapture({ nothing: true }), /unrecognised/);
});

test("evaluateRow fails on mount failure, errors, black frame and missing capture", () => {
  const good = { events: [], png: encodePng(scene(1)) };
  assert.equal(evaluateRow({ id: "a", kind: "game" }, good).pass, true);
  assert.equal(evaluateRow({ id: "a", kind: "game" }, { ...good, events: [{ kind: "console", level: "error", text: "RENDERER_MOUNT_FAILED" }] }).pass, false);
  assert.equal(evaluateRow({ id: "a", kind: "game" }, { events: [], png: encodePng(black) }).pass, false);
  assert.equal(evaluateRow({ id: "a", kind: "game" }, { events: [] }).pass, false);
  assert.deepEqual(evaluateRow({ id: "a", kind: "game" }, null).reasons, ["no capture"]);
});

test("allowed placeholder rows waive only the flat-frame reasons, and only while the page logs the placeholder message", () => {
  const target = { id: "template-animation-studio", kind: "template" };
  const placeholderLog = [{ kind: "console", level: "warning", text: "No scene loaded — rendering the empty placeholder." }];
  const flat = encodePng(clearColour);
  const waived = evaluateRow(target, { events: placeholderLog, png: flat });
  assert.equal(waived.pass, true);
  assert.equal(waived.drawn, false);
  assert.match(waived.placeholder, /empty-stage placeholder/);
  assert.match(renderSummary([{ ...waived, kind: "template" }]).markdown, /\| template-animation-studio \| placeholder \|/);
  // Same flat frame without the placeholder log, a different id, a black frame, or an error all still fail.
  assert.equal(evaluateRow(target, { events: [], png: flat }).pass, false);
  assert.equal(evaluateRow({ id: "template-mini-game", kind: "template" }, { events: placeholderLog, png: flat }).pass, false);
  assert.equal(evaluateRow(target, { events: placeholderLog, png: encodePng(black) }).pass, false);
  assert.equal(evaluateRow(target, { events: [...placeholderLog, { kind: "page-error", text: "boom" }], png: flat }).pass, false);
  assert.equal(evaluateRow(target, { events: placeholderLog, png: flat }, undefined, {}).pass, false);
});

test("summary lists every row, fails on any miss and on row-count mismatch", () => {
  const ok = { id: "g1", kind: "game", drawn: true, errorCount: 0, mountFailed: false, degradeCodes: [], metrics: { texturedBlockFraction: 0.4, p99Luma: 200 }, reasons: [], pass: true };
  const bad = { ...ok, id: "t1", kind: "template", drawn: false, reasons: ["black frame"], pass: false };
  assert.equal(renderSummary([ok], { expectedGames: 1 }).ok, true);
  const s = renderSummary([ok, bad], { expectedGames: 1, expectedTemplates: 1 });
  assert.equal(s.ok, false); assert.deepEqual(s.failed, ["t1"]); assert.match(s.markdown, /FAIL: black frame/);
  assert.equal(renderSummary([ok], { expectedGames: 25 }).ok, false);
  assert.equal(renderSummary([], {}).ok, false);
});

test("saved driver feeds the pure analyze mode", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rg-test-"));
  try {
    writeFileSync(join(dir, "g1.json"), JSON.stringify({ url: "u", events: [] }));
    writeFileSync(join(dir, "g1.png"), encodePng(scene(1)));
    const d = createSavedDriver(dir);
    assert.equal(evaluateRow({ id: "g1", kind: "game" }, await d.capture({ id: "g1" })).pass, true);
    assert.equal(await d.capture({ id: "missing" }), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("function driver, scenario, targets and CLI parsing", async () => {
  const d = createFunctionDriver("fake", async (t) => ({ events: [], png: encodePng(scene(1)), finalUrl: t.url }));
  assert.equal(evaluateRow({ id: "z", kind: "game", url: "https://a/b/" }, await d.capture({ url: "https://a/b/" })).pass, true);
  const sc = buildScenario("https://a/", { settleMs: 5 });
  assert.equal(sc.actions[0].duration_ms, 5); assert.equal(sc.environment.viewport.width, 960);
  const inv = { games: [{ url: "/apps/showcase-top-tennis/", status: "live" }, { url: "/apps/x/", status: "draft" }] };
  assert.deepEqual(gameTargets(inv, "https://s.example"), [{ id: "showcase-top-tennis", kind: "game", url: "https://s.example/apps/showcase-top-tennis/" }]);
  assert.equal(parseArgs(["--out", "o"]).games && parseArgs(["--out", "o"]).templates, true);
  assert.throws(() => parseArgs(["--bogus"]), /unknown argument/);
  assert.deepEqual(parseTemplateSource("registry:next"), { kind: "registry", spec: "next" });
  assert.throws(() => parseTemplateSource("archives:"), /plan path/);
});

test("template scaffold commands never use a shell and cover scaffold, install, build", () => {
  const cmds = scaffoldCommands({ kind: "registry", spec: "next" }, "mini-game", "tpl-mini-game", "/w");
  assert.deepEqual(cmds.map((c) => c.args[0]), ["-y", "install", "run"]);
  assert.ok(cmds[0].args.includes("create-aura3d@next"));
});

test("entryPage serves index.html, falls back to the single built route, and rejects ambiguous or empty dists", () => {
  const dir = mkdtempSync(join(tmpdir(), "rg-entry-"));
  try {
    assert.throws(() => entryPage(dir), /no dist\/index.html/);
    writeFileSync(join(dir, "live-route.html"), "x");
    assert.equal(entryPage(dir), "live-route.html");
    writeFileSync(join(dir, "other.html"), "x");
    assert.throws(() => entryPage(dir), /live-route.html, other.html/);
    writeFileSync(join(dir, "index.html"), "x");
    assert.equal(entryPage(dir), "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("driver failure reports timeout and stderr; --capture-timeout-ms parses", async () => {
  const { createReaCliDriver } = await import("./drivers.mjs");
  const driver = createReaCliDriver({ timeoutMs: 5, runner: async () => { throw Object.assign(new Error("x"), { killed: true, stderr: "chrome gone\n" }); } });
  await assert.rejects(() => driver.capture({ url: "http://127.0.0.1:1/" }), /timed out after 5ms: chrome gone/);
  assert.equal(parseArgs(["--capture-timeout-ms", "900000"]).captureTimeoutMs, 900000);
});
