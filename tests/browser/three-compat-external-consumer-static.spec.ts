import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("three-compat external consumer static preview renders built output", async ({ page }) => {
  const previewPath = `${process.cwd()}/tests/reports/three-compat-external-consumer/static-preview/index.html`;
  if (!existsSync(previewPath)) {
    const result = spawnSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/three-compat-static-preview-smoke/index.ts"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }
  await page.goto(`file://${previewPath}`);
  await expect.poll(async () => page.evaluate(() => window.__a3dStaticPreview)).toBe(true);
  await page.screenshot({ path: "tests/reports/three-compat-external-consumer/static-preview.png" });
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    return lit;
  });
  expect(litPixels).toBeGreaterThan(50000);
});
