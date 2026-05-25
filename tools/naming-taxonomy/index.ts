import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CONTEXTUAL_FIXTURE_ALIASES,
  CONTEXTUAL_REPORT_ALIASES,
  CONTEXTUAL_ROUTE_ALIASES
} from "./contextualAliases";

export type MigrationClassification =
  | "public-api"
  | "active-route"
  | "fixture-url"
  | "report-path"
  | "test-harness"
  | "internal-tool"
  | "historical-archive"
  | "temporary-artifact";

export interface VersionedPathRecord {
  readonly path: string;
  readonly root: string;
  readonly version: string;
  readonly classification: MigrationClassification;
  readonly target?: string;
  readonly archivalReason?: string;
  readonly compatibilityDecision: string;
}

export interface ActiveReferenceRecord {
  readonly kind:
    | "fixture-url"
    | "package-export"
    | "package-file-entry"
    | "report-reader"
    | "route-link"
    | "script"
    | "source-import"
    | "tsconfig-alias"
    | "vite-alias"
    | "vitest-alias";
  readonly source: string;
  readonly reference: string;
  readonly classification: MigrationClassification;
  readonly target?: string;
  readonly archivalReason?: string;
  readonly compatibilityDecision: string;
}

export interface MigrationReportData {
  readonly generatedDate: string;
  readonly scannedRoots: readonly string[];
  readonly versionedPaths: readonly VersionedPathRecord[];
  readonly versionedDirectories: readonly VersionedPathRecord[];
  readonly activeReferences: readonly ActiveReferenceRecord[];
  readonly rootCounts: Readonly<Record<string, number>>;
  readonly directoryRootCounts: Readonly<Record<string, number>>;
  readonly classificationCounts: Readonly<Record<string, number>>;
  readonly directoryClassificationCounts: Readonly<Record<string, number>>;
  readonly activeReferenceCounts: Readonly<Record<string, number>>;
}

export const REPORT_PATH = "docs/project/naming-taxonomy-migration-report.md";
export const SCANNED_ROOTS = [
  ".github",
  "apps",
  "docs",
  "examples",
  "fixtures",
  "packages",
  "release-artifacts",
  "templates",
  "tests",
  "tools"
] as const;

const VERSIONED_PATH_PATTERN = /(^|\/|[-_])v([0-9]+)(?=$|[-_/.])/;
const VERSIONED_TEXT_PATTERN = /(^|[^A-Za-z0-9])v[0-9]+(?=$|[^A-Za-z0-9])/;
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

const ARCHIVAL_REASON = "Historical phase evidence or roadmap record; retain the versioned path to preserve provenance until a scoped owner approves a rename batch.";
const RELEASE_ARCHIVE_REASON = "Frozen release handoff artifact; retain the versioned path because hashes, tarballs, and external restore instructions are archival evidence.";
const REPORT_ARCHIVE_REASON = "Generated evidence path; retain until all current and historical report readers have contextual aliases and fixture/report hash expectations are updated.";
const PHASE_SCRIPT_NAMES: Readonly<Record<string, string>> = {
  v2: "product-studio",
  v3: "foundation",
  v4: "external-parity",
  v5: "three-compat",
  v6: "production-runtime",
  v8: "current-routes",
  v9: "threejs-parity",
  v10: "superiority"
};

export function isVersionStylePath(path: string): boolean {
  return VERSIONED_PATH_PATTERN.test(toPosix(path));
}

