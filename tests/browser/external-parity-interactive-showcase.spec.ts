import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-interactive-showcase-browser.json";
const screenshotDir = "tests/reports/external-gallery/interactive";

type InteractiveState = {
  readonly id?: string; readonly status?: string; readonly productSurface?: string; readonly cameraControls?: boolean; readonly selectionInteraction?: boolean; readonly variantInteraction?: boolean; readonly selectedObject?: string; readonly cameraOrbitDegrees?: number; readonly variant?: string; readonly interactions?: number; readonly objectCount?: number; readonly featureChecklist?: readonly string[]; readonly claimBoundary?: string;
};

test.describe("V4 interactive showcase", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("supports camera, selection, and variant interaction in example and app", async ({ page }) => {
    const errors = captureErrors(page);
    mkdirSync(join(process.cwd(), screenshotDir), { recursive: true });
    await page.goto(`${server.origin}/examples/external-interactive-showcase/index.html`, { waitUntil: "domcontentloaded" });
    const example = await waitForState(page, "external-interactive-showcase");
    await page.locator("[data-testid='hr4-interactive-canvas']").screenshot({ path: `${screenshotDir}/external-interactive-showcase.png` });
    await page.getByTestId("hr4-interactive-camera").fill("42");
    await page.getByTestId("hr4-interactive-variant").selectOption("emissive");
    await page.getByTestId("hr4-interactive-select").click();
    await expect.poll(() => state(page).then((value) => value?.selectedObject), { timeout: 30_000 }).toBe("center-product");
    const interacted = await state(page);
    if (!interacted) throw new Error("Missing interacted state.");
    await page.locator("[data-testid='hr4-interactive-canvas']").screenshot({ path: `${screenshotDir}/external-interactive-showcase-interacted.png` });
    await page.goto(`${server.origin}/apps/interactive-showcase-pro/index.html`, { waitUntil: "domcontentloaded" });
    const app = await waitForState(page, "interactive-showcase-pro");
    await page.locator("[data-testid='hr4-interactive-canvas']").screenshot({ path: `${screenshotDir}/interactive-showcase-pro.png` });
    const report = { ok: errors.length === 0 && passes(example, "external-interactive-showcase") && passes(interacted, "external-interactive-showcase") && passes(app, "interactive-showcase-pro") && interacted.variant === "emissive" && interacted.cameraOrbitDegrees === 42, generatedAt: new Date().toISOString(), screenshots: [`${screenshotDir}/external-interactive-showcase.png`, `${screenshotDir}/external-interactive-showcase-interacted.png`, `${screenshotDir}/interactive-showcase-pro.png`], productBoundary: "Milestone 12 proves interaction product state. Full V4 release still requires production 3D interaction parity, packaged API proof, and same-scene Three.js comparison.", errors, states: { example, interacted, app } };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);
    expect(report.ok).toBe(true);
  });
});

async function waitForState(page: Page, id: string): Promise<InteractiveState> {
  await page.waitForFunction((expectedId) => {
    const state = window.__A3D_V4_INTERACTIVE_SHOWCASE__ as InteractiveState | undefined;
    return state?.status === "ready" && state.id === expectedId;
  }, id, { timeout: 60_000 });
  const current = await state(page);
  if (!current) throw new Error(`Missing interactive state for ${id}.`);
  return current;
}
async function state(page: Page): Promise<InteractiveState | undefined> {
  return page.evaluate(() => window.__A3D_V4_INTERACTIVE_SHOWCASE__ as InteractiveState | undefined);
}
function passes(value: InteractiveState, id: string): boolean {
  const checklist = value.featureChecklist ?? [];
  return value.id === id && value.status === "ready" && value.productSurface === "interactive-showcase-pro" && value.cameraControls === true && value.selectionInteraction === true && value.variantInteraction === true && Number(value.objectCount ?? 0) >= 5 && checklist.includes("camera-controls") && checklist.includes("selection") && checklist.includes("material-variants") && typeof value.claimBoundary === "string" && value.claimBoundary.includes("Three.js");
}
function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}
declare global { interface Window { __A3D_V4_INTERACTIVE_SHOWCASE__?: InteractiveState; } }
