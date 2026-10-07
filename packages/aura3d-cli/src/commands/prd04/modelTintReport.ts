/**
 * C-39 codemod: `prd04-model-tint-report` (PRD-04 §10.2, P1-12), report-only.
 *
 * Emits one row per `model(asset, { material })` tint site: file, line, asset
 * expression, color/emissive presence, and — when `material:` is an
 * identifier (e.g. siege-golf's paintedTimberMaterial) — the followed
 * declaration's object. Never rewrites; `code` is returned unchanged.
 * The implementation lives here (commands/prdNN/ is lane-owned per
 * QR_OWNERSHIP.json lanePatterns), unlike `pin-emissive-defaults` whose
 * CONTRACTS §4.1 path is tools/codemods/.
 */
import ts from "typescript";
import { registerCodemod, type AuraCodemod } from "../../contracts/commands.js";

type Row = {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;
  readonly note?: string;
};

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function propNamesOf(objLiteral: ts.ObjectLiteralExpression): string[] {
  return objLiteral.properties
    .map((prop) =>
      ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
        ? prop.name.text
        : undefined
    )
    .filter((name): name is string => name !== undefined);
}

function findProp(objLiteral: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return objLiteral.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === name) ||
        (ts.isStringLiteral(prop.name) && prop.name.text === name))
  );
}

type MaterialSummary = {
  readonly color: boolean | undefined;
  readonly emissive: boolean | undefined;
  readonly props: string | undefined;
  readonly text: string;
};

function summarizeObject(sourceFile: ts.SourceFile, objLiteral: ts.ObjectLiteralExpression): MaterialSummary {
  const props = propNamesOf(objLiteral);
  return {
    color: props.includes("color") || props.includes("emissiveColor"),
    emissive: props.includes("emissive"),
    props: props.join(","),
    text: objLiteral.getText(sourceFile).slice(0, 160)
  };
}

function summarizeMaterialExpr(sourceFile: ts.SourceFile, expr: ts.Expression): MaterialSummary {
  if (ts.isObjectLiteralExpression(expr)) return summarizeObject(sourceFile, expr);
  if (ts.isCallExpression(expr)) {
    const arg = expr.arguments.find(ts.isObjectLiteralExpression);
    if (arg) return summarizeObject(sourceFile, arg);
  }
  return { color: undefined, emissive: undefined, props: undefined, text: expr.getText(sourceFile).slice(0, 160) };
}

/** Resolve `identifier` in the same file to the initializer of its declaration. */
function followIdentifier(sourceFile: ts.SourceFile, id: ts.Identifier): ts.Expression | undefined {
  const name = id.text;
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function transform(source: string, fileName: string): { code: string; rows: Row[] } {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const rows: Row[] = [];

  const visit = (node: ts.Node): void => {
    const isModelCall =
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "model") ||
        (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "model"));
    if (isModelCall) {
      const options = node.arguments[1];
      if (options && ts.isObjectLiteralExpression(options)) {
        const materialProp = findProp(options, "material");
        if (materialProp) {
          const value = materialProp.initializer;
          let summary: MaterialSummary;
          let followed: string | undefined;
          if (ts.isIdentifier(value)) {
            const init = followIdentifier(sourceFile, value);
            followed = `identifier ${value.text}`;
            summary = summarizeMaterialExpr(sourceFile, init ?? value);
          } else {
            summary = summarizeMaterialExpr(sourceFile, value);
          }
          const assetExpr = node.arguments[0]?.getText(sourceFile).slice(0, 80) ?? "";
          rows.push({
            file: fileName,
            line: lineOf(sourceFile, node),
            construct: `model(${assetExpr}, { material })`,
            mapping: "none",
            target: "model material tint",
            note:
              `color=${String(summary.color)} emissive=${String(summary.emissive)}` +
              (followed ? ` followed=${followed}` : "") +
              ` material=${summary.text}${summary.props ? ` [props:${summary.props}]` : ""}`
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { code: source, rows };
}

export const prd04ModelTintReport: AuraCodemod = {
  name: "prd04-model-tint-report",
  owner: "prd04",
  description:
    "Report-only codemod: lists model(asset, { material }) tint sites with file, line, asset " +
    "expression, color/emissive presence and followed identifier definitions for the tint decision table.",
  transform
};

registerCodemod(prd04ModelTintReport);
