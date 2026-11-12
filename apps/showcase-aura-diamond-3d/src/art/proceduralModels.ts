/**
 * Procedural multi-material 3D art assembly for Aura Diamond 3D (WP-08).
 *
 * Replaces all 26 static Meshy ballpark, equipment, crowd-prop, and venue-horizon GLBs
 * as well as raw box/cylinder placeholders with curved, multi-material sculptural
 * assemblies authored exclusively with `@aura3d/engine` and `proceduralKernel.ts`
 * (zero `three` imports; WebGPU + WebGL2 dual-backend clean).
 */
import {
  game,
  geometry,
  groups,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  gripQAxis,
  gripQConj,
  gripQFromTo,
  gripQMul,
  gripQRot,
  gripQToEulerZYX,
  gripUnit,
  type GripQuat
} from "@aura3d/engine/game";

type AuraInstanceTransform = AuraTransformSpec;
import {
  archwayVoussoirSlots as kernelArchwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode as kernelAssembleMultiMaterialNode,
  bevelBoxMesh,
  catmullRomSpline3,
  coniferBoughTierMesh as kernelConiferBoughTierMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh as kernelLatticeTrussMesh,
  layeredCanopyMesh as kernelLayeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh as kernelStratifiedCliffMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh as kernelTubeSweepMesh,
  wheelAssemblySlots as kernelWheelAssemblySlots,
  type MultiMatSlot as KernelMultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";

/* -------------------------------------------------------------------------- */
/* Ergonomic Kernel Adapters                                                  */
/* -------------------------------------------------------------------------- */

type MultiMatSlot = {
  readonly mesh: RawMesh;
  readonly material: AuraMaterialSpec;
};

function combineRaw(meshes: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of meshes) {
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i++) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i++) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i++) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i++) indices.push(m.indices[i]! + vOff);
  }
  return { positions, normals, uvs, indices };
}

const place = (src: RawMesh, pos?: V3, rot?: V3, scale?: number | V3): RawMesh =>
  transformMesh(src, { pos, rot, scale });

const box = (wx: number, wy: number, wz: number, bevel = 0.018): RawMesh =>
  bevelBoxMesh(wx, wy, wz, Math.min(bevel, Math.min(wx, wy, wz) * 0.28));

function cyl(rBot: number, rTop: number, height: number, radialSegments = 16): RawMesh {
  const h2 = height * 0.5;
  const pts: V2[] = [
    [0, -h2],
    [Math.max(0.0005, rBot), -h2],
    [Math.max(0.0005, rTop), h2],
    [0, h2]
  ];
  return latheMesh(pts, radialSegments);
}

function ringBand(rInner: number, rOuter: number, height: number, radialSegments = 20): RawMesh {
  const h2 = height * 0.5;
  const pts: V2[] = [
    [rInner, -h2],
    [rOuter, -h2],
    [rOuter, h2],
    [rInner, h2],
    [rInner, -h2]
  ];
  return latheMesh(pts, radialSegments);
}

function rawToSpec(raw: RawMesh): AuraCustomGeometrySpec {
  return mergeRawMeshes([raw]);
}

function tubeSweepMesh(pts: readonly V3[], radius: number, radialSegments = 8): RawMesh {
  return kernelTubeSweepMesh(
    pts.map((p): V4 => [p[0], p[1], p[2], radius]),
    radialSegments,
    true
  );
}

function latticeTrussMesh(opts: {
  readonly span: number;
  readonly width: number;
  readonly depth: number;
  readonly bays: number;
  readonly chordRadius: number;
  readonly braceRadius?: number;
}): RawMesh {
  return kernelLatticeTrussMesh({
    span: [opts.span, opts.width, opts.depth],
    bays: opts.bays,
    chordRadius: opts.chordRadius,
    braceRadius: opts.braceRadius
  });
}

function stratifiedCliffMesh(opts: {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly strataCount: number;
  readonly cols?: number;
  readonly rows?: number;
  readonly seed?: number;
  readonly roughness?: number;
}): RawMesh {
  return kernelStratifiedCliffMesh({
    radiusX: opts.width * 0.5,
    radiusZ: opts.depth * 0.5,
    height: opts.height,
    terraces: opts.strataCount,
    seed: opts.seed
  });
}

function layeredCanopyMesh(opts: {
  readonly radius: number;
  readonly height: number;
  readonly puffCount?: number;
  readonly seed?: number;
}): RawMesh {
  return kernelLayeredCanopyMesh({
    radius: opts.radius,
    height: opts.height,
    puffs: opts.puffCount,
    seed: opts.seed
  });
}

function coniferBoughTierMesh(opts: {
  readonly height: number;
  readonly baseRadius: number;
  readonly tiers?: number;
  readonly lobesPerTier?: number;
  readonly seed?: number;
}): RawMesh {
  return kernelConiferBoughTierMesh({
    baseRadius: opts.baseRadius,
    height: opts.height,
    tiers: opts.tiers,
    seed: opts.seed
  });
}

function archwayVoussoirSlots(opts: {
  readonly archRadius: number;
  readonly thickness: number;
  readonly depth: number;
  readonly pierHeight: number;
  readonly voussoirCount?: number;
  readonly stoneMat: AuraMaterialSpec;
  readonly keystoneMat: AuraMaterialSpec;
}): MultiMatSlot[] {
  const crown = kernelArchwayVoussoirSlots({
    radius: opts.archRadius,
    thickness: opts.thickness,
    depth: opts.depth,
    voussoirs: opts.voussoirCount,
    stoneMatA: 0,
    stoneMatB: 0,
    keystoneMat: 1
  });
  const pierX = opts.archRadius + opts.thickness * 0.5;
  const piers = combineRaw([
    place(box(opts.thickness, opts.pierHeight, opts.depth, 0.03), [-pierX, opts.pierHeight * 0.5, 0]),
    place(box(opts.thickness, opts.pierHeight, opts.depth, 0.03), [pierX, opts.pierHeight * 0.5, 0])
  ]);
  const out: MultiMatSlot[] = [{ mesh: piers, material: opts.stoneMat }];
  for (const s of crown) {
    out.push({
      mesh: place(s.mesh, [0, opts.pierHeight, 0]),
      material: s.materialIndex === 1 ? opts.keystoneMat : opts.stoneMat
    });
  }
  return out;
}

function wheelAssemblySlots(opts: {
  readonly radius: number;
  readonly width: number;
  readonly spokeCount?: number;
  readonly tireMat: AuraMaterialSpec;
  readonly rimMat: AuraMaterialSpec;
  readonly hubMat: AuraMaterialSpec;
}): MultiMatSlot[] {
  const mats = [opts.tireMat, opts.rimMat, opts.hubMat];
  return kernelWheelAssemblySlots({
    radius: opts.radius,
    width: opts.width,
    spokeCount: opts.spokeCount,
    tireMat: 0,
    rimMat: 1,
    rotorMat: 2
  }).map((s) => ({ mesh: s.mesh, material: mats[s.materialIndex] ?? opts.rimMat }));
}

function assembleMultiMaterialNode(
  slots: readonly MultiMatSlot[],
  options: {
    readonly id?: string;
    readonly name: string;
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow?: boolean;
    readonly visible?: boolean;
  }
) {
  const materials: AuraMaterialSpec[] = [];
  const indexed: KernelMultiMatSlot[] = [];
  for (const s of slots) {
    let idx = materials.indexOf(s.material);
    if (idx < 0) {
      idx = materials.length;
      materials.push(s.material);
    }
    indexed.push({ mesh: s.mesh, materialIndex: idx });
  }
  return kernelAssembleMultiMaterialNode(options.name, indexed, materials, options);
}

function withNodeVisible<T extends { toJSON(): unknown; constructor: unknown }>(builder: T, visible: boolean): T {
  if (visible) return builder;
  const Ctor = builder.constructor as new (spec: Record<string, unknown>) => T;
  return new Ctor({ ...(builder.toJSON() as Record<string, unknown>), visible: false });
}

function fitRawToHeight(raw: RawMesh, targetHeight: number, groundAlign = true): RawMesh {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < raw.positions.length; i += 3) {
    const y = raw.positions[i]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(1e-4, maxY - minY);
  const s = targetHeight / span;
  const scaled = place(raw, [0, 0, 0], undefined, s);
  return groundAlign ? place(scaled, [0, -minY * s, 0]) : scaled;
}

/* -------------------------------------------------------------------------- */
/* Curated Multi-Material Ballpark Palette (WebGPU + WebGL2 Clean)            */
/* -------------------------------------------------------------------------- */

export const DIAMOND_MATS = {
  // Hardwood & equipment presets (`lacquer`, `clearcoatPaint`, `brushedMetal`, `fabric`, `blackRubber`)
  ashWood: material.lacquer({ color: "#caa06a", roughness: 0.24, clearcoat: 0.92, clearcoatRoughness: 0.06 }),
  mapleBarrel: material.lacquer({ color: "#7a4424", roughness: 0.22, clearcoat: 0.95, clearcoatRoughness: 0.05 }),
  pineTarGrip: material.blackRubber({ color: "#1c1816", roughness: 0.94 }),
  alloyBat: material.brushedMetal({ color: "#d6dde6", roughness: 0.22, anisotropy: 0.88 }),
  oiledLeather: material.fabric({ color: "#6e3b1e", roughness: 0.62, sheen: 0.36, sheenColor: "#a86b43" }),
  catcherLeather: material.fabric({ color: "#542b16", roughness: 0.58, sheen: 0.38, sheenColor: "#8f5632" }),
  rawhideLace: material.fabric({ color: "#c89b68", roughness: 0.74, sheen: 0.28 }),
  brassHardware: material.studioMetal({ color: "#d4af5a", roughness: 0.24 }),
  // Architectural metals, masonry, glass, & emissive practicals
  trussSteel: material.brushedMetal({ color: "#2b3646", roughness: 0.38, anisotropy: 0.72 }),
  galvanizedSteel: material.brushedMetal({ color: "#8c99a8", roughness: 0.34, anisotropy: 0.8 }),
  ivyGreenSteel: material.clearcoatPaint({ color: "#1e4432", roughness: 0.32, clearcoat: 0.55 }),
  silverCup: material.chrome({ color: "#eef3f8", roughness: 0.06, clearcoat: 0.25 }),
  agedBronze: material.studioMetal({ color: "#6b5338", roughness: 0.36 }),
  goldFoil: material.studioMetal({ color: "#d9a438", roughness: 0.2, envMapIntensity: 1.4 }),
  redBrick: material.matteClay({ color: "#8d3f31", roughness: 0.88 }),
  brownstoneBrick: material.matteClay({ color: "#6f4436", roughness: 0.9 }),
  limestoneTrim: material.pbr({ color: "#d6cfc2", roughness: 0.78, metalness: 0.02 }),
  granitePlinth: material.ceramic({ color: "#4d535c", roughness: 0.34, clearcoat: 0.4 }),
  concreteDeck: material.pbr({ color: "#8b9098", roughness: 0.86, metalness: 0.03 }),
  clockDialIvory: material.ceramic({ color: "#ebe6da", roughness: 0.28, clearcoat: 0.5 }),
  bannerFelt: material.felt({ color: "#1e3a6e", roughness: 0.88, sheen: 0.75 }),
  // WebGPU-clean architectural & habitat glass (NEVER studioGlass with opacity < 1 or transmission: 0)
  suiteGlass: material.physical({ color: "#d4ebf7", roughness: 0.05, opacity: 0.42, clearcoat: 1, ior: 1.5 }),
  darkCurtainGlass: material.physical({ color: "#2b4c66", roughness: 0.08, opacity: 0.56, clearcoat: 1, ior: 1.5 }),
  // Practical emissives (`practical: true` enforced)
  ledAmberRibbon: material.emissive({ color: "#2a1908", emissive: "#ffb338", emissiveIntensity: 1.55, practical: true }),
  halogenBankLit: material.emissive({ color: "#e8eef5", emissive: "#fff2d6", emissiveIntensity: 1.9, practical: true }),
  beaconFresnel: material.emissive({ color: "#fff0c4", emissive: "#ffd97d", emissiveIntensity: 2.2, practical: true }),
  solarWingCell: material.carPaint({ color: "#193b7a", roughness: 0.22, clearcoat: 0.9 })
} as const;

/* -------------------------------------------------------------------------- */
/* 1. Regulation 1.02 m Lathed Baseball Bat & Dugout Bat Rack                 */
/* -------------------------------------------------------------------------- */

let cachedBatSpec: AuraCustomGeometrySpec | undefined;

/**
 * Lathed ash/maple baseball bat spanning exact `x in [-0.51, +0.51]` (`1.02 m` axis along +X):
 * flared safety knob at `-0.51`, pine-tar grip (`r = 0.015`), tapered throat, `r = 0.0335` sweet-spot barrel,
 * and cupped end at `+0.51` matching `batter-pose.ts` (`knob = c - dir * 0.51`, `tip = c + dir * 0.51`).
 */
export function getRegulationBatSpec(): AuraCustomGeometrySpec {
  if (cachedBatSpec) return cachedBatSpec;
  const profile: V2[] = [
    [0.0, -0.51],
    [0.024, -0.508],
    [0.027, -0.497],
    [0.023, -0.486],
    [0.0155, -0.476],
    [0.0148, -0.35],
    [0.0165, -0.22],
    [0.0225, -0.08],
    [0.0305, 0.08],
    [0.0335, 0.24],
    [0.0338, 0.44],
    [0.0325, 0.498],
    [0.0275, 0.51],
    [0.019, 0.497],
    [0.0, 0.495]
  ];
  // `latheMesh` revolves around +Y; rotating -90 deg about Z maps y -> +X (`-0.51` knob -> `x = -0.51`, `+0.51` tip -> `x = +0.51`).
  const raw = place(latheMesh(profile, 22), [0, 0, 0], [0, 0, -Math.PI * 0.5]);
  cachedBatSpec = rawToSpec(raw);
  return cachedBatSpec;
}

export function createProceduralBatNode(batMat?: AuraMaterialSpec) {
  return geometry
    .custom(getRegulationBatSpec(), {
      name: "bat",
      material: batMat ?? DIAMOND_MATS.ashWood,
      castShadow: true
    })
    .position(0, -10, 0)
    .runtime(game.runtimeNode("bat"));
}

/* -------------------------------------------------------------------------- */
/* 2. Athletic Headgear, Belt Buckle, Fielder's Glove, & Catcher's Mitt       */
/* -------------------------------------------------------------------------- */

let cachedCapSpec: AuraCustomGeometrySpec | undefined;
let cachedBeltSpec: AuraCustomGeometrySpec | undefined;

export function getBattingCapHelmetSpec(): AuraCustomGeometrySpec {
  if (cachedCapSpec) return cachedCapSpec;
  const domeProfile: V2[] = [
    [0.108, -0.028],
    [0.114, -0.004],
    [0.111, 0.028],
    [0.096, 0.058],
    [0.064, 0.082],
    [0.018, 0.094],
    [0.0, 0.096]
  ];
  const crown = latheMesh(domeProfile, 18);
  const button = place(cyl(0.014, 0.012, 0.01, 10), [0, 0.098, 0]);
  const billPoly: V2[] = [
    [-0.088, 0.072],
    [-0.076, 0.148],
    [-0.036, 0.178],
    [0.0, 0.186],
    [0.036, 0.178],
    [0.076, 0.148],
    [0.088, 0.072]
  ];
  // `extrudePolygonMesh` extrudes in XY along Z; rotate +90 deg around X so Y -> +Z forward bill!
  const bill = place(extrudePolygonMesh(billPoly, 0.009, 0.003), [0, -0.018, 0], [Math.PI * 0.5 + 0.14, 0, 0]);
  const earGuard = place(box(0.026, 0.068, 0.082, 0.008), [-0.104, -0.038, 0.018], [0, 0.12, -0.08]);
  // Center dome vertically on `y in [-0.058, +0.062]` to match `CAP_ATTACH_POS` on `Head` bone.
  cachedCapSpec = rawToSpec(place(combineRaw([crown, button, bill, earGuard]), [0, -0.034, 0]));
  return cachedCapSpec;
}

export function createAthleteCapNode(id: string, capMat: AuraMaterialSpec, visible = false) {
  return withNodeVisible(
    geometry
      .custom(getBattingCapHelmetSpec(), {
        name: `${id}-cap`,
        material: capMat,
        castShadow: false
      })
      .runtime(game.runtimeNode(`${id}-cap`)),
    visible
  );
}

export function getAthleteBeltSpec(): AuraCustomGeometrySpec {
  if (cachedBeltSpec) return cachedBeltSpec;
  const strap = place(ringBand(0.142, 0.158, 0.038, 20), [0, 0, 0], undefined, [1.06, 1, 0.82]);
  const buckle = place(box(0.064, 0.048, 0.018, 0.004), [0, 0, 0.132]);
  const loops = [
    place(box(0.014, 0.044, 0.016, 0.003), [-0.058, 0, 0.124]),
    place(box(0.014, 0.044, 0.016, 0.003), [0.058, 0, 0.124])
  ];
  cachedBeltSpec = rawToSpec(combineRaw([strap, buckle, ...loops]));
  return cachedBeltSpec;
}

export function createAthleteBeltNode(
  id: string,
  beltMat: AuraMaterialSpec,
  visible = false,
  castShadow = false
) {
  return withNodeVisible(
    geometry
      .custom(getAthleteBeltSpec(), {
        name: `${id}-belt`,
        material: beltMat,
        castShadow
      })
      .runtime(game.runtimeNode(`${id}-belt`)),
    visible
  );
}

let cachedFielderGloveSlots: MultiMatSlot[] | undefined;
let cachedCatcherMittSlots: MultiMatSlot[] | undefined;

function getFielderGloveSlots(): MultiMatSlot[] {
  if (cachedFielderGloveSlots) return cachedFielderGloveSlots;
  const leather: RawMesh[] = [];
  const lace: RawMesh[] = [];
  const brass: RawMesh[] = [];

  // Deep cupped palm shell & heel bolster (`0.34 m` span)
  leather.push(place(box(0.19, 0.048, 0.17, 0.018), [0, -0.02, -0.02], [0.18, 0, 0]));
  leather.push(
    tubeSweepMesh(
      catmullRomSpline3([[-0.095, -0.015, -0.09], [0, -0.022, -0.115], [0.095, -0.015, -0.09]], 10),
      0.026,
      8
    )
  );
  // 4 curved finger stalls + opposable thumb stall
  for (let f = 0; f < 4; f++) {
    const xBase = -0.072 + f * 0.044;
    const len = 0.145 + (f === 1 || f === 2 ? 0.018 : 0);
    const pts: V3[] = [
      [xBase, -0.008, 0.035],
      [xBase * 1.06, 0.028, 0.035 + len * 0.55],
      [xBase * 0.96, 0.068, 0.035 + len]
    ];
    leather.push(tubeSweepMesh(catmullRomSpline3(pts, 10), 0.021 - f * 0.001, 8));
    lace.push(place(cyl(0.005, 0.005, 0.036, 6), [xBase, 0.058, 0.035 + len * 0.88], [0, 0, Math.PI * 0.5]));
  }
  const thumbPts: V3[] = [
    [-0.088, -0.012, -0.02],
    [-0.128, 0.022, 0.048],
    [-0.112, 0.058, 0.118]
  ];
  leather.push(tubeSweepMesh(catmullRomSpline3(thumbPts, 10), 0.025, 8));
  // H-web pocket cross-bars & rawhide lacing
  leather.push(place(box(0.018, 0.075, 0.01, 0.003), [-0.096, 0.036, 0.092], [0.22, 0.25, -0.28]));
  leather.push(place(box(0.052, 0.018, 0.01, 0.003), [-0.094, 0.048, 0.104], [0.15, 0.25, 0.12]));
  lace.push(place(box(0.058, 0.008, 0.009, 0.002), [-0.094, 0.026, 0.084], [0.15, 0.25, 0.12]));
  lace.push(place(box(0.14, 0.014, 0.022, 0.004), [0, 0.006, -0.108]));
  brass.push(place(cyl(0.009, 0.009, 0.008, 8), [0.042, 0.012, -0.108], [Math.PI * 0.5, 0, 0]));

  cachedFielderGloveSlots = [
    { mesh: combineRaw(leather), material: DIAMOND_MATS.oiledLeather },
    { mesh: combineRaw(lace), material: DIAMOND_MATS.rawhideLace },
    { mesh: combineRaw(brass), material: DIAMOND_MATS.brassHardware }
  ];
  return cachedFielderGloveSlots;
}

