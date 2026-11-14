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
  bakeMeshCavityAO,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
  deformMesh,
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
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptOrganicSdfMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
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

  // Sky Kid Cloud-Surfer Hero multi-material palette (rich physical sheen & clearcoat, preserved with coalesceColors: false)
  heroWarmSkin: material.physical({
    name: "hero-warm-skin",
    color: "#f7c6a2",
    roughness: 0.5,
    sheen: 0.36,
    sheenColor: "#ffe3cc",
    sheenRoughness: 0.5
  }),
  heroRosyAccent: material.physical({
    name: "hero-rosy-accent",
    color: "#ea8d74",
    roughness: 0.52,
    sheen: 0.34,
    sheenColor: "#ffd0c2",
    sheenRoughness: 0.48
  }),
  heroObsidianHair: material.physical({
    name: "hero-obsidian-hair",
    color: "#22293d",
    roughness: 0.24,
    clearcoat: 0.68,
    clearcoatRoughness: 0.14,
    sheen: 0.82,
    sheenColor: "#2b3d70",
    sheenRoughness: 0.28
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
    color: "#1ea388",
    roughness: 0.84,
    sheen: 0.88,
    sheenColor: "#9ef5df",
    sheenRoughness: 0.46
  }),
  heroIndigoCloth: material.fabric({
    name: "hero-indigo-cloth",
    color: "#25438c",
    roughness: 0.84,
    sheen: 0.88,
    sheenColor: "#7ea8e8",
    sheenRoughness: 0.46
  }),
  heroBootCreamCuff: material.fabric({
    name: "hero-boot-cream-cuff",
    color: "#fcf4e6",
    roughness: 0.84,
    sheen: 0.9,
    sheenColor: "#ffffff",
    sheenRoughness: 0.44
  }),
  heroBootAmberSole: material.physical({
    name: "hero-boot-amber-sole",
    color: "#e8a23a",
    roughness: 0.44,
    clearcoat: 0.18,
    clearcoatRoughness: 0.36
  }),
  heroStrapLeather: material.physical({
    name: "hero-strap-leather",
    color: "#784828",
    roughness: 0.52,
    sheen: 0.28,
    sheenColor: "#c99266",
    sheenRoughness: 0.48
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
  const hasColors = Boolean(src.colors && src.colors.length >= (src.positions.length / 3) * 4);
  const colorAccum: number[] = [];
  const colorCounts: number[] = [];
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
      if (hasColors) {
        colorAccum.push(0, 0, 0, 0);
        colorCounts.push(0);
      }
    }
    if (hasColors && src.colors) {
      colorAccum[idx * 4]! += src.colors[i * 4] ?? 1;
      colorAccum[idx * 4 + 1]! += src.colors[i * 4 + 1] ?? 1;
      colorAccum[idx * 4 + 2]! += src.colors[i * 4 + 2] ?? 1;
      colorAccum[idx * 4 + 3]! += src.colors[i * 4 + 3] ?? 1;
      colorCounts[idx]! += 1;
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
    const rawL = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (rawL > 1e-9) {
      outNormals[i] = normals[i]! / rawL;
      outNormals[i + 1] = normals[i + 1]! / rawL;
      outNormals[i + 2] = normals[i + 2]! / rawL;
    } else {
      outNormals[i] = 0;
      outNormals[i + 1] = 1;
      outNormals[i + 2] = 0;
    }
  }
  if (hasColors) {
    const colors = new Array<number>((positions.length / 3) * 4);
    for (let v = 0; v < colorCounts.length; v += 1) {
      const inv = 1 / Math.max(1, colorCounts[v]!);
      colors[v * 4] = colorAccum[v * 4]! * inv;
      colors[v * 4 + 1] = colorAccum[v * 4 + 1]! * inv;
      colors[v * 4 + 2] = colorAccum[v * 4 + 2]! * inv;
      colors[v * 4 + 3] = colorAccum[v * 4 + 3]! * inv;
    }
    return { positions, normals: outNormals, uvs, indices, colors };
  }
  return { positions, normals: outNormals, uvs, indices };
}

/**
 * Paints cloth-fold / anatomical vertex color gradients via `paintMeshColors` and bakes genuine `0.25`
 * 1-ring concavity ambient occlusion (`bakeMeshCavityAO(..., 0.25)`), smoothly clamped above `floor` (`0.765`)
 * so hero creases read with crisp 3D depth while preserving luminous sky-lit sheen (`>= 0.75`).
 */
function paintAndBakeHeroAO(
  src: RawMesh,
  sampler: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => V4,
  floor = 0.765
): RawMesh {
  const painted = paintMeshColors(src, ([x, y, z], [nx, ny, nz]) => sampler(x, y, z, nx, ny, nz), false);
  const baked = bakeMeshCavityAO(painted, 0.25);
  if (!baked.colors) return baked;
  const out = baked.colors.slice();
  const span = 1 - floor;
  for (let i = 0; i < out.length; i += 4) {
    for (let k = 0; k < 3; k += 1) {
      const raw = out[i + k]!;
      const t = Math.max(0, Math.min(1, (raw - 0.62) / 0.38));
      out[i + k] = Math.min(1, Math.max(floor, floor + span * t));
    }
    out[i + 3] = 1;
  }
  return {
    positions: baked.positions,
    normals: baked.normals,
    uvs: baked.uvs,
    indices: baked.indices,
    colors: out
  };
}

/** Shades sky-guardian / enemy anatomy with `taubinSmoothMesh` + `weldSmoothNormals` + `paintMeshColors` + full `bakeMeshCavityAO(..., 0.25)`. */
function shadeEnemySculpt(
  src: RawMesh,
  crestTint: V3 = [1.02, 1.0, 0.96],
  shadowTint: V3 = [0.82, 0.84, 0.9],
  foldFreq = 4.2
): RawMesh {
  const smooth = weldSmoothNormals(taubinSmoothMesh(src, 3));
  const painted = paintMeshColors(
    smooth,
    ([x, y, z], [nx, ny, nz]) => {
      const sun = Math.max(0, Math.min(1, 0.5 + 0.36 * ny + 0.16 * nz - 0.08 * Math.abs(nx)));
      const ripple = 0.97 + 0.03 * Math.sin((x + z) * foldFreq + y * foldFreq * 0.7);
      const mix = (a: number, b: number): number => Math.max(0.55, Math.min(1, (a + (b - a) * sun) * ripple));
      return [mix(shadowTint[0], crestTint[0]), mix(shadowTint[1], crestTint[1]), mix(shadowTint[2], crestTint[2]), 1];
    },
    false
  );
  return bakeMeshCavityAO(painted, 0.25);
}

/** Applies gentle linear-RGB vertex-color tonal sculpting (`[0..1]`) while preserving full PBR `sheenColor` / `clearcoat`. */
function shadeOrganicVertexColors(
  src: RawMesh,
  tintFn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number, number]
): RawMesh {
  return paintAndBakeHeroAO(src, (x, y, z, nx, ny, nz) => {
    const [r, g, b] = tintFn(x, y, z, nx, ny, nz);
    return [r, g, b, 1];
  });
}

function clampMeshMinY(src: RawMesh, minY: number): RawMesh {
  const positions = src.positions.slice();
  for (let i = 1; i < positions.length; i += 3) {
    if (positions[i]! < minY) positions[i] = minY;
  }
  return {
    positions,
    normals: src.normals,
    uvs: src.uvs,
    indices: src.indices,
    ...(src.colors ? { colors: src.colors } : {})
  };
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
  const slots = memoizeGeometry("cumulus:sky-cloud-slots-v4", (): MultiMatSlot[] => {
    const out: MultiMatSlot[] = [];
    const tintCloudPuff = (mesh: RawMesh, warmPeak: V3, baseGlow: V3): RawMesh =>
      paintMeshColors(
        mesh,
        ([_x, y, _z], [_nx, ny, nz]) => {
          const lift = Math.max(0, Math.min(1, 0.56 + 0.34 * ny + 0.12 * nz + (y - 0.34) * 0.28));
          return [
            baseGlow[0] + (warmPeak[0] - baseGlow[0]) * lift,
            baseGlow[1] + (warmPeak[1] - baseGlow[1]) * lift,
            baseGlow[2] + (warmPeak[2] - baseGlow[2]) * lift,
            1
          ];
        },
        false
      );

    // 1. Extra-smooth pillowy golden nimbus body & comet-tail sculpted via `sculptOrganicSdfMesh` (`sminPoly` metaballs + Taubin fairing)
    //    Saddle mass sits around z = -0.65 so world.ts's (base + forward * 1.1) at scale 1.7 seats the runner squarely.
    const goldPuffs: readonly [V3, V3][] = [
      [[0, 0.34, -0.64], [0.74, 0.36, 0.78]],
      [[-0.48, 0.38, -0.52], [0.48, 0.33, 0.52]],
      [[0.49, 0.39, -0.54], [0.49, 0.33, 0.53]],
      [[0, 0.39, 0.06], [0.58, 0.35, 0.58]],
      [[-0.37, 0.35, -1.04], [0.45, 0.31, 0.47]],
      [[0.37, 0.36, -1.02], [0.44, 0.31, 0.47]],
      [[0, 0.33, -1.28], [0.47, 0.3, 0.49]],
      [[0.05, 0.32, -1.56], [0.35, 0.25, 0.37]],
      [[-0.06, 0.4, -1.82], [0.26, 0.2, 0.28]],
      [[0.02, 0.58, -1.98], [0.2, 0.17, 0.21]]
    ];
    const tailCapsules: readonly [V3, V3, number, number][] = [
      [[0, 0.34, -0.98], [0.08, 0.29, -1.36], 0.34, 0.27],
      [[0.08, 0.29, -1.36], [-0.09, 0.36, -1.72], 0.27, 0.2],
      [[-0.09, 0.36, -1.72], [0.04, 0.56, -2.04], 0.2, 0.13],
      [[0.04, 0.56, -2.04], [0, 0.76, -1.94], 0.13, 0.08],
      [[0, 0.76, -1.94], [0, 0.67, -1.77], 0.08, 0.05]
    ];
    const goldSdfCloud = weldSmoothNormals(
      sculptOrganicSdfMesh({
        boundsMin: [-1.14, -0.1, -2.32],
        boundsMax: [1.14, 0.98, 0.82],
        resolution: [40, 24, 50],
        taubinIterations: 5,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          let d = 1e6;
          for (const [center, radii] of goldPuffs) {
            d = sminPoly(d, sdfEllipsoid(p, center, radii), 0.24);
          }
          for (const [a, b, ra, rb] of tailCapsules) {
            d = sminPoly(d, sdfTaperedCapsule(p, a, b, ra, rb), 0.2);
          }
          return d;
        }
      })
    );
    out.push({
      mesh: tintCloudPuff(goldSdfCloud, [1, 0.99, 0.94], [0.92, 0.88, 0.8]),
      materialIndex: 0
    });

    // 2. Sun-kissed cream upper bolsters & prow crown blended organically via `sculptOrganicSdfMesh`
    const creamBolsters: readonly [V3, V3][] = [
      [[0, 0.57, -0.58], [0.5, 0.24, 0.53]],
      [[-0.36, 0.55, -0.64], [0.34, 0.22, 0.37]],
      [[0.36, 0.56, -0.64], [0.34, 0.22, 0.37]],
      [[0, 0.56, 0.05], [0.41, 0.25, 0.41]],
      [[0, 0.5, -1.08], [0.36, 0.23, 0.37]],
      [[-0.03, 0.48, -1.52], [0.25, 0.18, 0.27]],
      [[0, 0.72, -1.9], [0.17, 0.15, 0.17]]
    ];
    const creamSdfCrown = weldSmoothNormals(
      sculptOrganicSdfMesh({
        boundsMin: [-0.84, 0.22, -2.18],
        boundsMax: [0.84, 0.96, 0.58],
        resolution: [30, 18, 38],
        taubinIterations: 5,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          let d = 1e6;
          for (const [center, radii] of creamBolsters) {
            d = sminPoly(d, sdfEllipsoid(p, center, radii), 0.2);
          }
          return d;
        }
      })
    );
    out.push({
      mesh: tintCloudPuff(creamSdfCrown, [1, 1, 0.99], [0.94, 0.92, 0.88]),
      materialIndex: 1
    });

    // 3. Sculpted ruyi cloud-scroll spiral volutes hugging both flanks + prow cloud-crest curl (`taubinSmoothMesh` + `weldSmoothNormals`)
    for (const side of [-1, 1] as const) {
      const curlPts = catmullRomSpline3([
        [side * 0.26, 0.38, 0.28],
        [side * 0.66, 0.33, -0.22],
        [side * 0.73, 0.39, -0.78],
        [side * 0.5, 0.52, -1.17],
        [side * 0.34, 0.6, -1.03],
        [side * 0.42, 0.52, -0.92]
      ], 4, false);
      const curlSpine: V4[] = curlPts.map((p, idx) => {
        const t = idx / Math.max(1, curlPts.length - 1);
        return [p[0], p[1], p[2], Math.max(0.032, 0.15 * Math.pow(1 - t * 0.68, 0.84))];
      });
      out.push({
        mesh: tintCloudPuff(
          weldSmoothNormals(taubinSmoothMesh(subdivideSmoothMesh(tubeSweepMesh(curlSpine, 16, false), 1, 0.38), 4)),
          [1, 0.97, 0.9],
          [0.9, 0.84, 0.74]
        ),
        materialIndex: 2
      });
    }
    const prowScrollPts = catmullRomSpline3([
      [-0.24, 0.42, 0.46],
      [0, 0.46, 0.58],
      [0.24, 0.42, 0.46]
    ], 4, false);
    out.push({
      mesh: tintCloudPuff(
        weldSmoothNormals(
          taubinSmoothMesh(
            subdivideSmoothMesh(
              tubeSweepMesh(prowScrollPts.map((p, idx) => [p[0], p[1], p[2], 0.088 + 0.032 * Math.sin((idx / Math.max(1, prowScrollPts.length - 1)) * Math.PI)]), 14, false),
              1,
              0.38
            ),
            4
          )
        ),
        [1, 0.98, 0.92],
        [0.9, 0.85, 0.76]
      ),
      materialIndex: 2
    });
    return out;
  });

  return assembleMultiMaterialNode(
    "sky-cloud",
    slots,
    [CUMULUS_MATERIALS.cumulusGoldPlush, CUMULUS_MATERIALS.cumulusCreamPuff, CUMULUS_MATERIALS.cumulusAmberBraid],
    { id: "sky-cloud", castShadow: false, receiveShadow: false, visible: false, coalesceColors: false }
  );
}

