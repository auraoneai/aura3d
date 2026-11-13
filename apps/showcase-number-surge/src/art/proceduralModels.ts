/**
 * Procedural multi-material 3D art kit for Number Surge (`WP-8` / `WP-15`).
 *
 * Sculpted via `apps/showcase-port-shared/proceduralKernel.ts` with zero `three`
 * imports and zero static `.glb` assets:
 * - Hero clearcoat surge core with lathed equatorial channel & lateral gyro gimbals
 * - Athletic sprinting squad runners (`subdivideSmoothMesh` + `sculptHumanoidLimbMesh`)
 * - Extruded/beveled 3D arcade numerals (`extrudePolygonMesh`) & stepped voussoir plinths
 * - Holographic math multiplier portal archways (`latticeTrussMesh` + `tubeSweepMesh`)
 * - Toothed rotary buzzsaw & grooved crusher-roller hazard barriers (`extrudeStarPolygonMesh` + `wheelAssemblySlots`)
 * - Tropical finish-island palms & vaulted iron-banded treasure chests (`stratifiedCliffMesh` + `layeredCanopyMesh`)
 */
import {
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  deformMesh,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptHumanoidLimbMesh,
  sculptStylizedHeadMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
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
  heroClearcoatCyan: material.carPaint({
    color: "#18d8ff",
    flakeColor: "#9cf6ff",
    roughness: 0.1,
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
  sawBladeSteel: material.brushedMetal({
    color: "#dce8ff",
    roughness: 0.18,
    anisotropy: 0.9,
    anisotropyRotation: 0.62
  }),
  chestBrassTrim: material.studioMetal({
    color: "#ffd057",
    roughness: 0.22,
    metalness: 0.9
  }),
  runnerSuitFabric: material.fabric({
    color: "#22164c",
    roughness: 0.68,
    sheen: 0.82,
    sheenColor: "#5ae8ff",
    sheenRoughness: 0.34
  }),
  cleatBlackRubber: material.blackRubber({
    color: "#141028",
    roughness: 0.66
  }),
  islandCoralClay: material.matteClay({
    color: "#33205e",
    roughness: 0.74
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
  neonCrimsonPractical: material.emissive({
    color: "#ff2652",
    emissive: "#ff1f4a",
    emissiveIntensity: 2.45,
    practical: true
  }),
  escortLacquer: material.lacquer({
    color: "#ffffff",
    roughness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04
  }),
  escortCeramic: material.ceramic({
    color: "#ffffff",
    roughness: 0.13
  }),
  rivalRiotArmor: material.carPaint({
    color: "#ffffff",
    roughness: 0.16,
    clearcoat: 0.92,
    clearcoatRoughness: 0.06
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
    color: "#18113e",
    roughness: 0.28,
    metallic: 0.52,
    emissive: "#2e1968",
    emissiveIntensity: 0.2,
    clearcoat: 0,
    sheen: 0
  }),
  tropicalIslandBatch: material.pbr({
    color: "#2a1b5c",
    roughness: 0.36,
    metallic: 0.28,
    emissive: "#ff8a3d",
    emissiveIntensity: 0.22,
    clearcoat: 0,
    sheen: 0
  }),
  sevenVioletLacquer: material.pbr({
    color: "#e29cff",
    roughness: 0.15,
    metallic: 0.18,
    emissive: "#b84dff",
    emissiveIntensity: 0.46,
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
// 1. Hero Multi-Material Surge Core, Squad Runners & Powerup Medallion
// ---------------------------------------------------------------------------

/**
 * Multi-material hero surge ball (`r = radius`, default `0.55`).
 * Lateral gyro gimbals, recessed turbine hubs, and plasma vanes stay at `|x| >= 0.39`
 * so the front `+Z` `ball-label` curved numeral cap (`|x| <= 0.375`) stays 100% unobstructed.
 */
export function buildHeroSurgeBallNode(radius = 0.55): ReturnType<typeof assembleMultiMaterialNode> {
  const hemiSteps = 26;
  const sphereProfile: V2[] = [];
  for (let i = 0; i <= hemiSteps; i += 1) {
    const phi = -Math.PI * 0.5 + (i / hemiSteps) * Math.PI;
    const groove = 1 - 0.022 * Math.exp(-Math.pow(phi / 0.14, 2));
    sphereProfile.push([Math.max(0, Math.cos(phi) * radius * groove), Math.sin(phi) * radius]);
  }
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(sphereProfile, 36, false), materialIndex: 0 }
  ];

  const bandX = radius * 0.74;
  const bandOuter = Math.sqrt(Math.max(0.01, radius * radius - bandX * bandX)) + 0.022;
  const bandInner = bandOuter * 0.84;
  const gyroRingProfile: V2[] = [
    [bandInner, -0.03],
    [bandOuter, -0.022],
    [bandOuter + 0.016, 0],
    [bandOuter, 0.022],
    [bandInner, 0.03]
  ];
  const hubProfile: V2[] = [
    [0, 0.038],
    [radius * 0.16, 0.036],
    [radius * 0.23, 0.016],
    [radius * 0.29, -0.012],
    [radius * 0.26, -0.024],
    [0, -0.024]
  ];

  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(latheMesh(gyroRingProfile, 28, false), {
        pos: [side * bandX, 0, 0],
        rot: [0, 0, -side * Math.PI * 0.5]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(latheMesh(hubProfile, 20, false), {
        pos: [side * (radius - 0.014), 0, 0],
        rot: [0, 0, -side * Math.PI * 0.5]
      }),
      materialIndex: 2
    });
    for (let k = 0; k < 8; k += 1) {
      const ang = (k / 8) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.028, 0.046, 0.09, 0.008), {
          pos: [
            side * (bandX + 0.012),
            Math.cos(ang) * (bandOuter + 0.008),
            Math.sin(ang) * (bandOuter + 0.008)
          ],
          rot: [ang, 0, 0]
        }),
        materialIndex: k % 2 === 0 ? 3 : 4
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
      SURGE_MATERIALS.neonCyanPractical,
      SURGE_MATERIALS.chestBrassTrim
    ],
    { id: "ball", castShadow: true, receiveShadow: true }
  );
}

interface CyberRunnerAssembly {
  readonly bodySpec: AuraCustomGeometrySpec;
  readonly glowSpec: AuraCustomGeometrySpec;
}

function groundPairedMeshesAtZero(
  bodyParts: readonly RawMesh[],
  glowParts: readonly RawMesh[]
): { readonly body: readonly RawMesh[]; readonly glow: readonly RawMesh[] } {
  let minY = Number.POSITIVE_INFINITY;
  for (const m of bodyParts) {
    for (let i = 1; i < m.positions.length; i += 3) {
      if (m.positions[i]! < minY) minY = m.positions[i]!;
    }
  }
  for (const m of glowParts) {
    for (let i = 1; i < m.positions.length; i += 3) {
      if (m.positions[i]! < minY) minY = m.positions[i]!;
    }
  }
  const dy = Number.isFinite(minY) ? -minY : 0;
  if (Math.abs(dy) < 1e-7) return { body: bodyParts, glow: glowParts };
  return {
    body: bodyParts.map((m) => transformMesh(m, { pos: [0, dy, 0] })),
    glow: glowParts.map((m) => transformMesh(m, { pos: [0, dy, 0] }))
  };
}

function buildAeroCleatBootMesh(toeDirZ: -1 | 1, scale = 1): { readonly upper: RawMesh; readonly sole: RawMesh; readonly glow: RawMesh } {
  const zSign = toeDirZ;
  // Multi-station sculpted sprint cleat wedge (min local y = 0)
  const bootStations: readonly [number, number, number, number][] = [
    [0.0, 0.044 * scale, 0.088 * scale, 0.014 * zSign * scale],
    [0.022 * scale, 0.046 * scale, 0.092 * scale, 0.018 * zSign * scale],
    [0.052 * scale, 0.041 * scale, 0.068 * scale, 0.002 * zSign * scale],
    [0.082 * scale, 0.036 * scale, 0.046 * scale, -0.012 * zSign * scale]
  ];
  const rings: V3[][] = bootStations.map(([by, rx, rz, cz]) => {
    const pts: V3[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      const sinA = Math.sin(a);
      // Elongated aerodynamic toe prow in `zSign` direction
      const zStretch = sinA * zSign > 0 ? 1.24 : 0.78;
      pts.push([Math.cos(a) * rx, by, cz + sinA * rz * zStretch]);
    }
    return pts;
  });
  const upper = subdivideSmoothMesh(loftSectionsMesh(rings, true, true), 1, 0.28);
  const sole = transformMesh(bevelBoxMesh(0.084 * scale, 0.018 * scale, 0.168 * scale, 0.005 * scale), {
    pos: [0, 0.009 * scale, 0.018 * zSign * scale]
  });
  // Swept heel aero-fin + glowing cleat energy rail
  const heelWingPoly: V2[] = [
    [0, 0.016 * scale],
    [-0.058 * zSign * scale, 0.078 * scale],
    [-0.034 * zSign * scale, 0.086 * scale],
    [0.012 * zSign * scale, 0.032 * scale]
  ];
  const heelFin = transformMesh(extrudePolygonMesh(heelWingPoly, 0.014 * scale, 0.003 * scale, true), {
    pos: [0, 0, -0.046 * zSign * scale],
    rot: [0, Math.PI * 0.5, 0]
  });
  const soleGlow = transformMesh(bevelBoxMesh(0.088 * scale, 0.012 * scale, 0.146 * scale, 0.004 * scale), {
    pos: [0, 0.016 * scale, 0.016 * zSign * scale]
  });
  return {
    upper,
    sole,
    glow: mergeRawListLocal([heelFin, soleGlow])
  };
}

function mergeRawListLocal(parts: readonly RawMesh[]): RawMesh {
  const m = concatRawMeshes(parts);
  const colors: number[] = [];
  let hasColor = false;
  for (const p of parts) {
    const vCount = Math.floor(p.positions.length / 3);
    if (p.colors && p.colors.length >= vCount * 4) hasColor = true;
  }
  if (hasColor) {
    for (const p of parts) {
      const vCount = Math.floor(p.positions.length / 3);
      if (p.colors && p.colors.length >= vCount * 4) {
        for (let i = 0; i < vCount * 4; i += 1) colors.push(p.colors[i]!);
      } else {
        for (let i = 0; i < vCount * 4; i += 1) colors.push(1);
      }
    }
  }
  return hasColor ? { ...m, colors } : m;
}

/**
 * Sculpted Stylized Cyber-Sprinter (`captain = false` for Squad Runners, `captain = true` for
 * Giant / Captain Variants). Grounded strictly at `minY = 0`, facing `-Z` (forward down the highway):
 * - Sleek aerodynamic visored speed-helmet (`sculptStylizedHeadMesh` deformed into a swept tear-drop
 *   tail-cone + wraparound glowing cyan/gold visor slit + twin swept ear-fins + dorsal aero crest)
 * - V-tapered armored neon track-suit torso (`loftSectionsMesh` + `subdivideSmoothMesh`) with sculpted
 *   pectoral/scapula armor, layered deltoid pauldrons, glowing chest V-chevron & segmented dorsal spine strip
 * - Dynamic mid-stride `sculptAnatomicalLimbMesh` arms & tapered athletic sprint legs (`bakeMeshCavityAO(..., 0.24)`)
 * - Winged glowing aero-cleats (`minY = 0`).
 */
function buildCyberSprinterAssembly(captain: boolean): CyberRunnerAssembly {
  const s: 1 | -1 = captain ? -1 : 1;
  const hScale = captain ? 1.16 : 1.0;
  const suitDark = captain ? "#19133b" : "#12102c";
  const armorPrimary = captain ? "#fcf7ea" : "#1fe4ff";
  const armorSecondary = captain ? "#ffd046" : "#6df4ff";
  const trimAlloy = captain ? "#ffe07d" : "#9bd4f0";
  const glowHex = captain ? "#ffd84d" : "#3ef2ff";

  const bodyParts: RawMesh[] = [];
  const glowParts: RawMesh[] = [];

  // 1. Sleek Visored Speed-Helmet (swept forward jaw prow `-Z` + elongated rear aero tail-cone `+Z`)
  const baseHead = sculptStylizedHeadMesh(0.098 * hScale, {
    jawTaper: 0.32,
    cheekFullness: 0.08,
    browRidge: 0.12,
    noseBridge: 0.14,
    subdivisions: 2
  });
  // `sculptStylizedHeadMesh` faces `+Z`; rotate `Math.PI` around Y so face/visor points `-Z` and stretch tear-drop tail `+Z`
  const sweptHelmet = deformMesh(
    transformMesh(baseHead, { rot: [0.12, Math.PI, 0] }),
    ([x, y, z]) => {
      const rearFactor = Math.max(0, z / (0.1 * hScale));
      const tailCone = 1 - Math.min(0.55, rearFactor * 0.34);
      const zSwept = z > 0 ? z * 1.48 + rearFactor * 0.028 * hScale : z * 1.12;
      return [x * tailCone * 0.94, y * 0.94 + rearFactor * 0.016 * hScale, zSwept];
    }
  );
  const headY = 0.805 * hScale;
  const headZ = -0.035 * hScale;
  bodyParts.push(paintMeshColors(transformMesh(sweptHelmet, { pos: [0, headY, headZ] }), armorPrimary));

  // Helmet two-tone obsidian crown stripe + chin guard
  const chinGuard = transformMesh(
    bevelBoxMesh(0.112 * hScale, 0.048 * hScale, 0.118 * hScale, 0.014 * hScale),
    { pos: [0, headY - 0.052 * hScale, headZ - 0.045 * hScale], rot: [0.22, 0, 0] }
  );
  bodyParts.push(paintMeshColors(chinGuard, suitDark));

  // Wraparound glowing visor slit (wraps front `-Z` and both temples `±X` so 3/4 & chase angles catch the glow!)
  const visorPoly: V2[] = [
    [-0.096 * hScale, -0.055 * hScale],
    [0.0, -0.126 * hScale],
    [0.096 * hScale, -0.055 * hScale],
    [0.102 * hScale, 0.032 * hScale],
    [0.078 * hScale, 0.036 * hScale],
    [0.0, -0.096 * hScale],
    [-0.078 * hScale, 0.036 * hScale],
    [-0.102 * hScale, 0.032 * hScale]
  ];
  const visorBand = transformMesh(extrudePolygonMesh(visorPoly, 0.034 * hScale, 0.006 * hScale, true), {
    pos: [0, headY - 0.004 * hScale, headZ],
    rot: [Math.PI * 0.5 + 0.12, 0, 0]
  });
  glowParts.push(paintMeshColors(visorBand, glowHex));

  // Swept lateral ear-fins (`extrudePolygonMesh`) + dorsal aero crest
  const earFinPoly: V2[] = [
    [0, -0.018 * hScale],
    [0.135 * hScale, 0.058 * hScale],
    [0.165 * hScale, 0.092 * hScale],
    [0.048 * hScale, 0.042 * hScale]
  ];
  for (const side of [-1, 1] as const) {
    const fin = transformMesh(extrudePolygonMesh(earFinPoly, 0.014 * hScale, 0.003 * hScale, true), {
      pos: [side * 0.086 * hScale, headY + 0.004 * hScale, headZ + 0.01 * hScale],
      rot: [0.14, -side * 1.24, side * 0.28]
    });
    bodyParts.push(paintMeshColors(fin, armorSecondary));
    const finTip = transformMesh(bevelBoxMesh(0.012 * hScale, 0.016 * hScale, 0.086 * hScale, 0.003 * hScale), {
      pos: [side * 0.118 * hScale, headY + 0.048 * hScale, headZ + 0.078 * hScale],
      rot: [0.36, side * 0.26, side * 0.24]
    });
    glowParts.push(paintMeshColors(finTip, glowHex));
  }

  const crestPoly: V2[] = captain
    ? [
        [-0.07 * hScale, 0.04 * hScale],
        [0.08 * hScale, 0.125 * hScale],
        [0.21 * hScale, 0.148 * hScale],
        [0.14 * hScale, 0.025 * hScale]
      ]
    : [
        [-0.05 * hScale, 0.042 * hScale],
        [0.06 * hScale, 0.096 * hScale],
        [0.16 * hScale, 0.102 * hScale],
        [0.11 * hScale, 0.024 * hScale]
      ];
  bodyParts.push(
    paintMeshColors(
      transformMesh(extrudePolygonMesh(crestPoly, 0.018 * hScale, 0.004 * hScale, true), {
        pos: [0, headY + 0.032 * hScale, headZ],
        rot: [0, -Math.PI * 0.5, 0]
      }),
      armorSecondary
    )
  );

  // 2. V-Tapered Armored Neon Track-Suit Torso (multi-station loft + light smooth pass)
  // Stations: [y, rx, rz, zOffset] — narrow athletic waist flaring sharply to broad armored chest/lats!
  const torsoStations: readonly [number, number, number, number][] = [
    [0.39 * hScale, 0.098 * hScale, 0.068 * hScale, 0.018 * hScale],  // contoured hip/pelvis
    [0.455 * hScale, 0.074 * hScale, 0.056 * hScale, 0.008 * hScale], // narrow athletic V-waist
    [0.535 * hScale, 0.118 * hScale, 0.082 * hScale, -0.008 * hScale], // lower ribcage armor
    [0.625 * hScale, 0.162 * hScale, 0.102 * hScale, -0.022 * hScale], // broad pectoral & scapula chestplate
    [0.695 * hScale, 0.132 * hScale, 0.078 * hScale, -0.026 * hScale], // trapezius shoulder yoke
    [0.745 * hScale, 0.054 * hScale, 0.048 * hScale, -0.028 * hScale]  // armored neck collar
  ];
  const torsoRings: V3[][] = torsoStations.map(([ty, rx, rz, cz]) => {
    const ring: V3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      // Angular pectoral keel in front (`-Z`) & twin scapula ridges in back (`+Z`)
      const keel = 1 + 0.08 * Math.cos(2 * a) - 0.05 * Math.cos(4 * a);
      ring.push([cosA * rx * keel, ty, cz + sinA * rz * keel]);
    }
    return ring;
  });
  const undersuitTorso = subdivideSmoothMesh(loftSectionsMesh(torsoRings, true, true), 1, 0.28);
  bodyParts.push(paintMeshColors(undersuitTorso, suitDark));

  // Sculpted front-and-back armored cuirass shell over upper chest + hip utility belt
  const cuirassStations: readonly [number, number, number, number][] = [
    [0.52 * hScale, 0.122 * hScale, 0.088 * hScale, -0.01 * hScale],
    [0.62 * hScale, 0.172 * hScale, 0.109 * hScale, -0.022 * hScale],
    [0.69 * hScale, 0.142 * hScale, 0.084 * hScale, -0.025 * hScale]
  ];
  const cuirassRings: V3[][] = cuirassStations.map(([ty, rx, rz, cz]) => {
    const ring: V3[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      ring.push([Math.cos(a) * rx, ty, cz + Math.sin(a) * rz]);
    }
    return ring;
  });
  bodyParts.push(
    paintMeshColors(subdivideSmoothMesh(loftSectionsMesh(cuirassRings, true, true), 1, 0.24), armorPrimary)
  );
  bodyParts.push(
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.195 * hScale, 0.042 * hScale, 0.138 * hScale, 0.012 * hScale), {
        pos: [0, 0.425 * hScale, 0.012 * hScale],
        rot: [0.1, 0, 0]
      }),
      trimAlloy
    )
  );

  // Glowing Chest V-Chevron (`-Z` front) + Glowing Segmented Dorsal Spine Strip (`+Z` back facing chase camera!)
  const chevronPoly: V2[] = [
    [-0.105 * hScale, 0.042 * hScale],
    [0, -0.038 * hScale],
    [0.105 * hScale, 0.042 * hScale],
    [0.082 * hScale, 0.068 * hScale],
    [0, 0.002 * hScale],
    [-0.082 * hScale, 0.068 * hScale]
  ];
  glowParts.push(
    paintMeshColors(
      transformMesh(extrudePolygonMesh(chevronPoly, 0.022 * hScale, 0.004 * hScale, true), {
        pos: [0, 0.605 * hScale, -0.126 * hScale],
        rot: [0.16, 0, 0]
      }),
      glowHex
    )
  );
  // Dorsal spine capacitor nodes + twin speed-fins (captain gets swept Valkyrie booster wings!)
  for (let seg = 0; seg < 4; seg += 1) {
    const t = seg / 3;
    const sy = (0.48 + t * 0.19) * hScale;
    const sz = (0.074 - t * 0.012) * hScale;
    glowParts.push(
      paintMeshColors(
        transformMesh(bevelBoxMesh((0.036 + t * 0.014) * hScale, 0.034 * hScale, 0.026 * hScale, 0.006 * hScale), {
          pos: [0, sy, sz],
          rot: [-0.14, 0, 0]
        }),
        glowHex
      )
    );
  }
  if (captain) {
    const wingPoly: V2[] = [
      [0, -0.04 * hScale],
      [0.16 * hScale, 0.08 * hScale],
      [0.21 * hScale, 0.16 * hScale],
      [0.05 * hScale, 0.07 * hScale]
    ];
    for (const side of [-1, 1] as const) {
      const wing = transformMesh(extrudePolygonMesh(wingPoly, 0.018 * hScale, 0.004 * hScale, true), {
        pos: [side * 0.075 * hScale, 0.61 * hScale, 0.072 * hScale],
        rot: [-0.22, -side * 0.72, side * 0.25]
      });
      bodyParts.push(paintMeshColors(wing, armorSecondary));
      glowParts.push(
        paintMeshColors(
          transformMesh(bevelBoxMesh(0.014 * hScale, 0.13 * hScale, 0.022 * hScale, 0.004 * hScale), {
            pos: [side * 0.185 * hScale, 0.69 * hScale, 0.125 * hScale],
            rot: [-0.25, 0, -side * 0.52]
          }),
          glowHex
        )
      );
    }
  }

  // 3. Sculpted Deltoid Pauldrons + Anatomical Sprint Arms (`sculptAnatomicalLimbMesh`)
  for (const side of [-1, 1] as const) {
    const armFwd = side * s; // one arm pumps forward/up, opposite drives back
    const shX = side * 0.175 * hScale;
    const shY = 0.655 * hScale;
    const shZ = -0.018 * hScale;
    // Layered aerodynamic deltoid pauldron
    const pauldron = transformMesh(
      extrudePolygonMesh(
        [
          [-0.048 * hScale, -0.032 * hScale],
          [0.052 * hScale, -0.022 * hScale],
          [0.064 * hScale, 0.038 * hScale],
          [-0.025 * hScale, 0.052 * hScale]
        ],
        0.098 * hScale,
        0.014 * hScale,
        true
      ),
      { pos: [shX, shY + 0.016 * hScale, shZ], rot: [0.12, 0, -side * 0.42] }
    );
    bodyParts.push(paintMeshColors(pauldron, armorSecondary));

    const elbowPos: V3 =
      armFwd > 0
        ? [side * 0.205 * hScale, 0.525 * hScale, 0.055 * hScale]
        : [side * 0.202 * hScale, 0.535 * hScale, -0.055 * hScale];
    const wristPos: V3 =
      armFwd > 0
        ? [side * 0.155 * hScale, 0.585 * hScale, -0.155 * hScale]
        : [side * 0.185 * hScale, 0.445 * hScale, 0.145 * hScale];
    const midUpper: V3 = [
      (shX + elbowPos[0]) * 0.5,
      (shY + elbowPos[1]) * 0.5,
      (shZ + elbowPos[2]) * 0.5
    ];
    const midFore: V3 = [
      (elbowPos[0] + wristPos[0]) * 0.5,
      (elbowPos[1] + wristPos[1]) * 0.5,
      (elbowPos[2] + wristPos[2]) * 0.5
    ];

    const upperArm = sculptAnatomicalLimbMesh(
      [
        { pos: [shX, shY, shZ], rx: 0.046 * hScale, rz: 0.052 * hScale },
        { pos: midUpper, rx: 0.042 * hScale, rz: 0.048 * hScale },
        { pos: elbowPos, rx: 0.036 * hScale, rz: 0.038 * hScale }
      ],
      { ringPoints: 12, capEnds: true, muscleBiasZ: -0.006 * hScale }
    );
    bodyParts.push(paintMeshColors(upperArm, suitDark));

    const forearmGauntlet = sculptHumanoidLimbMesh(
      [
        [elbowPos[0], elbowPos[1], elbowPos[2], 0.039 * hScale],
        [midFore[0], midFore[1], midFore[2], 0.046 * hScale],
        [wristPos[0], wristPos[1], wristPos[2], 0.034 * hScale]
      ],
      10,
      0.18
    );
    bodyParts.push(paintMeshColors(forearmGauntlet, armorPrimary));
    bodyParts.push(
      paintMeshColors(
        transformMesh(icosphereFacetMesh(0.038 * hScale, 1, 0.004, 19 + side), { pos: wristPos }),
        suitDark
      )
    );
  }

  // 4. Tapered Athletic Sprint Legs (`sculptAnatomicalLimbMesh`) + Glowing Aero-Cleats (`minY = 0`)
  for (const side of [-1, 1] as const) {
    const legFwd = -side * s; // contra-lateral sprint gait vs arms
    const hipPos: V3 = [side * 0.082 * hScale, 0.405 * hScale, 0.012 * hScale];
    const kneePos: V3 =
      legFwd > 0
        ? [side * 0.088 * hScale, 0.255 * hScale, -0.105 * hScale]
        : [side * 0.088 * hScale, 0.235 * hScale, 0.085 * hScale];
    const anklePos: V3 =
      legFwd > 0
        ? [side * 0.086 * hScale, 0.072 * hScale, -0.055 * hScale]
        : [side * 0.086 * hScale, 0.105 * hScale, 0.195 * hScale];

    const midThigh: V3 = [
      (hipPos[0] + kneePos[0]) * 0.5,
      (hipPos[1] + kneePos[1]) * 0.5,
      (hipPos[2] + kneePos[2]) * 0.5 - 0.01 * hScale
    ];
    const midCalf: V3 = [
      (kneePos[0] + anklePos[0]) * 0.5,
      (kneePos[1] + anklePos[1]) * 0.5,
      (kneePos[2] + anklePos[2]) * 0.5 + 0.014 * hScale
    ];

    const thigh = sculptAnatomicalLimbMesh(
      [
        { pos: hipPos, rx: 0.058 * hScale, rz: 0.068 * hScale },
        { pos: midThigh, rx: 0.054 * hScale, rz: 0.068 * hScale },
        { pos: kneePos, rx: 0.043 * hScale, rz: 0.046 * hScale }
      ],
      { ringPoints: 12, capEnds: true, muscleBiasZ: -0.01 * hScale, peakT: 0.42 }
    );
    bodyParts.push(paintMeshColors(thigh, suitDark));

    // Armored knee guard + tapered shin greave
    bodyParts.push(
      paintMeshColors(
        transformMesh(bevelBoxMesh(0.068 * hScale, 0.062 * hScale, 0.058 * hScale, 0.014 * hScale), {
          pos: [kneePos[0], kneePos[1] + 0.008 * hScale, kneePos[2] - 0.022 * hScale],
          rot: [0.2, 0, 0]
        }),
        trimAlloy
      )
    );

    const shinGreave = sculptAnatomicalLimbMesh(
      [
        { pos: kneePos, rx: 0.043 * hScale, rz: 0.046 * hScale },
        { pos: midCalf, rx: 0.046 * hScale, rz: 0.056 * hScale },
        { pos: anklePos, rx: 0.033 * hScale, rz: 0.036 * hScale }
      ],
      { ringPoints: 12, capEnds: true, muscleBiasZ: 0.012 * hScale, peakT: 0.36 }
    );
    bodyParts.push(paintMeshColors(shinGreave, armorPrimary));

    const boot = buildAeroCleatBootMesh(-1, hScale);
    const bootPitch = legFwd > 0 ? 0.0 : -0.32;
    const bootBaseY = legFwd > 0 ? 0.0 : 0.042 * hScale;
    const bootZ = anklePos[2] - 0.02 * hScale;
    bodyParts.push(
      paintMeshColors(transformMesh(boot.upper, { pos: [anklePos[0], bootBaseY, bootZ], rot: [bootPitch, 0, 0] }), armorSecondary),
      paintMeshColors(transformMesh(boot.sole, { pos: [anklePos[0], bootBaseY, bootZ], rot: [bootPitch, 0, 0] }), "#0d0a1f")
    );
    glowParts.push(
      paintMeshColors(transformMesh(boot.glow, { pos: [anklePos[0], bootBaseY, bootZ], rot: [bootPitch, 0, 0] }), glowHex)
    );
  }

  const grounded = groundPairedMeshesAtZero(bodyParts, glowParts);
  const bakedBody = bakeMeshCavityAO(mergeRawListLocal(grounded.body), 0.24);
  const mergedGlow = mergeRawListLocal(grounded.glow);
  void sculptHumanoidLimbMesh;
  return {
    bodySpec: mergeRawMeshes([bakedBody]),
    glowSpec: mergeRawMeshes([mergedGlow])
  };
}

