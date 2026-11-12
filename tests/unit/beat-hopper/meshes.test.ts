import { describe, expect, it } from "vitest";
import {
  BAR_SIZE, BLOCK_SIZE, GAP_SIZE, LANE_WIDTH, PLAYER_LENGTH, PLAYER_RADIUS, ROAD_WIDTH, SEGMENT_LENGTH, WALL_SIZE,
  barMesh, blockMesh, boxMesh, capsuleMesh, gapMesh, monolithWallMesh, plasmaCrossbarMesh, playerMesh, ringMesh,
  skaterBotMeshes, speakerBlockMesh, sphereMesh, stanchionPostsMesh, translateMesh, wallMesh
} from "../../../apps/showcase-beat-hopper/src/meshes";
import { CONFIG } from "../../../apps/showcase-beat-hopper/src/sim";

const extent = (m: { positions: number[] }, axis: 0 | 1 | 2): [number, number] => {
  let min = Infinity, max = -Infinity;
  for (let i = axis; i < m.positions.length; i += 3) {
    min = Math.min(min, m.positions[i]!);
    max = Math.max(max, m.positions[i]!);
  }
  return [min, max];
};

describe("beat-hopper mesh dimensions and vertex counts", () => {
  it("box: 24 verts / 36 indices, exact half-extents", () => {
    const m = boxMesh(ROAD_WIDTH, 0.3, SEGMENT_LENGTH);
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
    expect(extent(m, 0)).toEqual([-ROAD_WIDTH / 2, ROAD_WIDTH / 2]);
    expect(extent(m, 1)).toEqual([-0.15, 0.15]);
    expect(extent(m, 2)).toEqual([-SEGMENT_LENGTH / 2, SEGMENT_LENGTH / 2]);
  });

  it("sphere: (w+1)(h+1) verts at the exact radius", () => {
    const m = sphereMesh(0.5, 8, 6);
    expect(m.positions.length / 3).toBe(63);
    for (let i = 0; i < m.positions.length; i += 3) {
      expect(Math.hypot(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!)).toBeCloseTo(0.5, 9);
    }
  });

  it("capsule: 2*(caps+1)*(radial+1) verts and total height length + 2*radius", () => {
    const m = capsuleMesh(PLAYER_RADIUS, PLAYER_LENGTH, 16, 6);
    expect(m.positions.length / 3).toBe(2 * 7 * 17);
    const [minY, maxY] = extent(m, 1);
    expect(minY).toBeCloseTo(-(PLAYER_LENGTH / 2 + PLAYER_RADIUS), 9);
    expect(maxY).toBeCloseTo(PLAYER_LENGTH / 2 + PLAYER_RADIUS, 9);
  });

  it("ring: 2*(segments+1) verts / segments*6 indices on y=0 with +Y normals", () => {
    const m = ringMesh(0.8, 1.0, 32);
    expect(m.positions.length / 3).toBe(66);
    expect(m.indices.length).toBe(192);
    expect(extent(m, 1)).toEqual([0, 0]);
    const [minX, maxX] = extent(m, 0);
    expect(minX).toBeCloseTo(-1.0, 9);
    expect(maxX).toBeCloseTo(1.0, 9);
    for (let i = 1; i < m.normals.length; i += 3) expect(m.normals[i]).toBe(1);
  });

  it("translateMesh offsets all vertices without mutating the source mesh", () => {
    const base = boxMesh(1, 1, 1);
    const shifted = translateMesh(base, 2, 3, -4);
    expect(extent(base, 0)).toEqual([-0.5, 0.5]);
    expect(extent(shifted, 0)).toEqual([1.5, 2.5]);
    expect(extent(shifted, 1)).toEqual([2.5, 3.5]);
    expect(extent(shifted, 2)).toEqual([-4.5, -3.5]);
  });

  it("player hopper capsule: 238 verts, base at y=0, top at 2*r + length", () => {
    const m = playerMesh();
    expect(m.positions.length / 3).toBe(238);
    const [minY, maxY] = extent(m, 1);
    expect(minY).toBeCloseTo(0, 9);
    expect(maxY).toBeCloseTo(2 * PLAYER_RADIUS + PLAYER_LENGTH, 9);
    const [minX, maxX] = extent(m, 0);
    expect(minX).toBeCloseTo(-PLAYER_RADIUS, 9);
    expect(maxX).toBeCloseTo(PLAYER_RADIUS, 9);
  });

  it("block obstacle: 24 verts / 36 indices, sits on y=0 with BLOCK_SIZE extents", () => {
    const m = blockMesh();
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
    const [minX, maxX] = extent(m, 0);
    const [minY, maxY] = extent(m, 1);
    const [minZ, maxZ] = extent(m, 2);
    expect(minX).toBeCloseTo(-BLOCK_SIZE.w / 2, 9);
    expect(maxX).toBeCloseTo(BLOCK_SIZE.w / 2, 9);
    expect(minY).toBeCloseTo(0, 9);
    expect(maxY).toBeCloseTo(BLOCK_SIZE.h, 9);
    expect(minZ).toBeCloseTo(-BLOCK_SIZE.d / 2, 9);
    expect(maxZ).toBeCloseTo(BLOCK_SIZE.d / 2, 9);
  });

  it("bar obstacle: crossbar + two posts = 72 verts / 108 indices, grounded posts and overhead bar", () => {
    const m = barMesh();
    expect(m.positions.length / 3).toBe(72);
    expect(m.indices.length).toBe(108);
    const [minX, maxX] = extent(m, 0);
    const [minY, maxY] = extent(m, 1);
    const [minZ, maxZ] = extent(m, 2);
    expect(minX).toBeCloseTo(-BAR_SIZE.w / 2, 9);
    expect(maxX).toBeCloseTo(BAR_SIZE.w / 2, 9);
    expect(minY).toBeCloseTo(0, 9);
    expect(maxY).toBeCloseTo(BAR_SIZE.y + BAR_SIZE.h / 2, 9);
    expect(minZ).toBeCloseTo(-BAR_SIZE.d / 2, 9);
    expect(maxZ).toBeCloseTo(BAR_SIZE.d / 2, 9);
  });

  it("gap trench patch: 24 verts / 36 indices spanning one lane", () => {
    const m = gapMesh();
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
    const [minX, maxX] = extent(m, 0);
    const [minY, maxY] = extent(m, 1);
    const [minZ, maxZ] = extent(m, 2);
    expect(minX).toBeCloseTo(-GAP_SIZE.w / 2, 9);
    expect(maxX).toBeCloseTo(GAP_SIZE.w / 2, 9);
    expect(minY).toBeCloseTo(0.01, 9);
    expect(maxY).toBeCloseTo(GAP_SIZE.h + 0.01, 9);
    expect(minZ).toBeCloseTo(-GAP_SIZE.d / 2, 9);
    expect(maxZ).toBeCloseTo(GAP_SIZE.d / 2, 9);
  });
  it("lane pieces fit their lane and the road holds three lanes; walls are too tall to hop", () => {
    expect(LANE_WIDTH).toBe(CONFIG.LANE_WIDTH);
    expect(ROAD_WIDTH).toBeGreaterThanOrEqual(3 * LANE_WIDTH);
    expect(BLOCK_SIZE.w).toBeLessThan(LANE_WIDTH);
    expect(BAR_SIZE.w).toBeLessThan(LANE_WIDTH);
    expect(GAP_SIZE.w).toBe(LANE_WIDTH);
    const m = wallMesh();
    expect(m.positions.length / 3).toBe(48);
    const [minY, maxY] = extent(m, 1);
    expect(minY).toBeCloseTo(0, 9);
    expect(maxY).toBeCloseTo(WALL_SIZE.h + WALL_SIZE.capH, 9);
    expect(WALL_SIZE.h).toBeGreaterThan(2);
    expect(extent(m, 0)[1]).toBeLessThan(LANE_WIDTH / 2);
  });

  it("sculpted corridor obstacles and synth-skater bot preserve grounded bases and exact 0.97 m duck clearance", () => {
    const cross = plasmaCrossbarMesh();
    const [crossMinY, crossMaxY] = extent(cross, 1);
    expect(crossMinY).toBeCloseTo(BAR_SIZE.y - BAR_SIZE.h / 2, 6);
    expect(crossMaxY).toBeCloseTo(BAR_SIZE.y + BAR_SIZE.h / 2, 6);
    expect(cross.positions.length / 3).toBeGreaterThan(100);

    const posts = stanchionPostsMesh();
    expect(extent(posts, 1)[0]).toBeCloseTo(0, 6);
    expect(posts.positions.length / 3).toBeGreaterThan(200);

    const speaker = speakerBlockMesh();
    expect(extent(speaker, 1)[0]).toBeCloseTo(0, 6);
    expect(extent(speaker, 1)[1]).toBeCloseTo(BLOCK_SIZE.h, 6);
    expect(speaker.positions.length / 3).toBeGreaterThan(200);

    const monolith = monolithWallMesh();
    expect(extent(monolith, 1)[0]).toBeCloseTo(0, 6);
    expect(extent(monolith, 1)[1]).toBeCloseTo(WALL_SIZE.h + WALL_SIZE.capH, 6);
    expect(monolith.positions.length / 3).toBeGreaterThan(100);

    const bot = skaterBotMeshes();
    for (const part of [
      bot.torso,
      bot.pelvis,
      bot.pelvisBelt,
      bot.head,
      bot.visor,
      bot.headband,
      bot.earCups,
      bot.arm,
      bot.leg,
      bot.kneePad,
      bot.skate,
      bot.skateBlade
    ]) {
      expect(part.positions.length / 3).toBeGreaterThan(24);
      expect(part.indices.length).toBeGreaterThan(36);
    }

    // Verify seamless vertical continuity from torso -> pelvis -> leg -> skate with zero air gap
    const [torsoMinY] = extent(bot.torso, 1);
    const [pelvisMinY, pelvisMaxY] = extent(bot.pelvis, 1);
    const [legMinY, legMaxY] = extent(bot.leg, 1);
    const [, skateMaxY] = extent(bot.skate, 1);
    expect(0.43 + pelvisMaxY).toBeGreaterThan(0.62 + torsoMinY);
    expect(0.405 + legMaxY).toBeGreaterThan(0.43 + pelvisMinY);
    expect(0.405 + legMinY).toBeLessThan(skateMaxY);
  });
});
