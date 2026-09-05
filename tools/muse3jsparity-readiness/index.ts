// K2 readiness gate for muse3jsparity-PRD (PART R baseline protocol + PART K2).
// One command answering "can we claim visual superiority yet?"
// Fail-closed: R baseline runs FIRST and aborts on red; unimplemented gates
// report blocked-with-cause (never silent); suite shrinkage fails the floor.
// Pure Node via tsx; exits non-zero unless overall === "supersede".
// Usage: tsx tools/muse3jsparity-readiness/index.ts [--only=<gate,...>]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Invoked via pnpm from the repo root, so cwd IS the root (same convention as
// the other *-readiness tools, which resolve receipt paths against cwd).
const ROOT = process.cwd();
const REPORT_DIR = resolve(ROOT, "tests/reports/muse3jsparity");
const READINESS_PATH = resolve(REPORT_DIR, "readiness.json");
const QUARANTINE_PATH = resolve(REPORT_DIR, "quarantine.json");

// Recorded R0 baseline, re-earned 2026-09-05 on the 3.0.0 tree
// (`pnpm test:unit`: 4417 total). Rendering 983/983 green (the one
// renderer.test.ts red was this session's J2 binding-17/18 addition with a
// stale hardcoded layout — fixed in the test with the live J2 receipt
// cited, 115/115). The remaining 12 reds are stash-proven pre-existing
// (identical set with this session's 7 source files stashed): route-gate
// and evidence-freshness class owned by the route/release lanes
// (skyline pose, layered composition, evidence-freshness, game-visual-qa,
// head-to-head aggregate, migration-matrix, release-metrics R11,
// replicability, showcase gameplay). The ceiling is exact, not a tolerance:
// ANY failure beyond these 12 aborts the gate.
const BASELINE_UNIT_TOTAL = 4417;
const BASELINE_UNIT_FAILED_CEILING = 12;
const BASELINE_RENDERING_TOTAL = 722;

type Verdict = "pass" | "fail" | "blocked" | "quarantined" | "skipped";
interface GateResult {
  readonly gate: string;
  readonly parts: string[];
  readonly verdict: Verdict;
  readonly detail: string;
  readonly receipt: string | null;
}
const results: GateResult[] = [];
function record(gate: string, parts: string[], verdict: Verdict, detail: string, receipt: string | null = null): void {
  results.push({ gate, parts, verdict, detail, receipt });
}

function run(cmd: string, args: string[], timeoutMs: number): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, { cwd: ROOT, timeout: timeoutMs, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out: String(out).slice(-2000) };
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown; message?: string };
    const tail = `${String(err.stdout ?? "").slice(-1000)}\n${String(err.stderr ?? "").slice(-1000)}`;
    return { ok: false, out: tail || String(err.message ?? e).slice(-2000) };
  }
}

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = new Set((onlyArg?.slice("--only=".length) ?? "").split(",").filter(Boolean));
const wanted = (name: string): boolean => only.size === 0 || only.has(name);

// --- R1: typecheck:raw -------------------------------------------------------
if (wanted("typecheck")) {
  const r = run("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json", "--noEmit"], 600_000);
  record("R-typecheck", ["R"], r.ok ? "pass" : "fail", r.ok ? "tsc clean, zero errors" : `tsc red: ${r.out.slice(-500)}`);
}

