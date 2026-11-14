import { describe, expect, it } from "vitest";
import { material } from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
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
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  srgbHexToLinearRgba,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
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

  it("subdivides smooth organic surfaces and coalesces multi-color dielectric slots into linear vertex-colored PBR draws", () => {
    const baseBox = bevelBoxMesh(0.8, 0.6, 1.2, 0.08);
    const smoothed = bakeMeshCavityAO(subdivideSmoothMesh(baseBox, 1), 0.2);
    assertFiniteWatertightSpec(smoothed, "subdivideSmoothMesh");
    expect(smoothed.indices.length).toBe(baseBox.indices.length * 4);
    expect(smoothed.colors?.length).toBe((smoothed.positions.length / 3) * 4);

    const limb = sculptHumanoidLimbMesh([[0, 0.8, 0, 0.09], [0, 0.42, 0.04, 0.075], [0, 0.06, 0, 0.055]], 12, 0.16);
    assertFiniteWatertightSpec(limb, "sculptHumanoidLimbMesh");

    const hull = sculptStreamlinedHullMesh(2.4, 0.72, 0.58, { canopyBulge: 0.25 });
    assertFiniteWatertightSpec(hull, "sculptStreamlinedHullMesh");

    const rgba = srgbHexToLinearRgba("#808080");
    expect(rgba[0]).toBeGreaterThan(0.2);
    expect(rgba[0]).toBeLessThan(0.24);

    // 4 matte dielectric colors + 1 emissive visor => coalesced to 2 draw-call children (1 matte vertex-colored + 1 emissive)
    const characterNode = assembleMultiMaterialNode(
      "test-character",
      [
        { mesh: limb, materialIndex: 0 },
        { mesh: transformMesh(limb, { pos: [0.2, 0, 0] }), materialIndex: 1 },
        { mesh: hull, materialIndex: 2 },
        { mesh: baseBox, materialIndex: 3 },
        { mesh: transformMesh(baseBox, { scale: 0.2 }), materialIndex: 4 }
      ],
      [
        material.matteClay({ color: "#e09f7d", roughness: 0.62 }),
        material.fabric({ color: "#1d4ed8", roughness: 0.78 }),
        material.fabric({ color: "#1e293b", roughness: 0.72 }),
        material.blackRubber({ color: "#18181b", roughness: 0.86 }),
        material.emissive({ color: "#38bdf8", intensity: 2.2 })
      ]
    );
    expect(characterNode.toJSON().children.length).toBe(2);
  });

  it("sculpts smooth organic SDF Surface-Nets bodies, Taubin-faired meshes, curved hair locks, draped garments, and stylized heads", () => {
    const sdfCreature = sculptOrganicSdfMesh({
      boundsMin: [-0.45, -0.05, -0.45],
      boundsMax: [0.45, 0.95, 0.45],
      resolution: 26,
      evaluate: (x, y, z) => {
        const torso = sdfEllipsoid([x, y, z], [0, 0.38, 0], [0.28, 0.32, 0.26]);
        const browL = sdfEllipsoid([x, y, z], [-0.14, 0.68, 0.08], [0.11, 0.11, 0.11]);
        const browR = sdfEllipsoid([x, y, z], [0.14, 0.68, 0.08], [0.11, 0.11, 0.11]);
        const legL = sdfTaperedCapsule([x, y, z], [-0.18, 0.24, -0.05], [-0.22, 0.04, 0.12], 0.09, 0.06);
        const legR = sdfTaperedCapsule([x, y, z], [0.18, 0.24, -0.05], [0.22, 0.04, 0.12], 0.09, 0.06);
        return sminPoly(sminPoly(sminPoly(torso, browL, 0.08), browR, 0.08), Math.min(legL, legR), 0.07);
      }
    });
    assertFiniteWatertightSpec(sdfCreature, "sculptOrganicSdfMesh");
    expect(sdfCreature.positions.length / 3).toBeGreaterThan(200);

    const faired = taubinSmoothMesh(bevelBoxMesh(0.7, 0.7, 0.7, 0.08), 4);
    assertFiniteWatertightSpec(faired, "taubinSmoothMesh");

    const hairLock = sculptCurvedHairLockMesh({
      root: [0, 0.16, -0.02],
      mid: [0.08, 0.25, -0.1],
      tip: [0.14, 0.19, -0.24],
      width: 0.08
    });
    assertFiniteWatertightSpec(hairLock, "sculptCurvedHairLockMesh");

    const cloak = sculptDrapedGarmentMesh([
      { y: 0.12, rx: 0.34, rz: 0.3, folds: 7, foldAmp: 0.05 },
      { y: 0.52, rx: 0.27, rz: 0.24, folds: 5, foldAmp: 0.03 },
      { y: 0.92, rx: 0.18, rz: 0.16 }
    ]);
    assertFiniteWatertightSpec(cloak, "sculptDrapedGarmentMesh");

    const head = sculptStylizedHeadMesh(0.14, { jawTaper: 0.24, noseBridge: 0.18 });
    assertFiniteWatertightSpec(head, "sculptStylizedHeadMesh");
  });

  it("builds a 15-slot smooth folk body with a fine torso ring and a bounded triangle budget", () => {
    const opts = { coatMat: 0, trimMat: 1, skinMat: 2, hairHatMat: 3, trouserMat: 4, bagMat: 5 } as const;
    for (const wearingHat of [true, false]) {
      const slots = articulatedFolkSlots({ ...opts, wearingHat });
      expect(slots).toHaveLength(15); // callers partition crowds by slot index
      const tris = slots.reduce((a, x) => a + x.mesh.indices.length / 3, 0);
      expect(tris).toBeLessThan(2600);
      for (const slot of slots) {
        for (const v of slot.mesh.positions) expect(Number.isFinite(v)).toBe(true);
      }
      // Torso loft (slot 4): 5 sections of 24 ring points, Taubin-faired.
      const torso = slots[4]!.mesh;
      expect(torso.positions.length / 3).toBeGreaterThanOrEqual(5 * 24);
    }
  });
});
