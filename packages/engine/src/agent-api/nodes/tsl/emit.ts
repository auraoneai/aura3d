/**
 * SH-01 — GLSL 300 es emitter for the TSL subset. Produces an
 * `AuraCustomMaterialSpec` consumed by the existing `material.custom` path
 * (`compiler/customMaterial.ts`); that path is not modified.
 *
 * GLSL only. WGSL is NOT emitted: `backend: "wgsl"` fails with
 * `tsl-requires-glsl-backend` rather than producing a spec that cannot draw.
 */

import type { AuraCustomMaterialSpec, AuraCustomUniformSpec } from "../types.js";
import {
  TslNode,
  constNode,
  isVec,
  tslError,
  toNode,
  type TslBlock,
  type TslBuiltinName,
  type TslInput,
  type TslOpName,
  type TslType,
  type TslStatement
} from "./ir.js";

export interface TslMaterialNodeOptions {
  readonly colorNode?: TslInput;
  readonly emissiveNode?: TslInput;
  readonly opacityNode?: TslInput;
  readonly positionNode?: TslInput;
  /** Not supported: custom materials have no scene-light access. Rejected with `tsl-unsupported-output`. */
  readonly normalNode?: TslInput;
  /** Not supported (see `normalNode`). */
  readonly roughnessNode?: TslInput;
  /** Not supported (see `normalNode`). */
  readonly metalnessNode?: TslInput;
  /** Discard fragments whose final alpha is below this value (three `alphaTest`). */
  readonly alphaTest?: number;
  /** `"wgsl"` fails with `tsl-requires-glsl-backend`; GLSL is the only emitted language. */
  readonly backend?: "glsl" | "wgsl";
  readonly transparent?: boolean;
  readonly depthWrite?: boolean;
  readonly depthTest?: boolean;
  readonly side?: "front" | "back" | "double";
  readonly blending?: "normal" | "additive" | "subtractive" | "multiply" | "custom";
  readonly fog?: boolean;
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
}

export interface TslCompiledUniform { readonly name: string; readonly type: TslType; readonly specType: string; }
export interface TslCompileResult {
  readonly spec: AuraCustomMaterialSpec;
  readonly vertex: string;
  readonly fragment: string;
  readonly uniforms: readonly TslCompiledUniform[];
}

const GLSL_TYPE: Readonly<Record<TslType, string>> = { float: "float", int: "int", bool: "bool", vec2: "vec2", vec3: "vec3", vec4: "vec4", sampler2D: "sampler2D" };
const GLSL_NAME: Partial<Record<TslOpName, string>> = { atan2: "atan" };
const INFIX: Partial<Record<TslOpName, string>> = {
  add: "+", sub: "-", mul: "*", div: "/",
  lessThan: "<", greaterThan: ">", lessThanEqual: "<=", greaterThanEqual: ">=", equal: "==", notEqual: "!=", and: "&&", or: "||"
};
const VARYING: Readonly<Record<"positionLocal" | "positionWorld" | "normalLocal" | "normalWorld" | "uv", { readonly name: string; readonly type: TslType }>> = {
  positionLocal: { name: "vTslPositionLocal", type: "vec3" },
  positionWorld: { name: "vTslPositionWorld", type: "vec3" },
  normalLocal: { name: "vTslNormalLocal", type: "vec3" },
  normalWorld: { name: "vTslNormalWorld", type: "vec3" },
  uv: { name: "vTslUv", type: "vec2" }
};

export function formatFloat(value: number): string {
  if (!Number.isFinite(value)) tslError("invalid-tsl-graph", "non-finite number in shader literal");
  const text = Object.is(value, -0) ? "0.0" : Number.isInteger(value) && Math.abs(value) < 1e15 ? `${value}.0` : String(value);
  return value < 0 ? `(${text})` : text;
}

const SIMPLE = /^[A-Za-z_]\w*(?:\.[xyzw]{1,4})?$|^\(?-?[\d.e+-]+\)?$/;
const atom = (expr: string): string => (SIMPLE.test(expr) ? expr : `(${expr})`);

function literal(type: TslType, value: readonly number[]): string {
  if (type === "int") return String(Math.trunc(value[0]!)).replace(/^-(\d+)$/, "(-$1)");
  if (type === "bool") return value[0] ? "true" : "false";
  if (type === "float") return formatFloat(value[0]!);
  return `${GLSL_TYPE[type]}(${value.map(formatFloat).join(", ")})`;
}

interface UniformRecord { readonly name: string; readonly type: TslType; readonly specType: string; readonly value: unknown; }

class Program {
  readonly uniforms = new Map<TslNode, UniformRecord>();
  readonly names = new Map<string, TslNode>();
  readonly fragmentVaryings = new Set<keyof typeof VARYING>();
  private autoUniform = 0;
  private autoSampler = 0;

