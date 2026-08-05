/**
 * WS-0.2 — the R8 deletion-proof tool.
 *
 * R8 exists because "zero direct app imports" is not evidence in this repository. A file can be
 * reached through a generated registry, a dynamic `import()` built from a string, a package
 * `exports` subpath, a documentation generator's input list, a retained report schema, or a CLI
 * discovery glob. Every one of those has bitten a previous cleanup here, so a deletion is only
 * safe once all six are proven empty for the specific file.
 *
 * Output is a per-file report with the six R8 points. Exit code is non-zero if any point is
 * non-empty for any requested path, so `check:deletion-safety` is a gate rather than a printout.
 *
 * Usage:
 *   tsx tools/deletion-safety/index.ts <path> [<path> ...]
 *   tsx tools/deletion-safety/index.ts --manifest tools/deletion-safety/candidates.json
 *   tsx tools/deletion-safety/index.ts --report tests/reports/deletion-safety-fixtures.json <paths>
 *
 * With no paths it reads the default manifest, and reports "no candidates" as a pass: an empty
 * deletion queue is a legitimate state, an unproven deletion is not.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

const repoRoot = resolve(import.meta.dirname, "..", "..");

/** The six R8 points, in R8's order. Ids are stable: reports and gates cite them. */
const R8_POINTS = [
  "runtime-consumer",
  "generated-registry-consumer",
  "documentation-generator-dependency",
  "public-package-export-dependency",
  "retained-schema-or-report-dependency",
  "cli-discovery-dependency"
] as const;

/**
 * Reported, never blocking: a mention inside a source comment or hand-written prose.
 *
 * A comment that names a file is not a consumer of it, and treating one as blocking would make the
 * gate unclearable — this tool's own explanatory comment names `test-utils/src/index.ts`, so an
 * earlier version blocked on itself. The mention still has to be reported, because deleting a file
 * while leaving prose that references it is how stale documentation accumulates.
 */
const INFORMATIONAL_POINT = "prose-mention" as const;

const ALL_POINTS = [...R8_POINTS, INFORMATIONAL_POINT] as const;

type R8Point = (typeof ALL_POINTS)[number];

interface Evidence {
  readonly point: R8Point;
  /** Where the reference was found. Repo-relative. */
  readonly at: string;
  /** The matching line or key, trimmed. Enough to act on without re-grepping. */
  readonly detail: string;
}

interface FileReport {
  readonly path: string;
  readonly exists: boolean;
  readonly lines: number;
  readonly moduleSpecifiers: readonly string[];
  readonly clear: boolean;
  readonly points: Record<R8Point, readonly Evidence[]>;
}

/* ------------------------------------------------------------------------------------------- */
/* Repository scan — one pass, reused for every candidate                                       */
/* ------------------------------------------------------------------------------------------- */

interface ScannedFile {
  readonly path: string;
  readonly text: string;
  readonly lines: readonly string[];
}

const SCAN_ROOTS = [
  "packages",
  "apps",
  "examples",
  "templates",
  "tools",
  "tests",
  "workers",
  "marketing",
  "docs",
  "benchmark",
  ".github",
  "src"
] as const;

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx", ".json", ".yml", ".yaml", ".md", ".sh"]);

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "test-results",
  ".turbo",
  ".next",
  ".git",
  "playwright-report",
  "release-artifacts"
]);

function scanRepository(): readonly ScannedFile[] {
  const out: ScannedFile[] = [];
  const walk = (absolute: string): void => {
    let entries: readonly string[];
    try {
      entries = readdirSync(absolute);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      const child = join(absolute, entry);
      let stats;
      try {
        stats = statSync(child);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(child);
        continue;
      }
      if (!SCAN_EXTENSIONS.has(extname(entry))) continue;
      // Bundled or generated artefacts are not evidence of a live consumer.
      if (stats.size > 4_000_000) continue;
      let text: string;
      try {
        text = readFileSync(child, "utf8");
      } catch {
        continue;
      }
      out.push({ path: relative(repoRoot, child), text, lines: text.split("\n") });
    }
  };
  for (const root of SCAN_ROOTS) {
    const absolute = join(repoRoot, root);
    if (existsSync(absolute)) walk(absolute);
  }
  for (const rootFile of ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "llms.txt", "vitest.config.ts", "playwright.config.ts"]) {
    const absolute = join(repoRoot, rootFile);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, "utf8");
    out.push({ path: rootFile, text, lines: text.split("\n") });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------- */
