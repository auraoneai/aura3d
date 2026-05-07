import { describe, expect, it } from "vitest";
import { verifyShaders } from "../../../tools/verify-shaders/index";
import {
  DEFAULT_DEPTH_SHADER_MARKER,
  DEFAULT_DEPTH_SHADER_NAME,
  DEFAULT_INSTANCED_PBR_SHADER_MARKER,
  DEFAULT_INSTANCED_PBR_SHADER_NAME,
  DEFAULT_INSTANCED_UNLIT_SHADER_MARKER,
  DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
  DEFAULT_MORPH_UNLIT_SHADER_MARKER,
  DEFAULT_MORPH_UNLIT_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  DEFAULT_PBR_SHADER_MARKER,
  DEFAULT_PBR_SHADER_NAME,
  DEFAULT_SKINNED_UNLIT_SHADER_MARKER,
  DEFAULT_SKINNED_UNLIT_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SHADER_MARKER,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_UNLIT_SHADER_MARKER,
  DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
  DEFAULT_UNLIT_SHADER_MARKER,
  DEFAULT_UNLIT_SHADER_NAME,
  createDefaultShaderLibrary,
  validateShaderChunks
} from "../../../packages/rendering/src";

describe("shader marker coverage", () => {
  it("verifies real shader source files with nonzero marker coverage", () => {
    const report = verifyShaders(process.cwd());

    expect(report.ok).toBe(true);
    expect(report.checkedFiles).toBeGreaterThanOrEqual(6);
  });

  it("preserves markers for canonical runtime shader sources", () => {
    const library = createDefaultShaderLibrary();
    const unlit = library.compileSource(DEFAULT_UNLIT_SHADER_NAME);
    const instancedUnlit = library.compileSource(DEFAULT_INSTANCED_UNLIT_SHADER_NAME);
    const instancedPbr = library.compileSource(DEFAULT_INSTANCED_PBR_SHADER_NAME);
    const texturedUnlit = library.compileSource(DEFAULT_TEXTURED_UNLIT_SHADER_NAME);
    const skinnedUnlit = library.compileSource(DEFAULT_SKINNED_UNLIT_SHADER_NAME);
    const morphUnlit = library.compileSource(DEFAULT_MORPH_UNLIT_SHADER_NAME);
    const normalMappedPbr = library.compileSource(DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME);
    const texturedPbr = library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME);
    const pbr = library.compileSource(DEFAULT_PBR_SHADER_NAME);
    const depth = library.compileSource(DEFAULT_DEPTH_SHADER_NAME);

    expect(unlit.vertex).toContain(DEFAULT_UNLIT_SHADER_MARKER);
    expect(unlit.fragment).toContain(DEFAULT_UNLIT_SHADER_MARKER);
    expect(instancedUnlit.vertex).toContain(DEFAULT_INSTANCED_UNLIT_SHADER_MARKER);
    expect(instancedUnlit.fragment).toContain(DEFAULT_INSTANCED_UNLIT_SHADER_MARKER);
    expect(instancedPbr.vertex).toContain(DEFAULT_INSTANCED_PBR_SHADER_MARKER);
    expect(instancedPbr.fragment).toContain(DEFAULT_INSTANCED_PBR_SHADER_MARKER);
    expect(instancedPbr.vertex).toContain("a_normal");
    expect(instancedPbr.fragment).toContain("u_lightData");
    expect(texturedUnlit.vertex).toContain(DEFAULT_TEXTURED_UNLIT_SHADER_MARKER);
    expect(texturedUnlit.fragment).toContain(DEFAULT_TEXTURED_UNLIT_SHADER_MARKER);
    expect(skinnedUnlit.vertex).toContain(DEFAULT_SKINNED_UNLIT_SHADER_MARKER);
    expect(skinnedUnlit.fragment).toContain(DEFAULT_SKINNED_UNLIT_SHADER_MARKER);
    expect(morphUnlit.vertex).toContain(DEFAULT_MORPH_UNLIT_SHADER_MARKER);
    expect(morphUnlit.fragment).toContain(DEFAULT_MORPH_UNLIT_SHADER_MARKER);
    expect(normalMappedPbr.vertex).toContain(DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER);
    expect(normalMappedPbr.fragment).toContain(DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER);
    expect(texturedPbr.vertex).toContain(DEFAULT_TEXTURED_PBR_SHADER_MARKER);
    expect(texturedPbr.fragment).toContain(DEFAULT_TEXTURED_PBR_SHADER_MARKER);
    expect(pbr.vertex).toContain(DEFAULT_PBR_SHADER_MARKER);
    expect(pbr.fragment).toContain(DEFAULT_PBR_SHADER_MARKER);
    expect(unlit.vertex).toContain("a_color");
    expect(unlit.fragment).toContain("v_vertexColor");
    expect(texturedUnlit.vertex).toContain("a_color");
    expect(texturedUnlit.fragment).toContain("v_vertexColor");
    expect(pbr.vertex).toContain("a_color");
    expect(pbr.fragment).toContain("v_vertexColor");
    expect(normalMappedPbr.vertex).toContain("a_color");
    expect(normalMappedPbr.fragment).toContain("v_vertexColor");
    expect(texturedPbr.vertex).toContain("a_color");
    expect(texturedPbr.fragment).toContain("v_vertexColor");
    expect(depth.vertex).toContain(DEFAULT_DEPTH_SHADER_MARKER);
    expect(depth.fragment).toContain(DEFAULT_DEPTH_SHADER_MARKER);
  });

  it("validates shader chunks for duplicate and cycle regressions", () => {
    expect(() => validateShaderChunks()).not.toThrow();
  });
});
