/**
 * Slingshot Siege — 100% Native `@aura3d/engine` Multi-Material Procedural 3D Models (5.5.4 Craft Overhaul).
 *
 * Sculpted procedural assemblies built on the shared `@aura3d/engine` procedural kernel
 * (`subdivideSmoothMesh`, `sculptHumanoidLimbMesh`, `sculptStreamlinedHullMesh`, `loftSectionsMesh`,
 * `extrudePolygonMesh`, `coniferBoughTierMesh`, `stratifiedCliffMesh`, `assembleMultiMaterialNode`,
 * `memoizeGeometry`) with automatic vertex-color finish-bucket coalescing and baked cavity AO.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  fbm3,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  norm3,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  type AuraGroupNode,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import type { AmmoId } from "../game/ammo";
import type { ChapterLook } from "../game/look";

export {
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  group,
  latheMesh,
  mergeRawMeshes,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh
};

export function extrudeStarPolygonMesh(poly: readonly V2[], depth: number): RawMesh {
  return extrudePolygonMesh(poly, depth);
}

function ovalRing(rx: number, rz: number, y: number, segs = 12, cx = 0, cz = 0): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.sin(a) * rx, y, cz + Math.cos(a) * rz]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Shared Craft Materials Palette (Multi-Lobe PBR, zero ambient-fill violations)
// ---------------------------------------------------------------------------

const ashlarStoneMat = material.ceramic({
  name: "coursed ashlar limestone",
  color: "#dfd8c8",
  roughness: 0.74,
  clearcoat: 0.2,
  clearcoatRoughness: 0.4,
  envMapIntensity: 1.15
});

export const CRAFT_MATS = {
  seasonedOak: material.physical({
    name: "seasoned siege oak",
    color: "#8a5a32",
    roughness: 0.62,
    metallic: 0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.28,
    normal: material.proceduralTextures.fabric({ scale: 16, strength: 0.36, contrast: 0.64 }),
    envMapIntensity: 1.22
  }),
  darkWalnut: material.physical({
    name: "aged dark walnut",
    color: "#4a2e19",
    roughness: 0.68,
    metallic: 0,
    clearcoat: 0.26,
    clearcoatRoughness: 0.34,
    normal: material.proceduralTextures.fabric({ scale: 18, strength: 0.32, contrast: 0.64 })
  }),
  cratePine: material.physical({
    name: "chamfered crate pine",
    color: "#c8965a",
    roughness: 0.6,
    metallic: 0,
    clearcoat: 0.32,
    clearcoatRoughness: 0.26,
    normal: material.proceduralTextures.fabric({ scale: 15, strength: 0.32, contrast: 0.62 }),
    envMapIntensity: 1.2
  }),
  saddleLeather: material.matteClay({
    name: "stitched saddle leather",
    color: "#613519",
    roughness: 0.66
  }),
  elasticRubber: material.blackRubber({
    name: "siege sling band rubber",
    color: "#382624",
    roughness: 0.76
  }),
  forgedIron: material.brushedMetal({
    name: "forged blackened iron",
    color: "#3d4552",
    roughness: 0.32,
    envMapIntensity: 1.42
  }),
  navalBrass: material.studioMetal({
    name: "turned naval brass",
    color: "#e4bc5c",
    roughness: 0.22,
    envMapIntensity: 1.55
  }),
  ashlarStone: ashlarStoneMat,
  limestoneAshlar: ashlarStoneMat,
  quoinStone: material.ceramic({
    name: "dressed quoin stone",
    color: "#c2b9a6",
    roughness: 0.78,
    clearcoat: 0.16,
    clearcoatRoughness: 0.42
  }),
  whitewashPlaster: material.ceramic({
    name: "coastal whitewash masonry",
    color: "#f2ede2",
    roughness: 0.72,
    clearcoat: 0.2,
    clearcoatRoughness: 0.38
  }),
  slateRoof: material.ceramic({
    name: "coastal slate tiles",
    color: "#36495c",
    roughness: 0.46,
    clearcoat: 0.48,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.28
  }),
  terracottaRoof: material.ceramic({
    name: "terracotta ridge tiles",
    color: "#b84a35",
    roughness: 0.52,
    clearcoat: 0.42,
    clearcoatRoughness: 0.26
  }),
  lighthouseRed: material.lacquer({
    name: "lighthouse crimson stripe",
    color: "#cf352b",
    roughness: 0.26,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08
  }),
  tntRed: material.lacquer({
    name: "powder keg crimson lacquer",
    color: "#b8241d",
    roughness: 0.24,
    clearcoat: 0.88,
    clearcoatRoughness: 0.1
  }),
  sailCanvas: material.fabric({
    name: "stitched windmill canvas",
    color: "#f7efe0",
    roughness: 0.82,
    sheen: 0.45,
    sheenColor: "#fff8eb"
  }),
  hempRope: material.fabric({
    name: "braided hemp line",
    color: "#bfa074",
    roughness: 0.88,
    sheen: 0.3,
    sheenColor: "#e6d0a8"
  }),
  amberWindow: material.physical({
    name: "warm lantern window",
    color: "#ffcf7c",
    roughness: 0.18,
    metallic: 0,
    clearcoat: 0.9,
    emissive: "#ff9e38",
    emissiveIntensity: 1.35,
    practical: true
  }),
  pineBark: material.physical({
    name: "monterey pine bark",
    color: "#5d4029",
    roughness: 0.86,
    metallic: 0,
    normal: material.proceduralTextures.fabric({ scale: 20, strength: 0.42, contrast: 0.7 })
  }),
  pineFoliage: material.physical({
    name: "coastal cypress needles",
    color: "#2d5c3b",
    roughness: 0.68,
    metallic: 0,
    sheen: 0.28,
    sheenColor: "#8ec479",
    clearcoat: 0.16,
    clearcoatRoughness: 0.44
  }),
  cliffTurfCap: material.physical({
    name: "headland meadow cap",
    color: "#5f8c49",
    roughness: 0.8,
    metallic: 0,
    sheen: 0.3,
    sheenColor: "#b8d982"
  }),
  cloudFluff: material.physical({
    name: "coastal cumulus puff",
    color: "#fffcf5",
    roughness: 0.92,
    metallic: 0,
    sheen: 0.45,
    sheenColor: "#ffffff"
  })
} as const;

// ---------------------------------------------------------------------------
// 1. Sculpted Terraced Coastal Island & Stratified Limestone Sea-Cliffs
// ---------------------------------------------------------------------------

/**
 * Organic scalloped coastal plateau mesh (unit diameter ~1.0, height ~1.0 centered at Y=0).
 * When `cliffFacet` is false (`stage-ground`), uses smooth vertex normals across the crowned
 * meadow so directional sunlight renders buttery-smooth without faceted triangle striping.
 */
export function buildTerracedIslandSpec(seed: number, lobeAmp = 0.06, cliffFacet = false): AuraCustomGeometrySpec {
  return memoizeGeometry(`siege:island:${seed}:${lobeAmp.toFixed(3)}:${cliffFacet ? 1 : 0}`, () => {
    const segs = 64;
    const rings = 6;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const ringProfile: readonly { rFrac: number; y: number; jitter: number }[] = [
      { rFrac: 0.95, y: -0.55, jitter: 1.0 },
      { rFrac: 1.02, y: -0.18, jitter: 1.12 },
      { rFrac: 0.98, y: 0.2, jitter: 0.92 },
      { rFrac: 0.92, y: 0.46, jitter: 0.62 },
      { rFrac: 0.72, y: 0.505, jitter: 0.32 },
      { rFrac: 0.38, y: 0.525, jitter: 0.12 }
    ];

    const radAt = (angle: number, jitterScale: number): number => {
      const wave =
        Math.sin(angle * 3 + seed * 1.1) * 0.42 +
        Math.cos(angle * 5 - seed * 0.7) * 0.31 +
        Math.sin(angle * 9 + seed * 2.3) * 0.27;
      return 0.5 * (1 + wave * lobeAmp * jitterScale);
    };

    for (let rIdx = 0; rIdx < rings; rIdx += 1) {
      const rp = ringProfile[rIdx]!;
      for (let i = 0; i <= segs; i += 1) {
        const phi = (i / segs) * Math.PI * 2;
        const rad = radAt(phi, rp.jitter) * rp.rFrac;
        const x = Math.sin(phi) * rad;
        const z = Math.cos(phi) * rad;
        const crown = rIdx >= 3 ? Math.sin(phi * 2 + seed) * 0.008 : 0;
        positions.push(x, rp.y + crown, z);
        const outN = rIdx >= 3 ? norm3([x * 0.1, 1, z * 0.1]) : norm3([Math.sin(phi), 0.24, Math.cos(phi)]);
        normals.push(outN[0], outN[1], outN[2]);
        uvs.push(0.5 + x, 0.5 + z);
      }
    }

    const stride = segs + 1;
    for (let rIdx = 0; rIdx < rings - 1; rIdx += 1) {
      for (let i = 0; i < segs; i += 1) {
        const a = rIdx * stride + i;
        const b = a + 1;
        const c = (rIdx + 1) * stride + i + 1;
        const d = (rIdx + 1) * stride + i;
        indices.push(a, b, c, a, c, d);
      }
    }

    const topRing = (rings - 1) * stride;
    const cIdx = positions.length / 3;
    positions.push(0, 0.535, 0);
    normals.push(0, 1, 0);
    uvs.push(0.5, 0.5);
    for (let i = 0; i < segs; i += 1) {
      indices.push(cIdx, topRing + i, topRing + i + 1);
    }

    const raw: RawMesh = { positions, normals, uvs, indices };
    return mergeRawMeshes([cliffFacet ? toFlatShaded(raw) : raw]);
  });
}

/**
 * Stratified coastal limestone sea-cliff crag built with `stratifiedCliffMesh` + secondary sea-stack spire.
 */
export function buildFacetedSeaCliffMesh(seed = 11): RawMesh {
  const mainCrag = transformMesh(
    stratifiedCliffMesh({
      radiusX: 0.58,
      radiusZ: 0.52,
      height: 1.04,
      terraces: 6,
      seed
    }),
    { pos: [0, -0.52, 0] }
  );
  const spire = transformMesh(
    stratifiedCliffMesh({
      radiusX: 0.26,
      radiusZ: 0.24,
      height: 0.92,
      terraces: 5,
      seed: seed + 19
    }),
    { pos: [0.34, -0.48, 0.14], rot: [0.04, 0.78, -0.06] }
  );
  return {
    positions: [...mainCrag.positions, ...spire.positions],
    normals: [...mainCrag.normals, ...spire.normals],
    uvs: [...mainCrag.uvs, ...spire.uvs],
    indices: [
      ...mainCrag.indices,
      ...spire.indices.map((idx) => idx + mainCrag.positions.length / 3)
    ]
  };
}

export function buildCliffTurfCapSpec(seed = 11): AuraCustomGeometrySpec {
  return memoizeGeometry(`siege:cliff-turf:${seed}`, () => {
    const segs = 15;
    const rings: readonly { y: number; r: number; ledge: number }[] = [
      { y: 0.44, r: 0.44, ledge: 0.98 },
      { y: 0.51, r: 0.39, ledge: 0.92 },
      { y: 0.56, r: 0.24, ledge: 0.78 }
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let t = 0; t < rings.length; t += 1) {
      const tier = rings[t]!;
      for (let i = 0; i <= segs; i += 1) {
        const idx = i % segs;
        const phi = (idx / segs) * Math.PI * 2;
        const sx = Math.sin(phi), cz = Math.cos(phi);
        const n = fbm3(sx * 1.8 + seed, 0.44 * 2.4, cz * 1.8 - seed, seed);
        const ridge = 0.76 + n * 0.48;
        const rx = sx * tier.r * tier.ledge * ridge;
        const rz = cz * tier.r * tier.ledge * (0.84 + (1 - n) * 0.32);
        positions.push(rx, tier.y, rz);
        const outN = norm3([sx * 0.42, 0.9, cz * 0.42]);
        normals.push(outN[0], outN[1], outN[2]);
        uvs.push(i / segs, t / (rings.length - 1));
      }
    }
    const stride = segs + 1;
    for (let t = 0; t < rings.length - 1; t += 1) {
      for (let i = 0; i < segs; i += 1) {
        const a = t * stride + i;
        const b = a + 1;
        const c = (t + 1) * stride + i + 1;
        const d = (t + 1) * stride + i;
        indices.push(a, b, c, a, c, d);
      }
    }
    const topStart = (rings.length - 1) * stride;
    const topCenter = positions.length / 3;
    positions.push(0, 0.59, 0);
    normals.push(0, 1, 0);
    uvs.push(0.5, 0.5);
    for (let i = 0; i < segs; i += 1) {
      indices.push(topCenter, topStart + i, topStart + i + 1);
    }
    return mergeRawMeshes([subdivideSmoothMesh({ positions, normals, uvs, indices }, 1, 0.42)]);
  });
}

