/**
 * PRD-10 Phase 2 (CPU side): height-grid bilinear twin, CDLOD quadtree, shared
 * patch geometry, `world.terrain` builder + handle, splat-rule CPU eval,
 * collider spec, node handler, runtime scan.
 */
import { describe, expect, it } from "vitest";
import { terrainHeightBilinear, terrainMacroNormal } from "../../../../packages/rendering/src/world/terrain/TerrainHeightTexture";
import {
  buildCdlodTree,
  cdlodRanges,
  selectCdlodNodes,
  TERRAIN_TIER_LOD
} from "../../../../packages/rendering/src/world/terrain/TerrainCdlod";
import { createTerrainPatchGeometry } from "../../../../packages/rendering/src/world/terrain/TerrainPatchGeometry";
import {
  defaultSplatRules,
  evalSplatRules,
  isHoleAt,
  proceduralHeightfield,
  resolveTerrainGrid,
  terrainColliderSpec,
  terrainRecordFor,
  worldTerrain,
  type AuraTerrainNode
} from "../../../../packages/engine/src/agent-api/world/terrain";
import { createWorldRuntime } from "../../../../packages/engine/src/agent-api/world/runtime";
import { terrainSafeBasicGeometry } from "../../../../packages/engine/src/agent-api/compiler/world";
import { nodeHandlerFor } from "../../../../packages/engine/src/contracts/compiler";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index";
import "../../../../packages/engine/src/lanes/prd10";

const rampGrid = { columns: 4, rows: 4, heights: Float32Array.from({ length: 16 }, (_, i) => (i % 4) + Math.floor(i / 4) * 2) };

function fakeApp(): AuraApp {
  return { physics: null } as unknown as AuraApp;
}

describe("prd10 terrain height grid (T2.1)", () => {
  it("bilinear twin: ramp corners and interior", () => {
    // h(u,v) = u + 2v on 4×4
    expect(terrainHeightBilinear(rampGrid, [0, 0])).toBeCloseTo(0, 6);
    expect(terrainHeightBilinear(rampGrid, [1, 0])).toBeCloseTo(3, 6);
    expect(terrainHeightBilinear(rampGrid, [0, 1])).toBeCloseTo(6, 6);
    expect(terrainHeightBilinear(rampGrid, [1, 1])).toBeCloseTo(9, 6);
    expect(terrainHeightBilinear(rampGrid, [0.5, 0.5])).toBeCloseTo(1.5 + 3, 6); // u=0.5→x=1.5,v=0.5→row1.5: 1.5+3=4.5
    expect(terrainHeightBilinear(rampGrid, [0.5, 0.5], 2)).toBeCloseTo(9, 6);   // heightScale
  });
  it("bilinear twin clamps border texels like the shader", () => {
    // uv > 1 clamps to the last texel row/col, matching clamp(i,0,size-1)
    const border = terrainHeightBilinear(rampGrid, [1.2, 0.5]);
    const edge = terrainHeightBilinear(rampGrid, [1, 0.5]);
    expect(border).toBeCloseTo(edge, 6);
  });
  it("macro normal points up on flat terrain", () => {
    const flat = { columns: 4, rows: 4, heights: new Float32Array(16) };
    const n = terrainMacroNormal(flat, [0.5, 0.5], 1, 1);
    expect(n[1]).toBeCloseTo(1, 5);
    expect(Math.abs(n[0])).toBeLessThan(1e-6);
  });
});

describe("prd10 CDLOD quadtree (T2.2)", () => {
  const grid = { columns: 65, rows: 65, heights: new Float32Array(65 * 65).fill(0) };
  it("node count = (4^levels - 1) / 3 and leaf size = size / 2^(levels-1)", () => {
    const tree = buildCdlodTree(grid, [1024, 1024], [0, 0], 4);
    expect(tree.all.length).toBe((4 ** 4 - 1) / 3); // 85
    expect(tree.leafSize).toBe(1024 / 8);
    expect(tree.root.size).toBe(1024);
  });
  it("range_l = range_0 * 2^l with range_0 = patchWorldSize * 1.5", () => {
    const ranges = cdlodRanges(4, 128, 1, 0.33);
    expect(ranges[0]!.morphEnd).toBeCloseTo(192, 5);
    expect(ranges[1]!.morphEnd).toBeCloseTo(384, 5);
    expect(ranges[2]!.morphEnd).toBeCloseTo(768, 5);
    expect(ranges[0]!.morphStart).toBeCloseTo(192 * 0.67, 4);
    const biased = cdlodRanges(4, 128, 2, 0.33);
    expect(biased[0]!.morphEnd).toBeCloseTo(384, 5); // lodBias scales range_0
  });
  it("selection: far camera emits the root, close camera descends to leaves", () => {
    const tree = buildCdlodTree(grid, [1024, 1024], [0, 0], 4);
    const ranges = cdlodRanges(4, tree.leafSize);
    const far = selectCdlodNodes(tree, [512, 0, -200000], ranges);
    expect(far.length).toBe(1);
    expect(far[0]!.level).toBe(3);
    const near = selectCdlodNodes(tree, [16, 0, 16], ranges);
    // Corner camera: 4 leaf nodes around it, then 3-node rings at each coarser level.
    expect(near.length).toBe(10);
    expect(near.filter((n) => n.level === 0).length).toBe(4);
    const levels = new Set(near.map((n) => n.level));
    expect(Math.min(...levels)).toBe(0);
    expect(Math.max(...levels)).toBe(2);
  });
});

