import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { A3D_AUTHOR_GLSL_CHUNKS, A3D_AUTHOR_GLSL_CHUNK_NAMES, MockRenderDevice } from "../../../packages/rendering/src";

const fnNames = (signature: string): string[] => [...signature.matchAll(/\b(a3d[A-Za-z0-9]+)\b/g)].map((m) => m[1]!);

describe("author GLSL chunk library (#include <a3d_*>)", () => {
  it("has unique, documented chunks", () => {
    expect(new Set(A3D_AUTHOR_GLSL_CHUNK_NAMES).size).toBe(A3D_AUTHOR_GLSL_CHUNKS.length);
    expect(A3D_AUTHOR_GLSL_CHUNK_NAMES).toEqual(expect.arrayContaining(["a3d_math", "a3d_noise", "a3d_sky", "a3d_fog", "a3d_triplanar", "a3d_toon", "colorspace_decode", "colorspace_encode"]));
    for (const chunk of A3D_AUTHOR_GLSL_CHUNKS) {
      expect(chunk.provides.length, chunk.name).toBeGreaterThan(0);
      for (const signature of chunk.provides) {
        for (const fn of fnNames(signature)) expect(chunk.source, `${chunk.name} documents ${fn}`).toMatch(new RegExp(`\\b${fn}\\s*\\(`));
      }
    }
  });

  it("every chunk defines only a3d-prefixed names, so author helpers never collide", () => {
    for (const chunk of A3D_AUTHOR_GLSL_CHUNKS) {
      const defined = [...chunk.source.matchAll(/^\s*(?:float|vec[234]|mat[234]|int|bool)\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]!);
      expect(defined.length, chunk.name).toBeGreaterThan(0);
      for (const name of defined) expect(name, `${chunk.name}: ${name}`).toMatch(/^a3d[A-Z]/);
    }
  });

  it("is NaN-safe by construction: no raw pow/normalize/sqrt/acos/asin outside guarded forms", () => {
    for (const chunk of A3D_AUTHOR_GLSL_CHUNKS) {
      const code = chunk.source.replace(/\/\/.*$/gm, "");
      if (chunk.name.startsWith("colorspace_")) continue; // base is clamped non-negative before pow
      expect(code, `${chunk.name} must not call pow`).not.toMatch(/\bpow\s*\(/);
      expect(code, `${chunk.name} raw normalize`).not.toMatch(/(?<![A-Za-z0-9_])normalize\s*\(/);
      for (const fn of ["acos", "asin"]) {
        for (const match of code.matchAll(new RegExp(`(?<![A-Za-z0-9_])${fn}\\s*\\(([^)]*)\\)`, "g"))) {
          expect(match[1], `${chunk.name} ${fn} argument must be clamped`).toMatch(/clamp\(/);
        }
      }
      for (const match of code.matchAll(/(?<![A-Za-z0-9_])(sqrt|inversesqrt)\s*\(([^)]*)\)/g)) {
        expect(match[2], `${chunk.name} ${match[1]} argument must be non-negative`).toMatch(/max\(|l2 > 1e-20|\bl2\b/);
      }
    }
  });

  it("every chunk expands through #include and compiles on the mock device", () => {
    for (const chunk of A3D_AUTHOR_GLSL_CHUNKS) {
      if (chunk.stages.includes("vertex")) {
        const vertexOnly = createCustomShaderMaterial({
          glsl: { vertex: `#include <${chunk.name}>\nvoid main() { gl_Position = u_modelViewProjection * vec4(position, 1.0); }`, fragment: "out vec4 outColor;\nvoid main() { outColor = vec4(1.0); }" }
        });
        expect(vertexOnly.sources.glsl!.vertex, chunk.name).not.toContain("#include");
        expect(vertexOnly.compile(new MockRenderDevice()).ok, `${chunk.name} vertex`).toBe(true);
        vertexOnly.dispose();
      }
      const fragment = createCustomShaderMaterial({ glsl: { fragment: `#include <${chunk.name}>\nout vec4 outColor;\nvoid main() { outColor = vec4(1.0); }` } });
      expect(fragment.sources.glsl!.fragment, chunk.name).not.toContain("#include");
      expect(fragment.sources.glsl!.fragment, chunk.name).toContain(chunk.provides[0]!.match(/a3d[A-Za-z0-9]+/)![0]);
      expect(fragment.compile(new MockRenderDevice()).ok, `${chunk.name} fragment`).toBe(true);
      fragment.dispose();
    }
  });

  it("all chunks can be included together without duplicate definitions and still compile alongside the safe-pow define", () => {
    const includes = A3D_AUTHOR_GLSL_CHUNKS.filter((c) => c.stages.includes("fragment")).map((c) => `#include <${c.name}>`).join("\n");
    const instance = createCustomShaderMaterial({
      glsl: { fragment: `${includes}\nout vec4 outColor;\nvoid main() { float k = pow(0.5, 2.0); outColor = vec4(vec3(a3dFbm(vec2(k), 4)), 1.0); }` }
    });
    const source = instance.sources.glsl!.fragment;
    const defs = [...source.matchAll(/^\s*(?:float|vec[234]|mat[234])\s+(a3d[A-Za-z0-9]+)\s*\(([^)]*)\)/gm)].map((m) => `${m[1]}(${m[2]!.replace(/\s+/g, " ").replace(/\b[a-z][A-Za-z0-9]*(?=,|$)/g, "")})`);
    expect(new Set(defs).size, "duplicate overload definitions").toBe(defs.length);
    expect(instance.compile(new MockRenderDevice()).ok).toBe(true);
    instance.dispose();
  });

  it("a user patch overrides an author chunk", () => {
    const instance = createCustomShaderMaterial({
      glsl: { fragment: "#include <a3d_fog>\nout vec4 outColor;\nvoid main() { outColor = vec4(1.0); }" },
      patch: { a3d_fog: "vec3 a3dFogLinear(vec3 c, vec3 f, float d, float n, float fa) { return c; }" }
    });
    expect(instance.sources.glsl!.fragment).toContain("vec3 a3dFogLinear(vec3 c, vec3 f, float d, float n, float fa) { return c; }");
    expect(instance.sources.glsl!.fragment).not.toContain("a3dFogExp2");
    instance.dispose();
  });
});
