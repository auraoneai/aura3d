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
  bevelBoxMesh,
  bezierCurve2,
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
  castShadow = true
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

/** Reusable forged tripod cauldron brazier (`latheMesh` bowl + `tubeSweepMesh` legs + `icosphereFacetMesh` coals). */
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
  const plinth = latheMesh([[0, 0], [0.38 * s, 0], [0.34 * s, 0.12 * s], [0.22 * s, 0.22 * s], [0, 0.22 * s]], 14);
  slots.push({ mesh: plinth, materialIndex: 0 });

  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const legSpine: V4[] = [
      [ca * 0.3 * s, 0.16 * s, sa * 0.3 * s, 0.048 * s],
      [ca * 0.17 * s, 0.72 * s, sa * 0.17 * s, 0.04 * s],
      [ca * 0.27 * s, 1.32 * s, sa * 0.27 * s, 0.044 * s]
    ];
    slots.push({ mesh: tubeSweepMesh(legSpine, 7, true), materialIndex: 0 });
  }

  const bowl = latheMesh(
    [
      [0, 1.18 * s],
      [0.16 * s, 1.2 * s],
      [0.38 * s, 1.36 * s],
      [0.44 * s, 1.56 * s],
      [0.39 * s, 1.62 * s],
      [0.33 * s, 1.48 * s],
      [0, 1.44 * s]
    ],
    18
  );
  slots.push({ mesh: bowl, materialIndex: 1 });
  slots.push({
    mesh: transformMesh(icosphereFacetMesh(0.27 * s, 1, 0.22, 19), { pos: [0, 1.56 * s, 0], scale: [1.1, 0.62, 1.1] }),
    materialIndex: 2
  });

  return mountMultiMat(
    name,
    slots,
    [metalMat, IC_MATERIALS.gildedCrownGold, practicalGlow(`${name}-embers`, emberColor, emberIntensity)],
    pos,
    rotY
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
}

export function crowdBodySpec(): AuraCustomGeometrySpec {
  return mergeRawMeshes([
    loftSectionsMesh(
      [
        [[-0.48, -0.5, 0.36], [0.48, -0.5, 0.36], [0.48, -0.5, -0.36], [-0.48, -0.5, -0.36]],
        [[-0.52, 0.15, 0.4], [0.52, 0.15, 0.4], [0.46, 0.15, -0.38], [-0.46, 0.15, -0.38]],
        [[-0.32, 0.5, 0.26], [0.32, 0.5, 0.26], [0.28, 0.5, -0.26], [-0.28, 0.5, -0.26]]
      ],
      true,
      true
    )
  ]);
}

export function crowdHeadSpec(): AuraCustomGeometrySpec {
  return mergeRawMeshes([
    latheMesh([[0, -0.5], [0.34, -0.44], [0.48, -0.08], [0.44, 0.28], [0.22, 0.48], [0, 0.5]], 10)
  ]);
}

export function concertTrussSpec(span: V3, bays: number, chordRadius = 0.024): AuraCustomGeometrySpec {
  return mergeRawMeshes([latticeTrussMesh({ span, bays, chordRadius })]);
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
  return mergeRawMeshes([
    transformMesh(bevelBoxMesh(1, 0.72, 1, 0.03), { pos: [0, -0.14, 0] }),
    transformMesh(bevelBoxMesh(0.74, 0.28, 0.74, 0.025), { pos: [0, 0.36, 0] })
  ]);
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
  return mergeRawMeshes([
    bevelBoxMesh(1, 0.88, 1, 0.04),
    transformMesh(bevelBoxMesh(1.22, 0.12, 1.14, 0.02), { pos: [0, 0.44, 0] })
  ]);
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
  return mergeRawMeshes([stratifiedCliffMesh({ radiusX: 0.5, radiusZ: 0.5, height: 1, terraces: 5, seed: 83 })]);
}

export function alpineRidgeSpec(seed = 97): AuraCustomGeometrySpec {
  return mergeRawMeshes([stratifiedCliffMesh({ radiusX: 0.5, radiusZ: 0.5, height: 1, terraces: 6, seed })]);
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
  readonly helmStyle: "kabuto" | "vanguard" | "colossus" | "sallet" | "horned" | "crown";
  readonly weaponStyle: "katana" | "cestusBlade" | "warhammer" | "halberd" | "saber" | "greatsword";
  readonly shieldStyle: "heater" | "buckler" | "scutum" | "rondel";
  readonly trimHex: string;
}

