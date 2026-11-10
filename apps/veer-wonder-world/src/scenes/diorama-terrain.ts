import {
  geometry,
  groups,
  material,
  world,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraInstanceWindOption,
  type AuraMaterialRimSpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraNodeInput,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  catmullRomCurve,
  createFbm2D,
  heightfieldGeometry,
  path2d,
  polylineCurve,
  sweepGeometry,
  type ProceduralVec2,
  type ProceduralVec3
} from "@aura3d/engine/procedural";
import type { Vec3 } from "./motion.js";

/* ------------------------------------------------------------------------- */
/* Deterministic PRNG & Math Helpers (Zero Math.random)                      */
/* ------------------------------------------------------------------------- */

export function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-9) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

export interface DioramaGroupTransform {
  readonly position?: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: number | Vec3;
}

export function dioramaGroup(
  name: string,
  children: readonly AuraNodeInput[],
  transform: DioramaGroupTransform = {}
): AuraNodeBuilder<AuraSceneNode> {
  return groups.create(name, children, {
    ...(transform.position ? { position: transform.position } : {}),
    ...(transform.rotation ? { rotation: transform.rotation } : {}),
    ...(transform.scale !== undefined ? { scale: transform.scale } : {})
  });
}

/* ------------------------------------------------------------------------- */
/* WebGPU-Native Blender-Cycles Craft Material Palette                       */
/* ------------------------------------------------------------------------- */

const WARM_HERO_RIM: AuraMaterialRimSpec = {
  color: "#FFF2DA",
  power: 2.8,
  intensity: 0.24
};

export function feltMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_HERO_RIM): AuraMaterialSpec {
  return {
    ...material.felt({
      color,
      roughness: 0.9,
      sheen: 0.72,
      sheenRoughness: 0.84,
      sheenColor: "#FFF8EE"
    }),
    ...(rim ? { rim } : {})
  };
}

export function plushCloudMat(
  color: AuraColor,
  rim: AuraMaterialRimSpec | false = { color: "#FFF4FC", power: 2.5, intensity: 0.32 }
): AuraMaterialSpec {
  return {
    ...material.felt({
      color,
      roughness: 0.85,
      sheen: 0.86,
      sheenRoughness: 0.76,
      sheenColor: "#FFF6FF"
    }),
    ...(rim ? { rim } : {})
  };
}

export function clayMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_HERO_RIM): AuraMaterialSpec {
  return {
    ...material.matteClay({
      color,
      roughness: 0.86
    }),
    ...(rim ? { rim } : {})
  };
}

export function ceramicMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_HERO_RIM): AuraMaterialSpec {
  return {
    ...material.ceramic({
      color,
      roughness: 0.32,
      clearcoat: 0.58,
      clearcoatRoughness: 0.22
    }),
    ...(rim ? { rim } : {})
  };
}

export function lacquerMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_HERO_RIM): AuraMaterialSpec {
  return {
    ...material.lacquer({
      color,
      roughness: 0.16,
      clearcoat: 0.88,
      clearcoatRoughness: 0.1
    }),
    ...(rim ? { rim } : {})
  };
}

export function clearcoatPaintMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_HERO_RIM): AuraMaterialSpec {
  return {
    ...material.clearcoatPaint({
      color,
      roughness: 0.26,
      clearcoat: 0.74,
      clearcoatRoughness: 0.14
    }),
    ...(rim ? { rim } : {})
  };
}

export function woodMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.standard({
      color,
      roughness: 0.66,
      metallic: 0.02,
      diffuseRoughness: 0.78,
      envMapIntensity: 0.82
    }),
    ...(rim ? { rim } : {})
  };
}

export function rubberMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.rubber({
      color,
      roughness: 0.82
    }),
    ...(rim ? { rim } : {})
  };
}

export function brushedMetalMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.brushedMetal({
      color,
      roughness: 0.32,
      metallic: 0.86
    }),
    ...(rim ? { rim } : {})
  };
}

