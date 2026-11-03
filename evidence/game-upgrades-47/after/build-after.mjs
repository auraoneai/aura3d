#!/usr/bin/env node
// Build the WP-38 after tables from the decoded after runs (run-shards.mjs + decode-luma.mjs output under
// <dir>/<slug>/luma-<run>.json and frames/<run>/) and the short GL_* lines of each run log (never the GL_JPG lines).
//
//   node evidence/game-upgrades-47/after/build-after.mjs [--dir evidence/game-upgrades-47/after] [--before evidence/game-upgrades-47/before]
//        [--logs tests/reports/remote-acr]
//
// Writes:
//   <dir>/<slug>/events-<run>.txt                     GL_READY / GL_DONE / GL_HTTP / GL_ERR / GL_CONSOLE and Playwright result lines
//   <dir>/<slug>/meta/<target>.json                   the accepted capture of one target (run, ready time, both GL_META rows, frames)
//   <dir>/luma-after.json                             accepted GL_META rows of every target
//   evidence/game-upgrades-47/<slug>/luma-after.json  accepted rows of the game (input of the game-checks `luma-band` check)
//   <dir>/table.md                                    before vs after per target, per game summary, targets not captured
//   <dir>/bands.md                                    every steady shot against the game's luma-bands.json (evaluateBands)
//   <dir>/after-summary.json                          machine-readable counts for the lane report
// Acceptance is the before rule: the newest run with both shots and no black shot (darkFrac >= 0.98) wins; shards files
// named shards*.json in <dir> are read in name order with shards.json first (a retry file is newer).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LUMA_BANDS_SCHEMA, evaluateBands } from "../../../tools/look-metrics/region-luma.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const dir = opt("dir", "evidence/game-upgrades-47/after");
const beforeDir = opt("before", "evidence/game-upgrades-47/before");
const logs = opt("logs", "tests/reports/remote-acr");
const gameRoot = "evidence/game-upgrades-47";
const targets = JSON.parse(readFileSync(join(dir, "targets.json"), "utf8"));
const shardFiles = readdirSync(dir).filter((f) => /^shards.*\.json$/.test(f)).sort((a, b) => (a === "shards.json" ? -1 : b === "shards.json" ? 1 : a.localeCompare(b)));
const runOrder = [];
const runSpecs = new Map();
for (const f of shardFiles) for (const s of JSON.parse(readFileSync(join(dir, f), "utf8"))) { runOrder.push(s.run); runSpecs.set(s.run, s); }
const inventory = JSON.parse(readFileSync("docs/workflows/game-inventory.json", "utf8")).games;
const title = new Map(inventory.map((g) => [g.slug, g.title]));
const SHOTS = ["settle-25s", "settle-60s"];
const isBlack = (m) => m.darkFrac >= 0.98 || m.blank === true;
const label = "software WebGL2 (SwiftShader), 1280x720, freeze tag gu47-code-complete-go (5050f3cbc)";

// ---- short lines of each run log ----
const runInfo = new Map();
for (const run of runOrder) {
  const file = join(logs, run, "acr-run.log");
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const keep = [];
  for (const line of text.split("\n")) {
    if (/^GL_(READY|DONE|HTTP|ERR|CONSOLE|LFS) /.test(line)) keep.push(line.slice(0, 400));
    else if (/^\s*\d+ (passed|failed|flaky|skipped|did not run|interrupted)\b/.test(line) || /PLAYWRIGHT_EXIT=|Test timeout of|Timeout \d+ms exceeded|Error: /.test(line)) keep.push(line.trim().slice(0, 300));
  }
  const acrId = (/Queued a run with ID: (\w+)/.exec(text) ?? [])[1] ?? null;
  const end = /Run ID: (\w+) (was successful|failed) after (\S+)/.exec(text);
  const pw = (/PLAYWRIGHT_EXIT=(\d+)/.exec(text) ?? [])[1];
  const slug = runSpecs.get(run).slug;
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, `events-${run}.txt`), [`run ${run} acr ${acrId ?? "?"} ${end ? `${end[2]} after ${end[3]}` : "no end line"} playwrightExit ${pw ?? "?"}`, ...keep].join("\n") + "\n");
  const ready = new Map(), http = new Map(), errs = new Map(), lfs = new Map();
  for (const line of keep) {
    let m;
    if ((m = /^GL_READY (\S+) (\d+)ms/.exec(line))) ready.set(m[1], Number(m[2]));
    else if ((m = /^GL_HTTP (\S+) (\d+) (\S+)/.exec(line))) { if (!http.has(m[1])) http.set(m[1], []); http.get(m[1]).push(`${m[2]} ${m[3]}`); }
    else if ((m = /^GL_LFS (\S+) (\S+)/.exec(line))) { if (!lfs.has(m[1])) lfs.set(m[1], []); lfs.get(m[1]).push(m[2]); }
    else if ((m = /^GL_(?:ERR|CONSOLE) (\S+) (.*)$/.exec(line))) { if (!errs.has(m[1])) errs.set(m[1], []); errs.get(m[1]).push(m[2].slice(0, 200)); }
  }
  runInfo.set(run, { acrId, result: end ? `${end[2]} after ${end[3]}` : null, pw: pw ?? null, ready, http, errs, lfs });
}

