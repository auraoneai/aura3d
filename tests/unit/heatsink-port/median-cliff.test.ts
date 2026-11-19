/**
 * Audit 2026-11-19: in the two split sections the divider lid spans from the top of the raised lane's wall to the top
 * of the lowered lane's wall (up to 24 m of rise across 18 m). Drawn in the flat divider material it was a huge
 * untextured teal slab filling half the screen from the low lane. The lid now lives in `buildMedianCliff` (canyon
 * rock material); the divider mesh keeps only its two 3 m wall faces.
 */
import { describe, expect, it } from "vitest";
import { buildDividers, buildMedianCliff } from "../../../examples/heatsink-port/meshes";
import { Track } from "../../../examples/heatsink-port/track";
import { DISTRICT_FOG_NODES } from "../../../examples/heatsink-port/world";

describe("Ion Circuit split median rock cap", () => {
  const track = new Track();
  const cap = buildMedianCliff(track, 3, 3);
  const walls = buildDividers(track, 3, 3, false);
  const full = buildDividers(track, 3, 3);

  it("the cap is exactly the old divider lid: same quads, so no gap or overlap with the wall faces", () => {
    expect(track.splits.length).toBeGreaterThan(0);
    const quads = cap.positions.length / 12;
    expect(quads).toBeGreaterThan(100);
    // the full divider mesh = 3 quads per row (two walls + lid); the walls-only mesh = 2
    expect(full.positions.length / 12).toBe(quads * 3);
    expect(walls.positions.length / 12).toBe(quads * 2);
    for (let q = 0; q < quads; q++) {
      const lid = full.positions.slice(q * 36 + 24, q * 36 + 36);
      const mine = cap.positions.slice(q * 12, q * 12 + 12);
      for (let k = 0; k < 12; k++) expect(mine[k]).toBeCloseTo(lid[k]!, 6);
    }
  });

  it("the cap sits 3 m above the road at the divider edges, never out over a lane", () => {
    for (let v = 0; v < cap.positions.length / 3; v++) {
      const s = cap.uvs[v * 2]! * 40;
      const fr = track.frame(s);
      const x = cap.positions[v * 3]!, y = cap.positions[v * 3 + 1]!, z = cap.positions[v * 3 + 2]!;
      const lat = (x - fr.x) * fr.rx + (z - fr.z) * fr.rz;
      expect(Math.abs(Math.abs(lat) - track.dividerAt(s))).toBeLessThan(0.01);
      expect(y - (fr.y + track.latY(s, lat))).toBeCloseTo(3, 3);
    }
  });

  it("the tall slabs (the reported teal plane) are all in the cap, and its normals face up", () => {
    let tall = 0;
    for (let q = 0; q < cap.positions.length / 12; q++) {
      const y0 = cap.positions[q * 12 + 1]!, y3 = cap.positions[q * 12 + 10]!;
      if (Math.abs(y0 - y3) > 10) tall++;
      expect(cap.normals[q * 12 + 1]!).toBeGreaterThan(0);
    }
    expect(tall).toBeGreaterThan(100);
    expect(DISTRICT_FOG_NODES).toContain("median-cliff");
  });
});
