/**
 * PRD-15 T5.8 — `export-budget` + `no-evidence-in-runtime` (§6.6/§6.12).
 *
 * Counts the LIVE export names of each public "." entry via the TS checker
 * (deprecated names are the transitional union counted separately per §6.6
 * step 2 and reported, never budgeted). Budgets:
 *   "."        ≤ 350 values, ≤ 900 total names
 *   "./renderer" ≤ 150 values
 * and zero live names matching the evidence regex on "." or "./renderer".
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import type { GateFinding } from "../index";

export const EVIDENCE_RE = /(Evidence|Report|Readiness|Proof|Audit|Claim|Parity|Receipt|Superiority|Probe|CurrentRoutes|ExternalParity)/;

interface BudgetSpec {
  readonly subpath: string;
  readonly maxValues?: number;
  readonly maxTotal?: number;
}

const BUDGETS: readonly BudgetSpec[] = [
  { subpath: ".", maxValues: 350, maxTotal: 900 },
  { subpath: "./renderer", maxValues: 150 },
  { subpath: "./devtools" },
];

// The public entries emit deprecated names as `/** @deprecated ... *\/ export { X }` /
// `export type { X }` blocks — read them off the source (JSDoc does not
// propagate to the export symbol through the alias).
function deprecatedNamesIn(entryFile: string): Set<string> {
  const out = new Set<string>();
  const re = /\/\*\*\s*@deprecated\s[^*]*\*\/\s*export\s+(?:type\s+)?\{\s*([\w]+)\s*\}/gs;
  for (const m of readFileSync(entryFile, "utf8").matchAll(re)) out.add(m[1]!);
  return out;
}

function exportsOf(root: string, entryFile: string): { name: string; value: boolean; deprecated: boolean }[] {
  const configPath = join(root, "tsconfig.base.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram({ rootNames: [entryFile], options: parsed.options });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entryFile);
  if (!sf) return [];
  const moduleSym = checker.getSymbolAtLocation(sf);
  if (!moduleSym) return [];
  const dep = deprecatedNamesIn(entryFile);
  return checker.getExportsOfModule(moduleSym).map((sym) => {
    const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    const decls = resolved.getDeclarations() ?? [];
    const value = decls.some((d) =>
      ts.isFunctionDeclaration(d) || ts.isClassDeclaration(d) ||
      ts.isVariableDeclaration(d) || ts.isEnumDeclaration(d) ||
      (ts.isExportSpecifier(d) && !d.isTypeOnly));
    const deprecated = dep.has(sym.getName());
    return { name: sym.getName(), value, deprecated };
  });
}

export function checkExportBudget(root: string): GateFinding[] {
  const findings: GateFinding[] = [];
  const spec = JSON.parse(readFileSync(join(root, "aura.exports.json"), "utf8")) as {
    entries?: Record<string, { source?: string }>;
    deprecated?: Record<string, unknown>;
  };
  const entries = spec.entries ?? {};

  for (const budget of BUDGETS) {
    const entry = entries[budget.subpath];
    if (!entry?.source) {
      findings.push({ rule: "export-budget", file: "aura.exports.json", detail: `entry "${budget.subpath}" missing`, enforced: true });
      continue;
    }
    const names = exportsOf(root, join(root, entry.source));
    const live = names.filter((n) => !n.deprecated);
    const dep = names.filter((n) => n.deprecated);
    const values = live.filter((n) => n.value).length;
    if (budget.maxValues !== undefined && values > budget.maxValues) {
      findings.push({ rule: "export-budget", file: entry.source, detail: `"${budget.subpath}" exports ${values} live values > ${budget.maxValues}`, enforced: true });
    }
    if (budget.maxTotal !== undefined && live.length > budget.maxTotal) {
      findings.push({ rule: "export-budget", file: entry.source, detail: `"${budget.subpath}" exports ${live.length} live names > ${budget.maxTotal}`, enforced: true });
    }
    if (dep.length > 0) {
      findings.push({
        rule: "export-budget", file: entry.source,
        detail: `"${budget.subpath}" carries ${dep.length} deprecated union names (reported, not budgeted — §6.6 step 2; removed at 4.0.0)`,
        enforced: false,
      });
    }
  }

  // §6.1 topology: exactly the listed subpaths. "./game*" is a domain-package
  // subpath (packages/game) in the same class as ./animation etc. — added when
  // lane 09 split the game package; the §6.1 table predates it.
  const allowed = new Set([".", "./renderer", "./devtools", "./assets", "./animation", "./physics", "./audio", "./input", "./controls", "./scene", "./math", "./scripting", "./editor-runtime", "./workflows", "./ecs", "./game", "./game/capture", "./game/art", "./game/util", "./game/styles.css", "./scene/math", "./physics/solverless", "./physics/world"]);
  for (const subpath of Object.keys(entries)) {
    if (!allowed.has(subpath)) {
      findings.push({ rule: "export-budget", file: "aura.exports.json", detail: `non-§6.1 subpath "${subpath}" still live (move to deprecated map)`, enforced: true });
    }
  }
  return findings;
}

/** `no-evidence-in-runtime`: zero LIVE evidence-regex names on "." / "./renderer". */
export function checkNoEvidenceInRuntime(root: string): GateFinding[] {
  const findings: GateFinding[] = [];
  const spec = JSON.parse(readFileSync(join(root, "aura.exports.json"), "utf8")) as {
    entries?: Record<string, { source?: string }>;
  };
  for (const subpath of [".", "./renderer"]) {
    const entry = spec.entries?.[subpath];
    if (!entry?.source) continue;
    for (const n of exportsOf(root, join(root, entry.source)).filter((x) => !x.deprecated && EVIDENCE_RE.test(x.name))) {
      findings.push({ rule: "no-evidence-in-runtime", file: entry.source, detail: `"${subpath}" exports live name "${n.name}" matching the evidence regex`, enforced: true });
    }
  }
  return findings;
}
