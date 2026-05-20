import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/v4-product-configurator-browser.json";
const screenshotDir = "tests/reports/v4-gallery/product";

type ProductState = {
  readonly id?: string;
  readonly status?: string;
  readonly productId?: string;
  readonly sourceLicense?: string;
  readonly publicWorkflow?: boolean;
  readonly workflowKind?: string;
  readonly meshCount?: number;
  readonly materialCount?: number;
  readonly textureCount?: number;
  readonly drawCalls?: number;
  readonly materialMode?: string;
  readonly lighting?: string;
  readonly featureChecklist?: readonly string[];
  readonly externalSource?: string;
  readonly claimBoundary?: string;
};

test.describe("V4 flagship product configurator", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a real external product asset through the public product workflow and app", async ({ page }) => {
    const errors = captureErrors(page);
    mkdirSync(join(process.cwd(), screenshotDir), { recursive: true });

    await page.goto(`${server.origin}/examples/product-configurator-v4/index.html`, { waitUntil: "domcontentloaded" });
    const exampleState = await waitForProductState(page, "product-configurator-v4");
    await page.locator("[data-testid='hr4-product-canvas']").screenshot({ path: `${screenshotDir}/product-configurator-v4.png` });

    await page.getByTestId("hr4-product-material").selectOption("contrast");
    await expect.poll(() => productState(page).then((state) => state?.materialMode), { timeout: 30_000 }).toBe("contrast");
    await page.getByTestId("hr4-product-lighting").selectOption("hero-contrast");
    await expect.poll(() => productState(page), { timeout: 30_000 }).toMatchObject({
      status: "ready",
      materialMode: "contrast",
      lighting: "hero-contrast"
    });
    const variantState = await productState(page);
    if (!variantState) throw new Error("Missing product configurator variant state.");
    await page.locator("[data-testid='hr4-product-canvas']").screenshot({ path: `${screenshotDir}/product-configurator-v4-variant.png` });

    await page.goto(`${server.origin}/apps/product-studio-pro/index.html`, { waitUntil: "domcontentloaded" });
    const appState = await waitForProductState(page, "product-studio-pro");
    await page.locator("[data-testid='hr4-product-canvas']").screenshot({ path: `${screenshotDir}/product-studio-pro.png` });

    const report = {
      ok: errors.length === 0 &&
        statePasses(exampleState) &&
        statePasses(variantState) &&
        statePasses(appState) &&
        variantState.materialMode === "contrast" &&
        variantState.lighting === "hero-contrast",
      generatedAt: new Date().toISOString(),
      screenshots: [
        `${screenshotDir}/product-configurator-v4.png`,
        `${screenshotDir}/product-configurator-v4-variant.png`,
        `${screenshotDir}/product-studio-pro.png`
      ],
      productBoundary: "Milestone 7 proves a real product-configurator workflow and app using a pinned external Khronos asset. Full V4 release still requires installable SDK/templates and same-scene Three.js parity.",
      requiredNextProof: [
        "create-g3d installable product template",
        "packed-package external consumer proof",
        "same-scene Three.js rendered comparison",
        "full V4 release audit"
      ],
      errors,
      states: {
        example: exampleState,
        variant: variantState,
        app: appState
      }
    };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(statePasses(exampleState)).toBe(true);
    expect(statePasses(variantState)).toBe(true);
    expect(statePasses(appState)).toBe(true);
    expect(variantState.materialMode).toBe("contrast");
    expect(variantState.lighting).toBe("hero-contrast");
    expect(report.ok).toBe(true);
  });
});

async function waitForProductState(page: Page, id: string): Promise<ProductState> {
  await page.waitForFunction(
    (expectedId) => {
      const state = window.__G3D_V4_PRODUCT_CONFIGURATOR__ as ProductState | undefined;
      return state?.status === "ready" && state.id === expectedId;
    },
    id,
    { timeout: 90_000 }
  );
  const state = await productState(page);
  if (!state) throw new Error(`Missing product configurator state for ${id}.`);
  return state;
}

async function productState(page: Page): Promise<ProductState | undefined> {
  return page.evaluate(() => window.__G3D_V4_PRODUCT_CONFIGURATOR__ as ProductState | undefined);
}

function statePasses(state: ProductState): boolean {
  const checklist = state.featureChecklist ?? [];
  return state.status === "ready" &&
    state.productId === "premium-boom-box" &&
    state.sourceLicense === "CC0-1.0" &&
    state.publicWorkflow === true &&
    state.workflowKind === "product-configurator" &&
    Number(state.meshCount ?? 0) > 0 &&
    Number(state.materialCount ?? 0) > 0 &&
    Number(state.drawCalls ?? 0) > 0 &&
    checklist.includes("product-asset") &&
    checklist.includes("material-modes") &&
    checklist.includes("lighting-presets") &&
    checklist.includes("camera-presets") &&
    checklist.includes("export-ready") &&
    typeof state.externalSource === "string" &&
    state.externalSource.includes("KhronosGroup/glTF-Sample-Assets") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("V4 release still requires");
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

declare global {
  interface Window {
    __G3D_V4_PRODUCT_CONFIGURATOR__?: ProductState;
  }
}
