import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { allProgramSpecs } from "../../../examples/roadster-hours-port/materials";
import { LOOKS, ORIGINAL_LOOKS } from "../../../examples/roadster-hours-port/look";

/** Bakes every `material.custom` program through the engine's prelude and compiles it with the reference GLSL compiler. */
const available = spawnSync("glslangValidator", ["--version"]).status === 0;

describe("roadster-hours-port GLSL bakes under #version 300 es", () => {
  const looks = [...Object.values(LOOKS).map((look) => ["", look] as const), ...Object.values(ORIGINAL_LOOKS).map((look) => ["original-", look] as const)];
  for (const [prefix, look] of looks) for (const { name: programName, spec } of allProgramSpecs(look)) {
    const name = `${prefix}${look.id}-${programName}`;
    it(`${name} bakes with its version header first`, () => {
      const material = createCustomShaderMaterial(spec, `rh-port-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        expect(vertex.startsWith("#version 300 es")).toBe(true);
        expect(fragment.startsWith("#version 300 es")).toBe(true);
      } finally { material.dispose(); }
    });
    it.skipIf(!available)(`${name} links under glslangValidator`, () => {
      const material = createCustomShaderMaterial(spec, `rh-port-link-${name}`);
      const dir = mkdtempSync(join(tmpdir(), "rh-glsl-"));
      try {
        const { vertex, fragment } = material.sources.glsl;
        writeFileSync(join(dir, "p.vert"), vertex);
        writeFileSync(join(dir, "p.frag"), fragment);
        const result = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
        expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      } finally { material.dispose(); rmSync(dir, { recursive: true, force: true }); }
    });
  }
});
