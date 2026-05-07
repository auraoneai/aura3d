import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("physics sandbox example", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("is interactive and rendered through WebGL2 renderer plus physics debug lines", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(`${server.origin}/examples/physics-sandbox/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_PHYSICS_SANDBOX__?.status === "ready" || window.__GALILEO3D_PHYSICS_SANDBOX__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );

    await page.locator("[data-testid='spawn-box']").click();
    await page.locator("[data-testid='step-sim']").click();
    await page.locator("[data-testid='toggle-debug']").click();
    await page.locator("[data-testid='toggle-debug']").click();
    await page.locator("[data-debug-layer='contacts']").click();
    await page.locator("[data-debug-layer='contacts']").click();
    await page.locator("[data-debug-layer='aabbs']").click();
    await page.locator("[data-debug-layer='aabbs']").click();
    await page.waitForFunction(() => (window.__GALILEO3D_PHYSICS_SANDBOX__?.interactions ?? 0) >= 8);

    const state = await page.evaluate(() => window.__GALILEO3D_PHYSICS_SANDBOX__);
    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.renderer).toBe("webgl2");
    expect(state?.rendererBacked).toBe(true);
    expect(state?.metrics?.rendererBacked).toBe(true);
    expect(Number(state?.diagnostics?.drawCalls ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics?.bodies ?? 0)).toBeGreaterThanOrEqual(9);
    expect(Number(state?.metrics?.colliders ?? 0)).toBeGreaterThanOrEqual(9);
    expect(Number(state?.metrics?.sensors ?? 0)).toBe(1);
    expect(Number(state?.metrics?.debugLineCount ?? 0)).toBeGreaterThan(20);
    expect(Number(state?.metrics?.colliderDebugLines ?? 0)).toBeGreaterThan(20);
    expect(Number(state?.metrics?.contactNormalLines ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.aabbDebugLines ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics?.debugColliders).toBe(true);
    expect(state?.metrics?.debugContacts).toBe(true);
    expect(state?.metrics?.debugAabbs).toBe(true);
    expect(state?.metrics?.debugSleeping).toBe(true);
    expect(Number(state?.metrics?.broadphaseCandidateTests ?? 0)).toBeGreaterThan(0);
    expect(await hasNonBlankWebGLPixels(page)).toBe(true);
  });
});

async function hasNonBlankWebGLPixels(page: import("@playwright/test").Page): Promise<boolean> {
  return page.locator("[data-testid='physics-sandbox-canvas']").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visiblePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index]! > 8 || pixels[index + 1]! > 8 || pixels[index + 2]! > 8) {
        visiblePixels += 1;
      }
    }
    return visiblePixels > 20;
  });
}

declare global {
  interface Window {
    __GALILEO3D_PHYSICS_SANDBOX__?: {
      readonly status: "ready" | "error";
      readonly renderer?: string;
      readonly rendererBacked?: boolean;
      readonly interactions?: number;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly metrics?: Record<string, string | number | boolean>;
      readonly error?: string;
    };
  }
}
