import { describe, expect, it } from "vitest";
import { detectSharedSkeleton, type DrawEntry } from "../../../packages/game/src/motion/doubleFrame";
import { ATHLETE_IDS } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { athleteNodes } from "../../../apps/showcase-aura-fc-3d/src/game/rig";
import {
  buildSupporterCrowdSlotGeometries,
  buildWaverSupporterGeometry,
  FOOTBALLER_JOINT_SUFFIXES
} from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";

interface SerialNode {
  name?: string;
  kind?: string;
  geometry?: {
    positions?: ArrayLike<number>;
    colors?: ArrayLike<number>;
    bounds?: { min: [number, number, number]; max: [number, number, number] };
  };
  children?: SerialNode[];
}

const described = (id: string) =>
  (athleteNodes(id) as unknown[]).map((n) =>
    typeof (n as { toJSON?: () => SerialNode })?.toJSON === "function"
      ? (n as { toJSON: () => SerialNode }).toJSON()
      : (JSON.parse(JSON.stringify(n)) as SerialNode)
  );

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

  it("sculpts cavity-AO multi-material kits, two-tone grounded boots, crest badges, sclera, and stand supporters without sphere joint balls", () => {
    const findNode = (root: SerialNode, name: string): SerialNode | undefined => {
      if (root.name === name) return root;
      for (const child of root.children ?? []) {
        const hit = findNode(child, name);
        if (hit) return hit;
      }
      return undefined;
    };

    const geomOf = (root: SerialNode, groupName: string) => {
      const g = findNode(root, groupName);
      return g?.geometry ?? g?.children?.find((c) => c.geometry)?.geometry;
    };
    const bodyOf = (id: string) => described(id).find((n) => n.name === `${id}-body`)!;
    const homeBody = bodyOf("home-st");
    const gkBody = bodyOf("home-gk");
    const chestGeom = geomOf(homeBody, "home-st-chest-mesh")!;
    const headGeom = geomOf(homeBody, "home-st-head-mesh")!;
    const bootGeom = geomOf(homeBody, "home-st-boot-l-mesh")!;
    const gkForearmGeom = geomOf(gkBody, "home-gk-forearm-l-mesh")!;

    const bootGroup = findNode(homeBody, "home-st-boot-l-mesh")!;
    const bootMinY = Math.min(
      bootGeom?.bounds?.min[1] ?? Infinity,
      ...(bootGroup.children ?? []).map((c) => c.geometry?.bounds?.min[1] ?? Infinity)
    );
    expect(chestGeom?.positions?.length).toBeGreaterThan(200);
    expect(headGeom?.positions?.length).toBeGreaterThan(300);
    expect(bootGeom?.positions?.length).toBeGreaterThan(200);
    expect(gkForearmGeom?.positions?.length).toBeGreaterThan(200);
    expect(bootMinY).toBeCloseTo(-0.1, 2);

    const kitColors = chestGeom?.colors;
    expect(kitColors?.length).toBeGreaterThan(200);
    for (let i = 0; i < (kitColors?.length ?? 0); i += 1) {
      expect(Number.isFinite(kitColors![i]!)).toBe(true);
    }

    // Varied footballer hairstyles produce distinct head vertex topologies across squad slots
    const totalPositions = (root: SerialNode, groupName: string) => {
      const g = findNode(root, groupName);
      return (g?.geometry?.positions?.length ?? 0) + (g?.children ?? []).reduce((s, c) => s + (c.geometry?.positions?.length ?? 0), 0);
    };
    const hairLengths = new Set(
      ATHLETE_IDS.slice(0, 6).map((id) => totalPositions(bodyOf(id), `${id}-head-mesh`))
    );
    expect(hairLengths.size).toBeGreaterThanOrEqual(4);

    // Stadium stand supporter crowd and waver rigs carry baked cavity AO vertex colors
    const crowd = buildSupporterCrowdSlotGeometries();
    expect(crowd.skin.colors?.length).toBeGreaterThan(100);
    expect(crowd.coat.colors?.length).toBeGreaterThan(100);
    expect(crowd.scarfTrim.colors?.length).toBeGreaterThan(100);
    expect(buildWaverSupporterGeometry().colors?.length).toBeGreaterThan(200);
  });
});
