/**
 * Iron Crown (`WP-05`) — 100% Native `@aura3d/engine` Multi-Material Procedural 3D Set-Pieces.
 *
 * Sculpted architectural landmarks, arena props, championship goblets, sovereign regalia,
 * and distant skyline/harbor/ridge geometry across all six Iron Crown tournament venues.
 * Built strictly from `showcase-port-shared/proceduralKernel` + `@aura3d/engine` with zero `three` imports.
 */
import {
  geometry,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
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
    color: "#1a171c",
    roughness: 0.34
  }),
  gildedCrownGold: material.studioMetal({
    name: "ic-gilded-crown-gold",
    color: "#e0ab44",
    roughness: 0.18
  }),
  sterlingTrophySilver: material.studioMetal({
    name: "ic-sterling-trophy-silver",
    color: "#cfd8e3",
    roughness: 0.22
  }),
  castTempleBronze: material.studioMetal({
    name: "ic-cast-temple-bronze",
    color: "#7c5c38",
    roughness: 0.3
  }),
  weatheredGantrySteel: material.brushedMetal({
    name: "ic-weathered-gantry-steel",
    color: "#3d434d",
    roughness: 0.44
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

  // Lacquered timber, glazed roof tile & woven textiles
  vermilionLacquer: material.lacquer({
    name: "ic-vermilion-lacquer",
    color: "#9e201b",
    roughness: 0.24
  }),
  rosewoodLacquer: material.lacquer({
    name: "ic-rosewood-lacquer",
    color: "#2c160e",
    roughness: 0.26
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
    color: "#6d111d",
    roughness: 0.86
  }),
  dockIndigoNoren: material.fabric({
    name: "ic-dock-indigo-noren",
    color: "#1e3352",
    roughness: 0.88
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
    color: "#ddd6c9",
    roughness: 0.36,
    metallic: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.28
  }),
  sanctumDarkMarble: material.physical({
    name: "ic-sanctum-dark-marble",
    color: "#1f1926",
    roughness: 0.24,
    metallic: 0.12,
    clearcoat: 0.42,
    clearcoatRoughness: 0.18
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
  metalMat: AuraMaterialSpec = IC_MATERIALS.forgedBlackIron
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
    [metalMat, IC_MATERIALS.gildedCrownGold, practicalGlow(`${name}-embers`, emberColor, 1.55)],
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
    [IC_MATERIALS.weatheredGantrySteel, IC_MATERIALS.forgedBlackIron, practicalGlow(`${name}-beam`, beamColor, 1.5)],
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

export function buildMonasteryGuardianStatue(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const torso = loftSectionsMesh(
    [
      [[-0.26, 0.34, 0.32], [0.26, 0.34, 0.32], [0.28, 0.34, -0.34], [-0.28, 0.34, -0.34]],
      [[-0.24, 0.96, 0.26], [0.24, 0.96, 0.26], [0.18, 0.96, -0.22], [-0.18, 0.96, -0.22]],
      [[-0.18, 1.38, 0.28], [0.18, 1.38, 0.28], [0.14, 1.38, -0.08], [-0.14, 1.38, -0.08]]
    ],
    true,
    true
  );
  const mane = icosphereFacetMesh(0.28, 1, 0.18, 61);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(0.84, 0.34, 0.92, 0.04), { pos: [0, 0.17, 0] }), materialIndex: 0 },
    { mesh: torso, materialIndex: 0 },
    { mesh: transformMesh(mane, { pos: [0, 1.54, 0.14] }), materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0.18, 1.28], [0.24, 1.32], [0.22, 1.38], [0.18, 1.38]], 12), { pos: [0, 0, 0.1] }), materialIndex: 1 }
  ];
  return mountMultiMat(name, slots, [IC_MATERIALS.graniteLanternStone, IC_MATERIALS.gildedCrownGold], pos, rotY);
}


// ---------------------------------------------------------------------------
// 6. Crown Sanctum (`cr-*`) — Throne, Iron Crown, Goblets, Banners & Statues
// ---------------------------------------------------------------------------

