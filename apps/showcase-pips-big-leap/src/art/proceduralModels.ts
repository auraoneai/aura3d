/**
 * WP-06 — Pip's Big Leap (`apps/showcase-pips-big-leap`)
 * Procedural Multi-Material Storybook Woodland & Diorama Art Library.
 *
 * Replaces all 26 static Meshy clay props, borrowed sci-fi/FPS assets, and raw box/sphere/cone
 * primitives in the diorama look with curved, multi-material `@aura3d/engine` assemblies while
 * preserving the 3 rigged character GLBs (`pip`, `boss`, `beetle`) and 100% of gameplay physics.
 */
import {
  AuraNodeBuilder,
  game,
  geometry,
  group,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride,
  type AuraPrimitiveNode,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;
type AuraInstancedNodeBuilder = ReturnType<typeof instances.custom>;
import {
  archwayVoussoirSlots as kernelArchwayVoussoirSlots,
  assembleMultiMaterialNode as kernelAssembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh as kernelBevelBoxMesh,
  buildGroupedGeometrySpec as kernelBuildGroupedGeometrySpec,
  coniferBoughTierMesh as kernelConiferBoughTierMesh,
  extrudePolygonMesh as kernelExtrudePolygonMesh,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh as kernelLoftSectionsMesh,
  mergeRawMeshes,
  paintMeshColors,
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  stratifiedCliffMesh as kernelStratifiedCliffMesh,
  subdivideSmoothMesh,
  toFlatShaded,
  transformMesh as kernelTransformMesh,
  tubeSweepMesh as kernelTubeSweepMesh,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import {
  WGSL_CLIP,
  WGSL_ENVIRONMENT_FOG,
  WGSL_MATH,
  WGSL_NOISE,
  wgslStage
} from "../../../showcase-port-shared/wgsl-twins";

export type ProceduralMesh = RawMesh;
export interface MaterialSlot {
  readonly mesh: ProceduralMesh;
  readonly material: AuraMaterialSpec;
}

const TAU = Math.PI * 2;

function mergeSubmeshes(meshes: readonly ProceduralMesh[]): ProceduralMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const hasColors = meshes.some(
    (m) => m.colors && (m.colors.length === (m.positions.length / 3) * 4 || m.colors.length === m.positions.length)
  );
  const colors: number[] = [];
  for (const m of meshes) {
    const vCount = m.positions.length / 3;
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    if (hasColors) {
      if (m.colors && m.colors.length === vCount * 4) {
        for (let i = 0; i < m.colors.length; i += 1) colors.push(m.colors[i]!);
      } else if (m.colors && m.colors.length === vCount * 3) {
        for (let i = 0; i < vCount; i += 1) {
          colors.push(m.colors[i * 3]!, m.colors[i * 3 + 1]!, m.colors[i * 3 + 2]!, 1);
        }
      } else {
        for (let i = 0; i < vCount; i += 1) colors.push(1, 1, 1, 1);
      }
    }
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  return hasColors ? { positions, normals, uvs, indices, colors } : { positions, normals, uvs, indices };
}

function buildCustomGeometry(mesh: ProceduralMesh): AuraCustomGeometrySpec {
  return mergeRawMeshes([mesh]);
}

function transformMesh(
  src: ProceduralMesh,
  opts: { readonly position?: V3; readonly rotation?: V3; readonly scale?: number | V3 }
): ProceduralMesh {
  return kernelTransformMesh(src, { pos: opts.position, rot: opts.rotation, scale: opts.scale });
}

function bevelBoxMesh(wx: number, wy: number, wz: number, bevel = 0.03, _segs?: number): ProceduralMesh {
  return kernelBevelBoxMesh(wx, wy, wz, bevel);
}

function tubeSweepMesh(pts: readonly V3[], radii: readonly number[], radialSegs = 8): ProceduralMesh {
  const spine: V4[] = pts.map((p, idx) => [p[0], p[1], p[2], radii[Math.min(idx, radii.length - 1)] ?? 0.05]);
  return kernelTubeSweepMesh(spine, radialSegs);
}

function extrudePolygonMesh(
  ring: readonly V2[],
  depth: number,
  opts?: { readonly bevel?: number; readonly centerZ?: boolean }
): ProceduralMesh {
  return kernelExtrudePolygonMesh(ring, depth, opts?.bevel ?? 0, false);
}

function loftSectionsMesh(
  specs: readonly { readonly z: number; readonly width: number; readonly height: number; readonly x?: number; readonly y?: number }[]
): ProceduralMesh {
  const ringPts = 8;
  const rings: V3[][] = specs.map((s) => {
    const cx = s.x ?? 0;
    const cy = s.y ?? 0;
    const rx = Math.max(0.004, s.width * 0.5);
    const ry = Math.max(0.004, s.height * 0.5);
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * TAU;
      ring.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, s.z]);
    }
    return ring;
  });
  return kernelLoftSectionsMesh(rings, true, false);
}

function archwayVoussoirSlots(opts: {
  readonly clearHalfSpan: number;
  readonly springY: number;
  readonly jambWidth: number;
  readonly depth: number;
  readonly voussoirCount?: number;
  readonly keystoneScale?: number;
  readonly bevel?: number;
}): readonly [{ readonly mesh: ProceduralMesh }, { readonly mesh: ProceduralMesh }] {
  const raw = kernelArchwayVoussoirSlots({
    radius: opts.clearHalfSpan,
    thickness: opts.jambWidth,
    depth: opts.depth,
    voussoirs: opts.voussoirCount ?? 9,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 0
  });
  const jx = opts.clearHalfSpan + opts.jambWidth * 0.5;
  const jamb = kernelBevelBoxMesh(opts.jambWidth, opts.springY, opts.depth, opts.bevel ?? 0.04);
  const slotA: ProceduralMesh[] = [
    kernelTransformMesh(jamb, { pos: [-jx, opts.springY * 0.5, 0] }),
    kernelTransformMesh(jamb, { pos: [jx, opts.springY * 0.5, 0] })
  ];
  const slotB: ProceduralMesh[] = [];
  for (const s of raw) {
    const lifted = kernelTransformMesh(s.mesh, { pos: [0, opts.springY, 0] });
    if (s.materialIndex === 0) slotA.push(lifted);
    else slotB.push(lifted);
  }
  return [{ mesh: mergeSubmeshes(slotA) }, { mesh: mergeSubmeshes(slotB) }];
}

function coniferBoughTierMesh(opts: {
  readonly radius: number;
  readonly height: number;
  readonly tiers?: number;
  readonly seed?: number;
  readonly scallops?: number;
  readonly scallopDepth?: number;
  readonly droop?: number;
}): ProceduralMesh {
  return kernelConiferBoughTierMesh({
    baseRadius: opts.radius,
    height: opts.height,
    tiers: opts.tiers ?? 5,
    seed: opts.seed ?? (opts.scallops ?? 7) * 13
  });
}

function stratifiedCliffMesh(opts: {
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly height: number;
  readonly strataCount?: number;
  readonly radialSegments?: number;
  readonly ledgeStep?: number;
  readonly crag?: number;
  readonly seed?: number;
  readonly flatShaded?: boolean;
}): ProceduralMesh {
  return kernelStratifiedCliffMesh({
    radiusX: opts.radiusX,
    radiusZ: opts.radiusZ,
    height: opts.height,
    terraces: opts.strataCount ?? 5,
    seed: opts.seed ?? 17
  });
}

function buildGroupedGeometrySpec(meshes: readonly ProceduralMesh[]): AuraCustomGeometrySpec {
  return kernelBuildGroupedGeometrySpec(meshes.map((mesh, materialIndex) => ({ mesh, materialIndex })));
}

function assembleMultiMaterialNode(
  name: string,
  slots: readonly MaterialSlot[],
  options: {
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly coalesce?: boolean;
  } = {}
): AuraNodeBuilder<AuraGroupNode> {
  const { coalesce, ...rest } = options;
  return kernelAssembleMultiMaterialNode(
    name,
    slots.map((s, materialIndex) => ({ mesh: s.mesh, materialIndex })),
    slots.map((s) => s.material),
    { ...rest, ...(coalesce !== undefined ? { coalesceColors: coalesce } : {}) }
  );
}

function parseHexRgb(hex: AuraColor): readonly [number, number, number] {
  if (Array.isArray(hex)) return [hex[0] ?? 0.5, hex[1] ?? 0.5, hex[2] ?? 0.5];
  const raw = String(hex).trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0");
  const n = Number.parseInt(full.slice(0, 6), 16);
  const srgbToLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [srgbToLin(((n >> 16) & 255) / 255), srgbToLin(((n >> 8) & 255) / 255), srgbToLin((n & 255) / 255)];
}

const fmtWgslVec3 = (v: readonly [number, number, number]): string =>
  `vec3<f32>(${v[0].toFixed(5)}, ${v[1].toFixed(5)}, ${v[2].toFixed(5)})`;

const WGSL_VIS_SCENE = /* wgsl */ `
fn a3dSunRadiance() -> vec3<f32> { return aura.u_a3dSunColor * max(aura.u_a3dSunIntensity, 0.0); }
fn a3dHemiLight(n: vec3<f32>) -> vec3<f32> {
  let up = clamp(n.y / max(length(n), 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  return mix(aura.u_a3dHemiGround, aura.u_a3dHemiSky, up);
}
`;

