import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPORT_PATH = "tests/reports/current-routes-legacy-prune.json";
const promptScene = ["prompt", "to", "scene"].join("-");

const archivedRuntimeAppDirs = new Set([
  "aura-cinematic-prompt-lab",
  `aura-${promptScene}`,
  "aura-scene-diff-editor",
  "aura-shot-director",
  "aura-world-builder",
  `cinematic-${promptScene}`,
]);

const archivedRuntimeRoutePrefixes = [
  "/apps/aura-cinematic-prompt-lab/",
  `/apps/aura-${promptScene}/`,
  "/apps/aura-scene-diff-editor/",
  "/apps/aura-shot-director/",
  "/apps/aura-world-builder/",
  `/apps/cinematic-${promptScene}/`,
] as const;

export function createCurrentRoutesLegacyPruneReport(): Record<string, unknown> {
  const appDirs = existsSync(resolve("apps"))
    ? readdirSync(resolve("apps"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  const unexpectedAppDirs = appDirs.filter((dir) => archivedRuntimeAppDirs.has(dir));
  const rootLinks = readRootRouteLinks();
  const disallowedRootLinks = rootLinks.filter((href) => archivedRuntimeRoutePrefixes.some((prefix) => href.startsWith(prefix)));
  const exampleRootExists = existsSync(resolve("examples"));
  const checks = [
    {
      id: "examples-root-pruned",
      pass: !exampleRootExists,
      detail: exampleRootExists ? "examples/ still exists" : "examples/ is absent",
    },
    {
      id: "apps-allowlist-only",
      pass: unexpectedAppDirs.length === 0,
      detail: unexpectedAppDirs.length === 0 ? "apps/ does not contain archived runtime route directories" : unexpectedAppDirs.join(", "),
    },
    {
      id: "root-links-allowlist-only",
      pass: disallowedRootLinks.length === 0,
      detail: disallowedRootLinks.length === 0 ? "root registry does not link archived runtime routes" : disallowedRootLinks.join(", "),
    },
  ] as const;
  const failures = checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`);
  return {
    schema: "a3d-current-routes-legacy-prune",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    archivedRuntimeAppDirs: [...archivedRuntimeAppDirs].sort(),
    rootLinks,
    checks,
    failures,
  };
}

export function writeCurrentRoutesLegacyPruneReport(report: Record<string, unknown>): void {
  mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
  writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
}

function readRootRouteLinks(): string[] {
  if (!existsSync(resolve("index.html"))) return [];
  const html = readFileSync(resolve("index.html"), "utf8");
  return Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1] ?? "").filter(Boolean).sort();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createCurrentRoutesLegacyPruneReport();
  writeCurrentRoutesLegacyPruneReport(report);
  if (report.pass !== true) {
    const failures = Array.isArray(report.failures) ? report.failures.join("\n") : "unknown failure";
    throw new Error(`CurrentRoutes legacy prune failed:\n${failures}`);
  }
  console.log(`CurrentRoutes legacy prune passed. Report: ${REPORT_PATH}`);
}
