/**
 * Articulated multi-material `@aura3d/engine` Sengoku character rigs for Shadowstep Gauntlet (`examples/ninja-runner-port`).
 *
 * World-class sculpted `@aura3d/engine` character archetypes (`hero` Midnight Indigo/Crimson Shinobi,
 * `sage` Jade/Gold Mystic Scroll Master, `ember` Obsidian/Vermilion Kunoichi, `clone` Spirit-Phantom,
 * `soldier` Ashigaru Samurai, `brute` Armored Oni Kanabo Juggernaut, `caster` Crimson Onmyoji Sorcerer
 * with horned eboshi & floating talisman rings, `scout` Swift Kitsune-Mask Assassin) built as 6 articulated
 * scene nodes (`body`, `head`, `legL`, `legR`, `armL`, `armR`) using `sculptStylizedHeadMesh`,
 * `sculptAnatomicalLimbMesh`, 18-24 radial anatomical & pleated garment `loftSectionsMesh` surfaces,
 * `subdivideSmoothMesh`, preserved `COLOR_0` vertex colors, `bakeMeshCavityAO(..., 0.26)`, and
 * distinct matte fabric (`roughness: 0.84`) vs satin skin (`roughness: 0.54`) vs gunmetal/lacquered armor
 * (`roughness: 0.28`) while preserving every skeleton joint (`Spine`, `Spine01`, `Spine02`, `RightForeArm`,
 * `RightHand`, `LeftForeArm`, `LeftHand`).
 */
