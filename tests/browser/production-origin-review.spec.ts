import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ORIGIN = process.env.A3D_PUBLIC_DEMO_URL ?? "https://aura3d.auraone.ai";
const OUT = process.env.A3D_PRODUCTION_REVIEW_DIR
  ?? "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer/production";

const ROUTES = [
  { id: "catalog", path: "/apps/showcase-index/", file: "catalog-desktop.png" },
  { id: "smart-city", path: "/apps/advanced-examples-gallery/#smart-city", file: "smart-city-desktop.png" },
  { id: "product-configurator", path: "/apps/advanced-examples-gallery/#product-configurator", file: "product-configurator-desktop.png" },
  { id: "turbo", path: "/apps/showcase-turbo-drift-circuit/", file: "turbo-desktop.png" },
  { id: "skyline", path: "/apps/showcase-skyline-runner/", file: "skyline-desktop.png" }
] as const;

async function waitReady(page: Page): Promise<void> {
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return canvas instanceof HTMLCanvasElement && canvas.width > 8 && canvas.height > 8;
  }, undefined, { timeout: 90_000 }).catch(() => undefined);
  await page.waitForFunction(() => {
    const gallery = (window as unknown as {
      __A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__?: {
        status?: string;
        authoredAsset?: { status?: string };
        frameCount?: number;
      };
    }).__A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__;
    if (!gallery) return true;
    if (gallery.status === "error") return true;
    return (gallery.frameCount ?? 0) >= 4 && (gallery.authoredAsset?.status ?? "ready") !== "loading";
  }, undefined, { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
}

test("capture production desktop, mobile, and interactive frames", async ({ page }, testInfo) => {
  testInfo.setTimeout(360_000);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(join(OUT, "..", "turbo-overtake"), { recursive: true });
  mkdirSync(join(OUT, "..", "skyline"), { recursive: true });
  const results: Array<{ id: string; status: number; file: string }> = [];
  for (const route of ROUTES) {
    const response = await page.goto(`${ORIGIN}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response === null || response.ok(), `${route.id} HTTP ${response?.status()}`).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitReady(page);
    if (route.id === "smart-city" || route.id === "product-configurator") {
      const bodyText = await page.locator("body").innerText();
      expect(bodyText, `${route.id} authored asset`).not.toContain("Authored asset failed to load");
    }
    await page.screenshot({ path: join(OUT, route.file), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, route.file.replace("desktop", "mobile")), fullPage: false });
    results.push({ id: route.id, status: response?.status() ?? 0, file: route.file });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN}/apps/showcase-turbo-drift-circuit/`, { waitUntil: "domcontentloaded" });
  await waitReady(page);
  await page.screenshot({ path: join(OUT, "..", "turbo-overtake", "approach.png") });
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUT, "..", "turbo-overtake", "side-by-side.png") });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(OUT, "..", "turbo-overtake", "pass-complete.png") });
  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyD");
  await page.screenshot({ path: join(OUT, "..", "turbo-overtake", "retained-lead.png") });

  await page.goto(`${ORIGIN}/apps/showcase-skyline-runner/`, { waitUntil: "domcontentloaded" });
  await waitReady(page);
  await page.screenshot({ path: join(OUT, "..", "skyline", "start.png") });
  await page.keyboard.down("KeyD");
  await page.keyboard.down("Space");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, "..", "skyline", "collectible.png") });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "..", "skyline", "enemy.png") });
  await page.keyboard.up("Space");
  await page.keyboard.up("KeyD");
  await page.screenshot({ path: join(OUT, "..", "skyline", "checkpoint.png") });

  writeFileSync(join(OUT, "capture-index.json"), JSON.stringify({ origin: ORIGIN, results }, null, 2));
});
