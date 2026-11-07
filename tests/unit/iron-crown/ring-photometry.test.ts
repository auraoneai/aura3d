import { describe, expect, it } from "vitest";
import { lights } from "@aura3d/engine";
import { ringPhotometricProfile } from "../../../apps/showcase-iron-crown/src/game/ringPhotometry";

describe("iron crown ring photometry (A5 lab)", () => {
  it("builds a profile the spot light builder accepts", () => {
    const profile = ringPhotometricProfile(10.5);
    expect(profile.profile.candela).toHaveLength(profile.profile.verticalAngles.length);
    expect(Math.max(...profile.profile.candela)).toBeCloseTo(10.5);
    const node = lights.spot({ name: "ring", photometricProfile: profile }).toJSON();
    expect((node as { photometricProfile?: unknown }).photometricProfile).toBeDefined();
  });
});
