import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";

const fragment = (body: string) => createCustomShaderMaterial({
  glsl: { fragment: body },
  uniforms: { strength: { type: "f32", value: 1 } }
} as never).sources.glsl.fragment as string;

/** GLSL ES 3.00: a fragment shader needs a default float precision before the first `float` declaration. */
function precisionBeforeFirstFloat(source: string): boolean {
  const lines = source.split("\n");
  let declared = false;
  for (const line of lines) {
    if (/^\s*precision\s+(lowp|mediump|highp)\s+float\s*;/.test(line)) declared = true;
    else if (/\bfloat\b/.test(line) && !declared) return false;
  }
  return declared;
}

describe("custom shader fragment precision", () => {
  it("declares a default float precision before the prelude when the author declares none", () => {
    const src = fragment("out vec4 outColor;\nvoid main() { outColor = vec4(vec3(u_strength), 1.0); }");
    expect(precisionBeforeFirstFloat(src)).toBe(true);
  });

  it("still does when the author writes their own `precision highp float;` (the prelude comes first)", () => {
    const src = fragment("precision highp float;\nout vec4 outColor;\nvoid main() { outColor = vec4(vec3(u_strength), 1.0); }");
    expect(precisionBeforeFirstFloat(src)).toBe(true);
    expect(src.indexOf("precision highp float;")).toBeLessThan(src.indexOf("uniform float u_strength;"));
  });

  it("keeps an author's own declaration after ours so it governs their code", () => {
    const src = fragment("precision mediump float;\nout vec4 outColor;\nvoid main() { outColor = vec4(1.0); }");
    expect(precisionBeforeFirstFloat(src)).toBe(true);
    expect(src.lastIndexOf("precision mediump float;")).toBeGreaterThan(src.indexOf("precision highp float;"));
  });
});
