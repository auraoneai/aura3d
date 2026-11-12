// Group 5 procedural 3D rigs: Cozy Bedtime, Lullaby & Sleepy Nursery Props (7 StageAssetKeys).
// Built 100% natively on @aura3d/engine/procedural and ./rig-kit.js.
// Zero network fetches, zero clocks, zero non-deterministic RNG, zero logging, and zero unsafe casts.

import type { AuraCustomGeometrySpec } from "@aura3d/engine";
import {
  composeGeometry,
  latheGeometry,
  type ProceduralVec2,
  type ProceduralVec3
} from "@aura3d/engine/procedural";
import type { Vec3 } from "../motion.js";
import {
  composeLobe,
  cylinderSpec,
  ensureOutwardNormals,
  extrudeContourSpec,
  finalizeProceduralRig,
  makeSubPartRig,
  part,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  torusSpec,
  type BuiltSubPart,
  type LobePartInput,
  type OrganicPuffItem,
  type ProceduralAssetRig
} from "./rig-kit.js";

export type BedtimeAssetKey =
  | "moon"
  | "cradle"
  | "cribMobile"
  | "musicBox"
  | "nightlight"
  | "blanket"
  | "sleepyCloud";

const TAU = Math.PI * 2;
const ORIGIN: Vec3 = [0, 0, 0];

// ---------------------------------------------------------------- shared tactile nursery helpers

/** Smooth unit-radius sphere (`r = 1.0`) with controlled segment counts for cushions, cheeks & finials. */
function unitOrbSpec(radialSegs = 12, ringSegs = 6): AuraCustomGeometrySpec {
  const profile: ProceduralVec2[] = [];
  for (let i = 0; i <= ringSegs; i += 1) {
    const a = -Math.PI * 0.5 + (i / ringSegs) * Math.PI;
    profile.push([Math.max(0, Math.cos(a)), Math.sin(a)]);
  }
  return ensureOutwardNormals(
    latheGeometry({
      profile,
      segments: radialSegs,
      creaseAngle: Math.PI
    })
  );
}

function softOrbSpec(
  rx: number,
  ry: number,
  rz: number,
  radialSegs = 10,
  ringSegs = 5
): AuraCustomGeometrySpec {
  return composeGeometry([
    {
      geometry: unitOrbSpec(radialSegs, ringSegs),
      scale: [rx, ry, rz]
    }
  ]);
}

