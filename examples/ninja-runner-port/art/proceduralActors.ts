/**
 * Articulated multi-material `@aura3d/engine` Sengoku character rigs for Shadowstep Gauntlet (`examples/ninja-runner-port`).
 *
 * Replaces all 6 Meshy character `.glb`s (`hero`, `soldier`, `brute`, `sage`, `caster`, `scout`) with sculpted
 * `@aura3d/engine` scene nodes (`body`, `head`, `legL`, `legR`, `armL`, `armR`) using `subdivideSmoothMesh`,
 * `sculptHumanoidLimbMesh`, vertex-painted cavity AO (`paintMeshColors` + `bakeMeshCavityAO`), and `memoizeGeometry`
 * so each articulated limb renders as a single GPU draw call while preserving every joint transform (`Spine02`,
 * `RightForeArm`, `RightHand`, `LeftForeArm`, `LeftHand`) for scarf anchoring, weapon aiming, spirit orbs, and `probeBones`.
 */
import { geometry, group, material, type AuraApp, type AuraMaterialSpec, type AuraNodeBuilder, type TypedGLBActor } from "@aura3d/engine";
import {
  bakeMeshCavityAO,
  bevelBoxMesh,
  catmullRomSpline3,
  extrudePolygonMesh,
  latheMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
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

export const PROCEDURAL_PART_KEYS = ["body", "head", "legL", "legR", "armL", "armR"] as const;
export type ProceduralPartKey = (typeof PROCEDURAL_PART_KEYS)[number];

const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/* ------------------------------------------------------------------ Palette & Coalesced PBR Materials */

const MAT_ACTOR_SHEEN_BODY = unnamed(material.lacquer({
  color: "#ffffff",
  roughness: 0.44,
  metallic: 0.14,
  clearcoat: 0.34,
  clearcoatRoughness: 0.24
}));

const MAT_ACTOR_HEAVY_ARMOR = unnamed(material.lacquer({
  color: "#ffffff",
  roughness: 0.32,
  metallic: 0.28,
  clearcoat: 0.56,
  clearcoatRoughness: 0.18
}));

const MAT_CLONE_HOLOGRAM = unnamed(material.emissive({
  color: "#ffffff",
  emissive: "#24b0ff",
  emissiveIntensity: 1.05,
  practical: true
}));

const MAT_SPIRIT_CYAN_EYE = unnamed(material.emissive({ color: "#6af2ff", emissive: "#38dcff", emissiveIntensity: 2.2, practical: true }));
const MAT_SPIRIT_VIOLET_EYE = unnamed(material.emissive({ color: "#d98cff", emissive: "#b85cff", emissiveIntensity: 2.2, practical: true }));
const MAT_SPIRIT_AMBER_EYE = unnamed(material.emissive({ color: "#ffd26a", emissive: "#ff9d2e", emissiveIntensity: 2.3, practical: true }));

interface RigColors {
  readonly cloth: string;
  readonly clothDark: string;
  readonly armor: string;
  readonly accent: string;
  readonly gold: string;
  readonly steel: string;
  readonly wrap: string;
  readonly boot: string;
  readonly mask: string;
  readonly skin: string;
  readonly eyeMat: AuraMaterialSpec;
  readonly baseMat: AuraMaterialSpec;
}

function colorsForSlot(id: CharacterId, isClone: boolean): RigColors {
  if (isClone) {
    return {
      cloth: "#1c4a82",
      clothDark: "#12325c",
      armor: "#38bdf8",
      accent: "#6ee7ff",
      gold: "#7beeff",
      steel: "#a5f3fc",
      wrap: "#67e8f9",
      boot: "#153a69",
      mask: "#1f5494",
      skin: "#7dd3fc",
      eyeMat: MAT_SPIRIT_CYAN_EYE,
      baseMat: MAT_CLONE_HOLOGRAM
    };
  }
  switch (id) {
    case "hero":
      return {
        cloth: "#1e2c4f",
        clothDark: "#141d36",
        armor: "#1f2536",
        accent: "#c92a2a",
        gold: "#e8b64c",
        steel: "#cad5e6",
        wrap: "#d8e0ed",
        boot: "#191f2e",
        mask: "#182340",
        skin: "#dfa884",
        eyeMat: MAT_SPIRIT_CYAN_EYE,
        baseMat: MAT_ACTOR_SHEEN_BODY
      };
    case "soldier":
      return {
        cloth: "#254259",
        clothDark: "#1a2f40",
        armor: "#232938",
        accent: "#b52d25",
        gold: "#e5b449",
        steel: "#b8c5d6",
        wrap: "#cfd8e6",
        boot: "#1d2230",
        mask: "#7c5c34",
        skin: "#dca37e",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "brute":
      return {
        cloth: "#1c1724",
        clothDark: "#120e18",
        armor: "#941d1d",
        accent: "#d63629",
        gold: "#ebb94c",
        steel: "#aeb9cb",
        wrap: "#b82924",
        boot: "#18141f",
        mask: "#8a1818",
        skin: "#c97b63",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_HEAVY_ARMOR
      };
    case "sage":
      return {
        cloth: "#d86b1e",
        clothDark: "#9e4812",
        armor: "#f2e4c9",
        accent: "#c92a2a",
        gold: "#f0c156",
        steel: "#d8e3f2",
        wrap: "#f5ead6",
        boot: "#1f2433",
        mask: "#f3eee6",
        skin: "#e3ae8b",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_SHEEN_BODY
      };
    case "caster":
      return {
        cloth: "#3e2463",
        clothDark: "#291645",
        armor: "#6c3fa4",
        accent: "#9d5ce6",
        gold: "#e8b84e",
        steel: "#c6d2e3",
        wrap: "#d6deeb",
        boot: "#1c2030",
        mask: "#f4efe8",
        skin: "#dfa884",
        eyeMat: MAT_SPIRIT_VIOLET_EYE,
        baseMat: MAT_ACTOR_SHEEN_BODY
      };
    case "scout":
      return {
        cloth: "#7d2329",
        clothDark: "#54161b",
        armor: "#212736",
        accent: "#db382c",
        gold: "#e6b54a",
        steel: "#c6d2e4",
        wrap: "#d8e0ed",
        boot: "#1b202e",
        mask: "#f6f1ea",
        skin: "#dfa884",
        eyeMat: MAT_SPIRIT_AMBER_EYE,
        baseMat: MAT_ACTOR_SHEEN_BODY
      };
  }
}

function tinted(mesh: RawMesh, hex: string): RawMesh {
  return paintMeshColors(mesh, hex);
}

/* ------------------------------------------------------------------ Sculpted Sengoku Character Parts (`+Z` forward, `+Y` up) */

function buildBodyMesh(id: CharacterId, c: RigColors): RawMesh {
  const wide = id === "brute" ? 1.25 : id === "caster" ? 1.06 : 1.0;
  const pieces: RawMesh[] = [];

  // Organic V-taper shinobi/samurai torso sculpted via `latheMesh` + `subdivideSmoothMesh`
  const rawTorso = transformMesh(
    subdivideSmoothMesh(
      latheMesh(
        [
          [0, -0.18],
          [0.205 * wide, -0.15],
          [0.185 * wide, 0.04],
          [0.235 * wide, 0.28],
          [0.258 * wide, 0.45],
          [0.165 * wide, 0.56],
          [0, 0.58]
        ],
        14
      ),
      1,
      0.52
    ),
    { scale: [1.0, 1.0, 0.74] }
  );
  pieces.push(tinted(rawTorso, c.cloth));

  // Pleated hakama / inner under-tunic skirt flaring cleanly over hip joints
  const hakama = transformMesh(
    latheMesh(
      [
        [0, -0.25],
        [0.255 * wide, -0.22],
        [0.235 * wide, -0.05],
        [0.195 * wide, 0.06],
        [0, 0.07]
      ],
      14
    ),
    { scale: [1.04, 1.0, 0.82] }
  );
  pieces.push(tinted(hakama, c.clothDark));

  // Layered `kusazuri` armored tasset plates around the waist (4-6 overlapping curved trapezoidal plates)
  const tassetCount = id === "brute" || id === "soldier" ? 6 : 4;
  for (let k = 0; k < tassetCount; k += 1) {
    const ang = (k / tassetCount) * Math.PI * 2 + Math.PI / tassetCount;
    const tx = Math.sin(ang) * 0.225 * wide;
    const tz = Math.cos(ang) * 0.185 * wide;
    const plateW = (id === "brute" ? 0.22 : 0.17) * wide;
    const plate = transformMesh(bevelBoxMesh(plateW, 0.22, 0.036, 0.01), {
      pos: [tx, -0.11, tz],
      rot: [-0.22, ang, 0]
    });
    const trim = transformMesh(bevelBoxMesh(plateW * 0.92, 0.038, 0.042, 0.006), {
      pos: [tx * 1.05, -0.19, tz * 1.05],
      rot: [-0.22, ang, 0]
    });
    pieces.push(tinted(plate, id === "brute" || id === "soldier" ? c.armor : c.cloth));
    pieces.push(tinted(trim, id === "brute" || id === "soldier" ? c.gold : c.accent));
  }

  // Sculpted `do` cuirass breastplate & backplate with V-collar lapel
  const cuirass = transformMesh(
    subdivideSmoothMesh(bevelBoxMesh(0.39 * wide, 0.34, 0.25 * wide, 0.055), 1, 0.45),
    { pos: [0, 0.28, 0.018] }
  );
  pieces.push(tinted(cuirass, c.armor));

  // Crossed shinobi harness / samurai chest cord lacing
  for (const side of [-1, 1] as const) {
    const strap = transformMesh(bevelBoxMesh(0.055 * wide, 0.38, 0.27 * wide, 0.012), {
      pos: [side * 0.06 * wide, 0.29, 0.02],
      rot: [0, 0, side * 0.42]
    });
    pieces.push(tinted(strap, id === "hero" || id === "scout" ? c.wrap : c.gold));
  }

  // Knotted `obi` waist sash + front medallion
  const obi = transformMesh(
    latheMesh([[0, -0.058], [0.23 * wide, -0.058], [0.242 * wide, 0], [0.23 * wide, 0.058], [0, 0.058]], 16),
    { pos: [0, 0.04, 0], scale: [1.03, 1.0, 0.8] }
  );
  pieces.push(tinted(obi, c.accent));
  pieces.push(tinted(transformMesh(bevelBoxMesh(0.09 * wide, 0.09, 0.05, 0.012), { pos: [0, 0.04, 0.195 * wide] }), c.gold));

  // Tiered `sode` / fluted pauldrons over shoulders
  for (const sx of [-1, 1] as const) {
    for (let tier = 0; tier < 2; tier += 1) {
      const sode = transformMesh(
        bevelBoxMesh((0.15 - tier * 0.018) * wide, 0.11, 0.23 - tier * 0.02, 0.024),
        {
          pos: [sx * (0.255 + tier * 0.022) * wide, 0.45 - tier * 0.065, 0],
          rot: [0, 0, -sx * (0.32 + tier * 0.1)]
        }
      );
      pieces.push(tinted(sode, tier === 0 ? c.armor : c.accent));
    }
  }

  // Hero / Sage / Scout: Flowing crimson/amber neck scarf collar + twin wind-swept scarf tails + diagonal katana scabbard (`saya`) on back
  if (id === "hero" || id === "sage" || id === "scout") {
    const scarfCollar = transformMesh(
      subdivideSmoothMesh(
        latheMesh([[0, 0.49], [0.185 * wide, 0.49], [0.205 * wide, 0.545], [0.165 * wide, 0.59], [0, 0.59]], 14),
        1,
        0.5
      ),
      { scale: [1.0, 1.0, 0.88] }
    );
    pieces.push(tinted(scarfCollar, c.accent));

    // Twin wind-swept scarf ribbons trailing behind `-Z`
    for (const side of [-1, 1] as const) {
      const ribbonCtrl: V3[] = [
        [side * 0.07, 0.53, -0.13],
        [side * 0.15, 0.46, -0.32],
        [side * 0.22, 0.36, -0.54],
        [side * 0.18, 0.29, -0.74]
      ];
      const pts = catmullRomSpline3(ribbonCtrl, 5, false).map((p, idx, arr): V4 => {
        const u = idx / Math.max(1, arr.length - 1);
        return [p[0], p[1], p[2], 0.048 * (1 - u * 0.55)];
      });
      pieces.push(tinted(transformMesh(tubeSweepMesh(pts, 8, true), { scale: [1.25, 0.42, 1.0] }), c.accent));
    }

    // Curved `sori` lacquered katana scabbard (`saya`) + gold `tsuba` + diamond-wrapped `tsuka` hilt slung diagonally across the back
    const sayaSpine = catmullRomSpline3(
      [
        [-0.14, 0.52, -0.18],
        [0.02, 0.27, -0.19],
        [0.20, -0.02, -0.17]
      ],
      5,
      false
    ).map((p, idx, arr): V4 => [p[0], p[1], p[2], 0.028 * (1 - (idx / Math.max(1, arr.length - 1)) * 0.28)]);
    pieces.push(tinted(transformMesh(tubeSweepMesh(sayaSpine, 8, true), { scale: [0.72, 1.0, 1.18] }), "#171c28"));
    // Sageo crimson cord wrap around scabbard throat
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.062, 0.09, 0.068, 0.012), { pos: [-0.05, 0.38, -0.19], rot: [0.08, 0, -0.56] }), c.accent));
    // Circular gold `tsuba` guard
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.01], [0.065, -0.01], [0.065, 0.01], [0, 0.01]], 12, true), { pos: [-0.15, 0.54, -0.185], rot: [0.08, 0, -0.56] }), c.gold));
    // Wrapped `tsuka` katana handle & gold `kashira` pommel
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.042, 0.22, 0.052, 0.01), { pos: [-0.22, 0.65, -0.19], rot: [0.08, 0, -0.56] }), c.wrap));
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.048, 0.036, 0.056, 0.008), { pos: [-0.28, 0.75, -0.195], rot: [0.08, 0, -0.56] }), c.gold));
  }

  return bakeMeshCavityAO(mergeRawMeshesToRaw(pieces), 0.36);
}

