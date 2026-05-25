import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/foundation-threejs-comparison");
const captures: ComparisonCapture[] = [];

const scenes = [
  { id: "product", g3dModule: "product-scene", g3dExport: "renderGalileoProductScene", threeModule: "product-scene", threeExport: "renderThreeProductScene" },
  { id: "material", g3dModule: "material-scene", g3dExport: "renderGalileoMaterialScene", threeModule: "material-scene", threeExport: "renderThreeMaterialScene" },
  { id: "asset", g3dModule: "asset-scene", g3dExport: "renderGalileoAssetScene", threeModule: "asset-scene", threeExport: "renderThreeAssetScene" },
  { id: "interactive", g3dModule: "interactive-scene", g3dExport: "renderGalileoInteractiveScene", threeModule: "interactive-scene", threeExport: "renderThreeInteractiveScene" }
] as const;

test.describe("V3 same-scene Three.js comparison", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    writeFileSync(join(reportDir, "manifest.json"), `${JSON.stringify({
      schema: "g3d-foundation-threejs-comparison-browser/v1",
      generatedAt: new Date().toISOString(),
      scenes: scenes.map((scene) => scene.id),
      captures,
      pass: captures.length === scenes.length
        && captures.every((capture) => capture.g3d.bytes > 10_000 && capture.threejs.bytes > 10_000 && capture.diff.bytes > 5_000 && capture.g3d.drawCalls > 0 && capture.threejs.drawCalls > 0)
    }, null, 2)}\n`);
  });

  for (const scene of scenes) {
    test(`${scene.id} scene captures G3D, Three.js, and diff images`, async ({ page }) => {
      await page.goto(server.origin, { waitUntil: "domcontentloaded" });
      const metrics = await page.evaluate(async ({ origin, scene }) => {
        const g3dModule = await import(`${origin}/benchmarks/foundation/galileo/${scene.g3dModule}.ts`);
        const threeModule = await import(`${origin}/benchmarks/foundation/threejs/${scene.threeModule}.ts`);
        const g3d = await g3dModule[scene.g3dExport](origin);
        const threejs = await threeModule[scene.threeExport](origin);
        const diff = createDiffCanvas(scene.id, g3d.canvas, threejs.canvas);
        document.body.style.margin = "0";
        document.body.style.background = "#111413";
        document.body.style.display = "grid";
        document.body.style.gridTemplateColumns = "900px 900px 900px";
        document.body.replaceChildren(g3d.canvas, threejs.canvas, diff);
        return {
          sceneId: scene.id,
          g3d: {
            drawCalls: g3d.drawCalls,
            itemCount: g3d.itemCount,
            setupLines: g3d.setupLines,
            lastError: g3d.diagnostics.lastError,
            gaps: g3d.gaps
          },
          threejs: {
            drawCalls: threejs.drawCalls,
            itemCount: threejs.itemCount,
            setupLines: threejs.setupLines,
            gaps: threejs.gaps
          },
          diff: diff.dataset.meanDifference
        };

        function createDiffCanvas(id: string, left: HTMLCanvasElement, right: HTMLCanvasElement): HTMLCanvasElement {
          const width = left.width;
          const height = left.height;
          const diffCanvas = document.createElement("canvas");
          diffCanvas.dataset.testid = `${id}-diff`;
          diffCanvas.width = width;
          diffCanvas.height = height;
          diffCanvas.style.width = `${width}px`;
          diffCanvas.style.height = `${height}px`;
          const leftContext = left.getContext("2d") ?? copyWebglCanvas(left).getContext("2d");
          const rightContext = right.getContext("2d") ?? copyWebglCanvas(right).getContext("2d");
          const diffContext = diffCanvas.getContext("2d");
          if (!leftContext || !rightContext || !diffContext) throw new Error("Could not create comparison diff canvas.");
          const leftPixels = leftContext.getImageData(0, 0, width, height);
          const rightPixels = rightContext.getImageData(0, 0, width, height);
          const output = diffContext.createImageData(width, height);
          let total = 0;
          for (let index = 0; index < output.data.length; index += 4) {
            const dr = Math.abs(leftPixels.data[index] - rightPixels.data[index]);
            const dg = Math.abs(leftPixels.data[index + 1] - rightPixels.data[index + 1]);
            const db = Math.abs(leftPixels.data[index + 2] - rightPixels.data[index + 2]);
            const value = Math.max(dr, dg, db);
            output.data[index] = value;
            output.data[index + 1] = Math.round(value * 0.55);
            output.data[index + 2] = 255 - value;
            output.data[index + 3] = 255;
            total += value;
          }
          diffContext.putImageData(output, 0, 0);
          diffCanvas.dataset.meanDifference = String(total / (width * height));
          return diffCanvas;
        }

        function copyWebglCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const context = copy.getContext("2d");
          if (!context) throw new Error("Could not copy WebGL canvas.");
          context.drawImage(source, 0, 0);
          return copy;
        }
      }, { origin: server.origin, scene });

      expect(metrics.g3d.drawCalls).toBeGreaterThan(0);
      expect(metrics.threejs.drawCalls).toBeGreaterThan(0);
      expect(metrics.g3d.lastError).toBeNull();
      await screenshotScene(page, scene.id, "g3d", metrics.g3d);
      await screenshotScene(page, scene.id, "threejs", metrics.threejs);
      const diff = await screenshotScene(page, scene.id, "diff", { drawCalls: 1, itemCount: 1, setupLines: 0, gaps: [] });
      captures.push({
        sceneId: scene.id,
        g3d: captureFor(scene.id, "g3d", metrics.g3d),
        threejs: captureFor(scene.id, "threejs", metrics.threejs),
        diff: {
          ...diff,
          meanDifference: Number(metrics.diff)
        },
        ergonomicWin: metrics.g3d.setupLines < metrics.threejs.setupLines,
        gaps: [...metrics.g3d.gaps, ...metrics.threejs.gaps]
      });
    });
  }
});

