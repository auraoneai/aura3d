/**
 * Procedural multi-material 3D art kit for Number Surge (`WP-15`).
 *
 * Replaces all static roadside `.glb` mounts and placeholder primitives with
 * curved, bevelled, lathed, lofted, extruded, and trussed `@aura3d/engine`
 * procedural assemblies built on the shared `proceduralKernel`.
 */
import {
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  mergeRawMeshes,
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
// Physical Multi-Material Palette (deep midnight-violet, cyan, magenta & gold)
// ---------------------------------------------------------------------------

export const SURGE_MATERIALS = {
  heroClearcoatCyan: material.clearcoatPaint({
    color: "#18d8ff",
    roughness: 0.1,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04
  }),
  anisotropicAlloy: material.brushedMetal({
    color: "#5ce2ff",
    roughness: 0.22,
    anisotropy: 0.88,
    anisotropyRotation: 0.35
  }),
  darkTitanium: material.studioMetal({
    color: "#19123c",
    roughness: 0.26,
    metalness: 0.88
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
  palmCanopyPbr: material.pbr({
    color: "#2ef0ff",
    roughness: 0.2,
    metallic: 0.16,
    emissive: "#1ce2ff",
    emissiveIntensity: 0.52,
    clearcoat: 0,
    sheen: 0
  }),
  pinkPalmCanopyPbr: material.pbr({
    color: "#ff55dc",
    roughness: 0.2,
    metallic: 0.16,
    emissive: "#ff36ce",
    emissiveIntensity: 0.52,
    clearcoat: 0,
    sheen: 0
  }),
  pylonIndigoMetal: material.metal({
    color: "#1a1340",
    roughness: 0.3,
    metallic: 0.82,
    emissive: "#2b1866",
    emissiveIntensity: 0.22,
    clearcoat: 0,
    sheen: 0
  }),
  curbObsidianMetal: material.metal({
    color: "#1c1545",
    roughness: 0.24,
    metallic: 0.78,
    emissive: "#2f196e",
    emissiveIntensity: 0.2,
    clearcoat: 0,
    sheen: 0
  }),
  instancedObsidianBatch: material.pbr({
    color: "#161038",
    roughness: 0.3,
    metallic: 0.48,
    emissive: "#261458",
    emissiveIntensity: 0.16,
    clearcoat: 0,
    sheen: 0
  }),
  sevenVioletLacquer: material.pbr({
    color: "#e29cff",
    roughness: 0.16,
    metallic: 0.15,
    emissive: "#b84dff",
    emissiveIntensity: 0.44,
    clearcoat: 0,
    sheen: 0
  }),
  ivoryLacquerBatch: material.pbr({
    color: "#d4dcff",
    roughness: 0.16,
    metallic: 0.14,
    emissive: "#6b44d8",
    emissiveIntensity: 0.28,
    clearcoat: 0,
    sheen: 0
  }),
  skylineIndigoSpire: material.pbr({
    color: "#150e36",
    roughness: 0.26,
    metallic: 0.64,
    emissive: "#ff4fd8",
    emissiveIntensity: 0.3,
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
// 4. Sleek Low-Profile Track Side-Curbs (height <= 0.35 m, 100% open sightline)
// ---------------------------------------------------------------------------

/**
 * Aerodynamic chamfered track side-curb pair (`|x| in [3.71, 4.02]`, `y in [-0.05, 0.22]`,
 * strictly `height = 0.22 <= 0.35`) so upcoming number gates and both synthwave skylines
 * have a 100% unobstructed wide-open sightline.
 */
export function buildSleekTrackCurbSpec(segmentLen = 3.85): AuraCustomGeometrySpec {
  const parts: RawMesh[] = [];
  for (const side of [-1, 1] as const) {
    const profile: V2[] = [
      [side * 3.71, -0.05],
      [side * 4.02, -0.05],
      [side * 4.02, 0.14],
      [side * 3.92, 0.22],
      [side * 3.77, 0.22],
      [side * 3.71, 0.05]
    ];
    parts.push(extrudePolygonMesh(profile, segmentLen, 0.012, true));
  }
  return mergeRawMeshes(parts);
}

/**
 * Companion recessed neon light-pipe rail along the inner chamfer of the low track side-curb
 * (`|x| in [3.72, 3.77]`, `y in [0.11, 0.17]`, strictly `<= 0.35 m`).
 */
export function buildSleekTrackCurbGlowSpec(segmentLen = 3.45): AuraCustomGeometrySpec {
  const parts: RawMesh[] = [];
  for (const side of [-1, 1] as const) {
    const glowProfile: V2[] = [
      [side * 3.715, 0.11],
      [side * 3.765, 0.11],
      [side * 3.765, 0.17],
      [side * 3.715, 0.17]
    ];
    parts.push(extrudePolygonMesh(glowProfile, segmentLen, 0.005, true));
  }
  return mergeRawMeshes(parts);
}

// ---------------------------------------------------------------------------
// 5. Batched Skyline Skyscrapers, Merged Under-Deck Pylons & Holo-Glyphs
// ---------------------------------------------------------------------------

/**
 * Lightweight unit `[1, 1, 1]` (`y in [0, 1]`) Art-Deco synthwave setback skyscraper
 * (`bevel = 0` crisp architectural tiers + octagonal `latheMesh` crown spire, ~92 verts).
 */
export function steppedSkyscraperMeshData(): MutableRawMesh {
  const podium = transformMesh(bevelBoxMesh(1.0, 0.22, 1.0, 0), { pos: [0, 0.11, 0] });
  const mainShaft = transformMesh(bevelBoxMesh(0.82, 0.5, 0.82, 0), { pos: [0, 0.47, 0] });
  const upperSetback = transformMesh(bevelBoxMesh(0.62, 0.18, 0.62, 0), { pos: [0, 0.81, 0] });
  const crownSpire = latheMesh(
    [
      [0.32, 0.9],
      [0.2, 0.945],
      [0.06, 0.985],
      [0, 1.0]
    ],
    8,
    true
  );
  return concatRawMeshes([podium, mainShaft, upperSetback, crownSpire]);
}

/**
 * Single merged `AuraCustomGeometrySpec` combining the twin V-strut highway pier and
 * haunched crosshead girder (`y in [-14.0, -0.22]`, `|x| <= 3.45` strictly beneath the
 * `7.4 m` highway deck) for 1-draw `instances.custom` batching.
 */
export function buildMergedHighwayPylonSpec(): AuraCustomGeometrySpec {
  const parts: RawMesh[] = [];
  for (const side of [-1, 1] as const) {
    const footX = side * 1.65;
    parts.push(transformMesh(bevelBoxMesh(0.88, 0.45, 0.96, 0.03), { pos: [footX, -13.75, 0] }));
    parts.push(
      tubeSweepMesh(
        [
          [footX, -13.55, 0, 0.3],
          [side * 2.85, -0.78, 0, 0.24]
        ],
        6,
        true
      )
    );
    parts.push(
      tubeSweepMesh(
        [
          [footX, -13.55, 0, 0.28],
          [side * 0.95, -0.78, 0, 0.22]
        ],
        6,
        true
      )
    );
  }
  const crossheadRing: V2[] = [
    [-3.45, -0.22],
    [-3.45, -0.52],
    [-2.35, -0.84],
    [2.35, -0.84],
    [3.45, -0.52],
    [3.45, -0.22]
  ];
  parts.push(extrudePolygonMesh(crossheadRing, 1.12, 0.04, true));
  return mergeRawMeshes(parts);
}

// ---------------------------------------------------------------------------
// 6. GPU-Instanced Synthwave Skyline Spires & Distant Sky Holo-Glyphs
// ---------------------------------------------------------------------------

/**
 * Unit-height (`y in [0, 1]`, footprint `[-0.5, 0.5]`) Art-Deco synthwave needle spire
 * combining a stepped octagonal `latheMesh` shaft, open `latticeTrussMesh` crown cage,
 * and faceted `icosphereFacetMesh` beacon finial for 1-draw `instances.custom` batching.
 */
export function buildSynthwaveSkylineSpireSpec(): AuraCustomGeometrySpec {
  const shaft = latheMesh(
    [
      [0, 0],
      [0.48, 0],
      [0.46, 0.24],
      [0.34, 0.28],
      [0.31, 0.62],
      [0.19, 0.67],
      [0.14, 0.84],
      [0.035, 0.98],
      [0, 1.0]
    ],
    8,
    true
  );
  const cage = transformMesh(
    latticeTrussMesh({ span: [0.34, 0.22, 0.34], bays: 3, chordRadius: 0.018, braceRadius: 0.011 }),
    { pos: [0, 0.74, 0] }
  );
  const finial = transformMesh(icosphereFacetMesh(0.065, 0, 0.01, 41), { pos: [0, 0.99, 0] });
  void buildGroupedGeometrySpec;
  return mergeRawMeshes([shaft, cage, finial]);
}

/**
 * Chamfered holographic arithmetic plus/cross emblem (`[-1.1, 1.1]` XY, depth `0.24`)
 * for distant outboard sky-glyph `instances.custom` batching (zero floating rock blobs).
 */
export function buildSkyHoloGlyphSpec(): AuraCustomGeometrySpec {
  const plusRing: V2[] = [
    [-0.24, -1.05],
    [0.24, -1.05],
    [0.24, -0.24],
    [1.05, -0.24],
    [1.05, 0.24],
    [0.24, 0.24],
    [0.24, 1.05],
    [-0.24, 1.05],
    [-0.24, 0.24],
    [-1.05, 0.24],
    [-1.05, -0.24],
    [-0.24, -0.24]
  ];
  const diamondRing: V2[] = [
    [0, -1.35],
    [1.35, 0],
    [0, 1.35],
    [-1.35, 0]
  ];
  const innerDiamond = extrudePolygonMesh(diamondRing, 0.08, 0.02, true);
  const plusCore = extrudePolygonMesh(plusRing, 0.24, 0.04, true);
  return mergeRawMeshes([plusCore, transformMesh(innerDiamond, { pos: [0, 0, -0.14], scale: 0.92 })]);
}
