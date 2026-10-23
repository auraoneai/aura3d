// Derives map data (vesper) from the captured, minified HEATSINK module WITHOUT evaluating it.
// Usage: node extract-map.mjs <game-module.raw.js> <out.json> [mapId=vesper]
// The input is untrusted third-party text: it is parsed with the TypeScript parser and only object/array literals,
// numeric/string/boolean literals and unary +/-/! are converted to JSON; any other node kind aborts. Nothing from the
// input is ever executed.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const [, , input, out, mapId = "vesper"] = process.argv;
const src = fs.readFileSync(input, "utf8");
const m = new RegExp(`\\{\\s*id:\\s*"${mapId}"\\s*,\\s*name:\\s*"[^"]*"\\s*,\\s*shape:`).exec(src);
if (!m) throw new Error(`map literal for id "${mapId}" not found`);
const from = m.index;
// take text from the literal start up to the matching close brace (string/escape aware)
const start = src.indexOf("{", from);
let depth = 0, i = start, inStr = null;
for (; i < src.length; i++) {
  const c = src[i];
  if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
  if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
  if (c === "{") depth++;
  else if (c === "}" && --depth === 0) { i++; break; }
}
const literal = src.slice(start, i);
const sf = ts.createSourceFile("map.ts", `(${literal})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const stmt = sf.statements[0];
if (!stmt || !ts.isExpressionStatement(stmt)) throw new Error("not an expression");
let ast = stmt.expression;
while (ts.isParenthesizedExpression(ast)) ast = ast.expression;
const K = ts.SyntaxKind;
function conv(n) {
  switch (n.kind) {
    case K.ObjectLiteralExpression: return Object.fromEntries(n.properties.map((p) => {
      if (!ts.isPropertyAssignment(p)) throw new Error("unsupported property kind " + ts.SyntaxKind[p.kind]);
      const nm = p.name;
      const key = ts.isIdentifier(nm) ? nm.text : ts.isStringLiteral(nm) || ts.isNumericLiteral(nm) ? nm.text : (() => { throw new Error("computed key"); })();
      return [key, conv(p.initializer)];
    }));
    case K.ArrayLiteralExpression: return n.elements.map((e) => conv(e));
    case K.NumericLiteral: return Number(n.text);
    case K.StringLiteral: case K.NoSubstitutionTemplateLiteral: return n.text;
    case K.TrueKeyword: return true;
    case K.FalseKeyword: return false;
    case K.NullKeyword: return null;
    case K.PrefixUnaryExpression:
      if (n.operator === K.MinusToken && ts.isNumericLiteral(n.operand)) return -Number(n.operand.text);
      if (n.operator === K.PlusToken && ts.isNumericLiteral(n.operand)) return Number(n.operand.text);
      if (n.operator === K.ExclamationToken && ts.isNumericLiteral(n.operand)) return !Number(n.operand.text);
      throw new Error("unsupported unary");
    case K.Identifier: if (n.text === "undefined") return null; throw new Error(`identifier ${n.text} in map literal`);
    default: throw new Error(`unsupported node ${ts.SyntaxKind[n.kind]}`);
  }
}
let data;
try { data = conv(ast); } catch (e) { throw new Error(`map ${mapId}: ${e.message}`); }
fs.writeFileSync(out, JSON.stringify(data, null, 1) + "\n");
console.log(`wrote ${out}: keys=${Object.keys(data).join(",")} bytes=${literal.length}`);