// ---- candidates and acceptance ----
const rows = new Map();
for (const slug of new Set(targets.map((t) => t.slug))) {
  const slugDir = join(dir, slug);
  if (!existsSync(slugDir)) continue;
  for (const f of readdirSync(slugDir).filter((x) => /^luma-.+\.json$/.test(x))) {
    const run = f.slice(5, -5);
    if (!runSpecs.has(run)) continue;
    for (const m of JSON.parse(readFileSync(join(slugDir, f), "utf8"))) {
      const key = `${m.target}|${run}`;
      if (!rows.has(key)) rows.set(key, { run, shots: {} });
      rows.get(key).shots[m.id] = m;
    }
  }
}
const accepted = [], missing = [];
for (const t of targets) {
  const cands = [...rows.entries()].filter(([k]) => k.startsWith(`${t.name}|`)).map(([, v]) => v).sort((a, b) => runOrder.indexOf(b.run) - runOrder.indexOf(a.run));
  const good = cands.find((c) => SHOTS.every((s) => c.shots[s] && !isBlack(c.shots[s])));
  if (!good) {
    const why = [];
    for (const c of cands) {
      const got = SHOTS.filter((s) => c.shots[s]);
      const black = got.filter((s) => isBlack(c.shots[s]));
      const mount = (runInfo.get(c.run)?.errs.get(t.name) ?? []).find((e) => /RENDERER_MOUNT_FAILED/.test(e));
      why.push(`${c.run}: ${got.length ? got.join("+") : "no shot"}${black.length ? `, black ${black.join("+")}` : ""}${mount ? `, ${mount}` : ""}`);
    }
    for (const run of runOrder.filter((r) => runSpecs.get(r).expect.includes(t.name) && !cands.some((c) => c.run === r))) {
      const i = runInfo.get(run);
      if (!i) { why.push(`${run}: no log`); continue; }
      const ready = i.ready.has(t.name) ? `ready ${i.ready.get(t.name)} ms` : "never ready";
      const http = (i.http.get(t.name) ?? []).slice(0, 3).join("; ");
      const errList = i.errs.get(t.name) ?? [];
      const err = [errList.find((e) => /RENDERER_MOUNT_FAILED/.test(e)), ...errList.filter((e) => !/RENDERER_MOUNT_FAILED|Failed to load resource/.test(e))].filter(Boolean).slice(0, 2).join("; ");
      why.push(`${run}: no shot, ${ready}${http ? `, HTTP ${http}` : ""}${err ? `, ${err}` : ""}${i.result ? ` (${i.result})` : ""}`);
    }
    missing.push({ t, why: why.length ? why.join(" | ") : "not run" });
    continue;
  }
  const i = runInfo.get(good.run) ?? { ready: new Map(), http: new Map(), errs: new Map(), lfs: new Map() };
  const meta = {
    target: t.name, slug: t.slug, variant: t.variant, url: t.url, group: t.group, runId: good.run, acrRunId: i.acrId ?? null,
    readyMs: i.ready.get(t.name) ?? null,
    shots: Object.fromEntries(SHOTS.map((s) => [s, good.shots[s]])),
    frames: Object.fromEntries(SHOTS.map((s) => [s, `frames/${good.run}/${t.name}--${s}.jpg`])),
    http4xx: i.http.get(t.name) ?? [], errors: i.errs.get(t.name) ?? [], lfsStubs: i.lfs.get(t.name) ?? [], label
  };
  for (const s of SHOTS) if (!existsSync(join(dir, t.slug, meta.frames[s]))) meta.frames[s] = null;
  mkdirSync(join(dir, t.slug, "meta"), { recursive: true });
  writeFileSync(join(dir, t.slug, "meta", `${t.name}.json`), JSON.stringify(meta, null, 1) + "\n");
  accepted.push(meta);
}
const flat = (list) => list.flatMap((m) => SHOTS.map((s) => m.shots[s]));
const slugs = [...new Set(targets.map((t) => t.slug))];
for (const slug of slugs) {
  const list = accepted.filter((m) => m.slug === slug);
  if (!list.length) continue;
  mkdirSync(join(gameRoot, slug), { recursive: true });
  writeFileSync(join(gameRoot, slug, "luma-after.json"), JSON.stringify(flat(list), null, 1) + "\n");
}
writeFileSync(join(dir, "luma-after.json"), JSON.stringify(flat(accepted), null, 1) + "\n");

