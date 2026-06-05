import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type GameDemoMetricValue = number | string | boolean;
type GameDemoWindow = Window & {
  __AURA3D_GAME_DEMO__?: {
    readonly status?: string;
    readonly metrics?: Record<string, GameDemoMetricValue>;
  };
  __AURA3D_TEST_GAMEPADS__?: unknown;
};

const typedGlbRuntimeNodeMutationDeclaration = {
  proofId: "typedGlbRuntimeNodeMutation",
  route: "/examples/game-slice/index.html",
  typedAssetApiPattern:
    "import { assets } from \"./src/aura-assets\"; model(assets.fighter).runtime(game.runtimeNode(\"player\", { tags: [\"fighter\", \"runtime-mutable\"] }))",
  requiredSourceAssertions: [
    "typed assets from ./src/aura-assets",
    "model(assets.fighter)",
    "game.runtimeNode(\"player\")",
    "app.nodes.require(\"player\")",
    "playerX changes without createAuraApp route recreation"
  ],
  requiredEvidenceArtifacts: [
    "screenshot.path",
    "screenshot.sha256",
    "screenshot.width",
    "screenshot.height",
    "metrics.playerX.before",
    "metrics.playerX.after",
    "runtime.nodeId"
  ]
} as const;

test.describe("game runtime mutability", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("mutates the runtime player through frame-loop input without recreating the route", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await waitForGameReady(page);
    await page.locator("[data-testid='game-slice-canvas']").focus();

    const before = await metrics(page);
    await setTestGamepad(page, 0.85, false);
    await page.waitForFunction(
      (startX) => Number((window as GameDemoWindow).__AURA3D_GAME_DEMO__?.metrics?.playerX ?? -999) > Number(startX) + 0.25,
      before.playerX,
      { timeout: 12_000 }
    );
    await setTestGamepad(page, 0, false);
    const after = await metrics(page);
    const mutationDelta = Number(after.playerX) - Number(before.playerX);

    expect(errors).toEqual([]);
    expect(after.characterController).toBe(true);
    expect(after.cameraFollowEnabled).toBe(true);
    expect(mutationDelta).toBeGreaterThan(0);
    expect(Number(after.characterControllerBodyId)).toBeGreaterThan(0);
    expect(Number(after.characterControllerColliderId)).toBeGreaterThan(0);
    expect(Number(after.cameraFollowUpdates)).toBeGreaterThan(0);
    expect(typedGlbRuntimeNodeMutationDeclaration.proofId).toBe("typedGlbRuntimeNodeMutation");
    expect(typedGlbRuntimeNodeMutationDeclaration.typedAssetApiPattern).toContain("model(assets.fighter)");
    expect(typedGlbRuntimeNodeMutationDeclaration.typedAssetApiPattern).toContain("game.runtimeNode");
    expect(typedGlbRuntimeNodeMutationDeclaration.requiredSourceAssertions).toEqual(
      expect.arrayContaining([
        "typed assets from ./src/aura-assets",
        "app.nodes.require(\"player\")",
        "playerX changes without createAuraApp route recreation"
      ])
    );
    await expect(page.locator("[data-testid='game-slice-canvas']")).toBeVisible();
    await writeGameRuntimeBrowserProof(page, "tests/reports/game-runtime/typed-glb-runtime-node-mutation-evidence.json", {
      proofIds: ["typedGlbRuntimeNodeMutation"],
      route: typedGlbRuntimeNodeMutationDeclaration.route,
      declaration: typedGlbRuntimeNodeMutationDeclaration,
      metrics: {
        before,
        after,
        mutationDelta
      },
      runtime: {
        nodeId: "player",
        assetName: "fighter"
      }
    });
  });
});

async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as GameDemoWindow).__AURA3D_GAME_DEMO__?.status === "ready",
    undefined,
    { timeout: 45_000 }
  );
}

async function metrics(page: Page): Promise<Record<string, GameDemoMetricValue>> {
  return page.evaluate(() => (window as GameDemoWindow).__AURA3D_GAME_DEMO__?.metrics ?? {});
}

async function setTestGamepad(page: Page, axisX: number, jump: boolean): Promise<void> {
  await page.evaluate(({ axisX, jump }) => {
    (window as GameDemoWindow).__AURA3D_TEST_GAMEPADS__ = [{
      id: "game-runtime-mutability-gamepad",
      index: 0,
      connected: true,
      axes: [axisX, 0],
      buttons: [{ pressed: jump, value: jump ? 1 : 0 }]
    }];
  }, { axisX, jump });
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function writeGameRuntimeBrowserProof(
  page: Page,
  reportPath: string,
  payload: Record<string, unknown>
): Promise<void> {
  const absoluteReportPath = resolve(reportPath);
  const screenshotPath = reportPath.replace(/\.json$/, ".png");
  const absoluteScreenshotPath = resolve(screenshotPath);
  mkdirSync(dirname(absoluteReportPath), { recursive: true });
  await page.screenshot({ path: absoluteScreenshotPath, fullPage: true });
  const screenshotBytes = readFileSync(absoluteScreenshotPath);
  const viewport = page.viewportSize();
  const report = {
    kind: "aura3d-game-runtime-browser-proof",
    ok: true,
    generatedAt: new Date().toISOString(),
    ...payload,
    screenshot: {
      path: screenshotPath,
      sha256: `sha256:${createHash("sha256").update(screenshotBytes).digest("hex")}`,
      width: viewport?.width ?? 0,
      height: viewport?.height ?? 0
    }
  };
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
