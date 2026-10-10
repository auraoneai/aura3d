// Script and tool pruning (PRD-15 T7.3–T7.5, §6.11).
//
// Builds the reference graph for every root package.json script:
//   - script bodies (`pnpm <name>` / `pnpm run <name>` / `npm run <name>`)
//   - .github/workflows/*.yml, packages/*/package.json, apps/*/package.json
//   - skills/**, README.md, docs/** (except docs/project/** history),
//     AGENTS.md, CLAUDE.md
// then assigns each script a verdict:
//   keep    — canonical §6.11 name, or referenced by a kept workflow/source
//   delete  — zero references, referenced only by other deleted scripts, or
//             its target file does not exist
//   review  — verify:* / check:* (and similar gate prefixes) with no
//             references: kept only when a C-30/C-33 tool or a 12-owned
//             workflow invokes it, or it lands in REVIEW_KEEP below
//
// --report  writes tools/script-prune/report.json
// --apply   rewrites package.json, removing every delete verdict plus every
//           review verdict not rescued by REVIEW_KEEP
// --check   CI mode: fails when package.json still contains a script the
//           tool would delete (drift guard for --apply)
//
// The report also lists, for every tools/<dir>, which kept script, workflow
// or source file still references it (T7.5). A tool dir is deletable when
// nothing outside itself references it.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const PACKAGE_JSON = join(root, "package.json");
const REPORT_PATH = join(root, "docs/architecture/script-prune-report.json");
// Any previously generated report copy would otherwise look like a live
// reference to every tools/<dir> it lists.
const REPORT_PATHS = new Set([
  REPORT_PATH,
  join(root, "tools/script-prune/report.json"),
]);

// §6.11 canonical names (fixed so CI and skills can rely on them).
const CANONICAL_EXACT = new Set([
  "dev", "build", "build:dist", "typecheck", "typecheck:tests", "lint",
  "test", "test:unit", "test:integration", "test:browser", "test:visual",
  "bench:quality", "capture:games", "pack:check", "resolution:check",
  "resolution:write", "arch:check", "bundle:size", "templates:check",
  "doctor"
]);
const CANONICAL_PREFIX = [/^assets:/, /^release:/];

// verify:*, check:* and lookalike one-shot gates are review, not delete, per
// §6.11 — a lane decision (REVIEW_KEEP) or a live reference keeps them.
const REVIEW_PREFIX = /^(verify|check):/;

// Review-verdict scripts kept deliberately (T7.4 lane decision). Each entry
// must name the C-30/C-33 tool, workflow, or §6.12 behaviour it protects.
const REVIEW_KEEP: Readonly<Record<string, string>> = {
  "check:engine-skills": "skills gate — the engine-skills namespace checker runs in CI",
  "check:public-surface-diff": "PRD-15 T5.9 honest diff gate — wired in qr-prd15-arch-gates.yml",
  "check:bundle-migration": "PRD-15 T2/T6 migration surface check — wired in lane workflows",
  "verify:source-cleanliness": "PRD-15 T7.2 backstop (emitted artifacts in src)",
  "verify:architecture": "T7.7 alias — kept as the stable entry name, retargeted to arch:check",
  "verify:public-demo-deployment": "external-demo-export deploymentCommandPlan validationCommands contract + public-demo-deploy.yml step name",
  "audit:external-parity-production-readiness": "deploymentCommandPlan validationCommands contract + public-demo-deploy.yml step name",
  "audit:external-parity-external-evidence-readiness": "public-demo-deploy.yml post-deploy audit step",
  "audit:external-parity-broad-parity": "deploymentCommandPlan validationCommands contract + public-demo-deploy.yml step name",
  "audit:external-parity-completion": "deploymentCommandPlan validationCommands contract + public-demo-deploy.yml step name",
  "verify:external-parity-report-freshness": "deploymentCommandPlan validationCommands contract + public-demo-deploy.yml step name"
};

type Verdict = "keep" | "delete" | "review";

interface ScriptRow {
  readonly name: string;
  readonly body: string;
  verdict: Verdict;
  reason: string;
  readonly referencedBy: string[];
  readonly invokedToolDirs: string[];
}

interface ToolDirRow {
  readonly dir: string;
  readonly referencedBy: string[];
  readonly verdict: "referenced" | "unreferenced";
}

/* ----------------------------- corpus loading ---------------------------- */

