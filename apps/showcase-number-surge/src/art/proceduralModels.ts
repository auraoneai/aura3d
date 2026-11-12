/**
 * Procedural multi-material 3D art kit for Number Surge (`WP-15`).
 *
 * Replaces all static roadside `.glb` mounts and placeholder primitives with
 * curved, bevelled, lathed, lofted, extruded, and trussed `@aura3d/engine`
 * procedural assemblies built on the shared `proceduralKernel`.
 */
import {
  geometry,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
  extrudePolygonMesh,
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
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";

export interface MutableRawMesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function asMutableMesh(m: RawMesh): MutableRawMesh {
  return {
    positions: m.positions,
    normals: m.normals,
    uvs: m.uvs,
    indices: m.indices
  };
}

function concatRawMeshes(parts: readonly RawMesh[]): MutableRawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const off = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + off);
  }
  return { positions, normals, uvs, indices };
}

// ---------------------------------------------------------------------------
// Physical Multi-Material Palette (>= 8 physical/metallic/clearcoat/emissive lobes)
// ---------------------------------------------------------------------------

export const SURGE_MATERIALS = {
  heroClearcoatCyan: material.clearcoatPaint({
    color: "#18d8ff",
    roughness: 0.11,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04
  }),
  anisotropicAlloy: material.brushedMetal({
    color: "#c8d6ee",
    roughness: 0.24,
    anisotropy: 0.88,
    anisotropyRotation: 0.35
  }),
  darkTitanium: material.studioMetal({
    color: "#2b3152",
    roughness: 0.28,
    metalness: 0.9
  }),
  mirrorChrome: material.chrome({
    color: "#eef5ff",
    roughness: 0.08
  }),
  cyanEnergyScreen: material.physical({
    color: "#a8eaff",
    roughness: 0.04,
    opacity: 0.42,
    clearcoat: 1,
    ior: 1.52
  }),
  crimsonEnergyScreen: material.physical({
    color: "#ff8cb8",
    roughness: 0.04,
    opacity: 0.42,
    clearcoat: 1,
    ior: 1.52
  }),
  neonCyanPractical: material.emissive({
    color: "#3ef2ff",
    emissive: "#3ef2ff",
    emissiveIntensity: 2.2,
    practical: true
  }),
  neonMagentaPractical: material.emissive({
    color: "#ff4fd8",
    emissive: "#ff4fd8",
    emissiveIntensity: 2.1,
    practical: true
  }),
  neonGoldPractical: material.emissive({
    color: "#ffd84d",
    emissive: "#ffd84d",
    emissiveIntensity: 2.0,
    practical: true
  }),
  crimsonHazardPractical: material.emissive({
    color: "#ff4f6d",
    emissive: "#ff4f6d",
    emissiveIntensity: 1.9,
    practical: true
  }),
  escortLacquer: material.lacquer({
    color: "#2be4ff",
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04
  }),
  escortCeramic: material.ceramic({
    color: "#ffe066",
    roughness: 0.13
  }),
  boulevardWoodPbr: material.pbr({
    color: "#3d2638",
    roughness: 0.76,
    metallic: 0.06,
    clearcoat: 0,
    sheen: 0
  }),
  cypressFoliagePbr: material.pbr({
    color: "#1b6b7d",
    roughness: 0.58,
    metallic: 0.08,
    emissive: "#15d6e8",
    emissiveIntensity: 0.08,
    clearcoat: 0,
    sheen: 0
  }),
  palmCanopyPbr: material.pbr({
    color: "#d4eef8",
    roughness: 0.22,
    metallic: 0.18,
    emissive: "#58d8ff",
    emissiveIntensity: 0.09,
    clearcoat: 0,
    sheen: 0
  }),
  pinkPalmCanopyPbr: material.pbr({
    color: "#ffe0f7",
    roughness: 0.22,
    metallic: 0.18,
    emissive: "#ff4fd8",
    emissiveIntensity: 0.09,
    clearcoat: 0,
    sheen: 0
  }),
  instancedAlloyBatch: material.metal({
    color: "#9aaad0",
    roughness: 0.26,
    metallic: 0.9,
    clearcoat: 0,
    sheen: 0
  }),
  instancedObsidianBatch: material.pbr({
    color: "#1d183d",
    roughness: 0.34,
    metallic: 0.42,
    clearcoat: 0,
    sheen: 0
  }),
  ivoryLacquerBatch: material.pbr({
    color: "#f4f7ff",
    roughness: 0.16,
    metallic: 0.12,
    emissive: "#6b44c8",
    emissiveIntensity: 0.08,
    clearcoat: 0,
    sheen: 0
  })
} satisfies Record<string, AuraMaterialSpec>;

// ---------------------------------------------------------------------------
// 1. Hero Multi-Material Surge Core, Escort Orbs & Powerup Medallion
// ---------------------------------------------------------------------------

