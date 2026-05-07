import { describe, expect, it } from "vitest";
import { Scene, PointLight, SpotLight } from "@galileo3d/scene";
import { Vector3 } from "@galileo3d/math";
import {
  DEFAULT_PBR_SHADER_NAME,
  Geometry,
  LightCollector,
  LightUniforms,
  MaterialBinding,
  MaterialBindingError,
  MockRenderDevice,
  NormalMappedPBRMaterial,
  PBRMaterial,
  Renderer,
  Sampler,
  Texture,
  TextureBinding,
  TexturedPBRMaterial,
  UniformLayout,
  createDefaultShaderLibrary
} from "../../../packages/rendering/src";

describe("PBR material and direct light contracts", () => {
  it("binds public PBR material uniforms against the canonical direct-light shader", () => {
    const library = createDefaultShaderLibrary();
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram(library.compileSource(DEFAULT_PBR_SHADER_NAME));
    const material = new PBRMaterial({
      baseColor: [0.8, 0.2, 0.1, 1],
      metallic: 0.25,
      roughness: 0.6,
      environmentColor: [0.25, 0.35, 0.45],
      environmentIntensity: 0.4,
      proceduralEnvironmentMap: {
        skyColor: [0.18, 0.32, 0.74],
        horizonColor: [0.72, 0.62, 0.42],
        groundColor: [0.05, 0.06, 0.07],
        specularColor: [1, 0.92, 0.74],
        intensity: 0.55,
        specularIntensity: 0.35
      },
      environmentMapTexture: new TextureBinding({
        name: "u_environmentMapTexture",
        texture: new Texture({ width: 2, height: 1, colorSpace: "srgb", data: new Uint8Array([16, 64, 255, 255, 255, 180, 80, 255]) }),
        sampler: new Sampler({ addressU: "repeat" }),
        expectedColorSpace: "srgb",
        required: true
      }),
      environmentMapIntensity: 0.45,
      environmentMapSpecularIntensity: 0.2,
      environmentMapRotation: 0.15,
      environmentMapMipCount: 2,
      environmentBrdfLutTexture: new TextureBinding({
        name: "u_environmentBrdfLutTexture",
        texture: new Texture({ width: 2, height: 2, colorSpace: "linear", data: new Uint8Array([
          255, 255, 255, 255, 220, 220, 220, 255,
          180, 180, 180, 255, 120, 120, 120, 255
        ]) }),
        expectedColorSpace: "linear",
        required: true
      }),
      emissiveColor: [0.1, 0.2, 0.3],
      emissiveStrength: 2.5,
      clearcoatFactor: 0.4,
      clearcoatRoughnessFactor: 0.2,
      transmissionFactor: 0.15,
      volumeThicknessFactor: 0.3,
      volumeAttenuationDistance: 4,
      volumeAttenuationColor: [0.7, 0.8, 0.9],
      ior: 1.45,
      specularFactor: 0.8,
      specularColorFactor: [0.9, 0.85, 0.8],
      sheenColorFactor: [0.2, 0.1, 0.05],
      sheenRoughnessFactor: 0.35,
      anisotropyStrength: 0.6,
      anisotropyRotation: 1.2,
      iridescenceFactor: 0.55,
      iridescenceIor: 1.4,
      iridescenceThicknessMinimum: 120,
      iridescenceThicknessMaximum: 520,
      dispersion: 8
    });

    const binding = new MaterialBinding().bind(material, shader);

    expect(binding.uniforms.get("u_baseColor")).toEqual([0.8, 0.2, 0.1, 1]);
    expect(binding.uniforms.get("u_metallic")).toBe(0.25);
    expect(binding.uniforms.get("u_roughness")).toBe(0.6);
    expect(binding.uniforms.get("u_environmentColor")).toEqual([0.25, 0.35, 0.45]);
    expect(binding.uniforms.get("u_environmentIntensity")).toBe(0.4);
    expect(binding.uniforms.get("u_environmentSkyColor")).toEqual([0.18, 0.32, 0.74]);
    expect(binding.uniforms.get("u_environmentHorizonColor")).toEqual([0.72, 0.62, 0.42]);
    expect(binding.uniforms.get("u_environmentGroundColor")).toEqual([0.05, 0.06, 0.07]);
    expect(binding.uniforms.get("u_environmentSpecularColor")).toEqual([1, 0.92, 0.74]);
    expect(binding.uniforms.get("u_environmentMapIntensity")).toBe(0.55);
    expect(binding.uniforms.get("u_environmentSpecularIntensity")).toBe(0.35);
    expect(binding.uniforms.get("u_environmentMapTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_environmentMapTextureEnabled")).toBe(1);
    expect(binding.uniforms.get("u_environmentMapTextureIntensity")).toBe(0.45);
    expect(binding.uniforms.get("u_environmentMapTextureSpecularIntensity")).toBe(0.2);
    expect(binding.uniforms.get("u_environmentMapTextureRotation")).toBe(0.15);
    expect(binding.uniforms.get("u_environmentMapTextureMipCount")).toBe(2);
    expect(binding.uniforms.get("u_environmentBrdfLutTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_environmentBrdfLutEnabled")).toBe(1);
    expect(binding.uniforms.get("u_emissiveColor")).toEqual([0.1, 0.2, 0.3]);
    expect(binding.uniforms.get("u_emissiveStrength")).toBe(2.5);
    expect(binding.uniforms.get("u_clearcoatFactor")).toBe(0.4);
    expect(binding.uniforms.get("u_clearcoatRoughnessFactor")).toBe(0.2);
    expect(binding.uniforms.get("u_transmissionFactor")).toBe(0.15);
    expect(binding.uniforms.get("u_volumeThicknessFactor")).toBe(0.3);
    expect(binding.uniforms.get("u_volumeAttenuationDistance")).toBe(4);
    expect(binding.uniforms.get("u_volumeAttenuationColor")).toEqual([0.7, 0.8, 0.9]);
    expect(binding.uniforms.get("u_ior")).toBe(1.45);
    expect(binding.uniforms.get("u_specularFactor")).toBe(0.8);
    expect(binding.uniforms.get("u_specularColorFactor")).toEqual([0.9, 0.85, 0.8]);
    expect(binding.uniforms.get("u_sheenColorFactor")).toEqual([0.2, 0.1, 0.05]);
    expect(binding.uniforms.get("u_sheenRoughnessFactor")).toBe(0.35);
    expect(binding.uniforms.get("u_anisotropyStrength")).toBe(0.6);
    expect(binding.uniforms.get("u_anisotropyRotation")).toBe(1.2);
    expect(binding.uniforms.get("u_iridescenceFactor")).toBe(0.55);
    expect(binding.uniforms.get("u_iridescenceIor")).toBe(1.4);
    expect(binding.uniforms.get("u_iridescenceThicknessMinimum")).toBe(120);
    expect(binding.uniforms.get("u_iridescenceThicknessMaximum")).toBe(520);
    expect(binding.uniforms.get("u_dispersion")).toBe(8);
    expect(binding.uniforms.has("u_lightData")).toBe(true);
  });

  it("rejects invalid PBR ranges instead of silently clamping", () => {
    expect(() => new PBRMaterial({ metallic: 1.1 })).toThrow(/metallic/);
    expect(() => new PBRMaterial({ roughness: -0.1 })).toThrow(/roughness/);
    expect(() => new PBRMaterial({ environmentColor: [1, -0.1, 1] })).toThrow(/environmentColor/);
    expect(() => new PBRMaterial({ environmentIntensity: -0.1 })).toThrow(/environmentIntensity/);
    expect(() => new PBRMaterial({ environmentMapIntensity: -0.1 })).toThrow(/environmentMapIntensity/);
    expect(() => new PBRMaterial({ environmentMapSpecularIntensity: -0.1 })).toThrow(/environmentMapSpecularIntensity/);
    expect(() => new PBRMaterial({ environmentMapRotation: Number.NaN })).toThrow(/environmentMapRotation/);
    expect(() => new PBRMaterial({ environmentMapMipCount: 0 })).toThrow(/environmentMapMipCount/);
    expect(() => new PBRMaterial({
      proceduralEnvironmentMap: {
        skyColor: [0.1, 0.2, 2],
        horizonColor: [0.5, 0.5, 0.5],
        groundColor: [0.02, 0.02, 0.02],
        specularColor: [1, 1, 1],
        intensity: 0.5,
        specularIntensity: 0.2
      }
    })).toThrow(/proceduralEnvironmentMap.skyColor/);
    expect(() => new PBRMaterial({
      proceduralEnvironmentMap: {
        skyColor: [0.1, 0.2, 0.3],
        horizonColor: [0.5, 0.5, 0.5],
        groundColor: [0.02, 0.02, 0.02],
        specularColor: [1, 1, 1],
        intensity: -0.1,
        specularIntensity: 0.2
      }
    })).toThrow(/proceduralEnvironmentMap.intensity/);
    expect(() => new PBRMaterial({ clearcoatFactor: 1.1 })).toThrow(/clearcoatFactor/);
    expect(() => new PBRMaterial({ ior: 0.9 })).toThrow(/ior/);
    expect(() => new PBRMaterial({ specularColorFactor: [1, 2, 1] })).toThrow(/specularColorFactor/);
    expect(() => new TexturedPBRMaterial({ transmissionFactor: Number.NaN })).toThrow(/transmissionFactor/);
    expect(() => new TexturedPBRMaterial({ volumeThicknessFactor: -0.1 })).toThrow(/volumeThicknessFactor/);
    expect(() => new TexturedPBRMaterial({ volumeAttenuationDistance: 0 })).toThrow(/volumeAttenuationDistance/);
    expect(() => new TexturedPBRMaterial({ volumeAttenuationColor: [1, 1.2, 1] })).toThrow(/volumeAttenuationColor/);
    expect(() => new TexturedPBRMaterial({ sheenRoughnessFactor: -0.1 })).toThrow(/sheenRoughnessFactor/);
    expect(() => new TexturedPBRMaterial({ anisotropyStrength: 1.1 })).toThrow(/anisotropyStrength/);
    expect(() => new TexturedPBRMaterial({ anisotropyRotation: Number.NaN })).toThrow(/anisotropyRotation/);
    expect(() => new TexturedPBRMaterial({ iridescenceFactor: 1.1 })).toThrow(/iridescenceFactor/);
    expect(() => new TexturedPBRMaterial({ iridescenceIor: 0.9 })).toThrow(/iridescenceIor/);
    expect(() => new TexturedPBRMaterial({ iridescenceThicknessMinimum: 600, iridescenceThicknessMaximum: 200 })).toThrow(/iridescenceThicknessMaximum/);
    expect(() => new TexturedPBRMaterial({ dispersion: -0.1 })).toThrow(/dispersion/);
    expect(() => new PBRMaterial({ emissiveStrength: Number.NaN })).toThrow(/emissiveStrength/);
    expect(() => new PBRMaterial({ emissiveStrength: -0.1 })).toThrow(/emissiveStrength/);
  });

  it("applies renderer-level environment lighting uniforms to PBR draws without mutating the material defaults", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new PBRMaterial();

    renderer.render({
      renderItems: [
        {
          geometry: Geometry.litTriangle(),
          material,
          label: "environment-lit-pbr"
        }
      ],
      environmentLighting: {
        color: [0.2, 0.4, 0.8],
        intensity: 0.65,
        proceduralMap: {
          skyColor: [0.12, 0.28, 0.78],
          horizonColor: [0.78, 0.66, 0.48],
          groundColor: [0.04, 0.05, 0.06],
          specularColor: [1, 0.88, 0.68],
          intensity: 0.5,
          specularIntensity: 0.25
        },
        environmentMapTexture: new TextureBinding({
          name: "u_environmentMapTexture",
          texture: new Texture({ width: 2, height: 1, colorSpace: "srgb", data: new Uint8Array([8, 80, 255, 255, 255, 190, 64, 255]) }),
          sampler: new Sampler({ addressU: "repeat" }),
          expectedColorSpace: "srgb",
          required: true
        }),
        environmentMapIntensity: 0.42,
        environmentMapSpecularIntensity: 0.18,
        environmentMapRotation: 0.2,
        environmentMapMipCount: 2,
        environmentBrdfLutTexture: new TextureBinding({
          name: "u_environmentBrdfLutTexture",
          texture: new Texture({ width: 2, height: 2, colorSpace: "linear", data: new Uint8Array([
            255, 255, 255, 255, 220, 220, 220, 255,
            160, 160, 160, 255, 110, 110, 110, 255
          ]) }),
          expectedColorSpace: "linear",
          required: true
        })
      }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.uniforms?.get("u_environmentColor")).toEqual([0.2, 0.4, 0.8]);
    expect(command?.uniforms?.get("u_environmentIntensity")).toBe(0.65);
    expect(command?.uniforms?.get("u_environmentSkyColor")).toEqual([0.12, 0.28, 0.78]);
    expect(command?.uniforms?.get("u_environmentHorizonColor")).toEqual([0.78, 0.66, 0.48]);
    expect(command?.uniforms?.get("u_environmentGroundColor")).toEqual([0.04, 0.05, 0.06]);
    expect(command?.uniforms?.get("u_environmentSpecularColor")).toEqual([1, 0.88, 0.68]);
    expect(command?.uniforms?.get("u_environmentMapIntensity")).toBe(0.5);
    expect(command?.uniforms?.get("u_environmentSpecularIntensity")).toBe(0.25);
    expect(command?.uniforms?.get("u_environmentMapTexture")).toBeInstanceOf(TextureBinding);
    expect(command?.uniforms?.get("u_environmentMapTextureEnabled")).toBe(1);
    expect(command?.uniforms?.get("u_environmentMapTextureIntensity")).toBe(0.42);
    expect(command?.uniforms?.get("u_environmentMapTextureSpecularIntensity")).toBe(0.18);
    expect(command?.uniforms?.get("u_environmentMapTextureRotation")).toBe(0.2);
    expect(command?.uniforms?.get("u_environmentMapTextureMipCount")).toBe(2);
    expect(command?.uniforms?.get("u_environmentBrdfLutTexture")).toBeInstanceOf(TextureBinding);
    expect(command?.uniforms?.get("u_environmentBrdfLutEnabled")).toBe(1);
    expect(material.environmentColor).toEqual([1, 1, 1]);
    expect(material.environmentIntensity).toBe(0);
    expect(material.proceduralEnvironmentMap.intensity).toBe(0);
    expect(material.proceduralEnvironmentMap.specularIntensity).toBe(0);
    expect(material.environmentMapTexture).toBeNull();
    expect(material.environmentMapIntensity).toBe(0);
    expect(material.environmentMapSpecularIntensity).toBe(0);
    expect(material.environmentMapMipCount).toBe(1);
    expect(material.environmentBrdfLutTexture).toBeNull();
    renderer.dispose();
  });

  it("packs uniform fields with 16-byte vector alignment", () => {
    const layout = new UniformLayout([
      { name: "count", type: "float" },
      { name: "color", type: "vec4" },
      { name: "matrix", type: "mat4" }
    ]);

    expect(layout.getField("count").offset).toBe(0);
    expect(layout.getField("color").offset).toBe(16);
    expect(layout.getField("matrix").offset).toBe(32);
    expect(layout.byteLength).toBe(96);
  });

  it("reports missing required texture bindings", () => {
    const missing = new TextureBinding({ name: "baseColorTexture", required: true });
    const present = new TextureBinding({ name: "normalTexture", texture: new Texture({ width: 1, height: 1 }), required: true });

    expect(missing.validate()).toEqual({
      ok: false,
      diagnostics: ["Missing required texture: baseColorTexture"],
      warnings: []
    });
    expect(present.validate().ok).toBe(true);
  });

  it("validates PBR texture color-space contracts", () => {
    const library = createDefaultShaderLibrary();
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram(library.compileSource("galileo3d/pbr-textured"));
    const material = new TexturedPBRMaterial({
      baseColorTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 255, 255, 255]) }),
      normalTexture: new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([128, 128, 255, 255]) }),
      metallicRoughnessTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 128, 0, 255]) }),
      occlusionTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 255, 255, 255]) }),
      emissiveTexture: new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([0, 0, 0, 255]) })
    });

    let diagnostics: readonly string[] = [];
    try {
      new MaterialBinding().bind(material, shader);
    } catch (error) {
      diagnostics = (error as MaterialBindingError).diagnostics;
    }

    expect(diagnostics).toContain("Texture u_baseColorTexture colorSpace must be srgb, got linear");
    expect(diagnostics).toContain("Texture u_normalTexture colorSpace must be linear, got srgb");
    expect(new TextureBinding({
      name: "metallicRoughness",
      texture: new Texture({ width: 1, height: 1, colorSpace: "srgb" }),
      expectedColorSpace: "linear"
    }).validate().diagnostics).toContain("Texture metallicRoughness colorSpace must be linear, got srgb");
  });

  it("binds a normal-mapped PBR material with required UVs and normal texture uniforms", () => {
    const library = createDefaultShaderLibrary();
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram(library.compileSource("galileo3d/pbr-normal-map"));
    const material = new NormalMappedPBRMaterial({
      baseColor: [0.7, 0.7, 0.7, 1],
      normalTexture: new Texture({
        width: 1,
        height: 1,
        data: new Uint8Array([128, 128, 255, 255])
      }),
      normalSampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }),
      normalScale: 0.75
    });

    const binding = new MaterialBinding().bind(material, shader);

    expect(material.requiredAttributes).toEqual(["a_position", "a_normal", "a_tangent", "a_uv"]);
    expect(binding.uniforms.get("u_normalScale")).toBe(0.75);
    expect(binding.uniforms.get("u_normalTexture")).toBeInstanceOf(TextureBinding);
  });

  it("binds textured PBR material slots for glTF base-color, normal, metallic-roughness, occlusion, and emissive textures", () => {
    const library = createDefaultShaderLibrary();
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram(library.compileSource("galileo3d/pbr-textured"));
    const material = new TexturedPBRMaterial({
      baseColor: [0.5, 0.6, 0.7, 1],
      baseColorTexture: new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([255, 128, 64, 255]) }),
      baseColorSampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }),
      baseColorTextureTransform: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.25 },
      normalTexture: new Texture({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]) }),
      normalTextureTransform: { offset: [0.1, 0.2], scale: [1, 1], rotation: 0 },
      normalScale: 0.6,
      metallicRoughnessTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 180, 64, 255]) }),
      metallicRoughnessTextureTransform: { offset: [0.5, 0.25], scale: [1.5, 1.25], rotation: 0.1 },
      occlusionTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 255, 255, 255]) }),
      occlusionTextureTransform: { offset: [0.05, 0.15], scale: [0.75, 0.5], rotation: 0.2 },
      occlusionStrength: 0.4,
      emissiveColor: [0.2, 0.3, 0.4],
      emissiveStrength: 3,
      emissiveTexture: new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([20, 30, 40, 255]) }),
      emissiveTextureTransform: { offset: [0.2, 0.1], scale: [2, 2], rotation: 0.3 },
      clearcoatFactor: 0.6,
      clearcoatTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([180, 255, 255, 255]) }),
      clearcoatTextureTransform: { offset: [0.11, 0.12], scale: [1.1, 1.2], rotation: 0.13 },
      clearcoatRoughnessFactor: 0.25,
      clearcoatRoughnessTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 90, 255, 255]) }),
      clearcoatRoughnessTextureTransform: { offset: [0.21, 0.22], scale: [1.3, 1.4], rotation: 0.23 },
      clearcoatNormalTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]) }),
      clearcoatNormalTextureTransform: { offset: [0.31, 0.32], scale: [1.5, 1.6], rotation: 0.33 },
      clearcoatNormalScale: 0.5,
      transmissionFactor: 0.1,
      transmissionTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([80, 255, 255, 255]) }),
      transmissionTextureTransform: { offset: [0.41, 0.42], scale: [1.7, 1.8], rotation: 0.43 },
      volumeThicknessFactor: 0.3,
      volumeThicknessTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 90, 255, 255]) }),
      volumeThicknessTextureTransform: { offset: [0.44, 0.45], scale: [1.45, 1.55], rotation: 0.46 },
      volumeAttenuationDistance: 5,
      volumeAttenuationColor: [0.7, 0.8, 0.9],
      ior: 1.33,
      specularFactor: 0.7,
      specularTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 255, 255, 128]) }),
      specularTextureTransform: { offset: [0.51, 0.52], scale: [1.9, 2], rotation: 0.53 },
      specularColorFactor: [0.8, 0.9, 1],
      specularColorTexture: new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([200, 220, 240, 255]) }),
      specularColorTextureTransform: { offset: [0.61, 0.62], scale: [2.1, 2.2], rotation: 0.63 },
      sheenColorFactor: [0.2, 0.3, 0.4],
      sheenColorTexture: new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([20, 30, 40, 255]) }),
      sheenColorTextureTransform: { offset: [0.71, 0.72], scale: [2.3, 2.4], rotation: 0.73 },
      sheenRoughnessFactor: 0.45,
      sheenRoughnessTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 255, 255, 115]) }),
      sheenRoughnessTextureTransform: { offset: [0.81, 0.82], scale: [2.5, 2.6], rotation: 0.83 },
      anisotropyStrength: 0.5,
      anisotropyTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 150, 220, 255]) }),
      anisotropyTextureTransform: { offset: [0.91, 0.92], scale: [2.7, 2.8], rotation: 0.93 },
      iridescenceFactor: 0.65,
      iridescenceTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([190, 255, 255, 255]) }),
      iridescenceTextureTransform: { offset: [1.01, 1.02], scale: [2.9, 3], rotation: 1.03 },
      iridescenceIor: 1.45,
      iridescenceThicknessMinimum: 150,
      iridescenceThicknessMaximum: 650,
      iridescenceThicknessTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 120, 255, 255]) }),
      iridescenceThicknessTextureTransform: { offset: [1.11, 1.12], scale: [3.1, 3.2], rotation: 1.13 },
      dispersion: 12
    });

    const binding = new MaterialBinding().bind(material, shader);

    expect(material.requiredAttributes).toEqual(["a_position", "a_normal", "a_tangent", "a_uv"]);
    expect(binding.uniforms.get("u_baseColorTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_normalTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_metallicRoughnessTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_occlusionTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_emissiveTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_baseColorTextureOffset")).toEqual([0.25, 0.5]);
    expect(binding.uniforms.get("u_baseColorTextureScale")).toEqual([2, 3]);
    expect(binding.uniforms.get("u_baseColorTextureRotation")).toBe(0.25);
    expect(binding.uniforms.get("u_normalTextureOffset")).toEqual([0.1, 0.2]);
    expect(binding.uniforms.get("u_normalScale")).toBe(0.6);
    expect(binding.uniforms.get("u_metallicRoughnessTextureOffset")).toEqual([0.5, 0.25]);
    expect(binding.uniforms.get("u_metallicRoughnessTextureScale")).toEqual([1.5, 1.25]);
    expect(binding.uniforms.get("u_metallicRoughnessTextureRotation")).toBe(0.1);
    expect(binding.uniforms.get("u_occlusionTextureOffset")).toEqual([0.05, 0.15]);
    expect(binding.uniforms.get("u_occlusionTextureScale")).toEqual([0.75, 0.5]);
    expect(binding.uniforms.get("u_occlusionTextureRotation")).toBe(0.2);
    expect(binding.uniforms.get("u_occlusionStrength")).toBe(0.4);
    expect(binding.uniforms.get("u_emissiveStrength")).toBe(3);
    expect(binding.uniforms.get("u_clearcoatFactor")).toBe(0.6);
    expect(binding.uniforms.get("u_clearcoatTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_clearcoatTextureOffset")).toEqual([0.11, 0.12]);
    expect(binding.uniforms.get("u_clearcoatTextureScale")).toEqual([1.1, 1.2]);
    expect(binding.uniforms.get("u_clearcoatTextureRotation")).toBe(0.13);
    expect(binding.uniforms.get("u_clearcoatRoughnessFactor")).toBe(0.25);
    expect(binding.uniforms.get("u_clearcoatRoughnessTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_clearcoatRoughnessTextureOffset")).toEqual([0.21, 0.22]);
    expect(binding.uniforms.get("u_clearcoatRoughnessTextureScale")).toEqual([1.3, 1.4]);
    expect(binding.uniforms.get("u_clearcoatRoughnessTextureRotation")).toBe(0.23);
    expect(binding.uniforms.get("u_clearcoatNormalTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_clearcoatNormalTextureOffset")).toEqual([0.31, 0.32]);
    expect(binding.uniforms.get("u_clearcoatNormalTextureScale")).toEqual([1.5, 1.6]);
    expect(binding.uniforms.get("u_clearcoatNormalTextureRotation")).toBe(0.33);
    expect(binding.uniforms.get("u_clearcoatNormalScale")).toBe(0.5);
    expect(binding.uniforms.get("u_transmissionFactor")).toBe(0.1);
    expect(binding.uniforms.get("u_transmissionTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_transmissionTextureOffset")).toEqual([0.41, 0.42]);
    expect(binding.uniforms.get("u_transmissionTextureScale")).toEqual([1.7, 1.8]);
    expect(binding.uniforms.get("u_transmissionTextureRotation")).toBe(0.43);
    expect(binding.uniforms.get("u_volumeThicknessFactor")).toBe(0.3);
    expect(binding.uniforms.get("u_volumeThicknessTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_volumeThicknessTextureOffset")).toEqual([0.44, 0.45]);
    expect(binding.uniforms.get("u_volumeThicknessTextureScale")).toEqual([1.45, 1.55]);
    expect(binding.uniforms.get("u_volumeThicknessTextureRotation")).toBe(0.46);
    expect(binding.uniforms.get("u_volumeAttenuationDistance")).toBe(5);
    expect(binding.uniforms.get("u_volumeAttenuationColor")).toEqual([0.7, 0.8, 0.9]);
    expect(binding.uniforms.get("u_ior")).toBe(1.33);
    expect(binding.uniforms.get("u_specularFactor")).toBe(0.7);
    expect(binding.uniforms.get("u_specularTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_specularTextureOffset")).toEqual([0.51, 0.52]);
    expect(binding.uniforms.get("u_specularTextureScale")).toEqual([1.9, 2]);
    expect(binding.uniforms.get("u_specularTextureRotation")).toBe(0.53);
    expect(binding.uniforms.get("u_specularColorFactor")).toEqual([0.8, 0.9, 1]);
    expect(binding.uniforms.get("u_specularColorTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_specularColorTextureOffset")).toEqual([0.61, 0.62]);
    expect(binding.uniforms.get("u_specularColorTextureScale")).toEqual([2.1, 2.2]);
    expect(binding.uniforms.get("u_specularColorTextureRotation")).toBe(0.63);
    expect(binding.uniforms.get("u_sheenColorFactor")).toEqual([0.2, 0.3, 0.4]);
    expect(binding.uniforms.get("u_sheenColorTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_sheenColorTextureOffset")).toEqual([0.71, 0.72]);
    expect(binding.uniforms.get("u_sheenColorTextureScale")).toEqual([2.3, 2.4]);
    expect(binding.uniforms.get("u_sheenColorTextureRotation")).toBe(0.73);
    expect(binding.uniforms.get("u_sheenRoughnessFactor")).toBe(0.45);
    expect(binding.uniforms.get("u_sheenRoughnessTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_sheenRoughnessTextureOffset")).toEqual([0.81, 0.82]);
    expect(binding.uniforms.get("u_sheenRoughnessTextureScale")).toEqual([2.5, 2.6]);
    expect(binding.uniforms.get("u_sheenRoughnessTextureRotation")).toBe(0.83);
    expect(binding.uniforms.get("u_anisotropyStrength")).toBe(0.5);
    expect(binding.uniforms.get("u_anisotropyTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_anisotropyTextureOffset")).toEqual([0.91, 0.92]);
    expect(binding.uniforms.get("u_anisotropyTextureScale")).toEqual([2.7, 2.8]);
    expect(binding.uniforms.get("u_anisotropyTextureRotation")).toBe(0.93);
    expect(binding.uniforms.get("u_iridescenceFactor")).toBe(0.65);
    expect(binding.uniforms.get("u_iridescenceTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_iridescenceTextureOffset")).toEqual([1.01, 1.02]);
    expect(binding.uniforms.get("u_iridescenceTextureScale")).toEqual([2.9, 3]);
    expect(binding.uniforms.get("u_iridescenceTextureRotation")).toBe(1.03);
    expect(binding.uniforms.get("u_iridescenceIor")).toBe(1.45);
    expect(binding.uniforms.get("u_iridescenceThicknessMinimum")).toBe(150);
    expect(binding.uniforms.get("u_iridescenceThicknessMaximum")).toBe(650);
    expect(binding.uniforms.get("u_iridescenceThicknessTexture")).toBeInstanceOf(TextureBinding);
    expect(binding.uniforms.get("u_iridescenceThicknessTextureOffset")).toEqual([1.11, 1.12]);
    expect(binding.uniforms.get("u_iridescenceThicknessTextureScale")).toEqual([3.1, 3.2]);
    expect(binding.uniforms.get("u_iridescenceThicknessTextureRotation")).toBe(1.13);
    expect(binding.uniforms.get("u_dispersion")).toBe(12);
    expect(binding.uniforms.get("u_emissiveTextureOffset")).toEqual([0.2, 0.1]);
  });

  it("collects scene lights and packs direct-light uniform data deterministically", () => {
    const scene = new Scene();
    const sun = scene.createLight("directional", "sun");
    sun.intensity = 4;
    sun.color = new Vector3(1, 0.9, 0.8);
    sun.castsShadow = true;
    scene.root.addChild(sun);

    const fill = scene.createLight("point", "fill") as PointLight;
    fill.intensity = 2;
    fill.color = new Vector3(0.2, 0.4, 1);
    fill.range = 5;
    fill.transform.setPosition(1, 2, 3);
    scene.root.addChild(fill);

    const spot = scene.createLight("spot", "spot") as SpotLight;
    spot.intensity = 1;
    spot.color = [1, 0.5, 0.25];
    spot.angle = Math.PI / 6;
    spot.penumbra = 0.25;
    spot.range = 7;
    spot.transform.setPosition(0, 0, 2);
    scene.root.addChild(spot);

    const lights = new LightCollector().collect(scene);
    const packed = LightUniforms.pack(lights);

    expect(lights.map((light) => light.source.name)).toEqual(["sun", "fill", "spot"]);
    expect(packed.lightCount).toBe(3);
    expect(Array.from(packed.data.slice(0, 4))).toEqual([
      expect.closeTo(1),
      expect.closeTo(0.9),
      expect.closeTo(0.8),
      expect.closeTo(4)
    ]);
    expect(Array.from(packed.data.slice(16, 20))).toEqual([
      expect.closeTo(0.2),
      expect.closeTo(0.4),
      expect.closeTo(1),
      expect.closeTo(2)
    ]);
    expect(Array.from(packed.data.slice(20, 24))).toEqual([1, 2, 3, 5]);
    expect(Array.from(packed.data.slice(40, 44))).toEqual([
      expect.closeTo(0),
      expect.closeTo(0),
      expect.closeTo(-1),
      2
    ]);
    expect(Array.from(packed.data.slice(36, 40))).toEqual([0, 0, 2, 7]);
    expect(Array.from(packed.data.slice(44, 48))).toEqual([
      expect.closeTo(Math.PI / 6),
      expect.closeTo(0.25),
      0,
      1
    ]);
  });

  it("filters disabled and layer-mismatched lights while enforcing max light ordering", () => {
    const scene = new Scene();
    const key = scene.createLight("directional", "key");
    key.intensity = 3;
    key.layerMask = 0b001;
    scene.root.addChild(key);

    const hidden = scene.createLight("point", "hidden") as PointLight;
    hidden.intensity = 10;
    hidden.visible = false;
    hidden.layerMask = 0b001;
    scene.root.addChild(hidden);

    const fill = scene.createLight("point", "fill") as PointLight;
    fill.intensity = 2;
    fill.layerMask = 0b010;
    scene.root.addChild(fill);

    const rim = scene.createLight("spot", "rim") as SpotLight;
    rim.intensity = 5;
    rim.range = 11;
    rim.layerMask = 0b011;
    scene.root.addChild(rim);

    const collector = new LightCollector();

    expect(collector.collect(scene, { layerMask: 0b001, maxLights: 2 }).map((light) => light.source.name)).toEqual(["rim", "key"]);
    expect(collector.collect(scene, { layerMask: 0b010 }).map((light) => light.source.name)).toEqual(["rim", "fill"]);
    expect(collector.collect(scene, { includeDisabled: true, layerMask: 0b001, maxLights: 1 }).map((light) => light.source.name)).toEqual(["hidden"]);
    expect(collector.collect(scene, { maxLights: 0 })).toHaveLength(0);
    expect(() => collector.collect(scene, { maxLights: -1 })).toThrow(/maxLights/);
    expect(() => collector.collect(scene, { maxLights: 1.5 })).toThrow(/maxLights/);
  });

  it("injects collected scene lights into renderer PBR draw uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const scene = new Scene();
    const sun = scene.createLight("directional", "sun");
    sun.intensity = 3;
    sun.color = [1, 0.85, 0.7];
    scene.root.addChild(sun);

    const diagnostics = renderer.render({
      scene,
      renderItems: [
        {
          geometry: Geometry.litTriangle(),
          material: new PBRMaterial({ baseColor: [0.7, 0.4, 0.2, 1] }),
          label: "pbr-light-uniforms"
        }
      ]
    });
    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const lightData = command?.uniforms?.get("u_lightData") as Float32Array | undefined;

    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.uniforms?.get("u_lightCount")).toBe(1);
    expect(lightData).toBeInstanceOf(Float32Array);
    expect(lightData?.length).toBe(128);
    expect(Array.from(lightData?.slice(0, 4) ?? [])).toEqual([
      expect.closeTo(1),
      expect.closeTo(0.85),
      expect.closeTo(0.7),
      expect.closeTo(3)
    ]);

    renderer.dispose();
  });
});