/* Module specifiers a candidate can be imported as                                             */
/* ------------------------------------------------------------------------------------------- */

/**
 * Every string another file could plausibly use to reach this one: the bare basename, the
 * extensionless basename (how TS imports it), the repo-relative path, the package-relative path,
 * and — when the file is a barrel — the directory *path*, because `import "./foo"` resolves to
 * `foo/index.ts`.
 *
 * Generic stems are excluded deliberately. An early version emitted `index` as a specifier for
 * `packages/test-utils/src/index.ts` and reported 27,230 "blocking references" — every line in the
 * repository containing the word. A specifier that matches everything proves nothing, and a gate
 * that can never be cleared would be routed around rather than satisfied. Barrels are instead
 * matched on their directory path and their package subpath, which are unambiguous.
 */
const GENERIC_STEMS = new Set(["index", "browser-index", "main", "types", "type", "utils", "util", "src", "test", "tests", "config", "helpers", "constants"]);

function moduleSpecifiersFor(path: string): readonly string[] {
  const base = basename(path);
  const stem = base.replace(/\.(m|c)?tsx?$/, "").replace(/\.(m|c)?jsx?$/, "");
  const specifiers = new Set<string>([path]);
  if (!GENERIC_STEMS.has(stem)) {
    specifiers.add(base);
    specifiers.add(stem);
  }
  if (stem === "index" || stem === "browser-index") {
    // The directory path, not its bare basename: `src` would match the whole repository.
    specifiers.add(dirname(path));
  }
  const packageMatch = /^packages\/([^/]+)\/src\/(.+)$/.exec(path);
  if (packageMatch) {
    const [, pkg, inner] = packageMatch;
    const innerStem = inner.replace(/\.(m|c)?tsx?$/, "");
    specifiers.add(`@aura3d/${pkg}/src/${innerStem}`);
    if (innerStem === "index") {
      specifiers.add(`@aura3d/${pkg}`);
    } else {
      specifiers.add(`@aura3d/${pkg}/${innerStem}`);
    }
  }
  return [...specifiers].filter((value) => value.length > 3);
}

/** Symbols this module exports. A registry can name a symbol without naming the file. */
function exportedSymbols(text: string): readonly string[] {
  const names = new Set<string>();
  const patterns = [
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /export\s*\{([^}]*)\}/g
  ];
  for (const [index, pattern] of patterns.entries()) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (index === 0) {
        names.add(match[1]);
        continue;
      }
      for (const part of match[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
  }
  return [...names];
}

/* ------------------------------------------------------------------------------------------- */
/* Classification of a referencing file into one of the six R8 points                           */
/* ------------------------------------------------------------------------------------------- */

const DOC_GENERATOR_HINTS = ["tools/api-docs", "tools/agent-docs", "tools/docs-site", "tools/docs-codeblocks", "tools/api-surface", "typedoc"];
const CLI_HINTS = ["packages/aura3d-cli", "packages/create-aura3d", "bin/", "cli.ts"];
const REGISTRY_HINTS = ["registry", "generated", "manifest", "catalog", "catalogue", "-index.ts", "index.generated"];

/** Generated documentation. A reference here means a generator must be re-run, so it blocks. */
const GENERATED_DOC_PREFIXES = ["docs/api/", "docs/site/", "llms.txt", "bundle_sizes.md"];

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("#");
}

