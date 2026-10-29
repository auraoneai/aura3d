import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Apex Overdrive first-run sound (audit RR-5). Headless Chromium lets any page start audio, which hides the bug, so this
 * file launches Chromium with the desktop autoplay rule (`--autoplay-policy=user-gesture-required`): an AudioContext stays
 * suspended until a user gesture. Logs `GL_PROBE` lines with the context state at boot and after the first key press.
 * Remote only (tools/remote-acr/run.sh).
 */
test.use({
  launchOptions: {
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--autoplay-policy=user-gesture-required"]
  }
});

const log = (line: string): void => { process.stdout.write(`${line}\n`); };
let server: ExampleDevServer;

test.describe("audit-fix roadster-rush audio", () => {
  test.setTimeout(2_400_000);
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("roadster-rush audio unlocks on the first gesture", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/apps/showcase-roadster-rush/?seed=42`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 25 * 60_000, polling: 1000 });
    const state = () => page.evaluate(() => {
      const g = (window as unknown as Record<string, any>).__GAME__?.game;
      const m = g?.audio?.manager;
      return { mode: g?.mode ?? null, context: m?.context?.state ?? null, manager: m?.state ?? null };
    });
    await page.waitForTimeout(3000);
    log(`GL_PROBE ${JSON.stringify({ target: "audio", step: "boot-no-gesture", ...(await state()) })}`);
    await page.keyboard.press("Space");
    await page.waitForTimeout(2500);
    log(`GL_PROBE ${JSON.stringify({ target: "audio", step: "after-first-key", ...(await state()) })}`);
    await page.keyboard.press("KeyA");
    await page.waitForTimeout(1500);
    log(`GL_PROBE ${JSON.stringify({ target: "audio", step: "after-second-key", ...(await state()) })}`);
  });
});
