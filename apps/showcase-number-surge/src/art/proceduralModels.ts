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
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
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

function buildAeroCleatBootMesh(
  toeDirZ: -1 | 1,
  scale = 1,
  lean = false
): { readonly upper: RawMesh; readonly sole: RawMesh; readonly glow: RawMesh } {
  const zSign = toeDirZ;
  const ringPts = lean ? 12 : 14;
  const hullYaw = zSign < 0 ? Math.PI : 0;

  // Sleek sculpted sci-fi trooper boot upper (`sculptStreamlinedHullMesh` + `deformMesh` + `taubinSmoothMesh`)
  const rawUpper = sculptStreamlinedHullMesh(0.184 * scale, 0.09 * scale, 0.078 * scale, {
    noseSharpness: 0.86,
    tailTaper: 0.5,
    canopyBulge: 0.3,
    undersideFlat: 0.84,
    stations: lean ? 8 : 10,
    ringPoints: ringPts
  });
  const upper = taubinSmoothMesh(
    deformMesh(
      transformMesh(rawUpper, { pos: [0, 0.048 * scale, 0.016 * zSign * scale], rot: [0, hullYaw, 0] }),
      ([x, y, z]) => {
        const aftDist = (z - -0.02 * zSign * scale) * -zSign;
        const collarLift =
          aftDist > -0.01 * scale && y > 0.04 * scale
            ? 0.032 * scale * Math.exp(-Math.pow((aftDist - 0.022 * scale) / (0.042 * scale), 2))
            : 0;
        return [x, y + collarLift, z];
      }
    ),
    3,
    0.48,
    -0.505
  );

  // Contoured rocker outsole (`sole` strictly owns global lowest `minY` at every pitch angle!)
  const sole = taubinSmoothMesh(
    transformMesh(
      sculptStreamlinedHullMesh(0.194 * scale, 0.092 * scale, 0.028 * scale, {
        noseSharpness: 0.82,
        tailTaper: 0.54,
        canopyBulge: 0.08,
        undersideFlat: 0.85,
        stations: lean ? 7 : 9,
        ringPoints: lean ? 10 : 12
      }),
      { pos: [0, 0.014 * scale, 0.016 * zSign * scale], rot: [0, hullYaw, 0] }
    ),
    3,
    0.48,
    -0.505
  );

  // Swept curved heel aero-crest (`sculptCurvedHairLockMesh`) + recessed sole energy capsule
  const heelFin = sculptCurvedHairLockMesh({
    root: [0, 0.034 * scale, -0.048 * zSign * scale],
    mid: [0, 0.062 * scale, -0.078 * zSign * scale],
    tip: [0, 0.092 * scale, -0.105 * zSign * scale],
    width: 0.018 * scale,
    thickness: 0.026 * scale,
    segments: lean ? 6 : 8,
    radialSegments: lean ? 8 : 10
  });
  const soleGlow = taubinSmoothMesh(
    transformMesh(
      sculptStreamlinedHullMesh(0.128 * scale, 0.094 * scale, 0.014 * scale, {
        noseSharpness: 0.78,
        tailTaper: 0.68,
        canopyBulge: 0.12,
        undersideFlat: 0.6,
        stations: 6,
        ringPoints: lean ? 8 : 10
      }),
      { pos: [0, 0.025 * scale, 0.012 * zSign * scale], rot: [0, hullYaw, 0] }
    ),
    2,
    0.46,
    -0.48
  );

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
 * Smooth Stylized Sci-Fi Mini-Trooper (`captain = false` for lean instanced Squad Runners,
 * `captain = true` for richer Leader / Captain Variants). Grounded strictly at `minY = 0`, facing `-Z`:
 * - `sculptStylizedHeadMesh` (`subdivisions: 1` for crowd units, `2` for leader) + faired teardrop visor helmet,
 *   curved wraparound HUD visor, & `sculptCurvedHairLockMesh` + `taubinSmoothMesh` visor crest / temple winglets
 * - `sculptDrapedGarmentMesh` contoured armored sci-fi tunic, pectoral chestplate cuirass, & flared belt/tassets,
 *   plus smooth cupped shoulder pauldrons (`taubinSmoothMesh`)
 * - `sculptAnatomicalLimbMesh` + `taubinSmoothMesh` arms, legs, & sleek trooper boots (`ringPoints: 12` on crowd
 *   troopers for crisp, lean instanced crowd performance; `ringPoints: 16` on leader).
 */
function buildCyberSprinterAssembly(captain: boolean): CyberRunnerAssembly {
  const s: 1 | -1 = captain ? -1 : 1;
  const hScale = captain ? 1.16 : 1.0;
  const limbRings = captain ? 16 : 12;
  const garmentRings = captain ? 18 : 14;
  const suitDark = captain ? "#19133b" : "#12102c";
  const armorPrimary = captain ? "#fcf7ea" : "#1fe4ff";
  const armorSecondary = captain ? "#ffd046" : "#6df4ff";
  const trimAlloy = captain ? "#ffe07d" : "#9bd4f0";
  const glowHex = captain ? "#ffd84d" : "#3ef2ff";

  const bodyParts: RawMesh[] = [];
  const glowParts: RawMesh[] = [];

  const headY = 0.805 * hScale;
  const headZ = -0.035 * hScale;

  // 1. Smooth Neck + Stylized Sci-Fi Trooper Helmet (`subdivisions: 1` crowd, `2` captain) + Faired Visor Crest
  const neck = taubinSmoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0.725 * hScale, -0.026 * hScale], rx: 0.048 * hScale, rz: 0.046 * hScale },
        { pos: [0, 0.76 * hScale, -0.03 * hScale], rx: 0.042 * hScale, rz: 0.042 * hScale },
        { pos: [0, 0.792 * hScale, -0.034 * hScale], rx: 0.044 * hScale, rz: 0.044 * hScale }
      ],
      { ringPoints: captain ? 14 : 10, capEnds: true }
    ),
    3,
    0.48,
    -0.505
  );
  bodyParts.push(paintMeshColors(neck, suitDark));

  const baseHead = sculptStylizedHeadMesh(0.098 * hScale, {
    jawTaper: 0.3,
    cheekFullness: 0.09,
    browRidge: 0.12,
    noseBridge: 0.14,
    subdivisions: captain ? 2 : 1
  });
  const sweptHelmet = taubinSmoothMesh(
    deformMesh(
      transformMesh(baseHead, { rot: [0.1, Math.PI, 0] }),
      ([x, y, z]) => {
        const rearFactor = Math.max(0, z / (0.1 * hScale));
        const tailCone = 1 - Math.min(0.5, rearFactor * 0.32);
        const zSwept = z > 0 ? z * 1.44 + rearFactor * 0.024 * hScale : z * 1.1;
        return [x * tailCone * 0.95, y * 0.95 + rearFactor * 0.015 * hScale, zSwept];
      }
    ),
    captain ? 4 : 3,
    0.48,
    -0.505
  );
  bodyParts.push(paintMeshColors(transformMesh(sweptHelmet, { pos: [0, headY, headZ] }), armorPrimary));

  // Faired obsidian jaw / chin guard (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`)
  const chinGuard = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.116 * hScale, 0.106 * hScale, 0.046 * hScale, {
      noseSharpness: 0.84,
      tailTaper: 0.62,
      canopyBulge: 0.18,
      undersideFlat: 0.45,
      stations: captain ? 9 : 7,
      ringPoints: captain ? 12 : 10
    }),
    3,
    0.48,
    -0.505
  );
  bodyParts.push(
    paintMeshColors(
      transformMesh(chinGuard, {
        pos: [0, headY - 0.052 * hScale, headZ - 0.042 * hScale],
        rot: [0.22, Math.PI, 0]
      }),
      suitDark
    )
  );

  // Curved wraparound glowing HUD visor (`tubeSweepMesh` + `taubinSmoothMesh` wrapping `-Z` front & `±X` temples)
  const visorCurve = catmullRomSpline3(
    [
      [-0.094 * hScale, headY + 0.01 * hScale, headZ + 0.018 * hScale],
      [-0.076 * hScale, headY - 0.004 * hScale, headZ - 0.08 * hScale],
      [0, headY - 0.01 * hScale, headZ - 0.118 * hScale],
      [0.076 * hScale, headY - 0.004 * hScale, headZ - 0.08 * hScale],
      [0.094 * hScale, headY + 0.01 * hScale, headZ + 0.018 * hScale]
    ],
    captain ? 4 : 3,
    false
  );
  const visorBand = taubinSmoothMesh(
    tubeSweepMesh(
      visorCurve.map((p, idx): V4 => {
        const u = idx / Math.max(1, visorCurve.length - 1);
        return [p[0], p[1], p[2], (0.013 + 0.008 * Math.sin(Math.PI * u)) * hScale];
      }),
      captain ? 10 : 8,
      false
    ),
    2,
    0.44,
    -0.46
  );
  glowParts.push(paintMeshColors(visorBand, glowHex));

  // Sleek faired dorsal visor crest & twin swept temple winglets (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
  const dorsalCrest = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0, headY + 0.068 * hScale, headZ - 0.055 * hScale],
      mid: [0, headY + (captain ? 0.135 : 0.108) * hScale, headZ + 0.048 * hScale],
      tip: [0, headY + (captain ? 0.125 : 0.095) * hScale, headZ + (captain ? 0.195 : 0.155) * hScale],
      width: (captain ? 0.03 : 0.024) * hScale,
      thickness: (captain ? 0.044 : 0.034) * hScale,
      segments: captain ? 9 : 7,
      radialSegments: captain ? 12 : 10
    }),
    2,
    0.44,
    -0.46
  );
  bodyParts.push(paintMeshColors(dorsalCrest, armorSecondary));

  const tipGlowPod = taubinSmoothMesh(
    icosphereSmoothMesh(0.016 * hScale, 1, 0.002, 13),
    2,
    0.44,
    -0.46
  );
  for (const side of [-1, 1] as const) {
    const earWinglet = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [side * 0.082 * hScale, headY + 0.002 * hScale, headZ - 0.008 * hScale],
        mid: [side * 0.112 * hScale, headY + 0.034 * hScale, headZ + 0.064 * hScale],
        tip: [side * 0.128 * hScale, headY + 0.072 * hScale, headZ + 0.145 * hScale],
        width: 0.024 * hScale,
        thickness: 0.014 * hScale,
        segments: captain ? 8 : 6,
        radialSegments: captain ? 10 : 8
      }),
      2,
      0.44,
      -0.46
    );
    bodyParts.push(paintMeshColors(earWinglet, armorSecondary));
    glowParts.push(
      paintMeshColors(
        transformMesh(tipGlowPod, {
          pos: [side * 0.122 * hScale, headY + 0.064 * hScale, headZ + 0.128 * hScale],
          scale: [0.65, 0.75, 2.2]
        }),
        glowHex
      )
    );
  }

  // 2. Contoured Armored Sci-Fi Tunic, Chestplate Cuirass & Flared Tasset Belt (`sculptDrapedGarmentMesh`)
  const armoredTunic = sculptDrapedGarmentMesh(
    [
      { y: 0.382 * hScale, rx: 0.098 * hScale, rz: 0.07 * hScale, z: 0.016 * hScale, superellipseN: 2.15 },
      { y: 0.455 * hScale, rx: 0.078 * hScale, rz: 0.058 * hScale, z: 0.008 * hScale, folds: 4, foldAmp: 0.018, superellipseN: 2.2 },
      { y: 0.535 * hScale, rx: 0.118 * hScale, rz: 0.084 * hScale, z: -0.008 * hScale, folds: 4, foldAmp: 0.016, superellipseN: 2.25 },
      { y: 0.625 * hScale, rx: 0.16 * hScale, rz: 0.104 * hScale, z: -0.02 * hScale, superellipseN: 2.35 },
      { y: 0.695 * hScale, rx: 0.13 * hScale, rz: 0.08 * hScale, z: -0.025 * hScale, superellipseN: 2.2 },
      { y: 0.742 * hScale, rx: 0.056 * hScale, rz: 0.05 * hScale, z: -0.028 * hScale, superellipseN: 2.05 }
    ],
    { ringPoints: garmentRings, capEnds: true, smoothPasses: 4 }
  );
  bodyParts.push(paintMeshColors(armoredTunic, suitDark));

  const chestCuirass = sculptDrapedGarmentMesh(
    [
      { y: 0.518 * hScale, rx: 0.124 * hScale, rz: 0.09 * hScale, z: -0.01 * hScale, folds: 2, foldAmp: 0.022, superellipseN: 2.3 },
      { y: 0.585 * hScale, rx: 0.156 * hScale, rz: 0.106 * hScale, z: -0.018 * hScale, superellipseN: 2.35 },
      { y: 0.635 * hScale, rx: 0.17 * hScale, rz: 0.112 * hScale, z: -0.022 * hScale, superellipseN: 2.4 },
      { y: 0.692 * hScale, rx: 0.138 * hScale, rz: 0.086 * hScale, z: -0.025 * hScale, superellipseN: 2.2 }
    ],
    { ringPoints: captain ? 16 : 14, capEnds: true, smoothPasses: 4 }
  );
  const tassetBelt = sculptDrapedGarmentMesh(
    [
      { y: 0.398 * hScale, rx: 0.112 * hScale, rz: 0.082 * hScale, z: 0.014 * hScale, folds: 4, foldAmp: 0.025, superellipseN: 2.25 },
      { y: 0.428 * hScale, rx: 0.104 * hScale, rz: 0.076 * hScale, z: 0.012 * hScale, superellipseN: 2.3 },
      { y: 0.452 * hScale, rx: 0.088 * hScale, rz: 0.066 * hScale, z: 0.01 * hScale, superellipseN: 2.2 }
    ],
    { ringPoints: captain ? 16 : 14, capEnds: true, smoothPasses: 3 }
  );
  bodyParts.push(
    paintMeshColors(chestCuirass, armorPrimary),
    paintMeshColors(tassetBelt, trimAlloy)
  );

  // Smooth dorsal speed-pack cowling (`+Z` back) + curved chest V-chevron & dorsal capacitor nodes
  const backPack = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.175 * hScale, 0.132 * hScale, 0.068 * hScale, {
      noseSharpness: 0.78,
      tailTaper: 0.72,
      canopyBulge: 0.3,
      undersideFlat: 0.72,
      stations: captain ? 9 : 7,
      ringPoints: captain ? 12 : 10
    }),
    3,
    0.48,
    -0.505
  );
  bodyParts.push(
    paintMeshColors(
      transformMesh(backPack, {
        pos: [0, 0.595 * hScale, 0.074 * hScale],
        rot: [Math.PI * 0.5 - 0.12, 0, 0]
      }),
      trimAlloy
    )
  );

  const chestV = catmullRomSpline3(
    [
      [-0.095 * hScale, 0.648 * hScale, -0.112 * hScale],
      [0, 0.578 * hScale, -0.134 * hScale],
      [0.095 * hScale, 0.648 * hScale, -0.112 * hScale]
    ],
    3,
    false
  );
  glowParts.push(
    paintMeshColors(
      taubinSmoothMesh(
        tubeSweepMesh(chestV.map((p): V4 => [p[0], p[1], p[2], 0.014 * hScale]), 8, false),
        2,
        0.44,
        -0.46
      ),
      glowHex
    )
  );

  const spineNodeBase = taubinSmoothMesh(icosphereSmoothMesh(0.019 * hScale, 1, 0.002, 23), 2, 0.44, -0.46);
  for (let seg = 0; seg < 3; seg += 1) {
    const t = seg / 2;
    const sy = (0.525 + t * 0.135) * hScale;
    const sz = (0.104 - t * 0.01) * hScale;
    glowParts.push(
      paintMeshColors(
        transformMesh(spineNodeBase, {
          pos: [0, sy, sz],
          scale: [1.2 + t * 0.25, 0.85, 0.75]
        }),
        glowHex
      )
    );
  }

  if (captain) {
    for (const side of [-1, 1] as const) {
      const valkyrieWing = taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [side * 0.068 * hScale, 0.605 * hScale, 0.074 * hScale],
          mid: [side * 0.155 * hScale, 0.685 * hScale, 0.118 * hScale],
          tip: [side * 0.228 * hScale, 0.775 * hScale, 0.168 * hScale],
          width: 0.036 * hScale,
          thickness: 0.018 * hScale,
          segments: 9,
          radialSegments: 12
        }),
        2,
        0.44,
        -0.46
      );
      bodyParts.push(paintMeshColors(valkyrieWing, armorSecondary));
      glowParts.push(
        paintMeshColors(
          transformMesh(tipGlowPod, {
            pos: [side * 0.195 * hScale, 0.735 * hScale, 0.148 * hScale],
            rot: [-0.28, 0, -side * 0.52],
            scale: [0.7, 2.8, 0.85]
          }),
          glowHex
        )
      );
    }
  }

  // 3. Faired Shoulder Pauldrons (`taubinSmoothMesh`) + Smooth Anatomical Sprint Arms (`sculptAnatomicalLimbMesh`)
  const pauldronShellBase = taubinSmoothMesh(
    deformMesh(icosphereSmoothMesh(0.052 * hScale, captain ? 2 : 1, 0.003, 29), ([x, y, z]) => [
      x * 1.15,
      y > 0 ? y * 0.92 : y * 0.5,
      z * 1.18
    ]),
    3,
    0.48,
    -0.505
  );
  const gloveBase = taubinSmoothMesh(
    deformMesh(icosphereSmoothMesh(0.036 * hScale, 1, 0.003, 37), ([x, y, z]) => [
      x * 0.88,
      y * 0.95,
      z * 1.16
    ]),
    2,
    0.46,
    -0.48
  );
  const kneeCapBase = taubinSmoothMesh(
    deformMesh(icosphereSmoothMesh(0.034 * hScale, 1, 0.003, 41), ([x, y, z]) => [
      x * 0.96,
      y * 1.16,
      z * 0.82
    ]),
    2,
    0.46,
    -0.48
  );

  for (const side of [-1, 1] as const) {
    const armFwd = side * s;
    const shX = side * 0.172 * hScale;
    const shY = 0.655 * hScale;
    const shZ = -0.018 * hScale;

    bodyParts.push(
      paintMeshColors(
        transformMesh(pauldronShellBase, {
          pos: [shX + side * 0.006 * hScale, shY + 0.016 * hScale, shZ],
          rot: [0.12, 0, -side * 0.45]
        }),
        armorSecondary
      )
    );

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

    const upperArm = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [shX, shY, shZ], rx: 0.046 * hScale, rz: 0.052 * hScale },
          { pos: midUpper, rx: 0.042 * hScale, rz: 0.048 * hScale },
          { pos: elbowPos, rx: 0.036 * hScale, rz: 0.038 * hScale }
        ],
        { ringPoints: limbRings, capEnds: true, muscleBiasZ: -0.006 * hScale, peakT: 0.42 }
      ),
      3,
      0.48,
      -0.505
    );
    bodyParts.push(paintMeshColors(upperArm, suitDark));

    const forearmGauntlet = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: elbowPos, rx: 0.038 * hScale, rz: 0.041 * hScale },
          { pos: midFore, rx: 0.044 * hScale, rz: 0.048 * hScale },
          { pos: wristPos, rx: 0.031 * hScale, rz: 0.034 * hScale }
        ],
        { ringPoints: limbRings, capEnds: true, muscleBiasZ: 0.005 * hScale, peakT: 0.35 }
      ),
      3,
      0.48,
      -0.505
    );
    bodyParts.push(paintMeshColors(forearmGauntlet, armorPrimary));
    bodyParts.push(
      paintMeshColors(
        transformMesh(gloveBase, { pos: wristPos, rot: [armFwd > 0 ? -0.32 : 0.38, 0, 0] }),
        suitDark
      )
    );
  }

  // 4. Smooth Anatomical Sprint Legs (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`) + Sleek Trooper Boots (`minY = 0`)
  for (const side of [-1, 1] as const) {
    const legFwd = -side * s;
    const hipPos: V3 = [side * 0.082 * hScale, 0.405 * hScale, 0.012 * hScale];
    const kneePos: V3 =
      legFwd > 0
        ? [side * 0.088 * hScale, 0.255 * hScale, -0.105 * hScale]
        : [side * 0.088 * hScale, 0.235 * hScale, 0.085 * hScale];
    const anklePos: V3 =
      legFwd > 0
        ? [side * 0.086 * hScale, 0.072 * hScale, -0.055 * hScale]
        : [side * 0.086 * hScale, 0.112 * hScale, 0.195 * hScale];

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

    const thigh = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: hipPos, rx: 0.058 * hScale, rz: 0.068 * hScale },
          { pos: midThigh, rx: 0.054 * hScale, rz: 0.068 * hScale },
          { pos: kneePos, rx: 0.043 * hScale, rz: 0.046 * hScale }
        ],
        { ringPoints: limbRings, capEnds: true, muscleBiasZ: -0.01 * hScale, peakT: 0.42 }
      ),
      3,
      0.48,
      -0.505
    );
    bodyParts.push(paintMeshColors(thigh, suitDark));

    bodyParts.push(
      paintMeshColors(
        transformMesh(kneeCapBase, {
          pos: [kneePos[0], kneePos[1] + 0.006 * hScale, kneePos[2] - 0.022 * hScale],
          rot: [0.2, 0, 0]
        }),
        trimAlloy
      )
    );

    const shinGreave = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: kneePos, rx: 0.043 * hScale, rz: 0.046 * hScale },
          { pos: midCalf, rx: 0.047 * hScale, rz: 0.057 * hScale },
          { pos: anklePos, rx: 0.033 * hScale, rz: 0.036 * hScale }
        ],
        { ringPoints: limbRings, capEnds: true, muscleBiasZ: 0.012 * hScale, peakT: 0.36 }
      ),
      3,
      0.48,
      -0.505
    );
    bodyParts.push(paintMeshColors(shinGreave, armorPrimary));

    const boot = buildAeroCleatBootMesh(-1, hScale, !captain);
    const bootPitch = legFwd > 0 ? 0.0 : -0.3;
    const bootBaseY = legFwd > 0 ? 0.0 : 0.058 * hScale;
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
  return {
    bodySpec: mergeRawMeshes([bakedBody]),
    glowSpec: mergeRawMeshes([mergedGlow])
  };
}

