/**
 * Procedural Multi-Material Asset Library for Cumulus Dash (`WP-29`).
 *
 * Builds 100% `@aura3d/engine` sculpted multi-material assemblies for the
 * articulated Sky Kid Cloud-Surfer Hero, golden cloud steed, creatures, props,
 * pickups, landmarks, cottage, and instanced set pieces while preserving all
 * gameplay colliders, camera clearance bounds, and node runtime IDs.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraInstanceWindOption,
  type AuraTransformSpec
} from "@aura3d/engine";

type MultiMatNodeBuilder = ReturnType<typeof geometry.multiMaterial>;
type InstancedNodeBuilder = ReturnType<typeof instances.custom>;
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  fbm3,
  hash01,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  sculptHumanoidLimbMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";

export const COIN_POOL_CAP = 16;

// ---------------------------------------------------------------------------
// Physical Multi-Material Palette (WebGPU + WebGL2 native presets)
// ---------------------------------------------------------------------------

export const CUMULUS_MATERIALS = {
  // Golden cumulus steed: plush velvet-like golden & cream sheen
  cumulusGoldPlush: material.fabric({
    name: "cumulus-gold-plush",
    color: "#ffd66b",
    roughness: 0.58,
    sheen: 0.92,
    sheenColor: "#fff6cf",
    sheenRoughness: 0.34,
    emissive: "#ffca66",
    emissiveIntensity: 0.24
  }),
  cumulusCreamPuff: material.fabric({
    name: "cumulus-cream-puff",
    color: "#fffaf2",
    roughness: 0.52,
    sheen: 0.95,
    sheenColor: "#ffffff",
    sheenRoughness: 0.28,
    emissive: "#ffe8cc",
    emissiveIntensity: 0.26
  }),
  cumulusAmberBraid: material.ceramic({
    name: "cumulus-amber-braid",
    color: "#f4aa3a",
    roughness: 0.28,
    clearcoat: 0.45,
    emissive: "#ff9d2e",
    emissiveIntensity: 0.14
  }),
  // Warm sunlit cream/ivory sky cumulus materials (sheen + warm #ffe8cc emissive so undersides never turn storm-grey)
  skyCumulusIvoryFabric: material.fabric({
    name: "sky-cumulus-ivory-fabric",
    color: "#fffaf2",
    roughness: 0.52,
    sheen: 0.9,
    sheenColor: "#ffffff",
    sheenRoughness: 0.3,
    emissive: "#ffe8cc",
    emissiveIntensity: 0.28
  }),
  skyCumulusWarmPhysical: material.physical({
    name: "sky-cumulus-warm-physical",
    color: "#fffaf2",
    roughness: 0.46,
    clearcoat: 0.08,
    sheen: 0.82,
    sheenColor: "#fff8ee",
    sheenRoughness: 0.32,
    emissive: "#ffe8cc",
    emissiveIntensity: 0.26
  }),

  // Sanctuary lacquer, roof glazes & celestial food glazes
  vermilionLacquer: material.lacquer({
    name: "sanctuary-vermilion-lacquer",
    color: "#c93322",
    roughness: 0.14,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08
  }),
  obsidianLacquer: material.lacquer({
    name: "sanctuary-obsidian-lacquer",
    color: "#22242a",
    roughness: 0.2,
    clearcoat: 0.72,
    clearcoatRoughness: 0.12
  }),
  crimsonRoofGlaze: material.clearcoatPaint({
    name: "hermit-roof-tile-glaze",
    color: "#b83c28",
    roughness: 0.22,
    metallic: 0.04,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12
  }),
  roastHoneyGlaze: material.clearcoatPaint({
    name: "roast-honey-glaze",
    color: "#b85226",
    roughness: 0.18,
    metallic: 0.02,
    clearcoat: 0.92,
    clearcoatRoughness: 0.09
  }),
  peachBlushGlaze: material.clearcoatPaint({
    name: "celestial-peach-glaze",
    color: "#ff926b",
    roughness: 0.24,
    metallic: 0,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18
  }),

  // Turned brass, dark bronze & architectural ceramics
  engravedBrass: material.brushedMetal({
    name: "sky-engraved-brass",
    color: "#ecc058",
    roughness: 0.24,
    anisotropy: 0.68,
    anisotropyRotation: 0.5
  }),
  darkBronzeHardware: material.studioMetal({
    name: "sky-dark-bronze",
    color: "#5b4632",
    roughness: 0.34,
    metallic: 0.88
  }),
  limePlasterWall: material.ceramic({
    name: "hermit-lime-plaster",
    color: "#f3e5c8",
    roughness: 0.42,
    clearcoat: 0.14
  }),
  ivoryBone: material.ceramic({
    name: "creature-ivory-bone",
    color: "#f6eed8",
    roughness: 0.26,
    clearcoat: 0.32
  }),
  celadonPot: material.ceramic({
    name: "hermit-celadon-pot",
    color: "#6ea38c",
    roughness: 0.2,
    clearcoat: 0.78
  }),

  // Carved stone, timber & creature hides
  carvedSandstone: material.matteClay({
    name: "carved-plateau-sandstone",
    color: "#b8966e",
    roughness: 0.84
  }),
  mossyMineralCap: material.matteClay({
    name: "mossy-mineral-stone",
    color: "#5d8444",
    roughness: 0.8
  }),
  cedarTimber: material.matteClay({
    name: "weathered-cedar-timber",
    color: "#6f4729",
    roughness: 0.76
  }),
  pteroSlateHide: material.matteClay({
    name: "pterosaur-slate-hide",
    color: "#556477",
    roughness: 0.68
  }),
  wingMembraneSheen: material.fabric({
    name: "pterosaur-wing-membrane",
    color: "#d9b982",
    roughness: 0.58,
    sheen: 0.65,
    sheenColor: "#ffe5b5",
    sheenRoughness: 0.42
  }),
  tyrantEmeraldHide: material.matteClay({
    name: "tyrant-emerald-hide",
    color: "#4a7938",
    roughness: 0.66
  }),
  tyrantOchreBelly: material.matteClay({
    name: "tyrant-ochre-belly",
    color: "#dfd0a0",
    roughness: 0.72
  }),

  // Translucent crystal star-sphere & cottage porthole dome glass (castShadow: false)
  starCrystalGlass: material.physical({
    name: "star-sphere-amber-crystal",
    color: "#ffb84d",
    roughness: 0.05,
    opacity: 0.55,
    clearcoat: 1,
    ior: 1.55
  }),
  portholeDomeGlass: material.physical({
    name: "hermit-porthole-dome-glass",
    color: "#ffd89a",
    roughness: 0.06,
    opacity: 0.58,
    clearcoat: 1,
    ior: 1.52
  }),

  // Practical emissive accents (all flagged practical: true for C-35 art audit)
  starCoreEmissive: material.emissive({
    name: "star-emblem-core",
    color: "#fff0a6",
    emissive: "#fff0a6",
    emissiveIntensity: 1.6,
    practical: true
  }),
  runeAmberEmissive: material.emissive({
    name: "boulder-rune-inlay",
    color: "#ffae38",
    emissive: "#ffae38",
    emissiveIntensity: 1.15,
    practical: true
  }),
  creatureEyeEmissive: material.emissive({
    name: "creature-amber-eye",
    color: "#ffd24a",
    emissive: "#ffd24a",
    emissiveIntensity: 1.1,
    practical: true
  }),
  lanternHeartEmissive: material.emissive({
    name: "hermit-lantern-heart",
    color: "#ffcf78",
    emissive: "#ffcf78",
    emissiveIntensity: 1.4,
    practical: true
  }),

  // Sky Kid Cloud-Surfer Hero multi-material palette
  heroWarmSkin: material.matteClay({
    name: "hero-warm-skin",
    color: "#f5c39e",
    roughness: 0.54
  }),
  heroRosyAccent: material.matteClay({
    name: "hero-rosy-accent",
    color: "#e68e74",
    roughness: 0.58
  }),
  heroObsidianHair: material.lacquer({
    name: "hero-obsidian-hair",
    color: "#181a24",
    roughness: 0.24,
    clearcoat: 0.68,
    clearcoatRoughness: 0.16
  }),
  heroEyeSclera: material.ceramic({
    name: "hero-eye-sclera",
    color: "#fffdf9",
    roughness: 0.14,
    clearcoat: 0.6
  }),
  heroEyeIris: material.lacquer({
    name: "hero-eye-iris",
    color: "#17141f",
    roughness: 0.08,
    clearcoat: 0.96,
    clearcoatRoughness: 0.05
  }),
  heroEyeCatchlight: material.ceramic({
    name: "hero-eye-catchlight",
    color: "#ffffff",
    roughness: 0.05,
    clearcoat: 1,
    emissive: "#ffffff",
    emissiveIntensity: 0.35
  }),
  heroSaffronTunic: material.fabric({
    name: "hero-saffron-tunic",
    color: "#eb5e28",
    roughness: 0.6,
    sheen: 0.84,
    sheenColor: "#ffc27a",
    sheenRoughness: 0.34
  }),
  heroIndigoCloth: material.fabric({
    name: "hero-indigo-cloth",
    color: "#243b7a",
    roughness: 0.56,
    sheen: 0.8,
    sheenColor: "#7ab2ff",
    sheenRoughness: 0.32
  }),
  heroBootCreamCuff: material.fabric({
    name: "hero-boot-cream-cuff",
    color: "#fbf3e4",
    roughness: 0.52,
    sheen: 0.9,
    sheenColor: "#ffffff",
    sheenRoughness: 0.28
  }),
  heroBootAmberSole: material.matteClay({
    name: "hero-boot-amber-sole",
    color: "#e09b38",
    roughness: 0.5
  }),
  heroStrapLeather: material.matteClay({
    name: "hero-strap-leather",
    color: "#6b4125",
    roughness: 0.68
  })
} as const;

// Instanced batch materials (>16 instances): strictly material.pbr with clearcoat: 0, sheen: 0
export const INSTANCED_MATERIALS = {
  bark: material.pbr({ name: "inst-cedar-bark", color: "#68442a", roughness: 0.86, metallic: 0, clearcoat: 0, sheen: 0 }),
  canopyDeep: material.pbr({ name: "inst-canopy-deep", color: "#4e8a3c", roughness: 0.72, metallic: 0, clearcoat: 0, sheen: 0 }),
  canopySunlit: material.pbr({ name: "inst-canopy-sunlit", color: "#76b44a", roughness: 0.68, metallic: 0, clearcoat: 0, sheen: 0 }),
  pineFoliage: material.pbr({ name: "inst-bonsai-pine", color: "#356c3b", roughness: 0.74, metallic: 0, clearcoat: 0, sheen: 0 }),
  shoulderStone: material.pbr({ name: "inst-shoulder-stone", color: "#a98c68", roughness: 0.86, metallic: 0, clearcoat: 0, sheen: 0 }),
  boulderMoss: material.pbr({ name: "inst-boulder-moss", color: "#628e42", roughness: 0.8, metallic: 0, clearcoat: 0, sheen: 0 }),
  karstLimestone: material.pbr({ name: "inst-karst-limestone", color: "#c99f6b", roughness: 0.84, metallic: 0, clearcoat: 0, sheen: 0 }),
  karstPlateauGrass: material.pbr({ name: "inst-karst-grass", color: "#5f9642", roughness: 0.78, metallic: 0, clearcoat: 0, sheen: 0 }),
  stormCloudBody: material.pbr({
    name: "inst-storm-cumulus",
    color: "#fffaf2",
    roughness: 0.52,
    metallic: 0,
    clearcoat: 0,
    sheen: 0,
    emissive: "#ffe8cc",
    emissiveIntensity: 0.28
  }),
  stormAnvilCrown: material.pbr({
    name: "inst-storm-anvil-crown",
    color: "#fffaf2",
    roughness: 0.46,
    metallic: 0,
    clearcoat: 0,
    sheen: 0,
    emissive: "#ffe8cc",
    emissiveIntensity: 0.3
  })
} as const;

// ---------------------------------------------------------------------------
// Smooth-Normal & Parametric Helpers
// ---------------------------------------------------------------------------

export function weldSmoothNormals(src: RawMesh): RawMesh {
  const map = new Map<string, number>();
  const positions: number[] = [];
  const uvs: number[] = [];
  const remap = new Int32Array(src.positions.length / 3);
  for (let i = 0; i < remap.length; i += 1) {
    const x = src.positions[i * 3]!;
    const y = src.positions[i * 3 + 1]!;
    const z = src.positions[i * 3 + 2]!;
    const key = `${Math.round(x * 4000)},${Math.round(y * 4000)},${Math.round(z * 4000)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      map.set(key, idx);
      positions.push(x, y, z);
      uvs.push(src.uvs[i * 2] ?? 0, src.uvs[i * 2 + 1] ?? 0);
    }
    remap[i] = idx;
  }
  const indices: number[] = [];
  const normals = new Float64Array(positions.length);
  for (let i = 0; i < src.indices.length; i += 3) {
    const a = remap[src.indices[i]!]!;
    const b = remap[src.indices[i + 1]!]!;
    const c = remap[src.indices[i + 2]!]!;
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
    const ax = positions[b * 3]! - positions[a * 3]!;
    const ay = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
    const az = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const bx = positions[c * 3]! - positions[a * 3]!;
    const by = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
    const bz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const v of [a, b, c]) {
      normals[v * 3] += nx;
      normals[v * 3 + 1] += ny;
      normals[v * 3 + 2] += nz;
    }
  }
  const outNormals = new Array<number>(positions.length);
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    outNormals[i] = normals[i]! / l;
    outNormals[i + 1] = normals[i + 1]! / l;
    outNormals[i + 2] = normals[i + 2]! / l;
  }
  return { positions, normals: outNormals, uvs, indices };
}

function smoothEllipsoid(rx: number, ry: number, rz: number, rings = 12, segs = 20, flattenBottom = 0): RawMesh {
  const profile: V2[] = [];
  for (let i = 0; i <= rings; i += 1) {
    const theta = -Math.PI * 0.5 + (i / rings) * Math.PI;
    const r = Math.max(0, Math.cos(theta));
    const rawY = Math.sin(theta);
    const y = flattenBottom > 0 && rawY < -1 + flattenBottom ? -1 + flattenBottom : rawY;
    profile.push([r, y]);
  }
  return weldSmoothNormals(transformMesh(latheMesh(profile, segs, false), { scale: [rx, ry, rz] }));
}

/** Smooth subdivisions=2 icosphere cumulus puff with upward-biased normals (>1.0 so even bottom vertices face skyward). */
function cumulusPuffMesh(rx: number, ry: number, rz: number, pos: V3, seed = 1, upwardNormalBias = 1.28): RawMesh {
  return transformMesh(icosphereSmoothMesh(1, 2, 0.065, seed, upwardNormalBias), { pos, scale: [rx, ry, rz] });
}