// ---------------------------------------------------------------------------
// 2. Carved-Oak Y-Frame Siege Slingshot, Forged-Iron Hardware & Leather Pouch
// ---------------------------------------------------------------------------

export function buildSiegeSlingshotRigNode(position: V3, rotationY: number, runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0 = quoinStone, 1 = seasonedOak, 2 = darkWalnut, 3 = forgedIron, 4 = navalBrass, 5 = hempRope
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.48, 0.22, 1.38, 0.04), { pos: [0, -0.22, 0] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.22, 0.16, 1.12, 0.03), { pos: [0, -0.04, 0] }), materialIndex: 0 });

  for (const sz of [-0.38, 0.38]) {
    // Sculpted carved-oak longitudinal skids with scrolled prow ends
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.18, 0.15, 0.15, 0.028), { pos: [0, 0.1, sz] }), materialIndex: 1 });
    slots.push({
      mesh: transformMesh(
        extrudePolygonMesh([[-0.12, -0.07], [0.1, -0.07], [0.14, 0.05], [0.02, 0.09], [-0.12, 0.04]], 0.15),
        { pos: [0.58, 0.12, sz] }
      ),
      materialIndex: 2
    });
    // Mortised diagonal oak buttress struts
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.11, 0.64, 0.11, 0.022), { pos: [-0.24, 0.35, sz * 0.68], rot: [sz * 0.28, 0, -0.46] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.11, 0.6, 0.11, 0.022), { pos: [0.24, 0.33, sz * 0.68], rot: [sz * 0.28, 0, 0.48] }),
      materialIndex: 1
    });
    // Forged-iron gusset straps + brass rivet bosses
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.26, 0.17, 0.17, 0.016), { pos: [0, 0.12, sz] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.19, 0.16, 0.17, 0.016), { pos: [-0.46, 0.1, sz] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.19, 0.16, 0.17, 0.016), { pos: [0.46, 0.1, sz] }), materialIndex: 3 });
    slots.push({
      mesh: transformMesh(latheMesh([[0, -0.095], [0.035, -0.095], [0.035, 0.095], [0, 0.095]], 8), {
        pos: [0, 0.12, sz],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 4
    });
  }

  // Heavy mortised oak cross-transoms
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.26, 0.18, 0.92, 0.028), { pos: [0, 0.14, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.12, 0.88, 0.022), { pos: [-0.45, 0.11, 0] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.12, 0.88, 0.022), { pos: [0.45, 0.11, 0] }), materialIndex: 1 });

  // Rear brass tension winch drum + toothed iron ratchet gear + crank arm + braided hemp rope coil
  slots.push({
    mesh: transformMesh(
      latheMesh([[0.0, -0.3], [0.115, -0.3], [0.088, -0.22], [0.088, 0.22], [0.115, 0.3], [0.0, 0.3]], 14),
      { pos: [-0.45, 0.27, 0], rot: [Math.PI * 0.5, 0, 0] }
    ),
    materialIndex: 4
  });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0.096, -0.19], [0.108, -0.09], [0.104, 0], [0.108, 0.09], [0.096, 0.19]], 14),
      { pos: [-0.45, 0.27, 0], rot: [Math.PI * 0.5, 0, 0] }
    ),
    materialIndex: 5
  });
  const ratchetGear: V2[] = [];
  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.185 : 0.145;
    ratchetGear.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  slots.push({
    mesh: transformMesh(extrudeStarPolygonMesh(ratchetGear, 0.045), { pos: [-0.45, 0.27, 0.35] }),
    materialIndex: 3
  });
  slots.push({
    mesh: tubeSweepMesh([[-0.45, 0.27, 0.38, 0.022], [-0.45, 0.44, 0.4, 0.02], [-0.45, 0.44, 0.52, 0.024]], 8),
    materialIndex: 4
  });

  // Forged-iron yoke pedestal socket + twin brass reinforcing collars
  slots.push({
    mesh: latheMesh([[0.21, 0.18], [0.175, 0.38], [0.15, 0.58], [0, 0.58]], 16),
    materialIndex: 3
  });
  slots.push({
    mesh: latheMesh([[0.165, 0.44], [0.18, 0.49], [0.162, 0.54]], 16),
    materialIndex: 4
  });

  return assembleMultiMaterialNode(
    "slingshot-base",
    slots,
    [
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.seasonedOak,
      CRAFT_MATS.darkWalnut,
      CRAFT_MATS.forgedIron,
      CRAFT_MATS.navalBrass,
      CRAFT_MATS.hempRope
    ],
    {
      id: runtimeId,
      tags: ["sling"],
      position,
      rotation: [0, rotationY, 0],
      castShadow: true,
      receiveShadow: true
    }
  );
}

/**
 * Carved-oak Y-frame yoke with iron tension bands, hemp crotch lashing, and brass fork-tip ferrules
 * terminating cleanly at `FORK_TIPS` (`[-7.79, 1.89, +/-0.22]`).
 */
export function buildSlingshotYokeNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0 = seasonedOak, 1 = darkWalnut, 2 = forgedIron, 3 = navalBrass, 4 = hempRope
  const stemLoft = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        ovalRing(0.13, 0.14, 0.76, 12, -7.4, 0),
        ovalRing(0.115, 0.135, 1.06, 12, -7.44, 0),
        ovalRing(0.105, 0.17, 1.34, 12, -7.49, 0)
      ],
      true,
      true
    ),
    1,
    0.45
  );
  slots.push({ mesh: stemLoft, materialIndex: 0 });

  // Forged-iron waist band around the carved trunk
  slots.push({
    mesh: transformMesh(latheMesh([[0.128, -0.055], [0.136, 0], [0.128, 0.055]], 14), {
      pos: [-7.43, 1.02, 0],
      rot: [0, 0, 0.12]
    }),
    materialIndex: 2
  });

  for (const sgn of [-1, 1]) {
    // Swept carved-oak Y-prong curving smoothly out to FORK_TIPS [-7.79, 1.89, ±0.22]
    const armMesh = subdivideSmoothMesh(
      tubeSweepMesh(
        [
          [-7.49, 1.31, sgn * 0.03, 0.092],
          [-7.58, 1.5, sgn * 0.13, 0.08],
          [-7.7, 1.72, sgn * 0.2, 0.07],
          [-7.79, 1.93, sgn * 0.22, 0.06]
        ],
        12
      ),
      1,
      0.38
    );
    slots.push({ mesh: armMesh, materialIndex: 0 });

    // Mid-arm forged-iron reinforcing band
    slots.push({
      mesh: transformMesh(latheMesh([[0.076, -0.035], [0.084, 0], [0.076, 0.035]], 12), {
        pos: [-7.64, 1.61, sgn * 0.165],
        rot: [sgn * 0.22, 0, 0.44]
      }),
      materialIndex: 2
    });

    // Turned naval-brass prong ferrule & recessed elastic band collar at [-7.79, 1.89, ±0.22]
    slots.push({
      mesh: transformMesh(
        latheMesh([[0.0, -0.055], [0.074, -0.05], [0.058, 0.0], [0.078, 0.055], [0.052, 0.095], [0, 0.11]], 14),
        { pos: [-7.79, 1.89, sgn * 0.22], rot: [sgn * 0.1, 0, 0.42] }
      ),
      materialIndex: 3
    });
  }

  // Crisscrossed braided hemp crotch lashing + walnut saddle wedge
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.16, 0.11, 0.24, 0.025), { pos: [-7.5, 1.36, 0], rot: [0, 0, 0.24] }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0.114, -0.075], [0.126, 0], [0.114, 0.075]], 14), {
      pos: [-7.48, 1.32, 0],
      rot: [0, 0, 0.22]
    }),
    materialIndex: 4
  });

  return assembleMultiMaterialNode(
    "sling-driftwood-yoke",
    slots,
    [
      CRAFT_MATS.seasonedOak,
      CRAFT_MATS.darkWalnut,
      CRAFT_MATS.forgedIron,
      CRAFT_MATS.navalBrass,
      CRAFT_MATS.hempRope
    ],
    { castShadow: true, receiveShadow: true }
  );
}

/**
 * Sculpted cupped saddle-leather cradle pouch (unit bounds ~[-0.5, 0.5] so `.scale([0.26, 0.12, 0.26])` fits cleanly).
 */
export function buildSlingshotPouchSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:sling-pouch", () => {
    const cup = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          ovalRing(0.32, 0.34, -0.45, 12),
          ovalRing(0.5, 0.52, 0.05, 12),
          ovalRing(0.46, 0.48, 0.45, 12)
        ],
        true,
        true
      ),
      1,
      0.5
    );
    const earL = transformMesh(bevelBoxMesh(0.24, 0.36, 0.18, 0.04), { pos: [0, 0.18, -0.52] });
    const earR = transformMesh(bevelBoxMesh(0.24, 0.36, 0.18, 0.04), { pos: [0, 0.18, 0.52] });
    return mergeRawMeshes([cup, earL, earR]);
  });
}

// ---------------------------------------------------------------------------
// 3. Stone Launch Bastion, Arched Causeway Bridge & Fortress Plinths
// ---------------------------------------------------------------------------

export function buildLaunchBastionNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0 = ashlarStone, 1 = quoinStone, 2 = seasonedOak, 3 = forgedIron
  slots.push({
    mesh: transformMesh(
      latheMesh([[1.86, -0.36], [1.72, 0.12], [1.58, 0.34], [1.64, 0.42], [0.0, 0.42]], 12, true),
      { pos: [-7.4, 0, 0] }
    ),
    materialIndex: 0
  });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.36, 0.44, 0.28, 0.035), {
        pos: [-7.4 + Math.sin(a) * 1.56, 0.16, Math.cos(a) * 1.56],
        rot: [0, a, 0]
      }),
      materialIndex: 1
    });
  }
  for (let p = -3; p <= 3; p += 1) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(2.22, 0.055, 0.28, 0.014), { pos: [-7.4, 0.43, p * 0.31] }),
      materialIndex: 2
    });
  }
  for (const [bx, bz] of [[-8.55, -1.05], [-8.55, 1.05], [-6.25, -1.05], [-6.25, 1.05]] as const) {
    slots.push({
      mesh: transformMesh(latheMesh([[0.095, 0], [0.078, 0.22], [0.105, 0.28], [0, 0.32]], 10), { pos: [bx, 0.42, bz] }),
      materialIndex: 3
    });
  }

  return assembleMultiMaterialNode(
    "launch-knoll-and-bridge",
    slots,
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone, CRAFT_MATS.seasonedOak, CRAFT_MATS.forgedIron],
    { id: "launch-knoll", tags: ["stage"], castShadow: false, receiveShadow: true }
  );
}

export function buildArchedStoneBridgeNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  for (let s = -4; s <= 4; s += 1) {
    const t = s / 4;
    const x = t * 1.65;
    const archY = 0.34 + (1 - t * t) * 0.26;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.42, 0.12, 1.18, 0.022), { pos: [x, archY, 0], rot: [0, 0, -t * 0.16] }),
      materialIndex: 2
    });
    for (const pz of [-0.56, 0.56]) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.4, 0.22, 0.15, 0.025), { pos: [x, archY + 0.13, pz], rot: [0, 0, -t * 0.16] }),
        materialIndex: 0
      });
    }
  }
  for (const px of [-1.45, 0, 1.45]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.4, 0.56, 1.32, 0.035), { pos: [px, 0.14, 0] }), materialIndex: 1 });
  }
  return assembleMultiMaterialNode(
    "prop-stone-bridge",
    slots,
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone, CRAFT_MATS.seasonedOak],
    { position: [0.2, 0.02, -2.4], rotation: [0, 0.12, 0], castShadow: false, receiveShadow: true }
  );
}

/**
 * Stepped ashlar foundation plinth under the fort (`[7.2, 0, 0]`).
 * `castShadow: false` and stepped cleanly at `y <= 0.002` so it never casts Moire depth-bias
 * stripes onto `stage-ground` while giving standing fortress blocks a crisp stone apron.
 */
