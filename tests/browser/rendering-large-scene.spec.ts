import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const LARGE_WORLD_REPORT_ROOT = resolve("tests/reports/2.0-visual-audit/examples");

test.describe("rendering large scene WebGL2 harness", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders 5,000 static meshes with LOD, static batching, and stable camera timing through Renderer on WebGL2", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><title>Large Scene Harness</title></head>
        <body>
          <canvas id="large-scene" width="256" height="256"></canvas>
          <script type="module">
            import { runLargeSceneHarness } from "${server.origin}/examples/rendering-large-scene/harness.js";
            void runLargeSceneHarness();
          </script>
        </body>
      </html>
    `);
    await page.waitForFunction(
      () => window.__AURA3D_LARGE_SCENE_TEST__?.status === "ready" || window.__AURA3D_LARGE_SCENE_TEST__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_LARGE_SCENE_TEST__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.staticMeshes).toBe(5_000);
    expect(result?.instances).toBe(10_000);
    expect(result?.instancedBatches).toBe(157);
    expect(result?.textureVariants).toBe(8);
    expect(result?.materialVariants).toBeGreaterThanOrEqual(15);
    expect(result?.lod?.enabled).toBe(true);
    expect(result?.lod?.levels).toEqual(["high", "medium", "low"]);
    expect((result?.lod?.selectedHigh ?? 0) + (result?.lod?.selectedMedium ?? 0) + (result?.lod?.selectedLow ?? 0)).toBe(4_999);
    expect(result?.lod?.selectedLow ?? 0).toBeGreaterThan(0);
    expect(result?.batching?.enabled).toBe(true);
    expect(result?.batching?.logicalStaticMeshes).toBe(5_000);
    expect(result?.batching?.submittedStaticDraws ?? 0).toBeLessThan(160);
    expect(result?.batching?.staticBatches ?? 0).toBeGreaterThan(0);
    expect(result?.batching?.drawCallReduction ?? 0).toBeGreaterThan(4_800);
    expect(result?.cameraTiming?.samples).toHaveLength(6);
    expect(result?.cameraTiming?.stable).toBe(true);
    expect(result?.cameraTiming?.jitterMs ?? 999).toBeLessThan(250);
    expect(result?.diagnostics?.drawCalls ?? 0).toBeLessThan(320);
    expect(result?.diagnostics?.drawCalls).toBe((result?.batching?.submittedStaticDraws ?? 0) + 157 + 8);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.diagnostics?.textures).toBeGreaterThanOrEqual(8);
    expect(result?.diagnostics?.textureBytes).toBeGreaterThanOrEqual(8 * 4 * 4 * 4);
    expect(result?.canvasFrame).toEqual({ width: 256, height: 256 });

    const [r = 0, g = 0, b = 0, a = 0] = result?.centerPixel ?? [];
    expect(r).toBeGreaterThan(170);
    expect(g).toBeGreaterThan(20);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(50);
    expect(a).toBe(255);

    const [tr = 0, tg = 0, tb = 0, ta = 0] = result?.textureProbePixel ?? [];
    expect(tr + tg + tb).toBeGreaterThan(20);
    expect(ta).toBe(255);
  });

  test("public example presents native root instancing and camera-sensitive distance LOD as a coherent large world", async ({ page }) => {
    mkdirSync(LARGE_WORLD_REPORT_ROOT, { recursive: true });
    await page.goto(`${server.origin}/examples/rendering-large-scene/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_LARGE_WORLD__?.status === "ready" || window.__AURA3D_LARGE_WORLD__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_LARGE_WORLD__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.claim).toBe("createAuraApp-root-instancing-and-distance-lod-example");
    expect(result?.instanceCount).toBe(2_500);
    expect(result?.instanceFamilies).toBe(1);
    expect(result?.nativeInstancedSubmissions ?? 0).toBeGreaterThan(0);
    expect(result?.runtimeBackend).toBe("production-runtime");
    expect(result?.activeLod).toBeTruthy();
    expect(result?.drawCalls ?? 0).toBeGreaterThan(0);
    expect(result?.errors).toEqual([]);
    await expect(page.getByRole("heading", { name: "Data Highlands" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Near detail" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Far LOD" })).toBeVisible();

    const overviewLod = result?.activeLod;
    await page.getByRole("button", { name: "Near detail" }).click();
    await page.waitForFunction(() => window.__AURA3D_LARGE_WORLD__?.status === "ready" && window.__AURA3D_LARGE_WORLD__.view === "near" && window.__AURA3D_LARGE_WORLD__.revision === 1);
    const near = await page.evaluate(() => window.__AURA3D_LARGE_WORLD__);
    expect(near?.activeLod).toBe("near detailed cylindrical tower");
    expect(near?.nativeInstancedSubmissions ?? 0).toBeGreaterThan(0);
    expect(near?.errors).toEqual([]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(LARGE_WORLD_REPORT_ROOT, "examples--rendering-large-scene--near-page.png"), fullPage: true });
    await page.locator("canvas").screenshot({ path: resolve(LARGE_WORLD_REPORT_ROOT, "examples--rendering-large-scene--near-canvas.png") });

    await page.getByRole("button", { name: "Far LOD" }).click();
    await page.waitForFunction(() => window.__AURA3D_LARGE_WORLD__?.status === "ready" && window.__AURA3D_LARGE_WORLD__.view === "far" && window.__AURA3D_LARGE_WORLD__.revision === 2);
    const far = await page.evaluate(() => window.__AURA3D_LARGE_WORLD__);
    expect(far?.activeLod).toBe("far simplified box tower");
    expect(far?.activeLod).not.toBe(near?.activeLod);
    expect(far?.nativeInstancedSubmissions ?? 0).toBeGreaterThan(0);
    expect(far?.errors).toEqual([]);
    expect(overviewLod).toBeTruthy();
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(LARGE_WORLD_REPORT_ROOT, "examples--rendering-large-scene--far-page.png"), fullPage: true });
    await page.locator("canvas").screenshot({ path: resolve(LARGE_WORLD_REPORT_ROOT, "examples--rendering-large-scene--far-canvas.png") });
  });
});