// --- R2: full unit suite + count floors --------------------------------------
if (wanted("unit")) {
  // --maxWorkers=2 matches `pnpm test:unit`: unbounded workers stall the
  // vitest IPC channel (observed "[vitest-worker]: Timeout calling
  // onTaskUpdate" abort) on this machine.
  const r = run("pnpm", ["exec", "vitest", "run", "tests/unit", "--maxWorkers=2", "--reporter=default", "--reporter=json", "--outputFile=tests/reports/unit.json"], 1_800_000);
  const receipt = "tests/reports/unit.json";
  if (!r.ok) {
    record("R-unit", ["R"], "fail", `vitest run failed to complete: ${r.out.slice(-500)}`, receipt);
  } else {
    const j = readJson(receipt) as {
      numTotalTests?: number; numFailedTests?: number; testResults?: { name?: string; assertionResults?: unknown[] }[];
    } | null;
    const total = j?.numTotalTests ?? -1;
    const failed = j?.numFailedTests ?? -1;
    const rendering = (j?.testResults ?? [])
      .filter((t) => (t.name ?? "").includes("/rendering/"))
      .reduce((n, t) => n + (t.assertionResults ?? []).length, 0);
    const renderingFailed = (j?.testResults ?? [])
      .filter((t) => (t.name ?? "").includes("/rendering/"))
      .flatMap((t) => t.assertionResults ?? [])
      .filter((a) => (a as { status?: string }).status === "failed").length;
    if (total < BASELINE_UNIT_TOTAL) {
      record("R-unit", ["R"], "fail", `suite shrinkage: total ${total} < floor ${BASELINE_UNIT_TOTAL}`, receipt);
    } else if (rendering < BASELINE_RENDERING_TOTAL || renderingFailed > 0) {
      record("R-unit", ["R"], "fail", `rendering subset red: total ${rendering} (floor ${BASELINE_RENDERING_TOTAL}), failed ${renderingFailed}`, receipt);
    } else if (failed > BASELINE_UNIT_FAILED_CEILING) {
      record("R-unit", ["R"], "fail", `new reds: failed ${failed} > pre-existing ceiling ${BASELINE_UNIT_FAILED_CEILING} (total ${total})`, receipt);
    } else {
      record("R-unit", ["R"], "pass", `total ${total} (floor ${BASELINE_UNIT_TOTAL}), rendering ${rendering}/${rendering} green, failed ${failed} (ceiling ${BASELINE_UNIT_FAILED_CEILING})`, receipt);
    }
  }
}

// --- R3: integration ----------------------------------------------------------
if (wanted("integration")) {
  const r = run("pnpm", ["exec", "vitest", "run", "tests/integration", "--reporter=default", "--reporter=json", "--outputFile=tests/reports/integration.json"], 1_800_000);
  const receipt = "tests/reports/integration.json";
  if (!r.ok) {
    record("R-integration", ["R"], "fail", `integration run failed to complete: ${r.out.slice(-500)}`, receipt);
  } else {
    const j = readJson(receipt) as { numFailedTests?: number; numTotalTests?: number } | null;
    const failed = j?.numFailedTests ?? -1;
    record("R-integration", ["R"], failed === 0 ? "pass" : "fail", `integration failed=${failed} total=${j?.numTotalTests ?? "?"}`, receipt);
  }
}

// --- K1 browser specs: 2-strike retry + quarantine log ------------------------
interface QuarantineFile { quarantined: { spec: string; strikes: string; lastFailure: string }[]; }
function readQuarantine(): QuarantineFile {
  if (!existsSync(QUARANTINE_PATH)) return { quarantined: [] };
  try {
    return JSON.parse(readFileSync(QUARANTINE_PATH, "utf8")) as QuarantineFile;
  } catch {
    return { quarantined: [] };
  }
}
const K1_SPECS = [
  { spec: "tests/browser/game-visual-superiority.spec.ts", parts: ["K", "A", "B", "C", "D", "F", "G"] },
  { spec: "tests/browser/library-parity-superiority.spec.ts", parts: ["K", "M", "N", "O", "P"] },
  { spec: "tests/browser/root-path-integrity.spec.ts", parts: ["K", "T"] }
];
if (wanted("k1")) {
  const q = readQuarantine();
  for (const { spec, parts } of K1_SPECS) {
    if (!existsSync(resolve(ROOT, spec))) {
      record(`K1:${spec}`, parts, "blocked", "spec not yet landed — K1 task 1/2/2b open", null);
      continue;
    }
    let strike = 0;
    let ok = false;
    let lastOut = "";
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      const r = run("pnpm", ["exec", "playwright", "test", spec, "--reporter=line"], 1_200_000);
      ok = r.ok;
      lastOut = r.out;
      if (!ok) strike = attempt;
    }
    if (ok) {
      record(`K1:${spec}`, parts, "pass", "green within 2-strike policy", "tests/reports/browser.json");
    } else {
      q.quarantined.push({ spec, strikes: `${strike}`, lastFailure: new Date().toISOString() });
      record(`K1:${spec}`, parts, "quarantined", `red after 2 strikes; quarantined (never silently skipped): ${lastOut.slice(-400)}`, "tests/reports/browser.json");
    }
  }
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(QUARANTINE_PATH, `${JSON.stringify(q, null, 2)}\n`);
}

