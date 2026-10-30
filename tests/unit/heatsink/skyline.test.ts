/**
 * Thermal Drift parallax skyline (GU47 WP-13 HS-04): three layers at 180/300/450 m per circuit, <= 9 instanced draws,
 * unshadowed, deterministic, and a distinct silhouette family per circuit.
 */
import { describe, expect, it } from "vitest";
import { buildThermalDriftScene } from "../../../apps/showcase-heatsink/src/scene";
import { CIRCUIT_ORDER, CIRCUITS } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS } from "../../../apps/showcase-heatsink/src/look";
import { SKYLINE_ROAD_GAP_DEG, skylineLayout, skylineNodes } from "../../../apps/showcase-heatsink/src/skyline";

type Node = { kind: string; name?: string; castShadow?: boolean; receiveShadow?: boolean; instances?: unknown[]; children?: Node[] };
const flatten = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);

describe("heatsink skyline", () => {
  it("has three layers at 180, 300 and 450 m on every circuit", () => {
    for (const id of CIRCUIT_ORDER) expect(CIRCUITS[id].skyline.map((l) => l.distance), id).toEqual([180, 300, 450]);
  });

  it("costs at most 9 instanced draws per circuit, none of them shadowed", () => {
    for (const id of CIRCUIT_ORDER) {
      const nodes = flatten((buildThermalDriftScene({ circuit: CIRCUITS[id] }).toJSON() as unknown as { nodes: Node[] }).nodes)
        .filter((n) => String(n.name).startsWith("td skyline"));
      expect(nodes.length, id).toBeLessThanOrEqual(9);
      expect(nodes.length, id).toBe(skylineNodes(CIRCUITS[id], CIRCUIT_LOOKS[id]).length);
      for (const n of nodes) {
        expect(Array.isArray(n.instances) && n.instances.length > 0, n.name).toBe(true);
        expect(n.castShadow, n.name).toBe(false);
        expect(n.receiveShadow, n.name).toBe(false);
      }
    }
  });

  it("is deterministic and keeps the nearest layer off the far road", () => {
    const layer = CIRCUITS.grand.skyline[0]!;
    expect(skylineLayout(layer, true)).toEqual(skylineLayout(layer, true));
    for (const piece of skylineLayout(layer, true)) {
      const angle = Math.abs((Math.atan2(piece.x, -piece.z) * 180) / Math.PI);
      expect(angle).toBeGreaterThanOrEqual(SKYLINE_ROAD_GAP_DEG - 1e-9);
    }
  });

  it("gives each circuit its own silhouette family (towers, stacks and cooling blocks, spires)", () => {
    const stats = (id: (typeof CIRCUIT_ORDER)[number]) => {
      const pieces = CIRCUITS[id].skyline.flatMap((l, i) => skylineLayout(l, i === 0));
      return {
        meanHeight: pieces.reduce((s, p) => s + p.height, 0) / pieces.length,
        meanWidth: pieces.reduce((s, p) => s + p.width, 0) / pieces.length,
        spires: pieces.filter((p) => p.spire).length / pieces.length
      };
    };
    const grand = stats("grand"), dust = stats("dustfall"), vesper = stats("vesper");
    expect(grand.meanHeight).toBeGreaterThan(dust.meanHeight);
    expect(dust.meanWidth).toBeGreaterThan(vesper.meanWidth);
    expect(vesper.spires).toBeGreaterThan(grand.spires);
  });
});
