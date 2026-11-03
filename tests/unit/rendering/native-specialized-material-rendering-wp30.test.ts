import { describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineAuraAssets, material, primitives, texture } from "../../../packages/engine/src/public/index";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createCustomShaderMaterial, applyCustomUniformWrites, syncCustomTextureRefs } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { upgradeCustomMaterialTextures } from "../../../packages/engine/src/agent-api/compiler/customTextures";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { PortableShaderMaterial } from "../../../packages/rendering/src/PortableShaderMaterial";
import { DepthPreviewMaterial } from "../../../packages/rendering/src/DepthPreviewMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;

describe("WP-30 specialized material rendering", () => {
  it("compiles and draws each public primitive through the portable forward path", () => {
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]) });
    const specs = [
      material.matcap({ map, color: "#80ffff", opacity: 0.75 }),
      material.depth({ near: 2, far: 12 }),
      material.distance({ referencePosition: [1, 2, 3], near: 2, far: 12 }),
      material.shadow({ color: "#123456", opacity: 0.4 })
    ];
    const entries = createProductionRuntimePrimitiveEntries(specs.map((spec) => primitives.box({ material: spec }).toJSON()));
    const resources = entries.map((entry) => entry.resources[0]!);
    const device = new MockRenderDevice();
    try {
      device.beginFrame(16, 16);
      for (const resource of resources) {
        expect(resource.material).toBeInstanceOf(PortableShaderMaterial);
        const compiled = resource.material as PortableShaderMaterial;
        const source = globalShaderSource(compiled.shaderKey)!;
        expect(source.webgpu?.vertex).toContain("@vertex");
        expect(source.webgpu?.fragment).toContain("@fragment");
        expect(compiled.compile(device).ok).toBe(true);
        new ForwardPass({
          items: [{ geometry: resource.geometry, material: compiled, modelMatrix: identity }],
          cameraViewMatrix: identity,
          customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
        }).execute({ device, width: 16, height: 16 });
      }
      expect(device.drawCommands).toHaveLength(4);
      expect(device.drawCommands[0]!.uniforms!.get("u_matcapOpacity")).toBe(0.75);
      expect(device.drawCommands[0]!.uniforms!.get("u_matcapMap")).toMatchObject({ texture: map.texture });
      expect(device.drawCommands[1]!.uniforms!.get("u_depthPreviewNear")).toBe(2);
      expect(device.drawCommands[1]!.uniforms!.get("u_depthPreviewSpan")).toBe(10);
      expect(device.drawCommands[2]!.uniforms!.get("u_distanceOrigin")).toEqual([1, 2, 3]);
      expect(device.drawCommands[3]!.uniforms!.get("u_shadowMapEnabled")).toBe(0);
      expect(device.drawCommands[3]!.renderState).toMatchObject({ blend: true, depthWrite: false });
    } finally {
      for (const resource of resources) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
      map.dispose();
      device.dispose();
    }
  });

  it("binds the real directional shadow packet on the public shadow material", () => {
    const spec = material.shadow({ opacity: 0.4, side: "double" });
    const instance = createCustomShaderMaterial(spec.custom!);
    const resource = createProductionRuntimePrimitiveEntries([primitives.plane({ material: spec }).toJSON()])[0]!.resources[0]!;
    const depth = new Texture({ width: 8, height: 8, format: "rgba8" });
    const binding = new TextureBinding({ name: "u_shadowMapTexture", texture: depth });
    const device = new MockRenderDevice();
    try {
      const source = globalShaderSource(instance.shaderKey)!;
      expect(source.portableBindings).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "u_a3dSunDirection", kind: "vec3" }),
        expect.objectContaining({ name: "u_shadowMapTexture", kind: "texture2d" }),
        expect.objectContaining({ name: "u_shadowPcfSamples", arrayLength: 32 })
      ]));
      device.beginFrame(16, 16);
      const options = {
        items: [{ geometry: resource.geometry, material: resource.material, modelMatrix: identity }],
        shadowMap: { texture: binding, lightMatrix: identity, strength: 0.8, bias: 0.01, normalBias: 0.02 },
        cameraViewMatrix: identity,
        customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
      } as const;
      new ForwardPass(options).execute({ device, width: 16, height: 16 });
      const draw = device.drawCommands[0]!;
      expect(draw.uniforms!.get("u_shadowMapTexture")).toBe(binding);
      expect(draw.uniforms!.get("u_shadowMapEnabled")).toBe(1);
      expect(draw.uniforms!.get("u_shadowMapStrength")).toBe(0.8);
      expect(draw.uniforms!.get("u_shadowMapNormalBias")).toBe(0.02);
      expect(draw.uniforms!.get("u_shadowOpacity")).toBe(0.4);
      expect(draw.renderState).toMatchObject({ blend: true, depthWrite: false, cullMode: "none" });
    } finally {
      instance.dispose();
      resource.geometry.dispose();
      resource.material.dispose();
      depth.dispose();
      device.dispose();
    }
  });

  it.each(["point", "spot"] as const)("selects and binds the %s shadow packet", (light) => {
    const spec = material.shadow({ light });
    const resource = createProductionRuntimePrimitiveEntries([primitives.plane({ material: spec }).toJSON()])[0]!.resources[0]!;
    const primary = new Texture({ width: 6, height: 4, format: "rgba8" });
    const local = new Texture({ width: 6, height: 4, format: "rgba8" });
    const binding = new TextureBinding({ name: `u_${light}ShadowMapTexture`, texture: local });
    const faces = new Float32Array(Array.from({ length: 6 }, () => [...identity]).flat());
    const rects = new Float32Array(Array.from({ length: 6 }, (_, index) => [(index % 3) / 3, Math.floor(index / 3) / 2, 1 / 3, 1 / 2]).flat());
    const packet = light === "point"
      ? { pointLight: { texture: binding, lightPosition: [1, 2, 3] as const, range: 20, faceMatrices: faces, faceRects: rects, strength: 0.6 } }
      : { spotLight: { texture: binding, lightPosition: [1, 2, 3] as const, lightDirection: [0, -1, 0] as const, angle: 0.6, penumbra: 0.2, range: 20, shadowMatrix: identity, strength: 0.6 } };
    const device = new MockRenderDevice();
    try {
      const compiled = resource.material as PortableShaderMaterial;
      const source = globalShaderSource(compiled.shaderKey)!;
      expect(source.portableBindings).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: `u_${light}ShadowMapTexture`, kind: "texture2d" }),
        expect.objectContaining({ name: `u_${light}ShadowPcfSamples`, arrayLength: 32 })
      ]));
      expect(source.webgpu!.fragment).toContain(`u_${light}ShadowMapTextureTexture`);
      device.beginFrame(8, 8);
      new ForwardPass({
        items: [{ geometry: resource.geometry, material: compiled, modelMatrix: identity }],
        shadowMap: { texture: new TextureBinding({ name: "u_shadowMapTexture", texture: primary }), lightMatrix: identity, strength: 0, ...packet },
        cameraViewMatrix: identity,
        customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
      }).execute({ device, width: 8, height: 8 });
      const uniforms = device.drawCommands[0]!.uniforms!;
      expect(uniforms.get(`u_${light}ShadowMapEnabled`)).toBe(1);
      expect(uniforms.get(`u_${light}ShadowMapTexture`)).toBe(binding);
      expect(uniforms.get(`u_${light}ShadowStrength`)).toBe(0.6);
      expect(uniforms.get(`u_${light}ShadowLightPosition`)).toEqual([1, 2, 3]);
    } finally {
      resource.geometry.dispose();
      resource.material.dispose();
      primary.dispose();
      local.dispose();
      device.dispose();
    }
  });

  it("updates live map sampler state and distance uniforms without shader replacement", () => {
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]) });
    const matcap = createCustomShaderMaterial(material.matcap({ map }).custom!);
    const distance = createCustomShaderMaterial(material.distance().custom!);
    try {
      const key = matcap.shaderKey;
      map.wrapS = "repeat";
      expect(syncCustomTextureRefs(matcap)).toBe(1);
      expect((matcap.getParameter("u_matcapMap") as TextureBinding).sampler.addressU).toBe("repeat");
      expect(matcap.shaderKey).toBe(key);
      expect(applyCustomUniformWrites(distance, new Map([["distanceOrigin", [4, 5, 6]]]))).toBe(1);
      expect(distance.getParameter("u_distanceOrigin")).toEqual([4, 5, 6]);
    } finally {
      matcap.dispose();
      distance.dispose();
      map.dispose();
    }
  });

  it("expands instance transforms into actual per-instance model and normal matrices", () => {
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    const resource = createProductionRuntimePrimitiveEntries([primitives.box({ material: material.matcap({ map }) }).toJSON()])[0]!.resources[0]!;
    const device = new MockRenderDevice();
    const base = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1];
    const first = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1];
    const second = [1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1];
    try {
      device.beginFrame(8, 8);
      new ForwardPass({
        items: [{ geometry: resource.geometry, material: resource.material, modelMatrix: base, instanceTransforms: new Float32Array([...first, ...second]) }],
        cameraViewMatrix: identity,
        cameraViewProjectionMatrix: identity,
        customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
      }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(2);
      const a = device.drawCommands[0]!.uniforms!;
      const b = device.drawCommands[1]!.uniforms!;
      expect(Array.from(a.get("u_modelMatrix") as Float32Array)[12]).toBe(11);
      expect(Array.from(b.get("u_modelMatrix") as Float32Array)[12]).toBe(12);
      expect(Array.from(a.get("u_normalMatrix") as Float32Array)[0]).toBe(0.5);
      expect(Array.from(b.get("u_normalMatrix") as Float32Array)[5]).toBe(0.25);
    } finally {
      resource.geometry.dispose();
      resource.material.dispose();
      map.dispose();
      device.dispose();
    }
  });

  it("requires real normals for matcap and shadow receivers but not depth or distance previews", () => {
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    const geometry = new Geometry(new VertexBuffer(VertexFormat.P3, 3), null, "triangles");
    const materials = [
      material.matcap({ map }), material.shadow(), material.shadow({ light: "point" }),
      material.shadow({ light: "spot" }), material.depth(), material.distance()
    ]
      .map((spec) => spec.kind === "depth-preview" ? new DepthPreviewMaterial(spec.depthPreview) : createCustomShaderMaterial(spec.custom!));
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      for (const compiled of materials.slice(0, 4)) {
        expect(compiled.requiredAttributes).toContain("a_normal");
        expect(() => new ForwardPass({ items: [{ geometry, material: compiled }] }).execute({ device, width: 8, height: 8 }))
          .toThrow(/geometry is missing attributes/i);
      }
      for (const compiled of materials.slice(4)) {
        expect(compiled.requiredAttributes).not.toContain("a_normal");
        expect(() => new ForwardPass({ items: [{ geometry, material: compiled }] }).execute({ device, width: 8, height: 8 })).not.toThrow();
      }
    } finally {
      geometry.dispose();
      for (const compiled of materials) compiled.dispose();
      map.dispose();
      device.dispose();
    }
  });

  it("emits the supported specialized-material calculations", () => {
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]), colorSpace: "srgb" });
    const specs = [material.matcap({ map }), material.depth(), material.distance(), material.shadow()];
    const compiled = specs.map((spec) => spec.kind === "depth-preview" ? new DepthPreviewMaterial(spec.depthPreview) : createCustomShaderMaterial(spec.custom!));
    try {
      const [cap, depth, distance, shadow] = compiled;
      expect(cap!.getParameter("u_matcapDecodeSrgb")).toBe(0);
      expect(cap!.sources.glsl.fragment).toContain("texture(matcapMap, viewNormal.xy * 0.5 + 0.5)");
      expect(cap!.sources.wgsl!.fragment).toContain("textureSample(u_matcapMapTexture");
      expect(cap!.sources.wgsl!.fragment).toContain("aura.u_viewMatrix * vec4<f32>(n, 0.0)");
      expect(depth!.sources.glsl.fragment).toContain("(v_viewDepth - ");
      expect(depth!.sources.wgsl!.fragment).toContain("(viewDepth - aura.u_depthPreviewNear) / aura.u_depthPreviewSpan");
      expect(distance!.sources.glsl.fragment).toContain("length(vPreviewWorld - distanceOrigin)");
      expect(distance!.sources.wgsl!.fragment).toContain("length(world - aura.u_distanceOrigin)");
      expect(shadow!.sources.glsl.fragment).toContain("a3dSunShadowAuto(vSpecialWorld, n)");
      expect(shadow!.sources.wgsl!.fragment).toContain("textureSampleLevel(u_shadowMapTextureTexture");
      expect(shadow!.sources.wgsl!.fragment).toContain("aura.u_shadowOpacity * clamp(1.0 - visibility");
    } finally {
      for (const value of compiled) value.dispose();
      map.dispose();
    }
  });

  it("upgrades a typed matcap asset to a real bitmap texture and releases it", async () => {
    const map = defineAuraAssets({ cap: { type: "texture", format: "png", url: "/wp30-cap.png" } }).cap;
    const entries = createProductionRuntimePrimitiveEntries([primitives.box({ material: material.matcap({ map }) }).toJSON()]);
    const resource = entries[0]!.resources[0]!;
    const compiled = resource.material as PortableShaderMaterial;
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const loader = vi.fn(async () => bitmap);
    const warn = vi.fn();
    try {
      expect(compiled.getParameter("u_matcapDecodeSrgb")).toBe(1);
      expect((compiled.getParameter("u_matcapMap") as TextureBinding).texture).toBeNull();
      await upgradeCustomMaterialTextures(entries, warn, loader);
      const loaded = (compiled.getParameter("u_matcapMap") as TextureBinding).texture!;
      expect(loader).toHaveBeenCalledWith("/wp30-cap.png");
      expect(loaded.source).toBe(bitmap);
      expect(loaded.colorSpace).toBe("linear");
      expect(warn).not.toHaveBeenCalled();
      resource.textureDisposer!();
      expect(loaded.disposed).toBe(true);
      expect(bitmap.close).toHaveBeenCalledOnce();
    } finally {
      resource.geometry.dispose();
      resource.material.dispose();
    }
  });

  it.runIf(hasGlslang)("links each fully assembled GLSL vertex and fragment pair", () => {
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([200, 100, 50, 255]) });
    const specs = [
      material.matcap({ map }), material.depth(), material.distance(), material.shadow(),
      material.shadow({ light: "point" }), material.shadow({ light: "spot" })
    ];
    const directory = mkdtempSync(join(tmpdir(), "aura3d-wp30-shaders-"));
    try {
      for (const [index, spec] of specs.entries()) {
        const compiled = spec.kind === "depth-preview" ? new DepthPreviewMaterial(spec.depthPreview) : createCustomShaderMaterial(spec.custom!);
        try {
          const vertex = join(directory, `${index}.vert`);
          const fragment = join(directory, `${index}.frag`);
          writeFileSync(vertex, compiled.sources.glsl.vertex);
          writeFileSync(fragment, compiled.sources.glsl.fragment);
          expect(() => execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" })).not.toThrow();
        } finally {
          compiled.dispose();
        }
      }
    } finally {
      map.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("submits paired shaders and texture bindings to a native-shaped WebGPU device", async () => {
    const modules: string[] = [];
    const views: string[] = [];
    let drawCount = 0;
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: async () => {} },
      createBuffer({ label, size, usage }) { return { label, size, usage, destroy() {} }; },
      createTexture({ label }) {
        return { label, createView: () => { views.push(label ?? ""); return { label }; }, destroy() {} };
      },
      createSampler() { return {}; },
      createShaderModule({ code }) { modules.push(code); return {}; },
      createBindGroupLayout() { return {}; },
      createPipelineLayout() { return {}; },
      createRenderPipeline() { return { getBindGroupLayout: () => ({}) }; },
      createBindGroup() { return {}; },
      createCommandEncoder() {
        return {
          beginRenderPass: () => ({
            setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {},
            draw() { drawCount += 1; }, drawIndexed() { drawCount += 1; }, end() {}
          }),
          finish: () => ({})
        };
      },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    const map = texture.data({ width: 1, height: 1, data: new Uint8Array([200, 100, 50, 255]) });
    const depth = new Texture({ width: 4, height: 4, format: "rgba8", label: "wp30-shadow-packet" });
    const pointDepth = new Texture({ width: 6, height: 4, format: "rgba8", label: "wp30-point-packet" });
    const spotDepth = new Texture({ width: 4, height: 4, format: "rgba8", label: "wp30-spot-packet" });
    const faces = new Float32Array(Array.from({ length: 6 }, () => [...identity]).flat());
    const rects = new Float32Array(Array.from({ length: 6 }, (_, index) => [(index % 3) / 3, Math.floor(index / 3) / 2, 1 / 3, 1 / 2]).flat());
    const shadowMap = {
      texture: new TextureBinding({ name: "u_shadowMapTexture", texture: depth }), lightMatrix: identity, strength: 0.8,
      pointLight: { texture: new TextureBinding({ name: "u_pointShadowMapTexture", texture: pointDepth }), lightPosition: [1, 2, 3] as const,
        range: 20, faceMatrices: faces, faceRects: rects },
      spotLight: { texture: new TextureBinding({ name: "u_spotShadowMapTexture", texture: spotDepth }), lightPosition: [1, 2, 3] as const,
        lightDirection: [0, -1, 0] as const, angle: 0.6, penumbra: 0.2, range: 20, shadowMatrix: identity }
    };
    const target = device.createRenderTarget({ width: 16, height: 16, depth: false, label: "wp30-output" });
    const specs = [
      material.matcap({ map }), material.distance(), material.shadow(),
      material.shadow({ light: "point" }), material.shadow({ light: "spot" })
    ];
    const resources = createProductionRuntimePrimitiveEntries(specs.map((spec) => primitives.box({ material: spec }).toJSON()))
      .map((entry) => entry.resources[0]!);
    try {
      device.beginFrame(16, 16);
      device.setRenderTarget(target);
      for (const resource of resources) {
        new ForwardPass({
          items: [{ geometry: resource.geometry, material: resource.material, modelMatrix: identity }],
          shadowMap,
          cameraViewMatrix: identity,
          customFrameCamera: { viewMatrix: identity, projectionMatrix: identity }
        }).execute({ device, width: 16, height: 16 });
      }
      device.endFrame();
      expect(drawCount).toBe(5);
      expect(modules.some((source) => source.includes("textureSample(u_matcapMapTexture"))).toBe(true);
      expect(modules.some((source) => source.includes("textureSampleLevel(u_shadowMapTextureTexture"))).toBe(true);
      expect(modules.some((source) => source.includes("textureSampleLevel(u_pointShadowMapTextureTexture"))).toBe(true);
      expect(modules.some((source) => source.includes("textureSampleLevel(u_spotShadowMapTextureTexture"))).toBe(true);
      expect(modules.some((source) => source.includes("u_a3dSunDirection: vec3<f32>"))).toBe(true);
      expect(views).toContain(map.texture.label);
      expect(views).toContain("wp30-shadow-packet");
      expect(views).toContain("wp30-point-packet");
      expect(views).toContain("wp30-spot-packet");
    } finally {
      for (const resource of resources) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
      map.dispose();
      depth.dispose();
      pointDepth.dispose();
      spotDepth.dispose();
      target.dispose();
      device.dispose();
    }
  });
});
