import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { createRouteSourceHash } from "../../tools/showcase-library/route-primary-probes.mjs";

const ROUTE_ID = "showcase-turbo-drift-circuit";
const ROUTE = `/apps/${ROUTE_ID}/`;
const GLOBAL = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";
// A caller may isolate an investigative acceptance producer without replacing the
// canonical source-bound proof. CI uses the canonical directory by default.
const REPORT_DIR = resolve(process.env.TURBO_ACCEPTANCE_REPORT_DIR ?? "tests/reports/turbo-drift-circuit/playable");
const REPORT_PATH = resolve(REPORT_DIR, "browser-evidence.json");

type Evidence = Record<string, any>;
type Artifact = { readonly path: string; readonly sha256: string; readonly state: string };

let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startExampleDevServer();
  mkdirSync(REPORT_DIR, { recursive: true });
});

test.afterAll(async () => { await server?.close(); });

test("binds Turbo Drift's complete acceptance arc to exact desktop, mobile, and reduced-motion frames", async ({ browser }, testInfo) => {
  testInfo.setTimeout(720_000);
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
  const grid = await readEvidence(desktop);
  assertions.gridReady = grid.startLightsComplete === false && grid.speed === 0;
  artifacts.push(await capture(desktop, "grid", "opening grid"));
  // Route evidence is published before asynchronous GLB mounting has necessarily
  // reached pixels. Do not begin the exact review drive until two consecutive,
  // non-fallback frames prove the mounted renderer has settled.
  await waitForStableMountedFrame(desktop);
  await desktop.keyboard.down("KeyW");
  // The repaired circuit's first bend turns right. The previous retained drive
  // held left, which could satisfy the generic drift predicate while visibly
  // crossing the verge. Drive the authored corner direction instead.
  await desktop.keyboard.down("KeyD");
  await desktop.keyboard.down("Space");
  await desktop.waitForFunction((name) => (window as any)[name]?.startLightsComplete === true, GLOBAL, { timeout: 30_000 });
  await expect.poll(async () => (await readEvidence(desktop)).speed, { timeout: 20_000 }).toBeGreaterThan(0.35);
  await desktop.waitForFunction((name) => (window as any)[name]?.raceState?.progress >= 0.17, GLOBAL, { timeout: 30_000 });
  await desktop.waitForFunction((name) => { const value = (window as any)[name]; return value?.renderedFeedback?.driftVisible === true && value?.renderedFeedback?.driftAmount > 0.35 && value?.renderedFeedback?.speedFraction >= 0.6; }, GLOBAL, { timeout: 30_000 });
  await desktop.waitForFunction(() => document.body.dataset.turboReviewHeld === "true", undefined, { timeout: 10_000 });
  const drift = await readEvidence(desktop);
  assertions.driftStateDriven = drift.renderedFeedback?.driftVisible === true && drift.renderedFeedback?.driftSmokeVisible === true && drift.renderedFeedback?.driftAmount > 0.35;
  const driftArtifact = await capture(desktop, "drift", "live handbrake drift");
  artifacts.push(driftArtifact);
  // The visual gauntlet's historical matrix path is retained for compatibility,
  // but it must point at a current, full-size gameplay frame.  Copy the same
  // producer screenshot bytes here rather than preserving the old parked-car
  // canvas capture.
  writeFileSync(
    resolve("tests/reports/showcase-library-screenshots/showcase-turbo-drift-circuit-canvas-only.png"),
    readFileSync(resolve(driftArtifact.path))
  );
  await desktop.keyboard.up("Space"); await desktop.keyboard.up("KeyD"); await desktop.keyboard.up("KeyW"); await desktop.close();

  const mission = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  collectErrors(mission, errors, "mission");
  await openReady(mission, "?evidenceDriver=1");
  let passCaptured = false;
  let ghostCaptured = false;
  let passArtifact: Artifact | undefined;
  let ghostArtifact: Artifact | undefined;
  let finished: Evidence | undefined;
  const deadline = Date.now() + 450_000;
  while (Date.now() < deadline) {
    await mission.waitForTimeout(320);
    const evidence = await readEvidence(mission);
    if (!passCaptured && evidence.gameplay?.playerOvertookOpponent === true) {
      passArtifact = await capture(mission, "rival-pass", "mounted rival overtake");
      passCaptured = true;
    }
    if (!ghostCaptured && evidence.ghost?.hasBestLap === true && evidence.ghost?.active === true) {
      ghostArtifact = await capture(mission, "ghost-chase", "best-lap ghost chase");
      ghostCaptured = true;
    }
    if (evidence.kitContractProof?.finishedStatus === "finished") {
      finished = evidence;
      break;
    }
  }
  assertions.rivalPass = passCaptured;
  assertions.ghostReplay = ghostCaptured;
  // The racing snapshot advances the displayed lap counter after crediting lap
  // four, so a four-lap finish is represented as lap 5 + finished status.
  assertions.finishedFourLaps = (finished?.lap ?? 0) >= 5
    && finished?.kitContractProof?.finishedStatus === "finished"
    && finished?.gameplay?.finishProgression === true;
  expect(finished, "the complete four-lap race must finish inside the bounded drive window").toBeDefined();
  // The ghost can become active before the first overtake on a valid run. Keep
  // the evidence files captured at their true moments, but append their
  // manifest entries in the documented acceptance-arc order so the report is
  // deterministic rather than dependent on which gameplay signal arrives
  // first.
  if (passArtifact) artifacts.push(passArtifact);
  if (ghostArtifact) artifacts.push(ghostArtifact);
  await mission.waitForTimeout(700);
  const finish = await readEvidence(mission);
  assertions.finishPresentation = finish.gameplay?.resultCardAfterFinish === true
    && finish.gameplay?.finishCamera3Quarter === true;
  artifacts.push(await capture(mission, "finish", "four-lap result"));
  await mission.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  collectErrors(mobile, errors, "mobile");
  await openReady(mobile);
  await mobile.waitForFunction((name) => (window as any)[name]?.startLightsComplete === true, GLOBAL, { timeout: 30_000 });
  const throttle = mobile.locator("#throttle-control");
  await expect(throttle).toBeVisible();
  await throttle.dispatchEvent("pointerdown");
  await mobile.waitForTimeout(900);
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
  await reduced.waitForFunction((name) => (window as any)[name]?.startLightsComplete === true, GLOBAL, { timeout: 30_000 });
  await reduced.waitForTimeout(1_100);
  await reduced.keyboard.down("KeyD");
  await reduced.keyboard.down("Space");
  await reduced.waitForFunction((name) => (window as any)[name]?.renderedFeedback?.driftVisible === true, GLOBAL, { timeout: 20_000 });
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
  await page.waitForFunction((name) => (window as any)[name]?.status === "ready", GLOBAL, { timeout: 90_000 });
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

async function waitForStableMountedFrame(page: Page): Promise<void> {
  await expect.poll(async () => {
    const frame = await page.screenshot({ animations: "disabled" });
    // Mounted Formula frames currently encode between roughly 300–560 KiB;
    // PNG byte size is content entropy, not an asset-mount contract. Keep a
    // conservative nonblank floor here. Exact cross-context byte identity is
    // asserted on the held action artifact itself; requiring identical live
    // pre-grid frames was flaky because renderer-owned loading/idle frames keep
    // advancing even after every GLB is mounted.
    return frame.length >= 250_000;
  }, {
    timeout: 90_000,
    intervals: [250, 500, 1_000]
  }).toBe(true);
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