const ARCHETYPE_BUILDS: Readonly<Record<GladiatorArchetypeId, ArchetypeBuild>> = {
  kenji: {
    chestWidth: 0.205,
    chestDepth: 0.145,
    waistWidth: 0.148,
    pauldronScale: 1.02,
    helmStyle: "kabuto",
    weaponStyle: "katana",
    shieldStyle: "heater",
    trimHex: "#d8a848"
  },
  volt: {
    chestWidth: 0.19,
    chestDepth: 0.138,
    waistWidth: 0.138,
    pauldronScale: 0.96,
    helmStyle: "vanguard",
    weaponStyle: "cestusBlade",
    shieldStyle: "buckler",
    trimHex: "#ff9b42"
  },
  boulder: {
    chestWidth: 0.255,
    chestDepth: 0.182,
    waistWidth: 0.188,
    pauldronScale: 1.26,
    helmStyle: "colossus",
    weaponStyle: "warhammer",
    shieldStyle: "scutum",
    trimHex: "#c68b46"
  },
  seraph: {
    chestWidth: 0.194,
    chestDepth: 0.136,
    waistWidth: 0.136,
    pauldronScale: 0.98,
    helmStyle: "sallet",
    weaponStyle: "halberd",
    shieldStyle: "rondel",
    trimHex: "#dce8f2"
  },
  jinx: {
    chestWidth: 0.184,
    chestDepth: 0.132,
    waistWidth: 0.132,
    pauldronScale: 0.94,
    helmStyle: "horned",
    weaponStyle: "saber",
    shieldStyle: "buckler",
    trimHex: "#c998ff"
  },
  sovereign: {
    chestWidth: 0.228,
    chestDepth: 0.162,
    waistWidth: 0.162,
    pauldronScale: 1.18,
    helmStyle: "crown",
    weaponStyle: "greatsword",
    shieldStyle: "heater",
    trimHex: "#e5b244"
  }
};

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

function buildGladiatorMaterials(opts: GladiatorRigOptions): readonly AuraMaterialSpec[] {
  const rimSpec = opts.surfaceExtras !== false
    ? { rim: { color: opts.accentEmissive, power: 2.6, intensity: 0.62 } }
    : {};
  // Distinct P1 vs P2 heraldry: Royal Azure & Gold for Player 1, Imperial Crimson & Ember for Player 2
  const heraldicHex = opts.side === "p1" ? "#1e5bd8" : "#b81d2a";
  const heraldicSheen = opts.side === "p1" ? "#6eb2ff" : "#ff7a6b";

  // 0: Primary sculpted armor plate (`carPaint` / `lacquer` / `brushedMetal`)
  const plateMat = opts.lacquer
    ? material.lacquer({
        name: `${opts.nodeId}-plate-lacquer`,
        color: opts.primaryColor,
        roughness: Math.min(0.32, opts.roughness),
        clearcoat: 0.62,
        clearcoatRoughness: 0.18,
        ...rimSpec
      } as any)
    : opts.metallic >= 0.35
      ? material.brushedMetal({
          name: `${opts.nodeId}-plate-forged`,
          color: opts.primaryColor,
          roughness: Math.max(0.22, Math.min(0.38, opts.roughness)),
          anisotropy: 0.32,
          ...rimSpec
        } as any)
      : material.clearcoatPaint({
          name: `${opts.nodeId}-plate-enamel`,
          color: opts.primaryColor,
          roughness: Math.max(0.26, Math.min(0.46, opts.roughness)),
          clearcoat: 0.38,
          clearcoatRoughness: 0.22,
          ...rimSpec
        } as any);

  // 1: Gilded / sterling heraldic filigree & edge trim (`studioMetal`)
  const build = ARCHETYPE_BUILDS[opts.fighterId];
  const trimMat = material.studioMetal({
    name: `${opts.nodeId}-heraldic-trim`,
    color: opts.side === "p1" ? build.trimHex : "#e09b3d",
    roughness: 0.24
  });

  // 2: Articulated dark chainmaille & undersuit joints (`brushedMetal`)
  const mailleMat = material.brushedMetal({
    name: `${opts.nodeId}-maille-joint`,
    color: "#1a1922",
    roughness: 0.44,
    anisotropy: 0.24
  });

  // 3: Heraldic P1/P2 tabard, crest plume & sash (`fabric` velvet sheen)
  const heraldryMat = material.fabric({
    name: `${opts.nodeId}-heraldic-cloth`,
    color: heraldicHex,
    roughness: 0.78,
    sheen: 0.55,
    sheenColor: heraldicSheen,
    sheenRoughness: 0.68
  });

  // 4: Honed Damascus / high-carbon weapon steel (`studioMetal`)
  const bladeMat = material.studioMetal({
    name: `${opts.nodeId}-weapon-steel`,
    color: "#dde6f2",
    roughness: 0.16
  });

  // 5: Grip leather & oiled ash shaft (`pbr`)
  const leatherMat = material.pbr({
    name: `${opts.nodeId}-grip-leather`,
    color: "#362115",
    roughness: 0.72,
    metallic: 0.04
  });

  // 6: Visor eye-slit & crest gem practical accent (`pbr` practical <= 0.8)
  const visorGlowMat = material.pbr({
    name: `${opts.nodeId}-visor-glow`,
    color: opts.accentEmissive,
    emissive: opts.accentEmissive,
    emissiveIntensity: 0.74,
    roughness: 0.24,
    metallic: 0.15,
    practical: true
  });

  return [plateMat, trimMat, mailleMat, heraldryMat, bladeMat, leatherMat, visorGlowMat];
}

