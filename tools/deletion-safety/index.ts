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
  /**
   * References from files that are themselves in the same deletion set.
   *
   * WS-3.3 deletes whole packages, and a package's own modules import each other constantly. Those
   * references are not evidence that the deletion is unsafe — both ends disappear in the same
   * commit — so they are recorded separately rather than counted as blocking. Counting them would
   * make any multi-file deletion permanently unclearable, which is how a gate gets routed around.
   */
  readonly intraCandidate: readonly Evidence[];
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

/**
 * Files git actually tracks. Decides whether a generated artefact counts as a dependency.
 *
 * `tests/reports/` is gitignored: 2 of the ~200 files in it are tracked. A stale *untracked*
 * report that mentions a file is not a dependency on it — it is yesterday's output, it is not in
 * the repository, and the next run overwrites it. Treating those as blocking made this gate
 * self-poisoning: its own prior reports showed up as "blocking references" for the very files they
 * were reporting on, so every run made the next deletion harder to clear. A *tracked* report does
 * block, because it is committed and deleting its subject leaves it stating something false.
 */
function trackedFiles(): ReadonlySet<string> {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return new Set(out.split("\u0000").filter((value) => value.length > 0));
  } catch {
    // No git available: fall back to the stricter reading and treat everything as tracked.
    return new Set<string>();
  }
}

const TRACKED = trackedFiles();
const gitAvailable = TRACKED.size > 0;

/**
 * The deletion queue is not a consumer of the files it queues.
 *
 * `candidates.json` names a candidate by path, which is exactly the shape `referencesSpecifier`
 * looks for, so every candidate was reported blocked by `runtime-consumer @
 * tools/deletion-safety/candidates.json:<n>` — the queue entry that asked for the proof. WS-3.3's
 * first run produced this for all 68 files, and every one of the 12 files that were otherwise
 * clear was reported blocked by nothing but its own queue entry. A gate that blocks on being
 * asked to run cannot ever pass, which is the third instance of this same defect class here
 * (see the calibration notes in WS-0.2): the tool manufacturing its own blocking evidence.
 *
 * The manifest in use is therefore excluded from the scan, not classified — classifying it as
 * prose would still print 68 misleading rows.
 */
