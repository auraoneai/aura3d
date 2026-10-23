/**
 * SH-01 / L1-11 — TSL-style node graph subset: IR, type inference, constant
 * folding and the imperative statement recorder (`Fn`, `If`, `Loop`).
 *
 * This is a deliberately small subset of three.js TSL that lowers to GLSL 300 es
 * and feeds `material.custom` (see `emit.ts`). Anything outside the subset fails
 * with a named `AuraRuntimeError`, never silently.
 */

import { AuraRuntimeError } from "../../compiler/errors.js";

export type TslType = "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "sampler2D";
export type TslBuiltinName = "positionLocal" | "positionWorld" | "normalLocal" | "normalWorld" | "uv" | "time" | "cameraPosition";

export const TSL_BUILTIN_TYPES: Readonly<Record<TslBuiltinName, TslType>> = {
  positionLocal: "vec3",
  positionWorld: "vec3",
  normalLocal: "vec3",
  normalWorld: "vec3",
  uv: "vec2",
  time: "float",
  cameraPosition: "vec3"
};

export type TslUnaryOp =
  | "sin" | "cos" | "tan" | "abs" | "sign" | "sqrt" | "exp" | "log" | "fract" | "floor" | "ceil"
  | "normalize" | "saturate" | "oneMinus" | "negate" | "length" | "not" | "toFloat" | "toInt";
export type TslBinaryOp =
  | "add" | "sub" | "mul" | "div" | "mod" | "pow" | "min" | "max" | "step" | "dot" | "cross" | "distance" | "atan2"
  | "lessThan" | "greaterThan" | "lessThanEqual" | "greaterThanEqual" | "equal" | "notEqual" | "and" | "or";
export type TslTernaryOp = "mix" | "smoothstep" | "clamp" | "select";
export type TslOpName = TslUnaryOp | TslBinaryOp | TslTernaryOp;

export type TslBlock = TslStatement[];
export type TslStatement =
  | { readonly s: "decl"; readonly node: TslNode }
  | { readonly s: "assign"; readonly target: TslNode; readonly value: TslNode; readonly op?: "+" | "-" | "*" | "/" }
  | { readonly s: "if"; readonly branches: readonly { readonly cond: TslNode; readonly block: TslBlock }[]; readonly otherwise?: TslBlock }
  | { readonly s: "loop"; readonly index: TslNode; readonly start: TslNode; readonly end: TslNode; readonly block: TslBlock };

export type TslNodeData =
  | { readonly k: "const"; readonly value: readonly number[] }
  | { readonly k: "builtin"; readonly name: TslBuiltinName }
  | { readonly k: "uniform"; readonly name?: string; readonly value: unknown; readonly specType: string }
  | { readonly k: "op"; readonly op: TslOpName; readonly args: readonly TslNode[] }
  | { readonly k: "swizzle"; readonly src: TslNode; readonly comps: string }
  | { readonly k: "construct"; readonly args: readonly TslNode[] }
  | { readonly k: "texture"; readonly sampler: TslNode; readonly uv: TslNode }
  | { readonly k: "element"; readonly array: TslUniformArray; readonly index: TslNode }
  | { readonly k: "var"; readonly init: TslNode }
  | { readonly k: "loopIndex" }
  | { readonly k: "call"; readonly block: TslBlock; readonly result: TslNode; readonly args: readonly TslNode[] };

export type TslInput = TslNode | number | boolean | readonly number[] | string;

export function tslError(code: "invalid-tsl-graph" | "tsl-type-mismatch" | "tsl-unsupported-node" | "tsl-unsupported-output" | "tsl-statement-outside-fn" | "tsl-requires-glsl-backend", message: string): never {
  throw new AuraRuntimeError(code, message);
}

export const dimOf = (type: TslType): number => (type === "vec2" ? 2 : type === "vec3" ? 3 : type === "vec4" ? 4 : 1);
export const isVec = (type: TslType): boolean => dimOf(type) > 1;
export const isNumericScalar = (type: TslType): boolean => type === "float" || type === "int";
const vecOf = (n: number): TslType => (n === 2 ? "vec2" : n === 3 ? "vec3" : n === 4 ? "vec4" : "float");

