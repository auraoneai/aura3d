import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test.setTimeout(180_000);

interface FpsEvidence {
  readonly status: string;
  readonly claimLabel: string;
  readonly hp: number;
  readonly ammo: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly kills: number;
  readonly pickups: number;
  readonly resets: number;
  readonly pointerLockRequested: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly z: number;
  readonly typedAssets: readonly string[];
  readonly primitiveCount: number;
  readonly knownLimits: readonly string[];
  readonly rendererMode: string;
  readonly rendererFallback: string;
}

test("neon-corridor-strike is a playable prototype FPS", async ({ page }) => {
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

    const read = () => page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: FpsEvidence }).__AURA3D_FPS_EVIDENCE__);
    const initial = await read();
    expect(initial?.claimLabel).toBe("prototype");
    expect(initial?.typedAssets).toEqual(expect.arrayContaining(["arena", "impA", "impB", "pulseRifle", "ammoCrate", "medkit"]));
    expect(initial?.knownLimits.length).toBeGreaterThan(0);

    writeFileSync(resolve(reports, "first-load.png"), await page.screenshot({ fullPage: false }));

    await page.locator("canvas").click();
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(160);
    const fired = await read();
    expect(fired?.pointerLockRequested ?? 0).toBeGreaterThanOrEqual(1);
    expect(fired?.shotsFired ?? 0).toBeGreaterThan(0);
    expect(fired?.ammo ?? 99).toBeLessThan(12);
    expect((fired?.hits ?? 0) + (fired?.kills ?? 0)).toBeGreaterThan(0);
    writeFileSync(resolve(reports, "mid-combat.png"), await page.screenshot({ fullPage: false }));

    await page.mouse.move(640, 360);
    await page.mouse.move(760, 290);
    const afterLook = await read();
    expect(Math.abs((afterLook?.yaw ?? 0) - (initial?.yaw ?? 0)) + Math.abs((afterLook?.pitch ?? 0) - (initial?.pitch ?? 0))).toBeGreaterThan(0);

    const startZ = afterLook?.z ?? 0;
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(650);
    await page.keyboard.up("KeyS");
    const moved = await read();
    expect(Math.abs((moved?.z ?? 0) - startZ)).toBeGreaterThan(0.3);

    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(180);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(200);
    const combat = await read();
    expect(combat?.shotsFired ?? 0).toBeGreaterThan(fired?.shotsFired ?? 0);
    writeFileSync(resolve(reports, "after-kill.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyT");
    await page.waitForTimeout(280);
    const reset = await read();
    expect(reset?.resets ?? 0).toBeGreaterThan(0);
    expect(reset?.ammo).toBe(12);
    expect(reset?.hp).toBe(100);
    expect(reset?.status).toBe("playing");
    writeFileSync(resolve(reports, "reset.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(180);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(180);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(200);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(420);
    await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyW");
    const picked = await read();
    expect(picked?.pickups ?? 0).toBeGreaterThan(0);

    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2400);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    const won = await read();
    expect(won?.status).toBe("won");
    writeFileSync(resolve(reports, "win.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyT");
    await page.waitForTimeout(200);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(850);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(10000);
    const lost = await read();
    expect(lost?.status).toBe("lost");
    writeFileSync(resolve(reports, "death.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyT");
    await page.waitForTimeout(200);
    const afterDeathReset = await read();
    expect(afterDeathReset?.status).toBe("playing");
    expect(afterDeathReset?.hp).toBe(100);
    writeFileSync(resolve(reports, "death-reset.png"), await page.screenshot({ fullPage: false }));

    writeFileSync(resolve(reports, "route-health.json"), `${JSON.stringify({
      ready: true,
      claimLabel: afterDeathReset?.claimLabel,
      rendererMode: afterDeathReset?.rendererMode,
      rendererFallback: afterDeathReset?.rendererFallback,
      typedAssets: afterDeathReset?.typedAssets,
      primitiveCount: afterDeathReset?.primitiveCount,
      knownLimits: afterDeathReset?.knownLimits
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