export function classifyVersionedPath(path: string): VersionedPathRecord {
  const normalized = toPosix(path);
  const root = rootOf(normalized);
  const version = firstVersion(normalized);

  if (normalized.includes("/dist/") || normalized.includes("/.turbo/") || normalized.includes("/coverage/")) {
    return {
      path: normalized,
      root,
      version,
      classification: "temporary-artifact",
      archivalReason: "Generated build/cache artifact; exclude from product taxonomy and regenerate from renamed source if a later build batch moves it.",
      compatibilityDecision: "Do not rename directly; clean or regenerate as part of build output management."
    };
  }

  if (root === "release-artifacts") {
    return {
      path: normalized,
      root,
      version,
      classification: "historical-archive",
      archivalReason: RELEASE_ARCHIVE_REASON,
      compatibilityDecision: "Do not rename inside frozen handoff artifacts; use a new contextual handoff if a future release needs one."
    };
  }

  if (root === "docs") {
    if (normalized.startsWith("docs/project/tutorials-v")) {
      return targetRecord(normalized, root, version, "public-api", contextualizePath(normalized), "Public tutorial filename; add docs redirects or index aliases before moving.");
    }
    return {
      path: normalized,
      root,
      version,
      classification: "historical-archive",
      archivalReason: ARCHIVAL_REASON,
      compatibilityDecision: "Leave versioned project docs in place until a docs archive index and redirects exist."
    };
  }

  if (root === ".github") {
    return targetRecord(normalized, root, version, "internal-tool", contextualizePath(normalized), "Workflow filename; update badges, docs, and external handoff references in the same batch.");
  }

  if (root === "apps") {
    const segment = normalized.split("/")[1] ?? "";
    const classification: MigrationClassification = segment.endsWith("-common") ? "internal-tool" : "active-route";
    const decision = classification === "active-route"
      ? "Public/local Vite route; add route redirects or route registry aliases before moving."
      : "Shared app module; rename only with every import and route consumer in the same batch.";
    return targetRecord(normalized, root, version, classification, contextualizePath(normalized), decision);
  }

  if (root === "examples") {
    return targetRecord(normalized, root, version, "public-api", contextualizePath(normalized), "Public example path; keep URL/docs aliases or document removal before moving.");
  }

  if (root === "fixtures") {
    return targetRecord(normalized, root, version, "fixture-url", contextualFixtureTarget(normalized), "Fixture fetch URL; add manifest aliases or update all consumers in one batch.");
  }

  if (root === "packages") {
    return targetRecord(normalized, root, version, "public-api", contextualPackageTarget(normalized), "Package source/template surface; keep package export aliases and TypeScript path aliases through a deprecation window.");
  }

  if (root === "templates") {
    return targetRecord(normalized, root, version, "public-api", contextualizePath(normalized), "Published starter template path; keep create-g3d/template aliases or document removal before moving.");
  }

  if (root === "tests") {
    if (normalized.startsWith("tests/reports/")) {
      return targetRecord(normalized, root, version, "report-path", contextualReportTarget(normalized), "Generated evidence path; keep report-reader compatibility before moving.");
    }
    return targetRecord(normalized, root, version, "test-harness", contextualizePath(normalized), "Test harness path; rename only with scripts, imports, snapshots, and CI references.");
  }

  if (root === "tools") {
    return targetRecord(normalized, root, version, "internal-tool", contextualToolTarget(normalized), "Tool path; add package script compatibility aliases and update docs before moving.");
  }

  return targetRecord(normalized, root, version, "internal-tool", contextualizePath(normalized), "Uncategorized scoped path; requires owner review before rename.");
}

export function buildMigrationReportData(rootDir = process.cwd(), generatedDate = todayIsoDate()): MigrationReportData {
  const trackedFiles = listTrackedFiles(rootDir);
  const scopedFiles = trackedFiles.filter(isInScannedScope);
  const versionedPaths = scopedFiles
    .filter(isVersionStylePath)
    .map(classifyVersionedPath)
    .sort((a, b) => a.path.localeCompare(b.path));
  const versionedDirectories = directoriesFromFiles(scopedFiles)
    .filter(isVersionStylePath)
    .map(classifyVersionedPath)
    .sort((a, b) => a.path.localeCompare(b.path));
  const activeReferences = extractActiveReferences(readActiveReferenceSources(rootDir, trackedFiles));
  return {
    generatedDate,
    scannedRoots: SCANNED_ROOTS,
    versionedPaths,
    versionedDirectories,
    activeReferences,
    rootCounts: countBy(versionedPaths, (entry) => entry.root),
    directoryRootCounts: countBy(versionedDirectories, (entry) => entry.root),
    classificationCounts: countBy(versionedPaths, (entry) => entry.classification),
    directoryClassificationCounts: countBy(versionedDirectories, (entry) => entry.classification),
    activeReferenceCounts: countBy(activeReferences, (entry) => entry.kind)
  };
}

export function extractActiveReferences(files: readonly { readonly path: string; readonly text: string }[]): ActiveReferenceRecord[] {
  const records: ActiveReferenceRecord[] = [...contextualAliasReferences()];
  for (const file of files) {
    records.push(...extractPackageJsonReferences(file));
    records.push(...extractTsconfigReferences(file));
    records.push(...extractViteReferences(file));
    records.push(...extractVitestReferences(file));
    records.push(...extractImportReferences(file));
    records.push(...extractPathLikeReferences(file));
  }
  return dedupeReferences(records).sort((a, b) =>
    `${a.kind}\0${a.source}\0${a.reference}`.localeCompare(`${b.kind}\0${b.source}\0${b.reference}`)
  );
}

