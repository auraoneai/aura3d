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
  readonly fighterId: GladiatorArchetypeId;
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
  readonly helmStyle:
    | "kabuto"
    | "tempestArmet"
    | "colossusHorned"
    | "valkyrieCirclet"
    | "hoodedCrescent"
    | "dreadCrown";
  readonly weaponStyle:
    | "katana"
    | "stormSpear"
    | "runeWarhammer"
    | "celestialSunBlade"
    | "hexTwinBlade"
    | "royalGreatsword";
  readonly shieldStyle:
    | "sodeGuard"
    | "arcBuckler"
    | "towerScutum"
    | "paladinKite"
    | "offhandHexBlade"
    | "royalHeater";
  readonly trimHex: string;
  readonly clothP1Hex: string;
  readonly clothP2Hex: string;
  readonly secondaryHex: string;
  readonly secondaryKind: "silk" | "cobalt" | "fur" | "visage" | "porcelain" | "obsidian";
}

const ARCHETYPE_BUILDS: Readonly<Record<GladiatorArchetypeId, ArchetypeBuild>> = {
  kenji: {
    chestWidth: 0.208,
    chestDepth: 0.146,
    waistWidth: 0.148,
    pauldronScale: 1.05,
    limbScale: 1.0,
    helmStyle: "kabuto",
    weaponStyle: "katana",
    shieldStyle: "sodeGuard",
    trimHex: "#e5b44c",
    clothP1Hex: "#19284a",
    clothP2Hex: "#7c141d",
    secondaryHex: "#1c1824",
    secondaryKind: "silk"
  },
  volt: {
    chestWidth: 0.194,
    chestDepth: 0.14,
    waistWidth: 0.138,
    pauldronScale: 0.98,
    limbScale: 0.97,
    helmStyle: "tempestArmet",
    weaponStyle: "stormSpear",
    shieldStyle: "arcBuckler",
    trimHex: "#d8ebff",
    clothP1Hex: "#14428c",
    clothP2Hex: "#962436",
    secondaryHex: "#1d3566",
    secondaryKind: "cobalt"
  },
  boulder: {
    chestWidth: 0.258,
    chestDepth: 0.186,
    waistWidth: 0.19,
    pauldronScale: 1.28,
    limbScale: 1.18,
    helmStyle: "colossusHorned",
    weaponStyle: "runeWarhammer",
    shieldStyle: "towerScutum",
    trimHex: "#cf8e42",
    clothP1Hex: "#203d66",
    clothP2Hex: "#8c231c",
    secondaryHex: "#3b2c22",
    secondaryKind: "fur"
  },
  seraph: {
    chestWidth: 0.195,
    chestDepth: 0.138,
    waistWidth: 0.135,
    pauldronScale: 1.0,
    limbScale: 0.96,
    helmStyle: "valkyrieCirclet",
    weaponStyle: "celestialSunBlade",
    shieldStyle: "paladinKite",
    trimHex: "#f0c85b",
    clothP1Hex: "#1d56a8",
    clothP2Hex: "#a81e32",
    secondaryHex: "#eccbb4",
    secondaryKind: "visage"
  },
  jinx: {
    chestWidth: 0.184,
    chestDepth: 0.132,
    waistWidth: 0.13,
    pauldronScale: 0.94,
    limbScale: 0.93,
    helmStyle: "hoodedCrescent",
    weaponStyle: "hexTwinBlade",
    shieldStyle: "offhandHexBlade",
    trimHex: "#cfd4e6",
    clothP1Hex: "#2d1e54",
    clothP2Hex: "#6e193d",
    secondaryHex: "#ebe6f4",
    secondaryKind: "porcelain"
  },
  sovereign: {
    chestWidth: 0.232,
    chestDepth: 0.166,
    waistWidth: 0.162,
    pauldronScale: 1.2,
    limbScale: 1.08,
    helmStyle: "dreadCrown",
    weaponStyle: "royalGreatsword",
    shieldStyle: "royalHeater",
    trimHex: "#ebb438",
    clothP1Hex: "#8c1422",
    clothP2Hex: "#36184c",
    secondaryHex: "#120f18",
    secondaryKind: "obsidian"
  }
};

/**
 * Applies zenithal linear RGBA vertex shading + deep `0.26` crevice/pocket ambient occlusion
 * so every armor flute, rolled lame border, rivet collar, and pleated cloth fold reads with
 * SoulCalibur / For-Honor depth while preserving the physical material's base hue.
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
      const grain = (hash01(seed) - 0.5) * 0.024;
      const g = Math.max(0.84, Math.min(1.06, 1.0 - zenithLift * 0.58 + zenithLift * h + sky + grain));
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

/**
 * Generates a high-density closed sculptural cross-section ring with optional Gothic armor fluting,
 * anterior chest/keel projection, and lateral shaping.
 */
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
  const segs = opts.segments ?? 16;
  const flutes = opts.flutes ?? 0;
  const fluteAmp = opts.fluteAmp ?? 0;
  const frontKeel = opts.frontKeel ?? 0;
  const backTaper = opts.backTaper ?? 1;
  const ring: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const sinA = Math.sin(a);
    const cosA = Math.cos(a);
    // a = 0 -> +Z (front), a = PI/2 -> +X (left), a = PI -> -Z (back), a = 3PI/2 -> -X (right)
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

/**
 * Sculpts a genuine double-walled 3D curved armor plate (pauldron lame, couter, poleyn, cuisse,
 * tasset, shikoro, menpo, crescent mask, or curved shield) with rolled outer/inner lips and zero
 * concave cap webbing.
 */
function sculptCurvedShell(
  stations: readonly CurvedShellStation[],
  thickness = 0.01,
  arcSamples = 9,
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
  return smoothIter > 0 ? subdivideSmoothMesh(raw, smoothIter, 0.42) : raw;
}

/**
 * Sculpts a hollow-ground 6-point hexagonal/diamond-section sword/spear/glaive blade along a 3D spine
 * `[x, y, z, halfWidth]` with razor edges along `+-Y` (or `+-X`) and raised central fuller ridges.
 */
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

/**
 * Sculpts a richly draped, pleated velvet/silk tabard, cape, or stole panel with double-sided thickness
 * (`>= 7 mm`) and clean outward offset (`>= 14-20 mm` outside inner armor/maille so zero z-fighting).
 */
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
  const cols = 9;
  const rows = 5;
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
  return subdivideSmoothMesh(loftSectionsMesh(rings, true), 1, 0.4);
}

function forgedRivetMesh(pos: V3, radius = 0.0085): RawMesh {
  return transformMesh(icosphereSmoothMesh(radius, 1), {
    pos,
    scale: [1, 0.72, 1]
  });
}

/**
 * 8-slot physical material library per Gladiator:
 *   0: Primary forged/lacquered armor plate (`lacquer` / `brushedMetal` / `clearcoatPaint` + Fresnel `rim`)
 *   1: Gilded / sterling heraldic filigree, crowns & raised borders (`studioMetal`)
 *   2: Darkened chainmaille & articulated gambeson undersuit (`brushedMetal`)
 *   3: Rich matte-velvet heraldic tabard, cape, cowl & plume (`fabric` with velvet sheen)
 *   4: Mirror-honed Damascus / high-carbon weapon steel (`studioMetal`)
 *   5: Cinched war-leather straps, brigandine & wrapped weapon grips (`pbr`)
 *   6: Practical glowing ocular visor slits, forge runes & cabochon gems (`pbr`, `practical: true`)
 *   7: Archetype signature secondary finish (dire-bear fur, Valkyrie noble visage, porcelain mask, cobalt/obsidian inlay)
 */
function buildGladiatorMaterials(opts: GladiatorRigOptions): readonly AuraMaterialSpec[] {
  const b = ARCHETYPE_BUILDS[opts.fighterId];
  const rimSpec =
    opts.surfaceExtras !== false
      ? { rim: { color: opts.accentEmissive, power: 2.5, intensity: 0.64 } }
      : {};

  const clothHex = opts.side === "p1" ? b.clothP1Hex : b.clothP2Hex;
  const clothSheen = opts.side === "p1" ? "#7fb8ff" : "#ff8b7a";
  const trimColor = opts.side === "p1" ? b.trimHex : "#e39d3b";

  // 0: Primary sculpted armor plate
  const plateMat =
    opts.lacquer || opts.fighterId === "kenji"
      ? material.lacquer({
          name: `${opts.nodeId}-plate-lacquer`,
          color: opts.primaryColor,
          roughness: Math.min(0.3, opts.roughness),
          clearcoat: opts.lacquer ? 0.68 : 0.48,
          clearcoatRoughness: 0.16,
          ...rimSpec
        } as any)
      : opts.metallic >= 0.4
        ? material.brushedMetal({
            name: `${opts.nodeId}-plate-forged`,
            color: opts.primaryColor,
            roughness: Math.max(0.22, Math.min(0.38, opts.roughness)),
            anisotropy: 0.36,
            ...rimSpec
          } as any)
        : material.clearcoatPaint({
            name: `${opts.nodeId}-plate-enamel`,
            color: opts.primaryColor,
            roughness: Math.max(0.26, Math.min(0.46, opts.roughness)),
            clearcoat: 0.34,
            clearcoatRoughness: 0.22,
            ...rimSpec
          } as any);

  // 1: Gilded / sterling trim & crowns
  const trimMat = material.studioMetal({
    name: `${opts.nodeId}-heraldic-trim`,
    color: trimColor,
    roughness: 0.22
  });

  // 2: Forged chainmaille & articulated undersuit
  const mailleMat = material.brushedMetal({
    name: `${opts.nodeId}-maille-undersuit`,
    color: "#22212c",
    roughness: 0.52,
    anisotropy: 0.22
  });

  // 3: Rich matte-velvet cloth tabard, cape, cowl & plume
  const heraldryMat = material.fabric({
    name: `${opts.nodeId}-heraldic-cloth`,
    color: clothHex,
    roughness: 0.84,
    sheen: 0.62,
    sheenColor: clothSheen,
    sheenRoughness: 0.66
  });

  // 4: Honed Damascus / high-carbon weapon steel
  const bladeMat = material.studioMetal({
    name: `${opts.nodeId}-weapon-steel`,
    color: "#e5edf7",
    roughness: 0.14
  });

  // 5: Oiled war-leather belts, straps, brigandine & cord-wrapped grips
  const leatherMat = material.pbr({
    name: `${opts.nodeId}-war-leather`,
    color: opts.fighterId === "jinx" ? "#26192e" : "#3a2216",
    roughness: 0.74,
    metallic: 0.05,
    clearcoat: 0,
    sheen: 0
  });

  // 6: Practical ocular slits, forge runes & cabochon gems (`practical: true` satisfies `emissive-fill` audit)
  const visorGlowMat = material.pbr({
    name: `${opts.nodeId}-visor-glow`,
    color: opts.accentEmissive,
    emissive: opts.accentEmissive,
    emissiveIntensity: 0.78,
    roughness: 0.2,
    metallic: 0.14,
    practical: true
  });

  // 7: Archetype signature secondary material
  const secondaryMat: AuraMaterialSpec =
    b.secondaryKind === "fur"
      ? material.fabric({
          name: `${opts.nodeId}-dire-fur`,
          color: b.secondaryHex,
          roughness: 0.92,
          sheen: 0.38,
          sheenColor: "#8c7258",
          sheenRoughness: 0.82
        })
      : b.secondaryKind === "visage"
        ? material.pbr({
            name: `${opts.nodeId}-noble-visage`,
            color: b.secondaryHex,
            roughness: 0.56,
            metallic: 0.02,
            sheen: 0.18,
            sheenColor: "#ffd8c4",
            sheenRoughness: 0.7
          })
        : b.secondaryKind === "porcelain"
          ? material.clearcoatPaint({
              name: `${opts.nodeId}-porcelain-mask`,
              color: b.secondaryHex,
              roughness: 0.24,
              clearcoat: 0.55,
              clearcoatRoughness: 0.16
            })
          : b.secondaryKind === "cobalt"
            ? material.lacquer({
                name: `${opts.nodeId}-cobalt-conduit`,
                color: b.secondaryHex,
                roughness: 0.26,
                clearcoat: 0.52,
                clearcoatRoughness: 0.18
              })
            : material.brushedMetal({
                name: `${opts.nodeId}-obsidian-inlay`,
                color: b.secondaryHex,
                roughness: 0.34,
                anisotropy: 0.28
              });

  return [
    plateMat,
    trimMat,
    mailleMat,
    heraldryMat,
    bladeMat,
    leatherMat,
    visorGlowMat,
    secondaryMat
  ];
}

