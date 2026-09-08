import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { createRouteSourceHash } from "../../tools/showcase-library/route-primary-probes.mjs";
// @ts-expect-error -- .mjs visual evidence tooling has no declarations; focused tooling tests cover it.
import { readPngDifferenceMetrics, readPngVisualCompositionMetrics } from "../../tools/showcase-library/png-foreground.mjs";

const ROUTE_ID = "showcase-turbo-drift-circuit";
const ROUTE = `/apps/${ROUTE_ID}/`;
const GLOBAL = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";
// A caller may isolate an investigative acceptance producer without replacing the
// canonical source-bound proof. CI uses the canonical directory by default.
const REPORT_DIR = resolve(process.env.TURBO_ACCEPTANCE_REPORT_DIR ?? "tests/reports/turbo-drift-circuit/playable");
const REPORT_PATH = resolve(REPORT_DIR, "browser-evidence.json");
const SOFTWARE_GPU_FRAME_TIMEOUT_MS = 300_000;

type Evidence = Record<string, any>;
type Artifact = { readonly path: string; readonly sha256: string; readonly state: string };

let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startExampleDevServer();
  mkdirSync(REPORT_DIR, { recursive: true });
});

test.afterAll(async () => { await server?.close(); });

test("binds Turbo Drift's complete acceptance arc to exact desktop, mobile, and reduced-motion frames", async ({ browser }, testInfo) => {
  testInfo.setTimeout(1_800_000);
  const artifacts: Artifact[] = [];
  const assertions: Record<string, boolean | number | string> = {};
  const errors: string[] = [];

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  collectErrors(desktop, errors, "desktop");
  // The exact comparison frame uses the same deterministic road-following
  // driver as the complete-race evidence below. Keyboard/touch are still
  // exercised by this acceptance arc and the focused grounding suite, while
  // the held review pose now remains visibly on the certified asphalt instead
  // of depending on wall-clock key-repeat through the opening bend.
  await openReady(desktop, "?capture=overview&evidenceDriver=1");
  await desktop.evaluate(async () => {
    await (window as any).__AURA3D_TURBO_ACCEPTANCE_CAPTURE__.holdOpeningGrid();
  });
  // Route evidence is published before asynchronous GLB mounting has necessarily
  // reached pixels. Do not capture or drive until the production renderer is
  // mounted, every typed asset has reached a terminal ready state, real draw calls
  // have completed, and a nonblank canvas frame confirms those diagnostics reached
  // pixels. The previous producer captured the HUD-only loading frame first and
  // could therefore publish an empty "opening grid" as release evidence.
  const mountedFrame = await waitForStableMountedFrame(desktop);
  assertions.mountedCanvasForegroundPixels = mountedFrame.nonBlankPixels;
  assertions.mountedCanvasForegroundAreaRatio = mountedFrame.foregroundAreaRatio;
  assertions.mountedCanvasColorBuckets = mountedFrame.colorBuckets;
  const grid = await readEvidence(desktop);
  assertions.gridReady = grid.startLightsComplete === false
    && grid.speed === 0
    && grid.diagnostics?.renderer?.runtime?.mounted === true
    && grid.diagnostics?.drawCalls > 0
    && grid.diagnostics?.assets?.length >= 3
    && grid.diagnostics.assets.every((asset: { status?: string }) => asset.status === "ready");
  artifacts.push(await capture(desktop, "grid", "opening grid"));
  await desktop.keyboard.down("KeyW");
  // The repaired circuit's first bend turns right. The previous retained drive
  // held left, which could satisfy the generic drift predicate while visibly
  // crossing the verge. Drive the authored corner direction instead.
  await desktop.keyboard.down("KeyD");
  await desktop.keyboard.down("Space");
  const driftAdvance = await advanceTo(desktop, "drift");
  assertions.driftAdvanceSteps = driftAdvance.steps;
  const drift = await readEvidence(desktop);
  assertions.driftStateDriven = drift.renderedFeedback?.driftVisible === true && drift.renderedFeedback?.driftSmokeVisible === true && drift.renderedFeedback?.driftAmount > 0.35;
  const driftArtifact = await capture(desktop, "drift", "live handbrake drift");
  artifacts.push(driftArtifact);
  const driftPlayerSuppressedPath = resolve(REPORT_DIR, "drift-player-suppressed.png");
  await desktop.evaluate(async () => {
    await (window as any).__AURA3D_COMPOSITION_PROBE__.setSubjectSuppressed(true);
  });
  await desktop.locator("canvas").first().screenshot({ path: driftPlayerSuppressedPath, animations: "disabled", scale: "css" });
  await desktop.evaluate(async () => {
    await (window as any).__AURA3D_COMPOSITION_PROBE__.setSubjectSuppressed(false);
  });
  const driftHero = readPngDifferenceMetrics(resolve(driftArtifact.path), driftPlayerSuppressedPath) as {
    nonBlankPixels: number;
    colorBuckets: number;
    foregroundAreaRatio: number;
    clipped: boolean;
  };
  assertions.driftHeroPixels = driftHero.nonBlankPixels;
  assertions.driftHeroAreaRatio = driftHero.foregroundAreaRatio;
  assertions.driftHeroColorBuckets = driftHero.colorBuckets;
  expect(driftHero.nonBlankPixels, "live drift player must remain a readable primary subject").toBeGreaterThanOrEqual(12_000);
  expect(driftHero.foregroundAreaRatio, "live drift player must occupy at least 2.5% of its canvas bounds").toBeGreaterThanOrEqual(0.025);
  expect(driftHero.colorBuckets, "live drift player must retain authored material variation").toBeGreaterThanOrEqual(20);
  expect(driftHero.clipped, "live drift player must fit inside the retained frame").toBe(false);
  // The visual gauntlet's historical matrix path is retained for compatibility,
  // but it must point at a current, full-size gameplay frame.  Copy the same
  // producer screenshot bytes here rather than preserving the old parked-car
  // canvas capture.
  const compatibilityScreenshotDirectory = resolve("tests/reports/showcase-library-screenshots");
  mkdirSync(compatibilityScreenshotDirectory, { recursive: true });
  writeFileSync(
    resolve(compatibilityScreenshotDirectory, "showcase-turbo-drift-circuit-canvas-only.png"),
    readFileSync(resolve(driftArtifact.path))
  );
  await desktop.keyboard.up("Space"); await desktop.keyboard.up("KeyD"); await desktop.keyboard.up("KeyW"); await desktop.close();

  const mission = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  collectErrors(mission, errors, "mission");
  await openReady(mission, "?evidenceDriver=1");
  const passAdvance = await advanceTo(mission, "rival-pass");
  const passArtifact = await capture(mission, "rival-pass", "mounted rival overtake");
  const ghostAdvance = await advanceTo(mission, "ghost-chase");
  const ghostArtifact = await capture(mission, "ghost-chase", "best-lap ghost chase");
  const finishAdvance = await advanceTo(mission, "finish");
  const finished = await readEvidence(mission);
  assertions.rivalPass = finished.gameplay?.playerOvertookOpponent === true;
  assertions.ghostReplay = finished.ghost?.hasBestLap === true;
  assertions.rivalPassAdvanceSteps = passAdvance.steps;
  assertions.ghostAdvanceSteps = ghostAdvance.steps;
  assertions.finishAdvanceSteps = finishAdvance.steps;
  // The racing snapshot advances the displayed lap counter after crediting lap
  // four, so a four-lap finish is represented as lap 5 + finished status.
  assertions.finishedFourLaps = (finished?.lap ?? 0) >= 5
    && finished?.kitContractProof?.finishedStatus === "finished"
    && finished?.gameplay?.finishProgression === true;
  artifacts.push(passArtifact);
  artifacts.push(ghostArtifact);
  const presentationAdvance = await advanceTo(mission, "finish-presentation");
  assertions.finishPresentationAdvanceSteps = presentationAdvance.steps;
  const finish = await readEvidence(mission);
  assertions.finishPresentation = finish.gameplay?.resultCardAfterFinish === true
    && finish.gameplay?.finishCamera3Quarter === true;
  artifacts.push(await capture(mission, "finish", "four-lap result"));
  await mission.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  collectErrors(mobile, errors, "mobile");
  await openReady(mobile);
  const throttle = mobile.locator("#throttle-control");
  await expect(throttle).toBeVisible();
  await throttle.dispatchEvent("pointerdown");
  const mobileAdvance = await advanceTo(mobile, "mobile-motion");
  assertions.mobileAdvanceSteps = mobileAdvance.steps;
  const mobileActive = await readEvidence(mobile);
  await throttle.dispatchEvent("pointerup");
  const mobileCanvas = await mobile.locator("canvas").first().boundingBox();
  assertions.mobileTouch = mobileActive.speed > 0.1
    && (mobileCanvas?.width ?? 0) > 0
    && (mobileCanvas?.height ?? 0) > 0;
  artifacts.push(await capture(mobile, "mobile-touch", "mobile touch throttle"));
  await mobile.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce"
  });
  const reduced = await reducedContext.newPage();
  collectErrors(reduced, errors, "reduced-motion");
  await openReady(reduced);
  await reduced.keyboard.down("KeyW");
  await reduced.keyboard.down("KeyD");
  await reduced.keyboard.down("Space");
  const reducedAdvance = await advanceTo(reduced, "reduced-motion-drift");
  assertions.reducedMotionAdvanceSteps = reducedAdvance.steps;
  const reducedEvidence = await readEvidence(reduced);
  assertions.reducedMotionTruth = reducedEvidence.reducedMotion === true
    && reducedEvidence.renderedFeedback?.driftVisible === true
    && reducedEvidence.renderedFeedback?.driftSmokeVisible === false;
  artifacts.push(await capture(reduced, "reduced-motion", "reduced-motion drift truth"));
  await reduced.keyboard.up("Space");
  await reduced.keyboard.up("KeyD");
  await reduced.keyboard.up("KeyW");
  await reducedContext.close();

  for (const [name, value] of Object.entries(assertions)) {
    if (typeof value === "boolean") expect(value, name).toBe(true);
  }
  expect(errors, errors.join("\n")).toEqual([]);
  expect(artifacts.map((artifact) => artifact.state)).toEqual([
    "opening grid", "live handbrake drift", "mounted rival overtake", "best-lap ghost chase",
    "four-lap result", "mobile touch throttle", "reduced-motion drift truth"
  ]);

  const sourceHash = createRouteSourceHash(ROUTE_ID);
  const producerPath = resolve("tests/browser/turbo-acceptance.spec.ts");
  const report = {
    schema: "aura3d.turbo-drift-circuit.browser-evidence/1.0",
    generatedAt: new Date().toISOString(),
    producer: "tests/browser/turbo-acceptance.spec.ts",
    producerSha256: sha256(readFileSync(producerPath)),
    routeSourceSha256: sourceHash,
    pass: true,
    humanVisualApproval: false,
    humanVisualApprovalNote: "Machine-bound acceptance artifacts only; independent exact-artifact review remains required.",
    assertions,
    artifacts
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
});

