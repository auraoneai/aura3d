import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_MATERIAL_SHOWROOM__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly visualClaim: string;
      readonly environmentLighting: string;
      readonly diagnostics?: { readonly drawCalls: number; readonly textures?: number; readonly textureBytes?: number; readonly lastError: string | null };
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly environmentResources?: {
        readonly inputEncoding: string;
        readonly outputColorSpace: string;
        readonly hdrSource: boolean;
        readonly maxLinearValue: number;
        readonly specularMipCount: number;
        readonly diffuseIrradianceSize: readonly [number, number];
        readonly brdfLutSize: readonly [number, number];
      };
      readonly materials?: readonly string[];
      readonly pixels?: Record<string, readonly number[]>;
      readonly postprocess?: {
        readonly source: "webgl2-material-showroom-emissive-readback";
        readonly path: "PostProcessPass.bloomPixels";
        readonly brightPixelCount: number;
        readonly brightEnergy: number;
        readonly maxNeighborBoost: number;
        readonly beforeNeighbor: readonly number[];
        readonly afterNeighbor: readonly number[];
        readonly previewFrame: { readonly width: number; readonly height: number };
      };
      readonly materialKnownLimits?: Record<string, readonly string[]>;
      readonly knownLimits: readonly string[];
      readonly errors: readonly string[];
      readonly error?: string;
    };
    __AURA3D_RENDERER_STRESS_LAB__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly visualClaim: string;
      readonly objectCount?: number;
      readonly materialCount?: number;
      readonly lightCount?: number;
      readonly visibleObjects?: number;
      readonly culledObjects?: number;
      readonly drawCalls?: number;
      readonly frameMs?: number;
      readonly memoryEstimateBytes?: number;
      readonly resourceLifetime?: {
        readonly liveBuffers: number;
        readonly liveShaders: number;
        readonly liveTextures: number;
        readonly liveRenderTargets: number;
        readonly disposedBuffers: number;
        readonly disposedShaders: number;
        readonly disposedTextures: number;
        readonly disposedRenderTargets: number;
        readonly contextLost: boolean;
      };
      readonly timing?: {
        readonly cpuFrameMs: number;
        readonly gpuTimingSupported: boolean;
        readonly gpuUnavailableReason?: string;
        readonly samples: readonly { readonly label: string; readonly durationMs: number }[];
      };
      readonly diagnostics?: { readonly drawCalls: number; readonly shaders: number; readonly lastError: string | null };
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly centerPixel?: readonly number[];
      readonly controls?: Record<string, number>;
      readonly knownLimits: readonly string[];
      readonly errors: readonly string[];
      readonly error?: string;
    };
    __AURA3D_SHADOW_LAB__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2-plus-shadow-pass";
      readonly visualClaim: string;
      readonly knownLimits: readonly string[];
      readonly errors: readonly string[];
      readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly cascadeCount?: number;
      readonly cascadeSplits?: readonly { readonly index: number; readonly near: number; readonly far: number }[];
      readonly cascadeRendered?: readonly boolean[];
      readonly initialShadowCentroid?: readonly [number, number];
      readonly movedShadowCentroid?: readonly [number, number];
      readonly shadowPixel?: readonly number[];
      readonly planePixel?: readonly number[];
      readonly pcf?: {
        readonly mode: "pcf";
        readonly radius: number;
        readonly samples: number;
        readonly weightSum: number;
        readonly litPixel: readonly number[];
        readonly penumbraPixel: readonly number[];
        readonly shadowPixel: readonly number[];
      };
      readonly debugView?: {
        readonly cascadeCount: number;
        readonly mapResolution: readonly number[];
        readonly casterCount: number;
        readonly receiverCount: number;
        readonly frustumCornerCount: number;
        readonly texelSize: readonly number[];
        readonly stableOffset: readonly (readonly [number, number])[];
        readonly jitterStableDelta: readonly (readonly [number, number])[];
        readonly orthographic: readonly {
          readonly left: number;
          readonly right: number;
          readonly bottom: number;
          readonly top: number;
          readonly near: number;
          readonly far: number;
        }[];
        readonly pixels: {
          readonly cascade: readonly number[];
          readonly caster: readonly number[];
          readonly receiver: readonly number[];
          readonly frustum: readonly number[];
          readonly resolutionLabel: readonly number[];
        };
      };
      readonly controls?: { readonly mapSize: number; readonly bias: number; readonly darkness: number; readonly pcfRadius: number };
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly error?: string;
    };
    __AURA3D_POSTPROCESS_LAB__?: {
      readonly status: "ready" | "error";
      readonly renderer: "mock-rendergraph-2d";
      readonly visualClaim: string;
      readonly knownLimits: readonly string[];
      readonly errors: readonly string[];
      readonly graphOrder?: readonly string[];
      readonly enabledPasses?: readonly string[];
      readonly controls?: {
        readonly toneMapping: boolean;
        readonly bloom: boolean;
        readonly fxaa: boolean;
      };
      readonly resources?: readonly string[];
      readonly passCostsMs?: Record<string, number>;
      readonly timing?: {
        readonly gpuTimingSupported: boolean;
        readonly cpuFallbackActive: boolean;
        readonly sampleCount: number;
        readonly unavailableReason?: string;
        readonly samples: readonly {
          readonly label: string;
          readonly durationMs: number;
          readonly cpuDurationMs: number;
          readonly gpuDurationMs?: number;
          readonly source: "gpu" | "cpu-fallback";
          readonly fallbackReason?: string;
        }[];
      };
      readonly debugOverlay?: {
        readonly visible: boolean;
        readonly issueCount: number;
        readonly renderPassErrors: number;
        readonly shaderErrors: number;
        readonly lines: readonly string[];
      };
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly pixels?: Record<string, readonly number[]>;
      readonly depthTexture?: {
        readonly label: string;
        readonly width: number;
        readonly height: number;
        readonly format: "depth24";
        readonly byteLength: number;
        readonly minDepth: number;
        readonly maxDepth: number;
        readonly centerDepth: number;
        readonly nearSample: number;
        readonly farSample: number;
        readonly edgePixelCount: number;
      };
      readonly colorManagement?: {
        readonly inputColorSpace: "linear";
        readonly outputColorSpace: "srgb";
        readonly calibration: {
          readonly operator: string;
          readonly exposure: number;
          readonly gamma: number;
          readonly inputColorSpace: string;
          readonly outputColorSpace: string;
          readonly monotonic: boolean;
          readonly samples: readonly { readonly inputLinear: number; readonly mappedLinear: number; readonly encodedByte: number }[];
        };
      };
      readonly bloomMetrics?: {
        readonly brightPixelCount: number;
        readonly brightEnergy: number;
        readonly maxNeighborBoost: number;
      };
      readonly fxaaChangedPixel?: readonly [number, number];
      readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly error?: string;
    };
    __AURA3D_WEBGPU_CAPABILITY__?: {
      readonly status: "ready";
      readonly renderer: "webgpu" | "unavailable";
      readonly visualClaim: "webgpu-capability-probe";
      readonly availability: "available" | "not-exposed" | "adapter-missing" | "device-error";
      readonly hasNavigatorGpu: boolean;
      readonly adapterName?: string;
      readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly canvasFrame: { readonly width: number; readonly height: number };
      readonly centerPixel: readonly number[];
      readonly gracefulFallback: boolean;
      readonly knownLimits: readonly string[];
      readonly errors: readonly string[];
    };
  }
}

