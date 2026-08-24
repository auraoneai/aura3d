import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { createRouteSourceHash } from "../../tools/showcase-library/route-primary-probes.mjs";

const ROUTE_ID = "showcase-turbo-drift-circuit";
const ROUTE = `/apps/${ROUTE_ID}/`;
const GLOBAL = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";
const REPORT_DIR = resolve("tests/reports/turbo-drift-circuit/playable");
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
  await openReady(desktop);
  const grid = await readEvidence(desktop);
  assertions.gridReady = grid.startLightsComplete === false && grid.speed === 0;
  artifacts.push(await capture(desktop, "grid", "opening grid"));

  await desktop.keyboard.down("KeyW");
  await desktop.waitForFunction((name) => (window as any)[name]?.startLightsComplete === true, GLOBAL, { timeout: 30_000 });
  await expect.poll(async () => (await readEvidence(desktop)).speed, { timeout: 20_000 }).toBeGreaterThan(0.35);
  await desktop.keyboard.down("KeyD");
  await desktop.keyboard.down("Space");
  await desktop.waitForFunction((name) => {
    const value = (window as any)[name];
    return value?.renderedFeedback?.driftVisible === true && value?.renderedFeedback?.driftAmount > 0.2;
  }, GLOBAL, { timeout: 20_000 });
  const drift = await readEvidence(desktop);
  assertions.driftStateDriven = drift.renderedFeedback?.driftVisible === true
    && drift.renderedFeedback?.driftSmokeVisible === true
    && drift.renderedFeedback?.driftAmount > 0.2;
  artifacts.push(await capture(desktop, "drift", "live handbrake drift"));
  await desktop.keyboard.up("Space");
  await desktop.keyboard.up("KeyD");
  await desktop.keyboard.up("KeyW");
  await desktop.close();

  const mission = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  collectErrors(mission, errors, "mission");
  await openReady(mission, "?evidenceDriver=1");
  let passCaptured = false;
  let ghostCaptured = false;
  let finished: Evidence | undefined;
  const deadline = Date.now() + 450_000;
  while (Date.now() < deadline) {
    await mission.waitForTimeout(320);
    const evidence = await readEvidence(mission);
    if (!passCaptured && evidence.gameplay?.playerOvertookOpponent === true) {
      artifacts.push(await capture(mission, "rival-pass", "mounted rival overtake"));
      passCaptured = true;
    }
    if (!ghostCaptured && evidence.ghost?.hasBestLap === true && evidence.ghost?.active === true) {
      artifacts.push(await capture(mission, "ghost-chase", "best-lap ghost chase"));
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
  const relative = `tests/reports/turbo-drift-circuit/playable/${name}.png`;
  const buffer = await page.screenshot({ path: resolve(relative) });
  return { path: relative, sha256: sha256(buffer), state };
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
