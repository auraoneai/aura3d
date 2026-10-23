// Derives chapters.json + logic-extract.js from the captured Silt & Signal game bundle.
// Usage: node extract.mjs <path-to-captured-bundle.js> <out-dir>
// The input is untrusted third-party text: it is PARSED (TypeScript AST) and only literals,
// array/object spreads, simple arithmetic and the two data helpers (xt, Ht) are evaluated by
// this script's own interpreter. The captured code is never executed.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const [, , input, outDir] = process.argv;
const text = fs.readFileSync(input, "utf8");
const sf = ts.createSourceFile("bundle.js", text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

const decls = new Map();
const fns = new Map();
(function walk(n) {
  if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && !decls.has(n.name.text)) decls.set(n.name.text, n.initializer);
  if (ts.isFunctionDeclaration(n) && n.name && !fns.has(n.name.text)) fns.set(n.name.text, n);
  ts.forEachChild(n, walk);
})(sf);

const unresolved = new Set();
const MATH = new Set(["sin", "cos", "abs", "min", "max", "sqrt", "pow", "floor", "round", "hypot", "atan2"]);
const cache = new Map();
const helpers = {
  xt: (x, z, y = 4) => ({ x, z, y }),
  Ht: (id, title, kind, points, rest = {}) => ({ id, title, kind, points, radius: 24, ...rest }),
};
function ev(n, scope = {}) {
  switch (n.kind) {
    case ts.SyntaxKind.NumericLiteral: return Number(n.text);
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral: return n.text;
    case ts.SyntaxKind.TrueKeyword: return true;
    case ts.SyntaxKind.FalseKeyword: return false;
    case ts.SyntaxKind.NullKeyword: return null;
    case ts.SyntaxKind.ParenthesizedExpression: return ev(n.expression, scope);
    case ts.SyntaxKind.PrefixUnaryExpression: {
      const v = ev(n.operand, scope);
      if (n.operator === ts.SyntaxKind.MinusToken) return -v;
      if (n.operator === ts.SyntaxKind.PlusToken) return +v;
      if (n.operator === ts.SyntaxKind.ExclamationToken) return !v;
      throw new Error("unary " + n.operator);
    }
    case ts.SyntaxKind.BinaryExpression: {
      const a = ev(n.left, scope), b = ev(n.right, scope);
      switch (n.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken: return a + b;
        case ts.SyntaxKind.MinusToken: return a - b;
        case ts.SyntaxKind.AsteriskToken: return a * b;
        case ts.SyntaxKind.SlashToken: return a / b;
        default: throw new Error("binary " + n.operatorToken.kind);
      }
    }
    case ts.SyntaxKind.ArrayLiteralExpression: {
      const out = [];
      for (const e of n.elements) {
        if (ts.isSpreadElement(e)) out.push(...ev(e.expression, scope)); else out.push(ev(e, scope));
      }
      return out;
    }
    case ts.SyntaxKind.ObjectLiteralExpression: {
      const out = {};
      for (const p of n.properties) {
        if (ts.isSpreadAssignment(p)) Object.assign(out, ev(p.expression, scope));
        else if (ts.isPropertyAssignment(p)) out[p.name.text ?? ev(p.name.expression, scope)] = ev(p.initializer, scope);
        else if (ts.isShorthandPropertyAssignment(p)) out[p.name.text] = ref(p.name.text, scope);
        else throw new Error("object member " + ts.SyntaxKind[p.kind]);
      }
      return out;
    }
    case ts.SyntaxKind.Identifier: return ref(n.text, scope);
    case ts.SyntaxKind.CallExpression: {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && helpers[callee.text]) return helpers[callee.text](...n.arguments.map((a) => ev(a, scope)));
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "Math" && MATH.has(callee.name.text)) {
        return Math[callee.name.text](...n.arguments.map((a) => ev(a, scope)));
      }
      if (ts.isIdentifier(callee) && decls.has(callee.text) && ts.isArrowFunction(decls.get(callee.text)) && ts.isExpression(decls.get(callee.text).body)) {
        const fn = decls.get(callee.text);
        const inner = { ...scope };
        fn.parameters.forEach((p, i) => { inner[p.name.text] = ev(n.arguments[i], scope); });
        return ev(fn.body, inner);
      }
      throw new Error("call " + callee.getText(sf).slice(0, 40));
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      const base = ev(n.expression, scope);
      return base[n.name.text];
    }
    default: throw new Error("kind " + ts.SyntaxKind[n.kind]);
  }
}
function ref(name, scope) {
  if (name in scope) return scope[name];
  if (cache.has(name)) return cache.get(name);
  const d = decls.get(name);
  if (!d) throw new Error("unbound " + name);
  const v = ev(d, scope);
  cache.set(name, v);
  return v;
}
const out = {};
for (const name of ["Mt", "yo", "ym"]) {
  try { out[name] = ref(name, {}); } catch (e) { unresolved.add(`${name}: ${e.message}`); }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "chapters.json"), JSON.stringify({ schema: "a3d-silt-extract/1", unresolved: [...unresolved], ...out }, null, 1));
const keep = ["Eo", "e0", "Mx", "zn", "zi", "$T", "uc", "_o", "jn", "wo", "E0"];
const excerpt = keep.map((k) => (fns.get(k) ? fns.get(k).getText(sf) : `/* ${k}: not a function declaration */`)).join("\n\n");
fs.writeFileSync(path.join(outDir, "logic-extract.js"), `// UNTRUSTED third-party excerpts (minified identifiers) from the Silt & Signal game bundle. Read as text only.\n${excerpt}\n`);
console.log(JSON.stringify({ chapters: out.Mt?.length ?? null, unresolved: [...unresolved], fns: keep.filter((k) => fns.has(k)) }));
