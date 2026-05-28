import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const pathBPattern = new RegExp([
  ["provider", "runtime"].join("-"),
  "AuraScene" + "IR",
  "Mock" + "Provider",
  ["prompt", "to", "scene"].join("-")
].join("|"), "i");
const versionCyclePattern = new RegExp([
  `\\b${"V"}[234]\\b`,
  ["Path", "A"].join(" "),
  ["Path", "B"].join(" ")
].join("|"), "i");
const publicPlaceholderPattern = /placeholder|\bMVP\b|needs work|under review|\btoy\b|future work|\bTBD\b|FIXME|\bstub\b/i;

test.describe("docs and marketing site", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("marketing page routes humans to docs, templates, and agent files", async ({ page }) => {
    await stubMarketingEmbeds(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/marketing/index.html`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Agent-written 3D/i })).toBeVisible();
    await expect(page.locator(".hero-grid")).toBeVisible();
    const heroDisplay = await page.locator(".hero-grid").evaluate((element) => getComputedStyle(element).display);
    expect(heroDisplay).toBe("grid");
    const navPosition = await page.locator(".nav").evaluate((element) => getComputedStyle(element).position);
    expect(navPosition).toBe("sticky");
    await expect(page.locator(".hero-right iframe[data-route='/apps/wow-concept-car-cinema/']")).toBeVisible();
    await expect(page.locator(".hero-right iframe")).toHaveAttribute("src", /wow-concept-car-cinema/);
    await expect(page.locator(".hero-left")).toContainText("Agent-written 3D");
    await expect(page.locator(".hero-left")).toContainText("The agent writes code. You bring the assets.");
    expect(await page.locator("a[href='/llms.txt']").count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator("[data-copy='asset-add']")).toBeVisible();
    await expect(page.locator("[data-copy]")).toHaveCount(4);
    await expect(page.locator("[data-search-index]")).toContainText("deployment");
    const search = page.getByRole("searchbox", { name: /Search Aura3D docs/i });
    await expect(search).toBeVisible();
    for (const query of ["install", "asset add", "templates", "deployment", "troubleshooting"]) {
      await search.fill(query);
      await expect(page.locator("[data-docs-search-results] a:not([hidden])").first()).toBeVisible();
    }
    await search.fill("");
    await expect(page.locator("#templates")).toContainText("product-viewer");
    await expect(page.locator("#templates")).toContainText("cinematic-scene");
    await expect(page.locator("#templates")).toContainText("mini-game");
    expect(await page.locator("section").count()).toBeGreaterThanOrEqual(8);
    await expect(page.locator("iframe[data-route='/apps/hello-world-typed-asset/']")).toHaveCount(0);
    await expect(page.locator("iframe[data-route='/apps/material-lighting/']")).toHaveCount(0);
    await expect(page.locator("iframe[data-route='/apps/camera-path/']")).toHaveCount(0);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(versionCyclePattern);
    expect(bodyText).not.toMatch(publicPlaceholderPattern);
    expect(bodyText).not.toMatch(pathBPattern);
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForTimeout(250);
    const screenshot = await page.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(15_000);
    mkdirSync(resolve("tests/reports/docs-site"), { recursive: true });
    writeFileSync(resolve("tests/reports/docs-site/marketing-home.png"), screenshot);
  });

  test("marketing page keeps the restored design on mobile", async ({ page }) => {
    await stubMarketingEmbeds(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/marketing/index.html`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Agent-written 3D/i })).toBeVisible();
    await expect(page.locator(".hero-left .hero-cta")).toBeVisible();
    await expect(page.locator("#templates")).toBeVisible();
    await expect(page.locator("#templates .pkg-grid")).toBeVisible();
  });
});

async function stubMarketingEmbeds(page: Page): Promise<void> {
  await page.route("**/apps/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body data-aura3d-ready="true" data-aura3d-draw-calls="1" style="margin:0;background:#05070a;color:#d8f6e7;font:13px monospace;display:grid;place-items:center;min-height:100vh"><canvas width="640" height="360" style="width:100%;height:100%;background:linear-gradient(135deg,#07140f,#14251d)"></canvas></body></html>`
    });
  });
}
