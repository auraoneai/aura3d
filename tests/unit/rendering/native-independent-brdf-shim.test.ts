import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NATIVE_BRDF_SHIM_CHUNK } from "../../qr/prd04/shims/native-brdf.glsl";
import { NATIVE_BRDF_WGSL } from "../../qr/prd04/shims/native-brdf.wgsl";

type Value = number | number[] | string;
type Numeric = number | number[];
type Definition = { name: string; returnType: string; parameters: { name: string; type: string }[]; body: string };

/**
 * Tiny CPU interpreter for the straight-line arithmetic in these candidates.
 * It runs the expressions actually present in each shader; the mathematical
 * assertions below supply independent analytical expectations. This is not a
 * GLSL/WGSL compiler and does not model f32 rounding or GPU texture filtering.
 */
function makeInterpreter(
  source: string,
  sampleDfg = (u: number, v: number) => [0.25 + 0.25 * u, 0.125 + 0.125 * v, 0, 1],
) {
  const definitions: Definition[] = [];
  const constants: Record<string, number> = {};
  const constantDeclaration = /(?:^|\n)\s*const\s+(?:float\s+(\w+)|(\w+)\s*:\s*f32)\s*=\s*([^;]+);/g;
  for (const match of source.matchAll(constantDeclaration)) {
    const name = match[1] ?? match[2];
    if (Object.hasOwn(constants, name)) throw new Error(`duplicate constant ${name}`);
    const operands = match[3].split(/\s*\/\s*/);
    if (operands.length > 2) throw new Error(`unsupported constant expression for ${name}`);
    const readOperand = (operand: string) => {
      const value = Object.hasOwn(constants, operand) ? constants[operand] : Number(operand);
      if (!Number.isFinite(value)) throw new Error(`invalid constant expression for ${name}`);
      return value;
    };
    const value = operands.length === 1 ? readOperand(operands[0].trim()) :
      readOperand(operands[0].trim()) / readOperand(operands[1].trim());
    if (!Number.isFinite(value)) throw new Error(`non-finite constant ${name}`);
    constants[name] = value;
  }
  const declaration = /(?:^|\n)\s*(?:(float|vec[234])\s+(\w+)\s*\(([^)]*)\)|fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*(\w+))\s*\{([^{}]*)\}/g;
  for (const match of source.matchAll(declaration)) {
    const wgsl = Boolean(match[4]);
    const parameters = (wgsl ? match[5] : match[3]).trim().split(/\s*,\s*/).filter(Boolean).map((parameter) => {
      if (wgsl) {
        const [name, type] = parameter.split(/\s*:\s*/);
        return { name, type };
      }
      const parts = parameter.trim().split(/\s+/);
      return { name: parts[parts.length - 1], type: parts[parts.length - 2] };
    });
    definitions.push({ name: match[2] ?? match[4], returnType: match[1] ?? match[6], parameters, body: match[7] });
  }

  function numeric(value: Value): Numeric {
    if (typeof value === "string") throw new Error(`expected number, got resource ${value}`);
    return value;
  }
  function scalar(value: Value): number {
    if (typeof value !== "number") throw new Error("expected scalar");
    return value;
  }
  function vector(value: Value): number[] {
    if (!Array.isArray(value)) throw new Error("expected vector");
    return value;
  }
  function map2(a: Numeric, b: Numeric, operation: (x: number, y: number) => number): Numeric {
    if (!Array.isArray(a) && !Array.isArray(b)) return operation(a, b);
    const length = Array.isArray(a) ? a.length : (b as number[]).length;
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) throw new Error("vector size mismatch");
    return Array.from({ length }, (_, index) => operation(Array.isArray(a) ? a[index] : a, Array.isArray(b) ? b[index] : b));
  }
  function componentwise(value: Numeric, operation: (x: number) => number): Numeric {
    return Array.isArray(value) ? value.map(operation) : operation(value);
  }
  function call(name: string, args: Value[]): Value {
    const constructor = /^vec([234])f?$/.exec(name);
    if (constructor) {
      const length = Number(constructor[1]);
      const flattened = args.flatMap((arg) => Array.isArray(arg) ? arg : [scalar(arg)]);
      const result = flattened.length === 1 ? Array.from({ length }, () => flattened[0]) : flattened;
      if (result.length !== length) throw new Error(`wrong size for ${name}`);
      return result;
    }
    if (name === "max") return map2(numeric(args[0]), numeric(args[1]), Math.max);
    if (name === "min") return map2(numeric(args[0]), numeric(args[1]), Math.min);
    if (name === "clamp") {
      const low = map2(numeric(args[0]), numeric(args[1]), Math.max);
      return map2(low, numeric(args[2]), Math.min);
    }
    if (name === "sqrt") return componentwise(numeric(args[0]), Math.sqrt);
    if (name === "inversesqrt") return componentwise(numeric(args[0]), (x) => 1 / Math.sqrt(x));
    if (name === "step") return map2(numeric(args[0]), numeric(args[1]), (edge, x) => x < edge ? 0 : 1);
    if (name === "dot") {
      const left = vector(args[0]);
      const right = vector(args[1]);
      if (left.length !== right.length) throw new Error("dot size mismatch");
      return left.reduce((sum, x, index) => sum + x * right[index], 0);
    }
    if (name === "textureLod" || name === "textureSampleLevel") {
      // An explicitly synthetic texture, encoding the tested coordinates in
      // distinct channels. It is not a claimed physical DFG lookup table.
      const uv = vector(args[name === "textureLod" ? 1 : 2]);
      expect(scalar(args[name === "textureLod" ? 2 : 3])).toBe(0);
      return sampleDfg(uv[0], uv[1]);
    }
    const selected = definitions.find((definition) => definition.name === name &&
      definition.parameters.length === args.length && definition.parameters.every((parameter, index) =>
        parameter.type.startsWith("vec") === Array.isArray(args[index])));
    if (!selected) throw new Error(`no overload for ${name}`);
    const variables: Record<string, Value> = {
      ...constants,
      u_dfgLut: "texture",
      a3d_prd04_dfgLut: "texture",
      a3d_prd04_dfgSmp: "sampler",
    };
    selected.parameters.forEach((parameter, index) => { variables[parameter.name] = args[index]; });
    const tokens: string[] = [];
    const pattern = /\s*((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?|[A-Za-z_]\w*|[+\-*/(),.;=])/y;
    let offset = 0;
    while (offset < selected.body.length) {
      pattern.lastIndex = offset;
      const token = pattern.exec(selected.body);
      if (!token) {
        if (selected.body.slice(offset).trim() === "") break;
        throw new Error(`unrecognized source in ${name}: ${selected.body.slice(offset)}`);
      }
      tokens.push(token[1]);
      offset = pattern.lastIndex;
    }
    let index = 0;
    function take(expected?: string): string {
      const token = tokens[index++];
      if (token === undefined || (expected && token !== expected)) throw new Error(`expected ${expected}, got ${token}`);
      return token;
    }
    function expression(minimumPrecedence = 0): Value {
      const first = take();
      let result: Value;
      if (first === "(") {
        result = expression();
        take(")");
      } else if (first === "-") {
        result = componentwise(numeric(expression(3)), (x) => -x);
      } else if (/^(?:\d|\.)/.test(first)) {
        result = Number(first);
      } else if (tokens[index] === "(") {
        take("(");
        const callArgs: Value[] = [];
        while (tokens[index] !== ")") {
          callArgs.push(expression());
          if (tokens[index] !== ",") break;
          take(",");
        }
        take(")");
        result = call(first, callArgs);
      } else {
        if (!(first in variables)) throw new Error(`unknown identifier ${first}`);
        result = variables[first];
      }
      while (tokens[index] === ".") {
        take(".");
        const swizzle = take();
        const values = vector(result);
        const components = Array.from(swizzle, (component) => {
          const position = "xyzw".indexOf(component) >= 0 ? "xyzw".indexOf(component) : "rgba".indexOf(component);
          if (position < 0 || position >= values.length) throw new Error(`invalid swizzle ${swizzle}`);
          return values[position];
        });
        result = components.length === 1 ? components[0] : components;
      }
      for (;;) {
        const operator = tokens[index];
        const precedence = operator === "+" || operator === "-" ? 1 : operator === "*" || operator === "/" ? 2 : -1;
        if (precedence < minimumPrecedence) break;
        take();
        const right = expression(precedence + 1);
        const operation = operator === "+" ? (x: number, y: number) => x + y :
          operator === "-" ? (x: number, y: number) => x - y :
          operator === "*" ? (x: number, y: number) => x * y : (x: number, y: number) => x / y;
        result = map2(numeric(result), numeric(right), operation);
      }
      return result;
    }
    while (index < tokens.length) {
      const statement = take();
      if (statement === "return") {
        const result = expression();
        take(";");
        if (index !== tokens.length) throw new Error(`extra tokens after ${name} return`);
        return result;
      }
      if (!["let", "float", "vec2", "vec3", "vec4"].includes(statement)) throw new Error(`unknown statement ${statement}`);
      const variable = take();
      take("=");
      variables[variable] = expression();
      take(";");
    }
    throw new Error(`missing return in ${name}`);
  }
  return { constants, definitions, call };
}

