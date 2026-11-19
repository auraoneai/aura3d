/** Idol wow pass grounding sweep: no Duneglide Idol landmark floats over the rendered terrain. */
import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../examples/silt-and-signal-port/world";
import { createTerrain } from "../../../examples/silt-and-signal-port/terrain";

type N = { kind?: string; name?: string; position?: number[]; rotation?: number[]; scale?: number[]; children?: N[]; asset?: { bounds?: number[] } };

describe("Duneglide Idol landmarks sit on the terrain", () => {
  for (const chapter of [0, 3, 6]) {
    it(`chapter ${chapter}: every landmark's base is at or below the lowest ground under its central footprint`, () => {
      const terrain = createTerrain(chapter);
      const nodes = (buildWorld(chapter, { look: "inked" }).scene as unknown as { toJSON(): { nodes: N[] } }).toJSON().nodes;
      let checked = 0;
      for (const g of nodes) {
        const m = (g.children ?? []).find((c) => c.kind === "model" && /-idol$/.test(c.name ?? ""));
        if (g.kind !== "group" || !m || g.name === "board" || g.name === "tow-shell" || !g.position) continue;
        const sc = g.scale?.[0] ?? 1, yaw = g.rotation?.[1] ?? 0, b = m.asset?.bounds ?? [1, 1, 1];
        const base = g.position[1] + (m.position?.[1] ?? 0) * sc;
        // footprint centre of the GLB (banner masts shift their pole onto the group origin)
        const cx = (m.position?.[0] ?? 0) * sc, cz = (m.position?.[2] ?? 0) * sc;
        let lo = Infinity;
        // the central half of the footprint (banner cloth and arch spans hang over open ground by design)
        for (const fx of [-0.25, 0, 0.25]) for (const fz of [-0.25, 0, 0.25]) {
          const lx = cx + fx * b[0]! * sc, lz = cz + fz * b[2]! * sc;
          lo = Math.min(lo, terrain.surfaceHeightAt(g.position[0]! + lx * Math.cos(yaw) + lz * Math.sin(yaw), g.position[2]! - lx * Math.sin(yaw) + lz * Math.cos(yaw)));
        }
        expect(base - lo, `${g.name} floats`).toBeLessThan(0.35);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});
