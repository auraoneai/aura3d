/**
 * Articulated multi-material `@aura3d/engine` Sengoku character rigs for Shadowstep Gauntlet (`examples/ninja-runner-port`).
 *
 * Replaces all 6 Meshy character `.glb`s (`hero`, `soldier`, `brute`, `sage`, `caster`, `scout`) with sculpted
 * multi-material `@aura3d/engine` scene nodes (`body`, `head`, `legL`, `legR`, `armL`, `armR`) driven by a
 * deterministic procedural clip & cross-fade solver that exposes exact `Spine02`, `RightForeArm`, `RightHand`,
 * `LeftForeArm`, and `LeftHand` joint transforms for scarf ribbon anchoring, weapon aiming, spirit orbs, and `probeBones`.
 */
import { type AuraApp, type AuraMaterialSpec, type AuraNodeBuilder, type TypedGLBActor, material } from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bevelBoxMesh,
  catmullRomSpline3,
  latheMesh,
  mergeRawMeshes,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import type { LookMode } from "../districtLook";
import { EVENING_SLOT_MODEL, SLOT_MODEL, type CharacterId } from "../models";

export const PROCEDURAL_PART_KEYS = ["body", "head", "legL", "legR", "armL", "armR"] as const;
export type ProceduralPartKey = (typeof PROCEDURAL_PART_KEYS)[number];

const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/* ------------------------------------------------------------------ Palette & PBR Materials */

const MAT_SKIN = unnamed(material.pbr({ color: "#dfa884", roughness: 0.62, metallic: 0.02 }));
const MAT_STEEL = unnamed(material.studioMetal({ color: "#b6c2d4", roughness: 0.24, metallic: 0.92 }));
const MAT_DARK_IRON = unnamed(material.lacquer({ color: "#1d2230", roughness: 0.34, metallic: 0.36, clearcoat: 0.42, clearcoatRoughness: 0.22 }));
const MAT_GOLD = unnamed(material.studioMetal({ color: "#e5b449", roughness: 0.28, metallic: 0.88 }));
const MAT_CRIMSON_LACQUER = unnamed(material.lacquer({ color: "#b82924", roughness: 0.28, metallic: 0.14, clearcoat: 0.62, clearcoatRoughness: 0.18 }));
const MAT_SUMI_INDIGO = unnamed(material.fabric({ color: "#1d2a4a", roughness: 0.82 }));
const MAT_SHINOBI_WRAP = unnamed(material.fabric({ color: "#cbd4e4", roughness: 0.86 }));
const MAT_CLONE_FABRIC = unnamed(material.emissive({ color: "#1a3c68", emissive: "#22a8f5", emissiveIntensity: 0.85 }));
const MAT_CLONE_TRIM = unnamed(material.emissive({ color: "#5be4ff", emissive: "#4ad8ff", emissiveIntensity: 1.35 }));
const MAT_ASHIGARU_TEAL = unnamed(material.fabric({ color: "#274156", roughness: 0.84 }));
const MAT_STRAW_JINGASA = unnamed(material.fabric({ color: "#8c6b3f", roughness: 0.72 }));
const MAT_ONI_CRIMSON = unnamed(material.lacquer({ color: "#8f1d1d", roughness: 0.32, metallic: 0.22, clearcoat: 0.58, clearcoatRoughness: 0.2 }));
const MAT_ONI_EBONY = unnamed(material.lacquer({ color: "#18151d", roughness: 0.28, metallic: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.18 }));
const MAT_SAGE_AMBER = unnamed(material.fabric({ color: "#d86b1e", roughness: 0.74 }));
const MAT_SAGE_CREAM = unnamed(material.fabric({ color: "#f2e4c9", roughness: 0.8 }));
const MAT_CASTER_ROBE = unnamed(material.fabric({ color: "#3d255e", roughness: 0.78 }));
const MAT_CASTER_SILK = unnamed(material.lacquer({ color: "#6c3fa4", roughness: 0.36, metallic: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.22 }));
const MAT_SCOUT_CLOAK = unnamed(material.fabric({ color: "#7d2329", roughness: 0.78 }));
const MAT_PORCELAIN_MASK = unnamed(material.ceramic({ color: "#f3eee6", roughness: 0.24, clearcoat: 0.65, clearcoatRoughness: 0.14 }));
const MAT_SPIRIT_CYAN_EYE = unnamed(material.emissive({ color: "#6af2ff", emissive: "#38dcff", emissiveIntensity: 2.1, practical: true }));
const MAT_SPIRIT_VIOLET_EYE = unnamed(material.emissive({ color: "#d98cff", emissive: "#b85cff", emissiveIntensity: 2.1, practical: true }));
const MAT_SPIRIT_AMBER_EYE = unnamed(material.emissive({ color: "#ffd26a", emissive: "#ff9d2e", emissiveIntensity: 2.2, practical: true }));

