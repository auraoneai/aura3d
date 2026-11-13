import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";
import { CHAPTER0_COLLIDERS } from "../../../examples/silt-and-signal-port/colliders-ch0";
import { CHAPTER_COPY, OBJECTIVE_TITLES, SCENE_COPY } from "../../../examples/silt-and-signal-port/copy";
import { ASSET_HASHES, assets } from "../../../examples/silt-and-signal-port/assets";
import { buildArchitecture, farDunes, plazaColors, terrainColors } from "../../../examples/silt-and-signal-port/architecture";
import { OUTER_TERRAIN_SPAN, TERRAIN_X0, TERRAIN_X1, canalX, createTerrain } from "../../../examples/silt-and-signal-port/terrain";
import { canalCentre } from "../../../examples/silt-and-signal-port/world-ch0";

const dir = resolve("examples/silt-and-signal-port");

describe("silt-and-signal-port terrain", () => {
  it("keeps the flight corridor flat for every objective point of every chapter", () => {
    CHAPTERS.forEach((ch, index) => {
      const terrain = createTerrain(index);
      for (const o of ch.objectives) {
        for (const p of o.points) {
          const h = terrain.heightAt(p.x, p.z);
          expect(h, `${ch.id}/${o.id} at ${p.x},${p.z}`).toBeLessThan(p.y - 2.4);
        }
      }
    });
  });

  it("is deterministic and carves the canal below the water line", () => {
    const a = createTerrain(0), b = createTerrain(0);
    expect(a.heightAt(300, -400)).toBe(b.heightAt(300, -400));
    for (const z of [100, -300, -900]) expect(a.heightAt(canalCentre(z), z)).toBeLessThan(a.water.level);
    expect(a.heightAt(canalCentre(-200), -200)).toBeCloseTo(-3, 6);
    expect(a.heightAt(200, 100)).toBeGreaterThan(0);
    const generated = createTerrain(2);
    expect(generated.heightAt(canalX(-500), -500)).toBeLessThan(generated.water.level);
  });

  it("builds well-formed meshes", () => {
    const terrain = createTerrain(0);
    for (const mesh of [terrain.terrainMesh(), terrain.plazaMesh(), terrain.roadMesh(), terrain.bankMesh(), terrain.waterMesh()]) {
      if (!mesh.indices.length) continue;
      const vertexCount = mesh.positions.length / 3;
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.uvs.length / 2).toBe(vertexCount);
      expect(mesh.indices.length % 3).toBe(0);
      expect(mesh.indices.reduce((hi, v) => Math.max(hi, v), 0)).toBeLessThan(vertexCount);
      expect(mesh.positions.every(Number.isFinite)).toBe(true);
    }
    const m = terrain.terrainMesh();
    expect(m.indices.length / 3).toBeLessThan(130_000);
    for (let i = 0; i < m.normals.length; i += 3) expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeCloseTo(1, 5);
  });

  it("places every measured chapter-0 object exactly once", () => {
    const props = createTerrain(0).props();
    const total = props.trees.length + props.rocks.length + props.houses.length + props.lamps.length + props.stone.length + props.brass.length + props.walls.length;
    expect(total).toBe(CHAPTER0_COLLIDERS.length);
    expect(props.houses.length).toBe(51);
    expect(props.walls.length).toBe(783);
    expect(props.walls.filter((w) => w.kind === "cliff").length).toBeGreaterThan(5);
    for (const h of props.houses) expect(h.scale).toBeGreaterThanOrEqual(5);
  });

  it("scatters the other chapters away from the flight path", () => {
    for (let i = 1; i < CHAPTERS.length; i++) {
      const terrain = createTerrain(i);
      const props = terrain.props();
      expect(props.trees.length).toBeGreaterThan(100);
      for (const t of props.trees) expect(terrain.corridorDistance(t.x, t.z)).toBeGreaterThan(20);
    }
  });

  it("builds procedural architecture, terrain vertex colors, and far dunes with valid finite geometry", () => {
    const terrain = createTerrain(0);
    const props = terrain.props();
    const arch = buildArchitecture(props.walls);
    expect(arch.plaster.length).toBe(5);
    for (const [name, mesh] of [
      ["cliff", arch.cliff],
      ["stone", arch.stone],
      ["roofs", arch.roofs],
      ["dark", arch.dark],
      ...arch.plaster.map((m, i) => [`plaster-${i}`, m] as const),
    ] as const) {
      const vertexCount = mesh.positions.length / 3;
      expect(vertexCount, name).toBeGreaterThan(0);
      expect(mesh.normals.length, name).toBe(mesh.positions.length);
      expect(mesh.colors?.length, name).toBe(vertexCount * 4);
      expect(mesh.uvs.length / 2, name).toBe(vertexCount);
      expect(mesh.indices.length % 3, name).toBe(0);
      expect(mesh.positions.every(Number.isFinite), name).toBe(true);
    }
    const baseTerrain = terrain.terrainMesh();
    const colors = terrainColors(baseTerrain.positions);
    expect(colors.length).toBe((baseTerrain.positions.length / 3) * 4);
    expect(colors.every((c) => Number.isFinite(c) && c > 0)).toBe(true);

    const horizon = farDunes(200, -400, 1200, 2900, [0.85, 0.72, 0.58]);
    expect(horizon.positions.length / 3).toBeGreaterThan(100);
    expect(horizon.colors?.length).toBe((horizon.positions.length / 3) * 4);
    expect(horizon.indices.length % 3).toBe(0);
  });

  it("extends a continuous 360-degree desert skirt, extended canal/banks, plaza colors, and grounded cliffs with zero side cutoff", () => {
    expect(OUTER_TERRAIN_SPAN).toBeGreaterThanOrEqual(2000);
    for (const ch of [0, 2]) {
      const terrain = createTerrain(ch);
      const mesh = terrain.terrainMesh();
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i]!, z = mesh.positions[i + 2]!;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      expect(minX, `ch${ch} west skirt`).toBeLessThanOrEqual(TERRAIN_X0 - 2000);
      expect(maxX, `ch${ch} east skirt`).toBeGreaterThanOrEqual(TERRAIN_X1 + 2000);
      expect(minZ, `ch${ch} north skirt`).toBeLessThanOrEqual(-terrain.length - 2000);
      expect(maxZ, `ch${ch} south skirt`).toBeGreaterThanOrEqual(190 + 2000);
    }

    const ch0 = createTerrain(0);
    // Rolling dunes surround all four outer cardinal directions while plaza border z = 115 transitions smoothly
    expect(ch0.surfaceHeightAt(-700, 45)).toBeGreaterThan(10);
    expect(ch0.surfaceHeightAt(850, 45)).toBeGreaterThan(10);
    expect(ch0.surfaceHeightAt(-140, 650)).toBeGreaterThan(10);
    expect(ch0.surfaceHeightAt(200, -1850)).toBeGreaterThan(10);
    expect(Math.abs(ch0.surfaceHeightAt(20, 114) - ch0.surfaceHeightAt(20, 118))).toBeLessThan(0.08);

    const water = ch0.waterMesh();
    const bank = ch0.bankMesh();
    expect(bank.indices.length).toBeGreaterThan(0);
    let waterMaxZ = -Infinity, waterMinZ = Infinity, bankMaxZ = -Infinity;
    for (let i = 2; i < water.positions.length; i += 3) {
      if (water.positions[i]! > waterMaxZ) waterMaxZ = water.positions[i]!;
      if (water.positions[i]! < waterMinZ) waterMinZ = water.positions[i]!;
    }
    for (let i = 2; i < bank.positions.length; i += 3) {
      if (bank.positions[i]! > bankMaxZ) bankMaxZ = bank.positions[i]!;
    }
    expect(waterMaxZ).toBeGreaterThan(1000);
    expect(waterMinZ).toBeLessThan(-2200);
    expect(bankMaxZ).toBeGreaterThan(800);

    const plaza = ch0.plazaMesh();
    const pColors = plazaColors(plaza.positions, true);
    expect(pColors.length).toBe((plaza.positions.length / 3) * 4);
    expect(pColors.every((c) => Number.isFinite(c) && c > 0)).toBe(true);

    // Cliff walls extend down to <= -8 m so no canyon slab floats above the desert floor
    const arch = buildArchitecture(ch0.props().walls);
    let cliffMinY = Infinity;
    for (let i = 1; i < arch.cliff.positions.length; i += 3) {
      if (arch.cliff.positions[i]! < cliffMinY) cliffMinY = arch.cliff.positions[i]!;
    }
    expect(cliffMinY).toBeLessThanOrEqual(-8);

    // Elevated terrace stone blocks sink into their supporting cliff rather than floating 0.5 m above it
    const singleTerraceArch = buildArchitecture([
      { x: -120, z: 20, halfX: 30, halfZ: 40, bottom: 0, top: 13.5, kind: "cliff" },
      { x: -120, z: 20, halfX: 12, halfZ: 14, bottom: 14, top: 26, kind: "stone" }
    ]);
    let stoneMinY = Infinity;
    for (let i = 1; i < singleTerraceArch.stone.positions.length; i += 3) {
      if (singleTerraceArch.stone.positions[i]! < stoneMinY) stoneMinY = singleTerraceArch.stone.positions[i]!;
    }
    expect(stoneMinY).toBeLessThanOrEqual(12);
  });
});