/**
 * Menacing Crimson-and-Obsidian Heavy Riot Guard (`minY = 0`, facing `+Z` directly toward oncoming player):
 * - Horned & visored obsidian-crimson heavy riot helm (`sculptStylizedHeadMesh` + swept `tubeSweepMesh` horns + glowing crimson visor slit)
 * - Broad heavy riot cuirass (`loftSectionsMesh` + `subdivideSmoothMesh`), layered shoulder pauldrons, glowing crimson hazard chevron
 * - Heavy `sculptAnatomicalLimbMesh` arms wielding an angled octagonal riot shield + crimson plasma halberd
 * - Planted wide-stance armored shin greaves & heavy cleats (`minY = 0`, `bakeMeshCavityAO(..., 0.24)`).
 */
function buildRivalRiotGuardAssembly(): CyberRunnerAssembly {
  const obsidianIron = "#14101f";
  const crimsonArmor = "#cf193e";
  const darkGunmetal = "#2f2842";
  const crimsonGlow = "#ff2652";

  const bodyParts: RawMesh[] = [];
  const glowParts: RawMesh[] = [];

  // 1. Horned & Visored Heavy Riot Helm (faces `+Z` toward oncoming player & chase camera!)
  const rawHead = sculptStylizedHeadMesh(0.118, {
    jawTaper: 0.38,
    cheekFullness: 0.08,
    browRidge: 0.16,
    noseBridge: 0.12,
    subdivisions: 2
  });
  const heavyHelm = deformMesh(rawHead, ([x, y, z]) => [x * 1.08, y * 0.96, z * 1.14]);
  const headY = 1.02;
  bodyParts.push(paintMeshColors(transformMesh(heavyHelm, { pos: [0, headY, 0.015] }), obsidianIron));

  // Heavycrimson faceplate crest + jaw respirator grill
  bodyParts.push(
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.156, 0.068, 0.135, 0.016), { pos: [0, headY - 0.056, 0.062], rot: [-0.14, 0, 0] }),
      crimsonArmor
    ),
    paintMeshColors(
      transformMesh(
        extrudePolygonMesh(
          [
            [-0.04, 0.05],
            [0.04, 0.14],
            [0.15, 0.15],
            [0.11, 0.03]
          ],
          0.026,
          0.005,
          true
        ),
        { pos: [0, headY + 0.04, 0], rot: [0, Math.PI * 0.5, 0] }
      ),
      crimsonArmor
    )
  );

  // Menacing swept bull/oni horns (`tubeSweepMesh`) curving outward, forward & upward
  for (const side of [-1, 1] as const) {
    const hornPts = catmullRomSpline3(
      [
        [side * 0.092, headY + 0.035, 0.01],
        [side * 0.185, headY + 0.088, 0.045],
        [side * 0.228, headY + 0.182, 0.105],
        [side * 0.195, headY + 0.255, 0.145]
      ],
      4,
      false
    );
    const hornSpine: V4[] = hornPts.map((p, idx) => {
      const t = idx / Math.max(1, hornPts.length - 1);
      return [p[0], p[1], p[2], 0.034 * (1 - t * 0.82) + 0.004];
    });
    bodyParts.push(paintMeshColors(tubeSweepMesh(hornSpine, 8, true), crimsonArmor));
  }

  // Glowing crimson T-slit riot visor (`+Z` front)
  glowParts.push(
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.172, 0.032, 0.042, 0.006), { pos: [0, headY + 0.006, 0.126] }),
      crimsonGlow
    ),
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.03, 0.068, 0.038, 0.005), { pos: [0, headY - 0.024, 0.128] }),
      crimsonGlow
    )
  );

  // 2. Heavy Riot Cuirass & Layered Shoulder Pauldrons (`loftSectionsMesh` + `subdivideSmoothMesh`)
  const riotTorsoStations: readonly [number, number, number, number][] = [
    [0.48, 0.138, 0.096, 0.0],
    [0.57, 0.118, 0.088, 0.004],
    [0.68, 0.178, 0.124, 0.012],
    [0.80, 0.225, 0.142, 0.018],
    [0.89, 0.175, 0.108, 0.012],
    [0.94, 0.082, 0.072, 0.008]
  ];
  const riotRings: V3[][] = riotTorsoStations.map(([ty, rx, rz, cz]) => {
    const ring: V3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const plateFacet = 1 + 0.07 * Math.cos(4 * a);
      ring.push([Math.cos(a) * rx * plateFacet, ty, cz + Math.sin(a) * rz * plateFacet]);
    }
    return ring;
  });
  bodyParts.push(
    paintMeshColors(subdivideSmoothMesh(loftSectionsMesh(riotRings, true, true), 1, 0.24), obsidianIron),
    // Crimson armored breastplate & tassets
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.32, 0.22, 0.11, 0.026), { pos: [0, 0.76, 0.095], rot: [-0.08, 0, 0] }),
      crimsonArmor
    ),
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.28, 0.068, 0.19, 0.016), { pos: [0, 0.51, 0.01] }),
      darkGunmetal
    )
  );

  // Glowing crimson hazard chevron on chest + dorsal reactor core
  const hazardV: V2[] = [
    [-0.13, 0.055],
    [0, -0.048],
    [0.13, 0.055],
    [0.102, 0.086],
    [0, -0.004],
    [-0.102, 0.086]
  ];
  glowParts.push(
    paintMeshColors(
      transformMesh(extrudePolygonMesh(hazardV, 0.024, 0.004, true), { pos: [0, 0.76, 0.152], rot: [-0.08, 0, 0] }),
      crimsonGlow
    ),
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.064, 0.22, 0.036, 0.008), { pos: [0, 0.74, -0.132] }),
      crimsonGlow
    )
  );

  // 3. Heavy Riot Arms (`sculptAnatomicalLimbMesh`), Octagonal Riot Shield & Crimson Plasma Halberd
  for (const side of [-1, 1] as const) {
    const shPos: V3 = [side * 0.245, 0.82, 0.01];
    // Spiked heavy riot pauldron
    bodyParts.push(
      paintMeshColors(
        transformMesh(bevelBoxMesh(0.145, 0.115, 0.165, 0.026), {
          pos: [side * 0.255, 0.855, 0.015],
          rot: [0, 0, -side * 0.28]
        }),
        crimsonArmor
      ),
      paintMeshColors(
        transformMesh(bevelBoxMesh(0.115, 0.065, 0.145, 0.016), {
          pos: [side * 0.282, 0.795, 0.015],
          rot: [0, 0, -side * 0.36]
        }),
        obsidianIron
      )
    );

    const elbowPos: V3 = side < 0 ? [-0.285, 0.65, 0.10] : [0.295, 0.67, 0.08];
    const handPos: V3 = side < 0 ? [-0.215, 0.62, 0.25] : [0.275, 0.68, 0.22];
    bodyParts.push(
      paintMeshColors(
        sculptHumanoidLimbMesh(
          [
            [shPos[0], shPos[1], shPos[2], 0.064],
            [elbowPos[0], elbowPos[1], elbowPos[2], 0.054],
            [handPos[0], handPos[1], handPos[2], 0.05]
          ],
          10,
          0.18
        ),
        darkGunmetal
      )
    );
  }

  // Left-arm Heavy Octagonal Riot Shield (`x = -0.22, z = +0.30`)
  const shieldPoly: V2[] = [
    [-0.18, -0.34],
    [0.18, -0.34],
    [0.24, -0.22],
    [0.24, 0.24],
    [0.16, 0.34],
    [-0.16, 0.34],
    [-0.24, 0.24],
    [-0.24, -0.22]
  ];
  bodyParts.push(
    paintMeshColors(
      transformMesh(extrudePolygonMesh(shieldPoly, 0.046, 0.012, true), {
        pos: [-0.215, 0.56, 0.31],
        rot: [-0.08, 0.26, 0.04]
      }),
      obsidianIron
    ),
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.34, 0.46, 0.056, 0.012), {
        pos: [-0.215, 0.56, 0.312],
        rot: [-0.08, 0.26, 0.04]
      }),
      crimsonArmor
    )
  );
  glowParts.push(
    paintMeshColors(
      transformMesh(bevelBoxMesh(0.28, 0.045, 0.068, 0.008), {
        pos: [-0.215, 0.69, 0.318],
        rot: [-0.08, 0.26, 0.04]
      }),
      crimsonGlow
    )
  );

  // Right-arm Crimson Plasma Halberd (`x = +0.28`, planted at `y = 0.02` up to `y = 1.38`)
  bodyParts.push(
    paintMeshColors(
      tubeSweepMesh(
        [
          [0.285, 0.02, 0.19, 0.022],
          [0.278, 0.68, 0.22, 0.024],
          [0.268, 1.18, 0.25, 0.026]
        ],
        8,
        true
      ),
      darkGunmetal
    )
  );
  const halberdBlade: V2[] = [
    [0, -0.06],
    [0.15, 0.04],
    [0.18, 0.24],
    [0.03, 0.32],
    [-0.02, 0.18]
  ];
  glowParts.push(
    paintMeshColors(
      transformMesh(extrudePolygonMesh(halberdBlade, 0.022, 0.005, true), {
        pos: [0.268, 1.12, 0.25],
        rot: [0, -0.35, 0]
      }),
      crimsonGlow
    )
  );

  // 4. Planted Wide-Stance Heavy Riot Legs & Cleats (`minY = 0`)
  for (const side of [-1, 1] as const) {
    const hip: V3 = [side * 0.118, 0.49, 0.0];
    const knee: V3 = [side * 0.145, 0.285, 0.045];
    const ankle: V3 = [side * 0.158, 0.082, 0.015];
    bodyParts.push(
      paintMeshColors(
        sculptAnatomicalLimbMesh(
          [
            { pos: hip, rx: 0.072, rz: 0.084 },
            { pos: [(hip[0] + knee[0]) * 0.5, (hip[1] + knee[1]) * 0.5, 0.025], rx: 0.068, rz: 0.082 },
            { pos: knee, rx: 0.056, rz: 0.06 },
            { pos: [(knee[0] + ankle[0]) * 0.5, (knee[1] + ankle[1]) * 0.5, 0.032], rx: 0.062, rz: 0.072 },
            { pos: ankle, rx: 0.046, rz: 0.05 }
          ],
          { ringPoints: 12, capEnds: true, muscleBiasZ: 0.01, peakT: 0.38 }
        ),
        obsidianIron
      ),
      // Heavy crimson shin & knee armor plate
      paintMeshColors(
        transformMesh(bevelBoxMesh(0.095, 0.21, 0.078, 0.018), {
          pos: [side * 0.152, 0.215, 0.062],
          rot: [-0.08, 0, 0]
        }),
        crimsonArmor
      )
    );
    const boot = buildAeroCleatBootMesh(1, 1.18);
    bodyParts.push(
      paintMeshColors(transformMesh(boot.upper, { pos: [ankle[0], 0, 0.025] }), darkGunmetal),
      paintMeshColors(transformMesh(boot.sole, { pos: [ankle[0], 0, 0.025] }), obsidianIron)
    );
    glowParts.push(
      paintMeshColors(transformMesh(boot.glow, { pos: [ankle[0], 0, 0.025] }), crimsonGlow)
    );
  }

  const grounded = groundPairedMeshesAtZero(bodyParts, glowParts);
  const bakedBody = bakeMeshCavityAO(mergeRawListLocal(grounded.body), 0.24);
  const mergedGlow = mergeRawListLocal(grounded.glow);
  return {
    bodySpec: mergeRawMeshes([bakedBody]),
    glowSpec: mergeRawMeshes([mergedGlow])
  };
}

