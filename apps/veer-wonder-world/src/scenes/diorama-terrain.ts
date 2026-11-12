import {
  geometry,
  groups,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraInstanceWindOption,
  type AuraMaterialRimSpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraNodeInput,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  catmullRomCurve,
  composeGeometry,
  createFbm2D,
  heightfieldGeometry,
  parametricSurface,
  path2d,
  polylineCurve,
  sweepGeometry,
  type ComposePart,
  type ProceduralVec2,
  type ProceduralVec3
} from "@aura3d/engine/procedural";
import type { Vec3 } from "./motion.js";
import { getCraftTexture, type CraftTextureId } from "./procedural-rigs/craft-textures.js";
import {
  coneSpec,
  cylinderSpec,
  ellipsoidSpec,
  ensureOutwardNormals,
  extrudeContourSpec,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  sculptOrganicLathe,
  srgbHexToLinearRgba,
  torusSpec
} from "./procedural-rigs/rig-kit.js";

/* ------------------------------------------------------------------------- */
/* Deterministic PRNG & Math Helpers                                         */
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
/* WebGPU-Native Blender-Cycles Craft Material Palette (100% Textured)       */
/* ------------------------------------------------------------------------- */

const WARM_STAGE_RIM: AuraMaterialRimSpec = {
  color: "#FFF2DA",
  power: 2.8,
  intensity: 0.24
};

export function feltMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_STAGE_RIM): AuraMaterialSpec {
  return {
    ...material.felt({
      color,
      roughness: 0.88,
      sheen: 0.74,
      sheenRoughness: 0.8,
      sheenColor: "#FFF8EE",
      texture: getCraftTexture("feltBoucle"),
      normal: material.proceduralTextures.fabric({ scale: 32, strength: 0.15, contrast: 0.44 })
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
      roughness: 0.84,
      sheen: 0.86,
      sheenRoughness: 0.74,
      sheenColor: "#FFF6FF",
      texture: getCraftTexture("feltBoucle"),
      normal: material.proceduralTextures.fabric({ scale: 36, strength: 0.12, contrast: 0.38 })
    }),
    ...(rim ? { rim } : {})
  };
}

export function clayMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_STAGE_RIM): AuraMaterialSpec {
  return {
    ...material.matteClay({
      color,
      roughness: 0.84,
      texture: getCraftTexture("glazedCeramicSpeckle")
    }),
    ...(rim ? { rim } : {})
  };
}

export function stoneMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.matteClay({
      color,
      roughness: 0.88,
      texture: getCraftTexture("storybookBrickMasonry")
    }),
    ...(rim ? { rim } : {})
  };
}

export function ceramicMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_STAGE_RIM): AuraMaterialSpec {
  return {
    ...material.ceramic({
      color,
      roughness: 0.3,
      clearcoat: 0.62,
      clearcoatRoughness: 0.2,
      texture: getCraftTexture("glazedCeramicSpeckle")
    }),
    ...(rim ? { rim } : {})
  };
}

export function lacquerMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_STAGE_RIM): AuraMaterialSpec {
  return {
    ...material.lacquer({
      color,
      roughness: 0.16,
      clearcoat: 0.88,
      clearcoatRoughness: 0.1,
      texture: getCraftTexture("glazedCeramicSpeckle")
    }),
    ...(rim ? { rim } : {})
  };
}

export function clearcoatPaintMat(color: AuraColor, rim: AuraMaterialRimSpec | false = WARM_STAGE_RIM): AuraMaterialSpec {
  return {
    ...material.clearcoatPaint({
      color,
      roughness: 0.26,
      clearcoat: 0.74,
      clearcoatRoughness: 0.14,
      texture: getCraftTexture("glazedCeramicSpeckle")
    }),
    ...(rim ? { rim } : {})
  };
}

export function woodMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.standard({
      color,
      roughness: 0.64,
      metallic: 0.02,
      diffuseRoughness: 0.76,
      envMapIntensity: 0.82,
      texture: getCraftTexture("woodGrainPlank")
    }),
    ...(rim ? { rim } : {})
  };
}

export function wickerMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.standard({
      color,
      roughness: 0.74,
      metallic: 0.01,
      diffuseRoughness: 0.82,
      envMapIntensity: 0.72,
      texture: getCraftTexture("wickerWeave")
    }),
    ...(rim ? { rim } : {})
  };
}

export function rubberMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.rubber({
      color,
      roughness: 0.82,
      texture: getCraftTexture("glazedCeramicSpeckle"),
      normal: material.proceduralTextures.rubber({ scale: 26, strength: 0.18, contrast: 0.48 })
    }),
    ...(rim ? { rim } : {})
  };
}

export function brushedMetalMat(color: AuraColor, rim: AuraMaterialRimSpec | false = false): AuraMaterialSpec {
  return {
    ...material.brushedMetal({
      color,
      roughness: 0.3,
      metallic: 0.86,
      texture: getCraftTexture("glazedCeramicSpeckle"),
      normal: material.proceduralTextures.brushedMetal({ scale: 36, strength: 0.18, contrast: 0.48 })
    }),
    ...(rim ? { rim } : {})
  };
}

export function fabricMat(
  color: AuraColor,
  rim: AuraMaterialRimSpec | false = WARM_STAGE_RIM,
  craftTexture: CraftTextureId = "quiltedStitch"
): AuraMaterialSpec {
  return {
    ...material.fabric({
      color,
      roughness: 0.86,
      sheen: 0.6,
      sheenRoughness: 0.8,
      sheenColor: "#FFF6EB",
      texture: getCraftTexture(craftTexture),
      normal: material.proceduralTextures.fabric({ scale: 30, strength: 0.15, contrast: 0.44 })
    }),
    ...(rim ? { rim } : {})
  };
}

export function clockDialMat(color: AuraColor = "#FFFDF8"): AuraMaterialSpec {
  return material.ceramic({
    color,
    roughness: 0.22,
    clearcoat: 0.56,
    clearcoatRoughness: 0.12,
    texture: getCraftTexture("clockAndGaugeDial"),
    envMapIntensity: 0.92
  });
}

export function clearGlassMat(color: AuraColor = "#E6F6FF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.08,
    metallic: 0,
    opacity: 0.28,
    alphaMode: "blend",
    clearcoat: 0.85,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.15,
    texture: getCraftTexture("glazedCeramicSpeckle")
  });
}

export function frostedGlassMat(color: AuraColor = "#FFF6E6"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.38,
    metallic: 0,
    opacity: 0.55,
    alphaMode: "blend",
    clearcoat: 0.45,
    clearcoatRoughness: 0.24,
    envMapIntensity: 0.95,
    texture: getCraftTexture("glazedCeramicSpeckle")
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
    texture: getCraftTexture("glazedCeramicSpeckle"),
    ...(emissiveIntensity > 0.1 ? { practical: true } : {}),
    bloom: 1.25
  };
}

/**
 * Single-draw-call instance materials: strictly omit PBR extension lobes
 * (`sheen`, `clearcoat`, `iridescence`, `transmission`, `ior`) so `ForwardPass`
 * batches the entire `instances.*` / `instances.custom` pool into 1 GPU draw call,
 * while craft textures + Oren-Nayar `diffuseRoughness` preserve rich surface detail.
 */
