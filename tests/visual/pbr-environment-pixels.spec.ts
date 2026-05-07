import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

declare global {
  interface Window {
    __GALILEO3D_PBR_MATERIAL_LAB__?: {
      status: "ready" | "error";
      renderer: "webgl2";
      environmentLighting: "sampled-environment-map-approximation";
      lightingModel: "direct-lights-plus-sampled-environment-map";
      diagnostics?: { drawCalls: number; lastError: string | null };
      canvasFrame?: { width: number; height: number };
      pixels?: Record<string, readonly number[]>;
      error?: string;
    };
    __GALILEO3D_PBR_CAMERA_COMPARISON__?: {
      status: "ready" | "error";
      renderer: "webgl2";
      referenceRenderer: "three";
      cameraPath: "scene-perspective-camera";
      environmentLighting: "sampled-environment-map-approximation";
      lightingModel: "direct-lights-plus-sampled-environment-map";
      claimBoundary: "bounded-camera-pbr-reference-comparison";
      diagnostics?: { drawCalls: number; lastError: string | null };
      canvasFrame?: { width: number; height: number };
      materialChecks?: Record<string, { galileo: readonly number[]; reference: readonly number[]; galileoPass: boolean; referencePass: boolean }>;
      error?: string;
    };
  }
}

test.describe("PBR material lab pixels", () => {
  let server: ExampleDevServer;
  const report: PbrEnvironmentValidationReport = {
    ok: false,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-pbr-environment-validation-run",
    gitSha: gitSha(),
    command: "pnpm exec playwright test tests/visual/pbr-environment-pixels.spec.ts",
    environment: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      ci: process.env.CI === "true"
    },
    sourceInputs: [
      "examples/pbr-material-lab/index.html",
      "examples/pbr-material-lab/main.ts",
      "examples/pbr-camera-comparison/index.html",
      "examples/pbr-camera-comparison/main.ts",
      "packages/rendering/src/EnvironmentMapResources.ts",
      "packages/rendering/src/PBRMaterial.ts",
      "packages/rendering/src/ForwardPass.ts",
      "packages/rendering/src/Renderer.ts",
      "packages/rendering/src/ShaderLibrary.ts",
      "packages/rendering/src/TextureBinding.ts",
      "docs/rendering/environment-lighting.md",
      "docs/v2/claim-registry.md",
      "tests/visual/pbr-environment-pixels.spec.ts"
    ],
    artifactLinks: [
      "tests/reports/pbr-environment-validation.json",
      "tests/reports/visual-browser.json",
      "tests/reports/final-visual.json",
      "examples/pbr-camera-comparison/index.html",
      "docs/rendering/environment-lighting.md",
      "docs/v2/claim-registry.md"
    ],
    claimBoundary: {
      supported: "Renderer-backed WebGL2 PBR material lab and perspective-camera comparison against Three.js for a bounded sampled equirectangular RGBA8 environment-map approximation, roughness-dependent mip sampling, and BRDF LUT modulation.",
      unsupported: [
        "No production PBR parity claim.",
        "No HDR environment map input.",
        "No irradiance convolution, generated specular prefiltering, production BRDF integration, reflection probes, or full color-management parity claim.",
        "No broad better-than-Three.js visual/rendering-quality claim."
      ]
    },
    validations: [],
    violations: []
  };

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.violations.length === 0 && report.validations.some((entry) => entry.name === "pbr-material-lab");
    report.generatedAt = new Date().toISOString();
    const reportPath = resolve("tests/reports/pbr-environment-validation.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("renders PBR material pixels with a bounded sampled environment-map approximation and documents that physically correct IBL is not claimed", async ({ page }) => {
    await page.goto(`${server.origin}/examples/pbr-material-lab/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.waitForFunction(
      () => window.__GALILEO3D_PBR_MATERIAL_LAB__?.status === "ready" || window.__GALILEO3D_PBR_MATERIAL_LAB__?.status === "error",
      undefined,
      { timeout: 15_000 }
    ).then(() => page.evaluate(() => window.__GALILEO3D_PBR_MATERIAL_LAB__));

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.environmentLighting).toBe("sampled-environment-map-approximation");
    expect(result?.lightingModel).toBe("direct-lights-plus-sampled-environment-map");
    expect(result?.canvasFrame).toEqual({ width: 960, height: 540 });
    expect(result?.diagnostics?.drawCalls).toBe(4);
    expect(result?.diagnostics?.lastError).toBeNull();

    const pixelDetail = JSON.stringify(result?.pixels);
    const validation = {
      name: "pbr-material-lab",
      renderer: result?.renderer ?? "missing",
      environmentLighting: result?.environmentLighting ?? "missing",
      lightingModel: result?.lightingModel ?? "missing",
      drawCalls: result?.diagnostics?.drawCalls ?? 0,
      canvasFrame: result?.canvasFrame ?? { width: 0, height: 0 },
      pixels: result?.pixels ?? {},
      checks: {
        dielectricSmooth: isLitDielectric(result?.pixels?.dielectricSmooth),
        dielectricRough: isLitDielectric(result?.pixels?.dielectricRough),
        metalSmooth: isGoldMetal(result?.pixels?.metalSmooth),
        emissive: isEmissiveGreen(result?.pixels?.emissive)
      }
    };
    report.validations.push(validation);
    if (
      validation.renderer !== "webgl2" ||
      validation.environmentLighting !== "sampled-environment-map-approximation" ||
      validation.lightingModel !== "direct-lights-plus-sampled-environment-map" ||
      validation.drawCalls !== 4 ||
      validation.canvasFrame.width !== 960 ||
      validation.canvasFrame.height !== 540 ||
      !Object.values(validation.checks).every(Boolean)
    ) {
      report.violations.push({ target: validation.name, message: JSON.stringify(validation) });
    }

    expect(validation.checks.dielectricSmooth, pixelDetail).toBe(true);
    expect(validation.checks.dielectricRough, pixelDetail).toBe(true);
    expect(validation.checks.metalSmooth, pixelDetail).toBe(true);
    expect(validation.checks.emissive, pixelDetail).toBe(true);
  });

  test("renders a perspective-camera PBR scene next to a Three.js reference scene for the bounded claim niche", async ({ page }) => {
    await page.goto(`${server.origin}/examples/pbr-camera-comparison/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.waitForFunction(
      () => window.__GALILEO3D_PBR_CAMERA_COMPARISON__?.status === "ready" || window.__GALILEO3D_PBR_CAMERA_COMPARISON__?.status === "error",
      undefined,
      { timeout: 15_000 }
    ).then(() => page.evaluate(() => window.__GALILEO3D_PBR_CAMERA_COMPARISON__));

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.referenceRenderer).toBe("three");
    expect(result?.cameraPath).toBe("scene-perspective-camera");
    expect(result?.environmentLighting).toBe("sampled-environment-map-approximation");
    expect(result?.lightingModel).toBe("direct-lights-plus-sampled-environment-map");
    expect(result?.claimBoundary).toBe("bounded-camera-pbr-reference-comparison");
    expect(result?.canvasFrame).toEqual({ width: 480, height: 360 });
    expect(result?.diagnostics?.drawCalls).toBe(3);
    expect(result?.diagnostics?.lastError).toBeNull();

    const checks = Object.entries(result?.materialChecks ?? {});
    const validation = {
      name: "pbr-camera-threejs-comparison",
      renderer: result?.renderer ?? "missing",
      referenceRenderer: result?.referenceRenderer ?? "missing",
      cameraPath: result?.cameraPath ?? "missing",
      environmentLighting: result?.environmentLighting ?? "missing",
      lightingModel: result?.lightingModel ?? "missing",
      drawCalls: result?.diagnostics?.drawCalls ?? 0,
      canvasFrame: result?.canvasFrame ?? { width: 0, height: 0 },
      materialChecks: result?.materialChecks ?? {},
      checks: {
        allGalileoMaterialsVisible: checks.length === 3 && checks.every(([, check]) => check.galileoPass),
        allReferenceMaterialsVisible: checks.length === 3 && checks.every(([, check]) => check.referencePass)
      }
    };
    await writePbrRenderingComparisonReport(page, validation);
    report.validations.push(validation);
    if (
      validation.renderer !== "webgl2" ||
      validation.referenceRenderer !== "three" ||
      validation.cameraPath !== "scene-perspective-camera" ||
      validation.environmentLighting !== "sampled-environment-map-approximation" ||
      validation.lightingModel !== "direct-lights-plus-sampled-environment-map" ||
      validation.drawCalls !== 3 ||
      validation.canvasFrame.width !== 480 ||
      validation.canvasFrame.height !== 360 ||
      !Object.values(validation.checks).every(Boolean)
    ) {
      report.violations.push({ target: validation.name, message: JSON.stringify(validation) });
    }

    expect(validation.checks.allGalileoMaterialsVisible, JSON.stringify(validation.materialChecks)).toBe(true);
    expect(validation.checks.allReferenceMaterialsVisible, JSON.stringify(validation.materialChecks)).toBe(true);
  });
});