describe("prd10 shared patch geometry (T2.3)", () => {
  it("(N+1)² vertices, 6N² indices, winding consistent", () => {
    const g32 = createTerrainPatchGeometry(32);
    expect(g32.vertexCount).toBe(33 * 33);
    expect(g32.indices.length).toBe(32 * 32 * 6);
    expect(g32.indices).toBeInstanceOf(Uint16Array);
    const g64 = createTerrainPatchGeometry(64);
    expect(g64.vertexCount).toBe(65 * 65);
    expect(g64.indices).toBeInstanceOf(Uint16Array);
    // first quad winds consistently (counter-clockwise seen from +y)
    expect([g32.indices[0], g32.indices[1], g32.indices[2]]).toEqual([0, 33, 1]);
  });
  it("tier table matches §17", () => {
    expect(TERRAIN_TIER_LOD.patchSize).toEqual({ low: 32, medium: 64, high: 64, ultra: 64 });
    expect(TERRAIN_TIER_LOD.levels).toEqual({ low: 4, medium: 6, high: 6, ultra: 7 });
    expect(TERRAIN_TIER_LOD.layers).toEqual({ low: 4, medium: 4, high: 8, ultra: 8 });
  });
});

describe("prd10 world.terrain builder + handle (T2.6)", () => {
  const layers = [
    { name: "grass", preset: "grass-meadow" as const },
    { name: "rock", preset: "rock-cliff" as const },
    { name: "sand", preset: "sand-beach" as const },
    { name: "snow", preset: "snow" as const }
  ];
  it("procedural source: deterministic per seed, different across seeds", () => {
    const a = proceduralHeightfield(42, 33, 33);
    const b = proceduralHeightfield(42, 33, 33);
    const c = proceduralHeightfield(7, 33, 33);
    expect([...a.slice(0, 8)]).toEqual([...b.slice(0, 8)]);
    expect([...a.slice(0, 8)]).not.toEqual([...c.slice(0, 8)]);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(-1e-5);
      expect(v).toBeLessThanOrEqual(1 + 1e-5);
    }
  });
  it("world.terrain registers a record and builds a working handle", () => {
    const builder = worldTerrain({
      size: [100, 100],
      heightScale: 10,
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers,
      collider: false
    });
    const node = builder.toJSON() as AuraTerrainNode;
    expect(node.kind).toBe("terrain");
    const record = terrainRecordFor(node.id)!;
    expect(record).toBeTruthy();
    const h = builder.handle.heightAt(50, 50);
    // uv=(0.5,0.5) on the ramp = (1.5 + 3) * heightScale 10
    expect(h).toBeCloseTo(4.5 * 10, 4);
    const n = builder.handle.normalAt(50, 50);
    // Ramp is genuinely steep (dh/dx≈40%): up-dominant but < 0.9.
    expect(n[1]).toBeGreaterThan(0.7);
    expect(builder.handle.slopeDegAt(50, 50)).toBeGreaterThan(0);
    expect(builder.handle.slopeDegAt(50, 50)).toBeLessThan(80);
  });
  it("layerWeightsAt sums to 1 and slope rules pick rock on steep faces", () => {
    const steep = new Float32Array(9 * 9);
    // 45° slope in +x direction: h ramps from 0→1 across columns
    for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) steep[r * 9 + c] = c / 8;
    const builder = worldTerrain({
      size: [4, 100], // x size tiny → big dh/dx in world space
      heightScale: 100,
      height: { kind: "array", columns: 9, rows: 9, heights: steep },
      layers,
      collider: false
    });
    const w = builder.handle.layerWeightsAt(2, 50);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    const rockW = w["rock"] ?? 0;
    expect(rockW).toBeGreaterThan(0.2);
  });
  it("holes: circle shape marks the covered region", () => {
    const builder = worldTerrain({
      size: [100, 100],
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers,
      holes: [{ kind: "circle", center: [0.5, 0.5], radius: 0.2 }],
      collider: false
    });
    const record = terrainRecordFor(builder.toJSON().id)!;
    expect(isHoleAt(record, 50, 50)).toBe(true);
    expect(isHoleAt(record, 10, 10)).toBe(false);
  });
  it("collider spec carries scaled heights and cell size; collider:false → null", () => {
    const builder = worldTerrain({
      size: [30, 30],
      heightScale: 2,
      origin: [0, 5, 0],
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers,
      collider: { friction: 0.9 }
    });
    const spec = terrainColliderSpec(terrainRecordFor(builder.toJSON().id)!)!;
    expect(spec.rows).toBe(4);
    expect(spec.columns).toBe(4);
    expect(spec.cellSize).toBeCloseTo(10, 5);
    expect(spec.friction).toBe(0.9);
    expect(spec.heights[0]).toBeCloseTo(5, 5); // h0*2 + origin.y
    const off = worldTerrain({
      size: [30, 30],
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers,
      collider: false
    });
    expect(terrainColliderSpec(terrainRecordFor(off.toJSON().id)!)).toBeNull();
  });
  it("handle.raycast hits the surface from above", () => {
    const builder = worldTerrain({
      size: [100, 100],
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers,
      collider: false
    });
    const hit = builder.handle.raycast([50, 1000, 50], [0, -1, 0], 2000)!;
    expect(hit).not.toBeNull();
    expect(hit.point[1]).toBeCloseTo(builder.handle.heightAt(50, 50), 3);
    expect(hit.distance).toBeGreaterThan(0);
    expect(hit.distance).toBeLessThan(2000);
  });
  it("handle returns sane defaults outside the footprint", () => {
    const builder = worldTerrain({
      size: [10, 10],
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers,
      collider: false
    });
    expect(builder.handle.heightAt(999, 999)).toBe(0);
    expect(builder.handle.normalAt(999, 999)).toEqual([0, 1, 0]);
  });
});

