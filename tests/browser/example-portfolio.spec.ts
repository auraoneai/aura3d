import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __GALILEO3D_PORTFOLIO__?: {
      status: "ready";
      examples: number;
      hiddenValidationExamples: readonly string[];
      claimBoundary: string;
    };
  }
}

const portfolioExamples = [
  "showcase-world",
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "asset-viewer",
  "pbr-camera-comparison",
  "pbr-material-lab",
  "rendering-large-scene",
  "physics-sandbox",
  "postprocess-lab",
  "shadow-lab",
  "animation-state-machine",
  "editor-authored-project",
] as const;

test.describe("example portfolio", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("surfaces the strongest current examples and hides numbered validation slices", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(`${server.origin}/examples/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_PORTFOLIO__?.status === "ready");

    const state = await page.evaluate(() => window.__GALILEO3D_PORTFOLIO__);
    const visibleCards = await page.locator("[data-example-id]").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-example-id")),
    );

    expect(errors).toEqual([]);
    expect(state?.examples).toBe(portfolioExamples.length);
    expect(visibleCards).toEqual([...portfolioExamples]);
    expect(state?.hiddenValidationExamples).toContain("00-basic-triangle");
    expect(state?.hiddenValidationExamples).toContain("10-particles");
    await expect(page.getByRole("heading", { name: "Current Engine Proofs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Example" })).toHaveCount(portfolioExamples.length);
    await expect(page.getByText(/Not true yet: production-ready/)).toBeVisible();
  });
});