function starPrism3DMesh(outerR: number, innerR: number, thickness: number): RawMesh {
  const ring: V2[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 - Math.PI * 0.5;
    const r = i % 2 === 0 ? outerR : innerR;
    ring.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return extrudePolygonMesh(ring, thickness, thickness * 0.16, false);
}

// ---------------------------------------------------------------------------
// 1. Golden Cumulus Steed ("sky-cloud") & Extendable Sky Staff ("staff")
// ---------------------------------------------------------------------------

export function buildGoldenSkyCloudNode(): MultiMatNodeBuilder {
  const slots: MultiMatSlot[] = [];
  const smoothCloudBolster = (rx: number, ry: number, rz: number, pos: V3, seed: number, bias: number): RawMesh =>
    memoizeGeometry(`cumulus:sky-cloud-puff:${seed}:${rx.toFixed(2)}:${ry.toFixed(2)}:${rz.toFixed(2)}`, () =>
      transformMesh(
        weldSmoothNormals(subdivideSmoothMesh(icosphereSmoothMesh(1, 1, 0.085, seed, bias), 1, 0.56)),
        { pos, scale: [rx, ry, rz] }
      )
    );

  // Saddle mass sits around z = -0.65 so world.ts's (base + forward * 1.1) at scale 1.7 seats the runner squarely.
  const goldPuffs: readonly [V3, V3][] = [
    [[0, 0.34, -0.64], [0.7, 0.35, 0.74]],
    [[-0.46, 0.38, -0.52], [0.46, 0.31, 0.5]],
    [[0.48, 0.39, -0.54], [0.47, 0.32, 0.51]],
    [[0, 0.37, 0.02], [0.54, 0.33, 0.54]],
    [[-0.36, 0.35, -1.04], [0.43, 0.29, 0.45]],
    [[0.35, 0.36, -1.02], [0.42, 0.29, 0.45]],
    [[0, 0.33, -1.26], [0.45, 0.28, 0.47]]
  ];
  for (let i = 0; i < goldPuffs.length; i += 1) {
    const [pos, sc] = goldPuffs[i]!;
    slots.push({
      mesh: smoothCloudBolster(sc[0], sc[1], sc[2], pos, 17 + i * 11, 1.26),
      materialIndex: 0
    });
  }

  // Sun-kissed cream upper bolsters & prow crown
  const creamBolsters: readonly [V3, V3][] = [
    [[0, 0.57, -0.58], [0.48, 0.23, 0.5]],
    [[-0.34, 0.55, -0.64], [0.32, 0.21, 0.35]],
    [[0.34, 0.56, -0.64], [0.32, 0.21, 0.35]],
    [[0, 0.54, 0.02], [0.38, 0.23, 0.38]],
    [[0, 0.49, -1.08], [0.34, 0.21, 0.35]]
  ];
  for (let i = 0; i < creamBolsters.length; i += 1) {
    const [pos, sc] = creamBolsters[i]!;
    slots.push({
      mesh: smoothCloudBolster(sc[0], sc[1], sc[2], pos, 91 + i * 13, 1.3),
      materialIndex: 1
    });
  }

  // Sweeping S-curved trailing cumulus tail curl + prow spiral scroll (subdivideSmoothMesh)
  const tailCtrl: V3[] = [
    [0, 0.34, -0.98],
    [0.08, 0.28, -1.36],
    [-0.1, 0.35, -1.72],
    [0.04, 0.55, -2.04],
    [0, 0.74, -1.94],
    [0, 0.65, -1.78]
  ];
  const tailPts = catmullRomSpline3(tailCtrl, 5, false);
  const tailSpine: V4[] = tailPts.map((p, idx) => {
    const t = idx / Math.max(1, tailPts.length - 1);
    const rad = Math.max(0.038, 0.33 * Math.pow(1 - t, 0.78) + 0.045 * Math.sin(t * Math.PI * 3));
    return [p[0], p[1], p[2], rad];
  });
  slots.push({ mesh: weldSmoothNormals(subdivideSmoothMesh(tubeSweepMesh(tailSpine, 10, true), 1, 0.42)), materialIndex: 0 });

  // Twin lateral vortex curls hugging both flanks
  for (const side of [-1, 1] as const) {
    const curlPts = catmullRomSpline3([
      [side * 0.28, 0.35, 0.22],
      [side * 0.64, 0.31, -0.24],
      [side * 0.7, 0.37, -0.78],
      [side * 0.49, 0.5, -1.16],
      [side * 0.34, 0.58, -1.03]
    ], 4, false);
    const curlSpine: V4[] = curlPts.map((p, idx) => {
      const t = idx / Math.max(1, curlPts.length - 1);
      return [p[0], p[1], p[2], Math.max(0.032, 0.145 * (1 - t * 0.68))];
    });
    slots.push({ mesh: weldSmoothNormals(tubeSweepMesh(curlSpine, 10, true)), materialIndex: 2 });
  }

  return assembleMultiMaterialNode(
    "sky-cloud",
    slots,
    [CUMULUS_MATERIALS.cumulusGoldPlush, CUMULUS_MATERIALS.cumulusCreamPuff, CUMULUS_MATERIALS.cumulusAmberBraid],
    { id: "sky-cloud", castShadow: false, receiveShadow: false, visible: false, coalesceColors: true }
  );
}

export function buildSkyStaffNode(): MultiMatNodeBuilder {
  // Exact y in [0, 1] local bounds so staff.setScale([1, l, 1]) bridges gorges cleanly
  const shaftProfile: V2[] = [
    [0, 0.06],
    [0.128, 0.06],
    [0.132, 0.5],
    [0.128, 0.94],
    [0, 0.94]
  ];
  const ferruleBot: V2[] = [
    [0, 0],
    [0.185, 0],
    [0.2, 0.018],
    [0.2, 0.055],
    [0.165, 0.068],
    [0.132, 0.072]
  ];
  const ferruleTop: V2[] = [
    [0.132, 0.928],
    [0.165, 0.932],
    [0.2, 0.945],
    [0.2, 0.982],
    [0.185, 1.0],
    [0, 1.0]
  ];
  const collarRing: V2[] = [
    [0.13, -0.008],
    [0.172, -0.006],
    [0.172, 0.006],
    [0.13, 0.008]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(shaftProfile, 16, false), materialIndex: 0 },
    { mesh: latheMesh(ferruleBot, 16, false), materialIndex: 1 },
    { mesh: latheMesh(ferruleTop, 16, false), materialIndex: 1 },
    { mesh: transformMesh(latheMesh(collarRing, 16, false), { pos: [0, 0.082, 0] }), materialIndex: 2 },
    { mesh: transformMesh(latheMesh(collarRing, 16, false), { pos: [0, 0.918, 0] }), materialIndex: 2 }
  ];
  return assembleMultiMaterialNode(
    "staff",
    slots,
    [CUMULUS_MATERIALS.vermilionLacquer, CUMULUS_MATERIALS.engravedBrass, CUMULUS_MATERIALS.darkBronzeHardware],
    { id: "staff", castShadow: false, receiveShadow: false, visible: false, coalesceColors: true }
  );
}

// ---------------------------------------------------------------------------
// 2. Celestial Pickups: Crystal Star-Spheres, Honey-Peach Roast & Sky-Coins
// ---------------------------------------------------------------------------

function circleTubeMesh(radius: number, tubeR: number, segs = 24, axis: "x" | "y" | "z" = "y"): RawMesh {
  const spine: V4[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    if (axis === "y") spine.push([c, 0, s, tubeR]);
    else if (axis === "x") spine.push([0, c, s, tubeR]);
    else spine.push([c, s, 0, tubeR]);
  }
  return weldSmoothNormals(tubeSweepMesh(spine, 8, false));
}

function starConstellationOffsets(count: number): V3[] {
  const n = Math.max(1, Math.min(7, Math.round(count)));
  if (n === 1) return [[0, 0, 0]];
  if (n === 2) return [[-0.13, 0.04, 0], [0.13, -0.04, 0]];
  const out: V3[] = [];
  const ringCount = n >= 6 ? n - 1 : n;
  if (n >= 6) out.push([0, 0, 0]);
  const ringR = n <= 4 ? 0.16 : 0.19;
  for (let i = 0; i < ringCount; i += 1) {
    const a = (i / ringCount) * Math.PI * 2 - Math.PI * 0.5;
    out.push([Math.cos(a) * ringR, Math.sin(a) * ringR, (i % 2 === 0 ? 1 : -1) * 0.03]);
  }
  return out;
}

export function buildStarSphereNode(star: number): MultiMatNodeBuilder {
  const offsets = starConstellationOffsets(star);
  const starScale = star <= 2 ? 0.13 : star <= 4 ? 0.095 : 0.082;
  const starMesh = starPrism3DMesh(starScale, starScale * 0.44, starScale * 0.48);
  const slots: MultiMatSlot[] = [];
  for (const off of offsets) {
    slots.push({ mesh: transformMesh(starMesh, { pos: off }), materialIndex: 0 });
  }
  // Engraved brass meridian ring cradling the crystal shell
  slots.push({
    mesh: transformMesh(circleTubeMesh(0.485, 0.018, 28, "y"), { rot: [0.38, 0, 0.24] }),
    materialIndex: 1
  });
  // Smooth crystal amber outer sphere (rendered after inner star emblem)
  slots.push({
    mesh: smoothEllipsoid(0.475, 0.475, 0.475, 16, 28, 0),
    materialIndex: 2
  });
  return assembleMultiMaterialNode(
    `ball-${star}`,
    slots,
    [CUMULUS_MATERIALS.starCoreEmissive, CUMULUS_MATERIALS.engravedBrass, CUMULUS_MATERIALS.starCrystalGlass],
    { id: `ball-${star}`, castShadow: false, receiveShadow: false }
  );
}

export function buildHoneyRoastPickupNode(index: number): MultiMatNodeBuilder {
  const haunch = memoizeGeometry("cumulus:roast-haunch", () => {
    const roastProfile: V2[] = bezierCurve2([0, -0.52], [0.48, -0.46], [0.5, 0.46], [0, 0.52], 14);
    return weldSmoothNormals(transformMesh(latheMesh(roastProfile, 18, false), { rot: [Math.PI * 0.5, 0, 0] }));
  });
  const glazeCrown = memoizeGeometry("cumulus:roast-glaze", () =>
    transformMesh(smoothEllipsoid(0.28, 0.14, 0.34, 8, 14, 0), { pos: [0.06, 0.32, 0] })
  );
  const boneAssembly = memoizeGeometry("cumulus:roast-bone", () => {
    const boneShaft = tubeSweepMesh([[0, 0, -0.78, 0.085], [0, 0, 0.78, 0.085]], 8, false);
    const knob = smoothEllipsoid(0.11, 0.1, 0.11, 6, 10, 0);
    return mergeRawMeshes([
      boneShaft,
      transformMesh(knob, { pos: [-0.06, 0.02, 0.8] }),
      transformMesh(knob, { pos: [0.06, -0.02, 0.8] }),
      transformMesh(knob, { pos: [-0.06, 0.02, -0.8] }),
      transformMesh(knob, { pos: [0.06, -0.02, -0.8] })
    ]);
  });
  const peachAssembly = memoizeGeometry("cumulus:roast-peach", () => {
    const peachHalf = smoothEllipsoid(0.2, 0.22, 0.19, 8, 14, 0);
    return mergeRawMeshes([
      transformMesh(peachHalf, { pos: [0.28, 0.24, 0.16] }),
      transformMesh(peachHalf, { pos: [0.33, 0.25, 0.12] })
    ]);
  });
  const leafMesh = memoizeGeometry("cumulus:roast-leaf", () => {
    const leafPoly: V2[] = [[0, 0], [0.09, 0.05], [0.18, 0.02], [0.24, 0], [0.18, -0.03], [0.08, -0.05]];
    return transformMesh(extrudePolygonMesh(leafPoly, 0.024, 0.006, false), {
      pos: [0.3, 0.45, 0.14],
      rot: [0.5, 0.3, 0.25]
    });
  });
  const slots: MultiMatSlot[] = [
    { mesh: haunch, materialIndex: 0 },
    { mesh: glazeCrown, materialIndex: 1 },
    { mesh: boneAssembly, materialIndex: 2 },
    { mesh: peachAssembly, materialIndex: 3 },
    { mesh: leafMesh, materialIndex: 4 }
  ];
  return assembleMultiMaterialNode(
    `meat-${index}`,
    slots,
    [
      CUMULUS_MATERIALS.roastHoneyGlaze,
      CUMULUS_MATERIALS.cumulusAmberBraid,
      CUMULUS_MATERIALS.ivoryBone,
      CUMULUS_MATERIALS.peachBlushGlaze,
      CUMULUS_MATERIALS.mossyMineralCap
    ],
    { id: `meat-${index}`, castShadow: false, receiveShadow: false, coalesceColors: true }
  );
}

export function buildSkyCoinNode(index: number): MultiMatNodeBuilder {
  // Upright turned brass sky-coin in XY (radius 0.32m) with raised rim and glowing amber star cabochon
  const rim = memoizeGeometry("cumulus:sky-coin-rim", () => {
    const coinProfile: V2[] = [
      [0, -0.038],
      [0.24, -0.038],
      [0.26, -0.056],
      [0.32, -0.052],
      [0.33, 0],
      [0.32, 0.052],
      [0.26, 0.056],
      [0.24, 0.038],
      [0, 0.038]
    ];
    return transformMesh(latheMesh(coinProfile, 18, false), { rot: [Math.PI * 0.5, 0, 0] });
  });
  const gem = memoizeGeometry("cumulus:sky-coin-gem", () => starPrism3DMesh(0.15, 0.07, 0.11));
  const slots: MultiMatSlot[] = [
    { mesh: rim, materialIndex: 0 },
    { mesh: gem, materialIndex: 1 }
  ];
  return assembleMultiMaterialNode(
    `sky-coin-${index}`,
    slots,
    [CUMULUS_MATERIALS.engravedBrass, CUMULUS_MATERIALS.starCoreEmissive],
    { id: `sky-coin-${index}`, castShadow: false, receiveShadow: false, visible: false }
  );
}

// ---------------------------------------------------------------------------
// 3. Carved Rolling Rune Boulder ("boulder-i", y in [0, 2.0], centre [0, 1.0, 0])
// ---------------------------------------------------------------------------

export function buildCarvedBoulderNode(index: number): MultiMatNodeBuilder {
  // Local radius = 1.0 centered at [0, 1.0, 0] (y in [0, 2.0]) so world.ts's setScale(1.9) and
  // pivot offset (1.9) roll cleanly on the road with zero floating or sinking at every roll angle.
  const variant = Math.abs(index) % 3;
  const stoneMesh = memoizeGeometry(`cumulus:boulder-stone:${variant}`, () => {
    const core = smoothEllipsoid(0.97, 0.97, 0.97, 14, 22, 0);
    for (let i = 0; i < core.positions.length; i += 3) {
      const x = core.positions[i]!;
      const y = core.positions[i + 1]!;
      const z = core.positions[i + 2]!;
      const n = fbm3(x * 1.8 + variant * 2.1, y * 1.8, z * 1.8 - variant * 1.3, 41 + variant);
      const k = 0.95 + n * 0.09;
      core.positions[i] = x * k;
      core.positions[i + 1] = Math.max(0, Math.min(2.0, 1.0 + y * k));
      core.positions[i + 2] = z * k;
    }
    const rockBody = weldSmoothNormals(core);
    const eqStoneBand = transformMesh(circleTubeMesh(0.985, 0.065, 22, "y"), { pos: [0, 1.0, 0] });
    const merStoneBand = transformMesh(circleTubeMesh(0.985, 0.06, 22, "z"), { pos: [0, 1.0, 0] });
    return mergeRawMeshes([rockBody, eqStoneBand, merStoneBand]);
  });
  const mossMesh = memoizeGeometry("cumulus:boulder-moss", () =>
    mergeRawMeshes([
      transformMesh(smoothEllipsoid(0.58, 0.16, 0.56, 7, 14, 0.3), { pos: [0, 1.84, 0] }),
      transformMesh(smoothEllipsoid(0.42, 0.18, 0.44, 7, 12, 0.2), {
        pos: [0.68, 1.38, 0.32],
        rot: [0.3, 0.4, -0.6]
      })
    ])
  );
  const runeMesh = memoizeGeometry("cumulus:boulder-runes", () =>
    mergeRawMeshes([
      transformMesh(circleTubeMesh(1.005, 0.022, 22, "y"), { pos: [0, 1.0, 0] }),
      transformMesh(circleTubeMesh(1.005, 0.02, 22, "x"), { pos: [0, 1.0, 0] })
    ])
  );

  const slots: MultiMatSlot[] = [
    { mesh: stoneMesh, materialIndex: 0 },
    { mesh: mossMesh, materialIndex: 1 },
    { mesh: runeMesh, materialIndex: 2 }
  ];
  return assembleMultiMaterialNode(
    `boulder-${index}`,
    slots,
    [CUMULUS_MATERIALS.carvedSandstone, CUMULUS_MATERIALS.mossyMineralCap, CUMULUS_MATERIALS.runeAmberEmissive],
    { id: `boulder-${index}`, castShadow: false, receiveShadow: false, visible: false }
  );
}

