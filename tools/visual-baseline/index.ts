import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PixelBuffer {
  width: number;
  height: number;
  rgba: readonly number[];
}

export interface VisualReport {
  ok: boolean;
  generatedAt: string;
  releaseRunId: string;
  checkedImages: number;
  browserChecks: number;
  violations: Array<{ target: string; message: string }>;
}

export function isNonBlank(buffer: PixelBuffer): boolean {
  if (buffer.width <= 0 || buffer.height <= 0) return false;
  if (buffer.rgba.length !== buffer.width * buffer.height * 4) return false;

  const first = buffer.rgba.slice(0, 4).join(",");
  for (let i = 4; i < buffer.rgba.length; i += 4) {
    if (buffer.rgba.slice(i, i + 4).join(",") !== first) return true;
  }
  return false;
}

function countPassedVisualSpecs(report: unknown): number {
  let passed = 0;

  function visitSuite(suite: unknown): void {
    if (!suite || typeof suite !== "object") return;
    const maybeSuite = suite as { specs?: unknown[]; suites?: unknown[] };
    for (const spec of maybeSuite.specs ?? []) {
      if (!spec || typeof spec !== "object") continue;
      const tests = (spec as { tests?: unknown[] }).tests ?? [];
      if (
        tests.length > 0 &&
        tests.every((test) => {
          if (!test || typeof test !== "object") return false;
          const typedTest = test as { status?: string; results?: Array<{ status?: string }> };
          return typedTest.status === "expected" && typedTest.results?.some((result) => result.status === "passed");
        })
      ) {
        passed += 1;
      }
    }
    for (const child of maybeSuite.suites ?? []) visitSuite(child);
  }

  if (report && typeof report === "object") {
    const suites = (report as { suites?: unknown[] }).suites ?? [];
    for (const suite of suites) visitSuite(suite);
  }

  return passed;
}

function runBrowserVisualChecks(root: string, violations: VisualReport["violations"]): number {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;

  const result = spawnSync("pnpm", ["exec", "playwright", "test", "tests/visual", "--reporter=json", "--workers=1", "--timeout=120000"], {
    cwd: root,
    encoding: "utf8",
    env
  });
  const reportPath = join(root, "tests", "reports", "visual-browser.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, result.stdout || "{}\n");

  if (result.status !== 0) {
    violations.push({
      target: "tests/visual",
      message: result.stderr.trim() || `Playwright visual checks exited with ${result.status ?? "unknown"}`
    });
    return 0;
  }

  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    const passed = countPassedVisualSpecs(parsed);
    if (passed === 0) {
      violations.push({ target: reportPath, message: "Playwright visual report did not contain passed specs." });
    }
    return passed;
  } catch (error) {
    violations.push({
      target: reportPath,
      message: `Could not parse Playwright visual JSON: ${error instanceof Error ? error.message : String(error)}`
    });
    return 0;
  }
}

export function runVisualBaseline(root = process.cwd(), options: { runBrowserChecks?: boolean } = {}): VisualReport {
  const fixture = join(root, "tests", "tool-fixtures", "visual", "nonblank.json");
  const violations: VisualReport["violations"] = [];
  let checkedImages = 0;

  if (existsSync(fixture)) {
    checkedImages++;
    const buffer = JSON.parse(readFileSync(fixture, "utf8")) as PixelBuffer;
    if (!isNonBlank(buffer)) {
      violations.push({ target: fixture, message: "Visual fixture is blank or malformed." });
    }
  }

  const browserChecks = options.runBrowserChecks ? runBrowserVisualChecks(root, violations) : 0;

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-visual-run",
    checkedImages,
    browserChecks,
    violations
  };
}

function writeReport(root: string, report: VisualReport): void {
  const reportPaths = [
    join(root, "tests", "reports", "visual.json"),
    join(root, "tests", "reports", "final-visual.json")
  ];
  for (const path of reportPaths) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const report = runVisualBaseline(root, { runBrowserChecks: true });
  writeReport(root, report);
  if (!report.ok) {
    console.error(JSON.stringify(report.violations, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Visual baseline passed for ${report.checkedImages} fixture images and ${report.browserChecks} browser pixel checks.`);
  }
}