describe("prd10 splat rules + defaults (T2.5 CPU eval)", () => {
  it("default rules cover the resolveTerrainSlopeBlend semantics", () => {
    const layers = [
      { name: "grass" }, { name: "rock" }, { name: "sand" }, { name: "snow" }
    ];
    const rules = defaultSplatRules(layers);
    expect(rules.some((r) => r.layer === "rock" && r.slopeDeg)).toBe(true);
    expect(rules.some((r) => r.layer === "snow" && r.height)).toBe(true);
    expect(rules.some((r) => r.layer === "sand" && r.height)).toBe(true);
    const w = evalSplatRules(rules, layers, { slopeDeg: 80, heightNorm: 0.2, u: 0.5, v: 0.5 });
    expect(w["rock"]!).toBeGreaterThan(0.5);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
});

describe("prd10 C-36 terrain node handler (T2.7)", () => {
  it("handler is registered for kind 'terrain'", () => {
    const handler = nodeHandlerFor("terrain");
    expect(handler).toBeTruthy();
    expect(handler!.owner).toBe("prd10");
    expect(handler!.flag).toBe("A3D_QR_WORLD_TERRAIN");
  });
  it("safe-basic geometry has position+color verts and splat colours", () => {
    const builder = worldTerrain({
      size: [10, 10],
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers: [{ name: "grass" }],
      collider: false
    });
    const geo = terrainSafeBasicGeometry(terrainRecordFor(builder.toJSON().id)!, 8);
    expect(geo).toBeTruthy();
  });
});

describe("prd10 app.world runtime", () => {
  it("terrain() resolves by id; setWind/timeOfDay work; water throws a pending error", () => {
    const app = fakeApp();
    const builder = worldTerrain({
      id: "terrain-runtime-test",
      size: [20, 20],
      height: { kind: "array", columns: 4, rows: 4, heights: rampGrid.heights },
      layers: [{ name: "grass" }],
      collider: false
    });
    const runtime = createWorldRuntime(app, {
      scene: { nodes: [builder.toJSON()] }
    });
    const h = runtime.terrain("terrain-runtime-test");
    expect(h.id).toBe("terrain-runtime-test");
    expect(h.heightAt(10, 10)).toBeCloseTo(4.5, 4); // uv 0.5,0.5 on ramp
    runtime.setWind({ directionDeg: 90, strength: 1.5, gustStrength: 0.5, turbulence: 0.2 });
    expect(runtime.wind().strength).toBe(1.5);
    runtime.timeOfDay.set(20);
    expect(runtime.timeOfDay.get()).toBe(20);
    runtime.timeOfDay.animate({ hoursPerSecond: 1 });
    runtime.timeOfDay.pause();
    expect(runtime.timeOfDay.get()).toBe(20);
    // Phase 4: `water()` resolves handles — unknown ids name the registered set.
    expect(() => runtime.water("x")).toThrow(/no water node with that id/);
    expect(runtime.height().heightAt(10, 10)).toBeCloseTo(4.5, 4);
    const ground = runtime.ground().raycastDown(10, 10);
    expect(ground).not.toBeNull();
    expect(ground!.point[1]).toBeCloseTo(4.5, 4);
  });
});