export function createFielderGloveNode(id: string, pos: V3 = [0, -80, 0], visible = false) {
  return assembleMultiMaterialNode(getFielderGloveSlots(), {
    id,
    name: id,
    position: pos,
    castShadow: true,
    visible
  }).runtime(game.runtimeNode(id));
}

function getCatcherMittSlots(): MultiMatSlot[] {
  if (cachedCatcherMittSlots) return cachedCatcherMittSlots;
  const ringPts: V3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rx = 0.145;
    const rz = 0.158;
    const cupY = 0.028 * (1 - Math.cos(a * 2) * 0.35) + (Math.sin(a) > 0 ? 0.018 : -0.008);
    ringPts.push([Math.cos(a) * rx, cupY, Math.sin(a) * rz]);
  }
  const bolster = tubeSweepMesh(catmullRomSpline3(ringPts, 28, true), 0.036, 10);
  const pocketDish = place(cyl(0.115, 0.132, 0.028, 18), [0, -0.006, 0.008], undefined, [0.92, 1, 1.02]);
  const closedWeb = place(box(0.078, 0.022, 0.095, 0.008), [-0.072, 0.022, 0.068], [0.12, 0.38, -0.14]);
  const wristGuard = place(box(0.13, 0.028, 0.065, 0.009), [0, -0.012, -0.148]);
  const laceRing = place(ringBand(0.128, 0.142, 0.014, 18), [0, 0.032, 0.006], undefined, [0.95, 1, 1.04]);
  const targetPatch = place(cyl(0.034, 0.034, 0.008, 12), [0.008, 0.01, 0.012]);

  cachedCatcherMittSlots = [
    { mesh: combineRaw([bolster, pocketDish, closedWeb, wristGuard]), material: DIAMOND_MATS.catcherLeather },
    { mesh: combineRaw([laceRing, targetPatch]), material: DIAMOND_MATS.rawhideLace },
    { mesh: place(cyl(0.01, 0.01, 0.01, 8), [0.045, 0.006, -0.155], [Math.PI * 0.5, 0, 0]), material: DIAMOND_MATS.brassHardware }
  ];
  return cachedCatcherMittSlots;
}

export function createCatcherMittNode(pos: V3 = [0, -80, 0], visible = false) {
  return assembleMultiMaterialNode(getCatcherMittSlots(), {
    id: "catcher-mitt",
    name: "catcher-mitt",
    position: pos,
    castShadow: true,
    visible
  }).runtime(game.runtimeNode("catcher-mitt"));
}

/* -------------------------------------------------------------------------- */
/* 3. Diamond Field Hardware (`base-bags` & `foul-poles`)                     */
/* -------------------------------------------------------------------------- */

let cachedBaseBagSpec: AuraCustomGeometrySpec | undefined;
let cachedFoulPoleSpec: AuraCustomGeometrySpec | undefined;

export function getQuiltedBaseBagSpec(): AuraCustomGeometrySpec {
  if (cachedBaseBagSpec) return cachedBaseBagSpec;
  // Regulation 15-inch (`0.381 m`) quilted canvas base bag seated on `y = 0` (`y in [0, 0.095]`).
  const cushion = place(box(0.382, 0.076, 0.382, 0.022), [0, 0.048, 0]);
  const topPad = place(box(0.336, 0.018, 0.336, 0.008), [0, 0.086, 0]);
  const stitchA = place(box(0.34, 0.008, 0.016, 0.003), [0, 0.094, 0], [0, Math.PI * 0.25, 0]);
  const stitchB = place(box(0.34, 0.008, 0.016, 0.003), [0, 0.094, 0], [0, -Math.PI * 0.25, 0]);
  const stanchion = place(cyl(0.068, 0.074, 0.022, 12), [0, 0.011, 0]);
  cachedBaseBagSpec = rawToSpec(combineRaw([cushion, topPad, stitchA, stitchB, stanchion]));
  return cachedBaseBagSpec;
}