async function openReady(page: Page, search = ""): Promise<void> {
  await page.goto(`${server.origin}${ROUTE}${search}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((name) => (window as any)[name]?.status === "ready", GLOBAL, { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS });
}

async function advanceTo(page: Page, milestone: string): Promise<{ steps: number; frame: number; time: number }> {
  return page.evaluate(async (name) => (window as any).__AURA3D_TURBO_ACCEPTANCE_CAPTURE__.advanceTo(name), milestone);
}

async function readEvidence(page: Page): Promise<Evidence> {
  return page.evaluate((name) => ({ ...(window as any)[name] }), GLOBAL);
}

async function capture(page: Page, name: string, state: string): Promise<Artifact> {
  const outputPath = resolve(REPORT_DIR, `${name}.png`);
  const artifactPath = relative(resolve("."), outputPath);
  const buffer = await page.screenshot({ path: outputPath, animations: "disabled" });
  return { path: artifactPath, sha256: sha256(buffer), state };
}

type MountedCanvasMetrics = {
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
  readonly foregroundAreaRatio: number;
  readonly clipped: boolean;
  readonly rivalPixels: number;
  readonly rivalColorBuckets: number;
  readonly rivalAreaRatio: number;
  readonly rivalClipped: boolean;
  readonly compositionCoverageRatio: number;
  readonly compositionDistinctBuckets: number;
};

type MountedFrameGate = {
  readonly sampledAt: string;
  readonly elapsedMs: number;
  readonly frameCount: number;
  readonly backend: unknown;
  readonly drawCalls: unknown;
  readonly runtime: unknown;
  readonly assets: unknown;
  readonly errors: unknown;
  readonly metrics?: MountedCanvasMetrics;
};

async function waitForStableMountedFrame(page: Page): Promise<MountedCanvasMetrics> {
  const startedAt = Date.now();
  const canvasPath = resolve(REPORT_DIR, "mounted-frame-canvas.png");
  const suppressedPath = resolve(REPORT_DIR, "mounted-frame-hero-suppressed.png");
  const rivalSuppressedPath = resolve(REPORT_DIR, "mounted-frame-rival-suppressed.png");
  const gatePath = resolve(REPORT_DIR, "mounted-frame-gate.json");
  let lastGate: MountedFrameGate | undefined;
  await expect.poll(async () => {
    const evidence = await readEvidence(page);
    const diagnostics = evidence.diagnostics;
    const assets = diagnostics?.assets;
    lastGate = {
      sampledAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      frameCount: Number(evidence.frameCount ?? 0),
      backend: diagnostics?.backend ?? null,
      drawCalls: diagnostics?.drawCalls ?? null,
      runtime: diagnostics?.renderer?.runtime ?? null,
      assets: Array.isArray(assets) ? assets.map((asset: Record<string, unknown>) => ({ id: asset.id, status: asset.status, message: asset.message })) : assets ?? null,
      errors: diagnostics?.errors ?? null
    };
    writeFileSync(gatePath, `${JSON.stringify(lastGate, null, 2)}\n`);
    return diagnostics?.renderer?.runtime?.mounted === true
      && diagnostics?.backend === "webgl2"
      && diagnostics?.drawCalls > 0
      && Array.isArray(assets)
      && assets.length >= 3
      && assets.every((asset: { status?: string }) => asset.status === "ready")
      && (diagnostics.errors?.length ?? 0) === 0;
  }, {
    timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS,
    intervals: [250, 500, 1_000]
  }).toBe(true);

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await canvas.screenshot({ path: canvasPath, animations: "disabled", scale: "css" });
  await page.evaluate(async () => {
    await (window as any).__AURA3D_COMPOSITION_PROBE__.setSubjectSuppressed(true);
  });
  await canvas.screenshot({ path: suppressedPath, animations: "disabled", scale: "css" });
  await page.evaluate(async () => {
    await (window as any).__AURA3D_COMPOSITION_PROBE__.setSubjectSuppressed(false);
    await (window as any).__AURA3D_COMPOSITION_PROBE__.setRivalSuppressed(true);
  });
  await canvas.screenshot({ path: rivalSuppressedPath, animations: "disabled", scale: "css" });
  await page.evaluate(async () => {
    await (window as any).__AURA3D_COMPOSITION_PROBE__.setRivalSuppressed(false);
  });

  const hero = readPngDifferenceMetrics(canvasPath, suppressedPath) as {
    nonBlankPixels: number;
    colorBuckets: number;
    foregroundAreaRatio: number;
    clipped: boolean;
  };
  const rival = readPngDifferenceMetrics(canvasPath, rivalSuppressedPath) as {
    nonBlankPixels: number;
    colorBuckets: number;
    foregroundAreaRatio: number;
    clipped: boolean;
  };
  const composition = readPngVisualCompositionMetrics(canvasPath) as {
    foregroundCoverageRatio: number;
    distinctBuckets: number;
  };
  const metrics: MountedCanvasMetrics = {
    nonBlankPixels: hero.nonBlankPixels,
    colorBuckets: hero.colorBuckets,
    foregroundAreaRatio: hero.foregroundAreaRatio,
    clipped: hero.clipped,
    rivalPixels: rival.nonBlankPixels,
    rivalColorBuckets: rival.colorBuckets,
    rivalAreaRatio: rival.foregroundAreaRatio,
    rivalClipped: rival.clipped,
    compositionCoverageRatio: composition.foregroundCoverageRatio,
    compositionDistinctBuckets: composition.distinctBuckets
  };
  writeFileSync(gatePath, `${JSON.stringify({ ...lastGate, sampledAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt, metrics }, null, 2)}\n`);

  // Measure the actual typed hero against an identical-camera negative control.
  // The prior edge-derived foreground selector chose a 48x46 trackside tree even
  // while the car visibly filled the lower third, so it could neither accept a
  // readable hero nor diagnose its scale. Keep the original 20k/5%/20-bucket
  // quality floors, now bound to hero-only pixels, and add whole-frame variety.
  expect(metrics.nonBlankPixels, "typed Formula hero must contribute material pixels").toBeGreaterThanOrEqual(20_000);
  expect(metrics.foregroundAreaRatio, "typed Formula hero must occupy at least 5% of the canvas bounds").toBeGreaterThanOrEqual(0.05);
  expect(metrics.colorBuckets, "typed Formula hero must retain authored material variation").toBeGreaterThanOrEqual(20);
  expect(metrics.clipped, "typed Formula hero must fit inside the opening-grid frame").toBe(false);
  expect(metrics.rivalPixels, "typed Formula rival must remain visibly present in the same race frame").toBeGreaterThanOrEqual(2_000);
  expect(metrics.rivalColorBuckets, "typed Formula rival must retain authored material variation").toBeGreaterThanOrEqual(12);
  expect(metrics.rivalClipped, "typed Formula rival must fit inside the opening-grid frame").toBe(false);
  expect(metrics.compositionCoverageRatio, "the rendered circuit must materially occupy the frame").toBeGreaterThanOrEqual(0.2);
  expect(metrics.compositionDistinctBuckets, "the rendered circuit must retain authored color variation").toBeGreaterThanOrEqual(100);
  return metrics;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function collectErrors(page: Page, errors: string[], label: string): void {
  page.on("pageerror", (error) => errors.push(`${label}:pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) errors.push(`${label}:console:${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${label}:http-${response.status()}:${response.url()}`);
  });
}