/** 2D 5-point rounded star contour in XY for extruded brass/glow star charms & figurines. */
function starContour2D(points: number, outerR: number, innerR: number, phaseRad = Math.PI * 0.5): ProceduralVec2[] {
  const out: ProceduralVec2[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const a = phaseRad + (i / total) * TAU;
    const r = i % 2 === 0 ? outerR : innerR;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function starCharmSpec(outerR: number, innerR: number, depth: number): AuraCustomGeometrySpec {
  return extrudeContourSpec({
    outer: starContour2D(5, outerR, innerR),
    depth,
    bevelThickness: depth * 0.16,
    bevelSize: outerR * 0.07,
    bevelSegments: 1,
    creaseAngle: 0.95
  });
}

/** Peaceful closed crescent sleeping eyelid + soft upper lid cushion (`parent: "body"`), facing `+Z`. */
function buildSleepingEyelidSubPart(
  side: -1 | 1,
  anchor: Vec3,
  radius: number,
  lashColor: string,
  lidColor: string
): BuiltSubPart {
  const lidPad = softOrbSpec(radius * 0.92, radius * 0.44, radius * 0.34, 8, 4);
  const lashArc = sculptCurvedLimb(
    [
      [-radius * 0.95, radius * 0.18, radius * 0.16],
      [-radius * 0.35, -radius * 0.24, radius * 0.28],
      [radius * 0.35, -radius * 0.24, radius * 0.28],
      [radius * 0.95, radius * 0.18, radius * 0.16]
    ],
    (t) => radius * (0.11 + 0.05 * Math.sin(t * Math.PI)),
    { steps: 4, radialSegments: 5 }
  );
  const outerFlick = sculptCurvedLimb(
    [
      [side * radius * 0.72, -radius * 0.02, radius * 0.22],
      [side * radius * 1.18, -radius * 0.22, radius * 0.16]
    ],
    radius * 0.08,
    { steps: 2, radialSegments: 4 }
  );
  const lobe = composeLobe({
    suffix: side < 0 ? "sleepEyelidL" : "sleepEyelidR",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(lidPad, lidColor, { position: [0, radius * 0.06, 0] }),
      part(lashArc, lashColor),
      part(outerFlick, lashColor)
    ]
  });
  return makeSubPartRig(side < 0 ? "eyelidL" : "eyelidR", anchor, [lobe], "body");
}

// ---------------------------------------------------------------- 1. moon (0.75 m)

function buildMoonRig(): ProceduralAssetRig {
  // Plump sculpted golden crescent opening gently to +X with a cozy +Z face belly.
  const crescentSpine: ProceduralVec3[] = [
    [0.17, 0.88, 0.01],
    [-0.02, 0.92, 0.02],
    [-0.21, 0.8, 0.04],
    [-0.31, 0.58, 0.06],
    [-0.28, 0.34, 0.05],
    [-0.12, 0.15, 0.03],
    [0.11, 0.09, 0.02],
    [0.26, 0.18, 0.01]
  ];
  const crescentGeo = sculptCurvedLimb(
    crescentSpine,
    (t) => {
      const belly = Math.sin(t * Math.PI);
      return 0.036 + 0.178 * Math.pow(belly, 0.78);
    },
    { steps: 10, radialSegments: 9, capFraction: 0.16 }
  );
  const cheekBellyGeo = softOrbSpec(0.155, 0.175, 0.15, 10, 5);
  const noseButtonGeo = softOrbSpec(0.038, 0.032, 0.036, 8, 4);

  const moonGlowLobe = composeLobe({
    suffix: "goldenCrescent",
    craft: "warmGlow",
    baseColor: "#FFE29A",
    emissive: "#FFE29A",
    emissiveIntensity: 0.32,
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(crescentGeo, "#FFE29A"),
      part(cheekBellyGeo, "#FFE8AD", { position: [-0.21, 0.5, 0.075] }),
      part(noseButtonGeo, "#FFD57E", { position: [-0.19, 0.47, 0.225] })
    ]
  });

  // Quilted periwinkle-indigo felt nightcap perched on the upper horn, curving softly to +X.
  const nightcapConeGeo = sculptCurvedLimb(
    [
      [-0.06, 0.87, 0.02],
      [0.05, 0.99, 0.02],
      [0.2, 0.97, 0.03],
      [0.31, 0.84, 0.04],
      [0.35, 0.71, 0.05]
    ],
    (t) => 0.118 * Math.pow(1 - t * 0.84, 0.82),
    { steps: 6, radialSegments: 7, capFraction: 0.15 }
  );
  const nightcapBrimGeo = torusSpec(0.115, 0.034, 9, 5);
  const smileStitchGeo = sculptCurvedLimb(
    [
      [-0.245, 0.405, 0.215],
      [-0.19, 0.378, 0.228],
      [-0.135, 0.405, 0.212]
    ],
    0.009,
    { steps: 3, radialSegments: 4 }
  );

  const nightcapLobe = composeLobe({
    suffix: "quiltedNightcap",
    craft: "felt",
    craftTexture: "quiltedStitch",
    parts: [
      part(nightcapConeGeo, "#6E78B8"),
      part(nightcapBrimGeo, "#FAF3E6", {
        position: [-0.04, 0.88, 0.02],
        rotation: [Math.PI * 0.44, 0.24, -0.32]
      }),
      part(smileStitchGeo, "#8B6240")
    ]
  });

  // Dangling brass cord + plump 5-point star pom from the nightcap tip.
  const cordGeo = sculptCurvedLimb(
    [
      [0.35, 0.71, 0.05],
      [0.365, 0.62, 0.055],
      [0.36, 0.54, 0.06]
    ],
    0.009,
    { steps: 3, radialSegments: 4 }
  );
  const pomCollarGeo = cylinderSpec(0.02, 0.024, 0.026, 7);
  const starPomGeo = starCharmSpec(0.066, 0.033, 0.032);

  const brassPomLobe = composeLobe({
    suffix: "brassStarPom",
    craft: "brushedMetal",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(cordGeo, "#E5B95C"),
      part(pomCollarGeo, "#E5B95C", { position: [0.35, 0.7, 0.05] }),
      part(starPomGeo, "#F6CF6E", { position: [0.36, 0.505, 0.06] })
    ]
  });

  const eyelidLPart = buildSleepingEyelidSubPart(
    -1,
    [-0.265, 0.525, 0.205],
    0.042,
    "#5A4132",
    "#F7D88B"
  );
  const eyelidRPart = buildSleepingEyelidSubPart(
    1,
    [-0.125, 0.525, 0.198],
    0.042,
    "#5A4132",
    "#F7D88B"
  );

  const cheekAnchor: Vec3 = [-0.195, 0.445, 0.205];
  const cheekPadGeo = softOrbSpec(0.038, 0.026, 0.02, 8, 4);
  const cheekPuffLobe = composeLobe({
    suffix: "warmCheeks",
    craft: "clay",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(cheekPadGeo, "#F6A68A", { position: [-0.088, 0, 0.004], rotation: [0, -0.22, 0] }),
      part(cheekPadGeo, "#F6A68A", { position: [0.084, 0, -0.004], rotation: [0, 0.2, 0] })
    ]
  });

  return finalizeProceduralRig("moon", [
    makeSubPartRig("body", ORIGIN, [moonGlowLobe, nightcapLobe, brassPomLobe]),
    eyelidLPart,
    eyelidRPart,
    makeSubPartRig("cheekPuff", cheekAnchor, [cheekPuffLobe], "body")
  ]);
}

