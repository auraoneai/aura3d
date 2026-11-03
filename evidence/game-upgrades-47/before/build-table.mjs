#!/usr/bin/env node
// Build the WP-38 before tables from the decoded runs (decode-luma.mjs output under <dir>/<slug>/luma-<run>.json and
// frames/<run>/) plus the short GL_* lines of each run log (never the GL_JPG base64 lines).
//
//   node evidence/game-upgrades-47/before/build-table.mjs [--dir evidence/game-upgrades-47/before] [--logs tests/reports/remote-acr]
//
// Writes, under --dir:
//   <slug>/events-<run>.txt        GL_READY / GL_DONE / GL_HTTP / GL_ERR / GL_CONSOLE lines and the Playwright result lines
//   <slug>/meta/<target>.json      the accepted capture of one target: run, ready time, both GL_META rows, frame paths, flags
//   <slug>/luma-before.json        accepted GL_META rows of the game (input for evidence/audit-fix/e5/compare-luma.mjs)
//   luma-before.json               accepted GL_META rows of every target
//   table.md                       one row per target, the per-game summary and the targets not captured
// A shot is black when darkFrac >= 0.98 (98% of pixels at luma <= 8); a black shot is never accepted.
// When a target was captured by more than one run, the newest run with both shots and no black shot wins
// (runs listed in a later shards file, e.g. a re-run file, are newer).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const dir = opt("dir", "evidence/game-upgrades-47/before");
const logs = opt("logs", "tests/reports/remote-acr");
const targets = JSON.parse(readFileSync(join(dir, "targets.json"), "utf8"));
const shardFiles = readdirSync(dir).filter((f) => /^shards.*\.json$/.test(f)).sort((a, b) => (a === "shards.json" ? -1 : b === "shards.json" ? 1 : a.localeCompare(b)));
const runOrder = [];
const runSpecs = new Map();
for (const f of shardFiles) for (const s of JSON.parse(readFileSync(join(dir, f), "utf8"))) { runOrder.push(s.run); runSpecs.set(s.run, s); }
const inventory = JSON.parse(readFileSync("docs/workflows/game-inventory.json", "utf8")).games;
const title = new Map(inventory.map((g) => [g.slug, g.title]));
const SHOTS = ["settle-25s", "settle-60s"];
const isBlack = (m) => m.darkFrac >= 0.98;

// Short lines from each run log, plus the ACR run id and duration.
const runInfo = new Map();
for (const run of runOrder) {
  const file = join(logs, run, "acr-run.log");
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const keep = [];
  for (const line of text.split("\n")) {
    if (/^GL_(READY|DONE|HTTP|ERR|CONSOLE) /.test(line)) keep.push(line.slice(0, 400));
    else if (/^\s*\d+ (passed|failed|flaky|skipped|did not run|interrupted)\b/.test(line) || /PLAYWRIGHT_EXIT=|Test timeout of|Timeout \d+ms exceeded|Error: /.test(line)) keep.push(line.trim().slice(0, 300));
  }
  const acrId = (/Queued a run with ID: (\w+)/.exec(text) ?? [])[1] ?? null;
  const end = /Run ID: (\w+) (was successful|failed) after (\S+)/.exec(text);
  const pw = (/PLAYWRIGHT_EXIT=(\d+)/.exec(text) ?? [])[1];
  const slug = runSpecs.get(run).slug;
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, `events-${run}.txt`), [`run ${run} acr ${acrId ?? "?"} ${end ? `${end[2]} after ${end[3]}` : "no end line"} playwrightExit ${pw ?? "?"}`, ...keep].join("\n") + "\n");
  const ready = new Map(), done = new Set(), http = new Map(), errs = new Map();
  for (const line of keep) {
    let m;
    if ((m = /^GL_READY (\S+) (\d+)ms/.exec(line))) ready.set(m[1], Number(m[2]));
    else if ((m = /^GL_DONE (\S+)/.exec(line))) done.add(m[1]);
    else if ((m = /^GL_HTTP (\S+) (\d+) (\S+)/.exec(line))) { if (!http.has(m[1])) http.set(m[1], []); http.get(m[1]).push(`${m[2]} ${m[3]}`); }
    else if ((m = /^GL_(?:ERR|CONSOLE) (\S+) (.*)$/.exec(line))) { if (!errs.has(m[1])) errs.set(m[1], []); errs.get(m[1]).push(m[2].slice(0, 200)); }
  }
  runInfo.set(run, { acrId, result: end ? `${end[2]} after ${end[3]}` : null, pw: pw ?? null, ready, done, http, errs });
}