export function fabricMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_HERO_RIM): AuraMaterialSpec {
  return {
    ...material.fabric({
      color,
      roughness: 0.88,
      sheen: 0.58,
      sheenRoughness: 0.82,
      sheenColor: "#FFF6EB"
    }),
    ...(rim ? { rim } : {})
  };
}

export function clearGlassMat(color: AuraColor = "#E6F6FF"): AuraMaterialSpec {
  return material.clearGlass({
    color,
    roughness: 0.08
  });
}

export function frostedGlassMat(color: AuraColor = "#FFF6E6"): AuraMaterialSpec {
  return material.frostedGlass({
    color,
    roughness: 0.42
  });
}

export function warmPracticalGlowMat(
  color: AuraColor,
  emissive: AuraColor,
  emissiveIntensity = 1.35
): AuraMaterialSpec {
  return {
    ...material.emissive({
      color,
      emissive,
      emissiveIntensity
    }),
    bloom: 1.25
  };
}

/**
 * Single-draw-call instance materials: strictly omit PBR extension lobes
 * (`sheen`, `clearcoat`, `iridescence`, `transmission`, `ior`) so `ForwardPass`
 * batches the entire `instances.*` / `instances.model` pool into 1 GPU draw call,
 * while Oren-Nayar `diffuseRoughness` + `retroreflection` preserve soft clay shading.
 */
export function instanceClayMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.86,
    metallic: 0,
    diffuseRoughness: 0.88,
    retroreflection: 0.28,
    envMapIntensity: 0.72
  });
}

export function instanceWoodMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.68,
    metallic: 0.02,
    diffuseRoughness: 0.76,
    retroreflection: 0.2,
    envMapIntensity: 0.78
  });
}

export function instanceSatinMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.28,
    metallic: 0.04,
    diffuseRoughness: 0.42,
    retroreflection: 0.16,
    envMapIntensity: 0.9
  });
}

export function instanceMetalMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.34,
    metallic: 0.84,
    envMapIntensity: 0.96
  });
}

export function gentleBreezeWind(
  reducedMotion: boolean,
  strength = 0.22,
  assetHeight = 0.8,
  directionDeg = 38
): AuraInstanceWindOption | undefined {
  if (reducedMotion) return undefined;
  return {
    directionDeg,
    strength,
    gustStrength: 0.25,
    gustScale: 24,
    turbulence: 0.15,
    assetHeight
  };
}

/* ------------------------------------------------------------------------- */
/* Procedural Diorama Plinths, Hills, Splines & Contours                     */
/* ------------------------------------------------------------------------- */

const PROCEDURAL_SPEC_CACHE = new Map<string, AuraCustomGeometrySpec>();

function packProceduralSpec(raw: AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const positions =
    raw.positions instanceof Float32Array
      ? raw.positions
      : new Float32Array(raw.positions.flatMap((p) => (typeof p === "number" ? [p] : [p[0], p[1], p[2]])));
  const normals =
    raw.normals === undefined
      ? undefined
      : raw.normals instanceof Float32Array
        ? raw.normals
        : new Float32Array(raw.normals.flatMap((n) => (typeof n === "number" ? [n] : [n[0], n[1], n[2]])));
  const uvs =
    raw.uvs === undefined
      ? undefined
      : raw.uvs instanceof Float32Array
        ? raw.uvs
        : new Float32Array(raw.uvs.flatMap((u) => (typeof u === "number" ? [u] : [u[0], u[1]])));
  const indices =
    raw.indices instanceof Uint32Array || raw.indices instanceof Uint16Array
      ? raw.indices
      : positions.length / 3 <= 65535
        ? new Uint16Array(raw.indices)
        : new Uint32Array(raw.indices);
  const bounds = raw.bounds ?? geometry.computeBounds({ positions });
  return geometry.define({
    positions,
    ...(normals ? { normals } : {}),
    ...(uvs ? { uvs } : {}),
    indices,
    bounds
  });
}

function cachedProceduralSpec(key: string, build: () => AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const hit = PROCEDURAL_SPEC_CACHE.get(key);
  if (hit !== undefined) return hit;
  const packed = packProceduralSpec(build());
  PROCEDURAL_SPEC_CACHE.set(key, packed);
  return packed;
}

