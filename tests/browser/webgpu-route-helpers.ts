import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";

export const WEBGPU_ROOT_ROUTES = [
  "/apps/wow-webgpu-triangle/",
  "/apps/wow-webgpu-render-target/",
  "/apps/wow-webgpu-pbr-asset/",
  "/apps/wow-webgpu-product-viewer/",
  "/apps/wow-webgpu-instancing/",
  "/apps/wow-webgpu-compute-particles/"
] as const;

export async function expectWebGPURouteSettles(page: Page, origin: string, path: string, testInfo: TestInfo): Promise<void> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  /*
   * Serve fixtures from the local dev server instead of
   * `cdn.jsdelivr.net/gh/auraoneai/aura3d@main`.
   *
   * `wow-webgpu-pbr-asset` and `wow-webgpu-product-viewer` fetch `.glb`/`.hdr`
   * fixtures through `publicAssetUrl()`, which defaults to that CDN. A worktree
   * ahead of the published `main` therefore 404s on fixtures that exist locally,
   * and this helper asserts zero console errors — so those two routes always
   * failed and never produced their screenshots. `AURA3D_PUBLIC_ASSET_ORIGIN` is
   * the override the route code already honours; the same approach is used by
   * `wow-showcase-screenshots.spec.ts` and `advanced-examples-gallery.spec.ts`.
   */
  await page.addInitScript((assetOrigin) => {
    (window as unknown as { AURA3D_PUBLIC_ASSET_ORIGIN?: string }).AURA3D_PUBLIC_ASSET_ORIGIN = assetOrigin;
  }, origin);

  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  const runtime = await page.waitForFunction(() => {
    const value = (window as unknown as { __a3dWowRuntime?: { status: string } }).__a3dWowRuntime;
    if (!value) return undefined;
    if (["ready", "running", "unsupported", "error"].includes(value.status)) return value;
    return undefined;
  }, undefined, { timeout: 90_000 }).then((handle) => handle.jsonValue() as Promise<{
    status: string;
    backend: string;
    selectedBackend: string;
    adapterName: string;
    drawCalls: number;
    frameCount: number;
    unsupportedReason?: string;
    capabilities?: readonly string[];
    fields?: Record<string, string | number | boolean>;
  }>);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(runtime.status).not.toBe("error");

  if (runtime.status === "unsupported") {
    expect(runtime.unsupportedReason ?? "").toMatch(/webgpu|navigator\.gpu|adapter|device|unsupported/i);
    return;
  }

  expect(runtime.backend).toBe("a3d-webgpu");
  expect(runtime.selectedBackend).toBe("webgpu");
  expect(runtime.adapterName).toBeTruthy();
  expect(runtime.drawCalls).toBeGreaterThan(0);
  expect(runtime.frameCount).toBeGreaterThan(0);

  const canvas = page.locator("canvas#viewport");
  await expect(canvas).toBeVisible();
  const routeSlug = path.replaceAll("/", "-").replace(/^-|-$/g, "");
  const screenshotDir = resolve("tests/reports/webgpu-route-screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  await canvas.screenshot({ path: resolve(screenshotDir, `${routeSlug}-${testInfo.project.name}.png`) });
  /*
   * `tools/webgpu-visual-parity` reads its evidence from
   * `tests/reports/current-route-health/screenshots/apps-wow-webgpu-*.png`. This
   * spec is the only producer that renders those routes on a real WebGPU adapter,
   * but it previously wrote only to `webgpu-route-screenshots/`, so the auditor
   * reported all six files missing and WebGPU visual parity was never measured.
   * Writing the same capture to the path the auditor names closes that gap without
   * duplicating the render.
   */
  const routeHealthDir = resolve("tests/reports/current-route-health/screenshots");
  mkdirSync(routeHealthDir, { recursive: true });
  await canvas.screenshot({ path: resolve(routeHealthDir, `${routeSlug}.png`) });
}
