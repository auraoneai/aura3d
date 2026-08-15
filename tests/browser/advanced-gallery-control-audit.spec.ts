import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { DEMOS } from "../../apps/advanced-examples-gallery/src/metadata";

const REPORT_DIR = resolve("tests/reports/advanced-gallery-control-audit");
const ROUTE = "/apps/advanced-examples-gallery/";

test("product configurator dropdowns change selected value and render state", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  const server = await startExampleDevServer();
  const errors: string[] = [];
  try {
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    mkdirSync(REPORT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}${ROUTE}#product-configurator`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('select[data-control="carVariant"]', { timeout: 90_000 });
    const variant = page.locator('select[data-control="carVariant"]');
    const lighting = page.locator('select[data-control="lighting"]');
    const hotspot = page.locator('select[data-control="focusPart"]');
    await expect(variant).toHaveValue("Carmine Candy");
    await page.screenshot({ path: join(REPORT_DIR, "product-default.png") });
    await variant.selectOption("Pearly Swirly");
    await expect(variant).toHaveValue("Pearly Swirly");
    await page.screenshot({ path: join(REPORT_DIR, "product-pearly.png") });
    await variant.selectOption("Torched Graphite");
    await expect(variant).toHaveValue("Torched Graphite");
    await page.screenshot({ path: join(REPORT_DIR, "product-graphite.png") });
    await lighting.selectOption("inspection");
    await expect(lighting).toHaveValue("inspection");
    await lighting.selectOption("environment");
    await expect(lighting).toHaveValue("environment");
    await hotspot.selectOption("wheels");
    await expect(hotspot).toHaveValue("wheels");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(variant).toHaveValue("Carmine Candy");
    await expect(lighting).toHaveValue("studio");
    await expect(hotspot).toHaveValue("overview");
    expect(errors, errors.join("\n")).toEqual([]);
  } finally {
    await server.close();
  }
});

test("smart city object-count and traffic controls remain bound", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  const server = await startExampleDevServer();
  mkdirSync(REPORT_DIR, { recursive: true });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}${ROUTE}#smart-city`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('select[data-control="count"]', { timeout: 90_000 });
    const count = page.locator('select[data-control="count"]');
    const traffic = page.locator('input[data-control="traffic"]');
    const fly = page.locator('input[data-control="fly"]');
    const district = page.locator('select[data-control="district"]');
    await expect(count).toHaveValue("medium");
    await count.selectOption("extreme");
    await expect(count).toHaveValue("extreme");
    await traffic.uncheck();
    await expect(traffic).not.toBeChecked();
    await fly.check();
    await expect(fly).toBeChecked();
    await district.selectOption("harbor");
    await expect(district).toHaveValue("harbor");
    await page.screenshot({ path: join(REPORT_DIR, "smart-city-controlled.png") });
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(count).toHaveValue("medium");
    await expect(traffic).toBeChecked();
    await expect(fly).not.toBeChecked();
    await expect(district).toHaveValue("all");
  } finally {
    await server.close();
  }
});

test("every advanced-gallery scene publishes a working control set", async () => {
  for (const demo of DEMOS) {
    expect(demo.controls.length, demo.id).toBeGreaterThan(0);
    expect(new Set(demo.controls.map((control) => control.key)).size).toBe(demo.controls.length);
  }
});
