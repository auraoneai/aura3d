import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";

const ROUTE = "/";
const APP_ROOT = resolve("apps/showcase-meshy-relic-pilot");
const REPORT_DIR = resolve("tests/reports/meshy-relic-pilot");
interface Evidence {
  ready: boolean; state: "seeking" | "collected"; objective: "reach-relic" | "relic-secured"; score: number;
  player: { x: number; z: number }; relicVisible: boolean; collectionCount: number; resetCount: number;
  drawCalls: number; renderSize: readonly number[]; rendererBackend: string; errors: readonly string[];
  primaryAsset: string; assetReference: string; capabilityLabel: string; routeLabel: string;
  mechanic: string; collisionPlan: string;
}
function evidence(page: Page): Promise<Evidence> {
  return page.evaluate(() => {
    const value = (window as unknown as { __MESHY_RELIC_PILOT__?: Evidence }).__MESHY_RELIC_PILOT__;
    if (!value) throw new Error("Meshy relic pilot evidence is missing.");
    return value;
  });
}
async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __MESHY_RELIC_PILOT__?: Evidence }).__MESHY_RELIC_PILOT__?.ready === true, undefined, { timeout: 90_000 });
}
async function canvasPixels(page: Page): Promise<{ nonBlackRatio: number; uniqueColors: number }> {
  return page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const probe = document.createElement("canvas"); probe.width = 96; probe.height = 64;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not create pixel probe context.");
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let nonBlack = 0; const colors = new Set<string>();
    for (let offset = 0; offset < pixels.length; offset += 16) {
      const red = pixels[offset] ?? 0; const green = pixels[offset + 1] ?? 0; const blue = pixels[offset + 2] ?? 0;
      if (red + green + blue > 24) nonBlack += 1;
      colors.add(String(red >> 4) + ":" + String(green >> 4) + ":" + String(blue >> 4));
    }
    return { nonBlackRatio: nonBlack / (pixels.length / 16), uniqueColors: colors.size };
  });
}

