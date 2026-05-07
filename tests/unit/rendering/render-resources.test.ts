import { describe, expect, it } from "vitest";
import {
  Geometry,
  MockRenderDevice,
  RenderPipeline,
  Sampler,
  ShaderModule,
  Texture,
  createDefaultShaderLibrary,
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
    expect(sampler).toMatchObject({ minFilter: "linear", magFilter: "nearest", addressU: "repeat", addressV: "clamp-to-edge" });
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
    expect(() => new Texture({ width: 2, height: 2, data: new Uint8Array(3) })).toThrow(/width \* height \* 4/);
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
});