export function buildFortressFoundationNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  slots.push({ mesh: transformMesh(bevelBoxMesh(5.82, 0.24, 4.42, 0.045), { pos: [0, -0.118, 0] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(6.34, 0.22, 4.94, 0.045), { pos: [0, -0.26, 0] }), materialIndex: 1 });
  // Perimeter corner quoins & curb stones (clear of central meadow plane)
  for (const sx of [-2.72, 2.72]) {
    for (let kz = -2; kz <= 2; kz += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.46, 0.25, 0.68, 0.03), { pos: [sx, -0.12, kz * 0.92] }),
        materialIndex: 1
      });
    }
  }
  return assembleMultiMaterialNode(
    "fortress-pad",
    slots,
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone],
    { id: "fortress-pad", tags: ["stage"], position: [7.2, 0, 0], castShadow: false, receiveShadow: true }
  );
}

export function buildFlagBastionNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.26, 0.22, 1.26, 0.035), { pos: [0, 0.11, 0] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.06, 0.78, 1.06, 0.035), { pos: [0, 0.56, 0] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.22, 0.14, 1.22, 0.03), { pos: [0, 1.0, 0] }), materialIndex: 1 });
  for (const [mx, mz] of [
    [-0.46, -0.46], [0, -0.46], [0.46, -0.46],
    [-0.46, 0.46], [0, 0.46], [0.46, 0.46],
    [-0.46, 0], [0.46, 0]
  ] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.24, 0.18, 0.24, 0.025), { pos: [mx, 1.15, mz] }), materialIndex: 1 });
  }
  slots.push({ mesh: latheMesh([[0.22, 1.06], [0.18, 1.24], [0, 1.24]], 12), materialIndex: 2 });

  return assembleMultiMaterialNode(
    "fortress-flag-bastion",
    slots,
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone, CRAFT_MATS.forgedIron],
    { position: [7.2, 0, -0.6], castShadow: true, receiveShadow: true }
  );
}

// ---------------------------------------------------------------------------
// 4. Timber-Framed Castle Towers, Gatehouse, Windmills & Coastal Landmarks
// ---------------------------------------------------------------------------

export function buildWatchtowerNode(runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0 = ashlarStone, 1 = quoinStone, 2 = whitewashPlaster, 3 = darkWalnut, 4 = slateRoof, 5 = navalBrass, 6 = amberWindow
  slots.push({
    mesh: latheMesh(
      [
        [1.2, -0.2],
        [1.1, 0.35],
        [0.95, 1.65],
        [0.9, 2.35],
        [0.0, 2.35]
      ],
      8,
      true
    ),
    materialIndex: 0
  });
  slots.push({ mesh: latheMesh([[1.14, 0.32], [1.16, 0.44], [0.98, 0.48]], 8, true), materialIndex: 1 });

  // Overhanging half-timbered upper guardhouse jetty (whitewash infill + dark walnut timber framing + corbel struts)
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.96, 0.96, 1.96, 0.035), { pos: [0, 2.84, 0] }), materialIndex: 2 });
  for (const sx of [-1.0, 1.0]) {
    for (const sz of [-1.0, 1.0]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 1.02, 0.11, 0.015), { pos: [sx, 2.84, sz] }), materialIndex: 3 });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.1, 0.42, 0.1, 0.015), {
          pos: [sx * 0.82, 2.24, sz * 0.82],
          rot: [sz * -0.35, 0, sx * 0.35]
        }),
        materialIndex: 3
      });
    }
  }
  for (const sy of [2.36, 3.32]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.08, 0.1, 2.08, 0.015), { pos: [0, sy, 0] }), materialIndex: 3 });
  }
  // Half-timber diagonal wall braces
  for (const faceZ of [-1.0, 1.0]) {
    for (const sgn of [-1, 1]) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.84, 0.075, 0.06, 0.01), {
          pos: [sgn * 0.48, 2.84, faceZ],
          rot: [0, 0, sgn * 0.62]
        }),
        materialIndex: 3
      });
    }
  }

  // Steep conical slate roof + rafters + brass weathervane finial
  slots.push({
    mesh: latheMesh([[1.48, 3.34], [0.94, 4.12], [0.42, 4.82], [0.0, 5.28]], 12, true),
    materialIndex: 4
  });
  slots.push({
    mesh: latheMesh([[0.055, 5.22], [0.032, 5.62], [0.095, 5.72], [0.0, 5.84]], 10),
    materialIndex: 5
  });

  // Arched timber door + glowing amber guardroom windows
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.54, 0.9, 0.18, 0.02), { pos: [0, 0.48, 1.04] }), materialIndex: 3 });
  for (const [wx, wz, wy] of [[0, 1.01, 2.84], [1.01, 0, 2.84], [0, -1.01, 2.84]] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.28, 0.44, 0.12, 0.015), {
        pos: [wx, wy, wz],
        rot: [0, wx !== 0 ? Math.PI * 0.5 : 0, 0]
      }),
      materialIndex: 6
    });
  }

  return assembleMultiMaterialNode(
    runtimeId,
    slots,
    [
      CRAFT_MATS.ashlarStone,
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.whitewashPlaster,
      CRAFT_MATS.darkWalnut,
      CRAFT_MATS.slateRoof,
      CRAFT_MATS.navalBrass,
      CRAFT_MATS.amberWindow
    ],
    {
      id: runtimeId,
      tags: ["dressing"],
      position: [-12.4, 0, 4.2],
      rotation: [0, 0.5, 0],
      castShadow: false,
      receiveShadow: true
    }
  );
}

export function buildGatehouseNode(runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0 = ashlarStone, 1 = quoinStone, 2 = whitewashPlaster, 3 = terracottaRoof, 4 = darkWalnut, 5 = forgedIron, 6 = amberWindow
  for (const tx of [-1.28, 1.28]) {
    slots.push({
      mesh: transformMesh(
        latheMesh([[0.78, -0.2], [0.71, 0.42], [0.65, 2.36], [0.78, 2.54], [0.78, 2.76], [0, 2.76]], 8, true),
        { pos: [tx, 0, 0] }
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(latheMesh([[0.86, 2.74], [0.48, 3.42], [0.0, 3.94]], 8, true), { pos: [tx, 0, 0] }),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.22, 0.42, 0.14, 0.015), { pos: [tx, 1.74, 0.65] }),
      materialIndex: 6
    });
  }

  // Timber-framed upper portcullis winch gallery above stone gate piers
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.94, 0.92, 1.14, 0.03), { pos: [0, 1.92, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(2.04, 0.09, 1.22, 0.015), { pos: [0, 1.46, 0] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(2.04, 0.09, 1.22, 0.015), { pos: [0, 2.38, 0] }), materialIndex: 4 });
  for (const bx of [-0.58, 0, 0.58]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.08, 0.92, 1.18, 0.012), { pos: [bx, 1.92, 0] }), materialIndex: 4 });
  }
  // Pitched terracotta gable roof over central gallery
  slots.push({
    mesh: transformMesh(
      extrudePolygonMesh([[-1.04, 0], [1.04, 0], [0, 0.62]], 1.28),
      { pos: [0, 2.4, 0], rot: [0, Math.PI * 0.5, 0] }
    ),
    materialIndex: 3
  });

  for (const sx of [-0.72, 0.72]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.48, 1.44, 1.08, 0.03), { pos: [sx, 0.72, 0] }), materialIndex: 1 });
  }
  // Recessed dark timber gate + wrought-iron portcullis grille
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.98, 1.22, 0.22, 0.02), { pos: [0, 0.6, 0.12] }), materialIndex: 4 });
  for (let b = -2; b <= 2; b += 1) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.045, 1.18, 0.045, 0.008), { pos: [b * 0.18, 0.6, 0.34] }), materialIndex: 5 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.96, 0.05, 0.05, 0.008), { pos: [0, 0.9, 0.34] }), materialIndex: 5 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.96, 0.05, 0.05, 0.008), { pos: [0, 0.48, 0.34] }), materialIndex: 5 });

  return assembleMultiMaterialNode(
    runtimeId,
    slots,
    [
      CRAFT_MATS.ashlarStone,
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.whitewashPlaster,
      CRAFT_MATS.terracottaRoof,
      CRAFT_MATS.darkWalnut,
      CRAFT_MATS.forgedIron,
      CRAFT_MATS.amberWindow
    ],
    {
      id: runtimeId,
      tags: ["dressing"],
      position: [9.8, 0, -2.4],
      rotation: [0, -0.45, 0],
      castShadow: false,
      receiveShadow: true
    }
  );
}

/**
 * Timber-framed Dutch coastal smock windmill (`prop-windmill` with static sails, or `v-mill-m-pole` tower body).
 */
export function buildWindmillNode(
  name: string,
  runtimeId: string,
  tags: readonly string[],
  position: V3,
  rotationY: number,
  scaleVal: number,
  includeStaticSails: boolean
): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0 = quoinStone, 1 = whitewashPlaster, 2 = terracottaRoof, 3 = seasonedOak, 4 = sailCanvas, 5 = navalBrass, 6 = amberWindow
  slots.push({
    mesh: latheMesh([[0.74, -0.12], [0.68, 0.48], [0.6, 0.56], [0, 0.56]], 8, true),
    materialIndex: 0
  });
  slots.push({
    mesh: latheMesh([[0.61, 0.52], [0.49, 1.46], [0.41, 2.24], [0, 2.24]], 8, true),
    materialIndex: 1
  });
  // Half-timbered smock corner ribs
  for (let r = 0; r < 8; r += 1) {
    const a = (r / 8) * Math.PI * 2 + Math.PI / 8;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [Math.sin(a) * 0.59, 0.54, Math.cos(a) * 0.59, 0.032],
          [Math.sin(a) * 0.41, 2.2, Math.cos(a) * 0.41, 0.026]
        ],
        6
      ),
      materialIndex: 3
    });
  }
  // Timber gallery balcony ring + handrail posts + cottage doorway
  slots.push({
    mesh: latheMesh([[0.58, 0.88], [0.78, 0.9], [0.78, 0.96], [0.58, 0.96]], 8, true),
    materialIndex: 3
  });
  slots.push({
    mesh: latheMesh([[0.72, 1.13], [0.77, 1.13], [0.77, 1.17], [0.72, 1.17]], 8, true),
    materialIndex: 3
  });
  for (let p = 0; p < 8; p += 1) {
    const pa = (p / 8) * Math.PI * 2;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.045, 0.23, 0.045, 0.008), {
        pos: [Math.sin(pa) * 0.74, 1.05, Math.cos(pa) * 0.74]
      }),
      materialIndex: 3
    });
  }
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.28, 0.46, 0.14, 0.02), { pos: [0, 0.23, 0.65] }),
    materialIndex: 3
  });
  // Domed cap roof + brass finial + warm window
  slots.push({
    mesh: latheMesh([[0.47, 2.18], [0.44, 2.44], [0.3, 2.68], [0.09, 2.8], [0, 2.85]], 14),
    materialIndex: 2
  });
  slots.push({
    mesh: latheMesh([[0.032, 2.82], [0.065, 2.9], [0, 2.98]], 10),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.18, 0.32, 0.1, 0.015), { pos: [0, 1.45, 0.46] }),
    materialIndex: 6
  });

  if (includeStaticSails) {
    slots.push({
      mesh: transformMesh(latheMesh([[0, -0.14], [0.135, -0.12], [0.115, 0.14], [0, 0.2]], 14), {
        pos: [0, 2.32, 0.48],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 5
    });
    for (let b = 0; b < 4; b += 1) {
      const ang = b * Math.PI * 0.5 + 0.38;
      const rotZ = ang - Math.PI * 0.5;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.065, 1.48, 0.055, 0.01), {
          pos: [ca * 0.74, 2.32 + sa * 0.74, 0.56],
          rot: [0, 0, rotZ]
        }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.04, 1.18, 0.04, 0.008), {
          pos: [ca * 0.84 - sa * 0.33, 2.32 + sa * 0.84 + ca * 0.33, 0.57],
          rot: [0, 0, rotZ]
        }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.3, 1.14, 0.018, 0.005), {
          pos: [ca * 0.84 - sa * 0.17, 2.32 + sa * 0.84 + ca * 0.17, 0.585],
          rot: [0, 0.12, rotZ]
        }),
        materialIndex: 4
      });
      for (const rungR of [0.32, 0.56, 0.8, 1.04, 1.28]) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.36, 0.032, 0.042, 0.006), {
            pos: [ca * rungR - sa * 0.16, 2.32 + sa * rungR + ca * 0.16, 0.572],
            rot: [0, 0, rotZ]
          }),
          materialIndex: 3
        });
      }
    }
  }

  return assembleMultiMaterialNode(
    name,
    slots,
    [
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.whitewashPlaster,
      CRAFT_MATS.terracottaRoof,
      CRAFT_MATS.seasonedOak,
      CRAFT_MATS.sailCanvas,
      CRAFT_MATS.navalBrass,
      CRAFT_MATS.amberWindow
    ],
    {
      id: runtimeId,
      tags,
      position,
      rotation: [0, rotationY, 0],
      scale: scaleVal,
      castShadow: !includeStaticSails,
      receiveShadow: true
    }
  );
}

