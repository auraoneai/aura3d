import { expect, test } from "@playwright/test";

const routes = ["/", "/playable/", "/evidence/", "/accessibility/", "/deploy-check/", "/poster/"];

test.describe("Aura Clash route health", () => {
  for (const route of routes) {
    test(`${route} renders the Aura Clash shell`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByRole("link", { name: /Aura Clash/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Aura Clash/i })).toBeVisible();
    });
  }
});
