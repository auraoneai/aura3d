import { describe, expect, it } from "vitest";
import { webgpuExtensionAtlasUniforms, WEBGPU_ATLAS_MAPS } from "../../../packages/rendering/src/WebGPUExtensionAtlas";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createDefaultShaderLibrary, DEFAULT_TEXTURED_PBR_EXTENSION_ATLAS_VARIANT, DEFAULT_TEXTURED_PBR_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibrary";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";

describe("R04 native WebGPU atlas transport", () => {
  it("packs independent UV, shelf origin, mip, filter and material fields at WGSL offsets", () => {
    const uniforms = new Map<string, UniformValue>([
      ["u_iridescenceThicknessTextureOffset", [.125, .75]], ["u_iridescenceThicknessTextureScale", [2, 3]],
      ["u_iridescenceThicknessTextureTexCoord", 1], ["u_iridescenceThicknessTextureEnabled", 1],
      ["u_iridescenceThicknessAtlasY", 35], ["u_iridescenceThicknessAtlasRect", [20, 17, 9, 4]],
      ["u_iridescenceThicknessAtlasFilter", [1, 0, 2, 8]], ["u_iridescenceThicknessTextureWrap", [1, 2]],
      ["u_iridescenceThicknessMaximum", 650], ["u_sheenColorFactor", [.25,.5,.75]],
      ["u_ior", 2], ["u_specularFactor", .5], ["u_specularColorFactor", [.25,.5,1]]
    ]);
    const data=webgpuExtensionAtlasUniforms(uniforms); const offset=WEBGPU_ATLAS_MAPS.indexOf("iridescenceThickness")*20;
    expect(Array.from(data.slice(offset,offset+20))).toEqual([.125,.75,2,3,0,1,1,35,1,2,0,0,20,17,9,4,1,0,2,8]);
    expect(Array.from(data.slice(264,267))).toEqual([.25,.5,.75]);
    expect(data[272]).toBe(650);
    expect(data.byteLength).toBe(1152);
    expect(Array.from(data.slice(280,288))).toEqual([2,.5,0,0,.25,.5,1,0]);
  });
  it("selects native atlas conversion and exposes all logical channels in emitted WGSL", async () => {
    const modules:string[]=[];
    const native:WebGPUDeviceLike={ queue:{writeBuffer(){},submit(){}},createBuffer(){return {destroy(){}};},createShaderModule(descriptor){modules.push(descriptor.code);return {};},destroy(){} };
    const device=await WebGPUDevice.create({adapter:{requestDevice:async()=>native},device:native});
    try {
      const source=createDefaultShaderLibrary().compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME,DEFAULT_TEXTURED_PBR_EXTENSION_ATLAS_VARIANT);
      device.createShaderProgram(source);
      const fragment=modules.find(code=>code.includes("fn atlasExtensionLighting"))!;
      expect(fragment).toBeDefined();
      expect(fragment).toContain("textureLoad(u_scalarAtlas,origin+wrapped,0)");
      expect(fragment).toContain("let a = max(roughness, 0.045) * max(roughness, 0.045);");
      expect(fragment).toContain("return a2 / max(3.14159265 * denom * denom, 0.0000000000000001);");
      expect(fragment).toContain("atlasSample(9u,uv0,uv1).a");
      expect(fragment).toContain("atlasSample(12u,uv0,uv1).g");
      expect(fragment).toContain("mix(1.0,thicknessMask,u_atlas.maps[12].control.z)");
      expect(fragment).toContain("let filmFresnel = atlasIridescenceFresnel(f0, vDotH, uv, uv1);");
      expect(fragment).toContain("let kd = (vec3<f32>(1.0) - diffuseFresnel) * (1.0 - metallic);");
      expect(fragment).toContain("i32(map.control.w)");
      expect(fragment).toContain("atlasExtensionLighting(normal, tangentFrame");
      expect(fragment).toContain("let environmentF0 = atlasIridescenceEnvironmentF0(f0, nDotV, uv, uv1);");
      expect(fragment).toContain("specularEnv * (environmentF0 * brdf.x + vec3<f32>(brdf.y, brdf.y, brdf.y))");
      expect(fragment).toContain("let filmEnvironment=vec3<f32>(0.0);");
      expect(fragment.match(/var \w+: texture_2d/g)).toHaveLength(15);
      expect(modules.some(code=>code.includes("output.uv1 = uv1; output.color = color;"))).toBe(true);
    } finally {device.dispose();}
  });
});
