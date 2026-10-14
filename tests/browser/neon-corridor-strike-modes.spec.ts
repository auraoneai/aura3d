import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { analyzePngDifferenceBounds, type PngCrop } from "./showcase-visual-quality";

test.setTimeout(180_000);

const REPORT_DIR = resolve("tests/reports/neon-corridor-strike-modes");

interface ModeEvidence {
  readonly status?: string;
  readonly paused?: boolean;
  readonly hp?: number;
  readonly shotsFired?: number;
  readonly shotFxVisible?: boolean;
  readonly objective?: string;
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
  readonly cameraShake?: number;
  readonly effectFlashIntensity?: number;
}

async function waitReady(page: Page): Promise<void> {
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
}

async function readEvidence(page: Page): Promise<ModeEvidence | undefined> {
  return page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: ModeEvidence }).__AURA3D_FPS_EVIDENCE__);
}

for (const scenario of [
  { id: "desktop", width: 1280, height: 800 },
  { id: "mobile", width: 390, height: 844 }
] as const) {
  test(`neon-corridor-strike ${scenario.id} weapon and HUD framing stays out of the play lane`, async ({ page }) => {
    const server = await startExampleDevServer();
    mkdirSync(REPORT_DIR, { recursive: true });
    try {
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.goto(`${server.origin}/examples/neon-corridor-strike/`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      await page.screenshot({ path: resolve(REPORT_DIR, `${scenario.id}-first-load.png`), fullPage: false, scale: "css" });

      // Freeze every gameplay-owned pixel before differencing the actual rifle.
      await page.keyboard.press("KeyP");
      await expect.poll(async () => (await readEvidence(page))?.paused).toBe(true);
      const visible = await page.screenshot({ path: resolve(REPORT_DIR, `${scenario.id}-weapon.png`), fullPage: false, scale: "css" });
      await page.evaluate(() => (window as unknown as { __AURA3D_FPS_CAPTURE__?: { setWeaponVisible(visible: boolean): void } }).__AURA3D_FPS_CAPTURE__?.setWeaponVisible(false));
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      const hidden = await page.screenshot({ path: resolve(REPORT_DIR, `${scenario.id}-weapon-hidden.png`), fullPage: false, scale: "css" });

      const canvasBox = await page.locator("#app canvas").boundingBox();
      expect(canvasBox).not.toBeNull();
      const crop: PngCrop = {
        x: Math.floor(canvasBox!.x),
        y: Math.floor(canvasBox!.y),
        width: Math.floor(canvasBox!.width),
        height: Math.floor(canvasBox!.height)
      };
      const difference = analyzePngDifferenceBounds(visible, hidden, crop, 16);
      expect(difference.changedPixels).toBeGreaterThan(100);
      expect(difference.bounds).toBeDefined();
      expect(difference.clipped).toBe(false);
      const bounds = difference.bounds!;

      const centerX = crop.x + crop.width / 2;
      const centerY = crop.y + crop.height / 2;
      const weaponLeft = bounds.x;
      const weaponTop = bounds.y;
      // The isolated weapon must live below/right of the reticle and outside
      // the center play lane where enemies, pickups, and the exit are read.
      expect(weaponLeft).toBeGreaterThan(centerX + Math.max(28, crop.width * 0.08));
      expect(weaponTop).toBeGreaterThan(centerY);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(crop.x + crop.width - 8);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(crop.y + crop.height - 8);

      const fire = await page.locator("[data-hud=\"fire\"]").boundingBox();
      const objective = await page.locator("[data-hud=\"objective\"]").boundingBox();
      const crosshair = await page.locator("[data-hud=\"crosshair\"]").boundingBox();
      expect(fire).not.toBeNull();
      expect(objective).not.toBeNull();
      expect(crosshair).not.toBeNull();
      expect(fire!.width).toBeGreaterThanOrEqual(44);
      expect(fire!.height).toBeGreaterThanOrEqual(44);
      for (const box of [fire!, objective!, crosshair!]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(scenario.width);
        expect(box.y + box.height).toBeLessThanOrEqual(scenario.height);
      }

      writeFileSync(resolve(REPORT_DIR, `${scenario.id}.json`), `${JSON.stringify({
        schema: "aura3d-neon-corridor-framing/1.0",
        scenario,
        pass: true,
        weaponDifference: difference,
        controls: { fire, objective, crosshair }
      }, null, 2)}\n`);
    } finally {
      await server.close();
    }
  });
}

test("neon-corridor-strike reduced motion and flash retain combat, alarm, and damage truth", async ({ page }) => {
  const server = await startExampleDevServer();
  mkdirSync(REPORT_DIR, { recursive: true });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/examples/neon-corridor-strike/?reducedFlash=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);

    const initial = await readEvidence(page);
    expect(initial?.reducedMotion).toBe(true);
    expect(initial?.reducedFlash).toBe(true);

    await page.evaluate(() => (window as unknown as { __AURA3D_FPS_SHOOT__?: () => void }).__AURA3D_FPS_SHOOT__?.());
    await expect.poll(async () => (await readEvidence(page))?.shotsFired).toBe(1);
    const shot = await readEvidence(page);
    expect(shot?.shotFxVisible).toBe(true);
    expect(shot?.cameraShake).toBe(0);
    expect(shot?.effectFlashIntensity ?? 1).toBeGreaterThan(0);
    expect(shot?.effectFlashIntensity ?? 1).toBeLessThanOrEqual(0.35);
    writeFileSync(resolve(REPORT_DIR, "reduced-shot.png"), await page.screenshot({ fullPage: false }));

    await expect.poll(async () => (await readEvidence(page))?.objective, { timeout: 20_000 }).toContain("corridor wakes up");
    await expect.poll(async () => (await readEvidence(page))?.hp ?? 100, { timeout: 30_000 }).toBeLessThan(100);
    const damaged = await readEvidence(page);
    expect(damaged?.status).toBe("playing");
    expect(damaged?.reducedMotion).toBe(true);
    expect(damaged?.reducedFlash).toBe(true);
    const vignetteOpacity = Number(await page.locator("[data-hud=\"vignette\"]").evaluate((node) => getComputedStyle(node).opacity));
    expect(vignetteOpacity).toBeLessThanOrEqual(0.28);
    writeFileSync(resolve(REPORT_DIR, "reduced-damage-alarm.png"), await page.screenshot({ fullPage: false }));
    writeFileSync(resolve(REPORT_DIR, "reduced-mode.json"), `${JSON.stringify({
      schema: "aura3d-neon-corridor-reduced-mode/1.0",
      pass: true,
      initial,
      shot,
      damaged,
      vignetteOpacity
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