export function buildSkyStaffNode(): MultiMatNodeBuilder {
  // Exact y in [0, 1] local bounds so staff.setScale([1, l, 1]) bridges gorges cleanly
  const slots = memoizeGeometry("cumulus:sky-staff-slots-v2", (): MultiMatSlot[] => {
    const shaftProfile: V2[] = [
      [0, 0.06],
      [0.128, 0.06],
      [0.133, 0.28],
      [0.135, 0.5],
      [0.133, 0.72],
      [0.128, 0.94],
      [0, 0.94]
    ];
    const ferruleBot: V2[] = bezierCurve2([0, 0], [0.21, 0.002], [0.214, 0.056], [0.132, 0.076], 12);
    const ferruleTop: V2[] = bezierCurve2([0.132, 0.924], [0.214, 0.944], [0.21, 0.998], [0, 1.0], 12);
    const collarRing: V2[] = [
      [0.13, -0.011],
      [0.172, -0.008],
      [0.18, 0],
      [0.172, 0.008],
      [0.13, 0.011]
    ];
    return [
      { mesh: shadeEnemySculpt(latheMesh(shaftProfile, 24, false), [1, 0.98, 0.96], [0.84, 0.78, 0.78], 6), materialIndex: 0 },
      { mesh: shadeEnemySculpt(latheMesh(ferruleBot, 24, false), [1, 0.99, 0.94], [0.84, 0.8, 0.72], 8), materialIndex: 1 },
      { mesh: shadeEnemySculpt(latheMesh(ferruleTop, 24, false), [1, 0.99, 0.94], [0.84, 0.8, 0.72], 8), materialIndex: 1 },
      { mesh: transformMesh(shadeEnemySculpt(latheMesh(collarRing, 22, false)), { pos: [0, 0.084, 0] }), materialIndex: 2 },
      { mesh: transformMesh(shadeEnemySculpt(latheMesh(collarRing, 22, false)), { pos: [0, 0.916, 0] }), materialIndex: 2 },
      { mesh: transformMesh(shadeEnemySculpt(latheMesh(collarRing, 22, false)), { pos: [0, 0.5, 0], scale: [0.92, 0.85, 0.92] }), materialIndex: 1 }
    ];
  });
  return assembleMultiMaterialNode(
    "staff",
    slots,
    [CUMULUS_MATERIALS.vermilionLacquer, CUMULUS_MATERIALS.engravedBrass, CUMULUS_MATERIALS.darkBronzeHardware],
    { id: "staff", castShadow: false, receiveShadow: false, visible: false, coalesceColors: false }
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
  // Fierce Horned Sky-Demon Wyvern: local +Z faces toward the runner; pre-scale bounds y in [0.06, 1.72], wingspan ~2.58m.
  // Preserves exact 5 material groups (0: pteroSlateHide, 1: wingMembraneSheen, 2: crimsonRoofGlaze, 3: ivoryBone, 4: creatureEyeEmissive).
  const slots = memoizeGeometry("cumulus:ptera-slots-v3", (): MultiMatSlot[] => {
    const out: MultiMatSlot[] = [];

    // 1. 20-station sculpted keel-chested wyvern fuselage, arched S-neck & barbed tail shaft
    const wyvernSection = (cx: number, cy: number, cz: number, rx: number, ry: number, segs = 20, pitch = 0, keel = 0.08): V3[] => {
      const ring: V3[] = [];
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const dorsalRidge = sa > 0 ? 1 + keel * Math.pow(Math.max(0, 1 - Math.abs(ca)), 1.6) : 1 + keel * 0.65 * Math.pow(Math.max(0, 1 - Math.abs(ca)), 2);
        const lx = ca * rx * (1 + 0.04 * Math.cos(a * 3));
        const ly = sa * ry * dorsalRidge;
        ring.push([cx + lx, cy + ly * cp, cz + ly * sp]);
      }
      return ring;
    };
    const bodySections: V3[][] = [
      wyvernSection(0, 0.7, -1.06, 0.022, 0.024, 20, 0, 0.05),
      wyvernSection(0, 0.73, -0.78, 0.078, 0.075, 20, 0, 0.08),
      wyvernSection(0, 0.76, -0.46, 0.165, 0.155, 20, 0, 0.1),
      wyvernSection(0, 0.81, -0.14, 0.255, 0.235, 20, 0.04, 0.12),
      wyvernSection(0, 0.85, 0.22, 0.295, 0.265, 20, 0.08, 0.14),
      wyvernSection(0, 0.97, 0.52, 0.175, 0.185, 20, 0.24, 0.1),
      wyvernSection(0, 1.14, 0.72, 0.18, 0.185, 20, 0.14, 0.08),
      wyvernSection(0, 1.16, 0.9, 0.135, 0.14, 20, 0.04, 0.06)
    ];
    out.push({
      mesh: shadeEnemySculpt(subdivideSmoothMesh(loftSectionsMesh(bodySections, true, false), 1, 0.38), [1.02, 1.01, 0.98], [0.78, 0.81, 0.88], 5.2),
      materialIndex: 0
    });

    // Sculpted armored wyvern cranium derived from `sculptStylizedHeadMesh` with heavy supraorbital brow ridges
    const wyvernSkull = transformMesh(
      deformMesh(
        sculptStylizedHeadMesh(0.165, { jawTaper: 0.62, cheekFullness: 0.14, noseBridge: 0.22, browRidge: 0.24, subdivisions: 2, seed: 31 }),
        ([x, y, z]) => {
          const browFlare = y > 0.02 && z > 0 ? 1 + 0.18 * Math.max(0, y) * 3 : 1;
          return [x * 0.92 * browFlare, y * 0.88, z * 1.32];
        }
      ),
      { pos: [0, 1.16, 0.84] }
    );
    out.push({
      mesh: shadeEnemySculpt(wyvernSkull, [1.03, 1.01, 0.98], [0.76, 0.8, 0.88], 6.4),
      materialIndex: 0
    });

    // Ribbed ochre-gold chest plastron armor plates
    const plastronSections: V3[][] = [
      wyvernSection(0, 0.71, -0.34, 0.15, 0.095, 18, 0, 0.06),
      wyvernSection(0, 0.72, 0.06, 0.23, 0.14, 18, 0.04, 0.1),
      wyvernSection(0, 0.79, 0.4, 0.175, 0.115, 18, 0.16, 0.08),
      wyvernSection(0, 0.92, 0.62, 0.09, 0.065, 18, 0.22, 0.04)
    ];
    out.push({
      mesh: shadeEnemySculpt(subdivideSmoothMesh(loftSectionsMesh(plastronSections, true, false), 1, 0.36), [1.02, 0.99, 0.93], [0.82, 0.78, 0.7], 7.5),
      materialIndex: 1
    });

    // 2. Fierce hooked raptorial upper & lower jaws + 6 razor ivory fangs (+Z)
    const upperBeak = shadeEnemySculpt(
      subdivideSmoothMesh(
        loftSectionsMesh([
          wyvernSection(0, 1.16, 0.88, 0.12, 0.096, 18, 0, 0.16),
          wyvernSection(0, 1.15, 1.22, 0.082, 0.072, 18, -0.04, 0.2),
          wyvernSection(0, 1.12, 1.56, 0.044, 0.046, 18, -0.1, 0.22),
          wyvernSection(0, 1.05, 1.8, 0.012, 0.016, 18, -0.24, 0.15)
        ], true, false),
        1,
        0.34
      ),
      [1.02, 1.0, 0.96],
      [0.82, 0.79, 0.73],
      6
    );
    const lowerBeak = shadeEnemySculpt(
      subdivideSmoothMesh(
        loftSectionsMesh([
          wyvernSection(0, 1.06, 0.86, 0.092, 0.054, 18, -0.06, 0.12),
          wyvernSection(0, 1.01, 1.18, 0.062, 0.04, 18, -0.1, 0.14),
          wyvernSection(0, 0.97, 1.48, 0.028, 0.024, 18, -0.12, 0.14),
          wyvernSection(0, 0.95, 1.64, 0.009, 0.01, 18, -0.08, 0.1)
        ], true, false),
        1,
        0.34
      ),
      [1.02, 1.0, 0.96],
      [0.82, 0.79, 0.73],
      6
    );
    out.push({ mesh: upperBeak, materialIndex: 3 }, { mesh: lowerBeak, materialIndex: 3 });

    // 3. Swept royal-crimson demon crest blade + barbed tail diamond spade (mat 2)
    const crestBlade = shadeEnemySculpt(
      subdivideSmoothMesh(
        loftSectionsMesh([
          wyvernSection(0, 1.23, 0.86, 0.046, 0.1, 18, 0, 0.22),
          wyvernSection(0, 1.46, 0.44, 0.034, 0.155, 18, -0.12, 0.26),
          wyvernSection(0, 1.66, -0.08, 0.018, 0.088, 18, -0.18, 0.24),
          wyvernSection(0, 1.71, -0.3, 0.006, 0.02, 18, -0.22, 0.16)
        ], true, false),
        1,
        0.32
      ),
      [1.04, 0.96, 0.94],
      [0.78, 0.7, 0.72],
      6.5
    );
    const tailSpade = shadeEnemySculpt(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ellipseSection(0, 0.71, -0.84, 0.026, 0.018, 18),
          ellipseSection(0, 0.7, -0.98, 0.135, 0.024, 18),
          ellipseSection(0, 0.69, -1.14, 0.072, 0.018, 18),
          ellipseSection(0, 0.68, -1.25, 0.008, 0.008, 18)
        ], true, false),
        1,
        0.3
      ),
      [1.04, 0.96, 0.94],
      [0.78, 0.7, 0.72],
      6
    );
    out.push({ mesh: crestBlade, materialIndex: 2 }, { mesh: tailSpade, materialIndex: 2 });

    // 4. 20-point cambered scalloped wyvern patagium wings + anatomical wing-arm spars + demon horns + talons
    const airfoilRib = (x: number, yBase: number, zLead: number, zTrail: number, thick: number, camber: number): V3[] => {
      const chord = zLead - zTrail;
      const pts: V3[] = [];
      const n = 20;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        const u = 0.5 - 0.5 * Math.cos(a);
        const z = zLead - u * chord;
        const camberLift = camber * Math.sin(u * Math.PI);
        const halfThick = thick * Math.pow(Math.max(0, Math.sin(u * Math.PI)), 0.7) * Math.sin(a);
        pts.push([x, yBase + camberLift + halfThick, z]);
      }
      return pts;
    };

    for (const side of [-1, 1] as const) {
      // Muscular wing-arm spar (`sculptAnatomicalLimbMesh`, 18 radial stations + smooth subdivision)
      const wingSpar = shadeEnemySculpt(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [side * 0.2, 0.87, 0.24], rx: 0.058, rz: 0.062 },
              { pos: [side * 0.58, 1.03, 0.19], rx: 0.048, rz: 0.052, zOffset: 0.01 },
              { pos: [side * 0.98, 1.08, 0.0], rx: 0.034, rz: 0.036 },
              { pos: [side * 1.29, 0.96, -0.34], rx: 0.016, rz: 0.018 }
            ],
            { ringPoints: 18, capEnds: true, muscleBiasZ: 0.008, peakT: 0.34 }
          ),
          1,
          0.36
        ),
        [1.02, 1.01, 0.98],
        [0.78, 0.81, 0.88],
        5.5
      );
      out.push({ mesh: wingSpar, materialIndex: 0 });

      // Twin swept crimson sky-demon brow horns (mat 2)
      const demonHorn = shadeEnemySculpt(
        subdivideSmoothMesh(
          loftSectionsMesh([
            ellipseSection(side * 0.11, 1.24, 0.84, 0.036, 0.034, 16, -0.2),
            ellipseSection(side * 0.19, 1.34, 0.68, 0.028, 0.028, 16, -0.35),
            ellipseSection(side * 0.26, 1.44, 0.48, 0.017, 0.018, 16, -0.45),
            ellipseSection(side * 0.3, 1.5, 0.34, 0.005, 0.006, 16, -0.5)
          ], true, false),
          1,
          0.3
        ),
        [1.04, 0.95, 0.94],
        [0.76, 0.68, 0.7],
        8
      );
      out.push({ mesh: demonHorn, materialIndex: 2 });

      // Scalloped bat/wyvern patagium wing membrane + inner finger struts
      const wingMembrane = shadeEnemySculpt(
        subdivideSmoothMesh(
          loftSectionsMesh([
            airfoilRib(side * 0.19, 0.84, 0.24, -0.5, 0.034, 0.058),
            airfoilRib(side * 0.48, 0.96, 0.21, -0.58, 0.03, 0.072),
            airfoilRib(side * 0.78, 1.05, 0.12, -0.52, 0.025, 0.066),
            airfoilRib(side * 1.05, 1.05, -0.03, -0.62, 0.019, 0.048),
            airfoilRib(side * 1.29, 0.95, -0.34, -0.54, 0.011, 0.02)
          ], true, false),
          1,
          0.34
        ),
        [1.03, 1.0, 0.94],
        [0.82, 0.77, 0.69],
        6
      );
      out.push({ mesh: wingMembrane, materialIndex: 1 });

      // Hooked ivory wing-thumb claws + jaw fangs (mat 3)
      const fangAndClawParts: RawMesh[] = [
        tubeSweepMesh([[side * 0.59, 1.04, 0.2, 0.024], [side * 0.64, 1.03, 0.3, 0.015], [side * 0.66, 0.99, 0.37, 0.004]], 12, false)
      ];
      for (let f = 0; f < 3; f += 1) {
        const fz = 1.04 + f * 0.18;
        const fx = side * (0.064 - f * 0.014);
        fangAndClawParts.push(
          tubeSweepMesh([[fx, 1.11, fz, 0.013], [fx * 0.94, 1.03, fz + 0.015, 0.003]], 10, false)
        );
      }

      // Muscular digitigrade hind leg (`sculptAnatomicalLimbMesh`) + 3 curved ivory talons
      const hindLeg = shadeEnemySculpt(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [side * 0.14, 0.7, -0.3], rx: 0.052, rz: 0.058 },
              { pos: [side * 0.18, 0.42, -0.44], rx: 0.038, rz: 0.044, zOffset: -0.008 },
              { pos: [side * 0.18, 0.15, -0.36], rx: 0.026, rz: 0.028 }
            ],
            { ringPoints: 18, capEnds: true, muscleBiasZ: -0.006, peakT: 0.36 }
          ),
          1,
          0.36
        ),
        [1.02, 1.01, 0.98],
        [0.78, 0.81, 0.88],
        5.5
      );
      out.push({ mesh: hindLeg, materialIndex: 0 });
      for (const toe of [-0.042, 0, 0.042]) {
        fangAndClawParts.push(
          tubeSweepMesh(
            [
              [side * 0.18 + toe, 0.15, -0.35, 0.018],
              [side * 0.18 + toe * 1.2, 0.1, -0.27, 0.012],
              [side * 0.18 + toe * 1.35, 0.062, -0.21, 0.0035]
            ],
            10,
            false
          )
        );
      }
      out.push({
        mesh: shadeEnemySculpt(mergeRawMeshes(fangAndClawParts), [1.02, 1.0, 0.96], [0.82, 0.79, 0.72], 7),
        materialIndex: 3
      });

      // Fierce slanted glowing amber eye (mat 4)
      out.push({
        mesh: transformMesh(smoothEllipsoid(0.04, 0.036, 0.054, 10, 16, 0), {
          pos: [side * 0.126, 1.19, 0.86],
          rot: [0.08, side * 0.24, -side * 0.22]
        }),
        materialIndex: 4
      });
    }
    return out;
  });

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
    { id: `ptera-body-${index}`, castShadow: false, receiveShadow: false, visible: false, coalesceColors: false }
  );
}

