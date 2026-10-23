import { describe, expect, it } from "vitest";
import { outputFragmentGlsl } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { WebGL2LegacyPostPipeline } from "../../../packages/rendering/src/webgl2/LegacyPost";
import { readFileSync } from "node:fs";

describe("non-finite sample guards (real GPUs propagate NaN/Inf where software GL flushes)", () => {
  it("the output stage replaces a non-finite scene texel before tone mapping, for every operator", () => {
    for (const toneMapping of ["none", "linear", "reinhard", "aces", "agx", "neutral", "cineon"]) {
      const source = outputFragmentGlsl({ toneMapping, backgroundCoverage: false, overlay: false });
      const guard = source.indexOf("any(isnan(scene)) || any(isinf(scene))");
      const sample = source.indexOf("vec4 scene = texture(u_scene, v_uv);");
      const toneMap = source.indexOf("TONE_MAP(hdr * u_exposure)");
      expect(sample, toneMapping).toBeGreaterThan(-1);
      expect(guard, toneMapping).toBeGreaterThan(sample);
      expect(toneMap, toneMapping).toBeGreaterThan(guard);
    }
  });

  it("the bloom downsample pyramid sanitises every tap", () => {
    const source = readFileSync("packages/rendering/src/webgl2/LegacyPost.ts", "utf8");
    const start = source.indexOf("ensureBloomDownsampleProgram(): WebGLProgram");
    const body = source.slice(start, source.indexOf("ensureBloomAccumulateProgram", start));
    expect(body).toContain("vec4 a3dFinite(vec4 c)");
    expect(body.match(/a3dFinite\(texture\(/g)?.length).toBe(4);
    expect(body).not.toMatch(/[^(]texture\(u_source, uv/);
    expect(typeof WebGL2LegacyPostPipeline).toBe("function");
  });
});

import { createCustomShaderMaterial, SAFE_POW_GLSL } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";

describe("material.custom gets a total pow() (undefined for x < 0 in GLSL; NaN on real GPUs)", () => {
  const fragmentOf = (body: string): string => {
    const instance = createCustomShaderMaterial({ glsl: { fragment: `out vec4 outColor;\nvoid main() { ${body} }` } });
    const source = instance.sources.glsl!.fragment;
    instance.dispose();
    return source;
  };

  it("injects a3dPow overloads and redirects pow() when the shader calls pow", () => {
    const source = fragmentOf("outColor = vec4(pow(1.0 - 1.0000001, 1.6));");
    expect(source).toContain(SAFE_POW_GLSL);
    expect(source.indexOf("#define pow(x, y) a3dPow(x, y)")).toBeLessThan(source.indexOf("void main()"));
    for (const type of ["float", "vec2", "vec3", "vec4"]) expect(SAFE_POW_GLSL).toContain(`${type} a3dPow(${type} x, ${type} y)`);
    expect(SAFE_POW_GLSL).toContain("max(abs(x), ");
  });

  it("leaves shaders that never call pow byte-for-byte unchanged", () => {
    expect(fragmentOf("outColor = vec4(1.0);")).not.toContain("a3dPow");
  });
});
