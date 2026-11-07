/**
 * A4 shader-graph pilots: a tiny expression builder over `shaderGraph` documents (`@aura3d/engine/shader-graph-runtime`).
 *
 * A graph requires equal operand types for every componentwise op (no implicit scalar broadcast), so a hand port of a GLSL
 * expression is mostly `construct` noise. `Expr` records each node's type and broadcasts an `f32` to the other operand's
 * vector type automatically, which keeps the port close to the original GLSL line by line. See
 * docs/rendering/portable-conversion-pattern.md.
 *
 * The builder only produces a `ShaderGraphDocument`; it never touches the GLSL path. Pilots select it with the default-off
 * `?portable=1` flag (`portable-flag.ts`).
 */
import type { ShaderGraphDocument, ShaderGraphFunction, ShaderGraphNode, ShaderGraphResource, ShaderGraphValueType } from "@aura3d/engine/shader-graph-runtime";

export type FloatType = "f32" | "vec2" | "vec3" | "vec4";
export interface Expr { readonly id: string; readonly type: FloatType }

const WIDTH: Readonly<Record<FloatType, number>> = { f32: 1, vec2: 2, vec3: 3, vec4: 4 };

export class GraphBuilder {
  private readonly nodes: ShaderGraphNode[] = [];
  private readonly resources: ShaderGraphResource[] = [];
  private readonly uniforms = new Map<string, Expr>();
  private readonly inputs = new Map<string, Expr>();
  private readonly constants = new Map<string, Expr>();
  private counter = 0;

  private emit(op: ShaderGraphNode["op"], type: FloatType | "bool", extra: Partial<ShaderGraphNode> = {}): Expr {
    const id = `n${this.counter++}`;
    this.nodes.push({ id, op, type: type as ShaderGraphValueType, ...extra });
    return { id, type: type as FloatType };
  }

  /** Scalar constant, or a vector constant from 2-4 numbers. Constants are de-duplicated. */
  c(...value: number[]): Expr {
    const type = (["f32", "f32", "vec2", "vec3", "vec4"] as const)[value.length]!;
    const key = `${type}:${value.join(",")}`;
    const hit = this.constants.get(key);
    if (hit) return hit;
    const made = this.emit("constant", type, { value: value.length === 1 ? value[0]! : value });
    this.constants.set(key, made);
    return made;
  }

  /** Declare (once) and read a uniform; the resource name is the authored uniform name, so `handle.setUniform(name, v)` keeps working. */
  uniform(name: string, type: FloatType): Expr {
    const hit = this.uniforms.get(name);
    if (hit) return hit;
    this.resources.push({ name, kind: "uniform", type });
    const made = this.emit("uniform", type, { resource: name });
    this.uniforms.set(name, made);
    return made;
  }

  /** A built-in input (`positionWorld`, `cameraPosition`, `uv0`, `normalWorld`, ...). */
  input(name: "positionWorld" | "positionLocal" | "normalWorld" | "normalLocal" | "cameraPosition" | "uv0" | "uv1" | "time", type: FloatType): Expr {
    const hit = this.inputs.get(name);
    if (hit) return hit;
    const made = this.emit("input", type, { name });
    this.inputs.set(name, made);
    return made;
  }

  /** Broadcast an f32 to `type` (a no-op when the type already matches). */
  to(x: Expr | number, type: FloatType): Expr {
    const e = typeof x === "number" ? this.c(x) : x;
    if (e.type === type) return e;
    if (e.type !== "f32") throw new Error(`cannot broadcast ${e.type} to ${type}`);
    return this.emit("construct", type, { inputs: Array.from({ length: WIDTH[type] }, () => e.id) });
  }

  private pair(a: Expr | number, b: Expr | number): [Expr, Expr, FloatType] {
    const ea = typeof a === "number" ? undefined : a;
    const eb = typeof b === "number" ? undefined : b;
    const type = (ea && ea.type !== "f32" ? ea.type : eb && eb.type !== "f32" ? eb.type : "f32") as FloatType;
    return [this.to(a, type), this.to(b, type), type];
  }

