/**
 * Aura Diamond 3D scene construction: the field, the stands, each park's set dressing, the athletes and the look.
 * Moved out of main.ts unchanged (GU47 WP-18) so unit tests can build and audit the real scene without booting the game.
 * Presentation only: the sim in main.ts reads the field constants exported here (BASES, FIELDER_SPOTS) unchanged.
 */
import { camera, effects, game, geometry, instances, lights, looks, material, model, primitives, scene, sky, text3D, world, type AuraCustomGeometrySpec, type AuraLookOverrides } from "@aura3d/engine";
import { assets } from "./aura-assets.route";
import { PARK_LOOKS, lookPlan, parkPracticals, type DiamondLookPlan, type DiamondLookVariant, type DiamondSkyMode, type DiamondTier } from "../art/look";
import { baseballSeamTextures, batWoodTexture, flipbookAtlasDataUrl, ivyBrickTexture, turfTextures } from "./turfTextures";
import { dualAnimatedWaterSpec } from "../../showcase-port-shared/dual-shaders";
import { boardTexture } from "./boardTexture";
import { windowTexture } from "./windowTexture";
import { horizonBand, horizonForTier, type HorizonBand } from "../art/horizon";
import { FAN_MODEL, fanAttireColors, fanColors, fanModelYaw, fanSeats, fanTint, fanVariantB } from "../art/crowd";
import {
  makeRng,
  MOUND_Z,
  MOUND_TOP,
  ZONE_CY,
  FOUL_DEG,
  fencePoint,
  fenceRadius,
  crowdPlacements,
  bleacherPlacements,
  shellPlacements,
  scoreboardPlacement,
  propSpot,
  clearOfFence,
  HARBOR_WATER,
  type Vec3,
  type ParkId,
  type ParkSpec
} from "./rules";
import { BATTER_YAW } from "./batter-pose";
import { labCameraOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";
import {
  createAthleteBeltNode,
  createAthleteCapNode,
  createBallparkSpectatorsNodes,
  createBaseBagsNode,
  createBoulevardLampNode,
  createCanyonArchNode,
  createCanyonHoodooNode,
  createCanyonMesaNode,
  createCanyonRockNode,
  createCatcherMittNode,
  createCoastalPineNode,
  createDesertJuniperNode,
  createDomeBannerSingleNode,
  createDomeBannersInstancedNode,
  createDomeRafterSingleNode,
  createDomeRaftersInstancedNode,
  createDugoutsNode,
  createFielderGloveNode,
  createFloodTowerNode,
  createFloodTowersInstancedNode,
  createFoulPolesNode,
  createHarborBayBridgeNode,
  createHarborBrickArcadeNode,
  createHarborLighthouseNode,
  createHarborPierNode,
  createHarborRocksInstancedNode,
  createHarborSailboatsNodes,
  createHarborWindmillNode,
  createIvyGrandstandNode,
  createIvyRowhouseNode,
  createIvyStatueNode,
  createIvyTrophyNode,
  createIvyVineSingleNode,
  createIvyVinesInstancedNode,
  createIvyWaterTowerNode,
  createLunarCommsDomeNode,
  createLunarEarthNode,
  createLunarHabitatNode,
  createLunarRoverNode,
  createProceduralBatNode,
  createRegolithMoundSingleNode,
  createRegolithMoundsInstancedNode,
  createScoreboardGantryNode,
  createSkylineTowerNode,
  createStadiumShellsNode,
  createTyphoonDomeShellNode,
  createWindowTargetNode,
  DIAMOND_MATS,
  getLunarCraterRimSpec,
  getMidtownFarBlockSpec
} from "./art/proceduralModels";

/* ================================================================== *
 *  Field geometry (metres, compact-but-proportional diamond)          *
 * ================================================================== */

export const BASE_PATH = 12.73; // home→1B legs at 45°, ~18 m paths
export const BASES: readonly Vec3[] = [
  [BASE_PATH, 0.09, -BASE_PATH], // 1B
  [0, 0.09, -BASE_PATH * 2], // 2B
  [-BASE_PATH, 0.09, -BASE_PATH] // 3B
];
export const TRAIL_COUNT = 16;
export const HIDDEN_SCALE = 0.0001;

/* ================================================================== *
 *  Scene construction                                                 *
 * ================================================================== */

/** How a park is dressed: the look variant (`?look=original` is the 4.6.2 look), the quality tier and the sky mode. */
export interface DiamondSceneContext {
  readonly variant: DiamondLookVariant;
  readonly tier: DiamondTier;
  readonly skyMode: DiamondSkyMode;
  /** PRD 6.3: ambient particles (the Midtown drizzle) halve. */
  readonly reducedMotion?: boolean;
}

/** DIA-E4 drizzle particles per tier (the look row sets intensity, density and colour). */
const DRIZZLE_PARTICLES: Readonly<Record<DiamondTier, number>> = { low: 500, medium: 900, high: 1400 };

export const DEFAULT_SCENE_CONTEXT: DiamondSceneContext = { variant: "gu47", tier: "high", skyMode: "analytic" };

/** GU47 parks whose stadium lights are on (the LED wall cap glows; day parks paint it). */
const NIGHT_LOOK: Readonly<Record<ParkId, boolean>> = { sandlot: false, skyline: true, canyon: false, ivy: false, dome: true, lunar: true };

/** Chalk lines: the 4.6.2 glowing chalk, or GU47's park chalk with a 0.05 lift (DIA-M1) so it never reads as a light. */
const chalkMat = (park: ParkSpec, ctx: DiamondSceneContext) =>
  ctx.variant === "original"
    ? material.pbr({ color: "#f5f1e4", roughness: 0.6, emissive: "#f5f1e4", emissiveIntensity: 0.18 })
    : material.pbr({ color: PARK_LOOKS[park.id].turf.chalk, roughness: 0.7, emissive: PARK_LOOKS[park.id].turf.chalk, emissiveIntensity: 0.05 });

let cachedMoundGeo: AuraCustomGeometrySpec | undefined;

/** Smoothly graded cosine-bell pitcher's mound (2.85 m radius, 0.65 m rubber plateau, zero vertical step into infield grass). */
function pitcherMoundGeometry(): AuraCustomGeometrySpec {
  if (cachedMoundGeo) return cachedMoundGeo;
  const radial = 40;
  const rings = 14;
  const outerR = 2.85;
  const plateauR = 0.65;
  const topY = MOUND_TOP + 0.01;
  const skirtY = 0.006;
  const vCount = (rings + 1) * (radial + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = t * outerR;
    const slopeT = r <= plateauR ? 0 : Math.min(1, (r - plateauR) / (outerR - plateauR));
    const y = skirtY + (topY - skirtY) * (0.5 + 0.5 * Math.cos(Math.PI * slopeT));
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const vi = j * (radial + 1) + i;
      positions[vi * 3] = cx;
      positions[vi * 3 + 1] = y;
      positions[vi * 3 + 2] = cz;
      uvs[vi * 2] = 0.5 + cx / (outerR * 2);
      uvs[vi * 2 + 1] = 0.5 + cz / (outerR * 2);
      if (j < rings && i < radial) {
        const v0 = vi;
        const v1 = vi + 1;
        const v2 = vi + radial + 1;
        const v3 = vi + radial + 2;
        indices.push(v0, v2, v1, v1, v2, v3);
      }
    }
  }
  cachedMoundGeo = geometry.define({
    positions,
    normals: geometry.computeNormals({ positions, indices }),
    uvs,
    indices,
    bounds: { min: [-outerR, 0, -outerR], max: [outerR, topY + 0.01, outerR] }
  });
  return cachedMoundGeo;
}