function buildHeadParts(id: CharacterId, c: RigColors): { readonly main: RawMesh; readonly eyes: RawMesh } {
  const pieces: RawMesh[] = [];
  const eyeL = transformMesh(bevelBoxMesh(0.046, 0.022, 0.028, 0.006), { pos: [0.054, 0.192, 0.146], rot: [0, 0, -0.14] });
  const eyeR = transformMesh(bevelBoxMesh(0.046, 0.022, 0.028, 0.006), { pos: [-0.054, 0.192, 0.146], rot: [0, 0, 0.14] });
  const eyes = paintMeshColors(mergeRawMeshesToRaw([eyeL, eyeR]), "#ffffff");

  // Smooth organic cranium (`subdivideSmoothMesh`)
  const cranium = transformMesh(
    subdivideSmoothMesh(
      latheMesh([[0, 0.0], [0.092, 0.03], [0.148, 0.12], [0.156, 0.21], [0.126, 0.30], [0, 0.33]], 14),
      1,
      0.56
    ),
    { scale: [0.96, 1.0, 1.03] }
  );

  if (id === "soldier") {
    // Armored Samurai Sentry: curved `kabuto` war bowl + flared `shikoro` neck-lamellae + iron `menpo` faceguard + golden crescent `maedate` crest
    pieces.push(tinted(cranium, c.skin));
    const kabutoBowl = subdivideSmoothMesh(
      latheMesh([[0, 0.19], [0.175, 0.19], [0.182, 0.27], [0.135, 0.34], [0.04, 0.375], [0, 0.38]], 16),
      1,
      0.5
    );
    pieces.push(tinted(kabutoBowl, c.armor));
    // Flared `shikoro` tiered neck guard sweeping around back and sides
    const shikoroSections: V3[][] = [];
    for (let s = 0; s <= 3; s += 1) {
      const t = s / 3;
      const r = 0.175 + t * 0.085;
      const y = 0.21 - t * 0.12;
      const ring: V3[] = [];
      for (let k = 0; k < 8; k += 1) {
        const a = ((k / 7) * 1.45 - 0.725) * Math.PI + Math.PI;
        ring.push([Math.sin(a) * r, y, Math.cos(a) * r]);
      }
      // Close ring cross-section cleanly
      for (let k = 7; k >= 0; k -= 1) {
        const a = ((k / 7) * 1.45 - 0.725) * Math.PI + Math.PI;
        ring.push([Math.sin(a) * (r - 0.022), y, Math.cos(a) * (r - 0.022)]);
      }
      shikoroSections.push(ring);
    }
    pieces.push(tinted(loftSectionsMesh(shikoroSections, true, false), c.accent));
    // Visor brim (`mabizashi`) + iron `menpo` lower war-mask
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.24, 0.032, 0.12, 0.008), { pos: [0, 0.225, 0.135], rot: [0.22, 0, 0] }), c.armor));
    pieces.push(tinted(transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.185, 0.115, 0.145, 0.032), 1, 0.45), { pos: [0, 0.11, 0.075] }), c.armor));
    // Golden crescent moon `maedate` crest on forehead
    const crescent: V2[] = [
      [0, 0.02], [0.06, 0.04], [0.13, 0.12], [0.15, 0.22],
      [0.09, 0.15], [0.03, 0.09], [0, 0.08], [-0.03, 0.09],
      [-0.09, 0.15], [-0.15, 0.22], [-0.13, 0.12], [-0.06, 0.04]
    ];
    pieces.push(tinted(transformMesh(extrudePolygonMesh(crescent, 0.018, 0.004, true), { pos: [0, 0.24, 0.165], rot: [-0.22, 0, 0] }), c.gold));
  } else if (id === "brute") {
    // Horned Oni Samurai Juggernaut: crimson-ebony `suji-kabuto` + sweeping `shikoro` plates + fanged demon `menpo` + massive golden `kuwagata` horns
    pieces.push(tinted(cranium, c.mask));
    const kabuto = subdivideSmoothMesh(
      latheMesh([[0, 0.18], [0.192, 0.18], [0.198, 0.29], [0.145, 0.37], [0, 0.405]], 16),
      1,
      0.52
    );
    pieces.push(tinted(kabuto, c.cloth));
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.38, 0.15, 0.27, 0.035), { pos: [0, 0.14, -0.055], rot: [0.15, 0, 0] }), c.armor));
    // Fierce Oni `menpo` jaw guard + ivory tusks
    pieces.push(tinted(transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.21, 0.12, 0.16, 0.034), 1, 0.45), { pos: [0, 0.11, 0.08] }), c.mask));
    for (const sx of [-1, 1] as const) {
      const tusk = transformMesh(latheMesh([[0, 0], [0.018, 0.01], [0.005, 0.075], [0, 0.08]], 8), {
        pos: [sx * 0.068, 0.095, 0.152],
        rot: [-0.35, 0, -sx * 0.22]
      });
      pieces.push(tinted(tusk, "#f5efe2"));
      const hornPts = catmullRomSpline3(
        [[sx * 0.065, 0.28, 0.145], [sx * 0.17, 0.39, 0.165], [sx * 0.25, 0.54, 0.11]],
        5
      ).map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.012, 0.042 * (1 - k / a.length))]);
      pieces.push(tinted(tubeSweepMesh(hornPts, 8, true), c.gold));
    }
    // Central sun-disc `maedate`
    pieces.push(tinted(transformMesh(latheMesh([[0, -0.01], [0.052, -0.01], [0.052, 0.01], [0, 0.01]], 12, true), { pos: [0, 0.30, 0.185], rot: [Math.PI * 0.5 - 0.2, 0, 0] }), c.gold));
  } else if (id === "caster") {
    // Onmyoji Spirit Caster: tall lacquered `eboshi` court hat + smooth porcelain owl mask + gold spirit brows
    pieces.push(tinted(cranium, c.cloth));
    const eboshi = subdivideSmoothMesh(latheMesh([[0, 0.23], [0.145, 0.23], [0.125, 0.45], [0.072, 0.56], [0, 0.58]], 14), 1, 0.48);
    pieces.push(tinted(eboshi, "#1d2230"));
    pieces.push(tinted(transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.215, 0.225, 0.08, 0.036), 1, 0.52), { pos: [0, 0.18, 0.125] }), c.mask));
    for (const sx of [-1, 1] as const) {
      pieces.push(tinted(transformMesh(bevelBoxMesh(0.095, 0.034, 0.032, 0.008), { pos: [sx * 0.072, 0.252, 0.158], rot: [0, 0, sx * 0.38] }), c.gold));
    }
  } else if (id === "scout") {
    // Kitsune Shadow Scout: crimson hood + `subdivideSmoothMesh` porcelain fox mask with sculpted snout & tall pointed ears
    pieces.push(tinted(cranium, c.cloth));
    const foxMask = subdivideSmoothMesh(
      mergeRawMeshesToRaw([
        transformMesh(bevelBoxMesh(0.205, 0.215, 0.095, 0.038), { pos: [0, 0.175, 0.12] }),
        transformMesh(latheMesh([[0, 0], [0.058, 0.02], [0.026, 0.095], [0, 0.108]], 10), { pos: [0, 0.142, 0.148], rot: [Math.PI * 0.5, 0, 0] })
      ]),
      1,
      0.54
    );
    pieces.push(tinted(foxMask, c.mask));
    for (const sx of [-1, 1] as const) {
      const ear = subdivideSmoothMesh(latheMesh([[0, 0], [0.052, 0.02], [0.018, 0.145], [0, 0.158]], 10), 1, 0.45);
      pieces.push(tinted(transformMesh(ear, { pos: [sx * 0.088, 0.295, 0.082], rot: [0.18, 0, -sx * 0.22] }), c.mask));
      pieces.push(tinted(transformMesh(bevelBoxMesh(0.028, 0.08, 0.018, 0.005), { pos: [sx * 0.088, 0.34, 0.105], rot: [0.18, 0, -sx * 0.22] }), c.accent));
    }
  } else {
    // Shinobi Hero & Sage: `subdivideSmoothMesh` masked cowl + fitted nose-bridge face-mask + metallic `hitai-ate` protector + wind-blown headband tails
    const hood = subdivideSmoothMesh(
      transformMesh(
        latheMesh([[0, 0.01], [0.158, 0.055], [0.172, 0.195], [0.142, 0.31], [0.048, 0.35], [0, 0.358]], 16),
        { pos: [0, 0, -0.012], scale: [0.98, 1.0, 1.05] }
      ),
      1,
      0.56
    );
    pieces.push(tinted(hood, c.cloth));
    // Brow skin slit
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.168, 0.068, 0.062, 0.018), { pos: [0, 0.195, 0.122] }), c.skin));
    // Sculpted lower shinobi mask (`fukumen`) covering nose bridge & jaw
    const lowerMask = subdivideSmoothMesh(
      transformMesh(bevelBoxMesh(0.182, 0.128, 0.135, 0.036), { pos: [0, 0.108, 0.088], rot: [0.08, 0, 0] }),
      1,
      0.52
    );
    pieces.push(tinted(lowerMask, c.mask));
    // Metallic `hitai-ate` headband wrap + engraved steel forehead plate
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.228, 0.054, 0.052, 0.014), { pos: [0, 0.246, 0.134] }), c.accent));
    pieces.push(tinted(transformMesh(bevelBoxMesh(0.132, 0.04, 0.024, 0.006), { pos: [0, 0.246, 0.158] }), c.steel));
    // Trailing headband knot ribbons behind head
    for (const sx of [-1, 1] as const) {
      const tail = catmullRomSpline3(
        [[sx * 0.03, 0.23, -0.15], [sx * 0.09, 0.19, -0.28], [sx * 0.13, 0.13, -0.40]],
        4,
        false
      ).map((p, k, a): V4 => [p[0], p[1], p[2], 0.022 * (1 - (k / Math.max(1, a.length - 1)) * 0.55)]);
      pieces.push(tinted(tubeSweepMesh(tail, 6, true), c.accent));
    }
  }

  return {
    main: bakeMeshCavityAO(mergeRawMeshesToRaw(pieces), 0.36),
    eyes
  };
}