function buildPelvisSlots(fighterId: GladiatorArchetypeId, b: ArchetypeBuild): MultiMatSlot[] {
  const w = b.waistWidth;
  // Anatomical maille & quilted gambeson pelvis core (inner radius <= 0.122 m in Z)
  const pelvisCore = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        makeFlutedRing(-0.095, w * 0.92, 0.112, 0, { segments: 14 }),
        makeFlutedRing(-0.015, w * 1.02, 0.122, 0.003, { segments: 14 }),
        makeFlutedRing(0.085, w * 0.96, 0.118, 0.004, { segments: 14 })
      ],
      true
    ),
    1,
    0.46
  );

  // Cinched heavy war-belt + gilded top/bottom belt rims + ornate buckle & cabochon gem
  const leatherBelt = latheMesh(
    [
      [w * 0.96, 0.026],
      [w * 1.1, 0.03],
      [w * 1.11, 0.076],
      [w * 0.96, 0.082]
    ],
    20
  );
  const beltRimBottom = latheMesh(
    [
      [w * 1.07, 0.022],
      [w * 1.13, 0.025],
      [w * 1.13, 0.034],
      [w * 1.07, 0.036]
    ],
    20
  );
  const beltRimTop = latheMesh(
    [
      [w * 1.07, 0.072],
      [w * 1.13, 0.074],
      [w * 1.13, 0.083],
      [w * 1.07, 0.086]
    ],
    20
  );

  // Draped pleated velvet tabard / surcoat panels layered >= 18 mm clear outside pelvisCore (z = +-0.142 m -> zero z-fighting!)
  const frontDrop = fighterId === "sovereign" || fighterId === "seraph" ? -0.35 : -0.29;
  const backDrop = fighterId === "sovereign" ? -0.4 : -0.32;
  const tabardFront = sculptPleatedClothPanel({
    yTop: 0.032,
    yBottom: frontDrop,
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
    yBottom: backDrop,
    topHalfWidth: w * 0.62,
    bottomHalfWidth: w * 0.84,
    zOffset: -0.14,
    flareZ: -0.042,
    pleatCount: 5,
    pleatDepth: 0.01,
    pointDrop: 0.05
  });

  // Gilded hem border along bottom V-tip of front tabard
  const frontHemTrim = tubeSweepMesh(
    [
      [-w * 0.72, frontDrop + 0.008, 0.174, 0.008],
      [0, frontDrop - 0.05, 0.188, 0.009],
      [w * 0.72, frontDrop + 0.008, 0.174, 0.008]
    ],
    6,
    true
  );

  const slots: MultiMatSlot[] = [
    { mesh: pelvisCore, materialIndex: 2 },
    { mesh: leatherBelt, materialIndex: 5 },
    { mesh: beltRimBottom, materialIndex: 1 },
    { mesh: beltRimTop, materialIndex: 1 },
    // Ornate forged war-buckle + central cabochon gem
    {
      mesh: transformMesh(bevelBoxMesh(0.088, 0.072, 0.028, 0.009), { pos: [0, 0.054, 0.142] }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(icosphereSmoothMesh(0.018, 1), {
        pos: [0, 0.054, 0.156],
        scale: [1.1, 1.35, 0.55]
      }),
      materialIndex: 6
    },
    { mesh: tabardFront, materialIndex: 3 },
    { mesh: tabardBack, materialIndex: 3 },
    { mesh: frontHemTrim, materialIndex: 1 }
  ];

  // Overlapping 2-tier scalloped hip `tassets` (or Kenji 4-lame `kusazuri` skirts) cleanly outside hips
  for (const sx of [-1, 1] as const) {
    const cAngle = sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    const upperTasset = sculptCurvedShell(
      [
        { y: -0.115, rx: w * 1.18, rz: 0.144, arcHalfAngle: 0.78, centerAngle: cAngle, keel: 0.014, fluteCount: 3, fluteAmp: 0.005 },
        { y: -0.04, rx: w * 1.14, rz: 0.138, arcHalfAngle: 0.74, centerAngle: cAngle, keel: 0.012, fluteCount: 3, fluteAmp: 0.004 },
        { y: 0.028, rx: w * 1.08, rz: 0.132, arcHalfAngle: 0.68, centerAngle: cAngle, keel: 0.008 }
      ],
      0.009,
      9,
      1
    );
    const lowerTasset = sculptCurvedShell(
      [
        { y: -0.235, rx: w * 1.25, rz: 0.152, arcHalfAngle: 0.66, centerAngle: cAngle, keel: 0.018, fluteCount: 3, fluteAmp: 0.006 },
        { y: -0.16, rx: w * 1.22, rz: 0.148, arcHalfAngle: 0.74, centerAngle: cAngle, keel: 0.015, fluteCount: 3, fluteAmp: 0.005 },
        { y: -0.095, rx: w * 1.17, rz: 0.142, arcHalfAngle: 0.72, centerAngle: cAngle, keel: 0.01 }
      ],
      0.009,
      9,
      1
    );
    const trimArch = tubeSweepMesh(
      [
        [sx * (w * 0.88), -0.215, 0.105, 0.007],
        [sx * (w * 1.27), -0.238, 0.0, 0.0085],
        [sx * (w * 0.88), -0.215, -0.105, 0.007]
      ],
      6,
      true
    );
    slots.push(
      { mesh: upperTasset, materialIndex: fighterId === "jinx" && sx < 0 ? 5 : 0 },
      { mesh: lowerTasset, materialIndex: 0 },
      { mesh: trimArch, materialIndex: 1 },
      { mesh: forgedRivetMesh([sx * (w * 1.18), -0.02, 0.055], 0.008), materialIndex: 1 },
      { mesh: forgedRivetMesh([sx * (w * 1.18), -0.02, -0.055], 0.008), materialIndex: 1 }
    );
  }
  return slots;
}

function buildTorsoSlots(fighterId: GladiatorArchetypeId, b: ArchetypeBuild): MultiMatSlot[] {
  const cw = b.chestWidth;
  const cd = b.chestDepth;
  const ww = b.waistWidth;

  // Inner maille/gambeson under-waist & under-arm core (inset cleanly by >= 14 mm inside cuirass)
  const underDoublet = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        makeFlutedRing(-0.02, ww * 0.88, cd * 0.78, 0, { segments: 14 }),
        makeFlutedRing(0.18, cw * 0.84, cd * 0.82, 0.006, { segments: 14 }),
        makeFlutedRing(0.38, cw * 0.86, cd * 0.82, 0.004, { segments: 14 }),
        makeFlutedRing(0.46, cw * 0.48, cd * 0.54, 0, { segments: 14 })
      ],
      true
    ),
    1,
    0.45
  );

  // Heroic V-tapered fluted breastplate & backplate (`cuirass`) with pectoral shelf & sternum peascod keel
  const cuirassShell = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        makeFlutedRing(0.015, ww * 0.98, cd * 0.88, 0.002, { segments: 18, flutes: 6, fluteAmp: 0.018, frontKeel: 0.08 }),
        makeFlutedRing(0.105, ww * 1.03, cd * 0.94, 0.008, { segments: 18, flutes: 6, fluteAmp: 0.024, frontKeel: 0.12 }),
        makeFlutedRing(0.205, cw * 0.97, cd * 1.02, 0.016, { segments: 18, flutes: 8, fluteAmp: 0.022, frontKeel: 0.15 }),
        makeFlutedRing(0.305, cw * 1.09, cd * 1.12, 0.024, { segments: 18, flutes: 8, fluteAmp: 0.018, frontKeel: 0.14, backTaper: 0.92 }),
        makeFlutedRing(0.395, cw * 0.98, cd * 0.96, 0.012, { segments: 18, flutes: 6, fluteAmp: 0.012, frontKeel: 0.08, backTaper: 0.9 }),
        makeFlutedRing(0.452, cw * 0.58, cd * 0.64, 0.0, { segments: 18 })
      ],
      true
    ),
    1,
    0.48
  );

  // Overlapping 2-tier articulated `fauld` waist-lames + high sculpted `gorget` collar
  const fauldUpper = sculptCurvedShell(
    [
      { y: 0.012, rx: ww * 1.08, rz: cd * 0.97, zBias: 0.006, arcHalfAngle: Math.PI * 0.86, keel: 0.016, fluteCount: 5, fluteAmp: 0.005 },
      { y: 0.072, rx: ww * 1.03, rz: cd * 0.93, zBias: 0.008, arcHalfAngle: Math.PI * 0.84, keel: 0.014, fluteCount: 5, fluteAmp: 0.004 }
    ],
    0.009,
    11,
    1
  );
  const fauldLower = sculptCurvedShell(
    [
      { y: -0.032, rx: ww * 1.13, rz: cd * 1.02, zBias: 0.005, arcHalfAngle: Math.PI * 0.82, keel: 0.018, fluteCount: 5, fluteAmp: 0.006 },
      { y: 0.026, rx: ww * 1.09, rz: cd * 0.98, zBias: 0.006, arcHalfAngle: Math.PI * 0.84, keel: 0.015, fluteCount: 5, fluteAmp: 0.005 }
    ],
    0.009,
    11,
    1
  );
  const gorgetCollar = latheMesh(
    [
      [cw * 0.36, 0.415],
      [cw * 0.66, 0.405],
      [cw * 0.68, 0.435],
      [cw * 0.52, 0.482],
      [cw * 0.41, 0.502],
      [cw * 0.35, 0.492]
    ],
    20
  );

  // Raised gilded sternum spine, V-pectoral filigree crests & central glowing medallion bezel
  const sternumSpine = tubeSweepMesh(
    [
      [0, 0.035, cd * 0.98, 0.011],
      [0, 0.19, cd * 1.18, 0.014],
      [0, 0.31, cd * 1.28, 0.016],
      [0, 0.425, cd * 0.96, 0.011]
    ],
    7,
    true
  );

  const slots: MultiMatSlot[] = [
    { mesh: underDoublet, materialIndex: 2 },
    { mesh: cuirassShell, materialIndex: fighterId === "jinx" ? 5 : 0 },
    { mesh: fauldUpper, materialIndex: 0 },
    { mesh: fauldLower, materialIndex: 0 },
    { mesh: gorgetCollar, materialIndex: 1 },
    { mesh: sternumSpine, materialIndex: 1 },
    // Central pectoral medallion bezel + glowing cabochon core
    {
      mesh: transformMesh(
        latheMesh([[0, 0], [0.044, 0], [0.048, 0.014], [0.032, 0.022], [0, 0.022]], 16),
        { pos: [0, 0.315, cd * 1.24], rot: [Math.PI * 0.5, 0, 0] }
      ),
      materialIndex: 1
    },
    {
      mesh: transformMesh(icosphereSmoothMesh(0.024, 1), {
        pos: [0, 0.315, cd * 1.262],
        scale: [0.95, 1.22, 0.55]
      }),
      materialIndex: 6
    }
  ];

  // Sweeping left/right pectoral filigree ridges & armpit `besagew` rondel shields
  for (const sx of [-1, 1] as const) {
    slots.push(
      {
        mesh: tubeSweepMesh(
          [
            [sx * cw * 0.08, 0.255, cd * 1.23, 0.01],
            [sx * cw * 0.52, 0.235, cd * 1.12, 0.011],
            [sx * cw * 0.92, 0.295, cd * 0.78, 0.009]
          ],
          6,
          true
        ),
        materialIndex: 1
      },
      {
        mesh: tubeSweepMesh(
          [
            [sx * cw * 0.14, 0.135, cd * 1.11, 0.008],
            [sx * cw * 0.66, 0.165, cd * 0.92, 0.008]
          ],
          6,
          true
        ),
        materialIndex: 1
      },
      // Forged `besagew` rondel guarding shoulder-chest junction
      {
        mesh: transformMesh(
          latheMesh([[0, 0], [0.046, 0], [0.046, 0.01], [0.018, 0.022], [0, 0.028]], 14),
          { pos: [sx * cw * 0.86, 0.355, cd * 0.78], rot: [Math.PI * 0.46, sx * 0.32, 0] }
        ),
        materialIndex: 1
      }
    );
  }

  // Archetype-bespoke upper-body silhouettes & regalia
  switch (fighterId) {
    case "kenji": {
      // Do-Maru horizontal lacquered lamellar cords & rear sashimono cord ring
      for (const ly of [0.09, 0.165, 0.24] as const) {
        slots.push({
          mesh: sculptCurvedShell(
            [
              { y: ly - 0.018, rx: cw * 1.04, rz: cd * 1.14, zBias: 0.016, arcHalfAngle: Math.PI * 0.72, keel: 0.012 },
              { y: ly + 0.018, rx: cw * 1.01, rz: cd * 1.11, zBias: 0.016, arcHalfAngle: Math.PI * 0.72, keel: 0.01 }
            ],
            0.008,
            9,
            1
          ),
          materialIndex: 3
        });
      }
      break;
    }
    case "volt": {
      // Glowing electric-cyan V-conduit channels & dorsal tempest fins
      for (const sx of [-1, 1] as const) {
        slots.push(
          {
            mesh: tubeSweepMesh(
              [
                [sx * cw * 0.16, 0.12, cd * 1.14, 0.008],
                [sx * cw * 0.46, 0.27, cd * 1.16, 0.01],
                [sx * cw * 0.72, 0.38, cd * 0.88, 0.008]
              ],
              6,
              true
            ),
            materialIndex: 6
          },
          {
            mesh: transformMesh(
              extrudePolygonMesh([[0, 0.2], [0.055, 0.28], [0.095, 0.45], [0.015, 0.41]], 0.014, 0.004, false),
              { pos: [sx * cw * 0.42, 0.02, -cd * 0.96], rot: [0, Math.PI * 0.5 + sx * 0.24, 0] }
            ),
            materialIndex: 7
          }
        );
      }
      break;
    }
    case "boulder": {
      // Heavy sculpted Dire-Bear Fur & Iron Mantle wrapping shoulders & upper back + crossed war-chains
      const furMantle = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(0.32, cw * 1.24, cd * 1.2, -0.028, { segments: 18, flutes: 9, fluteAmp: 0.045 }),
            makeFlutedRing(0.405, cw * 1.3, cd * 1.24, -0.032, { segments: 18, flutes: 9, fluteAmp: 0.055 }),
            makeFlutedRing(0.475, cw * 0.95, cd * 0.98, -0.024, { segments: 18, flutes: 7, fluteAmp: 0.038 })
          ],
          true
        ),
        1,
        0.5
      );
      slots.push(
        { mesh: furMantle, materialIndex: 7 },
        {
          mesh: tubeSweepMesh(
            [
              [-cw * 0.78, 0.39, cd * 0.72, 0.016],
              [0, 0.22, cd * 1.24, 0.018],
              [ww * 0.82, 0.06, cd * 0.74, 0.016]
            ],
            7,
            true
          ),
          materialIndex: 1
        }
      );
      break;
    }
    case "seraph": {
      // Radiant gilded solar-wing chest relief + draped front/rear paladin silk stoles
      for (const sx of [-1, 1] as const) {
        const wingRelief: V2[] = [
          [0, 0.26],
          [sx * cw * 0.42, 0.31],
          [sx * cw * 0.82, 0.39],
          [sx * cw * 0.66, 0.26],
          [sx * cw * 0.28, 0.21]
        ];
        const poly = sx > 0 ? wingRelief : [...wingRelief].reverse();
        slots.push({
          mesh: transformMesh(extrudePolygonMesh(poly, 0.014, 0.004, false), {
            pos: [0, 0.02, cd * 1.15],
            rot: [0, -sx * 0.22, 0]
          }),
          materialIndex: 1
        });
      }
      const backMantle = sculptPleatedClothPanel({
        yTop: 0.41,
        yBottom: -0.34,
        topHalfWidth: cw * 0.72,
        bottomHalfWidth: cw * 0.98,
        zOffset: -cd * 1.08,
        flareZ: -0.08,
        pleatCount: 5,
        pleatDepth: 0.013,
        pointDrop: 0.07
      });
      slots.push({ mesh: backMantle, materialIndex: 3 });
      break;
    }
    case "jinx": {
      // Asymmetrical steel brigandine chest-lames over studded rogue leather + diagonal glowing hex-vial bandolier
      const brigPlate = sculptCurvedShell(
        [
          { y: 0.19, rx: cw * 1.06, rz: cd * 1.14, zBias: 0.018, arcHalfAngle: 1.05, centerAngle: 0.32, keel: 0.014 },
          { y: 0.34, rx: cw * 1.11, rz: cd * 1.16, zBias: 0.022, arcHalfAngle: 1.08, centerAngle: 0.32, keel: 0.016 }
        ],
        0.009,
        9,
        1
      );
      const bandolier = tubeSweepMesh(
        [
          [cw * 0.82, 0.41, cd * 0.64, 0.018],
          [0, 0.24, cd * 1.24, 0.019],
          [-ww * 0.86, 0.05, cd * 0.68, 0.017]
        ],
        7,
        true
      );
      slots.push(
        { mesh: brigPlate, materialIndex: 0 },
        { mesh: bandolier, materialIndex: 5 }
      );
      for (const [vx, vy, vz] of [
        [0.065, 0.305, cd * 1.24],
        [0.0, 0.24, cd * 1.27],
        [-0.065, 0.175, cd * 1.2]
      ] as const) {
        slots.push(
          {
            mesh: transformMesh(latheMesh([[0, -0.026], [0.013, -0.022], [0.013, 0.022], [0, 0.028]], 10), {
              pos: [vx, vy, vz],
              rot: [0, 0, -0.52]
            }),
            materialIndex: 6
          },
          {
            mesh: transformMesh(bevelBoxMesh(0.032, 0.012, 0.032, 0.003), {
              pos: [vx, vy, vz],
              rot: [0, 0, -0.52]
            }),
            materialIndex: 1
          }
        );
      }
      break;
    }
    case "sovereign": {
      // Full-length pleated Royal Crimson/Obsidian Cape-Mantle + twin gilded clavicle crown-brooches + chain of office
      const royalCape = sculptPleatedClothPanel({
        yTop: 0.415,
        yBottom: -0.56,
        topHalfWidth: cw * 0.94,
        bottomHalfWidth: cw * 1.38,
        zOffset: -cd * 1.08,
        flareZ: -0.13,
        pleatCount: 6,
        pleatDepth: 0.016,
        pointDrop: 0.08,
        thickness: 0.01
      });
      slots.push({ mesh: royalCape, materialIndex: 3 });
      for (const sx of [-1, 1] as const) {
        slots.push({
          mesh: transformMesh(
            latheMesh([[0, 0], [0.042, 0], [0.045, 0.014], [0.024, 0.024], [0, 0.026]], 14),
            { pos: [sx * cw * 0.62, 0.385, cd * 0.92], rot: [Math.PI * 0.42, sx * 0.2, 0] }
          ),
          materialIndex: 1
        });
      }
      slots.push({
        mesh: tubeSweepMesh(
          [
            [-cw * 0.62, 0.385, cd * 0.96, 0.011],
            [0, 0.285, cd * 1.29, 0.013],
            [cw * 0.62, 0.385, cd * 0.96, 0.011]
          ],
          7,
          true
        ),
        materialIndex: 1
      });
      break;
    }
  }

  return slots;
}