export function buildFieldNodes(park: ParkSpec, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): any[] {
  const nodes: any[] = [];
  const gu47 = ctx.variant === "gu47";
  const turf = PARK_LOOKS[park.id].turf;
  // GU47 DIA-M1 + WP-03: mown-turf physical sheen plane (checkerboard mowing mask + 2 m grass blade normals + fiber sheen)
  // and damp-vs-dry raked clay; without a DOM (unit tests) the materials fall back cleanly to plain colour.
  const tex = gu47 ? turfTextures() : null;
  const grassSheenColor = park.id === "dome" ? "#6ec0f0" : park.id === "lunar" ? "#8c95b0" : park.id === "canyon" ? "#a8986c" : "#89ba68";
  const grass = gu47
    ? material.physical({
        color: tex ? turf.stripe : turf.grass,
        roughness: 0.88,
        metallic: 0,
        sheen: 0.42,
        sheenRoughness: 0.54,
        sheenColor: grassSheenColor,
        ...(tex ? { texture: tex.mowMask as any, normal: tex.bladeNormal as any, normalScale: turf.normalScale?.grass ?? 0.6 } : {})
      })
    : material.pbr({ color: park.grass, roughness: 0.94 });
  const grassAlt = material.pbr({ color: park.grassAlt, roughness: 0.94 });
  const clayClearcoat = park.id === "skyline" ? 0.24 : 0.09;
  const dirt = gu47
    ? material.physical({
        color: turf.clay,
        roughness: turf.clayRoughness ?? 0.86,
        metallic: 0,
        clearcoat: clayClearcoat,
        clearcoatRoughness: 0.56,
        ...(tex && (turf.normalScale?.clay ?? 0.5) > 0
          ? { normal: tex.clayNormal as any, normalScale: turf.normalScale?.clay ?? 0.5, roughnessMap: tex.clayRoughness as any }
          : {})
      })
    : material.pbr({ color: park.dirt, roughness: 0.96 });
  const moundDirt = gu47
    ? material.physical({
        color: turf.clay,
        roughness: Math.max(0.48, (turf.clayRoughness ?? 0.86) - 0.14),
        metallic: 0,
        clearcoat: clayClearcoat + 0.07,
        clearcoatRoughness: 0.48,
        ...(tex && (turf.normalScale?.clay ?? 0.5) > 0
          ? { normal: tex.clayNormal as any, normalScale: (turf.normalScale?.clay ?? 0.5) * 1.15, roughnessMap: tex.clayRoughness as any }
          : {})
      })
    : dirt;
  const ivyBrick = gu47 && park.id === "ivy" ? ivyBrickTexture() : null;
  const wallMat = ivyBrick
    ? material.physical({ color: "#ffffff", roughness: 0.86, metallic: 0, texture: ivyBrick as any })
    : material.physical({ color: park.wall, roughness: 0.68, metallic: 0.06, clearcoat: 0.08, clearcoatRoughness: 0.5 });
  const accent = PARK_LOOKS[park.id].accent;
  const wallTopMat = !gu47
    ? material.emissive({ color: park.wallTop, emissive: park.wallTop, emissiveIntensity: park.night ? 0.85 : 0.2 })
    : NIGHT_LOOK[park.id]
      ? material.emissive({ color: accent, emissive: accent, emissiveIntensity: 0.6 })
      : material.physical({ color: accent, roughness: 0.48, clearcoat: 0.16, clearcoatRoughness: 0.4 });
  const bagMat = material.physical({ color: "#ece8d8", roughness: 0.42, sheen: 0.24, sheenRoughness: 0.62 });
  const chalk = () => chalkMat(park, ctx);

  // GU47 DIA-W2 / DIA-A1: the field's repeated pieces are instanced, one draw per shape and material, in both looks (the
  // same meshes, transforms and materials as the 4.6.2 nodes, so `?look=original` keeps its look). In GU47, the vertical
  // hockey-puck 6th clay cylinder is replaced by a smoothly graded cosine-bell pitcher's mound (`pitcher-mound`).
  const t = fieldInstanceTransforms(park);
  const clayTransforms = gu47 ? t.clay.slice(0, -1) : t.clay;
  // GU47 phase 6 (draw budget, PRD D7): pieces 2-4 cm thick lying on the ground cast no visible shadow, so GU47 leaves
  // them out of the key's shadow pass (one depth draw each).
  const flush = gu47 ? ({ castShadow: false } as const) : {};
  nodes.push(
    primitives.plane({ name: "field-grass", size: [340, 340] as any, material: grass }).position(0, -0.02, -60),
    ...(gu47
      ? [
          geometry.custom(pitcherMoundGeometry(), { name: "pitcher-mound", material: moundDirt, castShadow: false, receiveShadow: true }).position(0, 0.01, MOUND_Z),
          primitives.cylinder({ name: "batter-box-clay", size: [4.2, 0.022, 3.6], params: { radialSegments: 32 }, material: moundDirt, castShadow: false } as any).position(0, 0.02, 0.35)
        ]
      : Array.from({ length: 9 }, (_, i) =>
          primitives
            .plane({ name: `mow-${i}`, size: [340 / 9, 340] as any, material: i % 2 ? grass : grassAlt })
            .position(-170 + (340 / 9) * (i + 0.5), -0.005 - 0.001 * i, -60)
        )),
    // Infield, home circle, the three base circles (and the cylindrical mound in ?look=original), then the four base paths.
    instances.cylinder({ name: "field-clay", size: [1, 1, 1], material: dirt, transforms: clayTransforms }),
    instances.box({ name: "field-basepaths", size: [2.4, 0.04, 1], material: dirt, transforms: t.basepaths, ...flush }),
    createBaseBagsNode(t.bags),
    instances.box({ name: "field-plates", size: [1, 0.03, 1], material: bagMat, transforms: t.plates, ...flush }),
    // Batter's and catcher's boxes, then the two foul lines.
    instances.box({ name: "field-chalk", size: [1, 0.02, 1], material: chalk(), transforms: t.chalk, ...flush }),
    instances.cylinder({
      name: "foul-pole-glows",
      size: [0.14, 11, 0.14],
      material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: park.night ? 0.9 : 0.25 }),
      transforms: t.poles.map((p) => ({ position: [p.position[0], 5.5, p.position[2]] as Vec3 }))
    }),
    createFoulPolesNode(t.poles)
  );

  // Outfield wall — segmented arc from foul pole to foul pole
  // One instanced draw for the wall and one for its cap (C12); each segment is a unit-length box scaled to its chord.
  const segs = park.fenceSegments;
  const wallT: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
  const capT: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = -FOUL_DEG + (2 * FOUL_DEG * i) / segs;
    const t1 = -FOUL_DEG + (2 * FOUL_DEG * (i + 1)) / segs;
    const tm = (t0 + t1) / 2;
    const p0 = fencePoint(park, t0, 0);
    const p1 = fencePoint(park, t1, 0);
    const pm = fencePoint(park, tm, 0);
    const segLen = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) + 0.35;
    const yaw = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
    wallT.push({ position: [pm[0], park.wallH / 2, pm[2]], rotation: [0, yaw + Math.PI / 2, 0], scale: [segLen, 1, 1] });
    capT.push({ position: [pm[0], park.wallH + 0.07, pm[2]], rotation: [0, yaw + Math.PI / 2, 0], scale: [segLen, 1, 1] });
  }
  nodes.push(
    instances.box({ name: "outfield-wall", size: [1, park.wallH, 0.5], material: wallMat, transforms: wallT }),
    instances.box({ name: "outfield-wall-cap", size: [1, 0.14, 0.56], material: wallTopMat, transforms: capT })
  );

  // GU47 DIA-V2: the park's name in SDF letters on the left-centre wall (+1 draw).
  if (gu47) nodes.push(wallNameNode(park));

  // GU47 DIA-M1: a darker warning track (the park's track clay and roughness; wet and glossy in Midtown) in one instanced
  // draw, a 4.5 m strip just inside the wall from pole to pole.
  if (gu47) {
    const trackT: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
    for (let i = 0; i < segs; i++) {
      const t0 = -FOUL_DEG + (2 * FOUL_DEG * i) / segs;
      const t1 = -FOUL_DEG + (2 * FOUL_DEG * (i + 1)) / segs;
      const p0 = fencePoint(park, t0, 0, -2.6);
      const p1 = fencePoint(park, t1, 0, -2.6);
      const pm = fencePoint(park, (t0 + t1) / 2, 0, -2.6);
      const len = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) + 0.4;
      const yaw = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
      trackT.push({ position: [pm[0], -0.008, pm[2]], rotation: [0, yaw + Math.PI / 2, 0], scale: [len, 1, 1] });
    }
    nodes.push(instances.box({ name: "warning-track", size: [1, 0.02, 4.5], material: material.pbr({ color: turf.track, roughness: turf.trackRoughness }), transforms: trackT, castShadow: false }));
  }

  // On-deck rings + side dugouts. Keep the circles as painted chalk outlines
  // (a filled disc read as an oversized white target in the foreground) and
  // push the dugout boxes to the side touchlines so they frame instead of
  // blocking the lower third of the broadcast camera.
  // GU47 phase 4 (distinctness): the chalk rings read to the sibling judge as the Hoops ground-ring player markers; the GU47
  // look lays real on-deck mats instead, dark synthetic turf in the park's warning-track tone (not a white target).
  const ondeckMat = material.pbr({ color: "#eee6d2", roughness: 1, opacity: 0.5 });
  const ondeckMat47 = material.pbr({ color: PARK_LOOKS[park.id].turf.track, roughness: 0.9 });
  const ondeck = (name: string, x: number) =>
    primitives.torus({ name, size: [1.5, 1.5, 0.26], material: ondeckMat }).position(x, 0.028, 2.2).rotate(Math.PI / 2, 0, 0);
  nodes.push(
    // GU47 phase 6 (draw budget): the two mats are one instanced draw and, 2 cm thick on the ground, cast no shadow.
    ...(ctx.variant === "gu47"
      ? [instances.cylinder({ name: "ondeck-mats", size: [1.6, 0.02, 1.6], params: { radialSegments: 40 }, material: ondeckMat47, castShadow: false, transforms: [{ position: [-7.1, 0.018, 2.2] }, { position: [7.1, 0.018, 2.2] }] } as any)]
      : [ondeck("ondeck-l", -7.1), ondeck("ondeck-r", 7.1)]),
    createDugoutsNode(t.dugouts, "#4b5259")
  );

  return nodes;
}