let nodeCounter = 0;

/** A node in the graph. Chainable methods mirror three's TSL (`a.mul(b).add(c)`). */
export class TslNode {
  readonly id: number;
  constructor(readonly type: TslType, readonly data: TslNodeData) {
    this.id = nodeCounter++;
  }

  add(other: TslInput): TslNode { return op("add", this, other); }
  sub(other: TslInput): TslNode { return op("sub", this, other); }
  mul(other: TslInput): TslNode { return op("mul", this, other); }
  div(other: TslInput): TslNode { return op("div", this, other); }
  mod(other: TslInput): TslNode { return op("mod", this, other); }
  pow(other: TslInput): TslNode { return op("pow", this, other); }
  min(other: TslInput): TslNode { return op("min", this, other); }
  max(other: TslInput): TslNode { return op("max", this, other); }
  dot(other: TslInput): TslNode { return op("dot", this, other); }
  cross(other: TslInput): TslNode { return op("cross", this, other); }
  distance(other: TslInput): TslNode { return op("distance", this, other); }
  atan2(other: TslInput): TslNode { return op("atan2", this, other); }
  /** `edge.step(x)` is GLSL `step(edge, x)`: 0 where `x < edge`, else 1. */
  step(x: TslInput): TslNode { return op("step", this, x); }
  lessThan(other: TslInput): TslNode { return op("lessThan", this, other); }
  greaterThan(other: TslInput): TslNode { return op("greaterThan", this, other); }
  lessThanEqual(other: TslInput): TslNode { return op("lessThanEqual", this, other); }
  greaterThanEqual(other: TslInput): TslNode { return op("greaterThanEqual", this, other); }
  equal(other: TslInput): TslNode { return op("equal", this, other); }
  notEqual(other: TslInput): TslNode { return op("notEqual", this, other); }
  and(other: TslInput): TslNode { return op("and", this, other); }
  or(other: TslInput): TslNode { return op("or", this, other); }
  not(): TslNode { return op("not", this); }
  sin(): TslNode { return op("sin", this); }
  cos(): TslNode { return op("cos", this); }
  tan(): TslNode { return op("tan", this); }
  abs(): TslNode { return op("abs", this); }
  sign(): TslNode { return op("sign", this); }
  sqrt(): TslNode { return op("sqrt", this); }
  exp(): TslNode { return op("exp", this); }
  log(): TslNode { return op("log", this); }
  fract(): TslNode { return op("fract", this); }
  floor(): TslNode { return op("floor", this); }
  ceil(): TslNode { return op("ceil", this); }
  normalize(): TslNode { return op("normalize", this); }
  saturate(): TslNode { return op("saturate", this); }
  oneMinus(): TslNode { return op("oneMinus", this); }
  negate(): TslNode { return op("negate", this); }
  length(): TslNode { return op("length", this); }
  mix(other: TslInput, t: TslInput): TslNode { return op("mix", this, other, t); }
  clamp(lo: TslInput = 0, hi: TslInput = 1): TslNode { return op("clamp", this, lo, hi); }
  smoothstep(edge0: TslInput, edge1: TslInput): TslNode { return op("smoothstep", edge0, edge1, this); }
  /** Local variable declaration (valid only inside `Fn`). */
  toVar(): TslNode {
    if (this.type === "sampler2D") tslError("tsl-type-mismatch", "a texture sampler cannot be stored in a variable");
    const variable = new TslNode(this.type, { k: "var", init: this });
    record({ s: "decl", node: variable }, "toVar()");
    return variable;
  }
  assign(value: TslInput): TslNode { return assignTo(this, value, undefined); }
  addAssign(value: TslInput): TslNode { return assignTo(this, value, "+"); }
  subAssign(value: TslInput): TslNode { return assignTo(this, value, "-"); }
  mulAssign(value: TslInput): TslNode { return assignTo(this, value, "*"); }
  divAssign(value: TslInput): TslNode { return assignTo(this, value, "/"); }
  /** Static-index convenience for `uniformArray(...).element(i)` results. */
  get isConstant(): boolean { return this.data.k === "const"; }
}

