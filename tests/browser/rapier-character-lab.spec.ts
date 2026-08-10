import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/rapier-character-lab");
const EXPECTED_FINAL = [-0.11922672390937805, 1.2100166082382202, -0.00004769854785990901] as const;

test("public selected-Rapier character visibly completes the native autostep trace", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/rapier-character-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_RAPIER_CHARACTER_LAB__?.status === "ready", undefined, { timeout: 120_000 });
    const initial = await evidence(page);
    expect(initial).toMatchObject({
      status: "ready",
      claim: "optional-selected-rapier-physical-character",
      assetId: "showcaseAnimatedRunnerHero",
      assetHash: "sha256-9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f",
      packageOwner: "@aura3d/physics-rapier",
      nativeCharacterController: true,
      runtimeBackend: "production-runtime",
      steps: 0,
      totalCollisions: 0,
      groundedFrames: 0,
      reachedAutostep: false,
      errors: []
    });
    expect(initial.position[0]).toBeCloseTo(-2.2, 5);
    assertSourceBoundary();
    const initialCapture = await capture(page, "initial");

    await page.getByRole("button", { name: "Run autostep trace" }).click();
    await page.waitForFunction(() => window.__AURA3D_RAPIER_CHARACTER_LAB__?.status === "complete", undefined, { timeout: 30_000 });
    const complete = await evidence(page);
    expect(complete.steps).toBe(70);
    expect(complete.totalCollisions).toBe(53);
    expect(complete.groundedFrames).toBe(69);
    expect(complete.reachedAutostep).toBe(true);
    expect(complete.lastMovement.grounded).toBe(true);
    expect(complete.errors).toEqual([]);
    complete.position.forEach((value: number, index: number) => expect(value).toBeCloseTo(EXPECTED_FINAL[index]!, 5));
    const completeCapture = await capture(page, "complete");
    expect(completeCapture.canvasSha256).not.toBe(initialCapture.canvasSha256);

    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("KeyD");
    await page.waitForFunction(() => window.__AURA3D_RAPIER_CHARACTER_LAB__?.steps === 1);
    const keyboard = await evidence(page);
    expect(keyboard.position[0]).toBeGreaterThan(-2.2);
    expect(keyboard.steps).toBe(1);
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => window.__AURA3D_RAPIER_CHARACTER_LAB__?.steps === 0);
    const reset = await evidence(page);
    expect(reset.position[0]).toBeCloseTo(-2.2, 5);

    const lifecycle = await page.evaluate(() => window.__AURA3D_RAPIER_CHARACTER_DISPOSE__?.());
    expect(lifecycle).toEqual({ worldDisposed: true, bodiesReleased: true });
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.rapier-character-gallery-browser/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      initial,
      complete,
      keyboard,
      reset,
      lifecycle,
      artifacts: [initialCapture, completeCapture],
      comparisonBoundary: "The public route proves one typed GLB driven through one deterministic native Rapier kinematic-capsule ground/autostep trace. The separate current-Three.js r185 workload proves the same selected-adapter trace against direct Rapier. Neither establishes universal controller, networking, animation-state-machine, visual, or performance parity."
    };
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_RAPIER_CHARACTER_LAB__));
}

async function capture(page: Page, state: string): Promise<{ state: string; pagePath: string; pageBytes: number; canvasPath: string; canvasBytes: number; canvasSha256: string }> {
  await page.waitForTimeout(250);
  const pagePath = resolve(REPORT_ROOT, `public-${state}-page.png`);
  const canvasPath = resolve(REPORT_ROOT, `public-${state}-canvas.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  const dataUrl = await page.locator("canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  writeFileSync(canvasPath, bytes);
  return {
    state,
    pagePath: pagePath.replace(`${process.cwd()}/`, ""),
    pageBytes: statSync(pagePath).size,
    canvasPath: canvasPath.replace(`${process.cwd()}/`, ""),
    canvasBytes: bytes.byteLength,
    canvasSha256: createHash("sha256").update(bytes).digest("hex")
  };
}

function assertSourceBoundary(): void {
  const source = readFileSync(resolve("examples/rapier-character-lab/main.ts"), "utf8");
  expect(source).toContain('from "@aura3d/engine"');
  expect(source).toContain('from "@aura3d/physics-rapier"');
  expect(source).toContain("assets.showcaseAnimatedRunnerHero");
  expect(source).not.toMatch(/from\s+["']three|@dimforge\/rapier|packages\//);
}

export {};
