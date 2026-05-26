import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-examples-browser.json";
const screenshotPath = "tests/reports/external-gallery/gallery/external-gallery.png";

test.describe("ExternalParity examples and gallery", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("loads the ExternalParity gallery with real screenshots and example links", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/external-gallery/index.html`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("hr4-gallery-card")).toHaveCount(8);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth >= 300 && image.naturalHeight >= 180), undefined, { timeout: 30_000 });
    mkdirSync(join(process.cwd(), "tests/reports/external-gallery/gallery"), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const cards = await page.$$eval("[data-testid='hr4-gallery-card']", (nodes) => nodes.map((node) => {
      const image = node.querySelector("img") as HTMLImageElement | null;
      const link = node.querySelector("a") as HTMLAnchorElement | null;
      const heading = node.querySelector("h2")?.textContent ?? "";
      return {
        heading,
        image: image?.getAttribute("src") ?? "",
        naturalWidth: image?.naturalWidth ?? 0,
        naturalHeight: image?.naturalHeight ?? 0,
        href: link?.getAttribute("href") ?? ""
      };
    }));
    const report = {
      ok: errors.length === 0 &&
        cards.length === 8 &&
        cards.every((card) => card.naturalWidth >= 300 && card.naturalHeight >= 180 && card.href.length > 0) &&
        cards.some((card) => card.heading === "Installable Template") &&
        cards.some((card) => card.heading === "Three.js Parity"),
      generatedAt: new Date().toISOString(),
      screenshotPath,
      cards,
      errors,
      productBoundary: "ExternalParity gallery page proves example/tutorial navigation and screenshot evidence only. It does not replace release readiness."
    };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);
    expect(report.ok).toBe(true);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}
