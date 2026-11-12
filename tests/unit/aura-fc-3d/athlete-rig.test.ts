import { describe, expect, it } from "vitest";
import { detectSharedSkeleton, type DrawEntry } from "../../../packages/game/src/motion/doubleFrame";
import { ATHLETE_IDS } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { athleteNodes } from "../../../apps/showcase-aura-fc-3d/src/game/rig";
import { FOOTBALLER_JOINT_SUFFIXES } from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";

interface SerialNode {
  name?: string;
  kind?: string;
  children?: SerialNode[];
}

const described = (id: string) =>
  (athleteNodes(id) as unknown[]).map((n) => JSON.parse(JSON.stringify(n)) as SerialNode);

function flatNames(node: SerialNode): string[] {
  return [node.name ?? "", ...(node.children ?? []).flatMap(flatNames)].filter(Boolean);
}

describe("athlete rig is one sculpted multi-material articulated body, no second pose or Meshy GLB", () => {
  it("every athlete has exactly body (articulated group) + shadow + ring, with all 13 anatomical joints", () => {
    expect(ATHLETE_IDS.length).toBeGreaterThanOrEqual(10);
    for (const id of ATHLETE_IDS) {
      const nodes = described(id);
      expect(nodes.map((n) => n.name).sort()).toEqual([`${id}-body`, `${id}-ring`, `${id}-shadow`]);
      expect(nodes.filter((n) => n.kind === "model")).toHaveLength(0);
      const body = nodes.find((n) => n.name === `${id}-body`)!;
      expect(body.kind).toBe("group");
      const names = new Set(flatNames(body));
      for (const suffix of FOOTBALLER_JOINT_SUFFIXES) {
        expect(names.has(`${id}-${suffix}`)).toBe(true);
      }
    }
  });

  it("the library double-frame detector finds no two rigs sharing one skeleton across all athletes", () => {
    const draws: DrawEntry[] = [];
    for (const id of ATHLETE_IDS) {
      for (const n of described(id)) {
        if (n.name === `${id}-body`) draws.push({ meshId: n.name!, skeletonId: `${id}:skeleton` });
      }
    }
    expect(detectSharedSkeleton(draws)).toEqual([]);
  });

  it("no legacy overlay limb, sock, shorts or torso nodes remain in rig.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("apps/showcase-aura-fc-3d/src/game/rig.ts", "utf8")
      .split("\n")
      .filter((line) => !/^\s*\{?\s*target:\s*\//.test(line))
      .join("\n");
    expect(src).not.toMatch(/-sock-|-shorts|-torso|-uarm|-thigh|-shin|-shoe|solveArm|runTargets|kickTargets/);
    expect(src).not.toMatch(/\bmodel\s*\(/);
  });
});
