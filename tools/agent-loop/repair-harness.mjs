#!/usr/bin/env node
// Repair harness: a subject LLM (Kiro Prism, subject only) repairs each seeded broken scene using ONLY the `aura3d verify` report.
//
//   node tools/agent-loop/repair-harness.mjs [--scenes a,b] [--runs 1] [--max-turns 5] [--model claude-sonnet-5.5]
//                                             [--no-browser] [--browser-lock /tmp/a3d-rea.lock] [--out tests/reports/agent-loop/repair]
//
// Protocol per scene (one run):
//   turn 0   the harness runs verify on the broken scene and shows the subject the JSON report (nothing else: no docs, no manifest,
//            no expected code, no other scene).
//   turn k   the subject may read_file / list_files / write_file inside src/ of its working copy, then calls `done`.
//            The harness re-runs verify and shows the new report. A run is REPAIRED at the first turn whose report has
//            (a) none of the scene's expected codes and (b) zero error-severity findings.
//   The subject has no shell and cannot run verify itself; one verify per turn. Budget: --max-turns (default 5) repair turns.
//
// The subject model is sampled once (n=1) unless --runs says otherwise; Prism sampling is not seedable, so results are not reproducible
// run to run. The key is read by tools/agent-eval/lib/prism.mjs and only placed in a request header.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const seededDir = join(repoRoot, "tests/fixtures/agent-loop-seeded");

export const SUBJECT_SYSTEM = [
  "You are an autonomous coding agent repairing one small Aura3D (TypeScript, @aura3d/engine) browser project.",
  "You have no internet, no shell and no documentation. The only evidence you get is the JSON output of `aura3d verify` on the project (schema aura3d.verify/1).",
  "Each finding has a code, a severity, a location (file:line), a plain-English cause and a fix hint. Use them.",
  "Tools: list_files, read_file and write_file operate only inside the project's src/ folder. write_file replaces a whole file.",
  "Work in turns. In each turn read what you need, write your fixes, then call `done`. The harness re-runs verify and shows you the new report.",
  "Goal: a report with no error findings and none of the findings you were asked to fix. Keep the scene's intent (same objects, same look); do not delete the scene to make the report clean.",
  "You have at most 5 turns."
].join("\n");

export const TOOLS = [
  { name: "list_files", description: "List files under src/.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "read_file", description: "Read a file under src/ (path relative to the project, e.g. src/main.ts).", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "write_file", description: "Replace the whole content of a file under src/.", input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "done", description: "End this turn; the harness re-runs verify and returns the new report.", input_schema: { type: "object", properties: {}, additionalProperties: false } }
];

/** Resolve `path` inside `<workDir>/src`; null when it escapes. */
export function safeSrcPath(workDir, path) {
  const abs = resolve(workDir, String(path ?? ""));
  const root = resolve(workDir, "src");
  return abs === root || abs.startsWith(root + sep) ? abs : null;
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base)); else out.push(relative(dirname(base), full).split(sep).join("/"));
  }
  return out.sort();
}

export function execTool(workDir, name, input) {
  if (name === "list_files") return { text: listFiles(join(workDir, "src")).join("\n"), isError: false };
  const abs = safeSrcPath(workDir, input?.path);
  if (!abs) return { text: "path must be inside src/", isError: true };
  if (name === "read_file") return existsSync(abs) && statSync(abs).isFile() ? { text: readFileSync(abs, "utf8"), isError: false } : { text: "no such file", isError: true };
  if (name === "write_file") {
    if (typeof input.content !== "string") return { text: "content must be a string", isError: true };
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, input.content);
    return { text: `wrote ${relative(workDir, abs)} (${input.content.length} chars)`, isError: false };
  }
  return { text: `unknown tool ${name}`, isError: true };
}

/** What the subject is told about a report: the whole JSON minus timing and the project path. */
export function reportForSubject(report) {
  const { startedAt, durationMs, project, ...rest } = report;
  return JSON.stringify(rest, null, 1).slice(0, 14000);
}

export function isRepaired(report, expected) {
  const codes = new Set(report.findings.map((f) => f.code));
  return !expected.some((code) => codes.has(code)) && report.findings.every((f) => f.severity !== "error");
}

/**
 * One repair run. `verify(workDir) -> report`, `client.messages(body) -> response` are injected (tests pass fakes).
 * Returns { repaired, turns, repairedAtTurn, transcript, finalCodes }.
 */