async function screenshotScene(
  page: import("@playwright/test").Page,
  sceneId: string,
  engine: "g3d" | "threejs" | "diff",
  metrics: { readonly drawCalls: number; readonly itemCount: number; readonly setupLines: number; readonly gaps: readonly string[] }
): Promise<CaptureImage> {
  const path = join(reportDir, `${sceneId}-${engine}.png`);
  await page.locator(`[data-testid='${sceneId}-${engine === "threejs" ? "threejs" : engine}']`).screenshot({ path });
  const bytes = statSync(path).size;
  expect(bytes).toBeGreaterThan(engine === "diff" ? 5_000 : 10_000);
  return {
    path: path.replace(`${process.cwd()}/`, ""),
    bytes,
    drawCalls: metrics.drawCalls,
    itemCount: metrics.itemCount,
    setupLines: metrics.setupLines
  };
}

function captureFor(
  sceneId: string,
  engine: "g3d" | "threejs",
  metrics: { readonly drawCalls: number; readonly itemCount: number; readonly setupLines: number }
): CaptureImage {
  const path = join(reportDir, `${sceneId}-${engine}.png`);
  return {
    path: path.replace(`${process.cwd()}/`, ""),
    bytes: statSync(path).size,
    drawCalls: metrics.drawCalls,
    itemCount: metrics.itemCount,
    setupLines: metrics.setupLines
  };
}

interface CaptureImage {
  readonly path: string;
  readonly bytes: number;
  readonly drawCalls: number;
  readonly itemCount: number;
  readonly setupLines: number;
}

interface ComparisonCapture {
  readonly sceneId: string;
  readonly g3d: CaptureImage;
  readonly threejs: CaptureImage;
  readonly diff: CaptureImage & { readonly meanDifference: number };
  readonly ergonomicWin: boolean;
  readonly gaps: readonly string[];
}