async function writePbrRenderingComparisonReport(page: import("@playwright/test").Page, validation: {
  readonly name: string;
  readonly renderer: string;
  readonly referenceRenderer: string;
  readonly cameraPath: string;
  readonly environmentLighting: string;
  readonly lightingModel: string;
  readonly drawCalls: number;
  readonly canvasFrame: { readonly width: number; readonly height: number };
  readonly materialChecks: Record<string, { readonly galileo: readonly number[]; readonly reference: readonly number[]; readonly galileoPass: boolean; readonly referencePass: boolean }>;
  readonly checks: Record<string, boolean>;
}): Promise<void> {
  const artifactPaths = {
    galileo: "tests/reports/pbr-material-lab-galileo.png",
    threejs: "tests/reports/pbr-material-lab-threejs.png",
    diff: "tests/reports/pbr-material-lab-diff.png",
    report: "tests/reports/pbr-rendering-comparison.json"
  };
  mkdirSync(dirname(resolve(artifactPaths.report)), { recursive: true });
  await page.locator("[data-testid='pbr-comparison-galileo-canvas']").screenshot({ path: artifactPaths.galileo });
  await page.locator("[data-testid='pbr-comparison-three-canvas']").screenshot({ path: artifactPaths.threejs });
  const capture = await page.evaluate(() => {
    function readCanvas(selector: string): { width: number; height: number; data: number[] } {
      const canvas = document.querySelector<HTMLCanvasElement>(selector);
      if (!canvas) throw new Error(`Missing canvas ${selector}`);
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) throw new Error(`Missing WebGL context for ${selector}`);
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return { width: canvas.width, height: canvas.height, data: Array.from(data) };
    }
    const galileo = readCanvas("[data-testid='pbr-comparison-galileo-canvas']");
    const threejs = readCanvas("[data-testid='pbr-comparison-three-canvas']");
    const diffCanvas = document.createElement("canvas");
    diffCanvas.width = galileo.width;
    diffCanvas.height = galileo.height;
    const context = diffCanvas.getContext("2d");
    if (!context) throw new Error("Missing 2D context for PBR diff canvas.");
    const image = context.createImageData(galileo.width, galileo.height);
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = Math.min(255, Math.abs((galileo.data[index] ?? 0) - (threejs.data[index] ?? 0)) * 3);
      image.data[index + 1] = Math.min(255, Math.abs((galileo.data[index + 1] ?? 0) - (threejs.data[index + 1] ?? 0)) * 3);
      image.data[index + 2] = Math.min(255, Math.abs((galileo.data[index + 2] ?? 0) - (threejs.data[index + 2] ?? 0)) * 3);
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return { galileo, threejs, diffPngBase64: diffCanvas.toDataURL("image/png").split(",")[1] ?? "" };
  });
  writeFileSync(resolve(artifactPaths.diff), Buffer.from(capture.diffPngBase64, "base64"));

  const sceneDescriptor = {
    claim: "bounded-perspective-camera-pbr-comparison",
    galileoRenderer: "webgl2",
    referenceRenderer: "three",
    referencePackage: "three@^0.165.0",
    resolution: validation.canvasFrame,
    camera: { type: "perspective", fovYDegrees: 45, position: [0, 0, 6], near: 0.1, far: 40 },
    lights: [
      { type: "directional", color: "#ffe6b8", intensity: 2.4 },
      { type: "point", color: "#599eff", intensity: 1.1, range: 9, position: [-2.2, 1.2, 2.5] }
    ],
    materials: [
      { id: "dielectric", baseColor: [0.85, 0.79, 0.66, 1], metallic: 0, roughness: 0.32 },
      { id: "metal", baseColor: [1, 0.62, 0.24, 1], metallic: 1, roughness: 0.12 },
      { id: "emissive", baseColor: [0.12, 0.48, 0.24, 1], roughness: 0.48, emissiveColor: [0.03, 0.85, 0.28], emissiveStrength: 1.6 }
    ],
    environment: {
      kind: "bounded-sampled-equirectangular-rgba8",
      size: [64, 32],
      galileoMipCount: 3,
      galileoBrdfLutSize: [32, 32],
      hdr: false,
      irradianceConvolution: false,
      generatedSpecularPrefilter: false
    }
  };
  const thresholds = {
    fullCanvasMeanDeltaMax: 90,
    fullCanvasChangedRatioMax: 1,
    roiMeanDeltaMax: 320,
    roiChangedRatioMax: 1
  };
  const regions = [
    { name: "dielectric", x: 105, y: 135, width: 80, height: 100 },
    { name: "metal", x: 210, y: 135, width: 80, height: 100 },
    { name: "emissive", x: 310, y: 135, width: 90, height: 100 }
  ] as const;
  const fullCanvas = comparePixelBuffers(capture.galileo, capture.threejs, { x: 0, y: 0, width: capture.galileo.width, height: capture.galileo.height }, 8);
  const roiMetrics = regions.map((region) => ({
    name: region.name,
    ...comparePixelBuffers(capture.galileo, capture.threejs, region, 8)
  }));
  const semanticChecksPassed = Object.values(validation.checks).every(Boolean);
  const deltaThresholdsPassed =
    fullCanvas.meanDelta <= thresholds.fullCanvasMeanDeltaMax &&
    fullCanvas.changedRatio <= thresholds.fullCanvasChangedRatioMax &&
    roiMetrics.every((entry) => entry.meanDelta <= thresholds.roiMeanDeltaMax && entry.changedRatio <= thresholds.roiChangedRatioMax);
  const report = {
    ok: semanticChecksPassed && deltaThresholdsPassed,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-pbr-rendering-comparison-run",
    gitSha: gitSha(),
    command: "pnpm exec playwright test tests/visual/pbr-environment-pixels.spec.ts",
    sourceInputs: [
      "examples/pbr-camera-comparison/index.html",
      "examples/pbr-camera-comparison/main.ts",
      "tests/visual/pbr-environment-pixels.spec.ts",
      "packages/rendering/src/Renderer.ts",
      "packages/rendering/src/ForwardPass.ts",
      "packages/rendering/src/ShaderLibrary.ts",
      "packages/rendering/src/EnvironmentMapResources.ts"
    ],
    claimBoundary: {
      supported: "One bounded perspective-camera WebGL2 PBR scene is rendered in Galileo3D and a same-page Three.js reference with retained screenshots, semantic material checks, and recorded delta metrics.",
      unsupported: [
        "No production PBR parity claim.",
        "No HDR environment map input.",
        "No irradiance convolution, generated specular prefiltering, production BRDF integration, reflection probes, or full color-management parity claim.",
        "No broad better-than-Three.js visual/rendering-quality claim."
      ]
    },
    sceneDescriptor,
    sceneDescriptorHash: createHash("sha256").update(JSON.stringify(sceneDescriptor)).digest("hex"),
    artifacts: artifactPaths,
    thresholds,
    metrics: { fullCanvas, roiMetrics },
    semanticChecks: validation.checks,
    materialChecks: validation.materialChecks,
    violations: [
      ...(semanticChecksPassed ? [] : ["semantic material checks failed"]),
      ...(deltaThresholdsPassed ? [] : ["screenshot delta thresholds failed"])
    ]
  };
  writeFileSync(resolve(artifactPaths.report), `${JSON.stringify(report, null, 2)}\n`);
}