describe("silt-and-signal-port art assets and copy", () => {
  it("every referenced asset file exists, is small, and is listed in the attribution", () => {
    const attribution = readFileSync(resolve(dir, "assets/ATTRIBUTION.md"), "utf8");
    let bytes = 0;
    for (const [key, ref] of Object.entries(assets)) {
      // route-local Meshy admissions live in the app's public/aura-assets (root-relative /aura-assets/ URL)
      const file = ref.url.startsWith("/aura-assets/")
        ? resolve(dir, "../../apps/showcase-silt-and-signal-port/public", ref.url.slice(1))
        : resolve(dir, ref.url.replace(/.*examples\/silt-and-signal-port\//, ""));
      expect(existsSync(file), `${key}: ${file}`).toBe(true);
      bytes += statSync(file).size;
    }
    expect(bytes).toBeLessThan(20 * 1024 * 1024);
    for (const [rel, hash] of Object.entries(ASSET_HASHES)) {
      expect(`sha256-${createHash("sha256").update(readFileSync(resolve(dir, "assets", rel))).digest("hex")}`, rel).toBe(hash);
    }
    for (const ref of Object.values(assets)) expect(ref.url, "site-relative, not an absolute URL").toMatch(/^\//);
    for (const word of ["Kenney", "ambientCG", "CC0"]) expect(attribution).toContain(word);
  });

  it("has own-words copy for every chapter, objective and scene", () => {
    for (const ch of CHAPTERS) {
      expect(CHAPTER_COPY[ch.id], ch.id).toBeDefined();
      expect(CHAPTER_COPY[ch.id]!.name).not.toBe(ch.name);
      for (const o of ch.objectives) {
        expect(OBJECTIVE_TITLES[o.id], o.id).toBeDefined();
        expect(OBJECTIVE_TITLES[o.id]).not.toBe(o.title);
        if (o.scene) expect(SCENE_COPY[o.scene], o.scene).toBeDefined();
      }
    }
  });
});