interface RigTheme {
  readonly cloth: AuraMaterialSpec;
  readonly armor: AuraMaterialSpec;
  readonly accent: AuraMaterialSpec;
  readonly wrap: AuraMaterialSpec;
  readonly boot: AuraMaterialSpec;
  readonly mask: AuraMaterialSpec;
  readonly eye: AuraMaterialSpec;
}

function themeForSlot(id: CharacterId, isClone: boolean): RigTheme {
  if (isClone) {
    return {
      cloth: MAT_CLONE_FABRIC,
      armor: MAT_CLONE_TRIM,
      accent: MAT_CLONE_TRIM,
      wrap: MAT_CLONE_TRIM,
      boot: MAT_CLONE_FABRIC,
      mask: MAT_CLONE_FABRIC,
      eye: MAT_SPIRIT_CYAN_EYE
    };
  }
  switch (id) {
    case "hero":
      return {
        cloth: MAT_SUMI_INDIGO,
        armor: MAT_DARK_IRON,
        accent: MAT_CRIMSON_LACQUER,
        wrap: MAT_SHINOBI_WRAP,
        boot: MAT_DARK_IRON,
        mask: MAT_SUMI_INDIGO,
        eye: MAT_SPIRIT_CYAN_EYE
      };
    case "soldier":
      return {
        cloth: MAT_ASHIGARU_TEAL,
        armor: MAT_DARK_IRON,
        accent: MAT_GOLD,
        wrap: MAT_SHINOBI_WRAP,
        boot: MAT_DARK_IRON,
        mask: MAT_STRAW_JINGASA,
        eye: MAT_GOLD
      };
    case "brute":
      return {
        cloth: MAT_ONI_EBONY,
        armor: MAT_ONI_CRIMSON,
        accent: MAT_GOLD,
        wrap: MAT_CRIMSON_LACQUER,
        boot: MAT_ONI_EBONY,
        mask: MAT_ONI_CRIMSON,
        eye: MAT_SPIRIT_AMBER_EYE
      };
    case "sage":
      return {
        cloth: MAT_SAGE_AMBER,
        armor: MAT_SAGE_CREAM,
        accent: MAT_GOLD,
        wrap: MAT_SAGE_CREAM,
        boot: MAT_DARK_IRON,
        mask: MAT_PORCELAIN_MASK,
        eye: MAT_SPIRIT_AMBER_EYE
      };
    case "caster":
      return {
        cloth: MAT_CASTER_ROBE,
        armor: MAT_CASTER_SILK,
        accent: MAT_GOLD,
        wrap: MAT_SHINOBI_WRAP,
        boot: MAT_DARK_IRON,
        mask: MAT_PORCELAIN_MASK,
        eye: MAT_SPIRIT_VIOLET_EYE
      };
    case "scout":
      return {
        cloth: MAT_SCOUT_CLOAK,
        armor: MAT_DARK_IRON,
        accent: MAT_CRIMSON_LACQUER,
        wrap: MAT_SHINOBI_WRAP,
        boot: MAT_DARK_IRON,
        mask: MAT_PORCELAIN_MASK,
        eye: MAT_SPIRIT_AMBER_EYE
      };
  }
}

interface PartSlot {
  readonly mesh: RawMesh;
  readonly material: AuraMaterialSpec;
}

/* ------------------------------------------------------------------ Multi-Material Limb Geometry (`+Z` forward, `+Y` up) */

function buildBodySlots(id: CharacterId, theme: RigTheme): PartSlot[] {
  const wide = id === "brute" ? 1.24 : id === "caster" ? 1.06 : 1.0;
  // Torso + pelvis + waist obi centered around pivot [0, 0.86, 0] (`y` spans `-0.18..+0.58`)
  const torso = transformMesh(
    latheMesh(
      [
        [0, -0.18],
        [0.21 * wide, -0.15],
        [0.19 * wide, 0.04],
        [0.24 * wide, 0.28],
        [0.26 * wide, 0.46],
        [0.16 * wide, 0.56],
        [0, 0.58]
      ],
      16
    ),
    { scale: [1.0, 1.0, 0.74] }
  );
  // Kusazuri / hakama hip skirt flaring cleanly over the hip joints so legs never look detached
  const hipSkirt = transformMesh(
    latheMesh(
      [
        [0, -0.24],
        [0.26 * wide, -0.22],
        [0.24 * wide, -0.04],
        [0.20 * wide, 0.06],
        [0, 0.07]
      ],
      16
    ),
    { scale: [1.04, 1.0, 0.82] }
  );
  const chestPlate = transformMesh(bevelBoxMesh(0.38 * wide, 0.34, 0.25 * wide, 0.045), { pos: [0, 0.28, 0.02] });
  const obiBelt = transformMesh(
    latheMesh([[0, -0.055], [0.225 * wide, -0.055], [0.235 * wide, 0], [0.225 * wide, 0.055], [0, 0.055]], 16),
    { pos: [0, 0.04, 0], scale: [1.02, 1.0, 0.78] }
  );
  const pauldrons: RawMesh[] = [
    transformMesh(bevelBoxMesh(0.14 * wide, 0.14, 0.22, 0.03), { pos: [-0.25 * wide, 0.44, 0], rot: [0, 0, 0.28] }),
    transformMesh(bevelBoxMesh(0.14 * wide, 0.14, 0.22, 0.03), { pos: [0.25 * wide, 0.44, 0], rot: [0, 0, -0.28] })
  ];
  const slots: PartSlot[] = [
    { mesh: mergeRawMeshes([torso, hipSkirt]), material: theme.cloth },
    { mesh: mergeRawMeshes([chestPlate, ...pauldrons]), material: theme.armor },
    { mesh: obiBelt, material: theme.accent }
  ];
  if (id === "hero" || id === "sage" || id === "scout") {
    // Diagonal katana scabbard (`saya`) slung across the back (`-Z`)
    const saya = transformMesh(bevelBoxMesh(0.042, 0.78, 0.055, 0.012), { pos: [0.04, 0.26, -0.17], rot: [0.12, 0, -0.58] });
    const hilt = transformMesh(bevelBoxMesh(0.05, 0.22, 0.055, 0.012), { pos: [-0.18, 0.58, -0.20], rot: [0.12, 0, -0.58] });
    slots.push({ mesh: saya, material: MAT_DARK_IRON }, { mesh: hilt, material: MAT_GOLD });
  }
  return slots;
}