export function buildStormTyrantNode(): MultiMatNodeBuilder {
  // Fierce Horned Storm-Demon Behemoth: grounded feet at y = 0, crown height ~8.42m, facing +Z.
  // Preserves exact 5 material groups (0: tyrantEmeraldHide, 1: tyrantOchreBelly, 3: ivoryBone, 2: crimsonRoofGlaze, 4: creatureEyeEmissive).
  const slots = memoizeGeometry("cumulus:storm-tyrant-slots-v3", (): MultiMatSlot[] => {
    const out: MultiMatSlot[] = [];

    const drakeSection = (cx: number, cy: number, cz: number, rx: number, ry: number, segs = 22, pitch = 0, ridge = 0.1): V3[] => {
      const ring: V3[] = [];
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const armor = 1 + (sa > 0 ? ridge * Math.pow(Math.max(0, 1 - Math.abs(ca)), 1.5) : 0) + 0.032 * Math.cos(a * 4);
        const lx = ca * rx * armor;
        const ly = sa * ry * armor;
        ring.push([cx + lx, cy + ly * cp, cz + ly * sp]);
      }
      return ring;
    };

    // 1. 22-station massive armored torso, broad demon-drake shoulders & sweeping counterbalanced whip tail
    const spineSections: V3[][] = [
      drakeSection(0, 4.38, -5.65, 0.075, 0.085, 22, 0, 0.06),
      drakeSection(0, 4.22, -4.1, 0.46, 0.5, 22, 0, 0.1),
      drakeSection(0, 4.34, -2.25, 0.98, 1.08, 22, 0.02, 0.12),
      drakeSection(0, 4.66, -0.35, 1.52, 1.7, 22, 0.05, 0.14),
      drakeSection(0, 5.08, 1.35, 1.4, 1.6, 22, 0.18, 0.13),
      drakeSection(0, 5.98, 2.36, 1.0, 1.1, 22, 0.34, 0.11),
      drakeSection(0, 6.88, 2.86, 0.85, 0.9, 22, 0.2, 0.09)
    ];
    out.push({
      mesh: shadeEnemySculpt(subdivideSmoothMesh(loftSectionsMesh(spineSections, true, false), 1, 0.36), [1.02, 1.02, 0.96], [0.76, 0.82, 0.78], 2.4),
      materialIndex: 0
    });

    // 2. 20-station segmented ochre chest & throat plastron armor plates
    const bellySections: V3[][] = [
      drakeSection(0, 3.66, -1.55, 0.66, 0.42, 20, 0, 0.05),
      drakeSection(0, 3.54, 0.2, 1.08, 0.64, 20, 0.04, 0.08),
      drakeSection(0, 4.16, 1.72, 0.95, 0.6, 20, 0.25, 0.08),
      drakeSection(0, 5.38, 2.58, 0.6, 0.44, 20, 0.35, 0.06),
      drakeSection(0, 6.26, 2.88, 0.38, 0.28, 20, 0.3, 0.04)
    ];
    const rawBelly = subdivideSmoothMesh(loftSectionsMesh(bellySections, true, false), 1, 0.34);
    const ribbedBelly = deformMesh(rawBelly, ([x, y, z], [nx, ny, nz]) => {
      const plate = 0.035 * Math.max(0, -ny * 0.6 + 0.5) * Math.sin(z * 4.4);
      return [x + nx * plate, y + ny * plate, z + nz * plate];
    });
    out.push({
      mesh: shadeEnemySculpt(ribbedBelly, [1.02, 1.0, 0.94], [0.8, 0.78, 0.68], 3.8),
      materialIndex: 1
    });

    // 3. Fierce 20-station horned dragon-demon upper cranium & roaring lower jaw (+Z)
    const upperSkull = shadeEnemySculpt(
      subdivideSmoothMesh(
        loftSectionsMesh([
          drakeSection(0, 7.26, 2.54, 0.96, 0.9, 20, 0, 0.14),
          drakeSection(0, 7.38, 3.54, 0.82, 0.78, 20, -0.03, 0.16),
          drakeSection(0, 7.2, 4.54, 0.58, 0.56, 20, -0.06, 0.18),
          drakeSection(0, 6.96, 4.98, 0.34, 0.32, 20, -0.1, 0.14)
        ], true, false),
        1,
        0.34
      ),
      [1.02, 1.02, 0.96],
      [0.75, 0.81, 0.77],
      3.2
    );
    const lowerJaw = shadeEnemySculpt(
      subdivideSmoothMesh(
        loftSectionsMesh([
          drakeSection(0, 6.46, 2.64, 0.76, 0.44, 20, -0.08, 0.1),
          drakeSection(0, 6.1, 3.56, 0.6, 0.34, 20, -0.18, 0.12),
          drakeSection(0, 5.84, 4.48, 0.38, 0.24, 20, -0.18, 0.12),
          drakeSection(0, 5.76, 4.76, 0.2, 0.14, 20, -0.15, 0.08)
        ], true, false),
        1,
        0.34
      ),
      [1.01, 1.01, 0.95],
      [0.74, 0.8, 0.76],
      3.4
    );
    out.push({ mesh: upperSkull, materialIndex: 0 }, { mesh: lowerJaw, materialIndex: 0 });

    // 4. Muscular `sculptAnatomicalLimbMesh` digitigrade hind legs (grounded at y = 0), clawed forelimbs,
    //    sweeping crimson demon horns + shoulder spikes, upward ivory boar-tusks + interlocking fangs, & glowing eyes
    for (const side of [-1, 1] as const) {
      const hindLeg = clampMeshMinY(
        shadeEnemySculpt(
          subdivideSmoothMesh(
            sculptAnatomicalLimbMesh(
              [
                { pos: [side * 1.26, 4.5, -0.36], rx: 0.86, rz: 0.98 },
                { pos: [side * 1.44, 2.82, 0.2], rx: 0.64, rz: 0.74, zOffset: 0.06 },
                { pos: [side * 1.36, 1.38, -0.32], rx: 0.42, rz: 0.48, zOffset: -0.05 },
                { pos: [side * 1.36, 0.36, 0.24], rx: 0.36, rz: 0.42 },
                { pos: [side * 1.36, 0.06, 0.36], rx: 0.42, rz: 0.48 }
              ],
              { ringPoints: 20, capEnds: true, muscleBiasZ: 0.04, peakT: 0.32 }
            ),
            1,
            0.36
          ),
          [1.02, 1.02, 0.96],
          [0.75, 0.81, 0.77],
          2.6
        ),
        0
      );
      out.push({ mesh: hindLeg, materialIndex: 0 });

      const foreArm = shadeEnemySculpt(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [side * 1.06, 4.92, 1.9], rx: 0.32, rz: 0.36 },
              { pos: [side * 1.18, 4.24, 2.42], rx: 0.24, rz: 0.27, zOffset: 0.03 },
              { pos: [side * 0.98, 3.88, 2.78], rx: 0.16, rz: 0.18 }
            ],
            { ringPoints: 18, capEnds: true, muscleBiasZ: 0.02, peakT: 0.38 }
          ),
          1,
          0.36
        ),
        [1.02, 1.02, 0.96],
        [0.75, 0.81, 0.77],
        3.4
      );
      out.push({ mesh: foreArm, materialIndex: 0 });

      // Sweeping 18-station curved crimson demon horn + shoulder pauldron spike (mat 2)
      const browHorn = shadeEnemySculpt(
        subdivideSmoothMesh(
          loftSectionsMesh([
            ellipseSection(side * 0.6, 7.72, 3.44, 0.2, 0.16, 18, -0.18),
            ellipseSection(side * 0.76, 8.0, 3.12, 0.15, 0.18, 18, -0.34),
            ellipseSection(side * 0.9, 8.24, 2.76, 0.09, 0.11, 18, -0.46),
            ellipseSection(side * 0.98, 8.4, 2.5, 0.02, 0.026, 18, -0.52)
          ], true, false),
          1,
          0.32
        ),
        [1.04, 0.96, 0.94],
        [0.76, 0.68, 0.7],
        5
      );
      const shoulderSpike = shadeEnemySculpt(
        subdivideSmoothMesh(
          loftSectionsMesh([
            ellipseSection(side * 1.24, 5.42, 1.48, 0.22, 0.26, 16, 0.2),
            ellipseSection(side * 1.54, 5.74, 1.32, 0.13, 0.16, 16, 0.28),
            ellipseSection(side * 1.76, 5.98, 1.14, 0.025, 0.03, 16, 0.34)
          ], true, false),
          1,
          0.32
        ),
        [1.04, 0.96, 0.94],
        [0.76, 0.68, 0.7],
        5
      );
      out.push({ mesh: browHorn, materialIndex: 2 }, { mesh: shoulderSpike, materialIndex: 2 });

      // Fierce slanted glowing amber eye (mat 4)
      out.push({
        mesh: transformMesh(smoothEllipsoid(0.15, 0.13, 0.2, 10, 16, 0), {
          pos: [side * 0.78, 7.48, 3.42],
          rot: [0.06, side * 0.22, -side * 0.24]
        }),
        materialIndex: 4
      });

      // Ivory talons, foreclaws, upward-curved demon boar-tusks & interlocking sabre fangs (mat 3)
      const boneParts: RawMesh[] = [];
      for (const [tx, tz] of [[-0.34, 0.96], [0, 1.14], [0.34, 0.96]] as const) {
        boneParts.push(
          clampMeshMinY(
            tubeSweepMesh([
              [side * 1.36 + tx * 0.5, 0.24, 0.44, 0.19],
              [side * 1.36 + tx, 0.13, tz, 0.125],
              [side * 1.36 + tx * 1.16, 0.035, tz + 0.36, 0.022]
            ], 12, false),
            0
          )
        );
      }
      for (const cOff of [-0.08, 0.06] as const) {
        boneParts.push(
          tubeSweepMesh(
            [
              [side * 0.98 + cOff, 3.88, 2.78, 0.075],
              [side * 0.92 + cOff, 3.74, 2.94, 0.048],
              [side * 0.86 + cOff, 3.6, 3.06, 0.014]
            ],
            10,
            false
          )
        );
      }
      // Upward-sweeping lower demon tusk + oversized upper sabre canine
      boneParts.push(
        tubeSweepMesh(
          [
            [side * 0.42, 5.92, 4.42, 0.11],
            [side * 0.48, 6.26, 4.62, 0.078],
            [side * 0.46, 6.62, 4.68, 0.02]
          ],
          12,
          false
        ),
        tubeSweepMesh(
          [
            [side * 0.52, 6.96, 4.18, 0.105],
            [side * 0.52, 6.56, 4.25, 0.068],
            [side * 0.5, 6.26, 4.28, 0.016]
          ],
          12,
          false
        )
      );
      for (let t = 0; t < 5; t += 1) {
        const tz = 3.25 + t * 0.33;
        const xw = 0.59 - t * 0.055;
        boneParts.push(
          tubeSweepMesh([[side * xw, 6.84, tz, 0.078], [side * xw, 6.46, tz + 0.03, 0.012]], 10, false),
          tubeSweepMesh([[side * (xw * 0.86), 6.08, tz - 0.06, 0.066], [side * (xw * 0.86), 6.4, tz - 0.04, 0.012]], 10, false)
        );
      }
      out.push({
        mesh: shadeEnemySculpt(mergeRawMeshes(boneParts), [1.02, 1.0, 0.96], [0.82, 0.79, 0.72], 5),
        materialIndex: 3
      });
    }

    // 5. Curved swept 18-station crimson dorsal osteoderm spine blades from crown to tail
    const osteodermFin = shadeEnemySculpt(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ellipseSection(0, 0, 0.04, 0.082, 0.25, 18, Math.PI * 0.5),
          ellipseSection(0, 0.2, 0.01, 0.062, 0.21, 18, Math.PI * 0.5),
          ellipseSection(0, 0.4, -0.07, 0.034, 0.125, 18, Math.PI * 0.5),
          ellipseSection(0, 0.52, -0.16, 0.01, 0.035, 18, Math.PI * 0.5)
        ], true, false),
        1,
        0.34
      ),
      [1.04, 0.96, 0.94],
      [0.76, 0.68, 0.7],
      6
    );
    const dorsalPts: readonly [number, number, number, number][] = [
      [8.02, 2.85, 0.88, 0.15],
      [6.96, 2.45, 1.02, 0.3],
      [5.88, 1.55, 1.08, 0.12],
      [5.66, 0.15, 1.14, 0],
      [5.38, -1.25, 0.98, -0.08],
      [4.98, -2.65, 0.8, -0.1],
      [4.64, -3.95, 0.58, -0.05]
    ];
    for (const [py, pz, sc, pitch] of dorsalPts) {
      out.push({
        mesh: transformMesh(osteodermFin, { pos: [0, py, pz], rot: [pitch, 0, 0], scale: sc }),
        materialIndex: 2
      });
    }
    return out;
  });

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
    { id: "rex-body", castShadow: true, receiveShadow: false, visible: false, coalesceColors: false }
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
  backPolePos: [0, 0.165, -0.156] as V3,
  backPoleRot: [0, 0, -0.62] as V3,
  sashL: [0.052, 0.044, -0.118] as V3,
  sashR: [0.094, 0.038, -0.106] as V3,
  armL: [0.162, 0.258, -0.002] as V3,
  armR: [-0.162, 0.258, -0.002] as V3,
  forearmL: [0, -0.186, 0.004] as V3,
  forearmR: [0, -0.186, 0.004] as V3,
  thighL: [0.104, -0.04, 0] as V3,
  thighR: [-0.104, -0.04, 0] as V3,
  shinL: [0, -0.3, 0] as V3,
  shinR: [0, -0.3, 0] as V3,
  bootL: [0, -0.16, 0] as V3,
  bootR: [0, -0.16, 0] as V3
} as const;

