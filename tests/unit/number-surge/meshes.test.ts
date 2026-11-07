import { describe, expect, it } from "vitest";
import { DIMS, ballLabelMesh, ballMesh, boxMesh, gateFrameMesh, gatePanelMesh, groundQuad, opLabelMesh, particleMesh, powerupMesh, quadMesh, roadDashMesh, roadEdgeMesh, roadSegmentMesh, shardMesh, shadowMesh, sphereMesh, wallLabelMesh, wallMesh } from "../../../apps/showcase-number-surge/src/meshes";

const bounds = (positions: number[]): { min: number[]; max: number[] } => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }
  return { min, max };
};

describe("number-surge procedural meshes: exact dimensions and vertex counts", () => {
  it("box: 24 vertices, 36 indices, exact half-extents", () => {
    const m = boxMesh(2, 4, 6, 1, 2, 3);
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices).toHaveLength(36);
    const { min, max } = bounds(m.positions);
    expect(min).toEqual([0, 0, 0]);
    expect(max).toEqual([2, 4, 6]);
  });

  it("quads: 4 vertices, 6 indices, exact size", () => {
    const q = quadMesh(2.4, 1.5);
    expect(q.positions.length / 3).toBe(4);
    expect(q.indices).toHaveLength(6);
    const { min, max } = bounds(q.positions);
    expect(min[0]).toBeCloseTo(-1.2);
    expect(max[0]).toBeCloseTo(1.2);
    expect(min[1]).toBeCloseTo(-0.75);
    expect(max[1]).toBeCloseTo(0.75);
    const g = groundQuad(7.4, 2);
    expect(g.positions.length / 3).toBe(4);
    const gb = bounds(g.positions);
    expect(gb.min[0]).toBeCloseTo(-3.7);
    expect(gb.max[2]).toBeCloseTo(1);
    expect(g.normals.every((n, i) => (i % 3 === 1 ? n === 1 : n === 0))).toBe(true);
  });

  it("ball: radius 0.55, 24×16 segments → 425 vertices, unit normals", () => {
    const m = ballMesh();
    expect(m.positions.length / 3).toBe((DIMS.BALL_WIDTH_SEGMENTS + 1) * (DIMS.BALL_HEIGHT_SEGMENTS + 1));
    expect(m.positions.length / 3).toBe(425);
    for (let i = 0; i < m.positions.length; i += 3) {
      const r = Math.hypot(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!);
      expect(r).toBeCloseTo(DIMS.BALL_RADIUS, 6);
    }
    for (let i = 0; i < m.normals.length; i += 3) {
      expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeCloseTo(1, 6);
    }
  });

  it("gate panel and frame: pinned sizes, frame is 3 merged boxes (72 vertices)", () => {
    const panel = gatePanelMesh();
    expect(panel.positions.length / 3).toBe(24);
    const pb = bounds(panel.positions);
    expect(pb.min[1]).toBeCloseTo(0);
    expect(pb.max[1]).toBeCloseTo(DIMS.GATE_PANEL_H);
    expect(pb.max[0]! - pb.min[0]!).toBeCloseTo(DIMS.GATE_PANEL_W);
    const frame = gateFrameMesh();
    expect(frame.positions.length / 3).toBe(72);
    expect(frame.indices).toHaveLength(108);
    const fb = bounds(frame.positions);
    expect(fb.max[1]).toBeCloseTo(DIMS.GATE_PANEL_H + DIMS.GATE_TOP_H);
  });

  it("op label sits on the panel face; wall is 7.2 × 3.6 × 0.6", () => {
    const label = opLabelMesh();
    const lb = bounds(label.positions);
    expect(lb.min[2]).toBeCloseTo(DIMS.GATE_PANEL_D / 2 + 0.02);
    expect((lb.min[1]! + lb.max[1]!) / 2).toBeCloseTo(1.7);
    const wall = wallMesh();
    expect(wall.positions.length / 3).toBe(24);
    const wb = bounds(wall.positions);
    expect(wb.max[0]! - wb.min[0]!).toBeCloseTo(DIMS.WALL_W);
    expect(wb.max[1]).toBeCloseTo(DIMS.WALL_H);
    expect(wb.max[2]! - wb.min[2]!).toBeCloseTo(DIMS.WALL_D);
    const wl = wallLabelMesh();
    expect(bounds(wl.positions).min[2]).toBeCloseTo(DIMS.WALL_D / 2 + 0.02);
  });

  it("road parts, powerup, shard, particle, shadow, decal counts", () => {
    expect(roadSegmentMesh().positions.length / 3).toBe(4);
    expect(roadEdgeMesh().positions.length / 3).toBe(8);
    const eb = bounds(roadEdgeMesh().positions);
    expect(eb.min[0]).toBeCloseTo(-DIMS.EDGE_X - DIMS.EDGE_WIDTH / 2);
    expect(eb.max[0]).toBeCloseTo(DIMS.EDGE_X + DIMS.EDGE_WIDTH / 2);
    expect(roadDashMesh().positions.length / 3).toBe(4);
    const orb = powerupMesh();
    expect(orb.positions.length / 3).toBe(221);
    for (let i = 0; i < orb.positions.length; i += 3) {
      expect(Math.hypot(orb.positions[i]!, orb.positions[i + 1]!, orb.positions[i + 2]!)).toBeCloseTo(DIMS.POWERUP_RADIUS, 6);
    }
    expect(shardMesh().positions.length / 3).toBe(24);
    const sb = bounds(shardMesh().positions);
    expect(sb.max[0]).toBeCloseTo(DIMS.SHARD_SIZE / 2);
    expect(particleMesh().positions.length / 3).toBe(24);
    expect(shadowMesh().positions.length / 3).toBe(4);
    expect(ballLabelMesh().positions.length / 3).toBe(4);
    expect(sphereMesh(1, 8, 6).positions.length / 3).toBe(63);
  });
});