/**
 * Multi-material hero ball (`r = radius`, default `0.55`).
 * Lateral gyro bands and hub caps stay at `|x| >= 0.39` so the front `+Z`
 * `ball-label` numeral cap (`|x| <= 0.375`) stays 100% unobstructed under X-axis roll.
 */
export function buildHeroSurgeBallNode(radius = 0.55): ReturnType<typeof assembleMultiMaterialNode> {
  const hemiSteps = 22;
  const sphereProfile: V2[] = [];
  for (let i = 0; i <= hemiSteps; i += 1) {
    const phi = -Math.PI * 0.5 + (i / hemiSteps) * Math.PI;
    sphereProfile.push([Math.max(0, Math.cos(phi) * radius), Math.sin(phi) * radius]);
  }
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(sphereProfile, 32, false), materialIndex: 0 }
  ];

  const bandX = radius * 0.74;
  const bandOuter = Math.sqrt(Math.max(0.01, radius * radius - bandX * bandX)) + 0.018;
  const bandInner = bandOuter * 0.86;
  const gyroRingProfile: V2[] = [
    [bandInner, -0.028],
    [bandOuter, -0.022],
    [bandOuter + 0.012, 0],
    [bandOuter, 0.022],
    [bandInner, 0.028]
  ];
  const hubProfile: V2[] = [
    [0, 0.032],
    [radius * 0.2, 0.032],
    [radius * 0.25, 0.012],
    [radius * 0.28, -0.018],
    [0, -0.018]
  ];

  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(latheMesh(gyroRingProfile, 24, false), {
        pos: [side * bandX, 0, 0],
        rot: [0, 0, -side * Math.PI * 0.5]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(latheMesh(hubProfile, 18, false), {
        pos: [side * (radius - 0.016), 0, 0],
        rot: [0, 0, -side * Math.PI * 0.5]
      }),
      materialIndex: 2
    });
    for (let k = 0; k < 6; k += 1) {
      const ang = (k / 6) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.03, 0.048, 0.085, 0.008), {
          pos: [
            side * (bandX + 0.01),
            Math.cos(ang) * (bandOuter + 0.008),
            Math.sin(ang) * (bandOuter + 0.008)
          ],
          rot: [ang, 0, 0]
        }),
        materialIndex: 3
      });
    }
  }

  return assembleMultiMaterialNode(
    "ball",
    slots,
    [
      SURGE_MATERIALS.heroClearcoatCyan,
      SURGE_MATERIALS.anisotropicAlloy,
      SURGE_MATERIALS.darkTitanium,
      SURGE_MATERIALS.neonCyanPractical
    ],
    { id: "ball", castShadow: true, receiveShadow: true }
  );
}

/** Star-bevelled lacquer escort orb (`r ~ 0.145`) with equatorial collar & crown facets. */
export function buildLacquerEscortOrbSpec(): AuraCustomGeometrySpec {
  const profile: V2[] = [
    [0, -0.145],
    [0.095, -0.115],
    [0.142, -0.032],
    [0.158, 0],
    [0.142, 0.032],
    [0.095, 0.115],
    [0, 0.145]
  ];
  const core = latheMesh(profile, 16, false);
  const finRing: RawMesh[] = [core];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    finRing.push(
      transformMesh(bevelBoxMesh(0.028, 0.09, 0.055, 0.006), {
        pos: [Math.cos(a) * 0.135, 0, Math.sin(a) * 0.135],
        rot: [0, -a, 0]
      })
    );
  }
  return mergeRawMeshes(finRing);
}

/** Faceted crown-cut ceramic escort orb (`r ~ 0.125`) with stepped octagonal girdle. */
export function buildCeramicEscortOrbSpec(): AuraCustomGeometrySpec {
  const profile: V2[] = [
    [0, -0.13],
    [0.088, -0.075],
    [0.128, -0.018],
    [0.128, 0.018],
    [0.084, 0.082],
    [0.038, 0.118],
    [0, 0.125]
  ];
  return mergeRawMeshes([latheMesh(profile, 8, true)]);
}

/** Crown-cut 8-point star crystal medallion (`r = 0.38`) for the `powerups` `Batch`. */
export function powerupMedallionMeshData(): MutableRawMesh {
  const starPts: V2[] = [];
  const points = 8;
  for (let i = 0; i < points * 2; i += 1) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? 0.36 : 0.235;
    starPts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  const starGem = extrudePolygonMesh(starPts, 0.16, 0.045, true);
  const bezelProfile: V2[] = [
    [0.25, -0.055],
    [0.39, -0.035],
    [0.41, 0],
    [0.39, 0.035],
    [0.25, 0.055]
  ];
  const bezel = transformMesh(latheMesh(bezelProfile, 16, false), { rot: [Math.PI * 0.5, 0, 0] });
  return concatRawMeshes([starGem, bezel]);
}

// ---------------------------------------------------------------------------
// 2. Sculpted Highway Math-Gate Gantries (Lattice Truss + Physical Screens)
// ---------------------------------------------------------------------------

/**
 * Upgraded `gate-frames` `Batch` mesh (`x in [-1.46, 1.46]`, `y in [0, 3.42]`):
 * chamfered alloy side stanchions + open 4-chord `latticeTrussMesh` lintel + corner gussets.
 */