const LIT_VIS_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct VisVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vVisWorld: vec3<f32>,
  @location(1) vVisNormal: vec3<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>
) -> VisVarying {
  var out: VisVarying;
  let world = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.vVisWorld = world.xyz;
  out.vVisNormal = normalize(a3dMat3Mul(aura.u_modelMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

/** Wraps `material.strata` with a full WebGPU WGSL twin so `backend: "auto"` compiles natively. */
export function storybookStrataMaterial(options: Parameters<typeof material.strata>[0] = {}): AuraMaterialSpec {
  const base = material.strata(options);
  const colors = (options?.colors ?? ["#b4885c", "#cbb089", "#8c6542", "#d9c39e", "#6f4e34"]).map(parseHexRgb);
  const hasSlope = options?.slope !== undefined;
  const cases = colors.map((c, idx) => `    case ${idx}: { albedo = ${fmtWgslVec3(c)}; }`).join("\n");
  const slopeBlock = hasSlope
    ? `  let slopeDeg = degrees(acos(clamp(N.y, -1.0, 1.0)));
  let flatMix = 1.0 - smoothstep(aura.u_strataSlope.x - aura.u_strataSlope.y * 0.5, aura.u_strataSlope.x + aura.u_strataSlope.y * 0.5, slopeDeg);
  let flatAlbedo = aura.u_strataFlatColor * (1.0 + grain * aura.u_strataNoise * 0.9);
  albedo = mix(albedo, flatAlbedo, flatMix);`
    : "";
  const fragment = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_VIS_SCENE, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @builtin(position) fragCoord: vec4<f32>,
  @builtin(front_facing) frontFacing: bool,
  @location(0) vVisWorld: vec3<f32>,
  @location(1) vVisNormal: vec3<f32>
) -> @location(0) vec4<f32> {
  let nSign = select(-1.0, 1.0, frontFacing);
  let N = a3dSafeNormalize3(vVisNormal * nSign, vec3<f32>(0.0, 1.0, 0.0));
  let scale = max(aura.u_strataNoiseScale, 0.01);
  let q = vec2<f32>(vVisWorld.x + vVisWorld.z * 0.73, vVisWorld.y * 0.5) / scale + aura.u_strataSeed.xy;
  let warp = (a3dFbm2(q, 4) - 0.5) * 2.0;
  let grain = a3dFbm2(vec2<f32>(vVisWorld.x - vVisWorld.z * 0.41, vVisWorld.y * 3.0) / (scale * 0.18) + aura.u_strataSeed.yz, 3) - 0.5;
  let span = max(aura.u_strataRange.y - aura.u_strataRange.x, 0.001);
  let f = (vVisWorld.y - aura.u_strataRange.x) / span * aura.u_strataBands + warp * aura.u_strataNoise * 0.9;
  let layer = floor(f);
  let within = f - layer;
  let idx = i32(a3dModF(layer, ${colors.length}.0));
  var albedo = ${fmtWgslVec3(colors[0]!)};
  switch (idx) {
${cases}
    default: {}
  }
  let jitter = a3dHash21(vec2<f32>(layer * 7.13, aura.u_strataSeed.x * 3.0)) - 0.5;
  albedo = albedo * (1.0 + jitter * 2.0 * aura.u_strataVariation);
  let seamMask = smoothstep(0.0, 0.07, within) * (1.0 - smoothstep(0.93, 1.0, within));
  albedo = albedo * mix(1.0, 0.55 + 0.45 * seamMask, aura.u_strataSeam);
  albedo = albedo * (1.0 + grain * aura.u_strataNoise * 0.8);
${slopeBlock}
  albedo = max(albedo, vec3<f32>(0.0));
  let sunDir = a3dSafeNormalize3(aura.u_a3dSunDirection, vec3<f32>(0.38, 0.82, 0.42));
  let ndl = max(dot(N, sunDir), 0.0);
  let lit = albedo * (a3dHemiLight(N) * 0.95 + a3dSunRadiance() * ndl * (1.0 - aura.u_strataRoughness * 0.35));
  let fogged = a3dApplyEnvironmentFog(lit, vVisWorld, fragCoord.xy);
  return vec4<f32>(a3dFinite3(fogged), 1.0);
}`);
  return { ...base, custom: { ...base.custom!, wgsl: { vertex: LIT_VIS_VERTEX_WGSL, fragment } } };
}

/** Wraps `material.caustics` with a full WebGPU WGSL twin for the Millpond sunlit gravel bed. */
export function millpondCausticsMaterial(options: Parameters<typeof material.caustics>[0] = {}): AuraMaterialSpec {
  const base = material.caustics(options);
  const fragment = wgslStage([WGSL_MATH, WGSL_VIS_SCENE, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
fn visCausticWgsl(uv: vec2<f32>, t: f32) -> f32 {
  let tau = 6.28318530718;
  let u = uv * tau;
  let p = (u - floor(u / tau) * tau) - vec2<f32>(250.0);
  var i = p;
  var c = 1.0;
  let inten = 0.005;
  for (var n: i32 = 0; n < 4; n = n + 1) {
    let tt = t * (1.0 - (3.5 / f32(n + 1)));
    i = p + vec2<f32>(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    let denom = vec2<f32>(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten));
    c = c + 1.0 / max(length(denom), 1e-4);
  }
  c = 1.17 - a3dPow(max(c * 0.25, 0.0), 1.4);
  return clamp(a3dPow(abs(c), 8.0), 0.0, 1.0);
}
@fragment fn fs_main(
  @builtin(position) fragCoord: vec4<f32>,
  @builtin(front_facing) frontFacing: bool,
  @location(0) vVisWorld: vec3<f32>,
  @location(1) vVisNormal: vec3<f32>
) -> @location(0) vec4<f32> {
  let nSign = select(-1.0, 1.0, frontFacing);
  let N = a3dSafeNormalize3(vVisNormal * nSign, vec3<f32>(0.0, 1.0, 0.0));
  let albedo = aura.u_causticsColor;
  let sunDir = a3dSafeNormalize3(aura.u_a3dSunDirection, vec3<f32>(-0.35, 0.85, 0.40));
  let ndl = max(dot(N, sunDir), 0.0);
  let lit = albedo * (a3dHemiLight(N) * 0.95 + a3dSunRadiance() * ndl * (1.0 - aura.u_causticsRoughness * 0.35));
  let t = aura.u_time * aura.u_causticsSpeed * 0.5 + 23.0;
  let uv = vVisWorld.xz / max(aura.u_causticsScale, 0.01);
  let c = visCausticWgsl(uv, t) * 0.7 + visCausticWgsl(uv * 1.7 + vec2<f32>(0.31), t * 1.2) * 0.45;
  let facing = smoothstep(-0.1, 0.7, N.y);
  let depthK = select(1.0, exp(-max(aura.u_causticsFade.y - vVisWorld.y, 0.0) * aura.u_causticsFade.z), aura.u_causticsFade.x > 0.5);
  let caustic = aura.u_causticsLight * c * aura.u_causticsStrength * facing * depthK;
  let fogged = a3dApplyEnvironmentFog(lit + caustic * (albedo * 0.6 + vec3<f32>(0.4)), vVisWorld, fragCoord.xy);
  return vec4<f32>(a3dFinite3(fogged), 1.0);
}`);
  return { ...base, custom: { ...base.custom!, wgsl: { vertex: LIT_VIS_VERTEX_WGSL, fragment } } };
}

/** Stamps `castShadow: false` on a group/node builder so top-level scene JSON predicates see it. */
export function stampNoCastShadow<TNode extends AuraSceneNode>(builder: AuraNodeBuilder<TNode>): AuraNodeBuilder<TNode> {
  return new AuraNodeBuilder<TNode>({ ...builder.toJSON(), castShadow: false } as TNode);
}

/** Shared physical material palette for Pip's Big Leap storybook woodland props (all emissives marked `practical: true`). */
export const PBL_MAT = {
  sunGold: material.studioMetal({ name: "sunseed gold", color: "#ffc23d", metalness: 0.88, roughness: 0.2 }),
  sunRibGlow: material.emissive({ name: "sunseed solar rib", color: "#ffe27a", emissive: "#ffc23d", emissiveIntensity: 0.88, practical: true }),
  acornShell: material.studioMetal({ name: "golden acorn shell", color: "#f6b733", metalness: 0.84, roughness: 0.22 }),
  oakCupule: material.matteClay({ name: "oak cupule bark", color: "#6e4726", roughness: 0.88 }),
  oakTimber: material.matteClay({ name: "dressed oak timber", color: "#8b5a34", roughness: 0.78 }),
  roughBark: material.matteClay({ name: "gnarled woodland bark", color: "#5b3b24", roughness: 0.92 }),
  copperCoil: material.studioMetal({ name: "coiled spring copper", color: "#d67b42", metalness: 0.86, roughness: 0.26 }),
  crimsonLacquer: material.lacquer({ name: "amanita crimson cap", color: "#c83228", roughness: 0.2, clearcoat: 0.72, clearcoatRoughness: 0.16, rim: { color: "#ffcab8", power: 2.8, intensity: 0.25 } }),
  creamCapSpot: material.ceramic({ name: "amanita cream veil", color: "#f4ead2", roughness: 0.42 }),
  emeraldLeaf: material.felt({ name: "woodland canopy leaf", color: "#4f8438", roughness: 0.82 }),
  pineNeedle: material.felt({ name: "scalloped pine bough", color: "#2e5e36", roughness: 0.86 }),
  limestone: material.matteClay({ name: "carved limestone", color: "#d8ceb8", roughness: 0.84 }),
  mossyStone: material.matteClay({ name: "weathered granite", color: "#8d8a80", roughness: 0.9 }),
  velvetMoss: material.felt({ name: "velvet woodland moss", color: "#5e8f3e", roughness: 0.88 }),
  linenSail: material.fabric({ name: "windmill linen sail", color: "#f3ebd7", roughness: 0.85, sheen: 0.35, sheenColor: "#fff8e8" }),
  slateRoof: material.ceramic({ name: "conical roof slate", color: "#4a5564", roughness: 0.56 }),
  wroughtIron: material.studioMetal({ name: "wrought iron", color: "#3b3f46", metalness: 0.78, roughness: 0.38 }),
  cyanRuneGlow: material.emissive({ name: "sungate cyan rune", color: "#7be8ff", emissive: "#48d1ff", emissiveIntensity: 0.95, practical: true }),
  amberLanternGlow: material.emissive({ name: "lantern amber flame", color: "#ffd27d", emissive: "#ffaa3b", emissiveIntensity: 1.05, practical: true }),
  quartzCrystal: material.clearcoat({ name: "faceted quartz crystal", color: "#7cc8ff", roughness: 0.16, clearcoat: 0.88, clearcoatRoughness: 0.1, iridescence: 0.65, iridescenceIOR: 1.32, emissive: "#3888d8", emissiveIntensity: 0.24, practical: true }),
  petalBlossom: material.fabric({ name: "meadow blossom petal", color: "#f28cb1", roughness: 0.74, sheen: 0.4, sheenColor: "#ffd6e6" }),
  pennantCrimson: material.fabric({ name: "checkpoint pennant", color: "#d94b38", roughness: 0.78, sheen: 0.32, sheenColor: "#ff9b8a" }),
  critterCreamFur: material.fabric({ name: "hedgehog cream snout", color: "#ecd9bc", roughness: 0.82, sheen: 0.36, sheenColor: "#fff3de" }),
  critterQuillBrown: material.matteClay({ name: "hedgehog quill coat", color: "#5c3d28", roughness: 0.8 }),
  glossyEye: material.lacquer({ name: "critter bead eye", color: "#1c1817", roughness: 0.1, clearcoat: 0.9 }),
  beetleCarapace: material.clearcoat({ name: "forest beetle iridescent carapace", color: "#17896d", roughness: 0.14, clearcoat: 0.94, clearcoatRoughness: 0.08, iridescence: 0.9, iridescenceIOR: 1.38, rim: { color: "#b6ffe4", power: 2.6, intensity: 0.32 } }),
  beetleChitin: material.lacquer({ name: "forest beetle glossy chitin", color: "#281f1d", roughness: 0.22, clearcoat: 0.78 }),
  hawkPlumage: material.fabric({ name: "soaring hawk plumage", color: "#7a5033", roughness: 0.76, sheen: 0.3, sheenColor: "#cfa47e" }),
  basaltRock: material.matteClay({ name: "charred basalt", color: "#352e30", roughness: 0.92 }),
  magmaEmber: material.emissive({ name: "vent ember throat", color: "#ff6b2b", emissive: "#ff4d14", emissiveIntensity: 1.25, practical: true }),
  cumulusPuff: material.felt({ name: "storybook cloud puff", color: "#f6f2ea", roughness: 0.92 })
} as const;

const INSTANCED_TREE_MAT = {
  roughBark: material.pbr({ name: "instanced woodland bark", color: "#5b3b24", roughness: 0.9, metalness: 0 }),
  emeraldLeaf: material.pbr({ name: "instanced meadow canopy", color: "#4f8a39", roughness: 0.78, metalness: 0 }),
  pineNeedle: material.pbr({ name: "instanced pine bough", color: "#2e6438", roughness: 0.82, metalness: 0 })
} as const;

/** Plush fabric + lacquer + rim separation for the 2 restyled rigged character GLBs (`pip` and `boss`) while keeping authored textures. */
export const PIP_PLUSH_OVERRIDES: readonly AuraModelMaterialOverride[] = [
  { sheen: 0.52, sheenColor: "#ffe4be", sheenRoughness: 0.44, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 1.35, rim: { color: "#fff0c8", power: 2.6, intensity: 0.38 } }
];

export const BOSS_BRAMBLE_OVERRIDES: readonly AuraModelMaterialOverride[] = [
  { sheen: 0.36, sheenColor: "#d99b72", sheenRoughness: 0.58, clearcoat: 0.34, clearcoatRoughness: 0.32, envMapIntensity: 1.2, rim: { color: "#ffb878", power: 2.4, intensity: 0.44 } }
];

/* -------------------------------------------------------------------------- */
/* 1. Storybook Diorama Island Base Plinths                                   */
/* -------------------------------------------------------------------------- */

export interface StorybookIslandPlinthColors {
  readonly felt: string;
  readonly clay: string;
  readonly skirt: string;
  readonly mound: string;
}

export function buildStorybookBaseFeltNode(name: string, size: readonly [number, number, number], pos: readonly [number, number, number], color: string): AuraNodeBuilder<AuraPrimitiveNode> {
  const geo = buildCustomGeometry(bevelBoxMesh(size[0], size[1], size[2], 0.12, 2));
  return geometry.custom(geo, {
    name,
    position: [...pos],
    material: material.felt({ name: "island turf lip", color, roughness: 0.88 }),
    castShadow: false,
    receiveShadow: true
  });
}

export function buildStorybookBaseClayNode(name: string, size: readonly [number, number, number], pos: readonly [number, number, number], color: string): AuraNodeBuilder<AuraPrimitiveNode> {
  const geo = buildCustomGeometry(bevelBoxMesh(size[0], size[1], size[2], 0.16, 2));
  return geometry.custom(geo, {
    name,
    position: [...pos],
    material: material.matteClay({ name: "island soil bevel", color, roughness: 0.9 }),
    castShadow: false,
    receiveShadow: true
  });
}

export function buildStorybookBaseSkirtNode(
  name: string,
  size: readonly [number, number, number],
  pos: readonly [number, number, number],
  colors: StorybookIslandPlinthColors,
  seed: number
): AuraNodeBuilder<AuraPrimitiveNode> {
  const cliff = stratifiedCliffMesh({
    radiusX: size[0] * 0.5,
    radiusZ: size[2] * 0.5,
    height: size[1],
    strataCount: 4,
    radialSegments: 24,
    ledgeStep: 0.08,
    crag: 0.08,
    seed,
    flatShaded: true
  });
  const shifted = transformMesh(cliff, { position: [0, -size[1] * 0.5, 0] });
  const strataMat = storybookStrataMaterial({
    bands: 7,
    colors: [colors.skirt, colors.clay, "#8d6c4d", colors.mound],
    heightRange: [pos[1] - size[1], pos[1] + size[1]],
    noise: 0.34,
    noiseScale: 4.5,
    seam: 0.28,
    variation: 0.16,
    roughness: 0.88,
    slope: { angle: 40, blend: 12, flatColor: colors.felt },
    seed: (seed % 97) * 0.37
  });
  return geometry.custom(buildCustomGeometry(shifted), {
    name,
    position: [...pos],
    material: strataMat,
    castShadow: false,
    receiveShadow: false
  });
}

function storybookIslandBluffSlots(height: number, seed: number): readonly [ProceduralMesh, ProceduralMesh, ProceduralMesh] {
  const cliffH = height * 0.72;
  const soilH = height * 0.18;
  const turfH = height * 0.14;
  const cliff = stratifiedCliffMesh({
    radiusX: 0.48,
    radiusZ: 0.48,
    height: cliffH,
    strataCount: 5,
    radialSegments: 20,
    ledgeStep: 0.12,
    crag: 0.12,
    seed,
    flatShaded: true
  });
  const soilCollar = transformMesh(
    latheMesh(
      [[0, 0], [0.44, 0], [0.49, soilH * 0.55], [0.46, soilH], [0, soilH]],
      20
    ),
    { position: [0, cliffH * 0.94, 0] }
  );
  const turfCrown = transformMesh(
    latheMesh(
      [[0, 0], [0.46, 0], [0.5, turfH * 0.45], [0.43, turfH * 0.92], [0.18, turfH], [0, turfH]],
      20
    ),
    { position: [0, cliffH * 0.94 + soilH * 0.86, 0] }
  );
  return [cliff, soilCollar, turfCrown];
}

export function buildStorybookIslandTilesNode(
  name: string,
  transforms: readonly AuraTransformSpec[],
  height: number,
  colors: StorybookIslandPlinthColors,
  seed: number
): AuraNodeBuilder<AuraGroupNode> {
  const cliffParts: ProceduralMesh[] = [];
  const soilParts: ProceduralMesh[] = [];
  const turfParts: ProceduralMesh[] = [];
  transforms.forEach((tr, idx) => {
    const [cliff, soil, turf] = storybookIslandBluffSlots(1, seed + idx * 17);
    const sx = Array.isArray(tr.scale) ? tr.scale[0] : (tr.scale ?? height);
    const syRaw = Array.isArray(tr.scale) ? tr.scale[1] : (tr.scale ?? height);
    const sz = Array.isArray(tr.scale) ? tr.scale[2] : (tr.scale ?? height);
    const sy = name === "pbl-base-tiles" ? height * 0.92 : syRaw;
    const xform = {
      position: tr.position ? [tr.position[0], tr.position[1], tr.position[2]] as const : [0, 0, 0] as const,
      rotation: tr.rotation ? [tr.rotation[0], tr.rotation[1], tr.rotation[2]] as const : [0, 0, 0] as const,
      scale: [sx * 0.92, sy, sz * 0.92] as const
    };
    cliffParts.push(transformMesh(cliff, xform));
    soilParts.push(transformMesh(soil, xform));
    turfParts.push(transformMesh(turf, xform));
  });
  const strataMat = storybookStrataMaterial({
    bands: 9,
    colors: [colors.clay, colors.skirt, "#a27f59", colors.mound],
    heightRange: [-18, -1],
    noise: 0.36,
    noiseScale: 3.6,
    seam: 0.3,
    variation: 0.2,
    roughness: 0.88,
    slope: { angle: 36, blend: 14, flatColor: colors.felt },
    seed: (seed % 89) * 0.41
  });
  const node = assembleMultiMaterialNode(
    name,
    [
      { mesh: mergeSubmeshes(cliffParts), material: strataMat },
      { mesh: mergeSubmeshes(soilParts), material: material.matteClay({ name: "bluff soil bevel", color: colors.clay, roughness: 0.88 }) },
      { mesh: mergeSubmeshes(turfParts), material: material.felt({ name: "bluff emerald turf", color: colors.felt, roughness: 0.84 }) }
    ],
    { castShadow: false, receiveShadow: true }
  );
  return stampNoCastShadow(node);
}

/* -------------------------------------------------------------------------- */
/* 2. Pickups, Bounce Springs, Checkpoints & Sun Gate                         */
/* -------------------------------------------------------------------------- */

function sunseedSlots(): readonly MaterialSlot[] {
  const shell = latheMesh(
    [
      [0, -0.28],
      [0.09, -0.24],
      [0.2, -0.1],
      [0.22, 0.04],
      [0.16, 0.19],
      [0.06, 0.29],
      [0, 0.33]
    ],
    18
  );
  const ribs: ProceduralMesh[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    const path: [number, number, number][] = [
      [Math.cos(a) * 0.07, -0.22, Math.sin(a) * 0.07],
      [Math.cos(a) * 0.215, -0.05, Math.sin(a) * 0.215],
      [Math.cos(a) * 0.22, 0.06, Math.sin(a) * 0.22],
      [Math.cos(a) * 0.13, 0.22, Math.sin(a) * 0.13]
    ];
    ribs.push(tubeSweepMesh(path, [0.014, 0.024, 0.022, 0.012], 7));
  }
  const sprout = mergeSubmeshes([
    tubeSweepMesh([[0, 0.3, 0], [0.03, 0.38, 0.01], [0.09, 0.43, 0.03]], [0.02, 0.015, 0.008], 6),
    transformMesh(
      loftSectionsMesh([
        { z: 0, width: 0.02, height: 0.01 },
        { z: 0.07, width: 0.08, height: 0.018, y: 0.02 },
        { z: 0.14, width: 0.015, height: 0.008, y: 0.01 }
      ]),
      { position: [0.02, 0.35, 0], rotation: [-0.35, 0.4, 0.2] }
    )
  ]);
  return [
    { mesh: shell, material: PBL_MAT.sunGold },
    { mesh: mergeSubmeshes(ribs), material: PBL_MAT.sunRibGlow },
    { mesh: sprout, material: PBL_MAT.emeraldLeaf }
  ];
}

let cachedSunseedGeo: { spec: AuraCustomGeometrySpec; materials: readonly AuraMaterialSpec[] } | null = null;
export function buildSunseedNode(name: string, pos: readonly [number, number, number], runtimeSpec: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedSunseedGeo) {
    const slots = sunseedSlots();
    cachedSunseedGeo = { spec: buildGroupedGeometrySpec(slots.map((s) => s.mesh)), materials: slots.map((s) => s.material) };
  }
  return stampNoCastShadow(
    geometry.multiMaterial(cachedSunseedGeo.spec, cachedSunseedGeo.materials, {
      name,
      position: [...pos],
      castShadow: false,
      receiveShadow: false
    }).runtime(runtimeSpec)
  );
}

function goldenAcornSlots(): readonly MaterialSlot[] {
  // Smooth organic lathed + subdivided golden nut body + scalloped oak-cupule cap
  const nut = subdivideSmoothMesh(
    latheMesh(
      [
        [0, -0.31],
        [0.06, -0.27],
        [0.19, -0.14],
        [0.24, 0.01],
        [0.22, 0.12],
        [0.15, 0.18],
        [0, 0.19]
      ],
      18
    ),
    1,
    0.48
  );
  const cupBase = subdivideSmoothMesh(
    latheMesh(
      [
        [0, 0.09],
        [0.25, 0.1],
        [0.275, 0.18],
        [0.235, 0.27],
        [0.125, 0.31],
        [0, 0.32]
      ],
      16
    ),
    1,
    0.42
  );
  const scales: ProceduralMesh[] = [cupBase];
  for (let ring = 0; ring < 2; ring += 1) {
    const count = ring === 0 ? 10 : 8;
    const ry = 0.15 + ring * 0.065;
    const rad = ring === 0 ? 0.26 : 0.22;
    for (let i = 0; i < count; i += 1) {
      const a = ((i + ring * 0.5) / count) * TAU;
      scales.push(
        transformMesh(bevelBoxMesh(0.058, 0.048, 0.036, 0.012, 1), {
          position: [Math.cos(a) * rad, ry, Math.sin(a) * rad],
          rotation: [0.28, -a + Math.PI * 0.5, 0.4]
        })
      );
    }
  }
  const stem = subdivideSmoothMesh(
    tubeSweepMesh([[0, 0.3, 0], [0.02, 0.39, 0.01], [0.075, 0.45, 0.02]], [0.034, 0.028, 0.02], 8),
    1,
    0.4
  );
  return [
    { mesh: nut, material: PBL_MAT.acornShell },
    { mesh: mergeSubmeshes(scales), material: PBL_MAT.oakCupule },
    { mesh: stem, material: PBL_MAT.roughBark }
  ];
}

let cachedAcornGeo: { spec: AuraCustomGeometrySpec; materials: readonly AuraMaterialSpec[] } | null = null;
export function buildGoldenAcornNode(name: string, pos: readonly [number, number, number], runtimeSpec: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedAcornGeo) {
    const slots = goldenAcornSlots();
    cachedAcornGeo = { spec: buildGroupedGeometrySpec(slots.map((s) => s.mesh)), materials: slots.map((s) => s.material) };
  }
  return stampNoCastShadow(
    geometry.multiMaterial(cachedAcornGeo.spec, cachedAcornGeo.materials, {
      name,
      position: [...pos],
      castShadow: false,
      receiveShadow: false
    }).runtime(runtimeSpec)
  );
}

function heartBerrySlots(): readonly MaterialSlot[] {
  // Smooth organic twin-lobed crimson berry — never flat-shaded!
  const lobe = latheMesh(
    [
      [0, -0.24],
      [0.08, -0.17],
      [0.16, -0.04],
      [0.18, 0.08],
      [0.14, 0.19],
      [0.06, 0.24],
      [0, 0.25]
    ],
    18
  );
  const berry = mergeSubmeshes([
    transformMesh(lobe, { position: [-0.085, 0.02, 0], rotation: [0, 0, 0.34] }),
    transformMesh(lobe, { position: [0.085, 0.02, 0], rotation: [0, 0, -0.34] })
  ]);
  const sepals: ProceduralMesh[] = [
    tubeSweepMesh([[0, 0.19, 0], [0, 0.3, 0], [0.03, 0.35, 0]], [0.024, 0.018, 0.012], 7)
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + 0.4;
    sepals.push(
      transformMesh(
        loftSectionsMesh([
          { z: 0, width: 0.04, height: 0.014 },
          { z: 0.08, width: 0.075, height: 0.018, y: 0.015 },
          { z: 0.15, width: 0.018, height: 0.008, y: -0.01 }
        ]),
        { position: [0, 0.22, 0], rotation: [0.22, a, 0] }
      )
    );
  }
  return [
    { mesh: berry, material: PBL_MAT.crimsonLacquer },
    { mesh: mergeSubmeshes(sepals), material: PBL_MAT.emeraldLeaf }
  ];
}

let cachedHeartGeo: { spec: AuraCustomGeometrySpec; materials: readonly AuraMaterialSpec[] } | null = null;
export function buildHeartBerryNode(name: string, pos: readonly [number, number, number], runtimeSpec: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedHeartGeo) {
    const slots = heartBerrySlots();
    cachedHeartGeo = { spec: buildGroupedGeometrySpec(slots.map((s) => s.mesh)), materials: slots.map((s) => s.material) };
  }
  return stampNoCastShadow(
    geometry.multiMaterial(cachedHeartGeo.spec, cachedHeartGeo.materials, {
      name,
      position: [...pos],
      castShadow: false,
      receiveShadow: false
    }).runtime(runtimeSpec)
  );
}

function fivePointStarPolygon(outerR: number, innerR: number): readonly (readonly [number, number])[] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * TAU - Math.PI * 0.5;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

