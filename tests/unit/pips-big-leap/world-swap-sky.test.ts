// Full-run GPU audit (2026-11-19): autoplay reached Starfall Garden by a world swap and the production renderer died
// (RENDERER_MOUNT_FAILED: "Environment scene capture requires float color buffers"), blank for the rest of the session.
// The trigger is an engine sky node mounted by a swap; no world may mount one, and w6 draws its stars as an instanced
// dome above the course instead.
import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS, WORLD_LOOKS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { STAR_DOME_MAX, STAR_DOME_RADIUS, courseBounds, starDomeTransforms } from "../../../apps/showcase-pips-big-leap/src/game/diorama";

type Node = { kind?: string; name?: string; children?: readonly Node[]; instances?: readonly { position?: readonly number[]; scale?: number }[] };
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

describe("pips-big-leap world swaps never mount an engine sky node", () => {
  it("no world (either look) carries a node of kind sky", () => {
    for (const id of WORLD_IDS) {
      for (const look of ["diorama", "original"] as const) {
        const nodes = walk((buildWorld(worldSpec(id), { look } as never).scene.toJSON() as unknown as { nodes: Node[] }).nodes);
        expect(nodes.filter((n) => n.kind === "sky").map((n) => n.name), `${id}/${look}`).toEqual([]);
      }
    }
  });

  it("w6 still draws a star dome: one instanced node, every star on the upper sky well above and around the course", () => {
    const nodes = walk((buildWorld(worldSpec("w6")).scene.toJSON() as unknown as { nodes: Node[] }).nodes);
    const dome = nodes.filter((n) => n.name === "pbl-sky");
    expect(dome).toHaveLength(1);
    const stars = dome[0]!.instances ?? [];
    expect(stars.length).toBeGreaterThan(200);
    expect(stars.length).toBeLessThanOrEqual(STAR_DOME_MAX);
    const b = courseBounds(worldSpec("w6"));
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    for (const s of stars) {
      const [x, y, z] = s.position as [number, number, number];
      const r = Math.hypot(x - cx, y - b.floorY, z - cz);
      expect(Math.abs(r - STAR_DOME_RADIUS)).toBeLessThan(1e-6);
      // Elevation >= 6 deg: never below the horizon or inside the diorama.
      expect(y - b.floorY).toBeGreaterThan(STAR_DOME_RADIUS * 0.1);
    }
    expect(WORLD_LOOKS.w6.sky?.model).toBe("gradient");
  });

  it("star placement is deterministic", () => {
    expect(starDomeTransforms(300)).toEqual(starDomeTransforms(300));
    expect(starDomeTransforms(5000)).toHaveLength(STAR_DOME_MAX);
  });
});