function buildPelvisSlots(b: ArchetypeBuild): MultiMatSlot[] {
  const w = b.waistWidth;
  const pelvisCore = loftSectionsMesh(
    [
      makeOctRing(-0.08, w * 0.92, 0.115),
      makeOctRing(0.0, w * 1.04, 0.128),
      makeOctRing(0.085, w * 0.98, 0.122)
    ],
    true
  );
  const beltRing = latheMesh(
    [[w * 0.96, 0.03], [w * 1.09, 0.035], [w * 1.09, 0.075], [w * 0.96, 0.08]],
    16
  );
  // Front & rear heraldic tabard aprons + side articulated tasset plates
  const tabardFront: V2[] = [[-0.078, 0.04], [0.078, 0.04], [0.094, -0.24], [0, -0.31], [-0.094, -0.24]];
  const tabardBack: V2[] = [[-0.082, 0.04], [0.082, 0.04], [0.102, -0.27], [0, -0.33], [-0.102, -0.27]];
  const tassetProfile: V2[] = [[-0.068, 0.02], [0.068, 0.02], [0.082, -0.17], [0, -0.21], [-0.082, -0.17]];

  return [
    { mesh: pelvisCore, materialIndex: 2 },
    { mesh: beltRing, materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.075, 0.062, 0.032, 0.008), { pos: [0, 0.055, 0.132] }), materialIndex: 1 },
    { mesh: transformMesh(extrudePolygonMesh(tabardFront, 0.018, 0.004, true), { pos: [0, 0, 0.126], rot: [-0.08, 0, 0] }), materialIndex: 3 },
    { mesh: transformMesh(extrudePolygonMesh(tabardBack, 0.018, 0.004, true), { pos: [0, 0, -0.124], rot: [0.08, 0, 0] }), materialIndex: 3 },
    { mesh: transformMesh(extrudePolygonMesh(tassetProfile, 0.022, 0.005, true), { pos: [w * 0.96, 0.01, 0.02], rot: [0, Math.PI * 0.5, 0.22] }), materialIndex: 0 },
    { mesh: transformMesh(extrudePolygonMesh(tassetProfile, 0.022, 0.005, true), { pos: [-w * 0.96, 0.01, 0.02], rot: [0, Math.PI * 0.5, -0.22] }), materialIndex: 0 }
  ];
}

function buildTorsoSlots(b: ArchetypeBuild): MultiMatSlot[] {
  const cw = b.chestWidth;
  const cd = b.chestDepth;
  const ww = b.waistWidth;
  // Sculpted V-taper peascod cuirass from waist y=0 to gorget y=0.44
  const cuirass = loftSectionsMesh(
    [
      makeOctRing(0.0, ww * 0.96, cd * 0.82),
      makeOctRing(0.13, cw * 0.88, cd * 0.92, 0.006),
      makeOctRing(0.27, cw * 1.04, cd * 1.06, 0.016),
      makeOctRing(0.38, cw * 0.96, cd * 0.94, 0.008),
      makeOctRing(0.44, cw * 0.56, cd * 0.62, 0.0)
    ],
    true
  );
  const gorget = latheMesh(
    [[0, 0.41], [cw * 0.62, 0.41], [cw * 0.54, 0.465], [cw * 0.42, 0.49], [0, 0.49]],
    16
  );
  // Central sternum crest & P1/P2 diagonal heraldic baldric sash + chest badge
  const crestShield: V2[] = [[0, 0.34], [0.058, 0.31], [0.046, 0.21], [0, 0.17], [-0.046, 0.21], [-0.058, 0.31]];
  const slots: MultiMatSlot[] = [
    { mesh: cuirass, materialIndex: 0 },
    { mesh: gorget, materialIndex: 1 },
    { mesh: tubeSweepMesh([[0, 0.05, cd * 0.86, 0.016], [0, 0.27, cd * 1.1, 0.022], [0, 0.41, cd * 0.88, 0.015]], 6, true), materialIndex: 1 },
    { mesh: transformMesh(extrudePolygonMesh(crestShield, 0.022, 0.005, true), { pos: [0, 0, cd * 1.06] }), materialIndex: 3 },
    { mesh: tubeSweepMesh([[-cw * 0.82, 0.39, cd * 0.55, 0.024], [0, 0.23, cd * 1.08, 0.026], [ww * 0.85, 0.04, cd * 0.62, 0.022]], 7, true), materialIndex: 3 }
  ];
  if (b.helmStyle === "crown") {
    // Sovereign royal velvet cape draped cleanly behind backplate
    const capeRing: V2[] = [[-cw * 0.88, 0.39], [cw * 0.88, 0.39], [cw * 1.12, -0.44], [0, -0.54], [-cw * 1.12, -0.44]];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(capeRing, 0.02, 0.005, true), { pos: [0, 0, -cd * 0.96], rot: [0.12, 0, 0] }),
      materialIndex: 3
    });
  }
  return slots;
}

