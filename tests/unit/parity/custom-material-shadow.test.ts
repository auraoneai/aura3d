import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial, customMaterialCacheKey } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { A3D_AUTHOR_GLSL_CHUNKS, MockRenderDevice } from "../../../packages/rendering/src";
import { SHADOW_FORWARD_FACTOR_GLSL } from "../../../packages/rendering/src/program/chunks/shadow_forward.glsl";

const FRAGMENT = "in vec3 vWorld; in vec3 vN; out vec4 outColor;\nvoid main() { outColor = vec4(vec3(a3dSunShadowAuto(vWorld, vN)), 1.0); }";
const VERTEX = "out vec3 vWorld; out vec3 vN;\nvoid main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalMatrix * normal; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }";

describe("material.custom sun-shadow receive", () => {
  it("receiveShadow: true includes a3d_shadow, compiles, and salts the cache key", () => {
    const withShadow = { glsl: { vertex: VERTEX, fragment: FRAGMENT }, receiveShadow: true };
    const material = createCustomShaderMaterial(withShadow);
    const fragment = material.sources.glsl!.fragment;
    expect(fragment).not.toContain("#include");
    expect(fragment).toContain("float a3dSunShadow(");
    expect(fragment).toContain("uniform sampler2D u_shadowMapTexture;");
    expect(fragment).toContain("uniform vec3 u_a3dSunDirection;");
    expect(material.compile(new MockRenderDevice()).ok).toBe(true);
    expect(customMaterialCacheKey(withShadow)).not.toBe(customMaterialCacheKey({ glsl: withShadow.glsl }));
    material.dispose();
  });

  it("an explicit #include <a3d_shadow> is not duplicated by receiveShadow", () => {
    const material = createCustomShaderMaterial({
      glsl: { vertex: VERTEX, fragment: `#include <a3d_shadow>\n${FRAGMENT}` },
      receiveShadow: true
    });
    expect(material.sources.glsl!.fragment.match(/float a3dSunShadow\(/g)).toHaveLength(1);
    expect(material.compile(new MockRenderDevice()).ok).toBe(true);
    material.dispose();
  });

  it("keeps the #version line first when the author wrote one", () => {
    const material = createCustomShaderMaterial({ glsl: { vertex: VERTEX, fragment: `#version 300 es\n${FRAGMENT}` }, receiveShadow: true });
    expect(material.sources.glsl!.fragment.trimStart().startsWith("#version 300 es")).toBe(true);
    expect(material.compile(new MockRenderDevice()).ok).toBe(true);
    material.dispose();
  });

  it("samples the shadow map exactly like the built-in lit programs (same slope, bias and PCF statements)", () => {
    const chunk = A3D_AUTHOR_GLSL_CHUNKS.find((c) => c.name === "a3d_shadow")!.source;
    const core = (src: string) => src.slice(src.indexOf("float slopeTangent"), src.indexOf("return mix(1.0, 1.0 - occlusion")).trim();
    expect(core(chunk)).toBe(core(SHADOW_FORWARD_FACTOR_GLSL));
    expect(chunk).toContain("worldPosition + receiverNormal * u_shadowMapNormalBias");
    expect(chunk).toContain("if (u_shadowMapEnabled < 0.5) return 1.0;");
  });
});
