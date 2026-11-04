#!/usr/bin/env node
// 4.7.10 vs 5.0 contact sheet. Pure Node plus `sharp` (already a root dependency) for image IO only; every metric is computed
// here on raw RGB.
//
//   node tools/release/visual-compare-5.0/contact-sheet.mjs --frames <run-dir|frames-dir> [--frames ...] --out <dir>
//        [--plan tools/release/visual-compare-5.0/plan.json] [--acceptance-run tests/reports/native-5/<RUN_ID>]
//        [--baseline-root gu47-integration=/abs/dir] [--threshold 24] [--amplify 4] [--lossless] [--strict]
//
//   --frames          a visual-compare run directory (contains frames/ and environment.json), its frames/ directory, or a
//                     parent holding several run directories (one per ACR shard); repeat for more
//   --acceptance-run  a downloaded acceptance run (tests/reports/native-5/<RUN_ID>[-b1|-b2]; repeatable); showcase frames are harvested from
//                     its native-examples-catalog screenshots and native-*.spec PNG attachments, no capture needed
//   --lossless        compare the 5.0 PNG instead of its JPEG re-encode (default: JPEG, like for like with the JPEG baselines)
//   --strict          exit 1 when a paired view has no 5.0 frame, or a baseline is missing or no longer matches its sha256
//
// Writes <out>/panels/<id>.png (paired: [4.7.10 | 5.0 | amplified abs diff]; showcase: [fallback | 5.0]), <out>/summary.png,
// <out>/index.html and <out>/metrics.json. Differences are a signal to LOOK at the frames, not a verdict: see
// docs/release/5.0-visual-comparison.md (animated scenes, software renderer, blind-panel rule).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PLAN = join(here, 'plan.json');
export const GRID = { cols: 8, rows: 6 };
// Static bands of the 1280x720 frames named in the blind-panel-noise note: sky rows 0-120, foreground rows 500-720.
export const BANDS = { sky: [0, 120 / 720], foreground: [500 / 720, 1] };

// ------------------------------------------------------------------ pixels

/** Decode a file or buffer to { width, height, data } with data = RGB bytes (alpha flattened onto black). */
export async function decodeRgb(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

/** Resize to the reference size when dimensions differ (fill, no aspect preservation: a size change is reported, not hidden). */
export async function matchSize(img, width, height) {
  if (img.width === width && img.height === height) return { img, resized: false };
  const { data } = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 3 } })
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  return { img: { width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }, resized: true };
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Metrics between two same-size RGB images.
 *  meanAbsDiff   mean |a-b| over every channel of every pixel, 0..255
 *  pctChanged    percent of pixels whose largest channel difference exceeds `threshold`
 *  maxRegion     the GRID cell with the largest mean |a-b| (pixel rectangle, x/y from the top left)
 *  lumaMean      Rec.709 luma mean of each image and their difference (b - a)
 *  bandDelta     per static band, the signed difference of the band's mean RGB (b - a)
 */