/**
 * Menacing Crimson-and-Obsidian Heavy Riot Boss Trooper (`minY = 0`, facing `+Z` toward oncoming squad):
 * - `sculptStylizedHeadMesh` (`subdivisions: 2`) + faired respirator faceplate, `sculptCurvedHairLockMesh` crest,
 *   smooth `tubeSweepMesh` + `taubinSmoothMesh` horns, & curved glowing crimson T-visor
 * - `sculptDrapedGarmentMesh` heavy armored tunic, crimson breastplate cuirass, & flared battle-tassets,
 *   plus double-layered smooth domed shoulder pauldrons (`taubinSmoothMesh`)
 * - `sculptAnatomicalLimbMesh` + `taubinSmoothMesh` (`ringPoints: 16`) heavy arms & planted legs,
 *   cambered curved octagonal riot shield, & cylindrical plasma halberd with curved crescent glaive blade.
 */
function buildRivalRiotGuardAssembly(): CyberRunnerAssembly {
  const obsidianIron = "#14101f";
  const crimsonArmor = "#cf193e";
  const darkGunmetal = "#2f2842";
  const crimsonGlow = "#ff2652";

  const bodyParts: RawMesh[] = [];
  const glowParts: RawMesh[] = [];

  const headY = 1.02;

  // 1. Horned & Visored Heavy Riot Helm (`sculptStylizedHeadMesh` `subdivisions: 2` + `taubinSmoothMesh`)
  const neck = taubinSmoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0.91, 0.008], rx: 0.068, rz: 0.064 },
        { pos: [0, 0.96, 0.012], rx: 0.058, rz: 0.056 },
        { pos: [0, 1.0, 0.014], rx: 0.06, rz: 0.058 }
      ],
      { ringPoints: 14, capEnds: true }
    ),
    3,
    0.48,
    -0.505
  );
  bodyParts.push(paintMeshColors(neck, obsidianIron));

  const rawHead = sculptStylizedHeadMesh(0.118, {
    jawTaper: 0.34,
    cheekFullness: 0.1,
    browRidge: 0.16,
    noseBridge: 0.12,
    subdivisions: 2
  });
  const heavyHelm = taubinSmoothMesh(
    deformMesh(rawHead, ([x, y, z]) => [x * 1.08, y * 0.97, z * 1.14]),
    4,
    0.48,
    -0.505
  );
  bodyParts.push(paintMeshColors(transformMesh(heavyHelm, { pos: [0, headY, 0.015] }), obsidianIron));

  // Faired crimson respirator jaw-mask & sleek dorsal helm crest
  const respiratorMask = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.142, 0.156, 0.068, {
      noseSharpness: 0.82,
      tailTaper: 0.62,
      canopyBulge: 0.22,
      undersideFlat: 0.45,
      stations: 9,
      ringPoints: 14
    }),
    3,
    0.48,
    -0.505
  );
  const helmCrest = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0, headY + 0.088, 0.065],
      mid: [0, headY + 0.168, -0.025],
      tip: [0, headY + 0.155, -0.165],
      width: 0.036,
      thickness: 0.052,
      segments: 9,
      radialSegments: 12
    }),
    2,
    0.44,
    -0.46
  );
  bodyParts.push(
    paintMeshColors(transformMesh(respiratorMask, { pos: [0, headY - 0.054, 0.064], rot: [-0.14, 0, 0] }), crimsonArmor),
    paintMeshColors(helmCrest, crimsonArmor)
  );

  // Smooth curved bull/oni horns (`tubeSweepMesh(..., 12, false)` + `taubinSmoothMesh`)
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
    bodyParts.push(
      paintMeshColors(taubinSmoothMesh(tubeSweepMesh(hornSpine, 12, false), 2, 0.44, -0.46), crimsonArmor)
    );
  }

  // Curved glowing crimson T-slit riot visor (`+Z` front)
  const visorHoriz = catmullRomSpline3(
    [
      [-0.095, headY + 0.01, 0.102],
      [0, headY + 0.006, 0.142],
      [0.095, headY + 0.01, 0.102]
    ],
    4,
    false
  );
  const visorVert: V4[] = [
    [0, headY + 0.006, 0.142, 0.014],
    [0, headY - 0.03, 0.144, 0.013],
    [0, headY - 0.062, 0.136, 0.01]
  ];
  glowParts.push(
    paintMeshColors(
      taubinSmoothMesh(tubeSweepMesh(visorHoriz.map((p): V4 => [p[0], p[1], p[2], 0.015]), 10, false), 2, 0.44, -0.46),
      crimsonGlow
    ),
    paintMeshColors(taubinSmoothMesh(tubeSweepMesh(visorVert, 8, false), 2, 0.44, -0.46), crimsonGlow)
  );

  // 2. Heavy Armored Tunic, Broad Crimson Breastplate & Flared Battle-Tassets (`sculptDrapedGarmentMesh`)
  const riotTunic = sculptDrapedGarmentMesh(
    [
      { y: 0.465, rx: 0.142, rz: 0.102, z: 0.0, superellipseN: 2.2 },
      { y: 0.565, rx: 0.122, rz: 0.092, z: 0.004, folds: 4, foldAmp: 0.02, superellipseN: 2.25 },
      { y: 0.68, rx: 0.182, rz: 0.128, z: 0.012, folds: 4, foldAmp: 0.018, superellipseN: 2.35 },
      { y: 0.8, rx: 0.226, rz: 0.146, z: 0.018, superellipseN: 2.4 },
      { y: 0.89, rx: 0.178, rz: 0.112, z: 0.012, superellipseN: 2.25 },
      { y: 0.945, rx: 0.084, rz: 0.074, z: 0.008, superellipseN: 2.1 }
    ],
    { ringPoints: 18, capEnds: true, smoothPasses: 4 }
  );
  const crimsonBreastplate = sculptDrapedGarmentMesh(
    [
      { y: 0.635, rx: 0.168, rz: 0.122, z: 0.018, folds: 2, foldAmp: 0.025, superellipseN: 2.35 },
      { y: 0.725, rx: 0.215, rz: 0.148, z: 0.024, superellipseN: 2.45 },
      { y: 0.815, rx: 0.238, rz: 0.156, z: 0.026, superellipseN: 2.45 },
      { y: 0.885, rx: 0.186, rz: 0.118, z: 0.016, superellipseN: 2.25 }
    ],
    { ringPoints: 18, capEnds: true, smoothPasses: 4 }
  );
  const battleTassets = sculptDrapedGarmentMesh(
    [
      { y: 0.445, rx: 0.168, rz: 0.118, z: 0.008, folds: 6, foldAmp: 0.032, superellipseN: 2.25 },
      { y: 0.495, rx: 0.156, rz: 0.11, z: 0.008, folds: 6, foldAmp: 0.022, superellipseN: 2.3 },
      { y: 0.538, rx: 0.138, rz: 0.098, z: 0.006, superellipseN: 2.25 }
    ],
    { ringPoints: 18, capEnds: true, smoothPasses: 4 }
  );
  bodyParts.push(
    paintMeshColors(riotTunic, obsidianIron),
    paintMeshColors(crimsonBreastplate, crimsonArmor),
    paintMeshColors(battleTassets, darkGunmetal)
  );

  // Curved glowing crimson hazard V-chevron on chest + smooth dorsal reactor core
  const hazardCurve = catmullRomSpline3(
    [
      [-0.135, 0.825, 0.148],
      [0, 0.725, 0.182],
      [0.135, 0.825, 0.148]
    ],
    4,
    false
  );
  const dorsalReactor = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.22, 0.088, 0.056, {
      noseSharpness: 0.8,
      tailTaper: 0.8,
      canopyBulge: 0.26,
      undersideFlat: 0.65,
      stations: 9,
      ringPoints: 12
    }),
    3,
    0.48,
    -0.505
  );
  glowParts.push(
    paintMeshColors(
      taubinSmoothMesh(tubeSweepMesh(hazardCurve.map((p): V4 => [p[0], p[1], p[2], 0.018]), 10, false), 2, 0.44, -0.46),
      crimsonGlow
    ),
    paintMeshColors(
      transformMesh(dorsalReactor, { pos: [0, 0.74, -0.125], rot: [Math.PI * 0.5, 0, 0] }),
      crimsonGlow
    )
  );

  // 3. Double-Layered Smooth Domed Pauldrons + Heavy Anatomical Arms (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`)
  const upperPauldronDome = taubinSmoothMesh(
    deformMesh(icosphereSmoothMesh(0.084, 2, 0.004, 43), ([x, y, z]) => [
      x * 1.06,
      y > 0 ? y * 0.88 : y * 0.44,
      z * 1.14
    ]),
    3,
    0.48,
    -0.505
  );
  const lowerPauldronSkirt = taubinSmoothMesh(
    deformMesh(icosphereSmoothMesh(0.068, 1, 0.003, 47), ([x, y, z]) => [
      x * 1.08,
      y > 0 ? y * 0.72 : y * 0.42,
      z * 1.12
    ]),
    3,
    0.48,
    -0.505
  );
  const heavyFist = taubinSmoothMesh(icosphereSmoothMesh(0.052, 1, 0.004, 53), 2, 0.46, -0.48);

  for (const side of [-1, 1] as const) {
    const shPos: V3 = [side * 0.242, 0.82, 0.012];
    bodyParts.push(
      paintMeshColors(
        transformMesh(upperPauldronDome, {
          pos: [side * 0.256, 0.858, 0.015],
          rot: [0.06, 0, -side * 0.34]
        }),
        crimsonArmor
      ),
      paintMeshColors(
        transformMesh(lowerPauldronSkirt, {
          pos: [side * 0.282, 0.796, 0.015],
          rot: [0.06, 0, -side * 0.46]
        }),
        obsidianIron
      )
    );

    const elbowPos: V3 = side < 0 ? [-0.285, 0.65, 0.1] : [0.295, 0.67, 0.08];
    const handPos: V3 = side < 0 ? [-0.215, 0.62, 0.25] : [0.275, 0.68, 0.22];
    const midBicep: V3 = [(shPos[0] + elbowPos[0]) * 0.5, (shPos[1] + elbowPos[1]) * 0.5, (shPos[2] + elbowPos[2]) * 0.5];
    const midFore: V3 = [(elbowPos[0] + handPos[0]) * 0.5, (elbowPos[1] + handPos[1]) * 0.5, (elbowPos[2] + handPos[2]) * 0.5];

    bodyParts.push(
      paintMeshColors(
        taubinSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: shPos, rx: 0.066, rz: 0.072 },
              { pos: midBicep, rx: 0.062, rz: 0.068 },
              { pos: elbowPos, rx: 0.052, rz: 0.055 }
            ],
            { ringPoints: 16, capEnds: true, muscleBiasZ: 0.008, peakT: 0.42 }
          ),
          4,
          0.48,
          -0.505
        ),
        obsidianIron
      ),
      paintMeshColors(
        taubinSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: elbowPos, rx: 0.054, rz: 0.058 },
              { pos: midFore, rx: 0.06, rz: 0.064 },
              { pos: handPos, rx: 0.046, rz: 0.05 }
            ],
            { ringPoints: 16, capEnds: true, muscleBiasZ: 0.008, peakT: 0.36 }
          ),
          4,
          0.48,
          -0.505
        ),
        darkGunmetal
      ),
      paintMeshColors(transformMesh(heavyFist, { pos: handPos }), obsidianIron)
    );
  }

  // Left-arm Cambered Curved Octagonal Riot Shield (`extrudePolygonMesh(..., false)` + cylindrical camber + `taubinSmoothMesh`)
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
  const curvedShieldBody = taubinSmoothMesh(
    deformMesh(extrudePolygonMesh(shieldPoly, 0.044, 0.014, false), ([x, y, z]) => [
      x,
      y,
      z + 0.052 * (1 - (x / 0.24) * (x / 0.24))
    ]),
    3,
    0.46,
    -0.48
  );
  const shieldBossPlate = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.46, 0.32, 0.058, {
      noseSharpness: 0.72,
      tailTaper: 0.72,
      canopyBulge: 0.28,
      undersideFlat: 0.75,
      stations: 10,
      ringPoints: 14
    }),
    3,
    0.48,
    -0.505
  );
  const shieldGlowArc = catmullRomSpline3(
    [
      [-0.135, 0.13, 0.036],
      [0, 0.135, 0.068],
      [0.135, 0.13, 0.036]
    ],
    4,
    false
  );
  const shieldPose = { pos: [-0.215, 0.56, 0.31] as V3, rot: [-0.08, 0.26, 0.04] as V3 };
  bodyParts.push(
    paintMeshColors(transformMesh(curvedShieldBody, shieldPose), obsidianIron),
    paintMeshColors(
      transformMesh(
        transformMesh(shieldBossPlate, { pos: [0, -0.02, 0.036], rot: [Math.PI * 0.5, 0, 0] }),
        shieldPose
      ),
      crimsonArmor
    )
  );
  glowParts.push(
    paintMeshColors(
      transformMesh(
        taubinSmoothMesh(tubeSweepMesh(shieldGlowArc.map((p): V4 => [p[0], p[1], p[2], 0.018]), 10, false), 2, 0.44, -0.46),
        shieldPose
      ),
      crimsonGlow
    )
  );

  // Right-arm Smooth Cylindrical Plasma Halberd (`y in [0.02, 1.38]`, strictly `< 1.5`)
  const halberdShaft = taubinSmoothMesh(
    tubeSweepMesh(
      [
        [0.285, 0.025, 0.19, 0.021],
        [0.28, 0.45, 0.21, 0.022],
        [0.275, 0.85, 0.23, 0.024],
        [0.268, 1.22, 0.25, 0.026]
      ],
      12,
      false
    ),
    2,
    0.44,
    -0.46
  );
  const halberdGlaive = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0.268, 1.06, 0.25],
      mid: [0.355, 1.21, 0.305],
      tip: [0.295, 1.39, 0.275],
      width: 0.032,
      thickness: 0.115,
      segments: 10,
      radialSegments: 12
    }),
    2,
    0.44,
    -0.46
  );
  bodyParts.push(paintMeshColors(halberdShaft, darkGunmetal));
  glowParts.push(paintMeshColors(halberdGlaive, crimsonGlow));

  // 4. Planted Wide-Stance Heavy Riot Legs & Sleek Trooper Boots (`minY = 0`)
  const shinPlateBase = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.22, 0.098, 0.072, {
      noseSharpness: 0.72,
      tailTaper: 0.68,
      canopyBulge: 0.28,
      undersideFlat: 0.72,
      stations: 9,
      ringPoints: 14
    }),
    3,
    0.48,
    -0.505
  );
  for (const side of [-1, 1] as const) {
    const hip: V3 = [side * 0.118, 0.49, 0.0];
    const knee: V3 = [side * 0.145, 0.285, 0.045];
    const ankle: V3 = [side * 0.158, 0.082, 0.015];
    bodyParts.push(
      paintMeshColors(
        taubinSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: hip, rx: 0.074, rz: 0.086 },
              { pos: [(hip[0] + knee[0]) * 0.5, (hip[1] + knee[1]) * 0.5, 0.025], rx: 0.07, rz: 0.084 },
              { pos: knee, rx: 0.056, rz: 0.06 },
              { pos: [(knee[0] + ankle[0]) * 0.5, (knee[1] + ankle[1]) * 0.5, 0.032], rx: 0.062, rz: 0.072 },
              { pos: ankle, rx: 0.046, rz: 0.05 }
            ],
            { ringPoints: 16, capEnds: true, muscleBiasZ: 0.01, peakT: 0.38 }
          ),
          4,
          0.48,
          -0.505
        ),
        obsidianIron
      ),
      paintMeshColors(
        transformMesh(shinPlateBase, {
          pos: [side * 0.152, 0.215, 0.064],
          rot: [Math.PI * 0.5 - 0.08, 0, 0]
        }),
        crimsonArmor
      )
    );
    const boot = buildAeroCleatBootMesh(1, 1.18, false);
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
  return memoizeGeometry("number-surge:cyber-sprinter-lacquer:v4", () =>
    buildCyberSprinterAssembly(false)
  );
}

function cachedCeramicCaptain(): CyberRunnerAssembly {
  return memoizeGeometry("number-surge:cyber-sprinter-captain:v4", () =>
    buildCyberSprinterAssembly(true)
  );
}

function cachedRivalRiotGuard(): CyberRunnerAssembly {
  return memoizeGeometry("number-surge:rival-riot-guard:v2", () =>
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
      spokeCount: 5,
      tireMat: 0,
      rimMat: 0,
      rotorMat: 0
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