function buildHeadSlots(id: CharacterId, theme: RigTheme): PartSlot[] {
  // Pivot at neck base `[0, 1.42, 0]`; head center at `+0.17` (`+Z` forward face)
  const cranium = transformMesh(
    latheMesh([[0, 0.0], [0.09, 0.03], [0.145, 0.12], [0.155, 0.21], [0.125, 0.30], [0, 0.33]], 16),
    { scale: [0.96, 1.0, 1.02] }
  );
  const eyeL = transformMesh(bevelBoxMesh(0.042, 0.022, 0.025, 0.006), { pos: [0.052, 0.19, 0.142] });
  const eyeR = transformMesh(bevelBoxMesh(0.042, 0.022, 0.025, 0.006), { pos: [-0.052, 0.19, 0.142] });

  if (id === "soldier") {
    // Wide curved conical `jingasa` war hat + golden fore-crest
    const jingasa = latheMesh([[0, 0.36], [0.14, 0.33], [0.30, 0.25], [0.34, 0.22], [0, 0.23]], 18);
    const crest = transformMesh(bevelBoxMesh(0.06, 0.07, 0.03, 0.008), { pos: [0, 0.29, 0.21], rot: [-0.35, 0, 0] });
    const lowerMask = transformMesh(bevelBoxMesh(0.18, 0.11, 0.14, 0.03), { pos: [0, 0.11, 0.07] });
    return [
      { mesh: cranium, material: MAT_SKIN },
      { mesh: jingasa, material: theme.mask },
      { mesh: lowerMask, material: MAT_DARK_IRON },
      { mesh: mergeRawMeshes([crest, eyeL, eyeR]), material: MAT_GOLD }
    ];
  }
  if (id === "brute") {
    // Horned Oni Samurai `kabuto` helmet + `shikoro` neck guard + golden `kuwagata` horns
    const kabuto = latheMesh([[0, 0.18], [0.185, 0.18], [0.19, 0.28], [0.14, 0.36], [0, 0.39]], 16);
    const shikoro = transformMesh(bevelBoxMesh(0.36, 0.14, 0.26, 0.03), { pos: [0, 0.14, -0.05] });
    const hornPtsL = catmullRomSpline3([[0.06, 0.28, 0.14], [0.15, 0.38, 0.16], [0.22, 0.50, 0.12]], 4).map(
      (p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.012, 0.036 * (1 - k / a.length))]
    );
    const hornPtsR = catmullRomSpline3([[-0.06, 0.28, 0.14], [-0.15, 0.38, 0.16], [-0.22, 0.50, 0.12]], 4).map(
      (p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.012, 0.036 * (1 - k / a.length))]
    );
    return [
      { mesh: cranium, material: theme.mask },
      { mesh: mergeRawMeshes([kabuto, shikoro]), material: MAT_ONI_EBONY },
      { mesh: mergeRawMeshes([tubeSweepMesh(hornPtsL, 8, true), tubeSweepMesh(hornPtsR, 8, true)]), material: MAT_GOLD },
      { mesh: mergeRawMeshes([eyeL, eyeR]), material: theme.eye }
    ];
  }
  if (id === "caster") {
    // Onmyoji tall `eboshi` court hat + porcelain owl mask + glowing violet spirit eyes
    const eboshi = latheMesh([[0, 0.24], [0.14, 0.24], [0.12, 0.44], [0.07, 0.54], [0, 0.56]], 14);
    const facePlate = transformMesh(bevelBoxMesh(0.21, 0.22, 0.07, 0.03), { pos: [0, 0.18, 0.13] });
    const browL = transformMesh(bevelBoxMesh(0.09, 0.035, 0.03, 0.008), { pos: [0.07, 0.25, 0.155], rot: [0, 0, 0.38] });
    const browR = transformMesh(bevelBoxMesh(0.09, 0.035, 0.03, 0.008), { pos: [-0.07, 0.25, 0.155], rot: [0, 0, -0.38] });
    return [
      { mesh: cranium, material: theme.cloth },
      { mesh: eboshi, material: MAT_DARK_IRON },
      { mesh: facePlate, material: theme.mask },
      { mesh: mergeRawMeshes([browL, browR]), material: MAT_GOLD },
      { mesh: mergeRawMeshes([eyeL, eyeR]), material: theme.eye }
    ];
  }
  if (id === "scout") {
    // Porcelain Kitsune fox mask with pointed ears + crimson cowl
    const faceMask = transformMesh(bevelBoxMesh(0.20, 0.21, 0.09, 0.035), { pos: [0, 0.17, 0.125] });
    const snout = transformMesh(latheMesh([[0, 0], [0.055, 0.02], [0.025, 0.09], [0, 0.10]], 10), { pos: [0, 0.14, 0.15], rot: [Math.PI * 0.5, 0, 0] });
    const earL = transformMesh(latheMesh([[0, 0], [0.048, 0.02], [0.015, 0.13], [0, 0.14]], 8), { pos: [0.085, 0.29, 0.08], rot: [0.18, 0, -0.22] });
    const earR = transformMesh(latheMesh([[0, 0], [0.048, 0.02], [0.015, 0.13], [0, 0.14]], 8), { pos: [-0.085, 0.29, 0.08], rot: [0.18, 0, 0.22] });
    return [
      { mesh: cranium, material: theme.cloth },
      { mesh: mergeRawMeshes([faceMask, snout, earL, earR]), material: theme.mask },
      { mesh: mergeRawMeshes([eyeL, eyeR]), material: theme.eye }
    ];
  }
  // `hero` & `sage`: Shinobi hooded cowl + metallic forehead `hitai-ate` protector + lower mask
  const hood = transformMesh(latheMesh([[0, 0.02], [0.155, 0.06], [0.168, 0.20], [0.135, 0.31], [0, 0.345]], 16), { pos: [0, 0, -0.01] });
  const faceOpening = transformMesh(bevelBoxMesh(0.17, 0.075, 0.06, 0.02), { pos: [0, 0.195, 0.12] });
  const headband = transformMesh(bevelBoxMesh(0.22, 0.052, 0.045, 0.012), { pos: [0, 0.245, 0.135] });
  const metalPlate = transformMesh(bevelBoxMesh(0.12, 0.038, 0.022, 0.006), { pos: [0, 0.245, 0.156] });
  return [
    { mesh: hood, material: theme.cloth },
    { mesh: faceOpening, material: MAT_SKIN },
    { mesh: headband, material: theme.accent },
    { mesh: metalPlate, material: MAT_STEEL },
    { mesh: mergeRawMeshes([eyeL, eyeR]), material: theme.eye }
  ];
}