/** `uniformArray` handle: lowered to N scalar/vector uniforms named `<name>_0 ... <name>_{N-1}`. */
export class TslUniformArray {
  readonly elements: readonly TslNode[];
  constructor(readonly name: string | undefined, readonly elementType: TslType, readonly values: readonly unknown[], elements: readonly TslNode[]) {
    this.elements = elements;
  }
  get length(): number { return this.elements.length; }
  /** Static index returns the element's uniform node; a node index lowers to a select ladder. */
  element(index: TslInput): TslNode {
    if (typeof index === "number") {
      if (!Number.isInteger(index) || index < 0 || index >= this.elements.length) {
        tslError("invalid-tsl-graph", `uniformArray element index ${index} is outside 0..${this.elements.length - 1}`);
      }
      return this.elements[index]!;
    }
    return new TslNode(this.elementType, { k: "element", array: this, index: toNode(index) });
  }
}

/* ------------------------------------------------------------------------- */
/* Statement recorder                                                         */
/* ------------------------------------------------------------------------- */

const blockStack: TslBlock[] = [];

function record(statement: TslStatement, what: string): void {
  const top = blockStack[blockStack.length - 1];
  if (!top) tslError("tsl-statement-outside-fn", `${what} is a statement and is only valid inside Fn(() => { ... }); wrap imperative TSL code in Fn`);
  top.push(statement);
}

function withBlock<T>(fn: () => T): { readonly block: TslBlock; readonly result: T } {
  const block: TslBlock = [];
  blockStack.push(block);
  try {
    const result = fn();
    return { block, result };
  } finally {
    blockStack.pop();
  }
}

function assignTo(target: TslNode, value: TslInput, compound: "+" | "-" | "*" | "/" | undefined): TslNode {
  if (target.data.k !== "var") tslError("tsl-type-mismatch", "assign() target must be a node created with toVar()");
  const rhs = toNode(value);
  const compatible = target.type === rhs.type || (target.type === "float" && rhs.type === "int") || (isVec(target.type) && rhs.type === "float" && compound !== undefined);
  if (!compatible) tslError("tsl-type-mismatch", `cannot assign ${rhs.type} to a ${target.type} variable`);
  record({ s: "assign", target, value: rhs, ...(compound ? { op: compound } : {}) }, "assign()");
  return target;
}

/** `Fn(callback)`: callback runs once per call site; its statements and return node become an inline block. */
export function Fn(callback: (...args: TslNode[]) => TslInput | void): (...args: TslInput[]) => TslNode {
  return (...args: TslInput[]): TslNode => {
    const argNodes = args.map((arg) => toNode(arg));
    const { block, result } = withBlock(() => callback(...argNodes));
    if (result === undefined) tslError("invalid-tsl-graph", "Fn callback must return a node (statement-only Fn blocks have no value to use)");
    const returned = toNode(result);
    return new TslNode(returned.type, { k: "call", block, result: returned, args: argNodes });
  };
}

export interface TslIfChain {
  ElseIf(condition: TslInput, body: () => void): TslIfChain;
  Else(body: () => void): void;
}

/** `If(cond, () => { ... }).ElseIf(...).Else(...)` — statement form, valid only inside `Fn`. */
export function If(condition: TslInput, body: () => void): TslIfChain {
  const branches: { cond: TslNode; block: TslBlock }[] = [];
  const statement: { s: "if"; branches: { cond: TslNode; block: TslBlock }[]; otherwise?: TslBlock } = { s: "if", branches };
  record(statement as TslStatement, "If()");
  const addBranch = (cond: TslInput, fn: () => void): void => {
    const node = toNode(cond);
    if (node.type !== "bool") tslError("tsl-type-mismatch", `If condition must be a bool node (got ${node.type}); build one with lessThan/greaterThan/equal/and/or/not`);
    branches.push({ cond: node, block: withBlock(fn).block });
  };
  addBranch(condition, body);
  const chain: TslIfChain = {
    ElseIf(cond, fn) { addBranch(cond, fn); return chain; },
    Else(fn) { statement.otherwise = withBlock(fn).block; }
  };
  return chain;
}

