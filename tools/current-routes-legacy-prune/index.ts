import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPORT_PATH = "tests/reports/current-routes-legacy-prune.json";

interface LegacyEntry {
  readonly path: string;
  readonly phase: string;
  readonly reason: string;
  readonly replacement: string;
  readonly quarantinePath?: string;
}

const blockedLegacyPaths: readonly LegacyEntry[] = [
  { path: "examples/product-configurator/", phase: "docs/project/implementation-plan.md/docs/project/implementation-plan.md", reason: "Unversioned product demo was replaced by versioned product viewer routes.", replacement: "examples/three-compat-examples/product-configurator/", quarantinePath: "examples/_quarantine/product-configurator/" },
  { path: "examples/postprocess-lab/", phase: "docs/project/implementation-plan.md/docs/project/implementation-plan.md", reason: "Unversioned postprocess lab was replaced by versioned postprocess examples.", replacement: "examples/three-compat-examples/postprocess-bloom/", quarantinePath: "examples/_quarantine/postprocess-lab/" },
  { path: "examples/shadow-lab/", phase: "docs/project/implementation-plan.md", reason: "Unversioned shadow lab is legacy renderer evidence.", replacement: "examples/three-compat-examples/architecture-interior/", quarantinePath: "examples/_quarantine/shadow-lab/" },
  { path: "examples/portfolio/", phase: "docs/project/product-studio-product-asset-pipeline-plan.md", reason: "Static screenshot portfolio must not be used as product proof.", replacement: "tests/reports/current-routes/", quarantinePath: "examples/_quarantine/portfolio/" },
  { path: "examples/architecture-viewer/", phase: "docs/project/implementation-plan.md", reason: "Unversioned architecture viewer was replaced by versioned architecture routes.", replacement: "apps/architecture-viewer/", quarantinePath: "examples/_quarantine/architecture-viewer/" },
  { path: "examples/game-slice/", phase: "docs/project/implementation-plan.md", reason: "Legacy game slice is not a CurrentRoutes product claim.", replacement: "none", quarantinePath: "examples/_quarantine/game-slice/" },
  { path: "examples/portfolio/screenshots/", phase: "docs/project/product-studio-product-asset-pipeline-plan.md", reason: "Old static screenshots are failed evidence.", replacement: "tests/reports/current-routes/" }
] as const;

const retainedHistoricalArtifacts = [
  "tests/reports/example-portfolio-screenshots/",
  "tests/reports/external-gallery/",
  "tests/reports/three-compat-gallery/",
  "tests/reports/production-runtime-gallery/",
  "tests/reports/runtime-parity/"
] as const;

const currentEvidenceFiles = [
  "index.html",
  "tests/reports/current-routes-route-health.json",
  "tests/reports/current-routes-animation-examples.json",
  "tests/reports/flagship-viewer.json",
  "tests/reports/current-routes-threejs-parity.json",
  "tests/reports/current-routes-visual-review.json",
  "tests/reports/current-routes-completion-audit.json",
  "docs/project/current-state.md",
  "docs/project/compatibility.md",
  "docs/project/threejs-parity-parity-matrix.md",
  "docs/project/threejs-parity-parity-matrix.md",
  "docs/project/threejs-parity-status.md",
  "docs/project/claim-guidelines.md"
] as const;

const staleEvidencePatterns = [
  "examples/portfolio/screenshots/",
  "tests/reports/example-portfolio-screenshots/",
  "examples/product-configurator/",
  "examples/postprocess-lab/",
  "examples/shadow-lab/",
  "examples/architecture-viewer/",
  "examples/game-slice/"
] as const;