function buildLegSlots(id: CharacterId, theme: RigTheme): PartSlot[] {
  const wide = id === "brute" ? 1.22 : 1.0;
  // Hip pivot at `[0, 0, 0]`, extending down to `y = -0.74` (`+Z` toe forward)
  const thigh = latheMesh(
    [
      [0, 0.04],
      [0.115 * wide, 0.0],
      [0.125 * wide, -0.18],
      [0.092 * wide, -0.36],
      [0, -0.39]
    ],
    12
  );
  const shinWrap = latheMesh(
    [
      [0, -0.35],
      [0.082 * wide, -0.37],
      [0.076 * wide, -0.52],
      [0.064 * wide, -0.66],
      [0, -0.68]
    ],
    12
  );
  const boot = transformMesh(bevelBoxMesh(0.13 * wide, 0.10, 0.24, 0.032), { pos: [0, -0.69, 0.045] });
  return [
    { mesh: thigh, material: theme.cloth },
    { mesh: shinWrap, material: theme.wrap },
    { mesh: boot, material: theme.boot }
  ];
}

function buildArmSlots(id: CharacterId, theme: RigTheme): PartSlot[] {
  const wide = id === "brute" ? 1.22 : id === "caster" ? 1.15 : 1.0;
  // Shoulder pivot at `[0, 0, 0]`, extending down to `y = -0.60`
  const sleeve = latheMesh(
    [
      [0, 0.04],
      [0.082 * wide, 0.0],
      [0.088 * wide, -0.16],
      [0.068 * wide, -0.30],
      [0, -0.32]
    ],
    12
  );
  const bracer = latheMesh(
    [
      [0, -0.28],
      [0.066 * wide, -0.30],
      [0.062 * wide, -0.46],
      [0.052 * wide, -0.53],
      [0, -0.55]
    ],
    12
  );
  const hand = transformMesh(bevelBoxMesh(0.095, 0.10, 0.105, 0.028), { pos: [0, -0.57, 0.015] });
  return [
    { mesh: sleeve, material: theme.cloth },
    { mesh: bracer, material: theme.armor },
    { mesh: hand, material: MAT_SKIN }
  ];
}

