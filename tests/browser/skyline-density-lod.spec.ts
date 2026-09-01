/**
 * SR-08 mounted density/LOD acceptance.
 *
 * Proves native instancing and production-runtime LOD selections, traverses the
 * follow camera without mutating game truth, captures a real hysteresis crossing,
 * and retains desktop/compact frames for visual inspection.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { comparePngBuffers } from "./showcase-visual-quality";

const ROUTE = "/apps/showcase-skyline-runner/";
const GLOBAL = "__AURA3D_SHOWCASE_SKYLINE_RUNNER__";
const CAPTURE_GLOBAL = "__AURA3D_SKYLINE_DENSITY_CAPTURE__";
const REPORT_DIR = resolve("tests/reports/skyline-density-lod");

interface LodSelection {
  readonly nodeName: string;
  readonly levelIndex: number;
  readonly levelName: string;
}

interface SkylineDensityEvidence {
  readonly closeTrianglesPerChunk: number;
  readonly distantTrianglesPerChunk: number;
  readonly distantTriangleReductionRatio: number;
  readonly maximumNormalizedSilhouetteDelta: number;
  readonly captureCameraGameX: number | null;
  readonly mountedRuntime: {
    readonly backend: string;
    readonly selectionCount: number;
    readonly currentCounts: { readonly close: number; readonly distant: number };
    readonly nativeInstancedSubmissions: number;
    readonly selections: readonly LodSelection[];
    readonly observedClose: boolean;
    readonly observedDistant: boolean;
    readonly transitions: readonly { readonly nodeName: string; readonly from: number; readonly to: number }[];
  };
  readonly instancing: {
    readonly logicalInstanceCount: number;
    readonly authoredPoolCount: number;
    readonly estimatedDrawObjectsWithoutInstancing: number;
    readonly estimatedDrawObjectsWithInstancing: number;
    readonly estimatedDrawObjectReduction: number;
    readonly estimatedDrawObjectReductionRatio: number;
    readonly activePoolCount: number;
    readonly activeLogicalInstanceCount: number;
    readonly activeEstimatedDrawObjectReduction: number;
    readonly activeEstimatedDrawObjectReductionRatio: number;
    readonly collisionBodiesAdded: number;
    readonly foregroundInstances: number;
  };
}

interface SkylineMountedEvidence {
  readonly status: string;
  readonly platformerStateStatus: string;
  readonly player: { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly grounded: boolean };
  readonly score: number;
  readonly coins: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly backdrop: SkylineDensityEvidence;
  readonly cameraReadability: {
    readonly viewport: "desktop" | "compact";
    readonly playableEdgeContract: {
      readonly minimumFoliageEdgeClearance: number;
      readonly foliageClearsEveryLandingEdge: boolean;
    };
    readonly decorativeDepthContract: {
      readonly allBackgroundDressingBehindActor: boolean;
      readonly renderedForegroundPropCount: number;
    };
  };
}

async function readEvidence(page: Page): Promise<SkylineMountedEvidence> {
  return page.evaluate((name) =>
    (window as unknown as Record<string, SkylineMountedEvidence>)[name]!, GLOBAL);
}

async function setCameraGameX(page: Page, gameX: number): Promise<SkylineMountedEvidence> {
  await page.evaluate(({ globalName, x }) => {
    const capture = (window as unknown as Record<string, unknown>)[globalName] as { setCameraGameX(value: number): void };
    capture.setCameraGameX(x);
  }, { globalName: CAPTURE_GLOBAL, x: gameX });
  return readEvidence(page);
}

function truthOf(evidence: SkylineMountedEvidence) {
  return {
    status: evidence.platformerStateStatus,
    player: evidence.player,
    score: evidence.score,
    coins: evidence.coins,
    deaths: evidence.deaths,
    checkpointId: evidence.checkpointId
  };
}

function levelFor(evidence: SkylineMountedEvidence, nodeName: string): number | undefined {
  return evidence.backdrop.mountedRuntime.selections.find((entry) => entry.nodeName === nodeName)?.levelIndex;
}

test("Skyline native density and LOD remain readable through a pinned transition", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  let server: ExampleDevServer | undefined;
  const browserErrors: string[] = [];
  try {
    server = await startExampleDevServer();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) browserErrors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const evidence = (window as unknown as Record<string, SkylineMountedEvidence>)[name];
      return evidence?.status === "running"
        && evidence.backdrop?.mountedRuntime.backend === "production-runtime"
        && evidence.backdrop.mountedRuntime.selectionCount === 20
        && evidence.backdrop.mountedRuntime.nativeInstancedSubmissions > 0;
    }, GLOBAL, { timeout: 90_000 });

    const initial = await readEvidence(page);
    const truthBefore = truthOf(initial);
    expect(initial.backdrop.closeTrianglesPerChunk).toBe(52);
    expect(initial.backdrop.distantTrianglesPerChunk).toBe(12);
    expect(initial.backdrop.distantTriangleReductionRatio).toBeCloseTo(0.769, 3);
    expect(initial.backdrop.maximumNormalizedSilhouetteDelta).toBeLessThanOrEqual(0.03);
    expect(initial.backdrop.instancing.logicalInstanceCount).toBe(95);
    expect(initial.backdrop.instancing.authoredPoolCount).toBe(10);
    expect(initial.backdrop.instancing.estimatedDrawObjectReduction).toBe(85);
    expect(initial.backdrop.instancing.estimatedDrawObjectReductionRatio).toBeCloseTo(0.895, 3);
    expect(initial.backdrop.instancing.activeLogicalInstanceCount).toBeGreaterThan(2);
    expect(initial.backdrop.instancing.activeEstimatedDrawObjectReduction)
      .toBe(initial.backdrop.instancing.activeLogicalInstanceCount - 2);
    expect(initial.backdrop.instancing.activeEstimatedDrawObjectReductionRatio).toBeGreaterThan(0.7);
    expect(initial.backdrop.instancing.collisionBodiesAdded).toBe(0);
    expect(initial.backdrop.instancing.foregroundInstances).toBe(0);
    expect(initial.backdrop.mountedRuntime.currentCounts.close).toBeGreaterThan(0);
    expect(initial.backdrop.mountedRuntime.currentCounts.distant).toBeGreaterThan(0);
    expect(initial.cameraReadability.playableEdgeContract.minimumFoliageEdgeClearance).toBeGreaterThan(0);
    expect(initial.cameraReadability.playableEdgeContract.foliageClearsEveryLandingEdge).toBe(true);
    expect(initial.cameraReadability.decorativeDepthContract.allBackgroundDressingBehindActor).toBe(true);
    expect(initial.cameraReadability.decorativeDepthContract.renderedForegroundPropCount).toBe(0);

    const samples: { gameX: number; counts: { close: number; distant: number }; selections: readonly LodSelection[] }[] = [];
    let transition: { nodeName: string; from: number; to: number; fromX: number; toX: number } | undefined;
    let previous = await setCameraGameX(page, 0);
    samples.push({ gameX: 0, counts: previous.backdrop.mountedRuntime.currentCounts, selections: previous.backdrop.mountedRuntime.selections });
    for (let gameX = 10; gameX <= 160 && !transition; gameX += 10) {
      const current = await setCameraGameX(page, gameX);
      samples.push({ gameX, counts: current.backdrop.mountedRuntime.currentCounts, selections: current.backdrop.mountedRuntime.selections });
      for (const selection of current.backdrop.mountedRuntime.selections) {
        const from = levelFor(previous, selection.nodeName);
        if (from !== undefined && from !== selection.levelIndex) {
          transition = { nodeName: selection.nodeName, from, to: selection.levelIndex, fromX: gameX - 10, toX: gameX };
          break;
        }
      }
      previous = current;
    }
    expect(transition, "camera traversal should make at least one mounted backdrop resource switch").toBeDefined();

    // We are on the `to` side of the first coarse crossing. Walk back toward the
    // `from` side until hysteresis releases, then capture tightly around that real switch.
    const direction = Math.sign(transition!.toX - transition!.fromX) || 1;
    let reverseSwitchX: number | undefined;
    let reverseHeldX = transition!.toX;
    let reverseLevel = transition!.to;
    for (let gameX = transition!.toX - direction;
      direction > 0 ? gameX >= transition!.fromX - 15 : gameX <= transition!.fromX + 15;
      gameX -= direction) {
      const current = await setCameraGameX(page, gameX);
      const level = levelFor(current, transition!.nodeName);
      if (level !== undefined && level !== reverseLevel) {
        reverseSwitchX = gameX;
        reverseLevel = level;
        break;
      }
      reverseHeldX = gameX;
    }
    expect(reverseSwitchX, "reverse traversal should release the held LOD across hysteresis").toBeDefined();

    // Refine the mounted bracket. Each candidate starts from the known `to` side,
    // preserving the same travel direction and hysteresis history. Eight bisections
    // leave at most 0.00390625 game units of camera translation in the visual pair,
    // keeping sub-pixel camera motion below the resource-switch delta under test.
    let refinedHeldX = reverseHeldX;
    let refinedSwitchX = reverseSwitchX!;
    for (let index = 0; index < 8; index += 1) {
      await setCameraGameX(page, transition!.toX);
      const candidateX = (refinedHeldX + refinedSwitchX) / 2;
      const candidate = await setCameraGameX(page, candidateX);
      if (levelFor(candidate, transition!.nodeName) === transition!.to) refinedHeldX = candidateX;
      else refinedSwitchX = candidateX;
    }

    await setCameraGameX(page, transition!.toX);
    const beforeEvidence = await setCameraGameX(page, refinedHeldX);
    const beforePath = resolve(REPORT_DIR, "desktop-before-transition.png");
    const beforePng = await page.screenshot({ path: beforePath });
    const afterEvidence = await setCameraGameX(page, refinedSwitchX);
    const afterPath = resolve(REPORT_DIR, "desktop-after-transition.png");
    const afterPng = await page.screenshot({ path: afterPath });
    expect(levelFor(beforeEvidence, transition!.nodeName)).not.toBe(levelFor(afterEvidence, transition!.nodeName));
    const transitionDiff = comparePngBuffers(beforePng, afterPng, { x: 250, y: 225, width: 800, height: 260 });
    expect(transitionDiff.meanChannelDelta).toBeLessThan(4);
    expect(transitionDiff.changedRatio).toBeLessThan(0.12);
    expect(transitionDiff.strongChangedRatio).toBeLessThan(0.05);

    const finalDesktop = await readEvidence(page);
    expect(finalDesktop.backdrop.mountedRuntime.observedClose).toBe(true);
    expect(finalDesktop.backdrop.mountedRuntime.observedDistant).toBe(true);
    expect(finalDesktop.backdrop.mountedRuntime.transitions.length).toBeGreaterThan(0);
    expect(truthOf(finalDesktop), "evidence-camera traversal cannot mutate live game truth").toEqual(truthBefore);

    // A fresh compact mount proves the same native density and edge discipline at
    // the separately composed mobile breakpoint.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const evidence = (window as unknown as Record<string, SkylineMountedEvidence>)[name];
      return evidence?.cameraReadability.viewport === "compact"
        && evidence.backdrop?.mountedRuntime.nativeInstancedSubmissions > 0;
    }, GLOBAL, { timeout: 90_000 });
    const compact = await readEvidence(page);
    const compactPath = resolve(REPORT_DIR, "compact-density.png");
    const compactPng = await page.screenshot({ path: compactPath });
    expect(compact.backdrop.mountedRuntime.selectionCount).toBe(20);
    expect(compact.backdrop.mountedRuntime.currentCounts.close).toBeGreaterThan(0);
    expect(compact.backdrop.mountedRuntime.currentCounts.distant).toBeGreaterThan(0);
    expect(compact.cameraReadability.playableEdgeContract.foliageClearsEveryLandingEdge).toBe(true);
    expect(compact.cameraReadability.decorativeDepthContract.renderedForegroundPropCount).toBe(0);
    expect(browserErrors).toEqual([]);

    const report = {
      schema: "aura3d-skyline-density-lod/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/skyline-density-lod.spec.ts",
      pass: true,
      plan: {
        closeTrianglesPerChunk: initial.backdrop.closeTrianglesPerChunk,
        distantTrianglesPerChunk: initial.backdrop.distantTrianglesPerChunk,
        distantTriangleReductionRatio: initial.backdrop.distantTriangleReductionRatio,
        maximumNormalizedSilhouetteDelta: initial.backdrop.maximumNormalizedSilhouetteDelta,
        instancing: initial.backdrop.instancing
      },
      mounted: {
        backend: initial.backdrop.mountedRuntime.backend,
        initialNativeInstancedSubmissions: initial.backdrop.mountedRuntime.nativeInstancedSubmissions,
        finalNativeInstancedSubmissions: finalDesktop.backdrop.mountedRuntime.nativeInstancedSubmissions,
        samples,
        transition,
        reverseHeldX,
        reverseSwitchX,
        refinedHeldX,
        refinedSwitchX,
        refinedCameraDeltaGameUnits: Math.abs(refinedHeldX - refinedSwitchX),
        transitionDiff,
        transitionHistory: finalDesktop.backdrop.mountedRuntime.transitions
      },
      truth: { before: truthBefore, after: truthOf(finalDesktop), unchanged: true },
      edgeReadability: finalDesktop.cameraReadability,
      compact: {
        currentCounts: compact.backdrop.mountedRuntime.currentCounts,
        nativeInstancedSubmissions: compact.backdrop.mountedRuntime.nativeInstancedSubmissions,
        cameraReadability: compact.cameraReadability
      },
      artifacts: {
        beforeTransition: "tests/reports/skyline-density-lod/desktop-before-transition.png",
        beforeTransitionSha256: `sha256-${createHash("sha256").update(beforePng).digest("hex")}`,
        afterTransition: "tests/reports/skyline-density-lod/desktop-after-transition.png",
        afterTransitionSha256: `sha256-${createHash("sha256").update(afterPng).digest("hex")}`,
        compactDensity: "tests/reports/skyline-density-lod/compact-density.png",
        compactDensitySha256: `sha256-${createHash("sha256").update(compactPng).digest("hex")}`
      },
      browserErrors
    };
    writeFileSync(resolve(REPORT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server?.close();
  }
});
