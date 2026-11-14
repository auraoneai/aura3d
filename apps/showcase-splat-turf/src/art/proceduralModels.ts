/**
 * WP-8 / WP-16 Splat Turf — Street-Sport Ink Arena Procedural Multi-Material Models (`@aura3d/engine`).
 *
 * Sculpted via `apps/showcase-port-shared/proceduralKernel.ts` with zero static `.glb` mounts
 * and zero `three` imports:
 * - Hero turf-painting ink rover & character pilot (`subdivideSmoothMesh` + `sculptStreamlinedHullMesh` +
 *   `sculptHumanoidLimbMesh` + `wheelAssemblySlots`, lathed borosilicate glass ink tank on back with
 *   `material.physical`, and anisotropic brass spray nozzle/roller manifold)
 * - Rival turf-painter / rotary scrubber rovers (`subdivideSmoothMesh` + `sculptStreamlinedHullMesh`)
 * - Chamfered arena curb bumper walls (`extrudePolygonMesh`) & pillowed sheen-fabric turf barriers
 * - Pressurized chromed ink-reservoir tanks (`latheMesh` Bezier domes + `material.physical` sight-glasses)
 * - Urban skatepark bleachers with hyperbolic sun-sail canopies (`loftSectionsMesh`)
 * - Open lattice truss speaker & stadium floodlight towers (`latticeTrussMesh`)
 * - Gore-ribbed stitched hot-air balloons & artist palette / brush sky-studio islands (`memoizeGeometry`)
 */
import {
  geometry,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;
import {
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  bezierCurve2,
  catmullRomSpline3,
  deformMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
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
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type TransformOpts,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import type { MeshData } from "../../../../examples/shared/runner-kit/index";

export const TURF_MAT = {
  CHROME: 0,
  ANISO_STEEL: 1,
  ANISO_BRASS: 2,
  CLEARCOAT_MAGENTA: 3,
  CLEARCOAT_CYAN: 4,
  CLEARCOAT_GOLD: 5,
  CLEARCOAT_LIME: 6,
  CLEARCOAT_PLUM: 7,
  SAIL_FABRIC_WARM: 8,
  SAIL_FABRIC_COOL: 9,
  BLEACHER_WOOD: 10,
  HOSE_RUBBER: 11,
  FOLIAGE_PBR: 12,
  CONCRETE_PBR: 13,
  LED_MAGENTA: 14,
  LED_CYAN: 15,
  LED_FLOOD: 16,
  CERAMIC_WHITE: 17,
  TERRACOTTA_CLAY: 18,
  SKIN_WARM: 19,
  HAIR_COBALT: 20,
  GLOVE_SLATE: 21,
  GOGGLE_LENS: 22,
  EYE_IRIS: 23,
  EYE_PUPIL: 24,
  SHORTS_DENIM: 25,
  INK_TIP_MAGENTA: 26,
  INK_TIP_LIME: 27,
  VISOR_TINT: 28
} as const;

export const TURF_ARENA_MATERIALS: readonly AuraMaterialSpec[] = [
  material.studioMetal({ color: "#f6fbff", roughness: 0.05, metalness: 0.96 }),
  material.brushedMetal({ color: "#c9d4e2", roughness: 0.24, anisotropy: 0.82, anisotropyRotation: 0.35 }),
  material.brushedMetal({ color: "#e8bb4e", roughness: 0.18, anisotropy: 0.88, anisotropyRotation: 1.1 }),
  material.carPaint({ color: "#ff2e84", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
  material.carPaint({ color: "#14c8ff", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
  material.carPaint({ color: "#ffb400", roughness: 0.065, clearcoat: 1, clearcoatRoughness: 0.022 }),
  material.carPaint({ color: "#34dc6c", roughness: 0.065, clearcoat: 1, clearcoatRoughness: 0.022 }),
  material.carPaint({ color: "#4f2a8f", roughness: 0.09, clearcoat: 0.92, clearcoatRoughness: 0.035 }),
  material.fabric({ color: "#ff669e", roughness: 0.72, sheen: 0.92, sheenColor: "#ffe5f0", sheenRoughness: 0.32 }),
  material.fabric({ color: "#2fd6c8", roughness: 0.7, sheen: 0.9, sheenColor: "#d9fffb", sheenRoughness: 0.34 }),
  material.lacquer({ color: "#d69456", roughness: 0.16, clearcoat: 0.72, clearcoatRoughness: 0.08 }),
  material.blackRubber({ color: "#211c2c", roughness: 0.62 }),
  material.pbr({ color: "#2cc86e", roughness: 0.48, metalness: 0.02, clearcoat: 0, sheen: 0 }),
  material.pbr({ color: "#f3efe6", roughness: 0.56, metalness: 0.03, clearcoat: 0, sheen: 0 }),
  material.emissive({ color: "#ff3d8b", emissive: "#ff2a82", emissiveIntensity: 3.1, practical: true }),
  material.emissive({ color: "#2ce6ff", emissive: "#16d8ff", emissiveIntensity: 3.0, practical: true }),
  material.emissive({ color: "#fff6dc", emissive: "#ffefc2", emissiveIntensity: 3.4, practical: true }),
  material.ceramic({ color: "#f8f5ee", roughness: 0.14 }),
  material.matteClay({ color: "#d4724e", roughness: 0.76 }),
  material.ceramic({ color: "#ffcfb4", roughness: 0.34 }),
  material.lacquer({ color: "#2a1b4e", roughness: 0.2, clearcoat: 0.72, clearcoatRoughness: 0.1 }),
  material.pbr({ color: "#262038", roughness: 0.38, metalness: 0.12, clearcoat: 0.24, sheen: 0 }),
  material.carPaint({ color: "#00e5ff", roughness: 0.035, clearcoat: 1, clearcoatRoughness: 0.015 }),
  material.lacquer({ color: "#08d9ff", roughness: 0.035, clearcoat: 1, clearcoatRoughness: 0.01 }),
  material.lacquer({ color: "#120922", roughness: 0.025, clearcoat: 1, clearcoatRoughness: 0.01 }),
  material.fabric({ color: "#2c2454", roughness: 0.68, sheen: 0.84, sheenColor: "#9c90ee", sheenRoughness: 0.36 }),
  material.carPaint({ color: "#ff1d8e", roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.01 }),
  material.carPaint({ color: "#26f07a", roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.01 }),
  material.carPaint({ color: "#0e2240", roughness: 0.025, clearcoat: 1, clearcoatRoughness: 0.01 })
];

/** Pressurized ink-reservoir & rover backpack sight-glass material (`castShadow: false` node). */
export const TURF_SIGHT_GLASS_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#d8f3ff",
  roughness: 0.04,
  opacity: 0.45,
  clearcoat: 1,
  ior: 1.5
});

/** Zero-clearcoat, zero-sheen PBR preset for GPU-instanced sky-studio backdrop islands. */
export const TURF_INSTANCED_ISLAND_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#ffffff",
  roughness: 0.44,
  metalness: 0.05,
  clearcoat: 0,
  sheen: 0
});

function rawPartsToMeshData(parts: readonly RawMesh[]): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const off = positions.length / 3;
    for (let i = 0; i < p.positions.length; i += 1) positions.push(p.positions[i]!);
    for (let i = 0; i < p.normals.length; i += 1) normals.push(p.normals[i]!);
    for (let i = 0; i < p.uvs.length; i += 1) uvs.push(p.uvs[i]!);
    for (let i = 0; i < p.indices.length; i += 1) indices.push(p.indices[i]! + off);
  }
  return { positions, normals, uvs, indices };
}

function transformSlots(slots: readonly MultiMatSlot[], opts: TransformOpts): MultiMatSlot[] {
  return slots.map((s) => ({
    mesh: transformMesh(s.mesh, opts),
    materialIndex: s.materialIndex
  }));
}

// ---------------------------------------------------------------------------
// 1. Piloted Hero Turf-Painter Ink-Racer, Goggle Pilot & Hydro-Spray Manifold
// ---------------------------------------------------------------------------

export interface HeroInkRoverNodes {
  readonly bodyNode: ReturnType<typeof assembleMultiMaterialNode>;
  readonly glassNode: ReturnType<typeof geometry.custom>;
}

const LED_MAT_INDICES: ReadonlySet<number> = new Set([
  TURF_MAT.LED_MAGENTA,
  TURF_MAT.LED_CYAN,
  TURF_MAT.LED_FLOOD
]);

/** Builds a chunky treaded turf-kart wheel (`wheelAssemblySlots` + Taubin-smoothed radial shoulder tread lugs) whose outer tread touches exact `radius`. */
function buildChunkyTreadedWheelSlots(opts: {
  readonly radius: number;
  readonly width: number;
  readonly lugs: number;
  readonly tireMat: number;
  readonly rimMat: number;
  readonly hubMat: number;
}): MultiMatSlot[] {
  const base = wheelAssemblySlots({
    radius: opts.radius * 0.955,
    width: opts.width,
    spokeCount: 5,
    tireMat: opts.tireMat,
    rimMat: opts.rimMat,
    rotorMat: opts.hubMat
  });
  const lugThick = opts.radius * 0.078;
  const lugRadialCenter = opts.radius - lugThick * 0.52;
  const lugBlock = taubinSmoothMesh(
    bevelBoxMesh(opts.width * 0.86, lugThick, opts.radius * 0.22, lugThick * 0.34),
    3
  );
  const lugParts: RawMesh[] = [];
  for (let i = 0; i < opts.lugs; i += 1) {
    const a = (i / opts.lugs) * Math.PI * 2;
    lugParts.push(
      transformMesh(lugBlock, {
        pos: [0, Math.cos(a) * lugRadialCenter, Math.sin(a) * lugRadialCenter],
        rot: [-a, 0, 0]
      })
    );
  }
  // Ensure exact bottom tire crown contact at `-opts.radius`
  const contactCrown = transformMesh(
    latheMesh(
      [
        [opts.radius * 0.88, -opts.width * 0.38],
        [opts.radius, -opts.width * 0.28],
        [opts.radius, opts.width * 0.28],
        [opts.radius * 0.88, opts.width * 0.38]
      ],
      32
    ),
    { rot: [0, 0, Math.PI * 0.5] }
  );
  return [...base, { mesh: mergeRawMeshesToRawLocal([contactCrown, ...lugParts]), materialIndex: opts.tireMat }];
}

function mergeRawMeshesToRawLocal(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const off = positions.length / 3;
    for (let i = 0; i < p.positions.length; i += 1) positions.push(p.positions[i]!);
    for (let i = 0; i < p.normals.length; i += 1) {
      normals.push(p.normals[i]!);
    }
    for (let i = 0; i < p.uvs.length; i += 1) uvs.push(p.uvs[i]!);
    for (let i = 0; i < p.indices.length; i += 1) indices.push(p.indices[i]! + off);
  }
  return ensureUnitRawNormals({ positions, normals, uvs, indices });
}

function ensureUnitRawNormals(src: RawMesh): RawMesh {
  const normals = new Array<number>(src.normals.length);
  for (let i = 0; i < src.normals.length; i += 3) {
    const nx = src.normals[i] ?? 0;
    const ny = src.normals[i + 1] ?? 1;
    const nz = src.normals[i + 2] ?? 0;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-4) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    } else {
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }
  }
  return {
    positions: src.positions,
    normals,
    uvs: src.uvs,
    indices: src.indices,
    ...(src.colors ? { colors: src.colors } : {})
  };
}

function clampMeshMinY(src: RawMesh, minY: number): RawMesh {
  let needsClamp = false;
  for (let i = 1; i < src.positions.length; i += 3) {
    if (src.positions[i]! < minY) {
      needsClamp = true;
      break;
    }
  }
  if (!needsClamp) return src;
  const positions = src.positions.slice();
  for (let i = 1; i < positions.length; i += 3) {
    if (positions[i]! < minY) positions[i] = minY;
  }
  return { ...src, positions };
}

/** Memoized unified SDF-sculpted chunky street sneaker (`+Z` toe, `y = 0` sole bottom, zero raw box/sphere seams). */
function getSculptedStreetSneakerMesh(): RawMesh {
  return memoizeGeometry("splat-turf:street-sneaker:v3", () =>
    ensureUnitRawNormals(
      sculptOrganicSdfMesh({
        boundsMin: [-0.068, -0.004, -0.085],
        boundsMax: [0.068, 0.108, 0.125],
        resolution: [26, 24, 30],
        taubinIterations: 7,
        projectToIso: 0.94,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          // Chunky flared skate sole + rounded toe bumper + high-top ankle cuff + padded tongue
          const sole = sdfTaperedCapsule(p, [0, 0.022, -0.048], [0, 0.020, 0.078], 0.046, 0.049);
          const toeBox = sdfEllipsoid(p, [0, 0.036, 0.046], [0.046, 0.030, 0.058]);
          const vamp = sdfTaperedCapsule(p, [0, 0.046, -0.036], [0, 0.038, 0.032], 0.042, 0.040);
          const cuff = sdfTaperedCapsule(p, [0, 0.048, -0.028], [0, 0.082, -0.020], 0.038, 0.035);
          const tongue = sdfEllipsoid(p, [0, 0.072, 0.012], [0.026, 0.028, 0.022]);
          let d = sminPoly(sole, toeBox, 0.022);
          d = sminPoly(d, vamp, 0.022);
          d = sminPoly(d, cuff, 0.018);
          d = sminPoly(d, tongue, 0.016);
          return Math.max(d, -y);
        }
      })
    )
  );
}

/** Memoized unified SDF-sculpted street glove hand (`+Z` fingers, `+X` thumb). */
function getSculptedStreetGloveMesh(): RawMesh {
  return memoizeGeometry("splat-turf:street-glove:v3", () =>
    ensureUnitRawNormals(
      sculptOrganicSdfMesh({
        boundsMin: [-0.052, -0.042, -0.048],
        boundsMax: [0.058, 0.042, 0.068],
        resolution: 24,
        taubinIterations: 7,
        projectToIso: 0.94,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          const palm = sdfEllipsoid(p, [0, 0, 0.006], [0.034, 0.024, 0.040]);
          const grip = sdfTaperedCapsule(p, [-0.016, -0.006, 0.030], [0.016, -0.006, 0.030], 0.022, 0.022);
          const thumb = sdfTaperedCapsule(p, [0.020, 0.002, -0.004], [0.040, 0.008, 0.024], 0.016, 0.013);
          const cuff = sdfTaperedCapsule(p, [0, 0, -0.032], [0, 0, -0.010], 0.028, 0.030);
          return sminPoly(sminPoly(sminPoly(palm, grip, 0.016), thumb, 0.014), cuff, 0.014);
        }
      })
    )
  );
}

/** Memoized smooth SDF squid-mantle hair dome crowning the street-ink kid's head (`+Z` forward, `+Y` up). */
function getSquidMantleCrownMesh(): RawMesh {
  return memoizeGeometry("splat-turf:squid-mantle:v3", () =>
    ensureUnitRawNormals(
      sculptOrganicSdfMesh({
        boundsMin: [-0.175, -0.08, -0.22],
        boundsMax: [0.175, 0.145, 0.175],
        resolution: [32, 28, 34],
        taubinIterations: 7,
        projectToIso: 0.94,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          const dome = sdfEllipsoid(p, [0, 0.032, -0.012], [0.146, 0.092, 0.152]);
          const crestL = sdfTaperedCapsule(p, [-0.048, 0.048, 0.02], [-0.072, 0.024, -0.145], 0.068, 0.046);
          const crestR = sdfTaperedCapsule(p, [0.048, 0.048, 0.02], [0.072, 0.024, -0.145], 0.068, 0.046);
          const bangs = sdfEllipsoid(p, [0, 0.038, 0.108], [0.105, 0.044, 0.056]);
          const skullCut = sdfEllipsoid(p, [0, -0.058, 0.028], [0.128, 0.095, 0.128]);
          let d = sminPoly(dome, sminPoly(crestL, crestR, 0.032), 0.028);
          d = sminPoly(d, bangs, 0.024);
          return Math.max(d, -skullCut);
        }
      })
    )
  );
}

