import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface SnapDragEvidence {
  readonly pickedHandle: string | undefined;
  readonly totalDelta: number;
  readonly snapped: boolean;
  readonly snapIncrement: number;
}

interface EditorSnapEvidence {
  readonly handleCount: number;
  readonly strokePixels: number;
  readonly translateSnap: SnapDragEvidence;
  readonly rotateSnap: SnapDragEvidence;
  readonly unsnappedTranslateTotal: number;
  readonly pass: boolean;
}

const reportDir = "tests/reports/editor-gizmo-snap";

test.describe("editor route gizmo snapping", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("editor gizmo renders and quantizes translate and rotate drags to the snap grid", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/editor-gizmo-snap-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const scope = window as unknown as Record<string, unknown>;
      return Boolean(scope.__AURA3D_EDITOR_SNAP__ || scope.__AURA3D_EDITOR_SNAP_ERROR__);
    }, undefined, { timeout: 120_000 });

    const harnessError = await page.evaluate(
      () => (window as unknown as Record<string, string | undefined>).__AURA3D_EDITOR_SNAP_ERROR__
    );
    if (harnessError) throw new Error(harnessError);

    const evidence = await page.evaluate(
      () => (window as unknown as Record<string, EditorSnapEvidence>).__AURA3D_EDITOR_SNAP__
    );

    mkdirSync(resolve(reportDir), { recursive: true });
    await page.screenshot({ path: `${reportDir}/editor-gizmo-snap.png`, fullPage: true });
    writeFileSync(resolve(`${reportDir}/editor-gizmo-snap.json`), `${JSON.stringify({
      schema: "aura3d-editor-gizmo-snap/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary: "Proves the editor-route InteractiveTransformGizmo renders handles and quantizes translate drags to the position grid and rotate drags to the rotation grid. Does not claim parity with the controls-package TransformControls beyond the shared drag math.",
      ...evidence
    }, null, 2)}\n`);

    // The editor gizmo is real rendered geometry.
    expect(evidence.handleCount).toBeGreaterThanOrEqual(3);
    expect(evidence.strokePixels).toBeGreaterThan(200);
    // Translate snap lands on the 0.5 grid and the grid did the work.
    expect(evidence.translateSnap.pickedHandle).toBe("x");
    expect(evidence.translateSnap.totalDelta).toBeCloseTo(0.5, 3);
    expect(evidence.translateSnap.totalDelta % evidence.translateSnap.snapIncrement).toBeCloseTo(0, 6);
    expect(Math.abs(evidence.unsnappedTranslateTotal - evidence.translateSnap.totalDelta)).toBeGreaterThan(0.05);
    // Rotate snap lands on the 15-degree grid (68-degree gesture -> 75).
    expect(evidence.rotateSnap.pickedHandle).toBe("z");
    expect(evidence.rotateSnap.totalDelta).toBeCloseTo((75 * Math.PI) / 180, 3);
    expect(evidence.rotateSnap.snapped).toBe(true);

    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
