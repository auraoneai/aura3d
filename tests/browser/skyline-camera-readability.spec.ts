import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { analyzePngDifferenceBounds, type PngCrop } from "./showcase-visual-quality";

const REPORT_DIR = resolve("tests/reports/skyline-camera-readability");
const ROUTE = "/apps/showcase-skyline-runner/";
const GLOBAL = "__AURA3D_SHOWCASE_SKYLINE_RUNNER__";

interface CameraReadabilityEvidence {
  readonly viewport: "desktop" | "compact";
  readonly mode: string;
  readonly targetNode: string;
  readonly verticalFollowTarget: boolean;
  readonly activeFrame: {
    readonly facing: -1 | 1;
    readonly leadDirection: "left" | "right";
    readonly leadMatchesFacing: boolean;
    readonly offset: readonly [number, number, number];
    readonly targetOffset: readonly [number, number, number];
  };
  readonly observedFacingDirections: readonly string[];
  readonly bothFacingDirectionsObserved: boolean;
  readonly airborneFramingObserved: boolean;
  readonly decorativeDepthContract: {
    readonly actorDepth: number;
    readonly nearestBackgroundDressingDepth: number;
    readonly allBackgroundDressingBehindActor: boolean;
    readonly renderedForegroundPropCount: number;
  };
  readonly playableEdgeContract: {
    readonly certifiedSurfaceCount: number;
    readonly foliagePlacementCount: number;
    readonly minimumFoliageEdgeClearance: number;
    readonly foliageClearsEveryLandingEdge: boolean;
  };
}

interface SkylineMountedEvidence {
  readonly status: string;
  readonly player: { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly grounded: boolean };
  readonly cameraReadability: CameraReadabilityEvidence;
}

async function readEvidence(page: Page): Promise<SkylineMountedEvidence> {
  return page.evaluate((name) =>
    (window as unknown as Record<string, SkylineMountedEvidence>)[name]!, GLOBAL);
}

async function hold(page: Page, key: string, milliseconds: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
}

