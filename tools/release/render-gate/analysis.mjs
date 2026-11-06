// Pure logic of the render gate: frame analysis, console classification, capture normalisation, verdicts, summary.
import { decodePng } from "./png.mjs";

export const BENIGN_ERROR = /Failed to load resource.*\b404\b/;
export const FRAME_THRESHOLDS = Object.freeze({
  /** After stretching, at least this share of 16px blocks must contain texture (edges, gradients, detail). */
  minTexturedBlockFraction: 0.1,
  /** Brightest 1% of pixels must reach this luma, otherwise the frame is black. */
  minP99Luma: 6,
  /** Distinct colours at 4 bits per channel (after brightening). A clear-colour-only frame has 1-2. */
  minDistinctColors: 8,
  /** Block luma stddev (on the stretched image) that counts as texture. */
  blockStddev: 6,
  /** Max gain applied to dim frames (a dim scene behind an opaque menu card). */
  maxGain: 8,
  blockSize: 16
});

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Black / flat frame detector. A dim scene is brightened (percentile stretch) before texture is measured, so a dark
 * but drawn scene passes while a black canvas, a single clear colour, or an empty page with only a small menu card
 * (flat card on a flat backdrop) fails: those have almost no textured blocks.
 */
export function analyzeFrame(image, thresholds = FRAME_THRESHOLDS) {
  const { width, height, rgb } = image;
  const n = width * height;
  const hist = new Uint32Array(256);
  const colors = new Set();
  const lum = new Float32Array(n);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const l = luma(r, g, b);
    lum[i] = l; sum += l; sumSq += l * l; hist[Math.min(255, Math.round(l))]++;
  }
  const pct = (p) => { let acc = 0; const target = n * p; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; } return 255; };
  const mean = sum / n;
  const stddev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const p1 = pct(0.01), p99 = pct(0.99);
  const gain = p99 >= 96 ? 1 : Math.min(thresholds.maxGain, 160 / Math.max(p99, 1));
  for (let i = 0; i < n; i++) {
    const r = Math.min(255, rgb[i * 3] * gain), g = Math.min(255, rgb[i * 3 + 1] * gain), b = Math.min(255, rgb[i * 3 + 2] * gain);
    colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  const bs = thresholds.blockSize;
  let blocks = 0, textured = 0;
  for (let by = 0; by + bs <= height; by += bs) {
    for (let bx = 0; bx + bs <= width; bx += bs) {
      let s = 0, sq = 0;
      for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) { const v = Math.min(255, lum[y * width + x] * gain); s += v; sq += v * v; }
      const m = s / (bs * bs), sd = Math.sqrt(Math.max(0, sq / (bs * bs) - m * m));
      blocks++; if (sd >= thresholds.blockStddev) textured++;
    }
  }
  const texturedBlockFraction = blocks ? textured / blocks : 0;
  const reasons = [];
  if (p99 < thresholds.minP99Luma) reasons.push(`black frame (p99 luma ${p99})`);
  if (colors.size < thresholds.minDistinctColors) reasons.push(`flat frame (${colors.size} distinct colours)`);
  if (texturedBlockFraction < thresholds.minTexturedBlockFraction) reasons.push(`no scene texture (${(texturedBlockFraction * 100).toFixed(1)}% textured blocks)`);
  return {
    width, height, meanLuma: round(mean), lumaStddev: round(stddev), p1Luma: p1, p99Luma: p99, gain: round(gain),
    distinctColors: colors.size, texturedBlockFraction: round(texturedBlockFraction, 4),
    drawn: reasons.length === 0, reasons
  };
}

export function analyzePng(buf, thresholds) { return analyzeFrame(decodePng(buf), thresholds); }

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Console classification: error-level and page-error events other than a 404 resource load. */
export function classifyEvents(events) {
  const text = (e) => String(e.text ?? e.message ?? "");
  const errors = events.filter((e) => (e.level === "error" || e.kind === "page-error" || e.kind === "page-errors" || e.kind === "pageerror") && !BENIGN_ERROR.test(text(e)))
    .map((e) => ({ kind: e.kind ?? "console", level: e.level ?? "error", text: text(e).slice(0, 400) }));
  const all = events.map(text).join("\n");
  return {
    errors,
    mountFailed: /RENDERER_MOUNT_FAILED/.test(all),
    degradeCodes: [...new Set(all.match(/\b[A-Z][A-Z0-9_]*_DEGRADED\b/g) ?? [])].sort()
  };
}

/**
 * Accepts (a) the REA capture envelope / normalized_result (steps[].artifacts.screenshot.value.data_base64 + events.items),
 * (b) the slim census JSON ({ url, events: [...] }) with the PNG passed separately.
 * @returns {{url?:string, finalUrl?:string, events:object[], png:Buffer|null, completeness?:string}}
 */
export function normalizeCapture(input, pngBuffer = null) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const n = findNormalized(data);
  if (n) {
    let png = pngBuffer;
    for (const s of n.steps ?? []) {
      const shot = s.artifacts?.screenshot;
      if (shot?.state === "captured" && shot.value?.data_base64) png = Buffer.from(shot.value.data_base64, "base64");
    }
    const events = Array.isArray(n.events) ? n.events : n.events?.items ?? [];
    return {
      url: n.scenario?.start_url?.url, finalUrl: n.steps?.at(-1)?.after_url?.url, events, png,
      completeness: n.completeness?.status, dropped: n.events?.dropped ?? 0
    };
  }
  if (data && Array.isArray(data.events)) return { url: data.url, finalUrl: data.final_url, events: data.events, png: pngBuffer, completeness: data.completeness?.status, dropped: data.dropped ?? 0 };
  throw new Error("unrecognised capture JSON (expected REA normalized_result or slim census JSON)");
}

