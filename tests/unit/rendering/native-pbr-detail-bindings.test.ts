import { describe, expect, it } from "vitest";
import { MaterialBinding } from "../../../packages/rendering/src/MaterialBinding";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { SkinnedLitMaterial } from "../../../packages/rendering/src/SkinnedLitMaterial";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { Texture } from "../../../packages/rendering/src/Texture";
import { isTextureBinding, TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { rgba8TextureInternalFormat, textureStorageInternalFormat } from "../../../packages/rendering/src/webgl2/TextureFormats";

const pixels = () => new Uint8Array([128, 64, 32, 255]);
const linear = () => new Texture({ width: 1, height: 1, colorSpace: "linear", data: pixels() });
const makeShader = (device: MockRenderDevice) => device.createShaderProgram({
  label: "binding-test", marker: "@binding-test",
  vertex: "// @binding-test\nin vec3 a_position; void main() { gl_Position = vec4(a_position, 1.0); }",
  fragment: "// @binding-test\nout vec4 outColor; void main() { outColor = vec4(1.0); }"
});

describe("physical material color and detail map bindings", () => {
  it("preserves linear storage and sRGB texture encodings through generated binding", () => {
    const storage = new Texture({ width: 1, height: 1, colorSpace: "linear", usage: ["sampled", "storage", "copy-dst"] });
    const srgb = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: pixels() });
    // Partial GL double: only the three format enums the helpers read, with their real values.
    const formats: Pick<WebGL2RenderingContext, "SRGB8_ALPHA8" | "RGBA" | "RGBA8"> = { SRGB8_ALPHA8: 0x8c43, RGBA: 0x1908, RGBA8: 0x8058 };
    const gl = formats as WebGL2RenderingContext;
    const device = new MockRenderDevice();
    const shader = makeShader(device);
    for (const texture of [storage, srgb]) {
      const material = new TexturedPBRMaterial({ baseColorTexture: texture });
      const original = material.getParameter("u_baseColorTexture");
      expect(isTextureBinding(original)).toBe(true);
      if (!isTextureBinding(original)) throw new Error("missing base-color binding");
      expect(original.texture).toBe(texture);
      expect(original.validate().ok).toBe(true);
      const bound = new MaterialBinding().bindGenerated(material, shader).uniforms.get("u_baseColorMap");
      expect(isTextureBinding(bound) && bound.texture).toBe(texture);
      expect(isTextureBinding(bound) && bound.validate().ok).toBe(true);
      material.dispose();
    }
    expect(storage.colorSpace).toBe("linear");
    expect(srgb.colorSpace).toBe("srgb");
    expect(textureStorageInternalFormat(gl, storage)).toBe(gl.RGBA8);
    expect(rgba8TextureInternalFormat(gl, srgb)).toBe(gl.SRGB8_ALPHA8);
    expect(srgb.data).toEqual(pixels());
    device.dispose();
  });

  it("allows one declared-linear texture in every color slot without changing its encoding", () => {
    const shared = linear();
    for (const [option, uniform] of [
      ["baseColorTexture", "u_baseColorTexture"],
      ["emissiveTexture", "u_emissiveTexture"],
      ["diffuseTransmissionColorTexture", "u_diffuseTransmissionColorTexture"],
      ["specularColorTexture", "u_specularColorTexture"],
      ["sheenColorTexture", "u_sheenColorTexture"]
    ] as const) {
      const material = new TexturedPBRMaterial({ [option]: shared });
      const value = material.getParameter(uniform);
      expect(isTextureBinding(value)).toBe(true);
      if (!isTextureBinding(value)) throw new Error(`missing ${uniform}`);
      expect(value.texture).toBe(shared);
      expect(value.validate().ok).toBe(true);
      material.dispose();
    }
    expect(shared.colorSpace).toBe("linear");
    expect(shared.data).toEqual(pixels());
  });

  it("provides neutral defaults without allocating detail samplers", () => {
    for (const material of [new PBRMaterial(), new InstancedPBRMaterial(), new SkinnedLitMaterial(), new TexturedPBRMaterial()]) {
      expect(material.getParameter("u_diffuseRoughness")).toBe(0);
      expect(material.getParameter("u_retroreflection")).toBe(0);
      expect(material.getParameter("u_bumpFactor")).toBe(0);
      for (const map of ["u_diffuseRoughnessTexture", "u_bumpTexture"]) {
        expect(material.getParameter(map)).toBeUndefined();
        expect(material.getParameter(`${map}Enabled`)).toBe(0);
        expect(material.getParameter(`${map}Offset`)).toEqual([0, 0]);
        expect(material.getParameter(`${map}Scale`)).toEqual([1, 1]);
        expect(material.getParameter(`${map}Rotation`)).toBe(0);
        expect(material.getParameter(`${map}TexCoord`)).toBe(0);
        expect(material.uniformSchema.find((entry) => entry.name === map)).toMatchObject({ kind: "texture2d", required: false });
      }
      material.dispose();
    }
  });

  it("carries factors, linear textures, samplers, transforms and UV selection across material families", () => {
    const rough = linear();
    const bump = linear();
    const sampler = new Sampler({ addressU: "repeat", addressV: "mirror-repeat" });
    const transform = { offset: [0.25, 0.5] as const, scale: [2, 3] as const, rotation: 0.4 };
    const binding = (name: string, texture: Texture) => new TextureBinding({ name, texture, sampler, transform });
    const options = {
      diffuseRoughness: 0.6, retroreflection: 0.3, bumpFactor: 2.5,
      diffuseRoughnessTexture: binding("source-roughness", rough), bumpTexture: binding("source-bump", bump),
      diffuseRoughnessTextureTexCoord: 1, bumpTextureTexCoord: 0
    };
    const materials = [
      new PBRMaterial(options),
      new InstancedPBRMaterial(options),
      new SkinnedLitMaterial(options),
      new TexturedPBRMaterial({
        diffuseRoughness: 0.6, retroreflection: 0.3, bumpFactor: 2.5,
        diffuseRoughnessTexture: rough, bumpTexture: bump,
        diffuseRoughnessSampler: sampler, bumpSampler: sampler,
        diffuseRoughnessTextureTransform: transform, bumpTextureTransform: transform,
        textureTexCoords: { diffuseRoughness: 1, bump: 0 }
      })
    ];
    for (const material of materials) {
      expect(material.getParameter("u_diffuseRoughness")).toBe(0.6);
      expect(material.getParameter("u_retroreflection")).toBe(0.3);
      expect(material.getParameter("u_bumpFactor")).toBe(2.5);
      expect(material.requiredAttributes).toContain("a_uv");
      expect(material.requiredAttributes).toContain("a_uv1");
      for (const [name, texture, coord] of [["u_diffuseRoughnessTexture", rough, 1], ["u_bumpTexture", bump, 0]] as const) {
        const actual = material.getParameter(name);
        expect(isTextureBinding(actual)).toBe(true);
        if (!isTextureBinding(actual)) throw new Error(`missing ${name}`);
        expect(actual.texture).toBe(texture);
        expect(actual.sampler).toBe(sampler);
        expect(actual.expectedColorSpace).toBe("linear");
        expect(actual.validate().ok).toBe(true);
        expect(material.getParameter(`${name}Enabled`)).toBe(1);
        expect(material.getParameter(`${name}Offset`)).toEqual(transform.offset);
        expect(material.getParameter(`${name}Scale`)).toEqual(transform.scale);
        expect(material.getParameter(`${name}Rotation`)).toBe(transform.rotation);
        expect(material.getParameter(`${name}TexCoord`)).toBe(coord);
      }
      material.dispose();
    }
  });

  it("rejects invalid detail factors, UV indices and sRGB data maps", () => {
    expect(() => new PBRMaterial({ diffuseRoughness: 1.01 })).toThrow(/diffuseRoughness/);
    expect(() => new PBRMaterial({ retroreflection: -0.1 })).toThrow(/retroreflection/);
    expect(() => new SkinnedLitMaterial({ bumpFactor: -1 })).toThrow(/bumpFactor/);
    expect(() => new InstancedPBRMaterial({ bumpFactor: 101 })).toThrow(/bumpFactor/);
    expect(() => new TexturedPBRMaterial({ textureTexCoords: { bump: 2 } })).toThrow(/texCoord/);
    const wrong = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: pixels() });
    const material = new TexturedPBRMaterial({ bumpTexture: wrong });
    const value = material.getParameter("u_bumpTexture");
    expect(isTextureBinding(value) && value.validate().diagnostics).toContain("Texture u_bumpTexture colorSpace must be linear, got srgb");
  });

  it("preserves glTF-style parameter updates through generated material binding", () => {
    const device = new MockRenderDevice();
    const shader = makeShader(device);
    const material = new PBRMaterial();
    const texture = linear();
    const binding = new TextureBinding({ name: "u_bumpTexture", texture, expectedColorSpace: "linear" });
    material.setParameter("u_bumpFactor", 3);
    material.setParameter("u_bumpTexture", binding);
    material.setParameter("u_bumpTextureEnabled", 1);
    material.setParameter("u_bumpTextureOffset", [0.2, 0.4]);
    const uniforms = new MaterialBinding().bindGenerated(material, shader).uniforms;
    expect(uniforms.get("u_bumpFactor")).toBe(3);
    expect(uniforms.get("u_bumpTexture")).toBe(binding);
    expect(uniforms.get("u_bumpTextureEnabled")).toBe(1);
    expect(uniforms.get("u_bumpTextureOffset")).toEqual([0.2, 0.4]);
    device.dispose();
  });
});
