/**
 * Iron Crown (`WP-05`) — 100% Native `@aura3d/engine` Multi-Material Procedural 3D Set-Pieces.
 *
 * Sculpted architectural landmarks, arena props, championship goblets, sovereign regalia,
 * and distant skyline/harbor/ridge geometry across all six Iron Crown tournament venues.
 * Built strictly from `showcase-port-shared/proceduralKernel` + `@aura3d/engine` with zero `three` imports.
 */
import {
  game,
  geometry,
  group,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";

import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
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
  mergeRawMeshesToRaw,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh as sculptDrapedGarmentKernel,
  sculptHumanoidLimbMesh,
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

interface IcGarmentStation {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly x?: number;
  readonly z?: number;
  readonly xBias?: number;
  readonly zBias?: number;
  readonly folds?: number;
  readonly foldAmp?: number;
  readonly superellipseN?: number;
}

interface IcGarmentOpts {
  readonly ringPoints?: number;
  readonly segments?: number;
  readonly foldCount?: number;
  readonly spiralTwist?: number;
  readonly wallThickness?: number;
  readonly openFrontArc?: number;
  readonly frontCenterAngle?: number;
  readonly capEnds?: boolean;
  readonly smoothPasses?: number;
  readonly seed?: number;
}

function sculptDrapedGarmentMesh(stations: readonly IcGarmentStation[], opts: IcGarmentOpts = {}): RawMesh {
  const segs = Math.max(14, Math.floor(opts.segments ?? opts.ringPoints ?? 24));
  const folds = Math.max(0, Math.floor(opts.foldCount ?? 6));
  const twist = opts.spiralTwist ?? 0;
  const phase = (opts.seed ?? 0) * 0.37;
  if (opts.openFrontArc !== undefined && opts.openFrontArc > 0.02) {
    const gap = Math.min(Math.PI * 1.65, opts.openFrontArc);
    const center = opts.frontCenterAngle ?? Math.PI * 0.5;
    const startA = center + gap * 0.5;
    const sweepA = Math.PI * 2 - gap;
    const thick = Math.max(0.004, opts.wallThickness ?? 0.014);
    const arcPts = Math.max(10, Math.floor(segs * 0.65));
    const rings: V3[][] = stations.map((st, rIdx) => {
      const cx = st.xBias ?? st.x ?? 0;
      const cz = st.zBias ?? st.z ?? 0;
      const fAmp = st.foldAmp ?? 0;
      const ring: V3[] = [];
      for (let i = 0; i <= arcPts; i += 1) {
        const a = startA + (i / arcPts) * sweepA + st.y * twist;
        const pleat = folds > 0 ? 1 + fAmp * Math.sin(a * folds + rIdx * 0.7 + phase) : 1;
        ring.push([cx + Math.cos(a) * st.rx * pleat, st.y, cz + Math.sin(a) * st.rz * pleat]);
      }
      for (let i = arcPts; i >= 0; i -= 1) {
        const a = startA + (i / arcPts) * sweepA + st.y * twist;
        const pleat = folds > 0 ? 1 + fAmp * 0.85 * Math.sin(a * folds + rIdx * 0.7 + phase) : 1;
        ring.push([
          cx + Math.cos(a) * Math.max(0.008, st.rx - thick) * pleat,
          st.y,
          cz + Math.sin(a) * Math.max(0.008, st.rz - thick) * pleat
        ]);
      }
      return ring;
    });
    return taubinSmoothMesh(loftSectionsMesh(rings, false, true), opts.smoothPasses ?? 4, 0.48, -0.505);
  }
  return sculptDrapedGarmentKernel(
    stations.map((st) => ({
      y: st.y,
      rx: st.rx,
      rz: st.rz,
      x: st.xBias ?? st.x ?? 0,
      z: st.zBias ?? st.z ?? 0,
      folds: st.folds ?? folds,
      foldAmp: st.foldAmp ?? 0,
      superellipseN: st.superellipseN
    })),
    {
      ringPoints: segs,
      capEnds: opts.capEnds ?? true,
      smoothPasses: opts.smoothPasses ?? 4
    }
  );
}

// ---------------------------------------------------------------------------
// Royal Forge & Biome Physical Material Library (>= 10 material.* presets)
// ---------------------------------------------------------------------------

export const IC_MATERIALS = {
  // Forged & structural metals
  forgedBlackIron: material.brushedMetal({
    name: "ic-forged-black-iron",
    color: "#16131a",
    roughness: 0.38,
    clearcoat: 0,
    anisotropy: 0.28,
    envMapIntensity: 0.62
  }),
  gildedCrownGold: material.brushedMetal({
    name: "ic-gilded-crown-gold",
    color: "#c99332",
    roughness: 0.29,
    clearcoat: 0,
    anisotropy: 0.34,
    envMapIntensity: 0.8
  }),
  sterlingTrophySilver: material.studioMetal({
    name: "ic-sterling-trophy-silver",
    color: "#cfd8e3",
    roughness: 0.26,
    clearcoat: 0,
    envMapIntensity: 0.82
  }),
  castTempleBronze: material.studioMetal({
    name: "ic-cast-temple-bronze",
    color: "#8c6234",
    roughness: 0.29,
    clearcoat: 0,
    envMapIntensity: 0.82
  }),
  weatheredGantrySteel: material.brushedMetal({
    name: "ic-weathered-gantry-steel",
    color: "#3d434d",
    roughness: 0.44,
    clearcoat: 0,
    anisotropy: 0.3,
    envMapIntensity: 0.72
  }),
  rustedGirderIron: material.metal({
    name: "ic-rusted-girder-iron",
    color: "#6e3b26",
    roughness: 0.64,
    clearcoat: 0,
    sheen: 0
  }),
  jetStealthCoat: material.carPaint({
    name: "ic-jet-stealth-coat",
    color: "#2b313a",
    roughness: 0.24
  }),
  jetTitaniumNozzle: material.studioMetal({
    name: "ic-jet-titanium-nozzle",
    color: "#8e99a8",
    roughness: 0.26
  }),

  // Lacquered timber, imperial jade, glazed roof tile & woven textiles
  vermilionLacquer: material.lacquer({
    name: "ic-vermilion-lacquer",
    color: "#961b16",
    roughness: 0.28,
    clearcoat: 0.52,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.72
  }),
  imperialJade: material.physical({
    name: "ic-imperial-jade",
    color: "#1b6a4e",
    roughness: 0.26,
    metallic: 0.04,
    clearcoat: 0.38,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.7
  }),
  rosewoodLacquer: material.lacquer({
    name: "ic-rosewood-lacquer",
    color: "#2c160e",
    roughness: 0.28,
    clearcoat: 0.44,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.68
  }),
  darkPagodaTile: material.ceramic({
    name: "ic-dark-pagoda-tile",
    color: "#1e2430",
    roughness: 0.32
  }),
  oiledCedarTimber: material.pbr({
    name: "ic-oiled-cedar-timber",
    color: "#4d311e",
    roughness: 0.68,
    metallic: 0.04,
    clearcoat: 0,
    sheen: 0
  }),
  royalCrimsonVelvet: material.fabric({
    name: "ic-royal-crimson-velvet",
    color: "#580b16",
    roughness: 0.88,
    sheen: 0.28,
    sheenColor: "#8c1a28",
    sheenRoughness: 0.72,
    envMapIntensity: 0.26
  }),
  dockIndigoNoren: material.fabric({
    name: "ic-dock-indigo-noren",
    color: "#1e3352",
    roughness: 0.88,
    sheen: 0.22,
    sheenColor: "#2d4b75",
    sheenRoughness: 0.78,
    envMapIntensity: 0.3
  }),

  // Stone, marble, obsidian, foliage & stratified rock
  travertineLight: material.pbr({
    name: "ic-travertine-light",
    color: "#cbb38c",
    roughness: 0.78,
    metallic: 0.02,
    clearcoat: 0,
    sheen: 0
  }),
  travertineWarm: material.pbr({
    name: "ic-travertine-warm",
    color: "#b3966b",
    roughness: 0.84,
    metallic: 0.02,
    clearcoat: 0,
    sheen: 0
  }),
  carvedCarraraMarble: material.physical({
    name: "ic-carved-carrara-marble",
    color: "#cfc4b0",
    roughness: 0.46,
    metallic: 0.02,
    clearcoat: 0.1,
    clearcoatRoughness: 0.34,
    envMapIntensity: 0.68
  }),
  sanctumDarkMarble: material.physical({
    name: "ic-sanctum-dark-marble",
    color: "#15121b",
    roughness: 0.28,
    metallic: 0.12,
    clearcoat: 0.24,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.64
  }),
  graniteLanternStone: material.ceramic({
    name: "ic-granite-lantern-stone",
    color: "#8b939c",
    roughness: 0.76
  }),
  obsidianSpireStrata: material.strata({
    bands: 9,
    colors: ["#13111a", "#241d30", "#382940", "#191522"],
    heightRange: [0, 4.4],
    noise: 0.28,
    noiseScale: 1.8,
    roughness: 0.36,
    seed: 51
  }),
  desertMesaStrata: material.strata({
    bands: 8,
    colors: ["#6e3d28", "#945739", "#b3734c", "#7d4930"],
    heightRange: [0, 14],
    noise: 0.32,
    noiseScale: 0.55,
    roughness: 0.88,
    seed: 73
  }),
  alpinePeakStrata: material.strata({
    bands: 7,
    colors: ["#38424f", "#4d5969", "#697789", "#dce6f2"],
    heightRange: [0, 36],
    noise: 0.35,
    noiseScale: 0.32,
    roughness: 0.82,
    seed: 91
  }),
  alpinePineNeedle: material.pbr({
    name: "ic-alpine-pine-needle",
    color: "#234236",
    roughness: 0.84,
    metallic: 0.02,
    clearcoat: 0,
    sheen: 0
  }),
  alpineSnowCap: material.pbr({
    name: "ic-alpine-snow-cap",
    color: "#e6eef8",
    roughness: 0.72,
    metallic: 0.02,
    clearcoat: 0,
    sheen: 0
  }),

  // WebGPU-safe transparent display/canopy glass (castShadow: false mandatory)
  displayGlass: material.physical({
    name: "ic-display-glass",
    color: "#d6eef8",
    roughness: 0.05,
    opacity: 0.42,
    clearcoat: 1,
    ior: 1.52
  }),

  // Dusk harbor water caustics
  harborWaterCaustics: material.caustics({
    color: "#142c30",
    causticColor: "#58b8a8",
    strength: 0.34,
    scale: 0.28,
    speed: 0.45,
    surfaceY: -0.4,
    depthFade: 6,
    roughness: 0.18
  })
} as const;

function practicalGlow(name: string, color: AuraColor, intensity = 1.25): AuraMaterialSpec {
  return material.pbr({
    name,
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.24,
    metallic: 0.18,
    clearcoat: 0,
    sheen: 0,
    practical: true
  });
}

function mountMultiMat(
  name: string,
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  pos: V3,
  rotY = 0,
  castShadow = false
): AuraSceneNode {
  return assembleMultiMaterialNode(name, slots, materials, {
    position: pos,
    rotation: [0, rotY, 0],
    castShadow,
    receiveShadow: true
  })
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON();
}

/** Swept East-Asian upturned pagoda roof tier sculpted via `bezierCurve2` + `loftSectionsMesh`. */
function curvedPagodaRoofMesh(width: number, depth: number, rise: number, flare = 0.24): RawMesh {
  const curve = bezierCurve2([0, rise], [0.36, rise * 0.42], [0.76, rise * 0.06], [1, flare * rise], 8);
  const sections: V3[][] = curve.map(([u, y], idx) => {
    const t = Math.max(0.06, u);
    const hw = width * 0.5 * t;
    const hd = depth * 0.5 * t;
    const cornerLift = idx >= curve.length - 2 ? flare * rise * 0.42 : 0;
    return [
      [-hw, y + cornerLift, hd],
      [0, y, hd * 0.94],
      [hw, y + cornerLift, hd],
      [hw * 0.94, y, 0],
      [hw, y + cornerLift, -hd],
      [0, y, -hd * 0.94],
      [-hw, y + cornerLift, -hd],
      [-hw * 0.94, y, 0]
    ];
  });
  return loftSectionsMesh(sections, true, true);
}

/** Ornate clawed-tripod gadrooned arena brazier (`latheMesh` cauldron + `sculptHumanoidLimbMesh` lion-paw legs + sculpted ember flames). */
export function buildForgedBrazierNode(
  name: string,
  pos: V3,
  height = 1.9,
  emberColor: AuraColor = "#ff6a24",
  rotY = 0,
  metalMat: AuraMaterialSpec = IC_MATERIALS.forgedBlackIron,
  emberIntensity = 0.82
): AuraSceneNode {
  const s = height / 1.9;
  const slots: MultiMatSlot[] = [];
  const plinth = latheMesh(
    [
      [0, 0],
      [0.42 * s, 0],
      [0.4 * s, 0.08 * s],
      [0.33 * s, 0.14 * s],
      [0.35 * s, 0.19 * s],
      [0.22 * s, 0.25 * s],
      [0, 0.25 * s]
    ],
    16
  );
  slots.push({ mesh: plinth, materialIndex: 0 });
  slots.push({
    mesh: latheMesh(
      [
        [0.21 * s, 0.72 * s],
        [0.24 * s, 0.74 * s],
        [0.24 * s, 0.79 * s],
        [0.21 * s, 0.81 * s]
      ],
      16
    ),
    materialIndex: 1
  });

  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const legJoints: V4[] = [
      [ca * 0.36 * s, 0.08 * s, sa * 0.36 * s, 0.062 * s],
      [ca * 0.28 * s, 0.36 * s, sa * 0.28 * s, 0.048 * s],
      [ca * 0.19 * s, 0.76 * s, sa * 0.19 * s, 0.044 * s],
      [ca * 0.31 * s, 1.36 * s, sa * 0.31 * s, 0.054 * s]
    ];
    slots.push({ mesh: sculptHumanoidLimbMesh(legJoints, 9, 0.12), materialIndex: 0 });
    // Lion-paw foot boss + gilded upper scroll mount + hanging ring handle
    slots.push(
      {
        mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.11 * s, 0.07 * s, 0.14 * s, 0.02 * s), 1, 0.48), {
          pos: [ca * 0.38 * s, 0.04 * s, sa * 0.38 * s],
          rot: [0, -a + Math.PI * 0.5, 0]
        }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(icosphereFacetMesh(0.068 * s, 1, 0.04, 11 + i), {
          pos: [ca * 0.35 * s, 1.44 * s, sa * 0.35 * s]
        }),
        materialIndex: 1
      }
    );
    const ringPts: V4[] = Array.from({ length: 9 }, (_, ri) => {
      const ra = (ri / 8) * Math.PI * 2;
      const rr = 0.072 * s;
      return [
        ca * (0.42 * s + Math.cos(ra) * 0.015 * s) - sa * Math.sin(ra) * rr,
        1.36 * s + Math.cos(ra) * rr,
        sa * (0.42 * s + Math.cos(ra) * 0.015 * s) + ca * Math.sin(ra) * rr,
        0.014 * s
      ];
    });
    slots.push({ mesh: tubeSweepMesh(ringPts, 6), materialIndex: 1 });
  }

  // Gadrooned forged cauldron bowl with gilded lip collar
  const bowl = latheMesh(
    [
      [0, 1.16 * s],
      [0.18 * s, 1.18 * s],
      [0.4 * s, 1.35 * s],
      [0.48 * s, 1.56 * s],
      [0.51 * s, 1.63 * s],
      [0.44 * s, 1.66 * s],
      [0.37 * s, 1.5 * s],
      [0, 1.44 * s]
    ],
    20
  );
  slots.push({ mesh: bowl, materialIndex: 0 });
  slots.push({
    mesh: latheMesh(
      [
        [0.45 * s, 1.59 * s],
        [0.525 * s, 1.61 * s],
        [0.525 * s, 1.66 * s],
        [0.44 * s, 1.67 * s]
      ],
      20
    ),
    materialIndex: 1
  });
  for (let rib = 0; rib < 9; rib += 1) {
    const ra = (rib / 9) * Math.PI * 2;
    const ca = Math.cos(ra), sa = Math.sin(ra);
    slots.push({
      mesh: tubeSweepMesh(
        [
          [ca * 0.18 * s, 1.19 * s, sa * 0.18 * s, 0.016 * s],
          [ca * 0.41 * s, 1.37 * s, sa * 0.41 * s, 0.022 * s],
          [ca * 0.485 * s, 1.57 * s, sa * 0.485 * s, 0.018 * s]
        ],
        5,
        true
      ),
      materialIndex: rib % 3 === 0 ? 1 : 0
    });
  }

  // Sculpted glowing coal mound + licking forged flame tongues
  const coalBed = subdivideSmoothMesh(icosphereFacetMesh(0.31 * s, 1, 0.22, 19), 1, 0.42);
  slots.push({
    mesh: transformMesh(coalBed, { pos: [0, 1.56 * s, 0], scale: [1.14, 0.58, 1.14] }),
    materialIndex: 2
  });
  const flameTongue: V2[] = [
    [-0.11 * s, 0],
    [0.11 * s, 0],
    [0.14 * s, 0.16 * s],
    [0.05 * s, 0.34 * s],
    [-0.02 * s, 0.46 * s],
    [-0.09 * s, 0.24 * s]
  ];
  const flameMesh = subdivideSmoothMesh(extrudePolygonMesh(flameTongue, 0.06 * s, 0.015 * s, false), 1, 0.45);
  for (let f = 0; f < 3; f += 1) {
    slots.push({
      mesh: transformMesh(flameMesh, {
        pos: [Math.cos((f / 3) * Math.PI * 2) * 0.05 * s, 1.62 * s, Math.sin((f / 3) * Math.PI * 2) * 0.05 * s],
        rot: [0.08, (f / 3) * Math.PI * 2 + 0.3, 0],
        scale: f === 0 ? 1.08 : 0.86
      }),
      materialIndex: 2
    });
  }

  return mountMultiMat(
    name,
    slots,
    [metalMat, IC_MATERIALS.gildedCrownGold, practicalGlow(`${name}-embers`, emberColor, emberIntensity)],
    pos,
    rotY,
    false
  );
}

// ---------------------------------------------------------------------------
// 1. Neo-Tokyo Rooftop (`nt-*`) — Pagoda Eaves, Kanji Neon, Vending & Arcade
// ---------------------------------------------------------------------------

export function buildNeoTokyoPagodaTower(name: string, pos: V3, rotY = 0, neonColor: AuraColor = "#ff3fa4"): AuraSceneNode {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(2.3, 2.5, 1.9, 0.06), { pos: [0, 1.25, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(2.42, 0.16, 2.02, 0.02), { pos: [0, 2.46, 0] }), materialIndex: 1 },
    { mesh: transformMesh(curvedPagodaRoofMesh(3.2, 2.65, 0.68, 0.28), { pos: [0, 2.52, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(1.68, 1.55, 1.42, 0.05), { pos: [0, 3.55, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.8, 0.14, 1.54, 0.02), { pos: [0, 4.28, 0] }), materialIndex: 1 },
    { mesh: transformMesh(curvedPagodaRoofMesh(2.48, 2.08, 0.62, 0.32), { pos: [0, 4.34, 0] }), materialIndex: 2 },
    {
      mesh: transformMesh(latheMesh([[0, 4.92], [0.12, 4.96], [0.06, 5.45], [0.1, 5.58], [0, 5.82]], 12), { pos: [0, 0, 0] }),
      materialIndex: 3
    },
    { mesh: transformMesh(bevelBoxMesh(1.36, 0.22, 0.08, 0.015), { pos: [0, 3.65, 0.74] }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(1.74, 0.14, 0.08, 0.015), { pos: [0, 1.85, 0.98] }), materialIndex: 4 }
  ];
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.vermilionLacquer,
      IC_MATERIALS.darkPagodaTile,
      IC_MATERIALS.gildedCrownGold,
      practicalGlow(`${name}-neon`, neonColor, 1.35)
    ],
    pos,
    rotY
  );
}

export function buildNeoTokyoNeonPylon(
  name: string,
  pos: V3,
  rotY = 0,
  primaryNeon: AuraColor = "#ff3fa4",
  secondaryNeon: AuraColor = "#3fe0ff"
): AuraSceneNode {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(0.76, 0.24, 0.64, 0.03), { pos: [0, 0.12, 0] }), materialIndex: 0 },
    {
      mesh: transformMesh(latticeTrussMesh({ span: [0.34, 3.6, 0.32], bays: 6, chordRadius: 0.022 }), { pos: [0, 1.92, -0.14] }),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(0.68, 2.55, 0.12, 0.025), { pos: [0, 2.38, 0.08] }), materialIndex: 1 },
    // Stylised vertical katakana/kanji stroke glyphs
    { mesh: transformMesh(bevelBoxMesh(0.44, 0.09, 0.05, 0.01), { pos: [0, 3.32, 0.16] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.09, 0.44, 0.05, 0.01), { pos: [0, 3.16, 0.16] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.38, 0.08, 0.05, 0.01), { pos: [0, 2.74, 0.16] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.34, 0.08, 0.05, 0.01), { pos: [0.02, 2.48, 0.16], rot: [0, 0, -0.34] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.42, 0.09, 0.05, 0.01), { pos: [0, 2.02, 0.16] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.09, 0.48, 0.05, 0.01), { pos: [-0.1, 1.82, 0.16] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.09, 0.48, 0.05, 0.01), { pos: [0.12, 1.82, 0.16] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.46, 0.09, 0.05, 0.01), { pos: [0, 1.38, 0.16] }), materialIndex: 3 },
    // Protective tempered glass sign cover (castShadow: false on assembly)
    { mesh: transformMesh(bevelBoxMesh(0.64, 2.46, 0.03, 0.008), { pos: [0, 2.38, 0.2] }), materialIndex: 4 }
  ];
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.weatheredGantrySteel,
      IC_MATERIALS.forgedBlackIron,
      practicalGlow(`${name}-kanji-a`, primaryNeon, 1.5),
      practicalGlow(`${name}-kanji-b`, secondaryNeon, 1.35),
      IC_MATERIALS.displayGlass
    ],
    pos,
    rotY,
    false
  );
}

export function buildNeoTokyoVendingBank(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const slots: MultiMatSlot[] = [];
  for (const [idx, ox] of [[-0.48, 0.48][0]!, [-0.48, 0.48][1]!].map((v, i) => [i, v] as const)) {
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.88, 1.92, 0.68, 0.035), { pos: [ox, 0.96, 0] }), materialIndex: idx === 0 ? 0 : 1 },
      { mesh: transformMesh(bevelBoxMesh(0.74, 0.22, 0.05, 0.01), { pos: [ox, 1.72, 0.34] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.68, 0.24, 0.12, 0.015), { pos: [ox, 0.32, 0.31] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(0.72, 0.92, 0.03, 0.006), { pos: [ox, 1.1, 0.34] }), materialIndex: 4 }
    );
    for (const sy of [0.82, 1.12, 1.4]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.68, 0.03, 0.22, 0.005), { pos: [ox, sy - 0.08, 0.22] }), materialIndex: 0 });
      for (let c = -2; c <= 2; c += 1) {
        const can = latheMesh([[0, 0], [0.042, 0], [0.045, 0.12], [0.038, 0.14], [0, 0.14]], 8);
        slots.push({
          mesh: transformMesh(can, { pos: [ox + c * 0.12, sy - 0.06, 0.24] }),
          materialIndex: (c + idx) % 2 === 0 ? 2 : 3
        });
      }
    }
  }
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.vermilionLacquer,
      practicalGlow(`${name}-glow-cyan`, "#4ce6ff", 1.15),
      practicalGlow(`${name}-glow-pink`, "#ff4fb2", 1.15),
      IC_MATERIALS.displayGlass
    ],
    pos,
    rotY,
    false
  );
}

export function buildNeoTokyoArcadeCabinet(
  name: string,
  pos: V3,
  rotY = 0,
  glowColor: AuraColor = "#3fe0ff"
): AuraSceneNode {
  const sideProfile: V2[] = [
    [-0.36, 0],
    [0.36, 0],
    [0.42, 0.72],
    [0.24, 0.88],
    [0.2, 1.48],
    [0.34, 1.72],
    [-0.3, 1.78],
    [-0.36, 1.32]
  ];
  const body = transformMesh(extrudePolygonMesh(sideProfile, 0.74, 0.025, true), { rot: [0, Math.PI * 0.5, 0] });
  const slots: MultiMatSlot[] = [
    { mesh: body, materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.62, 0.46, 0.04, 0.01), { pos: [0, 1.18, 0.2], rot: [-0.28, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.64, 0.16, 0.05, 0.01), { pos: [0, 1.66, 0.24], rot: [0.24, 0, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.66, 0.08, 0.28, 0.015), { pos: [0, 0.8, 0.3] }), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.014, 0], [0.014, 0.08], [0.032, 0.1], [0, 0.12]], 8), { pos: [-0.16, 0.84, 0.32] }), materialIndex: 3 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.014, 0], [0.014, 0.08], [0.032, 0.1], [0, 0.12]], 8), { pos: [0.14, 0.84, 0.32] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.64, 0.52, 0.025, 0.006), { pos: [0, 1.2, 0.26], rot: [-0.28, 0, 0] }), materialIndex: 4 }
  ];
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.vermilionLacquer,
      practicalGlow(`${name}-screen`, glowColor, 1.4),
      IC_MATERIALS.gildedCrownGold,
      IC_MATERIALS.displayGlass
    ],
    pos,
    rotY,
    false
  );
}

export function buildNeoTokyoHvacTower(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const cowl = latheMesh([[0.28, 0], [0.34, 0.04], [0.34, 0.18], [0.3, 0.22], [0.26, 0.18]], 16);
  const pipeSpine: V4[] = catmullRomSpline3(
    [[0.48, 0.24, 0.18], [0.62, 0.28, 0.18], [0.64, 0.92, 0.02], [0.46, 1.02, -0.08]],
    5
  ).map((p) => [p[0], p[1], p[2], 0.042] as const);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.36, 1.12, 0.86, 0.04), { pos: [0, 0.56, 0] }), materialIndex: 0 },
    { mesh: transformMesh(cowl, { pos: [-0.34, 1.12, 0] }), materialIndex: 1 },
    { mesh: transformMesh(cowl, { pos: [0.34, 1.12, 0] }), materialIndex: 1 },
    { mesh: tubeSweepMesh(pipeSpine, 8), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(1.16, 0.62, 0.04, 0.01), { pos: [0, 0.58, 0.44] }), materialIndex: 1 }
  ];
  for (const cx of [-0.34, 0.34]) {
    for (let b = 0; b < 4; b += 1) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.46, 0.02, 0.09, 0.005), { pos: [cx, 1.2, 0], rot: [0.22, (b / 4) * Math.PI, 0] }),
        materialIndex: 0
      });
    }
  }
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.weatheredGantrySteel, IC_MATERIALS.forgedBlackIron, IC_MATERIALS.castTempleBronze],
    pos,
    rotY
  );
}

export function buildNeoTokyoStreetLamp(name: string, pos: V3, rotY = 0, lampColor: AuraColor = "#ffad5c"): AuraSceneNode {
  const polePts = catmullRomSpline3([[0, 0.18, 0], [0, 1.75, 0], [0, 2.32, 0.16], [0, 2.42, 0.52]], 6);
  const poleSpine: V4[] = polePts.map((p, i) => [p[0], p[1], p[2], 0.055 - (i / polePts.length) * 0.022]);
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh([[0, 0], [0.22, 0], [0.18, 0.14], [0.08, 0.22], [0, 0.22]], 12), materialIndex: 0 },
    { mesh: tubeSweepMesh(poleSpine, 8), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.09, 0.38, 0.02), { pos: [0, 2.4, 0.58] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 0.035, 0.28, 0.008), { pos: [0, 2.34, 0.58] }), materialIndex: 1 }
  ];
  return mountMultiMat(name, slots, [IC_MATERIALS.forgedBlackIron, practicalGlow(`${name}-lens`, lampColor, 1.45)], pos, rotY);
}

export function buildSearchlightPylon(name: string, pos: V3, rotY = 0, beamColor: AuraColor = "#ffe3ad"): AuraSceneNode {
  const drum = latheMesh([[0, -0.22], [0.28, -0.2], [0.34, 0.18], [0.31, 0.22], [0, 0.18]], 16);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(0.84, 0.18, 0.84, 0.03), { pos: [0, 0.09, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [0.44, 1.65, 0.44], bays: 4, chordRadius: 0.024 }), { pos: [0, 0.98, 0] }), materialIndex: 0 },
    { mesh: transformMesh(drum, { pos: [0, 2.02, 0.04], rot: [1.18, 0, 0] }), materialIndex: 1 },
    {
      mesh: transformMesh(latheMesh([[0, 0], [0.28, 0], [0.28, 0.03], [0, 0.03]], 16), { pos: [0, 2.09, 0.22], rot: [1.18, 0, 0] }),
      materialIndex: 2
    }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.weatheredGantrySteel, IC_MATERIALS.forgedBlackIron, practicalGlow(`${name}-beam`, beamColor, 0.82)],
    pos,
    rotY
  );
}

// ---------------------------------------------------------------------------
// 2. Bangkok Dock / Foundry Pier (`bk-*`) — Gantry Cranes, Crucible & Carts
// ---------------------------------------------------------------------------

export function buildDockGantryCrane(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const hookRing: V2[] = [
    [-0.06, 0.22], [0.06, 0.22], [0.08, 0.04], [0.18, -0.08], [0.1, -0.22],
    [-0.08, -0.2], [-0.14, -0.06], [-0.04, -0.04], [0.04, -0.1], [0.06, -0.02]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.3, 0.24, 1.1, 0.03), { pos: [0, 0.12, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [0.68, 4.2, 0.68], bays: 6, chordRadius: 0.032 }), { pos: [0, 2.22, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [3.2, 0.48, 0.52], bays: 6, chordRadius: 0.026 }), { pos: [0.45, 4.35, 0.25] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.68, 0.44, 0.56, 0.03), { pos: [-0.95, 4.34, 0.25] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.42, 0.22, 0.58, 0.02), { pos: [1.35, 4.06, 0.25] }), materialIndex: 2 },
    // Chain hoist suspension cables + forged cargo hook
    { mesh: tubeSweepMesh([[1.26, 3.96, 0.25, 0.018], [1.26, 2.48, 0.25, 0.018]], 6, true), materialIndex: 1 },
    { mesh: tubeSweepMesh([[1.44, 3.96, 0.25, 0.018], [1.44, 2.48, 0.25, 0.018]], 6, true), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.32, 0.18, 0.18, 0.02), { pos: [1.35, 2.42, 0.25] }), materialIndex: 2 },
    { mesh: transformMesh(extrudePolygonMesh(hookRing, 0.07, 0.012, true), { pos: [1.35, 2.16, 0.25] }), materialIndex: 2 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.weatheredGantrySteel, IC_MATERIALS.rustedGirderIron, IC_MATERIALS.gildedCrownGold],
    pos,
    rotY
  );
}

export function buildDockCruciblePavilion(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const ladle = latheMesh(
    [[0, 0.85], [0.34, 0.88], [0.54, 1.18], [0.58, 1.68], [0.5, 1.72], [0.45, 1.24], [0, 1.18]],
    18
  );
  const slag = latheMesh([[0, 1.54], [0.46, 1.56], [0.48, 1.62], [0, 1.64]], 16);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(3.2, 0.28, 2.3, 0.04), { pos: [0, 0.14, 0] }), materialIndex: 0 },
    { mesh: transformMesh(curvedPagodaRoofMesh(3.65, 2.75, 0.82, 0.28), { pos: [0, 2.78, 0] }), materialIndex: 2 },
    { mesh: transformMesh(curvedPagodaRoofMesh(2.6, 1.95, 0.64, 0.32), { pos: [0, 3.68, 0] }), materialIndex: 2 },
    { mesh: ladle, materialIndex: 3 },
    { mesh: slag, materialIndex: 4 },
    { mesh: tubeSweepMesh([[-0.62, 1.48, 0, 0.036], [-0.62, 2.74, 0, 0.036], [0.62, 2.74, 0, 0.036], [0.62, 1.48, 0, 0.036]], 7, true), materialIndex: 3 }
  ];
  for (const [px, pz] of [[-1.32, -0.88], [1.32, -0.88], [-1.32, 0.88], [1.32, 0.88]] as const) {
    slots.push({
      mesh: transformMesh(latheMesh([[0, 0.28], [0.11, 0.28], [0.095, 2.8], [0, 2.8]], 10), { pos: [px, 0, pz] }),
      materialIndex: 1
    });
  }
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.oiledCedarTimber,
      IC_MATERIALS.vermilionLacquer,
      IC_MATERIALS.darkPagodaTile,
      IC_MATERIALS.forgedBlackIron,
      practicalGlow(`${name}-molten-slag`, "#ff8c2b", 1.75)
    ],
    pos,
    rotY
  );
}

export function buildDockVendorCart(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const wheelL = wheelAssemblySlots({ radius: 0.28, width: 0.09, spokeCount: 6, tireMat: 1, rimMat: 0 });
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.56, 0.72, 0.86, 0.03), { pos: [0, 0.64, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.74, 0.07, 1.02, 0.02), { pos: [0, 1.02, 0] }), materialIndex: 0 },
    { mesh: transformMesh(curvedPagodaRoofMesh(1.96, 1.26, 0.36, 0.2), { pos: [0, 2.02, 0] }), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 1.05], [0.22, 1.05], [0.26, 1.32], [0.22, 1.36], [0, 1.34]], 14), { pos: [-0.32, 0, 0.06] }), materialIndex: 2 },
    // Hanging indigo noren banners + warm paper lantern practicals
    { mesh: transformMesh(bevelBoxMesh(0.38, 0.36, 0.02, 0.004), { pos: [-0.52, 1.82, 0.48] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.38, 0.36, 0.02, 0.004), { pos: [0, 1.82, 0.48] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.38, 0.36, 0.02, 0.004), { pos: [0.52, 1.82, 0.48] }), materialIndex: 3 },
    { mesh: transformMesh(latheMesh([[0, 1.54], [0.11, 1.58], [0.13, 1.74], [0.09, 1.84], [0, 1.86]], 12), { pos: [0.68, 0, 0.52] }), materialIndex: 4 }
  ];
  for (const [px, pz] of [[-0.74, -0.38], [0.74, -0.38], [-0.74, 0.38], [0.74, 0.38]] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.06, 1.04, 0.06, 0.01), { pos: [px, 1.52, pz] }), materialIndex: 0 });
  }
  for (const s of wheelL) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [-0.54, 0.28, 0.46], rot: [0, Math.PI * 0.5, 0] }), materialIndex: s.materialIndex });
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0.54, 0.28, 0.46], rot: [0, Math.PI * 0.5, 0] }), materialIndex: s.materialIndex });
  }
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.oiledCedarTimber,
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.castTempleBronze,
      IC_MATERIALS.dockIndigoNoren,
      practicalGlow(`${name}-lantern`, "#ffb14a", 1.5)
    ],
    pos,
    rotY
  );
}

export function buildDockGirderStack(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const iBeamRing: V2[] = [
    [-0.18, -0.2], [0.18, -0.2], [0.18, -0.14], [0.04, -0.14],
    [0.04, 0.14], [0.18, 0.14], [0.18, 0.2], [-0.18, 0.2],
    [-0.18, 0.14], [-0.04, 0.14], [-0.04, -0.14], [-0.18, -0.14]
  ];
  const girder = transformMesh(extrudePolygonMesh(iBeamRing, 2.55, 0.012, true), { rot: [0, Math.PI * 0.5, 0] });
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.14, 1.18, 0.02), { pos: [-0.82, 0.07, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.14, 1.18, 0.02), { pos: [0.82, 0.07, 0] }), materialIndex: 1 },
    { mesh: transformMesh(girder, { pos: [0, 0.34, -0.32] }), materialIndex: 0 },
    { mesh: transformMesh(girder, { pos: [0, 0.34, 0.32] }), materialIndex: 0 },
    { mesh: transformMesh(girder, { pos: [0, 0.74, 0], rot: [0, 0.06, 0] }), materialIndex: 0 },
    { mesh: tubeSweepMesh([[-0.45, 0.12, -0.56, 0.024], [-0.45, 0.96, 0, 0.024], [-0.45, 0.12, 0.56, 0.024]], 6, true), materialIndex: 2 },
    { mesh: tubeSweepMesh([[0.45, 0.12, -0.56, 0.024], [0.45, 0.96, 0, 0.024], [0.45, 0.12, 0.56, 0.024]], 6, true), materialIndex: 2 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.rustedGirderIron, IC_MATERIALS.oiledCedarTimber, IC_MATERIALS.forgedBlackIron],
    pos,
    rotY
  );
}

