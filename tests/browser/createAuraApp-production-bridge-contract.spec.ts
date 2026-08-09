import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("createAuraApp production bridge contract", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a typed GLB through root @aura3d/engine imports only", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-production-bridge-harness.html?mode=typed-glb`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_PRODUCTION_BRIDGE_CONTRACT__), undefined, { timeout: 20_000 });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_PRODUCTION_BRIDGE_CONTRACT__);

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.renderer?.mode).toBe("production");
    expect(evidence?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.renderer?.fallbackUsed).toBe(false);
    expect(evidence?.renderer?.drawCalls).toBeGreaterThan(0);
    expect(evidence?.assets?.primary).toEqual(expect.arrayContaining(["assets.robotcand"]));
    expect(evidence?.assets?.importedEvidence?.assetId).toBe("robotcand");
    expect(evidence?.assets?.importedEvidence?.renderItemCount).toBeGreaterThan(0);
    expect(evidence?.pixels?.typedModelVisible).toBe(true);
    expect(evidence?.pixels?.stats?.nonBlackPixels).toBeGreaterThan(1200);
    expect(evidence?.pixels?.primitiveSubstitute).toBe(false);
    expect(evidence?.claims).toEqual(expect.arrayContaining(["production-renderer-active", "typed-glb-production-bridge"]));
    expect(errors).toEqual([]);
  });

  test("rejects unsafe/raw assets from the production renderer with migration guidance", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-production-bridge-harness.html?mode=forced-fallback`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_PRODUCTION_BRIDGE_CONTRACT__), undefined, { timeout: 20_000 });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_PRODUCTION_BRIDGE_CONTRACT__);

    expect(evidence?.renderer?.requestedMode).toBe("production");
    expect(evidence?.renderer?.mode).toBe("rejected");
    expect(evidence?.renderer?.runtimeBackend).not.toBe("webgl2-agent-runtime");
    expect(evidence?.renderer?.fallbackUsed).toBe(false);
    expect(evidence?.renderer?.errors.join("\n")).toContain("unsafeModelUrl");
    expect(evidence?.renderer?.errors.join("\n")).toContain("generated typed aura-assets");
    expect(evidence?.claims).not.toContain("production-renderer-active");
    expect(evidence?.pixels?.typedModelVisible).toBe(false);
    expect(errors).toEqual([]);
  });

  test("quality profile changes diagnostics through public API", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-production-bridge-harness.html?mode=quality-profile`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_PRODUCTION_BRIDGE_CONTRACT__), undefined, { timeout: 20_000 });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_PRODUCTION_BRIDGE_CONTRACT__);

    expect(evidence?.profiles?.safeBasic?.hash).toBeTruthy();
    expect(evidence?.profiles?.production?.hash).toBeTruthy();
    expect(evidence?.profiles?.safeBasic?.runtimeBackend).toBe("webgl2-agent-runtime");
    expect(evidence?.profiles?.production?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.profiles?.safeBasic?.diagnostics?.qualityProfile).toBe("safe-basic");
    expect(evidence?.profiles?.production?.diagnostics?.qualityProfile).toBe("production");
    expect(evidence?.profiles?.production?.drawCalls).toBeGreaterThan(0);
    expect(evidence?.pixels?.typedModelVisible).toBe(true);
    expect(errors).toEqual([]);
  });
});