import { geometry, group, material, type AuraApp, type AuraMaterialSpec, type AuraNodeBuilder, type AuraSceneNode, type TypedGLBActor } from "@aura3d/engine";
import {
  bakeMeshCavityAO,
  bevelBoxMesh,
  catmullRomSpline3,
  cross3,
  extrudePolygonMesh,
  icosphereSmoothMesh,
  latheMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  norm3,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptStylizedHeadMesh,
  sub3,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import type { LookMode } from "../districtLook";
import { EVENING_SLOT_MODEL, SLOT_MODEL, type CharacterId } from "../models";
import { mergeColoredRawMeshes, paintVerticalGradient } from "./proceduralModels";

export const PROCEDURAL_PART_KEYS = ["body", "head", "legL", "legR", "armL", "armR"] as const;
export type ProceduralPartKey = (typeof PROCEDURAL_PART_KEYS)[number];
export type ActorVisualVariant = "std" | "clone" | "ember";

type AnatomicalStation = Parameters<typeof sculptAnatomicalLimbMesh>[0][number];

const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/* ------------------------------------------------------------------ Palette & Lit Vertex-Color PBR Materials */

/** Matte woven shinobi `shozoku` gi & Heian silk (`roughness: 0.84`, zero plastic clearcoat). */
const MAT_ACTOR_SHINOBI_BODY = unnamed(material.pbr({
  color: "#ffffff",
  roughness: 0.84,
  metallic: 0.04,
  sheen: 0.36,
  sheenColor: "#6d7fa3",
  sheenRoughness: 0.54,
  clearcoat: 0
}));

/** Natural warm satin skin for sculpted faces, brows, hands, and Oni musculature (`roughness: 0.54`). */
const MAT_ACTOR_SATIN_SKIN = unnamed(material.pbr({
  color: "#ffffff",
  roughness: 0.54,
  metallic: 0.0,
  sheen: 0.24,
  sheenColor: "#f0bfa4",
  sheenRoughness: 0.62,
  clearcoat: 0
}));

/** Urushi-lacquered samurai / shinobi / Oni armor plates & gunmetal steel (`roughness: 0.28`). */
const MAT_ACTOR_HEAVY_ARMOR = unnamed(material.lacquer({
  color: "#ffffff",
  roughness: 0.28,
  metallic: 0.34,
  clearcoat: 0.62,
  clearcoatRoughness: 0.14
}));

/** Matte obsidian-vermilion woven kunoichi gi for `ember` (`roughness: 0.84`). */
const MAT_EMBER_FABRIC = unnamed(material.pbr({
  color: "#ffffff",
  emissive: "#ff4814",
  emissiveIntensity: 0.24,
  practical: true,
  roughness: 0.84,
  metallic: 0.05,
  sheen: 0.38,
  sheenColor: "#ff7a42",
  sheenRoughness: 0.52,
  clearcoat: 0
}));

/** Blazing vermilion-lacquered kunoichi armor for `ember`. */
const MAT_EMBER_ARMOR = unnamed(material.lacquer({
  color: "#ffffff",
  emissive: "#ff4814",
  emissiveIntensity: 0.38,
  practical: true,
  roughness: 0.28,
  metallic: 0.34,
  clearcoat: 0.62,
  clearcoatRoughness: 0.14
}));

/** Translucent spirit-blue shadow-echo hologram material for `clone`. */
const MAT_CLONE_HOLOGRAM = unnamed(material.physical({
  color: "#ffffff",
  emissive: "#24a2ff",
  emissiveIntensity: 0.74,
  practical: true,
  roughness: 0.22,
  metallic: 0.16,
  opacity: 0.72,
  clearcoat: 0.64,
  clearcoatRoughness: 0.14,
  sheen: 0.72,
  sheenColor: "#a8edff",
  sheenRoughness: 0.34
}));

const MAT_SPIRIT_CYAN_EYE = unnamed(material.emissive({ color: "#9af8ff", emissive: "#3ce2ff", emissiveIntensity: 2.2, practical: true }));
const MAT_SPIRIT_VIOLET_EYE = unnamed(material.emissive({ color: "#ebb5ff", emissive: "#c063ff", emissiveIntensity: 2.2, practical: true }));
const MAT_SPIRIT_AMBER_EYE = unnamed(material.emissive({ color: "#ffe388", emissive: "#ffa429", emissiveIntensity: 2.3, practical: true }));
const MAT_SPIRIT_CRIMSON_EYE = unnamed(material.emissive({ color: "#ffa25c", emissive: "#ff3c14", emissiveIntensity: 2.5, practical: true }));

interface RigColors {
  readonly cloth: string;
  readonly clothDark: string;
  readonly underCloth: string;
  readonly armor: string;
  readonly armorDark: string;
  readonly accent: string;
  readonly accentBright: string;
  readonly gold: string;
  readonly steel: string;
  readonly wrap: string;
  readonly wrapShade: string;
  readonly boot: string;
  readonly mask: string;
  readonly skin: string;
  readonly skinShade: string;
  readonly brow: string;
  readonly hair: string;
  readonly hairTip: string;
  readonly scabbard: string;
  readonly eyeMat: AuraMaterialSpec;
  readonly baseMat: AuraMaterialSpec;
  readonly clothMat: AuraMaterialSpec;
  readonly skinMat: AuraMaterialSpec;
  readonly armorMat: AuraMaterialSpec;
}

function colorsForSlot(id: CharacterId, variant: ActorVisualVariant): RigColors {
  if (variant === "clone") {
    return {
      cloth: "#1f68d6",
      clothDark: "#113d8c",
      underCloth: "#3588f5",
      armor: "#2c8cf5",
      armorDark: "#1650a8",
      accent: "#7cecff",
      accentBright: "#c8f8ff",
      gold: "#c79eff",
      steel: "#cffafe",
      wrap: "#b8f4ff",
      wrapShade: "#6fd8fa",
      boot: "#10326e",
      mask: "#174fa8",
      skin: "#90e2ff",
      skinShade: "#5ac2f0",
      brow: "#123b82",
      hair: "#2474e8",
      hairTip: "#9ef3ff",
      scabbard: "#164899",
      eyeMat: MAT_SPIRIT_CYAN_EYE,
      baseMat: MAT_CLONE_HOLOGRAM,
      clothMat: MAT_CLONE_HOLOGRAM,
      skinMat: MAT_CLONE_HOLOGRAM,
      armorMat: MAT_CLONE_HOLOGRAM
    };
  }
  if (variant === "ember") {
    // Obsidian & Blazing Vermilion Kunoichi / Demon-Ember Shinobi
    return {
      cloth: "#181220",
      clothDark: "#0b0811",
      underCloth: "#36151c",
      armor: "#a81b16",
      armorDark: "#520d0c",
      accent: "#eb3817",
      accentBright: "#ff7e1f",
      gold: "#ffc03d",
      steel: "#e6dad4",
      wrap: "#ead4c0",
      wrapShade: "#b8967c",
      boot: "#140e1a",
      mask: "#191120",
      skin: "#e5ab87",
      skinShade: "#be805e",
      brow: "#24111a",
      hair: "#1e0f18",
      hairTip: "#ff5c1a",
      scabbard: "#7a1310",
      eyeMat: MAT_SPIRIT_CRIMSON_EYE,
      baseMat: MAT_EMBER_FABRIC,
      clothMat: MAT_EMBER_FABRIC,
      skinMat: MAT_ACTOR_SATIN_SKIN,
      armorMat: MAT_EMBER_ARMOR
    };
  }
  switch (id) {
    case "hero":
      // Sleek Midnight-Navy Shinobi with Warm Burnt-Orange Sculpted Hood/Cowl, Flowing Scarf & Waist Sash
      return {
        cloth: "#1c2642",
        clothDark: "#0e1528",
        underCloth: "#2a385c",
        armor: "#212e4e",
        armorDark: "#121b32",
        accent: "#e26a1b",
        accentBright: "#f6882c",
        gold: "#efc14e",
        steel: "#dde7f6",
        wrap: "#efe5d2",
        wrapShade: "#c8baa2",
        boot: "#131b2e",
        mask: "#151f38",
        skin: "#e4ac86",
        skinShade: "#be8360",
        brow: "#161f36",
        hair: "#162038",
        hairTip: "#2c3f6b",
        scabbard: "#1a233b",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY,
        clothMat: MAT_ACTOR_SHINOBI_BODY,
        skinMat: MAT_ACTOR_SATIN_SKIN,
        armorMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "sage":
      // Jade & Imperial Gold Mystic Scroll Master
      return {
        cloth: "#18614b",
        clothDark: "#0c382a",
        underCloth: "#f2ead8",
        armor: "#237a5f",
        armorDark: "#114736",
        accent: "#f2c13e",
        accentBright: "#ffe070",
        gold: "#f7c948",
        steel: "#e4edf8",
        wrap: "#faf2e1",
        wrapShade: "#d9ccb2",
        boot: "#122b23",
        mask: "#124737",
        skin: "#e6b08c",
        skinShade: "#c08764",
        brow: "#e8e0cf",
        hair: "#f4eee0",
        hairTip: "#ffd46b",
        scabbard: "#134d3b",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY,
        clothMat: MAT_ACTOR_SHINOBI_BODY,
        skinMat: MAT_ACTOR_SATIN_SKIN,
        armorMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "soldier":
      // Ashigaru Samurai (Iron-Slate & Urushi Crimson)
      return {
        cloth: "#1c364c",
        clothDark: "#102130",
        underCloth: "#2d4c66",
        armor: "#ba211e",
        armorDark: "#691110",
        accent: "#e33922",
        accentBright: "#ff782b",
        gold: "#efc14c",
        steel: "#cfdbea",
        wrap: "#e4dccb",
        wrapShade: "#bab09b",
        boot: "#181f2c",
        mask: "#242936",
        skin: "#dfa680",
        skinShade: "#b87d5a",
        brow: "#1c202b",
        hair: "#1a202c",
        hairTip: "#a8221b",
        scabbard: "#202534",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_HEAVY_ARMOR,
        clothMat: MAT_ACTOR_SHINOBI_BODY,
        skinMat: MAT_ACTOR_SATIN_SKIN,
        armorMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "brute":
      // Armored Oni Kanabo Juggernaut
      return {
        cloth: "#1d1626",
        clothDark: "#100c16",
        underCloth: "#38181e",
        armor: "#991717",
        armorDark: "#4f0b0b",
        accent: "#de3220",
        accentBright: "#ff6b22",
        gold: "#f0be49",
        steel: "#bcc7d8",
        wrap: "#c42820",
        wrapShade: "#801511",
        boot: "#16111d",
        mask: "#a61919",
        skin: "#bf4f3e",
        skinShade: "#8c3124",
        brow: "#f0e8d6",
        hair: "#f2ead9",
        hairTip: "#c9baa0",
        scabbard: "#1a1521",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_HEAVY_ARMOR,
        clothMat: MAT_ACTOR_SHINOBI_BODY,
        skinMat: MAT_ACTOR_SATIN_SKIN,
        armorMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "caster":
      // Crimson Onmyoji Sorcerer (Imperial Crimson & Obsidian Court Robes + Gold Talisman Rings)
      return {
        cloth: "#9c1b24",
        clothDark: "#4f0b11",
        underCloth: "#1c1428",
        armor: "#241934",
        armorDark: "#120c1c",
        accent: "#e3302b",
        accentBright: "#ff6647",
        gold: "#f2c44e",
        steel: "#d8e2f2",
        wrap: "#faf3e6",
        wrapShade: "#d4c8b4",
        boot: "#171222",
        mask: "#faf3e8",
        skin: "#ead0bc",
        skinShade: "#c4a188",
        brow: "#1c1426",
        hair: "#171122",
        hairTip: "#781822",
        scabbard: "#361018",
        eyeMat: MAT_SPIRIT_VIOLET_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY,
        clothMat: MAT_ACTOR_SHINOBI_BODY,
        skinMat: MAT_ACTOR_SATIN_SKIN,
        armorMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "scout":
      // Swift Kitsune-Mask Assassin (Night-Raid Charcoal Gi + Crimson Silk + Porcelain Fox Mask)
      return {
        cloth: "#202536",
        clothDark: "#111420",
        underCloth: "#323952",
        armor: "#272e42",
        armorDark: "#151926",
        accent: "#cc2620",
        accentBright: "#f24a26",
        gold: "#ebb948",
        steel: "#d8e3f4",
        wrap: "#eee5d4",
        wrapShade: "#c4b8a2",
        boot: "#151926",
        mask: "#faf3e6",
        skin: "#e2ab86",
        skinShade: "#bc825e",
        brow: "#1b2030",
        hair: "#1a1f2e",
        hairTip: "#d93224",
        scabbard: "#202638",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY,
        clothMat: MAT_ACTOR_SHINOBI_BODY,
        skinMat: MAT_ACTOR_SATIN_SKIN,
        armorMat: MAT_ACTOR_HEAVY_ARMOR
      };
  }
}

function tinted(mesh: RawMesh, hex: string): RawMesh {
  return paintMeshColors(mesh, hex);
}

/** Exact X-axis bilateral reflection (`-x`, `-nx`, reversed triangle winding) guaranteeing 100% mirror symmetry on `R` vs `L` limbs. */
function mirrorMeshX(src: RawMesh): RawMesh {
  const positions = src.positions.slice();
  const normals = src.normals.slice();
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = -positions[i]!;
    normals[i] = -normals[i]!;
  }
  const indices = src.indices.slice();
  for (let i = 0; i < indices.length; i += 3) {
    const b = indices[i + 1]!;
    indices[i + 1] = indices[i + 2]!;
    indices[i + 2] = b;
  }
  return {
    positions,
    normals,
    uvs: src.uvs.slice(),
    indices,
    ...(src.colors ? { colors: src.colors.slice() } : {})
  };
}

interface OrientedLimbStation {
  readonly pos: V3;
  readonly rx: number;
  readonly rz: number;
  readonly pleatDepth?: number;
}

/**
 * Twist-free 3D parallel-transported anatomical & garment loft (`18..24` radial points)
 * for bent biceps, forearms, fingers, tails, horns, and pleated sleeves/hakama.
 */
function sculptOrientedLimbMesh(
  stations: readonly OrientedLimbStation[],
  ringPoints = 20,
  capEnds = true,
  pleatCount = 0
): RawMesh {
  const n = stations.length;
  if (n < 2) return { positions: [], normals: [], uvs: [], indices: [] };
  const ringPts = Math.max(10, Math.floor(ringPoints));

  const tangents: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = stations[Math.max(0, i - 1)]!.pos;
    const next = stations[Math.min(n - 1, i + 1)]!.pos;
    tangents.push(norm3(sub3(next, prev)));
  }

  const normalsA: V3[] = [];
  const binormalsB: V3[] = [];
  const t0 = tangents[0]!;
  const ref: V3 = Math.abs(t0[0]) < 0.82 ? [1, 0, 0] : [0, 0, 1];
  const b0 = norm3(cross3(t0, ref));
  const n0 = norm3(cross3(b0, t0));
  normalsA.push(n0);
  binormalsB.push(b0);

  for (let i = 1; i < n; i += 1) {
    const ti = tangents[i]!;
    const prevN = normalsA[i - 1]!;
    const dotTN = prevN[0] * ti[0] + prevN[1] * ti[1] + prevN[2] * ti[2];
    let ni: V3 = [prevN[0] - ti[0] * dotTN, prevN[1] - ti[1] * dotTN, prevN[2] - ti[2] * dotTN];
    const len = Math.hypot(ni[0], ni[1], ni[2]);
    ni = len > 1e-5 ? [ni[0] / len, ni[1] / len, ni[2] / len] : normalsA[i - 1]!;
    const bi = norm3(cross3(ti, ni));
    normalsA.push(ni);
    binormalsB.push(bi);
  }

  const rings: V3[][] = [];
  const pushRing = (center: V3, na: V3, nb: V3, rx: number, rz: number, pleat = 0): void => {
    const ring: V3[] = [];
    for (let k = 0; k < ringPts; k += 1) {
      const a = (k / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const fold = pleatCount > 0 && pleat > 0 ? 1 + pleat * Math.cos(a * pleatCount) : 1;
      const u = Math.sign(ca) * Math.pow(Math.abs(ca), 0.9) * rx * fold;
      const v = Math.sign(sa) * Math.pow(Math.abs(sa), 0.92) * rz * fold;
      ring.push([
        center[0] + na[0] * u + nb[0] * v,
        center[1] + na[1] * u + nb[1] * v,
        center[2] + na[2] * u + nb[2] * v
      ]);
    }
    rings.push(ring);
  };

  if (capEnds) {
    const s0 = stations[0]!;
    const dir = tangents[0]!;
    const span = (s0.rx + s0.rz) * 0.28;
    pushRing(
      [s0.pos[0] - dir[0] * span, s0.pos[1] - dir[1] * span, s0.pos[2] - dir[2] * span],
      normalsA[0]!,
      binormalsB[0]!,
      s0.rx * 0.42,
      s0.rz * 0.42,
      0
    );
  }

  for (let i = 0; i < n; i += 1) {
    const st = stations[i]!;
    pushRing(st.pos, normalsA[i]!, binormalsB[i]!, st.rx, st.rz, st.pleatDepth ?? 0);
  }

  if (capEnds) {
    const sn = stations[n - 1]!;
    const dir = tangents[n - 1]!;
    const span = (sn.rx + sn.rz) * 0.28;
    pushRing(
      [sn.pos[0] + dir[0] * span, sn.pos[1] + dir[1] * span, sn.pos[2] + dir[2] * span],
      normalsA[n - 1]!,
      binormalsB[n - 1]!,
      sn.rx * 0.42,
      sn.rz * 0.42,
      0
    );
  }

  return taubinSmoothMesh(loftSectionsMesh(rings, true, false), 2);
}

/** Curved lofted silk ribbon with central pleat ridge & organic width/thickness taper (scarves, sashes, ofuda streamers). */
function sculptedRibbonMesh(spinePts: readonly V3[], halfWidth: number, thickness: number, taper = 0.62, twist = 0.45): RawMesh {
  const sampled = catmullRomSpline3(spinePts, 3, false);
  const sections: V3[][] = [];
  for (let i = 0; i < sampled.length; i += 1) {
    const p = sampled[i]!;
    const u = i / Math.max(1, sampled.length - 1);
    const w = Math.max(0.004, halfWidth * (1 - u * taper));
    const th = Math.max(0.002, thickness * (1 - u * 0.52));
    const wave = Math.sin(u * Math.PI * 2.2) * th * 0.65;
    const ang = u * twist;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ring: readonly [number, number][] = [
      [-w, wave * 0.3],
      [-w * 0.5, th + wave],
      [0, th * 0.72 + wave],
      [w * 0.5, th + wave],
      [w, wave * 0.3],
      [w * 0.5, -th + wave],
      [0, -th * 0.72 + wave],
      [-w * 0.5, -th + wave]
    ];
    sections.push(ring.map(([rx, ry]) => [
      p[0] + rx * ca - ry * sa,
      p[1] + rx * sa + ry * ca,
      p[2]
    ]));
  }
  return taubinSmoothMesh(loftSectionsMesh(sections, false, false), 2);
}

/** Smoothly curved anatomical armor plate (`sode`, `kusazuri`, `munaita`, `suneate`, `kote`). */
function curvedArmorPlateMesh(width: number, height: number, archDepth: number, thickness = 0.022, smooth = 0, cols = 7): RawMesh {
  const hw = width * 0.5;
  const topRow: V3[] = [];
  const botRow: V3[] = [];
  for (let i = 0; i < cols; i += 1) {
    const u = (i / (cols - 1)) * 2 - 1;
    const zCurve = (1 - u * u) * archDepth;
    topRow.push([u * hw * 0.88, height * 0.5, zCurve]);
    botRow.push([u * hw * 1.06, -height * 0.5, zCurve * 1.12 + 0.014]);
  }
  const makeSection = (row: readonly V3[]): V3[] => [
    ...row,
    ...[...row].reverse().map((p): V3 => [p[0], p[1], p[2] - thickness])
  ];
  const base = loftSectionsMesh([makeSection(botRow), makeSection(topRow)], true, false);
  return taubinSmoothMesh(smooth > 0 ? subdivideSmoothMesh(base, smooth, 0.42) : base, 2);
}

/** Open-interior contoured cord/sash band (avoids hidden solid disc caps buried inside limbs/torso). */
function cordBandMesh(radius: number, halfHeight: number, bulge = 0.005, segments = 16): RawMesh {
  const rIn = Math.max(0.004, radius - 0.012);
  return latheMesh(
    [
      [rIn, -halfHeight],
      [radius, -halfHeight * 0.55],
      [radius + bulge, 0],
      [radius, halfHeight * 0.55],
      [rIn, halfHeight]
    ],
    segments
  );
}

/** Sculpted steel throwing kunai (pommel ring + cord-wrapped grip + diamond leaf blade). */
function buildKunaiMesh(scale = 1): RawMesh {
  const blade = loftSectionsMesh(
    [
      [[0, 0.015 * scale, 0.006 * scale], [0.008 * scale, 0.015 * scale, 0], [0, 0.015 * scale, -0.006 * scale], [-0.008 * scale, 0.015 * scale, 0]],
      [[0, 0.055 * scale, 0.011 * scale], [0.021 * scale, 0.055 * scale, 0], [0, 0.055 * scale, -0.011 * scale], [-0.021 * scale, 0.055 * scale, 0]],
      [[0, 0.145 * scale, 0.004 * scale], [0.006 * scale, 0.145 * scale, 0], [0, 0.145 * scale, -0.004 * scale], [-0.006 * scale, 0.145 * scale, 0]],
      [[0, 0.175 * scale, 0.001 * scale], [0.0015 * scale, 0.175 * scale, 0], [0, 0.175 * scale, -0.001 * scale], [-0.0015 * scale, 0.175 * scale, 0]]
    ],
    true,
    false
  );
  const handle = latheMesh(
    [[0, -0.045 * scale], [0.007 * scale, -0.042 * scale], [0.008 * scale, 0.016 * scale], [0, 0.018 * scale]],
    12
  );
  const ring = transformMesh(
    latheMesh([[0.010 * scale, -0.004 * scale], [0.018 * scale, -0.004 * scale], [0.018 * scale, 0.004 * scale], [0.010 * scale, 0.004 * scale]], 14),
    { pos: [0, -0.058 * scale, 0], rot: [Math.PI * 0.5, 0, 0] }
  );
  return mergeColoredRawMeshes([blade, handle, ring]);
}

/** Multi-material bucketed part output so cloth (`0.84`), satin skin (`0.54`), and armor (`0.28`) shade distinctly. */
interface PartMaterialBuckets {
  readonly cloth: RawMesh[];
  readonly skin: RawMesh[];
  readonly armor: RawMesh[];
}

/* ------------------------------------------------------------------ 1. Sculpted Sengoku Torso & Gear (`body`, `+Z` forward, `+Y` up) */

function buildBodyMesh(id: CharacterId, c: RigColors, variant: ActorVisualVariant): RawMesh {
  const wide = id === "brute" ? 1.26 : id === "caster" ? 1.06 : 1.0;
  const isFemale = variant === "ember";
  const pieces: RawMesh[] = [];

  // 1. Draped V-tapered `shozoku` / `kariginu` torso sculpted via `sculptDrapedGarmentMesh` + `taubinSmoothMesh`
  const mainTorso = subdivideSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.155, rx: 0.178 * wide, rz: 0.126 * wide, z: -0.006, folds: 6, foldAmp: 0.018 },
        { y: -0.06, rx: 0.186 * wide, rz: 0.132 * wide, z: 0.0, folds: 7, foldAmp: 0.024 },
        { y: 0.055, rx: (isFemale ? 0.158 : 0.172) * wide, rz: 0.124 * wide, z: 0.004, folds: 7, foldAmp: 0.028 },
        { y: 0.18, rx: (isFemale ? 0.192 : 0.208) * wide, rz: (isFemale ? 0.148 : 0.146) * wide, z: 0.012, folds: 6, foldAmp: 0.02 },
        { y: 0.32, rx: (isFemale ? 0.218 : 0.242) * wide, rz: (isFemale ? 0.164 : 0.162) * wide, z: 0.016, folds: 6, foldAmp: 0.014 },
        { y: 0.44, rx: (isFemale ? 0.236 : 0.262) * wide, rz: 0.152 * wide, z: 0.006, folds: 5, foldAmp: 0.01 },
        { y: 0.535, rx: 0.175 * wide, rz: 0.118 * wide, z: 0.0, folds: 4, foldAmp: 0.006 },
        { y: 0.58, rx: 0.102 * wide, rz: 0.088 * wide, z: 0.0, folds: 0, foldAmp: 0 }
      ],
      { ringPoints: 18, capEnds: true, smoothPasses: 4 }
    ),
    1,
    0.46
  );
  pieces.push(paintVerticalGradient(mainTorso, c.clothDark, c.cloth, 0.06));

  // Inner `juban` crossover undershirt collar peeking at the throat (`+Z`)
  for (const sx of [-1, 1] as const) {
    const innerCollar = sculptedOrientedStrap(
      [
        [sx * 0.085, 0.565, 0.055],
        [sx * 0.048, 0.44, 0.138],
        [-sx * 0.018, 0.31, 0.156]
      ],
      0.026,
      0.012
    );
    pieces.push(tinted(innerCollar, c.underCloth));
  }

  // Seamless rounded trapezius / shoulder-socket cuffs bridging torso into `armL` / `armR` (`[±0.238 * wide, 0.425, 0]`)
  for (const sx of [-1, 1] as const) {
    const socketCuff = sculptOrientedLimbMesh(
      [
        { pos: [sx * 0.165 * wide, 0.455, 0], rx: 0.085 * wide, rz: 0.095 * wide },
        { pos: [sx * 0.228 * wide, 0.432, 0], rx: 0.092 * wide, rz: 0.098 * wide, pleatDepth: 0.04 },
        { pos: [sx * 0.258 * wide, 0.415, 0], rx: 0.082 * wide, rz: 0.088 * wide }
      ],
      18,
      false,
      6
    );
    pieces.push(paintVerticalGradient(socketCuff, c.clothDark, c.cloth, 0.04));
  }

  // 2. Bifurcated pleated `hakama` hip-saddle & split breeches base (ZERO conical lampshade!)
  for (const sx of [-1, 1] as const) {
    const hipBreech = sculptOrientedLimbMesh(
      [
        { pos: [sx * 0.086 * wide, 0.045, 0], rx: 0.112 * wide, rz: 0.118 * wide, pleatDepth: 0.045 },
        { pos: [sx * 0.108 * wide, -0.065, 0.004], rx: 0.124 * wide, rz: 0.128 * wide, pleatDepth: 0.065 },
        { pos: [sx * 0.118 * wide, -0.175, 0.008], rx: 0.118 * wide, rz: 0.122 * wide, pleatDepth: 0.055 }
      ],
      18,
      false,
      7
    );
    pieces.push(paintVerticalGradient(hipBreech, c.clothDark, id === "caster" ? c.underCloth : c.cloth, 0.06));
  }

  // Authentic stiffened trapezoidal `koshi-ita` samurai/shinobi back waist-plate (`-Z` silhouette anchor)
  const koshiIta = curvedArmorPlateMesh(0.22 * wide, 0.11, 0.026, 0.02, 0);
  pieces.push(tinted(transformMesh(koshiIta, { pos: [0, 0.085, -0.142 * wide], rot: [0.16, Math.PI, 0] }), c.armorDark));

  // 3. Archetype-specific armor, robes, pouches, scarves, scrolls, talismans & weapons
  if (id === "soldier" || id === "brute") {
    // Sculpted 18-point urushi-lacquered `do` cuirass wrapping chest & back with V-tapered pectoral ridge
    const doRings: V3[][] = [];
    const doRows: readonly [number, number, number][] = [
      [0.065, 0.195 * wide, 0.142 * wide],
      [0.165, 0.218 * wide, 0.156 * wide],
      [0.295, 0.246 * wide, 0.172 * wide],
      [0.415, 0.258 * wide, 0.162 * wide],
      [0.495, 0.184 * wide, 0.124 * wide]
    ];
    for (const [ry, rxR, rzR] of doRows) {
      const ring: V3[] = [];
      for (let i = 0; i < 18; i += 1) {
        const a = (i / 18) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const keel = sa > 0.3 ? 0.016 * Math.pow(sa, 2) : 0;
        ring.push([
          Math.sign(ca) * Math.pow(Math.abs(ca), 0.88) * rxR,
          ry,
          Math.sign(sa) * Math.pow(Math.abs(sa), 0.9) * rzR + keel
        ]);
      }
      doRings.push(ring);
    }
    const doCuirass = subdivideSmoothMesh(loftSectionsMesh(doRings, true, false), 1, 0.45);
    pieces.push(paintVerticalGradient(doCuirass, c.armorDark, c.armor, 0.06));

    // Horizontal gold `odoshi` silk-lacing tiers across the `do`
    for (const ry of [0.145, 0.245, 0.345, 0.43]) {
      const band = transformMesh(cordBandMesh(0.254 * wide, 0.011, 0.006, 18), { pos: [0, ry, 0.005], scale: [1.01, 1.0, 0.68] });
      pieces.push(tinted(band, c.gold));
    }

    // 6 articulated curved `kusazuri` hip tasset plates (split cleanly at front/back/sides, zero cone!)
    const tassetAngles = [-2.55, -1.62, -0.62, 0.62, 1.62, 2.55];
    for (const ang of tassetAngles) {
      const tx = Math.sin(ang) * 0.215 * wide;
      const tz = Math.cos(ang) * 0.158 * wide;
      const plateW = (id === "brute" ? 0.195 : 0.165) * wide;
      for (let lame = 0; lame < 3; lame += 1) {
        const ly = -0.045 - lame * 0.068;
        const flare = 1 + lame * 0.065;
        const lameMesh = transformMesh(curvedArmorPlateMesh(plateW * flare, 0.072, 0.028, 0.018, 0, 5), {
          pos: [tx * flare, ly, tz * flare],
          rot: [-0.22 - lame * 0.05, ang, 0]
        });
        pieces.push(tinted(lameMesh, lame === 2 ? c.gold : c.armor));
      }
    }

    if (id === "brute") {
      // Oni Kanabo Juggernaut: thick twisted crimson-and-ivory `shimenawa` sacred waist rope + white zig-zag `shide` paper streamers + crossed `nio-dasuki` back cords + golden chest boss studs
      const shimenawa = sculptOrientedLimbMesh(
        Array.from({ length: 13 }, (_, k) => {
          const a = (k / 12) * Math.PI * 2;
          const twistR = 0.052 + 0.012 * Math.sin(k * 2.1);
          return {
            pos: [Math.sin(a) * 0.252 * wide, 0.048 + 0.01 * Math.cos(a * 4), Math.cos(a) * 0.185 * wide],
            rx: twistR,
            rz: twistR
          };
        }),
        14,
        false
      );
      pieces.push(paintVerticalGradient(shimenawa, c.wrapShade, c.accent, 0.05));

      // 4 crisp white folded `shide` sacred lightning paper streamers hanging from the `shimenawa`
      for (const ang of [-2.2, -0.85, 0.85, 2.2]) {
        const shidePoly: V2[] = [
          [-0.022, 0], [0.022, 0], [0.032, -0.06], [0.005, -0.065],
          [0.028, -0.13], [-0.005, -0.135], [0.018, -0.195], [-0.018, -0.195],
          [-0.028, -0.12], [-0.004, -0.115], [-0.03, -0.055]
        ];
        const shide = transformMesh(extrudePolygonMesh(shidePoly, 0.008, 0.002, false), {
          pos: [Math.sin(ang) * 0.265 * wide, 0.03, Math.cos(ang) * 0.195 * wide],
          rot: [-0.14, ang, 0]
        });
        pieces.push(tinted(shide, "#faf4e8"));
      }

      // Crossed crimson `nio-dasuki` war-cords across back & shoulders + massive back knot
      for (const sx of [-1, 1] as const) {
        const cord = tubeSweepMesh(
          [
            [sx * 0.21 * wide, 0.49, 0.08, 0.028],
            [sx * 0.14 * wide, 0.36, -0.18 * wide, 0.032],
            [-sx * 0.15 * wide, 0.14, -0.175 * wide, 0.03]
          ],
          10,
          false
        );
        pieces.push(tinted(cord, c.accentBright));
      }
      // Golden demon-boss rivets on chest plate
      for (const bx of [-0.11, 0, 0.11]) {
        const stud = transformMesh(icosphereSmoothMesh(0.024, 1, 0.01, 3), { pos: [bx * wide, 0.34, 0.185 * wide] });
        pieces.push(tinted(stud, c.gold));
      }
    } else {
      // Ashigaru Samurai (`soldier`): woven indigo/gold `obi` + ornamental `agemaki` tassel bow on back `do` + waist `uchigatana` scabbard!
      const obi = transformMesh(cordBandMesh(0.232 * wide, 0.046, 0.012, 20), { pos: [0, 0.045, 0], scale: [1.01, 1.0, 0.72] });
      pieces.push(paintVerticalGradient(obi, c.clothDark, c.gold, 0.04));

      // Crimson `agemaki` butterfly cord knot on upper back of `do`
      for (const sx of [-1, 1] as const) {
        const loop = tubeSweepMesh(
          [
            [0, 0.37, -0.172, 0.014],
            [sx * 0.075, 0.41, -0.195, 0.016],
            [sx * 0.055, 0.34, -0.198, 0.015],
            [0, 0.36, -0.172, 0.013],
            [sx * 0.048, 0.22, -0.205, 0.01]
          ],
          8,
          false
        );
        pieces.push(tinted(loop, c.accentBright));
      }

      // Hip-slung Ashigaru `uchigatana` curved scabbard (`saya`) on left hip
      const sayaPts = catmullRomSpline3(
        [[-0.225, 0.14, 0.18], [-0.245, 0.02, -0.08], [-0.26, -0.12, -0.44]],
        4,
        false
      ).map((p, idx, arr): V4 => [p[0], p[1], p[2], 0.024 * (1 - (idx / Math.max(1, arr.length - 1)) * 0.25)]);
      pieces.push(tinted(transformMesh(tubeSweepMesh(sayaPts, 10, false), { scale: [0.76, 1.0, 1.08] }), c.scabbard));
      pieces.push(tinted(transformMesh(latheMesh([[0, -0.01], [0.052, -0.01], [0.052, 0.01], [0, 0.01]], 14), { pos: [-0.22, 0.16, 0.21], rot: [1.15, 0, 0.12] }), c.gold));
      pieces.push(tinted(tubeSweepMesh([[-0.22, 0.17, 0.22, 0.02], [-0.205, 0.25, 0.36, 0.018]], 10, false), c.clothDark));
    }
  } else if (id === "caster") {
    // Crimson Onmyoji Sorcerer: layered crimson & gold crossover `kariginu` court hunting-robe + gold brocade `kesa` stole + twin concentric floating golden ritual rings + 8 orbiting `ofuda` paper talismans!
    for (const sx of [-1, 1] as const) {
      const lapel = sculptedOrientedStrap(
        [
          [sx * 0.125, 0.555, 0.085],
          [sx * 0.072, 0.34, 0.178],
          [-sx * 0.02, 0.11, 0.172]
        ],
        0.038,
        0.014
      );
      pieces.push(tinted(lapel, c.gold));

      // Draped pleated crimson `kariginu` side coat-panels (split front & back so zero lampshade cone!)
      const panel = curvedArmorPlateMesh(0.21, 0.30, 0.042, 0.018, 0);
      pieces.push(paintVerticalGradient(
        transformMesh(panel, { pos: [sx * 0.185, -0.11, 0], rot: [0, sx * Math.PI * 0.5, -sx * 0.18] }),
        c.clothDark,
        c.cloth,
        0.06
      ));
    }

    // Front & back embroidered crimson-and-gold `kariginu` ceremonial panels (`ran`)
    for (const sz of [-1, 1] as const) {
      const ranPanel = curvedArmorPlateMesh(0.22, 0.27, 0.03, 0.016, 0);
      pieces.push(paintVerticalGradient(
        transformMesh(ranPanel, { pos: [0, -0.105, sz * 0.155], rot: [sz * -0.16, sz < 0 ? Math.PI : 0, 0] }),
        c.clothDark,
        c.cloth,
        0.05
      ));
      const goldHem = curvedArmorPlateMesh(0.226, 0.038, 0.032, 0.02, 0);
      pieces.push(tinted(
        transformMesh(goldHem, { pos: [0, -0.225, sz * 0.175], rot: [sz * -0.16, sz < 0 ? Math.PI : 0, 0] }),
        c.gold
      ));
    }

    // Ceremonial gold brocade `kesa` sash & knotted golden waist `obi`
    const stole = sculptedOrientedStrap(
      [
        [0.19, 0.51, -0.11],
        [0.195, 0.46, 0.125],
        [-0.06, 0.22, 0.185],
        [-0.205, 0.02, 0.065],
        [-0.14, 0.24, -0.168],
        [0.19, 0.51, -0.11]
      ],
      0.042,
      0.015
    );
    pieces.push(tinted(stole, c.gold));

    const obi = transformMesh(cordBandMesh(0.218 * wide, 0.054, 0.014, 20), { pos: [0, 0.055, 0], scale: [1.0, 1.0, 0.74] });
    pieces.push(paintVerticalGradient(obi, c.armorDark, c.gold, 0.04));

    // FLOATING TALISMAN RINGS: Concentric golden Onmyoji ritual ring + inner seal ring + 8 floating `ofuda` paper talismans behind shoulders!
    const outerRingPts = Array.from({ length: 19 }, (_, k): V4 => {
      const a = (k / 18) * Math.PI * 2;
      return [Math.cos(a) * 0.44, 0.44 + Math.sin(a) * 0.44, -0.22 - Math.sin(a) * 0.04, 0.013];
    });
    const innerRingPts = Array.from({ length: 15 }, (_, k): V4 => {
      const a = (k / 14) * Math.PI * 2;
      return [Math.cos(a) * 0.30, 0.44 + Math.sin(a) * 0.30, -0.20 - Math.sin(a) * 0.03, 0.009];
    });
    pieces.push(tinted(tubeSweepMesh(outerRingPts, 8, false), c.gold));
    pieces.push(tinted(tubeSweepMesh(innerRingPts, 8, false), c.accentBright));

    for (let t = 0; t < 8; t += 1) {
      const a = (t / 8) * Math.PI * 2 + 0.2;
      const rxT = Math.cos(a) * 0.44;
      const ryT = 0.44 + Math.sin(a) * 0.44;
      const rzT = -0.23 - Math.sin(a) * 0.04;
      const ofudaCard = transformMesh(curvedArmorPlateMesh(0.058, 0.145, 0.01, 0.006, 0, 4), {
        pos: [rxT, ryT, rzT],
        rot: [0.12, 0, a - Math.PI * 0.5]
      });
      const ofudaSigil = transformMesh(curvedArmorPlateMesh(0.022, 0.095, 0.011, 0.008, 0, 3), {
        pos: [rxT, ryT, rzT + 0.002],
        rot: [0.12, 0, a - Math.PI * 0.5]
      });
      pieces.push(tinted(ofudaCard, c.wrap));
      pieces.push(tinted(ofudaSigil, c.accent));
    }
  } else {
    // Playable Shinobi (`hero`, `sage`, `ember`, `clone`) & Swift Kitsune-Mask Assassin (`scout`):
    // V-tapered layered chest & back shinobi armor plates (`munaita`) over matte crossover `shozoku` gi!
    for (const sz of [1, -1] as const) {
      for (let tier = 0; tier < 3; tier += 1) {
        const wPlate = (0.28 - tier * 0.032) * wide * (isFemale ? 0.92 : 1.0);
        const yPlate = 0.40 - tier * 0.088;
        const plate = transformMesh(curvedArmorPlateMesh(wPlate, 0.086, 0.036, 0.018, 0), {
          pos: [0, yPlate, sz * (0.146 - tier * 0.008)],
          rot: [sz * 0.12, sz < 0 ? Math.PI : 0, 0]
        });
        pieces.push(paintVerticalGradient(plate, c.armorDark, c.armor, 0.04));
      }
    }

    // Layered crossover `shozoku` V-lapels on BOTH chest (`+Z`) and upper back (`-Z`)
    for (const sx of [-1, 1] as const) {
      const frontLapel = sculptedOrientedStrap(
        [
          [sx * 0.132, 0.545, 0.082],
          [sx * 0.074, 0.345, 0.175],
          [-sx * 0.022, 0.135, 0.168]
        ],
        0.032,
        0.014
      );
      const backLapel = sculptedOrientedStrap(
        [
          [sx * 0.135, 0.535, -0.085],
          [sx * 0.095, 0.30, -0.165],
          [sx * 0.065, 0.11, -0.155]
        ],
        0.028,
        0.012
      );
      pieces.push(tinted(frontLapel, c.accentBright));
      pieces.push(tinted(backLapel, c.accent));
    }

    // 4 split articulated shinobi hip `kusazuri` / `shozoku` side-panels with accent border (leaves center front/back bifurcated!)
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const ang = Math.atan2(sx * 0.82, sz * 0.58);
        const flap = transformMesh(curvedArmorPlateMesh(0.165 * wide, 0.195, 0.028, 0.016, 0), {
          pos: [sx * 0.185 * wide, -0.095, sz * 0.112 * wide],
          rot: [-0.20, ang, 0]
        });
        const trim = transformMesh(curvedArmorPlateMesh(0.17 * wide, 0.032, 0.03, 0.02, 0), {
          pos: [sx * 0.198 * wide, -0.178, sz * 0.122 * wide],
          rot: [-0.20, ang, 0]
        });
        pieces.push(paintVerticalGradient(flap, c.clothDark, c.armor, 0.04));
        pieces.push(tinted(trim, c.accentBright));
      }
    }

    // Diagonal leather/silk sword & kunai baldric across chest and back with brass O-ring clasps
    const baldricPts: V3[] = [
      [-0.175, 0.505, -0.132],
      [-0.015, 0.31, -0.182],
      [0.165, 0.10, -0.145],
      [0.212, 0.085, 0.015],
      [0.142, 0.165, 0.172],
      [-0.035, 0.345, 0.182],
      [-0.18, 0.505, 0.082],
      [-0.175, 0.505, -0.132]
    ];
    pieces.push(tinted(sculptedOrientedStrap(baldricPts, 0.032, 0.013), id === "scout" ? c.clothDark : c.accent));
    for (const [cx, cy, cz] of [[-0.015, 0.31, -0.186], [-0.035, 0.345, 0.186]] as const) {
      pieces.push(tinted(transformMesh(
        latheMesh([[0.022, -0.01], [0.042, -0.01], [0.042, 0.01], [0.022, 0.01]], 14),
        { pos: [cx, cy, cz], rot: [Math.PI * 0.5, 0, 0] }
      ), c.gold));
    }

    // Wrapped pleated silk `obi` sash + kunai utility pouches + holstered steel kunai belt!
    const obi = transformMesh(cordBandMesh(0.208 * wide, 0.056, 0.014, 20), { pos: [0, 0.048, 0], scale: [1.0, 1.0, 0.75] });
    pieces.push(paintVerticalGradient(obi, c.accent, c.accentBright, 0.05));
    pieces.push(tinted(transformMesh(curvedArmorPlateMesh(0.082, 0.056, 0.018, 0.018, 0), { pos: [0, 0.048, 0.172] }), c.gold));

    // Molded leather shinobi tool pouches on right/left waist + holstered steel kunai!
    for (const sx of [-1, 1] as const) {
      const pouch = transformMesh(bevelBoxMesh(0.068, 0.088, 0.052, 0.022), {
        pos: [sx * 0.195 * wide, 0.042, 0.058],
        rot: [0, sx * 0.42, -sx * 0.08]
      });
      pieces.push(tinted(pouch, c.armorDark));
      const kunai = transformMesh(buildKunaiMesh(0.82), {
        pos: [sx * 0.155 * wide, 0.055, 0.145],
        rot: [0.12, sx * 0.25, -sx * 0.48]
      });
      pieces.push(tinted(kunai, c.steel));
    }

    // Kitsune Scout (`scout`): 3 gleaming steel throwing kunai holstered across chest bandolier + twin reverse-grip back `tanto` sheaths!
    if (id === "scout") {
      for (let k = -1; k <= 1; k += 1) {
        const chestKunai = transformMesh(buildKunaiMesh(0.92), {
          pos: [-0.025 + k * 0.058, 0.285 - k * 0.052, 0.188],
          rot: [0.1, 0, -0.64]
        });
        pieces.push(tinted(chestKunai, c.steel));
      }
      for (const sx of [-1, 1] as const) {
        const tanto = tubeSweepMesh(
          [
            [sx * 0.15, 0.11, -0.165, 0.02],
            [0, 0.08, -0.185, 0.018],
            [-sx * 0.16, 0.05, -0.168, 0.012]
          ],
          10,
          false
        );
        pieces.push(tinted(tanto, c.scabbard));
      }
    } else {
      // Sculpted back `obi` knot + twin trailing waist sash tails (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
      const obiKnot = taubinSmoothMesh(
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.125, 0.082, 0.068, 0.026), { pos: [0, 0.052, -0.175] }),
          1,
          0.52
        ),
        3
      );
      pieces.push(tinted(obiKnot, c.accentBright));
      for (const side of [-1, 1] as const) {
        const sashTail = taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [side * 0.038, 0.042, -0.182],
            mid: [side * 0.095, -0.095, -0.245],
            tip: [side * 0.138, -0.255, -0.305],
            width: 0.082,
            thickness: 0.024,
            segments: 8,
            radialSegments: 12
          }),
          2
        );
        pieces.push(paintVerticalGradient(sashTail, c.accentBright, c.accent, 0.04));
      }

      // Sculpted draped burnt-orange/spirit-cyan `erimaki` cowl/collar (`sculptDrapedGarmentMesh`) + wind-swept scarf tails (`sculptCurvedHairLockMesh`)!
      const scarfCollar = sculptDrapedGarmentMesh(
        [
          { y: 0.455, rx: 0.225 * wide, rz: 0.168 * wide, z: 0.008, folds: 7, foldAmp: 0.045 },
          { y: 0.505, rx: 0.198 * wide, rz: 0.158 * wide, z: 0.004, folds: 7, foldAmp: 0.04 },
          { y: 0.555, rx: 0.168 * wide, rz: 0.146 * wide, z: -0.004, folds: 6, foldAmp: 0.032 },
          { y: 0.592, rx: 0.142 * wide, rz: 0.132 * wide, z: -0.008, folds: 5, foldAmp: 0.02 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 4 }
      );
      pieces.push(paintVerticalGradient(scarfCollar, c.accent, c.accentBright, 0.05));

      for (const side of [-1, 1] as const) {
        const scarfTail = taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [side * 0.068, 0.525, -0.142],
            mid: [side * 0.165, 0.435, -0.465],
            tip: [side * 0.195, 0.305, -0.855],
            width: variant === "ember" ? 0.148 : 0.132,
            thickness: 0.034,
            segments: 9,
            radialSegments: 12
          }),
          3
        );
        pieces.push(paintVerticalGradient(scarfTail, c.accentBright, c.accent, 0.06));
      }

      // Detailed curved katana scabbard (`saya`) + golden `koiguchi`/`kurikata`/`kojiri` + engraved `tsuba` + diamond-wrapped `tsuka` hilt!
      const sayaSpine = catmullRomSpline3(
        [
          [-0.145, 0.535, -0.195],
          [0.022, 0.275, -0.208],
          [0.218, -0.025, -0.182]
        ],
        4,
        false
      ).map((p, idx, arr): V4 => [p[0], p[1], p[2], 0.028 * (1 - (idx / Math.max(1, arr.length - 1)) * 0.26)]);
      pieces.push(tinted(transformMesh(taubinSmoothMesh(tubeSweepMesh(sayaSpine, 12, true), 2), { scale: [0.74, 1.0, 1.14] }), c.scabbard));
      pieces.push(tinted(transformMesh(
        taubinSmoothMesh(latheMesh([[0, -0.014], [0.066, -0.014], [0.066, 0.014], [0, 0.014]], 16), 2),
        { pos: [-0.155, 0.555, -0.196], rot: [0.08, 0, -0.56] }
      ), c.gold));
      pieces.push(tinted(taubinSmoothMesh(tubeSweepMesh([[-0.16, 0.565, -0.196, 0.023], [-0.282, 0.748, -0.208, 0.021]], 12, true), 2), c.accent));
      pieces.push(tinted(transformMesh(icosphereSmoothMesh(0.025, 1, 0.01, 5), { pos: [-0.292, 0.762, -0.21] }), c.gold));

      // SAGE (`sage` in `std` variant): Giant ornate Jade & Imperial Gold Mystic Heaven-Scroll Cylinder strapped across back!
      if (id === "sage" && variant === "std") {
        const scrollBody = transformMesh(
          latheMesh(
            [
              [0, -0.26], [0.068, -0.255], [0.072, -0.18], [0.068, 0],
              [0.072, 0.18], [0.068, 0.255], [0, 0.26]
            ],
            14
          ),
          { pos: [0.02, 0.36, -0.248], rot: [0.08, 0.12, 1.24] }
        );
        pieces.push(paintVerticalGradient(scrollBody, c.clothDark, c.wrap, 0.05));
        for (const endS of [-1, 1] as const) {
          const cap = transformMesh(
            latheMesh([[0.052, -0.028], [0.078, -0.024], [0.078, 0.016], [0.034, 0.022], [0.034, 0.065], [0, 0.068]], 12),
            {
              pos: [0.02 + endS * 0.245, 0.36 - endS * 0.085, -0.248 - endS * 0.03],
              rot: [0.08, 0.12, 1.24 + (endS < 0 ? Math.PI : 0)]
            }
          );
          pieces.push(tinted(cap, c.gold));
        }
        const scrollBand = transformMesh(cordBandMesh(0.075, 0.024, 0.004, 14), { pos: [0.02, 0.36, -0.248], rot: [0.08, 0.12, 1.24] });
        pieces.push(tinted(scrollBand, c.gold));
      }
    }
  }

  return bakeMeshCavityAO(mergeColoredRawMeshes(pieces), 0.26);
}

