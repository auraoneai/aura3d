#!/usr/bin/env node
// Region luma: decode and aggregate the GL_META v2 / GL_PAIR rows of tests/browser/game-luma-capture.spec.ts.
// Pure Node, no dependencies. The capture only runs on the remote runner; this tool reads its output.
//
//   node tools/look-metrics/region-luma.mjs table   <capture> [--target <name|prefix>] [--all-shots] [--json]
//   node tools/look-metrics/region-luma.mjs bands   <capture> --bands <luma-bands.json> [--target ...] [--json]   (exit 1 on a miss)
//   node tools/look-metrics/region-luma.mjs compare <before> <after> [--target ...] [--json]
//   node tools/look-metrics/region-luma.mjs pairs   <capture> [--target ...] [--json]
//   node tools/look-metrics/region-luma.mjs extract <acr-run.log> --out <capture.json>
//
// <capture> is a decode-luma JSON (evidence/audit-fix/e5/decode-luma.mjs writes `luma-<label>.json`, an array of GL_META
// rows), a JSON object { metas, pairs } (the `extract` output), or a raw acr-run.log (GL_META and GL_PAIR lines).
// Only steady-state shots count (`settle-<s>s` with s >= 20): the first frame is lit by the analytic floor probe (lesson R20).
//
// Band file (schema aura3d.luma-bands/1; the luma-band game-check reads evidence/game-upgrades-47/<slug>/luma-bands.json):
//   { "schema": "aura3d.luma-bands/1", "slug": "last-train-port",
//     "default": { "darkFrac": [null, 0.6], "clipFrac": [null, 0.05] },
//     "variants": { "band-a": { "mean": [100, 125], "cells": { "4": { "mean": [70, null] }, "top": { "hue": [20, 40] } },
//                               "crops": { "platform": { "mean": [60, null] } } } },
//     "exceptions": { "moon": "declared exception: darkFrac 0.15-0.5 on the lunar venue (TT-E3)" } }
// A band is { <metric>: [min, max] } (null = open; a hue band with min > max wraps through 0). Metrics: mean std p1 p5 p50
// p95 p99 darkFrac clipFrac hue hueR chroma sat lap edge r g b rb (R/B) rg gb spread (p95-p5) ratio (p95/p5) and
// above<N> (fraction of pixels with luma >= N, from the 32-bin `hist`: frame and crops only; exact for multiples of 8,
// interpolated inside a bin otherwise). Regions: the frame, `cells` (index 0..8 row-major, or
// top/middle/bottom/left/center/right as the mean of three cells; no percentiles there) and `crops` (named rects the game
// publishes; a band on a crop the row lacks is a miss). `default` (darkFrac <= 0.6 and clipFrac <= 0.05 unless the file
// says otherwise, PRD section 1.5) applies to every variant not listed in `exceptions`. A blank frame (GL_META v2
// `blank`: black or one colour, lesson V1) and a shot taken while textures were still uploading (`info.texPending` > 0,
// lesson R4: recapture with GL_TEX_WAIT_S) are always misses.
// Field reference: tests/browser/game-luma-stats.ts (GL_META v2, GL_PAIR).
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LUMA_BANDS_SCHEMA = "aura3d.luma-bands/1";
export const DEFAULT_BAND = Object.freeze({ darkFrac: [null, 0.6], clipFrac: [null, 0.05] });
export const STEADY_MIN_SECONDS = 20;

const CELL_ALIASES = { top: [0, 1, 2], middle: [3, 4, 5], bottom: [6, 7, 8], left: [0, 3, 6], center: [1, 4, 7], right: [2, 5, 8] };
const PERCENTILES = new Set(["p1", "p5", "p50", "p95", "p99", "spread", "ratio"]);
const round = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? v ?? null : Number(v.toFixed(d)));

// ---------- loading ----------

