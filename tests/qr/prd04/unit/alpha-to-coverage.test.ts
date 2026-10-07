/**
 * `prd04.alphaToCoverage` (PRD-04 §14, P5-5): the feature is selected iff the
 * material is in MASK mode (`u_alphaCutoff > 0`), its renderState requests
 * alpha-to-coverage (set by `renderStateForGLTFMaterial` under
 * `A3D_QR_MATERIALS`), and the active quality tier has MSAA samples.
 */
import { describe, expect, it } from "vitest";
import { Material } from "../../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../../packages/rendering/src/MaterialInstance";
import { alphaToCoverageFeature } from "../../../../packages/rendering/src/materials/features";
import type { RenderItem } from "../../../../packages/rendering/src";
import type { AuraQualityTierSettings } from "../../../../packages/rendering/src/contracts/program";

const itemFor = (material: Material | MaterialInstance) => ({ material }) as unknown as RenderItem;
const TIER_MSAA = { msaaSamples: 4 } as AuraQualityTierSettings;
const TIER_NO_MSAA = { msaaSamples: 0 } as AuraQualityTierSettings;
const NO_FLAGS = [] as unknown as Parameters<typeof alphaToCoverageFeature.select>[0]["flags"];

const maskMaterial = (alphaToCoverage: boolean): Material => new Material({
  shaderKey: "lit",
  parameters: { u_alphaCutoff: 0.5 },
  // `validateRenderState` preserves keys the RenderState type predates (P5-5).
  renderState: { alphaToCoverage } as never
});

const select = (material: Material | MaterialInstance, tier = TIER_MSAA) =>
  alphaToCoverageFeature.select({ item: itemFor(material), pass: "forward" as never, tier, flags: NO_FLAGS });

describe("prd04.alphaToCoverage (P5-5)", () => {
  it("selects iff alphaMode===MASK && alphaToCoverage && tier.msaaSamples > 0", () => {
    expect(select(maskMaterial(true))).toBe(true);
  });
  it("does not select without the renderState request", () => {
    expect(select(maskMaterial(false))).toBeUndefined();
    expect(select(new Material({ shaderKey: "lit", parameters: { u_alphaCutoff: 0.5 } }))).toBeUndefined();
  });
  it("does not select outside MASK mode", () => {
    expect(select(new Material({
      shaderKey: "lit",
      renderState: { alphaToCoverage: true } as never
    }))).toBeUndefined();
  });
  it("does not select when the tier has no MSAA", () => {
    expect(select(maskMaterial(true), TIER_NO_MSAA)).toBeUndefined();
  });
  it("reads the request through a MaterialInstance's baseMaterial", () => {
    expect(select(new MaterialInstance(maskMaterial(true)))).toBe(true);
  });
});