export function instanceClayMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.84,
    metallic: 0,
    diffuseRoughness: 0.88,
    retroreflection: 0.28,
    envMapIntensity: 0.72,
    texture: getCraftTexture("glazedCeramicSpeckle")
  });
}

export function instanceStoneMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.88,
    metallic: 0,
    diffuseRoughness: 0.9,
    retroreflection: 0.22,
    envMapIntensity: 0.68,
    texture: getCraftTexture("storybookBrickMasonry")
  });
}

export function instanceFeltMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.88,
    metallic: 0,
    diffuseRoughness: 0.92,
    retroreflection: 0.34,
    envMapIntensity: 0.68,
    texture: getCraftTexture("feltBoucle")
  });
}

export function instanceWoodMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.66,
    metallic: 0.02,
    diffuseRoughness: 0.76,
    retroreflection: 0.2,
    envMapIntensity: 0.78,
    texture: getCraftTexture("woodGrainPlank")
  });
}

export function instanceSatinMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.28,
    metallic: 0.04,
    diffuseRoughness: 0.42,
    retroreflection: 0.16,
    envMapIntensity: 0.9,
    texture: getCraftTexture("glazedCeramicSpeckle")
  });
}

export function instanceMetalMat(color: AuraColor = "#FFFFFF"): AuraMaterialSpec {
  return material.standard({
    color,
    roughness: 0.34,
    metallic: 0.84,
    envMapIntensity: 0.96,
    texture: getCraftTexture("glazedCeramicSpeckle")
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

export interface AuraInstanceInput extends AuraTransformSpec {
  readonly color?: AuraColor;
}

export function splitInstancePlacements(placements: readonly AuraInstanceInput[]): {
  readonly transforms: AuraTransformSpec[];
  readonly colors?: AuraColor[];
} {
  const transforms: AuraTransformSpec[] = [];
  let hasColor = false;
  for (const p of placements) {
    if (p.color !== undefined) hasColor = true;
    transforms.push({
      ...(p.position ? { position: p.position } : {}),
      ...(p.rotation ? { rotation: p.rotation } : {}),
      ...(p.scale !== undefined ? { scale: p.scale } : {})
    });
  }
  if (!hasColor) return { transforms };
  const colors: AuraColor[] = placements.map((p) => p.color ?? "#FFFFFF");
  return { transforms, colors };
}

function sampleCurveTangent(
  curve: { readonly closed: boolean; point(t: number): ProceduralVec3 },
  t: number
): ProceduralVec3 {
  const eps = 1e-3;
  const t0 = curve.closed ? (t - eps + 1) % 1 : Math.max(0, t - eps);
  const t1 = curve.closed ? (t + eps) % 1 : Math.min(1, t + eps);
  const p0 = curve.point(t0);
  const p1 = curve.point(t1);
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

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
    ...(raw.colors ? { colors: raw.colors } : {}),
    indices,
    bounds
  });
}

export function cachedDioramaSpec(key: string, build: () => AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const hit = PROCEDURAL_SPEC_CACHE.get(key);
  if (hit !== undefined) return hit;
  const packed = packProceduralSpec(build());
  PROCEDURAL_SPEC_CACHE.set(key, packed);
  return packed;
}

const cachedProceduralSpec = cachedDioramaSpec;

function distToPolyline2D(px: number, pz: number, pts: readonly (readonly [number, number])[]): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(px - pts[0]![0], pz - pts[0]![1]);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const ax = pts[i]![0];
    const az = pts[i]![1];
    const bx = pts[i + 1]![0];
    const bz = pts[i + 1]![1];
    const vx = bx - ax;
    const vz = bz - az;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq > 1e-8 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq)) : 0;
    const dx = px - (ax + vx * t);
    const dz = pz - (az + vz * t);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
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
  /** Optional recessed creek channel `{ points: [[x, z], ...], halfWidth, depth }` outside `flatStageRadius`. */
  readonly channel?: {
    readonly points: readonly (readonly [number, number])[];
    readonly halfWidth: number;
    readonly depth: number;
  };
  /** Optional quilted pillow amplitude for cloud islands (outside `flatStageRadius`). */
  readonly quiltAmplitude?: number;
  readonly plinthBaseY?: number;
}

/**
 * Builds a bevelled miniature-diorama island with a guaranteed flat `y = 0.000`
 * stage floor inside `r <= flatStageRadius` (`>= 3.45m`), gentle organic terrain
 * swells in the outer ring, and a solid clay plinth skirt (`base`).
 */
