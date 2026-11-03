import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import lobesDefault, {
  A3D_PRD04_BSDF_LOBES_COMMON_WGSL as source
} from "../../../packages/rendering/src/shaders/independent-wgsl/Lobes";

// The declaration-only contract does not specify numerical behavior. These tests
// exercise the candidate's stated assumptions, not compatibility with another
// shader. This tiny evaluator executes the imported source's scalar/vector
// expressions with JS numbers; it is not a WGSL compiler or GPU implementation.
type Numeric = number | number[];
type Pointer = { value: Numeric };
type Value = Numeric | boolean | Pointer | undefined;
type ShaderFunction = { parameters: string[]; signature: string; body: ts.Block };
type Derivatives = { dx: number[]; dy: number[] };

class Scope {
  private readonly values = new Map<string, Value>();
  constructor(private readonly parent?: Scope) {}
  define(name: string, value: Value): void { this.values.set(name, value); }
  get(name: string): Value {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`Unknown WGSL identifier: ${name}`);
  }
  set(name: string, value: Value): void {
    if (this.values.has(name)) { this.values.set(name, value); return; }
    if (this.parent) { this.parent.set(name, value); return; }
    throw new Error(`Unknown WGSL assignment target: ${name}`);
  }
}

function numeric(value: Value): Numeric {
  if (typeof value === "number" || Array.isArray(value)) return value;
  throw new Error(`Expected numeric value, got ${String(value)}`);
}

function scalar(value: Value): number {
  if (typeof value !== "number") throw new Error("Expected scalar");
  return value;
}

function vector(value: Value): number[] {
  if (!Array.isArray(value)) throw new Error("Expected vector");
  return value;
}

function elementwise(a: Numeric, b: Numeric, op: (x: number, y: number) => number): Numeric {
  if (!Array.isArray(a) && !Array.isArray(b)) return op(a, b);
  const length = Array.isArray(a) ? a.length : (b as number[]).length;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) throw new Error("Vector length mismatch");
  return Array.from({ length }, (_, i) => op(Array.isArray(a) ? a[i] : a, Array.isArray(b) ? b[i] : b));
}

function unary(a: Numeric, op: (x: number) => number): Numeric {
  return Array.isArray(a) ? a.map(op) : op(a);
}

function splitArguments(parameters: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < parameters.length; i += 1) {
    if (parameters[i] === "<") depth += 1;
    if (parameters[i] === ">") depth -= 1;
    if (parameters[i] === "," && depth === 0) {
      result.push(parameters.slice(start, i));
      start = i + 1;
    }
  }
  if (parameters.slice(start).trim()) result.push(parameters.slice(start));
  return result;
}

function parseBody(body: string, pointerNames: string[]): ts.Block {
  // These rewrites make the small shared WGSL/TypeScript expression subset
  // parseable; unsupported constructs deliberately fail rather than being skipped.
  let text = body.replace(/\bvec([234])\s*<\s*f32\s*>/g, "vec$1f")
    .replace(/(\d(?:[\d.]|[eE][+-]?\d)*)(?:f|h|u|i)\b/g, "$1");
  for (const name of pointerNames) text = text.replace(new RegExp(`\\*\\s*${name}\\b`, "g"), `${name}.value`);
  const file = ts.createSourceFile("candidate-wgsl.ts", `{${text}}`, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) throw new Error(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n"));
  const statement = file.statements[0];
  if (!statement || !ts.isBlock(statement)) throw new Error("Could not parse WGSL function body");
  return statement;
}

function functionsFromSource(text: string): Map<string, ShaderFunction> {
  const functions = new Map<string, ShaderFunction>();
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const declaration = /\bfn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\w+))?\s*\{/g;
  for (let match = declaration.exec(clean); match; match = declaration.exec(clean)) {
    let depth = 1;
    let cursor = declaration.lastIndex;
    for (; cursor < clean.length && depth > 0; cursor += 1) {
      if (clean[cursor] === "{") depth += 1;
      if (clean[cursor] === "}") depth -= 1;
    }
    if (depth !== 0) throw new Error(`Unclosed function ${match[1]}`);
    const args = splitArguments(match[2]);
    const parameters = args.map((arg) => arg.split(":")[0].trim());
    const pointers = args.filter((arg) => /:\s*ptr\s*</.test(arg)).map((arg) => arg.split(":")[0].trim());
    if (functions.has(match[1])) throw new Error(`Duplicate function ${match[1]}`);
    functions.set(match[1], {
      parameters,
      signature: match[0].slice(0, -1).trim(),
      body: parseBody(clean.slice(declaration.lastIndex, cursor - 1), pointers)
    });
    declaration.lastIndex = cursor;
  }
  return functions;
}

