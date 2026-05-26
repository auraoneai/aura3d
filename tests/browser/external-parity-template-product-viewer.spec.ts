import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-template-product-viewer-browser.json";
const templates = [
  { id: "external-parity-product-viewer", globalName: "__A3D_TEMPLATE_PRODUCT_VIEWER__", workflowKind: "scene-showcase" },
  { id: "external-parity-material-studio", globalName: "__A3D_TEMPLATE_MATERIAL_STUDIO__", workflowKind: "material-studio" },
  { id: "external-parity-asset-gallery", globalName: "__A3D_TEMPLATE_ASSET_GALLERY__", workflowKind: "asset-viewer" },
  { id: "external-parity-interactive-scene", globalName: "__A3D_TEMPLATE_INTERACTIVE_SCENE__", workflowKind: "interactive-scene" }
] as const;

test.describe("ExternalParity ExternalParity product viewer template", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders every ExternalParity template through the public root package API", async ({ page }) => {
    const errors = captureErrors(page);
    mkdirSync(join(process.cwd(), "tests/reports/external-gallery/templates"), { recursive: true });
    const captures = [];
    for (const template of templates) {
      await page.goto(`${server.origin}/templates/${template.id}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((globalName) => (window as unknown as Record<string, TemplateState | undefined>)[globalName]?.status === "ready", template.globalName, { timeout: 60_000 });
      const screenshotPath = `tests/reports/external-gallery/templates/${template.id}.png`;
      await page.locator("[data-testid='a3d-template-canvas']").screenshot({ path: screenshotPath });
      const state = await page.evaluate((globalName) => (window as unknown as Record<string, TemplateState | undefined>)[globalName], template.globalName);
      captures.push({ ...template, screenshotPath, state });
    }
    const report = {
      ok: errors.length === 0 &&
        captures.length === templates.length &&
        captures.every((capture) =>
          capture.state?.template === capture.id &&
          capture.state?.workflowKind === capture.workflowKind &&
          capture.state?.quality === "production" &&
          Array.isArray(capture.state?.environmentCapabilities) &&
          capture.state.environmentCapabilities.includes("specular prefilter mips") &&
          Number(capture.state?.drawCalls ?? 0) > 0 &&
          capture.state?.diagnosticsPanel?.render?.drawCalls === capture.state?.drawCalls &&
          typeof capture.state?.claimBoundary === "string"
        ),
      generatedAt: new Date().toISOString(),
      screenshots: captures.map((capture) => capture.screenshotPath),
      productBoundary: "Milestone 14 template proof uses public root imports for product, material, asset, and interactive starts. It does not close broad Three.js replacement.",
      errors,
      templates: captures
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
    __A3D_TEMPLATE_PRODUCT_VIEWER__?: TemplateState;
    __A3D_TEMPLATE_MATERIAL_STUDIO__?: TemplateState;
    __A3D_TEMPLATE_ASSET_GALLERY__?: TemplateState;
    __A3D_TEMPLATE_INTERACTIVE_SCENE__?: TemplateState;
  }
}

interface TemplateState {
      readonly status?: string;
      readonly template?: string;
      readonly workflowKind?: string;
      readonly quality?: string;
      readonly environmentTarget?: string;
      readonly environmentCapabilities?: readonly string[];
      readonly diagnosticsPanel?: { readonly render?: { readonly drawCalls?: number } };
      readonly drawCalls?: number;
      readonly claimBoundary?: string;
}
