/**
 * r185-golden-glsl.ts — pure GLSL assembly for the PRD-04 P1-3 browser golden
 * generator (no DOM, no GL): extracts three's r185 functions from
 * `THREE.ShaderChunk` sources (port of glsl_eval.extract_glsl_function) and
 * builds each case's evaluation fragment (port of generate-r185-golden.py
 * `make_shader` + `src_parts`). Shared by `r185-golden.ts` (browser) and
 * `unit/r185-golden-glsl.test.ts` (extraction smoke test in the unit job).
 */
import type { R185GoldenCase } from "./r185-golden-cases";

// generate-r185-golden.py PREAMBLE + HELPERS_COMMON. `texture2D -> texture`
// is three's own WebGL2 prefix (WebGLProgram.js): the r185 chunks still say
// `texture2D( dfgLUT, … )` and GLSL ES 3.00 has no such builtin.
export const HEAD = `#version 300 es
precision highp float;
precision highp int;
#define texture2D texture

#define PI 3.141592653589793
#define RECIPROCAL_PI 0.3183098861837907
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
`;


/** Port of glsl_eval.extract_glsl_function (verbatim function text, brace-matched). */
export function extractFunction(src: string, name: string): string {
  const match = new RegExp(`^[\\t ]*(?:highp[\\t ]+)?[\\w\\d]+[\\t ]+${name}[\\t ]*\\(`, "m").exec(src);
  if (!match) throw new Error(`${name} not found in three ShaderChunk source`);
  const start = match.index;
  let i = src.indexOf("{", start + match[0].length);
  let depth = 0;
  for (;; i++) {
    const c = src[i];
    if (c === undefined) throw new Error(`${name}: unbalanced braces`);
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  const lines = src.slice(start, i + 1).trim().split("\n");
  // r185 two-signature `#ifdef … #else … #endif` pattern: drop the stray arm-closing #endif.
  if (lines.length > 1 && /^\s*#endif/.test(lines[1]!)) lines.splice(1, 1);
  return lines.join("\n");
}

function extractFrom(src: string, ret: string, name: string): string {
  const match = new RegExp(`^[\\t ]*${ret}[\\t ]+${name}[\\t ]*\\(`, "m").exec(src);
  if (!match) throw new Error(`${ret} ${name} not found in common.glsl`);
  return extractFunction(src.slice(match.index), name);
}

/** glsl float literal from a JS number (python `repr` equivalent for GLSL). */
export function f(v: number): string {
  if (Object.is(v, -0)) return "-0.0";
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

export const linspace = ([lo, hi, n]: readonly [number, number, number]): number[] =>
  n === 1 ? [lo] : Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

export function chunkSources(chunks: Readonly<Record<string, string>>) {
  const common = chunks.common!;
  const phys = chunks.lights_physical_pars_fragment!;
  const trans = chunks.transmission_pars_fragment!;
  const irid = chunks.iridescence_fragment!;
  const helpers = (
    [["float", "pow2"], ["vec3", "pow2"], ["float", "pow3"], ["float", "pow4"], ["float", "max3"],
      ["vec3", "F_Schlick"], ["float", "F_Schlick"], ["vec3", "BRDF_Lambert"]] as const
  ).map(([ret, name]) => extractFrom(common, ret, name)).join("\n\n");
  const struct = /struct PhysicalMaterial \{[\s\S]*?^\};/m.exec(phys)?.[0];
  if (!struct) throw new Error("struct PhysicalMaterial not found");
  const xyz = /const[\t ]+mat3[\t ]+XYZ_TO_REC709[\t ]*=[^;]*;/.exec(irid)?.[0];
  if (!xyz) throw new Error("mat3 XYZ_TO_REC709 not found");
  return {
    helpers,
    struct: struct.replace(/#ifn?def[^\n]*\n|#endif[^\n]*\n/g, ""),
    xyz: xyz.trim(),
    phys: (name: string) => extractFunction(phys, name),
    trans: (name: string) => extractFunction(trans, name),
    irid: (name: string) => extractFunction(irid, name)
  };
}

export type Sources = ReturnType<typeof chunkSources>;

/** Declarations a case needs, in generate-r185-golden.py `src_parts` order. */
export function caseDecls(c: R185GoldenCase, s: Sources): string[] {
  const parts: string[] = [s.helpers];
  if (c.struct === "PhysicalMaterial") parts.push(s.struct);
  if (c.textures?.includes("dfg")) parts.push("uniform sampler2D dfgLUT;\n");
  if (c.mat3) parts.push(s.xyz);
  parts.push(...(c.extraDecls ?? []));
  for (const n of c.needs.phys ?? []) parts.push(s.phys(n));
  for (const n of c.needs.transmission ?? []) parts.push(s.trans(n));
  for (const n of c.needs.irid ?? []) parts.push(s.irid(n));
  return parts;
}

/** Port of make_shader: per-pixel axis decode via mix(lo, hi, a / (n-1)). */
export function caseFragment(c: R185GoldenCase, s: Sources, width: number): string {
  const defines = (c.defines ?? []).map((d) => `#define ${d}\n`).join("");
  let stride = 1;
  const decoded = c.argorder.map((name, i) => {
    const [lo, hi, n] = c.axes[name]!;
    const vals = linspace([lo, hi, n]);
    const line =
      `int a${i} = (idx / ${stride}) % ${n};\n` +
      `float u_x${i} = mix( ${f(vals[0]!)}, ${f(vals[vals.length - 1]!)}, float(a${i}) / ${Math.max(n - 1, 1)}.0 );`;
    stride *= n;
    return line;
  });
  const fixed = Object.entries(c.fixed).map(([name, v]) =>
    Array.isArray(v)
      ? `vec${v.length} u_f_${name} = vec${v.length}( ${v.map(f).join(", ")} );`
      : `float u_f_${name} = ${f(v as number)};`
  );
  const body =
    "void main() {\n" +
    `int idx = int(gl_FragCoord.y) * ${width} + int(gl_FragCoord.x);\n` +
    `${decoded.join("\n")}\n${fixed.join("\n")}\n${c.call}\n}\n`;
  return [HEAD, defines, ...caseDecls(c, s)].join("\n") + "\nlayout(location=0) out vec4 o;\n" + body;
}

