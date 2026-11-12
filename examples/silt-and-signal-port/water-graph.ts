/**
 * 5.0.3 A4 pilot: the canal water as a portable shader graph (`shaderGraph.material`, one graph that compiles to
 * paired GLSL and WGSL) instead of the hand-written GLSL in `shaders.ts` (`WATER_FRAGMENT`, kept as the baseline and
 * the fallback). Same maths, node for node: hash21, value noise, four-octave fbm, ripple, fresnel, glint, foam, the
 * inked look's sky mirror, sun glitter and silt streaks, then the same fog mix and alpha. `?water=glsl` selects the
 * hand-written program for pixel comparison.
 *
 * The graph builder is a tiny typed DSL: the graph compiler wants equal operand types, so a scalar meeting a vector
 * is expanded with an explicit `construct`, which the helpers below do for you.
 */
import { shaderGraph, type ShaderGraphDocument, type ShaderGraphNode } from "@aura3d/engine/shader-graph-runtime";
import type { AuraMaterialSpec } from "@aura3d/engine";

type T = "f32" | "vec2" | "vec3" | "bool";
interface N { readonly id: string; readonly type: T }

export interface WaterGraphParams {
  readonly waterColor: readonly [number, number, number];
  readonly canalShift: number;
  readonly canalHalf: number;
  readonly fogColor: readonly [number, number, number];
  readonly fogFar: number;
  readonly inked: boolean;
  readonly sunDir: readonly [number, number, number];
  readonly sunColor: readonly [number, number, number];
  readonly inkSky: readonly [number, number, number];
  readonly inkSkyTop: readonly [number, number, number];
}

const WIDTH: Record<T, number> = { f32: 1, vec2: 2, vec3: 3, bool: 1 };