export function buildBarrelCrateCluster(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const barrel = latheMesh(
    [
      [0, 0], [0.27, 0], [0.29, 0.06], [0.275, 0.28], [0.295, 0.31],
      [0.275, 0.58], [0.295, 0.61], [0.28, 0.84], [0.29, 0.88], [0, 0.88]
    ],
    16
  );
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(barrel, { pos: [-0.36, 0, 0.12] }), materialIndex: 0 },
    { mesh: transformMesh(barrel, { pos: [0.22, 0, -0.22] }), materialIndex: 1 },
    { mesh: transformMesh(barrel, { pos: [-0.08, 0.88, -0.06], rot: [0.05, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.76, 0.68, 0.72, 0.03), { pos: [0.46, 0.34, 0.26], rot: [0, 0.28, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.8, 0.08, 0.76, 0.012), { pos: [0.46, 0.54, 0.26], rot: [0, 0.28, 0] }), materialIndex: 1 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.rustedGirderIron, IC_MATERIALS.forgedBlackIron, IC_MATERIALS.oiledCedarTimber],
    pos,
    rotY
  );
}

// ---------------------------------------------------------------------------
// 3. Colosseum Ruins (`co-*`) — Voussoirs, Fluted Columns, Busts & Standards
// ---------------------------------------------------------------------------

export function buildColosseumVoussoirArch(name: string, pos: V3, scale = 1, rotY = 0): AuraSceneNode {
  const slots: MultiMatSlot[] = [];
  const pierH = 1.95 * scale;
  const rIn = 1.05 * scale;
  const thick = 0.36 * scale;
  const depth = 0.68 * scale;
  const pierX = rIn + thick * 0.5;

  for (const sx of [-1, 1] as const) {
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(thick * 1.24, 0.24 * scale, depth * 1.22, 0.03), { pos: [sx * pierX, 0.12 * scale, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(thick * 1.04, pierH, depth, 0.035), { pos: [sx * pierX, pierH * 0.5, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(thick * 1.26, 0.16 * scale, depth * 1.18, 0.025), { pos: [sx * pierX, pierH, 0] }), materialIndex: 2 }
    );
  }

  const archSlots = archwayVoussoirSlots({
    radius: rIn,
    thickness: thick,
    depth,
    voussoirs: 11,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 2
  });
  for (const s of archSlots) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0, pierH, 0] }), materialIndex: s.materialIndex });
  }

  // Entablature cornice & iron portcullis spears
  const topY = pierH + rIn + thick + 0.14 * scale;
  slots.push({ mesh: transformMesh(bevelBoxMesh((rIn + thick) * 2.28, 0.28 * scale, depth * 1.16, 0.035), { pos: [0, topY, 0] }), materialIndex: 1 });
  for (let gx = -3; gx <= 3; gx += 1) {
    slots.push({
      mesh: tubeSweepMesh([[gx * 0.24 * scale, 0.05, 0, 0.022 * scale], [gx * 0.24 * scale, pierH + rIn * 0.62, 0, 0.022 * scale]], 6, true),
      materialIndex: 3
    });
  }

  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.travertineLight, IC_MATERIALS.travertineWarm, IC_MATERIALS.carvedCarraraMarble, IC_MATERIALS.forgedBlackIron],
    pos,
    rotY
  );
}

export function buildColosseumCorinthianColumn(
  name: string,
  pos: V3,
  height = 4.3,
  rotY = 0,
  brokenTop = false
): AuraSceneNode {
  const shaftTop = brokenTop ? height * 0.78 : height * 0.88;
  const shaft = latheMesh(
    [
      [0, 0], [0.54, 0], [0.52, 0.18], [0.44, 0.28], [0.47, 0.36],
      [0.38, 0.44], [0.36, shaftTop * 0.55], [0.31, shaftTop], [0, shaftTop]
    ],
    20
  );
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.18, 0.2, 1.18, 0.03), { pos: [0, 0.1, 0] }), materialIndex: 1 },
    { mesh: shaft, materialIndex: 0 }
  ];
  for (let f = 0; f < 12; f += 1) {
    const a = (f / 12) * Math.PI * 2;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [Math.cos(a) * 0.36, 0.48, Math.sin(a) * 0.36, 0.024],
          [Math.cos(a) * 0.31, shaftTop - 0.08, Math.sin(a) * 0.31, 0.02]
        ],
        5,
        true
      ),
      materialIndex: 2
    });
  }
  if (!brokenTop) {
    const cap = latheMesh([[0, shaftTop], [0.32, shaftTop], [0.48, height * 0.95], [0.54, height], [0, height]], 16);
    slots.push(
      { mesh: cap, materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(1.16, 0.22, 1.16, 0.03), { pos: [0, height + 0.11, 0] }), materialIndex: 1 }
    );
  }
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.travertineLight, IC_MATERIALS.travertineWarm, IC_MATERIALS.carvedCarraraMarble],
    pos,
    rotY
  );
}

export function buildColosseumGladiatorBust(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const pedestal = latheMesh([[0, 0], [0.38, 0], [0.34, 0.14], [0.24, 0.22], [0.22, 0.82], [0.32, 0.92], [0, 0.94]], 14);
  const head = latheMesh([[0, 1.18], [0.11, 1.2], [0.16, 1.34], [0.15, 1.5], [0.09, 1.58], [0, 1.6]], 14);
  const crestRing: V2[] = [[-0.04, 1.52], [0.18, 1.48], [0.22, 1.68], [0.02, 1.78], [-0.18, 1.66]];
  const slots: MultiMatSlot[] = [
    { mesh: pedestal, materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.54, 0.26, 0.3, 0.06), { pos: [0, 1.07, 0] }), materialIndex: 1 },
    { mesh: head, materialIndex: 1 },
    { mesh: transformMesh(extrudePolygonMesh(crestRing, 0.08, 0.015, true), { rot: [0, Math.PI * 0.5, 0] }), materialIndex: 2 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.travertineWarm, IC_MATERIALS.carvedCarraraMarble, IC_MATERIALS.gildedCrownGold],
    pos,
    rotY
  );
}

export function buildColosseumImperialStandard(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const bannerRing: V2[] = [[-0.38, 0], [-0.38, -1.28], [0, -1.04], [0.38, -1.28], [0.38, 0]];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh([[0, 0], [0.26, 0], [0.2, 0.16], [0.05, 0.24], [0.04, 3.25], [0, 3.3]], 12), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.94, 0.06, 0.06, 0.012), { pos: [0, 2.72, 0.06] }), materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(bannerRing, 0.03, 0.006, true), { pos: [0, 2.7, 0.07] }), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 3.28], [0.14, 3.34], [0.24, 3.52], [0.06, 3.64], [0, 3.68]], 12), { pos: [0, 0, 0] }), materialIndex: 0 }
  ];
  return mountMultiMat(name, slots, [IC_MATERIALS.gildedCrownGold, IC_MATERIALS.royalCrimsonVelvet], pos, rotY);
}

// ---------------------------------------------------------------------------
// 4. Desert Airbase / Obsidian Range (`ab-*`) — Stealth Jet, Radar & Spires
// ---------------------------------------------------------------------------

export function buildAirbaseTacticalJetNodes(pos: V3, rotY = -0.12): readonly AuraSceneNode[] {
  const mkFuselageRing = (z: number, wx: number, hy: number, yCenter: number): V3[] => [
    [0, yCenter + hy, z],
    [wx * 0.68, yCenter + hy * 0.46, z],
    [wx, yCenter - hy * 0.08, z],
    [wx * 0.62, yCenter - hy * 0.84, z],
    [0, yCenter - hy, z],
    [-wx * 0.62, yCenter - hy * 0.84, z],
    [-wx, yCenter - hy * 0.08, z],
    [-wx * 0.68, yCenter + hy * 0.46, z]
  ];
  const fuselage = loftSectionsMesh(
    [
      mkFuselageRing(2.35, 0.05, 0.05, 0.72),
      mkFuselageRing(1.45, 0.28, 0.2, 0.78),
      mkFuselageRing(0.35, 0.56, 0.3, 0.84),
      mkFuselageRing(-0.95, 0.68, 0.28, 0.84),
      mkFuselageRing(-2.05, 0.52, 0.24, 0.82)
    ],
    true
  );
  const wingRing: V2[] = [[0.46, 0.55], [2.28, -1.18], [2.28, -1.68], [0.48, -1.55]];
  const leftWingRing: V2[] = [[-0.48, -1.55], [-2.28, -1.68], [-2.28, -1.18], [-0.46, 0.55]];
  const tailFin: V2[] = [[0, 0], [0.85, -0.32], [0.55, 0.78], [0.12, 0.82]];
  const nozzle = transformMesh(
    latheMesh([[0.15, 0], [0.22, 0.02], [0.19, 0.34], [0.15, 0.36]], 14),
    { rot: [-Math.PI * 0.5, 0, 0] }
  );
  const wheel = wheelAssemblySlots({ radius: 0.2, width: 0.1, spokeCount: 5, tireMat: 1, rimMat: 2 });

  const slots: MultiMatSlot[] = [
    { mesh: fuselage, materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(wingRing, 0.07, 0.015, true), { pos: [0, 0.8, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(leftWingRing, 0.07, 0.015, true), { pos: [0, 0.8, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(tailFin, 0.055, 0.012, true), { pos: [-0.42, 0.96, -1.45], rot: [0, Math.PI * 0.5, -0.26] }), materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(tailFin, 0.055, 0.012, true), { pos: [0.42, 0.96, -1.45], rot: [0, Math.PI * 0.5, 0.26] }), materialIndex: 0 },
    { mesh: transformMesh(nozzle, { pos: [-0.24, 0.82, -2.04] }), materialIndex: 2 },
    { mesh: transformMesh(nozzle, { pos: [0.24, 0.82, -2.04] }), materialIndex: 2 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.14, 0], [0.14, 0.04], [0, 0.04]], 12), { pos: [-0.24, 0.82, -2.38], rot: [-Math.PI * 0.5, 0, 0] }), materialIndex: 3 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.14, 0], [0.14, 0.04], [0, 0.04]], 12), { pos: [0.24, 0.82, -2.38], rot: [-Math.PI * 0.5, 0, 0] }), materialIndex: 3 },
    // Landing gear struts grounded so tires touch y = 0
    { mesh: tubeSweepMesh([[0, 0.2, 1.32, 0.032], [0, 0.68, 1.24, 0.038]], 6, true), materialIndex: 2 },
    { mesh: tubeSweepMesh([[-0.68, 0.2, -0.78, 0.036], [-0.52, 0.68, -0.78, 0.042]], 6, true), materialIndex: 2 },
    { mesh: tubeSweepMesh([[0.68, 0.2, -0.78, 0.036], [0.52, 0.68, -0.78, 0.042]], 6, true), materialIndex: 2 }
  ];
  for (const gp of [[0, 0.2, 1.32], [-0.68, 0.2, -0.78], [0.68, 0.2, -0.78]] as const) {
    for (const ws of wheel) {
      slots.push({ mesh: transformMesh(ws.mesh, { pos: gp }), materialIndex: ws.materialIndex });
    }
  }

  const canopySections: V3[][] = [
    [[-0.08, 0.94, 1.52], [0, 1.0, 1.52], [0.08, 0.94, 1.52], [0, 0.92, 1.52]],
    [[-0.22, 0.98, 0.92], [0, 1.24, 0.92], [0.22, 0.98, 0.92], [0, 0.95, 0.92]],
    [[-0.2, 0.98, 0.18], [0, 1.18, 0.18], [0.2, 0.98, 0.18], [0, 0.95, 0.18]]
  ];
  const canopySpec = mergeRawMeshes([loftSectionsMesh(canopySections, true)]);

  return [
    mountMultiMat(
      "ab-jet-center",
      slots,
      [
        IC_MATERIALS.jetStealthCoat,
        IC_MATERIALS.forgedBlackIron,
        IC_MATERIALS.jetTitaniumNozzle,
        practicalGlow("ab-jet-afterburner", "#ff8a34", 1.35)
      ],
      pos,
      rotY,
      true
    ),
    geometry
      .custom(canopySpec, {
        name: "ab-jet-canopy",
        material: IC_MATERIALS.displayGlass,
        castShadow: false,
        receiveShadow: false
      })
      .position(pos[0], pos[1], pos[2])
      .rotate(0, rotY, 0)
      .toJSON()
  ];
}

export function buildAirbaseRadarTower(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const dish = latheMesh([[0, 0], [0.28, 0.04], [0.58, 0.18], [0.74, 0.34], [0.71, 0.37], [0.24, 0.08], [0, 0.05]], 18);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.16, 0.22, 1.16, 0.03), { pos: [0, 0.11, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [0.72, 2.75, 0.72], bays: 5, chordRadius: 0.028 }), { pos: [0, 1.48, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.96, 0.12, 0.96, 0.02), { pos: [0, 2.9, 0] }), materialIndex: 1 },
    { mesh: transformMesh(dish, { pos: [0, 3.38, 0.08], rot: [1.22, 0.3, 0] }), materialIndex: 2 },
    { mesh: transformMesh(icosphereFacetMesh(0.09, 1, 0, 3), { pos: [0, 3.92, 0] }), materialIndex: 3 }
  ];
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.weatheredGantrySteel,
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.sterlingTrophySilver,
      practicalGlow(`${name}-beacon`, "#ff4d2e", 1.55)
    ],
    pos,
    rotY
  );
}

export function buildAirbaseFuelDepot(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const tank = transformMesh(
    latheMesh([[0, -1.15], [0.36, -1.08], [0.58, -0.82], [0.58, 0.82], [0.36, 1.08], [0, 1.15]], 18),
    { pos: [0, 0.88, 0], rot: [0, 0, Math.PI * 0.5] }
  );
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.48, 1.18, 0.03), { pos: [-0.66, 0.24, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.48, 1.18, 0.03), { pos: [0.66, 0.24, 0] }), materialIndex: 1 },
    { mesh: tank, materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.18, 1.21, 1.21, 0.02), { pos: [0, 0.88, 0] }), materialIndex: 2 },
    { mesh: tubeSweepMesh([[0.42, 0.12, 0.62, 0.045], [0.42, 0.88, 0.62, 0.045], [0.18, 0.88, 0.56, 0.045]], 7, true), materialIndex: 1 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.sterlingTrophySilver, IC_MATERIALS.weatheredGantrySteel, IC_MATERIALS.gildedCrownGold],
    pos,
    rotY
  );
}

export function buildObsidianRunicSpire(name: string, pos: V3, height = 3.8, rotY = 0): AuraSceneNode {
  const cliff = stratifiedCliffMesh({ radiusX: 0.78, radiusZ: 0.72, height: height * 0.62, terraces: 5, seed: 37 });
  const crystalSections: V3[][] = [
    [[0, 0.2, 0.34], [0.32, 0.2, 0.08], [0.2, 0.2, -0.3], [-0.22, 0.2, -0.28], [-0.34, 0.2, 0.1]],
    [[0.04, height * 0.58, 0.28], [0.26, height * 0.58, 0.05], [0.14, height * 0.58, -0.24], [-0.18, height * 0.58, -0.22], [-0.26, height * 0.58, 0.08]],
    [[0.02, height, 0.03], [0.03, height, 0], [0.01, height, -0.03], [-0.02, height, -0.02], [-0.03, height, 0.01]]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: cliff, materialIndex: 0 },
    { mesh: loftSectionsMesh(crystalSections, true, true), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.08, height * 0.52, 0.08, 0.01), { pos: [0.06, height * 0.52, 0.24], rot: [0.06, 0, -0.05] }), materialIndex: 2 },
    { mesh: tubeSweepMesh([[-0.62, 0.08, 0.42, 0.03], [-0.26, height * 0.38, 0.18, 0.026]], 6, true), materialIndex: 1 },
    { mesh: tubeSweepMesh([[0.62, 0.08, 0.38, 0.03], [0.24, height * 0.42, 0.16, 0.026]], 6, true), materialIndex: 1 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.obsidianSpireStrata, IC_MATERIALS.forgedBlackIron, practicalGlow(`${name}-rune`, "#ff9b38", 1.45)],
    pos,
    rotY
  );
}

export function buildChainedPadBeacon(name: string, pos: V3, rotY = 0, beaconColor: AuraColor = "#ffb03c"): AuraSceneNode {
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh([[0, 0], [0.34, 0], [0.28, 0.18], [0.16, 0.58], [0.22, 0.66], [0, 0.68]], 12), materialIndex: 0 },
    { mesh: transformMesh(icosphereFacetMesh(0.14, 1, 0.06, 7), { pos: [0, 0.78, 0] }), materialIndex: 2 },
    { mesh: tubeSweepMesh([[-0.32, 0.05, 0, 0.02], [-0.18, 0.62, 0, 0.02]], 5, true), materialIndex: 1 },
    { mesh: tubeSweepMesh([[0.32, 0.05, 0, 0.02], [0.18, 0.62, 0, 0.02]], 5, true), materialIndex: 1 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.forgedBlackIron, IC_MATERIALS.weatheredGantrySteel, practicalGlow(`${name}-core`, beaconColor, 1.5)],
    pos,
    rotY
  );
}

// ---------------------------------------------------------------------------
// 5. Himalayan Monastery (`mo-*`) — Temple, Torii, Bronze Bell & Bonsai Pines
// ---------------------------------------------------------------------------

export function buildMonasteryTempleHall(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(3.8, 0.36, 2.5, 0.04), { pos: [0, 0.18, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(2.9, 1.95, 1.85, 0.04), { pos: [0, 1.32, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(1.45, 1.32, 0.06, 0.01), { pos: [0, 1.18, 0.94] }), materialIndex: 4 },
    { mesh: transformMesh(curvedPagodaRoofMesh(4.35, 3.05, 0.88, 0.3), { pos: [0, 2.28, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(2.05, 1.15, 1.38, 0.04), { pos: [0, 3.35, 0] }), materialIndex: 1 },
    { mesh: transformMesh(curvedPagodaRoofMesh(3.15, 2.22, 0.76, 0.34), { pos: [0, 3.9, 0] }), materialIndex: 2 },
    { mesh: latheMesh([[0, 4.62], [0.14, 4.68], [0.06, 5.18], [0.11, 5.32], [0, 5.55]], 12), materialIndex: 3 }
  ];
  for (const px of [-1.52, -0.78, 0.78, 1.52] as const) {
    slots.push({
      mesh: transformMesh(latheMesh([[0, 0.36], [0.11, 0.36], [0.095, 2.3], [0, 2.3]], 10), { pos: [px, 0, 1.02] }),
      materialIndex: 1
    });
  }
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.graniteLanternStone,
      IC_MATERIALS.vermilionLacquer,
      IC_MATERIALS.darkPagodaTile,
      IC_MATERIALS.gildedCrownGold,
      practicalGlow(`${name}-shoji`, "#ffd596", 1.15)
    ],
    pos,
    rotY
  );
}

export function buildMonasteryToriiGate(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const kasagiRing: V2[] = [
    [-1.78, 0.28], [-1.2, 0.06], [0, 0], [1.2, 0.06], [1.78, 0.28],
    [1.68, 0.48], [1.1, 0.24], [0, 0.18], [-1.1, 0.24], [-1.68, 0.48]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.18, 0.26], [0, 0.26]], 12), { pos: [-1.05, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.18, 0.26], [0, 0.26]], 12), { pos: [1.05, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(latheMesh([[0, 0.24], [0.14, 0.24], [0.11, 3.05], [0, 3.05]], 14), { pos: [-1.05, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0, 0.24], [0.14, 0.24], [0.11, 3.05], [0, 3.05]], 14), { pos: [1.05, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(2.75, 0.16, 0.16, 0.025), { pos: [0, 2.48, 0] }), materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(kasagiRing, 0.26, 0.03, true), { pos: [0, 2.95, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.38, 0.54, 0.12, 0.02), { pos: [0, 2.76, 0] }), materialIndex: 3 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.vermilionLacquer, IC_MATERIALS.darkPagodaTile, IC_MATERIALS.forgedBlackIron, IC_MATERIALS.gildedCrownGold],
    pos,
    rotY
  );
}

export function buildMonasteryBellPavilion(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const bonshoBell = latheMesh(
    [
      [0.44, 1.05], [0.47, 1.08], [0.45, 1.42], [0.42, 1.88],
      [0.32, 2.18], [0.12, 2.3], [0.14, 2.46], [0, 2.48]
    ],
    20
  );
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(2.45, 0.34, 2.15, 0.04), { pos: [0, 0.17, 0] }), materialIndex: 0 },
    { mesh: transformMesh(curvedPagodaRoofMesh(2.95, 2.55, 0.78, 0.3), { pos: [0, 2.86, 0] }), materialIndex: 2 },
    { mesh: transformMesh(curvedPagodaRoofMesh(2.15, 1.85, 0.58, 0.34), { pos: [0, 3.68, 0] }), materialIndex: 3 },
    { mesh: bonshoBell, materialIndex: 4 },
    // Suspended cedar shumoku striker log
    { mesh: transformMesh(latheMesh([[0, -0.58], [0.075, -0.55], [0.075, 0.55], [0, 0.58]], 10), { pos: [0.68, 1.48, 0.18], rot: [0, 0, Math.PI * 0.5] }), materialIndex: 1 },
    { mesh: tubeSweepMesh([[0.42, 2.82, 0.18, 0.018], [0.42, 1.54, 0.18, 0.018]], 5, true), materialIndex: 4 },
    { mesh: tubeSweepMesh([[0.92, 2.82, 0.18, 0.018], [0.92, 1.54, 0.18, 0.018]], 5, true), materialIndex: 4 }
  ];
  for (const [px, pz] of [[-0.96, -0.82], [0.96, -0.82], [-0.96, 0.82], [0.96, 0.82]] as const) {
    slots.push({
      mesh: transformMesh(latheMesh([[0, 0.34], [0.1, 0.34], [0.09, 2.88], [0, 2.88]], 10), { pos: [px, 0, pz] }),
      materialIndex: 1
    });
  }
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.graniteLanternStone,
      IC_MATERIALS.oiledCedarTimber,
      IC_MATERIALS.darkPagodaTile,
      IC_MATERIALS.alpineSnowCap,
      IC_MATERIALS.castTempleBronze
    ],
    pos,
    rotY
  );
}

export function buildMonasteryStoneLantern(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const pedestal = latheMesh(
    [[0, 0], [0.36, 0], [0.32, 0.16], [0.14, 0.28], [0.13, 0.88], [0.28, 0.98], [0, 1.0]],
    12,
    true
  );
  const kasaCap = latheMesh([[0, 1.38], [0.42, 1.38], [0.24, 1.58], [0.08, 1.72], [0, 1.78]], 8, true);
  const slots: MultiMatSlot[] = [
    { mesh: pedestal, materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.32, 0.36, 0.32, 0.02), { pos: [0, 1.18, 0] }), materialIndex: 1 },
    { mesh: kasaCap, materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0, 1.5], [0.26, 1.48], [0.08, 1.74], [0, 1.79]], 8, true), { pos: [0, 0.02, 0] }), materialIndex: 2 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.graniteLanternStone, practicalGlow(`${name}-firebox`, "#ffd089", 1.45), IC_MATERIALS.alpineSnowCap],
    pos,
    rotY
  );
}

export function buildMonasteryBonsaiPine(name: string, pos: V3, rotY = 0, seed = 41): AuraSceneNode {
  const trunkPts = catmullRomSpline3(
    [[0, 0.12, 0], [-0.28, 0.68, 0.12], [0.24, 1.34, -0.08], [-0.14, 1.98, 0.1], [0.18, 2.45, 0]],
    6
  );
  const trunkSpine: V4[] = trunkPts.map((p, i) => [p[0], p[1], p[2], 0.16 - (i / trunkPts.length) * 0.1]);
  const branchSpine: V4[] = catmullRomSpline3([[-0.08, 1.42, 0.02], [-0.62, 1.62, 0.18], [-0.92, 1.68, 0.22]], 4).map(
    (p, i) => [p[0], p[1], p[2], 0.075 - i * 0.004]
  );
  const slots: MultiMatSlot[] = [
    { mesh: stratifiedCliffMesh({ radiusX: 0.56, radiusZ: 0.48, height: 0.28, terraces: 3, seed }), materialIndex: 0 },
    { mesh: tubeSweepMesh(trunkSpine, 8), materialIndex: 1 },
    { mesh: tubeSweepMesh(branchSpine, 7), materialIndex: 1 },
    { mesh: transformMesh(layeredCanopyMesh({ radius: 0.72, height: 0.54, puffs: 8, seed }), { pos: [0.18, 2.28, 0] }), materialIndex: 2 },
    { mesh: transformMesh(layeredCanopyMesh({ radius: 0.58, height: 0.44, puffs: 7, seed: seed + 13 }), { pos: [-0.88, 1.56, 0.22] }), materialIndex: 2 },
    { mesh: transformMesh(coniferBoughTierMesh({ baseRadius: 0.54, height: 0.82, tiers: 4, seed: seed + 29 }), { pos: [-0.14, 1.72, 0.08] }), materialIndex: 2 },
    { mesh: transformMesh(icosphereFacetMesh(0.36, 1, 0.12, seed + 5), { pos: [0.18, 2.66, 0], scale: [1.3, 0.28, 1.2] }), materialIndex: 3 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.graniteLanternStone, IC_MATERIALS.oiledCedarTimber, IC_MATERIALS.alpinePineNeedle, IC_MATERIALS.alpineSnowCap],
    pos,
    rotY
  );
}

/**
 * Sculpted Coiled Bronze / Vermilion-Lacquer / Imperial-Jade Dragon-Relief Column (`WP-05`):
 * - Stepped dark sanctum-obsidian plinth + Attic torus/scotia base moulding (`latheMesh`)
 * - Dark fluted obsidian/basalt shaft (`latheMesh` entasis + 12 dark forged-stone flutes — zero white slabs)
 * - Vermilion-lacquer & burnished-gold collar rings + Corinthian acanthus capital + imperial-jade finial
 * - 2.75-turn helical `catmullRomSpline3` -> `tubeSweepMesh` coiled bronze dragon body with alternating
 *   forged-gold & imperial-jade dorsal spine crests, clawed forelimbs, and a fierce lofted dragon head
 *   (flared snout, roaring vermilion maw, fangs, swept horns, whiskers, jade brow crest & subtle amber eyes)
 *   glaring directly into the ring (`+Z`).
 */
export function buildDragonReliefColumn(
  name: string,
  pos: V3,
  rotY = 0,
  coilSign: 1 | -1 = 1
): AuraSceneNode {
  const slots: MultiMatSlot[] = [
    // Stepped dark obsidian plinth + Attic torus/scotia base
    { mesh: transformMesh(bevelBoxMesh(0.92, 0.14, 0.92, 0.03), { pos: [0, 0.07, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.74, 0.11, 0.74, 0.025), { pos: [0, 0.195, 0] }), materialIndex: 0 },
    {
      mesh: latheMesh(
        [[0, 0.24], [0.37, 0.24], [0.39, 0.29], [0.32, 0.34], [0.35, 0.39], [0.28, 0.44], [0, 0.44]],
        20
      ),
      materialIndex: 1
    },
    // Dark sanctum-basalt entasis shaft
    {
      mesh: latheMesh(
        [[0, 0.44], [0.27, 0.44], [0.262, 1.25], [0.246, 2.1], [0.23, 2.86], [0, 2.86]],
        20
      ),
      materialIndex: 0
    },
    // Corinthian / temple bell echinus, dark obsidian abacus, gold cornice & imperial jade finial
    {
      mesh: latheMesh([[0, 2.84], [0.23, 2.84], [0.27, 2.94], [0.35, 3.07], [0.4, 3.16], [0, 3.16]], 18),
      materialIndex: 1
    },
    { mesh: transformMesh(bevelBoxMesh(0.84, 0.1, 0.84, 0.024), { pos: [0, 3.21, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.88, 0.036, 0.88, 0.01), { pos: [0, 3.275, 0] }), materialIndex: 3 },
    {
      mesh: latheMesh([[0, 3.29], [0.16, 3.31], [0.18, 3.37], [0.11, 3.46], [0.04, 3.54], [0, 3.58]], 14),
      materialIndex: 5
    }
  ];

  // 12 dark stone vertical flutes / arris ribs along the entasis shaft
  for (let f = 0; f < 12; f += 1) {
    const a = (f / 12) * Math.PI * 2;
    const sa = Math.sin(a), ca = Math.cos(a);
    slots.push({
      mesh: tubeSweepMesh(
        [
          [sa * 0.268, 0.54, ca * 0.268, 0.017],
          [sa * 0.252, 1.66, ca * 0.252, 0.015],
          [sa * 0.23, 2.74, ca * 0.23, 0.014]
        ],
        6
      ),
      materialIndex: 1
    });
  }

  // 3 vermilion-lacquer collar rings bordered by burnished gold astragals
  for (const [cy, cr] of [[0.49, 0.272], [1.62, 0.255], [2.79, 0.232]] as const) {
    slots.push(
      { mesh: latheMesh([[cr - 0.01, cy - 0.038], [cr + 0.03, cy - 0.03], [cr + 0.032, cy + 0.03], [cr - 0.01, cy + 0.038]], 20), materialIndex: 4 },
      { mesh: latheMesh([[cr - 0.006, cy - 0.05], [cr + 0.036, cy - 0.04], [cr - 0.006, cy - 0.03]], 18), materialIndex: 3 },
      { mesh: latheMesh([[cr - 0.006, cy + 0.03], [cr + 0.036, cy + 0.04], [cr - 0.006, cy + 0.05]], 18), materialIndex: 3 }
    );
  }

  // 8 carved temple acanthus volutes around the capital bell
  const voluteLeaf = extrudePolygonMesh([[0.21, 2.86], [0.31, 2.9], [0.39, 3.12], [0.34, 3.16], [0.24, 3.06]], 0.042, 0.008, true);
  for (let k = 0; k < 8; k += 1) {
    slots.push({
      mesh: transformMesh(voluteLeaf, { rot: [0, (k / 8) * Math.PI * 2, 0] }),
      materialIndex: k % 2 === 0 ? 2 : 3
    });
  }

  // 2.75-turn helical coiled bronze dragon body spiraling up the dark fluted shaft
  const ctrlCount = 25;
  const ctrlPts: V3[] = [];
  for (let i = 0; i < ctrlCount; i += 1) {
    const u = i / (ctrlCount - 1);
    if (i === ctrlCount - 1) {
      ctrlPts.push([0, 2.58, 0.37]);
    } else if (i === ctrlCount - 2) {
      ctrlPts.push([coilSign * 0.08, 2.53, 0.32]);
    } else {
      const phi = coilSign * (u - 0.92) * (2.75 * Math.PI * 2);
      const y = 0.52 + u * 2.04;
      const rs = 0.27 - u * 0.038;
      const rb = 0.024 + Math.sin(Math.pow(u, 0.65) * Math.PI * 0.88) * 0.064;
      const rc = rs + rb * 0.68;
      ctrlPts.push([Math.sin(phi) * rc, y, Math.cos(phi) * rc]);
    }
  }
  const smoothPts = catmullRomSpline3(ctrlPts, 3);
  const dragonSpine: V4[] = smoothPts.map((p, idx) => {
    const t = idx / Math.max(1, smoothPts.length - 1);
    const r = 0.022 + Math.sin(Math.pow(t, 0.62) * Math.PI * 0.86) * 0.066;
    return [p[0], p[1], p[2], r];
  });
  slots.push({ mesh: tubeSweepMesh(dragonSpine, 10), materialIndex: 2 });

  // Alternating forged-gold & imperial-jade dorsal spine ridge crests along the helix
  const dorsalFin = extrudePolygonMesh([[-0.044, -0.014], [0.046, -0.014], [0.01, 0.086], [-0.03, 0.058]], 0.018, 0.004, true);
  for (let j = 4; j < dragonSpine.length - 5; j += 3) {
    const [px, py, pz, pr] = dragonSpine[j]!;
    const az = Math.atan2(px, pz);
    const finScale = 0.56 + 0.52 * Math.sin((j / dragonSpine.length) * Math.PI);
    slots.push({
      mesh: transformMesh(dorsalFin, {
        pos: [px + Math.sin(az) * (pr * 0.8), py + 0.01, pz + Math.cos(az) * (pr * 0.8)],
        rot: [-0.26, az - coilSign * 1.2, 0],
        scale: finScale
      }),
      materialIndex: j % 2 === 0 ? 3 : 5
    });
  }

  // Clawed bronze forelimbs gripping the fluted column
  for (const [ly, side] of [[1.58, coilSign], [2.24, -coilSign]] as const) {
    const armPts = catmullRomSpline3(
      [[side * 0.26, ly, -0.06], [side * 0.31, ly - 0.04, 0.12], [side * 0.22, ly - 0.08, 0.26]],
      4
    ).map((p, idx) => [p[0], p[1], p[2], 0.042 - idx * 0.002] as V4);
    slots.push({ mesh: tubeSweepMesh(armPts, 7), materialIndex: 2 });
    for (const tc of [-0.04, 0, 0.04] as const) {
      slots.push({
        mesh: tubeSweepMesh(
          [[side * 0.22 + tc, ly - 0.08, 0.25, 0.013], [side * 0.18 + tc * 0.8, ly - 0.13, 0.28, 0.003]],
          5,
          true
        ),
        materialIndex: 3
      });
    }
  }

  // Fierce sculpted dragon head facing +Z (the ring)
  const headPose = { pos: [0, 2.58, 0.37] as V3, rot: [0.16, 0, 0] as V3 };
  const mkHeadRing = (z: number, wx: number, hy: number, yc: number): V3[] => [
    [0, yc + hy, z], [wx * 0.72, yc + hy * 0.58, z], [wx, yc, z], [wx * 0.68, yc - hy * 0.75, z],
    [0, yc - hy, z], [-wx * 0.68, yc - hy * 0.75, z], [-wx, yc, z], [-wx * 0.72, yc + hy * 0.58, z]
  ];
  const upperSkull = loftSectionsMesh(
    [
      mkHeadRing(-0.06, 0.11, 0.095, 0.03),
      mkHeadRing(0.06, 0.145, 0.105, 0.042),
      mkHeadRing(0.17, 0.096, 0.068, 0.026),
      mkHeadRing(0.29, 0.116, 0.078, 0.034),
      mkHeadRing(0.37, 0.066, 0.044, 0.04)
    ],
    true
  );
  const lowerJaw = loftSectionsMesh(
    [
      mkHeadRing(0.0, 0.1, 0.042, -0.036),
      mkHeadRing(0.13, 0.084, 0.036, -0.068),
      mkHeadRing(0.25, 0.072, 0.03, -0.096),
      mkHeadRing(0.32, 0.046, 0.022, -0.105)
    ],
    true
  );
  slots.push(
    { mesh: transformMesh(upperSkull, headPose), materialIndex: 2 },
    { mesh: transformMesh(lowerJaw, headPose), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.09, 0.024, 0.22, 0.008), { pos: [0, 2.53, 0.51], rot: [0.34, 0, 0] }), materialIndex: 4 }
  );

  // Imperial jade sagittal brow/mane crest + swept gold horns, whiskers, fangs & subtle amber eyes
  const jadeCrest = extrudePolygonMesh([[0, 0.08], [0.16, 0.1], [0.07, 0.22], [-0.09, 0.26], [-0.23, 0.18], [-0.13, 0.07]], 0.024, 0.005, true);
  slots.push({
    mesh: transformMesh(transformMesh(jadeCrest, { rot: [0, Math.PI * 0.5, 0] }), headPose),
    materialIndex: 5
  });
  for (const sx of [-1, 1] as const) {
    const hornPts = catmullRomSpline3(
      [[sx * 0.085, 0.088, 0.03], [sx * 0.16, 0.19, -0.1], [sx * 0.22, 0.3, -0.25], [sx * 0.19, 0.38, -0.35]],
      4
    ).map((p, idx, arr) => [p[0], p[1], p[2], 0.034 * (1 - (idx / arr.length) * 0.84)] as V4);
    const whiskerPts = catmullRomSpline3(
      [[sx * 0.095, 0.022, 0.27], [sx * 0.21, 0.048, 0.2], [sx * 0.29, -0.02, 0.05], [sx * 0.33, 0.025, -0.09]],
      4
    ).map((p, idx, arr) => [p[0], p[1], p[2], 0.013 * (1 - (idx / arr.length) * 0.76)] as V4);
    const fang = latheMesh([[0, 0], [0.016, 0], [0.008, 0.048], [0, 0.072]], 6, true);
    slots.push(
      { mesh: transformMesh(tubeSweepMesh(hornPts, 7), headPose), materialIndex: 3 },
      { mesh: transformMesh(tubeSweepMesh(whiskerPts, 6), headPose), materialIndex: 3 },
      { mesh: transformMesh(transformMesh(fang, { pos: [sx * 0.068, -0.01, 0.29], rot: [Math.PI, 0, 0] }), headPose), materialIndex: 3 },
      { mesh: transformMesh(transformMesh(icosphereFacetMesh(0.024, 1, 0.02, 7), { pos: [sx * 0.095, 0.052, 0.095] }), headPose), materialIndex: 6 }
    );
  }

  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.sanctumDarkMarble,
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.castTempleBronze,
      IC_MATERIALS.gildedCrownGold,
      IC_MATERIALS.vermilionLacquer,
      IC_MATERIALS.imperialJade,
      practicalGlow(`${name}-dragon-eyes`, "#ff9a2e", 0.72)
    ],
    pos,
    rotY
  );
}

