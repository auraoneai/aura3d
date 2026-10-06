/*
 * T3.13 — option coverage scaffold + stale-diagnostic gate rule.
 *
 * `--scaffold` walks every exported node-builder in `packages/engine/src/agent-api/nodes/**`
 * (15-owned and lane-owned files are READ, never edited), resolves the option object of
 * every callable returning `AuraNodeBuilder`, and emits `compiler/optionCoverage.ts`
 * rows with auto-derived probe pairs (booleans, numbers, strings, literal unions,
 * tuples, colors). Fields whose types can't be auto-probed are emitted with
 * `probeValueA: "__FILL__"` so a human hands them real values.
 *
 * Gate mode (`runGates` calls `optionCoverageRule`): lists every
 * DIAGNOSTIC_ONLY_FIELDS key that a registered OptionCoverageRow now covers —
 * i.e. the owner wired the field and this lane's stale entry is due for the
 * daily sweep delete. Warn-mode.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import type { GateFinding } from "../index";

interface CoverageRowDraft {
  builder: string;
  field: string;
  probeValueA: unknown;
  probeValueB: unknown;
  ownerPrd: number;
  /** Type names of positional params that precede the options object (the test fills them). */
  beforeOptions: readonly string[];
}

const NODES_DIR = "packages/engine/src/agent-api/nodes";
const OUT_FILE = "packages/engine/src/agent-api/compiler/optionCoverage.ts";

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "types" || entry.name === "dist") continue;
      listTsFiles(full, acc);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

/* ------------------------------ ownership ------------------------------ */

function ownershipOf(repoRoot: string, file: string): number {
  const ownershipPath = join(repoRoot, ".github", "QR_OWNERSHIP.json");
  if (!existsSync(ownershipPath)) return 15;
  const json = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
    defaultOwner?: number;
    rules?: { paths?: string[]; owner?: number }[];
  };
  let owner = json.defaultOwner ?? 15;
  // QR_OWNERSHIP.json rules are prefix globs; last match wins.
  for (const rule of json.rules ?? []) {
    for (const pattern of rule.paths ?? []) {
      const base = pattern.replace(/\*\*?/g, "");
      if (file.startsWith(base)) owner = rule.owner ?? owner;
    }
  }
  return owner;
}

/* --------------------------- probe synthesis --------------------------- */

function probeForType(checker: ts.TypeChecker, type: ts.Type): { a: unknown; b: unknown } | undefined {
  const flags = type.getFlags();
  if (flags & ts.TypeFlags.Boolean || flags & ts.TypeFlags.BooleanLiteral) return { a: false, b: true };
  if (flags & ts.TypeFlags.Number || flags & ts.TypeFlags.NumberLiteral) return { a: 1, b: 2 };
  if (flags & ts.TypeFlags.String || flags & ts.TypeFlags.StringLiteral) {
    if (type.isStringLiteral()) return { a: String(type.value), b: "__FILL__" };
    return { a: "probe-a", b: "probe-b" };
  }
  if (type.isUnion()) {
    const literals = type.types.filter((t) => t.isLiteral());
    if (literals.length >= 2) {
      const lit = (t: ts.Type) => (t.isLiteral() ? t.value : undefined);
      return { a: lit(literals[0]), b: lit(literals[literals.length - 1]) };
    }
    // union like number | AuraVec3 — probe each constituent against the second
    const parts = type.types.slice(0, 2);
    const a = probeForType(checker, parts[0]);
    const b = probeForType(checker, parts[1] ?? parts[0]);
    if (a && b) return { a: a.a, b: b.b };
    return undefined;
  }
  const text = checker.typeToString(type);
  if (/AuraVec3|\[number, number, number\]/.test(text)) return { a: [0, 0, 0], b: [1, 1, 1] };
  if (/AuraVec2|\[number, number\]/.test(text)) return { a: [0, 0], b: [1, 1] };
  if (/AuraVec4|\[number, number, number, number\]/.test(text)) return { a: [0, 0, 0, 0], b: [1, 1, 1, 1] };
  if (/AuraColor/.test(text)) return { a: "#000000", b: "#ffffff" };
  if (/Quat|Quaternion/.test(text)) return { a: [0, 0, 0, 1], b: [0, 0, 0.5, 1] };
  if (/^(AuraTransformSpec|AuraTransform|AuraAnimationSpec|AuraAnimationRef|AuraPhysicsSpec|AuraNodePhysicsSpec|AuraMaterialOverrides?|AuraMaterialRef|AuraLabelStyle|AuraHitTest|AuraDecalSpec|AuraInstanceColorSpec)/.test(text)) {
    // Typed option object: coverage only needs distinguishable input shapes.
    return { a: { __probeA: 1 }, b: { __probeB: 2 } };
  }
  if (checker.isArrayType(type) || text.startsWith("readonly")) {
    const inner = (type as ts.TypeReference).typeArguments?.[0];
    const probe = inner ? probeForType(checker, inner) : undefined;
    if (probe) return { a: [probe.a], b: [probe.b, probe.b] };
    return { a: [], b: [{ __probe: 1 }] };
  }
  if (type.getProperties().length > 0) return { a: { __probeA: 1 }, b: { __probeB: 2 } };
  return undefined;
}