/** Builds the water graph. Every uniform the GLSL declared is a graph resource of the same name and type. */
export function buildWaterGraph(params: WaterGraphParams): ShaderGraphDocument {
  const mainNodes: ShaderGraphNode[] = [];
  let nodes = mainNodes;
  let counter = 0;
  const make = (op: string, type: T, inputs: readonly N[], extra: Record<string, unknown> = {}): N => {
    const id = `n${counter++}`;
    nodes.push({ id, op, type, ...(inputs.length ? { inputs: inputs.map((i) => i.id) } : {}), ...extra } as unknown as ShaderGraphNode);
    return { id, type };
  };
  const f = (v: number): N => make("constant", "f32", [], { value: v });
  const c2 = (x: number, y: number): N => make("constant", "vec2", [], { value: [x, y] });
  const c3 = (v: readonly [number, number, number]): N => make("constant", "vec3", [], { value: [...v] });
  const input = (name: string, type: T): N => make("input", type, [], { name });
  const uniform = (name: string, type: T): N => make("uniform", type, [], { resource: name });
  const vec = (type: T, ...parts: N[]): N => make("construct", type, parts);
  /** Expand a scalar to the width of `like` (a no-op when it already matches). */
  const lift = (n: N, like: T): N => (n.type === like || WIDTH[like] === 1 ? n : vec(like, ...Array.from({ length: WIDTH[like] }, () => n)));
  const bin = (op: string) => (a: N, b: N): N => {
    const type = WIDTH[a.type] >= WIDTH[b.type] ? a.type : b.type;
    return make(op, type, [lift(a, type), lift(b, type)]);
  };
  const add = bin("add"), sub = bin("sub"), mul = bin("mul");
  const max = bin("max");
  const un = (op: string) => (a: N): N => make(op, a.type, [a]);
  const fract = un("fract"), floor = un("floor"), sin = un("sin"), abs = un("abs"), normalize = un("normalize");
  const pow = (a: N, b: N): N => make("pow", a.type, [a, lift(b, a.type)]);
  const dot = (a: N, b: N): N => make("dot", "f32", [a, b]);
  const length = (a: N): N => make("length", "f32", [a]);
  const sw = (a: N, comps: string): N => make("swizzle", comps.length === 1 ? "f32" : (`vec${comps.length}` as T), [a], { components: comps });
  const mix = (a: N, b: N, t: N): N => make("mix", a.type, [a, b, lift(t, a.type)]);
  const smoothstep = (e0: N, e1: N, x: N): N => make("smoothstep", "f32", [e0, e1, x]);
  const clamp = (x: N, lo: number, hi: number): N => make("clamp", "f32", [x, f(lo), f(hi)]);
  const neg = (a: N): N => make("negate", a.type, [a]);

  // ── noise as graph functions (declared once, called many times: the graph node budget is 512) ──
  const functions: { name: string; parameters: { name: string; type: T }[]; returnType: T; nodes: ShaderGraphNode[]; output: string }[] = [];
  const param = (name: string, type: T): N => make("parameter", type, [], { name });
  const define = (name: string, parameters: { name: string; type: T }[], returnType: T, body: () => N): void => {
    const saved = nodes;
    nodes = [];
    const out = body();
    functions.push({ name, parameters, returnType, nodes, output: out.id });
    nodes = saved;
  };
  const call = (name: string, type: T, ...args: N[]): N => make("call", type, args, { name });
  define("hash21", [{ name: "p", type: "vec2" }], "f32", () => {
    const p1 = fract(mul(param("p", "vec2"), c2(123.34, 456.21)));
    const p2 = add(p1, dot(p1, add(p1, f(45.32))));
    return fract(mul(sw(p2, "x"), sw(p2, "y")));
  });
  define("vnoise", [{ name: "p", type: "vec2" }], "f32", () => {
    const p = param("p", "vec2");
    const i = floor(p), fr = fract(p);
    const u = mul(mul(fr, fr), sub(f(3), mul(f(2), fr)));
    const ux = sw(u, "x"), uy = sw(u, "y");
    const h = (o: N): N => call("hash21", "f32", add(i, o));
    const a = mix(h(c2(0, 0)), h(c2(1, 0)), ux);
    const b = mix(h(c2(0, 1)), h(c2(1, 1)), ux);
    return mix(a, b, uy);
  });
  define("fbm", [{ name: "p", type: "vec2" }], "f32", () => {
    let p = param("p", "vec2"), a = 0.5, s: N | undefined;
    for (let k = 0; k < 4; k++) {
      const term = mul(f(a), call("vnoise", "f32", p));
      s = s ? add(s, term) : term;
      p = add(mul(p, f(2.03)), f(17.1));
      a *= 0.5;
    }
    return s!;
  });
  const vnoise = (p: N): N => call("vnoise", "f32", p);
  const fbm = (p: N): N => call("fbm", "f32", p);

  // ── inputs ──
  const world = input("positionWorld", "vec3");
  const cam = input("cameraPosition", "vec3");
  const wx = sw(world, "x"), wz = sw(world, "z");
  const time = uniform("siltTime", "f32");
  const canalShift = uniform("canalShift", "f32"), canalHalf = uniform("canalHalf", "f32");
  const waterColor = uniform("waterColor", "vec3");

  // roadX(z) = 82 + sin(z * 0.006) * 8
  const roadX = add(f(82), mul(sin(mul(wz, f(0.006))), f(8)));
  const d = abs(sub(wx, sub(roadX, canalShift)));
  const flow = vec("vec2", mul(wx, f(0.12)), add(mul(wz, f(0.05)), mul(time, f(0.35))));
  const ripple = add(mul(fbm(mul(flow, f(3))), f(0.6)), mul(fbm(add(mul(flow, f(9)), f(3.7))), f(0.4)));
  const view = normalize(sub(cam, world));
  const fres = pow(sub(f(1), clamp(sw(view, "y"), 0, 1)), f(3));
  const body = mix(mul(waterColor, f(0.55)), mul(waterColor, f(1.3)), ripple);
  const skyTint = mix(mul(waterColor, f(1.7)), c3([0.78, 0.86, 0.9]), f(0.55));
  let col = mix(body, skyTint, mul(fres, f(0.6)));
  const glint = pow(mul(max(f(0), sub(vnoise(add(mul(flow, f(24)), mul(time, f(0.4)))), f(0.8))), f(5)), f(2));
  col = add(col, mul(mul(c3([1, 0.92, 0.78]), glint), f(0.5)));
  const foam = mul(smoothstep(sub(canalHalf, f(4.5)), sub(canalHalf, f(1.2)), d), add(f(0.45), mul(f(0.55), vnoise(mul(flow, f(15))))));
  col = mix(col, c3([0.93, 0.95, 0.9]), mul(foam, f(0.7)));

  if (params.inked) {
    // GU47 DG-M3: fresnel toward the chapter sky, a sun glint on the key vector, silt foam and flow streaks
    const sunDir = uniform("sunDir", "vec3"), sunColor = uniform("sunColor", "vec3");
    const inkSky = uniform("inkSky", "vec3"), inkSkyTop = uniform("inkSkyTop", "vec3");
    const n = normalize(vec("vec3", mul(sub(ripple, f(0.5)), f(0.35)), f(1), mul(sub(fbm(add(mul(flow, f(5)), f(1.3))), f(0.5)), f(0.35))));
    const incident = neg(view);
    const r = sub(incident, mul(n, mul(f(2), dot(n, incident)))); // reflect(-view, n)
    const sd = max(f(0), dot(r, normalize(sunDir)));
    const spec = pow(sd, f(420));
    const skyRef = mix(inkSky, inkSkyTop, smoothstep(f(0.02), f(0.55), sw(r, "y")));
    col = mix(col, skyRef, add(f(0.28), mul(fres, f(0.5))));
    const glitter = add(mul(spec, f(1.4)), mul(mul(pow(sd, f(36)), f(0.32)), add(f(0.6), mul(f(0.8), ripple))));
    col = add(col, mul(sunColor, glitter));
    const streak = smoothstep(f(0.62), f(0.9), vnoise(vec("vec2", mul(wx, f(0.6)), add(mul(wz, f(0.02)), mul(time, f(0.9))))));
    col = mix(col, c3([0.86, 0.78, 0.62]), add(mul(streak, f(0.18)), mul(foam, f(0.12))));
  }

  const fogColor = uniform("fogColor", "vec3"), fogFar = uniform("fogFar", "f32");
  const fogT = smoothstep(f(280), max(f(1450), fogFar), length(sub(world, cam)));
  const alpha = mul(f(0.92), sub(f(1), smoothstep(sub(canalHalf, f(1.2)), canalHalf, d)));
  const color = mix(col, fogColor, mul(mul(fogT, fogT), f(0.32)));

  return {
    version: 1,
    stage: "material",
    resources: [
      { name: "siltTime", kind: "uniform", type: "f32" },
      { name: "canalShift", kind: "uniform", type: "f32" },
      { name: "canalHalf", kind: "uniform", type: "f32" },
      { name: "waterColor", kind: "uniform", type: "vec3" },
      { name: "fogColor", kind: "uniform", type: "vec3" },
      { name: "fogFar", kind: "uniform", type: "f32" },
      ...(params.inked ? [
        { name: "sunDir", kind: "uniform", type: "vec3" },
        { name: "sunColor", kind: "uniform", type: "vec3" },
        { name: "inkSky", kind: "uniform", type: "vec3" },
        { name: "inkSkyTop", kind: "uniform", type: "vec3" }
      ] : [])
    ],
    functions,
    nodes: mainNodes,
    outputs: { color: color.id, opacity: alpha.id }
  } as unknown as ShaderGraphDocument;
}

/** The graph as a material spec: transparent, depth-write off, double sided, exactly the GLSL spec's render state. */
export function waterGraphMaterial(params: WaterGraphParams): AuraMaterialSpec {
  const uniforms: Record<string, unknown> = {
    siltTime: 0,
    canalShift: params.canalShift,
    canalHalf: params.canalHalf,
    waterColor: [...params.waterColor],
    fogColor: [...params.fogColor],
    fogFar: params.fogFar
  };
  if (params.inked) {
    uniforms.sunDir = [...params.sunDir];
    uniforms.sunColor = [...params.sunColor];
    uniforms.inkSky = [...params.inkSky];
    uniforms.inkSkyTop = [...params.inkSkyTop];
  }
  return shaderGraph.material({ graph: buildWaterGraph(params), uniforms, transparent: true, depthWrite: false, side: "double" });
}
