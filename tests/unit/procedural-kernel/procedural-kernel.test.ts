import { describe, expect, it } from "vitest";
import { material } from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  fbm3,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type RawMesh,
  type V3
} from "../../../apps/showcase-port-shared/proceduralKernel";

function assertFiniteWatertightSpec(mesh: RawMesh, label: string): void {
  expect(mesh.positions.length, `${label} positions`).toBeGreaterThanOrEqual(9);
  expect(mesh.positions.length % 3, `${label} pos%3`).toBe(0);
  expect(mesh.normals.length, `${label} normals length`).toBe(mesh.positions.length);
  expect(mesh.uvs.length, `${label} uvs length`).toBe((mesh.positions.length / 3) * 2);
  expect(mesh.indices.length, `${label} indices`).toBeGreaterThanOrEqual(3);
  expect(mesh.indices.length % 3, `${label} idx%3`).toBe(0);
  const vCount = mesh.positions.length / 3;
  for (let i = 0; i < mesh.positions.length; i += 1) {
    expect(Number.isFinite(mesh.positions[i]!), `${label} pos[${i}]`).toBe(true);
    expect(Number.isFinite(mesh.normals[i]!), `${label} norm[${i}]`).toBe(true);
  }
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const len = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
    expect(len, `${label} unit normal at ${i}`).toBeGreaterThan(0.95);
    expect(len, `${label} unit normal at ${i}`).toBeLessThan(1.05);
  }
  for (let i = 0; i < mesh.indices.length; i += 1) {
    const idx = mesh.indices[i]!;
    expect(idx >= 0 && idx < vCount, `${label} index bounds`).toBe(true);
  }
}

describe("WP-00 shared proceduralKernel (@aura3d/engine 5.5.1, zero three imports)", () => {
  it("produces deterministic noise and smooth 2D/3D splines", () => {
    expect(hash01(42)).toBe(hash01(42));
    expect(hash01(42)).toBeGreaterThanOrEqual(0);
    expect(hash01(42)).toBeLessThan(1);
    const n = fbm3(1.2, -0.4, 3.7, 9);
    expect(n).toBe(fbm3(1.2, -0.4, 3.7, 9));
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(1);

    const spline = catmullRomSpline3([[0, 0, 0], [1, 2, -1], [3, 1, -4]], 6, false);
    expect(spline.length).toBe(13);
    expect(spline[0]![0]).toBeCloseTo(0, 5);
    expect(spline[spline.length - 1]![2]).toBeCloseTo(-4, 5);

    const bez = bezierCurve2([0, 0], [0.4, 0.2], [0.8, 0.9], [1, 1], 10);
    expect(bez.length).toBe(11);
    expect(bez[0]).toEqual([0, 0]);
    expect(bez[10]).toEqual([1, 1]);
  });

  it("builds valid outward-wound curved, bevelled, lathed, swept, extruded, and lofted surfaces", () => {
    assertFiniteWatertightSpec(bevelBoxMesh(1.4, 0.8, 2.2, 0.06), "bevelBoxMesh");
    assertFiniteWatertightSpec(latheMesh([[0, 0], [0.4, 0.05], [0.35, 0.8], [0, 1.0]], 16), "latheMesh");
    assertFiniteWatertightSpec(
      tubeSweepMesh([[0, 0, 0, 0.14], [0.2, 0.8, -0.1, 0.1], [0.5, 1.5, -0.3, 0.05]], 10),
      "tubeSweepMesh"
    );
    // Concave L-shape polygon extrusion with bevel
    assertFiniteWatertightSpec(
      extrudePolygonMesh([[0, 0], [1, 0], [1, 0.35], [0.35, 0.35], [0.35, 1], [0, 1]], 0.4, 0.03),
      "extrudePolygonMesh"
    );

    // Lofted car-like 3-section hull with negative-Z progression (verifies auto-outward winding)
    const mkRing = (z: number, rx: number, ry: number): V3[] => [
      [-rx, 0, z], [rx, 0, z], [rx * 0.82, ry, z], [-rx * 0.82, ry, z]
    ];
    const loftFwd = loftSectionsMesh([mkRing(2.0, 0.8, 0.45), mkRing(0, 0.95, 0.62), mkRing(-2.0, 0.75, 0.38)], true);
    assertFiniteWatertightSpec(loftFwd, "loftSectionsMesh");
    assertFiniteWatertightSpec(icosphereFacetMesh(0.8, 1, 0.15, 7), "icosphereFacetMesh");

    // Negative scale flips triangle winding so outward normals stay consistent
    const mirrored = transformMesh(bevelBoxMesh(1, 1, 1, 0.05), { scale: [-1, 1, 1], pos: [2, 0, -1] });
    assertFiniteWatertightSpec(toFlatShaded(mirrored), "mirrored bevelBox");
  });

  it("builds compound sub-assemblies and multi-material @aura3d/engine nodes with precomputed bounds", () => {
    const wheelSlots = wheelAssemblySlots({
      radius: 0.34,
      width: 0.24,
      spokeCount: 5,
      tireMat: 0,
      rimMat: 1,
      rotorMat: 2
    });
    expect(wheelSlots.length).toBeGreaterThanOrEqual(12);
    const groupedWheel = buildGroupedGeometrySpec(wheelSlots);
    expect(groupedWheel.bounds).toBeDefined();
    expect(groupedWheel.groups?.length).toBe(3);

    const truss = latticeTrussMesh({ span: [8, 1.2, 1.0], bays: 6, chordRadius: 0.05 });
    assertFiniteWatertightSpec(truss, "latticeTrussMesh");

    const arch = archwayVoussoirSlots({
      radius: 2.2,
      thickness: 0.42,
      depth: 0.6,
      voussoirs: 9,
      stoneMatA: 0,
      stoneMatB: 1,
      keystoneMat: 2
    });
    expect(arch.length).toBe(9);

    assertFiniteWatertightSpec(layeredCanopyMesh({ radius: 1.8, height: 2.2, puffs: 9, seed: 5 }), "layeredCanopyMesh");
    assertFiniteWatertightSpec(coniferBoughTierMesh({ baseRadius: 1.4, height: 3.6, tiers: 5, seed: 13 }), "coniferBoughTierMesh");
    assertFiniteWatertightSpec(stratifiedCliffMesh({ radiusX: 4, radiusZ: 3, height: 5, terraces: 5, seed: 21 }), "stratifiedCliffMesh");

    const merged = mergeRawMeshes([truss]);
    expect(merged.bounds).toBeDefined();

    const node = assembleMultiMaterialNode(
      "test-wheel",
      wheelSlots,
      [
        material.blackRubber({ roughness: 0.85 }),
        material.studioMetal({ color: "#d4dbe4", roughness: 0.22 }),
        material.studioMetal({ color: "#8c939e", roughness: 0.36 })
      ],
      { id: "wheel-fl", tags: ["vehicle"], position: [-0.85, 0.34, -1.35] }
    );
    const json = node.toJSON();
    expect(json.kind).toBe("group");
    expect(json.runtime?.id).toBe("wheel-fl");
    expect(json.children.length).toBe(3);
  });
});
