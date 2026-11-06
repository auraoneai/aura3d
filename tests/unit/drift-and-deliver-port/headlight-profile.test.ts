import { describe, expect, it } from "vitest";
import { lights } from "@aura3d/engine";
import { HEADLIGHT } from "../../../examples/drift-and-deliver-port/lamps";
import { PROFILE_HORIZONTAL, PROFILE_VERTICAL, headlightProfile } from "../../../examples/drift-and-deliver-port/headlightProfile";

describe("gridlock courier IES low beam (5.x A5 lab flag)", () => {
  it("parses to a bilateral Type-C table the spot light accepts", () => {
    const { profile } = headlightProfile();
    expect(profile.photometricType).toBe("C");
    expect(profile.symmetry).toBe("bilateral");
    expect(profile.verticalAngles).toEqual([...PROFILE_VERTICAL]);
    expect(profile.horizontalAngles).toEqual([...PROFILE_HORIZONTAL]);
    expect(() => lights.spot({ name: "headlight", photometricProfile: headlightProfile() })).not.toThrow();
  });

  it("peaks at the authored scalar intensity and cuts off past the cone", () => {
    const { profile } = headlightProfile();
    const peak = Math.max(...profile.candela);
    expect(peak).toBeCloseTo(HEADLIGHT.intensity, 2);
    const lastRow = profile.verticalAngles.length - 1;
    for (let h = 0; h < profile.horizontalAngles.length; h++) expect(profile.candela[h * profile.verticalAngles.length + lastRow]).toBe(0);
  });
});
