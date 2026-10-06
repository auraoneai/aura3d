// Architecture gates (PRD-15 T1.8). Three rules, all in warn mode for now:
//   resolution-single-truth  — generated resolution maps are byte-identical to
//                              aura.exports.json (no hand-edited copies)
//   src-clean                — no emitted artifacts (*.js, *.js.map, *.d.ts
//                              not paired) living under packages/*/src
//   no-cross-package-relative — import specifiers inside packages/*/src that
//                              resolve to a DIFFERENT package directory
// Emits a JSON report (stdout or --out) and exits 0 in warn mode; a
// `--strict` mode turns warnings into a nonzero exit for the enforce-mode
// flip later in the lane.
// Run: pnpm exec tsx --tsconfig tsconfig.base.json tools/arch-gates/index.ts [--strict] [--out <path>]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { generateResolutionMaps } from "../generate-resolution-maps/index";
import { checkLayering } from "./rules/layering";
import { checkMaxFileLines } from "./rules/maxFileLines";
import { checkNoCycles } from "./rules/noCycles";
import { optionCoverageRule, scaffoldOptionCoverage } from "./rules/option-coverage";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface GateFinding {
  readonly rule: string;
  readonly file: string;
  readonly detail: string;
  /** Fail-mode finding (T3.9/T3.14 scope): fails the run regardless of --strict. */
  readonly enforced?: boolean;
}

export interface GateReport {
  readonly generatedAt: string;
  readonly mode: "warn" | "strict";
  readonly rules: Record<string, { findings: GateFinding[] }>;
  readonly totals: { rules: number; findings: number };
}

// ---------------------------------------------------------------------------
// resolution-single-truth


export function checkResolutionSingleTruth(root: string): GateFinding[] {
  const findings: GateFinding[] = [];
  if (!existsSync(join(root, "aura.exports.json"))) {
    findings.push({ rule: "resolution-single-truth", file: "aura.exports.json", detail: "single resolution truth file missing" });
    return findings;
  }
  const { ok, diffs } = generateResolutionMaps(root, "check");
  if (!ok) {
    for (const diff of diffs) {
      findings.push({ rule: "resolution-single-truth", file: diff, detail: "generated map out of sync with aura.exports.json; run tools/generate-resolution-maps --write" });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// src-clean

const EMITTED_ARTIFACT_RE = /\.(js|js\.map|d\.ts|d\.ts\.map)$/;

export function checkSrcClean(root: string): GateFinding[] {
  const findings: GateFinding[] = [];
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) return findings;
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory() || pkg.name.startsWith(".")) continue;
    const srcDir = join(packagesDir, pkg.name, "src");
    if (!existsSync(srcDir)) continue;
    const stack: string[] = [srcDir];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") stack.push(path);
          continue;
        }
        if (!EMITTED_ARTIFACT_RE.test(entry.name)) continue;
        // A .js sitting next to its .ts source is still an emitted artifact.
        findings.push({ rule: "src-clean", file: relative(root, path), detail: `emitted artifact ${entry.name} inside src/` });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// no-cross-package-relative

const IMPORT_SPEC_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g;

export function checkNoCrossPackageRelative(root: string): GateFinding[] {
  const findings: GateFinding[] = [];
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) return findings;
  const packageRoots = new Map<string, string>();
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (pkg.isDirectory() && !pkg.name.startsWith(".")) packageRoots.set(pkg.name, join(packagesDir, pkg.name));
  }
  for (const [pkgName, pkgRoot] of packageRoots) {
    const srcDir = join(pkgRoot, "src");
    if (!existsSync(srcDir)) continue;
    const stack: string[] = [srcDir];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") stack.push(path);
          continue;
        }
        if (!/\.(ts|tsx|mts)$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) continue;
        const text = readFileSync(path, "utf8");
        for (const match of text.matchAll(IMPORT_SPEC_RE)) {
          const spec = match[1] ?? match[2];
          if (!spec || !spec.startsWith(".")) continue;
          const resolved = resolve(dirname(path), spec);
          // Strip the .js/.ts suffix noise: compare on package-root containment.
          const rel = relative(packagesDir, resolved);
          if (isAbsolute(rel) || rel.startsWith("..")) {
            findings.push({ rule: "no-cross-package-relative", file: relative(root, path), detail: `relative specifier "${spec}" escapes packages/ entirely` });
            continue;
          }
          const owner = rel.split(sep)[0]!;
          if (owner !== pkgName) {
            findings.push({ rule: "no-cross-package-relative", file: relative(root, path), detail: `relative specifier "${spec}" enters packages/${owner} (cross-package)` });
          }
        }
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------

export function runGates(root: string): GateReport {
  const rules: Record<string, { findings: GateFinding[] }> = {
    "resolution-single-truth": { findings: checkResolutionSingleTruth(root) },
    "src-clean": { findings: checkSrcClean(root) },
    "no-cross-package-relative": { findings: checkNoCrossPackageRelative(root) },
    layering: { findings: checkLayering(root) },
    "no-cycles": { findings: checkNoCycles(root) },
    "max-file-lines": { findings: checkMaxFileLines(root) },
    "option-coverage": { findings: optionCoverageRule([], root) }
  };
  const findings = Object.values(rules).reduce((sum, r) => sum + r.findings.length, 0);
  return { generatedAt: new Date().toISOString(), mode: "warn", rules, totals: { rules: 7, findings } };
}

function main(): void {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;

  if (args.includes("--scaffold")) {
    scaffoldOptionCoverage(REPO_ROOT);
    return;
  }

  const report = runGates(REPO_ROOT);
  const enforcedCount = Object.values(report.rules).reduce(
    (sum, r) => sum + r.findings.filter((f) => f.enforced).length, 0);
  const out = JSON.stringify(report, null, 2);
  if (outPath) {
    const dest = resolve(REPO_ROOT, outPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out + "\n");
    console.log(`arch-gates: wrote ${outPath}`);
  } else {
    console.log(out);
  }
  const total = report.totals.findings;
  if (total > 0) {
    for (const [rule, block] of Object.entries(report.rules)) {
      for (const f of block.findings.slice(0, 20)) {
        const level = f.enforced || strict ? "ERROR" : "WARN";
        (level === "ERROR" ? console.error : console.warn)(
          `arch-gates ${level} ${rule}: ${f.file} — ${f.detail}`);
      }
      if (block.findings.length > 20) console.warn(`arch-gates WARN ${rule}: … and ${block.findings.length - 20} more`);
    }
  }
  if (enforcedCount > 0) {
    console.error(`arch-gates: ${enforcedCount} enforced findings (fail mode)`);
    process.exit(1);
  }
  if (strict && total > 0) {
    console.error(`arch-gates: ${total} findings (strict mode)`);
    process.exit(1);
  }
  console.log(`arch-gates: ${total} findings (warn mode)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
