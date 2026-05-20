import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const reportPath = "tests/reports/engine-readiness-truth.json";
const quarantinedExamples = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
  "material-showroom",
  "postprocess-lab",
  "shadow-lab",
  "large-world-streaming",
  "portfolio"
];

const checks = [
  ...quarantinedExamples.map((name) => ({
    id: `quarantined:${name}`,
    ok: existsSync(`examples/_quarantine/${name}`),
    evidence: `examples/_quarantine/${name}`
  })),
  {
    id: "quarantine-readme",
    ok: existsSync("examples/_quarantine/README.md"),
    evidence: "examples/_quarantine/README.md"
  },
  {
    id: "public-index-engine-readiness",
    ok: readFileIfExists("examples/index.html").includes("Engine readiness examples") &&
      !readFileIfExists("examples/index.html").includes("./portfolio/main.js"),
    evidence: "examples/index.html"
  },
  {
    id: "engine-readiness-status-doc",
    ok: readFileIfExists("docs/project/v4-engine-readiness-status.md").includes("pnpm engine-readiness:root"),
    evidence: "docs/project/v4-engine-readiness-status.md"
  },
  {
    id: "stale-v4-completion-report-removed",
    ok: !existsSync("tests/reports/v4-completion-audit.json"),
    evidence: "tests/reports/v4-completion-audit.json"
  }
];

const report = {
  schemaVersion: "g3d-engine-readiness-truth-v1",
  generatedAt: new Date().toISOString(),
  ok: checks.every((check) => check.ok),
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

function readFileIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