function buildVisoredHelmSlots(
  fighterId: GladiatorArchetypeId,
  b: ArchetypeBuild,
  side: "p1" | "cpu"
): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [
    // Articulated maille aventail / throat collar sealing neck-gorget transition cleanly
    {
      mesh: latheMesh(
        [
          [0.045, -0.032],
          [0.092, -0.028],
          [0.084, 0.03],
          [0.074, 0.068],
          [0.04, 0.068]
        ],
        18
      ),
      materialIndex: 2
    }
  ];

  switch (b.helmStyle) {
    case "kabuto": {
      // KENJI: Multi-ribbed Suji-Kabuto bowl + 4-tier sweeping Shikoro + fierce Menpo iron mask + towering Crescent Maedate!
      const hachiBowl = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(0.115, 0.114, 0.124, -0.006, { segments: 20, flutes: 10, fluteAmp: 0.012 }),
            makeFlutedRing(0.175, 0.122, 0.132, -0.004, { segments: 20, flutes: 10, fluteAmp: 0.016 }),
            makeFlutedRing(0.235, 0.104, 0.112, -0.006, { segments: 20, flutes: 10, fluteAmp: 0.015 }),
            makeFlutedRing(0.278, 0.056, 0.06, -0.008, { segments: 20, flutes: 10, fluteAmp: 0.01 }),
            makeFlutedRing(0.296, 0.02, 0.022, -0.008, { segments: 20 })
          ],
          true
        ),
        1,
        0.48
      );
      // Mabizashi peaked front visor brim
      const mabizashi = sculptCurvedShell(
        [
          { y: 0.148, rx: 0.126, rz: 0.162, zBias: 0.012, arcHalfAngle: 1.05, keel: 0.018 },
          { y: 0.176, rx: 0.118, rz: 0.136, zBias: 0.004, arcHalfAngle: 1.0, keel: 0.01 }
        ],
        0.008,
        9,
        1
      );
      // 3-tier sweeping curved `Shikoro` lacquered neck-guard lames
      const shikoroUpper = sculptCurvedShell(
        [
          { y: 0.072, rx: 0.148, rz: 0.154, zBias: -0.012, arcHalfAngle: Math.PI * 0.72, centerAngle: Math.PI },
          { y: 0.124, rx: 0.122, rz: 0.128, zBias: -0.008, arcHalfAngle: Math.PI * 0.68, centerAngle: Math.PI }
        ],
        0.008,
        11,
        1
      );
      const shikoroMid = sculptCurvedShell(
        [
          { y: 0.032, rx: 0.168, rz: 0.172, zBias: -0.016, arcHalfAngle: Math.PI * 0.74, centerAngle: Math.PI },
          { y: 0.082, rx: 0.144, rz: 0.148, zBias: -0.012, arcHalfAngle: Math.PI * 0.72, centerAngle: Math.PI }
        ],
        0.008,
        11,
        1
      );
      const shikoroLow = sculptCurvedShell(
        [
          { y: -0.008, rx: 0.186, rz: 0.188, zBias: -0.02, arcHalfAngle: Math.PI * 0.76, centerAngle: Math.PI },
          { y: 0.042, rx: 0.162, rz: 0.166, zBias: -0.016, arcHalfAngle: Math.PI * 0.74, centerAngle: Math.PI }
        ],
        0.008,
        11,
        1
      );
      // Fierce sculpted `Menpo` samurai iron war-mask + snarl ridge + recessed shadow face
      const shadowVisage = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(0.045, 0.078, 0.088, 0.006, { segments: 14 }),
            makeFlutedRing(0.125, 0.094, 0.104, 0.008, { segments: 14 }),
            makeFlutedRing(0.185, 0.092, 0.102, 0.004, { segments: 14 })
          ],
          true
        ),
        1,
        0.46
      );
      const menpoMask = sculptCurvedShell(
        [
          { y: 0.032, rx: 0.084, rz: 0.118, zBias: 0.012, arcHalfAngle: 1.18, keel: 0.024, fluteCount: 3, fluteAmp: 0.006 },
          { y: 0.078, rx: 0.098, rz: 0.132, zBias: 0.014, arcHalfAngle: 1.24, keel: 0.032, fluteCount: 4, fluteAmp: 0.008 },
          { y: 0.122, rx: 0.094, rz: 0.124, zBias: 0.012, arcHalfAngle: 1.12, keel: 0.028 }
        ],
        0.009,
        9,
        1
      );

      slots.push(
        { mesh: shadowVisage, materialIndex: 7 },
        { mesh: hachiBowl, materialIndex: 0 },
        { mesh: mabizashi, materialIndex: 0 },
        { mesh: shikoroUpper, materialIndex: 0 },
        { mesh: shikoroMid, materialIndex: 0 },
        { mesh: shikoroLow, materialIndex: 3 },
        { mesh: menpoMask, materialIndex: 7 },
        // Tehen-kanamono gilded apex chrysanthemum ring + menpo mustache/snarl gold bar
        {
          mesh: latheMesh([[0.012, 0.292], [0.038, 0.286], [0.038, 0.298], [0.012, 0.304]], 16),
          materialIndex: 1
        },
        {
          mesh: tubeSweepMesh(
            [[-0.068, 0.084, 0.105, 0.009], [0, 0.096, 0.162, 0.011], [0.068, 0.084, 0.105, 0.009]],
            6,
            true
          ),
          materialIndex: 1
        },
        // Maedate central sun-medallion mount
        {
          mesh: transformMesh(icosphereSmoothMesh(0.022, 1), {
            pos: [0, 0.205, 0.146],
            scale: [1.1, 1.1, 0.55]
          }),
          materialIndex: 6
        }
      );

      // Fierce glowing storm-ember oculars + winged `Fukigaeshi` turnbacks + sweeping gilded Crescent `Maedate` horns
      for (const sx of [-1, 1] as const) {
        const crescentPts = catmullRomSpline3(
          [
            [sx * 0.012, 0.202, 0.142],
            [sx * 0.088, 0.242, 0.146],
            [sx * 0.158, 0.325, 0.132],
            [sx * 0.188, 0.425, 0.108],
            [sx * 0.152, 0.495, 0.092]
          ],
          5
        ).map((p, i, arr) => [p[0], p[1], p[2], 0.028 * (1 - (i / (arr.length - 1)) * 0.82)] as V4);
        slots.push(
          { mesh: sculptDiamondBladeMesh(crescentPts, 0.26, "x"), materialIndex: 1 },
          {
            mesh: transformMesh(bevelBoxMesh(0.038, 0.013, 0.022, 0.004), {
              pos: [sx * 0.042, 0.142, 0.118],
              rot: [0, sx * 0.24, -sx * 0.14]
            }),
            materialIndex: 6
          },
          // Fukigaeshi winged ear turnbacks
          {
            mesh: transformMesh(bevelBoxMesh(0.014, 0.072, 0.056, 0.004), {
              pos: [sx * 0.124, 0.136, 0.042],
              rot: [0, sx * 0.48, 0]
            }),
            materialIndex: 1
          }
        );
      }
      break;
    }

    case "tempestArmet": {
      // VOLT: Sleek aerodynamic Tempest-Knight Close-Armet with prow-beak visor, glowing electric-cyan V-slits & lightning wings!
      const armetSkull = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(0.035, 0.082, 0.096, -0.006, { segments: 18 }),
            makeFlutedRing(0.105, 0.104, 0.122, -0.004, { segments: 18, flutes: 6, fluteAmp: 0.012 }),
            makeFlutedRing(0.175, 0.112, 0.134, -0.002, { segments: 18, flutes: 6, fluteAmp: 0.016, frontKeel: 0.08 }),
            makeFlutedRing(0.242, 0.096, 0.122, -0.012, { segments: 18, flutes: 6, fluteAmp: 0.014, frontKeel: 0.06 }),
            makeFlutedRing(0.288, 0.048, 0.078, -0.024, { segments: 18 })
          ],
          true
        ),
        1,
        0.5
      );
      // Forward-swept aerodynamic prow-beak visor (`sculptCurvedShell`)
      const beakVisor = sculptCurvedShell(
        [
          { y: 0.042, rx: 0.088, rz: 0.132, zBias: 0.014, arcHalfAngle: 1.22, keel: 0.038 },
          { y: 0.112, rx: 0.104, rz: 0.168, zBias: 0.02, arcHalfAngle: 1.28, keel: 0.056, fluteCount: 3, fluteAmp: 0.006 },
          { y: 0.158, rx: 0.102, rz: 0.146, zBias: 0.014, arcHalfAngle: 1.18, keel: 0.038 }
        ],
        0.009,
        11,
        1
      );
      const browCowl = sculptCurvedShell(
        [
          { y: 0.168, rx: 0.108, rz: 0.15, zBias: 0.012, arcHalfAngle: 1.18, keel: 0.032 },
          { y: 0.215, rx: 0.104, rz: 0.134, zBias: 0.004, arcHalfAngle: 1.1, keel: 0.02 }
        ],
        0.009,
        9,
        1
      );
      // Dorsal high-voltage aero-crest blade
      const aeroCrest: V2[] = [
        [0.09, 0.225],
        [0.02, 0.325],
        [-0.14, 0.365],
        [-0.22, 0.265],
        [-0.12, 0.185]
      ];

      slots.push(
        { mesh: armetSkull, materialIndex: 0 },
        { mesh: beakVisor, materialIndex: 0 },
        { mesh: browCowl, materialIndex: 7 },
        {
          mesh: transformMesh(extrudePolygonMesh(aeroCrest, 0.018, 0.005, false), {
            rot: [0, Math.PI * 0.5, 0]
          }),
          materialIndex: 1
        },
        // Glowing cyan crest conduit
        {
          mesh: tubeSweepMesh(
            [[0, 0.22, 0.118, 0.007], [0, 0.325, 0.01, 0.008], [0, 0.352, -0.125, 0.007]],
            6,
            true
          ),
          materialIndex: 6
        }
      );

      // Glowing electric-cyan V-slit oculars + swept lightning-wing temple crests
      for (const sx of [-1, 1] as const) {
        const wingPoly: V2[] = [
          [0.03, 0.145],
          [0.06, 0.205],
          [-0.08, 0.305],
          [-0.22, 0.355],
          [-0.18, 0.245],
          [-0.24, 0.215],
          [-0.11, 0.155]
        ];
        slots.push(
          {
            mesh: tubeSweepMesh(
              [
                [sx * 0.012, 0.154, 0.166, 0.008],
                [sx * 0.056, 0.166, 0.136, 0.009],
                [sx * 0.092, 0.178, 0.088, 0.007]
              ],
              6,
              true
            ),
            materialIndex: 6
          },
          {
            mesh: transformMesh(extrudePolygonMesh(wingPoly, 0.014, 0.004, false), {
              pos: [sx * 0.112, 0, 0],
              rot: [0, Math.PI * 0.5 + sx * 0.18, sx * 0.14]
            }),
            materialIndex: 1
          }
        );
      }
      break;
    }

    case "colossusHorned": {
      // BOULDER: Towering Horned Colossus Great-Helm with riveted bronze cruciform faceplate & blazing amber oculars!
      const greatHelm = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(0.02, 0.114, 0.124, 0.004, { segments: 18, frontKeel: 0.1 }),
            makeFlutedRing(0.1, 0.122, 0.134, 0.008, { segments: 18, flutes: 6, fluteAmp: 0.01, frontKeel: 0.14 }),
            makeFlutedRing(0.19, 0.126, 0.138, 0.008, { segments: 18, flutes: 6, fluteAmp: 0.012, frontKeel: 0.14 }),
            makeFlutedRing(0.268, 0.118, 0.126, 0.002, { segments: 18, frontKeel: 0.08 }),
            makeFlutedRing(0.312, 0.072, 0.078, -0.004, { segments: 18 })
          ],
          true
        ),
        1,
        0.44
      );
      // Heavy riveted bronze cruciform faceplate (brow band + nasal/jaw vertical keel + cheek jaw-plates)
      const browBand = sculptCurvedShell(
        [
          { y: 0.175, rx: 0.132, rz: 0.154, zBias: 0.01, arcHalfAngle: 1.38, keel: 0.018 },
          { y: 0.215, rx: 0.134, rz: 0.156, zBias: 0.01, arcHalfAngle: 1.38, keel: 0.018 }
        ],
        0.01,
        11,
        1
      );
      const jawGuard = sculptCurvedShell(
        [
          { y: 0.028, rx: 0.126, rz: 0.148, zBias: 0.012, arcHalfAngle: 1.28, keel: 0.024, fluteCount: 4, fluteAmp: 0.007 },
          { y: 0.126, rx: 0.128, rz: 0.152, zBias: 0.012, arcHalfAngle: 1.28, keel: 0.022, fluteCount: 4, fluteAmp: 0.006 }
        ],
        0.01,
        11,
        1
      );
      const nasalCross = tubeSweepMesh(
        [
          [0, 0.032, 0.168, 0.016],
          [0, 0.155, 0.176, 0.018],
          [0, 0.285, 0.148, 0.016],
          [0, 0.322, 0.02, 0.018],
          [0, 0.275, -0.115, 0.015]
        ],
        7,
        true
      );

      slots.push(
        { mesh: greatHelm, materialIndex: 0 },
        { mesh: browBand, materialIndex: 1 },
        { mesh: jawGuard, materialIndex: 1 },
        { mesh: nasalCross, materialIndex: 1 }
      );

      // Blazing molten-amber ocular slits + massive swept ridged colossus horns with bronze bands!
      for (const sx of [-1, 1] as const) {
        const hornPts = catmullRomSpline3(
          [
            [sx * 0.105, 0.228, 0.01],
            [sx * 0.205, 0.252, 0.025],
            [sx * 0.275, 0.335, 0.068],
            [sx * 0.245, 0.445, 0.118],
            [sx * 0.185, 0.515, 0.142]
          ],
          6
        ).map((p, i, arr) => [p[0], p[1], p[2], 0.044 * (1 - (i / (arr.length - 1)) * 0.84)] as V4);

        slots.push(
          {
            mesh: transformMesh(bevelBoxMesh(0.056, 0.018, 0.026, 0.004), {
              pos: [sx * 0.052, 0.154, 0.148],
              rot: [0, sx * 0.28, -sx * 0.06]
            }),
            materialIndex: 6
          },
          { mesh: tubeSweepMesh(hornPts, 10, true), materialIndex: 5 },
          // Bronze horn-root collar ring
          {
            mesh: transformMesh(
              latheMesh([[0.036, -0.018], [0.052, -0.014], [0.05, 0.018], [0.036, 0.022]], 12),
              { pos: [sx * 0.118, 0.232, 0.012], rot: [0, 0, -sx * 1.35] }
            ),
            materialIndex: 1
          },
          { mesh: forgedRivetMesh([sx * 0.088, 0.195, 0.132], 0.009), materialIndex: 0 },
          { mesh: forgedRivetMesh([sx * 0.072, 0.078, 0.138], 0.009), materialIndex: 0 }
        );
      }
      break;
    }

    case "valkyrieCirclet": {
      // SERAPH: Radiant Valkyrie Winged-Circlet Helm over sculpted noble visage (`sculptStylizedHeadMesh`) + feathered temple wings + high arched plume!
      const nobleVisage = transformMesh(
        sculptStylizedHeadMesh(0.104, {
          jawTaper: 0.28,
          cheekFullness: 0.1,
          noseBridge: 0.2,
          browRidge: 0.1,
          subdivisions: 2
        }),
        { pos: [0, 0.142, 0.008] }
      );
      // Open-faced gilded ivory paladin sallet-crown & sculpted cheek-guards framing the face
      const crownCap = sculptCurvedShell(
        [
          { y: 0.065, rx: 0.114, rz: 0.122, zBias: -0.014, arcHalfAngle: Math.PI * 0.68, centerAngle: Math.PI, fluteCount: 5, fluteAmp: 0.006 },
          { y: 0.165, rx: 0.116, rz: 0.126, zBias: -0.006, arcHalfAngle: Math.PI * 0.78, centerAngle: Math.PI, fluteCount: 5, fluteAmp: 0.007 },
          { y: 0.238, rx: 0.098, rz: 0.108, zBias: -0.004, arcHalfAngle: Math.PI * 0.88, centerAngle: Math.PI },
          { y: 0.278, rx: 0.048, rz: 0.056, zBias: -0.006, arcHalfAngle: Math.PI * 0.92, centerAngle: Math.PI }
        ],
        0.009,
        11,
        1
      );
      // Radiant Valkyrie winged-circlet diadem across the brow + solar forehead gem
      const diademCirclet = sculptCurvedShell(
        [
          { y: 0.172, rx: 0.116, rz: 0.128, zBias: 0.01, arcHalfAngle: 1.48, keel: 0.022 },
          { y: 0.212, rx: 0.114, rz: 0.126, zBias: 0.01, arcHalfAngle: 1.38, keel: 0.036 }
        ],
        0.009,
        11,
        1
      );
      // High flowing arched Valkyrie plume crest
      const plumeProfile: V2[] =
        side === "p1"
          ? [
              [0.06, 0.255],
              [0.11, 0.365],
              [-0.01, 0.435],
              [-0.19, 0.405],
              [-0.31, 0.235],
              [-0.21, 0.185],
              [-0.08, 0.255]
            ]
          : [
              [0.07, 0.255],
              [0.12, 0.375],
              [0.0, 0.445],
              [-0.18, 0.415],
              [-0.29, 0.255],
              [-0.2, 0.195],
              [-0.07, 0.255]
            ];

      slots.push(
        { mesh: nobleVisage, materialIndex: 7 },
        { mesh: crownCap, materialIndex: 0 },
        { mesh: diademCirclet, materialIndex: 1 },
        // Crest comb & forehead celestial cabochon gem
        {
          mesh: tubeSweepMesh(
            [[0, 0.22, 0.105, 0.013], [0, 0.295, 0.0, 0.018], [0, 0.245, -0.112, 0.014]],
            7,
            true
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.017, 1), {
            pos: [0, 0.198, 0.146],
            scale: [0.9, 1.35, 0.55]
          }),
          materialIndex: 6
        },
        {
          mesh: transformMesh(
            subdivideSmoothMesh(extrudePolygonMesh(plumeProfile, 0.042, 0.012, false), 1, 0.48),
            { rot: [0, Math.PI * 0.5, 0] }
          ),
          materialIndex: 3
        }
      );

      // Glowing celestial Valkyrie eyes + cheek-guards + 3-tier sculpted feathered Valkyrie temple wings!
      for (const sx of [-1, 1] as const) {
        slots.push(
          {
            mesh: transformMesh(icosphereSmoothMesh(0.012, 1), {
              pos: [sx * 0.034, 0.152, 0.104],
              scale: [1.35, 0.65, 0.55]
            }),
            materialIndex: 6
          },
          // Sculpted gilded cheek-guard
          {
            mesh: sculptCurvedShell(
              [
                { y: 0.068, rx: 0.098, rz: 0.112, zBias: 0.008, arcHalfAngle: 0.42, centerAngle: sx * 1.15, keel: 0.008 },
                { y: 0.158, rx: 0.112, rz: 0.12, zBias: 0.006, arcHalfAngle: 0.48, centerAngle: sx * 1.25, keel: 0.008 }
              ],
              0.007,
              7,
              1
            ),
            materialIndex: 1
          }
        );
        // 3 layered Valkyrie wing primaries sweeping back & upward from each temple
        for (const [fi, len, lift, spread] of [
          [0, 0.25, 0.22, 0.18],
          [1, 0.21, 0.15, 0.23],
          [2, 0.16, 0.08, 0.27]
        ] as const) {
          const featherSpine = catmullRomSpline3(
            [
              [sx * 0.108, 0.178 - fi * 0.016, 0.025],
              [sx * (0.128 + spread * 0.35), 0.198 + lift * 0.45, -len * 0.42],
              [sx * (0.138 + spread * 0.55), 0.185 + lift, -len]
            ],
            4
          ).map((p, i, arr) => [p[0], p[1], p[2], 0.024 * (1 - (i / (arr.length - 1)) * 0.72)] as V4);
          slots.push({ mesh: sculptDiamondBladeMesh(featherSpine, 0.22, "y"), materialIndex: 1 });
        }
      }
      break;
    }

    case "hoodedCrescent": {
      // JINX: Deeply cowled Phantom Duelist Peaked Hood + ornate porcelain-and-silver Crescent Mask with glowing violet eyes!
      const phantomHood = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(-0.015, 0.148, 0.146, -0.01, { segments: 18, flutes: 6, fluteAmp: 0.022 }),
            makeFlutedRing(0.075, 0.138, 0.144, -0.006, { segments: 18, flutes: 6, fluteAmp: 0.02 }),
            makeFlutedRing(0.175, 0.136, 0.154, 0.008, { segments: 18, flutes: 5, fluteAmp: 0.018, frontKeel: 0.12 }),
            makeFlutedRing(0.262, 0.106, 0.148, 0.022, { segments: 18, frontKeel: 0.22 }),
            makeFlutedRing(0.322, 0.036, 0.095, 0.048, { segments: 18, frontKeel: 0.26 })
          ],
          true
        ),
        1,
        0.48
      );
      // Draped hood cowl rim overhanging the brow + silver-embroidered hood trim
      const hoodBrimArch = tubeSweepMesh(
        [
          [-0.112, 0.068, 0.088, 0.012],
          [-0.102, 0.188, 0.122, 0.013],
          [0, 0.258, 0.172, 0.014],
          [0.102, 0.188, 0.122, 0.013],
          [0.112, 0.068, 0.088, 0.012]
        ],
        7,
        true
      );
      // Ornate sculpted porcelain-and-silver Crescent Mask nestled inside the dark cowl recess
      const innerShadow = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(0.055, 0.082, 0.094, 0.008, { segments: 14 }),
            makeFlutedRing(0.145, 0.092, 0.106, 0.012, { segments: 14 }),
            makeFlutedRing(0.215, 0.078, 0.092, 0.008, { segments: 14 })
          ],
          true
        ),
        1,
        0.45
      );
      const porcelainMask = sculptCurvedShell(
        [
          { y: 0.055, rx: 0.076, rz: 0.118, zBias: 0.014, arcHalfAngle: 1.08, keel: 0.024 },
          { y: 0.125, rx: 0.094, rz: 0.132, zBias: 0.016, arcHalfAngle: 1.18, keel: 0.03 },
          { y: 0.195, rx: 0.088, rz: 0.124, zBias: 0.014, arcHalfAngle: 1.12, keel: 0.022 }
        ],
        0.008,
        9,
        1
      );
      // Raised silver crescent-moon emblem on mask forehead
      const browCrescent = tubeSweepMesh(
        [
          [-0.038, 0.205, 0.13, 0.005],
          [-0.022, 0.182, 0.142, 0.008],
          [0, 0.174, 0.148, 0.01],
          [0.022, 0.182, 0.142, 0.008],
          [0.038, 0.205, 0.13, 0.005]
        ],
        6,
        true
      );

      slots.push(
        { mesh: phantomHood, materialIndex: 3 },
        { mesh: hoodBrimArch, materialIndex: 1 },
        { mesh: innerShadow, materialIndex: 5 },
        { mesh: porcelainMask, materialIndex: 7 },
        { mesh: browCrescent, materialIndex: 1 }
      );

      // Piercing glowing violet crescent eyes + silver cheek filigree
      for (const sx of [-1, 1] as const) {
        slots.push(
          {
            mesh: tubeSweepMesh(
              [
                [sx * 0.016, 0.144, 0.144, 0.007],
                [sx * 0.044, 0.15, 0.134, 0.009],
                [sx * 0.068, 0.162, 0.114, 0.006]
              ],
              6,
              true
            ),
            materialIndex: 6
          },
          {
            mesh: tubeSweepMesh(
              [
                [sx * 0.055, 0.125, 0.124, 0.005],
                [sx * 0.038, 0.088, 0.128, 0.006]
              ],
              5,
              true
            ),
            materialIndex: 1
          }
        );
      }
      break;
    }

    case "dreadCrown": {
      // SOVEREIGN: Dread Visored High-King Helm (vertical iron visor bars over furnace-gold abyss) forged with a jagged 10-spire Iron-and-Gold Crown!
      const dreadHelm = subdivideSmoothMesh(
        loftSectionsMesh(
          [
            makeFlutedRing(0.022, 0.1, 0.112, -0.004, { segments: 18, flutes: 6, fluteAmp: 0.012 }),
            makeFlutedRing(0.095, 0.112, 0.126, 0.0, { segments: 18, flutes: 8, fluteAmp: 0.015, frontKeel: 0.12 }),
            makeFlutedRing(0.185, 0.116, 0.132, 0.004, { segments: 18, flutes: 8, fluteAmp: 0.015, frontKeel: 0.12 }),
            makeFlutedRing(0.252, 0.108, 0.118, -0.002, { segments: 18, flutes: 8, fluteAmp: 0.012 }),
            makeFlutedRing(0.295, 0.062, 0.068, -0.006, { segments: 18 })
          ],
          true
        ),
        1,
        0.46
      );
      // Sculpted lower dread-bevor jaw plate + overhanging crown-brow visor
      const dreadJaw = sculptCurvedShell(
        [
          { y: 0.025, rx: 0.104, rz: 0.146, zBias: 0.014, arcHalfAngle: 1.24, keel: 0.036, fluteCount: 5, fluteAmp: 0.007 },
          { y: 0.128, rx: 0.114, rz: 0.158, zBias: 0.016, arcHalfAngle: 1.28, keel: 0.038, fluteCount: 5, fluteAmp: 0.007 }
        ],
        0.009,
        11,
        1
      );
      // Blazing furnace-gold ocular abyss recessed behind vertical forged visor bars
      const furnaceVisorGlow = sculptCurvedShell(
        [
          { y: 0.136, rx: 0.098, rz: 0.134, zBias: 0.012, arcHalfAngle: 1.05, keel: 0.016 },
          { y: 0.176, rx: 0.098, rz: 0.134, zBias: 0.012, arcHalfAngle: 1.05, keel: 0.016 }
        ],
        0.006,
        9,
        0
      );

      // Forged Iron-and-Gold High-King Crown Band + 10 jagged Gothic spires!
      const crownCirclet = latheMesh(
        [
          [0.108, 0.2],
          [0.134, 0.208],
          [0.136, 0.252],
          [0.11, 0.258]
        ],
        20
      );

      slots.push(
        { mesh: dreadHelm, materialIndex: 0 },
        { mesh: dreadJaw, materialIndex: 0 },
        { mesh: furnaceVisorGlow, materialIndex: 6 },
        { mesh: crownCirclet, materialIndex: 1 },
        // Central sovereign brow ruby/amber gem
        {
          mesh: transformMesh(icosphereSmoothMesh(0.02, 1), {
            pos: [0, 0.228, 0.142],
            scale: [0.9, 1.35, 0.55]
          }),
          materialIndex: 6
        }
      );

      // 5 vertical dread visor bars across the glowing furnace ocular recess
      for (const barAngle of [-0.68, -0.34, 0, 0.34, 0.68] as const) {
        const bx = Math.sin(barAngle) * 0.112;
        const bz = Math.cos(barAngle) * 0.154 + 0.014;
        slots.push({
          mesh: tubeSweepMesh(
            [
              [bx, 0.122, bz, 0.0075],
              [bx, 0.196, bz, 0.0075]
            ],
            5,
            true
          ),
          materialIndex: barAngle === 0 ? 1 : 0
        });
      }

      // 10 jagged Iron-and-Gold High-King Crown spires (tallest sovereign spire dead-center in front!)
      const spireCount = 10;
      for (let i = 0; i < spireCount; i += 1) {
        const a = (i / spireCount) * Math.PI * 2;
        const isFront = i === 0;
        const isMajor = i % 2 === 0;
        const h = isFront ? 0.175 : isMajor ? 0.135 : 0.088;
        const rad = 0.124;
        const sx = Math.sin(a);
        const cz = Math.cos(a);
        const spireSpine: V4[] = [
          [sx * rad, 0.244, cz * rad, isFront ? 0.026 : 0.021],
          [sx * (rad + 0.014), 0.244 + h * 0.55, cz * (rad + 0.014), isFront ? 0.016 : 0.013],
          [sx * (rad + 0.006), 0.244 + h, cz * (rad + 0.006), 0.0025]
        ];
        slots.push({
          mesh: sculptDiamondBladeMesh(spireSpine, 0.65, "x"),
          materialIndex: isMajor ? 1 : 0
        });
      }
      break;
    }
  }

  return slots;
}

