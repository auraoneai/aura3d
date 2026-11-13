/**
 * Articulated multi-material `@aura3d/engine` Sengoku character rigs for Shadowstep Gauntlet (`examples/ninja-runner-port`).
 *
 * Sculpted `@aura3d/engine` character archetypes (`hero`, `sage` Sunfire, `ember` Demon-Ember, `clone` Spirit-Phantom,
 * `soldier` Hawk Swordsman, `brute` Oni Guardian, `caster` Onmyoji Spirit Monk, `scout` Kitsune Raider) built as 6
 * articulated scene nodes (`body`, `head`, `legL`, `legR`, `armL`, `armR`) using `loftSectionsMesh`, `latheMesh`,
 * `tubeSweepMesh`, `subdivideSmoothMesh`, `sculptHumanoidLimbMesh`, preserved `COLOR_0` vertex-color gradients
 * (`mergeColoredRawMeshes` + `paintVerticalGradient` + `bakeMeshCavityAO`), and `memoizeGeometry` while preserving
 * every skeleton joint (`Spine`, `Spine01`, `Spine02`, `RightForeArm`, `RightHand`, `LeftForeArm`, `LeftHand`).
 */
import { geometry, group, material, type AuraApp, type AuraMaterialSpec, type AuraNodeBuilder, type TypedGLBActor } from "@aura3d/engine";
import {
  bakeMeshCavityAO,
  bevelBoxMesh,
  catmullRomSpline3,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptHumanoidLimbMesh,
  subdivideSmoothMesh,
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

const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/* ------------------------------------------------------------------ Palette & Lit Vertex-Color PBR Materials */

const MAT_ACTOR_SHINOBI_BODY = unnamed(material.pbr({
  color: "#ffffff",
  roughness: 0.46,
  metallic: 0.1,
  sheen: 0.42,
  sheenColor: "#5878ba",
  sheenRoughness: 0.36,
  clearcoat: 0.24,
  clearcoatRoughness: 0.28
}));

const MAT_ACTOR_HEAVY_ARMOR = unnamed(material.lacquer({
  color: "#ffffff",
  roughness: 0.3,
  metallic: 0.26,
  clearcoat: 0.58,
  clearcoatRoughness: 0.16
}));

const MAT_EMBER_ARMOR = unnamed(material.lacquer({
  color: "#ffffff",
  emissive: "#ff4814",
  emissiveIntensity: 0.38,
  practical: true,
  roughness: 0.3,
  metallic: 0.28,
  clearcoat: 0.56,
  clearcoatRoughness: 0.16
}));

const MAT_CLONE_HOLOGRAM = unnamed(material.lacquer({
  color: "#ffffff",
  emissive: "#1f9dff",
  emissiveIntensity: 0.78,
  practical: true,
  roughness: 0.24,
  metallic: 0.26,
  clearcoat: 0.64,
  clearcoatRoughness: 0.14
}));

const MAT_SPIRIT_CYAN_EYE = unnamed(material.emissive({ color: "#8ff7ff", emissive: "#3ce2ff", emissiveIntensity: 2.3, practical: true }));
const MAT_SPIRIT_VIOLET_EYE = unnamed(material.emissive({ color: "#e5a6ff", emissive: "#c063ff", emissiveIntensity: 2.3, practical: true }));
const MAT_SPIRIT_AMBER_EYE = unnamed(material.emissive({ color: "#ffe07d", emissive: "#ffa429", emissiveIntensity: 2.4, practical: true }));
const MAT_SPIRIT_CRIMSON_EYE = unnamed(material.emissive({ color: "#ff9852", emissive: "#ff3c14", emissiveIntensity: 2.6, practical: true }));

interface RigColors {
  readonly cloth: string;
  readonly clothDark: string;
  readonly armor: string;
  readonly accent: string;
  readonly accentBright: string;
  readonly gold: string;
  readonly steel: string;
  readonly wrap: string;
  readonly wrapShade: string;
  readonly boot: string;
  readonly mask: string;
  readonly skin: string;
  readonly hair: string;
  readonly hairTip: string;
  readonly scabbard: string;
  readonly eyeMat: AuraMaterialSpec;
  readonly baseMat: AuraMaterialSpec;
}

function colorsForSlot(id: CharacterId, variant: ActorVisualVariant): RigColors {
  if (variant === "clone") {
    return {
      cloth: "#1f68d6",
      clothDark: "#113d8c",
      armor: "#2c8cf5",
      accent: "#7cecff",
      accentBright: "#c8f8ff",
      gold: "#c79eff",
      steel: "#cffafe",
      wrap: "#b8f4ff",
      wrapShade: "#6fd8fa",
      boot: "#10326e",
      mask: "#174fa8",
      skin: "#90e2ff",
      hair: "#2474e8",
      hairTip: "#9ef3ff",
      scabbard: "#164899",
      eyeMat: MAT_SPIRIT_CYAN_EYE,
      baseMat: MAT_CLONE_HOLOGRAM
    };
  }
  if (variant === "ember") {
    return {
      cloth: "#1c1324",
      clothDark: "#100a16",
      armor: "#b81d18",
      accent: "#ff4b17",
      accentBright: "#ff9c2a",
      gold: "#ffb938",
      steel: "#e6d8d2",
      wrap: "#e8d2be",
      wrapShade: "#b8967d",
      boot: "#17101c",
      mask: "#1c1221",
      skin: "#e0a580",
      hair: "#2b1420",
      hairTip: "#ff661f",
      scabbard: "#7d1412",
      eyeMat: MAT_SPIRIT_CRIMSON_EYE,
      baseMat: MAT_EMBER_ARMOR
    };
  }
  switch (id) {
    case "hero":
      return {
        cloth: "#1c2745",
        clothDark: "#10172b",
        armor: "#23304f",
        accent: "#e03a1e",
        accentBright: "#ff7426",
        gold: "#ebb546",
        steel: "#dce6f5",
        wrap: "#f0e7d5",
        wrapShade: "#cfc2ab",
        boot: "#151c2e",
        mask: "#151e36",
        skin: "#e4ac86",
        hair: "#1a233d",
        hairTip: "#354875",
        scabbard: "#a61e19",
        eyeMat: MAT_SPIRIT_CYAN_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY
      };
    case "soldier":
      return {
        cloth: "#1b3f57",
        clothDark: "#112838",
        armor: "#bf211e",
        accent: "#e63c24",
        accentBright: "#ff7e2e",
        gold: "#efc14c",
        steel: "#ced9ea",
        wrap: "#e4dccb",
        wrapShade: "#bfb39d",
        boot: "#1a202e",
        mask: "#262b38",
        skin: "#dfa680",
        hair: "#1c2230",
        hairTip: "#b5261e",
        scabbard: "#222736",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "brute":
      return {
        cloth: "#1e1826",
        clothDark: "#120e18",
        armor: "#9e1919",
        accent: "#e33422",
        accentBright: "#ff6e24",
        gold: "#f0be49",
        steel: "#bcc7d8",
        wrap: "#c42820",
        wrapShade: "#871713",
        boot: "#18131f",
        mask: "#a81919",
        skin: "#cc7e66",
        hair: "#f0e8d8",
        hairTip: "#cbbba2",
        scabbard: "#1a1521",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "sage":
      return {
        cloth: "#ed8a19",
        clothDark: "#ad510d",
        armor: "#f7ecd4",
        accent: "#d92a1e",
        accentBright: "#ffb536",
        gold: "#ffca4b",
        steel: "#e2ebf7",
        wrap: "#faf2e1",
        wrapShade: "#dfd1b6",
        boot: "#1d2436",
        mask: "#f5ede0",
        skin: "#e6b08c",
        hair: "#f5ede0",
        hairTip: "#ffba42",
        scabbard: "#b5241c",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY
      };
    case "caster":
      return {
        cloth: "#4e227d",
        clothDark: "#270f45",
        armor: "#7c3ec2",
        accent: "#d93232",
        accentBright: "#c175ff",
        gold: "#f0c150",
        steel: "#d2ddf0",
        wrap: "#f2ece1",
        wrapShade: "#cfc5b4",
        boot: "#1b1f30",
        mask: "#faf3e8",
        skin: "#e2ab86",
        hair: "#1c1629",
        hairTip: "#6e38ab",
        scabbard: "#2a1647",
        eyeMat: MAT_SPIRIT_VIOLET_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY
      };
    case "scout":
      return {
        cloth: "#b82c22",
        clothDark: "#6e1612",
        armor: "#202738",
        accent: "#f04e26",
        accentBright: "#ff8c38",
        gold: "#ebb948",
        steel: "#d6e1f2",
        wrap: "#eee5d4",
        wrapShade: "#c7bba6",
        boot: "#19202e",
        mask: "#faf3e6",
        skin: "#e2ab86",
        hair: "#1d2232",
        hairTip: "#db3526",
        scabbard: "#232a3d",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_SHINOBI_BODY
      };
  }
}

function tinted(mesh: RawMesh, hex: string): RawMesh {
  return paintMeshColors(mesh, hex);
}

/** Curved lofted ribbon strip along a 3D spine with organic width/thickness taper (for scarf tails, sashes & plumes). */
function sculptedRibbonMesh(spinePts: readonly V3[], halfWidth: number, thickness: number, taper = 0.65, twist = 0.45): RawMesh {
  const sampled = catmullRomSpline3(spinePts, 5, false);
  const sections: V3[][] = [];
  for (let i = 0; i < sampled.length; i += 1) {
    const p = sampled[i]!;
    const u = i / Math.max(1, sampled.length - 1);
    const w = halfWidth * (1 - u * taper);
    const th = thickness * (1 - u * 0.55);
    const ang = u * twist;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ring: readonly [number, number][] = [
      [-w, 0], [0, th], [w, 0], [0, -th]
    ];
    sections.push(ring.map(([rx, ry]) => [
      p[0] + rx * ca - ry * sa,
      p[1] + rx * sa + ry * ca,
      p[2]
    ]));
  }
  return loftSectionsMesh(sections, true, true);
}

/** Curved anatomical shoulder/hip armor plate (`sode` / `kusazuri`) lofted along an arc instead of a blocky box. */
function curvedArmorPlateMesh(width: number, height: number, archDepth: number, thickness = 0.024): RawMesh {
  const hw = width * 0.5;
  const cols = 5;
  const topRow: V3[] = [];
  const botRow: V3[] = [];
  for (let i = 0; i < cols; i += 1) {
    const u = (i / (cols - 1)) * 2 - 1;
    const zCurve = (1 - u * u) * archDepth;
    topRow.push([u * hw * 0.88, height * 0.5, zCurve]);
    botRow.push([u * hw * 1.06, -height * 0.5, zCurve * 1.12 + 0.015]);
  }
  const makeSection = (row: readonly V3[]): V3[] => [
    ...row,
    ...[...row].reverse().map((p): V3 => [p[0], p[1], p[2] - thickness])
  ];
  return loftSectionsMesh([makeSection(botRow), makeSection(topRow)], true, true);
}

/* ------------------------------------------------------------------ Sculpted Sengoku Character Parts (`+Z` forward, `+Y` up) */

function buildBodyMesh(id: CharacterId, c: RigColors, variant: ActorVisualVariant): RawMesh {
  const wide = id === "brute" ? 1.28 : id === "caster" ? 1.08 : 1.0;
  const pieces: RawMesh[] = [];

  // 1. Athletic V-taper Sengoku `uwagi` / `kariginu` upper torso sculpted via `latheMesh` + `subdivideSmoothMesh`
  const rawTorso = transformMesh(
    subdivideSmoothMesh(
      latheMesh(
        [
          [0, -0.14],
          [0.195 * wide, -0.11],
          [0.176 * wide, 0.06],
          [0.232 * wide, 0.27],
          [0.262 * wide, 0.45],
          [0.168 * wide, 0.56],
          [0, 0.585]
        ],
        16
      ),
      1,
      0.54
    ),
    { scale: [1.02, 1.0, 0.74] }
  );
  pieces.push(paintVerticalGradient(rawTorso, c.clothDark, c.cloth, 0.06));

  // 2. Flared split coat-skirt / pleated `hakama` hip-drape (`y in [-0.27, 0.07]`)
  const skirtFlare = id === "caster" ? 1.24 : 1.05;
  const hakama = subdivideSmoothMesh(
    transformMesh(
      latheMesh(
        [
          [0, -0.27],
          [0.268 * wide * skirtFlare, -0.24],
          [0.242 * wide * skirtFlare, -0.08],
          [0.192 * wide, 0.06],
          [0, 0.075]
        ],
        16
      ),
      { scale: [1.04, 1.0, 0.84] }
    ),
    1,
    0.45
  );
  pieces.push(paintVerticalGradient(hakama, c.clothDark, id === "caster" ? c.cloth : c.clothDark, 0.06));

  // 3. Archetype-specific armor cuirass, robes, straps, sashes & back silhouettes
  if (id === "soldier" || id === "brute") {
    // Curved lamellar `do` cuirass shell wrapping chest & back with gold `odoshi` lacing bands
    const doShell = subdivideSmoothMesh(
      transformMesh(
        latheMesh(
          [
            [0, 0.07],
            [0.215 * wide, 0.08],
            [0.248 * wide, 0.24],
            [0.262 * wide, 0.41],
            [0.185 * wide, 0.49],
            [0, 0.50]
          ],
          16
        ),
        { scale: [1.04, 1.0, 0.78] }
      ),
      1,
      0.48
    );
    pieces.push(paintVerticalGradient(doShell, c.clothDark, c.armor, 0.05));

    // Horizontal gold `odoshi` lacing ribs on the `do` cuirass
    for (const ry of [0.16, 0.27, 0.38]) {
      const rib = transformMesh(
        latheMesh([[0, -0.014], [0.256 * wide, -0.014], [0.262 * wide, 0], [0.256 * wide, 0.014], [0, 0.014]], 16),
        { pos: [0, ry, 0], scale: [1.04, 1.0, 0.79] }
      );
      pieces.push(tinted(rib, c.gold));
    }

    // 6 curved trapezoidal `kusazuri` tasset plates + gold lower hems
    const tassetCount = 6;
    for (let k = 0; k < tassetCount; k += 1) {
      const ang = (k / tassetCount) * Math.PI * 2 + Math.PI / tassetCount;
      const tx = Math.sin(ang) * 0.222 * wide;
      const tz = Math.cos(ang) * 0.182 * wide;
      const plateW = (id === "brute" ? 0.23 : 0.185) * wide;
      const plate = transformMesh(curvedArmorPlateMesh(plateW, 0.23, 0.032, 0.022), {
        pos: [tx, -0.11, tz],
        rot: [-0.24, ang, 0]
      });
      const hem = transformMesh(curvedArmorPlateMesh(plateW * 1.03, 0.045, 0.034, 0.026), {
        pos: [tx * 1.06, -0.205, tz * 1.06],
        rot: [-0.24, ang, 0]
      });
      pieces.push(tinted(plate, c.armor));
      pieces.push(tinted(hem, c.gold));
    }

    // Multi-tier curved `o-sode` samurai shoulder shields (3 overlapping curved plates per shoulder)
    for (const sx of [-1, 1] as const) {
      for (let tier = 0; tier < 3; tier += 1) {
        const sode = transformMesh(
          curvedArmorPlateMesh(0.24 - tier * 0.02, 0.105, 0.036, 0.022),
          {
            pos: [sx * (0.268 + tier * 0.022) * wide, 0.47 - tier * 0.062, 0],
            rot: [0, sx * Math.PI * 0.5, -sx * (0.28 + tier * 0.09)]
          }
        );
        pieces.push(tinted(sode, tier === 2 ? c.gold : c.armor));
      }
    }

    // Heavy Oni Guardian (`brute`): thick twisted crimson `tsuna` sacred waist rope + crossed `nio-dasuki` back cord + shoulder spikes
    if (id === "brute") {
      const tsunaRope = transformMesh(
        latheMesh([[0, -0.068], [0.255 * wide, -0.068], [0.285 * wide, 0], [0.255 * wide, 0.068], [0, 0.068]], 16),
        { pos: [0, 0.045, 0], scale: [1.05, 1.0, 0.84] }
      );
      pieces.push(tinted(tsunaRope, c.accent));
      for (const sx of [-1, 1] as const) {
        const spike = transformMesh(latheMesh([[0, 0], [0.032, 0], [0.008, 0.12], [0, 0.13]], 8), {
          pos: [sx * 0.31 * wide, 0.52, 0],
          rot: [0, 0, -sx * 0.48]
        });
        pieces.push(tinted(spike, c.gold));
      }
    } else {
      // Hawk Swordsman (`soldier`): crimson waist sash + twin `sashimono` gilded wing-crest fins on upper back
      const obi = transformMesh(
        latheMesh([[0, -0.052], [0.232 * wide, -0.052], [0.246 * wide, 0], [0.232 * wide, 0.052], [0, 0.052]], 16),
        { pos: [0, 0.04, 0], scale: [1.03, 1.0, 0.8] }
      );
      pieces.push(tinted(obi, c.gold));
    }
  } else if (id === "caster") {
    // Onmyoji Spirit Monk: ceremonial golden `kesa` stole + vermilion collar + floating ring of 7 `juzu` spirit prayer beads!
    for (const sx of [-1, 1] as const) {
      const lapel = tubeSweepMesh(
        [
          [sx * 0.11, 0.55, 0.11, 0.028],
          [sx * 0.06, 0.34, 0.185, 0.028],
          [0, 0.12, 0.19, 0.026]
        ],
        8,
        true
      );
      pieces.push(tinted(lapel, c.accent));
    }
    const stole = tubeSweepMesh(
      [
        [0.18, 0.52, -0.12, 0.042],
        [0.19, 0.48, 0.13, 0.044],
        [-0.08, 0.21, 0.195, 0.046],
        [-0.21, -0.04, 0.08, 0.044],
        [-0.14, 0.24, -0.18, 0.042],
        [0.18, 0.52, -0.12, 0.042]
      ],
      8,
      true
    );
    pieces.push(tinted(stole, c.gold));

    const obi = transformMesh(
      latheMesh([[0, -0.06], [0.245 * wide, -0.06], [0.26 * wide, 0], [0.245 * wide, 0.06], [0, 0.06]], 16),
      { pos: [0, 0.04, 0], scale: [1.04, 1.0, 0.82] }
    );
    pieces.push(tinted(obi, c.gold));

    // Floating halo of 7 golden & spirit-violet prayer orbs behind the monk's shoulders
    for (let b = 0; b < 7; b += 1) {
      const ang = -Math.PI * 0.72 + (b / 6) * Math.PI * 1.44;
      const bx = Math.sin(ang) * 0.38;
      const by = 0.42 + Math.cos(ang) * 0.28;
      const orb = transformMesh(icosphereFacetMesh(b % 2 === 0 ? 0.042 : 0.034, 1, 0.04, b + 3), {
        pos: [bx, by, -0.16]
      });
      pieces.push(tinted(orb, b % 2 === 0 ? c.gold : c.accentBright));
    }
  } else {
    // Shinobi Hero, Sunfire Sage, Demon-Ember, Clone & Kitsune Scout:
    // Sculpted quilted vest + fiery persimmon kimono lapels + iconic diagonal leather/gold sword harness + knotted obi & flowing scarf!
    const vest = subdivideSmoothMesh(
      transformMesh(
        latheMesh(
          [
            [0, 0.10],
            [0.205 * wide, 0.11],
            [0.242 * wide, 0.27],
            [0.252 * wide, 0.42],
            [0.175 * wide, 0.51],
            [0, 0.52]
          ],
          16
        ),
        { scale: [1.02, 1.0, 0.77] }
      ),
      1,
      0.5
    );
    pieces.push(paintVerticalGradient(vest, c.clothDark, c.armor, 0.05));

    // Overlapping V-neck collar lapels on both chest (`+Z`) and upper back (`-Z`)
    for (const sx of [-1, 1] as const) {
      const frontLapel = tubeSweepMesh(
        [
          [sx * 0.12, 0.54, 0.08, 0.024],
          [sx * 0.07, 0.35, 0.19, 0.025],
          [0, 0.15, 0.185, 0.022]
        ],
        8,
        true
      );
      const backTrim = tubeSweepMesh(
        [
          [sx * 0.13, 0.53, -0.09, 0.02],
          [sx * 0.16, 0.28, -0.175, 0.02],
          [sx * 0.12, 0.08, -0.165, 0.018]
        ],
        8,
        true
      );
      pieces.push(tinted(frontLapel, c.accentBright));
      pieces.push(tinted(backTrim, c.accent));
    }

    // 4 agile curved shinobi hip `kusazuri` panels with crimson/gold trim
    for (let k = 0; k < 4; k += 1) {
      const ang = (k / 4) * Math.PI * 2 + Math.PI * 0.25;
      const tx = Math.sin(ang) * 0.215 * wide;
      const tz = Math.cos(ang) * 0.175 * wide;
      const flap = transformMesh(curvedArmorPlateMesh(0.18, 0.21, 0.028, 0.018), {
        pos: [tx, -0.11, tz],
        rot: [-0.22, ang, 0]
      });
      const flapHem = transformMesh(curvedArmorPlateMesh(0.185, 0.036, 0.03, 0.022), {
        pos: [tx * 1.05, -0.195, tz * 1.05],
        rot: [-0.22, ang, 0]
      });
      pieces.push(tinted(flap, c.cloth));
      pieces.push(tinted(flapHem, c.accentBright));
    }

    // Curved layered crescent shinobi shoulder guards (`sode`)
    for (const sx of [-1, 1] as const) {
      for (let tier = 0; tier < 2; tier += 1) {
        const guard = transformMesh(
          curvedArmorPlateMesh(0.20 - tier * 0.025, 0.095, 0.034, 0.02),
          {
            pos: [sx * (0.255 + tier * 0.018) * wide, 0.465 - tier * 0.055, 0],
            rot: [0, sx * Math.PI * 0.5, -sx * (0.3 + tier * 0.1)]
          }
        );
        pieces.push(tinted(guard, tier === 0 ? c.armor : c.accent));
      }
    }

    // Iconic diagonal persimmon-gold sword baldric strap wrapping chest AND back (matches pre-5.5.4 hero design!)
    const baldricLoop: V4[] = [
      [-0.17, 0.50, -0.14, 0.032],
      [-0.02, 0.30, -0.195, 0.034],
      [0.16, 0.09, -0.155, 0.032],
      [0.22, 0.08, 0.02, 0.03],
      [0.14, 0.16, 0.185, 0.032],
      [-0.04, 0.35, 0.195, 0.034],
      [-0.18, 0.50, 0.08, 0.032],
      [-0.17, 0.50, -0.14, 0.032]
    ];
    pieces.push(tinted(tubeSweepMesh(baldricLoop, 8, true), id === "scout" ? c.clothDark : c.accentBright));
    // Golden baldric ring clasp on back & chest
    pieces.push(tinted(transformMesh(latheMesh([[0.022, -0.012], [0.044, -0.012], [0.044, 0.012], [0.022, 0.012]], 12, true), { pos: [-0.02, 0.30, -0.20], rot: [Math.PI * 0.5, 0, 0] }), c.gold));
    pieces.push(tinted(transformMesh(latheMesh([[0.022, -0.012], [0.044, -0.012], [0.044, 0.012], [0.022, 0.012]], 12, true), { pos: [-0.02, 0.33, 0.20], rot: [Math.PI * 0.5, 0, 0] }), c.gold));

    // Kitsune Scout (`scout`): 3 gleaming steel throwing kunai holstered across chest strap
    if (id === "scout") {
      for (let k = -1; k <= 1; k += 1) {
        const kunai = transformMesh(
          latheMesh([[0, 0], [0.018, 0.04], [0.006, 0.13], [0, 0.14]], 6),
          { pos: [-0.02 + k * 0.055, 0.28 - k * 0.05, 0.205], rot: [0, 0, -0.62] }
        );
        pieces.push(tinted(kunai, c.steel));
      }
    }

    // Thick wrapped crimson-persimmon `obi` waist sash + sculpted back bow knot + twin trailing waist ribbons!
    const obi = transformMesh(
      latheMesh([[0, -0.062], [0.232 * wide, -0.062], [0.252 * wide, 0], [0.232 * wide, 0.062], [0, 0.062]], 16),
      { pos: [0, 0.04, 0], scale: [1.04, 1.0, 0.82] }
    );
    pieces.push(paintVerticalGradient(obi, c.accent, c.accentBright, 0.04));
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.016], [0.046, -0.016], [0.046, 0.016], [0, 0.016]], 12, true), { pos: [0, 0.04, 0.205], rot: [Math.PI * 0.5, 0, 0] }), c.gold));

    // Back `obi` knot & twin trailing sash tails (prominently visible from chase camera!)
    const obiKnot = subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.13, 0.085, 0.075, 0.024), { pos: [0, 0.045, -0.195] }), 1, 0.5);
    pieces.push(tinted(obiKnot, c.accentBright));
    for (const side of [-1, 1] as const) {
      const sashTail = sculptedRibbonMesh(
        [
          [side * 0.035, 0.03, -0.205],
          [side * 0.085, -0.09, -0.255],
          [side * 0.125, -0.24, -0.31]
        ],
        0.046,
        0.012,
        0.35,
        side * 0.35
      );
      pieces.push(paintVerticalGradient(sashTail, c.accentBright, c.accent, 0.04));
    }

    // Sculpted high `erimaki` shinobi scarf collar + twin wind-sculpted scarf ribbons streaming behind `-Z`
    const scarfCollar = subdivideSmoothMesh(
      transformMesh(
        latheMesh([[0, 0.485], [0.19 * wide, 0.485], [0.218 * wide, 0.548], [0.172 * wide, 0.60], [0, 0.605]], 16),
        { scale: [1.02, 1.0, 0.9] }
      ),
      1,
      0.52
    );
    pieces.push(paintVerticalGradient(scarfCollar, c.accent, c.accentBright, 0.05));

    for (const side of [-1, 1] as const) {
      const scarfTail = sculptedRibbonMesh(
        [
          [side * 0.065, 0.535, -0.14],
          [side * 0.145, 0.475, -0.34],
          [side * 0.215, 0.39, -0.58],
          [side * 0.175, 0.32, -0.82]
        ],
        variant === "ember" ? 0.072 : 0.062,
        0.014,
        0.52,
        side * 0.55
      );
      pieces.push(paintVerticalGradient(scarfTail, c.accentBright, c.accent, 0.06));
    }

    // Curved `sori` crimson-lacquered katana scabbard (`saya`) + gold `koiguchi`/`kojiri` + gold `tsuba` + wrapped `tsuka` hilt
    const sayaSpine = catmullRomSpline3(
      [
        [-0.145, 0.53, -0.205],
        [0.02, 0.27, -0.218],
        [0.215, -0.03, -0.19]
      ],
      5,
      false
    ).map((p, idx, arr): V4 => [p[0], p[1], p[2], 0.03 * (1 - (idx / Math.max(1, arr.length - 1)) * 0.25)]);
    pieces.push(tinted(transformMesh(tubeSweepMesh(sayaSpine, 8, true), { scale: [0.75, 1.0, 1.15] }), c.scabbard));
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.064, 0.095, 0.07, 0.014), { pos: [-0.045, 0.38, -0.212], rot: [0.08, 0, -0.56] }), c.gold));
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.012], [0.068, -0.012], [0.068, 0.012], [0, 0.012]], 14, true), { pos: [-0.155, 0.55, -0.205], rot: [0.08, 0, -0.56] }), c.gold));
    pieces.push(tinted(transformMesh(tubeSweepMesh([[-0.16, 0.56, -0.205, 0.024], [-0.28, 0.74, -0.215, 0.022]], 8, true), {}), c.clothDark));
    pieces.push(tinted(transformMesh(icosphereFacetMesh(0.028, 1, 0.04, 5), { pos: [-0.29, 0.755, -0.218] }), c.gold));
  }

  return bakeMeshCavityAO(mergeColoredRawMeshes(pieces), 0.24);
}

