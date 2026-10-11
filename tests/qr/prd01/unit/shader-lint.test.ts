/**
 * 01-S7 / PRD-01 §15: `tools/shader-lint` — one failing fixture per forbidden
 * pattern, and every generated program snapshot lints clean.
 */

import { describe, expect, it } from "vitest";

import { SHADER_LINT_RULES, formatViolations, generatedProgramSources, lintShaderSource, lintShaderSources } from "../../../../tools/shader-lint/index";

const FIXTURES: Readonly<Record<string, string>> = {
  "fudge-mix-1.1": "  color.rgb *= mix(1.1, 1.0, roughness);",
  "fudge-mix-1.0-0.18": "  float floorLevel = mix(1.0, 0.18, metallic);",
  "rough-environment-floor": "  vec3 env = max(env, roughEnvironmentFloor);",
  "source-paint": "  albedo = sourcePaint(albedo);",
  "material-red-paint-gate": "  if (materialRedPaintGate > 0.0) albedo.r *= 1.2;",
  "advanced-pbr-lobes": "  a3dApplyAdvancedPbrLobes(surface);",
  "apply-metal-rough": "  a3dApplyMetalRough(surface, mr);",
  "output-color-space-uniform": "uniform int u_outputColorSpace;",
  "aces-inline": "  return (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);",
  "step-uniform-feature-gate": "  float useMap = step(0.5, u_hasNormalMap);"
};

describe("tools/shader-lint", () => {
  it("has one fixture per rule", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(SHADER_LINT_RULES.map((rule) => rule.id).sort());
  });

  for (const rule of SHADER_LINT_RULES) {
    it(`fixture for ${rule.id} fails`, () => {
      const glsl = `#version 300 es\nprecision highp float;\n${FIXTURES[rule.id]}\nvoid main() {}\n`;
      const violations = lintShaderSource({ name: `fixture:${rule.id}`, glsl });
      expect(violations.map((v) => v.rule)).toEqual([rule.id]);
      expect(violations[0]!.line).toBe(3);
    });
  }

  it("a clean source passes", () => {
    expect(lintShaderSource({ name: "clean", glsl: "#version 300 es\nvoid main() { gl_Position = vec4(mix(0.0, 1.0, 0.5)); }\n" })).toEqual([]);
  });

  it("every generated program snapshot lints clean", async () => {
    const sources = await generatedProgramSources();
    expect(sources.length).toBe(26);
    const violations = lintShaderSources(sources);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
