/**
 * PRD-15 T5.1 — export-surface inventory.
 *
 * Builds the data model Phase 5 works from:
 *   1. Every export name of `packages/engine/src/agent-api/index.ts` (the
 *      current "." entry), `contracts/index.ts` and `lanes/index.ts` via the
 *      TypeScript checker — value/type split and JSDoc `@deprecated` status.
 *   2. Every repo file importing `"@aura3d/engine"` (the "." specifier, not a
 *      subpath): which names, value or type position, and the file's lane
 *      owner from `.github/QR_OWNERSHIP.json` longest-prefix rules.
 *
 * Output: `docs/architecture/root-export-inventory.json`
 * CLI: pnpm exec tsx --tsconfig tsconfig.base.json tools/export-surface/inventory.ts [--out <path>]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OWNERSHIP_PATH = join(REPO_ROOT, ".github/QR_OWNERSHIP.json");
const ENTRY = "packages/engine/src/agent-api/index.ts";

interface OwnershipRule {
  readonly owner: string;
  readonly paths: readonly string[];
}

function loadOwnership(): readonly OwnershipRule[] {
  const raw = JSON.parse(readFileSync(OWNERSHIP_PATH, "utf8")) as { defaultOwner?: string; rules?: OwnershipRule[] };
  DEFAULT_OWNER = raw.defaultOwner ?? "15";
  return raw.rules ?? [];
}

let DEFAULT_OWNER = "15";
let OWNERSHIP: readonly OwnershipRule[] | null = null;
const LANE_RE = /lanes\/(prd\d{2})|commands\/(prd\d{2})|scenes\/(prd\d{2})|diagnosticOnly\.(prd\d{2})\.|qr-(prd\d{2})-|impl\/(prd\d{2})-|evidence\/prd-?(\d{2})|PRD-(\d{2})-/;

function ownerOf(file: string): string {
  if (!OWNERSHIP) OWNERSHIP = loadOwnership();
  const laneM = LANE_RE.exec(file);
  if (laneM) {
    const nn = laneM.slice(1).find(Boolean)?.replace(/\D/g, "");
    if (nn) return nn.padStart(2, "0");
  }
  let best: OwnershipRule | null = null;
  let bestLen = -1;
  for (const rule of OWNERSHIP) {
    for (const p of rule.paths) {
      if ((file === p || file.startsWith(p)) && p.length > bestLen) {
        best = rule; bestLen = p.length;
      }
    }
  }
  return best?.owner ?? DEFAULT_OWNER;
}

export interface ExportRow {
  readonly name: string;
  readonly kind: "value" | "type";
  readonly deprecated: boolean;
  /** §6.6 destination parsed from the @deprecated JSDoc, when present. */
  readonly deprecatedTo?: string;
  /** Repo-relative file the name is declared in (first declaration). */
  readonly origin: string;
}