function contextualAliasReferences(): ActiveReferenceRecord[] {
  return [
    ...CONTEXTUAL_ROUTE_ALIASES.map((alias) => ({
      kind: "route-link" as const,
      source: "tools/naming-taxonomy/contextualAliases.ts:CONTEXTUAL_ROUTE_ALIASES",
      reference: alias.legacy,
      classification: "active-route" as const,
      target: alias.contextual,
      compatibilityDecision: alias.reason
    })),
    ...CONTEXTUAL_FIXTURE_ALIASES.map((alias) => ({
      kind: "fixture-url" as const,
      source: "tools/naming-taxonomy/contextualAliases.ts:CONTEXTUAL_FIXTURE_ALIASES",
      reference: alias.legacy,
      classification: "fixture-url" as const,
      target: alias.contextual,
      compatibilityDecision: alias.reason
    })),
    ...CONTEXTUAL_REPORT_ALIASES.map((alias) => ({
      kind: "report-reader" as const,
      source: "tools/naming-taxonomy/contextualAliases.ts:CONTEXTUAL_REPORT_ALIASES",
      reference: alias.legacy,
      classification: "report-path" as const,
      target: alias.contextual,
      compatibilityDecision: alias.reason
    }))
  ];
}

export function renderMigrationReport(data: MigrationReportData): string {
  const pathRows = data.versionedPaths.map((entry) => [
    entry.path,
    entry.classification,
    entry.target ?? entry.archivalReason ?? "BLOCKED: no target or archival reason classified",
    entry.compatibilityDecision
  ]);
  const activeRows = data.activeReferences.map((entry) => [
    entry.kind,
    entry.source,
    entry.reference,
    entry.classification,
    entry.target ?? entry.archivalReason ?? "BLOCKED: no target or archival reason classified",
    entry.compatibilityDecision
  ]);
  const directoryRows = data.versionedDirectories.map((entry) => [
    entry.path,
    entry.classification,
    entry.target ?? entry.archivalReason ?? "BLOCKED: no target or archival reason classified",
    entry.compatibilityDecision
  ]);

  return [
    "# Naming Taxonomy Migration Report",
    "",
    `Generated: ${data.generatedDate}`,
    "",
    "This report is generated by `pnpm exec tsx --tsconfig tsconfig.base.json tools/naming-taxonomy/index.ts --write`. It inventories repository version-style paths under the migration scope and classifies load-bearing active references. It does not approve or perform a rename.",
    "",
    "## Summary",
    "",
    `- Version-style repository file paths inventoried: ${data.versionedPaths.length}`,
    `- Version-style repository directory paths inventoried: ${data.versionedDirectories.length}`,
    `- Active reference records classified: ${data.activeReferences.length}`,
    "- Rename action in this report: none",
    "- Compatibility posture: contextual app route, package, script, fixture, and report aliases exist; old versioned surfaces remain compatibility aliases, test harnesses, or archival records until each owner batch removes them.",
    "",
    "### Counts By Root",
    "",
    renderSimpleTable(["Root", "Count"], Object.entries(data.rootCounts).sort(([a], [b]) => a.localeCompare(b))),
    "",
    "### Counts By Classification",
    "",
    renderSimpleTable(["Classification", "Count"], Object.entries(data.classificationCounts).sort(([a], [b]) => a.localeCompare(b))),
    "",
    "### Directory Counts By Root",
    "",
    renderSimpleTable(["Root", "Count"], Object.entries(data.directoryRootCounts).sort(([a], [b]) => a.localeCompare(b))),
    "",
    "### Directory Counts By Classification",
    "",
    renderSimpleTable(["Classification", "Count"], Object.entries(data.directoryClassificationCounts).sort(([a], [b]) => a.localeCompare(b))),
    "",
    "### Active Reference Counts",
    "",
    renderSimpleTable(["Kind", "Count"], Object.entries(data.activeReferenceCounts).sort(([a], [b]) => a.localeCompare(b))),
    "",
    "## Compatibility Decisions",
    "",
    "- Public package exports and TypeScript/Vite/Vitest aliases now include contextual production-runtime, advanced-runtime, asset-corpus, advanced-gallery, and workflows/production names. Legacy `/v6` and `/v9` exports remain compatibility aliases and are covered by focused import parity tests.",
    "- Public app route URLs now have contextual `/apps/<capability>/` aliases for the current V5/V6/V7/V8/V9 surfaces while the old `/apps/v*` URLs remain Vite compatibility aliases for historical links and tests.",
    "- Versioned package scripts now have contextual command aliases such as `production-runtime:*`, `current-routes:*`, `threejs-parity:*`, and `superiority:*`; old `v*` script names remain wrappers for compatibility.",
    "- Current advanced-gallery fixture fetch URLs use contextual fixture prefixes where the Vite alias layer can map them to existing `fixtures/v*` files. Legacy fixture paths remain compatibility aliases and are covered by browser byte-hash tests for the first alias batch.",
    "- `tests/reports/advanced-examples-gallery` is the contextual advanced-gallery evidence directory. The visual-review and report-audit tools both accept `--report-dir` and fall back to the historical `tests/reports/v9/advanced-examples-gallery` directory for old report sets.",
    "- Historical project docs, release handoffs, and older generated reports are archival records, not rename candidates, unless an owning migration batch explicitly reclassifies them.",
    "",
    "## Checklist Evidence",
    "",
    "- Provable now: every repository version-style file path under the scoped roots and every version-style directory implied by those files has a row below with a contextual target or an archival/generated-artifact reason.",
    "- Provable now: active package exports, package file entries, TypeScript/Vitest aliases, scripts, route links, fixture URLs, report readers, and versioned imports detected by this tool are classified below.",
    "- Provable now: the current advanced-gallery alias batch has focused browser route, fixture-byte, package import/export, and report-reader fallback coverage.",
    "- Remaining version-style hits are retained as classified compatibility aliases, test harnesses, generated report records, or historical archive records until the owning migration batch removes them.",
    "- Raw `rg \"v[0-9]\"` remains intentionally non-empty because compatibility aliases and archival records still exist; use this generated report as the classifier for those hits before removal.",
    "",
    "## Active Reference Classification",
    "",
    "```tsv",
    ["kind", "source", "reference", "classification", "target_or_archival_reason", "compatibility_decision"].join("\t"),
    ...activeRows.map((row) => row.map(tsvCell).join("\t")),
    "```",
    "",
    "## Version-Style Directory Path Inventory",
    "",
    "```tsv",
    ["path", "classification", "target_or_archival_reason", "compatibility_decision"].join("\t"),
    ...directoryRows.map((row) => row.map(tsvCell).join("\t")),
    "```",
    "",
    "## Version-Style File Path Inventory",
    "",
    "```tsv",
    ["path", "classification", "target_or_archival_reason", "compatibility_decision"].join("\t"),
    ...pathRows.map((row) => row.map(tsvCell).join("\t")),
    "```",
    ""
  ].join("\n");
}