test.describe("Meshy relic pilot", () => {
  test.setTimeout(120_000);
  let server: ViteDevServer;
  let origin: string;
  test.beforeAll(async () => {
    server = await createServer({ root: APP_ROOT, configFile: resolve(APP_ROOT, "vite.config.ts"), server: { host: "127.0.0.1", port: 0 } });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Meshy relic pilot Vite server did not bind a port.");
    origin = "http://127.0.0.1:" + String(address.port);
    mkdirSync(REPORT_DIR, { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  test("renders typed relic, collects by keyboard, resets, and writes route evidence", async ({ browser }) => {
    const source = readFileSync(resolve(APP_ROOT, "src/main.ts"), "utf8");
    const typedAssets = readFileSync(resolve(APP_ROOT, "src/aura-assets.ts"), "utf8");
    const manifest = readFileSync(resolve(APP_ROOT, "aura.assets.json"), "utf8");
    expect(source).toContain('import { assets } from "./aura-assets"');
    expect(source).toContain("model(assets.arenaRelic");
    expect(source).not.toMatch(/from ["']three(?:\/|["'])/);
    expect(source).not.toMatch(/unsafeModelUrl|GLTFLoader|\.glb["']/);
    expect(typedAssets).toContain("arenaRelic");
    expect(manifest).toContain('"arenaRelic"');

    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors: string[] = []; const pageErrors: string[] = []; const failedResponses: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(String(response.status()) + " " + response.url()); });
    await page.goto(origin + ROUTE, { waitUntil: "domcontentloaded" });
    try {
      await waitForReady(page);
    } catch (error) {
      throw new Error("Pilot did not publish evidence: " + JSON.stringify({ consoleErrors, pageErrors, failedResponses, body: (await page.locator("body").innerText()).slice(0, 500) }), { cause: error });
    }
    await page.waitForTimeout(350);

    const initial = await evidence(page);
    expect(initial.ready, JSON.stringify({ initial, consoleErrors, pageErrors, failedResponses })).toBe(true);
    expect(initial).toMatchObject({ state: "seeking", score: 0, relicVisible: true, primaryAsset: "arenaRelic", assetReference: "assets.arenaRelic", capabilityLabel: "CLI asset pipeline", routeLabel: "prototype", mechanic: "route-local distance-threshold collection", collisionPlan: "unproven" });
    expect(initial.drawCalls).toBeGreaterThan(0); expect(initial.renderSize[0]).toBeGreaterThan(0); expect(initial.errors).toEqual([]);
    const pixels = await canvasPixels(page);
    expect(pixels.nonBlackRatio).toBeGreaterThan(0.15); expect(pixels.uniqueColors).toBeGreaterThan(12);
    const desktopPath = resolve(REPORT_DIR, "desktop-seeking.png");
    await page.screenshot({ path: desktopPath, fullPage: true });

    await page.keyboard.down("KeyD");
    await page.waitForFunction(() => (window as unknown as { __MESHY_RELIC_PILOT__?: Evidence }).__MESHY_RELIC_PILOT__?.state === "collected", undefined, { timeout: 5_000 });
    await page.keyboard.up("KeyD");
    const collected = await evidence(page);
    expect(collected.player.x).toBeGreaterThan(initial.player.x + 1.5);
    expect(collected).toMatchObject({ state: "collected", objective: "relic-secured", score: 100, collectionCount: 1, relicVisible: false });
    expect(await page.getByTestId("objective").textContent()).toContain("Relic secured");
    const collectedPath = resolve(REPORT_DIR, "desktop-collected.png");
    await page.screenshot({ path: collectedPath, fullPage: true });

    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => { const value = (window as unknown as { __MESHY_RELIC_PILOT__?: Evidence }).__MESHY_RELIC_PILOT__; return value?.state === "seeking" && value.resetCount > 0; });
    const reset = await evidence(page);
    expect(reset).toMatchObject({ score: 0, objective: "reach-relic", relicVisible: true });
    expect(reset.player.x).toBeCloseTo(-1.8, 1);
    expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]); expect(failedResponses).toEqual([]);

    const mobile = await context.newPage(); await mobile.setViewportSize({ width: 390, height: 844 });
    const mobileErrors: string[] = [];
    mobile.on("console", (message) => { if (message.type() === "error") mobileErrors.push(message.text()); });
    mobile.on("pageerror", (error) => mobileErrors.push(String(error)));
    await mobile.goto(origin + ROUTE, { waitUntil: "domcontentloaded" }); await waitForReady(mobile);
    expect(await mobile.getByRole("heading", { name: "Relic Recovery" }).isVisible()).toBe(true);
    expect(await mobile.getByTestId("objective").isVisible()).toBe(true);
    const mobilePath = resolve(REPORT_DIR, "mobile-seeking.png");
    await mobile.screenshot({ path: mobilePath, fullPage: true });
    expect(mobileErrors).toEqual([]);

    const routeHealth = {
      generatedAt: new Date().toISOString(), route: ROUTE, status: "automated-evidence-passed",
      releaseApproval: "pending-independent-human-review", capabilityLabel: initial.capabilityLabel, routeLabel: initial.routeLabel,
      rendererBackend: initial.rendererBackend, primaryAssets: [initial.primaryAsset], typedReferences: [initial.assetReference],
      primitiveCount: 4, primitiveRole: "arena set dressing and route-local player marker only", fallbackMode: "none observed",
      drawCalls: initial.drawCalls, renderSize: initial.renderSize, pixelProbe: pixels,
      collisionPlan: "unproven; the route uses an authored center-distance threshold, not asset collision geometry",
      mechanic: { kind: initial.mechanic, input: "keyboard movement", initial: { state: initial.state, score: initial.score }, collected: { state: collected.state, score: collected.score, collectionCount: collected.collectionCount }, reset: { state: reset.state, score: reset.score, resetCount: reset.resetCount } },
      consoleSafety: { consoleErrors, pageErrors, failedResponses, mobileErrors },
      screenshots: ["tests/reports/meshy-relic-pilot/desktop-seeking.png", "tests/reports/meshy-relic-pilot/desktop-collected.png", "tests/reports/meshy-relic-pilot/mobile-seeking.png"]
    };
    writeFileSync(resolve(REPORT_DIR, "route-health.json"), JSON.stringify(routeHealth, null, 2) + "\n");
    for (const path of [desktopPath, collectedPath, mobilePath]) expect(statSync(path).size).toBeGreaterThan(20_000);
    await context.close();
  });
});
