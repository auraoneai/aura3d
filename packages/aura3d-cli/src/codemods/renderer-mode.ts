/**
 * `renderer-mode` codemod (PRD-15 T4.5, C-39).
 *
 * Removes the deprecated `mode` and `fallback` properties from `renderer: {}`
 * option objects (CCR-15-1). `renderer.mode`/`renderer.fallback` are gone —
 * `renderer.quality` (C-27) owns feature levels now, and under A3D_QR_STRICT
 * passing either field throws `AuraMigrationError`.
 *
 *   createAuraApp({ scene, renderer: { mode: "safe-basic" } })
 *     → createAuraApp({ scene })
 *   renderer: { mode: "production", textureBudgetBytes: n }
 *     → renderer: { textureBudgetBytes: n }
 *
 * `AuraRendererMode`/`AuraRendererFallbackMode` type references cannot be
 * rewritten mechanically — they are reported with `mapping: "none"` pointing
 * at `renderer.quality`.
 *
 * Every edit is a surgical splice on the source text — property ranges are
 * cut with their separating commas, everything else keeps its formatting.
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

const REMOVED_PROPS = new Set(["mode", "fallback"]);
const DEPRECATED_TYPES = new Set(["AuraRendererMode", "AuraRendererFallbackMode"]);
/** Calls whose options object takes AuraCreateAppRendererOptions under `renderer:`. */
const OPTION_CALLS = new Set(["createAuraApp", "createGameApp", "createAuraGameRuntime", "createApp"]);

/** True when the object literal containing this `renderer:` prop is passed to an app-creation call. */
function isRendererOptionsObject(node: ts.PropertyAssignment): boolean {
  const holder = node.parent;
  if (!ts.isObjectLiteralExpression(holder)) return false;
  const parent = holder.parent;
  if (!ts.isCallExpression(parent)) return false;
  const callee = parent.expression;
  return ts.isIdentifier(callee) && OPTION_CALLS.has(callee.text);
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function propName(node: ts.PropertyAssignment): string | undefined {
  const name = node.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

export function createRendererModeCodemod(): {
  readonly name: "renderer-mode";
  readonly owner: "prd15";
  readonly description: string;
  transform(source: string, fileName: string): { readonly code: string; readonly rows: readonly CodemodRow[] };
} {
  return {
    name: "renderer-mode",
    owner: "prd15",
    description:
      "PRD-15 no-silent-fallback: remove deprecated renderer.mode/renderer.fallback option fields (CCR-15-1); report AuraRendererMode/AuraRendererFallbackMode type references for renderer.quality migration.",
    transform(source: string, fileName: string) {
      const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const edits: Edit[] = [];
      const rows: CodemodRow[] = [];

      /** Cut `prop` from its object literal, consuming one separating comma. */
      const cutProp = (list: ts.NodeArray<ts.ObjectLiteralElementLike>, prop: ts.ObjectLiteralElementLike): void => {
        const commaAfter = source.indexOf(",", prop.getEnd());
        const idx = list.indexOf(prop);
        if (idx < list.length - 1 && commaAfter !== -1) {
          edits.push({ start: prop.getStart(sf), end: commaAfter + 1, text: "" });
        } else {
          const commaBefore = source.lastIndexOf(",", prop.getStart(sf));
          edits.push({ start: commaBefore !== -1 ? commaBefore : prop.getStart(sf), end: prop.getEnd(), text: "" });
        }
      };

      /** Find renderer-option literals under `renderer:` (direct or through conditionals/parens). */
      const optionLiterals = (init: ts.Expression): ts.ObjectLiteralExpression[] => {
        if (ts.isObjectLiteralExpression(init)) return [init];
        if (ts.isParenthesizedExpression(init)) return optionLiterals(init.expression);
        if (ts.isConditionalExpression(init)) return [...optionLiterals(init.whenTrue), ...optionLiterals(init.whenFalse)];
        return [];
      };

      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAssignment(node) && propName(node) === "renderer" && isRendererOptionsObject(node)) {
          for (const literal of optionLiterals(node.initializer)) {
            const doomed = literal.properties.filter(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) && propName(p) !== undefined && REMOVED_PROPS.has(propName(p)!)
            );
            for (const prop of doomed) {
              rows.push({
                file: fileName,
                line: lineOf(sf, prop.getStart(sf)),
                construct: `renderer.${propName(prop)}`,
                mapping: "exact",
                target: "renderer.quality",
                note: "CCR-15-1: mode/fallback removed; renderer.quality owns feature levels (A3D_QR_STRICT throws AuraMigrationError)"
              });
              cutProp(literal.properties, prop);
            }
            if (doomed.length === literal.properties.length && doomed.length > 0 && ts.isObjectLiteralExpression(node.initializer) && literal === node.initializer) {
              // The whole renderer object was only mode/fallback — drop the
              // `renderer:` property itself so `{}` is not left behind.
              const parentProps = (node.parent as ts.ObjectLiteralExpression).properties;
              rows.push({
                file: fileName,
                line: lineOf(sf, node.getStart(sf)),
                construct: "renderer",
                mapping: "exact",
                note: "renderer option object became empty after removing mode/fallback; property removed"
              });
              // Undo the per-prop cuts: the whole property is replaced by the
              // outer cut, so overlapping edits must not apply.
              for (let i = edits.length - doomed.length; i < edits.length; i++) edits[i] = { start: 0, end: 0, text: "" };
              cutProp(parentProps, node);
            }
          }
        }
        if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && DEPRECATED_TYPES.has(node.typeName.text)) {
          rows.push({
            file: fileName,
            line: lineOf(sf, node.getStart()),
            construct: `type ${node.typeName.text}`,
            mapping: "none",
            note: "deprecated in CCR-15-1; migrate call site to renderer.quality (AuraQualityTier)"
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);

      const code = edits
        .sort((a, b) => b.start - a.start)
        .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
      return { code, rows };
    }
  };
}