/** Parse GL_META and GL_PAIR lines out of a remote acr-run.log (torn lines are skipped). */
export function parseCaptureLog(text) {
  const metas = [];
  const pairs = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/\r$/, "");
    const at = line.search(/GL_(META|PAIR) \{/);
    if (at < 0) continue;
    const kind = line.slice(at + 3, at + 7);
    try {
      const row = JSON.parse(line.slice(at + 8));
      (kind === "META" ? metas : pairs).push(row);
    } catch { /* torn line */ }
  }
  return { metas, pairs };
}

/** Load a capture: decode-luma JSON array, { metas, pairs } JSON, or a raw log. */
export function loadCapture(file) {
  const text = readFileSync(file, "utf8");
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) return { metas: json, pairs: [] };
      if (json && Array.isArray(json.metas)) return { metas: json.metas, pairs: Array.isArray(json.pairs) ? json.pairs : [] };
    } catch { /* fall through to log parsing */ }
  }
  return parseCaptureLog(text);
}

export function shotSeconds(id) {
  const m = /^settle-(\d+(?:\.\d+)?)s$/.exec(String(id ?? ""));
  return m ? Number(m[1]) : null;
}

/** Steady-state shots only (`settle-<s>s` with s >= 20). */
export function steadyRows(rows, minSeconds = STEADY_MIN_SECONDS) {
  return rows.filter((r) => { const s = shotSeconds(r.id); return s !== null && s >= minSeconds; });
}

/** Last row per target, in first-seen target order (what decode-luma and compare-luma call steady state). */
export function lastShots(rows) {
  const last = new Map();
  for (const r of rows) last.set(r.target, r);
  return last;
}

export const targetMatches = (row, filter) => !filter || row.target === filter || String(row.target).startsWith(filter);

// ---------- colour maths ----------

const srgbToLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

