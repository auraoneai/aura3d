import { describe, expect, it } from "vitest";
import { material } from "../../../packages/engine/src/agent-api/nodes/material.js";
import {
  applyCustomUniformWrites,
  assertAuraCustomMaterialSpec,
  createCustomShaderMaterial,
  customMaterialCacheKey
} from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors.js";
import {
  MockRenderDevice,
  PortableShaderMaterial,
  globalShaderSource,
  registerShaderChunk
} from "../../../packages/rendering/src";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";

const FRAGMENT = `out vec4 outColor;
void main() { outColor = vec4(strength * uTime, 0.0, 1.0, 1.0); }`;

const baseSpec = (overrides: Partial<AuraCustomMaterialSpec> = {}): AuraCustomMaterialSpec => ({
  glsl: { fragment: FRAGMENT },
  uniforms: { strength: { type: "f32", value: 0.5 } },
  ...overrides
});

describe("material.custom(spec) — SH-02 factory + validation", () => {
  it("returns the frozen { kind: \"custom\", custom: spec } shape", () => {
    const spec = baseSpec();
    const spec2 = material.custom(spec);
    expect(spec2).toEqual({ kind: "custom", custom: spec });
  });

  it("rejects non-object specs and missing glsl", () => {
    expect(() => material.custom(null as never)).toThrowError(AuraRuntimeError);
    expect(() => material.custom({} as never)).toThrowError(/spec\.glsl is required/);
  });

  it("rejects a WGSL-only spec — GLSL is required for the WebGL2 path", () => {
    expect(() => assertAuraCustomMaterialSpec({ wgsl: { fragment: "@fragment fn f() {}" } }))
      .toThrowError(/WGSL-only|glsl\.fragment|spec\.glsl/);
    expect(() => assertAuraCustomMaterialSpec({ glsl: { fragment: " " }, wgsl: { vertex: "@vertex fn v() {}", fragment: "@fragment fn f() {}" } }))
      .toThrowError(/non-empty/);
  });

  it("rejects reserved built-in uniform names and bad types/values", () => {
    expect(() => assertAuraCustomMaterialSpec(baseSpec({ uniforms: { uTime: "f32" } }))).toThrowError(/reserved/);
    expect(() => assertAuraCustomMaterialSpec(baseSpec({ uniforms: { foo: "textureCube" as never } }))).toThrowError(/unsupported type/);
    expect(() => assertAuraCustomMaterialSpec(baseSpec({ uniforms: { "bad-name!": "f32" } }))).toThrowError(/identifier/);
    expect(() => assertAuraCustomMaterialSpec(baseSpec({ uniforms: { v: { type: "vec3", value: [1, 2] } } }))).toThrowError(/3 scalar/);
  });

  it("rejects transparent + depthWrite and custom blending", () => {
    expect(() => assertAuraCustomMaterialSpec(baseSpec({ transparent: true, depthWrite: true }))).toThrowError(/depthWrite/);
    expect(() => assertAuraCustomMaterialSpec(baseSpec({ blending: "custom" }))).toThrowError(/custom/);
  });
});

