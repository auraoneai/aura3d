import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const requiredExamples = [
  "00-basic-triangle",
  "01-basic-scene",
  "02-materials-pbr",
  "03-shadows",
  "04-physics-stack",
  "05-animation-character",
  "06-asset-gltf",
  "07-input-controls",
  "08-audio-spatial",
  "09-editor-runtime",
  "10-particles",
  "11-showcase-world"
] as const;

const productExamples = [
  "product-configurator",
  "architecture-viewer",
  "game-slice"
] as const;

type JsonRecord = Record<string, unknown>;

export interface FinalDemoValidationReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly examples: readonly string[];
  readonly upstreamReports: readonly DemoUpstreamReport[];
  readonly browserReadyExamples: readonly string[];
  readonly productBrowserReadyExamples: readonly string[];
  readonly visualPixelExamples: readonly string[];
  readonly missingBrowserReadyExamples: readonly string[];
  readonly missingProductBrowserReadyExamples: readonly string[];
  readonly missingVisualPixelExamples: readonly string[];
  readonly interactionMetricsPassed: boolean;
  readonly productRendererBackedPassed: boolean;
  readonly browserReportPassed: boolean;
  readonly visualReportPassed: boolean;
  readonly visualBrowserReportPassed: boolean;
  readonly performanceReportPassed: boolean;
  readonly pbrEnvironmentReportPassed: boolean;
  readonly violations: readonly string[];
}

export interface DemoUpstreamReport {
  readonly name: string;
  readonly path: string;
  readonly ok: boolean;
  readonly reason: string;
}

const root = process.cwd();
const reportPath = join(root, "tests", "reports", "final-demo-validation.json");

function readJson(path: string): JsonRecord | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSpecs(report: JsonRecord | null): Array<{ readonly title: string; readonly ok: boolean }> {
  const specs: Array<{ title: string; ok: boolean }> = [];

  function visit(value: unknown): void {
    if (!isRecord(value)) return;
    if (typeof value.title === "string" && typeof value.ok === "boolean" && Array.isArray(value.tests)) {
      specs.push({ title: value.title, ok: value.ok });
    }
    for (const key of ["suites", "specs"]) {
      const children = value[key];
      if (Array.isArray(children)) {
        for (const child of children) visit(child);
      }
    }
  }

  visit(report);
  return specs;
}

function reportHasNoErrors(report: JsonRecord | null): boolean {
  if (!report) return false;
  const errors = report.errors;
  const stats = isRecord(report.stats) ? report.stats : undefined;
  return (!Array.isArray(errors) || errors.length === 0) && (typeof stats?.unexpected === "number" ? stats.unexpected === 0 : true);
}

function upstreamReport(name: string, path: string, ok: boolean, reason: string): DemoUpstreamReport {
  return { name, path, ok, reason };
}

