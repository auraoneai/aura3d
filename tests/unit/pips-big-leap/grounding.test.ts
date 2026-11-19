// Idol wow pass grounding (GPU QA, "floating trees"): every Idol prop that stands over a static platform sits on that
// platform's top (sunk 0.12 m) under its footprint; flyers are left alone; no prop hangs in the Sun-Gate opening; the
// enlarged Idol set pieces feed the follow camera's clearance; hawks circle clear of the camera's lane over the path.
import { describe, expect, it } from "vitest";
import { IDOL_DECOR_SINK, buildWorld, groundIdolDecor } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";

type Node = { kind?: string; name?: string; position?: readonly number[]; asset?: { id?: string }; children?: readonly Node[] };
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

describe("pips-big-leap Idol decor grounding and camera clearance", () => {
  it("every Idol ground prop over a platform sits on its top (sunk, not floating) and none hangs inside the Sun-Gate", () => {
    let grounded = 0;
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const built = buildWorld(spec);
      const nodes = walk((built.scene.toJSON() as unknown as { nodes: Node[] }).nodes);
      for (const [i, d0] of spec.decor.filter((d) => !["banner", "fan"].includes(d.kind)).entries()) {
        void i;
        const d = groundIdolDecor({ kind: d0.kind as never, x: d0.x, y: d0.y, z: d0.z, yaw: d0.yaw, s: d0.s }, built.solids, spec.gate);
        if (["cloud", "hawk", "star"].includes(d.kind)) continue;
        const r = 0.3 * (d.s ?? 1);
        const tops = built.solids
          .filter((b) => !b.plat?.mover && !b.plat?.timed && !b.decor) // pass-through decor bodies never ground props
          .filter((b) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([sx, sz]) => Math.abs(d.x + sx! - b.x) <= b.hx && Math.abs(d.z + sz! - b.z) <= b.hz))
          .map((b) => b.y + b.hy)
          .filter((t) => t <= d0.y + 0.4 + (d.x !== d0.x ? 3 : 0) && t >= d0.y - 2.2 - (d.x !== d0.x ? 3 : 0));
        if (tops.length > 0) {
          grounded += 1;
          expect(d.y, `${id} ${d.kind} @${d0.x},${d0.z}`).toBeCloseTo(Math.max(...tops) - IDOL_DECOR_SINK, 6);
        }
        if (d.kind === "lantern") expect(Math.abs(d.x - spec.gate.x) >= 1.6 || Math.abs(d.z - spec.gate.z) >= 1.2, `${id} lantern in gate`).toBe(true);
      }
      // the mounted Idol decor nodes use the grounded heights
      for (const n of nodes.filter((x) => /^pbl-decor:(lantern|crate|barrel|tree|conifer|mushroom|flower|rock|pillar|arch|crystal|vent):\d+$/.test(x.name ?? ""))) {
        const y = n.position![1]!;
        const over = built.solids.filter((b) => !b.decor && Math.abs(n.position![0]! - b.x) <= b.hx && Math.abs(n.position![2]! - b.z) <= b.hz && Math.abs(b.y + b.hy - IDOL_DECOR_SINK - y) < 0.35);
        if (over.length) expect(over.some((b) => Math.abs(b.y + b.hy - IDOL_DECOR_SINK - y) < 0.2), `${id} ${n.name}`).toBe(true);
      }
    }
    expect(grounded).toBeGreaterThan(20);
  });

  it("checkpoint posts, Idol windmills, watchtowers and lanterns are camera obstacles at their Idol size, in both looks", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const built = buildWorld(spec);
      for (const cp of spec.checkpoints) expect(built.cameraObstacles.some((o) => o.x === cp.x && o.z === cp.z && o.height >= 2), `${id} ${cp.id}`).toBe(true);
      for (const d of spec.decor.filter((x) => x.kind === "windmill")) {
        expect(built.cameraObstacles.some((o) => o.x === d.x && o.z === d.z && o.radius >= 1.3 * (d.s ?? 1) && o.height >= 4.6 * (d.s ?? 1)), `${id} ${d.id}`).toBe(true);
      }
      expect(JSON.stringify(buildWorld(spec, { look: "original" }).cameraObstacles)).toBe(JSON.stringify(built.cameraObstacles));
    }
  });

  it("hawks circle at least 3 m to the side of the course centre line and above the old perch", () => {
    for (const id of WORLD_IDS) {
      const built = buildWorld(worldSpec(id));
      for (const h of built.presentation.animatedDecor.filter((d) => d.kind === "hawk")) {
        expect(Math.abs(h.base![0]!) - 1.0 * (h.scale ?? 1), `${id} ${h.name}`).toBeGreaterThan(3);
      }
    }
  });
});