function findNormalized(d, depth = 0) {
  if (!d || typeof d !== "object" || depth > 4) return null;
  if (d.normalized_result) return d.normalized_result;
  if (Array.isArray(d.steps) && d.events) return d;
  for (const k of ["result", "data", "evidence", "output"]) { const r = findNormalized(d[k], depth + 1); if (r) return r; }
  return null;
}

/**
 * Rows whose rendered frame is an intentional empty-state placeholder rather than a scene. The frame-content reasons
 * (flat / no scene texture) are waived only while the page itself logs the placeholder message, so a blank page from a
 * broken build still fails. Thresholds stay untouched; black frames, errors and mount failures are never waived.
 */
export const ALLOWED_PLACEHOLDERS = Object.freeze({
  "template-animation-studio": Object.freeze({
    why: "no episode document is loaded in a fresh scaffold: the studio route renders its empty-stage placeholder by design",
    console: /No scene loaded/
  })
});
const WAIVABLE_FRAME_REASON = /^(flat frame|no scene texture)/;

/** Verdict for one row. `capture` may be null (driver failed). */
export function evaluateRow(target, capture, thresholds, placeholders = ALLOWED_PLACEHOLDERS) {
  const row = { id: target.id, kind: target.kind, url: target.url, drawn: false, errorCount: 0, mountFailed: false, degradeCodes: [], errors: [], metrics: null, reasons: [], pass: false };
  if (!capture) { row.reasons.push("no capture"); return row; }
  const cls = classifyEvents(capture.events ?? []);
  Object.assign(row, { errorCount: cls.errors.length, errors: cls.errors.slice(0, 5), mountFailed: cls.mountFailed, degradeCodes: cls.degradeCodes });
  if (cls.mountFailed) row.reasons.push("RENDERER_MOUNT_FAILED");
  if (cls.errors.length) row.reasons.push(`${cls.errors.length} error-level console message(s)`);
  if (!capture.png) row.reasons.push("no screenshot");
  else {
    try {
      row.metrics = analyzePng(capture.png, thresholds);
      row.drawn = row.metrics.drawn;
      row.reasons.push(...row.metrics.reasons);
    } catch (e) { row.reasons.push(`screenshot unreadable: ${e.message}`); }
  }
  const allowed = Object.hasOwn(placeholders, target.id) ? placeholders[target.id] : null;
  if (allowed && row.metrics && row.metrics.p99Luma >= (thresholds ?? FRAME_THRESHOLDS).minP99Luma
      && (capture.events ?? []).some((e) => allowed.console.test(String(e.text ?? e.message ?? "")))) {
    const waived = row.reasons.filter((r) => WAIVABLE_FRAME_REASON.test(r));
    if (waived.length) { row.reasons = row.reasons.filter((r) => !WAIVABLE_FRAME_REASON.test(r)); row.placeholder = allowed.why; }
  }
  if (capture.finalUrl && target.url && capture.finalUrl !== target.url && /^https?:\/\/[^/]+\/?$/.test(capture.finalUrl)) row.reasons.push(`redirected to ${capture.finalUrl}`);
  row.pass = row.reasons.length === 0;
  return row;
}

/** summary.md plus overall pass flag. Games and templates are separate tables; missing expected rows fail. */
export function renderSummary(rows, { title = "Render gate", expectedGames, expectedTemplates, generatedAt = new Date().toISOString() } = {}) {
  const games = rows.filter((r) => r.kind === "game"), templates = rows.filter((r) => r.kind === "template");
  const problems = [];
  if (expectedGames != null && games.length !== expectedGames) problems.push(`expected ${expectedGames} game rows, got ${games.length}`);
  if (expectedTemplates != null && templates.length !== expectedTemplates) problems.push(`expected ${expectedTemplates} template rows, got ${templates.length}`);
  const failed = rows.filter((r) => !r.pass);
  const line = (r) => `| ${r.id} | ${r.drawn ? "yes" : r.placeholder ? "placeholder" : "NO"} | ${r.errorCount} | ${r.mountFailed ? "YES" : "no"} | ${r.degradeCodes.join(", ") || "-"} | ${r.metrics ? `${(r.metrics.texturedBlockFraction * 100).toFixed(0)}% / p99 ${r.metrics.p99Luma}` : "-"} | ${r.pass ? "PASS" : "FAIL: " + r.reasons.join("; ")} |`;
  const head = "| id | drawn | errors | mount failed | degrade codes | texture / brightness | result |\n|---|---|---|---|---|---|---|";
  const out = [`# ${title}`, "", `Generated ${generatedAt}.`, ""];
  out.push(`Games: ${games.filter((r) => r.pass).length}/${games.length} pass. Templates: ${templates.filter((r) => r.pass).length}/${templates.length} pass.`, "");
  if (problems.length) out.push(...problems.map((p) => `**FAIL** ${p}`), "");
  if (games.length) out.push(`## Games (${games.length})`, "", head, ...games.map(line), "");
  if (templates.length) out.push(`## Templates (${templates.length})`, "", head, ...templates.map(line), "");
  const ok = failed.length === 0 && problems.length === 0 && rows.length > 0;
  out.push(ok ? "**GATE PASS**" : `**GATE FAIL** (${failed.length} failing row(s)${problems.length ? ", row-count mismatch" : ""})`, "");
  return { markdown: out.join("\n"), ok, failed: failed.map((r) => r.id), problems };
}
