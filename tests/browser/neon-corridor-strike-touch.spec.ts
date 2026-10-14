import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test.setTimeout(180_000);

interface TouchEvidence {
  readonly status: string;
  readonly hp: number;
  readonly ammo: number;
  readonly reserve: number;
  readonly shotsFired: number;
  readonly pickups: number;
  readonly resets: number;
  readonly paused: boolean;
  readonly reloading: boolean;
  readonly yaw: number;
  readonly pitch: number;
  readonly lookTarget: readonly number[];
  readonly x: number;
  readonly z: number;
  readonly touch: {
    readonly enabled: boolean;
    readonly actions: Readonly<Record<string, number>>;
    readonly lookGestures: number;
  };
}

async function read(page: Page): Promise<TouchEvidence | undefined> {
  return page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: TouchEvidence }).__AURA3D_FPS_EVIDENCE__);
}

async function holdWhile(locator: Locator, assertion: () => Promise<void>): Promise<void> {
  await locator.hover();
  await locator.page().mouse.down();
  try {
    await assertion();
  } finally {
    await locator.page().mouse.up();
  }
}

test("neon-corridor-strike touch controls prove look, combat, pickup, pause, outcomes, and reset", async ({ page }) => {
  const server = await startExampleDevServer();
  const reportDir = resolve("tests/reports/neon-corridor-strike-touch");
  mkdirSync(reportDir, { recursive: true });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/examples/neon-corridor-strike/?touch=1`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
    const initial = await read(page);
    expect(initial?.touch.enabled).toBe(true);
    writeFileSync(resolve(reportDir, "touch-first-load.png"), await page.screenshot({ fullPage: false }));

    const controls = page.locator("#fps-touch-controls button, #fps-touch-controls [data-touch-look], [data-hud=\"fire\"]");
    expect(await controls.count()).toBe(9);
    const boxes = await controls.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { label: node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "", x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    for (const box of boxes) {
      expect(box.width, box.label).toBeGreaterThanOrEqual(44);
      expect(box.height, box.label).toBeGreaterThanOrEqual(44);
      expect(box.x, box.label).toBeGreaterThanOrEqual(0);
      expect(box.y, box.label).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, box.label).toBeLessThanOrEqual(390);
      expect(box.y + box.height, box.label).toBeLessThanOrEqual(844);
    }

    const look = page.locator("[data-touch-look]");
    const lookBox = await look.boundingBox();
    expect(lookBox).not.toBeNull();
    await page.mouse.move(lookBox!.x + lookBox!.width / 2, lookBox!.y + lookBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(lookBox!.x + lookBox!.width / 2 + 52, lookBox!.y + lookBox!.height / 2 - 34, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await read(page))?.touch.lookGestures).toBeGreaterThan(0);
    const looked = await read(page);
    expect(Math.abs((looked?.yaw ?? 0) - (initial?.yaw ?? 0))).toBeGreaterThan(0.05);
    expect(Math.abs((looked?.pitch ?? 0) - (initial?.pitch ?? 0))).toBeGreaterThan(0.05);
    expect(looked?.lookTarget).not.toEqual(initial?.lookTarget);

    // Reset the aim for the authored movement route, using the real touch reset.
    await page.locator("[data-touch-action=\"reset\"]").click();
    await expect.poll(async () => (await read(page))?.resets).toBeGreaterThan(initial?.resets ?? 0);

    const startZ = (await read(page))?.z ?? 0;
    await holdWhile(page.locator("[data-touch-action=\"back\"]"), async () => {
      await expect.poll(async () => Math.abs(((await read(page))?.z ?? startZ) - startZ), { timeout: 20_000 }).toBeGreaterThan(0.3);
    });

    await page.locator("[data-hud=\"fire\"]").click();
    await expect.poll(async () => (await read(page))?.shotsFired).toBeGreaterThan(0);
    const fired = await read(page);
    expect(fired?.ammo ?? 12).toBeLessThan(12);
    expect(fired?.touch.actions.fire ?? 0).toBeGreaterThan(0);

    await page.locator("[data-touch-action=\"reload\"]").click();
    await expect.poll(async () => (await read(page))?.reloading, { timeout: 2_000 }).toBe(true);
    await expect.poll(async () => (await read(page))?.ammo, { timeout: 5_000 }).toBe(12);

    await page.locator("[data-touch-action=\"pause\"]").click();
    await expect.poll(async () => (await read(page))?.paused).toBe(true);
    const paused = await read(page);
    await page.waitForTimeout(350);
    expect((await read(page))?.z).toBe(paused?.z);
    await page.locator("[data-touch-action=\"pause\"]").click();
    await expect.poll(async () => (await read(page))?.paused).toBe(false);

    await page.locator("[data-touch-action=\"reset\"]").click();
    await expect.poll(async () => (await read(page))?.ammo).toBe(12);
    await holdWhile(page.locator("[data-touch-action=\"right\"]"), async () => {
      await expect.poll(async () => Math.abs((await read(page))?.x ?? 0), { timeout: 20_000 }).toBeGreaterThan(1.3);
    });
    await holdWhile(page.locator("[data-touch-action=\"forward\"]"), async () => {
      await expect.poll(async () => (await read(page))?.pickups ?? 0, { timeout: 25_000 }).toBeGreaterThan(0);
    });
    const picked = await read(page);
    expect(picked?.touch.actions.right ?? 0).toBeGreaterThan(0);
    expect(picked?.touch.actions.forward ?? 0).toBeGreaterThan(0);
    writeFileSync(resolve(reportDir, "touch-pickup.png"), await page.screenshot({ fullPage: false }));

    await holdWhile(page.locator("[data-touch-action=\"forward\"]"), async () => {
      await expect.poll(async () => (await read(page))?.status, { timeout: 30_000 }).toBe("won");
    });
    writeFileSync(resolve(reportDir, "touch-win.png"), await page.screenshot({ fullPage: false }));

    await page.locator("[data-touch-action=\"reset\"]").click();
    await expect.poll(async () => (await read(page))?.status).toBe("playing");
    await expect.poll(async () => (await read(page))?.status, { timeout: 35_000 }).toBe("lost");
    writeFileSync(resolve(reportDir, "touch-fail.png"), await page.screenshot({ fullPage: false }));
    await page.locator("[data-touch-action=\"reset\"]").click();
    await expect.poll(async () => (await read(page))?.status).toBe("playing");
    const final = await read(page);
    expect(final?.hp).toBe(100);
    expect(final?.touch.actions).toMatchObject({ forward: expect.any(Number), right: expect.any(Number), reload: expect.any(Number), pause: expect.any(Number), reset: expect.any(Number), fire: expect.any(Number) });

    writeFileSync(resolve(reportDir, "touch-lifecycle.json"), `${JSON.stringify({
      schema: "aura3d-neon-corridor-touch/1.0",
      pass: true,
      viewport: { width: 390, height: 844 },
      controls: boxes,
      initial,
      looked,
      fired,
      paused,
      picked,
      final
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
