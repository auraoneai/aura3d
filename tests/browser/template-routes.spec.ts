import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Verifies the create-aura3d template preview routes actually BOOT in a browser with the workspace
// packages (the templates' own pinned-version vite needs `npm install`; the monorepo dev server
// resolves @aura3d/* to local source, so this proves the route logic boots + drives the kit).
test.describe("create-aura3d template preview routes boot", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("character-controller route boots and exposes a live locomotion proof", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${server.origin}/tests/browser/character-controller-route-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: unknown }).__AURA3D_CHARACTER_CONTROLLER_PROOF__));
    const idle = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
    expect(idle!.state).toBe("idle");
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(500);
    const moving = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string; clipWeights: { weight: number }[] } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
    await page.keyboard.up("KeyD");
    expect(["walk", "run"]).toContain(moving!.state);
    expect(moving!.clipWeights.reduce((a, w) => a + w.weight, 0)).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
  });

  test("animation-studio preview route boots and exposes a live locomotion proof", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${server.origin}/tests/browser/animation-studio-route-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ANIMATION_STUDIO_PROOF__?: unknown }).__AURA3D_ANIMATION_STUDIO_PROOF__));
    const proof = await page.evaluate(() => (window as unknown as { __AURA3D_ANIMATION_STUDIO_PROOF__?: { state: string; clipWeights: { weight: number }[]; profileSchema: string } }).__AURA3D_ANIMATION_STUDIO_PROOF__);
    expect(["idle", "walk", "run"]).toContain(proof!.state);
    expect(proof!.profileSchema).toBe("aura-animation-profile/v1");
    expect(proof!.clipWeights.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