class CpuSubset {
  readonly functions: Map<string, ShaderFunction>;
  constructor(
    private readonly derivatives: Derivatives = { dx: [0, 0, 0], dy: [0, 0, 0] },
    text = source
  ) { this.functions = functionsFromSource(text); }

  call(name: string, ...args: Value[]): Value {
    const fn = this.functions.get(name);
    if (!fn) throw new Error(`WGSL function not found: ${name}`);
    if (fn.parameters.length !== args.length) throw new Error(`Wrong argument count for ${name}`);
    const scope = new Scope();
    fn.parameters.forEach((parameter, index) => scope.define(parameter, args[index]));
    return this.block(fn.body, scope).value;
  }

  private block(block: ts.Block, parent: Scope): { returned: boolean; value?: Value } {
    const scope = new Scope(parent);
    for (const statement of block.statements) {
      const result = this.statement(statement, scope);
      if (result.returned) return result;
    }
    return { returned: false };
  }

  private statement(node: ts.Statement, scope: Scope): { returned: boolean; value?: Value } {
    if (ts.isBlock(node)) return this.block(node, scope);
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) throw new Error("Unsupported declaration");
        scope.define(declaration.name.text, declaration.initializer ? this.expression(declaration.initializer, scope) : undefined);
      }
    } else if (ts.isReturnStatement(node)) {
      return { returned: true, value: node.expression ? this.expression(node.expression, scope) : undefined };
    } else if (ts.isExpressionStatement(node)) {
      this.expression(node.expression, scope);
    } else if (ts.isIfStatement(node)) {
      const branch = this.expression(node.expression, scope) ? node.thenStatement : node.elseStatement;
      if (branch) return this.statement(branch, scope);
    } else {
      throw new Error(`Unsupported WGSL statement: ${ts.SyntaxKind[node.kind]}`);
    }
    return { returned: false };
  }

  private assign(target: ts.Expression, value: Value, scope: Scope): void {
    if (ts.isIdentifier(target)) { scope.set(target.text, value); return; }
    if (ts.isPropertyAccessExpression(target) && target.name.text === "value") {
      const pointer = this.expression(target.expression, scope);
      if (pointer && typeof pointer === "object" && !Array.isArray(pointer) && "value" in pointer) {
        pointer.value = numeric(value);
        return;
      }
    }
    throw new Error(`Unsupported WGSL assignment target: ${target.getText()}`);
  }

  private expression(node: ts.Expression, scope: Scope): Value {
    if (ts.isParenthesizedExpression(node)) return this.expression(node.expression, scope);
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(node)) return scope.get(node.text);
    if (ts.isPropertyAccessExpression(node)) {
      const value = this.expression(node.expression, scope);
      if (value && typeof value === "object" && !Array.isArray(value) && node.name.text === "value") return value.value;
      const components = vector(value);
      const indices: Record<string, number> = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };
      const result = [...node.name.text].map((letter) => {
        if (!(letter in indices) || indices[letter] >= components.length) throw new Error(`Unsupported swizzle ${node.name.text}`);
        return components[indices[letter]];
      });
      return result.length === 1 ? result[0] : result;
    }
    if (ts.isPrefixUnaryExpression(node)) {
      const value = this.expression(node.operand, scope);
      if (node.operator === ts.SyntaxKind.MinusToken) return unary(numeric(value), (v) => -v);
      if (node.operator === ts.SyntaxKind.PlusToken) return numeric(value);
      if (node.operator === ts.SyntaxKind.ExclamationToken) return !value;
    }
    if (ts.isConditionalExpression(node)) return this.expression(this.expression(node.condition, scope) ? node.whenTrue : node.whenFalse, scope);
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      const assignments = [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken,
        ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken];
      if (assignments.includes(operator)) {
        let value = this.expression(node.right, scope);
        if (operator !== ts.SyntaxKind.EqualsToken) {
          const previous = numeric(this.expression(node.left, scope));
          const next = numeric(value);
          const operation = operator === ts.SyntaxKind.PlusEqualsToken ? (a: number, b: number) => a + b
            : operator === ts.SyntaxKind.MinusEqualsToken ? (a: number, b: number) => a - b
              : operator === ts.SyntaxKind.AsteriskEqualsToken ? (a: number, b: number) => a * b
                : (a: number, b: number) => a / b;
          value = elementwise(previous, next, operation);
        }
        this.assign(node.left, value, scope);
        return value;
      }
      const left = this.expression(node.left, scope);
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return Boolean(left) && Boolean(this.expression(node.right, scope));
      if (operator === ts.SyntaxKind.BarBarToken) return Boolean(left) || Boolean(this.expression(node.right, scope));
      const right = this.expression(node.right, scope);
      if (operator === ts.SyntaxKind.PlusToken) return elementwise(numeric(left), numeric(right), (a, b) => a + b);
      if (operator === ts.SyntaxKind.MinusToken) return elementwise(numeric(left), numeric(right), (a, b) => a - b);
      if (operator === ts.SyntaxKind.AsteriskToken) return elementwise(numeric(left), numeric(right), (a, b) => a * b);
      if (operator === ts.SyntaxKind.SlashToken) return elementwise(numeric(left), numeric(right), (a, b) => a / b);
      if (operator === ts.SyntaxKind.LessThanToken) return scalar(left) < scalar(right);
      if (operator === ts.SyntaxKind.LessThanEqualsToken) return scalar(left) <= scalar(right);
      if (operator === ts.SyntaxKind.GreaterThanToken) return scalar(left) > scalar(right);
      if (operator === ts.SyntaxKind.GreaterThanEqualsToken) return scalar(left) >= scalar(right);
      if (operator === ts.SyntaxKind.EqualsEqualsToken) return left === right;
      if (operator === ts.SyntaxKind.ExclamationEqualsToken) return left !== right;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const args = node.arguments.map((arg) => this.expression(arg, scope));
      if (this.functions.has(name)) return this.call(name, ...args);
      if (/^vec[234]f?$/.test(name)) {
        const length = Number(name[3]);
        if (args.length === 1 && typeof args[0] === "number") return Array<number>(length).fill(args[0]);
        const values = args.flatMap((arg) => Array.isArray(arg) ? arg : [scalar(arg)]);
        if (values.length !== length) throw new Error(`Wrong constructor size for ${name}`);
        return values;
      }
      if (name === "f32") return scalar(args[0]);
      if (name === "dpdx") return this.derivatives.dx;
      if (name === "dpdy") return this.derivatives.dy;
      if (name === "dot") return vector(args[0]).reduce((sum, v, i) => sum + v * vector(args[1])[i], 0);
      if (name === "length") return Math.hypot(...vector(args[0]));
      if (name === "normalize") {
        const v = vector(args[0]);
        const magnitude = Math.hypot(...v);
        return v.map((component) => component / magnitude);
      }
      if (name === "abs") return unary(numeric(args[0]), Math.abs);
      if (name === "sqrt") return unary(numeric(args[0]), Math.sqrt);
      if (name === "exp2") return unary(numeric(args[0]), (v) => 2 ** v);
      if (name === "pow") return elementwise(numeric(args[0]), numeric(args[1]), Math.pow);
      if (name === "min") return elementwise(numeric(args[0]), numeric(args[1]), Math.min);
      if (name === "max") return elementwise(numeric(args[0]), numeric(args[1]), Math.max);
      if (name === "clamp") return elementwise(elementwise(numeric(args[0]), numeric(args[1]), Math.max), numeric(args[2]), Math.min);
      if (name === "mix") {
        const delta = elementwise(numeric(args[1]), numeric(args[0]), (a, b) => a - b);
        return elementwise(numeric(args[0]), elementwise(delta, numeric(args[2]), (a, b) => a * b), (a, b) => a + b);
      }
      if (name === "select") return args[2] ? args[1] : args[0];
      throw new Error(`Unsupported WGSL function: ${name}`);
    }
    throw new Error(`Unsupported WGSL expression: ${ts.SyntaxKind[node.kind]} (${node.getText()})`);
  }
}