export const TSL_MAX_STATIC_LOOP = 1024;

/** `Loop(count | { start, end }, ({ i }) => { ... })` — statement form, valid only inside `Fn`. */
export function Loop(range: number | TslNode | { readonly start?: TslInput; readonly end: TslInput }, body: (scope: { i: TslNode }) => void): void {
  const bounds = typeof range === "number" || range instanceof TslNode ? { start: 0, end: range } : range;
  const start = toIntNode(bounds.start ?? 0, "Loop start");
  const end = toIntNode(bounds.end, "Loop end");
  if (start.data.k === "const" && end.data.k === "const" && end.data.value[0]! - start.data.value[0]! > TSL_MAX_STATIC_LOOP) {
    tslError("invalid-tsl-graph", `Loop of ${end.data.value[0]! - start.data.value[0]!} iterations exceeds the ${TSL_MAX_STATIC_LOOP} iteration limit`);
  }
  const index = new TslNode("int", { k: "loopIndex" });
  const statement: TslStatement = { s: "loop", index, start, end, block: withBlock(() => body({ i: index })).block };
  record(statement, "Loop()");
}

function toIntNode(value: TslInput, what: string): TslNode {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) tslError("tsl-type-mismatch", `${what} must be an integer`);
    return new TslNode("int", { k: "const", value: [value] });
  }
  const node = toNode(value);
  if (node.type !== "int") tslError("tsl-type-mismatch", `${what} must be an int node (got ${node.type})`);
  return node;
}

/* ------------------------------------------------------------------------- */
/* Construction helpers                                                       */
/* ------------------------------------------------------------------------- */

export function constNode(type: TslType, value: readonly number[]): TslNode {
  if (value.length !== dimOf(type)) tslError("invalid-tsl-graph", `${type} constant needs ${dimOf(type)} component(s), got ${value.length}`);
  for (const component of value) {
    if (!Number.isFinite(component)) tslError("invalid-tsl-graph", `${type} constant has a non-finite component`);
  }
  return new TslNode(type, { k: "const", value: [...value] });
}

export function parseHexColor(value: string): readonly [number, number, number] {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) tslError("invalid-tsl-graph", `unsupported color "${value}" (use "#rgb" or "#rrggbb")`);
  let hex = match[1]!;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
}

export function toNode(value: TslInput): TslNode {
  if (value instanceof TslNode) return value;
  if (typeof value === "number") return constNode("float", [value]);
  if (typeof value === "boolean") return constNode("bool", [value ? 1 : 0]);
  if (typeof value === "string") return constNode("vec3", [...parseHexColor(value)]);
  if (Array.isArray(value) && value.length >= 2 && value.length <= 4) return constNode(vecOf(value.length), value as readonly number[]);
  return tslError("invalid-tsl-graph", `cannot convert ${String(value)} to a node`);
}

/** Promote numeric argument types to one generic type (float or vecN). */
function promoteGen(op: string, types: readonly TslType[], allowInt: boolean): TslType {
  let dim = 1;
  let sawFloat = false;
  for (const type of types) {
    if (type === "bool" || type === "sampler2D") tslError("tsl-type-mismatch", `${op}() cannot take a ${type} operand`);
    const d = dimOf(type);
    if (d > 1) {
      if (dim > 1 && d !== dim) tslError("tsl-type-mismatch", `${op}() cannot combine ${vecOf(dim)} with ${type}`);
      dim = d;
    }
    if (type !== "int") sawFloat = true;
  }
  if (dim > 1) return vecOf(dim);
  return allowInt && !sawFloat ? "int" : "float";
}

const COMPARISONS: ReadonlySet<TslOpName> = new Set(["lessThan", "greaterThan", "lessThanEqual", "greaterThanEqual", "equal", "notEqual"]);