/** Builds a smooth wraparound sporty street-ink tinted visor shield (`+Z` forward). */
function getSportyStreetVisorMeshes(): { readonly shield: RawMesh; readonly browTrim: RawMesh } {
  return memoizeGeometry("splat-turf:sporty-visor:v3", () => {
    const arcSteps = 15;
    const rings: V3[][] = [];
    const trimSpine: V4[] = [];
    for (let i = 0; i < arcSteps; i += 1) {
      const u = i / (arcSteps - 1);
      const ang = (-0.5 + u) * Math.PI * 0.78;
      const rx = 0.154;
      const rz = 0.168;
      const cx = Math.sin(ang) * rx;
      const cz = Math.cos(ang) * rz;
      const dip = Math.cos(ang * 1.15) * 0.026;
      const noseNotch = Math.exp(-Math.pow(ang / 0.22, 2)) * 0.016;
      const topY = 0.036 + dip * 0.35;
      const botY = -0.028 - dip + noseNotch;
      const nx = Math.sin(ang);
      const nz = Math.cos(ang);
      const thick = 0.011;
      rings.push([
        [cx + nx * thick, topY, cz + nz * thick],
        [cx + nx * (thick * 1.15), (topY + botY) * 0.5, cz + nz * (thick * 1.15) + 0.006],
        [cx + nx * (thick * 0.7), botY, cz + nz * (thick * 0.7)],
        [cx - nx * (thick * 0.4), botY + 0.004, cz - nz * (thick * 0.4)],
        [cx - nx * (thick * 0.4), topY - 0.003, cz - nz * (thick * 0.4)]
      ]);
      trimSpine.push([cx + nx * 0.011, topY + 0.004, cz + nz * 0.011, 0.0095]);
    }
    return {
      shield: ensureUnitRawNormals(taubinSmoothMesh(loftSectionsMesh(rings, true, false), 4, 0.45, -0.47)),
      browTrim: ensureUnitRawNormals(taubinSmoothMesh(tubeSweepMesh(trimSpine, 10), 2))
    };
  });
}

interface StreetInkKidOptions {
  readonly pose: "pilot" | "cheerLeft" | "cheerRight";
  readonly hoodieMat: number;
  readonly shortsMat: number;
  readonly hairMat: number;
  readonly tipMat: number;
  readonly sneakerMat: number;
  readonly headphoneGlowMat: number;
  readonly seed: number;
  readonly withBackpack?: boolean;
}

/**
 * Builds a sleek stylized Street-Ink Skater Kid in canonical hip-space (`+Z` forward, `+Y` up):
 * - `sculptStylizedHeadMesh` + expressive glossy eyes (sclera, vivid iris, dark pupil, specular catchlight)
 * - Sporty wraparound tinted visor + cushioned street DJ/skate headphones
 * - Smooth SDF squid-mantle crown + 7 curved squid-tentacle hair locks (`sculptCurvedHairLockMesh`) with glossy ink-dipped tips
 * - Draped street hoodie/jersey + bunched hood collar & flared athletic shorts (`sculptDrapedGarmentMesh`)
 * - Smooth anatomical arms & legs (`sculptAnatomicalLimbMesh`) + SDF-sculpted gloves & chunky street sneakers
 */
function buildStreetInkKidCharacterParts(opts: StreetInkKidOptions): {
  readonly opaqueSlots: MultiMatSlot[];
  readonly glassMeshes: RawMesh[];
} {
  const opaqueSlots: MultiMatSlot[] = [];
  const glassMeshes: RawMesh[] = [];
  const sneakerMesh = getSculptedStreetSneakerMesh();
  const gloveMesh = getSculptedStreetGloveMesh();
  const mantleMesh = getSquidMantleCrownMesh();
  const visor = getSportyStreetVisorMeshes();

  // 1. Flared athletic street shorts (`sculptDrapedGarmentMesh`)
  const shorts = sculptDrapedGarmentMesh(
    [
      { y: -0.085, rx: 0.132, rz: 0.106, z: 0.02, folds: 6, foldAmp: 0.055, superellipseN: 2.2 },
      { y: -0.025, rx: 0.138, rz: 0.112, z: 0.01, folds: 5, foldAmp: 0.042, superellipseN: 2.15 },
      { y: 0.045, rx: 0.124, rz: 0.098, z: 0.0, folds: 3, foldAmp: 0.025, superellipseN: 2.1 }
    ],
    { ringPoints: 22, capEnds: true, smoothPasses: 3 }
  );
  opaqueSlots.push({ mesh: ensureUnitRawNormals(shorts), materialIndex: opts.shortsMat });

  // 2. Draped oversized street hoodie/jersey + bunched sculpted hood collar (`sculptDrapedGarmentMesh`)
  const hoodie = sculptDrapedGarmentMesh(
    [
      { y: -0.015, rx: 0.152, rz: 0.118, z: 0.005, folds: 7, foldAmp: 0.062, superellipseN: 2.2 },
      { y: 0.095, rx: 0.158, rz: 0.122, z: 0.008, folds: 6, foldAmp: 0.052, superellipseN: 2.18 },
      { y: 0.225, rx: 0.172, rz: 0.126, z: 0.012, folds: 5, foldAmp: 0.038, superellipseN: 2.12 },
      { y: 0.325, rx: 0.124, rz: 0.094, z: 0.015, folds: 4, foldAmp: 0.025, superellipseN: 2.05 },
      { y: 0.355, rx: 0.068, rz: 0.064, z: 0.016, folds: 0, foldAmp: 0, superellipseN: 2.0 }
    ],
    { ringPoints: 24, capEnds: true, smoothPasses: 4 }
  );
  const hoodCollar = sculptDrapedGarmentMesh(
    [
      { y: 0.312, rx: 0.132, rz: 0.118, z: -0.012, folds: 5, foldAmp: 0.055, superellipseN: 2.05 },
      { y: 0.362, rx: 0.146, rz: 0.136, z: -0.024, folds: 6, foldAmp: 0.065, superellipseN: 2.05 },
      { y: 0.398, rx: 0.118, rz: 0.112, z: -0.032, folds: 4, foldAmp: 0.04, superellipseN: 2.0 }
    ],
    { ringPoints: 20, capEnds: true, smoothPasses: 3 }
  );
  opaqueSlots.push(
    { mesh: ensureUnitRawNormals(hoodie), materialIndex: opts.hoodieMat },
    { mesh: ensureUnitRawNormals(hoodCollar), materialIndex: opts.tipMat }
  );

  // 3. Smooth anatomical legs (`sculptAnatomicalLimbMesh`) & unified SDF chunky street sneakers
  for (const side of [-1, 1] as const) {
    const legStations =
      opts.pose === "pilot"
        ? [
            { pos: [side * 0.088, -0.035, 0.03] as V3, rx: 0.056, rz: 0.058 },
            { pos: [side * 0.116, 0.008, 0.155] as V3, rx: 0.049, rz: 0.051, zOffset: 0.006 },
            { pos: [side * 0.118, -0.095, 0.215] as V3, rx: 0.045, rz: 0.047, zOffset: -0.006 },
            { pos: [side * 0.116, -0.175, 0.238] as V3, rx: 0.036, rz: 0.038 }
          ]
        : [
            { pos: [side * 0.085, -0.045, 0.01] as V3, rx: 0.055, rz: 0.057 },
            { pos: [side * 0.095, -0.185, 0.04] as V3, rx: 0.047, rz: 0.049, zOffset: 0.006 },
            { pos: [side * 0.098, -0.325, 0.02] as V3, rx: 0.044, rz: 0.046, zOffset: -0.006 },
            { pos: [side * 0.098, -0.435, 0.015] as V3, rx: 0.035, rz: 0.037 }
          ];
    const legMesh = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(legStations, { ringPoints: 14, capEnds: true, muscleBiasZ: 0.14, peakT: 0.36 }),
      2
    );
    const footPos: V3 =
      opts.pose === "pilot" ? [side * 0.116, -0.228, 0.252] : [side * 0.098, -0.495, 0.032];
    const footRot: V3 = opts.pose === "pilot" ? [0.18, side * 0.08, 0] : [0, side * 0.1, 0];
    const midsoleTrim = transformMesh(
      taubinSmoothMesh(
        latheMesh(
          [
            [0.038, 0.004],
            [0.051, 0.008],
            [0.051, 0.022],
            [0.042, 0.026]
          ],
          18
        ),
        2
      ),
      { pos: footPos, rot: footRot, scale: [0.95, 1, 1.48] }
    );
    opaqueSlots.push(
      { mesh: ensureUnitRawNormals(legMesh), materialIndex: TURF_MAT.SKIN_WARM },
      { mesh: transformMesh(sneakerMesh, { pos: footPos, rot: footRot, scale: [side < 0 ? -1 : 1, 1, 1] }), materialIndex: opts.sneakerMat },
      { mesh: ensureUnitRawNormals(midsoleTrim), materialIndex: TURF_MAT.CERAMIC_WHITE }
    );
  }

  // 4. Smooth anatomical arms (`sculptAnatomicalLimbMesh`) & SDF-sculpted street gloves
  for (const side of [-1, 1] as const) {
    const cheerUp =
      (opts.pose === "cheerLeft" && side === -1) ||
      (opts.pose === "cheerRight" && side === 1);
    const armStations =
      opts.pose === "pilot"
        ? [
            { pos: [side * 0.158, 0.275, 0.015] as V3, rx: 0.048, rz: 0.048 },
            { pos: [side * 0.212, 0.198, 0.098] as V3, rx: 0.042, rz: 0.043, zOffset: -0.005 },
            { pos: [side * 0.182, 0.198, 0.155] as V3, rx: 0.039, rz: 0.040 },
            { pos: [side * 0.155, 0.202, 0.185] as V3, rx: 0.033, rz: 0.034 }
          ]
        : cheerUp
          ? [
              { pos: [side * 0.155, 0.285, 0.01] as V3, rx: 0.046, rz: 0.046 },
              { pos: [side * 0.235, 0.395, 0.05] as V3, rx: 0.040, rz: 0.041 },
              { pos: [side * 0.215, 0.545, 0.09] as V3, rx: 0.036, rz: 0.037 }
            ]
          : [
              { pos: [side * 0.155, 0.275, 0.01] as V3, rx: 0.046, rz: 0.046 },
              { pos: [side * 0.205, 0.165, 0.05] as V3, rx: 0.040, rz: 0.041 },
              { pos: [side * 0.165, 0.095, 0.11] as V3, rx: 0.035, rz: 0.036 }
            ];
    const armMesh = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(armStations, { ringPoints: 14, capEnds: true, muscleBiasZ: 0.12, peakT: 0.35 }),
      2
    );
    const endPt = armStations[armStations.length - 1]!.pos;
    const handRot: V3 = opts.pose === "pilot" ? [0.18, -side * 0.22, 0] : cheerUp ? [-1.15, 0, -side * 0.2] : [0.25, 0, 0];
    opaqueSlots.push(
      { mesh: ensureUnitRawNormals(armMesh), materialIndex: opts.hoodieMat },
      {
        mesh: transformMesh(gloveMesh, {
          pos: [endPt[0], endPt[1], endPt[2] + (opts.pose === "pilot" ? 0.016 : 0.01)],
          rot: handRot,
          scale: [side < 0 ? -1 : 1, 1, 1]
        }),
        materialIndex: TURF_MAT.GLOVE_SLATE
      }
    );
  }

  // 5. Stylized Street-Ink Head (`sculptStylizedHeadMesh`), Expressive Glossy Eyes, Sporty Tinted Visor & Street Headphones
  const headCenter: V3 = [0, 0.488, 0.028];
  const headMesh = transformMesh(
    taubinSmoothMesh(
      sculptStylizedHeadMesh(0.138, {
        jawTaper: 0.28,
        cheekFullness: 0.36,
        noseBridge: 0.24,
        browRidge: 0.14,
        subdivisions: 2,
        seed: opts.seed
      }),
      2
    ),
    { pos: headCenter, rot: [-0.05, 0, 0] }
  );
  // Smooth neck bridge
  const neckMesh = taubinSmoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0.335, 0.015], rx: 0.052, rz: 0.052 },
        { pos: [0, 0.415, 0.022], rx: 0.046, rz: 0.046 }
      ],
      { ringPoints: 14, capEnds: true }
    ),
    2
  );
  opaqueSlots.push(
    { mesh: ensureUnitRawNormals(neckMesh), materialIndex: TURF_MAT.SKIN_WARM },
    { mesh: ensureUnitRawNormals(headMesh), materialIndex: TURF_MAT.SKIN_WARM }
  );

  // Expressive glossy anime-street eyes (sclera + vivid iris + deep pupil + bright specular catchlight)
  const eyeBase = subdivideSmoothMesh(icosphereFacetMesh(0.032, 0, 0, 3), 2, 0.55);
  for (const side of [-1, 1] as const) {
    const ex = side * 0.051;
    const ey = headCenter[1] - 0.004;
    const ez = headCenter[2] + 0.126;
    opaqueSlots.push(
      {
        mesh: ensureUnitRawNormals(transformMesh(eyeBase, { pos: [ex, ey, ez], scale: [0.92, 1.16, 0.52], rot: [0, side * 0.18, 0] })),
        materialIndex: TURF_MAT.CERAMIC_WHITE
      },
      {
        mesh: ensureUnitRawNormals(transformMesh(eyeBase, { pos: [ex * 0.98, ey - 0.001, ez + 0.011], scale: [0.68, 0.88, 0.38], rot: [0, side * 0.18, 0] })),
        materialIndex: TURF_MAT.EYE_IRIS
      },
      {
        mesh: ensureUnitRawNormals(transformMesh(eyeBase, { pos: [ex * 0.97, ey - 0.002, ez + 0.017], scale: [0.38, 0.52, 0.28], rot: [0, side * 0.18, 0] })),
        materialIndex: TURF_MAT.EYE_PUPIL
      },
      {
        mesh: ensureUnitRawNormals(transformMesh(eyeBase, { pos: [ex + side * 0.009, ey + 0.011, ez + 0.021], scale: [0.20, 0.22, 0.18] })),
        materialIndex: TURF_MAT.CERAMIC_WHITE
      }
    );
  }

  // Sporty curved tinted street visor across upper brow/eyes
  const visorPose: TransformOpts = { pos: [0, headCenter[1] + 0.026, headCenter[2] + 0.002], rot: [0.10, 0, 0] };
  opaqueSlots.push(
    { mesh: transformMesh(visor.shield, visorPose), materialIndex: TURF_MAT.VISOR_TINT },
    { mesh: transformMesh(visor.browTrim, visorPose), materialIndex: TURF_MAT.GOGGLE_LENS }
  );

  // Street DJ / Skate Headphones: padded arched headband + cushioned multi-ring earcups + glowing LED ring
  const bandPts = catmullRomSpline3(
    [
      [-0.156, headCenter[1] + 0.005, headCenter[2] - 0.008],
      [-0.142, headCenter[1] + 0.118, headCenter[2] - 0.012],
      [0, headCenter[1] + 0.168, headCenter[2] - 0.014],
      [0.142, headCenter[1] + 0.118, headCenter[2] - 0.012],
      [0.156, headCenter[1] + 0.005, headCenter[2] - 0.008]
    ],
    5
  );
  opaqueSlots.push({
    mesh: ensureUnitRawNormals(taubinSmoothMesh(tubeSweepMesh(bandPts.map((p): V4 => [p[0], p[1], p[2], 0.018]), 10), 2)),
    materialIndex: TURF_MAT.GLOVE_SLATE
  });
  const earCushion = taubinSmoothMesh(
    latheMesh(
      [
        [0, 0],
        [0.056, 0],
        [0.062, 0.018],
        [0.058, 0.038],
        [0.038, 0.048],
        [0, 0.048]
      ],
      20
    ),
    2
  );
  const earGlowRing = latheMesh(
    [
      [0.038, 0.044],
      [0.052, 0.044],
      [0.052, 0.052],
      [0.038, 0.052]
    ],
    20
  );
  for (const side of [-1, 1] as const) {
    const cupPose: TransformOpts = {
      pos: [side * 0.138, headCenter[1] - 0.006, headCenter[2] - 0.008],
      rot: [0, 0, -side * Math.PI * 0.5]
    };
    opaqueSlots.push(
      { mesh: ensureUnitRawNormals(transformMesh(earCushion, cupPose)), materialIndex: TURF_MAT.CERAMIC_WHITE },
      { mesh: ensureUnitRawNormals(transformMesh(earGlowRing, cupPose)), materialIndex: opts.headphoneGlowMat }
    );
  }

  // 6. Smooth SDF Squid-Mantle Crown + 7 Curved Squid-Tentacle Hair Locks (`sculptCurvedHairLockMesh`) with Glossy Ink Tips!
  opaqueSlots.push({
    mesh: transformMesh(mantleMesh, { pos: [0, headCenter[1] + 0.052, headCenter[2] - 0.006] }),
    materialIndex: opts.hairMat
  });

  const tentacleSpecs: readonly {
    readonly root: V3;
    readonly mid: V3;
    readonly tip: V3;
    readonly tipRoot: V3;
    readonly tipMid: V3;
    readonly width: number;
  }[] = [
    // Signature long left & right twin squid-tentacles sweeping back & curling gracefully outward
    {
      root: [-0.088, headCenter[1] + 0.072, headCenter[2] - 0.055],
      mid: [-0.175, headCenter[1] - 0.015, headCenter[2] - 0.215],
      tip: [-0.228, headCenter[1] - 0.135, headCenter[2] - 0.365],
      tipRoot: [-0.158, headCenter[1] + 0.002, headCenter[2] - 0.185],
      tipMid: [-0.205, headCenter[1] - 0.075, headCenter[2] - 0.295],
      width: 0.092
    },
    {
      root: [0.088, headCenter[1] + 0.072, headCenter[2] - 0.055],
      mid: [0.175, headCenter[1] - 0.015, headCenter[2] - 0.215],
      tip: [0.228, headCenter[1] - 0.135, headCenter[2] - 0.365],
      tipRoot: [0.158, headCenter[1] + 0.002, headCenter[2] - 0.185],
      tipMid: [0.205, headCenter[1] - 0.075, headCenter[2] - 0.295],
      width: 0.092
    },
    // Cheek-framing forward/side squid-locks peeking ahead of the headphones
    {
      root: [-0.112, headCenter[1] + 0.048, headCenter[2] + 0.055],
      mid: [-0.148, headCenter[1] - 0.032, headCenter[2] + 0.045],
      tip: [-0.135, headCenter[1] - 0.112, headCenter[2] + 0.015],
      tipRoot: [-0.142, headCenter[1] - 0.022, headCenter[2] + 0.045],
      tipMid: [-0.142, headCenter[1] - 0.072, headCenter[2] + 0.030],
      width: 0.058
    },
    {
      root: [0.112, headCenter[1] + 0.048, headCenter[2] + 0.055],
      mid: [0.148, headCenter[1] - 0.032, headCenter[2] + 0.045],
      tip: [0.135, headCenter[1] - 0.112, headCenter[2] + 0.015],
      tipRoot: [0.142, headCenter[1] - 0.022, headCenter[2] + 0.045],
      tipMid: [0.142, headCenter[1] - 0.072, headCenter[2] + 0.030],
      width: 0.058
    },
    // Dorsal crest & nape squid-tentacle fan streaming dynamically aft
    {
      root: [0, headCenter[1] + 0.105, headCenter[2] - 0.045],
      mid: [0.012, headCenter[1] + 0.075, headCenter[2] - 0.215],
      tip: [0.024, headCenter[1] + 0.012, headCenter[2] - 0.345],
      tipRoot: [0.009, headCenter[1] + 0.082, headCenter[2] - 0.185],
      tipMid: [0.018, headCenter[1] + 0.045, headCenter[2] - 0.275],
      width: 0.078
    },
    {
      root: [-0.048, headCenter[1] + 0.042, headCenter[2] - 0.095],
      mid: [-0.082, headCenter[1] - 0.035, headCenter[2] - 0.225],
      tip: [-0.096, headCenter[1] - 0.095, headCenter[2] - 0.315],
      tipRoot: [-0.074, headCenter[1] - 0.020, headCenter[2] - 0.195],
      tipMid: [-0.088, headCenter[1] - 0.062, headCenter[2] - 0.265],
      width: 0.066
    },
    {
      root: [0.048, headCenter[1] + 0.042, headCenter[2] - 0.095],
      mid: [0.082, headCenter[1] - 0.035, headCenter[2] - 0.225],
      tip: [0.096, headCenter[1] - 0.095, headCenter[2] - 0.315],
      tipRoot: [0.074, headCenter[1] - 0.020, headCenter[2] - 0.195],
      tipMid: [0.088, headCenter[1] - 0.062, headCenter[2] - 0.265],
      width: 0.066
    }
  ];

  const suctionDot = subdivideSmoothMesh(icosphereFacetMesh(0.018, 0, 0, 7), 1, 0.55);
  for (let tIdx = 0; tIdx < tentacleSpecs.length; tIdx += 1) {
    const sp = tentacleSpecs[tIdx]!;
    const baseLock = sculptCurvedHairLockMesh({
      root: sp.root,
      mid: sp.mid,
      tip: sp.tip,
      width: sp.width,
      thickness: sp.width * 0.68,
      segments: 12,
      radialSegments: 12
    });
    const inkTipLock = sculptCurvedHairLockMesh({
      root: sp.tipRoot,
      mid: sp.tipMid,
      tip: [
        sp.tip[0] + (sp.tip[0] - sp.mid[0]) * 0.08,
        sp.tip[1] + (sp.tip[1] - sp.mid[1]) * 0.08,
        sp.tip[2] + (sp.tip[2] - sp.mid[2]) * 0.08
      ],
      width: sp.width * 0.84,
      thickness: sp.width * 0.62,
      segments: 9,
      radialSegments: 12
    });
    opaqueSlots.push(
      { mesh: ensureUnitRawNormals(baseLock), materialIndex: opts.hairMat },
      { mesh: ensureUnitRawNormals(inkTipLock), materialIndex: opts.tipMat }
    );
    if (tIdx < 2) {
      // Glossy ink-droplet / tentacle suction accents along the main twin locks
      opaqueSlots.push({
        mesh: ensureUnitRawNormals(
          transformMesh(suctionDot, {
            pos: [sp.tipMid[0] * 1.04, sp.tipMid[1] - 0.018, sp.tipMid[2]],
            scale: [1.1, 0.65, 1.1]
          })
        ),
        materialIndex: TURF_MAT.CERAMIC_WHITE
      });
    }
  }

  // 7. Optional Sleek Glass/Neon Pressurized Street-Ink Backpack Tank strapped over the hoodie shoulders
  if (opts.withBackpack) {
    for (const side of [-1, 1] as const) {
      const strapPts = catmullRomSpline3(
        [
          [side * 0.095, 0.335, 0.055],
          [side * 0.115, 0.348, -0.045],
          [side * 0.092, 0.225, -0.125],
          [side * 0.082, 0.095, -0.105]
        ],
        4
      );
      opaqueSlots.push({
        mesh: ensureUnitRawNormals(taubinSmoothMesh(tubeSweepMesh(strapPts.map((p): V4 => [p[0], p[1], p[2], 0.018]), 8), 2)),
        materialIndex: TURF_MAT.GLOVE_SLATE
      });
    }
    const packPose: TransformOpts = { pos: [0, 0.075, -0.155], rot: [0.12, 0, 0] };
    opaqueSlots.push(
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            latheMesh(
              [
                [0, 0],
                [0.082, 0],
                [0.092, 0.032],
                [0.092, 0.062],
                [0.076, 0.068]
              ],
              18
            ),
            packPose
          )
        ),
        materialIndex: TURF_MAT.CHROME
      },
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            latheMesh(
              [
                [0.076, 0.225],
                [0.092, 0.232],
                [0.092, 0.262],
                [0.065, 0.298],
                [0.028, 0.318],
                [0, 0.322]
              ],
              18
            ),
            packPose
          )
        ),
        materialIndex: TURF_MAT.CHROME
      },
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            latheMesh(
              [
                [0, 0.055],
                [0.066, 0.055],
                [0.066, 0.195],
                [0.056, 0.208],
                [0, 0.202]
              ],
              16
            ),
            packPose
          )
        ),
        materialIndex: opts.tipMat
      },
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            latheMesh(
              [
                [0.042, 0.192],
                [0.068, 0.198],
                [0.068, 0.218],
                [0.042, 0.218]
              ],
              16
            ),
            packPose
          )
        ),
        materialIndex: opts.headphoneGlowMat
      }
    );
    glassMeshes.push(
      ensureUnitRawNormals(
        transformMesh(
          latheMesh(
            [
              [0.076, 0.062],
              [0.085, 0.068],
              [0.085, 0.226],
              [0.076, 0.232]
            ],
            20
          ),
          packPose
        )
      )
    );
  }

  return { opaqueSlots, glassMeshes };
}

