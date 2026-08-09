import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/primitive-scene");

test.describe("current head-to-head primitive workload", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_DIRECTORY, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  test("renders the frozen scene contract through public Aura3D and actual Three.js r185", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/benchmark/current-head-to-head/primitive-scene/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_PRIMITIVE__ || window.__AURA_THREE_HEAD_TO_HEAD_PRIMITIVE_ERROR__), undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => ({ state: window.__AURA_THREE_HEAD_TO_HEAD_PRIMITIVE__, error: window.__AURA_THREE_HEAD_TO_HEAD_PRIMITIVE_ERROR__ }));
    expect(result.error ?? errors.join(" | ")).toBeFalsy();
    expect(result.state).toMatchObject({
      ready: true,
      workload: "primitive-scene",
      contract: { viewport: { width: 1440, height: 900, dpr: 1 }, camera: { position: [8, 6, 12], target: [0, 1, 0], fovYDegrees: 45, near: 0.1, far: 500 }, color: { output: "srgb", toneMapping: "aces", exposure: 1 } },
      aura: { publicPackageOnly: true },
      three: { revision: "185", actualRenderer: true }
    });
    expect(result.state!.aura.drawCalls).toBe(3);
    expect(result.state!.three.drawCalls).toBe(3);
    expect(result.state!.aura.litPixels).toBeGreaterThan(25_000);
    expect(result.state!.three.litPixels).toBeGreaterThan(25_000);
    const captures = await page.evaluate(() => ({
      aura: (document.getElementById("aura") as HTMLCanvasElement).toDataURL("image/png"),
      three: (document.getElementById("three") as HTMLCanvasElement).toDataURL("image/png")
    }));
    const auraImage = Buffer.from(captures.aura.replace(/^data:image\/png;base64,/, ""), "base64");
    const threeImage = Buffer.from(captures.three.replace(/^data:image\/png;base64,/, ""), "base64");
    writeFileSync(resolve(REPORT_DIRECTORY, "aura.png"), auraImage);
    writeFileSync(resolve(REPORT_DIRECTORY, "three.png"), threeImage);
    expect(auraImage.byteLength).toBeGreaterThan(10_000);
    expect(threeImage.byteLength).toBeGreaterThan(10_000);
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, workload: "primitive-scene", ...result.state }, null, 2)}\n`);
  });
});
