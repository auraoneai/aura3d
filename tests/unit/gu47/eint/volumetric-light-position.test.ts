import { afterEach, describe, expect, it } from "vitest";
import { createRootPostPipeline, resetRuntimePostOverrides } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";

// GU47 pass 4 (g08, g18): a 3-number lightPosition is the v2 god-ray world anchor; the UV pair stays the forward anchor.
const derive = (...nodes: unknown[]): Record<string, any> =>
  createRootPostPipeline({ nodes } as never, { near: 0.1, far: 100 }, undefined, QUALITY_TIERS.high).options;

afterEach(() => resetRuntimePostOverrides());

describe("volumetricFog lightPosition forms (pass 4)", () => {
  const godRays = (bag: Record<string, any>) => bag.godRays ?? bag.godrays ?? bag.volumetric ?? bag.volumetricFog;

  it("passes a world point to the god-ray stage", () => {
    const bag = derive(effects.volumetricFog({ density: 0.3, lightPosition: [40, 60, -20] }).toJSON());
    const stage = godRays(bag);
    expect(stage, Object.keys(bag).join(",")).toBeDefined();
    expect(stage.lightWorld).toEqual([40, 60, -20]);
  });

  it("does not hand a UV pair to the god-ray stage as a world point", () => {
    const stage = godRays(derive(effects.volumetricFog({ density: 0.3, lightPosition: [0.5, 0.2] }).toJSON()));
    expect(stage.lightWorld).toBeUndefined();
  });
});