// Candidate captures per target from every decoded luma file.
const rows = new Map();
for (const t of targets) {
  const slugDir = join(dir, t.slug);
  if (!existsSync(slugDir)) continue;
  for (const f of readdirSync(slugDir).filter((x) => /^luma-.+\.json$/.test(x) && x !== "luma-before.json")) {
    const run = f.slice(5, -5);
    for (const m of JSON.parse(readFileSync(join(slugDir, f), "utf8"))) {
      if (m.target !== t.name) continue;
      const key = `${t.name}|${run}`;
      if (!rows.has(key)) rows.set(key, { run, shots: {} });
      rows.get(key).shots[m.id] = m;
    }
  }
}

const accepted = [];
const missing = [];
for (const t of targets) {
  const cands = [...rows.entries()].filter(([k]) => k.startsWith(`${t.name}|`)).map(([, v]) => v)
    .sort((a, b) => runOrder.indexOf(b.run) - runOrder.indexOf(a.run));
  const good = cands.find((c) => SHOTS.every((s) => c.shots[s] && !isBlack(c.shots[s])));
  const info = (run) => runInfo.get(run);
  if (!good) {
    const why = [];
    for (const c of cands) {
      const got = SHOTS.filter((s) => c.shots[s]);
      const black = got.filter((s) => isBlack(c.shots[s]));
      why.push(`${c.run}: ${got.length ? got.join("+") : "no shot"}${black.length ? `, black ${black.join("+")}` : ""}`);
    }
    for (const run of runOrder.filter((r) => runSpecs.get(r).expect.includes(t.name) && !cands.some((c) => c.run === r))) {
      const i = info(run);
      if (!i) { why.push(`${run}: no log`); continue; }
      const ready = i.ready.has(t.name) ? `ready ${i.ready.get(t.name)} ms` : "never ready";
      const http = (i.http.get(t.name) ?? []).slice(0, 3).join("; ");
      const err = (i.errs.get(t.name) ?? []).slice(0, 2).join("; ");
      why.push(`${run}: no shot, ${ready}${http ? `, HTTP ${http}` : ""}${err ? `, ${err}` : ""}${i.result ? ` (${i.result})` : ""}`);
    }
    missing.push({ t, why: why.length ? why.join(" | ") : "not run yet" });
    continue;
  }
  const i = info(good.run) ?? { ready: new Map(), http: new Map(), errs: new Map() };
  const meta = {
    target: t.name, slug: t.slug, variant: t.variant, url: t.url, group: t.group, runId: good.run, acrRunId: i.acrId ?? null,
    readyMs: i.ready.get(t.name) ?? null,
    shots: Object.fromEntries(SHOTS.map((s) => [s, good.shots[s]])),
    frames: Object.fromEntries(SHOTS.map((s) => [s, `frames/${good.run}/${t.name}--${s}.jpg`])),
    http4xx: i.http.get(t.name) ?? [], errors: i.errs.get(t.name) ?? [],
    label: "software WebGL2 (SwiftShader), 1280x720, base 232570e41"
  };
  for (const s of SHOTS) if (!existsSync(join(dir, t.slug, meta.frames[s]))) meta.frames[s] = null;
  mkdirSync(join(dir, t.slug, "meta"), { recursive: true });
  writeFileSync(join(dir, t.slug, "meta", `${t.name}.json`), JSON.stringify(meta, null, 1) + "\n");
  accepted.push(meta);
}

const flat = (list) => list.flatMap((m) => SHOTS.map((s) => m.shots[s]));
for (const slug of [...new Set(targets.map((t) => t.slug))]) {
  const list = accepted.filter((m) => m.slug === slug);
  if (list.length) writeFileSync(join(dir, slug, "luma-before.json"), JSON.stringify(flat(list), null, 1) + "\n");
}
writeFileSync(join(dir, "luma-before.json"), JSON.stringify(flat(accepted), null, 1) + "\n");

