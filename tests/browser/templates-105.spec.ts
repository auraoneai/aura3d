import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve(process.cwd(), "tests/reports/templates");

type TemplateSmokeReport = {
  readonly ok: true;
  readonly status: "pass";
  readonly schema: "aura3d105-template-smoke";
  readonly generatedAt: string;
  readonly template: "fighting-game" | "cartoon-channel" | "prompt-cartoon-channel";
  readonly route: string;
  readonly screenshot: string;
  readonly evidence: unknown;
};

test.describe("Aura3D 1.0.5 starter template smoke evidence", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("fighting-game starter renders runtime replay, input, physics, collisions, animation, and camera evidence", async ({ page }) => {
    await mkdir(reportDir, { recursive: true });
    const errors = capturePageErrors(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/tests/browser/templates-105-harness.html?template=fighting-game`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_GAME_SOURCE__?.readiness), undefined, {
      timeout: 60_000
    });
    await page.click("#hud-replay-button");
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_GAME_EVIDENCE__?.systems?.inputPlan), undefined, {
      timeout: 20_000
    });
    await page.waitForFunction(() => ((window as any).__AURA3D_GAME_REPLAY__?.hitCount ?? 0) > 0, undefined, {
      timeout: 20_000
    });

    const evidence = await page.evaluate(() => {
      const source = (window as any).__AURA3D_GAME_SOURCE__;
      const runtimeEvidence = (window as any).__AURA3D_GAME_EVIDENCE__;
      const replay = (window as any).__AURA3D_GAME_REPLAY__;
      return {
        source,
        replay: {
          hitCount: replay?.hitCount,
          totalHitCount: replay?.totalHitCount,
          checksum: replay?.plan?.checksum
        },
        systems: runtimeEvidence?.systems,
        assets: runtimeEvidence?.assets,
        stage: runtimeEvidence?.stage,
        camera: runtimeEvidence?.camera
      };
    });

    expect(errors).toEqual([]);
    expect((evidence as any).source?.template).toBe("fighting-game");
    expect((evidence as any).source?.readiness?.sourceOnly).toBe(true);
    expect((evidence as any).source?.readiness?.publicEngineApis).toEqual(
      expect.arrayContaining(["games.fighting.stagePreset", "game.runtimeNode", "game.kinematicBody"])
    );
    expect((evidence as any).replay?.hitCount).toBeGreaterThan(0);
    expect((evidence as any).systems?.inputPlan).toBeTruthy();
    expect((evidence as any).systems?.physicsPlan).toBeTruthy();
    expect((evidence as any).systems?.collisionPlan).toBeTruthy();
    expect((evidence as any).systems?.animationPlan).toBeTruthy();
    expect((evidence as any).systems?.cameraPlan).toBeTruthy();

    const screenshot = "tests/reports/templates/fighting-game-first-frame.png";
    await page.screenshot({ path: resolve(process.cwd(), screenshot), fullPage: false });
    await writeTemplateReport("fighting-game-smoke.json", {
      ok: true,
      status: "pass",
      schema: "aura3d105-template-smoke",
      generatedAt: new Date().toISOString(),
      template: "fighting-game",
      route: "/tests/browser/templates-105-harness.html?template=fighting-game",
      screenshot,
      evidence
    });
  });

  for (const template of ["cartoon-channel", "prompt-cartoon-channel"] as const) {
    test(`${template} starter renders sourced storyboard, captions, shot playback, and prompt evidence`, async ({ page }) => {
      await mkdir(reportDir, { recursive: true });
      const errors = capturePageErrors(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}/tests/browser/templates-105-harness.html?template=${template}`, {
        waitUntil: "domcontentloaded"
      });
      await page.waitForFunction(() => Boolean((window as any).__AURA3D_CARTOON_TEMPLATE__), undefined, {
        timeout: 60_000
      });
      await page.waitForFunction(() => document.body.dataset.cartoonShotCount === "3", undefined, {
        timeout: 10_000
      });

      const evidence = await page.evaluate(() => {
        const templateEvidence = (window as any).__AURA3D_CARTOON_TEMPLATE__;
        return {
          contractId: templateEvidence?.contractId,
          template: templateEvidence?.template,
          shotIds: templateEvidence?.shotIds ?? [],
          captionIds: templateEvidence?.captionIds ?? [],
          playbackProbeSamples: templateEvidence?.playbackProbeSamples ?? [],
          sampleAt: [1, 21, 43].map((time) => templateEvidence?.sampleAt(time)),
          renderQueueItems: templateEvidence?.renderQueueItems,
          typedAssets: templateEvidence?.typedAssets,
          requiredTypedAssets: templateEvidence?.requiredTypedAssets,
          missingTypedAssets: templateEvidence?.missingTypedAssets,
          assetCommands: templateEvidence?.assetCommands,
          publishReadiness: templateEvidence?.publishReadiness,
          sourceProofs: templateEvidence?.sourceProofs,
          bodyShotCount: document.body.dataset.cartoonShotCount,
          bodyCaptionCount: document.body.dataset.cartoonCaptionCount,
          captionText: document.querySelector("#caption-overlay")?.textContent
        };
      });

      expect(errors).toEqual([]);
      expect((evidence as any).template).toBe(template);
      expect((evidence as any).shotIds).toEqual([
        "shot-moon-garden-open",
        "shot-glow-stone-teamwork",
        "shot-moon-garden-finish"
      ]);
      expect((evidence as any).captionIds).toHaveLength(6);
      expect((evidence as any).playbackProbeSamples).toHaveLength(3);
      expect((evidence as any).sampleAt.every((sample: { readonly captionText?: string }) => Boolean(sample?.captionText))).toBe(true);
      expect((evidence as any).bodyShotCount).toBe("3");
      expect((evidence as any).bodyCaptionCount).toBe("6");
      expect(String((evidence as any).captionText)).toMatch(/moon|robot|garden|glow/i);

      const screenshot = `tests/reports/templates/${template}-first-frame.png`;
      await page.screenshot({ path: resolve(process.cwd(), screenshot), fullPage: false });
      await writeTemplateReport(`${template}-smoke.json`, {
        ok: true,
        status: "pass",
        schema: "aura3d105-template-smoke",
        generatedAt: new Date().toISOString(),
        template,
        route: `/tests/browser/templates-105-harness.html?template=${template}`,
        screenshot,
        evidence
      });
    });
  }
});

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function writeTemplateReport(fileName: string, report: TemplateSmokeReport): Promise<void> {
  await writeFile(resolve(reportDir, fileName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