function buildUpperArmSlots(
  fighterId: GladiatorArchetypeId,
  sideSign: 1 | -1,
  b: ArchetypeBuild
): MultiMatSlot[] {
  const ps = b.pauldronScale;
  const ls = b.limbScale;
  const outAngle = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

  // Anatomical deltoid & bicep (`sculptAnatomicalLimbMesh`) — zero spheres, zero PVC pipes!
  const anatomicalBicep = sculptAnatomicalLimbMesh(
    [
      { pos: [0, 0.032, 0], rx: 0.056 * ls, rz: 0.058 * ls },
      { pos: [sideSign * 0.008, -0.035, 0.004], rx: 0.068 * ls, rz: 0.07 * ls, zOffset: 0.004 },
      { pos: [sideSign * 0.008, -0.105, 0.006], rx: 0.064 * ls, rz: 0.068 * ls, zOffset: 0.008 },
      { pos: [sideSign * 0.005, -0.185, 0.004], rx: 0.056 * ls, rz: 0.058 * ls, zOffset: 0.004 },
      { pos: [0, -0.265, 0], rx: 0.046 * ls, rz: 0.048 * ls }
    ],
    { ringPoints: 16, muscleBiasZ: 0.012, peakT: 0.42 }
  );

  // Sculpted outer `rerebrace` bicep plate wrapping around the arm
  const rerebracePlate = sculptCurvedShell(
    [
      { y: -0.235, rx: 0.058 * ls, rz: 0.06 * ls, arcHalfAngle: 1.55, centerAngle: outAngle, keel: 0.008 },
      { y: -0.115, rx: 0.072 * ls, rz: 0.074 * ls, arcHalfAngle: 1.62, centerAngle: outAngle, keel: 0.01, fluteCount: 3, fluteAmp: 0.004 }
    ],
    0.007,
    9,
    1
  );

  const slots: MultiMatSlot[] = [
    { mesh: anatomicalBicep, materialIndex: 2 },
    { mesh: rerebracePlate, materialIndex: fighterId === "jinx" && sideSign < 0 ? 5 : 0 },
    // Buckled leather bicep strap securing rerebrace
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

  if (fighterId === "kenji") {
    // KENJI: Authentic 3-tier curved rectangular Japanese `O-Sode` lacquered shoulder shields with gold fukurin borders!
    for (const [tierIdx, yTop, yBot, radX] of [
      [0, 0.085 * ps, -0.015 * ps, 0.112 * ps],
      [1, -0.005 * ps, -0.095 * ps, 0.122 * ps],
      [2, -0.085 * ps, -0.175 * ps, 0.13 * ps]
    ] as const) {
      const sodeLame = sculptCurvedShell(
        [
          { y: yBot, rx: radX, rz: 0.118 * ps, arcHalfAngle: 0.92, centerAngle: outAngle, keel: 0.008 },
          { y: yTop, rx: radX - 0.008, rz: 0.114 * ps, arcHalfAngle: 0.9, centerAngle: outAngle, keel: 0.008 }
        ],
        0.009,
        9,
        1
      );
      slots.push({
        mesh: sodeLame,
        materialIndex: tierIdx === 1 ? 3 : 0
      });
    }
    // Gilded `fukurin` top cap & bottom border bar on O-Sode
    slots.push(
      {
        mesh: tubeSweepMesh(
          [
            [sideSign * 0.072 * ps, 0.088 * ps, 0.092 * ps, 0.008],
            [sideSign * 0.116 * ps, 0.092 * ps, 0, 0.009],
            [sideSign * 0.072 * ps, 0.088 * ps, -0.092 * ps, 0.008]
          ],
          6,
          true
        ),
        materialIndex: 1
      },
      { mesh: forgedRivetMesh([sideSign * 0.126 * ps, -0.045 * ps, 0], 0.01), materialIndex: 1 }
    );
    return slots;
  }

  // Asymmetrical rogue pauldron scale for Jinx (sleek duel guard on right, larger hex-pauldron on left)
  const effPs = fighterId === "jinx" && sideSign < 0 ? ps * 0.84 : ps;

  // 3-tier overlapping winged & fluted Gothic `spaulders` (`sculptCurvedShell`)
  const grandPauldron = sculptCurvedShell(
    [
      { y: -0.038 * effPs, rx: 0.128 * effPs, rz: 0.122 * effPs, arcHalfAngle: 1.56, centerAngle: outAngle, keel: 0.022, fluteCount: 5, fluteAmp: 0.007 },
      { y: 0.035 * effPs, rx: 0.122 * effPs, rz: 0.118 * effPs, arcHalfAngle: 1.52, centerAngle: outAngle, keel: 0.024, fluteCount: 5, fluteAmp: 0.007 },
      { y: 0.098 * effPs, rx: 0.086 * effPs, rz: 0.092 * effPs, arcHalfAngle: 1.42, centerAngle: outAngle, keel: 0.016 }
    ],
    0.01,
    11,
    1
  );
  const midSpaulderLame = sculptCurvedShell(
    [
      { y: -0.098 * effPs, rx: 0.122 * effPs, rz: 0.112 * effPs, arcHalfAngle: 1.44, centerAngle: outAngle, keel: 0.018, fluteCount: 3, fluteAmp: 0.005 },
      { y: -0.032 * effPs, rx: 0.124 * effPs, rz: 0.116 * effPs, arcHalfAngle: 1.48, centerAngle: outAngle, keel: 0.018 }
    ],
    0.009,
    9,
    1
  );
  const lowSpaulderLame = sculptCurvedShell(
    [
      { y: -0.152 * effPs, rx: 0.112 * effPs, rz: 0.102 * effPs, arcHalfAngle: 1.32, centerAngle: outAngle, keel: 0.016 },
      { y: -0.092 * effPs, rx: 0.118 * effPs, rz: 0.108 * effPs, arcHalfAngle: 1.38, centerAngle: outAngle, keel: 0.016 }
    ],
    0.008,
    9,
    1
  );

  // Raised gilded pauldron border trim + upright `haute-piece` sword-breaker guard blade + forged rivets
  const pauldronTrim = tubeSweepMesh(
    [
      [sideSign * 0.032 * effPs, -0.042 * effPs, 0.118 * effPs, 0.008],
      [sideSign * 0.146 * effPs, -0.046 * effPs, 0, 0.0095],
      [sideSign * 0.032 * effPs, -0.042 * effPs, -0.118 * effPs, 0.008]
    ],
    7,
    true
  );
  const hautePieceGuard = sculptCurvedShell(
    [
      { y: 0.068 * effPs, rx: 0.068 * effPs, rz: 0.096 * effPs, arcHalfAngle: 1.15, centerAngle: outAngle, keel: 0.008 },
      { y: 0.145 * effPs, rx: 0.056 * effPs, rz: 0.088 * effPs, arcHalfAngle: 1.05, centerAngle: outAngle, keel: 0.012 }
    ],
    0.008,
    7,
    1
  );

  slots.push(
    { mesh: grandPauldron, materialIndex: 0 },
    { mesh: midSpaulderLame, materialIndex: 0 },
    { mesh: lowSpaulderLame, materialIndex: fighterId === "jinx" ? 5 : 0 },
    { mesh: pauldronTrim, materialIndex: 1 },
    { mesh: hautePieceGuard, materialIndex: 1 },
    { mesh: forgedRivetMesh([sideSign * 0.128 * effPs, -0.065 * effPs, 0.052 * effPs], 0.008), materialIndex: 1 },
    { mesh: forgedRivetMesh([sideSign * 0.128 * effPs, -0.065 * effPs, -0.052 * effPs], 0.008), materialIndex: 1 }
  );

  if (fighterId === "boulder" || fighterId === "sovereign") {
    // Forged colossus / dread-king pauldron spikes
    const spikeH = fighterId === "boulder" ? 0.095 : 0.082;
    slots.push({
      mesh: sculptDiamondBladeMesh(
        [
          [sideSign * 0.105 * effPs, 0.048 * effPs, 0, 0.022],
          [sideSign * (0.105 * effPs + spikeH * 0.75), 0.048 * effPs + spikeH, 0, 0.003]
        ],
        0.65,
        "y"
      ),
      materialIndex: 1
    });
  } else if (fighterId === "volt") {
    slots.push({
      mesh: tubeSweepMesh(
        [
          [sideSign * 0.136 * effPs, -0.03 * effPs, 0, 0.007],
          [sideSign * 0.088 * effPs, 0.075 * effPs, 0, 0.007]
        ],
        5,
        true
      ),
      materialIndex: 6
    });
  }

  return slots;
}

function buildForearmGauntletSlots(sideSign: 1 | -1, b: ArchetypeBuild): MultiMatSlot[] {
  const ls = b.limbScale;
  const outAngle = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const elbowAngle = Math.PI + sideSign * 0.36;

  // Tapered anatomical forearm (`sculptAnatomicalLimbMesh` — brachioradialis swell tapering cleanly to wrist)
  const forearmMuscle = sculptAnatomicalLimbMesh(
    [
      { pos: [0, 0.024, 0], rx: 0.044 * ls, rz: 0.046 * ls },
      { pos: [sideSign * 0.005, -0.058, 0.003], rx: 0.055 * ls, rz: 0.057 * ls, zOffset: 0.005 },
      { pos: [sideSign * 0.003, -0.145, 0.004], rx: 0.045 * ls, rz: 0.047 * ls, zOffset: 0.003 },
      { pos: [0, -0.218, 0.005], rx: 0.038 * ls, rz: 0.04 * ls }
    ],
    { ringPoints: 16, muscleBiasZ: 0.008, peakT: 0.34 }
  );

  // Pointed diamond-ridge `couter` elbow cop (`sculptCurvedShell`) + swept heart/fan couter wing (ZERO spheres!)
  const couterCop = sculptCurvedShell(
    [
      { y: -0.052, rx: 0.056 * ls, rz: 0.062 * ls, arcHalfAngle: 1.35, centerAngle: elbowAngle, keel: 0.016 },
      { y: 0.0, rx: 0.062 * ls, rz: 0.072 * ls, arcHalfAngle: 1.48, centerAngle: elbowAngle, keel: 0.032, fluteCount: 3, fluteAmp: 0.005 },
      { y: 0.052, rx: 0.054 * ls, rz: 0.06 * ls, arcHalfAngle: 1.32, centerAngle: elbowAngle, keel: 0.014 }
    ],
    0.008,
    9,
    1
  );
  const couterWing: V2[] = [
    [0, -0.052],
    [0.058, -0.015],
    [0.072, 0.035],
    [0.036, 0.072],
    [-0.024, 0.042]
  ];

  // Sculpted outer `vambrace` forearm shell + flared Gothic gauntlet cuff
  const vambraceShell = sculptCurvedShell(
    [
      { y: -0.205, rx: 0.048 * ls, rz: 0.05 * ls, zBias: 0.004, arcHalfAngle: 1.62, centerAngle: outAngle, keel: 0.008 },
      { y: -0.125, rx: 0.058 * ls, rz: 0.06 * ls, zBias: 0.003, arcHalfAngle: 1.65, centerAngle: outAngle, keel: 0.012, fluteCount: 3, fluteAmp: 0.004 },
      { y: -0.048, rx: 0.062 * ls, rz: 0.064 * ls, zBias: 0.002, arcHalfAngle: 1.58, centerAngle: outAngle, keel: 0.01 }
    ],
    0.008,
    9,
    1
  );
  const gauntletCuff = sculptCurvedShell(
    [
      { y: -0.236, rx: 0.046 * ls, rz: 0.048 * ls, zBias: 0.006, arcHalfAngle: Math.PI * 0.88, centerAngle: outAngle, keel: 0.006 },
      { y: -0.192, rx: 0.058 * ls, rz: 0.06 * ls, zBias: 0.005, arcHalfAngle: Math.PI * 0.88, centerAngle: outAngle, keel: 0.012 }
    ],
    0.007,
    9,
    1
  );

  // Articulated metacarpal gauntlet backplate + knuckle-ridge + 4 articulated curled finger lames + thumb!
  const metacarpalHand = transformMesh(
    subdivideSmoothMesh(bevelBoxMesh(0.068 * ls, 0.058, 0.046, 0.012), 1, 0.42),
    { pos: [0, -0.252, 0.008] }
  );
  const knuckleBar = tubeSweepMesh(
    [
      [-0.032 * ls, -0.274, 0.018, 0.009],
      [0, -0.276, 0.024, 0.01],
      [0.032 * ls, -0.274, 0.018, 0.009]
    ],
    6,
    true
  );

  const slots: MultiMatSlot[] = [
    { mesh: forearmMuscle, materialIndex: 2 },
    { mesh: couterCop, materialIndex: 1 },
    {
      mesh: transformMesh(extrudePolygonMesh(couterWing, 0.012, 0.004, false), {
        pos: [sideSign * 0.058 * ls, 0.004, -0.012],
        rot: [0, Math.PI * 0.5 - sideSign * 0.22, 0]
      }),
      materialIndex: 1
    },
    { mesh: vambraceShell, materialIndex: 0 },
    { mesh: gauntletCuff, materialIndex: 0 },
    // Buckled leather vambrace strap
    {
      mesh: latheMesh(
        [
          [0.048 * ls, -0.155],
          [0.058 * ls, -0.152],
          [0.058 * ls, -0.134],
          [0.048 * ls, -0.13]
        ],
        14
      ),
      materialIndex: 5
    },
    { mesh: metacarpalHand, materialIndex: 0 },
    { mesh: knuckleBar, materialIndex: 1 }
  ];

  // 4 individual articulated armored fingers curled securely around weapon/shield grip (`y = -0.26, z = 0.02`)
  for (const fx of [-0.024, -0.008, 0.008, 0.024] as const) {
    const fingerArc = tubeSweepMesh(
      [
        [fx * ls, -0.274, 0.022, 0.0085],
        [fx * ls, -0.296, 0.032, 0.0078],
        [fx * ls, -0.292, 0.008, 0.0068]
      ],
      6,
      true
    );
    slots.push({ mesh: fingerArc, materialIndex: 0 });
  }
  // Opposable articulated thumb lame
  const thumbArc = tubeSweepMesh(
    [
      [-sideSign * 0.032 * ls, -0.248, 0.02, 0.0095],
      [-sideSign * 0.026 * ls, -0.272, 0.036, 0.0082],
      [-sideSign * 0.012 * ls, -0.282, 0.028, 0.0072]
    ],
    6,
    true
  );
  slots.push({ mesh: thumbArc, materialIndex: 1 });

  return slots;
}

function buildWeaponSlots(style: ArchetypeBuild["weaponStyle"]): MultiMatSlot[] {
  // Weapon origin = right gauntlet palm `[0, -0.26, 0.02]`, grip along Z, blade extending forward (+Z) with edge along +Y
  switch (style) {
    case "katana": {
      // KENJI: Curved Shinogi-Zukuri Katana with diamond-wrapped tsuka, ornate lobed dragon tsuba, brass habaki & razor curve
      const bladeSpine = catmullRomSpline3(
        [
          [0, 0.002, 0.088],
          [0, 0.016, 0.42],
          [0, 0.056, 0.78],
          [0, 0.118, 1.08],
          [0, 0.152, 1.19]
        ],
        6
      ).map((p, i, arr) => {
        const u = i / (arr.length - 1);
        const hw = u > 0.88 ? 0.022 * (1 - (u - 0.88) / 0.12) + 0.002 : 0.023 * (1 - u * 0.16);
        return [p[0], p[1], p[2], hw] as V4;
      });

      const slots: MultiMatSlot[] = [
        // Tsuka rayskin core + kashira pommel cap + fuchi collar + ornate lobed tsuba + brass habaki + curved blade
        { mesh: tubeSweepMesh([[0, 0, -0.23, 0.016], [0, 0, 0.052, 0.018]], 10, true), materialIndex: 7 },
        {
          mesh: transformMesh(bevelBoxMesh(0.032, 0.04, 0.028, 0.007), { pos: [0, 0, -0.238] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.062, 0], [0.064, 0.012], [0.048, 0.016], [0, 0.016]], 18),
            { pos: [0, 0, 0.052], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.024, 0.042, 0.036, 0.005), { pos: [0, 0.002, 0.078] }),
          materialIndex: 1
        },
        { mesh: sculptDiamondBladeMesh(bladeSpine, 0.22, "y"), materialIndex: 4 }
      ];
      // Tsuka-ito silk diamond cord-wrap rings along hilt
      for (const gz of [-0.19, -0.14, -0.09, -0.04, 0.01] as const) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.036, 0.042, 0.022, 0.005), {
            pos: [0, 0, gz],
            rot: [0, 0, 0.28]
          }),
          materialIndex: 3
        });
      }
      return slots;
    }

    case "stormSpear": {
      // VOLT: Twin-Pronged Storm Spear / Katar-Lance with glowing electric-cyan capacitor core & swept lightning prongs!
      const centerBlade: V4[] = [
        [0, 0, 0.14, 0.042],
        [0, 0, 0.52, 0.034],
        [0, 0, 0.88, 0.022],
        [0, 0, 1.06, 0.0025]
      ];
      const slots: MultiMatSlot[] = [
        // Counterweighted storm-shaft + armored storm-gauntlet housing + glowing cyan arc core
        { mesh: tubeSweepMesh([[0, 0, -0.32, 0.018], [0, 0, 0.14, 0.02]], 8, true), materialIndex: 7 },
        {
          mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.118, 0.108, 0.185, 0.024), 1, 0.42), {
            pos: [0, 0, 0.055]
          }),
          materialIndex: 0
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.032, 1), {
            pos: [0, 0, 0.145],
            scale: [1.1, 0.85, 1.3]
          }),
          materialIndex: 6
        },
        { mesh: sculptDiamondBladeMesh(centerBlade, 0.24, "y"), materialIndex: 4 },
        // Glowing electric-cyan central fuller conduit
        { mesh: tubeSweepMesh([[0, 0, 0.16, 0.009], [0, 0, 0.78, 0.005]], 6, true), materialIndex: 6 }
      ];
      // Twin swept outer lightning prongs flanking the central storm spear
      for (const sy of [-1, 1] as const) {
        const prongSpine = catmullRomSpline3(
          [
            [0, sy * 0.046, 0.12],
            [0, sy * 0.092, 0.34],
            [0, sy * 0.072, 0.62],
            [0, sy * 0.048, 0.84]
          ],
          5
        ).map((p, i, arr) => [p[0], p[1], p[2], 0.022 * (1 - (i / (arr.length - 1)) * 0.85)] as V4);
        slots.push({ mesh: sculptDiamondBladeMesh(prongSpine, 0.28, "y"), materialIndex: 4 });
      }
      return slots;
    }

    case "runeWarhammer": {
      // BOULDER: Rune-Forged Colossus Warhammer with massive beveled iron-bronze head, glowing forge runes, raven-beak fluke & thrusting spike!
      const beakSpine = catmullRomSpline3(
        [
          [0, -0.04, 0.72],
          [0, -0.14, 0.71],
          [0, -0.24, 0.65],
          [0, -0.29, 0.58]
        ],
        4
      ).map((p, i, arr) => [p[0], p[1], p[2], 0.036 * (1 - (i / (arr.length - 1)) * 0.86)] as V4);

      return [
        // Heavy leather-wrapped war-haft + spiked bronze pommel + bronze langets
        { mesh: tubeSweepMesh([[0, 0, -0.34, 0.023], [0, 0, 0.84, 0.026]], 10, true), materialIndex: 5 },
        {
          mesh: transformMesh(
            latheMesh([[0, -0.05], [0.042, -0.015], [0.042, 0.02], [0, 0.03]], 12),
            { pos: [0, 0, -0.35], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.068, 0.068, 0.28, 0.012), { pos: [0, 0, 0.68] }),
          materialIndex: 1
        },
        // Massive faceted colossus hammer block + bronze striking face + glowing forge-rune cheek inlays
        {
          mesh: transformMesh(bevelBoxMesh(0.155, 0.255, 0.175, 0.024), { pos: [0, 0.055, 0.72] }),
          materialIndex: 0
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.172, 0.115, 0.192, 0.016), { pos: [0, 0.165, 0.72] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.166, 0.085, 0.042, 0.008), { pos: [0, 0.055, 0.72] }),
          materialIndex: 6
        },
        // Armor-piercing raven's-beak back fluke + forward thrusting finial spike
        { mesh: sculptDiamondBladeMesh(beakSpine, 0.42, "x"), materialIndex: 4 },
        {
          mesh: sculptDiamondBladeMesh(
            [
              [0, 0, 0.81, 0.036],
              [0, 0, 0.94, 0.02],
              [0, 0, 1.05, 0.003]
            ],
            0.65,
            "y"
          ),
          materialIndex: 4
        }
      ];
    }

    case "celestialSunBlade": {
      // SERAPH: Celestial Sun-Blade Partisan / Glaive with sunburst halo crossguard, luminous fuller & twin wing-flukes!
      const sunBladeSpine: V4[] = [
        [0, 0, 0.72, 0.062],
        [0, 0, 0.96, 0.052],
        [0, 0, 1.24, 0.034],
        [0, 0, 1.44, 0.003]
      ];
      const slots: MultiMatSlot[] = [
        // Gilded ivory/leather partisan shaft + butt-spike + sunburst collar + luminous central fuller + silk tassel
        { mesh: tubeSweepMesh([[0, 0, -0.48, 0.02], [0, 0, 0.74, 0.022]], 10, true), materialIndex: 5 },
        {
          mesh: transformMesh(
            latheMesh([[0, -0.08], [0.032, 0], [0.032, 0.03], [0, 0.04]], 12),
            { pos: [0, 0, -0.49], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.068, 0], [0.072, 0.024], [0.042, 0.046], [0, 0.048]], 16),
            { pos: [0, 0, 0.7], rot: [Math.PI * 0.5, 0, 0] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.026, 1), {
            pos: [0, 0, 0.735],
            scale: [0.7, 1.2, 1.2]
          }),
          materialIndex: 6
        },
        { mesh: sculptDiamondBladeMesh(sunBladeSpine, 0.22, "y"), materialIndex: 4 },
        { mesh: tubeSweepMesh([[0, 0, 0.75, 0.01], [0, 0, 1.2, 0.005]], 6, true), materialIndex: 6 },
        {
          mesh: tubeSweepMesh(
            [[0, -0.03, 0.68, 0.022], [0, -0.15, 0.61, 0.016], [0, -0.25, 0.54, 0.008]],
            6,
            true
          ),
          materialIndex: 3
        }
      ];
      // Twin gilded celestial wing-flukes sweeping out from sunburst crossguard
      for (const sy of [-1, 1] as const) {
        const wingFluke = catmullRomSpline3(
          [
            [0, sy * 0.042, 0.72],
            [0, sy * 0.145, 0.76],
            [0, sy * 0.215, 0.88]
          ],
          4
        ).map((p, i, arr) => [p[0], p[1], p[2], 0.028 * (1 - (i / (arr.length - 1)) * 0.82)] as V4);
        slots.push({ mesh: sculptDiamondBladeMesh(wingFluke, 0.28, "y"), materialIndex: 1 });
      }
      return slots;
    }

    case "hexTwinBlade": {
      // JINX: Wicked recurved Phantom Hex-Saber with swept crescent knuckle-bow, violet rune fuller & crescent pommel!
      const hexBladeSpine = catmullRomSpline3(
        [
          [0, 0, 0.075],
          [0, -0.012, 0.34],
          [0, 0.048, 0.66],
          [0, 0.148, 0.94],
          [0, 0.205, 1.07]
        ],
        6
      ).map((p, i, arr) => {
        const u = i / (arr.length - 1);
        const hw = u > 0.86 ? 0.034 * (1 - (u - 0.86) / 0.14) + 0.002 : 0.026 + Math.sin(u * Math.PI) * 0.014;
        return [p[0], p[1], p[2], hw] as V4;
      });
      const hexRuneLine = catmullRomSpline3(
        [
          [0, 0, 0.11],
          [0, -0.008, 0.34],
          [0, 0.045, 0.64],
          [0, 0.115, 0.84]
        ],
        5
      ).map((p) => [p[0], p[1], p[2], 0.0075] as V4);

      return [
        { mesh: tubeSweepMesh([[0, 0, -0.18, 0.017], [0, 0, 0.065, 0.019]], 8, true), materialIndex: 5 },
        // Swept silver crescent knuckle-bow guard + violet guard gem
        {
          mesh: tubeSweepMesh(
            [
              [0, -0.055, 0.088, 0.01],
              [0, 0.035, 0.072, 0.014],
              [0, 0.095, -0.025, 0.013],
              [0, 0.018, -0.175, 0.011]
            ],
            7,
            true
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.018, 1), { pos: [0, 0.015, 0.074] }),
          materialIndex: 6
        },
        { mesh: sculptDiamondBladeMesh(hexBladeSpine, 0.22, "y"), materialIndex: 4 },
        { mesh: tubeSweepMesh(hexRuneLine, 6, true), materialIndex: 6 }
      ];
    }

    case "royalGreatsword": {
      // SOVEREIGN: Ornate Royal Zweihander Greatsword with winged quillions, ricasso parrying hooks & molten fuller!
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
        // Two-handed cord-wrapped hilt + crowned wheel pommel + winged crossguard + leather ricasso + royal blade
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
        // Leather-wrapped `ricasso` above guard + massive hollow-ground diamond blade + molten-gold fuller
        {
          mesh: transformMesh(bevelBoxMesh(0.036, 0.088, 0.16, 0.008), { pos: [0, 0, 0.165] }),
          materialIndex: 7
        },
        { mesh: sculptDiamondBladeMesh(greatswordSpine, 0.24, "y"), materialIndex: 4 },
        { mesh: tubeSweepMesh([[0, 0, 0.25, 0.011], [0, 0, 0.96, 0.006]], 6, true), materialIndex: 6 }
      ];
      // Twin Zweihander parrying hooks (`Parierhaken`) above the ricasso
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