const glsl = makeInterpreter(NATIVE_BRDF_SHIM_CHUNK.glsl);
const wgsl = makeInterpreter(NATIVE_BRDF_WGSL);
const languages = [["GLSL", glsl], ["WGSL", wgsl]] as const;
const brdfModule = JSON.parse(readFileSync(new URL("../../../docs/prds/aura3d-independent-shader-api.json", import.meta.url), "utf8"))
  .modules.find((module: { name: string }) => module.name === "brdf-shim");

function expectVector(actual: Value, expected: number[], precision = 10) {
  expect(Array.isArray(actual)).toBe(true);
  const values = actual as number[];
  expect(values).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(values[index]).toBeCloseTo(value, precision));
}
function normalized(v: number[]): number[] {
  const length = Math.hypot(...v);
  return v.map((component) => component / length);
}

describe("independent BRDF candidates", () => {
  it("exposes every declared function, material field and DFG resource", () => {
    expect(NATIVE_BRDF_SHIM_CHUNK.name).toBe("brdf");
    expect(NATIVE_BRDF_SHIM_CHUNK.owner).toBe("prd04");
    expect(NATIVE_BRDF_SHIM_CHUNK.stage).toBe("fragment");
    for (const [language, interpreter] of languages) {
      const api = brdfModule[language.toLowerCase()];
      const expectedNames = api.functions.map((item: { name: string }) => item.name).sort();
      expect(interpreter.definitions.map((item) => item.name).sort()).toEqual(expectedNames);
      for (const item of api.functions as { name: string; signature: string }[]) {
        const parameterText = item.signature.slice(item.signature.indexOf("(") + 1, item.signature.indexOf(")"));
        const expectedTypes = parameterText.split(/\s*,\s*/).filter(Boolean).map((param) => language === "WGSL"
          ? param.split(/\s*:\s*/)[1]
          : param.trim().split(/\s+/).at(-2));
        const expectedReturnType = language === "WGSL" ? item.signature.split("->")[1].trim() : item.signature.split(/\s+/)[0];
        expect(interpreter.definitions.some((definition) => definition.name === item.name &&
          definition.returnType === expectedReturnType &&
          JSON.stringify(definition.parameters.map((param) => param.type)) === JSON.stringify(expectedTypes))).toBe(true);
      }
      const source = language === "GLSL" ? NATIVE_BRDF_SHIM_CHUNK.glsl : NATIVE_BRDF_WGSL;
      for (const resource of api.resources) expect(source).toContain(resource);
    }
    const body = /struct PhysicalMaterial\s*\{([^}]*)\}/.exec(NATIVE_BRDF_SHIM_CHUNK.glsl)?.[1];
    const actualFields = body?.split(";").map((field) => field.trim()).filter(Boolean);
    expect(actualFields).toEqual(brdfModule.glsl.structs[0].fields);
  });

  it.each(languages)("%s exposes mathematical pi constants and its provisional visibility floor", (_language, shader) => {
    expect(Object.keys(shader.constants).sort()).toEqual(["EPSILON", "PI", "RECIPROCAL_PI"]);
    expect(shader.constants.PI).toBeCloseTo(Math.PI, 14);
    expect(shader.constants.RECIPROCAL_PI).toBeCloseTo(1 / Math.PI, 15);
    expect(shader.constants.PI * shader.constants.RECIPROCAL_PI).toBeCloseTo(1, 15);
    expect(shader.constants.EPSILON).toBe(0.000001);
    expect(shader.call("V_GGX_SmithCorrelated", [0.5, 0, 0])).toBeCloseTo(0.5 / shader.constants.EPSILON, 8);
  });

  it.each(languages)("%s evaluates powers, maxima and the fifth-power Fresnel endpoints", (_language, shader) => {
    expect(shader.call("pow2", [-3])).toBe(9);
    expect(shader.call("pow4", [-2])).toBe(16);
    expect(shader.call("max3", [[-3, -1, -2]])).toBe(-1);
    const f0 = [0.04, 0.3, 0.8];
    const f90 = 0.95;
    for (const cosine of [0, 0.2, 0.5, 1]) {
      const weight = (1 - cosine) ** 5;
      const expected = f0.map((value) => value * (1 - weight) + f90 * weight);
      const fresnel = shader.call("F_Schlick", [f0, f90, cosine]);
      expectVector(fresnel, expected);
      if (cosine > 0) expectVector(shader.call("Schlick_to_F0", [fresnel, f90, cosine]), f0, 8);
    }
    expectVector(shader.call("F_Schlick", [f0, f90, -1]), [f90, f90, f90]);
    expectVector(shader.call("F_Schlick", [f0, f90, 2]), f0);
    const grazingInverse = shader.call("Schlick_to_F0", [[f90, f90, f90], f90, 0]) as number[];
    expect(grazingInverse.every(Number.isFinite)).toBe(true);
  });

  it("also evaluates GLSL overloads and Lambert's analytic normalization", () => {
    expect(glsl.call("pow3", [-2])).toBe(-8);
    expectVector(glsl.call("pow2", [[-2, 3, -4]]), [4, 9, 16]);
    expectVector(wgsl.call("pow2v", [[-2, 3, -4]]), [4, 9, 16]);
    expect(glsl.call("max4", [[-4, -2, -7, -1]])).toBe(-1);
    expectVector(glsl.call("saturate", [[-1, 0.4, 2]]), [0, 0.4, 1]);
    expect(glsl.call("F_Schlick", [0.2, 1, 0.5])).toBeCloseTo(0.225, 12);
    expectVector(glsl.call("BRDF_Lambert", [[1, 0.5, 0]]), [1 / Math.PI, 0.5 / Math.PI, 0]);
  });

  it.each(languages)("%s obeys GGX endpoint and hemisphere-normalization identities", (_language, shader) => {
    for (const cosine of [0, 0.25, 0.75, 1]) {
      expect(shader.call("D_GGX", [1, cosine])).toBeCloseTo(1 / Math.PI, 12);
    }
    expect(shader.call("D_GGX", [0.5, 0])).toBeCloseTo(0.25 / Math.PI, 12);
    expect(shader.call("D_GGX", [0.5, 1])).toBeCloseTo(4 / Math.PI, 12);
    for (const alpha of [0.3, 0.5, 1]) {
      const steps = 2000;
      let area = 0;
      for (let i = 0; i < steps; i++) {
        const cosine = (i + 0.5) / steps;
        area += (shader.call("D_GGX", [alpha, cosine]) as number) * cosine;
      }
      expect((2 * Math.PI * area) / steps).toBeCloseTo(1, 4);
    }
    expect(Number.isFinite(shader.call("D_GGX", [0, 1]) as number)).toBe(true);
    expect(shader.call("D_GGX", [0, 1]) as number).toBeGreaterThan(1000);
  });

  it.each(languages)("%s matches correlated Smith visibility and handles grazing inputs", (_language, shader) => {
    for (const alpha of [0.2, 0.7, 1]) {
      expect(shader.call("V_GGX_SmithCorrelated", [alpha, 1, 1])).toBeCloseTo(0.25, 12);
      for (const [nl, nv] of [[0.1, 0.4], [0.2, 0.8], [0.8, 0.95]]) {
        const lambda = (mu: number) => (Math.sqrt(1 + alpha ** 2 * (1 - mu ** 2) / mu ** 2) - 1) / 2;
        const expected = 1 / (1 + lambda(nl) + lambda(nv)) / (4 * nl * nv);
        expect(shader.call("V_GGX_SmithCorrelated", [alpha, nl, nv])).toBeCloseTo(expected, 10);
        expect(shader.call("V_GGX_SmithCorrelated", [alpha, nv, nl])).toBeCloseTo(expected, 10);
      }
    }
    for (const alpha of [0, 0.001, 1]) {
      for (const nl of [0, 0.00000001, 1]) {
        for (const nv of [0, 0.00000001, 1]) {
          const value = shader.call("V_GGX_SmithCorrelated", [alpha, nl, nv]) as number;
          expect(Number.isFinite(value) && value >= 0).toBe(true);
        }
      }
    }
  });

  it.each(languages)("%s samples and clamps DFG coordinates and channels", (_language, shader) => {
    expectVector(shader.call("a3dDFG", [0.4, 0.8]), [0.35, 0.225]);
    expectVector(shader.call("a3dDFG", [-1, 2]), [0.25, 0.25]);
  });

  it.each(languages)("%s keeps the roughness and N dot V axes distinct", (language) => {
    const coordinates: number[][] = [];
    const source = language === "GLSL" ? NATIVE_BRDF_SHIM_CHUNK.glsl : NATIVE_BRDF_WGSL;
    // This is an independently defined synthetic texture, not LUT data.
    const shader = makeInterpreter(source, (u, v) => {
      coordinates.push([u, v]);
      return [0.1 + 0.6 * u + 0.2 * v, 0.05 + 0.15 * u + 0.45 * v, 0, 1];
    });
    expectVector(shader.call("a3dDFG", [0.2, 0.8]), [0.38, 0.44]);
    expectVector(shader.call("a3dDFG", [0.8, 0.2]), [0.62, 0.26]);
    expect(coordinates).toEqual([[0.2, 0.8], [0.8, 0.2]]);
  });

  it("GLSL direct reflection is reciprocal and finite at invalid or degenerate angles", () => {
    const n = [0, 0, 1];
    const l = normalized([0.6, 0.1, 0.8]);
    const v = normalized([-0.3, 0.2, 0.9]);
    const f0 = [0.04, 0.2, 0.7];
    const forward = glsl.call("BRDF_GGX", [l, v, n, f0, 1, 0.5]);
    const swapped = glsl.call("BRDF_GGX", [v, l, n, f0, 1, 0.5]) as number[];
    expectVector(forward, swapped);
    expectVector(glsl.call("BRDF_GGX", [n, n, n, f0, 1, 1]), f0.map((f) => f / (4 * Math.PI)));
    expectVector(glsl.call("BRDF_GGX", [n, n, n, f0, 1, 0.5]), f0.map((f) => 4 * f / Math.PI));
    for (const [light, view, normal, roughness] of [
      [[0, 0, -1], [0, 0, 1], n, 0],
      [[1, 0, 0], [-1, 0, 0], n, 0],
      [[0, 0, 0], [0, 0, 0], [0, 0, 0], 0],
      [[0, 0, 1], [0, 0, 1], n, 0],
      [[0, 0, 1], [0, 0, 1], n, 1],
    ] as [number[], number[], number[], number][]) {
      const result = glsl.call("BRDF_GGX", [light, view, normal, f0, 1, roughness]) as number[];
      expect(result.every((x) => Number.isFinite(x) && x >= 0)).toBe(true);
      if (normal[2] === 0 || light[2] <= 0) expectVector(result, [0, 0, 0]);
    }
  });

  it("GLSL composes the independent Lambert, environment and approximate multiscatter terms", () => {
    const n = [0, 0, 1];
    const f0 = [0.04, 0.3, 0.8];
    const diffuse = [0.8, 0.5, 0.1];
    const irradiance = [2, 1, 0.5];
    const roughness = 0.4;
    const coefficients = [0.35, 0.25]; // synthetic texture at (0.4, 1)
    expectVector(glsl.call("EnvironmentBRDF", [n, n, f0, 1, roughness]),
      f0.map((f) => f * coefficients[0] + coefficients[1]));
    const single = glsl.call("BRDF_GGX", [n, n, n, f0, 1, roughness]) as number[];
    const energy = coefficients[0] + coefficients[1];
    const expectedMulti = single.map((value, index) =>
      value * (1 + (f0[index] + (1 - f0[index]) / 21) * (1 - energy) / energy));
    expectVector(glsl.call("BRDF_GGX_Multiscatter", [n, n, n, f0, 1, roughness]), expectedMulti);
    expectVector(glsl.call("a3dDirectSpecular", [n, n, n, irradiance, f0, 1, roughness]),
      single.map((value, index) => value * irradiance[index]));
    expectVector(glsl.call("a3dDirectLight", [n, n, n, irradiance, diffuse, f0, 1, roughness]),
      single.map((value, index) => (value + diffuse[index] / Math.PI) * irradiance[index]));
    expectVector(glsl.call("a3dDirectLight", [[0, 0, -1], n, n, irradiance, diffuse, f0, 1, roughness]), [0, 0, 0]);
    const zeroEnergyShader = makeInterpreter(NATIVE_BRDF_SHIM_CHUNK.glsl, () => [0, 0, 0, 1]);
    const darkDfg = zeroEnergyShader.call("BRDF_GGX_Multiscatter", [n, n, n, f0, 1, roughness]) as number[];
    expect(darkDfg.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });
});