const cpu = new CpuSubset();
const normal = [0, 0, 1];
const view = (cosine: number): number[] => [Math.sqrt(1 - cosine * cosine), 0, cosine];
const bounded = (value: number): void => {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(-1e-10);
  expect(value).toBeLessThanOrEqual(1 + 1e-10);
};
const approxVector = (actual: number[], expected: number[]): void => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 8));
};

describe("independent common lobe candidate", () => {
  it("executes a separate vector, call, branch and pointer expression in the CPU subset", () => {
    const evaluator = new CpuSubset(undefined, `
      fn weighted(value: vec3f) -> f32 {
        return dot(value, vec3f(1.0, 2.0, 3.0));
      }
      fn exercise(input: vec3f, scale: f32, output: ptr<function, vec3f>) -> f32 {
        let limited = clamp(input, vec3f(0.0), vec3f(1.0));
        if (scale > 0.0) { *output = *output + limited * scale; }
        return weighted(limited);
      }
    `);
    const output: Pointer = { value: [1, 2, 3] };
    expect(scalar(evaluator.call("exercise", [-2, 0.5, 2], 2, output))).toBeCloseTo(4, 10);
    approxVector(vector(output.value), [1, 3, 5]);
  });

  it("declares the exact common functions and lobe fields from the declaration-only contract", () => {
    const contract = JSON.parse(readFileSync(new URL("../../../docs/prds/aura3d-independent-shader-api.json", import.meta.url), "utf8")) as {
      modules: { name: string; wgsl?: { functions: { name: string; signature: string }[]; structs: { name: string; fields: string[] }[] } }[];
    };
    const common = contract.modules.find((module) => module.name === "common")?.wgsl;
    expect(common).toBeDefined();
    expect(typeof source).toBe("string");
    expect(lobesDefault).toBe(source);
    const compact = (value: string): string => value.replace(/\s+/g, "");
    for (const fn of common!.functions) expect(compact(cpu.functions.get(fn.name)?.signature ?? "")).toBe(compact(fn.signature));
    for (const structure of common!.structs) {
      const body = source.match(new RegExp(`\\bstruct\\s+${structure.name}\\s*\\{([^}]*)\\}`))?.[1];
      expect(body).toBeDefined();
      expect(body!.split(",").map(compact).filter(Boolean)).toEqual(structure.fields.map(compact));
    }
  });

  it("uses finite nonnegative geometry roughness and returns zero for a constant normal", () => {
    expect(scalar(cpu.call("a3dPrd04GeometryRoughness", normal))).toBeCloseTo(0, 10);
    const tilted = new CpuSubset({ dx: [0.3, 0.4, 0], dy: [0, 0, 0] });
    const rotated = new CpuSubset({ dx: [0, 0, 0], dy: [0, 0.3, 0.4] });
    expect(scalar(tilted.call("a3dPrd04GeometryRoughness", normal))).toBeCloseTo(0.5, 8);
    expect(scalar(rotated.call("a3dPrd04GeometryRoughness", normal))).toBeCloseTo(0.5, 8);
    const derivatives = [0, 0.1, 0.5, 1, 4];
    let previous = 0;
    for (const size of derivatives) {
      const evaluator = new CpuSubset({ dx: [size, 0, 0], dy: [0, size / 2, 0] });
      const roughness = scalar(evaluator.call("a3dPrd04GeometryRoughness", normal));
      bounded(roughness);
      expect(roughness + 1e-10).toBeGreaterThanOrEqual(previous);
      previous = roughness;
    }
  });

  it("combines bounded roughness monotonically, with the quadrature invariant", () => {
    expect(scalar(cpu.call("a3dPrd04ResolveRoughness", 0, 0))).toBeCloseTo(0, 10);
    // Independent orthogonal variation of 0.3 and 0.4 has length 0.5.
    expect(scalar(cpu.call("a3dPrd04ResolveRoughness", 0.3, 0.4))).toBeCloseTo(0.5, 8);
    const samples = [-2, 0, 0.1, 0.5, 1, 3];
    for (const geometry of samples) {
      let previous = 0;
      for (const factor of samples) {
        const actual = scalar(cpu.call("a3dPrd04ResolveRoughness", factor, geometry));
        bounded(actual);
        expect(actual + 1e-10).toBeGreaterThanOrEqual(previous);
        previous = actual;
      }
    }
  });

  it("keeps specular occlusion finite, bounded and monotone in ambient occlusion", () => {
    const samples = [-2, 0, 0.1, 0.5, 1, 3];
    for (const dotNV of samples) for (const roughness of samples) {
      let previous = 0;
      for (const ao of samples) {
        const actual = scalar(cpu.call("a3dPrd04SpecularOcclusion", dotNV, ao, roughness));
        bounded(actual);
        expect(actual + 1e-10).toBeGreaterThanOrEqual(previous);
        previous = actual;
      }
      expect(scalar(cpu.call("a3dPrd04SpecularOcclusion", dotNV, 0, roughness))).toBeCloseTo(0, 10);
      expect(scalar(cpu.call("a3dPrd04SpecularOcclusion", dotNV, 1, roughness))).toBeCloseTo(1, 10);
    }
  });

  it("preserves the smooth Fresnel endpoints and bounded, monotone reflection", () => {
    const f0 = [0.04, 0.3, 0.8];
    const result = (cosine: number, roughness: number, color = f0, f90 = 1): number[] =>
      vector(cpu.call("a3dPrd04EnvironmentBRDF", normal, view(cosine), color, f90, roughness));
    approxVector(result(1, 0), f0);
    approxVector(result(0, 0), [1, 1, 1]);
    approxVector(result(0.4, 0.7, [0, 0, 0], 0), [0, 0, 0]);
    const near = result(1, 0);
    const middle = result(0.5, 0);
    const grazing = result(0, 0);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(middle[channel]).toBeGreaterThanOrEqual(near[channel] - 1e-10);
      expect(grazing[channel]).toBeGreaterThanOrEqual(middle[channel] - 1e-10);
    }
    for (const cosine of [0, 0.1, 0.5, 1]) for (const roughness of [-2, 0, 0.25, 1, 3]) {
      result(cosine, roughness).forEach(bounded);
    }
    for (const f90 of [-2, 0, 0.5, 1, 3]) {
      result(0.3, 0.7, [-2, 0.5, 3], f90).forEach(bounded);
    }
    approxVector(
      vector(cpu.call("a3dPrd04EnvironmentBRDF", [1, 0, 0], [0.5, Math.sqrt(0.75), 0], f0, 1, 0.3)),
      result(0.5, 0.3)
    );
  });

  it("accumulates finite nonnegative scattering without creating energy", () => {
    const scatter = (cosine: number, roughness: number, color: number[], f90: number, initial = [0, 0, 0]): [number[], number[]] => {
      const single: Pointer = { value: [...initial] };
      const multi: Pointer = { value: [...initial] };
      cpu.call("a3dPrd04ComputeMultiscattering", normal, view(cosine), color, f90, roughness, single, multi);
      return [vector(single.value), vector(multi.value)];
    };
    for (const cosine of [0, 0.1, 0.5, 1]) for (const roughness of [-2, 0, 0.25, 1, 3]) {
      const [single, multi] = scatter(cosine, roughness, [0.04, 0.4, 1], 1);
      for (let channel = 0; channel < 3; channel += 1) {
        bounded(single[channel]);
        bounded(multi[channel]);
        bounded(single[channel] + multi[channel]);
      }
      const [offsetSingle, offsetMulti] = scatter(cosine, roughness, [0.04, 0.4, 1], 1, [0.1, 0.2, 0.3]);
      approxVector(offsetSingle, single.map((value, i) => value + [0.1, 0.2, 0.3][i]));
      approxVector(offsetMulti, multi.map((value, i) => value + [0.1, 0.2, 0.3][i]));
    }
    const [blackSingle, blackMulti] = scatter(0.5, 0.8, [0, 0, 0], 0);
    approxVector(blackSingle, [0, 0, 0]);
    approxVector(blackMulti, [0, 0, 0]);
    for (const roughness of [0, 0.25, 1]) {
      const [single, multi] = scatter(0.5, roughness, [1, 1, 1], 1);
      approxVector(single.map((value, i) => value + multi[i]), [1, 1, 1]);
    }
    for (const f90 of [-2, 0, 0.5, 1, 3]) {
      const [single, multi] = scatter(0.5, 0.6, [-2, 0.5, 3], f90);
      single.forEach(bounded);
      multi.forEach(bounded);
      single.map((value, i) => value + multi[i]).forEach(bounded);
    }
  });
});
