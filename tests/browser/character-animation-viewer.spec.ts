import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const VISUAL_REPORT_DIRECTORY = resolve("tests/reports/skinned-morph-gallery");

test.describe("character animation viewer", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders and controls one typed skinned and morphed GLB through the root production runtime", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/character-animation-viewer/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_CHARACTER_ANIMATION_VIEWER__?.status === "ready" || window.__AURA3D_CHARACTER_ANIMATION_VIEWER__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    await page.waitForFunction(() => Number(window.__AURA3D_CHARACTER_ANIMATION_VIEWER__?.frameCount ?? 0) >= 6);
    const initial = await page.evaluate(() => window.__AURA3D_CHARACTER_ANIMATION_VIEWER__);
    expect(errors).toEqual([]);
    expect(initial?.status, initial?.error).toBe("ready");
    expect(initial).toMatchObject({
      renderer: "webgl2",
      runtimeBackend: "production-runtime",
      assetId: "showcaseExpressiveRobot",
      activeClip: "Wave",
      morphNames: ["Angry", "Surprised", "Sad"],
      activeExpression: "Neutral",
      morphWeight: 0,
      playing: true,
      renderPath: "createAuraApp-root-skinned-morph-gltf"
    });
    expect(initial?.assetHash).toBe("sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319");
    expect(initial?.clipNames).toEqual(expect.arrayContaining(["Idle", "Wave", "Dance", "Walking"]));
    expect(initial?.drawCalls ?? 0).toBeGreaterThan(0);
    expect(initial?.litPixels ?? 0).toBeGreaterThan(20_000);
    expect(initial?.skeletonBoneCount ?? 0).toBeGreaterThan(40);
    expect(initial?.skinnedRenderItemCount ?? 0).toBeGreaterThan(0);
    expect(initial?.morphRenderItemCount ?? 0).toBeGreaterThan(0);
    expect(initial?.skinningPaletteUpdated).toBe(true);
    expect(initial?.activeMorphTargets).toMatchObject({ Angry: 0, Surprised: 0, Sad: 0 });
    expect(initial?.missingMorphTargets).toEqual([]);
    expect(initial?.claimBoundary).toContain("does not claim universal");
    const before = await hashCanvas(page);

    await page.getByTestId("character-animation-clip").selectOption("Dance");
    await page.getByTestId("character-animation-time").evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "1.1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const state = window.__AURA3D_CHARACTER_ANIMATION_VIEWER__;
      return state?.activeClip === "Dance" && state.playing === false && Math.abs((state.sampleTime ?? 0) - 1.1) < 0.02;
    });
    const scrubbed = await page.evaluate(() => window.__AURA3D_CHARACTER_ANIMATION_VIEWER__);
    const neutralScrubbed = await hashCanvas(page);
    mkdirSync(VISUAL_REPORT_DIRECTORY, { recursive: true });
    await page.locator("#character-stage canvas").screenshot({ path: resolve(VISUAL_REPORT_DIRECTORY, "public-neutral-canvas.png") });
    await page.screenshot({ path: resolve(VISUAL_REPORT_DIRECTORY, "public-neutral-page.png"), fullPage: true });
    expect(scrubbed?.drawCalls).toBe(initial?.drawCalls);
    expect(scrubbed?.litPixels ?? 0).toBeGreaterThan(20_000);
    expect(neutralScrubbed).not.toBe(before);
    await expect(page.getByTestId("character-animation-status")).toContainText("clip Dance");

    await page.getByTestId("character-expression").selectOption("Surprised");
    await page.getByTestId("character-expression-weight").evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const state = window.__AURA3D_CHARACTER_ANIMATION_VIEWER__;
      return state?.activeExpression === "Surprised" && state.morphWeight === 1 && state.activeMorphTargets?.Surprised === 1;
    });
    const expressed = await page.evaluate(() => window.__AURA3D_CHARACTER_ANIMATION_VIEWER__);
    const expressedFrame = await hashCanvas(page);
    await page.locator("#character-stage canvas").screenshot({ path: resolve(VISUAL_REPORT_DIRECTORY, "public-surprised-canvas.png") });
    await page.screenshot({ path: resolve(VISUAL_REPORT_DIRECTORY, "public-surprised-page.png"), fullPage: true });
    expect(expressed?.activeMorphTargets).toMatchObject({ Angry: 0, Surprised: 1, Sad: 0 });
    expect(expressed?.missingMorphTargets).toEqual([]);
    expect(expressedFrame).not.toBe(neutralScrubbed);
    await expect(page.getByTestId("character-animation-status")).toContainText("expression Surprised 1.00");
    await expect(page.getByText("One real cataloged character drives both skeletal clips", { exact: false })).toBeVisible();
    writeFileSync(resolve(VISUAL_REPORT_DIRECTORY, "browser.json"), `${JSON.stringify({
      schema: "aura3d.skinned-morph-gallery-browser/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      initial,
      scrubbed,
      expressed,
      frameHashes: { initial: before, neutralScrubbed, expressed: expressedFrame },
      artifacts: ["public-neutral-canvas.png", "public-neutral-page.png", "public-surprised-canvas.png", "public-surprised-page.png"]
    }, null, 2)}\n`);
  });
});

async function hashCanvas(page: Page): Promise<string> {
  const bytes = await page.locator("#character-stage canvas").screenshot();
  return createHash("sha256").update(bytes).digest("hex");
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

declare global {
  interface Window {
    __AURA3D_CHARACTER_ANIMATION_VIEWER__?: {
      readonly status: "loading" | "ready" | "error";
      readonly renderer?: string;
      readonly runtimeBackend?: string;
      readonly assetId?: string;
      readonly assetHash?: string;
      readonly clipNames?: readonly string[];
      readonly activeClip?: string;
      readonly morphNames?: readonly string[];
      readonly activeExpression?: string;
      readonly morphWeight?: number;
      readonly activeMorphTargets?: Readonly<Record<string, number>>;
      readonly missingMorphTargets?: readonly string[];
      readonly skeletonBoneCount?: number;
      readonly skinnedRenderItemCount?: number;
      readonly morphRenderItemCount?: number;
      readonly skinningPaletteUpdated?: boolean;
      readonly playing?: boolean;
      readonly sampleTime?: number;
      readonly drawCalls?: number;
      readonly litPixels?: number;
      readonly frameCount?: number;
      readonly renderPath?: "createAuraApp-root-skinned-morph-gltf";
      readonly claimBoundary?: string;
      readonly error?: string;
    };
  }
}