export function buildWindmillSailBladeNode(name: string, runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [
    { mesh: bevelBoxMesh(0.24, 1.0, 0.24, 0.03), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.35, 0.86, 0.12, 0.02), { pos: [0.68, 0.04, 0.06] }), materialIndex: 1 }
  ];
  for (const ry of [-0.34, -0.1, 0.14, 0.38]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.42, 0.045, 0.16, 0.01), { pos: [0.66, ry, 0.04] }), materialIndex: 0 });
  }
  return assembleMultiMaterialNode(
    name,
    slots,
    [CRAFT_MATS.seasonedOak, CRAFT_MATS.sailCanvas],
    { id: runtimeId, tags: ["windmill"], position: [0, -120, 0], castShadow: true, receiveShadow: true }
  );
}

export function buildSeaStackLighthouseLandmark(
  name: string,
  position: V3,
  rotationY: number,
  scaleVal: number,
  runtimeId?: string
): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  slots.push({ mesh: transformMesh(buildFacetedSeaCliffMesh(31), { scale: [2.4, 1.5, 1.8] }), materialIndex: 0 });
  slots.push({
    mesh: transformMesh(latheMesh([[0.72, 0.58], [0.64, 0.72], [0.22, 0.8], [0, 0.82]], 9, true), { pos: [-0.15, 0.02, 0] }),
    materialIndex: 1
  });
  const lx = -0.18, lz = 0.05;
  slots.push({ mesh: transformMesh(latheMesh([[0.22, 0.72], [0.19, 1.08]], 10), { pos: [lx, 0, lz] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(latheMesh([[0.19, 1.08], [0.165, 1.42]], 10), { pos: [lx, 0, lz] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(latheMesh([[0.165, 1.42], [0.145, 1.74]], 10), { pos: [lx, 0, lz] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(latheMesh([[0.145, 1.74], [0.21, 1.8], [0.21, 1.85], [0.13, 1.85]], 10), { pos: [lx, 0, lz] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(latheMesh([[0.125, 1.85], [0.125, 2.08]], 10), { pos: [lx, 0, lz] }), materialIndex: 5 });
  slots.push({ mesh: transformMesh(latheMesh([[0.15, 2.08], [0.09, 2.22], [0, 2.32]], 10), { pos: [lx, 0, lz] }), materialIndex: 3 });

  return assembleMultiMaterialNode(
    name,
    slots,
    [
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.cliffTurfCap,
      CRAFT_MATS.whitewashPlaster,
      CRAFT_MATS.lighthouseRed,
      CRAFT_MATS.forgedIron,
      CRAFT_MATS.amberWindow
    ],
    {
      ...(runtimeId ? { id: runtimeId, tags: ["backdrop"] } : {}),
      position,
      rotation: [0, rotationY, 0],
      scale: scaleVal,
      castShadow: false,
      receiveShadow: false
    }
  );
}

export function buildChapterBackdropLandmark(
  key: string,
  id: string,
  position: V3,
  rotationY: number,
  scaleVal: number,
  visible: boolean
): AuraNodeBuilder<AuraGroupNode> {
  if (key.includes("lighthouse")) {
    const b = buildSeaStackLighthouseLandmark(id, position, rotationY, scaleVal * 0.42, id);
    return visible ? b : new (b.constructor as typeof AuraNodeBuilder<AuraGroupNode>)({ ...b.toJSON(), visible: false });
  }
  const slots: MultiMatSlot[] = [];
  slots.push({ mesh: transformMesh(buildFacetedSeaCliffMesh(key.length * 13), { scale: [1.8, 0.9, 1.4] }), materialIndex: 0 });
  if (key.includes("quarryCrane")) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.12, 1.4, 0.12, 0.02), { pos: [0, 0.95, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.3, 0.09, 0.09, 0.015), { pos: [0.42, 1.42, 0], rot: [0, 0, 0.42] }), materialIndex: 2 });
  } else if (key.includes("greenhouse")) {
    slots.push({ mesh: latheMesh([[0.65, 0.42], [0.62, 0.85], [0.38, 1.2], [0, 1.32]], 10, true), materialIndex: 3 });
  } else if (key.includes("curtainWall")) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.8, 0.72, 0.34, 0.03), { pos: [0, 0.68, 0] }), materialIndex: 0 });
    for (const tx of [-0.85, 0.85]) {
      slots.push({ mesh: transformMesh(latheMesh([[0.28, 0.35], [0.25, 1.25], [0, 1.55]], 8, true), { pos: [tx, 0, 0] }), materialIndex: 1 });
    }
  } else {
    for (const [cx, cz, tilt, h] of [[-0.25, 0.1, 0.25, 1.25], [0.2, -0.1, -0.22, 1.45], [0.05, 0.24, 0.12, 1.05]] as const) {
      slots.push({
        mesh: transformMesh(latheMesh([[0.16, 0.35], [0.14, h], [0, h + 0.28]], 6, true), { pos: [cx, 0, cz], rot: [tilt, 0, -tilt] }),
        materialIndex: 3
      });
    }
  }
  return assembleMultiMaterialNode(
    id,
    slots,
    [CRAFT_MATS.quoinStone, CRAFT_MATS.slateRoof, CRAFT_MATS.seasonedOak, CRAFT_MATS.amberWindow],
    {
      id,
      tags: ["backdrop"],
      position,
      rotation: [0, rotationY, 0],
      scale: scaleVal * 0.45,
      castShadow: false,
      receiveShadow: false,
      visible
    }
  );
}

// ---------------------------------------------------------------------------
// 5. Chamfered Siege Crates, Iron-Strapped TNT Barrels, Mortised Beams & Pines
// ---------------------------------------------------------------------------

export function buildProceduralCrateSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:crate-spec", () => {
    const parts: RawMesh[] = [bevelBoxMesh(1.36, 1.36, 1.36, 0.035)];
    const r = 0.74;
    for (const sy of [-r, r]) {
      for (const sz of [-r, r]) parts.push(transformMesh(bevelBoxMesh(1.58, 0.125, 0.125, 0.022), { pos: [0, sy, sz] }));
      for (const sx of [-r, r]) parts.push(transformMesh(bevelBoxMesh(0.125, 0.125, 1.58, 0.022), { pos: [sx, sy, 0] }));
    }
    for (const sx of [-r, r]) {
      for (const sz of [-r, r]) {
        parts.push(transformMesh(bevelBoxMesh(0.125, 1.58, 0.125, 0.022), { pos: [sx, 0, sz] }));
        // Corner iron gusset caps
        for (const sy of [-r, r]) {
          parts.push(transformMesh(bevelBoxMesh(0.2, 0.2, 0.2, 0.02), { pos: [sx, sy, sz] }));
        }
      }
    }
    for (const sz of [-0.71, 0.71]) {
      parts.push(transformMesh(bevelBoxMesh(1.62, 0.11, 0.065, 0.015), { pos: [0, 0, sz], rot: [0, 0, Math.PI * 0.25] }));
    }
    for (const sx of [-0.71, 0.71]) {
      parts.push(transformMesh(bevelBoxMesh(0.065, 0.11, 1.62, 0.015), { pos: [sx, 0, 0], rot: [Math.PI * 0.25, 0, 0] }));
    }
    return mergeRawMeshes(parts);
  });
}

/**
 * Coopered bulged TNT powder barrel (`height = 1.42m`, `radius = 0.64m` -> `scale = 0.42` matches `0.60m` collider)
 * with raised chimb rims and carved stave ribs.
 */
export function buildProceduralBarrelSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:barrel-spec", () => {
    const parts: RawMesh[] = [
      latheMesh(
        [
          [0.0, -0.68],
          [0.46, -0.68],
          [0.49, -0.72],
          [0.54, -0.67],
          [0.61, -0.34],
          [0.65, 0.0],
          [0.61, 0.34],
          [0.54, 0.67],
          [0.49, 0.72],
          [0.46, 0.68],
          [0.0, 0.68]
        ],
        16,
        true
      )
    ];
    // Top bung stopper
    parts.push(transformMesh(latheMesh([[0.09, 0.67], [0.075, 0.77], [0, 0.78]], 8), { pos: [0.18, 0, 0.12] }));
    return mergeRawMeshes(parts);
  });
}

/**
 * Triple iron-strapped TNT barrel hoops + rivet studs + top fuse cord matching `BARREL_BAND_POOL_ID`.
 */
export function buildBarrelHoopsSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:barrel-hoops-spec", () => {
    const hBot = latheMesh([[0.58, -0.58], [0.63, -0.58], [0.64, -0.42], [0.6, -0.42]], 16);
    const hMid = latheMesh([[0.645, -0.11], [0.685, -0.11], [0.685, 0.11], [0.645, 0.11]], 16);
    const hTop = latheMesh([[0.6, 0.42], [0.64, 0.42], [0.63, 0.58], [0.58, 0.58]], 16);
    const parts: RawMesh[] = [hBot, hMid, hTop];
    for (let r = 0; r < 8; r += 1) {
      const a = (r / 8) * Math.PI * 2;
      parts.push(
        transformMesh(bevelBoxMesh(0.06, 0.06, 0.05, 0.01), {
          pos: [Math.sin(a) * 0.685, 0, Math.cos(a) * 0.685],
          rot: [0, a, 0]
        })
      );
    }
    // Braided powder-keg fuse curling out of the top bung
    parts.push(
      tubeSweepMesh(
        [
          [0.18, 0.76, 0.12, 0.028],
          [0.26, 0.88, 0.18, 0.024],
          [0.36, 0.84, 0.22, 0.02]
        ],
        6
      )
    );
    return mergeRawMeshes(parts);
  });
}

/**
 * Mortised structural siege timber beam with chamfered arrises, carved tenon shoulders, and iron end-straps.
 */
export function buildProceduralPlankSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:plank-spec", () => {
    const beam = bevelBoxMesh(1.66, 0.36, 0.42, 0.038);
    const tenonL = transformMesh(bevelBoxMesh(0.12, 0.24, 0.28, 0.02), { pos: [-0.86, 0, 0] });
    const tenonR = transformMesh(bevelBoxMesh(0.12, 0.24, 0.28, 0.02), { pos: [0.86, 0, 0] });
    const strapL = transformMesh(bevelBoxMesh(0.1, 0.4, 0.46, 0.018), { pos: [-0.66, 0, 0] });
    const strapR = transformMesh(bevelBoxMesh(0.1, 0.4, 0.46, 0.018), { pos: [0.66, 0, 0] });
    const mortisePegL = transformMesh(bevelBoxMesh(0.06, 0.43, 0.06, 0.01), { pos: [-0.66, 0, 0] });
    const mortisePegR = transformMesh(bevelBoxMesh(0.06, 0.43, 0.06, 0.01), { pos: [0.66, 0, 0] });
    return mergeRawMeshes([beam, tenonL, tenonR, strapL, strapR, mortisePegL, mortisePegR]);
  });
}

export function buildSeaGrassClumpSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:sea-grass", () => {
    const blades: RawMesh[] = [];
    for (let i = 0; i < 7; i += 1) {
      const yaw = (i / 7) * Math.PI * 2 + 0.3;
      const lean = 0.22 + (i % 3) * 0.16;
      const h = 0.85 + (i % 2) * 0.22;
      blades.push(
        tubeSweepMesh(
          [
            [0, 0, 0, 0.06],
            [Math.sin(yaw) * lean * 0.35, h * 0.45, Math.cos(yaw) * lean * 0.35, 0.042],
            [Math.sin(yaw) * lean, h, Math.cos(yaw) * lean, 0.008]
          ],
          4,
          true
        )
      );
    }
    return mergeRawMeshes(blades);
  });
}