/** Helper for flat bevelled leather/silk straps swept along 3D curves (`baldric`, `lapel`, `stole`). */
function sculptedOrientedStrap(spinePts: readonly V3[], halfW: number, halfThick: number): RawMesh {
  const sampled = catmullRomSpline3(spinePts, 3, false);
  const n = sampled.length;
  const sections: V3[][] = [];
  for (let i = 0; i < n; i += 1) {
    const p = sampled[i]!;
    const prev = sampled[Math.max(0, i - 1)]!;
    const next = sampled[Math.min(n - 1, i + 1)]!;
    const tang = norm3(sub3(next, prev));
    const radialOut = norm3([p[0], p[1] * 0.15, p[2]]);
    const side = norm3(cross3(tang, radialOut));
    const outN = norm3(cross3(side, tang));
    const ring: readonly [number, number][] = [
      [-halfW, 0],
      [-halfW * 0.72, halfThick],
      [halfW * 0.72, halfThick],
      [halfW, 0],
      [halfW * 0.72, -halfThick],
      [-halfW * 0.72, -halfThick]
    ];
    sections.push(ring.map(([u, v]) => [
      p[0] + side[0] * u + outN[0] * v,
      p[1] + side[1] * u + outN[1] * v,
      p[2] + side[2] * u + outN[2] * v
    ]));
  }
  return loftSectionsMesh(sections, false, false);
}