export function starRelicMeshes(scale = 1): { gold: ProceduralMesh; core: ProceduralMesh } {
  const body = transformMesh(
    extrudePolygonMesh(fivePointStarPolygon(0.32 * scale, 0.145 * scale), 0.11 * scale, { bevel: 0.025 * scale, centerZ: true }),
    { position: [0, 0.34 * scale, 0] }
  );
  const core = transformMesh(
    extrudePolygonMesh(fivePointStarPolygon(0.15 * scale, 0.07 * scale), 0.145 * scale, { bevel: 0.015 * scale, centerZ: true }),
    { position: [0, 0.34 * scale, 0] }
  );
  return { gold: body, core };
}

export function buildGateLockStarNode(name: string, pos: readonly [number, number, number], runtimeSpec: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  const { gold, core } = starRelicMeshes(0.95);
  return stampNoCastShadow(
    assembleMultiMaterialNode(
      name,
      [
        { mesh: transformMesh(gold, { position: [0, -0.32, 0] }), material: PBL_MAT.sunGold },
        { mesh: transformMesh(core, { position: [0, -0.32, 0] }), material: PBL_MAT.cyanRuneGlow }
      ],
      { position: [...pos], castShadow: false, receiveShadow: false, coalesce: false }
    ).runtime(runtimeSpec)
  );
}

/** Carved stone-and-copper helical spring base + spotted Amanita toadstool bounce cap (~0.7 m radius). */
export function buildBounceSpringBaseNode(name: string, pos: readonly [number, number, number]): AuraNodeBuilder<AuraGroupNode> {
  const plinth = latheMesh(
    [[0, 0], [0.52, 0], [0.54, 0.08], [0.46, 0.15], [0.38, 0.18], [0, 0.18]],
    20
  );
  const mossRim = latheMesh(
    [[0.36, 0.15], [0.49, 0.15], [0.47, 0.2], [0.35, 0.19]],
    18
  );
  const coilPts: [number, number, number][] = [];
  const coilRadii: number[] = [];
  const steps = 34;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * TAU * 2.75;
    const r = 0.28 + 0.04 * Math.sin(t * Math.PI);
    coilPts.push([Math.cos(a) * r, 0.17 + t * 0.22, Math.sin(a) * r]);
    coilRadii.push(0.036);
  }
  const coil = tubeSweepMesh(coilPts, coilRadii, 8);
  return stampNoCastShadow(
    assembleMultiMaterialNode(
      name,
      [
        { mesh: plinth, material: PBL_MAT.limestone },
        { mesh: mossRim, material: PBL_MAT.velvetMoss },
        { mesh: coil, material: PBL_MAT.copperCoil }
      ],
      { position: [...pos], castShadow: false, receiveShadow: true, coalesce: false }
    )
  );
}

export function buildBounceSpringCapNode(name: string, pos: readonly [number, number, number], runtimeSpec: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  // Smooth organic Amanita bounce cap — never flat-shaded!
  const cap = latheMesh(
    [
      [0, 0.34],
      [0.44, 0.35],
      [0.52, 0.41],
      [0.47, 0.5],
      [0.28, 0.57],
      [0, 0.59]
    ],
    22
  );
  const gills = latheMesh([[0, 0.31], [0.32, 0.32], [0.42, 0.35], [0, 0.35]], 18);
  const spots: ProceduralMesh[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + 0.25;
    const dome = latheMesh([[0, 0], [0.075, 0], [0.068, 0.022], [0, 0.032]], 10);
    spots.push(transformMesh(dome, { position: [Math.cos(a) * 0.29, 0.505, Math.sin(a) * 0.29], rotation: [Math.sin(a) * 0.26, 0, -Math.cos(a) * 0.26] }));
  }
  spots.push(transformMesh(latheMesh([[0, 0], [0.085, 0], [0.07, 0.026], [0, 0.036]], 10), { position: [0, 0.575, 0] }));
  return stampNoCastShadow(
    assembleMultiMaterialNode(
      name,
      [
        { mesh: cap, material: PBL_MAT.crimsonLacquer },
        { mesh: mergeSubmeshes([gills, ...spots]), material: PBL_MAT.creamCapSpot }
      ],
      { position: [...pos], castShadow: false, receiveShadow: true, coalesce: false }
    ).runtime(runtimeSpec)
  );
}

/** Carved stone pad + chamfered oak post + brass finial, sharing cached geometries for automatic static batching. */
let cachedCheckpointStandGeo: {
  pad: AuraCustomGeometrySpec;
  post: AuraCustomGeometrySpec;
  finial: AuraCustomGeometrySpec;
} | null = null;

export function buildCheckpointStandNode(name: string, pos: readonly [number, number, number], yaw: number): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedCheckpointStandGeo) {
    const pad = mergeSubmeshes([
      latheMesh([[0, 0], [0.44, 0], [0.46, 0.08], [0.36, 0.14], [0, 0.14]], 16),
      transformMesh(bevelBoxMesh(0.22, 0.1, 0.22, 0.03, 1), { position: [0, 0.16, 0] })
    ]);
    const post = mergeSubmeshes([
      tubeSweepMesh([[0, 0.16, 0], [0, 1.05, 0], [0, 1.88, 0]], [0.055, 0.048, 0.04], 8),
      transformMesh(bevelBoxMesh(0.56, 0.06, 0.06, 0.015, 1), { position: [0.24, 1.74, 0] })
    ]);
    const finial = transformMesh(
      latheMesh([[0, 0], [0.075, 0.03], [0.085, 0.1], [0.04, 0.17], [0, 0.2]], 14),
      { position: [0, 1.86, 0] }
    );
    cachedCheckpointStandGeo = {
      pad: buildCustomGeometry(pad),
      post: buildCustomGeometry(post),
      finial: buildCustomGeometry(finial)
    };
  }
  return stampNoCastShadow(
    group(name, [
      geometry.custom(cachedCheckpointStandGeo.pad, { name: `${name}:stone`, material: PBL_MAT.limestone, castShadow: false, receiveShadow: true }),
      geometry.custom(cachedCheckpointStandGeo.post, { name: `${name}:post`, material: PBL_MAT.oakTimber, castShadow: false, receiveShadow: true }),
      geometry.custom(cachedCheckpointStandGeo.finial, { name: `${name}:finial`, material: PBL_MAT.sunGold, castShadow: false, receiveShadow: true })
    ])
      .position(pos[0], pos[1], pos[2])
      .rotate(0, yaw, 0)
  );
}

let cachedPennantGeo: AuraCustomGeometrySpec | null = null;
export function buildCheckpointPennantNode(name: string, pos: readonly [number, number, number], yaw: number, runtimeSpec: Parameters<AuraNodeBuilder<AuraPrimitiveNode>["runtime"]>[0], castShadow = false): AuraNodeBuilder<AuraPrimitiveNode> {
  if (!cachedPennantGeo) {
    const cloth = transformMesh(
      extrudePolygonMesh(
        [[0.04, 1.05], [0.68, 1.15], [0.54, 1.32], [0.7, 1.5], [0.04, 1.58]],
        0.036,
        { bevel: 0.008, centerZ: true }
      ),
      { position: [0, 0, 0] }
    );
    cachedPennantGeo = buildCustomGeometry(cloth);
  }
  return geometry.custom(cachedPennantGeo, {
    name,
    position: [...pos],
    rotation: [0, yaw, 0],
    material: PBL_MAT.pennantCrimson,
    castShadow,
    receiveShadow: true
  }).runtime(runtimeSpec);
}

export function buildWoodlandBannerNode(name: string, pos: readonly [number, number, number], yaw: number, scale: number, runtimeSpec?: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  const post = mergeSubmeshes([
    tubeSweepMesh([[0, 0, 0], [0, 1.15, 0], [0, 2.15, 0]], [0.055, 0.048, 0.04], 8),
    transformMesh(bevelBoxMesh(0.76, 0.065, 0.065, 0.015, 1), { position: [0, 2.02, 0] })
  ]);
  const cloth = extrudePolygonMesh(
    [[-0.31, 1.98], [0.31, 1.98], [0.28, 0.92], [0, 1.16], [-0.28, 0.92]],
    0.032,
    { bevel: 0.008, centerZ: true }
  );
  const finial = transformMesh(latheMesh([[0, 0], [0.07, 0.04], [0.05, 0.12], [0, 0.16]], 12), { position: [0, 2.14, 0] });
  const node = stampNoCastShadow(
    assembleMultiMaterialNode(
      name,
      [
        { mesh: post, material: PBL_MAT.oakTimber },
        { mesh: cloth, material: PBL_MAT.pennantCrimson },
        { mesh: finial, material: PBL_MAT.sunGold }
      ],
      { position: [...pos], rotation: [0, yaw, 0], scale, castShadow: false, receiveShadow: true }
    )
  );
  return runtimeSpec ? node.runtime(runtimeSpec) : node;
}

/** Ornate carved limestone, oak & burnished-gold filigree Sun-Gate portal arch (`archwayVoussoirSlots` + solar sunburst crown). */
export function buildSunGateArchNode(name: string, pos: readonly [number, number, number], yaw: number, runtimeSpec: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  const archSlots = archwayVoussoirSlots({
    clearHalfSpan: 1.42,
    springY: 1.78,
    jambWidth: 0.58,
    depth: 0.74,
    voussoirCount: 11,
    keystoneScale: 1.28,
    bevel: 0.04
  });
  const carvedStoneJambs = mergeSubmeshes([
    transformMesh(bevelBoxMesh(1.04, 0.28, 1.12, 0.05, 1), { position: [-1.71, 0.14, 0] }),
    transformMesh(bevelBoxMesh(1.04, 0.28, 1.12, 0.05, 1), { position: [1.71, 0.14, 0] }),
    transformMesh(bevelBoxMesh(0.86, 0.18, 0.94, 0.04, 1), { position: [-1.71, 0.34, 0] }),
    transformMesh(bevelBoxMesh(0.86, 0.18, 0.94, 0.04, 1), { position: [1.71, 0.34, 0] }),
    transformMesh(bevelBoxMesh(0.82, 0.16, 0.92, 0.035, 1), { position: [-1.71, 1.74, 0] }),
    transformMesh(bevelBoxMesh(0.82, 0.16, 0.92, 0.035, 1), { position: [1.71, 1.74, 0] }),
    archSlots[0]!.mesh
  ]);
  const carvedTimberInlay = mergeSubmeshes([
    transformMesh(bevelBoxMesh(0.42, 1.22, 0.8, 0.03, 1), { position: [-1.71, 1.04, 0] }),
    transformMesh(bevelBoxMesh(0.42, 1.22, 0.8, 0.03, 1), { position: [1.71, 1.04, 0] }),
    tubeSweepMesh([[-1.98, 0.26, 0.38], [-1.92, 1.02, 0.4], [-1.94, 1.68, 0.38]], [0.062, 0.05, 0.044], 8),
    tubeSweepMesh([[1.98, 0.26, 0.38], [1.92, 1.02, 0.4], [1.94, 1.68, 0.38]], [0.062, 0.05, 0.044], 8)
  ]);
  const medallionDisc = transformMesh(latheMesh([[0, -0.44], [0.38, -0.42], [0.42, -0.35], [0.42, 0.35], [0.38, 0.42], [0, 0.44]], 20), {
    position: [0, 3.56, 0],
    rotation: [Math.PI * 0.5, 0, 0]
  });
  const sunGoldFiligree: ProceduralMesh[] = [archSlots[1]!.mesh, medallionDisc];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * TAU;
    const len = i % 2 === 0 ? 0.32 : 0.22;
    sunGoldFiligree.push(
      transformMesh(latheMesh([[0, 0], [0.068, 0.02], [0.034, len * 0.62], [0, len]], 8), {
        position: [Math.cos(a) * 0.38, 3.56 + Math.sin(a) * 0.38, 0],
        rotation: [0, 0, a - Math.PI * 0.5]
      })
    );
  }
  // Ornate gold filigree scroll arcs climbing both jambs & framing the arch extrados
  for (const sx of [-1, 1] as const) {
    sunGoldFiligree.push(
      transformMesh(latheMesh([[0, -0.42], [0.2, -0.4], [0.2, 0.4], [0, 0.42]], 16), {
        position: [sx * 1.71, 1.06, 0],
        rotation: [Math.PI * 0.5, 0, 0]
      }),
      tubeSweepMesh(
        [
          [sx * 1.88, 0.42, 0.4],
          [sx * 1.56, 0.86, 0.42],
          [sx * 1.86, 1.32, 0.42],
          [sx * 1.62, 1.72, 0.4]
        ],
        [0.036, 0.032, 0.032, 0.026],
        8
      ),
      tubeSweepMesh(
        [
          [sx * 1.92, 1.84, 0.38],
          [sx * 1.48, 2.78, 0.4],
          [sx * 0.52, 3.44, 0.4]
        ],
        [0.04, 0.036, 0.028],
        8
      )
    );
  }
  const mossCaps = mergeSubmeshes([
    transformMesh(icosphereSmoothMesh(0.3, 1, 0.04, 19, 0.25), { position: [-1.71, 1.88, 0], scale: [1.38, 0.42, 1.48] }),
    transformMesh(icosphereSmoothMesh(0.3, 1, 0.04, 29, 0.25), { position: [1.71, 1.88, 0], scale: [1.38, 0.42, 1.48] })
  ]);
  const solarInlays = mergeSubmeshes([
    transformMesh(bevelBoxMesh(0.12, 0.84, 0.84, 0.02, 1), { position: [-1.71, 1.06, 0] }),
    transformMesh(bevelBoxMesh(0.12, 0.84, 0.84, 0.02, 1), { position: [1.71, 1.06, 0] }),
    transformMesh(extrudePolygonMesh(fivePointStarPolygon(0.24, 0.11), 0.9, { bevel: 0.02, centerZ: true }), { position: [0, 3.56, -0.45] })
  ]);
  return stampNoCastShadow(
    assembleMultiMaterialNode(
      name,
      [
        { mesh: carvedStoneJambs, material: PBL_MAT.limestone },
        { mesh: carvedTimberInlay, material: PBL_MAT.oakTimber },
        { mesh: mergeSubmeshes(sunGoldFiligree), material: PBL_MAT.sunGold },
        { mesh: mossCaps, material: PBL_MAT.velvetMoss },
        { mesh: solarInlays, material: PBL_MAT.sunRibGlow }
      ],
      { position: [...pos], rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesce: false }
    ).runtime(runtimeSpec)
  );
}

export function buildSunGateRuneRingNode(name: string, pos: readonly [number, number, number], mat: AuraMaterialSpec, runtimeSpec: Parameters<AuraNodeBuilder<AuraPrimitiveNode>["runtime"]>[0]): AuraNodeBuilder<AuraPrimitiveNode> {
  const ringPts: [number, number, number][] = [];
  const ringRadii: number[] = [];
  const segs = 28;
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * TAU;
    ringPts.push([Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0]);
    ringRadii.push(0.085 + 0.015 * Math.cos(a * 6));
  }
  const geo = buildCustomGeometry(tubeSweepMesh(ringPts, ringRadii, 10));
  return geometry.custom(geo, {
    name,
    position: [...pos],
    material: mat,
    castShadow: false,
    receiveShadow: false
  }).runtime(runtimeSpec);
}

/* -------------------------------------------------------------------------- */
/* 3. Woodland Landmarks, Updraft Fans & Architectural Props                  */
/* -------------------------------------------------------------------------- */

export interface DecorBucketPart {
  readonly paletteKey: keyof typeof PBL_MAT;
  readonly mesh: ProceduralMesh;
}

function windmillParts(): readonly DecorBucketPart[] {
  const stoneBase = latheMesh([[0, 0], [1.18, 0], [1.12, 0.32], [0.96, 1.35], [0, 1.35]], 10);
  const timberTower = latheMesh([[0, 1.32], [0.98, 1.32], [0.76, 3.35], [0, 3.35]], 8);
  const cap = latheMesh([[0, 3.3], [0.84, 3.3], [0.62, 3.82], [0.16, 4.18], [0, 4.24]], 12);
  const hub = mergeSubmeshes([
    transformMesh(latheMesh([[0, 0], [0.16, 0], [0.14, 0.42], [0, 0.46]], 12), { position: [0, 3.45, 0.68], rotation: [Math.PI * 0.5, 0, 0] }),
    transformMesh(latheMesh([[0, 4.2], [0.08, 4.25], [0.04, 4.42], [0, 4.48]], 10), { position: [0, 0, 0] })
  ]);
  const arms: ProceduralMesh[] = [timberTower];
  const sails: ProceduralMesh[] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + 0.38;
    arms.push(
      transformMesh(bevelBoxMesh(0.09, 2.05, 0.08, 0.015, 1), {
        position: [Math.cos(a) * 1.05, 3.45 + Math.sin(a) * 1.05, 1.02],
        rotation: [0, 0, a - Math.PI * 0.5]
      })
    );
    sails.push(
      transformMesh(
        loftSectionsMesh([
          { z: 0.18, width: 0.34, height: 0.025 },
          { z: 1.05, width: 0.44, height: 0.035, x: 0.04 },
          { z: 1.92, width: 0.36, height: 0.025, x: 0.02 }
        ]),
        { position: [0, 3.45, 1.04], rotation: [-Math.PI * 0.5, 0, a - Math.PI * 0.5] }
      )
    );
  }
  return [
    { paletteKey: "limestone", mesh: stoneBase },
    { paletteKey: "oakTimber", mesh: mergeSubmeshes(arms) },
    { paletteKey: "slateRoof", mesh: cap },
    { paletteKey: "sunGold", mesh: hub },
    { paletteKey: "linenSail", mesh: mergeSubmeshes(sails) }
  ];
}

function watchtowerParts(): readonly DecorBucketPart[] {
  const shaft = mergeSubmeshes([
    latheMesh([[0, 0], [1.05, 0], [0.98, 0.38], [0.84, 2.65], [0, 2.65]], 10),
    transformMesh(bevelBoxMesh(1.9, 0.18, 1.9, 0.03, 1), { position: [0, 2.72, 0] })
  ]);
  const posts: ProceduralMesh[] = [
    transformMesh(bevelBoxMesh(2.04, 0.36, 2.04, 0.04, 1), { position: [0, 2.98, 0] })
  ];
  for (const sx of [-0.82, 0.82]) {
    for (const sz of [-0.82, 0.82]) {
      posts.push(transformMesh(bevelBoxMesh(0.14, 0.85, 0.14, 0.02, 1), { position: [sx, 3.48, sz] }));
    }
  }
  const roof = latheMesh([[0, 3.84], [1.32, 3.84], [0.82, 4.55], [0.22, 5.1], [0, 5.22]], 12);
  const finial = latheMesh([[0, 5.18], [0.09, 5.26], [0.05, 5.46], [0, 5.56]], 10);
  return [
    { paletteKey: "limestone", mesh: shaft },
    { paletteKey: "oakTimber", mesh: mergeSubmeshes(posts) },
    { paletteKey: "slateRoof", mesh: roof },
    { paletteKey: "sunGold", mesh: finial }
  ];
}