function buildLegMesh(id: CharacterId, c: RigColors): RawMesh {
  const wide = id === "brute" ? 1.24 : 1.0;
  const pieces: RawMesh[] = [];

  // Agile muscular thigh (`sculptHumanoidLimbMesh` from hip `[0, 0.03, 0]` to knee `[0, -0.37, 0.015]`)
  const thigh = sculptHumanoidLimbMesh(
    [
      [0, 0.035, 0, 0.112 * wide],
      [0, -0.16, 0.012, 0.122 * wide],
      [0, -0.37, 0.015, 0.086 * wide]
    ],
    12,
    0.16
  );
  pieces.push(tinted(thigh, c.cloth));

  // Sculpted lower leg with `kyahan` cloth wraps (`sculptHumanoidLimbMesh` from knee to ankle `[0, -0.66, 0]`)
  const calf = sculptHumanoidLimbMesh(
    [
      [0, -0.35, 0.015, 0.084 * wide],
      [0, -0.48, -0.008, 0.082 * wide],
      [0, -0.66, 0.005, 0.058 * wide]
    ],
    12,
    0.14
  );
  pieces.push(tinted(calf, c.wrap));

  // Armored `suneate` shin-guard plate + knee `tateage` cap on front (`+Z`)
  const shinGuard = subdivideSmoothMesh(
    transformMesh(bevelBoxMesh(0.096 * wide, 0.26, 0.055, 0.016), { pos: [0, -0.49, 0.062 * wide], rot: [-0.04, 0, 0] }),
    1,
    0.45
  );
  const kneeCap = subdivideSmoothMesh(
    transformMesh(bevelBoxMesh(0.108 * wide, 0.088, 0.062, 0.02), { pos: [0, -0.35, 0.068 * wide] }),
    1,
    0.5
  );
  pieces.push(tinted(shinGuard, c.armor));
  pieces.push(tinted(kneeCap, id === "brute" || id === "soldier" ? c.gold : c.armor));

  // Split-toe `tabi` shinobi boot (`subdivideSmoothMesh`)
  const boot = subdivideSmoothMesh(
    transformMesh(bevelBoxMesh(0.128 * wide, 0.102, 0.245, 0.034), { pos: [0, -0.692, 0.048] }),
    1,
    0.48
  );
  pieces.push(tinted(boot, c.boot));

  return bakeMeshCavityAO(mergeRawMeshesToRaw(pieces), 0.34);
}