export function compareRgb(a, b, { threshold = 24, grid = GRID } = {}) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('compareRgb needs same-size images');
  const { width: w, height: h } = a;
  const cells = new Float64Array(grid.cols * grid.rows), cellN = new Float64Array(grid.cols * grid.rows);
  let sum = 0, changed = 0, la = 0, lb = 0;
  const band = Object.fromEntries(Object.entries(BANDS).map(([k, [y0, y1]]) => [k, { y0: Math.floor(y0 * h), y1: Math.ceil(y1 * h), a: [0, 0, 0], b: [0, 0, 0], n: 0 }]));
  for (let y = 0; y < h; y++) {
    const cy = Math.min(grid.rows - 1, Math.floor((y * grid.rows) / h));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const dr = Math.abs(a.data[i] - b.data[i]), dg = Math.abs(a.data[i + 1] - b.data[i + 1]), db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const d = dr + dg + db;
      sum += d;
      if (Math.max(dr, dg, db) > threshold) changed++;
      const c = cy * grid.cols + Math.min(grid.cols - 1, Math.floor((x * grid.cols) / w));
      cells[c] += d / 3; cellN[c]++;
      la += luma(a.data[i], a.data[i + 1], a.data[i + 2]); lb += luma(b.data[i], b.data[i + 1], b.data[i + 2]);
      for (const k of Object.keys(band)) {
        const s = band[k];
        if (y >= s.y0 && y < s.y1) { for (let ch = 0; ch < 3; ch++) { s.a[ch] += a.data[i + ch]; s.b[ch] += b.data[i + ch]; } s.n++; }
      }
    }
  }
  const px = w * h;
  let best = 0;
  for (let c = 1; c < cells.length; c++) if (cells[c] / cellN[c] > cells[best] / cellN[best]) best = c;
  const col = best % grid.cols, row = Math.floor(best / grid.cols);
  const x0 = Math.floor((col * w) / grid.cols), x1 = Math.floor(((col + 1) * w) / grid.cols);
  const y0 = Math.floor((row * h) / grid.rows), y1 = Math.floor(((row + 1) * h) / grid.rows);
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    width: w, height: h, threshold,
    meanAbsDiff: r2(sum / (px * 3)),
    pctChanged: r2((changed / px) * 100),
    maxRegion: { cell: { col, row }, x: x0, y: y0, width: x1 - x0, height: y1 - y0, meanAbsDiff: r2(cells[best] / cellN[best]) },
    lumaMean: { a: r2(la / px), b: r2(lb / px), delta: r2((lb - la) / px) },
    bandDelta: Object.fromEntries(Object.entries(band).map(([k, s]) => [k, s.n ? s.a.map((v, i) => r2((s.b[i] - v) / s.n)) : null]))
  };
}

/** Amplified abs-diff heat map (black, red, yellow, white), same size as the inputs. */
export function heatmapRgb(a, b, { amplify = 4 } = {}) {
  const out = new Uint8Array(a.width * a.height * 3);
  for (let p = 0, i = 0; p < a.width * a.height; p++, i += 3) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    const v = Math.min(1, (d * amplify) / 255);
    out[i] = Math.round(255 * Math.min(1, v * 2));
    out[i + 1] = Math.round(255 * Math.max(0, Math.min(1, v * 2 - 1)));
    out[i + 2] = Math.round(255 * Math.max(0, Math.min(1, v * 4 - 3)));
  }
  return { width: a.width, height: a.height, data: out };
}

// ------------------------------------------------------------------ files

export const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function walk(dir, visit, depth = 0) {
  if (depth > 12 || !existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, visit, depth + 1); else if (e.isFile()) visit(p);
  }
}

/** Find 5.0 frames: `<id>.png|jpg` and `<id>--<shot>.png|jpg` under every frames directory (later directories win). */
export function indexFrames(roots) {
  const found = new Map(); // `${stem}.${ext}` -> path
  const envs = [];
  const runDirs = new Set();
  for (const root of roots) {
    walk(root, (p) => {
      if (/\.(png|jpg)$/.test(p) && basename(dirname(p)) === 'frames') { found.set(basename(p), p); runDirs.add(dirname(dirname(p))); }
      else if (basename(p) === 'environment.json') envs.push(p);
    });
  }
  const environments = [];
  for (const p of envs) { try { environments.push({ path: p, ...JSON.parse(readFileSync(p, 'utf8')) }); } catch { /* unreadable environment */ } }
  return { found, environments, runDirs: [...runDirs] };
}

export function resolveBaseline(baseline, roots) {
  if (!baseline) return { status: 'no-baseline' };
  const base = roots[baseline.root];
  if (!base) return { status: 'baseline-root-unknown', root: baseline.root };
  const file = resolve(base, baseline.path);
  if (!existsSync(file)) return { status: 'baseline-missing', file };
  const sha = sha256File(file);
  return sha === baseline.sha256 ? { status: 'ok', file, sha256: sha } : { status: 'baseline-sha-mismatch', file, sha256: sha, expected: baseline.sha256 };
}

/** The 5.0 file for a shot: the primary shot is `<id>`, any other `<id>--<shot>`; JPEG first unless `lossless`. */
export function frameFor(index, view, shot, { lossless = false } = {}) {
  const stem = shot === view.capture?.primaryShot ? view.id : `${view.id}--${shot}`;
  const order = lossless ? ['png'] : ['jpg', 'png'];
  for (const ext of order) { const p = index.found.get(`${stem}.${ext}`); if (p) return { file: p, comparedAs: ext === 'jpg' ? 'jpeg' : 'png' }; }
  return null;
}

