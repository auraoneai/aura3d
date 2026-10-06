// PRD-15 T2.2 — golden-JSON equivalence for "one lit cube".
//
// `ProductionWebGL2Renderer.renderFrame` and the C-29 `Renderer.render`
// must produce identical `RenderDeviceDiagnostics.drawCalls` and identical
// shader-program keys for the same `RenderSource`. Both sides run the real
// `Renderer` pipeline over a `MockRenderDevice` (node env has no GL — the
// mock validates the command stream deterministically). A `toMatchSnapshot`
// golden pins the diagnostic JSON; regenerate with `vitest -u` only when a
// deliberate renderer change alters it.
//
// `ProductionWebGL2Renderer`'s constructor is private because `create()`
// requires a real webgl2 device; the wrapper adds no command-path logic, so
// the test instantiates it around the same `Renderer` the C-29 side uses.
import { describe, expect, it } from "vitest";
import {
  Geometry,
  MockRenderDevice,
  PBRMaterial,
  Renderer
} from "../../../packages/rendering/src";
import { DirectionalLight } from "../../../packages/scene/src";
import type { RenderDeviceDiagnostics, RenderSource } from "../../../packages/rendering/src";
import { ProductionWebGL2Renderer } from "../../../packages/rendering/src/production-runtime/ProductionWebGL2Renderer";
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
  it("lit cube: ProductionWebGL2Renderer.renderFrame and Renderer.render produce identical evidence", async () => {
    const c29Renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const prodInner = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    // Private ctor: the wrapper's `create()` only adds the real-webgl2 device
    // check; its frame path delegates verbatim to `renderer.render`.
    const prodRenderer = new (ProductionWebGL2Renderer as unknown as {
      new (renderer: Renderer, width: number, height: number): ProductionWebGL2Renderer;
    })(prodInner, 16, 16);
    const c29Device = c29Renderer.device as MockRenderDevice;
    const prodDevice = prodInner.device as MockRenderDevice;

    try {
      const source = litCubeSource();
      const prodResult = prodRenderer.renderFrame(productionInput(source));
      const prodEvidence: FrameEvidence = {
        diagnostics: prodResult.diagnostics,
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
      prodInner.dispose();
    }
  });
});