function classify(referencingPath: string, line: string): R8Point {
  const lower = referencingPath.toLowerCase();
  if (referencingPath === "package.json" || /packages\/[^/]+\/package\.json$/.test(referencingPath)) {
    return "public-package-export-dependency";
  }
  /*
   * Anything under a generated-artifact root is a report dependency regardless of extension.
   * `tests/reports/` is gitignored and regenerated, but a *stale* copy on disk can still satisfy a
   * readiness gate — exactly the failure WS-1.1 removes — so a reference there blocks until the
   * artifact is regenerated. Classifying a generated `vite.config.ts` as a runtime consumer would
   * be wrong and would send someone editing an artifact as if it were source.
   */
  if (lower.startsWith("tests/reports/") || lower.startsWith("release-artifacts/") || lower.includes("schema")) {
    return "retained-schema-or-report-dependency";
  }
  if (GENERATED_DOC_PREFIXES.some((prefix) => lower.startsWith(prefix)) || DOC_GENERATOR_HINTS.some((hint) => lower.includes(hint))) {
    return "documentation-generator-dependency";
  }
  // Hand-written prose and source comments are reported, not blocking.
  if (referencingPath.endsWith(".md") || isCommentLine(line)) {
    return INFORMATIONAL_POINT;
  }
  if (CLI_HINTS.some((hint) => lower.includes(hint))) {
    return "cli-discovery-dependency";
  }
  if (REGISTRY_HINTS.some((hint) => lower.includes(hint)) && !/\bimport\s+/.test(line)) {
    return "generated-registry-consumer";
  }
  return "runtime-consumer";
}

/**
 * A static or dynamic import, an export-from, a `require`, or a bare string mention of the
 * specifier. String mentions matter: dynamic `import()` built from a variable, a glob, or a
 * registry table entry all read as a plain string.
 */