// ----------------------------------------------------------- showcase harvest

/** Screenshot of a native-examples-catalog item: `<item id with non [a-z0-9_-] replaced by "-">.png` under any test-results tree. */
export function findCatalogShot(runDir, item) {
  const want = `${item.replace(/[^a-z0-9_-]/gi, '-')}.png`;
  let best = null;
  walk(runDir, (p) => { if (basename(p) === want && p.split('/').includes('test-results') && (!best || p.length < best.length)) best = p; });
  return best ? { file: best } : null;
}

/** PNG attachment of a native spec: a `path` attachment on disk, or an inline base64 `body` in a Playwright JSON report. */
export function findAttachment(runDir, spec, name) {
  let hit = null;
  const visitSuite = (suite, reportFile) => {
    for (const s of suite.specs ?? []) {
      if (!String(s.file ?? '').includes(spec)) continue;
      for (const t of s.tests ?? []) for (const r of t.results ?? []) for (const a of r.attachments ?? []) {
        if (hit || a.name !== name) continue;
        if (a.body) hit = { buffer: Buffer.from(a.body, 'base64') };
        else if (a.path) { const p = existsSync(a.path) ? a.path : join(dirname(reportFile), a.path); if (existsSync(p)) hit = { file: p }; }
      }
    }
    for (const child of suite.suites ?? []) visitSuite(child, reportFile);
  };
  walk(runDir, (p) => {
    if (hit || !/(^|\/)remote-acr-report\.json$/.test(p) || statSync(p).size > 400 * 1024 * 1024) return;
    try { for (const suite of JSON.parse(readFileSync(p, 'utf8')).suites ?? []) visitSuite(suite, p); } catch { /* not a report */ }
  });
  return hit;
}

/** `runDirs` is one acceptance run directory or an array of them (batch 1 and batch 2 are separate runs). */
export function harvestShowcase(runDirs, source) {
  if (!source) return null;
  for (const runDir of [].concat(runDirs ?? []).filter(Boolean)) {
    if (source.type === 'examples-catalog') { const hit = findCatalogShot(runDir, source.item); if (hit) return hit; }
    else if (source.type === 'spec-attachment') {
      for (const name of source.names ?? []) { const hit = findAttachment(runDir, source.spec, name); if (hit) return { ...hit, name }; }
    }
  }
  return null;
}