/** sRGB (0..255) to CIE L*a*b* (D65). */
export function srgbToLab([r, g, b]) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 colour difference between two L*a*b* colours (Sharma, Wu, Dalal 2005). */
export function deltaE2000Lab([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; const d = Math.atan2(b, a) / rad; return d < 0 ? d + 360 : d; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export const deltaE2000 = (rgbA, rgbB) => deltaE2000Lab(srgbToLab(rgbA), srgbToLab(rgbB));

/** Signed smallest hue difference b - a in degrees, in (-180, 180]; null when either hue is null. */
export function hueDelta(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

// ---------- regions and metrics ----------

/** Mean of three equal-area cells: exact for mean, std (pooled), dark/clip, rgb, sat, edge; hue from the summed chroma vectors; lap averaged. */
export function aggregateCells(cells) {
  const n = cells.length;
  const avg = (k) => cells.reduce((s, c) => s + (c[k] ?? 0), 0) / n;
  const mean = avg("mean");
  const ex2 = cells.reduce((s, c) => s + (c.std ?? 0) ** 2 + (c.mean ?? 0) ** 2, 0) / n;
  let vx = 0, vy = 0;
  for (const c of cells) {
    if (c.hue === null || c.hue === undefined) continue;
    const m = (c.hueR ?? 0) * (c.chroma ?? 0);
    vx += m * Math.cos((c.hue * Math.PI) / 180); vy += m * Math.sin((c.hue * Math.PI) / 180);
  }
  vx /= n; vy /= n;
  const chroma = avg("chroma");
  const mag = Math.hypot(vx, vy);
  return {
    mean: round(mean, 2), std: round(Math.sqrt(Math.max(0, ex2 - mean * mean)), 2),
    darkFrac: round(avg("darkFrac"), 4), clipFrac: round(avg("clipFrac"), 4),
    rgb: [0, 1, 2].map((i) => round(cells.reduce((s, c) => s + (c.rgb?.[i] ?? 0), 0) / n, 1)),
    hue: mag > 1e-6 ? round(((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360, 1) : null,
    hueR: chroma > 0 ? round(mag / chroma, 3) : 0, chroma: round(chroma, 1), sat: round(avg("sat"), 3),
    lap: round(avg("lap"), 1), edge: round(avg("edge"), 4), aggregate: true
  };
}

/** Stats of a region of a GL_META row: "frame", a cell index or alias, or "crop:<name>". */
export function regionStats(row, region) {
  if (region === "frame") return row;
  if (region.startsWith("crop:")) return row.crops?.[region.slice(5)] ?? null;
  if (!Array.isArray(row.cells)) return null;
  if (/^[0-8]$/.test(region)) return row.cells[Number(region)] ?? null;
  const ids = CELL_ALIASES[region];
  return ids ? aggregateCells(ids.map((i) => row.cells[i]).filter(Boolean)) : null;
}

/** Fraction of pixels with luma >= level from a 32-bin luma histogram (exact for multiples of 8); null without one. */
export function fractionAbove(hist, level) {
  if (!Array.isArray(hist) || hist.length !== 32) return null;
  const at = Math.max(0, Math.min(256, level));
  const bin = Math.floor(at / 8);
  let sum = 0;
  for (let k = bin + 1; k < 32; k++) sum += hist[k] ?? 0;
  if (bin < 32) sum += (hist[bin] ?? 0) * ((bin + 1) * 8 - at) / 8;
  return sum;
}

/** L1 distance between two normalised histograms (0 = identical, 2 = disjoint); null when either is missing. */
export function histogramL1(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  return a.reduce((s, v, i) => s + Math.abs((v ?? 0) - (b[i] ?? 0)), 0);
}

/** One metric of a stats object; null when unavailable (for example a GL_META v1 row has no rgb). */
export function metricOf(stats, metric) {
  if (!stats) return null;
  const rgb = Array.isArray(stats.rgb) ? stats.rgb : null;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const above = /^above(\d{1,3})$/.exec(metric);
  if (above) return fractionAbove(stats.hist, Number(above[1]));
  switch (metric) {
    case "r": return rgb ? rgb[0] : null;
    case "g": return rgb ? rgb[1] : null;
    case "b": return rgb ? rgb[2] : null;
    case "rb": return rgb ? rgb[0] / Math.max(1, rgb[2]) : null;
    case "rg": return rgb ? rgb[0] / Math.max(1, rgb[1]) : null;
    case "gb": return rgb ? rgb[1] / Math.max(1, rgb[2]) : null;
    case "spread": return num(stats.p95) !== null && num(stats.p5) !== null ? stats.p95 - stats.p5 : null;
    case "ratio": return num(stats.p95) !== null && num(stats.p5) !== null ? stats.p95 / Math.max(1, stats.p5) : null;
    default: return num(stats[metric]);
  }
}

const bounds = (spec) => (Array.isArray(spec) ? { min: spec[0] ?? null, max: spec[1] ?? null } : spec && typeof spec === "object" ? { min: spec.min ?? null, max: spec.max ?? null } : null);

/** Check one region against a flat band { metric: [min, max] }; returns the misses. */
export function checkBand(stats, band, region = "frame") {
  const misses = [];
  for (const [metric, spec] of Object.entries(band ?? {})) {
    if (metric === "cells" || metric === "crops" || metric === "note") continue;
    const b = bounds(spec);
    if (!b) continue;
    if (stats?.aggregate && PERCENTILES.has(metric)) { misses.push({ region, metric, value: null, ...b, reason: "percentiles need a single cell or a crop" }); continue; }
    const value = metricOf(stats, metric);
    if (value === null) {
      const reason = !stats ? "region missing" : /^above\d/.test(metric) && !Array.isArray(stats.hist) ? "above<N> needs a luma histogram (the frame or a crop, GL_META v2)" : "metric unavailable (GL_META v1 row?)";
      misses.push({ region, metric, value: null, ...b, reason });
      continue;
    }
    let ok;
    if (metric === "hue" && b.min !== null && b.max !== null && b.min > b.max) ok = value >= b.min || value <= b.max;
    else ok = (b.min === null || value >= b.min) && (b.max === null || value <= b.max);
    if (!ok) misses.push({ region, metric, value: round(value, 4), ...b });
  }
  return misses;
}

/** Check a GL_META row against a full band (frame metrics, `cells`, `crops`). */
export function checkRowBand(row, band) {
  const misses = [];
  if (row.blank === true) misses.push({ region: "frame", metric: "blank", value: true, min: null, max: null, reason: "blank frame (black or one colour): discard and recapture (lesson V1, check GL_LFS and RENDERER_MOUNT_FAILED)" });
  const pending = row.info?.texPending;
  if (typeof pending === "number" && pending > 0) misses.push({ region: "frame", metric: "texPending", value: pending, min: null, max: 0, reason: "textures still uploading at this shot (lesson R4): recapture with GL_TEX_WAIT_S" });
  misses.push(...checkBand(row, band, "frame"));
  for (const [region, cellBand] of Object.entries(band?.cells ?? {})) {
    const stats = regionStats(row, region);
    if (!stats) { misses.push({ region: `cell:${region}`, metric: "*", value: null, min: null, max: null, reason: Array.isArray(row.cells) ? "unknown cell" : "no per-cell stats (GL_META v1 row)" }); continue; }
    misses.push(...checkBand(stats, cellBand, `cell:${region}`));
  }
  for (const [name, cropBand] of Object.entries(band?.crops ?? {})) {
    const stats = row.crops?.[name];
    if (!stats) { misses.push({ region: `crop:${name}`, metric: "*", value: null, min: null, max: null, reason: "crop not published at this shot" }); continue; }
    misses.push(...checkBand(stats, cropBand, `crop:${name}`));
  }
  return misses;
}

const mergeBand = (a, b) => ({ ...(a ?? {}), ...(b ?? {}), cells: { ...(a?.cells ?? {}), ...(b?.cells ?? {}) }, crops: { ...(a?.crops ?? {}), ...(b?.crops ?? {}) } });

/** The band that applies to one target: the file default (unless excepted) under the variant band. */
export function bandFor(spec, row) {
  const variants = spec?.variants ?? {};
  const own = variants[row.target] ?? variants[row.variant] ?? null;
  const excepted = Boolean(spec?.exceptions && (row.variant in spec.exceptions || row.target in spec.exceptions));
  const base = excepted ? {} : (spec?.default ?? DEFAULT_BAND);
  return { band: mergeBand(base, own), declared: own !== null, excepted };
}

/**
 * Evaluate steady-state rows against a band file (or the PRD default when spec is null).
 * @returns {{ target, variant, id, pass, declared, excepted, misses }[]}
 */
export function evaluateBands(rows, spec = null, { slug, target } = {}) {
  const want = slug ?? spec?.slug;
  const out = [];
  for (const row of steadyRows(rows)) {
    if (want && row.slug !== want && !String(row.target).startsWith(`${want}--`)) continue;
    if (!targetMatches(row, target)) continue;
    const { band, declared, excepted } = bandFor(spec, row);
    const misses = checkRowBand(row, band);
    out.push({ target: row.target, variant: row.variant ?? null, id: row.id, pass: misses.length === 0, declared, excepted, misses });
  }
  return out;
}

// ---------- compare ----------

const deltaOf = (a, b, metric) => { const x = metricOf(a, metric), y = metricOf(b, metric); return x === null || y === null ? null : round(y - x, 4); };
const deRgb = (a, b) => (Array.isArray(a?.rgb) && Array.isArray(b?.rgb) ? round(deltaE2000(a.rgb, b.rgb), 2) : null);
const lapRatio = (a, b) => (typeof a?.lap === "number" && typeof b?.lap === "number" && a.lap > 0 ? round(b.lap / a.lap, 3) : null);

function compareStats(a, b) {
  return {
    mean: deltaOf(a, b, "mean"), p5: deltaOf(a, b, "p5"), p95: deltaOf(a, b, "p95"), std: deltaOf(a, b, "std"),
    darkFrac: deltaOf(a, b, "darkFrac"), clipFrac: deltaOf(a, b, "clipFrac"), sat: deltaOf(a, b, "sat"),
    hue: hueDelta(a?.hue ?? null, b?.hue ?? null), dE: deRgb(a, b), lapRatio: lapRatio(a, b),
    hueL1: round(histogramL1(a?.hueHist, b?.hueHist), 3)
  };
}

/** Pair two captures by target at the last steady shot; frame, per-cell and per-crop deltas (after minus before). */
export function compareCaptures(beforeRows, afterRows, { target } = {}) {
  const A = lastShots(steadyRows(beforeRows).filter((r) => targetMatches(r, target)));
  const B = lastShots(steadyRows(afterRows).filter((r) => targetMatches(r, target)));
  const names = [...new Set([...A.keys(), ...B.keys()])];
  return names.map((name) => {
    const a = A.get(name) ?? null, b = B.get(name) ?? null;
    if (!a || !b) return { target: name, before: a ? a.mean : null, after: b ? b.mean : null, missing: !a ? "before" : "after" };
    const cells = Array.isArray(a.cells) && Array.isArray(b.cells) ? a.cells.map((c, i) => compareStats(c, b.cells[i])) : null;
    const crops = {};
    for (const n of Object.keys(a.crops ?? {})) if (b.crops?.[n]) crops[n] = compareStats(a.crops[n], b.crops[n]);
    return { target: name, before: a.mean, after: b.mean, frame: compareStats(a, b), cells, crops };
  });
}

// ---------- formatting ----------

const cellFmt = (v) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.map((x) => round(x, 1)).join("/") : typeof v === "number" ? String(round(v, 3)) : String(v));
const md = (head, rows) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cellFmt).join(" | ")} |`)].join("\n");
const STAT_COLS = ["mean", "std", "p5", "p50", "p95", "darkFrac", "clipFrac", "rgb", "hue", "sat", "lap", "edge"];

export function formatRowTables(row) {
  const parts = [`### ${row.target} ${row.id}${row.gl ? "" : " (GL_META v1: no colour, cell or crop stats)"}`];
  parts.push(md(["region", ...STAT_COLS], [["frame", ...STAT_COLS.map((k) => row[k])]]));
  if (Array.isArray(row.cells)) parts.push(md(["cell", ...STAT_COLS], row.cells.map((c, i) => [String(i), ...STAT_COLS.map((k) => c?.[k])])));
  const crops = Object.entries(row.crops ?? {});
  if (crops.length) parts.push(md(["crop", "rect px", ...STAT_COLS], crops.map(([n, c]) => [n, `${c.x},${c.y} ${c.w}x${c.h}`, ...STAT_COLS.map((k) => c[k])])));
  return parts.join("\n\n");
}

export function formatBands(results) {
  const rows = results.map((r) => [r.target, r.id, r.pass ? "pass" : "MISS", r.declared ? "declared" : "default", r.excepted ? "yes" : "",
    r.misses.map((m) => `${m.region} ${m.metric}=${m.value ?? "n/a"} not in [${m.min ?? ""}, ${m.max ?? ""}]${m.reason ? ` (${m.reason})` : ""}`).join("; ")]);
  return md(["target", "shot", "result", "band", "exception", "misses"], rows);
}

export function formatCompare(results) {
  const lines = [md(["target", "before mean", "after mean", "d mean", "d p95", "d dark", "d clip", "d hue", "dE2000", "lap ratio"],
    results.map((r) => (r.missing ? [r.target, r.before ?? "not reached", r.after ?? "not reached", "", "", "", "", "", "", ""]
      : [r.target, r.before, r.after, r.frame.mean, r.frame.p95, r.frame.darkFrac, r.frame.clipFrac, r.frame.hue, r.frame.dE, r.frame.lapRatio])))];
  for (const r of results) {
    if (!r.cells && !Object.keys(r.crops ?? {}).length) continue;
    const rows = [];
    (r.cells ?? []).forEach((c, i) => rows.push([`cell ${i}`, c.mean, c.hue, c.dE, c.lapRatio]));
    for (const [n, c] of Object.entries(r.crops ?? {})) rows.push([`crop ${n}`, c.mean, c.hue, c.dE, c.lapRatio]);
    lines.push(`\n#### ${r.target}\n\n${md(["region", "d mean", "d hue", "dE2000", "lap ratio"], rows)}`);
  }
  return lines.join("\n");
}

export function formatPairs(pairs) {
  const lines = [md(["target", "shot", "gap ms", "mean |dY|", "mean |dRGB|", "changed", "ssim"], pairs.map((p) => [p.target, p.id, p.gapMs, p.diff?.meanAbsY, p.diff?.meanAbsRGB, p.diff?.changedFrac, p.diff?.ssim]))];
  for (const p of pairs) {
    const rows = (p.diff?.cells ?? []).map((c, i) => [`cell ${i}`, c.meanAbsY, c.changedFrac, c.ssim]);
    for (const [n, c] of Object.entries(p.diff?.crops ?? {})) rows.push([`crop ${n}`, c.meanAbsY, c.changedFrac, c.ssim]);
    if (rows.length) lines.push(`\n#### ${p.target} ${p.id}\n\n${md(["region", "mean |dY|", "changed", "ssim"], rows)}`);
  }
  return lines.join("\n");
}

// ---------- CLI ----------

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const positional = rest.filter((a, i) => !a.startsWith("--") && !["--target", "--bands", "--out"].includes(rest[i - 1]));
  const json = rest.includes("--json");
  const target = opt("--target");
  const say = (value, text) => console.log(json ? JSON.stringify(value, null, 2) : text);
  const need = (n) => { if (positional.length < n || positional.slice(0, n).some((p) => !existsSync(p))) { console.error(`usage: see the header of tools/look-metrics/region-luma.mjs (${cmd} needs ${n} existing file(s))`); process.exit(2); } };
  switch (cmd) {
    case "table": {
      need(1);
      const rows = loadCapture(positional[0]).metas.filter((r) => targetMatches(r, target));
      const picked = rest.includes("--all-shots") ? rows : [...lastShots(steadyRows(rows)).values()];
      return say(picked, picked.map(formatRowTables).join("\n\n") || "no steady-state rows");
    }
    case "bands": {
      need(1);
      const file = opt("--bands");
      const spec = file ? JSON.parse(readFileSync(file, "utf8")) : null;
      if (spec && spec.schema !== LUMA_BANDS_SCHEMA) console.error(`warning: ${file} has schema ${spec.schema}, expected ${LUMA_BANDS_SCHEMA}`);
      const results = evaluateBands(loadCapture(positional[0]).metas, spec, { target });
      say(results, formatBands(results));
      return results.every((r) => r.pass) ? undefined : process.exit(1);
    }
    case "compare": {
      need(2);
      const results = compareCaptures(loadCapture(positional[0]).metas, loadCapture(positional[1]).metas, { target });
      return say(results, formatCompare(results));
    }
    case "pairs": {
      need(1);
      const pairs = loadCapture(positional[0]).pairs.filter((p) => targetMatches(p, target));
      return say(pairs, pairs.length ? formatPairs(pairs) : "no GL_PAIR rows (capture with GL_PAIR_MS=<ms>)");
    }
    case "extract": {
      need(1);
      const out = opt("--out");
      const capture = loadCapture(positional[0]);
      if (!out) { console.error("extract needs --out <capture.json>"); process.exit(2); }
      writeFileSync(out, `${JSON.stringify(capture, null, 1)}\n`);
      return console.log(`wrote ${out}: ${capture.metas.length} GL_META, ${capture.pairs.length} GL_PAIR rows`);
    }
    default:
      console.error("usage: node tools/look-metrics/region-luma.mjs table|bands|compare|pairs|extract ... (see the file header)");
      process.exit(2);
  }
}

const isMain = () => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) main(process.argv.slice(2));
