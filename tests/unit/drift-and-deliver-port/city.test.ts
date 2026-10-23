import { describe, expect, it } from "vitest";
import { CHUNK_BLOCKS, GROUND_HALF, blockDecals, blockOf, buildCity, buildFurniture, buildProps, chunkKey, facadeKindFor, facingOf, farCity, roadPlane, tiersFor } from "../../../examples/drift-and-deliver-port/city";
import { PALETTE_SLOTS, Palette, bakePaletteUVs, bounds, triangleCount, type MeshData } from "../../../examples/drift-and-deliver-port/mesh";
import { CAR_KINDS, buildCarShell } from "../../../examples/drift-and-deliver-port/vehicles";
import { PITCH, STREET_LINES, buildBlocks, buildBuildings } from "../../../examples/drift-and-deliver-port/world";

const blocks = buildBlocks();
const buildings = buildBuildings(blocks);
const city = buildCity(blocks, buildings);

/** every triangle's winding must agree with its stored normal (outward faces) */
function windingErrors(m: MeshData): number {
  let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const p = (i: number): number[] => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
    const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (len < 1e-9) continue;
    const dot = (n[0]! * m.normals[a * 3]! + n[1]! * m.normals[a * 3 + 1]! + n[2]! * m.normals[a * 3 + 2]!) / len;
    if (dot < 0.99) bad++;
  }
  return bad;
}

describe("city dressing", () => {
  it("dresses every simulation footprint exactly once, in a single merged chunk", () => {
    expect(buildings.length).toBeGreaterThan(1000);
    expect(city.stats.buildings).toBe(buildings.length);
    expect(city.chunks.length).toBe(1);
    expect(CHUNK_BLOCKS).toBe(15);
    expect(new Set(city.chunks.map((c) => c.key)).size).toBe(1);
  });

  it("is dense but bounded: triangles per building and a tall core", () => {
    const perBuilding = city.stats.triangles / buildings.length;
    expect(perBuilding).toBeGreaterThan(30);
    expect(perBuilding).toBeLessThan(220);
    expect(city.stats.triangles).toBeLessThan(450_000);
    expect(city.stats.tallest).toBeGreaterThan(120);
    expect(city.stats.awnings).toBeGreaterThan(500);
  });

  it("emits well-formed meshes: aligned attributes, unit normals, outward winding", () => {
    for (const chunk of city.chunks) {
      for (const [name, m] of Object.entries(chunk.meshes)) {
        const verts = m.positions.length / 3;
        expect(m.normals.length, `${chunk.key}/${name} normals`).toBe(m.positions.length);
        expect(m.uvs.length, `${chunk.key}/${name} uvs`).toBe(verts * 2);
        expect(m.colors.length, `${chunk.key}/${name} colors`).toBe(verts * 4);
        let top = 0;
        for (const idx of m.indices) if (idx > top) top = idx;
        expect(top, `${chunk.key}/${name} indices`).toBeLessThan(Math.max(verts, 1));
        expect(windingErrors(m), `${chunk.key}/${name} winding`).toBe(0);
        for (let i = 0; i < m.normals.length; i += 3) {
          expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeCloseTo(1, 4);
        }
      }
    }
  });

  it("keeps the dressed geometry inside the city extent and above the ground", () => {
    for (const chunk of city.chunks) {
      for (const m of Object.values(chunk.meshes)) {
        if (!m.indices.length) continue;
        const b = bounds(m);
        expect(b.min[1]).toBeGreaterThanOrEqual(-1e-6);
        expect(b.min[0]).toBeGreaterThan(-GROUND_HALF);
        expect(b.max[0]).toBeLessThan(GROUND_HALF);
        expect(b.min[2]).toBeGreaterThan(-GROUND_HALF);
        expect(b.max[2]).toBeLessThan(GROUND_HALF);
      }
    }
  });

  it("uses metric facade UVs: a wall spans whole bays and floors of the tile", () => {
    const m = city.chunks.flatMap((c) => Object.entries(c.meshes).filter(([k]) => k.startsWith("tower:")).map(([, mesh]) => mesh)).find((mesh) => mesh.indices.length)!;
    // the first quad is a +z wall: its u extent is bays / 8 and its v extent is floors / 8
    const du = m.uvs[2]! - m.uvs[0]!;
    const dv = m.uvs[5]! - m.uvs[1]!;
    expect(du * 8).toBeCloseTo(Math.round(du * 8), 6);
    expect(dv * 8).toBeCloseTo(Math.round(dv * 8), 6);
    expect(du).toBeGreaterThan(0);
    expect(dv).toBeGreaterThan(0);
  });

  it("maps buildings to blocks and the street-facing axis", () => {
    for (const b of buildings.slice(0, 200)) {
      const { i, j } = blockOf(b);
      expect(Math.abs(b.x - i * PITCH)).toBeLessThan(PITCH / 2);
      expect(Math.abs(b.z - j * PITCH)).toBeLessThan(PITCH / 2);
      const f = facingOf(b);
      expect(Math.abs(f.nx) + Math.abs(f.nz)).toBe(1);
    }
    expect(chunkKey(-7, -7)).toBe("0,0");
    expect(chunkKey(7, 7)).toBe("0,0");
  });

  it("chooses facades by district and crowns the core in tiers", () => {
    expect(facadeKindFor("core", 0.1)).toBe("tower");
    expect(facadeKindFor("residential", 0.9)).toBe("brick");
    expect(tiersFor("core", 40).length).toBe(3);
    expect(tiersFor("outskirts", 2).length).toBe(1);
    expect(tiersFor("midtown", 6).length).toBe(1);
  });
});