function cachedLacquerSprinter(): CyberRunnerAssembly {
  return memoizeGeometry("number-surge:cyber-sprinter-lacquer:v3", () =>
    buildCyberSprinterAssembly(false)
  );
}

function cachedCeramicCaptain(): CyberRunnerAssembly {
  return memoizeGeometry("number-surge:cyber-sprinter-captain:v3", () =>
    buildCyberSprinterAssembly(true)
  );
}

function cachedRivalRiotGuard(): CyberRunnerAssembly {
  return memoizeGeometry("number-surge:rival-riot-guard:v1", () =>
    buildRivalRiotGuardAssembly()
  );
}

/** Sculpted electric-cyan & obsidian Cyber-Sprinter squad runner (`crowd-lacquer`, `minY = 0`). */
export function buildLacquerEscortOrbSpec(): AuraCustomGeometrySpec {
  return cachedLacquerSprinter().bodySpec;
}

/** Glowing cyan visor slit, chest V-chevron, spine strip & aero-cleat rails for `crowd-lacquer`. */
export function buildLacquerEscortGlowSpec(): AuraCustomGeometrySpec {
  return cachedLacquerSprinter().glowSpec;
}

/** Sculpted pearl-ivory & solar-gold Giant / Captain Cyber-Sprinter (`crowd-ceramic`, `minY = 0`). */
export function buildCeramicEscortOrbSpec(): AuraCustomGeometrySpec {
  return cachedCeramicCaptain().bodySpec;
}