function tintTunicCloth(src: RawMesh): RawMesh {
  return paintAndBakeHeroAO(src, (x, y, z, _nx, ny, nz) => {
    const sunCrest = Math.max(0, ny * 0.62 + nz * 0.22);
    const drapeHarmonic = 0.036 * Math.sin(x * 28 + y * 19 + z * 14);
    const foldWarmth = Math.min(1, 0.91 + 0.08 * sunCrest + drapeHarmonic);
    return [foldWarmth * 0.96, Math.min(1, foldWarmth * 1.02), Math.min(1, foldWarmth * 1.01), 1];
  });
}

function tintIndigoCloth(src: RawMesh): RawMesh {
  return paintAndBakeHeroAO(src, (x, y, z, _nx, ny, nz) => {
    const skyCrest = Math.max(0, ny * 0.58 - nz * 0.24);
    const weaveHarmonic = 0.032 * Math.cos(x * 26 - y * 22 + z * 16);
    const lift = Math.min(1, 0.91 + 0.08 * skyCrest + weaveHarmonic);
    return [lift * 0.96, lift * 0.985, Math.min(1, lift * 1.03), 1];
  });
}

function tintCreamWrap(src: RawMesh): RawMesh {
  return paintAndBakeHeroAO(src, (x, y, z, _nx, ny, nz) => {
    const sunLift = Math.max(0, ny * 0.55 + nz * 0.2);
    const coilCrease = 0.034 * Math.sin(y * 64 + x * 12 + z * 12);
    const lift = Math.min(1, 0.92 + 0.07 * sunLift + coilCrease);
    return [lift, lift * 0.99, lift * 0.965, 1];
  });
}

function tintObsidianHair(src: RawMesh): RawMesh {
  return paintAndBakeHeroAO(src, (x, y, _z, _nx, ny, nz) => {
    const crownHalo = Math.max(0, ny * 0.56 - nz * 0.28 + (y - 0.14) * 0.85);
    const strand = 0.026 * Math.cos(x * 36 + y * 24);
    const lift = Math.min(1, 0.88 + crownHalo * 0.11 + strand);
    return [lift * 0.91, lift * 0.94, Math.min(1, lift * 1.04), 1];
  });
}

function tintWarmSkin(src: RawMesh, cheekRosiness = false): RawMesh {
  return paintAndBakeHeroAO(src, (x, y, z, _nx, ny, _nz) => {
    const sunLift = 0.945 + 0.055 * Math.max(0, ny);
    if (!cheekRosiness) return [sunLift, sunLift * 0.985, sunLift * 0.968, 1];
    const cheekDist = Math.min(
      Math.hypot(Math.abs(x) - 0.068, y - 0.095, z - 0.108),
      Math.hypot(x, y - 0.112, z - 0.138) * 1.15
    );
    const blush = Math.max(0, 1 - cheekDist / 0.058) * 0.09;
    return [Math.min(1, sunLift + blush * 0.5), sunLift - blush * 0.55, sunLift - blush * 0.65, 1];
  });
}

/** Sweeps an oriented flattened ribbon cross-section along a 3D spline with optional central cloth pleat. */
function sweptClothRibbonMesh(
  pts: readonly V3[],
  widthFn: (t: number) => number,
  thickFn: (t: number) => number,
  rollFn: (t: number) => number = () => 0,
  pleatAmp = 0,
  segs = 12,
  capEnds = true
): RawMesh {
  const rings: V3[][] = [];
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

    const t = i / Math.max(1, pts.length - 1);
    const roll = rollFn(t);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const ux = nx * cr + bx * sr;
    const uy = ny * cr + by * sr;
    const uz = nz * cr + bz * sr;
    const vx = -nx * sr + bx * cr;
    const vy = -ny * sr + by * cr;
    const vz = -nz * sr + bz * cr;

    const w = widthFn(t);
    const th = thickFn(t);
    const ring: V3[] = [];
    for (let s = 0; s < segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const camber = pleatAmp * Math.cos(ca * Math.PI);
      const ox = ca * w;
      const oy = sa * th + camber;
      ring.push([
        p[0] + ux * ox + vx * oy,
        p[1] + uy * ox + vy * oy,
        p[2] + uz * ox + vz * oy
      ]);
    }
    rings.push(ring);
  }
  return weldSmoothNormals(taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(rings, capEnds, false), 1, 0.36), 3));
}

function sculptedHairTuftMesh(ctrl: readonly V3[], baseRx: number, baseRy: number, roll = 0): RawMesh {
  // Voluminous, soft, curved anime hair lock sculpted via `sculptCurvedHairLockMesh` + Taubin fairing (zero sea-urchin cones!)
  const root = ctrl[0]!;
  const tip = ctrl[ctrl.length - 1]!;
  const midRaw: V3 =
    ctrl.length >= 4
      ? [
          (ctrl[1]![0] + ctrl[2]![0]) * 0.5,
          (ctrl[1]![1] + ctrl[2]![1]) * 0.5,
          (ctrl[1]![2] + ctrl[2]![2]) * 0.5
        ]
      : ctrl[Math.floor(ctrl.length * 0.5)]!;
  const mid: V3 = [
    midRaw[0] + Math.sin(roll) * 0.01,
    midRaw[1] + Math.cos(roll) * 0.004,
    midRaw[2]
  ];
  const lock = sculptCurvedHairLockMesh({
    root,
    mid,
    tip,
    width: baseRx * 1.95,
    thickness: baseRy * 2.05,
    segments: 12,
    radialSegments: 12
  });
  return tintObsidianHair(weldSmoothNormals(taubinSmoothMesh(lock, 3)));
}

function buildHeroPelvisSlots(): MultiMatSlot[] {
  return memoizeGeometry("cumulus:hero-pelvis-slots-v3", (): MultiMatSlot[] => {
    const slots: MultiMatSlot[] = [];
    // 1. Solid rounded inner jade-teal pelvic breech so hip sockets are 100% gap-free at every jump/surf pose
    slots.push({
      mesh: tintTunicCloth(
        transformMesh(smoothEllipsoid(0.126, 0.094, 0.106, 12, 20, 0), { pos: [0, -0.038, 0] })
      ),
      materialIndex: 0
    });

    // 2. Smoothly draped pleated martial tunic peplum (`sculptDrapedGarmentMesh`, replaces conical skirt)
    const segs = 24;
    const drapedPeplum = sculptDrapedGarmentMesh(
      [
        { y: -0.138, rx: 0.184, rz: 0.155, folds: 8, foldAmp: 0.042 },
        { y: -0.105, rx: 0.18, rz: 0.151, folds: 8, foldAmp: 0.046 },
        { y: -0.062, rx: 0.17, rz: 0.142, folds: 8, foldAmp: 0.04 },
        { y: -0.014, rx: 0.152, rz: 0.126, folds: 8, foldAmp: 0.028 },
        { y: 0.03, rx: 0.136, rz: 0.114, folds: 6, foldAmp: 0.014 },
        { y: 0.068, rx: 0.124, rz: 0.104, folds: 0, foldAmp: 0 }
      ],
      { ringPoints: segs, capEnds: true, smoothPasses: 4 }
    );
    slots.push({
      mesh: tintTunicCloth(weldSmoothNormals(drapedPeplum)),
      materialIndex: 0
    });

    // 3. Contoured 3D royal-indigo hem border + fine amber-gold thread trim following the draped apron curve
    const hemSpine: V4[] = [];
    const goldTrimSpine: V4[] = [];
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const fold = 1 + 0.036 * Math.sin(a * 8 - 0.138 * 2.2);
      const hx = ca * 0.183 * fold;
      const hz = sa * 0.154 * fold;
      const hy = -0.136;
      hemSpine.push([hx, hy, hz, 0.0115]);
      goldTrimSpine.push([hx * 0.992, hy + 0.015, hz * 0.992, 0.0042]);
    }
    slots.push({ mesh: tintIndigoCloth(weldSmoothNormals(taubinSmoothMesh(tubeSweepMesh(hemSpine, 10, false), 2))), materialIndex: 1 });
    slots.push({ mesh: weldSmoothNormals(taubinSmoothMesh(tubeSweepMesh(goldTrimSpine, 8, false), 2)), materialIndex: 2 });

    // 4. Double-wrapped twisted indigo cloth obi sash + 3-part sculpted martial bow-knot on rear-right hip
    const obiMesh = sculptDrapedGarmentMesh(
      [
        { y: 0.01, rx: 0.142, rz: 0.121, folds: 5, foldAmp: 0.022 },
        { y: 0.032, rx: 0.153, rz: 0.13, folds: 5, foldAmp: 0.026 },
        { y: 0.056, rx: 0.156, rz: 0.133, folds: 5, foldAmp: 0.026 },
        { y: 0.08, rx: 0.153, rz: 0.13, folds: 5, foldAmp: 0.022 },
        { y: 0.096, rx: 0.142, rz: 0.121, folds: 4, foldAmp: 0.015 }
      ],
      { ringPoints: 22, capEnds: true, smoothPasses: 4 }
    );
    slots.push({
      mesh: tintIndigoCloth(weldSmoothNormals(obiMesh)),
      materialIndex: 1
    });

    // Central cinched knot pillow + twin puffed martial bow loops
    const knotCore = transformMesh(
      weldSmoothNormals(taubinSmoothMesh(subdivideSmoothMesh(icosphereSmoothMesh(0.038, 1, 0.025, 19, 0), 1, 0.5), 3)),
      { pos: [0.068, 0.048, -0.118], scale: [1.08, 0.95, 0.88] }
    );
    const bowLoopL = sweptClothRibbonMesh(
      catmullRomSpline3([[0.064, 0.05, -0.118], [0.02, 0.072, -0.142], [0.004, 0.048, -0.138], [0.052, 0.044, -0.118]], 2, false),
      (t) => 0.014 + 0.016 * Math.sin(t * Math.PI),
      () => 0.008,
      (t) => 0.35 - t * 0.5,
      0.003,
      10,
      true
    );
    const bowLoopR = sweptClothRibbonMesh(
      catmullRomSpline3([[0.074, 0.048, -0.116], [0.122, 0.066, -0.132], [0.132, 0.038, -0.124], [0.082, 0.04, -0.114]], 2, false),
      (t) => 0.014 + 0.016 * Math.sin(t * Math.PI),
      () => 0.008,
      (t) => -0.35 + t * 0.5,
      0.003,
      10,
      true
    );
    slots.push({ mesh: tintIndigoCloth(mergeRawMeshes([knotCore, bowLoopL, bowLoopR])), materialIndex: 1 });
    return slots;
  });
}