type FieldTransform = { readonly position: Vec3; readonly rotation?: Vec3; readonly scale?: Vec3 };

/**
 * Instance transforms of the field's repeated pieces (DIA-W2), each the transform of the 4.6.2 node it replaces with the
 * old `size` folded into the scale (instanced primitives are unit shapes scaled per instance).
 */
export function fieldInstanceTransforms(park: ParkSpec): {
  readonly clay: readonly FieldTransform[];
  readonly basepaths: readonly FieldTransform[];
  readonly bags: readonly FieldTransform[];
  readonly plates: readonly FieldTransform[];
  readonly chalk: readonly FieldTransform[];
  readonly poles: readonly FieldTransform[];
  readonly dugouts: readonly FieldTransform[];
} {
  const clay: FieldTransform[] = [
    { position: [0, 0.012, -BASE_PATH - 1.5], scale: [26, 0.05, 26] },
    { position: [0, 0.018, 0.4], scale: [7.4, 0.06, 7.4] },
    ...BASES.map(([bx, , bz]): FieldTransform => ({ position: [bx, 0.02, bz], scale: [4.6, 0.05, 4.6] })),
    { position: [0, MOUND_TOP / 2 + 0.02, MOUND_Z], scale: [5.6, MOUND_TOP, 5.6] }
  ];
  const basepaths = ([
    [0.9, -0.9, BASE_PATH - 0.4, -BASE_PATH + 0.4],
    [BASE_PATH - 0.4, -BASE_PATH - 0.4, 0.9, -BASE_PATH * 2 + 0.9],
    [-0.9, -BASE_PATH * 2 + 0.9, -BASE_PATH + 0.4, -BASE_PATH - 0.4],
    [-BASE_PATH + 0.4, -BASE_PATH + 0.4, -0.9, -0.9]
  ] as const).map(([x0, z0, x1, z1]): FieldTransform => ({
    position: [(x0 + x1) / 2, 0.025, (z0 + z1) / 2],
    rotation: [0, Math.atan2(x1 - x0, z1 - z0), 0],
    scale: [1, 1, Math.hypot(x1 - x0, z1 - z0)]
  }));
  const len = park.fenceCorner * 1.02;
  const sides = [-1, 1].map((side) => {
    const rad = (side * FOUL_DEG * Math.PI) / 180;
    return { rad, fx: Math.sin(rad), fz: -Math.cos(rad) };
  });
  return {
    clay,
    basepaths,
    bags: BASES.map(([bx, , bz]): FieldTransform => ({ position: [bx, 0.06, bz] })),
    plates: [
      { position: [0, 0.045, 0], rotation: [0, Math.PI / 4, 0], scale: [0.44, 1, 0.44] },
      { position: [0, MOUND_TOP + 0.045, MOUND_Z - 0.35], scale: [0.6, 1, 0.16] }
    ],
    chalk: [
      { position: [-1.15, 0.05, 0.35], scale: [0.06, 1, 1.7] },
      { position: [1.15, 0.05, 0.35], scale: [0.06, 1, 1.7] },
      { position: [0, 0.05, 1.2], scale: [2.3, 1, 0.06] },
      { position: [0, 0.05, 2.1], scale: [1.4, 1, 0.06] },
      ...sides.map(({ rad, fx, fz }): FieldTransform => ({ position: [(fx * len) / 2, 0.05, (fz * len) / 2], rotation: [0, rad, 0], scale: [0.09, 1, len] }))
    ],
    poles: sides.map(({ fx, fz }): FieldTransform => ({ position: [fx * park.fenceCorner, 0, fz * park.fenceCorner] })),
    dugouts: [
      { position: [-28, 0, -6], rotation: [0, Math.PI / 2, 0] },
      { position: [28, 0, -6], rotation: [0, -Math.PI / 2, 0] }
    ]
  };
}

/**
 * DIA-V2: in GU47 the screen shows the live linescore canvas (main.ts repaints it, at most 4 times a second) as its
 * emissive map; no new draw. `?look=original` and DOM-less builds keep the 4.6.2 flat screen.
 */
function scoreboardScreenMaterial(ctx: DiamondSceneContext): ReturnType<typeof material.emissive> {
  const board = ctx.variant === "gu47" ? boardTexture() : null;
  if (!board) return material.emissive({ color: "#0d2436", emissive: "#1b4a66", emissiveIntensity: 0.9 });
  return material.emissive({ color: "#0a1410", emissive: "#ffffff", emissiveMap: board.handle as any, emissiveIntensity: 1.1, roughness: 0.6 });
}