export function buildScallopShellSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:scallop-shell", () => {
    const ribs: RawMesh[] = [];
    for (let i = -3; i <= 3; i += 1) {
      const a = i * 0.22;
      ribs.push(
        tubeSweepMesh(
          [
            [0, 0, -0.42, 0.08],
            [Math.sin(a) * 0.38, 0.18, 0.05, 0.11],
            [Math.sin(a) * 0.72, 0.04, Math.cos(a) * 0.52, 0.07]
          ],
          5,
          true
        )
      );
    }
    return mergeRawMeshes(ribs);
  });
}

export function buildDriftwoodSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:driftwood", () => {
    const main = tubeSweepMesh(
      [
        [0, -0.5, 0, 0.14],
        [0.05, -0.15, 0.03, 0.12],
        [-0.04, 0.22, -0.02, 0.1],
        [0.03, 0.5, 0.02, 0.07]
      ],
      7,
      true
    );
    const stub = tubeSweepMesh([[-0.02, 0.08, 0, 0.08], [0.24, 0.28, 0.08, 0.045]], 6, true);
    return mergeRawMeshes([main, stub]);
  });
}

export function buildQuayBollardSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:bollard", () =>
    mergeRawMeshes([
      latheMesh(
        [
          [0.62, -0.5],
          [0.54, -0.35],
          [0.44, 0.22],
          [0.58, 0.3],
          [0.42, 0.38],
          [0.52, 0.46],
          [0.0, 0.52]
        ],
        10,
        true
      )
    ])
  );
}

export function buildLobsterPotSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("siege:lobster-pot", () => {
    const parts: RawMesh[] = [bevelBoxMesh(1.0, 0.12, 1.0, 0.02)];
    for (const px of [-0.42, 0, 0.42]) {
      parts.push(
        tubeSweepMesh(
          [
            [px, -0.44, -0.46, 0.045],
            [px, 0.36, -0.36, 0.045],
            [px, 0.5, 0, 0.045],
            [px, 0.36, 0.36, 0.045],
            [px, -0.44, 0.46, 0.045]
          ],
          6,
          true
        )
      );
    }
    for (const slatY of [-0.18, 0.12, 0.36]) {
      parts.push(transformMesh(bevelBoxMesh(0.98, 0.05, 0.04, 0.008), { pos: [0, slatY, 0.43] }));
      parts.push(transformMesh(bevelBoxMesh(0.98, 0.05, 0.04, 0.008), { pos: [0, slatY, -0.43] }));
    }
    return mergeRawMeshes(parts);
  });
}

export function buildCoastalPinesNodes(
  transforms: readonly { readonly position: V3; readonly rotation: V3; readonly scale: number }[],
  row: ChapterLook
): readonly AuraNodeBuilder<AuraPrimitiveNode>[] {
  const trunkSpec = memoizeGeometry("siege:pine-trunks", () =>
    mergeRawMeshes([
      tubeSweepMesh(
        [
          [0, -0.2, 0, 0.62],
          [0.18, 1.8, 0.08, 0.42],
          [-0.14, 4.2, -0.06, 0.28],
          [0.22, 6.8, 0.12, 0.16],
          [0.32, 8.8, 0.15, 0.06]
        ],
        8,
        true
      ),
      tubeSweepMesh([[0.05, 3.8, 0, 0.2], [1.35, 4.9, 0.4, 0.07]], 6, true),
      tubeSweepMesh([[-0.08, 5.2, 0, 0.17], [-1.25, 6.3, -0.3, 0.06]], 6, true)
    ])
  );

  const canopySpec = memoizeGeometry("siege:pine-canopies", () =>
    mergeRawMeshes([
      transformMesh(coniferBoughTierMesh({ baseRadius: 3.1, height: 5.8, tiers: 5, seed: 3 }), { pos: [0.05, 3.8, 0] }),
      transformMesh(coniferBoughTierMesh({ baseRadius: 1.45, height: 1.5, tiers: 4, seed: 23 }), { pos: [1.35, 4.4, 0.4] }),
      transformMesh(coniferBoughTierMesh({ baseRadius: 1.35, height: 1.4, tiers: 4, seed: 29 }), { pos: [-1.2, 5.8, -0.3] })
    ])
  );

  const isNight = row.chapter === 5;
  const foliageMat = material.physical({
    name: "coastal pine canopy",
    color: isNight ? "#1c382c" : "#2e613d",
    roughness: 0.68,
    metallic: 0,
    sheen: 0.3,
    sheenColor: isNight ? "#4f7a68" : "#9bd47f",
    clearcoat: 0.15,
    clearcoatRoughness: 0.44
  });

  return [
    instances.custom(trunkSpec, {
      name: "island-trees",
      material: CRAFT_MATS.pineBark,
      transforms,
      castShadow: false,
      receiveShadow: true
    }).runtime({ id: "island-trees", tags: ["cloud"] }),
    instances.custom(canopySpec, {
      name: "island-tree-canopies",
      material: foliageMat,
      transforms,
      castShadow: false,
      receiveShadow: true,
      wind: { assetHeight: 9.5 }
    })
  ];
}

export function buildHorizonCloudsNode(row: ChapterLook): AuraNodeBuilder<AuraPrimitiveNode> {
  const cloudSpec = memoizeGeometry("siege:horizon-clouds", () => {
    const puff = (x: number, y: number, z: number, r: number, sy = 0.82): RawMesh =>
      transformMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              ovalRing(r * 0.72, r * 0.72, -r * 0.28, 10),
              ovalRing(r, r, r * 0.16, 10),
              ovalRing(r * 0.56, r * 0.56, r * 0.76, 10)
            ],
            true,
            true
          ),
          1,
          0.56
        ),
        { pos: [x, y, z], scale: [1, sy, 1] }
      );
    return mergeRawMeshes([
      puff(0, 0.12, 0, 1.05, 0.88),
      puff(-0.98, -0.08, 0.16, 0.78, 0.78),
      puff(1.04, -0.05, -0.1, 0.84, 0.82),
      puff(0.36, 0.42, 0.18, 0.72, 0.92),
      puff(-0.44, 0.3, -0.14, 0.66, 0.86),
      puff(-1.62, -0.18, 0.06, 0.52, 0.72),
      puff(1.68, -0.16, 0.08, 0.56, 0.74)
    ]);
  });

  const isNight = row.chapter === 5;
  const isSunset = row.chapter === 4;
  const cloudColor: AuraColor = isNight ? "#41547a" : isSunset ? "#ffdfc4" : "#ffffff";
  const transforms: AuraTransformSpec[] = [
    { position: [-21.5, 10.8, -32], rotation: [0, 0.22, 0], scale: [3.6, 1.75, 2.0] },
    { position: [-6.8, 8.6, -27], rotation: [0, -0.35, 0], scale: [2.2, 1.15, 1.4] },
    { position: [3.4, 11.9, -35], rotation: [0, 0.14, 0], scale: [4.4, 2.05, 2.4] },
    { position: [17.8, 9.4, -29], rotation: [0, -0.28, 0], scale: [2.9, 1.45, 1.7] }
  ];
  return instances.custom(cloudSpec, {
    name: "horizon-cumulus-clouds",
    material: material.physical({
      name: "horizon cumulus",
      color: cloudColor,
      roughness: 0.92,
      metallic: 0,
      sheen: 0.65,
      sheenColor: isSunset ? "#fff0de" : "#ffffff",
      emissive: isNight ? "#24324d" : isSunset ? "#ffc89e" : "#fffcf5",
      emissiveIntensity: 0.09
    }),
    transforms,
    castShadow: false,
    receiveShadow: false
  });
}

// ---------------------------------------------------------------------------
// 6. Sculpted Characters: Charismatic 3D Cartoon Siege Birds & Crowned Fortress Defenders
// ---------------------------------------------------------------------------

interface SiegeBirdSpec {
  readonly topRGB: V3;
  readonly botRGB: V3;
  readonly crestRGB: V3;
  readonly bellyRGB: V3;
  readonly irisRGB: V3;
  readonly browAngle: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly emissive?: string;
}

const AMMO_BIRD_SPEC: Readonly<Record<AmmoId, SiegeBirdSpec>> = {
  // Red Striker hero bird
  pebble: {
    topRGB: [0.92, 0.18, 0.16],
    botRGB: [0.68, 0.09, 0.11],
    crestRGB: [0.96, 0.24, 0.18],
    bellyRGB: [0.99, 0.94, 0.85],
    irisRGB: [0.92, 0.58, 0.12],
    browAngle: 0.36,
    bodyWidth: 1.06,
    bodyHeight: 1.08
  },
  // Heavy Armored Bomber bird
  stone: {
    topRGB: [0.34, 0.42, 0.54],
    botRGB: [0.19, 0.24, 0.32],
    crestRGB: [0.88, 0.68, 0.24],
    bellyRGB: [0.88, 0.9, 0.93],
    irisRGB: [0.96, 0.66, 0.18],
    browAngle: 0.42,
    bodyWidth: 1.24,
    bodyHeight: 1.16
  },
  // Blue Splitter zippy songbird
  triple: {
    topRGB: [0.18, 0.68, 0.96],
    botRGB: [0.09, 0.42, 0.78],
    crestRGB: [1.0, 0.82, 0.24],
    bellyRGB: [0.94, 0.98, 1.0],
    irisRGB: [0.16, 0.82, 0.76],
    browAngle: 0.24,
    bodyWidth: 0.98,
    bodyHeight: 1.02
  },
  // Mystic Cuttle-Crest striker
  squid: {
    topRGB: [0.58, 0.32, 0.92],
    botRGB: [0.34, 0.16, 0.64],
    crestRGB: [0.32, 0.95, 0.78],
    bellyRGB: [0.95, 0.91, 1.0],
    irisRGB: [0.34, 0.94, 0.78],
    browAngle: 0.32,
    bodyWidth: 1.04,
    bodyHeight: 1.06
  },
  // Yellow / Blazing Speedster-Bomber
  ember: {
    topRGB: [1.0, 0.76, 0.12],
    botRGB: [0.94, 0.34, 0.1],
    crestRGB: [1.0, 0.86, 0.26],
    bellyRGB: [1.0, 0.95, 0.8],
    irisRGB: [0.98, 0.36, 0.12],
    browAngle: 0.4,
    bodyWidth: 1.02,
    bodyHeight: 1.12,
    emissive: "#ff6a1a"
  }
};

function smoothSphere(radius: number, subdivisions: 0 | 1 | 2 = 1): RawMesh {
  return icosphereSmoothMesh(radius, subdivisions, 0, 7);
}

function sculptCurvedFeatherBlade(opts: {
  readonly length: number;
  readonly width: number;
  readonly arch: number;
  readonly thickness: number;
}): RawMesh {
  const stations = 4;
  const rings: V3[][] = [];
  for (let s = 0; s < stations; s += 1) {
    const u = s / (stations - 1);
    const z = -u * opts.length;
    const env = s === 0 ? 0.28 : s === stations - 1 ? 0.1 : Math.sin(Math.pow(u, 0.68) * Math.PI) * 1.08;
    const hw = Math.max(0.008, opts.width * 0.5 * env);
    const ht = Math.max(0.006, opts.thickness * (0.45 + 0.55 * env));
    const y = opts.arch * Math.sin(u * Math.PI * 0.85) + u * opts.arch * 0.45;
    rings.push([
      [0, y + ht, z],
      [hw, y + ht * 0.2, z],
      [hw * 0.7, y - ht * 0.65, z],
      [0, y - ht, z],
      [-hw * 0.7, y - ht * 0.65, z],
      [-hw, y + ht * 0.2, z]
    ]);
  }
  return subdivideSmoothMesh(loftSectionsMesh(rings, true, false), 1, 0.5);
}