/**
 * Charismatic Street-Ink Skater Kid & Streamlined Turf Cruiser riding behind the `0.45 m` front wet-ink roller
 * (`ball` sits at local `[0, 0, 0]`, ground contact `y = 0` in world space is local `y = -0.45`):
 * - Streamlined Taubin-faired Turf Cruiser monocoque (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`),
 *   smooth aero splitter wing, Venturi side pods, flared fenders & twin faired Splatter Blaster cannons
 * - 4 chunky treaded turf tires with 5-spoke anodized brass alloy rims & chrome hubs touching exact `y = -0.45`
 * - Pressurized borosilicate glass ink tank (`ink-rover-glass`) + pilot's sleek glass/neon backpack ink tank
 * - Sleek stylized Street-Ink Skater Kid in the open cockpit: `sculptStylizedHeadMesh`, curved squid-tentacle
 *   hair locks (`sculptCurvedHairLockMesh`) with glossy ink-dipped tips, sporty wraparound tinted visor,
 *   street headphones, expressive glossy eyes, draped street hoodie & shorts (`sculptDrapedGarmentMesh`),
 *   smooth anatomical limbs (`sculptAnatomicalLimbMesh`), and SDF-sculpted street sneakers!
 */
export function assembleHeroInkRoverNodes(): HeroInkRoverNodes {
  const rawSlots: MultiMatSlot[] = [];
  const glassParts: RawMesh[] = [];

  // 1A. Streamlined Taubin-faired open-cockpit Turf Cruiser monocoque (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`)
  const cruiserHull = taubinSmoothMesh(
    deformMesh(
      sculptStreamlinedHullMesh(1.02, 0.88, 0.34, {
        noseSharpness: 0.56,
        tailTaper: 0.44,
        canopyBulge: 0.24,
        undersideFlat: 0.68,
        stations: 15,
        ringPoints: 22
      }),
      ([x, y, z]) => {
        // After `rotY = Math.PI` and `posZ = 0.83`, local `+z` faces forward `-Z` (`0.32..1.34`)
        const cockpitMask =
          y > 0.02 && Math.abs(x) < 0.31 && z > -0.10 && z < 0.30
            ? (1 - Math.pow(Math.abs(x) / 0.31, 2)) * Math.sin(((z + 0.10) / 0.40) * Math.PI)
            : 0;
        return [x, y - cockpitMask * 0.16, z];
      }
    ),
    4
  );
  rawSlots.push({
    mesh: ensureUnitRawNormals(transformMesh(cruiserHull, { pos: [0, -0.17, 0.83], rot: [0, Math.PI, 0] })),
    materialIndex: TURF_MAT.CLEARCOAT_MAGENTA
  });

  // Sculpted cyan cockpit coaming lip & streamlined aero nose wing (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`)
  const coamingPts = catmullRomSpline3(
    [
      [-0.31, -0.02, 0.78],
      [-0.33, 0.03, 0.58],
      [-0.18, 0.065, 0.44],
      [0.18, 0.065, 0.44],
      [0.33, 0.03, 0.58],
      [0.31, -0.02, 0.78]
    ],
    5
  );
  const noseWing = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.20, 0.72, 0.062, {
      noseSharpness: 0.52,
      tailTaper: 0.38,
      canopyBulge: 0.12,
      undersideFlat: 0.72,
      stations: 11,
      ringPoints: 18
    }),
    3
  );
  rawSlots.push(
    {
      mesh: ensureUnitRawNormals(taubinSmoothMesh(tubeSweepMesh(coamingPts.map((p): V4 => [p[0], p[1], p[2], 0.028]), 12), 2)),
      materialIndex: TURF_MAT.CLEARCOAT_CYAN
    },
    {
      mesh: ensureUnitRawNormals(transformMesh(noseWing, { pos: [0, -0.30, 0.39], rot: [0.12, Math.PI, 0] })),
      materialIndex: TURF_MAT.CLEARCOAT_GOLD
    }
  );

  // 1B. Flared compound-curve front & rear fenders, side Venturi pods, faired Splatter Blaster cannons & 4 chunky wheels (`minY = -0.45`)
  const frontWheelTemplate = buildChunkyTreadedWheelSlots({
    radius: 0.17,
    width: 0.125,
    lugs: 10,
    tireMat: TURF_MAT.HOSE_RUBBER,
    rimMat: TURF_MAT.ANISO_BRASS,
    hubMat: TURF_MAT.CHROME
  });
  const rearWheelTemplate = buildChunkyTreadedWheelSlots({
    radius: 0.23,
    width: 0.168,
    lugs: 12,
    tireMat: TURF_MAT.HOSE_RUBBER,
    rimMat: TURF_MAT.ANISO_BRASS,
    hubMat: TURF_MAT.CHROME
  });

  const blasterCowl = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.30, 0.13, 0.12, {
      noseSharpness: 0.42,
      tailTaper: 0.48,
      canopyBulge: 0.26,
      undersideFlat: 0.45,
      stations: 11,
      ringPoints: 16
    }),
    4
  );

  for (const side of [-1, 1] as const) {
    // Front outrigger wishbone strut + Taubin-faired cycle fender + chunky front tire (`-0.28 - 0.17 = -0.45` exact ground touch!)
    rawSlots.push(
      {
        mesh: ensureUnitRawNormals(
          tubeSweepMesh(
            [
              [side * 0.32, -0.22, 0.44, 0.024],
              [side * 0.55, -0.28, 0.35, 0.022]
            ],
            10
          )
        ),
        materialIndex: TURF_MAT.ANISO_STEEL
      },
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            taubinSmoothMesh(
              sculptStreamlinedHullMesh(0.40, 0.165, 0.115, {
                noseSharpness: 0.45,
                tailTaper: 0.42,
                canopyBulge: 0.30,
                undersideFlat: 0.72,
                stations: 11,
                ringPoints: 16
              }),
              4
            ),
            { pos: [side * 0.56, -0.09, 0.35], rot: [0.08, Math.PI, -side * 0.1] }
          )
        ),
        materialIndex: TURF_MAT.CLEARCOAT_CYAN
      },
      ...transformSlots(frontWheelTemplate, { pos: [side * 0.56, -0.28, 0.35] })
    );

    // Sculpted side Venturi intake pod + muscular flared rear fender arch + chunky rear tire (`-0.22 - 0.23 = -0.45` exact ground touch!)
    rawSlots.push(
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            taubinSmoothMesh(
              sculptStreamlinedHullMesh(0.50, 0.18, 0.165, {
                noseSharpness: 0.38,
                tailTaper: 0.34,
                canopyBulge: 0.24,
                undersideFlat: 0.52,
                stations: 11,
                ringPoints: 16
              }),
              4
            ),
            { pos: [side * 0.41, -0.20, 0.68], rot: [0, Math.PI, 0] }
          )
        ),
        materialIndex: TURF_MAT.CLEARCOAT_CYAN
      },
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            taubinSmoothMesh(
              sculptStreamlinedHullMesh(0.56, 0.215, 0.155, {
                noseSharpness: 0.38,
                tailTaper: 0.36,
                canopyBulge: 0.34,
                undersideFlat: 0.68,
                stations: 11,
                ringPoints: 16
              }),
              4
            ),
            { pos: [side * 0.50, -0.01, 1.00], rot: [-0.06, Math.PI, -side * 0.12] }
          )
        ),
        materialIndex: TURF_MAT.CLEARCOAT_CYAN
      },
      ...transformSlots(rearWheelTemplate, { pos: [side * 0.51, -0.22, 1.00] })
    );

    // Twin faired forward Splatter Blaster cannons (`sculptStreamlinedHullMesh` + `taubinSmoothMesh` + anodized brass muzzle + neon ring)
    const cannonBell = latheMesh(
      [
        [0, 0],
        [0.052, 0],
        [0.056, 0.08],
        [0.044, 0.15],
        [0.062, 0.195],
        [0.046, 0.21],
        [0, 0.205]
      ],
      16
    );
    rawSlots.push(
      {
        mesh: ensureUnitRawNormals(
          transformMesh(blasterCowl, {
            pos: [side * 0.34, 0.09, 0.49],
            rot: [-0.28, Math.PI + side * 0.12, 0]
          })
        ),
        materialIndex: TURF_MAT.CERAMIC_WHITE
      },
      {
        mesh: ensureUnitRawNormals(
          transformMesh(cannonBell, {
            pos: [side * 0.34, 0.14, 0.38],
            rot: [-1.28, side * 0.14, 0]
          })
        ),
        materialIndex: TURF_MAT.ANISO_BRASS
      },
      {
        mesh: ensureUnitRawNormals(
          transformMesh(
            latheMesh([[0.048, 0.06], [0.064, 0.07], [0.064, 0.12], [0.048, 0.13]], 16),
            { pos: [side * 0.34, 0.14, 0.38], rot: [-1.28, side * 0.14, 0] }
          )
        ),
        materialIndex: TURF_MAT.LED_CYAN
      }
    );
  }

  // 1C. Smooth faired rear ground-effect diffuser + aero ducktail spoiler + twin canted chrome/LED exhaust nozzles
  const rearDiffuser = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.24, 0.64, 0.12, {
      noseSharpness: 0.36,
      tailTaper: 0.48,
      canopyBulge: 0.14,
      undersideFlat: 0.68,
      stations: 10,
      ringPoints: 16
    }),
    3
  );
  const rearDucktail = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.16, 0.60, 0.048, {
      noseSharpness: 0.45,
      tailTaper: 0.42,
      canopyBulge: 0.20,
      undersideFlat: 0.55,
      stations: 9,
      ringPoints: 16
    }),
    3
  );
  rawSlots.push(
    {
      mesh: ensureUnitRawNormals(transformMesh(rearDiffuser, { pos: [0, -0.28, 1.22], rot: [-0.16, Math.PI, 0] })),
      materialIndex: TURF_MAT.GLOVE_SLATE
    },
    {
      mesh: ensureUnitRawNormals(transformMesh(rearDucktail, { pos: [0, -0.03, 1.25], rot: [0.30, Math.PI, 0] })),
      materialIndex: TURF_MAT.CLEARCOAT_GOLD
    }
  );
  const exhaustBell = latheMesh(
    [
      [0.036, 0],
      [0.054, 0.04],
      [0.064, 0.13],
      [0.052, 0.135],
      [0.038, 0.03]
    ],
    16
  );
  const exhaustGlow = latheMesh([[0, 0.03], [0.045, 0.05], [0.048, 0.125], [0, 0.128]], 14);
  for (const side of [-1, 1] as const) {
    const exPose: TransformOpts = { pos: [side * 0.18, -0.19, 1.23], rot: [1.38, side * 0.12, 0] };
    rawSlots.push(
      { mesh: ensureUnitRawNormals(transformMesh(exhaustBell, exPose)), materialIndex: TURF_MAT.CHROME },
      { mesh: ensureUnitRawNormals(transformMesh(exhaustGlow, exPose)), materialIndex: TURF_MAT.LED_CYAN }
    );
  }

  // 1D. Translucent pressurized cruiser hydro-reservoir (`ink-rover-glass`) + brass gauge cage + dual braided hoses
  const tankPose: TransformOpts = { pos: [0, -0.03, 1.04], rot: [-0.26, 0, 0] };
  const botCapPts = bezierCurve2([0, 0], [0.16, 0], [0.205, 0.05], [0.205, 0.11], 6);
  const topCapPts = bezierCurve2([0.205, 0.44], [0.205, 0.52], [0.13, 0.58], [0.045, 0.60], 6);
  rawSlots.push(
    {
      mesh: ensureUnitRawNormals(transformMesh(latheMesh([...botCapPts, [0.22, 0.12], [0.22, 0.155], [0.185, 0.165]], 18), tankPose)),
      materialIndex: TURF_MAT.ANISO_BRASS
    },
    {
      mesh: ensureUnitRawNormals(transformMesh(latheMesh([[0.185, 0.41], [0.22, 0.42], [0.22, 0.455], ...topCapPts, [0.06, 0.64], [0, 0.65]], 18), tankPose)),
      materialIndex: TURF_MAT.ANISO_BRASS
    },
    {
      mesh: ensureUnitRawNormals(transformMesh(latheMesh([[0, 0.14], [0.158, 0.14], [0.158, 0.37], [0.14, 0.395], [0, 0.385]], 16), tankPose)),
      materialIndex: TURF_MAT.CLEARCOAT_MAGENTA
    },
    {
      mesh: ensureUnitRawNormals(transformMesh(latheMesh([[0.115, 0.365], [0.162, 0.375], [0.162, 0.408], [0.115, 0.408]], 16), tankPose)),
      materialIndex: TURF_MAT.LED_MAGENTA
    }
  );
  for (let r = 0; r < 4; r += 1) {
    const ang = (r / 4) * Math.PI * 2 + Math.PI * 0.25;
    const rx = Math.cos(ang) * 0.208;
    const rz = Math.sin(ang) * 0.208;
    rawSlots.push({
      mesh: ensureUnitRawNormals(transformMesh(tubeSweepMesh([[rx, 0.13, rz, 0.014], [rx, 0.44, rz, 0.014]], 8), tankPose)),
      materialIndex: TURF_MAT.ANISO_BRASS
    });
  }
  glassParts.push(
    ensureUnitRawNormals(transformMesh(latheMesh([[0.185, 0.155], [0.198, 0.165], [0.198, 0.42], [0.185, 0.43]], 20), tankPose))
  );

  for (const side of [-1, 1] as const) {
    const hosePts = catmullRomSpline3(
      [
        [side * 0.16, 0.11, 1.04],
        [side * 0.34, 0.01, 0.80],
        [side * 0.38, 0.03, 0.56],
        [side * 0.34, 0.12, 0.44]
      ],
      5
    );
    rawSlots.push({
      mesh: ensureUnitRawNormals(tubeSweepMesh(hosePts.map((p): V4 => [p[0], p[1], p[2], 0.025]), 9)),
      materialIndex: TURF_MAT.HOSE_RUBBER
    });
  }

  // 1E. Smooth Cockpit Shell: contoured bucket backrest + brass steering column + butterfly twin-grip yoke
  const bucketSeat = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.08, rx: 0.16, rz: 0.065, z: 0.82, superellipseN: 2.3 },
        { y: 0.08, rx: 0.165, rz: 0.058, z: 0.84, superellipseN: 2.2 },
        { y: 0.24, rx: 0.135, rz: 0.048, z: 0.87, superellipseN: 2.1 }
      ],
      { ringPoints: 18, capEnds: true, smoothPasses: 3 }
    ),
    2
  );
  rawSlots.push(
    { mesh: ensureUnitRawNormals(bucketSeat), materialIndex: TURF_MAT.GLOVE_SLATE },
    {
      mesh: ensureUnitRawNormals(tubeSweepMesh([[0, -0.02, 0.46, 0.024], [0, 0.21, 0.51, 0.022]], 10)),
      materialIndex: TURF_MAT.ANISO_BRASS
    }
  );
  for (const side of [-1, 1] as const) {
    const yokeGripPts = catmullRomSpline3(
      [
        [0, 0.21, 0.505],
        [side * 0.155, 0.238, 0.51],
        [side * 0.165, 0.175, 0.525],
        [side * 0.065, 0.178, 0.51]
      ],
      4
    );
    rawSlots.push({
      mesh: ensureUnitRawNormals(taubinSmoothMesh(tubeSweepMesh(yokeGripPts.map((p): V4 => [p[0], p[1], p[2], 0.019]), 9), 2)),
      materialIndex: TURF_MAT.GLOVE_SLATE
    });
  }

  // 1F. Sleek Stylized Street-Ink Skater Kid in Cockpit (`rotY = Math.PI` facing `-Z` forward, with sleek glass/neon backpack tank!)
  const heroKid = buildStreetInkKidCharacterParts({
    pose: "pilot",
    hoodieMat: TURF_MAT.SAIL_FABRIC_COOL,
    shortsMat: TURF_MAT.SHORTS_DENIM,
    hairMat: TURF_MAT.HAIR_COBALT,
    tipMat: TURF_MAT.INK_TIP_MAGENTA,
    sneakerMat: TURF_MAT.CLEARCOAT_GOLD,
    headphoneGlowMat: TURF_MAT.LED_CYAN,
    seed: 19,
    withBackpack: true
  });
  const kidPose: TransformOpts = { pos: [0, 0.01, 0.69], rot: [0, Math.PI, 0] };
  rawSlots.push(...transformSlots(heroKid.opaqueSlots, kidPose));
  for (const gm of heroKid.glassMeshes) {
    glassParts.push(transformMesh(gm, kidPose));
  }

  // Coiled umbilical ink feed hose linking pilot's sleek backpack tank into cruiser's hydro-manifold
  const umbilicalPts = catmullRomSpline3(
    [
      [0.06, 0.12, 0.85],
      [0.14, 0.06, 0.94],
      [0.12, 0.04, 1.02]
    ],
    4
  );
  rawSlots.push({
    mesh: ensureUnitRawNormals(tubeSweepMesh(umbilicalPts.map((p): V4 => [p[0], p[1], p[2], 0.018]), 8)),
    materialIndex: TURF_MAT.HOSE_RUBBER
  });

  // Guarantee exact `-0.45` ground plane clearance across all slots and bake crisp `0.24` cavity AO
  const slots: MultiMatSlot[] = rawSlots.map((s) => {
    const grounded = clampMeshMinY(s.mesh, -0.45);
    return LED_MAT_INDICES.has(s.materialIndex)
      ? { mesh: grounded, materialIndex: s.materialIndex }
      : {
          mesh: bakeMeshCavityAO(paintMeshColors(grounded, "#ffffff"), 0.24),
          materialIndex: s.materialIndex
        };
  });

  const glassSpec = memoizeGeometry("splat-turf:hero-rover-glass:v3", () => mergeRawMeshes(glassParts));
  return {
    bodyNode: assembleMultiMaterialNode("ink-rover-body", slots, TURF_ARENA_MATERIALS, {
      id: "ink-rover-body",
      castShadow: true,
      receiveShadow: true
    }),
    glassNode: geometry
      .custom(glassSpec, {
        name: "ink-rover-glass",
        material: TURF_SIGHT_GLASS_MATERIAL,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "ink-rover-glass" })
  };
}