// Deprecated names live in publishedUnion.ts as `/** @deprecated <to>. Deleted...`
// `export { X }` pairs — parse them off the source (symbol JSDoc doesn't
// propagate through the alias).
export function deprecatedUnionNames(file = "packages/engine/src/agent-api/publishedUnion.ts"): ReadonlyMap<string, string> {
  const text = readFileSync(join(REPO_ROOT, file), "utf8");
  const out = new Map<string, string>();
  const re = /\/\*\*\s*@deprecated\s+([^*]+?)\*\/\s*export\s+(type\s+)?\{\s*([\w]+)\s*\}/gs;
  for (const m of text.matchAll(re)) {
    const to = /Use `([^`]+)`/.exec(m[1]!)?.[1] ?? "deleted";
    out.set(m[3]!, to);
  }
  return out;
}

export function moduleExports(entryFile: string): ExportRow[] {
  const configPath = join(REPO_ROOT, "tsconfig.base.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, REPO_ROOT);
  const program = ts.createProgram({ rootNames: [join(REPO_ROOT, entryFile)], options: parsed.options });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(join(REPO_ROOT, entryFile));
  if (!sf) throw new Error(`no source file: ${entryFile}`);
  const moduleSym = checker.getSymbolAtLocation(sf);
  if (!moduleSym) throw new Error(`no module symbol: ${entryFile}`);
  const rows: ExportRow[] = [];
  const dep = deprecatedUnionNames();
  for (const sym of checker.getExportsOfModule(moduleSym)) {
    const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    const decls = resolved.getDeclarations() ?? [];
    const isValue = decls.some((d) =>
      ts.isFunctionDeclaration(d) || ts.isClassDeclaration(d) ||
      ts.isVariableDeclaration(d) || ts.isEnumDeclaration(d) ||
      ts.isBindingElement(d) || (ts.isExportSpecifier(d) && !d.isTypeOnly));
    const deprecated = dep.has(sym.getName()) || sym.getJsDocTags().some((t) => t.name === "deprecated") ||
      resolved.getJsDocTags().some((t) => t.name === "deprecated");
    const originFile = decls[0]?.getSourceFile()?.fileName ?? "";
    const origin = originFile ? relative(REPO_ROOT, originFile).replace(/\\/g, "/") : "";
    rows.push({ name: sym.getName(), kind: isValue ? "value" : "type", deprecated, deprecatedTo: dep.get(sym.getName()), origin });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

interface ImportUse {
  readonly file: string;
  readonly names: readonly string[];
  readonly typeOnly: boolean;
  readonly star: boolean;
}

export function collectConsumers(): readonly ImportUse[] {
  const out = execFileSync("rg", ["-l", "from\\s+[\"']@aura3d/engine[\"']", "--glob", "*.ts", "--glob", "*.mts", "--glob", "*.tsx", "-g", "!node_modules/**", "-g", "!dist/**", "-g", "!packages/lean/dist/**", "."], { cwd: REPO_ROOT, encoding: "utf8" });
  const uses: ImportUse[] = [];
  const importRe = /import\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']@aura3d\/engine["']/gs;
  for (const fileRaw of out.trim().split("\n")) {
    if (!fileRaw) continue;
    const file = fileRaw.replace(/^\.\//, "");
    const text = readFileSync(join(REPO_ROOT, file), "utf8");
    const names = new Set<string>();
    let typeOnly = true;
    let star = false;
    for (const m of text.matchAll(importRe)) {
      const clause = m[2]!.trim();
      if (!m[1]) typeOnly = false;
      if (clause.startsWith("*")) { star = true; continue; }
      if (clause.startsWith("{")) {
        for (const part of clause.slice(1, -1).split(",")) {
          const seg = part.trim();
          if (!seg) continue;
          const name = seg.replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
          if (name) names.add(name);
          if (!seg.startsWith("type ")) typeOnly = false;
        }
      } else {
        star = true; // default import — treat as whole-namespace use
      }
    }
    uses.push({ file, names: [...names].sort(), typeOnly, star });
  }
  return uses;
}

export interface InventoryName {
  readonly kind: "value" | "type";
  readonly deprecated: boolean;
  readonly deprecatedTo?: string;
  readonly origin: string;
  readonly inContracts: boolean;
  readonly inLanes: boolean;
  consumers: { file: string; owner: string; typeOnly: boolean }[];
  starConsumers: string[];
}

function main(): void {
  const outPath = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]!
    : join(REPO_ROOT, "docs/architecture/root-export-inventory.json");

  const entry = moduleExports(ENTRY);
  const contracts = new Set(moduleExports("packages/engine/src/contracts/index.ts").map((r) => r.name));
  const lanes = new Set(moduleExports("packages/engine/src/lanes/index.ts").map((r) => r.name));
  const consumers = collectConsumers();

  const byName = new Map<string, InventoryName>();
  for (const row of entry) {
    byName.set(row.name, {
      kind: row.kind, deprecated: row.deprecated, deprecatedTo: row.deprecatedTo, origin: row.origin,
      inContracts: contracts.has(row.name), inLanes: lanes.has(row.name),
      consumers: [], starConsumers: [] as string[]
    });
  }
  const tallyUnknown = new Map<string, string[]>();
  for (const use of consumers) {
    const owner = ownerOf(use.file);
    if (use.star) {
      for (const n of byName.values()) n.starConsumers.push(use.file);
    }
    for (const name of use.names) {
      const row = byName.get(name);
      if (row) row.consumers.push({ file: use.file, owner, typeOnly: use.typeOnly });
      else {
        const arr = tallyUnknown.get(name) ?? [];
        arr.push(use.file);
        tallyUnknown.set(name, arr);
      }
    }
  }
  // dedupe star consumer lists
  for (const n of byName.values()) n.starConsumers.splice(0, n.starConsumers.length, ...new Set(n.starConsumers));

  const usedByApps = new Set<string>();
  for (const use of consumers) {
    if (/^(apps|templates|examples|benchmarks)\//.test(use.file) || use.file.startsWith("packages/create-aura3d/templates/")) {
      for (const n of use.names) usedByApps.add(n);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    entry: ENTRY,
    totals: {
      exports: entry.length,
      values: entry.filter((r) => r.kind === "value").length,
      types: entry.filter((r) => r.kind === "type").length,
      deprecated: entry.filter((r) => r.deprecated).length,
      consumerFiles: consumers.length,
      appTallyNames: usedByApps.size,
      unknownImportedNames: tallyUnknown.size
    },
    appTally: [...usedByApps].sort(),
    unknownImports: Object.fromEntries([...tallyUnknown].sort()),
    names: Object.fromEntries([...byName].map(([k, v]) => [k, v]))
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.totals, null, 2));
  console.log(`inventory → ${relative(REPO_ROOT, outPath)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