  register(node: TslNode): string {
    const known = this.uniforms.get(node);
    if (known) return known.name;
    if (node.data.k !== "uniform") return tslError("invalid-tsl-graph", "internal: not a uniform node");
    const data = node.data;
    const name = data.name ?? (node.type === "sampler2D" ? `tslMap${this.autoSampler++}` : `tslUniform${this.autoUniform++}`);
    const other = this.names.get(name);
    if (other && other !== node) tslError("invalid-tsl-graph", `two different uniform nodes are both named "${name}"; give each a unique name`);
    this.names.set(name, node);
    this.uniforms.set(node, { name, type: node.type, specType: data.specType, value: data.value });
    return name;
  }
}

class StageEmitter {
  private lines: string[] = [];
  private depth = 1;
  private readonly scopes: Map<TslNode, string>[] = [new Map()];
  private temp = 0;
  private varCounter = 0;
  private readonly names = new Map<TslNode, string>();

  constructor(private readonly program: Program, private readonly stage: "vertex" | "fragment") {}

  get body(): readonly string[] { return this.lines; }
  line(text: string): void { this.lines.push(`${"  ".repeat(this.depth)}${text}`); }

  private lookup(node: TslNode): string | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const hit = this.scopes[i]!.get(node);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  private remember(node: TslNode, expr: string): string {
    this.scopes[this.scopes.length - 1]!.set(node, expr);
    return expr;
  }

  private materialize(node: TslNode, expr: string): string {
    const name = `t${this.temp++}`;
    this.line(`${GLSL_TYPE[node.type]} ${name} = ${expr};`);
    return this.remember(node, name);
  }

  coerce(expr: string, from: TslType, to: TslType): string {
    if (from === to) return expr;
    if (from === "int" && to === "float") return `float(${expr})`;
    if (from === "int" && isVec(to)) return `${GLSL_TYPE[to]}(float(${expr}))`;
    if (from === "float" && isVec(to)) return `${GLSL_TYPE[to]}(${expr})`;
    return tslError("tsl-type-mismatch", `cannot convert ${from} to ${to}`);
  }

  private genTarget(args: readonly TslNode[]): TslType {
    const vec = args.find((arg) => isVec(arg.type));
    return vec ? vec.type : "float";
  }

  expr(node: TslNode): string {
    const hit = this.lookup(node);
    if (hit !== undefined) return hit;
    const d = node.data;
    switch (d.k) {
      case "const": return literal(node.type, d.value);
      case "builtin": return this.builtin(node, d.name);
      case "uniform": return this.program.register(node);
      case "swizzle": return `${atom(this.expr(d.src))}.${d.comps}`;
      case "op": return this.materialize(node, this.opExpr(node, d.op, d.args));
      case "construct": {
        const parts = d.args.map((arg) => (arg.type === "int" ? `float(${this.expr(arg)})` : this.expr(arg)));
        return this.materialize(node, `${GLSL_TYPE[node.type]}(${parts.join(", ")})`);
      }
      case "texture": return this.materialize(node, `texture(${this.expr(d.sampler)}, ${this.expr(d.uv)})`);
      case "element": {
        const index = this.expr(d.index);
        const idx = d.index.type === "int" ? index : `int(${index})`;
        const elements = d.array.elements.map((element) => this.expr(element));
        let chain = elements[elements.length - 1]!;
        for (let i = elements.length - 2; i >= 0; i--) chain = `(${idx} == ${i} ? ${elements[i]} : ${chain})`;
        return this.materialize(node, chain);
      }
      case "var":
      case "loopIndex": {
        const name = this.names.get(node);
        if (!name) return tslError("invalid-tsl-graph", "a variable is used outside the block that declared it");
        return name;
      }
      case "call": {
        // Call-site semantics: arguments are evaluated before the body, so a texture or other
        // expensive argument is computed once outside any loop/branch the body contains.
        for (const arg of d.args) this.expr(arg);
        this.statements(d.block);
        return this.remember(node, this.expr(d.result));
      }
    }
  }

  private builtin(node: TslNode, name: TslBuiltinName): string {
    if (name === "time") return "uTime";
    if (name === "cameraPosition") return "cameraPosition";
    if (this.stage === "vertex") {
      if (name === "positionLocal") return "position";
      if (name === "normalLocal") return "normal";
      if (name === "uv") return "uv";
      if (name === "positionWorld") return this.materialize(node, "(modelMatrix * vec4(position, 1.0)).xyz");
      return this.materialize(node, "normalize(normalMatrix * normal)");
    }
    const key = name as keyof typeof VARYING;
    this.program.fragmentVaryings.add(key);
    if (name === "normalWorld") return this.materialize(node, `normalize(${VARYING.normalWorld.name})`);
    return VARYING[key].name;
  }