// ---------------------------------------------------------------------------
// 4. Articulated Sky Creatures: Sky-Pterosaur & Storm Tyrant Lizard
// ---------------------------------------------------------------------------

function ellipseSection(cx: number, cy: number, cz: number, rx: number, ry: number, segs = 14, pitch = 0): V3[] {
  const ring: V3[] = [];
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const lx = Math.cos(a) * rx;
    const ly = Math.sin(a) * ry;
    ring.push([cx + lx, cy + ly * cp, cz + ly * sp]);
  }
  return ring;
}

export function buildSkyPterosaurNode(index: number): MultiMatNodeBuilder {
  // Local +Z faces toward the runner; pre-scale bounds y in [0.06, 1.7], wingspan ~2.56m
  const slots: MultiMatSlot[] = [];
  const bodySections: V3[][] = [
    ellipseSection(0, 0.72, -0.96, 0.03, 0.03, 14),
    ellipseSection(0, 0.75, -0.58, 0.12, 0.11, 14),
    ellipseSection(0, 0.8, -0.18, 0.24, 0.22, 14),
    ellipseSection(0, 0.84, 0.22, 0.28, 0.25, 14),
    ellipseSection(0, 0.96, 0.52, 0.16, 0.17, 14, 0.25),
    ellipseSection(0, 1.14, 0.72, 0.17, 0.18, 14, 0.15),
    ellipseSection(0, 1.15, 0.92, 0.12, 0.13, 14)
  ];
  slots.push({ mesh: loftSectionsMesh(bodySections, true, false), materialIndex: 0 });

  // Underbelly keel in warm membrane sheen
  slots.push({
    mesh: transformMesh(smoothEllipsoid(0.2, 0.14, 0.42, 10, 16, 0), { pos: [0, 0.72, 0.08] }),
    materialIndex: 1
  });

  // Tapered spear upper & lower beak (+Z)
  const upperBeak = loftSectionsMesh([
    ellipseSection(0, 1.16, 0.88, 0.11, 0.09, 10),
    ellipseSection(0, 1.13, 1.32, 0.06, 0.05, 10),
    ellipseSection(0, 1.09, 1.78, 0.012, 0.012, 10)
  ], true, false);
  const lowerBeak = loftSectionsMesh([
    ellipseSection(0, 1.06, 0.86, 0.085, 0.05, 10),
    ellipseSection(0, 1.01, 1.24, 0.045, 0.03, 10),
    ellipseSection(0, 0.98, 1.58, 0.01, 0.01, 10)
  ], true, false);
  slots.push({ mesh: upperBeak, materialIndex: 3 }, { mesh: lowerBeak, materialIndex: 3 });

  // Swept royal-crimson cranial crest
  const crestBlade = loftSectionsMesh([
    ellipseSection(0, 1.22, 0.84, 0.04, 0.09, 10),
    ellipseSection(0, 1.44, 0.44, 0.03, 0.14, 10),
    ellipseSection(0, 1.66, -0.08, 0.015, 0.08, 10),
    ellipseSection(0, 1.7, -0.28, 0.006, 0.02, 10)
  ], true, false);
  slots.push({ mesh: crestBlade, materialIndex: 2 });

  // Cambered patagium wings + leading-edge wing spars + wing-thumb claws + tucked talons
  for (const side of [-1, 1] as const) {
    const spar: V4[] = [
      [side * 0.22, 0.88, 0.24, 0.055],
      [side * 0.62, 1.04, 0.18, 0.042],
      [side * 1.02, 1.08, -0.02, 0.03],
      [side * 1.28, 0.96, -0.34, 0.014]
    ];
    slots.push({ mesh: weldSmoothNormals(tubeSweepMesh(spar, 8, false)), materialIndex: 0 });

    const wingMembrane = loftSectionsMesh([
      [
        [side * 0.2, 0.87, 0.24],
        [side * 0.22, 0.89, 0.02],
        [side * 0.18, 0.8, -0.44],
        [side * 0.2, 0.84, 0.02]
      ],
      [
        [side * 0.64, 1.03, 0.18],
        [side * 0.62, 1.06, -0.08],
        [side * 0.56, 0.92, -0.56],
        [side * 0.6, 1.0, -0.08]
      ],
      [
        [side * 1.02, 1.07, -0.02],
        [side * 0.98, 1.08, -0.22],
        [side * 0.88, 0.95, -0.62],
        [side * 0.95, 1.03, -0.22]
      ],
      [
        [side * 1.28, 0.96, -0.34],
        [side * 1.24, 0.96, -0.42],
        [side * 1.18, 0.91, -0.54],
        [side * 1.22, 0.94, -0.42]
      ]
    ], true, false);
    slots.push({ mesh: wingMembrane, materialIndex: 1 });

    // Wing thumb claw & tucked hind leg talon
    slots.push({
      mesh: tubeSweepMesh([[side * 0.62, 1.05, 0.2, 0.022], [side * 0.66, 1.02, 0.34, 0.004]], 6, false),
      materialIndex: 3
    });
    const leg: V4[] = [
      [side * 0.14, 0.68, -0.32, 0.045],
      [side * 0.18, 0.36, -0.44, 0.032],
      [side * 0.18, 0.14, -0.36, 0.024]
    ];
    slots.push({ mesh: tubeSweepMesh(leg, 7, false), materialIndex: 0 });
    for (const toe of [-0.04, 0, 0.04]) {
      slots.push({
        mesh: tubeSweepMesh([[side * 0.18 + toe, 0.14, -0.35, 0.016], [side * 0.18 + toe * 1.3, 0.06, -0.22, 0.004]], 5, false),
        materialIndex: 3
      });
    }
    // Glowing amber eye
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.038, 0.042, 0.048, 8, 12, 0), { pos: [side * 0.12, 1.19, 0.82] }),
      materialIndex: 4
    });
  }

  return assembleMultiMaterialNode(
    `ptera-body-${index}`,
    slots,
    [
      CUMULUS_MATERIALS.pteroSlateHide,
      CUMULUS_MATERIALS.wingMembraneSheen,
      CUMULUS_MATERIALS.crimsonRoofGlaze,
      CUMULUS_MATERIALS.ivoryBone,
      CUMULUS_MATERIALS.creatureEyeEmissive
    ],
    { id: `ptera-body-${index}`, castShadow: false, receiveShadow: false, visible: false, coalesceColors: true }
  );
}

export function buildStormTyrantNode(): MultiMatNodeBuilder {
  // Grounded feet at y = 0, crown height ~8.4m, facing +Z
  const slots: MultiMatSlot[] = [];
  const spineSections: V3[][] = [
    ellipseSection(0, 4.35, -5.6, 0.08, 0.09, 16),
    ellipseSection(0, 4.2, -3.9, 0.48, 0.52, 16),
    ellipseSection(0, 4.35, -2.1, 0.98, 1.08, 16),
    ellipseSection(0, 4.65, -0.3, 1.48, 1.68, 16),
    ellipseSection(0, 5.05, 1.35, 1.36, 1.58, 16, 0.18),
    ellipseSection(0, 5.95, 2.35, 0.96, 1.08, 16, 0.35),
    ellipseSection(0, 6.85, 2.85, 0.82, 0.88, 16, 0.2)
  ];
  slots.push({ mesh: loftSectionsMesh(spineSections, true, false), materialIndex: 0 });

  // Sculpted ochre chest & underbelly armor
  const bellySections: V3[][] = [
    ellipseSection(0, 3.65, -1.5, 0.65, 0.42, 12),
    ellipseSection(0, 3.55, 0.2, 1.05, 0.62, 12),
    ellipseSection(0, 4.15, 1.7, 0.92, 0.58, 12, 0.25),
    ellipseSection(0, 5.35, 2.55, 0.58, 0.42, 12, 0.35)
  ];
  slots.push({ mesh: loftSectionsMesh(bellySections, true, false), materialIndex: 1 });

  // Fierce armored upper skull & roaring lower jaw (+Z)
  const upperSkull = loftSectionsMesh([
    ellipseSection(0, 7.25, 2.55, 0.92, 0.88, 14),
    ellipseSection(0, 7.35, 3.55, 0.78, 0.76, 14),
    ellipseSection(0, 7.18, 4.55, 0.56, 0.54, 14),
    ellipseSection(0, 6.95, 4.95, 0.32, 0.3, 14)
  ], true, false);
  const lowerJaw = loftSectionsMesh([
    ellipseSection(0, 6.45, 2.65, 0.74, 0.42, 12),
    ellipseSection(0, 6.12, 3.55, 0.58, 0.32, 12, -0.18),
    ellipseSection(0, 5.88, 4.45, 0.36, 0.22, 12, -0.18)
  ], true, false);
  slots.push({ mesh: upperSkull, materialIndex: 0 }, { mesh: lowerJaw, materialIndex: 0 });

  // Digitigrade hind legs grounded cleanly at y = 0 + hooked forelimbs + teeth + brow horns
  for (const side of [-1, 1] as const) {
    const legSpine: V4[] = [
      [side * 1.28, 4.45, -0.35, 0.92],
      [side * 1.42, 2.75, 0.22, 0.66],
      [side * 1.36, 1.35, -0.32, 0.44],
      [side * 1.36, 0.32, 0.24, 0.38],
      [side * 1.36, 0.02, 0.36, 0.42]
    ];
    slots.push({ mesh: weldSmoothNormals(tubeSweepMesh(legSpine, 12, false)), materialIndex: 0 });
    for (const [tx, tz] of [[-0.32, 0.95], [0, 1.12], [0.32, 0.95]] as const) {
      slots.push({
        mesh: tubeSweepMesh([
          [side * 1.36 + tx * 0.5, 0.22, 0.42, 0.18],
          [side * 1.36 + tx, 0.12, tz, 0.12],
          [side * 1.36 + tx * 1.15, 0.04, tz + 0.34, 0.02]
        ], 7, false),
        materialIndex: 3
      });
    }
    const armSpine: V4[] = [
      [side * 1.05, 4.85, 1.95, 0.28],
      [side * 1.12, 4.18, 2.42, 0.2],
      [side * 0.96, 3.88, 2.75, 0.12]
    ];
    slots.push({ mesh: weldSmoothNormals(tubeSweepMesh(armSpine, 8, false)), materialIndex: 0 });
    slots.push({
      mesh: tubeSweepMesh([[side * 0.96, 3.88, 2.75, 0.07], [side * 0.88, 3.68, 2.98, 0.015]], 6, false),
      materialIndex: 3
    });
    // Brow crest horn & glowing amber eye
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.36, 0.56, 0.06), { pos: [side * 0.68, 7.98, 3.22], rot: [-0.25, 0, side * -0.28] }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.14, 0.15, 0.18, 8, 12, 0), { pos: [side * 0.76, 7.48, 3.38] }),
      materialIndex: 4
    });
    // Conical ivory teeth along upper & lower jaws
    for (let t = 0; t < 5; t += 1) {
      const tz = 3.25 + t * 0.34;
      const xw = 0.58 - t * 0.055;
      slots.push({
        mesh: tubeSweepMesh([[side * xw, 6.82, tz, 0.075], [side * xw, 6.46, tz + 0.03, 0.01]], 6, false),
        materialIndex: 3
      });
      slots.push({
        mesh: tubeSweepMesh([[side * (xw * 0.86), 6.08, tz - 0.06, 0.065], [side * (xw * 0.86), 6.38, tz - 0.04, 0.01]], 6, false),
        materialIndex: 3
      });
    }
  }

  // Dorsal armored crimson osteoderm ridge plates from crown to tail
  const platePoly: V2[] = [[-0.24, 0], [0.24, 0], [0.08, 0.44], [-0.08, 0.44]];
  const plateBase = extrudePolygonMesh(platePoly, 0.14, 0.03, false);
  const dorsalPts: readonly [number, number, number, number][] = [
    [8.02, 2.85, 0.9, 0.15],
    [6.95, 2.45, 1.0, 0.3],
    [5.85, 1.55, 1.05, 0.12],
    [5.62, 0.15, 1.1, 0],
    [5.35, -1.25, 0.95, -0.08],
    [4.95, -2.65, 0.78, -0.1],
    [4.62, -3.95, 0.56, -0.05]
  ];
  for (const [py, pz, sc, pitch] of dorsalPts) {
    slots.push({
      mesh: transformMesh(plateBase, { pos: [0, py, pz], rot: [pitch, Math.PI * 0.5, 0], scale: sc }),
      materialIndex: 2
    });
  }

  return assembleMultiMaterialNode(
    "rex-body",
    slots,
    [
      CUMULUS_MATERIALS.tyrantEmeraldHide,
      CUMULUS_MATERIALS.tyrantOchreBelly,
      CUMULUS_MATERIALS.crimsonRoofGlaze,
      CUMULUS_MATERIALS.ivoryBone,
      CUMULUS_MATERIALS.creatureEyeEmissive
    ],
    { id: "rex-body", castShadow: true, receiveShadow: false, visible: false, coalesceColors: true }
  );
}

// ---------------------------------------------------------------------------
// 5. Sky Hermit Island Cottage ("home-hut") & Crimson Sanctuary Torii Gates
// ---------------------------------------------------------------------------