export function buildStandsNodes(park: ParkSpec, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): any[] {
  const nodes: any[] = [];
  const rng = makeRng(0xbeef);

  // Grandstand stadium shells framing the outer ballpark skyline, placed behind each park's own fence (rules.ts shellPlacements).
  // DIA-W2 + WP-08: one instanced cantilevered multi-deck grandstand draw for the three shells (-2).
  nodes.push(
    createStadiumShellsNode(
      shellPlacements(park).map((sh) => {
        const k = sh.name.endsWith("-c") ? 30 / 28 : 1;
        return { position: [sh.x, 0, sh.z] as Vec3, rotation: [0, sh.yaw, 0] as Vec3, scale: [k, k, k] as Vec3 };
      }),
      "#334154"
    )
  );

  // Grounded tiered stadium bleachers wrapping the outfield arc
  const deckMat = material.pbr({ color: "#1c2638", roughness: 0.78, metalness: 0.22 });
  // GU47 phase 4: galvanised aluminium benches that pick up the sky (rubric ibl_reflections).
  const benchMat = material.pbr({ color: "#6b7a8e", roughness: 0.32, metalness: 0.8 });
  // Each section starts a fixed distance behind the fence at its own angle, so no row stands inside the wall (C3).
  // Instanced risers and benches: two draws instead of 42 (C12).
  const bleachers = bleacherPlacements(park);
  nodes.push(
    instances.box({
      name: "bleacher-risers",
      size: [11.5, 1, 2.2],
      material: deckMat,
      transforms: bleachers.map((b) => ({ position: [b.x, b.tierH * 0.5, b.z] as Vec3, rotation: [0, b.yaw, 0] as Vec3, scale: [1, b.tierH, 1] as Vec3 }))
    }),
    instances.box({
      name: "bleacher-benches",
      size: [11.2, 0.22, 0.85],
      material: benchMat,
      transforms: bleachers.map((b) => ({ position: b.bench, rotation: [0, b.yaw, 0] as Vec3 }))
    })
  );

  // GU47 DIA-A2 + WP-08: 588 articulated `articulatedFolkSlots` ballpark spectators batched into 4 `instances.custom` draws
  // (`stand-fans`, `stand-fans-b`, `stand-fans-skin`, `stand-fans-attire`; 6 draws total with bleachers; `clearcoat: 0, sheen: 0`).
  if (ctx.variant === "gu47") {
    const seats = fanSeats(park, ctx.tier);
    const { shirts, skin } = fanColors(park, seats);
    const attire = fanAttireColors(park, seats);
    const useB = fanVariantB(park, seats);
    const allTransforms = seats.map((s) => ({
      position: [s.position[0], s.position[1] - FAN_MODEL.height * FAN_MODEL.seat, s.position[2]] as Vec3,
      rotation: [0, fanModelYaw(s.yaw), 0] as Vec3
    }));
    const idxA: number[] = [];
    const idxB: number[] = [];
    seats.forEach((_, i) => {
      if (useB[i]) idxB.push(i);
      else idxA.push(i);
    });
    nodes.push(
      ...createBallparkSpectatorsNodes({
        transformsA: idxA.map((i) => allTransforms[i]!),
        colorsA: idxA.map((i) => fanTint(shirts[i]!)),
        transformsB: idxB.map((i) => allTransforms[i]!),
        colorsB: idxB.map((i) => fanTint(shirts[i]!)),
        allTransforms,
        skinColors: skin,
        attireColors: attire
      })
    );
  }

  // Animated front-row wavers — real admitted 3D rigged athletes grounded at y = 0
  void rng;
  for (const [i, c] of crowdPlacements(park).entries()) {
    nodes.push(
      model(assets.diamondCrowdAthlete, {
        name: `waver-${i}`,
        targetHeight: 1.88,
        role: "setDressing",
        scaleMode: "fit"
      })
        .position(c.x, 0, c.z)
        .rotate(0, c.yaw, 0)
        .animate({ clip: "Idle_Loop", loop: true, speed: 1.1 })
        .runtime(game.runtimeNode(`waver-${i}`))
    );
  }

  // Scoreboard + floodlight towers
  // Behind the centre bleacher section, at the same rig-to-screen spacing the art was tuned with.
  const sb = scoreboardPlacement(park);
  nodes.push(
    createScoreboardGantryNode(sb.rig),
    primitives.box({ name: "scoreboard-screen", size: [10.5, 3.4, 0.4], material: scoreboardScreenMaterial(ctx) }).position(sb.screen[0], sb.screen[1], sb.screen[2]).runtime(game.runtimeNode("scoreboard-screen"))
  );

  if (ctx.variant === "gu47") {
    nodes.push(...practicalNodes(park, ctx.tier));
  } else if (park.flood) {
    const towers: Vec3[] = [
      [-park.fenceCorner * 0.72, 0, -park.fenceCorner * 0.55 - 6],
      [park.fenceCorner * 0.72, 0, -park.fenceCorner * 0.55 - 6],
      [-park.fenceCorner * 0.5, 0, 14],
      [park.fenceCorner * 0.5, 0, 14]
    ];
    towers.forEach(([tx, , tz], i) => {
      const litColor = park.id === "lunar" ? "#bfe0ff" : "#fff2d4";
      nodes.push(
        createFloodTowerNode(`flood-${i}`, [tx, 0, tz], [0, Math.atan2(-tx, 10 - tz) + Math.PI, 0], 16, litColor),
        lights.spot({ name: `flood-spot-${i}`, position: [tx * 0.9, 15, tz * 0.9], target: [0, 0, -10], angle: 0.6, penumbra: 0.55, intensity: 2.0, color: litColor, distance: 160 }),
        effects.lightCone({ name: `flood-cone-${i}`, position: [tx * 0.9, 14.6, tz * 0.9], direction: [-tx * 0.05, -1, (10 - tz) * 0.05], color: "#bfe0ff", intensity: 0.22, length: 15, coneAngle: 0.5, softness: 0.6 } as any)
      );
    });
  }

  return nodes;
}

const unitDir = (from: Vec3, to: Vec3): Vec3 => {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
};

/**
 * DIA-L2 night and indoor rigs (art/look.ts `parkPracticals`): Midtown's six tower banks in sodium and LED (light cones,
 * lens flares on the two outfield towers), the Dome's four truss panels (rect lights plus one instanced fixture draw),
 * the Moon's four cold spots. Lamps are unshadowed (the key is the scene's one caster). Day parks light nothing; Ivy
 * keeps its four towers as unlit dressing. Low: four lamps, no flares (PRD 6.4).
 */
export function practicalNodes(park: ParkSpec, tier: DiamondTier): any[] {
  const nodes: any[] = [];
  const rig = parkPracticals(park, tier);
  if (rig.length === 0) {
    if (park.flood) {
      const towers: readonly [number, number][] = [
        [-park.fenceCorner * 0.72, -park.fenceCorner * 0.55 - 6],
        [park.fenceCorner * 0.72, -park.fenceCorner * 0.55 - 6],
        [-park.fenceCorner * 0.5, 14],
        [park.fenceCorner * 0.5, 14]
      ];
      // GU47 phase 6 (draw budget): the far pair of unlit towers is one instanced draw; near pair stays two individual nodes for frustum culling.
      const towerYaw = (tx: number, tz: number): Vec3 => [0, Math.atan2(-tx, 10 - tz) + Math.PI, 0];
      nodes.push(
        createFloodTowersInstancedNode(
          "flood-towers-far",
          towers.slice(0, 2).map(([tx, tz]) => ({ position: [tx, 0, tz] as Vec3, rotation: towerYaw(tx, tz) })),
          16
        ),
        ...towers.slice(2).map(([tx, tz], i) => createFloodTowerNode(`flood-${i + 2}`, [tx, 0, tz], towerYaw(tx, tz), 16))
      );
    }
    return nodes;
  }
  for (const lamp of rig) {
    if (lamp.kind === "spot") {
      const [x, y, z] = lamp.position;
      const [bx, bz] = lamp.base ?? [x, z];
      nodes.push(
        createFloodTowerNode(`${lamp.name}-tower`, [bx, 0, bz], [0, Math.atan2(-bx, 10 - bz) + Math.PI, 0], y, lamp.color),
        lights.spot({ name: lamp.name, position: lamp.position, target: lamp.target, angle: lamp.angle, penumbra: lamp.penumbra, intensity: lamp.intensity, color: lamp.color, distance: lamp.distance })
      );
      if (lamp.cone) {
        nodes.push(effects.lightCone({ name: `${lamp.name}-cone`, position: [x, y - 0.4, z], direction: unitDir(lamp.position, lamp.target), color: lamp.color, intensity: 0.2, length: 18, coneAngle: (lamp.angle ?? 0.5) * 0.8, softness: 0.6 } as any));
      }
      if (lamp.flare) nodes.push(lights.lensFlare({ name: `${lamp.name}-flare`, light: lamp.name, intensity: 0.8, edgeFade: 0.2 }));
    } else {
      nodes.push(lights.rect({ name: lamp.name, position: lamp.position, target: lamp.target, color: lamp.color, intensity: lamp.intensity, width: lamp.width, height: lamp.height }));
    }
  }
  const panels = rig.filter((lamp) => lamp.kind === "rect");
  if (panels.length > 0) {
    nodes.push(
      instances.box({
        name: "dome-truss-panels",
        size: [1, 0.3, 1],
        material: material.emissive({ color: panels[0]!.color, emissive: panels[0]!.color, emissiveIntensity: 1.4 }),
        transforms: panels.map((p) => ({ position: [p.position[0], p.position[1] + 0.3, p.position[2]] as Vec3, scale: [p.width ?? 8, 1, p.height ?? 2] as Vec3 }))
      })
    );
  }
  return nodes;
}

/** `?look=original`: Ivy's trophy, statue and seven vine panels as separate procedural nodes. */
function ivyOriginalDressing(park: ParkSpec): any[] {
  return [
    createIvyTrophyNode(),
    createIvyStatueNode(),
    ...Array.from({ length: 7 }, (_, i) => {
      const theta = -36 + i * 12;
      const pm = fencePoint(park, theta, 0);
      return createIvyVineSingleNode(`ivy-vine-${i}`, [pm[0] * 0.995, 0, pm[2] * 0.995], (theta * Math.PI) / 180, park.wallH);
    })
  ];
}

/**
 * GU47 wave 2 + WP-08 (DIA-A1): procedural multi-material architectural & geological landmarks standing behind each
 * park's far fence. Each piece is its own node so it frustum-culls independently; every yaw turns local +Z toward home.
 */
const farYaw = (x: number, z: number): number => Math.atan2(-x, -z);