export interface IslandPlinthOptions {
  readonly name: string;
  readonly seed: number;
  readonly material: AuraMaterialSpec;
  /** Width & depth of the sculpted island grid in metres (default `[30, 28]`). */
  readonly span?: readonly [number, number];
  /** Grid resolution `[nx, nz]` (default `[32, 30]`). */
  readonly segments?: readonly [number, number];
  /** Radius inside which `y === 0.000` is strictly guaranteed (default `3.65m` > `3.4m`). */
  readonly flatStageRadius?: number;
  /** Outer radius where the bevelled diorama island rounds down to the plinth skirt. */
  readonly islandRadius?: number;
  /** Gentle outer meadow/pasture swell amplitude beyond `flatStageRadius`. */
  readonly outerSwellAmplitude?: number;
  /** Optional recessed basin `{ center: [x, z], radius, depth }` (e.g. duck pond). */
  readonly basin?: {
    readonly center: readonly [number, number];
    readonly radius: number;
    readonly depth: number;
  };
  /** Optional quilted pillow amplitude for cloud islands (outside `flatStageRadius`). */
  readonly quiltAmplitude?: number;
  readonly plinthBaseY?: number;
}

/**
 * Builds a bevelled miniature-diorama island with a guaranteed flat `y = 0.000`
 * stage floor inside `r <= flatStageRadius` (`>= 3.4m`), gentle organic terrain
 * swells in the outer ring, and a solid clay plinth skirt (`base`).
 */
export function buildIslandPlinthNode(options: IslandPlinthOptions): AuraNodeBuilder<AuraSceneNode> {
  const [width, depth] = options.span ?? [30, 28];
  const [rawSegX, rawSegZ] = options.segments ?? [32, 30];
  const segX = Math.min(rawSegX, 34);
  const segZ = Math.min(rawSegZ, 32);
  const flatR = Math.max(3.45, options.flatStageRadius ?? 3.65);
  const islandR = options.islandRadius ?? 13.4;
  const swellAmp = options.outerSwellAmplitude ?? 0.34;
  const quiltAmp = options.quiltAmplitude ?? 0;
  const baseY = options.plinthBaseY ?? -1.05;
  const basinKey = options.basin
    ? `${options.basin.center[0]},${options.basin.center[1]},${options.basin.radius},${options.basin.depth}`
    : "none";
  const cacheKey = `plinth:${options.seed}:${width}x${depth}:${segX}x${segZ}:${flatR}:${islandR}:${swellAmp}:${quiltAmp}:${baseY}:${basinKey}`;

  const spec = cachedProceduralSpec(cacheKey, () => {
    const fbm = createFbm2D(options.seed, { octaves: 3, gain: 0.48, lacunarity: 2.05 });
    return heightfieldGeometry({
      size: [width, depth],
      segments: [segX, segZ],
      base: baseY,
      uvRepeat: width / 4,
      heightAt: (x: number, z: number): number => {
        const r = Math.hypot(x, z * 1.06);
        if (r <= flatR) {
          return 0;
        }

        const outerBlend = smoothstep(flatR, flatR + 2.6, r);
        const backBias = z < -2.4 ? smoothstep(-2.4, -9.5, z) * 0.42 : 0;
        const organic = (fbm(x * 0.13, z * 0.13) * 0.5 + 0.5) * swellAmp + backBias * swellAmp * 1.35;
        const quilt =
          quiltAmp > 0
            ? Math.abs(Math.sin(x * 0.95) * Math.cos(z * 0.95)) * quiltAmp * outerBlend
            : 0;

        const rimDrop = smoothstep(islandR - 2.1, islandR, r) * 0.72;
        let h = (organic + quilt) * outerBlend - rimDrop;

        if (options.basin) {
          const dBasin = Math.hypot(x - options.basin.center[0], z - options.basin.center[1]);
          if (dBasin < options.basin.radius + 0.95) {
            const dip = 1 - smoothstep(options.basin.radius * 0.45, options.basin.radius + 0.85, dBasin);
            h -= dip * options.basin.depth;
          }
        }

        return r <= flatR ? 0 : h;
      }
    });
  });

  return geometry.custom(spec, {
    name: options.name,
    material: options.material,
    castShadow: false,
    receiveShadow: true
  });
}

