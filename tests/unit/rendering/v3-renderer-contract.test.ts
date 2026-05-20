import { describe, expect, it } from "vitest";
import {
  Geometry,
  NormalMappedPBRMaterial,
  PBRMaterial,
  Renderer,
  TexturedPBRMaterial,
  Texture,
  analyzeRgbaFrameVisualMetrics,
  computePerspectiveCameraFrame,
  createLightingDefault
} from "@galileo3d/rendering";

describe("V3 renderer contract", () => {
  it("exports the renderer foundation APIs required by V3", () => {
    expect(Renderer).toBeTypeOf("function");
    expect(Geometry.texturedCube).toBeTypeOf("function");
    expect(PBRMaterial).toBeTypeOf("function");
    expect(TexturedPBRMaterial).toBeTypeOf("function");
    expect(NormalMappedPBRMaterial).toBeTypeOf("function");
    expect(createLightingDefault).toBeTypeOf("function");
    expect(computePerspectiveCameraFrame).toBeTypeOf("function");
    expect(analyzeRgbaFrameVisualMetrics).toBeTypeOf("function");
  });

  it("creates PBR, textured PBR, normal mapped PBR, lighting, and camera defaults", () => {
    const white = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([255, 255, 255, 255]) });
    const normal = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]) });
    const pbr = new PBRMaterial({ name: "hr3-pbr", baseColor: [0.8, 0.2, 0.1, 1], metallic: 0.2, roughness: 0.4 });
    const textured = new TexturedPBRMaterial({
      name: "hr3-textured",
      baseColorTexture: white,
      metallicRoughnessTexture: white,
      normalTexture: normal,
      emissiveTexture: white,
      emissiveColor: [0.1, 0.1, 0.3],
      emissiveStrength: 0.5
    });
    const normalMapped = new NormalMappedPBRMaterial({
      name: "hr3-normal-mapped",
      normalTexture: normal,
      normalScale: 0.8
    });
    const lighting = createLightingDefault("studioProduct");
    const frame = computePerspectiveCameraFrame({ min: [-1, -1, -1], max: [1, 1, 1] }, { width: 1280, height: 720 }, { paddingRatio: 0.2 });

    expect(pbr.name).toBe("hr3-pbr");
    expect(textured.name).toBe("hr3-textured");
    expect(normalMapped.name).toBe("hr3-normal-mapped");
    expect(lighting.shadow.enabled).toBe(true);
    expect(lighting.postprocess.toneMapping).toBeTruthy();
    expect(frame.far).toBeGreaterThan(frame.near);
  });

  it("renders through the mock backend and reports diagnostics", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    const frame = renderer.captureFrame({
      renderItems: [{
        geometry: Geometry.litCube(),
        material: new PBRMaterial({ name: "hr3-mock-material", baseColor: [0.4, 0.6, 0.9, 1], roughness: 0.5 })
      }],
      cameraPolicy: "auto-frame",
      postprocess: false,
      environmentLighting: false
    });

    expect(frame.width).toBe(320);
    expect(frame.height).toBe(180);
    expect(frame.diagnostics.lastError).toBeNull();
    expect(frame.diagnostics.drawCalls).toBeGreaterThan(0);
    renderer.dispose();
  });
});