// ------------------------------------------------------------------ rendering

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const label = (width, height, text, { fill = '#e8e8e8', bg = '#1b1b1b', size = 14 } = {}) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/><text x="6" y="${Math.round(height * 0.7)}" font-size="${size}" font-family="Menlo, Consolas, DejaVu Sans Mono, monospace" fill="${fill}">${esc(text).slice(0, Math.floor(width / (size * 0.62)))}</text></svg>`);
const rawInput = (img) => ({ raw: { width: img.width, height: img.height, channels: 3 } });
const resizedPng = async (img, width, height) => sharp(Buffer.from(img.data), rawInput(img)).resize(width, height, { fit: 'fill' }).png().toBuffer();
const blank = (width, height, text) => sharp({ create: { width, height, channels: 3, background: '#2a1a1a' } }).composite([{ input: label(width, 22, text, { fill: '#ff9d9d', bg: '#2a1a1a' }), left: 0, top: Math.floor(height / 2) - 11 }]).png().toBuffer();

/** A row of equal-size cells with a caption strip above each: [{ title, img|null, missing }]. */
export async function renderRow(cells, { cellWidth = 640, cellHeight = 360, header }) {
  const capH = 22, headH = header ? 26 : 0;
  const composites = [];
  if (header) composites.push({ input: label(cellWidth * cells.length, headH, header.text, { fill: header.fill ?? '#ffffff', bg: header.bg ?? '#333', size: 15 }), left: 0, top: 0 });
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    composites.push({ input: label(cellWidth, capH, c.title), left: i * cellWidth, top: headH });
    composites.push({ input: c.img ? await resizedPng(c.img, cellWidth, cellHeight) : await blank(cellWidth, cellHeight, c.missing ?? 'missing'), left: i * cellWidth, top: headH + capH });
  }
  return sharp({ create: { width: cellWidth * cells.length, height: headH + capH + cellHeight, channels: 3, background: '#000' } }).composite(composites).png().toBuffer();
}

const fmt = (m) => (m ? `abs ${m.meanAbsDiff}  >${m.threshold}: ${m.pctChanged}%  luma ${m.lumaMean.delta >= 0 ? '+' : ''}${m.lumaMean.delta}  max cell r${m.maxRegion.cell.row + 1}c${m.maxRegion.cell.col + 1}` : 'no comparison');

// ------------------------------------------------------------------ main

export async function buildSheet({ plan, frameRoots, out, acceptanceRun = null, baselineRoots, threshold = 24, amplify = 4, lossless = false, repoRoot = process.cwd() }) {
  const roots = {};
  for (const [name, rel] of Object.entries(plan.baselineRoots ?? {})) roots[name] = resolve(repoRoot, rel);
  Object.assign(roots, baselineRoots ?? {});
  const index = indexFrames(frameRoots);
  mkdirSync(join(out, 'panels'), { recursive: true });
  const rows = [];
  const results = [];
  const problems = [];

  for (const view of plan.views.filter((v) => v.kind === 'paired')) {
    const shot = view.capture?.primaryShot ?? view.settle?.defaultShots?.[0];
    const base = resolveBaseline(view.baselines?.[shot], roots);
    if (base.status !== 'ok') problems.push(`${view.id}: baseline ${base.status}${base.file ? ` (${base.file})` : ''}`);
    const mine = frameFor(index, view, shot, { lossless });
    if (!mine) problems.push(`${view.id}: no 5.0 frame for ${shot}`);
    const row = { id: view.id, kind: 'paired', target: view.target, shot, categories: view.categories, motion: view.motion,
      changedIn4710: view.changedIn4710, expectedDelta: view.expectedDelta, baseline: { status: base.status, path: view.baselines?.[shot]?.path ?? null, file: base.file ?? null, sha256: base.sha256 ?? null },
      frame5: mine ? { file: mine.file, comparedAs: mine.comparedAs } : null, metrics: null, resized: false };
    let a = null, b = null;
    if (base.file && (base.status === 'ok' || base.status === 'baseline-sha-mismatch')) a = await decodeRgb(base.file);
    if (mine) b = await decodeRgb(mine.file);
    if (a && b) {
      const m = await matchSize(b, a.width, a.height);
      b = m.img; row.resized = m.resized;
      row.metrics = compareRgb(a, b, { threshold });
      // Frames cannot be compared like for like when one side is a lossy re-encode of the other; say so in the data.
      row.noiseFloorNote = mine.comparedAs === 'jpeg' ? 'both sides are JPEG q0.7 canvas-only re-encodes' : 'baseline is JPEG q0.7, 5.0 side is lossless PNG: add about 1-3 levels of codec noise';
    }
    const heat = a && b ? heatmapRgb(a, b, { amplify }) : null;
    const header = { text: `PAIRED  ${view.id}  (${view.target})  ${shot}  ${view.motion}${view.changedIn4710 ? '  [4.7.10 changed: ' + view.changedIn4710 + ']' : ''}  ${fmt(row.metrics)}`, bg: '#1d3b5c' };
    const panel = await renderRow([
      { title: `4.7.10 baseline  ${base.status}`, img: a, missing: `baseline ${base.status}` },
      { title: `5.0 ${mine ? mine.comparedAs : ''}  ${view.capture?.output ?? ''}`, img: b, missing: 'no 5.0 frame' },
      { title: `|diff| x${amplify}`, img: heat, missing: 'n/a' }
    ], { header });
    writeFileSync(join(out, 'panels', `${view.id}.png`), panel);
    row.panel = `panels/${view.id}.png`;
    rows.push({ row, a, b, heat, kind: 'paired' });
    results.push(row);
  }

  for (const view of plan.showcase ?? []) {
    const hit = harvestShowcase(acceptanceRun, view.source);
    const fb = view.fallback ? harvestShowcase(acceptanceRun, view.fallback) : null;
    const load = async (h) => (h ? decodeRgb(h.file ?? h.buffer) : null);
    const img = await load(hit), fbImg = await load(fb);
    if (!img) problems.push(`${view.id}: showcase frame not found (${view.source?.item ?? view.source?.spec})`);
    const row = { id: view.id, kind: 'showcase', title: view.title, capability: view.capability, enable: view.enable, source: view.source, fallbackSource: view.fallback ?? null,
      found: Boolean(img), fallbackFound: Boolean(fbImg), metrics: img && fbImg ? compareRgb(fbImg, (await matchSize(img, fbImg.width, fbImg.height)).img, { threshold }) : null };
    const cells = [];
    if (view.fallback) cells.push({ title: `fallback: ${view.fallback.item ?? view.fallback.names?.join(',')}${view.fallback.note ? ' (' + view.fallback.note + ')' : ''}`, img: fbImg, missing: 'fallback frame not found' });
    cells.push({ title: `5.0 showcase: ${view.title}`, img, missing: 'showcase frame not found' });
    const panel = await renderRow(cells, { header: { text: `SHOWCASE  ${view.id}  ${view.capability}${row.metrics ? '  ' + fmt(row.metrics) : ''}`, bg: '#4a2f5c' }, cellWidth: view.fallback ? 640 : 960, cellHeight: view.fallback ? 360 : 540 });
    writeFileSync(join(out, 'panels', `${view.id}.png`), panel);
    row.panel = `panels/${view.id}.png`;
    rows.push({ row, a: fbImg, b: img, kind: 'showcase' });
    results.push(row);
  }

  // Summary sheet: one thin row per view.
  const sumW = 320, sumH = 180;
  const sumCells = [];
  for (const r of rows) {
    const cells = r.kind === 'paired'
      ? [{ title: `PAIRED ${r.row.id} 4.7.10`, img: r.a }, { title: `5.0  abs ${r.row.metrics?.meanAbsDiff ?? '-'}  >${threshold}: ${r.row.metrics?.pctChanged ?? '-'}%`, img: r.b }, { title: 'diff', img: r.heat }]
      : [{ title: `SHOWCASE ${r.row.id} fallback`, img: r.a }, { title: `5.0 ${r.row.title}`, img: r.b }, { title: '', img: null, missing: '' }];
    sumCells.push(await renderRow(cells, { cellWidth: sumW, cellHeight: sumH }));
  }
  const sumRowH = 22 + sumH;
  if (sumCells.length) {
    await sharp({ create: { width: sumW * 3, height: sumRowH * sumCells.length, channels: 3, background: '#000' } })
      .composite(sumCells.map((input, i) => ({ input, left: 0, top: i * sumRowH }))).png().toFile(join(out, 'summary.png'));
  }

  const environment = { fiveZero: index.environments.map(({ path, ...rest }) => ({ file: path, ...rest })), fourSeven10: plan.from, to: plan.to };
  const metrics = {
    schema: 'aura3d.visual-compare-metrics/1', generatedAt: new Date().toISOString(), threshold, amplify, comparedAs: lossless ? 'png' : 'jpeg-preferred',
    gridCells: GRID, environment, views: results, problems,
    counts: { paired: results.filter((r) => r.kind === 'paired').length, pairedCompared: results.filter((r) => r.kind === 'paired' && r.metrics).length,
      showcase: results.filter((r) => r.kind === 'showcase').length, showcaseFound: results.filter((r) => r.kind === 'showcase' && r.found).length },
    showcaseNotShown: plan.showcaseNotShown ?? [], missingBaselines: plan.missingBaselines ?? []
  };
  writeFileSync(join(out, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  writeFileSync(join(out, 'index.html'), renderHtml(metrics));
  return metrics;
}

function renderHtml(m) {
  const row = (r) => `<tr class="${r.kind}"><td>${esc(r.kind)}</td><td>${esc(r.id)}</td><td>${r.kind === 'paired' ? esc(r.shot) + ' / ' + esc(r.motion) : esc(r.capability)}</td>`
    + (r.metrics ? `<td>${r.metrics.meanAbsDiff}</td><td>${r.metrics.pctChanged}%</td><td>${r.metrics.lumaMean.delta}</td><td>r${r.metrics.maxRegion.cell.row + 1}c${r.metrics.maxRegion.cell.col + 1}</td>` : '<td colspan="4">no comparison</td>')
    + `<td>${r.kind === 'paired' ? esc(r.baseline.status) + (r.changedIn4710 ? '; ' + esc(r.expectedDelta) : '') : r.found ? 'found' : 'not found'}</td></tr>`;
  const env = (m.environment.fiveZero.length ? m.environment.fiveZero : [{ note: 'no environment.json found' }]).map((e) => `<pre>${esc(JSON.stringify(e, null, 1))}</pre>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Aura3D 4.7.10 vs 5.0 visual comparison</title>