function buildHeadParts(id: CharacterId, c: RigColors, variant: ActorVisualVariant): { readonly main: RawMesh; readonly eyes: RawMesh } {
  const pieces: RawMesh[] = [];
  const eyeL = subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.05, 0.024, 0.03, 0.008), { pos: [0.055, 0.194, 0.148], rot: [0, 0.14, -0.16] }), 1, 0.4);
  const eyeR = subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.05, 0.024, 0.03, 0.008), { pos: [-0.055, 0.194, 0.148], rot: [0, -0.14, 0.16] }), 1, 0.4);
  const eyes = paintMeshColors(mergeColoredRawMeshes([eyeL, eyeR]), "#ffffff");

  // Smooth organic cranium (`subdivideSmoothMesh`)
  const cranium = transformMesh(
    subdivideSmoothMesh(
      latheMesh([[0, 0.0], [0.094, 0.03], [0.15, 0.12], [0.158, 0.215], [0.128, 0.305], [0, 0.335]], 16),
      1,
      0.56
    ),
    { scale: [0.96, 1.0, 1.04] }
  );

  if (id === "soldier") {
    // Hawk Swordsman: dark iron & crimson `kabuto` + flared `shikoro` neck lamellae + hooked Karasu-Tengu hawk-beak mask + swept golden-crimson Hawk-Wing crest!
    pieces.push(tinted(cranium, c.clothDark));
    const kabutoBowl = subdivideSmoothMesh(
      latheMesh([[0, 0.185], [0.178, 0.185], [0.186, 0.275], [0.138, 0.35], [0.042, 0.385], [0, 0.392]], 16),
      1,
      0.52
    );
    pieces.push(tinted(kabutoBowl, c.mask));

    // Flared `shikoro` tiered crimson-lacquer neck guard sweeping around back and sides
    const shikoroSections: V3[][] = [];
    for (let s = 0; s <= 3; s += 1) {
      const t = s / 3;
      const r = 0.178 + t * 0.092;
      const y = 0.215 - t * 0.125;
      const ring: V3[] = [];
      for (let k = 0; k < 8; k += 1) {
        const a = ((k / 7) * 1.48 - 0.74) * Math.PI + Math.PI;
        ring.push([Math.sin(a) * r, y, Math.cos(a) * r]);
      }
      for (let k = 7; k >= 0; k -= 1) {
        const a = ((k / 7) * 1.48 - 0.74) * Math.PI + Math.PI;
        ring.push([Math.sin(a) * (r - 0.024), y, Math.cos(a) * (r - 0.024)]);
      }
      shikoroSections.push(ring);
    }
    pieces.push(tinted(loftSectionsMesh(shikoroSections, true, false), c.armor));

    // Visor brim + sculpted hooked hawk-beak Tengu `menpo` faceguard
    pieces.push(tinted(transformMesh(curvedArmorPlateMesh(0.26, 0.042, 0.055, 0.018), { pos: [0, 0.23, 0.138], rot: [0.35, 0, 0] }), c.gold));
    const menpoMask = subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.186, 0.118, 0.14, 0.036), { pos: [0, 0.112, 0.078] }), 1, 0.5);
    pieces.push(tinted(menpoMask, c.armor));
    const hawkBeak = tubeSweepMesh(
      [
        [0, 0.155, 0.135, 0.042],
        [0, 0.135, 0.205, 0.026],
        [0, 0.095, 0.242, 0.008]
      ],
      8,
      true
    );
    pieces.push(tinted(hawkBeak, c.gold));

    // Swept golden Feathered Hawk-Wing `maedate` crest + twin crimson/gold side wing plumes!
    for (const sx of [-1, 1] as const) {
      const wingPoly: V2[] = [
        [0, 0],
        [sx * 0.06, 0.02],
        [sx * 0.18, 0.13],
        [sx * 0.24, 0.26],
        [sx * 0.15, 0.22],
        [sx * 0.19, 0.15],
        [sx * 0.11, 0.14],
        [sx * 0.04, 0.08]
      ];
      pieces.push(tinted(transformMesh(extrudePolygonMesh(wingPoly, 0.018, 0.004, true), { pos: [0, 0.245, 0.168], rot: [-0.2, -sx * 0.18, 0] }), c.gold));
      const sidePlume = sculptedRibbonMesh(
        [
          [sx * 0.165, 0.25, 0.04],
          [sx * 0.23, 0.34, -0.05],
          [sx * 0.26, 0.44, -0.16]
        ],
        0.042,
        0.01,
        0.6,
        sx * 0.3
      );
      pieces.push(paintVerticalGradient(sidePlume, c.armor, c.gold, 0.04));
    }
  } else if (id === "brute") {
    // Heavy Oni Guardian: horned `suji-kabuto` + crimson `shikoro` + fanged scarlet Oni demon mask with ivory tusks + wild mane
    pieces.push(tinted(cranium, c.mask));
    const kabuto = subdivideSmoothMesh(
      latheMesh([[0, 0.18], [0.198, 0.18], [0.205, 0.295], [0.15, 0.38], [0, 0.415]], 16),
      1,
      0.52
    );
    pieces.push(tinted(kabuto, c.cloth));
    pieces.push(tinted(transformMesh(curvedArmorPlateMesh(0.42, 0.16, 0.09, 0.028), { pos: [0, 0.145, -0.14], rot: [0.18, Math.PI, 0] }), c.armor));
    // Wild white `aguma` yak-hair demon mane flowing from back of helmet
    for (let m = -2; m <= 2; m += 1) {
      const mane = tubeSweepMesh(
        [
          [m * 0.045, 0.22, -0.17, 0.036],
          [m * 0.065, 0.11, -0.25, 0.028],
          [m * 0.08, -0.02, -0.29, 0.012]
        ],
        7,
        true
      );
      pieces.push(paintVerticalGradient(mane, c.hairTip, c.hair, 0.05));
    }
    // Fierce scarlet Oni `menpo` jaw guard + curved ivory tusks + sweeping golden `kuwagata` horns
    pieces.push(tinted(transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.215, 0.125, 0.165, 0.038), 1, 0.48), { pos: [0, 0.11, 0.082] }), c.mask));
    for (const sx of [-1, 1] as const) {
      const tusk = tubeSweepMesh(
        [
          [sx * 0.068, 0.088, 0.148, 0.02],
          [sx * 0.086, 0.125, 0.188, 0.014],
          [sx * 0.078, 0.172, 0.192, 0.005]
        ],
        8,
        true
      );
      pieces.push(tinted(tusk, "#f7f1e3"));
      const hornPts = catmullRomSpline3(
        [[sx * 0.068, 0.285, 0.148], [sx * 0.185, 0.41, 0.168], [sx * 0.275, 0.57, 0.105]],
        5
      ).map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.012, 0.046 * (1 - k / a.length))]);
      pieces.push(tinted(tubeSweepMesh(hornPts, 8, true), c.gold));
    }
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.012], [0.056, -0.012], [0.056, 0.012], [0, 0.012]], 14, true), { pos: [0, 0.305, 0.19], rot: [Math.PI * 0.5 - 0.2, 0, 0] }), c.gold));
  } else if (id === "caster") {
    // Onmyoji Spirit Monk: tall black-lacquered `tate-eboshi` court hat with gold sun-seal + contoured porcelain spirit mask with vermilion markings
    pieces.push(tinted(cranium, c.clothDark));
    const eboshi = subdivideSmoothMesh(
      latheMesh([[0, 0.22], [0.152, 0.22], [0.142, 0.36], [0.118, 0.50], [0.068, 0.60], [0, 0.62]], 16),
      1,
      0.5
    );
    pieces.push(paintVerticalGradient(eboshi, "#141021", "#2c1d47", 0.04));
    // Gold headband rim & sun-crest on `eboshi`
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.016], [0.158, -0.016], [0.158, 0.016], [0, 0.016]], 16, true), { pos: [0, 0.235, 0] }), c.gold));
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.01], [0.046, -0.01], [0.046, 0.01], [0, 0.01]], 12, true), { pos: [0, 0.36, 0.145], rot: [Math.PI * 0.5, 0, 0] }), c.gold));

    // Smooth contoured oval ivory-porcelain spirit mask (`#faf3e8`) + vermilion cheek/brow markings
    const spiritMask = subdivideSmoothMesh(
      transformMesh(
        latheMesh([[0, 0.04], [0.068, 0.055], [0.112, 0.13], [0.115, 0.22], [0.082, 0.275], [0, 0.285]], 14),
        { pos: [0, 0, 0.068], scale: [0.98, 1.0, 0.78] }
      ),
      1,
      0.54
    );
    pieces.push(tinted(spiritMask, c.mask));
    for (const sx of [-1, 1] as const) {
      pieces.push(tinted(transformMesh(bevelBoxMesh(0.082, 0.024, 0.024, 0.007), { pos: [sx * 0.062, 0.242, 0.154], rot: [0, 0, sx * 0.34] }), c.accent));
      pieces.push(tinted(transformMesh(bevelBoxMesh(0.045, 0.016, 0.02, 0.005), { pos: [sx * 0.072, 0.14, 0.145], rot: [0, 0, -sx * 0.25] }), c.accent));
    }
  } else if (id === "scout") {
    // Kitsune Ranged Raider: crimson shinobi cowl + sculpted porcelain Kitsune fox mask with tapered snout, vermilion markings & tall fox ears!
    pieces.push(paintVerticalGradient(cranium, c.clothDark, c.cloth, 0.05));
    const foxMask = subdivideSmoothMesh(
      mergeColoredRawMeshes([
        transformMesh(
          latheMesh([[0, 0.05], [0.072, 0.065], [0.112, 0.14], [0.114, 0.225], [0.08, 0.275], [0, 0.285]], 14),
          { pos: [0, 0, 0.062], scale: [0.98, 1.0, 0.78] }
        ),
        tubeSweepMesh([[0, 0.15, 0.12, 0.056], [0, 0.138, 0.195, 0.032], [0, 0.132, 0.245, 0.014]], 10, true)
      ]),
      1,
      0.52
    );
    pieces.push(tinted(foxMask, c.mask));
    // Black fox nose tip + vermilion blaze markings + tall pointed Kitsune ears
    pieces.push(tinted(transformMesh(icosphereFacetMesh(0.018, 1, 0.02, 2), { pos: [0, 0.134, 0.25] }), "#181c28"));
    for (const sx of [-1, 1] as const) {
      const ear = subdivideSmoothMesh(latheMesh([[0, 0], [0.054, 0.022], [0.02, 0.155], [0, 0.172]], 10), 1, 0.45);
      pieces.push(tinted(transformMesh(ear, { pos: [sx * 0.088, 0.292, 0.08], rot: [0.16, 0, -sx * 0.22] }), c.mask));
      const innerEar = subdivideSmoothMesh(latheMesh([[0, 0.01], [0.032, 0.028], [0.01, 0.13], [0, 0.14]], 8), 1, 0.4);
      pieces.push(tinted(transformMesh(innerEar, { pos: [sx * 0.088, 0.296, 0.098], rot: [0.16, 0, -sx * 0.22] }), c.accent));
    }
  } else {
    // Shinobi Hero, Sunfire Sage, Demon-Ember & Spirit Clone:
    // Sculpted shinobi cowl + dynamic windswept spiky hair/hood crest + anatomical `fukumen` mask + `hitai-ate` headband & trailing ribbons!
    const hood = subdivideSmoothMesh(
      transformMesh(
        latheMesh([[0, 0.01], [0.158, 0.055], [0.174, 0.195], [0.145, 0.312], [0.05, 0.352], [0, 0.36]], 16),
        { pos: [0, 0, -0.012], scale: [0.98, 1.0, 1.06] }
      ),
      1,
      0.56
    );
    pieces.push(paintVerticalGradient(hood, c.clothDark, c.cloth, 0.05));

    // Swept dynamic spiky shinobi hair/crest plumes crowning the top-back of the head (eliminates round cue-ball look from chase camera!)
    const spikeSpecs: readonly [number, number, number, number, number][] = [
      [0, 0.33, -0.04, 0.22, 0],
      [-0.068, 0.31, -0.05, 0.19, -0.26],
      [0.068, 0.31, -0.05, 0.19, 0.26],
      [-0.042, 0.26, -0.12, 0.18, -0.18],
      [0.042, 0.26, -0.12, 0.18, 0.18]
    ];
    for (let s = 0; s < spikeSpecs.length; s += 1) {
      const [ox, oy, oz, len, splay] = spikeSpecs[s]!;
      const spike = tubeSweepMesh(
        [
          [ox, oy, oz, 0.042],
          [ox + splay * 0.22, oy + len * 0.42, oz - len * 0.62, 0.026],
          [ox + splay * 0.38, oy + len * 0.68, oz - len * 1.15, 0.006]
        ],
        7,
        true
      );
      pieces.push(paintVerticalGradient(spike, c.hair, c.hairTip, 0.04));
    }

    // Brow skin bridge + sculpted nose-bridge `fukumen` lower face-mask
    const brow = subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.165, 0.064, 0.065, 0.02), { pos: [0, 0.196, 0.122] }), 1, 0.48);
    pieces.push(tinted(brow, c.skin));
    const lowerMask = subdivideSmoothMesh(
      transformMesh(
        latheMesh([[0, 0.035], [0.068, 0.045], [0.102, 0.105], [0.098, 0.168], [0, 0.176]], 14),
        { pos: [0, 0, 0.062], scale: [1.0, 1.0, 0.96] }
      ),
      1,
      0.52
    );
    pieces.push(tinted(lowerMask, c.mask));

    // Wrapped crimson-persimmon `hitai-ate` headband around whole head + engraved steel/gold forehead protector plate
    const headbandBand = transformMesh(
      latheMesh([[0, -0.026], [0.176, -0.026], [0.182, 0], [0.176, 0.026], [0, 0.026]], 16),
      { pos: [0, 0.246, -0.008], scale: [0.99, 1.0, 1.06] }
    );
    pieces.push(tinted(headbandBand, c.accentBright));
    pieces.push(tinted(transformMesh(curvedArmorPlateMesh(0.145, 0.046, 0.022, 0.012), { pos: [0, 0.248, 0.154] }), id === "sage" ? c.gold : c.steel));

    // Sunfire Sage (`sage`, `std`): radiant golden sun-halo crest above forehead
    if (id === "sage" && variant === "std") {
      const sunHalo = transformMesh(
        latheMesh([[0.055, -0.008], [0.092, -0.008], [0.092, 0.008], [0.055, 0.008]], 16, true),
        { pos: [0, 0.34, 0.12], rot: [Math.PI * 0.5 - 0.15, 0, 0] }
      );
      pieces.push(tinted(sunHalo, c.gold));
    }

    // Demon-Ember (`variant === "ember"`): swept obsidian-and-molten-gold demon horns rising from the shinobi cowl!
    if (variant === "ember") {
      for (const sx of [-1, 1] as const) {
        const horn = tubeSweepMesh(
          [
            [sx * 0.078, 0.285, 0.12, 0.036],
            [sx * 0.145, 0.39, 0.10, 0.022],
            [sx * 0.185, 0.49, 0.03, 0.006]
          ],
          8,
          true
        );
        pieces.push(paintVerticalGradient(horn, "#1f121c", c.gold, 0.04));
      }
    }

    // Back headband knot + twin wind-swept headband ribbons
    pieces.push(tinted(transformMesh(icosphereFacetMesh(0.032, 1, 0.05, 7), { pos: [0, 0.238, -0.192] }), c.accentBright));
    for (const sx of [-1, 1] as const) {
      const tail = sculptedRibbonMesh(
        [
          [sx * 0.028, 0.232, -0.195],
          [sx * 0.095, 0.185, -0.32],
          [sx * 0.145, 0.12, -0.46]
        ],
        0.028,
        0.008,
        0.55,
        sx * 0.4
      );
      pieces.push(paintVerticalGradient(tail, c.accentBright, c.accent, 0.04));
    }
  }

  return {
    main: bakeMeshCavityAO(mergeColoredRawMeshes(pieces), 0.24),
    eyes
  };
}

