/**
 * WS-4.3 physics test classification.
 *
 * The PRD requires every existing physics test to be classified *before* the solver
 * migration, into:
 *
 *   - contract              — defines the public promise, must survive unchanged
 *   - characterization      — may encode `aura-js` quirks; rewrite as contract or delete
 *                             with a recorded reason, never retained as a constraint
 *
 * R1 applies to this tool. The classification is **measured, not asserted**: for every
 * test file that pins `backend: "aura-js"`, the pin is rewritten to the production
 * backend in a scratch copy of the repo tree and the suite is re-run. A test that still
 * passes was never depending on the fallback's semantics (contract). A test that fails
 * only when the pin moves is, by construction, describing the old solver's behaviour
 * (characterization) — and that is exactly what must not silently constrain the backend.
 *
 * Reading the files and forming an opinion would be the defect class R1 exists to
 * prevent, so no classification in the report is hand-authored.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const REPORT_DIR = join(ROOT, "tests", "reports", "physics-test-classification");
const SCRATCH = join(ROOT, "tests", "reports", "physics-test-classification", ".scratch");

const PIN = /backend:\s*"aura-js"/g;

type TestOutcome = { readonly name: string; readonly file: string; readonly state: "pass" | "fail" };

function listPinnedFiles(): readonly string[] {
  const out = execFileSync("git", ["grep", "-l", 'backend: "aura-js"', "--", "tests/"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return out.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

function runVitest(files: readonly string[], cwd: string): readonly TestOutcome[] {
  const jsonPath = join(SCRATCH, "vitest.json");
  try {
    execFileSync(
      "npx",
      ["vitest", "run", "--reporter=json", `--outputFile=${jsonPath}`, ...files],
      { cwd, encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024 }
    );
  } catch {
    // Non-zero exit is the expected case: we are deliberately running a suite we expect
    // to contain failures. The JSON report is the signal, not the exit code.
  }
  if (!existsSync(jsonPath)) throw new Error("vitest produced no JSON report");
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    testResults?: readonly { name: string; assertionResults?: readonly { fullName: string; status: string }[] }[];
  };
  const outcomes: TestOutcome[] = [];
  for (const suite of parsed.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      outcomes.push({
        name: assertion.fullName,
        file: suite.name.replace(`${ROOT}/`, ""),
        state: assertion.status === "passed" ? "pass" : "fail"
      });
    }
  }
  return outcomes;
}

function main(): void {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });

  const pinnedFiles = listPinnedFiles();
  if (pinnedFiles.length === 0) throw new Error("no backend-pinned test files found");

  const originals = new Map<string, string>();
  for (const file of pinnedFiles) originals.set(file, readFileSync(join(ROOT, file), "utf8"));

  const baseline = runVitest(pinnedFiles, ROOT);

  let flipped: readonly TestOutcome[];
  try {
    for (const [file, source] of originals) {
      const rewritten = source.replace(PIN, 'backend: "cannon-es"');
      writeFileSync(join(ROOT, file), rewritten);
    }
    flipped = runVitest(pinnedFiles, ROOT);
  } finally {
    // Always restore. The classification must not leave the tree modified.
    for (const [file, source] of originals) writeFileSync(join(ROOT, file), source);
  }

  const baselineByName = new Map(baseline.map((o) => [o.name, o]));
  const flippedByName = new Map(flipped.map((o) => [o.name, o]));

  const rows = [...baselineByName.values()].map((base) => {
    const after = flippedByName.get(base.name);
    const classification =
      base.state === "fail"
        ? "already-failing"
        : after === undefined
          ? "vanished"
          : after.state === "pass"
            ? "contract"
            : "characterization";
    return {
      test: base.name,
      file: base.file,
      onFallback: base.state,
      onProductionBackend: after?.state ?? "absent",
      classification
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    method:
      "Each backend-pinned test file's `backend: \"aura-js\"` pin was rewritten to " +
      "`backend: \"cannon-es\"` in place, the suite re-run, and the tree restored. " +
      "Classification is derived from the observed pass/fail delta, never hand-authored.",
    pinnedFiles,
    counts,
    rows: rows.sort((a, b) => a.classification.localeCompare(b.classification) || a.test.localeCompare(b.test))
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  rmSync(SCRATCH, { recursive: true, force: true });

  console.log(`physics test classification -> ${dirname(join(REPORT_DIR, "report.json")).replace(`${ROOT}/`, "")}/report.json`);
  for (const [key, value] of Object.entries(counts).sort()) console.log(`  ${key}: ${value}`);
  const characterization = rows.filter((r) => r.classification === "characterization");
  if (characterization.length > 0) {
    console.log("\ncharacterization tests (encode fallback semantics, must not constrain the backend):");
    for (const row of characterization) console.log(`  - ${row.file} :: ${row.test}`);
  }
}

main();