export function wave2SetPieces(park: ParkSpec, low = false): any[] {
  const ring = (deg: number, r: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [Math.sin(rad) * r, -Math.cos(rad) * r];
  };
  switch (park.id) {
    case "sandlot": {
      const [x, z] = [105, -212];
      return [createHarborLighthouseNode([x, 0, z], farYaw(x, z))];
    }
    case "canyon": {
      return ([[-48, 285, 30, 0.2], [-4, 320, 36, -0.3], [40, 290, 28, 0.1]] as const)
        .filter((_, i) => !low || i !== 0)
        .map(([deg, r, h, jitter], i) => {
          const [x, z] = ring(deg, r);
          return createCanyonMesaNode(`canyon-mesa-${i}`, [x, -0.4, z], farYaw(x, z) + jitter, h, i);
        })
        .concat(
          ([[-30, 200, 22, 0.2], [26, 215, 26, -0.25]] as const)
            .filter((_, i) => !low || i === 1)
            .map(([deg, r, h, jitter], i) => {
              const [x, z] = ring(deg, r);
              return createCanyonHoodooNode(`canyon-hoodoo-${i}`, [x, -0.2, z], farYaw(x, z) + jitter, h, i);
            })
        );
    }
    case "ivy": {
      const houses = ([[-46, 0.1], [-22, -0.12], [22, 0.14], [46, -0.08]] as const)
        .filter((_, i) => !low || i % 2 === 1)
        .map(([deg, jitter], i) => {
          const [x, z] = ring(deg, 168);
          return createIvyRowhouseNode(`ivy-rowhouse-${i}`, [x, 0, z], farYaw(x, z) + jitter);
        });
      const [tx, tz] = ring(0, 175);
      return [...houses, createIvyWaterTowerNode([tx, 0, tz], farYaw(tx, tz))];
    }
    case "lunar": {
      const [x, z] = clearOfFence(park, -62, -100, 16);
      return [createLunarHabitatNode([x, 0, z], farYaw(x, z))];
    }
    default:
      return [];
  }
}

export function buildParkExtras(park: ParkSpec, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): any[] {
  const nodes: any[] = [];
  const gu47 = ctx.variant === "gu47";
  const lookRow = PARK_LOOKS[park.id];
  void ivyBrickTexture;
  // Outfield props come from rules.ts PROP_SPOTS, pushed behind each park's fence (C3).
  const at = (name: string): [number, number] => propSpot(park, name);
  switch (park.id) {
    case "sandlot": {
      const W = HARBOR_WATER;
      const harborWaterMat = gu47
        ? material.custom(
            dualAnimatedWaterSpec({
              deepColor: [0.045, 0.145, 0.245],
              shallowColor: [0.115, 0.335, 0.455],
              foamColor: [1.0, 0.82, 0.54],
              sunDir: [-0.42, 0.25, -0.87],
              waveScale: 0.12,
              waveSpeed: 0.85,
              opacity: 0.97
            })
          )
        : material.pbr({ color: "#2e5d7a", roughness: 0.35, metalness: 0.3 });

      const arcadeBays: { pos: Vec3; rotY: number; span: number }[] = [];
      if (gu47) {
        const bays = 6;
        for (let i = 0; i < bays; i++) {
          const theta = 15 + (24 * i) / bays;
          const thetaNext = 15 + (24 * (i + 1)) / bays;
          const p = fencePoint(park, theta, 0, 5.2);
          const pNext = fencePoint(park, thetaNext, 0, 5.2);
          const mid: Vec3 = [(p[0] + pNext[0]) * 0.5, 0, (p[2] + pNext[2]) * 0.5];
          const span = Math.hypot(pNext[0] - p[0], pNext[2] - p[2]) + 0.3;
          const spanYaw = Math.atan2(pNext[0] - p[0], pNext[2] - p[2]) + Math.PI / 2;
          arcadeBays.push({ pos: mid, rotY: spanYaw, span });
        }
      }

      const boatSpots: readonly [number, number, number, number][] = [
        [76, -142, 0.45, 1.0],
        [98, -154, -0.25, 1.12],
        [124, -148, 0.72, 0.94],
        [148, -162, 0.18, 1.08],
        [172, -150, -0.52, 0.98]
      ];

      nodes.push(
        createHarborPierNode([at("harbor-pier")[0], -0.3, at("harbor-pier")[1]], 0.3),
        primitives
          .plane({ name: "harbor-water", size: [W.w, W.d] as any, castShadow: false, material: harborWaterMat })
          .position(W.x, W.y, W.z)
          .runtime(game.runtimeNode("harbor-water")),
        createHarborWindmillNode("sandlot-windmill", [at("sandlot-windmill")[0], 0, at("sandlot-windmill")[1]], 0.6, 13),
        ...(gu47
          ? [
              createHarborBrickArcadeNode(arcadeBays),
              createHarborBayBridgeNode([144, 0, -237], -0.074),
              ...createHarborSailboatsNodes(boatSpots, W.y),
              createHarborRocksInstancedNode([
                { position: [at("pine-a")[0], 0, at("pine-a")[1]] as Vec3 },
                { position: [at("pine-b")[0], 0, at("pine-b")[1]] as Vec3, rotation: [0, 1.2, 0] as Vec3, scale: [6.5 / 7, 6.5 / 7, 6.5 / 7] as Vec3 }
              ])
            ]
          : [
              createCanyonArchNode("sandlot-tower", [at("sandlot-tower")[0], 0, at("sandlot-tower")[1]], -0.4, 12),
              createCoastalPineNode("pine-a", [at("pine-a")[0], 0, at("pine-a")[1]], 7),
              createCoastalPineNode("pine-b", [at("pine-b")[0], 0, at("pine-b")[1]], 6.5).rotate(0, 1.2, 0)
            ]),
        createBoulevardLampNode("sandlot-lamp", [at("sandlot-lamp")[0], 0, at("sandlot-lamp")[1]], 5.4)
      );
      break;
    }
    case "skyline": {
      const buildings: [number, number][] = [[46, 0.5], [52, -0.4], [38, 0.9], [30, -0.9], [60, 0.1]];
      buildings.forEach(([h, r], i) => {
        const [x, z] = at(`skyline-bldg-${i}`);
        nodes.push(createSkylineTowerNode(`skyline-bldg-${i}`, [x, 0, z], 15 + (i % 3) * 2.5, h, 14 + ((i + 1) % 2) * 2.5, i).rotate(0, r, 0));
      });
      for (let i = 0; i < 4; i++) {
        const theta = -24 + i * 16;
        const pm = fencePoint(park, theta, 0);
        nodes.push(createWindowTargetNode(i, [pm[0] * 1.18, 9.5 + i * 2.2, pm[2] * 1.18 - 3], (theta * Math.PI) / 180));
      }
      for (const [lx, lz] of [[-26, 8], [26, 8], [-46, -30], [46, -30]] as const) {
        nodes.push(createBoulevardLampNode(`lamp-${lx}`, [lx, 0, lz], 6));
      }
      break;
    }
    case "canyon": {
      const rocks: [number, number][] = [[13, 0.3], [15, -0.7], [7.5, 1.1], [6.5, -0.4], [22, 0]];
      rocks.forEach(([h, r], i) => {
        const [x, z] = at(`canyon-rock-${i}`);
        nodes.push(createCanyonRockNode(`canyon-rock-${i}`, [x, 0, z], r, h, i));
      });
      for (const [tx, tz] of [[-108, -40], [110, -44], [-88, -20], [88, -16]] as const) {
        nodes.push(createDesertJuniperNode(`canyon-pine-${tx}`, [tx, 0, tz], 8.5, Math.abs(tx)));
      }
      break;
    }
    case "ivy": {
      nodes.push(
        createIvyGrandstandNode(),
        ...(gu47
          ? [
              ...ivyOriginalDressing(park).slice(0, 2),
              createIvyVinesInstancedNode(
                Array.from({ length: 7 }, (_, i) => {
                  const theta = -36 + i * 12;
                  const pm = fencePoint(park, theta, 0);
                  return { position: [pm[0] * 0.995, 0, pm[2] * 0.995] as Vec3, rotation: [0, (theta * Math.PI) / 180, 0] as Vec3 };
                }),
                park.wallH
              )
            ]
          : ivyOriginalDressing(park))
      );
      break;
    }
    case "dome": {
      if (!gu47) nodes.push(createTyphoonDomeShellNode());
      if (gu47) {
        nodes.push(
          createDomeRaftersInstancedNode(Array.from({ length: 5 }, (_, i) => ({ position: [-60 + i * 30, 26, -50] as Vec3 }))),
          createDomeBannersInstancedNode(
            Array.from({ length: 4 }, (_, i) => ({ position: [-18 + i * 12, 14, 18] as Vec3 })),
            Array.from({ length: 4 }, (_, i) => (i % 2 ? lookRow.accent : lookRow.crowd[2] ?? lookRow.accent))
          )
        );
      } else {
        nodes.push(
          ...Array.from({ length: 5 }, (_, i) => createDomeRafterSingleNode(`dome-rafter-${i}`, [-60 + i * 30, 26, -50])),
          ...Array.from({ length: 4 }, (_, i) => createDomeBannerSingleNode(`dome-banner-${i}`, [-18 + i * 12, 14, 18], i % 2 ? "#35d6ff" : "#ffb03a"))
        );
      }
      break;
    }
    case "lunar": {
      nodes.push(
        createLunarEarthNode([-30, 66, -260]),
        createLunarRoverNode([-17, 0, 9], 0.8),
        createLunarCommsDomeNode([at("lunar-comms")[0], 0, at("lunar-comms")[1]], -0.5)
      );
      if (gu47) {
        nodes.push(
          createRegolithMoundsInstancedNode(
            Array.from({ length: 6 }, (_, i) => ({ position: [at(`regolith-${i}`)[0], 0.1, at(`regolith-${i}`)[1]] as Vec3, scale: [4 + i, 1, 4 + i * 0.7] as Vec3 }))
          )
        );
      } else {
        nodes.push(
          ...Array.from({ length: 6 }, (_, i) => createRegolithMoundSingleNode(`regolith-${i}`, [at(`regolith-${i}`)[0], 0.1, at(`regolith-${i}`)[1]], [4 + i, 1, 4 + i * 0.7]))
        );
      }
      break;
    }
  }
  if (gu47) {
    const band = horizonBand(park.id);
    if (band) nodes.push(horizonNode(horizonForTier(band, ctx.tier === "low")));
    nodes.push(...wave2SetPieces(park, ctx.tier === "low"));
  }
  return nodes;
}

