import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { allProgramSpecs } from "../../../apps/showcase-splat-turf/src/world";

/**
 * Bakes every `material.custom` program Splat Turf draws with through the engine's own prelude generator
 * and compiles vertex + fragment with the reference GLSL compiler. Skipped when glslangValidator is absent
 * (the only sanctioned skip pattern).
 */
const available = spawnSync("glslangValidator", ["--version"]).status === 0;

describe.skipIf(!available)("splat-turf GLSL compiles under #version 300 es", () => {
  for (const { name, spec } of allProgramSpecs()) {
    it(`${name} bakes and links`, () => {
      const material = createCustomShaderMaterial(spec, `splat-turf-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        expect(vertex.startsWith("#version 300 es")).toBe(true);
        expect(fragment.startsWith("#version 300 es")).toBe(true);
        const dir = mkdtempSync(join(tmpdir(), "st-glsl-"));
        try {
          writeFileSync(join(dir, "p.vert"), vertex);
          writeFileSync(join(dir, "p.frag"), fragment);
          const result = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
          expect(`${result.stdout}${result.stderr}`.trim(), `glslangValidator output for ${name}`).not.toMatch(/ERROR/);
          expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      } finally {
        material.dispose();
      }
    });
  }

  it("no authored uniform name repeats within a stage", () => {
    for (const { name, spec } of allProgramSpecs()) {
      const material = createCustomShaderMaterial(spec, `splat-turf-names-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        for (const [stage, source] of [["vertex", vertex], ["fragment", fragment]] as const) {
          const declared = [...source.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(?:\[\d+\])?\s*;/gm)].map((m) => m[1]!);
          expect(new Set(declared).size, `${name} ${stage} declares a uniform twice: ${declared.join(", ")}`).toBe(declared.length);
        }
      } finally {
        material.dispose();
      }
    }
  });
});