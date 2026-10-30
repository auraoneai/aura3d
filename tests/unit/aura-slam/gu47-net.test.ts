/**
 * GU47 TT-M2 (net): the World Tour net is one textured strip (authored alpha tile, depth write on, 1 draw) and the tile
 * file matches the asset table and its generator.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slamTextureAssets } from "../../../examples/aura-slam/view/assets";
import { NET_MESH_ID, NET_CELL, NET_COLUMNS, NET_TILE_CELLS, NET_TILE_MEAN_ALPHA, netMeshGeometry, netMeshMaterial, netTopHeight } from "../../../examples/aura-slam/view/net";
import { buildTennisScene } from "../../../examples/aura-slam/view/scene";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { NET_POST_X } from "../../../examples/aura-slam/view/constants";
import { encodePngRgba, netAlphaPixels } from "../../../examples/aura-slam/tools/gen-textures.mjs";

type Geo = { positions: number[]; uvs: number[]; indices: number[] };
type Node = { name?: string; material?: Record<string, unknown>; castShadow?: boolean; children?: Node[] };
const flat = (nodes: Node[] = []): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);

describe("GU47 TT-M2: the World Tour net", () => {
  it("is one strip between the posts whose top follows the 4.6.1 sag (1.07 m at the posts, 0.914 m at the strap)", () => {
    const g = netMeshGeometry() as unknown as Geo;
    expect(g.positions.length / 3).toBe((NET_COLUMNS + 1) * 2);
    expect(g.indices.length).toBe(NET_COLUMNS * 6);
    const xs = g.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(-NET_POST_X, 9);
    expect(Math.max(...xs)).toBeCloseTo(NET_POST_X, 9);
    expect(netTopHeight(0)).toBeCloseTo(0.914, 9);
    expect(netTopHeight(1)).toBeCloseTo(1.07, 9);
    // Every top vertex sits under the tape (sag height minus 3 cm); every bottom vertex at 2 cm.
    for (let i = 0; i <= NET_COLUMNS; i++) {
      const t = -1 + (2 * i) / NET_COLUMNS;
      expect(g.positions[(i * 2) * 3 + 1]).toBeCloseTo(0.02, 9);
      expect(g.positions[(i * 2 + 1) * 3 + 1]).toBeCloseTo(netTopHeight(t) - 0.03, 9);
    }
  });

  it("maps UVs in metres so every square is NET_CELL wide (the tile holds NET_TILE_CELLS squares)", () => {
    const g = netMeshGeometry() as unknown as Geo;
    const tile = NET_CELL * NET_TILE_CELLS;
    const u0 = g.uvs[0]!, uEnd = g.uvs[(NET_COLUMNS * 2) * 2]!;
    expect((uEnd - u0) * tile).toBeCloseTo(NET_POST_X * 2, 9);
    // A full span holds about 264 squares (11.88 m / 4.5 cm).
    expect(Math.round(((uEnd - u0) * NET_TILE_CELLS))).toBe(Math.round((NET_POST_X * 2) / NET_CELL));
  });

  it("blends the authored tile with depth write, both faces and a tiling mip chain", () => {
    const m = netMeshMaterial() as Record<string, unknown>;
    expect(m).toMatchObject({ alphaMode: "blend", depthWrite: true, doubleSided: true, sampling: { wrap: "repeat", generateMipmaps: true } });
    expect((m.texture as { url?: string }).url).toContain("net-alpha.png");
  });

  it("replaces the merged 4.6.1 net boxes in the World Tour scene (1 draw for 1 draw, no shadow) on every venue", () => {
    for (const venue of ["hard", "grass", "moon"]) {
      const nodes = flat((buildTennisScene(createPoseRig(), { venue }).toJSON() as unknown as { nodes: Node[] }).nodes);
      const net = nodes.filter((n) => n.name === NET_MESH_ID);
      expect(net, venue).toHaveLength(1);
      expect(net[0]!.castShadow).toBe(false);
      expect(nodes.some((n) => n.name === "static-netMesh")).toBe(false);
    }
  });

  it("the committed tile matches the asset table (sha256, size) and the generator's output, mean alpha 0.34", () => {
    const def = slamTextureAssets.netAlpha as unknown as { url: string; hash: string; sizeBytes?: number };
    const bytes = readFileSync("examples/aura-slam/assets/textures/net-alpha.png");
    expect(def.hash).toBe(`sha256-${createHash("sha256").update(bytes).digest("hex")}`);
    expect(def.sizeBytes).toBe(bytes.length);
    const tile = netAlphaPixels();
    expect(Buffer.compare(encodePngRgba(tile.size, tile.size, tile.rgba), bytes)).toBe(0);
    let alpha = 0;
    for (let i = 3; i < tile.rgba.length; i += 4) alpha += tile.rgba[i]!;
    expect(alpha / (tile.rgba.length / 4) / 255).toBeCloseTo(NET_TILE_MEAN_ALPHA, 3);
    // TT-M2 "net band >= 60% of court": a black net at this mean alpha keeps 66% of the court behind it.
    expect(1 - NET_TILE_MEAN_ALPHA).toBeGreaterThanOrEqual(0.6);
  });
});
