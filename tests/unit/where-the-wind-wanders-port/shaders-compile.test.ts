import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { blobSpec, glowSpec, hazeSpec, moteSpec, paintSpec, propSpec, seaSpec, shaftSpec, skySpec, streamSpec, travellerSpec, windSpec } from "../../../examples/where-the-wind-wanders-port/world";

/**
 * Bakes every `material.custom` program the port draws with through the engine's own prelude
 * generator. The reference GLSL compiler check is skipped when `glslangValidator` is not
 * installed; the structural checks always run.
 */
const available = spawnSync("glslangValidator", ["--version"]).status === 0;

const programs = [
  { name: "wind-foliage", spec: windSpec() },
  { name: "paint-ground", spec: paintSpec() },
  { name: "sea", spec: seaSpec() },
  { name: "sky", spec: skySpec() },
  { name: "stream", spec: streamSpec() },
  { name: "props", spec: propSpec() },
  { name: "traveller", spec: travellerSpec() },
  { name: "glow", spec: glowSpec([1, 0.9, 0.6], 1, 0) },
  { name: "pollen", spec: moteSpec() },
  { name: "mist-haze", spec: hazeSpec(1.5) },
  { name: "light-shaft", spec: shaftSpec(1, 0.1) },
  { name: "contact-shadow", spec: blobSpec() }
] as const;

describe("where-the-wind-wanders-port programs (structural)", () => {
  for (const { name, spec } of programs) {
    it(`${name} bakes to #version 300 es with a fragment output and no legacy built-ins`, () => {
      const material = createCustomShaderMaterial(spec, `wind-port-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        expect(vertex.startsWith("#version 300 es")).toBe(true);
        expect(fragment.startsWith("#version 300 es")).toBe(true);
        expect(fragment).toMatch(/\bout\s+vec4\s+outColor\b/);
        for (const source of [vertex, fragment]) {
          expect(source, "no GLSL 1 varying").not.toMatch(/^\s*varying\s/m);
          expect(source, "no texture2D").not.toMatch(/\btexture2D\s*\(/);
          expect(source, "no gl_FragColor").not.toMatch(/\bgl_FragColor\b/);
        }
        for (const [stage, source] of [["vertex", vertex], ["fragment", fragment]] as const) {
          const declared = [...source.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(?:\[\d+\])?\s*;/gm)].map((m) => m[1]!);
          expect(new Set(declared).size, `${name} ${stage} declares a uniform twice: ${declared.join(", ")}`).toBe(declared.length);
        }
      } finally {
        material.dispose();
      }
    });
  }

  it("the wind program binds its four author attributes by name", () => {
    const material = createCustomShaderManagedForAttributes();
    expect(material.vertex).toMatch(/\btint\b/);
    expect(material.vertex).toMatch(/\bsway\b/);
    expect(material.vertex).toMatch(/\bphase\b/);
    expect(material.vertex).toMatch(/\bkind\b/);
  });
});

function createCustomShaderManagedForAttributes(): { vertex: string } {
  const material = createCustomShaderMaterial(windSpec(), "wind-port-attrs");
  try {
    return { vertex: material.sources.glsl.vertex };
  } finally {
    material.dispose();
  }
}

describe.skipIf(!available)("where-the-wind-wanders-port GLSL compiles under the reference compiler", () => {
  for (const { name, spec } of programs) {
    it(`${name} links`, () => {
      const material = createCustomShaderMaterial(spec, `wind-port-ref-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        const dir = mkdtempSync(join(tmpdir(), "wind-glsl-"));
        try {
          writeFileSync(join(dir, "p.vert"), vertex);
          writeFileSync(join(dir, "p.frag"), fragment);
          const result = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
          expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      } finally {
        material.dispose();
      }
    });
  }
});