/** Glowing solar-gold visor slit, Valkyrie wing tips, chest chevron & cleats for `crowd-ceramic`. */
export function buildCeramicEscortGlowSpec(): AuraCustomGeometrySpec {
  return cachedCeramicCaptain().glowSpec;
}

/** Menacing crimson-and-obsidian Heavy Riot Guard sentinel (`boss-guards`, `minY = 0`). */
export function buildRivalRiotGuardSpec(): AuraCustomGeometrySpec {
  return cachedRivalRiotGuard().bodySpec;
}

/** Glowing crimson visor slit, hazard chevron, riot-shield slit & plasma halberd for `boss-guards`. */
export function buildRivalRiotGuardGlowSpec(): AuraCustomGeometrySpec {
  return cachedRivalRiotGuard().glowSpec;
}

function starPolygonExtrude(opts: {
  readonly points: number;
  readonly outerRadius: number;
  readonly innerRadius: number;
  readonly depth: number;
  readonly bevel: number;
}): RawMesh {
  const poly: V2[] = [];
  const total = opts.points * 2;
  for (let i = 0; i < total; i += 1) {
    const a = (i / total) * Math.PI * 2;
    const rad = i % 2 === 0 ? opts.outerRadius : opts.innerRadius;
    poly.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return extrudePolygonMesh(poly, opts.depth, opts.bevel, true);
}

/** Crown-cut 8-point star crystal medallion (`r = 0.38`) with bevelled gyro bezel for `powerups`. */
export function powerupMedallionMeshData(): MutableRawMesh {
  const starGem = starPolygonExtrude({
    points: 8,
    outerRadius: 0.36,
    innerRadius: 0.225,
    depth: 0.16,
    bevel: 0.042
  });
  const bezelProfile: V2[] = [
    [0.25, -0.058],
    [0.39, -0.038],
    [0.415, 0],
    [0.39, 0.038],
    [0.25, 0.058]
  ];
  const bezel = transformMesh(latheMesh(bezelProfile, 18, false), { rot: [Math.PI * 0.5, 0, 0] });
  return concatRawMeshes([starGem, bezel]);
}

// ---------------------------------------------------------------------------
// 2. Sculpted Holographic Math-Multiplier Gates & Saw/Roller Hazards
// ---------------------------------------------------------------------------

/**
 * Upgraded `gate-frames` `Batch` mesh (`x in [-1.52, 1.52]`, `y in [0, 3.58]`):
 * stepped octagonal pedestals + contoured twin stanchions with lathed capacitor collars +
 * open 4-chord `latticeTrussMesh` lintel + swept `tubeSweepMesh` holo-projector arch & crest.
 */
export function highwayGateGantryFrameMeshData(): MutableRawMesh {
  const parts: RawMesh[] = [];
  const basePedestal: V2[] = [
    [0, 0],
    [0.22, 0],
    [0.2, 0.09],
    [0.14, 0.18],
    [0.12, 0.26],
    [0, 0.26]
  ];
  const emitterCollar: V2[] = [
    [0.09, -0.04],
    [0.145, -0.028],
    [0.155, 0],
    [0.145, 0.028],
    [0.09, 0.04]
  ];

  for (const side of [-1, 1] as const) {
    const sx = side * 1.38;
    parts.push(transformMesh(latheMesh(basePedestal, 8, true), { pos: [sx, 0, 0] }));
    parts.push(transformMesh(bevelBoxMesh(0.16, 3.24, 0.22, 0.034), { pos: [sx, 1.68, 0] }));
    for (const cy of [0.85, 1.72, 2.58]) {
      parts.push(transformMesh(latheMesh(emitterCollar, 10, true), { pos: [sx, cy, 0] }));
    }
    parts.push(
      transformMesh(bevelBoxMesh(0.3, 0.12, 0.24, 0.022), {
        pos: [side * 1.15, 3.04, 0],
        rot: [0, 0, side * 0.62]
      })
    );
  }

  // Open 4-chord space-frame truss lintel
  parts.push(
    transformMesh(
      latticeTrussMesh({ span: [2.94, 0.3, 0.28], bays: 6, chordRadius: 0.026, braceRadius: 0.016 }),
      { pos: [0, 3.26, 0] }
    )
  );

  // Swept catenary holo-emitter projector arch crowning the multiplier gate
  const archPts = catmullRomSpline3(
    [
      [-1.38, 3.28, 0],
      [-0.78, 3.5, 0],
      [0, 3.58, 0],
      [0.78, 3.5, 0],
      [1.38, 3.28, 0]
    ],
    4,
    false
  );
  parts.push(
    tubeSweepMesh(
      archPts.map((p): V4 => [p[0], p[1], p[2], 0.042]),
      8,
      true
    )
  );

  // Central beveled holographic keystone prism (`extrudePolygonMesh`)
  const keystone: V2[] = [
    [-0.24, 3.38],
    [0.24, 3.38],
    [0.32, 3.56],
    [0, 3.68],
    [-0.32, 3.56]
  ];
  parts.push(extrudePolygonMesh(keystone, 0.26, 0.03, true));

  return concatRawMeshes(parts);
}

/**
 * Upgraded `walls` `Batch` mesh (`7.2 x 3.6 x 0.6 m` envelope):
 * bevel-cut segmented crystal-masonry barrier with grooved lower & upper horizontal
 * crusher-roller drums (`latheMesh` + `wheelAssemblySlots` end-bearings) while keeping the
 * central `wall-label` HP readout window (`|x| <= 1.65, y in [1.25, 2.95]`) unobstructed.
 */
export function bossWallSawRollerHazardMeshData(): MutableRawMesh {
  const parts: RawMesh[] = [
    transformMesh(bevelBoxMesh(7.04, 3.48, 0.46, 0.04), { pos: [0, 1.8, 0] })
  ];

  // 3 courses of bevelled crystal-masonry blocks
  const rows = 3;
  const rowH = 3.6 / rows;
  const gap = 0.075;
  for (let r = 0; r < rows; r += 1) {
    const cy = (r + 0.5) * rowH;
    const bh = rowH - gap;
    const cols = r % 2 === 0 ? 4 : 3;
    const spanW = 7.2 / cols;
    for (let c = 0; c < cols; c += 1) {
      const cx = -3.6 + (c + 0.5) * spanW;
      parts.push(transformMesh(bevelBoxMesh(spanW - gap, bh, 0.6, 0.048), { pos: [cx, cy, 0] }));
    }
  }

  // Lower & upper knurled industrial crusher-roller drums (`latheMesh` rotated along X)
  const rollerHalf = 3.44;
  const rollerProfile: V2[] = [[0, -rollerHalf]];
  const ribs = 14;
  for (let i = 0; i <= ribs; i += 1) {
    const y = -rollerHalf + (i / ribs) * rollerHalf * 2;
    const rad = i % 2 === 0 ? 0.24 : 0.195;
    rollerProfile.push([rad, y]);
  }
  rollerProfile.push([0, rollerHalf]);
  const crusherDrum = transformMesh(latheMesh(rollerProfile, 12, false), {
    pos: [0, 0.28, 0.24],
    rot: [0, 0, Math.PI * 0.5]
  });
  parts.push(crusherDrum);

  // Flank roller bearing wheel assemblies (`wheelAssemblySlots`) at `x = ±3.52`
  for (const side of [-1, 1] as const) {
    const bearingSlots = wheelAssemblySlots({
      radius: 0.34,
      width: 0.18,
      spokes: 5,
      tireMat: 0,
      rimMat: 0,
      hubMat: 0
    });
    for (const s of bearingSlots) {
      parts.push(transformMesh(s.mesh, { pos: [side * 3.52, 0.36, 0.18] }));
    }
  }

  return concatRawMeshes(parts);
}

/**
 * Bevel-toothed 16-blade rotary hazard buzzsaw (`r = 0.86 m`) with lathed titanium arbor hub
 * for 1-draw `instances.custom` spinning flank saws on active boss walls.
 */
export function buildHazardBuzzsawSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:hazard-buzzsaw:v1", () => {
    const blade = starPolygonExtrude({
      points: 16,
      outerRadius: 0.86,
      innerRadius: 0.64,
      depth: 0.075,
      bevel: 0.018
    });
    const arborHub = transformMesh(
      latheMesh(
        [
          [0, -0.09],
          [0.32, -0.09],
          [0.36, -0.04],
          [0.36, 0.04],
          [0.32, 0.09],
          [0, 0.09]
        ],
        14,
        false
      ),
      { rot: [Math.PI * 0.5, 0, 0] }
    );
    return mergeRawMeshes([blade, arborHub]);
  });
}