function buildHeroSashTailSlots(side: -1 | 1): MultiMatSlot[] {
  return memoizeGeometry(`cumulus:hero-sash-slots-v3:${side}`, (): MultiMatSlot[] => {
    const spread = side === -1 ? -0.042 : 0.058;
    const lenScale = side === -1 ? 0.94 : 1.06;
    const ribbon = tintIndigoCloth(
      weldSmoothNormals(
        taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [0, 0, 0],
            mid: [spread * 0.82, -0.112 * lenScale, -0.145 * lenScale],
            tip: [spread * 1.32, -0.258 * lenScale, -0.262 * lenScale],
            width: 0.076,
            thickness: 0.022,
            segments: 12,
            radialSegments: 12
          }),
          3
        )
      )
    );
    const pts = catmullRomSpline3([
      [spread * 0.96, -0.162 * lenScale, -0.188 * lenScale],
      [spread * 1.18, -0.215 * lenScale, -0.232 * lenScale],
      [spread * 1.28, -0.246 * lenScale, -0.254 * lenScale]
    ], 3, false);
    const goldBand = sweptClothRibbonMesh(
      pts,
      (t) => 0.034 * (1 - t * 0.28),
      () => 0.0088,
      () => side * 0.44,
      0.003,
      10,
      true
    );
    return [
      { mesh: ribbon, materialIndex: 0 },
      { mesh: goldBand, materialIndex: 1 }
    ];
  });
}

function buildHeroTorsoSlots(): MultiMatSlot[] {
  return memoizeGeometry("cumulus:hero-torso-slots-v3", (): MultiMatSlot[] => {
    const slots: MultiMatSlot[] = [];
    // 1. Smoothly draped jade-teal crossover martial-arts gi tunic (`sculptDrapedGarmentMesh`, 24 radial points + Taubin fairing)
    //    extending cleanly across x = +/-0.194 so the upper-arm sleeves overlap seamlessly with zero exposed shoulder balls!
    const drapedTorso = sculptDrapedGarmentMesh(
      [
        { y: -0.028, rx: 0.126, rz: 0.104, folds: 0, foldAmp: 0 },
        { y: 0.008, rx: 0.148, rz: 0.12, z: 0.002, folds: 6, foldAmp: 0.032 },
        { y: 0.042, rx: 0.164, rz: 0.13, z: 0.005, folds: 6, foldAmp: 0.042 },
        { y: 0.088, rx: 0.166, rz: 0.128, z: 0.006, folds: 6, foldAmp: 0.026 },
        { y: 0.142, rx: 0.178, rz: 0.134, z: 0.008, folds: 5, foldAmp: 0.014 },
        { y: 0.198, rx: 0.192, rz: 0.136, z: 0.007, folds: 4, foldAmp: 0.008 },
        { y: 0.246, rx: 0.198, rz: 0.132, z: 0.003, folds: 0, foldAmp: 0 },
        { y: 0.278, rx: 0.18, rz: 0.118, z: 0.001, folds: 0, foldAmp: 0 },
        { y: 0.304, rx: 0.132, rz: 0.098, z: 0.002, folds: 0, foldAmp: 0 },
        { y: 0.326, rx: 0.086, rz: 0.078, z: 0.004, folds: 0, foldAmp: 0 }
      ],
      { ringPoints: 24, capEnds: true, smoothPasses: 4 }
    );
    slots.push({
      mesh: tintTunicCloth(weldSmoothNormals(drapedTorso)),
      materialIndex: 0
    });

    // 2. Crisp martial-arts crossover collar lapel: left-over-right diagonal overlap from shoulder to right obi waist
    const leftOverLapelPts = catmullRomSpline3([
      [-0.082, 0.028, 0.126],
      [-0.032, 0.118, 0.142],
      [0.038, 0.212, 0.138],
      [0.098, 0.298, 0.068],
      [0.094, 0.334, -0.024],
      [0, 0.342, -0.094],
      [-0.094, 0.334, -0.024],
      [-0.098, 0.298, 0.068],
      [-0.056, 0.205, 0.134],
      [0.018, 0.105, 0.134]
    ], 2, false);
    slots.push({
      mesh: tintTunicCloth(
        sweptClothRibbonMesh(
          leftOverLapelPts,
          (t) => 0.022 + 0.008 * Math.sin(t * Math.PI),
          () => 0.012,
          (t) => (t - 0.5) * 0.85,
          0.0035,
          12,
          true
        )
      ),
      materialIndex: 0
    });

    // 3. Royal-indigo undershirt V-neck insert, inner crossover lapel piping & kimono shoulder-seam piping rings
    const indigoLapelEdgePts = catmullRomSpline3([
      [-0.068, 0.06, 0.128],
      [-0.014, 0.15, 0.141],
      [0.052, 0.242, 0.126],
      [0.088, 0.312, 0.056],
      [0, 0.344, -0.086],
      [-0.088, 0.312, 0.056],
      [-0.044, 0.228, 0.128]
    ], 2, false);
    const shoulderPipingParts: RawMesh[] = [
      transformMesh(smoothEllipsoid(0.074, 0.098, 0.054, 12, 18, 0), { pos: [0, 0.252, 0.092] }),
      weldSmoothNormals(latheMesh([[0.062, 0.288], [0.085, 0.296], [0.082, 0.344], [0.06, 0.348]], 22, false)),
      sweptClothRibbonMesh(indigoLapelEdgePts, () => 0.009, () => 0.006, () => 0, 0.001, 10, true)
    ];
    for (const side of [-1, 1] as const) {
      const seamRing: V4[] = [];
      for (let i = 0; i <= 20; i += 1) {
        const a = (i / 20) * Math.PI * 2;
        seamRing.push([
          side * (0.168 + 0.012 * Math.sin(a)),
          0.258 + 0.054 * Math.sin(a),
          -0.002 + 0.064 * Math.cos(a),
          0.0072
        ]);
      }
      shoulderPipingParts.push(weldSmoothNormals(tubeSweepMesh(seamRing, 10, false)));
    }
    slots.push({
      mesh: tintIndigoCloth(mergeRawMeshes(shoulderPipingParts)),
      materialIndex: 1
    });

    // 4. Sculpted warm-skin anatomical neck (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`)
    const neckMesh = weldSmoothNormals(
      taubinSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, 0.298, 0], rx: 0.06, rz: 0.062 },
            { pos: [0, 0.342, 0.002], rx: 0.053, rz: 0.054 },
            { pos: [0, 0.398, 0.004], rx: 0.052, rz: 0.053 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: -0.003, peakT: 0.45 }
        ),
        3
      )
    );
    slots.push({
      mesh: tintWarmSkin(neckMesh),
      materialIndex: 2
    });

    // 5. Flattened body-hugging leather baldric strap + rear Sky-Staff scabbard sleeve + turned brass hardware
    const strapLoop = catmullRomSpline3([
      [-0.136, 0.308, 0.064],
      [-0.054, 0.234, 0.14],
      [0.038, 0.138, 0.144],
      [0.156, 0.046, 0.056],
      [0.152, 0.056, -0.1],
      [0.012, 0.166, -0.144],
      [-0.126, 0.298, -0.078],
      [-0.136, 0.308, 0.064]
    ], 2, false);
    slots.push({
      mesh: sweptClothRibbonMesh(strapLoop, () => 0.0175, () => 0.0072, (t) => Math.sin(t * Math.PI * 2) * 0.45, 0.0015, 12, false),
      materialIndex: 3
    });

    const holsterSleeve: V2[] = [
      [0.025, -0.108],
      [0.035, -0.102],
      [0.036, 0],
      [0.035, 0.102],
      [0.025, 0.108]
    ];
    slots.push({
      mesh: transformMesh(weldSmoothNormals(taubinSmoothMesh(latheMesh(holsterSleeve, 20, false), 2)), {
        pos: [0, 0.165, -0.156],
        rot: [0, 0, -0.62]
      }),
      materialIndex: 3
    });

    const buckleBezel: V2[] = [
      [0, -0.009],
      [0.033, -0.009],
      [0.036, 0],
      [0.033, 0.01],
      [0.017, 0.013],
      [0, 0.015]
    ];
    const keeperRing: V2[] = [
      [0.032, -0.009],
      [0.04, -0.006],
      [0.04, 0.006],
      [0.032, 0.009]
    ];
    slots.push({
      mesh: mergeRawMeshes([
        transformMesh(weldSmoothNormals(latheMesh(buckleBezel, 20, false)), {
          pos: [0.002, 0.178, 0.148],
          rot: [Math.PI * 0.46, 0, -0.58]
        }),
        transformMesh(weldSmoothNormals(latheMesh(keeperRing, 18, false)), {
          pos: [0.049, 0.233, -0.156],
          rot: [0, 0, -0.62]
        }),
        transformMesh(weldSmoothNormals(latheMesh(keeperRing, 18, false)), {
          pos: [-0.049, 0.097, -0.156],
          rot: [0, 0, -0.62]
        })
      ]),
      materialIndex: 4
    });
    return slots;
  });
}

function buildHeroBackPoleSlots(): MultiMatSlot[] {
  return memoizeGeometry("cumulus:hero-backpole-slots-v2", (): MultiMatSlot[] => {
    // Vermilion lacquer Sky Staff with 22-seg Bezier-domed lotus brass ferrules, cloud-collar bronze rings, ribbed indigo silk grip & golden cord tassel
    const shaftProfile: V2[] = [
      [0, -0.425],
      [0.024, -0.425],
      [0.026, 0],
      [0.024, 0.425],
      [0, 0.425]
    ];
    const capBot: V2[] = bezierCurve2([0, -0.51], [0.031, -0.506], [0.032, -0.44], [0.024, -0.415], 12);
    const capTop: V2[] = bezierCurve2([0.024, 0.415], [0.032, 0.44], [0.031, 0.506], [0, 0.51], 12);
    const ringBand: V2[] = [
      [0.023, -0.013],
      [0.0325, -0.008],
      [0.034, 0],
      [0.0325, 0.008],
      [0.023, 0.013]
    ];
    const gripProfile: V2[] = [];
    for (let i = 0; i <= 22; i += 1) {
      const t = i / 22;
      const y = -0.115 + t * 0.23;
      const rib = 0.0268 + 0.0024 * Math.sin(t * Math.PI * 12);
      gripProfile.push([i === 0 || i === 22 ? 0.024 : rib, y]);
    }
    const cordTassel = mergeRawMeshes([
      transformMesh(weldSmoothNormals(latheMesh([[0.024, 0.372], [0.033, 0.376], [0.033, 0.388], [0.024, 0.392]], 18, false)), {}),
      weldSmoothNormals(tubeSweepMesh([[0.028, 0.38, -0.012, 0.0065], [0.054, 0.334, -0.034, 0.0085], [0.07, 0.29, -0.044, 0.0032]], 10, false))
    ]);
    return [
      { mesh: weldSmoothNormals(latheMesh(shaftProfile, 22, false)), materialIndex: 0 },
      { mesh: weldSmoothNormals(latheMesh([...capBot, [0, -0.415]], 22, false)), materialIndex: 1 },
      { mesh: weldSmoothNormals(latheMesh([[0, 0.415], ...capTop], 22, false)), materialIndex: 1 },
      { mesh: transformMesh(weldSmoothNormals(latheMesh(ringBand, 20, false)), { pos: [0, -0.41, 0] }), materialIndex: 2 },
      { mesh: transformMesh(weldSmoothNormals(latheMesh(ringBand, 20, false)), { pos: [0, 0.41, 0] }), materialIndex: 2 },
      { mesh: tintIndigoCloth(weldSmoothNormals(latheMesh(gripProfile, 20, false))), materialIndex: 3 },
      { mesh: cordTassel, materialIndex: 4 }
    ];
  });
}

