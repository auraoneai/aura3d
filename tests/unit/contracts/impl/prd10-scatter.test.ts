/**
 * PRD-10 Phase 3 (CPU side): per-cell Bridson scatter planner, deterministic
 * checksum, §9.3 instance chunk grid, wind UBO pack, grass chunk ring, and
 * T3.8 `instances.model` world-option placements.
 */
import { describe, expect, it } from "vitest";
import { grassChunkRing, GRASS_CHUNK_SIZE } from "../../../../packages/rendering/src/world/vegetation/GrassField.js";
import { InstanceChunkGrid } from "../../../../packages/rendering/src/world/vegetation/InstanceChunkGrid";
import { packWindUbo, gustNoiseData, WIND_GUST_SIZE } from "../../../../packages/rendering/src/world/vegetation/WindField";
import {
  planScatterInstances,
  scatterChecksum,
  worldGrass,
  worldScatter,
  type AuraScatterOptions
} from "../../../../packages/engine/src/agent-api/world/scatter";
import { worldTerrain } from "../../../../packages/engine/src/agent-api/world/terrain";
import { instances } from "../../../../packages/engine/src/agent-api/nodes/instances";
import type { AuraTransformSpec } from "../../../../packages/engine/src/agent-api/index";

const AREA_SURFACE = {
  kind: "area" as const,
  shape: { kind: "polygon" as const, points: [[0, 0], [64, 0], [64, 64], [0, 64]] as const },
  y: 0
};

function scatterOptions(over: Partial<AuraScatterOptions> = {}): AuraScatterOptions {
  return {
    surface: AREA_SURFACE,
    seed: 42,
    layers: [{
      density: 4, // instances per 100 m²
      minDistance: 4,
      assets: [{ asset: { id: "tree-a" } as never }, { asset: { id: "rock-b" } as never, weight: 2 }]
    }],
    ...over
  };
}