function buildLegMesh(id: CharacterId, c: RigColors): RawMesh {
  const wide = id === "brute" ? 1.26 : 1.0;
  const pieces: RawMesh[] = [];

  // 1. Billowed `tattsuke-bakama` upper shinobi/samurai trousers tapering cleanly into gathered knee cuff with natural knee bend
  const thigh = sculptHumanoidLimbMesh(
    [
      [0, 0.04, 0, 0.118 * wide],
      [0, -0.14, 0.016, 0.136 * wide],
      [0, -0.28, 0.026, 0.118 * wide],
      [0, -0.365, 0.022, 0.084 * wide]
    ],
    14,
    0.16
  );
  pieces.push(paintVerticalGradient(thigh, c.clothDark, c.cloth, 0.06));

  // 2. Crisp cream/wrapped `kyahan` shin gaiter (`y in [-0.35, -0.66]`) with subtle calf taper & knee bend
  const calf = sculptHumanoidLimbMesh(
    [
      [0, -0.35, 0.022, 0.084 * wide],
      [0, -0.46, -0.008, 0.085 * wide],
      [0, -0.58, -0.016, 0.066 * wide],
      [0, -0.665, -0.01, 0.056 * wide]
    ],
    14,
    0.14
  );
  pieces.push(paintVerticalGradient(calf, c.wrapShade, c.wrap, 0.05));

  // Crisscross shinobi cord bindings around the `kyahan` ankle wraps (matches pre-5.5.4 hero wraps!)
  for (const wy of [-0.43, -0.51, -0.59]) {
    const band = transformMesh(
      latheMesh([[0, -0.011], [0.082 * wide, -0.011], [0.085 * wide, 0], [0.082 * wide, 0.011], [0, 0.011]], 12),
      { pos: [0, wy, -0.01] }
    );
    pieces.push(tinted(band, id === "brute" || id === "soldier" ? c.gold : c.clothDark));
  }

  // Contoured knee `tateage` cap + front `suneate` shin-plate (heavy armor on samurai/brute, sleek knee-pad on shinobi)
  const kneeCap = transformMesh(curvedArmorPlateMesh(0.115 * wide, 0.095, 0.032, 0.02), {
    pos: [0, -0.345, 0.068 * wide]
  });
  pieces.push(tinted(kneeCap, id === "brute" || id === "soldier" ? c.gold : c.armor));
  if (id === "brute" || id === "soldier") {
    const suneate = transformMesh(curvedArmorPlateMesh(0.11 * wide, 0.24, 0.032, 0.02), {
      pos: [0, -0.49, 0.055 * wide],
      rot: [-0.06, 0, 0]
    });
    pieces.push(tinted(suneate, c.armor));
  }

  // 3. Sculpted split-toe `tabi` boot + woven straw `waraji` sole & crimson ankle cord!
  const bootUpper = subdivideSmoothMesh(
    transformMesh(
      sculptHumanoidLimbMesh(
        [
          [0, -0.685, -0.065, 0.062 * wide],
          [0, -0.692, 0.035, 0.066 * wide],
          [0, -0.702, 0.135, 0.052 * wide]
        ],
        12,
        0.18
      ),
      { scale: [1.06, 0.84, 1.0] }
    ),
    1,
    0.45
  );
  pieces.push(tinted(bootUpper, c.boot));
  const strawSole = transformMesh(bevelBoxMesh(0.126 * wide, 0.028, 0.245, 0.01), { pos: [0, -0.732, 0.038] });
  pieces.push(tinted(strawSole, "#cfa26b"));
  const ankleStrap = transformMesh(
    latheMesh([[0, -0.012], [0.068 * wide, -0.012], [0.068 * wide, 0.012], [0, 0.012]], 12),
    { pos: [0, -0.655, -0.01] }
  );
  pieces.push(tinted(ankleStrap, c.accent));

  return bakeMeshCavityAO(mergeColoredRawMeshes(pieces), 0.24);
}

