#!/usr/bin/env node
// Render gate: "a release without a rendered frame is not a release".
//
//   node tools/release/render-gate/index.mjs --out <dir> --base https://aura3d.auraone.ai            # 25 live games, REA CLI
//   node tools/release/render-gate/index.mjs --out <dir> --base http://127.0.0.1:8123 --games
//   node tools/release/render-gate/index.mjs --out <dir> --templates --templates-source archives:<plan.json>
//   node tools/release/render-gate/index.mjs --out <dir> --driver saved --saved-dir <dir-with-id.json-and-id.png>
//   node tools/release/render-gate/index.mjs --out <dir> --motion --base http://127.0.0.1:8123 --recipe-base http://127.0.0.1:4173 [--templates-source archives:<plan.json>]
//       two frames N s apart per entry of motion-config.json flagged animated; --motion-threshold 0.2 --motion-grid 64x36 --interval-ms 1500
//       (offline: --motion --driver saved --saved-dir <dir-with-<kind>-<id>.json REA envelopes holding two screenshots>)
//
// Writes <out>/summary.md, <out>/results.json and (for live drivers) <out>/<id>.png|json. Exit 0 only when every row
// passes and the row counts match the inventory (25 games) / template directory (20 templates).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRow, renderSummary } from "./analysis.mjs";
import { createReaCliDriver, createSavedDriver } from "./drivers.mjs";
import { buildTemplate, listTemplates, serveDirectory } from "./templates.mjs";
import { MOTION_DEFAULTS, captureMotionFrames, evaluateMotionRow, extractScreenshots, loadMotionConfig, renderMotionSummary, resolveMotionTargets } from "./motion.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function parseArgs(argv) {
  const o = { games: false, templates: false, driver: "rea-cli", settleMs: 10000, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === "--out") o.out = next();
    else if (a === "--base") o.base = next();
    else if (a === "--inventory") o.inventory = next();
    else if (a === "--games") o.games = true;
    else if (a === "--templates") o.templates = true;
    else if (a === "--driver") o.driver = next();
    else if (a === "--saved-dir") o.savedDir = next();
    else if (a === "--templates-source") o.templatesSource = next();
    else if (a === "--work-dir") o.workDir = next();
    else if (a === "--rea") o.rea = next();
    else if (a === "--settle-ms") o.settleMs = Number(next());
    else if (a === "--only") o.only = next().split(",");
    else if (a === "--motion") o.motion = true;
    else if (a === "--motion-config") o.motionConfig = next();
    else if (a === "--motion-threshold") o.motionThreshold = Number(next());
    else if (a === "--motion-grid") { const m = /^(\d+)x(\d+)$/.exec(next()); if (!m) throw new Error("--motion-grid needs WxH, e.g. 64x36"); o.motionGrid = { gridWidth: Number(m[1]), gridHeight: Number(m[2]) }; }
    else if (a === "--interval-ms") o.intervalMs = Number(next());
    else if (a === "--recipe-base") o.recipeBase = next();
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.games && !o.templates) { o.games = true; o.templates = true; }
  return o;
}

export function gameTargets(inventory, base) {
  const live = inventory.games.filter((g) => g.status === "live");
  return live.map((g) => ({ id: g.url.replace(/\/+$/, "").split("/").pop(), kind: "game", url: base ? new URL(g.url, base).href : g.url }));
}

export function parseTemplateSource(spec) {
  const [kind, ...rest] = String(spec ?? "registry:latest").split(":");
  const value = rest.join(":");
  if (kind === "registry") return { kind, spec: value || "latest" };
  if (kind === "archives") { if (!value) throw new Error("archives:<plan.json> needs a plan path"); return { kind, plan: resolve(value) }; }
  throw new Error(`--templates-source must be registry:<tag|version> or archives:<plan.json>, got ${spec}`);
}