const f2 = (v) => (v == null ? "" : Number(v).toFixed(2));
const pct = (v) => (v == null ? "" : `${(v * 100).toFixed(1)}%`);
const grid = (g) => (g ? `${g.slice(0, 3).join("/")} · ${g.slice(3, 6).join("/")} · ${g.slice(6, 9).join("/")}` : "");
const cells = (m) => m ? [f2(m.mean), m.p5, m.p50, m.p95, pct(m.darkFrac), pct(m.clipFrac), grid(m.grid), m.info?.renderPath ?? "", m.info?.drawCalls ?? ""] : Array(9).fill("");
const out = [];
out.push("# WP-38 before captures: steady-state luma of every luma target on the base build");
out.push("");
out.push("All numbers are software WebGL2 (SwiftShader, headless Chromium on the serverless ACR runner), 1280x720, base commit 232570e41 (main 4.6.1 + 4.6.2 IC-12 + swarm docs); never real-GPU evidence. Shots are taken 25 s and 60 s after the page's ready signal (`GL_SETTLE`, `tests/browser/game-luma-capture.spec.ts`); the 60 s shot starts at the time in the `60 s at` column because each software-GL screenshot takes tens of seconds to minutes. Luma is Rec. 709 (0.2126 R + 0.7152 G + 0.0722 B) over the canvas only; dark = share of pixels at luma <= 8, clip = share at >= 250; grid = mean luma of the 3x3 cells, rows top to bottom (left/centre/right). How the runs were made: `README.md` in this folder.");
out.push("");
out.push(`Captured: ${accepted.length} of ${targets.length} targets (both shots, no black shot). Not captured: ${missing.length}.`);
out.push("");
out.push("## Per target");
out.push("");
out.push("| Target | Run (ACR id) | Ready s | 25 s mean | p5 | p50 | p95 | dark | clip | grid 25 s | path | draws | 60 s at | 60 s mean | p5 | p50 | p95 | dark | clip | grid 60 s | path | draws |");
out.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |");
for (const m of accepted) {
  const a = m.shots["settle-25s"], b = m.shots["settle-60s"];
  out.push(`| ${m.target} | ${m.runId} (${m.acrRunId ?? "?"}) | ${m.readyMs == null ? "" : (m.readyMs / 1000).toFixed(0)} | ${cells(a).join(" | ")} | ${b?.sinceReadyMs == null ? "" : (b.sinceReadyMs / 1000).toFixed(0)} s | ${cells(b).join(" | ")} |`);
}
out.push("");
out.push("## Per game");
out.push("");
out.push("| Game | Slug | Captured | 60 s mean range | 25 s mean range | 60 s dark range | 60 s clip max | render path | draw calls (60 s) | 25 s to 60 s change |");
out.push("| --- | --- | ---: | --- | --- | --- | ---: | --- | --- | --- |");
const range = (vals, fmt = f2) => { const v = vals.filter((x) => x != null); return v.length ? (v.length === 1 ? fmt(v[0]) : `${fmt(Math.min(...v))} to ${fmt(Math.max(...v))}`) : ""; };
for (const slug of [...new Set(targets.map((t) => t.slug))]) {
  const all = targets.filter((t) => t.slug === slug);
  const list = accepted.filter((m) => m.slug === slug);
  const s25 = list.map((m) => m.shots["settle-25s"]), s60 = list.map((m) => m.shots["settle-60s"]);
  const paths = [...new Set(s60.map((s) => s.info?.renderPath ?? "none"))].join(", ");
  const drift = list.map((m) => m.shots["settle-60s"].mean - m.shots["settle-25s"].mean);
  out.push(`| ${title.get(slug) ?? slug} | ${slug} | ${list.length}/${all.length} | ${range(s60.map((s) => s.mean))} | ${range(s25.map((s) => s.mean))} | ${range(s60.map((s) => s.darkFrac), pct)} | ${s60.length ? pct(Math.max(...s60.map((s) => s.clipFrac))) : ""} | ${list.length ? paths : ""} | ${range(s60.map((s) => s.info?.drawCalls ?? null), (v) => String(v))} | ${range(drift, (v) => (v >= 0 ? "+" : "") + v.toFixed(2))} |`);
}
out.push("");
out.push("## Not captured");
out.push("");
if (!missing.length) out.push("None: every target has both shots.");
else { out.push("| Target | Reason |"); out.push("| --- | --- |"); for (const { t, why } of missing) out.push(`| ${t.name} | ${why.replace(/\|/g, "/")} |`); }
out.push("");
out.push("## Flags on captured targets");
out.push("");
const flags = accepted.filter((m) => m.http4xx.length || m.errors.length || SHOTS.some((s) => m.shots[s].darkFrac >= 0.5 || m.shots[s].clipFrac >= 0.1));
if (!flags.length) out.push("None.");
else {
  out.push("| Target | HTTP >= 400 | Console / page errors | Note |");
  out.push("| --- | --- | --- | --- |");
  for (const m of flags) {
    const notes = [];
    for (const s of SHOTS) { if (m.shots[s].darkFrac >= 0.5) notes.push(`${s} dark ${pct(m.shots[s].darkFrac)}`); if (m.shots[s].clipFrac >= 0.1) notes.push(`${s} clip ${pct(m.shots[s].clipFrac)}`); }
    const esc = (s) => s.replace(/\|/g, "/");
    out.push(`| ${m.target} | ${esc([...new Set(m.http4xx)].slice(0, 4).join("; "))}${m.http4xx.length > 4 ? ` (+${m.http4xx.length - 4})` : ""} | ${esc([...new Set(m.errors)].slice(0, 2).join("; "))}${m.errors.length > 2 ? ` (+${m.errors.length - 2})` : ""} | ${notes.join(", ")} |`);
  }
}
writeFileSync(join(dir, "table.md"), out.join("\n") + "\n");
console.log(`accepted ${accepted.length}/${targets.length}, missing ${missing.length}`);
for (const { t, why } of missing) console.log(`missing ${t.name}: ${why.slice(0, 240)}`);
