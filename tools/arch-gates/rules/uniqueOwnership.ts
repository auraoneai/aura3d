/**
 * PRD-15 T5.8 — `unique-ownership` (§6.12): a name exported by more than one
 * package index whose resolved declarations differ fails the gate. Re-export
 * chains that land on the same declaration are fine. Dated allowlist entries
 * in `tools/arch-gates/allowlist.json` tied to an open §12.4 request pass.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import type { GateFinding } from "../index";

interface AllowEntry {
  readonly rule: string;
  readonly name?: string;
  readonly packages?: readonly string[];
  readonly expires?: string;
  readonly request?: string;
}

function allowlist(root: string): readonly AllowEntry[] {
  const p = join(root, "tools/arch-gates/allowlist.json");
  if (!existsSync(p)) return [];
  const today = new Date().toISOString().slice(0, 10);
  return (JSON.parse(readFileSync(p, "utf8")) as AllowEntry[]).filter((e) => e.rule === "unique-ownership" && (!e.expires || e.expires >= today));
}

export function checkUniqueOwnership(root: string): GateFinding[] {
  const findings: GateFinding[] = [];
  const config = ts.readConfigFile(join(root, "tsconfig.base.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const pkgDir = join(root, "packages");
  // Each package's index is its PUBLIC "." entry (aura.exports.json for
  // engine, whose src/index.ts is the transitional pre-4.0 barrel).
  const exportsSpec = JSON.parse(readFileSync(join(root, "aura.exports.json"), "utf8")) as { entries?: Record<string, { source?: string }> };
  const indexes = readdirSync(pkgDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(pkgDir, d.name, "src/index.ts")))
    .map((d) => ({
      pkg: d.name,
      file: d.name === "engine" && exportsSpec.entries?.["."]?.source
        ? join(root, exportsSpec.entries["."].source!)
        : join(pkgDir, d.name, "src/index.ts"),
    }));
  const program = ts.createProgram({ rootNames: indexes.map((i) => i.file), options: parsed.options });
  const checker = program.getTypeChecker();

  // name -> declKey -> exporting packages
  const byName = new Map<string, Map<string, Set<string>>>();
  for (const { pkg, file } of indexes) {
    const sf = program.getSourceFile(file);
    const sym = sf && checker.getSymbolAtLocation(sf);
    if (!sym) continue;
    for (const ex of checker.getExportsOfModule(sym)) {
      const resolved = ex.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(ex) : ex;
      const decl = resolved.getDeclarations()?.[0];
      const declSf = decl?.getSourceFile();
      if (!declSf) continue;
      const key = `${relative(root, declSf.fileName).replace(/\\/g, "/")}#${decl?.pos ?? 0}`;
      const pkgs = byName.get(ex.getName()) ?? new Map<string, Set<string>>();
      const set = pkgs.get(key) ?? new Set<string>();
      set.add(pkg);
      pkgs.set(key, set);
      byName.set(ex.getName(), pkgs);
    }
  }

  const allowed = allowlist(root);
  for (const [name, decls] of byName) {
    const distinctDecls = [...decls.keys()];
    if (distinctDecls.length < 2) continue;
    const pkgs = [...new Set([...decls.values()].flatMap((s) => [...s]))].sort();
    if (pkgs.length < 2) continue;
    const isAllowed = allowed.some((e) => e.name === name && (!e.packages || e.packages.every((p) => pkgs.includes(p))));
    if (isAllowed) continue;
    findings.push({
      rule: "unique-ownership",
      file: "packages/*/src/index.ts",
      detail: `"${name}" declared by ${pkgs.map((p) => `@aura3d/${p}`).join(" + ")} with different declarations (${distinctDecls.slice(0, 3).join(", ")})`,
      enforced: true,
    });
  }
  return findings;
}
