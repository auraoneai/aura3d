import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { writeJsonArtifactAtomically } from "../../tools/evidence-freshness/index.mjs";

/**
 * Live per-draw GL proof that every primitive of a multi-part glTF asset reaches the GPU.
 *
 * ## What this adds over the offline audit
 *
 * `auditPrimitiveSubmission` proves the submission path is coherent without a browser. It cannot prove a pixel was
 * written: a coherent request still draws nothing if a shader fails to link or a uniform upload errors.
 *
 * The false "renderer drops secondary glTF primitives" diagnosis was reached *with* a browser and still concluded
 * wrongly, because the evidence was one screenshot from one camera angle plus an aggregate draw-call count --
 * neither of which can attribute pixels to a specific primitive. This renders each primitive **in isolation** under
 * `errorCheckMode: "strict"`, so written pixels are attributable by label and any GL error names the failing draw.
 */
const REPORT_DIR = "tests/reports/multipart-primitive-draw";

interface PerPrimitiveDrawRecord {
  readonly label: string;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly drawCalls: number;
  readonly glError: string | null;
  readonly writtenPixels: number;
  readonly pixelBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

interface MultipartDrawEvidence {
  readonly schema: string;
  readonly errorCheckMode: string;
  readonly submission: {
    readonly primitives: number;
    readonly submittable: number;
    readonly blocked: number;
    readonly blockedLabels: readonly string[];
    readonly expectedDrawCallsSinglePass: number;
    readonly culled: number;
    readonly culledLabels: readonly string[];
    readonly frustumByLabel: Readonly<Record<string, string>>;
  };
  readonly perPrimitive: readonly PerPrimitiveDrawRecord[];
  readonly combined: { readonly drawCalls: number; readonly writtenPixels: number; readonly glError: string | null };
  readonly allPrimitivesDrew: boolean;
  readonly glErrorCount: number;
}

const EXPECTED_PARTS = ["body", "wheelFrontL", "wheelFrontR", "wheelBackL", "wheelBackR"] as const;

test.describe("multi-part glTF per-draw GL proof", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("draws every primitive with no GL error and attributable pixels", async ({ context }) => {
    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      await page.goto(`${server.origin}/tests/browser/multipart-primitive-draw-harness.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => Boolean(
          (window as { __AURA3D_MULTIPART_DRAW__?: unknown }).__AURA3D_MULTIPART_DRAW__ ||
          (window as { __AURA3D_MULTIPART_DRAW_ERROR__?: unknown }).__AURA3D_MULTIPART_DRAW_ERROR__
        ),
        undefined,
        { timeout: 60_000 }
      );
      const harnessError = await page.evaluate(
        () => (window as { __AURA3D_MULTIPART_DRAW_ERROR__?: string }).__AURA3D_MULTIPART_DRAW_ERROR__
      );
      expect(harnessError, "harness must not fail").toBeUndefined();

      const evidence = await page.evaluate(
        () => (window as { __AURA3D_MULTIPART_DRAW__?: MultipartDrawEvidence }).__AURA3D_MULTIPART_DRAW__
      ) as MultipartDrawEvidence;
      writeJsonArtifactAtomically(
        resolve(REPORT_DIR, "body-and-four-wheels.json"),
        { ...evidence, generatedAt: new Date().toISOString() }
      );

      expect(pageErrors).toEqual([]);
      // Strict mode was actually in force; a `frame`-mode run would not prove per-draw error checking.
      expect(evidence.errorCheckMode).toBe("strict");

      // Submission path and GPU evidence must agree on the primitive count.
      expect(evidence.submission.primitives).toBe(EXPECTED_PARTS.length);
      expect(evidence.submission.blocked).toBe(0);
      expect(evidence.submission.blockedLabels).toEqual([]);
      expect(evidence.submission.expectedDrawCallsSinglePass).toBe(EXPECTED_PARTS.length);

      /*
       * No part may be culled under the framing camera. This is what makes the pixel assertions below meaningful:
       * a culled primitive writing zero pixels would be *expected* behaviour, so without this check a genuine
       * regression and correct culling look identical.
       */
      expect(evidence.submission.culled).toBe(0);
      expect(evidence.submission.culledLabels).toEqual([]);
      for (const part of EXPECTED_PARTS) {
        const label = Object.keys(evidence.submission.frustumByLabel).find((entry) => entry.includes(part));
        expect(label, `${part} must have a frustum verdict`).toBeTruthy();
        expect(evidence.submission.frustumByLabel[label!], `${part} frustum verdict`).toBe("inside");
      }

      // Every part accounted for by label, each having written pixels with no GL error.
      expect(evidence.perPrimitive).toHaveLength(EXPECTED_PARTS.length);
      for (const part of EXPECTED_PARTS) {
        const record = evidence.perPrimitive.find((entry) => entry.label.includes(part));
        expect(record, `${part} must have an isolated draw record`).toBeTruthy();
        expect(record!.glError, `${part} must draw without a GL error`).toBeNull();
        // The load-bearing assertion: pixels attributable to this primitive alone.
        expect(record!.writtenPixels, `${part} must write pixels`).toBeGreaterThan(0);
        expect(record!.pixelBounds, `${part} must have a pixel bounding box`).toBeTruthy();
        expect(record!.drawCalls, `${part} must issue at least one draw`).toBeGreaterThan(0);
      }

      expect(evidence.glErrorCount).toBe(0);
      expect(evidence.allPrimitivesDrew).toBe(true);

      // Combined render draws all five and covers more of the frame than any single primitive.
      expect(evidence.combined.glError).toBeNull();
      expect(evidence.combined.drawCalls).toBeGreaterThanOrEqual(EXPECTED_PARTS.length);
      const largestSingle = Math.max(...evidence.perPrimitive.map((record) => record.writtenPixels));
      expect(evidence.combined.writtenPixels).toBeGreaterThan(largestSingle);
    } finally {
      await page.close();
    }
  });
});
