import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/spatial-audio-lab");

test("public spatial-audio gallery unlocks and exercises the package-owned HRTF graph", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/spatial-audio-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_SPATIAL_AUDIO_LAB__?.runtimeBackend === "production-runtime", undefined, { timeout: 120_000 });
    const initial = await evidence(page);
    expect(initial).toMatchObject({
      status: "ready", claim: "public-browser-standard-spatial-audio", assetId: "showcaseHeadphones",
      assetHash: "sha256-40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833",
      packageOwner: "@aura3d/audio", contextState: "locked", unlocked: false, graphCreated: false,
      positions: { left: [-2.5, 0.85, 0], right: [2.5, 0.85, 0] }, sourceStates: { left: "idle", right: "idle" },
      plays: 0, swaps: 0, muted: false, runtimeBackend: "production-runtime", errors: []
    });
    assertAssetHash();
    assertSourceBoundary();
    const initialCapture = await capture(page, "initial");

    await page.getByRole("button", { name: "Play spatial sweep" }).click();
    await page.waitForFunction(() => window.__AURA3D_SPATIAL_AUDIO_LAB__?.status === "complete", undefined, { timeout: 10_000 });
    const complete = await evidence(page);
    expect(complete).toMatchObject({
      status: "complete", contextState: "running", unlocked: true, graphCreated: true,
      panningModel: "HRTF", distanceModel: "inverse", positions: { left: [2.5, 0.85, 0], right: [-2.5, 0.85, 0] },
      sourceStates: { left: "stopped", right: "stopped" }, plays: 1, swaps: 0, muted: false, errors: []
    });
    const completeCapture = await capture(page, "complete");
    expect(completeCapture.canvasSha256).not.toBe(initialCapture.canvasSha256);

    await page.keyboard.press("KeyM");
    await page.waitForFunction(() => window.__AURA3D_SPATIAL_AUDIO_LAB__?.muted === true);
    const muted = await evidence(page);
    expect(muted.contextState).toBe("running");
    await page.keyboard.press("KeyS");
    await page.waitForFunction(() => window.__AURA3D_SPATIAL_AUDIO_LAB__?.swaps === 1);
    const swapped = await evidence(page);
    expect(swapped.positions).toEqual({ left: [-2.5, 0.85, 0], right: [2.5, 0.85, 0] });
    await page.keyboard.press("KeyR");
    const reset = await evidence(page);
    expect(reset.status).toBe("ready");
    expect(reset.positions).toEqual({ left: [-2.5, 0.85, 0], right: [2.5, 0.85, 0] });

    const lifecycle = await page.evaluate(() => window.__AURA3D_SPATIAL_AUDIO_DISPOSE__?.());
    expect(lifecycle).toEqual({ contextClosed: true, sourcesDisposed: true, pannersDisconnected: true, visualDisposed: true });
    expect(errors).toEqual([]);

    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify({
      schema: "aura3d.spatial-audio-gallery-browser/1.0", generatedAt: new Date().toISOString(), pass: true,
      initial, complete, muted, swapped, reset, lifecycle, artifacts: [initialCapture, completeCapture],
      comparisonBoundary: "The route proves one user-unlocked Chromium AudioContext graph built through public @aura3d/audio nodes: an Aura mixer bus, two AudioSource clips, and two HRTF SpatialAudio panners with live positions. Its 3D stage explains verified node state; screenshots do not prove audibility, perceptual localization, speaker hardware, or cross-device acoustic parity."
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: Page): Promise<any> { return page.evaluate(() => structuredClone(window.__AURA3D_SPATIAL_AUDIO_LAB__)); }
async function capture(page: Page, state: string): Promise<{ state: string; pagePath: string; pageBytes: number; canvasPath: string; canvasBytes: number; canvasSha256: string }> {
  await page.waitForTimeout(250);
  const pagePath = resolve(REPORT_ROOT, `public-${state}-page.png`); const canvasPath = resolve(REPORT_ROOT, `public-${state}-canvas.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  const dataUrl = await page.locator("canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"); writeFileSync(canvasPath, bytes);
  return { state, pagePath: pagePath.replace(`${process.cwd()}/`, ""), pageBytes: statSync(pagePath).size, canvasPath: canvasPath.replace(`${process.cwd()}/`, ""), canvasBytes: bytes.byteLength, canvasSha256: createHash("sha256").update(bytes).digest("hex") };
}
function assertAssetHash(): void { expect(createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex")).toBe("40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833"); }
function assertSourceBoundary(): void {
  const source = readFileSync(resolve("examples/spatial-audio-lab/main.ts"), "utf8");
  expect(source).toContain('from "@aura3d/engine"'); expect(source).toContain('from "@aura3d/audio"'); expect(source).toContain("assets.showcaseHeadphones");
  expect(source).not.toMatch(/from\s+["']three|@aura3d\/(?:rendering|scene)|packages\/|new\s+AudioContext|createPanner\(|createBufferSource\(|new\s+PannerNode|new\s+AudioBufferSourceNode/);
}
export {};
