import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("sample episode visual renders a reviewable animation frame", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?sampleTime=24");

  const frame = page.locator("#sample-episode-visual");
  await expect(frame).toBeVisible();
  await expect(page.locator("[data-sample-caption]")).toContainText(/tiny circle|stones|cleanup/i);

  const proof = await page.evaluate(() => window.__AURA3D_ANIMATION_SAMPLE_EPISODE__);
  expect(proof?.episodeId).toBe("moon-garden-cleanup-001");
  expect(proof?.sample.shotId).toBe("shot-glow-stone-teamwork");
  expect(proof?.visualLayer.characters).toEqual(["miko", "luma"]);
  expect(proof?.visualLayer.screenshotTarget).toBe("#sample-episode-visual");
  expect(proof?.visualLayer.styleGuide).toMatch(/animation/i);
  expect(proof?.visualLayer.renderedBy).toBe("aura3d-scene");
  expect(proof?.visualLayer.usesTypedAssets).toBe(true);
  await expect(frame).toHaveAttribute("data-uses-typed-assets", "true");
  await expect(page.locator(".animation-robot").first()).toBeHidden();

  const box = await frame.boundingBox();
  expect(box?.width).toBeGreaterThan(900);
  expect(box?.height).toBeGreaterThan(500);

  const screenshot = await frame.screenshot({ animations: "disabled" });
  expect(screenshot.byteLength).toBeGreaterThan(40_000);

  const outputPath = resolve(findWorkspaceRoot(process.cwd()), "tests/reports/prompt-animation/animation-sample-episode.png");
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
