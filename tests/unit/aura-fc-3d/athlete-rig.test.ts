import { describe, expect, it } from "vitest";
import { detectSharedSkeleton, type DrawEntry } from "../../../packages/game/src/motion/doubleFrame";
import { ATHLETE_IDS } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { athleteNodes } from "../../../apps/showcase-aura-fc-3d/src/game/rig";

/**
 * Double-frame guard: an athlete is exactly one skinned body (plus its contact shadow and team ring). The overlay kit
 * boxes and procedural limbs that used to ride a second, procedural pose beside the real skeleton are gone, and no two
 * meshes share a skeleton.
 */
/** Node builders serialise to their node description. */
const described = (id: string) => (athleteNodes(id) as unknown[]).map((n) => JSON.parse(JSON.stringify(n)) as { name: string; kind: string });

describe("athlete rig is one skinned body, no second pose", () => {
  it("every athlete has exactly body + shadow + ring", () => {
    expect(ATHLETE_IDS.length).toBeGreaterThanOrEqual(10);
    for (const id of ATHLETE_IDS) {
      const nodes = described(id);
      expect(nodes.map((n) => n.name).sort()).toEqual([`${id}-body`, `${id}-ring`, `${id}-shadow`]);
      expect(nodes.filter((n) => n.kind === "model")).toHaveLength(1);
    }
  });

  it("the library double-frame detector finds no two meshes on one skeleton across all athletes", () => {
    const draws: DrawEntry[] = [];
    for (const id of ATHLETE_IDS) {
      for (const n of described(id)) {
        if (n.kind === "model") draws.push({ meshId: n.name, skeletonId: `${id}:skeleton` });
      }
    }
    expect(detectSharedSkeleton(draws)).toEqual([]);
  });

  it("no procedural limb, sock, shorts or torso nodes remain in the rig source", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("apps/showcase-aura-fc-3d/src/game/rig.ts", "utf8");
    expect(src).not.toMatch(/-sock-|-shorts|-torso|-uarm|-thigh|-shin|-shoe|solveArm|runTargets|kickTargets/);
  });
});
