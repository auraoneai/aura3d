import { describe, expect, it } from "vitest";
import {
  Material,
  MaterialBinding,
  MaterialBindingError,
  MaterialInstance,
  MockRenderDevice,
  Texture,
  TextureBinding,
  UnlitMaterial,
  createDefaultShaderLibrary,
  DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
  DEFAULT_UNLIT_SHADER_NAME
} from "../../../packages/rendering/src";

describe("MaterialBinding", () => {
  it("binds unlit material uniforms to the reflected default shader", () => {
    const device = new MockRenderDevice();
    const library = createDefaultShaderLibrary();
    const shader = device.createShaderProgram(library.compileSource(DEFAULT_UNLIT_SHADER_NAME));
    const material = new UnlitMaterial({ color: [1, 0, 0, 1] });

    const result = new MaterialBinding().bind(material, shader);

    expect([...result.uniforms.keys()]).toContain("u_baseColor");
    expect([...result.uniforms.keys()]).toContain("u_modelViewProjection");
  });

  it("binds material instance overrides and keeps base parameters isolated", () => {
    const device = new MockRenderDevice();
    const library = createDefaultShaderLibrary();
    const shader = device.createShaderProgram(library.compileSource(DEFAULT_UNLIT_SHADER_NAME));
    const base = new UnlitMaterial({ color: [0.2, 0.3, 0.4, 1] });
    const instance = new MaterialInstance(base);
    instance.setOverride("u_baseColor", [0.8, 0.1, 0.2, 1]);

    const result = new MaterialBinding().bind(instance, shader);

    expect(result.uniforms.get("u_baseColor")).toEqual([0.8, 0.1, 0.2, 1]);
    expect(base.getParameter("u_baseColor")).toEqual([0.2, 0.3, 0.4, 1]);
    expect(instance.getParameter("u_baseColor")).toEqual([0.8, 0.1, 0.2, 1]);
    instance.clearOverride("u_baseColor");
    expect(instance.getParameter("u_baseColor")).toEqual([0.2, 0.3, 0.4, 1]);
  });

  it("tracks material instance dirtiness independently from shared base materials", () => {
    const base = new UnlitMaterial({ color: [0.2, 0.3, 0.4, 1] });
    const first = new MaterialInstance(base);
    const second = new MaterialInstance(base);

    first.markClean();
    second.markClean();
    expect(first.isDirty()).toBe(false);
    expect(second.isDirty()).toBe(false);

    base.setParameter("u_baseColor", [0.6, 0.4, 0.2, 1]);
    expect(first.isDirty()).toBe(true);
    expect(second.isDirty()).toBe(true);

    first.markClean();
    expect(first.isDirty()).toBe(false);
    expect(second.isDirty()).toBe(true);
    expect(base.isDirty()).toBe(true);

    second.markClean();
    expect(second.isDirty()).toBe(false);
    expect(base.isDirty()).toBe(true);

    base.markClean();
    first.setOverride("u_baseColor", [0.1, 0.8, 0.3, 1]);
    expect(first.isDirty()).toBe(true);
    expect(second.isDirty()).toBe(false);
    first.markClean();
    first.clearOverride("u_baseColor");
    expect(first.isDirty()).toBe(true);
    expect(second.isDirty()).toBe(false);
  });

  it("reports missing uniforms explicitly", () => {
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({
      label: "bad",
      marker: "@bad",
      vertex: "// @bad\nin vec3 a_position; void main() {}",
      fragment: "// @bad\nvoid main() {}"
    });
    const material = new UnlitMaterial();

    expect(() => new MaterialBinding().bind(material, shader)).toThrow(MaterialBindingError);
  });

  it("rejects missing schema parameters instead of silently binding defaults", () => {
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({
      label: "schema",
      marker: "@schema",
      vertex: "// @schema\nin vec3 a_position; uniform vec4 u_color; void main() {}",
      fragment: "// @schema\nuniform vec4 u_color; out vec4 outColor; void main() { outColor = u_color; }"
    });
    const material = new Material({
      shaderKey: "schema",
      requiredAttributes: ["a_position"],
      uniformSchema: [{ name: "u_color", kind: "vec4" }]
    });

    let diagnostics: readonly string[] = [];
    try {
      new MaterialBinding().bind(material, shader);
    } catch (error) {
      diagnostics = (error as MaterialBindingError).diagnostics;
    }

    expect(diagnostics).toContain("Missing material parameter: u_color");
    expect(diagnostics).toContain("Missing material parameter declared by schema: u_color");
  });

  it("validates material uniform schema arity and texture diagnostics", () => {
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({
      label: "schema",
      marker: "@schema",
      vertex:
        "// @schema\nin vec3 a_position; uniform mat4 u_modelViewProjection; uniform sampler2D u_albedo; void main() {}",
      fragment: "// @schema\nuniform sampler2D u_albedo; out vec4 outColor; void main() { outColor = vec4(1.0); }"
    });
    const material = new Material({
      shaderKey: "schema",
      requiredAttributes: ["a_position"],
      parameters: {
        u_modelViewProjection: [1, 0, 0],
        u_albedo: new TextureBinding({ name: "u_albedo", required: true })
      },
      uniformSchema: [
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_albedo", kind: "texture2d" }
      ]
    });

    let diagnostics: readonly string[] = [];
    try {
      new MaterialBinding().bind(material, shader);
    } catch (error) {
      diagnostics = (error as MaterialBindingError).diagnostics;
    }

    expect(diagnostics).toContain("Material uniform u_modelViewProjection must be mat4 with 16 scalar values, got 3");
    expect(diagnostics).toContain("Missing required texture: u_albedo");
  });

  it("reports present but unready texture bindings as fatal diagnostics", () => {
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({
      label: "unready-texture",
      marker: "@unready-texture",
      vertex: "// @unready-texture\nin vec3 a_position; uniform sampler2D u_albedo; void main() {}",
      fragment: "// @unready-texture\nuniform sampler2D u_albedo; out vec4 outColor; void main() { outColor = vec4(1.0); }"
    });
    const material = new Material({
      shaderKey: "unready-texture",
      requiredAttributes: ["a_position"],
      parameters: {
        u_albedo: new TextureBinding({ name: "u_albedo", texture: new Texture({ width: 1, height: 1 }), required: true, ready: false })
      },
      uniformSchema: [{ name: "u_albedo", kind: "texture2d" }]
    });

    let diagnostics: readonly string[] = [];
    try {
      new MaterialBinding().bind(material, shader);
    } catch (error) {
      diagnostics = (error as MaterialBindingError).diagnostics;
    }

    expect(diagnostics).toContain("Texture is not ready: u_albedo");
  });

  it("reports texture dimension mismatches as fatal diagnostics", () => {
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({
      label: "cube-texture-dimension",
      marker: "@cube-texture-dimension",
      vertex: "// @cube-texture-dimension\nin vec3 a_position; uniform samplerCube u_environment; void main() {}",
      fragment: "// @cube-texture-dimension\nuniform samplerCube u_environment; out vec4 outColor; void main() { outColor = vec4(1.0); }"
    });
    const material = new Material({
      shaderKey: "cube-texture-dimension",
      requiredAttributes: ["a_position"],
      parameters: {
        u_environment: new TextureBinding({
          name: "u_environment",
          texture: new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }),
          expectedDimension: "cube",
          required: true
        })
      },
      uniformSchema: [{ name: "u_environment", kind: "textureCube" }]
    });

    let diagnostics: readonly string[] = [];
    try {
      new MaterialBinding().bind(material, shader);
    } catch (error) {
      diagnostics = (error as MaterialBindingError).diagnostics;
    }

    expect(diagnostics).toContain("Texture u_environment dimension must be cube, got 2d");
  });

  it("reports optional missing texture fallbacks as non-fatal diagnostics", () => {
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({
      label: "optional-texture",
      marker: "@optional-texture",
      vertex: "// @optional-texture\nin vec3 a_position; uniform sampler2D u_albedo; void main() {}",
      fragment: "// @optional-texture\nuniform sampler2D u_albedo; out vec4 outColor; void main() { outColor = vec4(1.0); }"
    });
    const material = new Material({
      shaderKey: "optional-texture",
      requiredAttributes: ["a_position"],
      parameters: {
        u_albedo: new TextureBinding({ name: "u_albedo" })
      },
      uniformSchema: [{ name: "u_albedo", kind: "texture2d" }]
    });

    const result = new MaterialBinding().bind(material, shader);

    expect(result.diagnostics).toContain("Optional texture is not bound; using fallback texture: u_albedo");
    expect(result.warnings).toEqual(result.diagnostics);
  });

  it("binds texture transform uniforms and validates transform metadata", () => {
    const device = new MockRenderDevice();
    const library = createDefaultShaderLibrary();
    const shader = device.createShaderProgram(library.compileSource(DEFAULT_TEXTURED_UNLIT_SHADER_NAME));
    const texture = new (class extends TextureBinding {
      constructor() {
        super({ name: "u_baseColorTexture", transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: Math.PI / 2 } });
      }
    })();
    const material = new Material({
      shaderKey: DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
      requiredAttributes: ["a_position", "a_uv"],
      parameters: {
        u_baseColor: [1, 1, 1, 1],
        u_baseColorTexture: texture,
        u_baseColorTextureOffset: texture.offset,
        u_baseColorTextureScale: texture.scale,
        u_baseColorTextureRotation: texture.rotation,
        u_modelViewProjection: new Float32Array(16)
      },
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_baseColorTexture", kind: "texture2d" },
        { name: "u_baseColorTextureOffset", kind: "vec2" },
        { name: "u_baseColorTextureScale", kind: "vec2" },
        { name: "u_baseColorTextureRotation", kind: "float" },
        { name: "u_modelViewProjection", kind: "mat4" }
      ]
    });

    const result = new MaterialBinding().bind(material, shader);

    expect(result.uniforms.get("u_baseColorTextureOffset")).toEqual([0.25, 0.5]);
    expect(result.uniforms.get("u_baseColorTextureScale")).toEqual([2, 3]);
    expect(texture.transformUV([0.5, 0])).toEqual([0.25000000000000006, 1.5]);
    expect(new TextureBinding({ name: "bad", transform: { rotation: Number.NaN } }).validate().diagnostics).toContain("Texture transform must contain finite values: bad");
  });
});