/* ------------------------------------------------------------------ 2. Sculpted Heads, Faces, Masks & Crests (`head`, `+Z` forward) */

interface HeadMaterialParts {
  readonly main: RawMesh;
  readonly skin: RawMesh;
  readonly armor: RawMesh;
  readonly eyes: RawMesh;
}

function buildHeadParts(id: CharacterId, c: RigColors, variant: ActorVisualVariant): HeadMaterialParts {
  const clothPieces: RawMesh[] = [];
  const skinPieces: RawMesh[] = [];
  const armorPieces: RawMesh[] = [];
  const eyePieces: RawMesh[] = [];

  // 1. 18-point anatomical muscular neck (`y = -0.025 .. 0.105`) + sculpted stylized 3D head (`subdivisions: 2` + `taubinSmoothMesh`)
  const neckStations: AnatomicalStation[] = [
    { pos: [0, -0.025, -0.008], rx: 0.076, rz: 0.078 },
    { pos: [0, 0.035, -0.004], rx: 0.068, rz: 0.071 },
    { pos: [0, 0.098, 0.002], rx: 0.072, rz: 0.074 }
  ];
  skinPieces.push(
    paintVerticalGradient(
      taubinSmoothMesh(sculptAnatomicalLimbMesh(neckStations, { ringPoints: 18, capEnds: false }), 3),
      c.skinShade,
      c.skin,
      0.04
    )
  );

  const headRadius = id === "brute" ? 0.158 : 0.146;
  const sculptedSkull = transformMesh(
    taubinSmoothMesh(
      sculptStylizedHeadMesh(headRadius, {
        jawTaper: id === "brute" ? 0.12 : variant === "ember" ? 0.30 : 0.24,
        cheekFullness: id === "brute" ? 0.16 : 0.10,
        noseBridge: id === "scout" ? 0.12 : 0.21,
        browRidge: id === "brute" ? 0.22 : 0.12,
        subdivisions: 2,
        seed: 19
      }),
      3
    ),
    { pos: [0, 0.188, 0.012] }
  );
  skinPieces.push(paintVerticalGradient(sculptedSkull, c.skinShade, c.skin, 0.05));

  // Sculpted human/Oni ears on unhooded characters (`soldier`, `brute`, `caster`, `ember`, `sage`)
  if (id === "soldier" || id === "brute" || id === "caster" || id === "sage" || variant === "ember") {
    for (const sx of [-1, 1] as const) {
      const ear = transformMesh(icosphereSmoothMesh(0.024, 1, 0.008, 2), {
        pos: [sx * (headRadius * 0.96), 0.184, 0.005],
        rot: [0.08, sx * 0.26, -sx * 0.08],
        scale: [0.46, 1.16, 0.76]
      });
      skinPieces.push(tinted(ear, c.skinShade));
    }
  }

  // Expressive almond eyes + dark upper-eyelid creases + fierce sculpted eyebrows (`mayu`)
  const eyeY = id === "brute" ? 0.204 : 0.196;
  const eyeZ = id === "scout" ? 0.172 : id === "brute" ? 0.158 : 0.148;
  const eyeX = id === "brute" ? 0.058 : 0.052;
  for (const sx of [-1, 1] as const) {
    const almondEye = sculptOrientedLimbMesh(
      [
        { pos: [sx * (eyeX - 0.024), eyeY - 0.003, eyeZ - 0.004], rx: 0.006, rz: 0.006 },
        { pos: [sx * eyeX, eyeY + 0.002, eyeZ + 0.005], rx: 0.012, rz: 0.010 },
        { pos: [sx * (eyeX + 0.026), eyeY + 0.007, eyeZ - 0.006], rx: 0.005, rz: 0.005 }
      ],
      12,
      true
    );
    eyePieces.push(almondEye);

    // Sculpted fierce angled eyebrow ridge (`mayu`) above each eye
    if (id !== "scout") {
      const browMesh = sculptOrientedLimbMesh(
        [
          { pos: [sx * (eyeX - 0.030), eyeY + 0.016, eyeZ + 0.004], rx: 0.009, rz: 0.009 },
          { pos: [sx * eyeX, eyeY + 0.025, eyeZ + 0.010], rx: 0.011, rz: 0.010 },
          { pos: [sx * (eyeX + 0.034), eyeY + 0.034, eyeZ - 0.005], rx: 0.006, rz: 0.006 }
        ],
        10,
        true
      );
      skinPieces.push(tinted(browMesh, c.brow));
    }
  }

  if (id === "soldier") {
    // ASHIGARU SAMURAI: Flared iron & crimson `jingasa` / `suji-kabuto` war-hat + 3-tier `shikoro` neck guard + golden crescent `maedate` + contoured iron `menpo` half-mask!
    const kabutoDome = subdivideSmoothMesh(
      latheMesh(
        [
          [0.245, 0.215],
          [0.202, 0.242],
          [0.168, 0.285],
          [0.122, 0.348],
          [0.048, 0.388],
          [0, 0.396]
        ],
        16
      ),
      1,
      0.46
    );
    armorPieces.push(paintVerticalGradient(kabutoDome, c.mask, c.armor, 0.05));

    // Golden rim & `tehen` crown ring on the `jingasa`/`kabuto`
    armorPieces.push(tinted(
      latheMesh([[0.236, 0.211], [0.252, 0.215], [0.244, 0.224], [0.228, 0.22]], 20),
      c.gold
    ));
    armorPieces.push(tinted(
      latheMesh([[0, 0.392], [0.052, 0.386], [0.052, 0.402], [0, 0.408]], 16),
      c.gold
    ));

    // 3-tier curved crimson-lacquered `shikoro` neck guard sweeping around sides & back
    for (let tier = 0; tier < 3; tier += 1) {
      const r = 0.172 + tier * 0.032;
      const y = 0.205 - tier * 0.046;
      const shikoroLame = buildArcPlateMesh(r, 0.048, 0.018, -Math.PI * 0.72, Math.PI * 0.72, 16);
      armorPieces.push(tinted(transformMesh(shikoroLame, { pos: [0, y, 0], rot: [0, Math.PI, 0] }), tier === 2 ? c.gold : c.armor));
    }

    // Contoured forged-iron `menpo` samurai war-mask (`subdivideSmoothMesh(..., 1)`) with sculpted nose-guard & chin cord
    const menpo = buildContouredHalfMaskMesh(0.118, 0.132, 0.156);
    armorPieces.push(paintVerticalGradient(menpo, "#171b24", c.mask, 0.04));

    // Gleaming golden crescent-moon `maedate` crest on forehead
    for (const sx of [-1, 1] as const) {
      const hornCrescent = sculptOrientedLimbMesh(
        [
          { pos: [0, 0.255, 0.185], rx: 0.018, rz: 0.010 },
          { pos: [sx * 0.088, 0.305, 0.195], rx: 0.022, rz: 0.009 },
          { pos: [sx * 0.155, 0.405, 0.175], rx: 0.012, rz: 0.006 },
          { pos: [sx * 0.178, 0.485, 0.148], rx: 0.004, rz: 0.003 }
        ],
        14,
        true
      );
      armorPieces.push(tinted(hornCrescent, c.gold));
    }
  } else if (id === "brute") {
    // ARMORED ONI KANABO JUGGERNAUT: Horned `suji-kabuto` + fanged scarlet Oni `menpo` jaw with 4 curved ivory tusks + twin ridged demon horns + wild white `aguma` yak-hair mane!
    const oniKabuto = subdivideSmoothMesh(
      latheMesh([[0.185, 0.22], [0.196, 0.285], [0.152, 0.368], [0.068, 0.415], [0, 0.425]], 16),
      1,
      0.48
    );
    armorPieces.push(paintVerticalGradient(oniKabuto, c.clothDark, c.armorDark, 0.05));

    // Flared scarlet `shikoro` neck plate
    for (let tier = 0; tier < 2; tier += 1) {
      const shikoro = buildArcPlateMesh(0.19 + tier * 0.035, 0.058, 0.022, -Math.PI * 0.72, Math.PI * 0.72, 16);
      armorPieces.push(tinted(transformMesh(shikoro, { pos: [0, 0.195 - tier * 0.055, 0], rot: [0, Math.PI, 0] }), c.armor));
    }

    // Wild white `aguma` yak-hair demon mane cascading down back & sides (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
    for (let m = -3; m <= 3; m += 1) {
      const ang = m * 0.34;
      const maneLock = taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [Math.sin(ang) * 0.152, 0.238, -Math.cos(ang) * 0.152],
          mid: [Math.sin(ang) * 0.205, 0.115, -Math.cos(ang) * 0.225],
          tip: [Math.sin(ang) * 0.238, -0.025, -Math.cos(ang) * 0.268],
          width: 0.084,
          thickness: 0.068,
          segments: 8,
          radialSegments: 12
        }),
        2
      );
      clothPieces.push(paintVerticalGradient(maneLock, c.hairTip, c.hair, 0.05));
    }

    // Sculpted fanged scarlet Oni `menpo` jaw guard + 4 curved ivory tusks (2 large upturned lower tusks + 2 upper canines)
    const oniJaw = buildContouredHalfMaskMesh(0.132, 0.138, 0.172);
    armorPieces.push(paintVerticalGradient(oniJaw, c.armorDark, c.mask, 0.05));
    for (const sx of [-1, 1] as const) {
      const lowerTusk = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.066, 0.095, 0.152], rx: 0.019, rz: 0.019 },
          { pos: [sx * 0.088, 0.138, 0.196], rx: 0.013, rz: 0.013 },
          { pos: [sx * 0.078, 0.188, 0.198], rx: 0.004, rz: 0.004 }
        ],
        12,
        true
      );
      const upperFang = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.042, 0.138, 0.165], rx: 0.012, rz: 0.012 },
          { pos: [sx * 0.046, 0.102, 0.178], rx: 0.004, rz: 0.004 }
        ],
        12,
        true
      );
      armorPieces.push(tinted(lowerTusk, "#faf3e3"));
      armorPieces.push(tinted(upperFang, "#faf3e3"));

      // Twin sweeping ridged Oni demon horns + golden `kuwagata` crest
      const oniHorn = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.082, 0.285, 0.128], rx: 0.040, rz: 0.038, pleatDepth: 0.09 },
          { pos: [sx * 0.175, 0.395, 0.148], rx: 0.028, rz: 0.026, pleatDepth: 0.08 },
          { pos: [sx * 0.245, 0.525, 0.105], rx: 0.015, rz: 0.014 },
          { pos: [sx * 0.225, 0.615, 0.045], rx: 0.005, rz: 0.005 }
        ],
        16,
        true,
        6
      );
      armorPieces.push(paintVerticalGradient(oniHorn, c.armorDark, c.gold, 0.06));
    }
  } else if (id === "caster") {
    // CRIMSON ONMYOJI SORCERER: Aristocratic face with vermilion cheek seals + tall Horned Black-Lacquer `Tate-Eboshi` Hat + golden pentagram crest!
    // Swept dark aristocratic side-hair locks framing the face & nape (`sculptCurvedHairLockMesh`)
    for (const sx of [-1, 1] as const) {
      const sideLock = taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [sx * 0.132, 0.228, 0.045],
          mid: [sx * 0.14, 0.128, 0.032],
          tip: [sx * 0.122, 0.032, 0.018],
          width: 0.054,
          thickness: 0.042,
          segments: 8,
          radialSegments: 12
        }),
        2
      );
      clothPieces.push(paintVerticalGradient(sideLock, c.hair, c.hairTip, 0.04));

      // Vermilion Onmyoji ritual cheek-seal markings on exposed aristocratic face
      const cheekSeal = transformMesh(curvedArmorPlateMesh(0.042, 0.014, 0.006, 0.005, 0, 4), {
        pos: [sx * 0.078, 0.152, 0.138],
        rot: [0, sx * 0.38, -sx * 0.24]
      });
      skinPieces.push(tinted(cheekSeal, c.accent));
    }

    // Tall pleated black-lacquer `tate-eboshi` court hat (`16`-point loft + `subdivideSmoothMesh`)
    const eboshi = subdivideSmoothMesh(
      sculptOrientedLimbMesh(
        [
          { pos: [0, 0.235, 0.005], rx: 0.148, rz: 0.156, pleatDepth: 0.04 },
          { pos: [0, 0.355, -0.008], rx: 0.132, rz: 0.148, pleatDepth: 0.06 },
          { pos: [0, 0.495, -0.025], rx: 0.104, rz: 0.132, pleatDepth: 0.06 },
          { pos: [0, 0.605, -0.042], rx: 0.052, rz: 0.095, pleatDepth: 0.04 }
        ],
        16,
        true,
        8
      ),
      1,
      0.46
    );
    armorPieces.push(paintVerticalGradient(eboshi, "#120d1c", "#2a1c3d", 0.05));

    // Golden headband crown & 5-pointed Onmyoji `Seiman` crest on the `eboshi`
    armorPieces.push(tinted(transformMesh(cordBandMesh(0.155, 0.018, 0.005, 18), { pos: [0, 0.245, 0.006] }), c.gold));
    armorPieces.push(tinted(
      transformMesh(latheMesh([[0, -0.01], [0.048, -0.01], [0.048, 0.01], [0, 0.01]], 14), { pos: [0, 0.365, 0.142], rot: [Math.PI * 0.5, 0, 0] }),
      c.gold
    ));

    // Twin curved obsidian-and-gold Onmyoji ritual horns flanking the `eboshi`!
    for (const sx of [-1, 1] as const) {
      const eboshiHorn = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.118, 0.275, 0.055], rx: 0.028, rz: 0.026 },
          { pos: [sx * 0.195, 0.385, 0.065], rx: 0.020, rz: 0.019 },
          { pos: [sx * 0.225, 0.515, 0.035], rx: 0.011, rz: 0.011 },
          { pos: [sx * 0.188, 0.605, 0.005], rx: 0.004, rz: 0.004 }
        ],
        14,
        true
      );
      armorPieces.push(paintVerticalGradient(eboshiHorn, "#181024", c.gold, 0.05));
    }
  } else if (id === "scout") {
    // SWIFT KITSUNE-MASK ASSASSIN: Fitted night-raid assassin hood + sculpted 3D Porcelain Kitsune Fox Mask (`subdivideSmoothMesh(..., 1)`) with tapered snout, vermilion eye-blaze markings & tall fox ears!
    const cowl = subdivideSmoothMesh(
      sculptOrientedLimbMesh(
        [
          { pos: [0, 0.04, -0.01], rx: 0.132, rz: 0.142, pleatDepth: 0.04 },
          { pos: [0, 0.175, -0.012], rx: 0.156, rz: 0.168, pleatDepth: 0.03 },
          { pos: [0, 0.295, -0.018], rx: 0.134, rz: 0.148, pleatDepth: 0.02 },
          { pos: [0, 0.348, -0.025], rx: 0.062, rz: 0.075 }
        ],
        16,
        false,
        6
      ),
      1,
      0.48
    );
    clothPieces.push(paintVerticalGradient(cowl, c.clothDark, c.cloth, 0.05));

    // Sculpted 3D Kitsune fox visage & tapered snout (`subdivideSmoothMesh(..., 1)`)
    const foxFace = subdivideSmoothMesh(
      sculptOrientedLimbMesh(
        [
          { pos: [0, 0.268, 0.088], rx: 0.106, rz: 0.058 },
          { pos: [0, 0.198, 0.108], rx: 0.118, rz: 0.068 },
          { pos: [0, 0.145, 0.145], rx: 0.082, rz: 0.064 },
          { pos: [0, 0.128, 0.205], rx: 0.042, rz: 0.040 },
          { pos: [0, 0.124, 0.252], rx: 0.018, rz: 0.018 }
        ],
        16,
        true
      ),
      1,
      0.48
    );
    armorPieces.push(tinted(foxFace, c.mask));
    armorPieces.push(tinted(transformMesh(icosphereSmoothMesh(0.018, 1, 0.005, 4), { pos: [0, 0.126, 0.258] }), "#151822"));

    // Vermilion Kitsune eye-blaze & cheek whisker war-paint + tall sculpted pointed fox ears!
    for (const sx of [-1, 1] as const) {
      const eyeBlaze = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.032, 0.205, 0.164], rx: 0.008, rz: 0.006 },
          { pos: [sx * 0.078, 0.228, 0.148], rx: 0.012, rz: 0.007 },
          { pos: [sx * 0.112, 0.262, 0.112], rx: 0.005, rz: 0.004 }
        ],
        12,
        true
      );
      const whiskerMark = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.038, 0.138, 0.195], rx: 0.006, rz: 0.005 },
          { pos: [sx * 0.084, 0.148, 0.148], rx: 0.008, rz: 0.005 }
        ],
        12,
        true
      );
      armorPieces.push(tinted(eyeBlaze, c.accent));
      armorPieces.push(tinted(whiskerMark, c.accent));

      const foxEar = subdivideSmoothMesh(
        sculptOrientedLimbMesh(
          [
            { pos: [sx * 0.084, 0.278, 0.072], rx: 0.044, rz: 0.026 },
            { pos: [sx * 0.104, 0.358, 0.068], rx: 0.030, rz: 0.018 },
            { pos: [sx * 0.116, 0.442, 0.062], rx: 0.008, rz: 0.006 }
          ],
          14,
          true
        ),
        1,
        0.44
      );
      const innerEar = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.084, 0.288, 0.086], rx: 0.025, rz: 0.012 },
          { pos: [sx * 0.106, 0.408, 0.074], rx: 0.007, rz: 0.005 }
        ],
        12,
        true
      );
      armorPieces.push(tinted(foxEar, c.mask));
      armorPieces.push(tinted(innerEar, c.accent));

      // Crimson mask cord tassels streaming behind head
      const cord = sculptedRibbonMesh(
        [
          [sx * 0.065, 0.195, -0.155],
          [sx * 0.125, 0.145, -0.285],
          [sx * 0.155, 0.085, -0.405]
        ],
        0.022,
        0.007,
        0.55,
        sx * 0.35
      );
      clothPieces.push(paintVerticalGradient(cord, c.accentBright, c.accent, 0.04));
    }
  } else {
    // PLAYABLE SHINOBI (`hero`, `sage`, `ember`, `clone`):
    // Fitted contoured shinobi half-mask (`menpo`), `hitai-ate` headband & forehead guard, and distinct archetype hair/crests!
    const shinobiMenpo = buildContouredHalfMaskMesh(0.112, 0.122, 0.156);
    armorPieces.push(paintVerticalGradient(shinobiMenpo, c.clothDark, c.mask, 0.05));

    // Wrapped silk `hitai-ate` headband around temples & occiput + back knot + twin trailing ribbons
    const headband = transformMesh(cordBandMesh(0.155, 0.024, 0.006, 22), {
      pos: [0, 0.244, 0.008],
      scale: [0.99, 1.0, 1.06]
    });
    clothPieces.push(tinted(headband, c.accentBright));
    armorPieces.push(tinted(
      transformMesh(curvedArmorPlateMesh(0.138, 0.046, 0.024, 0.012, 0), { pos: [0, 0.246, 0.156] }),
      id === "sage" || variant === "ember" ? c.gold : c.steel
    ));

    clothPieces.push(tinted(transformMesh(icosphereSmoothMesh(0.03, 1, 0.01, 7), { pos: [0, 0.238, -0.168] }), c.accentBright));
    for (const sx of [-1, 1] as const) {
      const tail = sculptedRibbonMesh(
        [
          [sx * 0.026, 0.232, -0.172],
          [sx * 0.092, 0.185, -0.305],
          [sx * 0.142, 0.118, -0.455]
        ],
        0.028,
        0.008,
        0.52,
        sx * 0.42
      );
      clothPieces.push(paintVerticalGradient(tail, c.accentBright, c.accent, 0.04));
    }

    if (variant === "ember") {
      // EMBER (Obsidian & Blazing Vermilion Kunoichi):
      // Swept obsidian crown hair + golden phoenix-flame wing crest (`maedate`) + high cascading vermilion-tipped kunoichi ponytail!
      const hairCap = taubinSmoothMesh(
        subdivideSmoothMesh(
          latheMesh([[0.125, 0.22], [0.152, 0.24], [0.146, 0.305], [0.092, 0.348], [0, 0.356]], 14),
          1,
          0.48
        ),
        3
      );
      clothPieces.push(paintVerticalGradient(hairCap, c.hair, c.cloth, 0.04));

      // Blazing vermilion & gold Phoenix-Flame Wing Crest framing her forehead
      for (const sx of [-1, 1] as const) {
        const flameWing = sculptOrientedLimbMesh(
          [
            { pos: [sx * 0.025, 0.262, 0.168], rx: 0.016, rz: 0.008 },
            { pos: [sx * 0.098, 0.325, 0.145], rx: 0.022, rz: 0.008 },
            { pos: [sx * 0.168, 0.415, 0.088], rx: 0.012, rz: 0.006 },
            { pos: [sx * 0.195, 0.485, 0.035], rx: 0.004, rz: 0.003 }
          ],
          14,
          true
        );
        armorPieces.push(paintVerticalGradient(flameWing, c.accent, c.gold, 0.05));
      }

      // Golden crown ponytail cuff + 5 curved kunoichi ponytail locks (`sculptCurvedHairLockMesh`) streaming behind!
      armorPieces.push(tinted(
        transformMesh(cordBandMesh(0.046, 0.022, 0.004, 16), {
          pos: [0, 0.352, -0.075],
          rot: [-0.55, 0, 0]
        }),
        c.gold
      ));
      const ponyOffsets: readonly [number, number, number][] = [
        [0, 0.04, 0],
        [-0.048, 0.02, -0.18],
        [0.048, 0.02, 0.18],
        [-0.032, -0.02, -0.10],
        [0.032, -0.02, 0.10]
      ];
      for (const [ox, oy, splay] of ponyOffsets) {
        const lock = taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [ox * 0.4, 0.365 + oy * 0.3, -0.095],
            mid: [ox * 1.1 + splay * 0.22, 0.355 + oy, -0.325],
            tip: [ox * 1.6 + splay * 0.42, 0.115 + oy, -0.575],
            width: 0.082,
            thickness: 0.064,
            segments: 10,
            radialSegments: 10
          }),
          2
        );
        clothPieces.push(paintVerticalGradient(lock, c.hair, c.hairTip, 0.06));
      }
    } else if (id === "sage" && variant === "std") {
      // SAGE (Jade & Imperial Gold Mystic Scroll Master):
      // Swept silver-ivory master hair + imperial jade-and-gold Sun-Scroll Crown Circlet + long curved master topknot!
      const sageHairCrown = taubinSmoothMesh(
        subdivideSmoothMesh(
          latheMesh([[0.125, 0.215], [0.154, 0.236], [0.148, 0.305], [0.095, 0.352], [0, 0.36]], 14),
          1,
          0.48
        ),
        3
      );
      clothPieces.push(paintVerticalGradient(sageHairCrown, c.wrapShade, c.hair, 0.04));

      // Ornate imperial gold Sun-Scroll Crown Halo & jade center medallion
      const crownHalo = transformMesh(
        latheMesh([[0.052, -0.009], [0.095, -0.009], [0.095, 0.009], [0.052, 0.009]], 18),
        { pos: [0, 0.348, 0.125], rot: [Math.PI * 0.5 - 0.14, 0, 0] }
      );
      armorPieces.push(tinted(crownHalo, c.gold));
      armorPieces.push(tinted(transformMesh(icosphereSmoothMesh(0.028, 1, 0.005, 9), { pos: [0, 0.348, 0.132] }), c.cloth));

      // Topknot bound in gold + 5 flowing silver-gold curved master locks cascading down back
      armorPieces.push(tinted(
        transformMesh(cordBandMesh(0.044, 0.025, 0.004, 16), { pos: [0, 0.375, -0.045], rot: [-0.35, 0, 0] }),
        c.gold
      ));
      for (let s = -2; s <= 2; s += 1) {
        const masterLock = taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [s * 0.032, 0.365, -0.065],
            mid: [s * 0.068, 0.275, -0.225],
            tip: [s * 0.095, 0.115, -0.365],
            width: 0.072,
            thickness: 0.056,
            segments: 9,
            radialSegments: 10
          }),
          2
        );
        clothPieces.push(paintVerticalGradient(masterLock, c.hair, c.hairTip, 0.05));
      }
    } else {
      // HERO & CLONE: Warm burnt-orange (or spirit-cyan on clone) sculpted shinobi hood/cowl (`zukin`) draped smoothly
      // over neck, temples, crown, and occiput (`sculptDrapedGarmentMesh`), arched cowl brow overhang framing the
      // dark midnight-navy masked shinobi face & glowing eyes, and wind-swept rear hood peak (`sculptCurvedHairLockMesh`)!
      const innerCowlLiner = sculptDrapedGarmentMesh(
        [
          { y: 0.038, rx: 0.128, rz: 0.136, z: -0.012, folds: 4, foldAmp: 0.02 },
          { y: 0.165, rx: 0.150, rz: 0.158, z: -0.014, folds: 4, foldAmp: 0.018 },
          { y: 0.272, rx: 0.144, rz: 0.152, z: -0.016, folds: 3, foldAmp: 0.012 },
          { y: 0.342, rx: 0.088, rz: 0.098, z: -0.020, folds: 0, foldAmp: 0 }
        ],
        { ringPoints: 18, capEnds: true, smoothPasses: 4 }
      );
      clothPieces.push(paintVerticalGradient(innerCowlLiner, c.clothDark, c.cloth, 0.04));

      // Signature warm burnt-orange (`c.accent` -> `c.accentBright`) outer draped shinobi hood/cowl
      const outerHood = sculptDrapedGarmentMesh(
        [
          { y: 0.028, rx: 0.154, rz: 0.164, z: -0.024, folds: 6, foldAmp: 0.045 },
          { y: 0.135, rx: 0.172, rz: 0.184, z: -0.028, folds: 6, foldAmp: 0.042 },
          { y: 0.248, rx: 0.176, rz: 0.186, z: -0.018, folds: 5, foldAmp: 0.036 },
          { y: 0.326, rx: 0.146, rz: 0.164, z: -0.024, folds: 4, foldAmp: 0.025 },
          { y: 0.376, rx: 0.078, rz: 0.104, z: -0.048, folds: 3, foldAmp: 0.015 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 4 }
      );
      clothPieces.push(paintVerticalGradient(outerHood, c.accent, c.accentBright, 0.05));

      // Arched burnt-orange cowl brow lip framing the upper face & `hitai-ate` forehead guard
      const cowlBrowArch = taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [-0.142, 0.176, 0.098],
          mid: [0, 0.292, 0.162],
          tip: [0.142, 0.176, 0.098],
          width: 0.068,
          thickness: 0.036,
          segments: 10,
          radialSegments: 10
        }),
        3
      );
      clothPieces.push(paintVerticalGradient(cowlBrowArch, c.accent, c.accentBright, 0.04));

      // Sleek wind-swept rear hood peak & draped side cowl folds (`sculptCurvedHairLockMesh` — zero spiky cones!)
      const hoodPeak = taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [0, 0.338, -0.058],
          mid: [0, 0.312, -0.205],
          tip: [0, 0.245, -0.345],
          width: 0.128,
          thickness: 0.088,
          segments: 9,
          radialSegments: 12
        }),
        3
      );
      clothPieces.push(paintVerticalGradient(hoodPeak, c.accent, c.accentBright, 0.05));

      for (const sx of [-1, 1] as const) {
        const sideCowlFold = taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [sx * 0.132, 0.228, 0.042],
            mid: [sx * 0.158, 0.132, -0.045],
            tip: [sx * 0.136, 0.032, -0.118],
            width: 0.078,
            thickness: 0.044,
            segments: 8,
            radialSegments: 10
          }),
          3
        );
        clothPieces.push(paintVerticalGradient(sideCowlFold, c.accent, c.accentBright, 0.04));

        // Subtle golden crescent shinobi emblem nestled on the steel brow plate beneath the cowl arch
        const miniCrest = sculptOrientedLimbMesh(
          [
            { pos: [0, 0.244, 0.166], rx: 0.008, rz: 0.005 },
            { pos: [sx * 0.036, 0.264, 0.164], rx: 0.005, rz: 0.004 }
          ],
          10,
          true
        );
        armorPieces.push(tinted(miniCrest, c.gold));
      }
    }
  }

  const bakeBucket = (arr: readonly RawMesh[], fallbackHex: string): RawMesh =>
    arr.length > 0
      ? bakeMeshCavityAO(mergeColoredRawMeshes(arr), 0.26)
      : tinted(transformMesh(icosphereSmoothMesh(0.002, 0, 0, 1), { pos: [0, 0.18, 0] }), fallbackHex);

  return {
    main: bakeBucket(clothPieces, c.cloth),
    skin: bakeBucket(skinPieces, c.skin),
    armor: bakeBucket(armorPieces, c.armor),
    eyes: paintMeshColors(mergeColoredRawMeshes(eyePieces), "#ffffff")
  };
}

