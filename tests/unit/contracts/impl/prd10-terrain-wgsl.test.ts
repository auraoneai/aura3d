/**
 * PRD-10 T2.4 — static checks on the terrain WGSL twin. The naga parse +
 * validation runs in `qr-prd10-wgsl.yml`; this unit pins the structural
 * properties naga cannot see from one file (CPU/GLSL parity of the layout)
 * and the classes of error the first placeholder had: colliding bindings,
 * duplicate module-scope names, uniform arrays without a 16-byte stride,
 * and implicit-derivative sampling outside uniform control flow.
 */
import { describe, expect, it } from "vitest";
import {
  TERRAIN_FRAG_GLSL,
  TERRAIN_VERT_GLSL,
  TERRAIN_WGSL
} from "../../../../packages/rendering/src/world/terrain/shaders/terrain.vert.glsl.js";
import { a3d_prd10_terrain_cdlod } from "../../../../packages/rendering/src/world/terrain/shaders/terrainCdlod.js";
import { a3d_prd10_terrain_splat } from "../../../../packages/rendering/src/world/terrain/shaders/terrainSplat.js";

/** Strip `//` comments so prose never satisfies or trips a pattern. */
function code(src: string): string {
  return src.replace(/\/\/[^\n]*/g, "");
}

function bindings(src: string): { group: number; binding: number; name: string }[] {
  const out: { group: number; binding: number; name: string }[] = [];
  const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]+>)?\s+(\w+)/g;
  for (const m of code(src).matchAll(re)) out.push({ group: Number(m[1]), binding: Number(m[2]), name: m[3]! });
  return out;
}

/** Module-scope declarations: `struct X`, `fn x`, and `var x` at line start / after attributes. */
function topLevelNames(src: string): string[] {
  const names: string[] = [];
  for (const m of code(src).matchAll(/^(?:struct|fn)\s+(\w+)/gm)) names.push(m[1]!);
  for (const b of bindings(src)) names.push(b.name);
  return names;
}

function uniformStructBodies(src: string): string[] {
  const c = code(src);
  const uniformTypes = [...c.matchAll(/var<uniform>\s+\w+\s*:\s*(\w+)/g)].map((m) => m[1]!);
  const bodies: string[] = [];
  for (const t of uniformTypes) {
    const m = new RegExp(`struct\\s+${t}\\s*\\{([^}]*)\\}`).exec(c);
    if (m) bodies.push(m[1]!);
  }
  return bodies;
}

const MODULES: Record<string, string> = {
  "terrain-program": TERRAIN_WGSL,
  [a3d_prd10_terrain_cdlod.name]: a3d_prd10_terrain_cdlod.wgsl ?? "",
  [a3d_prd10_terrain_splat.name]: a3d_prd10_terrain_splat.wgsl ?? ""
};

describe("PRD-10 T2.4 — terrain WGSL twin (static)", () => {
  it("the program declares one vertex and one fragment entry point that do real work", () => {
    const c = code(TERRAIN_WGSL);
    expect(c).toMatch(/@vertex\s+fn terrainVs\(/);
    expect(c).toMatch(/@fragment\s+fn terrainFs\(/);
    // The placeholder wrote clip = world and uv = 0; the twin projects and passes the CDLOD uv.
    expect(c).toMatch(/u_view\.viewProjection \* vec4f\(v\.world, 1\.0\)/);
    expect(c).toMatch(/o\.terrainUv = v\.uv;/);
    expect(c).not.toMatch(/placeholder/i);
    // Fragment stage mirrors the GLSL program: holes, macro normal, splat, height blend, layers, key light.
    for (const fn of ["a3dTerrainDiscardHole", "a3dTerrainMacroNormal", "a3dTerrainSplatWeights", "a3dTerrainHeightBlend"]) {
      expect(c, fn).toContain(`${fn}(`);
      expect(code(TERRAIN_FRAG_GLSL), fn).toContain(`${fn}(`);
    }
    expect(code(TERRAIN_VERT_GLSL)).toContain("a3dTerrainCdlod(");
  });

  for (const [name, src] of Object.entries(MODULES)) {
    it(`${name}: no (group, binding) pair or module-scope name is declared twice`, () => {
      const seen = new Set<string>();
      for (const b of bindings(src)) {
        const key = `${b.group}:${b.binding}`;
        expect(seen.has(key), `${name} binds ${key} twice (${b.name})`).toBe(false);
        seen.add(key);
      }
      const names = topLevelNames(src);
      expect(new Set(names).size, `${name} duplicate names: ${names.join(",")}`).toBe(names.length);
    });

    it(`${name}: uniform-space arrays have a 16-byte element stride`, () => {
      for (const body of uniformStructBodies(src)) {
        for (const m of body.matchAll(/array<\s*(\w+)\s*,/g)) {
          expect(["vec4f", "vec4<f32>", "mat4x4f"], `${name}: uniform array<${m[1]}>`).toContain(m[1]);
        }
      }
    });

    it(`${name}: no implicit-derivative textureSample (all fetches are Grad/Level/Load)`, () => {
      expect(code(src)).not.toMatch(/textureSample\s*\(/);
      expect(code(src)).not.toMatch(/\bmacro\b/); // WGSL reserved word
    });
  }

  it("every derivative in the fragment entry is taken before the first branch, loop or discard", () => {
    const fs = code(TERRAIN_WGSL).split(/fn terrainFs\(/)[1]!;
    const firstFlow = Math.min(...["if (", "for (", "discard"].map((t) => fs.indexOf(t)).filter((i) => i >= 0));
    const lastDeriv = Math.max(...[...fs.matchAll(/dpd[xy]\(/g)].map((m) => m.index!));
    expect(lastDeriv).toBeGreaterThan(0);
    expect(lastDeriv).toBeLessThan(firstFlow);
    // discard is the last control-flow statement before shading.
    expect(fs.indexOf("discard")).toBeGreaterThan(fs.lastIndexOf("for ("));
  });

  it("the CDLOD uniform layout keeps the GLSL std140 shape (morph is 8 x 16-byte slots)", () => {
    const c = code(a3d_prd10_terrain_cdlod.wgsl ?? "");
    expect(c).toMatch(/morph\s*:\s*array<vec4f,\s*8>/);
    expect(code(a3d_prd10_terrain_cdlod.glsl)).toMatch(/uniform vec4 u_morph\[8\]/);
  });
});