  private opExpr(node: TslNode, name: TslOpName, args: readonly TslNode[]): string {
    const infix = INFIX[name];
    if (infix) {
      if (name === "and" || name === "or") return `(${this.expr(args[0]!)} ${infix} ${this.expr(args[1]!)})`;
      const mixed = args[0]!.type !== args[1]!.type && args.every((arg) => arg.type === "int" || arg.type === "float");
      const sides = args.map((arg) => {
        const e = this.expr(arg);
        const promote = arg.type === "int" && (mixed || (node.type !== "int" && node.type !== "bool"));
        return promote ? `float(${e})` : e;
      });
      return `(${sides[0]} ${infix} ${sides[1]})`;
    }
    switch (name) {
      case "not": return `(!${atom(this.expr(args[0]!))})`;
      case "negate": return `(-${atom(this.expr(args[0]!))})`;
      case "oneMinus": return `(1.0 - ${atom(this.coerce(this.expr(args[0]!), args[0]!.type, node.type))})`;
      case "saturate": return `clamp(${this.coerce(this.expr(args[0]!), args[0]!.type, node.type)}, 0.0, 1.0)`;
      case "toFloat": return `float(${this.expr(args[0]!)})`;
      case "toInt": return `int(${this.expr(args[0]!)})`;
      case "select": {
        const cond = this.expr(args[0]!);
        const a = this.coerce(this.expr(args[1]!), args[1]!.type, node.type);
        const b = this.coerce(this.expr(args[2]!), args[2]!.type, node.type);
        return `(${cond} ? ${a} : ${b})`;
      }
      case "length": case "dot": case "distance": {
        const target = this.genTarget(args);
        const parts = args.map((arg) => this.coerce(this.expr(arg), arg.type, target));
        return `${name}(${parts.join(", ")})`;
      }
      case "cross": return `cross(${this.expr(args[0]!)}, ${this.expr(args[1]!)})`;
      default: {
        const parts = args.map((arg) => this.coerce(this.expr(arg), arg.type, node.type));
        return `${GLSL_NAME[name] ?? name}(${parts.join(", ")})`;
      }
    }
  }

  statements(block: TslBlock): void {
    for (const statement of block) this.statement(statement);
  }

  private nested(block: TslBlock): void {
    this.depth++;
    this.scopes.push(new Map());
    this.statements(block);
    this.scopes.pop();
    this.depth--;
  }

  private statement(statement: TslStatement): void {
    switch (statement.s) {
      case "decl": {
        const node = statement.node;
        const init = (node.data as { init: TslNode }).init;
        const value = this.coerce(this.expr(init), init.type, node.type);
        const name = `tslv${this.varCounter++}`;
        this.line(`${GLSL_TYPE[node.type]} ${name} = ${value};`);
        this.names.set(node, name);
        break;
      }
      case "assign": {
        const name = this.names.get(statement.target);
        if (!name) return tslError("invalid-tsl-graph", "assign() target was declared in a block that is not in scope");
        const rhs = this.expr(statement.value);
        const fix = statement.op && isVec(statement.target.type) && statement.value.type === "float"
          ? rhs
          : this.coerce(rhs, statement.value.type, statement.target.type);
        this.line(`${name} ${statement.op ?? ""}= ${fix};`);
        break;
      }
      case "if": {
        const conds = statement.branches.map((branch) => this.expr(branch.cond));
        statement.branches.forEach((branch, i) => {
          this.line(i === 0 ? `if (${conds[i]}) {` : `} else if (${conds[i]}) {`);
          this.nested(branch.block);
        });
        if (statement.otherwise) {
          this.line("} else {");
          this.nested(statement.otherwise);
        }
        this.line("}");
        break;
      }
      case "loop": {
        const start = this.expr(statement.start);
        const end = this.expr(statement.end);
        const name = `tslLoopI${this.varCounter++}`;
        this.names.set(statement.index, name);
        this.line(`for (int ${name} = ${start}; ${name} < ${end}; ${name}++) {`);
        this.nested(statement.block);
        this.line("}");
        break;
      }
    }
  }
}

function need(node: TslInput | undefined, label: string, allowed: readonly TslType[]): TslNode | undefined {
  if (node === undefined) return undefined;
  const converted = toNode(node);
  if (!allowed.includes(converted.type)) {
    tslError("tsl-type-mismatch", `${label} must be ${allowed.join(" or ")} (got ${converted.type})`);
  }
  return converted;
}