/** Smoothly subdivided contoured shinobi/samurai half-mask (`menpo`) sculpted over nose bridge, cheeks, and chin. */
function buildContouredHalfMaskMesh(halfW: number, height: number, frontZ: number): RawMesh {
  const rows: readonly [number, number, number][] = [
    [0.042, halfW * 0.52, frontZ * 0.74],
    [0.088, halfW * 0.88, frontZ * 0.94],
    [0.138, halfW * 1.0, frontZ * 1.02],
    [0.178, halfW * 0.76, frontZ * 0.96]
  ];
  const sections: V3[][] = [];
  for (const [ry, wx, fz] of rows) {
    const arc: V3[] = [];
    const cols = 7;
    for (let i = 0; i < cols; i += 1) {
      const u = (i / (cols - 1)) * 2 - 1;
      const nosePeak = Math.exp(-Math.pow(u / 0.34, 2)) * 0.024;
      const z = fz * Math.cos(u * 1.08) + nosePeak;
      arc.push([u * wx, ry + (ry > 0.15 ? nosePeak * 0.55 : 0), z]);
    }
    const thickArc = [...arc].reverse().map((p): V3 => [p[0] * 0.9, p[1], p[2] - 0.028]);
    sections.push([...arc, ...thickArc]);
  }
  return taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(sections, true, false), 1, 0.46), 3);
}

