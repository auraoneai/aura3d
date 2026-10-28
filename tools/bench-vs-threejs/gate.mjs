#!/usr/bin/env node
// Benchmark gate for the "beat three.js" PRD (docs/prds/beat-threejs). Reads a results file produced by
// the bench harness and prints PASS / FAIL / NO-DATA for every target in the PRD section 1 table.
//
//   node tools/bench-vs-threejs/gate.mjs --results <results.json> --static <static-metrics.json>
//        [--gpu-results <results.json taken on a real GPU>] [--audit <capability-audit.md>]
//        [--mappings <mappings.ts>] [--extra <json>] [--claim P1,P2,...|all] [--json <out.json>]
//
// Exit codes: 0 gate holds; 1 gate failed; 2 bad input.
//   - T1 (three.js better in at most 30 numeric rows) always gates: the exit code is 1 when it fails.
//   - Every target listed in --claim must be PASS (NO-DATA is not a pass). A release may claim only
//     the targets it lists, so list the ones the release notes, README or site will state.
//   - Speed targets P1 to P6 are software-GL numbers unless the results file's renderer says otherwise.
//     P7 reads only --gpu-results and refuses a software renderer; without it P7 is NO-DATA and every speed
//     statement keeps the "software WebGL2" qualifier.
//   - D3 (silent no-ops) comes from --extra {"silentNoOps": <n>} (the option-coverage test count).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SCENES, computeTally, networkOf } from "./harness/tally.mjs";
import { ARM_KEYS, auraRun, classifyRenderer, pickAuraArm } from "./shared/arms.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
export const T1_MAX_THREE_BETTER = 30;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v, d = 1) => (v === null || v === undefined ? "n/a" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));

function result(id, title, target, status, measured, detail = "", basis = "") {
  return { id, title, target, status, measured, detail, basis };
}

/** One comparison "measured <= limit": NO-DATA when measured is missing. */
function atMost(id, title, target, measured, limit, unit, basis, detail = "") {
  const m = num(measured);
  if (m === null) return result(id, title, target, "NO-DATA", null, detail || "metric missing from results", basis);
  return result(id, title, target, m <= limit ? "PASS" : "FAIL", `${fmt(m, 2)}${unit}`, detail, basis);
}

/** Pull `mapping:` / `fidelity:` counts out of the codemod table without evaluating TypeScript. */
export function countCodemodRows(source) {
  const count = (field) => {
    const out = { exact: 0, approximate: 0, none: 0, pending: 0 };
    for (const m of source.matchAll(new RegExp(`\\b${field}:\\s*"(exact|approximate|none|pending)"\\s*[,}]`, "g"))) out[m[1]] += 1;
    return out;
  };
  const byMapping = count("mapping");
  const total = (o) => o.exact + o.approximate + o.none + o.pending;
  const byFidelity = count("fidelity");
  return total(byMapping) >= total(byFidelity) ? byMapping : byFidelity;
}

