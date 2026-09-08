import { describe, expect, it } from "vitest";
import { MaterialBinding } from "../../../packages/rendering/src/MaterialBinding";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TexturedPBRMaterial, texturedPbrShaderActiveTextureSlots } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { createDefaultShaderLibrary, DEFAULT_TEXTURED_PBR_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibrary";

describe("R04 mixed extension map bindings", () => {
  const texture = () => new Texture({ width: 1, height: 1, data: new Uint8Array([20, 80, 180, 64]) });
  for (const [map, slots] of [
    ["sheenColorTexture", ["clearcoat", "sheenColor", "sheenRoughness", "anisotropy"]],
    ["anisotropyTexture", ["clearcoat", "anisotropy"]],
    ["iridescenceTexture", ["clearcoat", "iridescence", "iridescenceThickness"]],
  ] as const) {
    it(`binds clearcoat and ${map} without exceeding all fragment sampler types`, () => {
      const material = new TexturedPBRMaterial({ clearcoatTexture: texture(), [map]: texture() });
      const active = texturedPbrShaderActiveTextureSlots(material.shaderVariant);
      for (const slot of slots) expect(active).toContain(slot);
      const shader = createDefaultShaderLibrary().compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, material.shaderVariant!);
      const samplers = [...shader.fragment.matchAll(/\buniform\s+sampler(?:2D|Cube)\s+(\w+)/g)].map(m => m[1]);
      expect(samplers.length).toBeLessThanOrEqual(16);
      for (const slot of slots) expect(samplers).toContain(`u_${slot}Texture`);
      expect(shader.fragment).toContain("texture(u_clearcoatTexture");
      expect(shader.fragment).toContain(`texture(u_${map}`);
    });
  }
  it("allows optimized-out thickness minimum only for variants without thickness sampling", () => {
    const device=new MockRenderDevice();const library=createDefaultShaderLibrary();
    for(const options of [{}, {clearcoatTexture:texture()}, {sheenRoughnessTexture:texture()}, {iridescenceTexture:texture()}]){
      const material=new TexturedPBRMaterial(options);
      const source=material.shaderVariant ? library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME,material.shaderVariant) : library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME);
      const shader=device.createShaderProgram(source);
      // Model native compiler liveness: scalar film uses maximum alone.
      (shader.reflection.uniforms as Set<string>).delete("u_iridescenceThicknessMinimum");
      const needsMinimum=texturedPbrShaderActiveTextureSlots(material.shaderVariant).includes("iridescenceThickness");
      if(needsMinimum) expect(()=>new MaterialBinding().bind(material,shader)).toThrow(/Material binding validation/);
      else expect(()=>new MaterialBinding().bind(material,shader)).not.toThrow();
      material.dispose();
    }
    device.dispose();
  });
  it("uses all eight extension slots with independent scalar mip strips at 15 samplers", () => {
    const rect = [0, 1, 1, 0] as const;
    const material = new TexturedPBRMaterial({ extensionScalarAtlas: { texture: texture(), clearcoat: rect, clearcoatRoughness: rect, sheenRoughness: rect, iridescence: rect, iridescenceThickness: rect } });
    const shader = createDefaultShaderLibrary().compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, material.shaderVariant!);
    const samplers = [...shader.fragment.matchAll(/\buniform\s+sampler(?:2D|Cube)\s+(\w+)/g)].map(m => m[1]);
    expect(samplers).toHaveLength(15);
    expect(shader.fragment).toContain("float iridescenceThickness = u_iridescenceThicknessMaximum;");
    expect(shader.fragment).not.toContain("float iridescenceThickness = mix(u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, 0.5);");
    expect(samplers).toContain("u_spotShadowMapTexture");
    expect(samplers).toContain("u_environmentCubeMapTexture");
    expect(samplers).toContain("u_extensionScalarAtlas");
    for (const slot of ["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"]) {
      expect(samplers).not.toContain(`u_${slot}Texture`);
      expect(shader.fragment).toContain(`u_${slot}AtlasRect`);
      expect(shader.fragment).toContain(`u_${slot}AtlasFilter`);
    }
    expect(texturedPbrShaderActiveTextureSlots(material.shaderVariant)).toHaveLength(13);
  });
  it("rejects unsupported three-family map combinations instead of dropping maps", () => {
    expect(() => new TexturedPBRMaterial({ clearcoatTexture: texture(), sheenColorTexture: texture(), iridescenceTexture: texture() })).toThrow(/16-sampler/);
  });
  it("retains scalar combinations without adding map samplers", () => {
    expect(() => new TexturedPBRMaterial({ clearcoatTexture: texture(), sheenColorFactor: [1,1,1], anisotropyStrength: 1, iridescenceFactor: 1 })).not.toThrow();
  });
});