export function buildUpdraftFanNode(name: string, pos: readonly [number, number, number], yaw: number, scale: number, runtimeSpec?: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  const stoneRing = latheMesh([[0.72, 0], [1.08, 0], [1.1, 0.18], [0.86, 0.28], [0.68, 0.24]], 18);
  const woodParts: ProceduralMesh[] = [
    latheMesh([[0, 0.06], [0.28, 0.06], [0.3, 0.34], [0.22, 0.42], [0, 0.44]], 14)
  ];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    woodParts.push(
      transformMesh(
        loftSectionsMesh([
          { z: 0.24, width: 0.18, height: 0.04 },
          { z: 0.62, width: 0.34, height: 0.045 },
          { z: 0.94, width: 0.26, height: 0.03 }
        ]),
        { position: [0, 0.28, 0], rotation: [0, a, 0.42] }
      )
    );
  }
  const ironHub = latheMesh([[0, 0.4], [0.16, 0.41], [0.12, 0.5], [0, 0.53]], 12);
  const node = assembleMultiMaterialNode(
    name,
    [
      { mesh: stoneRing, material: PBL_MAT.limestone },
      { mesh: mergeSubmeshes(woodParts), material: PBL_MAT.oakTimber },
      { mesh: ironHub, material: PBL_MAT.copperCoil }
    ],
    { position: [...pos], rotation: [0, yaw, 0], scale, castShadow: true, receiveShadow: true }
  );
  return runtimeSpec ? node.runtime(runtimeSpec) : node;
}

function mossyPillarParts(): readonly DecorBucketPart[] {
  const column = mergeSubmeshes([
    transformMesh(bevelBoxMesh(0.92, 0.26, 0.92, 0.04, 1), { position: [0, 0.13, 0] }),
    latheMesh([[0, 0.24], [0.38, 0.24], [0.34, 1.4], [0.36, 2.35], [0.44, 2.52], [0, 2.55]], 12),
    transformMesh(bevelBoxMesh(0.88, 0.22, 0.88, 0.04, 1), { position: [0, 2.64, 0] })
  ]);
  const mossCap = latheMesh([[0, 2.72], [0.48, 2.72], [0.52, 2.82], [0.34, 2.94], [0, 2.98]], 12);
  const runeCollar = latheMesh([[0.34, 1.42], [0.39, 1.44], [0.39, 1.58], [0.34, 1.6]], 12);
  return [
    { paletteKey: "limestone", mesh: column },
    { paletteKey: "velvetMoss", mesh: mossCap },
    { paletteKey: "cyanRuneGlow", mesh: runeCollar }
  ];
}

function woodlandArchParts(): readonly DecorBucketPart[] {
  const slots = archwayVoussoirSlots({
    clearHalfSpan: 1.45,
    springY: 1.85,
    jambWidth: 0.52,
    depth: 0.68,
    voussoirCount: 9,
    keystoneScale: 1.2,
    bevel: 0.04
  });
  const crownMedallion = mergeSubmeshes([
    slots[1]!.mesh,
    transformMesh(latheMesh([[0, -0.36], [0.28, -0.34], [0.28, 0.34], [0, 0.36]], 16), {
      position: [0, 3.55, 0],
      rotation: [Math.PI * 0.5, 0, 0]
    })
  ]);
  const moss = mergeSubmeshes([
    transformMesh(icosphereSmoothMesh(0.26, 1, 0.04, 41, 0.25), { position: [-1.71, 1.9, 0], scale: [1.3, 0.4, 1.4] }),
    transformMesh(icosphereSmoothMesh(0.26, 1, 0.04, 53, 0.25), { position: [1.71, 1.9, 0], scale: [1.3, 0.4, 1.4] })
  ]);
  return [
    { paletteKey: "oakTimber", mesh: slots[0]!.mesh },
    { paletteKey: "sunGold", mesh: crownMedallion },
    { paletteKey: "velvetMoss", mesh: moss }
  ];
}

function woodlandLanternParts(): readonly DecorBucketPart[] {
  const plinth = latheMesh([[0, 0], [0.32, 0], [0.3, 0.18], [0.2, 0.28], [0, 0.28]], 12);
  const iron = mergeSubmeshes([
    tubeSweepMesh(
      [[0, 0.26, 0], [0, 1.55, 0], [0.06, 2.18, 0], [0.34, 2.38, 0], [0.52, 2.22, 0]],
      [0.055, 0.046, 0.038, 0.032, 0.028],
      8
    ),
    transformMesh(latheMesh([[0, 0], [0.22, 0.06], [0.14, 0.16], [0, 0.22]], 8), { position: [0.52, 2.02, 0] }),
    transformMesh(latheMesh([[0, 0], [0.15, 0], [0.18, 0.06], [0, 0.08]], 8), { position: [0.52, 1.66, 0] })
  ]);
  const flame = transformMesh(latheMesh([[0, 0], [0.13, 0.06], [0.15, 0.18], [0.12, 0.3], [0, 0.34]], 10), { position: [0.52, 1.72, 0] });
  return [
    { paletteKey: "limestone", mesh: plinth },
    { paletteKey: "wroughtIron", mesh: iron },
    { paletteKey: "amberLanternGlow", mesh: flame }
  ];
}

function crateParts(): readonly DecorBucketPart[] {
  const wood = mergeSubmeshes([
    transformMesh(bevelBoxMesh(0.86, 0.86, 0.86, 0.04, 1), { position: [0, 0.43, 0] }),
    transformMesh(bevelBoxMesh(0.94, 0.1, 0.94, 0.02, 1), { position: [0, 0.08, 0] }),
    transformMesh(bevelBoxMesh(0.94, 0.1, 0.94, 0.02, 1), { position: [0, 0.78, 0] })
  ]);
  const bands = mergeSubmeshes([
    transformMesh(bevelBoxMesh(0.92, 0.08, 0.92, 0.015, 1), { position: [0, 0.43, 0] }),
    transformMesh(bevelBoxMesh(0.1, 0.88, 0.92, 0.015, 1), { position: [-0.38, 0.44, 0] }),
    transformMesh(bevelBoxMesh(0.1, 0.88, 0.92, 0.015, 1), { position: [0.38, 0.44, 0] })
  ]);
  return [
    { paletteKey: "oakTimber", mesh: wood },
    { paletteKey: "wroughtIron", mesh: bands }
  ];
}

function barrelParts(): readonly DecorBucketPart[] {
  const staves = latheMesh([[0, 0], [0.36, 0], [0.43, 0.24], [0.46, 0.5], [0.43, 0.76], [0.36, 0.98], [0, 0.98]], 16);
  const hoops = mergeSubmeshes([
    latheMesh([[0.38, 0.12], [0.42, 0.12], [0.43, 0.19], [0.39, 0.19]], 16),
    latheMesh([[0.45, 0.46], [0.48, 0.46], [0.48, 0.54], [0.45, 0.54]], 16),
    latheMesh([[0.38, 0.8], [0.42, 0.8], [0.43, 0.87], [0.39, 0.87]], 16)
  ]);
  return [
    { paletteKey: "oakTimber", mesh: staves },
    { paletteKey: "wroughtIron", mesh: hoops }
  ];
}

function emberVentParts(): readonly DecorBucketPart[] {
  const cone = toFlatShaded(
    latheMesh([[0, 0], [0.82, 0], [0.74, 0.28], [0.56, 0.64], [0.44, 0.96], [0.28, 0.94], [0.22, 0.6]], 12)
  );
  const throat = latheMesh([[0, 0.55], [0.26, 0.58], [0.3, 0.88], [0, 0.9]], 12);
  return [
    { paletteKey: "basaltRock", mesh: cone },
    { paletteKey: "magmaEmber", mesh: throat }
  ];
}

function cumulusCloudParts(): readonly DecorBucketPart[] {
  // Smooth billowing cumulus puffs — never flat-shaded!
  const puff = latheMesh([[0, -0.32], [0.28, -0.26], [0.46, -0.06], [0.48, 0.12], [0.34, 0.3], [0.14, 0.38], [0, 0.4]], 14);
  const cloud = mergeSubmeshes([
    transformMesh(puff, { position: [0, 0.18, 0], scale: [1.35, 1.15, 1.1] }),
    transformMesh(puff, { position: [-0.55, 0.06, 0.08], scale: [1.0, 0.88, 0.92] }),
    transformMesh(puff, { position: [0.58, 0.08, -0.05], scale: [1.05, 0.92, 0.95] }),
    transformMesh(puff, { position: [-0.22, 0.28, -0.14], scale: [0.85, 0.82, 0.85] }),
    transformMesh(puff, { position: [0.24, 0.26, 0.16], scale: [0.88, 0.8, 0.86] })
  ]);
  return [{ paletteKey: "cumulusPuff", mesh: cloud }];
}

/* -------------------------------------------------------------------------- */
/* 4. Woodland Trees, Toadstools, Crystals, Brambles & Critters               */
/* -------------------------------------------------------------------------- */

function canopyTreeParts(): readonly DecorBucketPart[] {
  const trunk = mergeSubmeshes([
    tubeSweepMesh([[0, 0, 0], [0.06, 0.85, -0.04], [-0.04, 1.85, 0.05], [0.04, 2.65, 0]], [0.38, 0.25, 0.19, 0.13], 10),
    tubeSweepMesh([[-0.02, 1.65, 0.03], [-0.42, 2.25, 0.16], [-0.74, 2.62, 0.22]], [0.14, 0.09, 0.05], 8),
    tubeSweepMesh([[0.03, 1.8, -0.02], [0.46, 2.38, -0.14], [0.76, 2.7, -0.2]], [0.13, 0.085, 0.048], 8)
  ]);
  const crown = transformMesh(layeredCanopyMesh({ radius: 1.62, height: 1.95, puffs: 11, seed: 31 }), { position: [0, 2.95, 0] });
  return [
    { paletteKey: "roughBark", mesh: trunk },
    { paletteKey: "emeraldLeaf", mesh: crown }
  ];
}

function coniferTreeParts(): readonly DecorBucketPart[] {
  const trunk = mergeSubmeshes([
    tubeSweepMesh([[0, 0, 0], [0, 1.55, 0], [0, 3.45, 0]], [0.31, 0.19, 0.075], 9),
    tubeSweepMesh([[-0.22, 0, 0.16], [-0.08, 0.34, 0.05]], [0.11, 0.05], 6),
    tubeSweepMesh([[0.22, 0, -0.15], [0.08, 0.32, -0.05]], [0.11, 0.05], 6)
  ]);
  const boughs = transformMesh(coniferBoughTierMesh({ radius: 1.58, height: 3.18, tiers: 6, seed: 37 }), { position: [0, 0.68, 0] });
  return [
    { paletteKey: "roughBark", mesh: trunk },
    { paletteKey: "pineNeedle", mesh: boughs }
  ];
}

function toadstoolParts(): readonly DecorBucketPart[] {
  // Smooth organic Amanita stem, gills, cap and raised veil spots — never flat-shaded!
  const stem = latheMesh([[0, 0], [0.22, 0], [0.24, 0.16], [0.16, 0.56], [0.15, 0.86], [0, 0.88]], 16);
  const skirtRing = latheMesh([[0.15, 0.62], [0.26, 0.56], [0.24, 0.66], [0.15, 0.68]], 14);
  const cap = latheMesh([[0, 0.82], [0.58, 0.8], [0.64, 0.92], [0.5, 1.14], [0.24, 1.28], [0, 1.32]], 20);
  const spots: ProceduralMesh[] = [stem, skirtRing];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + 0.3;
    const spot = latheMesh([[0, 0], [0.085, 0], [0.072, 0.026], [0, 0.038]], 10);
    spots.push(transformMesh(spot, { position: [Math.cos(a) * 0.35, 1.13, Math.sin(a) * 0.35], rotation: [Math.sin(a) * 0.34, 0, -Math.cos(a) * 0.34] }));
  }
  spots.push(transformMesh(latheMesh([[0, 0], [0.095, 0], [0.076, 0.03], [0, 0.042]], 10), { position: [0, 1.29, 0] }));
  return [
    { paletteKey: "crimsonLacquer", mesh: cap },
    { paletteKey: "creamCapSpot", mesh: mergeSubmeshes(spots) }
  ];
}

function woodlandFlowerParts(): readonly DecorBucketPart[] {
  const stemAndLeaves = mergeSubmeshes([
    tubeSweepMesh([[0, 0, 0], [0.03, 0.34, 0], [-0.02, 0.68, 0.02]], [0.036, 0.028, 0.022], 7),
    transformMesh(loftSectionsMesh([{ z: 0, width: 0.04, height: 0.015 }, { z: 0.16, width: 0.12, height: 0.02, y: 0.03 }, { z: 0.28, width: 0.02, height: 0.01 }]), { position: [0.02, 0.22, 0], rotation: [-0.25, 0.5, 0] }),
    transformMesh(loftSectionsMesh([{ z: 0, width: 0.04, height: 0.015 }, { z: 0.15, width: 0.11, height: 0.02, y: 0.03 }, { z: 0.26, width: 0.02, height: 0.01 }]), { position: [-0.01, 0.32, 0], rotation: [-0.25, -2.4, 0] })
  ]);
  const petals: ProceduralMesh[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    petals.push(
      transformMesh(
        loftSectionsMesh([
          { z: 0.04, width: 0.07, height: 0.02 },
          { z: 0.16, width: 0.15, height: 0.026, y: 0.03 },
          { z: 0.26, width: 0.06, height: 0.014, y: 0.01 }
        ]),
        { position: [-0.02, 0.68, 0.02], rotation: [-0.18, a, 0] }
      )
    );
  }
  const stamen = transformMesh(latheMesh([[0, 0], [0.08, 0.02], [0.07, 0.07], [0, 0.09]], 12), { position: [-0.02, 0.67, 0.02] });
  return [
    { paletteKey: "emeraldLeaf", mesh: stemAndLeaves },
    { paletteKey: "petalBlossom", mesh: mergeSubmeshes(petals) },
    { paletteKey: "sunGold", mesh: stamen }
  ];
}

function mossyBoulderParts(): readonly DecorBucketPart[] {
  const rock = mergeSubmeshes([
    transformMesh(icosphereFacetMesh(0.58, 1, 0.16, 19), { position: [0, 0.36, 0], scale: [1.15, 0.82, 0.98] }),
    transformMesh(icosphereFacetMesh(0.34, 1, 0.14, 43), { position: [0.42, 0.22, 0.24], scale: [1.05, 0.78, 0.92] })
  ]);
  const moss = latheMesh([[0, 0.62], [0.42, 0.58], [0.46, 0.66], [0.28, 0.75], [0, 0.78]], 12);
  return [
    { paletteKey: "mossyStone", mesh: rock },
    { paletteKey: "velvetMoss", mesh: moss }
  ];
}

function hexPrismPolygon(r: number): readonly (readonly [number, number])[] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function quartzCrystalSpire(radius: number, height: number): ProceduralMesh {
  const shaftH = height * 0.72;
  const shaft = transformMesh(extrudePolygonMesh(hexPrismPolygon(radius), shaftH, { bevel: 0 }), { rotation: [-Math.PI * 0.5, 0, 0] });
  const tip = latheMesh([[radius, shaftH], [radius * 0.45, shaftH + height * 0.18], [0, height]], 6);
  return toFlatShaded(mergeSubmeshes([shaft, tip]));
}

function quartzCrystalParts(): readonly DecorBucketPart[] {
  const spires = mergeSubmeshes([
    quartzCrystalSpire(0.18, 1.38),
    transformMesh(quartzCrystalSpire(0.14, 1.04), { position: [0.22, 0, 0.12], rotation: [0.16, 0.5, -0.24] }),
    transformMesh(quartzCrystalSpire(0.13, 0.92), { position: [-0.2, 0, 0.14], rotation: [0.2, -0.4, 0.26] }),
    transformMesh(quartzCrystalSpire(0.11, 0.76), { position: [0.1, 0, -0.22], rotation: [-0.26, 0.2, -0.14] }),
    transformMesh(quartzCrystalSpire(0.1, 0.68), { position: [-0.16, 0, -0.18], rotation: [-0.22, -0.6, 0.2] })
  ]);
  const base = transformMesh(icosphereFacetMesh(0.38, 1, 0.14, 71), { position: [0, 0.14, 0], scale: [1.2, 0.55, 1.15] });
  return [
    { paletteKey: "quartzCrystal", mesh: spires },
    { paletteKey: "mossyStone", mesh: base }
  ];
}

let cachedBossSpikeGeo: { spec: AuraCustomGeometrySpec; materials: readonly AuraMaterialSpec[] } | null = null;
export function buildBossThornSpikeNode(name: string, pos: readonly [number, number, number], runtimeSpec: Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0]): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedBossSpikeGeo) {
    const parts = quartzCrystalParts();
    cachedBossSpikeGeo = {
      spec: buildGroupedGeometrySpec(parts.map((p) => transformMesh(p.mesh, { scale: 0.65 }))),
      materials: [PBL_MAT.crimsonLacquer, PBL_MAT.roughBark]
    };
  }
  return stampNoCastShadow(
    geometry.multiMaterial(cachedBossSpikeGeo.spec, cachedBossSpikeGeo.materials, {
      name,
      position: [...pos],
      castShadow: false,
      receiveShadow: true
    }).runtime(runtimeSpec)
  );
}

const THORN_VERTEX_MAT = material.matteClay({ name: "gnarled bramble thorns", color: "#ffffff", roughness: 0.84 });

