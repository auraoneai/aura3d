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

    // NC-A6/NC-10 additive evidence only: first-load frame that includes the
    // SECTOR 1 / SECTOR 2 / EXIT text3D signage. No assertions added or edited.
    writeFileSync(resolve(reports, "signage-firstload.png"), await page.screenshot({ fullPage: false }));

    // Stage the review frame through short, real keyboard advances. A single
    // held-key poll can overshoot by metres when a software-rendered frame
    // represents multiple simulation ticks, so bounded taps keep the final
    // combat distance reproducible without teleporting or replaying state.
    let stagedZ = 99;
    for (let advance = 0; advance < 32 && stagedZ > 5.8; advance += 1) {
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(34);
      await page.keyboard.up("KeyW");
      stagedZ = await page.evaluate(() =>
        (window as unknown as { __AURA3D_FPS_EVIDENCE__?: { z?: number } }).__AURA3D_FPS_EVIDENCE__?.z ?? 99
      );
    }
    expect(stagedZ).toBeLessThanOrEqual(5.8);
    expect(stagedZ).toBeGreaterThan(4.6);

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
    // Keep the matrix's historical filename reproducible while making the
    // artifact itself the full, reviewable action frame.  The old name came
    // from a tiny crop and no longer described what the evidence gate needs;
    // write it from the same producer bytes so reviewers never inspect a
    // stale, hand-copied crop.
    writeFileSync(resolve(reports, "crop-during-enemies.png"), duringPng);
    const duringEvidence = await page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: Record<string, unknown> }).__AURA3D_FPS_EVIDENCE__);
    writeFileSync(resolve(reports, "shot-during.json"), `${JSON.stringify(duringEvidence, null, 2)}\n`);
    expect(duringEvidence?.shotFxVisible).toBe(true);
    expect(Number((duringEvidence?.enemyVisualY as number | undefined) ?? 1)).toBeLessThan(0.05);
    const capturedPlayerZ = Number((duringEvidence?.z as number | undefined) ?? 99);
    expect(capturedPlayerZ).toBeLessThanOrEqual(5.8);
    expect(capturedPlayerZ).toBeGreaterThan(4.6);
    const muzzle = (duringEvidence?.shotBolt0 as number[] | undefined) ?? [0, -8, 0];
    expect(muzzle[1] ?? -8).toBeGreaterThan(0.4);
    const playerZ = capturedPlayerZ;
    expect(muzzle[2] ?? 0).toBeGreaterThan(playerZ - 1.05);
    expect(muzzle[2] ?? 0).toBeLessThan(playerZ - 0.55);
    const bolt = (duringEvidence?.shotBolt1 as number[] | undefined) ?? [0, -8, 0];
    expect(bolt[1] ?? -8).toBeGreaterThan(0.4);
    expect(bolt[2] ?? 0).toBeLessThan((muzzle[2] ?? 9) - 0.04);

    const actionLane = comparePngBuffers(beforePng, duringPng, { x: 500, y: 140, width: 360, height: 430 });
    const farHall = comparePngBuffers(beforePng, duringPng, { x: 500, y: 150, width: 280, height: 140 });
    writeFileSync(resolve(reports, "shot-pixel-diff.json"), `${JSON.stringify({ actionLane, farHall }, null, 2)}\n`);
    expect(actionLane.changedRatio).toBeGreaterThan(0.02);
    expect(farHall.changedRatio).toBeLessThan(0.18);

    await page.waitForTimeout(560);
    writeFileSync(resolve(reports, "shot-after.png"), await page.screenshot({ fullPage: false }));
  } finally {
    await server.close();
  }
});
