import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-interior-scene-browser.json";
const screenshotDir = "tests/reports/external-gallery/scenes";

type InteriorSceneState = {
  readonly id?: string;
  readonly status?: string;
  readonly renderer?: string;
  readonly productSurface?: string;
  readonly sceneFixture?: string;
  readonly sceneClass?: string;
  readonly renderItemCount?: number;
  readonly architecturalMaterialCount?: number;
  readonly materialCategories?: readonly string[];
  readonly texturedMaterialCount?: number;
  readonly lightingPreset?: string;
  readonly activeInteriorLightCount?: number;
  readonly shadowStrategy?: string;
  readonly shadowReceiverCount?: number;
  readonly spatialDepthMeters?: number;
  readonly drawCalls?: number;
  readonly pixelBucketCount?: number;
  readonly colorManagement?: string;
  readonly featureChecklist?: readonly string[];
  readonly claimBoundary?: string;
};

test.describe("V4 interior scene", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a multi-object interior scene in the example and Scene Studio Pro app", async ({ page }) => {
    const errors = captureErrors(page);
    mkdirSync(join(process.cwd(), screenshotDir), { recursive: true });

    await page.goto(`${server.origin}/examples/external-interior-scene/index.html`, { waitUntil: "domcontentloaded" });
    const exampleState = await waitForInteriorState(page, "external-interior-scene");
    await page.locator("[data-testid='hr4-scene-canvas']").screenshot({ path: `${screenshotDir}/external-interior-scene.png` });

    await page.getByTestId("hr4-scene-lighting").selectOption("night");
    await expect.poll(() => interiorState(page).then((state) => state?.lightingPreset), { timeout: 45_000 }).toBe("night");
    const nightState = await interiorState(page);
    if (!nightState) throw new Error("Missing night interior scene state.");
    await page.locator("[data-testid='hr4-scene-canvas']").screenshot({ path: `${screenshotDir}/external-interior-scene-night.png` });

    await page.goto(`${server.origin}/apps/scene-studio-pro/index.html`, { waitUntil: "domcontentloaded" });
    const appState = await waitForInteriorState(page, "scene-studio-pro");
    await page.locator("[data-testid='hr4-scene-canvas']").screenshot({ path: `${screenshotDir}/scene-studio-pro.png` });

    const report = {
      ok: errors.length === 0 &&
        statePasses(exampleState, "external-interior-scene") &&
        statePasses(nightState, "external-interior-scene") &&
        statePasses(appState, "scene-studio-pro") &&
        nightState.lightingPreset === "night",
      generatedAt: new Date().toISOString(),
      screenshots: [
        `${screenshotDir}/external-interior-scene.png`,
        `${screenshotDir}/external-interior-scene-night.png`,
        `${screenshotDir}/scene-studio-pro.png`
      ],
      productBoundary: "Milestone 9 proves a real multi-object interior/gallery scene and Scene Studio Pro app. Full V4 release still requires same-scene Three.js visual parity, scanned production materials, and package/template proof.",
      requiredNextProof: [
        "same interior scene rendered in Three.js",
        "visual diff against Three.js interior scene",
        "licensed/scanned production material assets",
        "full V4 release audit"
      ],
      errors,
      states: {
        example: exampleState,
        night: nightState,
        app: appState
      }
    };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(statePasses(exampleState, "external-interior-scene")).toBe(true);
    expect(statePasses(nightState, "external-interior-scene")).toBe(true);
    expect(statePasses(appState, "scene-studio-pro")).toBe(true);
    expect(nightState.lightingPreset).toBe("night");
    expect(report.ok).toBe(true);
  });
});

async function waitForInteriorState(page: Page, id: string): Promise<InteriorSceneState> {
  await page.waitForFunction(
    (expectedId) => {
      const state = window.__G3D_V4_INTERIOR_SCENE__ as InteriorSceneState | undefined;
      return state?.status === "ready" && state.id === expectedId;
    },
    id,
    { timeout: 90_000 }
  );
  const state = await interiorState(page);
  if (!state) throw new Error(`Missing interior scene state for ${id}.`);
  return state;
}

async function interiorState(page: Page): Promise<InteriorSceneState | undefined> {
  return page.evaluate(() => window.__G3D_V4_INTERIOR_SCENE__ as InteriorSceneState | undefined);
}

function statePasses(state: InteriorSceneState, id: string): boolean {
  const categories = state.materialCategories ?? [];
  const checklist = state.featureChecklist ?? [];
  return state.id === id &&
    state.status === "ready" &&
    state.renderer === "webgl2" &&
    state.productSurface === "scene-studio-pro" &&
    state.sceneFixture === "fixtures/v4/scenes/interior-gallery/manifest.json" &&
    state.sceneClass === "interior-gallery" &&
    Number(state.renderItemCount ?? 0) >= 28 &&
    Number(state.architecturalMaterialCount ?? 0) >= 30 &&
    categories.includes("wood") &&
    categories.includes("stone") &&
    categories.includes("metal") &&
    categories.includes("fabric") &&
    categories.includes("glass") &&
    categories.includes("ceramic") &&
    Number(state.texturedMaterialCount ?? 0) >= 10 &&
    Number(state.activeInteriorLightCount ?? 0) >= 8 &&
    state.shadowStrategy === "contact-shadow-receiver-geometry" &&
    Number(state.shadowReceiverCount ?? 0) >= 3 &&
    Number(state.spatialDepthMeters ?? 0) >= 6 &&
    Number(state.drawCalls ?? 0) >= 28 &&
    Number(state.pixelBucketCount ?? 0) >= 16 &&
    state.colorManagement === "linear-input-srgb-output" &&
    checklist.includes("multi-object-interior") &&
    checklist.includes("architectural-materials") &&
    checklist.includes("lighting-presets") &&
    checklist.includes("tone-mapping") &&
    checklist.includes("contact-shadow-receivers") &&
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
    __G3D_V4_INTERIOR_SCENE__?: InteriorSceneState;
  }
}