function buildArmMesh(id: CharacterId, c: RigColors): RawMesh {
  const wide = id === "brute" ? 1.26 : 1.0;
  const pieces: RawMesh[] = [];

  if (id === "caster") {
    // Onmyoji Spirit Monk: wide draped Heian `kariginu` bell sleeve trimmed in gold & vermilion silk!
    const bellSleeve = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          [[0, 0.03, 0.075], [0.075, 0.03, 0], [0, 0.03, -0.075], [-0.075, 0.03, 0]],
          [[0, -0.18, 0.11], [0.105, -0.18, -0.02], [0, -0.24, -0.16], [-0.105, -0.18, -0.02]],
          [[0, -0.44, 0.13], [0.115, -0.46, -0.04], [0, -0.56, -0.24], [-0.115, -0.46, -0.04]],
          [[0, -0.53, 0.08], [0.065, -0.53, 0.02], [0, -0.56, -0.08], [-0.065, -0.53, 0.02]]
        ],
        true,
        true
      ),
      1,
      0.48
    );
    pieces.push(paintVerticalGradient(bellSleeve, c.clothDark, c.cloth, 0.06));
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.02], [0.078, -0.02], [0.078, 0.02], [0, 0.02]], 12), { pos: [0, -0.52, 0.02] }), c.gold));
  } else {
    // Athletic bent-elbow upper sleeve (`sculptHumanoidLimbMesh` curving naturally forward at the forearm)
    const upperArm = sculptHumanoidLimbMesh(
      [
        [0, 0.03, 0, 0.086 * wide],
        [0, -0.13, -0.008, 0.094 * wide],
        [0, -0.28, -0.015, 0.068 * wide]
      ],
      12,
      0.15
    );
    pieces.push(paintVerticalGradient(upperArm, c.clothDark, c.cloth, 0.05));

    // Wrapped forearm + contoured `tekko` / `kote` bracer curving forward to wrist `[0, -0.53, 0.065]`
    const forearm = sculptHumanoidLimbMesh(
      [
        [0, -0.265, -0.015, 0.07 * wide],
        [0, -0.395, 0.024, 0.068 * wide],
        [0, -0.53, 0.065, 0.052 * wide]
      ],
      12,
      0.12
    );
    pieces.push(paintVerticalGradient(forearm, c.wrapShade, c.wrap, 0.04));

    const bracerPlate = transformMesh(curvedArmorPlateMesh(0.086 * wide, 0.20, 0.026, 0.018), {
      pos: [0, -0.40, 0.062 * wide],
      rot: [-0.28, 0, 0]
    });
    pieces.push(tinted(bracerPlate, id === "brute" || id === "soldier" ? c.armor : c.clothDark));
    const wristBand = transformMesh(
      latheMesh([[0, -0.018], [0.06 * wide, -0.018], [0.06 * wide, 0.018], [0, 0.018]], 12),
      { pos: [0, -0.515, 0.058], rot: [-0.28, 0, 0] }
    );
    pieces.push(tinted(wristBand, c.accentBright));
  }

  // Sculpted hand with fingerless `tekko` back-plate + exposed skin fingers & thumb
  const palm = subdivideSmoothMesh(
    transformMesh(bevelBoxMesh(0.082 * wide, 0.088, 0.092, 0.028), { pos: [0, -0.57, 0.078], rot: [-0.25, 0, 0] }),
    1,
    0.52
  );
  pieces.push(tinted(palm, c.skin));
  const handGuard = transformMesh(curvedArmorPlateMesh(0.076 * wide, 0.062, 0.018, 0.014), {
    pos: [0, -0.562, 0.105],
    rot: [-0.25, 0, 0]
  });
  pieces.push(tinted(handGuard, c.boot));

  return bakeMeshCavityAO(mergeColoredRawMeshes(pieces), 0.24);
}

