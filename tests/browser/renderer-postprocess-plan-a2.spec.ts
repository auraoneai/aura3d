import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const evidencePath = join(process.cwd(), "tests/reports/renderer-postprocess-plan-a2.json");

function writeEvidence(payload: unknown): void {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(payload, null, 2)}\n`);
}

test.describe("renderer postprocess plan A2 browser delta", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("missing-input plan fails closed by name with requested/submitted/pixelBacked", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const rendering = await import(renderingUrl);
      const { createRendererPostprocessPlanDiagnostics } = rendering;
      const missing = createRendererPostprocessPlanDiagnostics(
        {
          toneMapping: false,
          depthOfField: { focusDepth: 0.5, focusRange: 0.1, maxRadius: 3 },
          fxaa: true
        },
        {
          sourceTargetFormat: "rgba8",
          targetFormat: "rgba8",
          rendererDepthAvailable: false,
          nativeLdrPostprocess: true
        }
      );
      const bound = createRendererPostprocessPlanDiagnostics(
        {
          toneMapping: { exposure: 1.08, operator: "filmic" },
          fxaa: true
        },
        {
          sourceTargetFormat: "rgba8",
          targetFormat: "rgba8",
          width: 96,
          height: 64,
          nativeLdrPostprocess: true
        }
      );
      return {
        missingInputs: missing.missingInputs,
        plannedVsActual: missing.plannedVsActual,
        dofPass: missing.passes.find((pass: { name: string }) => pass.name === "depth-of-field"),
        boundPlannedVsActual: bound.plannedVsActual,
        boundCost: bound.costEstimate
      };
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.missingInputs, "unbound DOF depth fails closed with its named input").toEqual([
      "depth-of-field:depth"
    ]);
    expect(result.plannedVsActual.requested, "requested keeps the withheld pass").toEqual([
      "depth-of-field",
      "fxaa"
    ]);
    expect(result.plannedVsActual.submitted, "submitted drops the fail-closed pass").toEqual(["fxaa"]);
    expect(result.plannedVsActual.pixelBacked, "pixel-backed drops the fail-closed pass").toEqual(["fxaa"]);
    expect(result.plannedVsActual.dropped, "dropped names the withheld pass").toEqual(["depth-of-field"]);
    expect(result.dofPass).toMatchObject({
      name: "depth-of-field",
      requiresDepth: true,
      hasDepthInput: false,
      submitted: false,
      pixelBacked: false,
      missingInputs: ["depth-of-field:depth"]
    });
    expect(result.boundPlannedVsActual).toMatchObject({
      requested: ["tone-mapping", "fxaa"],
      submitted: ["tone-mapping", "fxaa"],
      pixelBacked: ["tone-mapping", "fxaa"],
      dropped: []
    });
    expect(result.boundCost).toMatchObject({
      bytesPerPixel: 4,
      frameWidth: 96,
      frameHeight: 64,
      warns: false
    });
    writeEvidence({ failedClosedByName: result });
  });

  test("frame diagnostics shows requested/submitted/pixelBacked", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const rendering = await import(renderingUrl);
      const { Renderer } = rendering;
      const renderer = await Renderer.create({
        backend: "mock",
        width: 2,
        height: 1,
        clearColor: [1, 0.25, 0, 1]
      });
      const diagnostics = renderer.render({
        renderItems: [],
        postprocess: {
          toneMapping: { exposure: 2, gamma: 1, operator: "reinhard", outputColorSpace: "linear" }
        }
      });
      const plan = diagnostics.postprocessPlan;
      renderer.dispose();
      return {
        source: plan?.source,
        passNames: plan?.passNames,
        requestedPassNames: plan?.requestedPassNames,
        submittedPassNames: plan?.submittedPassNames,
        pixelBackedPassNames: plan?.pixelBackedPassNames,
        plannedVsActual: plan?.plannedVsActual,
        costEstimate: plan?.costEstimate
      };
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.source).toBe("Renderer.postprocessPlan");
    expect(result.passNames).toEqual(["tone-mapping"]);
    expect(result.requestedPassNames).toEqual(["tone-mapping"]);
    expect(result.submittedPassNames).toEqual(["tone-mapping"]);
    expect(result.pixelBackedPassNames).toEqual(["tone-mapping"]);
    expect(result.plannedVsActual).toMatchObject({
      requested: ["tone-mapping"],
      submitted: ["tone-mapping"],
      pixelBacked: ["tone-mapping"],
      dropped: [],
      missingInputs: []
    });
    expect(result.costEstimate).toMatchObject({
      bytesPerPixel: 4,
      frameWidth: 2,
      frameHeight: 1,
      warns: false
    });
    writeEvidence({ frameDiagnostics: result });
  });
});
