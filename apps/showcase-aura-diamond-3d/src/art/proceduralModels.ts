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

type AuraInstanceTransform = AuraTransformSpec;
import {
  archwayVoussoirSlots as kernelArchwayVoussoirSlots,
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

export function createAthleteCapNode(id: string, capMat: AuraMaterialSpec, _visible = true) {
  return geometry
    .custom(getBattingCapHelmetSpec(), {
      name: `${id}-cap`,
      material: capMat,
      castShadow: false
    })
    .runtime(game.runtimeNode(`${id}-cap`));
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
  _visible = true,
  castShadow = false
) {
  return geometry
    .custom(getAthleteBeltSpec(), {
      name: `${id}-belt`,
      material: beltMat,
      castShadow
    })
    .runtime(game.runtimeNode(`${id}-belt`));
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

export function createFielderGloveNode(id: string, pos: V3 = [0, -10, 0]) {
  return assembleMultiMaterialNode(getFielderGloveSlots(), {
    id,
    name: id,
    position: pos,
    castShadow: true
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

export function createCatcherMittNode(pos: V3 = [0, -10, 0]) {
  return assembleMultiMaterialNode(getCatcherMittSlots(), {
    id: "catcher-mitt",
    name: "catcher-mitt",
    position: pos,
    castShadow: true
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
/* 6. Articulated Seated Spectators (`stand-fans` & `stand-fans-b`)           */
/* -------------------------------------------------------------------------- */

let cachedFanASpec: AuraCustomGeometrySpec | undefined;
let cachedFanBSpec: AuraCustomGeometrySpec | undefined;

function buildSeatedFanMesh(cheering: boolean): RawMesh {
  const parts: RawMesh[] = [];
  // Seated torso (`loftSectionsMesh`) anchored so feet sit at `y = 0` and cap crown reaches `y = 1.22`, facing `+Z`.
  const lean = cheering ? -0.04 : 0.05;
  const torsoSections: V3[][] = [
    [[-0.145, 0.42, -0.08], [0.145, 0.42, -0.08], [0.135, 0.42, 0.09], [-0.135, 0.42, 0.09]],
    [[-0.175, 0.66, -0.07 + lean * 0.5], [0.175, 0.66, -0.07 + lean * 0.5], [0.16, 0.66, 0.1 + lean * 0.5], [-0.16, 0.66, 0.1 + lean * 0.5]],
    [[-0.19, 0.88, -0.06 + lean], [0.19, 0.88, -0.06 + lean], [0.165, 0.88, 0.095 + lean], [-0.165, 0.88, 0.095 + lean]],
    [[-0.085, 0.94, -0.03 + lean], [0.085, 0.94, -0.03 + lean], [0.085, 0.94, 0.05 + lean], [-0.085, 0.94, 0.05 + lean]]
  ];
  parts.push(loftSectionsMesh(torsoSections, true));

  // Seated thighs, bent knees, shins, and sneakers (`y = 0` foot sole)
  for (const sx of [-0.095, 0.095]) {
    const legPts: V3[] = [
      [sx, 0.46, 0.0],
      [sx * 1.08, 0.44, 0.25],
      [sx * 1.06, 0.22, 0.29],
      [sx * 1.05, 0.04, 0.28]
    ];
    parts.push(tubeSweepMesh(catmullRomSpline3(legPts, 10), 0.056, 7));
    parts.push(place(box(0.095, 0.055, 0.17, 0.015), [sx * 1.05, 0.028, 0.32]));
  }

  // Articulated arms: Variant A rests forearms on knees; Variant B raises right rally arm with foam pennant
  const leftArm: V3[] = [
    [-0.195, 0.85, lean],
    [-0.23, 0.65, 0.08 + lean],
    [-0.14, 0.52, 0.22]
  ];
  parts.push(tubeSweepMesh(catmullRomSpline3(leftArm, 8), 0.044, 7));
  if (cheering) {
    const rightCheer: V3[] = [
      [0.195, 0.86, lean],
      [0.26, 1.03, 0.06],
      [0.22, 1.2, 0.12]
    ];
    parts.push(tubeSweepMesh(catmullRomSpline3(rightCheer, 8), 0.044, 7));
    // Rally towel / mini-pennant in raised hand
    parts.push(place(box(0.05, 0.16, 0.11, 0.008), [0.22, 1.21, 0.15], [0.15, 0, -0.22]));
  } else {
    const rightRest: V3[] = [
      [0.195, 0.85, lean],
      [0.23, 0.65, 0.08 + lean],
      [0.14, 0.52, 0.22]
    ];
    parts.push(tubeSweepMesh(catmullRomSpline3(rightRest, 8), 0.044, 7));
  }

  // Sculpted head + ballpark cap crown & visor (`y_top ~= 1.22 m`)
  const hz = 0.015 + lean;
  parts.push(place(cyl(0.052, 0.048, 0.08, 8), [0, 0.96, hz]));
  parts.push(place(icosphereFacetMesh(0.104, 1, 0.02, cheering ? 11 : 7), [0, 1.075, hz]));
  parts.push(place(cyl(0.108, 0.088, 0.075, 10), [0, 1.155, hz]));
  parts.push(place(box(0.15, 0.018, 0.11, 0.005), [0, 1.135, cheering ? hz - 0.085 : hz + 0.095], [cheering ? -0.15 : 0.16, 0, 0]));

  return combineRaw(parts);
}

export function getSeatedFanVariantASpec(): AuraCustomGeometrySpec {
  if (!cachedFanASpec) cachedFanASpec = rawToSpec(buildSeatedFanMesh(false));
  return cachedFanASpec;
}

export function getSeatedFanVariantBSpec(): AuraCustomGeometrySpec {
  if (!cachedFanBSpec) cachedFanBSpec = rawToSpec(buildSeatedFanMesh(true));
  return cachedFanBSpec;
}

export function createSeatedFansBatchNode(
  name: string,
  variant: "a" | "b",
  transforms: readonly AuraInstanceTransform[],
  colors: readonly AuraColor[]
) {
  return instances.custom(variant === "a" ? getSeatedFanVariantASpec() : getSeatedFanVariantBSpec(), {
    name,
    // Strictly `clearcoat: 0, sheen: 0` on high-count (`>16`) instanced spectator draws!
    material: material.pbr({ color: "#ffffff", roughness: 0.78, metalness: 0.02, clearcoat: 0, sheen: 0 }),
    castShadow: false,
    transforms: [...transforms],
    colors: [...colors]
  });
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