function buildCompiledBirdAsset(ammo: AmmoId): {
  readonly spec: AuraCustomGeometrySpec;
  readonly materials: readonly AuraMaterialSpec[];
} {
  return memoizeGeometry(`siege:hero-bird:v4:${ammo}`, () => {
    const spec = AMMO_BIRD_SPEC[ammo] ?? AMMO_BIRD_SPEC.pebble;
    const slots: MultiMatSlot[] = [];
    // Material slots:
    // 0 = vertex-colored glossy cartoon plumage & eye irises/sclera/catchlights
    // 1 = glossy golden-orange curved two-part beak
    // 2 = jet-obsidian pupils, inner mouth & angled battle brows
    // 3 = crest / helmet accent (forgedIron or blazing emissive)

    // 1. Plump charismatic pear-shaped cartoon bird body (`loftSectionsMesh` + `subdivideSmoothMesh`)
    const isSpeedster = ammo === "ember";
    const wS = spec.bodyWidth;
    const hS = spec.bodyHeight;
    const bodyStations: V3[][] = [
      [-0.02, 0.24 * wS, 0.22 * wS, -0.02],
      [0.14, 0.52 * wS, 0.5 * wS, 0.02],
      [0.36, 0.58 * wS, 0.56 * wS, 0.04],
      [0.62 * hS, 0.49 * (isSpeedster ? 0.84 : 1) * wS, 0.48 * wS, 0.02],
      [0.86 * hS, 0.34 * (isSpeedster ? 0.68 : 1) * wS, 0.35 * wS, -0.02],
      [1.0 * hS, 0.14 * wS, 0.15 * wS, -0.04]
    ].map(([y, rx, rz, cz]) =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const cheekPuff = y! > 0.25 && y! < 0.68 && Math.cos(a) > 0.1 ? 1.06 : 1.0;
        return [Math.sin(a) * rx! * cheekPuff, y!, cz! + Math.cos(a) * rz! * cheekPuff] as V3;
      })
    );
    const bodyMesh = paintMeshColors(
      subdivideSmoothMesh(loftSectionsMesh(bodyStations, true, false), 1, 0.56),
      (pos, norm): V3 => {
        const v = Math.max(0, Math.min(1, pos[1] / Math.max(0.4, hS)));
        const bellyMask =
          pos[2] > 0.12 && pos[1] < 0.62 * hS
            ? Math.pow(Math.max(0, 1 - Math.hypot(pos[0] / (0.38 * wS), (pos[1] - 0.28) / (0.34 * hS))), 1.35)
            : 0;
        const cheekMask =
          pos[2] > 0.24
            ? Math.pow(Math.max(0, 1 - Math.hypot((Math.abs(pos[0]) - 0.27 * wS) / 0.14, (pos[1] - 0.5 * hS) / 0.12)), 1.6) * 0.55
            : 0;
        const sun = Math.max(0, norm[1] * 0.22 + norm[2] * 0.18);
        let r = spec.botRGB[0] + (spec.topRGB[0] - spec.botRGB[0]) * v + sun * 0.12;
        let g = spec.botRGB[1] + (spec.topRGB[1] - spec.botRGB[1]) * v + sun * 0.12;
        let b = spec.botRGB[2] + (spec.topRGB[2] - spec.botRGB[2]) * v + sun * 0.12;
        const creamMix = Math.min(1, bellyMask * 0.92 + cheekMask);
        r = r * (1 - creamMix) + spec.bellyRGB[0] * creamMix;
        g = g * (1 - creamMix) + spec.bellyRGB[1] * creamMix;
        b = b * (1 - creamMix) + spec.bellyRGB[2] * creamMix;
        return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
      }
    );

    // Soft sculpted belly plumage patch for tactile feather relief
    const bellyPlumage = paintMeshColors(
      transformMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              ovalRing(0.24 * wS, 0.1 * wS, 0.08, 10),
              ovalRing(0.35 * wS, 0.14 * wS, 0.28, 10),
              ovalRing(0.24 * wS, 0.1 * wS, 0.48 * hS, 10)
            ],
            true,
            false
          ),
          1,
          0.52
        ),
        { pos: [0, 0.02, 0.42 * wS] }
      ),
      spec.bellyRGB
    );

    // 2. Sculpted layered wing tufts (primary + secondary scalloped feathers on both flanks)
    const plumageParts: RawMesh[] = [bodyMesh, bellyPlumage];
    for (const sgn of [-1, 1] as const) {
      for (let tier = 0; tier < 3; tier += 1) {
        const blade = sculptCurvedFeatherBlade({
          length: (0.48 - tier * 0.07) * wS,
          width: 0.19 - tier * 0.02,
          arch: 0.05,
          thickness: 0.065
        });
        const placedWing = paintMeshColors(
          transformMesh(blade, {
            pos: [sgn * (0.48 * wS - tier * 0.02), (0.48 - tier * 0.075) * hS, 0.14 - tier * 0.04],
            rot: [-0.14 - tier * 0.1, sgn * -0.18, sgn * (1.28 - tier * 0.12)]
          }),
          (pos): V3 => {
            const tip = Math.max(0, Math.min(1, (-pos[2] + 0.1) / 0.45));
            return [
              Math.min(1, spec.topRGB[0] * (1 - tip * 0.25) + spec.crestRGB[0] * (tip * 0.25)),
              Math.min(1, spec.topRGB[1] * (1 - tip * 0.25) + spec.crestRGB[1] * (tip * 0.25)),
              Math.min(1, spec.topRGB[2] * (1 - tip * 0.25) + spec.crestRGB[2] * (tip * 0.25))
            ];
          }
        );
        plumageParts.push(placedWing);
      }

      // 3. Big expressive cartoon eyes: sculpted sclera, vivid colored iris ring, dark pupil & dual bright white catchlights
      const ex = sgn * 0.205 * wS;
      const ey = 0.62 * hS;
      const ez = 0.44 * wS;
      const eyeball = paintMeshColors(
        transformMesh(smoothSphere(0.135, 1), {
          pos: [ex, ey, ez],
          rot: [0, sgn * 0.2, 0],
          scale: [0.96, 1.12, 0.68]
        }),
        (pos): V3 => {
          const dx = (pos[0] - ex) / 0.125;
          const dy = (pos[1] - ey) / 0.145;
          const rad = Math.hypot(dx, dy);
          if (pos[2] > ez + 0.045 && rad < 0.62) {
            return spec.irisRGB;
          }
          return [0.99, 0.98, 0.96];
        }
      );
      const catchBig = paintMeshColors(
        transformMesh(smoothSphere(0.032, 0), {
          pos: [ex - sgn * 0.028, ey + 0.042, ez + 0.092],
          scale: [1, 1, 0.45]
        }),
        [1.0, 1.0, 0.99]
      );
      const catchSmall = paintMeshColors(
        transformMesh(smoothSphere(0.018, 0), {
          pos: [ex + sgn * 0.032, ey - 0.034, ez + 0.09],
          scale: [1, 1, 0.45]
        }),
        [1.0, 0.99, 0.97]
      );
      plumageParts.push(eyeball, catchBig, catchSmall);

      // Glossy jet pupil + sculpted curved battle brow
      slots.push({
        mesh: transformMesh(smoothSphere(0.056, 0), {
          pos: [ex - sgn * 0.01, ey, ez + 0.068],
          scale: [0.92, 1.08, 0.55]
        }),
        materialIndex: 2
      });
      const browSpline = catmullRomSpline3(
        [
          [sgn * 0.055 * wS, ey + 0.085, ez + 0.085],
          [sgn * 0.195 * wS, ey + 0.135 + spec.browAngle * 0.05, ez + 0.068],
          [sgn * 0.335 * wS, ey + 0.18 + spec.browAngle * 0.14, ez + 0.015]
        ],
        3
      );
      slots.push({
        mesh: bakeMeshCavityAO(
          tubeSweepMesh(browSpline.map(([x, y, z], i) => [x, y, z, 0.044 - i * 0.004] as V4), 8, false),
          0.22
        ),
        materialIndex: 2
      });
    }

    // 4. Swept multi-plume head crest & fanned sculpted tail feathers (zero plain spheres or box tails!)
    if (ammo === "stone") {
      // Heavy Bomber: riveted iron-and-brass bombardier aviator helm + glowing fusewick crest
      const helm = subdivideSmoothMesh(
        latheMesh([[0.5 * wS, 0.68 * hS], [0.56 * wS, 0.74 * hS], [0.46 * wS, 0.92 * hS], [0.26 * wS, 1.08 * hS], [0, 1.13 * hS]], 16),
        1,
        0.44
      );
      slots.push({ mesh: bakeMeshCavityAO(helm, 0.25), materialIndex: 3 });
      const fuseSpline = catmullRomSpline3([[0, 1.11 * hS, 0], [0.04, 1.25 * hS, -0.08], [0.1, 1.32 * hS, -0.18]], 4);
      slots.push({ mesh: tubeSweepMesh(fuseSpline.map(([x, y, z]) => [x, y, z, 0.028] as V4), 7, false), materialIndex: 1 });
    } else {
      const crestCount = ammo === "ember" ? 4 : ammo === "triple" ? 3 : 2;
      for (let c = 0; c < crestCount; c += 1) {
        const spread = crestCount > 1 ? (c / (crestCount - 1) - 0.5) * 0.42 : 0;
        const crestFeather = sculptCurvedFeatherBlade({
          length: 0.44 + (c === 0 ? 0.08 : 0),
          width: 0.15,
          arch: 0.11,
          thickness: 0.065
        });
        const paintedCrest = paintMeshColors(
          transformMesh(crestFeather, {
            pos: [spread * 0.28, (0.94 - Math.abs(spread) * 0.08) * hS, 0.08 - c * 0.05],
            rot: [0.58 - c * 0.14, spread * 0.55, -spread * 0.45]
          }),
          (pos): V3 => {
            const t = Math.max(0, Math.min(1, (pos[1] - 0.9 * hS) / 0.35));
            return [
              Math.min(1, spec.topRGB[0] * (1 - t) + spec.crestRGB[0] * t),
              Math.min(1, spec.topRGB[1] * (1 - t) + spec.crestRGB[1] * t),
              Math.min(1, spec.topRGB[2] * (1 - t) + spec.crestRGB[2] * t)
            ];
          }
        );
        if (spec.emissive) {
          slots.push({ mesh: paintedCrest, materialIndex: 3 });
        } else {
          plumageParts.push(paintedCrest);
        }
      }
    }

    // Fanned sculpted tail feathers (4 curved feather blades fanning from the tail base)
    for (const ta of [-0.42, -0.14, 0.14, 0.42]) {
      const tailBlade = sculptCurvedFeatherBlade({
        length: 0.44,
        width: 0.15,
        arch: 0.06,
        thickness: 0.048
      });
      slots.push({
        mesh: bakeMeshCavityAO(
          transformMesh(tailBlade, {
            pos: [Math.sin(ta) * 0.14 * wS, 0.36 * hS, -0.44 * wS],
            rot: [0.38 + Math.abs(ta) * 0.15, ta, ta * 0.35]
          }),
          0.24
        ),
        materialIndex: 2
      });
    }

    slots.push({
      mesh: bakeMeshCavityAO(
        {
          positions: plumageParts.flatMap((m) => m.positions),
          normals: plumageParts.flatMap((m) => m.normals),
          uvs: plumageParts.flatMap((m) => m.uvs),
          indices: (() => {
            const idx: number[] = [];
            let off = 0;
            for (const m of plumageParts) {
              for (const k of m.indices) idx.push(k + off);
              off += m.positions.length / 3;
            }
            return idx;
          })(),
          colors: plumageParts.flatMap((m) => m.colors ?? new Array<number>((m.positions.length / 3) * 4).fill(1))
        },
        0.25
      ),
      materialIndex: 0
    });

    // 5. Curved Two-Part Cartoon Beak (hooked upper maxilla + distinct lower mandible + open mouth cavity)
    const upperBeakRings: V3[][] = [
      [0.44 * wS, 0.2 * wS, 0.15 * hS, 0.5 * hS],
      [0.64 * wS, 0.14 * wS, 0.11 * hS, 0.49 * hS],
      [0.82 * wS, 0.075 * wS, 0.065 * hS, 0.45 * hS],
      [0.94 * wS, 0.018 * wS, 0.02 * hS, 0.39 * hS]
    ].map(([z, hw, hh, ym]) => [
      [0, ym! + hh!, z!],
      [hw!, ym! + hh! * 0.15, z!],
      [hw! * 0.82, ym! - hh! * 0.35, z!],
      [0, ym! - hh! * 0.3, z!],
      [-hw! * 0.82, ym! - hh! * 0.35, z!],
      [-hw!, ym! + hh! * 0.15, z!]
    ]);
    const lowerBeakRings: V3[][] = [
      [0.43 * wS, 0.165 * wS, 0.095 * hS, 0.41 * hS],
      [0.6 * wS, 0.115 * wS, 0.07 * hS, 0.38 * hS],
      [0.76 * wS, 0.045 * wS, 0.032 * hS, 0.36 * hS]
    ].map(([z, hw, hh, ym]) => [
      [0, ym! + hh! * 0.3, z!],
      [hw!, ym! + hh! * 0.2, z!],
      [hw! * 0.72, ym! - hh!, z!],
      [0, ym! - hh! * 1.05, z!],
      [-hw! * 0.72, ym! - hh!, z!],
      [-hw!, ym! + hh! * 0.2, z!]
    ]);
    const upperBeak = subdivideSmoothMesh(loftSectionsMesh(upperBeakRings, true, false), 1, 0.48);
    const lowerBeak = subdivideSmoothMesh(loftSectionsMesh(lowerBeakRings, true, false), 1, 0.48);
    slots.push({ mesh: bakeMeshCavityAO(upperBeak, 0.25), materialIndex: 1 });
    slots.push({ mesh: bakeMeshCavityAO(lowerBeak, 0.25), materialIndex: 1 });
    // Dark mouth interior tongue/cavity accent between upper and lower beak
    slots.push({
      mesh: transformMesh(smoothSphere(0.085, 1), {
        pos: [0, 0.435 * hS, 0.56 * wS],
        scale: [1.15, 0.42, 1.35]
      }),
      materialIndex: 2
    });

    const mats: AuraMaterialSpec[] = [
      material.lacquer({
        name: `gull plumage ${ammo}`,
        color: "#ffffff",
        roughness: 0.24,
        clearcoat: 0.82,
        clearcoatRoughness: 0.12
      }),
      material.lacquer({
        name: "gull sculpted two-part beak",
        color: "#ff9b1f",
        roughness: 0.2,
        clearcoat: 0.92
      }),
      material.lacquer({
        name: "gull obsidian eye & tail",
        color: "#1a1e28",
        roughness: 0.1,
        clearcoat: 0.96
      }),
      spec.emissive
        ? material.emissive({
            name: "ember blazing crest",
            color: "#ffd84d",
            emissive: spec.emissive,
            emissiveIntensity: 1.35
          })
        : CRAFT_MATS.forgedIron
    ];

    const proto = assembleMultiMaterialNode("siege-bird-proto", slots, mats).toJSON() as unknown as {
      readonly geometry?: AuraCustomGeometrySpec;
      readonly materials?: readonly AuraMaterialSpec[];
    };
    return {
      spec: proto.geometry ?? buildGroupedGeometrySpec(slots),
      materials: (proto.materials ?? mats) as readonly AuraMaterialSpec[]
    };
  });
}