export interface BackdropHillOptions {
  readonly name: string;
  readonly seed: number;
  readonly position: Vec3;
  readonly size: readonly [number, number];
  readonly peakHeight: number;
  readonly material: AuraMaterialSpec;
  readonly rotationY?: number;
}

/** Soft sculpted rolling backdrop hill placed outside the stage play area. */
export function buildBackdropHillNode(options: BackdropHillOptions): AuraNodeBuilder<AuraSceneNode> {
  const [width, depth] = options.size;
  const cacheKey = `hill:${options.seed}:${width}x${depth}:${options.peakHeight}`;

  const spec = cachedProceduralSpec(cacheKey, () => {
    const fbm = createFbm2D(options.seed, { octaves: 3, gain: 0.5 });
    const halfW = width * 0.5;
    const halfD = depth * 0.5;
    return heightfieldGeometry({
      size: [width, depth],
      segments: [18, 14],
      base: -0.35,
      heightAt: (x: number, z: number): number => {
        const nx = x / Math.max(0.5, halfW);
        const nz = z / Math.max(0.5, halfD);
        const dome = Math.max(0, 1 - (nx * nx * 0.92 + nz * nz * 1.08));
        const shape = dome * Math.sqrt(dome);
        const ripple = 0.84 + 0.24 * fbm(x * 0.22, z * 0.22);
        return shape * options.peakHeight * ripple - (1 - dome) * 0.18;
      }
    });
  });

  const builder = geometry
    .custom(spec, {
      name: options.name,
      material: options.material,
      castShadow: false,
      receiveShadow: true
    })
    .position(options.position[0], options.position[1], options.position[2]);

  return options.rotationY !== undefined ? builder.rotation(0, options.rotationY, 0) : builder;
}