export function buildSovereignThroneChair(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const spireRing: V2[] = [[-0.62, 0.44], [0.62, 0.44], [0.68, 1.62], [0.36, 2.08], [0, 2.38], [-0.36, 2.08], [-0.68, 1.62]];
  const armL: V4[] = catmullRomSpline3([[-0.56, 0.52, -0.34], [-0.6, 0.78, 0.04], [-0.58, 0.74, 0.44], [-0.58, 0.48, 0.48]], 5).map(
    (p) => [p[0], p[1], p[2], 0.068]
  );
  const armR: V4[] = armL.map(([x, y, z, r]) => [-x, y, z, r]);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.34, 0.44, 1.06, 0.04), { pos: [0, 0.22, 0.06] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.06, 0.1, 0.84, 0.03), { pos: [0, 0.44, 0.12] }), materialIndex: 2 },
    { mesh: transformMesh(extrudePolygonMesh(spireRing, 0.16, 0.03, true), { pos: [0, 0, -0.38] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.88, 1.12, 0.09, 0.03), { pos: [0, 1.12, -0.28] }), materialIndex: 2 },
    { mesh: tubeSweepMesh(armL, 8, true), materialIndex: 0 },
    { mesh: tubeSweepMesh(armR, 8, true), materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.09, 0.02], [0.05, 0.26], [0, 0.32]], 10), { pos: [-0.58, 1.62, -0.38] }), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.09, 0.02], [0.05, 0.26], [0, 0.32]], 10), { pos: [0.58, 1.62, -0.38] }), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.11, 0.03], [0.06, 0.34], [0, 0.42]], 12), { pos: [0, 2.34, -0.38] }), materialIndex: 1 },
    { mesh: transformMesh(icosphereFacetMesh(0.09, 1, 0.05, 9), { pos: [-0.58, 0.78, 0.46] }), materialIndex: 1 },
    { mesh: transformMesh(icosphereFacetMesh(0.09, 1, 0.05, 11), { pos: [0.58, 0.78, 0.46] }), materialIndex: 1 },
    { mesh: transformMesh(icosphereFacetMesh(0.08, 1, 0.04, 15), { pos: [0, 1.92, -0.28] }), materialIndex: 3 }
  ];
  return mountMultiMat(
    name,
    slots,
    [
      IC_MATERIALS.forgedBlackIron,
      IC_MATERIALS.gildedCrownGold,
      IC_MATERIALS.royalCrimsonVelvet,
      practicalGlow(`${name}-crest-gem`, "#ff3d2e", 1.35)
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
    // Velvet presentation cushion + gold corner tassels
    { mesh: transformMesh(bevelBoxMesh(0.66, 0.11, 0.62, 0.045), { pos: [0, 0.055, 0] }), materialIndex: 2 },
    { mesh: band, materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0.272, 0.14], [0.295, 0.15], [0.295, 0.19], [0.272, 0.2]], 20), { pos: [0, 0, 0] }), materialIndex: 1 }
  ];
  for (const [tx, tz] of [[-0.31, -0.29], [0.31, -0.29], [-0.31, 0.29], [0.31, 0.29]] as const) {
    slots.push({ mesh: transformMesh(icosphereFacetMesh(0.045, 1, 0.05, 5), { pos: [tx, 0.05, tz] }), materialIndex: 1 });
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const spikeH = i % 2 === 0 ? 0.24 : 0.15;
    const r = 0.255;
    slots.push({
      mesh: transformMesh(latheMesh([[0, 0], [0.042, 0], [0.018, spikeH * 0.72], [0, spikeH]], 6, true), {
        pos: [Math.cos(a) * r, 0.23, Math.sin(a) * r]
      }),
      materialIndex: i % 2 === 0 ? 1 : 0
    });
    if (i % 2 === 0) {
      slots.push({
        mesh: transformMesh(icosphereFacetMesh(0.032, 1, 0.02, i + 3), { pos: [Math.cos(a) * 0.29, 0.17, Math.sin(a) * 0.29] }),
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
      practicalGlow(`${name}-rubies`, "#ff3b2f", 1.5)
    ],
    pos,
    rotY
  );
}

export function buildSanctumKingStatue(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const armorTorso = loftSectionsMesh(
    [
      [[-0.28, 0.38, 0.2], [0.28, 0.38, 0.2], [0.26, 0.38, -0.22], [-0.26, 0.38, -0.22]],
      [[-0.22, 1.05, 0.18], [0.22, 1.05, 0.18], [0.2, 1.05, -0.2], [-0.2, 1.05, -0.2]],
      [[-0.36, 1.56, 0.22], [0.36, 1.56, 0.22], [0.3, 1.56, -0.22], [-0.3, 1.56, -0.22]],
      [[-0.16, 1.72, 0.14], [0.16, 1.72, 0.14], [0.16, 1.72, -0.14], [-0.16, 1.72, -0.14]]
    ],
    true,
    true
  );
  const helm = latheMesh([[0, 1.72], [0.14, 1.74], [0.16, 1.94], [0.13, 2.08], [0.17, 2.16], [0, 2.24]], 12, true);
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(0.92, 0.38, 0.92, 0.04), { pos: [0, 0.19, 0] }), materialIndex: 0 },
    { mesh: armorTorso, materialIndex: 1 },
    { mesh: helm, materialIndex: 1 },
    // Planted greatsword (blade + crossguard + pommel)
    { mesh: transformMesh(bevelBoxMesh(0.09, 1.24, 0.025, 0.006), { pos: [0, 1.0, 0.28] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.42, 0.06, 0.07, 0.012), { pos: [0, 1.58, 0.28] }), materialIndex: 2 },
    { mesh: transformMesh(icosphereFacetMesh(0.055, 1, 0, 7), { pos: [0, 1.76, 0.28] }), materialIndex: 2 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.sanctumDarkMarble, IC_MATERIALS.forgedBlackIron, IC_MATERIALS.gildedCrownGold],
    pos,
    rotY
  );
}

export function buildSanctumMarbleColonnade(name: string, pos: V3, rotY = 0): AuraSceneNode {
  const col = latheMesh([[0, 0.24], [0.28, 0.24], [0.24, 0.42], [0.21, 3.65], [0.29, 3.88], [0, 3.92]], 16);
  const bannerRing: V2[] = [[-0.42, 0], [-0.42, -2.1], [0, -1.78], [0.42, -2.1], [0.42, 0]];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(2.25, 0.24, 0.86, 0.03), { pos: [0, 0.12, 0] }), materialIndex: 0 },
    { mesh: transformMesh(col, { pos: [-0.74, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(col, { pos: [0.74, 0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(2.38, 0.32, 0.92, 0.035), { pos: [0, 4.08, 0] }), materialIndex: 1 },
    { mesh: transformMesh(extrudePolygonMesh(bannerRing, 0.03, 0.008, true), { pos: [0, 3.78, 0.08] }), materialIndex: 2 }
  ];
  return mountMultiMat(
    name,
    slots,
    [IC_MATERIALS.sanctumDarkMarble, IC_MATERIALS.gildedCrownGold, IC_MATERIALS.royalCrimsonVelvet],
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