export function buildMonasteryGuardianStatue(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const coilSign: 1 | -1 = pos[0] <= 0 ? 1 : -1;
  return buildDragonReliefColumn(name, pos, rotY, coilSign);
}


// ---------------------------------------------------------------------------
// 6. Crown Sanctum (`cr-*`) — Throne, Iron Crown, Goblets, Banners & Statues
// ---------------------------------------------------------------------------

export function buildSovereignThroneChair(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const armL: V4[] = catmullRomSpline3(
    [[-0.5, 0.54, -0.32], [-0.56, 0.78, 0.02], [-0.55, 0.75, 0.42], [-0.55, 0.48, 0.47]],
    5
  ).map((p) => [p[0], p[1], p[2], 0.056]);
  const armR: V4[] = armL.map(([x, y, z, r]) => [-x, y, z, r]);
  const trimL: V4[] = catmullRomSpline3(
    [[-0.5, 0.6, -0.28], [-0.56, 0.83, 0.04], [-0.55, 0.8, 0.41]],
    5
  ).map((p) => [p[0], p[1], p[2], 0.018]);
  const trimR: V4[] = trimL.map(([x, y, z, r]) => [-x, y, z, r]);

  // Openwork pointed Gothic lancet arch ribs + inner gold filigree tracery (eliminates flat house-gable slab)
  const archIronL: V4[] = catmullRomSpline3(
    [[-0.5, 1.86, -0.33], [-0.42, 2.16, -0.32], [-0.2, 2.34, -0.31], [0, 2.44, -0.31]],
    5
  ).map((p) => [p[0], p[1], p[2], 0.044]);
  const archIronR: V4[] = archIronL.map(([x, y, z, r]) => [-x, y, z, r]);
  const archGoldL: V4[] = catmullRomSpline3(
    [[-0.44, 1.82, -0.29], [-0.35, 2.08, -0.29], [-0.16, 2.25, -0.29], [0, 2.34, -0.29]],
    5
  ).map((p) => [p[0], p[1], p[2], 0.02]);
  const archGoldR: V4[] = archGoldL.map(([x, y, z, r]) => [-x, y, z, r]);

  const sideStile = latheMesh(
    [[0, 0.36], [0.085, 0.36], [0.072, 0.52], [0.062, 1.42], [0.078, 1.88], [0.095, 1.94], [0, 1.96]],
    14
  );
  const sideSpire = latheMesh([[0, 0], [0.078, 0.02], [0.046, 0.24], [0.018, 0.44], [0, 0.54]], 10, true);
  const midSpire = latheMesh([[0, 0], [0.052, 0.02], [0.03, 0.22], [0.012, 0.38], [0, 0.46]], 8, true);
  const centerSpire = latheMesh([[0, 0], [0.088, 0.03], [0.052, 0.24], [0.022, 0.42], [0, 0.52]], 12, true);

  const slots: MultiMatSlot[] = [
    // Dark forged-iron & obsidian throne base + crimson velvet apron + burnished gold filigree mouldings
    { mesh: transformMesh(bevelBoxMesh(1.24, 0.36, 0.96, 0.035), { pos: [0, 0.18, 0.05] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(1.3, 0.045, 1.02, 0.014), { pos: [0, 0.025, 0.05] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(1.26, 0.038, 0.98, 0.012), { pos: [0, 0.37, 0.05] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.84, 0.2, 0.04, 0.012), { pos: [0, 0.2, 0.53] }), materialIndex: 2 },
    // Plush deep royal crimson velvet seat cushion (top = 0.48, flush under Iron Crown cushion)
    { mesh: transformMesh(bevelBoxMesh(0.98, 0.11, 0.78, 0.038), { pos: [0, 0.425, 0.12] }), materialIndex: 2 },
    // Narrow high-back forged black-iron spine + 3 tiered tufted royal crimson velvet backrest bolsters
    { mesh: transformMesh(bevelBoxMesh(0.84, 1.4, 0.08, 0.024), { pos: [0, 1.16, -0.34] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.76, 0.38, 0.085, 0.032), { pos: [0, 0.72, -0.28] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.76, 0.38, 0.085, 0.032), { pos: [0, 1.12, -0.28] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.72, 0.38, 0.085, 0.032), { pos: [0, 1.52, -0.28] }), materialIndex: 2 },
    { mesh: transformMesh(extrudePolygonMesh([[-0.34, 1.72], [0.34, 1.72], [0.22, 2.02], [0, 2.22], [-0.22, 2.02]], 0.075, 0.02, true), { pos: [0, 0, -0.29] }), materialIndex: 2 },
    // Swept forged-iron & gold filigree armrests + baluster supports
    { mesh: tubeSweepMesh(armL, 8), materialIndex: 0 },
    { mesh: tubeSweepMesh(armR, 8), materialIndex: 0 },
    { mesh: tubeSweepMesh(trimL, 6), materialIndex: 1 },
    { mesh: tubeSweepMesh(trimR, 6), materialIndex: 1 },
    // Twin gothic buttress stiles, pointed lancet arch ribs & 5 gothic spires
    { mesh: transformMesh(sideStile, { pos: [-0.5, 0, -0.33] }), materialIndex: 0 },
    { mesh: transformMesh(sideStile, { pos: [0.5, 0, -0.33] }), materialIndex: 0 },
    { mesh: tubeSweepMesh(archIronL, 8), materialIndex: 0 },
    { mesh: tubeSweepMesh(archIronR, 8), materialIndex: 0 },
    { mesh: tubeSweepMesh(archGoldL, 7), materialIndex: 1 },
    { mesh: tubeSweepMesh(archGoldR, 7), materialIndex: 1 },
    { mesh: transformMesh(sideSpire, { pos: [-0.5, 1.95, -0.33] }), materialIndex: 0 },
    { mesh: transformMesh(sideSpire, { pos: [0.5, 1.95, -0.33] }), materialIndex: 0 },
    { mesh: transformMesh(midSpire, { pos: [-0.26, 2.1, -0.32] }), materialIndex: 1 },
    { mesh: transformMesh(midSpire, { pos: [0.26, 2.1, -0.32] }), materialIndex: 1 },
    { mesh: transformMesh(centerSpire, { pos: [0, 2.38, -0.31] }), materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.055, 0.02], [0.02, 0.16], [0, 0.22]], 10, true), { pos: [0, 2.86, -0.31] }), materialIndex: 1 },
    // Armrest gold finials & subtle recessed crimson ruby crest cabochon (emissiveIntensity <= 0.85)
    { mesh: transformMesh(icosphereFacetMesh(0.072, 1, 0.04, 9), { pos: [-0.55, 0.8, 0.45] }), materialIndex: 1 },
    { mesh: transformMesh(icosphereFacetMesh(0.072, 1, 0.04, 11), { pos: [0.55, 0.8, 0.45] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.16, 0.16, 0.04, 0.01), { pos: [0, 2.02, -0.26], rot: [0, 0, Math.PI * 0.25] }), materialIndex: 1 },
    { mesh: transformMesh(icosphereFacetMesh(0.056, 1, 0.03, 15), { pos: [0, 2.02, -0.23] }), materialIndex: 4 }
  ];

  // Burnished gold collar rings on side stiles + velvet diamond-tuft studs
  for (const sx of [-0.5, 0.5] as const) {
    for (const ry of [0.94, 1.46, 1.92] as const) {
      slots.push({
        mesh: transformMesh(latheMesh([[0.058, ry - 0.024], [0.092, ry], [0.058, ry + 0.024]], 14), { pos: [sx, 0, -0.33] }),
        materialIndex: 1
      });
    }
  }
  for (const ty of [0.92, 1.32, 1.7] as const) {
    for (const tx of [-0.18, 0.18] as const) {
      slots.push({
        mesh: transformMesh(icosphereFacetMesh(0.018, 1, 0, 5), { pos: [tx, ty, -0.235] }),
        materialIndex: 1
      });
    }
  }

  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.gildedCrownGold,
      IC_MATERIALS.royalCrimsonVelvet,
      IC_MATERIALS.sanctumDarkMarble,
      practicalGlow(`${name}-crest-gem`, "#c81d25", 0.65)
    ],
    pos,
    rotY
  );
}

export function buildIronCrownRelic(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const band = latheMesh(
    [[0.22, 0.1], [0.27, 0.1], [0.29, 0.22], [0.26, 0.26], [0.23, 0.24], [0.22, 0.12]],
    20
  );
  const slots: MultiMatSlot[] = [
    // Deep crimson velvet presentation cushion + burnished gold filigree rims
    { mesh: transformMesh(bevelBoxMesh(0.64, 0.11, 0.6, 0.042), { pos: [0, 0.055, 0] }), materialIndex: 2 },
    { mesh: band, materialIndex: 0 },
    { mesh: latheMesh([[0.27, 0.11], [0.292, 0.12], [0.292, 0.145], [0.27, 0.155]], 20), materialIndex: 1 },
    { mesh: latheMesh([[0.272, 0.185], [0.296, 0.195], [0.296, 0.22], [0.272, 0.23]], 20), materialIndex: 1 }
  ];
  for (const [tx, tz] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]] as const) {
    slots.push({ mesh: transformMesh(icosphereFacetMesh(0.04, 1, 0.04, 5), { pos: [tx, 0.05, tz] }), materialIndex: 1 });
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const spikeH = i % 2 === 0 ? 0.24 : 0.15;
    const r = 0.255;
    slots.push({
      mesh: transformMesh(latheMesh([[0, 0], [0.04, 0], [0.017, spikeH * 0.72], [0, spikeH]], 6, true), {
        pos: [Math.cos(a) * r, 0.23, Math.sin(a) * r]
      }),
      materialIndex: i % 2 === 0 ? 1 : 0
    });
    if (i % 2 === 0) {
      slots.push({
        mesh: transformMesh(icosphereFacetMesh(0.028, 1, 0.02, i + 3), { pos: [Math.cos(a) * 0.29, 0.17, Math.sin(a) * 0.29] }),
        materialIndex: 3
      });
    }
  }
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.gildedCrownGold,
      IC_MATERIALS.royalCrimsonVelvet,
      practicalGlow(`${name}-rubies`, "#d62828", 0.68)
    ],
    pos,
    rotY
  );
}

export function buildSanctumKingStatue(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const coilSign: 1 | -1 = pos[0] <= 0 ? 1 : -1;
  return buildDragonReliefColumn(name, pos, rotY, coilSign);
}

export function buildSanctumMarbleColonnade(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const col = latheMesh([[0, 0.24], [0.29, 0.24], [0.25, 0.42], [0.22, 3.62], [0.3, 3.88], [0, 3.92]], 18);
  const bannerRing: V2[] = [[-0.42, 0], [-0.42, -2.12], [0, -1.78], [0.42, -2.12], [0.42, 0]];
  const borderRing: V2[] = [[-0.46, 0.03], [-0.46, -2.18], [0, -1.83], [0.46, -2.18], [0.46, 0.03]];
  const slots: MultiMatSlot[] = [
    // Dark sanctum-obsidian base & dark entablature (replaces blown-out solid gold lintel slab)
    { mesh: transformMesh(bevelBoxMesh(2.25, 0.24, 0.86, 0.03), { pos: [0, 0.12, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(2.38, 0.28, 0.9, 0.03), { pos: [0, 4.06, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(2.44, 0.045, 0.96, 0.012), { pos: [0, 3.91, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(2.46, 0.045, 0.98, 0.012), { pos: [0, 4.22, 0] }), materialIndex: 1 },
    // Royal crimson velvet imperial banner + burnished gold border & rod
    { mesh: transformMesh(bevelBoxMesh(1.08, 0.045, 0.045, 0.01), { pos: [0, 3.8, 0.12] }), materialIndex: 1 },
    { mesh: transformMesh(extrudePolygonMesh(borderRing, 0.022, 0.005, true), { pos: [0, 3.78, 0.1] }), materialIndex: 1 },
    { mesh: transformMesh(extrudePolygonMesh(bannerRing, 0.03, 0.007, true), { pos: [0, 3.78, 0.115] }), materialIndex: 2 }
  ];
  for (const cx of [-0.74, 0.74] as const) {
    slots.push({ mesh: transformMesh(col, { pos: [cx, 0, 0] }), materialIndex: 0 });
    // Dark stone vertical flutes + vermilion & bronze relief collar rings
    for (let f = 0; f < 10; f += 1) {
      const a = (f / 10) * Math.PI * 2;
      slots.push({
        mesh: tubeSweepMesh(
          [
            [cx + Math.sin(a) * 0.248, 0.5, Math.cos(a) * 0.248, 0.015],
            [cx + Math.sin(a) * 0.222, 3.55, Math.cos(a) * 0.222, 0.013]
          ],
          5
        ),
        materialIndex: 3
      });
    }
    for (const [ry, rr] of [[0.48, 0.252], [2.05, 0.236], [3.58, 0.224]] as const) {
      slots.push(
        { mesh: transformMesh(latheMesh([[rr - 0.01, ry - 0.035], [rr + 0.028, ry - 0.026], [rr + 0.028, ry + 0.026], [rr - 0.01, ry + 0.035]], 16), { pos: [cx, 0, 0] }), materialIndex: 4 },
        { mesh: transformMesh(latheMesh([[rr - 0.005, ry - 0.046], [rr + 0.034, ry - 0.036], [rr - 0.005, ry - 0.026]], 16), { pos: [cx, 0, 0] }), materialIndex: 1 }
      );
    }
  }
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.sanctumDarkMarble,
      IC_MATERIALS.gildedCrownGold,
      IC_MATERIALS.royalCrimsonVelvet,
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.vermilionLacquer
    ],
    pos,
    rotY
  );
}

export function trophyGobletSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ic:trophy-goblet", () => {
    const cup = latheMesh(
      [
        [0, -0.5], [0.36, -0.5], [0.32, -0.4], [0.1, -0.32], [0.09, -0.06],
        [0.34, 0.12], [0.44, 0.44], [0.39, 0.48], [0.34, 0.2], [0, 0.16]
      ],
      14
    );
    const handleL = tubeSweepMesh([[-0.3, 0.12, 0, 0.04], [-0.5, 0.26, 0, 0.038], [-0.38, 0.42, 0, 0.04]], 6, true);
    const handleR = tubeSweepMesh([[0.3, 0.12, 0, 0.04], [0.5, 0.26, 0, 0.038], [0.38, 0.42, 0, 0.04]], 6, true);
    return mergeRawMeshes([cup, handleL, handleR]);
  });
}

export function crowdBodySpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ic:crowd-body-v2", () => {
    const cloakTorso = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          makeOctRing(-0.5, 0.46, 0.34),
          makeOctRing(-0.08, 0.52, 0.38, 0.02),
          makeOctRing(0.26, 0.56, 0.4, 0.02),
          makeOctRing(0.48, 0.28, 0.24)
        ],
        true
      ),
      1,
      0.48
    );
    return mergeRawMeshes([cloakTorso]);
  });
}

export function crowdHeadSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ic:crowd-head-v2", () =>
    mergeRawMeshes([
      subdivideSmoothMesh(
        latheMesh([[0, -0.5], [0.34, -0.44], [0.48, -0.08], [0.44, 0.28], [0.22, 0.48], [0, 0.5]], 10),
        1,
        0.45
      )
    ])
  );
}

export function concertTrussSpec(span: V3, bays: number, chordRadius = 0.024): AuraCustomGeometrySpec {
  return memoizeGeometry(`ic:truss:${span.join(",")}:${bays}:${chordRadius}`, () =>
    mergeRawMeshes([latticeTrussMesh({ span, bays, chordRadius })])
  );
}

// ---------------------------------------------------------------------------
// 7. Far Horizon Backdrop Geometry & Multi-Material Landmarks (`bd-*`, 10-60 m)
// ---------------------------------------------------------------------------

function mountBackdropMultiMat(
  name: string,
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  pos: V3,
  rotY = 0
): AuraSceneNode {
  return assembleMultiMaterialNode(name, slots, materials, {
    position: pos,
    rotation: [0, rotY, 0],
    castShadow: false,
    receiveShadow: false
  })
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON();
}

export function skylineTowerSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ic:skyline-tower", () =>
    mergeRawMeshes([
      transformMesh(bevelBoxMesh(1, 0.72, 1, 0.03), { pos: [0, -0.14, 0] }),
      transformMesh(bevelBoxMesh(0.74, 0.28, 0.74, 0.025), { pos: [0, 0.36, 0] })
    ])
  );
}

export function buildSkylineMegablockNode(name: string, pos: V3, height: number, rotY = 0, neon: AuraColor = "#3fe0ff"): AuraSceneNode {
  const w = height * 0.34;
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(w, height * 0.78, w * 0.84, 0.08), { pos: [0, height * 0.39, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(w * 0.72, height * 0.22, w * 0.64, 0.06), { pos: [0, height * 0.88, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0, 0], [w * 0.14, 0], [w * 0.14, height * 0.08], [0, height * 0.09]], 10), { pos: [w * 0.16, height * 0.99, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(w * 0.78, 0.42, 0.12, 0.02), { pos: [0, height * 0.62, w * 0.43] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(w * 0.56, 0.36, 0.12, 0.02), { pos: [0, height * 0.86, w * 0.33] }), materialIndex: 2 }
  ];
  return mountBackdropMultiMat(name, slots, [IC_MATERIALS.forgedBlackIron, IC_MATERIALS.weatheredGantrySteel, practicalGlow(`${name}-band`, neon, 0.95)], pos, rotY);
}

export function buildFarDockBoatNode(name: string, pos: V3, length: number, rotY = 0): AuraSceneNode {
  const hw = length * 0.18;
  const hh = length * 0.12;
  const hull = loftSectionsMesh(
    [
      [[0, hh * 0.9, length * 0.5], [0.06, 0, length * 0.44], [-0.06, 0, length * 0.44]],
      [[-hw, hh, length * 0.12], [hw, hh, length * 0.12], [hw * 0.7, 0, length * 0.12], [-hw * 0.7, 0, length * 0.12]],
      [[-hw * 0.9, hh * 0.88, -length * 0.44], [hw * 0.9, hh * 0.88, -length * 0.44], [hw * 0.65, 0, -length * 0.44], [-hw * 0.65, 0, -length * 0.44]]
    ],
    true,
    true
  );
  const slots: MultiMatSlot[] = [
    { mesh: hull, materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(hw * 1.15, hh * 1.15, length * 0.26, 0.04), { pos: [0, hh * 1.45, -length * 0.06] }), materialIndex: 1 },
    { mesh: tubeSweepMesh([[0, hh * 0.9, length * 0.24, 0.06], [0, hh * 3.6, length * 0.24, 0.04]], 6, true), materialIndex: 1 }
  ];
  return mountBackdropMultiMat(name, slots, [IC_MATERIALS.oiledCedarTimber, IC_MATERIALS.weatheredGantrySteel], pos, rotY);
}

export function buildFarHarbourCraneNode(name: string, pos: V3, height: number, rotY = 0): AuraSceneNode {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(latticeTrussMesh({ span: [height * 0.14, height * 0.86, height * 0.14], bays: 6, chordRadius: 0.08 }), { pos: [0, height * 0.43, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [height * 0.72, height * 0.09, height * 0.1], bays: 6, chordRadius: 0.065 }), { pos: [height * 0.16, height * 0.88, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(height * 0.16, height * 0.1, height * 0.14, 0.05), { pos: [-height * 0.16, height * 0.88, 0] }), materialIndex: 1 }
  ];
  return mountBackdropMultiMat(name, slots, [IC_MATERIALS.weatheredGantrySteel, IC_MATERIALS.rustedGirderIron], pos, rotY);
}

export function buildFarDockWarehouseNode(name: string, pos: V3, width: number, rotY = 0): AuraSceneNode {
  const h = width * 0.34;
  const d = width * 0.42;
  const gable: V2[] = [[-width * 0.52, 0], [width * 0.52, 0], [0, h * 0.36]];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(width, h, d, 0.08), { pos: [0, h * 0.5, 0] }), materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(gable, d * 1.04, 0.04, true), { pos: [0, h, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(width * 0.18, h * 0.54, 0.14, 0.02), { pos: [-width * 0.24, h * 0.28, d * 0.51] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(width * 0.18, h * 0.54, 0.14, 0.02), { pos: [width * 0.24, h * 0.28, d * 0.51] }), materialIndex: 2 }
  ];
  return mountBackdropMultiMat(name, slots, [IC_MATERIALS.forgedBlackIron, IC_MATERIALS.castTempleBronze, practicalGlow(`${name}-door`, "#ffb04a", 0.9)], pos, rotY);
}

export function colosseumArcadePierSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ic:colosseum-pier", () =>
    mergeRawMeshes([
      bevelBoxMesh(1, 0.88, 1, 0.04),
      transformMesh(bevelBoxMesh(1.22, 0.12, 1.14, 0.02), { pos: [0, 0.44, 0] })
    ])
  );
}

export function buildFarAirbaseHangarNode(name: string, pos: V3, span: number, rotY = 0): AuraSceneNode {
  const r = span * 0.32;
  const depth = span * 0.68;
  const arch: V2[] = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI;
    return [Math.cos(a) * r, Math.sin(a) * r * 0.78] as V2;
  });
  const slots: MultiMatSlot[] = [
    { mesh: extrudePolygonMesh(arch, depth, 0.05, true), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(r * 1.32, r * 0.52, 0.16, 0.02), { pos: [0, r * 0.26, depth * 0.51] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(r * 1.4, 0.18, 0.18, 0.02), { pos: [0, r * 0.55, depth * 0.52] }), materialIndex: 2 }
  ];
  return mountBackdropMultiMat(name, slots, [IC_MATERIALS.weatheredGantrySteel, IC_MATERIALS.forgedBlackIron, practicalGlow(`${name}-apron`, "#ffb03c", 0.9)], pos, rotY);
}

export function desertMesaSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ic:desert-mesa", () =>
    mergeRawMeshes([stratifiedCliffMesh({ radiusX: 0.5, radiusZ: 0.5, height: 1, terraces: 5, seed: 83 })])
  );
}

export function alpineRidgeSpec(seed = 97): AuraCustomGeometrySpec {
  return memoizeGeometry(`ic:alpine-ridge:${seed}`, () =>
    mergeRawMeshes([stratifiedCliffMesh({ radiusX: 0.5, radiusZ: 0.5, height: 1, terraces: 6, seed })])
  );
}

// ---------------------------------------------------------------------------
// 8. Articulated Armored Gladiators & Knights (`WP-05` / `WP-09` Fighter Rigs)
// ---------------------------------------------------------------------------

export type GladiatorArchetypeId = "kenji" | "volt" | "boulder" | "seraph" | "jinx" | "sovereign";

export type GladiatorPoseClip =
  | "idle"
  | "walk"
  | "jump"
  | "dash"
  | "crouch"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "throw"
  | "hitstun"
  | "ko"
  | "win";

export const GLADIATOR_JOINT_SUFFIXES = [
  "hips",
  "torso",
  "head",
  "shoulder-l",
  "elbow-l",
  "shoulder-r",
  "elbow-r",
  "weapon",
  "shield",
  "hip-l",
  "knee-l",
  "ankle-l",
  "hip-r",
  "knee-r",
  "ankle-r"
] as const;

export type GladiatorJointSuffix = (typeof GLADIATOR_JOINT_SUFFIXES)[number];

export interface GladiatorRigOptions {
  readonly nodeId: string;
  readonly label: string;
  readonly fighterId?: GladiatorArchetypeId;
  readonly side: "p1" | "cpu";
  readonly position: V3;
  readonly yaw: number;
  readonly scale: number;
  readonly primaryColor: string;
  readonly accentEmissive: string;
  readonly roughness: number;
  readonly metallic: number;
  readonly lacquer?: boolean;
  readonly surfaceExtras?: boolean;
  readonly runtimeTags?: readonly string[];
}

export interface GladiatorPoseState {
  readonly clip: GladiatorPoseClip;
  /** Monotonic animation clock in seconds. */
  readonly time: number;
  /** 0..1 normalized progress through non-looping attack/hitstun/ko clip. */
  readonly clipProgress?: number;
  /** Signed locomotion direction relative to facing (+1 advance, -1 retreat, 0 stationary). */
  readonly moveDir?: number;
  /** Upper-body layered attack kind when walking/dashing during an attack. */
  readonly layerAttack?: "light" | "heavy" | "special" | "throw" | null;
  /** 0..1 normalized progress through the upper-body layered attack. */
  readonly layerProgress?: number;
}

interface ArchetypeBuild {
  readonly chestWidth: number;
  readonly chestDepth: number;
  readonly waistWidth: number;
  readonly pauldronScale: number;
  readonly limbScale: number;
  readonly trimHex: string;
  readonly clothP1Hex: string;
  readonly clothP2Hex: string;
  readonly skinHex: string;
  readonly hairHex: string;
  readonly leatherP1Hex: string;
  readonly leatherP2Hex: string;
}

const ARCHETYPE_BUILDS: Readonly<Record<GladiatorArchetypeId, ArchetypeBuild>> = {
  kenji: {
    chestWidth: 0.206,
    chestDepth: 0.144,
    waistWidth: 0.146,
    pauldronScale: 1.0,
    limbScale: 1.0,
    trimHex: "#c99a42",
    clothP1Hex: "#1e1716",
    clothP2Hex: "#66171d",
    skinHex: "#c88d6a",
    hairHex: "#18151a",
    leatherP1Hex: "#2e2018",
    leatherP2Hex: "#4a1e1c"
  },
  volt: {
    chestWidth: 0.188,
    chestDepth: 0.136,
    waistWidth: 0.132,
    pauldronScale: 0.95,
    limbScale: 0.96,
    trimHex: "#8fb6db",
    clothP1Hex: "#182233",
    clothP2Hex: "#591b28",
    skinHex: "#ba7f5e",
    hairHex: "#20171c",
    leatherP1Hex: "#283958",
    leatherP2Hex: "#6e212e"
  },
  boulder: {
    chestWidth: 0.256,
    chestDepth: 0.184,
    waistWidth: 0.188,
    pauldronScale: 1.24,
    limbScale: 1.18,
    trimHex: "#c4843a",
    clothP1Hex: "#6e1c1a",
    clothP2Hex: "#1e3a61",
    skinHex: "#b67a58",
    hairHex: "#291d16",
    leatherP1Hex: "#3b2418",
    leatherP2Hex: "#2e221b"
  },
  seraph: {
    chestWidth: 0.19,
    chestDepth: 0.136,
    waistWidth: 0.132,
    pauldronScale: 0.98,
    limbScale: 0.95,
    trimHex: "#dab34b",
    clothP1Hex: "#1c505e",
    clothP2Hex: "#7c1f30",
    skinHex: "#dfb093",
    hairHex: "#16151c",
    leatherP1Hex: "#3d281c",
    leatherP2Hex: "#472226"
  },
  jinx: {
    chestWidth: 0.18,
    chestDepth: 0.128,
    waistWidth: 0.126,
    pauldronScale: 0.92,
    limbScale: 0.92,
    trimHex: "#b8bed4",
    clothP1Hex: "#3b1e54",
    clothP2Hex: "#6c1939",
    skinHex: "#ad7456",
    hairHex: "#cdc8de",
    leatherP1Hex: "#23192c",
    leatherP2Hex: "#361a28"
  },
  sovereign: {
    chestWidth: 0.232,
    chestDepth: 0.166,
    waistWidth: 0.162,
    pauldronScale: 1.18,
    limbScale: 1.08,
    trimHex: "#e0aa36",
    clothP1Hex: "#78131f",
    clothP2Hex: "#35184c",
    skinHex: "#201d28",
    hairHex: "#120f18",
    leatherP1Hex: "#2b1b16",
    leatherP2Hex: "#24192b"
  }
};

function smoothMesh(src: RawMesh, passes = 4): RawMesh {
  return passes > 0 ? taubinSmoothMesh(src, passes, 0.48, -0.505) : src;
}

/**
 * Applies zenithal linear RGBA vertex shading + deep `0.26` crevice/pocket ambient occlusion
 * so every garment pleat, muscle belly, hair lock, and forged trim reads cleanly with rich depth.
 */
function finishArmorMesh(src: RawMesh, aoStrength = 0.26, zenithLift = 0.08): RawMesh {
  if (src.positions.length === 0 || src.indices.length === 0) return src;
  if (src.colors && src.colors.length >= (src.positions.length / 3) * 4) {
    return bakeMeshCavityAO(src, aoStrength);
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < src.positions.length; i += 3) {
    const y = src.positions[i]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.025, maxY - minY);
  const painted = paintMeshColors(
    src,
    (pos, norm) => {
      const [x, y, z] = pos;
      const [, ny] = norm;
      const h = (y - minY) / spanY;
      const sky = Math.max(0, ny) * 0.045;
      const seed =
        (Math.round(x * 180) * 73856093) ^
        (Math.round(y * 180) * 19349663) ^
        (Math.round(z * 180) * 83492791);
      const grain = (hash01(seed) - 0.5) * 0.022;
      const g = Math.max(0.84, Math.min(1.04, 1.0 - zenithLift * 0.58 + zenithLift * h + sky + grain));
      return [g, g, g, 1] as V4;
    },
    false
  );
  return bakeMeshCavityAO(painted, aoStrength);
}

function makeOctRing(y: number, wx: number, dz: number, zBias = 0): V3[] {
  return [
    [0, y, dz + zBias],
    [wx * 0.74, y, dz * 0.72 + zBias],
    [wx, y, zBias],
    [wx * 0.72, y, -dz * 0.74 + zBias],
    [0, y, -dz + zBias],
    [-wx * 0.72, y, -dz * 0.74 + zBias],
    [-wx, y, zBias],
    [-wx * 0.74, y, dz * 0.72 + zBias]
  ];
}

function makeFlutedRing(
  y: number,
  wx: number,
  dz: number,
  zBias = 0,
  opts: {
    readonly segments?: number;
    readonly flutes?: number;
    readonly fluteAmp?: number;
    readonly frontKeel?: number;
    readonly backTaper?: number;
  } = {}
): V3[] {
  const segs = opts.segments ?? 18;
  const flutes = opts.flutes ?? 0;
  const fluteAmp = opts.fluteAmp ?? 0;
  const frontKeel = opts.frontKeel ?? 0;
  const backTaper = opts.backTaper ?? 1;
  const ring: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const sinA = Math.sin(a);
    const cosA = Math.cos(a);
    const frontFactor = Math.max(0, cosA);
    const backFactor = Math.max(0, -cosA);
    const keel = frontKeel * Math.pow(frontFactor, 3);
    const ripple = flutes > 0 ? fluteAmp * Math.cos(a * flutes) : 0;
    const xScale = 1 - backFactor * (1 - backTaper) * 0.5 + ripple;
    const zScale = 1 + keel + ripple;
    ring.push([sinA * wx * xScale, y, cosA * dz * zScale + zBias]);
  }
  return ring;
}

interface CurvedShellStation {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly zBias?: number;
  readonly arcHalfAngle: number;
  readonly centerAngle?: number;
  readonly keel?: number;
  readonly fluteCount?: number;
  readonly fluteAmp?: number;
}

function sculptCurvedShell(
  stations: readonly CurvedShellStation[],
  thickness = 0.01,
  arcSamples = 11,
  smoothIter = 1
): RawMesh {
  const buildLoop = (st: CurvedShellStation, th: number, yShift = 0): V3[] => {
    const cAngle = st.centerAngle ?? 0;
    const outer: V3[] = [];
    const inner: V3[] = [];
    for (let i = 0; i < arcSamples; i += 1) {
      const u = i / Math.max(1, arcSamples - 1);
      const localA = (u * 2 - 1) * st.arcHalfAngle;
      const a = cAngle + localA;
      const edgeFade = Math.sin(u * Math.PI);
      const keelPush = (st.keel ?? 0) * Math.pow(Math.max(0, 1 - Math.abs(u * 2 - 1)), 1.6);
      const flutePush =
        (st.fluteCount ?? 0) > 0
          ? (st.fluteAmp ?? 0) * Math.cos(localA * (st.fluteCount ?? 0)) * edgeFade
          : 0;
      const sx = Math.sin(a);
      const cz = Math.cos(a);
      const ox = sx * (st.rx + keelPush * 0.35 + flutePush);
      const oz = cz * (st.rz + keelPush + flutePush) + (st.zBias ?? 0);
      const ix = sx * Math.max(0.004, st.rx - th + keelPush * 0.2);
      const iz = cz * Math.max(0.004, st.rz - th + keelPush * 0.75) + (st.zBias ?? 0);
      outer.push([ox, st.y + yShift, oz]);
      inner.push([ix, st.y + yShift, iz]);
    }
    inner.reverse();
    return [...outer, ...inner];
  };

  const first = stations[0]!;
  const last = stations[stations.length - 1]!;
  const rings: V3[][] = [
    buildLoop(first, thickness * 0.18, -0.002),
    ...stations.map((st) => buildLoop(st, thickness, 0)),
    buildLoop(last, thickness * 0.18, 0.002)
  ];
  const raw = loftSectionsMesh(rings, false);
  const sub = smoothIter > 0 ? subdivideSmoothMesh(raw, smoothIter, 0.44) : raw;
  return smoothMesh(sub, 3);
}

function sculptDiamondBladeMesh(
  spine: readonly V4[],
  thicknessRatio = 0.24,
  widthAxis: "y" | "x" = "y"
): RawMesh {
  const rings: V3[][] = spine.map(([px, py, pz, hw], idx) => {
    const w = Math.max(0.0015, hw);
    const th = Math.max(0.001, w * thicknessRatio * (idx === spine.length - 1 ? 0.35 : 1));
    const shoulder = w * 0.56;
    if (widthAxis === "y") {
      return [
        [px, py + w, pz],
        [px + th, py + shoulder, pz],
        [px + th * 1.18, py, pz],
        [px + th, py - shoulder, pz],
        [px, py - w, pz],
        [px - th, py - shoulder, pz],
        [px - th * 1.18, py, pz],
        [px - th, py + shoulder, pz]
      ];
    }
    return [
      [px + w, py, pz],
      [px + shoulder, py + th, pz],
      [px, py + th * 1.18, pz],
      [px - shoulder, py + th, pz],
      [px - w, py, pz],
      [px - shoulder, py - th, pz],
      [px, py - th * 1.18, pz],
      [px + shoulder, py - th, pz]
    ];
  });
  return loftSectionsMesh(rings, true);
}

function sculptPleatedClothPanel(opts: {
  readonly yTop: number;
  readonly yBottom: number;
  readonly topHalfWidth: number;
  readonly bottomHalfWidth: number;
  readonly zOffset: number;
  readonly flareZ: number;
  readonly pleatCount?: number;
  readonly pleatDepth?: number;
  readonly pointDrop?: number;
  readonly thickness?: number;
}): RawMesh {
  const cols = 10;
  const rows = 6;
  const pleats = opts.pleatCount ?? 4;
  const pleatAmp = opts.pleatDepth ?? 0.011;
  const th = opts.thickness ?? 0.008;
  const zSign = opts.zOffset >= 0 ? 1 : -1;
  const rings: V3[][] = [];

  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    const hw = opts.topHalfWidth + (opts.bottomHalfWidth - opts.topHalfWidth) * Math.pow(v, 0.85);
    const drapeZ = opts.zOffset + opts.flareZ * Math.pow(v, 1.35);
    const frontRow: V3[] = [];
    const backRow: V3[] = [];
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      const sx = u * 2 - 1;
      const point = (opts.pointDrop ?? 0.05) * Math.max(0, 1 - Math.abs(sx) * 1.25) * Math.pow(v, 1.4);
      const y = opts.yTop + (opts.yBottom - opts.yTop) * v - point;
      const wave = Math.cos(sx * Math.PI * pleats) * pleatAmp * (0.25 + 0.75 * v);
      const archZ = (1 - sx * sx) * 0.012 * zSign;
      const x = sx * hw;
      const zFront = drapeZ + archZ + wave * zSign;
      const zBack = zFront - th * zSign;
      frontRow.push([x, y, zFront]);
      backRow.push([x, y, zBack]);
    }
    backRow.reverse();
    rings.push([...frontRow, ...backRow]);
  }
  return smoothMesh(subdivideSmoothMesh(loftSectionsMesh(rings, true), 1, 0.42), 3);
}

function forgedRivetMesh(pos: V3, radius = 0.0085): RawMesh {
  return transformMesh(icosphereSmoothMesh(radius, 1), {
    pos,
    scale: [1, 0.72, 1]
  });
}

