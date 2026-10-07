/**
 * PRD-10 Phase 5 (T5.1–T5.7) — kits / spline / extrude / placement / room /
 * street contract tests.
 *
 * Gates asserted here:
 *  - spline: arc-length accuracy, frame orthonormality (rotation-minimizing),
 *    banking roll, closestT round-trip;
 *  - extrude: named profiles, UVs in metres, conformToTerrain mutating the
 *    terrain height grid + bumping gridVersion;
 *  - kits: defineKit validation, cell→position math, rotationSteps matrices,
 *    snapTo sockets, seeded fill determinism, one scatter node per asset,
 *    piece practical lights;
 *  - placeAlong/placeGrid/placePoisson: spacing, side/offset, exclude, ground,
 *    min-distance, deterministic checksums;
 *  - room/street: wall splitting around openings, lintels, floor fill,
 *    dressing + practical lights, road+sidewalk+marking+building emission;
 *  - content bake: on-disk assets match the manifest sha256 records.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AuraScatterNode } from "../../../../packages/engine/src/agent-api/world/scatter";
import {
  defineKit,
  world,
  worldExtrude,
  worldPlaceAlong,
  worldPlaceGrid,
  worldPlacePoisson,
  worldRoom,
  worldSpline,
  worldStreet,
  worldTerrain,
  type AuraKitDefinition
} from "../../../../packages/engine/src/agent-api/world/index";
import { terrainRecordFor } from "../../../../packages/engine/src/agent-api/world/terrain";

const mat = { type: "pbr", color: "#888888" } as never;

const square = (r: number): [number, number, number][] => [[-r, 0, -r], [r, 0, -r], [r, 0, r], [-r, 0, r]];

const scatterNodes = (nodes: readonly unknown[]): AuraScatterNode[] =>
  nodes.filter((n): n is AuraScatterNode => (n as AuraScatterNode).kind === "scatter");

const matricesOf = (n: AuraScatterNode): Float32Array => {
  const p = n.placements;
  if (!p) throw new Error(`scatter node ${n.id} carries no placements`);
  return p.matrices;
};

const posAt = (m: Float32Array, i: number): [number, number, number] =>
  [m[i * 12 + 3]!, m[i * 12 + 7]!, m[i * 12 + 11]!];

describe("prd10 spline (T5.2)", () => {
  it("reports arc length ≈ perimeter for a closed square", () => {
    const s = worldSpline(square(10), { closed: true });
    expect(s.length).toBeGreaterThan(76);
    expect(s.length).toBeLessThan(86); // catmull-rom rounds/bulges corners slightly
  });
  it("pointAt(0) and pointAt(1) land on the endpoints of an open spline", () => {
    const s = worldSpline([[0, 0, 0], [10, 0, 0], [10, 0, 10]]);
    expect(s.pointAt(0)).toEqual([0, 0, 0]);
    const end = s.pointAt(1);
    expect(end[0]).toBeCloseTo(10, 5);
    expect(end[2]).toBeCloseTo(10, 5);
  });
  it("frames are orthonormal and rotation-minimizing on a straight line", () => {
    const s = worldSpline([[0, 0, 0], [50, 0, 0]]);
    for (const t of [0.1, 0.5, 0.9]) {
      const f = s.frameAt(t);
      const dru = f.right[0] * f.up[0] + f.right[1] * f.up[1] + f.right[2] * f.up[2];
      const drf = f.right[0] * f.forward[0] + f.right[1] * f.forward[1] + f.right[2] * f.forward[2];
      const duf = f.up[0] * f.forward[0] + f.up[1] * f.forward[1] + f.up[2] * f.forward[2];
      expect(Math.abs(dru)).toBeLessThan(1e-4);
      expect(Math.abs(drf)).toBeLessThan(1e-4);
      expect(Math.abs(duf)).toBeLessThan(1e-4);
      // rotation-minimizing on a straight path: up stays +y
      expect(f.up[1]).toBeGreaterThan(0.999);
    }
  });
  it("applies banking roll around the tangent", () => {
    const s = worldSpline([[0, 0, 0], [50, 0, 0]], { bankDeg: [90] });
    const f = s.frameAt(0.5);
    // 90° roll: frame up points along +z (or -z), not +y
    expect(Math.abs(f.up[1])).toBeLessThan(0.01);
    expect(Math.abs(f.up[2])).toBeGreaterThan(0.99);
  });
  it("closestT round-trips a sampled point", () => {
    const s = worldSpline([[0, 0, 0], [10, 0, 5], [20, 0, 0]]);
    const p = s.pointAt(0.62);
    expect(Math.abs(s.closestT(p) - 0.62)).toBeLessThan(0.02);
  });
  it("rejects degenerate inputs", () => {
    expect(() => worldSpline([[0, 0, 0]])).toThrow(/at least two/);
    expect(() => worldSpline(square(4), { closed: true })).not.toThrow();
    expect(() => worldSpline([[0, 0, 0], [1, 0, 0]], { closed: true })).toThrow(/three control points/);
  });
});

describe("prd10 extrude (T5.3)", () => {
  it("emits a custom primitive node with metre UVs", () => {
    const s = worldSpline([[0, 0, 0], [40, 0, 0]]);
    const node = worldExtrude(s, { profile: "road-2-lane", material: mat, uv: { vMetersPerTile: 8 } }) as never as {
      kind: string; primitive: string; geometry: { positions: unknown[]; indices: number[]; uvs?: number[] };
    };
    expect(node.kind).toBe("primitive");
    expect(node.primitive).toBe("custom");
    expect(node.geometry.indices.length % 3).toBe(0);
    expect(node.geometry.uvs).toBeDefined();
    const uvs = node.geometry.uvs!;
    const maxV = Math.max(...uvs.filter((_, i) => i % 2 === 1));
    expect(maxV).toBeCloseTo(s.length / 8, 1); // v = arc-length / vMetersPerTile
  });
  it("conformToTerrain flattens the height grid under the spline", () => {
    const heights = new Float32Array(33 * 33).fill(0.5);
    worldTerrain({
      id: "extrude-terrain",
      size: [64, 64],
      heightScale: 20,
      height: { kind: "array", columns: 33, rows: 33, heights },
      layers: [{ name: "ground" }]
    });
    const s = worldSpline([[4, 3, 32], [60, 3, 32]]);
    worldExtrude(s, {
      profile: "road-2-lane",
      material: mat,
      conformToTerrain: { terrain: "extrude-terrain", falloff: 6 }
    });
    // centre of the strip (x=32, z=32) flattens to the spline height (y=3)
    const mid = 16 * 33 + 16;
    expect(heights[mid]! * 20).toBeCloseTo(3, 3);
    // a far-off cell is untouched
    const far = 4 * 33 + 4;
    expect(heights[far]!).toBeCloseTo(0.5, 5);
    expect(terrainRecordFor("extrude-terrain")!.gridVersion).toBe(1);
  });
  it("rejects unknown profiles and degenerate splines", () => {
    const s = worldSpline([[0, 0, 0], [10, 0, 0]]);
    expect(() => worldExtrude(s, { profile: "nope" as never, material: mat })).toThrow(/unknown profile/);
  });
});

describe("prd10 kits (T5.1)", () => {
  const kitDef: AuraKitDefinition = {
    id: "test-kit",
    license: "CC0-1.0",
    gridSize: 4,
    pieces: [
      {
        id: "block",
        asset: { type: "model", format: "glb", url: "test/block.glb" } as never,
        footprint: [4, 4],
        sockets: { out: { position: [4, 0, 0] }, top: { position: [0, 3, 0] } },
        lights: [{ socket: "top", light: "point", intensity: 1, distance: 10 }]
      },
      {
        id: "wing",
        asset: { type: "model", format: "glb", url: "test/wing.glb" } as never,
        footprint: [8, 2]
      }
    ]
  };

  it("validates definition inputs", () => {
    expect(() => defineKit({ ...kitDef, license: "" })).toThrow(/license/);
    expect(() => defineKit({ ...kitDef, pieces: [...kitDef.pieces, kitDef.pieces[0]!] })).toThrow(/duplicate/);
    expect(() => defineKit({ ...kitDef, pieces: [] })).toThrow(/at least one/);
    const k = defineKit(kitDef);
    expect(() => k.piece("nope")).toThrow(/no piece/);
  });

  it("cell placements resolve to origin + cell*gridSize", () => {
    const kit = defineKit(kitDef);
    const { nodes, instanceCount } = kit.place([
      { piece: "block", cell: [0, 0] },
      { piece: "block", cell: [2, 1] }
    ], { origin: [100, 0, 200] });
    expect(instanceCount).toBe(2);
    const scatters = scatterNodes(nodes);
    expect(scatters).toHaveLength(1); // one scatter node per unique asset
    const m = matricesOf(scatters[0]!);
    expect(posAt(m, 0)).toEqual([100, 0, 200]);
    expect(posAt(m, 1)).toEqual([108, 0, 204]);
  });

  it("rotationSteps produce quarter-turn basis changes", () => {
    const kit = defineKit(kitDef);
    const { nodes } = kit.place([
      { piece: "block", position: [0, 0, 0], rotationSteps: 0 },
      { piece: "block", position: [0, 0, 0], rotationSteps: 1 }
    ]);
    const m = matricesOf(scatterNodes(nodes)[0]!);
    // row0 = rotated x-axis basis; step 1 (90°) gives (0,0,+1) — the scatter
    // yaw convention shared with packScatterPlacement
    expect(m[0]).toBeCloseTo(1, 6);
    expect(m[2]).toBeCloseTo(0, 6);
    expect(m[12 + 0]).toBeCloseTo(0, 6);
    expect(Math.abs(m[12 + 2]!)).toBeCloseTo(1, 6);
  });

  it("snapTo sockets chain placements", () => {
    const kit = defineKit(kitDef);
    const { nodes } = kit.place([
      { piece: "block", position: [10, 0, 10] },
      { piece: "wing", position: [0, 0, 0], snapTo: { target: "block", socket: "out" } }
    ]);
    const wing = scatterNodes(nodes).find((n) => n.placements?.asset.url === "test/wing.glb")!;
    const m = matricesOf(wing);
    // wing has no sockets → its origin sits at the host socket world position
    expect(posAt(m, 0)).toEqual([14, 0, 10]);
  });

  it("piece lights emit practical light nodes", () => {
    const kit = defineKit(kitDef);
    const { nodes } = kit.place([{ piece: "block", position: [5, 0, 5] }]);
    const light = nodes.find((n) => (n as { kind: string }).kind === "light") as { position: number[]; light: string } | undefined;
    expect(light).toBeDefined();
    expect(light!.light).toBe("point");
    expect(light!.position).toEqual([5, 3, 5]); // 'top' socket world position
  });

  it("fill is deterministic, weighted, and skips excluded regions", () => {
    const kit = defineKit(kitDef);
    const shape = { kind: "circle", center: [0, 0] as const, radius: 40 } as const;
    const exclude = [{ kind: "circle", center: [0, 0] as const, radius: 10 } as const];
    const a = kit.fill({ shape }, { density: 0.8, seed: 9, exclude });
    const b = kit.fill({ shape }, { density: 0.8, seed: 9, exclude });
    expect(a.checksum).toBe(b.checksum);
    expect(a.instanceCount).toBeGreaterThan(0);
    const m = matricesOf(scatterNodes(a.nodes)[0]!);
    for (let i = 0; i < m.length / 12; i += 1) {
      const [x, , z] = posAt(m, i);
      expect(Math.hypot(x, z)).toBeGreaterThan(10); // excluded
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(40 + 1e-6);
    }
  });

  it("world.kits ships the four §6.6 kits with licensed pieces", () => {
    for (const id of ["city", "interior", "trackside", "space"] as const) {
      const kit = world.kits[id];
      expect(kit.definition.license).toBe("CC0-1.0");
      expect(kit.definition.pieces.length).toBeGreaterThan(3);
      for (const p of kit.definition.pieces) {
        expect(p.asset.url).toMatch(/^world\/kits\//);
      }
    }
  });
});

describe("prd10 placement (T5.4)", () => {
  const asset = (id: string) => ({ type: "model", format: "glb", url: `test/${id}.glb` }) as never;

  it("placeAlong spaces instances at arc-length intervals on the side offset", () => {
    const s = worldSpline([[0, 0, 0], [100, 0, 0]]);
    const { nodes, instanceCount } = worldPlaceAlong(s, asset("lamp"), { spacing: 25, offset: 3, side: "right", seed: 1 });
    expect(instanceCount).toBe(5); // stations at s = 0, 25, 50, 75, 100 (inclusive)
    const m = matricesOf(scatterNodes(nodes)[0]!);
    const xs = [...Array(m.length / 12)].map((_, i) => posAt(m, i)[0]).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(25, 0);
    // right side of a +x-running path is -z (right = up × forward)
    expect(Math.abs(posAt(m, 0)[2]!)).toBeCloseTo(3, 4);
  });

  it("alignToTangent writes the spline basis into the matrix", () => {
    const s = worldSpline([[0, 0, 0], [50, 0, 0]]);
    const { nodes } = worldPlaceAlong(s, asset("post"), { spacing: 50, alignToTangent: true, seed: 0 });
    const m = matricesOf(scatterNodes(nodes)[0]!);
    // forward column = +x tangent
    expect(m[8]).toBeCloseTo(1, 5);
    expect(m[10]).toBeCloseTo(0, 5);
  });

  it("placeGrid produces count*count positions with deterministic jitter", () => {
    const a = worldPlaceGrid(asset("tile"), { count: [4, 3], spacing: [2, 2], jitter: 0.2, seed: 5 });
    const b = worldPlaceGrid(asset("tile"), { count: [4, 3], spacing: [2, 2], jitter: 0.2, seed: 5 });
    expect(a.instanceCount).toBe(12);
    expect(a.checksum).toBe(b.checksum);
  });

  it("placePoisson keeps min-distance, stays in shape, honors exclude", () => {
    const shape = { kind: "circle", center: [0, 0] as const, radius: 30 } as const;
    const { nodes, instanceCount } = worldPlacePoisson([asset("tree")], {
      shape, minDistance: 4, seed: 3,
      exclude: [{ kind: "circle", center: [0, 0], radius: 8 }]
    });
    expect(instanceCount).toBeGreaterThan(20);
    const m = matricesOf(scatterNodes(nodes)[0]!);
    const pts = [...Array(m.length / 12)].map((_, i) => posAt(m, i));
    for (const [x, , z] of pts) {
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(8);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(30 + 1e-6);
    }
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![2] - pts[j]![2])).toBeGreaterThanOrEqual(4 - 1e-6);
      }
    }
    const again = worldPlacePoisson([asset("tree")], { shape, minDistance: 4, seed: 3, exclude: [{ kind: "circle", center: [0, 0], radius: 8 }] });
    expect(again.checksum).toBe(worldPlacePoisson([asset("tree")], { shape, minDistance: 4, seed: 3, exclude: [{ kind: "circle", center: [0, 0], radius: 8 }] }).checksum);
  });
});

describe("prd10 room (T5.5)", () => {
  it("splits walls around openings and emits a lintel", () => {
    const nodes = worldRoom({
      size: [12, 3, 8],
      openings: [{ wall: "north", offset: 0, width: 2, height: 2.1 }],
      dressing: false,
      name: "t"
    });
    const boxes = nodes.filter((n) => (n as { kind: string }).kind === "primitive" && (n as { name?: string }).name?.includes("north-wall"));
    // wall 12m with a 2m opening at centre → two 5m wall boxes + lintel
    const lintels = nodes.filter((n) => (n as { name?: string }).name?.includes("lintel"));
    expect(boxes.length).toBe(2);
    expect(lintels.length).toBe(1);
    const w = (boxes[0] as { scale?: number[] }).scale?.[0];
    expect(w).toBeCloseTo(5, 5);
  });
  it("emits floor tiles as scatter + dressing + practical light nodes", () => {
    const nodes = worldRoom({ size: [12, 3, 8], name: "t2" });
    expect(scatterNodes(nodes).length).toBeGreaterThan(0);
    const lights = nodes.filter((n) => (n as { kind: string }).kind === "light");
    expect(lights.length).toBeGreaterThan(0); // ceiling-lamp practicals
  });
});

describe("prd10 street (T5.5)", () => {
  it("emits road, sidewalks, markings, buildings and props", () => {
    const nodes = worldStreet({
      path: [[-100, 0, 0], [100, 0, 0]],
      lanes: 2,
      sidewalkWidth: 3,
      name: "main"
    });
    const kinds = nodes.map((n) => `${(n as { kind: string }).kind}:${(n as { name?: string }).name ?? ""}`);
    expect(kinds.some((k) => k.includes("road"))).toBe(true);
    expect(kinds.filter((k) => k.includes("sidewalk"))).toHaveLength(2);
    expect(kinds.some((k) => k.includes("centerline"))).toBe(true);
    expect(scatterNodes(nodes).length).toBeGreaterThan(0); // buildings + lamps + planters
    const lights = nodes.filter((n) => (n as { kind: string }).kind === "light");
    expect(lights.length).toBeGreaterThan(0); // street-lamp practicals
  });
  it("4-lane streets emit the wider profile + lane markings", () => {
    const nodes = worldStreet({ path: [[0, 0, -60], [0, 0, 60]], lanes: 4, name: "hw", props: false, buildings: false });
    const names = nodes.map((n) => (n as { name?: string }).name ?? "");
    expect(names.filter((n) => n.includes("lane-"))).toHaveLength(2);
  });
});

describe("prd10 content bake (T5.7)", () => {
  const worldDir = join(__dirname, "..", "..", "..", "..", "packages", "engine", "assets", "world");
  it("manifest entries hash-match the files on disk", () => {
    const manifest = JSON.parse(readFileSync(join(worldDir, "manifest.json"), "utf8")) as {
      assets: Record<string, { file: string; hash: string }>;
    };
    const checked: string[] = [];
    for (const [id, entry] of Object.entries(manifest.assets)) {
      const full = join(worldDir, entry.file);
      if (!existsSync(full)) continue;
      const digest = `sha256:${createHash("sha256").update(readFileSync(full)).digest("hex")}`;
      expect(digest, id).toBe(entry.hash);
      checked.push(id);
    }
    expect(checked.length).toBeGreaterThanOrEqual(30); // 24 kit GLBs + 6 bakes
  });
  it("kit GLBs are valid glTF binaries", () => {
    const glb = readFileSync(join(worldDir, "kits", "city", "tower-8x8.glb"));
    expect(glb.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
    expect(glb.readUInt32LE(4)).toBe(2);          // version 2
    expect(glb.readUInt32LE(8)).toBe(glb.length); // total length
  });
});