export function highwayGateGantryFrameMeshData(): MutableRawMesh {
  const parts: RawMesh[] = [];
  for (const side of [-1, 1] as const) {
    parts.push(transformMesh(bevelBoxMesh(0.16, 3.24, 0.2, 0.032), { pos: [side * 1.38, 1.62, 0] }));
    parts.push(transformMesh(bevelBoxMesh(0.32, 0.22, 0.34, 0.035), { pos: [side * 1.38, 0.11, 0] }));
    parts.push(
      transformMesh(bevelBoxMesh(0.28, 0.12, 0.22, 0.02), {
        pos: [side * 1.16, 3.02, 0],
        rot: [0, 0, side * 0.62]
      })
    );
  }
  parts.push(
    transformMesh(
      latticeTrussMesh({ span: [2.92, 0.32, 0.28], bays: 6, chordRadius: 0.026, braceRadius: 0.016 }),
      { pos: [0, 3.28, 0] }
    )
  );
  return concatRawMeshes(parts);
}

/**
 * Full-highway overhead math-gate gantry (`stanchions at x = ±5.15`, `y = 0..7.6`, clear of all lanes)
 * plus companion `castShadow: false` translucent cyan/crimson `material.physical` overhead energy screens.
 */
export function buildHighwayMathGantryFrameNode(id: string): ReturnType<typeof assembleMultiMaterialNode> {
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.95, 0.42, 1.35, 0.06), { pos: [side * 5.15, 0.21, 0] }),
      materialIndex: 1
    });
    for (const zOff of [-0.36, 0.36] as const) {
      slots.push({
        mesh: transformMesh(
          tubeSweepMesh(
            [
              [side * 5.38, 0.35, zOff, 0.14],
              [side * 4.92, 7.15, zOff * 0.35, 0.105]
            ],
            8,
            false
          ),
          {}
        ),
        materialIndex: 0
      });
    }
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.14, 4.6, 0.18, 0.025), { pos: [side * 4.82, 3.6, 0] }),
      materialIndex: 2
    });
  }

  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [10.4, 0.82, 0.76], bays: 10, chordRadius: 0.055, braceRadius: 0.032 }),
      { pos: [0, 7.12, 0] }
    ),
    materialIndex: 0
  });

  for (const xSign of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(3.6, 0.14, 0.22, 0.025), { pos: [xSign * 2.15, 6.58, 0] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(3.4, 0.08, 0.26, 0.015), { pos: [xSign * 2.15, 7.62, 0] }),
      materialIndex: xSign < 0 ? 2 : 3
    });
  }

  return assembleMultiMaterialNode(
    id,
    slots,
    [
      SURGE_MATERIALS.anisotropicAlloy,
      SURGE_MATERIALS.darkTitanium,
      SURGE_MATERIALS.neonCyanPractical,
      SURGE_MATERIALS.neonMagentaPractical
    ],
    { id, castShadow: true, receiveShadow: true }
  );
}

/** Companion translucent cyan & crimson overhead math-gate energy panels (`castShadow: false`). */
export function buildHighwayGantryScreensNode(id: string): ReturnType<typeof assembleMultiMaterialNode> {
  const panelMesh = bevelBoxMesh(3.45, 1.32, 0.06, 0.015);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(panelMesh, { pos: [-2.15, 5.82, 0] }), materialIndex: 0 },
    { mesh: transformMesh(panelMesh, { pos: [2.15, 5.82, 0] }), materialIndex: 1 }
  ];
  return assembleMultiMaterialNode(
    id,
    slots,
    [SURGE_MATERIALS.cyanEnergyScreen, SURGE_MATERIALS.crimsonEnergyScreen],
    { id, castShadow: false, receiveShadow: false }
  );
}

// ---------------------------------------------------------------------------
// 3. Procedural Roadside 4-Family Replacements (Cyber-Palms, "7", Casino Dice)
// ---------------------------------------------------------------------------

/** S-curved ringed cyber-palm trunk + octagonal pedestal collar (`y in [0, 15]`). */
export function buildCyberPalmTrunkSpec(): AuraCustomGeometrySpec {
  const curvePts = catmullRomSpline3(
    [
      [0, 0, 0],
      [0.32, 3.8, 0.16],
      [-0.18, 8.2, -0.12],
      [0.24, 12.1, 0.08],
      [0.08, 13.75, 0]
    ],
    5,
    false
  );
  const spine: V4[] = curvePts.map((p, idx) => {
    const t = idx / Math.max(1, curvePts.length - 1);
    const ringPulse = 1 + 0.085 * Math.sin(t * Math.PI * 22);
    const rad = (0.52 * (1 - t * 0.56) + 0.08) * ringPulse;
    return [p[0], p[1], p[2], rad];
  });
  const baseCollar: V2[] = [
    [0, 0],
    [1.18, 0],
    [1.12, 0.36],
    [0.86, 0.62],
    [0.64, 1.05],
    [0, 1.08]
  ];
  return mergeRawMeshes([
    latheMesh(baseCollar, 8, true),
    tubeSweepMesh(spine, 9, false)
  ]);
}

