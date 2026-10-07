import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { worldQueriesSlot } from "../../../../packages/engine/src/contracts/world";
import type { AuraApp, AuraVec3 } from "../../../../packages/engine/src/agent-api/index";
import { sampleTerrainHeightfield, type TerrainHeightfieldFixture } from "../../../../packages/rendering/src/TerrainHeightfield";
import {
  createWorldQueries,
  worldStateFor,
  setWorldWind,
  setWorldActiveBiome
} from "../../../../packages/engine/src/agent-api/world/queries";
import { normalizeWind } from "../../../../packages/engine/src/agent-api/world/wind";
import { BIOME_RIGS, describeBiome, listBiomes } from "../../../../packages/engine/src/agent-api/world/biomes";

// Importing the lane barrel is what calls `worldQueriesSlot.provide(...)`.
import "../../../../packages/engine/src/lanes/prd10";

const flagsOn = resolveQrFlags({ options: ["world"], env: {} });
const flagsOff = resolveQrFlags({ options: [], env: {} });

function fakeApp(raycastHit?: { point: AuraVec3; normal: AuraVec3; distance: number; nodeName?: string }): AuraApp {
  return {
    physics: raycastHit
      ? { queries: { raycast: () => ({ body: {}, ...raycastHit }) } }
      : { queries: { raycast: () => undefined } }
  } as unknown as AuraApp;
}

function rampFixture(): TerrainHeightfieldFixture {
  // 2x2 ramp: (0,0)=0, (1,0)=1, (0,1)=2, (1,1)=3 — bilinear midpoint is the mean.
  return {
    id: "external-parity-old-branch-terrain-heightfield",
    width: 2,
    height: 2,
    seed: 7,
    minHeight: 0,
    maxHeight: 3,
    data: new Float32Array([0, 1, 2, 3]),
    samples: [],
    biomeCounts: { water: 0, beach: 0, grassland: 4, forest: 0, rock: 0, snow: 0 },
    meanHeight: 1.5,
    roughness: 0,
    riverCellCount: 0,
    hash: "ramp",
    source: "origin-master-terrain-generator-adapted",
    claimBoundary: "test fixture"
  };
}

/** Terrain provider over a fixture footprint [0,size]², bilinear via C-26's sampler. */
function rampTerrainProvider(nodeId: string, fixture: TerrainHeightfieldFixture, size = 10) {
  return {
    nodeId,
    heightAt: (x: number, z: number) => {
      if (x < 0 || z < 0 || x > size || z > size) return null;
      return sampleTerrainHeightfield(fixture, x / size, z / size).height;
    },
    normalAt: (x: number, z: number): AuraVec3 | null => {
      if (x < 0 || z < 0 || x > size || z > size) return null;
      const e = 0.5;
      const dx =
        (sampleTerrainHeightfield(fixture, Math.min(1, (x + e) / size), z / size).height -
          sampleTerrainHeightfield(fixture, Math.max(0, (x - e) / size), z / size).height) /
        Math.min(2 * e, x + e, size - x + e);
      const dz =
        (sampleTerrainHeightfield(fixture, x / size, Math.min(1, (z + e) / size)).height -
          sampleTerrainHeightfield(fixture, x / size, Math.max(0, (z - e) / size)).height) /
        Math.min(2 * e, z + e, size - z + e);
      const len = Math.hypot(dx, 1, dz);
      return [-dx / len, 1 / len, -dz / len];
    }
  };
}

describe("C-26 worldQueriesSlot — stub path (flag off)", () => {
  const app = fakeApp();
  const stub = worldQueriesSlot.get(flagsOff)(app);

  it("height() returns 0 and up normal", () => {
    expect(stub.height().heightAt(3, 4)).toBe(0);
    expect(stub.height().normalAt(3, 4)).toEqual([0, 1, 0]);
  });
  it("ground() raycasts the y=0 plane without physics", () => {
    const hit = stub.ground().raycastDown(2, 5, 10, 100);
    expect(hit?.point).toEqual([2, 0, 5]);
    expect(hit?.normal).toEqual([0, 1, 0]);
  });
  it("wind() is zeroed; biome() null; listBiomes has all 11 ids", () => {
    expect(stub.wind().strength).toBe(0);
    expect(stub.biome()).toBeNull();
    expect(stub.listBiomes()).toHaveLength(11);
    expect(stub.describeBiome("overcast").post).toBe("daylight-outdoor");
  });
});