function buildShieldSlots(style: ArchetypeBuild["shieldStyle"]): MultiMatSlot[] {
  // Mounted on outer left forearm (`+X` face, centered around `[0.068, -0.12, 0.02]`)
  const outAngle = Math.PI * 0.5;
  switch (style) {
    case "sodeGuard": {
      // KENJI: Ornate curved lacquered Samurai Kote/Tate forearm guard with gilded fukurin border & glowing mon boss
      const tatePlate = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.28, rx: 0.082, rz: 0.135, arcHalfAngle: 0.95, centerAngle: outAngle, keel: 0.016, fluteCount: 3, fluteAmp: 0.005 },
            { y: -0.11, rx: 0.088, rz: 0.155, arcHalfAngle: 1.02, centerAngle: outAngle, keel: 0.02, fluteCount: 3, fluteAmp: 0.006 },
            { y: 0.06, rx: 0.08, rz: 0.128, arcHalfAngle: 0.92, centerAngle: outAngle, keel: 0.014 }
          ],
          0.01,
          9,
          1
        ),
        { pos: [0.012, 0, 0.02] }
      );
      return [
        { mesh: tatePlate, materialIndex: 0 },
        {
          mesh: transformMesh(bevelBoxMesh(0.018, 0.35, 0.032, 0.005), { pos: [0.104, -0.11, 0.02] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.044, 0], [0.046, 0.014], [0.02, 0.026], [0, 0.03]], 14),
            { pos: [0.106, -0.11, 0.02], rot: [0, 0, -Math.PI * 0.5] }
          ),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.016, 1), {
            pos: [0.132, -0.11, 0.02],
            scale: [0.6, 1, 1]
          }),
          materialIndex: 6
        }
      ];
    }

    case "arcBuckler": {
      // VOLT: Fluted Tempest Arc-Buckler with glowing electric-cyan conduit ring & storm-spike boss
      const bucklerDish = transformMesh(
        latheMesh(
          [
            [0, 0],
            [0.205, 0],
            [0.212, 0.018],
            [0.145, 0.036],
            [0.065, 0.056],
            [0, 0.095]
          ],
          20
        ),
        { pos: [0.064, -0.14, 0.02], rot: [0, 0, -Math.PI * 0.5] }
      );
      const cyanRing = transformMesh(
        latheMesh(
          [
            [0.135, 0.032],
            [0.165, 0.028],
            [0.165, 0.042],
            [0.135, 0.046]
          ],
          20
        ),
        { pos: [0.064, -0.14, 0.02], rot: [0, 0, -Math.PI * 0.5] }
      );
      const rimBand = transformMesh(
        latheMesh(
          [
            [0.19, -0.004],
            [0.22, 0],
            [0.22, 0.024],
            [0.19, 0.028]
          ],
          20
        ),
        { pos: [0.064, -0.14, 0.02], rot: [0, 0, -Math.PI * 0.5] }
      );
      return [
        { mesh: bucklerDish, materialIndex: 0 },
        { mesh: rimBand, materialIndex: 1 },
        { mesh: cyanRing, materialIndex: 6 }
      ];
    }

    case "towerScutum": {
      // BOULDER: Towering curved iron-and-bronze Colossus Scutum Shield with heraldic blazon, riveted rim & boss!
      const scutumShell = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.42, rx: 0.115, rz: 0.165, arcHalfAngle: 0.85, centerAngle: outAngle, keel: 0.022 },
            { y: -0.26, rx: 0.128, rz: 0.245, arcHalfAngle: 1.05, centerAngle: outAngle, keel: 0.028, fluteCount: 3, fluteAmp: 0.006 },
            { y: 0.04, rx: 0.132, rz: 0.255, arcHalfAngle: 1.08, centerAngle: outAngle, keel: 0.03, fluteCount: 3, fluteAmp: 0.006 },
            { y: 0.32, rx: 0.124, rz: 0.235, arcHalfAngle: 1.02, centerAngle: outAngle, keel: 0.024 }
          ],
          0.016,
          11,
          1
        ),
        { pos: [0.015, -0.04, 0.03] }
      );
      const heraldicPanel = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.3, rx: 0.126, rz: 0.16, arcHalfAngle: 0.82, centerAngle: outAngle, keel: 0.026 },
            { y: 0.22, rx: 0.128, rz: 0.175, arcHalfAngle: 0.85, centerAngle: outAngle, keel: 0.026 }
          ],
          0.008,
          9,
          1
        ),
        { pos: [0.026, -0.04, 0.03] }
      );
      return [
        { mesh: scutumShell, materialIndex: 0 },
        { mesh: heraldicPanel, materialIndex: 3 },
        // Vertical & horizontal bronze shield cross-bars + central umbo boss
        {
          mesh: transformMesh(bevelBoxMesh(0.022, 0.68, 0.048, 0.006), { pos: [0.162, -0.05, 0.03] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.022, 0.052, 0.38, 0.006), { pos: [0.156, -0.02, 0.03] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(
            latheMesh([[0, 0], [0.082, 0], [0.072, 0.026], [0.032, 0.052], [0, 0.068]], 16),
            { pos: [0.162, -0.02, 0.03], rot: [0, 0, -Math.PI * 0.5] }
          ),
          materialIndex: 1
        }
      ];
    }

    case "paladinKite": {
      // SERAPH: Graceful curved teardrop Paladin Kite Shield with gilded border, velvet field & solar cross relief!
      const kiteOuter = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.38, rx: 0.088, rz: 0.052, arcHalfAngle: 0.65, centerAngle: outAngle, keel: 0.018 },
            { y: -0.18, rx: 0.112, rz: 0.158, arcHalfAngle: 0.92, centerAngle: outAngle, keel: 0.024 },
            { y: 0.06, rx: 0.118, rz: 0.208, arcHalfAngle: 0.98, centerAngle: outAngle, keel: 0.026 },
            { y: 0.24, rx: 0.112, rz: 0.188, arcHalfAngle: 0.94, centerAngle: outAngle, keel: 0.022 }
          ],
          0.014,
          11,
          1
        ),
        { pos: [0.018, -0.06, 0.02] }
      );
      const kiteField = transformMesh(
        sculptCurvedShell(
          [
            { y: -0.28, rx: 0.104, rz: 0.075, arcHalfAngle: 0.68, centerAngle: outAngle, keel: 0.022 },
            { y: 0.04, rx: 0.116, rz: 0.155, arcHalfAngle: 0.82, centerAngle: outAngle, keel: 0.026 },
            { y: 0.18, rx: 0.112, rz: 0.145, arcHalfAngle: 0.8, centerAngle: outAngle, keel: 0.022 }
          ],
          0.007,
          9,
          1
        ),
        { pos: [0.028, -0.06, 0.02] }
      );
      return [
        { mesh: kiteOuter, materialIndex: 1 },
        { mesh: kiteField, materialIndex: 3 },
        // Gilded solar cross + celestial gem boss
        {
          mesh: transformMesh(bevelBoxMesh(0.018, 0.46, 0.034, 0.005), { pos: [0.152, -0.06, 0.02] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.018, 0.036, 0.26, 0.005), { pos: [0.15, 0.02, 0.02] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.024, 1), {
            pos: [0.164, 0.02, 0.02],
            scale: [0.65, 1.15, 1.15]
          }),
          materialIndex: 6
        }
      ];
    }

    case "offhandHexBlade": {
      // JINX: Offhand Crescent Parry-Rondel + Reverse-Grip Curved Twin Hex-Dagger!
      const offhandSpine = catmullRomSpline3(
        [
          [0.015, -0.26, -0.02],
          [0.018, -0.275, -0.24],
          [0.024, -0.225, -0.48],
          [0.028, -0.155, -0.66]
        ],
        5
      ).map((p, i, arr) => [p[0], p[1], p[2], 0.028 * (1 - (i / (arr.length - 1)) * 0.88)] as V4);

      const rondelDish = transformMesh(
        latheMesh([[0, 0], [0.125, 0], [0.13, 0.014], [0.065, 0.03], [0, 0.052]], 16),
        { pos: [0.062, -0.16, 0.02], rot: [0, 0, -Math.PI * 0.5] }
      );
      return [
        { mesh: rondelDish, materialIndex: 7 },
        {
          mesh: tubeSweepMesh([[0.012, -0.26, 0.11, 0.015], [0.015, -0.26, -0.03, 0.017]], 8, true),
          materialIndex: 5
        },
        {
          mesh: transformMesh(bevelBoxMesh(0.026, 0.11, 0.026, 0.006), { pos: [0.015, -0.26, -0.025] }),
          materialIndex: 1
        },
        { mesh: sculptDiamondBladeMesh(offhandSpine, 0.24, "y"), materialIndex: 4 },
        {
          mesh: transformMesh(icosphereSmoothMesh(0.018, 1), {
            pos: [0.114, -0.16, 0.02],
            scale: [0.6, 1.1, 1.1]
          }),
          materialIndex: 6
        }
      ];
    }

    case "royalHeater": {
      // SOVEREIGN: Ornate High-King Royal Heater Shield with gilded border, crimson/obsidian field & crown boss!
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
            latheMesh([[0, 0], [0.062, 0], [0.056, 0.022], [0.024, 0.044], [0, 0.056]], 14),
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

  // Anatomical quadriceps & hamstring thigh (`sculptAnatomicalLimbMesh` extending cleanly up into hip socket -> ZERO hip spheres!)
  const thighAnatomy = sculptAnatomicalLimbMesh(
    [
      { pos: [0, 0.052, 0], rx: 0.072 * ls, rz: 0.076 * ls },
      { pos: [sideSign * 0.004, -0.045, 0.005], rx: 0.088 * ls, rz: 0.094 * ls, zOffset: 0.005 },
      { pos: [sideSign * 0.004, -0.155, 0.008], rx: 0.086 * ls, rz: 0.092 * ls, zOffset: 0.009 },
      { pos: [sideSign * 0.002, -0.285, 0.004], rx: 0.072 * ls, rz: 0.076 * ls, zOffset: 0.004 },
      { pos: [0, -0.4, 0], rx: 0.06 * ls, rz: 0.064 * ls }
    ],
    { ringPoints: 16, muscleBiasZ: 0.014, peakT: 0.38 }
  );

  // Sculpted fluted `cuisse` thigh-armor plate (`sculptCurvedShell`) with rolled top turn-edge & median keel
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

  // Gilded median cuisse keel + rolled top-lip trim + two buckled leather thigh straps
  const cuisseKeel = tubeSweepMesh(
    [
      [Math.sin(frontOutAngle) * 0.088 * ls, -0.35, Math.cos(frontOutAngle) * 0.098 * ls + 0.006, 0.009],
      [Math.sin(frontOutAngle) * 0.108 * ls, -0.2, Math.cos(frontOutAngle) * 0.122 * ls + 0.01, 0.011],
      [Math.sin(frontOutAngle) * 0.108 * ls, -0.06, Math.cos(frontOutAngle) * 0.12 * ls + 0.008, 0.009]
    ],
    6,
    true
  );

  return [
    { mesh: thighAnatomy, materialIndex: fighterId === "jinx" ? 5 : 2 },
    { mesh: cuissePlate, materialIndex: 0 },
    { mesh: cuisseKeel, materialIndex: 1 },
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
    {
      mesh: latheMesh(
        [
          [0.068 * ls, -0.315],
          [0.082 * ls, -0.312],
          [0.082 * ls, -0.292],
          [0.068 * ls, -0.288]
        ],
        16
      ),
      materialIndex: 5
    },
    { mesh: forgedRivetMesh([sideSign * 0.088 * ls, -0.085, 0.048 * ls], 0.008), materialIndex: 1 },
    { mesh: forgedRivetMesh([sideSign * 0.076 * ls, -0.325, 0.042 * ls], 0.008), materialIndex: 1 }
  ];
}