function sculptHumanHeadSlots(opts: {
  readonly radius: number;
  readonly jawTaper: number;
  readonly cheekFullness: number;
  readonly noseBridge: number;
  readonly browRidge: number;
  readonly seed: number;
  readonly neckWidth?: number;
  readonly browTilt?: number;
}): MultiMatSlot[] {
  const r = opts.radius;
  const nw = opts.neckWidth ?? 0.052;
  const tilt = opts.browTilt ?? 0.14;

  const neck = smoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, -0.036, -0.006], rx: nw * 1.18, rz: nw * 1.22 },
        { pos: [0, 0.015, -0.003], rx: nw * 1.02, rz: nw * 1.06 },
        { pos: [0, 0.068, 0.002], rx: nw * 0.96, rz: nw * 1.0 },
        { pos: [0, 0.112, 0.004], rx: nw * 0.92, rz: nw * 0.95 }
      ],
      { ringPoints: 16, muscleBiasZ: -0.004, peakT: 0.35 }
    ),
    3
  );

  const cranium = transformMesh(
    smoothMesh(
      sculptStylizedHeadMesh(r, {
        jawTaper: opts.jawTaper,
        cheekFullness: opts.cheekFullness,
        noseBridge: opts.noseBridge,
        browRidge: opts.browRidge,
        subdivisions: 2,
        seed: opts.seed
      }),
      3
    ),
    { pos: [0, 0.142, 0.008] }
  );

  const lips = transformMesh(
    smoothMesh(subdivideSmoothMesh(bevelBoxMesh(r * 0.42, r * 0.12, r * 0.18, r * 0.04), 1, 0.48), 3),
    { pos: [0, 0.095, r * 0.92 + 0.006] }
  );

  const slots: MultiMatSlot[] = [
    { mesh: neck, materialIndex: 2 },
    { mesh: cranium, materialIndex: 2 },
    { mesh: lips, materialIndex: 2 }
  ];

  for (const sx of [-1, 1] as const) {
    const ear = transformMesh(
      smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.016, 0.044, 0.028, 0.006), 1, 0.48), 3),
      { pos: [sx * (r * 0.93), 0.138, -0.004], rot: [0, -sx * 0.22, sx * 0.08] }
    );
    const browLock = sculptCurvedHairLockMesh({
      root: [sx * 0.014, 0.165, r * 0.95 + 0.008],
      mid: [sx * 0.036, 0.168 + Math.abs(tilt) * 0.018, r * 0.91 + 0.008],
      tip: [sx * 0.056, 0.163, r * 0.78 + 0.006],
      width: 0.011,
      thickness: 0.006,
      segments: 6,
      radialSegments: 6
    });
    const iris = transformMesh(icosphereSmoothMesh(0.0105, 1), {
      pos: [sx * 0.033, 0.148, r * 0.88 + 0.008],
      scale: [1.18, 0.72, 0.52]
    });
    slots.push(
      { mesh: ear, materialIndex: 2 },
      { mesh: browLock, materialIndex: 7 },
      { mesh: iris, materialIndex: 8 }
    );
  }
  return slots;
}

/**
 * 9-slot archetype-authentic physical material library:
 *   0: Primary garment / jacket / gi / robe / plate (`fabric`, grounded `pbr`, or `brushedMetal` + tamed Fresnel `rim`)
 *   1: Forged brass / gold / alloy trim, buckles, coronets & spear rings (`studioMetal`)
 *   2: Warm human skin (`pbr` subsurface sheen) or Sovereign chainmaille undersuit
 *   3: Secondary cloth: obi belt, sports tank, loincloth, monastery stole, scarf, or royal velvet cape (`fabric`)
 *   4: Martial hand/ankle cotton wraps (`kenji`/`volt`) or honed Damascus weapon steel (`studioMetal`)
 *   5: Oiled leather straps, padded pro boxing gloves, grips & boots (`pbr`)
 *   6: Tamed practical accent (`practical: true`, `emissiveIntensity: 0.36` — kinetic piping, headband pin, visor bars)
 *   7: Sculpted hair locks, braided beard, shinobi bangs, or obsidian inlay
 *   8: Crisp dark facial features (eyes/lashes) & rubber boot outsoles
 */
function buildGladiatorMaterials(opts: GladiatorRigOptions): readonly AuraMaterialSpec[] {
  const fighterId = opts.fighterId ?? "kenji";
  const b = ARCHETYPE_BUILDS[fighterId];
  const rimSpec =
    opts.surfaceExtras !== false
      ? { rim: { color: opts.accentEmissive, power: 3.6, intensity: 0.28 } }
      : {};

  const clothHex = opts.side === "p1" ? b.clothP1Hex : b.clothP2Hex;
  const clothSheen = opts.side === "p1" ? "#6d8fb8" : "#c46e68";
  const trimColor = opts.side === "p1" ? b.trimHex : "#d68d38";
  const leatherColor = opts.side === "p1" ? b.leatherP1Hex : b.leatherP2Hex;

  // 0: Primary garment / armor surface — matte cotton gi, grounded dockside jacket, monastery silk, or Sovereign plate
  const primaryMat: AuraMaterialSpec = opts.lacquer
    ? material.lacquer({
        name: `${opts.nodeId}-primary-lacquer`,
        color: opts.primaryColor,
        roughness: Math.max(0.34, Math.min(0.56, opts.roughness)),
        clearcoat: 0.48,
        clearcoatRoughness: 0.24,
        ...rimSpec
      } as any)
    : fighterId === "sovereign"
      ? material.brushedMetal({
          name: `${opts.nodeId}-primary-plate`,
          color: opts.primaryColor,
          roughness: Math.max(0.32, Math.min(0.46, opts.roughness)),
          anisotropy: 0.3,
          ...rimSpec
        } as any)
      : fighterId === "kenji" || fighterId === "seraph" || fighterId === "jinx"
        ? material.fabric({
            name: `${opts.nodeId}-primary-garment`,
            color: opts.primaryColor,
            roughness: Math.max(0.72, opts.roughness),
            sheen: 0.32,
            sheenColor: fighterId === "kenji" ? "#6ebbb5" : fighterId === "seraph" ? "#f5ebd6" : "#8c6cd6",
            sheenRoughness: 0.74,
            ...rimSpec
          } as any)
        : material.pbr({
            name: `${opts.nodeId}-primary-athletic`,
            color: opts.primaryColor,
            roughness: Math.max(0.5, opts.roughness),
            metallic: fighterId === "boulder" ? 0.24 : 0.08,
            clearcoat: 0,
            sheen: 0.24,
            sheenColor: fighterId === "volt" ? "#4e7db3" : "#9c7352",
            sheenRoughness: 0.68,
            ...rimSpec
          } as any);

  // 1: Forged brass / gold / alloy trim
  const trimMat = material.studioMetal({
    name: `${opts.nodeId}-trim-metal`,
    color: trimColor,
    roughness: 0.28
  });

  // 2: Warm human skin (or Sovereign darkened chainmaille)
  const skinOrMailleMat: AuraMaterialSpec =
    fighterId === "sovereign"
      ? material.brushedMetal({
          name: `${opts.nodeId}-maille-undersuit`,
          color: b.skinHex,
          roughness: 0.52,
          anisotropy: 0.22
        })
      : material.pbr({
          name: `${opts.nodeId}-human-skin`,
          color: b.skinHex,
          roughness: 0.56,
          metallic: 0.0,
          clearcoat: 0,
          sheen: 0.22,
          sheenColor: "#ffcab2",
          sheenRoughness: 0.74
        });

  // 3: Secondary woven cloth (obi belt, tank top, kilt, stole, scarf, velvet cape)
  const secondaryClothMat = material.fabric({
    name: `${opts.nodeId}-secondary-cloth`,
    color: clothHex,
    roughness: 0.84,
    sheen: 0.42,
    sheenColor: clothSheen,
    sheenRoughness: 0.72
  });

  // 4: Martial cotton hand/ankle wraps (`kenji`, `volt`) OR honed weapon steel
  const wrapOrSteelMat: AuraMaterialSpec =
    fighterId === "kenji" || fighterId === "volt"
      ? material.fabric({
          name: `${opts.nodeId}-martial-wraps`,
          color: fighterId === "kenji" ? "#cfc8ba" : "#bac7d6",
          roughness: 0.88,
          sheen: 0.18,
          sheenColor: "#e8e4dc",
          sheenRoughness: 0.82
        })
      : material.studioMetal({
          name: `${opts.nodeId}-weapon-steel`,
          color: "#cfd8e3",
          roughness: 0.2
        });

  // 5: Padded pro boxing glove leather (`volt`) or oiled war-leather
  const leatherMat = material.pbr({
    name: `${opts.nodeId}-leather`,
    color: leatherColor,
    roughness: fighterId === "volt" ? 0.46 : 0.7,
    metallic: 0.04,
    clearcoat: fighterId === "volt" ? 0.14 : 0,
    clearcoatRoughness: 0.36
  });

  // 6: Tamed practical accent (`practical: true` satisfies `emissive-fill` audit without bloom washout)
  const accentGlowMat = material.pbr({
    name: `${opts.nodeId}-practical-accent`,
    color: opts.accentEmissive,
    emissive: opts.accentEmissive,
    emissiveIntensity: fighterId === "sovereign" ? 0.48 : 0.34,
    roughness: 0.32,
    metallic: 0.1,
    practical: true
  });

  // 7: Sculpted hair locks, braided beard, or obsidian inlay
  const hairOrInlayMat: AuraMaterialSpec =
    fighterId === "sovereign"
      ? material.brushedMetal({
          name: `${opts.nodeId}-obsidian-inlay`,
          color: b.hairHex,
          roughness: 0.36,
          anisotropy: 0.26
        })
      : material.pbr({
          name: `${opts.nodeId}-sculpted-hair`,
          color: b.hairHex,
          roughness: 0.64,
          metallic: 0.02,
          sheen: 0.34,
          sheenColor: fighterId === "jinx" ? "#e8e2ff" : "#444c61",
          sheenRoughness: 0.62
        });

  // 8: Crisp dark eyes, brows & rubber boot outsoles
  const darkFeatureMat = material.pbr({
    name: `${opts.nodeId}-dark-detail`,
    color: "#151218",
    roughness: 0.54,
    metallic: 0.02
  });

  return [
    primaryMat,
    trimMat,
    skinOrMailleMat,
    secondaryClothMat,
    wrapOrSteelMat,
    leatherMat,
    accentGlowMat,
    hairOrInlayMat,
    darkFeatureMat
  ];
}

function buildPelvisSlots(fighterId: GladiatorArchetypeId, b: ArchetypeBuild): MultiMatSlot[] {
  const w = b.waistWidth;
  switch (fighterId) {
    case "kenji": {
      // Storm Karateka: Draped lower karate `uwagi` gi skirt + thick cinched cotton `obi` belt + 3D square knot + hanging sash tails
      const giHipSkirt = sculptDrapedGarmentMesh(
        [
          { y: -0.21, rx: w * 1.24, rz: 0.156, z: 0.004, folds: 7, foldAmp: 0.011, superellipseN: 2.3 },
          { y: -0.11, rx: w * 1.16, rz: 0.146, z: 0.004, folds: 7, foldAmp: 0.009, superellipseN: 2.3 },
          { y: -0.01, rx: w * 1.04, rz: 0.132, z: 0.003, folds: 6, foldAmp: 0.006, superellipseN: 2.2 },
          { y: 0.085, rx: w * 0.98, rz: 0.124, z: 0.002, folds: 5, foldAmp: 0.004, superellipseN: 2.2 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      );
      const obiBeltWrap = sculptDrapedGarmentMesh(
        [
          { y: 0.015, rx: w * 1.11, rz: 0.142, z: 0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.4 },
          { y: 0.052, rx: w * 1.13, rz: 0.146, z: 0.005, folds: 4, foldAmp: 0.003, superellipseN: 2.4 },
          { y: 0.088, rx: w * 1.1, rz: 0.14, z: 0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.4 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      );
      const obiKnot = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.084, 0.068, 0.052, 0.018), 1, 0.48), 3),
        { pos: [0, 0.048, 0.156], rot: [0.06, 0, 0.08] }
      );
      const obiTailL = sculptCurvedHairLockMesh({
        root: [-0.018, 0.036, 0.166],
        mid: [-0.068, -0.115, 0.184],
        tip: [-0.098, -0.285, 0.172],
        width: 0.046,
        thickness: 0.014,
        segments: 9,
        radialSegments: 8
      });
      const obiTailR = sculptCurvedHairLockMesh({
        root: [0.022, 0.034, 0.166],
        mid: [0.078, -0.135, 0.182],
        tip: [0.112, -0.325, 0.168],
        width: 0.046,
        thickness: 0.014,
        segments: 9,
        radialSegments: 8
      });
      const stitchTag = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.038, 0.016, 0.016, 0.004), 1, 0.44), 2),
        { pos: [0.098, -0.265, 0.174], rot: [0.08, 0, -0.22] }
      );
      return [
        { mesh: giHipSkirt, materialIndex: 0 },
        { mesh: obiBeltWrap, materialIndex: 3 },
        { mesh: obiKnot, materialIndex: 3 },
        { mesh: obiTailL, materialIndex: 3 },
        { mesh: obiTailR, materialIndex: 3 },
        { mesh: stitchTag, materialIndex: 1 }
      ];
    }

    case "volt": {
      // Rushdown Boxer: High-waisted sculpted boxer trunks pelvis + wide ribbed championship waistband + dockside utility belt
      const boxerPelvis = sculptDrapedGarmentMesh(
        [
          { y: -0.11, rx: w * 1.06, rz: 0.128, z: 0.002, folds: 6, foldAmp: 0.005, superellipseN: 2.2 },
          { y: -0.02, rx: w * 1.08, rz: 0.132, z: 0.003, folds: 6, foldAmp: 0.004, superellipseN: 2.2 },
          { y: 0.065, rx: w * 1.0, rz: 0.122, z: 0.003, folds: 4, foldAmp: 0.003, superellipseN: 2.2 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const waistband = sculptDrapedGarmentMesh(
        [
          { y: 0.024, rx: w * 1.07, rz: 0.134, z: 0.004, folds: 8, foldAmp: 0.002, superellipseN: 2.3 },
          { y: 0.088, rx: w * 1.03, rz: 0.128, z: 0.004, folds: 8, foldAmp: 0.002, superellipseN: 2.3 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const beltBuckle = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.086, 0.048, 0.022, 0.007), 1, 0.45), 3),
        { pos: [0, 0.056, 0.136] }
      );
      const cyanPiping = tubeSweepMesh(
        [
          [-w * 0.92, 0.086, 0.068, 0.0045],
          [0, 0.088, 0.134, 0.005],
          [w * 0.92, 0.086, 0.068, 0.0045]
        ],
        6,
        true
      );
      const hipPouch = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.048, 0.082, 0.068, 0.012), 1, 0.46), 3),
        { pos: [-w * 1.08, -0.015, 0.02], rot: [0, 0, -0.12] }
      );
      return [
        { mesh: boxerPelvis, materialIndex: 0 },
        { mesh: waistband, materialIndex: 3 },
        { mesh: beltBuckle, materialIndex: 1 },
        { mesh: cyanPiping, materialIndex: 6 },
        { mesh: hipPouch, materialIndex: 5 }
      ];
    }

    case "boulder": {
      // Iron Grappler: Heavy colosseum championship leather belt, forged bronze lion-medallion buckle & armored `subligaculum` kilt
      const kiltBase = sculptDrapedGarmentMesh(
        [
          { y: -0.24, rx: w * 1.2, rz: 0.168, z: 0.004, folds: 8, foldAmp: 0.012, superellipseN: 2.3 },
          { y: -0.11, rx: w * 1.12, rz: 0.156, z: 0.004, folds: 8, foldAmp: 0.009, superellipseN: 2.3 },
          { y: 0.02, rx: w * 1.02, rz: 0.144, z: 0.003, folds: 6, foldAmp: 0.005, superellipseN: 2.2 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      );
      const champBelt = sculptDrapedGarmentMesh(
        [
          { y: 0.005, rx: w * 1.12, rz: 0.156, z: 0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.4 },
          { y: 0.095, rx: w * 1.1, rz: 0.152, z: 0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.4 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      );
      const lionMedallion = transformMesh(
        smoothMesh(latheMesh([[0, 0], [0.072, 0], [0.076, 0.018], [0.048, 0.032], [0, 0.036]], 18), 2),
        { pos: [0, 0.052, 0.152], rot: [Math.PI * 0.5, 0, 0] }
      );
      const frontPteruges = sculptPleatedClothPanel({
        yTop: 0.015,
        yBottom: -0.28,
        topHalfWidth: w * 0.52,
        bottomHalfWidth: w * 0.68,
        zOffset: 0.164,
        flareZ: 0.028,
        pleatCount: 4,
        pleatDepth: 0.008,
        pointDrop: 0.04
      });
      return [
        { mesh: kiltBase, materialIndex: 5 },
        { mesh: champBelt, materialIndex: 0 },
        { mesh: lionMedallion, materialIndex: 1 },
        { mesh: frontPteruges, materialIndex: 3 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.016, 1), { pos: [0, 0.052, 0.186], scale: [1, 1.2, 0.55] }),
          materialIndex: 6
        }
      ];
    }

    case "seraph": {
      // Spear Saint: Flowing layered Himalayan monastery robe skirt + wide silk waist cummerbund + long temple tabard stoles
      const robeSkirt = sculptDrapedGarmentMesh(
        [
          { y: -0.31, rx: w * 1.34, rz: 0.172, z: 0.002, folds: 8, foldAmp: 0.014, superellipseN: 2.2 },
          { y: -0.16, rx: w * 1.18, rz: 0.152, z: 0.003, folds: 8, foldAmp: 0.011, superellipseN: 2.2 },
          { y: -0.02, rx: w * 1.04, rz: 0.134, z: 0.003, folds: 6, foldAmp: 0.006, superellipseN: 2.2 },
          { y: 0.085, rx: w * 0.98, rz: 0.126, z: 0.002, folds: 5, foldAmp: 0.004, superellipseN: 2.2 }
        ],
        { ringPoints: 24, capEnds: true, smoothPasses: 4 }
      );
      const cummerbund = sculptDrapedGarmentMesh(
        [
          { y: 0.012, rx: w * 1.1, rz: 0.142, z: 0.004, folds: 6, foldAmp: 0.003, superellipseN: 2.3 },
          { y: 0.092, rx: w * 1.06, rz: 0.136, z: 0.004, folds: 6, foldAmp: 0.003, superellipseN: 2.3 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      );
      const frontStole = sculptPleatedClothPanel({
        yTop: 0.032,
        yBottom: -0.36,
        topHalfWidth: w * 0.48,
        bottomHalfWidth: w * 0.66,
        zOffset: 0.152,
        flareZ: 0.038,
        pleatCount: 4,
        pleatDepth: 0.009,
        pointDrop: 0.055
      });
      const lotusClasp = transformMesh(
        smoothMesh(latheMesh([[0, 0], [0.044, 0], [0.048, 0.014], [0.024, 0.024], [0, 0.026]], 16), 2),
        { pos: [0, 0.055, 0.142], rot: [Math.PI * 0.5, 0, 0] }
      );
      return [
        { mesh: robeSkirt, materialIndex: 0 },
        { mesh: cummerbund, materialIndex: 3 },
        { mesh: frontStole, materialIndex: 3 },
        { mesh: lotusClasp, materialIndex: 1 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.014, 1), { pos: [0, 0.055, 0.166], scale: [0.9, 1.25, 0.55] }),
          materialIndex: 6
        }
      ];
    }

    case "jinx": {
      // The Trickster: Agile shinobi waist wrap, knotted purple sash, asymmetric hip drape & kunai thigh holster
      const stealthPelvis = sculptDrapedGarmentMesh(
        [
          { y: -0.14, rx: w * 1.08, rz: 0.13, z: 0.002, folds: 6, foldAmp: 0.007, superellipseN: 2.2 },
          { y: -0.02, rx: w * 1.04, rz: 0.126, z: 0.002, folds: 6, foldAmp: 0.005, superellipseN: 2.2 },
          { y: 0.08, rx: w * 0.98, rz: 0.118, z: 0.002, folds: 5, foldAmp: 0.004, superellipseN: 2.2 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const shinobiSash = sculptDrapedGarmentMesh(
        [
          { y: 0.018, rx: w * 1.12, rz: 0.136, z: 0.003, folds: 5, foldAmp: 0.004, superellipseN: 2.3 },
          { y: 0.086, rx: w * 1.08, rz: 0.132, z: 0.003, folds: 5, foldAmp: 0.004, superellipseN: 2.3 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const sideSashTail = sculptCurvedHairLockMesh({
        root: [w * 1.04, 0.042, 0.035],
        mid: [w * 1.28, -0.12, 0.02],
        tip: [w * 1.38, -0.3, -0.02],
        width: 0.052,
        thickness: 0.014,
        segments: 8,
        radialSegments: 8
      });
      const smokePouch = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.046, 0.074, 0.064, 0.012), 1, 0.46), 3),
        { pos: [-w * 1.08, 0.02, 0.04], rot: [0, 0.25, -0.14] }
      );
      const ringBuckle = transformMesh(
        latheMesh([[0.018, -0.008], [0.032, -0.008], [0.032, 0.008], [0.018, 0.008]], 16),
        { pos: [0.025, 0.052, 0.138], rot: [Math.PI * 0.5, 0, 0] }
      );
      return [
        { mesh: stealthPelvis, materialIndex: 0 },
        { mesh: shinobiSash, materialIndex: 3 },
        { mesh: sideSashTail, materialIndex: 3 },
        { mesh: smokePouch, materialIndex: 5 },
        { mesh: ringBuckle, materialIndex: 1 }
      ];
    }

    case "sovereign": {
      // Sovereign: Smooth-faired obsidian/gold royal pelvis, cinched war-belt, velvet tabards & overlapping tassets
      const pelvisCore = smoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              makeFlutedRing(-0.095, w * 0.92, 0.112, 0, { segments: 16 }),
              makeFlutedRing(-0.015, w * 1.02, 0.122, 0.003, { segments: 16 }),
              makeFlutedRing(0.085, w * 0.96, 0.118, 0.004, { segments: 16 })
            ],
            true
          ),
          1,
          0.46
        ),
        3
      );
      const leatherBelt = latheMesh(
        [
          [w * 0.96, 0.026],
          [w * 1.1, 0.03],
          [w * 1.11, 0.076],
          [w * 0.96, 0.082]
        ],
        20
      );
      const tabardFront = sculptPleatedClothPanel({
        yTop: 0.032,
        yBottom: -0.35,
        topHalfWidth: w * 0.56,
        bottomHalfWidth: w * 0.74,
        zOffset: 0.142,
        flareZ: 0.036,
        pleatCount: 4,
        pleatDepth: 0.009,
        pointDrop: 0.055
      });
      const tabardBack = sculptPleatedClothPanel({
        yTop: 0.032,
        yBottom: -0.4,
        topHalfWidth: w * 0.62,
        bottomHalfWidth: w * 0.84,
        zOffset: -0.14,
        flareZ: -0.042,
        pleatCount: 5,
        pleatDepth: 0.01,
        pointDrop: 0.05
      });
      const slots: MultiMatSlot[] = [
        { mesh: pelvisCore, materialIndex: 2 },
        { mesh: leatherBelt, materialIndex: 5 },
        {
          mesh: transformMesh(smoothMesh(bevelBoxMesh(0.088, 0.072, 0.028, 0.01), 2), { pos: [0, 0.054, 0.142] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.018, 1), { pos: [0, 0.054, 0.156], scale: [1.1, 1.35, 0.55] }),
          materialIndex: 6
        },
        { mesh: tabardFront, materialIndex: 3 },
        { mesh: tabardBack, materialIndex: 3 }
      ];
      for (const sx of [-1, 1] as const) {
        const cAngle = sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        slots.push(
          {
            mesh: sculptCurvedShell(
              [
                { y: -0.18, rx: w * 1.22, rz: 0.148, arcHalfAngle: 0.74, centerAngle: cAngle, keel: 0.016, fluteCount: 3, fluteAmp: 0.005 },
                { y: 0.028, rx: w * 1.08, rz: 0.132, arcHalfAngle: 0.68, centerAngle: cAngle, keel: 0.01 }
              ],
              0.009,
              11,
              1
            ),
            materialIndex: 0
          },
          { mesh: forgedRivetMesh([sx * (w * 1.18), -0.04, 0.052], 0.008), materialIndex: 1 }
        );
      }
      return slots;
    }
  }
}

function buildTorsoSlots(fighterId: GladiatorArchetypeId, b: ArchetypeBuild): MultiMatSlot[] {
  const cw = b.chestWidth;
  const cd = b.chestDepth;
  const ww = b.waistWidth;

  switch (fighterId) {
    case "kenji": {
      // Storm Karateka: Bare muscular upper chest/clavicles visible inside smooth draped open-lapel `uwagi` karate gi!
      const muscularChest = smoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, 0.02, 0], rx: ww * 0.88, rz: cd * 0.78 },
            { pos: [0, 0.18, 0.006], rx: cw * 0.88, rz: cd * 0.86, zOffset: 0.008 },
            { pos: [0, 0.32, 0.012], rx: cw * 0.94, rz: cd * 0.94, zOffset: 0.014 },
            { pos: [0, 0.43, 0.002], rx: cw * 0.52, rz: cd * 0.62 }
          ],
          { ringPoints: 18, muscleBiasZ: 0.012, peakT: 0.68 }
        ),
        4
      );
      // Draped sleeveless/short-shoulder karate gi tunic (`sculptDrapedGarmentMesh`)
      const giTunic = deformMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.015, rx: ww * 1.04, rz: cd * 0.94, z: 0.004, folds: 7, foldAmp: 0.007, superellipseN: 2.25 },
            { y: 0.12, rx: ww * 1.09, rz: cd * 1.02, z: 0.008, folds: 8, foldAmp: 0.008, superellipseN: 2.25 },
            { y: 0.27, rx: cw * 1.08, rz: cd * 1.1, z: 0.012, folds: 8, foldAmp: 0.009, superellipseN: 2.3 },
            { y: 0.39, rx: cw * 1.04, rz: cd * 1.0, z: 0.006, folds: 6, foldAmp: 0.006, superellipseN: 2.2 },
            { y: 0.455, rx: cw * 0.56, rz: cd * 0.66, z: -0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.1 }
          ],
          { ringPoints: 24, capEnds: true, smoothPasses: 4 }
        ),
        ([x, y, z]) => {
          // Carve authentic V-neck chest opening on front (+Z) above sternum (`y > 0.24`) so muscular skin chest shows cleanly!
          const vOpen = Math.max(0, (y - 0.21) / 0.25) * Math.max(0, 1 - Math.abs(x) / (cw * 0.44));
          const zRecess = z > 0.04 ? vOpen * 0.046 : 0;
          return [x, y, z - zRecess];
        }
      );
      // Crossed heavy quilted `eri` karate gi lapels (left lapel crossing cleanly over right lapel!)
      const lapelLeft = sculptCurvedHairLockMesh({
        root: [cw * 0.42, 0.445, cd * 0.52],
        mid: [cw * 0.14, 0.265, cd * 1.15],
        tip: [-ww * 0.22, 0.035, cd * 0.99],
        width: 0.046,
        thickness: 0.016,
        segments: 10,
        radialSegments: 8
      });
      const lapelRight = sculptCurvedHairLockMesh({
        root: [-cw * 0.42, 0.445, cd * 0.52],
        mid: [-cw * 0.16, 0.275, cd * 1.11],
        tip: [ww * 0.12, 0.065, cd * 0.95],
        width: 0.044,
        thickness: 0.014,
        segments: 10,
        radialSegments: 8
      });
      const backCollarBand = sculptCurvedShell(
        [
          { y: 0.415, rx: cw * 0.54, rz: cd * 0.68, zBias: -0.006, arcHalfAngle: Math.PI * 0.68, centerAngle: Math.PI },
          { y: 0.478, rx: cw * 0.48, rz: cd * 0.62, zBias: -0.008, arcHalfAngle: Math.PI * 0.64, centerAngle: Math.PI }
        ],
        0.012,
        11,
        1
      );
      return [
        { mesh: muscularChest, materialIndex: 2 },
        { mesh: giTunic, materialIndex: 0 },
        { mesh: lapelRight, materialIndex: 0 },
        { mesh: lapelLeft, materialIndex: 0 },
        { mesh: backCollarBand, materialIndex: 0 },
        // Small embroidered storm-crest badge on left gi chest
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.026, 0], [0.028, 0.006], [0, 0.008]], 14),
            { pos: [cw * 0.46, 0.305, cd * 1.02], rot: [Math.PI * 0.48, 0.26, 0] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(
            tubeSweepMesh([[-cw * 0.4, 0.43, cd * 0.55, 0.005], [0, 0.19, cd * 1.14, 0.005]], 5, true),
            { pos: [0, 0, 0] }
          ),
          materialIndex: 3
        }
      ];
    }

    case "volt": {
      // Rushdown Boxer: Toned athletic midriff + dark compression sports tank + sculpted cropped dockside bomber jacket with collar & zip!
      const tonedMidriff = smoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, -0.015, 0], rx: ww * 0.94, rz: cd * 0.84 },
            { pos: [0, 0.11, 0.005], rx: ww * 0.92, rz: cd * 0.84, zOffset: 0.006 },
            { pos: [0, 0.24, 0.01], rx: cw * 0.88, rz: cd * 0.9, zOffset: 0.01 },
            { pos: [0, 0.43, 0], rx: cw * 0.46, rz: cd * 0.54 }
          ],
          { ringPoints: 18, muscleBiasZ: 0.008, peakT: 0.62 }
        ),
        4
      );
      const compressionTank = sculptDrapedGarmentMesh(
        [
          { y: 0.125, rx: ww * 0.96, rz: cd * 0.88, z: 0.005, folds: 6, foldAmp: 0.003, superellipseN: 2.2 },
          { y: 0.265, rx: cw * 0.96, rz: cd * 1.02, z: 0.012, folds: 6, foldAmp: 0.004, superellipseN: 2.2 },
          { y: 0.415, rx: cw * 0.68, rz: cd * 0.74, z: 0.004, folds: 4, foldAmp: 0.002, superellipseN: 2.1 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      // Cropped dockside bomber/boxer vest-jacket (`y = 0.17..0.44`) leaving athletic midriff strip visible (`y = 0.08..0.17`)
      const croppedBomber = deformMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.17, rx: ww * 1.08, rz: cd * 0.98, z: 0.004, folds: 8, foldAmp: 0.006, superellipseN: 2.3 },
            { y: 0.285, rx: cw * 1.09, rz: cd * 1.1, z: 0.01, folds: 7, foldAmp: 0.007, superellipseN: 2.3 },
            { y: 0.395, rx: cw * 1.04, rz: cd * 0.98, z: 0.004, folds: 6, foldAmp: 0.005, superellipseN: 2.2 },
            { y: 0.448, rx: cw * 0.58, rz: cd * 0.68, z: -0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.1 }
          ],
          { ringPoints: 22, capEnds: true, smoothPasses: 4 }
        ),
        ([x, y, z]) => {
          // Open front bomber zipper gap (`|x| < 0.045, z > 0`) so inner dark compression tank & zipper trim read crisply
          const frontGap = z > 0.04 && Math.abs(x) < 0.048 ? (1 - Math.abs(x) / 0.048) * 0.026 : 0;
          return [x, y, z - frontGap];
        }
      );
      const upturnedCollar = sculptCurvedShell(
        [
          { y: 0.425, rx: cw * 0.56, rz: cd * 0.72, zBias: -0.004, arcHalfAngle: Math.PI * 0.76, centerAngle: Math.PI },
          { y: 0.505, rx: cw * 0.62, rz: cd * 0.78, zBias: -0.008, arcHalfAngle: Math.PI * 0.72, centerAngle: Math.PI }
        ],
        0.012,
        11,
        1
      );
      const slots: MultiMatSlot[] = [
        { mesh: tonedMidriff, materialIndex: 2 },
        { mesh: compressionTank, materialIndex: 3 },
        { mesh: croppedBomber, materialIndex: 0 },
        { mesh: upturnedCollar, materialIndex: 0 }
      ];
      for (const sx of [-1, 1] as const) {
        // Metallic bomber zipper rails + subtle electric-cyan shoulder seam piping
        slots.push(
          {
            mesh: tubeSweepMesh(
              [
                [sx * 0.036, 0.175, cd * 0.98, 0.0055],
                [sx * 0.042, 0.305, cd * 1.11, 0.006],
                [sx * 0.068, 0.435, cd * 0.74, 0.0055]
              ],
              6,
              true
            ),
            materialIndex: 1
          },
          {
            mesh: tubeSweepMesh(
              [
                [sx * cw * 0.42, 0.445, 0.02, 0.0048],
                [sx * cw * 0.98, 0.385, 0.01, 0.005]
              ],
              6,
              true
            ),
            materialIndex: 6
          }
        );
      }
      return slots;
    }

    case "boulder": {
      // Iron Grappler: Massive bare anatomical colosseum chest, traps & lats + riveted leather/bronze crossed harness & dire-fur mantle!
      const powerhouseTorso = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.015, rx: ww * 0.98, rz: cd * 0.88, z: 0.002, folds: 4, foldAmp: 0.005, superellipseN: 2.3 },
            { y: 0.125, rx: ww * 1.06, rz: cd * 0.96, z: 0.008, folds: 6, foldAmp: 0.007, superellipseN: 2.35 },
            { y: 0.275, rx: cw * 1.08, rz: cd * 1.1, z: 0.018, folds: 4, foldAmp: 0.009, superellipseN: 2.4 },
            { y: 0.395, rx: cw * 1.02, rz: cd * 1.0, z: 0.008, folds: 4, foldAmp: 0.006, superellipseN: 2.3 },
            { y: 0.468, rx: cw * 0.58, rz: cd * 0.68, z: -0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.1 }
          ],
          { ringPoints: 24, capEnds: true, smoothPasses: 4 }
        ),
        3
      );
      const harnessBeltL = tubeSweepMesh(
        [
          [cw * 0.84, 0.42, 0.02, 0.024],
          [cw * 0.36, 0.3, cd * 1.12, 0.026],
          [0, 0.21, cd * 1.18, 0.026],
          [-ww * 0.88, 0.03, cd * 0.62, 0.024],
          [-cw * 0.42, 0.26, -cd * 1.02, 0.024],
          [cw * 0.84, 0.42, -0.02, 0.024]
        ],
        8,
        true
      );
      const harnessBeltR = tubeSweepMesh(
        [
          [-cw * 0.82, 0.41, 0.02, 0.02],
          [0, 0.21, cd * 1.17, 0.022],
          [ww * 0.88, 0.03, cd * 0.62, 0.02]
        ],
        7,
        true
      );
      const chestPhalera = transformMesh(
        smoothMesh(latheMesh([[0, 0], [0.068, 0], [0.072, 0.018], [0.042, 0.032], [0, 0.036]], 18), 2),
        { pos: [0, 0.215, cd * 1.16], rot: [Math.PI * 0.48, 0, 0] }
      );
      const furMantle = sculptDrapedGarmentMesh(
        [
          { y: 0.34, rx: cw * 1.14, rz: cd * 1.08, z: -0.032, folds: 10, foldAmp: 0.016, superellipseN: 2.2 },
          { y: 0.435, rx: cw * 1.02, rz: cd * 1.0, z: -0.03, folds: 9, foldAmp: 0.014, superellipseN: 2.2 },
          { y: 0.485, rx: cw * 0.68, rz: cd * 0.74, z: -0.024, folds: 7, foldAmp: 0.01, superellipseN: 2.1 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      );
      return [
        { mesh: powerhouseTorso, materialIndex: 2 },
        { mesh: harnessBeltL, materialIndex: 0 },
        { mesh: harnessBeltR, materialIndex: 5 },
        { mesh: chestPhalera, materialIndex: 1 },
        { mesh: furMantle, materialIndex: 7 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.018, 1), { pos: [0, 0.215, cd * 1.195], scale: [1, 1, 0.55] }),
          materialIndex: 6
        }
      ];
    }

    case "seraph": {
      // Spear Saint: Serene clavicles + inner teal silk collar + flowing ivory crossed monastery robe (`sculptDrapedGarmentMesh`) + temple mantle
      const neckChestSkin = smoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, 0.28, 0.008], rx: cw * 0.52, rz: cd * 0.62 },
            { pos: [0, 0.44, 0.002], rx: cw * 0.42, rz: cd * 0.52 }
          ],
          { ringPoints: 16 }
        ),
        3
      );
      const innerSilkRobe = sculptDrapedGarmentMesh(
        [
          { y: 0.22, rx: cw * 0.88, rz: cd * 0.96, z: 0.008, folds: 6, foldAmp: 0.004, superellipseN: 2.2 },
          { y: 0.42, rx: cw * 0.62, rz: cd * 0.72, z: 0.004, folds: 6, foldAmp: 0.004, superellipseN: 2.2 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const outerMonkRobe = sculptDrapedGarmentMesh(
        [
          { y: -0.015, rx: ww * 1.04, rz: cd * 0.96, z: 0.004, folds: 8, foldAmp: 0.008, superellipseN: 2.2 },
          { y: 0.14, rx: ww * 1.08, rz: cd * 1.04, z: 0.008, folds: 8, foldAmp: 0.009, superellipseN: 2.25 },
          { y: 0.295, rx: cw * 1.06, rz: cd * 1.1, z: 0.012, folds: 8, foldAmp: 0.009, superellipseN: 2.25 },
          { y: 0.415, rx: cw * 0.96, rz: cd * 0.96, z: 0.004, folds: 6, foldAmp: 0.006, superellipseN: 2.2 },
          { y: 0.462, rx: cw * 0.54, rz: cd * 0.64, z: -0.004, folds: 4, foldAmp: 0.003, superellipseN: 2.1 }
        ],
        { ringPoints: 24, capEnds: true, smoothPasses: 4 }
      );
      const crossedGoldLapel = sculptCurvedHairLockMesh({
        root: [cw * 0.38, 0.45, cd * 0.54],
        mid: [cw * 0.08, 0.28, cd * 1.15],
        tip: [-ww * 0.42, 0.04, cd * 0.98],
        width: 0.036,
        thickness: 0.012,
        segments: 9,
        radialSegments: 8
      });
      const backStole = sculptPleatedClothPanel({
        yTop: 0.42,
        yBottom: -0.34,
        topHalfWidth: cw * 0.68,
        bottomHalfWidth: cw * 0.96,
        zOffset: -cd * 1.04,
        flareZ: -0.075,
        pleatCount: 5,
        pleatDepth: 0.012,
        pointDrop: 0.065
      });
      return [
        { mesh: neckChestSkin, materialIndex: 2 },
        { mesh: innerSilkRobe, materialIndex: 3 },
        { mesh: outerMonkRobe, materialIndex: 0 },
        { mesh: crossedGoldLapel, materialIndex: 1 },
        { mesh: backStole, materialIndex: 3 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.015, 1), { pos: [0, 0.34, cd * 1.15], scale: [0.9, 1.2, 0.55] }),
          materialIndex: 6
        }
      ];
    }

    case "jinx": {
      // The Trickster: Sleek asymmetric shinobi stealth vest, wrapped collar scarf with trailing tail & diagonal kunai bandolier
      const stealthVest = sculptDrapedGarmentMesh(
        [
          { y: -0.015, rx: ww * 1.02, rz: cd * 0.92, z: 0.002, folds: 6, foldAmp: 0.006, superellipseN: 2.2 },
          { y: 0.145, rx: ww * 1.06, rz: cd * 1.0, z: 0.006, folds: 7, foldAmp: 0.007, superellipseN: 2.25 },
          { y: 0.295, rx: cw * 1.05, rz: cd * 1.08, z: 0.01, folds: 7, foldAmp: 0.007, superellipseN: 2.25 },
          { y: 0.415, rx: cw * 0.94, rz: cd * 0.94, z: 0.004, folds: 6, foldAmp: 0.005, superellipseN: 2.2 },
          { y: 0.465, rx: cw * 0.54, rz: cd * 0.64, z: -0.002, folds: 4, foldAmp: 0.003, superellipseN: 2.1 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 4 }
      );
      const cowlScarf = sculptDrapedGarmentMesh(
        [
          { y: 0.365, rx: cw * 0.92, rz: cd * 0.98, z: 0.006, folds: 7, foldAmp: 0.008, superellipseN: 2.2 },
          { y: 0.455, rx: cw * 0.72, rz: cd * 0.82, z: 0.004, folds: 7, foldAmp: 0.007, superellipseN: 2.2 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const scarfStreamer = sculptCurvedHairLockMesh({
        root: [-cw * 0.24, 0.39, -cd * 0.88],
        mid: [-cw * 0.46, 0.16, -cd * 1.28],
        tip: [-cw * 0.62, -0.18, -cd * 1.48],
        width: 0.068,
        thickness: 0.014,
        segments: 9,
        radialSegments: 8
      });
      const bandolier = tubeSweepMesh(
        [
          [cw * 0.78, 0.41, cd * 0.6, 0.016],
          [0, 0.23, cd * 1.15, 0.017],
          [-ww * 0.84, 0.04, cd * 0.64, 0.015]
        ],
        7,
        true
      );
      const slots: MultiMatSlot[] = [
        { mesh: stealthVest, materialIndex: 0 },
        { mesh: cowlScarf, materialIndex: 3 },
        { mesh: scarfStreamer, materialIndex: 3 },
        { mesh: bandolier, materialIndex: 5 }
      ];
      for (const [kx, ky, kz] of [
        [0.055, 0.295, cd * 1.15],
        [-0.015, 0.225, cd * 1.17]
      ] as const) {
        slots.push(
          {
            mesh: transformMesh(smoothMesh(bevelBoxMesh(0.022, 0.068, 0.022, 0.005), 2), {
              pos: [kx, ky, kz],
              rot: [0, 0, -0.52]
            }),
            materialIndex: 1
          },
          {
            mesh: transformMesh(icosphereSmoothMesh(0.009, 1), { pos: [kx, ky, kz + 0.014] }),
            materialIndex: 6
          }
        );
      }
      return slots;
    }

    case "sovereign": {
      // Sovereign: Smooth-faired gilded-obsidian plate cuirass + royal crimson velvet cape-mantle + crown chain of office
      const underDoublet = smoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              makeFlutedRing(-0.02, ww * 0.88, cd * 0.78, 0, { segments: 16 }),
              makeFlutedRing(0.18, cw * 0.84, cd * 0.82, 0.006, { segments: 16 }),
              makeFlutedRing(0.45, cw * 0.48, cd * 0.54, 0, { segments: 16 })
            ],
            true
          ),
          1,
          0.46
        ),
        3
      );
      const cuirassShell = smoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              makeFlutedRing(0.015, ww * 0.98, cd * 0.88, 0.002, { segments: 20, flutes: 6, fluteAmp: 0.014, frontKeel: 0.08 }),
              makeFlutedRing(0.165, cw * 0.98, cd * 1.02, 0.014, { segments: 20, flutes: 8, fluteAmp: 0.016, frontKeel: 0.14 }),
              makeFlutedRing(0.305, cw * 1.09, cd * 1.12, 0.022, { segments: 20, flutes: 8, fluteAmp: 0.014, frontKeel: 0.14, backTaper: 0.92 }),
              makeFlutedRing(0.405, cw * 0.96, cd * 0.94, 0.01, { segments: 20, flutes: 6, fluteAmp: 0.01 }),
              makeFlutedRing(0.455, cw * 0.56, cd * 0.64, 0.0, { segments: 20 })
            ],
            true
          ),
          1,
          0.48
        ),
        4
      );
      const gorgetCollar = smoothMesh(
        latheMesh(
          [
            [cw * 0.36, 0.415],
            [cw * 0.66, 0.405],
            [cw * 0.68, 0.435],
            [cw * 0.52, 0.482],
            [cw * 0.36, 0.492]
          ],
          20
        ),
        2
      );
      const sternumSpine = tubeSweepMesh(
        [
          [0, 0.035, cd * 0.98, 0.011],
          [0, 0.19, cd * 1.18, 0.014],
          [0, 0.31, cd * 1.26, 0.016],
          [0, 0.425, cd * 0.96, 0.011]
        ],
        7,
        true
      );
      const royalCape = sculptPleatedClothPanel({
        yTop: 0.415,
        yBottom: -0.54,
        topHalfWidth: cw * 0.94,
        bottomHalfWidth: cw * 1.36,
        zOffset: -cd * 1.08,
        flareZ: -0.13,
        pleatCount: 6,
        pleatDepth: 0.015,
        pointDrop: 0.075,
        thickness: 0.01
      });
      return [
        { mesh: underDoublet, materialIndex: 2 },
        { mesh: cuirassShell, materialIndex: 0 },
        { mesh: gorgetCollar, materialIndex: 1 },
        { mesh: sternumSpine, materialIndex: 1 },
        { mesh: royalCape, materialIndex: 3 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.022, 1), { pos: [0, 0.315, cd * 1.26], scale: [0.95, 1.2, 0.55] }),
          materialIndex: 6
        },
        {
          mesh: tubeSweepMesh(
            [
              [-cw * 0.62, 0.385, cd * 0.96, 0.011],
              [0, 0.285, cd * 1.28, 0.013],
              [cw * 0.62, 0.385, cd * 0.96, 0.011]
            ],
            7,
            true
          ),
          materialIndex: 1
        }
      ];
    }
  }
}

