/**
 * pin-emissive-defaults — C-39 codemod (PRD-04 §10.6, owner prd04).
 *
 * Pins the emissiveIntensity values the legacy compiler defaults baked in,
 * so `material.emissive(...)` / object literals keep today's look once the
 * flag changes the defaults:
 *   - `material.emissive({...})` or object literal `material: {emissive: ...}`
 *     without `emissiveIntensity` -> append `emissiveIntensity: 1.35`
 *   - `material.neon({...})` without `emissiveIntensity` -> `emissiveIntensity: 2.8`
 *
 * Pure: transform(source, fileName) -> { code, rows }.
 * Rows: { file, line, construct, mapping: "exact"|"approximate"|"none", target?, note? }
 */
import tsModule from "typescript";

const { default: tsDefault, ...tsNamed } = tsModule;
const ts = tsDefault ?? tsNamed;

const EMISSIVE_INTENSITY = "1.35";
const NEON_INTENSITY = "2.8";

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isIdentifierNamed(node, name) {
  return ts.isIdentifier(node) && node.text === name;
}

/** material.<factory>({...}) — returns the call's object literal arg and factory name. */
function matchMaterialFactory(node) {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const obj = callee.expression;
  const factory = callee.name.text;
  if (!isIdentifierNamed(obj, "material")) return undefined;
  const arg = node.arguments[0];
  if (arg === undefined || !ts.isObjectLiteralExpression(arg)) return undefined;
  return { factory, arg };
}

function hasProperty(objLiteral, name) {
  return objLiteral.properties.some(
    (prop) =>
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === name) ||
        (ts.isStringLiteral(prop.name) && prop.name.text === name))
  );
}

export function transform(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const rows = [];
  const edits = []; // {pos, insert}

  const visit = (node) => {
    // material.emissive({...}) / material.neon({...})
    const call = matchMaterialFactory(node);
    if (call && (call.factory === "emissive" || call.factory === "neon") && !hasProperty(call.arg, "emissiveIntensity")) {
      const value = call.factory === "neon" ? NEON_INTENSITY : EMISSIVE_INTENSITY;
      const last = call.arg.properties[call.arg.properties.length - 1];
      const pos = last ? last.getEnd() : call.arg.getStart() + 1;
      const insert = `${last ? ", " : ""}emissiveIntensity: ${value}`;
      edits.push({ pos, insert });
      rows.push({
        file: fileName,
        line: lineOf(sourceFile, node),
        construct: `material.${call.factory}(…)`,
        mapping: "exact",
        target: "emissiveIntensity",
        note: `pinned legacy default ${value}`
      });
    }

    // Object literal with `emissive` but no `emissiveIntensity` (material spec shape),
    // skipping literals already handled by the factory branch (they're call args anyway).
    if (ts.isObjectLiteralExpression(node) && hasProperty(node, "emissive") && !hasProperty(node, "emissiveIntensity")) {
      const parent = node.parent;
      const isFactoryArg =
        parent !== undefined && ts.isCallExpression(parent) && matchMaterialFactory(parent)?.arg === node;
      if (!isFactoryArg) {
        const last = node.properties[node.properties.length - 1];
        const pos = last ? last.getEnd() : node.getStart() + 1;
        edits.push({ pos, insert: `${last ? ", " : ""}emissiveIntensity: ${EMISSIVE_INTENSITY}` });
        rows.push({
          file: fileName,
          line: lineOf(sourceFile, node),
          construct: "{ emissive: … }",
          mapping: "approximate",
          target: "emissiveIntensity",
          note: `pinned legacy default ${EMISSIVE_INTENSITY} on emissive literal`
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  edits.sort((a, b) => b.pos - a.pos);
  let code = source;
  for (const edit of edits) code = code.slice(0, edit.pos) + edit.insert + code.slice(edit.pos);
  return { code, rows };
}

export default { transform };