/** 9 arched lofted synthwave palm fronds + faceted energy coconut crown (`y in [11.2, 15.0]`). */
export function buildCyberPalmCrownSpec(seed = 1): AuraCustomGeometrySpec {
  const crownTop: V3 = [0.08, 13.78, 0];
  const parts: RawMesh[] = [];
  const frondCount = 9;
  for (let f = 0; f < frondCount; f += 1) {
    const yaw = (f / frondCount) * Math.PI * 2 + hash01(seed * 19 + f) * 0.18;
    const tilt = f % 2 === 0 ? 0.18 : -0.06;
    const reach = 3.25 + (f % 3) * 0.24;
    const sections: V3[][] = [];
    const steps = 7;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const r = t * reach;
      const archY = Math.sin(t * Math.PI * 0.72) * (1.12 + tilt) - t * t * 1.68;
      const halfW = Math.sin(Math.pow(t, 0.68) * Math.PI) * 0.48 + 0.025;
      const ribDrop = halfW * 0.26;
      const localRing: V3[] = [
        [r, archY + 0.045, 0],
        [r, archY - ribDrop, halfW],
        [r, archY - 0.04, 0],
        [r, archY - ribDrop, -halfW]
      ];
      sections.push(
        localRing.map(([lx, ly, lz]) => [
          crownTop[0] + lx * Math.cos(yaw) - lz * Math.sin(yaw),
          crownTop[1] + ly,
          crownTop[2] + lx * Math.sin(yaw) + lz * Math.cos(yaw)
        ])
      );
    }
    parts.push(loftSectionsMesh(sections, true, true));
  }
  for (let c = 0; c < 4; c += 1) {
    const a = (c / 4) * Math.PI * 2 + 0.4;
    parts.push(
      transformMesh(icosphereFacetMesh(0.32, 0, 0.06, seed + c * 7), {
        pos: [crownTop[0] + Math.cos(a) * 0.38, crownTop[1] - 0.28, crownTop[2] + Math.sin(a) * 0.38]
      })
    );
  }
  return mergeRawMeshes(parts);
}

/** Bevelled serif arcade `"7"` monolith (`y in [2.8, 18.0]`, `|x| <= 3.35`). */
export function buildNumeralSevenBodySpec(): AuraCustomGeometrySpec {
  const sevenRing: V2[] = [
    [-1.55, 2.8],
    [0.35, 2.8],
    [3.35, 15.25],
    [3.35, 18.0],
    [-3.35, 18.0],
    [-3.35, 14.35],
    [-2.05, 14.35],
    [-2.05, 15.65],
    [1.18, 15.65]
  ];
  const body = extrudePolygonMesh(sevenRing, 1.92, 0.24, true);
  const crossbarTrim = transformMesh(bevelBoxMesh(6.2, 0.42, 2.18, 0.06), { pos: [0, 16.9, 0] });
  return mergeRawMeshes([body, crossbarTrim]);
}

/** Stepped octagonal plinth + `archwayVoussoirSlots` portal + `latticeTrussMesh` buttresses (`y in [0, 3.1]`). */
export function buildNumeralSevenPlinthSpec(): AuraCustomGeometrySpec {
  const plinthProfile: V2[] = [
    [0, 0],
    [3.3, 0],
    [3.2, 0.55],
    [2.65, 0.85],
    [2.55, 1.75],
    [2.05, 2.15],
    [1.95, 2.85],
    [0, 2.88]
  ];
  const archParts = archwayVoussoirSlots({
    radius: 1.05,
    thickness: 0.42,
    depth: 2.35,
    voussoirs: 7,
    stoneMatA: 0,
    stoneMatB: 0,
    keystoneMat: 0
  }).map((s) => transformMesh(s.mesh, { pos: [0, 0.55, 0] }));
  const trussL = transformMesh(
    latticeTrussMesh({ span: [0.46, 2.5, 0.46], bays: 4, chordRadius: 0.04, braceRadius: 0.025 }),
    { pos: [-2.35, 1.45, 0] }
  );
  const trussR = transformMesh(
    latticeTrussMesh({ span: [0.46, 2.5, 0.46], bays: 4, chordRadius: 0.04, braceRadius: 0.025 }),
    { pos: [2.35, 1.45, 0] }
  );
  return mergeRawMeshes([latheMesh(plinthProfile, 8, true), trussL, trussR, ...archParts]);
}

/** Centered `1.6 m` (`[-0.8, 0.8]^3`) chamfered casino die body. */
export function buildFloatingDieBodySpec(): AuraCustomGeometrySpec {
  return mergeRawMeshes([bevelBoxMesh(1.6, 1.6, 1.6, 0.16)]);
}