function targetRecord(
  path: string,
  root: string,
  version: string,
  classification: MigrationClassification,
  target: string,
  compatibilityDecision: string
): VersionedPathRecord {
  return { path, root, version, classification, target, compatibilityDecision };
}

function contextualFixtureTarget(path: string): string {
  if (path.startsWith("fixtures/v9/assets/")) return path.replace("fixtures/v9/assets/", "fixtures/advanced-gallery/assets/");
  if (path.startsWith("fixtures/v9/environments/")) return path.replace("fixtures/v9/environments/", "fixtures/advanced-gallery/environments/");
  if (path.startsWith("fixtures/v8/assets/")) return path.replace("fixtures/v8/assets/", "fixtures/threejs-parity/assets/");
  if (path.startsWith("fixtures/v6/assets/corpus/")) return path.replace("fixtures/v6/assets/corpus/", "fixtures/asset-corpus/");
  if (path.startsWith("fixtures/v6/environments/")) return path.replace("fixtures/v6/environments/", "fixtures/environment-corpus/");
  return contextualizePath(path);
}

function contextualPackageTarget(path: string): string {
  const replacements: Readonly<Record<string, string>> = {
    v4: "workflow-foundation",
    v5: "threejs-compatibility",
    v6: "production-runtime",
    v8: "threejs-example-parity",
    v9: "advanced-runtime"
  };
  const parts = path.split("/");
  const mapped = parts.map((part, index) => {
    if ((parts[index - 1] === "src" || parts[index - 1] === "dist") && replacements[part]) return replacements[part];
    return part;
  });
  return contextualizePath(mapped.join("/"));
}