export function buildSkyHermitCottageNode(position: V3, yaw: number): MultiMatNodeBuilder {
  // Fits strictly inside finaleBlocked clearance (radius <= 3.70m < 3.9m, height <= 5.60m < 6.4m)
  const slots: MultiMatSlot[] = [];

  // Stepped dressed sandstone plinth + front flagstone entry steps (+Z faces track)
  const plinthProfile: V2[] = [
    [0, -0.16],
    [3.22, -0.16],
    [3.22, 0.12],
    [2.98, 0.16],
    [2.98, 0.36],
    [0, 0.36]
  ];
  slots.push({ mesh: latheMesh(plinthProfile, 24, false), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.65, 0.22, 0.62, 0.04), { pos: [0, 0.04, 3.12] }), materialIndex: 0 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.42, 0.22, 0.44, 0.04), { pos: [0, 0.24, 2.86] }), materialIndex: 0 });

  // Cylindrical lime-plaster cottage wall + timber ring beams
  const wallProfile: V2[] = [
    [2.64, 0.35],
    [2.66, 1.4],
    [2.6, 3.04],
    [0, 3.04]
  ];
  slots.push({ mesh: latheMesh(wallProfile, 24, false), materialIndex: 1 });
  slots.push({ mesh: transformMesh(circleTubeMesh(2.67, 0.07, 24, "y"), { pos: [0, 0.44, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(circleTubeMesh(2.63, 0.08, 24, "y"), { pos: [0, 2.94, 0] }), materialIndex: 2 });

  // Timber veranda porch columns, deck, arched door & hanging lantern (+Z)
  slots.push({ mesh: transformMesh(bevelBoxMesh(2.1, 0.14, 0.72, 0.03), { pos: [0, 0.36, 2.84] }), materialIndex: 2 });
  for (const sx of [-0.88, 0.88] as const) {
    slots.push({
      mesh: tubeSweepMesh([[sx, 0.4, 3.05, 0.095], [sx, 2.48, 3.05, 0.082]], 10, false),
      materialIndex: 2
    });
  }
  slots.push({
    mesh: transformMesh(bevelBoxMesh(2.35, 0.14, 0.95, 0.04), { pos: [0, 2.55, 2.95], rot: [0.22, 0, 0] }),
    materialIndex: 3
  });
  // Recessed cedar door + masonry voussoir arch + brass knocker + warm porch lantern
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.08, 1.86, 0.16, 0.03), { pos: [0, 1.32, 2.62] }), materialIndex: 2 });
  for (const s of archwayVoussoirSlots({ radius: 0.54, thickness: 0.16, depth: 0.2, voussoirs: 7, stoneMatA: 0, stoneMatB: 0, keystoneMat: 4 })) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0, 1.78, 2.64] }), materialIndex: s.materialIndex });
  }
  slots.push({ mesh: transformMesh(circleTubeMesh(0.11, 0.022, 16, "z"), { pos: [0.28, 1.28, 2.72] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(smoothEllipsoid(0.14, 0.18, 0.14, 8, 14, 0), { pos: [-0.62, 2.18, 3.04] }), materialIndex: 5 });

  // Round porthole windows with brass bezels, warm interior glow & convex crystal dome glass
  for (const ang of [0.72, -0.78, 2.15]) {
    const wx = Math.sin(ang) * 2.62;
    const wz = Math.cos(ang) * 2.62;
    slots.push({
      mesh: transformMesh(circleTubeMesh(0.42, 0.055, 20, "z"), { pos: [wx, 1.92, wz], rot: [0, ang, 0] }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.05, 0.76, 0.04, 0.01), { pos: [wx, 1.92, wz], rot: [0, ang, 0] }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.35, 0.35, 0.06, 8, 16, 0), { pos: [Math.sin(ang) * 2.56, 1.92, Math.cos(ang) * 2.56], rot: [0, ang, 0] }),
      materialIndex: 5
    });
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.38, 0.38, 0.14, 10, 18, 0), { pos: [Math.sin(ang) * 2.64, 1.92, Math.cos(ang) * 2.64], rot: [0, ang, 0] }),
      materialIndex: 8
    });
  }

  // Swept concave pagoda-curved glazed tile roof + 12 radial hip ribs + brass lotus spire finial
  const roofCurve = bezierCurve2([3.66, 2.92], [2.42, 3.36], [1.06, 4.22], [0, 5.04], 16);
  const roofProfile: V2[] = [[0, 2.9], [3.62, 2.86], ...roofCurve];
  slots.push({ mesh: weldSmoothNormals(latheMesh(roofProfile, 28, false)), materialIndex: 3 });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rib: V4[] = [
      [sa * 3.64, 2.94, ca * 3.64, 0.045],
      [sa * 2.15, 3.55, ca * 2.15, 0.04],
      [sa * 0.72, 4.48, ca * 0.72, 0.032],
      [0, 5.06, 0, 0.025]
    ];
    slots.push({ mesh: tubeSweepMesh(rib, 7, false), materialIndex: 3 });
  }
  const finialProfile: V2[] = [
    [0, 5.0],
    [0.32, 5.04],
    [0.14, 5.18],
    [0.22, 5.3],
    [0.08, 5.44],
    [0.02, 5.58],
    [0, 5.6]
  ];
  slots.push({ mesh: latheMesh(finialProfile, 16, false), materialIndex: 4 });

  // Potted verandah bonsai pine beside the steps
  const potProfile: V2[] = [[0, 0.36], [0.24, 0.36], [0.32, 0.62], [0.28, 0.66], [0, 0.64]];
  slots.push({ mesh: transformMesh(latheMesh(potProfile, 14, false), { pos: [1.32, 0, 2.68] }), materialIndex: 6 });
  slots.push({
    mesh: tubeSweepMesh([[1.32, 0.62, 2.68, 0.055], [1.42, 0.92, 2.74, 0.04], [1.28, 1.18, 2.66, 0.024]], 7, false),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(weldSmoothNormals(layeredCanopyMesh({ radius: 0.36, height: 0.34, puffs: 6, seed: 33 })), {
      pos: [1.3, 1.08, 2.66]
    }),
    materialIndex: 7
  });

  return assembleMultiMaterialNode(
    "home-hut",
    slots,
    [
      CUMULUS_MATERIALS.carvedSandstone,
      CUMULUS_MATERIALS.limePlasterWall,
      CUMULUS_MATERIALS.cedarTimber,
      CUMULUS_MATERIALS.crimsonRoofGlaze,
      CUMULUS_MATERIALS.engravedBrass,
      CUMULUS_MATERIALS.lanternHeartEmissive,
      CUMULUS_MATERIALS.celadonPot,
      CUMULUS_MATERIALS.mossyMineralCap,
      CUMULUS_MATERIALS.portholeDomeGlass
    ],
    { id: "home-hut", position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: false, coalesceColors: true }
  );
}

export function buildSanctuaryToriiNode(name: string, position: V3, yaw: number): MultiMatNodeBuilder {
  // Open-sightline twin vermilion sanctuary sky-gate pillars at x = +/-7.55m (cleanly outside ROAD_HALF = 6.2m) with ZERO
  // overhead crossbars spanning across the track so upcoming obstacles, dives, and collectibles stay 100% unobstructed,
  // enriched with curved side-cantilever pagoda eaves and suspended cast-bronze temple bells (bonsho)!
  const vermilionMesh = memoizeGeometry("cumulus:torii-vermilion", () => {
    const parts: RawMesh[] = [];
    for (const sx of [-7.55, 7.55] as const) {
      const side = sx > 0 ? 1 : -1;
      const capX = sx * 0.99;
      parts.push(tubeSweepMesh([[sx, 0.48, 0, 0.38], [capX, 6.45, 0, 0.29]], 14, false));
      const eaveCurve = bezierCurve2([0.96, 7.18], [0.58, 7.38], [0.24, 7.66], [0, 7.94], 10);
      parts.push(transformMesh(weldSmoothNormals(latheMesh([[0, 7.16], ...eaveCurve], 16, false)), { pos: [capX, 0, 0] }));
      // Inward-cantilevered vermilion kasagi eave bracket (reaches x = +/-6.48m, strictly outside ROAD_HALF = 6.2m)
      parts.push(
        weldSmoothNormals(
          tubeSweepMesh([
            [capX + side * 0.55, 5.82, 0, 0.12],
            [capX, 5.76, 0, 0.14],
            [capX - side * 0.98, 5.92, 0, 0.11]
          ], 8, true)
        )
      );
      parts.push(
        weldSmoothNormals(
          tubeSweepMesh([
            [capX, 5.18, 0, 0.08],
            [capX - side * 0.62, 5.8, 0, 0.065]
          ], 6, true)
        )
      );
    }
    return mergeRawMeshes(parts);
  });

  const obsidianMesh = memoizeGeometry("cumulus:torii-obsidian", () => {
    const parts: RawMesh[] = [];
    for (const sx of [-7.55, 7.55] as const) {
      const side = sx > 0 ? 1 : -1;
      const capX = sx * 0.99;
      const shoeProfile: V2[] = [[0, -0.4], [0.64, -0.4], [0.58, 0.48], [0.44, 0.56], [0, 0.56]];
      parts.push(transformMesh(latheMesh(shoeProfile, 16, false), { pos: [sx, 0, 0] }));
      parts.push(transformMesh(bevelBoxMesh(1.2, 0.16, 1.2, 0.035), { pos: [capX, 6.52, 0] }));
      // Suspended cedar bell-striker beam (shumoku) beside the bronze bell
      parts.push(
        transformMesh(bevelBoxMesh(0.11, 0.11, 0.62, 0.025), {
          pos: [capX - side * 0.78, 4.78, 0.48]
        })
      );
    }
    return mergeRawMeshes(parts);
  });

  const bronzeMesh = memoizeGeometry("cumulus:torii-bronze", () => {
    const parts: RawMesh[] = [];
    const bellProfile: V2[] = [
      [0.14, 0],
      [0.34, 0],
      [0.37, 0.045],
      [0.33, 0.12],
      [0.31, 0.42],
      [0.27, 0.68],
      [0.18, 0.82],
      [0, 0.86]
    ];
    const bellUnit = weldSmoothNormals(latheMesh(bellProfile, 18, false));
    for (const sx of [-7.55, 7.55] as const) {
      const side = sx > 0 ? 1 : -1;
      const capX = sx * 0.99;
      const bellX = capX - side * 0.78;
      parts.push(transformMesh(circleTubeMesh(0.35, 0.045, 16, "y"), { pos: [sx * 0.992, 5.15, 0] }));
      parts.push(transformMesh(circleTubeMesh(0.33, 0.042, 16, "y"), { pos: [sx * 0.991, 6.22, 0] }));
      const finial: V2[] = [[0, 7.92], [0.16, 7.96], [0.07, 8.14], [0.11, 8.28], [0.02, 8.5], [0, 8.52]];
      parts.push(transformMesh(latheMesh(finial, 12, false), { pos: [capX, 0, 0] }));
      // Cast-bronze sanctuary temple bell (bonsho) + chi-no-ma stud bands + ryuzu hanger chain
      parts.push(transformMesh(bellUnit, { pos: [bellX, 4.48, 0] }));
      parts.push(transformMesh(circleTubeMesh(0.32, 0.022, 16, "y"), { pos: [bellX, 4.76, 0] }));
      parts.push(transformMesh(circleTubeMesh(0.3, 0.02, 16, "y"), { pos: [bellX, 5.02, 0] }));
      parts.push(transformMesh(circleTubeMesh(0.11, 0.028, 12, "z"), { pos: [bellX, 5.42, 0] }));
      parts.push(tubeSweepMesh([[bellX, 5.48, 0, 0.026], [bellX, 5.88, 0, 0.026]], 6, false));
    }
    return mergeRawMeshes(parts);
  });

  const lanternMesh = memoizeGeometry("cumulus:torii-lantern", () => {
    const parts: RawMesh[] = [];
    for (const sx of [-7.55, 7.55] as const) {
      const capX = sx * 0.99;
      parts.push(transformMesh(smoothEllipsoid(0.34, 0.38, 0.34, 8, 14, 0), { pos: [capX, 6.9, 0] }));
    }
    return mergeRawMeshes(parts);
  });

  const slots: MultiMatSlot[] = [
    { mesh: vermilionMesh, materialIndex: 0 },
    { mesh: obsidianMesh, materialIndex: 1 },
    { mesh: bronzeMesh, materialIndex: 2 },
    { mesh: lanternMesh, materialIndex: 3 }
  ];

  return assembleMultiMaterialNode(
    name,
    slots,
    [
      CUMULUS_MATERIALS.vermilionLacquer,
      CUMULUS_MATERIALS.obsidianLacquer,
      CUMULUS_MATERIALS.engravedBrass,
      CUMULUS_MATERIALS.lanternHeartEmissive
    ],
    { id: name, position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: false, coalesceColors: true }
  );
}

// ---------------------------------------------------------------------------
// 6. Instanced Valley Landmarks (Multi-Part instances.custom, clearcoat:0, sheen:0)
// ---------------------------------------------------------------------------

export function buildInstancedCanopyTrees(
  transforms: readonly AuraTransformSpec[],
  wind?: AuraInstanceWindOption
): InstancedNodeBuilder[] {
  const trunkParts: RawMesh[] = [
    tubeSweepMesh([[0, 0, 0, 0.085], [0.02, 0.24, 0.01, 0.062], [-0.02, 0.48, -0.01, 0.044]], 8, false),
    tubeSweepMesh([[0.01, 0.3, 0, 0.042], [0.14, 0.52, 0.06, 0.022]], 6, false),
    tubeSweepMesh([[-0.01, 0.34, 0, 0.038], [-0.13, 0.54, -0.05, 0.02]], 6, false)
  ];
  const mainCrown = transformMesh(
    weldSmoothNormals(layeredCanopyMesh({ radius: 0.42, height: 0.52, puffs: 8, seed: 19 })),
    { pos: [0, 0.38, 0] }
  );
  const topCrown = transformMesh(
    weldSmoothNormals(layeredCanopyMesh({ radius: 0.28, height: 0.28, puffs: 6, seed: 53 })),
    { pos: [0.02, 0.72, -0.02] }
  );
  const windOpt = wind ? { wind } : {};
  return [
    instances.custom(mergeRawMeshes(trunkParts), {
      name: "hero-trees-round-trunk",
      material: INSTANCED_MATERIALS.bark,
      castShadow: false,
      receiveShadow: false,
      transforms,
      ...windOpt
    }),
    instances.custom(mergeRawMeshes([mainCrown]), {
      name: "hero-trees-round",
      material: INSTANCED_MATERIALS.canopyDeep,
      castShadow: false,
      receiveShadow: false,
      transforms,
      ...windOpt
    }),
    instances.custom(mergeRawMeshes([topCrown]), {
      name: "hero-trees-round-crown",
      material: INSTANCED_MATERIALS.canopySunlit,
      castShadow: false,
      receiveShadow: false,
      transforms,
      ...windOpt
    })
  ];
}

export function buildInstancedBonsaiPines(
  transforms: readonly AuraTransformSpec[],
  wind?: AuraInstanceWindOption
): InstancedNodeBuilder[] {
  const trunkSpine = catmullRomSpline3([
    [0, 0, 0],
    [0.05, 0.24, 0.02],
    [-0.06, 0.52, -0.02],
    [0.03, 0.78, 0.01]
  ], 5, false);
  const trunk: V4[] = trunkSpine.map((p, i) => [p[0], p[1], p[2], Math.max(0.022, 0.075 * (1 - (i / trunkSpine.length) * 0.68))]);
  const branchA = tubeSweepMesh([[-0.03, 0.42, 0, 0.034], [-0.2, 0.48, 0.05, 0.016]], 6, false);
  const branchB = tubeSweepMesh([[0.02, 0.58, 0, 0.03], [0.18, 0.64, -0.04, 0.015]], 6, false);

  const boughs = transformMesh(coniferBoughTierMesh({ baseRadius: 0.34, height: 0.66, tiers: 4, seed: 71 }), { pos: [0, 0.32, 0] });
  const padL = transformMesh(weldSmoothNormals(layeredCanopyMesh({ radius: 0.18, height: 0.14, puffs: 5, seed: 83 })), { pos: [-0.2, 0.44, 0.05] });
  const padR = transformMesh(weldSmoothNormals(layeredCanopyMesh({ radius: 0.17, height: 0.14, puffs: 5, seed: 97 })), { pos: [0.18, 0.6, -0.04] });
  const windOpt = wind ? { wind } : {};

  return [
    instances.custom(mergeRawMeshes([tubeSweepMesh(trunk, 8, false), branchA, branchB]), {
      name: "hero-trees-pine-trunk",
      material: INSTANCED_MATERIALS.bark,
      castShadow: false,
      receiveShadow: false,
      transforms,
      ...windOpt
    }),
    instances.custom(mergeRawMeshes([boughs, padL, padR]), {
      name: "hero-trees-pine",
      material: INSTANCED_MATERIALS.pineFoliage,
      castShadow: false,
      receiveShadow: false,
      transforms,
      ...windOpt
    })
  ];
}