/** 21 spherical-cap pip inlays on all 6 faces (opposite faces sum to 7). */
export function buildFloatingDiePipsSpec(): AuraCustomGeometrySpec {
  const pipProfile: V2[] = [
    [0, -0.01],
    [0.125, -0.01],
    [0.125, 0.012],
    [0.088, 0.032],
    [0, 0.04]
  ];
  const pipCap = latheMesh(pipProfile, 12, false);
  const d = 0.39;
  const h = 0.802;
  const faceLayouts: readonly { readonly rot: V3; readonly pos: V3; readonly uv: readonly V2[] }[] = [
    { rot: [Math.PI * 0.5, 0, 0], pos: [0, 0, h], uv: [[0, 0]] },
    {
      rot: [-Math.PI * 0.5, 0, 0],
      pos: [0, 0, -h],
      uv: [[-d, -d], [-d, 0], [-d, d], [d, -d], [d, 0], [d, d]]
    },
    { rot: [0, 0, -Math.PI * 0.5], pos: [h, 0, 0], uv: [[-d, -d], [d, d]] },
    {
      rot: [0, 0, Math.PI * 0.5],
      pos: [-h, 0, 0],
      uv: [[0, 0], [-d, -d], [-d, d], [d, -d], [d, d]]
    },
    { rot: [0, 0, 0], pos: [0, h, 0], uv: [[-d, -d], [0, 0], [d, d]] },
    { rot: [Math.PI, 0, 0], pos: [0, -h, 0], uv: [[-d, -d], [-d, d], [d, -d], [d, d]] }
  ];
  const parts: RawMesh[] = [];
  for (const face of faceLayouts) {
    for (const [u, v] of face.uv) {
      let offset: V3 = [0, 0, 0];
      if (Math.abs(face.pos[2]) > 0.5) offset = [u, v, face.pos[2]];
      else if (Math.abs(face.pos[0]) > 0.5) offset = [face.pos[0], u, v];
      else offset = [u, face.pos[1], v];
      parts.push(transformMesh(pipCap, { pos: offset, rot: face.rot }));
    }
  }
  return mergeRawMeshes(parts);
}

// ---------------------------------------------------------------------------
// 4. Roadside Milepost Beacons & Rotary Saw / Crusher / Barrier Hazards
// ---------------------------------------------------------------------------

/** Turned `latheMesh` roadside milepost beacon column (`y in [0, 2.55]`). */
export function buildMilepostBeaconBodySpec(): AuraCustomGeometrySpec {
  const shaftCurve = bezierCurve2([0.24, 0.32], [0.16, 0.85], [0.13, 1.55], [0.18, 1.98], 8);
  const profile: V2[] = [
    [0, 0],
    [0.34, 0],
    [0.32, 0.18],
    [0.26, 0.3],
    ...shaftCurve,
    [0.23, 2.04],
    [0.11, 2.08],
    [0.11, 2.42],
    [0.19, 2.48],
    [0, 2.58]
  ];
  return mergeRawMeshes([latheMesh(profile, 14, false)]);
}

/** Fresnel lantern drum lens (`y in [2.06, 2.44]`) for roadside milepost beacons. */
export function buildMilepostBeaconLensSpec(): AuraCustomGeometrySpec {
  const lensProfile: V2[] = [
    [0.11, 2.07],
    [0.205, 2.13],
    [0.22, 2.25],
    [0.205, 2.37],
    [0.11, 2.43]
  ];
  return mergeRawMeshes([latheMesh(lensProfile, 14, false)]);
}

/** 14-tooth chrome rotary saw blade (`radius = 1.35`) in XY for roadside hazard rigs. */
export function buildRotarySawDiscSpec(radius = 1.35, teeth = 14): AuraCustomGeometrySpec {
  const ring: V2[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.58) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.72) / teeth) * Math.PI * 2;
    ring.push([Math.cos(a0) * (radius * 0.78), Math.sin(a0) * (radius * 0.78)]);
    ring.push([Math.cos(a1) * radius, Math.sin(a1) * radius]);
    ring.push([Math.cos(a2) * (radius * 0.82), Math.sin(a2) * (radius * 0.82)]);
  }
  const blade = extrudePolygonMesh(ring, 0.11, 0.022, true);
  const arbor = transformMesh(
    latheMesh(
      [[0, -0.14], [radius * 0.28, -0.14], [radius * 0.32, 0], [radius * 0.28, 0.14], [0, 0.14]],
      16,
      false
    ),
    { rot: [Math.PI * 0.5, 0, 0] }
  );
  return mergeRawMeshes([blade, arbor]);
}

/** Mounted chrome rotary saw disc primitive node (`spec` as positional arg 1) for spinning roadside saws. */
export function buildRotarySawBladeNode(id: string) {
  return geometry
    .custom(buildRotarySawDiscSpec(), {
      name: id,
      material: SURGE_MATERIALS.mirrorChrome,
      castShadow: true,
      receiveShadow: true
    })
    .runtime({ id });
}

/**
 * Multi-material roadside rotary-saw + hydraulic crusher + crash-barrier hazard assembly
 * stationed off-lane (`|x| >= 5.8`) so gameplay lanes remain unobstructed.
 */