/**
 * Sculpted anisotropic brass gimbal paint-roller fork & wide quad-jet hydro-spray manifold
 * straddling the `0.45 m` wet-ink roller ball (`src/meshes.ts` remains untouched).
 */
export function turfRollerYokeMesh(): MeshData {
  const leftArmPts = catmullRomSpline3([[-0.51, 0, 0], [-0.57, 0.06, 0.25], [-0.38, 0.13, 0.45], [0, 0.15, 0.52]], 5);
  const rightArmPts = catmullRomSpline3([[0.51, 0, 0], [0.57, 0.06, 0.25], [0.38, 0.13, 0.45], [0, 0.15, 0.52]], 5);
  const toSpine = (pts: readonly V3[], r: number): V4[] => pts.map((p) => [p[0], p[1], p[2], r]);
  const collar = transformMesh(
    latheMesh([[0, -0.06], [0.082, -0.06], [0.096, 0], [0.074, 0.078], [0, 0.078]], 14),
    { pos: [0, 0.15, 0.52], rot: [0.58, 0, 0] }
  );
  // Wide transverse brass hydro-spray manifold bar + 4 lathed conical fan-jet spray nozzles aimed onto roller
  const sprayBar = tubeSweepMesh([[-0.44, 0.34, 0.24, 0.03], [0.44, 0.34, 0.24, 0.03]], 10);
  const riserL = tubeSweepMesh([[-0.38, 0.14, 0.42, 0.022], [-0.36, 0.34, 0.24, 0.022]], 8);
  const riserR = tubeSweepMesh([[0.38, 0.14, 0.42, 0.022], [0.36, 0.34, 0.24, 0.022]], 8);
  const nozzleCone = latheMesh(
    [[0, 0], [0.042, 0], [0.035, 0.048], [0.02, 0.09], [0.03, 0.11], [0, 0.112]],
    10
  );
  const nozzles = [-0.33, -0.11, 0.11, 0.33].map((nx) =>
    transformMesh(nozzleCone, { pos: [nx, 0.33, 0.23], rot: [-2.35, 0, 0] })
  );
  return rawPartsToMeshData([
    tubeSweepMesh(toSpine(leftArmPts, 0.036), 10),
    tubeSweepMesh(toSpine(rightArmPts, 0.036), 10),
    collar,
    sprayBar,
    riserL,
    riserR,
    ...nozzles
  ]);
}

/** Sculpted bearing housings + knurled outrigger end-caps clamping both ends of the roller ball. */
export function turfRollerCapsMesh(): MeshData {
  const hubProfile: V2[] = [
    [0, -0.065],
    [0.135, -0.056],
    [0.148, -0.012],
    [0.118, 0.042],
    [0.068, 0.064],
    [0, 0.066]
  ];
  const leftHub = transformMesh(latheMesh(hubProfile, 18), { pos: [-0.485, 0, 0], rot: [0, 0, Math.PI * 0.5] });
  const rightHub = transformMesh(latheMesh(hubProfile, 18), { pos: [0.485, 0, 0], rot: [0, 0, -Math.PI * 0.5] });
  return rawPartsToMeshData([leftHub, rightHub]);
}

/** Chamfered street-arena curb bumper wall (`0.34 x 0.38 x 1.02 m`) with drainage groove & joint bolster. */
export function turfArenaCurbWallMesh(): MeshData {
  const profile: V2[] = [
    [-0.17, -0.18],
    [0.17, -0.18],
    [0.17, 0.08],
    [0.12, 0.19],
    [-0.11, 0.19],
    [-0.17, 0.09]
  ];
  const rail = extrudePolygonMesh(profile, 1.02, 0.014, true);
  const jointCap = transformMesh(bevelBoxMesh(0.36, 0.39, 0.12, 0.022), { pos: [0, 0.005, 0] });
  return rawPartsToMeshData([rail, jointCap]);
}

/** Rolled-chime pressurized aerosol canister body (`y = 0 .. 0.56`). */
export function turfAerosolCanBodyMesh(): MeshData {
  const profile: V2[] = [
    [0, 0.01], [0.27, 0.01], [0.298, 0.032], [0.282, 0.062],
    [0.284, 0.47], [0.302, 0.495], [0.274, 0.522], [0.21, 0.556], [0, 0.56]
  ];
  return rawPartsToMeshData([latheMesh(profile, 20)]);
}

/** Concave chrome/brass aerosol dome, valve cup & directional spray actuator nozzle (`y = 0.52 .. 0.69`). */
export function turfAerosolCanNozzleMesh(): MeshData {
  const dome = latheMesh([[0.215, 0.52], [0.19, 0.565], [0.12, 0.59], [0.126, 0.616], [0.07, 0.62], [0.07, 0.682], [0, 0.688]], 16);
  const spout = tubeSweepMesh([[0, 0.656, 0, 0.028], [0, 0.662, 0.102, 0.022]], 8);
  return rawPartsToMeshData([dome, spout]);
}

