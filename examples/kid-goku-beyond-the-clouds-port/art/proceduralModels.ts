/**
 * Procedural Multi-Material Asset Library for Cumulus Dash (`WP-29`).
 *
 * Replaces static generated creature, prop, pickup, landmark, and cottage GLBs
 * with multi-part `@aura3d/engine` sculpted assemblies while keeping the
 * rigged runner character (`MESHY.hero`) and preserving all gameplay colliders,
 * camera clearance bounds, and node runtime IDs.
 */
import {
  geometry,
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
  mergeRawMeshes,
  stratifiedCliffMesh,
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
  // Saddle mass sits around z = -0.65 so world.ts's (base + forward * 1.1) at scale 1.7 seats the runner squarely.
  const goldPuffs: readonly [V3, V3][] = [
    [[0, 0.34, -0.64], [0.68, 0.34, 0.72]],
    [[-0.46, 0.38, -0.52], [0.44, 0.3, 0.48]],
    [[0.48, 0.39, -0.54], [0.45, 0.31, 0.49]],
    [[0, 0.36, -0.06], [0.5, 0.31, 0.52]],
    [[-0.36, 0.35, -1.04], [0.42, 0.28, 0.44]],
    [[0.35, 0.36, -1.02], [0.41, 0.28, 0.44]],
    [[0, 0.32, -1.24], [0.44, 0.27, 0.46]]
  ];
  for (let i = 0; i < goldPuffs.length; i += 1) {
    const [pos, sc] = goldPuffs[i]!;
    slots.push({
      mesh: cumulusPuffMesh(sc[0], sc[1], sc[2], pos, 17 + i * 11, 1.26),
      materialIndex: 0
    });
  }

  // Sun-kissed cream upper bolsters & prow crown
  const creamBolsters: readonly [V3, V3][] = [
    [[0, 0.56, -0.58], [0.46, 0.22, 0.48]],
    [[-0.34, 0.54, -0.64], [0.3, 0.2, 0.34]],
    [[0.34, 0.55, -0.64], [0.3, 0.2, 0.34]],
    [[0, 0.52, -0.02], [0.36, 0.22, 0.36]],
    [[0, 0.48, -1.08], [0.33, 0.2, 0.34]]
  ];
  for (let i = 0; i < creamBolsters.length; i += 1) {
    const [pos, sc] = creamBolsters[i]!;
    slots.push({
      mesh: cumulusPuffMesh(sc[0], sc[1], sc[2], pos, 91 + i * 13, 1.3),
      materialIndex: 1
    });
  }

  // Sweeping S-curved trailing cumulus tail curl (tubeSweepMesh along Catmull-Rom spline)
  const tailCtrl: V3[] = [
    [0, 0.34, -0.98],
    [0.08, 0.28, -1.36],
    [-0.1, 0.35, -1.72],
    [0.04, 0.54, -2.02],
    [0, 0.72, -1.94],
    [0, 0.64, -1.8]
  ];
  const tailPts = catmullRomSpline3(tailCtrl, 6, false);
  const tailSpine: V4[] = tailPts.map((p, idx) => {
    const t = idx / Math.max(1, tailPts.length - 1);
    const rad = Math.max(0.035, 0.32 * Math.pow(1 - t, 0.78) + 0.04 * Math.sin(t * Math.PI * 3));
    return [p[0], p[1], p[2], rad];
  });
  slots.push({ mesh: weldSmoothNormals(tubeSweepMesh(tailSpine, 14, false)), materialIndex: 0 });

  // Twin lateral vortex curls hugging both flanks
  for (const side of [-1, 1] as const) {
    const curlPts = catmullRomSpline3([
      [side * 0.28, 0.34, 0.16],
      [side * 0.62, 0.3, -0.26],
      [side * 0.68, 0.36, -0.78],
      [side * 0.48, 0.48, -1.16],
      [side * 0.34, 0.56, -1.04]
    ], 5, false);
    const curlSpine: V4[] = curlPts.map((p, idx) => {
      const t = idx / Math.max(1, curlPts.length - 1);
      return [p[0], p[1], p[2], Math.max(0.03, 0.14 * (1 - t * 0.68))];
    });
    slots.push({ mesh: weldSmoothNormals(tubeSweepMesh(curlSpine, 10, false)), materialIndex: 2 });
  }

  return assembleMultiMaterialNode(
    "sky-cloud",
    slots,
    [CUMULUS_MATERIALS.cumulusGoldPlush, CUMULUS_MATERIALS.cumulusCreamPuff, CUMULUS_MATERIALS.cumulusAmberBraid],
    { id: "sky-cloud", castShadow: false, receiveShadow: false }
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
    { id: "staff", castShadow: true, receiveShadow: false }
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
  // Glazed plump roast haunch revolved along +Y then tilted along Z
  const roastProfile: V2[] = bezierCurve2([0, -0.52], [0.48, -0.46], [0.5, 0.46], [0, 0.52], 14);
  const haunch = weldSmoothNormals(transformMesh(latheMesh(roastProfile, 20, false), { rot: [Math.PI * 0.5, 0, 0] }));
  // Marrow bone shaft + twin condyle knobs at both ends
  const boneShaft = tubeSweepMesh([[0, 0, -0.78, 0.085], [0, 0, 0.78, 0.085]], 10, false);
  const knob = smoothEllipsoid(0.11, 0.1, 0.11, 8, 12, 0);
  // Nestled celestial honey-peach garnish + emerald leaf on top of the roast
  const peachHalf = smoothEllipsoid(0.2, 0.22, 0.19, 10, 16, 0);
  const leafPoly: V2[] = [[0, 0], [0.09, 0.05], [0.18, 0.02], [0.24, 0], [0.18, -0.03], [0.08, -0.05]];
  const slots: MultiMatSlot[] = [
    { mesh: haunch, materialIndex: 0 },
    { mesh: transformMesh(smoothEllipsoid(0.28, 0.14, 0.34, 10, 16, 0), { pos: [0.06, 0.32, 0] }), materialIndex: 1 },
    { mesh: boneShaft, materialIndex: 2 },
    { mesh: transformMesh(knob, { pos: [-0.06, 0.02, 0.8] }), materialIndex: 2 },
    { mesh: transformMesh(knob, { pos: [0.06, -0.02, 0.8] }), materialIndex: 2 },
    { mesh: transformMesh(knob, { pos: [-0.06, 0.02, -0.8] }), materialIndex: 2 },
    { mesh: transformMesh(knob, { pos: [0.06, -0.02, -0.8] }), materialIndex: 2 },
    { mesh: transformMesh(peachHalf, { pos: [0.28, 0.24, 0.16] }), materialIndex: 3 },
    { mesh: transformMesh(peachHalf, { pos: [0.33, 0.25, 0.12] }), materialIndex: 3 },
    {
      mesh: transformMesh(extrudePolygonMesh(leafPoly, 0.024, 0.006, false), {
        pos: [0.3, 0.45, 0.14],
        rot: [0.5, 0.3, 0.25]
      }),
      materialIndex: 4
    }
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
    { id: `meat-${index}`, castShadow: false, receiveShadow: false }
  );
}

export function buildSkyCoinNode(index: number): MultiMatNodeBuilder {
  // Upright turned brass sky-coin in XY (radius 0.32m) with raised rim and glowing amber star cabochon
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
  const rim = transformMesh(latheMesh(coinProfile, 20, false), { rot: [Math.PI * 0.5, 0, 0] });
  const gem = starPrism3DMesh(0.15, 0.07, 0.11);
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
  const core = smoothEllipsoid(0.97, 0.97, 0.97, 16, 24, 0);
  for (let i = 0; i < core.positions.length; i += 3) {
    const x = core.positions[i]!;
    const y = core.positions[i + 1]!;
    const z = core.positions[i + 2]!;
    const n = fbm3(x * 1.8 + index * 2.1, y * 1.8, z * 1.8 - index * 1.3, 41 + index);
    const k = 0.95 + n * 0.09;
    core.positions[i] = x * k;
    core.positions[i + 1] = Math.max(0, Math.min(2.0, 1.0 + y * k));
    core.positions[i + 2] = z * k;
  }
  const rockBody = weldSmoothNormals(core);

  const eqStoneBand = transformMesh(circleTubeMesh(0.985, 0.065, 28, "y"), { pos: [0, 1.0, 0] });
  const merStoneBand = transformMesh(circleTubeMesh(0.985, 0.06, 28, "z"), { pos: [0, 1.0, 0] });
  const eqRuneRing = transformMesh(circleTubeMesh(1.012, 0.024, 28, "y"), { pos: [0, 1.0, 0] });
  const merRuneRing = transformMesh(circleTubeMesh(1.012, 0.022, 28, "x"), { pos: [0, 1.0, 0] });
  const mossTop = transformMesh(smoothEllipsoid(0.58, 0.16, 0.56, 8, 16, 0.3), { pos: [0, 1.86, 0] });
  const mossSide = transformMesh(smoothEllipsoid(0.42, 0.18, 0.44, 8, 14, 0.2), {
    pos: [0.68, 1.38, 0.32],
    rot: [0.3, 0.4, -0.6]
  });

  const slots: MultiMatSlot[] = [
    { mesh: rockBody, materialIndex: 0 },
    { mesh: eqStoneBand, materialIndex: 0 },
    { mesh: merStoneBand, materialIndex: 0 },
    { mesh: mossTop, materialIndex: 1 },
    { mesh: mossSide, materialIndex: 1 },
    { mesh: eqRuneRing, materialIndex: 2 },
    { mesh: merRuneRing, materialIndex: 2 }
  ];
  return assembleMultiMaterialNode(
    `boulder-${index}`,
    slots,
    [CUMULUS_MATERIALS.carvedSandstone, CUMULUS_MATERIALS.mossyMineralCap, CUMULUS_MATERIALS.runeAmberEmissive],
    { id: `boulder-${index}`, castShadow: true, receiveShadow: false }
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
    { id: `ptera-body-${index}`, castShadow: true, receiveShadow: false }
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
    { id: "rex-body", castShadow: true, receiveShadow: false }
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
    { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: false }
  );
}

export function buildSanctuaryToriiNode(name: string, position: V3, yaw: number): MultiMatNodeBuilder {
  // Open-sightline twin sanctuary pillars at x = +/-7.55m (cleanly outside ROAD_HALF = 6.2m) with ZERO overhead crossbars
  // spanning across the track so upcoming obstacles, dives, and collectibles stay 100% unobstructed at every camera pitch!
  const slots: MultiMatSlot[] = [];
  for (const sx of [-7.55, 7.55] as const) {
    const shoeProfile: V2[] = [[0, -0.4], [0.64, -0.4], [0.58, 0.48], [0.44, 0.56], [0, 0.56]];
    slots.push({ mesh: transformMesh(latheMesh(shoeProfile, 18, false), { pos: [sx, 0, 0] }), materialIndex: 1 });
    slots.push({
      mesh: tubeSweepMesh([[sx, 0.48, 0, 0.38], [sx * 0.99, 6.45, 0, 0.29]], 14, false),
      materialIndex: 0
    });
    slots.push({ mesh: transformMesh(circleTubeMesh(0.35, 0.045, 18, "y"), { pos: [sx * 0.992, 5.15, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(circleTubeMesh(0.33, 0.042, 18, "y"), { pos: [sx * 0.991, 6.22, 0] }), materialIndex: 2 });
    // Sculpted side-pillar pagoda lantern cap + glowing amber heart + brass lotus finial (strictly outside track shoulders)
    const capX = sx * 0.99;
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.18, 0.16, 1.18, 0.035), { pos: [capX, 6.52, 0] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(smoothEllipsoid(0.34, 0.38, 0.34, 10, 16, 0), { pos: [capX, 6.9, 0] }), materialIndex: 3 });
    const eaveCurve = bezierCurve2([0.92, 7.18], [0.58, 7.36], [0.24, 7.64], [0, 7.92], 10);
    slots.push({ mesh: transformMesh(weldSmoothNormals(latheMesh([[0, 7.16], ...eaveCurve], 16, false)), { pos: [capX, 0, 0] }), materialIndex: 0 });
    const finial: V2[] = [[0, 7.9], [0.16, 7.94], [0.07, 8.12], [0.11, 8.26], [0.02, 8.48], [0, 8.5]];
    slots.push({ mesh: transformMesh(latheMesh(finial, 14, false), { pos: [capX, 0, 0] }), materialIndex: 2 });
  }

  return assembleMultiMaterialNode(
    name,
    slots,
    [
      CUMULUS_MATERIALS.vermilionLacquer,
      CUMULUS_MATERIALS.obsidianLacquer,
      CUMULUS_MATERIALS.engravedBrass,
      CUMULUS_MATERIALS.lanternHeartEmissive
    ],
    { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: false }
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
      castShadow: true,
      receiveShadow: false,
      transforms,
      ...windOpt
    }),
    instances.custom(mergeRawMeshes([mainCrown]), {
      name: "hero-trees-round",
      material: INSTANCED_MATERIALS.canopyDeep,
      castShadow: true,
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
      castShadow: true,
      receiveShadow: false,
      transforms,
      ...windOpt
    }),
    instances.custom(mergeRawMeshes([boughs, padL, padR]), {
      name: "hero-trees-pine",
      material: INSTANCED_MATERIALS.pineFoliage,
      castShadow: true,
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

// Re-export unused kernel helper reference to keep grouped spec utilities directly reachable for unit tests
export { buildGroupedGeometrySpec, icosphereFacetMesh };