/** Gnarled thorny bramble vines (`thorns`), faceted frost crystal cluster (`frost`), or basalt ember vents (`ember`/`lava`). */
export function buildHazardFeatureNode(name: string, pos: readonly [number, number, number], w: number, d: number, kind: "thorns" | "frost" | "ember" | "lava"): AuraNodeBuilder<AuraGroupNode> {
  if (kind === "ember" || kind === "lava") {
    const parts = emberVentParts();
    const count = Math.max(1, Math.min(4, Math.round(Math.max(w, d) / 1.4)));
    const cones: ProceduralMesh[] = [];
    const throats: ProceduralMesh[] = [];
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
      const ox = w >= d ? t * (w * 0.65) : 0;
      const oz = d > w ? t * (d * 0.65) : 0;
      cones.push(transformMesh(parts[0]!.mesh, { position: [ox, 0, oz], scale: [0.55, 0.52, 0.55] }));
      throats.push(transformMesh(parts[1]!.mesh, { position: [ox, 0, oz], scale: [0.55, 0.52, 0.55] }));
    }
    return stampNoCastShadow(
      assembleMultiMaterialNode(
        name,
        [
          { mesh: mergeSubmeshes(cones), material: PBL_MAT.basaltRock },
          { mesh: mergeSubmeshes(throats), material: PBL_MAT.magmaEmber }
        ],
        { position: [...pos], castShadow: false, receiveShadow: true, coalesce: false }
      )
    );
  }
  if (kind === "frost") {
    const count = Math.max(2, Math.min(6, Math.round(Math.max(w, d) / 0.85)));
    const shards: ProceduralMesh[] = [];
    const rocks: ProceduralMesh[] = [];
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
      const ox = w >= d ? t * (w * 0.72) : ((i % 2) - 0.5) * (w * 0.36);
      const oz = d > w ? t * (d * 0.72) : (((i + 1) % 2) - 0.5) * (d * 0.36);
      const parts = quartzCrystalParts();
      shards.push(transformMesh(parts[0]!.mesh, { position: [ox, 0, oz], rotation: [0, i * 1.1, 0], scale: 0.62 }));
      rocks.push(transformMesh(parts[1]!.mesh, { position: [ox, 0, oz], scale: 0.65 }));
    }
    return stampNoCastShadow(
      assembleMultiMaterialNode(
        name,
        [
          { mesh: mergeSubmeshes(shards), material: PBL_MAT.quartzCrystal },
          { mesh: mergeSubmeshes(rocks), material: PBL_MAT.mossyStone }
        ],
        { position: [...pos], castShadow: false, receiveShadow: true, coalesce: false }
      )
    );
  }
  const spanX = Math.max(0.45, w * 0.44);
  const spanZ = Math.max(0.45, d * 0.44);
  const vines: ProceduralMesh[] = [
    tubeSweepMesh([[-spanX, 0.08, -spanZ * 0.5], [-spanX * 0.3, 0.34, spanZ * 0.4], [spanX * 0.35, 0.28, -spanZ * 0.35], [spanX, 0.1, spanZ * 0.45]], [0.075, 0.09, 0.085, 0.07], 8),
    tubeSweepMesh([[-spanX * 0.85, 0.1, spanZ * 0.55], [0, 0.38, 0], [spanX * 0.88, 0.12, -spanZ * 0.5]], [0.07, 0.095, 0.07], 8)
  ];
  const thorns: ProceduralMesh[] = [];
  const thornCount = 10;
  for (let i = 0; i < thornCount; i += 1) {
    const t = i / (thornCount - 1) - 0.5;
    const tx = t * spanX * 1.65;
    const tz = Math.sin(i * 1.9) * spanZ * 0.55;
    thorns.push(
      transformMesh(latheMesh([[0, 0], [0.055, 0], [0.024, 0.14], [0, 0.24]], 6), {
        position: [tx, 0.22 + (i % 2) * 0.08, tz],
        rotation: [(i % 2 === 0 ? 0.28 : -0.28), i * 0.8, 0]
      })
    );
  }
  const combinedThorns = mergeSubmeshes([
    paintMeshColors(mergeSubmeshes(vines), [0.36, 0.23, 0.14]),
    paintMeshColors(mergeSubmeshes(thorns), [0.76, 0.18, 0.16])
  ]);
  return stampNoCastShadow(
    group(name, [
      geometry.custom(buildCustomGeometry(combinedThorns), {
        name: `${name}:patch`,
        material: THORN_VERTEX_MAT,
        castShadow: false,
        receiveShadow: true
      })
    ]).position(pos[0], pos[1], pos[2])
  );
}

const CRITTER_PLUSH_VERTEX_MAT = material.fabric({
  name: "woodland critter plush",
  color: "#ffffff",
  roughness: 0.8,
  sheen: 0.34,
  sheenColor: "#fff2de"
});
const BEETLE_CHITIN_VERTEX_MAT = material.lacquer({
  name: "forest beetle vertex chitin",
  color: "#ffffff",
  roughness: 0.2,
  clearcoat: 0.84
});

/** Spiny procedural woodland Hedgehog villager (`pbl-villager:*` helper role). */
let cachedHedgehogGeo: { spec: AuraCustomGeometrySpec; materials: readonly AuraMaterialSpec[] } | null = null;
export function buildHedgehogVillagerNode(name: string, pos: readonly [number, number, number], yaw: number): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedHedgehogGeo) {
    const bellyAndSnout = subdivideSmoothMesh(
      mergeSubmeshes([
        transformMesh(latheMesh([[0, -0.34], [0.26, -0.28], [0.38, -0.06], [0.36, 0.16], [0.22, 0.3], [0, 0.34]], 14), { position: [0, 0.42, -0.04], scale: [1, 0.92, 1.15] }),
        transformMesh(
          loftSectionsMesh([
            { z: 0.16, width: 0.44, height: 0.38, y: 0.44 },
            { z: 0.38, width: 0.28, height: 0.24, y: 0.4 },
            { z: 0.56, width: 0.11, height: 0.1, y: 0.38 }
          ]),
          { position: [0, 0, 0] }
        ),
        transformMesh(latheMesh([[0, 0], [0.09, 0.02], [0.08, 0.11], [0, 0.13]], 10), { position: [-0.18, 0.64, 0.16], rotation: [0.2, 0, 0.35] }),
        transformMesh(latheMesh([[0, 0], [0.09, 0.02], [0.08, 0.11], [0, 0.13]], 10), { position: [0.18, 0.64, 0.16], rotation: [0.2, 0, -0.35] }),
        transformMesh(bevelBoxMesh(0.14, 0.12, 0.22, 0.04, 1), { position: [-0.18, 0.06, 0.14] }),
        transformMesh(bevelBoxMesh(0.14, 0.12, 0.22, 0.04, 1), { position: [0.18, 0.06, 0.14] }),
        transformMesh(bevelBoxMesh(0.14, 0.12, 0.2, 0.04, 1), { position: [-0.2, 0.06, -0.22] }),
        transformMesh(bevelBoxMesh(0.14, 0.12, 0.2, 0.04, 1), { position: [0.2, 0.06, -0.22] })
      ]),
      1,
      0.42
    );
    const coat = transformMesh(latheMesh([[0, -0.36], [0.3, -0.3], [0.44, -0.05], [0.42, 0.22], [0.26, 0.38], [0, 0.42]], 16), {
      position: [0, 0.52, -0.12],
      rotation: [-0.22, 0, 0]
    });
    const quills: ProceduralMesh[] = [coat];
    const quillCone = latheMesh([[0, 0], [0.065, 0.02], [0.036, 0.2], [0, 0.38]], 7);
    for (let row = 0; row < 3; row += 1) {
      const count = 5 + row;
      for (let i = 0; i < count; i += 1) {
        const u = (i / (count - 1) - 0.5) * 1.25;
        const pitch = -0.65 - row * 0.28;
        quills.push(
          transformMesh(quillCone, {
            position: [Math.sin(u) * (0.28 + row * 0.05), 0.72 - row * 0.13, -0.04 - row * 0.16],
            rotation: [pitch, 0, -u * 0.65]
          })
        );
      }
    }
    const bead = latheMesh([[0, -0.045], [0.042, -0.02], [0.045, 0.02], [0, 0.045]], 10);
    const eyesAndNose = mergeSubmeshes([
      transformMesh(bead, { position: [0, 0.39, 0.58], scale: 1.15 }),
      transformMesh(bead, { position: [-0.12, 0.5, 0.35] }),
      transformMesh(bead, { position: [0.12, 0.5, 0.35] })
    ]);
    const scarf = latheMesh([[0.22, 0.28], [0.31, 0.26], [0.32, 0.35], [0.22, 0.36]], 14);
    const plushCombined = mergeSubmeshes([
      paintMeshColors(bellyAndSnout, [0.93, 0.85, 0.74]),
      paintMeshColors(mergeSubmeshes(quills), [0.36, 0.24, 0.16]),
      paintMeshColors(scarf, [0.85, 0.29, 0.22])
    ]);
    cachedHedgehogGeo = {
      spec: buildGroupedGeometrySpec([plushCombined, eyesAndNose]),
      materials: [CRITTER_PLUSH_VERTEX_MAT, PBL_MAT.glossyEye]
    };
  }
  return stampNoCastShadow(
    geometry.multiMaterial(cachedHedgehogGeo.spec, cachedHedgehogGeo.materials, {
      name,
      position: [...pos],
      rotation: [0, yaw, 0],
      scale: 1.15,
      castShadow: false,
      receiveShadow: true
    })
  );
}

/** Low, cute, rounded 6-legged glossy iridescent carapace forest beetle (`pbl-villager:*` sidekick/beetle role — hugs the ground, never bipedal!). */
let cachedForestBeetleGeo: { spec: AuraCustomGeometrySpec; materials: readonly AuraMaterialSpec[] } | null = null;
export function buildForestBeetleNode(name: string, pos: readonly [number, number, number], yaw: number): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedForestBeetleGeo) {
    const elytronHalf = icosphereSmoothMesh(0.26, 2, 0.01, 17, 0.28);
    const pronotum = subdivideSmoothMesh(
      loftSectionsMesh([
        { z: 0.06, width: 0.44, height: 0.28, y: 0.22 },
        { z: 0.22, width: 0.42, height: 0.26, y: 0.21 },
        { z: 0.36, width: 0.28, height: 0.19, y: 0.18 }
      ]),
      1,
      0.48
    );
    const carapace = mergeSubmeshes([
      transformMesh(elytronHalf, { position: [-0.095, 0.23, -0.09], rotation: [-0.06, 0.05, 0.16], scale: [0.82, 0.78, 1.38] }),
      transformMesh(elytronHalf, { position: [0.095, 0.23, -0.09], rotation: [-0.06, -0.05, -0.16], scale: [0.82, 0.78, 1.38] }),
      pronotum
    ]);

    const chitinParts: ProceduralMesh[] = [
      tubeSweepMesh([[0, 0.39, 0.08], [0, 0.415, -0.1], [0, 0.34, -0.34], [0, 0.2, -0.45]], [0.018, 0.02, 0.018, 0.012], 7),
      transformMesh(icosphereSmoothMesh(0.24, 1, 0.008, 23, 0.1), { position: [0, 0.14, -0.04], scale: [1.15, 0.48, 1.55] }),
      transformMesh(icosphereSmoothMesh(0.15, 2, 0.006, 29, 0.2), { position: [0, 0.17, 0.4], scale: [1.08, 0.86, 0.96] })
    ];
    const legSpecs: readonly { readonly z0: number; readonly zMid: number; readonly zTip: number; readonly xOut: number }[] = [
      { z0: 0.22, zMid: 0.3, zTip: 0.36, xOut: 0.34 },
      { z0: 0.0, zMid: 0.01, zTip: 0.02, xOut: 0.38 },
      { z0: -0.22, zMid: -0.3, zTip: -0.38, xOut: 0.35 }
    ];
    for (const side of [-1, 1] as const) {
      for (const leg of legSpecs) {
        chitinParts.push(
          tubeSweepMesh(
            [
              [side * 0.17, 0.15, leg.z0],
              [side * (leg.xOut * 0.82), 0.18, leg.zMid],
              [side * leg.xOut, 0.08, leg.zTip],
              [side * (leg.xOut + 0.03), 0.025, leg.zTip + 0.02]
            ],
            [0.042, 0.038, 0.03, 0.024],
            8
          ),
          transformMesh(icosphereSmoothMesh(0.038, 1, 0.004, 31, 0.2), {
            position: [side * (leg.xOut + 0.035), 0.026, leg.zTip + 0.03],
            scale: [1.1, 0.62, 1.35]
          })
        );
      }
      chitinParts.push(
        tubeSweepMesh(
          [
            [side * 0.075, 0.22, 0.5],
            [side * 0.14, 0.31, 0.58],
            [side * 0.2, 0.34, 0.63]
          ],
          [0.018, 0.014, 0.024],
          7
        ),
        transformMesh(icosphereSmoothMesh(0.032, 1, 0.003, 41, 0.2), {
          position: [side * 0.205, 0.345, 0.64],
          scale: [1.1, 0.9, 1.25]
        })
      );
    }

    const eyeBead = icosphereSmoothMesh(0.046, 1, 0.002, 47, 0.15);
    const eyes = mergeSubmeshes([
      transformMesh(eyeBead, { position: [-0.105, 0.21, 0.49] }),
      transformMesh(eyeBead, { position: [0.105, 0.21, 0.49] })
    ]);
    const catchlight = icosphereSmoothMesh(0.016, 1, 0.001, 53, 0.2);
    const scutellum = transformMesh(icosphereSmoothMesh(0.055, 1, 0.003, 59, 0.3), { position: [0, 0.395, 0.06], scale: [1.15, 0.45, 1.25] });
    const catchlights = mergeSubmeshes([
      transformMesh(catchlight, { position: [-0.118, 0.228, 0.525] }),
      transformMesh(catchlight, { position: [0.118, 0.228, 0.525] })
    ]);
    const chitinAndDetails = mergeSubmeshes([
      paintMeshColors(mergeSubmeshes(chitinParts), [0.16, 0.12, 0.11]),
      paintMeshColors(eyes, [0.08, 0.06, 0.06]),
      paintMeshColors(scutellum, [0.98, 0.76, 0.24]),
      paintMeshColors(catchlights, [1.0, 0.98, 0.94])
    ]);

    cachedForestBeetleGeo = {
      spec: buildGroupedGeometrySpec([carapace, chitinAndDetails]),
      materials: [PBL_MAT.beetleCarapace, BEETLE_CHITIN_VERTEX_MAT]
    };
  }
  return stampNoCastShadow(
    geometry.multiMaterial(cachedForestBeetleGeo.spec, cachedForestBeetleGeo.materials, {
      name,
      position: [...pos],
      rotation: [0, yaw, 0],
      scale: 1.08,
      castShadow: false,
      receiveShadow: true
    })
  );
}

/** Sleek brass-and-enamel quad-rotor beetle/patrol scout drone with sculpted carapace, circular prop-guard rings & compound optic. */
function scoutDroneParts(): readonly DecorBucketPart[] {
  const enamelCarapace = transformMesh(
    subdivideSmoothMesh(
      sculptStreamlinedHullMesh(0.76, 0.42, 0.24, { noseSharpness: 0.38, tailTaper: 0.34, canopyBulge: 0.04 }),
      1,
      0.54
    ),
    { position: [0, 0.54, 0] }
  );
  const brassParts: ProceduralMesh[] = [
    transformMesh(latheMesh([[0, 0], [0.18, 0], [0.16, 0.095], [0.075, 0.145], [0, 0.16]], 16), { position: [0, 0.63, 0.02] }),
    tubeSweepMesh([[0, 0.76, -0.02], [0, 0.88, -0.06]], [0.018, 0.01], 6),
    transformMesh(icosphereSmoothMesh(0.028, 1, 0.001, 63, 0.1), { position: [0, 0.89, -0.065] }),
    // Brass dorsal wing-seam trim & front bezel ring
    tubeSweepMesh([[0, 0.64, 0.22], [0, 0.66, -0.06], [0, 0.58, -0.34]], [0.022, 0.024, 0.016], 7),
    transformMesh(latheMesh([[0.055, -0.02], [0.088, -0.02], [0.088, 0.03], [0.055, 0.03]], 14), {
      position: [0, 0.52, 0.36],
      rotation: [Math.PI * 0.5, 0, 0]
    })
  ];
  const guardAndRotors: ProceduralMesh[] = [];

  const ringSegs = 18;
  const guardRingPts: [number, number, number][] = [];
  const guardRingRadii: number[] = [];
  for (let i = 0; i <= ringSegs; i += 1) {
    const a = (i / ringSegs) * TAU;
    guardRingPts.push([Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26]);
    guardRingRadii.push(0.026);
  }
  const propGuardRing = tubeSweepMesh(guardRingPts, guardRingRadii, 8);
  const rotorBlade = bevelBoxMesh(0.42, 0.014, 0.058, 0.005, 1);
  const rotorHub = latheMesh([[0, -0.03], [0.048, -0.03], [0.042, 0.042], [0, 0.054]], 10);

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const rx = sx * 0.45;
      const rz = sz * 0.43;
      guardAndRotors.push(
        tubeSweepMesh([[sx * 0.13, 0.54, sz * 0.11], [rx * 0.64, 0.57, rz * 0.64], [rx, 0.58, rz]], [0.036, 0.028, 0.024], 7),
        transformMesh(propGuardRing, { position: [rx, 0.59, rz] }),
        transformMesh(bevelBoxMesh(0.5, 0.016, 0.022, 0.004, 1), { position: [rx, 0.565, rz], rotation: [0, 0.78, 0] }),
        transformMesh(bevelBoxMesh(0.5, 0.016, 0.022, 0.004, 1), { position: [rx, 0.565, rz], rotation: [0, -0.78, 0] }),
        transformMesh(rotorBlade, { position: [rx, 0.605, rz], rotation: [0, sx * sz * 0.52, 0] }),
        transformMesh(rotorBlade, { position: [rx, 0.605, rz], rotation: [0, sx * sz * 0.52 + Math.PI * 0.5, 0] })
      );
      brassParts.push(transformMesh(rotorHub, { position: [rx, 0.59, rz] }));
    }
  }
  const scoutLens = transformMesh(icosphereSmoothMesh(0.068, 1, 0.002, 61, 0.1), { position: [0, 0.52, 0.37], scale: [1.1, 0.95, 0.85] });
  return [
    { paletteKey: "beetleCarapace", mesh: enamelCarapace },
    { paletteKey: "wroughtIron", mesh: mergeSubmeshes(guardAndRotors) },
    { paletteKey: "sunGold", mesh: mergeSubmeshes(brassParts) },
    { paletteKey: "cyanRuneGlow", mesh: scoutLens }
  ];
}

function hawkParts(): readonly DecorBucketPart[] {
  return scoutDroneParts();
}

/* -------------------------------------------------------------------------- */
/* 5. Instanced Flora Meshes (`instances.custom`) & World Decor Batching      */
/* -------------------------------------------------------------------------- */

let cachedFloraGeometries: {
  clover: AuraCustomGeometrySpec;
  grass: AuraCustomGeometrySpec;
  fern: AuraCustomGeometrySpec;
  pebble: AuraCustomGeometrySpec;
  leaf: AuraCustomGeometrySpec;
  foam: AuraCustomGeometrySpec;
} | null = null;

