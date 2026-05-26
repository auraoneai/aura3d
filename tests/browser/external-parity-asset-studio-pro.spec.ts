import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-asset-studio-pro-browser.json";
const screenshotDir = "tests/reports/external-gallery/assets";

type AssetStudioState = {
  readonly id?: string;
  readonly status?: string;
  readonly productSurface?: string;
  readonly corpusManifest?: string;
  readonly sourceRepository?: string;
  readonly sourceRevision?: string;
  readonly assetCount?: number;
  readonly visualEvidenceSlots?: number;
  readonly advancedMaterialAssets?: number;
  readonly animationSkinMorphAssets?: number;
  readonly licenseReviewRequired?: number;
  readonly featureCoverage?: readonly string[];
  readonly selectedAsset?: { readonly id?: string; readonly features?: readonly string[]; readonly license?: string; readonly provenance?: string; readonly renderStatus?: string };
  readonly corpusBrowserUi?: boolean;
  readonly diagnosticsUi?: boolean;
  readonly releaseProofComplete?: boolean;
  readonly featureChecklist?: readonly string[];
  readonly claimBoundary?: string;
};

test.describe("Asset Studio Pro", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders the corpus browser and asset diagnostics in the example and app", async ({ page }) => {
    const errors = captureErrors(page);
    mkdirSync(join(process.cwd(), screenshotDir), { recursive: true });

    await page.goto(`${server.origin}/examples/external-asset-gallery/index.html`, { waitUntil: "domcontentloaded" });
    const exampleState = await waitForAssetState(page, "external-asset-gallery");
    await page.locator("[data-testid='hr4-asset-canvas']").screenshot({ path: `${screenshotDir}/external-asset-gallery.png` });

    await page.getByTestId("hr4-asset-select").selectOption("cesium-man");
    await expect.poll(() => assetState(page).then((state) => state?.selectedAsset?.id), { timeout: 30_000 }).toBe("cesium-man");
    const selectedState = await assetState(page);
    if (!selectedState) throw new Error("Missing selected asset state.");
    await page.locator("[data-testid='hr4-asset-canvas']").screenshot({ path: `${screenshotDir}/external-asset-gallery-cesium-man.png` });

    await page.goto(`${server.origin}/apps/asset-studio-pro/index.html`, { waitUntil: "domcontentloaded" });
    const appState = await waitForAssetState(page, "asset-studio-pro");
    await page.locator("[data-testid='hr4-asset-canvas']").screenshot({ path: `${screenshotDir}/asset-studio-pro.png` });

    const report = {
      ok: errors.length === 0 &&
        statePasses(exampleState, "external-asset-gallery") &&
        statePasses(selectedState, "external-asset-gallery") &&
        statePasses(appState, "asset-studio-pro") &&
        selectedState.selectedAsset?.id === "cesium-man",
      generatedAt: new Date().toISOString(),
      screenshots: [
        `${screenshotDir}/external-asset-gallery.png`,
        `${screenshotDir}/external-asset-gallery-cesium-man.png`,
        `${screenshotDir}/asset-studio-pro.png`
      ],
      productBoundary: "Asset Studio Pro proves corpus browsing and diagnostics UI. Full release still requires actual rendered screenshots for selected assets and same-scene Three.js parity.",
      requiredNextProof: [
        "render selected corpus assets as WebGL screenshots",
        "same assets rendered in Three.js",
        "visual diffs for selected corpus assets",
        "full ExternalParity release audit"
      ],
      errors,
      states: { example: exampleState, selected: selectedState, app: appState }
    };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(statePasses(exampleState, "external-asset-gallery")).toBe(true);
    expect(statePasses(selectedState, "external-asset-gallery")).toBe(true);
    expect(statePasses(appState, "asset-studio-pro")).toBe(true);
    expect(selectedState.selectedAsset?.id).toBe("cesium-man");
    expect(report.ok).toBe(true);
  });
});

async function waitForAssetState(page: Page, id: string): Promise<AssetStudioState> {
  await page.waitForFunction((expectedId) => {
    const state = window.__AURA3D_ASSET_STUDIO__ as AssetStudioState | undefined;
    return state?.status === "ready" && state.id === expectedId;
  }, id, { timeout: 60_000 });
  const state = await assetState(page);
  if (!state) throw new Error(`Missing asset studio state for ${id}.`);
  return state;
}

async function assetState(page: Page): Promise<AssetStudioState | undefined> {
  return page.evaluate(() => window.__AURA3D_ASSET_STUDIO__ as AssetStudioState | undefined);
}

function statePasses(state: AssetStudioState, id: string): boolean {
  const features = state.featureCoverage ?? [];
  const checklist = state.featureChecklist ?? [];
  return state.id === id &&
    state.status === "ready" &&
    state.productSurface === "asset-studio-pro" &&
    state.corpusManifest === "/tests/assets/corpus/gltf-corpus.manifest.json" &&
    typeof state.sourceRepository === "string" &&
    state.sourceRepository.includes("KhronosGroup/glTF-Sample-Assets") &&
    state.sourceRevision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    Number(state.assetCount ?? 0) >= 25 &&
    Number(state.visualEvidenceSlots ?? 0) >= 12 &&
    Number(state.advancedMaterialAssets ?? 0) >= 5 &&
    Number(state.animationSkinMorphAssets ?? 0) >= 2 &&
    Number(state.licenseReviewRequired ?? 0) >= 1 &&
    features.includes("pbr") &&
    features.includes("texture") &&
    features.includes("extension") &&
    features.includes("animation") &&
    state.corpusBrowserUi === true &&
    state.diagnosticsUi === true &&
    state.releaseProofComplete === false &&
    typeof state.selectedAsset?.license === "string" &&
    typeof state.selectedAsset?.provenance === "string" &&
    state.selectedAsset?.renderStatus === "queued-for-threejs-parity" &&
    checklist.includes("corpus-browser") &&
    checklist.includes("asset-diagnostics") &&
    checklist.includes("license-provenance") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("same-scene Three.js parity");
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
    __AURA3D_ASSET_STUDIO__?: AssetStudioState;
  }
}
