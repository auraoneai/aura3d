// #880 / T0-05 — lane-07 features on the real C-02 generator (lane 01, #918).
// Structural text checks on generated forward programs: the pars chunks land
// at global scope, the call chunks inside main() after the default material
// / colour, and the fog uniform shared with fog_default is declared once.
// The WebGL2 compile + link proof is a macos-14 run (no GL in vitest).

import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd07";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";

const FLAGS = resolveQrFlags({ options: ["core", "vfx", "vfx.fog"] });
const LIGHT1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

function frag(partial: Partial<ProgramFeatures>): string {
  return generateProgramImpl(normalizeProgramFeatures(partial), { flags: FLAGS }).fragment;
}

function mainBody(src: string): string {
  const start = src.indexOf("void main() {");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(start + "void main() {".length, i);
  }
  throw new Error("unbalanced main()");
}

const globals = (src: string) => src.slice(0, src.indexOf("void main() {"));
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

/**
 * Minimal GLSL preprocessor: keeps the lines a real compiler would see
 * (#define / #if / #ifdef / #ifndef / #elif / #else / #endif with
 * `defined()`, `!`, `&&`, `||` and integer macros). Enough to count the
 * declarations that survive the guards.
 */
function preprocess(src: string): string {
  const defs = new Map<string, string>();
  const stack: { active: boolean; taken: boolean; parent: boolean }[] = [];
  const active = () => stack.every((s) => s.active);
  const evalExpr = (expr: string): boolean => {
    const js = expr
      .replace(/defined\s*\(\s*(\w+)\s*\)/g, (_m, n: string) => (defs.has(n) ? "1" : "0"))
      .replace(/\b[A-Za-z_]\w*\b/g, (n) => defs.get(n) ?? "0");
    if (!/^[\d\s!&|()<>=+-]*$/.test(js)) throw new Error(`unsupported #if: ${expr}`);
    return Boolean(new Function(`return (${js});`)());
  };
  const out: string[] = [];
  for (const line of src.split("\n")) {
    const m = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
    const parent = active();
    if (m && ["if", "ifdef", "ifndef"].includes(m[1]!)) {
      const cond = m[1] === "ifdef" ? defs.has(m[2]!.trim()) : m[1] === "ifndef" ? !defs.has(m[2]!.trim()) : evalExpr(m[2]!);
      stack.push({ active: cond, taken: cond, parent });
    } else if (m && m[1] === "elif") {
      const top = stack[stack.length - 1]!;
      top.active = !top.taken && evalExpr(m[2]!);
      top.taken ||= top.active;
    } else if (m && m[1] === "else") {
      const top = stack[stack.length - 1]!;
      top.active = !top.taken;
      top.taken = true;
    } else if (m && m[1] === "endif") {
      stack.pop();
    } else if (!parent) {
      continue;
    } else if (m && m[1] === "define") {
      const [name, ...value] = m[2]!.split(/\s+/);
      defs.set(name!, value.join(" ").replace(/\/\/.*$/, "").trim() || "1");
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

describe("prd07 fog + wetness on the generated forward program (#880)", () => {
  const lit = { lighting: "lit" as const, lights: LIGHT1, features: { "prd07.fog": "height", "prd07.wetness": true } };

  for (const fog of ["none", "exp2", "linear", "height"] as const) {
    it(`fog=${fog}: pars at global scope, calls in main, u_fogColor declared once`, () => {
      const src = frag({ ...lit, fog });
      const body = mainBody(src);
      expect(body).not.toMatch(/^\s*uniform\s/m);
      expect(body).not.toMatch(/^\s*(void|float|vec[234])\s+a3d\w+\s*\([^;{]*\)\s*\{/m);
      expect(globals(src)).toContain("float a3dWetnessRoughness(");
      expect(globals(src)).toContain("vec3 a3dApplyFog(vec3 color, vec3 worldPos)");
      expect(count(preprocess(src), /^\s*uniform vec3 u_fogColor;/gm)).toBe(1);
      // No uniform is declared twice once the guards are applied.
      const names = [...preprocess(src).matchAll(/\buniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
      expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
      expect(src).not.toMatch(/#define FOG_VOLUMETRIC/);
    });
  }

  it("wetness appends after the default PhysicalMaterial; fog replaces the default fog body", () => {
    const body = mainBody(frag({ ...lit, fog: "exp2" }));
    const made = body.indexOf("PhysicalMaterial material = a3dMakeMaterial(");
    const wet = body.indexOf("material.baseColor = a3dWetnessAlbedo(");
    expect(made).toBeGreaterThan(-1);
    expect(wet).toBeGreaterThan(made);
    expect(body).toContain("a3dColor = a3dApplyFog(a3dColor, v_worldPosition);");
    expect(body).not.toContain("a3dApplyFog(a3dColor, a3dDepth, v_worldPosition.y)");
  });

  it("each lane-07 chunk is emitted once", () => {
    const src = frag({ ...lit, fog: "height" });
    expect(count(src, /#define A3D_PRD07_FOG_CHUNK\b/g)).toBe(1);
    expect(count(src, /#define A3D_PRD07_WETNESS_CHUNK\b/g)).toBe(1);
    expect(count(src, /material\.baseColor = a3dWetnessAlbedo\(/g)).toBe(1);
  });
});
