import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { comparePngBuffers } from "./showcase-visual-quality";

test.setTimeout(120_000);

test("neon-corridor-strike shot graphics are visible in frame", async ({ page }) => {
  const server = await startExampleDevServer();
  const reports = resolve("tests/reports/neon-corridor-strike");
  mkdirSync(reports, { recursive: true });
  try {
    page.on("pageerror", (error) => {
      throw error;
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/neon-corridor-strike/`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");

    const beforeEvidence = await page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: Record<string, unknown> }).__AURA3D_FPS_EVIDENCE__);
    writeFileSync(resolve(reports, "shot-before.json"), `${JSON.stringify(beforeEvidence, null, 2)}\n`);
    const beforePng = await page.screenshot({ fullPage: false });
    writeFileSync(resolve(reports, "shot-before.png"), beforePng);
    expect(Number((beforeEvidence?.enemyVisualY as number | undefined) ?? 1)).toBeLessThan(0.05);

    await page.evaluate(() => {
      (window as unknown as { __AURA3D_FPS_SHOOT__?: () => void }).__AURA3D_FPS_SHOOT__?.();
    });
    await expect.poll(() => page.evaluate(() => {
      const evidence = (window as unknown as { __AURA3D_FPS_EVIDENCE__?: { shotsFired?: number; shotFxVisible?: boolean; ammo?: number; shotFxNodeCount?: number } }).__AURA3D_FPS_EVIDENCE__;
      return {
        shotsFired: evidence?.shotsFired ?? 0,
        shotFxVisible: evidence?.shotFxVisible === true,
        ammo: evidence?.ammo ?? 12,
        shotFxNodeCount: evidence?.shotFxNodeCount ?? 0
      };
    }), { timeout: 2_000 }).toMatchObject({ shotsFired: 1, shotFxVisible: true, shotFxNodeCount: 4 });

    await page.evaluate(() => new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    }));
    const duringPng = await page.screenshot({ fullPage: false });
    writeFileSync(resolve(reports, "shot-during.png"), duringPng);
    const duringEvidence = await page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: Record<string, unknown> }).__AURA3D_FPS_EVIDENCE__);
    writeFileSync(resolve(reports, "shot-during.json"), `${JSON.stringify(duringEvidence, null, 2)}\n`);
    expect(duringEvidence?.shotFxVisible).toBe(true);
    expect(Number((duringEvidence?.enemyVisualY as number | undefined) ?? 1)).toBeLessThan(0.05);
    const muzzle = (duringEvidence?.shotBolt0 as number[] | undefined) ?? [0, -8, 0];
    expect(muzzle[1] ?? -8).toBeGreaterThan(0.4);
    expect(muzzle[2] ?? 0).toBeGreaterThan(7.4);
    expect(muzzle[2] ?? 0).toBeLessThan(8.9);

    const barrelCrop = comparePngBuffers(beforePng, duringPng, { x: 600, y: 300, width: 280, height: 200 });
    const farHall = comparePngBuffers(beforePng, duringPng, { x: 500, y: 150, width: 280, height: 140 });
    writeFileSync(resolve(reports, "shot-pixel-diff.json"), `${JSON.stringify({ barrelCrop, farHall }, null, 2)}\n`);
    expect(barrelCrop.changedRatio).toBeGreaterThan(0.03);
    expect(farHall.changedRatio).toBeLessThan(0.12);

    await page.waitForTimeout(560);
    writeFileSync(resolve(reports, "shot-after.png"), await page.screenshot({ fullPage: false }));
  } finally {
    await server.close();
  }
});
