import { describe, expect, it } from "vitest";
import {
  createCinematicLightingRig,
  listCinematicLightingRigs,
  selectCinematicLightingRig
} from "../../../packages/rendering/src";

describe("cinematic lighting rig", () => {
  it("adds the required cinematic lighting rigs with renderer-owned evidence", () => {
    const rigs = listCinematicLightingRigs();

    expect(rigs.map((rig) => rig.id)).toEqual([
      "soft-key-fill-rim",
      "moody-alley",
      "studio-product",
      "warm-sunrise",
      "cool-moonlit"
    ]);
    for (const rig of rigs) {
      expect(rig.lights.length).toBeGreaterThanOrEqual(3);
      expect(rig.rendererOwnedEvidence).toMatchObject({
        feature: "lighting",
        rendererOwned: true,
        domOverlay: false
      });
      expect(rig.environmentLighting.intensity).toBeGreaterThan(0);
      expect(rig.toneMap.operator).toBe("filmic");
    }
  });

  it("selects moody alley and studio product rigs from prompt tags", () => {
    expect(selectCinematicLightingRig(["rain", "neon", "alley"])).toBe("moody-alley");
    expect(selectCinematicLightingRig(["clean", "studio", "product"])).toBe("studio-product");
    expect(createCinematicLightingRig("moody-alley").lights.map((light) => light.role)).toEqual(expect.arrayContaining(["key", "rim", "practical"]));
  });
});