function contextualReportTarget(path: string): string {
  if (path === "tests/reports/v9/advanced-examples-gallery") {
    return "tests/reports/advanced-examples-gallery";
  }
  if (path.startsWith("tests/reports/v9/advanced-examples-gallery/")) {
    return path.replace("tests/reports/v9/advanced-examples-gallery/", "tests/reports/advanced-examples-gallery/");
  }
  if (path === "tests/reports/v7") return "tests/reports/runtime-parity";
  if (path.startsWith("tests/reports/v7/")) return path.replace("tests/reports/v7/", "tests/reports/runtime-parity/");
  if (path === "tests/reports/v8") return "tests/reports/current-routes";
  if (path.startsWith("tests/reports/v8/")) return path.replace("tests/reports/v8/", "tests/reports/current-routes/");
  if (path === "tests/reports/v9") return "tests/reports/threejs-parity";
  if (path.startsWith("tests/reports/v9/")) return path.replace("tests/reports/v9/", "tests/reports/threejs-parity/");
  if (path.startsWith("tests/reports/v2-product-studio")) return path.replace("tests/reports/v2-product-studio", "tests/reports/product-studio");
  if (/^tests\/reports\/v3(?=$|[-/.])/.test(path)) return path.replace("tests/reports/v3", "tests/reports/foundation");
  if (/^tests\/reports\/v4(?=$|[-/.])/.test(path)) return path.replace("tests/reports/v4", "tests/reports/external-parity");
  if (/^tests\/reports\/v[0-9]+-/.test(path)) return contextualizePath(path);
  return path.replace(/^tests\/reports\/v([0-9]+)\//, "tests/reports/phase-$1-archive/");
}

function contextualToolTarget(path: string): string {
  if (path.startsWith("tools/v9-advanced-gallery-")) return path.replace("tools/v9-advanced-gallery-", "tools/advanced-gallery-");
  return contextualizePath(path);
}

function contextualizePath(path: string): string {
  return toPosix(path)
    .replace(/(^|\/)v[0-9]+-/g, "$1")
    .replace(/-v[0-9]+(?=\/|\.|$)/g, "")
    .replace(/\/v[0-9]+(?=\/)/g, "/")
    .replace(/V[0-9]+/g, "")
    .replace(/\/+/g, "/");
}

function extractPackageJsonReferences(file: { readonly path: string; readonly text: string }): ActiveReferenceRecord[] {
  if (!file.path.endsWith("package.json")) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    return [];
  }

  const records: ActiveReferenceRecord[] = [];
  const root = asRecord(parsed);
  const files = Array.isArray(root.files) ? root.files.filter((entry): entry is string => typeof entry === "string") : [];
  for (const entry of files) {
    if (!VERSIONED_TEXT_PATTERN.test(entry)) continue;
    records.push({
      kind: "package-file-entry",
      source: `${file.path}:files`,
      reference: entry,
      classification: "public-api",
      target: contextualizePath(entry),
      compatibilityDecision: "Published package file allowlist; keep old template/file entries until contextual package contents and create-g3d aliases are proven."
    });
  }

  for (const [key, value] of flattenJsonStrings(root.exports, "exports")) {
    if (!VERSIONED_TEXT_PATTERN.test(key) && !VERSIONED_TEXT_PATTERN.test(value)) continue;
    records.push({
      kind: "package-export",
      source: `${file.path}:${key}`,
      reference: value,
      classification: "public-api",
      target: contextualPackageExportTarget(key, value),
      compatibilityDecision: "Public package export; keep the old export as a compatibility alias until a contextual subpath is added and smoke-tested."
    });
  }

  const scripts = asRecord(root.scripts);
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== "string") continue;
    if (!VERSIONED_TEXT_PATTERN.test(name) && !VERSIONED_TEXT_PATTERN.test(value)) continue;
    records.push({
      kind: "script",
      source: `${file.path}:scripts.${name}`,
      reference: `${name} = ${value}`,
      classification: "internal-tool",
      target: contextualScriptTarget(name, value),
      compatibilityDecision: "Package script command; keep old command as an alias until the contextual successor and downstream docs are in place."
    });
  }

  return records;
}