export function buildInstancedShoulderRocks(transforms: readonly AuraTransformSpec[]): InstancedNodeBuilder[] {
  const outcrop = stratifiedCliffMesh({ radiusX: 0.48, radiusZ: 0.44, height: 0.96, terraces: 4, seed: 61 });
  const mossCap = transformMesh(smoothEllipsoid(0.32, 0.1, 0.3, 8, 14, 0.25), { pos: [0, 0.94, 0] });
  return [
    instances.custom(mergeRawMeshes([outcrop]), {
      name: "hero-rocks",
      material: INSTANCED_MATERIALS.shoulderStone,
      castShadow: false,
      receiveShadow: false,
      transforms
    }),
    instances.custom(mergeRawMeshes([mossCap]), {
      name: "hero-rocks-moss",
      material: INSTANCED_MATERIALS.boulderMoss,
      castShadow: false,
      receiveShadow: false,
      transforms
    })
  ];
}

export function buildInstancedKarstMesas(transforms: readonly AuraTransformSpec[]): InstancedNodeBuilder[] {
  // Unit radial diameter = 0.55 (radius = 0.275), height = 1.0 -> matches [m.width / 0.55, m.height, m.width / 0.55]
  const pillar = stratifiedCliffMesh({ radiusX: 0.275, radiusZ: 0.275, height: 0.96, terraces: 6, seed: 109 });
  const grassCrown = transformMesh(
    weldSmoothNormals(layeredCanopyMesh({ radius: 0.24, height: 0.1, puffs: 7, seed: 127 })),
    { pos: [0, 0.93, 0] }
  );
  return [
    instances.custom(mergeRawMeshes([pillar]), {
      name: "hero-mesas",
      material: INSTANCED_MATERIALS.karstLimestone,
      castShadow: false,
      receiveShadow: false,
      transforms
    }),
    instances.custom(mergeRawMeshes([grassCrown]), {
      name: "hero-mesas-crown",
      material: INSTANCED_MATERIALS.karstPlateauGrass,
      castShadow: false,
      receiveShadow: false,
      transforms
    })
  ];
}

export function buildInstancedStormTowers(
  name: string,
  transforms: readonly AuraTransformSpec[],
  seedOffset = 0
): InstancedNodeBuilder[] {
  // Unit height = 1.0 (bottom 0.34 sunk below the valley plane); overlapping smooth subdivisions=2 icosphere cumulus puffs
  // with strong upward-biased smooth normals + warm #fffaf2 / #ffe8cc sunlit sheen so undersides never shade storm-grey.
  const columnLobes: RawMesh[] = [
    cumulusPuffMesh(0.46, 0.27, 0.44, [0, 0.36, 0], seedOffset + 11, 1.3),
    cumulusPuffMesh(0.39, 0.24, 0.37, [0.15, 0.54, -0.07], seedOffset + 23, 1.3),
    cumulusPuffMesh(0.37, 0.23, 0.36, [-0.16, 0.6, 0.09], seedOffset + 37, 1.3),
    cumulusPuffMesh(0.34, 0.21, 0.33, [0.05, 0.74, 0.03], seedOffset + 53, 1.32),
    cumulusPuffMesh(0.31, 0.19, 0.3, [-0.08, 0.48, -0.14], seedOffset + 67, 1.3)
  ];
  const anvilCrown: RawMesh[] = [
    cumulusPuffMesh(0.55 + hash01(seedOffset + 7) * 0.05, 0.18, 0.51, [0, 0.89, 0], seedOffset + 79, 1.34),
    cumulusPuffMesh(0.38, 0.15, 0.38, [-0.24, 0.85, 0.12], seedOffset + 97, 1.34),
    cumulusPuffMesh(0.37, 0.15, 0.36, [0.25, 0.86, -0.1], seedOffset + 113, 1.34),
    cumulusPuffMesh(0.32, 0.14, 0.32, [0.04, 0.96, 0.04], seedOffset + 131, 1.36)
  ];
  const useSheen = transforms.length <= 16;
  return [
    instances.custom(mergeRawMeshes(columnLobes), {
      name,
      material: useSheen ? CUMULUS_MATERIALS.skyCumulusIvoryFabric : INSTANCED_MATERIALS.stormCloudBody,
      castShadow: false,
      receiveShadow: false,
      transforms
    }),
    instances.custom(mergeRawMeshes(anvilCrown), {
      name: `${name}-crown`,
      material: useSheen ? CUMULUS_MATERIALS.skyCumulusWarmPhysical : INSTANCED_MATERIALS.stormAnvilCrown,
      castShadow: false,
      receiveShadow: false,
      transforms
    })
  ];
}

export function buildInstancedFlankingCumulus(
  name: string,
  transforms: readonly AuraTransformSpec[],
  seedOffset = 0
): InstancedNodeBuilder[] {
  // Hero flanking & upper-sky cumulus clusters (<=16 instances per batch -> warm ivory fabric/physical sheen + #ffe8cc glow)
  const basePuffs: RawMesh[] = [
    cumulusPuffMesh(1.08, 0.58, 0.96, [0, 0, 0], seedOffset + 19, 1.32),
    cumulusPuffMesh(0.84, 0.48, 0.8, [-0.78, -0.04, 0.14], seedOffset + 31, 1.32),
    cumulusPuffMesh(0.86, 0.5, 0.82, [0.8, -0.02, -0.12], seedOffset + 43, 1.32),
    cumulusPuffMesh(0.68, 0.42, 0.68, [0.22, -0.06, 0.52], seedOffset + 59, 1.32)
  ];
  const crownPuffs: RawMesh[] = [
    cumulusPuffMesh(0.76, 0.48, 0.74, [-0.14, 0.38, -0.04], seedOffset + 73, 1.36),
    cumulusPuffMesh(0.62, 0.4, 0.62, [0.46, 0.3, 0.08], seedOffset + 89, 1.36),
    cumulusPuffMesh(0.56, 0.36, 0.56, [-0.52, 0.24, 0.06], seedOffset + 103, 1.36)
  ];
  const useSheen = transforms.length <= 16;
  return [
    instances.custom(mergeRawMeshes(basePuffs), {
      name,
      material: useSheen ? CUMULUS_MATERIALS.skyCumulusIvoryFabric : INSTANCED_MATERIALS.stormCloudBody,
      castShadow: false,
      receiveShadow: false,
      transforms
    }),
    instances.custom(mergeRawMeshes(crownPuffs), {
      name: `${name}-crown`,
      material: useSheen ? CUMULUS_MATERIALS.skyCumulusWarmPhysical : INSTANCED_MATERIALS.stormAnvilCrown,
      castShadow: false,
      receiveShadow: false,
      transforms
    })
  ];
}

export function buildInstancedSkyCumulusSea(transforms: readonly AuraTransformSpec[]): InstancedNodeBuilder[] {
  // Batched background/chasm cumulus cloud banks (>16 instances -> clearcoat:0, sheen:0 warm #fffaf2 + #ffe8cc 0.28..0.30)
  const lowerBillows: RawMesh[] = [
    cumulusPuffMesh(1.12, 0.54, 0.98, [0, 0, 0], 211, 1.32),
    cumulusPuffMesh(0.86, 0.44, 0.82, [-0.82, -0.05, 0.16], 223, 1.32),
    cumulusPuffMesh(0.84, 0.45, 0.8, [0.84, -0.04, -0.14], 239, 1.32)
  ];
  const sunlitTops: RawMesh[] = [
    cumulusPuffMesh(0.78, 0.46, 0.74, [0.06, 0.34, 0], 251, 1.36),
    cumulusPuffMesh(0.58, 0.36, 0.58, [-0.46, 0.24, 0.08], 269, 1.36),
    cumulusPuffMesh(0.56, 0.35, 0.56, [0.48, 0.25, -0.06], 281, 1.36)
  ];
  return [
    instances.custom(mergeRawMeshes(lowerBillows), {
      name: "sky-cumulus-sea",
      material: INSTANCED_MATERIALS.stormCloudBody,
      castShadow: false,
      receiveShadow: false,
      transforms
    }),
    instances.custom(mergeRawMeshes(sunlitTops), {
      name: "sky-cumulus-sea-crown",
      material: INSTANCED_MATERIALS.stormAnvilCrown,
      castShadow: false,
      receiveShadow: false,
      transforms
    })
  ];
}

export function buildInstancedDistantSkyIslands(transforms: readonly AuraTransformSpec[]): InstancedNodeBuilder[] {
  // Batches all outer floating sandstone sky islands & emerald plateau crowns into 2 instanced draw calls
  const islandButte = stratifiedCliffMesh({ radiusX: 0.275, radiusZ: 0.275, height: 0.96, terraces: 5, seed: 313 });
  const plateauCanopy = transformMesh(
    weldSmoothNormals(layeredCanopyMesh({ radius: 0.245, height: 0.11, puffs: 6, seed: 331 })),
    { pos: [0, 0.93, 0] }
  );
  return [
    instances.custom(mergeRawMeshes([islandButte]), {
      name: "distant-sky-islands",
      material: INSTANCED_MATERIALS.karstLimestone,
      castShadow: false,
      receiveShadow: false,
      transforms
    }),
    instances.custom(mergeRawMeshes([plateauCanopy]), {
      name: "distant-sky-islands-crown",
      material: INSTANCED_MATERIALS.karstPlateauGrass,
      castShadow: false,
      receiveShadow: false,
      transforms
    })
  ];
}

// ---------------------------------------------------------------------------
// 7. Articulated Sky Kid Cloud-Surfer Hero ("hero" + child limb runtime IDs)
// ---------------------------------------------------------------------------

export const HERO_PART_IDS = {
  root: "hero",
  pelvis: "hero-pelvis",
  torso: "hero-torso",
  head: "hero-head",
  backPole: "hero-back-pole",
  sashL: "hero-sash-l",
  sashR: "hero-sash-r",
  armL: "hero-arm-l",
  forearmL: "hero-forearm-l",
  armR: "hero-arm-r",
  forearmR: "hero-forearm-r",
  thighL: "hero-thigh-l",
  shinL: "hero-shin-l",
  bootL: "hero-boot-l",
  thighR: "hero-thigh-r",
  shinR: "hero-shin-r",
  bootR: "hero-boot-r"
} as const;

export const HERO_REST_PIVOTS = {
  pelvis: [0, 0.72, 0] as V3,
  torso: [0, 0.09, 0] as V3,
  head: [0, 0.35, 0.01] as V3,
  backPolePos: [0, 0.165, -0.162] as V3,
  backPoleRot: [0, 0, -0.64] as V3,
  sashL: [0.055, 0.042, -0.115] as V3,
  sashR: [0.095, 0.036, -0.102] as V3,
  armL: [0.195, 0.26, 0] as V3,
  armR: [-0.195, 0.26, 0] as V3,
  forearmL: [0, -0.19, 0] as V3,
  forearmR: [0, -0.19, 0] as V3,
  thighL: [0.105, -0.04, 0] as V3,
  thighR: [-0.105, -0.04, 0] as V3,
  shinL: [0, -0.3, 0] as V3,
  shinR: [0, -0.3, 0] as V3,
  bootL: [0, -0.16, 0] as V3,
  bootR: [0, -0.16, 0] as V3
} as const;

function sculptedHairTuftMesh(ctrl: readonly V3[], baseRx: number, baseRy: number, roll = 0): RawMesh {
  const pts = catmullRomSpline3([...ctrl], 3, false);
  const rings: V3[][] = [];
  const segs = 8;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    let tz = next[2] - prev[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;

    const upRef: V3 = Math.abs(ty) > 0.92 ? [0, 0, 1] : [0, 1, 0];
    let nx = upRef[1] * tz - upRef[2] * ty;
    let ny = upRef[2] * tx - upRef[0] * tz;
    let nz = upRef[0] * ty - upRef[1] * tx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;

    const ux = nx * cr + bx * sr;
    const uy = ny * cr + by * sr;
    const uz = nz * cr + bz * sr;
    const vx = -nx * sr + bx * cr;
    const vy = -ny * sr + by * cr;
    const vz = -nz * sr + bz * cr;

    const t = i / Math.max(1, pts.length - 1);
    const taper = i === pts.length - 1
      ? 0.05
      : Math.max(0.06, Math.pow(1 - t, 0.62) * (0.84 + 0.36 * Math.sin(t * Math.PI)));
    const rx = baseRx * taper;
    const ry = baseRy * taper;
    const ring: V3[] = [];
    for (let s = 0; s < segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ridge = 1 + 0.16 * Math.max(0, sa);
      const ox = ca * rx;
      const oy = sa * ry * ridge;
      ring.push([
        p[0] + ux * ox + vx * oy,
        p[1] + uy * ox + vy * oy,
        p[2] + uz * ox + vz * oy
      ]);
    }
    rings.push(ring);
  }
  return weldSmoothNormals(subdivideSmoothMesh(loftSectionsMesh(rings, true, true), 1, 0.44));
}

function buildHeroPelvisSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Martial sky tunic flared skirt (saffron fabric + indigo hem border)
  const skirtProfile: V2[] = [
    [0.095, -0.128],
    [0.166, -0.128],
    [0.158, -0.08],
    [0.142, -0.02],
    [0.128, 0.04],
    [0.132, 0.095],
    [0, 0.095]
  ];
  slots.push({
    mesh: weldSmoothNormals(transformMesh(latheMesh(skirtProfile, 22, false), { scale: [1.05, 1, 0.92] })),
    materialIndex: 0
  });
  const hemProfile: V2[] = [
    [0.156, -0.136],
    [0.17, -0.136],
    [0.168, -0.118],
    [0.154, -0.118]
  ];
  slots.push({
    mesh: weldSmoothNormals(transformMesh(latheMesh(hemProfile, 22, false), { scale: [1.05, 1, 0.92] })),
    materialIndex: 1
  });
  // Tied indigo waist sash & side-back knot
  const sashBeltProfile: V2[] = [
    [0.124, 0.014],
    [0.142, 0.02],
    [0.146, 0.056],
    [0.141, 0.092],
    [0.124, 0.096]
  ];
  slots.push({
    mesh: weldSmoothNormals(transformMesh(latheMesh(sashBeltProfile, 22, false), { scale: [1.06, 1, 0.94] })),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(
      weldSmoothNormals(subdivideSmoothMesh(icosphereSmoothMesh(0.044, 1, 0.03, 19, 1), 1, 0.52)),
      { pos: [0.074, 0.046, -0.112], scale: [1.18, 0.96, 1.02] }
    ),
    materialIndex: 1
  });
  return slots;
}

function buildHeroSashTailSlots(side: -1 | 1): MultiMatSlot[] {
  const spread = side === -1 ? -0.035 : 0.052;
  const pts = catmullRomSpline3([
    [0, 0, 0],
    [spread * 0.4, -0.045, -0.075],
    [spread * 0.85, -0.115, -0.155],
    [spread * 1.15, -0.19, -0.225],
    [spread * 1.28, -0.255, -0.275]
  ], 4, false);
  const rings: V3[][] = pts.map((p, idx) => {
    const t = idx / Math.max(1, pts.length - 1);
    const w = 0.024 + 0.022 * Math.sin(t * Math.PI * 0.88);
    const th = 0.008 * (1 - t * 0.35);
    return ellipseSection(p[0], p[1], p[2], w, th, 8, -0.35);
  });
  const tipRing = pts[pts.length - 1]!;
  return [
    { mesh: weldSmoothNormals(loftSectionsMesh(rings, true, false)), materialIndex: 0 },
    {
      mesh: transformMesh(smoothEllipsoid(0.024, 0.012, 0.02, 6, 10, 0), { pos: [tipRing[0], tipRing[1] + 0.012, tipRing[2] + 0.01] }),
      materialIndex: 1
    }
  ];
}

function buildHeroTorsoSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Martial sky tunic torso (warm vermilion/saffron fabric)
  const torsoSections: V3[][] = [
    ellipseSection(0, -0.02, 0, 0.132, 0.108, 18, Math.PI * 0.5),
    ellipseSection(0, 0.06, 0.004, 0.146, 0.118, 18, Math.PI * 0.5),
    ellipseSection(0, 0.15, 0.008, 0.172, 0.132, 18, Math.PI * 0.5),
    ellipseSection(0, 0.24, 0.004, 0.186, 0.126, 18, Math.PI * 0.5),
    ellipseSection(0, 0.295, 0, 0.168, 0.108, 18, Math.PI * 0.5),
    ellipseSection(0, 0.32, 0, 0.084, 0.076, 18, Math.PI * 0.5)
  ];
  slots.push({ mesh: weldSmoothNormals(loftSectionsMesh(torsoSections, true, false)), materialIndex: 0 });

  // Crossed martial V-lapel folds on front chest
  slots.push({
    mesh: weldSmoothNormals(tubeSweepMesh([
      [-0.095, 0.305, 0.078, 0.02],
      [-0.045, 0.18, 0.128, 0.022],
      [0.025, 0.03, 0.118, 0.018]
    ], 8, false)),
    materialIndex: 0
  });
  slots.push({
    mesh: weldSmoothNormals(tubeSweepMesh([
      [0.095, 0.305, 0.076, 0.02],
      [0.04, 0.185, 0.124, 0.021],
      [-0.015, 0.05, 0.116, 0.017]
    ], 8, false)),
    materialIndex: 0
  });

  // Indigo undershirt V-insert & collar band
  slots.push({
    mesh: transformMesh(smoothEllipsoid(0.068, 0.09, 0.046, 10, 14, 0), { pos: [0, 0.245, 0.092] }),
    materialIndex: 1
  });
  const collarProfile: V2[] = [
    [0.068, 0.285],
    [0.088, 0.292],
    [0.084, 0.335],
    [0.062, 0.338]
  ];
  slots.push({ mesh: weldSmoothNormals(latheMesh(collarProfile, 18, false)), materialIndex: 1 });

  // Sculpted warm skin neck
  const neckProfile: V2[] = [
    [0, 0.3],
    [0.058, 0.3],
    [0.054, 0.35],
    [0.052, 0.39],
    [0, 0.39]
  ];
  slots.push({ mesh: weldSmoothNormals(latheMesh(neckProfile, 16, false)), materialIndex: 2 });

  // Cross-body leather strap + brass chest buckle for the slung Power Pole
  const strapLoop = catmullRomSpline3([
    [-0.135, 0.305, 0.065],
    [-0.055, 0.23, 0.134],
    [0.035, 0.135, 0.138],
    [0.148, 0.045, 0.055],
    [0.145, 0.055, -0.095],
    [0.015, 0.165, -0.138],
    [-0.125, 0.295, -0.072],
    [-0.135, 0.305, 0.065]
  ], 3, false);
  slots.push({
    mesh: weldSmoothNormals(tubeSweepMesh(strapLoop.map((p) => [p[0], p[1], p[2], 0.015] as V4), 8, false)),
    materialIndex: 3
  });
  const buckleRing: V2[] = [
    [0.016, -0.01],
    [0.03, -0.01],
    [0.03, 0.01],
    [0.016, 0.01]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(buckleRing, 14, false), { pos: [0.005, 0.175, 0.144], rot: [Math.PI * 0.46, 0, -0.58] }),
    materialIndex: 4
  });
  return slots;
}

function buildHeroBackPoleSlots(): MultiMatSlot[] {
  // Crimson lacquer Power Pole with gleaming turned brass end-caps and indigo grip wrap
  const shaftProfile: V2[] = [
    [0, -0.43],
    [0.024, -0.43],
    [0.025, 0],
    [0.024, 0.43],
    [0, 0.43]
  ];
  const capBot: V2[] = [
    [0, -0.51],
    [0.022, -0.506],
    [0.028, -0.485],
    [0.027, -0.415],
    [0, -0.415]
  ];
  const capTop: V2[] = [
    [0, 0.415],
    [0.027, 0.415],
    [0.028, 0.485],
    [0.022, 0.506],
    [0, 0.51]
  ];
  const ringBand: V2[] = [
    [0.024, -0.012],
    [0.031, -0.008],
    [0.031, 0.008],
    [0.024, 0.012]
  ];
  const gripWrap: V2[] = [
    [0.024, -0.1],
    [0.027, -0.095],
    [0.027, 0.095],
    [0.024, 0.1]
  ];
  return [
    { mesh: weldSmoothNormals(latheMesh(shaftProfile, 16, false)), materialIndex: 0 },
    { mesh: weldSmoothNormals(latheMesh(capBot, 16, false)), materialIndex: 1 },
    { mesh: weldSmoothNormals(latheMesh(capTop, 16, false)), materialIndex: 1 },
    { mesh: transformMesh(latheMesh(ringBand, 14, false), { pos: [0, -0.412, 0] }), materialIndex: 2 },
    { mesh: transformMesh(latheMesh(ringBand, 14, false), { pos: [0, 0.412, 0] }), materialIndex: 2 },
    { mesh: weldSmoothNormals(latheMesh(gripWrap, 14, false)), materialIndex: 3 }
  ];
}

function buildHeroHeadSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Smooth sculpted anime kid cranium + fuller lower cheeks (latheMesh + icosphereSmoothMesh)
  const headProfile: V2[] = [
    [0, 0.004],
    [0.056, 0.016],
    [0.108, 0.048],
    [0.132, 0.092],
    [0.136, 0.145],
    [0.131, 0.196],
    [0.112, 0.238],
    [0.072, 0.266],
    [0, 0.278]
  ];
  slots.push({
    mesh: weldSmoothNormals(transformMesh(latheMesh(headProfile, 24, false), { scale: [1.0, 1.0, 1.04] })),
    materialIndex: 0
  });
  for (const side of [-1, 1] as const) {
    // Soft cheek fullness
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.052, 2, 0, 5 + side, 1), { pos: [side * 0.068, 0.088, 0.082], scale: [1.05, 0.92, 0.95] }),
      materialIndex: 0
    });
    // Sculpted ears + warm inner ear fold
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.026, 0.045, 0.03, 10, 14, 0), { pos: [side * 0.134, 0.122, -0.005], rot: [0, -side * 0.22, side * 0.12] }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.013, 0.025, 0.015, 8, 10, 0), { pos: [side * 0.142, 0.122, 0.002], rot: [0, -side * 0.22, side * 0.12] }),
      materialIndex: 1
    });
    // Expressive eyes: sclera + glossy dark iris + twin specular catchlights
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.028, 0.035, 0.016, 10, 14, 0), { pos: [side * 0.05, 0.134, 0.125], rot: [0, side * 0.18, 0] }),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(smoothEllipsoid(0.02, 0.028, 0.014, 10, 14, 0), { pos: [side * 0.049, 0.133, 0.133], rot: [0, side * 0.18, 0] }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.0076, 1, 0, 7, 1), { pos: [side * 0.055, 0.144, 0.144] }),
      materialIndex: 5
    });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.0042, 1, 0, 11, 1), { pos: [side * 0.043, 0.123, 0.143] }),
      materialIndex: 5
    });
    // Expressive arched eyebrows
    slots.push({
      mesh: weldSmoothNormals(tubeSweepMesh([
        [side * 0.024, 0.174, 0.136, 0.0075],
        [side * 0.052, 0.184, 0.132, 0.0085],
        [side * 0.08, 0.176, 0.118, 0.0055]
      ], 7, false)),
      materialIndex: 2
    });
  }
  // Upturned nose & cheerful determined smile
  slots.push({
    mesh: transformMesh(smoothEllipsoid(0.017, 0.019, 0.024, 8, 12, 0), { pos: [0, 0.112, 0.142] }),
    materialIndex: 0
  });
  slots.push({
    mesh: weldSmoothNormals(tubeSweepMesh([
      [-0.025, 0.077, 0.132, 0.0045],
      [0, 0.071, 0.137, 0.0055],
      [0.025, 0.077, 0.132, 0.0045]
    ], 6, false)),
    materialIndex: 1
  });

  // Cranial hair cap + 13 dynamic wind-swept curved spiky tufts (subdivideSmoothMesh along Catmull-Rom splines)
  slots.push({
    mesh: transformMesh(
      weldSmoothNormals(subdivideSmoothMesh(icosphereSmoothMesh(1, 1, 0.02, 23, 1.08), 1, 0.54)),
      { pos: [0, 0.168, -0.018], scale: [0.146, 0.138, 0.152] }
    ),
    materialIndex: 2
  });
  const hairTufts: readonly { ctrl: readonly V3[]; rx: number; ry: number; roll?: number }[] = [
    // Right windward star fan (+X, 4 curved sweeping tufts)
    { ctrl: [[0.095, 0.135, -0.01], [0.185, 0.115, -0.035], [0.265, 0.122, -0.075], [0.32, 0.142, -0.115]], rx: 0.048, ry: 0.036, roll: 0.25 },
    { ctrl: [[0.105, 0.172, -0.005], [0.215, 0.195, -0.04], [0.305, 0.232, -0.088], [0.368, 0.272, -0.138]], rx: 0.056, ry: 0.042, roll: 0.18 },
    { ctrl: [[0.088, 0.218, -0.005], [0.182, 0.275, -0.038], [0.258, 0.328, -0.082], [0.312, 0.365, -0.125]], rx: 0.052, ry: 0.038, roll: 0.1 },
    { ctrl: [[0.038, 0.248, -0.008], [0.095, 0.315, -0.045], [0.145, 0.355, -0.098], [0.182, 0.372, -0.15]], rx: 0.046, ry: 0.035, roll: 0.05 },
    // Left counter-swept fan (-X, 3 curved tufts)
    { ctrl: [[-0.095, 0.138, -0.01], [-0.18, 0.122, -0.038], [-0.248, 0.132, -0.078], [-0.292, 0.15, -0.115]], rx: 0.046, ry: 0.035, roll: -0.22 },
    { ctrl: [[-0.102, 0.182, -0.005], [-0.205, 0.212, -0.042], [-0.285, 0.252, -0.088], [-0.338, 0.288, -0.132]], rx: 0.054, ry: 0.04, roll: -0.15 },
    { ctrl: [[-0.068, 0.232, 0], [-0.142, 0.292, -0.038], [-0.198, 0.335, -0.082], [-0.235, 0.358, -0.125]], rx: 0.048, ry: 0.036, roll: -0.08 },
    // Crown & rear wind-swept tufts (-Z chase-camera silhouette; crown reaches ~1.52m world Y)
    { ctrl: [[-0.008, 0.252, 0.01], [-0.015, 0.315, -0.042], [-0.022, 0.348, -0.105], [-0.028, 0.362, -0.172]], rx: 0.052, ry: 0.04, roll: 0 },
    { ctrl: [[0.035, 0.222, -0.085], [0.058, 0.258, -0.168], [0.076, 0.285, -0.245], [0.088, 0.302, -0.312]], rx: 0.05, ry: 0.038, roll: 0.15 },
    { ctrl: [[-0.045, 0.205, -0.088], [-0.085, 0.232, -0.168], [-0.115, 0.25, -0.238], [-0.132, 0.26, -0.295]], rx: 0.048, ry: 0.036, roll: -0.15 },
    { ctrl: [[0.005, 0.135, -0.105], [0.012, 0.118, -0.182], [0.018, 0.115, -0.242], [0.022, 0.122, -0.288]], rx: 0.042, ry: 0.03, roll: 0 },
    // Forehead swept bangs (+Z framing eyebrows cleanly)
    { ctrl: [[0.018, 0.245, 0.072], [0.042, 0.228, 0.132], [0.058, 0.195, 0.156], [0.068, 0.165, 0.158]], rx: 0.032, ry: 0.02, roll: 0.2 },
    { ctrl: [[-0.024, 0.245, 0.072], [-0.042, 0.225, 0.13], [-0.048, 0.195, 0.152], [-0.042, 0.17, 0.154]], rx: 0.028, ry: 0.018, roll: -0.18 }
  ];
  for (const tuft of hairTufts) {
    slots.push({ mesh: sculptedHairTuftMesh(tuft.ctrl, tuft.rx, tuft.ry, tuft.roll ?? 0), materialIndex: 2 });
  }
  return slots;
}

function buildHeroUpperArmSlots(side: -1 | 1): MultiMatSlot[] {
  const sleeveProfile: V2[] = [
    [0.042, -0.084],
    [0.068, -0.08],
    [0.066, -0.02],
    [0.054, 0.038],
    [0, 0.042]
  ];
  const cuffTrim: V2[] = [
    [0.04, -0.09],
    [0.069, -0.088],
    [0.069, -0.074],
    [0.04, -0.074]
  ];
  const upperArm = weldSmoothNormals(
    sculptHumanoidLimbMesh(
      [
        [0, -0.042, 0, 0.043],
        [side * 0.004, -0.118, 0.005, 0.041],
        [0, -0.194, 0, 0.036]
      ],
      10,
      0.14
    )
  );
  return [
    { mesh: weldSmoothNormals(latheMesh(sleeveProfile, 16, false)), materialIndex: 0 },
    { mesh: weldSmoothNormals(latheMesh(cuffTrim, 16, false)), materialIndex: 1 },
    { mesh: upperArm, materialIndex: 2 }
  ];
}

function buildHeroForearmSlots(side: -1 | 1): MultiMatSlot[] {
  const forearm = weldSmoothNormals(
    sculptHumanoidLimbMesh(
      [
        [0, 0.014, 0, 0.037],
        [0, -0.072, 0.008, 0.036],
        [0, -0.156, 0.012, 0.03]
      ],
      10,
      0.13
    )
  );
  const wristbandProfile: V2[] = [
    [0.03, -0.162],
    [0.042, -0.158],
    [0.044, -0.128],
    [0.042, -0.098],
    [0.03, -0.095]
  ];
  const fist = transformMesh(smoothEllipsoid(0.04, 0.044, 0.046, 8, 12, 0), { pos: [0, -0.192, 0.018] });
  const thumb = weldSmoothNormals(tubeSweepMesh([
    [-side * 0.024, -0.172, 0.026, 0.015],
    [-side * 0.033, -0.194, 0.048, 0.012]
  ], 6, false));
  return [
    { mesh: forearm, materialIndex: 0 },
    { mesh: transformMesh(weldSmoothNormals(latheMesh(wristbandProfile, 14, false)), { pos: [0, 0, 0.01] }), materialIndex: 1 },
    { mesh: fist, materialIndex: 0 },
    { mesh: thumb, materialIndex: 0 }
  ];
}

function buildHeroThighSlots(): MultiMatSlot[] {
  const thigh = weldSmoothNormals(
    sculptHumanoidLimbMesh(
      [
        [0, 0.038, 0, 0.078],
        [0, -0.075, 0.005, 0.092],
        [0, -0.185, 0.006, 0.091],
        [0, -0.305, 0, 0.064]
      ],
      12,
      0.13
    )
  );
  return [{ mesh: thigh, materialIndex: 0 }];
}

