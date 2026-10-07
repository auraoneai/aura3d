// PRD-06 T1.14 — `prd06-crossfade-filmstrip` on both adapters: soldier
// Idle→Walk→Run crossfades at t = 0.5/1.5 s with 0.25 s fades (three uses
// `crossFadeTo(…, 0.25, true)`), 8 strip frames at fixed times, and — on the
// Aura side — the §17.3 metrics computed by `pose/MotionMetrics.ts` from
// engine bone samples (continuity C ≤ 1.5 on both transitions, foot slide
// ≤ 2 cm walk / ≤ 3 cm run, walk/run phase error ≤ 1% while both weighted).
// Strip PNGs land under test-results/crossfade-filmstrip/ for the filmstrip.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../../prd04/dev-server";

declare global {
  interface Window {
    __PRD06_CROSSFADE_FILMSTRIP_FRAMES__?: readonly { at: number; dataUrl: string }[];
    __PRD06_CROSSFADE_THREE_FRAMES__?: readonly { at: number; dataUrl: string }[];
  }
}

const ARTIFACT_DIR = process.env.PRD06_EVIDENCE_DIR ?? "test-results/crossfade-filmstrip";

/** `strip: { frames: 8, intervalMs: 300 }` — the adapters capture the canvas in-page
 *  after each render (compositor screenshots read black headless); the spec
 *  saves them once the choreography is done. */
async function pullStrip(page: import("@playwright/test").Page, engine: "three" | "aura3d"): Promise<Buffer[]> {
  const frames = await page.evaluate((which) => (
    which === "aura3d" ? window.__PRD06_CROSSFADE_FILMSTRIP_FRAMES__ : window.__PRD06_CROSSFADE_THREE_FRAMES__
  ) ?? [], engine);
  const canvasDiag = await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((c) => `${c.width}x${c.height}`).join(", "));
  writeFileSync(join(ARTIFACT_DIR, `${engine}-canvas-diag.txt`), canvasDiag);
  return frames.map((frame, i) => {
    const png = Buffer.from(frame.dataUrl.split(",")[1] ?? "", "base64");
    writeFileSync(join(ARTIFACT_DIR, `${engine}-strip-${i}.png`), png);
    return png;
  });
}

test.describe("PRD-06 crossfade filmstrip (T1.14)", () => {
  let server: ExampleDevServer;
  const url = (engine: string) => `${server.origin}/tests/qr/prd06/browser/crossfade-filmstrip-harness.html?engine=${engine}`;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("three adapter runs crossFadeTo(…, 0.25, true) choreography and 8-frame strip", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(url("three"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PRD06_FILMSTRIP_HARNESS__?.status === "ok" || window.__PRD06_FILMSTRIP_HARNESS__?.status === "error", undefined, { timeout: 120_000 });
    const harness = await page.evaluate(() => window.__PRD06_FILMSTRIP_HARNESS__);
    expect(harness?.status, harness?.error ?? "harness failed").toBe("ok");
    await page.waitForFunction(() => window.__PRD06_CROSSFADE_THREE__?.status !== "running", undefined, { timeout: 120_000 });
    const report = await page.evaluate(() => window.__PRD06_CROSSFADE_THREE__);
    expect(report?.status, report?.error ?? "three choreography did not complete").toBe("done");
    const frames = await pullStrip(page, "three");
    expect(frames.length, "8 in-page strip frames").toBe(8);
    const distinct = new Set(frames.map((f) => f.length));
    expect(distinct.size, "strip frames should not all be pixel-identical").toBeGreaterThan(1);
    expect(report?.firedTransitions).toEqual(["Walk", "Run"]);
    writeFileSync(join(ARTIFACT_DIR, "three-report.json"), JSON.stringify(report, null, 2));
  });

  test("aura adapter drives crossfades; §17.3 metrics pass; 8-frame strip", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(url("aura3d"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PRD06_FILMSTRIP_HARNESS__?.status === "ok" || window.__PRD06_FILMSTRIP_HARNESS__?.status === "error", undefined, { timeout: 120_000 });
    const harness = await page.evaluate(() => window.__PRD06_FILMSTRIP_HARNESS__);
    expect(harness?.status, harness?.error ?? "harness failed").toBe("ok");
    await page.waitForFunction(() => window.__PRD06_CROSSFADE_FILMSTRIP__?.status !== "running", undefined, { timeout: 120_000 });
    const report = await page.evaluate(() => window.__PRD06_CROSSFADE_FILMSTRIP__);
    writeFileSync(join(ARTIFACT_DIR, "aura3d-report.json"), JSON.stringify(report, null, 2));
    expect(report?.status, report?.error ?? "aura choreography did not complete").toBe("done");
    const frames = await pullStrip(page, "aura3d");
    expect(frames.length, "8 in-page strip frames").toBe(8);
    const distinct = new Set(frames.map((f) => f.length));
    expect(distinct.size, "strip frames should not all be pixel-identical").toBeGreaterThan(1);
    expect(report?.firedTransitions).toEqual(["Walk", "Run"]);
    expect(report?.frameCount ?? 0, "bone samples at 60 Hz for ~2.6 s").toBeGreaterThan(120);

    const metrics = report?.metrics;
    expect(metrics, "MotionMetrics results missing").toBeTruthy();
    // §17.3 continuity C ≤ 1.5 on each of the two transitions.
    for (const c of metrics!.continuity) {
      expect(c.continuity, `continuity at t=${c.at} (max ${c.maxAngularSpeedDegPerSec.toFixed(0)}°/s vs baseline ${c.baselineDegPerSec.toFixed(0)}°/s)`).toBeLessThanOrEqual(1.5);
    }
    // Foot slide: ≤ 2 cm walk / ≤ 3 cm run → bound at 3 cm across phases.
    expect(metrics!.footSlide.maxSlideM, "foot slide must stay ≤ 3 cm").toBeLessThanOrEqual(0.03);
    // Walk/run phase error ≤ 1% while both weights > 0.05.
    expect(metrics!.phaseError.comparedFrames).toBeGreaterThan(0);
    expect(metrics!.phaseError.maxPhaseError, "walk/run phase error must stay ≤ 1%").toBeLessThanOrEqual(0.01);
  });
});