function buildVisoredHelmSlots(
  fighterId: GladiatorArchetypeId,
  _b: ArchetypeBuild,
  side: "p1" | "cpu"
): MultiMatSlot[] {
  const sideBias = side === "p1" ? 1 : -1;

  switch (fighterId) {
    case "kenji": {
      // KENJI ("Storm Karateka"): Sculpted human martial-artist head + wind-swept dark hair crown & locks + tied `hachimaki` headband with trailing tails!
      const slots = sculptHumanHeadSlots({
        radius: 0.104,
        jawTaper: 0.24,
        cheekFullness: 0.08,
        noseBridge: 0.24,
        browRidge: 0.18,
        seed: 101,
        neckWidth: 0.056,
        browTilt: 0.18
      });

      const hairCrown = transformMesh(
        smoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.145, rx: 0.104, rz: 0.112, z: -0.012, folds: 8, foldAmp: 0.004, superellipseN: 2.1 },
              { y: 0.215, rx: 0.108, rz: 0.116, z: -0.008, folds: 9, foldAmp: 0.005, superellipseN: 2.1 },
              { y: 0.268, rx: 0.072, rz: 0.082, z: -0.01, folds: 7, foldAmp: 0.004, superellipseN: 2.0 }
            ],
            { ringPoints: 20, capEnds: true, smoothPasses: 3 }
          ),
          3
        ),
        { pos: [0, 0, 0] }
      );
      slots.push({ mesh: hairCrown, materialIndex: 7 });

      const hairLocks: readonly { root: V3; mid: V3; tip: V3; w: number }[] = [
        { root: [0, 0.252, 0.035], mid: [0.018 * sideBias, 0.325, 0.01], tip: [0.035 * sideBias, 0.365, -0.045], w: 0.038 },
        { root: [-0.045, 0.242, 0.025], mid: [-0.075, 0.305, -0.015], tip: [-0.095, 0.342, -0.075], w: 0.034 },
        { root: [0.045, 0.242, 0.025], mid: [0.078, 0.308, -0.015], tip: [0.1, 0.345, -0.072], w: 0.034 },
        { root: [0, 0.245, -0.045], mid: [0.012 * sideBias, 0.312, -0.105], tip: [0.02 * sideBias, 0.348, -0.155], w: 0.042 },
        { root: [-0.068, 0.205, -0.035], mid: [-0.108, 0.238, -0.095], tip: [-0.118, 0.245, -0.148], w: 0.032 },
        { root: [0.068, 0.205, -0.035], mid: [0.108, 0.238, -0.095], tip: [0.118, 0.245, -0.148], w: 0.032 },
        { root: [-0.028, 0.228, 0.088], mid: [-0.046, 0.212, 0.118], tip: [-0.064, 0.186, 0.116], w: 0.024 },
        { root: [0.024, 0.228, 0.088], mid: [0.044, 0.214, 0.118], tip: [0.062, 0.188, 0.115], w: 0.024 }
      ];
      for (const lk of hairLocks) {
        slots.push({
          mesh: sculptCurvedHairLockMesh({
            root: lk.root,
            mid: lk.mid,
            tip: lk.tip,
            width: lk.w,
            thickness: lk.w * 0.42,
            segments: 8,
            radialSegments: 7
          }),
          materialIndex: 7
        });
      }

      const hachimakiBand = sculptDrapedGarmentMesh(
        [
          { y: 0.176, rx: 0.108, rz: 0.116, z: 0.004, folds: 6, foldAmp: 0.002, superellipseN: 2.15 },
          { y: 0.212, rx: 0.109, rz: 0.117, z: 0.004, folds: 6, foldAmp: 0.002, superellipseN: 2.15 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      );
      const headbandKnot = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.044, 0.038, 0.036, 0.01), 1, 0.48), 3),
        { pos: [0, 0.192, -0.118] }
      );
      const tailUpper = sculptCurvedHairLockMesh({
        root: [0.008 * sideBias, 0.194, -0.125],
        mid: [0.065 * sideBias, 0.175, -0.225],
        tip: [0.115 * sideBias, 0.125, -0.325],
        width: 0.032,
        thickness: 0.009,
        segments: 9,
        radialSegments: 7
      });
      const tailLower = sculptCurvedHairLockMesh({
        root: [-0.008 * sideBias, 0.188, -0.125],
        mid: [-0.042 * sideBias, 0.132, -0.215],
        tip: [-0.072 * sideBias, 0.055, -0.295],
        width: 0.03,
        thickness: 0.009,
        segments: 9,
        radialSegments: 7
      });
      const browCrestPlate = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.056, 0.024, 0.014, 0.004), 1, 0.45), 2),
        { pos: [0, 0.194, 0.12] }
      );
      slots.push(
        { mesh: hachimakiBand, materialIndex: 3 },
        { mesh: headbandKnot, materialIndex: 3 },
        { mesh: tailUpper, materialIndex: 3 },
        { mesh: tailLower, materialIndex: 3 },
        { mesh: browCrestPlate, materialIndex: 1 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.0075, 1), { pos: [0, 0.194, 0.128], scale: [1.3, 0.8, 0.5] }),
          materialIndex: 6
        }
      );
      return slots;
    }

    case "volt": {
      // VOLT ("Rushdown Boxer"): Fierce athletic female boxer head + sleek swept dockside undercut hair locks + athletic sweatband & comm-cuff!
      const slots = sculptHumanHeadSlots({
        radius: 0.1,
        jawTaper: 0.3,
        cheekFullness: 0.12,
        noseBridge: 0.2,
        browRidge: 0.1,
        seed: 202,
        neckWidth: 0.048,
        browTilt: 0.16
      });

      const undercutBase = sculptDrapedGarmentMesh(
        [
          { y: 0.145, rx: 0.098, rz: 0.108, z: -0.012, folds: 6, foldAmp: 0.002, superellipseN: 2.05 },
          { y: 0.222, rx: 0.102, rz: 0.112, z: -0.008, folds: 7, foldAmp: 0.003, superellipseN: 2.05 },
          { y: 0.268, rx: 0.068, rz: 0.078, z: -0.008, folds: 6, foldAmp: 0.003, superellipseN: 2.0 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      slots.push({ mesh: undercutBase, materialIndex: 7 });

      const sweepDir = sideBias;
      const voltLocks: readonly { root: V3; mid: V3; tip: V3; w: number }[] = [
        { root: [-0.035 * sweepDir, 0.252, 0.042], mid: [0.025 * sweepDir, 0.335, 0.02], tip: [0.088 * sweepDir, 0.368, -0.048], w: 0.042 },
        { root: [-0.015 * sweepDir, 0.258, 0.01], mid: [0.052 * sweepDir, 0.342, -0.025], tip: [0.112 * sweepDir, 0.352, -0.095], w: 0.04 },
        { root: [0.015 * sweepDir, 0.248, 0.048], mid: [0.075 * sweepDir, 0.285, 0.045], tip: [0.116 * sweepDir, 0.215, 0.032], w: 0.034 },
        { root: [0.028 * sweepDir, 0.242, 0.012], mid: [0.092 * sweepDir, 0.268, -0.012], tip: [0.124 * sweepDir, 0.188, -0.028], w: 0.034 },
        { root: [0, 0.248, -0.038], mid: [0.038 * sweepDir, 0.318, -0.098], tip: [0.065 * sweepDir, 0.332, -0.165], w: 0.042 },
        { root: [-0.045 * sweepDir, 0.235, -0.035], mid: [-0.025 * sweepDir, 0.288, -0.105], tip: [-0.01 * sweepDir, 0.275, -0.168], w: 0.036 },
        { root: [0, 0.205, -0.085], mid: [0.018 * sweepDir, 0.215, -0.145], tip: [0.028 * sweepDir, 0.175, -0.185], w: 0.036 }
      ];
      for (const lk of voltLocks) {
        slots.push({
          mesh: sculptCurvedHairLockMesh({
            root: lk.root,
            mid: lk.mid,
            tip: lk.tip,
            width: lk.w,
            thickness: lk.w * 0.4,
            segments: 9,
            radialSegments: 7
          }),
          materialIndex: 7
        });
      }

      const sweatBand = sculptDrapedGarmentMesh(
        [
          { y: 0.182, rx: 0.103, rz: 0.111, z: 0.004, folds: 8, foldAmp: 0.0018, superellipseN: 2.1 },
          { y: 0.208, rx: 0.104, rz: 0.112, z: 0.004, folds: 8, foldAmp: 0.0018, superellipseN: 2.1 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const earCuff = transformMesh(
        smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.018, 0.038, 0.032, 0.006), 1, 0.46), 2),
        { pos: [-sweepDir * 0.102, 0.142, -0.004] }
      );
      slots.push(
        { mesh: sweatBand, materialIndex: 3 },
        { mesh: earCuff, materialIndex: 1 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.006, 1), { pos: [-sweepDir * 0.11, 0.142, 0.004] }),
          materialIndex: 6
        },
        {
          mesh: transformMesh(smoothMesh(bevelBoxMesh(0.036, 0.014, 0.01, 0.003), 2), { pos: [0, 0.195, 0.115] }),
          materialIndex: 5
        }
      );
      return slots;
    }

    case "boulder": {
      // BOULDER ("Iron Grappler"): Broad-jawed powerhouse head + thick braided colosseum beard + riveted iron/bronze brow-crest helm!
      const slots = sculptHumanHeadSlots({
        radius: 0.114,
        jawTaper: 0.12,
        cheekFullness: 0.16,
        noseBridge: 0.26,
        browRidge: 0.28,
        seed: 303,
        neckWidth: 0.068,
        browTilt: 0.22
      });

      const jawBeardMass = transformMesh(
        smoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.038, rx: 0.078, rz: 0.088, z: 0.036, folds: 8, foldAmp: 0.006, superellipseN: 2.2 },
              { y: 0.082, rx: 0.098, rz: 0.102, z: 0.026, folds: 8, foldAmp: 0.006, superellipseN: 2.2 },
              { y: 0.118, rx: 0.096, rz: 0.092, z: 0.016, folds: 6, foldAmp: 0.004, superellipseN: 2.1 }
            ],
            { ringPoints: 18, capEnds: true, smoothPasses: 3 }
          ),
          3
        ),
        { pos: [0, 0, 0] }
      );
      const mustacheL = sculptCurvedHairLockMesh({
        root: [-0.008, 0.108, 0.122],
        mid: [-0.044, 0.102, 0.114],
        tip: [-0.072, 0.078, 0.088],
        width: 0.022,
        thickness: 0.014,
        segments: 6,
        radialSegments: 6
      });
      const mustacheR = sculptCurvedHairLockMesh({
        root: [0.008, 0.108, 0.122],
        mid: [0.044, 0.102, 0.114],
        tip: [0.072, 0.078, 0.088],
        width: 0.022,
        thickness: 0.014,
        segments: 6,
        radialSegments: 6
      });
      const beardBraid = sculptCurvedHairLockMesh({
        root: [0, 0.052, 0.098],
        mid: [0.006 * sideBias, 0.008, 0.112],
        tip: [0.012 * sideBias, -0.042, 0.104],
        width: 0.038,
        thickness: 0.028,
        segments: 7,
        radialSegments: 7
      });

      const ironSkullCap = sculptCurvedShell(
        [
          { y: 0.172, rx: 0.12, rz: 0.128, zBias: -0.002, arcHalfAngle: Math.PI * 0.92, centerAngle: Math.PI, fluteCount: 6, fluteAmp: 0.005 },
          { y: 0.242, rx: 0.106, rz: 0.114, zBias: -0.004, arcHalfAngle: Math.PI * 0.95, centerAngle: Math.PI, fluteCount: 6, fluteAmp: 0.005 },
          { y: 0.292, rx: 0.056, rz: 0.062, zBias: -0.006, arcHalfAngle: Math.PI * 0.96, centerAngle: Math.PI }
        ],
        0.01,
        13,
        1
      );
      const bronzeBrowBand = sculptCurvedShell(
        [
          { y: 0.168, rx: 0.124, rz: 0.134, zBias: 0.008, arcHalfAngle: 1.42, keel: 0.016 },
          { y: 0.205, rx: 0.122, rz: 0.132, zBias: 0.006, arcHalfAngle: 1.38, keel: 0.014 }
        ],
        0.009,
        11,
        1
      );
      const dorsalCrest = sculptCurvedHairLockMesh({
        root: [0, 0.225, 0.108],
        mid: [0, 0.348, -0.005],
        tip: [0, 0.255, -0.145],
        width: 0.034,
        thickness: 0.062,
        segments: 9,
        radialSegments: 8
      });

      slots.push(
        { mesh: jawBeardMass, materialIndex: 7 },
        { mesh: mustacheL, materialIndex: 7 },
        { mesh: mustacheR, materialIndex: 7 },
        { mesh: beardBraid, materialIndex: 7 },
        { mesh: ironSkullCap, materialIndex: 4 },
        { mesh: bronzeBrowBand, materialIndex: 1 },
        { mesh: dorsalCrest, materialIndex: 3 },
        {
          mesh: transformMesh(latheMesh([[0.016, -0.008], [0.024, -0.008], [0.024, 0.008], [0.016, 0.008]], 12), {
            pos: [0.008 * sideBias, -0.015, 0.108]
          }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.011, 1), { pos: [0, 0.188, 0.146], scale: [1, 1.2, 0.55] }),
          materialIndex: 6
        }
      );
      return slots;
    }

    case "seraph": {
      // SERAPH ("Spear Saint"): Serene monastery warrior-saint face + gilded lotus coronet + braided hair bun & flowing locks!
      const slots = sculptHumanHeadSlots({
        radius: 0.101,
        jawTaper: 0.32,
        cheekFullness: 0.1,
        noseBridge: 0.19,
        browRidge: 0.08,
        seed: 404,
        neckWidth: 0.046,
        browTilt: 0.08
      });

      const hairCap = sculptDrapedGarmentMesh(
        [
          { y: 0.14, rx: 0.102, rz: 0.112, z: -0.014, folds: 8, foldAmp: 0.003, superellipseN: 2.05 },
          { y: 0.225, rx: 0.104, rz: 0.114, z: -0.01, folds: 8, foldAmp: 0.004, superellipseN: 2.05 },
          { y: 0.275, rx: 0.068, rz: 0.076, z: -0.012, folds: 6, foldAmp: 0.003, superellipseN: 2.0 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const topknotBun = transformMesh(
        smoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.262, rx: 0.048, rz: 0.052, z: -0.022, folds: 6, foldAmp: 0.003, superellipseN: 2.0 },
              { y: 0.325, rx: 0.056, rz: 0.058, z: -0.026, folds: 6, foldAmp: 0.004, superellipseN: 2.0 },
              { y: 0.368, rx: 0.032, rz: 0.034, z: -0.028, folds: 5, foldAmp: 0.002, superellipseN: 2.0 }
            ],
            { ringPoints: 18, capEnds: true, smoothPasses: 3 }
          ),
          3
        ),
        { pos: [0, 0, 0] }
      );
      const lotusCoronet = sculptCurvedShell(
        [
          { y: 0.252, rx: 0.062, rz: 0.066, zBias: -0.018, arcHalfAngle: 1.55, keel: 0.018, fluteCount: 5, fluteAmp: 0.005 },
          { y: 0.312, rx: 0.058, rz: 0.062, zBias: -0.02, arcHalfAngle: 1.38, keel: 0.028, fluteCount: 5, fluteAmp: 0.006 }
        ],
        0.008,
        11,
        1
      );
      const hairPin = tubeSweepMesh(
        [
          [-0.095, 0.305, -0.028, 0.0045],
          [0, 0.305, -0.024, 0.006],
          [0.095, 0.305, -0.028, 0.0045]
        ],
        6,
        true
      );
      const longBraid = sculptCurvedHairLockMesh({
        root: [0, 0.255, -0.065],
        mid: [0.022 * sideBias, 0.085, -0.155],
        tip: [0.038 * sideBias, -0.145, -0.185],
        width: 0.038,
        thickness: 0.032,
        segments: 10,
        radialSegments: 8
      });
      const silkRibbon = sculptCurvedHairLockMesh({
        root: [0, 0.285, -0.048],
        mid: [-0.045 * sideBias, 0.165, -0.175],
        tip: [-0.075 * sideBias, -0.045, -0.245],
        width: 0.028,
        thickness: 0.008,
        segments: 9,
        radialSegments: 7
      });

      slots.push(
        { mesh: hairCap, materialIndex: 7 },
        { mesh: topknotBun, materialIndex: 7 },
        { mesh: lotusCoronet, materialIndex: 1 },
        { mesh: hairPin, materialIndex: 1 },
        { mesh: longBraid, materialIndex: 7 },
        { mesh: silkRibbon, materialIndex: 3 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.011, 1), { pos: [0, 0.288, 0.056], scale: [0.85, 1.25, 0.55] }),
          materialIndex: 6
        }
      );
      for (const sx of [-1, 1] as const) {
        slots.push({
          mesh: sculptCurvedHairLockMesh({
            root: [sx * 0.068, 0.215, 0.045],
            mid: [sx * 0.088, 0.125, 0.058],
            tip: [sx * 0.074, 0.025, 0.052],
            width: 0.022,
            thickness: 0.012,
            segments: 8,
            radialSegments: 6
          }),
          materialIndex: 7
        });
      }
      return slots;
    }

    case "jinx": {
      // JINX ("The Trickster"): Draped street-shinobi peaked cowl (`maxY = 0.37` so scaled height > 1.70 m!) + swept bangs + stealth half-mask!
      const slots = sculptHumanHeadSlots({
        radius: 0.098,
        jawTaper: 0.3,
        cheekFullness: 0.08,
        noseBridge: 0.2,
        browRidge: 0.12,
        seed: 505,
        neckWidth: 0.046,
        browTilt: 0.2
      });

      const drapedCowl = deformMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.01, rx: 0.138, rz: 0.142, z: -0.012, folds: 7, foldAmp: 0.008, superellipseN: 2.2 },
            { y: 0.095, rx: 0.132, rz: 0.138, z: -0.014, folds: 7, foldAmp: 0.008, superellipseN: 2.15 },
            { y: 0.195, rx: 0.128, rz: 0.144, z: -0.008, folds: 6, foldAmp: 0.007, superellipseN: 2.15 },
            { y: 0.288, rx: 0.096, rz: 0.128, z: -0.018, folds: 5, foldAmp: 0.005, superellipseN: 2.1 },
            { y: 0.372, rx: 0.032, rz: 0.068, z: -0.045, folds: 4, foldAmp: 0.003, superellipseN: 2.0 }
          ],
          { ringPoints: 22, capEnds: true, smoothPasses: 4 }
        ),
        ([x, y, z]) => {
          const inFace = y > 0.055 && y < 0.235 && z > 0.01 ? Math.sin(((y - 0.055) / 0.18) * Math.PI) : 0;
          const xFade = Math.max(0, 1 - Math.abs(x) / 0.092);
          return [x, y, z - inFace * xFade * 0.072];
        }
      );

      const halfMask = sculptCurvedShell(
        [
          { y: 0.042, rx: 0.082, rz: 0.108, zBias: 0.012, arcHalfAngle: 1.24, keel: 0.022 },
          { y: 0.122, rx: 0.096, rz: 0.118, zBias: 0.014, arcHalfAngle: 1.28, keel: 0.026 }
        ],
        0.008,
        11,
        1
      );

      const bangA = sculptCurvedHairLockMesh({
        root: [-0.018 * sideBias, 0.228, 0.075],
        mid: [0.028 * sideBias, 0.195, 0.118],
        tip: [0.068 * sideBias, 0.145, 0.108],
        width: 0.032,
        thickness: 0.012,
        segments: 8,
        radialSegments: 7
      });
      const bangB = sculptCurvedHairLockMesh({
        root: [-0.048 * sideBias, 0.222, 0.068],
        mid: [-0.018 * sideBias, 0.188, 0.116],
        tip: [0.012 * sideBias, 0.152, 0.114],
        width: 0.026,
        thickness: 0.01,
        segments: 7,
        radialSegments: 6
      });

      slots.push(
        { mesh: drapedCowl, materialIndex: 0 },
        { mesh: halfMask, materialIndex: 5 },
        { mesh: bangA, materialIndex: 7 },
        { mesh: bangB, materialIndex: 7 },
        {
          mesh: tubeSweepMesh(
            [
              [-0.062, 0.118, 0.112, 0.0045],
              [0, 0.126, 0.142, 0.0055],
              [0.062, 0.118, 0.112, 0.0045]
            ],
            6,
            true
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.007, 1), { pos: [0, 0.095, 0.138], scale: [1.5, 0.6, 0.5] }),
          materialIndex: 6
        }
      );
      return slots;
    }

    case "sovereign": {
      // SOVEREIGN ("The Iron Crown"): Smooth-forged Gilded-Obsidian Dread Helm + sculpted Horned Iron Crown spires + furnace visor!
      const slots: MultiMatSlot[] = [
        {
          mesh: smoothMesh(
            latheMesh(
              [
                [0.045, -0.032],
                [0.092, -0.028],
                [0.084, 0.03],
                [0.074, 0.068],
                [0.04, 0.068]
              ],
              20
            ),
            2
          ),
          materialIndex: 2
        }
      ];

      const dreadHelm = smoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              makeFlutedRing(0.022, 0.1, 0.112, -0.004, { segments: 20, flutes: 6, fluteAmp: 0.01 }),
              makeFlutedRing(0.095, 0.112, 0.126, 0.0, { segments: 20, flutes: 8, fluteAmp: 0.012, frontKeel: 0.11 }),
              makeFlutedRing(0.185, 0.116, 0.132, 0.004, { segments: 20, flutes: 8, fluteAmp: 0.012, frontKeel: 0.11 }),
              makeFlutedRing(0.252, 0.108, 0.118, -0.002, { segments: 20, flutes: 8, fluteAmp: 0.01 }),
              makeFlutedRing(0.298, 0.058, 0.064, -0.006, { segments: 20 })
            ],
            true
          ),
          1,
          0.48
        ),
        4
      );
      const dreadJaw = sculptCurvedShell(
        [
          { y: 0.025, rx: 0.104, rz: 0.146, zBias: 0.014, arcHalfAngle: 1.24, keel: 0.032, fluteCount: 5, fluteAmp: 0.006 },
          { y: 0.128, rx: 0.114, rz: 0.156, zBias: 0.016, arcHalfAngle: 1.28, keel: 0.034, fluteCount: 5, fluteAmp: 0.006 }
        ],
        0.009,
        13,
        1
      );
      const furnaceVisorGlow = sculptCurvedShell(
        [
          { y: 0.138, rx: 0.096, rz: 0.132, zBias: 0.012, arcHalfAngle: 1.02, keel: 0.014 },
          { y: 0.174, rx: 0.096, rz: 0.132, zBias: 0.012, arcHalfAngle: 1.02, keel: 0.014 }
        ],
        0.006,
        11,
        0
      );
      const crownCirclet = smoothMesh(
        latheMesh(
          [
            [0.108, 0.2],
            [0.134, 0.208],
            [0.136, 0.252],
            [0.11, 0.258]
          ],
          24
        ),
        2
      );

      slots.push(
        { mesh: dreadHelm, materialIndex: 0 },
        { mesh: dreadJaw, materialIndex: 0 },
        { mesh: furnaceVisorGlow, materialIndex: 6 },
        { mesh: crownCirclet, materialIndex: 1 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.018, 1), { pos: [0, 0.228, 0.142], scale: [0.9, 1.3, 0.55] }),
          materialIndex: 6
        }
      );

      for (const barAngle of [-0.66, -0.33, 0, 0.33, 0.66] as const) {
        const bx = Math.sin(barAngle) * 0.112;
        const bz = Math.cos(barAngle) * 0.152 + 0.014;
        slots.push({
          mesh: tubeSweepMesh([[bx, 0.124, bz, 0.007], [bx, 0.194, bz, 0.007]], 6, true),
          materialIndex: barAngle === 0 ? 1 : 0
        });
      }

      for (const sx of [-1, 1] as const) {
        slots.push({
          mesh: sculptCurvedHairLockMesh({
            root: [sx * 0.118, 0.228, 0.02],
            mid: [sx * 0.178, 0.315, 0.045],
            tip: [sx * 0.148 + 0.004 * sideBias, 0.425, 0.075],
            width: 0.036,
            thickness: 0.032,
            segments: 8,
            radialSegments: 8
          }),
          materialIndex: 7
        });
      }
      const spireCount = 8;
      for (let i = 0; i < spireCount; i += 1) {
        const a = (i / spireCount) * Math.PI * 2;
        const isFront = i === 0;
        const isMajor = i % 2 === 0;
        const h = isFront ? 0.165 : isMajor ? 0.125 : 0.082;
        const rad = 0.124;
        const sx = Math.sin(a);
        const cz = Math.cos(a);
        slots.push({
          mesh: sculptDiamondBladeMesh(
            [
              [sx * rad, 0.244, cz * rad, isFront ? 0.024 : 0.019],
              [sx * (rad + 0.012), 0.244 + h * 0.55, cz * (rad + 0.012), isFront ? 0.015 : 0.012],
              [sx * (rad + 0.005), 0.244 + h, cz * (rad + 0.005), 0.0025]
            ],
            0.65,
            "x"
          ),
          materialIndex: isMajor ? 1 : 0
        });
      }
      return slots;
    }
  }
}