// ---------------------------------------------------------------------------
// 3. Tropical Finish-Island Palms, Vaulted Treasure Chests, 3D Numerals & Dice
// ---------------------------------------------------------------------------

/** Helper: vaulted iron-banded arcade treasure chest (`~1.55 x 1.15 x 1.05 m`, grounded at `y = 0`). */
function buildVaultedTreasureChestMeshes(): RawMesh[] {
  const hull = transformMesh(bevelBoxMesh(1.52, 0.66, 1.02, 0.045), { pos: [0, 0.33, 0] });
  const lidPoly: V2[] = [
    [-0.78, 0.64],
    [0.78, 0.64],
    [0.72, 0.94],
    [0.44, 1.14],
    [0, 1.2],
    [-0.44, 1.14],
    [-0.72, 0.94]
  ];
  const vaultedLid = transformMesh(extrudePolygonMesh(lidPoly, 1.04, 0.04, true), {
    rot: [0, Math.PI * 0.5, 0]
  });
  const strapA = transformMesh(bevelBoxMesh(1.58, 0.72, 0.12, 0.018), { pos: [0, 0.36, -0.34] });
  const strapB = transformMesh(bevelBoxMesh(1.58, 0.72, 0.12, 0.018), { pos: [0, 0.36, 0.34] });
  const lockPlate = transformMesh(
    latheMesh(
      [
        [0, 0],
        [0.18, 0],
        [0.18, 0.06],
        [0.1, 0.09],
        [0, 0.09]
      ],
      10,
      true
    ),
    { pos: [0.78, 0.64, 0], rot: [0, 0, -Math.PI * 0.5] }
  );
  return [hull, vaultedLid, strapA, strapB, lockPlate];
}