export function buildProceduralActorNodes(slot: number, id: CharacterId, castShadow: boolean): AuraNodeBuilder[] {
  const isClone = slot >= 1 && slot <= 3;
  const theme = themeForSlot(id, isClone);
  const mk = (part: ProceduralPartKey, partSlots: readonly PartSlot[]): AuraNodeBuilder => {
    const nodeId = `actor-${slot}-${part}`;
    const materials = partSlots.map((s) => s.material);
    const indexed: MultiMatSlot[] = partSlots.map((s, idx) => ({ mesh: s.mesh, materialIndex: idx }));
    return assembleMultiMaterialNode(nodeId, indexed, materials, {
      id: nodeId,
      position: [0, -500, 0],
      castShadow,
      receiveShadow: true,
      visible: false
    });
  };
  return [
    mk("body", buildBodySlots(id, theme)),
    mk("head", buildHeadSlots(id, theme)),
    mk("legL", buildLegSlots(id, theme)),
    mk("legR", buildLegSlots(id, theme)),
    mk("armL", buildArmSlots(id, theme)),
    mk("armR", buildArmSlots(id, theme))
  ];
}

/* ------------------------------------------------------------------ Procedural Clip Pose & Joint Kinematics */

export interface ProceduralLimbPose {
  readonly bodyPos: V3;
  readonly bodyRot: V3;
  readonly headPos: V3;
  readonly headRot: V3;
  readonly legLPos: V3;
  readonly legLRot: V3;
  readonly legRPos: V3;
  readonly legRRot: V3;
  readonly armLPos: V3;
  readonly armLRot: V3;
  readonly armRPos: V3;
  readonly armRRot: V3;
  readonly joints: Readonly<Record<string, V3>>;
}

type M3 = [number, number, number, number, number, number, number, number, number];

const rx = (a: number): M3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, s, 0, -s, c];
};
const ry = (a: number): M3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
};
const rz = (a: number): M3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
};
const mul3 = (a: M3, b: M3): M3 => {
  const col = (j: number): V3 => [
    a[0] * b[j * 3]! + a[3] * b[j * 3 + 1]! + a[6] * b[j * 3 + 2]!,
    a[1] * b[j * 3]! + a[4] * b[j * 3 + 1]! + a[7] * b[j * 3 + 2]!,
    a[2] * b[j * 3]! + a[5] * b[j * 3 + 1]! + a[8] * b[j * 3 + 2]!
  ];
  const c0 = col(0), c1 = col(1), c2 = col(2);
  return [c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]];
};
const apply3 = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2]
];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const eulerZYX = (e: V3): M3 => mul3(rz(e[2]), mul3(ry(e[1]), rx(e[0])));
const matrixToEulerXYZ = (m: M3): V3 => {
  // Engine `setRotation(rx, ry, rz)` composes `R = Rz * Ry * Rx` (or standard three-axis Euler); extract clean angles
  const sy = Math.max(-1, Math.min(1, m[6]));
  const ey = Math.asin(sy);
  if (Math.abs(sy) < 0.9999) {
    return [Math.atan2(-m[7], m[8]), ey, Math.atan2(-m[3], m[0])];
  }
  return [Math.atan2(m[5], m[4]), ey, 0];
};

const CLIP_DURATIONS: Readonly<Record<string, number>> = {
  run: 0.68,
  idle: 1.6,
  jump: 0.9,
  slide: 0.75,
  punch: 0.48,
  jab: 0.44,
  sword: 0.46,
  block: 0.6,
  cast: 0.62,
  throw: 0.5,
  hit: 0.42,
  death: 0.72
};

interface PoseAngles {
  lift: number;
  bodyPitch: number;
  bodyYaw: number;
  headPitch: number;
  legLPitch: number;
  legRPitch: number;
  armLPitch: number;
  armRPitch: number;
  armLSplay: number;
  armRSplay: number;
}

