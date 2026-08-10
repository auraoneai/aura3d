import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/2.0-digital-twin-operations");
const VIEWPORT = { width: 1440, height: 900 } as const;

test("proves Digital Twin Operations selection, focus, alarms, isolation, time, labels, and accessibility", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(REPORT_DIRECTORY, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${server.origin}/apps/showcase-digital-twin-ops/`);
    await waitForEvidence(page, (evidence) => evidence.status === "running" && evidence.frameCount > 4);

    const overview = await readEvidence(page);
    const overviewCapture = await captureCanvas(page, "overview-canvas.png");
    expect(overview.selectedZone).toBe("assembly");
    expect(overview.renderedLabels).toHaveLength(4);
    expect(overview.renderedLabels.some((label) => label.visible)).toBe(true);
    expect(overview.spatialInvariants.passes).toBe(true);
    expect(overview.spatialInvariants.kit.spatialInvariants.passes).toBe(true);

    await page.locator("[data-zone='packaging']").click();
    await waitForEvidence(page, (evidence) => evidence.selectedZone === "packaging");
    const selected = await readEvidence(page);
    expect(selected.accessibilitySummary).toContain("Packaging selected");

    await page.locator("#focus-zone").click();
    await waitForEvidence(page, (evidence) => evidence.camera.focusedZone === "packaging");
    const focused = await readEvidence(page);
    const focusedCapture = await captureCanvas(page, "packaging-focused-canvas.png");
    expect(focused.camera.position).not.toEqual(overview.camera.position);
    expect(focused.accessibilitySummary).toContain("camera focused");

    await page.locator("#inject-alert").click();
    await waitForEvidence(page, (evidence) => evidence.mode === "incident" && evidence.alerts === 1);
    const alarmed = await readEvidence(page);
    const alarmCapture = await captureCanvas(page, "packaging-alarm-canvas.png");
    expect(alarmed.zones.find((zone) => zone.id === "packaging")?.incidents).toBe(1);
    expect(alarmed.accessibilitySummary).toContain("1 alert");

    await page.locator("#isolate-zone").click();
    await waitForEvidence(page, (evidence) => evidence.isolatedZone === "packaging"
      && evidence.zones.some((zone) => zone.id === "packaging" && zone.load === 0));
    const isolated = await readEvidence(page);
    const isolatedCapture = await captureCanvas(page, "packaging-isolated-canvas.png");
    expect(isolated.throughput).toBeLessThan(alarmed.throughput);
    expect(isolated.accessibilitySummary).toContain("Packaging isolated");

    await page.locator("#toggle-time").click();
    await waitForEvidence(page, (evidence) => evidence.timeControl.paused);
    const paused = await readEvidence(page);
    await page.waitForTimeout(500);
    const stillPaused = await readEvidence(page);
    expect(stillPaused.uptime).toBe(paused.uptime);
    expect(stillPaused.motionProof).toEqual(paused.motionProof);

    await page.locator("#advance-time").click();
    await waitForEvidence(page, (evidence) => evidence.timeControl.paused && evidence.uptime >= paused.uptime + 1.99);
    const advanced = await readEvidence(page);
    expect(advanced.timeControl.step).toBe((paused.timeControl.step + 1) % paused.timeControl.steps);
    expect(advanced.uptime).toBeCloseTo(paused.uptime + 2, 1);
    expect(advanced.motionProof).not.toEqual(paused.motionProof);

    await page.locator("#toggle-time").click();
    await waitForEvidence(page, (evidence) => !evidence.timeControl.paused && evidence.uptime > advanced.uptime);
    const resumed = await readEvidence(page);
    expect(resumed.accessibilitySummary).toContain("simulation running");
    expect(resumed.spatialInvariants.passes).toBe(true);
    expect(resumed.spatialInvariants.kit.timeline.step).toBe(resumed.timeControl.step);
    expect(overviewCapture.sha256).not.toBe(focusedCapture.sha256);
    expect(focusedCapture.sha256).not.toBe(alarmCapture.sha256);
    expect(alarmCapture.sha256).not.toBe(isolatedCapture.sha256);
    expect(pageErrors).toEqual([]);

    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({
      schema: "aura3d.digital-twin-operations/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      viewport: VIEWPORT,
      states: { overview, selected, focused, alarmed, isolated, paused, stillPaused, advanced, resumed },
      captures: { overview: overviewCapture, focused: focusedCapture, alarmed: alarmCapture, isolated: isolatedCapture },
      assertions: {
        typedWorkcellAndAssetRelativeSpatialInvariants: true,
        selectionChangesEvidence: true,
        focusChangesCameraAndPixels: true,
        alarmsChangeTelemetryAndPixels: true,
        isolationChangesTelemetryRuntimeAndPixels: true,
        pauseFreezesTimeAndMotion: true,
        explicitAdvanceChangesOneTimelineStep: true,
        resumeRestartsTime: true,
        worldLabelsRendered: true,
        accessibleSummaryTracksOperationalState: true,
        realFacilityOrPlcIntegrationClaimed: false,
        universalThreejsParityClaimed: false
      },
      pageErrors
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function waitForEvidence(page: Page, predicate: (evidence: any) => boolean): Promise<void> {
  await expect.poll(async () => {
    const evidence = await page.evaluate(() => window.__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__);
    return evidence ? predicate(evidence) : false;
  }, { timeout: 90_000 }).toBe(true);
}

async function captureCanvas(page: Page, filename: string): Promise<{ readonly path: string; readonly sha256: string }> {
  const bytes = await page.locator("#app canvas").screenshot({ path: resolve(REPORT_DIRECTORY, filename) });
  return {
    path: `tests/reports/2.0-digital-twin-operations/${filename}`,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

async function readEvidence(page: Page) {
  return await page.evaluate(() => structuredClone(window.__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__!));
}
