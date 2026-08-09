import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("character animation viewer", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders and controls a typed skinned GLB through the root production runtime", async ({ page }) => {
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
      playing: true,
      renderPath: "createAuraApp-root-skinned-gltf"
    });
    expect(initial?.assetHash).toBe("sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319");
    expect(initial?.clipNames).toEqual(expect.arrayContaining(["Idle", "Wave", "Dance", "Walking"]));
    expect(initial?.drawCalls ?? 0).toBeGreaterThan(0);
    expect(initial?.litPixels ?? 0).toBeGreaterThan(20_000);
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
    const after = await hashCanvas(page);
    expect(scrubbed?.drawCalls).toBe(initial?.drawCalls);
    expect(scrubbed?.litPixels ?? 0).toBeGreaterThan(20_000);
    expect(after).not.toBe(before);
    await expect(page.getByTestId("character-animation-status")).toContainText("clip Dance");
    await expect(page.getByText("A real cataloged skinned GLB", { exact: false })).toBeVisible();
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
      readonly playing?: boolean;
      readonly sampleTime?: number;
      readonly drawCalls?: number;
      readonly litPixels?: number;
      readonly frameCount?: number;
      readonly renderPath?: "createAuraApp-root-skinned-gltf";
      readonly error?: string;
    };
  }
}
