import { expect, test } from "@playwright/test";

test("accessibility route exposes keyboard and reduced-motion proof", async ({ page }) => {
  await page.goto("/accessibility/");
  await expect(page.getByText(/keyboard-friendly actions/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Q · Guard/i })).toBeVisible();
  await page.keyboard.press("KeyQ");
  await expect(page.getByText(/braces|guard recovers/i)).toBeVisible();
});
