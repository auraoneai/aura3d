/**
 * C-35 — `evaluateRequiredCondition`: restricted expression evaluator for
 * `games.json` `requiredConditions[].expr`. Grammar: property paths, numeric /
 * string / boolean literals, `===` `!==` `<` `<=` `>` `>=`, `&&` `||` `!`, and
 * parentheses. No `eval`, no `Function`, no `==`, no arbitrary identifiers.
 *
 * Scope = `{ beacon: window.__AURA3D_GAME__, ...window.__AURA3D_GAME_EVIDENCE__[route] }`.
 * An unresolved path reports `unknown-path`; a malformed expression reports
 * `parse-error`; a well-formed false comparison reports `false`.
 */

export interface RequiredConditionResult {
  readonly ok: boolean;
  readonly reason?: "false" | "unknown-path" | "parse-error";
}

const FORBIDDEN_SEGMENTS: readonly string[] = ["__proto__", "prototype", "constructor"];

type Token =
  | { readonly kind: "path"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "op"; readonly value: "===" | "!==" | "<" | "<=" | ">" | ">=" | "&&" | "||" | "!" }
  | { readonly kind: "lparen" }
  | { readonly kind: "rparen" };

class ParseError extends Error {}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isIdentStart = (c: string): boolean => /[A-Za-z_$]/.test(c);
  const isIdentPart = (c: string): boolean => /[A-Za-z0-9_$]/.test(c);

  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i += 1; continue; }
    if (c === "(") { tokens.push({ kind: "lparen" }); i += 1; continue; }
    if (c === ")") { tokens.push({ kind: "rparen" }); i += 1; continue; }
    if (c === "&" && expr[i + 1] === "&") { tokens.push({ kind: "op", value: "&&" }); i += 2; continue; }
    if (c === "|" && expr[i + 1] === "|") { tokens.push({ kind: "op", value: "||" }); i += 2; continue; }
    if (c === "!" && expr[i + 1] === "=" && expr[i + 2] === "=") { tokens.push({ kind: "op", value: "!==" }); i += 3; continue; }
    if (c === "!") { tokens.push({ kind: "op", value: "!" }); i += 1; continue; }
    if (c === "=" && expr[i + 1] === "=" && expr[i + 2] === "=") { tokens.push({ kind: "op", value: "===" }); i += 3; continue; }
    if (c === "<" && expr[i + 1] === "=") { tokens.push({ kind: "op", value: "<=" }); i += 2; continue; }
    if (c === ">" && expr[i + 1] === "=") { tokens.push({ kind: "op", value: ">=" }); i += 2; continue; }
    if (c === "<") { tokens.push({ kind: "op", value: "<" }); i += 1; continue; }
    if (c === ">") { tokens.push({ kind: "op", value: ">" }); i += 1; continue; }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let value = "";
      while (j < expr.length && expr[j] !== quote) {
        if (expr[j] === "\\") {
          if (j + 1 >= expr.length) throw new ParseError("unterminated escape");
          value += expr[j + 1];
          j += 2;
        } else {
          value += expr[j];
          j += 1;
        }
      }
      if (j >= expr.length) throw new ParseError("unterminated string literal");
      tokens.push({ kind: "string", value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(expr[i + 1] ?? ""))) {
      const m = /^-?\d+(\.\d+)?/.exec(expr.slice(i));
      if (m === null) throw new ParseError(`malformed number at ${i}`);
      tokens.push({ kind: "number", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < expr.length && isIdentPart(expr[j])) j += 1;
      const word = expr.slice(i, j);
      if (word === "true") { tokens.push({ kind: "boolean", value: true }); i = j; continue; }
      if (word === "false") { tokens.push({ kind: "boolean", value: false }); i = j; continue; }
      // Property path: ident(.ident)*
      let k = j;
      while (k < expr.length && expr[k] === "." && isIdentStart(expr[k + 1] ?? "")) {
        k += 1;
        while (k < expr.length && isIdentPart(expr[k])) k += 1;
      }
      const path = expr.slice(i, k);
      const segments = path.split(".");
      if (segments.some((segment) => FORBIDDEN_SEGMENTS.includes(segment))) {
        throw new ParseError(`forbidden path segment in "${path}"`);
      }
      tokens.push({ kind: "path", value: path });
      i = k;
      continue;
    }
    throw new ParseError(`unexpected character "${c}" at ${i}`);
  }
  return tokens;
}