/** Result type (and validation) for an op over already-converted argument nodes. */
export function opResultType(name: TslOpName, args: readonly TslNode[]): TslType {
  const types = args.map((arg) => arg.type);
  switch (name) {
    case "add": case "sub": case "mul":
      return promoteGen(name, types, true);
    case "div": case "mod": case "pow": case "min": case "max": case "atan2": case "step":
      return promoteGen(name, types, false);
    case "mix": case "smoothstep": case "clamp":
      return promoteGen(name, types, false);
    case "sin": case "cos": case "tan": case "sqrt": case "exp": case "log": case "fract": case "floor": case "ceil": case "saturate": case "toFloat":
      return promoteGen(name, types, false);
    case "abs": case "sign": case "negate": case "oneMinus":
      return promoteGen(name, types, name === "abs" || name === "negate");
    case "normalize": {
      const type = promoteGen(name, types, false);
      if (!isVec(type)) tslError("tsl-type-mismatch", "normalize() needs a vec2, vec3 or vec4");
      return type;
    }
    case "length": case "distance": case "dot": {
      promoteGen(name, types, false);
      return "float";
    }
    case "cross":
      if (types[0] !== "vec3" || types[1] !== "vec3") tslError("tsl-type-mismatch", "cross() needs two vec3 operands");
      return "vec3";
    case "toInt":
      if (!isNumericScalar(types[0]!)) tslError("tsl-type-mismatch", "int() needs a float or int scalar");
      return "int";
    case "not":
      if (types[0] !== "bool") tslError("tsl-type-mismatch", "not() needs a bool operand");
      return "bool";
    case "and": case "or":
      if (types[0] !== "bool" || types[1] !== "bool") tslError("tsl-type-mismatch", `${name}() needs two bool operands`);
      return "bool";
    case "select": {
      if (types[0] !== "bool") tslError("tsl-type-mismatch", "select() condition must be a bool node");
      if (types[1] === "bool" && types[2] === "bool") return "bool";
      return promoteGen(name, types.slice(1), true);
    }
    default:
      if (COMPARISONS.has(name)) {
        for (const type of types) if (!isNumericScalar(type) && !(name === "equal" || name === "notEqual")) tslError("tsl-type-mismatch", `${name}() compares float or int scalars`);
        if (name !== "equal" && name !== "notEqual" && types.length !== 2) tslError("invalid-tsl-graph", `${name}() takes two operands`);
        return "bool";
      }
      return tslError("tsl-unsupported-node", `unsupported op ${String(name)}`);
  }
}

const ARITY: Readonly<Record<TslOpName, number>> = {
  sin: 1, cos: 1, tan: 1, abs: 1, sign: 1, sqrt: 1, exp: 1, log: 1, fract: 1, floor: 1, ceil: 1, normalize: 1,
  saturate: 1, oneMinus: 1, negate: 1, length: 1, not: 1, toFloat: 1, toInt: 1,
  add: 2, sub: 2, mul: 2, div: 2, mod: 2, pow: 2, min: 2, max: 2, step: 2, dot: 2, cross: 2, distance: 2, atan2: 2,
  lessThan: 2, greaterThan: 2, lessThanEqual: 2, greaterThanEqual: 2, equal: 2, notEqual: 2, and: 2, or: 2,
  mix: 3, smoothstep: 3, clamp: 3, select: 3
};

/** Build an op node, folding it to a constant when every argument is a constant. */
export function op(name: TslOpName, ...inputs: TslInput[]): TslNode {
  if (inputs.length !== ARITY[name]) tslError("invalid-tsl-graph", `${name}() takes ${ARITY[name]} argument(s), got ${inputs.length}`);
  const args = inputs.map((input) => toNode(input));
  const type = opResultType(name, args);
  if (args.every((arg) => arg.data.k === "const")) {
    const folded = evalOp(name, args.map((arg) => ({ type: arg.type, value: (arg.data as { value: readonly number[] }).value })), type);
    return constNode(type, folded);
  }
  return new TslNode(type, { k: "op", op: name, args });
}