/* ------------------------------ scaffold ------------------------------- */

function isBuilderType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const text = checker.typeToString(type);
  return text.includes("AuraNodeBuilder");
}

function optionTypeOf(checker: ts.TypeChecker, decl: ts.SignatureDeclaration): { type: ts.Type; before: string[] } | undefined {
  for (let index = 0; index < decl.parameters.length; index++) {
    const param = decl.parameters[index];
    const paramName = ts.isIdentifier(param.name) ? param.name.text : "";
    // Only a parameter NAMED like an options bag counts; `spec`/`descriptor`/
    // `args` params are positional fillers (geometry spec, asset, text).
    if (!/^(options|opts|option|config|settings|o|props)$/.test(paramName)) continue;
    const before = decl.parameters
      .slice(0, index)
      .map((p) => checker.typeToString(checker.getTypeAtLocation(p)).replace(/import\([^)]*\)\./g, "").slice(0, 40));
    return { type: checker.getTypeAtLocation(param), before };
  }
  // Single-param builders still count: use the LAST param when it is an object
  // type (leading args are positional fillers, options trail them).
  const last = decl.parameters[decl.parameters.length - 1];
  if (!last) return undefined;
  const type = checker.getTypeAtLocation(last);
  if (type.getProperties().length === 0) return undefined;
  const before = decl.parameters
    .slice(0, -1)
    .map((p) => checker.typeToString(checker.getTypeAtLocation(p)).replace(/import\([^)]*\)\./g, "").slice(0, 40));
  return { type, before };
}

export function scaffoldOptionCoverage(repoRoot: string): void {
  const nodesAbs = join(repoRoot, NODES_DIR);
  const files = [...listTsFiles(nodesAbs), join(nodesAbs, "types.ts")].filter((f) => existsSync(f));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    strict: false,
    noEmit: true
  });
  const checker = program.getTypeChecker();
  const rows: CoverageRowDraft[] = [];

  const emitRows = (builder: string, type: ts.Type, before: readonly string[], file: string) => {
    const apparent = checker.getApparentType(type);
    for (const prop of apparent.getProperties()) {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!decl) continue;
      // Members of lib types (string.toString etc.) are not option fields.
      if (decl.getSourceFile().fileName.includes("/lib.") || decl.getSourceFile().fileName.endsWith(".d.ts") && /typescript|node\/\@types/.test(decl.getSourceFile().fileName)) continue;
      const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
      const probe = probeForType(checker, propType);
      rows.push({
        builder,
        field: prop.name,
        probeValueA: probe ? probe.a : "__FILL__",
        probeValueB: probe ? probe.b : "__FILL__",
        ownerPrd: ownershipOf(repoRoot, relative(repoRoot, file)),
        beforeOptions: before
      });
    }
  };

  const unwrap = (expr: ts.Expression): ts.Expression => {
    let current = expr;
    while (ts.isAsExpression(current) || (ts as { isSatisfiesExpression?: (e: ts.Node) => boolean }).isSatisfiesExpression?.(current)) {
      current = (current as ts.AsExpression).expression;
    }
    return current;
  };

  const visitNamespace = (prefix: string, node: ts.Node, file: string) => {
    // object literal members: `spot: (options) => builder`, `ambient: (o) => ...`
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const prop of node.properties) {
      if (ts.isSpreadAssignment(prop)) {
        // `...vfxEffectBuilders` — recurse into the source object's declaration
        // so a wrapped composite (effects) emits its real leaf rows. Imported
        // sources arrive as alias symbols: unwrap via getAliasedSymbol first.
        let sym = checker.getSymbolAtLocation(prop.expression);
        if (sym && (sym.flags & ts.SymbolFlags.Alias)) sym = checker.getAliasedSymbol(sym);
        const decl = sym?.declarations?.find((d): d is ts.VariableDeclaration => ts.isVariableDeclaration(d));
        if (decl?.initializer && ts.isObjectLiteralExpression(unwrap(decl.initializer))) visitNamespace(prefix, unwrap(decl.initializer), file);
        continue;
      }
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : "";
      if (!name) continue;
      const inner = unwrap(prop.initializer);
      if (ts.isObjectLiteralExpression(inner)) {
        visitNamespace(`${prefix}.${name}`, inner, file);
        continue;
      }
      if (!ts.isArrowFunction(inner) && !ts.isFunctionExpression(inner)) continue;
      const ret = checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(inner)!);
      if (!ret || !isBuilderType(checker, ret)) continue;
      const opt = optionTypeOf(checker, inner);
      if (opt) emitRows(`${prefix}.${name}`, opt.type, opt.before, file);
      else rows.push({ builder: `${prefix}.${name}`, field: "__FILL_OPTIONS__", probeValueA: "__FILL__", probeValueB: "__FILL__", ownerPrd: ownershipOf(repoRoot, relative(repoRoot, file)), beforeOptions: [] });
    }
  };

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    ts.forEachChild(source, (node) => {
      // `export function name(options: T)` returning AuraNodeBuilder
      if (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        const sig = checker.getSignatureFromDeclaration(node);
        const ret = sig ? checker.getReturnTypeOfSignature(sig) : undefined;
        if (ret && isBuilderType(checker, ret) && node.name) {
          const opt = optionTypeOf(checker, node);
          if (opt) emitRows(node.name.text, opt.type, opt.before, file);
        }
      }
      // `export const ns = { member: (options) => builder }`
      if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          const init = unwrap(decl.initializer);
          if (ts.isObjectLiteralExpression(init)) {
            visitNamespace(decl.name.text, init, file);
            continue;
          }
          if (!ts.isArrowFunction(init) && !ts.isCallExpression(init)) continue;
          const sig = ts.isArrowFunction(init) ? checker.getSignatureFromDeclaration(init) : undefined;
          const ret = sig ? checker.getReturnTypeOfSignature(sig) : checker.getTypeAtLocation(init);
          if (ret && isBuilderType(checker, ret)) {
            const opt = sig ? optionTypeOf(checker, init as ts.SignatureDeclaration) : undefined;
            if (opt) emitRows(decl.name.text, opt.type, opt.before, file);
          }
        }
      }
    });
  }

  const header = `// GENERATED by tools/arch-gates/rules/option-coverage.ts --scaffold (T3.13).
// Every option field of every node builder, with A/B probe values. Fields emitted
// as "__FILL__" need hand-filled probes; fields the compiler does not consume go
// to diagnosticOnly.prd15.ts instead (ownerPrd = the lane that must wire them).
import { registerOptionCoverage } from "../../contracts/compiler.js";
import type { OptionCoverageRow } from "../../contracts/compiler.js";
`;
  // Chunked pushes, ~10 rows per statement, not one array literal: TS computes
  // the element union of a literal and 2,800 heterogeneous rows trip TS2590
  // ("union too complex"); one row per line trips the 2,500 max-file-lines cap.
  const chunks: string[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10).map((r) => {
      const before = r.beforeOptions.length ? `, beforeOptions: ${JSON.stringify(r.beforeOptions)}` : "";
      return `{ builder: ${JSON.stringify(r.builder)}, field: ${JSON.stringify(r.field)}, probeValueA: ${JSON.stringify(r.probeValueA)}, probeValueB: ${JSON.stringify(r.probeValueB)}, ownerPrd: ${r.ownerPrd}${before} }`;
    });
    chunks.push(`OPTION_COVERAGE_ROWS.push(${chunk.join(", ")});`);
  }
  const out = `${header}\nexport const OPTION_COVERAGE_ROWS: OptionCoverageRow[] = [];\n\n${chunks.join("\n")}\n\nregisterOptionCoverage(OPTION_COVERAGE_ROWS);\n`;
  writeFileSync(join(repoRoot, OUT_FILE), out);
  console.log(`option-coverage scaffold: wrote ${rows.length} rows to ${OUT_FILE}`);
}