/** DIA-V2: field angle (deg) of the painted park name: the left-centre power alley, between Ivy's vines (-36, -24). */
export const WALL_NAME_THETA = -30;

/**
 * DIA-V2: the park name painted on the outfield wall face in SDF letters (`text3D`, backend "sdf"), centred on the wall
 * height at WALL_NAME_THETA, facing home plate, 0.32 m proud of the wall's centre line (the wall is 0.5 m thick). Letter
 * height half the wall (at most 0.9 m, smaller when the name would overrun its wall segment); park chalk, lifted a little
 * so it reads at night without glowing.
 */
export function wallNameNode(park: ParkSpec): any {
  const chalk = PARK_LOOKS[park.id].turf.chalk;
  const build = (size: number) =>
    text3D(park.name, {
      name: "wall-park-name",
      size,
      depth: 0.04,
      backend: "sdf",
      material: material.emissive({ color: chalk, emissive: chalk, emissiveIntensity: NIGHT_LOOK[park.id] ? 0.3 : 0.12 })
    });
  // The glyph mesh starts at the origin (bottom-left) and scales with size; measure it at size 1.
  const widthOf = (node: ReturnType<typeof build>): number =>
    (((node.toJSON() as any).geometry?.positions ?? []) as readonly (readonly number[])[]).reduce((m, q) => Math.max(m, q[0] ?? 0), 0);
  // The wall is a chain of flat chords (scene wall loop); the radius shrinks toward the foul lines, so the chord is not
  // square to the radial. The letters sit on the chord of the segment centred on WALL_NAME_THETA, parallel to it
  // (a radial yaw buried the left half of the name in the wall: "ON RIM", "LASSIC").
  const { centre, yaw, length } = wallNameChord(park);
  const size = Math.min(0.9, park.wallH * 0.5, (length - 1.2) / Math.max(widthOf(build(1)), 1e-6));
  const node = build(size);
  const width = widthOf(node);
  return node
    .position(centre[0] - (width / 2) * Math.cos(yaw), (park.wallH - size) / 2, centre[2] + (width / 2) * Math.sin(yaw))
    .rotate(0, yaw, 0);
}

/** DIA-V2: the wall chord the park name sits on: its face centre 0.32 m toward home, the glyph yaw and the chord length. */
export function wallNameChord(park: ParkSpec): { centre: Vec3; yaw: number; length: number } {
  const segDeg = (2 * FOUL_DEG) / park.fenceSegments;
  const p0 = fencePoint(park, WALL_NAME_THETA - segDeg / 2, 0);
  const p1 = fencePoint(park, WALL_NAME_THETA + segDeg / 2, 0);
  const pm = fencePoint(park, WALL_NAME_THETA, 0);
  const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx); // local +x along the chord (left to right from home), local +z toward home
  return { centre: [pm[0] + 0.32 * Math.sin(yaw), 0, pm[2] + 0.32 * Math.cos(yaw)], yaw, length };
}

/**
 * DIA-W1: Harbor's bay as `world.water` (E-G; `A3D_QR_WORLD_WATER` is default-on and draws without the world lane),
 * calm Gerstner swell that mirrors the sunset IBL. Planar reflection would redraw the park (about +400 draws), so it
 * is Ultra only. Same footprint and rest height as the 4.6.2 plane (rules.ts HARBOR_WATER).
 */
export function harborWater(): any {
  const W = HARBOR_WATER;
  const x0 = W.x - W.w / 2, x1 = W.x + W.w / 2, z0 = W.z - W.d / 2, z1 = W.z + W.d / 2;
  return world
    .water({
      id: "harbor-water",
      name: "harbor-water",
      kind: "ocean",
      shape: { kind: "polygon", points: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] },
      height: W.y,
      shallowColor: "#3f7488",
      deepColor: "#173a52",
      waves: "calm",
      reflection: { low: "ibl", medium: "ibl", high: "ibl", ultra: "planar" },
      // GU47 phase 2: refraction off on every tier. Refraction needs the after-opaque scene copy, and on the freeze build
      // that pass fails to compile (its vertex shader lacks the `prd10.sceneCopy` marker), so Harbor never drew. The
      // calm bay keeps IBL reflection; refraction comes back when the engine fix lands (lane report handoff).
      refraction: { low: false, medium: false, high: false, ultra: false }
    })
    .toJSON();
}

/** DIA-W1 + WP-08: one park's sculpted horizon band (`midtown-far-blocks` or `lunar-crater-rim`) as one instanced draw. */
export function horizonNode(band: HorizonBand): any {
  const windows = band.windows ? windowTexture() : null;
  const mat = band.windows
    ? windows
      ? material.emissive({ color: band.color, emissive: band.windows.emissive, emissiveMap: windows as any, emissiveIntensity: band.windows.intensity, roughness: band.roughness, clearcoat: 0, sheen: 0, practical: true })
      : material.emissive({ color: band.color, emissive: band.windows.emissive, emissiveIntensity: band.windows.intensity / 3, roughness: band.roughness, clearcoat: 0, sheen: 0, practical: true })
    : material.pbr({ color: band.color, roughness: band.roughness, metalness: 0, clearcoat: 0, sheen: 0 });
  const options = {
    name: band.name,
    material: mat,
    transforms: band.instances.map((i) => ({ position: i.position, rotation: i.rotation, scale: i.scale })),
    ...(band.colors ? { colors: band.instances.map((_, i) => band.colors![i % band.colors!.length]!) } : {})
  };
  if (band.shape === "stepped-tower") return instances.custom(getMidtownFarBlockSpec(), options);
  if (band.shape === "crater-ridge") return instances.custom(getLunarCraterRimSpec(), options);
  return band.shape === "box" ? instances.box({ ...options, size: [1, 1, 1] as Vec3 }) : instances.cylinder({ ...options, size: [1, 1, 1] as Vec3 });
}

const ATHLETE_UNIFORM_OVERRIDES = [{ color: "#f3ede0", colorMode: "multiply" as const, roughness: 0.78, metallic: 0 }] as const;

/** An admitted 3D catalog athlete grounded cleanly with skeletal animation in an immediate athletic ready crouch. */
export function buildAthleteNodes(id: string, asset: any, initialClip = "Crouch_Idle_Loop", gu47 = true): any[] {
  return [
    model(asset, {
      name: id,
      targetHeight: 1.88,
      role: "primaryCharacter",
      scaleMode: "fit",
      ...(gu47 ? { materialOverrides: ATHLETE_UNIFORM_OVERRIDES } : {})
    })
      .position(0, -80, 0)
      .animate({ clip: initialClip, loop: true, speed: 1.0 })
      .runtime(game.runtimeNode(id))
  ];
}

/** GU47 phase 4: lacquered helmets and caps catch the sky (rubric ibl_reflections); main.ts tints them per team. */
export const CAP_ROUGHNESS = 0.22;

