import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { allProgramSpecs } from "../../../examples/last-train-port/materials";

/**
 * Bakes every `material.custom` program the port draws with through the engine's own prelude
 * generator and compiles vertex + fragment together with the reference GLSL compiler, so a
 * shader error shows up here instead of as a failed remote GPU run. Skipped when
 * `glslangValidator` is not installed.
 */
const available = spawnSync("glslangValidator", ["--version"]).status === 0;

describe.skipIf(!available)("last-train-port GLSL compiles under #version 300 es", () => {
  for (const { name, spec } of allProgramSpecs()) {
    it(`${name} bakes and links`, () => {
      const material = createCustomShaderMaterial(spec, `lt-port-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        expect(vertex.startsWith("#version 300 es"), "vertex keeps the version header first").toBe(true);
        expect(fragment.startsWith("#version 300 es"), "fragment keeps the version header first").toBe(true);
        const dir = mkdtempSync(join(tmpdir(), "lt-glsl-"));
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

  it("no authored uniform name collides with an engine built-in", () => {
    for (const { name, spec } of allProgramSpecs()) {
      const material = createCustomShaderMaterial(spec, `lt-port-names-${name}`);
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
