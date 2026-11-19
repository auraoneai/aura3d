/**
 * Idol grounding: every static Idol model standing on the terrain (roadside trees, pines, shoulder rocks, the hermit
 * cottage, the shrine-gate pillars) has its base at or below the terrain at every footprint point (centre + 8 rim
 * points of its scaled base radius) and no more than 0.5 m below the lowest of them — nothing floats over a slope,
 * nothing is buried.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { at, frameAt } from "../../../examples/kid-goku-beyond-the-clouds-port/course";
import { IDOL_FOOTPRINT, MAX_FOOTPRINT_DROP, footprintPoints, groundCottageY, groundPillarsY, groundRoadside, placementS } from "../../../examples/kid-goku-beyond-the-clouds-port/art/idolGrounding";
import { SHRINE_PILLAR_X, idolShrineGateNode } from "../../../examples/kid-goku-beyond-the-clouds-port/idol";
import { buildSanctuaryToriiPlacements } from "../../../examples/kid-goku-beyond-the-clouds-port/props";
import { ROAD_HALF, buildScatter, groundHeight } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";

const seated = (baseY: number, s: number, lat: number, radius: number) => {
  const ys = footprintPoints(CH, s, lat, radius).map((p) => p[1]);
  return { above: baseY - Math.min(...ys), floats: ys.some((y) => baseY > y + 1e-6) };
};

describe("Cumulus Dash Idol models sit on the terrain", () => {
  const scatter = buildScatter(CH);

  it.each([["round", "roundTrees"], ["pine", "pineTrees"], ["rock", "boulders"]] as const)("every %s placement is seated under its whole footprint", (kind, key) => {
    const list = scatter[key];
    expect(list.length).toBeGreaterThan(0);
    const grounded = groundRoadside(CH, list, kind);
    let floating = 0, buried = 0, centreFloats = 0, onRoad = 0;
    grounded.forEach((p) => {
      const r = IDOL_FOOTPRINT[kind] * p.scale;
      const g = seated(p.pos[1], placementS(p), p.lat!, r);
      if (g.floats) floating++;
      if (g.above < -0.5) buried++;
      if (Math.abs(p.lat!) - ROAD_HALF < r) onRoad++;
      // the base sits on the ground it stands on: within the sink + the footprint's (bounded) fall of the terrain
      const ys = footprintPoints(CH, placementS(p), p.lat!, r).map((q) => q[1]);
      expect(Math.max(...ys) - p.pos[1]).toBeLessThanOrEqual(MAX_FOOTPRINT_DROP + 0.25);
    });
    // the old centre-sampled placement floated over falling ground somewhere along the course
    list.forEach((p) => { if (seated(p.pos[1], placementS(p), p.lat!, IDOL_FOOTPRINT[kind] * p.scale).floats) centreFloats++; });
    expect(floating).toBe(0);
    expect(buried).toBe(0);
    expect(onRoad).toBe(0);
    expect(centreFloats).toBeGreaterThan(0);
    expect(grounded.length).toBeGreaterThan(list.length * 0.85); // nudged, not thinned out
  });

  it("the hermit cottage sits on the lowest ground under its footprint", () => {
    const home = CH.home!;
    const y = groundCottageY(CH, home.s, 9.5);
    const g = seated(y, home.s, 9.5, IDOL_FOOTPRINT.cottage);
    expect(g.floats).toBe(false);
    expect(g.above).toBeGreaterThanOrEqual(-0.5);
  });

  it("each shrine-gate pillar stands on its own side's ground", () => {
    for (const t of buildSanctuaryToriiPlacements(CH)) {
      const ys = groundPillarsY(CH, t.s, SHRINE_PILLAR_X);
      const json = idolShrineGateNode(t.name, t.pos, t.yaw, ys).toJSON() as unknown as { children: { position: number[] }[] };
      json.children.forEach((c, i) => {
        // world position of the pillar: group yaw turns local X onto the course right axis
        const cy = Math.cos(t.yaw), sy = Math.sin(t.yaw);
        const wx = t.pos[0] + c.position[0]! * cy, wz = t.pos[2] - c.position[0]! * sy, wy = t.pos[1] + c.position[1]!;
        const lat = i === 0 ? SHRINE_PILLAR_X : -SHRINE_PILLAR_X;
        const expect3 = at(t.s, lat, 0);
        expect(Math.hypot(wx - expect3[0], wz - expect3[2])).toBeLessThan(0.05); // index 0 really is the +lateral pillar
        const g = seated(wy, t.s, lat, IDOL_FOOTPRINT.pillar);
        expect(g.floats).toBe(false);
        expect(g.above).toBeGreaterThanOrEqual(-0.5);
      });
    }
  });

  it("world.ts places the Idol models through the footprint grounding", () => {
    const src = readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8");
    for (const k of ["roundTrees", "pineTrees", "boulders"]) expect(src).toContain(`groundRoadside(ch, scatter.${k},`);
    for (const v of ["heroRound", "heroPine", "heroRocks"]) expect(src).toContain(`place(${v})`);
    expect(src).toContain("groundCottageY(ch, ch.home.s, 9.5)");
    expect(src).toContain("groundPillarsY(ch, torii.s, SHRINE_PILLAR_X)");
    // sanity: the terrain helpers agree with the course frame the ground mesh is lofted on
    expect(at(100, 10, groundHeight(CH, 100, 10))[1]).toBeCloseTo(frameAt(100, 10).point[1] + frameAt(100, 10).up[1] * groundHeight(CH, 100, 10), 6);
  });
});
