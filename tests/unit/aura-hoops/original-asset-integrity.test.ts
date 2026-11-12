import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBreakawayRimNode,
  buildHoopStanchionNode,
  buildPebbledBasketballNode,
  buildTemperedBackboardNode
} from "../../../apps/showcase-aura-hoops-3d/src/art/proceduralModels";
import { assets } from "../../../apps/showcase-aura-hoops-3d/src/aura-assets.route";

const ROOT = path.resolve(__dirname, "../../..");
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, "aura.assets.json"), "utf8")) as {
  assets: {
    id: string;
    type: string;
    format: string;
    url: string;
    hash: string;
    sizeBytes: number;
  }[];
};

function countFiniteVertices(node: unknown): number {
  const raw = (typeof (node as { toJSON?: unknown })?.toJSON === "function"
    ? (node as { toJSON(): Record<string, unknown> }).toJSON()
    : node) as Record<string, unknown>;
  let verts = 0;
  const geom = raw.geometry as { positions?: ArrayLike<number> } | undefined;
  if (geom?.positions) {
    for (let i = 0; i < geom.positions.length; i++) {
      expect(Number.isFinite(geom.positions[i])).toBe(true);
    }
    verts += geom.positions.length / 3;
  }
  for (const child of (raw.children as unknown[] | undefined) ?? []) {
    verts += countFiniteVertices(child);
  }
  return verts;
}

describe("Aura Hoops procedural equipment & audio route manifest integrity", () => {
  it("contains zero .glb model entries in aura-assets.route.ts and keeps all 17 audio SFX entries synced with root aura.assets.json", () => {
    const entries = Object.entries(assets as Record<string, { type: string; format: string; url: string; hash: string; sizeBytes: number }>);
    expect(entries.filter(([, entry]) => entry.type === "model" || entry.format === "glb")).toEqual([]);
    expect(entries).toHaveLength(17);
    for (const [id, entry] of entries) {
      expect(entry.type).toBe("audio");
      expect(entry.format).toBe("wav");
      const manifestMatch = MANIFEST.assets.find((item) => item.id === id);
      expect(manifestMatch, `missing ${id} in root manifest`).toBeDefined();
      expect(entry.hash).toBe(manifestMatch!.hash);
      expect(entry.sizeBytes).toBe(manifestMatch!.sizeBytes);
    }
  });

  it("builds sculpted multi-material procedural basketball, stanchion, tempered backboard, and breakaway rim with finite geometry", () => {
    expect(countFiniteVertices(buildPebbledBasketballNode({ overrides: [], radius: 0.121, checkSpotZ: 6, lookOriginal: false }))).toBeGreaterThan(150);
    expect(countFiniteVertices(buildHoopStanchionNode([], false))).toBeGreaterThan(80);
    expect(
      countFiniteVertices(
        buildTemperedBackboardNode({
          overrides: [],
          boardZ: -0.38,
          boardHalfW: 0.915,
          boardY0: 2.9,
          boardY1: 3.97,
          rimY: 3.05,
          lookOriginal: false
        })
      )
    ).toBeGreaterThan(60);
    expect(
      countFiniteVertices(
        buildBreakawayRimNode({
          overrides: [],
          rim: [0, 3.05, 0],
          rimR: 0.23,
          boardZ: -0.38,
          lookOriginal: false
        })
      )
    ).toBeGreaterThan(80);
  });
});