function buildHeroHeadSlots(): MultiMatSlot[] {
  return memoizeGeometry("cumulus:hero-head-slots-v3", (): MultiMatSlot[] => {
    const slots: MultiMatSlot[] = [];
    // 1. Youthful anime cranium sculpted via `sculptStylizedHeadMesh` (`subdivisions: 2`) + `taubinSmoothMesh` fairing
    const stylizedHead = transformMesh(
      taubinSmoothMesh(
        deformMesh(
          sculptStylizedHeadMesh(0.136, {
            jawTaper: 0.78,
            cheekFullness: 0.22,
            noseBridge: 0.08,
            browRidge: 0.06,
            subdivisions: 2,
            seed: 17
          }),
          ([x, y, z]) => {
            const lowerFace = y < 0 ? 1 - 0.06 * Math.min(1, -y * 6) : 1;
            return [x * lowerFace, y * 0.98, z * 1.02];
          }
        ),
        3
      ),
      { pos: [0, 0.142, 0.004] }
    );
    slots.push({
      mesh: tintWarmSkin(weldSmoothNormals(stylizedHead), true),
      materialIndex: 0
    });

    for (const side of [-1, 1] as const) {
      // Contoured C-helix outer ear + rosy inner concha hollow
      const earHelix = weldSmoothNormals(
        tubeSweepMesh([
          [side * 0.128, 0.102, 0.006, 0.011],
          [side * 0.146, 0.12, -0.006, 0.013],
          [side * 0.148, 0.148, -0.008, 0.012],
          [side * 0.132, 0.158, 0.006, 0.009]
        ], 10, false)
      );
      const earCup = transformMesh(smoothEllipsoid(0.022, 0.038, 0.025, 10, 16, 0), {
        pos: [side * 0.133, 0.128, -0.002],
        rot: [0, -side * 0.22, side * 0.12]
      });
      slots.push({ mesh: tintWarmSkin(mergeRawMeshes([earCup, earHelix])), materialIndex: 0 });
      slots.push({
        mesh: transformMesh(smoothEllipsoid(0.012, 0.024, 0.014, 8, 14, 0), {
          pos: [side * 0.141, 0.128, 0.004],
          rot: [0, -side * 0.22, side * 0.12]
        }),
        materialIndex: 1
      });

      // Subtle warm rosy cheek blush oval
      slots.push({
        mesh: transformMesh(smoothEllipsoid(0.022, 0.012, 0.008, 8, 14, 0), {
          pos: [side * 0.074, 0.102, 0.126],
          rot: [0.08, side * 0.42, 0]
        }),
        materialIndex: 1
      });

      // Expressive large anime eyes: sclera + deep glossy iris + dual crisp catchlights + winged upper lash + determined brow
      slots.push({
        mesh: transformMesh(smoothEllipsoid(0.031, 0.038, 0.017, 10, 16, 0), {
          pos: [side * 0.05, 0.136, 0.13],
          rot: [0, side * 0.18, 0]
        }),
        materialIndex: 3
      });
      slots.push({
        mesh: transformMesh(smoothEllipsoid(0.022, 0.031, 0.015, 10, 16, 0), {
          pos: [side * 0.049, 0.135, 0.139],
          rot: [0, side * 0.18, 0]
        }),
        materialIndex: 4
      });
      slots.push({
        mesh: transformMesh(icosphereSmoothMesh(0.0086, 1, 0, 7, 0), { pos: [side * 0.056, 0.148, 0.15] }),
        materialIndex: 5
      });
      slots.push({
        mesh: transformMesh(icosphereSmoothMesh(0.0048, 1, 0, 11, 0), { pos: [side * 0.042, 0.124, 0.149] }),
        materialIndex: 5
      });
      // Winged upper eyelash arc + expressive tapered martial eyebrow
      slots.push({
        mesh: tintObsidianHair(
          weldSmoothNormals(
            tubeSweepMesh([
              [side * 0.023, 0.153, 0.141, 0.0042],
              [side * 0.051, 0.168, 0.141, 0.0068],
              [side * 0.08, 0.152, 0.128, 0.0052],
              [side * 0.086, 0.156, 0.123, 0.0022]
            ], 10, false)
          )
        ),
        materialIndex: 2
      });
      slots.push({
        mesh: tintObsidianHair(
          weldSmoothNormals(
            tubeSweepMesh([
              [side * 0.02, 0.176, 0.143, 0.0076],
              [side * 0.052, 0.191, 0.138, 0.0092],
              [side * 0.085, 0.182, 0.122, 0.0044]
            ], 10, false)
          )
        ),
        materialIndex: 2
      });
    }

    // Sculpted upturned anime nose & confident martial smile
    slots.push({
      mesh: tintWarmSkin(transformMesh(smoothEllipsoid(0.015, 0.018, 0.024, 10, 14, 0), { pos: [0, 0.116, 0.148] }), true),
      materialIndex: 0
    });
    slots.push({
      mesh: weldSmoothNormals(
        tubeSweepMesh([
          [-0.027, 0.08, 0.138, 0.0044],
          [0, 0.072, 0.145, 0.0058],
          [0.027, 0.08, 0.138, 0.0044]
        ], 10, false)
      ),
      materialIndex: 1
    });

    // 2. High-density 22-station x 8-ring sculpted anime hair crown & occiput hood:
    //    Arches cleanly above the forehead (+Z) while wrapping 100% of crown, temples, occiput (-Z) & nape (zero bald gaps, zero bumpy spheres!)
    const hoodSegs = 22;
    const hoodStations: readonly { y: number; cz: number; rx: number; rz: number; frontLift: number; rib: number }[] = [
      { y: 0.056, cz: -0.058, rx: 0.098, rz: 0.078, frontLift: 0.165, rib: 0.015 },
      { y: 0.088, cz: -0.044, rx: 0.128, rz: 0.108, frontLift: 0.14, rib: 0.024 },
      { y: 0.128, cz: -0.026, rx: 0.148, rz: 0.136, frontLift: 0.105, rib: 0.028 },
      { y: 0.168, cz: -0.012, rx: 0.156, rz: 0.154, frontLift: 0.068, rib: 0.03 },
      { y: 0.206, cz: -0.006, rx: 0.154, rz: 0.156, frontLift: 0.032, rib: 0.028 },
      { y: 0.242, cz: -0.006, rx: 0.138, rz: 0.142, frontLift: 0.01, rib: 0.022 },
      { y: 0.272, cz: -0.008, rx: 0.1, rz: 0.106, frontLift: 0, rib: 0.014 },
      { y: 0.292, cz: -0.01, rx: 0.038, rz: 0.042, frontLift: 0, rib: 0 }
    ];
    const hoodRings: V3[][] = hoodStations.map((st) => {
      const ring: V3[] = [];
      for (let i = 0; i < hoodSegs; i += 1) {
        const a = (i / hoodSegs) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a); // +1 = forehead (+Z), -1 = occiput (-Z)
        const hairlineLift = sa > -0.1 ? st.frontLift * Math.pow((sa + 0.1) / 1.1, 1.55) : 0;
        const strandRib = 1 + st.rib * Math.cos(a * 11) + st.rib * 0.45 * Math.sin(a * 5);
        const occiputDepth = sa < 0 ? 1 + 0.08 * (-sa) : 0.94;
        ring.push([
          ca * st.rx * strandRib,
          st.y + hairlineLift,
          st.cz + sa * st.rz * strandRib * occiputDepth
        ]);
      }
      return ring;
    });
    slots.push({
      mesh: tintObsidianHair(
        weldSmoothNormals(taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(hoodRings, true, false), 1, 0.36), 4))
      ),
      materialIndex: 2
    });

    // 3. 24 razor-crisp, sharp-keeled, multi-tier swept anime hair blades (glossy ebony / deep midnight-indigo; zero sausages!)
    //    World crown height ~1.54m (strictly inside [1.48, 1.58]), lateral hair span ~0.47m (hero spanX ~0.59m inside [0.45, 0.64]).
    const hairTufts: readonly { ctrl: readonly V3[]; rx: number; ry: number; roll?: number }[] = [
      // Tier 1: Right wind-swept silhouette blades (+X, broad swept anime wings)
      { ctrl: [[0.088, 0.128, -0.01], [0.148, 0.114, -0.038], [0.194, 0.118, -0.076], [0.226, 0.132, -0.116]], rx: 0.056, ry: 0.032, roll: 0.28 },
      { ctrl: [[0.096, 0.168, -0.008], [0.164, 0.186, -0.04], [0.21, 0.216, -0.082], [0.236, 0.252, -0.124]], rx: 0.064, ry: 0.036, roll: 0.18 },
      { ctrl: [[0.082, 0.212, -0.008], [0.144, 0.262, -0.04], [0.186, 0.308, -0.082], [0.212, 0.344, -0.122]], rx: 0.06, ry: 0.034, roll: 0.1 },
      { ctrl: [[0.036, 0.246, -0.01], [0.082, 0.308, -0.046], [0.118, 0.35, -0.092], [0.142, 0.374, -0.138]], rx: 0.056, ry: 0.032, roll: 0.05 },
      // Tier 1B: Left counter-swept asymmetric silhouette blades (-X)
      { ctrl: [[-0.088, 0.132, -0.01], [-0.144, 0.12, -0.038], [-0.186, 0.128, -0.074], [-0.214, 0.144, -0.112]], rx: 0.054, ry: 0.03, roll: -0.26 },
      { ctrl: [[-0.096, 0.176, -0.008], [-0.158, 0.198, -0.04], [-0.198, 0.232, -0.08], [-0.224, 0.266, -0.12]], rx: 0.062, ry: 0.035, roll: -0.17 },
      { ctrl: [[-0.072, 0.22, -0.006], [-0.126, 0.272, -0.04], [-0.164, 0.314, -0.082], [-0.188, 0.346, -0.122]], rx: 0.058, ry: 0.033, roll: -0.09 },
      { ctrl: [[-0.028, 0.248, -0.01], [-0.064, 0.31, -0.048], [-0.092, 0.35, -0.094], [-0.11, 0.37, -0.14]], rx: 0.054, ry: 0.031, roll: -0.04 },
      // Tier 2: Sweeping Heroic Crown Spikes (peaks at local y ~ 0.38 -> world y ~ 1.54m)
      { ctrl: [[0.006, 0.258, 0.006], [0.014, 0.322, -0.044], [0.02, 0.36, -0.102], [0.026, 0.382, -0.162]], rx: 0.062, ry: 0.036, roll: 0.03 },
      { ctrl: [[-0.018, 0.254, -0.024], [-0.036, 0.314, -0.078], [-0.048, 0.352, -0.136], [-0.056, 0.372, -0.192]], rx: 0.056, ry: 0.033, roll: -0.08 },
      // Tier 3: Primary -Z Chase-Camera Multi-Layered Occiput Blades (100% rear silhouette richness)
      { ctrl: [[0.054, 0.222, -0.064], [0.09, 0.258, -0.128], [0.118, 0.286, -0.188], [0.136, 0.304, -0.238]], rx: 0.06, ry: 0.035, roll: 0.16 },
      { ctrl: [[-0.054, 0.218, -0.064], [-0.09, 0.252, -0.128], [-0.118, 0.278, -0.186], [-0.136, 0.294, -0.234]], rx: 0.058, ry: 0.034, roll: -0.16 },
      { ctrl: [[0.02, 0.208, -0.084], [0.032, 0.232, -0.152], [0.04, 0.248, -0.212], [0.046, 0.256, -0.262]], rx: 0.062, ry: 0.036, roll: 0.06 },
      { ctrl: [[-0.022, 0.198, -0.086], [-0.038, 0.218, -0.152], [-0.05, 0.23, -0.208], [-0.058, 0.236, -0.254]], rx: 0.058, ry: 0.034, roll: -0.06 },
      { ctrl: [[0.068, 0.172, -0.078], [0.112, 0.178, -0.138], [0.144, 0.186, -0.192], [0.166, 0.196, -0.234]], rx: 0.054, ry: 0.032, roll: 0.22 },
      { ctrl: [[-0.068, 0.17, -0.078], [-0.11, 0.174, -0.136], [-0.142, 0.182, -0.188], [-0.162, 0.19, -0.228]], rx: 0.054, ry: 0.032, roll: -0.22 },
      // Tier 4: Lower Occipital & Feathered Nape Spikes layering cleanly above the gi collar (-Z)
      { ctrl: [[0, 0.142, -0.094], [0.005, 0.126, -0.15], [0.01, 0.118, -0.196], [0.012, 0.118, -0.234]], rx: 0.056, ry: 0.032, roll: 0 },
      { ctrl: [[0.06, 0.132, -0.082], [0.096, 0.116, -0.132], [0.122, 0.108, -0.174], [0.138, 0.11, -0.208]], rx: 0.05, ry: 0.028, roll: 0.24 },
      { ctrl: [[-0.06, 0.132, -0.082], [-0.096, 0.116, -0.132], [-0.12, 0.108, -0.172], [-0.136, 0.11, -0.204]], rx: 0.05, ry: 0.028, roll: -0.24 },
      { ctrl: [[0, 0.094, -0.098], [0, 0.076, -0.138], [0.002, 0.066, -0.172], [0.004, 0.064, -0.2]], rx: 0.048, ry: 0.026, roll: 0 },
      // Tier 5: Forehead Swept Bangs & Temple Sideburns (+Z framing brows & ears)
      { ctrl: [[0.026, 0.252, 0.066], [0.054, 0.23, 0.128], [0.07, 0.194, 0.154], [0.078, 0.158, 0.158]], rx: 0.038, ry: 0.02, roll: 0.22 },
      { ctrl: [[-0.026, 0.252, 0.066], [-0.05, 0.228, 0.126], [-0.062, 0.194, 0.15], [-0.058, 0.162, 0.154]], rx: 0.036, ry: 0.019, roll: -0.2 },
      { ctrl: [[0.002, 0.256, 0.07], [0.01, 0.236, 0.13], [0.016, 0.204, 0.156], [0.02, 0.176, 0.16]], rx: 0.032, ry: 0.018, roll: 0.06 },
      { ctrl: [[0.108, 0.198, 0.038], [0.126, 0.166, 0.054], [0.132, 0.128, 0.048], [0.126, 0.098, 0.036]], rx: 0.026, ry: 0.015, roll: 0.42 }
    ];
    for (const tuft of hairTufts) {
      slots.push({ mesh: sculptedHairTuftMesh(tuft.ctrl, tuft.rx, tuft.ry, tuft.roll ?? 0), materialIndex: 2 });
    }
    return slots;
  });
}