function sampleClipAngles(clip: string, t: number, duration: number): PoseAngles {
  const u = duration > 0 ? (t / duration) % 1 : 0;
  const ph = u * Math.PI * 2;
  const s = Math.sin(ph);
  const c = Math.cos(ph);

  switch (clip) {
    case "idle":
      return {
        lift: 0.025 * Math.sin(ph),
        bodyPitch: 0.08,
        bodyYaw: 0.06 * s,
        headPitch: -0.04,
        legLPitch: 0.08,
        legRPitch: -0.08,
        armLPitch: 0.22 + 0.06 * s,
        armRPitch: -0.18 - 0.06 * s,
        armLSplay: 0.16,
        armRSplay: -0.16
      };
    case "jump":
      return {
        lift: 0.10,
        bodyPitch: 0.22,
        bodyYaw: 0,
        headPitch: -0.14,
        legLPitch: -0.68,
        legRPitch: 0.36,
        armLPitch: -0.85,
        armRPitch: -0.55,
        armLSplay: 0.28,
        armRSplay: -0.28
      };
    case "slide":
      return {
        lift: -0.34,
        bodyPitch: -0.78,
        bodyYaw: 0.14,
        headPitch: 0.58,
        legLPitch: -1.12,
        legRPitch: -0.82,
        armLPitch: 0.62,
        armRPitch: 0.45,
        armLSplay: 0.32,
        armRSplay: -0.32
      };
    case "sword":
    case "punch":
    case "jab":
    case "throw": {
      const swing = Math.sin(Math.min(1, u * 1.25) * Math.PI);
      return {
        lift: 0.03 * swing,
        bodyPitch: 0.26 + 0.18 * swing,
        bodyYaw: -0.42 * swing,
        headPitch: -0.15,
        legLPitch: -0.45,
        legRPitch: 0.42,
        armLPitch: 0.55,
        armRPitch: -1.48 * swing - 0.35,
        armLSplay: 0.28,
        armRSplay: -0.22
      };
    }
    case "cast":
    case "block": {
      const surge = Math.sin(Math.min(1, u * 1.15) * Math.PI);
      return {
        lift: 0.05 * surge,
        bodyPitch: 0.12,
        bodyYaw: 0.22 * surge,
        headPitch: -0.08,
        legLPitch: -0.24,
        legRPitch: 0.24,
        armLPitch: -1.35 * surge - 0.45,
        armRPitch: -0.65 * surge - 0.15,
        armLSplay: 0.22,
        armRSplay: -0.24
      };
    }
    case "hit": {
      const recoil = Math.sin(Math.min(1, u) * Math.PI);
      return {
        lift: -0.05 * recoil,
        bodyPitch: -0.42 * recoil,
        bodyYaw: 0.25 * recoil,
        headPitch: -0.28 * recoil,
        legLPitch: 0.22,
        legRPitch: -0.18,
        armLPitch: -0.55 * recoil,
        armRPitch: -0.55 * recoil,
        armLSplay: 0.42,
        armRSplay: -0.42
      };
    }
    case "death": {
      const fall = Math.min(1, u * 1.15);
      return {
        lift: -0.48 * fall,
        bodyPitch: -1.25 * fall,
        bodyYaw: 0.35 * fall,
        headPitch: -0.35 * fall,
        legLPitch: 0.52 * fall,
        legRPitch: 0.28 * fall,
        armLPitch: -0.95 * fall,
        armRPitch: -0.82 * fall,
        armLSplay: 0.55 * fall,
        armRSplay: -0.55 * fall
      };
    }
    case "run":
    default:
      // Forward shinobi sprint (`+Z` forward: negative `rx` swings limb forward toward `+Z` when extending `-Y`? Wait:
      // `rx(a)` maps `[0, -1, 0]` to `[0, -cos(a), sin(a)]` -> positive `a` swings `-Y` limb FORWARD toward `+Z`!)
      return {
        lift: 0.055 * Math.abs(c),
        bodyPitch: 0.34,
        bodyYaw: 0.18 * s,
        headPitch: -0.24,
        legLPitch: 0.92 * s,
        legRPitch: -0.92 * s,
        armLPitch: -0.82 * s + 0.18,
        armRPitch: 0.82 * s + 0.18,
        armLSplay: 0.18,
        armRSplay: -0.18
      };
  }
}

function lerpAngles(a: PoseAngles, b: PoseAngles, k: number): PoseAngles {
  const l = (x: number, y: number) => x + (y - x) * k;
  return {
    lift: l(a.lift, b.lift),
    bodyPitch: l(a.bodyPitch, b.bodyPitch),
    bodyYaw: l(a.bodyYaw, b.bodyYaw),
    headPitch: l(a.headPitch, b.headPitch),
    legLPitch: l(a.legLPitch, b.legLPitch),
    legRPitch: l(a.legRPitch, b.legRPitch),
    armLPitch: l(a.armLPitch, b.armLPitch),
    armRPitch: l(a.armRPitch, b.armRPitch),
    armLSplay: l(a.armLSplay, b.armLSplay),
    armRSplay: l(a.armRSplay, b.armRSplay)
  };
}