export interface TubeAlongSplineOptions {
  readonly name: string;
  readonly points: readonly ProceduralVec3[];
  readonly radius: number | ((t: number) => number);
  readonly segments?: number;
  readonly radialSegments?: number;
  readonly closed?: boolean;
  readonly cap?: boolean;
  readonly material: AuraMaterialSpec;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/** Sweeps a smooth circular tube along a 3D Catmull-Rom spline. */
export function tubeAlongSpline(options: TubeAlongSplineOptions): AuraNodeBuilder<AuraSceneNode> {
  const closed = options.closed ?? false;
  const steps = Math.min(options.segments ?? 32, 48);
  const radialSegments = Math.min(options.radialSegments ?? 10, 10);
  const caps = options.cap ?? !closed;

  const buildRaw = (): AuraCustomGeometrySpec => {
    const curve = catmullRomCurve(options.points, { closed });
    return sweepGeometry({
      path: curve,
      radius: options.radius,
      steps,
      radialSegments,
      caps
    });
  };

  const spec =
    typeof options.radius === "number"
      ? cachedProceduralSpec(
          `tube:${options.name}:${options.radius}:${steps}:${radialSegments}:${closed}:${caps}:${options.points.map((p) => p.join(",")).join(";")}`,
          buildRaw
        )
      : packProceduralSpec(buildRaw());

  return geometry.custom(spec, {
    name: options.name,
    material: options.material,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true
  });
}

/**
 * Counter-clockwise bevelled strap profile in `(N = up, B = T x N = -right)`
 * for flat-topped winding garden paths, gravel ballast beds, and terraces.
 */
export function bevelledRibbonProfile(
  halfWidthBottom: number,
  halfWidthTop: number,
  height: number,
  baseY = -0.02
): readonly ProceduralVec2[] {
  const bevel = Math.min(0.05, Math.abs(halfWidthBottom - halfWidthTop) * 0.35 + 0.012);
  return path2d()
    .moveTo(baseY, -halfWidthBottom)
    .lineTo(baseY, halfWidthBottom)
    .lineTo(height * 0.72, halfWidthTop + bevel)
    .quadTo(height, halfWidthTop, height, Math.max(0, halfWidthTop - bevel))
    .lineTo(height, -Math.max(0, halfWidthTop - bevel))
    .quadTo(height, -halfWidthTop, height * 0.72, -(halfWidthTop + bevel))
    .close()
    .points({ curveSegments: 2 });
}

export interface RibbonAlongSplineOptions {
  readonly name: string;
  readonly points: readonly ProceduralVec3[];
  readonly halfWidthBottom: number;
  readonly halfWidthTop: number;
  readonly height: number;
  readonly baseY?: number;
  readonly segments?: number;
  readonly closed?: boolean;
  readonly material: AuraMaterialSpec;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/** Sweeps a bevelled flat-topped strap/ballast/path along a Catmull-Rom spline. */
export function ribbonAlongSpline(options: RibbonAlongSplineOptions): AuraNodeBuilder<AuraSceneNode> {
  const closed = options.closed ?? false;
  const steps = Math.min(options.segments ?? 32, 48);
  const baseY = options.baseY ?? -0.02;
  const cacheKey = `ribbon:${options.name}:${options.halfWidthBottom}:${options.halfWidthTop}:${options.height}:${baseY}:${steps}:${closed}:${options.points.map((p) => p.join(",")).join(";")}`;

  const spec = cachedProceduralSpec(cacheKey, () => {
    const curve = catmullRomCurve(options.points, { closed });
    const profile = bevelledRibbonProfile(
      options.halfWidthBottom,
      options.halfWidthTop,
      options.height,
      baseY
    );
    return sweepGeometry({
      path: curve,
      profile,
      steps,
      caps: !closed
    });
  });

  return geometry.custom(spec, {
    name: options.name,
    material: options.material,
    castShadow: options.castShadow ?? false,
    receiveShadow: options.receiveShadow ?? true
  });
}

export interface ExtrudeContourOptions {
  readonly name: string;
  readonly profile: readonly ProceduralVec2[];
  readonly from: ProceduralVec3;
  readonly to: ProceduralVec3;
  readonly segments?: number;
  readonly material: AuraMaterialSpec;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/** Extrudes an arbitrary 2D contour cleanly between two 3D endpoints with end caps. */
export function extrudeContour(options: ExtrudeContourOptions): AuraNodeBuilder<AuraSceneNode> {
  const steps = options.segments ?? 2;
  const cacheKey = `extrude:${options.name}:${options.from.join(",")}:${options.to.join(",")}:${steps}:${options.profile.map((p) => p.join(",")).join(";")}`;
  const spec = cachedProceduralSpec(cacheKey, () => {
    const curve = polylineCurve([options.from, options.to]);
    return sweepGeometry({
      path: curve,
      profile: options.profile,
      steps,
      caps: true
    });
  });
  return geometry.custom(spec, {
    name: options.name,
    material: options.material,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true
  });
}

export interface DuckPondOptions {
  readonly id: string;
  readonly name: string;
  readonly center: readonly [number, number];
  readonly radius: number;
  readonly height?: number;
  readonly shallowColor?: AuraColor;
  readonly deepColor?: AuraColor;
  readonly reducedMotion?: boolean;
}

/**
 * Registers and snapshots a calm `world.water` circular pond node without any
 * TypeScript `as` cast (`source-guards.test.ts` clean).
 */
export function buildCalmPondNode(options: DuckPondOptions): AuraSceneNode {
  const waterBuilder = world.water({
    id: options.id,
    name: options.name,
    kind: "lake",
    shape: {
      kind: "circle",
      center: [options.center[0], options.center[1]],
      radius: options.radius
    },
    height: options.height ?? 0.01,
    shallowColor: options.shallowColor ?? "#6EC1DA",
    deepColor: options.deepColor ?? "#36819E",
    waves: "calm",
    normalSpeed: options.reducedMotion ? 0 : 0.24,
    foam: {
      shoreDepth: 0.18,
      crest: 0.06
    },
    reflection: "ibl",
    refraction: false
  });
  const parsed: AuraSceneNode = JSON.parse(JSON.stringify(waterBuilder.toJSON()));
  return parsed;
}
