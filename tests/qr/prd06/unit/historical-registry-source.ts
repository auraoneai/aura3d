import { readFileSync } from "node:fs";
import ts from "typescript";
import type { BenchSceneRegistration } from "../../../../benchmarks/quality-rebuild/shared/registry";
import { prd06SkinnedCharacterPosed } from "../../../../benchmarks/quality-rebuild/scenes/prd06/skinned-character-posed";
import { prd06CrossfadeFilmstrip } from "../../../../benchmarks/quality-rebuild/scenes/prd06/crossfade-filmstrip";
import { prd06MorphFace } from "../../../../benchmarks/quality-rebuild/scenes/prd06/morph-face";
import { prd06IkSlope } from "../../../../benchmarks/quality-rebuild/scenes/prd06/ik-slope";
import { prd06CharacterHero } from "../../../../benchmarks/quality-rebuild/scenes/prd06/character-hero";
import { prd06PerfTierLow, prd06PerfTierMedium, prd06PerfTierHigh, prd06PerfTierUltra } from "../../../../benchmarks/quality-rebuild/scenes/prd06/perf-tier";

// The historical comparison index re-exports browser adapters eagerly. Read
// its actual source declarations without evaluating those adapters. The paths
// below are relative to that index, not to this helper.
const expectedBindings = new Map<string, { module: string; spec: { readonly id: string } }>([
  ["prd06SkinnedCharacterPosed", { module: "../../../scenes/prd06/skinned-character-posed", spec: prd06SkinnedCharacterPosed }],
  ["prd06CrossfadeFilmstrip", { module: "../../../scenes/prd06/crossfade-filmstrip", spec: prd06CrossfadeFilmstrip }],
  ["prd06MorphFace", { module: "../../../scenes/prd06/morph-face", spec: prd06MorphFace }],
  ["prd06IkSlope", { module: "../../../scenes/prd06/ik-slope", spec: prd06IkSlope }],
  ["prd06CharacterHero", { module: "../../../scenes/prd06/character-hero", spec: prd06CharacterHero }],
  ["prd06PerfTierLow", { module: "../../../scenes/prd06/perf-tier", spec: prd06PerfTierLow }],
  ["prd06PerfTierMedium", { module: "../../../scenes/prd06/perf-tier", spec: prd06PerfTierMedium }],
  ["prd06PerfTierHigh", { module: "../../../scenes/prd06/perf-tier", spec: prd06PerfTierHigh }],
  ["prd06PerfTierUltra", { module: "../../../scenes/prd06/perf-tier", spec: prd06PerfTierUltra }]
]);

export function readHistoricalRegistrySource(): string {
  return readFileSync(new URL("../../../../benchmarks/quality-rebuild/three/scenes/prd06/index.ts", import.meta.url), "utf8");
}

/** Interpret only the literal registry contract; this does not execute or validate browser adapters. */
export function parseHistoricalRegistry(source: string): readonly BenchSceneRegistration[] {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true
  });
  if (transpiled.diagnostics?.length) throw new Error("Historical registry has invalid TypeScript syntax");
  const file = ts.createSourceFile("historical-registry.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const imports = new Map<string, { name: string; spec: { readonly id: string } }>();
  let registry: ts.ArrayLiteralExpression | undefined;

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause) throw new Error("Unsupported historical registry import");
      const clause = statement.importClause;
      if (clause.isTypeOnly) continue;
      if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) throw new Error("Unsupported historical registry import");
      for (const binding of clause.namedBindings.elements) {
        if (binding.isTypeOnly) continue;
        const name = binding.propertyName?.text ?? binding.name.text;
        const expected = expectedBindings.get(name);
        if (!expected || expected.module !== statement.moduleSpecifier.text || imports.has(binding.name.text)) {
          throw new Error(`Unexpected historical registry binding: ${name}`);
        }
        imports.set(binding.name.text, { name, spec: expected.spec });
      }
      continue;
    }
    // Adapter re-exports are preserved as historical source but are not loaded.
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.exportClause && ts.isNamedExports(statement.exportClause)) continue;
    if (ts.isVariableStatement(statement)
      && (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
      && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      && statement.declarationList.declarations.length === 1) {
      const declaration = statement.declarationList.declarations[0];
      if (!registry && ts.isIdentifier(declaration.name) && declaration.name.text === "scenes"
        && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) {
        registry = declaration.initializer;
        continue;
      }
    }
    throw new Error("Unsupported historical registry statement");
  }
  if (!registry) throw new Error("Missing literal historical scenes registry");

  const ids = new Set<string>();
  const usedBindings = new Set<string>();
  const entries: BenchSceneRegistration[] = [];
  for (const element of registry.elements) {
    if (!ts.isObjectLiteralExpression(element)) throw new Error("Unsupported historical registry entry");
    const properties = new Map<string, ts.Expression>();
    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)
        || !["id", "spec", "admittedAsReference"].includes(property.name.text)
        || properties.has(property.name.text)) throw new Error("Unsupported or duplicate historical registry property");
      properties.set(property.name.text, property.initializer);
    }
    const id = properties.get("id");
    const spec = properties.get("spec");
    const admitted = properties.get("admittedAsReference");
    if (!id || !ts.isStringLiteral(id) || !spec || !ts.isIdentifier(spec)) throw new Error("Invalid historical registry id or spec");
    const binding = imports.get(spec.text);
    if (!binding || binding.spec.id !== id.text || ids.has(id.text) || usedBindings.has(binding.name)) {
      throw new Error(`Missing, duplicate, or mismatched historical registry entry: ${id.text}`);
    }
    if (admitted && admitted.kind !== ts.SyntaxKind.TrueKeyword && admitted.kind !== ts.SyntaxKind.FalseKeyword) {
      throw new Error(`Invalid historical registry admission: ${id.text}`);
    }
    ids.add(id.text);
    usedBindings.add(binding.name);
    entries.push({ id: id.text, spec: binding.spec, ...(admitted ? { admittedAsReference: admitted.kind === ts.SyntaxKind.TrueKeyword } : {}) });
  }
  if (usedBindings.size !== expectedBindings.size) throw new Error("Historical registry is missing a required scene binding");
  return entries;
}

export function historicalRegistrations(): readonly BenchSceneRegistration[] {
  return parseHistoricalRegistry(readHistoricalRegistrySource());
}