// ---------------------------------------------------------------- 2. cradle (0.65 m, fitMode: "exact", restAt: 0.58)

function slimBarSpec(w: number, h: number, d: number): AuraCustomGeometrySpec {
  const hw = w * 0.5;
  const hh = h * 0.5;
  return extrudeContourSpec({
    outer: [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh]
    ],
    depth: d,
    bevelThickness: Math.min(w, h, d) * 0.14,
    bevelSize: Math.min(w, h) * 0.14,
    bevelSegments: 1,
    creaseAngle: 0.85
  });
}

function buildCradleRig(): ProceduralAssetRig {
  // Curved honey-maple rocker rails in XY (even radialSegments = 6 hits exact bottom y = 0.000 at x = 0).
  const rockerPts: ProceduralVec3[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const u = i / 6;
    const x = -0.66 + u * 1.32;
    const y = 0.034 + 0.115 * (x / 0.66) * (x / 0.66);
    rockerPts.push([x, y, 0]);
  }
  const rockerGeo = sculptCurvedLimb(rockerPts, 0.034, { steps: 6, radialSegments: 6 });
  const crossTieGeo = slimBarSpec(0.08, 0.055, 0.78);
  const postGeo = cylinderSpec(0.034, 0.04, 0.64, 6, 0);
  const sideTopRailGeo = slimBarSpec(1.26, 0.055, 0.06);
  const endTopRailGeo = slimBarSpec(0.06, 0.055, 0.82);

  // Arched honey-maple canopy headboard crest along -Z reaching exact y = 1.000 (center y = 0.964 + r 0.036 = 1.000).
  const hoodArchPts: ProceduralVec3[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const u = i / 6;
    const x = -0.6 + u * 1.2;
    const arch = Math.sin(u * Math.PI);
    hoodArchPts.push([x, 0.68 + 0.284 * arch, -0.39]);
  }
  const hoodArchGeo = sculptCurvedLimb(hoodArchPts, 0.036, { steps: 6, radialSegments: 6 });

  const woodParts: LobePartInput[] = [
    part(rockerGeo, "#C88A52", { position: [0, 0, 0.39] }),
    part(rockerGeo, "#C88A52", { position: [0, 0, -0.39] }),
    part(crossTieGeo, "#BA7D46", { position: [-0.46, 0.14, 0] }),
    part(crossTieGeo, "#BA7D46", { position: [0.46, 0.14, 0] }),
    part(postGeo, "#C88A52", { position: [-0.6, 0.44, 0.39] }),
    part(postGeo, "#C88A52", { position: [0.6, 0.44, 0.39] }),
    part(postGeo, "#C88A52", { position: [-0.6, 0.44, -0.39] }),
    part(postGeo, "#C88A52", { position: [0.6, 0.44, -0.39] }),
    part(sideTopRailGeo, "#D3965D", { position: [0, 0.68, 0.39] }),
    part(sideTopRailGeo, "#D3965D", { position: [0, 0.68, -0.39] }),
    part(endTopRailGeo, "#D3965D", { position: [-0.6, 0.68, 0] }),
    part(endTopRailGeo, "#D3965D", { position: [0.6, 0.68, 0] }),
    part(hoodArchGeo, "#D3965D")
  ];

  const woodLobe = composeLobe({
    suffix: "mapleCradleFrame",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: woodParts
  });

  // Woven rattan/wicker crib basket panels + slatted base.
  const baseTrayGeo = slimBarSpec(1.22, 0.07, 0.8);
  const sideWickerGeo = slimBarSpec(1.14, 0.36, 0.042);
  const endWickerGeo = slimBarSpec(0.042, 0.38, 0.74);
  const hoodWickerGeo = softOrbSpec(0.52, 0.19, 0.024, 8, 4);

  const wickerLobe = composeLobe({
    suffix: "rattanBasket",
    craft: "clay",
    craftTexture: "wickerWeave",
    parts: [
      part(baseTrayGeo, "#D9AC72", { position: [0, 0.25, 0] }),
      part(sideWickerGeo, "#E2B882", { position: [0, 0.46, 0.39] }),
      part(sideWickerGeo, "#E2B882", { position: [0, 0.46, -0.39] }),
      part(endWickerGeo, "#DEB37B", { position: [-0.6, 0.47, 0] }),
      part(endWickerGeo, "#DEB37B", { position: [0.6, 0.47, 0] }),
      part(hoodWickerGeo, "#E5BE8B", { position: [0, 0.78, -0.39] })
    ]
  });

  // Plush quilted mattress (exact top resting plane at y = 0.58: center 0.44 + halfH 0.14 = 0.58) & head pillow.
  const mattressGeo = roundedBoxSpec(1.12, 0.28, 0.72, 0.06, 1);
  const pillowGeo = softOrbSpec(0.16, 0.085, 0.27, 9, 4);
  const coverletRollGeo = softOrbSpec(0.12, 0.055, 0.32, 9, 4);

  const quiltLobe = composeLobe({
    suffix: "quiltedMattress",
    craft: "felt",
    craftTexture: "quiltedStitch",
    parts: [
      part(mattressGeo, "#FAF2E4", { position: [0, 0.44, 0] }),
      part(pillowGeo, "#E7DCF6", { position: [-0.38, 0.61, 0], rotation: [0, 0, -0.14] }),
      part(coverletRollGeo, "#C8B8EE", { position: [0.26, 0.59, 0] })
    ]
  });

  // Warm brass corner acorn finials + little star medallion on the front rail.
  const finialGeo = softOrbSpec(0.042, 0.052, 0.042, 7, 4);
  const starBadgeGeo = starCharmSpec(0.055, 0.027, 0.02);

  const brassLobe = composeLobe({
    suffix: "brassFinials",
    craft: "brushedMetal",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(finialGeo, "#F0C869", { position: [-0.6, 0.79, 0.39] }),
      part(finialGeo, "#F0C869", { position: [0.6, 0.79, 0.39] }),
      part(finialGeo, "#F0C869", { position: [-0.6, 0.79, -0.39] }),
      part(finialGeo, "#F0C869", { position: [0.6, 0.79, -0.39] }),
      part(starBadgeGeo, "#F5D27A", { position: [0, 0.68, 0.425] })
    ]
  });

  return finalizeProceduralRig(
    "cradle",
    [makeSubPartRig("body", ORIGIN, [woodLobe, wickerLobe, quiltLobe, brassLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 3. cribMobile (0.75 m, floats: true)

function buildCribMobileRig(): ProceduralAssetRig {
  // Graceful curved beechwood nursery swan-neck arm arching up and forward to center [0, 0.76, 0].
  const armGeo = sculptCurvedLimb(
    [
      [0, 0.54, -0.34],
      [0, 0.76, -0.32],
      [0, 0.94, -0.18],
      [0, 0.97, -0.02],
      [0, 0.85, 0.0]
    ],
    (t) => 0.036 - 0.01 * t,
    { steps: 6, radialSegments: 6 }
  );
  const clampRosetteGeo = cylinderSpec(0.068, 0.078, 0.09, 8);
  const bellCapGeo = softOrbSpec(0.056, 0.045, 0.056, 8, 4);

  const armWoodLobe = composeLobe({
    suffix: "beechwoodArm",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(clampRosetteGeo, "#CFA06E", { position: [0, 0.54, -0.34], rotation: [Math.PI * 0.5, 0, 0] }),
      part(armGeo, "#D8AD7C"),
      part(bellCapGeo, "#CFA06E", { position: [0, 0.83, 0] })
    ]
  });

  const swivelRingGeo = torusSpec(0.034, 0.01, 8, 5);
  const topAcornGeo = softOrbSpec(0.03, 0.038, 0.03, 7, 4);
  const brassHookLobe = composeLobe({
    suffix: "brassSwivel",
    craft: "brushedMetal",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(topAcornGeo, "#F0C869", { position: [0, 1.0, -0.05] }),
      part(swivelRingGeo, "#F0C869", { position: [0, 0.77, 0] })
    ]
  });

  // Revolving wooden cross-ring (`petals` sub-part, anchored at [0, 0.73, 0]) suspending plush stars, moon & clouds.
  const petalsAnchor: Vec3 = [0, 0.73, 0];
  const crossArmXGeo = sculptCurvedLimb(
    [
      [-0.31, -0.04, 0],
      [0, 0.02, 0],
      [0.31, -0.04, 0]
    ],
    0.021,
    { steps: 4, radialSegments: 5 }
  );
  const crossArmZGeo = sculptCurvedLimb(
    [
      [0, -0.04, -0.31],
      [0, 0.02, 0],
      [0, -0.04, 0.31]
    ],
    0.021,
    { steps: 4, radialSegments: 5 }
  );
  const hubBeadGeo = softOrbSpec(0.048, 0.038, 0.048, 8, 4);
  const dropCordGeo = cylinderSpec(0.006, 0.006, 0.34, 5, 0);
  const centerCordGeo = cylinderSpec(0.006, 0.006, 0.48, 5, 0);

  const crossRingWoodLobe = composeLobe({
    suffix: "mobileCrossRing",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(crossArmXGeo, "#DFB686"),
      part(crossArmZGeo, "#DFB686"),
      part(hubBeadGeo, "#C99660", { position: [0, 0.01, 0] }),
      part(dropCordGeo, "#EFE6D5", { position: [0, -0.21, 0.3] }),
      part(dropCordGeo, "#EFE6D5", { position: [0.3, -0.21, 0] }),
      part(dropCordGeo, "#EFE6D5", { position: [-0.3, -0.21, 0] }),
      part(dropCordGeo, "#EFE6D5", { position: [0, -0.21, -0.3] }),
      part(centerCordGeo, "#EFE6D5", { position: [0, -0.28, 0] })
    ]
  });

  // Suspended plush charms (relative to petalsAnchor y = 0.73; lowest tip grounded cleanly to 0.0).
  const plushStarGeo = starCharmSpec(0.095, 0.048, 0.042);
  const miniMoonGeo = sculptCurvedLimb(
    [
      [0.04, 0.085, 0],
      [-0.045, 0.055, 0],
      [-0.065, 0, 0],
      [-0.045, -0.055, 0],
      [0.04, -0.085, 0]
    ],
    (t) => 0.018 + 0.034 * Math.sin(t * Math.PI),
    { steps: 5, radialSegments: 5 }
  );
  const cloudMainGeo = softOrbSpec(0.088, 0.058, 0.062, 8, 4);
  const cloudSideGeo = softOrbSpec(0.058, 0.044, 0.05, 7, 4);

  const charmsFeltLobe = composeLobe({
    suffix: "plushMobileCharms",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(plushStarGeo, "#FFE08A", { position: [0, -0.4, 0.3] }),
      part(miniMoonGeo, "#FFD57E", { position: [0.3, -0.41, 0], rotation: [0, -0.35, 0] }),
      part(cloudMainGeo, "#EFE8FA", { position: [-0.3, -0.4, 0] }),
      part(cloudSideGeo, "#F8F4FF", { position: [-0.3, -0.38, 0.045] }),
      part(cloudMainGeo, "#DCE6FA", { position: [0, -0.4, -0.3] }),
      part(cloudSideGeo, "#F4F7FF", { position: [0.045, -0.38, -0.3] }),
      part(plushStarGeo, "#F9C784", { position: [0, -0.58, 0], scale: 1.08 })
    ]
  });

  return finalizeProceduralRig("cribMobile", [
    makeSubPartRig("body", ORIGIN, [armWoodLobe, brassHookLobe]),
    makeSubPartRig("petals", petalsAnchor, [crossRingWoodLobe, charmsFeltLobe], "body")
  ]);
}

