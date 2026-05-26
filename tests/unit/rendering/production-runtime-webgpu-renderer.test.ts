import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createV6WebGPUReport,
  createV7WebGPUReadinessReport,
  resolveRendererV6Backend
} from "../../../packages/rendering/src/production-runtime";

describe("V6 WebGPU report", () => {
  it("publishes explicit unavailable status instead of fake parity when WebGPU is missing", async () => {
    const report = await createV6WebGPUReport(undefined);

    expect(report.status).toBe("unavailable");
    expect(report.canCreateDevice).toBe(false);
    expect(report.realHardwareRequiredForParity).toBe(true);
    expect(report.doesNotBlockWebGL2Production).toBe(true);
    expect(report.warnings.join(" ")).toMatch(/WebGL2 remains/i);
  });

  it("reports a real adapter/device path when supplied by the runtime", async () => {
    const report = await createV6WebGPUReport({
      getPreferredCanvasFormat: () => "bgra8unorm",
      requestAdapter: async () => ({
        name: "unit-adapter",
        requestDevice: async () => ({})
      })
    });

    expect(report.status).toBe("available");
    expect(report.adapterName).toBe("unit-adapter");
    expect(report.preferredFormat).toBe("bgra8unorm");
    expect(report.canCreateDevice).toBe(true);
    expect(report.warnings.join(" ")).toMatch(/not Three.js\/WebGPU parity/i);
  });

  it("publishes V7 WebGPU production SDK readiness without keeping the SDK backend blocked", async () => {
    const report = await createV7WebGPUReadinessReport({
      getPreferredCanvasFormat: () => "bgra8unorm",
      requestAdapter: async () => ({
        name: "unit-adapter",
        requestDevice: async () => ({})
      })
    });

    expect(report.schema).toBe("a3d-v7-webgpu-readiness/v1");
    expect(report.availability.status).toBe("available");
    expect(report.productionBackend).toBe("webgpu-production-sdk-path");
    expect(report.primaryRendererClaim).toBe(true);
    expect(report.safetyChecks.find((item) => item.id === "renderer-production-runtime-webgpu-uses-production-webgpu-path")?.status).toBe("ready");
    expect(report.safetyChecks.find((item) => item.id === "sdk-webgpu-exposes-async-production-render")?.status).toBe("ready");
    expect(report.requiredForCompletion.find((item) => item.id === "real-browser-webgpu-device")?.status).toBe("ready");
    expect(report.requiredForCompletion.find((item) => item.id === "low-level-gltf-hdr-pbr-webgpu-imported-asset")?.status).toBe("ready");
    expect(report.requiredForCompletion.find((item) => item.id === "gltf-hdr-pbr-webgpu-product-viewer")?.status).toBe("ready");
    expect(report.requiredForCompletion.find((item) => item.id === "webgpu-threejs-visual-delta")?.status).toBe("ready");
    expect(report.requiredForCompletion.find((item) => item.id === "webgpu-sdk-production-backend")?.status).toBe("ready");
    expect(report.blockers).toEqual([]);
  });

  it("routes backend='webgpu' to ProductionWebGPURenderer instead of silently falling back to WebGL2", () => {
    const source = readFileSync(resolve("packages/rendering/src/production-runtime/RendererV6.ts"), "utf8");

    expect(source).toContain("ProductionWebGPURenderer.create(options)");
    expect(resolveRendererV6Backend({ backend: "webgpu" })).toMatchObject({
      requestedBackend: "webgpu",
      selectedBackend: "webgpu",
      asyncRequired: true,
      fallback: false
    });
    expect(source).not.toContain("readiness/coverage data only");
    expect(source).not.toContain("production imported-asset rendering currently requires backend='webgl2'");
  });

  it("makes backend selection WebGPU-first when the runtime is supplied and explicit when it falls back", () => {
    expect(resolveRendererV6Backend({ backend: "auto" })).toMatchObject({
      requestedBackend: "auto",
      selectedBackend: "webgl2",
      asyncRequired: false,
      fallback: true
    });
    expect(resolveRendererV6Backend({ backend: "auto", webgpu: { requestAdapter: async () => null } })).toMatchObject({
      requestedBackend: "auto",
      selectedBackend: "webgpu",
      asyncRequired: true,
      fallback: false
    });
    expect(resolveRendererV6Backend({ webgpu: { requestAdapter: async () => null } })).toMatchObject({
      requestedBackend: "auto",
      selectedBackend: "webgpu",
      asyncRequired: true,
      fallback: false
    });
    expect(resolveRendererV6Backend({})).toMatchObject({
      requestedBackend: "webgl2",
      selectedBackend: "webgl2",
      asyncRequired: false,
      fallback: false
    });
  });

  it("lets backend='auto' select browser navigator.gpu without forcing callers to pass the runtime", () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const gpu = {
      requestAdapter: async () => null,
      getPreferredCanvasFormat: () => "bgra8unorm"
    };

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { gpu }
    });
    try {
      expect(resolveRendererV6Backend({ backend: "auto" })).toMatchObject({
        requestedBackend: "auto",
        selectedBackend: "webgpu",
        asyncRequired: true,
        fallback: false,
        reason: "backend='auto' selected WebGPU because navigator.gpu is available in the current browser runtime."
      });
      expect(resolveRendererV6Backend({})).toMatchObject({
        requestedBackend: "auto",
        selectedBackend: "webgpu",
        asyncRequired: true,
        fallback: false
      });
    } finally {
      if (originalNavigator) {
        Object.defineProperty(globalThis, "navigator", originalNavigator);
      } else {
        Reflect.deleteProperty(globalThis, "navigator");
      }
    }
  });

  it("keeps scene-color transmission capture shared across WebGL2 and WebGPU production renderers", () => {
    const helper = readFileSync(resolve("packages/rendering/src/production-runtime/TransmissionBackdropCapture.ts"), "utf8");
    const webgl2 = readFileSync(resolve("packages/rendering/src/production-runtime/ProductionWebGL2Renderer.ts"), "utf8");
    const webgpu = readFileSync(resolve("packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts"), "utf8");
    const types = readFileSync(resolve("packages/rendering/src/production-runtime/ProductionRendererTypes.ts"), "utf8");

    expect(types).toContain("transmissionBackdropCapture?: false | V7TransmissionBackdropCaptureOptions");
    expect(types).toContain("readonly mipCount: number;");
    expect(helper).toContain("export function createSceneColorMipLevels");
    expect(helper).toContain("set(\"u_transmissionBackdropTexture\", binding);");
    expect(helper).toContain("set(\"u_transmissionBackdropMipCount\", binding.texture?.textureLevels.length ?? 1);");
    expect(webgl2).toContain("normalizeTransmissionBackdropCapture(input.transmissionBackdropCapture)");
    expect(webgl2).toContain("bindTransmissionBackdropCapture(input.source, transmissionBackdropTexture, captureOptions)");
    expect(webgpu).toContain("normalizeTransmissionBackdropCapture(input.transmissionBackdropCapture)");
    expect(webgpu).toContain("await this.renderer.renderAsync({ source: { ...input.source, renderTarget: target }, camera: input.camera });");
    expect(webgpu).toContain("bindTransmissionBackdropCapture(input.source, transmissionBackdropTexture, captureOptions)");
    expect(webgpu).toContain("scene-color-transmission-capture");
  });
});
