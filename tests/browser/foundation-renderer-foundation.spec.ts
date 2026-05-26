import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/foundation-renderer-foundation");
const captures: RendererFoundationCapture[] = [];

test.describe("Foundation renderer foundation", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    writeFileSync(join(reportDir, "manifest.json"), `${JSON.stringify({
      schema: "a3d-foundation-renderer-foundation",
      generatedAt: new Date().toISOString(),
      requiredFeatures: [
        "webgl2",
        "pbr",
        "textured-pbr",
        "normal-mapped-pbr",
        "emissive",
        "alpha",
        "environment-lighting",
        "renderer-owned-shadows",
        "postprocess",
        "resize",
        "diagnostics",
        "frame-capture"
      ],
      captures,
      pass: captures.length >= 4 && captures.every((capture) => capture.bytes > 10_000 && capture.lastError === null)
    }, null, 2)}\n`);
  });

  test("renders multiple real renderer states with public APIs", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    for (const scenario of [
      { id: "foundation", width: 960, height: 540, shadows: true, postprocess: true },
      { id: "no-postprocess", width: 960, height: 540, shadows: true, postprocess: false },
      { id: "no-shadows", width: 960, height: 540, shadows: false, postprocess: true },
      { id: "resized-portrait", width: 520, height: 700, shadows: true, postprocess: true }
    ] as const) {
      const result = await renderScenario(page, server.origin, scenario);
      const path = join(reportDir, `${scenario.id}.png`);
      await page.locator(`[data-testid='${scenario.id}-canvas']`).screenshot({ path });
      const bytes = statSync(path).size;
      expect(bytes).toBeGreaterThan(10_000);
      expect(result.diagnostics.lastError).toBeNull();
      expect(result.diagnostics.drawCalls).toBeGreaterThan(3);
      expect(result.stats.nonDarkRatio).toBeGreaterThan(0.08);
      expect(result.stats.colorBuckets).toBeGreaterThan(24);
      captures.push({
        id: scenario.id,
        path: relativeReportPath(path),
        bytes,
        hash: result.hash,
        drawCalls: result.diagnostics.drawCalls,
        lastError: result.diagnostics.lastError,
        stats: result.stats
      });
    }
  });
});