function buildPoseFromAngles(a: PoseAngles, id: CharacterId): ProceduralLimbPose {
  const wide = id === "brute" ? 1.22 : 1.0;
  // Note: `rx(+pitch)` tilts `+Y` torso forward toward `+Z` (`rx(p) * [0, 1, 0] = [0, cos(p), -sin(p)]` -> wait:
  // `rx(p)` column 1 is `[0, cos(p), sin(p)]`? In `rx` above: `apply3(rx(p), [0, 1, 0]) = [0, c, -s]`!
  // So `rx(-bodyPitch)` tilts `+Y` torso forward toward `+Z`, and `rx(+limbPitch)` swings `-Y` limb forward toward `+Z`!)
  const bodyRot: V3 = [-a.bodyPitch, a.bodyYaw, 0];
  const Rbody = eulerZYX(bodyRot);
  const bodyPos: V3 = [0, 0.86 + a.lift, 0];

  const neckLocal: V3 = [0, 0.56, 0];
  const headPos = add3(bodyPos, apply3(Rbody, neckLocal));
  const headRot: V3 = [-(a.bodyPitch + a.headPitch), a.bodyYaw * 0.5, 0];

  const hipLPos = add3(bodyPos, apply3(Rbody, [0.115 * wide, -0.14, 0]));
  const hipRPos = add3(bodyPos, apply3(Rbody, [-0.115 * wide, -0.14, 0]));
  const legLRot: V3 = [a.legLPitch, a.bodyYaw * 0.3, 0];
  const legRRot: V3 = [a.legRPitch, a.bodyYaw * 0.3, 0];

  const shLPos = add3(bodyPos, apply3(Rbody, [0.235 * wide, 0.42, 0]));
  const shRPos = add3(bodyPos, apply3(Rbody, [-0.235 * wide, 0.42, 0]));
  // Negate `armPitch` sign mapping so `sword`/`cast` negative values swing `-Y` arm forward (`+rx` swings `-Y` to `+Z`)
  const armLRot: V3 = [-a.armLPitch, a.bodyYaw * 0.6, a.armLSplay];
  const armRRot: V3 = [-a.armRPitch, a.bodyYaw * 0.6, a.armRSplay];
  const RarmL = eulerZYX(armLRot);
  const RarmR = eulerZYX(armRRot);

  const spine02 = add3(bodyPos, apply3(Rbody, [0, 0.46, -0.12]));
  const spine01 = add3(bodyPos, apply3(Rbody, [0, 0.26, -0.08]));
  const foreL = add3(shLPos, apply3(RarmL, [0, -0.30, 0.02]));
  const handL = add3(shLPos, apply3(RarmL, [0, -0.57, 0.08]));
  const foreR = add3(shRPos, apply3(RarmR, [0, -0.30, 0.02]));
  const handR = add3(shRPos, apply3(RarmR, [0, -0.57, 0.08]));

  return {
    bodyPos,
    bodyRot,
    headPos,
    headRot,
    legLPos: hipLPos,
    legLRot,
    legRPos: hipRPos,
    legRRot,
    armLPos: shLPos,
    armLRot,
    armRPos: shRPos,
    armRRot,
    joints: {
      Spine02: spine02,
      Spine01: spine01,
      Spine: bodyPos,
      LeftForeArm: foreL,
      LeftHand: handL,
      RightForeArm: foreR,
      RightHand: handR
    }
  };
}

/* ------------------------------------------------------------------ Actor Slot Adapter */

export interface ProceduralNinjaActor extends TypedGLBActor {
  readonly __pose: () => ProceduralLimbPose;
}

const SKELETON_JOINTS = ["Spine", "Spine01", "Spine02", "LeftForeArm", "LeftHand", "RightForeArm", "RightHand"] as const;

function createProceduralNinjaSlot(id: CharacterId, clips: readonly string[]): ProceduralNinjaActor {
  let activeClip = clips[0] ?? "run";
  let activeTime = 0;
  let activeRate = 1;
  let prevAngles: PoseAngles | null = null;
  let fadeLeft = 0;
  let fadeTotal = 0;
  let currentPose = buildPoseFromAngles(sampleClipAngles(activeClip, 0, CLIP_DURATIONS[activeClip] ?? 1), id);

  const jointMatrices = new Map<string, Float32Array>(
    SKELETON_JOINTS.map((j) => {
      const m = new Float32Array(16);
      m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
      return [j, m];
    })
  );

  const syncJoints = (): void => {
    for (const name of SKELETON_JOINTS) {
      const m = jointMatrices.get(name)!;
      const p = currentPose.joints[name] ?? [0, 1, 0];
      m[12] = p[0];
      m[13] = p[1];
      m[14] = p[2];
    }
  };
  syncJoints();

  const recompute = (): void => {
    const dur = CLIP_DURATIONS[activeClip] ?? 1;
    let next = sampleClipAngles(activeClip, activeTime, dur);
    if (prevAngles && fadeLeft > 0 && fadeTotal > 0) {
      const k = 1 - fadeLeft / fadeTotal;
      next = lerpAngles(prevAngles, next, Math.max(0, Math.min(1, k)));
    }
    currentPose = buildPoseFromAngles(next, id);
    syncJoints();
  };

  const sceneStub = {
    updateWorldTransforms() {
      syncJoints();
    },
    findByName(name: string) {
      const m = jointMatrices.get(name);
      return m ? [{ transform: { worldMatrix: m } }] : [];
    }
  };

  const actor = {
    __pose: () => currentPose,
    evidence: { clips: [...clips] },
    animation: {
      resolvedClipInfos: () => clips.map((name) => ({ name, duration: CLIP_DURATIONS[name] ?? 1 })),
      skeletonJointNames: () => [...SKELETON_JOINTS]
    },
    pipeline: {
      resources: {
        scene: sceneStub
      }
    },
    playClip(clip: string, t: number) {
      activeClip = clip;
      activeTime = t;
      fadeLeft = 0;
      prevAngles = null;
      recompute();
    },
    crossFadeTo(clip: string, fadeSeconds: number, opts?: { speed?: number }) {
      const dur = CLIP_DURATIONS[activeClip] ?? 1;
      prevAngles = sampleClipAngles(activeClip, activeTime, dur);
      activeClip = clip;
      activeTime = 0;
      activeRate = opts?.speed ?? 1;
      fadeTotal = Math.max(0.01, fadeSeconds);
      fadeLeft = fadeTotal;
      recompute();
    },
    advance(dt: number) {
      const dur = CLIP_DURATIONS[activeClip] ?? 1;
      activeTime = (activeTime + dt * activeRate) % dur;
      if (fadeLeft > 0) fadeLeft = Math.max(0, fadeLeft - dt);
      recompute();
    },
    setTint() {
      /* multi-material procedural meshes carry authored PBR materials per character archetype */
    },
    setMaterialOverrides() {
      /* multi-material procedural meshes carry authored PBR materials per character archetype */
    },
    collectRenderItems() {
      return [];
    }
  };

  return actor as unknown as ProceduralNinjaActor;
}