export function buildHeroSiegeBirdNode(
  name: string,
  ammo: AmmoId,
  position: V3,
  rotationY: number,
  scaleVal: number,
  runtimeId: string,
  tag: string,
  castShadow = true
): AuraNodeBuilder<AuraGroupNode> {
  const compiled = buildCompiledBirdAsset(ammo);
  return geometry
    .multiMaterial(compiled.spec, compiled.materials, {
      name,
      position,
      rotation: [0, rotationY, 0],
      scale: scaleVal,
      castShadow,
      receiveShadow: true
    })
    .runtime({ id: runtimeId, tags: [tag] }) as unknown as AuraNodeBuilder<AuraGroupNode>;
}

/**
 * Charismatic 3D Cartoon Crowned / Helmed Pig-Goblin Fortress Defenders (`gullPartId(g, "body")`).
 * Ranks:
 * - `slot === 0` (**King**): Tall jeweled golden royal crown + crimson velvet cushion + grand curled handlebar moustache + ermine/brass armor collar!
 * - `slot % 2 === 1` (**Knight**): Ornate forged-iron medieval nasal/visor helm + brass trim + swept crimson crest plume + bristling curled moustache + riveted gorget collar!
 * - `slot > 0 && slot % 2 === 0` (**Grunt**): Jauntily tilted dented iron kettle siege helmet + brass rivets + leather chin-strap + underbite tusks + studded armor collar!
 */