declare global {
  interface Window {
    __AURA3D_LARGE_WORLD__?: {
      readonly status: "loading" | "ready" | "error";
      readonly claim: "createAuraApp-root-instancing-and-distance-lod-example";
      readonly view: "overview" | "near" | "far";
      readonly revision: number;
      readonly instanceCount: number;
      readonly instanceFamilies: number;
      readonly nativeInstancedSubmissions?: number;
      readonly activeLod?: string;
      readonly drawCalls?: number;
      readonly runtimeBackend?: string;
      readonly errors: readonly string[];
      readonly error?: string;
    };
    __AURA3D_LARGE_SCENE_TEST__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly staticMeshes?: number;
      readonly instances?: number;
      readonly instancedBatches?: number;
      readonly textureVariants?: number;
      readonly materialVariants?: number;
      readonly lod?: {
        readonly enabled: boolean;
        readonly levels: readonly string[];
        readonly selectedHigh: number;
        readonly selectedMedium: number;
        readonly selectedLow: number;
      };
      readonly batching?: {
        readonly enabled: boolean;
        readonly logicalStaticMeshes: number;
        readonly submittedStaticDraws: number;
        readonly staticBatches: number;
        readonly drawCallReduction: number;
      };
      readonly cameraTiming?: {
        readonly samples: readonly number[];
        readonly stable: boolean;
        readonly jitterMs: number;
      };
      readonly frameMs?: number;
      readonly diagnostics?: {
        readonly drawCalls: number;
        readonly textures: number;
        readonly textureBytes: number;
        readonly lastError: string | null;
      };
      readonly centerPixel?: readonly number[];
      readonly textureProbePixel?: readonly number[];
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly error?: string;
    };
  }
}
