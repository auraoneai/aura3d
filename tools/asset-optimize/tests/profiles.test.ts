import { describe, expect, it } from "vitest";
import { ASSET_OPTIMIZE_PROFILES, profileForRole } from "../profiles";

describe("ASSET_OPTIMIZE_PROFILES", () => {
  it("every profile has floor <= target <= ceiling", () => {
    for (const p of Object.values(ASSET_OPTIMIZE_PROFILES)) {
      if (p.id === "hdri") continue; // no geometry band
      expect(p.triangles.floor, p.id).toBeLessThanOrEqual(p.triangles.target);
      expect(p.triangles.target, p.id).toBeLessThanOrEqual(p.triangles.ceiling);
    }
  });

  it("normal maps always use UASTC", () => {
    for (const p of Object.values(ASSET_OPTIMIZE_PROFILES)) {
      if (p.textures.normal === "none") continue;
      expect(p.textures.normal, p.id).toBe("uastc");
    }
  });

  it("LOD ratios start at 1 and are strictly decreasing", () => {
    for (const p of Object.values(ASSET_OPTIMIZE_PROFILES)) {
      expect(p.lodRatios[0]).toBe(1);
      for (let i = 1; i < p.lodRatios.length; i++) expect(p.lodRatios[i]).toBeLessThan(p.lodRatios[i - 1]);
    }
  });

  it("palette only for world-chunk/prop-small, never hero roles", () => {
    expect(ASSET_OPTIMIZE_PROFILES["world-chunk"].paletteAllowed).toBe(true);
    expect(ASSET_OPTIMIZE_PROFILES["prop-small"].paletteAllowed).toBe(true);
    expect(ASSET_OPTIMIZE_PROFILES["hero-character"].paletteAllowed).toBe(false);
    expect(ASSET_OPTIMIZE_PROFILES["hero-vehicle"].paletteAllowed).toBe(false);
  });
});

describe("profileForRole", () => {
  it("maps roles to §6.2 profiles", () => {
    expect(profileForRole("hero").id).toBe("hero-character");
    expect(profileForRole("character").id).toBe("hero-character");
    expect(profileForRole("enemy").id).toBe("npc-character");
    expect(profileForRole("vehicle").id).toBe("hero-vehicle");
    expect(profileForRole("world").id).toBe("world-chunk");
    expect(profileForRole("backdrop").id).toBe("backdrop");
    expect(profileForRole("set-dressing").id).toBe("prop-small");
  });

  it("splits props at the 1 m bound", () => {
    expect(profileForRole("prop", [0.5, 0.5, 0.5]).id).toBe("prop-small");
    expect(profileForRole("prop", [2, 2, 2]).id).toBe("prop-large");
  });
});
