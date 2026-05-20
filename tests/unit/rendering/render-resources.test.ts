import { describe, expect, it } from "vitest";
import {
  Geometry,
  MockRenderDevice,
  Renderer,
  RenderPipeline,
  Sampler,
  ShaderModule,
  Texture,
  TextureBinding,
  TexturedPBRMaterial,
  assertRendererFeatures,
  createDefaultShaderLibrary,
  createRendererFeatureReport,
  DEFAULT_UNLIT_SHADER_NAME
} from "../../../packages/rendering/src";

describe("rendering resource model", () => {
  it("creates buffers, textures, samplers, shader modules, and pipelines through public resources", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const texture = new Texture({ width: 4, height: 4, format: "rgba8", colorSpace: "srgb", label: "albedo", data: new Uint8Array(4 * 4 * 4) });
    const sampler = new Sampler({ minFilter: "linear", magFilter: "nearest", addressU: "repeat" });
    const shader = ShaderModule.fromLibrary(createDefaultShaderLibrary(), DEFAULT_UNLIT_SHADER_NAME).compile(device);
    const pipeline = new RenderPipeline({
      label: "resource-pipeline",
      shader,
      vertexFormat: geometry.vertexBuffer.format,
      topology: geometry.topology,
      requiredAttributes: ["position"]
    });

    device.beginFrame(32, 32);
    device.draw(pipeline.createDrawCommand({ vertexBuffer, vertexCount: geometry.vertexBuffer.vertexCount }));
    device.endFrame();

    expect(texture).toMatchObject({ width: 4, height: 4, format: "rgba8", colorSpace: "srgb", label: "albedo" });
    expect(sampler).toMatchObject({ minFilter: "linear", magFilter: "nearest", addressU: "repeat", addressV: "clamp-to-edge", maxAnisotropy: 1 });
    expect(shader.reflection.attributes.has("a_position")).toBe(true);
    expect(pipeline.renderState.depthTest).toBe(true);
    expect(device.drawCommands[0]?.renderState).toMatchObject({ depthTest: true, depthWrite: true, cullMode: "back", blend: false });
    expect(device.getDiagnostics()).toMatchObject({ drawCalls: 1, buffers: 1, shaders: 1, lastError: null });
  });

  it("rejects pipelines whose vertex format does not satisfy the shader contract", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const shader = ShaderModule.fromLibrary(createDefaultShaderLibrary(), DEFAULT_UNLIT_SHADER_NAME).compile(device);

    expect(
      () =>
        new RenderPipeline({
          shader,
          vertexFormat: geometry.vertexBuffer.format,
          requiredAttributes: ["normal"]
        })
    ).toThrow(/missing required attributes: normal/);
  });

  it("validates CPU texture upload data length before a backend sees the resource", () => {
    expect(() => new Texture({ width: 2, height: 2, data: new Uint8Array(3) })).toThrow(/rgba8 textures must contain exactly 16 bytes/);
  });

  it("validates anisotropic sampler requests for high detail PBR texture filtering", () => {
    const sampler = new Sampler({ maxAnisotropy: 8 });

    expect(sampler.maxAnisotropy).toBe(8);
    expect(() => new Sampler({ maxAnisotropy: 0 })).toThrow(/maxAnisotropy/);
  });

  it("keeps textured PBR defaults neutral when metallic-roughness maps are absent", () => {
    const material = new TexturedPBRMaterial({ metallic: 1, roughness: 0.82 });
    const binding = material.getParameter("u_metallicRoughnessTexture");

    expect(binding).toBeInstanceOf(TextureBinding);
    expect((binding as TextureBinding).texture?.label).toBe("default-metallic-roughness");
    expect(Array.from((binding as TextureBinding).texture?.data ?? [])).toEqual([255, 255, 255, 255]);
    expect(material.getParameter("u_metallic")).toBe(1);
    expect(material.getParameter("u_roughness")).toBe(0.82);
  });

  it("owns render targets, supports clear readback, and rejects disposed target binding", () => {
    const device = new MockRenderDevice();
    const target = device.createRenderTarget({ width: 4, height: 4, label: "unit-target" });

    device.setRenderTarget(target);
    device.beginFrame(4, 4);
    device.clear([0.25, 0.5, 1, 1]);
    const pixel = device.readPixels(1, 1, 1, 1);
    device.endFrame();

    expect([...pixel]).toEqual([64, 128, 255, 255]);
    expect(device.getDiagnostics().renderTargets).toBe(1);

    target.dispose();
    expect(target.colorTexture.disposed).toBe(true);
    expect(() => device.setRenderTarget(target)).toThrow(/live resource/);
    expect(device.getDiagnostics().renderTargets).toBe(0);
    device.dispose();
  });

  it("owns bounded HDR render targets and exposes float readback", () => {
    const device = new MockRenderDevice();
    const target = device.createRenderTarget({ width: 2, height: 2, label: "unit-hdr-target", format: "rgba32f" });

    device.setRenderTarget(target);
    device.beginFrame(2, 2);
    device.clear([2.5, 0.5, 0.125, 1]);
    const floatPixel = device.readFloatPixels(1, 1, 1, 1);
    const bytePixel = device.readPixels(1, 1, 1, 1);
    device.endFrame();

    expect(target.colorTexture.format).toBe("rgba32f");
    expect(target.colorTexture.byteLength).toBe(2 * 2 * 16);
    expect(Array.from(floatPixel)).toEqual([2.5, 0.5, 0.125, 1]);
    expect(Array.from(bytePixel)).toEqual([255, 128, 32, 255]);
  });

  it("distinguishes sampleable depth textures from renderbuffer-only depth targets", () => {
    const device = new MockRenderDevice();
    const colorOnly = device.createRenderTarget({ width: 4, height: 4, label: "color-only", depth: false });
    const renderbufferDepth = device.createRenderTarget({ width: 4, height: 4, label: "renderbuffer-depth", depth: true });
    const sampleableDepth = device.createRenderTarget({ width: 4, height: 4, label: "sampleable-depth", depth: "texture" });

    expect(colorOnly.depthTexture).toBeUndefined();
    expect(renderbufferDepth.depthTexture).toBeUndefined();
    expect(sampleableDepth.depthTexture).toMatchObject({
      width: 4,
      height: 4,
      format: "depth24",
      label: "sampleable-depth-depth"
    });
    expect(sampleableDepth.depthTexture?.byteLength).toBe(4 * 4 * 4);

    sampleableDepth.dispose();
    expect(sampleableDepth.depthTexture?.disposed).toBe(true);
  });

  it("reports renderer feature gates and fails visibly for unsupported HDR/PBR parity features", async () => {
    const device = new MockRenderDevice();
    const report = createRendererFeatureReport(device);

    expect(report.supported).toContain("postprocess-ldr");
    expect(report.supported).toContain("spot-shadow-maps");
    expect(report.blocked.map((status) => status.feature)).toContain("hdr-render-targets");
    expect(report.blocked.map((status) => status.feature)).toContain("contact-shadows");
    expect(report.blocked.map((status) => status.feature)).toContain("point-shadow-maps");
    expect(report.blocked.find((status) => status.feature === "contact-shadows")?.reason).toContain("does not expose renderer-owned contact-shadow support");
    expect(report.blocked.find((status) => status.feature === "point-shadow-maps")?.reason).toContain("does not expose point-light");
    expect(report.blocked.find((status) => status.feature === "production-pbr-parity")?.reason).toContain("external reference-scene comparisons");
    expect(() => assertRendererFeatures(device, ["hdr-render-targets", "production-pbr-parity"])).toThrow(/required features are unsupported/);

    await expect(Renderer.create({ backend: "mock", requiredFeatures: ["hdr-render-targets"] })).rejects.toMatchObject({
      code: "UNSUPPORTED_RENDER_FEATURE",
      details: {
        backend: "mock",
        missing: ["hdr-render-targets"]
      }
    });

    const renderer = await Renderer.create({ backend: "mock", requiredFeatures: ["postprocess-ldr"] });
    expect(renderer.getFeatureReport().supported).toContain("postprocess-ldr");
    renderer.dispose();
  });

  it("reports supported HDR and point-shadow capabilities without stale not-implemented blockers", () => {
    const report = createRendererFeatureReport({
      info: {
        backend: "webgl2",
        vendor: "test",
        renderer: "capability-rich-test-device",
        capabilities: ["buffers", "draw-validation", "render-targets", "pixel-readback", "postprocess-presentation", "hdr-render-targets", "point-shadow-maps", "contact-shadows", "hdr-image-based-lighting"]
      }
    });

    expect(report.supported).toEqual(expect.arrayContaining(["hdr-render-targets", "point-shadow-maps", "contact-shadows", "hdr-image-based-lighting"]));
    expect(report.blocked.map((status) => status.feature)).not.toEqual(expect.arrayContaining(["hdr-render-targets", "point-shadow-maps", "contact-shadows", "hdr-image-based-lighting"]));
  });

  it("keeps depth textures blocked when a backend only exposes depth renderbuffers", () => {
    const report = createRendererFeatureReport({
      info: {
        backend: "webgl2",
        vendor: "test",
        renderer: "depth-capable-test-device",
        capabilities: ["depth-render-targets"]
      }
    });

    expect(report.supported).not.toContain("depth-textures");
    expect(report.blocked.find((status) => status.feature === "depth-textures")?.reason).toContain("Sampleable depth texture plumbing");
  });

  it("reports depth textures only when the backend exposes sampleable depth texture capability", () => {
    const report = createRendererFeatureReport({
      info: {
        backend: "webgl2",
        vendor: "test",
        renderer: "sampleable-depth-capable-test-device",
        capabilities: ["depth-render-targets", "depth-textures"]
      }
    });

    expect(report.supported).toContain("depth-textures");
    expect(report.blocked.map((status) => status.feature)).not.toContain("depth-textures");
  });
});
