import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface Capture {
  readonly id: string;
  readonly label: string;
  readonly handleCount: number;
  readonly strokePixels: number;
  readonly colorBuckets: number;
}

interface DragProof {
  readonly mode: string;
  readonly pickedHandle: string | undefined;
  readonly startPosition: readonly [number, number, number];
  readonly endPosition: readonly [number, number, number];
  readonly startScale: readonly [number, number, number];
  readonly endScale: readonly [number, number, number];
  readonly startRotation: readonly [number, number, number];
  readonly endRotation: readonly [number, number, number];
  readonly totalDelta: number;
  readonly constrainedToAxis: boolean;
}

interface GizmoEvidence {
  readonly captures: readonly Capture[];
  readonly translateDrag: DragProof;
  readonly rotateDrag: DragProof;
  readonly scaleDrag: DragProof;
  readonly snappedDrag: { readonly requestedRaw: number; readonly committed: number; readonly snapIncrement: number };
  readonly missedPointerFallsThrough: boolean;
  readonly localSpaceDiffersFromWorld: boolean;
  readonly pass: boolean;
}

const reportDir = "tests/reports/threejs-parity-transform-controls";

test.describe("interactive transform controls", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders gizmos and drives a full pointer drag with constraints and snapping", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/threejs-parity-transform-controls-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const scope = window as unknown as Record<string, unknown>;
      return Boolean(scope.__AURA3D_GIZMO__ || scope.__AURA3D_GIZMO_ERROR__);
    }, undefined, { timeout: 120_000 });

    const harnessError = await page.evaluate(() => (window as unknown as Record<string, string | undefined>).__AURA3D_GIZMO_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const evidence: GizmoEvidence = await page.evaluate(() => (window as unknown as Record<string, GizmoEvidence>).__AURA3D_GIZMO__);

    mkdirSync(resolve(reportDir), { recursive: true });
    await page.screenshot({ path: `${reportDir}/transform-controls.png`, fullPage: true });
    writeFileSync(resolve(`${reportDir}/transform-controls.json`), `${JSON.stringify({
      schema: "aura3d-interactive-transform-controls/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary: "Proves rendered gizmo handles, ray picking, a pointer down/move/up drag lifecycle, axis and plane constraints, snapping, and distinct local/world handle orientation. Does not claim a pixel-identical image match against Three.js TransformControls.",
      ...evidence
    }, null, 2)}\n`);

    // Rendered gizmos: real pixels, not a data structure.
    expect(evidence.captures.length).toBe(3);
    for (const capture of evidence.captures) {
      expect(capture.handleCount, `${capture.id} handle count`).toBeGreaterThanOrEqual(3);
      expect(capture.strokePixels, `${capture.id} drew no gizmo`).toBeGreaterThan(200);
      // Distinct per-axis colours must survive to the framebuffer.
      expect(capture.colorBuckets, `${capture.id} colour variety`).toBeGreaterThanOrEqual(3);
    }
    // Translate and scale expose axis + plane handles; scale adds uniform.
    expect(evidence.captures.find((entry) => entry.id === "translate")?.handleCount).toBe(6);
    expect(evidence.captures.find((entry) => entry.id === "scale")?.handleCount).toBe(7);
    expect(evidence.captures.find((entry) => entry.id === "rotate")?.handleCount).toBe(3);

    // Drag lifecycle mutates the attached object, constrained to the picked axis.
    expect(evidence.translateDrag.pickedHandle).toBe("x");
    expect(evidence.translateDrag.constrainedToAxis, JSON.stringify(evidence.translateDrag)).toBe(true);
    expect(evidence.rotateDrag.constrainedToAxis, JSON.stringify(evidence.rotateDrag)).toBe(true);
    expect(evidence.scaleDrag.constrainedToAxis, JSON.stringify(evidence.scaleDrag)).toBe(true);

    // Snapping quantizes the committed value to the configured grid.
    expect(evidence.snappedDrag.committed).toBeCloseTo(0.5, 6);
    expect(evidence.snappedDrag.committed).not.toBeCloseTo(evidence.snappedDrag.requestedRaw, 3);

    // A missed pointer must not be swallowed, so viewport selection still works.
    expect(evidence.missedPointerFallsThrough).toBe(true);
    // Local and world spaces must orient handles differently.
    expect(evidence.localSpaceDiffersFromWorld).toBe(true);

    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