// ---------------------------------------------------------------- 4. musicBox (0.45 m, fitMode: "exact", restAt: 0.55)

function buildMusicBoxRig(): ProceduralAssetRig {
  // Turned maple bun feet touching exact y = 0.000 + carved honey-maple case up to y = 0.53.
  const footGeo = softOrbSpec(0.075, 0.04, 0.075, 7, 4);
  const lowerPlinthGeo = roundedBoxSpec(0.92, 0.08, 0.74, 0.025, 1);
  const caseBodyGeo = roundedBoxSpec(0.86, 0.41, 0.68, 0.04, 1);
  const upperRimGeo = roundedBoxSpec(0.9, 0.06, 0.72, 0.02, 1);

  const bodyWoodLobe = composeLobe({
    suffix: "mapleCase",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(footGeo, "#A96E3B", { position: [-0.34, 0.04, 0.25] }),
      part(footGeo, "#A96E3B", { position: [0.34, 0.04, 0.25] }),
      part(footGeo, "#A96E3B", { position: [-0.34, 0.04, -0.25] }),
      part(footGeo, "#A96E3B", { position: [0.34, 0.04, -0.25] }),
      part(lowerPlinthGeo, "#BD7E46", { position: [0, 0.1, 0] }),
      part(caseBodyGeo, "#CE9158", { position: [0, 0.31, 0] }),
      part(upperRimGeo, "#BD7E46", { position: [0, 0.51, 0] })
    ]
  });

  // Speckled cream stoneware front inlay panel + recessed velvet-stoneware stage deck (top exact y = 0.55).
  const frontInlayGeo = roundedBoxSpec(0.62, 0.24, 0.035, 0.012, 1);
  const stageDeckGeo = cylinderSpec(0.27, 0.29, 0.04, 12);

  const bodyCeramicLobe = composeLobe({
    suffix: "stonewareInlay",
    craft: "ceramic",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(frontInlayGeo, "#F6EFE4", { position: [0, 0.31, 0.335] }),
      part(stageDeckGeo, "#EDE3F7", { position: [0, 0.53, 0.01] })
    ]
  });

  // Brass wind-up key on +X side + front clasp & musical medallion.
  const keyShaftGeo = cylinderSpec(0.022, 0.026, 0.12, 7);
  const keyBowGeo = torusSpec(0.052, 0.016, 8, 5);
  const lockPlateGeo = starCharmSpec(0.068, 0.035, 0.024);

  const bodyBrassLobe = composeLobe({
    suffix: "brassWindKey",
    craft: "brushedMetal",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(keyShaftGeo, "#ECC260", {
        position: [0.48, 0.31, 0.02],
        rotation: [0, 0, Math.PI * 0.5]
      }),
      part(keyBowGeo, "#F5D072", {
        position: [0.56, 0.31, 0.065]
      }),
      part(keyBowGeo, "#F5D072", {
        position: [0.56, 0.31, -0.025]
      }),
      part(lockPlateGeo, "#F5D072", { position: [0, 0.32, 0.358] })
    ]
  });

  // Rear-hinged opened maple lid (`anchor: [0, 0.55, -0.33]`) rising cleanly to exact y = 1.000.
  const lidAnchor: Vec3 = [0, 0.55, -0.33];
  const lidPanelGeo = roundedBoxSpec(0.86, 0.43, 0.065, 0.022, 1);
  const lidCrownGeo = softOrbSpec(0.28, 0.055, 0.038, 9, 4);
  const lidWoodLobe = composeLobe({
    suffix: "hingedLid",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(lidPanelGeo, "#D59960", { position: [0, 0.215, -0.05], rotation: [-0.18, 0, 0] }),
      part(lidCrownGeo, "#C2844B", { position: [0, 0.395, -0.09] })
    ]
  });

  // Twirling golden star figurine (`petals` sub-part, anchored on stage deck at [0, 0.55, 0.02]).
  const petalsAnchor: Vec3 = [0, 0.55, 0.02];
  const spindleGeo = cylinderSpec(0.018, 0.032, 0.11, 7);
  const starFigurineGeo = starCharmSpec(0.145, 0.072, 0.056);

  const figurineGlowLobe = composeLobe({
    suffix: "twirlingStarFigurine",
    craft: "warmGlow",
    baseColor: "#FFE29A",
    emissive: "#FFE29A",
    emissiveIntensity: 0.34,
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(spindleGeo, "#F2C96B", { position: [0, 0.055, 0] }),
      part(starFigurineGeo, "#FFE49E", { position: [0, 0.22, 0] })
    ]
  });

  return finalizeProceduralRig(
    "musicBox",
    [
      makeSubPartRig("body", ORIGIN, [bodyWoodLobe, bodyCeramicLobe, bodyBrassLobe]),
      makeSubPartRig("lid", lidAnchor, [lidWoodLobe]),
      makeSubPartRig("petals", petalsAnchor, [figurineGlowLobe], "body")
    ],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 5. nightlight (0.42 m)

function buildNightlightRig(): ProceduralAssetRig {
  // Turned honey-maple plinth & gallery collar (`wood` + `woodGrainPlank`).
  const plinthProfile: ProceduralVec2[] = [
    [0, 0],
    [0.26, 0],
    [0.275, 0.03],
    [0.245, 0.075],
    [0.2, 0.105],
    [0, 0.105]
  ];
  const plinthGeo = ensureOutwardNormals(latheGeometry({ profile: plinthProfile, segments: 14, creaseAngle: 1.1 }));
  const galleryRingGeo = cylinderSpec(0.215, 0.225, 0.05, 14);

  const woodBaseLobe = composeLobe({
    suffix: "maplePlinth",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(plinthGeo, "#C98D55"),
      part(galleryRingGeo, "#D4985F", { position: [0, 0.39, 0] })
    ]
  });

  // Speckled stoneware ceramic belly (`ceramic` + `glazedCeramicSpeckle`).
  const bellyProfile: ProceduralVec2[] = [
    [0, 0.095],
    [0.2, 0.095],
    [0.255, 0.17],
    [0.262, 0.26],
    [0.225, 0.345],
    [0.195, 0.385],
    [0, 0.385]
  ];
  const bellyGeo = ensureOutwardNormals(latheGeometry({ profile: bellyProfile, segments: 14, creaseAngle: 1.25 }));
  const ceramicBodyLobe = composeLobe({
    suffix: "stonewareBelly",
    craft: "ceramic",
    craftTexture: "glazedCeramicSpeckle",
    parts: [part(bellyGeo, "#F5EFE6")]
  });

  // Warm amber glowing lantern dome + embossed star-and-moon light motifs (`warmGlow`, `#FFE6B5`).
  const domeProfile: ProceduralVec2[] = [
    [0, 0.4],
    [0.195, 0.4],
    [0.225, 0.52],
    [0.215, 0.68],
    [0.17, 0.82],
    [0.095, 0.91],
    [0, 0.94]
  ];
  const domeGeo = ensureOutwardNormals(latheGeometry({ profile: domeProfile, segments: 14, creaseAngle: 1.35 }));
  const domeStarGeo = starCharmSpec(0.062, 0.031, 0.022);
  const domeMoonGeo = sculptCurvedLimb(
    [
      [0.025, 0.055, 0],
      [-0.03, 0.032, 0],
      [-0.042, 0, 0],
      [-0.03, -0.032, 0],
      [0.025, -0.055, 0]
    ],
    0.015,
    { steps: 4, radialSegments: 5 }
  );

  const lanternDomeLobe = composeLobe({
    suffix: "amberStarDome",
    craft: "warmGlow",
    baseColor: "#FFE6B5",
    emissive: "#FFE6B5",
    emissiveIntensity: 0.38,
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(domeGeo, "#FFE6B5"),
      part(domeStarGeo, "#FFF2CE", { position: [0, 0.64, 0.215] }),
      part(domeMoonGeo, "#FFF2CE", { position: [-0.16, 0.61, 0.14], rotation: [0, -0.65, 0] }),
      part(domeStarGeo, "#FFF2CE", { position: [0.16, 0.66, 0.14], rotation: [0, 0.65, 0], scale: 0.78 }),
      part(domeStarGeo, "#FFF2CE", { position: [0, 0.65, -0.215], scale: 0.85 })
    ]
  });

  // Brass switch button on +Z plinth + top finial ring & star crown.
  const buttonGeo = softOrbSpec(0.034, 0.022, 0.034, 8, 4);
  const finialBaseGeo = cylinderSpec(0.032, 0.048, 0.04, 8);
  const finialRingGeo = torusSpec(0.036, 0.011, 8, 5);

  const brassTrimLobe = composeLobe({
    suffix: "brassLanternTrim",
    craft: "brushedMetal",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(buttonGeo, "#F0C869", { position: [0, 0.22, 0.258], rotation: [Math.PI * 0.42, 0, 0] }),
      part(finialBaseGeo, "#E6BC5A", { position: [0, 0.945, 0] }),
      part(finialRingGeo, "#F2CC70", { position: [0, 0.985, 0] })
    ]
  });

  return finalizeProceduralRig("nightlight", [
    makeSubPartRig("body", ORIGIN, [woodBaseLobe, ceramicBodyLobe, lanternDomeLobe, brassTrimLobe])
  ]);
}