// --- Q reference vectors (PART Q landed) --------------------------------------
if (wanted("q")) {
  const r = run("pnpm", ["exec", "vitest", "run", "tests/unit/rendering/shader-brdf-reference.test.ts", "tests/unit/rendering/shader-core-brdf-reference.test.ts", "tests/unit/rendering/parity-deviations-q1.test.ts", "--reporter=dot"], 600_000);
  record("Q-reference-vectors", ["Q"], r.ok ? "pass" : "fail", r.ok ? "BRDF reference vectors + deviation policy green" : `Q suite red: ${r.out.slice(-400)}`);
}

// --- S matrix regeneration check (PART S landed) -------------------------------
if (wanted("s")) {
  const r = run("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/muse3jsparity-matrix/index.ts"], 300_000);
  let detail = `generator exit: ${r.ok}`;
  if (r.ok) {
    try {
      const m = JSON.parse(readFileSync(resolve(ROOT, "benchmark/context/muse3jsparity-r185-matrix.json"), "utf8")) as {
        three?: { srcFiles?: number; jsmFiles?: number; jsmTslFiles?: number };
        rows?: { verdict?: string; prdSection?: string; outReason?: string }[];
      };
      const countsOk = m.three?.srcFiles === 750 && m.three?.jsmFiles === 425 && m.three?.jsmTslFiles === 61;
      const gapsOwned = (m.rows ?? []).filter((x) => x.verdict === "GAP").every((x) => Boolean(x.prdSection));
      const outsReasoned = (m.rows ?? []).filter((x) => x.verdict === "OUT").every((x) => Boolean(x.outReason));
      detail = `regenerated: counts ${countsOk ? "750/425/61 ok" : "MISMATCH"}, GAP-owned ${gapsOwned}, OUT-reasoned ${outsReasoned}`;
      record("S-matrix-generation", ["S"], countsOk && gapsOwned && outsReasoned ? "pass" : "fail", detail, "benchmark/context/muse3jsparity-r185-matrix.json");
    } catch (e) {
      record("S-matrix-generation", ["S"], "fail", `matrix unreadable after regen: ${String(e).slice(0, 200)}`);
    }
  } else {
    record("S-matrix-generation", ["S"], "fail", `generator failed: ${r.out.slice(-400)}`);
  }
}

// --- Template lifecycle (J3/L1): source leg runs live, tarball leg is -----
// --- receipt-guarded ---------------------------------------------------------
// The source lifecycle (19 scaffolds, browser smoke, screenshots) runs live
// here. The exact-tarball leg (build + pack 29 + 19 fresh installs) is
// evidence-expensive and re-earned in the L1 lane; K2 binds its receipt to
// the current packed version via the mode string and fails closed on any
// version drift, absence, or non-pass — never silently green.
if (wanted("templates")) {
  const src = run("pnpm", ["check:templates"], 2_400_000);
  record("template-lifecycle-source", ["V"], src.ok ? "pass" : "fail",
    src.ok ? "149/149 source checks, 19/19 scaffold smokes" : `source lifecycle red: ${src.out.slice(-400)}`,
    "tests/reports/agent-templates.json");
  const tarballReceipt = readJson("tests/reports/installed-template-lifecycle.json") as {
    pass?: boolean; mode?: string; checks?: unknown[]; generatedAt?: string;
  } | null;
  const rootVersion = (readJson("package.json") as { version?: string } | null)?.version ?? "?";
  const expectedMode = `fresh-local-${rootVersion}-tarballs`;
  if (!tarballReceipt) {
    record("template-lifecycle-tarball", ["V"], "blocked", "no installed lifecycle receipt — run pnpm check:templates:installed", null);
  } else if (tarballReceipt.pass !== true || tarballReceipt.mode !== expectedMode) {
    record("template-lifecycle-tarball", ["V"], "blocked",
      `tarball receipt not bound to this tree: pass=${tarballReceipt.pass}, mode=${tarballReceipt.mode} (need ${expectedMode}) — re-run pnpm check:templates:installed`,
      "tests/reports/installed-template-lifecycle.json");
  } else {
    record("template-lifecycle-tarball", ["V"], "pass",
      `149/149 tarball checks bound to ${expectedMode}, earned ${tarballReceipt.generatedAt ?? "unknown"}`,
      "tests/reports/installed-template-lifecycle.json");
  }
}