/**
 * S-curved ringed tropical cyber-palm trunk + terraced island mound + vaulted treasure chest
 * at the palm base (`y in [0, 14]`, `|x| <= 2.35` strictly inside roadside safety envelope).
 */
export function buildCyberPalmTrunkSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:cyber-palm-trunk-chest:v2", () => {
    const curvePts = catmullRomSpline3(
      [
        [0, 0.35, 0],
        [0.34, 3.9, 0.16],
        [-0.2, 8.3, -0.12],
        [0.26, 12.1, 0.08],
        [0.08, 13.78, 0]
      ],
      5,
      false
    );
    const spine: V4[] = curvePts.map((p, idx) => {
      const t = idx / Math.max(1, curvePts.length - 1);
      const ringPulse = 1 + 0.09 * Math.sin(t * Math.PI * 24);
      const rad = (0.52 * (1 - t * 0.56) + 0.085) * ringPulse;
      return [p[0], p[1], p[2], rad];
    });
    const islandMound = stratifiedCliffMesh({
      radiusX: 1.85,
      radiusZ: 1.75,
      height: 0.95,
      terraces: 3,
      seed: 23
    });
    const chestParts = buildVaultedTreasureChestMeshes().map((m) =>
      transformMesh(m, { pos: [0.92, 0.52, 0.48], rot: [0, -0.45, 0], scale: 0.78 })
    );
    return mergeRawMeshes([islandMound, tubeSweepMesh(spine, 10, false), ...chestParts]);
  });
}