// ---------------------------------------------------------------- 6. blanket (0.18 m, fitMode: "exact", restAt: 0.75, tintTarget)

function buildBlanketRig(): ProceduralAssetRig {
  // Draped cozy quilted bedtime blanket (`width ~ 2.2`, `depth ~ 1.6`, exact `y = 0.000..1.000`, `restAt: 0.75`).
  const corePadGeo = roundedBoxSpec(1.94, 0.62, 1.38, 0.12, 1);
  const sideSkirtGeo = softOrbSpec(0.16, 0.26, 0.72, 9, 5);
  const frontBackSkirtGeo = softOrbSpec(0.98, 0.25, 0.16, 9, 5);
  const quiltPuffGeo = softOrbSpec(0.32, 0.14, 0.28, 9, 4);

  // Lowest point: side/front skirts centered at y = 0.26 with ry = 0.26 -> exact y = 0.000.
  // Quilted resting surface: quilt puffs centered at y = 0.62 with ry = 0.14 -> top at y = 0.76 (matches restAt: 0.75).
  const quiltMainLobe = composeLobe({
    suffix: "quiltedBlanket",
    craft: "felt",
    craftTexture: "quiltedStitch",
    tintTarget: true,
    baseColor: "#C8B6EE",
    parts: [
      part(corePadGeo, "#FFFFFF", { position: [0, 0.36, 0.04] }),
      part(sideSkirtGeo, "#F5F2FA", { position: [-0.94, 0.26, 0.04] }),
      part(sideSkirtGeo, "#F5F2FA", { position: [0.94, 0.26, 0.04] }),
      part(frontBackSkirtGeo, "#F5F2FA", { position: [0, 0.25, 0.68] }),
      part(frontBackSkirtGeo, "#F5F2FA", { position: [0, 0.25, -0.64] }),
      part(quiltPuffGeo, "#FFFFFF", { position: [-0.52, 0.62, 0.34] }),
      part(quiltPuffGeo, "#FFFFFF", { position: [0, 0.63, 0.34] }),
      part(quiltPuffGeo, "#FFFFFF", { position: [0.52, 0.62, 0.34] }),
      part(quiltPuffGeo, "#FFFFFF", { position: [-0.52, 0.62, -0.14] }),
      part(quiltPuffGeo, "#FFFFFF", { position: [0, 0.63, -0.14] }),
      part(quiltPuffGeo, "#FFFFFF", { position: [0.52, 0.62, -0.14] })
    ]
  });

  // Turned-down cozy gingham check cuff along the head end peaking at exact y = 1.000 + 4 corner tassels.
  const cuffGeo = sculptCurvedLimb(
    [
      [-0.92, 0.74, -0.44],
      [-0.46, 0.84, -0.46],
      [0, 0.86, -0.47],
      [0.46, 0.84, -0.46],
      [0.92, 0.74, -0.44]
    ],
    0.14,
    { steps: 6, radialSegments: 6 }
  );
  const tasselGeo = softOrbSpec(0.1, 0.12, 0.1, 7, 4);

  const ginghamCuffLobe = composeLobe({
    suffix: "ginghamCuff",
    craft: "clay",
    craftTexture: "ginghamCheck",
    tintTarget: false,
    parts: [
      part(cuffGeo, "#FFF3DC"),
      part(tasselGeo, "#F6DFB7", { position: [-1.0, 0.14, 0.72] }),
      part(tasselGeo, "#F6DFB7", { position: [1.0, 0.14, 0.72] }),
      part(tasselGeo, "#F6DFB7", { position: [-1.0, 0.14, -0.68] }),
      part(tasselGeo, "#F6DFB7", { position: [1.0, 0.14, -0.68] })
    ]
  });

  return finalizeProceduralRig(
    "blanket",
    [makeSubPartRig("body", ORIGIN, [quiltMainLobe, ginghamCuffLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 7. sleepyCloud (0.85 m, floats: true)

function buildSleepyCloudRig(): ProceduralAssetRig {
  // Organic FBM lavender-cream cloud pillow cluster (`sculptFbmOrganicPuffs` + `feltBoucle`).
  const puffItems: readonly OrganicPuffItem[] = [
    { position: [0, 0.44, 0.02], scale: [0.62, 0.46, 0.48], colorHex: "#F4EEFC" },
    { position: [-0.3, 0.37, 0.03], scale: [0.46, 0.36, 0.4], colorHex: "#EDE4FA" },
    { position: [0.3, 0.38, 0.03], scale: [0.46, 0.36, 0.4], colorHex: "#EFE8FB" },
    { position: [-0.15, 0.56, -0.02], scale: [0.42, 0.34, 0.36], colorHex: "#F9F5FF" },
    { position: [0.16, 0.54, -0.01], scale: [0.4, 0.33, 0.36], colorHex: "#F7F2FF" },
    { position: [0, 0.39, 0.14], scale: [0.48, 0.35, 0.35], colorHex: "#FAF7FF" }
  ];
  const cumulus = sculptFbmOrganicPuffs(puffItems, {
    puffSegments: 4,
    maxEdgeLength: 0.42,
    maxTriangles: 780,
    amplitude: 0.012,
    seed: 623
  });

  const cloudPuffLobe = composeLobe({
    suffix: "lavenderCumulus",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [part(cumulus.geometry, "#FFFFFF", { subShapes: cumulus.subShapeCount })]
  });

  // Cozy quilted underside bolster + tiny golden bedtime star button on the side puff.
  const bolsterGeo = softOrbSpec(0.38, 0.09, 0.2, 9, 4);
  const starButtonGeo = starCharmSpec(0.052, 0.026, 0.022);
  const smileStitchGeo = sculptCurvedLimb(
    [
      [-0.052, 0.345, 0.312],
      [0, 0.322, 0.324],
      [0.052, 0.345, 0.312]
    ],
    0.009,
    { steps: 3, radialSegments: 4 }
  );

  const bolsterTrimLobe = composeLobe({
    suffix: "quiltedCloudTrim",
    craft: "clay",
    craftTexture: "quiltedStitch",
    parts: [
      part(bolsterGeo, "#DFD4F4", { position: [0, 0.21, 0] }),
      part(starButtonGeo, "#FFE08C", { position: [0.33, 0.49, 0.19], rotation: [0, 0.38, -0.2] }),
      part(smileStitchGeo, "#6E5B7B")
    ]
  });

  const eyelidLPart = buildSleepingEyelidSubPart(
    -1,
    [-0.12, 0.42, 0.31],
    0.048,
    "#5B4B6B",
    "#EAE0F8"
  );
  const eyelidRPart = buildSleepingEyelidSubPart(
    1,
    [0.12, 0.42, 0.31],
    0.048,
    "#5B4B6B",
    "#EAE0F8"
  );

  const cheekAnchor: Vec3 = [0, 0.37, 0.305];
  const cheekPadGeo = softOrbSpec(0.046, 0.03, 0.022, 8, 4);
  const cheekPuffLobe = composeLobe({
    suffix: "rosyCheeks",
    craft: "clay",
    craftTexture: "glazedCeramicSpeckle",
    parts: [
      part(cheekPadGeo, "#F7B2C4", { position: [-0.18, 0, -0.012], rotation: [0, -0.24, 0] }),
      part(cheekPadGeo, "#F7B2C4", { position: [0.18, 0, -0.012], rotation: [0, 0.24, 0] })
    ]
  });

  return finalizeProceduralRig("sleepyCloud", [
    makeSubPartRig("body", ORIGIN, [cloudPuffLobe, bolsterTrimLobe]),
    eyelidLPart,
    eyelidRPart,
    makeSubPartRig("cheekPuff", cheekAnchor, [cheekPuffLobe], "body")
  ]);
}

// ---------------------------------------------------------------- registry export

export const BEDTIME_RIGS: Readonly<Record<BedtimeAssetKey, ProceduralAssetRig>> = {
  moon: buildMoonRig(),
  cradle: buildCradleRig(),
  cribMobile: buildCribMobileRig(),
  musicBox: buildMusicBoxRig(),
  nightlight: buildNightlightRig(),
  blanket: buildBlanketRig(),
  sleepyCloud: buildSleepyCloudRig()
};