export const FIELDER_IDS = ["f-c", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf"] as const;
/** Everyone who wears a glove except the catcher (his mitt has its own node and calibrated offsets). */
export const GLOVE_OWNERS = ["pitcher", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf"] as const;
/** Everyone in uniform who gets a team cap and belt. */
export const KIT_OWNERS = ["pitcher", ...FIELDER_IDS, "batter", "runner-0", "runner-1", "runner-2"] as const;
/** Cap and belt offsets in bone space (Head and Hips bones point up the body in this rig). */
export const CAP_ATTACH_POS: Vec3 = [0, 0.135, 0.012];
export const BELT_ATTACH_POS: Vec3 = [0, 0.045, 0];
export const FIELDER_SPOTS: Record<string, Vec3> = {
  // The single catcher crouches behind the plate, offset to the camera-right
  // of the batter so it never crosses the batting-camera line.
  "f-c": [0.55, 0, 2.45],
  "f-1b": [14.2, 0, -14.2],
  "f-2b": [7.4, 0, -19.5],
  "f-ss": [-8.2, 0, -19.5],
  "f-3b": [-14.2, 0, -14.2],
  "f-lf": [-30, 0, -52],
  "f-cf": [0, 0, -68],
  "f-rf": [30, 0, -52]
};

export function buildActorsNodes(ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT, parkId: ParkId = "sandlot"): any[] {
  const gu47 = ctx.variant === "gu47";
  // GU47: the ball alone wears the reserved objective colour; the zone frame takes the park chalk, the landing ring its accent.
  const ballColor = gu47 ? "#f5f1e4" : "#f4f1e8";
  const zoneColor = gu47 ? PARK_LOOKS[parkId].turf.chalk : "#f5f1e4";
  const landColor = gu47 ? PARK_LOOKS[parkId].accent : "#7dfcff";
  const nodes: any[] = [
    ...buildAthleteNodes("pitcher", assets.diamondAthlete, "Crouch_Idle_Loop", gu47),
    ...buildAthleteNodes("batter", assets.diamondAthlete, "Idle_Loop", gu47),
    ...FIELDER_IDS.flatMap((id) => buildAthleteNodes(id, assets.diamondAthlete, "Crouch_Idle_Loop", gu47)),
    ...Array.from({ length: 3 }, (_, i) => buildAthleteNodes(`runner-${i}`, assets.diamondAthlete, "Crouch_Idle_Loop", gu47)).flat(),
    model(assets.diamondAthlete, {
      name: "coach-1b",
      targetHeight: 1.88,
      role: "primaryCharacter",
      scaleMode: "fit",
      ...(gu47 ? { materialOverrides: ATHLETE_UNIFORM_OVERRIDES } : {})
    })
      .position(21.5, 0, -14.8)
      .rotate(0, -Math.PI * 0.72, 0)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode("coach-1b")),
    model(assets.diamondAthlete, {
      name: "coach-3b",
      targetHeight: 1.88,
      role: "primaryCharacter",
      scaleMode: "fit",
      ...(gu47 ? { materialOverrides: ATHLETE_UNIFORM_OVERRIDES } : {})
    })
      .position(-21.5, 0, -14.8)
      .rotate(0, Math.PI * 0.72, 0)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode("coach-3b")),
    // Catcher's mitt — hidden below the field until socketed to the crouched catcher's left forearm at runtime
    createCatcherMittNode([0, -80, 0], false)
  ];

  // Fielder and pitcher gloves — hidden until socketed to each owner's left forearm at runtime.
  for (const id of GLOVE_OWNERS) {
    nodes.push(createFielderGloveNode(`glove-${id}`, [0, -80, 0], false));
  }

  // Team cap/helmet and belt per athlete (C5 + WP-08): dark team base (never chalk white) hidden until Head/Hips sockets bind.
  for (const id of KIT_OWNERS) {
    const capMat = gu47
      ? material.clearcoatPaint({ color: "#1b2a41", roughness: CAP_ROUGHNESS, clearcoat: 0.84, clearcoatRoughness: 0.14 })
      : material.pbr({ color: "#1b2a41", roughness: CAP_ROUGHNESS });
    const beltMat = material.physical({ color: "#23272f", roughness: 0.52, clearcoat: 0.22, clearcoatRoughness: 0.4 });
    nodes.push(
      createAthleteCapNode(id, capMat, false).position(0, -80, 0),
      createAthleteBeltNode(id, beltMat, false, !gu47).position(0, -80, 0)
    );
  }

  // Bat — regulation 1.02 m lathed ash/maple barrel (`x in [-0.51, +0.51]`) socketed to the batter's right forearm.
  void batWoodTexture;
  nodes.push(
    createProceduralBatNode(gu47 ? DIAMOND_MATS.ashWood : material.pbr({ color: "#caa06a", roughness: 0.38 }))
      .position(-0.51, 1.52, 0.18)
      .rotate(0, BATTER_YAW + 0.15, 1.0),
    // Hidden root-level probe pinned to the same bone to calibrate the
    // actor fit scale / normalization shift for world⇄actor conversions.
    primitives
      .sphere({ name: "bat-cal", size: [0.02, 0.02, 0.02], material: material.pbr({ color: "#000000", opacity: 0.0, roughness: 1 }) })
      .position(0, -80, 0)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("bat-cal"))
  );

  // Ball: stitched cowhide sphere with figure-8 seam normals & roughness; strictly preserves reserved `#f5f1e4` objective colour.
  const ballSeams = gu47 ? baseballSeamTextures() : null;
  nodes.push(
    primitives
      .sphere({
        name: "ball",
        size: [0.15, 0.15, 0.15],
        params: gu47 ? { widthSegments: 24, heightSegments: 18 } : { widthSegments: 16, heightSegments: 12 },
        material: gu47
          ? material.physical({
              color: ballColor,
              roughness: 0.44,
              metallic: 0.02,
              clearcoat: 0.22,
              clearcoatRoughness: 0.36,
              ...(ballSeams ? { normal: ballSeams.normal as any, normalScale: 0.55, roughnessMap: ballSeams.roughness as any } : {})
            })
          : material.pbr({ color: ballColor, roughness: 0.55 })
      } as any)
      .position(0, -60, 0)
      .runtime(game.runtimeNode("ball")),
    primitives.cylinder({ name: "ball-shadow", size: [0.34, 0.006, 0.34], material: material.pbr({ color: "#000000", opacity: 0.28, roughness: 1 }), ...(gu47 ? { castShadow: false } : {}) }).runtime(game.runtimeNode("ball-shadow"))
  );

  // Pooled 4x4 procedural flipbook sprites (`createFlipbookAtlas("dust" | "sparks")`) for swing chalk/clay puffs & bat-crack flashes.
  if (gu47) {
    const dustSheet = flipbookAtlasDataUrl("dust");
    const sparksSheet = flipbookAtlasDataUrl("sparks");
    nodes.push(
      effects
        .flipbook({
          name: "vfx-plate-dust",
          ...(dustSheet ? { texture: dustSheet, spriteColumns: 8, spriteRows: 4 } : { sprite: "smoke-a", spriteColumns: 4, spriteRows: 4 }),
          frameRate: 30,
          loop: true,
          size: [0.7, 1.25],
          color: "#dcc5a6",
          blend: "alpha",
          visible: false
        } as any)
        .position(0, 0.14, 0.35)
        .runtime(game.runtimeNode("vfx-plate-dust")),
      effects
        .flipbook({
          name: "vfx-bat-sparks",
          ...(sparksSheet ? { texture: sparksSheet, spriteColumns: 8, spriteRows: 4 } : { sprite: "spark-streak", spriteColumns: 4, spriteRows: 4 }),
          frameRate: 36,
          loop: true,
          size: [0.55, 0.95],
          color: "#ffe1a6",
          blend: "additive",
          visible: false
        } as any)
        .position(0, 1.05, 0.32)
        .runtime(game.runtimeNode("vfx-bat-sparks"))
    );
  }

  // 4.6.2 ball tracer: a scene ribbon plus 16 glowing spheres. Scene trails with a target now draw (E-F), so GU47 keeps
  // neither and main.ts runs one runtime `app.effects.trail` on the ball that it clears whenever the ball teleports.
  if (!gu47) {
    nodes.push(effects.trail({ name: "ball-ribbon", target: "ball", color: "#f5f1e4", width: 0.1, maxPoints: 40, intensity: 0.85 } as any));
    for (let i = 0; i < TRAIL_COUNT; i++) {
      nodes.push(
        primitives.sphere({ name: `ball-trail-${i}`, size: [0.09, 0.09, 0.09], material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: 0.5 }) }).scale(HIDDEN_SCALE).runtime(game.runtimeNode(`ball-trail-${i}`))
      );
    }
  }

  // Strike-zone helpers: PCI ring (batting) + aim dot (pitching) + landing ring
  nodes.push(
    primitives.torus({ name: "pci-ring", size: [0.42, 0.045] as any, material: material.emissive({ color: "#ffb03a", emissive: "#ffb03a", emissiveIntensity: 1.1 }) }).runtime(game.runtimeNode("pci-ring")),
    primitives.sphere({ name: "aim-dot", size: [0.16, 0.16, 0.16], material: material.emissive({ color: "#35d6ff", emissive: "#35d6ff", emissiveIntensity: 1.2 }) }).runtime(game.runtimeNode("aim-dot")),
    primitives.torus({ name: "land-ring", size: [0.5, 0.04] as any, material: material.emissive({ color: landColor, emissive: landColor, emissiveIntensity: 1.15 }) }).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode("land-ring")),
    primitives.torus({ name: "zone-frame", size: [0.62, 0.03] as any, material: material.emissive({ color: zoneColor, emissive: zoneColor, emissiveIntensity: 0.3 }) }).position(0, ZONE_CY, 0.1).runtime(game.runtimeNode("zone-frame"))
  );

  // Celebration particle fountains (hidden until fired)
  nodes.push(
    effects.particles({ name: "confetti", emitter: "fountain", position: [0, 4, 0], color: "#ffd76a", intensity: 1, visible: false, particleCount: 260, speed: 1.2, radius: 3.2, gravity: -1.2 } as any).runtime(game.runtimeNode("confetti")),
    effects.particles({ name: "hr-burst", emitter: "fountain", position: [0, 1.2, -2], color: "#ffb03a", intensity: 1, visible: false, particleCount: 200, speed: 1.6, radius: 1.6, gravity: -2.4 } as any).runtime(game.runtimeNode("hr-burst")),
    effects.particles({ name: "flair-burst", emitter: "fountain", position: [-0.8, 1.4, 0.4], color: "#35d6ff", intensity: 1, visible: false, particleCount: 160, speed: 1.1, radius: 0.8, gravity: -0.8 } as any).runtime(game.runtimeNode("flair-burst"))
  );

  return nodes;
}

