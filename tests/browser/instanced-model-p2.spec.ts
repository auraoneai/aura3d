import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/instanced-model-p2-harness.ts");

test.describe("P2 instanced-GLB at root — rendered 4k pixel proof", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness imports only the root public API", () => {
    const source = readFileSync(harnessSource, "utf8");
    expect(source).toContain('from "@aura3d/engine"');
    expect(source).not.toMatch(/from\s+["'](?:three|@aura3d\/rendering|@aura3d\/engine\/rendering|@aura3d\/engine\/production-runtime|@aura3d\/assets|@aura3d\/assets\/browser|@aura3d\/animation)/);
    expect(source).not.toContain("GLTFLoader");
    expect(source).not.toContain("unsafeModelUrl");
    expect(source).not.toMatch(/model\(\s*["'`]/);
    // Typed GLB refs via defineAuraAssets are the sanctioned path (same as C1
    // png fixtures): every .glb url below rides a hashed typed asset, never a
    // string model id or unsafe URL.
    expect(source).toContain('type: "model"');
  });

  test("4k-instance GLB scene renders in 1-draw class with pixel proof", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const responseErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      responseErrors.push(`failed ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });

    await page.goto(`${server.origin}/tests/browser/instanced-model-p2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_P2_INSTANCED_MODEL__?.status === "ready" || window.__AURA3D_P2_INSTANCED_MODEL__?.status === "error",
      undefined,
      { timeout: 180_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_P2_INSTANCED_MODEL__);
    mkdirSync(resolve("tests/reports/instanced-model-p2"), { recursive: true });
    writeFileSync(resolve("tests/reports/instanced-model-p2/p2-result.json"), `${JSON.stringify({ ...result, pageErrors, consoleErrors, responseErrors }, null, 2)}\n`);
    const screenshot = await page.screenshot({ path: resolve("tests/reports/instanced-model-p2/p2-capture.png") });

    expect(result?.status, result?.error ?? pageErrors.join("\n")).toBe("ready");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(responseErrors).toEqual([]);
    expect(screenshot.byteLength).toBeGreaterThan(1000);

    // Route-health contract on every capture: typed asset ready, drawing, no errors.
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "ground-only",
      "single-close",
      "single",
      "instanced-64",
      "instanced-4000",
      "single-textured-unlit",
      "instanced-textured-unlit-120",
      "fallback-8"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.assetStatus, `${capture.id} asset`).toBe(capture.id === "ground-only" ? "missing" : "ready");
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      expect(capture.backend, capture.id).toBe("production-runtime");
      expect(capture.errorCount, capture.id).toBe(0);
      expect(capture.image.nonDarkPixels, capture.id).toBeGreaterThan(100);
    }

    // The beacon renders through root model(): the ground-free close-up shows
    // lit beacon pixels (bright > 50) instead of an empty frame.
    const singleClose = result?.captures?.find((capture) => capture.id === "single-close");
    expect(singleClose?.image.brightPixels ?? 0).toBeGreaterThan(50);

    // 1-draw class: 4000 instances draw in the same class as 1 (native
    // instanced submissions observed on the device, no per-instance expansion).
    const draws4000 = Number(result?.checks?.draws4000 ?? -1);
    const drawsSingle = Number(result?.checks?.drawsSingle ?? -1);
    expect(draws4000).toBeGreaterThan(0);
    expect(draws4000).toBeLessThanOrEqual(drawsSingle + 4);
    expect(Number(result?.checks?.instancedSubmissions4000 ?? 0)).toBeGreaterThan(0);

    // Textured-unlit breadth: 120 instances of the textured lander draw in
    // the same class as one, with native instanced submissions observed.
    const drawsUnlit120 = Number(result?.checks?.drawsUnlit120 ?? -1);
    const drawsSingleUnlit = Number(result?.checks?.drawsSingleUnlit ?? -1);
    expect(drawsUnlit120).toBeGreaterThan(0);
    expect(drawsUnlit120).toBeLessThanOrEqual(drawsSingleUnlit + 4);
    expect(Number(result?.checks?.instancedSubmissionsUnlit120 ?? 0)).toBeGreaterThan(0);
    expect(Number(result?.checks?.pixelDiffUnlitSingleVs120 ?? 0)).toBeGreaterThan(500);

    // Pixel proof: the 4k field reads very differently from the single beacon.
    // (nonDark saturates on the lit ground in both scenes, so the beacons'
    // bright pixels + the composite checksum diff carry the discrimination.)
    expect(Number(result?.checks?.pixelDiffSingleVs4000 ?? 0)).toBeGreaterThan(1000);
    const bright4000 = result?.captures?.find((capture) => capture.id === "instanced-4000")?.image.brightPixels ?? 0;
    const brightSingle = result?.captures?.find((capture) => capture.id === "single")?.image.brightPixels ?? 0;
    expect(bright4000).toBeGreaterThan(brightSingle + 1000);

    // D1 footgun impossible silently: the unaware material warns from root.
    expect(result?.checks?.fallbackWarns).toBe(true);
  });
});

declare global {
  interface Window {
    __AURA3D_P2_INSTANCED_MODEL__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly instanceCount: number;
        readonly drawCalls: number;
        readonly assetStatus: string;
        readonly backend: string;
        readonly errorCount: number;
        readonly warnings: readonly string[];
        readonly image: {
          readonly nonDarkPixels: number;
          readonly brightPixels: number;
          readonly colorBuckets: number;
          readonly spatialChecksum: number;
        };
      }[];
      readonly checks?: Record<string, number | string | boolean>;
      readonly error?: string;
    };
  }
}
