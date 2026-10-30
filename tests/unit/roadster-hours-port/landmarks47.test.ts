import { describe, expect, it } from "vitest";
import { LEVELS } from "../../../examples/roadster-hours-port/course";
import { LANDMARK_KINDS, landmarkPlacements, rotorAngle, type LandmarkKind } from "../../../examples/roadster-hours-port/art/landmarks";
import { bladeMatrix, buildWorld } from "../../../examples/roadster-hours-port/world";

const names = (i: number, mode: "gu47" | "original" = "gu47"): string[] => {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") { const o = v as Record<string, unknown>; if (typeof o.name === "string" && "kind" in o) out.push(o.name); Object.values(o).forEach(walk); }
  };
  walk(buildWorld(i, mode).scene.toJSON());
  return out;
};

describe("Saltwind Highway landmarks (RH47-11, RH47-15)", () => {
  it("lists >= 4 landmark kinds per route and mounts them as instanced nodes", () => {
    for (const kinds of Object.values(LANDMARK_KINDS)) expect(kinds.length).toBeGreaterThanOrEqual(4);
    expect(names(0)).toEqual(expect.arrayContaining(["turbine-towers", "turbine-nacelles", "turbine-rotors", "sea-stacks"]));
    expect(names(1)).toEqual(expect.arrayContaining(["mesas", "hoodoos", "arch", "uplink-masts"]));
    expect(names(2)).toEqual(expect.arrayContaining(["towers", "antenna-masts", "antenna-beacons", "tube-rings", "city-carpet"]));
    expect(names(0, "original")).not.toContain("turbine-towers");
  });

  it("every landmark stands off the road (outside the guardrails) except the tube rings over it", () => {
    const kinds: LandmarkKind[] = ["turbine", "sea-stack", "mesa", "hoodoo", "arch", "uplink-mast", "antenna"];
    for (const level of LEVELS) for (const kind of kinds) {
      for (const p of landmarkPlacements(kind, level.length, level.width, -1, level.seed)) {
        expect(Math.abs(p.l) - p.size[0] / 2).toBeGreaterThan(level.width + 1);
      }
    }
    const rings = landmarkPlacements("tube-ring", 3300, 11, -1, 913);
    expect(rings.length).toBeGreaterThan(10);
    for (const r of rings) expect(r.size[0]).toBeGreaterThan(2 * 11);
    // deterministic
    expect(landmarkPlacements("turbine", 2800, 11, -1, 371)).toEqual(landmarkPlacements("turbine", 2800, 11, -1, 371));
  });

  it("rotors advance with time and slow to 30% on reduced motion", () => {
    expect(rotorAngle(2, 0)).toBeGreaterThan(rotorAngle(1, 0));
    expect(rotorAngle(2, 0, true) - rotorAngle(1, 0, true)).toBeCloseTo((rotorAngle(2, 0) - rotorAngle(1, 0)) * 0.3, 9);
    const a = bladeMatrix([0, 50, 0], 0), b = bladeMatrix([0, 50, 0], Math.PI / 2);
    expect(a[13]).toBeCloseTo(61, 6); // blade up: centre 11 m above the hub
    expect(b[14]).toBeCloseTo(11, 6); // a quarter turn later it points along +z
  });
});