function buildGreaveSlots(sideSign: 1 | -1, b: ArchetypeBuild): MultiMatSlot[] {
  const ls = b.limbScale;

  // Pointed diamond-ridge `poleyn` knee-guard (`sculptCurvedShell`) + upper/lower articulation lames + swept lateral fan wing (ZERO knee spheres!)
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
  const poleynLowerLame = sculptCurvedShell(
    [
      { y: -0.105, rx: 0.068 * ls, rz: 0.076 * ls, zBias: 0.006, arcHalfAngle: 1.28, keel: 0.018 },
      { y: -0.058, rx: 0.072 * ls, rz: 0.082 * ls, zBias: 0.008, arcHalfAngle: 1.32, keel: 0.02 }
    ],
    0.008,
    9,
    1
  );
  const poleynWing: V2[] = [
    [0, -0.065],
    [0.068, -0.02],
    [0.085, 0.042],
    [0.044, 0.085],
    [-0.028, 0.05]
  ];

  // Anatomically tapered calf & shin (`sculptAnatomicalLimbMesh` — high gastrocnemius calf swell tapering cleanly to ankle)
  const calfCore = sculptAnatomicalLimbMesh(
    [
      { pos: [0, 0.018, 0], rx: 0.058 * ls, rz: 0.062 * ls },
      { pos: [sideSign * 0.003, -0.105, -0.008], rx: 0.068 * ls, rz: 0.076 * ls, zOffset: -0.01 },
      { pos: [sideSign * 0.002, -0.235, -0.002], rx: 0.054 * ls, rz: 0.058 * ls, zOffset: -0.004 },
      { pos: [0, -0.385, 0.004], rx: 0.044 * ls, rz: 0.048 * ls }
    ],
    { ringPoints: 16, muscleBiasZ: -0.015, peakT: 0.34 }
  );

  // Sculpted anterior & lateral `schynbald` shin greave plate + sharp gilded tibial keel
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
  const tibialKeel = tubeSweepMesh(
    [
      [0, -0.388, 0.072 * ls, 0.0085],
      [0, -0.22, 0.084 * ls, 0.0105],
      [0, -0.095, 0.092 * ls, 0.011],
      [0, 0.002, 0.132 * ls, 0.012],
      [0, 0.062, 0.096 * ls, 0.009]
    ],
    7,
    true
  );

  return [
    { mesh: calfCore, materialIndex: 2 },
    { mesh: poleynCop, materialIndex: 1 },
    { mesh: poleynLowerLame, materialIndex: 0 },
    {
      mesh: transformMesh(extrudePolygonMesh(poleynWing, 0.014, 0.004, false), {
        pos: [sideSign * 0.072 * ls, 0.004, -0.004],
        rot: [0, Math.PI * 0.5 - sideSign * 0.2, 0]
      }),
      materialIndex: 1
    },
    { mesh: schynbaldPlate, materialIndex: 0 },
    { mesh: tibialKeel, materialIndex: 1 },
    // Buckled leather calf straps securing greave around gastrocnemius
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
    },
    {
      mesh: latheMesh(
        [
          [0.048 * ls, -0.345],
          [0.058 * ls, -0.342],
          [0.058 * ls, -0.324],
          [0.048 * ls, -0.32]
        ],
        16
      ),
      materialIndex: 5
    }
  ];
}

