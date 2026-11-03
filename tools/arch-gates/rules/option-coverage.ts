/**
 * Discovers documented option keys and audits the curated, typed A/B probes.
 * Discovery never invents values: an unknown option becomes an actionable
 * finding instead of a fabricated "__probe" object or a false coverage row.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import type { GateFinding } from "../index";

export interface DocumentedOption {
  readonly builder: string;
  readonly field: string;
  readonly file: string;
}

export interface OptionProbeSummary {
  readonly builder: string;
  readonly field: string;
  readonly disposition: "runtime" | "compile-only" | "unsupported" | "unverified";
  readonly observation?: string;
  readonly reason?: string;
}

const OUT_FILE = "packages/engine/src/agent-api/compiler/optionCoverage.ts";
// These are public authoring namespaces, not the registry's current rows: a
// newly documented builder must not vanish from the audit for lack of a row.
const PUBLIC_BUILDER = /^(?:(?:primitives|instances|geometry|material|lights|effects|interactions)\.[A-Za-z_$][\w$]*|model)$/;
const GAME_EFFECT_METHODS = new Set(["hitSpark", "blockSpark", "impactDecal", "groundDust", "dashTrail", "slashTrail", "impactFlash", "auraBurst", "shockwave", "ringShockwave", "superFlash"]);

function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```(?:ts|typescript|tsx|js|javascript)\s*\n([\s\S]*?)```/g)].map((match) => match[1]!);
}

/** Parse code, not text patterns: nested calls and comments cannot create keys. */
function optionObjects(expression: ts.Expression | undefined): readonly ts.ObjectLiteralExpression[] {
  if (!expression) return [];
  if (ts.isObjectLiteralExpression(expression)) return [expression];
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return optionObjects(expression.expression);
  if (ts.isConditionalExpression(expression)) return [...optionObjects(expression.whenTrue), ...optionObjects(expression.whenFalse)];
  return [];
}