/**
 * AI Rival Street-Ink Skater Kid & Faired Rival Turf Cruiser (`minY = 0` exact road contact, team-tinted via `bots` batch):
 * - Streamlined Taubin-faired open-cockpit rival cruiser (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`)
 * - 4 smooth chunky turf tires (`r = 0.18` centered at `y = 0.18`, 24 even segs -> exact `minY = 0`!) + streamlined fenders
 * - Wide front rotary paint-roller bumper & faired twin splatter-blaster cowls (`+Z` facing approaching player)
 * - Rival Street-Ink Skater Kid in athletic crouched stance: `sculptStylizedHeadMesh`, SDF squid-mantle crown,
 *   6 sweeping curved squid-tentacle hair locks (`sculptCurvedHairLockMesh`), draped street hoodie & athletic shorts
 *   (`sculptDrapedGarmentMesh`), smooth anatomical limbs (`sculptAnatomicalLimbMesh`), and SDF chunky street sneakers!
 */
export function turfEraserBotBodyMesh(): MeshData {
  const parts: RawMesh[] = [];
  const sneakerMesh = getSculptedStreetSneakerMesh();
  const gloveMesh = getSculptedStreetGloveMesh();
  const mantleMesh = getSquidMantleCrownMesh();

  // 1. Streamlined Taubin-faired open-cockpit rival Turf Cruiser hull (`z = -0.62 .. +0.58`, `y = 0.11 .. 0.42`)
  const rivalHull = taubinSmoothMesh(
    deformMesh(
      sculptStreamlinedHullMesh(1.18, 0.86, 0.30, {
        noseSharpness: 0.52,
        tailTaper: 0.44,
        canopyBulge: 0.22,
        undersideFlat: 0.65,
        stations: 14,
        ringPoints: 20
      }),
      ([x, y, z]) => {
        const well =
          y > 0.02 && Math.abs(x) < 0.29 && z > -0.16 && z < 0.24
            ? (1 - Math.pow(Math.abs(x) / 0.29, 2)) * Math.sin(((z + 0.16) / 0.40) * Math.PI)
            : 0;
        return [x, y - well * 0.14, z];
      }
    ),
    4
  );
  parts.push(clampMeshMinY(ensureUnitRawNormals(transformMesh(rivalHull, { pos: [0, 0.24, -0.02] })), 0.04));

  // 2. 4 smooth chunky tires grounded strictly at `y = 0` (`y_center = 0.18`, `radius = 0.18`, 24 even segs -> exact `minY = 0`)
  const tireProfile: V2[] = [
    [0.07, -0.072],
    [0.155, -0.078],
    [0.18, -0.046],
    [0.18, 0.046],
    [0.155, 0.078],
    [0.07, 0.072],
    [0, 0.062],
    [0, -0.062]
  ];
  const rawTire = latheMesh(tireProfile, 24);
  const fenderShell = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.42, 0.185, 0.115, {
      noseSharpness: 0.42,
      tailTaper: 0.40,
      canopyBulge: 0.30,
      undersideFlat: 0.70,
      stations: 10,
      ringPoints: 16
    }),
    3
  );
  const wheelCoords: readonly [number, number][] = [
    [-0.47, 0.34],
    [0.47, 0.34],
    [-0.49, -0.34],
    [0.49, -0.34]
  ];
  for (const [wx, wz] of wheelCoords) {
    parts.push(ensureUnitRawNormals(transformMesh(rawTire, { pos: [wx, 0.18, wz], rot: [0, 0, Math.PI * 0.5] })));
    parts.push(
      clampMeshMinY(
        ensureUnitRawNormals(
          transformMesh(fenderShell, { pos: [wx * 0.96, 0.37, wz], rot: [wz > 0 ? 0.08 : -0.08, 0, 0] })
        ),
        0.05
      )
    );
  }

  // 3. Wide front paint-roller bumper (`z = +0.58`) + twin faired Splatter Blaster cowls + smooth rear aero diffuser (`z = -0.58`)
  const blasterPod = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.26, 0.115, 0.105, {
      noseSharpness: 0.44,
      tailTaper: 0.46,
      canopyBulge: 0.24,
      undersideFlat: 0.48,
      stations: 9,
      ringPoints: 14
    }),
    3
  );
  const rearDiffuser = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.18, 0.62, 0.10, {
      noseSharpness: 0.40,
      tailTaper: 0.46,
      canopyBulge: 0.16,
      undersideFlat: 0.65,
      stations: 9,
      ringPoints: 14
    }),
    3
  );
  parts.push(
    clampMeshMinY(
      ensureUnitRawNormals(
        transformMesh(latheMesh([[0, -0.48], [0.108, -0.48], [0.116, 0], [0.108, 0.48], [0, 0.48]], 18), {
          pos: [0, 0.15, 0.58],
          rot: [0, 0, Math.PI * 0.5]
        })
      ),
      0.02
    ),
    clampMeshMinY(ensureUnitRawNormals(transformMesh(rearDiffuser, { pos: [0, 0.18, -0.58], rot: [0.16, 0, 0] })), 0.04)
  );
  for (const side of [-1, 1] as const) {
    parts.push(
      clampMeshMinY(
        ensureUnitRawNormals(transformMesh(blasterPod, { pos: [side * 0.27, 0.32, 0.38], rot: [0.18, 0, 0] })),
        0.08
      )
    );
  }

  // 4. Rival Street-Ink Skater Kid in Open Cruiser (`z = +0.02`, facing `+Z` toward approaching player):
  // Draped athletic shorts & oversized street hoodie (`sculptDrapedGarmentMesh`)
  const rivalShorts = sculptDrapedGarmentMesh(
    [
      { y: 0.24, rx: 0.125, rz: 0.102, z: 0.04, folds: 5, foldAmp: 0.05, superellipseN: 2.15 },
      { y: 0.31, rx: 0.128, rz: 0.105, z: 0.02, folds: 4, foldAmp: 0.035, superellipseN: 2.1 }
    ],
    { ringPoints: 20, capEnds: true, smoothPasses: 3 }
  );
  const rivalHoodie = sculptDrapedGarmentMesh(
    [
      { y: 0.29, rx: 0.145, rz: 0.114, z: 0.01, folds: 6, foldAmp: 0.058, superellipseN: 2.2 },
      { y: 0.41, rx: 0.158, rz: 0.118, z: 0.02, folds: 5, foldAmp: 0.045, superellipseN: 2.15 },
      { y: 0.52, rx: 0.122, rz: 0.094, z: 0.03, folds: 4, foldAmp: 0.03, superellipseN: 2.08 },
      { y: 0.56, rx: 0.132, rz: 0.118, z: 0.005, folds: 5, foldAmp: 0.05, superellipseN: 2.05 }
    ],
    { ringPoints: 22, capEnds: true, smoothPasses: 3 }
  );
  parts.push(ensureUnitRawNormals(rivalShorts), ensureUnitRawNormals(rivalHoodie));

  // Smooth anatomical legs, chunky SDF street sneakers, anatomical arms & SDF street gloves
  for (const side of [-1, 1] as const) {
    const rivalLeg = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [side * 0.088, 0.27, 0.05], rx: 0.052, rz: 0.054 },
          { pos: [side * 0.118, 0.30, 0.18], rx: 0.046, rz: 0.048, zOffset: 0.005 },
          { pos: [side * 0.115, 0.22, 0.26], rx: 0.038, rz: 0.040 }
        ],
        { ringPoints: 12, capEnds: true, muscleBiasZ: 0.14, peakT: 0.36 }
      ),
      2
    );
    const rivalArm = taubinSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [side * 0.152, 0.485, 0.03], rx: 0.045, rz: 0.045 },
          { pos: [side * 0.198, 0.425, 0.13], rx: 0.039, rz: 0.040 },
          { pos: [side * 0.142, 0.432, 0.23], rx: 0.033, rz: 0.034 }
        ],
        { ringPoints: 12, capEnds: true, muscleBiasZ: 0.12, peakT: 0.35 }
      ),
      2
    );
    parts.push(
      clampMeshMinY(ensureUnitRawNormals(rivalLeg), 0.08),
      clampMeshMinY(
        transformMesh(sneakerMesh, {
          pos: [side * 0.115, 0.175, 0.275],
          rot: [0.16, side * 0.08, 0],
          scale: [side < 0 ? -1 : 0.92, 0.92, 0.92]
        }),
        0.08
      ),
      ensureUnitRawNormals(rivalArm),
      transformMesh(gloveMesh, {
        pos: [side * 0.142, 0.432, 0.245],
        rot: [0.18, -side * 0.2, 0],
        scale: [side < 0 ? -0.92 : 0.92, 0.92, 0.92]
      })
    );
  }

  // Stylized Rival Head (`sculptStylizedHeadMesh`, `subdivisions: 2`) + SDF Squid-Mantle + 6 Curved Squid-Tentacle Hair Locks (`sculptCurvedHairLockMesh`)
  const rivalHeadPos: V3 = [0, 0.675, 0.045];
  parts.push(
    ensureUnitRawNormals(
      transformMesh(
        taubinSmoothMesh(
          sculptStylizedHeadMesh(0.136, {
            jawTaper: 0.26,
            cheekFullness: 0.34,
            noseBridge: 0.22,
            browRidge: 0.16,
            subdivisions: 2,
            seed: 23
          }),
          2
        ),
        { pos: rivalHeadPos, rot: [-0.06, 0, 0] }
      )
    ),
    transformMesh(mantleMesh, { pos: [0, rivalHeadPos[1] + 0.05, rivalHeadPos[2] - 0.008] })
  );

  const rivalLocks: readonly { readonly root: V3; readonly mid: V3; readonly tip: V3; readonly width: number }[] = [
    { root: [-0.086, 0.745, -0.01], mid: [-0.172, 0.665, -0.17], tip: [-0.218, 0.545, -0.32], width: 0.088 },
    { root: [0.086, 0.745, -0.01], mid: [0.172, 0.665, -0.17], tip: [0.218, 0.545, -0.32], width: 0.088 },
    { root: [-0.108, 0.72, 0.095], mid: [-0.142, 0.645, 0.085], tip: [-0.132, 0.575, 0.055], width: 0.054 },
    { root: [0.108, 0.72, 0.095], mid: [0.142, 0.645, 0.085], tip: [0.132, 0.575, 0.055], width: 0.054 },
    { root: [0, 0.778, 0.0], mid: [0.01, 0.745, -0.17], tip: [0.02, 0.685, -0.30], width: 0.074 },
    { root: [0, 0.715, -0.055], mid: [-0.015, 0.645, -0.19], tip: [-0.02, 0.585, -0.29], width: 0.064 }
  ];
  for (const lk of rivalLocks) {
    parts.push(
      ensureUnitRawNormals(
        sculptCurvedHairLockMesh({
          root: lk.root,
          mid: lk.mid,
          tip: lk.tip,
          width: lk.width,
          thickness: lk.width * 0.66,
          segments: 11,
          radialSegments: 12
        })
      )
    );
  }

  // Sleek pressurized backpack ink tank behind rival kid (`z = -0.15`, `y = 0.36..0.64`)
  const rivalPack = latheMesh(
    [
      [0, 0],
      [0.088, 0],
      [0.098, 0.04],
      [0.098, 0.24],
      [0.068, 0.29],
      [0, 0.30]
    ],
    16
  );
  parts.push(ensureUnitRawNormals(transformMesh(rivalPack, { pos: [0, 0.34, -0.16], rot: [0.18, 0, 0] })));

  return rawPartsToMeshData(parts);
}

/**
 * Anodized brass/gold alloy wheel rims, street DJ headphones, sporty wraparound visor frame,
 * backpack tank caps/straps, steering yoke, and twin splatter-blaster barrels for Rival Street-Ink Kids (`minY >= 0.06`).
 */
export function turfEraserBotTrimMesh(): MeshData {
  const parts: RawMesh[] = [];
  const visor = getSportyStreetVisorMeshes();

  // 4 machined dish alloy wheel rims centered at `[wx, 0.18, wz]` (`r = 0.105` -> `minY = 0.075 > 0`)
  const rimHub = latheMesh(
    [
      [0, -0.082],
      [0.048, -0.082],
      [0.105, -0.076],
      [0.105, 0.076],
      [0.048, 0.082],
      [0, 0.082]
    ],
    16
  );
  for (const [wx, wz] of [
    [-0.47, 0.34],
    [0.47, 0.34],
    [-0.49, -0.34],
    [0.49, -0.34]
  ] as const) {
    parts.push(ensureUnitRawNormals(transformMesh(rimHub, { pos: [wx, 0.18, wz], rot: [0, 0, Math.PI * 0.5] })));
  }

  // Street headphones (arched headband + cushioned earcups) + sporty visor brow frame on Rival Street-Ink Kid
  const headCenter: V3 = [0, 0.675, 0.045];
  const bandPts = catmullRomSpline3(
    [
      [-0.154, headCenter[1] + 0.005, headCenter[2] - 0.008],
      [-0.140, headCenter[1] + 0.115, headCenter[2] - 0.012],
      [0, headCenter[1] + 0.164, headCenter[2] - 0.014],
      [0.140, headCenter[1] + 0.115, headCenter[2] - 0.012],
      [0.154, headCenter[1] + 0.005, headCenter[2] - 0.008]
    ],
    5
  );
  parts.push(
    ensureUnitRawNormals(taubinSmoothMesh(tubeSweepMesh(bandPts.map((p): V4 => [p[0], p[1], p[2], 0.018]), 10), 2)),
    transformMesh(visor.browTrim, { pos: [0, headCenter[1] + 0.024, headCenter[2] + 0.002], rot: [0.08, 0, 0] })
  );

  const earCup = taubinSmoothMesh(
    latheMesh([[0, 0], [0.054, 0], [0.06, 0.018], [0.055, 0.038], [0, 0.044]], 18),
    2
  );
  const nozzle = latheMesh([[0, 0], [0.044, 0], [0.034, 0.095], [0.048, 0.12], [0, 0.122]], 14);
  for (const side of [-1, 1] as const) {
    parts.push(
      ensureUnitRawNormals(
        transformMesh(earCup, {
          pos: [side * 0.136, headCenter[1] - 0.006, headCenter[2] - 0.008],
          rot: [0, 0, -side * Math.PI * 0.5]
        })
      ),
      ensureUnitRawNormals(transformMesh(nozzle, { pos: [side * 0.27, 0.32, 0.48], rot: [1.22, 0, 0] }))
    );
  }

  // Butterfly steering handlebar yoke + backpack ink-tank regulator collars
  parts.push(
    ensureUnitRawNormals(
      taubinSmoothMesh(tubeSweepMesh([[-0.15, 0.43, 0.24, 0.018], [0, 0.45, 0.26, 0.02], [0.15, 0.43, 0.24, 0.018]], 10), 2)
    ),
    ensureUnitRawNormals(
      transformMesh(
        latheMesh([[0.092, 0.05], [0.108, 0.06], [0.108, 0.09], [0.092, 0.10]], 16),
        { pos: [0, 0.34, -0.16], rot: [0.18, 0, 0] }
      )
    ),
    ensureUnitRawNormals(
      transformMesh(
        latheMesh([[0.092, 0.20], [0.108, 0.21], [0.108, 0.24], [0.092, 0.25]], 16),
        { pos: [0, 0.34, -0.16], rot: [0.18, 0, 0] }
      )
    )
  );

  return rawPartsToMeshData(parts);
}

/** Radially symmetric under-chassis hydro-brush turbine ring & 8 Taubin-faired curved impeller squeegee blades (`y = 0.02 .. 0.11`). */
export function turfEraserBotScrubberMesh(): MeshData {
  const pad = latheMesh([[0.18, 0.02], [0.42, 0.02], [0.45, 0.062], [0.40, 0.105], [0.18, 0.105]], 22);
  const blade = taubinSmoothMesh(bevelBoxMesh(0.30, 0.058, 0.082, 0.02), 3);
  const parts: RawMesh[] = [ensureUnitRawNormals(pad)];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(
      ensureUnitRawNormals(
        transformMesh(blade, {
          pos: [Math.cos(a) * 0.30, 0.058, Math.sin(a) * 0.30],
          rot: [0, -a + 0.34, 0]
        })
      )
    );
  }
  return rawPartsToMeshData(parts);
}

