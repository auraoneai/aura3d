import { describe, expect, it } from "vitest";
import { islandHeight, PAD_Y, RING_COUNT } from "../../../../apps/showcase-patrol-wing/src/gameplay/course-data";
import { buildPatrolScene, buildTerrainGeometry, DRONE_NODE_COUNT, ORB_NODE_COUNT } from "../../../../apps/showcase-patrol-wing/src/scene";

/**
 * B5 port pins for the fresh single-path scene builder: the same builder
 * runs headless here and in the browser (src/main.ts mounts its output).
 * Terrain is triangulated fresh from the extracted course data, and every
 * runtime node the frame loop re-poses is pre-registered at build time.
 */
describe("patrol wing fresh scene builder (B5 port)", () => {
  it("builds the browser scene headless with every runtime node registered", () => {
    const snapshot = buildPatrolScene().toJSON();
    const names = snapshot.nodes.map((n) => (n as { name?: string }).name ?? "");
    expect(names).toContain("island-terrain");
    expect(names).toContain("ocean");
    expect(names).toContain("landing-pad");
    expect(names).toContain("patrol-plane");
    expect(names).toContain("patrol-ghost");
    expect(names).toContain("next-ring-beacon");
    for (let i = 0; i < RING_COUNT; i += 1) expect(names).toContain(`ring-${i}`);
    for (let i = 0; i < DRONE_NODE_COUNT; i += 1) expect(names).toContain(`drone-${i}`);
    for (let i = 0; i < ORB_NODE_COUNT; i += 1) expect(names).toContain(`orb-${i}`);
  });

  it("triangulates terrain from the extracted height data (pad plateau, peak, shoreline)", () => {
    const terrain = buildTerrainGeometry();
    expect(terrain.positions.length).toBeGreaterThan(1000);
    expect(terrain.indices.length % 3).toBe(0);
    expect(terrain.indices.length).toBeGreaterThan(0);
    // Every index addresses a real vertex with a unit normal.
    for (const index of terrain.indices) {
      expect(index).toBeLessThan(terrain.positions.length);
    }
    for (const n of terrain.normals) {
      const len = Math.hypot(n[0], n[1], n[2]);
      expect(Math.abs(len - 1) < 1e-6 || len === 0).toBe(true);
    }
    // Vertex heights are the extracted surface, verbatim: the pad vertex
    // sits on the plateau and the centre vertex on the peak.
    const heightAt = (x: number, z: number): number => {
      let best: readonly [number, number, number] | undefined;
      let bestDist = Infinity;
      for (const p of terrain.positions) {
        const d = Math.hypot(p[0] - x, p[2] - z);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      return best![1];
    };
    expect(Math.abs(heightAt(0, 17) - PAD_Y)).toBeLessThan(0.6);
    expect(heightAt(0, 0)).toBeGreaterThan(PAD_Y + 3);
    expect(heightAt(0, 0)).toBeCloseTo(islandHeight(0, 0), 0);
  });
});