function scanRepository(excluded: ReadonlySet<string> = new Set()): readonly ScannedFile[] {
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
      const relativePath = relative(repoRoot, child);
      if (excluded.has(relativePath)) continue;
      out.push({ path: relativePath, text, lines: text.split("\n") });
    }
  };
  for (const root of SCAN_ROOTS) {
    const absolute = join(repoRoot, root);
    if (existsSync(absolute)) walk(absolute);
  }
  for (const rootFile of ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "llms.txt", "vitest.config.ts", "playwright.config.ts"]) {
    const absolute = join(repoRoot, rootFile);
    if (!existsSync(absolute)) continue;
    if (excluded.has(rootFile)) continue;
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

/**
 * Basenames that more than one scanned file shares. A bare name is only a usable identity for a
 * file when it names exactly one file in the repository.
 *
 * `GENERIC_STEMS` above was a hand-maintained list of names known to be ambiguous, and it could
 * only ever block the ambiguities someone had already been bitten by. It did not contain
 * `package.json`, `tsconfig.json`, or `README.md`, so proving `packages/ecs` deletable reported
 * 306 blocking references for `packages/ecs/package.json` — every `"package.json"` string in every
 * showcase evidence manifest in the repository, none of which had anything to do with
 * `packages/ecs`. Three of the four highest reference counts in that run were this one bug.
 *
 * Uniqueness is the general form of the rule the list was approximating: derive ambiguity from the
 * repository instead of enumerating it. Ambiguous files are still matched on their repo-relative
 * path and package subpath, which are unique by construction.
 */
function ambiguousBasenames(repo: readonly ScannedFile[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const file of repo) {
    const base = basename(file.path);
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [base, count] of counts) {
    if (count > 1) out.add(base);
  }
  return out;
}

function moduleSpecifiersFor(path: string, ambiguous: ReadonlySet<string>): readonly string[] {
  const base = basename(path);
  const stem = base.replace(/\.(m|c)?tsx?$/, "").replace(/\.(m|c)?jsx?$/, "");
  const specifiers = new Set<string>([path]);
  if (!GENERIC_STEMS.has(stem) && !ambiguous.has(base)) {
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
    // Only a committed artefact is a retained dependency. See `trackedFiles`.
    if (!gitAvailable || TRACKED.has(referencingPath)) return "retained-schema-or-report-dependency";
    return INFORMATIONAL_POINT;
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

/** Contents of every quoted span on a line: the only place a module specifier can legally live. */
function quotedSpans(line: string): readonly string[] {
  const out: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) out.push(match[1] ?? match[2] ?? match[3] ?? "");
  return out;
}

/** A line with every quoted span blanked out, so prose inside a string cannot match an identifier. */
function withoutQuotedSpans(line: string): string {
  return line.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
}

/** The last path segment of a specifier, without a module extension. */
function finalSegment(value: string): string {
  const segment = value.split("/").pop() ?? value;
  return segment.replace(/\.(m|c)?[jt]sx?$/, "");
}

/**
 * Whether a quoted string actually resolves to this specifier.
 *
 * Substring containment is not enough, and getting this wrong is not cosmetic: it fabricates
 * blocking evidence, which under R8 blocks a legitimate deletion on a dependency that does not
 * exist. Two real false positives from the first version, both of which stopped WS-3.3:
 *
 *   - specifier `StateMachine` "matched" `./AnimationStateMachine.js` — a different module in a
 *     different package — making `packages/animation` look like a consumer of `packages/scripting`.
 *   - specifier `Behavior` "matched" the display string `"Spin Behavior"` in an editor node title,
 *     making a UI label look like a runtime import.
 *
 * So: a path-shaped specifier must match on segment boundaries, and a bare stem must be the
 * entire final segment of the quoted value.
 */
function quotedResolvesTo(quoted: string, specifier: string): boolean {
  if (specifier.includes("/")) {
    let index = quoted.indexOf(specifier);
    while (index !== -1) {
      const before = index === 0 ? "" : quoted[index - 1];
      const afterIndex = index + specifier.length;
      const after = afterIndex >= quoted.length ? "" : quoted[afterIndex];
      if ((before === "" || before === "/") && (after === "" || after === "/" || after === ".")) return true;
      index = quoted.indexOf(specifier, index + 1);
    }
    return false;
  }
  if (quoted === specifier) return true;
  const looksLikeModule = quoted.startsWith(".") || quoted.startsWith("/") || quoted.startsWith("@") || quoted.includes("/");
  return looksLikeModule && finalSegment(quoted) === specifier;
}

/**
 * A static or dynamic import, an export-from, a `require`, or a string mention of the specifier.
 * String mentions matter: a dynamic `import()` built from a variable, a glob, and a registry table
 * entry all read as plain strings.
 */
function referencesSpecifier(line: string, specifier: string): boolean {
  if (!line.includes(specifier)) return false;
  for (const quoted of quotedSpans(line)) {
    if (quotedResolvesTo(quoted, specifier)) return true;
  }
  /*
   * Unquoted: yaml globs, workspace member lists and tsconfig `references` are all path-shaped.
   * An unquoted bare stem is prose, and matching prose is what once produced 27,230 "references"
   * for a single file.
   */
  if (!specifier.includes("/")) return false;
  if (!/\b(import|export|require|from|glob|pattern|entry|include|path|reference|packages)\b/i.test(line)) return false;
  return new RegExp(`(^|[^A-Za-z0-9_$/.-])${escapeRegExp(specifier)}([^A-Za-z0-9_$-]|$)`).test(line);
}

/**
 * Whether an import/export-from line names a module specifier that is not one of the candidate's.
 *
 * If so, every identifier on the line is bound from that other module, and a matching exported
 * name in the candidate is a collision rather than a consumer.
 */
function bindsFromOtherModule(line: string, candidateSpecifiers: readonly string[]): boolean {
  if (!/\b(import|export)\b/.test(line) && !/\brequire\s*\(/.test(line)) return false;
  const sources = [...line.matchAll(/(?:from|require\s*\(|import\s*\()\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1] ?? "");
  if (sources.length === 0) return false;
  return sources.every((source) => !candidateSpecifiers.some((specifier) => quotedResolvesTo(source, specifier)));
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

function analyze(candidate: string, repo: readonly ScannedFile[], deletionSet: ReadonlySet<string>, ambiguous: ReadonlySet<string>): FileReport {
  const path = relative(repoRoot, resolve(repoRoot, candidate));
  const absolute = join(repoRoot, path);
  const exists = existsSync(absolute);
  const text = exists ? readFileSync(absolute, "utf8") : "";
  const specifiers = moduleSpecifiersFor(path, ambiguous);
  const symbols = exportedSymbols(text);
  const points = emptyPoints();
  const intraCandidate: Evidence[] = [];
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
        /*
         * A registry can name an exported symbol without naming the file — but the symbol must
         * appear as an *identifier* on an import/export/registration line, not as text inside a
         * string. `{ title: "Spin Behavior" }` is a UI label, not a consumer of `Behavior.ts`.
         */
        if (!/\b(import|from|require|registry|register)\b/.test(line)) continue;
        /*
         * And if the line binds its identifiers from an explicit module specifier that is *not*
         * the candidate, the symbol came from somewhere else and this is a name collision.
         *
         * Real case: `packages/animation/src/library/performanceStateGraph.ts:1` imports
         * `StateTransition` from `../AnimationStateMachine.js`. `packages/scripting/src/StateMachine.ts`
         * also exports a type called `StateTransition`. Two packages independently naming a type
         * the same thing is not a dependency — `packages/animation` does not even list
         * `@aura3d/scripting` in its dependencies. Reporting it made a package deletion look
         * blocked by a cross-package import that does not exist.
         */
        if (!bindsFromOtherModule(line, specifiers)) {
          const code = withoutQuotedSpans(line);
          const symbolHit = symbols.find((symbol) => symbol.length > 4 && new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(code));
          if (symbolHit === undefined) continue;
          matched = symbolHit;
        }
        if (matched === undefined) continue;
      }
      const point = classify(file.path, line);
      const key = `${point}|${file.path}:${index + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const evidence: Evidence = { point, at: `${file.path}:${index + 1}`, detail: line.trim().slice(0, 240) };
      if (deletionSet.has(file.path)) {
        intraCandidate.push(evidence);
        continue;
      }
      points[point].push(evidence);
    }
  }

  const clear = R8_POINTS.every((point) => points[point].length === 0);
  return {
    path,
    exists,
    lines: exists ? text.split("\n").length : 0,
    moduleSpecifiers: specifiers,
    clear,
    points,
    intraCandidate
  };
}

/* ------------------------------------------------------------------------------------------- */
/* Candidate expansion — a directory is a legitimate deletion candidate                          */
/* ------------------------------------------------------------------------------------------- */

/**
 * WS-3.3 removes `packages/ecs` and `packages/scripting` whole. Earlier the tool called
 * `readFileSync` on whatever it was handed and crashed with `EISDIR`, which meant a package-level
 * deletion could not be proven at all — and an unprovable deletion under R8 is an unperformable
 * one. A directory now expands to every scannable file inside it, and the directory's own
 * `package.json` is included, because that is where the public `exports` map lives.
 */
function expandCandidate(candidate: string): readonly string[] {
  const absolute = join(repoRoot, candidate);
  if (!existsSync(absolute)) return [candidate];
  if (!statSync(absolute).isDirectory()) return [candidate];
  const out: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      const child = join(directory, entry);
      const stats = statSync(child);
      if (stats.isDirectory()) {
        walk(child);
        continue;
      }
      if (!SCAN_EXTENSIONS.has(extname(entry))) continue;
      out.push(relative(repoRoot, child));
    }
  };
  walk(absolute);
  return out.sort();
}

/* ------------------------------------------------------------------------------------------- */
/* Entry                                                                                        */
/* ------------------------------------------------------------------------------------------- */

interface Args {
  readonly paths: readonly string[];
  readonly reportPath: string;
  /** The manifest whose candidates were read, if any. Excluded from the scan; see `scanRepository`. */
  readonly manifestPath: string | undefined;
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
  let manifestRead: string | undefined;
  if (paths.length === 0) {
    const manifestPath = manifest ?? DEFAULT_MANIFEST;
    if (existsSync(join(repoRoot, manifestPath))) {
      const parsed = JSON.parse(readFileSync(join(repoRoot, manifestPath), "utf8")) as { readonly candidates?: readonly string[] };
      paths.push(...(parsed.candidates ?? []));
      manifestRead = manifestPath;
    }
  }
  return { paths, reportPath, manifestPath: manifestRead };
}

function gitTrackedAt(path: string): string | null {
  try {
    return execFileSync("git", ["log", "-1", "--format=%H", "--", path], { cwd: repoRoot, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function main(): void {
  const { paths, reportPath, manifestPath } = parseArgs(process.argv.slice(2));
  const repo = scanRepository(new Set(manifestPath === undefined ? [] : [manifestPath]));
  const expanded = [...new Set(paths.flatMap((path) => expandCandidate(path)))];
  const deletionSet = new Set(expanded);
  const ambiguous = ambiguousBasenames(repo);
  const reports = expanded.map((path) => analyze(path, repo, deletionSet, ambiguous));
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
    requestedCandidates: paths,
    expandedFileCount: expanded.length,
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
      intraCandidateReferences: report.intraCandidate.length,
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