/** 10 arched lofted botanical palm fronds + `layeredCanopyMesh` crown + smooth coconuts (`y in [11.0, 15.0]`). */
export function buildCyberPalmCrownSpec(seed = 1): AuraCustomGeometrySpec {
  return memoizeGeometry(`number-surge:cyber-palm-crown:v2:${seed}`, () => {
    const crownTop: V3 = [0.08, 13.78, 0];
    const parts: RawMesh[] = [
      transformMesh(layeredCanopyMesh({ radius: 1.32, height: 1.1, puffs: 9, seed: seed * 11 + 3 }), {
        pos: [crownTop[0], crownTop[1] - 0.32, crownTop[2]]
      })
    ];
    const frondCount = 10;
    for (let f = 0; f < frondCount; f += 1) {
      const yaw = (f / frondCount) * Math.PI * 2 + hash01(seed * 19 + f) * 0.16;
      const tilt = f % 2 === 0 ? 0.2 : -0.05;
      const reach = 3.28 + (f % 3) * 0.22;
      const sections: V3[][] = [];
      const steps = 7;
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const r = t * reach;
        const archY = Math.sin(t * Math.PI * 0.72) * (1.16 + tilt) - t * t * 1.72;
        const halfW = Math.sin(Math.pow(t, 0.66) * Math.PI) * 0.5 + 0.025;
        const ribDrop = halfW * 0.28;
        const localRing: V3[] = [
          [r, archY + 0.05, 0],
          [r, archY - ribDrop, halfW],
          [r, archY - 0.042, 0],
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
    const smoothNut = subdivideSmoothMesh(icosphereFacetMesh(0.32, 0, 0.04, seed + 5), 1, 0.52);
    for (let c = 0; c < 4; c += 1) {
      const a = (c / 4) * Math.PI * 2 + 0.4;
      parts.push(
        transformMesh(smoothNut, {
          pos: [crownTop[0] + Math.cos(a) * 0.4, crownTop[1] - 0.3, crownTop[2] + Math.sin(a) * 0.4]
        })
      );
    }
    return mergeRawMeshes(parts);
  });
}

/**
 * Multi-beveled extruded 3D arcade `"7"` numeral monument (`y in [2.8, 18.0]`, `|x| <= 3.35`)
 * with stepped double-bevel face relief and flanked beveled 3D `"2"` / `"5"` accent badges.
 */
export function buildNumeralSevenBodySpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:numeral-seven-body:v2", () => {
    const sevenOuter: V2[] = [
      [-1.55, 2.8],
      [0.42, 2.8],
      [3.35, 15.22],
      [3.35, 18.0],
      [-3.35, 18.0],
      [-3.35, 14.32],
      [-2.02, 14.32],
      [-2.02, 15.62],
      [1.16, 15.62]
    ];
    const outerBody = extrudePolygonMesh(sevenOuter, 1.96, 0.28, true);
    const innerFace = transformMesh(extrudePolygonMesh(sevenOuter, 2.28, 0.14, true), {
      pos: [0, 0.18, 0],
      scale: [0.9, 0.96, 1]
    });
    const crossbarTrim = transformMesh(bevelBoxMesh(6.24, 0.44, 2.34, 0.07), { pos: [0, 16.92, 0] });
    const stemCollar = transformMesh(bevelBoxMesh(2.45, 0.38, 2.28, 0.06), { pos: [-0.48, 3.12, 0] });
    return mergeRawMeshes([outerBody, innerFace, crossbarTrim, stemCollar]);
  });
}