/** Curved arc plate for `shikoro` neck guards (`16+` points along arc). */
function buildArcPlateMesh(radius: number, height: number, thickness: number, a0: number, a1: number, steps = 16): RawMesh {
  const makeRow = (y: number, rMul: number): V3[] => {
    const outer: V3[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const a = a0 + (i / steps) * (a1 - a0);
      outer.push([Math.sin(a) * radius * rMul, y, Math.cos(a) * radius * rMul]);
    }
    const inner = [...outer].reverse().map((p): V3 => {
      const n = norm3([p[0], 0, p[2]]);
      return [p[0] - n[0] * thickness, p[1], p[2] - n[2] * thickness];
    });
    return [...outer, ...inner];
  };
  return taubinSmoothMesh(loftSectionsMesh([makeRow(-height * 0.5, 1.08), makeRow(height * 0.5, 0.96)], true, false), 2);
}

/* ------------------------------------------------------------------ 3. Sculpted Pleated Hakama, Suneate & Split-Toe Tabi Legs (`legL`/`legR`) */

function buildLegBuckets(id: CharacterId, c: RigColors, side: "L" | "R"): PartMaterialBuckets {
  if (side === "R") {
    const left = buildLegBuckets(id, c, "L");
    return {
      cloth: left.cloth.map(mirrorMeshX),
      skin: left.skin.map(mirrorMeshX),
      armor: left.armor.map(mirrorMeshX)
    };
  }
  const sx = 1;
  const wide = id === "brute" ? 1.25 : 1.0;
  const cloth: RawMesh[] = [];
  const skin: RawMesh[] = [];
  const armor: RawMesh[] = [];

  // 1. Smoothly draped pleated `tattsuke-bakama` / `sashinuki` thigh breeches (`sculptDrapedGarmentMesh`)
  const hakamaFlare = id === "caster" ? 1.18 : 1.04;
  const thighBreeches = sculptDrapedGarmentMesh(
    [
      { y: -0.352, rx: 0.082 * wide, rz: 0.086 * wide, x: 0, z: 0.020, folds: 6, foldAmp: 0.032 },
      { y: -0.235, rx: 0.126 * wide * hakamaFlare, rz: 0.132 * wide * hakamaFlare, x: sx * 0.006, z: 0.022, folds: 7, foldAmp: 0.062 },
      { y: -0.095, rx: 0.138 * wide * hakamaFlare, rz: 0.142 * wide * hakamaFlare, x: sx * 0.004, z: 0.012, folds: 7, foldAmp: 0.065 },
      { y: 0.055, rx: 0.116 * wide, rz: 0.122 * wide, x: -sx * 0.012, z: 0, folds: 6, foldAmp: 0.042 }
    ],
    { ringPoints: 22, capEnds: false, smoothPasses: 4 }
  );
  cloth.push(paintVerticalGradient(thighBreeches, c.clothDark, id === "caster" ? c.underCloth : c.cloth, 0.06));

  // 2. 18-point anatomical gastrocnemius calf (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`) wrapped in `kyahan` cloth gaiter
  const calfStations: AnatomicalStation[] = [
    { pos: [0, -0.342, 0.018], rx: 0.078 * wide, rz: 0.082 * wide },
    { pos: [sx * 0.004, -0.445, -0.008], rx: 0.084 * wide, rz: 0.092 * wide },
    { pos: [0, -0.565, -0.014], rx: 0.064 * wide, rz: 0.068 * wide },
    { pos: [0, -0.662, -0.008], rx: 0.054 * wide, rz: 0.058 * wide }
  ];
  cloth.push(paintVerticalGradient(
    taubinSmoothMesh(
      sculptAnatomicalLimbMesh(calfStations, { ringPoints: 18, capEnds: false, muscleBiasZ: -0.014, peakT: 0.36 }),
      3
    ),
    c.wrapShade,
    c.wrap,
    0.05
  ));

  // Contoured `tateage` knee guard + splinted `suneate` shin armor (all shinobi & samurai archetypes except `caster` court monk)
  if (id !== "caster") {
    const kneeGuard = transformMesh(curvedArmorPlateMesh(0.112 * wide, 0.096, 0.034, 0.018, 0), {
      pos: [0, -0.342, 0.072 * wide],
      rot: [0.08, sx * 0.06, 0]
    });
    armor.push(tinted(kneeGuard, id === "brute" || id === "soldier" ? c.gold : c.armor));

    const suneate = transformMesh(curvedArmorPlateMesh(0.106 * wide, 0.225, 0.036, 0.018, 0), {
      pos: [0, -0.492, 0.058 * wide],
      rot: [-0.06, sx * 0.05, 0]
    });
    armor.push(paintVerticalGradient(suneate, c.armorDark, c.armor, 0.05));
  }

  // Crisscross silk `kyahan` shin-cord bindings (`cordBandMesh` — zero hidden interior disc caps)
  for (const wy of [-0.425, -0.505, -0.585]) {
    const cord = transformMesh(cordBandMesh(0.080 * wide, 0.010, 0.004, 14), { pos: [0, wy, -0.008] });
    cloth.push(tinted(cord, id === "brute" || id === "soldier" ? c.gold : c.accent));
  }

  // 3. Authentic Split-Toe `Tabi` Boot with medial big-toe cleft (`-sx` side) & treaded `waraji` sole!
  const tabiAnkle = sculptOrientedLimbMesh(
    [
      { pos: [0, -0.648, -0.012], rx: 0.056 * wide, rz: 0.062 * wide },
      { pos: [0, -0.692, 0.018], rx: 0.060 * wide, rz: 0.078 * wide },
      { pos: [sx * 0.006, -0.706, 0.082], rx: 0.056 * wide, rz: 0.058 * wide }
    ],
    18,
    false
  );
  // Medial big-toe lobe (`oya-yubi` on `-sx`) + lateral 4-toe lobe (`+sx`) forming the unmistakable split-toe `tabi` silhouette!
  const bigToe = sculptOrientedLimbMesh(
    [
      { pos: [-sx * 0.026 * wide, -0.706, 0.078], rx: 0.022 * wide, rz: 0.026 * wide },
      { pos: [-sx * 0.028 * wide, -0.712, 0.156], rx: 0.018 * wide, rz: 0.020 * wide }
    ],
    14,
    true
  );
  const outerToes = sculptOrientedLimbMesh(
    [
      { pos: [sx * 0.020 * wide, -0.706, 0.078], rx: 0.032 * wide, rz: 0.026 * wide },
      { pos: [sx * 0.022 * wide, -0.712, 0.152], rx: 0.026 * wide, rz: 0.020 * wide }
    ],
    14,
    true
  );
  cloth.push(tinted(tabiAnkle, c.boot));
  cloth.push(tinted(bigToe, c.boot));
  cloth.push(tinted(outerToes, c.boot));

  // Woven straw/rubber `waraji` sole grounded cleanly at `y = -0.742` + burnt-orange/crimson `waraji` ankle cord
  const sole = taubinSmoothMesh(
    transformMesh(bevelBoxMesh(0.122 * wide, 0.026, 0.242, 0.011), { pos: [0, -0.729, 0.044] }),
    2
  );
  cloth.push(tinted(sole, id === "soldier" || id === "caster" ? "#cca068" : "#262228"));
  const ankleCord = transformMesh(cordBandMesh(0.064 * wide, 0.011, 0.004, 14), { pos: [0, -0.655, -0.01] });
  cloth.push(tinted(ankleCord, c.accentBright));

  return { cloth, skin, armor };
}