export function documentedOptionReferences(markdown: string, file: string): DocumentedOption[] {
  const found = new Map<string, DocumentedOption>();
  const blocks = codeBlocks(markdown);
  // A game controller is frequently named `effects` in examples. It is not
  // the root `effects` builder namespace even when used in later snippets.
  const shadowsRootEffects = blocks.some((block) => {
    const parsed = ts.createSourceFile("example.ts", block, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let found = false;
    const scan = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "effects" && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(parsed) === "game.effects") found = true;
      ts.forEachChild(node, scan);
    };
    scan(parsed);
    return found;
  });
  for (const block of blocks) {
    const source = ts.createSourceFile("example.ts", block, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const builder = node.expression.getText(source);
        // API reference sketches may resemble calls but contain `name?` and
        // union-type notation. Do not mistake malformed pseudocode for an
        // executable example or manufacture keys from parser recovery.
        const parseErrors = (source as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
        const malformed = parseErrors.some((diagnostic) => diagnostic.start !== undefined && diagnostic.start >= node.getStart(source) && diagnostic.start < node.end);
        if (!malformed && PUBLIC_BUILDER.test(builder) && !(shadowsRootEffects && builder.startsWith("effects.") && GAME_EFFECT_METHODS.has(builder.slice("effects.".length)))) {
          // These calls have a required positional object/asset before their
          // options. Never mistake a geometry spec or asset literal for options.
          const positional = builder === "geometry.custom" || builder === "instances.model" || builder === "model" || builder === "primitives.custom";
          const candidate = positional ? node.arguments[1] : node.arguments[0];
          for (const options of optionObjects(candidate)) for (const property of options.properties) {
            if (ts.isSpreadAssignment(property) || ("name" in property && property.name && ts.isComputedPropertyName(property.name))) {
              // A spread or computed key can carry more options than the AST
              // can name; report the gap rather than silently omitting it.
              found.set(`${builder}.*`, { builder, field: "*", file });
              continue;
            }
            if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property) && !ts.isMethodDeclaration(property)) continue;
            if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
            const field = property.name.text;
            found.set(`${builder}.${field}`, { builder, field, file });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...found.values()];
}

/**
 * Read explicit rows from the typed registry without importing its runtime
 * dependencies. The typed helper's first, second and fifth arguments are the
 * builder, field and downstream observation. Unsupported rows are literals.
 */
export function readOptionProbeSummaries(sourceText: string): OptionProbeSummary[] {
  const source = ts.createSourceFile(OUT_FILE, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const helpers = new Set<string>();
  const rows: OptionProbeSummary[] = [];
  const literal = (node: ts.Node | undefined): string | undefined => node && ts.isStringLiteral(node) ? node.text : undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "forOptions") {
      helpers.add(node.name.text);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helpers.has(node.expression.text)) {
      const builder = literal(node.arguments[0]);
      const field = literal(node.arguments[1]);
      const observation = literal(node.arguments[4]);
      if (builder && field) rows.push({ builder, field, disposition: "runtime", observation });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const fields = new Map<string, string>();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
        const value = literal(property.initializer);
        if (value !== undefined) fields.set(property.name.text, value);
      }
      const disposition = fields.get("disposition");
      if (fields.has("builder") && fields.has("field") && (disposition === "runtime" || disposition === "compile-only" || disposition === "unsupported" || disposition === "unverified")) {
        rows.push({ builder: fields.get("builder")!, field: fields.get("field")!, disposition, observation: fields.get("observation"), reason: fields.get("reason") });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return rows;
}

export function auditOptionProbes(documented: readonly DocumentedOption[], rows: readonly OptionProbeSummary[]): GateFinding[] {
  const findings: GateFinding[] = [];
  const byKey = new Map<string, OptionProbeSummary>();
  for (const row of rows) {
    const key = `${row.builder}.${row.field}`;
    if (byKey.has(key)) findings.push({ rule: "option-coverage", file: OUT_FILE, detail: `duplicate probe ${key}`, enforced: true });
    byKey.set(key, row);
    if (!row.observation || (row.disposition === "unsupported" && !row.reason)) {
      findings.push({ rule: "option-coverage", file: OUT_FILE, detail: `${key}: ${row.disposition} requires an observation${row.disposition === "unsupported" ? " and an actionable reason" : ""}`, enforced: true });
    }
  }
  for (const ref of documented) {
    const key = `${ref.builder}.${ref.field}`;
    const row = byKey.get(key);
    if (!row) findings.push({ rule: "option-coverage", file: ref.file, detail: `${key} has no typed consumer probe`, enforced: true });
    else if (row.disposition === "compile-only" || row.disposition === "unverified") findings.push({ rule: "option-coverage", file: ref.file, detail: `${key} has ${row.disposition} evidence only; add a runtime consumer or an actionable unsupported diagnostic`, enforced: true });
  }
  return findings;
}

function docs(root: string): DocumentedOption[] {
  const apiDir = join(root, "docs/api");
  const files = [
    ...(existsSync(apiDir) ? readdirSync(apiDir).filter((name) => name.endsWith(".md")).sort().map((name) => join(apiDir, name)) : []),
    join(root, "docs/agents/recipes.md")
  ].filter(existsSync);
  const refs = new Map<string, DocumentedOption>();
  for (const file of files) for (const ref of documentedOptionReferences(readFileSync(file, "utf8"), relative(root, file))) refs.set(`${ref.builder}.${ref.field}`, ref);
  return [...refs.values()];
}

function staleDiagnosticFindings(root: string, rows: readonly OptionProbeSummary[]): GateFinding[] {
  const agentApi = join(root, "packages/engine/src/agent-api");
  if (!existsSync(agentApi)) return [];
  const covered = new Set(rows.filter((row) => row.disposition === "runtime").map((row) => `${row.builder}.${row.field}`));
  const findings: GateFinding[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "dist") visit(file); continue; }
      if (!/^diagnosticOnly\.prd\d+\.ts$/.test(entry.name)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/"([a-zA-Z0-9_.-]+)":\s*\{\s*reason:/g)) {
        if (covered.has(match[1]!)) findings.push({ rule: "option-coverage", file: relative(root, file), detail: `diagnostic-only field "${match[1]}" has a named consumer probe; its owner should review the stale entry` });
      }
    }
  };
  visit(agentApi);
  return findings;
}

export function optionCoverageRule(_files: string[], root: string): GateFinding[] {
  const path = join(root, OUT_FILE);
  if (!existsSync(path)) return [{ rule: "option-coverage", file: OUT_FILE, detail: "typed option probe registry is missing", enforced: true }];
  const rows = readOptionProbeSummaries(readFileSync(path, "utf8"));
  return [...auditOptionProbes(docs(root), rows), ...staleDiagnosticFindings(root, rows)];
}

/** The historical command now discovers gaps without overwriting reviewed probes. */
export function scaffoldOptionCoverage(root: string): void {
  const findings = optionCoverageRule([], root);
  for (const finding of findings) console.error(`${finding.file}: ${finding.detail}`);
  const required = findings.filter((finding) => finding.enforced);
  if (required.length) throw new Error(`option-coverage: ${required.length} documented option probes need review`);
  console.log("option-coverage: all discovered documented options have explicit consumer probes");
}