/* ------------------------------------------------------------------------- */
/* Numeric op semantics (shared by constant folding and the interpreter)      */
/* ------------------------------------------------------------------------- */

export interface TslValue { readonly type: TslType; readonly value: readonly number[]; }

const at = (value: readonly number[], index: number): number => (value.length === 1 ? value[0]! : value[index]!);
const glslFract = (x: number): number => x - Math.floor(x);
const glslSign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
const glslMod = (x: number, y: number): number => x - y * Math.floor(x / y);
const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function evalOp(name: TslOpName, args: readonly TslValue[], resultType: TslType): number[] {
  const n = dimOf(resultType);
  const values = args.map((arg) => arg.value);
  const cw = (fn: (...xs: number[]) => number): number[] => Array.from({ length: n }, (_, i) => fn(...values.map((v) => at(v, i))));
  switch (name) {
    case "add": return cw((a, b) => a! + b!);
    case "sub": return cw((a, b) => a! - b!);
    case "mul": return cw((a, b) => a! * b!);
    case "div": return cw((a, b) => a! / b!);
    case "mod": return cw((a, b) => glslMod(a!, b!));
    case "pow": return cw((a, b) => Math.pow(a!, b!));
    case "min": return cw((a, b) => Math.min(a!, b!));
    case "max": return cw((a, b) => Math.max(a!, b!));
    case "atan2": return cw((a, b) => Math.atan2(a!, b!));
    case "step": return cw((edge, x) => (x! < edge! ? 0 : 1));
    case "sin": return cw((a) => Math.sin(a!));
    case "cos": return cw((a) => Math.cos(a!));
    case "tan": return cw((a) => Math.tan(a!));
    case "abs": return cw((a) => Math.abs(a!));
    case "sign": return cw((a) => glslSign(a!));
    case "sqrt": return cw((a) => Math.sqrt(a!));
    case "exp": return cw((a) => Math.exp(a!));
    case "log": return cw((a) => Math.log(a!));
    case "fract": return cw((a) => glslFract(a!));
    case "floor": return cw((a) => Math.floor(a!));
    case "ceil": return cw((a) => Math.ceil(a!));
    case "saturate": return cw((a) => Math.min(1, Math.max(0, a!)));
    case "oneMinus": return cw((a) => 1 - a!);
    case "negate": return cw((a) => -a!);
    case "toFloat": return [values[0]![0]!];
    case "toInt": return [Math.trunc(values[0]![0]!)];
    case "normalize": {
      const v = values[0]!;
      const len = Math.hypot(...v);
      return v.map((x) => x / len);
    }
    case "length": return [Math.hypot(...values[0]!)];
    case "dot": {
      const a = values[0]!;
      const b = values[1]!;
      const d = Math.max(a.length, b.length);
      let sum = 0;
      for (let i = 0; i < d; i++) sum += at(a, i) * at(b, i);
      return [sum];
    }
    case "distance": {
      const a = values[0]!;
      const b = values[1]!;
      const d = Math.max(a.length, b.length);
      let sum = 0;
      for (let i = 0; i < d; i++) sum += (at(a, i) - at(b, i)) ** 2;
      return [Math.sqrt(sum)];
    }
    case "cross": {
      const [ax, ay, az] = values[0] as [number, number, number];
      const [bx, by, bz] = values[1] as [number, number, number];
      return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    }
    case "mix": return cw((a, b, t) => a! * (1 - t!) + b! * t!);
    case "smoothstep": return cw((e0, e1, x) => smooth(e0!, e1!, x!));
    case "clamp": return cw((x, lo, hi) => Math.min(Math.max(x!, lo!), hi!));
    case "select": return values[0]![0] ? [...values[1]!] : [...values[2]!];
    case "lessThan": return [values[0]![0]! < values[1]![0]! ? 1 : 0];
    case "greaterThan": return [values[0]![0]! > values[1]![0]! ? 1 : 0];
    case "lessThanEqual": return [values[0]![0]! <= values[1]![0]! ? 1 : 0];
    case "greaterThanEqual": return [values[0]![0]! >= values[1]![0]! ? 1 : 0];
    case "equal": return [values[0]![0]! === values[1]![0]! ? 1 : 0];
    case "notEqual": return [values[0]![0]! !== values[1]![0]! ? 1 : 0];
    case "and": return [values[0]![0]! && values[1]![0]! ? 1 : 0];
    case "or": return [values[0]![0]! || values[1]![0]! ? 1 : 0];
    case "not": return [values[0]![0]! ? 0 : 1];
    default: return tslError("tsl-unsupported-node", `unsupported op ${String(name)}`);
  }
}