/**
 * Glowing sporty wraparound visor shield, glossy squid-tentacle ink-dipped tips,
 * neon backpack ink-tank core & twin rear turbo thruster cores on each rival Street-Ink Kid.
 */
export function turfEraserBotBeaconMesh(): MeshData {
  const visor = getSportyStreetVisorMeshes();
  const headCenter: V3 = [0, 0.675, 0.045];
  const parts: RawMesh[] = [
    // Sporty wraparound glowing visor shield
    transformMesh(visor.shield, { pos: [0, headCenter[1] + 0.024, headCenter[2] + 0.002], rot: [0.08, 0, 0] }),
    // Glowing neon ink meniscus band on the rival's backpack ink tank
    ensureUnitRawNormals(
      transformMesh(
        latheMesh([[0.094, 0.11], [0.106, 0.12], [0.106, 0.19], [0.094, 0.20]], 16),
        { pos: [0, 0.34, -0.16], rot: [0.18, 0, 0] }
      )
    )
  ];

  // Glossy glowing ink-dipped squid-tentacle tips (`sculptCurvedHairLockMesh`)
  const glowingTips: readonly { readonly root: V3; readonly mid: V3; readonly tip: V3; readonly width: number }[] = [
    { root: [-0.158, 0.678, -0.145], mid: [-0.198, 0.605, -0.245], tip: [-0.224, 0.535, -0.33], width: 0.074 },
    { root: [0.158, 0.678, -0.145], mid: [0.198, 0.605, -0.245], tip: [0.224, 0.535, -0.33], width: 0.074 },
    { root: [0.008, 0.752, -0.14], mid: [0.016, 0.715, -0.23], tip: [0.022, 0.678, -0.31], width: 0.062 }
  ];
  for (const gt of glowingTips) {
    parts.push(
      ensureUnitRawNormals(
        sculptCurvedHairLockMesh({
          root: gt.root,
          mid: gt.mid,
          tip: gt.tip,
          width: gt.width,
          thickness: gt.width * 0.64,
          segments: 8,
          radialSegments: 10
        })
      )
    );
  }

  const exhaustCore = latheMesh([[0, 0], [0.042, 0.02], [0.046, 0.08], [0, 0.085]], 12);
  for (const side of [-1, 1] as const) {
    parts.push(
      ensureUnitRawNormals(transformMesh(exhaustCore, { pos: [side * 0.18, 0.18, -0.60], rot: [-Math.PI * 0.5, 0, 0] }))
    );
  }
  return rawPartsToMeshData(parts);
}

/** Open street-art paint bucket with rolled chime, overflowing wet drips, arched wire bail & resting roller brush. */
export function turfRoadsidePropMesh(): MeshData {
  const pail = latheMesh([
    [0, 0], [0.46, 0], [0.54, 0.86], [0.6, 0.9], [0.6, 0.96], [0.51, 0.97], [0.48, 0.88], [0, 0.9]
  ], 18);
  const bailPts = catmullRomSpline3([[-0.55, 0.91, 0], [-0.42, 1.25, 0.12], [0, 1.38, 0.16], [0.42, 1.25, 0.12], [0.55, 0.91, 0]], 4);
  const dripA = tubeSweepMesh([[0.54, 0.92, 0.12, 0.065], [0.55, 0.62, 0.14, 0.048], [0.53, 0.42, 0.13, 0.068]], 7);
  const dripB = tubeSweepMesh([[-0.48, 0.92, -0.24, 0.055], [-0.5, 0.68, -0.26, 0.042], [-0.49, 0.52, -0.25, 0.058]], 7);
  const restingRoller = transformMesh(
    latheMesh([[0, -0.24], [0.11, -0.24], [0.11, 0.24], [0, 0.24]], 12),
    { pos: [0.12, 0.96, -0.08], rot: [0.18, 0.4, Math.PI * 0.44] }
  );
  return rawPartsToMeshData([
    pail,
    tubeSweepMesh(bailPts.map((p): V4 => [p[0], p[1], p[2], 0.025]), 7),
    dripA,
    dripB,
    restingRoller
  ]);
}

/** Curved skate-park gooseneck lamp post (`base y = 0`, reflector hood over road edge). */
export function turfGooseneckPostMesh(): MeshData {
  const plinth = latheMesh([[0, 0], [0.16, 0], [0.14, 0.16], [0.075, 0.26], [0.06, 0.3]], 10);
  const neckPts = catmullRomSpline3([[0, 0.26, 0], [0, 1.65, 0], [0, 2.52, 0.04], [0, 2.86, 0.24], [0, 2.74, 0.44]], 4);
  const neck = tubeSweepMesh(neckPts.map((p, idx): V4 => [p[0], p[1], p[2], 0.056 - idx * 0.0012]), 8);
  const shade = transformMesh(latheMesh([[0, 0.12], [0.06, 0.11], [0.19, 0.02], [0.22, -0.02], [0.17, -0.02]], 12), { pos: [0, 2.72, 0.45] });
  return rawPartsToMeshData([plinth, neck, shade]);
}

/** Teardrop stadium globe bulb suspended under the gooseneck reflector hood. */
export function turfLampBulbMesh(): MeshData {
  return rawPartsToMeshData([
    transformMesh(
      latheMesh([[0, -0.18], [0.11, -0.14], [0.165, -0.03], [0.12, 0.09], [0, 0.14]], 12),
      { pos: [0, 2.58, 0.45] }
    )
  ]);
}

// ---------------------------------------------------------------------------
// 2. Street-Sport Ink Arena Multi-Material Architectural Assemblies
// ---------------------------------------------------------------------------

export interface InkTankAssembly {
  readonly opaqueSlots: MultiMatSlot[];
  readonly glassMeshes: RawMesh[];
}

/**
 * Pressurized chromed ink-reservoir tank:
 * `latheMesh` Bezier pressure domes + inner vivid ink column + translucent `material.physical`
 * sight-glass tube (`glassMeshes`) + anisotropic brass pressure gauge + `tubeSweepMesh` hoses.
 */
export function buildInkReservoirTankParts(accentMat: number, ledMat: number): InkTankAssembly {
  const opaqueSlots: MultiMatSlot[] = [];
  const glassMeshes: RawMesh[] = [];

  opaqueSlots.push(
    { mesh: transformMesh(bevelBoxMesh(2.5, 0.34, 2.5, 0.05), { pos: [0, 0.17, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
    { mesh: transformMesh(bevelBoxMesh(2.1, 0.22, 2.1, 0.04), { pos: [0, 0.43, 0] }), materialIndex: TURF_MAT.ANISO_STEEL }
  );

  const botDomePts = bezierCurve2([0, 0.52], [0.68, 0.52], [0.98, 0.72], [0.98, 1.18], 8);
  const botCollar: V2[] = [...botDomePts, [1.08, 1.2], [1.08, 1.34], [0.92, 1.36]];
  opaqueSlots.push({ mesh: latheMesh(botCollar, 20), materialIndex: TURF_MAT.CHROME });

  const topDomePts = bezierCurve2([0.98, 3.42], [0.98, 3.92], [0.64, 4.18], [0.22, 4.24], 8);
  const topCollar: V2[] = [[0.92, 3.26], [1.08, 3.28], [1.08, 3.4], ...topDomePts, [0.22, 4.44], [0.3, 4.46], [0.3, 4.54], [0, 4.56]];
  opaqueSlots.push({ mesh: latheMesh(topCollar, 20), materialIndex: TURF_MAT.CHROME });

  const bandRing = latheMesh([[0.94, -0.11], [1.05, -0.09], [1.05, 0.09], [0.94, 0.11]], 20);
  opaqueSlots.push(
    { mesh: transformMesh(bandRing, { pos: [0, 1.46, 0] }), materialIndex: accentMat },
    { mesh: transformMesh(bandRing, { pos: [0, 3.16, 0] }), materialIndex: accentMat }
  );

  const inkCore = latheMesh([[0, 1.34], [0.76, 1.34], [0.76, 2.86], [0.71, 2.93], [0, 2.9]], 18);
  const meniscusGlow = latheMesh([[0.58, 2.84], [0.77, 2.86], [0.77, 2.96], [0.58, 2.95]], 18);
  opaqueSlots.push(
    { mesh: inkCore, materialIndex: accentMat },
    { mesh: meniscusGlow, materialIndex: ledMat }
  );

  glassMeshes.push(latheMesh([[0.88, 1.35], [0.93, 1.37], [0.93, 3.25], [0.88, 3.27]], 20));

  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) * 0.5 + Math.PI * 0.25;
    const tx = Math.cos(a) * 1.01;
    const tz = Math.sin(a) * 1.01;
    opaqueSlots.push({
      mesh: tubeSweepMesh([[tx, 1.18, tz, 0.042], [tx, 3.44, tz, 0.042]], 7),
      materialIndex: TURF_MAT.ANISO_STEEL
    });
  }

  const gaugeStem = tubeSweepMesh([[0.88, 2.35, 0, 0.055], [1.18, 2.35, 0, 0.055]], 8);
  const gaugeBezel = transformMesh(
    latheMesh([[0, -0.08], [0.27, -0.08], [0.29, 0.04], [0.24, 0.07], [0.22, 0.02], [0, 0.02]], 16),
    { pos: [1.22, 2.35, 0], rot: [0, 0, -Math.PI * 0.5] }
  );
  const gaugeDial = transformMesh(
    latheMesh([[0, 0], [0.21, 0], [0.21, 0.025], [0, 0.025]], 14),
    { pos: [1.23, 2.35, 0], rot: [0, 0, -Math.PI * 0.5] }
  );
  const gaugeNeedle = transformMesh(bevelBoxMesh(0.025, 0.16, 0.03, 0.005), { pos: [1.26, 2.39, 0.03], rot: [0.55, 0, 0] });
  glassMeshes.push(
    transformMesh(latheMesh([[0, 0], [0.23, 0], [0.21, 0.035], [0, 0.04]], 14), { pos: [1.26, 2.35, 0], rot: [0, 0, -Math.PI * 0.5] })
  );
  const valveWheelPts = catmullRomSpline3([
    [1.14, 1.62, -0.18], [1.14, 1.8, 0], [1.14, 1.62, 0.18], [1.14, 1.44, 0]
  ], 4, true);
  opaqueSlots.push(
    { mesh: gaugeStem, materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: gaugeBezel, materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: gaugeDial, materialIndex: TURF_MAT.CERAMIC_WHITE },
    { mesh: gaugeNeedle, materialIndex: TURF_MAT.CLEARCOAT_MAGENTA },
    { mesh: tubeSweepMesh(valveWheelPts.map((p): V4 => [p[0], p[1], p[2], 0.028]), 7), materialIndex: TURF_MAT.ANISO_BRASS }
  );

  const hoseAPts = catmullRomSpline3([[0.82, 0.98, 0.42], [1.34, 0.82, 0.62], [1.56, 0.24, 0.88], [1.92, 0.14, 1.02]], 6);
  const hoseBPts = catmullRomSpline3([[0.82, 0.98, -0.42], [1.28, 0.72, -0.68], [1.48, 0.2, -0.92], [1.86, 0.14, -1.08]], 6);
  opaqueSlots.push(
    { mesh: tubeSweepMesh(hoseAPts.map((p): V4 => [p[0], p[1], p[2], 0.078]), 9), materialIndex: TURF_MAT.HOSE_RUBBER },
    { mesh: tubeSweepMesh(hoseBPts.map((p): V4 => [p[0], p[1], p[2], 0.072]), 9), materialIndex: TURF_MAT.HOSE_RUBBER },
    { mesh: transformMesh(latheMesh([[0, -0.09], [0.11, -0.09], [0.11, 0.09], [0, 0.09]], 10), { pos: [0.92, 0.96, 0.45], rot: [0, 0, -1.3] }), materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: transformMesh(latheMesh([[0, -0.09], [0.11, -0.09], [0.11, 0.09], [0, 0.09]], 10), { pos: [0.92, 0.96, -0.45], rot: [0, 0, -1.3] }), materialIndex: TURF_MAT.ANISO_BRASS }
  );

  return { opaqueSlots, glassMeshes };
}

/**
 * Urban skatepark / turf spectator bleachers (oriented facing `+X` toward the track)
 * topped with a doubly-curved hyperbolic sheen-fabric sun-sail canopy (`loftSectionsMesh`).
 */
export function buildArenaBleacherWithSunSailSlots(warmSail: boolean): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const spanZ = 6.4;
  const stringerPoly: V2[] = [[-1.7, 0], [1.65, 0], [1.65, 0.42], [-1.25, 2.28], [-1.7, 2.28]];
  for (const sz of [-spanZ * 0.44, 0, spanZ * 0.44]) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(stringerPoly, 0.14, 0.02, true), { pos: [0, 0, sz] }),
      materialIndex: TURF_MAT.ANISO_STEEL
    });
  }

  for (let tier = 0; tier < 4; tier += 1) {
    const tx = 1.28 - tier * 0.78;
    const ty = 0.44 + tier * 0.52;
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.56, 0.09, spanZ, 0.02), { pos: [tx, ty, 0] }), materialIndex: TURF_MAT.BLEACHER_WOOD },
      { mesh: transformMesh(bevelBoxMesh(0.36, 0.05, spanZ - 0.16, 0.012), { pos: [tx + 0.34, ty - 0.22, 0] }), materialIndex: TURF_MAT.ANISO_STEEL }
    );
  }

  const railPts = catmullRomSpline3([
    [1.45, 0.95, -spanZ * 0.5], [-1.55, 2.75, -spanZ * 0.5],
    [-1.55, 2.75, spanZ * 0.5], [1.45, 0.95, spanZ * 0.5]
  ], 4);
  slots.push({
    mesh: tubeSweepMesh(railPts.map((p): V4 => [p[0], p[1], p[2], 0.042]), 7),
    materialIndex: warmSail ? TURF_MAT.CLEARCOAT_MAGENTA : TURF_MAT.CLEARCOAT_CYAN
  });

  const mastCoords: readonly [number, number, number][] = [
    [-1.82, 4.45, -spanZ * 0.52], [-1.82, 3.85, spanZ * 0.52],
    [1.58, 3.55, -spanZ * 0.48], [1.58, 4.25, spanZ * 0.48]
  ];
  for (const [mx, my, mz] of mastCoords) {
    slots.push({
      mesh: tubeSweepMesh([[mx * 0.88, 0, mz * 0.94, 0.068], [mx, my + 0.18, mz, 0.052]], 8),
      materialIndex: TURF_MAT.ANISO_STEEL
    });
  }

  const sailSections: V3[][] = [];
  const secCount = 7;
  for (let s = 0; s < secCount; s += 1) {
    const v = s / (secCount - 1);
    const z = (-0.5 + v) * (spanZ * 1.04);
    const backY = 4.42 * (1 - v) + 3.82 * v;
    const frontY = 3.52 * (1 - v) + 4.22 * v;
    const sagZ = Math.sin(v * Math.PI) * 0.28;
    const ptsTop: V3[] = [];
    const ptsBot: V3[] = [];
    const cols = 6;
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      const x = -1.78 + u * 3.32;
      const sagX = Math.sin(u * Math.PI) * 0.22;
      const y = backY * (1 - u) + frontY * u - sagZ - sagX;
      ptsTop.push([x, y + 0.035, z]);
      ptsBot.push([x, y - 0.035, z]);
    }
    sailSections.push([...ptsTop, ...ptsBot.reverse()]);
  }
  slots.push({
    mesh: loftSectionsMesh(sailSections, true, false),
    materialIndex: warmSail ? TURF_MAT.SAIL_FABRIC_WARM : TURF_MAT.SAIL_FABRIC_COOL
  });

  // Cheering Street-Ink Kid spectators standing on the bleacher tiers facing `+X` toward the arena
  const fanA = buildStreetInkKidCharacterParts({
    pose: "cheerLeft",
    hoodieMat: warmSail ? TURF_MAT.SAIL_FABRIC_WARM : TURF_MAT.SAIL_FABRIC_COOL,
    shortsMat: TURF_MAT.SHORTS_DENIM,
    hairMat: TURF_MAT.HAIR_COBALT,
    tipMat: warmSail ? TURF_MAT.INK_TIP_LIME : TURF_MAT.INK_TIP_MAGENTA,
    sneakerMat: TURF_MAT.CLEARCOAT_CYAN,
    headphoneGlowMat: TURF_MAT.LED_MAGENTA,
    seed: warmSail ? 31 : 43
  });
  const fanB = buildStreetInkKidCharacterParts({
    pose: "cheerRight",
    hoodieMat: warmSail ? TURF_MAT.SAIL_FABRIC_COOL : TURF_MAT.SAIL_FABRIC_WARM,
    shortsMat: TURF_MAT.SHORTS_DENIM,
    hairMat: TURF_MAT.CLEARCOAT_PLUM,
    tipMat: warmSail ? TURF_MAT.INK_TIP_MAGENTA : TURF_MAT.CLEARCOAT_GOLD,
    sneakerMat: TURF_MAT.CLEARCOAT_LIME,
    headphoneGlowMat: TURF_MAT.LED_CYAN,
    seed: warmSail ? 37 : 47
  });
  slots.push(
    ...transformSlots(fanA.opaqueSlots, { pos: [0.50, 1.54, -1.35], rot: [0, Math.PI * 0.5 + 0.15, 0], scale: 1.16 }),
    ...transformSlots(fanB.opaqueSlots, { pos: [-0.28, 2.06, 1.42], rot: [0, Math.PI * 0.5 - 0.14, 0], scale: 1.16 })
  );

  return slots;
}