function buildSabatonSlots(b: ArchetypeBuild): MultiMatSlot[] {
  const ls = b.limbScale;
  // Kinematic chain rest height at ankle origin = 0.94 - 0.04 - 0.41 - 0.41 = +0.080 m.
  // Forged sole box (height 0.020 m centered at y = -0.070 m) places bottom face at exact y = -0.080 m -> world minY = 0.000 m!
  const forgedSole = transformMesh(bevelBoxMesh(0.106 * ls, 0.02, 0.252, 0.005), {
    pos: [0, -0.07, 0.048]
  });

  // Heel counter cup + spur boss
  const heelCounter = sculptCurvedShell(
    [
      { y: -0.062, rx: 0.054 * ls, rz: 0.068, zBias: -0.012, arcHalfAngle: 1.52, centerAngle: Math.PI, keel: 0.008 },
      { y: -0.004, rx: 0.048 * ls, rz: 0.06, zBias: -0.008, arcHalfAngle: 1.44, centerAngle: Math.PI, keel: 0.006 }
    ],
    0.008,
    9,
    1
  );

  // 4 overlapping articulated Gothic `sabaton` instep lames + pointed `solleret` toe cap (all strictly >= -0.068 m so minY = -0.080 m is preserved!)
  const slots: MultiMatSlot[] = [
    { mesh: forgedSole, materialIndex: 5 },
    { mesh: heelCounter, materialIndex: 0 }
  ];

  for (const [yBot, yTop, rx, rz, zBias] of [
    [-0.028, 0.008, 0.052 * ls, 0.068, 0.012],
    [-0.044, -0.012, 0.054 * ls, 0.076, 0.048],
    [-0.056, -0.026, 0.052 * ls, 0.078, 0.086],
    [-0.064, -0.038, 0.046 * ls, 0.082, 0.124]
  ] as const) {
    slots.push({
      mesh: sculptCurvedShell(
        [
          { y: yBot, rx, rz, zBias, arcHalfAngle: 1.54, keel: 0.014 },
          { y: yTop, rx: rx * 0.94, rz: rz * 0.92, zBias: zBias - 0.008, arcHalfAngle: 1.48, keel: 0.012 }
        ],
        0.007,
        9,
        1
      ),
      materialIndex: 0
    });
  }

  // Gilded median dorsal sabaton spine & spur strap
  slots.push(
    {
      mesh: tubeSweepMesh(
        [
          [0, 0.004, 0.068, 0.0075],
          [0, -0.026, 0.122, 0.008],
          [0, -0.052, 0.194, 0.007]
        ],
        6,
        true
      ),
      materialIndex: 1
    },
    {
      mesh: transformMesh(bevelBoxMesh(0.108 * ls, 0.014, 0.024, 0.004), { pos: [0, -0.036, -0.042] }),
      materialIndex: 1
    }
  );

  return slots;
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
          : s.materialIndex === 3
            ? finishArmorMesh(s.mesh, 0.3, 0.09)
            : finishArmorMesh(s.mesh, 0.26, 0.08)
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

/**
 * Build a sculpted, multi-material, anatomically articulated SoulCalibur / For-Honor-grade
 * Armored Gladiator / Knight rig across all 6 Iron Crown roster archetypes.
 * Grounded cleanly at `y = 0` (`sabaton` soles rest flush on the arena deck) and hierarchically
 * rigged so `poseArticulatedGladiatorRig` drives all combat states with stateless `"ZYX"` Eulers.
 */
export function buildArticulatedGladiatorRig(opts: GladiatorRigOptions) {
  const b = ARCHETYPE_BUILDS[opts.fighterId];
  const mats = buildGladiatorMaterials(opts);
  const id = (suffix: GladiatorJointSuffix) => `${opts.nodeId}-${suffix}`;
  const rt = (suffix: GladiatorJointSuffix) => game.runtimeNode(id(suffix));
  const geoKey = (part: string) => `ic-gladiator-v2:${opts.fighterId}:${part}`;

  const weaponPart = group(id("weapon"), [
    partNode(geoKey("weapon"), `${id("weapon")}-mesh`, () => buildWeaponSlots(b.weaponStyle), mats, true)
  ])
    .position(0, -0.26, 0.02)
    .runtime(rt("weapon"));

  const shieldPart = group(id("shield"), [
    partNode(geoKey("shield"), `${id("shield")}-mesh`, () => buildShieldSlots(b.shieldStyle), mats, false)
  ])
    .position(0, 0, 0)
    .runtime(rt("shield"));

  const elbowR = group(id("elbow-r"), [
    partNode(geoKey("elbow-r"), `${id("elbow-r")}-mesh`, () => buildForearmGauntletSlots(-1, b), mats, false),
    weaponPart
  ])
    .position(0, -0.27, 0)
    .runtime(rt("elbow-r"));

  const shoulderR = group(id("shoulder-r"), [
    partNode(
      geoKey("shoulder-r"),
      `${id("shoulder-r")}-mesh`,
      () => buildUpperArmSlots(opts.fighterId, -1, b),
      mats,
      true
    ),
    elbowR
  ])
    .position(-(b.chestWidth + 0.045), 0.36, 0)
    .runtime(rt("shoulder-r"));

  const elbowL = group(id("elbow-l"), [
    partNode(geoKey("elbow-l"), `${id("elbow-l")}-mesh`, () => buildForearmGauntletSlots(1, b), mats, false),
    shieldPart
  ])
    .position(0, -0.27, 0)
    .runtime(rt("elbow-l"));

  const shoulderL = group(id("shoulder-l"), [
    partNode(
      geoKey("shoulder-l"),
      `${id("shoulder-l")}-mesh`,
      () => buildUpperArmSlots(opts.fighterId, 1, b),
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
      () => buildVisoredHelmSlots(opts.fighterId, b, opts.side),
      mats,
      true
    )
  ])
    .position(0, 0.46, 0)
    .runtime(rt("head"));

  const torso = group(id("torso"), [
    partNode(geoKey("torso"), `${id("torso")}-mesh`, () => buildTorsoSlots(opts.fighterId, b), mats, true),
    head,
    shoulderL,
    shoulderR
  ])
    .position(0, 0.08, 0)
    .runtime(rt("torso"));

  const ankleL = group(id("ankle-l"), [
    partNode(geoKey("ankle"), `${id("ankle-l")}-mesh`, () => buildSabatonSlots(b), mats, false)
  ])
    .position(0, -0.41, 0)
    .runtime(rt("ankle-l"));

  const kneeL = group(id("knee-l"), [
    partNode(geoKey("knee-l"), `${id("knee-l")}-mesh`, () => buildGreaveSlots(1, b), mats, false),
    ankleL
  ])
    .position(0, -0.41, 0)
    .runtime(rt("knee-l"));

  const hipL = group(id("hip-l"), [
    partNode(
      geoKey("hip-l"),
      `${id("hip-l")}-mesh`,
      () => buildThighCuisseSlots(opts.fighterId, 1, b),
      mats,
      true
    ),
    kneeL
  ])
    .position(0.125, -0.04, 0)
    .runtime(rt("hip-l"));

  const ankleR = group(id("ankle-r"), [
    partNode(geoKey("ankle"), `${id("ankle-r")}-mesh`, () => buildSabatonSlots(b), mats, false)
  ])
    .position(0, -0.41, 0)
    .runtime(rt("ankle-r"));

  const kneeR = group(id("knee-r"), [
    partNode(geoKey("knee-r"), `${id("knee-r")}-mesh`, () => buildGreaveSlots(-1, b), mats, false),
    ankleR
  ])
    .position(0, -0.41, 0)
    .runtime(rt("knee-r"));

  const hipR = group(id("hip-r"), [
    partNode(
      geoKey("hip-r"),
      `${id("hip-r")}-mesh`,
      () => buildThighCuisseSlots(opts.fighterId, -1, b),
      mats,
      true
    ),
    kneeR
  ])
    .position(-0.125, -0.04, 0)
    .runtime(rt("hip-r"));

  const hips = group(id("hips"), [
    partNode(geoKey("hips"), `${id("hips")}-mesh`, () => buildPelvisSlots(opts.fighterId, b), mats, true),
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
        tags: opts.runtimeTags ?? ["fighter", opts.fighterId, "procedural-gladiator"]
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