type Ast =
  | { readonly kind: "literal"; readonly value: number | string | boolean }
  | { readonly kind: "path"; readonly segments: readonly string[] }
  | { readonly kind: "not"; readonly operand: Ast }
  | { readonly kind: "binary"; readonly op: "===" | "!==" | "<" | "<=" | ">" | ">=" | "&&" | "||"; readonly left: Ast; readonly right: Ast };

const BINDING_POWER: Readonly<Record<string, number>> = { "||": 1, "&&": 2, "===": 3, "!==": 3, "<": 4, "<=": 4, ">": 4, ">=": 4 };

function parse(tokens: readonly Token[]): Ast {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const token = tokens[pos];
    if (token === undefined) throw new ParseError("unexpected end of expression");
    pos += 1;
    return token;
  };

  const parseExpr = (minBp: number): Ast => {
    const head = next();
    let left: Ast;
    if (head.kind === "number" || head.kind === "string" || head.kind === "boolean") {
      left = { kind: "literal", value: head.value };
    } else if (head.kind === "path") {
      left = { kind: "path", segments: head.value.split(".") };
    } else if (head.kind === "lparen") {
      left = parseExpr(0);
      const closing = next();
      if (closing.kind !== "rparen") throw new ParseError("missing closing parenthesis");
    } else if (head.kind === "op" && head.value === "!") {
      left = { kind: "not", operand: parseExpr(5) };
    } else {
      throw new ParseError(`unexpected token "${JSON.stringify(head)}"`);
    }

    for (;;) {
      const token = peek();
      if (token === undefined || token.kind !== "op" || token.value === "!") break;
      const bp = BINDING_POWER[token.value];
      if (bp === undefined || bp < minBp) break;
      next();
      const right = parseExpr(bp + 1);
      left = { kind: "binary", op: token.value as Ast extends { kind: "binary"; op: infer O } ? O : never, left, right };
    }
    return left;
  };

  const ast = parseExpr(0);
  if (pos !== tokens.length) throw new ParseError("trailing tokens after expression");
  return ast;
}

class UnknownPath extends Error {}

function truthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0 && Number.isFinite(value);
  if (typeof value === "string") return value.length > 0;
  return value !== null && value !== undefined && typeof value === "object";
}

function evaluateAst(ast: Ast, scope: Readonly<Record<string, unknown>>): unknown {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "path": {
      let current: unknown = scope;
      for (const segment of ast.segments) {
        if (typeof current !== "object" || current === null) throw new UnknownPath();
        if (!Object.hasOwn(current, segment)) throw new UnknownPath();
        current = (current as Record<string, unknown>)[segment];
      }
      return current;
    }
    case "not":
      return !truthy(evaluateAst(ast.operand, scope));
    case "binary": {
      const left = evaluateAst(ast.left, scope);
      const right = evaluateAst(ast.right, scope);
      switch (ast.op) {
        case "===": return left === right;
        case "!==": return left !== right;
        case "<": return typeof left === "number" && typeof right === "number" ? left < right : false;
        case "<=": return typeof left === "number" && typeof right === "number" ? left <= right : false;
        case ">": return typeof left === "number" && typeof right === "number" ? left > right : false;
        case ">=": return typeof left === "number" && typeof right === "number" ? left >= right : false;
        case "&&": return truthy(left) && truthy(right);
        case "||": return truthy(left) || truthy(right);
      }
      return false;
    }
  }
}

/** Evaluates `expr` against `scope`. Never throws: every failure is a reasoned result. */
export function evaluateRequiredCondition(expr: string, scope: Readonly<Record<string, unknown>>): RequiredConditionResult {
  if (typeof expr !== "string" || expr.trim().length === 0) return { ok: false, reason: "parse-error" };
  let ast: Ast;
  try {
    ast = parse(tokenize(expr));
  } catch {
    return { ok: false, reason: "parse-error" };
  }
  let value: unknown;
  try {
    value = evaluateAst(ast, scope);
  } catch (error) {
    if (error instanceof UnknownPath) return { ok: false, reason: "unknown-path" };
    throw error;
  }
  return truthy(value) ? { ok: true } : { ok: false, reason: "false" };
}