function buildHeroUpperArmSlots(side: -1 | 1): MultiMatSlot[] {
  return memoizeGeometry(`cumulus:hero-arm-slots-v2:${side}`, (): MultiMatSlot[] => {
    // 1. Wide 20-station flared pleated martial-arts shoulder sleeve whose upper hood tucks deep inside the torso
    //    kimono shoulder yoke (`cx = -side * 0.036` at `y = +0.066`) — 100% eliminates exposed shoulder balls!
    const segs = 20;
    const sleeveStations: readonly { y: number; cx: number; rx: number; rz: number; tilt: number; pleat: number }[] = [
      { y: 0.066, cx: -side * 0.036, rx: 0.024, rz: 0.024, tilt: 0, pleat: 0 },
      { y: 0.052, cx: -side * 0.024, rx: 0.054, rz: 0.052, tilt: 0.008, pleat: 0.012 },
      { y: 0.024, cx: -side * 0.008, rx: 0.066, rz: 0.064, tilt: 0.014, pleat: 0.024 },
      { y: -0.014, cx: side * 0.004, rx: 0.074, rz: 0.071, tilt: 0.018, pleat: 0.038 },
      { y: -0.054, cx: side * 0.011, rx: 0.079, rz: 0.075, tilt: 0.02, pleat: 0.048 },
      // Flared bell rim -> rolled cuff lip -> inner hollow sleeve wall around muscular bicep
      { y: -0.084, cx: side * 0.014, rx: 0.082, rz: 0.078, tilt: 0.02, pleat: 0.05 },
      { y: -0.09, cx: side * 0.013, rx: 0.074, rz: 0.071, tilt: 0.018, pleat: 0.036 },
      { y: -0.074, cx: side * 0.009, rx: 0.058, rz: 0.056, tilt: 0.012, pleat: 0.016 },
      { y: -0.044, cx: side * 0.004, rx: 0.046, rz: 0.046, tilt: 0.004, pleat: 0 }
    ];
    const sleeveRings: V3[][] = sleeveStations.map((st) => {
      const ring: V3[] = [];
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const fold = 1 + st.pleat * Math.cos(a * 6 + side * 0.35);
        const slantY = st.y + side * ca * st.tilt;
        ring.push([st.cx + ca * st.rx * fold, slantY, sa * st.rz * fold]);
      }
      return ring;
    });

    // 2. Contoured rolled royal-indigo sleeve cuff border following the slanted pleated bell rim
    const cuffSpine: V4[] = [];
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const fold = 1 + 0.048 * Math.cos(a * 6 + side * 0.35);
      cuffSpine.push([
        side * 0.014 + ca * 0.081 * fold,
        -0.086 + side * ca * 0.02,
        sa * 0.077 * fold,
        0.01
      ]);
    }

    // 3. Youthful muscular deltoid/bicep/tricep (`sculptAnatomicalLimbMesh`, 18 radial stations + smooth subdivision)
    //    terminating in a concentric spherical elbow dome at [0, -0.186, 0.004]
    const muscularUpperArm = subdivideSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [0, -0.02, 0], rx: 0.04, rz: 0.041 },
          { pos: [side * 0.004, -0.068, 0.002], rx: 0.044, rz: 0.046, zOffset: 0.002 },
          { pos: [side * 0.005, -0.116, 0.005], rx: 0.045, rz: 0.048, zOffset: 0.004 },
          { pos: [side * 0.002, -0.156, 0.005], rx: 0.04, rz: 0.041 },
          { pos: [0, -0.186, 0.004], rx: 0.038, rz: 0.038 },
          { pos: [0, -0.208, 0.004], rx: 0.031, rz: 0.031 }
        ],
        { ringPoints: 18, capEnds: true, muscleBiasZ: 0.004, peakT: 0.44 }
      ),
      1,
      0.36
    );

    return [
      {
        mesh: tintTunicCloth(
          weldSmoothNormals(taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(sleeveRings, true, false), 1, 0.36), 3))
        ),
        materialIndex: 0
      },
      { mesh: tintIndigoCloth(weldSmoothNormals(taubinSmoothMesh(tubeSweepMesh(cuffSpine, 10, false), 2))), materialIndex: 1 },
      {
        mesh: tintWarmSkin(weldSmoothNormals(taubinSmoothMesh(muscularUpperArm, 3))),
        materialIndex: 2
      }
    ];
  });
}

function buildHeroForearmSlots(side: -1 | 1): MultiMatSlot[] {
  return memoizeGeometry(`cumulus:hero-forearm-slots-v3:${side}`, (): MultiMatSlot[] => {
    // 1. Youthful muscular forearm (`sculptAnatomicalLimbMesh`, 18 radial stations + `taubinSmoothMesh` fairing)
    const forearmMesh = weldSmoothNormals(
      taubinSmoothMesh(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, 0.022, 0], rx: 0.031, rz: 0.031 },
              { pos: [0, 0, 0], rx: 0.038, rz: 0.038 },
              { pos: [side * 0.002, -0.038, 0.004], rx: 0.042, rz: 0.044, zOffset: 0.003 },
              { pos: [side * 0.001, -0.078, 0.008], rx: 0.038, rz: 0.04 },
              { pos: [0, -0.118, 0.011], rx: 0.033, rz: 0.034 },
              { pos: [0, -0.158, 0.013], rx: 0.03, rz: 0.031 }
            ],
            { ringPoints: 18, capEnds: true, muscleBiasZ: 0.003, peakT: 0.34 }
          ),
          1,
          0.36
        ),
        3
      )
    );

    // 2. Sculpted martial-arts hand: 16-seg contoured palm + 4 curled finger arches + opposing thumb
    const palmRings: V3[][] = [
      ellipseSection(0, -0.154, 0.014, 0.031, 0.025, 16, Math.PI * 0.5),
      ellipseSection(0, -0.178, 0.017, 0.038, 0.028, 16, Math.PI * 0.5),
      ellipseSection(0, -0.2, 0.019, 0.036, 0.026, 16, Math.PI * 0.5),
      ellipseSection(0, -0.214, 0.018, 0.021, 0.016, 16, Math.PI * 0.5)
    ];
    const handParts: RawMesh[] = [
      forearmMesh,
      weldSmoothNormals(taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(palmRings, true, false), 1, 0.36), 3))
    ];
    const fingerOffsets: readonly [number, number][] = [
      [-0.022, 0.94],
      [-0.007, 1.02],
      [0.008, 0.98],
      [0.022, 0.88]
    ];
    for (const [fx, fLen] of fingerOffsets) {
      handParts.push(
        weldSmoothNormals(
          tubeSweepMesh([
            [fx, -0.194, 0.032, 0.0108],
            [fx * 0.96, -0.212 * fLen - 0.008 * (1 - fLen), 0.043, 0.0098],
            [fx * 0.92, -0.216 * fLen - 0.008 * (1 - fLen), 0.025, 0.0082]
          ], 8, false)
        )
      );
    }
    handParts.push(
      weldSmoothNormals(
        tubeSweepMesh([
          [-side * 0.024, -0.17, 0.024, 0.0138],
          [-side * 0.035, -0.188, 0.04, 0.0122],
          [-side * 0.022, -0.202, 0.046, 0.0098]
        ], 8, false)
      )
    );

    // 3. Triple-ribbed wrapped royal-indigo martial wristband + amber cuff piping rings
    const wristProfile: V2[] = [
      [0.029, -0.162],
      [0.044, -0.156],
      [0.047, -0.144],
      [0.042, -0.132],
      [0.047, -0.12],
      [0.042, -0.108],
      [0.046, -0.098],
      [0.03, -0.091]
    ];
    const wristTrimRing: V2[] = [
      [0.038, -0.004],
      [0.0455, -0.002],
      [0.0455, 0.002],
      [0.038, 0.004]
    ];

    return [
      { mesh: tintWarmSkin(mergeRawMeshes(handParts)), materialIndex: 0 },
      {
        mesh: tintIndigoCloth(transformMesh(weldSmoothNormals(latheMesh(wristProfile, 20, false)), { pos: [0, 0, 0.011] })),
        materialIndex: 1
      },
      {
        mesh: mergeRawMeshes([
          transformMesh(weldSmoothNormals(latheMesh(wristTrimRing, 18, false)), { pos: [0, -0.094, 0.011] }),
          transformMesh(weldSmoothNormals(latheMesh(wristTrimRing, 18, false)), { pos: [0, -0.158, 0.011] })
        ]),
        materialIndex: 2
      }
    ];
  });
}

function buildHeroThighSlots(): MultiMatSlot[] {
  return memoizeGeometry("cumulus:hero-thigh-slots-v3", (): MultiMatSlot[] => {
    // Smoothly draped baggy pleated martial-arts upper gi trouser (`sculptDrapedGarmentMesh`, 22 radial points + Taubin fairing)
    const baggyThigh = sculptDrapedGarmentMesh(
      [
        { y: -0.344, rx: 0.024, rz: 0.024, z: 0.004, folds: 0, foldAmp: 0 },
        { y: -0.326, rx: 0.06, rz: 0.061, z: 0.004, folds: 0, foldAmp: 0 },
        { y: -0.3, rx: 0.075, rz: 0.077, z: 0.004, folds: 4, foldAmp: 0.01 },
        { y: -0.275, rx: 0.079, rz: 0.081, z: 0.005, folds: 6, foldAmp: 0.018 },
        { y: -0.222, rx: 0.089, rz: 0.09, z: 0.006, folds: 6, foldAmp: 0.032 },
        { y: -0.145, rx: 0.098, rz: 0.097, z: 0.007, folds: 6, foldAmp: 0.045 },
        { y: -0.068, rx: 0.099, rz: 0.098, z: 0.005, folds: 6, foldAmp: 0.042 },
        { y: 0, rx: 0.089, rz: 0.089, z: 0.002, folds: 5, foldAmp: 0.026 },
        { y: 0.034, rx: 0.072, rz: 0.072, z: 0, folds: 4, foldAmp: 0.012 },
        { y: 0.056, rx: 0.026, rz: 0.026, z: 0, folds: 0, foldAmp: 0 }
      ],
      { ringPoints: 22, capEnds: true, smoothPasses: 4 }
    );
    return [
      {
        mesh: tintTunicCloth(weldSmoothNormals(baggyThigh)),
        materialIndex: 0
      }
    ];
  });
}

function buildHeroShinSlots(): MultiMatSlot[] {
  return memoizeGeometry("cumulus:hero-shin-slots-v3", (): MultiMatSlot[] => {
    // 1. Lantern-bloused baggy lower martial gi trouser (`sculptDrapedGarmentMesh`) tucked cleanly into wrapped cloth shin-guards (`kyahan`)!
    const lowerTrouser = sculptDrapedGarmentMesh(
      [
        { y: -0.116, rx: 0.052, rz: 0.054, z: 0.001, folds: 0, foldAmp: 0 },
        { y: -0.108, rx: 0.064, rz: 0.066, z: 0.002, folds: 6, foldAmp: 0.016 },
        { y: -0.096, rx: 0.09, rz: 0.092, z: 0.003, folds: 8, foldAmp: 0.046 },
        { y: -0.074, rx: 0.098, rz: 0.1, z: 0.004, folds: 8, foldAmp: 0.052 },
        { y: -0.036, rx: 0.089, rz: 0.091, z: 0.005, folds: 8, foldAmp: 0.034 },
        { y: 0, rx: 0.075, rz: 0.077, z: 0.004, folds: 6, foldAmp: 0.012 },
        { y: 0.024, rx: 0.06, rz: 0.061, z: 0.004, folds: 0, foldAmp: 0 },
        { y: 0.042, rx: 0.024, rz: 0.024, z: 0.004, folds: 0, foldAmp: 0 }
      ],
      { ringPoints: 22, capEnds: true, smoothPasses: 4 }
    );

    // 2. 20-station sculpted 4-coil cream cloth shin-guard (`kyahan`, y = -0.088 .. -0.164)
    const kyahanProfile: V2[] = [
      [0.045, -0.164],
      [0.058, -0.158],
      [0.061, -0.146],
      [0.057, -0.136],
      [0.063, -0.124],
      [0.059, -0.112],
      [0.065, -0.1],
      [0.054, -0.088]
    ];

    // 3. Crisscrossed royal-indigo martial shin-guard binding ribbons (`kyahan` X-wraps)
    const wrapA: V4[] = [];
    const wrapB: V4[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      const a = t * Math.PI * 3;
      const y = -0.094 - t * 0.062;
      const r = 0.063 - t * 0.004;
      wrapA.push([Math.cos(a) * r, y, 0.001 + Math.sin(a) * (r + 0.002), 0.0058]);
      wrapB.push([Math.cos(-a + Math.PI) * r, y, 0.001 + Math.sin(-a + Math.PI) * (r + 0.002), 0.0058]);
    }

    return [
      {
        mesh: tintTunicCloth(weldSmoothNormals(lowerTrouser)),
        materialIndex: 0
      },
      {
        mesh: tintCreamWrap(weldSmoothNormals(taubinSmoothMesh(latheMesh(kyahanProfile, 20, false), 2))),
        materialIndex: 1
      },
      {
        mesh: tintIndigoCloth(
          mergeRawMeshes([
            weldSmoothNormals(tubeSweepMesh(wrapA, 8, false)),
            weldSmoothNormals(tubeSweepMesh(wrapB, 8, false))
          ])
        ),
        materialIndex: 2
      }
    ];
  });
}