<style>body{font:14px system-ui,sans-serif;background:#111;color:#ddd;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #444;padding:3px 8px}tr.paired td:first-child{background:#1d3b5c}tr.showcase td:first-child{background:#4a2f5c}img{max-width:100%}pre{background:#1b1b1b;padding:8px;overflow:auto}.warn{color:#ffb86b}</style>
<h1>Aura3D 4.7.10 vs 5.0 visual comparison</h1>
<p class="warn">A difference is a prompt to look at the frames, not a verdict. Animated scenes are time-driven, both sides are software-rendered, and the baselines are older JPEG frames of record. Read docs/release/5.0-visual-comparison.md before drawing a conclusion.</p>
<p>paired ${m.counts.pairedCompared}/${m.counts.paired} compared; showcase ${m.counts.showcaseFound}/${m.counts.showcase} found; threshold ${m.threshold}; ${m.problems.length} problems.</p>
<h2>Summary</h2><p><a href="summary.png"><img src="summary.png" alt="summary sheet"></a></p>
<table><tr><th>kind</th><th>id</th><th>shot / capability</th><th>mean abs diff</th><th>% px &gt; ${m.threshold}</th><th>luma delta</th><th>max cell</th><th>baseline / note</th></tr>${m.views.map(row).join('')}</table>
<h2>Problems</h2><ul>${m.problems.map((p) => `<li>${esc(p)}</li>`).join('') || '<li>none</li>'}</ul>
<h2>Environment (5.0 side, recorded at capture time)</h2>${env}<h2>Baseline side</h2><pre>${esc(JSON.stringify(m.environment.fourSeven10, null, 1))}</pre>
<h2>Panels</h2>${m.views.map((r) => `<h3>${esc(r.kind)}: ${esc(r.id)}</h3><img src="${r.panel}" alt="${esc(r.id)}">`).join('')}
<h2>Features not shown</h2><ul>${m.showcaseNotShown.map((n) => `<li>${esc(n.feature)}: ${esc(n.why)}</li>`).join('')}</ul>
<h2>Desired views without a 4.7.10 baseline</h2><ul>${m.missingBaselines.map((n) => `<li>${esc(n.want)}: ${esc(n.why)}</li>`).join('')}</ul>`;
}

function parseArgs(argv) {
  const o = { frames: [], baselineRoot: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--frames') o.frames.push(argv[++i]);
    else if (a === '--baseline-root') { const [k, v] = argv[++i].split('='); o.baselineRoot[k] = resolve(v); }
    else if (a === '--acceptance-run') (o.acceptanceRun ??= []).push(argv[++i]);
    else if (['--plan', '--out', '--threshold', '--amplify'].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a === '--lossless' || a === '--strict') o[a.slice(2)] = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.out || (!o.frames.length && !o.acceptanceRun)) { console.error('usage: contact-sheet.mjs --frames <dir> [...] --out <dir> [--plan p] [--acceptance-run d] [--baseline-root name=dir] [--threshold n] [--amplify n] [--lossless] [--strict]'); process.exit(2); }
  const plan = JSON.parse(readFileSync(o.plan ?? DEFAULT_PLAN, 'utf8'));
  const metrics = await buildSheet({ plan, frameRoots: o.frames.map((f) => resolve(f)), out: resolve(o.out), acceptanceRun: (o.acceptanceRun ?? []).map((d) => resolve(d)),
    baselineRoots: o.baselineRoot, threshold: o.threshold ? Number(o.threshold) : 24, amplify: o.amplify ? Number(o.amplify) : 4, lossless: Boolean(o.lossless) });
  console.log(`paired ${metrics.counts.pairedCompared}/${metrics.counts.paired}, showcase ${metrics.counts.showcaseFound}/${metrics.counts.showcase}, ${metrics.problems.length} problems -> ${resolve(o.out)}/index.html`);
  for (const p of metrics.problems) console.log(`  problem: ${p}`);
  if (o.strict && metrics.problems.some((p) => !/showcase frame not found/.test(p))) process.exit(1);
}
