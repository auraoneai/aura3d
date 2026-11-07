// Multi-frame MOTION check for the render gate: "an animated scene must actually move".
//
// A scene can draw one correct frame and then freeze (5.0.2: a custom shader whose only motion was `uTime`, `world.water`
// and sky clouds redrew nothing, measured frame difference 0.000). The single-frame gate cannot see that. This module
// captures two frames N seconds apart and asserts their mean absolute luma difference is above a threshold, for the
// entries a config flags `animated: true`.
//
// Method (same as the agent-eval `animatedDiff`, tools/agent-eval/remote/score-all.mjs `gridDiff` / `animated`):
//   - each frame is reduced to a 64x36 grid of luma (0.2126 R + 0.7152 G + 0.0722 B, 0..255),
//   - difference = mean over the 2304 cells of |lumaA - lumaB|,
//   - moving = difference > threshold, default 0.2 (the agent-eval `animated` cut-off).
//   Differences from the agent-eval: the agent-eval downsamples with a browser canvas `drawImage` (bilinear) and rounds
//   each cell to an integer; this module box-averages in pure JS and keeps fractional cells. Both give 0.000 for identical
//   frames; on real scenes the box average is slightly smoother, so expect values within a few hundredths of each other.
//   The grid size and threshold are options (`--motion-threshold`, `--motion-grid 64x36`); the defaults are the documented ones.
//
// Driver path (real GPU, no Playwright, no Docker): REA `capture-browser-scenario` with
//   actions [wait settleMs, wait intervalMs] and capture.after_each_step ["screenshot", "url"]  ->  two PNGs.
// The same scenario shape works through the MCP tool `rea_call capture_browser_scenario`; save the envelope and run
// `--driver saved` offline (see `docs/workflows/render-gate-motion.md`).
import { readFileSync } from "node:fs";
import { decodePng } from "./png.mjs";

export const MOTION_DEFAULTS = Object.freeze({
  gridWidth: 64,
  gridHeight: 36,
  /** Mean absolute luma difference (0..255) above which two frames count as moving. */
  threshold: 0.2,
  /** Wait before the first frame (scene mount + settle), then between frames. */
  settleMs: 4000,
  intervalMs: 1500
});

/** Box-average RGB into a gridWidth x gridHeight array of luma values (fractional). */
export function lumaGrid(image, gridWidth = MOTION_DEFAULTS.gridWidth, gridHeight = MOTION_DEFAULTS.gridHeight) {
  const { width, height, rgb } = image;
  if (!(width > 0 && height > 0) || rgb.length < width * height * 3) throw new Error("lumaGrid: malformed image");
  if (!(gridWidth >= 1 && gridHeight >= 1)) throw new Error("lumaGrid: grid must be at least 1x1");
  const sums = new Float64Array(gridWidth * gridHeight);
  const counts = new Uint32Array(gridWidth * gridHeight);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(gridHeight - 1, Math.floor((y * gridHeight) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(gridWidth - 1, Math.floor((x * gridWidth) / width));
      const i = (y * width + x) * 3;
      const cell = gy * gridWidth + gx;
      sums[cell] += 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
      counts[cell]++;
    }
  }
  return Array.from(sums, (s, c) => (counts[c] ? s / counts[c] : 0));
}