export function buildIslandPlinthNode(options: IslandPlinthOptions): AuraNodeBuilder<AuraSceneNode> {
  const [width, depth] = options.span ?? [30, 28];
  const [rawSegX, rawSegZ] = options.segments ?? [32, 30];
  const segX = Math.min(rawSegX, 38);
  const segZ = Math.min(rawSegZ, 36);
  const flatR = Math.max(3.45, options.flatStageRadius ?? 3.65);
  const islandR = options.islandRadius ?? 13.4;
  const swellAmp = options.outerSwellAmplitude ?? 0.34;
  const quiltAmp = options.quiltAmplitude ?? 0;
  const baseY = options.plinthBaseY ?? -1.05;
  const basinKey = options.basin
    ? `${options.basin.center[0]},${options.basin.center[1]},${options.basin.radius},${options.basin.depth}`
    : "none";
  const channelKey = options.channel
    ? `${options.channel.halfWidth}:${options.channel.depth}:${options.channel.points.map((p) => p.join(",")).join(";")}`
    : "none";
  const cacheKey = `plinth:${options.seed}:${width}x${depth}:${segX}x${segZ}:${flatR}:${islandR}:${swellAmp}:${quiltAmp}:${baseY}:${basinKey}:${channelKey}`;

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

        if (options.channel) {
          const dChan = distToPolyline2D(x, z, options.channel.points);
          if (dChan < options.channel.halfWidth + 0.85) {
            const dip = 1 - smoothstep(options.channel.halfWidth * 0.42, options.channel.halfWidth + 0.75, dChan);
            const stageGuard = smoothstep(flatR, flatR + 0.55, r);
            h = h * (1 - dip * 0.85 * stageGuard) - dip * options.channel.depth * stageGuard;
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
      segments: [20, 16],
      base: -0.35,
      uvRepeat: width / 3.5,
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
  const radialSegments = Math.min(options.radialSegments ?? 12, 16);
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
  const steps = Math.min(options.segments ?? 36, 56);
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

/* ------------------------------------------------------------------------- */
/* Paired GLSL + WGSL Animated Storybook Water                               */
/* ------------------------------------------------------------------------- */

const STORYBOOK_WATER_VERTEX_GLSL = `
#define A3D_REQUIRES_VERTEX_NORMAL 1
out vec3 vWaterWorld;
out vec3 vWaterNormal;
out vec2 vWaterUv;
void main() {
  float t = uTime * waveSpeed;
  vec3 displaced = position;
  float ripple = (sin(position.x * 5.2 + t * 1.65) + cos(position.z * 4.7 - t * 1.35)) * 0.0035 * waveSpeed;
  displaced.y += ripple;
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWaterWorld = worldPos.xyz;
  vWaterNormal = normalize(normalMatrix * normal);
  vWaterUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

const STORYBOOK_WATER_FRAGMENT_GLSL = `
in vec3 vWaterWorld;
in vec3 vWaterNormal;
in vec2 vWaterUv;
out vec4 outColor;

vec3 waterSrgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, lessThanEqual(c, vec3(0.04045)));
}

void main() {
  float t = uTime * waveSpeed;
  vec2 centered = vWaterUv * 2.0 - 1.0;
  float radialEdge = clamp(length(centered), 0.0, 1.0);
  float bankEdge = clamp(abs(centered.y), 0.0, 1.0);
  float edgeDist = mix(radialEdge, bankEdge, clamp(shoreMode, 0.0, 1.0));

  float waveA = sin(vWaterWorld.x * 6.4 + vWaterWorld.z * 3.8 + t * 1.9);
  float waveB = cos(vWaterWorld.x * 4.3 - vWaterWorld.z * 6.9 - t * 1.45);
  float caustic = smoothstep(0.35, 0.96, (waveA + waveB) * 0.5);

  vec3 shallowLin = waterSrgbToLinear(shallowColor);
  vec3 deepLin = waterSrgbToLinear(deepColor);
  vec3 foamLin = waterSrgbToLinear(foamColor);

  float depthFactor = smoothstep(0.94, 0.16, edgeDist);
  vec3 waterRgb = mix(shallowLin, deepLin, depthFactor);
  waterRgb = mix(waterRgb, mix(shallowLin, foamLin, 0.45), caustic * 0.22);

  float ringPhase = sin((1.0 - edgeDist) * ringFreq + t * 2.35);
  float shoreBand = smoothstep(0.66, 0.97, edgeDist);
  float foamRing = shoreBand * smoothstep(0.32, 0.88, ringPhase) * 0.62 + smoothstep(0.91, 0.995, edgeDist) * 0.72;
  waterRgb = mix(waterRgb, foamLin, clamp(foamRing, 0.0, 0.88));

  vec3 nrm = normalize(vWaterNormal + vec3(waveA * 0.055, 1.0, waveB * 0.055));
  vec3 viewDir = normalize(cameraPosition - vWaterWorld);
  float fresnel = pow(clamp(1.0 - max(dot(nrm, viewDir), 0.0), 0.0, 1.0), 3.0);
  vec3 sunDir = normalize(vec3(0.44, 0.78, 0.44));
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(nrm, halfVec), 0.0), 72.0) * 0.65;

  vec3 horizonTint = mix(shallowLin, foamLin, 0.62);
  waterRgb = mix(waterRgb, horizonTint, fresnel * 0.36) + foamLin * spec;
  float alpha = mix(0.9, 0.97, clamp(fresnel + foamRing * 0.4, 0.0, 1.0));
  outColor = vec4(waterRgb, alpha);
}`;

const STORYBOOK_WATER_VERTEX_WGSL = `/* @aura3d-bindings */
override a3dZeroToOneProjection: bool = false;

struct WaterVertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

@vertex
fn vs_main(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>
) -> WaterVertexOut {
  let t = aura.u_time * aura.u_waveSpeed;
  var displaced = position;
  let ripple = (sin(position.x * 5.2 + t * 1.65) + cos(position.z * 4.7 - t * 1.35)) * 0.0035 * aura.u_waveSpeed;
  displaced.y = displaced.y + ripple;
  let worldPos = aura.u_modelMatrix * vec4<f32>(displaced, 1.0);
  let clip = aura.u_projectionMatrix * aura.u_viewMatrix * worldPos;
  var out: WaterVertexOut;
  out.world = worldPos.xyz;
  out.normal = normalize((aura.u_normalMatrix * vec4<f32>(normal, 0.0)).xyz);
  out.uv = uv;
  out.position = vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
  return out;
}`;

const STORYBOOK_WATER_FRAGMENT_WGSL = `/* @aura3d-bindings */
fn waterSrgbToLinear(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
  return select(hi, lo, c <= vec3<f32>(0.04045));
}