/** Stepped octagonal plinth + `archwayVoussoirSlots` portal + `latticeTrussMesh` buttresses (`y in [0, 3.1]`). */
export function buildNumeralSevenPlinthSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:numeral-seven-plinth:v2", () => {
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
  });
}

/** Centered `1.6 m` (`[-0.8, 0.8]^3`) smoothly chamfered casino die body. */
export function buildFloatingDieBodySpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:floating-die-body:v2", () =>
    mergeRawMeshes([bevelBoxMesh(1.6, 1.6, 1.6, 0.18)])
  );
}

/** 21 spherical-cap pip inlays on all 6 faces (opposite faces sum to 7). */
export function buildFloatingDiePipsSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:floating-die-pips:v2", () => {
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
  });
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
  return memoizeGeometry(`number-surge:track-curb:${segmentLen}`, () => {
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
  });
}

/**
 * Companion recessed neon light-pipe rail along the inner chamfer of the low track side-curb
 * (`|x| in [3.72, 3.77]`, `y in [0.11, 0.17]`, strictly `<= 0.35 m`).
 */
export function buildSleekTrackCurbGlowSpec(segmentLen = 3.45): AuraCustomGeometrySpec {
  return memoizeGeometry(`number-surge:track-curb-glow:${segmentLen}`, () => {
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
  });
}

// ---------------------------------------------------------------------------
// 5. Batched Skyline Skyscrapers, Under-Deck Pylons, Spires & Tropical Islands
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
  return memoizeGeometry("number-surge:highway-pylon:v2", () => {
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
  });
}

/**
 * Unit-height (`y in [0, 1]`, footprint `[-0.5, 0.5]`) Art-Deco synthwave needle spire
 * combining a stepped octagonal `latheMesh` shaft, open `latticeTrussMesh` crown cage,
 * and faceted `icosphereFacetMesh` beacon finial for 1-draw `instances.custom` batching.
 */
export function buildSynthwaveSkylineSpireSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:skyline-spire:v2", () => {
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
  });
}

/**
 * Sculpted floating Tropical Finish-Island Sanctuary (`stratifiedCliffMesh` inverted sky-island +
 * sandy lagoon deck + curved palm + vaulted treasure chest) placed beneath distant sky glyphs.
 */
export function buildTropicalTreasureIslandSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:tropical-treasure-island:v1", () => {
    const cliffKeel = transformMesh(
      stratifiedCliffMesh({ radiusX: 2.35, radiusZ: 2.2, height: 2.6, terraces: 4, seed: 37 }),
      { pos: [0, -2.55, 0], rot: [Math.PI, 0, 0] }
    );
    const sandDeck = latheMesh(
      [
        [0, -0.14],
        [2.25, -0.14],
        [2.36, 0.08],
        [2.05, 0.24],
        [0, 0.28]
      ],
      14,
      false
    );
    const miniPalmPts = catmullRomSpline3(
      [
        [-0.75, 0.2, -0.25],
        [-0.95, 1.25, -0.1],
        [-0.65, 2.25, 0.08]
      ],
      4,
      false
    );
    const miniPalmTrunk = tubeSweepMesh(
      miniPalmPts.map((p, idx): V4 => [p[0], p[1], p[2], 0.16 - idx * 0.008]),
      7,
      false
    );
    const miniCanopy = transformMesh(
      layeredCanopyMesh({ radius: 0.92, height: 0.72, puffs: 7, seed: 53 }),
      { pos: [-0.65, 2.15, 0.08] }
    );
    const chest = buildVaultedTreasureChestMeshes().map((m) =>
      transformMesh(m, { pos: [0.68, 0.22, 0.28], rot: [0, -0.5, 0], scale: 0.62 })
    );
    return mergeRawMeshes([cliffKeel, sandDeck, miniPalmTrunk, miniCanopy, ...chest]);
  });
}

/**
 * Extruded/beveled 3D holographic numeral-and-multiplier emblem (`[-1.35, 1.35]` XY, depth `0.28`)
 * combining a bevelled 3D numeral `"2"`/`"5"` crest, arithmetic cross, and octagonal holo-bezel.
 */
export function buildSkyHoloGlyphSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("number-surge:sky-holo-glyph:v2", () => {
    const plusRing: V2[] = [
      [-0.24, -1.02],
      [0.24, -1.02],
      [0.24, -0.24],
      [1.02, -0.24],
      [1.02, 0.24],
      [0.24, 0.24],
      [0.24, 1.02],
      [-0.24, 1.02],
      [-0.24, 0.24],
      [-1.02, 0.24],
      [-1.02, -0.24],
      [-0.24, -0.24]
    ];
    const bezelProfile: V2[] = [
      [1.18, -0.08],
      [1.38, -0.04],
      [1.42, 0],
      [1.38, 0.04],
      [1.18, 0.08]
    ];
    const holoBezel = transformMesh(latheMesh(bezelProfile, 8, true), { rot: [Math.PI * 0.5, 0, 0] });
    const plusCore = extrudePolygonMesh(plusRing, 0.26, 0.055, true);
    return mergeRawMeshes([plusCore, holoBezel]);
  });
}