describe("solid-colour palette", () => {
  it("fits every trim, roof, awning and car detail colour with headroom, and points UVs at texel centres", () => {
    const palette = new Palette();
    const baked = city.chunks.map((c) => c.meshes.trim as MeshData);
    for (const m of baked) bakePaletteUVs(m, palette);
    for (const kind of CAR_KINDS) bakePaletteUVs(buildCarShell(kind).detail, palette);
    bakePaletteUVs(farCity(), palette);
    const props = buildProps(buildFurniture(blocks));
    bakePaletteUVs(props, palette);
    baked.push(props);
    expect(palette.hexes.length).toBeGreaterThan(8);
    expect(palette.hexes.length).toBeLessThanOrEqual(PALETTE_SLOTS - 8);
    for (const m of baked) {
      for (let i = 0; i < m.uvs.length; i += 2) {
        const slot = m.uvs[i]! * PALETTE_SLOTS - 0.5;
        expect(Math.abs(slot - Math.round(slot))).toBeLessThan(1e-6);
        expect(m.uvs[i + 1]).toBe(0.5);
      }
    }
  }, 60_000);
});

describe("merged props", () => {
  it("is one well-formed mesh with outward winding, under the vertex index limit of 32-bit indices", () => {
    const props = buildProps(buildFurniture(blocks));
    const tris = triangleCount(props);
    expect(tris).toBeGreaterThan(100_000);
    expect(tris).toBeLessThan(400_000);
    expect(props.normals.length).toBe(props.positions.length);
    expect(windingErrors(props)).toBe(0);
    expect(props.colors.length / 4).toBe(props.positions.length / 3);
  }, 60_000);
});

describe("pedestrians", () => {
  it("are seeded, on sidewalks and clear of crossings", () => {
    const f = buildFurniture(blocks);
    expect(f.pedestrians.length).toBeGreaterThan(150);
    expect(buildFurniture(blocks).pedestrians[10]).toEqual(f.pedestrians[10]);
    const distToLine = (v: number): number => Math.min(...STREET_LINES.map((l) => Math.abs(v - l)));
    for (const p of f.pedestrians) {
      const d = Math.min(distToLine(p.x), distToLine(p.z));
      expect(d).toBeGreaterThanOrEqual(6.3);
      expect(d).toBeLessThanOrEqual(8);
    }
  });
});

describe("ground and furniture", () => {
  it("lays the road tile so a tile edge falls on a street centre line", () => {
    const m = roadPlane();
    const us = m.uvs.filter((_, i) => i % 2 === 0);
    const vs = m.uvs.filter((_, i) => i % 2 === 1);
    expect(Math.min(...us)).toBe(-8);
    expect(Math.max(...us)).toBe(9);
    expect(Math.min(...vs)).toBe(-8);
    expect(Math.max(...vs)).toBe(9);
    // street centre lines are at 60k + 30; the tile edge is at u integer <=> x = 60 u - 30
    for (const line of STREET_LINES) expect(Math.abs(((line + 30) / PITCH) % 1)).toBe(0);
    expect(triangleCount(m)).toBe(2);
  });

  it("covers every park and plaza block with one quad", () => {
    expect(triangleCount(blockDecals(blocks, "park", 21.5))).toBe(blocks.filter((b) => b.park).length * 2);
    expect(triangleCount(blockDecals(blocks, "plaza", 21.5))).toBe(blocks.filter((b) => b.plaza).length * 2);
  });

  it("places lamps, signals and trees deterministically on sidewalks and clear of crossings", () => {
    const f = buildFurniture(blocks);
    expect(f.lamps.length).toBe(16 * 15 * 2 * 2 * 2);
    expect(f.signals.length).toBe(256 * 4);
    expect(buildFurniture(blocks).streetTrees.length).toBe(f.streetTrees.length);
    expect(f.streetTrees.length).toBeGreaterThan(150);
    const distToLine = (v: number): number => Math.min(...STREET_LINES.map((l) => Math.abs(v - l)));
    for (const lamp of f.lamps) {
      // one coordinate sits on a sidewalk (7 m from a street line), the other well away from every crossing
      const onX = Math.abs(distToLine(lamp.x) - 7) < 1e-6;
      const onZ = Math.abs(distToLine(lamp.z) - 7) < 1e-6;
      expect(onX || onZ).toBe(true);
      expect(distToLine(onX ? lamp.z : lamp.x)).toBeGreaterThanOrEqual(15.9);
    }
    for (const t of f.parkTrees) expect(Math.min(Math.abs(t.x - Math.round(t.x / PITCH) * PITCH), Math.abs(t.z - Math.round(t.z / PITCH) * PITCH))).toBeGreaterThanOrEqual(2.4);
  });
});