  private binary(op: ShaderGraphNode["op"], a: Expr | number, b: Expr | number): Expr {
    const [x, y, type] = this.pair(a, b);
    return this.emit(op, type, { inputs: [x.id, y.id] });
  }
  add(a: Expr | number, b: Expr | number): Expr { return this.binary("add", a, b); }
  sub(a: Expr | number, b: Expr | number): Expr { return this.binary("sub", a, b); }
  mul(a: Expr | number, b: Expr | number): Expr { return this.binary("mul", a, b); }
  div(a: Expr | number, b: Expr | number): Expr { return this.binary("div", a, b); }
  min(a: Expr | number, b: Expr | number): Expr { return this.binary("min", a, b); }
  max(a: Expr | number, b: Expr | number): Expr { return this.binary("max", a, b); }
  pow(a: Expr | number, b: Expr | number): Expr { return this.binary("pow", a, b); }
  /** Product of any number of operands, left to right. */
  prod(first: Expr | number, ...rest: (Expr | number)[]): Expr { return rest.reduce<Expr>((acc, next) => this.mul(acc, next), typeof first === "number" ? this.c(first) : first); }
  sum(first: Expr | number, ...rest: (Expr | number)[]): Expr { return rest.reduce<Expr>((acc, next) => this.add(acc, next), typeof first === "number" ? this.c(first) : first); }

  private unary(op: ShaderGraphNode["op"], a: Expr): Expr { return this.emit(op, a.type, { inputs: [a.id] }); }
  fract(a: Expr): Expr { return this.unary("fract", a); }
  floor(a: Expr): Expr { return this.unary("floor", a); }
  abs(a: Expr): Expr { return this.unary("abs", a); }
  sin(a: Expr): Expr { return this.unary("sin", a); }
  exp(a: Expr): Expr { return this.unary("exp", a); }
  sqrt(a: Expr): Expr { return this.unary("sqrt", a); }
  normalize(a: Expr): Expr { return this.unary("normalize", a); }
  saturate(a: Expr): Expr { return this.unary("saturate", a); }
  negate(a: Expr): Expr { return this.unary("negate", a); }

  length(a: Expr): Expr { return this.emit("length", "f32", { inputs: [a.id] }); }
  dot(a: Expr, b: Expr): Expr { return this.emit("dot", "f32", { inputs: [a.id, b.id] }); }
  /** GLSL `mix(a, b, t)`: `t` may be f32 for vector `a`/`b`. */
  mix(a: Expr | number, b: Expr | number, t: Expr | number): Expr {
    const [x, y, type] = this.pair(a, b);
    return this.emit("mix", type, { inputs: [x.id, y.id, this.to(t, type).id] });
  }
  /** GLSL `smoothstep(e0, e1, x)`; scalar edges broadcast to `x`'s type. */
  smoothstep(e0: Expr | number, e1: Expr | number, x: Expr): Expr {
    return this.emit("smoothstep", x.type, { inputs: [this.to(e0, x.type).id, this.to(e1, x.type).id, x.id] });
  }
  clamp(x: Expr, lo: Expr | number, hi: Expr | number): Expr {
    return this.emit("clamp", x.type, { inputs: [x.id, this.to(lo, x.type).id, this.to(hi, x.type).id] });
  }
  step(edge: Expr | number, x: Expr): Expr { return this.emit("step", x.type, { inputs: [this.to(edge, x.type).id, x.id] }); }
  /** GLSL `fract`-style mod: `x - y * floor(x / y)`. */
  mod(a: Expr, b: Expr | number): Expr { return this.binary("mod", a, b); }
  /** `cond ? a : b` for two equal types; `cond` is a `less`/`greater` result. */
  select(cond: Expr, a: Expr, b: Expr): Expr { return this.emit("select", a.type, { inputs: [cond.id, a.id, b.id] }); }
  less(a: Expr | number, b: Expr | number): Expr { return this.emit("less", "bool", { inputs: [this.to(a, "f32").id, this.to(b, "f32").id] }); }
  greater(a: Expr | number, b: Expr | number): Expr { return this.emit("greater", "bool", { inputs: [this.to(a, "f32").id, this.to(b, "f32").id] }); }

  swz(a: Expr, components: string): Expr {
    return this.emit("swizzle", (["f32", "f32", "vec2", "vec3", "vec4"] as const)[components.length]!, { inputs: [a.id], components });
  }
  vec(...parts: (Expr | number)[]): Expr {
    const exprs = parts.map((part) => (typeof part === "number" ? this.c(part) : part));
    const width = exprs.reduce((sum, e) => sum + WIDTH[e.type], 0);
    const type = (["f32", "f32", "vec2", "vec3", "vec4"] as const)[width]!;
    return this.emit("construct", type, { inputs: exprs.map((e) => e.id) });
  }