describe("compiler adapter — spec → PortableShaderMaterial", () => {
  it("compiles to a PortableShaderMaterial with a stable deterministic shader key", () => {
    const a = createCustomShaderMaterial(baseSpec());
    const b = createCustomShaderMaterial(baseSpec());
    expect(a).toBeInstanceOf(PortableShaderMaterial);
    expect(a.shaderKey).toBe(b.shaderKey);
    expect(a.shaderKey).toMatch(/^aura3d\/portable\/custom-[0-9a-f]{8}$/);
    // Same key = same program cache entry; the global pair is registered.
    expect(globalShaderSource(a.shaderKey)).toBeDefined();
    a.dispose();
    b.dispose();
    expect(globalShaderSource(a.shaderKey)).toBeUndefined();
  });

  it("cache key is order-independent for uniform/define/patch maps and salted by patch content", () => {
    const unordered = baseSpec({ uniforms: { strength: "f32", tint: { type: "vec3", value: [1, 0, 0] } }, defines: { A: 1, B: 2 } });
    const reordered = baseSpec({ defines: { B: 2, A: 1 }, uniforms: { tint: { type: "vec3", value: [1, 0, 0] }, strength: "f32" } });
    expect(customMaterialCacheKey(unordered)).toBe(customMaterialCacheKey(reordered));
    const patched = baseSpec({ uniforms: unordered.uniforms, defines: unordered.defines, patch: { common: "// patched" } });
    expect(customMaterialCacheKey(patched)).not.toBe(customMaterialCacheKey(unordered));
    const patchedDifferently = baseSpec({ uniforms: unordered.uniforms, defines: unordered.defines, patch: { common: "// different" } });
    expect(customMaterialCacheKey(patchedDifferently)).not.toBe(customMaterialCacheKey(patched));
  });

  it("lowers authored uniforms to u_-prefixed parameters with initial values", () => {
    const instance = createCustomShaderMaterial(baseSpec({
      uniforms: {
        strength: { type: "f32", value: 0.75 },
        tint: { type: "color3", value: "#ff0000" },
        gain: { type: "vec2", value: [2, 3] },
        u_raw: { type: "f32", value: 9 }
      }
    }));
    expect(instance.getParameter("u_strength")).toBe(0.75);
    expect(instance.getParameter("u_gain")).toEqual([2, 3]);
    expect(instance.getParameter("u_raw")).toBe(9);
    const tint = instance.getParameter("u_tint") as readonly number[];
    expect(tint[0]).toBeCloseTo(1);
    // generated GLSL declares the u_-names and aliases the authored names.
    expect(instance.sources.glsl.fragment).toContain("uniform float u_strength;");
    expect(instance.sources.glsl.fragment).toContain("#define strength u_strength");
    expect(instance.sources.glsl.fragment).toContain("uniform vec3 u_tint;");
    instance.dispose();
  });

  it("injects three-style built-ins (uTime/modelMatrix/cameraPosition …) into both stages", () => {
    const instance = createCustomShaderMaterial(baseSpec());
    expect(instance.sources.glsl.vertex).toContain("uniform mat4 u_modelViewProjection;");
    expect(instance.sources.glsl.vertex).toContain("uniform mat4 u_viewMatrix;");
    expect(instance.sources.glsl.vertex).toContain("#define uTime u_time");
    expect(instance.sources.glsl.vertex).toContain("#define modelViewMatrix (u_viewMatrix * u_modelMatrix)");
    expect(instance.sources.glsl.fragment).toContain("#define cameraPosition u_cameraPosition");
    expect(instance.sources.glsl.vertex).toContain("#version 300 es");
    instance.dispose();
  });

  it("maps transparent/blending/side/depth into RenderState", () => {
    const blended = createCustomShaderMaterial(baseSpec({ blending: "additive", side: "double" }));
    expect(blended.renderState.blend).toBe(true);
    expect(blended.renderState.blendMode).toBe("additive");
    expect(blended.renderState.depthWrite).toBe(false);
    expect(blended.renderState.cullMode).toBe("none");
    const opaque = createCustomShaderMaterial(baseSpec({ side: "back", depthTest: false }));
    expect(opaque.renderState.blend).toBe(false);
    expect(opaque.renderState.depthTest).toBe(false);
    expect(opaque.renderState.cullMode).toBe("front");
    blended.dispose();
    opaque.dispose();
  });

  it("bakes #include chunks: registered chunk resolves, patch replaces, patch salts nothing else", () => {
    registerShaderChunk("parity-l1-glow", "vec3 parityGlow() { return vec3(1.0, 0.5, 0.0); }");
    const spec = baseSpec({
      glsl: { fragment: `#include <parity-l1-glow>\nout vec4 outColor;\nvoid main() { outColor = vec4(parityGlow(), 1.0); }` }
    });
    const instance = createCustomShaderMaterial(spec);
    expect(instance.sources.glsl.fragment).toContain("vec3 parityGlow()");
    const patched = createCustomShaderMaterial(baseSpec({
      glsl: spec.glsl,
      patch: { "parity-l1-glow": "vec3 parityGlow() { return vec3(0.0, 0.0, 1.0); }" }
    }));
    expect(patched.sources.glsl.fragment).toContain("vec3(0.0, 0.0, 1.0)");
    expect(patched.shaderKey).not.toBe(instance.shaderKey);
    instance.dispose();
    patched.dispose();
  });

  it("rejects duplicate chunk registration (and built-in names)", () => {
    registerShaderChunk("parity-l1-dupe", "float parityDupe() { return 1.0; }");
    expect(() => registerShaderChunk("parity-l1-dupe", "float parityDupe() { return 2.0; }")).toThrowError(/already registered/);
    expect(() => registerShaderChunk("lighting_common", "void nope() {}")).toThrowError(/already registered/);
  });

  it("WGSL path: provided WGSL produces portable bindings; omitted WGSL compiles WebGL2-only", () => {
    const glOnly = createCustomShaderMaterial(baseSpec());
    expect(glOnly.sources.wgsl).toBeUndefined();
    const wgsl = createCustomShaderMaterial(baseSpec({
      wgsl: {
        fragment: `@fragment fn fs_main() -> @location(0) vec4f { return vec4f(1.0); }`
      }
    }));
    expect(wgsl.sources.wgsl?.fragment).toContain("/* @aura3d-bindings */");
    expect(wgsl.sources.wgsl?.vertex).toContain("@vertex");
    glOnly.dispose();
    wgsl.dispose();
  });

  it("MockRenderDevice compile succeeds and reports a program", () => {
    const instance = createCustomShaderMaterial(baseSpec());
    const result = instance.compile(new MockRenderDevice());
    expect(result.ok).toBe(true);
    expect(result.program).toBeDefined();
    instance.dispose();
  });
});

describe("runtime uniform writes — SH-02/L1-03 (no recompile)", () => {
  it("applyCustomUniformWrites mutates uniform values without touching the shader key", () => {
    const instance = createCustomShaderMaterial(baseSpec());
    const shaderKey = instance.shaderKey;
    const applied = applyCustomUniformWrites(instance, new Map([["strength", 2.5]]));
    expect(applied).toBe(1);
    expect(instance.getParameter("u_strength")).toBe(2.5);
    expect(instance.shaderKey).toBe(shaderKey);
    // Idempotent: re-applying the same value is a no-op (no revision churn).
    expect(applyCustomUniformWrites(instance, new Map([["strength", 2.5]]))).toBe(0);
    instance.dispose();
  });
});