function buildArmMesh(id: CharacterId, c: RigColors): RawMesh {
  const wide = id === "brute" ? 1.24 : id === "caster" ? 1.12 : 1.0;
  const pieces: RawMesh[] = [];

  // Agile upper arm (`sculptHumanoidLimbMesh` shoulder `[0, 0.03, 0]` to elbow `[0, -0.29, 0]`)
  const upperArm = sculptHumanoidLimbMesh(
    [
      [0, 0.03, 0, 0.082 * wide],
      [0, -0.14, 0.008, 0.086 * wide],
      [0, -0.29, 0, 0.066 * wide]
    ],
    12,
    0.15
  );
  pieces.push(tinted(upperArm, c.cloth));

  // Forearm + armored `kote` bracer (`sculptHumanoidLimbMesh` elbow to wrist `[0, -0.54, 0.01]`)
  const forearm = sculptHumanoidLimbMesh(
    [
      [0, -0.27, 0, 0.068 * wide],
      [0, -0.40, 0.008, 0.065 * wide],
      [0, -0.54, 0.012, 0.050 * wide]
    ],
    12,
    0.12
  );
  pieces.push(tinted(forearm, c.armor));

  // Bracer ridge plate & crimson/gold wrist band
  pieces.push(tinted(transformMesh(bevelBoxMesh(0.072 * wide, 0.19, 0.042, 0.012), { pos: [0, -0.41, 0.046 * wide] }), c.steel));
  pieces.push(tinted(transformMesh(bevelBoxMesh(0.082 * wide, 0.042, 0.082 * wide, 0.01), { pos: [0, -0.515, 0.01] }), c.accent));

  // Sculpted shinobi gauntlet hand (`subdivideSmoothMesh`)
  const hand = subdivideSmoothMesh(
    transformMesh(bevelBoxMesh(0.092, 0.102, 0.106, 0.03), { pos: [0, -0.572, 0.018] }),
    1,
    0.52
  );
  pieces.push(tinted(hand, c.skin));

  return bakeMeshCavityAO(mergeRawMeshesToRaw(pieces), 0.34);
}

export function buildProceduralActorNodes(slot: number, id: CharacterId, castShadow: boolean): AuraNodeBuilder[] {
  const isClone = slot >= 1 && slot <= 3;
  const isHeroOrClone = slot === 0 || isClone || slot === 12;
  const c = colorsForSlot(id, isClone);
  const cachePrefix = `ninja:actor:v2:${id}:${isClone ? "clone" : "std"}`;

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
    const mainSpec = memoizeGeometry(`${cachePrefix}:head:main`, () => mergeRawMeshes([buildHeadParts(id, c).main]));
    const eyeSpec = memoizeGeometry(`${cachePrefix}:head:eyes`, () => mergeRawMeshes([buildHeadParts(id, c).eyes]));
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

  const limbShadow = castShadow && isHeroOrClone;

  return [
    mkSingle("body", () => buildBodyMesh(id, c), castShadow),
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