function buildHeroShinSlots(): MultiMatSlot[] {
  // Baggy bloused martial lower trouser gathered at the boot top
  const shin = weldSmoothNormals(
    sculptHumanoidLimbMesh(
      [
        [0, 0.024, 0, 0.064],
        [0, -0.045, 0.004, 0.082],
        [0, -0.115, 0.002, 0.085],
        [0, -0.156, 0, 0.048]
      ],
      12,
      0.12
    )
  );
  return [{ mesh: shin, materialIndex: 0 }];
}

function buildHeroBootSlots(): MultiMatSlot[] {
  // Exact rest sole bottom at local y = -0.220 -> world y = 0.72 - 0.04 - 0.30 - 0.16 - 0.22 = 0.000!
  const creamCuffProfile: V2[] = [
    [0.046, -0.034],
    [0.068, -0.022],
    [0.07, 0.004],
    [0.064, 0.028],
    [0.046, 0.034]
  ];
  const ankleCordProfile: V2[] = [
    [0.046, -0.052],
    [0.057, -0.048],
    [0.057, -0.032],
    [0.046, -0.03]
  ];
  const bootSections: V3[][] = [
    ellipseSection(0, -0.035, 0, 0.052, 0.056, 14, Math.PI * 0.5),
    ellipseSection(0, -0.095, 0.016, 0.055, 0.074, 14, Math.PI * 0.5),
    ellipseSection(0, -0.155, 0.038, 0.057, 0.102, 14, Math.PI * 0.5),
    ellipseSection(0, -0.19, 0.042, 0.054, 0.106, 14, Math.PI * 0.5)
  ];
  const centerStripe = weldSmoothNormals(tubeSweepMesh([
    [0, -0.048, 0.054, 0.0075],
    [0, -0.115, 0.088, 0.0075],
    [0, -0.175, 0.142, 0.0065]
  ], 6, false));
  // Grounded flat amber sole: bottom face strictly at y = -0.22
  const soleProfile: V2[] = [
    [0, -0.22],
    [0.9, -0.22],
    [1.0, -0.208],
    [0.98, -0.184],
    [0, -0.184]
  ];
  const soleMesh = weldSmoothNormals(transformMesh(latheMesh(soleProfile, 18, false), {
    pos: [0, 0, 0.042],
    scale: [0.058, 1, 0.112]
  }));
  return [
    { mesh: weldSmoothNormals(latheMesh(creamCuffProfile, 16, false)), materialIndex: 1 },
    { mesh: weldSmoothNormals(latheMesh(ankleCordProfile, 14, false)), materialIndex: 2 },
    { mesh: weldSmoothNormals(loftSectionsMesh(bootSections, true, false)), materialIndex: 0 },
    { mesh: centerStripe, materialIndex: 2 },
    { mesh: soleMesh, materialIndex: 2 }
  ];
}