// ---- before rows ----
const before = new Map();
if (existsSync(join(beforeDir, "luma-before.json"))) for (const m of JSON.parse(readFileSync(join(beforeDir, "luma-before.json"), "utf8"))) before.set(`${m.target}|${m.id}`, m);

const f2 = (v) => (v == null ? "" : Number(v).toFixed(2));
const pct = (v) => (v == null ? "" : `${(v * 100).toFixed(1)}%`);
const sgn = (v) => (v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
const esc = (s) => String(s).replace(/\|/g, "/");
const pair = (b, a, fmt) => `${b == null ? "-" : fmt(b)} → ${a == null ? "-" : fmt(a)}`;

// ---- table.md ----
const out = [];
out.push("# WP-38 after captures: steady-state luma of every luma target, before vs after");
out.push("");
out.push(`All numbers are software WebGL2 (SwiftShader, headless Chromium on the serverless ACR runner), 1280x720; never real-GPU evidence. After = the freeze tag \`gu47-code-complete-go\` (5050f3cbc on \`gu47/integration\`), image \`gu47-after-10301502\`; before = \`evidence/game-upgrades-47/before/\` (base 232570e41, 68 targets). Shots at 25 s and 60 s after the page's ready signal (\`tests/browser/game-luma-capture.spec.ts\`); each software-GL screenshot takes tens of seconds, so the "60 s" shot lands later (column \`60 s at\`). Luma is Rec. 709 over the canvas only; dark = share of pixels at luma <= 8, clip = share at >= 250. Each cell reads before → after; "-" = no before capture (the target is new in GU47 or was not captured before). Runs: \`shards.json\` (and any \`shards-retry*.json\`) in this folder, scheduler \`evidence/game-upgrades-47/before/run-shards.mjs\`, this table \`build-after.mjs\`.`);
out.push("");
out.push(`Captured: ${accepted.length} of ${targets.length} targets (both shots, no black shot). Not captured: ${missing.length}.`);
out.push("");
out.push("## Per target (steady state = the 60 s shot)");
out.push("");
out.push("| Target | Run (ACR id) | 60 s at | mean | Δ mean | p5 | p95 | darkFrac | clipFrac | drawCalls | renderPath | after 25 s mean |");
out.push("| --- | --- | ---: | --- | ---: | --- | --- | --- | --- | --- | --- | ---: |");
for (const m of accepted) {
  const a = m.shots["settle-60s"], b = before.get(`${m.target}|settle-60s`) ?? null;
  out.push(`| ${m.target} | ${m.runId.replace("gu47-after-10301502-", "")} (${m.acrRunId ?? "?"}) | ${a.sinceReadyMs == null ? "" : `${(a.sinceReadyMs / 1000).toFixed(0)} s`} | ${pair(b?.mean, a.mean, f2)} | ${b ? sgn(a.mean - b.mean) : ""} | ${pair(b?.p5, a.p5, String)} | ${pair(b?.p95, a.p95, String)} | ${pair(b?.darkFrac, a.darkFrac, pct)} | ${pair(b?.clipFrac, a.clipFrac, pct)} | ${pair(b?.info?.drawCalls, a.info?.drawCalls, String)} | ${pair(b?.info?.renderPath, a.info?.renderPath, String)} | ${f2(m.shots["settle-25s"].mean)} |`);
}
out.push("");
out.push("## Per game");
out.push("");
out.push("| Game | Slug | Captured | before 60 s mean range | after 60 s mean range | after dark max | after clip max | after draw calls | after triangles | after texture MB |");
out.push("| --- | --- | ---: | --- | --- | ---: | ---: | --- | --- | --- |");
const range = (vals, fmt = f2) => { const v = vals.filter((x) => x != null); return v.length ? (v.length === 1 ? fmt(v[0]) : `${fmt(Math.min(...v))} to ${fmt(Math.max(...v))}`) : ""; };
for (const slug of slugs) {
  const all = targets.filter((t) => t.slug === slug);
  const list = accepted.filter((m) => m.slug === slug);
  const s60 = list.map((m) => m.shots["settle-60s"]);
  const b60 = all.map((t) => before.get(`${t.name}|settle-60s`)).filter(Boolean);
  out.push(`| ${title.get(slug) ?? slug} | ${slug} | ${list.length}/${all.length} | ${range(b60.map((s) => s.mean))} | ${range(s60.map((s) => s.mean))} | ${s60.length ? pct(Math.max(...s60.map((s) => s.darkFrac))) : ""} | ${s60.length ? pct(Math.max(...s60.map((s) => s.clipFrac))) : ""} | ${range(s60.map((s) => s.info?.drawCalls ?? null), String)} | ${range(s60.map((s) => s.info?.triangles ?? null), String)} | ${range(s60.map((s) => (s.info?.textureBytes == null ? null : s.info.textureBytes / 1048576)), (v) => v.toFixed(1))} |`);
}
out.push("");
out.push("## Not captured");
out.push("");
const causeOf = (why) => { const u = /RENDERER_MOUNT_FAILED: RenderDeviceError: Unsupported uniform array length \{"name":"(\w+)","length":(\d+)\}/.exec(why); if (u) return `RENDERER_MOUNT_FAILED, ${u[1]} length ${u[2]}`; const m = /RENDERER_MOUNT_FAILED: ([^.{]+)/.exec(why); return m ? `RENDERER_MOUNT_FAILED, ${m[1].trim().slice(0, 90)}` : /never ready/.test(why) ? "never ready (other)" : /black/.test(why) ? "black frame (other)" : "no shot / run lost"; };
const causes = new Map();
for (const x of missing) { const c = causeOf(x.why); if (!causes.has(c)) causes.set(c, []); causes.get(c).push(x.t.name); }
if (missing.length) { out.push("| Cause | Targets |"); out.push("| --- | --- |"); for (const [c, list] of causes) out.push(`| ${c} | ${list.length}: ${list.join(", ")} |`); out.push(""); }
if (!missing.length) out.push("None: every target has both shots.");
else { out.push("| Target | Reason |"); out.push("| --- | --- |"); for (const { t, why } of missing) out.push(`| ${t.name} | ${esc(why)} |`); }
out.push("");
out.push("## Flags on captured targets");
out.push("");
const flags = accepted.filter((m) => m.http4xx.length || m.errors.length || m.lfsStubs.length);
if (!flags.length) out.push("None.");
else {
  out.push("| Target | HTTP >= 400 | Console / page errors | LFS stubs |");
  out.push("| --- | --- | --- | --- |");
  for (const m of flags) out.push(`| ${m.target} | ${esc([...new Set(m.http4xx)].slice(0, 4).join("; "))}${m.http4xx.length > 4 ? ` (+${m.http4xx.length - 4})` : ""} | ${esc([...new Set(m.errors)].slice(0, 2).join("; "))}${m.errors.length > 2 ? ` (+${m.errors.length - 2})` : ""} | ${esc(m.lfsStubs.slice(0, 3).join("; "))} |`);
}
writeFileSync(join(dir, "table.md"), out.join("\n") + "\n");

// ---- bands.md ----
const fmtV = (v) => (v == null ? "null" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v));
const fmtMiss = (m) => `${m.region === "frame" ? "" : `${m.region} `}${m.metric}=${fmtV(m.value)}${m.reason ? ` (${m.reason})` : ` not in [${m.min ?? ""}, ${m.max ?? ""}]`}`;
const bandText = (band) => Object.entries(band).filter(([k, v]) => !(k === "cells" || k === "crops") || Object.keys(v).length).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join("; ");
const b = [];
const summary = { captured: accepted.length, targets: targets.length, missing: missing.map((x) => x.t.name), games: {} };
b.push("# WP-38 after captures against each game's luma bands");
b.push("");
b.push("Every steady-state shot (25 s and 60 s, software WebGL2) of every captured target, checked with `evaluateBands` (`tools/look-metrics/region-luma.mjs`, the code behind the game-checks `luma-band` check) against `evidence/game-upgrades-47/<slug>/luma-bands.json`, or the PRD default band (darkFrac <= 0.6, clipFrac <= 0.05) where a game declares none. A target is in band when both of its shots pass. Cross-row rules in a bands file's `note` (spans across variants, ratios between cells of different shots) are not single-row checks and are not evaluated here.");
b.push("");
b.push("| Game | Bands file | In band | Out of band | Not captured |");
b.push("| --- | --- | ---: | ---: | ---: |");
const detail = [];
for (const slug of slugs) {
  const bandsFile = join(gameRoot, slug, "luma-bands.json");
  let spec = null;
  if (existsSync(bandsFile)) { try { spec = JSON.parse(readFileSync(bandsFile, "utf8")); if (spec.schema !== LUMA_BANDS_SCHEMA) spec = null; } catch { spec = null; } }
  const list = accepted.filter((m) => m.slug === slug);
  const results = evaluateBands(flat(list), spec, { slug });
  const g = { bands: spec ? "luma-bands.json" : "PRD default", in: [], out: [], missing: targets.filter((t) => t.slug === slug && !list.some((m) => m.target === t.name)).map((t) => t.name) };
  for (const m of list) {
    const rs = results.filter((r) => r.target === m.target);
    const pass = rs.length > 0 && rs.every((r) => r.pass);
    (pass ? g.in : g.out).push(m.target);
    const s60 = m.shots["settle-60s"];
    const misses = rs.flatMap((r) => r.misses.map((x) => `${r.id.replace("settle-", "")}: ${fmtMiss(x)}`));
    const band = spec ? (spec.variants?.[m.target] ?? spec.variants?.[m.variant] ? "variant" : "default") : "PRD default";
    detail.push(`| ${m.target} | ${pass ? "in" : "**out**"} | ${band}${rs[0]?.excepted ? " (exception)" : ""} | ${f2(s60.mean)} | ${s60.p5} / ${s60.p95} | ${pct(s60.darkFrac)} | ${pct(s60.clipFrac)} | ${esc(misses.join("; "))} |`);
  }
  summary.games[slug] = g;
  b.push(`| ${title.get(slug) ?? slug} (${slug}) | ${g.bands} | ${g.in.length} | ${g.out.length} | ${g.missing.length} |`);
}
const tot = Object.values(summary.games).reduce((a, g) => ({ in: a.in + g.in.length, out: a.out + g.out.length }), { in: 0, out: 0 });
b.push(`| **all** | | **${tot.in}** | **${tot.out}** | **${missing.length}** |`);
b.push("");
b.push("## Per target");
b.push("");
b.push("Numbers are the 60 s shot; misses list each failing shot (`25s` / `60s`) with the metric, its value and the band.");
b.push("");
b.push("| Target | Result | Band | mean | p5 / p95 | darkFrac | clipFrac | Misses |");
b.push("| --- | --- | --- | ---: | --- | ---: | ---: | --- |");
b.push(...detail);
b.push("");
b.push("## Bands declared per game");
b.push("");
for (const slug of slugs) {
  const bandsFile = join(gameRoot, slug, "luma-bands.json");
  if (!existsSync(bandsFile)) { b.push(`- ${slug}: none (PRD default)`); continue; }
  const spec = JSON.parse(readFileSync(bandsFile, "utf8"));
  b.push(`- ${slug}: default ${bandText(spec.default ?? {}) || "PRD default"}; ${Object.entries(spec.variants ?? {}).map(([v, band]) => `${v}: ${bandText(band)}`).join(" · ")}`);
}
writeFileSync(join(dir, "bands.md"), b.join("\n") + "\n");
writeFileSync(join(dir, "after-summary.json"), JSON.stringify(summary, null, 1) + "\n");
console.log(`accepted ${accepted.length}/${targets.length}, missing ${missing.length}; in band ${tot.in}, out ${tot.out}`);
for (const { t, why } of missing) console.log(`missing ${t.name}: ${why.slice(0, 240)}`);
