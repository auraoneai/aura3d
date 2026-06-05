import { expect, test } from "@playwright/test";

test("deploy-check route reports static typed asset readiness", async ({ page }) => {
  await page.goto("/deploy-check/");
  await expect(page.getByText(/Deploy-check route/i)).toBeVisible();
  await expect(page.getByText(/assets\.auraClashPlayableScene/i)).toBeVisible();
  await expect(page.getByText(/download → stage → build GLB → CLI register/i)).toBeVisible();
});