function buildUpperArmSlots(
  fighterId: GladiatorArchetypeId,
  sideSign: 1 | -1,
  b: ArchetypeBuild
): MultiMatSlot[] {
  const ps = b.pauldronScale;
  const ls = b.limbScale;
  const outAngle = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

  // Smooth anatomical deltoid, bicep & tricep (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`)
  const anatomicalBicep = smoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0.036, 0], rx: 0.058 * ls, rz: 0.06 * ls },
        { pos: [sideSign * 0.008, -0.035, 0.004], rx: 0.072 * ls, rz: 0.074 * ls, zOffset: 0.005 },
        { pos: [sideSign * 0.008, -0.108, 0.006], rx: 0.066 * ls, rz: 0.07 * ls, zOffset: 0.009 },
        { pos: [sideSign * 0.005, -0.188, 0.004], rx: 0.056 * ls, rz: 0.058 * ls, zOffset: 0.004 },
        { pos: [0, -0.268, 0], rx: 0.047 * ls, rz: 0.049 * ls }
      ],
      { ringPoints: 18, muscleBiasZ: 0.014, peakT: 0.42 }
    ),
    4
  );

  switch (fighterId) {
    case "kenji": {
      // Storm Karateka: Rolled short karate `gi` shoulder sleeve cuff (`sculptDrapedGarmentMesh`) + bare muscular deltoid & bicep!
      const giShortSleeve = sculptDrapedGarmentMesh(
        [
          { y: -0.095, rx: 0.092 * ls, rz: 0.094 * ls, x: sideSign * 0.008, folds: 7, foldAmp: 0.007, superellipseN: 2.2 },
          { y: -0.015, rx: 0.096 * ls, rz: 0.098 * ls, x: sideSign * 0.006, folds: 7, foldAmp: 0.006, superellipseN: 2.2 },
          { y: 0.068, rx: 0.082 * ls, rz: 0.086 * ls, x: -sideSign * 0.008, folds: 5, foldAmp: 0.004, superellipseN: 2.1 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const rolledCuffHem = sculptDrapedGarmentMesh(
        [
          { y: -0.105, rx: 0.096 * ls, rz: 0.098 * ls, x: sideSign * 0.008, folds: 6, foldAmp: 0.004, superellipseN: 2.25 },
          { y: -0.075, rx: 0.095 * ls, rz: 0.097 * ls, x: sideSign * 0.008, folds: 6, foldAmp: 0.004, superellipseN: 2.25 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const bicepCord = latheMesh(
        [
          [0.062 * ls, -0.155],
          [0.07 * ls, -0.152],
          [0.07 * ls, -0.14],
          [0.062 * ls, -0.136]
        ],
        16
      );
      return [
        { mesh: anatomicalBicep, materialIndex: 2 },
        { mesh: giShortSleeve, materialIndex: 0 },
        { mesh: rolledCuffHem, materialIndex: 3 },
        { mesh: bicepCord, materialIndex: 3 }
      ];
    }

    case "volt": {
      // Rushdown Boxer: Cropped dockside bomber shoulder cap + toned bare athletic bicep + strapped leather bicep band!
      const bomberShoulderCap = sculptDrapedGarmentMesh(
        [
          { y: -0.065, rx: 0.088 * ls, rz: 0.09 * ls, x: sideSign * 0.006, folds: 6, foldAmp: 0.005, superellipseN: 2.2 },
          { y: 0.015, rx: 0.092 * ls, rz: 0.094 * ls, x: sideSign * 0.004, folds: 6, foldAmp: 0.004, superellipseN: 2.2 },
          { y: 0.075, rx: 0.076 * ls, rz: 0.08 * ls, x: -sideSign * 0.008, folds: 5, foldAmp: 0.003, superellipseN: 2.1 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const bicepStrap = latheMesh(
        [
          [0.061 * ls, -0.165],
          [0.071 * ls, -0.162],
          [0.071 * ls, -0.142],
          [0.061 * ls, -0.138]
        ],
        16
      );
      const cyanTrim = tubeSweepMesh(
        [
          [sideSign * 0.02, -0.062, 0.088 * ls, 0.0042],
          [sideSign * 0.092 * ls, -0.062, 0, 0.0045],
          [sideSign * 0.02, -0.062, -0.088 * ls, 0.0042]
        ],
        6,
        true
      );
      return [
        { mesh: anatomicalBicep, materialIndex: 2 },
        { mesh: bomberShoulderCap, materialIndex: 0 },
        { mesh: bicepStrap, materialIndex: 5 },
        { mesh: cyanTrim, materialIndex: 6 }
      ];
    }

    case "boulder": {
      // Iron Grappler: Asymmetric heavy colosseum iron/bronze `galerus` pauldron on left arm (`sideSign > 0`); bare massive right arm with leather strap!
      const slots: MultiMatSlot[] = [
        { mesh: anatomicalBicep, materialIndex: 2 },
        {
          mesh: latheMesh(
            [
              [0.064 * ls, -0.185],
              [0.076 * ls, -0.182],
              [0.076 * ls, -0.155],
              [0.064 * ls, -0.15]
            ],
            18
          ),
          materialIndex: 5
        }
      ];
      if (sideSign > 0) {
        const galerusUpper = sculptCurvedShell(
          [
            { y: -0.045 * ps, rx: 0.125 * ps, rz: 0.12 * ps, arcHalfAngle: 1.54, centerAngle: outAngle, keel: 0.02, fluteCount: 5, fluteAmp: 0.006 },
            { y: 0.088 * ps, rx: 0.088 * ps, rz: 0.094 * ps, arcHalfAngle: 1.42, centerAngle: outAngle, keel: 0.015 }
          ],
          0.01,
          13,
          1
        );
        const galerusLower = sculptCurvedShell(
          [
            { y: -0.125 * ps, rx: 0.116 * ps, rz: 0.11 * ps, arcHalfAngle: 1.42, centerAngle: outAngle, keel: 0.016 },
            { y: -0.038 * ps, rx: 0.122 * ps, rz: 0.116 * ps, arcHalfAngle: 1.48, centerAngle: outAngle, keel: 0.018 }
          ],
          0.009,
          11,
          1
        );
        slots.push(
          { mesh: galerusUpper, materialIndex: 4 },
          { mesh: galerusLower, materialIndex: 1 },
          { mesh: forgedRivetMesh([sideSign * 0.124 * ps, -0.06, 0.048 * ps], 0.009), materialIndex: 1 }
        );
      } else {
        slots.push(
          {
            mesh: latheMesh(
              [
                [0.068 * ls, -0.085],
                [0.082 * ls, -0.082],
                [0.082 * ls, -0.055],
                [0.068 * ls, -0.05]
              ],
              18
            ),
            materialIndex: 0
          },
          { mesh: forgedRivetMesh([sideSign * 0.084 * ls, -0.068, 0.02], 0.011), materialIndex: 1 }
        );
      }
      return slots;
    }

    case "seraph": {
      // Spear Saint: Flowing wide Himalayan monastery silk upper sleeve (`sculptDrapedGarmentMesh`) with embroidered gold band!
      const drapedMonkSleeve = sculptDrapedGarmentMesh(
        [
          { y: -0.245, rx: 0.098 * ls, rz: 0.106 * ls, x: sideSign * 0.008, folds: 8, foldAmp: 0.011, superellipseN: 2.15 },
          { y: -0.125, rx: 0.094 * ls, rz: 0.1 * ls, x: sideSign * 0.008, folds: 8, foldAmp: 0.009, superellipseN: 2.15 },
          { y: -0.015, rx: 0.088 * ls, rz: 0.092 * ls, x: sideSign * 0.004, folds: 7, foldAmp: 0.006, superellipseN: 2.1 },
          { y: 0.068, rx: 0.074 * ls, rz: 0.078 * ls, x: -sideSign * 0.006, folds: 5, foldAmp: 0.004, superellipseN: 2.1 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 4 }
      );
      const sleeveGoldHem = sculptDrapedGarmentMesh(
        [
          { y: -0.252, rx: 0.082 * ls, rz: 0.088 * ls, x: sideSign * 0.006, folds: 6, foldAmp: 0.004, superellipseN: 2.2 },
          { y: -0.222, rx: 0.096 * ls, rz: 0.102 * ls, x: sideSign * 0.008, folds: 6, foldAmp: 0.005, superellipseN: 2.2 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const shoulderCloud = sculptCurvedShell(
        [
          { y: -0.015, rx: 0.094 * ls, rz: 0.096 * ls, arcHalfAngle: 1.25, centerAngle: outAngle, keel: 0.01 },
          { y: 0.065, rx: 0.078 * ls, rz: 0.082 * ls, arcHalfAngle: 1.15, centerAngle: outAngle, keel: 0.008 }
        ],
        0.007,
        11,
        1
      );
      return [
        { mesh: drapedMonkSleeve, materialIndex: 0 },
        { mesh: sleeveGoldHem, materialIndex: 3 },
        { mesh: shoulderCloud, materialIndex: 1 }
      ];
    }

    case "jinx": {
      // The Trickster: Asymmetric sleek shinobi shoulder guard on left (`sideSign > 0`), bare toned upper arm with crisscross stealth wraps on right!
      const slots: MultiMatSlot[] = [{ mesh: anatomicalBicep, materialIndex: 2 }];
      if (sideSign > 0) {
        const stealthGuard = sculptCurvedShell(
          [
            { y: -0.085, rx: 0.096 * ps, rz: 0.098 * ps, arcHalfAngle: 1.38, centerAngle: outAngle, keel: 0.014 },
            { y: 0.068, rx: 0.076 * ps, rz: 0.082 * ps, arcHalfAngle: 1.28, centerAngle: outAngle, keel: 0.012 }
          ],
          0.008,
          11,
          1
        );
        slots.push(
          { mesh: stealthGuard, materialIndex: 5 },
          {
            mesh: latheMesh(
              [
                [0.056 * ls, -0.185],
                [0.066 * ls, -0.182],
                [0.066 * ls, -0.155],
                [0.056 * ls, -0.152]
              ],
              16
            ),
            materialIndex: 3
          },
          { mesh: forgedRivetMesh([sideSign * 0.098 * ps, -0.01, 0], 0.008), materialIndex: 1 }
        );
      } else {
        const clothBandA = sculptDrapedGarmentMesh(
          [
            { y: -0.195, rx: 0.064 * ls, rz: 0.066 * ls, folds: 6, foldAmp: 0.003, superellipseN: 2.1 },
            { y: -0.095, rx: 0.072 * ls, rz: 0.074 * ls, folds: 6, foldAmp: 0.003, superellipseN: 2.1 }
          ],
          { ringPoints: 18, capEnds: true, smoothPasses: 3 }
        );
        slots.push(
          { mesh: clothBandA, materialIndex: 0 },
          {
            mesh: latheMesh(
              [
                [0.062 * ls, -0.148],
                [0.073 * ls, -0.145],
                [0.073 * ls, -0.132],
                [0.062 * ls, -0.128]
              ],
              16
            ),
            materialIndex: 3
          },
          { mesh: forgedRivetMesh([sideSign * 0.072 * ls, -0.138, 0.015], 0.007), materialIndex: 1 }
        );
      }
      return slots;
    }

    case "sovereign": {
      // Sovereign: Smooth-faired grand winged pauldrons & articulated plate rerebraces
      const rerebracePlate = sculptCurvedShell(
        [
          { y: -0.235, rx: 0.058 * ls, rz: 0.06 * ls, arcHalfAngle: 1.55, centerAngle: outAngle, keel: 0.008 },
          { y: -0.115, rx: 0.072 * ls, rz: 0.074 * ls, arcHalfAngle: 1.62, centerAngle: outAngle, keel: 0.01, fluteCount: 3, fluteAmp: 0.004 }
        ],
        0.007,
        11,
        1
      );
      const grandPauldron = sculptCurvedShell(
        [
          { y: -0.042 * ps, rx: 0.128 * ps, rz: 0.122 * ps, arcHalfAngle: 1.56, centerAngle: outAngle, keel: 0.02, fluteCount: 5, fluteAmp: 0.006 },
          { y: 0.035 * ps, rx: 0.122 * ps, rz: 0.118 * ps, arcHalfAngle: 1.52, centerAngle: outAngle, keel: 0.022, fluteCount: 5, fluteAmp: 0.006 },
          { y: 0.098 * ps, rx: 0.086 * ps, rz: 0.092 * ps, arcHalfAngle: 1.42, centerAngle: outAngle, keel: 0.014 }
        ],
        0.01,
        13,
        1
      );
      const lowSpaulder = sculptCurvedShell(
        [
          { y: -0.138 * ps, rx: 0.114 * ps, rz: 0.106 * ps, arcHalfAngle: 1.38, centerAngle: outAngle, keel: 0.016 },
          { y: -0.038 * ps, rx: 0.122 * ps, rz: 0.114 * ps, arcHalfAngle: 1.46, centerAngle: outAngle, keel: 0.018 }
        ],
        0.008,
        11,
        1
      );
      const pauldronTrim = tubeSweepMesh(
        [
          [sideSign * 0.032 * ps, -0.042 * ps, 0.118 * ps, 0.008],
          [sideSign * 0.144 * ps, -0.046 * ps, 0, 0.009],
          [sideSign * 0.032 * ps, -0.042 * ps, -0.118 * ps, 0.008]
        ],
        7,
        true
      );
      return [
        { mesh: anatomicalBicep, materialIndex: 2 },
        { mesh: rerebracePlate, materialIndex: 0 },
        { mesh: grandPauldron, materialIndex: 0 },
        { mesh: lowSpaulder, materialIndex: 0 },
        { mesh: pauldronTrim, materialIndex: 1 },
        {
          mesh: latheMesh(
            [
              [0.056 * ls, -0.195],
              [0.065 * ls, -0.192],
              [0.065 * ls, -0.172],
              [0.056 * ls, -0.168]
            ],
            16
          ),
          materialIndex: 5
        }
      ];
    }
  }
}

function buildForearmGauntletSlots(
  fighterId: GladiatorArchetypeId,
  sideSign: 1 | -1,
  b: ArchetypeBuild
): MultiMatSlot[] {
  const ls = b.limbScale;
  const outAngle = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const elbowAngle = Math.PI + sideSign * 0.36;

  // Smooth tapered anatomical forearm (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`)
  const forearmMuscle = smoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0.026, 0], rx: 0.045 * ls, rz: 0.047 * ls },
        { pos: [sideSign * 0.005, -0.058, 0.003], rx: 0.057 * ls, rz: 0.059 * ls, zOffset: 0.006 },
        { pos: [sideSign * 0.003, -0.145, 0.004], rx: 0.046 * ls, rz: 0.048 * ls, zOffset: 0.004 },
        { pos: [0, -0.222, 0.005], rx: 0.038 * ls, rz: 0.04 * ls }
      ],
      { ringPoints: 18, muscleBiasZ: 0.01, peakT: 0.34 }
    ),
    4
  );

  // Smooth clenched hand & curled fingers helper for human martial fighters
  const buildSculptedHand = (handMatIdx: number, fingerMatIdx: number): MultiMatSlot[] => {
    const palm = transformMesh(
      smoothMesh(subdivideSmoothMesh(bevelBoxMesh(0.066 * ls, 0.056, 0.044, 0.014), 1, 0.48), 3),
      { pos: [0, -0.252, 0.008] }
    );
    const out: MultiMatSlot[] = [{ mesh: palm, materialIndex: handMatIdx }];
    for (const fx of [-0.023, -0.008, 0.008, 0.023] as const) {
      out.push({
        mesh: smoothMesh(
          tubeSweepMesh(
            [
              [fx * ls, -0.272, 0.022, 0.0082],
              [fx * ls, -0.294, 0.031, 0.0076],
              [fx * ls, -0.29, 0.008, 0.0066]
            ],
            7,
            true
          ),
          2
        ),
        materialIndex: fingerMatIdx
      });
    }
    out.push({
      mesh: smoothMesh(
        tubeSweepMesh(
          [
            [-sideSign * 0.031 * ls, -0.248, 0.02, 0.0092],
            [-sideSign * 0.025 * ls, -0.272, 0.035, 0.008],
            [-sideSign * 0.011 * ls, -0.281, 0.027, 0.007]
          ],
          7,
          true
        ),
        2
      ),
      materialIndex: fingerMatIdx
    });
    return out;
  };

  switch (fighterId) {
    case "kenji": {
      // Storm Karateka: Bare muscular forearm (`skin`) + cotton `tekko` forearm/wrist tape wraps (`4`) + clenched karate fist!
      const wristTape = sculptDrapedGarmentMesh(
        [
          { y: -0.236, rx: 0.044 * ls, rz: 0.046 * ls, z: 0.005, folds: 6, foldAmp: 0.002, superellipseN: 2.1 },
          { y: -0.155, rx: 0.05 * ls, rz: 0.052 * ls, z: 0.004, folds: 6, foldAmp: 0.0025, superellipseN: 2.1 }
        ],
        { ringPoints: 18, capEnds: true, smoothPasses: 3 }
      );
      const cordTie = latheMesh(
        [
          [0.043 * ls, -0.198],
          [0.052 * ls, -0.195],
          [0.052 * ls, -0.184],
          [0.043 * ls, -0.181]
        ],
        16
      );
      return [
        { mesh: forearmMuscle, materialIndex: 2 },
        { mesh: wristTape, materialIndex: 4 },
        { mesh: cordTie, materialIndex: 3 },
        ...buildSculptedHand(4, 2)
      ];
    }

    case "volt": {
      // Rushdown Boxer: Toned athletic forearm (`skin`) + pro boxer cotton wrist/forearm tape (`4`) + stabilizing cuff (`3`)!
      // (Note: Padded pro boxing gloves mount seamlessly over `[0, -0.26, 0.02]` via `weapon` & `shield` slots!)
      const boxerTape = sculptDrapedGarmentMesh(
        [
          { y: -0.238, rx: 0.045 * ls, rz: 0.047 * ls, z: 0.005, folds: 8, foldAmp: 0.002, superellipseN: 2.15 },
          { y: -0.125, rx: 0.053 * ls, rz: 0.055 * ls, z: 0.004, folds: 8, foldAmp: 0.002, superellipseN: 2.15 }
        ],
        { ringPoints: 18, capEnds: true, smoothPasses: 3 }
      );
      const forearmBand = latheMesh(
        [
          [0.05 * ls, -0.135],
          [0.058 * ls, -0.132],
          [0.058 * ls, -0.116],
          [0.05 * ls, -0.112]
        ],
        16
      );
      return [
        { mesh: forearmMuscle, materialIndex: 2 },
        { mesh: boxerTape, materialIndex: 4 },
        { mesh: forearmBand, materialIndex: 3 },
        ...buildSculptedHand(5, 5)
      ];
    }

    case "boulder": {
      // Iron Grappler: Massive vascular forearm + heavy riveted colosseum leather & bronze bracer + clenched grappler fist!
      const leatherBracer = sculptDrapedGarmentMesh(
        [
          { y: -0.225, rx: 0.048 * ls, rz: 0.05 * ls, z: 0.004, folds: 4, foldAmp: 0.002, superellipseN: 2.2 },
          { y: -0.085, rx: 0.062 * ls, rz: 0.064 * ls, z: 0.003, folds: 4, foldAmp: 0.002, superellipseN: 2.2 }
        ],
        { ringPoints: 18, capEnds: true, smoothPasses: 3 }
      );
      const bronzeRim = latheMesh(
        [
          [0.058 * ls, -0.095],
          [0.068 * ls, -0.092],
          [0.068 * ls, -0.078],
          [0.058 * ls, -0.074]
        ],
        18
      );
      return [
        { mesh: forearmMuscle, materialIndex: 2 },
        { mesh: leatherBracer, materialIndex: 5 },
        { mesh: bronzeRim, materialIndex: 1 },
        ...buildSculptedHand(5, 2)
      ];
    }

    case "seraph": {
      // Spear Saint: Silk-cord-wrapped monastery martial vambrace (`sculptDrapedGarmentMesh`) + gilded lotus wrist ring + serene hand!
      const silkVambrace = sculptDrapedGarmentMesh(
        [
          { y: -0.228, rx: 0.045 * ls, rz: 0.047 * ls, z: 0.004, folds: 6, foldAmp: 0.003, superellipseN: 2.15 },
          { y: -0.115, rx: 0.056 * ls, rz: 0.058 * ls, z: 0.003, folds: 7, foldAmp: 0.004, superellipseN: 2.15 },
          { y: -0.015, rx: 0.062 * ls, rz: 0.064 * ls, z: 0.002, folds: 7, foldAmp: 0.004, superellipseN: 2.15 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      );
      const wristBangle = latheMesh(
        [
          [0.042 * ls, -0.228],
          [0.052 * ls, -0.225],
          [0.052 * ls, -0.208],
          [0.042 * ls, -0.205]
        ],
        18
      );
      return [
        { mesh: silkVambrace, materialIndex: 3 },
        { mesh: wristBangle, materialIndex: 1 },
        ...buildSculptedHand(2, 2)
      ];
    }

    case "jinx": {
      // The Trickster: Fitted stealth shinobi `kote` forearm wrap + leather straps + fingerless shinobi gloves!
      const shinobiKote = sculptDrapedGarmentMesh(
        [
          { y: -0.225, rx: 0.044 * ls, rz: 0.046 * ls, z: 0.004, folds: 6, foldAmp: 0.003, superellipseN: 2.15 },
          { y: -0.065, rx: 0.058 * ls, rz: 0.06 * ls, z: 0.003, folds: 6, foldAmp: 0.003, superellipseN: 2.15 }
        ],
        { ringPoints: 18, capEnds: true, smoothPasses: 3 }
      );
      const kotePlate = sculptCurvedShell(
        [
          { y: -0.205, rx: 0.048 * ls, rz: 0.05 * ls, zBias: 0.004, arcHalfAngle: 1.25, centerAngle: outAngle, keel: 0.008 },
          { y: -0.085, rx: 0.06 * ls, rz: 0.062 * ls, zBias: 0.003, arcHalfAngle: 1.28, centerAngle: outAngle, keel: 0.009 }
        ],
        0.006,
        9,
        1
      );
      return [
        { mesh: forearmMuscle, materialIndex: 2 },
        { mesh: shinobiKote, materialIndex: 0 },
        { mesh: kotePlate, materialIndex: 5 },
        ...buildSculptedHand(5, 2)
      ];
    }

    case "sovereign": {
      // Sovereign: Smooth-faired plate couter, vambrace & articulated royal gauntlet
      const couterCop = sculptCurvedShell(
        [
          { y: -0.052, rx: 0.056 * ls, rz: 0.062 * ls, arcHalfAngle: 1.35, centerAngle: elbowAngle, keel: 0.016 },
          { y: 0.0, rx: 0.062 * ls, rz: 0.072 * ls, arcHalfAngle: 1.48, centerAngle: elbowAngle, keel: 0.03, fluteCount: 3, fluteAmp: 0.005 },
          { y: 0.052, rx: 0.054 * ls, rz: 0.06 * ls, arcHalfAngle: 1.32, centerAngle: elbowAngle, keel: 0.014 }
        ],
        0.008,
        11,
        1
      );
      const vambraceShell = sculptCurvedShell(
        [
          { y: -0.215, rx: 0.048 * ls, rz: 0.05 * ls, zBias: 0.004, arcHalfAngle: 1.62, centerAngle: outAngle, keel: 0.008 },
          { y: -0.048, rx: 0.062 * ls, rz: 0.064 * ls, zBias: 0.002, arcHalfAngle: 1.58, centerAngle: outAngle, keel: 0.01 }
        ],
        0.008,
        11,
        1
      );
      return [
        { mesh: forearmMuscle, materialIndex: 2 },
        { mesh: couterCop, materialIndex: 1 },
        { mesh: vambraceShell, materialIndex: 0 },
        ...buildSculptedHand(0, 1)
      ];
    }
  }
}

function buildWeaponSlots(fighterId: GladiatorArchetypeId): MultiMatSlot[] {
  // Weapon origin = right hand `[0, -0.26, 0.02]`, grip/knuckles oriented forward along +Z
  switch (fighterId) {
    case "kenji": {
      // KENJI (Storm Karateka — UNARMED): Taped cotton `tekko` martial fist wrap + figure-8 knuckle bandages + knotted dojo cord!
      const fistWrapSleeve = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.052, rx: 0.046, rz: 0.036, zBias: 0.008 },
            { y: -0.018, rx: 0.05, rz: 0.04, zBias: 0.006, foldAmp: 0.003 },
            { y: 0.024, rx: 0.045, rz: 0.042, zBias: 0.002, foldAmp: 0.003 },
            { y: 0.068, rx: 0.043, rz: 0.044, zBias: 0 }
          ],
          { segments: 18, foldCount: 6, wallThickness: 0.006, seed: 701 }
        ),
        3
      );
      const crossBandA = smoothMesh(
        tubeSweepMesh(
          [
            [-0.046, -0.038, -0.018, 0.0085],
            [0, -0.01, 0.044, 0.009],
            [0.046, 0.028, -0.016, 0.0085],
            [0, 0.052, 0.042, 0.008]
          ],
          8,
          true
        ),
        2
      );
      const crossBandB = smoothMesh(
        tubeSweepMesh(
          [
            [0.046, -0.036, -0.016, 0.0085],
            [0, -0.008, 0.045, 0.009],
            [-0.046, 0.03, -0.018, 0.0085]
          ],
          8,
          true
        ),
        2
      );
      const wristCord = smoothMesh(
        tubeSweepMesh(
          [
            [-0.044, 0.052, 0, 0.0075],
            [0, 0.054, 0.046, 0.008],
            [0.044, 0.052, 0, 0.0075],
            [0, 0.052, -0.044, 0.008],
            [-0.044, 0.052, 0, 0.0075]
          ],
          7,
          true
        ),
        2
      );
      const cordTail = smoothMesh(
        sculptCurvedHairLockMesh({
          root: [0.038, 0.05, -0.02],
          mid: [0.066, 0.008, -0.062],
          tip: [0.068, -0.048, -0.102],
          width: 0.014,
          thickness: 0.008,
          segments: 8
        }),
        2
      );
      return [
        { mesh: fistWrapSleeve, materialIndex: 4 },
        { mesh: crossBandA, materialIndex: 4 },
        { mesh: crossBandB, materialIndex: 4 },
        { mesh: wristCord, materialIndex: 3 },
        { mesh: cordTail, materialIndex: 3 },
        { mesh: forgedRivetMesh([0, 0.054, 0.048], 0.0075), materialIndex: 1 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.0065, 1), {
            pos: [0, -0.032, 0.046],
            scale: [1.3, 0.7, 0.7]
          }),
          materialIndex: 6
        }
      ];
    }

    case "volt": {
      // VOLT (Rushdown Boxer — UNARMED): Smooth contoured pro leather right boxing glove + tucked thumb + laced cuff!
      const gloveDome = smoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              makeFlutedRing(-0.088, 0.052, 0.046, 0.016, { segments: 18, frontKeel: 0.14 }),
              makeFlutedRing(-0.058, 0.074, 0.068, 0.02, { segments: 18, frontKeel: 0.18 }),
              makeFlutedRing(-0.018, 0.078, 0.072, 0.016, { segments: 18, frontKeel: 0.16 }),
              makeFlutedRing(0.022, 0.066, 0.06, 0.006, { segments: 18, frontKeel: 0.08 }),
              makeFlutedRing(0.048, 0.052, 0.048, 0.002, { segments: 18 })
            ],
            true
          ),
          1,
          0.45
        ),
        5
      );
      const thumbBolster = smoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0.052, 0.018, 0.012], rx: 0.024, rz: 0.026 },
            { pos: [0.068, -0.014, 0.028], rx: 0.028, rz: 0.03 },
            { pos: [0.062, -0.046, 0.038], rx: 0.025, rz: 0.026 },
            { pos: [0.046, -0.064, 0.04], rx: 0.018, rz: 0.02 }
          ],
          { ringPoints: 12, muscleBiasZ: 0.004, peakT: 0.45 }
        ),
        4
      );
      const wristCuff = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.032, rx: 0.054, rz: 0.05, zBias: 0.002 },
            { y: 0.068, rx: 0.056, rz: 0.052, zBias: 0, foldAmp: 0.002 },
            { y: 0.108, rx: 0.054, rz: 0.05, zBias: 0 }
          ],
          { segments: 18, foldCount: 4, wallThickness: 0.008, seed: 712 }
        ),
        3
      );
      const laceStrip = smoothMesh(
        tubeSweepMesh(
          [
            [-0.018, 0.042, -0.052, 0.006],
            [0.018, 0.058, -0.054, 0.006],
            [-0.018, 0.074, -0.054, 0.006],
            [0.018, 0.09, -0.052, 0.006],
            [-0.016, 0.102, -0.05, 0.0055]
          ],
          7,
          true
        ),
        2
      );
      const tapeCollar = latheMesh(
        [
          [0.048, 0.104],
          [0.058, 0.106],
          [0.058, 0.122],
          [0.048, 0.124]
        ],
        18
      );
      const kineticSeam = tubeSweepMesh(
        [
          [-0.064, 0.024, 0.018, 0.0045],
          [-0.074, -0.02, 0.026, 0.005],
          [-0.058, -0.068, 0.034, 0.0045]
        ],
        6,
        true
      );
      return [
        { mesh: gloveDome, materialIndex: 5 },
        { mesh: thumbBolster, materialIndex: 5 },
        { mesh: wristCuff, materialIndex: 5 },
        { mesh: laceStrip, materialIndex: 4 },
        { mesh: tapeCollar, materialIndex: 4 },
        { mesh: forgedRivetMesh([-0.022, 0.066, -0.053], 0.0055), materialIndex: 1 },
        { mesh: forgedRivetMesh([0.022, 0.066, -0.053], 0.0055), materialIndex: 1 },
        { mesh: kineticSeam, materialIndex: 6 }
      ];
    }

    case "boulder": {
      // BOULDER (Iron Grappler): Heavy contoured iron-and-bronze Spiked Cestus / Anvil-Gauntlet!
      const cestusShell = smoothMesh(
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.124, 0.116, 0.132, 0.032), { pos: [0, -0.024, 0.018] }),
          1,
          0.45
        ),
        4
      );
      const bronzeKnucklePlate = sculptCurvedShell(
        [
          { y: -0.078, rx: 0.066, rz: 0.074, zBias: 0.018, arcHalfAngle: 1.45, keel: 0.018 },
          { y: -0.012, rx: 0.068, rz: 0.078, zBias: 0.02, arcHalfAngle: 1.5, keel: 0.022, fluteCount: 4, fluteAmp: 0.005 }
        ],
        0.01,
        11,
        1
      );
      const slots: MultiMatSlot[] = [
        { mesh: cestusShell, materialIndex: 4 },
        { mesh: bronzeKnucklePlate, materialIndex: 1 },
        {
          mesh: latheMesh(
            [
              [0.052, 0.025],
              [0.066, 0.028],
              [0.066, 0.055],
              [0.052, 0.058]
            ],
            16
          ),
          materialIndex: 5
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.014, 1), {
            pos: [0, -0.008, 0.088],
            scale: [1.15, 0.85, 0.65]
          }),
          materialIndex: 6
        }
      ];
      for (const kx of [-0.042, -0.014, 0.014, 0.042] as const) {
        slots.push({
          mesh: transformMesh(
            latheMesh([[0, 0], [0.014, 0], [0.009, 0.026], [0, 0.048]], 10),
            { pos: [kx, -0.052, 0.078], rot: [Math.PI * 0.42, 0, 0] }
          ),
          materialIndex: 1
        });
      }
      return slots;
    }

    case "seraph": {
      // SERAPH (Spear Saint): Ornate Twin-Ringed Monastery Spear / Halberd with lotus collar & silk tassel!
      const spearBladeSpine: V4[] = [
        [0, 0, 0.72, 0.054],
        [0, 0, 0.96, 0.046],
        [0, 0, 1.22, 0.028],
        [0, 0, 1.42, 0.003]
      ];
      const crescentFluke = catmullRomSpline3(
        [
          [0, 0.036, 0.73],
          [0, 0.135, 0.78],
          [0, 0.185, 0.89]
        ],
        5
      ).map((p, i, arr) => [p[0], p[1], p[2], 0.024 * (1 - (i / (arr.length - 1)) * 0.82)] as V4);

      const silkTassel = smoothMesh(
        sculptCurvedHairLockMesh({
          root: [0, -0.034, 0.68],
          mid: [0.018, -0.165, 0.6],
          tip: [-0.008, -0.29, 0.5],
          width: 0.028,
          thickness: 0.015,
          segments: 10
        }),
        3
      );

      const slots: MultiMatSlot[] = [
        { mesh: tubeSweepMesh([[0, 0, -0.48, 0.019], [0, 0, 0.74, 0.021]], 12, true), materialIndex: 5 },
        {
          mesh: transformMesh(
            latheMesh([[0, -0.075], [0.03, 0], [0.03, 0.028], [0, 0.038]], 14),
            { pos: [0, 0, -0.49], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.062, 0], [0.068, 0.022], [0.04, 0.044], [0, 0.048]], 18),
            { pos: [0, 0, 0.7], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.022, 1), {
            pos: [0, 0, 0.735],
            scale: [0.7, 1.15, 1.15]
          }),
          materialIndex: 6
        },
        { mesh: sculptDiamondBladeMesh(spearBladeSpine, 0.22, "y"), materialIndex: 4 },
        { mesh: sculptDiamondBladeMesh(crescentFluke, 0.26, "y"), materialIndex: 4 },
        { mesh: silkTassel, materialIndex: 3 }
      ];
      // Twin sacred monastery rings (`shakujo` rings) hanging from the lotus spear collar
      for (const zRing of [0.665, 0.705] as const) {
        const ringPts: V4[] = [];
        for (let i = 0; i <= 12; i += 1) {
          const a = (i / 12) * Math.PI * 2;
          ringPts.push([Math.sin(a) * 0.038, -0.068 + Math.cos(a) * 0.038, zRing, 0.0055]);
        }
        slots.push({ mesh: tubeSweepMesh(ringPts, 6, false), materialIndex: 1 });
      }
      return slots;
    }

    case "jinx": {
      // JINX (Trickster): Agile Curved Kinetic Kunai-Dagger with finger-spinner pommel ring!
      const kunaiBladeSpine = catmullRomSpline3(
        [
          [0, 0, 0.068],
          [0, -0.01, 0.2],
          [0, 0.024, 0.36],
          [0, 0.068, 0.5]
        ],
        6
      ).map((p, i, arr) => {
        const u = i / (arr.length - 1);
        const hw = u > 0.8 ? 0.03 * (1 - (u - 0.8) / 0.2) + 0.002 : 0.022 + Math.sin(u * Math.PI) * 0.012;
        return [p[0], p[1], p[2], hw] as V4;
      });
      const pommelRing: V4[] = [];
      for (let i = 0; i <= 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        pommelRing.push([0, Math.sin(a) * 0.032, -0.175 + Math.cos(a) * 0.032, 0.006]);
      }
      return [
        { mesh: tubeSweepMesh([[0, 0, -0.14, 0.016], [0, 0, 0.06, 0.018]], 10, true), materialIndex: 5 },
        { mesh: tubeSweepMesh(pommelRing, 7, false), materialIndex: 1 },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.044, 0], [0.048, 0.014], [0.024, 0.022], [0, 0.024]], 14),
            { pos: [0, 0, 0.056], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        { mesh: sculptDiamondBladeMesh(kunaiBladeSpine, 0.24, "y"), materialIndex: 4 },
        { mesh: tubeSweepMesh([[0, -0.004, 0.09, 0.0055], [0, 0.022, 0.35, 0.004]], 6, true), materialIndex: 6 }
      ];
    }

    case "sovereign": {
      // SOVEREIGN (Iron Crown Boss): Ornate Gilded-Obsidian Runesword with winged quillions & molten fuller!
      const greatswordSpine: V4[] = [
        [0, 0, 0.09, 0.056],
        [0, 0, 0.34, 0.05],
        [0, 0, 0.88, 0.042],
        [0, 0, 1.16, 0.026],
        [0, 0, 1.3, 0.003]
      ];
      const quillionPts = catmullRomSpline3(
        [
          [0, -0.22, 0.125],
          [0, -0.105, 0.078],
          [0, 0, 0.072],
          [0, 0.105, 0.078],
          [0, 0.22, 0.125]
        ],
        5
      ).map((p, i, arr) => {
        const edge = Math.abs(i / (arr.length - 1) - 0.5) * 2;
        return [p[0], p[1], p[2], 0.022 * (1 - edge * 0.45)] as V4;
      });

      const slots: MultiMatSlot[] = [
        { mesh: tubeSweepMesh([[0, 0, -0.31, 0.02], [0, 0, 0.068, 0.022]], 10, true), materialIndex: 5 },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.048, 0], [0.052, 0.018], [0.032, 0.032], [0, 0.036]], 16),
            { pos: [0, 0, -0.33], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        { mesh: sculptDiamondBladeMesh(quillionPts, 0.55, "x"), materialIndex: 1 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.024, 1), {
            pos: [0, 0, 0.076],
            scale: [1.2, 0.9, 0.8]
          }),
          materialIndex: 6
        },
        {
          mesh: smoothMesh(transformMesh(bevelBoxMesh(0.036, 0.088, 0.16, 0.01), { pos: [0, 0, 0.165] }), 2),
          materialIndex: 7
        },
        { mesh: sculptDiamondBladeMesh(greatswordSpine, 0.24, "y"), materialIndex: 4 },
        { mesh: tubeSweepMesh([[0, 0, 0.25, 0.01], [0, 0, 0.96, 0.0055]], 6, true), materialIndex: 6 }
      ];
      for (const sy of [-1, 1] as const) {
        slots.push({
          mesh: sculptDiamondBladeMesh(
            [
              [0, sy * 0.042, 0.24, 0.018],
              [0, sy * 0.115, 0.285, 0.011],
              [0, sy * 0.155, 0.33, 0.0025]
            ],
            0.45,
            "x"
          ),
          materialIndex: 1
        });
      }
      return slots;
    }
  }
}

