/**
 * Thermal Drift HS-02 local lights: headlight spot, gantry sodium lamps and tunnel strips, all unshadowed, inside the
 * art-direction practicals cap (6 non-key lights) on every circuit, each with a runtime handle main.ts can move.
 */
import { describe, expect, it } from "vitest";
import { CIRCUITS, SCENERY_ANCHORS } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS } from "../../../apps/showcase-heatsink/src/look";
import { buildThermalDriftScene, HEADLIGHT_DIRECTION, HEADLIGHT_ID, localLightSpecs } from "../../../apps/showcase-heatsink/src/scene";

type Node = { kind: string; name?: string; light?: string; shadow?: unknown; runtime?: { id?: string }; children?: Node[] };
const flatten = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
const lightsOf = (id: keyof typeof CIRCUITS) =>
  flatten((buildThermalDriftScene({ circuit: CIRCUITS[id] }).toJSON() as unknown as { nodes: Node[] }).nodes).filter((n) => n.kind === "light");

describe("heatsink HS-02 local lights", () => {
  for (const id of ["grand", "dustfall", "vesper"] as const) {
    it(`${id}: one shadowed key, at most 6 non-key lights, every local light unshadowed`, () => {
      const all = lightsOf(id);
      expect(all.filter((l) => l.shadow && l.shadow !== false)).toHaveLength(1);
      expect(all.length - 1).toBeLessThanOrEqual(6);
      const local = all.filter((l) => l.light === "spot" || l.light === "point" || l.light === "rect");
      expect(local).toHaveLength(1 + localLightSpecs(CIRCUIT_LOOKS[id]).length);
      for (const l of local) expect(l.shadow ?? false, l.name).toBeFalsy();
      expect(local.filter((l) => l.light === "spot")).toHaveLength(1);
      expect(local.filter((l) => l.light === "rect")).toHaveLength(2);
    });
  }
  it("anchors every light to a real scenery anchor and uses a unit headlight direction", () => {
    const anchorIds = new Set(SCENERY_ANCHORS.map((a) => a.id));
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      for (const spec of localLightSpecs(CIRCUIT_LOOKS[id])) expect(anchorIds.has(spec.anchorId), spec.id).toBe(true);
    }
    expect(Math.hypot(...HEADLIGHT_DIRECTION)).toBeCloseTo(1, 10);
    expect(HEADLIGHT_DIRECTION[2]).toBeLessThan(-0.99);
    expect(HEADLIGHT_ID).toBe("td-drone-headlight");
  });
  it("VESPER trades the sodium pair for one centre lamp (its up-fill takes the sixth slot)", () => {
    expect(localLightSpecs(CIRCUIT_LOOKS.vesper).filter((s) => s.kind === "sodium")).toHaveLength(1);
    expect(localLightSpecs(CIRCUIT_LOOKS.grand).filter((s) => s.kind === "sodium")).toHaveLength(2);
  });
});
