import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/external-extension-lab");

test("public external-extension gallery uses the typed renderer device seam without a fork", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/external-extension-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => ["ready", "error"].includes(window.__AURA3D_EXTERNAL_EXTENSION_LAB__?.status ?? ""), undefined, { timeout: 120_000 });
    const initial = await evidence(page);
    expect(initial.error ?? errors.join(" | "), "route must initialize without a shader or device error").toBeFalsy();
    expect(initial).toMatchObject({
      id: "external-extension-lab", status: "ready", claim: "rendering-package-public-escape-hatch",
      backend: "webgl2", extensionId: "external-telemetry-shader", extensionStrength: 0,
      shaderCompiled: true, extensionApplied: false, publicEntry: "@aura3d/rendering",
      deviceOwner: "host-renderer", callerResourceOwner: "external-extension", drawCalls: 1, errors: []
    });
    expect(initial.brightPixels).toBeGreaterThan(500);
    assertPublicExtensionBoundary();
    const initialCapture = await capture(page, "initial");

    await page.getByRole("button", { name: /Apply external pass/ }).click();
    await page.waitForFunction(() => window.__AURA3D_EXTERNAL_EXTENSION_LAB__?.status === "applied");
    const applied = await evidence(page);
    expect(applied).toMatchObject({ status: "applied", extensionStrength: 1, shaderCompiled: true, extensionApplied: true, errors: [] });
    expect(applied.signalPixels).toBeGreaterThan(1_000);
    expect(applied.brightPixels).toBeGreaterThan(initial.brightPixels);
    const appliedCapture = await capture(page, "applied");
    expect(appliedCapture.canvasSha256).not.toBe(initialCapture.canvasSha256);

    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => window.__AURA3D_EXTERNAL_EXTENSION_LAB__?.status === "ready");
    const reset = await evidence(page);
    expect(reset.extensionStrength).toBe(0);
    expect(reset.extensionApplied).toBe(false);

    const lifecycle = await page.evaluate(() => window.__AURA3D_EXTERNAL_EXTENSION_DISPOSE__?.());
    expect(lifecycle).toEqual({ extensionDisposed: true, deviceAliveBeforeHostDispose: true, rendererDisposed: true });
    expect(errors).toEqual([]);
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify({
      schema: "aura3d.external-extension-gallery-browser/1.0", generatedAt: new Date().toISOString(), pass: true,
      initial, applied, reset, lifecycle, artifacts: [initialCapture, appliedCapture],
      comparisonBoundary: "This proves one public @aura3d/rendering WebGL2 integration using Renderer.device, ShaderModule, Geometry, explicit caller-versus-host ownership, visible pixels, and complete teardown. It is not root createAuraApp proof and does not establish arbitrary Three.js plugin, backend-native, or cross-backend compatibility."
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_EXTERNAL_EXTENSION_LAB__));
}

async function capture(page: Page, state: string): Promise<{ state: string; pagePath: string; pageBytes: number; canvasPath: string; canvasBytes: number; canvasSha256: string }> {
  await page.waitForTimeout(200);
  const pagePath = resolve(REPORT_ROOT, `public-${state}-page.png`);
  const canvasPath = resolve(REPORT_ROOT, `public-${state}-canvas.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  await page.locator("canvas").screenshot({ path: canvasPath });
  const bytes = readFileSync(canvasPath);
  return {
    state,
    pagePath: pagePath.replace(`${process.cwd()}/`, ""), pageBytes: statSync(pagePath).size,
    canvasPath: canvasPath.replace(`${process.cwd()}/`, ""), canvasBytes: bytes.byteLength,
    canvasSha256: createHash("sha256").update(bytes).digest("hex")
  };
}

function assertPublicExtensionBoundary(): void {
  const main = readFileSync(resolve("examples/external-extension-lab/main.ts"), "utf8");
  const extension = readFileSync(resolve("examples/external-extension-lab/telemetry-extension.ts"), "utf8");
  for (const source of [main, extension]) {
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\/|packages\/rendering\/src\/|from\s+["']three(?:\/|["'])|createProgram\(|getContext\(["']webgl|class\s+Renderer/);
  }
  expect(main).toContain('from "@aura3d/rendering"');
  expect(extension).toContain('from "@aura3d/rendering"');
  expect(extension).toContain("renderer.device.draw");
  expect(extension).toContain("ShaderModule");
  expect(extension).toContain("deviceStillOwnedByHost");
}

export {};