function buildShieldSlots(fighterId: GladiatorArchetypeId): MultiMatSlot[] {
  // Mounted in left `elbow-l` local space (`[0, 0, 0]` = left elbow, `[0, -0.26, 0.02]` = left hand)
  const outAngle = Math.PI * 0.5;
  switch (fighterId) {
    case "kenji": {
      // KENJI (Storm Karateka — UNARMED): Left `kote-maki` martial cloth wrap + braided dojo cord tails + storm bead!
      const forearmClothWrap = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.235, rx: 0.046, rz: 0.046, zBias: 0.006, foldAmp: 0.003 },
            { y: -0.165, rx: 0.052, rz: 0.054, zBias: 0.004, foldAmp: 0.004 },
            { y: -0.095, rx: 0.058, rz: 0.06, zBias: 0.002, foldAmp: 0.004 }
          ],
          { segments: 18, foldCount: 7, wallThickness: 0.006, seed: 801 }
        ),
        3
      );
      const leftKnuckleWrap = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.305, rx: 0.044, rz: 0.036, zBias: 0.012 },
            { y: -0.268, rx: 0.048, rz: 0.04, zBias: 0.01, foldAmp: 0.003 },
            { y: -0.232, rx: 0.044, rz: 0.042, zBias: 0.006 }
          ],
          { segments: 16, foldCount: 5, wallThickness: 0.006, seed: 802 }
        ),
        3
      );
      const spiralDojoCord = smoothMesh(
        tubeSweepMesh(
          [
            [0.05, -0.22, 0.01, 0.007],
            [0.01, -0.19, 0.054, 0.0075],
            [-0.048, -0.16, 0.005, 0.007],
            [0.008, -0.13, -0.054, 0.0075],
            [0.056, -0.105, 0.008, 0.0075]
          ],
          7,
          true
        ),
        2
      );
      const tailA = smoothMesh(
        sculptCurvedHairLockMesh({
          root: [0.054, -0.215, -0.012],
          mid: [0.084, -0.268, -0.058],
          tip: [0.088, -0.335, -0.096],
          width: 0.015,
          thickness: 0.008,
          segments: 8
        }),
        2
      );
      const tailB = smoothMesh(
        sculptCurvedHairLockMesh({
          root: [0.05, -0.222, -0.02],
          mid: [0.068, -0.258, -0.058],
          tip: [0.076, -0.305, -0.092],
          width: 0.013,
          thickness: 0.007,
          segments: 7
        }),
        2
      );
      return [
        { mesh: forearmClothWrap, materialIndex: 4 },
        { mesh: leftKnuckleWrap, materialIndex: 4 },
        { mesh: spiralDojoCord, materialIndex: 3 },
        { mesh: tailA, materialIndex: 3 },
        { mesh: tailB, materialIndex: 3 },
        {
          mesh: transformMesh(
            latheMesh([[0, -0.01], [0.016, -0.006], [0.016, 0.008], [0, 0.012]], 12),
            { pos: [0.058, -0.175, 0.012], rot: [0, 0, -Math.PI * 0.5] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.0065, 1), {
            pos: [0.07, -0.175, 0.012],
            scale: [0.6, 1, 1]
          }),
          materialIndex: 6
        }
      ];
    }

    case "volt": {
      // VOLT (Rushdown Boxer — UNARMED): Smooth contoured left lead-guard pro boxing glove + quilted forearm parry pad!
      const leftGloveDome = transformMesh(
        smoothMesh(
          subdivideSmoothMesh(
            loftSectionsMesh(
              [
                makeFlutedRing(-0.088, 0.052, 0.046, 0.016, { segments: 18, frontKeel: 0.14 }),
                makeFlutedRing(-0.058, 0.074, 0.068, 0.02, { segments: 18, frontKeel: 0.18 }),
                makeFlutedRing(-0.018, 0.078, 0.072, 0.016, { segments: 18, frontKeel: 0.16 }),
                makeFlutedRing(0.022, 0.066, 0.06, 0.006, { segments: 18, frontKeel: 0.08 }),
                makeFlutedRing(0.048, 0.052, 0.048, 0.002, { segments: 18 })
              ],
              true
            ),
            1,
            0.45
          ),
          5
        ),
        { pos: [0, -0.26, 0.02] }
      );
      const leftThumbBolster = transformMesh(
        smoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [-0.052, 0.018, 0.012], rx: 0.024, rz: 0.026 },
              { pos: [-0.068, -0.014, 0.028], rx: 0.028, rz: 0.03 },
              { pos: [-0.062, -0.046, 0.038], rx: 0.025, rz: 0.026 },
              { pos: [-0.046, -0.064, 0.04], rx: 0.018, rz: 0.02 }
            ],
            { ringPoints: 12, muscleBiasZ: 0.004, peakT: 0.45 }
          ),
          4
        ),
        { pos: [0, -0.26, 0.02] }
      );
      const leftWristCuff = transformMesh(
        smoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: 0.032, rx: 0.054, rz: 0.05, zBias: 0.002 },
              { y: 0.068, rx: 0.056, rz: 0.052, zBias: 0, foldAmp: 0.002 },
              { y: 0.108, rx: 0.054, rz: 0.05, zBias: 0 }
            ],
            { segments: 18, foldCount: 4, wallThickness: 0.008, seed: 812 }
          ),
          3
        ),
        { pos: [0, -0.26, 0.02] }
      );
      const leftLaces = smoothMesh(
        tubeSweepMesh(
          [
            [-0.018, -0.218, -0.032, 0.006],
            [0.018, -0.202, -0.034, 0.006],
            [-0.018, -0.186, -0.034, 0.006],
            [0.018, -0.17, -0.032, 0.006]
          ],
          7,
          true
        ),
        2
      );
      const forearmParryPad = sculptCurvedShell(
        [
          { y: -0.145, rx: 0.058, rz: 0.06, zBias: 0.006, arcHalfAngle: 1.05, centerAngle: outAngle, keel: 0.01 },
          { y: -0.065, rx: 0.064, rz: 0.066, zBias: 0.004, arcHalfAngle: 1.12, centerAngle: outAngle, keel: 0.012 }
        ],
        0.008,
        9,
        1
      );
      const leftSeam = tubeSweepMesh(
        [
          [0.064, -0.236, 0.038, 0.0045],
          [0.074, -0.28, 0.046, 0.005],
          [0.058, -0.328, 0.054, 0.0045]
        ],
        6,
        true
      );
      return [
        { mesh: leftGloveDome, materialIndex: 5 },
        { mesh: leftThumbBolster, materialIndex: 5 },
        { mesh: leftWristCuff, materialIndex: 5 },
        { mesh: leftLaces, materialIndex: 4 },
        { mesh: forearmParryPad, materialIndex: 0 },
        { mesh: forgedRivetMesh([0.022, -0.194, -0.033], 0.0055), materialIndex: 1 },
        { mesh: leftSeam, materialIndex: 6 }
      ];
    }

    case "boulder": {
      // BOULDER (Iron Grappler): Heavy Colosseum `Manica` Forearm Cestus-Guard & Spiked Left Gauntlet!
      const manicaShell = sculptCurvedShell(
        [
          { y: -0.255, rx: 0.074, rz: 0.082, zBias: 0.008, arcHalfAngle: 1.25, centerAngle: outAngle, keel: 0.018 },
          { y: -0.135, rx: 0.084, rz: 0.094, zBias: 0.006, arcHalfAngle: 1.32, centerAngle: outAngle, keel: 0.022, fluteCount: 3, fluteAmp: 0.005 },
          { y: -0.025, rx: 0.082, rz: 0.09, zBias: 0.004, arcHalfAngle: 1.26, centerAngle: outAngle, keel: 0.018 }
        ],
        0.011,
        11,
        1
      );
      const leftCestus = smoothMesh(
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.12, 0.11, 0.126, 0.03), { pos: [0, -0.282, 0.034] }),
          1,
          0.45
        ),
        4
      );
      const slots: MultiMatSlot[] = [
        { mesh: manicaShell, materialIndex: 4 },
        { mesh: leftCestus, materialIndex: 4 },
        {
          mesh: latheMesh(
            [
              [0.068, -0.165],
              [0.082, -0.162],
              [0.082, -0.138],
              [0.068, -0.135]
            ],
            16
          ),
          materialIndex: 5
        },
        {
          mesh: tubeSweepMesh([[-0.046, -0.28, -0.018, 0.011], [0.046, -0.28, -0.018, 0.011]], 8, true),
          materialIndex: 8
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.014, 1), {
            pos: [0.092, -0.135, 0.008],
            scale: [0.65, 1.1, 1.1]
          }),
          materialIndex: 6
        }
      ];
      for (const kx of [-0.036, 0, 0.036] as const) {
        slots.push({
          mesh: transformMesh(
            latheMesh([[0, 0], [0.013, 0], [0.008, 0.024], [0, 0.044]], 10),
            { pos: [kx, -0.312, 0.092], rot: [Math.PI * 0.42, 0, 0] }
          ),
          materialIndex: 1
        });
      }
      return slots;
    }

    case "seraph": {
      // SERAPH (Spear Saint): Sacred Lotus Prayer Buckler & Coiled Mala Prayer Beads!
      const lotusBucklerOuter = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.235, rx: 0.072, rz: 0.118, arcHalfAngle: 0.92, centerAngle: outAngle, keel: 0.018, fluteCount: 4, fluteAmp: 0.005 },
            { y: -0.125, rx: 0.078, rz: 0.138, arcHalfAngle: 0.98, centerAngle: outAngle, keel: 0.022, fluteCount: 4, fluteAmp: 0.006 },
            { y: -0.015, rx: 0.072, rz: 0.118, arcHalfAngle: 0.92, centerAngle: outAngle, keel: 0.018, fluteCount: 4, fluteAmp: 0.005 }
          ],
          0.01,
          11,
          1
        ),
        { pos: [0.018, 0, 0.014] }
      );
      const lotusInnerMedallion = transformMesh(
        latheMesh([[0, 0], [0.068, 0], [0.062, 0.016], [0.028, 0.028], [0, 0.034]], 18),
        { pos: [0.094, -0.125, 0.014], rot: [0, 0, -Math.PI * 0.5] }
      );
      const prayerTassel = smoothMesh(
        sculptCurvedHairLockMesh({
          root: [0.038, -0.245, 0.02],
          mid: [0.052, -0.305, 0.008],
          tip: [0.048, -0.365, -0.014],
          width: 0.018,
          thickness: 0.01,
          segments: 8
        }),
        2
      );
      const slots: MultiMatSlot[] = [
        { mesh: lotusBucklerOuter, materialIndex: 1 },
        { mesh: lotusInnerMedallion, materialIndex: 0 },
        { mesh: prayerTassel, materialIndex: 3 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.016, 1), {
            pos: [0.126, -0.125, 0.014],
            scale: [0.6, 1.1, 1.1]
          }),
          materialIndex: 6
        }
      ];
      // 12 smooth carved wooden `mala` prayer beads wrapped around the wrist
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        slots.push({
          mesh: transformMesh(icosphereSmoothMesh(0.0125, 1), {
            pos: [Math.sin(a) * 0.052, -0.228 + Math.sin(a * 2) * 0.006, Math.cos(a) * 0.052 + 0.008]
          }),
          materialIndex: 5
        });
      }
      return slots;
    }

    case "jinx": {
      // JINX (Trickster): Reverse-Grip Bladed Kinetic Tonfa!
      const tonfaBladeSpine: V4[] = [
        [0.068, -0.34, 0.095, 0.006],
        [0.07, -0.24, 0.055, 0.028],
        [0.072, -0.08, 0.02, 0.032],
        [0.07, 0.08, -0.01, 0.022],
        [0.068, 0.145, -0.022, 0.004]
      ];
      return [
        {
          mesh: tubeSweepMesh([[0.005, -0.26, 0.02, 0.015], [0.066, -0.26, 0.042, 0.016]], 8, true),
          materialIndex: 5
        },
        {
          mesh: tubeSweepMesh([[0.064, -0.31, 0.078, 0.014], [0.066, 0.11, -0.015, 0.015]], 10, true),
          materialIndex: 5
        },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.034, 0], [0.036, 0.014], [0, 0.018]], 14),
            { pos: [0.058, -0.26, 0.038], rot: [0, 0, -Math.PI * 0.5] }
          ),
          materialIndex: 1
        },
        { mesh: sculptDiamondBladeMesh(tonfaBladeSpine, 0.24, "x"), materialIndex: 4 },
        {
          mesh: tubeSweepMesh([[0.074, -0.23, 0.052, 0.005], [0.074, 0.06, -0.006, 0.0045]], 6, true),
          materialIndex: 6
        }
      ];
    }

    case "sovereign": {
      // SOVEREIGN (Iron Crown Boss): Ornate Royal Iron Crown Crest Shield!
      const heaterOuter = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.32, rx: 0.095, rz: 0.055, arcHalfAngle: 0.66, centerAngle: outAngle, keel: 0.02 },
            { y: -0.12, rx: 0.116, rz: 0.175, arcHalfAngle: 0.94, centerAngle: outAngle, keel: 0.026 },
            { y: 0.12, rx: 0.12, rz: 0.205, arcHalfAngle: 0.98, centerAngle: outAngle, keel: 0.028 },
            { y: 0.24, rx: 0.116, rz: 0.198, arcHalfAngle: 0.96, centerAngle: outAngle, keel: 0.024 }
          ],
          0.015,
          11,
          1
        ),
        { pos: [0.018, -0.08, 0.02] }
      );
      const heaterField = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.23, rx: 0.108, rz: 0.072, arcHalfAngle: 0.68, centerAngle: outAngle, keel: 0.022 },
            { y: 0.08, rx: 0.118, rz: 0.155, arcHalfAngle: 0.84, centerAngle: outAngle, keel: 0.028 },
            { y: 0.18, rx: 0.115, rz: 0.15, arcHalfAngle: 0.82, centerAngle: outAngle, keel: 0.024 }
          ],
          0.008,
          9,
          1
        ),
        { pos: [0.028, -0.08, 0.02] }
      );
      return [
        { mesh: heaterOuter, materialIndex: 1 },
        { mesh: heaterField, materialIndex: 3 },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.062, 0], [0.056, 0.022], [0.024, 0.044], [0, 0.056]], 16),
            { pos: [0.148, -0.04, 0.02], rot: [0, 0, -Math.PI * 0.5] }
          ),
          materialIndex: 0
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.018, 1), {
            pos: [0.202, -0.04, 0.02],
            scale: [0.6, 1.1, 1.1]
          }),
          materialIndex: 6
        }
      ];
    }
  }
}

function buildThighCuisseSlots(
  fighterId: GladiatorArchetypeId,
  sideSign: 1 | -1,
  b: ArchetypeBuild
): MultiMatSlot[] {
  const ls = b.limbScale;
  const frontOutAngle = sideSign * 0.34;

  switch (fighterId) {
    case "kenji": {
      // KENJI: Loose billowed storm-teal karate `zubon` gi trouser leg with soft fabric folds!
      const innerThigh = smoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, 0.048, 0], rx: 0.068 * ls, rz: 0.072 * ls },
            { pos: [sideSign * 0.004, -0.16, 0.006], rx: 0.076 * ls, rz: 0.08 * ls, zOffset: 0.005 },
            { pos: [0, -0.395, 0], rx: 0.056 * ls, rz: 0.06 * ls }
          ],
          { ringPoints: 14, muscleBiasZ: 0.01, peakT: 0.38 }
        ),
        3
      );
      const giPantsThigh = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.405, rx: 0.098 * ls, rz: 0.104 * ls, zBias: 0.004, foldAmp: 0.009 },
            { y: -0.26, rx: 0.108 * ls, rz: 0.114 * ls, zBias: 0.006, foldAmp: 0.01 },
            { y: -0.11, rx: 0.112 * ls, rz: 0.118 * ls, zBias: 0.005, foldAmp: 0.009 },
            { y: 0.045, rx: 0.096 * ls, rz: 0.102 * ls, zBias: 0.002, foldAmp: 0.006 }
          ],
          { segments: 22, foldCount: 8, wallThickness: 0.008, seed: sideSign > 0 ? 901 : 902 }
        ),
        4
      );
      const sideSeamCord = smoothMesh(
        tubeSweepMesh(
          [
            [sideSign * 0.106 * ls, 0.02, 0.004, 0.0055],
            [sideSign * 0.114 * ls, -0.18, 0.006, 0.006],
            [sideSign * 0.1 * ls, -0.39, 0.004, 0.0055]
          ],
          6,
          true
        ),
        2
      );
      return [
        { mesh: innerThigh, materialIndex: 2 },
        { mesh: giPantsThigh, materialIndex: 0 },
        { mesh: sideSeamCord, materialIndex: 3 },
        { mesh: forgedRivetMesh([sideSign * 0.096 * ls, 0.02, 0.012], 0.006), materialIndex: 1 }
      ];
    }

    case "volt": {
      // VOLT: Sleek tapered dockside fighter trousers with utility thigh strap & athletic piping!
      const boxerTrouserThigh = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.4, rx: 0.072 * ls, rz: 0.078 * ls, zBias: 0.004, foldAmp: 0.005 },
            { y: -0.24, rx: 0.088 * ls, rz: 0.094 * ls, zBias: 0.008, foldAmp: 0.006 },
            { y: -0.09, rx: 0.096 * ls, rz: 0.102 * ls, zBias: 0.006, foldAmp: 0.006 },
            { y: 0.048, rx: 0.084 * ls, rz: 0.09 * ls, zBias: 0.002, foldAmp: 0.004 }
          ],
          { segments: 22, foldCount: 7, wallThickness: 0.007, seed: sideSign > 0 ? 911 : 912 }
        ),
        4
      );
      const athleticPiping = smoothMesh(
        tubeSweepMesh(
          [
            [sideSign * 0.086 * ls, 0.03, 0.008, 0.006],
            [sideSign * 0.098 * ls, -0.16, 0.01, 0.0065],
            [sideSign * 0.074 * ls, -0.39, 0.006, 0.0055]
          ],
          7,
          true
        ),
        2
      );
      const thighStrap = latheMesh(
        [
          [0.084 * ls, -0.185],
          [0.098 * ls, -0.182],
          [0.098 * ls, -0.152],
          [0.084 * ls, -0.148]
        ],
        18
      );
      return [
        { mesh: boxerTrouserThigh, materialIndex: 0 },
        { mesh: athleticPiping, materialIndex: 3 },
        { mesh: thighStrap, materialIndex: 5 },
        { mesh: forgedRivetMesh([sideSign * 0.096 * ls, -0.167, 0.024], 0.007), materialIndex: 1 }
      ];
    }

    case "boulder": {
      // BOULDER: Massive bare muscular quadriceps & hamstrings with riveted leather brawler straps!
      const massiveQuad = smoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, 0.055, 0], rx: 0.078 * ls, rz: 0.084 * ls },
            { pos: [sideSign * 0.006, -0.055, 0.008], rx: 0.096 * ls, rz: 0.104 * ls, zOffset: 0.008 },
            { pos: [sideSign * 0.006, -0.175, 0.012], rx: 0.094 * ls, rz: 0.102 * ls, zOffset: 0.012 },
            { pos: [sideSign * 0.003, -0.295, 0.005], rx: 0.076 * ls, rz: 0.082 * ls, zOffset: 0.005 },
            { pos: [0, -0.4, 0], rx: 0.062 * ls, rz: 0.066 * ls }
          ],
          { ringPoints: 18, muscleBiasZ: 0.018, peakT: 0.38 }
        ),
        3
      );
      const breechCuff = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.075, rx: 0.098 * ls, rz: 0.106 * ls, zBias: 0.006, foldAmp: 0.005 },
            { y: 0.052, rx: 0.088 * ls, rz: 0.094 * ls, zBias: 0.002, foldAmp: 0.004 }
          ],
          { segments: 18, foldCount: 6, wallThickness: 0.008, seed: 921 }
        ),
        3
      );
      return [
        { mesh: massiveQuad, materialIndex: 2 },
        { mesh: breechCuff, materialIndex: 3 },
        {
          mesh: latheMesh(
            [
              [0.086 * ls, -0.205],
              [0.102 * ls, -0.202],
              [0.102 * ls, -0.172],
              [0.086 * ls, -0.168]
            ],
            18
          ),
          materialIndex: 5
        },
        { mesh: forgedRivetMesh([sideSign * 0.1 * ls, -0.187, 0.025], 0.0085), materialIndex: 1 }
      ];
    }

    case "seraph": {
      // SERAPH: Flowing pleated monastery silk trousers + side brocade cord!
      const monkTrouser = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.4, rx: 0.088 * ls, rz: 0.094 * ls, zBias: 0.004, foldAmp: 0.008 },
            { y: -0.22, rx: 0.102 * ls, rz: 0.108 * ls, zBias: 0.006, foldAmp: 0.009 },
            { y: 0.045, rx: 0.09 * ls, rz: 0.096 * ls, zBias: 0.002, foldAmp: 0.006 }
          ],
          { segments: 22, foldCount: 8, wallThickness: 0.008, seed: sideSign > 0 ? 931 : 932 }
        ),
        4
      );
      const brocadeStripe = smoothMesh(
        tubeSweepMesh(
          [
            [sideSign * 0.092 * ls, 0.02, 0.004, 0.006],
            [sideSign * 0.104 * ls, -0.2, 0.006, 0.0065],
            [sideSign * 0.09 * ls, -0.38, 0.004, 0.0055]
          ],
          7,
          true
        ),
        2
      );
      return [
        { mesh: monkTrouser, materialIndex: 0 },
        { mesh: brocadeStripe, materialIndex: 3 },
        { mesh: forgedRivetMesh([sideSign * 0.096 * ls, -0.08, 0.018], 0.007), materialIndex: 1 }
      ];
    }

    case "jinx": {
      // JINX: Tapered pleated shinobi `hakama`-jogger thigh + kunai holster strap!
      const shinobiThigh = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.4, rx: 0.072 * ls, rz: 0.078 * ls, zBias: 0.004, foldAmp: 0.006 },
            { y: -0.22, rx: 0.092 * ls, rz: 0.098 * ls, zBias: 0.006, foldAmp: 0.008 },
            { y: 0.045, rx: 0.084 * ls, rz: 0.09 * ls, zBias: 0.002, foldAmp: 0.005 }
          ],
          { segments: 20, foldCount: 7, wallThickness: 0.007, seed: sideSign > 0 ? 941 : 942 }
        ),
        4
      );
      const holsterStrap = latheMesh(
        [
          [0.082 * ls, -0.215],
          [0.096 * ls, -0.212],
          [0.096 * ls, -0.184],
          [0.082 * ls, -0.18]
        ],
        18
      );
      const accentWrap = latheMesh(
        [
          [0.076 * ls, -0.295],
          [0.088 * ls, -0.292],
          [0.088 * ls, -0.272],
          [0.076 * ls, -0.268]
        ],
        16
      );
      return [
        { mesh: shinobiThigh, materialIndex: 0 },
        { mesh: holsterStrap, materialIndex: 5 },
        { mesh: accentWrap, materialIndex: 3 },
        { mesh: forgedRivetMesh([sideSign * 0.094 * ls, -0.198, 0.02], 0.007), materialIndex: 1 }
      ];
    }

    case "sovereign": {
      const thighAnatomy = smoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, 0.052, 0], rx: 0.072 * ls, rz: 0.076 * ls },
            { pos: [sideSign * 0.004, -0.045, 0.005], rx: 0.088 * ls, rz: 0.094 * ls, zOffset: 0.005 },
            { pos: [sideSign * 0.004, -0.155, 0.008], rx: 0.086 * ls, rz: 0.092 * ls, zOffset: 0.009 },
            { pos: [sideSign * 0.002, -0.285, 0.004], rx: 0.072 * ls, rz: 0.076 * ls, zOffset: 0.004 },
            { pos: [0, -0.4, 0], rx: 0.06 * ls, rz: 0.064 * ls }
          ],
          { ringPoints: 16, muscleBiasZ: 0.014, peakT: 0.38 }
        ),
        3
      );
      const cuissePlate = sculptCurvedShell(
        [
          { y: -0.355, rx: 0.078 * ls, rz: 0.084 * ls, zBias: 0.006, arcHalfAngle: 1.48, centerAngle: frontOutAngle, keel: 0.016, fluteCount: 3, fluteAmp: 0.004 },
          { y: -0.205, rx: 0.094 * ls, rz: 0.102 * ls, zBias: 0.01, arcHalfAngle: 1.56, centerAngle: frontOutAngle, keel: 0.022, fluteCount: 3, fluteAmp: 0.006 },
          { y: -0.055, rx: 0.096 * ls, rz: 0.104 * ls, zBias: 0.008, arcHalfAngle: 1.5, centerAngle: frontOutAngle, keel: 0.018, fluteCount: 3, fluteAmp: 0.005 }
        ],
        0.009,
        11,
        1
      );
      return [
        { mesh: thighAnatomy, materialIndex: 2 },
        { mesh: cuissePlate, materialIndex: 0 },
        {
          mesh: latheMesh(
            [
              [0.082 * ls, -0.145],
              [0.096 * ls, -0.142],
              [0.096 * ls, -0.12],
              [0.082 * ls, -0.116]
            ],
            16
          ),
          materialIndex: 5
        },
        { mesh: forgedRivetMesh([sideSign * 0.088 * ls, -0.085, 0.048 * ls], 0.008), materialIndex: 1 }
      ];
    }
  }
}

function buildGreaveSlots(
  fighterId: GladiatorArchetypeId,
  sideSign: 1 | -1,
  b: ArchetypeBuild
): MultiMatSlot[] {
  const ls = b.limbScale;

  const calfCore = smoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0.018, 0], rx: 0.056 * ls, rz: 0.06 * ls },
        { pos: [sideSign * 0.003, -0.105, -0.008], rx: 0.066 * ls, rz: 0.074 * ls, zOffset: -0.01 },
        { pos: [sideSign * 0.002, -0.245, -0.002], rx: 0.052 * ls, rz: 0.056 * ls, zOffset: -0.004 },
        { pos: [0, -0.395, 0.004], rx: 0.042 * ls, rz: 0.046 * ls }
      ],
      { ringPoints: 16, muscleBiasZ: -0.015, peakT: 0.34 }
    ),
    3
  );

  switch (fighterId) {
    case "kenji": {
      // KENJI: Loose karate `zubon` lower pant leg gathered cleanly above bare/taped ankle!
      const giPantsLower = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.295, rx: 0.064 * ls, rz: 0.068 * ls, zBias: 0.002, foldAmp: 0.006 },
            { y: -0.21, rx: 0.094 * ls, rz: 0.1 * ls, zBias: 0.002, foldAmp: 0.01 },
            { y: -0.085, rx: 0.1 * ls, rz: 0.106 * ls, zBias: 0.002, foldAmp: 0.01 },
            { y: 0.045, rx: 0.094 * ls, rz: 0.1 * ls, zBias: 0.004, foldAmp: 0.008 }
          ],
          { segments: 22, foldCount: 8, wallThickness: 0.008, seed: sideSign > 0 ? 1001 : 1002 }
        ),
        4
      );
      const ankleTapeUpper = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.402, rx: 0.045 * ls, rz: 0.049 * ls, zBias: 0.003, foldAmp: 0.002 },
            { y: -0.335, rx: 0.049 * ls, rz: 0.053 * ls, zBias: 0.002, foldAmp: 0.003 }
          ],
          { segments: 18, foldCount: 6, wallThickness: 0.005, seed: 1003 }
        ),
        3
      );
      const hemCord = latheMesh(
        [
          [0.056 * ls, -0.305],
          [0.068 * ls, -0.302],
          [0.068 * ls, -0.285],
          [0.056 * ls, -0.282]
        ],
        18
      );
      return [
        { mesh: calfCore, materialIndex: 2 },
        { mesh: giPantsLower, materialIndex: 0 },
        { mesh: ankleTapeUpper, materialIndex: 4 },
        { mesh: hemCord, materialIndex: 3 }
      ];
    }

    case "volt": {
      // VOLT: Contoured athletic knee-pad + tapered boxer jogger calf + high-top laced boxing boot shaft!
      const kneePad = sculptCurvedShell(
        [
          { y: -0.045, rx: 0.066 * ls, rz: 0.076 * ls, zBias: 0.008, arcHalfAngle: 1.25, keel: 0.012 },
          { y: 0.045, rx: 0.068 * ls, rz: 0.078 * ls, zBias: 0.008, arcHalfAngle: 1.28, keel: 0.014 }
        ],
        0.008,
        9,
        1
      );
      const joggerCalf = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.225, rx: 0.058 * ls, rz: 0.064 * ls, zBias: -0.002, foldAmp: 0.005 },
            { y: -0.11, rx: 0.074 * ls, rz: 0.082 * ls, zBias: -0.006, foldAmp: 0.006 },
            { y: 0.025, rx: 0.07 * ls, rz: 0.076 * ls, zBias: 0.002, foldAmp: 0.004 }
          ],
          { segments: 20, foldCount: 6, wallThickness: 0.007, seed: sideSign > 0 ? 1011 : 1012 }
        ),
        4
      );
      const highTopShaft = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.405, rx: 0.05 * ls, rz: 0.054 * ls, zBias: 0.003, foldAmp: 0.002 },
            { y: -0.31, rx: 0.054 * ls, rz: 0.058 * ls, zBias: 0.001, foldAmp: 0.003 },
            { y: -0.215, rx: 0.06 * ls, rz: 0.064 * ls, zBias: -0.001, foldAmp: 0.002 }
          ],
          { segments: 18, foldCount: 5, wallThickness: 0.007, seed: 1013 }
        ),
        3
      );
      const bootShaftLaces = smoothMesh(
        tubeSweepMesh(
          [
            [-0.02, -0.235, 0.062 * ls, 0.005],
            [0.02, -0.275, 0.06 * ls, 0.005],
            [-0.02, -0.315, 0.058 * ls, 0.005],
            [0.02, -0.355, 0.056 * ls, 0.005],
            [-0.018, -0.39, 0.054 * ls, 0.005]
          ],
          6,
          true
        ),
        2
      );
      return [
        { mesh: kneePad, materialIndex: 3 },
        { mesh: joggerCalf, materialIndex: 0 },
        { mesh: highTopShaft, materialIndex: 5 },
        { mesh: bootShaftLaces, materialIndex: 4 },
        { mesh: forgedRivetMesh([sideSign * 0.056 * ls, -0.245, 0.02], 0.006), materialIndex: 1 }
      ];
    }

    case "boulder": {
      // BOULDER: Bronze lion knee-guard + bare muscular calf + heavy iron-and-bronze colosseum greave!
      const bronzeKneeGuard = sculptCurvedShell(
        [
          { y: -0.058, rx: 0.072 * ls, rz: 0.084 * ls, zBias: 0.008, arcHalfAngle: 1.35, keel: 0.02 },
          { y: 0.008, rx: 0.078 * ls, rz: 0.094 * ls, zBias: 0.012, arcHalfAngle: 1.45, keel: 0.032, fluteCount: 3, fluteAmp: 0.006 },
          { y: 0.062, rx: 0.07 * ls, rz: 0.082 * ls, zBias: 0.008, arcHalfAngle: 1.32, keel: 0.018 }
        ],
        0.01,
        11,
        1
      );
      const ironShinPlate = sculptCurvedShell(
        [
          { y: -0.39, rx: 0.054 * ls, rz: 0.06 * ls, zBias: 0.006, arcHalfAngle: 1.48, keel: 0.016 },
          { y: -0.23, rx: 0.066 * ls, rz: 0.072 * ls, zBias: 0.004, arcHalfAngle: 1.54, keel: 0.02, fluteCount: 3, fluteAmp: 0.005 },
          { y: -0.095, rx: 0.076 * ls, rz: 0.082 * ls, zBias: 0.002, arcHalfAngle: 1.52, keel: 0.018 }
        ],
        0.009,
        11,
        1
      );
      return [
        { mesh: calfCore, materialIndex: 2 },
        { mesh: bronzeKneeGuard, materialIndex: 1 },
        { mesh: ironShinPlate, materialIndex: 4 },
        {
          mesh: latheMesh(
            [
              [0.066 * ls, -0.165],
              [0.078 * ls, -0.162],
              [0.078 * ls, -0.135],
              [0.066 * ls, -0.132]
            ],
            16
          ),
          materialIndex: 5
        }
      ];
    }

    case "seraph": {
      // SERAPH: Gathered silk lower trouser + crisscrossed `kyahan` monastery cloth shin-wraps!
      const monkShinWrap = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.395, rx: 0.048 * ls, rz: 0.052 * ls, zBias: 0.003, foldAmp: 0.004 },
            { y: -0.25, rx: 0.064 * ls, rz: 0.07 * ls, zBias: -0.004, foldAmp: 0.006 },
            { y: -0.11, rx: 0.082 * ls, rz: 0.088 * ls, zBias: -0.004, foldAmp: 0.008 },
            { y: 0.035, rx: 0.084 * ls, rz: 0.09 * ls, zBias: 0.002, foldAmp: 0.006 }
          ],
          { segments: 20, foldCount: 7, wallThickness: 0.007, seed: sideSign > 0 ? 1031 : 1032 }
        ),
        4
      );
      const crossRibbon = smoothMesh(
        tubeSweepMesh(
          [
            [-0.056 * ls, -0.14, 0.056 * ls, 0.0065],
            [0.052 * ls, -0.23, 0.052 * ls, 0.0065],
            [-0.048 * ls, -0.32, 0.048 * ls, 0.006],
            [0.045 * ls, -0.38, 0.046 * ls, 0.0055]
          ],
          7,
          true
        ),
        2
      );
      const kneeLotus = sculptCurvedShell(
        [
          { y: -0.04, rx: 0.066 * ls, rz: 0.074 * ls, zBias: 0.008, arcHalfAngle: 1.1, keel: 0.016 },
          { y: 0.04, rx: 0.064 * ls, rz: 0.072 * ls, zBias: 0.008, arcHalfAngle: 1.05, keel: 0.014 }
        ],
        0.007,
        9,
        1
      );
      return [
        { mesh: monkShinWrap, materialIndex: 0 },
        { mesh: crossRibbon, materialIndex: 3 },
        { mesh: kneeLotus, materialIndex: 1 },
        {
          mesh: latheMesh(
            [
              [0.046 * ls, -0.385],
              [0.056 * ls, -0.382],
              [0.056 * ls, -0.362],
              [0.046 * ls, -0.358]
            ],
            16
          ),
          materialIndex: 5
        }
      ];
    }

    case "jinx": {
      // JINX: Articulated matte shinobi knee-cap + tight crisscrossed `kyahan` shin wraps!
      const shinobiKnee = sculptCurvedShell(
        [
          { y: -0.042, rx: 0.062 * ls, rz: 0.072 * ls, zBias: 0.008, arcHalfAngle: 1.2, keel: 0.016 },
          { y: 0.042, rx: 0.062 * ls, rz: 0.072 * ls, zBias: 0.008, arcHalfAngle: 1.2, keel: 0.016 }
        ],
        0.008,
        9,
        1
      );
      const kyahanWrap = smoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: -0.398, rx: 0.046 * ls, rz: 0.05 * ls, zBias: 0.003, foldAmp: 0.003 },
            { y: -0.24, rx: 0.06 * ls, rz: 0.066 * ls, zBias: -0.004, foldAmp: 0.005 },
            { y: -0.09, rx: 0.072 * ls, rz: 0.078 * ls, zBias: -0.004, foldAmp: 0.006 },
            { y: 0.03, rx: 0.07 * ls, rz: 0.076 * ls, zBias: 0.002, foldAmp: 0.004 }
          ],
          { segments: 20, foldCount: 7, wallThickness: 0.006, seed: sideSign > 0 ? 1041 : 1042 }
        ),
        4
      );
      const shinCord = smoothMesh(
        tubeSweepMesh(
          [
            [0.052 * ls, -0.15, 0.052 * ls, 0.0055],
            [-0.048 * ls, -0.24, 0.048 * ls, 0.0055],
            [0.045 * ls, -0.33, 0.046 * ls, 0.005]
          ],
          6,
          true
        ),
        2
      );
      return [
        { mesh: shinobiKnee, materialIndex: 5 },
        { mesh: kyahanWrap, materialIndex: 0 },
        { mesh: shinCord, materialIndex: 3 },
        { mesh: forgedRivetMesh([sideSign * 0.056 * ls, -0.19, 0.018], 0.0065), materialIndex: 1 }
      ];
    }

    case "sovereign": {
      const poleynCop = sculptCurvedShell(
        [
          { y: -0.068, rx: 0.072 * ls, rz: 0.084 * ls, zBias: 0.008, arcHalfAngle: 1.38, keel: 0.022 },
          { y: 0.002, rx: 0.078 * ls, rz: 0.096 * ls, zBias: 0.012, arcHalfAngle: 1.48, keel: 0.042, fluteCount: 3, fluteAmp: 0.006 },
          { y: 0.068, rx: 0.07 * ls, rz: 0.082 * ls, zBias: 0.008, arcHalfAngle: 1.35, keel: 0.02 }
        ],
        0.009,
        11,
        1
      );
      const schynbaldPlate = sculptCurvedShell(
        [
          { y: -0.392, rx: 0.052 * ls, rz: 0.058 * ls, zBias: 0.006, arcHalfAngle: 1.65, keel: 0.014 },
          { y: -0.245, rx: 0.062 * ls, rz: 0.068 * ls, zBias: 0.004, arcHalfAngle: 1.72, keel: 0.018, fluteCount: 3, fluteAmp: 0.004 },
          { y: -0.105, rx: 0.074 * ls, rz: 0.08 * ls, zBias: 0.002, arcHalfAngle: 1.72, keel: 0.018, fluteCount: 3, fluteAmp: 0.005 }
        ],
        0.008,
        11,
        1
      );
      return [
        { mesh: calfCore, materialIndex: 2 },
        { mesh: poleynCop, materialIndex: 1 },
        { mesh: schynbaldPlate, materialIndex: 0 },
        {
          mesh: latheMesh(
            [
              [0.064 * ls, -0.155],
              [0.076 * ls, -0.152],
              [0.076 * ls, -0.132],
              [0.064 * ls, -0.128]
            ],
            16
          ),
          materialIndex: 5
        }
      ];
    }
  }
}

function clampFootAboveSole(mesh: RawMesh, minAllowedY = -0.0792): RawMesh {
  return deformMesh(mesh, ([x, y, z]) => [x, Math.max(minAllowedY, y), z]);
}