function referencesSpecifier(line: string, specifier: string): boolean {
  if (!line.includes(specifier)) return false;
  const quoted = new RegExp(`["'\`][^"'\`]*${escapeRegExp(specifier)}[^"'\`]*["'\`]`);
  if (quoted.test(line)) return true;
  // Unquoted mentions in yaml/markdown lists still count as a reference to inspect.
  return /\b(import|export|require|from|glob|pattern|entry|include|path)\b/i.test(line);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------------------------------------- */
/* Per-file report                                                                              */
/* ------------------------------------------------------------------------------------------- */

function emptyPoints(): Record<R8Point, Evidence[]> {
  return {
    "runtime-consumer": [],
    "generated-registry-consumer": [],
    "documentation-generator-dependency": [],
    "public-package-export-dependency": [],
    "retained-schema-or-report-dependency": [],
    "cli-discovery-dependency": [],
    "prose-mention": []
  };
}

function analyze(candidate: string, repo: readonly ScannedFile[]): FileReport {
  const path = relative(repoRoot, resolve(repoRoot, candidate));
  const absolute = join(repoRoot, path);
  const exists = existsSync(absolute);
  const text = exists ? readFileSync(absolute, "utf8") : "";
  const specifiers = moduleSpecifiersFor(path);
  const symbols = exportedSymbols(text);
  const points = emptyPoints();
  const seen = new Set<string>();

  for (const file of repo) {
    if (file.path === path) continue;
    for (let index = 0; index < file.lines.length; index += 1) {
      const line = file.lines[index];
      if (line.length > 4000) continue;
      let matched: string | undefined;
      for (const specifier of specifiers) {
        if (referencesSpecifier(line, specifier)) {
          matched = specifier;
          break;
        }
      }
      if (matched === undefined) {
        // A registry can name an exported symbol without naming the file.
        const symbolHit = symbols.find((symbol) => symbol.length > 4 && new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(line));
        if (symbolHit === undefined) continue;
        // `export interface PixelBuffer` in an unrelated file is a name collision, not a consumer.
        if (!/\b(import|from|require|registry|register)\b/.test(line)) continue;
        matched = symbolHit;
      }
      const point = classify(file.path, line);
      const key = `${point}|${file.path}:${index + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points[point].push({ point, at: `${file.path}:${index + 1}`, detail: line.trim().slice(0, 240) });
    }
  }

  const clear = R8_POINTS.every((point) => points[point].length === 0);
  return {
    path,
    exists,
    lines: exists ? text.split("\n").length : 0,
    moduleSpecifiers: specifiers,
    clear,
    points
  };
}

/* ------------------------------------------------------------------------------------------- */
/* Entry                                                                                        */
/* ------------------------------------------------------------------------------------------- */

interface Args {
  readonly paths: readonly string[];
  readonly reportPath: string;
}

const DEFAULT_MANIFEST = "tools/deletion-safety/candidates.json";
const DEFAULT_REPORT = "tests/reports/deletion-safety.json";

function parseArgs(argv: readonly string[]): Args {
  const paths: string[] = [];
  let reportPath = DEFAULT_REPORT;
  let manifest: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") {
      reportPath = argv[index + 1] ?? DEFAULT_REPORT;
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      manifest = argv[index + 1];
      index += 1;
      continue;
    }
    paths.push(arg);
  }
  if (paths.length === 0) {
    const manifestPath = manifest ?? DEFAULT_MANIFEST;
    if (existsSync(join(repoRoot, manifestPath))) {
      const parsed = JSON.parse(readFileSync(join(repoRoot, manifestPath), "utf8")) as { readonly candidates?: readonly string[] };
      paths.push(...(parsed.candidates ?? []));
    }
  }
  return { paths, reportPath };
}

function gitTrackedAt(path: string): string | null {
  try {
    return execFileSync("git", ["log", "-1", "--format=%H", "--", path], { cwd: repoRoot, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function main(): void {
  const { paths, reportPath } = parseArgs(process.argv.slice(2));
  const repo = scanRepository();
  const reports = paths.map((path) => analyze(path, repo));
  const checks: ReleaseCheck[] = reports.map((report) => {
    const blocking = R8_POINTS.flatMap((point) => report.points[point].map((evidence) => `${point} @ ${evidence.at}`));
    return {
      id: `r8:${report.path}`,
      pass: report.clear,
      detail: report.clear
        ? `${report.path}: all six R8 points empty across ${repo.length} scanned files (${report.points[INFORMATIONAL_POINT].length} non-blocking prose mention(s) to tidy)`
        : `${report.path}: ${blocking.length} blocking reference(s) — ${blocking.slice(0, 6).join("; ")}${blocking.length > 6 ? " ..." : ""}`
    };
  });

  if (reports.length === 0) {
    checks.push({
      id: "r8:queue",
      pass: true,
      detail: `no deletion candidates declared in ${DEFAULT_MANIFEST}; an empty queue is a pass, an unproven deletion is not`
    });
  }

  for (const report of reports) {
    if (!report.exists) {
      checks.push({ id: `r8:missing:${report.path}`, pass: false, detail: `${report.path} does not exist; cannot prove a deletion of a file that is already gone` });
    }
  }

  writeReport(reportPath, "deletion-safety-r8", checks, {
    rule: "R8 — no `git rm` until all six points are empty. Absence of direct app imports is not proof.",
    scannedFiles: repo.length,
    points: R8_POINTS,
    informationalPoint: INFORMATIONAL_POINT,
    files: reports.map((report) => ({
      path: report.path,
      exists: report.exists,
      lines: report.lines,
      lastCommit: gitTrackedAt(report.path),
      moduleSpecifiers: report.moduleSpecifiers,
      clear: report.clear,
      blocking: R8_POINTS.reduce<Record<string, readonly Evidence[]>>((accumulator, point) => {
        if (report.points[point].length > 0) accumulator[point] = report.points[point];
        return accumulator;
      }, {}),
      proseMentions: report.points[INFORMATIONAL_POINT]
    }))
  });

  for (const check of checks) {
    console.log(`${check.pass ? "clear" : "BLOCKED"}  ${check.detail}`);
  }
  console.log(`\nreport: ${reportPath}`);
}

main();
