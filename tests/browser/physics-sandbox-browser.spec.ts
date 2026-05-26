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
      () => window.__AURA3D_PHYSICS_SANDBOX__?.status === "ready" || window.__AURA3D_PHYSICS_SANDBOX__?.status === "error",
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
    await page.waitForFunction(() => (window.__AURA3D_PHYSICS_SANDBOX__?.interactions ?? 0) >= 8);

    const state = await page.evaluate(() => window.__AURA3D_PHYSICS_SANDBOX__);
    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.renderer).toBe("webgl2");
    expect(state?.rendererBacked).toBe(true);
    expect(state?.metrics?.rendererBacked).toBe(true);
    expect(state?.metrics?.oldBranchPhysicsSandboxPort).toBe(true);
    expect(state?.metrics?.oldBranchPhysicsSandboxSource).toBe("origin-master-physics-sandbox-tools-spawners-adapted");
    expect(String(state?.metrics?.oldBranchPhysicsSandboxHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics?.oldBranchSpawnerPresetCount ?? 0)).toBeGreaterThanOrEqual(12);
    expect(Number(state?.metrics?.oldBranchSpawnerBodyCount ?? 0)).toBeGreaterThan(40);
    expect(Number(state?.metrics?.oldBranchSpawnerConstraintCount ?? 0)).toBeGreaterThan(10);
    expect(Number(state?.metrics?.oldBranchSupportedToolCount ?? 0)).toBeGreaterThanOrEqual(5);
    expect(Number(state?.metrics?.oldBranchBlockedToolCount ?? 0)).toBe(1);
    expect(Number(state?.metrics?.oldBranchUnsupportedAdvancedSimulationCount ?? 0)).toBe(4);
    expect(state?.oldBranchPhysicsSandbox?.spawners.some((spawner) => spawner.preset === "chain" && spawner.constraints >= 5)).toBe(true);
    expect(state?.oldBranchPhysicsSandbox?.tools.find((tool) => tool.tool === "slice")?.supported).toBe(false);
    expect(state?.oldBranchPhysicsSandbox?.unsupportedAdvancedSimulations).toEqual(["cloth", "soft-body", "fluid", "fracture"]);
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
    __AURA3D_PHYSICS_SANDBOX__?: {
      readonly status: "ready" | "error";
      readonly renderer?: string;
      readonly rendererBacked?: boolean;
      readonly interactions?: number;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly oldBranchPhysicsSandbox?: {
        readonly spawners: readonly { readonly preset?: string; readonly constraints?: number }[];
        readonly tools: readonly { readonly tool?: string; readonly supported?: boolean }[];
        readonly unsupportedAdvancedSimulations?: readonly string[];
      };
      readonly metrics?: Record<string, string | number | boolean>;
      readonly error?: string;
    };
  }
}
