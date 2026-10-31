// GU47 WP-22 (lane g12) SS47-M2: CC0 detail maps on the island turf, sand and wet-rock lip; flat by default since GU47 phase 2 (opt in with ?surfaces=1).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";

const DIR = resolve(__dirname, "../../../apps/showcase-slingshot-siege/src/assets/textures");
type Node = { name?: string; material?: Record<string, unknown>; children?: readonly Node[]; [key: string]: unknown };
const walk = (nodes: readonly unknown[]): Node[] => nodes.flatMap((n) => {
  const node = (typeof (n as { toJSON?: unknown }).toJSON === "function" ? (n as { toJSON(): Node }).toJSON() : n) as Node;
  return [node, ...walk(node.children ?? [])];
});
const island = (surfaceMaps?: boolean) => {
  const nodes = walk(buildStage(CHAPTERS[0]!, { reducedMotion: false, ...(surfaceMaps === undefined ? {} : { surfaceMaps }) }).nodes);
  return ["stage-ground", "stage-ground-rim", "stage-far-ground"].map((name) => nodes.find((n) => n.name === name)!);
};

describe("slingshot-siege island surfaces (SS47-M2)", () => {
  it("puts a normal and a roughness map on turf, wet-rock lip and sand on ?surfaces=1, with no colour map", () => {
    for (const node of island(true)) {
      expect(node, "island disc").toBeDefined();
      const json = JSON.stringify(node.material);
      expect(json).toMatch(/siege-(turf|sand|wetrock)-normal/);
      expect(json).toMatch(/siege-(turf|sand|wetrock)-roughness/);
      expect(json).not.toMatch(/color\.jpg/i);
    }
  });

  it("drops every map by default and on ?surfaces=0 (GU47 phase 2: the mapped turf read white)", () => {
    for (const node of [...island(), ...island(false)]) expect(JSON.stringify(node.material)).not.toMatch(/siege-.*\.jpg/);
  });

  it("ships CC0 maps within budget, each hashed in PROVENANCE.md", () => {
    const provenance = readFileSync(resolve(DIR, "PROVENANCE.md"), "utf8");
    expect(provenance).toMatch(/CC0 1\.0/);
    const files = readdirSync(DIR).filter((f) => f.endsWith(".jpg"));
    expect(files).toHaveLength(6);
    let total = 0;
    for (const file of files) {
      const bytes = readFileSync(resolve(DIR, file));
      total += bytes.length;
      expect(provenance).toContain(createHash("sha256").update(bytes).digest("hex"));
    }
    expect(total).toBeLessThan(512 * 1024);
    expect(existsSync(resolve(DIR, "siege-turf-color.jpg"))).toBe(false);
  });
});