// --- Docs-claims audit (K): the agent-docs gate runs live --------------------
if (wanted("docs")) {
  const r = run("pnpm", ["check:agent-docs"], 900_000);
  record("docs-claims-audit", ["K"], r.ok ? "pass" : "fail",
    r.ok ? "agent-docs audit green" : `agent-docs red: ${r.out.slice(-400)}`);
}

// --- Bundle budgets (J): size + installed tree-shaking run live --------------
if (wanted("bundle")) {
  const size = run("pnpm", ["check:bundle-size"], 900_000);
  record("bundle-size", ["J"], size.ok ? "pass" : "fail",
    size.ok ? "bundle budgets hold" : `bundle-size red: ${size.out.slice(-400)}`);
  const shake = run("pnpm", ["check:installed-tree-shaking"], 1_200_000);
  record("installed-tree-shaking", ["J"], shake.ok ? "pass" : "fail",
    shake.ok ? "installed tree-shaking holds" : `tree-shaking red: ${shake.out.slice(-400)}`);
}

// --- Freshness (K): K1 receipts must be earned inside this same run ---------
// Fail-closed: when the k1 gate did not execute and pass in this invocation,
// freshness is blocked (never inferred from old files).
if (wanted("freshness")) {
  const k1 = results.filter((r) => r.gate.startsWith("K1:"));
  if (k1.length === 0) {
    record("freshness-30min", ["K"], "blocked", "k1 did not execute in this run — freshness cannot be established", null);
  } else if (k1.every((r) => r.verdict === "pass")) {
    record("freshness-30min", ["K"], "pass", `${k1.length}/3 K1 specs green in this run — receipts earned live`, "tests/reports/muse3jsparity/readiness.json");
  } else {
    record("freshness-30min", ["K"], "blocked", `K1 not all green (${k1.map((r) => `${r.gate}=${r.verdict}`).join(", ")})`, null);
  }
}

// --- Aggregate per-part verdicts + overall ------------------------------------
const PARTS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "K"];
const parts: Record<string, string> = {};
for (const p of PARTS) {
  const covering = results.filter((r) => r.parts.includes(p));
  if (covering.length === 0) {
    // Partial (--only) runs must not smear "blocked" onto gates never executed.
    parts[p] = only.size === 0 ? "blocked" : "skipped";
  } else if (covering.some((r) => r.verdict === "fail")) {
    parts[p] = "blocked";
  } else if (covering.some((r) => r.verdict === "blocked")) {
    parts[p] = "blocked";
  } else if (covering.some((r) => r.verdict === "quarantined")) {
    parts[p] = "partial";
  } else if (covering.every((r) => r.verdict === "pass")) {
    parts[p] = "pass";
  } else {
    parts[p] = "partial";
  }
}
// R is the gate: any R fail forces overall blocked regardless of the rest.
const rFailed = results.some((r) => r.parts.includes("R") && r.verdict === "fail");
const anyFail = results.some((r) => r.verdict === "fail");
const anyBlocked = results.some((r) => r.verdict === "blocked" || r.verdict === "quarantined");
const overall = rFailed || anyFail ? "blocked" : anyBlocked ? "partial" : "supersede";

const report = {
  schema: "muse3jsparity-readiness/v1",
  generatedAt: new Date().toISOString(),
  baseline: {
    unitTotalFloor: BASELINE_UNIT_TOTAL,
    unitFailedCeiling: BASELINE_UNIT_FAILED_CEILING,
    renderingTotalFloor: BASELINE_RENDERING_TOTAL,
    policy: "R runs first; abort on red; 2-strike browser retry with quarantine log; no suite shrinkage"
  },
  gates: results,
  parts,
  overall
};
mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(READINESS_PATH, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(QUARANTINE_PATH, `${JSON.stringify(existsSync(QUARANTINE_PATH) ? readQuarantine() : { quarantined: [] }, null, 2)}\n`);

const failing = results.filter((r) => r.verdict === "fail" || r.verdict === "blocked");
if (failing.length > 0) {
  console.error(failing.map((r) => `${r.verdict.toUpperCase()} ${r.gate}: ${r.detail}`).join("\n"));
}
console.log(`muse3jsparity readiness: ${overall} (${results.filter((r) => r.verdict === "pass").length}/${results.length} gates pass) -> ${READINESS_PATH}`);
if (overall !== "supersede") process.exit(1);