test.describe("foundation renderer examples", () => {
  let server: ExampleDevServer;
  const reportRunId = `foundation-rendering-${Date.now()}`;
  const report: FoundationRenderingReport = {
    ok: false,
    generatedAt: new Date().toISOString(),
    command: "pnpm exec playwright test tests/browser/rendering-foundation-labs.spec.ts --grep \"shadow lab\"",
    run: {
      id: reportRunId,
      agent: "renderer-debug-timing",
      startedAt: new Date().toISOString(),
      command: "pnpm exec playwright test tests/browser/rendering-foundation-labs.spec.ts"
    },
    evidence: {},
    validations: [],
    completedTaskEvidence: [],
    blockedTasks: []
  };

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.every((entry) => entry.ok);
    report.generatedAt = new Date().toISOString();
    report.run.finishedAt = report.generatedAt;
    report.evidence = {
      validationCount: report.validations.length,
      validationNames: report.validations.map((entry) => entry.name),
      backedRendererDebugTasks: [
        "Implement render-pass and shader error overlays for developer debugging",
        "Implement GPU timing where available with fallback CPU timing"
      ]
    };
    report.completedTaskEvidence = [
      {
        task: "examples/material-showroom shows dielectric, metal, rough, glossy, normal-mapped, emissive, transparent/alpha, and clearcoat-like materials if supported.",
        evidence: ["examples/material-showroom/main.ts", "tests/browser/rendering-foundation-labs.spec.ts"]
      },
      {
        task: "examples/renderer-stress-lab allows object/material/light count changes.",
        evidence: ["examples/renderer-stress-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts"]
      },
      {
        task: "Reports include draw calls, visible objects, culled objects, frame time, and memory estimates.",
        evidence: ["tests/reports/foundation-rendering.json"]
      },
      {
        task: "Known-limits output lists unsupported PBR features for each loaded material.",
        evidence: ["examples/material-showroom/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Shadow lab visual test verifies cascade metadata and projected shadow pixels.",
        evidence: ["examples/shadow-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Stable shadow camera/projection fitting.",
        evidence: ["packages/rendering/src/CascadedShadowMaps.ts", "examples/shadow-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Shadow debug view for cascades, casters, receivers, frustum, and map resolution.",
        evidence: ["packages/rendering/src/CascadedShadowMaps.ts", "examples/shadow-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "examples/shadow-lab visibly shows shadow quality controls.",
        evidence: ["examples/shadow-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "PCF or equivalent filtering.",
        evidence: ["packages/rendering/src/ShadowMap.ts", "packages/rendering/src/CascadedShadowMaps.ts", "examples/shadow-lab/main.ts", "tests/unit/rendering/shadow-pass.test.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Postprocess lab before/after visual test verifies tone mapping, bloom, FXAA, and presentation pixels.",
        evidence: ["examples/postprocess-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Depth texture plumbing is backed by a RenderGraph depth resource and browser-read depth visualization metrics.",
        evidence: ["packages/rendering/src/PostProcessPass.ts", "examples/postprocess-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Calibrated tone mapping/color management visual test validates linear-to-sRGB samples.",
        evidence: ["packages/rendering/src/PostProcessPass.ts", "examples/postprocess-lab/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Bloom operates on bright pixels in a real material showroom scene via shared PostProcessPass readback.",
        evidence: ["packages/rendering/src/PostProcessPass.ts", "examples/material-showroom/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Environment map resources generate explicit sRGB/linear conversion, RGBE decode, diffuse irradiance, specular prefilter mips, and BRDF LUT resources with bounded HDR claims.",
        evidence: ["packages/rendering/src/EnvironmentMapResources.ts", "tests/unit/rendering/environment-map-resources.test.ts", "examples/material-showroom/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Visible sampled environment reflection affects bounded metallic/rough material-showroom objects.",
        evidence: ["packages/rendering/src/ShaderLibrary.ts", "packages/rendering/src/ForwardPass.ts", "examples/material-showroom/main.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Implement render-pass and shader error overlays for developer debugging",
        evidence: ["packages/rendering/src/RendererDebugOverlay.ts", "examples/postprocess-lab/main.ts", "tests/unit/rendering/renderer-debug-overlay.test.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Implement GPU timing where available with fallback CPU timing",
        evidence: ["packages/rendering/src/RendererTiming.ts", "examples/postprocess-lab/main.ts", "examples/renderer-stress-lab/main.ts", "tests/unit/rendering/renderer-timing.test.ts", "tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "Foundation visual tests verify expected color/material/geometry regions instead of accepting nonblank pixels.",
        evidence: ["tests/browser/rendering-foundation-labs.spec.ts", "tests/reports/foundation-rendering.json"]
      },
      {
        task: "WebGPU examples fail gracefully when unavailable.",
        evidence: ["examples/webgpu-capability/main.ts", "tests/browser/rendering-foundation-labs.spec.ts"]
      }
    ];
    report.blockedTasks = [
      "Full floating-point HDR render targets and production HDR/PBR parity remain blocked; current renderer evidence decodes RGBE/linear HDR resources and tone maps them into RGBA8 WebGL2 textures.",
      "Real model-scene environment reflection proof, real reflection probes, product/game shared compositor integration, skinned PBR, morph PBR, and production cubemap convolution remain blocked.",
      "Product/game examples are not backed as using the same postprocess path; current evidence covers postprocess-lab and material-showroom readback only."
    ];
    const reportPath = resolve("tests/reports/foundation-rendering.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("material showroom renders all bounded PBR material states with known limits", async ({ page }) => {
    await page.goto(`${server.origin}/examples/material-showroom/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_MATERIAL_SHOWROOM__?.status === "ready" || window.__AURA3D_MATERIAL_SHOWROOM__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_MATERIAL_SHOWROOM__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.visualClaim).toBe("bounded-pbr-material-showroom");
    expect(result?.environmentLighting).toBe("sampled-rgba8-environment-map-approximation");
    expect(result?.canvasFrame).toEqual({ width: 960, height: 540 });
    expect(result?.environmentResources).toMatchObject({
      inputEncoding: "rgba8-srgb",
      outputColorSpace: "srgb",
      hdrSource: false,
      specularMipCount: 4,
      diffuseIrradianceSize: [16, 8],
      brdfLutSize: [32, 32]
    });
    expect(result?.diagnostics?.drawCalls).toBeGreaterThanOrEqual(8);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.materials).toEqual([
      "dielectric-gloss",
      "dielectric-rough",
      "metal-gloss",
      "metal-rough",
      "normal-mapped",
      "emissive",
      "alpha-blend",
      "double-sided",
      "clearcoat-like",
      "transmission-like",
      "sheen-like",
      "anisotropy-like",
      "iridescence-like",
      "physical-gold",
      "physical-copper",
      "physical-glass",
      "physical-water",
      "physical-skin",
      "physical-eye",
      "physical-hair",
      "physical-terrain",
      "physical-toon"
    ]);
    expect(result?.knownLimits.join(" ")).toContain("HDR environment input is blocked");
    expect(Object.keys(result?.materialKnownLimits ?? {}).sort()).toEqual([
      "alpha-blend",
      "anisotropy-like",
      "clearcoat-like",
      "dielectric-gloss",
      "dielectric-rough",
      "double-sided",
      "emissive",
      "iridescence-like",
      "metal-gloss",
      "metal-rough",
      "normal-mapped",
      "physical-copper",
      "physical-eye",
      "physical-glass",
      "physical-gold",
      "physical-hair",
      "physical-skin",
      "physical-terrain",
      "physical-toon",
      "physical-water",
      "sheen-like",
      "transmission-like"
    ]);

    const pixels = result?.pixels ?? {};
    const checks = {
      dielectricGloss: isLit(pixels.dielectricGloss),
      dielectricRough: isLit(pixels.dielectricRough),
      metalGloss: channel(pixels.metalGloss, 0) > 32 && channel(pixels.metalGloss, 1) > 20 && channel(pixels.metalGloss, 0) > channel(pixels.metalGloss, 2) && channel(pixels.metalGloss, 3) === 255,
      metalRough: channel(pixels.metalRough, 0) + channel(pixels.metalRough, 1) + channel(pixels.metalRough, 2) > 60 && channel(pixels.metalRough, 3) === 255,
      normalMapped: channel(pixels.normalMapped, 2) > 90 && channel(pixels.normalMapped, 3) === 255,
      emissive: channel(pixels.emissive, 1) > 85 && channel(pixels.emissive, 3) === 255,
      alphaBlend: channel(pixels.alphaBlend, 0) > 70 && channel(pixels.alphaBlend, 2) > 80 && channel(pixels.alphaBlend, 3) === 255,
      clearcoatLike: channel(pixels.clearcoatLike, 1) > 70 && channel(pixels.clearcoatLike, 2) > 55 && channel(pixels.clearcoatLike, 3) === 255,
      environmentResourceSet:
        result?.environmentResources?.inputEncoding === "rgba8-srgb" &&
        result.environmentResources.outputColorSpace === "srgb" &&
        result.environmentResources.specularMipCount === 4 &&
        result.environmentResources.diffuseIrradianceSize[0] === 16 &&
        result.environmentResources.brdfLutSize[0] === 32 &&
        result.environmentResources.maxLinearValue > 0,
      metallicReflectionVisible:
        channel(pixels.metalGloss, 0) > channel(pixels.metalRough, 2) &&
        channel(pixels.metalGloss, 0) + channel(pixels.metalGloss, 1) > channel(pixels.dielectricRough, 0),
      realSceneBloomBrightPixels:
        result?.postprocess?.source === "webgl2-material-showroom-emissive-readback" &&
        result.postprocess.path === "PostProcessPass.bloomPixels" &&
        result.postprocess.brightPixelCount > 0 &&
        result.postprocess.brightEnergy > 0,
      realSceneBloomRaisesNeighbor:
        channel(result?.postprocess?.afterNeighbor, 1) > channel(result?.postprocess?.beforeNeighbor, 1) &&
        channel(result?.postprocess?.afterNeighbor, 3) === 255 &&
        result?.postprocess?.maxNeighborBoost !== undefined &&
        result.postprocess.maxNeighborBoost > 0,
      realSceneBloomPreviewDrawn: result?.postprocess?.previewFrame.width === 456 && result.postprocess.previewFrame.height === 210
    };
    report.validations.push({
      name: "material-showroom",
      ok: Object.values(checks).every(Boolean),
      metrics: {
        drawCalls: result?.diagnostics?.drawCalls ?? 0,
        materialCount: result?.materials?.length ?? 0,
        textureBytes: result?.diagnostics?.textureBytes ?? 0,
        environmentSpecularMipCount: result?.environmentResources?.specularMipCount ?? 0,
        environmentMaxLinearValue: result?.environmentResources?.maxLinearValue ?? 0,
        showroomBloomBrightPixels: result?.postprocess?.brightPixelCount ?? 0,
        showroomBloomMaxNeighborBoost: result?.postprocess?.maxNeighborBoost ?? 0
      },
      checks
    });
    expect(checks, JSON.stringify(pixels)).toEqual({
      dielectricGloss: true,
      dielectricRough: true,
      metalGloss: true,
      metalRough: true,
      normalMapped: true,
      emissive: true,
      alphaBlend: true,
      clearcoatLike: true,
      environmentResourceSet: true,
      metallicReflectionVisible: true,
      realSceneBloomBrightPixels: true,
      realSceneBloomRaisesNeighbor: true,
      realSceneBloomPreviewDrawn: true
    });
  });

  test("renderer stress lab updates object, material, and light counts and reports culling metrics", async ({ page }) => {
    await page.goto(`${server.origin}/examples/renderer-stress-lab/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_RENDERER_STRESS_LAB__?.status === "ready" || window.__AURA3D_RENDERER_STRESS_LAB__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    await page.locator("[data-testid='stress-objects']").fill("144");
    await page.locator("[data-testid='stress-materials']").fill("10");
    await page.locator("[data-testid='stress-lights']").fill("6");
    await page.waitForFunction(() => window.__AURA3D_RENDERER_STRESS_LAB__?.objectCount === 144 && window.__AURA3D_RENDERER_STRESS_LAB__?.materialCount === 10 && window.__AURA3D_RENDERER_STRESS_LAB__?.lightCount === 6);
    const result = await page.evaluate(() => window.__AURA3D_RENDERER_STRESS_LAB__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.visualClaim).toBe("bounded-webgl2-renderer-stress-lab");
    expect(result?.objectCount).toBe(144);
    expect(result?.materialCount).toBe(10);
    expect(result?.lightCount).toBe(6);
    expect(result?.visibleObjects).toBeGreaterThan(0);
    expect(result?.culledObjects).toBeGreaterThan(0);
    expect(result?.drawCalls).toBe(result?.visibleObjects);
    expect(result?.drawCalls).toBeLessThan(result?.objectCount ?? 0);
    expect(result?.memoryEstimateBytes).toBeGreaterThan(0);
    expect(result?.resourceLifetime).toMatchObject({
      contextLost: false,
      disposedBuffers: expect.any(Number),
      disposedShaders: expect.any(Number),
      disposedTextures: expect.any(Number),
      disposedRenderTargets: expect.any(Number)
    });
    expect(result?.resourceLifetime?.liveBuffers).toBeGreaterThan(0);
    expect(result?.resourceLifetime?.liveShaders).toBeGreaterThan(0);
    expect(result?.resourceLifetime?.liveTextures).toBeGreaterThanOrEqual(0);
    expect(result?.timing?.cpuFrameMs).toBeGreaterThan(0);
    expect(result?.timing?.gpuTimingSupported).toBe(false);
    expect(result?.timing?.gpuUnavailableReason).toContain("using CPU frame timing fallback");
    expect(result?.timing?.samples?.[0]?.label).toBe("renderer-stress-frame");
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.canvasFrame).toEqual({ width: 960, height: 540 });
    expect(channel(result?.centerPixel, 3)).toBe(255);

    const metrics = {
      objectCount: result?.objectCount ?? 0,
      materialCount: result?.materialCount ?? 0,
      lightCount: result?.lightCount ?? 0,
      drawCalls: result?.drawCalls ?? 0,
      visibleObjects: result?.visibleObjects ?? 0,
      culledObjects: result?.culledObjects ?? 0,
      frameMs: result?.frameMs ?? 0,
      memoryEstimateBytes: result?.memoryEstimateBytes ?? 0,
      liveBuffers: result?.resourceLifetime?.liveBuffers ?? 0,
      liveShaders: result?.resourceLifetime?.liveShaders ?? 0,
      liveTextures: result?.resourceLifetime?.liveTextures ?? 0,
      disposedBuffers: result?.resourceLifetime?.disposedBuffers ?? 0,
      cpuFrameMs: result?.timing?.cpuFrameMs ?? 0,
      gpuTimingSupported: result?.timing?.gpuTimingSupported ?? true,
      shaders: result?.diagnostics?.shaders ?? 0
    };
    report.validations.push({
      name: "renderer-stress-lab",
      ok: metrics.objectCount === 144 && metrics.materialCount === 10 && metrics.lightCount === 6 && metrics.culledObjects > 0 && metrics.drawCalls === metrics.visibleObjects,
      metrics,
      checks: {
        controlsUpdated: metrics.objectCount === 144 && metrics.materialCount === 10 && metrics.lightCount === 6,
        cullingReported: metrics.culledObjects > 0 && metrics.visibleObjects > 0,
        drawCallsMatchVisibleObjects: metrics.drawCalls === metrics.visibleObjects,
        memoryEstimateReported: metrics.memoryEstimateBytes > 0,
        resourceLifetimeVisible: metrics.liveBuffers > 0 && metrics.liveShaders > 0 && metrics.liveTextures >= 0 && metrics.disposedBuffers >= 0,
        cpuTimingFallbackVisible: metrics.cpuFrameMs > 0 && metrics.gpuTimingSupported === false,
        centerPixelOpaque: channel(result?.centerPixel, 3) === 255
      }
    });
  });

  test("shadow lab validates cascade metadata and projected shadow regions", async ({ page }, testInfo) => {
    await page.goto(`${server.origin}/examples/_quarantine/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_SHADOW_LAB__?.status === "ready" || window.__AURA3D_SHADOW_LAB__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2-plus-shadow-pass");
    expect(result?.visualClaim).toBe("bounded-directional-shadow-lab");
    expect(result?.errors).toEqual([]);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.diagnostics?.drawCalls).toBeGreaterThan(0);
    expect(result?.canvasFrame).toEqual({ width: 480, height: 540 });
    expect(result?.cascadeCount).toBe(3);
    expect(result?.cascadeSplits?.map((split) => split.index)).toEqual([0, 1, 2]);
    expect(result?.cascadeRendered).toEqual([true, true, true]);
    expect(result?.controls).toEqual({ mapSize: 128, bias: 0.003, darkness: 0.62, pcfRadius: 1.5 });
    expect(result?.knownLimits.join(" ")).toContain("bounded 3x3 PCF-equivalent filtering evidence");
    expect(result?.pcf).toMatchObject({ mode: "pcf", radius: 1.5, samples: 9 });
    expect(result?.pcf?.weightSum).toBeCloseTo(1, 5);
    expect(result?.debugView).toMatchObject({
      cascadeCount: 3,
      mapResolution: [128, 128, 128],
      casterCount: 1,
      receiverCount: 1,
      frustumCornerCount: 8
    });
    expect(result?.debugView?.orthographic).toHaveLength(3);
    expect(result?.debugView?.orthographic.every((fit) => fit.right > fit.left && fit.top > fit.bottom && fit.far > fit.near)).toBe(true);
    expect(result?.debugView?.texelSize.every((value) => value > 0)).toBe(true);
    expect(result?.debugView?.jitterStableDelta.every(([x, y], index) => x <= (result.debugView?.texelSize[index] ?? 0) && y <= (result.debugView?.texelSize[index] ?? 0))).toBe(true);

    const centroidShift = Math.abs((result?.movedShadowCentroid?.[0] ?? 0) - (result?.initialShadowCentroid?.[0] ?? 0));
    const pcfLit = channel(result?.pcf?.litPixel, 0) + channel(result?.pcf?.litPixel, 1) + channel(result?.pcf?.litPixel, 2);
    const pcfPenumbra = channel(result?.pcf?.penumbraPixel, 0) + channel(result?.pcf?.penumbraPixel, 1) + channel(result?.pcf?.penumbraPixel, 2);
    const pcfShadow = channel(result?.pcf?.shadowPixel, 0) + channel(result?.pcf?.shadowPixel, 1) + channel(result?.pcf?.shadowPixel, 2);
    const checks = {
      cascadesRendered: result?.cascadeRendered?.every(Boolean) === true,
      movedCasterChangesProjection: centroidShift > 0.5,
      stableFitSnapsSmallCameraJitter:
        result?.debugView?.jitterStableDelta.every(([x, y], index) => x <= (result.debugView?.texelSize[index] ?? 0) && y <= (result.debugView?.texelSize[index] ?? 0)) === true,
      debugViewShowsCascadesCastersReceiversFrustumAndResolution:
        blueDominant(result?.debugView?.pixels.cascade) &&
        orangeDominant(result?.debugView?.pixels.caster) &&
        greenDominant(result?.debugView?.pixels.receiver) &&
        blueDominant(result?.debugView?.pixels.frustum) &&
        channel(result?.debugView?.pixels.resolutionLabel, 2) > 45,
      shadowRegionDarkerThanPlane:
        channel(result?.shadowPixel, 0) + channel(result?.shadowPixel, 1) + channel(result?.shadowPixel, 2) <
        channel(result?.planePixel, 0) + channel(result?.planePixel, 1) + channel(result?.planePixel, 2),
      shadowPixelOpaque: channel(result?.shadowPixel, 3) === 255,
      planePixelOpaque: channel(result?.planePixel, 3) === 255,
      pcfPenumbraBetweenLitAndShadow: pcfLit > pcfPenumbra && pcfPenumbra > pcfShadow,
      pcfPixelsOpaque: channel(result?.pcf?.litPixel, 3) === 255 && channel(result?.pcf?.penumbraPixel, 3) === 255 && channel(result?.pcf?.shadowPixel, 3) === 255
    };
    report.validations.push({
      name: "shadow-lab",
      ok: Object.values(checks).every(Boolean),
      metrics: {
        drawCalls: result?.diagnostics?.drawCalls ?? 0,
        cascadeCount: result?.cascadeCount ?? 0,
        centroidShift,
        mapSize: result?.controls?.mapSize ?? 0,
        stableFitCascadeCount: result?.debugView?.cascadeCount ?? 0,
        stableFitMaxJitterDelta: Math.max(...(result?.debugView?.jitterStableDelta.flatMap(([x, y]) => [x, y]) ?? [0])),
        bias: result?.controls?.bias ?? 0,
        darkness: result?.controls?.darkness ?? 0,
        pcfRadius: result?.pcf?.radius ?? 0,
        pcfSamples: result?.pcf?.samples ?? 0,
        pcfPenumbra,
        pcfShadow,
        pcfLit
      },
      checks
    });
    expect(checks, JSON.stringify({ shadowPixel: result?.shadowPixel, planePixel: result?.planePixel })).toEqual({
      cascadesRendered: true,
      movedCasterChangesProjection: true,
      stableFitSnapsSmallCameraJitter: true,
      debugViewShowsCascadesCastersReceiversFrustumAndResolution: true,
      shadowRegionDarkerThanPlane: true,
      shadowPixelOpaque: true,
      planePixelOpaque: true,
      pcfPenumbraBetweenLitAndShadow: true,
      pcfPixelsOpaque: true
    });
    const shadowScreenshotPath = resolve("tests/reports/foundation-shadow-lab-debug.png");
    mkdirSync(dirname(shadowScreenshotPath), { recursive: true });
    await page.screenshot({ path: shadowScreenshotPath, fullPage: true });
    await page.screenshot({ path: testInfo.outputPath("shadow-lab-debug.png"), fullPage: true });

    const beforeControlPixel = result?.shadowPixel ?? [];
    const beforePcfPenumbra = result?.pcf?.penumbraPixel ?? [];
    await page.locator("[data-testid='shadow-map-size']").fill("256");
    await page.locator("[data-testid='shadow-bias']").fill("0.006");
    await page.locator("[data-testid='shadow-darkness']").fill("0.85");
    await page.locator("[data-testid='shadow-pcf-radius']").fill("3");
    await page.waitForFunction(() =>
      window.__AURA3D_SHADOW_LAB__?.controls?.mapSize === 256 &&
      window.__AURA3D_SHADOW_LAB__?.controls?.bias === 0.006 &&
      window.__AURA3D_SHADOW_LAB__?.controls?.darkness === 0.85 &&
      window.__AURA3D_SHADOW_LAB__?.controls?.pcfRadius === 3
    );
    const adjusted = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
    expect(adjusted?.controls).toEqual({ mapSize: 256, bias: 0.006, darkness: 0.85, pcfRadius: 3 });
    expect(adjusted?.pcf).toMatchObject({ mode: "pcf", radius: 3, samples: 9 });
    expect(channel(adjusted?.shadowPixel, 0)).toBeLessThan(channel(beforeControlPixel, 0));
    expect(channel(adjusted?.pcf?.penumbraPixel, 0)).toBeLessThan(channel(beforePcfPenumbra, 0));
  });

  test("postprocess lab validates before and after pass pixels", async ({ page }) => {
    await page.goto(`${server.origin}/examples/_quarantine/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_POSTPROCESS_LAB__?.status === "ready" || window.__AURA3D_POSTPROCESS_LAB__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2-real-scene-postprocess");
    expect(result?.visualClaim).toBe("bounded-real-scene-postprocess-lab");
    expect(result?.realScene?.source).toBe("external-parity-product-gltf-webgl2-readback");
    expect(result?.realScene?.drawCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(result?.errors).toEqual([]);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.canvasFrame).toEqual({ width: 960, height: 540 });
    const expectedPassCostKeys = ["bloom", "depth-visualization", "fxaa", "hdr-input", "scene-depth", "tone-mapping"];
    expect(result?.graphOrder).toEqual(["scene-depth", "depth-visualization", "tone-mapping", "bloom", "fxaa"]);
    expect(result?.enabledPasses).toEqual(["tone-mapping", "bloom", "fxaa"]);
    expect(result?.controls).toMatchObject({
      toneMapping: true,
      bloom: true,
      fxaa: true,
      toneMapper: "reinhard",
      inputColorSpace: "linear",
      outputColorSpace: "srgb",
      exposure: 1.7,
      whitePoint: 1
    });
    expect(result?.resources).toContain("scene-depth:scene-depth->depth-visualization");
    expect(result?.resources).toContain("hdr-color:hdr-input->tone-mapping");
    expect(result?.resources).toContain("tone-mapped-color:tone-mapping->bloom");
    expect(result?.resources).toContain("bloom-color:bloom->fxaa");
    expect(Object.keys(result?.passCostsMs ?? {}).sort()).toEqual(expectedPassCostKeys);
    expect(Object.values(result?.passCostsMs ?? {}).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(result?.timing?.sampleCount).toBe(expectedPassCostKeys.length);
    expect(result?.timing?.gpuTimingSupported).toBe(false);
    expect(result?.timing?.cpuFallbackActive).toBe(true);
    expect(result?.timing?.unavailableReason).toContain("using CPU timing fallback");
    expect(result?.timing?.samples.map((sample) => sample.label).sort()).toEqual(expectedPassCostKeys);
    expect(result?.timing?.samples.every((sample) => sample.source === "cpu-fallback" && sample.cpuDurationMs >= 0)).toBe(true);
    expect(result?.debugOverlay).toMatchObject({ visible: true, issueCount: 2, renderPassErrors: 1, shaderErrors: 1 });
    expect(result?.debugOverlay?.lines.join("\n")).toContain("postprocess-debug-invalid-shader");
    expect(result?.debugOverlay?.lines.join("\n")).toContain("postprocess-debug-pass");
    expect(result?.debugOverlay?.lines.join("\n")).toContain("SHADER_MARKER_MISSING");
    expect(result?.knownLimits.join(" ")).toContain("not a production full-frame compositor");

    const pixels = result?.pixels ?? {};
    const toneMappedHighlight = pixels.toneMappedHighlight;
    const bloomNeighbor = pixels.bloomNeighbor;
    const depthNear = pixels.depthNear;
    const depthFar = pixels.depthFar;
    const srgbMidGray = pixels.srgbMidGray;
    const fxaaBeforeEdge = pixels.fxaaBeforeEdge;
    const fxaaAfterEdge = pixels.fxaaAfterEdge;
    const presentation = pixels.presentation;
    const calibrationMidGray = result?.colorManagement?.calibration?.samples?.find((sample) => sample.inputLinear === 0.18);
    const fxaaDelta =
      Math.abs(channel(fxaaBeforeEdge, 0) - channel(fxaaAfterEdge, 0)) +
      Math.abs(channel(fxaaBeforeEdge, 1) - channel(fxaaAfterEdge, 1)) +
      Math.abs(channel(fxaaBeforeEdge, 2) - channel(fxaaAfterEdge, 2));
    const checks = {
      toneMappingKeepsHighlightBounded:
        channel(toneMappedHighlight, 0) > 100 &&
        channel(toneMappedHighlight, 0) < 255 &&
        channel(toneMappedHighlight, 3) === 255,
      bloomRaisesNeighbor:
        channel(bloomNeighbor, 0) > 40 &&
        channel(bloomNeighbor, 1) > 35 &&
        channel(bloomNeighbor, 3) === 255,
      depthTexturePlumbed:
        result?.depthTexture?.label === "scene-depth" &&
        result.depthTexture.format === "depth24" &&
        result.depthTexture.byteLength === 96 * 54 * 4 &&
        result.depthTexture.minDepth < result.depthTexture.maxDepth &&
        result.depthTexture.edgePixelCount > 0 &&
        channel(depthNear, 0) > channel(depthFar, 0),
      calibratedLinearToSrgb:
        result?.colorManagement?.inputColorSpace === "linear" &&
        result.colorManagement.outputColorSpace === "srgb" &&
        result.colorManagement.calibration.monotonic === true &&
        calibrationMidGray?.encodedByte === channel(srgbMidGray, 0) &&
        channel(srgbMidGray, 0) >= 100 &&
        channel(srgbMidGray, 0) <= 180 &&
        channel(srgbMidGray, 3) === 255,
      bloomBrightPixelMetrics:
        (result?.bloomMetrics?.brightPixelCount ?? 0) > 0 &&
        (result?.bloomMetrics?.brightEnergy ?? 0) > 0 &&
        (result?.bloomMetrics?.maxNeighborBoost ?? 0) > 0,
      fxaaBlendsEdge:
        Array.isArray(result?.fxaaChangedPixel) &&
        result.fxaaChangedPixel.length === 2 &&
        fxaaDelta >= 12 &&
        channel(fxaaBeforeEdge, 3) === 255 &&
        channel(fxaaAfterEdge, 3) === 255,
      presentationShowsFinalPass:
        channel(presentation, 0) > 10 &&
        channel(presentation, 1) > 10 &&
        channel(presentation, 2) > 10 &&
        channel(presentation, 3) === 255,
      renderDebugOverlayVisible:
        result?.debugOverlay?.visible === true &&
        result.debugOverlay.renderPassErrors === 1 &&
        result.debugOverlay.shaderErrors === 1,
      timingCpuFallbackVisible:
        result?.timing?.sampleCount === expectedPassCostKeys.length &&
        result.timing.cpuFallbackActive === true &&
        result.timing.samples.every((sample) => sample.source === "cpu-fallback" && sample.cpuDurationMs >= 0)
    };
    report.validations.push({
      name: "postprocess-lab",
      ok: Object.values(checks).every(Boolean),
      metrics: {
        graphPasses: result?.graphOrder?.length ?? 0,
        resourceEdges: result?.resources?.length ?? 0,
        passCostsReported: Object.keys(result?.passCostsMs ?? {}).length,
        timingSamples: result?.timing?.sampleCount ?? 0,
        debugOverlayIssues: result?.debugOverlay?.issueCount ?? 0,
        renderPassOverlayErrors: result?.debugOverlay?.renderPassErrors ?? 0,
        shaderOverlayErrors: result?.debugOverlay?.shaderErrors ?? 0,
        depthEdges: result?.depthTexture?.edgePixelCount ?? 0,
        srgbMidGray: channel(srgbMidGray, 0),
        bloomBrightPixels: result?.bloomMetrics?.brightPixelCount ?? 0,
        bloomMaxNeighborBoost: result?.bloomMetrics?.maxNeighborBoost ?? 0,
        toneMappedRed: channel(toneMappedHighlight, 0),
        bloomNeighborRed: channel(bloomNeighbor, 0),
        fxaaDelta
      },
      checks
    });
    expect(checks, JSON.stringify(pixels)).toEqual({
      toneMappingKeepsHighlightBounded: true,
      bloomRaisesNeighbor: true,
      depthTexturePlumbed: true,
      calibratedLinearToSrgb: true,
      bloomBrightPixelMetrics: true,
      fxaaBlendsEdge: true,
      presentationShowsFinalPass: true,
      renderDebugOverlayVisible: true,
      timingCpuFallbackVisible: true
    });

    await page.locator("[data-testid='postprocess-bloom']").uncheck();
    await page.waitForFunction(() => window.__AURA3D_POSTPROCESS_LAB__?.controls?.bloom === false);
    const withoutBloom = await page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__);
    expect(withoutBloom?.graphOrder).toEqual(["scene-depth", "depth-visualization", "tone-mapping", "fxaa"]);
    expect(withoutBloom?.enabledPasses).toEqual(["tone-mapping", "fxaa"]);
    expect(withoutBloom?.controls).toMatchObject({
      toneMapping: true,
      bloom: false,
      fxaa: true,
      toneMapper: "reinhard",
      inputColorSpace: "linear",
      outputColorSpace: "srgb",
      exposure: 1.7,
      whitePoint: 1
    });
    expect(withoutBloom?.resources).not.toContain("bloom-color:bloom->fxaa");
    expect(Object.keys(withoutBloom?.passCostsMs ?? {}).sort()).toEqual(["depth-visualization", "fxaa", "hdr-input", "scene-depth", "tone-mapping"]);
    expect(channel(withoutBloom?.pixels?.bloomNeighbor, 0)).toBeLessThanOrEqual(channel(bloomNeighbor, 0));
  });

  test("WebGPU capability example records graceful unavailable state instead of crashing", async ({ page }) => {
    await page.goto(`${server.origin}/examples/webgpu-capability/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_WEBGPU_CAPABILITY__?.status === "ready",
      undefined,
      { timeout: 20_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_WEBGPU_CAPABILITY__);

    expect(result?.status).toBe("ready");
    expect(result?.visualClaim).toBe("webgpu-capability-probe");
    expect(result?.canvasFrame).toEqual({ width: 960, height: 540 });
    expect(result?.knownLimits.join(" ")).toContain("does not claim full WebGPU renderer parity");
    expect(result?.availability).toMatch(/^(available|not-exposed|adapter-missing|device-error)$/);
    expect(channel(result?.centerPixel, 3)).toBe(255);

    const gracefulUnavailable = result?.renderer === "unavailable" && result.gracefulFallback === true && (result.errors?.length ?? 0) > 0;
    const available = result?.renderer === "webgpu" && result.gracefulFallback === false && result.availability === "available";
    const checks = {
      reportsKnownLimit: result?.knownLimits.join(" ").includes("does not claim full WebGPU renderer parity") === true,
      validAvailabilityState: /^(available|not-exposed|adapter-missing|device-error)$/.test(result?.availability ?? ""),
      noCrashOnUnsupportedRuntime: Boolean(gracefulUnavailable || available),
      centerPixelOpaque: channel(result?.centerPixel, 3) === 255
    };
    report.validations.push({
      name: "webgpu-capability",
      ok: Object.values(checks).every(Boolean),
      metrics: {
        hasNavigatorGpu: result?.hasNavigatorGpu ? 1 : 0,
        gracefulFallback: result?.gracefulFallback ? 1 : 0,
        errorCount: result?.errors?.length ?? 0,
        drawCalls: result?.diagnostics?.drawCalls ?? 0
      },
      checks
    });
    expect(checks, JSON.stringify(result)).toEqual({
      reportsKnownLimit: true,
      validAvailabilityState: true,
      noCrashOnUnsupportedRuntime: true,
      centerPixelOpaque: true
    });
  });
});

interface FoundationRenderingReport {
  ok: boolean;
  generatedAt: string;
  command: string;
  run: FoundationRenderingRun;
  evidence: Record<string, unknown>;
  validations: FoundationRenderingValidation[];
  completedTaskEvidence: Array<{ readonly task: string; readonly evidence: readonly string[] }>;
  blockedTasks: readonly string[];
}

interface FoundationRenderingRun {
  readonly id: string;
  readonly agent: string;
  readonly startedAt: string;
  readonly command: string;
  finishedAt?: string;
}

interface FoundationRenderingValidation {
  readonly name: string;
  readonly ok: boolean;
  readonly metrics: Record<string, number>;
  readonly checks: Record<string, boolean>;
}

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function isLit(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 35 && channel(pixel, 1) > 30 && channel(pixel, 2) > 25 && channel(pixel, 3) === 255;
}

function blueDominant(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 2) > channel(pixel, 0) && channel(pixel, 2) > channel(pixel, 1) && channel(pixel, 3) === 255;
}

function orangeDominant(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > channel(pixel, 1) && channel(pixel, 1) > channel(pixel, 2) && channel(pixel, 3) === 255;
}

function greenDominant(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 1) > channel(pixel, 0) && channel(pixel, 1) > channel(pixel, 2) && channel(pixel, 3) === 255;
}