export function buildRoadsideHazardRigNode(id: string): ReturnType<typeof assembleMultiMaterialNode> {
  const slots: MultiMatSlot[] = [];
  // Crash barrier Jersey rail + warning chevrons
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.46, 0.92, 3.6, 0.06), { pos: [0, 0.46, 0] }), materialIndex: 1 });
  for (const zc of [-1.2, 0, 1.2] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.5, 0.28, 0.42, 0.025), { pos: [0, 0.62, zc] }),
      materialIndex: 3
    });
  }
  // Hydraulic crusher gantry frame + weighted ram block
  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.55, 4.4, 0.55], bays: 5, chordRadius: 0.042, braceRadius: 0.024 }),
      { pos: [0.85, 2.2, -0.85] }
    ),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.55, 4.4, 0.55], bays: 5, chordRadius: 0.042, braceRadius: 0.024 }),
      { pos: [0.85, 2.2, 0.85] }
    ),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(1.35, 0.44, 2.35, 0.05), { pos: [0.75, 4.35, 0] }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.96, 0.78, 1.38, 0.06), { pos: [0.68, 3.15, 0] }),
    materialIndex: 2
  });
  return assembleMultiMaterialNode(
    id,
    slots,
    [
      SURGE_MATERIALS.anisotropicAlloy,
      SURGE_MATERIALS.darkTitanium,
      SURGE_MATERIALS.mirrorChrome,
      SURGE_MATERIALS.crimsonHazardPractical
    ],
    { id, castShadow: true, receiveShadow: true }
  );
}

// ---------------------------------------------------------------------------
// 5. Skyline Setback Skyscrapers, V-Strut Piers & Stratified Floating Islands
// ---------------------------------------------------------------------------

/** Unit `[1, 1, 1]` (`y in [0, 1]`) Art-Deco synthwave setback skyscraper for `towers` `Batch`. */
export function steppedSkyscraperMeshData(): MutableRawMesh {
  const podium = transformMesh(bevelBoxMesh(1.0, 0.2, 1.0, 0.03), { pos: [0, 0.1, 0] });
  const mainShaft = transformMesh(bevelBoxMesh(0.84, 0.5, 0.84, 0.028), { pos: [0, 0.45, 0] });
  const upperSetback = transformMesh(bevelBoxMesh(0.64, 0.2, 0.64, 0.024), { pos: [0, 0.8, 0] });
  const crownSpire = latheMesh(
    [
      [0.34, 0.9],
      [0.24, 0.94],
      [0.08, 0.985],
      [0, 1.0]
    ],
    8,
    true
  );
  return concatRawMeshes([podium, mainShaft, upperSetback, crownSpire]);
}

/** Twin V-strut highway pier (`y in [-0.5, 0.5]`, `x` around `±2.9`) for `pylons` `Batch`. */
export function vStrutHighwayPierMeshData(): MutableRawMesh {
  const parts: RawMesh[] = [];
  for (const side of [-1, 1] as const) {
    const baseX = side * 2.55;
    parts.push(transformMesh(bevelBoxMesh(0.92, 0.12, 0.95, 0.03), { pos: [baseX, -0.44, 0] }));
    parts.push(
      tubeSweepMesh(
        [
          [baseX, -0.42, 0, 0.34],
          [side * 3.35, 0.5, 0, 0.26]
        ],
        6,
        true
      )
    );
    parts.push(
      tubeSweepMesh(
        [
          [baseX, -0.42, 0, 0.34],
          [side * 1.75, 0.5, 0, 0.26]
        ],
        6,
        true
      )
    );
  }
  parts.push(transformMesh(bevelBoxMesh(4.4, 0.07, 0.52, 0.015), { pos: [0, 0.06, 0] }));
  return concatRawMeshes(parts);
}

/** Haunched box-girder highway crosshead cap (`y in [-0.74, -0.16]`) for `pylon-caps` `Batch`. */
export function haunchedPierCapMeshData(): MutableRawMesh {
  const ring: V2[] = [
    [-3.95, -0.16],
    [-3.95, -0.46],
    [-2.65, -0.74],
    [2.65, -0.74],
    [3.95, -0.46],
    [3.95, -0.16]
  ];
  return asMutableMesh(extrudePolygonMesh(ring, 1.28, 0.06, true));
}

/** Terraced `stratifiedCliffMesh` floating island (`top deck at y = 0`, keel down to `-1.5 * r`). */
export function stratifiedFloatingIsleMeshData(r: number, seed: number): MutableRawMesh {
  const upperMesa = transformMesh(
    stratifiedCliffMesh({
      radiusX: r * 1.02,
      radiusZ: r * 1.02,
      height: r * 0.85,
      terraces: 4,
      seed: Math.round(seed * 13) + 7
    }),
    { pos: [0, 0, 0], scale: [1, -1, 1] }
  );
  const keelProfile: V2[] = [
    [0, -1.5 * r],
    [r * 0.28, -1.18 * r],
    [r * 0.62, -0.78 * r],
    [0, -0.75 * r]
  ];
  const deckPlate = latheMesh(
    [
      [0, -0.08 * r],
      [r * 0.96, -0.08 * r],
      [r * 1.0, 0],
      [0, 0]
    ],
    12,
    true
  );
  return concatRawMeshes([toFlatShaded(upperMesa), latheMesh(keelProfile, 9, true), deckPlate]);
}

