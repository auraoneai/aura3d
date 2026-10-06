/**
 * T5.3 — packages/rendering/src/index.ts named-export expansion.
 * For each `export * from "<mod>"` (except ./contracts + ./lanes which the
 * spec keeps as `export *`), enumerate the module's exports and keep only
 * names imported by engine, other packages, apps/tests/tools, or that appear
 * in the engine "./renderer" public entry.
 * Usage: index.ts --write|--check|--report
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const BARREL = join(REPO_ROOT, "packages/rendering/src/index.ts");

function moduleExportsOf(absFile: string): { values: string[]; types: string[] } {
  const config = ts.readConfigFile(join(REPO_ROOT, "tsconfig.base.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, REPO_ROOT);
  const program = ts.createProgram({ rootNames: [absFile], options: { ...parsed.options, skipLibCheck: true } });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(absFile);
  if (!sf) throw new Error(`no source file: ${absFile}`);
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) throw new Error(`no module symbol: ${absFile}`);
  const values: string[] = [];
  const types: string[] = [];
  for (const sym of checker.getExportsOfModule(mod)) {
    const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    const decls = resolved.getDeclarations() ?? [];
    const isTypeOnly = decls.every((d) =>
      ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d) || ts.isTypeParameterDeclaration(d));
    (isTypeOnly ? types : values).push(sym.getName());
  }
  return { values: values.sort(), types: types.sort() };
}

function renderingImportTally(): Set<string> {
  // every name imported from "@aura3d/rendering" (bare) anywhere outside the
  // rendering package itself
  const SPEC = "(?:@aura3d/rendering|@aura3d/engine/rendering|[.\\w/]*packages/rendering/src(?:/index(?:\\.js)?)?)";
  const files = execFileSync("rg", ["-l", `from ["']${SPEC}["']`, "."], { cwd: REPO_ROOT }).toString()
    .split("\n").map((s) => s.replace(/^\.\//, "").trim()).filter(Boolean)
    .filter((f) => !f.startsWith("node_modules") && !f.includes("/dist/") && !f.startsWith("packages/rendering/"));
  const names = new Set<string>();
  for (const file of files) {
    const text = readFileSync(join(REPO_ROOT, file), "utf8");
    const re = new RegExp(`(?:import|export)\\s+(?:type\\s+)?([^;]+?)\\s+from\\s+["']${SPEC}["']`, "gs");
    for (const m of text.matchAll(re)) {
      const spec = m[1]!;
      const braces = /\{([^}]*)\}/.exec(spec)?.[1];
      if (!braces) continue;
      for (const part of braces.split(",")) {
        const n = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
        if (n) names.add(n);
      }
    }
  }
  return names;
}

function contractNames(): Set<string> {
  const out = new Set<string>();
  for (const file of [
    "packages/rendering/src/contracts/index.ts",
    "packages/rendering/src/lanes/index.ts"
  ]) {
    const abs = join(REPO_ROOT, file);
    if (!existsSync(abs)) continue;
    const ex = moduleExportsOf(abs);
    for (const n of [...ex.values, ...ex.types]) out.add(n);
  }
  return out;
}

export function rewriteBarrel(report: boolean): { source: string; kept: Map<string, string[]>; dropped: Map<string, string[]> } {
  const text = readFileSync(BARREL, "utf8");
  const tally = renderingImportTally();
  const contracts = contractNames();
  const keepExtra = new Set(tally);
  for (const n of contracts) keepExtra.add(n);
  // Names still published from "." (live or deprecated) must stay reachable —
  // they re-export through agent-api → this barrel.
  const dispPath = join(REPO_ROOT, "docs/architecture/root-export-dispositions.json");
  if (existsSync(dispPath)) {
    const dispositions = (JSON.parse(readFileSync(dispPath, "utf8")) as { entries: { name: string; disposition: string; origin?: string }[] }).entries;
    for (const d of dispositions) {
      if (d.disposition !== "drop") keepExtra.add(d.name);
    }
  }
  const kept = new Map<string, string[]>();
  const dropped = new Map<string, string[]>();

  // Names the barrel already exports via named statements — expansions must not
  // re-declare them (duplicate-identifier errors).
  const alreadyNamed = new Set<string>();
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}\s+from/g)) {
    for (const part of m[1]!.split(",")) {
      const n = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!.trim();
      if (n) alreadyNamed.add(n);
    }
  }
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/g)) {
    alreadyNamed.add(m[1]!);
  }

  const lines = text.split("\n");
  const out: string[] = [];
  const starRe = /^export \* from "(\.[^"]+)";?\s*$/;
  for (const line of lines) {
    const m = starRe.exec(line);
    if (!m) { out.push(line); continue; }
    const spec = m[1]!;
    if (spec.startsWith("./contracts") || spec.startsWith("./lanes")) { out.push(line); continue; }
    const abs = resolve(dirname(BARREL), `${spec.replace(/\.js$/, "")}`);
    const target = existsSync(`${abs}.ts`) ? `${abs}.ts` : join(abs, "index.ts");
    const ex = moduleExportsOf(target);
    const keptNames = [...ex.values, ...ex.types].filter((n) => keepExtra.has(n) && !alreadyNamed.has(n)).sort();
    const droppedNames = [...ex.values, ...ex.types].filter((n) => !keepExtra.has(n)).sort();
    kept.set(spec, keptNames);
    dropped.set(spec, droppedNames);
    if (keptNames.length === 0) {
      out.push(`// T5.3: "${spec}" names had no importers — removed from the barrel.`);
      continue;
    }
    const vals = keptNames.filter((n) => ex.values.includes(n));
    const tys = keptNames.filter((n) => ex.types.includes(n));
    if (vals.length) out.push(`export { ${vals.join(", ")} } from "${spec}";`);
    if (tys.length) out.push(`export type { ${tys.join(", ")} } from "${spec}";`);
    for (const n of keptNames) alreadyNamed.add(n);
  }
  const source = out.join("\n");
  if (report) {
    const kv = [...kept.values()].reduce((a, b) => a + b.length, 0);
    const dv = [...dropped.values()].reduce((a, b) => a + b.length, 0);
    console.log(`kept ${kv} names, dropped ${dv}`);
    for (const [spec, names] of [...dropped.entries()].sort()) {
      if (names.length) console.log(`  ${spec}: -${names.length}`);
    }
  }
  return { source, kept, dropped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { source } = rewriteBarrel(process.argv.includes("--report") || true);
  if (process.argv.includes("--write")) writeFileSync(BARREL, source);
  else if (process.argv.includes("--check")) {
    const cur = readFileSync(BARREL, "utf8");
    process.exit(cur === source ? 0 : 1);
  }
}