export function createProceduralActorAssets(
  onProgress?: (done: number, total: number, id: CharacterId) => void,
  mode: LookMode = "original"
) {
  const slotModels = mode === "evening" ? EVENING_SLOT_MODEL : SLOT_MODEL;
  const baseClips = ["run", "jump", "idle", "slide", "punch", "jab", "sword", "block", "hit", "death"] as const;
  const clipsFor = (id: CharacterId): readonly string[] =>
    id === "caster"
      ? ["idle", "run", "cast", "hit", "death"]
      : id === "scout"
        ? ["idle", "run", "throw", "hit", "death"]
        : baseClips;

  const order: CharacterId[] = mode === "evening" ? ["hero", "soldier", "brute", "sage", "caster", "scout"] : ["hero", "soldier", "brute", "sage"];
  order.forEach((id, idx) => onProgress?.(idx + 1, order.length, id));

  const actors = slotModels.map((id) => createProceduralNinjaSlot(id, clipsFor(id)));
  const slotClips = actors.map((a) => a.evidence.clips);
  const slotDurations = slotModels.map((id) => {
    const d: Record<string, number> = {};
    for (const c of clipsFor(id)) d[c] = CLIP_DURATIONS[c] ?? 1;
    return d;
  });

  return {
    actors,
    clip: "run",
    clipDuration: CLIP_DURATIONS.run!,
    slotDurations,
    slotClips,
    slotModels,
    sharedTextureEntries: order.length,
    sharedTextureRefs: slotModels.length,
    clips: [...baseClips],
    dispose: () => {}
  };
}

/**
 * Applies a posed procedural actor's 6 articulated multi-material scene nodes (`actor-${slot}-${part}`)
 * in world space given the slot's root `[x, y, z]`, `yaw`, and `scale`.
 */
export function syncProceduralActorSceneNodes(
  node: (id: string) => ReturnType<AuraApp["nodes"]["require"]>,
  slot: number,
  actor: TypedGLBActor,
  show: boolean,
  wx = 0,
  wy = -500,
  wz = 0,
  yaw = 0,
  scale = 1
): void {
  const poseFn = (actor as Partial<ProceduralNinjaActor>).__pose;
  if (!poseFn) return;
  if (!show) {
    for (const part of PROCEDURAL_PART_KEYS) node(`actor-${slot}-${part}`).setVisible(false);
    return;
  }
  const pose = poseFn();
  const Rroot = ry(yaw);
  const placePart = (part: ProceduralPartKey, localPos: V3, localRot: V3): void => {
    const h = node(`actor-${slot}-${part}`);
    const wp = apply3(Rroot, [localPos[0] * scale, localPos[1] * scale, localPos[2] * scale]);
    const Rworld = mul3(Rroot, eulerZYX(localRot));
    const e = matrixToEulerXYZ(Rworld);
    h.setVisible(true);
    h.setPosition(wx + wp[0], wy + wp[1], wz + wp[2]);
    h.setRotation(e[0], e[1], e[2]);
    h.setScale(scale);
  };
  placePart("body", pose.bodyPos, pose.bodyRot);
  placePart("head", pose.headPos, pose.headRot);
  placePart("legL", pose.legLPos, pose.legLRot);
  placePart("legR", pose.legRPos, pose.legRRot);
  placePart("armL", pose.armLPos, pose.armLRot);
  placePart("armR", pose.armRPos, pose.armRRot);
}