// ---------------------------------------------------------------------------
// 6. Suspension Bridge Arch, Stadium, Wind Turbines, Avenues & Finish Monument
// ---------------------------------------------------------------------------

/** Grand suspension bridge arch (`stanchions at x = ±14.8`, `archwayVoussoirSlots` + catenary cables). */
export function buildSuspensionBridgeArchNode(id: string): ReturnType<typeof assembleMultiMaterialNode> {
  const slots: MultiMatSlot[] = [];
  const archSlots = archwayVoussoirSlots({
    radius: 13.2,
    thickness: 1.55,
    depth: 2.2,
    voussoirs: 13,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 2
  });
  for (const s of archSlots) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0, 1.2, 0] }), materialIndex: s.materialIndex });
  }
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [1.65, 32, 1.85], bays: 10, chordRadius: 0.11, braceRadius: 0.065 }),
        { pos: [side * 14.8, 2.0, 0] }
      ),
      materialIndex: 0
    });
    for (const zOff of [-0.85, 0.85] as const) {
      const cablePts = catmullRomSpline3(
        [
          [-14.8, 17.8, zOff],
          [-7.2, 11.4, zOff],
          [0, 9.2, zOff],
          [7.2, 11.4, zOff],
          [14.8, 17.8, zOff]
        ],
        6,
        false
      );
      slots.push({
        mesh: tubeSweepMesh(cablePts.map((p) => [p[0], p[1], p[2], 0.095 * (side > 0 ? 1 : 0.98)]), 7, false),
        materialIndex: side > 0 ? 2 : 3
      });
    }
  }
  return assembleMultiMaterialNode(
    id,
    slots,
    [
      SURGE_MATERIALS.anisotropicAlloy,
      SURGE_MATERIALS.darkTitanium,
      SURGE_MATERIALS.neonCyanPractical,
      SURGE_MATERIALS.neonMagentaPractical
    ],
    { id, castShadow: false, receiveShadow: false }
  );
}

/** Elliptical cyber-stadium bowl (`loftSectionsMesh`) + 4 floodlight truss towers (`y >= 0`). */
export function buildStadiumSkylineNode(id: string): ReturnType<typeof assembleMultiMaterialNode> {
  const segs = 20;
  const ring = (rx: number, rz: number, y: number): V3[] =>
    Array.from({ length: segs }, (_, i) => {
      const a = (i / segs) * Math.PI * 2;
      return [Math.cos(a) * rx, y, Math.sin(a) * rz];
    });
  const bowl = loftSectionsMesh(
    [ring(9.5, 13.5, 0), ring(11.8, 16.2, 4.2), ring(13.6, 18.6, 8.8), ring(12.2, 17.0, 9.6)],
    true,
    true
  );
  const slots: MultiMatSlot[] = [
    { mesh: bowl, materialIndex: 1 },
    { mesh: loftSectionsMesh([ring(13.4, 18.4, 8.9), ring(13.9, 18.9, 9.5)], true, false), materialIndex: 2 }
  ];
  for (const [sx, sz] of [[-11, -13], [11, -13], [-11, 13], [11, 13]] as const) {
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [0.85, 14.5, 0.85], bays: 6, chordRadius: 0.07, braceRadius: 0.04 }),
        { pos: [sx, 7.25, sz] }
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(1.9, 1.1, 0.45, 0.06), { pos: [sx, 14.8, sz], rot: [0.32, sx > 0 ? -0.5 : 0.5, 0] }),
      materialIndex: 3
    });
  }
  return assembleMultiMaterialNode(
    id,
    slots,
    [
      SURGE_MATERIALS.anisotropicAlloy,
      SURGE_MATERIALS.darkTitanium,
      SURGE_MATERIALS.neonMagentaPractical,
      SURGE_MATERIALS.neonGoldPractical
    ],
    { id, castShadow: false, receiveShadow: false }
  );
}

/** Tapered tubular wind turbine tower (`y in [0, 22]`) + streamlined `loftSectionsMesh` nacelle. */
export function buildWindTurbineTowerSpec(): AuraCustomGeometrySpec {
  const tower = latheMesh([[0, 0], [1.35, 0], [1.18, 1.2], [0.82, 10.5], [0.52, 21.8], [0, 22.0]], 14, false);
  const nacRing = (r: number, z: number): V3[] =>
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return [Math.cos(a) * r, 22.0 + Math.sin(a) * r * 0.88, z];
    });
  const nacelle = loftSectionsMesh([nacRing(0.25, -1.9), nacRing(0.76, -0.7), nacRing(0.82, 0.9), nacRing(0.38, 1.65)], true, false);
  return mergeRawMeshes([tower, nacelle]);
}

