/**
 * SH-01 / L1-11 — public TSL-subset surface: `tsl.*` node factories and
 * `material.node(...)` (see `emit.ts`). GLSL only; three.js TSL names outside
 * the subset throw `tsl-unsupported-node` instead of resolving to `undefined`.
 */

import type { AuraMaterialSpec } from "../types.js";
import { assertAuraCustomMaterialSpec } from "../../compiler/customMaterial.js";
import {
  Fn,
  If,
  Loop,
  TSL_BUILTIN_TYPES,
  TslNode,
  TslUniformArray,
  constNode,
  construct,
  op,
  parseHexColor,
  swizzle,
  tslError,
  toNode,
  type TslBuiltinName,
  type TslInput,
  type TslType
} from "./ir.js";
import { compileTslMaterial, type TslCompileResult, type TslMaterialNodeOptions } from "./emit.js";

export { Fn, If, Loop, TslNode, compileTslMaterial };
export type { TslCompileResult, TslInput, TslMaterialNodeOptions, TslType };
import { evaluateTsl } from "./interpret.js";
export { evaluateTsl };
export type { TslEvalContext } from "./interpret.js";

const builtin = (name: TslBuiltinName): TslNode => new TslNode(TSL_BUILTIN_TYPES[name], { k: "builtin", name });

export type TslUniformKind = "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "color";
export interface TslUniformOptions { readonly name?: string; readonly type?: TslUniformKind; }

const IDENT = /^[A-Za-z_]\w*$/;
const KIND: Readonly<Record<TslUniformKind, { readonly type: TslType; readonly spec: string }>> = {
  float: { type: "float", spec: "f32" },
  int: { type: "int", spec: "i32" },
  bool: { type: "bool", spec: "bool" },
  vec2: { type: "vec2", spec: "vec2" },
  vec3: { type: "vec3", spec: "vec3" },
  vec4: { type: "vec4", spec: "vec4" },
  color: { type: "vec3", spec: "color3" }
};

function inferKind(value: unknown): TslUniformKind {
  if (typeof value === "number") return "float";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "string") return "color";
  if ((Array.isArray(value) || ArrayBuffer.isView(value)) && (value as ArrayLike<number>).length >= 2 && (value as ArrayLike<number>).length <= 4) {
    return (["vec2", "vec3", "vec4"] as const)[(value as ArrayLike<number>).length - 2]!;
  }
  return tslError("invalid-tsl-graph", `cannot infer a uniform type from ${String(value)}; pass { type } explicitly`);
}

/** `uniform(value, { name?, type? })` — name it to update it later with `handle.setUniform(name, value)`. */
function uniform(value: unknown, options: TslUniformOptions = {}): TslNode {
  const kind = options.type ?? inferKind(value);
  const mapped = KIND[kind];
  if (options.name !== undefined && !IDENT.test(options.name)) tslError("invalid-tsl-graph", `uniform name "${options.name}" is not a valid identifier`);
  if (kind === "color" && typeof value === "string") parseHexColor(value);
  return new TslNode(mapped.type, { k: "uniform", ...(options.name !== undefined ? { name: options.name } : {}), value, specType: mapped.spec });
}

/** `uniformArray(values, type, { name? })`: N uniforms named `<name>_0 … <name>_{N-1}`; `.element(i)` selects one. */
function uniformArray(values: readonly unknown[], type: TslUniformKind = "float", options: { readonly name?: string } = {}): TslUniformArray {
  if (values.length < 1 || values.length > 64) tslError("invalid-tsl-graph", "uniformArray needs 1..64 elements");
  if (options.name !== undefined && !IDENT.test(options.name)) tslError("invalid-tsl-graph", `uniformArray name "${options.name}" is not a valid identifier`);
  const elements = values.map((value, index) => uniform(value, { type, ...(options.name ? { name: `${options.name}_${index}` } : {}) }));
  return new TslUniformArray(options.name, KIND[type].type, values, elements);
}

/** `texture(handle, uvNode?, { name? })` → vec4. `handle` is whatever `material.custom` accepts for a texture2d uniform. */
function texture(handle: unknown, uvNode?: TslInput, options: { readonly name?: string } = {}): TslNode {
  if (options.name !== undefined && !IDENT.test(options.name)) tslError("invalid-tsl-graph", `texture name "${options.name}" is not a valid identifier`);
  const sampler = new TslNode("sampler2D", { k: "uniform", ...(options.name !== undefined ? { name: options.name } : {}), value: handle, specType: "texture2d" });
  const uv = uvNode === undefined ? builtin("uv") : toNode(uvNode);
  if (uv.type !== "vec2") tslError("tsl-type-mismatch", `texture() uv must be a vec2 (got ${uv.type})`);
  return new TslNode("vec4", { k: "texture", sampler, uv });
}

function uvNode(index = 0): TslNode {
  if (index !== 0) tslError("tsl-unsupported-node", `tsl.uv(${index}): only the first UV set is supported`);
  return builtin("uv");
}

function float(value: TslInput): TslNode {
  const node = toNode(value);
  if (node.type === "float") return node;
  if (node.type === "int") return op("toFloat", node);
  return tslError("tsl-type-mismatch", `float() cannot convert ${node.type}`);
}

function int(value: TslInput): TslNode {
  const node = typeof value === "number" ? constNode("int", [Math.trunc(value)]) : toNode(value);
  if (node.type === "int") return node;
  if (node.type === "float") return op("toInt", node);
  return tslError("tsl-type-mismatch", `int() cannot convert ${node.type}`);
}