export function storybookFloraGeometries(): NonNullable<typeof cachedFloraGeometries> {
  if (cachedFloraGeometries) return cachedFloraGeometries;
  const cloverParts: ProceduralMesh[] = [tubeSweepMesh([[0, 0, 0], [0, 0.55, 0]], [0.06, 0.04], 5)];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * TAU;
    cloverParts.push(
      transformMesh(
        loftSectionsMesh([
          { z: 0.04, width: 0.14, height: 0.05 },
          { z: 0.26, width: 0.36, height: 0.06 },
          { z: 0.44, width: 0.22, height: 0.04 }
        ]),
        { position: [0, 0.55, 0], rotation: [0.12, a, 0] }
      )
    );
  }
  const grassParts: ProceduralMesh[] = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * TAU + 0.2;
    const lean = 0.18 + (i % 2) * 0.12;
    grassParts.push(
      transformMesh(
        loftSectionsMesh([
          { z: 0, width: 0.16, height: 0.04, y: 0 },
          { z: lean * 0.45, width: 0.11, height: 0.03, y: 0.52 },
          { z: lean, width: 0.02, height: 0.015, y: 1.0 }
        ]),
        { rotation: [0, a, 0] }
      )
    );
  }
  const fernParts: ProceduralMesh[] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + 0.35;
    fernParts.push(
      transformMesh(
        loftSectionsMesh([
          { z: 0.02, width: 0.12, height: 0.03, y: 0.05 },
          { z: 0.22, width: 0.34, height: 0.04, y: 0.48 },
          { z: 0.46, width: 0.24, height: 0.03, y: 0.82 },
          { z: 0.62, width: 0.04, height: 0.015, y: 0.96 }
        ]),
        { rotation: [0, a, 0] }
      )
    );
  }
  const pebble = latheMesh([[0, -0.35], [0.36, -0.26], [0.5, 0], [0.38, 0.26], [0, 0.36]], 10);
  const leaf = transformMesh(
    extrudePolygonMesh(
      [[0, -0.45], [0.28, -0.2], [0.42, 0.08], [0.2, 0.28], [0, 0.48], [-0.2, 0.28], [-0.42, 0.08], [-0.28, -0.2]],
      0.08,
      { bevel: 0.015, centerZ: true }
    ),
    { rotation: [-Math.PI * 0.5, 0, 0] }
  );
  const foam = mergeSubmeshes([
    latheMesh([[0, -0.25], [0.38, -0.16], [0.48, 0.05], [0.3, 0.24], [0, 0.3]], 10),
    transformMesh(latheMesh([[0, -0.18], [0.26, -0.08], [0.22, 0.16], [0, 0.22]], 8), { position: [0.32, -0.04, 0.14] })
  ]);
  cachedFloraGeometries = {
    clover: buildCustomGeometry(mergeSubmeshes(cloverParts)),
    grass: buildCustomGeometry(mergeSubmeshes(grassParts)),
    fern: buildCustomGeometry(mergeSubmeshes(fernParts)),
    pebble: buildCustomGeometry(pebble),
    leaf: buildCustomGeometry(leaf),
    foam: buildCustomGeometry(foam)
  };
  return cachedFloraGeometries;
}

export type StaticDecorKind =
  | "tree" | "conifer" | "mushroom" | "flower" | "rock" | "pillar" | "arch" | "cloud"
  | "windmill" | "sail" | "crate" | "barrel" | "lantern" | "crystal" | "vent" | "star" | "hawk";

const cachedKindTemplates = new Map<StaticDecorKind, readonly DecorBucketPart[]>();

function templatePartsForDecor(kind: StaticDecorKind): readonly DecorBucketPart[] {
  const hit = cachedKindTemplates.get(kind);
  if (hit) return hit;
  let parts: readonly DecorBucketPart[];
  switch (kind) {
    case "tree": parts = canopyTreeParts(); break;
    case "conifer": parts = coniferTreeParts(); break;
    case "mushroom": parts = toadstoolParts(); break;
    case "flower": parts = woodlandFlowerParts(); break;
    case "rock": parts = mossyBoulderParts(); break;
    case "pillar": parts = mossyPillarParts(); break;
    case "arch": parts = woodlandArchParts(); break;
    case "cloud": parts = cumulusCloudParts(); break;
    case "windmill": parts = windmillParts(); break;
    case "sail": parts = watchtowerParts(); break;
    case "crate": parts = crateParts(); break;
    case "barrel": parts = barrelParts(); break;
    case "lantern": parts = woodlandLanternParts(); break;
    case "crystal": parts = quartzCrystalParts(); break;
    case "vent": parts = emberVentParts(); break;
    case "hawk": parts = hawkParts(); break;
    case "star": {
      const { gold, core } = starRelicMeshes(1);
      parts = [
        { paletteKey: "sunGold", mesh: gold },
        { paletteKey: "sunRibGlow", mesh: core }
      ];
      break;
    }
  }
  cachedKindTemplates.set(kind, parts);
  return parts;
}

export interface StaticDecorPlacement {
  readonly kind: StaticDecorKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw?: number;
  readonly s?: number;
}

let cachedInstancedTreeGeos: {
  oakTrunk: AuraCustomGeometrySpec;
  oakCrown: AuraCustomGeometrySpec;
  pineTrunk: AuraCustomGeometrySpec;
  pineBoughs: AuraCustomGeometrySpec;
} | null = null;

function instancedTreeGeometries(): NonNullable<typeof cachedInstancedTreeGeos> {
  if (cachedInstancedTreeGeos) return cachedInstancedTreeGeos;
  const oak = templatePartsForDecor("tree");
  const pine = templatePartsForDecor("conifer");
  cachedInstancedTreeGeos = {
    oakTrunk: mergeRawMeshes([oak[0]!.mesh]),
    oakCrown: mergeRawMeshes([oak[1]!.mesh]),
    pineTrunk: mergeRawMeshes([pine[0]!.mesh]),
    pineBoughs: mergeRawMeshes([pine[1]!.mesh])
  };
  return cachedInstancedTreeGeos;
}

const LANDMARK_DECOR_KINDS: ReadonlySet<StaticDecorKind> = new Set([
  "arch",
  "windmill",
  "sail",
  "pillar",
  "crystal",
  "vent"
]);

/** Batches static meadow trees with `instances.custom` and merges remaining world props via `mergeRawMeshes` (`>=60 FPS`). */
export function buildDioramaStaticDecorNodes(
  placements: readonly StaticDecorPlacement[]
): readonly (AuraNodeBuilder<AuraGroupNode> | AuraInstancedNodeBuilder)[] {
  const oakTransforms: AuraTransformSpec[] = [];
  const pineTransforms: AuraTransformSpec[] = [];
  const castBuckets = new Map<keyof typeof PBL_MAT, ProceduralMesh[]>();
  const groundBuckets = new Map<keyof typeof PBL_MAT, ProceduralMesh[]>();
  const skyBuckets = new Map<keyof typeof PBL_MAT, ProceduralMesh[]>();
  const hasLandmark = placements.some((d) => LANDMARK_DECOR_KINDS.has(d.kind));
  let promotedGroundToCast = false;
  for (const d of placements) {
    const scale = d.s ?? 1;
    if (d.kind === "tree") {
      oakTransforms.push({ position: [d.x, d.y, d.z], rotation: [0, d.yaw ?? 0, 0], scale });
      continue;
    }
    if (d.kind === "conifer") {
      pineTransforms.push({ position: [d.x, d.y, d.z], rotation: [0, d.yaw ?? 0, 0], scale });
      continue;
    }
    let target: Map<keyof typeof PBL_MAT, ProceduralMesh[]>;
    if (d.kind === "cloud" || d.kind === "star") {
      target = skyBuckets;
    } else if (LANDMARK_DECOR_KINDS.has(d.kind) || (!hasLandmark && !promotedGroundToCast)) {
      target = castBuckets;
      promotedGroundToCast = true;
    } else {
      target = groundBuckets;
    }
    const lift = d.kind === "star" ? 0.55 * scale : 0;
    const xform = {
      position: [d.x, d.y + lift, d.z] as const,
      rotation: [0, d.yaw ?? 0, 0] as const,
      scale
    };
    for (const part of templatePartsForDecor(d.kind)) {
      let arr = target.get(part.paletteKey);
      if (!arr) target.set(part.paletteKey, (arr = []));
      arr.push(transformMesh(part.mesh, xform));
    }
  }
  const out: (AuraNodeBuilder<AuraGroupNode> | AuraInstancedNodeBuilder)[] = [];
  if (oakTransforms.length > 0 || pineTransforms.length > 0) {
    const treeGeos = instancedTreeGeometries();
    if (oakTransforms.length > 0) {
      out.push(
        instances.custom(treeGeos.oakTrunk, {
          name: "pbl-diorama-trees-oak-trunk",
          transforms: oakTransforms,
          material: INSTANCED_TREE_MAT.roughBark,
          castShadow: false,
          receiveShadow: true
        }),
        instances.custom(treeGeos.oakCrown, {
          name: "pbl-diorama-trees-oak-crown",
          transforms: oakTransforms,
          material: INSTANCED_TREE_MAT.emeraldLeaf,
          castShadow: true,
          receiveShadow: true
        })
      );
    }
    if (pineTransforms.length > 0) {
      out.push(
        instances.custom(treeGeos.pineTrunk, {
          name: "pbl-diorama-trees-pine-trunk",
          transforms: pineTransforms,
          material: INSTANCED_TREE_MAT.roughBark,
          castShadow: false,
          receiveShadow: true
        }),
        instances.custom(treeGeos.pineBoughs, {
          name: "pbl-diorama-trees-pine-boughs",
          transforms: pineTransforms,
          material: INSTANCED_TREE_MAT.pineNeedle,
          castShadow: true,
          receiveShadow: true
        })
      );
    }
  }
  if (castBuckets.size > 0) {
    const slots: MaterialSlot[] = [...castBuckets.entries()].map(([key, meshes]) => ({
      mesh: mergeSubmeshes(meshes),
      material: PBL_MAT[key]
    }));
    out.push(assembleMultiMaterialNode("pbl-diorama-decor-cast", slots, { castShadow: true, receiveShadow: true, coalesce: false }));
  }
  if (groundBuckets.size > 0) {
    const slots: MaterialSlot[] = [...groundBuckets.entries()].map(([key, meshes]) => ({
      mesh: mergeSubmeshes(meshes),
      material: PBL_MAT[key]
    }));
    out.push(stampNoCastShadow(assembleMultiMaterialNode("pbl-diorama-decor-ground", slots, { castShadow: false, receiveShadow: true, coalesce: true })));
  }
  if (skyBuckets.size > 0) {
    const slots: MaterialSlot[] = [...skyBuckets.entries()].map(([key, meshes]) => ({
      mesh: mergeSubmeshes(meshes),
      material: PBL_MAT[key]
    }));
    out.push(stampNoCastShadow(assembleMultiMaterialNode("pbl-diorama-decor-sky", slots, { castShadow: false, receiveShadow: false })));
  }
  return out;
}

/** Single-prop procedural woodland decor node (`?look=original` fallback so zero Meshy GLBs are ever mounted). */
export function buildSingleDecorPropNode(
  name: string,
  kind: StaticDecorKind,
  pos: readonly [number, number, number],
  yaw = 0,
  scale = 1,
  castShadow = true
): AuraNodeBuilder<AuraGroupNode> {
  const slots: MaterialSlot[] = templatePartsForDecor(kind).map((part) => ({
    mesh: part.mesh,
    material: PBL_MAT[part.paletteKey]
  }));
  const lift = kind === "star" ? 0.55 * scale : 0;
  const node = assembleMultiMaterialNode(name, slots, {
    position: [pos[0], pos[1] + lift, pos[2]],
    rotation: [0, yaw, 0],
    scale,
    castShadow,
    receiveShadow: castShadow
  });
  return castShadow ? node : stampNoCastShadow(node);
}

/* -------------------------------------------------------------------------- */
/* 7. Articulated Procedural Pip Hero & Brambleback Boss Rigs (Zero GLBs)     */
/* -------------------------------------------------------------------------- */

const PIP_SEED_SKIN_MAT = material.matteClay({
  name: "pip golden seed skin",
  color: "#ffffff",
  roughness: 0.56,
  rim: { color: "#ffe7b5", power: 2.5, intensity: 0.28 }
});
const PIP_ACORN_CAP_LACQUER_MAT = material.lacquer({
  name: "pip fluted chestnut acorn cap",
  color: "#ffffff",
  roughness: 0.18,
  clearcoat: 0.9,
  clearcoatRoughness: 0.11,
  rim: { color: "#ffd8a6", power: 2.6, intensity: 0.28 }
});
const PIP_SPROUT_LEAF_MAT = material.fabric({
  name: "pip woodland sprout leaf",
  color: "#ffffff",
  roughness: 0.58,
  sheen: 0.45,
  sheenColor: "#dcff9c"
});

/** Rest-pose socket coordinates shared between scene construction (`buildPipHeroLimbNodes`) and `SO(3)` runtime animation. */
export const PIP_RIG_SOCKETS = {
  torso: [0, 0.49, 0] as const,
  head: [0, 0.695, 0.005] as const,
  earFromHeadL: [-0.184, 0.094, 0.005] as const,
  earFromHeadR: [0.184, 0.094, 0.005] as const,
  armL: [-0.126, 0.622, 0.006] as const,
  armR: [0.126, 0.622, 0.006] as const,
  footL: [-0.078, 0.355, 0.004] as const,
  footR: [0.078, 0.355, 0.004] as const,
  tail: [0, 0.445, -0.088] as const
} as const;

interface GroupedPartSpec {
  readonly spec: AuraCustomGeometrySpec;
  readonly materials: readonly AuraMaterialSpec[];
}

interface PipSlotSpec {
  readonly spec: AuraCustomGeometrySpec;
  readonly material: AuraMaterialSpec;
}

function sculptSproutLeafBlade(opts: {
  readonly length: number;
  readonly width: number;
  readonly arch: number;
  readonly curl: number;
  readonly thickness?: number;
}): ProceduralMesh {
  const stations = 6;
  const thick = opts.thickness ?? 0.014;
  const rings: V3[][] = [];
  for (let s = 0; s < stations; s += 1) {
    const u = s / (stations - 1);
    const z = u * opts.length;
    const env =
      s === 0
        ? 0.18
        : s === stations - 1
          ? 0.07
          : Math.sin(Math.pow(u, 0.72) * Math.PI) * 1.04;
    const hw = Math.max(0.004, opts.width * 0.5 * env);
    const ht = Math.max(0.003, thick * (0.46 + 0.54 * env));
    const yMid =
      opts.arch * Math.sin(u * Math.PI * 0.8) -
      opts.curl * Math.pow(Math.max(0, u - 0.52) / 0.48, 2.05);
    const cup = hw * 0.2 * env;
    rings.push([
      [0, yMid + ht * 0.65 - cup * 0.35, z],
      [hw * 0.56, yMid + ht * 0.85 + cup * 0.25, z],
      [hw, yMid + cup, z],
      [hw * 0.58, yMid - ht * 0.65 + cup * 0.2, z],
      [0, yMid - ht * 1.15 - cup * 0.2, z],
      [-hw * 0.58, yMid - ht * 0.65 + cup * 0.2, z],
      [-hw, yMid + cup, z],
      [-hw * 0.56, yMid + ht * 0.85 + cup * 0.25, z]
    ]);
  }
  const raw = kernelLoftSectionsMesh(rings, true, false);
  return paintMeshColors(raw, (_pos, _norm, uv): V3 => {
    const t = Math.max(0, Math.min(1, uv[1]));
    const edge = Math.abs(Math.sin(uv[0] * TAU));
    const tipMix = Math.min(1, t * 0.88 + edge * 0.18);
    return [0.18 + tipMix * 0.32, 0.49 + tipMix * 0.37, 0.14 + tipMix * 0.18];
  });
}

function sculptFlutedAcornCapMesh(): ProceduralMesh {
  const flutes = 9;
  const ringLen = flutes * 4;
  // [baseRadius, y, fluteAmp, brimScallop]
  const profile: readonly (readonly [number, number, number, number])[] = [
    [0.174, -0.012, 0.0, 0.0],
    [0.252, -0.014, 0.0, 0.022],
    [0.282, 0.012, 0.006, 0.034],
    [0.272, 0.044, 0.018, 0.024],
    [0.248, 0.058, 0.048, 0.006],
    [0.268, 0.105, 0.086, 0.0],
    [0.254, 0.168, 0.09, 0.0],
    [0.198, 0.228, 0.078, 0.0],
    [0.108, 0.268, 0.048, 0.0],
    [0.02, 0.286, 0.0, 0.0]
  ];
  const rings: V3[][] = profile.map(([baseR, y, fluteAmp, brimScallop]) => {
    const ring: V3[] = [];
    for (let i = 0; i < ringLen; i += 1) {
      const a = (i / ringLen) * TAU;
      const wave = 0.5 + 0.5 * Math.cos(flutes * a);
      const cushion = Math.pow(wave, 0.62);
      const scallop = 0.5 + 0.5 * Math.cos(flutes * 2 * a);
      const r = baseR * (1 + fluteAmp * (cushion - 0.34) + brimScallop * (scallop - 0.5));
      ring.push([Math.sin(a) * r * 0.99, y, Math.cos(a) * r * 1.04]);
    }
    return ring;
  });
  const raw = transformMesh(kernelLoftSectionsMesh(rings, true, false), {
    position: [0, 0.168, -0.016],
    rotation: [-0.22, 0, 0]
  });
  return bakeMeshCavityAO(
    paintMeshColors(raw, (_pos, _norm, uv): V3 => {
      const a = uv[0] * TAU;
      const v = uv[1];
      const wave = 0.5 + 0.5 * Math.cos(flutes * a);
      const cushion = Math.pow(wave, 0.68);
      const scallop = 0.5 + 0.5 * Math.cos(flutes * 2 * a);
      if (v <= 0.35) {
        const lift = scallop * 0.28 + Math.max(0, v - 0.1) * 0.55;
        return [0.31 + lift * 0.16, 0.15 + lift * 0.1, 0.07 + lift * 0.05];
      }
      if (v <= 0.45) {
        return [0.25 + cushion * 0.08, 0.12 + cushion * 0.04, 0.05 + cushion * 0.02];
      }
      const crownLift = Math.max(0, (v - 0.45) / 0.55);
      const ribShade = 0.72 + cushion * 0.34 + crownLift * 0.12;
      return [
        Math.min(1, 0.58 * ribShade),
        Math.min(1, 0.31 * ribShade),
        Math.min(1, 0.14 * ribShade)
      ];
    }),
    0.14
  );
}

