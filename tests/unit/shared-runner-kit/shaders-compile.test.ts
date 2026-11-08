import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import {
  SHADOW_VERTEX, STRIP_SHADOW_FRAGMENT, flatSpec, gradientSkyFragment, shadowSpec, skySpec, toonSpec, type CustomSpec
} from "../../../examples/shared/runner-kit/shaders";

/**
 * Bakes every kit `material.custom` program through the engine's own prelude generator and compiles vertex + fragment
 * with the reference GLSL compiler, so a shader error shows up here instead of as a failed remote GPU run.
 * Skipped when `glslangValidator` is not installed.
 */
const available = spawnSync("glslangValidator", ["--version"]).status === 0;

const specs: { name: string; spec: CustomSpec }[] = [
  { name: "toon", spec: toonSpec([1, 1, 1]) },
  { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
  { name: "toon-emissive", spec: toonSpec([1, 0, 0], undefined, [0.2, 0, 0]) },
  { name: "flat", spec: flatSpec([1, 1, 1], 0.5) },
  { name: "flat-tone", spec: flatSpec([1, 1, 1], 0.5, true) },
  { name: "shadow", spec: shadowSpec() },
  { name: "sky-default", spec: skySpec() },
  { name: "sky-dusk", spec: skySpec(gradientSkyFragment([{ t: 0, hex: "#0a0a2e" }, { t: 0.6, hex: "#4a2a6a" }, { t: 1, hex: "#ff7a4d" }])) },
  {
    name: "strip-shadow",
    spec: {
      glsl: { vertex: SHADOW_VERTEX, fragment: STRIP_SHADOW_FRAGMENT },
      uniforms: { baseColor: { type: "color3", value: [0.02, 0.02, 0.05] }, alpha: { type: "f32", value: 0.3 } },
      transparent: true, depthWrite: false, side: "double"
    }
  }
];

describe("runner-kit sky gradient generator", () => {
  it("rejects fewer than two stops", () => {
    expect(() => gradientSkyFragment([])).toThrow();
    expect(() => gradientSkyFragment([{ t: 0, hex: "#000000" }])).toThrow();
  });

  it("sorts stops by t", () => {
    const src = gradientSkyFragment([{ t: 1, hex: "#ffffff" }, { t: 0, hex: "#000000" }]);
    expect(src.indexOf("0.0000")).toBeLessThan(src.indexOf("1.0000"));
  });
});

describe.skipIf(!available)("runner-kit GLSL compiles under #version 300 es", () => {
  for (const { name, spec } of specs) {
    it(`${name} bakes and links`, () => {
      const material = createCustomShaderMaterial(spec, `runner-kit-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        expect(vertex.startsWith("#version 300 es")).toBe(true);
        expect(fragment.startsWith("#version 300 es")).toBe(true);
        const dir = mkdtempSync(join(tmpdir(), "runner-kit-glsl-"));
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

  it("no authored uniform name collides with an engine built-in or repeats", () => {
    for (const { name, spec } of specs) {
      const material = createCustomShaderMaterial(spec, `runner-kit-names-${name}`);
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