export async function runRepair({ workDir, expected, verify, client, model, maxTurns = 5, maxApiCallsPerTurn = 12 }) {
  let report = await verify(workDir);
  const initialCodes = report.findings.map((f) => f.code);
  const messages = [{ role: "user", content: `Initial verify report:\n${reportForSubject(report)}\n\nFix the project. Start by reading src/.` }];
  const transcript = [];
  let apiCalls = 0, wroteAny = false;
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    let ended = false;
    for (let call = 0; call < maxApiCallsPerTurn && !ended; call += 1) {
      const response = await client.messages({ model, max_tokens: 8192, system: SUBJECT_SYSTEM, messages, tools: TOOLS });
      apiCalls += 1;
      const content = Array.isArray(response.content) ? response.content : [];
      messages.push({ role: "assistant", content });
      const uses = content.filter((b) => b.type === "tool_use");
      if (!uses.length) { ended = true; break; }
      const results = [];
      for (const use of uses) {
        if (use.name === "done") { ended = true; results.push({ type: "tool_result", tool_use_id: use.id, content: "turn ended" }); continue; }
        const r = execTool(workDir, use.name, use.input);
        if (use.name === "write_file" && !r.isError) wroteAny = true;
        results.push({ type: "tool_result", tool_use_id: use.id, content: r.text.slice(0, 20000), is_error: r.isError });
      }
      transcript.push({ turn, tools: uses.map((u) => u.name) });
      messages.push({ role: "user", content: results });
    }
    report = await verify(workDir);
    const codes = report.findings.map((f) => f.code);
    transcript.push({ turn, verifyCodes: codes, ok: report.ok });
    if (isRepaired(report, expected)) return { repaired: true, repairedAtTurn: turn, turns: turn, apiCalls, initialCodes, finalCodes: codes, transcript };
    // The assistant's last message must be answered by a user message carrying the new report.
    const last = messages[messages.length - 1];
    const text = `New verify report after your edits (turn ${turn} of ${maxTurns}):\n${reportForSubject(report)}`;
    if (last.role === "user" && Array.isArray(last.content)) last.content.push({ type: "text", text });
    else messages.push({ role: "user", content: text });
  }
  return { repaired: false, repairedAtTurn: null, turns: maxTurns, apiCalls, initialCodes, finalCodes: report.findings.map((f) => f.code), wroteAny, transcript };
}

// ---- CLI ---------------------------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback; };
  const manifest = JSON.parse(readFileSync(join(seededDir, "manifest.json"), "utf8"));
  const only = opt("--scenes")?.split(",");
  const runs = Number(opt("--runs", "1")), maxTurns = Number(opt("--max-turns", "5"));
  const noBrowser = args.includes("--no-browser");
  const lock = opt("--browser-lock");
  const outDir = resolve(repoRoot, opt("--out", "tests/reports/agent-loop/repair"));
  const { createPrismClient, loadKey, DEFAULT_MODEL } = await import(pathToFileURL(join(repoRoot, "tools/agent-eval/lib/prism.mjs")).href);
  const model = opt("--model", DEFAULT_MODEL);
  let client;
  try { client = createPrismClient({ key: loadKey(), maxRetries: 3 }); } catch (error) { console.error(`Prism unavailable: ${error.message}`); process.exit(3); }
  mkdirSync(outDir, { recursive: true });

  const verify = (workDir) => {
    const reportPath = join(workDir, ".verify-report.json");
    rmSync(reportPath, { force: true });
    spawnSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "packages/aura3d-cli/src/cli.ts", "verify", workDir, "--out", reportPath, "--json", ...(noBrowser ? ["--skip", "serve,render,inspect"] : []), ...(lock ? ["--browser-lock", lock] : [])], { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 26 });
    return JSON.parse(readFileSync(reportPath, "utf8"));
  };

  const results = [];
  for (const scene of manifest.scenes) {
    if (only && !only.includes(scene.id)) continue;
    if (noBrowser && !scene.expectedStatic) { console.log(`SKIPPED ${scene.id}: no static expectation and --no-browser`); continue; }
    for (let run = 1; run <= runs; run += 1) {
      const workDir = join(seededDir, `_work-${scene.id}`);
      rmSync(workDir, { recursive: true, force: true });
      cpSync(join(seededDir, scene.id), workDir, { recursive: true, filter: (src) => !/[\\/](dist|node_modules)([\\/]|$)/.test(src) });
      const expected = [scene.expectedStatic, noBrowser ? null : scene.expectedRuntime].filter(Boolean);
      const t0 = Date.now();
      let result;
      try { result = await runRepair({ workDir, expected, verify, client, model, maxTurns }); }
      catch (error) { result = { repaired: false, error: String(error.message ?? error).slice(0, 300), turns: 0, transcript: [] }; }
      const row = { id: scene.id, run, expected, ...result, seconds: Math.round((Date.now() - t0) / 1000) };
      results.push(row);
      writeFileSync(join(outDir, `${scene.id}-run${run}.json`), `${JSON.stringify({ ...row, finalSource: existsSync(join(workDir, "src/main.ts")) ? readFileSync(join(workDir, "src/main.ts"), "utf8") : null }, null, 2)}\n`);
      console.log(`${row.repaired ? "REPAIRED" : "NOT REPAIRED"} ${scene.id} run ${run}: turns ${row.turns}${row.error ? ` error ${row.error}` : ""} final [${(row.finalCodes ?? []).join(", ")}]`);
      rmSync(workDir, { recursive: true, force: true });
    }
  }
  const repaired = results.filter((r) => r.repaired && r.repairedAtTurn <= maxTurns).length;
  const summary = { schema: "aura3d.verify-repair/1", model, runsPerScene: runs, maxTurns, browser: !noBrowser, attempts: results.length, repairedWithinBudget: repaired, rows: results.map(({ transcript, ...r }) => r) };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`${repaired}/${results.length} repaired within ${maxTurns} turns (n=${runs}, model ${model}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