let cachedPipRig: {
  readonly torso: readonly PipSlotSpec[];
  readonly head: readonly PipSlotSpec[];
  readonly earL: AuraCustomGeometrySpec;
  readonly earR: AuraCustomGeometrySpec;
  readonly armL: AuraCustomGeometrySpec;
  readonly armR: AuraCustomGeometrySpec;
  readonly footL: readonly PipSlotSpec[];
  readonly footR: readonly PipSlotSpec[];
  readonly tail: AuraCustomGeometrySpec;
} | null = null;

function ensurePipRig(): NonNullable<typeof cachedPipRig> {
  if (cachedPipRig) return cachedPipRig;

  // Shared sprout leaf templates (sculpted once and transformed per attachment)
  const baseWaistLeaf = sculptSproutLeafBlade({
    length: 0.125,
    width: 0.082,
    arch: 0.026,
    curl: 0.038,
    thickness: 0.013
  });
  const baseCuffLeaf = sculptSproutLeafBlade({
    length: 0.058,
    width: 0.04,
    arch: 0.015,
    curl: 0.017,
    thickness: 0.009
  });

  // 1. Lithe sapling-sprout torso + integrated neck/shoulder/hip sockets + cream birch collar + curled green waist leaves (pivot at y = 0.49)
  const saplingCore = subdivideSmoothMesh(
    mergeSubmeshes([
      latheMesh(
        [
          [0, -0.142],
          [0.068, -0.136],
          [0.094, -0.092],
          [0.084, -0.018],
          [0.096, 0.068],
          [0.118, 0.132],
          [0.086, 0.176],
          [0.068, 0.238],
          [0, 0.246]
        ],
        14
      ),
      transformMesh(icosphereSmoothMesh(0.046, 0, 0.0005, 5, 0.04), { position: [-0.114, 0.13, 0.006], scale: [1.05, 0.92, 0.95] }),
      transformMesh(icosphereSmoothMesh(0.046, 0, 0.0005, 7, 0.04), { position: [0.114, 0.13, 0.006], scale: [1.05, 0.92, 0.95] }),
      transformMesh(icosphereSmoothMesh(0.052, 0, 0.0005, 9, 0.04), { position: [-0.076, -0.118, 0.004], scale: [0.96, 0.94, 0.96] }),
      transformMesh(icosphereSmoothMesh(0.052, 0, 0.0005, 11, 0.04), { position: [0.076, -0.118, 0.004], scale: [0.96, 0.94, 0.96] })
    ]),
    1,
    0.5
  );
  const birchCollar = mergeSubmeshes([
    transformMesh(
      latheMesh([[0.072, 0.142], [0.134, 0.132], [0.142, 0.168], [0.116, 0.204], [0.07, 0.198]], 16),
      { rotation: [0.08, 0, 0] }
    ),
    transformMesh(
      extrudePolygonMesh([[-0.052, 0.168], [0.0, 0.118], [0.052, 0.168], [0.032, 0.182], [-0.032, 0.182]], 0.036, { bevel: 0.008 }),
      { position: [0, -0.004, 0.118], rotation: [0.18, 0, 0] }
    )
  ]);
  const waistLeaves: ProceduralMesh[] = [];
  const waistLeafCount = 6;
  for (let i = 0; i < waistLeafCount; i += 1) {
    const a = ((i + 0.5) / waistLeafCount) * TAU;
    waistLeaves.push(
      transformMesh(baseWaistLeaf, {
        position: [Math.sin(a) * 0.076, -0.032, Math.cos(a) * 0.076],
        rotation: [0.58, a, 0]
      })
    );
  }
  const waistVineRing = paintMeshColors(
    latheMesh([[0.078, -0.044], [0.098, -0.042], [0.098, -0.014], [0.078, -0.012]], 14),
    [0.2, 0.52, 0.15]
  );
  const collarSeedClasp = transformMesh(icosphereSmoothMesh(0.022, 1, 0.0005, 13, 0.04), {
    position: [0, 0.148, 0.138],
    scale: [1.05, 1.22, 0.72]
  });
  const torsoSkinAndCollar = mergeSubmeshes([
    bakeMeshCavityAO(
      paintMeshColors(saplingCore, (pos, norm): V3 => {
        const chestGlow = Math.max(0, norm[2]) * 0.25 + Math.max(0, (pos[1] + 0.14) / 0.38) * 0.2;
        return [0.83 + chestGlow * 0.12, 0.57 + chestGlow * 0.17, 0.25 + chestGlow * 0.15];
      }),
      0.15
    ),
    paintMeshColors(birchCollar, (pos): V3 => {
      const rimLift = Math.max(0, (pos[1] - 0.13) / 0.08);
      return [0.91 + rimLift * 0.06, 0.85 + rimLift * 0.08, 0.72 + rimLift * 0.11];
    })
  ]);
  const torsoSprout = mergeSubmeshes([waistVineRing, ...waistLeaves]);
  const torso: readonly PipSlotSpec[] = [
    { spec: buildCustomGeometry(torsoSkinAndCollar), material: PIP_SEED_SKIN_MAT },
    { spec: buildCustomGeometry(torsoSprout), material: PIP_SPROUT_LEAF_MAT },
    { spec: buildCustomGeometry(collarSeedClasp), material: PBL_MAT.sunGold }
  ];

  // 2. Chibi golden-nut seed head + rosy cheeks + glossy catchlight bead eyes + 9-fluted chestnut acorn cap + crown sprout (pivot at y = 0.695)
  const seedFaceRaw = subdivideSmoothMesh(
    mergeSubmeshes([
      transformMesh(
        latheMesh(
          [
            [0, -0.026],
            [0.095, -0.018],
            [0.168, 0.032],
            [0.188, 0.098],
            [0.184, 0.168],
            [0.156, 0.232],
            [0.092, 0.272],
            [0, 0.284]
          ],
          18
        ),
        { position: [0, 0, 0.006], scale: [1.02, 1.0, 0.98] }
      ),
      transformMesh(icosphereSmoothMesh(0.088, 0, 0.0005, 17, 0.04), { position: [-0.096, 0.076, 0.108], scale: [1.08, 0.88, 0.92] }),
      transformMesh(icosphereSmoothMesh(0.088, 0, 0.0005, 19, 0.04), { position: [0.096, 0.076, 0.108], scale: [1.08, 0.88, 0.92] }),
      transformMesh(icosphereSmoothMesh(0.076, 0, 0.0005, 21, 0.03), { position: [0, 0.066, 0.126], scale: [1.12, 0.82, 0.84] }),
      transformMesh(icosphereSmoothMesh(0.022, 0, 0.0003, 23, 0.02), { position: [0, 0.102, 0.196], scale: [1.14, 0.88, 0.92] }),
      tubeSweepMesh([[-0.04, 0.184, 0.176], [-0.074, 0.191, 0.17], [-0.108, 0.175, 0.154]], [0.01, 0.012, 0.009], 6),
      tubeSweepMesh([[0.04, 0.184, 0.176], [0.074, 0.191, 0.17], [0.108, 0.175, 0.154]], [0.01, 0.012, 0.009], 6)
    ]),
    1,
    0.52
  );
  const seedFacePainted = bakeMeshCavityAO(
    paintMeshColors(seedFaceRaw, (pos, norm): V3 => {
      const frontGlow =
        Math.max(0, norm[2]) * 0.45 +
        Math.max(0, 1 - Math.hypot(pos[0] * 3.6, (pos[1] - 0.11) * 4.0)) * 0.42;
      let r = 0.85 + frontGlow * 0.11;
      let g = 0.59 + frontGlow * 0.19;
      let b = 0.27 + frontGlow * 0.2;

      // Soft airbrushed rosy-coral cheek blushes (matching pre-5.5.4 Original Pip)
      const dCheekL = Math.hypot((pos[0] + 0.114) / 0.058, (pos[1] - 0.082) / 0.044, (pos[2] - 0.152) / 0.054);
      const dCheekR = Math.hypot((pos[0] - 0.114) / 0.058, (pos[1] - 0.082) / 0.044, (pos[2] - 0.152) / 0.054);
      const blush = Math.pow(Math.max(0, 1 - Math.min(dCheekL, dCheekR)), 1.65) * 0.68;
      if (blush > 0) {
        r = r * (1 - blush) + 0.94 * blush;
        g = g * (1 - blush) + 0.37 * blush;
        b = b * (1 - blush) + 0.3 * blush;
      }

      // Warm toasted-amber button seed nose
      const dNose = Math.hypot(pos[0] / 0.028, (pos[1] - 0.102) / 0.024, (pos[2] - 0.196) / 0.026);
      const noseMix = Math.max(0, 1 - dNose) * 0.55;
      if (noseMix > 0) {
        r = r * (1 - noseMix) + 0.7 * noseMix;
        g = g * (1 - noseMix) + 0.38 * noseMix;
        b = b * (1 - noseMix) + 0.16 * noseMix;
      }

      // Expressive chestnut brow arches
      if (pos[1] > 0.168 && pos[2] > 0.148 && Math.abs(pos[0]) > 0.034 && Math.abs(pos[0]) < 0.118) {
        const browMix = Math.max(0, 1 - Math.abs(pos[1] - 0.184) / 0.018) * 0.52;
        r = r * (1 - browMix) + 0.52 * browMix;
        g = g * (1 - browMix) + 0.28 * browMix;
        b = b * (1 - browMix) + 0.12 * browMix;
      }
      return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
    }),
    0.13
  );

  const flutedAcornHelmet = sculptFlutedAcornCapMesh();

  const crownSproutStem = paintMeshColors(
    tubeSweepMesh(
      [
        [0, 0.42, -0.075],
        [0.006, 0.456, -0.068],
        [0.018, 0.486, -0.056],
        [0.032, 0.502, -0.044]
      ],
      [0.026, 0.02, 0.014, 0.009],
      8
    ),
    (pos): V3 => {
      const t = Math.max(0, Math.min(1, (pos[1] - 0.42) / 0.09));
      return [0.22 + t * 0.22, 0.52 + t * 0.3, 0.15 + t * 0.14];
    }
  );
  const crownLeafMain = transformMesh(
    sculptSproutLeafBlade({ length: 0.15, width: 0.088, arch: 0.038, curl: 0.032, thickness: 0.014 }),
    { position: [0.02, 0.482, -0.054], rotation: [-0.2, 0.88, 0.16] }
  );
  const crownLeafBud = transformMesh(
    sculptSproutLeafBlade({ length: 0.092, width: 0.054, arch: 0.025, curl: 0.02, thickness: 0.011 }),
    { position: [0.012, 0.47, -0.062], rotation: [-0.32, -1.15, -0.15] }
  );
  const crownSprout = mergeSubmeshes([crownSproutStem, crownLeafMain, crownLeafBud]);

  const beadEyes = paintMeshColors(
    mergeSubmeshes([
      transformMesh(icosphereSmoothMesh(0.038, 1, 0.0003, 25, 0.03), {
        position: [-0.074, 0.132, 0.168],
        rotation: [0, -0.2, 0],
        scale: [0.88, 1.18, 0.66]
      }),
      transformMesh(icosphereSmoothMesh(0.038, 1, 0.0003, 27, 0.03), {
        position: [0.074, 0.132, 0.168],
        rotation: [0, 0.2, 0],
        scale: [0.88, 1.18, 0.66]
      })
    ]),
    [0.055, 0.04, 0.04]
  );
  const eyeCatchlights = paintMeshColors(
    mergeSubmeshes([
      transformMesh(icosphereSmoothMesh(0.0115, 0, 0.0002, 29, 0.02), { position: [-0.063, 0.149, 0.188], scale: [1, 1, 0.65] }),
      transformMesh(icosphereSmoothMesh(0.0115, 0, 0.0002, 31, 0.02), { position: [0.085, 0.149, 0.188], scale: [1, 1, 0.65] }),
      transformMesh(icosphereSmoothMesh(0.0065, 0, 0.0002, 33, 0.02), { position: [-0.083, 0.117, 0.188], scale: [1, 1, 0.65] }),
      transformMesh(icosphereSmoothMesh(0.0065, 0, 0.0002, 35, 0.02), { position: [0.065, 0.117, 0.188], scale: [1, 1, 0.65] })
    ]),
    [1.0, 0.99, 0.96]
  );
  const headGloss = mergeSubmeshes([flutedAcornHelmet, beadEyes, eyeCatchlights]);
  const head: readonly PipSlotSpec[] = [
    { spec: buildCustomGeometry(seedFacePainted), material: PIP_SEED_SKIN_MAT },
    { spec: buildCustomGeometry(headGloss), material: PIP_ACORN_CAP_LACQUER_MAT },
    { spec: buildCustomGeometry(crownSprout), material: PIP_SPROUT_LEAF_MAT }
  ];

  // 3. Cupped golden-seed side-ears tucked right beneath the acorn helmet brim (`pip:ear-l`, `pip:ear-r`)
  const makeEar = (side: -1 | 1): AuraCustomGeometrySpec => {
    const earStations: readonly (readonly [number, number, number, number])[] = [
      [-0.016, 0.0, 0.028, 0.022],
      [0.018, 0.008, 0.044, 0.03],
      [0.052, 0.018, 0.05, 0.032],
      [0.078, 0.024, 0.038, 0.024],
      [0.092, 0.026, 0.014, 0.011]
    ];
    const rings: V3[][] = earStations.map(([xDist, yLift, hh, hd], idx) => {
      const x = side * xDist;
      const cup = idx >= 1 && idx <= 3 ? hd * 0.42 : 0;
      const zSweep = -xDist * 0.16;
      return [
        [x, yLift + hh, zSweep + hd * 0.35],
        [x, yLift + hh * 0.55, zSweep + hd * 0.7 - cup * 0.85],
        [x, yLift, zSweep + hd * 0.72 - cup * 1.15],
        [x, yLift - hh * 0.55, zSweep + hd * 0.7 - cup * 0.85],
        [x, yLift - hh, zSweep + hd * 0.35],
        [x, yLift - hh * 0.7, zSweep - hd * 0.82],
        [x, yLift, zSweep - hd],
        [x, yLift + hh * 0.7, zSweep - hd * 0.82]
      ];
    });
    const earRaw = subdivideSmoothMesh(kernelLoftSectionsMesh(rings, true, false), 1, 0.48);
    return buildCustomGeometry(
      paintMeshColors(earRaw, (pos, norm): V3 => {
        const hollow =
          norm[2] > 0.25 && Math.abs(pos[0]) > 0.018
            ? Math.max(0, 1 - Math.abs(pos[1] - 0.014) / 0.036) * 0.65
            : 0;
        const tipLift = Math.min(1, Math.abs(pos[0]) / 0.09);
        const r = (0.86 + tipLift * 0.08) * (1 - hollow) + 0.86 * hollow;
        const g = (0.6 + tipLift * 0.12) * (1 - hollow) + 0.42 * hollow;
        const b = (0.28 + tipLift * 0.1) * (1 - hollow) + 0.28 * hollow;
        return [r, g, b];
      })
    );
  };

  // 4. Curved sapling arms + sprout wrist cuffs + open 4-fingered woodland hands (`pip:arm-l`, `pip:arm-r`, 1 draw call per arm)
  const makeArm = (side: -1 | 1): AuraCustomGeometrySpec => {
    const shoulderBall = transformMesh(icosphereSmoothMesh(0.044, 1, 0.0008, 37, 0.05), { position: [0, 0.004, 0] });
    const saplingShaft = sculptHumanoidLimbMesh(
      [
        [0, 0.008, 0, 0.04],
        [side * 0.02, -0.088, 0.012, 0.035],
        [side * 0.016, -0.174, 0.024, 0.03]
      ],
      9,
      0.1
    );
    const palm = transformMesh(icosphereSmoothMesh(0.035, 1, 0.0008, 39, 0.04), {
      position: [side * 0.018, -0.198, 0.03],
      scale: [1.06, 1.08, 0.78]
    });
    const fingers = mergeSubmeshes([
      tubeSweepMesh(
        [
          [side * 0.004, -0.192, 0.034],
          [-side * 0.018, -0.208, 0.048],
          [-side * 0.03, -0.222, 0.056]
        ],
        [0.0135, 0.0115, 0.008],
        6
      ),
      tubeSweepMesh(
        [
          [side * 0.002, -0.212, 0.036],
          [-side * 0.004, -0.236, 0.044],
          [-side * 0.006, -0.252, 0.048]
        ],
        [0.012, 0.01, 0.007],
        6
      ),
      tubeSweepMesh(
        [
          [side * 0.018, -0.214, 0.035],
          [side * 0.02, -0.242, 0.041],
          [side * 0.021, -0.258, 0.045]
        ],
        [0.0125, 0.0105, 0.007],
        6
      ),
      tubeSweepMesh(
        [
          [side * 0.034, -0.21, 0.03],
          [side * 0.042, -0.234, 0.034],
          [side * 0.046, -0.248, 0.038]
        ],
        [0.0115, 0.0095, 0.0065],
        6
      )
    ]);
    const armSkin = paintMeshColors(mergeSubmeshes([shoulderBall, saplingShaft, palm, fingers]), (pos): V3 => {
      const handWarmth = Math.max(0, Math.min(1, (-0.16 - pos[1]) / 0.1));
      return [0.85 + handWarmth * 0.09, 0.59 + handWarmth * 0.14, 0.27 + handWarmth * 0.13];
    });
    const wristCuff = mergeSubmeshes([
      paintMeshColors(
        transformMesh(latheMesh([[0.028, -0.178], [0.041, -0.174], [0.041, -0.152], [0.029, -0.148]], 10), {
          position: [side * 0.016, 0, 0.022]
        }),
        [0.24, 0.58, 0.18]
      ),
      transformMesh(baseCuffLeaf, { position: [side * 0.036, -0.162, 0.022], rotation: [-0.35, side * 1.35, 0] })
    ]);
    return buildCustomGeometry(mergeSubmeshes([armSkin, wristCuff]));
  };

  // 5. Nimble sapling legs + sprout ankle wraps + polished chestnut seed-pod boots grounded at `y = -0.355` (`world y = 0.00`)
  const makeFoot = (side: -1 | 1): readonly PipSlotSpec[] => {
    const hipBall = transformMesh(icosphereSmoothMesh(0.05, 1, 0.0008, 41, 0.05), { position: [0, 0.004, 0] });
    const legShaft = sculptHumanoidLimbMesh(
      [
        [0, 0.008, 0, 0.046],
        [side * 0.005, -0.112, 0.02, 0.042],
        [side * 0.004, -0.232, -0.004, 0.035]
      ],
      9,
      0.12
    );
    const legSkin = paintMeshColors(mergeSubmeshes([hipBall, legShaft]), (pos): V3 => {
      const kneeLift = Math.max(0, 1 - Math.abs(pos[1] + 0.11) / 0.09) * 0.25;
      return [0.85 + kneeLift * 0.08, 0.59 + kneeLift * 0.12, 0.27 + kneeLift * 0.11];
    });
    const ankleSprout = mergeSubmeshes([
      paintMeshColors(
        transformMesh(latheMesh([[0.034, -0.242], [0.052, -0.238], [0.054, -0.202], [0.037, -0.198]], 10), {
          position: [side * 0.004, 0, -0.002]
        }),
        [0.25, 0.6, 0.19]
      ),
      transformMesh(baseCuffLeaf, { position: [side * 0.038, -0.224, -0.004], rotation: [-0.42, side * 1.45, 0] })
    ]);

    const bootStations: readonly { readonly z: number; readonly w: number; readonly yBot: number; readonly yTop: number; readonly xOff: number }[] = [
      { z: -0.072, w: 0.068, yBot: -0.348, yTop: -0.258, xOff: side * 0.004 },
      { z: -0.035, w: 0.104, yBot: -0.3615, yTop: -0.232, xOff: side * 0.004 },
      { z: 0.025, w: 0.118, yBot: -0.3615, yTop: -0.236, xOff: side * 0.002 },
      { z: 0.085, w: 0.108, yBot: -0.3615, yTop: -0.258, xOff: -side * 0.002 },
      { z: 0.128, w: 0.072, yBot: -0.35, yTop: -0.278, xOff: -side * 0.004 },
      { z: 0.146, w: 0.032, yBot: -0.335, yTop: -0.296, xOff: -side * 0.005 }
    ];
    const bootRings: V3[][] = bootStations.map((st) => {
      const rx = st.w * 0.5;
      const yMid = (st.yBot + st.yTop) * 0.5;
      const ry = (st.yTop - st.yBot) * 0.5;
      const ring: V3[] = [];
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * TAU;
        const sa = Math.sin(a);
        const y = sa < 0 ? yMid + sa * ry * 0.92 : yMid + Math.pow(sa, 0.82) * ry;
        ring.push([st.xOff + Math.cos(a) * rx, Math.max(st.yBot, y), st.z]);
      }
      return ring;
    });
    const seedPodBoot = paintMeshColors(
      subdivideSmoothMesh(kernelLoftSectionsMesh(bootRings, true, false), 1, 0.42),
      (pos): V3 => {
        if (pos[1] < -0.326) return [0.22, 0.12, 0.06];
        const toeGlow = Math.max(0, Math.min(1, (pos[2] + 0.04) / 0.18));
        return [0.46 + toeGlow * 0.2, 0.24 + toeGlow * 0.14, 0.11 + toeGlow * 0.07];
      }
    );
    return [
      { spec: buildCustomGeometry(mergeSubmeshes([legSkin, ankleSprout])), material: PIP_SEED_SKIN_MAT },
      { spec: buildCustomGeometry(seedPodBoot), material: PIP_ACORN_CAP_LACQUER_MAT }
    ];
  };

  // 6. Articulated trailing curled waist-sprout leaf plume (`pip:tail`, replaces the wrong fox/squirrel tail)
  const tailShoot = paintMeshColors(
    tubeSweepMesh(
      [
        [0, 0, 0.012],
        [0, 0.022, -0.055],
        [0, 0.068, -0.125],
        [0, 0.098, -0.175]
      ],
      [0.022, 0.018, 0.013, 0.008],
      8
    ),
    [0.22, 0.56, 0.17]
  );
  const tailLeafPrimary = transformMesh(
    sculptSproutLeafBlade({ length: 0.185, width: 0.108, arch: 0.052, curl: 0.044, thickness: 0.015 }),
    { position: [0, 0.028, -0.042], rotation: [0.34, Math.PI, 0] }
  );
  const tailLeafCompanion = transformMesh(
    sculptSproutLeafBlade({ length: 0.122, width: 0.072, arch: 0.036, curl: 0.028, thickness: 0.012 }),
    { position: [0.022, 0.02, -0.035], rotation: [0.48, Math.PI - 0.52, -0.22] }
  );
  const tail = buildCustomGeometry(mergeSubmeshes([tailShoot, tailLeafPrimary, tailLeafCompanion]));

  cachedPipRig = {
    torso,
    head,
    earL: makeEar(-1),
    earR: makeEar(1),
    armL: makeArm(-1),
    armR: makeArm(1),
    footL: makeFoot(-1),
    footR: makeFoot(1),
    tail
  };
  return cachedPipRig;
}