function* walk(dir: string): Generator<string> {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

const TEXT_RE = /\.(ya?ml|json|md|ts|mts|cts|js|mjs|cjs|tsx)$/i;
const HTML_RE = /\.(html?|css)$/i;

function corpusFiles(): string[] {
  const files: string[] = [];
  const push = (path: string) => { if (existsSync(path)) files.push(path); };
  for (const entry of walk(join(root, ".github/workflows"))) if (TEXT_RE.test(entry)) files.push(entry);
  for (const dir of ["packages", "apps"]) {
    for (const entry of walk(join(root, dir))) if (entry.endsWith("package.json")) files.push(entry);
  }
  for (const dir of ["skills", "docs", "tools"]) {
    for (const entry of walk(join(root, dir))) {
      if (entry.includes(`${join("docs", "project")}`)) continue;
      if (REPORT_PATHS.has(entry)) continue;
      if (TEXT_RE.test(entry)) files.push(entry);
    }
  }
  push(join(root, "README.md"));
  push(join(root, "AGENTS.md"));
  push(join(root, "CLAUDE.md"));
  return files;
}

/**
 * T7.5 dir analysis needs the *source-file* corpus the spec names — a tool
 * dir is deletable only when no kept script, workflow, or source file
 * references it. tests/, src/, apps/, root configs and marketing all count.
 * (tools/script-prune tests missed this the first pass; the sweep had to be
 * re-verified by full-repo rg and several dirs restored.)
 */
function dirCorpusFiles(): string[] {
  const files: string[] = [];
  // walk() prunes dot-directories, so .github/ never surfaces — scan it explicitly.
  const roots = [root, join(root, ".github")];
  for (const entry of roots.flatMap((r) => [...walk(r)])) {
    const rel = relative(root, entry);
    if (rel.startsWith(`docs${sep}project`)) continue;
    const seg0 = rel.split(sep)[0]!;
    if (seg0 === "node_modules" || seg0 === "dist" || seg0 === ".git") continue;
    if (REPORT_PATHS.has(entry)) continue;
    if (rel.startsWith(`tools${sep}script-prune`)) continue;
    if (TEXT_RE.test(entry) || HTML_RE.test(entry)) files.push(entry);
  }
  return files;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------- analysis -------------------------------- */

const RUNNER_RE = /\b(?:pnpm(?:\s+run)?|npm\s+run|yarn|bun(?:\s+run)?|pnpm\s+exec)\s+([a-zA-Z0-9][\w:.-]*)/g;
const TOOL_DIR_RE = /tools\/([a-zA-Z0-9][\w.-]*)/g;
const TARGET_RE = /(?:^|&&|\|\||;)\s*(?:pnpm\s+exec\s+)?(?:node|tsx|node\s+--experimental-strip-types)(?:\s+--[\w=-]+)*\s+([^\s"']+\.(?:m?[jt]s|cjs|cts))/g;

function invokedToolDirs(body: string): string[] {
  const dirs = new Set<string>();
  for (const match of body.matchAll(TOOL_DIR_RE)) dirs.add(`tools/${match[1]}`);
  return [...dirs];
}

function scriptTargetsExist(body: string): { missing: string[] } {
  const missing: string[] = [];
  for (const match of body.matchAll(TARGET_RE)) {
    const target = match[1]!;
    // TARGET_RE's extension alternation is not token-anchored: it matches
    // `.js` as a prefix of `.json` (e.g. `--tsconfig tsconfig.base.json`
    // yields the bogus target `tsconfig.base.js`). A word char right after
    // the match means the captured name is a prefix of a longer token —
    // not a script target.
    const tail = body[match.index + match[0].length];
    if (tail !== undefined && /\w/.test(tail)) continue;
    if (target.startsWith("node_modules/") || target.includes("://")) continue;
    if (!existsSync(join(root, target))) missing.push(target);
  }
  return { missing };
}

export function analyze(
  scripts: Record<string, string>,
  corpus: ReadonlyMap<string, string>
): ScriptRow[] {
  const rows: ScriptRow[] = [];
  const bodies = Object.entries(scripts);

  // Pass 1: direct references from corpus text and other script bodies.
  for (const [name, body] of bodies) {
    const referencedBy: string[] = [];
    const nameRe = new RegExp(`\\b${escapeRe(name)}\\b`);
    for (const [file, text] of corpus) {
      // A colon-qualified name matches on sight; a bare word must sit behind a
      // runner token ("test" alone would match prose).
      if (name.includes(":")) {
        if (nameRe.test(text)) referencedBy.push(relative(root, file));
      } else {
        for (const m of text.matchAll(RUNNER_RE)) {
          if (m[1] === name) { referencedBy.push(relative(root, file)); break; }
        }
      }
    }
    for (const [otherName, otherBody] of bodies) {
      if (otherName === name) continue;
      for (const m of otherBody.matchAll(RUNNER_RE)) {
        if (m[1] === name) { referencedBy.push(`script:${otherName}`); break; }
      }
      // "pnpm --filter <pkg> run <name>" and bare "npm run <name>" forms
      if (!referencedBy.includes(`script:${otherName}`) && nameRe.test(otherBody)) {
        if (new RegExp(`\\b(?:run|exec)\\s+${escapeRe(name)}\\b`).test(otherBody)) {
          referencedBy.push(`script:${otherName}`);
        }
      }
    }
    const { missing } = scriptTargetsExist(body);
    let verdict: Verdict;
    let reason: string;
    if (CANONICAL_EXACT.has(name) || CANONICAL_PREFIX.some((re) => re.test(name))) {
      verdict = "keep"; reason = "canonical §6.11 name";
    } else if (missing.length) {
      verdict = "delete"; reason = `target file(s) missing: ${missing.join(", ")}`;
    } else if (referencedBy.length) {
      verdict = "keep"; reason = `referenced by ${referencedBy.length} source(s)`;
    } else if (REVIEW_PREFIX.test(name)) {
      verdict = REVIEW_KEEP[name] ? "keep" : "review";
      reason = REVIEW_KEEP[name] ? `review keep — ${REVIEW_KEEP[name]}` : "review: unreferenced gate-style script";
    } else {
      verdict = "delete"; reason = "zero references";
    }
    rows.push({ name, body, verdict, reason, referencedBy, invokedToolDirs: invokedToolDirs(body) });
  }

  // Pass 2: scripts referenced only by deleted scripts get deleted too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.verdict !== "keep" || row.referencedBy.length === 0) continue;
      const liveRefs = row.referencedBy.filter((r) => {
        if (!r.startsWith("script:")) return true;
        const ref = rows.find((o) => o.name === r.slice(7));
        return ref ? ref.verdict === "keep" || ref.verdict === "review" : false;
      });
      if (liveRefs.length === 0) {
        row.verdict = "delete";
        row.reason = "referenced only by deleted scripts";
        changed = true;
      }
    }
  }
  return rows;
}

function analyzeToolDirs(corpus: ReadonlyMap<string, string>, rows: readonly ScriptRow[]): ToolDirRow[] {
  const toolsDir = join(root, "tools");
  if (!existsSync(toolsDir)) return [];
  const keepRows = rows.filter((r) => r.verdict !== "delete");
  return readdirSync(toolsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => {
      const dir = `tools/${e.name}`;
      const referencedBy: string[] = [];
      for (const row of keepRows) if (row.invokedToolDirs.includes(dir)) referencedBy.push(`script:${row.name}`);
      for (const [file, text] of corpus) {
        const rel = relative(root, file);
        if (rel.startsWith(`${dir}/`)) continue; // self-reference doesn't count
        if (rel.startsWith("tools/script-prune")) continue;
        if (new RegExp(escapeRe(dir)).test(text)) referencedBy.push(rel);
      }
      return { dir, referencedBy: [...new Set(referencedBy)], verdict: referencedBy.length ? "referenced" : "unreferenced" } as ToolDirRow;
    });
}

/* --------------------------------- modes ---------------------------------- */

function main(): void {
  const args = process.argv.slice(2);
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { scripts: Record<string, string> };
  const corpus = new Map(corpusFiles().map((f) => [f, readFileSync(f, "utf8")] as const));
  const rows = analyze(pkg.scripts, corpus);
  const dirCorpus = new Map(dirCorpusFiles().map((f) => [f, readFileSync(f, "utf8")] as const));
  const toolDirs = analyzeToolDirs(dirCorpus, rows);

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      scripts: rows.length,
      keep: rows.filter((r) => r.verdict === "keep").length,
      delete: rows.filter((r) => r.verdict === "delete").length,
      review: rows.filter((r) => r.verdict === "review").length,
      toolDirs: toolDirs.length,
      unreferencedToolDirs: toolDirs.filter((t) => t.verdict === "unreferenced").length
    },
    scripts: rows.map(({ name, verdict, reason, referencedBy, invokedToolDirs }) =>
      ({ name, verdict, reason, referencedBy, invokedToolDirs })),
    toolDirs
  };

  if (args.includes("--report") || (!args.includes("--apply") && !args.includes("--check"))) {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`script-prune: ${report.totals.keep} keep / ${report.totals.delete} delete / ${report.totals.review} review (${report.totals.scripts} total); ${report.totals.unreferencedToolDirs} of ${report.totals.toolDirs} tool dirs unreferenced`);
    console.log(`report → ${relative(root, REPORT_PATH)}`);
    return;
  }

  const deletable = rows.filter((r) => r.verdict === "delete" || r.verdict === "review");
  if (args.includes("--check")) {
    const survivors = deletable.filter((r) => pkg.scripts[r.name] !== undefined);
    if (survivors.length) {
      console.error(`script-prune --check: ${survivors.length} scripts would be deleted:`);
      for (const r of survivors) console.error(`  ${r.name} (${r.reason})`);
      process.exitCode = 1;
    } else {
      console.log("script-prune --check: clean");
    }
    return;
  }

  if (args.includes("--apply")) {
    for (const row of deletable) delete pkg.scripts[row.name];
    writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`script-prune --apply: removed ${deletable.length} scripts, ${Object.keys(pkg.scripts).length} remain`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