/** Mean absolute difference of two equal-length grids. */
export function meanAbsDiff(a, b) {
  if (a.length !== b.length || a.length === 0) throw new Error(`meanAbsDiff: grids differ in size (${a.length} vs ${b.length})`);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Pure verdict for two decoded images (or PNG buffers). Frames of different sizes are a failure, not a pass. */
export function analyzeMotion(frameA, frameB, options = {}) {
  const { threshold = MOTION_DEFAULTS.threshold, gridWidth = MOTION_DEFAULTS.gridWidth, gridHeight = MOTION_DEFAULTS.gridHeight } = options;
  const result = { threshold, gridWidth, gridHeight, diff: null, moving: false, reasons: [] };
  if (!(threshold >= 0)) throw new Error("analyzeMotion: threshold must be >= 0");
  if (!frameA || !frameB) { result.reasons.push("need two frames"); return result; }
  let a, b;
  try {
    a = Buffer.isBuffer(frameA) ? decodePng(frameA) : frameA;
    b = Buffer.isBuffer(frameB) ? decodePng(frameB) : frameB;
  } catch (e) { result.reasons.push(`frame unreadable: ${e.message}`); return result; }
  if (a.width !== b.width || a.height !== b.height) { result.reasons.push(`frame sizes differ (${a.width}x${a.height} vs ${b.width}x${b.height})`); return result; }
  result.diff = round3(meanAbsDiff(lumaGrid(a, gridWidth, gridHeight), lumaGrid(b, gridWidth, gridHeight)));
  result.moving = result.diff > threshold;
  if (!result.moving) result.reasons.push(`frozen: frame difference ${result.diff} <= ${threshold}`);
  return result;
}

/** Row verdict. `animated: false` entries are recorded (diff measured) but never fail. */
export function evaluateMotionRow(target, frames, options = {}) {
  const row = { id: target.id, kind: target.kind, url: target.url, animated: target.animated !== false, diff: null, moving: false, reasons: [], pass: false };
  const verdict = analyzeMotion(frames?.[0] ?? null, frames?.[1] ?? null, { ...options, threshold: target.threshold ?? options.threshold });
  row.diff = verdict.diff;
  row.moving = verdict.moving;
  row.threshold = verdict.threshold;
  if (row.animated) row.reasons = verdict.reasons;
  row.pass = row.reasons.length === 0;
  return row;
}

/** Every captured screenshot in step order from a REA envelope (normalized_result or wrapper). */
export function extractScreenshots(input) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const n = findNormalized(data);
  if (!n) throw new Error("unrecognised capture JSON (expected REA normalized_result)");
  const frames = [];
  for (const step of n.steps ?? []) {
    const shot = step.artifacts?.screenshot;
    if (shot?.state === "captured" && shot.value?.data_base64) frames.push(Buffer.from(shot.value.data_base64, "base64"));
  }
  return frames;
}

function findNormalized(d, depth = 0) {
  if (!d || typeof d !== "object" || depth > 4) return null;
  if (d.normalized_result) return d.normalized_result;
  if (Array.isArray(d.steps)) return d;
  for (const k of ["result", "data", "evidence", "output"]) { const r = findNormalized(d[k], depth + 1); if (r) return r; }
  return null;
}

/** The two-frame scenario: wait settleMs -> screenshot A, wait intervalMs -> screenshot B. Reduced motion is OFF on purpose. */
export function buildMotionScenario(url, { width = 960, height = 540, settleMs = MOTION_DEFAULTS.settleMs, intervalMs = MOTION_DEFAULTS.intervalMs, executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" } = {}) {
  return {
    browser: { mode: "launch", executable_path: executablePath, headless: true },
    start_url: { url, query: [] },
    environment: { viewport: { width, height, device_scale_factor: 1 }, locale: "en-US", timezone: "UTC", color_scheme: "light", reduced_motion: "no-preference", service_workers: "block" },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: settleMs },
      { step_id: "interval", action: "wait_for_timeout", duration_ms: intervalMs }
    ],
    storage: { cookies: [], local_storage: [], session_storage: [] },
    secrets: [],
    capture: {
      after_each_step: ["screenshot", "url"], at_end: ["url"], events: ["console", "page-errors"],
      network: { request_body: false, response_body: false, header_values: false },
      limits: { max_events: 10000, max_event_allocation_bytes: 4194304, max_total_event_allocation_bytes: 16777216, max_network_transactions: 1024, max_network_body_bytes: 65536, max_network_body_allocation_bytes: 1048576, max_network_header_allocation_bytes: 1048576, max_network_metadata_allocation_bytes: 1048576 }
    }
  };
}

