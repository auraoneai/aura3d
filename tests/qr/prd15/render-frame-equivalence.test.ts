// PRD-15 T2.2/T2.6 — golden-JSON equivalence for "one lit cube".
//
// Pre-collapse this proved `ProductionWebGL2Renderer.renderFrame` produced the
// same command stream as the C-29 `Renderer.render` — the wrapper delegated
// verbatim, which is exactly why T2.6 could delete it. Post-collapse the proof
// reads differently but no less honestly: `rendererProofCapture` (the moved
// imported-asset proof) submits through the very same `renderer.render` call,
// so its diagnostics and program keys must equal a bare `Renderer.render` of
// the same `RenderSource`. A `toMatchSnapshot` golden pins the diagnostic
// JSON; regenerate with `vitest -u` only when a deliberate renderer change
// alters it.
import { describe, expect, it } from "vitest";
import {
  Geometry,
  MockRenderDevice,
  PBRMaterial,
  Renderer
} from "../../../packages/rendering/src";
import { rendererProofCapture } from "../../../packages/rendering/src/production-runtime";
import { DirectionalLight } from "../../../packages/scene/src";
import type { RenderDeviceDiagnostics, RenderSource } from "../../../packages/rendering/src";
import type { ProductionRendererInput } from "../../../packages/rendering/src/production-runtime/ProductionRendererTypes";

function litCubeSource(): RenderSource {
  return {
    renderItems: [{
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({ name: "golden-cube-material" }),
      label: "golden-lit-cube"
    }],
    collectedLights: [{
      kind: "directional",
      color: [1, 1, 1],
      intensity: 1,
      position: [0, 4, 4],
      direction: [0, -1, -1],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: new DirectionalLight("golden-directional")
    }]
  };
}

function productionInput(source: RenderSource): ProductionRendererInput {
  return {
    source,
    viewport: { width: 16, height: 16 },
    metadata: {
      assetId: "golden-lit-cube",
      assetUri: "fixture://golden-lit-cube",
      assetName: "Golden lit cube",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 1,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: []
    }
  };
}

interface FrameEvidence {
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly programKeys: readonly string[];
}

function programKeys(device: MockRenderDevice, previousCommandCount: number): string[] {
  return device.drawCommands
    .slice(previousCommandCount)
    .map((command) => command.shader?.label ?? "<unbound>")
    .sort();
}

describe("C-29 render-frame equivalence (PRD-15 T2.2)", () => {
  it("lit cube: rendererProofCapture and Renderer.render produce identical evidence", async () => {
    const c29Renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const prodRenderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const c29Device = c29Renderer.device as MockRenderDevice;
    const prodDevice = prodRenderer.device as MockRenderDevice;

    try {
      const source = litCubeSource();
      const proof = rendererProofCapture(prodRenderer, productionInput(source));
      const prodEvidence: FrameEvidence = {
        diagnostics: proof.diagnostics,
        programKeys: programKeys(prodDevice, 0)
      };

      const c29Diagnostics = c29Renderer.render(source, undefined);
      const c29Evidence: FrameEvidence = {
        diagnostics: c29Diagnostics,
        programKeys: programKeys(c29Device, 0)
      };

      expect(prodEvidence.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(prodEvidence.programKeys.length).toBeGreaterThan(0);
      // Spec: identical drawCalls and program keys — not the full diagnostics
      // object (resource-pool fields differ: the shared geometry's buffers are
      // allocated on whichever device renders it first via the global cache).
      expect(prodEvidence.diagnostics.drawCalls).toEqual(c29Evidence.diagnostics.drawCalls);
      expect(prodEvidence.programKeys).toEqual(c29Evidence.programKeys);
      // Golden JSON: the committed snapshot is the equivalence contract.
      expect({
        drawCalls: prodEvidence.diagnostics.drawCalls,
        programKeys: prodEvidence.programKeys
      }).toMatchSnapshot();
    } finally {
      c29Renderer.dispose();
      prodRenderer.dispose();
    }
  });
});