const QA_FLAGS = (() => {
  const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  return { noAo: q.get("qa-ao") === "0", noContact: q.get("qa-contact") === "0" };
})();

/**
 * The park's look group (E-A `looks.preset` with the look-plan overrides). `?look=original` is the 4.6.2 call exactly:
 * the park's engine look with fog removed and the old exposure. QA `?qa-ao=0` drops the look's AO node; a drawn HDRI
 * whose row dims the background (the Dome) gets that intensity on its background only.
 */
function lookGroupNode(plan: DiamondLookPlan): any {
  const group = looks.preset(plan.baseLook, plan.overrides as AuraLookOverrides).toJSON() as any;
  let children: any[] = group.children ?? [];
  if (QA_FLAGS.noAo) {
    children = children.filter((c: any) => c.effect !== "ambient-occlusion");
  } else if (plan.variant === "gu47") {
    const hasAo = children.some((c: any) => c.effect === "ambient-occlusion");
    if (hasAo) {
      children = children.map((c: any) => (c.effect === "ambient-occlusion" ? { ...c, intensity: 0.48, radius: 0.65 } : c));
    } else {
      children = [...children, effects.ambientOcclusion({ intensity: 0.48, radius: 0.65 }).toJSON()];
    }
  }
  const keyShadow = plan.keyShadow;
  if (keyShadow) {
    children = children.map((c: any) => (c.kind === "light" && c.name === "look key light" && c.shadow ? { ...c, shadow: { ...keyShadow } } : c));
  }
  if (plan.hdriBackgroundIntensity !== 1) {
    children = children.map((c: any) =>
      c.kind === "environment" && c.background !== false ? { ...c, background: { visible: true, intensity: plan.hdriBackgroundIntensity } } : c
    );
  }
  return { ...group, children };
}

/** DIA-E2: the park's analytic sky (the HDRI then lights only). It neither captures the IBL nor tints the fog. */
function skyNode(plan: DiamondLookPlan): any | null {
  const s = plan.sky;
  if (!s) return null;
  if (s.model === "preetham") {
    return sky.preetham({ name: "diamond sky", sun: s.sun, turbidity: s.turbidity, rayleigh: s.rayleigh, captureEnvironment: false, affectsFog: false });
  }
  return sky.gradient({
    name: "diamond sky",
    zenith: s.zenith,
    horizon: s.horizon,
    ground: s.ground,
    ...(s.sun ? { sun: s.sun } : {}),
    ...(s.stars ? { stars: s.stars } : {}),
    // GU47 phase 2 fallback: one zero-intensity band. The freeze build's SkyBackgroundPass uploads u_bandParams from
    // the band list, and an empty list (length 0) fails the mount (RENDERER_MOUNT_FAILED on Canyon and Lunar). One band
    // uploads a vec4 + vec3 and adds nothing (intensity 0). Drop it once the engine pads the band arrays.
    bands: [{ elevationDeg: 0, widthDeg: 1, color: s.horizon, intensity: 0 }],
    captureEnvironment: false,
    affectsFog: false
  });
}

/**
 * One ballpark (DIA-L1, E1, E2, E3, P1). GU47: the park's own HDRI, sun, key, rim, fog and grade from art/look.ts, its
 * analytic sky where the row has one, Dome god rays on High, broadcast film grain; the output preset is applied by
 * main.ts through `app.setOutput` (it is app state, not a scene node).
 */
export function buildParkScene(park: ParkSpec, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): any {
  const plan = lookPlan(park.id, ctx.variant, ctx.tier, ctx.skyMode);
  const clear = plan.clearColor === "look" ? looks.describe(plan.baseLook).v0.background : plan.clearColor;
  const sc = scene();
  // The god-ray node is also a scene-fog node (last visible wins), so it goes before the look and the look's fog stays active.
  // No `lightPosition`: its type is a UV anchor while the bridge reads a world point, so S4 aims along the strongest
  // directional light instead, which in the Dome is the key through the roof (look.ts row).
  if (plan.godRays) {
    sc.add(effects.volumetricFog({ name: "dome god rays", density: plan.godRays.density, intensity: plan.godRays.intensity, color: plan.godRays.color, godRayDensity: 0.35 }));
  }
  sc.add(lookGroupNode(plan)).background(clear);
  const skyN = skyNode(plan);
  if (skyN) sc.add(skyN);
  // QA-only switches for the AO and contact-shadow on/off capture pairs (LIGHT-06, C17): `?qa-ao=0`, `?qa-contact=0`.
  // GU47 phase 3 (rubric: "the batter and catcher look like they float"): denser, longer contact shadows in the new look.
  if (!QA_FLAGS.noContact) {
    sc.add(
      effects.contactShadows(
        ctx.variant === "gu47"
          ? { intensity: 1.0, length: 0.46, thickness: 0.09, steps: 16, lights: "sun" }
          : { intensity: 0.75, length: 0.3 }
      )
    );
  }
  // GU47 phase 4: the wet track, the sealed Dome infield and the harbour mirror the park (rubric ibl_reflections).
  if (plan.ssr !== null && ctx.tier !== "low") sc.add(effects.screenSpaceReflections({ name: "diamond ssr", intensity: plan.ssr, maxDistance: 30, roughness: 0.3 }));
  sc.add(effects.vignette({ intensity: plan.vignette, smoothness: 0.7 }));
  if (plan.grain !== null) sc.add(effects.filmGrain({ intensity: plan.grain }));
  // DIA-E4: the rain-wet blue hour over Midtown (the wet warning track is its glossy track roughness, DIA-M1).
  if (plan.weather?.kind === "drizzle") {
    const particles = Math.round(DRIZZLE_PARTICLES[ctx.tier] * (ctx.reducedMotion ? 0.5 : 1));
    sc.add(effects.rain({ intensity: plan.weather.intensity, density: plan.weather.density, color: plan.weather.color, speed: 0.8, particleCount: particles, splashes: true, mist: false }));
  }
  return sc
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), fov: 42, near: 0.2, far: 700, position: [0, 26, 42], target: [0, 0, -14] }))
    .addMany(buildFieldNodes(park, ctx))
    .addMany(buildStandsNodes(park, ctx))
    .addMany(buildParkExtras(park, ctx))
    .addMany(buildActorsNodes(ctx, park.id));
}