export function validateFinalDemos(rootDir = root): FinalDemoValidationReport {
  const browser = readJson(join(rootDir, "tests", "reports", "browser.json"));
  const visual = readJson(join(rootDir, "tests", "reports", "visual.json"));
  const visualBrowser = readJson(join(rootDir, "tests", "reports", "visual-browser.json"));
  const performance = readJson(join(rootDir, "tests", "reports", "performance.json")) ?? readJson(join(rootDir, "tests", "reports", "final-performance.json"));
  const pbrEnvironment = readJson(join(rootDir, "tests", "reports", "pbr-environment-validation.json"));
  const pbrRenderingComparison = readJson(join(rootDir, "tests", "reports", "pbr-rendering-comparison.json"));
  const browserSpecs = collectSpecs(browser);
  const visualSpecs = collectSpecs(visualBrowser);
  const browserReadyExamples = requiredExamples.filter((id) => browserSpecs.some((spec) => spec.ok && spec.title === `${id} reaches ready in Chromium`));
  const productBrowserReadyExamples = productExamples.filter((id) => browserSpecs.some((spec) => spec.ok && spec.title === `${id} product demo reaches ready in Chromium`));
  const visualPixelExamples = requiredExamples.filter((id) => visualSpecs.some((spec) => spec.ok && spec.title === `${id} has expected visible pixels`));
  const interactionMetricsPassed = browserSpecs.some((spec) => spec.ok && spec.title === "input and editor examples expose first-person, orbit, and editor selection metrics");
  const productRendererBackedPassed = productBrowserReadyExamples.length === productExamples.length;
  const browserReportPassed = reportHasNoErrors(browser) && browserReadyExamples.length === requiredExamples.length && interactionMetricsPassed && productRendererBackedPassed;
  const visualReportPassed = visual !== null && visual.ok === true && Number(visual.browserChecks) >= requiredExamples.length;
  const visualBrowserReportPassed = reportHasNoErrors(visualBrowser) && visualPixelExamples.length === requiredExamples.length;
  const performanceReportPassed = performance?.status === "pass";
  const pbrEnvironmentReportPassed =
    pbrEnvironment?.ok === true &&
    isRecord(pbrEnvironment.claimBoundary) &&
    typeof pbrEnvironment.claimBoundary.supported === "string" &&
    Array.isArray(pbrEnvironment.claimBoundary.unsupported) &&
    pbrEnvironment.claimBoundary.unsupported.some((entry) => typeof entry === "string" && /No production PBR parity claim/i.test(entry)) &&
    Array.isArray(pbrEnvironment.validations) &&
    pbrEnvironment.validations.some((entry) => isRecord(entry) && entry.name === "pbr-material-lab") &&
    pbrEnvironment.validations.some((entry) => isRecord(entry) && entry.name === "pbr-camera-threejs-comparison") &&
    pbrRenderingComparison?.ok === true &&
    isRecord(pbrRenderingComparison.claimBoundary) &&
    Array.isArray(pbrRenderingComparison.claimBoundary.unsupported) &&
    pbrRenderingComparison.claimBoundary.unsupported.some((entry) => typeof entry === "string" && /No production PBR parity claim/i.test(entry));
  const upstreamReports = [
    upstreamReport(
      "browser",
      "tests/reports/browser.json",
      browserReportPassed,
      browser === null
        ? "missing report"
        : `ready=${browserReadyExamples.length}/${requiredExamples.length}, productReady=${productBrowserReadyExamples.length}/${productExamples.length}, interactionMetrics=${interactionMetricsPassed}, errorsClean=${reportHasNoErrors(browser)}`
    ),
    upstreamReport(
      "visual",
      "tests/reports/visual.json",
      visualReportPassed,
      visual === null ? "missing report" : `ok=${String(visual.ok)}, browserChecks=${String(visual.browserChecks)}`
    ),
    upstreamReport(
      "visual-browser",
      "tests/reports/visual-browser.json",
      visualBrowserReportPassed,
      visualBrowser === null
        ? "missing report"
        : `visiblePixels=${visualPixelExamples.length}/${requiredExamples.length}, errorsClean=${reportHasNoErrors(visualBrowser)}`
    ),
    upstreamReport(
      "performance",
      performance === null ? "tests/reports/performance.json or tests/reports/final-performance.json" : "tests/reports/performance.json",
      performanceReportPassed,
      performance === null ? "missing report" : `status=${String(performance.status)}`
    ),
    upstreamReport(
      "pbr-environment",
      "tests/reports/pbr-environment-validation.json",
      pbrEnvironmentReportPassed,
      pbrEnvironment === null
        ? "missing report"
        : `ok=${String(pbrEnvironment.ok)}, hasClaimBoundary=${String(isRecord(pbrEnvironment.claimBoundary))}, validations=${String(Array.isArray(pbrEnvironment.validations) ? pbrEnvironment.validations.length : 0)}, comparisonOk=${String(pbrRenderingComparison?.ok)}`
    )
  ];
  const missingBrowserReadyExamples = requiredExamples.filter((id) => !browserReadyExamples.includes(id));
  const missingProductBrowserReadyExamples = productExamples.filter((id) => !productBrowserReadyExamples.includes(id));
  const missingVisualPixelExamples = requiredExamples.filter((id) => !visualPixelExamples.includes(id));
  const violations = [
    ...missingBrowserReadyExamples.map((id) => `Missing browser-ready example validation: ${id}`),
    ...missingProductBrowserReadyExamples.map((id) => `Missing renderer-backed product demo validation: ${id}`),
    ...missingVisualPixelExamples.map((id) => `Missing visual pixel example validation: ${id}`),
    ...(interactionMetricsPassed ? [] : ["Missing input/editor interaction metrics validation"]),
    ...(productRendererBackedPassed ? [] : ["Renderer-backed product demo browser validation is incomplete"]),
    ...(browserReportPassed ? [] : ["Browser example report is incomplete or failed"]),
    ...(visualReportPassed ? [] : ["Visual aggregate report is incomplete or failed"]),
    ...(visualBrowserReportPassed ? [] : ["Visual browser report is incomplete or failed"]),
    ...(performanceReportPassed ? [] : ["Performance report is incomplete or failed"]),
    ...(pbrEnvironmentReportPassed ? [] : ["PBR environment validation report is incomplete or failed"])
  ];
  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.A3D_RELEASE_RUN_ID ?? "standalone-demo-validation-run",
    examples: [...requiredExamples],
    upstreamReports,
    browserReadyExamples,
    productBrowserReadyExamples,
    visualPixelExamples,
    missingBrowserReadyExamples,
    missingProductBrowserReadyExamples,
    missingVisualPixelExamples,
    interactionMetricsPassed,
    productRendererBackedPassed,
    browserReportPassed,
    visualReportPassed,
    visualBrowserReportPassed,
    performanceReportPassed,
    pbrEnvironmentReportPassed,
    violations
  };
}

function writeReport(report: FinalDemoValidationReport): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateFinalDemos();
  writeReport(report);
  console.log(JSON.stringify({
    ok: report.ok,
    examples: report.examples.length,
    browserReadyExamples: report.browserReadyExamples.length,
    visualPixelExamples: report.visualPixelExamples.length,
    violations: report.violations.length
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