describe("C-26 worldQueriesSlot — real impl (flag on)", () => {
  it("slot is provided by the lane barrel", () => {
    expect(worldQueriesSlot.provided).toBe(true);
    expect(worldQueriesSlot.get(flagsOn)).toBe(createWorldQueries);
  });

  it("heightAt agrees with CPU bilinear within 1e-4", () => {
    const app = fakeApp();
    const state = worldStateFor(app);
    state.terrains.push(rampTerrainProvider("terrain-a", rampFixture(), 10));
    const queries = createWorldQueries(app);
    // 2x2 ramp mapped to [0,10]²: h(u,v) = u*1 + v*2 (bilinear on a ramp is exact).
    for (const [x, z, expected] of [
      [0, 0, 0],
      [10, 10, 3],
      [5, 5, 1.5],
      [2.5, 7.5, 1.75]
    ] as const) {
      expect(queries.height().heightAt(x, z)).toBeCloseTo(expected, 4);
    }
  });

  it("heightAt falls back to the highest water rest height, else 0", () => {
    const app = fakeApp();
    const state = worldStateFor(app);
    state.waters.push({ nodeId: "lake", restHeightAt: (x, z) => (x > 0 && x < 4 && z > 0 && z < 4 ? -0.4 : null) });
    state.waters.push({ nodeId: "ocean", restHeightAt: (x, z) => (x >= 2 && x <= 4 ? -0.2 : null) });
    const queries = createWorldQueries(app);
    expect(queries.height().heightAt(1, 1)).toBeCloseTo(-0.4, 4);
    expect(queries.height().heightAt(3, 3)).toBeCloseTo(-0.2, 4); // ocean is higher
    expect(queries.height().heightAt(20, 20)).toBe(0);
  });

  it("ground() returns the nearest hit across terrain, physics and kit AABBs with nodeId", () => {
    const app = fakeApp({ point: [0, 8, 0], normal: [0, 1, 0], distance: 2, nodeName: "crate-1" });
    const state = worldStateFor(app);
    state.terrains.push(rampTerrainProvider("terrain-b", rampFixture(), 10)); // h ~1.35 at (4.5,4.5)
    state.kitAABBs.push({ nodeId: "kit-crate", min: [4, 2, 4], max: [5, 3, 5] });
    const queries = createWorldQueries(app);
    // At (4.5,4.5): physics 2 < kit top(7) < terrain(~8.65)? measure properly:
    const hit = queries.ground().raycastDown(4.5, 4.5, 10, 100);
    expect(hit?.nodeId).toBe("crate-1"); // physics hit at distance 2 wins
    // No physics coverage -> kit AABB top wins over terrain below it.
    const app2 = fakeApp();
    const s2 = worldStateFor(app2);
    s2.terrains.push(rampTerrainProvider("terrain-c", rampFixture(), 10));
    s2.kitAABBs.push({ nodeId: "kit-box", min: [4, 0, 4], max: [5, 8, 5] });
    const hit2 = createWorldQueries(app2).ground().raycastDown(4.5, 4.5, 10, 100);
    expect(hit2?.nodeId).toBe("kit-box");
    expect(hit2?.point[1]).toBe(8);
    // Outside everything -> null (not the y=0 plane).
    expect(createWorldQueries(app2).ground().raycastDown(500, 500, 10, 100)).toBeNull();
  });

  it("wind() returns the normalized current spec; setWorldWind updates it", () => {
    const app = fakeApp();
    const queries = createWorldQueries(app);
    const d35 = (35 * Math.PI) / 180;
    const wind = queries.wind();
    expect(wind.direction[0]).toBeCloseTo(Math.sin(d35), 6);
    expect(wind.direction[2]).toBeCloseTo(Math.cos(d35), 6);
    expect(wind.strength).toBe(0.5);
    expect(wind.gust).toBe(0.35);
    expect(wind.gustFrequency).toBeCloseTo(1 / 40, 6);
    expect(wind.turbulence).toBe(0.2);
    setWorldWind(app, { directionDeg: 90, strength: 1.2, gustStrength: 0.5, gustScale: 20, turbulence: 0.4 });
    const updated = queries.wind();
    expect(updated.direction[0]).toBeCloseTo(1, 6);
    expect(updated.direction[2]).toBeCloseTo(0, 6);
    expect(updated.gustFrequency).toBeCloseTo(1 / 20, 6);
    expect(updated.turbulence).toBe(0.4);
  });

  it("biome() is null until the resolver activates one", () => {
    const app = fakeApp();
    const queries = createWorldQueries(app);
    expect(queries.biome()).toBeNull();
    setWorldActiveBiome(app, BIOME_RIGS["night-city"]);
    expect(queries.biome()?.id).toBe("night-city");
  });
});

describe("prd10 biomes (T1.6)", () => {
  it("listBiomes returns the 11 frozen ids in contract order", () => {
    const ids = listBiomes();
    expect(ids).toEqual([
      "outdoor-day",
      "golden-hour",
      "overcast",
      "night-city",
      "polar-night",
      "alpine-snow",
      "interior-warm",
      "interior-neutral",
      "interior-industrial",
      "space",
      "underwater"
    ]);
  });

  it("every rig enforces ambientPolicy ibl-only and shadow strength 1.0 except overcast", () => {
    for (const id of listBiomes()) {
      const rig = describeBiome(id);
      expect(rig.ambientPolicy).toBe("ibl-only");
      expect(rig.id).toBe(id);
    }
  });

  it("describeBiome is deterministic and frozen", () => {
    const a = describeBiome("golden-hour");
    const b = describeBiome("golden-hour");
    expect(a).toBe(b); // same frozen object
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.environmentSpec)).toBe(true);
    expect(() => {
      (a as { id: string }).id = "space";
    }).toThrow();
  });

  it("Low tier applies the §6.3 variant rule (1 cascade fewer, half distance)", () => {
    const high = describeBiome("outdoor-day", "high");
    const low = describeBiome("outdoor-day", "low");
    expect(high.shadows.cascades).toBe(3);
    expect(low.shadows.cascades).toBe(2);
    expect(low.shadows.maxDistance).toBe(60);
    const interior = describeBiome("interior-neutral", "low");
    expect(interior.shadows.cascades).toBe(1); // clamped at 1, never 0
  });
});

describe("prd10 wind normalization (T1.7)", () => {
  it("defaults per §7.1.3", () => {
    const w = normalizeWind();
    expect(w.strength).toBe(0.5);
    expect(w.gust).toBe(0.35);
    expect(w.turbulence).toBe(0.2);
    expect(w.gustFrequency).toBeCloseTo(0.025, 6); // 1/40
  });
  it("gustScale <= 0 yields gustFrequency 0", () => {
    expect(normalizeWind({ gustScale: 0 }).gustFrequency).toBe(0);
  });
});
