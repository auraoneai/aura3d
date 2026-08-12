import { expect, test } from "@playwright/test";

test("fighting-game route loads", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await page.waitForFunction(() =>
    Boolean((window as any).__AURA3D_GAME_SOURCE__?.readiness) &&
    document.querySelector("#hud h1")?.textContent === "Aura3D Fighting Game Runtime",
    undefined,
    { polling: 100, timeout: 60_000 }
  );
  await expect(page.locator("#hud h1")).toHaveText("Aura3D Fighting Game Runtime");
  const source = await page.evaluate(() => (window as any).__AURA3D_GAME_SOURCE__);
  expect(source.readiness.route).toBe("/");
  expect(source.lifecycle).toMatchObject({
    kind: "aura-game-app-runtime",
    usesCreateGameApp: true,
    runtimeEvidenceGlobal: "__AURA3D_GAME_RUNTIME__"
  });
  expect(source.readiness.buildDeclarations.routeHealthSpec).toBe("tests/route-health.spec.ts");
});