/**
 * Open 4-chord structural steel truss tower (`latticeTrussMesh`) carrying a J-hang
 * line-array speaker cluster and canted stadium floodlight bank (`practical: true`).
 */
export function buildTrussSpeakerFloodlightTowerSlots(accentMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  slots.push(
    { mesh: transformMesh(bevelBoxMesh(1.75, 0.48, 1.75, 0.06), { pos: [0, 0.24, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
    { mesh: transformMesh(bevelBoxMesh(1.42, 0.18, 1.42, 0.035), { pos: [0, 0.56, 0] }), materialIndex: accentMat }
  );

  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.86, 6.2, 0.86], bays: 7, chordRadius: 0.044, braceRadius: 0.024 }),
      { pos: [0, 3.72, 0] }
    ),
    materialIndex: TURF_MAT.ANISO_STEEL
  });

  const woofer = latheMesh([[0, 0.03], [0.055, 0.02], [0.135, -0.025], [0.155, 0], [0.135, 0.015]], 12);
  for (let b = 0; b < 3; b += 1) {
    const by = 4.55 - b * 0.44;
    const tilt = 0.12 + b * 0.11;
    const bx = 0.62 + b * 0.05;
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.48, 0.38, 0.92, 0.035), { pos: [bx, by, 0], rot: [0, 0, -tilt] }), materialIndex: TURF_MAT.HOSE_RUBBER },
      { mesh: transformMesh(bevelBoxMesh(0.08, 0.34, 0.88, 0.015), { pos: [bx - 0.22, by, 0], rot: [0, 0, -tilt] }), materialIndex: accentMat },
      { mesh: transformMesh(woofer, { pos: [bx + 0.24, by, -0.22], rot: [0, 0, -Math.PI * 0.5 - tilt] }), materialIndex: TURF_MAT.CHROME },
      { mesh: transformMesh(woofer, { pos: [bx + 0.24, by, 0.22], rot: [0, 0, -Math.PI * 0.5 - tilt] }), materialIndex: TURF_MAT.CHROME }
    );
  }

  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.42, 0.42, 2.6], bays: 4, chordRadius: 0.03, braceRadius: 0.018 }),
      { pos: [0.18, 6.95, 0] }
    ),
    materialIndex: TURF_MAT.ANISO_STEEL
  });
  for (const lz of [-0.96, -0.32, 0.32, 0.96]) {
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.32, 0.42, 0.48, 0.03), { pos: [0.36, 7.12, lz], rot: [0, 0, -0.42] }), materialIndex: TURF_MAT.ANISO_STEEL },
      { mesh: transformMesh(bevelBoxMesh(0.06, 0.34, 0.4, 0.01), { pos: [0.51, 7.05, lz], rot: [0, 0, -0.42] }), materialIndex: TURF_MAT.LED_FLOOD }
    );
  }

  return slots;
}

/**
 * Heroic tilted aerosol spray-can monument on a beveled skate-plaza plinth (`extrudePolygonMesh`)
 * with a frozen dynamic ink-spray arc (`catmullRomSpline3` + `tubeSweepMesh` + `icosphereFacetMesh`).
 */
export function buildAerosolMonumentSlots(bodyMat: number, sprayMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  const oct: V2[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    oct.push([Math.cos(a) * 1.45, Math.sin(a) * 1.45]);
  }
  slots.push(
    { mesh: transformMesh(extrudePolygonMesh(oct, 0.42, 0.06, true), { pos: [0, 0.21, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
    { mesh: transformMesh(bevelBoxMesh(1.9, 0.18, 1.9, 0.035), { pos: [0, 0.5, 0], rot: [0, Math.PI * 0.25, 0] }), materialIndex: TURF_MAT.CLEARCOAT_PLUM }
  );

  const canTilt: TransformOpts = { pos: [-0.15, 0.58, 0], rot: [0.1, 0, -0.26] };
  const bodyProfile: V2[] = [
    [0, 0], [0.76, 0], [0.82, 0.08], [0.78, 0.16],
    [0.78, 2.24], [0.83, 2.32], [0.75, 2.4], [0, 2.4]
  ];
  const domeProfile: V2[] = [
    [0.75, 2.4], [0.64, 2.66], [0.34, 2.78], [0.36, 2.88],
    [0.2, 2.9], [0.2, 3.16], [0, 3.18]
  ];
  slots.push(
    { mesh: transformMesh(latheMesh(bodyProfile, 20), canTilt), materialIndex: bodyMat },
    { mesh: transformMesh(latheMesh([[0.79, 0.85], [0.81, 0.87], [0.81, 1.58], [0.79, 1.6]], 20), canTilt), materialIndex: TURF_MAT.CERAMIC_WHITE },
    { mesh: transformMesh(latheMesh(domeProfile, 18), canTilt), materialIndex: TURF_MAT.ANISO_BRASS }
  );

  const jetPts = catmullRomSpline3([
    [0.64, 3.52, 0], [1.28, 3.74, 0.14], [1.95, 3.46, 0.28], [2.48, 2.86, 0.36]
  ], 5);
  const jetSpine: V4[] = jetPts.map((p, idx) => [p[0], p[1], p[2], 0.05 + (idx / jetPts.length) * 0.24]);
  slots.push(
    { mesh: tubeSweepMesh(jetSpine, 10), materialIndex: sprayMat },
    { mesh: transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.24, 0, 0.1, 13), 1, 0.5), { pos: [2.58, 2.62, 0.42] }), materialIndex: sprayMat },
    { mesh: transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.16, 0, 0.08, 29), 1, 0.5), { pos: [2.22, 3.18, 0.08] }), materialIndex: sprayMat }
  );

  return slots;
}

/**
 * Pillowed sheen-fabric inflatable turf arena barrier (`loftSectionsMesh` + `subdivideSmoothMesh`)
 * with rubber ground ballast skirt, stitched end-bolsters, and brass air-lock valves.
 */
export function buildTurfInflatableBarrierSlots(fabricMat: number, trimMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  slots.push({
    mesh: transformMesh(bevelBoxMesh(1.18, 0.15, 3.44, 0.045), { pos: [0, 0.075, 0] }),
    materialIndex: TURF_MAT.HOSE_RUBBER
  });

  const mkOvalRing = (rx: number, ry: number, cy: number, z: number): V3[] => {
    const ring: V3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ring.push([Math.cos(a) * rx, cy + Math.sin(a) * ry, z]);
    }
    return ring;
  };
  for (let row = 0; row < 3; row += 1) {
    const cy = 0.36 + row * 0.46;
    const rx = 0.44 - row * 0.045;
    const sections: V3[][] = [
      mkOvalRing(rx * 0.72, 0.2, cy, -1.56),
      mkOvalRing(rx, 0.25, cy, -0.85),
      mkOvalRing(rx * 0.88, 0.22, cy, 0),
      mkOvalRing(rx, 0.25, cy, 0.85),
      mkOvalRing(rx * 0.72, 0.2, cy, 1.56)
    ];
    slots.push({
      mesh: loftSectionsMesh(sections, true, true),
      materialIndex: row === 1 ? trimMat : fabricMat
    });
  }

  const bolster = subdivideSmoothMesh(bevelBoxMesh(0.98, 1.5, 0.48, 0.16), 1, 0.48);
  const valve = latheMesh([[0, 0], [0.08, 0], [0.08, 0.065], [0.048, 0.095], [0, 0.095]], 10);
  for (const sz of [-1.42, 1.42]) {
    slots.push(
      { mesh: transformMesh(bolster, { pos: [0, 0.82, sz] }), materialIndex: fabricMat },
      { mesh: transformMesh(valve, { pos: [0.49, 0.56, sz], rot: [0, 0, -Math.PI * 0.5] }), materialIndex: TURF_MAT.ANISO_BRASS }
    );
  }

  return slots;
}

/**
 * Colorful glazed street-planter drum (`latheMesh`) with curved ringed trunk (`tubeSweepMesh`),
 * multi-puff `layeredCanopyMesh` crown, and 6 arched palm fronds (`loftSectionsMesh`).
 */
export function buildPottedStreetPalmSlots(potMat: number, seed: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];

  const planterProfile: V2[] = [
    [0, 0], [0.62, 0], [0.76, 0.78], [0.84, 0.84], [0.84, 0.96],
    [0.72, 0.96], [0.68, 0.84], [0, 0.84]
  ];
  slots.push(
    { mesh: latheMesh(planterProfile, 16), materialIndex: potMat },
    { mesh: latheMesh([[0.69, 0.42], [0.74, 0.43], [0.75, 0.56], [0.7, 0.57]], 16), materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: latheMesh([[0, 0.82], [0.68, 0.84], [0.54, 0.9], [0, 0.92]], 14), materialIndex: TURF_MAT.TERRACOTTA_CLAY }
  );

  const leanX = ((seed % 3) - 1) * 0.26;
  const trunkPts = catmullRomSpline3([
    [0, 0.86, 0], [leanX * 0.45, 1.85, 0.12], [leanX, 2.92, 0.06], [leanX * 0.82, 3.88, -0.08]
  ], 5);
  const trunkSpine: V4[] = trunkPts.map((p, idx) => {
    const t = idx / Math.max(1, trunkPts.length - 1);
    const ringBump = idx % 2 === 0 ? 0.018 : -0.008;
    return [p[0], p[1], p[2], 0.2 * (1 - t * 0.36) + ringBump];
  });
  slots.push({ mesh: tubeSweepMesh(trunkSpine, 9), materialIndex: TURF_MAT.BLEACHER_WOOD });

  const crownTop: V3 = [leanX * 0.82, 3.85, -0.08];
  slots.push({
    mesh: transformMesh(layeredCanopyMesh({ radius: 1.25, height: 1.15, puffs: 11, seed }), { pos: [crownTop[0], crownTop[1] - 0.25, crownTop[2]] }),
    materialIndex: TURF_MAT.FOLIAGE_PBR
  });
  for (let f = 0; f < 6; f += 1) {
    const yaw = (f / 6) * Math.PI * 2 + seed * 0.37;
    const frondSecs: V3[][] = [
      [[-0.08, 0, 0.1], [0.08, 0, 0.1], [0, -0.05, 0.1]],
      [[-0.28, 0.32, 0.68], [0.28, 0.32, 0.68], [0, 0.22, 0.68]],
      [[-0.34, 0.18, 1.38], [0.34, 0.18, 1.38], [0, 0.08, 1.38]],
      [[-0.14, -0.34, 1.96], [0.14, -0.34, 1.96], [0, -0.4, 1.96]],
      [[-0.02, -0.72, 2.28], [0.02, -0.72, 2.28], [0, -0.75, 2.28]]
    ];
    slots.push({
      mesh: transformMesh(loftSectionsMesh(frondSecs, true, true), { pos: crownTop, rot: [0, yaw, 0] }),
      materialIndex: TURF_MAT.FOLIAGE_PBR
    });
  }

  return slots;
}

/**
 * Overhead multi-material Street-Sport Scoreboard Gantry (`id: "finish"`) spanning the track:
 * twin `latticeTrussMesh` portal towers, overhead truss bridge, chamfered LED territory scoreboard,
 * gold crown emblem, and rooftop chromed ink-reservoir canisters (`assembleMultiMaterialNode`).
 */
export function assembleTurfScoreboardGantryNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];

  for (const sx of [-1, 1] as const) {
    const px = sx * 3.46;
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(0.76, 0.42, 0.92, 0.05), { pos: [px, 0.21, 0] }), materialIndex: TURF_MAT.CONCRETE_PBR },
      { mesh: transformMesh(bevelBoxMesh(0.62, 0.18, 0.76, 0.03), { pos: [px, 0.5, 0] }), materialIndex: sx < 0 ? TURF_MAT.CLEARCOAT_MAGENTA : TURF_MAT.CLEARCOAT_CYAN },
      {
        mesh: transformMesh(
          latticeTrussMesh({ span: [0.46, 3.8, 0.52], bays: 6, chordRadius: 0.036, braceRadius: 0.02 }),
          { pos: [px, 2.48, 0] }
        ),
        materialIndex: TURF_MAT.ANISO_STEEL
      }
    );

    const canX = sx * 2.86;
    const tankMesh = latheMesh([[0, 4.38], [0.28, 4.38], [0.3, 4.46], [0.3, 5.12], [0.22, 5.28], [0, 5.32]], 14);
    const hosePts = catmullRomSpline3([[canX, 4.62, 0], [sx * 2.42, 4.48, 0.14], [sx * 2.05, 4.72, 0.08]], 4);
    slots.push(
      { mesh: transformMesh(tankMesh, { pos: [canX, 0, 0] }), materialIndex: TURF_MAT.CHROME },
      { mesh: transformMesh(latheMesh([[0.29, 4.66], [0.315, 4.68], [0.315, 4.96], [0.29, 4.98]], 14), { pos: [canX, 0, 0] }), materialIndex: sx < 0 ? TURF_MAT.CLEARCOAT_MAGENTA : TURF_MAT.CLEARCOAT_CYAN },
      { mesh: tubeSweepMesh(hosePts.map((p): V4 => [p[0], p[1], p[2], 0.036]), 7), materialIndex: TURF_MAT.HOSE_RUBBER }
    );
  }

  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [7.38, 0.52, 0.54], bays: 9, chordRadius: 0.036, braceRadius: 0.02 }),
      { pos: [0, 4.08, 0] }
    ),
    materialIndex: TURF_MAT.ANISO_STEEL
  });

  const wingPoly: V2[] = [[-2.18, 4.36], [2.18, 4.36], [2.46, 4.92], [2.06, 5.48], [-2.06, 5.48], [-2.46, 4.92]];
  const crownPoly: V2[] = [[-0.48, 5.46], [0.48, 5.46], [0.58, 5.88], [0.22, 5.68], [0, 5.98], [-0.22, 5.68], [-0.58, 5.88]];
  slots.push(
    { mesh: extrudePolygonMesh(wingPoly, 0.36, 0.05, true), materialIndex: TURF_MAT.CLEARCOAT_PLUM },
    { mesh: transformMesh(bevelBoxMesh(4.12, 0.86, 0.4, 0.035), { pos: [0, 4.92, 0] }), materialIndex: TURF_MAT.HOSE_RUBBER },
    { mesh: transformMesh(bevelBoxMesh(1.76, 0.34, 0.44, 0.02), { pos: [-1.02, 4.92, 0] }), materialIndex: TURF_MAT.LED_MAGENTA },
    { mesh: transformMesh(bevelBoxMesh(1.76, 0.34, 0.44, 0.02), { pos: [1.02, 4.92, 0] }), materialIndex: TURF_MAT.LED_CYAN },
    { mesh: transformMesh(bevelBoxMesh(0.18, 0.62, 0.45, 0.02), { pos: [0, 4.92, 0] }), materialIndex: TURF_MAT.ANISO_BRASS },
    { mesh: extrudePolygonMesh(crownPoly, 0.24, 0.03, true), materialIndex: TURF_MAT.CLEARCOAT_GOLD }
  );

  for (let i = 0; i < 10; i += 1) {
    const bx = -2.7 + i * 0.6;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.56, 0.24, 0.14, 0.02), { pos: [bx, 3.46, 0] }),
      materialIndex: i % 2 === 0 ? TURF_MAT.CLEARCOAT_GOLD : TURF_MAT.CERAMIC_WHITE
    });
  }

  return assembleMultiMaterialNode("finish", slots, TURF_ARENA_MATERIALS, {
    id: "finish",
    castShadow: true,
    receiveShadow: true
  });
}

