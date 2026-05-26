import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-character-viewer-browser.json";
const screenshotDir = "tests/reports/external-gallery/characters";

type CharacterState = {
  readonly id?: string;
  readonly status?: string;
  readonly productSurface?: string;
  readonly fixture?: string;
  readonly characterId?: string;
  readonly sourceAsset?: string;
  readonly sourceRepository?: string;
  readonly sourceRevision?: string;
  readonly sourceLicense?: string;
  readonly licenseReviewRequired?: boolean;
  readonly clipCount?: number;
  readonly skeletonJointCount?: number;
  readonly skinnedMeshCount?: number;
  readonly timelineScrub?: boolean;
  readonly playPause?: boolean;
  readonly playing?: boolean;
  readonly normalizedTime?: number;
  readonly featureChecklist?: readonly string[];
  readonly claimBoundary?: string;
};

test.describe("V4 character viewer", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders character timeline controls in the example and Animation Studio Pro app", async ({ page }) => {
    const errors = captureErrors(page);
    mkdirSync(join(process.cwd(), screenshotDir), { recursive: true });

    await page.goto(`${server.origin}/examples/external-character-viewer/index.html`, { waitUntil: "domcontentloaded" });
    const exampleState = await waitForCharacterState(page, "external-character-viewer");
    await page.locator("[data-testid='hr4-character-canvas']").screenshot({ path: `${screenshotDir}/external-character-viewer.png` });

    await page.getByTestId("hr4-character-timeline").fill("72");
    await expect.poll(() => characterState(page).then((state) => Math.round((state?.normalizedTime ?? 0) * 100)), { timeout: 30_000 }).toBe(72);
    await page.getByTestId("hr4-character-play").click();
    await expect.poll(() => characterState(page).then((state) => state?.playing), { timeout: 30_000 }).toBe(false);
    const scrubState = await characterState(page);
    if (!scrubState) throw new Error("Missing scrubbed character state.");
    await page.locator("[data-testid='hr4-character-canvas']").screenshot({ path: `${screenshotDir}/external-character-viewer-scrubbed.png` });

    await page.goto(`${server.origin}/apps/animation-studio-pro/index.html`, { waitUntil: "domcontentloaded" });
    const appState = await waitForCharacterState(page, "animation-studio-pro");
    await page.locator("[data-testid='hr4-character-canvas']").screenshot({ path: `${screenshotDir}/animation-studio-pro.png` });

    const report = {
      ok: errors.length === 0 && statePasses(exampleState, "external-character-viewer") && statePasses(scrubState, "external-character-viewer") && statePasses(appState, "animation-studio-pro") && scrubState.playing === false,
      generatedAt: new Date().toISOString(),
      screenshots: [`${screenshotDir}/external-character-viewer.png`, `${screenshotDir}/external-character-viewer-scrubbed.png`, `${screenshotDir}/animation-studio-pro.png`],
      productBoundary: "Milestone 11 proves Character Viewer V4 and Animation Studio Pro timeline state. Full V4 release still requires real skinned glTF rendered animation parity against Three.js and license review.",
      requiredNextProof: ["real skinned glTF character render", "same character animation in Three.js", "visual diff for animation poses", "license review"],
      errors,
      states: { example: exampleState, scrubbed: scrubState, app: appState }
    };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(statePasses(exampleState, "external-character-viewer")).toBe(true);
    expect(statePasses(scrubState, "external-character-viewer")).toBe(true);
    expect(statePasses(appState, "animation-studio-pro")).toBe(true);
    expect(scrubState.playing).toBe(false);
  });
});

async function waitForCharacterState(page: Page, id: string): Promise<CharacterState> {
  await page.waitForFunction((expectedId) => {
    const state = window.__A3D_V4_CHARACTER_VIEWER__ as CharacterState | undefined;
    return state?.status === "ready" && state.id === expectedId;
  }, id, { timeout: 60_000 });
  const state = await characterState(page);
  if (!state) throw new Error(`Missing character state for ${id}.`);
  return state;
}

async function characterState(page: Page): Promise<CharacterState | undefined> {
  return page.evaluate(() => window.__A3D_V4_CHARACTER_VIEWER__ as CharacterState | undefined);
}

function statePasses(state: CharacterState, id: string): boolean {
  const checklist = state.featureChecklist ?? [];
  return state.id === id &&
    state.status === "ready" &&
    state.productSurface === "animation-studio-pro" &&
    state.fixture === "fixtures/external-parity/characters/animated-character/manifest.json" &&
    state.characterId === "animated-character-cesium-man" &&
    state.sourceAsset === "cesium-man" &&
    state.sourceRevision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    state.licenseReviewRequired === true &&
    Number(state.clipCount ?? 0) >= 1 &&
    Number(state.skeletonJointCount ?? 0) >= 10 &&
    Number(state.skinnedMeshCount ?? 0) >= 1 &&
    state.timelineScrub === true &&
    state.playPause === true &&
    checklist.includes("character-fixture") &&
    checklist.includes("timeline-scrub") &&
    checklist.includes("clip-diagnostics") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("Three.js");
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

declare global {
  interface Window {
    __A3D_V4_CHARACTER_VIEWER__?: CharacterState;
  }
}