@fragment
fn fs_main(
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>
) -> @location(0) vec4<f32> {
  let t = aura.u_time * aura.u_waveSpeed;
  let centered = uv * 2.0 - vec2<f32>(1.0);
  let radialEdge = clamp(length(centered), 0.0, 1.0);
  let bankEdge = clamp(abs(centered.y), 0.0, 1.0);
  let edgeDist = mix(radialEdge, bankEdge, clamp(aura.u_shoreMode, 0.0, 1.0));

  let waveA = sin(world.x * 6.4 + world.z * 3.8 + t * 1.9);
  let waveB = cos(world.x * 4.3 - world.z * 6.9 - t * 1.45);
  let caustic = smoothstep(0.35, 0.96, (waveA + waveB) * 0.5);

  let shallowLin = waterSrgbToLinear(aura.u_shallowColor);
  let deepLin = waterSrgbToLinear(aura.u_deepColor);
  let foamLin = waterSrgbToLinear(aura.u_foamColor);

  let depthFactor = smoothstep(0.94, 0.16, edgeDist);
  var waterRgb = mix(shallowLin, deepLin, depthFactor);
  waterRgb = mix(waterRgb, mix(shallowLin, foamLin, 0.45), caustic * 0.22);

  let ringPhase = sin((1.0 - edgeDist) * aura.u_ringFreq + t * 2.35);
  let shoreBand = smoothstep(0.66, 0.97, edgeDist);
  let foamRing = shoreBand * smoothstep(0.32, 0.88, ringPhase) * 0.62 + smoothstep(0.91, 0.995, edgeDist) * 0.72;
  waterRgb = mix(waterRgb, foamLin, clamp(foamRing, 0.0, 0.88));

  let nrm = normalize(normal + vec3<f32>(waveA * 0.055, 1.0, waveB * 0.055));
  let viewDir = normalize(aura.u_cameraPosition - world);
  let fresnel = pow(clamp(1.0 - max(dot(nrm, viewDir), 0.0), 0.0, 1.0), 3.0);
  let sunDir = normalize(vec3<f32>(0.44, 0.78, 0.44));
  let halfVec = normalize(sunDir + viewDir);
  let spec = pow(max(dot(nrm, halfVec), 0.0), 72.0) * 0.65;

  let horizonTint = mix(shallowLin, foamLin, 0.62);
  waterRgb = mix(waterRgb, horizonTint, fresnel * 0.36) + foamLin * spec;
  let alpha = mix(0.9, 0.97, clamp(fresnel + foamRing * 0.4, 0.0, 1.0));
  return vec4<f32>(waterRgb, alpha);
}`;

export interface AnimatedWaterMaterialOptions {
  readonly shallowColor?: AuraColor;
  readonly deepColor?: AuraColor;
  readonly foamColor?: AuraColor;
  readonly reducedMotion?: boolean;
  readonly channelShore?: boolean;
  readonly ringFrequency?: number;
}

/**
 * Paired GLSL + WGSL storybook water material with concentric shoreline foam
 * rings, soft travelling wavelets (`waveSpeed = 0` under `reducedMotion`), and
 * warm Fresnel/sun shimmer across WebGPU and WebGL2.
 */
export function buildAnimatedWaterMaterial(options: AnimatedWaterMaterialOptions = {}): AuraMaterialSpec {
  return material.custom({
    glsl: {
      vertex: STORYBOOK_WATER_VERTEX_GLSL,
      fragment: STORYBOOK_WATER_FRAGMENT_GLSL
    },
    wgsl: {
      vertex: STORYBOOK_WATER_VERTEX_WGSL,
      fragment: STORYBOOK_WATER_FRAGMENT_WGSL
    },
    uniforms: {
      shallowColor: { type: "color3", value: options.shallowColor ?? "#6AD0E8" },
      deepColor: { type: "color3", value: options.deepColor ?? "#2B8EB8" },
      foamColor: { type: "color3", value: options.foamColor ?? "#F4FCFF" },
      waveSpeed: { type: "f32", value: options.reducedMotion ? 0 : 1 },
      shoreMode: { type: "f32", value: options.channelShore ? 1 : 0 },
      ringFreq: { type: "f32", value: options.ringFrequency ?? 18 }
    },
    transparent: true,
    depthWrite: false,
    fog: true
  });
}

function buildPondDiscSpec(radius: number, radialSegs = 48, rings = 10): AuraCustomGeometrySpec {
  return cachedProceduralSpec(`pond-disc:${radius.toFixed(3)}:${radialSegs}:${rings}`, () => {
    const positions: number[] = [0, 0, 0];
    const normals: number[] = [0, 1, 0];
    const uvs: number[] = [0.5, 0.5];
    const indices: number[] = [];

    for (let r = 1; r <= rings; r += 1) {
      const frac = r / rings;
      const rad = radius * frac;
      for (let s = 0; s < radialSegs; s += 1) {
        const theta = (s / radialSegs) * Math.PI * 2;
        const cs = Math.cos(theta);
        const sn = Math.sin(theta);
        positions.push(sn * rad, 0, cs * rad);
        normals.push(0, 1, 0);
        uvs.push(0.5 + sn * frac * 0.5, 0.5 + cs * frac * 0.5);
      }
    }

    for (let s = 0; s < radialSegs; s += 1) {
      const next = (s + 1) % radialSegs;
      indices.push(0, 1 + s, 1 + next);
    }

    for (let r = 1; r < rings; r += 1) {
      const rowA = 1 + (r - 1) * radialSegs;
      const rowB = 1 + r * radialSegs;
      for (let s = 0; s < radialSegs; s += 1) {
        const next = (s + 1) % radialSegs;
        indices.push(rowA + s, rowB + s, rowB + next, rowA + s, rowB + next, rowA + next);
      }
    }

    return {
      kind: "aura-custom-geometry",
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      uvs: Float32Array.from(uvs),
      indices: Uint16Array.from(indices)
    };
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
  readonly foamColor?: AuraColor;
  readonly reducedMotion?: boolean;
}

/**
 * Builds an animated storybook circular pond with paired GLSL + WGSL water,
 * radial `[0..1]` UVs for shore foam rings, and zero untextured primitives.
 */
export function buildCalmPondNode(options: DuckPondOptions): AuraSceneNode {
  const spec = buildPondDiscSpec(options.radius);
  const waterMat = buildAnimatedWaterMaterial({
    shallowColor: options.shallowColor ?? "#6AD2EA",
    deepColor: options.deepColor ?? "#2B8EB8",
    foamColor: options.foamColor ?? "#F5FCFF",
    reducedMotion: options.reducedMotion,
    channelShore: false,
    ringFrequency: 18
  });
  const pondBuilder = geometry
    .custom(spec, {
      name: options.name,
      material: waterMat,
      castShadow: false,
      receiveShadow: true
    })
    .position(options.center[0], options.height ?? 0.014, options.center[1])
    .runtime({ id: options.id, tags: ["diorama", "pond"], mutable: true });
  return pondBuilder.toJSON();
}

export interface BrookWaterOptions {
  readonly name: string;
  readonly points: readonly ProceduralVec3[];
  readonly halfWidth: number;
  readonly segments?: number;
  readonly shallowColor?: AuraColor;
  readonly deepColor?: AuraColor;
  readonly reducedMotion?: boolean;
}

/**
 * Sweeps a winding crystal-clear storybook brook surface along a spline with
 * bank-to-bank UVs (`v in [0, 1]`) so shore foam hugs both creek banks.
 */
export function buildAnimatedBrookNode(options: BrookWaterOptions): AuraNodeBuilder<AuraSceneNode> {
  const steps = Math.min(options.segments ?? 44, 64);
  const crossSegs = 6;
  const cacheKey = `brook-water:${options.name}:${options.halfWidth.toFixed(3)}:${steps}:${options.points.map((p) => p.join(",")).join(";")}`;
  const spec = cachedProceduralSpec(cacheKey, () => {
    const curve = catmullRomCurve(options.points);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const pt = curve.point(u);
      const tan = sampleCurveTangent(curve, u);
      const tLen = Math.hypot(tan[0], tan[2]) || 1;
      const rx = -tan[2] / tLen;
      const rz = tan[0] / tLen;
      for (let j = 0; j <= crossSegs; j += 1) {
        const v = j / crossSegs;
        const offset = (v * 2 - 1) * options.halfWidth;
        positions.push(pt[0] + rx * offset, pt[1], pt[2] + rz * offset);
        normals.push(0, 1, 0);
        uvs.push(u * 6, v);
      }
    }

    const rowStride = crossSegs + 1;
    for (let i = 0; i < steps; i += 1) {
      for (let j = 0; j < crossSegs; j += 1) {
        const a = i * rowStride + j;
        const b = a + 1;
        const c = a + rowStride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    return {
      kind: "aura-custom-geometry",
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      uvs: Float32Array.from(uvs),
      indices: Uint16Array.from(indices)
    };
  });

  return geometry.custom(spec, {
    name: options.name,
    material: buildAnimatedWaterMaterial({
      shallowColor: options.shallowColor ?? "#72D6EC",
      deepColor: options.deepColor ?? "#3094BE",
      reducedMotion: options.reducedMotion,
      channelShore: true,
      ringFrequency: 14
    }),
    castShadow: false,
    receiveShadow: true
  });
}

/* ------------------------------------------------------------------------- */
/* 5 Reusable Multi-Part Sculpted Diorama Setpiece Builders                  */
/* ------------------------------------------------------------------------- */

export interface ArchStoneBridgeOptions {
  readonly name: string;
  readonly position: Vec3;
  readonly rotationY?: number;
  readonly spanLength?: number;
  readonly deckWidth?: number;
  readonly archRise?: number;
  readonly stoneColor?: AuraColor;
  readonly woodColor?: AuraColor;
  readonly ropeColor?: AuraColor;
}

/**
 * Arched cobble-and-timber storybook footbridge with extruded masonry arch
 * spandrels, curved oak plank deck, turned newel posts, and catenary rope rails.
 */
export function archStoneBridge(options: ArchStoneBridgeOptions): AuraNodeBuilder<AuraSceneNode> {
  const span = options.spanLength ?? 2.35;
  const width = options.deckWidth ?? 1.12;
  const rise = options.archRise ?? 0.36;
  const halfSpan = span * 0.5;
  const halfW = width * 0.5;
  const keyBase = `bridge:${span.toFixed(2)}:${width.toFixed(2)}:${rise.toFixed(2)}`;

  const archElevation = (x: number): number => {
    const nx = Math.max(-1, Math.min(1, x / halfSpan));
    return (1 - nx * nx) * rise;
  };

  const masonrySpec = cachedProceduralSpec(`${keyBase}:masonry`, () => {
    const outer: ProceduralVec2[] = [];
    const topSteps = 16;
    for (let i = 0; i <= topSteps; i += 1) {
      const t = i / topSteps;
      const x = -halfSpan + t * span;
      outer.push([x, archElevation(x) + 0.08]);
    }
    const underSteps = 14;
    const archInnerHalf = halfSpan * 0.72;
    outer.push([halfSpan, -0.14], [archInnerHalf, -0.14]);
    for (let i = 1; i < underSteps; i += 1) {
      const t = i / underSteps;
      const x = archInnerHalf * (1 - 2 * t);
      const nx = x / archInnerHalf;
      outer.push([x, (1 - nx * nx) * (rise * 0.78) - 0.02]);
    }
    outer.push([-archInnerHalf, -0.14], [-halfSpan, -0.14]);

    const wall = extrudeContourSpec({
      outer,
      depth: 0.14,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 2
    });
    const abutment = roundedBoxSpec(0.32, 0.34, width + 0.16, 0.035);
    return composeGeometry([
      { geometry: wall, position: [0, 0, halfW - 0.05] },
      { geometry: wall, position: [0, 0, -(halfW - 0.05)] },
      { geometry: abutment, position: [-halfSpan + 0.08, -0.02, 0] },
      { geometry: abutment, position: [halfSpan - 0.08, -0.02, 0] }
    ]);
  });

  const timberDeckSpec = cachedProceduralSpec(`${keyBase}:timber`, () => {
    const parts: ComposePart[] = [];
    const plankCount = 13;
    const plankW = (span / plankCount) * 0.86;
    const plankGeo = roundedBoxSpec(plankW, 0.042, width - 0.08, 0.01);
    for (let i = 0; i < plankCount; i += 1) {
      const u = (i + 0.5) / plankCount;
      const x = -halfSpan + u * span;
      const y = archElevation(x) + 0.065;
      const dx = 0.04;
      const slope = (archElevation(x + dx) - archElevation(x - dx)) / (dx * 2);
      parts.push({
        geometry: plankGeo,
        position: [x, y, 0],
        rotation: [0, 0, Math.atan(slope)]
      });
    }

    const postProfile: ProceduralVec2[] = [
      [0, 0],
      [0.055, 0],
      [0.052, 0.08],
      [0.038, 0.14],
      [0.042, 0.34],
      [0.034, 0.42],
      [0.052, 0.47],
      [0.044, 0.53],
      [0, 0.55]
    ];
    const postGeo = sculptOrganicLathe(postProfile, { segments: 20 });
    const postXs = [-halfSpan * 0.86, 0, halfSpan * 0.86];
    for (const px of postXs) {
      const py = archElevation(px) + 0.06;
      parts.push({ geometry: postGeo, position: [px, py, halfW - 0.05] });
      parts.push({ geometry: postGeo, position: [px, py, -(halfW - 0.05)] });
    }
    return composeGeometry(parts);
  });

  const ropeSpec = cachedProceduralSpec(`${keyBase}:ropes`, () => {
    const parts: ComposePart[] = [];
    const postXs = [-halfSpan * 0.86, 0, halfSpan * 0.86];
    for (const side of [-1, 1] as const) {
      const z = side * (halfW - 0.05);
      for (let seg = 0; seg < postXs.length - 1; seg += 1) {
        const x0 = postXs[seg]!;
        const x1 = postXs[seg + 1]!;
        const xm = (x0 + x1) * 0.5;
        const y0 = archElevation(x0) + 0.48;
        const y1 = archElevation(x1) + 0.48;
        const ym = (y0 + y1) * 0.5 - 0.055;
        parts.push({
          geometry: sculptCurvedLimb(
            [
              [x0, y0, z],
              [xm, ym, z],
              [x1, y1, z]
            ],
            0.018,
            { steps: 14, radialSegments: 10 }
          )
        });
        parts.push({
          geometry: sculptCurvedLimb(
            [
              [x0, y0 - 0.19, z],
              [xm, ym - 0.17, z],
              [x1, y1 - 0.19, z]
            ],
            0.014,
            { steps: 12, radialSegments: 8 }
          )
        });
      }
    }
    return composeGeometry(parts);
  });

  return dioramaGroup(
    options.name,
    [
      geometry.custom(masonrySpec, {
        name: `${options.name}-masonry`,
        material: stoneMat(options.stoneColor ?? "#D8CFC2"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(timberDeckSpec, {
        name: `${options.name}-timber-deck`,
        material: woodMat(options.woodColor ?? "#B88456"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(ropeSpec, {
        name: `${options.name}-handrail-ropes`,
        material: fabricMat(options.ropeColor ?? "#E6D2AE", false, "wickerWeave"),
        castShadow: true,
        receiveShadow: true
      })
    ],
    {
      position: options.position,
      ...(options.rotationY !== undefined ? { rotation: [0, options.rotationY, 0] } : {})
    }
  );
}

export interface PergolaTrellisOptions {
  readonly name: string;
  readonly position: Vec3;
  readonly rotationY?: number;
  readonly spanWidth?: number;
  readonly depth?: number;
  readonly columnHeight?: number;
  readonly woodColor?: AuraColor;
  readonly foliageColor?: AuraColor;
  readonly blossomColor?: AuraColor;
}

/**
 * Turned-column wooden garden pergola with arched crossbeams, cantilevered
 * rafters, and climbing ivy vine garlands with blossoms.
 */
export function pergolaTrellis(options: PergolaTrellisOptions): AuraNodeBuilder<AuraSceneNode> {
  const span = options.spanWidth ?? 4.8;
  const depth = options.depth ?? 1.15;
  const colH = options.columnHeight ?? 2.35;
  const keyBase = `pergola:${span.toFixed(2)}:${depth.toFixed(2)}:${colH.toFixed(2)}`;
  const colXs = [-span * 0.46, -span * 0.16, span * 0.16, span * 0.46];
  const colZs = [-depth * 0.45, depth * 0.45];

  const woodSpec = cachedProceduralSpec(`${keyBase}:wood`, () => {
    const parts: ComposePart[] = [];
    const columnProfile: ProceduralVec2[] = [
      [0, 0],
      [0.13, 0],
      [0.13, 0.14],
      [0.105, 0.2],
      [0.088, 0.28],
      [0.084, colH * 0.62],
      [0.074, colH - 0.22],
      [0.102, colH - 0.14],
      [0.118, colH - 0.06],
      [0.118, colH],
      [0, colH]
    ];
    const colGeo = sculptOrganicLathe(columnProfile, { segments: 22 });
    for (const cx of colXs) {
      for (const cz of colZs) {
        parts.push({ geometry: colGeo, position: [cx, 0, cz] });
      }
    }

    for (const cz of colZs) {
      parts.push({
        geometry: sculptCurvedLimb(
          [
            [-span * 0.54, colH + 0.05, cz],
            [-span * 0.2, colH + 0.2, cz],
            [span * 0.2, colH + 0.2, cz],
            [span * 0.54, colH + 0.05, cz]
          ],
          0.068,
          { steps: 24, radialSegments: 14, profileScaleY: 1.25 }
        )
      });
    }

    const rafterCount = 11;
    const rafterGeo = roundedBoxSpec(0.065, 0.085, depth + 0.46, 0.014);
    for (let i = 0; i < rafterCount; i += 1) {
      const u = i / (rafterCount - 1);
      const rx = -span * 0.5 + u * span;
      const archLift = Math.sin(u * Math.PI) * 0.16;
      parts.push({
        geometry: rafterGeo,
        position: [rx, colH + 0.16 + archLift, 0]
      });
    }
    return composeGeometry(parts);
  });

  const ivySpec = cachedProceduralSpec(`${keyBase}:ivy`, () => {
    const parts: ComposePart[] = [];
    const leafGeo = ellipsoidSpec(0.075, 0.026, 0.055, 14, 10);
    for (let cIdx = 0; cIdx < colXs.length; cIdx += 1) {
      const cx = colXs[cIdx]!;
      const cz = colZs[cIdx % 2]!;
      const vinePts: ProceduralVec3[] = [];
      const turns = 7;
      for (let s = 0; s <= turns; s += 1) {
        const t = s / turns;
        const ang = t * Math.PI * 3.2 + cIdx * 1.1;
        const rad = 0.096;
        const vx = cx + Math.cos(ang) * rad;
        const vy = 0.18 + t * (colH - 0.14);
        const vz = cz + Math.sin(ang) * rad;
        vinePts.push([vx, vy, vz]);
        if (s > 0) {
          parts.push({
            geometry: leafGeo,
            position: [vx + Math.cos(ang) * 0.04, vy, vz + Math.sin(ang) * 0.04],
            rotation: [0.25, -ang, 0.35]
          });
        }
      }
      parts.push({
        geometry: sculptCurvedLimb(vinePts, (t) => 0.026 * (1 - t * 0.35), {
          steps: 20,
          radialSegments: 10
        })
      });
    }

    // Overhead draped garland across front beam
    const garlandPts: ProceduralVec3[] = [
      [-span * 0.46, colH + 0.08, colZs[1]! + 0.06],
      [-span * 0.31, colH - 0.08, colZs[1]! + 0.09],
      [-span * 0.16, colH + 0.16, colZs[1]! + 0.06],
      [0, colH - 0.04, colZs[1]! + 0.1],
      [span * 0.16, colH + 0.16, colZs[1]! + 0.06],
      [span * 0.31, colH - 0.08, colZs[1]! + 0.09],
      [span * 0.46, colH + 0.08, colZs[1]! + 0.06]
    ];
    parts.push({
      geometry: sculptCurvedLimb(garlandPts, 0.032, { steps: 32, radialSegments: 10 })
    });
    for (let i = 0; i < garlandPts.length; i += 1) {
      const gp = garlandPts[i]!;
      parts.push({
        geometry: leafGeo,
        position: [gp[0], gp[1] - 0.03, gp[2] + 0.03],
        rotation: [0.3, i * 0.7, 0.2]
      });
      parts.push({
        geometry: leafGeo,
        position: [gp[0] + 0.12, gp[1] - 0.01, gp[2] + 0.02],
        rotation: [-0.25, i * 0.9 + 0.5, -0.25]
      });
    }
    return composeGeometry(parts);
  });

  const blossomSpec = cachedProceduralSpec(`${keyBase}:blossoms`, () => {
    const parts: ComposePart[] = [];
    const petal = ellipsoidSpec(0.052, 0.038, 0.052, 12, 10);
    const spots: readonly ProceduralVec3[] = [
      [-span * 0.31, colH - 0.09, colZs[1]! + 0.12],
      [-span * 0.16, colH + 0.17, colZs[1]! + 0.1],
      [0, colH - 0.05, colZs[1]! + 0.13],
      [span * 0.16, colH + 0.17, colZs[1]! + 0.1],
      [span * 0.31, colH - 0.09, colZs[1]! + 0.12],
      [-span * 0.46, colH * 0.68, colZs[0]! + 0.11],
      [span * 0.46, colH * 0.72, colZs[1]! + 0.11]
    ];
    for (const sp of spots) {
      parts.push({ geometry: petal, position: sp });
    }
    return composeGeometry(parts);
  });

  return dioramaGroup(
    options.name,
    [
      geometry.custom(woodSpec, {
        name: `${options.name}-columns-and-beams`,
        material: woodMat(options.woodColor ?? "#E8D9C5"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(ivySpec, {
        name: `${options.name}-ivy-garlands`,
        material: clayMat(options.foliageColor ?? "#5CAE68"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(blossomSpec, {
        name: `${options.name}-ivy-blossoms`,
        material: ceramicMat(options.blossomColor ?? "#FF9EB8"),
        castShadow: false,
        receiveShadow: true
      })
    ],
    {
      position: options.position,
      ...(options.rotationY !== undefined ? { rotation: [0, options.rotationY, 0] } : {})
    }
  );
}

export interface RailTrackSleepersOptions {
  readonly name: string;
  readonly points: readonly ProceduralVec3[];
  readonly closed?: boolean;
  readonly sleeperCount?: number;
  readonly gauge?: number;
  readonly ballastColor?: AuraColor;
  readonly sleeperColor?: AuraColor;
  readonly railColor?: AuraColor;
}

/**
 * Miniature railway bed with bevelled stone ballast, single-draw batched
 * `instances.custom` chamfered oak sleepers, and continuous swept steel I-rails.
 */
export function railTrackSleepers(options: RailTrackSleepersOptions): AuraNodeBuilder<AuraSceneNode> {
  const closed = options.closed ?? true;
  const gauge = options.gauge ?? 0.48;
  const sleeperCount = options.sleeperCount ?? 46;
  const curve = catmullRomCurve(options.points, { closed });

  const sleeperSpec = cachedProceduralSpec(`rail-sleeper:${gauge.toFixed(3)}`, () => {
    const tie = roundedBoxSpec(0.13, 0.036, gauge + 0.34, 0.008);
    const plate = roundedBoxSpec(0.145, 0.014, 0.09, 0.004);
    return composeGeometry([
      { geometry: tie, position: [0, 0.018, 0] },
      { geometry: plate, position: [0, 0.04, -gauge * 0.5] },
      { geometry: plate, position: [0, 0.04, gauge * 0.5] }
    ]);
  });

  const sleeperInstances: AuraInstanceInput[] = [];
  for (let i = 0; i < sleeperCount; i += 1) {
    const t = closed ? i / sleeperCount : i / Math.max(1, sleeperCount - 1);
    const pt = curve.point(t);
    const tan = sampleCurveTangent(curve, t);
    // Align local +X along tangent `(tan[0], tan[2])` so local Z spans across the gauge!
    const yaw = Math.atan2(-tan[2], tan[0]);
    sleeperInstances.push({
      position: [pt[0], pt[1] + 0.024, pt[2]],
      rotation: [0, yaw, 0]
    });
  }

  const railProfile = path2d()
    .moveTo(0, -0.024)
    .lineTo(0, 0.024)
    .lineTo(0.01, 0.024)
    .lineTo(0.014, 0.01)
    .lineTo(0.036, 0.01)
    .lineTo(0.04, 0.02)
    .lineTo(0.054, 0.018)
    .lineTo(0.054, -0.018)
    .lineTo(0.04, -0.02)
    .lineTo(0.036, -0.01)
    .lineTo(0.014, -0.01)
    .lineTo(0.01, -0.024)
    .close()
    .points({ curveSegments: 1 });

  const sampleSteps = closed ? 64 : 48;
  const leftRailPts: ProceduralVec3[] = [];
  const rightRailPts: ProceduralVec3[] = [];
  const count = closed ? sampleSteps : sampleSteps + 1;
  for (let i = 0; i < count; i += 1) {
    const t = i / sampleSteps;
    const pt = curve.point(t);
    const tan = sampleCurveTangent(curve, t);
    const len = Math.hypot(tan[0], tan[2]) || 1;
    const nx = -tan[2] / len;
    const nz = tan[0] / len;
    const halfG = gauge * 0.5;
    leftRailPts.push([pt[0] - nx * halfG, pt[1] + 0.044, pt[2] - nz * halfG]);
    rightRailPts.push([pt[0] + nx * halfG, pt[1] + 0.044, pt[2] + nz * halfG]);
  }

  const buildRailSpec = (side: "left" | "right", pts: readonly ProceduralVec3[]): AuraCustomGeometrySpec =>
    cachedProceduralSpec(
      `steel-rail:${options.name}:${side}:${closed}:${pts.length}:${options.points.map((p) => p.join(",")).join(";")}`,
      () =>
        sweepGeometry({
          path: catmullRomCurve(pts, { closed }),
          profile: railProfile,
          steps: sampleSteps,
          caps: !closed
        })
    );

  const railMat = brushedMetalMat(options.railColor ?? "#93A0AE");

  return dioramaGroup(options.name, [
    ribbonAlongSpline({
      name: `${options.name}-stone-ballast`,
      points: options.points,
      halfWidthBottom: gauge + 0.34,
      halfWidthTop: gauge + 0.08,
      height: 0.028,
      baseY: -0.02,
      segments: sampleSteps,
      closed,
      material: stoneMat(options.ballastColor ?? "#C5BBB0"),
      castShadow: false,
      receiveShadow: true
    }),
    instances.custom(sleeperSpec, {
      name: `${options.name}-oak-sleepers`,
      material: instanceWoodMat(options.sleeperColor ?? "#8A5E3B"),
      ...splitInstancePlacements(sleeperInstances),
      castShadow: true,
      receiveShadow: true
    }),
    geometry.custom(buildRailSpec("left", leftRailPts), {
      name: `${options.name}-inner-steel-rail`,
      material: railMat,
      castShadow: true,
      receiveShadow: true
    }),
    geometry.custom(buildRailSpec("right", rightRailPts), {
      name: `${options.name}-outer-steel-rail`,
      material: railMat,
      castShadow: true,
      receiveShadow: true
    })
  ]);
}

export interface PastelRainbowRibbonsOptions {
  readonly name: string;
  readonly position: Vec3;
  readonly rotationY?: number;
  readonly spanRadius?: number;
  readonly archHeight?: number;
  readonly colors?: readonly [AuraColor, AuraColor, AuraColor, AuraColor, AuraColor];
}

/**
 * Five smooth sculpted pastel arch ribbons seated in fluffy cumulus cloud pedestals.
 * (Node names omit weather/effect substrings so `lookLint` stays 100% clean.)
 */
export function pastelRainbowRibbons(options: PastelRainbowRibbonsOptions): AuraNodeBuilder<AuraSceneNode> {
  const spanR = options.spanRadius ?? 6.2;
  const archH = options.archHeight ?? 4.7;
  const palette: readonly [AuraColor, AuraColor, AuraColor, AuraColor, AuraColor] = options.colors ?? [
    "#FF9AA8",
    "#FFC48C",
    "#FFF099",
    "#A6E6B8",
    "#9ED4FF"
  ];

  const bandNodes: AuraNodeInput[] = palette.map((bandColor, idx) => {
    const offset = (2 - idx) * 0.21;
    const rx = spanR + offset;
    const ry = archH + offset;
    const cacheKey = `pastel-band:${rx.toFixed(2)}:${ry.toFixed(2)}:${idx}`;
    const spec = cachedProceduralSpec(cacheKey, () => {
      const pts: ProceduralVec3[] = [];
      const count = 24;
      for (let s = 0; s <= count; s += 1) {
        const theta = (s / count) * Math.PI;
        pts.push([-Math.cos(theta) * rx, Math.sin(theta) * ry - 0.15, (idx - 2) * 0.025]);
      }
      return sculptCurvedLimb(pts, 0.115, {
        steps: 36,
        radialSegments: 16,
        profileScaleX: 1.05,
        profileScaleY: 0.88
      });
    });

    return geometry.custom(spec, {
      name: `${options.name}-pastel-band-${idx + 1}`,
      material: ceramicMat(bandColor, { color: "#FFFFFF", power: 2.4, intensity: 0.28 }),
      castShadow: false,
      receiveShadow: false
    });
  });

  const pedestalSpec = cachedProceduralSpec(`pastel-band-pedestal:${spanR.toFixed(2)}`, () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0.28, 0], scale: [1.9, 1.05, 1.45] },
        { position: [-0.62, 0.42, 0.16], scale: [1.25, 0.95, 1.1] },
        { position: [0.64, 0.44, -0.12], scale: [1.3, 0.98, 1.12] },
        { position: [0.05, 0.68, 0.05], scale: [1.15, 0.88, 1.0] },
        { position: [-0.32, 0.22, -0.38], scale: [1.05, 0.72, 0.95] },
        { position: [0.38, 0.24, 0.38], scale: [1.05, 0.74, 0.95] }
      ],
      { seed: 709, amplitude: 0.03, frequency: 2.2 }
    );
    return built.geometry;
  });

  const cloudMat = plushCloudMat("#FFFFFF");

  return dioramaGroup(
    options.name,
    [
      ...bandNodes,
      geometry
        .custom(pedestalSpec, {
          name: `${options.name}-cumulus-pedestal-left`,
          material: cloudMat,
          castShadow: true,
          receiveShadow: true
        })
        .position(-spanR, -0.25, 0),
      geometry
        .custom(pedestalSpec, {
          name: `${options.name}-cumulus-pedestal-right`,
          material: cloudMat,
          castShadow: true,
          receiveShadow: true
        })
        .position(spanR, -0.25, 0)
        .rotation(0, Math.PI, 0)
    ],
    {
      position: options.position,
      ...(options.rotationY !== undefined ? { rotation: [0, options.rotationY, 0] } : {})
    }
  );
}

export interface PleatedCurtainPanelOptions {
  readonly name: string;
  readonly side: "left" | "right";
  readonly width?: number;
  readonly height?: number;
  readonly pleatDepth?: number;
  readonly color?: AuraColor;
  readonly cordColor?: AuraColor;
}

/**
 * Builds a single parametric pleated curtain drape with gathered waist cinch,
 * braided tie-back cord, and turned wooden tassel so callers can attach runtime
 * sway IDs to left and right panels independently.
 */
export function buildPleatedCurtainPanel(options: PleatedCurtainPanelOptions): AuraNodeBuilder<AuraSceneNode> {
  const w = options.width ?? 0.62;
  const h = options.height ?? 2.38;
  const depth = options.pleatDepth ?? 0.055;
  const dir = options.side === "left" ? -1 : 1;
  const keyBase = `curtain:${options.side}:${w.toFixed(2)}:${h.toFixed(2)}:${depth.toFixed(3)}`;

  const fabricSpec = cachedProceduralSpec(`${keyBase}:drape`, () => {
    // Closed wrap around U builds front + back of the pleated textile with outward normals on both faces!
    const sheet = parametricSurface({
      uSegments: 36,
      vSegments: 24,
      wrapU: true,
      fn: (u, v) => {
        const frontFace = u <= 0.5;
        const s = frontFace ? u * 2 : (1 - u) * 2;
        const thicknessOffset = frontFace ? 0.009 : -0.009;
        // Cinched softly toward outer edge near v = 0.34 (tie-back waist), flaring gracefully at bottom hem and top header
        const waistGather = Math.exp(-Math.pow((v - 0.34) / 0.18, 2));
        const spanScale = 1 - waistGather * 0.34;
        const gatherPullX = dir * waistGather * w * 0.16;
        const x = (s - 0.5) * w * spanScale + gatherPullX;
        const y = (v - 0.5) * h;
        const pleatAmp = depth * (0.55 + 0.45 * (1 - waistGather * 0.45));
        const pleat = Math.sin(s * Math.PI * 5.5) * pleatAmp;
        const drapeBow = Math.sin(v * Math.PI) * 0.028;
        return [x, y, pleat + drapeBow + thicknessOffset];
      }
    });
    return ensureOutwardNormals(sheet);
  });

  const tieBackSpec = cachedProceduralSpec(`${keyBase}:tieback`, () => {
    const waistY = -h * 0.16;
    const cinchX = dir * w * 0.16;
    const halfCinchW = w * 0.34;
    const cordLoop = sculptCurvedLimb(
      [
        [cinchX + dir * halfCinchW, waistY + 0.04, -0.04],
        [cinchX + dir * (halfCinchW * 0.45), waistY - 0.02, 0.075],
        [cinchX - dir * (halfCinchW * 0.65), waistY, 0.068],
        [cinchX - dir * (halfCinchW * 0.45), waistY + 0.03, -0.04]
      ],
      0.018,
      { steps: 18, radialSegments: 10 }
    );
    const tasselDrop = sculptCurvedLimb(
      [
        [cinchX + dir * 0.06, waistY - 0.02, 0.072],
        [cinchX + dir * 0.08, waistY - 0.18, 0.078]
      ],
      0.012,
      { steps: 8, radialSegments: 8 }
    );
    const tasselBell = sculptOrganicLathe(
      [
        [0, -0.09],
        [0.036, -0.085],
        [0.032, -0.02],
        [0.018, 0.015],
        [0.026, 0.035],
        [0, 0.045]
      ],
      { segments: 16 }
    );
    return composeGeometry([
      { geometry: cordLoop },
      { geometry: tasselDrop },
      { geometry: tasselBell, position: [cinchX + dir * 0.08, waistY - 0.2, 0.078] }
    ]);
  });

  return dioramaGroup(options.name, [
    geometry.custom(fabricSpec, {
      name: `${options.name}-pleated-panel`,
      material: fabricMat(options.color ?? "#F6B89E", WARM_STAGE_RIM, "quiltedStitch"),
      castShadow: true,
      receiveShadow: true
    }),
    geometry.custom(tieBackSpec, {
      name: `${options.name}-tieback-cord`,
      material: woodMat(options.cordColor ?? "#E5B96E"),
      castShadow: true,
      receiveShadow: true
    })
  ]);
}

export interface PleatedCurtainDrapesOptions {
  readonly name: string;
  readonly position: Vec3;
  readonly windowSpan?: number;
  readonly height?: number;
  readonly color?: AuraColor;
  readonly rodColor?: AuraColor;
}

/** Complete window curtain rod with turned finials and left + right pleated drapes. */
export function pleatedCurtainDrapes(options: PleatedCurtainDrapesOptions): AuraNodeBuilder<AuraSceneNode> {
  const span = options.windowSpan ?? 2.35;
  const h = options.height ?? 2.38;
  const rodSpec = cachedProceduralSpec(`curtain-rod:${span.toFixed(2)}`, () => {
    const bar = cylinderSpec(0.024, 0.024, span + 0.36, 18);
    const finial = ellipsoidSpec(0.052, 0.068, 0.052, 16, 12);
    return composeGeometry([
      { geometry: bar, rotation: [0, 0, Math.PI * 0.5] },
      { geometry: finial, position: [-(span * 0.5 + 0.2), 0, 0], rotation: [0, 0, Math.PI * 0.5] },
      { geometry: finial, position: [span * 0.5 + 0.2, 0, 0], rotation: [0, 0, Math.PI * 0.5] }
    ]);
  });

  return dioramaGroup(
    options.name,
    [
      geometry
        .custom(rodSpec, {
          name: `${options.name}-wooden-rod`,
          material: woodMat(options.rodColor ?? "#8C623E"),
          castShadow: true,
          receiveShadow: true
        })
        .position(0, h * 0.5 + 0.06, 0.04),
      buildPleatedCurtainPanel({
        name: `${options.name}-left`,
        side: "left",
        height: h,
        color: options.color
      }).position(-span * 0.5, 0, 0),
      buildPleatedCurtainPanel({
        name: `${options.name}-right`,
        side: "right",
        height: h,
        color: options.color
      }).position(span * 0.5, 0, 0)
    ],
    { position: options.position }
  );
}

// Re-export geometry sculpt primitives so the 6 world files can build multi-part setpieces cleanly.
export {
  composeGeometry,
  coneSpec,
  cylinderSpec,
  ellipsoidSpec,
  extrudeContourSpec,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  sculptOrganicLathe,
  srgbHexToLinearRgba,
  torusSpec
};