function buildSabatonSlots(
  fighterId: GladiatorArchetypeId,
  sideSign: 1 | -1,
  b: ArchetypeBuild
): MultiMatSlot[] {
  const ls = b.limbScale;
  // Kinematic chain rest height at ankle origin = 0.94 - 0.04 - 0.41 - 0.41 = +0.080 m.
  // Every archetype's contact sole places its bottom face at exact y = -0.080 m -> world minY = 0.000 m!
  switch (fighterId) {
    case "kenji": {
      // KENJI (Storm Karateka): Bare martial-arts feet + 5 sculpted toes + white cotton ankle/instep wraps!
      const plantarContactPad = transformMesh(bevelBoxMesh(0.088 * ls, 0.014, 0.204, 0.004), {
        pos: [0, -0.073, 0.038]
      });
      const bareFootBody = clampFootAboveSole(
        smoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, -0.012, -0.022], rx: 0.044 * ls, rz: 0.048 },
              { pos: [0, -0.048, -0.016], rx: 0.046 * ls, rz: 0.056 },
              { pos: [0, -0.054, 0.048], rx: 0.048 * ls, rz: 0.058 },
              { pos: [0, -0.062, 0.112], rx: 0.048 * ls, rz: 0.042 }
            ],
            { ringPoints: 16, muscleBiasZ: 0.006, peakT: 0.45 }
          ),
          4
        )
      );
      const instepCottonWrap = clampFootAboveSole(
        smoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: -0.058, rx: 0.049 * ls, rz: 0.046, zBias: 0.038, foldAmp: 0.002 },
              { y: -0.028, rx: 0.048 * ls, rz: 0.05, zBias: 0.018, foldAmp: 0.003 },
              { y: 0.008, rx: 0.046 * ls, rz: 0.048, zBias: 0.002, foldAmp: 0.002 }
            ],
            { segments: 18, foldCount: 6, wallThickness: 0.005, seed: 1101 }
          ),
          3
        )
      );
      const ankleCordTie = latheMesh(
        [
          [0.042 * ls, -0.004],
          [0.05 * ls, -0.002],
          [0.05 * ls, 0.012],
          [0.042 * ls, 0.014]
        ],
        16
      );
      const slots: MultiMatSlot[] = [
        { mesh: plantarContactPad, materialIndex: 2 },
        { mesh: bareFootBody, materialIndex: 2 },
        { mesh: instepCottonWrap, materialIndex: 4 },
        { mesh: ankleCordTie, materialIndex: 3 },
        { mesh: forgedRivetMesh([sideSign * 0.046 * ls, 0.005, 0.012], 0.005), materialIndex: 1 }
      ];
      // 5 sculpted bare martial-arts toes ordered from big toe (inner) to little toe (outer)
      const toeSpecs = [
        [-sideSign * 0.028 * ls, 0.148, 0.013, 0.024],
        [-sideSign * 0.011 * ls, 0.152, 0.01, 0.022],
        [sideSign * 0.005 * ls, 0.148, 0.0095, 0.02],
        [sideSign * 0.02 * ls, 0.142, 0.009, 0.018],
        [sideSign * 0.034 * ls, 0.134, 0.0085, 0.016]
      ] as const;
      for (const [tx, tz, tr, tLen] of toeSpecs) {
        slots.push({
          mesh: clampFootAboveSole(
            smoothMesh(
              tubeSweepMesh(
                [
                  [tx, -0.066, tz - tLen * 0.5, tr],
                  [tx, -0.068, tz + tLen * 0.5, tr * 0.86]
                ],
                8,
                true
              ),
              2
            )
          ),
          materialIndex: 2
        });
      }
      return slots;
    }

    case "volt": {
      // VOLT (Rushdown Boxer): Laced high-top pro leather boxing boots with grippy dark rubber outsole!
      const rubberOutsole = transformMesh(bevelBoxMesh(0.098 * ls, 0.018, 0.242, 0.004), {
        pos: [0, -0.071, 0.044]
      });
      const leatherVamp = clampFootAboveSole(
        smoothMesh(
          subdivideSmoothMesh(
            loftSectionsMesh(
              [
                makeFlutedRing(-0.062, 0.05 * ls, 0.118, 0.044, { segments: 18, frontKeel: 0.08 }),
                makeFlutedRing(-0.034, 0.048 * ls, 0.106, 0.036, { segments: 18, frontKeel: 0.08 }),
                makeFlutedRing(-0.004, 0.046 * ls, 0.062, -0.004, { segments: 18 })
              ],
              true
            ),
            1,
            0.44
          ),
          4
        )
      );
      const ankleCollar = clampFootAboveSole(
        smoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: -0.022, rx: 0.05 * ls, rz: 0.056, zBias: -0.002, foldAmp: 0.002 },
              { y: 0.038, rx: 0.052 * ls, rz: 0.056, zBias: 0.002, foldAmp: 0.003 }
            ],
            { segments: 18, foldCount: 5, wallThickness: 0.007, seed: 1112 }
          ),
          3
        )
      );
      const instepLaces = clampFootAboveSole(
        smoothMesh(
          tubeSweepMesh(
            [
              [-0.018, 0.024, 0.052, 0.005],
              [0.018, -0.002, 0.068, 0.005],
              [-0.018, -0.024, 0.088, 0.005],
              [0.018, -0.042, 0.112, 0.005]
            ],
            6,
            true
          ),
          2
        )
      );
      const sideAnkleGuard = clampFootAboveSole(
        sculptCurvedShell(
          [
            { y: -0.042, rx: 0.052 * ls, rz: 0.058, zBias: -0.006, arcHalfAngle: 0.9, centerAngle: sideSign * Math.PI * 0.5, keel: 0.008 },
            { y: 0.018, rx: 0.052 * ls, rz: 0.056, zBias: -0.004, arcHalfAngle: 0.9, centerAngle: sideSign * Math.PI * 0.5, keel: 0.008 }
          ],
          0.006,
          9,
          1
        )
      );
      return [
        { mesh: rubberOutsole, materialIndex: 8 },
        { mesh: leatherVamp, materialIndex: 5 },
        { mesh: ankleCollar, materialIndex: 5 },
        { mesh: instepLaces, materialIndex: 4 },
        { mesh: sideAnkleGuard, materialIndex: 0 },
        { mesh: forgedRivetMesh([-0.02, 0.012, 0.058], 0.005), materialIndex: 1 },
        { mesh: forgedRivetMesh([0.02, 0.012, 0.058], 0.005), materialIndex: 1 }
      ];
    }

    case "boulder": {
      // BOULDER: Heavy strapped leather colosseum war-boots with bronze toe-cap!
      const heavySole = transformMesh(bevelBoxMesh(0.112 * ls, 0.022, 0.256, 0.005), {
        pos: [0, -0.069, 0.048]
      });
      const leatherBootBody = clampFootAboveSole(
        smoothMesh(
          subdivideSmoothMesh(
            loftSectionsMesh(
              [
                makeFlutedRing(-0.058, 0.054 * ls, 0.12, 0.046, { segments: 18 }),
                makeFlutedRing(-0.025, 0.052 * ls, 0.098, 0.032, { segments: 18 }),
                makeFlutedRing(0.015, 0.05 * ls, 0.062, -0.004, { segments: 18 })
              ],
              true
            ),
            1,
            0.44
          ),
          4
        )
      );
      const bronzeToeCap = clampFootAboveSole(
        sculptCurvedShell(
          [
            { y: -0.06, rx: 0.054 * ls, rz: 0.068, zBias: 0.112, arcHalfAngle: 1.45, keel: 0.014 },
            { y: -0.032, rx: 0.05 * ls, rz: 0.062, zBias: 0.098, arcHalfAngle: 1.38, keel: 0.012 }
          ],
          0.008,
          9,
          1
        )
      );
      const heelGuard = clampFootAboveSole(
        sculptCurvedShell(
          [
            { y: -0.058, rx: 0.054 * ls, rz: 0.064, zBias: -0.014, arcHalfAngle: 1.35, centerAngle: Math.PI, keel: 0.008 },
            { y: -0.008, rx: 0.05 * ls, rz: 0.058, zBias: -0.01, arcHalfAngle: 1.3, centerAngle: Math.PI, keel: 0.006 }
          ],
          0.008,
          9,
          1
        )
      );
      return [
        { mesh: heavySole, materialIndex: 8 },
        { mesh: leatherBootBody, materialIndex: 5 },
        { mesh: bronzeToeCap, materialIndex: 1 },
        { mesh: heelGuard, materialIndex: 4 }
      ];
    }

    case "seraph": {
      // SERAPH: Cloud-scroll monastery martial boots!
      const monkSole = transformMesh(bevelBoxMesh(0.096 * ls, 0.018, 0.238, 0.004), {
        pos: [0, -0.071, 0.044]
      });
      const monkBootUpper = clampFootAboveSole(
        smoothMesh(
          subdivideSmoothMesh(
            loftSectionsMesh(
              [
                makeFlutedRing(-0.06, 0.048 * ls, 0.114, 0.044, { segments: 18, frontKeel: 0.1 }),
                makeFlutedRing(-0.028, 0.046 * ls, 0.096, 0.032, { segments: 18, frontKeel: 0.08 }),
                makeFlutedRing(0.014, 0.045 * ls, 0.056, -0.002, { segments: 18 })
              ],
              true
            ),
            1,
            0.44
          ),
          4
        )
      );
      const silkAnkleFold = clampFootAboveSole(
        smoothMesh(
          sculptDrapedGarmentMesh(
            [
              { y: -0.018, rx: 0.048 * ls, rz: 0.054, zBias: 0, foldAmp: 0.003 },
              { y: 0.028, rx: 0.05 * ls, rz: 0.056, zBias: 0.002, foldAmp: 0.004 }
            ],
            { segments: 18, foldCount: 6, wallThickness: 0.006, seed: 1131 }
          ),
          3
        )
      );
      const cloudToeTrim = clampFootAboveSole(
        tubeSweepMesh(
          [
            [-0.038 * ls, -0.054, 0.105, 0.0065],
            [0, -0.046, 0.162, 0.0075],
            [0.038 * ls, -0.054, 0.105, 0.0065]
          ],
          7,
          true
        )
      );
      return [
        { mesh: monkSole, materialIndex: 8 },
        { mesh: monkBootUpper, materialIndex: 5 },
        { mesh: silkAnkleFold, materialIndex: 0 },
        { mesh: cloudToeTrim, materialIndex: 1 }
      ];
    }

    case "jinx": {
      // JINX: Sleek split-toe `tabi` shinobi boots!
      const tabiSole = transformMesh(bevelBoxMesh(0.092 * ls, 0.016, 0.232, 0.004), {
        pos: [0, -0.072, 0.042]
      });
      const tabiMidfoot = clampFootAboveSole(
        smoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, 0.012, -0.006], rx: 0.044 * ls, rz: 0.05 },
              { pos: [0, -0.034, 0.012], rx: 0.046 * ls, rz: 0.068 },
              { pos: [0, -0.054, 0.072], rx: 0.046 * ls, rz: 0.052 }
            ],
            { ringPoints: 16, muscleBiasZ: 0.006, peakT: 0.45 }
          ),
          4
        )
      );
      const splitBigToe = clampFootAboveSole(
        smoothMesh(
          tubeSweepMesh(
            [
              [-sideSign * 0.022 * ls, -0.056, 0.098, 0.018],
              [-sideSign * 0.024 * ls, -0.06, 0.152, 0.015]
            ],
            10,
            true
          ),
          3
        )
      );
      const splitOuterToes = clampFootAboveSole(
        smoothMesh(
          tubeSweepMesh(
            [
              [sideSign * 0.016 * ls, -0.056, 0.098, 0.024],
              [sideSign * 0.018 * ls, -0.06, 0.148, 0.02]
            ],
            10,
            true
          ),
          3
        )
      );
      const tabiWrapBand = latheMesh(
        [
          [0.042 * ls, -0.01],
          [0.05 * ls, -0.008],
          [0.05 * ls, 0.016],
          [0.042 * ls, 0.018]
        ],
        16
      );
      return [
        { mesh: tabiSole, materialIndex: 8 },
        { mesh: tabiMidfoot, materialIndex: 5 },
        { mesh: splitBigToe, materialIndex: 5 },
        { mesh: splitOuterToes, materialIndex: 5 },
        { mesh: tabiWrapBand, materialIndex: 4 },
        { mesh: forgedRivetMesh([-sideSign * 0.046 * ls, 0.004, -0.012], 0.0055), materialIndex: 1 }
      ];
    }

    case "sovereign": {
      const forgedSole = transformMesh(bevelBoxMesh(0.106 * ls, 0.02, 0.252, 0.005), {
        pos: [0, -0.07, 0.048]
      });
      const heelCounter = clampFootAboveSole(
        sculptCurvedShell(
          [
            { y: -0.062, rx: 0.054 * ls, rz: 0.068, zBias: -0.012, arcHalfAngle: 1.52, centerAngle: Math.PI, keel: 0.008 },
            { y: -0.004, rx: 0.048 * ls, rz: 0.06, zBias: -0.008, arcHalfAngle: 1.44, centerAngle: Math.PI, keel: 0.006 }
          ],
          0.008,
          9,
          1
        )
      );
      const slots: MultiMatSlot[] = [
        { mesh: forgedSole, materialIndex: 8 },
        { mesh: heelCounter, materialIndex: 0 }
      ];
      for (const [yBot, yTop, rx, rz, zBias] of [
        [-0.028, 0.008, 0.052 * ls, 0.068, 0.012],
        [-0.044, -0.012, 0.054 * ls, 0.076, 0.048],
        [-0.056, -0.026, 0.052 * ls, 0.078, 0.086],
        [-0.064, -0.038, 0.046 * ls, 0.082, 0.124]
      ] as const) {
        slots.push({
          mesh: clampFootAboveSole(
            sculptCurvedShell(
              [
                { y: yBot, rx, rz, zBias, arcHalfAngle: 1.54, keel: 0.014 },
                { y: yTop, rx: rx * 0.94, rz: rz * 0.92, zBias: zBias - 0.008, arcHalfAngle: 1.48, keel: 0.012 }
              ],
              0.007,
              9,
              1
            )
          ),
          materialIndex: 0
        });
      }
      slots.push(
        {
          mesh: clampFootAboveSole(
            tubeSweepMesh(
              [
                [0, 0.004, 0.068, 0.0075],
                [0, -0.026, 0.122, 0.008],
                [0, -0.052, 0.194, 0.007]
              ],
              6,
              true
            )
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.108 * ls, 0.014, 0.024, 0.004), { pos: [0, -0.036, -0.042] }),
          materialIndex: 5
        }
      );
      return slots;
    }
  }
}

function partNode(
  cacheKey: string,
  name: string,
  buildSlots: () => readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  castShadow = true
) {
  const spec = memoizeGeometry(cacheKey, () => {
    const rawSlots = buildSlots();
    const shadedSlots: MultiMatSlot[] = rawSlots.map((s) => ({
      materialIndex: s.materialIndex,
      mesh:
        s.materialIndex === 6
          ? finishArmorMesh(s.mesh, 0.06, 0.02)
          : s.materialIndex === 2
            ? finishArmorMesh(s.mesh, 0.18, 0.06)
            : s.materialIndex === 3 || s.materialIndex === 0
              ? finishArmorMesh(s.mesh, 0.28, 0.09)
              : finishArmorMesh(s.mesh, 0.25, 0.08)
    }));
    return buildGroupedGeometrySpec(shadedSlots);
  });

  return geometry
    .multiMaterial(spec, materials, {
      name,
      castShadow,
      receiveShadow: true
    })
    .runtime({ id: name });
}

export interface GladiatorPositionalPalette {
  readonly primary: string;
  readonly emissive?: string;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly lacquer?: boolean;
  readonly surfaceExtras?: boolean;
}

/**
 * Build a smooth, Meshy-grade, multi-material, anatomically articulated character rig
 * across all 6 Iron Crown roster archetypes (`kenji`, `volt`, `boulder`, `seraph`, `jinx`, `sovereign`).
 * Grounded cleanly at `y = 0` and hierarchically rigged across all 14 `GLADIATOR_JOINT_SUFFIXES`.
 * Supports both the `GladiatorRigOptions` object signature and the positional
 * `(idPrefix, palette, scale = 1, archetype?: GladiatorArchetypeId)` signature.
 */
export function buildArticulatedGladiatorRig(opts: GladiatorRigOptions): ReturnType<typeof group>;
export function buildArticulatedGladiatorRig(
  idPrefix: string,
  palette: GladiatorPositionalPalette | string,
  scale?: number,
  archetype?: GladiatorArchetypeId
): ReturnType<typeof group>;
export function buildArticulatedGladiatorRig(
  optsOrPrefix: GladiatorRigOptions | string,
  paletteArg?: GladiatorPositionalPalette | string,
  scaleArg = 1,
  archetypeArg?: GladiatorArchetypeId
) {
  const opts: GladiatorRigOptions =
    typeof optsOrPrefix === "string"
      ? {
          nodeId: optsOrPrefix,
          label: optsOrPrefix,
          fighterId: archetypeArg ?? "kenji",
          side: "p1",
          position: [0, 0, 0],
          yaw: 0,
          scale: scaleArg,
          primaryColor:
            typeof paletteArg === "string" ? paletteArg : (paletteArg?.primary ?? "#1f6865"),
          accentEmissive:
            typeof paletteArg === "object" && paletteArg?.emissive
              ? paletteArg.emissive
              : "#ff7242",
          roughness:
            typeof paletteArg === "object" && paletteArg?.roughness !== undefined
              ? paletteArg.roughness
              : 0.65,
          metallic:
            typeof paletteArg === "object" && paletteArg?.metallic !== undefined
              ? paletteArg.metallic
              : 0.08,
          lacquer: typeof paletteArg === "object" ? paletteArg?.lacquer : false,
          surfaceExtras: typeof paletteArg === "object" ? paletteArg?.surfaceExtras : true
        }
      : optsOrPrefix;

  const fighterId: GladiatorArchetypeId = opts.fighterId ?? "kenji";
  const b = ARCHETYPE_BUILDS[fighterId];
  const mats = buildGladiatorMaterials({ ...opts, fighterId });
  const id = (suffix: GladiatorJointSuffix) => `${opts.nodeId}-${suffix}`;
  const rt = (suffix: GladiatorJointSuffix) => game.runtimeNode(id(suffix));
  const geoKey = (part: string) => `ic-gladiator-v3:${fighterId}:${part}`;

  const weaponPart = group(id("weapon"), [
    partNode(geoKey("weapon"), `${id("weapon")}-mesh`, () => buildWeaponSlots(fighterId), mats, true)
  ])
    .position(0, -0.26, 0.02)
    .runtime(rt("weapon"));

  const shieldPart = group(id("shield"), [
    partNode(geoKey("shield"), `${id("shield")}-mesh`, () => buildShieldSlots(fighterId), mats, false)
  ])
    .position(0, 0, 0)
    .runtime(rt("shield"));

  const elbowR = group(id("elbow-r"), [
    partNode(
      geoKey("elbow-r"),
      `${id("elbow-r")}-mesh`,
      () => buildForearmGauntletSlots(fighterId, -1, b),
      mats,
      false
    ),
    weaponPart
  ])
    .position(0, -0.27, 0)
    .runtime(rt("elbow-r"));

  const shoulderR = group(id("shoulder-r"), [
    partNode(
      geoKey("shoulder-r"),
      `${id("shoulder-r")}-mesh`,
      () => buildUpperArmSlots(fighterId, -1, b),
      mats,
      true
    ),
    elbowR
  ])
    .position(-(b.chestWidth + 0.045), 0.36, 0)
    .runtime(rt("shoulder-r"));

  const elbowL = group(id("elbow-l"), [
    partNode(
      geoKey("elbow-l"),
      `${id("elbow-l")}-mesh`,
      () => buildForearmGauntletSlots(fighterId, 1, b),
      mats,
      false
    ),
    shieldPart
  ])
    .position(0, -0.27, 0)
    .runtime(rt("elbow-l"));

  const shoulderL = group(id("shoulder-l"), [
    partNode(
      geoKey("shoulder-l"),
      `${id("shoulder-l")}-mesh`,
      () => buildUpperArmSlots(fighterId, 1, b),
      mats,
      true
    ),
    elbowL
  ])
    .position(b.chestWidth + 0.045, 0.36, 0)
    .runtime(rt("shoulder-l"));

  const head = group(id("head"), [
    partNode(
      `${geoKey("head")}:${opts.side}`,
      `${id("head")}-mesh`,
      () => buildVisoredHelmSlots(fighterId, b, opts.side),
      mats,
      true
    )
  ])
    .position(0, 0.46, 0)
    .runtime(rt("head"));

  const torso = group(id("torso"), [
    partNode(geoKey("torso"), `${id("torso")}-mesh`, () => buildTorsoSlots(fighterId, b), mats, true),
    head,
    shoulderL,
    shoulderR
  ])
    .position(0, 0.08, 0)
    .runtime(rt("torso"));

  const ankleL = group(id("ankle-l"), [
    partNode(
      geoKey("ankle-l"),
      `${id("ankle-l")}-mesh`,
      () => buildSabatonSlots(fighterId, 1, b),
      mats,
      false
    )
  ])
    .position(0, -0.41, 0)
    .runtime(rt("ankle-l"));

  const kneeL = group(id("knee-l"), [
    partNode(
      geoKey("knee-l"),
      `${id("knee-l")}-mesh`,
      () => buildGreaveSlots(fighterId, 1, b),
      mats,
      false
    ),
    ankleL
  ])
    .position(0, -0.41, 0)
    .runtime(rt("knee-l"));

  const hipL = group(id("hip-l"), [
    partNode(
      geoKey("hip-l"),
      `${id("hip-l")}-mesh`,
      () => buildThighCuisseSlots(fighterId, 1, b),
      mats,
      true
    ),
    kneeL
  ])
    .position(0.125, -0.04, 0)
    .runtime(rt("hip-l"));

  const ankleR = group(id("ankle-r"), [
    partNode(
      geoKey("ankle-r"),
      `${id("ankle-r")}-mesh`,
      () => buildSabatonSlots(fighterId, -1, b),
      mats,
      false
    )
  ])
    .position(0, -0.41, 0)
    .runtime(rt("ankle-r"));

  const kneeR = group(id("knee-r"), [
    partNode(
      geoKey("knee-r"),
      `${id("knee-r")}-mesh`,
      () => buildGreaveSlots(fighterId, -1, b),
      mats,
      false
    ),
    ankleR
  ])
    .position(0, -0.41, 0)
    .runtime(rt("knee-r"));

  const hipR = group(id("hip-r"), [
    partNode(
      geoKey("hip-r"),
      `${id("hip-r")}-mesh`,
      () => buildThighCuisseSlots(fighterId, -1, b),
      mats,
      true
    ),
    kneeR
  ])
    .position(-0.125, -0.04, 0)
    .runtime(rt("hip-r"));

  const hips = group(id("hips"), [
    partNode(geoKey("hips"), `${id("hips")}-mesh`, () => buildPelvisSlots(fighterId, b), mats, true),
    torso,
    hipL,
    hipR
  ])
    .position(0, 0.94, 0)
    .runtime(rt("hips"));

  return group(opts.label, [hips])
    .position(opts.position[0], opts.position[1], opts.position[2])
    .rotate(0, opts.yaw, 0)
    .scale(opts.scale)
    .runtime(
      game.runtimeNode(opts.nodeId, {
        tags: opts.runtimeTags ?? ["fighter", fighterId, "procedural-gladiator"]
      })
    );
}

interface UpperPose {
  torso: V3;
  head: V3;
  shoulderL: V3;
  elbowL: V3;
  shoulderR: V3;
  elbowR: V3;
  weapon: V3;
}

function solveAttackUpperPose(kind: "light" | "heavy" | "special" | "throw", uRaw: number): UpperPose {
  const u = Math.max(0, Math.min(1, uRaw));
  // Smooth windup -> strike -> follow-through envelope
  const strike = u < 0.28
    ? -(u / 0.28) * 0.45
    : u < 0.58
      ? -0.45 + ((u - 0.28) / 0.3) * 1.45
      : 1.0 * (1 - ((u - 0.58) / 0.42) * 0.78);

  switch (kind) {
    case "light":
      return {
        torso: [0.14 * Math.max(0, strike), 0.48 * strike, 0],
        head: [0.05, -0.28 * strike, 0],
        shoulderL: [-0.62, 0.45 - 0.25 * strike, 0.28],
        elbowL: [-1.05, 0, 0.2],
        shoulderR: [-0.95 - 0.55 * strike, 0.35 * strike, -0.24 + 0.35 * strike],
        elbowR: [-0.85 + 0.65 * Math.max(0, strike), 0, 0],
        weapon: [0.35 * Math.max(0, strike), 0, -0.18 * strike]
      };
    case "heavy":
      return {
        torso: [0.28 * strike, 0.72 * strike, -0.08 * strike],
        head: [0.08 * strike, -0.35 * strike, 0],
        shoulderL: [-0.75 + 0.2 * strike, 0.52, 0.34],
        elbowL: [-1.12, 0, 0.22],
        shoulderR: [-1.55 + 1.35 * Math.max(0, strike), 0.52 * strike, -0.35 + 0.48 * strike],
        elbowR: [-1.15 + 0.85 * Math.max(0, strike), 0, 0],
        weapon: [0.62 * Math.max(0, strike), 0, -0.25]
      };
    case "special": {
      const flurry = Math.sin(u * Math.PI * 3);
      const finish = Math.sin(u * Math.PI);
      return {
        torso: [0.22 * finish, 0.88 * flurry, 0.08 * flurry],
        head: [0.06, -0.42 * flurry, 0],
        shoulderL: [-0.88, 0.48 + 0.32 * flurry, 0.42],
        elbowL: [-1.08, 0, 0.26],
        shoulderR: [-1.32 - 0.35 * finish, 0.68 * flurry, -0.32 + 0.52 * flurry],
        elbowR: [-0.55 + 0.35 * flurry, 0, 0],
        weapon: [0.52 + 0.3 * flurry, 0.24 * flurry, 0]
      };
    }
    case "throw":
      return {
        torso: [0.32 * strike, -0.58 * strike, 0],
        head: [0.1, 0.24 * strike, 0],
        shoulderL: [-1.15 - 0.35 * strike, -0.35 * strike, 0.18],
        elbowL: [-0.65, 0, 0.15],
        shoulderR: [-1.05 - 0.4 * strike, 0.42 * strike, -0.22],
        elbowR: [-0.72, 0, 0],
        weapon: [0.18, 0, 0]
      };
  }
}

/**
 * Compute deterministic, 100% stateless `"ZYX"` Euler joint angles + hip offset
 * for a Gladiator/Knight rig (`setRotation` / `setPosition` never compound).
 */
export function computeGladiatorJointPose(state: GladiatorPoseState): {
  readonly hipsPos: V3;
  readonly rotations: Readonly<Record<GladiatorJointSuffix, V3>>;
} {
  const t = state.time;
  const u = Math.max(0, Math.min(1, state.clipProgress ?? 0));
  const moveDir = state.moveDir ?? 1;
  const breathe = Math.sin(t * 2.8);

  // Default ready martial guard (stateless baseline)
  let hipsPos: V3 = [0, 0.91 + 0.012 * breathe, 0];
  let hipsRot: V3 = [0.04, -0.28, 0];
  let torso: V3 = [0.08 + 0.02 * breathe, -0.14, 0];
  let head: V3 = [-0.05, 0.38, 0];
  let shoulderL: V3 = [-0.68 + 0.03 * breathe, 0.42, 0.24];
  let elbowL: V3 = [-1.08, 0.12, 0.18];
  let shoulderR: V3 = [-0.46 - 0.03 * breathe, -0.24, -0.22];
  let elbowR: V3 = [-1.12, -0.1, 0];
  let weapon: V3 = [-0.18, 0, 0];
  const shield: V3 = [0, 0, 0];

  // Planted athletic guard stance legs (feet flat on arena stone)
  let hipL: V3 = [-0.24, 0.18, 0.04];
  let kneeL: V3 = [0.42, 0, 0];
  let ankleL: V3 = [-0.18, 0, 0];
  let hipR: V3 = [0.18, -0.12, -0.04];
  let kneeR: V3 = [0.28, 0, 0];
  let ankleR: V3 = [-0.46, 0, 0];

  switch (state.clip) {
    case "idle":
      break;
    case "walk":
    case "dash": {
      const rate = state.clip === "dash" ? 13.5 : 8.2;
      const amp = state.clip === "dash" ? 0.68 : 0.46;
      const ph = t * rate * (moveDir < 0 ? -1 : 1);
      const sL = Math.sin(ph);
      const sR = Math.sin(ph + Math.PI);
      const liftL = Math.max(0, Math.cos(ph));
      const liftR = Math.max(0, Math.cos(ph + Math.PI));
      const lean = state.clip === "dash" ? (moveDir < 0 ? -0.26 : 0.32) : (moveDir < 0 ? -0.08 : 0.14);

      hipsPos = [0, 0.89 + 0.028 * Math.abs(sL), 0];
      hipsRot = [lean * 0.45, -0.16 * sL, 0];
      torso = [lean, 0.22 * sL, 0];
      head = [-lean * 0.65, -0.08 * sL, 0];
      shoulderL = [-0.62 + 0.28 * sR, 0.38, 0.22];
      elbowL = [-1.05, 0.1, 0.16];
      shoulderR = [-0.48 + 0.32 * sL, -0.2, -0.22];
      elbowR = [-1.08, 0, 0];

      hipL = [-sL * amp - 0.08, 0.06, 0.02];
      kneeL = [0.22 + 0.58 * liftL, 0, 0];
      ankleL = [sL * amp * 0.45 - 0.16, 0, 0];
      hipR = [-sR * amp - 0.08, -0.06, -0.02];
      kneeR = [0.22 + 0.58 * liftR, 0, 0];
      ankleR = [sR * amp * 0.45 - 0.16, 0, 0];
      break;
    }
    case "jump": {
      hipsPos = [0, 0.94, 0];
      hipsRot = [0.12, -0.18, 0];
      torso = [0.16, -0.12, 0];
      head = [-0.12, 0.26, 0];
      shoulderL = [-0.95, 0.48, 0.32];
      elbowL = [-1.22, 0.14, 0.2];
      shoulderR = [-1.18, -0.18, -0.28];
      elbowR = [-0.95, 0, 0];
      weapon = [-0.25, 0, 0];
      hipL = [-0.68, 0.1, 0.04];
      kneeL = [1.18, 0, 0];
      ankleL = [-0.28, 0, 0];
      hipR = [-0.42, -0.1, -0.04];
      kneeR = [0.96, 0, 0];
      ankleR = [-0.24, 0, 0];
      break;
    }
    case "crouch": {
      // Deep grounded crouch: pelvis drops 0.28 m while hip/knee/ankle flex keeps sabatons planted
      hipsPos = [0, 0.66, 0];
      hipsRot = [0.14, -0.24, 0];
      torso = [0.26, -0.1, 0];
      head = [-0.28, 0.32, 0];
      shoulderL = [-0.92, 0.64, 0.26];
      elbowL = [-1.24, 0.2, 0.24];
      shoulderR = [-0.62, -0.22, -0.24];
      elbowR = [-1.28, 0, 0];
      hipL = [-0.88, 0.16, 0.05];
      kneeL = [1.48, 0, 0];
      ankleL = [-0.74, 0, 0];
      hipR = [-0.72, -0.14, -0.05];
      kneeR = [1.42, 0, 0];
      ankleR = [-0.84, 0, 0];
      break;
    }
    case "guard": {
      // Fortress shield block across chest & helm
      hipsPos = [0, 0.86, -0.03];
      hipsRot = [0.06, -0.34, 0];
      torso = [-0.06, -0.22, 0];
      head = [0.08, 0.48, 0];
      shoulderL = [-1.06, 0.78, 0.18];
      elbowL = [-1.28, 0.28, 0.32];
      shoulderR = [-0.72, -0.32, -0.28];
      elbowR = [-1.32, 0, 0];
      weapon = [-0.32, 0, 0];
      hipL = [-0.36, 0.2, 0.05];
      kneeL = [0.58, 0, 0];
      ankleL = [-0.28, 0, 0];
      hipR = [0.22, -0.15, -0.05];
      kneeR = [0.42, 0, 0];
      ankleR = [-0.68, 0, 0];
      break;
    }
    case "light":
    case "heavy":
    case "special":
    case "throw": {
      const atk = solveAttackUpperPose(state.clip, u);
      const lunge = Math.sin(u * Math.PI);
      hipsPos = [0, 0.88 - 0.04 * lunge, 0.08 * lunge];
      hipsRot = [0.08 * lunge, atk.torso[1] * 0.45, 0];
      torso = atk.torso;
      head = atk.head;
      shoulderL = atk.shoulderL;
      elbowL = atk.elbowL;
      shoulderR = atk.shoulderR;
      elbowR = atk.elbowR;
      weapon = atk.weapon;
      hipL = [-0.38 - 0.18 * lunge, 0.14, 0.04];
      kneeL = [0.56 + 0.22 * lunge, 0, 0];
      ankleL = [-0.26, 0, 0];
      hipR = [0.24 + 0.16 * lunge, -0.12, -0.04];
      kneeR = [0.34, 0, 0];
      ankleR = [-0.58 - 0.12 * lunge, 0, 0];
      break;
    }
    case "hitstun": {
      const recoil = Math.sin(Math.min(1, u * 1.4) * Math.PI);
      hipsPos = [0, 0.89, -0.06 * recoil];
      hipsRot = [-0.16 * recoil, -0.18, 0];
      torso = [-0.34 * recoil, 0.22 * recoil, 0.08 * recoil];
      head = [-0.28 * recoil, 0.18, 0];
      shoulderL = [-0.38, 0.15, 0.52 * recoil + 0.2];
      elbowL = [-0.62, 0, 0.12];
      shoulderR = [-0.28, -0.18, -0.54 * recoil - 0.2];
      elbowR = [-0.58, 0, 0];
      break;
    }
    case "ko": {
      // Smooth grounded knockdown onto the arena stone (never sinks below y=0)
      const fall = Math.min(1, u * 1.65);
      const e = fall * fall * (3 - 2 * fall);
      hipsPos = [0, 0.91 * (1 - e) + 0.19 * e, -0.35 * e];
      hipsRot = [-1.46 * e, -0.12 * (1 - e), 0.08 * e];
      torso = [-0.12 * e, 0, 0];
      head = [0.18 * e, 0.22 * e, 0];
      shoulderL = [-0.22 * (1 - e), 0, 0.62 * e + 0.2];
      elbowL = [-0.35, 0, 0.1];
      shoulderR = [-0.22 * (1 - e), 0, -0.68 * e - 0.2];
      elbowR = [-0.32, 0, 0];
      hipL = [-0.14 * (1 - e), 0.12 * e, 0.06 * e];
      kneeL = [0.22 * (1 - e) + 0.12 * e, 0, 0];
      ankleL = [-0.12, 0, 0];
      hipR = [0.1 * (1 - e), -0.12 * e, -0.06 * e];
      kneeR = [0.18 * (1 - e) + 0.18 * e, 0, 0];
      ankleR = [-0.18, 0, 0];
      break;
    }
    case "win": {
      const pump = 0.5 + 0.5 * Math.sin(t * 4.2);
      hipsPos = [0, 0.93, 0];
      hipsRot = [-0.04, -0.16, 0];
      torso = [-0.08, 0.12, 0];
      head = [-0.14, -0.08, 0];
      shoulderL = [-0.58, 0.45, 0.28];
      elbowL = [-0.95, 0.18, 0.2];
      // Heroic raised sword/halberd salute toward the arena spotlight
      shoulderR = [-2.58 - 0.18 * pump, 0.15, -0.18];
      elbowR = [-0.28 + 0.12 * pump, 0, 0];
      weapon = [0.24, 0, 0];
      hipL = [-0.14, 0.14, 0.04];
      kneeL = [0.24, 0, 0];
      ankleL = [-0.1, 0, 0];
      hipR = [0.1, -0.1, -0.04];
      kneeR = [0.18, 0, 0];
      ankleR = [-0.28, 0, 0];
      break;
    }
  }

  // Upper-body attack layer override while legs remain driven by locomotion
  if (state.layerAttack && state.clip !== "ko" && state.clip !== "hitstun") {
    const atk = solveAttackUpperPose(state.layerAttack, state.layerProgress ?? 0.5);
    torso = atk.torso;
    head = atk.head;
    shoulderL = atk.shoulderL;
    elbowL = atk.elbowL;
    shoulderR = atk.shoulderR;
    elbowR = atk.elbowR;
    weapon = atk.weapon;
  }

  return {
    hipsPos,
    rotations: {
      hips: hipsRot,
      torso,
      head,
      "shoulder-l": shoulderL,
      "elbow-l": elbowL,
      "shoulder-r": shoulderR,
      "elbow-r": elbowR,
      weapon,
      shield,
      "hip-l": hipL,
      "knee-l": kneeL,
      "ankle-l": ankleL,
      "hip-r": hipR,
      "knee-r": kneeR,
      "ankle-r": ankleR
    }
  };
}

/**
 * Apply stateless `"ZYX"` Euler joint poses to a mounted Gladiator/Knight rig.
 */
export function poseArticulatedGladiatorRig(
  getNode: (id: string) => AuraRuntimeNodeHandle | undefined,
  nodeId: string,
  state: GladiatorPoseState
): void {
  const solved = computeGladiatorJointPose(state);
  const hipsHandle = getNode(`${nodeId}-hips`);
  hipsHandle?.setPosition(solved.hipsPos[0], solved.hipsPos[1], solved.hipsPos[2]);
  for (const suffix of GLADIATOR_JOINT_SUFFIXES) {
    const handle = getNode(`${nodeId}-${suffix}`);
    if (!handle) continue;
    const r = solved.rotations[suffix];
    handle.setRotation(r[0], r[1], r[2]);
  }
}