function buildVisoredHelmSlots(b: ArchetypeBuild, side: "p1" | "cpu"): MultiMatSlot[] {
  // Sculpted armored neck + close-helm skull + pointed bellows visor (origin = neck pivot)
  const skull = latheMesh(
    [
      [0, 0.0], [0.068, 0.0], [0.064, 0.045], [0.098, 0.085],
      [0.114, 0.155], [0.108, 0.225], [0.072, 0.272], [0, 0.286]
    ],
    16
  );
  const visorSections: V3[][] = [
    [[-0.088, 0.075, 0.03], [0, 0.068, 0.132], [0.088, 0.075, 0.03], [0, 0.065, -0.02]],
    [[-0.094, 0.138, 0.04], [0, 0.138, 0.158], [0.094, 0.138, 0.04], [0, 0.135, -0.02]],
    [[-0.086, 0.192, 0.03], [0, 0.195, 0.126], [0.086, 0.192, 0.03], [0, 0.192, -0.02]]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh([[0, -0.02], [0.072, -0.02], [0.066, 0.05], [0, 0.05]], 12), materialIndex: 2 },
    { mesh: skull, materialIndex: 0 },
    { mesh: loftSectionsMesh(visorSections, true), materialIndex: 0 },
    // Glowing recessed ocular visor slit + gilded brow band
    { mesh: transformMesh(bevelBoxMesh(0.135, 0.018, 0.035, 0.004), { pos: [0, 0.164, 0.132] }), materialIndex: 6 },
    { mesh: tubeSweepMesh([[-0.095, 0.185, 0.045, 0.01], [0, 0.192, 0.138, 0.012], [0.095, 0.185, 0.045, 0.01]], 6, true), materialIndex: 1 }
  ];

  // Distinct P1 (tall swept challenger plume) vs P2 (twin-tailed champion crest) + archetype helm ornament
  const plumePts = side === "p1"
    ? catmullRomSpline3([[0, 0.27, 0.03], [0, 0.36, -0.04], [0, 0.33, -0.17], [0, 0.22, -0.25]], 4)
    : catmullRomSpline3([[0, 0.27, 0.05], [0, 0.38, 0.0], [0, 0.35, -0.15], [0, 0.25, -0.23]], 4);
  slots.push({
    mesh: tubeSweepMesh(plumePts.map((p, i) => [p[0], p[1], p[2], 0.032 - i * 0.0018] as V4), 7, true),
    materialIndex: 3
  });

  switch (b.helmStyle) {
    case "kabuto": {
      // Sweeping shikoro neck-guard + twin gilded kuwagata crescent horns
      const shikoro = latheMesh([[0.102, 0.05], [0.145, 0.03], [0.132, 0.11], [0.098, 0.13]], 14);
      slots.push({ mesh: shikoro, materialIndex: 0 });
      for (const sx of [-1, 1] as const) {
        const horn = catmullRomSpline3([[sx * 0.02, 0.2, 0.115], [sx * 0.095, 0.27, 0.12], [sx * 0.145, 0.36, 0.09]], 4)
          .map((p, i, arr) => [p[0], p[1], p[2], 0.018 * (1 - (i / arr.length) * 0.72)] as V4);
        slots.push({ mesh: tubeSweepMesh(horn, 6, true), materialIndex: 1 });
      }
      break;
    }
    case "vanguard": {
      const fin: V2[] = [[0.06, 0.22], [0.12, 0.29], [-0.14, 0.33], [-0.18, 0.21]];
      slots.push({ mesh: transformMesh(extrudePolygonMesh(fin, 0.024, 0.005, true), { rot: [0, Math.PI * 0.5, 0] }), materialIndex: 1 });
      break;
    }
    case "colossus": {
      // Transverse centurion/murmillo bronze & horsehair crest
      const crest: V2[] = [[-0.16, 0.24], [0.16, 0.24], [0.19, 0.37], [0, 0.41], [-0.19, 0.37]];
      slots.push({ mesh: transformMesh(extrudePolygonMesh(crest, 0.044, 0.008, true), { pos: [0, 0, -0.01] }), materialIndex: 3 });
      break;
    }
    case "sallet": {
      // Twin temple wings on Seraph's sallet helm
      const wing: V2[] = [[0, 0.14], [0.04, 0.22], [-0.12, 0.34], [-0.16, 0.22], [-0.06, 0.13]];
      for (const sx of [-1, 1] as const) {
        slots.push({
          mesh: transformMesh(extrudePolygonMesh(wing, 0.016, 0.004, true), { pos: [sx * 0.108, 0, 0], rot: [0, Math.PI * 0.5, sx * 0.18] }),
          materialIndex: 1
        });
      }
      break;
    }
    case "horned": {
      for (const sx of [-1, 1] as const) {
        const horn = catmullRomSpline3([[sx * 0.075, 0.21, 0.03], [sx * 0.15, 0.29, -0.02], [sx * 0.12, 0.39, 0.05]], 4)
          .map((p, i, arr) => [p[0], p[1], p[2], 0.022 * (1 - (i / arr.length) * 0.8)] as V4);
        slots.push({ mesh: tubeSweepMesh(horn, 6, true), materialIndex: 1 });
      }
      break;
    }
    case "crown": {
      // Forged 8-spike Iron Crown circlet directly atop Sovereign's great-helm
      slots.push({ mesh: latheMesh([[0.098, 0.21], [0.122, 0.22], [0.122, 0.255], [0.098, 0.26]], 16), materialIndex: 1 });
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const sh = i % 2 === 0 ? 0.11 : 0.07;
        slots.push({
          mesh: transformMesh(latheMesh([[0, 0], [0.018, 0], [0, sh]], 6, true), {
            pos: [Math.cos(a) * 0.108, 0.25, Math.sin(a) * 0.108]
          }),
          materialIndex: i % 2 === 0 ? 1 : 0
        });
      }
      break;
    }
  }
  return slots;
}

