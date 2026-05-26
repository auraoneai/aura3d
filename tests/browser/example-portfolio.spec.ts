import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_PORTFOLIO__?: {
      status: "ready";
      examples: number;
      readinessDemos: readonly {
        readonly id: string;
        readonly status: "local-ready" | "achieved" | "external-blocked";
        readonly reportPath: string;
        readonly proofCommand: string;
      }[];
      hiddenValidationExamples: readonly string[];
      claimBoundary: string;
    };
  }
}

const portfolioExamples = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
] as const;

const localReadinessDemos = [
  "product-visual",
  "pbr",
  "hdr-render-target",
  "shadow-map",
  "postprocess-suite",
  "gltf",
  "webgpu",
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
    await page.waitForFunction(() => window.__AURA3D_PORTFOLIO__?.status === "ready");

    const state = await page.evaluate(() => window.__AURA3D_PORTFOLIO__);
    const visibleCards = await page.locator("[data-example-id]").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-example-id")),
    );
    const readinessCards = await page.locator("[data-readiness-id]").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-readiness-id")),
    );

    expect(errors).toEqual([]);
    expect(state?.examples).toBe(portfolioExamples.length);
    expect(visibleCards).toEqual([...portfolioExamples]);
    expect(readinessCards).toEqual([...localReadinessDemos]);
    expect(state?.readinessDemos.map((demo) => demo.id)).toEqual([...localReadinessDemos]);
    expect(state?.readinessDemos.find((demo) => demo.id === "gltf")?.status).toBe("achieved");
    expect(state?.readinessDemos.find((demo) => demo.id === "webgpu")?.status).toBe("achieved");
    expect(state?.readinessDemos.filter((demo) => demo.status === "local-ready")).toHaveLength(5);
    expect(state?.hiddenValidationExamples).toContain("00-basic-triangle");
    expect(state?.hiddenValidationExamples).toContain("10-particles");
    await expect(page.getByRole("heading", { name: "Flagship Screenshots" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Local Renderer Proofs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Example" })).toHaveCount(portfolioExamples.length);
    await expect(page.getByRole("link", { name: "Open Live Proof" })).toHaveCount(localReadinessDemos.length);
    await expect(page.getByText(/Not true yet: production-ready/)).toBeVisible();
  });
});