describe("prd10 scatter planner", () => {
  it("is deterministic: same seed → identical instances, same checksum", () => {
    const a = planScatterInstances(scatterOptions());
    const b = planScatterInstances(scatterOptions());
    expect(a.length).toBeGreaterThan(0);
    expect(a.map((i) => [i.x, i.z, i.yawDeg, i.scale]).flat()).toEqual(b.map((i) => [i.x, i.z, i.yawDeg, i.scale]).flat());
    expect(scatterChecksum(new Float32Array(a.flatMap((i) => [i.x, i.y, i.z])))).toEqual(scatterChecksum(new Float32Array(b.flatMap((i) => [i.x, i.y, i.z]))));
  });

  it("different seeds differ", () => {
    const a = planScatterInstances(scatterOptions());
    const b = planScatterInstances(scatterOptions({ seed: 43 }));
    expect(a.length).not.toBe(b.length);
  });

  it("respects exclusion shapes", () => {
    const exclude = { kind: "circle" as const, center: [32, 32] as const, radius: 40 };
    const inst = planScatterInstances(scatterOptions({ layers: [{ density: 4, minDistance: 3, exclude: [exclude], assets: [{ asset: { id: "a" } as never }] }] }));
    for (const i of inst) {
      expect(Math.hypot(i.x - 32, i.z - 32)).toBeGreaterThanOrEqual(40);
    }
  });

  it("slopeDeg filters steep ground on terrain surfaces", () => {
    // area surface: slope 0 → a tight slope range keeps everything; [30, 60] drops all
    const all = planScatterInstances(scatterOptions({ layers: [{ density: 4, minDistance: 3, slopeDeg: [0, 10], assets: [{ asset: { id: "a" } as never }] }] }));
    expect(all.length).toBeGreaterThan(0);
    const none = planScatterInstances(scatterOptions({ layers: [{ density: 4, minDistance: 3, slopeDeg: [30, 60], assets: [{ asset: { id: "a" } as never }] }] }));
    expect(none.length).toBe(0);
  });

  it("worldScatter returns a node + eager counts + checksum", () => {
    const r = worldScatter(scatterOptions());
    expect(r.node.kind).toBe("scatter");
    expect(r.node.options).toBeDefined();
    expect(r.instanceCount).toBeGreaterThan(0);
    expect(r.perAsset["tree-a"]! + r.perAsset["rock-b"]!).toBe(r.instanceCount);
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("worldScatter rejects empty layers", () => {
    expect(() => worldScatter(scatterOptions({ layers: [] }))).toThrow(/layer/);
  });
});

describe("prd10 grass", () => {
  it("worldGrass builds a grass node", () => {
    const terrain = worldTerrain({
      id: "g1",
      height: { kind: "procedural", seed: 1, octaves: 2 },
      size: [64, 64],
      layers: [{ name: "grass-meadow" }]
    });
    const node = worldGrass({ id: "gg1", terrain: terrain.handle }).toJSON();
    expect(node.kind).toBe("grass");
    expect(node.id).toBe("gg1");
  });

  it("grassChunkRing covers a deterministic ring of 8 m cells inside radius", () => {
    const ring = grassChunkRing([64, 64], 20, GRASS_CHUNK_SIZE);
    expect(ring.length).toBeGreaterThan(4);
    for (const c of ring) {
      const d = Math.hypot(c.originX + 4 - 64, c.originZ + 4 - 64);
      expect(d).toBeLessThanOrEqual(20);
      expect(c.seed).toBeLessThan(4096);
    }
    // deterministic order
    const keys = ring.map((c) => `${c.originX},${c.originZ}`);
    expect(keys).toEqual([...keys].sort((a, b) => a.split(",")[1]! === b.split(",")[1]! ? Number(a.split(",")[0]) - Number(b.split(",")[0]) : Number(a.split(",")[1]) - Number(b.split(",")[1])));
  });
});

describe("prd10 wind field", () => {
  it("packs the frozen C-26 UBO layout", () => {
    const ubo = packWindUbo({ direction: [1, 0, 0], strength: 0.5, gust: 0.4, gustFrequency: 0.02, turbulence: 0.1 }, 12.5);
    expect(ubo.length).toBe(8);
    expect(ubo[0]).toBe(1);     // dir.x
    expect(ubo[1]).toBe(0);     // dir.z
    expect(ubo[2]).toBe(0.5);   // strength
    expect(ubo[3]).toBe(12.5);  // time
    expect(ubo[4]).toBeCloseTo(0.4, 6);   // gust
    expect(ubo[5]).toBeCloseTo(0.02, 6);  // 1/gustScale
  });

  it("gust noise is 64² RG8 and deterministic", () => {
    const a = gustNoiseData();
    const b = gustNoiseData();
    expect(a.length).toBe(WIND_GUST_SIZE * WIND_GUST_SIZE * 2);
    expect(a).toEqual(b);
    expect(Math.max(...a)).toBeGreaterThan(0);
  });

  it("committed noise asset matches gustNoiseData byte-for-byte", async () => {
    // §8.2: engine/assets/world/noise/wind-gust-64.rg8 is the baked twin of the
    // procedural generator — drift means one of them was edited without the other.
    const { readFileSync } = await import("node:fs");
    const file = readFileSync("packages/engine/assets/world/noise/wind-gust-64.rg8");
    const gen = gustNoiseData();
    expect(file.length).toBe(gen.length);
    expect(Array.from(file)).toEqual(Array.from(gen));
  });
});

describe("prd10 InstanceChunkGrid (T3.1)", () => {
  it("compact32 packs 32-byte records into 32 m cells with per-cell AABB", () => {
    const grid = new InstanceChunkGrid({
      layout: "compact32",
      cellSize: 32,
      maxWindSway: 0.4,
      localHeight: [0, 2],
      instances: [
        { position: [1, 0.5, 2], yawDeg: 90, scale: 1.5, variation: [1, 0.5, 0, 0], extra: [0, 0, 0, 0] },
        { position: [40, 0, 40], yawDeg: 0, scale: 1, variation: [0, 0, 0, 0], extra: [0, 0, 0, 0] },
        { position: [3, 0, 5], yawDeg: 270, scale: 0.8, variation: [0, 0, 0, 0], extra: [0, 0, 0, 0] }
      ]
    });
    expect(grid.data.byteLength).toBe(3 * 32);
    expect(grid.instanceCount).toBe(3);
    expect(grid.cells.length).toBe(2);
    expect(grid.cells[0]!.cellX).toBe(0);
    expect(grid.cells[0]!.cellZ).toBe(0);
    expect(grid.cells[0]!.count).toBe(2);
    expect(grid.cells[1]!.count).toBe(1);
    expect(grid.cells[0]!.byteOffset).toBe(0);
    expect(grid.cells[1]!.byteOffset).toBe(64);
    // AABB: position +/- sway; y += localHeight * scale
    const aabb = grid.cells[0]!.aabb;
    expect(aabb[0]).toBeCloseTo(1 - 0.4, 4);          // minX
    expect(aabb[3]).toBeCloseTo(3 + 0.4, 4);          // maxX
    expect(aabb[4]).toBeCloseTo(0.5 + 2 * 1.5, 4);    // maxY = posY + localH * scale
    // yaw unorm16 at byte 12: 90 deg -> round(65535 * 0.25) = 16384
    const dv = new DataView(grid.data);
    expect(dv.getUint16(12, true)).toBe(16384);
    // scale f16 at byte 14 — decode manually (CI lacks DataView.getFloat16)
    const h = dv.getUint16(14, true);
    const exp = (h >>> 10) & 0x1f, frac = h & 0x3ff;
    const scale = (exp === 0 ? frac / 1024 * 2 ** -14 : (1 + frac / 1024) * 2 ** (exp - 15));
    expect(scale).toBeCloseTo(1.5, 3);
    // variation unorm8x4 at byte 16
    expect(dv.getUint8(16)).toBe(255);
    expect(dv.getUint8(17)).toBe(128);
  });

  it("matrix48 layout carries 12 f32 per instance (translation at [3],[7],[11])", () => {
    const grid = new InstanceChunkGrid({
      layout: "matrix48",
      cellSize: 32,
      instances: [Float32Array.from([2, 0, 0, 7, 0, 2, 0, 1, 0, 0, 2, 9])]
    });
    expect(grid.data.byteLength).toBe(48);
    const f = new Float32Array(grid.data);
    expect(f[3]).toBe(7);   // translation x
    expect(f[7]).toBe(1);   // translation y
    expect(f[11]).toBe(9);  // translation z
    expect(f[0]).toBe(2);   // m00 scale
  });

  it("frustum culls cells by AABB (positive-vertex test)", () => {
    const grid = new InstanceChunkGrid({
      layout: "compact32",
      instances: [{ position: [1, 0, 1], yawDeg: 0, scale: 1, variation: [0, 0, 0, 0], extra: [0, 0, 0, 0] }]
    });
    // plane n=(-1,0,0) d=-5 keeps x <= -5 -> cell culled
    expect(grid.cull([[-1, 0, 0, -5]]).length).toBe(0);
    // plane n=(-1,0,0) d=5 keeps x <= 5 -> survives
    expect(grid.cull([[-1, 0, 0, 5]]).length).toBe(1);
  });
});

describe("prd10 instances.model world options (T3.8)", () => {
  const asset = { id: "tree.glb", kind: "model" } as never;
  const transforms: readonly AuraTransformSpec[] = [
    { position: [2, 0, 3], rotation: [0, Math.PI / 2, 0], scale: 2 },
    { position: [-5, 1, 0] }
  ];

  it("emits a placements block when world options are set", () => {
    const node = instances.model(asset, { transforms, static: true, wind: true, chunkSize: 48 }).toJSON() as { placements?: { matrices: Float32Array; wind?: boolean; chunkSize?: number } };
    expect(node.placements).toBeDefined();
    expect(node.placements!.matrices.length).toBe(24);
    expect(node.placements!.wind).toBe(true);
    expect(node.placements!.chunkSize).toBe(48);
    // instance 0: yaw 90° + scale 2 → row-major [m00 m01 m02 tx | m10 m11 m12 ty | m20 m21 m22 tz]
    // yaw(π/2): R = [0 0 1 | 0 1 0 | -1 0 0]; scaled by 2
    const m = node.placements!.matrices;
    expect(m[0]).toBeCloseTo(0, 5);       // m00·sx
    expect(m[1]).toBeCloseTo(0, 5);       // m01·sy
    expect(m[2]).toBeCloseTo(2, 5);       // m02·sz
    expect(m[3]).toBe(2);                 // tx
    expect(m[8]).toBeCloseTo(-2, 5);      // m20·sx
    expect(m[9]).toBeCloseTo(0, 5);       // m21·sy
    expect(m[15]).toBe(-5);               // instance 1 tx (index 12 + 3)
  });

  it("emits a plain model node when no world options are set", () => {
    const node = instances.model(asset, { transforms }).toJSON() as unknown as Record<string, unknown>;
    expect(node["placements"]).toBeUndefined();
    expect(node["kind"]).toBe("model");
  });

  it("packs colors rgba per instance", () => {
    const node = instances.model(asset, { transforms, colors: ["#ff0000", "#00ff00"], wind: true }).toJSON() as { placements?: { colors?: Float32Array } };
    expect(node.placements?.colors?.length).toBe(8);
    expect(node.placements?.colors?.[0]).toBeCloseTo(1, 3);
    expect(node.placements?.colors?.[5]).toBeCloseTo(1, 3);
  });
});