function buildUpperArmSlots(sideSign: 1 | -1, pauldronScale: number): MultiMatSlot[] {
  const ps = pauldronScale;
  const pauldronDome = transformMesh(
    latheMesh([[0, 0], [0.105 * ps, 0.01], [0.112 * ps, 0.065 * ps], [0.075 * ps, 0.115 * ps], [0, 0.125 * ps]], 14),
    { pos: [sideSign * 0.025, -0.03, 0], rot: [0, 0, -sideSign * 0.42] }
  );
  const rerebrace = latheMesh(
    [[0, -0.27], [0.048, -0.27], [0.058, -0.14], [0.064, -0.02], [0, 0.0]],
    12
  );
  return [
    { mesh: transformMesh(icosphereFacetMesh(0.058, 1, 0, 3), { pos: [0, 0, 0] }), materialIndex: 2 },
    { mesh: pauldronDome, materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.13 * ps, 0.022, 0.14 * ps, 0.006), { pos: [sideSign * 0.035, -0.03, 0], rot: [0, 0, -sideSign * 0.42] }), materialIndex: 1 },
    { mesh: rerebrace, materialIndex: 0 }
  ];
}

function buildForearmGauntletSlots(sideSign: 1 | -1): MultiMatSlot[] {
  const vambrace = latheMesh(
    [[0, -0.23], [0.042, -0.23], [0.052, -0.1], [0.048, 0.0], [0, 0.01]],
    12
  );
  return [
    // Couter elbow cop + fluted vambrace + articulated gauntlet fist
    { mesh: transformMesh(icosphereFacetMesh(0.052, 1, 0, 5), { pos: [sideSign * 0.01, 0, -0.012] }), materialIndex: 1 },
    { mesh: vambrace, materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.068, 0.078, 0.076, 0.014), { pos: [0, -0.26, 0.008] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.072, 0.022, 0.08, 0.006), { pos: [0, -0.23, 0.008] }), materialIndex: 1 }
  ];
}