export function buildProceduralActorNodes(
  slot: number,
  id: CharacterId,
  castShadow: boolean,
  variant?: ActorVisualVariant
): AuraNodeBuilder[] {
  const resolvedVariant: ActorVisualVariant = variant ?? (slot >= 1 && slot <= 3 ? "clone" : "std");
  const isHeroFamily = slot === 0 || (slot >= 1 && slot <= 3) || slot === 12 || resolvedVariant === "ember";
  const c = colorsForSlot(id, resolvedVariant);
  const cachePrefix = `ninja:actor:v4:${id}:${resolvedVariant}`;

  const mkSingle = (part: Exclude<ProceduralPartKey, "head">, build: () => RawMesh, partShadow: boolean): AuraNodeBuilder => {
    const nodeId = `actor-${slot}-${part}`;
    const spec = memoizeGeometry(`${cachePrefix}:${part}`, () => mergeRawMeshes([build()]));
    return geometry.custom(spec, {
      name: nodeId,
      material: c.baseMat,
      position: [0, -500, 0],
      castShadow: partShadow,
      receiveShadow: true,
      visible: false
    }).runtime({ id: nodeId });
  };

  const headNode = (() => {
    const nodeId = `actor-${slot}-head`;
    const mainSpec = memoizeGeometry(`${cachePrefix}:head:main`, () => mergeRawMeshes([buildHeadParts(id, c, resolvedVariant).main]));
    const eyeSpec = memoizeGeometry(`${cachePrefix}:head:eyes`, () => mergeRawMeshes([buildHeadParts(id, c, resolvedVariant).eyes]));
    return group(
      nodeId,
      [
        geometry.custom(mainSpec, {
          name: `${nodeId}-main`,
          material: c.baseMat,
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
        id: nodeId,
        position: [0, -500, 0],
        visible: false
      }
    ).runtime({ id: nodeId });
  })();

  const limbShadow = castShadow && isHeroFamily;

  return [
    mkSingle("body", () => buildBodyMesh(id, c, resolvedVariant), castShadow),
    headNode,
    mkSingle("legL", () => buildLegMesh(id, c), limbShadow),
    mkSingle("legR", () => buildLegMesh(id, c), limbShadow),
    mkSingle("armL", () => buildArmMesh(id, c), limbShadow),
    mkSingle("armR", () => buildArmMesh(id, c), limbShadow)
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