/** Exact rest-pose world AABB of the Sky Kid Cloud-Surfer Hero (verifies minY === 0 grounding and ~1.52m stature). */
export function computeHeroRestWorldBounds(): { min: V3; max: V3 } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const visit = (slots: readonly MultiMatSlot[], offset: V3, rotZ = 0): void => {
    const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
    for (const s of slots) {
      const pos = s.mesh.positions;
      for (let i = 0; i < pos.length; i += 3) {
        const lx = pos[i]!, ly = pos[i + 1]!, lz = pos[i + 2]!;
        const rx = rotZ === 0 ? lx : lx * cz - ly * sz;
        const ry = rotZ === 0 ? ly : lx * sz + ly * cz;
        const x = rx + offset[0];
        const y = ry + offset[1];
        const z = lz + offset[2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
  };
  const p = HERO_REST_PIVOTS.pelvis;
  const t: V3 = [p[0] + HERO_REST_PIVOTS.torso[0], p[1] + HERO_REST_PIVOTS.torso[1], p[2] + HERO_REST_PIVOTS.torso[2]];
  const hd: V3 = [t[0] + HERO_REST_PIVOTS.head[0], t[1] + HERO_REST_PIVOTS.head[1], t[2] + HERO_REST_PIVOTS.head[2]];
  visit(buildHeroPelvisSlots(), p);
  visit(buildHeroSashTailSlots(-1), [p[0] + HERO_REST_PIVOTS.sashL[0], p[1] + HERO_REST_PIVOTS.sashL[1], p[2] + HERO_REST_PIVOTS.sashL[2]]);
  visit(buildHeroSashTailSlots(1), [p[0] + HERO_REST_PIVOTS.sashR[0], p[1] + HERO_REST_PIVOTS.sashR[1], p[2] + HERO_REST_PIVOTS.sashR[2]]);
  visit(buildHeroTorsoSlots(), t);
  visit(buildHeroBackPoleSlots(), [t[0] + HERO_REST_PIVOTS.backPolePos[0], t[1] + HERO_REST_PIVOTS.backPolePos[1], t[2] + HERO_REST_PIVOTS.backPolePos[2]], HERO_REST_PIVOTS.backPoleRot[2]);
  visit(buildHeroHeadSlots(), hd);
  for (const [side, armOff, foreOff, thighOff, shinOff, bootOff] of [
    [1, HERO_REST_PIVOTS.armL, HERO_REST_PIVOTS.forearmL, HERO_REST_PIVOTS.thighL, HERO_REST_PIVOTS.shinL, HERO_REST_PIVOTS.bootL] as const,
    [-1, HERO_REST_PIVOTS.armR, HERO_REST_PIVOTS.forearmR, HERO_REST_PIVOTS.thighR, HERO_REST_PIVOTS.shinR, HERO_REST_PIVOTS.bootR] as const
  ]) {
    const a: V3 = [t[0] + armOff[0], t[1] + armOff[1], t[2] + armOff[2]];
    const fa: V3 = [a[0] + foreOff[0], a[1] + foreOff[1], a[2] + foreOff[2]];
    const th: V3 = [p[0] + thighOff[0], p[1] + thighOff[1], p[2] + thighOff[2]];
    const sh: V3 = [th[0] + shinOff[0], th[1] + shinOff[1], th[2] + shinOff[2]];
    const bt: V3 = [sh[0] + bootOff[0], sh[1] + bootOff[1], sh[2] + bootOff[2]];
    visit(buildHeroUpperArmSlots(side), a);
    visit(buildHeroForearmSlots(side), fa);
    visit(buildHeroThighSlots(), th);
    visit(buildHeroShinSlots(), sh);
    visit(buildHeroBootSlots(), bt);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function buildSkyKidHeroNode(
  heroRim?: { readonly color: string; readonly power: number; readonly intensity: number } | null
) {
  const tunicMat = heroRim
    ? material.fabric({
        name: "hero-saffron-tunic-rimmed",
        color: "#eb5e28",
        roughness: 0.58,
        sheen: 0.9,
        sheenColor: heroRim.color,
        sheenRoughness: 0.34
      })
    : CUMULUS_MATERIALS.heroSaffronTunic;
  const indigoMat = heroRim
    ? material.fabric({
        name: "hero-indigo-cloth-rimmed",
        color: "#243b7a",
        roughness: 0.54,
        sheen: 0.92,
        sheenColor: heroRim.color,
        sheenRoughness: 0.3
      })
    : CUMULUS_MATERIALS.heroIndigoCloth;

  const pelvisMesh = assembleMultiMaterialNode(
    "hero-pelvis-mesh",
    buildHeroPelvisSlots(),
    [tunicMat, indigoMat],
    { castShadow: true, receiveShadow: false, coalesceColors: true }
  );
  const sashL = group(
    HERO_PART_IDS.sashL,
    [assembleMultiMaterialNode("hero-sash-l-mesh", buildHeroSashTailSlots(-1), [indigoMat, CUMULUS_MATERIALS.cumulusAmberBraid], { castShadow: false, receiveShadow: false, coalesceColors: true })],
    { position: HERO_REST_PIVOTS.sashL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.sashL });
  const sashR = group(
    HERO_PART_IDS.sashR,
    [assembleMultiMaterialNode("hero-sash-r-mesh", buildHeroSashTailSlots(1), [indigoMat, CUMULUS_MATERIALS.cumulusAmberBraid], { castShadow: false, receiveShadow: false, coalesceColors: true })],
    { position: HERO_REST_PIVOTS.sashR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.sashR });

  const backPole = assembleMultiMaterialNode(
    HERO_PART_IDS.backPole,
    buildHeroBackPoleSlots(),
    [
      CUMULUS_MATERIALS.vermilionLacquer,
      CUMULUS_MATERIALS.engravedBrass,
      CUMULUS_MATERIALS.darkBronzeHardware,
      indigoMat
    ],
    {
      id: HERO_PART_IDS.backPole,
      position: HERO_REST_PIVOTS.backPolePos,
      rotation: HERO_REST_PIVOTS.backPoleRot,
      castShadow: false,
      receiveShadow: false,
      coalesceColors: true
    }
  );

  const head = group(
    HERO_PART_IDS.head,
    [
      assembleMultiMaterialNode(
        "hero-head-mesh",
        buildHeroHeadSlots(),
        [
          CUMULUS_MATERIALS.heroWarmSkin,
          CUMULUS_MATERIALS.heroRosyAccent,
          CUMULUS_MATERIALS.heroObsidianHair,
          CUMULUS_MATERIALS.heroEyeSclera,
          CUMULUS_MATERIALS.heroEyeIris,
          CUMULUS_MATERIALS.heroEyeCatchlight
        ],
        { castShadow: false, receiveShadow: false, coalesceColors: true }
      )
    ],
    { position: HERO_REST_PIVOTS.head, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.head });

  const forearmL = group(
    HERO_PART_IDS.forearmL,
    [assembleMultiMaterialNode("hero-forearm-l-mesh", buildHeroForearmSlots(1), [CUMULUS_MATERIALS.heroWarmSkin, indigoMat], { castShadow: false, receiveShadow: false, coalesceColors: true })],
    { position: HERO_REST_PIVOTS.forearmL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.forearmL });
  const armL = group(
    HERO_PART_IDS.armL,
    [
      assembleMultiMaterialNode("hero-arm-l-mesh", buildHeroUpperArmSlots(1), [tunicMat, indigoMat, CUMULUS_MATERIALS.heroWarmSkin], { castShadow: false, receiveShadow: false, coalesceColors: true }),
      forearmL
    ],
    { position: HERO_REST_PIVOTS.armL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.armL });

  const forearmR = group(
    HERO_PART_IDS.forearmR,
    [assembleMultiMaterialNode("hero-forearm-r-mesh", buildHeroForearmSlots(-1), [CUMULUS_MATERIALS.heroWarmSkin, indigoMat], { castShadow: false, receiveShadow: false, coalesceColors: true })],
    { position: HERO_REST_PIVOTS.forearmR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.forearmR });
  const armR = group(
    HERO_PART_IDS.armR,
    [
      assembleMultiMaterialNode("hero-arm-r-mesh", buildHeroUpperArmSlots(-1), [tunicMat, indigoMat, CUMULUS_MATERIALS.heroWarmSkin], { castShadow: false, receiveShadow: false, coalesceColors: true }),
      forearmR
    ],
    { position: HERO_REST_PIVOTS.armR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.armR });

  const torso = group(
    HERO_PART_IDS.torso,
    [
      assembleMultiMaterialNode(
        "hero-torso-mesh",
        buildHeroTorsoSlots(),
        [
          tunicMat,
          indigoMat,
          CUMULUS_MATERIALS.heroWarmSkin,
          CUMULUS_MATERIALS.heroStrapLeather,
          CUMULUS_MATERIALS.engravedBrass
        ],
        { castShadow: true, receiveShadow: false, coalesceColors: true }
      ),
      backPole,
      head,
      armL,
      armR
    ],
    { position: HERO_REST_PIVOTS.torso, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.torso });

  const bootL = group(
    HERO_PART_IDS.bootL,
    [assembleMultiMaterialNode("hero-boot-l-mesh", buildHeroBootSlots(), [indigoMat, CUMULUS_MATERIALS.heroBootCreamCuff, CUMULUS_MATERIALS.heroBootAmberSole], { castShadow: false, receiveShadow: false, coalesceColors: true })],
    { position: HERO_REST_PIVOTS.bootL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.bootL });
  const shinL = group(
    HERO_PART_IDS.shinL,
    [
      assembleMultiMaterialNode("hero-shin-l-mesh", buildHeroShinSlots(), [tunicMat], { castShadow: false, receiveShadow: false, coalesceColors: true }),
      bootL
    ],
    { position: HERO_REST_PIVOTS.shinL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.shinL });
  const thighL = group(
    HERO_PART_IDS.thighL,
    [
      assembleMultiMaterialNode("hero-thigh-l-mesh", buildHeroThighSlots(), [tunicMat], { castShadow: false, receiveShadow: false, coalesceColors: true }),
      shinL
    ],
    { position: HERO_REST_PIVOTS.thighL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.thighL });

  const bootR = group(
    HERO_PART_IDS.bootR,
    [assembleMultiMaterialNode("hero-boot-r-mesh", buildHeroBootSlots(), [indigoMat, CUMULUS_MATERIALS.heroBootCreamCuff, CUMULUS_MATERIALS.heroBootAmberSole], { castShadow: false, receiveShadow: false, coalesceColors: true })],
    { position: HERO_REST_PIVOTS.bootR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.bootR });
  const shinR = group(
    HERO_PART_IDS.shinR,
    [
      assembleMultiMaterialNode("hero-shin-r-mesh", buildHeroShinSlots(), [tunicMat], { castShadow: false, receiveShadow: false, coalesceColors: true }),
      bootR
    ],
    { position: HERO_REST_PIVOTS.shinR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.shinR });
  const thighR = group(
    HERO_PART_IDS.thighR,
    [
      assembleMultiMaterialNode("hero-thigh-r-mesh", buildHeroThighSlots(), [tunicMat], { castShadow: false, receiveShadow: false, coalesceColors: true }),
      shinR
    ],
    { position: HERO_REST_PIVOTS.thighR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.thighR });

  const pelvis = group(
    HERO_PART_IDS.pelvis,
    [pelvisMesh, sashL, sashR, torso, thighL, thighR],
    { position: HERO_REST_PIVOTS.pelvis, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.pelvis });

  return group(
    HERO_PART_IDS.root,
    [pelvis],
    { position: [0, 0, 0], rotationOrder: "YXZ" }
  ).runtime({ id: HERO_PART_IDS.root });
}

export interface SkyKidHeroAnimInput {
  readonly clip: string;
  readonly clock: number;
  readonly animT: number;
  readonly gaitPhase: number;
  readonly groundSpeed: number;
  readonly lean: number;
  readonly boostTimer?: number;
  readonly jumpVelocity?: number;
  readonly laneVelocity?: number;
  readonly onPole?: boolean;
}

export interface SkyKidHeroPose {
  readonly pelvisPos: V3;
  readonly pelvisRot: V3;
  readonly torsoRot: V3;
  readonly headRot: V3;
  readonly sashLRot: V3;
  readonly sashRRot: V3;
  readonly armLRot: V3;
  readonly forearmLRot: V3;
  readonly armRRot: V3;
  readonly forearmRRot: V3;
  readonly thighLRot: V3;
  readonly shinLRot: V3;
  readonly bootLRot: V3;
  readonly thighRRot: V3;
  readonly shinRRot: V3;
  readonly bootRRot: V3;
  readonly showBackPole: boolean;
}

const clampRange = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Pure deterministic per-frame articulation for the Sky Kid Cloud-Surfer Hero.
 * Never mutates or accumulates angles across frames (zero runaway cumulative rotation).
 */
export function computeSkyKidHeroPose(input: SkyKidHeroAnimInput): SkyKidHeroPose {
  const { clip, clock, animT, gaitPhase, groundSpeed, lean } = input;
  const boost = clampRange((input.boostTimer ?? 0) > 0 ? 1 : (groundSpeed - 15) / 5, 0, 1);
  const bank = clampRange((input.laneVelocity ?? 0) * 0.04, -0.28, 0.28);
  const vy = input.jumpVelocity ?? 0;
  const windFreq = 4.2 + groundSpeed * 0.35;
  const sashStream = clampRange(groundSpeed / 16, 0, 1) * 0.85 + boost * 0.25;

  let pelvisPos: V3 = [...HERO_REST_PIVOTS.pelvis];
  let pelvisRot: V3 = [0, 0, 0];
  let torsoRot: V3 = [0, 0, 0];
  let headRot: V3 = [0, 0, 0];
  let armLRot: V3 = [0.08, 0, 0.14];
  let forearmLRot: V3 = [-0.42, 0, -0.08];
  let armRRot: V3 = [0.08, 0, -0.14];
  let forearmRRot: V3 = [-0.42, 0, 0.08];
  let thighLRot: V3 = [0, 0, 0.03];
  let shinLRot: V3 = [0, 0, 0];
  let bootLRot: V3 = [0, 0, -0.03];
  let thighRRot: V3 = [0, 0, -0.03];
  let shinRRot: V3 = [0, 0, 0];
  let bootRRot: V3 = [0, 0, 0.03];

  if (clip === "run") {
    // Full stride synced to gaitPhase: left touchdown at integer phase, right touchdown at +0.5
    const th = gaitPhase * Math.PI * 2;
    const speedFactor = clampRange(groundSpeed / 14.5, 0.45, 1.25);
    const strideAmp = 0.78 * speedFactor + boost * 0.14;
    const bounce = Math.sin(th * 2 - Math.PI * 0.35) * 0.038 * speedFactor;
    const forwardLean = clampRange(lean + 0.16 * speedFactor + boost * 0.22, 0.08, 0.56);

    pelvisPos = [Math.sin(th) * 0.018, 0.705 + bounce - boost * 0.025, 0];
    pelvisRot = [forwardLean * 0.45, Math.sin(th) * 0.14, Math.cos(th) * 0.05 - bank * 0.4];
    torsoRot = [forwardLean * 0.55, -Math.sin(th) * 0.22, -bank * 0.35];
    headRot = [-forwardLean * 0.72, Math.sin(th) * 0.08, bank * 0.25];

    const legSwing = (phaseRad: number): { thigh: number; knee: number; ankle: number } => {
      // cos(0) = +1 -> forward leg contact; cos(PI) = -1 -> rear push-off; sin < 0 -> swing recovery
      const swing = Math.max(0, -Math.sin(phaseRad));
      const thigh = -Math.cos(phaseRad + 0.28) * strideAmp - swing * 0.22;
      const knee = 0.14 + swing * (1.18 * speedFactor) + Math.max(0, Math.sin(phaseRad)) * 0.22;
      const ankle = -thigh * 0.32 - knee * 0.38 + swing * 0.24;
      return { thigh, knee, ankle };
    };
    const lLeg = legSwing(th);
    const rLeg = legSwing(th + Math.PI);
    thighLRot = [lLeg.thigh, 0, 0.03];
    shinLRot = [lLeg.knee, 0, 0];
    bootLRot = [lLeg.ankle, 0, -0.03];
    thighRRot = [rLeg.thigh, 0, -0.03];
    shinRRot = [rLeg.knee, 0, 0];
    bootRRot = [rLeg.ankle, 0, 0.03];

    // Counter-phased martial sprint arms (aero sweep under boost)
    const armAmp = 0.74 * speedFactor * (1 - boost * 0.28);
    const aeroBack = boost * 0.48;
    const lArmSwing = Math.cos(th + 0.25) * armAmp + aeroBack;
    const rArmSwing = -Math.cos(th + 0.25) * armAmp + aeroBack;
    armLRot = [lArmSwing, 0.08, 0.18 + boost * 0.12];
    forearmLRot = [-1.08 + boost * 0.35 - Math.max(0, -lArmSwing) * 0.25, 0, -0.12];
    armRRot = [rArmSwing, -0.08, -0.18 - boost * 0.12];
    forearmRRot = [-1.08 + boost * 0.35 - Math.max(0, -rArmSwing) * 0.25, 0, 0.12];
  } else if (clip === "sit") {
    // Cloud-Surf Stance: wide martial surf crouch planted cleanly on the golden cumulus bolster
    const surfBob = Math.sin(clock * 3.4) * 0.022;
    pelvisPos = [0, 0.62 + surfBob, -0.02];
    pelvisRot = [0.12, 0.52, -bank * 0.85];
    torsoRot = [0.16 + boost * 0.14, 0.08, -bank * 0.45];
    headRot = [-0.2, -0.56, bank * 0.5];

    thighLRot = [-0.62, 0.22, 0.26];
    shinLRot = [0.82, 0, 0];
    bootLRot = [-0.22, -0.12, -0.18];

    thighRRot = [0.28, -0.24, -0.28];
    shinRRot = [0.76, 0, 0];
    bootRRot = [-0.88, 0.14, 0.18];

    armLRot = [-0.52, 0.25, 0.58 + Math.sin(clock * 3.4) * 0.06];
    forearmLRot = [-0.58, 0, -0.18];
    armRRot = [0.42, -0.22, -0.64 - Math.sin(clock * 3.4) * 0.06];
    forearmRRot = [-0.52, 0, 0.18];
  } else if (clip === "jump") {
    // Dynamic jump tuck & skyward reach (driven by vertical velocity + animT)
    const rise = clampRange(vy / 10, -1, 1);
    const tuck = 1 - Math.abs(rise) * 0.35;
    pelvisPos = [0, 0.74, 0];
    pelvisRot = [0.18 - rise * 0.16, -0.12, -bank * 0.5];
    torsoRot = [0.14 - rise * 0.12, 0.16, 0];
    headRot = [-0.22 - rise * 0.18, -0.06, 0];

    thighLRot = [-0.95 * tuck - Math.max(0, rise) * 0.2, 0.08, 0.1];
    shinLRot = [1.28 * tuck, 0, 0];
    bootLRot = [-0.25, 0, 0];

    thighRRot = [-0.35 + rise * 0.25, -0.08, -0.1];
    shinRRot = [0.75 + (1 - rise) * 0.25, 0, 0];
    bootRRot = [0.18, 0, 0];

    armLRot = [-1.45 - Math.max(0, rise) * 0.45, 0.18, 0.38];
    forearmLRot = [-0.45, 0, -0.12];
    armRRot = [0.55, -0.15, -0.45];
    forearmRRot = [-0.95, 0, 0.15];
  } else if (clip === "block") {
    // Vaulting / balancing atop the extended Power Pole over a gorge
    const balance = Math.sin(clock * 7) * 0.05;
    pelvisPos = [0, 0.64, 0];
    pelvisRot = [0.24, 0.32, balance];
    torsoRot = [0.22, -0.12, -balance];
    headRot = [-0.38, -0.2, 0];
    thighLRot = [-0.68, 0.12, 0.16];
    shinLRot = [0.92, 0, 0];
    bootLRot = [-0.24, 0, 0];
    thighRRot = [-0.48, -0.12, -0.16];
    shinRRot = [0.84, 0, 0];
    bootRRot = [-0.32, 0, 0];
    armLRot = [-0.75, 0.22, 0.62 + balance];
    forearmLRot = [-0.55, 0, 0];
    armRRot = [-0.65, -0.22, -0.62 + balance];
    forearmRRot = [-0.55, 0, 0];
  } else if (clip === "attack") {
    // Martial palm/fist strike with crisp hip-to-shoulder snap
    const snap = Math.sin(Math.min(1, animT * 3.2) * Math.PI);
    pelvisPos = [0, 0.68, 0.05 * snap];
    pelvisRot = [0.22 * snap, -0.38 * snap, 0];
    torsoRot = [0.18 * snap, -0.48 * snap, 0];
    headRot = [-0.22 * snap, 0.68 * snap, 0];
    thighLRot = [-0.52 * snap, 0.12, 0.14];
    shinLRot = [0.68 * snap, 0, 0];
    bootLRot = [-0.16 * snap, 0, 0];
    thighRRot = [0.38 * snap, -0.12, -0.14];
    shinRRot = [0.32 * snap, 0, 0];
    bootRRot = [-0.48 * snap, 0, 0];
    armLRot = [-1.48 * snap, -0.18, 0.12];
    forearmLRot = [-0.18, 0, 0];
    armRRot = [0.65 * snap, -0.2, -0.28];
    forearmRRot = [-1.35, 0, 0.22];
  } else if (clip === "hit") {
    // Stumble / knockback recoil
    const recoil = Math.exp(-animT * 2.4) * Math.cos(animT * 9);
    pelvisPos = [0, 0.69 - Math.abs(recoil) * 0.04, -0.04 * recoil];
    pelvisRot = [-0.28 * recoil, 0.18 * recoil, 0.12 * recoil];
    torsoRot = [-0.32 * recoil, -0.14 * recoil, 0];
    headRot = [-0.25 * recoil, 0.22 * recoil, -0.15 * recoil];
    thighLRot = [-0.32, 0, 0.14];
    shinLRot = [0.58, 0, 0];
    bootLRot = [-0.2, 0, 0];
    thighRRot = [0.18, 0, -0.14];
    shinRRot = [0.48, 0, 0];
    bootRRot = [-0.22, 0, 0];
    armLRot = [-0.65, 0.3, 0.72];
    forearmLRot = [-0.65, 0, -0.2];
    armRRot = [-0.65, -0.3, -0.72];
    forearmRRot = [-0.65, 0, 0.2];
  } else if (clip === "cheer") {
    // Joyful victory celebration pump
    const hop = Math.abs(Math.sin(clock * 4.8));
    pelvisPos = [0, 0.72 + hop * 0.06, 0];
    pelvisRot = [-0.06, Math.sin(clock * 2.4) * 0.14, 0];
    torsoRot = [-0.1, Math.sin(clock * 2.4) * 0.12, 0];
    headRot = [-0.16, Math.sin(clock * 2.4) * 0.15, Math.sin(clock * 4.8) * 0.06];
    thighLRot = [-0.18 * hop, 0, 0.08];
    shinLRot = [0.34 * hop, 0, 0];
    bootLRot = [-0.16 * hop, 0, -0.08];
    thighRRot = [-0.18 * hop, 0, -0.08];
    shinRRot = [0.34 * hop, 0, 0];
    bootRRot = [-0.16 * hop, 0, 0.08];
    armLRot = [-2.55 - hop * 0.22, 0.15, 0.38];
    forearmLRot = [-0.32, 0, -0.1];
    armRRot = [-2.55 - hop * 0.22, -0.15, -0.38];
    forearmRRot = [-0.32, 0, 0.1];
  } else if (clip === "dead") {
    // Grounded defeat kneel (never sinks below y = 0)
    const settle = Math.min(1, animT * 1.6);
    pelvisPos = [0, 0.72 - 0.28 * settle, 0];
    pelvisRot = [0.36 * settle, 0, 0];
    torsoRot = [0.42 * settle, 0, 0];
    headRot = [0.28 * settle, 0, 0];
    thighLRot = [-0.85 * settle, 0, 0.08];
    shinLRot = [1.55 * settle, 0, 0];
    bootLRot = [0.25 * settle, 0, 0];
    thighRRot = [-0.82 * settle, 0, -0.08];
    shinRRot = [1.52 * settle, 0, 0];
    bootRRot = [0.25 * settle, 0, 0];
    armLRot = [-0.45 * settle, 0, 0.22];
    forearmLRot = [-0.55 * settle, 0, 0];
    armRRot = [-0.45 * settle, 0, -0.22];
    forearmRRot = [-0.55 * settle, 0, 0];
  } else {
    // "idle": grounded martial ready stance (exact minY = 0 at boot soles) with calm breathing
    const breath = Math.sin(clock * 2.1);
    pelvisPos = [0, HERO_REST_PIVOTS.pelvis[1], 0];
    pelvisRot = [0.02, 0.12, 0];
    torsoRot = [0.02 + breath * 0.022, -0.06, 0];
    headRot = [-0.03 - breath * 0.018, -0.06 + Math.sin(clock * 0.9) * 0.08, 0];
    armLRot = [0.14, 0.12, 0.2 + breath * 0.025];
    forearmLRot = [-0.72, 0, -0.14];
    armRRot = [-0.18, -0.12, -0.22 - breath * 0.025];
    forearmRRot = [-0.86, 0, 0.16];
  }

  const sashWaveL = Math.sin(clock * windFreq) * (0.12 + sashStream * 0.22);
  const sashWaveR = Math.cos(clock * windFreq + 0.9) * (0.12 + sashStream * 0.22);
  const sashLRot: V3 = [0.22 + sashStream * 0.72 + sashWaveL, -0.08 + sashWaveR * 0.4, 0.1 + sashWaveL * 0.35];
  const sashRRot: V3 = [0.18 + sashStream * 0.68 + sashWaveR, 0.1 - sashWaveL * 0.4, -0.08 + sashWaveR * 0.35];

  return {
    pelvisPos,
    pelvisRot,
    torsoRot,
    headRot,
    sashLRot,
    sashRRot,
    armLRot,
    forearmLRot,
    armRRot,
    forearmRRot,
    thighLRot,
    shinLRot,
    bootLRot,
    thighRRot,
    shinRRot,
    bootRRot,
    showBackPole: !input.onPole
  };
}

export interface HeroNodeHandleLike {
  setPosition(x: number, y: number, z: number): void;
  setRotation(x: number, y: number, z: number): void;
  setVisible(visible: boolean): void;
}

export function applySkyKidHeroPose(
  nodeById: (id: string) => HeroNodeHandleLike,
  pose: SkyKidHeroPose
): void {
  const pelvis = nodeById(HERO_PART_IDS.pelvis);
  pelvis.setPosition(pose.pelvisPos[0], pose.pelvisPos[1], pose.pelvisPos[2]);
  pelvis.setRotation(pose.pelvisRot[0], pose.pelvisRot[1], pose.pelvisRot[2]);

  const rot = (id: string, r: V3): void => nodeById(id).setRotation(r[0], r[1], r[2]);
  rot(HERO_PART_IDS.torso, pose.torsoRot);
  rot(HERO_PART_IDS.head, pose.headRot);
  rot(HERO_PART_IDS.sashL, pose.sashLRot);
  rot(HERO_PART_IDS.sashR, pose.sashRRot);
  rot(HERO_PART_IDS.armL, pose.armLRot);
  rot(HERO_PART_IDS.forearmL, pose.forearmLRot);
  rot(HERO_PART_IDS.armR, pose.armRRot);
  rot(HERO_PART_IDS.forearmR, pose.forearmRRot);
  rot(HERO_PART_IDS.thighL, pose.thighLRot);
  rot(HERO_PART_IDS.shinL, pose.shinLRot);
  rot(HERO_PART_IDS.bootL, pose.bootLRot);
  rot(HERO_PART_IDS.thighR, pose.thighRRot);
  rot(HERO_PART_IDS.shinR, pose.shinRRot);
  rot(HERO_PART_IDS.bootR, pose.bootRRot);
  nodeById(HERO_PART_IDS.backPole).setVisible(pose.showBackPole);
}

// Re-export unused kernel helper reference to keep grouped spec utilities directly reachable for unit tests
export { buildGroupedGeometrySpec, icosphereFacetMesh };