/** Motion mode: two frames per animated entry; see motion.mjs for the method and thresholds. */
async function runMotion(o, out) {
  const config = loadMotionConfig(resolve(o.motionConfig ?? join(dirname(fileURLToPath(import.meta.url)), "motion-config.json")));
  const saved = o.driver === "saved";
  if (saved && !o.savedDir) throw new Error("--driver saved needs --saved-dir");
  const threshold = o.motionThreshold ?? config.threshold ?? MOTION_DEFAULTS.threshold;
  const analysis = { threshold, ...(o.motionGrid ?? {}) };
  const scenario = { settleMs: config.settleMs ?? MOTION_DEFAULTS.settleMs, intervalMs: o.intervalMs ?? config.intervalMs ?? MOTION_DEFAULTS.intervalMs, reaBin: o.rea };
  const only = o.only ?? undefined;
  const gameUrls = {};
  if (o.base) {
    const inv = JSON.parse(readFileSync(resolve(o.inventory ?? join(REPO, "docs/workflows/game-inventory.json")), "utf8"));
    for (const g of inv.games.filter((x) => x.status === "live")) gameUrls[g.slug] = new URL(g.url, o.base).href;
  }
  // Saved mode analyses envelopes by id and needs no URLs: give every entry a placeholder.
  const placeholder = saved ? "saved:" : null;
  const { targets, skipped } = resolveMotionTargets(config, {
    only,
    gameUrls: saved ? new Proxy({}, { get: () => placeholder }) : gameUrls,
    recipeBase: saved ? "http://saved.invalid/" : o.recipeBase,
    templateUrl: saved ? () => placeholder : undefined,
    kinds: undefined
  });
  const templateTargets = [], plain = [];
  for (const t of targets) (t.kind === "template" && !saved ? templateTargets : plain).push(t);
  const rows = [];
  const judge = async (t, url) => {
    let frames = null, failure = null;
    try {
      if (saved) frames = extractScreenshots(JSON.parse(readFileSync(join(resolve(o.savedDir), `${t.id}.json`), "utf8")));
      else {
        frames = await captureMotionFrames(url, { ...scenario });
        frames.forEach((png, i) => writeFileSync(join(out, `${t.id}-${i === 0 ? "a" : "b"}.png`), png));
      }
    } catch (e) { failure = e.message; }
    const row = evaluateMotionRow({ ...t, url }, frames, analysis);
    if (failure) { row.reasons.unshift(`driver failed: ${failure.slice(0, 200)}`); row.pass = false; }
    console.log(`${row.pass ? "PASS" : "FAIL"} ${t.kind} ${t.id} diff=${row.diff ?? "-"}${row.pass ? "" : " - " + row.reasons.join("; ")}`);
    rows.push(row);
  };
  for (const t of plain) await judge(t, t.url);
  if (templateTargets.length) {
    const source = parseTemplateSource(o.templatesSource);
    const work = o.workDir ? resolve(o.workDir) : mkdtempSync(join(tmpdir(), "render-gate-motion-templates-"));
    mkdirSync(work, { recursive: true });
    for (const t of templateTargets) {
      let server = null;
      try { const dist = await buildTemplate(source, t.id.replace(/^template-/, ""), work); server = await serveDirectory(dist); await judge(t, server.url); }
      catch (e) { const row = evaluateMotionRow(t, null); row.reasons = [`scaffold/build failed: ${e.message.slice(0, 300)}`]; row.pass = false; console.log(`FAIL template ${t.id} - ${row.reasons[0]}`); rows.push(row); }
      finally { if (server) await server.close(); }
    }
    if (!o.workDir) rmSync(work, { recursive: true, force: true });
  }
  if (skipped.length) console.log(`skipped (no base supplied): ${skipped.join(", ")}`);
  const summary = renderMotionSummary(rows, { threshold });
  writeFileSync(join(out, "motion-summary.md"), summary.markdown);
  writeFileSync(join(out, "motion-results.json"), JSON.stringify({ ok: summary.ok, failed: summary.failed, skipped, threshold, rows }, null, 1));
  console.log(summary.markdown.split("\n").filter((l) => l.startsWith("**MOTION")).join("\n"));
  process.exit(summary.ok ? 0 : 1);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.out) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).join("\n")); process.exit(o.help ? 0 : 2); }
  const out = resolve(o.out);
  mkdirSync(out, { recursive: true });
  if (o.motion) return runMotion(o, out);
  const saved = o.driver === "saved";
  if (saved && !o.savedDir) throw new Error("--driver saved needs --saved-dir");
  const driver = saved ? createSavedDriver(resolve(o.savedDir)) : createReaCliDriver({ reaBin: o.rea, settleMs: o.settleMs });
  const rows = [];
  let expectedGames, expectedTemplates;
  const judge = async (target) => {
    let capture = null, failure = null;
    try { capture = await driver.capture(target); } catch (e) { failure = e.message; }
    const row = evaluateRow(target, capture);
    if (failure) row.reasons.unshift(`driver failed: ${failure.slice(0, 200)}`);
    if (capture && !saved) {
      if (capture.png) writeFileSync(join(out, `${target.id}.png`), capture.png);
      writeFileSync(join(out, `${target.id}.json`), JSON.stringify({ url: target.url, final_url: capture.finalUrl, events: capture.events, completeness: { status: capture.completeness } }, null, 1));
    }
    row.pass = row.reasons.length === 0;
    console.log(`${row.pass ? "PASS" : "FAIL"} ${target.kind} ${target.id}${row.pass ? "" : " - " + row.reasons.join("; ")}`);
    rows.push(row);
  };

  if (o.games) {
    const inv = JSON.parse(readFileSync(resolve(o.inventory ?? join(REPO, "docs/workflows/game-inventory.json")), "utf8"));
    let targets = gameTargets(inv, saved ? null : o.base);
    if (!saved && !o.base) throw new Error("--base <site or loopback origin> is required for live game checks");
    expectedGames = inv.liveGameCount;
    if (o.only) targets = targets.filter((t) => o.only.includes(t.id));
    else if (targets.length !== expectedGames) throw new Error(`inventory lists ${targets.length} live games, liveGameCount says ${expectedGames}`);
    else for (const t of targets) { if (!t.id) throw new Error("game without id"); }
    for (const t of targets) await judge(t);
    if (o.only) expectedGames = undefined;
  }

  if (o.templates) {
    const names = listTemplates(REPO).filter((n) => !o.only || o.only.includes(`template-${n}`) || o.only.includes(n));
    expectedTemplates = o.only ? undefined : listTemplates(REPO).length;
    if (saved) for (const n of names) await judge({ id: `template-${n}`, kind: "template", url: `template:${n}` });
    else {
      const source = parseTemplateSource(o.templatesSource);
      const work = o.workDir ? resolve(o.workDir) : mkdtempSync(join(tmpdir(), "render-gate-templates-"));
      mkdirSync(work, { recursive: true });
      for (const n of names) {
        let server = null;
        try {
          const dist = await buildTemplate(source, n, work);
          server = await serveDirectory(dist);
          await judge({ id: `template-${n}`, kind: "template", url: server.url });
        } catch (e) {
          const row = evaluateRow({ id: `template-${n}`, kind: "template", url: `template:${n}` }, null);
          row.reasons = [`scaffold/build failed: ${e.message.slice(0, 300)}`];
          console.log(`FAIL template ${n} - ${row.reasons[0]}`);
          rows.push(row);
        } finally { if (server) await server.close(); }
      }
      if (!o.workDir) rmSync(work, { recursive: true, force: true });
    }
  }

  const summary = renderSummary(rows, { title: `Render gate (${driver.name})`, expectedGames, expectedTemplates });
  writeFileSync(join(out, "summary.md"), summary.markdown);
  writeFileSync(join(out, "results.json"), JSON.stringify({ ok: summary.ok, failed: summary.failed, problems: summary.problems, rows }, null, 1));
  console.log(summary.markdown.split("\n").filter((l) => l.startsWith("Games:") || l.startsWith("**GATE")).join("\n"));
  process.exit(summary.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`render-gate: ${e.message}`); process.exit(2); });
}
