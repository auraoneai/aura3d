import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNLIT_SHADER_MARKER,
  DEFAULT_UNLIT_SHADER_NAME,
  ShaderModule,
  ShaderLibrary,
  ShaderPreprocessor,
  createDefaultShaderLibrary
} from "../../../packages/rendering/src";

describe("ShaderLibrary", () => {
  it("preserves source markers when compiling default unlit shader", () => {
    const library = createDefaultShaderLibrary();
    const compiled = library.compileSource(DEFAULT_UNLIT_SHADER_NAME);

    expect(compiled.vertex).toContain(DEFAULT_UNLIT_SHADER_MARKER);
    expect(compiled.fragment).toContain(DEFAULT_UNLIT_SHADER_MARKER);
  });

  it("rejects duplicate shader registration", () => {
    const library = new ShaderLibrary();
    const shader = {
      name: "test",
      marker: "@marker",
      vertex: "// @marker\nvoid main() {}",
      fragment: "// @marker\nvoid main() {}"
    };

    library.register(shader);

    expect(() => library.register(shader)).toThrow(/already registered/);
  });

  it("compiles named shader variants, caches them by defines, and rejects missing variants", () => {
    const library = new ShaderLibrary();
    library.register({
      name: "variant-test",
      marker: "@variant-test",
      vertex: [
        "// @variant-test",
        "#if USE_COLOR",
        "in vec4 a_color;",
        "#else",
        "in vec3 a_position;",
        "#endif",
        "void main() {}"
      ].join("\n"),
      fragment: "// @variant-test\nvoid main() {}",
      variants: [
        { name: "base", defines: { USE_COLOR: false } },
        { name: "vertex-color", defines: { USE_COLOR: true } }
      ]
    });

    const base = library.compileVariant("variant-test", "base");
    const color = library.compileVariant("variant-test", "vertex-color");
    const colorAgain = library.compileVariant("variant-test", "vertex-color");
    const colorDisabledByOverride = library.compileVariant("variant-test", "vertex-color", { defines: { USE_COLOR: false } });

    expect(base.label).toBe("variant-test:base");
    expect(base.vertex).toContain("in vec3 a_position;");
    expect(base.vertex).not.toContain("in vec4 a_color;");
    expect(color.label).toBe("variant-test:vertex-color");
    expect(color.vertex).toContain("in vec4 a_color;");
    expect(color.vertex).not.toContain("in vec3 a_position;");
    expect(colorAgain).toBe(color);
    expect(colorDisabledByOverride).not.toBe(color);
    expect(colorDisabledByOverride.vertex).toContain("in vec3 a_position;");
    expect(() => library.compileVariant("variant-test", "missing")).toThrow(/variant is not registered/);
  });

  it("rejects duplicate shader variant names", () => {
    const library = new ShaderLibrary();

    expect(() =>
      library.register({
        name: "duplicate-variant-test",
        marker: "@duplicate-variant-test",
        vertex: "// @duplicate-variant-test\nvoid main() {}",
        fragment: "// @duplicate-variant-test\nvoid main() {}",
        variants: [{ name: "base" }, { name: "base" }]
      })
    ).toThrow(/variant is already registered/);
  });

  it("rejects include cycles", () => {
    const preprocessor = new ShaderPreprocessor();
    const includes = new Map([
      ["a", "#include <b>"],
      ["b", "#include <a>"]
    ]);

    expect(() => preprocessor.preprocess("#include <a>", { includes })).toThrow(/Circular shader include/);
  });

  it("expands shader variants with source maps for root and included lines", () => {
    const preprocessor = new ShaderPreprocessor();
    const includes = new Map([
      ["lighting", "vec3 lit = vec3(1.0);\n#ifdef USE_SHADOWS\nlit *= 0.5;\n#endif"]
    ]);

    const result = preprocessor.preprocess(
      [
        "// marker",
        "#include <lighting>",
        "#if USE_FOG",
        "vec3 fog = lit;",
        "#else",
        "vec3 fog = vec3(0.0);",
        "#endif"
      ].join("\n"),
      {
        includes,
        defines: {
          USE_SHADOWS: true,
          USE_FOG: 1
        }
      }
    );

    expect(result.included).toEqual(["lighting"]);
    expect(result.source).toContain("#define USE_SHADOWS 1");
    expect(result.source).toContain("lit *= 0.5;");
    expect(result.source).toContain("vec3 fog = lit;");
    expect(result.source).not.toContain("vec3 fog = vec3(0.0);");
    expect(result.sourceMap).toContainEqual({ generatedLine: 1, sourceName: "<defines>", sourceLine: 1 });
    expect(result.sourceMap).toContainEqual(expect.objectContaining({ sourceName: "lighting", sourceLine: 1 }));
    expect(result.sourceMap).toContainEqual(expect.objectContaining({ sourceName: "root", sourceLine: 4 }));
  });

  it("rejects undefined and malformed shader variant conditionals", () => {
    const preprocessor = new ShaderPreprocessor();

    expect(() => preprocessor.preprocess("#if USE_FOG\nvec3 fog;\n#endif")).toThrow(/undefined define USE_FOG/);
    expect(() => preprocessor.preprocess("#if USE_FOG > 0\nvec3 fog;\n#endif", { defines: { USE_FOG: 1 } })).toThrow(/Unsupported shader conditional expression/);
    expect(() => preprocessor.preprocess("#else\nvec3 color;\n")).toThrow(/#else without matching #if/);
    expect(() => preprocessor.preprocess("#if 1\nvec3 color;\n")).toThrow(/missing #endif/);
  });

  it("reflects shader module attributes and uniforms with types, locations, arrays, and source lines", () => {
    const module = new ShaderModule({
      label: "reflection-unit",
      marker: "@galileo3d-shader:reflection-unit",
      vertex: [
        "#version 300 es",
        "// @galileo3d-shader:reflection-unit",
        "layout(location = 4) in vec4 a_color;",
        "/* in vec3 a_commented; */",
        "in vec3 a_position;",
        "uniform mat4 u_modelViewProjection;",
        "uniform vec4 u_jointMatrices[64];"
      ].join("\n"),
      fragment: [
        "#version 300 es",
        "// @galileo3d-shader:reflection-unit",
        "precision highp float;",
        "in vec4 v_color;",
        "uniform vec4 u_baseColor;",
        "uniform sampler2D u_albedo;",
        "out vec4 outColor;"
      ].join("\n")
    });

    expect([...module.reflection.attributes.entries()]).toEqual([
      ["a_color", 4],
      ["a_position", 0]
    ]);
    expect(module.reflection.attributes.has("v_color")).toBe(false);
    expect(module.reflection.attributes.has("a_commented")).toBe(false);
    expect(module.reflection.attributeDetails.get("a_color")).toEqual({
      name: "a_color",
      type: "vec4",
      location: 4,
      source: "vertex",
      line: 3
    });
    expect(module.reflection.attributeDetails.get("a_position")).toMatchObject({ type: "vec3", location: 0, line: 5 });
    expect(module.reflection.uniformDetails.get("u_jointMatrices")).toEqual({
      name: "u_jointMatrices",
      type: "vec4",
      arraySize: 64,
      source: "vertex",
      line: 7
    });
    expect(module.reflection.uniformDetails.get("u_baseColor")).toMatchObject({ type: "vec4", arraySize: null, source: "fragment", line: 5 });
    expect(module.reflection.uniformDetails.get("u_albedo")).toMatchObject({ type: "sampler2D", source: "fragment" });
  });
});
