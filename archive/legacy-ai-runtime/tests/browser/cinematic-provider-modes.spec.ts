import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("cinematic provider modes", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("keeps fixture/mock local and requires a server proxy for live providers", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/cinematic-prompt-to-scene/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#provider-mode")).toHaveValue("fixture");
    await expect(page.getByText("Runs without keys")).toBeVisible();

    await page.locator("#provider-mode").selectOption("mock");
    await expect(page.locator("#provider-panel")).toContainText("MockProvider");

    await page.locator("#provider-mode").selectOption("openai");
    await expect(page.locator("#provider-panel")).toContainText("Server proxy required");
    await expect(page.locator("#scene-error")).toContainText("needs a server proxy");
    await expect(page.getByText("Browser keys blocked")).toBeVisible();
  });
});