function comparePixelBuffers(
  left: PixelBuffer,
  right: PixelBuffer,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  tolerance: number
): { readonly checkedPixels: number; readonly changedPixels: number; readonly changedRatio: number; readonly meanDelta: number; readonly maxDelta: number } {
  if (left.width !== right.width || left.height !== right.height || left.data.length !== right.data.length) {
    throw new Error("PBR comparison buffers must have matching dimensions.");
  }
  let checkedPixels = 0;
  let changedPixels = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = (y * left.width + x) * 4;
      const delta =
        Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)) +
        Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0)) +
        Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0)) +
        Math.abs((left.data[index + 3] ?? 0) - (right.data[index + 3] ?? 0));
      checkedPixels += 1;
      totalDelta += delta;
      maxDelta = Math.max(maxDelta, delta);
      if (delta > tolerance) {
        changedPixels += 1;
      }
    }
  }
  return {
    checkedPixels,
    changedPixels,
    changedRatio: checkedPixels === 0 ? 0 : changedPixels / checkedPixels,
    meanDelta: checkedPixels === 0 ? 0 : totalDelta / checkedPixels,
    maxDelta
  };
}

interface PbrEnvironmentValidationReport {
  ok: boolean;
  generatedAt: string;
  releaseRunId: string;
  gitSha: string;
  command: string;
  environment: {
    platform: string;
    release: string;
    arch: string;
    cpuModel: string;
    cpuCount: number;
    totalMemoryBytes: number;
    ci: boolean;
  };
  sourceInputs: readonly string[];
  artifactLinks: readonly string[];
  claimBoundary: {
    supported: string;
    unsupported: readonly string[];
  };
  validations: PbrEnvironmentValidation[];
  violations: Array<{ target: string; message: string }>;
}

interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
}

interface PbrEnvironmentValidation {
  name: string;
  renderer: string;
  environmentLighting: string;
  lightingModel: string;
  drawCalls: number;
  canvasFrame: { width: number; height: number };
  pixels?: Record<string, readonly number[]>;
  materialChecks?: Record<string, { galileo: readonly number[]; reference: readonly number[]; galileoPass: boolean; referencePass: boolean }>;
  checks: Record<string, boolean>;
}

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function isLitDielectric(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 45 && channel(pixel, 1) > 40 && channel(pixel, 2) > 35 && channel(pixel, 3) === 255;
}

function isGoldMetal(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 70 && channel(pixel, 1) > 40 && channel(pixel, 2) < 90 && channel(pixel, 3) === 255;
}

function isEmissiveGreen(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 1) > 90 && channel(pixel, 0) < 90 && channel(pixel, 3) === 255;
}

function gitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}