/** Rows of the audit tables whose label (second cell) is partial or experimental and which are not marked as removed from public copy. */
export function countUnresolvedAuditRows(markdown) {
  const rows = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const label = cells[1].replace(/[*`]/g, "").toLowerCase();
    if (!/^(partial|experimental)\b/.test(label)) continue;
    rows.push({ capability: cells[0], label, resolved: /removed from public copy/i.test(line) });
  }
  return { total: rows.length, unresolved: rows.filter((r) => !r.resolved), rows };
}

const SOFTWARE_BASIS = "software WebGL2";
const harnessNoise = /GL Driver Message/;

export function evaluateGate({ results, statics, gpuResults = null, auditMarkdown = null, mappingsSource = null, extra = {} }) {
  const out = [];
  const renderer = results?.env?.renderer;
  const rendererKind = classifyRenderer(renderer);
  const basis = rendererKind === "gpu" ? `real GPU (${renderer})` : rendererKind === "software" ? SOFTWARE_BASIS : "renderer unknown";
  const scene = (name) => results?.scenes?.[name]?.results;
  const aura = (name) => auraRun(scene(name) ?? {});
  const threeMsaa = (name) => scene(name)?.[ARM_KEYS.threeMsaa];
  const base = aura("baseline");
  const pbr = aura("pbr-viewer");

  out.push(atMost("P1", "Steady-state frame, one cube", "<= 5 ms", base?.totalMs?.median, 5, " ms", basis, `three.js 4x MSAA ${fmt(threeMsaa("baseline")?.totalMs?.median)} ms`));
  out.push(atMost("P2", "CPU inside frame(), one cube", "<= 0.5 ms", base?.cpuMs?.median, 0.5, " ms", basis, `three.js ${fmt(scene("baseline")?.three?.cpuMs?.median, 2)} ms`));
  out.push(atMost("P3", "Time to first frame, one cube", "<= 500 ms", base?.ttffMs?.median, 500, " ms", basis, `three.js ${fmt(scene("baseline")?.three?.ttffMs?.median)} ms`));

  const cubeDraws = num(base?.perFrame?.draws);
  const pbrDraws = num(pbr?.perFrame?.draws);
  if (cubeDraws === null || pbrDraws === null) out.push(result("P4", "Draw calls, one cube / PBR viewer", "1 / <= 25", "NO-DATA", null, "draw counts missing", basis));
  else out.push(result("P4", "Draw calls, one cube / PBR viewer", "1 / <= 25", cubeDraws <= 1 && pbrDraws <= 25 ? "PASS" : "FAIL", `${cubeDraws} / ${pbrDraws}`, "", basis));

  out.push(atMost("P5", "Requests on first load, one cube", "<= 8", networkOf(base)?.count, 8, "", basis));

  // P6: forest 10k completes, <= 5 minutes, <= 3x three.js 4x MSAA.
  {
    const forest = aura("forest");
    const msaa = num(threeMsaa("forest")?.totalMs?.median);
    const own = num(forest?.totalMs?.median);
    if (!forest || forest.failed || own === null) {
      out.push(result("P6", "Forest 10k completes on software GL", "<= 5 min and <= 3x three.js 4x MSAA", "FAIL", "did not complete", forest?.failed ? (forest.errors ?? []).join(" | ").slice(0, 160) : "no Aura3D forest result", basis));
    } else {
      const wall = num(forest.wallMs) ?? (num(forest.ttffMs?.median) ?? 0) + (num(forest.totalMs?.n) ?? 0) * (num(forest.totalMs?.mean) ?? own);
      const ratio = msaa === null ? null : own / msaa;
      const pass = wall <= 300000 && ratio !== null && ratio <= 3;
      out.push(result("P6", "Forest 10k completes on software GL", "<= 5 min and <= 3x three.js 4x MSAA", ratio === null ? "NO-DATA" : pass ? "PASS" : "FAIL", `${fmt(wall / 1000, 0)} s, ${ratio === null ? "n/a" : fmt(ratio, 2)}x`, num(forest.wallMs) === null ? "wall time estimated from first-frame + measured frames" : "", basis));
    }
  }

  // P7: real GPU, all five scenes, aura <= three.js 4x MSAA. Never fed from a software run.
  {
    if (!gpuResults) out.push(result("P7", "Real GPU: steady-state frame, five scenes", "<= three.js 4x MSAA on every scene", "NO-DATA", null, "no real-GPU results; speed claims keep the software WebGL2 qualifier", "real GPU"));
    else if (classifyRenderer(gpuResults?.env?.renderer) !== "gpu") out.push(result("P7", "Real GPU: steady-state frame, five scenes", "<= three.js 4x MSAA on every scene", "NO-DATA", null, `refused: renderer is ${classifyRenderer(gpuResults?.env?.renderer)} (${gpuResults?.env?.renderer ?? "none"})`, "real GPU"));
    else {
      const per = SCENES.map((s) => {
        const sr = gpuResults.scenes?.[s]?.results;
        return { scene: s, aura: num(auraRun(sr ?? {})?.totalMs?.median), three: num(sr?.[ARM_KEYS.threeMsaa]?.totalMs?.median) };
      });
      const missing = per.filter((p) => p.aura === null || p.three === null);
      const slower = per.filter((p) => p.aura !== null && p.three !== null && p.aura > p.three);
      out.push(result("P7", "Real GPU: steady-state frame, five scenes", "<= three.js 4x MSAA on every scene", missing.length ? "NO-DATA" : slower.length ? "FAIL" : "PASS", per.map((p) => `${p.scene} ${fmt(p.aura)}/${fmt(p.three)}`).join("; "), missing.length ? `missing: ${missing.map((p) => p.scene).join(", ")}` : slower.length ? `slower on: ${slower.map((p) => p.scene).join(", ")}` : "", `real GPU (${gpuResults.env.renderer})`));
    }
  }

  // Q1: skinned character mean luma within 10% (same nominal lights).
  {
    const luma = results?.scenes?.["skinned-character"]?.correctness?.meanLuma;
    const t = num(luma?.three?.[0]);
    const a = num(luma?.aura?.[0]);
    if (t === null || a === null) out.push(result("Q1", "Exposure: skinned character mean luma", "within 10%", "NO-DATA", null, "mean luma missing", basis));
    else {
      const diff = Math.abs(a - t) / t;
      out.push(result("Q1", "Exposure: skinned character mean luma", "within 10%", diff <= 0.1 ? "PASS" : "FAIL", `three.js ${fmt(t)} vs Aura3D ${fmt(a)} (${fmt(diff * 100)}%)`, "", basis));
    }
  }

  // Q2: no console warnings or errors from the Aura3D side on the five bench scenes. Chrome's own readPixels driver notices come from the harness and are excluded.
  {
    const kinds = new Map();
    let missing = 0;
    for (const s of SCENES) {
      const run = aura(s);
      if (!run) { missing += 1; continue; }
      for (const m of run.console ?? []) {
        if (!/^(warning|warn|error)$/.test(m.type) || harnessNoise.test(m.text)) continue;
        const key = `${m.type}: ${String(m.text).replace(/\s+/g, " ").slice(0, 60)}`;
        kinds.set(key, (kinds.get(key) ?? 0) + 1);
      }
    }
    const total = [...kinds.values()].reduce((a, b) => a + b, 0);
    out.push(result("Q2", "Console warnings on the five bench scenes", "0", missing === SCENES.length ? "NO-DATA" : total === 0 ? "PASS" : "FAIL", `${total} message(s), ${kinds.size} kind(s)`, [...kinds.keys()].slice(0, 4).join(" | ") + (missing ? ` (${missing} scene(s) without an Aura3D result)` : ""), basis));
  }

  const statOf = (s) => statics?.apps?.[`${s}/aura`]?.scene;
  {
    const s = statOf("baseline");
    const status = s ? (s.loc <= 12 && s.tokens <= 210 ? "PASS" : "FAIL") : "NO-DATA";
    out.push(result("D1", "Source: hello cube lines / tokens", "<= 12 / <= 210", status, s ? `${s.loc} / ${s.tokens}` : null, status === "NO-DATA" ? "static metrics missing" : "", "source"));
  }
  {
    const s = statOf("shader-water");
    const status = s ? (s.loc <= 80 && s.tokens <= 1386 ? "PASS" : "FAIL") : "NO-DATA";
    out.push(result("D2", "Source: shader water lines / tokens", "<= 80 / <= 1,386", status, s ? `${s.loc} / ${s.tokens}` : null, status === "NO-DATA" ? "static metrics missing" : "", "source"));
  }
  out.push(atMost("D3", "Silent no-ops in the documented API", "0", extra?.silentNoOps, 0, "", "option-coverage test", "pass --extra with silentNoOps from tests/unit/agent-api/option-coverage.test.ts"));

  if (auditMarkdown === null) out.push(result("C1", "Partial and experimental audit rows", "0 unresolved", "NO-DATA", null, "audit file not found", "docs"));
  else {
    const audit = countUnresolvedAuditRows(auditMarkdown);
    out.push(result("C1", "Partial and experimental audit rows", "0 unresolved", audit.unresolved.length === 0 ? "PASS" : "FAIL", `${audit.unresolved.length} of ${audit.total} unresolved`, audit.unresolved.slice(0, 5).map((r) => r.capability).join("; "), "docs"));
  }

  if (mappingsSource === null) out.push(result("M1", "Codemod rows approximate / none / pending", "<= 100 / <= 20 / 0", "NO-DATA", null, "mappings file not found", "source"));
  else {
    const c = countCodemodRows(mappingsSource);
    out.push(result("M1", "Codemod rows approximate / none / pending", "<= 100 / <= 20 / 0", c.approximate <= 100 && c.none <= 20 && c.pending === 0 ? "PASS" : "FAIL", `${c.approximate} / ${c.none} / ${c.pending}`, `exact ${c.exact}`, "source"));
  }

  const { tally, totalRows } = computeTally(results, statics);
  out.push(result("T1", "Benchmark tally: three.js better rows", `<= ${T1_MAX_THREE_BETTER}`, tally["three.js better"] <= T1_MAX_THREE_BETTER ? "PASS" : "FAIL", `${tally["three.js better"]} of ${totalRows}`, `Aura3D better ${tally["Aura3D better"]}, tie ${tally.tie}, unmeasurable ${tally.unmeasurable}`, basis));

  return { targets: out, tally, totalRows, basis, auraArm: pickAuraArm(scene("baseline") ?? {}) };
}

/** Decide the exit code: T1 always gates, every claimed target must be PASS. */
export function gateExitCode(targets, claims = []) {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const failures = [];
  if (byId.get("T1")?.status !== "PASS") failures.push("T1");
  for (const id of claims) {
    if (!byId.has(id)) failures.push(`${id} (unknown target)`);
    else if (byId.get(id).status !== "PASS" && !failures.includes(id)) failures.push(id);
  }
  return { code: failures.length ? 1 : 0, failures };
}

export function parseClaims(spec, targets) {
  if (!spec) return [];
  if (spec === "all") return targets.map((t) => t.id);
  return String(spec).split(",").map((s) => s.trim()).filter(Boolean);
}

export function formatReport(report, claims = []) {
  const lines = [`Benchmark gate (${report.basis}; Aura3D arm: ${report.auraArm ?? "none"})`, ""];
  for (const t of report.targets) {
    const claimed = claims.includes(t.id) ? " [claimed]" : "";
    lines.push(`${t.status.padEnd(7)} ${t.id.padEnd(3)} ${t.title}${claimed}`);
    lines.push(`        measured ${t.measured ?? "n/a"} | target ${t.target}${t.basis ? ` | ${t.basis}` : ""}${t.detail ? ` | ${t.detail}` : ""}`);
  }
  const count = (s) => report.targets.filter((t) => t.status === s).length;
  lines.push("", `PASS ${count("PASS")}  FAIL ${count("FAIL")}  NO-DATA ${count("NO-DATA")}`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    const key = a.slice(2);
    const value = argv[(i += 1)];
    if (value === undefined) throw new Error(`--${key} needs a value`);
    args[key] = value;
  }
  return args;
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const readIfExists = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    if (!args.results || !args.static) throw new Error("--results and --static are required");
  } catch (error) {
    console.error(`bench gate: ${error.message}`);
    return 2;
  }
  let report;
  try {
    report = evaluateGate({
      results: readJson(resolve(args.results)),
      statics: readJson(resolve(args.static)),
      gpuResults: args["gpu-results"] ? readJson(resolve(args["gpu-results"])) : null,
      auditMarkdown: readIfExists(resolve(args.audit ?? `${REPO_ROOT}/docs/comparisons/aura3d-capability-audit.md`)),
      mappingsSource: readIfExists(resolve(args.mappings ?? `${REPO_ROOT}/packages/aura3d-cli/src/migrate-three/mappings.ts`)),
      extra: args.extra ? readJson(resolve(args.extra)) : {}
    });
  } catch (error) {
    console.error(`bench gate: ${error.message}`);
    return 2;
  }
  const claims = parseClaims(args.claim, report.targets);
  const { code, failures } = gateExitCode(report.targets, claims);
  console.log(formatReport(report, claims));
  if (args.json) writeFileSync(resolve(args.json), JSON.stringify({ ...report, claims, failures, exit: code }, null, 2));
  console.log(code === 0 ? "\nGATE OK" : `\nGATE FAILED: ${failures.join(", ")}`);
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