function bool(value: boolean | TslNode): TslNode {
  const node = toNode(value);
  if (node.type !== "bool") tslError("tsl-type-mismatch", `bool() cannot convert ${node.type}`);
  return node;
}

/** `color("#rrggbb")`, `color(r, g, b)` or `color(grey)` → vec3 as authored (no colour-space conversion). */
function color(...args: [string] | [number] | [number, number, number]): TslNode {
  if (args.length === 3) return constNode("vec3", args);
  const only = args[0];
  if (typeof only === "string") return constNode("vec3", [...parseHexColor(only)]);
  return constNode("vec3", [only, only, only]);
}

const unary = (name: Parameters<typeof op>[0]) => (a: TslInput): TslNode => op(name, a);
const binary = (name: Parameters<typeof op>[0]) => (a: TslInput, b: TslInput): TslNode => op(name, a, b);

/** Every name in the supported subset (also the codemod's and docs' source of truth). */
export const TSL_SUPPORTED_NAMES = [
  "positionLocal", "positionWorld", "normalLocal", "normalWorld", "uv", "time", "cameraPosition",
  "uniform", "uniformArray", "texture", "color", "float", "int", "bool", "vec2", "vec3", "vec4",
  "add", "sub", "mul", "div", "mod", "mix", "smoothstep", "clamp", "pow", "abs", "min", "max", "dot", "cross",
  "normalize", "length", "distance", "sin", "cos", "tan", "fract", "floor", "ceil", "sign", "sqrt", "exp", "log",
  "step", "atan2", "saturate", "oneMinus", "negate", "select",
  "lessThan", "greaterThan", "lessThanEqual", "greaterThanEqual", "equal", "notEqual", "and", "or", "not",
  "Fn", "If", "Loop"
] as const;

const tslCore = {
  positionLocal: builtin("positionLocal"),
  positionWorld: builtin("positionWorld"),
  normalLocal: builtin("normalLocal"),
  normalWorld: builtin("normalWorld"),
  time: builtin("time"),
  cameraPosition: builtin("cameraPosition"),
  uv: uvNode,
  uniform,
  uniformArray,
  texture,
  color,
  float,
  int,
  bool,
  vec2: (...args: TslInput[]): TslNode => construct("vec2", args),
  vec3: (...args: TslInput[]): TslNode => construct("vec3", args),
  vec4: (...args: TslInput[]): TslNode => construct("vec4", args),
  add: binary("add"), sub: binary("sub"), mul: binary("mul"), div: binary("div"), mod: binary("mod"),
  pow: binary("pow"), min: binary("min"), max: binary("max"), dot: binary("dot"), cross: binary("cross"),
  distance: binary("distance"), atan2: binary("atan2"), step: binary("step"),
  mix: (a: TslInput, b: TslInput, t: TslInput): TslNode => op("mix", a, b, t),
  smoothstep: (edge0: TslInput, edge1: TslInput, x: TslInput): TslNode => op("smoothstep", edge0, edge1, x),
  clamp: (x: TslInput, lo: TslInput = 0, hi: TslInput = 1): TslNode => op("clamp", x, lo, hi),
  select: (condition: TslInput, whenTrue: TslInput, whenFalse: TslInput): TslNode => op("select", condition, whenTrue, whenFalse),
  abs: unary("abs"), normalize: unary("normalize"), length: unary("length"), sin: unary("sin"), cos: unary("cos"),
  tan: unary("tan"), fract: unary("fract"), floor: unary("floor"), ceil: unary("ceil"), sign: unary("sign"),
  sqrt: unary("sqrt"), exp: unary("exp"), log: unary("log"), saturate: unary("saturate"), oneMinus: unary("oneMinus"),
  negate: unary("negate"), not: unary("not"),
  lessThan: binary("lessThan"), greaterThan: binary("greaterThan"), lessThanEqual: binary("lessThanEqual"),
  greaterThanEqual: binary("greaterThanEqual"), equal: binary("equal"), notEqual: binary("notEqual"),
  and: binary("and"), or: binary("or"),
  Fn,
  If,
  Loop,
  /** `tsl.compile(options)`: the generated GLSL, uniform list and `material.custom` spec for a node material. */
  compile: compileTslMaterial,
  /** `tsl.evaluate(node, context)`: CPU reference evaluation of a graph (same op semantics as constant folding). */
  evaluate: evaluateTsl,
  supportedNames: TSL_SUPPORTED_NAMES
};

const PROBES: ReadonlySet<string> = new Set([
  "then", "toJSON", "constructor", "asymmetricMatch", "$$typeof", "nodeType", "inspect", "toString", "valueOf", "__esModule", "prototype", "length", "name", "tagName"
]);

/**
 * The `tsl` namespace. Reading a name that is not part of the supported subset
 * (for example `triplanarTexture`, `viewportUV`, `storage`) throws
 * `tsl-unsupported-node` so a ported graph fails loudly at authoring time.
 */
export const tsl: typeof tslCore = new Proxy(tslCore, {
  get(target, property, receiver) {
    if (typeof property === "symbol" || property in target || PROBES.has(property)) return Reflect.get(target, property, receiver);
    return tslError("tsl-unsupported-node", `tsl.${property} is not part of the supported TSL subset (supported: ${TSL_SUPPORTED_NAMES.join(", ")})`);
  }
});

/** `material.node({ colorNode, emissiveNode, opacityNode, positionNode, ... })` → a `material.custom` spec. */
export function materialNode(options: TslMaterialNodeOptions): AuraMaterialSpec {
  const { spec } = compileTslMaterial(options);
  assertAuraCustomMaterialSpec(spec, "material.node");
  return { kind: "custom", custom: spec };
}

export { swizzle };