/** Config schema: { schema, threshold?, intervalMs?, settleMs?, entries: [{ id, kind: game|recipe|template, path?, animated, reason, verified }] }. */
export function validateMotionConfig(config) {
  const problems = [];
  if (config?.schema !== "aura3d-render-gate-motion/1") problems.push("schema must be aura3d-render-gate-motion/1");
  if (!Array.isArray(config?.entries) || config.entries.length === 0) problems.push("entries must be a non-empty array");
  const seen = new Set();
  for (const e of config?.entries ?? []) {
    if (!e.id || typeof e.id !== "string") problems.push("entry without id");
    else if (seen.has(`${e.kind}:${e.id}`)) problems.push(`duplicate entry ${e.kind}:${e.id}`);
    else seen.add(`${e.kind}:${e.id}`);
    if (!["game", "recipe", "template"].includes(e.kind)) problems.push(`${e.id}: kind must be game, recipe or template`);
    if (typeof e.animated !== "boolean") problems.push(`${e.id}: animated must be boolean`);
    if (!e.reason) problems.push(`${e.id}: reason is required (what moves)`);
    if (e.threshold !== undefined && !(e.threshold >= 0)) problems.push(`${e.id}: threshold must be >= 0`);
  }
  return problems;
}

export function loadMotionConfig(path) {
  const config = JSON.parse(readFileSync(path, "utf8"));
  const problems = validateMotionConfig(config);
  if (problems.length) throw new Error(`invalid motion config ${path}: ${problems.join("; ")}`);
  return config;
}

/**
 * Resolve config entries to URLs. Games: `<base>/apps/showcase-<appFolder>/` is taken from the inventory (`gamesUrls`).
 * Recipes: `<recipeBase>/<id>/index.html` (serve `docs/agents/recipes-src/.dist`). Templates are built and served by index.mjs
 * (`templateUrl(id)` callback). Entries whose base is not supplied are skipped and reported in `skipped`.
 */
export function resolveMotionTargets(config, { kinds, only, gameUrls = {}, recipeBase, templateUrl } = {}) {
  const targets = [], skipped = [];
  for (const e of config.entries) {
    if (kinds && !kinds.includes(e.kind)) continue;
    if (only && !only.includes(e.id) && !only.includes(`${e.kind}:${e.id}`)) continue;
    let url = null;
    if (e.kind === "game") url = gameUrls[e.id] ?? null;
    else if (e.kind === "recipe") url = recipeBase ? new URL(`${e.id}/index.html`, recipeBase.endsWith("/") ? recipeBase : `${recipeBase}/`).href : null;
    else if (e.kind === "template") url = templateUrl ? templateUrl(e.id) : null;
    if (!url) { skipped.push(`${e.kind}:${e.id}`); continue; }
    targets.push({ id: `${e.kind}-${e.id}`, kind: e.kind, url, animated: e.animated, threshold: e.threshold, reason: e.reason });
  }
  return { targets, skipped };
}

/** Summary markdown + overall flag. */
export function renderMotionSummary(rows, { title = "Render gate: motion", threshold = MOTION_DEFAULTS.threshold, generatedAt = new Date().toISOString() } = {}) {
  const failed = rows.filter((r) => !r.pass);
  const out = [`# ${title}`, "", `Generated ${generatedAt}. Two frames, mean abs luma difference on a ${MOTION_DEFAULTS.gridWidth}x${MOTION_DEFAULTS.gridHeight} grid, default threshold ${threshold}.`, ""];
  out.push("| id | animated | diff | threshold | result |", "|---|---|---|---|---|");
  for (const r of rows) out.push(`| ${r.id} | ${r.animated ? "yes" : "no (info)"} | ${r.diff ?? "-"} | ${r.threshold ?? threshold} | ${r.pass ? "PASS" : "FAIL: " + r.reasons.join("; ")} |`);
  const ok = failed.length === 0 && rows.length > 0;
  out.push("", ok ? "**MOTION GATE PASS**" : `**MOTION GATE FAIL** (${failed.length} failing row(s))`, "");
  return { markdown: out.join("\n"), ok, failed: failed.map((r) => r.id) };
}

/** REA CLI driver for two frames. `runner` is injectable for tests. */
export async function captureMotionFrames(url, { reaBin = "/opt/homebrew/bin/rea", runner, timeoutMs = 180000, ...scenarioOptions } = {}) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const run = runner ?? promisify(execFile);
  const dir = mkdtempSync(join(tmpdir(), "render-gate-motion-"));
  try {
    const file = join(dir, "scenario.json");
    writeFileSync(file, JSON.stringify(buildMotionScenario(url, scenarioOptions)));
    const { stdout } = await run(reaBin, ["capture-browser-scenario", file, "--format", "json", "--full-output"], { maxBuffer: 1 << 28, timeout: timeoutMs });
    return extractScreenshots(JSON.parse(stdout));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