function buildWeaponSlots(style: ArchetypeBuild["weaponStyle"]): MultiMatSlot[] {
  // Weapon origin = right gauntlet palm `[0, -0.26, 0.02]`, blade extending forward (+Z) and up (+Y)
  switch (style) {
    case "katana": {
      const bladePts = catmullRomSpline3([[0, 0, 0.06], [0, 0.02, 0.42], [0, 0.065, 0.78], [0, 0.11, 1.06]], 4)
        .map((p, i, arr) => [p[0], p[1], p[2], 0.024 * (1 - (i / arr.length) * 0.55)] as V4);
      return [
        { mesh: tubeSweepMesh([[0, 0, -0.18, 0.018], [0, 0, 0.05, 0.019]], 8, true), materialIndex: 5 },
        { mesh: transformMesh(bevelBoxMesh(0.095, 0.095, 0.018, 0.005), { pos: [0, 0, 0.055] }), materialIndex: 1 },
        { mesh: transformMesh(tubeSweepMesh(bladePts, 6, true), { scale: [0.38, 1.15, 1] }), materialIndex: 4 }
      ];
    }
    case "cestusBlade": {
      const katarRing: V2[] = [[-0.048, 0], [0.048, 0], [0.028, 0.44], [0, 0.58], [-0.028, 0.44]];
      return [
        { mesh: transformMesh(bevelBoxMesh(0.11, 0.11, 0.16, 0.022), { pos: [0, 0, 0.04] }), materialIndex: 0 },
        { mesh: transformMesh(bevelBoxMesh(0.12, 0.03, 0.17, 0.008), { pos: [0, 0.045, 0.04] }), materialIndex: 6 },
        { mesh: transformMesh(extrudePolygonMesh(katarRing, 0.018, 0.004, true), { pos: [0, 0, 0.1], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 4 }
      ];
    }
    case "warhammer": {
      return [
        { mesh: tubeSweepMesh([[0, 0, -0.26, 0.022], [0, 0, 0.78, 0.024]], 8, true), materialIndex: 5 },
        { mesh: transformMesh(bevelBoxMesh(0.12, 0.28, 0.14, 0.022), { pos: [0, 0, 0.72] }), materialIndex: 0 },
        { mesh: transformMesh(bevelBoxMesh(0.14, 0.09, 0.16, 0.012), { pos: [0, 0.13, 0.72] }), materialIndex: 1 },
        { mesh: transformMesh(latheMesh([[0, 0], [0.042, 0], [0.016, 0.11], [0, 0.15]], 8, true), { pos: [0, -0.13, 0.72], rot: [Math.PI, 0, 0] }), materialIndex: 4 },
        { mesh: transformMesh(latheMesh([[0, 0], [0.036, 0], [0, 0.16]], 8, true), { pos: [0, 0, 0.79], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 4 }
      ];
    }
    case "halberd": {
      const axeBlade: V2[] = [[0, -0.06], [0.16, -0.12], [0.22, 0.05], [0.14, 0.22], [0, 0.12]];
      return [
        { mesh: tubeSweepMesh([[0, 0, -0.45, 0.02], [0, 0, 1.18, 0.02]], 8, true), materialIndex: 5 },
        { mesh: transformMesh(latheMesh([[0, 0], [0.034, 0], [0.012, 0.24], [0, 0.32]], 8, true), { pos: [0, 0, 1.18], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 4 },
        { mesh: transformMesh(extrudePolygonMesh(axeBlade, 0.016, 0.004, true), { pos: [0, 0.02, 1.04], rot: [0, 0, Math.PI * 0.5] }), materialIndex: 4 },
        { mesh: transformMesh(bevelBoxMesh(0.05, 0.05, 0.14, 0.01), { pos: [0, 0, 1.04] }), materialIndex: 1 },
        { mesh: tubeSweepMesh([[0, -0.02, 0.96, 0.022], [0, -0.14, 0.88, 0.012]], 6, true), materialIndex: 3 }
      ];
    }
    case "saber": {
      const saberPts = catmullRomSpline3([[0, 0, 0.06], [0, 0.015, 0.36], [0, 0.07, 0.68], [0, 0.14, 0.92]], 4)
        .map((p, i, arr) => [p[0], p[1], p[2], 0.026 * (1 - (i / arr.length) * 0.6)] as V4);
      return [
        { mesh: tubeSweepMesh([[0, 0, -0.14, 0.018], [0, 0, 0.06, 0.019]], 8, true), materialIndex: 5 },
        { mesh: tubeSweepMesh([[0, 0.02, 0.06, 0.012], [0, 0.075, -0.02, 0.012], [0, 0.01, -0.13, 0.011]], 6, true), materialIndex: 1 },
        { mesh: transformMesh(tubeSweepMesh(saberPts, 6, true), { scale: [0.34, 1.2, 1] }), materialIndex: 4 }
      ];
    }
    case "greatsword": {
      const bladeRing: V2[] = [[-0.048, 0], [0.048, 0], [0.036, 0.88], [0, 1.14], [-0.036, 0.88]];
      return [
        { mesh: tubeSweepMesh([[0, 0, -0.26, 0.02], [0, 0, 0.06, 0.022]], 8, true), materialIndex: 5 },
        { mesh: transformMesh(icosphereFacetMesh(0.038, 1, 0, 7), { pos: [0, 0, -0.28] }), materialIndex: 1 },
        { mesh: transformMesh(bevelBoxMesh(0.32, 0.034, 0.042, 0.008), { pos: [0, 0, 0.065] }), materialIndex: 1 },
        { mesh: transformMesh(extrudePolygonMesh(bladeRing, 0.018, 0.004, true), { pos: [0, 0, 0.08], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 4 },
        { mesh: tubeSweepMesh([[0, 0, 0.1, 0.01], [0, 0, 0.78, 0.006]], 6, true), materialIndex: 1 }
      ];
    }
  }
}

function buildShieldSlots(style: ArchetypeBuild["shieldStyle"]): MultiMatSlot[] {
  // Strapped to outer left forearm (`+X` face)
  switch (style) {
    case "scutum": {
      const shieldFace: V2[] = [[-0.21, 0.32], [0.21, 0.32], [0.22, -0.28], [0, -0.4], [-0.22, -0.28]];
      return [
        { mesh: transformMesh(extrudePolygonMesh(shieldFace, 0.028, 0.008, true), { pos: [0.065, -0.1, 0.03], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 0 },
        { mesh: transformMesh(bevelBoxMesh(0.022, 0.54, 0.32, 0.006), { pos: [0.082, -0.04, 0.03] }), materialIndex: 3 },
        { mesh: transformMesh(icosphereFacetMesh(0.065, 1, 0, 9), { pos: [0.095, -0.02, 0.03] }), materialIndex: 1 }
      ];
    }
    case "heater": {
      const heater: V2[] = [[-0.17, 0.22], [0.17, 0.22], [0.16, -0.06], [0, -0.28], [-0.16, -0.06]];
      const inner: V2[] = [[-0.12, 0.17], [0.12, 0.17], [0.11, -0.04], [0, -0.2], [-0.11, -0.04]];
      return [
        { mesh: transformMesh(extrudePolygonMesh(heater, 0.024, 0.006, true), { pos: [0.062, -0.12, 0.02], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 1 },
        { mesh: transformMesh(extrudePolygonMesh(inner, 0.028, 0.005, true), { pos: [0.068, -0.12, 0.02], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 3 },
        { mesh: transformMesh(icosphereFacetMesh(0.042, 1, 0, 11), { pos: [0.088, -0.06, 0.02] }), materialIndex: 1 }
      ];
    }
    case "buckler":
    case "rondel": {
      const r = style === "rondel" ? 0.155 : 0.18;
      const disk = transformMesh(
        latheMesh([[0, 0], [r, 0], [r, 0.022], [r * 0.55, 0.042], [0, 0.068]], 16),
        { pos: [0.058, -0.16, 0.02], rot: [0, 0, -Math.PI * 0.5] }
      );
      const rimRing = transformMesh(
        latheMesh([[r * 0.82, -0.002], [r * 1.03, 0.0], [r * 1.03, 0.026], [r * 0.82, 0.028]], 16),
        { pos: [0.058, -0.16, 0.02], rot: [0, 0, -Math.PI * 0.5] }
      );
      return [
        { mesh: disk, materialIndex: 0 },
        { mesh: rimRing, materialIndex: 1 },
        { mesh: transformMesh(icosphereFacetMesh(0.036, 1, 0, 13), { pos: [0.125, -0.16, 0.02] }), materialIndex: 3 }
      ];
    }
  }
}

function buildThighCuisseSlots(): MultiMatSlot[] {
  const cuisse = latheMesh(
    [[0, -0.41], [0.064, -0.41], [0.082, -0.22], [0.092, -0.05], [0.076, 0.02], [0, 0.03]],
    14
  );
  return [
    { mesh: transformMesh(icosphereFacetMesh(0.074, 1, 0, 4), { pos: [0, 0, 0] }), materialIndex: 2 },
    { mesh: cuisse, materialIndex: 0 },
    { mesh: tubeSweepMesh([[0, -0.38, 0.072, 0.012], [0, -0.06, 0.094, 0.014]], 6, true), materialIndex: 1 }
  ];
}

function buildGreaveSlots(sideSign: 1 | -1): MultiMatSlot[] {
  const greave = latheMesh(
    [[0, -0.41], [0.052, -0.41], [0.07, -0.18], [0.064, -0.03], [0, 0.01]],
    14
  );
  const wing: V2[] = [[0, -0.05], [0.06, 0.02], [0.04, 0.07], [-0.03, 0.04]];
  return [
    // Poleyn knee cop + side fan wing + anatomical fluted greave
    { mesh: transformMesh(icosphereFacetMesh(0.066, 1, 0, 6), { pos: [0, 0, 0.018] }), materialIndex: 1 },
    { mesh: transformMesh(extrudePolygonMesh(wing, 0.014, 0.004, true), { pos: [sideSign * 0.062, 0, 0.01], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 1 },
    { mesh: greave, materialIndex: 0 },
    { mesh: tubeSweepMesh([[0, -0.39, 0.054, 0.01], [0, -0.06, 0.072, 0.012]], 6, true), materialIndex: 1 }
  ];
}

function buildSabatonSlots(): MultiMatSlot[] {
  // Ankle joint at y=0, sole grounded cleanly at y = -0.08 (0.94 - 0.04 - 0.41 - 0.41 - 0.08 = 0.00 m!)
  const vamp = loftSectionsMesh(
    [
      makeOctRing(-0.072, 0.056, 0.065, -0.01),
      makeOctRing(-0.035, 0.054, 0.115, 0.035),
      makeOctRing(-0.005, 0.048, 0.062, 0.005)
    ],
    true
  );
  return [
    { mesh: vamp, materialIndex: 0 },
    // Grounded forged-iron sabaton sole + pointed toe cap (`minY = -0.08`)
    { mesh: transformMesh(bevelBoxMesh(0.112, 0.024, 0.245, 0.006), { pos: [0, -0.068, 0.045] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.098, 0.018, 0.09, 0.005), { pos: [0, -0.052, 0.135] }), materialIndex: 1 }
  ];
}

function partNode(
  name: string,
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[]
) {
  return assembleMultiMaterialNode(name, slots, materials, {
    castShadow: true,
    receiveShadow: true
  });
}

/**
 * Build a sculpted, multi-material, anatomically articulated Armored Gladiator / Knight rig.
 * Grounded cleanly at `y = 0` (`sabaton` soles rest flush on the arena deck) and hierarchically
 * rigged so `poseArticulatedGladiatorRig` drives all combat states with stateless `"ZYX"` Eulers.
 */
export function buildArticulatedGladiatorRig(opts: GladiatorRigOptions) {
  const b = ARCHETYPE_BUILDS[opts.fighterId];
  const mats = buildGladiatorMaterials(opts);
  const id = (suffix: GladiatorJointSuffix) => `${opts.nodeId}-${suffix}`;
  const rt = (suffix: GladiatorJointSuffix) => game.runtimeNode(id(suffix));

  const weaponPart = group(id("weapon"), [partNode(`${id("weapon")}-mesh`, buildWeaponSlots(b.weaponStyle), mats)])
    .position(0, -0.26, 0.02)
    .runtime(rt("weapon"));

  const shieldPart = group(id("shield"), [partNode(`${id("shield")}-mesh`, buildShieldSlots(b.shieldStyle), mats)])
    .position(0, 0, 0)
    .runtime(rt("shield"));

  const elbowR = group(id("elbow-r"), [
    partNode(`${id("elbow-r")}-mesh`, buildForearmGauntletSlots(-1), mats),
    weaponPart
  ])
    .position(0, -0.27, 0)
    .runtime(rt("elbow-r"));

  const shoulderR = group(id("shoulder-r"), [
    partNode(`${id("shoulder-r")}-mesh`, buildUpperArmSlots(-1, b.pauldronScale), mats),
    elbowR
  ])
    .position(-(b.chestWidth + 0.045), 0.36, 0)
    .runtime(rt("shoulder-r"));

  const elbowL = group(id("elbow-l"), [
    partNode(`${id("elbow-l")}-mesh`, buildForearmGauntletSlots(1), mats),
    shieldPart
  ])
    .position(0, -0.27, 0)
    .runtime(rt("elbow-l"));

  const shoulderL = group(id("shoulder-l"), [
    partNode(`${id("shoulder-l")}-mesh`, buildUpperArmSlots(1, b.pauldronScale), mats),
    elbowL
  ])
    .position(b.chestWidth + 0.045, 0.36, 0)
    .runtime(rt("shoulder-l"));

  const head = group(id("head"), [
    partNode(`${id("head")}-mesh`, buildVisoredHelmSlots(b, opts.side), mats)
  ])
    .position(0, 0.46, 0)
    .runtime(rt("head"));

  const torso = group(id("torso"), [
    partNode(`${id("torso")}-mesh`, buildTorsoSlots(b), mats),
    head,
    shoulderL,
    shoulderR
  ])
    .position(0, 0.08, 0)
    .runtime(rt("torso"));

  const ankleL = group(id("ankle-l"), [
    partNode(`${id("ankle-l")}-mesh`, buildSabatonSlots(), mats)
  ])
    .position(0, -0.41, 0)
    .runtime(rt("ankle-l"));

  const kneeL = group(id("knee-l"), [
    partNode(`${id("knee-l")}-mesh`, buildGreaveSlots(1), mats),
    ankleL
  ])
    .position(0, -0.41, 0)
    .runtime(rt("knee-l"));

  const hipL = group(id("hip-l"), [
    partNode(`${id("hip-l")}-mesh`, buildThighCuisseSlots(), mats),
    kneeL
  ])
    .position(0.125, -0.04, 0)
    .runtime(rt("hip-l"));

  const ankleR = group(id("ankle-r"), [
    partNode(`${id("ankle-r")}-mesh`, buildSabatonSlots(), mats)
  ])
    .position(0, -0.41, 0)
    .runtime(rt("ankle-r"));

  const kneeR = group(id("knee-r"), [
    partNode(`${id("knee-r")}-mesh`, buildGreaveSlots(-1), mats),
    ankleR
  ])
    .position(0, -0.41, 0)
    .runtime(rt("knee-r"));

  const hipR = group(id("hip-r"), [
    partNode(`${id("hip-r")}-mesh`, buildThighCuisseSlots(), mats),
    kneeR
  ])
    .position(-0.125, -0.04, 0)
    .runtime(rt("hip-r"));

  const hips = group(id("hips"), [
    partNode(`${id("hips")}-mesh`, buildPelvisSlots(b), mats),
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