function buildHeroBootSlots(): MultiMatSlot[] {
  return memoizeGeometry("cumulus:hero-boot-slots-v3", (): MultiMatSlot[] => {
    // Striped Kung-Fu Boots with exact rest sole bottom at local y = -0.220000 -> world y = 0.000000!
    // 1. Multi-folded woven cream ankle wrap collar + twin lateral kung-fu stripes (`materialIndex: 1`)
    const putteeProfile: V2[] = [
      [0.045, -0.044],
      [0.064, -0.036],
      [0.068, -0.02],
      [0.063, -0.006],
      [0.069, 0.01],
      [0.064, 0.024],
      [0.046, 0.034]
    ];
    const creamStripeParts: RawMesh[] = [weldSmoothNormals(taubinSmoothMesh(latheMesh(putteeProfile, 20, false), 2))];
    for (const sx of [-1, 1] as const) {
      // Classic twin diagonal kung-fu side stripes along both flanks of the indigo boot
      creamStripeParts.push(
        weldSmoothNormals(
          tubeSweepMesh([
            [sx * 0.049, -0.088, 0.018, 0.0056],
            [sx * 0.054, -0.136, 0.056, 0.006],
            [sx * 0.056, -0.18, 0.092, 0.0054]
          ], 8, false)
        ),
        weldSmoothNormals(
          tubeSweepMesh([
            [sx * 0.048, -0.104, -0.012, 0.0054],
            [sx * 0.052, -0.15, 0.024, 0.0058],
            [sx * 0.053, -0.186, 0.058, 0.0052]
          ], 8, false)
        )
      );
    }

    // 2. Criss-crossed golden-amber ankle binding cords + rear cord knot cinching the ankle
    const cordA: V4[] = [];
    const cordB: V4[] = [];
    for (let i = 0; i <= 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      cordA.push([ca * 0.054, -0.045 + 0.011 * sa, sa * 0.056, 0.0065]);
      cordB.push([ca * 0.054, -0.047 - 0.011 * sa, sa * 0.056, 0.0065]);
    }
    const ankleBindings = mergeRawMeshes([
      weldSmoothNormals(tubeSweepMesh(cordA, 8, false)),
      weldSmoothNormals(tubeSweepMesh(cordB, 8, false)),
      transformMesh(smoothEllipsoid(0.014, 0.012, 0.012, 8, 12, 0), { pos: [0, -0.046, -0.058] })
    ]);

    // 3. 20-station anatomically contoured kung-fu boot upper (matte woven indigo cloth + `taubinSmoothMesh` fairing)
    const footLastRing = (y: number, zBack: number, zFront: number, wHeel: number, wFore: number, waistPinch: number, toeLift = 0): V3[] => {
      const ring: V3[] = [];
      const n = 20;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const u = 0.5 + 0.5 * sa;
        const z = zBack + u * (zFront - zBack);
        const archPinch = 1 - waistPinch * Math.pow(Math.sin(u * Math.PI), 2);
        const halfW = (wHeel + (wFore - wHeel) * Math.pow(u, 0.75)) * archPinch;
        const upToe = u > 0.65 ? toeLift * Math.pow((u - 0.65) / 0.35, 1.8) : 0;
        ring.push([ca * halfW, y + upToe, z]);
      }
      return ring;
    };

    const bootUpperRings: V3[][] = [
      footLastRing(-0.036, -0.048, 0.048, 0.046, 0.046, 0),
      footLastRing(-0.068, -0.052, 0.054, 0.048, 0.049, 0.04),
      footLastRing(-0.105, -0.06, 0.086, 0.05, 0.054, 0.08),
      footLastRing(-0.145, -0.066, 0.132, 0.052, 0.06, 0.12, 0.008),
      footLastRing(-0.176, -0.064, 0.156, 0.051, 0.062, 0.14, 0.014),
      footLastRing(-0.194, -0.06, 0.154, 0.049, 0.059, 0.14, 0.012)
    ];
    const bootUpper = clampMeshMinY(
      tintIndigoCloth(weldSmoothNormals(taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(bootUpperRings, true, false), 1, 0.36), 3))),
      -0.215
    );

    // 4. Raised golden-amber vamp center piping + rear Achilles heel counter stripe
    const centerPiping = mergeRawMeshes([
      weldSmoothNormals(
        tubeSweepMesh([
          [0, -0.054, 0.052, 0.0072],
          [0, -0.105, 0.088, 0.0076],
          [0, -0.152, 0.138, 0.0074],
          [0, -0.172, 0.158, 0.0066]
        ], 8, false)
      ),
      weldSmoothNormals(
        tubeSweepMesh([
          [0, -0.056, -0.051, 0.0068],
          [0, -0.118, -0.064, 0.0076],
          [0, -0.182, -0.064, 0.007]
        ], 8, false)
      )
    ]);

    // 5. Foot-contoured kung-fu sole: figure-8 arch waist + upturned front toe welt + EXACT y = -0.220 plantar contact!
    const soleRings: V3[][] = [
      footLastRing(-0.223, -0.056, 0.142, 0.048, 0.058, 0.16, 0),
      footLastRing(-0.215, -0.063, 0.156, 0.053, 0.064, 0.15, 0.004),
      footLastRing(-0.198, -0.065, 0.162, 0.055, 0.066, 0.14, 0.012),
      footLastRing(-0.186, -0.061, 0.155, 0.05, 0.06, 0.14, 0.012)
    ];
    const soleMesh = weldSmoothNormals(clampMeshMinY(taubinSmoothMesh(loftSectionsMesh(soleRings, true, false), 2), -0.22));

    return [
      { mesh: clampMeshMinY(tintCreamWrap(mergeRawMeshes(creamStripeParts)), -0.215), materialIndex: 1 },
      { mesh: clampMeshMinY(ankleBindings, -0.215), materialIndex: 2 },
      { mesh: bootUpper, materialIndex: 0 },
      { mesh: clampMeshMinY(centerPiping, -0.215), materialIndex: 2 },
      { mesh: soleMesh, materialIndex: 2 }
    ];
  });
}

/** Exact rest-pose world AABB of the Sky Kid Cloud-Surfer Hero (verifies minY === 0 grounding and ~1.53m stature). */
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
        color: "#1ea388",
        roughness: 0.84,
        sheen: 0.9,
        sheenColor: heroRim.color,
        sheenRoughness: 0.46
      })
    : CUMULUS_MATERIALS.heroSaffronTunic;
  const indigoMat = heroRim
    ? material.fabric({
        name: "hero-indigo-cloth-rimmed",
        color: "#25438c",
        roughness: 0.84,
        sheen: 0.9,
        sheenColor: heroRim.color,
        sheenRoughness: 0.46
      })
    : CUMULUS_MATERIALS.heroIndigoCloth;

  const pelvisMesh = assembleMultiMaterialNode(
    "hero-pelvis-mesh",
    buildHeroPelvisSlots(),
    [tunicMat, indigoMat, CUMULUS_MATERIALS.cumulusAmberBraid],
    { castShadow: true, receiveShadow: false, coalesceColors: false }
  );
  const sashL = group(
    HERO_PART_IDS.sashL,
    [assembleMultiMaterialNode("hero-sash-l-mesh", buildHeroSashTailSlots(-1), [indigoMat, CUMULUS_MATERIALS.cumulusAmberBraid], { castShadow: false, receiveShadow: false, coalesceColors: false })],
    { position: HERO_REST_PIVOTS.sashL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.sashL });
  const sashR = group(
    HERO_PART_IDS.sashR,
    [assembleMultiMaterialNode("hero-sash-r-mesh", buildHeroSashTailSlots(1), [indigoMat, CUMULUS_MATERIALS.cumulusAmberBraid], { castShadow: false, receiveShadow: false, coalesceColors: false })],
    { position: HERO_REST_PIVOTS.sashR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.sashR });

  const backPole = assembleMultiMaterialNode(
    HERO_PART_IDS.backPole,
    buildHeroBackPoleSlots(),
    [
      CUMULUS_MATERIALS.vermilionLacquer,
      CUMULUS_MATERIALS.engravedBrass,
      CUMULUS_MATERIALS.darkBronzeHardware,
      indigoMat,
      CUMULUS_MATERIALS.cumulusAmberBraid
    ],
    {
      id: HERO_PART_IDS.backPole,
      position: HERO_REST_PIVOTS.backPolePos,
      rotation: HERO_REST_PIVOTS.backPoleRot,
      castShadow: false,
      receiveShadow: false,
      coalesceColors: false
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
        { castShadow: false, receiveShadow: false, coalesceColors: false }
      )
    ],
    { position: HERO_REST_PIVOTS.head, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.head });

  const forearmL = group(
    HERO_PART_IDS.forearmL,
    [assembleMultiMaterialNode("hero-forearm-l-mesh", buildHeroForearmSlots(1), [CUMULUS_MATERIALS.heroWarmSkin, indigoMat, CUMULUS_MATERIALS.heroBootAmberSole], { castShadow: false, receiveShadow: false, coalesceColors: false })],
    { position: HERO_REST_PIVOTS.forearmL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.forearmL });
  const armL = group(
    HERO_PART_IDS.armL,
    [
      assembleMultiMaterialNode("hero-arm-l-mesh", buildHeroUpperArmSlots(1), [tunicMat, indigoMat, CUMULUS_MATERIALS.heroWarmSkin], { castShadow: false, receiveShadow: false, coalesceColors: false }),
      forearmL
    ],
    { position: HERO_REST_PIVOTS.armL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.armL });

  const forearmR = group(
    HERO_PART_IDS.forearmR,
    [assembleMultiMaterialNode("hero-forearm-r-mesh", buildHeroForearmSlots(-1), [CUMULUS_MATERIALS.heroWarmSkin, indigoMat, CUMULUS_MATERIALS.heroBootAmberSole], { castShadow: false, receiveShadow: false, coalesceColors: false })],
    { position: HERO_REST_PIVOTS.forearmR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.forearmR });
  const armR = group(
    HERO_PART_IDS.armR,
    [
      assembleMultiMaterialNode("hero-arm-r-mesh", buildHeroUpperArmSlots(-1), [tunicMat, indigoMat, CUMULUS_MATERIALS.heroWarmSkin], { castShadow: false, receiveShadow: false, coalesceColors: false }),
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
        { castShadow: true, receiveShadow: false, coalesceColors: false }
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
    [assembleMultiMaterialNode("hero-boot-l-mesh", buildHeroBootSlots(), [indigoMat, CUMULUS_MATERIALS.heroBootCreamCuff, CUMULUS_MATERIALS.heroBootAmberSole], { castShadow: false, receiveShadow: false, coalesceColors: false })],
    { position: HERO_REST_PIVOTS.bootL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.bootL });
  const shinL = group(
    HERO_PART_IDS.shinL,
    [
      assembleMultiMaterialNode("hero-shin-l-mesh", buildHeroShinSlots(), [tunicMat, CUMULUS_MATERIALS.heroBootCreamCuff, indigoMat], { castShadow: false, receiveShadow: false, coalesceColors: false }),
      bootL
    ],
    { position: HERO_REST_PIVOTS.shinL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.shinL });
  const thighL = group(
    HERO_PART_IDS.thighL,
    [
      assembleMultiMaterialNode("hero-thigh-l-mesh", buildHeroThighSlots(), [tunicMat], { castShadow: false, receiveShadow: false, coalesceColors: false }),
      shinL
    ],
    { position: HERO_REST_PIVOTS.thighL, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.thighL });

  const bootR = group(
    HERO_PART_IDS.bootR,
    [assembleMultiMaterialNode("hero-boot-r-mesh", buildHeroBootSlots(), [indigoMat, CUMULUS_MATERIALS.heroBootCreamCuff, CUMULUS_MATERIALS.heroBootAmberSole], { castShadow: false, receiveShadow: false, coalesceColors: false })],
    { position: HERO_REST_PIVOTS.bootR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.bootR });
  const shinR = group(
    HERO_PART_IDS.shinR,
    [
      assembleMultiMaterialNode("hero-shin-r-mesh", buildHeroShinSlots(), [tunicMat, CUMULUS_MATERIALS.heroBootCreamCuff, indigoMat], { castShadow: false, receiveShadow: false, coalesceColors: false }),
      bootR
    ],
    { position: HERO_REST_PIVOTS.shinR, rotationOrder: "ZYX" }
  ).runtime({ id: HERO_PART_IDS.shinR });
  const thighR = group(
    HERO_PART_IDS.thighR,
    [
      assembleMultiMaterialNode("hero-thigh-r-mesh", buildHeroThighSlots(), [tunicMat], { castShadow: false, receiveShadow: false, coalesceColors: false }),
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
