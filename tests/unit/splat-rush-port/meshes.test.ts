import { describe, expect, it } from "vitest";
import {
  blobMesh,
  capsuleMesh,
  carnivalGateFrameParts,
  coneMesh,
  curbRailMesh,
  cylinderMesh,
  gateCurtainMesh,
  gateDripMesh,
  mergeMeshes,
  sphereMesh,
  trackChevronMesh,
  transformMesh,
  type MeshData
} from "../../../examples/splat-rush-port/meshes";
import {
  buildCarnivalInkHazardMesh,
  buildFinishArchAndSweeperMeshes,
  buildPaintRollerCollarMesh
} from "../../../examples/splat-rush-port/art/proceduralModels";
import { LOOKS } from "../../../examples/splat-rush-port/look";

const bounds = (m: MeshData) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m.positions[i + k]!); hi[k] = Math.max(hi[k]!, m.positions[i + k]!); }
  return { lo, hi };
};
const wellFormed = (m: MeshData): void => {
  expect(m.positions.length % 3).toBe(0);
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length / 2).toBe(m.positions.length / 3);
  expect(m.indices.length % 3).toBe(0);
  expect(m.indices.every((i) => i >= 0 && i < m.positions.length / 3)).toBe(true);
  expect(m.positions.every(Number.isFinite)).toBe(true);
  for (let i = 0; i < m.normals.length; i += 3) expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeGreaterThan(0.99);
};

describe("splat-rush-port meshes have the original three.js dimensions", () => {
  it("sphere radius 0.55 (the ball) and vertex count of SphereGeometry(r,32,32)", () => {
    const m = sphereMesh(0.55, 32, 32);
    wellFormed(m);
    expect(m.positions.length / 3).toBe(33 * 33);
    const b = bounds(m);
    expect(b.hi[1]).toBeCloseTo(0.55, 9);
    expect(b.lo[1]).toBeCloseTo(-0.55, 9);
  });

  it("gate post: CapsuleGeometry(0.46, 4) is 4.92 tall and 0.92 wide", () => {
    const m = capsuleMesh(0.46, 4, 16, 6);
    wellFormed(m);
    const b = bounds(m);
    expect(b.hi[1]! - b.lo[1]!).toBeCloseTo(4.92, 9);
    expect(b.hi[0]! - b.lo[0]!).toBeCloseTo(0.92, 6);
  });

  it("gate bar: 6.24 section + radius 0.52 caps = 7.28 long; the merged gate scaled 0.32 spans the post/bar layout", () => {
    const bar = transformMesh(capsuleMesh(0.52, 6.24, 16, 6), { rz: Math.PI / 2, ty: 4.92 });
    const b = bounds(bar);
    expect(b.hi[0]! - b.lo[0]!).toBeCloseTo(7.28, 6);
    expect(b.lo[1]! + (b.hi[1]! - b.lo[1]!) / 2).toBeCloseTo(4.92, 6);
    const gate = transformMesh(mergeMeshes([bar, transformMesh(capsuleMesh(0.46, 4, 16, 6), { tx: -2.66, ty: 2.46 })]), { scale: 0.32 });
    wellFormed(gate);
    expect(bounds(gate).hi[1]).toBeLessThan(2.4);
  });

  it("power-up: sphere 0.4 plus a cone 0.4 x 0.8 whose base sits on the sphere centre", () => {
    const cone = coneMesh(0.4, 0.8, 32, 0.4);
    wellFormed(cone);
    const b = bounds(cone);
    expect(b.hi[1]).toBeCloseTo(0.8, 9);
    expect(b.lo[1]).toBeCloseTo(0, 9);
    expect(b.hi[0]).toBeCloseTo(0.4, 6);
  });

  it("cylinder (splatter discs) is closed and 0.05 thick; blob is a flat fan on the XZ plane", () => {
    const c = cylinderMesh(0.15, 0.15, 0.05, 16);
    wellFormed(c);
    expect(bounds(c).hi[1]! - bounds(c).lo[1]!).toBeCloseTo(0.05, 9);
    const blob = blobMesh(1.5, 0.02);
    wellFormed(blob);
    expect(new Set(blob.positions.filter((_, i) => i % 3 === 1)).size).toBe(1);
  });

  it("mergeMeshes offsets indices", () => {
    const a = sphereMesh(1, 4, 4), b = sphereMesh(1, 4, 4);
    const m = mergeMeshes([a, b]);
    expect(m.positions.length).toBe(a.positions.length * 2);
    expect(Math.max(...m.indices)).toBe(m.positions.length / 3 - 1);
  });

  it("carnival sculpts (64x48 ball, 64-seg gimbal ring, bulbous gate drips, smooth arches, chevrons & rails) are high-tessellation and well-formed", () => {
    const hiBall = sphereMesh(0.55, 64, 48);
    wellFormed(hiBall);
    expect(hiBall.positions.length / 3).toBe(65 * 49);

    const gimbal = buildPaintRollerCollarMesh(0.55);
    wellFormed(gimbal.mesh);
    expect(gimbal.tones.length).toBe(gimbal.mesh.positions.length);
    expect(gimbal.mesh.positions.length / 3).toBeGreaterThan(8000);
    // Hero gyro + Paint-Runner Mascot fits cleanly inside the 0.935 m shield bubble (`0.55 * 1.7`)
    let maxRollerRad = 0;
    for (let i = 0; i < gimbal.mesh.positions.length; i += 3) {
      maxRollerRad = Math.max(
        maxRollerRad,
        Math.hypot(gimbal.mesh.positions[i]!, gimbal.mesh.positions[i + 1]!, gimbal.mesh.positions[i + 2]!)
      );
    }
    expect(maxRollerRad).toBeLessThanOrEqual(0.935);

    const gateCarnival = mergeMeshes([...carnivalGateFrameParts(), gateDripMesh()]);
    wellFormed(gateCarnival);
    expect(gateCarnival.positions.length / 3).toBeGreaterThan(4000);

    const curtain = gateCurtainMesh();
    wellFormed(curtain);
    expect(curtain.positions.length / 3).toBe(17 * 9);

    const rail = curbRailMesh(20);
    wellFormed(rail);
    expect(rail.positions.length / 3).toBe(42);

    const chevron = trackChevronMesh();
    wellFormed(chevron);
    expect(bounds(chevron).hi[1]).toBeGreaterThan(0.03);

    const hazard = buildCarnivalInkHazardMesh();
    wellFormed(hazard);
    expect(hazard.positions.length / 3).toBeGreaterThan(1000);

    const { archMesh, archTones, sweeperMesh, sweeperTones } = buildFinishArchAndSweeperMeshes();
    wellFormed(archMesh);
    wellFormed(sweeperMesh);
    expect(archTones.length).toBe(archMesh.positions.length);
    expect(sweeperTones.length).toBe(sweeperMesh.positions.length);
    expect(archMesh.positions.length / 3).toBeGreaterThan(15000);
    expect(sweeperMesh.positions.length / 3).toBeGreaterThan(4000);

    // Carnival matte track SSR & planar deck mirror are toned down (`<= 0.14`)
    expect(LOOKS.carnival.post?.ssr.intensity).toBeLessThanOrEqual(0.14);
    expect(LOOKS.carnival.toon?.mirror?.gates).toBeLessThanOrEqual(0.14);
    expect(LOOKS.carnival.toon?.mirror?.sky).toBeLessThanOrEqual(0.14);
  });
});
