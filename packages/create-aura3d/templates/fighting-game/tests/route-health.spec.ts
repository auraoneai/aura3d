import { expect, test } from "@playwright/test";

test("fighting-game route loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#hud")).toContainText("Aura3D Fighting Game Runtime");
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_GAME_SOURCE__?.readiness));
  const source = await page.evaluate(() => (window as any).__AURA3D_GAME_SOURCE__);
  expect(source.readiness.route).toBe("/");
  expect(source.lifecycle).toMatchObject({
    kind: "aura-game-app-runtime",
    usesCreateGameApp: true,
    runtimeEvidenceGlobal: "__AURA3D_GAME_RUNTIME__"
  });
  expect(source.readiness.buildDeclarations.routeHealthSpec).toBe("tests/route-health.spec.ts");
});