// ---------------------------------------------------------------------------
// 3. Scrolling Street-Sport Ink Arena Sideline Belts + Stitched Balloons & Palettes
// ---------------------------------------------------------------------------

export const ARENA_BELT_SPAN = 96;

export interface TurfArenaBeltDescriptor {
  readonly opaqueId: string;
  readonly glassId: string;
  readonly tileIndex: number;
  readonly opaqueNode: ReturnType<typeof assembleMultiMaterialNode>;
  readonly glassNode: ReturnType<typeof geometry.custom>;
}

/** Builds 2 seamless 96 m multi-material Street-Sport Ink Arena sideline belts + `castShadow: false` sight-glasses. */
export function createTurfArenaSidelineBelts(): readonly TurfArenaBeltDescriptor[] {
  const opaqueModule: MultiMatSlot[] = [];
  const glassModule: RawMesh[] = [];

  const placeAssembly = (slots: readonly MultiMatSlot[], side: -1 | 1, xAbs: number, z: number, extraYaw = 0): void => {
    const rotY = (side === -1 ? 0 : Math.PI) + extraYaw;
    opaqueModule.push(...transformSlots(slots, { pos: [side * xAbs, -0.35, z], rot: [0, rotY, 0] }));
  };

  const placeTank = (side: -1 | 1, xAbs: number, z: number, accent: number, led: number): void => {
    const tank = buildInkReservoirTankParts(accent, led);
    const opts: TransformOpts = { pos: [side * xAbs, -0.35, z], rot: [0, side === -1 ? 0 : Math.PI, 0] };
    opaqueModule.push(...transformSlots(tank.opaqueSlots, opts));
    for (const gm of tank.glassMeshes) glassModule.push(transformMesh(gm, opts));
  };

  placeTank(-1, 10.6, -10, TURF_MAT.CLEARCOAT_MAGENTA, TURF_MAT.LED_MAGENTA);
  placeTank(1, 10.6, -58, TURF_MAT.CLEARCOAT_CYAN, TURF_MAT.LED_CYAN);
  placeTank(1, 10.8, -14, TURF_MAT.CLEARCOAT_LIME, TURF_MAT.LED_CYAN);
  placeTank(-1, 10.8, -62, TURF_MAT.CLEARCOAT_GOLD, TURF_MAT.LED_MAGENTA);

  placeAssembly(buildArenaBleacherWithSunSailSlots(true), -1, 12.2, -28);
  placeAssembly(buildArenaBleacherWithSunSailSlots(false), 1, 12.2, -32);
  placeAssembly(buildArenaBleacherWithSunSailSlots(false), -1, 12.2, -78);
  placeAssembly(buildArenaBleacherWithSunSailSlots(true), 1, 12.2, -82);

  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_MAGENTA), -1, 11.2, -44);
  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_CYAN), 1, 11.2, -46);
  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_GOLD), -1, 11.2, -92);
  placeAssembly(buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_LIME), 1, 11.2, -94);

  placeAssembly(buildAerosolMonumentSlots(TURF_MAT.CLEARCOAT_GOLD, TURF_MAT.CLEARCOAT_MAGENTA), 1, 11.6, -22, 0.18);
  placeAssembly(buildAerosolMonumentSlots(TURF_MAT.CLEARCOAT_CYAN, TURF_MAT.CLEARCOAT_LIME), -1, 11.6, -70, -0.18);

  const warmBarrier = buildTurfInflatableBarrierSlots(TURF_MAT.SAIL_FABRIC_WARM, TURF_MAT.CLEARCOAT_GOLD);
  const coolBarrier = buildTurfInflatableBarrierSlots(TURF_MAT.SAIL_FABRIC_COOL, TURF_MAT.CLEARCOAT_MAGENTA);
  for (const [side, z, warm] of [[-1, -18, true], [1, -26, false], [-1, -52, false], [1, -68, true]] as const) {
    placeAssembly(warm ? warmBarrier : coolBarrier, side, 9.2, z);
  }

  const palmPots = [TURF_MAT.CLEARCOAT_MAGENTA, TURF_MAT.CLEARCOAT_CYAN, TURF_MAT.CLEARCOAT_GOLD, TURF_MAT.CLEARCOAT_LIME];
  for (let p = 0; p < 6; p += 1) {
    const side: -1 | 1 = p % 2 === 0 ? -1 : 1;
    const z = -6 - p * 15.5;
    placeAssembly(buildPottedStreetPalmSlots(palmPots[p % palmPots.length]!, 11 + p * 7), side, 9.8, z);
  }

  const glassSpec = memoizeGeometry("splat-turf:arena-belt-glass:v3", () => mergeRawMeshes(glassModule));
  const belts: TurfArenaBeltDescriptor[] = [];
  for (let tile = 0; tile < 2; tile += 1) {
    const opaqueId = `arena-belt-${tile}`;
    const glassId = `arena-glass-${tile}`;
    belts.push({
      opaqueId,
      glassId,
      tileIndex: tile,
      opaqueNode: assembleMultiMaterialNode(opaqueId, opaqueModule, TURF_ARENA_MATERIALS, {
        id: opaqueId,
        castShadow: false,
        receiveShadow: true
      }),
      glassNode: geometry
        .custom(glassSpec, {
          name: glassId,
          material: TURF_SIGHT_GLASS_MATERIAL,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: glassId })
    });
  }
  return belts;
}

export type TurfBackdropKind =
  | "balloon"
  | "easelIsland"
  | "islandTower"
  | "islandTree"
  | "paintPotIsland"
  | "paletteIsland";

export interface TurfBackdropPiece {
  readonly id: string;
  readonly kind: TurfBackdropKind;
  readonly side: -1 | 1;
  readonly offset: number;
  readonly y: number;
  readonly z0: number;
  readonly size: number;
  readonly spin: number;
}

/**
 * Pure procedural sculpted sky-studio islands, gore-stitched hot-air balloons,
 * and artist palette + paintbrush monuments (zero `.glb` dependencies, memoized).
 */
export function buildTurfBackdropIslandSpec(kind: TurfBackdropKind): AuraCustomGeometrySpec {
  return memoizeGeometry(`splat-turf:backdrop:${kind}:v2`, () => {
    if (kind === "balloon") {
      // 14-gore scalloped stitched hot-air balloon envelope (`loftSectionsMesh`) + meridian seam ribs
      const envProfile = [
        [0.02, -1.36],
        ...bezierCurve2([0.42, -1.22], [2.52, -0.32], [2.72, 2.34], [0.02, 3.16], 10)
      ];
      const gores = 14;
      const ringPts = gores * 2;
      const envSections: V3[][] = envProfile.map(([rad, y]) => {
        const ring: V3[] = [];
        for (let i = 0; i < ringPts; i += 1) {
          const a = (i / ringPts) * Math.PI * 2;
          const puff = i % 2 === 1 ? 1.055 : 0.965;
          ring.push([Math.cos(a) * rad * puff, y, Math.sin(a) * rad * puff]);
        }
        return ring;
      });
      const envelope = loftSectionsMesh(envSections, true, true);
      const throatSkirt = latheMesh([[0.38, -1.42], [0.46, -1.24], [0.42, -1.16]], 14);
      const burner = latheMesh([[0, -1.68], [0.22, -1.68], [0.26, -1.52], [0.16, -1.46], [0, -1.46]], 10);
      const basket = transformMesh(
        subdivideSmoothMesh(bevelBoxMesh(0.96, 0.72, 0.96, 0.09), 1, 0.42),
        { pos: [0, -2.28, 0] }
      );
      const basketRim = transformMesh(bevelBoxMesh(1.06, 0.12, 1.06, 0.04), { pos: [0, -1.92, 0] });
      const cords: RawMesh[] = [];
      for (const [cx, cz] of [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]] as const) {
        cords.push(tubeSweepMesh([[cx, -1.9, cz, 0.032], [cx * 1.08, -1.24, cz * 1.08, 0.032]], 5));
        cords.push(transformMesh(icosphereFacetMesh(0.14, 0, 0.04, 7), { pos: [cx * 1.18, -2.1, cz * 1.18] }));
      }
      return mergeRawMeshes([envelope, throatSkirt, burner, basket, basketRim, ...cords]);
    }

    const cliff = transformMesh(
      stratifiedCliffMesh({ radiusX: 4.4, radiusZ: 4.1, height: 4.2, terraces: 4, seed: kind.length * 13 }),
      { pos: [0, -4.1, 0], rot: [Math.PI, 0, 0] }
    );
    const deck = latheMesh([[0, -0.15], [4.1, -0.15], [4.25, 0.2], [3.85, 0.42], [0, 0.45]], 16);

    if (kind === "islandTower") {
      const truss = transformMesh(latticeTrussMesh({ span: [1.5, 5.8, 1.5], bays: 5, chordRadius: 0.09 }), { pos: [0, 3.3, 0] });
      const tank = latheMesh([[0, 6.1], [1.15, 6.2], [1.15, 7.6], [0.7, 8.15], [0, 8.25]], 14);
      return mergeRawMeshes([cliff, deck, truss, tank]);
    }
    if (kind === "islandTree") {
      const trunkPts = catmullRomSpline3([[0, 0.35, 0], [0.35, 2.1, 0.2], [-0.15, 3.9, -0.1]], 4);
      const trunk = tubeSweepMesh(trunkPts.map((p, idx): V4 => [p[0], p[1], p[2], 0.42 - idx * 0.025]), 8);
      const crown = transformMesh(layeredCanopyMesh({ radius: 3.1, height: 2.8, puffs: 11, seed: 31 }), { pos: [-0.1, 3.5, -0.1] });
      return mergeRawMeshes([cliff, deck, trunk, crown]);
    }
    if (kind === "paintPotIsland") {
      const pot = transformMesh(
        latheMesh([[0, 0], [1.55, 0], [1.75, 2.7], [1.95, 2.95], [1.65, 3.06], [0, 2.95]], 16),
        { pos: [-0.3, 1.15, 0], rot: [0, 0, -0.42] }
      );
      const pourPts = catmullRomSpline3([[0.85, 2.15, 0], [1.68, 1.45, 0.2], [2.15, 0.42, 0.3]], 5);
      const pour = tubeSweepMesh(pourPts.map((p, idx): V4 => [p[0], p[1], p[2], 0.32 + idx * 0.03]), 8);
      const puddle = transformMesh(latheMesh([[0, 0.42], [1.25, 0.42], [1.35, 0.56], [0, 0.58]], 14), { pos: [2.05, 0, 0.28] });
      return mergeRawMeshes([cliff, deck, pot, pour, puddle]);
    }
    if (kind === "easelIsland") {
      const legA = tubeSweepMesh([[-1.4, 0.35, 0.6, 0.12], [0, 4.9, -0.2, 0.09]], 6);
      const legB = tubeSweepMesh([[1.4, 0.35, 0.6, 0.12], [0, 4.9, -0.2, 0.09]], 6);
      const legC = tubeSweepMesh([[0, 0.35, -1.5, 0.12], [0, 4.7, -0.25, 0.09]], 6);
      const canvas = transformMesh(bevelBoxMesh(3.2, 2.4, 0.24, 0.05), { pos: [0, 2.85, 0.32], rot: [-0.16, 0, 0] });
      const ledge = transformMesh(bevelBoxMesh(3.5, 0.18, 0.44, 0.03), { pos: [0, 1.62, 0.54], rot: [-0.16, 0, 0] });
      return mergeRawMeshes([cliff, deck, legA, legB, legC, canvas, ledge]);
    }

    // "paletteIsland": contoured kidney artist palette + 5 swirled paint dabs + crossed artist paintbrushes
    const palPoly: V2[] = [
      [-2.45, -1.15],
      [1.75, -1.62],
      [2.78, -0.18],
      [2.12, 1.64],
      [-0.38, 1.95],
      [-1.18, 0.82],
      [-0.55, 0.35],
      [-1.42, 0.15],
      [-2.52, 0.68]
    ];
    const palette = transformMesh(extrudePolygonMesh(palPoly, 0.34, 0.08, true), {
      pos: [0, 1.88, 0],
      rot: [-0.52, 0.24, 0.16]
    });
    const dabPositions: readonly V3[] = [
      [-1.15, 2.18, 0.38],
      [0.98, 2.38, -0.26],
      [1.55, 1.92, 0.45],
      [-0.15, 2.48, -0.58]
    ];
    const dabs = dabPositions.map((pos, idx) =>
      transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.42, 0, 0.08, 5 + idx * 7), 1, 0.52), { pos })
    );
    const brushA = tubeSweepMesh(
      [
        [-1.6, 0.85, -1.1, 0.07],
        [0.45, 2.55, 0.35, 0.12],
        [1.15, 3.15, 0.85, 0.18],
        [1.48, 3.45, 1.08, 0.03]
      ],
      8
    );
    const brushB = tubeSweepMesh(
      [
        [1.45, 0.9, -1.15, 0.07],
        [-0.35, 2.45, 0.25, 0.11],
        [-0.98, 3.02, 0.72, 0.17],
        [-1.28, 3.3, 0.96, 0.03]
      ],
      8
    );
    return mergeRawMeshes([cliff, deck, palette, ...dabs, brushA, brushB]);
  });
}

const BACKDROP_TINTS: readonly string[] = ["#ff7ab8", "#6ee4ff", "#ffd46b", "#7bf0a8", "#c8a4ff", "#ff9e7d"];

export function createTurfBackdropIslandNodes(
  pieces: readonly TurfBackdropPiece[],
  kinds: readonly TurfBackdropKind[],
  span: number,
  near: number
): readonly { readonly nodeId: string; readonly kind: TurfBackdropKind; readonly phase: number; readonly node: ReturnType<typeof instances.custom> }[] {
  const out: { readonly nodeId: string; readonly kind: TurfBackdropKind; readonly phase: number; readonly node: ReturnType<typeof instances.custom> }[] = [];
  for (let kIdx = 0; kIdx < kinds.length; kIdx += 1) {
    const kind = kinds[kIdx]!;
    const groupPieces = pieces.filter((p) => p.kind === kind);
    if (groupPieces.length === 0) continue;
    const nodeId = `isle-group-${kind}`;
    const transforms = [];
    const colors: string[] = [];
    for (let tile = 0; tile < 2; tile += 1) {
      const tileOffsetZ = -tile * span;
      for (let pIdx = 0; pIdx < groupPieces.length; pIdx += 1) {
        const p = groupPieces[pIdx]!;
        transforms.push({
          position: [p.side * p.offset, p.y, near - p.z0 + tileOffsetZ] as const,
          rotation: [0, p.z0 * 0.45, 0] as const,
          scale: p.size / 10.5
        });
        colors.push(BACKDROP_TINTS[(kIdx + pIdx + tile) % BACKDROP_TINTS.length]!);
      }
    }
    const spec = buildTurfBackdropIslandSpec(kind);
    const node = instances
      .custom(spec, {
        name: nodeId,
        material: TURF_INSTANCED_ISLAND_MATERIAL,
        transforms,
        colors,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: nodeId });
    out.push({ nodeId, kind, phase: kIdx * 1.15, node });
  }
  return out;
}
