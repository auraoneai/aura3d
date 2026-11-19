/**
 * Real-GPU audit (owner, 2026-11-18 21:12 snapshot), Rooftop Run, Whispering Forest and Valley Gate:
 * - thin grey bars floating across the roof path: full-width battens laid flat at the crest height over a roof whose
 *   cross-section falls 0.35 m per metre to each eave; now a ridge cap along the crest. No rooftop box floats.
 * - "one giant stretched blue roof": the path's scale tiles repeated every 4 m (1.2 m scales); now every 1.6 m.
 * - "stretched bark" on the forest log's flanks (and every steep verge): verge u ignored the drop, so tens of metres of
 *   bank shared one texel column; u now follows the surface across, drop included.
 * - "melted" rooftop houses: Idol buildings were stretched up to 1.64x between axes; now within +-10% of uniform.
 * - the valley falls read as a blurry flat sheet: the shader now draws falling strands, streaks and foam.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFallsCascade, buildRoute, surfaceY } from "../../../examples/ninja-runner-port/meshes";
import { FALLS_POOL_Y, fallsCliff, fallsLayout } from "../../../examples/ninja-runner-port/world";
import { COURSE_LENGTH, gapAt, groundFrame } from "../../../examples/ninja-runner-port/course";
import { buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";
import { BUILDING_IDS, IDOL_PROP_KEYS, idolAsset, idolPropTransform } from "../../../examples/ninja-runner-port/art/idolScenery";

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("Shadowstep rooftop run", () => {
  it("no box on the roofs hangs in the air over the sloping roof (no floating bars across the path)", () => {
    const layers = buildScenery({}, { paintedTrees: true });
    const bad: string[] = [];
    for (const l of layers) {
      if (l.shape !== "box") continue;
      for (const pl of l.placements) {
        const m = pl.matrix, x = m[12]!, y = m[13]!, z = m[14]!;
        // nearest course point (rooftop district only)
        let best = { d: 0, lat: 0, dist: Infinity };
        for (let d = 552; d <= 1000; d += 0.5) {
          const f = groundFrame(d, 0), lat = (x - f.x) * -f.dz + (z - f.z) * f.dx, along = (x - f.x) * f.dx + (z - f.z) * f.dz;
          const dist = Math.abs(along) + Math.max(0, Math.abs(lat) - 6);
          if (dist < best.dist) best = { d, lat, dist };
        }
        if (best.dist > 0.6 || gapAt(best.d)) continue;
        // a box spanning the roof: its base must not sit above the roof surface under its ends
        const sx = Math.hypot(m[0]!, m[2]!);
        if (Math.abs(best.lat) - sx / 2 > 2.4) continue; // eave beams and railings past the path edge overhang by design
        for (const e of [-sx / 2, sx / 2]) {
          const under = surfaceY(best.d, best.lat + e);
          if (y - under > 0.12) bad.push(`${l.id}@${best.d.toFixed(1)} lat ${(best.lat + e).toFixed(2)} floats ${(y - under).toFixed(2)} m`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it("roof tiles repeat at kawara size on the rooftop path and eaves", () => {
    const world = read("../../../examples/ninja-runner-port/world.ts");
    const k = Number(/export const ROOF_TILE_UV_SCALE = ([0-9.]+);/.exec(world)?.[1]);
    expect(4 / k).toBeLessThanOrEqual(1.8);
    expect(world).toContain('const uvScale = (path ? kind === "tiles" : g.biome === "rooftops") ? ROOF_TILE_UV_SCALE : 1;');
  });

  it("Idol buildings keep their proportions (no axis stretched more than ~1.25x against another)", () => {
    const sink: ModelSink = {};
    buildScenery(sink, { paintedTrees: true });
    let worst = 0;
    for (const id of BUILDING_IDS) {
      const key = IDOL_PROP_KEYS[id as keyof typeof IDOL_PROP_KEYS];
      if (!idolAsset(key)) continue;
      for (const p of sink[id] ?? []) {
        const s = idolPropTransform(id as keyof typeof IDOL_PROP_KEYS, p).scale as number[];
        worst = Math.max(worst, Math.max(...s) / Math.min(...s));
      }
    }
    expect(worst).toBeGreaterThan(1);
    expect(worst).toBeLessThanOrEqual(1.11 / 0.89 + 1e-6);
  });
});

describe("Shadowstep verges and the valley falls", () => {
  it("verge texture follows the bank (u spans the surface across, drop included): no smeared log flanks", () => {
    const mesh = buildRoute(2);
    const p = mesh.positions, uv = mesh.uvs;
    let worst = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
        const i = mesh.indices[t + a]!, j = mesh.indices[t + b]!;
        // the banks: the path and the first two verge columns each side (6 and 16 m out; 19 columns a row)
        const ci = i % 19, cj = j % 19;
        if (ci < 4 || ci > 14 || cj < 4 || cj > 14) continue;
        const len = Math.hypot(p[i * 3]! - p[j * 3]!, p[i * 3 + 1]! - p[j * 3 + 1]!, p[i * 3 + 2]! - p[j * 3 + 2]!);
        const tex = Math.hypot(uv[i * 2]! - uv[j * 2]!, uv[i * 2 + 1]! - uv[j * 2 + 1]!) * 4;
        // metres of surface per metre of texture along any edge longer than 2 m (1 = undistorted)
        if (len > 2 && tex > 1e-6) worst = Math.max(worst, len / tex);
      }
    }
    expect(worst).toBeLessThan(2);
  });

  it("the falls shader draws falling strands, streaks and foam with see-through gaps (GLSL and WGSL)", () => {
    for (const f of ["../../../examples/ninja-runner-port/shaders.ts", "../../../examples/ninja-runner-port/shaders-wgsl.ts"]) {
      const src = read(f);
      expect(src).toMatch(/strand = smoothstep\(0\.32, 0\.78/);
      expect(src).toMatch(/foam = smoothstep\(0\.62, 0\.92/);
      expect(src).toMatch(/\(0\.42 \+ 0\.5 \* n \+ 0\.15 \* veins\)/);
    }
  });

  it("the evening falls are staggered curved curtains pouring off a cliff lip into the river pool", () => {
    const end = groundFrame(COURSE_LENGTH - 90, 0, 0);
    const L = fallsLayout(end);
    const water = L.layers.filter((l) => l.v1 > 0.5);
    // several curtains, staggered (different tops, widths, x and depth)
    expect(water.length).toBeGreaterThanOrEqual(3);
    expect(new Set(water.map((l) => l.top)).size).toBe(water.length);
    expect(new Set(water.map((l) => l.z)).size).toBe(water.length);
    const mesh = buildFallsCascade(L.layers);
    const P = mesh.positions;
    const ys = P.filter((_, i) => i % 3 === 1), zs = P.filter((_, i) => i % 3 === 2);
    // base in the pool (the river plane the world draws at y -2.5) and top at the lip (mesh y is above the pool)
    expect(L.pool).toBe(FALLS_POOL_Y);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(FALLS_POOL_Y + Math.max(...ys)).toBeCloseTo(L.lip[1], 6);
    // curved, not a card: the main curtain arcs out from the lip and bends into a horseshoe
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(10);
    // the lip sits just inside the cliff wall's crest; the curtain clears the wall's face below the lip
    const crest = L.cliff.position[1] + (1.393 * L.cliff.scale[1]) / 2, face = L.cliff.position[2] + (1.896 * L.cliff.scale[2]) / 2;
    expect(crest - L.lip[1]).toBeGreaterThan(0.5);
    expect(crest - L.lip[1]).toBeLessThan(3);
    const main = water[0]!;
    const zAt = (drop: number): number => L.lip[2] + main.z + main.throw * Math.sqrt(drop / main.top);
    for (const k of [0.25, 0.5, 0.75, 1]) expect(zAt(main.top * k)).toBeGreaterThan(face);
    // the wall stands in the pool and is the rock the evening pushes into the cliffB batch
    expect(L.cliff.position[1] - (1.393 * L.cliff.scale[1]) / 2).toBeLessThan(FALLS_POOL_Y);
    expect(fallsCliff(end)[0]).toEqual(L.cliff);
    // well off the run: every curtain point is > 15 m from the course centre line
    for (let i = 0; i < P.length; i += 3 * 7) {
      const wx = L.lip[0] + P[i]!, wz = L.lip[2] + P[i + 2]!;
      for (let d = 2300; d <= COURSE_LENGTH; d += 4) { const f = groundFrame(d, 0); expect(Math.hypot(f.x - wx, f.z - wz)).toBeGreaterThan(15); }
    }
  });
});