/** 3-blade twisted airfoil wind turbine rotor centered at `[0, 0, 0]` (`radius = 8.4`). */
export function buildWindTurbineRotorSpec(): AuraCustomGeometrySpec {
  const hub = transformMesh(latheMesh([[0, -0.45], [0.58, -0.35], [0.42, 0.25], [0, 0.78]], 12, false), {
    rot: [Math.PI * 0.5, 0, 0]
  });
  const parts: RawMesh[] = [hub];
  for (let b = 0; b < 3; b += 1) {
    const roll = (b / 3) * Math.PI * 2;
    const sections: V3[][] = [];
    for (let s = 0; s <= 5; s += 1) {
      const t = s / 5;
      const y = 0.45 + t * 7.95;
      const chord = (1 - t * 0.74) * 0.72 + 0.08;
      const thick = chord * 0.18;
      const twist = 0.42 * (1 - t);
      const c = Math.cos(twist), sn = Math.sin(twist);
      const pts: V2[] = [[-chord * 0.35, 0], [0, thick], [chord * 0.65, 0], [0, -thick * 0.65]];
      sections.push(pts.map(([px, pz]) => [px * c - pz * sn, y, px * sn + pz * c]));
    }
    parts.push(transformMesh(loftSectionsMesh(sections, true, false), { rot: [0, 0, roll] }));
  }
  return mergeRawMeshes(parts);
}

/** Boulevard trunk (`y in [0, 5.2]`), `coniferBoughTierMesh` cypress spire, & `layeredCanopyMesh` crown. */
export function buildCypressTrunkSpec(): AuraCustomGeometrySpec {
  return mergeRawMeshes([
    tubeSweepMesh([[0, 0, 0, 0.46], [0.06, 2.2, 0.04, 0.32], [-0.04, 5.4, 0, 0.18]], 8, false)
  ]);
}

export function buildCypressFoliageSpec(seed = 29): AuraCustomGeometrySpec {
  const spire = transformMesh(
    coniferBoughTierMesh({ baseRadius: 1.85, height: 10.6, tiers: 6, seed }),
    { pos: [0, 2.4, 0] }
  );
  return mergeRawMeshes([spire]);
}

export function buildBoulevardCanopySpec(seed = 11): AuraCustomGeometrySpec {
  const crown = transformMesh(
    layeredCanopyMesh({ radius: 2.85, height: 4.4, puffs: 9, seed }),
    { pos: [0, 4.4, 0] }
  );
  return mergeRawMeshes([crown]);
}

/**
 * Split-arch Tiered Multiplier Podium Finish-Stair Monument straddling the highway (`|x| >= 5.2` at deck level,
 * overhead triumphal arch `y = 10.2..22.5` so lanes `|x| <= 3.7` pass cleanly underneath).
 */
export function buildMultiplierPodiumMonumentNode(id: string): ReturnType<typeof assembleMultiMaterialNode> {
  const slots: MultiMatSlot[] = [];
  const tiers = 7;
  for (const side of [-1, 1] as const) {
    for (let t = 0; t < tiers; t += 1) {
      const w = 9.6 - t * 0.95;
      const d = 11.5 - t * 1.1;
      const y = 0.7 + t * 1.4;
      const cx = side * (5.2 + w * 0.5 + t * 0.18);
      slots.push({ mesh: transformMesh(bevelBoxMesh(w, 1.38, d, 0.09), { pos: [cx, y, 0] }), materialIndex: 1 });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(w * 0.92, 0.18, 0.24, 0.025), { pos: [cx, y + 0.58, d * 0.5 + 0.04] }),
        materialIndex: t % 3 === 0 ? 2 : t % 3 === 1 ? 3 : 4
      });
    }
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [1.35, 19.5, 1.35], bays: 8, chordRadius: 0.09, braceRadius: 0.055 }),
        { pos: [side * 6.4, 9.75, 0] }
      ),
      materialIndex: 0
    });
  }
  for (const s of archwayVoussoirSlots({
    radius: 5.8,
    thickness: 1.35,
    depth: 2.6,
    voussoirs: 11,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 4
  })) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0, 11.2, 0] }), materialIndex: s.materialIndex });
  }
  slots.push({
    mesh: transformMesh(icosphereFacetMesh(1.45, 1, 0.05, 77), { pos: [0, 20.4, 0] }),
    materialIndex: 4
  });
  // Preserve explicit reference to buildGroupedGeometrySpec for kernel consumers
  void buildGroupedGeometrySpec;
  return assembleMultiMaterialNode(
    id,
    slots,
    [
      SURGE_MATERIALS.anisotropicAlloy,
      SURGE_MATERIALS.darkTitanium,
      SURGE_MATERIALS.neonCyanPractical,
      SURGE_MATERIALS.neonMagentaPractical,
      SURGE_MATERIALS.neonGoldPractical
    ],
    { id, castShadow: false, receiveShadow: false }
  );
}