export function createCurrentRoutesLegacyPruneReport(): Record<string, unknown> {
  const deleted = blockedLegacyPaths.map((entry) => {
    const exists = existsSync(resolve(entry.path));
    return {
      ...entry,
      exists,
      pass: !exists,
      detail: exists ? `${entry.path} returned outside quarantine` : `${entry.path} remains deleted outside quarantine`
    };
  });

  const quarantined = blockedLegacyPaths
    .filter((entry) => entry.quarantinePath)
    .map((entry) => {
      const quarantinePath = entry.quarantinePath ?? "";
      return {
        sourcePath: entry.path,
        quarantinePath,
        exists: existsSync(resolve(quarantinePath)),
        allowedAsProductEvidence: false
      };
    });

  const retained = retainedHistoricalArtifacts.map((path) => ({
    path,
    exists: existsSync(resolve(path)),
    fileCount: existsSync(resolve(path)) ? countFiles(path) : 0,
    allowedAsCurrentEvidence: false,
    retention: "historical, comparison, or regression material only"
  }));

  const rootLinks = readRootRouteLinks();
  const obsoleteRootLinks = rootLinks.filter((link) => staleEvidencePatterns.some((pattern) => link.href.includes(pattern) || link.path.includes(pattern)));
  const internalStressLinks = rootLinks.filter((link) => link.path === "/apps/example-parity-lab/" && link.linked);
  const currentEvidenceReferences = scanCurrentEvidenceReferences();
  const quarantineReadme = readTextIfExists("examples/_quarantine/README.md");
  const quarantineReadmePass = /not public product demos/i.test(quarantineReadme) && /not use screenshots/i.test(quarantineReadme);

  const checks = [
    ...deleted.map((entry) => ({
      id: `deleted:${entry.path}`,
      pass: entry.pass,
      detail: entry.detail
    })),
    {
      id: "root-links-no-obsolete-routes",
      pass: obsoleteRootLinks.length === 0,
      detail: obsoleteRootLinks.length === 0 ? "Root route registry does not link obsolete examples." : `${obsoleteRootLinks.length} obsolete root link(s) found.`
    },
    {
      id: "root-links-no-runtime-parity-parity-lab-working-link",
      pass: internalStressLinks.length === 0,
      detail: internalStressLinks.length === 0 ? "RuntimeParity parity lab is not linked as a working route." : "RuntimeParity parity lab is linked as a working route."
    },
    {
      id: "current-evidence-no-stale-screenshots",
      pass: currentEvidenceReferences.length === 0,
      detail: currentEvidenceReferences.length === 0 ? "Current CurrentRoutes evidence does not reference stale screenshot sets." : `${currentEvidenceReferences.length} stale current-evidence reference(s) found.`
    },
    {
      id: "quarantine-readme",
      pass: quarantineReadmePass,
      detail: "examples/_quarantine/README.md must say quarantined examples are not product demos or screenshot evidence."
    }
  ];

  const failures = checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`);

  return {
    schema: "a3d-current-routes-legacy-prune",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    deleted,
    quarantined,
    retained,
    blocked: {
      rootLinks: obsoleteRootLinks,
      currentEvidenceReferences,
      internalStressLinks
    },
    checks,
    failures
  };
}

export function writeCurrentRoutesLegacyPruneReport(report: Record<string, unknown>): void {
  mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
  writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
}

function countFiles(path: string): number {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) return 0;
  const stats = statSync(absolutePath);
  if (stats.isFile()) return 1;
  if (!stats.isDirectory()) return 0;
  return readdirSync(absolutePath, { withFileTypes: true })
    .reduce((count, entry) => {
      const child = relative(process.cwd(), resolve(absolutePath, entry.name));
      return count + (entry.isDirectory() ? countFiles(child) : entry.isFile() ? 1 : 0);
    }, 0);
}

function readRootRouteLinks(): Array<{ readonly href: string; readonly path: string; readonly linked: boolean }> {
  const html = readTextIfExists("index.html");
  const links: Array<{ href: string; path: string; linked: boolean }> = [];
  for (const match of html.matchAll(/href=["']([^"']+)["']/g)) {
    const href = match[1] ?? "";
    links.push({ href, path: normalizeRoutePath(href), linked: true });
  }
  for (const match of html.matchAll(/path:\s*["']([^"']+)["']/g)) {
    const path = match[1] ?? "";
    const routeObject = routeObjectForPath(html, path);
    const internal = /internal:\s*true/.test(routeObject);
    const blocked = /status:\s*["']blocked["']/.test(routeObject);
    links.push({ href: path, path: normalizeRoutePath(path), linked: !internal && !blocked });
  }
  return links;
}

function scanCurrentEvidenceReferences(): Array<{ readonly file: string; readonly pattern: string }> {
  const references: Array<{ file: string; pattern: string }> = [];
  for (const file of currentEvidenceFiles) {
    if (!existsSync(resolve(file))) continue;
    const text = readTextIfExists(file);
    for (const pattern of staleEvidencePatterns) {
      if (text.includes(pattern)) references.push({ file, pattern });
    }
  }
  return references;
}

function readTextIfExists(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

function normalizeRoutePath(href: string): string {
  try {
    const url = new URL(href, "http://localhost:5180");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function routeObjectForPath(html: string, path: string): string {
  const pathIndex = html.indexOf(`path: "${path}"`);
  if (pathIndex < 0) return "";
  const objectStart = html.lastIndexOf("{", pathIndex);
  const objectEnd = html.indexOf("}", pathIndex);
  if (objectStart < 0 || objectEnd < 0 || objectEnd <= objectStart) return "";
  return html.slice(objectStart, objectEnd + 1);
}

async function main(): Promise<void> {
  const report = createCurrentRoutesLegacyPruneReport();
  writeCurrentRoutesLegacyPruneReport(report);
  if (report.pass !== true) {
    console.error(`CurrentRoutes legacy prune failed. Report: ${REPORT_PATH}`);
    const failures = Array.isArray(report.failures) ? report.failures : [];
    for (const failure of failures) console.error(`- ${String(failure)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CurrentRoutes legacy prune passed. Report: ${REPORT_PATH}`);
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (isCli) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
