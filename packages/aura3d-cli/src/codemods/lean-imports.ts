/**
 * `lean-imports` codemod (PRD-15 T4.7, C-39).
 *
 * Rewrites `@aura3d/lean[/(product|game)]` imports to `@aura3d/engine` after
 * T4.6 turned the lean package into a deprecated §7.5 re-export shim.
 *
 *   import { createAuraApp, scene } from "@aura3d/lean/product";
 *     → import { createAuraApp, scene } from "@aura3d/engine";
 *
 * Named bindings map mechanically:
 *  - `exact`       — the name is exported unchanged by the engine
 *  - `approximate` — a renamed engine equivalent, applied as an alias so local
 *                    references keep compiling (`AuraLeanNodeBuilder` →
 *                    `AuraNodeBuilder as AuraLeanNodeBuilder`)
 *  - `none`        — lean-only API deleted by PRD-15 (the whole `base.ts` /
 *                    `ArcadeRuntime.ts` surface); reported, no edit applied to
 *                    the binding
 *
 * `import * as lean` namespaces and default imports are reported `none` —
 * the lean package never had them, and mechanical namespace rewriting is
 * unsafe.
 */

import ts from "typescript";

export interface CodemodRow {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;
  readonly note?: string;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const LEAN_MODULES = new Set(["@aura3d/lean", "@aura3d/lean/product", "@aura3d/lean/game"]);
const ENGINE = "@aura3d/engine";

/** Renames with an engine equivalent; applied as `<new> as <old>` so call sites stay valid. */
const RENAMED_BINDINGS: Readonly<Record<string, string>> = {
  AuraLeanNodeBuilder: "AuraNodeBuilder",
  LeanPlatformerEvent: "GamePlatformerEvent",
  LeanPlatformerEventType: "GamePlatformerEventType",
  LeanPlatformerLevel: "GamePlatformerLevel",
  LeanPlatformerSnapshot: "GamePlatformerSnapshot",
  LeanGameInputOptions: "GameInputOptions",
  LeanGameInputController: "GameInputController"
};

/** Lean-only names deleted by PRD-15 — no engine equivalent. */
function hasNoEngineEquivalent(name: string): boolean {
  if (name in RENAMED_BINDINGS) return false;
  return (
    /^createLean/.test(name) ||
    /^Lean(?!PlatformerEvent|PlatformerLevel|PlatformerSnapshot|GameInput)/.test(name) ||
    /^AuraLean(?!NodeBuilder)/.test(name) ||
    name === "createAuraAppWithRenderer" ||
    name === "createAuraLeanModelMatrix" ||
    name === "AuraLeanGameApp" ||
    /^Sdf/.test(name) ||
    name === "SDF_FONT_SCOPE_NOTE" ||
    name === "SDF_SUPPORTED_GLYPHS"
  );
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function isLeanModuleSpecifier(node: ts.Expression | undefined): boolean {
  return node !== undefined && ts.isStringLiteral(node) && LEAN_MODULES.has(node.text);
}

/** Build the replacement text for one import clause, collecting rows. */
function rewriteClause(
  sf: ts.SourceFile,
  clause: ts.ImportClause,
  moduleText: string,
  rows: CodemodRow[],
  edits: Edit[]
): void {
  const { line } = { line: lineOf(sf, clause.getStart(sf)) };
  const named = clause.namedBindings;
  if (named !== undefined && ts.isNamespaceImport(named)) {
    rows.push({ file: sf.fileName, line, construct: `import * as ${named.name.text} from ${moduleText}`, mapping: "none", target: ENGINE, note: "namespace import cannot be rewritten mechanically" });
    return;
  }
  if (clause.name !== undefined) {
    rows.push({ file: sf.fileName, line, construct: `import ${clause.name.text} from ${moduleText}`, mapping: "none", target: ENGINE, note: "lean has no default export; manual migration required" });
  }
  if (named === undefined || !ts.isNamedImports(named)) {
    // Bare side-effect import (`import "@aura3d/lean"`): the deprecation warn is
    // intentional; rewriting to the engine changes semantics. Report only.
    if (named === undefined) {
      rows.push({ file: sf.fileName, line, construct: `import ${moduleText}`, mapping: "none", target: ENGINE, note: "side-effect import; the deprecation warn is the point" });
    }
    return;
  }

  const clauseIsTypeOnly = clause.isTypeOnly;
  for (const spec of named.elements) {
    const imported = spec.propertyName?.text ?? spec.name.text;
    const typeKeyword = clauseIsTypeOnly || spec.isTypeOnly ? "type " : "";
    if (imported in RENAMED_BINDINGS) {
      const engineName = RENAMED_BINDINGS[imported];
      edits.push({ start: spec.getStart(sf), end: spec.getEnd(), text: `${typeKeyword}${engineName} as ${spec.name.text}` });
      rows.push({ file: sf.fileName, line: lineOf(sf, spec.getStart(sf)), construct: `import { ${spec.getText(sf)} } from ${moduleText}`, mapping: "approximate", target: `${ENGINE} (${engineName})`, note: "renamed binding applied as alias" });
    } else if (hasNoEngineEquivalent(imported)) {
      rows.push({ file: sf.fileName, line: lineOf(sf, spec.getStart(sf)), construct: `import { ${spec.getText(sf)} } from ${moduleText}`, mapping: "none", target: ENGINE, note: "deleted lean-only API; manual migration required" });
    } else {
      rows.push({ file: sf.fileName, line: lineOf(sf, spec.getStart(sf)), construct: `import { ${spec.getText(sf)} } from ${moduleText}`, mapping: "exact", target: ENGINE });
    }
  }
}

export function createLeanImportsCodemod() {
  return {
    name: "lean-imports",
    owner: "prd15",
    description: "Rewrites @aura3d/lean[/(product|game)] imports to @aura3d/engine (PRD-15 T4.7).",
    transform(source: string, fileName: string) {
      const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const rows: CodemodRow[] = [];
      const edits: Edit[] = [];

      for (const statement of sf.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        if (!isLeanModuleSpecifier(statement.moduleSpecifier)) continue;
        const moduleText = (statement.moduleSpecifier as ts.StringLiteral).text;
        const clause = statement.importClause;
        if (clause === undefined) {
          rows.push({ file: fileName, line: lineOf(sf, statement.getStart(sf)), construct: `import "${moduleText}"`, mapping: "none", target: ENGINE, note: "side-effect import" });
          continue;
        }
        rewriteClause(sf, clause, `"${moduleText}"`, rows, edits);
        // Rewrite the module specifier itself.
        edits.push({
          start: statement.moduleSpecifier.getStart(sf),
          end: statement.moduleSpecifier.getEnd(),
          text: `"${ENGINE}"`
        });
      }

      // `export ... from "@aura3d/lean"` re-exports get the same treatment.
      for (const statement of sf.statements) {
        if (!ts.isExportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier;
        if (specifier === undefined || !isLeanModuleSpecifier(specifier)) continue;
        const moduleText = (specifier as ts.StringLiteral).text;
        const clause = statement.exportClause;
        if (clause !== undefined && ts.isNamedExports(clause)) {
          const exportIsTypeOnly = statement.isTypeOnly;
          for (const spec of clause.elements) {
            const exported = spec.propertyName?.text ?? spec.name.text;
            const typeKeyword = exportIsTypeOnly || spec.isTypeOnly ? "type " : "";
            if (exported in RENAMED_BINDINGS) {
              const engineName = RENAMED_BINDINGS[exported];
              edits.push({ start: spec.getStart(sf), end: spec.getEnd(), text: `${typeKeyword}${engineName} as ${spec.name.text}` });
              rows.push({ file: fileName, line: lineOf(sf, spec.getStart(sf)), construct: `export { ${spec.getText(sf)} } from "${moduleText}"`, mapping: "approximate", target: `${ENGINE} (${engineName})` });
            } else if (hasNoEngineEquivalent(exported)) {
              rows.push({ file: fileName, line: lineOf(sf, spec.getStart(sf)), construct: `export { ${spec.getText(sf)} } from "${moduleText}"`, mapping: "none", target: ENGINE, note: "deleted lean-only API" });
            } else {
              rows.push({ file: fileName, line: lineOf(sf, spec.getStart(sf)), construct: `export { ${spec.getText(sf)} } from "${moduleText}"`, mapping: "exact", target: ENGINE });
            }
          }
        } else {
          rows.push({ file: fileName, line: lineOf(sf, statement.getStart(sf)), construct: `export * from "${moduleText}"`, mapping: "none", target: ENGINE, note: "star re-export" });
        }
        edits.push({
          start: specifier.getStart(sf),
          end: specifier.getEnd(),
          text: `"${ENGINE}"`
        });
      }

      // `import("@aura3d/lean")` dynamic imports: specifier rewrite only.
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const [arg] = node.arguments;
          if (arg !== undefined && ts.isStringLiteral(arg) && LEAN_MODULES.has(arg.text)) {
            edits.push({ start: arg.getStart(sf), end: arg.getEnd(), text: `"${ENGINE}"` });
            rows.push({ file: fileName, line: lineOf(sf, arg.getStart(sf)), construct: `import("${arg.text}")`, mapping: "exact", target: ENGINE });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);

      const code = edits
        .sort((a, b) => b.start - a.start)
        .reduce((acc, edit) => acc.slice(0, edit.start) + edit.text + acc.slice(edit.end), source);
      return { code, rows };
    }
  };
}