/* ------------------------------------------------------------------ 4. Seamless Deltoid Pauldrons, Kote Gauntlets & Wrapped Hands (`armL`/`armR`) */

function buildArmBuckets(id: CharacterId, c: RigColors, side: "L" | "R"): PartMaterialBuckets {
  if (side === "R") {
    const left = buildArmBuckets(id, c, "L");
    return {
      cloth: left.cloth.map(mirrorMeshX),
      skin: left.skin.map(mirrorMeshX),
      armor: left.armor.map(mirrorMeshX)
    };
  }
  const sx = 1;
  const wide = id === "brute" ? 1.26 : 1.0;
  const cloth: RawMesh[] = [];
  const skin: RawMesh[] = [];
  const armor: RawMesh[] = [];

  if (id === "caster") {
    // CRIMSON ONMYOJI SORCERER: Seamless shoulder + wide pleated crimson-and-gold Heian `kariginu` hunting-robe sleeve (`sculptDrapedGarmentMesh`)!
    const kariginuSleeve = sculptDrapedGarmentMesh(
      [
        { y: -0.515, rx: 0.068, rz: 0.082, x: 0, z: 0.055, folds: 7, foldAmp: 0.042 },
        { y: -0.365, rx: 0.128, rz: 0.195, x: sx * 0.018, z: -0.025, folds: 8, foldAmp: 0.075 },
        { y: -0.145, rx: 0.118, rz: 0.148, x: sx * 0.012, z: -0.012, folds: 8, foldAmp: 0.065 },
        { y: 0.055, rx: 0.088, rz: 0.094, x: -sx * 0.048, z: 0, folds: 6, foldAmp: 0.035 }
      ],
      { ringPoints: 20, capEnds: false, smoothPasses: 4 }
    );
    cloth.push(paintVerticalGradient(kariginuSleeve, c.clothDark, c.cloth, 0.06));
    armor.push(tinted(transformMesh(cordBandMesh(0.073, 0.020, 0.004, 16), { pos: [0, -0.515, 0.058], rot: [-0.28, 0, 0] }), c.gold));
  } else {
    // 1. SEAMLESS DELTOID CAP + ANATOMICAL BICEP (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`) + LAYERED PAULDRONS (`kohire` / `sode`)
    const upperBicep = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [-sx * 0.056 * wide, 0.068, 0], rx: 0.086 * wide, rz: 0.092 * wide },
          { pos: [sx * 0.008 * wide, -0.025, 0.004], rx: 0.098 * wide, rz: 0.102 * wide },
          { pos: [sx * 0.010 * wide, -0.145, -0.006], rx: 0.092 * wide, rz: 0.096 * wide },
          { pos: [0, -0.275, -0.014], rx: 0.072 * wide, rz: 0.076 * wide }
        ],
        { ringPoints: 18, capEnds: false, muscleBiasZ: 0.012, peakT: 0.38 }
      ),
      3
    );
    if (id === "brute") {
      // Exposed muscular crimson Oni bicep!
      skin.push(paintVerticalGradient(upperBicep, c.skinShade, c.skin, 0.05));
    } else {
      cloth.push(paintVerticalGradient(upperBicep, c.clothDark, c.cloth, 0.05));
    }

    // Articulated layered shoulder pauldrons (`o-sode` on samurai/Oni, sleek contoured `kohire` deltoid plates on shinobi)
    const pauldronTiers = id === "brute" || id === "soldier" ? 3 : 2;
    for (let tier = 0; tier < pauldronTiers; tier += 1) {
      const pWidth = (id === "brute" || id === "soldier" ? 0.215 : 0.185) * wide - tier * 0.022;
      const pauldron = transformMesh(curvedArmorPlateMesh(pWidth, 0.098, 0.038, 0.02, 0), {
        pos: [sx * (0.042 + tier * 0.018) * wide, 0.042 - tier * 0.058, 0],
        rot: [0, sx * Math.PI * 0.5, -sx * (0.34 + tier * 0.11)]
      });
      armor.push(paintVerticalGradient(pauldron, c.armorDark, tier === pauldronTiers - 1 ? c.accent : c.armor, 0.04));
    }

    // Forged shoulder spike on Oni Juggernaut (`brute`)
    if (id === "brute") {
      const spike = sculptOrientedLimbMesh(
        [
          { pos: [sx * 0.068 * wide, 0.075, 0], rx: 0.028, rz: 0.028 },
          { pos: [sx * 0.145 * wide, 0.165, 0], rx: 0.005, rz: 0.005 }
        ],
        12,
        true
      );
      armor.push(tinted(spike, c.gold));
    }

    // 2. 18-radial-point anatomical tapered forearm (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`) + armored `kote` gauntlet
    const forearmWrap = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [0, -0.262, -0.014], rx: 0.076 * wide, rz: 0.078 * wide },
          { pos: [0, -0.395, 0.026], rx: 0.070 * wide, rz: 0.074 * wide },
          { pos: [0, -0.525, 0.068], rx: 0.052 * wide, rz: 0.055 * wide }
        ],
        { ringPoints: 18, capEnds: false, muscleBiasZ: -0.008, peakT: 0.34 }
      ),
      3
    );
    cloth.push(paintVerticalGradient(forearmWrap, c.wrapShade, c.wrap, 0.04));

    // Outer & dorsal contoured `kote` forearm armor plates + silk cord bindings
    const kotePlate = transformMesh(curvedArmorPlateMesh(0.092 * wide, 0.215, 0.032, 0.018, 0), {
      pos: [sx * 0.022 * wide, -0.395, 0.058 * wide],
      rot: [-0.29, sx * 0.35, 0]
    });
    armor.push(paintVerticalGradient(kotePlate, c.armorDark, c.armor, 0.05));

    for (const [wy, wz] of [[-0.335, 0.008], [-0.435, 0.038], [-0.512, 0.064]] as const) {
      const wristCord = transformMesh(cordBandMesh(0.065 * wide, 0.012, 0.004, 14), { pos: [0, wy, wz], rot: [-0.29, 0, 0] });
      cloth.push(tinted(wristCord, c.accentBright));
    }
  }

  // 3. Sculpted Wrapped Hand (`tekko`) centered around weapon grip `[0, -0.56, 0.09]` with palm, dorsal guard, medial thumb (`-sx`), index finger & curled grip block!
  const palm = sculptOrientedLimbMesh(
    [
      { pos: [0, -0.525, 0.068], rx: 0.042 * wide, rz: 0.030 * wide },
      { pos: [0, -0.562, 0.086], rx: 0.046 * wide, rz: 0.032 * wide },
      { pos: [0, -0.592, 0.098], rx: 0.040 * wide, rz: 0.026 * wide }
    ],
    18,
    false
  );
  skin.push(paintVerticalGradient(palm, c.skinShade, c.skin, 0.04));

  // Dorsal `tekko` back-of-hand armor plate (absent on `caster` aristocratic bare hands)
  if (id !== "caster") {
    const tekkoPlate = transformMesh(curvedArmorPlateMesh(0.078 * wide, 0.066, 0.020, 0.014, 0), {
      pos: [0, -0.558, 0.112],
      rot: [-0.28, 0, 0]
    });
    armor.push(tinted(tekkoPlate, c.armor));
  }

  // Opposable medial thumb (`-sx` side) + index finger + sculpted 3-finger curled grip block around `[0, -0.56, 0.09]`
  const thumb = sculptOrientedLimbMesh(
    [
      { pos: [-sx * 0.036 * wide, -0.548, 0.082], rx: 0.015 * wide, rz: 0.015 * wide },
      { pos: [-sx * 0.048 * wide, -0.576, 0.106], rx: 0.012 * wide, rz: 0.012 * wide },
      { pos: [-sx * 0.032 * wide, -0.596, 0.116], rx: 0.009 * wide, rz: 0.009 * wide }
    ],
    10,
    true
  );
  skin.push(tinted(thumb, c.skin));

  const indexFinger = sculptOrientedLimbMesh(
    [
      { pos: [-sx * 0.026 * wide, -0.588, 0.102], rx: 0.011 * wide, rz: 0.011 * wide },
      { pos: [-sx * 0.026 * wide, -0.618, 0.096], rx: 0.009 * wide, rz: 0.009 * wide }
    ],
    10,
    true
  );
  const curledFingers = sculptOrientedLimbMesh(
    [
      { pos: [sx * 0.012 * wide, -0.588, 0.102], rx: 0.028 * wide, rz: 0.012 * wide, pleatDepth: 0.09 },
      { pos: [sx * 0.012 * wide, -0.614, 0.106], rx: 0.026 * wide, rz: 0.011 * wide, pleatDepth: 0.09 },
      { pos: [sx * 0.012 * wide, -0.620, 0.084], rx: 0.023 * wide, rz: 0.010 * wide, pleatDepth: 0.08 }
    ],
    14,
    true,
    4
  );
  skin.push(tinted(indexFinger, c.skinShade));
  skin.push(tinted(curledFingers, c.skinShade));

  return { cloth, skin, armor };
}

