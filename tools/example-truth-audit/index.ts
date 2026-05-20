import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { baseReport, listFiles } from "../v3-reporting/index.js";

export interface ExampleTruthAuditEntry {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly screenshotPath: string;
  readonly browserTestPaths: readonly string[];
  readonly hasKnownLimitNote: boolean;
  readonly violations: readonly string[];
}

export interface ExampleTruthAuditReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly command: string;
  readonly sourceFileHashes: readonly { readonly path: string; readonly sha256: string }[];
  readonly blockedClaims: readonly string[];
  readonly screenshotPaths: readonly string[];
  readonly violations: readonly string[];
  readonly examples: readonly ExampleTruthAuditEntry[];
}

const reportPath = "tests/reports/v3-example-truth-audit.json";

export function auditExampleTruth(root = process.cwd()): ExampleTruthAuditReport {
  const portfolioPath = "examples/portfolio/main.ts";
  const portfolioText = readFileSync(join(root, portfolioPath), "utf8");
  const browserTestPaths = listFiles(root, ["tests/browser"], [".ts"]);
  const browserTestTexts = new Map(browserTestPaths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  const examples = parsePortfolioExamples(portfolioText).map((example) => {
    const screenshotPath = `examples/portfolio/screenshots/${example.id}.png`;
    const browserMatches = [...browserTestTexts]
      .filter(([, text]) => text.includes(example.id))
      .map(([path]) => path);
    const hasKnownLimitNote = /not |lacks |future work|not a |remain|limited|unclaimed|bounded/i.test(example.caveat);
    const violations = [
      ...(existsSync(join(root, screenshotPath)) ? [] : [`Missing portfolio screenshot: ${screenshotPath}`]),
      ...(browserMatches.length > 0 ? [] : [`Missing browser test reference for portfolio example: ${example.id}`]),
      ...(hasKnownLimitNote ? [] : [`Missing current known-limit note for portfolio example: ${example.id}`]),
    ];
    return {
      id: example.id,
      title: example.title,
      href: example.href,
      screenshotPath,
      browserTestPaths: browserMatches,
      hasKnownLimitNote,
      violations,
    };
  });
  const violations = examples.flatMap((entry) => entry.violations);
  const base = baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:v3-code",
    runIdPrefix: "v3-example-truth-audit",
    sourceFiles: [portfolioPath, ...browserTestPaths, ...examples.map((entry) => entry.screenshotPath)],
    screenshotPaths: examples.map((entry) => entry.screenshotPath),
    violations,
  });
  return {
    ...base,
    examples,
  };
}

export function writeExampleTruthAuditReport(root: string, report: ExampleTruthAuditReport): void {
  const absolutePath = join(root, reportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

function parsePortfolioExamples(text: string): Array<{ readonly id: string; readonly title: string; readonly href: string; readonly caveat: string }> {
  const examples: Array<{ id: string; title: string; href: string; caveat: string }> = [];
  const blockPattern = /\{\s*id:\s*"([^"]+)",[\s\S]*?title:\s*"([^"]+)",[\s\S]*?href:\s*"([^"]+)",[\s\S]*?caveat:\s*"([^"]+)"(?:,)?[\s\S]*?\}/g;
  for (const match of text.matchAll(blockPattern)) {
    examples.push({
      id: match[1] ?? "",
      title: match[2] ?? "",
      href: match[3] ?? "",
      caveat: match[4] ?? "",
    });
  }
  return examples;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = auditExampleTruth();
  writeExampleTruthAuditReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    examples: report.examples.length,
    violations: report.violations.length,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
