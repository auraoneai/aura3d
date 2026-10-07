#!/usr/bin/env node
/*
 * Route-composition classifier (research-16 vocabulary).
 *
 * For every game route in `games.json` (or apps/showcase-* fallback) it splits
 * route LOC into:
 *   evidence     - files under tests/ scripts/ art-review/ capture/ evidence/ seo/,
 *                  files whose names carry proof/evidence/probe/capture/acceptance/
 *                  telemetry/performance-report/poster/harness vocabulary, and
 *                  main.ts / *App.ts statements that open on that vocabulary or
 *                  spend >8% of their lines referencing evidence|probe|capture|
 *                  review|__X__.
 *   presentation - audio/HUD/environment/sky/lighting/material/feel/VFX/camera/
 *                  set-dressing/art-named modules (and statements on the same
 *                  vocabulary).
 *   gameplay     - everything else.
 *   generated    - src/generated/** and aura-assets.ts (excluded from LOC split).
 *
 * It also records per route: window.__X__ global names, capture-flag branch
 * counts by class (same classification as tools/showcase-library/
 * game-capture-parity.mjs — keep regexes in sync), sound-cue provenance counts
 * (sample | synth | html-audio), and a `postPass` slot filled in by the
 * qr-prd09-routes divergence job (app.diagnostics().postprocess.actualPasses > 0).
 *
 * usage:
 *   node tools/quality-rebuild-capture/route-composition.mjs [--root <dir>]
 *       [--routes <id,...>] [--json <out>] [--md <out>]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const root = resolve(opt("--root") ?? repoRoot);
const jsonOut = opt("--json");
const mdOut = opt("--md");
const routeFilter = opt("--routes")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

// ---- research-16 vocabularies ------------------------------------------------
const EVIDENCE_DIRS = new Set(["tests", "scripts", "art-review", "capture", "evidence", "seo"]);
const EVIDENCE_NAME = /proof|evidence|probe|capture|acceptance|telemetry|performance-report|poster|harness|smoke-test/i;
const EVIDENCE_LINE = /evidence|probe|capture|review|__[A-Z][A-Z0-9_]+__|telemetry|acceptance|poster|harness/i;
const PRESENTATION = /audio|sound|sfx|music|hud|menu|overlay|environ|sky|light|shadow|material|shader|post|bloom|fog|vignette|colorgrade|palette|fx|vfx|particle|feel|juice|dress|theme|decor|backdrop|scenic|camera|framing|table|arena|city|track|course|rail|skyline|ambient|cloud|star|neon|gradient|sparkle|trail/i;
// game-capture-parity.mjs mirrors — keep in sync.
const CAPTURE_FLAG = /capture\s*===\s*"review"|capture\s*===\s*"overview"|visualReviewCapture|visualCaptureCamera|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW/;
const BRANCH_ART = /\b(lights\.|effects\.|material\.|emissive|toneMapping|exposure|saturation|contrast|bloom|fog|colorGrade|antiAlias|shadow|\.background\(|\.addMany\(|\.add\(\s*$|castShadow|receiveShadow|envMap|roughness|metalness|clearcoat|visible:)/;
const BRANCH_FRAMING = /\b(camera|chase|fov|offset|targetOffset|smoothing|position|lookAt|rig)\b/i;
const BRANCH_TRANSIENT = /\b(particles?|trail|fx|effect|shake|reducedMotion|pulse|glow|spark|dust|smoke)\b/i;
const BINARY_EXT = /\.(wav|mp3|ogg|flac|glb|gltf|bin|png|jpe?g|webp|svg|gif|ktx2|hdr|exr|blend1?|zip|gz|tar|woff2?|ttf|otf|ico|wasm|map)$/i;
const GLOBAL_RE = /__([A-Z][A-Z0-9_]{2,})__/g;

function branchKind(line) {
  if (/\?\s*\[\s*\]\s*:/.test(line) || /:\s*\[\s*\]\s*,?\s*$/.test(line)) return "ART";
  if (BRANCH_ART.test(line)) return "ART";
  if (BRANCH_FRAMING.test(line)) return "FRAMING";
  if (BRANCH_TRANSIENT.test(line)) return "TRANSIENT";
  return "UNKNOWN";
}

// ---- file walk --------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) { walk(p, out); continue; }
    out.push(p);
  }
  return out;
}

function countLoc(path) {
  try { return readFileSync(path, "utf8").split("\n").length; } catch { return 0; }
}

// ---- main.ts / *App.ts statement split --------------------------------------
// A statement is a run of lines starting at brace depth 0 and closing when the
// running depth returns to 0 on a line that ends a statement (`;` or `}`).
// Strings and comments are approximated — this is a classifier, not a parser.
function splitStatements(src) {
  const lines = src.split("\n");
  const stmts = [];
  let cur = null;
  let depth = 0;
  let inTemplate = false;
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) { if (cur) cur.lines.push(line); continue; }
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    const bc = line.indexOf("/*");
    if (bc !== -1) { const end = line.indexOf("*/", bc + 2); if (end === -1) inBlockComment = true; line = line.slice(0, bc); }
    if (!inTemplate) {
      const lc = line.indexOf("//");
      if (lc !== -1) line = line.slice(0, lc);
    }
    let code = "";
    for (const ch of line) {
      if (ch === "`") inTemplate = !inTemplate;
      if (inTemplate) continue;
      code += ch;
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    const trimmed = line.trim();
    const hasCode = trimmed.length > 0 && trimmed !== "//";
    if (cur === null) {
      if (!hasCode || inTemplate) continue;
      cur = { start: i + 1, lines: [lines[i]], code };
    } else {
      cur.lines.push(lines[i]);
      cur.code += " " + code;
    }
    if (cur && depth <= 0 && !inTemplate && hasCode && (/[;}]$/.test(trimmed) || /^import\s|^export\s/.test(trimmed))) {
      cur.end = i + 1;
      stmts.push(cur);
      cur = null;
      depth = Math.max(0, depth);
    }
  }
  if (cur) { cur.end = lines.length; stmts.push(cur); }
  return stmts;
}