function hideNodeBuilder<TNode extends AuraSceneNode>(builder: AuraNodeBuilder<TNode>): AuraNodeBuilder<AuraSceneNode> {
  const Ctor = builder.constructor as unknown as new (json: Record<string, unknown>) => AuraNodeBuilder<AuraSceneNode>;
  return new Ctor({ ...(builder.toJSON() as unknown as Record<string, unknown>), visible: false });
}

export function buildProceduralActorNodes(
  slot: number,
  id: CharacterId,
  castShadow: boolean,
  variant?: ActorVisualVariant
): AuraNodeBuilder<AuraSceneNode>[] {
  const resolvedVariant: ActorVisualVariant = variant ?? (slot >= 1 && slot <= 3 ? "clone" : "std");
  const isHeroFamily = slot === 0 || (slot >= 1 && slot <= 3) || slot === 12 || resolvedVariant === "ember";
  const c = colorsForSlot(id, resolvedVariant);
  const cachePrefix = `ninja:actor:v8:${id}:${resolvedVariant}`;

  const bodyNode = (() => {
    const nodeId = `actor-${slot}-body`;
    const spec = memoizeGeometry(`${cachePrefix}:body`, () => mergeRawMeshes([buildBodyMesh(id, c, resolvedVariant)]));
    return hideNodeBuilder(geometry.custom(spec, {
      name: nodeId,
      material: c.baseMat,
      position: [0, -500, 0],
      castShadow,
      receiveShadow: true
    }).runtime({ id: nodeId }));
  })();

  const headNode = (() => {
    const nodeId = `actor-${slot}-head`;
    const getParts = () => memoizeGeometry(`${cachePrefix}:head:parts`, () => buildHeadParts(id, c, resolvedVariant));
    const mainSpec = memoizeGeometry(`${cachePrefix}:head:main`, () => mergeRawMeshes([getParts().main]));
    const skinSpec = memoizeGeometry(`${cachePrefix}:head:skin`, () => mergeRawMeshes([getParts().skin]));
    const armorSpec = memoizeGeometry(`${cachePrefix}:head:armor`, () => mergeRawMeshes([getParts().armor]));
    const eyeSpec = memoizeGeometry(`${cachePrefix}:head:eyes`, () => mergeRawMeshes([getParts().eyes]));
    return hideNodeBuilder(group(
      nodeId,
      [
        geometry.custom(mainSpec, {
          name: `${nodeId}-main`,
          material: c.clothMat,
          castShadow,
          receiveShadow: true
        }),
        geometry.custom(skinSpec, {
          name: `${nodeId}-skin`,
          material: c.skinMat,
          castShadow,
          receiveShadow: true
        }),
        geometry.custom(armorSpec, {
          name: `${nodeId}-armor`,
          material: c.armorMat,
          castShadow,
          receiveShadow: true
        }),
        geometry.custom(eyeSpec, {
          name: `${nodeId}-eyes`,
          material: c.eyeMat,
          castShadow: false,
          receiveShadow: false
        })
      ],
      {
        position: [0, -500, 0]
      }
    ).runtime({ id: nodeId }));
  })();

  const mkLimbGroup = (
    part: Exclude<ProceduralPartKey, "body" | "head">,
    buildBuckets: () => PartMaterialBuckets,
    partShadow: boolean
  ): AuraNodeBuilder<AuraSceneNode> => {
    const nodeId = `actor-${slot}-${part}`;
    const buckets = memoizeGeometry(`${cachePrefix}:${part}:buckets`, buildBuckets);
    const children: AuraNodeBuilder<AuraSceneNode>[] = [];
    if (buckets.cloth.length > 0) {
      const clothSpec = memoizeGeometry(
        `${cachePrefix}:${part}:cloth`,
        () => mergeRawMeshes([bakeMeshCavityAO(mergeColoredRawMeshes(buckets.cloth), 0.26)])
      );
      children.push(geometry.custom(clothSpec, {
        name: `${nodeId}-cloth`,
        material: c.clothMat,
        castShadow: partShadow,
        receiveShadow: true
      }));
    }
    if (buckets.armor.length > 0) {
      const armorSpec = memoizeGeometry(
        `${cachePrefix}:${part}:armor`,
        () => mergeRawMeshes([bakeMeshCavityAO(mergeColoredRawMeshes(buckets.armor), 0.26)])
      );
      children.push(geometry.custom(armorSpec, {
        name: `${nodeId}-armor`,
        material: c.armorMat,
        castShadow: partShadow,
        receiveShadow: true
      }));
    }
    if (buckets.skin.length > 0) {
      const skinSpec = memoizeGeometry(
        `${cachePrefix}:${part}:skin`,
        () => mergeRawMeshes([bakeMeshCavityAO(mergeColoredRawMeshes(buckets.skin), 0.26)])
      );
      children.push(geometry.custom(skinSpec, {
        name: `${nodeId}-skin`,
        material: c.skinMat,
        castShadow: partShadow,
        receiveShadow: true
      }));
    }
    return hideNodeBuilder(group(nodeId, children, {
      position: [0, -500, 0]
    }).runtime({ id: nodeId }));
  };

  const limbShadow = castShadow && isHeroFamily;

  return [
    bodyNode,
    headNode,
    mkLimbGroup("legL", () => buildLegBuckets(id, c, "L"), limbShadow),
    mkLimbGroup("legR", () => buildLegBuckets(id, c, "R"), limbShadow),
    mkLimbGroup("armL", () => buildArmBuckets(id, c, "L"), limbShadow),
    mkLimbGroup("armR", () => buildArmBuckets(id, c, "R"), limbShadow)
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
  const sy = Math.max(-1, Math.min(1, m[6]));
  const ey = Math.asin(sy);
  if (Math.abs(sy) < 0.9999) {
    return [Math.atan2(-m[7], m[8]), ey, Math.atan2(-m[3], m[0])];
  }
  return [Math.atan2(m[5], m[4]), ey, 0];
};

const CLIP_DURATIONS: Readonly<Record<string, number>> = {
  run: 0.64,
  idle: 1.6,
  jump: 0.9,
  slide: 0.75,
  punch: 0.46,
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
  bodyRoll: number;
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
  const s2 = Math.sin(ph * 2 - 0.35);

  switch (clip) {
    case "idle":
      return {
        lift: 0.026 * s,
        bodyPitch: 0.1,
        bodyYaw: 0.08 * s,
        bodyRoll: 0.02 * c,
        headPitch: -0.05,
        legLPitch: 0.1,
        legRPitch: -0.1,
        armLPitch: 0.24 + 0.07 * s,
        armRPitch: -0.22 - 0.07 * s,
        armLSplay: 0.18,
        armRSplay: -0.2
      };
    case "jump":
      return {
        lift: 0.12,
        bodyPitch: 0.28,
        bodyYaw: 0.08,
        bodyRoll: 0,
        headPitch: -0.18,
        legLPitch: -0.78,
        legRPitch: 0.44,
        armLPitch: -0.92,
        armRPitch: -0.58,
        armLSplay: 0.32,
        armRSplay: -0.3
      };
    case "slide":
      return {
        lift: -0.34,
        bodyPitch: -0.82,
        bodyYaw: 0.18,
        bodyRoll: -0.08,
        headPitch: 0.62,
        legLPitch: -1.16,
        legRPitch: -0.84,
        armLPitch: 0.68,
        armRPitch: 0.48,
        armLSplay: 0.34,
        armRSplay: -0.34
      };
    case "sword":
    case "punch":
    case "jab":
    case "throw": {
      const swing = Math.sin(Math.min(1, u * 1.28) * Math.PI);
      const slashArc = Math.cos(Math.min(1, u * 1.22) * Math.PI);
      return {
        lift: 0.045 * swing,
        bodyPitch: 0.3 + 0.2 * swing,
        bodyYaw: -0.56 * swing + 0.16 * slashArc,
        bodyRoll: -0.1 * swing,
        headPitch: -0.18,
        legLPitch: -0.52,
        legRPitch: 0.46,
        armLPitch: 0.68 + 0.22 * swing,
        armRPitch: -1.62 * swing - 0.28,
        armLSplay: 0.34,
        armRSplay: -0.42 * swing - 0.14
      };
    }
    case "cast":
    case "block": {
      const surge = Math.sin(Math.min(1, u * 1.15) * Math.PI);
      return {
        lift: 0.055 * surge,
        bodyPitch: 0.14,
        bodyYaw: 0.26 * surge,
        bodyRoll: 0.04 * surge,
        headPitch: -0.09,
        legLPitch: -0.26,
        legRPitch: 0.26,
        armLPitch: -1.42 * surge - 0.45,
        armRPitch: -0.72 * surge - 0.16,
        armLSplay: 0.26,
        armRSplay: -0.26
      };
    }
    case "hit": {
      const recoil = Math.sin(Math.min(1, u) * Math.PI);
      return {
        lift: -0.05 * recoil,
        bodyPitch: -0.44 * recoil,
        bodyYaw: 0.28 * recoil,
        bodyRoll: 0.08 * recoil,
        headPitch: -0.3 * recoil,
        legLPitch: 0.24,
        legRPitch: -0.2,
        armLPitch: -0.58 * recoil,
        armRPitch: -0.58 * recoil,
        armLSplay: 0.44,
        armRSplay: -0.44
      };
    }
    case "death": {
      const fall = Math.min(1, u * 1.15);
      return {
        lift: -0.48 * fall,
        bodyPitch: -1.26 * fall,
        bodyYaw: 0.36 * fall,
        bodyRoll: 0.14 * fall,
        headPitch: -0.36 * fall,
        legLPitch: 0.54 * fall,
        legRPitch: 0.3 * fall,
        armLPitch: -0.96 * fall,
        armRPitch: -0.84 * fall,
        armLSplay: 0.56 * fall,
        armRSplay: -0.56 * fall
      };
    }
    case "run":
    default:
      return {
        lift: 0.058 * (0.5 + 0.5 * s2),
        bodyPitch: 0.39 + 0.035 * s2,
        bodyYaw: 0.23 * s,
        bodyRoll: 0.055 * c,
        headPitch: -0.27 - 0.025 * s2,
        legLPitch: 0.98 * s + 0.06 * c,
        legRPitch: -0.98 * s - 0.06 * c,
        armLPitch: -0.88 * s + 0.24,
        armRPitch: 0.88 * s + 0.24,
        armLSplay: 0.22 + 0.04 * Math.max(0, s),
        armRSplay: -0.22 - 0.04 * Math.max(0, -s)
      };
  }
}

function lerpAngles(a: PoseAngles, b: PoseAngles, k: number): PoseAngles {
  const l = (x: number, y: number) => x + (y - x) * k;
  return {
    lift: l(a.lift, b.lift),
    bodyPitch: l(a.bodyPitch, b.bodyPitch),
    bodyYaw: l(a.bodyYaw, b.bodyYaw),
    bodyRoll: l(a.bodyRoll, b.bodyRoll),
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
  const wide = id === "brute" ? 1.24 : 1.0;
  const bodyRot: V3 = [-a.bodyPitch, a.bodyYaw, a.bodyRoll];
  const Rbody = eulerZYX(bodyRot);
  const bodyPos: V3 = [0, 0.86 + a.lift, 0];

  const neckLocal: V3 = [0, 0.56, 0];
  const headPos = add3(bodyPos, apply3(Rbody, neckLocal));
  const headRot: V3 = [-(a.bodyPitch + a.headPitch), a.bodyYaw * 0.45, a.bodyRoll * 0.35];

  const hipLPos = add3(bodyPos, apply3(Rbody, [0.118 * wide, -0.14, 0]));
  const hipRPos = add3(bodyPos, apply3(Rbody, [-0.118 * wide, -0.14, 0]));
  const legLRot: V3 = [a.legLPitch, a.bodyYaw * 0.28, 0.03];
  const legRRot: V3 = [a.legRPitch, a.bodyYaw * 0.28, -0.03];

  const shLPos = add3(bodyPos, apply3(Rbody, [0.238 * wide, 0.425, 0]));
  const shRPos = add3(bodyPos, apply3(Rbody, [-0.238 * wide, 0.425, 0]));
  const armLRot: V3 = [-a.armLPitch, a.bodyYaw * 0.58, a.armLSplay];
  const armRRot: V3 = [-a.armRPitch, a.bodyYaw * 0.58, a.armRSplay];
  const RarmL = eulerZYX(armLRot);
  const RarmR = eulerZYX(armRRot);

  const spine02 = add3(bodyPos, apply3(Rbody, [0, 0.47, -0.13]));
  const spine01 = add3(bodyPos, apply3(Rbody, [0, 0.26, -0.08]));
  const foreL = add3(shLPos, apply3(RarmL, [0, -0.29, 0.01]));
  const handL = add3(shLPos, apply3(RarmL, [0, -0.56, 0.09]));
  const foreR = add3(shRPos, apply3(RarmR, [0, -0.29, 0.01]));
  const handR = add3(shRPos, apply3(RarmR, [0, -0.56, 0.09]));

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
      /* authored vertex-colored + cavity-AO PBR materials per character archetype */
    },
    setMaterialOverrides() {
      /* authored vertex-colored + cavity-AO PBR materials per character archetype */
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
 * Applies a posed procedural actor's 6 articulated scene nodes (`actor-${slot}-${part}`)
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