function extractTsconfigReferences(file: { readonly path: string; readonly text: string }): ActiveReferenceRecord[] {
  if (file.path !== "tsconfig.base.json") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    return [];
  }
  const paths = asRecord(asRecord(asRecord(parsed).compilerOptions).paths);
  return Object.entries(paths)
    .filter(([key, value]) => VERSIONED_TEXT_PATTERN.test(key) || VERSIONED_TEXT_PATTERN.test(JSON.stringify(value)))
    .map(([key, value]) => ({
      kind: "tsconfig-alias" as const,
      source: `${file.path}:compilerOptions.paths.${key}`,
      reference: `${key} -> ${JSON.stringify(value)}`,
      classification: "public-api" as const,
      target: contextualPackageExportTarget(key, JSON.stringify(value)),
      compatibilityDecision: "Workspace TypeScript alias; keep old alias until contextual package export and tests cover consumers."
    }));
}

function extractVitestReferences(file: { readonly path: string; readonly text: string }): ActiveReferenceRecord[] {
  if (file.path !== "vitest.config.ts") return [];
  return matchAll(file.text, /["']([^"']+)["']\s*:\s*new URL\(["']([^"']+)["']/g)
    .filter((match) => VERSIONED_TEXT_PATTERN.test(match[1] ?? "") || VERSIONED_TEXT_PATTERN.test(match[2] ?? ""))
    .map((match) => ({
      kind: "vitest-alias" as const,
      source: `${file.path}:resolve.alias.${match[1]}`,
      reference: `${match[1]} -> ${match[2]}`,
      classification: "public-api" as const,
      target: contextualPackageExportTarget(match[1] ?? "", match[2] ?? ""),
      compatibilityDecision: "Vitest alias mirrors public/workspace package names; keep old alias until contextual aliases and tests exist."
    }));
}

function extractViteReferences(file: { readonly path: string; readonly text: string }): ActiveReferenceRecord[] {
  if (file.path !== "vite.config.ts") return [];
  return matchAll(file.text, /\[\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\]/g)
    .filter((match) => VERSIONED_TEXT_PATTERN.test(match[1] ?? "") || VERSIONED_TEXT_PATTERN.test(match[2] ?? ""))
    .map((match) => ({
      kind: "vite-alias" as const,
      source: `${file.path}:aliasEntries.${match[1]}`,
      reference: `${match[1]} -> ${match[2]}`,
      classification: "public-api" as const,
      target: contextualPackageExportTarget(match[1] ?? "", match[2] ?? ""),
      compatibilityDecision: "Vite alias mirrors public/workspace package names; keep old alias until contextual aliases and browser route tests cover consumers."
    }));
}

function extractImportReferences(file: { readonly path: string; readonly text: string }): ActiveReferenceRecord[] {
  if (!/\.(cjs|js|jsx|mjs|ts|tsx)$/.test(file.path)) return [];
  return matchAll(file.text, /(?:from\s+|import\s*\(?\s*)["']([^"']*v[0-9][^"']*)["']/g)
    .filter((match) => looksPathLike(match[1] ?? ""))
    .map((match) => ({
      kind: "source-import" as const,
      source: file.path,
      reference: match[1] ?? "",
      classification: "test-harness" as const,
      target: contextualizePath(match[1] ?? ""),
      compatibilityDecision: "Versioned import path; update only with the corresponding file move and alias tests."
    }));
}

function extractPathLikeReferences(file: { readonly path: string; readonly text: string }): ActiveReferenceRecord[] {
  const records: ActiveReferenceRecord[] = [];
  const patterns: readonly { readonly kind: ActiveReferenceRecord["kind"]; readonly pattern: RegExp }[] = [
    { kind: "route-link", pattern: /\/?apps\/v[0-9][A-Za-z0-9_./-]*/g },
    { kind: "fixture-url", pattern: /fixtures\/v[0-9][A-Za-z0-9_./-]*/g },
    { kind: "report-reader", pattern: /tests\/reports\/v[0-9][A-Za-z0-9_./-]*/g }
  ];
  for (const { kind, pattern } of patterns) {
    for (const match of matchAll(file.text, pattern)) {
      const reference = trimReference(match[0] ?? "");
      if (!reference || !VERSIONED_TEXT_PATTERN.test(reference)) continue;
      if (kind === "report-reader" && !isReportReaderSource(file.path)) continue;
      records.push(referenceRecord(kind, file.path, reference));
    }
  }
  return records;
}

function referenceRecord(kind: ActiveReferenceRecord["kind"], source: string, reference: string): ActiveReferenceRecord {
  if (kind === "route-link") {
    return {
      kind,
      source,
      reference,
      classification: "active-route",
      target: contextualizePath(reference),
      compatibilityDecision: "Route URL/reference; add redirects or route registry aliases before changing the old URL."
    };
  }
  if (kind === "fixture-url") {
    return {
      kind,
      source,
      reference,
      classification: "fixture-url",
      target: contextualFixtureTarget(reference),
      compatibilityDecision: "Fixture URL/reference; add manifest aliases or update all consumers in the same batch."
    };
  }
  return {
    kind,
    source,
    reference,
    classification: "report-path",
    target: contextualReportTarget(reference),
    compatibilityDecision: "Report reader/reference; keep current generated evidence path until reader aliases support contextual paths."
  };
}

function contextualPackageExportTarget(key: string, value: string): string {
  const combined = `${key} ${value}`;
  if (combined.includes("/rendering/v9")) return "@galileo3d/engine/rendering/advanced-runtime";
  if (combined.includes("/rendering/v6")) return "@galileo3d/engine/rendering/production-runtime";
  if (combined.includes("/assets/v9")) return "@galileo3d/engine/assets/advanced-gallery";
  if (combined.includes("/assets/v6")) return "@galileo3d/engine/assets/asset-corpus";
  if (combined.includes("/workflows/v6")) return "@galileo3d/engine/workflows/production";
  if (combined.includes("/v9")) return "@galileo3d/engine/advanced-runtime";
  if (combined.includes("/v6")) return "@galileo3d/engine/production-runtime";
  return contextualizePath(value || key);
}

function contextualScriptTarget(name: string, value: string): string {
  const contextualName = contextualizeScriptName(name);
  const contextualValue = contextualizePath(value);
  return `${contextualName || name} = ${contextualValue}`;
}

function contextualizeScriptName(name: string): string {
  let output = name;
  for (const [version, contextual] of Object.entries(PHASE_SCRIPT_NAMES)) {
    if (output === version) output = contextual;
    output = output
      .replace(new RegExp(`^${version}:`), `${contextual}:`)
      .replace(new RegExp(`:${version}(?=[-:]|$)`, "g"), `:${contextual}`)
      .replace(new RegExp(`-${version}(?=[-:]|$)`, "g"), `-${contextual}`);
  }
  return output;
}

function readActiveReferenceSources(rootDir: string, trackedFiles: readonly string[]): { readonly path: string; readonly text: string }[] {
  return trackedFiles
    .filter(isActiveReferenceSource)
    .filter(isTextPath)
    .map((path) => ({ path, text: readFileSync(join(rootDir, path), "utf8") }));
}

function isActiveReferenceSource(path: string): boolean {
  if (path === "package.json" || path === "README.md" || path === "tsconfig.base.json" || path === "vite.config.ts" || path === "vitest.config.ts") return true;
  return path.startsWith("apps/")
    || path.startsWith("packages/")
    || path.startsWith("tests/browser/")
    || path.startsWith("tests/unit/")
    || path.startsWith("tests/assets/")
    || path.startsWith("tests/integration/")
    || path.startsWith("tools/");
}

function isReportReaderSource(path: string): boolean {
  return path.startsWith("tools/") || path.startsWith("tests/") || path === "README.md" || path === "package.json";
}

function isInScannedScope(path: string): boolean {
  if (path === "package.json" || path === "README.md" || path === "tsconfig.base.json" || path === "vite.config.ts" || path === "vitest.config.ts") return true;
  return SCANNED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

function directoriesFromFiles(files: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      directories.add(parts.slice(0, depth).join("/"));
    }
  }
  return Array.from(directories).filter(isInScannedScope).sort();
}

function isTextPath(path: string): boolean {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  return TEXT_EXTENSIONS.has(extension);
}

function listTrackedFiles(rootDir: string): string[] {
  try {
    return execFileSync("rg", ["--files", "--", ...SCANNED_ROOTS, "package.json", "README.md", "tsconfig.base.json", "vite.config.ts", "vitest.config.ts"], { cwd: rootDir, encoding: "utf8" })
      .split("\n")
      .map((path) => toPosix(path.trim()))
      .filter(Boolean)
      .sort();
  } catch {
    // Fall through to checked-in paths if ripgrep is unavailable.
  }
  try {
    return execFileSync("git", ["ls-files"], { cwd: rootDir, encoding: "utf8" })
      .split("\n")
      .map((path) => toPosix(path.trim()))
      .filter(Boolean)
      .sort();
  } catch {
    return walkFiles(rootDir).map((path) => toPosix(relative(rootDir, path))).sort();
  }
}

function walkFiles(root: string): string[] {
  const ignored = new Set([".git", "node_modules", "dist", "coverage", ".turbo"]);
  const entries = readdirSync(root);
  const files: string[] = [];
  for (const entry of entries) {
    if (ignored.has(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walkFiles(path));
    else if (stat.isFile()) files.push(path);
  }
  return files;
}

function firstVersion(path: string): string {
  const match = VERSIONED_PATH_PATTERN.exec(path);
  return match ? `v${match[2]}` : "unknown";
}

function rootOf(path: string): string {
  if (path.startsWith(".github/")) return ".github";
  return path.split("/")[0] ?? "";
}

function countBy<T>(entries: readonly T[], getKey: (entry: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const key = getKey(entry);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function flattenJsonStrings(value: unknown, prefix: string): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenJsonStrings(entry, `${prefix}.${index}`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => flattenJsonStrings(entry, `${prefix}.${key}`));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function matchAll(text: string, pattern: RegExp): RegExpMatchArray[] {
  return Array.from(text.matchAll(pattern));
}

function looksPathLike(value: string): boolean {
  return value.includes("/") || value.startsWith(".");
}

function trimReference(value: string): string {
  return value.replace(/[)"'`,;]+$/g, "");
}

function dedupeReferences(records: readonly ActiveReferenceRecord[]): ActiveReferenceRecord[] {
  const seen = new Set<string>();
  const deduped: ActiveReferenceRecord[] = [];
  for (const record of records) {
    const key = `${record.kind}\0${record.source}\0${record.reference}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }
  return deduped;
}

function renderSimpleTable(headers: readonly string[], rows: readonly (readonly [string, string | number])[]): string {
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${markdownCell(row[0])} | ${markdownCell(String(row[1]))} |`)
  ].join("\n");
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function tsvCell(value: string): string {
  return value.replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertReportData(data: MigrationReportData): string[] {
  const errors: string[] = [];
  for (const entry of data.versionedPaths) {
    if (!entry.target && !entry.archivalReason) errors.push(`missing target/archive reason for ${entry.path}`);
  }
  for (const entry of data.versionedDirectories) {
    if (!entry.target && !entry.archivalReason) errors.push(`missing target/archive reason for directory ${entry.path}`);
  }
  for (const entry of data.activeReferences) {
    if (!entry.target && !entry.archivalReason) errors.push(`missing active-reference target/archive reason for ${entry.kind} ${entry.source} ${entry.reference}`);
  }
  return errors;
}

function writeReport(rootDir: string, outputPath: string): MigrationReportData {
  const data = buildMigrationReportData(rootDir);
  const errors = assertReportData(data);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const absoluteOutputPath = join(rootDir, outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, renderMigrationReport(data));
  return data;
}

function checkReport(rootDir: string, outputPath: string): MigrationReportData {
  const data = buildMigrationReportData(rootDir);
  const errors = assertReportData(data);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const expected = renderMigrationReport(data);
  const absoluteOutputPath = join(rootDir, outputPath);
  const actual = existsSync(absoluteOutputPath) ? readFileSync(absoluteOutputPath, "utf8") : "";
  if (actual !== expected) {
    process.exitCode = 1;
    console.error(`${outputPath} is stale. Run pnpm exec tsx --tsconfig tsconfig.base.json tools/naming-taxonomy/index.ts --write`);
  }
  return data;
}

function printSummary(data: MigrationReportData, outputPath: string): void {
  console.log(`Naming taxonomy report: ${data.versionedPaths.length} version-style paths, ${data.activeReferences.length} active references -> ${outputPath}`);
}

function parseCli(args: readonly string[]): { readonly mode: "check" | "write"; readonly outputPath: string } {
  let mode: "check" | "write" = "write";
  let outputPath = REPORT_PATH;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      mode = "write";
    } else if (arg === "--check") {
      mode = "check";
    } else if (arg === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error("--output requires a value");
      outputPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { mode, outputPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { mode, outputPath } = parseCli(process.argv.slice(2));
  const data = mode === "check" ? checkReport(process.cwd(), outputPath) : writeReport(process.cwd(), outputPath);
  printSummary(data, outputPath);
}