/* ------------------------------ gate rule ------------------------------ */

export function optionCoverageRule(files: string[], root: string): GateFinding[] {
  // Sweep semantics (T3.13): a lane's OWN diagnostic-only entries
  // (compiler/diagnosticOnly.prdNN.ts) become stale once a coverage row for
  // that builder.field is registered — by the scaffold or by the owning lane's
  // registerOptionCoverage call in its own module. Contract seeds in
  // DIAGNOSTIC_ONLY_FIELDS are curated pre-discovery claims and are not
  // swept here.
  void files;
  const agentApiDir = join(root, "packages/engine/src/agent-api");
  const diagFiles = listTsFiles(agentApiDir).filter((f) => /diagnosticOnly\.prd\d+\.ts$/.test(f));
  const coverageFile = join(root, OUT_FILE);
  const findings: GateFinding[] = [];
  const covered = new Set<string>();
  if (existsSync(coverageFile)) {
    const rows = readFileSync(coverageFile, "utf8");
    for (const match of rows.matchAll(/builder:\s*"([^"]+)",\s*field:\s*"([^"]+)"/g)) covered.add(`${match[1]}.${match[2]}`);
  }
  // Owner-registered rows: registerOptionCoverage literals in any agent-api module.
  for (const file of listTsFiles(agentApiDir)) {
    if (file === coverageFile) continue;
    const source = readFileSync(file, "utf8");
    if (!source.includes("registerOptionCoverage")) continue;
    for (const match of source.matchAll(/builder:\s*"([^"]+)",\s*field:\s*"([^"]+)"/g)) covered.add(`${match[1]}.${match[2]}`);
  }
  for (const diagFile of diagFiles) {
    const source = readFileSync(diagFile, "utf8");
    for (const match of source.matchAll(/"([a-zA-Z0-9_.-]+)":\s*\{\s*reason:/g)) {
      const key = match[1];
      if (covered.has(key) || covered.has(`${key.slice(0, key.lastIndexOf("."))}.*`)) {
        findings.push({
          rule: "option-coverage",
          file: relative(root, diagFile),
          detail: `diagnostic-only field "${key}" is now covered by a registered row — delete the stale entry (daily sweep)`
        });
      }
    }
  }
  return findings;
}
