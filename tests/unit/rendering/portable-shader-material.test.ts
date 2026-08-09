import { describe, expect, it } from "vitest";
import {
  MockRenderDevice,
  PortableShaderCompilationError,
  PortableShaderMaterial,
  ShaderLibrary
} from "../../../packages/rendering/src";

const SOURCES = {
  glsl: {
    vertex: `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }`,
    fragment: `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform float u_time;
out vec4 outColor;
void main() { outColor = vec4(u_color * (0.75 + 0.25 * sin(u_time)), 1.0); }`
  },
  wgsl: {
    vertex: `/* @aura3d-bindings */
struct VertexOutput { @builtin(position) position: vec4<f32> };
@vertex fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  let clip = aura.u_modelViewProjection * vec4<f32>(position, 1.0);
  output.position = vec4<f32>(clip.xy, clip.z * 0.5 + clip.w * 0.5, clip.w);
  return output;
}`,
    fragment: `/* @aura3d-bindings */
@fragment fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(aura.u_color * (0.75 + 0.25 * sin(aura.u_time)), 1.0);
}`
  }
} as const;

function material(library = new ShaderLibrary()): PortableShaderMaterial {
  return new PortableShaderMaterial({
    shaderLibrary: library,
    name: "unit-pulse",
    sources: SOURCES,
    uniforms: [
      { name: "u_color", kind: "vec3", value: [0.2, 0.7, 1] },
      { name: "u_time", kind: "float", value: 0 }
    ]
  });
}

describe("PortableShaderMaterial", () => {
  it("registers paired sources and schema-checks parameter values", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const compiled = library.compileSource(instance.shaderKey);

    expect(compiled.webgpu?.vertex).toContain("@vertex");
    expect(compiled.portableBindings?.map((binding) => binding.name)).toEqual([
      "u_modelViewProjection",
      "u_modelMatrix",
      "u_normalMatrix",
      "u_color",
      "u_time"
    ]);
    expect(() => instance.setParameter("u_color", [1, 2])).toThrow(/vec3 with 3 scalar values/);
    expect(() => instance.setParameter("u_color", [1, 0.5, 0.25])).not.toThrow();
  });

  it("returns normalized compile diagnostics and compiles through the public device contract", () => {
    const instance = material();
    const result = instance.compile(new MockRenderDevice());
    expect(result.ok).toBe(true);
    expect(result.program?.label).toBe(instance.shaderKey);
    expect(result.diagnostics).toEqual([]);
  });

  it("atomically hot reloads both backends and advances library revision", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const before = library.getRevision();
    const changed = {
      ...SOURCES,
      glsl: { ...SOURCES.glsl, fragment: SOURCES.glsl.fragment.replace("0.75", "0.60") },
      wgsl: { ...SOURCES.wgsl, fragment: SOURCES.wgsl.fragment.replace("0.75", "0.60") }
    };

    instance.hotReload(changed);

    expect(library.getRevision()).toBe(before + 1);
    expect(library.compileSource(instance.shaderKey).fragment).toContain("0.60");
    expect(instance.sources.wgsl.fragment).toContain("0.60");
  });

  it("rejects partial or schema-divergent reloads without replacing the live shader", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const before = library.compileSource(instance.shaderKey).fragment;
    const broken = {
      ...SOURCES,
      wgsl: { ...SOURCES.wgsl, fragment: SOURCES.wgsl.fragment.replace("/* @aura3d-bindings */", "") }
    };

    expect(() => instance.hotReload(broken)).toThrow(PortableShaderCompilationError);
    expect(instance.diagnostics).toContain("WGSL fragment stage is missing /* @aura3d-bindings */");
    expect(library.compileSource(instance.shaderKey).fragment).toBe(before);
  });

  it("unregisters its owned shader and becomes unusable on disposal", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const before = library.getRevision();

    instance.dispose();

    expect(instance.disposed).toBe(true);
    expect(library.getRevision()).toBe(before + 1);
    expect(() => library.get(instance.shaderKey)).toThrow(/not registered/);
    expect(instance.compile(new MockRenderDevice())).toEqual({ ok: false, diagnostics: ["Material unit-pulse is disposed"] });
  });
});