async function renderScenario(
  page: import("@playwright/test").Page,
  origin: string,
  scenario: { readonly id: string; readonly width: number; readonly height: number; readonly shadows: boolean; readonly postprocess: boolean }
): Promise<RendererFoundationResult> {
  return page.evaluate(async ({ origin, scenario }) => {
    const rendering = await import(`${origin}/packages/rendering/src/index.ts`);
    const scene = await import(`${origin}/packages/scene/src/index.ts`);
    const {
      Geometry,
      PBRMaterial,
      TexturedPBRMaterial,
      NormalMappedPBRMaterial,
      Renderer,
      Texture,
      analyzeRgbaFrameVisualMetrics,
      createLightingDefault
    } = rendering;
    const { DirectionalLight, composeMat4 } = scene;
    const canvas = document.createElement("canvas");
    canvas.width = scenario.width;
    canvas.height = scenario.height;
    canvas.style.width = `${scenario.width}px`;
    canvas.style.height = `${scenario.height}px`;
    canvas.dataset.testid = `${scenario.id}-canvas`;
    document.body.replaceChildren(canvas);

    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: scenario.width,
      height: scenario.height,
      clearColor: [0.018, 0.02, 0.022, 1],
      preserveDrawingBuffer: true
    });
    const white = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([240, 236, 220, 255]) });
    const blue = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([48, 120, 230, 255]) });
    const rough = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 128, 255, 255]) });
    const normal = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]) });
    const keyLight = new DirectionalLight("hr3-key-light");
    keyLight.intensity = 2.6;
    keyLight.color = [1, 0.92, 0.78];
    keyLight.castsShadow = scenario.shadows;
    const lighting = createLightingDefault("studioProduct");
    const source = {
      renderItems: [
        {
          label: "hr3-pbr-cube",
          geometry: Geometry.texturedCube(1),
          material: new PBRMaterial({ name: "hr3-red-metal", baseColor: [0.8, 0.12, 0.08, 1], metallic: 0.7, roughness: 0.26 }),
          modelMatrix: composeMat4([-1.35, 0, 0], [0, 0, 0, 1], [0.85, 0.85, 0.85])
        },
        {
          label: "hr3-textured-sphere",
          geometry: Geometry.uvSphere(0.55, 40, 20, { textured: true }),
          material: new TexturedPBRMaterial({
            name: "hr3-textured-blue",
            baseColor: [0.75, 0.85, 1, 1],
            baseColorTexture: blue,
            metallicRoughnessTexture: rough,
            normalTexture: normal,
            emissiveTexture: white,
            emissiveColor: [0.04, 0.08, 0.18],
            emissiveStrength: 0.5,
            roughness: 0.38
          }),
          modelMatrix: composeMat4([0, 0.04, 0], [0, 0, 0, 1], [1, 1, 1])
        },
        {
          label: "hr3-normal-mapped-cube",
          geometry: Geometry.texturedCube(1),
          material: new NormalMappedPBRMaterial({
            name: "hr3-normal-green",
            baseColor: [0.2, 0.78, 0.42, 1],
            normalTexture: normal,
            normalScale: 0.9,
            roughness: 0.5
          }),
          modelMatrix: composeMat4([1.28, 0, 0], [0, 0, 0, 1], [0.78, 0.78, 0.78])
        },
        {
          label: "hr3-alpha-glass",
          geometry: Geometry.uvSphere(0.46, 32, 16, { textured: true }),
          material: new PBRMaterial({
            name: "hr3-alpha-glass",
            baseColor: [0.68, 0.86, 1, 0.42],
            metallic: 0,
            roughness: 0.06,
            renderState: { blend: true, depthWrite: false }
          }),
          modelMatrix: composeMat4([0, 0.95, -0.15], [0, 0, 0, 1], [0.7, 0.7, 0.7])
        }
      ],
      cameraPolicy: "auto-frame",
      cameraFrameOptions: { paddingRatio: 0.18, yawRadians: -0.42, pitchRadians: -0.16 },
      collectedLights: [{
        kind: "directional",
        color: [1, 0.92, 0.78],
        intensity: 2.6,
        position: [0, 0, 0],
        direction: [0.4, -0.72, -0.58],
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        castsShadow: scenario.shadows,
        layerMask: 0xffffffff,
        source: keyLight
      }],
      environmentLighting: lighting.environmentLighting,
      shadow: scenario.shadows ? { ...lighting.shadow, targetFormat: "depth24", light: keyLight } : false,
      postprocess: scenario.postprocess ? { ...lighting.postprocess, targetFormat: "rgba8" } : false,
      cameraPosition: [0, 0, 4.5]
    };
    const frame = renderer.captureFrame(source);
    const stats = analyzeRgbaFrameVisualMetrics(frame.pixels, scenario.width, scenario.height, {
      darkLumaThreshold: 24,
      salientLumaThreshold: 42,
      bucketShift: 4,
      edgeLumaThreshold: 16
    });
    const hash = hashRgba8(frame.pixels);
    renderer.dispose();
    return {
      diagnostics: frame.diagnostics,
      stats,
      hash
    };

    function hashRgba8(data: Uint8Array): string {
      let hash = 0x811c9dc5;
      for (const value of data) {
        hash ^= value;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    }
  }, { origin, scenario });
}

function relativeReportPath(path: string): string {
  return path.replace(`${process.cwd()}/`, "");
}

interface RendererFoundationResult {
  readonly diagnostics: {
    readonly drawCalls: number;
    readonly lastError: string | null;
  };
  readonly stats: {
    readonly nonDarkRatio: number;
    readonly colorBuckets: number;
  };
  readonly hash: string;
}

interface RendererFoundationCapture {
  readonly id: string;
  readonly path: string;
  readonly bytes: number;
  readonly hash: string;
  readonly drawCalls: number;
  readonly lastError: string | null;
  readonly stats: {
    readonly nonDarkRatio: number;
    readonly colorBuckets: number;
  };
}
