import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-material-studio-pro-browser.json";
const screenshotDir = "tests/reports/external-gallery/materials";

type MaterialStudioState = {
  readonly id?: string;
  readonly status?: string;
  readonly renderer?: string;
  readonly productSurface?: string;
  readonly materialLibrary?: string;
  readonly textureDirectory?: string;
  readonly materialIds?: readonly string[];
  readonly materialCount?: number;
  readonly reflectanceClasses?: readonly string[];
  readonly boundedDiagnostics?: readonly string[];
  readonly environmentPreset?: string;
  readonly hdrIbl?: boolean;
  readonly colorManagement?: string;
  readonly drawCalls?: number;
  readonly textureCount?: number;
  readonly pixelBucketCount?: number;
  readonly featureChecklist?: readonly string[];
  readonly claimBoundary?: string;
};

test.describe("V4 Material Studio Pro", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a product-grade physical material matrix in the example and app", async ({ page }) => {
    const errors = captureErrors(page);
    mkdirSync(join(process.cwd(), screenshotDir), { recursive: true });

    await page.goto(`${server.origin}/examples/external-material-studio/index.html`, { waitUntil: "domcontentloaded" });
    const exampleState = await waitForMaterialState(page, "external-material-studio");
    await page.locator("[data-testid='hr4-material-canvas']").screenshot({ path: `${screenshotDir}/external-material-studio.png` });

    await page.getByTestId("hr4-material-environment").selectOption("outdoorDay");
    await expect.poll(() => materialState(page).then((state) => state?.environmentPreset), { timeout: 30_000 }).toBe("outdoorDay");
    const outdoorState = await materialState(page);
    if (!outdoorState) throw new Error("Missing outdoor material studio state.");
    await page.locator("[data-testid='hr4-material-canvas']").screenshot({ path: `${screenshotDir}/external-material-studio-outdoor.png` });

    await page.goto(`${server.origin}/apps/material-studio-pro/index.html`, { waitUntil: "domcontentloaded" });
    const appState = await waitForMaterialState(page, "material-studio-pro");
    await page.locator("[data-testid='hr4-material-canvas']").screenshot({ path: `${screenshotDir}/material-studio-pro.png` });

    const report = {
      ok: errors.length === 0 &&
        statePasses(exampleState, "external-material-studio") &&
        statePasses(outdoorState, "external-material-studio") &&
        statePasses(appState, "material-studio-pro") &&
        outdoorState.environmentPreset === "outdoorDay",
      generatedAt: new Date().toISOString(),
      screenshots: [
        `${screenshotDir}/external-material-studio.png`,
        `${screenshotDir}/external-material-studio-outdoor.png`,
        `${screenshotDir}/material-studio-pro.png`
      ],
      productBoundary: "Milestone 8 proves a real Material Studio Pro app/example with the V4 12-material matrix. Full V4 release still requires licensed production textures and same-scene Three.js visual parity.",
      requiredNextProof: [
        "same material matrix rendered in Three.js",
        "licensed production texture set",
        "visual diff against Three.js material matrix",
        "full V4 release audit"
      ],
      errors,
      states: {
        example: exampleState,
        outdoor: outdoorState,
        app: appState
      }
    };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(statePasses(exampleState, "external-material-studio")).toBe(true);
    expect(statePasses(outdoorState, "external-material-studio")).toBe(true);
    expect(statePasses(appState, "material-studio-pro")).toBe(true);
    expect(outdoorState.environmentPreset).toBe("outdoorDay");
    expect(report.ok).toBe(true);
  });
});

async function waitForMaterialState(page: Page, id: string): Promise<MaterialStudioState> {
  await page.waitForFunction(
    (expectedId) => {
      const state = window.__A3D_V4_MATERIAL_STUDIO__ as MaterialStudioState | undefined;
      return state?.status === "ready" && state.id === expectedId;
    },
    id,
    { timeout: 60_000 }
  );
  const state = await materialState(page);
  if (!state) throw new Error(`Missing material studio state for ${id}.`);
  return state;
}

async function materialState(page: Page): Promise<MaterialStudioState | undefined> {
  return page.evaluate(() => window.__A3D_V4_MATERIAL_STUDIO__ as MaterialStudioState | undefined);
}

function statePasses(state: MaterialStudioState, id: string): boolean {
  const materialIds = state.materialIds ?? [];
  const checklist = state.featureChecklist ?? [];
  const bounded = state.boundedDiagnostics ?? [];
  const reflectance = new Set(state.reflectanceClasses ?? []);
  return state.id === id &&
    state.status === "ready" &&
    state.renderer === "webgl2" &&
    state.productSurface === "material-studio-pro" &&
    state.materialLibrary === "fixtures/external-parity/materials/material-library.json" &&
    state.textureDirectory === "fixtures/external-parity/materials/textures" &&
    state.materialCount === 12 &&
    materialIds.includes("chrome") &&
    materialIds.includes("glass-transmission") &&
    materialIds.includes("clearcoat-car-paint") &&
    materialIds.includes("fabric-sheen") &&
    materialIds.includes("textured-ceramic-stone") &&
    reflectance.has("mirror-metal") &&
    reflectance.has("rough-metal") &&
    reflectance.has("dielectric") &&
    reflectance.has("transparent") &&
    reflectance.has("emissive") &&
    bounded.includes("clearcoat") &&
    bounded.includes("transmission") &&
    bounded.includes("sheen") &&
    state.hdrIbl === true &&
    state.colorManagement === "linear-input-srgb-output" &&
    Number(state.drawCalls ?? 0) >= 12 &&
    Number(state.textureCount ?? 0) >= 6 &&
    Number(state.pixelBucketCount ?? 0) >= 8 &&
    checklist.includes("12-material-matrix") &&
    checklist.includes("hdr-ibl") &&
    checklist.includes("texture-backed-materials") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("same-scene Three.js visual parity");
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
    __A3D_V4_MATERIAL_STUDIO__?: MaterialStudioState;
  }
}