/* ------------------------------------------------------------------------- */
/* Swizzle + construct                                                        */
/* ------------------------------------------------------------------------- */

const SWIZZLE_SETS = ["xyzw", "rgba"] as const;

export function swizzle(src: TslNode, comps: string): TslNode {
  const set = SWIZZLE_SETS.find((candidate) => [...comps].every((c) => candidate.includes(c)));
  if (!set || comps.length < 1 || comps.length > 4) tslError("invalid-tsl-graph", `invalid swizzle ".${comps}"`);
  if (!isVec(src.type)) tslError("tsl-type-mismatch", `cannot swizzle a ${src.type}`);
  const indices = [...comps].map((c) => set.indexOf(c));
  if (indices.some((i) => i >= dimOf(src.type))) tslError("tsl-type-mismatch", `swizzle ".${comps}" is out of range for ${src.type}`);
  const normalized = indices.map((i) => "xyzw"[i]).join("");
  const type = vecOf(indices.length);
  if (src.data.k === "const") return constNode(type, indices.map((i) => (src.data as { value: readonly number[] }).value[i]!));
  return new TslNode(type, { k: "swizzle", src, comps: normalized });
}

export function construct(type: "vec2" | "vec3" | "vec4", inputs: readonly TslInput[]): TslNode {
  const args = inputs.map((input) => toNode(input));
  const need = dimOf(type);
  const total = args.reduce((sum, arg) => sum + dimOf(arg.type), 0);
  for (const arg of args) if (arg.type === "bool" || arg.type === "sampler2D") tslError("tsl-type-mismatch", `${type}() cannot take a ${arg.type}`);
  const broadcast = args.length === 1 && dimOf(args[0]!.type) === 1;
  if (!broadcast && total !== need) tslError("tsl-type-mismatch", `${type}() needs ${need} component(s) in total, got ${total}`);
  if (args.every((arg) => arg.data.k === "const")) {
    const flat = args.flatMap((arg) => [...(arg.data as { value: readonly number[] }).value]);
    return constNode(type, broadcast ? Array.from({ length: need }, () => flat[0]!) : flat);
  }
  return new TslNode(type, { k: "construct", args });
}

/* Swizzle accessors (x, y, z, w, xy, xyz, rgb, ...) defined once on the prototype. */
const swizzleKeys = new Set<string>();
function defineSwizzles(set: string): void {
  const build = (prefix: string, depth: number): void => {
    for (const ch of set) {
      const key = prefix + ch;
      swizzleKeys.add(key);
      if (depth < 4) build(key, depth + 1);
    }
  };
  build("", 1);
}
for (const set of SWIZZLE_SETS) defineSwizzles(set);
for (const key of swizzleKeys) {
  if (key in TslNode.prototype) continue;
  Object.defineProperty(TslNode.prototype, key, { configurable: true, get(this: TslNode) { return swizzle(this, key); } });
}

/** Swizzle accessors are defined dynamically; this declaration surfaces the common ones to TypeScript. */
export interface TslNode {
  readonly x: TslNode; readonly y: TslNode; readonly z: TslNode; readonly w: TslNode;
  readonly r: TslNode; readonly g: TslNode; readonly b: TslNode; readonly a: TslNode;
  readonly xy: TslNode; readonly xz: TslNode; readonly yz: TslNode; readonly zw: TslNode; readonly xyz: TslNode; readonly xyzw: TslNode;
  readonly rg: TslNode; readonly rgb: TslNode; readonly rgba: TslNode;
}