/** Compile a node-material description into a GLSL `material.custom` spec (and the generated sources). */
export function compileTslMaterial(options: TslMaterialNodeOptions): TslCompileResult {
  if (options.backend === "wgsl") {
    tslError("tsl-requires-glsl-backend", "material.node emits GLSL only; WGSL is not generated. createAuraApp mounts WebGL2, so use the default backend (\"glsl\") or hand-author `material.custom({ wgsl })`");
  }
  for (const key of ["normalNode", "roughnessNode", "metalnessNode"] as const) {
    if (options[key] !== undefined) {
      tslError("tsl-unsupported-output", `material.node does not support ${key}: custom materials have no scene-light access, so a shading normal / roughness / metalness would have no effect. Supported outputs: colorNode, emissiveNode, opacityNode, positionNode, alphaTest`);
    }
  }
  if (options.alphaTest !== undefined && (!Number.isFinite(options.alphaTest) || options.alphaTest < 0 || options.alphaTest > 1)) {
    tslError("invalid-tsl-graph", "alphaTest must be a number in 0..1");
  }

  const color = need(options.colorNode, "colorNode", ["vec3", "vec4"]) ?? constNode("vec3", [1, 1, 1]);
  const emissive = need(options.emissiveNode, "emissiveNode", ["vec3"]);
  const opacity = need(options.opacityNode, "opacityNode", ["float"]);
  const position = need(options.positionNode, "positionNode", ["vec3"]);

  const program = new Program();

  // Fragment first: it discovers which varyings the vertex stage must write.
  const fe = new StageEmitter(program, "fragment");
  const colorExpr = fe.expr(color);
  fe.line(`${color.type === "vec4" ? "vec4" : "vec3"} tslColor = ${colorExpr};`);
  fe.line("vec3 tslRgb = tslColor.rgb;");
  fe.line(`float tslAlpha = ${color.type === "vec4" ? "tslColor.a" : "1.0"};`);
  if (emissive) fe.line(`tslRgb += ${fe.expr(emissive)};`);
  if (opacity) fe.line(`tslAlpha *= ${fe.expr(opacity)};`);
  if (options.alphaTest !== undefined && options.alphaTest > 0) fe.line(`if (tslAlpha < ${formatFloat(options.alphaTest)}) discard;`);
  fe.line("outColor = vec4(tslRgb, tslAlpha);");

  const varyings = [...program.fragmentVaryings].sort();
  const ve = new StageEmitter(program, "vertex");
  const positionExpr = position ? ve.expr(position) : "position";
  ve.line(`vec3 tslPosition = ${positionExpr};`);
  for (const key of varyings) {
    const target = VARYING[key].name;
    if (key === "positionLocal") ve.line(`${target} = tslPosition;`);
    else if (key === "positionWorld") ve.line(`${target} = (modelMatrix * vec4(tslPosition, 1.0)).xyz;`);
    else if (key === "normalLocal") ve.line(`${target} = normal;`);
    else if (key === "normalWorld") ve.line(`${target} = normalize(normalMatrix * normal);`);
    else ve.line(`${target} = uv;`);
  }
  ve.line("gl_Position = modelViewProjectionMatrix * vec4(tslPosition, 1.0);");

  const needsVertex = position !== undefined || varyings.length > 0;
  const varyingDecls = (qualifier: "in" | "out"): string[] => varyings.map((key) => `${qualifier} ${GLSL_TYPE[VARYING[key].type]} ${VARYING[key].name};`);

  const fragment = [
    "out vec4 outColor;",
    ...varyingDecls("in"),
    "void main() {",
    ...fe.body,
    "}"
  ].join("\n");
  const vertex = needsVertex ? [...varyingDecls("out"), "void main() {", ...ve.body, "}"].join("\n") : "";

  const uniforms: Record<string, AuraCustomUniformSpec> = {};
  const compiled: TslCompiledUniform[] = [];
  for (const record of program.uniforms.values()) {
    uniforms[record.name] = record.value === undefined
      ? (record.specType as AuraCustomUniformSpec)
      : ({ type: record.specType, value: record.value } as AuraCustomUniformSpec);
    compiled.push({ name: record.name, type: record.type, specType: record.specType });
  }

  const spec: AuraCustomMaterialSpec = {
    glsl: needsVertex ? { vertex, fragment } : { fragment },
    ...(Object.keys(uniforms).length > 0 ? { uniforms } : {}),
    ...(options.defines ? { defines: options.defines } : {}),
    ...(options.transparent !== undefined ? { transparent: options.transparent } : {}),
    ...(options.depthWrite !== undefined ? { depthWrite: options.depthWrite } : {}),
    ...(options.depthTest !== undefined ? { depthTest: options.depthTest } : {}),
    ...(options.side !== undefined ? { side: options.side } : {}),
    ...(options.blending !== undefined ? { blending: options.blending } : {}),
    ...(options.fog !== undefined ? { fog: options.fog } : {})
  };
  return { spec, vertex, fragment, uniforms: compiled };
}