export function createBaseBagsNode(transforms: readonly AuraInstanceTransform[]) {
  return instances.custom(getQuiltedBaseBagSpec(), {
    name: "base-bags",
    // Warm quilted canvas ivory (`#ebe6da` — distinct from the reserved ball objective colour).
    material: material.pbr({ color: "#ebe6da", roughness: 0.78, metalness: 0.02, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function getLatticeFoulPoleSpec(): AuraCustomGeometrySpec {
  if (cachedFoulPoleSpec) return cachedFoulPoleSpec;
  const plinth = place(cyl(0.28, 0.24, 0.55, 12), [0, 0.275, 0]);
  const lowerMast = place(cyl(0.145, 0.125, 3.2, 14), [0, 1.85, 0]);
  const upperTruss = place(
    latticeTrussMesh({ span: 7.6, width: 0.28, depth: 0.28, bays: 10, chordRadius: 0.028, braceRadius: 0.016 }),
    [0, 3.2 + 3.8, 0],
    [0, 0, Math.PI * 0.5]
  );
  // Cantilevered fair-territory wing screen (`x in [0.16, 0.78]`, `y in [3.2, 10.75]`)
  const wingParts: RawMesh[] = [
    place(box(0.62, 0.045, 0.035, 0.008), [0.47, 3.22, 0]),
    place(box(0.62, 0.045, 0.035, 0.008), [0.47, 10.72, 0]),
    place(cyl(0.022, 0.022, 7.54, 8), [0.76, 6.97, 0])
  ];
  for (let b = 0; b < 9; b++) {
    wingParts.push(place(box(0.6, 0.024, 0.02, 0.004), [0.46, 3.95 + b * 0.76, 0]));
  }
  wingParts.push(place(cyl(0.016, 0.016, 7.5, 6), [0.36, 6.97, 0]));
  wingParts.push(place(cyl(0.016, 0.016, 7.5, 6), [0.56, 6.97, 0]));
  const finial = place(cyl(0.18, 0.04, 0.34, 12), [0, 10.92, 0]);
  cachedFoulPoleSpec = rawToSpec(combineRaw([plinth, lowerMast, upperTruss, ...wingParts, finial]));
  return cachedFoulPoleSpec;
}

export function createFoulPolesNode(transforms: readonly AuraInstanceTransform[]) {
  return instances.custom(getLatticeFoulPoleSpec(), {
    name: "foul-poles",
    material: material.pbr({ color: "#f6c945", roughness: 0.34, metalness: 0.42, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

/* -------------------------------------------------------------------------- */
/* 4. Dugout Shelters & Multi-Deck Cantilevered Ballpark Grandstands          */
/* -------------------------------------------------------------------------- */

let cachedDugoutSpec: AuraCustomGeometrySpec | undefined;
let cachedStadiumShellSpec: AuraCustomGeometrySpec | undefined;

export function getDugoutShelterSpec(): AuraCustomGeometrySpec {
  if (cachedDugoutSpec) return cachedDugoutSpec;
  const parts: RawMesh[] = [
    // Sunken concrete floor apron & rear/end walls (`10.8 m` span x `3.3 m` height x `3.4 m` depth)
    place(box(10.8, 0.24, 3.4, 0.03), [0, 0.12, 0]),
    place(box(10.8, 2.85, 0.28, 0.03), [0, 1.54, -1.56]),
    place(box(0.28, 2.85, 3.4, 0.03), [-5.26, 1.54, 0]),
    place(box(0.28, 2.85, 3.4, 0.03), [5.26, 1.54, 0]),
    // Cantilevered cambered roof deck + ribbed fascia overhang
    place(box(11.3, 0.26, 3.95, 0.04), [0, 3.04, 0.12], [-0.05, 0, 0]),
    place(box(11.36, 0.18, 0.14, 0.02), [0, 3.08, 2.06]),
    // Two-tier players bench + backrest inside shelter
    place(box(8.8, 0.12, 0.48, 0.02), [0, 0.56, -0.82]),
    place(box(8.8, 0.44, 0.08, 0.015), [0, 0.88, -1.06]),
    // Protective padded front safety rail (`+Z` diamond-facing) & vertical steel pickets
    tubeSweepMesh(catmullRomSpline3([[-5.0, 1.12, 1.58], [0, 1.12, 1.58], [5.0, 1.12, 1.58]], 8), 0.065, 10)
  ];
  for (let i = -4; i <= 4; i++) {
    parts.push(place(cyl(0.032, 0.032, 1.06, 8), [i * 1.18, 0.58, 1.58]));
  }
  for (const sx of [-2.6, 0, 2.6]) {
    parts.push(place(cyl(0.055, 0.055, 2.92, 10), [sx, 1.54, 1.52]));
  }
  // Built-in bat rack with 5 vertical lathed bats at home-end corner
  parts.push(place(box(1.15, 0.08, 0.34, 0.015), [4.2, 0.82, -0.35]));
  for (let b = 0; b < 5; b++) {
    parts.push(place(cyl(0.018, 0.031, 0.96, 8), [3.82 + b * 0.19, 0.62, -0.35], [0.08, 0, 0]));
  }
  cachedDugoutSpec = rawToSpec(combineRaw(parts));
  return cachedDugoutSpec;
}

export function createDugoutsNode(transforms: readonly AuraInstanceTransform[], shellColor: AuraColor) {
  return instances.custom(getDugoutShelterSpec(), {
    name: "dugouts",
    material: material.pbr({ color: shellColor, roughness: 0.58, metalness: 0.22, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function getStadiumShellSpec(): AuraCustomGeometrySpec {
  if (cachedStadiumShellSpec) return cachedStadiumShellSpec;
  const parts: RawMesh[] = [];
  // Curved 2-deck ballpark grandstand (`+Z` faces home plate; `27 m` wide x `15.6 m` tall x `13.5 m` deep)
  const arcCols = 7;
  const lowerSections: V3[][] = [];
  const upperSections: V3[][] = [];
  for (let c = 0; c <= arcCols; c++) {
    const u = c / arcCols - 0.5;
    const x = u * 26.5;
    const curveZ = (1 - 4 * u * u) * 1.8;
    lowerSections.push([
      [x, 0.0, 5.2 + curveZ],
      [x, 1.35, 5.2 + curveZ],
      [x, 5.4, -2.4 + curveZ],
      [x, 5.4, -5.2 + curveZ],
      [x, 0.0, -5.2 + curveZ]
    ]);
    upperSections.push([
      [x, 7.6, 0.6 + curveZ],
      [x, 8.35, 0.6 + curveZ],
      [x, 12.8, -5.6 + curveZ],
      [x, 12.8, -6.8 + curveZ],
      [x, 7.6, -6.8 + curveZ]
    ]);
  }
  parts.push(toFlatShaded(loftSectionsMesh(lowerSections, false)));
  parts.push(toFlatShaded(loftSectionsMesh(upperSections, false)));
  // Club/pressbox recessed mezzanine band & fascia ribbons
  parts.push(place(box(26.6, 2.2, 4.6, 0.04), [0, 6.5, -3.4]));
  parts.push(place(box(27.0, 0.58, 0.36, 0.03), [0, 7.75, 1.4]));
  // Cantilevered stadium roof canopy + structural support columns & truss rakers
  parts.push(place(box(27.2, 0.42, 8.6, 0.04), [0, 15.15, -2.2], [0.07, 0, 0]));
  for (let b = -3; b <= 3; b++) {
    const bx = b * 4.15;
    parts.push(place(cyl(0.22, 0.19, 15.0, 10), [bx, 7.5, -6.2]));
    parts.push(place(box(0.24, 0.32, 8.2, 0.02), [bx, 14.8, -2.3], [0.07, 0, 0]));
  }
  cachedStadiumShellSpec = rawToSpec(combineRaw(parts));
  return cachedStadiumShellSpec;
}

export function createStadiumShellsNode(transforms: readonly AuraInstanceTransform[], shellColor: AuraColor) {
  return instances.custom(getStadiumShellSpec(), {
    name: "stadium-shells",
    material: material.pbr({ color: shellColor, roughness: 0.64, metalness: 0.18, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function createIvyGrandstandNode() {
  const brick: RawMesh[] = [
    place(box(26.4, 5.6, 6.8, 0.05), [0, 2.8, -2.2]),
    place(box(1.4, 13.6, 6.8, 0.04), [-12.6, 6.8, -2.2]),
    place(box(1.4, 13.6, 6.8, 0.04), [12.6, 6.8, -2.2])
  ];
  const stone: RawMesh[] = [
    place(box(26.8, 0.48, 7.1, 0.03), [0, 5.72, -2.2]),
    place(box(26.8, 0.44, 0.42, 0.02), [0, 9.1, 1.1])
  ];
  for (const ax of [-8.4, -2.8, 2.8, 8.4]) {
    const arch = archwayVoussoirSlots({
      archRadius: 1.55,
      thickness: 0.44,
      depth: 0.65,
      pierHeight: 2.6,
      voussoirCount: 9,
      stoneMat: DIAMOND_MATS.redBrick,
      keystoneMat: DIAMOND_MATS.limestoneTrim
    });
    for (const slot of arch) {
      const m = place(slot.mesh, [ax, 0, 1.25]);
      if (slot.material === DIAMOND_MATS.limestoneTrim) stone.push(m);
      else brick.push(m);
    }
  }
  const greenSteel: RawMesh[] = [
    place(box(27.2, 0.46, 8.4, 0.04), [0, 13.75, -1.6], [0.08, 0, 0]),
    place(latticeTrussMesh({ span: 26.2, width: 0.55, depth: 0.55, bays: 14, chordRadius: 0.045, braceRadius: 0.025 }), [0, 13.25, 1.8])
  ];
  for (let c = -2; c <= 2; c++) {
    greenSteel.push(place(cyl(0.18, 0.16, 7.8, 10), [c * 5.2, 9.6, 1.1]));
  }
  const pressGlass = place(box(22.4, 2.35, 0.18, 0.02), [0, 7.35, 1.05]);
  return groups.create(
    "ivy-grandstand",
    [
      assembleMultiMaterialNode(
        [
          { mesh: combineRaw(brick), material: DIAMOND_MATS.redBrick },
          { mesh: combineRaw(stone), material: DIAMOND_MATS.limestoneTrim },
          { mesh: combineRaw(greenSteel), material: DIAMOND_MATS.ivyGreenSteel }
        ],
        { name: "ivy-grandstand-body", castShadow: true }
      ),
      geometry.custom(rawToSpec(pressGlass), {
        name: "ivy-grandstand-glass",
        material: DIAMOND_MATS.suiteGlass,
        castShadow: false
      })
    ],
    { position: [0, 0, 26], rotation: [0, Math.PI, 0] }
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Center-Field Scoreboard Gantry & Stadium Floodlight Towers              */
/* -------------------------------------------------------------------------- */

export function createScoreboardGantryNode(rigPos: V3) {
  // Note: `scoreboard-rig` is rotated `[0, Math.PI, 0]`, so local `-Z` faces home plate (`+Z` world).
  // `scoreboard-screen` (`14 x 5.2`) sits at world `[0, 6.2, rigPos[2] + 0.9]` -> local `[0, 6.2, -0.9]`.
  // Keep cabinet front at `local z >= -0.82` so `scoreboard-screen` renders crisp in front with zero occlusion!
  const steel: RawMesh[] = [
    place(latticeTrussMesh({ span: 10.6, width: 0.72, depth: 0.72, bays: 8, chordRadius: 0.055, braceRadius: 0.03 }), [-5.6, 5.3, 0.15], [0, 0, Math.PI * 0.5]),
    place(latticeTrussMesh({ span: 10.6, width: 0.72, depth: 0.72, bays: 8, chordRadius: 0.055, braceRadius: 0.03 }), [5.6, 5.3, 0.15], [0, 0, Math.PI * 0.5]),
    place(latticeTrussMesh({ span: 14.8, width: 0.55, depth: 0.65, bays: 10, chordRadius: 0.045, braceRadius: 0.025 }), [0, 2.85, 0.15]),
    // Rear catwalk deck & handrail (`+Z` local = rear)
    place(box(14.8, 0.12, 0.95, 0.02), [0, 3.35, 0.85]),
    place(box(14.8, 0.06, 0.06, 0.01), [0, 4.25, 1.28])
  ];
  const cabinet: RawMesh[] = [
    // Main cabinet housing behind screen (`z in [-0.78, +0.42]`) + perimeter bezel frame around `14 x 5.2` screen
    place(box(15.2, 6.1, 1.15, 0.05), [0, 6.2, -0.18]),
    place(box(15.4, 0.46, 0.24, 0.03), [0, 9.04, -0.74]),
    place(box(15.4, 0.46, 0.24, 0.03), [0, 3.36, -0.74]),
    place(box(0.58, 6.1, 0.24, 0.03), [-7.42, 6.2, -0.74]),
    place(box(0.58, 6.1, 0.24, 0.03), [7.42, 6.2, -0.74]),
    // Vintage arched clock pediment (`y in [9.25, 11.4]`)
    place(box(6.4, 1.45, 0.88, 0.04), [0, 9.95, -0.22]),
    place(cyl(1.65, 1.65, 0.88, 24), [0, 10.45, -0.22], [Math.PI * 0.5, 0, 0])
  ];
  const plinths: RawMesh[] = [
    place(box(1.35, 0.9, 1.35, 0.04), [-5.6, 0.45, 0.15]),
    place(box(1.35, 0.9, 1.35, 0.04), [5.6, 0.45, 0.15])
  ];
  const clockDial = place(cyl(1.22, 1.22, 0.08, 24), [0, 10.45, -0.68], [Math.PI * 0.5, 0, 0]);
  const brassHands: RawMesh[] = [
    place(ringBand(1.18, 1.3, 0.1, 24), [0, 10.45, -0.7], [Math.PI * 0.5, 0, 0]),
    place(box(0.09, 0.72, 0.05, 0.01), [0, 10.74, -0.74]),
    place(box(0.56, 0.09, 0.05, 0.01), [0.24, 10.45, -0.74], [0, 0, -0.35])
  ];
  const ledRibbon = place(box(14.4, 0.28, 0.12, 0.02), [0, 2.96, -0.76]);

  return assembleMultiMaterialNode(
    [
      { mesh: combineRaw(steel), material: DIAMOND_MATS.trussSteel },
      { mesh: combineRaw(cabinet), material: DIAMOND_MATS.ivyGreenSteel },
      { mesh: combineRaw(plinths), material: DIAMOND_MATS.concreteDeck },
      { mesh: clockDial, material: DIAMOND_MATS.clockDialIvory },
      { mesh: combineRaw(brassHands), material: DIAMOND_MATS.brassHardware },
      { mesh: ledRibbon, material: DIAMOND_MATS.ledAmberRibbon }
    ],
    {
      id: "scoreboard-rig",
      name: "scoreboard-rig",
      position: rigPos,
      rotation: [0, Math.PI, 0],
      castShadow: true
    }
  ).runtime(game.runtimeNode("scoreboard-rig"));
}

function buildFloodTowerParts(height: number): {
  steel: RawMesh;
  plinth: RawMesh;
  lenses: RawMesh;
} {
  const mastH = Math.max(6, height - 2.6);
  const plinth = place(box(1.75, 1.1, 1.75, 0.05), [0, 0.55, 0]);
  const mast = place(
    latticeTrussMesh({
      span: mastH,
      width: 1.08,
      depth: 1.08,
      bays: Math.max(6, Math.round(mastH / 2.2)),
      chordRadius: 0.058,
      braceRadius: 0.03
    }),
    [0, 1.0 + mastH * 0.5, 0],
    [0, 0, Math.PI * 0.5]
  );
  const headY = 1.0 + mastH;
  const catwalk = place(box(5.4, 0.16, 1.55, 0.02), [0, headY - 0.15, 0.15]);
  const rail = place(box(5.4, 0.06, 0.06, 0.01), [0, headY + 0.65, 0.88]);
  const frame: RawMesh[] = [
    mast,
    catwalk,
    rail,
    place(box(5.2, 0.18, 0.22, 0.02), [0, headY + 0.55, -0.18]),
    place(box(5.2, 0.18, 0.22, 0.02), [0, headY + 1.45, -0.32]),
    place(box(0.2, 1.55, 0.24, 0.02), [-2.45, headY + 0.95, -0.24], [-0.22, 0, 0]),
    place(box(0.2, 1.55, 0.24, 0.02), [2.45, headY + 0.95, -0.24], [-0.22, 0, 0])
  ];
  const lenses: RawMesh[] = [];
  // 2x5 bank of angled parabolic floodlight hoods aimed `-Z` toward the diamond
  for (let row = 0; row < 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const lx = col * 0.96;
      const ly = headY + 0.58 + row * 0.88;
      const lz = -0.32 - row * 0.14;
      frame.push(place(cyl(0.22, 0.31, 0.34, 10), [lx, ly, lz], [-Math.PI * 0.5 - 0.34, 0, 0]));
      lenses.push(place(cyl(0.27, 0.27, 0.06, 10), [lx, ly - 0.06, lz - 0.16], [-Math.PI * 0.5 - 0.34, 0, 0]));
    }
  }
  return { steel: combineRaw(frame), plinth, lenses: combineRaw(lenses) };
}

const floodSpecCache = new Map<number, AuraCustomGeometrySpec>();

export function getFloodTowerSpec(height = 16): AuraCustomGeometrySpec {
  const key = Math.round(height * 10);
  const hit = floodSpecCache.get(key);
  if (hit) return hit;
  const { steel, plinth, lenses } = buildFloodTowerParts(height);
  const spec = rawToSpec(combineRaw([steel, plinth, lenses]));
  floodSpecCache.set(key, spec);
  return spec;
}

export function createFloodTowersInstancedNode(
  name: string,
  transforms: readonly AuraInstanceTransform[],
  height = 16
) {
  return instances.custom(getFloodTowerSpec(height), {
    name,
    material: material.metal({ color: "#434f60", roughness: 0.42, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function createFloodTowerNode(
  name: string,
  pos: V3,
  rot: V3,
  height = 16,
  litColor?: AuraColor
) {
  const { steel, plinth, lenses } = buildFloodTowerParts(height);
  const lensMat = litColor
    ? material.emissive({ color: "#eef4fb", emissive: litColor, emissiveIntensity: 1.85, practical: true })
    : DIAMOND_MATS.silverCup;
  return assembleMultiMaterialNode(
    [
      { mesh: steel, material: DIAMOND_MATS.trussSteel },
      { mesh: plinth, material: DIAMOND_MATS.concreteDeck },
      { mesh: lenses, material: lensMat }
    ],
    { name, position: pos, rotation: rot, castShadow: true }
  );
}

export function createBoulevardLampNode(name: string, pos: V3, height = 6) {
  const postProfile: V2[] = [
    [0.24, 0.0],
    [0.21, 0.45],
    [0.14, 0.65],
    [0.085, height - 0.85],
    [0.12, height - 0.65],
    [0.06, height - 0.45],
    [0.0, height - 0.42]
  ];
  const iron = combineRaw([
    latheMesh(postProfile, 14),
    tubeSweepMesh(catmullRomSpline3([[-0.68, height - 0.62, 0], [0, height - 0.44, 0], [0.68, height - 0.62, 0]], 10), 0.036, 8)
  ]);
  const globes = combineRaw([
    place(icosphereFacetMesh(0.24, 1, 0, 3), [-0.68, height - 0.36, 0]),
    place(icosphereFacetMesh(0.24, 1, 0, 5), [0.68, height - 0.36, 0])
  ]);
  return assembleMultiMaterialNode(
    [
      { mesh: iron, material: DIAMOND_MATS.trussSteel },
      { mesh: globes, material: DIAMOND_MATS.halogenBankLit }
    ],
    { name, position: pos, castShadow: true }
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Articulated Ballpark Spectators (`stand-fans`, `stand-fans-b`, skin/cap) */
/* -------------------------------------------------------------------------- */

interface CachedSpectatorSpecs {
  readonly jerseyA: AuraCustomGeometrySpec;
  readonly jerseyB: AuraCustomGeometrySpec;
  readonly skin: AuraCustomGeometrySpec;
  readonly attire: AuraCustomGeometrySpec;
}

let cachedSpectatorSpecs: CachedSpectatorSpecs | undefined;

function getBallparkSpectatorSpecs(): CachedSpectatorSpecs {
  if (cachedSpectatorSpecs) return cachedSpectatorSpecs;
  const height = 1.34;
  const s = height / 1.72;
  // Multi-slot articulated human figure from `proceduralKernel.ts`: two legs + shoes, tailored jersey/coat,
  // collar + belt trim, two bent arms + hands, sculpted neck + head, and brimmed cap.
  const folk = articulatedFolkSlots({
    height,
    coatMat: 0,
    trimMat: 1,
    skinMat: 2,
    hairHatMat: 3,
    trouserMat: 4,
    shoeMat: 4,
    wearingHat: true,
    seed: 11
  });

  const coatParts = folk.filter((slot) => slot.materialIndex === 0).map((slot) => slot.mesh);
  const trimParts = folk.filter((slot) => slot.materialIndex === 1).map((slot) => slot.mesh);
  const skinParts = folk.filter((slot) => slot.materialIndex === 2).map((slot) => slot.mesh);
  const hatParts = folk.filter((slot) => slot.materialIndex === 3).map((slot) => slot.mesh);
  const legShoeParts = folk.filter((slot) => slot.materialIndex === 4).map((slot) => slot.mesh);

  // `coatParts` = [torso, leftArm, rightArm]; `skinParts` = [leftHand, rightHand, neck, head].
  const torsoAndLeftArm = [coatParts[0]!, coatParts[1]!, ...trimParts];
  const rightRestArm = coatParts[2]!;
  const stadiumCup = place(cyl(0.032 * s, 0.038 * s, 0.095 * s, 8), [0.22 * s, 0.79 * s, 0.12 * s]);

  // Variant B raises the right arm in a cheering rally salute holding a team pennant.
  const rightRallyArm = tubeSweepMesh(
    catmullRomSpline3(
      [
        [0.225 * s, 1.29 * s, 0],
        [0.28 * s, 1.48 * s, 0.06 * s],
        [0.23 * s, 1.68 * s, 0.12 * s]
      ],
      9
    ),
    0.048 * s,
    8
  );
  const rallyPennant = place(
    extrudePolygonMesh(
      [
        [0, -0.055 * s],
        [0.22 * s, 0],
        [0, 0.055 * s]
      ],
      0.014 * s
    ),
    [0.24 * s, 1.71 * s, 0.13 * s],
    [0.12, 0.18, -0.22]
  );

  // Forward ballpark cap visor (`+Z` faces home plate) paired with `hatParts` + trousers + shoes.
  const capVisor = place(
    box(0.145 * s, 0.018 * s, 0.115 * s, 0.004),
    [0, 1.615 * s, 0.108 * s],
    [0.16, 0, 0]
  );
  const sharedSkin = [skinParts[0]!, skinParts[2]!, skinParts[3]!];

  cachedSpectatorSpecs = {
    jerseyA: mergeRawMeshes([...torsoAndLeftArm, rightRestArm, stadiumCup]),
    jerseyB: mergeRawMeshes([...torsoAndLeftArm, rightRallyArm, rallyPennant]),
    skin: mergeRawMeshes(sharedSkin),
    attire: mergeRawMeshes([...hatParts, capVisor, ...legShoeParts])
  };
  return cachedSpectatorSpecs;
}

export function getSeatedFanVariantASpec(): AuraCustomGeometrySpec {
  return getBallparkSpectatorSpecs().jerseyA;
}

export function getSeatedFanVariantBSpec(): AuraCustomGeometrySpec {
  return getBallparkSpectatorSpecs().jerseyB;
}

export function createSeatedFansBatchNode(
  name: string,
  variant: "a" | "b",
  transforms: readonly AuraInstanceTransform[],
  colors: readonly AuraColor[]
) {
  const specs = getBallparkSpectatorSpecs();
  return instances.custom(variant === "a" ? specs.jerseyA : specs.jerseyB, {
    name,
    // Strictly `clearcoat: 0, sheen: 0` on high-count (`>16`) instanced spectator draws!
    material: material.pbr({ color: "#ffffff", roughness: 0.78, metalness: 0.02, clearcoat: 0, sheen: 0 }),
    castShadow: false,
    transforms: [...transforms],
    colors: [...colors]
  });
}

export function createBallparkSpectatorsNodes(opts: {
  readonly transformsA: readonly AuraInstanceTransform[];
  readonly colorsA: readonly AuraColor[];
  readonly transformsB: readonly AuraInstanceTransform[];
  readonly colorsB: readonly AuraColor[];
  readonly allTransforms: readonly AuraInstanceTransform[];
  readonly skinColors: readonly AuraColor[];
  readonly attireColors: readonly AuraColor[];
}) {
  const specs = getBallparkSpectatorSpecs();
  const jerseyMat = material.pbr({ color: "#ffffff", roughness: 0.78, metalness: 0.02, clearcoat: 0, sheen: 0 });
  const skinMat = material.pbr({ color: "#ffffff", roughness: 0.68, metalness: 0.0, clearcoat: 0, sheen: 0 });
  const attireMat = material.pbr({ color: "#ffffff", roughness: 0.84, metalness: 0.02, clearcoat: 0, sheen: 0 });
  return [
    instances.custom(specs.jerseyA, {
      name: "stand-fans",
      material: jerseyMat,
      castShadow: false,
      transforms: [...opts.transformsA],
      colors: [...opts.colorsA]
    }),
    instances.custom(specs.jerseyB, {
      name: "stand-fans-b",
      material: jerseyMat,
      castShadow: false,
      transforms: [...opts.transformsB],
      colors: [...opts.colorsB]
    }),
    instances.custom(specs.skin, {
      name: "stand-fans-skin",
      material: skinMat,
      castShadow: false,
      transforms: [...opts.allTransforms],
      colors: [...opts.skinColors]
    }),
    instances.custom(specs.attire, {
      name: "stand-fans-attire",
      material: attireMat,
      castShadow: false,
      transforms: [...opts.allTransforms],
      colors: [...opts.attireColors]
    })
  ];
}

/* -------------------------------------------------------------------------- */
/* 7. Far Horizon Band Unit Meshes (`midtown-far-blocks`, `lunar-crater-rim`) */
/* -------------------------------------------------------------------------- */

let cachedMidtownBlockSpec: AuraCustomGeometrySpec | undefined;
let cachedLunarRimSpec: AuraCustomGeometrySpec | undefined;

export function getMidtownFarBlockSpec(): AuraCustomGeometrySpec {
  if (cachedMidtownBlockSpec) return cachedMidtownBlockSpec;
  // Unit-centered (`x,z in [-0.5, +0.5]`, `y in [-0.5, +0.5]`) so `horizon.ts` `scale: [w, h, d]` & `y = h/2` map 1:1!
  const podium = place(box(1.0, 0.68, 1.0, 0.02), [0, -0.16, 0]);
  const setback = place(box(0.76, 0.24, 0.76, 0.02), [0, 0.28, 0]);
  const crown = place(box(0.48, 0.12, 0.48, 0.015), [0, 0.44, 0]);
  cachedMidtownBlockSpec = rawToSpec(combineRaw([podium, setback, crown]));
  return cachedMidtownBlockSpec;
}

export function getLunarCraterRimSpec(): AuraCustomGeometrySpec {
  if (cachedLunarRimSpec) return cachedLunarRimSpec;
  const raw = stratifiedCliffMesh({
    width: 1.0,
    height: 1.0,
    depth: 1.0,
    strataCount: 4,
    cols: 12,
    rows: 8,
    seed: 41,
    roughness: 0.24
  });
  // Shift `y in [0, 1]` to `[-0.5, +0.5]` so `horizon.ts` `position[1] = h/2, scale[1] = h` plants base at `y = 0`.
  cachedLunarRimSpec = rawToSpec(place(raw, [0, -0.5, 0]));
  return cachedLunarRimSpec;
}

/* -------------------------------------------------------------------------- */
/* 8. Venue Landmarks — Harbor (`sandlot`) & Midtown (`skyline`)              */
/* -------------------------------------------------------------------------- */

export function createHarborLighthouseNode(pos: V3, rotY: number) {
  // 24 m iconic red-and-ivory coastal lighthouse with keeper's cottage, gallery rail, lantern glass, & beacon
  const granite = combineRaw([
    place(cyl(3.8, 3.4, 2.2, 18), [0, 1.1, 0]),
    place(cyl(2.35, 2.55, 0.45, 18), [0, 18.8, 0]),
    place(box(4.6, 3.2, 3.8, 0.06), [3.4, 1.6, 0.6])
  ]);
  const ivoryBands = combineRaw([
    place(cyl(3.32, 2.98, 4.2, 18), [0, 4.3, 0]),
    place(cyl(2.68, 2.36, 4.2, 18), [0, 12.7, 0]),
    place(box(4.3, 2.6, 3.5, 0.05), [3.4, 2.4, 0.6])
  ]);
  const crimsonBands = combineRaw([
    place(cyl(2.98, 2.68, 4.2, 18), [0, 8.5, 0]),
    place(cyl(2.36, 2.08, 3.8, 18), [0, 16.7, 0]),
    place(box(4.9, 1.15, 4.1, 0.04), [3.4, 4.1, 0.6], [0, 0, 0.06])
  ]);
  const ironCupola = combineRaw([
    place(ringBand(2.32, 2.46, 0.95, 18), [0, 19.45, 0]),
    place(cyl(1.88, 0.12, 2.1, 16), [0, 22.35, 0]),
    place(cyl(0.05, 0.02, 1.1, 8), [0, 23.6, 0])
  ]);
  const lanternGlass = place(cyl(1.68, 1.68, 2.35, 16), [0, 20.2, 0]);
  const fresnel = place(cyl(0.76, 0.76, 1.25, 14), [0, 20.2, 0]);

  const crimsonMat = material.matteClay({ color: "#b83b32", roughness: 0.78 });
  const ivoryMat = material.pbr({ color: "#eae4d7", roughness: 0.74, metalness: 0.02 });

  return groups.create(
    "harbor-lighthouse",
    [
      assembleMultiMaterialNode(
        [
          { mesh: granite, material: DIAMOND_MATS.granitePlinth },
          { mesh: ivoryBands, material: ivoryMat },
          { mesh: crimsonBands, material: crimsonMat },
          { mesh: ironCupola, material: DIAMOND_MATS.trussSteel },
          { mesh: fresnel, material: DIAMOND_MATS.beaconFresnel }
        ],
        { name: "harbor-lighthouse-body", castShadow: true }
      ),
      geometry.custom(rawToSpec(lanternGlass), {
        name: "harbor-lighthouse-glass",
        material: DIAMOND_MATS.suiteGlass,
        castShadow: false
      })
    ],
    { position: pos, rotation: [0, rotY, 0] }
  );
}

export function createHarborPierNode(pos: V3, rotY: number) {
  const timber: RawMesh[] = [
    place(box(11.6, 0.42, 18.4, 0.04), [0, 2.8, 0]),
    place(box(12.0, 0.34, 0.32, 0.03), [0, 3.05, 9.1]),
    place(box(0.32, 0.34, 18.4, 0.03), [-5.75, 3.05, 0]),
    place(box(0.32, 0.34, 18.4, 0.03), [5.75, 3.05, 0]),
    // Cargo crates on pier apron
    place(box(1.5, 1.35, 1.5, 0.04), [-3.2, 3.68, 5.2], [0, 0.22, 0]),
    place(box(1.25, 1.15, 1.25, 0.04), [-1.6, 3.58, 5.8], [0, -0.18, 0])
  ];
  for (const px of [-4.8, -1.6, 1.6, 4.8]) {
    for (const pz of [-7.8, -2.6, 2.6, 7.8]) {
      timber.push(place(cyl(0.28, 0.25, 3.4, 10), [px, 1.4, pz]));
    }
  }
  const boathouseWall = place(box(7.2, 5.2, 8.6, 0.05), [0.4, 5.6, -3.2]);
  const boathouseRoof = combineRaw([
    place(box(4.3, 0.28, 9.2, 0.03), [-1.5, 8.95, -3.2], [0, 0, 0.42]),
    place(box(4.3, 0.28, 9.2, 0.03), [2.3, 8.95, -3.2], [0, 0, -0.42])
  ]);
  const bollards: RawMesh[] = [];
  for (const bz of [-6.5, 0, 6.5]) {
    bollards.push(place(cyl(0.24, 0.2, 0.68, 10), [-5.3, 3.35, bz]));
    bollards.push(place(cyl(0.24, 0.2, 0.68, 10), [5.3, 3.35, bz]));
  }
  const weatheredWood = material.pbr({ color: "#6d5239", roughness: 0.88, metalness: 0.02 });
  const clapboard = material.matteClay({ color: "#cfd6dd", roughness: 0.82 });
  return assembleMultiMaterialNode(
    [
      { mesh: combineRaw(timber), material: weatheredWood },
      { mesh: boathouseWall, material: clapboard },
      { mesh: boathouseRoof, material: DIAMOND_MATS.redBrick },
      { mesh: combineRaw(bollards), material: DIAMOND_MATS.trussSteel }
    ],
    { name: "harbor-pier", position: pos, rotation: [0, rotY, 0], castShadow: true }
  );
}

export function createHarborWindmillNode(name: string, pos: V3, rotY: number, height = 19) {
  const s = height / 19;
  const baseStone = place(cyl(3.8 * s, 3.2 * s, 4.2 * s, 8), [0, 2.1 * s, 0]);
  const shingleBody = place(cyl(3.15 * s, 1.95 * s, 10.4 * s, 8), [0, 9.4 * s, 0]);
  const domeCap = place(latheMesh([[0, 2.4 * s], [0.9 * s, 2.1 * s], [1.85 * s, 1.1 * s], [2.05 * s, 0], [0, 0]], 14), [0, 14.6 * s, 0]);
  const sails: RawMesh[] = [place(cyl(0.24 * s, 0.2 * s, 1.8 * s, 10), [0, 15.3 * s, 1.9 * s], [Math.PI * 0.5, 0, 0])];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.38;
    const arm = combineRaw([
      place(box(0.22 * s, 7.2 * s, 0.16 * s, 0.02), [0, 3.8 * s, 0]),
      place(box(1.15 * s, 5.4 * s, 0.06 * s, 0.01), [0.58 * s, 4.4 * s, 0.04 * s])
    ]);
    sails.push(place(arm, [0, 15.3 * s, 2.55 * s], [0, 0, a]));
  }
  return assembleMultiMaterialNode(
    [
      { mesh: baseStone, material: DIAMOND_MATS.limestoneTrim },
      { mesh: shingleBody, material: DIAMOND_MATS.brownstoneBrick },
      { mesh: domeCap, material: DIAMOND_MATS.trussSteel },
      { mesh: combineRaw(sails), material: DIAMOND_MATS.ashWood }
    ],
    { name, position: pos, rotation: [0, rotY, 0], castShadow: true }
  );
}

export function createHarborBayBridgeNode(pos: V3 = [144, 0, -237], rotY = -0.074) {
  const steel: RawMesh[] = [
    place(box(196, 1.8, 5.8, 0.08), [0, 13.5, 0]),
    place(latticeTrussMesh({ span: 192, width: 2.0, depth: 5.6, bays: 24, chordRadius: 0.15, braceRadius: 0.085 }), [0, 12.3, 0])
  ];
  const caissons: RawMesh[] = [];
  for (const tx of [-54, 54]) {
    caissons.push(place(box(7.8, 7.2, 10.5, 0.12), [tx, 3.0, 0]));
    for (const tz of [-2.5, 2.5]) {
      steel.push(
        place(
          latticeTrussMesh({ span: 36, width: 2.2, depth: 2.2, bays: 9, chordRadius: 0.2, braceRadius: 0.1 }),
          [tx, 23.5, tz],
          [0, 0, Math.PI * 0.5]
        )
      );
    }
    steel.push(place(box(2.4, 1.6, 7.6, 0.06), [tx, 28.5, 0]));
    steel.push(place(box(2.4, 1.6, 7.6, 0.06), [tx, 40.4, 0]));
  }
  // Catenary main suspension cables & vertical suspenders
  for (const cz of [-2.5, 2.5]) {
    const centerPts: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const x = -54 + u * 108;
      const sag = 40.8 - (1 - Math.pow((u - 0.5) * 2, 2)) * 24.5;
      centerPts.push([x, sag, cz]);
      if (i > 0 && i < 12) {
        const h = Math.max(1.2, sag - 14.3);
        steel.push(place(cyl(0.06, 0.06, h, 6), [x, 14.3 + h * 0.5, cz]));
      }
    }
    steel.push(tubeSweepMesh(catmullRomSpline3(centerPts, 24), 0.2, 8));
    steel.push(tubeSweepMesh(catmullRomSpline3([[-96, 14.6, cz], [-76, 25.0, cz], [-54, 40.8, cz]], 12), 0.18, 8));
    steel.push(tubeSweepMesh(catmullRomSpline3([[54, 40.8, cz], [76, 25.0, cz], [96, 14.6, cz]], 12), 0.18, 8));
  }
  const bridgePaint = material.clearcoatPaint({ color: "#9e3b2b", roughness: 0.4, clearcoat: 0.35 });
  return assembleMultiMaterialNode(
    [
      { mesh: combineRaw(steel), material: bridgePaint },
      { mesh: combineRaw(caissons), material: DIAMOND_MATS.concreteDeck }
    ],
    { name: "sandlot-bay-bridge", position: pos, rotation: [0, rotY, 0], castShadow: false }
  );
}

export function createHarborBrickArcadeNode(
  bays: readonly { readonly pos: V3; readonly rotY: number; readonly span: number }[]
) {
  const brick: RawMesh[] = [];
  const coping: RawMesh[] = [];
  for (const bay of bays) {
    const archSlots = archwayVoussoirSlots({
      archRadius: Math.max(1.8, bay.span * 0.38),
      thickness: 0.65,
      depth: 1.4,
      pierHeight: 4.1,
      voussoirCount: 9,
      stoneMat: DIAMOND_MATS.redBrick,
      keystoneMat: DIAMOND_MATS.limestoneTrim
    });
    for (const s of archSlots) {
      const m = place(s.mesh, bay.pos, [0, bay.rotY, 0]);
      if (s.material === DIAMOND_MATS.limestoneTrim) coping.push(m);
      else brick.push(m);
    }
    coping.push(place(box(bay.span + 0.4, 0.34, 1.62, 0.04), [bay.pos[0], 7.05, bay.pos[2]], [0, bay.rotY, 0]));
  }
  return assembleMultiMaterialNode(
    [
      { mesh: combineRaw(brick), material: DIAMOND_MATS.redBrick },
      { mesh: combineRaw(coping), material: DIAMOND_MATS.limestoneTrim }
    ],
    { name: "sandlot-brick-arcade", castShadow: false }
  );
}

export function createHarborSailboatsNodes(
  boats: readonly (readonly [number, number, number, number])[],
  waterY = 0.12
) {
  // Lofted chined yacht hull + mast (`sandlot-sailboats-hulls`) & cambered mainsail (`sandlot-sailboats-sails`)
  const hullSections: V3[][] = [
    [[0, 0.45, 2.3], [0.08, 0.85, 2.45], [-0.08, 0.85, 2.45]],
    [[0, -0.15, 0.9], [0.82, 0.72, 0.9], [-0.82, 0.72, 0.9]],
    [[0, -0.22, -0.8], [0.88, 0.68, -0.8], [-0.88, 0.68, -0.8]],
    [[0, 0.1, -2.1], [0.58, 0.66, -2.1], [-0.58, 0.66, -2.1]]
  ];
  const hullRaw = combineRaw([
    toFlatShaded(loftSectionsMesh(hullSections, true)),
    place(box(1.1, 0.42, 1.6, 0.04), [0, 0.82, -0.35]),
    place(cyl(0.06, 0.04, 6.2, 8), [0, 3.4, 0.25])
  ]);
  const sailPoly: V2[] = [
    [0.0, 0.0],
    [0.08, 5.1],
    [2.35, 0.35]
  ];
  const sailRaw = place(extrudePolygonMesh(sailPoly, 0.06, 0.01), [0, 1.05, 0.25], [0, Math.PI * 0.5, 0]);
  return [
    instances.custom(rawToSpec(hullRaw), {
      name: "sandlot-sailboats-hulls",
      material: material.pbr({ color: "#22384f", roughness: 0.36, metalness: 0.08, clearcoat: 0, sheen: 0 }),
      castShadow: false,
      transforms: boats.map(([bx, bz, ry, s]) => ({
        position: [bx, waterY + 0.15 * s, bz] as V3,
        rotation: [0, ry, 0] as V3,
        scale: [s, s, s] as V3
      }))
    }),
    instances.custom(rawToSpec(sailRaw), {
      name: "sandlot-sailboats-sails",
      // Sunlit sailcloth cream (`#e8d5b8` — distinct from the reserved ball objective colour)
      material: material.pbr({ color: "#e8d5b8", roughness: 0.72, metalness: 0.01, clearcoat: 0, sheen: 0 }),
      castShadow: false,
      transforms: boats.map(([bx, bz, ry, s]) => ({
        position: [bx, waterY + 0.15 * s, bz] as V3,
        rotation: [0, ry, 0] as V3,
        scale: [s, s, s] as V3
      }))
    })
  ];
}

export function createHarborRocksInstancedNode(transforms: readonly AuraInstanceTransform[]) {
  const stack = fitRawToHeight(
    stratifiedCliffMesh({ width: 5.4, height: 4.5, depth: 4.8, strataCount: 5, cols: 14, rows: 10, seed: 19, roughness: 0.28 }),
    4.5
  );
  return instances.custom(rawToSpec(stack), {
    name: "harbor-rocks",
    material: material.pbr({ color: "#5e6570", roughness: 0.88, metalness: 0.04, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function createSkylineTowerNode(
  name: string,
  pos: V3,
  w: number,
  h: number,
  d: number,
  idx: number
) {
  const podiumH = Math.min(8.5, h * 0.16);
  const shaftH = h * 0.68;
  const crownH = h - podiumH - shaftH;
  const stone = combineRaw([
    place(box(w * 1.06, podiumH, d * 1.06, 0.08), [0, podiumH * 0.5, 0]),
    place(box(w * 0.84, crownH, d * 0.84, 0.06), [0, podiumH + shaftH + crownH * 0.5, 0])
  ]);
  const curtain = place(box(w * 0.96, shaftH, d * 0.96, 0.06), [0, podiumH + shaftH * 0.5, 0]);
  const mullions: RawMesh[] = [place(cyl(0.18, 0.05, 7.5, 8), [0, h + 3.75, 0])];
  for (let m = -2; m <= 2; m++) {
    mullions.push(place(box(0.32, shaftH + crownH * 0.7, d * 0.99, 0.02), [m * (w * 0.2), podiumH + (shaftH + crownH * 0.7) * 0.5, 0]));
  }
  const litWindows: RawMesh[] = [];
  const bandCount = 5;
  for (let b = 0; b < bandCount; b++) {
    if ((b + idx) % 2 === 0) {
      const by = podiumH + shaftH * (0.14 + b * 0.18);
      litWindows.push(place(box(w * 0.98, 1.45, d * 0.98, 0.02), [0, by, 0]));
    }
  }
  const winGlow = material.emissive({
    color: idx % 2 === 0 ? "#243b55" : "#2e281d",
    emissive: idx % 2 === 0 ? "#7cc6fe" : "#ffd28a",
    emissiveIntensity: 0.95,
    practical: true
  });
  const facadeMat = material.pbr({ color: idx % 2 === 0 ? "#1b283a" : "#232e42", roughness: 0.42, metalness: 0.35 });
  return assembleMultiMaterialNode(
    [
      { mesh: stone, material: DIAMOND_MATS.granitePlinth },
      { mesh: curtain, material: facadeMat },
      { mesh: combineRaw(mullions), material: DIAMOND_MATS.galvanizedSteel },
      { mesh: combineRaw(litWindows), material: winGlow }
    ],
    { name, position: pos, castShadow: true }
  );
}

export function createWindowTargetNode(i: number, pos: V3, rotY: number) {
  const frame = combineRaw([
    box(7.5, 4.6, 0.42, 0.04),
    place(ringBand(1.15, 1.45, 0.52, 20), [0, 0, 0], [Math.PI * 0.5, 0, 0]),
    place(cyl(0.45, 0.45, 0.54, 16), [0, 0, 0], [Math.PI * 0.5, 0, 0])
  ]);
  return geometry
    .custom(rawToSpec(frame), {
      name: `window-target-${i}`,
      material: material.emissive({ color: "#16324a", emissive: "#35d6ff", emissiveIntensity: 0.55, practical: true }),
      castShadow: false
    })
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .runtime(game.runtimeNode(`window-target-${i}`));
}

/* -------------------------------------------------------------------------- */
/* 9. Venue Landmarks — Canyon (`canyon`) & Classic Ivy (`ivy`)               */
/* -------------------------------------------------------------------------- */

export function createCoastalPineNode(name: string, pos: V3, height = 9) {
  const s = height / 9;
  const trunk = place(cyl(0.38 * s, 0.14 * s, 3.4 * s, 10), [0, 1.7 * s, 0]);
  const boughs = place(
    coniferBoughTierMesh({ height: 6.8 * s, baseRadius: 2.35 * s, tiers: 5, lobesPerTier: 7, seed: 23 }),
    [0, 2.2 * s, 0]
  );
  const barkMat = material.pbr({ color: "#4e3828", roughness: 0.92, metalness: 0.01 });
  const needleMat = material.pbr({ color: "#274d34", roughness: 0.84, metalness: 0.02 });
  return assembleMultiMaterialNode(
    [
      { mesh: trunk, material: barkMat },
      { mesh: boughs, material: needleMat }
    ],
    { name, position: pos, castShadow: true }
  );
}

export function createCanyonRockNode(
  name: string,
  pos: V3,
  rotY: number,
  height: number,
  idx: number
) {
  const main = fitRawToHeight(
    stratifiedCliffMesh({
      width: height * 0.78,
      height,
      depth: height * 0.68,
      strataCount: 6,
      cols: 14,
      rows: 10,
      seed: 101 + idx * 17,
      roughness: 0.26
    }),
    height
  );
  const shoulder = fitRawToHeight(
    stratifiedCliffMesh({
      width: height * 0.52,
      height: height * 0.58,
      depth: height * 0.48,
      strataCount: 4,
      cols: 10,
      rows: 8,
      seed: 211 + idx * 13,
      roughness: 0.24
    }),
    height * 0.58
  );
  const redSandstone = material.matteClay({ color: idx % 2 === 0 ? "#b55638" : "#a64c32", roughness: 0.9 });
  const ochreBand = material.matteClay({ color: "#cc7a4c", roughness: 0.88 });
  return assembleMultiMaterialNode(
    [
      { mesh: main, material: redSandstone },
      { mesh: place(shoulder, [height * 0.34, 0, height * 0.14], [0, 0.55, 0]), material: ochreBand }
    ],
    { name, position: pos, rotation: [0, rotY, 0], castShadow: true }
  );
}

export function createCanyonMesaNode(name: string, pos: V3, rotY: number, height = 28, idx = 0) {
  const talus = fitRawToHeight(
    stratifiedCliffMesh({
      width: height * 1.65,
      height: height * 0.64,
      depth: height * 1.18,
      strataCount: 5,
      cols: 16,
      rows: 10,
      seed: 310 + idx * 29,
      roughness: 0.22
    }),
    height * 0.64
  );
  const cliff = fitRawToHeight(
    stratifiedCliffMesh({
      width: height * 1.18,
      height: height * 0.92,
      depth: height * 0.82,
      strataCount: 6,
      cols: 14,
      rows: 10,
      seed: 410 + idx * 23,
      roughness: 0.18
    }),
    height * 0.92
  );
  const caprock = place(box(height * 1.12, height * 0.1, height * 0.76, 0.18), [0, height * 0.95, 0]);
  return assembleMultiMaterialNode(
    [
      { mesh: talus, material: material.matteClay({ color: "#9e4830", roughness: 0.92 }) },
      { mesh: cliff, material: material.matteClay({ color: "#bc603e", roughness: 0.89 }) },
      { mesh: caprock, material: material.pbr({ color: "#d48c5c", roughness: 0.85, metalness: 0.02 }) }
    ],
    { name, position: pos, rotation: [0, rotY, 0], castShadow: true }
  );
}

export function createCanyonHoodooNode(name: string, pos: V3, rotY: number, height = 16, idx = 0) {
  const s = height / 16;
  const profile: V2[] = [
    [2.8 * s, 0],
    [2.3 * s, 2.6 * s],
    [1.45 * s, 5.8 * s],
    [1.85 * s, 8.6 * s],
    [0.92 * s, 11.8 * s],
    [0.72 * s, 13.6 * s],
    [1.35 * s, 14.3 * s],
    [0, 14.4 * s]
  ];
  const spire = toFlatShaded(latheMesh(profile, 14));
  const capBoulder = place(
    toFlatShaded(icosphereFacetMesh(1.95 * s, 2, 0.22, 51 + idx * 9)),
    [0.12 * s, 14.9 * s, 0],
    [0.08, idx * 0.7, -0.06],
    [1.28, 0.62, 1.12]
  );
  return assembleMultiMaterialNode(
    [
      { mesh: spire, material: material.matteClay({ color: "#b65839", roughness: 0.91 }) },
      { mesh: capBoulder, material: material.matteClay({ color: "#8c3d28", roughness: 0.88 }) }
    ],
    { name, position: pos, rotation: [0, rotY, 0], castShadow: true }
  );
}

export function createCanyonArchNode(name: string, pos: V3, rotY: number, height = 20) {
  const s = height / 20;
  const sandstone = material.matteClay({ color: "#b65839", roughness: 0.9 });
  const keystone = material.matteClay({ color: "#cf7d4e", roughness: 0.88 });
  const slots = archwayVoussoirSlots({
    archRadius: 7.5 * s,
    thickness: 2.6 * s,
    depth: 3.4 * s,
    pierHeight: 9.8 * s,
    voussoirCount: 11,
    stoneMat: sandstone,
    keystoneMat: keystone
  });
  return assembleMultiMaterialNode(slots, { name, position: pos, rotation: [0, rotY, 0], castShadow: true });
}

export function createDesertJuniperNode(name: string, pos: V3, height = 8.5, seed = 7) {
  const s = height / 8.5;
  const trunk = tubeSweepMesh(
    catmullRomSpline3([[0, 0, 0], [0.22 * s, 1.4 * s, -0.14 * s], [-0.16 * s, 3.1 * s, 0.12 * s], [0.08 * s, 4.6 * s, 0]], 12),
    0.26 * s,
    8
  );
  const crown = place(layeredCanopyMesh({ radius: 2.25 * s, height: 4.2 * s, puffCount: 8, seed }), [0, 5.4 * s, 0]);
  return assembleMultiMaterialNode(
    [
      { mesh: trunk, material: material.pbr({ color: "#5c4230", roughness: 0.92, metalness: 0.01 }) },
      { mesh: crown, material: material.pbr({ color: "#3d5e3a", roughness: 0.86, metalness: 0.02 }) }
    ],
    { name, position: pos, castShadow: true }
  );
}

let cachedIvyVineSpec: AuraCustomGeometrySpec | undefined;

function getIvyVinePanelSpec(wallH: number): AuraCustomGeometrySpec {
  if (cachedIvyVineSpec) return cachedIvyVineSpec;
  const h = wallH + 0.8;
  const stems: RawMesh[] = [];
  for (const sx of [-2.4, -0.8, 0.8, 2.4]) {
    stems.push(
      tubeSweepMesh(
        catmullRomSpline3([[sx, 0.1, 0.08], [sx + 0.22, h * 0.45, 0.14], [sx - 0.18, h * 0.88, 0.12]], 10),
        0.055,
        6
      )
    );
  }
  const puffs = combineRaw([
    place(layeredCanopyMesh({ radius: 1.85, height: h * 0.72, puffCount: 8, seed: 13 }), [-1.9, h * 0.52, 0.18], undefined, [1.15, 1, 0.28]),
    place(layeredCanopyMesh({ radius: 1.95, height: h * 0.78, puffCount: 9, seed: 29 }), [0.0, h * 0.54, 0.2], undefined, [1.2, 1, 0.28]),
    place(layeredCanopyMesh({ radius: 1.85, height: h * 0.72, puffCount: 8, seed: 43 }), [1.9, h * 0.52, 0.18], undefined, [1.15, 1, 0.28])
  ]);
  cachedIvyVineSpec = rawToSpec(combineRaw([...stems, puffs]));
  return cachedIvyVineSpec;
}

export function createIvyVinesInstancedNode(
  transforms: readonly AuraInstanceTransform[],
  wallH: number
) {
  return instances.custom(getIvyVinePanelSpec(wallH), {
    name: "ivy-vines",
    material: material.pbr({ color: "#2d5d34", roughness: 0.84, metalness: 0.02, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function createIvyVineSingleNode(name: string, pos: V3, rotY: number, wallH: number) {
  return geometry
    .custom(getIvyVinePanelSpec(wallH), {
      name,
      material: material.pbr({ color: "#2d5d34", roughness: 0.84, metalness: 0.02 }),
      castShadow: true
    })
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0);
}

export function createIvyTrophyNode() {
  const plinth = combineRaw([
    place(cyl(0.56, 0.52, 0.32, 16), [0, 0.16, 0]),
    place(cyl(0.44, 0.38, 0.82, 16), [0, 0.72, 0])
  ]);
  const cupProfile: V2[] = [
    [0.24, 1.12],
    [0.12, 1.34],
    [0.32, 1.78],
    [0.36, 2.08],
    [0.28, 2.12],
    [0.0, 1.92]
  ];
  const silver = latheMesh(cupProfile, 20);
  const pennants: RawMesh[] = [place(ringBand(0.39, 0.43, 0.06, 20), [0, 1.95, 0])];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pennants.push(place(cyl(0.012, 0.008, 0.72, 6), [Math.cos(a) * 0.41, 2.04, Math.sin(a) * 0.41]));
  }
  return assembleMultiMaterialNode(
    [
      { mesh: plinth, material: DIAMOND_MATS.granitePlinth },
      { mesh: silver, material: DIAMOND_MATS.silverCup },
      { mesh: combineRaw(pennants), material: DIAMOND_MATS.brassHardware }
    ],
    { name: "ivy-trophy", position: [-9.5, 0, 8.4], rotation: [0, 0.9, 0], castShadow: true }
  );
}

export function createIvyStatueNode() {
  const plinth = combineRaw([
    place(box(1.95, 0.45, 1.95, 0.04), [0, 0.225, 0]),
    place(box(1.42, 1.35, 1.42, 0.04), [0, 1.12, 0]),
    place(box(1.56, 0.18, 1.56, 0.03), [0, 1.88, 0])
  ]);
  // Heroic bronze batter sculpture (`y in [1.96, 4.2]`) in follow-through pose
  const bronze = combineRaw([
    tubeSweepMesh(catmullRomSpline3([[-0.22, 1.96, 0.08], [-0.18, 2.52, 0.04], [-0.08, 2.98, 0]], 10), 0.1, 8),
    tubeSweepMesh(catmullRomSpline3([[0.24, 1.96, -0.08], [0.18, 2.52, -0.02], [0.08, 2.98, 0]], 10), 0.1, 8),
    place(cyl(0.22, 0.26, 0.76, 12), [0, 3.32, 0], [0.06, 0.35, -0.08]),
    place(icosphereFacetMesh(0.16, 1, 0.02, 9), [0.02, 3.88, 0.04]),
    tubeSweepMesh(catmullRomSpline3([[0.22, 3.58, 0.06], [0.48, 3.82, 0.22], [0.68, 4.08, -0.12]], 10), 0.075, 7),
    place(cyl(0.022, 0.042, 1.05, 8), [0.82, 4.18, -0.42], [0.85, 0.25, -0.55])
  ]);
  const plaque = place(box(0.88, 0.46, 0.05, 0.01), [0, 1.18, 0.72]);
  return assembleMultiMaterialNode(
    [
      { mesh: plinth, material: DIAMOND_MATS.limestoneTrim },
      { mesh: bronze, material: DIAMOND_MATS.agedBronze },
      { mesh: plaque, material: DIAMOND_MATS.brassHardware }
    ],
    { name: "ivy-statue", position: [14, 0, 10], rotation: [0, -2.4, 0], castShadow: true }
  );
}

export function createIvyRowhouseNode(name: string, pos: V3, rotY: number) {
  // 21 m Wrigleyville 3-bay brick apartment building with limestone trim & rooftop bleacher stand (`+Z` faces ballpark)
  const brick: RawMesh[] = [
    place(box(14.8, 16.4, 10.6, 0.06), [0, 8.2, 0]),
    place(box(2.8, 13.8, 1.4, 0.04), [-4.4, 8.1, 5.6]),
    place(box(2.8, 13.8, 1.4, 0.04), [0.0, 8.1, 5.6]),
    place(box(2.8, 13.8, 1.4, 0.04), [4.4, 8.1, 5.6])
  ];
  const stone: RawMesh[] = [
    place(box(15.2, 1.6, 11.0, 0.04), [0, 0.8, 0]),
    place(box(15.4, 0.65, 11.2, 0.04), [0, 16.55, 0])
  ];
  const glass: RawMesh[] = [];
  for (const bx of [-4.4, 0, 4.4]) {
    for (const wy of [4.2, 8.2, 12.2]) {
      stone.push(place(box(2.2, 0.28, 0.25, 0.02), [bx, wy + 1.15, 6.28]));
      glass.push(place(box(1.95, 1.85, 0.14, 0.02), [bx, wy, 6.26]));
    }
  }
  // Iconic rooftop bleacher tiers + green steel sun awning (`y in [16.8, 21.0]`)
  const bleachers: RawMesh[] = [];
  for (let r = 0; r < 4; r++) {
    bleachers.push(place(box(11.6, 0.42, 0.95, 0.02), [0, 17.1 + r * 0.55, 3.4 - r * 1.05]));
  }
  const awning = combineRaw([
    place(box(12.2, 0.24, 5.2, 0.03), [0, 20.65, 1.8], [0.08, 0, 0]),
    place(cyl(0.1, 0.1, 3.6, 8), [-5.6, 18.8, 3.8]),
    place(cyl(0.1, 0.1, 3.6, 8), [5.6, 18.8, 3.8]),
    place(box(12.4, 0.95, 0.12, 0.02), [0, 17.35, 4.85])
  ]);
  return groups.create(
    name,
    [
      assembleMultiMaterialNode(
        [
          { mesh: combineRaw(brick), material: DIAMOND_MATS.redBrick },
          { mesh: combineRaw(stone), material: DIAMOND_MATS.limestoneTrim },
          { mesh: combineRaw(bleachers), material: DIAMOND_MATS.ashWood },
          { mesh: awning, material: DIAMOND_MATS.ivyGreenSteel }
        ],
        { name: `${name}-body`, castShadow: true }
      ),
      geometry.custom(rawToSpec(combineRaw(glass)), {
        name: `${name}-glass`,
        material: DIAMOND_MATS.suiteGlass,
        castShadow: false
      })
    ],
    { position: pos, rotation: [0, rotY, 0] }
  );
}

export function createIvyWaterTowerNode(pos: V3, rotY: number) {
  const trestle = combineRaw([
    place(latticeTrussMesh({ span: 9.6, width: 3.4, depth: 3.4, bays: 5, chordRadius: 0.11, braceRadius: 0.055 }), [0, 4.8, 0], [0, 0, Math.PI * 0.5]),
    place(cyl(2.65, 2.65, 0.28, 18), [0, 9.75, 0]),
    place(ringBand(2.22, 2.3, 0.12, 18), [0, 11.2, 0]),
    place(ringBand(2.22, 2.3, 0.12, 18), [0, 13.4, 0])
  ]);
  const tankStaves = place(cyl(2.22, 2.16, 4.8, 20), [0, 12.3, 0]);
  const roofCone = combineRaw([
    place(cyl(2.48, 0.08, 2.8, 20), [0, 16.1, 0]),
    place(cyl(0.06, 0.02, 0.85, 8), [0, 17.8, 0])
  ]);
  return assembleMultiMaterialNode(
    [
      { mesh: trestle, material: DIAMOND_MATS.trussSteel },
      { mesh: tankStaves, material: material.pbr({ color: "#7c583a", roughness: 0.86, metalness: 0.02 }) },
      { mesh: roofCone, material: DIAMOND_MATS.brownstoneBrick }
    ],
    { name: "ivy-water-tower", position: pos, rotation: [0, rotY, 0], castShadow: true }
  );
}

/* -------------------------------------------------------------------------- */
/* 10. Venue Landmarks — Indoor Dome (`dome`) & Lunar Base (`lunar`)          */
/* -------------------------------------------------------------------------- */

let cachedDomeRafterSpec: AuraCustomGeometrySpec | undefined;
let cachedDomeBannerSpec: AuraCustomGeometrySpec | undefined;

function getDomeRafterSpec(): AuraCustomGeometrySpec {
  if (cachedDomeRafterSpec) return cachedDomeRafterSpec;
  // 190 m longitudinal roof arch truss (`Z` span) with cambered upper chord
  const truss = place(
    latticeTrussMesh({ span: 190, width: 1.5, depth: 1.35, bays: 32, chordRadius: 0.09, braceRadius: 0.048 }),
    [0, 0, 0],
    [0, Math.PI * 0.5, 0]
  );
  cachedDomeRafterSpec = rawToSpec(truss);
  return cachedDomeRafterSpec;
}

export function createDomeRaftersInstancedNode(transforms: readonly AuraInstanceTransform[]) {
  return instances.custom(getDomeRafterSpec(), {
    name: "dome-rafters",
    material: material.metal({ color: "#2c3b54", roughness: 0.48, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function createDomeRafterSingleNode(name: string, pos: V3) {
  return geometry
    .custom(getDomeRafterSpec(), {
      name,
      material: material.pbr({ color: "#233046", roughness: 0.6, metalness: 0.4 }),
      castShadow: false
    })
    .position(pos[0], pos[1], pos[2]);
}

function getDomeBannerSpec(): AuraCustomGeometrySpec {
  if (cachedDomeBannerSpec) return cachedDomeBannerSpec;
  const poly: V2[] = [
    [-3.0, 2.25],
    [3.0, 2.25],
    [3.0, -1.55],
    [0.0, -2.25],
    [-3.0, -1.55]
  ];
  const cloth = extrudePolygonMesh(poly, 0.12, 0.02);
  const dowel = place(cyl(0.08, 0.08, 6.5, 10), [0, 2.32, 0], [0, 0, Math.PI * 0.5]);
  cachedDomeBannerSpec = rawToSpec(combineRaw([cloth, dowel]));
  return cachedDomeBannerSpec;
}

export function createDomeBannersInstancedNode(
  transforms: readonly AuraInstanceTransform[],
  colors: readonly AuraColor[]
) {
  return instances.custom(getDomeBannerSpec(), {
    name: "dome-banners",
    material: material.emissive({
      color: "#ffffff",
      emissive: "#ffffff",
      emissiveIntensity: 0.45,
      roughness: 0.72,
      clearcoat: 0,
      sheen: 0,
      practical: true
    }),
    transforms: [...transforms],
    colors: [...colors]
  });
}

export function createDomeBannerSingleNode(name: string, pos: V3, color: AuraColor) {
  return geometry
    .custom(getDomeBannerSpec(), {
      name,
      material: material.emissive({ color, emissive: color, emissiveIntensity: 0.45, practical: true }),
      castShadow: false
    })
    .position(pos[0], pos[1], pos[2]);
}

export function createTyphoonDomeShellNode() {
  const ribs: RawMesh[] = [];
  for (let i = -3; i <= 3; i++) {
    const pts: V3[] = [];
    for (let s = 0; s <= 12; s++) {
      const a = (s / 12) * Math.PI;
      pts.push([Math.cos(a) * 118, Math.sin(a) * 58, i * 28]);
    }
    ribs.push(tubeSweepMesh(catmullRomSpline3(pts, 20), 0.85, 8));
  }
  return geometry
    .custom(rawToSpec(combineRaw(ribs)), {
      name: "typhoon-dome-shell",
      material: material.pbr({ color: "#1e293b", roughness: 0.65, metalness: 0.35 }),
      castShadow: false
    })
    .position(0, -0.4, -42)
    .rotate(0, Math.PI, 0);
}

export function createLunarEarthNode(pos: V3) {
  const ocean = icosphereFacetMesh(42.5, 2, 0.012, 71);
  const continents = icosphereFacetMesh(42.9, 2, 0.048, 19);
  const clouds = icosphereFacetMesh(44.2, 2, 0.01, 37);
  return groups
    .create(
      "lunar-earth",
      [
        geometry.custom(rawToSpec(ocean), {
          name: "lunar-earth-ocean",
          material: material.planet("ice", { color: "#2563b8", roughness: 0.32, clearcoat: 0.85 }),
          castShadow: false
        }),
        geometry.custom(rawToSpec(continents), {
          name: "lunar-earth-land",
          material: material.matteClay({ color: "#4d8a54", roughness: 0.82 }),
          castShadow: false
        }),
        geometry.custom(rawToSpec(clouds), {
          name: "lunar-earth-atmo",
          material: material.atmosphere({ color: "#93c5fd", emissive: "#60a5fa", emissiveIntensity: 0.42, opacity: 0.26, practical: true }),
          castShadow: false
        })
      ],
      { position: pos }
    )
    .runtime(game.runtimeNode("lunar-earth"));
}

export function createLunarRoverNode(pos: V3, rotY: number) {
  const tireMat = material.blackRubber({ color: "#2b2f36", roughness: 0.88 });
  const slots: MultiMatSlot[] = [];
  for (const wx of [-1.05, 1.05]) {
    for (const wz of [-1.25, 0, 1.25]) {
      const wheel = wheelAssemblySlots({
        radius: 0.42,
        width: 0.24,
        spokeCount: 6,
        tireMat,
        rimMat: DIAMOND_MATS.alloyBat,
        hubMat: DIAMOND_MATS.goldFoil
      });
      for (const s of wheel) {
        slots.push({
          mesh: place(s.mesh, [wx, 0.42, wz], [0, wx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0]),
          material: s.material
        });
      }
    }
  }
  const foilChassis = combineRaw([
    place(box(1.56, 0.36, 2.95, 0.04), [0, 0.72, 0]),
    place(box(0.88, 0.54, 0.72, 0.03), [0, 1.12, -0.92])
  ]);
  const aluFrame = combineRaw([
    place(box(2.1, 0.1, 0.14, 0.02), [0, 0.54, -1.25]),
    place(box(2.1, 0.1, 0.14, 0.02), [0, 0.54, 0]),
    place(box(2.1, 0.1, 0.14, 0.02), [0, 0.54, 1.25]),
    place(cyl(0.05, 0.04, 1.55, 8), [-0.52, 1.65, 0.95]),
    place(latheMesh([[0, 0], [0.35, 0.06], [0.68, 0.24], [0.64, 0.26], [0, 0.03]], 16), [-0.52, 2.38, 0.95], [0.55, 0.2, 0]),
    place(box(0.48, 0.52, 0.46, 0.03), [-0.42, 1.12, 0.15]),
    place(box(0.48, 0.52, 0.46, 0.03), [0.42, 1.12, 0.15])
  ]);
  slots.push({ mesh: foilChassis, material: DIAMOND_MATS.goldFoil });
  slots.push({ mesh: aluFrame, material: DIAMOND_MATS.alloyBat });
  return assembleMultiMaterialNode(slots, { name: "lunar-rover", position: pos, rotation: [0, rotY, 0], castShadow: true });
}

export function createLunarCommsDomeNode(pos: V3, rotY: number) {
  const plinth = combineRaw([
    place(cyl(4.8, 4.2, 2.2, 16), [0, 1.1, 0]),
    place(latticeTrussMesh({ span: 5.2, width: 1.4, depth: 1.4, bays: 4, chordRadius: 0.08, braceRadius: 0.04 }), [0, 4.7, 0], [0, 0, Math.PI * 0.5])
  ]);
  const radome = place(toFlatShaded(icosphereFacetMesh(3.8, 2, 0, 5)), [0, 9.2, 0]);
  const dish = place(
    latheMesh([[0, 0], [1.6, 0.28], [3.2, 1.05], [3.08, 1.12], [0, 0.08]], 20),
    [3.8, 6.8, 1.6],
    [0.62, -0.4, 0]
  );
  return assembleMultiMaterialNode(
    [
      { mesh: plinth, material: DIAMOND_MATS.trussSteel },
      { mesh: radome, material: material.ceramic({ color: "#dfe5ed", roughness: 0.26, clearcoat: 0.65 }) },
      { mesh: dish, material: DIAMOND_MATS.goldFoil }
    ],
    { name: "lunar-comms", position: pos, rotation: [0, rotY, 0], castShadow: true }
  );
}

export function createLunarHabitatNode(pos: V3, rotY: number) {
  const shell = combineRaw([
    place(cyl(6.4, 6.1, 6.2, 20), [0, 3.1, 0]),
    place(cyl(2.2, 2.2, 4.6, 16), [0, 2.1, 7.2], [Math.PI * 0.5, 0, 0])
  ]);
  const goldTrim = combineRaw([
    place(ringBand(6.18, 6.5, 0.55, 20), [0, 3.2, 0]),
    place(ringBand(2.22, 2.38, 0.35, 16), [0, 2.1, 9.2], [Math.PI * 0.5, 0, 0])
  ]);
  const solarWings = combineRaw([
    place(box(8.8, 0.14, 3.4, 0.02), [-10.8, 5.2, 0], [0.28, 0, 0]),
    place(box(8.8, 0.14, 3.4, 0.02), [10.8, 5.2, 0], [0.28, 0, 0])
  ]);
  const cupolaGlass = place(icosphereFacetMesh(4.2, 2, 0, 13), [0, 6.4, 0], undefined, [1, 0.78, 1]);
  return groups.create(
    "lunar-habitat",
    [
      assembleMultiMaterialNode(
        [
          { mesh: shell, material: material.ceramic({ color: "#dde4ec", roughness: 0.3, clearcoat: 0.6 }) },
          { mesh: goldTrim, material: DIAMOND_MATS.goldFoil },
          { mesh: solarWings, material: DIAMOND_MATS.solarWingCell }
        ],
        { name: "lunar-habitat-body", castShadow: true }
      ),
      geometry.custom(rawToSpec(cupolaGlass), {
        name: "lunar-habitat-dome",
        material: DIAMOND_MATS.suiteGlass,
        castShadow: false
      })
    ],
    { position: pos, rotation: [0, rotY, 0] }
  );
}

let cachedRegolithSpec: AuraCustomGeometrySpec | undefined;

function getRegolithMoundSpec(): AuraCustomGeometrySpec {
  if (cachedRegolithSpec) return cachedRegolithSpec;
  const hummock = stratifiedCliffMesh({
    width: 1.9,
    height: 1.0,
    depth: 1.9,
    strataCount: 4,
    cols: 12,
    rows: 8,
    seed: 67,
    roughness: 0.25
  });
  cachedRegolithSpec = rawToSpec(place(hummock, [0, -0.35, 0]));
  return cachedRegolithSpec;
}

export function createRegolithMoundsInstancedNode(transforms: readonly AuraInstanceTransform[]) {
  return instances.custom(getRegolithMoundSpec(), {
    name: "regolith-mounds",
    material: material.pbr({ color: "#767b86", roughness: 0.96, metalness: 0.02, clearcoat: 0, sheen: 0 }),
    transforms: [...transforms]
  });
}

export function createRegolithMoundSingleNode(name: string, pos: V3, scale: V3) {
  return geometry
    .custom(getRegolithMoundSpec(), {
      name,
      material: material.pbr({ color: "#767b86", roughness: 0.96, metalness: 0.02 }),
      castShadow: true
    })
    .position(pos[0], pos[1], pos[2])
    .scale(scale);
}

/* -------------------------------------------------------------------------- */
/* 11. Articulated Multi-Material Baseball Player Rig & Front-Row Waver Rig   */
/* -------------------------------------------------------------------------- */

export const BASEBALL_ACTOR_FIT = 1.88 / 1.903;
export const BASEBALL_FIT_GROUND_N: V3 = [0, 0.952, 0];

export const BASEBALL_PLAYER_BONES = [
  "Hips",
  "Spine",
  "Chest",
  "Head",
  "LeftUpperArm",
  "LeftForearm",
  "RightUpperArm",
  "RightForearm",
  "LeftUpperLeg",
  "LeftLowerLeg",
  "LeftFoot",
  "RightUpperLeg",
  "RightLowerLeg",
  "RightFoot"
] as const;

export type BaseballBoneName = (typeof BASEBALL_PLAYER_BONES)[number];
export type BaseballActorRole = "batter" | "pitcher" | "catcher" | "infielder" | "outfielder" | "runner" | "coach";

const UA_BIND_SCALE = 0.2555 / Math.hypot(-0.05, -0.25, 0.01);

/**
 * Exact bind-pose local bone translations matching `batter-pose.ts` (`RIG`, `THIGH`, `SHIN`, `HIP_JOINT_L/R`, `HIPS_ACTOR_Y`)
 * so `solveBatterPose` + `worldFromActor` align to 0.000 mm across stance, load, stride, contact, follow-through, and recovery.
 */
export const BASEBALL_BIND_T: Readonly<Record<BaseballBoneName | "Root", V3>> = {
  Root: [0, -0.9520683796, 0],
  Hips: [0, 0.93706, 0],
  Spine: [0, 0.1499303198, 0],
  Chest: [0, 0.2623780598, 0],
  Head: [0, 0.2249, 0.015],
  LeftUpperArm: [0.2, 0.1465, 0],
  LeftForearm: [0.05 * UA_BIND_SCALE, -0.25 * UA_BIND_SCALE, 0.01 * UA_BIND_SCALE],
  RightUpperArm: [-0.2, 0.1465, 0],
  RightForearm: [-0.05 * UA_BIND_SCALE, -0.25 * UA_BIND_SCALE, 0.01 * UA_BIND_SCALE],
  LeftUpperLeg: [0.1143178073, -0.0374825799, 0],
  LeftLowerLeg: [0, -0.4123083794, 0],
  LeftFoot: [0, -0.3373432195, 0],
  RightUpperLeg: [-0.162449437, -0.0374825799, 0],
  RightLowerLeg: [0, -0.4123083794, 0],
  RightFoot: [0, -0.3373432195, 0]
};

export const BASEBALL_BIND_PARENT: Readonly<Record<BaseballBoneName | "Root", BaseballBoneName | "Root" | null>> = {
  Root: null,
  Hips: "Root",
  Spine: "Hips",
  Chest: "Spine",
  Head: "Chest",
  LeftUpperArm: "Chest",
  LeftForearm: "LeftUpperArm",
  RightUpperArm: "Chest",
  RightForearm: "RightUpperArm",
  LeftUpperLeg: "Hips",
  LeftLowerLeg: "LeftUpperLeg",
  LeftFoot: "LeftLowerLeg",
  RightUpperLeg: "Hips",
  RightLowerLeg: "RightUpperLeg",
  RightFoot: "RightLowerLeg"
};

const BIND_DIR_UA_R = gripUnit([-0.05, -0.25, 0.01]);
const BIND_DIR_FA_R = gripUnit([-0.158, -0.296, 0.06]);
const BIND_DIR_UA_L = gripUnit([0.05, -0.25, 0.01]);
const BIND_DIR_FA_L = gripUnit([0.158, -0.296, 0.06]);
const BIND_DOWN: V3 = [0, -1, 0];

// Strictly avoids reserved `#f5f1e4` (ball only) and sibling-sport backdrop palette hexes.
const ATHLETE_SKIN_HEXES = ["#d6a17c", "#be8660", "#8e5c3e", "#ecc19f", "#6b442d"] as const;
const ATHLETE_HAIR_HEXES = ["#231b16", "#3c2b1f", "#171412", "#5b412a"] as const;

const PLAYER_SHARED_MATS = {
  homeJersey: material.fabric({ color: "#ebe6d8", roughness: 0.72, sheen: 0.44, sheenColor: "#f2ede2", sheenRoughness: 0.56 }),
  roadJersey: material.fabric({ color: "#cfd5de", roughness: 0.7, sheen: 0.38, sheenColor: "#e2e7ee", sheenRoughness: 0.58 }),
  defaultAccent: material.fabric({ color: "#1b2a41", roughness: 0.62, sheen: 0.5, sheenColor: "#4b6a96", sheenRoughness: 0.48 }),
  pipingDark: material.fabric({ color: "#232833", roughness: 0.66, sheen: 0.32 }),
  cleatUpper: material.sneakerMesh({ color: "#1b2029", roughness: 0.46 }),
  cleatStripe: material.clearcoatPaint({ color: "#ece8dc", roughness: 0.28, clearcoat: 0.72 }),
  cleatSole: material.sneakerRubber({ color: "#12151b", roughness: 0.86 }),
  cleatStuds: material.studioMetal({ color: "#b9c2ce", roughness: 0.28 }),
  battingGloveBody: material.fabric({ color: "#222730", roughness: 0.54, sheen: 0.36, sheenColor: "#485264" }),
  battingGloveCuff: material.clearcoatPaint({ color: "#ece8dc", roughness: 0.3, clearcoat: 0.7 }),
  catcherArmor: material.carPaint({ color: "#1e2c42", roughness: 0.3, clearcoat: 0.76 }),
  catcherPadTrim: material.fabric({ color: "#344156", roughness: 0.74, sheen: 0.3 }),
  eyeDark: material.lacquer({ color: "#16181f", roughness: 0.18, clearcoat: 0.9 })
} as const;

const skinMatsCache = ATHLETE_SKIN_HEXES.map((color) => material.matteClay({ color, roughness: 0.68 }));
const hairMatsCache = ATHLETE_HAIR_HEXES.map((color) => material.pbr({ color, roughness: 0.84, metalness: 0.02 }));

function hashActorId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function roleForBaseballActorId(id: string): BaseballActorRole {
  if (id === "batter") return "batter";
  if (id === "pitcher") return "pitcher";
  if (id === "f-c") return "catcher";
  if (id === "f-lf" || id === "f-cf" || id === "f-rf") return "outfielder";
  if (id.startsWith("f-")) return "infielder";
  if (id.startsWith("runner-")) return "runner";
  return "coach";
}

interface CachedBaseballPartSpecs {
  readonly hipsUniform: AuraCustomGeometrySpec;
  readonly hipsCatcherPad: AuraCustomGeometrySpec | null;
  readonly spineCore: AuraCustomGeometrySpec;
  readonly chestJersey: AuraCustomGeometrySpec;
  readonly chestTrim: AuraCustomGeometrySpec;
  readonly chestCatcherArmor: AuraCustomGeometrySpec | null;
  readonly chestCatcherHardware: AuraCustomGeometrySpec | null;
  readonly headSkin: AuraCustomGeometrySpec;
  readonly headHair: AuraCustomGeometrySpec;
  readonly headEyes: AuraCustomGeometrySpec;
  readonly headCatcherCage: AuraCustomGeometrySpec | null;
  readonly upperArmL: AuraCustomGeometrySpec;
  readonly upperArmR: AuraCustomGeometrySpec;
  readonly forearmSkinL: AuraCustomGeometrySpec;
  readonly forearmSkinR: AuraCustomGeometrySpec;
  readonly forearmGloveL: AuraCustomGeometrySpec | null;
  readonly forearmGloveR: AuraCustomGeometrySpec | null;
  readonly forearmCuffL: AuraCustomGeometrySpec;
  readonly forearmCuffR: AuraCustomGeometrySpec;
  readonly thighPant: AuraCustomGeometrySpec;
  readonly thighStripe: AuraCustomGeometrySpec;
  readonly shinPant: AuraCustomGeometrySpec;
  readonly shinStirrup: AuraCustomGeometrySpec;
  readonly shinCatcherGuard: AuraCustomGeometrySpec | null;
  readonly footUpper: AuraCustomGeometrySpec;
  readonly footStripe: AuraCustomGeometrySpec;
  readonly footSole: AuraCustomGeometrySpec;
  readonly footStuds: AuraCustomGeometrySpec;
}

const partSpecsCache = new Map<string, CachedBaseballPartSpecs>();

function ellipseRing(cx: number, y: number, cz: number, rx: number, rz: number, n = 14): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz]);
  }
  return pts;
}

function buildForearmMeshes(side: "L" | "R", wearBattingGlove: boolean): {
  readonly skin: RawMesh;
  readonly glove: RawMesh | null;
  readonly cuff: RawMesh;
} {
  const sx = side === "L" ? 1 : -1;
  const palm: V3 = [sx * 0.158, -0.296, 0.06];
  const elbowCap = icosphereFacetMesh(0.044, 2, 0.0, 3);
  const wrist: V3 = [palm[0] * 0.74, palm[1] * 0.74, palm[2] * 0.74];
  const mid: V3 = [palm[0] * 0.37, palm[1] * 0.37, palm[2] * 0.37];
  const armTube = kernelTubeSweepMesh(
    [
      [0, 0, 0, 0.045],
      [mid[0], mid[1], mid[2], 0.041],
      [wrist[0], wrist[1], wrist[2], 0.031]
    ],
    12,
    true
  );
  const wristCuff = kernelTubeSweepMesh(
    [
      [palm[0] * 0.68, palm[1] * 0.68, palm[2] * 0.68, 0.034],
      [palm[0] * 0.77, palm[1] * 0.77, palm[2] * 0.77, 0.033]
    ],
    12,
    true
  );

  // Sculpted hand / batting-glove centered symmetrically on `palm` (`RIG.palmL` / `RIG.palmR`) at `r > 0.285 m` from elbow `[0,0,0]`.
  const handParts: RawMesh[] = [
    place(box(0.068, 0.074, 0.038, 0.014), palm, [0.22, sx * -0.24, sx * 0.38])
  ];
  for (let f = -1.5; f <= 1.5; f += 1) {
    const offX = f * 0.013;
    handParts.push(
      place(
        box(0.013, 0.046, 0.028, 0.005),
        [palm[0] + offX * 0.65, palm[1] - 0.018, palm[2] + 0.016],
        [0.65, 0, sx * 0.25]
      )
    );
  }
  // Opposable thumb wrapping the handle
  handParts.push(
    place(
      box(0.018, 0.042, 0.022, 0.006),
      [palm[0] - sx * 0.026, palm[1] + 0.016, palm[2] + 0.018],
      [0.35, sx * 0.4, sx * -0.45]
    )
  );
  const handRaw = combineRaw(handParts);

  if (wearBattingGlove) {
    return {
      skin: combineRaw([elbowCap, armTube]),
      glove: handRaw,
      cuff: wristCuff
    };
  }
  return {
    skin: combineRaw([elbowCap, armTube, handRaw]),
    glove: null,
    cuff: wristCuff
  };
}

function getBaseballPartSpecs(kind: "batter" | "catcher" | "fielder"): CachedBaseballPartSpecs {
  const hit = partSpecsCache.get(kind);
  if (hit) return hit;

  const isBatter = kind === "batter";
  const isCatcher = kind === "catcher";

  // 1. Connected Pelvis + Hip Sockets (`Hips`)
  const pelvisLoft = loftSectionsMesh(
    [
      ellipseRing(-0.018, -0.105, 0.0, 0.168, 0.108, 14),
      ellipseRing(-0.014, -0.042, 0.004, 0.184, 0.122, 14),
      ellipseRing(-0.006, 0.025, 0.005, 0.172, 0.116, 14),
      ellipseRing(0.0, 0.082, 0.002, 0.156, 0.106, 14)
    ],
    true
  );
  const hipCapL = place(icosphereFacetMesh(0.078, 2, 0, 5), BASEBALL_BIND_T.LeftUpperLeg);
  const hipCapR = place(icosphereFacetMesh(0.078, 2, 0, 7), BASEBALL_BIND_T.RightUpperLeg);
  const hipsUniform = rawToSpec(combineRaw([pelvisLoft, hipCapL, hipCapR]));
  const hipsCatcherPad = isCatcher
    ? rawToSpec(place(box(0.16, 0.15, 0.055, 0.018), [-0.01, -0.055, 0.118], [-0.12, 0, 0]))
    : null;

  // 2. Lower Torso / Waist Core (`Spine`)
  const spineLoft = loftSectionsMesh(
    [
      ellipseRing(0, -0.055, 0.0, 0.154, 0.104, 14),
      ellipseRing(0, 0.095, 0.006, 0.166, 0.114, 14),
      ellipseRing(0, 0.245, 0.008, 0.178, 0.122, 14)
    ],
    true
  );
  const spineCore = rawToSpec(spineLoft);

  // 3. Athletic V-Taper Chest, Raglan Shoulders, Button Placket & Collar (`Chest`)
  const chestLoft = loftSectionsMesh(
    [
      ellipseRing(0, -0.045, 0.006, 0.174, 0.118, 16),
      ellipseRing(0, 0.055, 0.012, 0.198, 0.132, 16),
      ellipseRing(0, 0.145, 0.008, 0.222, 0.136, 16),
      ellipseRing(0, 0.205, 0.004, 0.162, 0.104, 16),
      ellipseRing(0, 0.232, 0.006, 0.078, 0.072, 16)
    ],
    true
  );
  const shoulderCapL = place(icosphereFacetMesh(0.068, 2, 0, 11), BASEBALL_BIND_T.LeftUpperArm);
  const shoulderCapR = place(icosphereFacetMesh(0.068, 2, 0, 13), BASEBALL_BIND_T.RightUpperArm);
  const chestJersey = rawToSpec(combineRaw([chestLoft, shoulderCapL, shoulderCapR]));

  const collarRing = place(ringBand(0.068, 0.088, 0.028, 16), [0, 0.222, 0.012], [0.16, 0, 0]);
  const placket = place(box(0.024, 0.25, 0.014, 0.004), [0, 0.085, 0.132], [-0.04, 0, 0]);
  const backNumber = place(box(0.11, 0.12, 0.012, 0.003), [0, 0.095, -0.13], [0.05, 0, 0]);
  const chestTrim = rawToSpec(combineRaw([collarRing, placket, backNumber]));

  let chestCatcherArmor: AuraCustomGeometrySpec | null = null;
  let chestCatcherHardware: AuraCustomGeometrySpec | null = null;
  if (isCatcher) {
    const ribs: RawMesh[] = [
      place(box(0.31, 0.34, 0.045, 0.016), [0, 0.055, 0.136], [-0.04, 0, 0]),
      place(box(0.11, 0.065, 0.12, 0.018), [-0.155, 0.195, 0.035], [0, 0, 0.22]),
      place(box(0.11, 0.065, 0.12, 0.018), [0.155, 0.195, 0.035], [0, 0, -0.22])
    ];
    for (let r = 0; r < 4; r++) {
      ribs.push(place(box(0.27, 0.046, 0.022, 0.008), [0, -0.055 + r * 0.072, 0.158], [-0.04, 0, 0]));
    }
    chestCatcherArmor = rawToSpec(combineRaw(ribs));
    chestCatcherHardware = rawToSpec(
      combineRaw([
        place(cyl(0.012, 0.012, 0.014, 8), [-0.11, 0.17, 0.155], [Math.PI * 0.5, 0, 0]),
        place(cyl(0.012, 0.012, 0.014, 8), [0.11, 0.17, 0.155], [Math.PI * 0.5, 0, 0])
      ])
    );
  }

  // 4. Sculpted Neck, Jaw, Skull, Nose, Ears & Catcher Mask (`Head`)
  const neckAndSkullProfile: V2[] = [
    [0.058, -0.035],
    [0.054, 0.028],
    [0.076, 0.058],
    [0.096, 0.105],
    [0.101, 0.155],
    [0.094, 0.205],
    [0.068, 0.238],
    [0.0, 0.252]
  ];
  const skull = latheMesh(neckAndSkullProfile, 18);
  const jawChin = place(box(0.105, 0.068, 0.095, 0.024), [0, 0.078, 0.036]);
  const nose = place(box(0.026, 0.042, 0.034, 0.009), [0, 0.128, 0.098], [-0.18, 0, 0]);
  const earL = place(box(0.018, 0.044, 0.028, 0.007), [0.098, 0.128, -0.004]);
  const earR = place(box(0.018, 0.044, 0.028, 0.007), [-0.098, 0.128, -0.004]);
  const headSkin = rawToSpec(combineRaw([skull, jawChin, nose, earL, earR]));

  const hairBack = place(icosphereFacetMesh(0.103, 2, 0.003, 17), [0, 0.162, -0.014], undefined, [1.01, 0.94, 1.03]);
  const brows = combineRaw([
    place(box(0.032, 0.009, 0.014, 0.003), [-0.034, 0.154, 0.092], [0, 0, 0.08]),
    place(box(0.032, 0.009, 0.014, 0.003), [0.034, 0.154, 0.092], [0, 0, -0.08])
  ]);
  const headHair = rawToSpec(combineRaw([hairBack, brows]));
  const headEyes = rawToSpec(
    combineRaw([
      place(icosphereFacetMesh(0.012, 1, 0, 2), [-0.033, 0.138, 0.092]),
      place(icosphereFacetMesh(0.012, 1, 0, 2), [0.033, 0.138, 0.092])
    ])
  );

  let headCatcherCage: AuraCustomGeometrySpec | null = null;
  if (isCatcher) {
    const bars: RawMesh[] = [];
    for (const by of [0.072, 0.108, 0.144, 0.178]) {
      bars.push(
        tubeSweepMesh(
          catmullRomSpline3([[-0.095, by, 0.042], [-0.055, by, 0.118], [0, by, 0.132], [0.055, by, 0.118], [0.095, by, 0.042]], 10),
          0.0055,
          6
        )
      );
    }
    bars.push(tubeSweepMesh(catmullRomSpline3([[-0.042, 0.062, 0.11], [-0.042, 0.188, 0.11]], 6), 0.005, 6));
    bars.push(tubeSweepMesh(catmullRomSpline3([[0.042, 0.062, 0.11], [0.042, 0.188, 0.11]], 6), 0.005, 6));
    headCatcherCage = rawToSpec(combineRaw(bars));
  }

  // 5. Upper Arms (`LeftUpperArm` & `RightUpperArm`) — 3/4 baseball undersleeves from `[0,0,0]` to `LeftForearm`/`RightForearm`
  const buildUpperArm = (elbow: V3): AuraCustomGeometrySpec => {
    const cap = icosphereFacetMesh(0.058, 2, 0, 5);
    const sleeve = kernelTubeSweepMesh(
      [
        [0, 0, 0, 0.06],
        [elbow[0] * 0.52, elbow[1] * 0.52, elbow[2] * 0.52, 0.053],
        [elbow[0], elbow[1], elbow[2], 0.046]
      ],
      12,
      true
    );
    return rawToSpec(combineRaw([cap, sleeve]));
  };
  const upperArmL = buildUpperArm(BASEBALL_BIND_T.LeftForearm);
  const upperArmR = buildUpperArm(BASEBALL_BIND_T.RightForearm);

  // 6. Forearms & Hands / Batting Gloves (`LeftForearm` & `RightForearm`)
  const faL = buildForearmMeshes("L", isBatter);
  const faR = buildForearmMeshes("R", isBatter);

  // 7. Tapered Baseball Pant Thighs + Knee Caps (`LeftUpperLeg` & `RightUpperLeg`, length `0.4123 m` down `-Y`)
  const thighProfile: V2[] = [
    [0.0, -0.415],
    [0.064, -0.412],
    [0.072, -0.28],
    [0.088, -0.14],
    [0.098, -0.02],
    [0.082, 0.03],
    [0.0, 0.035]
  ];
  const kneeCap = place(icosphereFacetMesh(0.064, 2, 0, 9), [0, -0.4123, 0.008]);
  const thighPant = rawToSpec(combineRaw([latheMesh(thighProfile, 16), kneeCap]));
  const thighStripe = rawToSpec(place(box(0.016, 0.39, 0.022, 0.004), [0, -0.205, 0.0], undefined, [1, 1, 1]));

  // 8. Tapered Lower-Leg Pant Cuffs + High Ribbed Team Stirrup Socks (`LeftLowerLeg` & `RightLowerLeg`, length `0.3373 m` down `-Y`)
  const shinPantProfile: V2[] = [
    [0.0, -0.175],
    [0.056, -0.172],
    [0.066, -0.085],
    [0.064, 0.01],
    [0.0, 0.015]
  ];
  const shinStirrupProfile: V2[] = [
    [0.0, -0.342],
    [0.043, -0.337],
    [0.048, -0.255],
    [0.055, -0.168],
    [0.0, -0.165]
  ];
  const shinPant = rawToSpec(latheMesh(shinPantProfile, 14));
  const shinStirrup = rawToSpec(latheMesh(shinStirrupProfile, 14));
  const shinCatcherGuard = isCatcher
    ? rawToSpec(
        combineRaw([
          place(icosphereFacetMesh(0.072, 2, 0, 4), [0, 0.01, 0.042], undefined, [0.95, 1.05, 0.72]),
          place(box(0.115, 0.31, 0.048, 0.018), [0, -0.165, 0.052], [0.04, 0, 0])
        ])
      )
    : null;

  // 9. Molded Low-Cut Baseball Cleats (`LeftFoot` & `RightFoot`, grounded so stud tips touch `y = -0.14986 m` -> world `y = 0.000 m`)
  const ankleBall = place(icosphereFacetMesh(0.045, 2, 0, 6), [0, -0.018, -0.005]);
  const shoeUpper = loftSectionsMesh(
    [
      ellipseRing(0, -0.052, -0.018, 0.048, 0.058, 12),
      ellipseRing(0, -0.095, 0.028, 0.054, 0.112, 12),
      ellipseRing(0, -0.126, 0.042, 0.056, 0.128, 12)
    ],
    true
  );
  const footUpper = rawToSpec(combineRaw([ankleBall, shoeUpper]));
  const footStripe = rawToSpec(
    combineRaw([
      place(box(0.114, 0.022, 0.095, 0.005), [0, -0.098, 0.018], [0.16, 0, 0]),
      place(box(0.044, 0.018, 0.068, 0.005), [0, -0.078, 0.058], [0.42, 0, 0])
    ])
  );
  const footSole = rawToSpec(place(box(0.108, 0.02, 0.258, 0.008), [0, -0.134, 0.042]));
  const studs: RawMesh[] = [];
  for (const [sx, sz] of [
    [-0.032, 0.132],
    [0.032, 0.132],
    [0.0, 0.152],
    [-0.034, 0.068],
    [0.034, 0.068],
    [-0.028, -0.048],
    [0.028, -0.048]
  ] as const) {
    studs.push(place(cyl(0.005, 0.008, 0.012, 6), [sx, -0.144, sz]));
  }
  const footStuds = rawToSpec(combineRaw(studs));

  const built: CachedBaseballPartSpecs = {
    hipsUniform,
    hipsCatcherPad,
    spineCore,
    chestJersey,
    chestTrim,
    chestCatcherArmor,
    chestCatcherHardware,
    headSkin,
    headHair,
    headEyes,
    headCatcherCage,
    upperArmL,
    upperArmR,
    forearmSkinL: rawToSpec(faL.skin),
    forearmSkinR: rawToSpec(faR.skin),
    forearmGloveL: faL.glove ? rawToSpec(faL.glove) : null,
    forearmGloveR: faR.glove ? rawToSpec(faR.glove) : null,
    forearmCuffL: rawToSpec(faL.cuff),
    forearmCuffR: rawToSpec(faR.cuff),
    thighPant,
    thighStripe,
    shinPant,
    shinStirrup,
    shinCatcherGuard,
    footUpper,
    footStripe,
    footSole,
    footStuds
  };
  partSpecsCache.set(kind, built);
  return built;
}

export const BASEBALL_ACCENT_PART_SUFFIXES = ["trim", "sleeve-l", "sleeve-r", "sock-l", "sock-r"] as const;

/**
 * Builds a 100% procedural, multi-material, anatomically connected `1.88 m` baseball athlete
 * with hierarchical runtime bone groups `${id}-${BoneName}` matching `batter-pose.ts` `RIG`.
 */
export function buildArticulatedBaseballPlayerNode(
  id: string,
  options: { readonly roadKit?: boolean; readonly position?: V3; readonly yaw?: number } = {}
) {
  const role = roleForBaseballActorId(id);
  const specKind = role === "batter" || role === "runner" ? "batter" : role === "catcher" ? "catcher" : "fielder";
  const parts = getBaseballPartSpecs(specKind);
  const h = hashActorId(id);
  const skinMat = skinMatsCache[h % skinMatsCache.length]!;
  const hairMat = hairMatsCache[(h >>> 3) % hairMatsCache.length]!;
  const uniformMat = options.roadKit ? PLAYER_SHARED_MATS.roadJersey : PLAYER_SHARED_MATS.homeJersey;
  const accentMat = PLAYER_SHARED_MATS.defaultAccent;

  const customMesh = (name: string, spec: AuraCustomGeometrySpec, mat: AuraMaterialSpec, runtimeId?: string) => {
    const n = geometry.custom(spec, { name, material: mat, castShadow: true });
    return runtimeId ? n.runtime(game.runtimeNode(runtimeId)) : n;
  };

  const leftFoot = groups
    .create(
      `${id}-LeftFoot`,
      [
        customMesh(`${id}-lfoot-upper`, parts.footUpper, PLAYER_SHARED_MATS.cleatUpper),
        customMesh(`${id}-lfoot-stripe`, parts.footStripe, PLAYER_SHARED_MATS.cleatStripe),
        customMesh(`${id}-lfoot-sole`, parts.footSole, PLAYER_SHARED_MATS.cleatSole),
        customMesh(`${id}-lfoot-studs`, parts.footStuds, PLAYER_SHARED_MATS.cleatStuds)
      ],
      { position: BASEBALL_BIND_T.LeftFoot }
    )
    .runtime(game.runtimeNode(`${id}-LeftFoot`));

  const rightFoot = groups
    .create(
      `${id}-RightFoot`,
      [
        customMesh(`${id}-rfoot-upper`, parts.footUpper, PLAYER_SHARED_MATS.cleatUpper),
        customMesh(`${id}-rfoot-stripe`, parts.footStripe, PLAYER_SHARED_MATS.cleatStripe),
        customMesh(`${id}-rfoot-sole`, parts.footSole, PLAYER_SHARED_MATS.cleatSole),
        customMesh(`${id}-rfoot-studs`, parts.footStuds, PLAYER_SHARED_MATS.cleatStuds)
      ],
      { position: BASEBALL_BIND_T.RightFoot }
    )
    .runtime(game.runtimeNode(`${id}-RightFoot`));

  const leftLowerLeg = groups
    .create(
      `${id}-LeftLowerLeg`,
      [
        customMesh(`${id}-lshin-pant`, parts.shinPant, uniformMat),
        customMesh(`${id}-sock-l`, parts.shinStirrup, accentMat, `${id}-sock-l`),
        ...(parts.shinCatcherGuard ? [customMesh(`${id}-lshin-guard`, parts.shinCatcherGuard, PLAYER_SHARED_MATS.catcherArmor)] : []),
        leftFoot
      ],
      { position: BASEBALL_BIND_T.LeftLowerLeg }
    )
    .runtime(game.runtimeNode(`${id}-LeftLowerLeg`));

  const rightLowerLeg = groups
    .create(
      `${id}-RightLowerLeg`,
      [
        customMesh(`${id}-rshin-pant`, parts.shinPant, uniformMat),
        customMesh(`${id}-sock-r`, parts.shinStirrup, accentMat, `${id}-sock-r`),
        ...(parts.shinCatcherGuard ? [customMesh(`${id}-rshin-guard`, parts.shinCatcherGuard, PLAYER_SHARED_MATS.catcherArmor)] : []),
        rightFoot
      ],
      { position: BASEBALL_BIND_T.RightLowerLeg }
    )
    .runtime(game.runtimeNode(`${id}-RightLowerLeg`));

  const leftUpperLeg = groups
    .create(
      `${id}-LeftUpperLeg`,
      [
        customMesh(`${id}-lthigh-pant`, parts.thighPant, uniformMat),
        customMesh(`${id}-lthigh-stripe`, parts.thighStripe, PLAYER_SHARED_MATS.pipingDark).position(0.088, 0, 0),
        leftLowerLeg
      ],
      { position: BASEBALL_BIND_T.LeftUpperLeg }
    )
    .runtime(game.runtimeNode(`${id}-LeftUpperLeg`));

  const rightUpperLeg = groups
    .create(
      `${id}-RightUpperLeg`,
      [
        customMesh(`${id}-rthigh-pant`, parts.thighPant, uniformMat),
        customMesh(`${id}-rthigh-stripe`, parts.thighStripe, PLAYER_SHARED_MATS.pipingDark).position(-0.088, 0, 0),
        rightLowerLeg
      ],
      { position: BASEBALL_BIND_T.RightUpperLeg }
    )
    .runtime(game.runtimeNode(`${id}-RightUpperLeg`));

  const leftForearm = groups
    .create(
      `${id}-LeftForearm`,
      [
        customMesh(`${id}-lforearm-skin`, parts.forearmSkinL, skinMat),
        customMesh(`${id}-lforearm-cuff`, parts.forearmCuffL, PLAYER_SHARED_MATS.battingGloveCuff),
        ...(parts.forearmGloveL ? [customMesh(`${id}-lforearm-glove`, parts.forearmGloveL, PLAYER_SHARED_MATS.battingGloveBody)] : [])
      ],
      { position: BASEBALL_BIND_T.LeftForearm }
    )
    .runtime(game.runtimeNode(`${id}-LeftForearm`));

  const rightForearm = groups
    .create(
      `${id}-RightForearm`,
      [
        customMesh(`${id}-rforearm-skin`, parts.forearmSkinR, skinMat),
        customMesh(`${id}-rforearm-cuff`, parts.forearmCuffR, PLAYER_SHARED_MATS.battingGloveCuff),
        ...(parts.forearmGloveR ? [customMesh(`${id}-rforearm-glove`, parts.forearmGloveR, PLAYER_SHARED_MATS.battingGloveBody)] : [])
      ],
      { position: BASEBALL_BIND_T.RightForearm }
    )
    .runtime(game.runtimeNode(`${id}-RightForearm`));

  const leftUpperArm = groups
    .create(
      `${id}-LeftUpperArm`,
      [customMesh(`${id}-sleeve-l`, parts.upperArmL, accentMat, `${id}-sleeve-l`), leftForearm],
      { position: BASEBALL_BIND_T.LeftUpperArm }
    )
    .runtime(game.runtimeNode(`${id}-LeftUpperArm`));

  const rightUpperArm = groups
    .create(
      `${id}-RightUpperArm`,
      [customMesh(`${id}-sleeve-r`, parts.upperArmR, accentMat, `${id}-sleeve-r`), rightForearm],
      { position: BASEBALL_BIND_T.RightUpperArm }
    )
    .runtime(game.runtimeNode(`${id}-RightUpperArm`));

  const head = groups
    .create(
      `${id}-Head`,
      [
        customMesh(`${id}-head-skin`, parts.headSkin, skinMat),
        customMesh(`${id}-head-hair`, parts.headHair, hairMat),
        customMesh(`${id}-head-eyes`, parts.headEyes, PLAYER_SHARED_MATS.eyeDark),
        ...(parts.headCatcherCage ? [customMesh(`${id}-head-cage`, parts.headCatcherCage, DIAMOND_MATS.galvanizedSteel)] : [])
      ],
      { position: BASEBALL_BIND_T.Head }
    )
    .runtime(game.runtimeNode(`${id}-Head`));

  const chest = groups
    .create(
      `${id}-Chest`,
      [
        customMesh(`${id}-chest-jersey`, parts.chestJersey, uniformMat),
        customMesh(`${id}-trim`, parts.chestTrim, accentMat, `${id}-trim`),
        ...(parts.chestCatcherArmor ? [customMesh(`${id}-chest-armor`, parts.chestCatcherArmor, PLAYER_SHARED_MATS.catcherArmor)] : []),
        ...(parts.chestCatcherHardware ? [customMesh(`${id}-chest-hw`, parts.chestCatcherHardware, DIAMOND_MATS.brassHardware)] : []),
        head,
        leftUpperArm,
        rightUpperArm
      ],
      { position: BASEBALL_BIND_T.Chest }
    )
    .runtime(game.runtimeNode(`${id}-Chest`));

  const spine = groups
    .create(
      `${id}-Spine`,
      [customMesh(`${id}-spine-core`, parts.spineCore, uniformMat), chest],
      { position: BASEBALL_BIND_T.Spine }
    )
    .runtime(game.runtimeNode(`${id}-Spine`));

  const hips = groups
    .create(
      `${id}-Hips`,
      [
        customMesh(`${id}-hips-uniform`, parts.hipsUniform, uniformMat),
        ...(parts.hipsCatcherPad ? [customMesh(`${id}-hips-pad`, parts.hipsCatcherPad, PLAYER_SHARED_MATS.catcherPadTrim)] : []),
        spine,
        leftUpperLeg,
        rightUpperLeg
      ],
      { position: BASEBALL_BIND_T.Hips }
    )
    .runtime(game.runtimeNode(`${id}-Hips`));

  const rootPos: V3 = [
    (BASEBALL_BIND_T.Root[0] + BASEBALL_FIT_GROUND_N[0]) * BASEBALL_ACTOR_FIT,
    (BASEBALL_BIND_T.Root[1] + BASEBALL_FIT_GROUND_N[1]) * BASEBALL_ACTOR_FIT,
    (BASEBALL_BIND_T.Root[2] + BASEBALL_FIT_GROUND_N[2]) * BASEBALL_ACTOR_FIT
  ];
  const rootGroup = groups.create(`${id}-Root`, [hips], {
    position: rootPos,
    scale: [BASEBALL_ACTOR_FIT, BASEBALL_ACTOR_FIT, BASEBALL_ACTOR_FIT]
  });

  const pos = options.position ?? [0, -80, 0];
  const yaw = options.yaw ?? 0;
  return groups
    .create(id, [rootGroup], { position: pos, rotation: [0, yaw, 0] })
    .runtime(game.runtimeNode(id));
}

export type BaseballPoseBonesInput = Partial<
  Record<BaseballBoneName, { readonly position?: readonly [number, number, number]; readonly rotation?: GripQuat }>
>;

const ID_QUAT: GripQuat = [0, 0, 0, 1];

/**
 * Stateless `"ZYX"` Euler joint driver — resets every bone from bind every frame so rotations NEVER compound.
 */
export function applyBaseballPoseStateless(
  jointHandles: Readonly<Partial<Record<BaseballBoneName, { setRotation(x: number, y: number, z: number): unknown; setPosition(x: number, y: number, z: number): unknown } | null>>>,
  bones?: BaseballPoseBonesInput
): void {
  for (const name of BASEBALL_PLAYER_BONES) {
    const h = jointHandles[name];
    if (!h) continue;
    const entry = bones?.[name];
    const q = entry?.rotation ?? ID_QUAT;
    const [rx, ry, rz] = gripQToEulerZYX(q);
    h.setRotation(rx, ry, rz);
    if (name === "Hips") {
      const p = entry?.position ?? BASEBALL_BIND_T.Hips;
      h.setPosition(p[0], p[1], p[2]);
    }
  }
}

function mat4Identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Mul(a: readonly number[], b: readonly number[]): number[] {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function mat4FromTQ(t: V3, q: GripQuat): number[] {
  const [x, y, z, w] = q;
  const m = mat4Identity();
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y + z * w);
  m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w);
  m[5] = 1 - 2 * (x * x + z * z);
  m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w);
  m[9] = 2 * (y * z - x * w);
  m[10] = 1 - 2 * (x * x + y * y);
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  return m;
}

function quatFromMat4(m: readonly number[]): GripQuat {
  const m00 = m[0]!, m11 = m[5]!, m22 = m[10]!;
  const tr = m00 + m11 + m22;
  let x = 0, y = 0, z = 0, w = 1;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1.0) * 2;
    w = 0.25 * s;
    x = (m[6]! - m[9]!) / s;
    y = (m[8]! - m[2]!) / s;
    z = (m[1]! - m[4]!) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    w = (m[6]! - m[9]!) / s;
    x = 0.25 * s;
    y = (m[4]! + m[1]!) / s;
    z = (m[8]! + m[2]!) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    w = (m[8]! - m[2]!) / s;
    x = (m[4]! + m[1]!) / s;
    y = 0.25 * s;
    z = (m[9]! + m[6]!) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    w = (m[1]! - m[4]!) / s;
    x = (m[8]! + m[2]!) / s;
    y = (m[9]! + m[6]!) / s;
    z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

/**
 * Computes exact column-major 4x4 skeleton-frame matrices (`Root` + all 14 `BASEBALL_PLAYER_BONES`).
 */
export function computeBaseballBoneMatrices(bones?: BaseballPoseBonesInput): Record<BaseballBoneName | "Root", number[]> {
  const out = {} as Record<BaseballBoneName | "Root", number[]>;
  const get = (n: BaseballBoneName | "Root"): number[] => {
    if (out[n]) return out[n]!;
    const p = BASEBALL_BIND_PARENT[n];
    const entry = n === "Root" ? undefined : bones?.[n];
    const pos = (entry?.position ?? BASEBALL_BIND_T[n]) as V3;
    const rot = entry?.rotation ?? ID_QUAT;
    const local = mat4FromTQ(pos, rot);
    out[n] = p ? mat4Mul(get(p), local) : local;
    return out[n]!;
  };
  get("Root");
  for (const n of BASEBALL_PLAYER_BONES) get(n);
  return out;
}

/**
 * Exact world-space socket position & `"ZYX"` Euler rotation for equipment riding `Head`, `Hips`, or `LeftForearm`.
 */
export function computeBaseballSocketWorldTRS(
  boneMats: Readonly<Record<BaseballBoneName | "Root", readonly number[]>>,
  bone: BaseballBoneName,
  actorPos: V3,
  actorYaw: number,
  localPos: V3,
  localRotZYX?: V3
): { readonly position: V3; readonly rotation: V3 } {
  const m = boneMats[bone];
  const ax = m[0]! * localPos[0] + m[4]! * localPos[1] + m[8]! * localPos[2] + m[12]!;
  const ay = m[1]! * localPos[0] + m[5]! * localPos[1] + m[9]! * localPos[2] + m[13]!;
  const az = m[2]! * localPos[0] + m[6]! * localPos[1] + m[10]! * localPos[2] + m[14]!;
  const sx = (ax + BASEBALL_FIT_GROUND_N[0]) * BASEBALL_ACTOR_FIT;
  const sy = (ay + BASEBALL_FIT_GROUND_N[1]) * BASEBALL_ACTOR_FIT;
  const sz = (az + BASEBALL_FIT_GROUND_N[2]) * BASEBALL_ACTOR_FIT;
  const cy = Math.cos(actorYaw);
  const siny = Math.sin(actorYaw);
  const position: V3 = [
    actorPos[0] + sx * cy + sz * siny,
    actorPos[1] + sy,
    actorPos[2] - sx * siny + sz * cy
  ];
  const qBone = quatFromMat4(m);
  const qYaw = gripQAxis([0, 1, 0], actorYaw);
  let qWorld = gripQMul(qYaw, qBone);
  if (localRotZYX) {
    const qLoc = gripQMul(
      gripQAxis([0, 0, 1], localRotZYX[2]),
      gripQMul(gripQAxis([0, 1, 0], localRotZYX[1]), gripQAxis([1, 0, 0], localRotZYX[0]))
    );
    qWorld = gripQMul(qWorld, qLoc);
  }
  return { position, rotation: gripQToEulerZYX(qWorld) };
}

function aimTwoSegmentChain(
  qParentWorld: GripQuat,
  bindDirU: V3,
  dirUWorld: V3,
  bindDirL: V3,
  dirLWorld: V3
): { readonly qU: GripQuat; readonly qL: GripQuat } {
  const qUw = gripQFromTo(bindDirU, gripUnit(dirUWorld));
  const qLw = gripQFromTo(bindDirL, gripUnit(dirLWorld));
  return {
    qU: gripQMul(gripQConj(qParentWorld), qUw),
    qL: gripQMul(gripQConj(qUw), qLw)
  };
}

/**
 * Computes stateless anatomical baseball role poses (`pitcher`, `catcher`, `infielder`, `outfielder`, `runner`, `coach`,
 * plus sprinting `batter`) across `Crouch_Idle_Loop`, `Idle_Loop`, `Walk_Loop`, `Sprint_Loop`, `Telegraph`, `Release`, and `Contest`.
 */
export function computeBaseballRolePose(
  role: BaseballActorRole,
  clip: string,
  timeSec: number,
  seedPhase = 0,
  speed = 1.0
): BaseballPoseBonesInput {
  const t = timeSec * speed + seedPhase;

  if (clip === "Sprint_Loop" || clip === "Walk_Loop") {
    const isSprint = clip === "Sprint_Loop";
    const freq = isSprint ? 8.6 : 4.4;
    const ph = t * freq;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const lean = isSprint ? 0.3 : 0.08;
    const bounce = isSprint ? Math.abs(c) * 0.045 - 0.035 : Math.abs(c) * 0.015;
    const twist = s * (isSprint ? 0.18 : 0.07);

    const qHips = gripQAxis([0, 1, 0], -twist * 0.5);
    const qSpine = gripQAxis([1, 0, 0], lean * 0.45);
    const qChestLocal = gripQMul(gripQAxis([0, 1, 0], twist), gripQAxis([1, 0, 0], lean * 0.55));
    const qChestWorld = gripQMul(qHips, gripQMul(qSpine, qChestLocal));

    const swingAmp = isSprint ? 0.72 : 0.28;
    const legL = aimTwoSegmentChain(
      qHips,
      BIND_DOWN,
      [0.03, -Math.cos(s * swingAmp), Math.sin(s * swingAmp)],
      BIND_DOWN,
      [0.03, -0.92, Math.sin(s * swingAmp) - (isSprint ? Math.max(0, -c) * 0.78 : Math.max(0, -c) * 0.28)]
    );
    const legR = aimTwoSegmentChain(
      qHips,
      BIND_DOWN,
      [-0.03, -Math.cos(-s * swingAmp), Math.sin(-s * swingAmp)],
      BIND_DOWN,
      [-0.03, -0.92, Math.sin(-s * swingAmp) - (isSprint ? Math.max(0, c) * 0.78 : Math.max(0, c) * 0.28)]
    );

    const armPump = isSprint ? 0.65 : 0.24;
    const armL = aimTwoSegmentChain(
      qChestWorld,
      BIND_DIR_UA_L,
      [0.24, -0.82, -s * armPump],
      BIND_DIR_FA_L,
      [0.08, isSprint ? -0.18 + Math.max(0, -s) * 0.35 : -0.65, isSprint ? 0.85 : 0.45 - s * 0.25]
    );
    const armR = aimTwoSegmentChain(
      qChestWorld,
      BIND_DIR_UA_R,
      [-0.24, -0.82, s * armPump],
      BIND_DIR_FA_R,
      [-0.08, isSprint ? -0.18 + Math.max(0, s) * 0.35 : -0.65, isSprint ? 0.85 : 0.45 + s * 0.25]
    );

    return {
      Hips: { position: [0, BASEBALL_BIND_T.Hips[1] + bounce, 0], rotation: qHips },
      Spine: { rotation: qSpine },
      Chest: { rotation: qChestLocal },
      Head: { rotation: gripQAxis([1, 0, 0], -lean * 0.72) },
      LeftUpperArm: { rotation: armL.qU },
      LeftForearm: { rotation: armL.qL },
      RightUpperArm: { rotation: armR.qU },
      RightForearm: { rotation: armR.qL },
      LeftUpperLeg: { rotation: legL.qU },
      LeftLowerLeg: { rotation: legL.qL },
      LeftFoot: { rotation: gripQAxis([1, 0, 0], isSprint ? 0.18 : 0.05) },
      RightUpperLeg: { rotation: legR.qU },
      RightLowerLeg: { rotation: legR.qL },
      RightFoot: { rotation: gripQAxis([1, 0, 0], isSprint ? 0.18 : 0.05) }
    };
  }

  // Deep Catcher Squat (`f-c`)
  if (role === "catcher" && clip !== "Release") {
    const sway = Math.sin(t * 2.1) * 0.014;
    const qHips = gripQAxis([0, 1, 0], sway * 0.8);
    const qSpine = gripQAxis([1, 0, 0], 0.24);
    const qChestLocal = gripQAxis([1, 0, 0], 0.14);
    const qChestWorld = gripQMul(qHips, gripQMul(qSpine, qChestLocal));

    const legL = aimTwoSegmentChain(qHips, BIND_DOWN, [0.36, -0.44, 0.82], BIND_DOWN, [0.18, -0.95, -0.22]);
    const legR = aimTwoSegmentChain(qHips, BIND_DOWN, [-0.36, -0.44, 0.82], BIND_DOWN, [-0.18, -0.95, -0.22]);
    // Left arm holds catcher's mitt out as strike-zone target; right hand protected beside right hip
    const armL = aimTwoSegmentChain(
      qChestWorld,
      BIND_DIR_UA_L,
      [0.14, -0.36, 0.92],
      BIND_DIR_FA_L,
      [-0.12, 0.06 + sway, 0.98]
    );
    const armR = aimTwoSegmentChain(
      qChestWorld,
      BIND_DIR_UA_R,
      [-0.36, -0.86, 0.12],
      BIND_DIR_FA_R,
      [-0.18, -0.45, 0.62]
    );

    return {
      Hips: { position: [sway, BASEBALL_BIND_T.Hips[1] - 0.36, -0.06], rotation: qHips },
      Spine: { rotation: qSpine },
      Chest: { rotation: qChestLocal },
      Head: { rotation: gripQAxis([1, 0, 0], -0.34) },
      LeftUpperArm: { rotation: armL.qU },
      LeftForearm: { rotation: armL.qL },
      RightUpperArm: { rotation: armR.qU },
      RightForearm: { rotation: armR.qL },
      LeftUpperLeg: { rotation: legL.qU },
      LeftLowerLeg: { rotation: legL.qL },
      LeftFoot: { rotation: gripQAxis([1, 0, 0], -0.18) },
      RightUpperLeg: { rotation: legR.qU },
      RightLowerLeg: { rotation: legR.qL },
      RightFoot: { rotation: gripQAxis([1, 0, 0], -0.18) }
    };
  }

  // Pitcher Windup (`Telegraph`) — high front leg kick & coiled throwing arm
  if (clip === "Telegraph") {
    const kick = 0.5 + 0.5 * Math.sin(t * 4.2);
    const qHips = gripQAxis([0, 1, 0], -0.78);
    const qSpine = gripQAxis([1, 0, 0], -0.06);
    const qChestLocal = gripQAxis([0, 1, 0], -0.24);
    const qChestWorld = gripQMul(qHips, gripQMul(qSpine, qChestLocal));

    const legL = aimTwoSegmentChain(
      qHips,
      BIND_DOWN,
      [0.18, 0.25 + kick * 0.35, 0.85],
      BIND_DOWN,
      [0.08, -0.96, -0.18]
    );
    const legR = aimTwoSegmentChain(qHips, BIND_DOWN, [-0.08, -0.96, 0.14], BIND_DOWN, [-0.04, -0.98, -0.08]);
    const armL = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_L, [0.35, -0.18, 0.92], BIND_DIR_FA_L, [0.1, 0.18, 0.98]);
    const armR = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_R, [-0.72, 0.42, -0.55], BIND_DIR_FA_R, [-0.32, 0.88, -0.28]);

    return {
      Hips: { position: [0, BASEBALL_BIND_T.Hips[1] - 0.04, -0.04], rotation: qHips },
      Spine: { rotation: qSpine },
      Chest: { rotation: qChestLocal },
      Head: { rotation: gripQAxis([0, 1, 0], 0.95) },
      LeftUpperArm: { rotation: armL.qU },
      LeftForearm: { rotation: armL.qL },
      RightUpperArm: { rotation: armR.qU },
      RightForearm: { rotation: armR.qL },
      LeftUpperLeg: { rotation: legL.qU },
      LeftLowerLeg: { rotation: legL.qL },
      LeftFoot: { rotation: gripQAxis([1, 0, 0], 0.25) },
      RightUpperLeg: { rotation: legR.qU },
      RightLowerLeg: { rotation: legR.qL },
      RightFoot: { rotation: ID_QUAT }
    };
  }

  // Overhand Throw / Pitch Follow-Through (`Release`)
  if (clip === "Release") {
    const qHips = gripQAxis([0, 1, 0], 0.42);
    const qSpine = gripQAxis([1, 0, 0], 0.34);
    const qChestLocal = gripQMul(gripQAxis([0, 1, 0], 0.32), gripQAxis([1, 0, 0], 0.22));
    const qChestWorld = gripQMul(qHips, gripQMul(qSpine, qChestLocal));

    const legL = aimTwoSegmentChain(qHips, BIND_DOWN, [0.1, -0.82, 0.56], BIND_DOWN, [0.06, -0.96, 0.12]);
    const legR = aimTwoSegmentChain(qHips, BIND_DOWN, [-0.14, -0.58, -0.8], BIND_DOWN, [-0.1, -0.25, -0.96]);
    const armL = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_L, [0.55, -0.62, -0.45], BIND_DIR_FA_L, [0.32, -0.2, 0.88]);
    const armR = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_R, [0.18, -0.28, 0.94], BIND_DIR_FA_R, [0.46, -0.42, 0.78]);

    return {
      Hips: { position: [0, BASEBALL_BIND_T.Hips[1] - 0.11, 0.16], rotation: qHips },
      Spine: { rotation: qSpine },
      Chest: { rotation: qChestLocal },
      Head: { rotation: gripQMul(gripQAxis([0, 1, 0], -0.55), gripQAxis([1, 0, 0], -0.42)) },
      LeftUpperArm: { rotation: armL.qU },
      LeftForearm: { rotation: armL.qL },
      RightUpperArm: { rotation: armR.qU },
      RightForearm: { rotation: armR.qL },
      LeftUpperLeg: { rotation: legL.qU },
      LeftLowerLeg: { rotation: legL.qL },
      LeftFoot: { rotation: ID_QUAT },
      RightUpperLeg: { rotation: legR.qU },
      RightLowerLeg: { rotation: legR.qL },
      RightFoot: { rotation: gripQAxis([1, 0, 0], 0.45) }
    };
  }

  // Web-Gem Fly-Ball Reach (`Contest`)
  if (clip === "Contest") {
    const qHips = gripQAxis([0, 1, 0], -0.22);
    const qSpine = gripQAxis([1, 0, 0], -0.1);
    const qChestLocal = gripQAxis([0, 1, 0], -0.18);
    const qChestWorld = gripQMul(qHips, gripQMul(qSpine, qChestLocal));

    const legL = aimTwoSegmentChain(qHips, BIND_DOWN, [0.16, -0.92, 0.26], BIND_DOWN, [0.12, -0.96, -0.18]);
    const legR = aimTwoSegmentChain(qHips, BIND_DOWN, [-0.16, -0.92, -0.22], BIND_DOWN, [-0.12, -0.96, -0.28]);
    const armL = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_L, [0.28, 0.86, 0.42], BIND_DIR_FA_L, [0.12, 0.94, 0.32]);
    const armR = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_R, [-0.46, -0.55, 0.68], BIND_DIR_FA_R, [-0.22, -0.15, 0.96]);

    return {
      Hips: { position: [0, BASEBALL_BIND_T.Hips[1] + 0.04, 0], rotation: qHips },
      Spine: { rotation: qSpine },
      Chest: { rotation: qChestLocal },
      Head: { rotation: gripQAxis([1, 0, 0], -0.32) },
      LeftUpperArm: { rotation: armL.qU },
      LeftForearm: { rotation: armL.qL },
      RightUpperArm: { rotation: armR.qU },
      RightForearm: { rotation: armR.qL },
      LeftUpperLeg: { rotation: legL.qU },
      LeftLowerLeg: { rotation: legL.qL },
      LeftFoot: { rotation: ID_QUAT },
      RightUpperLeg: { rotation: legR.qU },
      RightLowerLeg: { rotation: legR.qL },
      RightFoot: { rotation: ID_QUAT }
    };
  }

  // Pitcher Set Stance on Mound (`pitcher` in `Crouch_Idle_Loop` / `Idle_Loop`)
  if (role === "pitcher") {
    const breath = Math.sin(t * 2.2) * 0.012;
    const qHips = gripQAxis([0, 1, 0], -0.45);
    const qSpine = gripQAxis([1, 0, 0], 0.08);
    const qChestLocal = gripQAxis([0, 1, 0], -0.12);
    const qChestWorld = gripQMul(qHips, gripQMul(qSpine, qChestLocal));

    const legL = aimTwoSegmentChain(qHips, BIND_DOWN, [0.16, -0.95, 0.24], BIND_DOWN, [0.12, -0.98, -0.12]);
    const legR = aimTwoSegmentChain(qHips, BIND_DOWN, [-0.16, -0.95, -0.18], BIND_DOWN, [-0.12, -0.98, -0.22]);
    // Both hands together in the leather glove at chest letters
    const armL = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_L, [0.22, -0.78, 0.58], BIND_DIR_FA_L, [-0.42, 0.28 + breath, 0.86]);
    const armR = aimTwoSegmentChain(qChestWorld, BIND_DIR_UA_R, [-0.22, -0.78, 0.58], BIND_DIR_FA_R, [0.42, 0.28 + breath, 0.86]);

    return {
      Hips: { position: [0, BASEBALL_BIND_T.Hips[1] - 0.045 + breath * 0.5, 0], rotation: qHips },
      Spine: { rotation: qSpine },
      Chest: { rotation: qChestLocal },
      Head: { rotation: gripQAxis([0, 1, 0], 0.56) },
      LeftUpperArm: { rotation: armL.qU },
      LeftForearm: { rotation: armL.qL },
      RightUpperArm: { rotation: armR.qU },
      RightForearm: { rotation: armR.qL },
      LeftUpperLeg: { rotation: legL.qU },
      LeftLowerLeg: { rotation: legL.qL },
      LeftFoot: { rotation: ID_QUAT },
      RightUpperLeg: { rotation: legR.qU },
      RightLowerLeg: { rotation: legR.qL },
      RightFoot: { rotation: ID_QUAT }
    };
  }

  // Default Athletic Ready Crouch (`infielder`, `outfielder`, `runner`, `coach`)
  const sway = Math.sin(t * 2.4) * 0.018;
  const bob = Math.cos(t * 4.8) * 0.008;
  const drop = role === "infielder" || role === "runner" ? -0.105 : role === "outfielder" ? -0.075 : -0.045;
  const fwdLean = role === "coach" ? 0.08 : 0.22;

  const qHips = gripQAxis([0, 1, 0], sway * 0.6);
  const qSpine = gripQAxis([1, 0, 0], fwdLean * 0.55);
  const qChestLocal = gripQAxis([1, 0, 0], fwdLean * 0.45);
  const qChestWorld = gripQMul(qHips, gripQMul(qSpine, qChestLocal));

  const legL = aimTwoSegmentChain(qHips, BIND_DOWN, [0.22, -0.88, 0.42], BIND_DOWN, [0.16, -0.96, -0.22]);
  const legR = aimTwoSegmentChain(qHips, BIND_DOWN, [-0.22, -0.88, 0.42], BIND_DOWN, [-0.16, -0.96, -0.22]);
  const armL = aimTwoSegmentChain(
    qChestWorld,
    BIND_DIR_UA_L,
    [0.28, -0.78, 0.55],
    BIND_DIR_FA_L,
    [-0.18, -0.18, 0.96]
  );
  const armR = aimTwoSegmentChain(
    qChestWorld,
    BIND_DIR_UA_R,
    [-0.28, -0.78, 0.55],
    BIND_DIR_FA_R,
    [0.18, -0.18, 0.96]
  );

  return {
    Hips: { position: [sway, BASEBALL_BIND_T.Hips[1] + drop + bob, 0], rotation: qHips },
    Spine: { rotation: qSpine },
    Chest: { rotation: qChestLocal },
    Head: { rotation: gripQAxis([1, 0, 0], -fwdLean * 0.85) },
    LeftUpperArm: { rotation: armL.qU },
    LeftForearm: { rotation: armL.qL },
    RightUpperArm: { rotation: armR.qU },
    RightForearm: { rotation: armR.qL },
    LeftUpperLeg: { rotation: legL.qU },
    LeftLowerLeg: { rotation: legL.qL },
    LeftFoot: { rotation: ID_QUAT },
    RightUpperLeg: { rotation: legR.qU },
    RightLowerLeg: { rotation: legR.qL },
    RightFoot: { rotation: ID_QUAT }
  };
}

/* ---------- Articulated Front-Row Ballpark Wavers (`waver-0..17`) ---------- */

const WAVER_JERSEY_HEXES = ["#c8553d", "#3b7ea1", "#2f6b5e", "#d9883f", "#4d5d8c", "#7d4e8f"] as const;
const WAVER_PANTS_HEXES = ["#263246", "#3a352f", "#1f2733"] as const;
const waverJerseyMats = WAVER_JERSEY_HEXES.map((color) => material.fabric({ color, roughness: 0.74, sheen: 0.4 }));
const waverCapMats = WAVER_JERSEY_HEXES.map((color) => material.clearcoatPaint({ color, roughness: 0.28, clearcoat: 0.72 }));
const waverPantsMats = WAVER_PANTS_HEXES.map((color) => material.fabric({ color, roughness: 0.82, sheen: 0.22 }));

let cachedWaverSpecs:
  | {
      readonly legsShoes: AuraCustomGeometrySpec;
      readonly torso: AuraCustomGeometrySpec;
      readonly headSkin: AuraCustomGeometrySpec;
      readonly cap: AuraCustomGeometrySpec;
      readonly armL: AuraCustomGeometrySpec;
      readonly armR: AuraCustomGeometrySpec;
    }
  | undefined;

function getWaverPartSpecs() {
  if (cachedWaverSpecs) return cachedWaverSpecs;
  const legL = place(cyl(0.062, 0.082, 0.84, 10), [0.11, 0.5, 0]);
  const legR = place(cyl(0.062, 0.082, 0.84, 10), [-0.11, 0.5, 0]);
  const shoeL = place(box(0.11, 0.09, 0.25, 0.02), [0.11, 0.045, 0.04]);
  const shoeR = place(box(0.11, 0.09, 0.25, 0.02), [-0.11, 0.045, 0.04]);
  const pelvis = loftSectionsMesh(
    [
      ellipseRing(0, 0.86, 0, 0.165, 0.11, 12),
      ellipseRing(0, 0.98, 0, 0.16, 0.108, 12)
    ],
    true
  );
  const legsShoes = rawToSpec(combineRaw([legL, legR, shoeL, shoeR, pelvis]));

  const torsoLoft = loftSectionsMesh(
    [
      ellipseRing(0, 0.97, 0, 0.162, 0.112, 14),
      ellipseRing(0, 1.24, 0.01, 0.195, 0.128, 14),
      ellipseRing(0, 1.46, 0, 0.21, 0.125, 14),
      ellipseRing(0, 1.54, 0, 0.08, 0.075, 14)
    ],
    true
  );
  const torso = rawToSpec(torsoLoft);

  const neckHead = combineRaw([
    place(cyl(0.055, 0.052, 0.1, 10), [0, 1.57, 0]),
    place(icosphereFacetMesh(0.105, 2, 0.002, 7), [0, 1.69, 0.01], undefined, [0.94, 1.06, 0.98])
  ]);
  const headSkin = rawToSpec(neckHead);
  const cap = rawToSpec(
    combineRaw([
      place(latheMesh([[0.106, 0], [0.108, 0.04], [0.085, 0.082], [0, 0.095]], 14), [0, 1.71, 0.008]),
      place(box(0.15, 0.012, 0.11, 0.004), [0, 1.72, 0.11], [0.14, 0, 0])
    ])
  );

  const buildArm = (sx: number) =>
    rawToSpec(
      combineRaw([
        icosphereFacetMesh(0.054, 1, 0, 3),
        kernelTubeSweepMesh(
          [
            [0, 0, 0, 0.052],
            [sx * 0.05, -0.24, 0.04, 0.044],
            [sx * 0.03, -0.44, 0.18, 0.035]
          ],
          10,
          true
        ),
        place(icosphereFacetMesh(0.04, 1, 0, 5), [sx * 0.03, -0.47, 0.2])
      ])
    );

  cachedWaverSpecs = {
    legsShoes,
    torso,
    headSkin,
    cap,
    armL: buildArm(1),
    armR: buildArm(-1)
  };
  return cachedWaverSpecs;
}

export function buildArticulatedBallparkWaverNode(index: number, pos: V3, yaw: number) {
  const specs = getWaverPartSpecs();
  const jerseyMat = waverJerseyMats[index % waverJerseyMats.length]!;
  const capMat = waverCapMats[(index + 2) % waverCapMats.length]!;
  const pantsMat = waverPantsMats[index % waverPantsMats.length]!;
  const skinMat = skinMatsCache[index % skinMatsCache.length]!;

  const armL = groups
    .create(
      `waver-${index}-arm-l`,
      [geometry.custom(specs.armL, { name: `waver-${index}-arm-l-mesh`, material: jerseyMat, castShadow: true })],
      { position: [0.21, 1.44, 0] }
    )
    .runtime(game.runtimeNode(`waver-${index}-arm-l`));

  const armR = groups
    .create(
      `waver-${index}-arm-r`,
      [geometry.custom(specs.armR, { name: `waver-${index}-arm-r-mesh`, material: jerseyMat, castShadow: true })],
      { position: [-0.21, 1.44, 0] }
    )
    .runtime(game.runtimeNode(`waver-${index}-arm-r`));

  return groups
    .create(
      `waver-${index}`,
      [
        geometry.custom(specs.legsShoes, { name: `waver-${index}-legs`, material: pantsMat, castShadow: true }),
        geometry.custom(specs.torso, { name: `waver-${index}-torso`, material: jerseyMat, castShadow: true }),
        geometry.custom(specs.headSkin, { name: `waver-${index}-head`, material: skinMat, castShadow: true }),
        geometry.custom(specs.cap, { name: `waver-${index}-cap`, material: capMat, castShadow: false }),
        armL,
        armR
      ],
      { position: pos, rotation: [0, yaw, 0] }
    )
    .runtime(game.runtimeNode(`waver-${index}`));
}

export function poseArticulatedBallparkWaver(
  armLHandle: { setRotation(x: number, y: number, z: number): unknown } | null | undefined,
  armRHandle: { setRotation(x: number, y: number, z: number): unknown } | null | undefined,
  index: number,
  timeSec: number,
  hopHeight: number,
  reducedMotion = false
): void {
  if (reducedMotion) {
    armLHandle?.setRotation(-0.35, 0, 0.14);
    armRHandle?.setRotation(-0.42, 0, -0.14);
    return;
  }
  const cheering = hopHeight > 0.005;
  const phase = timeSec * (cheering ? 7.5 : 2.1) + index * 1.37;
  if (cheering) {
    armLHandle?.setRotation(-2.45 + Math.sin(phase) * 0.28, 0, 0.25 + Math.cos(phase) * 0.16);
    armRHandle?.setRotation(-2.5 + Math.cos(phase) * 0.28, 0, -0.25 - Math.sin(phase) * 0.16);
  } else {
    const idleRaise = index % 3 === 0 ? -0.78 : -0.36;
    armLHandle?.setRotation(-0.34 + Math.sin(phase) * 0.08, 0, 0.14);
    armRHandle?.setRotation(idleRaise + Math.cos(phase * 1.15) * 0.14, 0, -0.16);
  }
}