function classifyStatement(stmt) {
  const head = stmt.lines.slice(0, 3).join("\n");
  const hits = stmt.lines.filter((l) => EVIDENCE_LINE.test(l)).length;
  if (EVIDENCE_LINE.test(head) || (stmt.lines.length > 3 && hits / stmt.lines.length > 0.08)) return "evidence";
  const presHits = stmt.lines.filter((l) => PRESENTATION.test(l)).length;
  if (PRESENTATION.test(head) || presHits / Math.max(1, stmt.lines.length) >= 0.5) return "presentation";
  return "gameplay";
}

// ---- cue provenance ----------------------------------------------------------
function analyzeCues(files, routeDir) {
  // cue id -> provenance; a cue defined in a *cue.ts* union and re-mapped in an
  // audio manifest counts once, under the audio file's provenance.
  const KIND_RANK = { sample: 0, synth: 1, "html-audio": 2 };
  const byId = new Map();
  const hasBuildSfx = existsSync(join(routeDir, "scripts", "build-sfx.mjs"));
  for (const file of files) {
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    const src = readFileSync(file, "utf8");
    if (!/cue|Cue|AUDIO|Audio/.test(src)) continue;
    const ids = new Set();
    for (const m of src.matchAll(/type\s+\w*Cue\w*\s*=\s*([^;]+);/gs)) {
      for (const q of m[1].matchAll(/["']([a-z][a-z0-9-]*)["']/g)) ids.add(q[1]);
    }
    for (const q of src.matchAll(/\bcue:\s*["']([a-z][a-z0-9-]+)["']/g)) ids.add(q[1]);
    if (/audio|cue|sfx|sound/i.test(basename(file))) {
      const stop = new Set(["sfx", "ui", "ambient", "music", "voice", "bus", "volume", "loop", "priority", "spatial", "cue", "id", "key", "name", "asset", "url", "src", "kind", "type", "file", "path", "license", "author", "format", "channels", "sampleRate"]);
      for (const q of src.matchAll(/^\s*["']?([a-z][a-z0-9-]{2,})["']?\s*:\s*[{("']/gm)) {
        if (!stop.has(q[1])) ids.add(q[1]);
      }
    }
    if (ids.size === 0) continue;
    let kind = "sample";
    if (/HTMLAudioElement|new\s+Audio\s*\(/.test(src)) kind = "html-audio";
    else if (/Aura3D synthesis|OscillatorNode|createOscillator|build-sfx/.test(src)) kind = "synth";
    else if (hasBuildSfx) kind = "synth";
    for (const id of ids) {
      const prev = byId.get(id);
      if (!prev || KIND_RANK[kind] > KIND_RANK[prev]) byId.set(id, kind);
    }
  }
  const cues = { sample: 0, synth: 0, "html-audio": 0 };
  for (const kind of byId.values()) cues[kind]++;
  return cues;
}

// ---- per-route analysis --------------------------------------------------------
export function analyzeRoute(routeDir, relDir) {
  const files = walk(routeDir).filter((f) => !BINARY_EXT.test(f));
  const loc = { evidence: 0, presentation: 0, gameplay: 0, generated: 0 };
  const globals = new Set();
  const captureBranches = { ART: 0, FRAMING: 0, TRANSIENT: 0, UNKNOWN: 0 };
  const captureFlags = new Set();
  const cueFiles = [];
  for (const file of files) {
    const rel = relative(routeDir, file).split("\\").join("/");
    const segs = rel.split("/");
    const base = basename(file);
    const inSrc = segs[0] === "src";
    const src = inSrc && /\.(ts|tsx|js|mjs|mts|cts)$/.test(base) ? readFileSync(file, "utf8") : null;
    if (src) {
      for (const m of src.matchAll(GLOBAL_RE)) globals.add(`__${m[1]}__`);
      src.split("\n").forEach((line) => {
        if (!CAPTURE_FLAG.test(line)) return;
        // The flag parse/declaration line itself and body dataset tagging are
        // not divergences — but record which capture values the route reads.
        if (/get\(\s*["']capture["']\s*\)|document\.body\.dataset/.test(line)) {
          const cf = line.match(/get\(\s*["']capture["']\s*\)\s*===?\s*["']([\w-]+)["']/);
          if (cf) captureFlags.add(`?capture=${cf[1]}`);
          else captureFlags.add("?capture");
          return;
        }
        captureBranches[branchKind(line)]++;
      });
      if (/audio|cue|sfx|sound/i.test(base) || /type\s+\w*Cue\w*\s*=|cue:\s*["']|new\s+Audio\s*\(|HTMLAudioElement/.test(src)) cueFiles.push(file);
    }
    const n = countLoc(file);
    if (/^src\/generated\//.test(rel) || base === "aura-assets.ts") { loc.generated += n; continue; }
    if (segs.some((s) => EVIDENCE_DIRS.has(s)) || EVIDENCE_NAME.test(base)) { loc.evidence += n; continue; }
    if ((base === "main.ts" || /App\.ts$/.test(base)) && src) {
      for (const stmt of splitStatements(src)) loc[classifyStatement(stmt)] += stmt.lines.length;
      continue;
    }
    loc[PRESENTATION.test(base) ? "presentation" : "gameplay"] += n;
  }
  const classified = loc.evidence + loc.presentation + loc.gameplay;
  return {
    route: basename(routeDir),
    appDir: relDir,
    loc: { ...loc, classified, evidencePct: classified ? +(100 * (loc.evidence / classified)).toFixed(1) : 0 },
    globals: [...globals].sort(),
    captureBranches,
    captureFlag: captureFlags.size > 1 && captureFlags.has("?capture")
      ? [...captureFlags].filter((f) => f !== "?capture").sort()
      : [...captureFlags].sort(),
    cues: analyzeCues(cueFiles, routeDir),
    postPass: null,
  };
}

export function collectRoutes(rootDir) {
  const gamesPath = join(rootDir, "tools", "quality-rebuild-capture", "games.json");
  if (existsSync(gamesPath)) {
    const games = JSON.parse(readFileSync(gamesPath, "utf8")).games;
    return games.map((g) => ({ id: g.id, dir: join(rootDir, "apps", g.appDir) })).filter((g) => existsSync(g.dir));
  }
  const appsDir = join(rootDir, "apps");
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (/^showcase-/.test(d.name) || d.name === "aura-clash-showcase"))
    .map((d) => ({ id: d.name, dir: join(appsDir, d.name) }));
}

export function compose(rootDir, filter) {
  const routes = collectRoutes(rootDir).filter((r) => !filter || filter.includes(r.id) || filter.includes(basename(r.dir)));
  const report = {
    schema: "aura3d.quality-rebuild.route-composition/1",
    generatedAt: new Date().toISOString(),
    root: rootDir,
    routes: {},
    totals: { loc: { evidence: 0, presentation: 0, gameplay: 0, generated: 0 }, captureBranches: { ART: 0, FRAMING: 0, TRANSIENT: 0, UNKNOWN: 0 }, cues: { sample: 0, synth: 0, "html-audio": 0 } },
  };
  for (const r of routes) {
    const entry = analyzeRoute(r.dir, relative(rootDir, r.dir));
    report.routes[r.id] = entry;
    for (const k of Object.keys(report.totals.loc)) report.totals.loc[k] += entry.loc[k];
    for (const k of Object.keys(report.totals.captureBranches)) report.totals.captureBranches[k] += entry.captureBranches[k];
    for (const k of Object.keys(report.totals.cues)) report.totals.cues[k] += entry.cues[k];
  }
  return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const report = compose(root, routeFilter);
  if (jsonOut) {
    mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
    writeFileSync(resolve(jsonOut), JSON.stringify(report, null, 2) + "\n");
  }
  const md = [
    "# Route composition baseline (research-16)",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Route | evidence | presentation | gameplay | generated | ev% | ART | FRAMING | TRANSIENT | UNKNOWN | cues (sample/synth/html) |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...Object.values(report.routes).map((r) =>
      `| ${r.route} | ${r.loc.evidence} | ${r.loc.presentation} | ${r.loc.gameplay} | ${r.loc.generated} | ${r.loc.evidencePct} | ${r.captureBranches.ART} | ${r.captureBranches.FRAMING} | ${r.captureBranches.TRANSIENT} | ${r.captureBranches.UNKNOWN} | ${r.cues.sample}/${r.cues.synth}/${r.cues["html-audio"]} |`),
    `| **total** | **${report.totals.loc.evidence}** | **${report.totals.loc.presentation}** | **${report.totals.loc.gameplay}** | **${report.totals.loc.generated}** | | **${report.totals.captureBranches.ART}** | **${report.totals.captureBranches.FRAMING}** | **${report.totals.captureBranches.TRANSIENT}** | **${report.totals.captureBranches.UNKNOWN}** | ${report.totals.cues.sample}/${report.totals.cues.synth}/${report.totals.cues["html-audio"]} |`,
    "",
  ];
  if (mdOut) { mkdirSync(dirname(resolve(mdOut)), { recursive: true }); writeFileSync(resolve(mdOut), md.join("\n")); }
  console.log(md.join("\n"));
  if (jsonOut) console.log(`json -> ${resolve(jsonOut)}`);
}
