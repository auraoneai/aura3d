import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { allProgramSpecs } from "../../../examples/saiyan-snake-way-port/materials";

/**
 * Bakes every `material.custom` program the port draws with through the engine's own prelude generator
 * and, when `glslangValidator` is installed, compiles vertex + fragment with the reference GLSL compiler,
 * so a shader error shows up here instead of as a failed remote GPU run.
 */
const available = spawnSync("glslangValidator", ["--version"]).status === 0;

describe("saiyan-snake-way-port programs bake under #version 300 es", () => {
  for (const { name, spec } of allProgramSpecs()) {
    it(`${name} bakes with the version header first and no duplicate uniforms`, () => {
      const material = createCustomShaderMaterial(spec, `ssw-port-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        expect(vertex.startsWith("#version 300 es")).toBe(true);
        expect(fragment.startsWith("#version 300 es")).toBe(true);
        for (const [stage, source] of [["vertex", vertex], ["fragment", fragment]] as const) {
          const declared = [...source.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(?:\[\d+\])?\s*;/gm)].map((m) => m[1]!);
          expect(new Set(declared).size, `${name} ${stage} declares a uniform twice: ${declared.join(", ")}`).toBe(declared.length);
        }
      } finally {
        material.dispose();
      }
    });
    it.skipIf(!available)(`${name} links under glslangValidator`, () => {
      const material = createCustomShaderMaterial(spec, `ssw-port-glslang-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        const dir = mkdtempSync(join(tmpdir(), "ssw-glsl-"));
        try {
          writeFileSync(join(dir, "p.vert"), vertex);
          writeFileSync(join(dir, "p.frag"), fragment);
          const result = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
          expect(`${result.stdout}${result.stderr}`.trim()).not.toMatch(/ERROR/);
          expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      } finally {
        material.dispose();
      }
    });
  }

  it("the aura shell keeps the original's blade-tier maths under renamed uniforms", () => {
    const aura = allProgramSpecs().find((p) => p.name === "aura");
    expect(aura).toBeDefined();
    const material = createCustomShaderMaterial(aura!.spec, "ssw-port-aura-text");
    try {
      const fragment = material.sources.glsl.fragment;
      for (const needle of ["bladeTier(up, 0.00, 0.40, 0.0", "bladeTier(up, 0.32, 0.70, 1.0", "bladeTier(up, 0.56, 1.00, 2.0", "a *= smoothstep(0.985, 0.86, up)"]) expect(fragment).toContain(needle);
      expect(fragment).not.toMatch(/\buniform float time\b/);
    } finally {
      material.dispose();
    }
  });
});
