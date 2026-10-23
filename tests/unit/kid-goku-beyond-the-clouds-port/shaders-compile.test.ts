import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { allProgramSpecs } from "../../../examples/kid-goku-beyond-the-clouds-port/materials";

/** Bakes every `material.custom` program through the engine prelude and compiles it with glslangValidator (skipped when absent). */
const available = spawnSync("glslangValidator", ["--version"]).status === 0;

describe("cloud runner: custom materials bake", () => {
  for (const { name, spec } of allProgramSpecs()) {
    it(`${name} bakes into #version 300 es sources`, () => {
      const material = createCustomShaderMaterial(spec, `cr-port-${name}`);
      try {
        expect(material.sources.glsl.vertex.startsWith("#version 300 es")).toBe(true);
        expect(material.sources.glsl.fragment.startsWith("#version 300 es")).toBe(true);
        if (!available) return;
        const dir = mkdtempSync(join(tmpdir(), "cr-glsl-"));
        try {
          writeFileSync(join(dir, "p.vert"), material.sources.glsl.vertex);
          writeFileSync(join(dir, "p.frag"), material.sources.glsl.fragment);
          const r = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
          expect(`${r.stdout}${r.stderr}`.trim(), name).not.toMatch(/ERROR/);
          expect(r.status).toBe(0);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      } finally { material.dispose(); }
    });
  }
});
