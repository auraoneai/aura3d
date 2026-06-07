import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("2D puppet route animates separate robot parts over the concept frame", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const sourceResponse = await request.get("/aura-assets/moon-garden-feature-frame.png");
  expect(sourceResponse.ok()).toBe(true);

  await page.goto("/?view=puppet-2d&sampleTime=24");
  const frame = page.locator("#puppet-episode-2d");
  await expect(frame).toBeVisible();
  await expect(page.locator("[data-puppet-caption]")).toContainText(/tiny circle|stones|cleanup/i);
  await expect(page.locator(".puppet-robot--miko .puppet-tool--broom")).toBeVisible();
  await expect(page.locator(".puppet-robot--luma .puppet-tool--rake")).toBeVisible();
  await expect(page.locator(".puppet-wheelbarrow")).toBeVisible();

  const proof = await page.evaluate(() => window.__AURA3D_CARTOON_2D_PUPPET_PROOF__);
  expect(proof?.episodeId).toBe("moon-garden-cleanup-001");
  expect(proof?.mode).toBe("2d-puppet-animation-over-concept-art");
  expect(proof?.sourceImage).toBe("/aura-assets/moon-garden-feature-frame.png");
  expect(proof?.notTrue3D).toBe(true);
  expect(proof?.animatedParts).toContain("blue robot broom sweep");
  expect(proof?.animatedParts).toContain("yellow robot rake/push arm");
  expect(proof?.animatedParts).toContain("wheelbarrow body roll");
  expect(proof?.limitations.join(" ")).toMatch(/2D puppet animation over concept art/i);

  const screenshot = await page.locator(".puppet-episode__frame").screenshot({ animations: "disabled" });
  expect(screenshot.byteLength).toBeGreaterThan(90_000);

  const outputPath = resolve(findWorkspaceRoot(process.cwd()), "tests/reports/prompt-animation/cartoon-2d-puppet-frame.png");
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