function buildCompiledRaiderAsset(rank: number): {
  readonly spec: AuraCustomGeometrySpec;
  readonly materials: readonly AuraMaterialSpec[];
} {
  return memoizeGeometry(`siege:raider-defender:v4:${rank}`, () => {
    const isKing = rank === 0;
    const isKnight = rank === 1;
    const built: MultiMatSlot[] = [];
    // Material slots:
    // 0 = vertex-colored plump goblin-pig skin, rosy snout, inner ears, eyes (sclera/iris/catchlights) & moustaches
    // 1 = ivory tusks / horns / crown pearls
    // 2 = jet-obsidian pupils, recessed nostrils & furrowed brows
    // 3 = royal gold (`navalBrass`) or forged iron (`forgedIron`) helm & armor collar
    // 4 = crimson royal velvet/plume (`tntRed`) or seasoned oak/saddle leather (`saddleLeather`)
    // 5 = gleaming brass trim & cabochon jewels (`navalBrass`)

    const skinParts: RawMesh[] = [];

    // 1. Plump charismatic pear-jowled cartoon head & body (`loftSectionsMesh` + `subdivideSmoothMesh`)
    const scaleBody = isKing ? 1.12 : isKnight ? 1.04 : 0.98;
    const jowlBody = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            ovalRing(0.4 * scaleBody, 0.38 * scaleBody, 0.02, 12),
            ovalRing(0.65 * scaleBody, 0.6 * scaleBody, 0.28, 12),
            ovalRing(0.62 * scaleBody, 0.56 * scaleBody, 0.56, 12),
            ovalRing(0.47 * scaleBody, 0.44 * scaleBody, 0.84, 12),
            ovalRing(0.24 * scaleBody, 0.22 * scaleBody, 1.0, 12)
          ],
          true,
          false
        ),
        1,
        0.58
      ),
      (pos, norm): V3 => {
        const v = Math.max(0, Math.min(1, pos[1] / 1.0));
        const belly =
          pos[2] > 0.16 && pos[1] < 0.48
            ? Math.pow(Math.max(0, 1 - Math.hypot(pos[0] / 0.38, (pos[1] - 0.24) / 0.24)), 1.4) * 0.72
            : 0;
        const cheekBlush =
          pos[2] > 0.25
            ? Math.pow(Math.max(0, 1 - Math.hypot((Math.abs(pos[0]) - 0.36 * scaleBody) / 0.16, (pos[1] - 0.48) / 0.14)), 1.5) * 0.42
            : 0;
        const sun = Math.max(0, norm[1] * 0.22 + norm[2] * 0.18);
        let r = (isKing ? 0.28 : 0.33) + v * 0.1 + sun * 0.12;
        let g = (isKing ? 0.58 : 0.63) + v * 0.14 + sun * 0.14;
        let b = (isKing ? 0.22 : 0.25) + v * 0.06 + sun * 0.08;
        r = r * (1 - belly) + 0.68 * belly + cheekBlush * 0.28;
        g = g * (1 - belly) + 0.86 * belly - cheekBlush * 0.06;
        b = b * (1 - belly) + 0.46 * belly + cheekBlush * 0.06;
        return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
      }
    );
    skinParts.push(jowlBody);

    // 2. Prominent upturned cartoon pig-boar snout with sculpted rim & recessed dark nostrils
    const snoutRaw = transformMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            ovalRing(0.23 * scaleBody, 0.18 * scaleBody, -0.1, 10),
            ovalRing(0.29 * scaleBody, 0.23 * scaleBody, 0.03, 10),
            ovalRing(0.26 * scaleBody, 0.2 * scaleBody, 0.13, 10)
          ],
          true,
          false
        ),
        1,
        0.54
      ),
      { pos: [0, 0.47, 0.56 * scaleBody], rot: [Math.PI * 0.45, 0, 0] }
    );
    skinParts.push(
      paintMeshColors(snoutRaw, (pos): V3 => {
        const front = Math.max(0, Math.min(1, (pos[2] - 0.5) / 0.22));
        return [0.56 + front * 0.18, 0.78 + front * 0.08, 0.38 + front * 0.08];
      })
    );

    // 3. Curled Handlebar Moustaches (King & Knight) + Expressive Eyes + Cupped Ears + Stocky Arms
    if (isKing || isKnight) {
      for (const sgn of [-1, 1] as const) {
        const stacheSpline = isKing
          ? catmullRomSpline3(
              [
                [sgn * 0.03, 0.36, 0.65 * scaleBody],
                [sgn * 0.22, 0.34, 0.66 * scaleBody],
                [sgn * 0.42, 0.39, 0.58 * scaleBody],
                [sgn * 0.48, 0.49, 0.54 * scaleBody],
                [sgn * 0.41, 0.53, 0.55 * scaleBody]
              ],
              3
            )
          : catmullRomSpline3(
              [
                [sgn * 0.03, 0.35, 0.62 * scaleBody],
                [sgn * 0.19, 0.32, 0.62 * scaleBody],
                [sgn * 0.34, 0.29, 0.54 * scaleBody],
                [sgn * 0.39, 0.34, 0.5 * scaleBody]
              ],
              3
            );
        const stacheMesh = tubeSweepMesh(
          stacheSpline.map(([x, y, z], i, arr) => {
            const u = i / Math.max(1, arr.length - 1);
            const r = (isKing ? 0.068 : 0.054) * (1 - u * 0.68);
            return [x, y, z, Math.max(0.014, r)] as V4;
          }),
          8,
          false
        );
        skinParts.push(
          paintMeshColors(stacheMesh, isKing ? [0.68, 0.38, 0.14] : [0.36, 0.2, 0.1])
        );
      }
    }

    for (const sgn of [-1, 1] as const) {
      // Dark recessed nostrils
      built.push({
        mesh: transformMesh(smoothSphere(0.048, 0), {
          pos: [sgn * 0.095 * scaleBody, 0.48, 0.685 * scaleBody],
          scale: [0.82, 1.12, 0.55]
        }),
        materialIndex: 2
      });

      // Cupped floppy/pointed goblin-boar ears with warm rosy inner ear hollow
      const earSpline = catmullRomSpline3(
        [
          [sgn * 0.48 * scaleBody, 0.67, 0.08],
          [sgn * 0.72 * scaleBody, 0.76, 0.04],
          [sgn * 0.89 * scaleBody, 0.68, -0.05]
        ],
        3
      );
      const earMesh = tubeSweepMesh(earSpline.map(([x, y, z], i) => [x, y, z, 0.115 - i * 0.022] as V4), 8, false);
      skinParts.push(
        paintMeshColors(earMesh, (pos, norm): V3 => {
          const inner = norm[2] > 0.28 && Math.abs(pos[0]) > 0.54 ? 0.55 : 0;
          return [0.36 * (1 - inner) + 0.84 * inner, 0.68 * (1 - inner) + 0.48 * inner, 0.28 * (1 - inner) + 0.44 * inner];
        })
      );

      // Stocky anatomical arms (`sculptAnatomicalLimbMesh`)
      const armMesh = subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [sgn * 0.54 * scaleBody, 0.46, 0.08], rx: 0.115, rz: 0.11 },
            { pos: [sgn * 0.66 * scaleBody, 0.33, 0.2], rx: 0.105, rz: 0.1 },
            { pos: [sgn * 0.58 * scaleBody, 0.24, 0.35], rx: 0.092, rz: 0.09 }
          ],
          { ringPoints: 10, capEnds: true }
        ),
        1,
        0.46
      );
      skinParts.push(paintMeshColors(armMesh, [0.35, 0.66, 0.27]));

      // Curved ivory boar tusks (prominent on Grunts & Knights, regal smaller fangs on King)
      const tuskScale = isKing ? 0.78 : isKnight ? 0.95 : 1.14;
      const tuskSpline = catmullRomSpline3(
        [
          [sgn * 0.24 * scaleBody, 0.34, 0.48 * scaleBody],
          [sgn * 0.34 * scaleBody, 0.45, 0.63 * scaleBody],
          [sgn * 0.3 * scaleBody, 0.58 * tuskScale, 0.62 * scaleBody]
        ],
        3
      );
      built.push({
        mesh: tubeSweepMesh(tuskSpline.map(([x, y, z], i) => [x, y, z, (0.056 - i * 0.011) * tuskScale] as V4), 8, false),
        materialIndex: 1
      });

      // Big expressive cartoon eyes: ivory sclera, golden-amber iris, dark pupil & dual bright white catchlights
      const ex = sgn * 0.245 * scaleBody;
      const ey = 0.66;
      const ez = 0.46 * scaleBody;
      const eyeball = paintMeshColors(
        transformMesh(smoothSphere(0.125, 1), {
          pos: [ex, ey, ez],
          rot: [0, sgn * 0.18, 0],
          scale: [0.98, 1.08, 0.68]
        }),
        (pos): V3 => {
          const dx = (pos[0] - ex) / 0.115;
          const dy = (pos[1] - ey) / 0.125;
          if (pos[2] > ez + 0.042 && Math.hypot(dx, dy) < 0.6) {
            return isKing ? [0.95, 0.68, 0.14] : [0.88, 0.56, 0.14];
          }
          return [0.99, 0.98, 0.94];
        }
      );
      const catchMain = paintMeshColors(
        transformMesh(smoothSphere(0.028, 0), {
          pos: [ex - sgn * 0.024, ey + 0.036, ez + 0.086],
          scale: [1, 1, 0.45]
        }),
        [1.0, 1.0, 0.98]
      );
      const catchSub = paintMeshColors(
        transformMesh(smoothSphere(0.015, 0), {
          pos: [ex + sgn * 0.028, ey - 0.028, ez + 0.084],
          scale: [1, 1, 0.45]
        }),
        [1.0, 0.99, 0.96]
      );
      skinParts.push(eyeball, catchMain, catchSub);

      built.push({
        mesh: transformMesh(smoothSphere(0.052, 0), {
          pos: [ex - sgn * 0.008, ey, ez + 0.064],
          scale: [0.92, 1.05, 0.55]
        }),
        materialIndex: 2
      });
      // Sculpted curved brow ridge
      const browPts = catmullRomSpline3(
        [
          [sgn * 0.08 * scaleBody, 0.75, ez + 0.06],
          [sgn * 0.23 * scaleBody, 0.79, ez + 0.05],
          [sgn * 0.37 * scaleBody, 0.75, ez]
        ],
        3
      );
      built.push({
        mesh: tubeSweepMesh(browPts.map(([x, y, z]) => [x, y, z, 0.038] as V4), 7, false),
        materialIndex: 2
      });
    }

    built.push({
      mesh: bakeMeshCavityAO(
        {
          positions: skinParts.flatMap((m) => m.positions),
          normals: skinParts.flatMap((m) => m.normals),
          uvs: skinParts.flatMap((m) => m.uvs),
          indices: (() => {
            const idx: number[] = [];
            let off = 0;
            for (const m of skinParts) {
              for (const k of m.indices) idx.push(k + off);
              off += m.positions.length / 3;
            }
            return idx;
          })(),
          colors: skinParts.flatMap((m) => m.colors ?? new Array<number>((m.positions.length / 3) * 4).fill(1))
        },
        0.25
      ),
      materialIndex: 0
    });

    // 4. Ornate Armor Collars / Pauldrons & Rank-Specific Crown / Medieval Knight Helm / Grunt Kettle Helm
    if (isKing) {
      // Royal Ermine & Gilded Armor Collar + Crimson Royal Mantle Capelet
      built.push({
        mesh: bakeMeshCavityAO(
          subdivideSmoothMesh(latheMesh([[0.48, 0.16], [0.74, 0.2], [0.76, 0.34], [0.54, 0.4]], 14, false), 1, 0.48),
          0.24
        ),
        materialIndex: 1
      });
      built.push({
        mesh: bakeMeshCavityAO(
          latheMesh([[0.46, 0.24], [0.68, 0.28], [0.64, 0.38], [0.46, 0.42]], 14, false),
          0.22
        ),
        materialIndex: 3
      });
      // Crimson velvet royal crown cushion cap
      built.push({
        mesh: bakeMeshCavityAO(
          subdivideSmoothMesh(latheMesh([[0.34, 0.88], [0.42, 1.08], [0.28, 1.24], [0, 1.28]], 12), 1, 0.52),
          0.24
        ),
        materialIndex: 4
      });
      // Tall jeweled golden King Crown circlet + 6 sculpted fleur-de-lis spires + golden orb finial + cabochon gems
      built.push({
        mesh: bakeMeshCavityAO(
          latheMesh([[0.37, 0.86], [0.46, 0.92], [0.48, 1.12], [0.39, 1.14]], 16, false),
          0.22
        ),
        materialIndex: 3
      });
      built.push({
        mesh: transformMesh(smoothSphere(0.068, 0), { pos: [0, 1.33, 0] }),
        materialIndex: 3
      });
      for (let p = 0; p < 6; p += 1) {
        const pa = (p / 6) * Math.PI * 2;
        const spire = latheMesh([[0, 0], [0.095, 0.04], [0.065, 0.19], [0, 0.3]], 8, false);
        built.push({
          mesh: transformMesh(spire, {
            pos: [Math.sin(pa) * 0.42, 1.08, Math.cos(pa) * 0.42],
            rot: [Math.cos(pa) * 0.18, 0, -Math.sin(pa) * 0.18]
          }),
          materialIndex: 3
        });
        built.push({
          mesh: transformMesh(smoothSphere(0.036, 0), {
            pos: [Math.sin(pa) * 0.46, 0.99, Math.cos(pa) * 0.46]
          }),
          materialIndex: p % 2 === 0 ? 4 : 1
        });
      }
    } else if (isKnight) {
      // Knight: Riveted Forged-Iron Gorget Collar + Pauldrons + Ornate Nasal/Visor Helm + Brass Trim + Crimson Plume!
      built.push({
        mesh: bakeMeshCavityAO(
          latheMesh([[0.48, 0.18], [0.7, 0.22], [0.68, 0.36], [0.48, 0.4]], 14, false),
          0.24
        ),
        materialIndex: 3
      });
      const knightHelm = subdivideSmoothMesh(
        latheMesh([[0.56, 0.75], [0.63, 0.8], [0.52, 0.94], [0.43, 1.12], [0.18, 1.22], [0, 1.25]], 12),
        1,
        0.44
      );
      built.push({ mesh: bakeMeshCavityAO(knightHelm, 0.25), materialIndex: 3 });
      // Brass brow band & nasal guard
      built.push({
        mesh: latheMesh([[0.55, 0.76], [0.64, 0.78], [0.63, 0.83], [0.54, 0.84]], 14, false),
        materialIndex: 5
      });
      built.push({
        mesh: transformMesh(bevelBoxMesh(0.085, 0.24, 0.085, 0.018), { pos: [0, 0.73, 0.56] }),
        materialIndex: 5
      });
      // Swept crimson horsehair knight crest plume
      const plumeBlade = sculptCurvedFeatherBlade({ length: 0.56, width: 0.18, arch: 0.14, thickness: 0.095 });
      built.push({
        mesh: bakeMeshCavityAO(transformMesh(plumeBlade, { pos: [0, 1.22, 0.08], rot: [0.22, 0, 0] }), 0.24),
        materialIndex: 4
      });
      // Curved side horns on the knight helm
      for (const sgn of [-1, 1] as const) {
        const hornPts = catmullRomSpline3(
          [
            [sgn * 0.44, 0.95, 0.04],
            [sgn * 0.68, 1.08, 0.1],
            [sgn * 0.74, 1.3, 0.16]
          ],
          3
        );
        built.push({
          mesh: tubeSweepMesh(hornPts.map(([x, y, z], i) => [x, y, z, 0.082 - i * 0.02] as V4), 8, false),
          materialIndex: 1
        });
      }
    } else {
      // Grunt: Studded Saddle-Leather Armor Collar + Jauntily Tilted Forged-Iron Kettle/Pot Siege Helmet!
      built.push({
        mesh: bakeMeshCavityAO(
          latheMesh([[0.46, 0.18], [0.66, 0.22], [0.64, 0.34], [0.46, 0.38]], 14, false),
          0.24
        ),
        materialIndex: 4
      });
      const kettleHelm = transformMesh(
        subdivideSmoothMesh(
          latheMesh([[0.68, 0.72], [0.74, 0.75], [0.54, 0.83], [0.46, 1.02], [0.24, 1.14], [0, 1.17]], 12),
          1,
          0.44
        ),
        { rot: [-0.08, 0, 0.11] }
      );
      built.push({ mesh: bakeMeshCavityAO(kettleHelm, 0.25), materialIndex: 3 });
      // Brass kettle-helm boss finial & collar studs
      built.push({
        mesh: transformMesh(smoothSphere(0.055, 0), { pos: [-0.11, 1.17, -0.08] }),
        materialIndex: 5
      });
      for (let r = 0; r < 6; r += 1) {
        const ra = (r / 6) * Math.PI * 2;
        built.push({
          mesh: transformMesh(smoothSphere(0.028, 0), {
            pos: [Math.sin(ra) * 0.64, 0.28, Math.cos(ra) * 0.64]
          }),
          materialIndex: 5
        });
      }
    }

    // Round riveted buckler shield on flank
    built.push({
      mesh: bakeMeshCavityAO(
        transformMesh(latheMesh([[0, -0.05], [0.36, -0.04], [0.36, 0.04], [0, 0.06]], 14, false), {
          pos: [0.6 * scaleBody, 0.38, 0.16],
          rot: [0, 0.18, -Math.PI * 0.45]
        }),
        0.22
      ),
      materialIndex: 4
    });
    built.push({
      mesh: transformMesh(latheMesh([[0, 0.04], [0.14, 0.05], [0.085, 0.11], [0, 0.135]], 12), {
        pos: [0.62 * scaleBody, 0.38, 0.17],
        rot: [0, 0.18, -Math.PI * 0.45]
      }),
      materialIndex: isKing ? 3 : 5
    });

    const mats: AuraMaterialSpec[] = [
      material.matteClay({ name: "raider sculpted cartoon skin", color: "#ffffff", roughness: 0.48 }),
      material.ceramic({ name: "raider ivory & ermine", color: "#fffaf0", roughness: 0.28, clearcoat: 0.55 }),
      material.lacquer({ name: "raider glossy pupil & brow", color: "#191c24", roughness: 0.08, clearcoat: 1 }),
      isKing ? CRAFT_MATS.navalBrass : CRAFT_MATS.forgedIron,
      isKing || isKnight ? CRAFT_MATS.tntRed : CRAFT_MATS.saddleLeather,
      CRAFT_MATS.navalBrass
    ];

    const proto = assembleMultiMaterialNode("siege-raider-proto", built, mats).toJSON() as unknown as {
      readonly geometry?: AuraCustomGeometrySpec;
      readonly materials?: readonly AuraMaterialSpec[];
    };
    return {
      spec: proto.geometry ?? buildGroupedGeometrySpec(built),
      materials: (proto.materials ?? mats) as readonly AuraMaterialSpec[]
    };
  });
}

export function buildRaiderBossNode(slot: number, runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const rank = slot === 0 ? 0 : slot % 2 === 1 ? 1 : 2; // 0 = King, 1 = Knight, 2 = Grunt
  const compiled = buildCompiledRaiderAsset(rank);
  return geometry
    .multiMaterial(compiled.spec, compiled.materials, {
      name: runtimeId,
      position: [0, -120, 0],
      rotation: [0, -Math.PI * 0.45, 0],
      scale: [0.54, 0.54, 0.54],
      castShadow: true,
      receiveShadow: true
    })
    .runtime({ id: runtimeId, tags: ["gull"] }) as unknown as AuraNodeBuilder<AuraGroupNode>;
}

export function buildPlankScatterNode(runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.15, 0.09, 0.24, 0.018), { pos: [0, 0.05, 0], rot: [0, 0.15, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.05, 0.09, 0.22, 0.018), { pos: [0.12, 0.13, 0.16], rot: [0.06, -0.42, 0.08] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.88, 0.08, 0.2, 0.016), { pos: [-0.18, 0.05, -0.24], rot: [0, 0.68, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.14, 0.12, 0.28, 0.015), { pos: [0.35, 0.06, 0.02], rot: [0, 0.15, 0] }), materialIndex: 1 }
  ];
  return assembleMultiMaterialNode(
    runtimeId,
    slots,
    [CRAFT_MATS.seasonedOak, CRAFT_MATS.forgedIron],
    {
      id: runtimeId,
      tags: ["dressing"],
      position: [5.2, 0.02, 2.1],
      rotation: [0, 0.7, 0],
      castShadow: false,
      receiveShadow: true
    }
  );
}