/** Articulated 1.25 m multi-material `@aura3d/engine` Pip hero anchor (`pip`, zero GLBs). */
export function buildPipHeroNode(
  name: string,
  pos: readonly [number, number, number],
  yaw: number,
  rt: ReturnType<typeof game.runtimeNode>
): AuraNodeBuilder<AuraGroupNode> {
  return group(name, [])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, yaw, 0)
    .runtime(rt);
}

/** Top-level runtime limb nodes for Pip (`pip:torso`, `pip:head`, ears, arms, feet, tail — unparented so squash/stretch never shears). */
export function buildPipHeroLimbNodes(
  name: string,
  pos: readonly [number, number, number],
  yaw: number
): AuraNodeBuilder<AuraSceneNode>[] {
  const rig = ensurePipRig();
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const worldAt = (lx: number, ly: number, lz: number): [number, number, number] => [
    pos[0] + lx * cy + lz * sy,
    pos[1] + ly,
    pos[2] - lx * sy + lz * cy
  ];
  const multiSlotPart = (
    id: string,
    slots: readonly PipSlotSpec[],
    at: readonly [number, number, number]
  ) =>
    group(
      id,
      slots.map((s, idx) =>
        geometry.custom(s.spec, {
          name: `${id}:s${idx}`,
          material: s.material,
          castShadow: true,
          receiveShadow: true
        })
      )
    )
      .position(...worldAt(at[0], at[1], at[2]))
      .rotate(0, yaw, 0)
      .runtime({ id, tags: ["player", "limb"] }) as unknown as AuraNodeBuilder<AuraSceneNode>;
  const singlePart = (
    id: string,
    spec: AuraCustomGeometrySpec,
    mat: AuraMaterialSpec,
    at: readonly [number, number, number]
  ) =>
    geometry
      .custom(spec, {
        name: id,
        position: worldAt(at[0], at[1], at[2]),
        rotation: [0, yaw, 0],
        material: mat,
        castShadow: true,
        receiveShadow: true
      })
      .runtime({ id, tags: ["player", "limb"] }) as unknown as AuraNodeBuilder<AuraSceneNode>;

  const headAt = PIP_RIG_SOCKETS.head;
  const earLAt: readonly [number, number, number] = [
    headAt[0] + PIP_RIG_SOCKETS.earFromHeadL[0],
    headAt[1] + PIP_RIG_SOCKETS.earFromHeadL[1],
    headAt[2] + PIP_RIG_SOCKETS.earFromHeadL[2]
  ];
  const earRAt: readonly [number, number, number] = [
    headAt[0] + PIP_RIG_SOCKETS.earFromHeadR[0],
    headAt[1] + PIP_RIG_SOCKETS.earFromHeadR[1],
    headAt[2] + PIP_RIG_SOCKETS.earFromHeadR[2]
  ];

  return [
    multiSlotPart(`${name}:torso`, rig.torso, PIP_RIG_SOCKETS.torso),
    multiSlotPart(`${name}:head`, rig.head, headAt),
    singlePart(`${name}:ear-l`, rig.earL, PIP_SEED_SKIN_MAT, earLAt),
    singlePart(`${name}:ear-r`, rig.earR, PIP_SEED_SKIN_MAT, earRAt),
    singlePart(`${name}:arm-l`, rig.armL, PIP_SEED_SKIN_MAT, PIP_RIG_SOCKETS.armL),
    singlePart(`${name}:arm-r`, rig.armR, PIP_SEED_SKIN_MAT, PIP_RIG_SOCKETS.armR),
    multiSlotPart(`${name}:foot-l`, rig.footL, PIP_RIG_SOCKETS.footL),
    multiSlotPart(`${name}:foot-r`, rig.footR, PIP_RIG_SOCKETS.footR),
    singlePart(`${name}:tail`, rig.tail, PIP_SPROUT_LEAF_MAT, PIP_RIG_SOCKETS.tail)
  ];
}

const BOSS_RIG_MAT = {
  barkHide: PBL_MAT.roughBark,
  plumBramble: material.matteClay({ name: "brambleback plum carapace", color: "#5e2748", roughness: 0.84 }),
  armorIron: PBL_MAT.wroughtIron,
  mossPlate: PBL_MAT.velvetMoss,
  crimsonThorn: PBL_MAT.crimsonLacquer,
  ivoryTusk: PBL_MAT.creamCapSpot,
  amberHeart: PBL_MAT.amberLanternGlow
} as const;

let cachedBossRig: {
  readonly body: GroupedPartSpec;
  readonly armL: GroupedPartSpec;
  readonly armR: GroupedPartSpec;
  readonly leg: GroupedPartSpec;
} | null = null;

function ensureBossRig(): NonNullable<typeof cachedBossRig> {
  if (cachedBossRig) return cachedBossRig;

  // Massive hunched armored thorn-boar golem torso + snarling snout + iron pauldrons + dorsal crimson thorns (pivot at y = 1.08)
  const barkTrunk = subdivideSmoothMesh(
    mergeSubmeshes([
      latheMesh([[0, -0.52], [0.58, -0.46], [0.8, -0.12], [0.86, 0.28], [0.7, 0.64], [0.38, 0.84], [0, 0.88]], 16),
      loftSectionsMesh([
        { z: 0.42, width: 0.88, height: 0.68, y: 0.16 },
        { z: 0.78, width: 0.66, height: 0.50, y: 0.08 },
        { z: 1.04, width: 0.44, height: 0.35, y: 0.04 }
      ])
    ]),
    1,
    0.5
  );
  const plumCarapace = subdivideSmoothMesh(
    transformMesh(
      latheMesh([[0, -0.38], [0.56, -0.32], [0.78, 0.05], [0.8, 0.42], [0.54, 0.78], [0, 0.94]], 16),
      { position: [0, 0.12, -0.18], rotation: [-0.24, 0, 0] }
    ),
    1,
    0.46
  );
  const ironArmorPlates = mergeSubmeshes([
    transformMesh(bevelBoxMesh(0.56, 0.22, 0.52, 0.05), { position: [-0.64, 0.54, 0.06], rotation: [0.1, 0, 0.34] }),
    transformMesh(bevelBoxMesh(0.56, 0.22, 0.52, 0.05), { position: [0.64, 0.54, 0.06], rotation: [0.1, 0, -0.34] }),
    transformMesh(bevelBoxMesh(0.62, 0.16, 0.36, 0.04), { position: [0, 0.42, 0.56], rotation: [0.42, 0, 0] })
  ]);
  const mossShoulders = mergeSubmeshes([
    transformMesh(icosphereFacetMesh(0.38, 1, 0.12, 61), { position: [-0.62, 0.46, 0.06], scale: [1.15, 0.72, 1.05] }),
    transformMesh(icosphereFacetMesh(0.38, 1, 0.12, 67), { position: [0.62, 0.46, 0.06], scale: [1.15, 0.72, 1.05] }),
    transformMesh(latheMesh([[0, 0.72], [0.46, 0.68], [0.34, 0.88], [0, 0.94]], 12), { position: [0, 0.14, -0.14] })
  ]);
  const dorsalThorns: ProceduralMesh[] = [];
  const thornCone = latheMesh([[0, 0], [0.135, 0.02], [0.078, 0.27], [0, 0.56]], 8);
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const arc = -0.35 + t * 1.15;
    dorsalThorns.push(
      transformMesh(thornCone, {
        position: [0, 0.84 - Math.abs(t - 0.35) * 0.42, 0.22 - t * 0.92],
        rotation: [-0.25 - t * 0.85, 0, 0],
        scale: 1.08 - Math.abs(t - 0.4) * 0.32
      })
    );
    for (const side of [-1, 1] as const) {
      dorsalThorns.push(
        transformMesh(thornCone, {
          position: [side * (0.42 + (i % 2) * 0.12), 0.56 - t * 0.24, 0.06 - t * 0.68],
          rotation: [-0.32 - arc * 0.28, 0, -side * 0.56],
          scale: 0.74
        })
      );
    }
  }
  const tusks = mergeSubmeshes([
    tubeSweepMesh([[-0.22, -0.02, 0.86], [-0.34, 0.1, 1.1], [-0.28, 0.36, 1.18]], [0.08, 0.058, 0.016], 8),
    tubeSweepMesh([[0.22, -0.02, 0.86], [0.34, 0.1, 1.1], [0.28, 0.36, 1.18]], [0.08, 0.058, 0.016], 8)
  ]);
  const amberRunesAndEyes = mergeSubmeshes([
    transformMesh(icosphereSmoothMesh(0.088, 1, 0.002, 71, 0.2), { position: [-0.23, 0.28, 0.79], scale: [1.18, 0.72, 0.85] }),
    transformMesh(icosphereSmoothMesh(0.088, 1, 0.002, 73, 0.2), { position: [0.23, 0.28, 0.79], scale: [1.18, 0.72, 0.85] }),
    transformMesh(bevelBoxMesh(0.28, 0.28, 0.095, 0.03), { position: [0, -0.08, 0.76], rotation: [0, 0, Math.PI * 0.25] })
  ]);
  const body: GroupedPartSpec = {
    spec: buildGroupedGeometrySpec([
      barkTrunk,
      plumCarapace,
      ironArmorPlates,
      mossShoulders,
      mergeSubmeshes(dorsalThorns),
      tusks,
      amberRunesAndEyes
    ]),
    materials: [
      BOSS_RIG_MAT.barkHide,
      BOSS_RIG_MAT.plumBramble,
      BOSS_RIG_MAT.armorIron,
      BOSS_RIG_MAT.mossPlate,
      BOSS_RIG_MAT.crimsonThorn,
      BOSS_RIG_MAT.ivoryTusk,
      BOSS_RIG_MAT.amberHeart
    ]
  };

  // Heavy muscular smasher golem arms (`sculptHumanoidLimbMesh`, pivot at shoulder `(0, 0, 0)`, extending down `-0.95 m`)
  const makeBossArm = (side: -1 | 1): GroupedPartSpec => {
    const limb = mergeSubmeshes([
      sculptHumanoidLimbMesh(
        [
          [0, 0.1, 0, 0.21],
          [side * 0.04, -0.28, 0.04, 0.23],
          [side * 0.03, -0.58, 0.06, 0.2]
        ],
        12,
        0.18
      ),
      subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.4, 0.36, 0.42, 0.075), { position: [side * 0.03, -0.75, 0.07] }),
        1,
        0.42
      )
    ]);
    const bracerSpikes = mergeSubmeshes([
      transformMesh(thornCone, { position: [side * 0.2, -0.44, 0.05], rotation: [0, 0, -side * 1.15], scale: 0.56 }),
      transformMesh(thornCone, { position: [side * 0.18, -0.66, 0.09], rotation: [0.2, 0, -side * 1.1], scale: 0.52 })
    ]);
    const ironBracer = transformMesh(latheMesh([[0.18, -0.58], [0.255, -0.58], [0.255, -0.4], [0.18, -0.4]], 12), {
      position: [side * 0.03, 0, 0.05]
    });
    return {
      spec: buildGroupedGeometrySpec([limb, bracerSpikes, ironBracer]),
      materials: [BOSS_RIG_MAT.barkHide, BOSS_RIG_MAT.crimsonThorn, BOSS_RIG_MAT.armorIron]
    };
  };

  // Rooted muscular trunk legs grounded at `y = -0.64 m` (`world y = 0` when hip is at `0.64 m`)
  const legBark = mergeSubmeshes([
    sculptHumanoidLimbMesh(
      [
        [0, 0.1, 0, 0.25],
        [0, -0.26, 0.03, 0.24],
        [0, -0.56, 0.02, 0.27]
      ],
      12,
      0.16
    ),
    transformMesh(bevelBoxMesh(0.38, 0.18, 0.48, 0.05), { position: [0, -0.55, 0.08] })
  ]);
  const legClaws = mergeSubmeshes([
    transformMesh(thornCone, { position: [-0.11, -0.58, 0.29], rotation: [Math.PI * 0.46, 0, 0], scale: 0.38 }),
    transformMesh(thornCone, { position: [0.11, -0.58, 0.29], rotation: [Math.PI * 0.46, 0, 0], scale: 0.38 })
  ]);
  const leg: GroupedPartSpec = {
    spec: buildGroupedGeometrySpec([legBark, legClaws]),
    materials: [BOSS_RIG_MAT.barkHide, BOSS_RIG_MAT.ivoryTusk]
  };

  cachedBossRig = { body, armL: makeBossArm(-1), armR: makeBossArm(1), leg };
  return cachedBossRig;
}

/** Articulated 2.4 m multi-material `@aura3d/engine` Brambleback boss anchor (`brambleback`, zero GLBs). */
export function buildBramblebackBossNode(
  name: string,
  pos: readonly [number, number, number],
  rt: ReturnType<typeof game.runtimeNode>
): AuraNodeBuilder<AuraGroupNode> {
  return group(name, [])
    .position(pos[0], pos[1], pos[2])
    .runtime(rt);
}

/** Top-level runtime limb nodes for Brambleback (`brambleback:body`, arms, legs — unparented so boss squash never shears). */
export function buildBramblebackBossLimbNodes(
  name: string,
  pos: readonly [number, number, number]
): AuraNodeBuilder<AuraSceneNode>[] {
  const rig = ensureBossRig();
  const part = (id: string, p: GroupedPartSpec, at: readonly [number, number, number]) =>
    geometry
      .multiMaterial(p.spec, p.materials, {
        name: id,
        position: [pos[0] + at[0], pos[1] + at[1], pos[2] + at[2]],
        castShadow: true,
        receiveShadow: true
      })
      .runtime({ id, tags: ["boss", "limb"] }) as unknown as AuraNodeBuilder<AuraSceneNode>;

  return [
    part(`${name}:body`, rig.body, [0, 1.08, 0]),
    part(`${name}:arm-l`, rig.armL, [-0.78, 1.38, 0.12]),
    part(`${name}:arm-r`, rig.armR, [0.78, 1.38, 0.12]),
    part(`${name}:leg-l`, rig.leg, [-0.44, 0.64, -0.06]),
    part(`${name}:leg-r`, rig.leg, [0.44, 0.64, -0.06])
  ];
}