test.describe("Skyline camera and playable-edge readability", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(REPORT_DIR, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  for (const scenario of [
    { id: "desktop", width: 1440, height: 900, expectedViewport: "desktop" },
    { id: "compact", width: 390, height: 844, expectedViewport: "compact" }
  ] as const) {
    test(`${scenario.id}: facing lead, airborne framing, and edge clearance are mounted and visible`, async ({ page }) => {
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      const browserErrors: string[] = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });

      await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((name) => {
        const evidence = (window as unknown as Record<string, SkylineMountedEvidence>)[name];
        return Boolean(evidence?.status && evidence.cameraReadability);
      }, GLOBAL, { timeout: 30_000 });

      const initial = await readEvidence(page);
      expect(initial.cameraReadability.viewport).toBe(scenario.expectedViewport);
      expect(initial.cameraReadability.mode).toBe("follow");
      expect(initial.cameraReadability.targetNode).toBe("platformer-player");
      expect(initial.cameraReadability.verticalFollowTarget).toBe(true);
      expect(initial.cameraReadability.decorativeDepthContract.allBackgroundDressingBehindActor).toBe(true);
      expect(initial.cameraReadability.decorativeDepthContract.nearestBackgroundDressingDepth)
        .toBeLessThan(initial.cameraReadability.decorativeDepthContract.actorDepth);
      expect(initial.cameraReadability.decorativeDepthContract.renderedForegroundPropCount).toBe(0);
      expect(initial.cameraReadability.playableEdgeContract.certifiedSurfaceCount).toBe(111);
      expect(initial.cameraReadability.playableEdgeContract.foliagePlacementCount).toBeGreaterThan(0);
      expect(initial.cameraReadability.playableEdgeContract.minimumFoliageEdgeClearance).toBeGreaterThan(0);
      expect(initial.cameraReadability.playableEdgeContract.foliageClearsEveryLandingEdge).toBe(true);

      // The facing holds below need live input, but the route's input goes
      // live only after boot finishes main-thread mounting (a multi-10s stall
      // on loaded machines; proven on the pristine base). Wait for a genuine
      // velocity response first; no assertion is weakened.
      await page.keyboard.down("ArrowRight");
      await page.waitForFunction((name) => {
        const evidence = (window as unknown as Record<string, SkylineMountedEvidence>)[name];
        return Math.abs(evidence?.player?.vx ?? 0) > 0.1;
      }, GLOBAL, { timeout: 120_000 });
      await page.keyboard.up("ArrowRight");

      await hold(page, "ArrowRight", 550);
      await expect.poll(async () => (await readEvidence(page)).cameraReadability.activeFrame)
        .toMatchObject({ facing: 1, leadDirection: "right", leadMatchesFacing: true });
      const rightFrame = (await readEvidence(page)).cameraReadability.activeFrame;
      expect(rightFrame.targetOffset[0]).toBeGreaterThan(0);

      await hold(page, "ArrowLeft", 350);
      await expect.poll(async () => (await readEvidence(page)).cameraReadability.activeFrame)
        .toMatchObject({ facing: -1, leadDirection: "left", leadMatchesFacing: true });
      const leftFrame = (await readEvidence(page)).cameraReadability.activeFrame;
      expect(leftFrame.targetOffset[0]).toBeLessThan(0);

      await page.keyboard.down("ArrowRight");
      await page.keyboard.press("Space");
      await expect.poll(async () => {
        const evidence = await readEvidence(page);
        return !evidence.player.grounded && evidence.player.vy > 0.05;
      }, { timeout: 5_000 }).toBe(true);
      await page.keyboard.up("ArrowRight");

      await page.evaluate(() => {
        const probe = (window as unknown as {
          __AURA3D_COMPOSITION_PROBE__?: { settleSubjectPose?: () => void };
        }).__AURA3D_COMPOSITION_PROBE__;
        probe?.settleSubjectPose?.();
      });
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

      const canvasBox = await page.locator("#app canvas").boundingBox();
      expect(canvasBox).not.toBeNull();
      const crop: PngCrop = {
        x: Math.floor(canvasBox!.x),
        y: Math.floor(canvasBox!.y),
        width: Math.floor(canvasBox!.width),
        height: Math.floor(canvasBox!.height)
      };
      /*
       * The follow camera intentionally places a right-facing runner in the left
       * three quarters of the canvas. Restrict subject isolation to that declared
       * region so a distance-LOD transition at the far-right boundary cannot join
       * the hero's difference bounds merely because suppression presents one extra
       * synchronous frame. Clipping margins below are still measured against the
       * complete canvas, not this analysis region.
       */
      const subjectAnalysisCrop: PngCrop = {
        ...crop,
        width: Math.floor(crop.width * 0.75)
      };
      const visiblePath = resolve(REPORT_DIR, `${scenario.id}-airborne.png`);
      const hiddenPath = resolve(REPORT_DIR, `${scenario.id}-airborne-subject-hidden.png`);
      const visible = await page.screenshot({ path: visiblePath, fullPage: false, scale: "css" });
      await page.evaluate(() => {
        const probe = (window as unknown as {
          __AURA3D_COMPOSITION_PROBE__?: { setSubjectSuppressed?: (value: boolean) => void };
        }).__AURA3D_COMPOSITION_PROBE__;
        probe?.setSubjectSuppressed?.(true);
      });
      const hidden = await page.screenshot({ path: hiddenPath, fullPage: false, scale: "css" });
      const difference = analyzePngDifferenceBounds(visible, hidden, subjectAnalysisCrop);

      expect(difference.changedPixels).toBeGreaterThan(20);
      expect(difference.bounds).not.toBeNull();
      expect(difference.clipped).toBe(false);
      const bounds = difference.bounds!;
      const margins = {
        left: bounds.x - crop.x,
        right: crop.x + crop.width - (bounds.x + bounds.width),
        top: bounds.y - crop.y,
        bottom: crop.y + crop.height - (bounds.y + bounds.height)
      };
      expect(margins.left).toBeGreaterThanOrEqual(20);
      expect(margins.right).toBeGreaterThanOrEqual(20);
      expect(margins.top).toBeGreaterThanOrEqual(40);
      expect(margins.bottom).toBeGreaterThanOrEqual(40);

      const finalEvidence = await readEvidence(page);
      expect(finalEvidence.cameraReadability.bothFacingDirectionsObserved).toBe(true);
      expect(finalEvidence.cameraReadability.observedFacingDirections).toEqual(["left", "right"]);
      expect(finalEvidence.cameraReadability.airborneFramingObserved).toBe(true);
      expect(browserErrors).toEqual([]);

      writeFileSync(resolve(REPORT_DIR, `${scenario.id}.json`), `${JSON.stringify({
        schema: "aura3d-skyline-camera-readability/1.0",
        scenario,
        pass: true,
        camera: finalEvidence.cameraReadability,
        heroDifference: {
          changedPixels: difference.changedPixels,
          bounds,
          margins,
          clipped: difference.clipped,
          analysisCrop: subjectAnalysisCrop,
          canvasCrop: crop
        },
        artifacts: {
          visible: `tests/reports/skyline-camera-readability/${scenario.id}-airborne.png`,
          visibleSha256: `sha256-${createHash("sha256").update(visible).digest("hex")}`,
          subjectHidden: `tests/reports/skyline-camera-readability/${scenario.id}-airborne-subject-hidden.png`,
          subjectHiddenSha256: `sha256-${createHash("sha256").update(hidden).digest("hex")}`
        },
        browserErrors
      }, null, 2)}\n`);
    });
  }
});
