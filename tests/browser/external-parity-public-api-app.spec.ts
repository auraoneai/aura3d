import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-public-api-app-browser.json";

test.describe("V4 public API browser app", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders through createA3DApp and reports diagnostics", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/fixtures/external-parity-public-api-app/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__A3D_V4_PUBLIC_API_APP__?.status === "ready", undefined, { timeout: 60_000 });
    const screenshotPath = "tests/reports/external-gallery/api/public-api-app.png";
    mkdirSync(join(process.cwd(), "tests/reports/external-gallery/api"), { recursive: true });
    await page.locator("[data-testid='hr4-public-api-canvas']").screenshot({ path: screenshotPath });
    const state = await page.evaluate(() => window.__A3D_V4_PUBLIC_API_APP__);
    const report = {
      ok: errors.length === 0 &&
        state?.workflowKind === "scene-showcase" &&
        state?.appState === "ready" &&
        state?.quality?.preset === "balanced" &&
        state?.workflowRuns === 1 &&
        state?.lastWorkflow === "scene-showcase" &&
        Number(state?.drawCalls ?? 0) > 0 &&
        typeof state?.claimBoundary === "string" &&
        state.claimBoundary.includes("external package proof"),
      generatedAt: new Date().toISOString(),
      screenshotPath,
      productBoundary: "Milestone 13 public API browser proof only. Installable templates, external packed-package proof, and Three.js parity remain required.",
      errors,
      state
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

declare global {
  interface Window {
    __A3D_V4_PUBLIC_API_APP__?: {
      readonly status?: string;
      readonly workflowKind?: string;
      readonly appState?: string;
      readonly quality?: { readonly preset?: string };
      readonly workflowRuns?: number;
      readonly lastWorkflow?: string;
      readonly drawCalls?: number;
      readonly claimBoundary?: string;
    };
  }
}
