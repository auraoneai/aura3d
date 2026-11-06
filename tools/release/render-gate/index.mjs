#!/usr/bin/env node
// Render gate: "a release without a rendered frame is not a release".
//
//   node tools/release/render-gate/index.mjs --out <dir> --base https://aura3d.auraone.ai            # 25 live games, REA CLI
//   node tools/release/render-gate/index.mjs --out <dir> --base http://127.0.0.1:8123 --games
//   node tools/release/render-gate/index.mjs --out <dir> --templates --templates-source archives:<plan.json>
//   node tools/release/render-gate/index.mjs --out <dir> --driver saved --saved-dir <dir-with-id.json-and-id.png>
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

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.out) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).join("\n")); process.exit(o.help ? 0 : 2); }
  const out = resolve(o.out);
  mkdirSync(out, { recursive: true });
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