  private readonly functions: ShaderGraphFunction[] = [];

  /**
   * Declare a graph function (a GLSL helper). A graph is limited to 512 nodes counting every function body once, so a helper that is
   * called many times (vnoise called 8 times is 8 x ~50 nodes inline) MUST be a function: each call is one node. The body builder
   * is a fresh scope: only its parameters are visible inside (no uniforms or built-ins).
   */
  defineFn(name: string, params: readonly { readonly name: string; readonly type: FloatType }[], returnType: FloatType, body: (fn: GraphBuilder, args: readonly Expr[]) => Expr): void {
    if (this.functions.some((entry) => entry.name === name)) return;
    const fn = new GraphBuilder();
    const args = params.map((param) => fn.emit("parameter", param.type, { name: param.name }));
    const out = body(fn, args);
    this.functions.push({ name, parameters: params.map((param) => ({ name: param.name, type: param.type })), returnType, nodes: fn.nodes, output: out.id });
  }

  /** Call a function declared with `defineFn`. */
  call(name: string, type: FloatType, args: readonly Expr[]): Expr {
    return this.emit("call", type, { name, inputs: args.map((arg) => arg.id) });
  }

  /** Assemble a material graph. `color` is an unlit linear vec3/vec4; `opacity` is an optional f32. */
  build(outputs: { readonly color: Expr; readonly opacity?: Expr }): ShaderGraphDocument {
    return {
      version: 1,
      stage: "material",
      nodes: this.nodes,
      ...(this.functions.length ? { functions: this.functions } : {}),
      resources: this.resources,
      outputs: { color: outputs.color.id, ...(outputs.opacity ? { opacity: outputs.opacity.id } : {}) }
    };
  }
}

/** The pilots' shared building blocks, each a line-for-line port of the GLSL helper it replaces. */
export const glslLike = {
  /** `a3dSrgbToLinear(vec3)` from `#include <colorspace_decode>`. */
  srgbToLinear(g: GraphBuilder, c: Expr): Expr {
    const v = g.max(c, 0); // GLSL: vec3 c = max(srgb, vec3(0.0))
    const low = g.div(v, 12.92);
    const high = g.pow(g.div(g.add(v, 0.055), 1.055), 2.4); // scalar exponent broadcasts to the vec3
    const lowMask = g.step(0.04045, v); // 1 when v >= 0.04045
    return g.mix(low, high, lowMask);
  },
  /** `float hash21(vec2 p)` shared by both ports' GLSL: `p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y);` */
  hash21(fn: GraphBuilder, p0: Expr): Expr {
    const p1 = fn.fract(fn.mul(p0, fn.c(123.34, 456.21)));
    const p2 = fn.add(p1, fn.dot(p1, fn.add(p1, 45.32)));
    return fn.fract(fn.mul(fn.swz(p2, "x"), fn.swz(p2, "y")));
  },
  /**
   * Declares `hash21(vec2)` and `vnoise(vec2)` as graph functions (value noise with a smoothstep-curve bilinear blend) and returns a
   * `vnoise` caller. Functions, not inline nodes: eight inline vnoise calls blow the 512-node graph limit.
   */
  noise(g: GraphBuilder): (p: Expr) => Expr {
    g.defineFn("hash21", [{ name: "p", type: "vec2" }], "f32", (fn, [p]) => glslLike.hash21(fn, p!));
    g.defineFn("vnoise", [{ name: "p", type: "vec2" }], "f32", (fn, [p]) => {
      const i = fn.floor(p!), f = fn.fract(p!);
      const u = fn.mul(fn.mul(f, f), fn.sub(3, fn.mul(2, f)));
      const h = (ox: number, oy: number): Expr => fn.call("hash21", "f32", [ox === 0 && oy === 0 ? i : fn.add(i, fn.c(ox, oy))]);
      const ux = fn.swz(u, "x"), uy = fn.swz(u, "y");
      return fn.mix(fn.mix(h(0, 0), h(1, 0), ux), fn.mix(h(0, 1), h(1, 1), ux), uy);
    });
    return (p) => g.call("vnoise", "f32", [p]);
  }
};
