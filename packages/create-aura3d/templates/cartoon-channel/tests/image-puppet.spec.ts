import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("image puppet route animates masked cutouts from the generated source image", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const sourceResponse = await request.get("/aura-assets/moon-garden-feature-frame.png");
  expect(sourceResponse.ok()).toBe(true);

  await page.goto("/?view=image-puppet&sampleTime=24");
  const frame = page.locator("#image-puppet-episode");
  await expect(frame).toBeVisible();
  await expect(page.locator("[data-image-puppet-caption]")).toContainText(/tiny circle|stones|cleanup/i);
  await expect(page.locator("[data-source-cutout='blue-head']")).toBeVisible();
  await expect(page.locator("[data-source-cutout='yellow-head']")).toBeVisible();
  await expect(page.locator("[data-source-cutout='cart']")).toBeVisible();

  const proof = await page.evaluate(() => window.__AURA3D_CARTOON_IMAGE_PUPPET_PROOF__);
  expect(proof?.episodeId).toBe("moon-garden-cleanup-001");
  expect(proof?.mode).toBe("image-derived-puppet-cutouts");
  expect(proof?.sourceImage).toBe("/aura-assets/moon-garden-feature-frame.png");
  expect(proof?.sourcePixelsAnimated).toBe(true);
  expect(proof?.notTrue3D).toBe(true);
  expect(proof?.movingCutouts).toContain("blue robot source-pixel head/body cutout");
  expect(proof?.movingCutouts).toContain("yellow robot source-pixel arm/tool area");
  expect(proof?.limitations.join(" ")).toMatch(/flattened/i);

  const screenshot = await page.locator(".image-puppet__frame").screenshot({ animations: "disabled" });
  expect(screenshot.byteLength).toBeGreaterThan(90_000);

  const outputPath = resolve(findWorkspaceRoot(process.cwd()), "tests/reports/prompt-animation/cartoon-image-puppet-frame.png");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, screenshot);
});

function findWorkspaceRoot(start: string) {
  let current = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return start;
}
