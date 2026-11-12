/**
 * Procedural multi-material 3D art assembly for Aura Hoops 3D (WP-07).
 *
 * Replaces all 22 static clay Meshy prop/backdrop GLBs and raw primitive placeholders
 * with true curved/compound sculptural geometry built exclusively via `@aura3d/engine`
 * and `proceduralKernel.ts` (zero `three` imports; WebGPU + WebGL2 dual-backend clean).
 */
import {
  geometry,
  material,
  primitives,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraVec3
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  extrudePolygonMesh,
  fbm3,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import { WGSL_CLIP, WGSL_NOISE, wgslStage } from "../../../showcase-port-shared/wgsl-twins";
import type { CourtId } from "../courtRigs";
import { dualChainLinkFenceSpec, dualSwishNetSpec } from "../hoopsShaders";

const LIGHT_BEAM_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct BeamVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vBeamWorld: vec3<f32>,
  @location(1) vBeamNormal: vec3<f32>,
  @location(2) vBeamT: f32,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>
) -> BeamVarying {
  var out: BeamVarying;
  let world = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.vBeamWorld = world.xyz;
  out.vBeamNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.vBeamT = clamp((0.5 * aura.u_beamLength - a_position.y) / max(aura.u_beamLength, 0.001), 0.0, 1.0);
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

const LIGHT_BEAM_FRAGMENT_WGSL = wgslStage([WGSL_NOISE], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vBeamWorld: vec3<f32>,
  @location(1) vBeamNormal: vec3<f32>,
  @location(2) vBeamT: f32
) -> @location(0) vec4<f32> {
  let N = normalize(vBeamNormal);
  let V = normalize(aura.u_cameraPosition - vBeamWorld);
  let facing = clamp(abs(dot(N, V)), 0.0, 1.0);
  let edge = pow(facing, aura.u_beamShape.y);
  let axial = pow(1.0 - vBeamT, aura.u_beamShape.x) * smoothstep(0.0, 0.05, vBeamT);
  let q = vBeamWorld / max(aura.u_beamNoise.y, 0.01) - vec3<f32>(0.0, aura.u_time * aura.u_beamNoise.z, 0.0);
  let dust = a3dFbm2(q.xz + vec2<f32>(q.y * 0.73, q.y * 1.19), 3);
  let density = 1.0 + (dust - 0.5) * 2.0 * aura.u_beamNoise.x;
  let a = clamp(edge * axial * density * aura.u_beamIntensity * 0.8, 0.0, 1.0);
  return vec4<f32>(aura.u_beamColor * a, a);
}`);

/** Wraps `material.lightBeam` with its paired WGSL stage so `backend: "auto"` has zero custom-shader gaps. */
export function pairedLightBeamMaterial(options: Parameters<typeof material.lightBeam>[0] = {}): AuraMaterialSpec {
  const base = material.lightBeam(options);
  return material.custom({
    ...base.custom!,
    wgsl: { vertex: LIGHT_BEAM_VERTEX_WGSL, fragment: LIGHT_BEAM_FRAGMENT_WGSL }
  });
}

/* -------------------------------------------------------------------------- */
/* Ergonomic Kernel Adapters                                                  */
/* -------------------------------------------------------------------------- */

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

const box = (wx: number, wy: number, wz: number, bevel = 0.02): RawMesh =>
  bevelBoxMesh(wx, wy, wz, bevel);

function tube(pts: readonly V3[], radius: number | readonly number[], radialSegs = 8, cap = true): RawMesh {
  const spine: V4[] = pts.map((p, i) => [
    p[0],
    p[1],
    p[2],
    typeof radius === "number" ? radius : (radius[i] ?? radius[radius.length - 1] ?? 0.02)
  ]);
  if (!cap && spine.length >= 2) {
    // Zero-radius ends skip end-cap generation cleanly on closed rings
    return tubeSweepMesh(spine, radialSegs, false);
  }
  return tubeSweepMesh(spine, radialSegs, false);
}

interface SuperSection {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly roundness?: number;
  readonly twist?: number;
}

function loftSuper(sections: readonly SuperSection[], segs = 12, capEnds = true): RawMesh {
  const rings: V3[][] = sections.map((s) => {
    const exp = Math.max(0.25, Math.min(2, 2 - (s.roundness ?? 0.5) * 1.1));
    const tw = s.twist ?? 0;
    const ct = Math.cos(tw), st = Math.sin(tw);
    const ring: V3[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const lx = Math.sign(ca) * Math.pow(Math.abs(ca), exp) * s.rx;
      const lz = Math.sign(sa) * Math.pow(Math.abs(sa), exp) * s.rz;
      ring.push([lx * ct - lz * st, s.y, lx * st + lz * ct]);
    }
    return ring;
  });
  return loftSectionsMesh(rings, capEnds, false);
}

function circleRingPts(cx: number, cy: number, cz: number, r: number, segs: number, axis: "y" | "z" = "y"): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    if (axis === "y") pts.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
    else pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz]);
  }
  return pts;
}

function multiNode(
  name: string,
  parts: readonly { readonly mesh: RawMesh; readonly material: AuraMaterialSpec }[],
  opts: {
    readonly id?: string;
    readonly position?: AuraVec3;
    readonly rotation?: AuraVec3;
    readonly scale?: number | AuraVec3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
  } = {}
): AuraNodeBuilder<AuraSceneNode> {
  const slots: MultiMatSlot[] = parts.map((p, idx) => ({ mesh: p.mesh, materialIndex: idx }));
  const mats: AuraMaterialSpec[] = parts.map((p) => p.material);
  return assembleMultiMaterialNode(name, slots, mats, opts) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

function singleMeshNode(
  name: string,
  meshes: readonly RawMesh[],
  mat: AuraMaterialSpec,
  opts: {
    readonly position?: AuraVec3;
    readonly rotation?: AuraVec3;
    readonly scale?: AuraVec3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
  } = {}
): AuraNodeBuilder<AuraSceneNode> {
  const spec = mergeRawMeshes(meshes);
  return geometry.custom(spec, {
    name,
    material: mat,
    ...(opts.position ? { position: opts.position } : {}),
    ...(opts.rotation ? { rotation: opts.rotation } : {}),
    ...(opts.scale ? { scale: opts.scale } : {}),
    castShadow: opts.castShadow ?? false,
    receiveShadow: opts.receiveShadow ?? true
  }) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/** Restyles the 15-joint streetball athletes with `material.fabric` mesh sheen + `material.sneakerMesh` / `material.sneakerRubber` finish. */
export function buildAthleteRestyleOverrides(
  kit: { readonly jersey: string; readonly shorts: string; readonly socks: string },
  lookOriginal: boolean
): AuraModelMaterialOverride[] {
  const jerseyFabric = material.fabric({ color: kit.jersey, roughness: 0.68, sheen: 0.2, sheenRoughness: 0.62 });
  const shortsFabric = material.fabric({ color: kit.shorts, roughness: 0.7, sheen: 0.18, sheenRoughness: 0.64 });
  const sneakerUpper = material.sneakerMesh({ color: "#e2e8f0", roughness: 0.84, sheen: 0.16 });
  const sneakerSole = material.sneakerRubber({ color: "#111827", roughness: 0.9 });
  const fabricOverride = (target: RegExp, spec: AuraMaterialSpec, color: string): AuraModelMaterialOverride => ({
    target,
    color,
    colorMode: "replace",
    replaceTextures: true,
    roughness: spec.roughness ?? 0.68,
    metallic: 0,
    ...(lookOriginal ? {} : { sheen: spec.sheen ?? 0.18, sheenColor: color, sheenRoughness: spec.sheenRoughness ?? 0.62 })
  });
  return [
    fabricOverride(/-kit$/, jerseyFabric, kit.jersey),
    fabricOverride(/-shorts$/, shortsFabric, kit.shorts),
    ...(lookOriginal
      ? []
      : [
        {
          target: /-body$/,
          roughness: sneakerUpper.roughness! * 0.45 + sneakerSole.roughness! * 0.34,
          metallic: 0,
          clearcoat: 0
        }
      ])
  ];
}

/* -------------------------------------------------------------------------- */
/* 1. Regulation Hoop Stanchion, Tempered Glass Backboard, Rim & Basketball   */
/* -------------------------------------------------------------------------- */

export function buildHoopStanchionNode(rigOverrides: readonly AuraModelMaterialOverride[], lookOriginal = false): AuraNodeBuilder<AuraSceneNode> {
  const postTone = (rigOverrides[0]?.color as AuraColor | undefined) ?? "#8a9199";
  const steelMat = material.brushedMetal({
    color: postTone,
    roughness: rigOverrides[0]?.roughness ?? 0.32,
    metallic: rigOverrides[0]?.metallic ?? 0.92,
    envMapIntensity: lookOriginal ? 0.85 : 1.35
  });
  const hardwareMat = material.studioMetal({ color: "#b9c2cc", roughness: 0.2, envMapIntensity: 1.3 });
  const padMat = material.fabric({ color: lookOriginal ? "#2b3038" : "#1d222b", roughness: 0.82, sheen: 0.32 });
  const padSeamMat = material.clearcoatPaint({ color: "#ff7a1a", roughness: 0.22, clearcoat: 0.85 });

  const gussets: RawMesh[] = [place(box(1.06, 0.08, 1.12, 0.018), [0, 0.04, 0])];
  for (const [gx, gz, yaw] of [[-0.22, 0, 0], [0.22, 0, 0], [0, -0.22, Math.PI / 2], [0, 0.22, Math.PI / 2]] as const) {
    gussets.push(place(box(0.035, 0.38, 0.44, 0.008), [gx, 0.22, gz], [0, yaw, 0]));
  }

  const neckCurve = catmullRomSpline3(
    [
      [0, 0.06, 0],
      [0, 1.45, 0],
      [0, 2.52, 0.06],
      [0, 3.16, 0.48],
      [0, 3.38, 0.98],
      [0, 3.4, 1.24]
    ],
    6
  );
  const mainPost = tube(neckCurve, 0.105, 16);
  const strutL = tube([[-0.14, 2.48, 0.08], [-0.28, 3.04, 0.62], [-0.44, 3.52, 1.24]], 0.036, 10);
  const strutR = tube([[0.14, 2.48, 0.08], [0.28, 3.04, 0.62], [0.44, 3.52, 1.24]], 0.036, 10);

  const hFrame = combineRaw([
    place(box(1.06, 0.07, 0.07, 0.012), [0, 3.52, 1.26]),
    place(box(1.06, 0.07, 0.07, 0.012), [0, 3.12, 1.26]),
    place(box(0.07, 0.48, 0.07, 0.012), [-0.46, 3.32, 1.26]),
    place(box(0.07, 0.48, 0.07, 0.012), [0.46, 3.32, 1.26]),
    ...([[-0.42, -0.44], [0.42, -0.44], [-0.42, 0.44], [0.42, 0.44]] as const).map(([bx, bz]) =>
      place(latheMesh([[0, 0], [0.032, 0], [0.032, 0.045], [0.018, 0.065], [0, 0.065]], 8), [bx, 0.08, bz])
    )
  ]);

  const padMesh = loftSuper([
    { y: 0.08, rx: 0.21, rz: 0.23, roundness: 0.35 },
    { y: 0.22, rx: 0.22, rz: 0.24, roundness: 0.35 },
    { y: 1.78, rx: 0.2, rz: 0.22, roundness: 0.4 },
    { y: 1.92, rx: 0.15, rz: 0.16, roundness: 0.5 }
  ], 16, true);
  const seamRibs = combineRaw([0.36, 0.86, 1.36, 1.76].map((y) => tube(circleRingPts(0, y, 0, 0.215, 16, "y"), 0.014, 8, false)));

  return multiNode(
    "hoop-stanchion-rig",
    [
      { mesh: combineRaw([...gussets, mainPost, strutL, strutR]), material: steelMat },
      { mesh: hFrame, material: hardwareMat },
      { mesh: padMesh, material: padMat },
      { mesh: seamRibs, material: padSeamMat }
    ],
    { position: [0, 0, -1.68], castShadow: true, receiveShadow: true }
  );
}

export interface BackboardBuildOptions {
  readonly overrides: readonly AuraModelMaterialOverride[];
  readonly boardZ: number;
  readonly boardHalfW: number;
  readonly boardY0: number;
  readonly boardY1: number;
  readonly rimY: number;
  readonly lookOriginal: boolean;
}

export function buildTemperedBackboardNode(opts: BackboardBuildOptions): AuraNodeBuilder<AuraSceneNode> {
  const pivotY = 3.35;
  const w = opts.boardHalfW * 2;
  const h = opts.boardY1 - opts.boardY0;
  const cy = (opts.boardY0 + opts.boardY1) * 0.5 - pivotY;
  const rimLocalY = opts.rimY - pivotY;

  const glassMat = opts.lookOriginal
    ? material.lacquer({ color: "#eef3f7", roughness: 0.28, opacity: 0.72 })
    : material.studioGlass({
      tint: (opts.overrides[0]?.color as AuraColor | undefined) ?? "#e6f1f6",
      roughness: opts.overrides[0]?.roughness ?? 0.02,
      transmission: opts.overrides[0]?.transmission ?? 0.94,
      thickness: 0.06,
      ior: 1.52,
      envMapIntensity: 1.4
    });
  const frameMat = material.brushedMetal({ color: "#b6bec8", roughness: 0.26, envMapIntensity: 1.45 });
  const squareMat = material.lacquer({ color: "#f6f8fb", roughness: 0.16 });
  const padMat = material.sneakerRubber({ color: "#1d222b", roughness: 0.88 });

  const glassPane = place(box(w - 0.08, h - 0.08, 0.036, 0.008), [0, cy, 0.024]);
  const frameBars = combineRaw([
    place(box(w, 0.048, 0.056, 0.01), [0, opts.boardY1 - pivotY - 0.02, 0.024]),
    place(box(w, 0.048, 0.056, 0.01), [0, opts.boardY0 - pivotY + 0.02, 0.024]),
    place(box(0.048, h, 0.056, 0.01), [-opts.boardHalfW + 0.02, cy, 0.024]),
    place(box(0.048, h, 0.056, 0.01), [opts.boardHalfW - 0.02, cy, 0.024]),
    place(box(0.042, h - 0.1, 0.034, 0.006), [-0.34, cy, -0.014]),
    place(box(0.042, h - 0.1, 0.034, 0.006), [0.34, cy, -0.014])
  ]);
  const zTape = 0.048;
  const shooterSquare = combineRaw([
    place(box(0.61, 0.038, 0.01, 0.003), [0, rimLocalY + 0.48, zTape]),
    place(box(0.61, 0.038, 0.01, 0.003), [0, rimLocalY + 0.055, zTape]),
    place(box(0.038, 0.462, 0.01, 0.003), [-0.286, rimLocalY + 0.268, zTape]),
    place(box(0.038, 0.462, 0.01, 0.003), [0.286, rimLocalY + 0.268, zTape]),
    place(box(w - 0.12, 0.03, 0.008, 0.002), [0, opts.boardY1 - pivotY - 0.065, zTape]),
    place(box(w - 0.12, 0.03, 0.008, 0.002), [0, opts.boardY0 - pivotY + 0.065, zTape]),
    place(box(0.03, h - 0.12, 0.008, 0.002), [-opts.boardHalfW + 0.065, cy, zTape]),
    place(box(0.03, h - 0.12, 0.008, 0.002), [opts.boardHalfW - 0.065, cy, zTape])
  ]);
  const lowerPad = combineRaw([
    place(box(w + 0.03, 0.068, 0.082, 0.018), [0, opts.boardY0 - pivotY - 0.01, 0.024]),
    place(box(0.068, 0.24, 0.082, 0.016), [-opts.boardHalfW - 0.004, opts.boardY0 - pivotY + 0.1, 0.024]),
    place(box(0.068, 0.24, 0.082, 0.016), [opts.boardHalfW + 0.004, opts.boardY0 - pivotY + 0.1, 0.024])
  ]);

  return multiNode(
    "hoop-backboard",
    [
      { mesh: frameBars, material: frameMat },
      { mesh: shooterSquare, material: squareMat },
      { mesh: lowerPad, material: padMat },
      { mesh: glassPane, material: glassMat }
    ],
    { id: "backboard-assembly", position: [0, pivotY, opts.boardZ], castShadow: false, receiveShadow: true }
  );
}

export interface RimBuildOptions {
  readonly overrides: readonly AuraModelMaterialOverride[];
  readonly rim: AuraVec3;
  readonly rimR: number;
  readonly boardZ: number;
  readonly lookOriginal: boolean;
}

export function buildBreakawayRimNode(opts: RimBuildOptions): AuraNodeBuilder<AuraSceneNode> {
  const orange = (opts.overrides[0]?.color as AuraColor | undefined) ?? "#e04f16";
  const rimPaintMat = material.clearcoatPaint({
    color: orange,
    roughness: opts.lookOriginal ? 0.34 : 0.14,
    clearcoat: opts.lookOriginal ? 0.45 : 0.96,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.45
  });
  const collarMetalMat = material.studioMetal({ color: "#c4ccd6", roughness: 0.2, envMapIntensity: 1.4 });

  const throatZ = opts.boardZ - opts.rim[2] + 0.055;
  const ringCenterR = opts.rimR - 0.012;
  const rimParts: RawMesh[] = [
    tube(circleRingPts(0, 0, 0, ringCenterR, 32, "y"), 0.0125, 10, false),
    tube([[-0.14, -0.02, -0.2], [-0.21, -0.01, -0.11]], 0.009, 8),
    tube([[0.14, -0.02, -0.2], [0.21, -0.01, -0.11]], 0.009, 8)
  ];
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    const hx = Math.cos(a) * (ringCenterR - 0.004);
    const hz = Math.sin(a) * (ringCenterR - 0.004);
    rimParts.push(tube([[hx * 0.97, -0.008, hz * 0.97], [hx, -0.028, hz], [hx * 1.02, -0.01, hz * 1.02]], 0.0038, 6));
  }

  const springCoil = (sx: number): RawMesh => {
    const pts: V3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const ang = t * Math.PI * 6;
      pts.push([sx + Math.cos(ang) * 0.016, -0.055 + Math.sin(ang) * 0.016, throatZ + 0.02 + t * 0.075]);
    }
    return tube(pts, 0.0045, 6);
  };
  const collarMesh = combineRaw([
    place(box(0.17, 0.125, 0.095, 0.012), [0, -0.032, throatZ + 0.042]),
    place(box(0.13, 0.026, 0.08, 0.006), [0, -0.004, throatZ + 0.085]),
    springCoil(-0.042),
    springCoil(0.042)
  ]);

  return multiNode(
    "hoop-rim",
    [
      { mesh: collarMesh, material: collarMetalMat },
      { mesh: combineRaw(rimParts), material: rimPaintMat }
    ],
    { id: "rim-assembly", position: [opts.rim[0], opts.rim[1], opts.rim[2]], castShadow: true, receiveShadow: true }
  );
}

export function buildTautNetTopNode(rimY: number, lookOriginal: boolean): AuraNodeBuilder<AuraSceneNode> {
  const pts: V3[] = [];
  const segs = 48;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const scallop = -0.012 * Math.abs(Math.sin(a * 6));
    pts.push([Math.cos(a) * 0.236, scallop, Math.sin(a) * 0.236]);
  }
  const mat = lookOriginal
    ? material.pbr({ color: "#e8e8e0", roughness: 0.7 })
    : material.fabric({ color: "#eef2f6", roughness: 0.62, sheen: 0.35 });
  return singleMeshNode("net-top", [tube(pts, 0.0075, 8, false)], mat, {
    position: [0, rimY - 0.024, 0],
    castShadow: false,
    receiveShadow: false
  });
}

export function buildTautNetSkirtNode(rimY: number, isRucker: boolean, lookOriginal: boolean): AuraNodeBuilder<AuraSceneNode> {
  const profile = bezierCurve2([0.5, -0.5], [0.36, -0.18], [0.42, 0.22], [0.5, 0.5], 16);
  const skirtMesh = latheMesh(profile, 28);
  const mat = lookOriginal
    ? material.pbr({ color: "#e8e8e0", roughness: 0.7, opacity: 0.24 })
    : material.custom(dualSwishNetSpec(isRucker));
  return singleMeshNode("net-skirt", [skirtMesh], mat, {
    position: [0, rimY - 0.24, 0],
    scale: [0.47, 0.44, 0.47],
    castShadow: false,
    receiveShadow: false
  });
}

export interface BasketballBuildOptions {
  readonly overrides: readonly AuraModelMaterialOverride[];
  readonly radius: number;
  readonly checkSpotZ: number;
  readonly lookOriginal: boolean;
}

/**
 * 8-panel pebbled composite leather basketball with recessed black rubber channel ribs.
 * Centered at local `[0, radius, 0]` (lowest point at local `y = 0`) so `placeBall` spins about its exact geometric center.
 */
export function buildPebbledBasketballNode(opts: BasketballBuildOptions): AuraNodeBuilder<AuraSceneNode> {
  const r = opts.radius;
  const rawSphere = icosphereFacetMesh(r, 2, 0.0025, 77);
  for (let i = 0; i < rawSphere.positions.length; i += 3) {
    const px = rawSphere.positions[i]!, py = rawSphere.positions[i + 1]!, pz = rawSphere.positions[i + 2]!;
    const len = Math.hypot(px, py, pz) || 1;
    const ux = px / len, uy = py / len, uz = pz / len;
    const pebble = (fbm3(ux * 18, uy * 18, uz * 18, 2) - 0.5) * 0.0022;
    const rr = r + pebble;
    rawSphere.positions[i] = ux * rr;
    rawSphere.positions[i + 1] = uy * rr + r;
    rawSphere.positions[i + 2] = uz * rr;
  }

  const seamR = r * 1.003;
  const seamTubeR = 0.0034;
  const segs = 40;
  const equator: V3[] = [];
  const meridianX: V3[] = [];
  const meridianZ: V3[] = [];
  const saddle: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    equator.push([Math.cos(t) * seamR, r, Math.sin(t) * seamR]);
    meridianX.push([0, r + Math.cos(t) * seamR, Math.sin(t) * seamR]);
    meridianZ.push([Math.cos(t) * seamR, r + Math.sin(t) * seamR, 0]);
    const sx = 0.62 * Math.cos(t) + 0.38 * Math.cos(3 * t);
    const sz = 0.62 * Math.sin(t) - 0.38 * Math.sin(3 * t);
    const sy = Math.sqrt(Math.max(0.02, 1 - sx * sx - sz * sz)) * Math.sin(2 * t);
    const sl = Math.hypot(sx, sy, sz) || 1;
    saddle.push([(sx / sl) * seamR, r + (sy / sl) * seamR, (sz / sl) * seamR]);
  }
  const seamsMesh = combineRaw([
    tube(equator, seamTubeR, 6, false),
    tube(meridianX, seamTubeR, 6, false),
    tube(meridianZ, seamTubeR, 6, false),
    tube(saddle, seamTubeR, 6, false)
  ]);

  const leatherMat = opts.lookOriginal
    ? material.pbr({ color: "#d85d1a", roughness: 0.68 })
    : material.physical({
      color: "#d95b18",
      roughness: opts.overrides[0]?.roughness ?? 0.62,
      clearcoat: opts.overrides[0]?.clearcoat ?? 0.18,
      clearcoatRoughness: 0.48,
      sheen: opts.overrides[0]?.sheen ?? 0.2,
      sheenColor: "#ffb076",
      normal: material.proceduralTextures.rubber({ scale: 36, strength: 0.46, contrast: 0.78 })
    });
  const channelMat = material.sneakerRubber({ color: "#141619", roughness: 0.92 });

  return multiNode(
    "ball-live",
    [
      { mesh: rawSphere, material: leatherMat },
      { mesh: seamsMesh, material: channelMat }
    ],
    { id: "ball-live", position: [0, 0.98, opts.checkSpotZ], castShadow: true, receiveShadow: true }
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Standing Crowd Silhouettes, Courtside Props, Rucker & Venice Venues     */
/* -------------------------------------------------------------------------- */

export interface ArticulatedSpectatorSlotSpecs {
  readonly coat: AuraCustomGeometrySpec;
  readonly trim: AuraCustomGeometrySpec;
  readonly skin: AuraCustomGeometrySpec;
  readonly headwear: AuraCustomGeometrySpec;
  readonly trousers: AuraCustomGeometrySpec;
}

export interface StandingSpectatorParts {
  readonly wardrobe: AuraCustomGeometrySpec;
  readonly skin: AuraCustomGeometrySpec;
  readonly bottoms: AuraCustomGeometrySpec;
}

let cachedArticulatedCrowd: ArticulatedSpectatorSlotSpecs | undefined;
let cachedSpectatorB: AuraCustomGeometrySpec | undefined;
let cachedSpectatorC: AuraCustomGeometrySpec | undefined;
let cachedPartsB: StandingSpectatorParts | undefined;
let cachedPartsC: StandingSpectatorParts | undefined;

function partitionArticulatedSpectatorMeshes(seed: number, wearingHat: boolean): {
  readonly coat: RawMesh[];
  readonly trim: RawMesh[];
  readonly skin: RawMesh[];
  readonly headwear: RawMesh[];
  readonly trousers: RawMesh[];
} {
  const folkSlots = articulatedFolkSlots({
    height: 1.72,
    coatMat: 0,
    trimMat: 1,
    skinMat: 2,
    hairHatMat: 3,
    trouserMat: 4,
    shoeMat: 4,
    wearingHat,
    seed
  });
  const bySlot = (idx: number): RawMesh[] => folkSlots.filter((s) => s.materialIndex === idx).map((s) => s.mesh);
  return {
    coat: bySlot(0),
    trim: bySlot(1),
    skin: bySlot(2),
    headwear: bySlot(3),
    trousers: bySlot(4)
  };
}

/**
 * Partitioned `articulatedFolkSlots` geometry specs (two bent arms + hands, two legs + shoes,
 * tailored coat/torso, collar/belt trim, neck + head, and brimmed stadium cap) for 5-draw
 * per-instance multi-colored `instances.custom` stadium crowd batching.
 */
export function getArticulatedSpectatorSlots(): ArticulatedSpectatorSlotSpecs {
  if (!cachedArticulatedCrowd) {
    const p = partitionArticulatedSpectatorMeshes(19, true);
    cachedArticulatedCrowd = {
      coat: mergeRawMeshes(p.coat),
      trim: mergeRawMeshes(p.trim),
      skin: mergeRawMeshes(p.skin),
      headwear: mergeRawMeshes(p.headwear),
      trousers: mergeRawMeshes(p.trousers)
    };
  }
  return cachedArticulatedCrowd;
}

/** Multi-part hardware-instancing geometry specs for standing bleacher spectators (`material.pbr`, `clearcoat: 0`). */
export function getStandingSpectatorParts(variant: "B" | "C"): StandingSpectatorParts {
  if (variant === "B") {
    if (!cachedPartsB) {
      const p = partitionArticulatedSpectatorMeshes(19, true);
      cachedPartsB = {
        wardrobe: mergeRawMeshes([...p.coat, ...p.trim, ...p.headwear]),
        skin: mergeRawMeshes(p.skin),
        bottoms: mergeRawMeshes(p.trousers)
      };
    }
    return cachedPartsB;
  }
  if (!cachedPartsC) {
    const p = partitionArticulatedSpectatorMeshes(37, false);
    cachedPartsC = {
      wardrobe: mergeRawMeshes([...p.coat, ...p.trim, ...p.headwear]),
      skin: mergeRawMeshes(p.skin),
      bottoms: mergeRawMeshes(p.trousers)
    };
  }
  return cachedPartsC;
}

/** Single-draw instancing geometry spec for standing bleacher spectators (`material.pbr` with `clearcoat: 0`). */
export function getStandingSpectatorSpec(variant: "B" | "C"): AuraCustomGeometrySpec {
  if (variant === "B") {
    if (!cachedSpectatorB) {
      const p = partitionArticulatedSpectatorMeshes(19, true);
      cachedSpectatorB = mergeRawMeshes([...p.coat, ...p.trim, ...p.skin, ...p.headwear, ...p.trousers]);
    }
    return cachedSpectatorB;
  }
  if (!cachedSpectatorC) {
    const p = partitionArticulatedSpectatorMeshes(37, false);
    cachedSpectatorC = mergeRawMeshes([...p.coat, ...p.trim, ...p.skin, ...p.headwear, ...p.trousers]);
  }
  return cachedSpectatorC;
}

export function standingCrowdPbrMaterial(): AuraMaterialSpec {
  return material.pbr({ color: "#ffffff", roughness: 0.72, metalness: 0.04, clearcoat: 0 });
}

export function standingCrowdTrimMaterial(): AuraMaterialSpec {
  return material.pbr({ color: "#ffffff", roughness: 0.64, metalness: 0.06, clearcoat: 0 });
}

export function standingCrowdSkinMaterial(): AuraMaterialSpec {
  return material.pbr({ color: "#ffffff", roughness: 0.66, metalness: 0.02, clearcoat: 0 });
}

export function standingCrowdHeadwearMaterial(): AuraMaterialSpec {
  return material.pbr({ color: "#ffffff", roughness: 0.74, metalness: 0.03, clearcoat: 0 });
}

export function standingCrowdBottomsMaterial(): AuraMaterialSpec {
  return material.pbr({ color: "#ffffff", roughness: 0.84, metalness: 0.02, clearcoat: 0 });
}

/** Multi-material courtside tubular chrome ball cart cradling 6 composite-leather basketballs. */
export function buildTubularBallCartNode(): AuraNodeBuilder<AuraSceneNode> {
  const chromeMat = material.studioMetal({ color: "#dce4ee", roughness: 0.14, envMapIntensity: 1.55 });
  const wheelMat = material.sneakerRubber({ color: "#15181e", roughness: 0.9 });
  const ballMat = material.physical({
    color: "#d95b18",
    roughness: 0.6,
    clearcoat: 0.2,
    sheen: 0.18,
    normal: material.proceduralTextures.rubber({ scale: 30, strength: 0.4, contrast: 0.75 })
  });

  const W = 0.62, D = 0.27;
  const frameParts: RawMesh[] = [
    tube([[-W, 0.1, -D], [-W, 0.98, -D], [-W, 1.08, 0], [-W, 0.98, D], [-W, 0.1, D]], 0.018, 10),
    tube([[W, 0.1, -D], [W, 0.98, -D], [W, 1.08, 0], [W, 0.98, D], [W, 0.1, D]], 0.018, 10)
  ];
  for (const ry of [0.34, 0.72]) {
    for (const rz of [-0.14, 0.14]) frameParts.push(tube([[-W, ry, rz], [W, ry, rz]], 0.014, 8));
  }
  for (const x of [-0.42, -0.14, 0.14, 0.42]) {
    frameParts.push(tube([[x, 0.14, -D], [x, 0.88, -D]], 0.009, 6));
    frameParts.push(tube([[x, 0.14, D], [x, 0.88, D]], 0.009, 6));
  }

  const wheels: RawMesh[] = [];
  for (const [wx, wz] of [[-W, -D], [W, -D], [-W, D], [W, D]] as const) {
    const wheel = latheMesh([[0, -0.02], [0.052, -0.02], [0.055, 0], [0.052, 0.02], [0, 0.02]], 12);
    wheels.push(place(wheel, [wx, 0.055, wz], [0, 0, Math.PI / 2]));
  }

  const balls: RawMesh[] = [];
  const unitBall = icosphereFacetMesh(0.115, 2, 0.002, 19);
  for (const [ry, count] of [[0.43, 3], [0.81, 3]] as const) {
    for (let i = 0; i < count; i++) {
      balls.push(place(unitBall, [(i - 1) * 0.34, ry, 0], [i * 0.7, i * 1.1, 0]));
    }
  }

  return multiNode(
    "ball-rack",
    [
      { mesh: combineRaw(frameParts), material: chromeMat },
      { mesh: combineRaw(wheels), material: wheelMat },
      { mesh: combineRaw(balls), material: ballMat }
    ],
    { position: [-8.9, 0, 9.4], rotation: [0, 0.5, 0], castShadow: false, receiveShadow: true }
  );
}

/** Championship streetball chalice trophy resting on the 0.78 m scorer's table (`"trophy-case"`). */
export function buildChampionshipTrophyNode(lookOriginal: boolean): AuraNodeBuilder<AuraSceneNode> {
  const plinthMat = material.lacquer({ color: "#221610", roughness: 0.2 });
  const goldMat = material.studioMetal({ color: "#f6c453", roughness: 0.14, envMapIntensity: 1.65 });
  const crownBallMat = material.clearcoatPaint({ color: "#e86a1c", roughness: 0.16, clearcoat: 0.92 });

  const plinth = combineRaw([
    place(box(0.38, 0.08, 0.38, 0.014), [0, 0.04, 0]),
    place(box(0.3, 0.14, 0.3, 0.014), [0, 0.15, 0])
  ]);
  const chalice = latheMesh(
    [[0, 0.22], [0.11, 0.22], [0.09, 0.26], [0.042, 0.38], [0.055, 0.5], [0.145, 0.68], [0.165, 0.86], [0.18, 0.96], [0.155, 0.97], [0.12, 0.74], [0, 0.68]],
    24
  );
  const handleL = tube([[-0.13, 0.66, 0], [-0.25, 0.78, 0], [-0.24, 0.93, 0], [-0.16, 0.94, 0]], 0.016, 8);
  const handleR = tube([[0.13, 0.66, 0], [0.25, 0.78, 0], [0.24, 0.93, 0], [0.16, 0.94, 0]], 0.016, 8);
  const plaque = place(box(0.2, 0.075, 0.015, 0.004), [0, 0.15, 0.152]);
  const finialBall = place(icosphereFacetMesh(0.095, 2, 0.002, 31), [0, 1.05, 0]);

  return multiNode(
    "trophy-case",
    [
      { mesh: plinth, material: plinthMat },
      { mesh: combineRaw([chalice, handleL, handleR, plaque]), material: goldMat },
      { mesh: finialBall, material: crownBallMat }
    ],
    { id: "trophy-case", position: [9.2, lookOriginal ? 0 : 0.78, -3.4], rotation: [0, -0.8, 0], castShadow: false, receiveShadow: true }
  );
}

/** Grounded scorer's table (top at y = 0.78 m) + LED fascia + contoured courtside team benches & coolers (batched by material). */
export function buildProceduralCourtsideTableNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const steelMat = material.brushedMetal({ color: "#78828e", roughness: 0.3, envMapIntensity: 1.35 });
  const woodMat = material.lacquer({ color: "#432919", roughness: 0.24 });
  const ledMat = material.emissive({ color: "#1c1208", emissive: "#ff8c2b", emissiveIntensity: 0.85, practical: true });
  const coolerMat = material.clearcoatPaint({ color: "#e04f16", roughness: 0.22, clearcoat: 0.8 });

  const tablePos: V3 = [9.2, 0, -3.4];
  const tableRot: V3 = [0, -0.8, 0];
  const allSteel: RawMesh[] = [
    place(
      combineRaw([
        tube([[-0.82, 0, -0.38], [-0.72, 0.74, -0.34], [-0.72, 0.74, 0.34], [-0.82, 0, 0.38]], 0.028, 8),
        tube([[0.82, 0, -0.38], [0.72, 0.74, -0.34], [0.72, 0.74, 0.34], [0.82, 0, 0.38]], 0.028, 8),
        tube([[-0.76, 0.22, 0], [0.76, 0.22, 0]], 0.022, 8)
      ]),
      tablePos,
      tableRot
    )
  ];
  const allWood: RawMesh[] = [
    place(
      combineRaw([
        place(box(1.92, 0.06, 0.98, 0.014), [0, 0.75, 0]),
        place(box(1.74, 0.54, 0.04, 0.01), [0, 0.44, 0.42])
      ]),
      tablePos,
      tableRot
    )
  ];
  const allLed: RawMesh[] = [
    place(
      combineRaw([
        place(box(1.48, 0.14, 0.02, 0.005), [0, 0.46, 0.445]),
        place(box(0.24, 0.16, 0.12, 0.01), [-0.62, 0.86, 0.18])
      ]),
      tablePos,
      tableRot
    )
  ];
  const allCoolers: RawMesh[] = [];
  const unitCooler = latheMesh([[0, 0], [0.19, 0], [0.2, 0.48], [0.215, 0.52], [0.19, 0.56], [0, 0.56]], 14);

  for (const bx of [-10.4, 10.4] as const) {
    const faceSign = bx < 0 ? 1 : -1;
    const benchPos: V3 = [bx, 0, 3.8];
    allSteel.push(
      place(
        combineRaw(
          [-1.5, 0, 1.5].map((lz) =>
            tube([[faceSign * 0.18, 0, lz], [faceSign * 0.16, 0.44, lz], [-faceSign * 0.18, 0.44, lz], [-faceSign * 0.22, 0.82, lz]], 0.024, 8)
          )
        ),
        benchPos
      )
    );
    allWood.push(
      place(
        combineRaw([
          place(box(0.46, 0.055, 3.8, 0.012), [0, 0.46, 0]),
          place(box(0.05, 0.28, 3.74, 0.01), [-faceSign * 0.22, 0.72, 0])
        ]),
        benchPos
      )
    );
    allCoolers.push(place(unitCooler, [bx, 0, 3.8 + 2.28]));
  }

  return [
    multiNode(
      "courtside-scorer-table",
      [
        { mesh: combineRaw(allSteel), material: steelMat },
        { mesh: combineRaw(allWood), material: woodMat },
        { mesh: combineRaw(allLed), material: ledMat },
        { mesh: combineRaw(allCoolers), material: coolerMat }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Rucker Park coursed brick mural wall with limestone coping, streetball spray-art relief & iron sconces. */
export function buildRuckerMuralWallNode(position: AuraVec3, yaw: number): AuraNodeBuilder<AuraSceneNode> {
  const brickMat = material.matteClay({ color: "#6d3628", roughness: 0.9 });
  const copingMat = material.ceramic({ color: "#cfc6b4", roughness: 0.52, clearcoat: 0.18 });
  const muralOrange = material.clearcoatPaint({ color: "#ff7a1a", roughness: 0.28, clearcoat: 0.78 });
  const muralCyan = material.clearcoatPaint({ color: "#2cc7e8", roughness: 0.28, clearcoat: 0.78 });
  const ironMat = material.brushedMetal({ color: "#2a2e35", roughness: 0.4 });
  const lampGlow = material.emissive({ color: "#3a2610", emissive: "#ffb347", emissiveIntensity: 2.2, practical: true });

  const wallBody = combineRaw([
    place(box(11.2, 4.1, 0.52, 0.03), [0, 2.05, 0]),
    place(box(0.74, 4.35, 0.72, 0.03), [-5.5, 2.175, 0]),
    place(box(0.74, 4.35, 0.72, 0.03), [5.5, 2.175, 0]),
    place(box(0.62, 4.25, 0.64, 0.025), [0, 2.125, 0])
  ]);
  const coping = combineRaw([
    place(box(12.1, 0.18, 0.78, 0.025), [0, 4.22, 0]),
    place(box(11.8, 0.26, 0.64, 0.02), [0, 0.13, 0])
  ]);
  const orangeArt = combineRaw([
    place(box(3.8, 1.9, 0.04, 0.01), [-2.65, 2.25, 0.27], [0, 0, 0.05]),
    place(latheMesh([[0, -0.03], [0.82, -0.03], [0.82, 0.03], [0, 0.03]], 20), [2.65, 2.25, 0.28], [Math.PI / 2, 0, 0])
  ]);
  const cyanArt = combineRaw([
    place(box(3.6, 1.75, 0.035, 0.01), [2.65, 2.2, 0.265], [0, 0, -0.04]),
    place(box(1.9, 0.42, 0.05, 0.01), [-2.65, 2.35, 0.295], [0, 0, -0.14])
  ]);
  const ironSconces = combineRaw([-3.2, 3.2].map((sx) => tube([[sx, 3.55, 0.24], [sx, 3.85, 0.56], [sx, 3.68, 0.78]], 0.028, 8)));
  const sconceBulbs = combineRaw(
    [-3.2, 3.2].map((sx) => place(latheMesh([[0, -0.08], [0.11, -0.04], [0.14, 0.05], [0, 0.07]], 12), [sx, 3.62, 0.78]))
  );

  return multiNode(
    "mural-wall",
    [
      { mesh: wallBody, material: brickMat },
      { mesh: coping, material: copingMat },
      { mesh: orangeArt, material: muralOrange },
      { mesh: cyanArt, material: muralCyan },
      { mesh: ironSconces, material: ironMat },
      { mesh: sconceBulbs, material: lampGlow }
    ],
    { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true }
  );
}

/** Rucker Park flanking covered VIP bleachers with lattice truss posts & curved corrugated canopy (batched across placements). */
export function buildCoveredBleacherCanopyNodes(
  placements: readonly { readonly name: string; readonly position: AuraVec3; readonly yaw: number }[]
): AuraNodeBuilder<AuraSceneNode>[] {
  if (placements.length === 0) return [];
  const steelMat = material.brushedMetal({ color: "#7d8690", roughness: 0.34 });
  const plankMat = material.lacquer({ color: "#c2662d", roughness: 0.34 });
  const roofMat = material.studioMetal({ color: "#3b434d", roughness: 0.36, envMapIntensity: 1.15 });
  const valanceMat = material.fabric({ color: "#ff7a1a", roughness: 0.78, sheen: 0.42 });

  const frame = combineRaw([
    place(latticeTrussMesh({ span: [0.36, 3.6, 0.36], bays: 5, chordRadius: 0.022 }), [-3.4, 1.8, -0.9]),
    place(latticeTrussMesh({ span: [0.36, 3.6, 0.36], bays: 5, chordRadius: 0.022 }), [3.4, 1.8, -0.9]),
    tube([[-3.5, 0, 1.1], [-3.5, 3.95, 1.1]], 0.045, 8),
    tube([[3.5, 0, 1.1], [3.5, 3.95, 1.1]], 0.045, 8),
    place(latticeTrussMesh({ span: [7.4, 0.28, 0.28], bays: 8, chordRadius: 0.018 }), [0, 3.78, 1.05])
  ]);
  const seats = combineRaw([0, 1, 2].map((r) => place(box(6.8, 0.09, 0.42, 0.015), [0, 0.46 * (r + 1), 0.7 - r * 0.72])));
  const canopyCurve: [number, number][] = [[-1.35, 3.55], [-0.4, 3.82], [0.55, 4.02], [1.45, 4.08]];
  const roofSheet = place(
    extrudePolygonMesh([...canopyCurve, ...[...canopyCurve].reverse().map(([z, y]): [number, number] => [z, y - 0.07])], 7.6),
    [0, 0, 0],
    [0, Math.PI / 2, 0]
  );
  const valance = place(box(7.55, 0.26, 0.04, 0.008), [0, 3.92, 1.44]);

  const allFrames: RawMesh[] = [];
  const allSeats: RawMesh[] = [];
  const allRoofs: RawMesh[] = [];
  const allValances: RawMesh[] = [];
  for (const p of placements) {
    const pos: V3 = [p.position[0], p.position[1], p.position[2]];
    const rot: V3 = [0, p.yaw, 0];
    allFrames.push(place(frame, pos, rot));
    allSeats.push(place(seats, pos, rot));
    allRoofs.push(place(roofSheet, pos, rot));
    allValances.push(place(valance, pos, rot));
  }

  return [
    multiNode(
      "covered-bleachers",
      [
        { mesh: combineRaw(allFrames), material: steelMat },
        { mesh: combineRaw(allSeats), material: plankMat },
        { mesh: combineRaw(allRoofs), material: roofMat },
        { mesh: combineRaw(allValances), material: valanceMat }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Rucker Park galvanized lattice floodlight towers (batched into 3 draws) + sodium lamp banks + `material.lightBeam` volumetric shafts. */
export function buildRuckerFloodlightTowerNodes(lookOriginal: boolean): AuraNodeBuilder<AuraSceneNode>[] {
  const towerSteel = material.brushedMetal({ color: "#8a9199", roughness: 0.32, envMapIntensity: 1.35 });
  const hoodMetal = material.studioMetal({ color: "#2d323a", roughness: 0.28 });
  const sodiumLens = material.emissive({ color: "#4a3010", emissive: "#ffb347", emissiveIntensity: 6.2, practical: true });

  const mast = combineRaw([
    place(box(0.78, 0.24, 0.78, 0.03), [0, 0.12, 0]),
    place(latticeTrussMesh({ span: [0.48, 8.6, 0.48], bays: 10, chordRadius: 0.024 }), [0, 4.42, 0]),
    place(latticeTrussMesh({ span: [2.1, 0.34, 0.34], bays: 4, chordRadius: 0.02 }), [0, 8.85, 0.15])
  ]);
  const hoods = combineRaw(
    [-0.72, -0.24, 0.24, 0.72].map((lx) => place(box(0.38, 0.28, 0.32, 0.02), [lx, 9.08, 0.28], [0.42, 0, 0]))
  );
  const lenses = combineRaw(
    [-0.72, -0.24, 0.24, 0.72].map((lx) => place(box(0.32, 0.2, 0.04, 0.006), [lx, 9.01, 0.42], [0.42, 0, 0]))
  );

  const allMasts: RawMesh[] = [];
  const allHoods: RawMesh[] = [];
  const allLenses: RawMesh[] = [];
  const beams: AuraNodeBuilder<AuraSceneNode>[] = [];
  const beamMat = pairedLightBeamMaterial({
    color: "#ffb347",
    intensity: 0.2,
    length: 9.2,
    falloff: 1.35,
    edgeSoftness: 1.6,
    noise: 0.3,
    noiseScale: 2.8,
    noiseSpeed: 0.2
  });

  for (const [x, z] of [[-11, -7], [11, -7], [-11, 13], [11, 13]] as const) {
    const yaw = Math.atan2(-x, 4 - z);
    const pos: V3 = [x, 0, z];
    const rot: V3 = [0, yaw, 0];
    allMasts.push(place(mast, pos, rot));
    allHoods.push(place(hoods, pos, rot));
    allLenses.push(place(lenses, pos, rot));
    if (!lookOriginal) {
      const sx = x * 0.92, sy = 8.95, sz = z * 0.92;
      const dx = -sx, dy = 0.6 - sy, dz = 4 - sz;
      const len = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      const beamLen = 9.2;
      const cx = sx + ux * beamLen * 0.5, cy = sy + uy * beamLen * 0.5, cz = sz + uz * beamLen * 0.5;
      const dot = -uy;
      const qx = -uz, qy = 0, qz = ux, qw = 1 + dot;
      const ql = Math.hypot(qx, qy, qz, qw) || 1;
      beams.push(
        primitives.cone({
          name: `flood-lightbeam-${x}-${z}`,
          position: [cx, cy, cz],
          quaternion: [qx / ql, qy / ql, qz / ql, qw / ql],
          params: { radius: 2.15, height: beamLen, radialSegments: 24, heightSegments: 6, openEnded: true },
          castShadow: false,
          receiveShadow: false,
          material: beamMat
        }) as unknown as AuraNodeBuilder<AuraSceneNode>
      );
    }
  }

  return [
    multiNode(
      "rucker-flood-towers",
      [
        { mesh: combineRaw(allMasts), material: towerSteel },
        { mesh: combineRaw(allHoods), material: hoodMetal },
        { mesh: combineRaw(allLenses), material: sodiumLens }
      ],
      { castShadow: false, receiveShadow: true }
    ),
    ...beams
  ];
}

/** Rucker Park trussed overhead LED scoreboard & dual shot-clock gantry (`"scoreboard-rig"`). */
export function buildScoreboardGantryNode(): AuraNodeBuilder<AuraSceneNode> {
  const trussMat = material.brushedMetal({ color: "#767f89", roughness: 0.32, envMapIntensity: 1.3 });
  const cabinetMat = material.studioMetal({ color: "#181d26", roughness: 0.28 });
  const accentTrimMat = material.clearcoatPaint({ color: "#ff7a1a", roughness: 0.2, clearcoat: 0.9 });
  const shotClockLed = material.emissive({ color: "#280808", emissive: "#ff4726", emissiveIntensity: 2.1, practical: true });

  const gantryTruss = combineRaw([
    place(latticeTrussMesh({ span: [0.46, 6.2, 0.46], bays: 8, chordRadius: 0.024 }), [-3.65, 3.1, -0.35]),
    place(latticeTrussMesh({ span: [0.46, 6.2, 0.46], bays: 8, chordRadius: 0.024 }), [3.65, 3.1, -0.35]),
    place(latticeTrussMesh({ span: [8.1, 0.46, 0.46], bays: 9, chordRadius: 0.022 }), [0, 6.38, -0.35]),
    place(box(0.9, 0.18, 0.9, 0.025), [-3.65, 0.09, -0.35]),
    place(box(0.9, 0.18, 0.9, 0.025), [3.65, 0.09, -0.35])
  ]);
  const cabinet = combineRaw([
    place(box(6.65, 2.42, 0.34, 0.035), [0, 5.4, 0]),
    place(box(0.92, 0.86, 0.28, 0.025), [-2.45, 7.08, 0]),
    place(box(0.92, 0.86, 0.28, 0.025), [2.45, 7.08, 0])
  ]);
  const trim = combineRaw([
    place(box(6.74, 0.09, 0.38, 0.015), [0, 6.63, 0]),
    place(box(6.74, 0.09, 0.38, 0.015), [0, 4.17, 0])
  ]);
  const clockFaces = combineRaw([
    place(box(0.72, 0.64, 0.04, 0.008), [-2.45, 7.08, 0.14]),
    place(box(0.72, 0.64, 0.04, 0.008), [2.45, 7.08, 0.14])
  ]);

  return multiNode(
    "scoreboard-rig",
    [
      { mesh: gantryTruss, material: trussMat },
      { mesh: cabinet, material: cabinetMat },
      { mesh: trim, material: accentTrimMat },
      { mesh: clockFaces, material: shotClockLed }
    ],
    { position: [0, 0, -12.5], castShadow: false, receiveShadow: true }
  );
}

/** Venice Beach slatted coastal timber lifeguard tower with wrap-around deck, studioGlass cab & rescue buoy. */
export function buildVeniceLifeguardTowerNode(position: AuraVec3, yaw: number): AuraNodeBuilder<AuraSceneNode> {
  const sunbleachedWood = material.lacquer({ color: "#d8cdb8", roughness: 0.56, clearcoat: 0.24 });
  const trimBlue = material.clearcoatPaint({ color: "#2b7ca8", roughness: 0.3, clearcoat: 0.72 });
  const cabGlass = material.studioGlass({ tint: "#cdebf5", roughness: 0.03, transmission: 0.88, thickness: 0.05 });
  const buoyRed = material.clearcoatPaint({ color: "#e6392e", roughness: 0.18, clearcoat: 0.92 });

  const pilings = combineRaw([
    tube([[-1.05, 0, -1.05], [-0.82, 1.85, -0.82]], 0.085, 8),
    tube([[1.05, 0, -1.05], [0.82, 1.85, -0.82]], 0.085, 8),
    tube([[-1.05, 0, 1.05], [-0.82, 1.85, 0.82]], 0.085, 8),
    tube([[1.05, 0, 1.05], [0.82, 1.85, 0.82]], 0.085, 8),
    tube([[-0.98, 0.45, 0.98], [0.86, 1.65, 0.86]], 0.045, 6),
    tube([[0.98, 0.45, 0.98], [-0.86, 1.65, 0.86]], 0.045, 6),
    place(box(2.85, 0.14, 2.85, 0.02), [0, 1.9, 0]),
    place(box(1.88, 1.12, 1.88, 0.025), [0, 2.52, -0.1]),
    ...([[-0.88, -0.98], [0.88, -0.98], [-0.88, 0.78], [0.88, 0.78]] as const).map(([px, pz]) =>
      place(box(0.11, 0.96, 0.11, 0.012), [px, 3.52, pz])
    ),
    tube([[-0.42, 1.88, -1.35], [-0.42, 0.04, -2.95]], 0.05, 6),
    tube([[0.42, 1.88, -1.35], [0.42, 0.04, -2.95]], 0.05, 6),
    ...[0.2, 0.45, 0.7, 0.95, 1.2, 1.45, 1.7].map((sy, idx) => place(box(0.78, 0.05, 0.22, 0.008), [0, sy, -2.85 + idx * 0.22]))
  ]);
  const roofAndRails = combineRaw([
    place(
      loftSuper([
        { y: 3.98, rx: 1.38, rz: 1.42, roundness: 0.08 },
        { y: 4.46, rx: 0.18, rz: 0.55, roundness: 0.2 }
      ], 12, true),
      [0, 0, -0.08]
    ),
    tube([[-1.34, 2.74, 1.34], [1.34, 2.74, 1.34], [1.34, 2.74, -1.34]], 0.036, 8),
    tube([[-1.34, 2.74, 1.34], [-1.34, 2.74, -1.34]], 0.036, 8)
  ]);
  const windows = combineRaw([
    place(box(1.68, 0.78, 0.035, 0.006), [0, 3.52, 0.78]),
    place(box(1.68, 0.78, 0.035, 0.006), [0, 3.52, -0.98]),
    place(box(0.035, 0.78, 1.68, 0.006), [-0.88, 3.52, -0.1]),
    place(box(0.035, 0.78, 1.68, 0.006), [0.88, 3.52, -0.1])
  ]);
  const buoy = place(latheMesh([[0, -0.38], [0.075, -0.28], [0.09, 0.12], [0.065, 0.32], [0, 0.4]], 14), [0.72, 2.46, 1.38], [0, 0, 0.24]);

  return multiNode(
    "lifeguard-tower",
    [
      { mesh: pilings, material: sunbleachedWood },
      { mesh: roofAndRails, material: trimBlue },
      { mesh: windows, material: cabGlass },
      { mesh: buoy, material: buoyRed }
    ],
    { position, rotation: [0, yaw, 0], castShadow: true, receiveShadow: true }
  );
}

/** Venice Beach curved ringed-trunk coastal palms with arching pinnate frond crowns (batched across placements). */
export function buildVenicePalmTreeNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const trunkMat = material.matteClay({ color: "#7b5e46", roughness: 0.92 });
  const frondMat = material.physical({ color: "#3b6e3c", roughness: 0.68, sheen: 0.26, sheenColor: "#89b86c" });
  const spots: readonly [number, number, number, number][] = [
    [-12, -8, 1.0, 0.4],
    [12.5, -10, 1.2, -0.55],
    [-14, 12, 0.9, 1.1],
    [14, 14, 1.05, -1.3],
    [-9, 16, 0.82, 2.2]
  ];

  const allTrunks: RawMesh[] = [];
  const allFronds: RawMesh[] = [];
  spots.forEach(([x, z, s, yaw], idx) => {
    const h = 6.4 * s;
    const lean = 0.65 * s;
    const spine = catmullRomSpline3(
      [[0, 0, 0], [lean * 0.25, h * 0.34, lean * 0.1], [lean * 0.72, h * 0.68, -lean * 0.12], [lean, h, 0]],
      6
    );
    const trunk = tube(spine, spine.map((_, i) => (0.21 - (i / spine.length) * 0.08) * s), 10);
    const fronds: RawMesh[] = [];
    for (let f = 0; f < 9; f++) {
      const a = (f / 9) * Math.PI * 2 + idx * 0.37;
      const len = (2.15 + (f % 3) * 0.22) * s;
      const ca = Math.cos(a), sa = Math.sin(a);
      const frondCurve = catmullRomSpline3(
        [
          [lean, h - 0.05, 0],
          [lean + ca * len * 0.42, h + 0.42 * s, sa * len * 0.42],
          [lean + ca * len * 0.82, h - 0.12 * s, sa * len * 0.82],
          [lean + ca * len, h - 0.68 * s, sa * len]
        ],
        4
      );
      fronds.push(tube(frondCurve, frondCurve.map((_, k) => (0.095 - (k / frondCurve.length) * 0.065) * s), 5));
    }
    const pos: V3 = [x, 0, z];
    const rot: V3 = [0, yaw, 0];
    allTrunks.push(place(trunk, pos, rot));
    allFronds.push(place(combineRaw(fronds), pos, rot));
  });

  return [
    multiNode(
      "venice-palms",
      [
        { mesh: combineRaw(allTrunks), material: trunkMat },
        { mesh: combineRaw(allFronds), material: frondMat }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/* -------------------------------------------------------------------------- */
/* 3. Athens, Manila, Shanghai, Orbit, Enclosures & Multi-Tier Bleachers      */
/* -------------------------------------------------------------------------- */

/** Athens Rooftop whitewashed Cycladic arcade loggia, stone voussoir arches & Aegean blue cupola (`"venue-shell"`). */
export function buildAthensVenueShellNode(): AuraNodeBuilder<AuraSceneNode> {
  const stuccoMat = material.ceramic({ color: "#f0ebe1", roughness: 0.76, clearcoat: 0.08 });
  const domeBlueMat = material.lacquer({ color: "#1f6fd1", roughness: 0.24, clearcoat: 0.85 });
  const terracottaMat = material.matteClay({ color: "#b86441", roughness: 0.78 });
  const timberMat = material.lacquer({ color: "#6d482e", roughness: 0.52 });

  const basePiers: RawMesh[] = [
    place(box(22.4, 0.42, 3.2, 0.03), [0, 0.21, 0]),
    place(box(22.8, 0.32, 3.5, 0.03), [0, 4.65, 0])
  ];
  const keystonePiers: RawMesh[] = [];
  for (const ax of [-7.5, -2.5, 2.5, 7.5]) {
    basePiers.push(place(box(0.78, 3.1, 0.82, 0.03), [ax - 2.1, 1.95, 0.6]));
    if (ax === 7.5) basePiers.push(place(box(0.78, 3.1, 0.82, 0.03), [ax + 2.1, 1.95, 0.6]));
    const archSlots = archwayVoussoirSlots({
      radius: 1.55,
      thickness: 0.42,
      depth: 0.78,
      voussoirs: 9,
      stoneMatA: 0,
      stoneMatB: 0,
      keystoneMat: 2
    });
    for (const s of archSlots) {
      const m = place(s.mesh, [ax, 3.1, 0.6]);
      if (s.materialIndex === 2) keystonePiers.push(m);
      else basePiers.push(m);
    }
  }
  basePiers.push(place(latheMesh([[0, 4.8], [2.45, 4.8], [2.45, 6.05], [2.25, 6.15], [0, 6.15]], 20), [0, 0, -0.2]));
  const blueCupola = place(
    latheMesh([[0, 6.1], [2.32, 6.1], [2.18, 6.85], [1.45, 7.55], [0.45, 7.95], [0, 8.08]], 24),
    [0, 0, -0.2]
  );
  const cornice = combineRaw([place(box(23.2, 0.22, 3.75, 0.025), [0, 4.9, 0]), ...keystonePiers]);
  const pergola = combineRaw([-9, -6, -3, 0, 3, 6, 9].map((rx) => place(box(0.16, 0.22, 4.2, 0.015), [rx, 4.42, 0.9])));

  return multiNode(
    "venue-shell",
    [
      { mesh: combineRaw(basePiers), material: stuccoMat },
      { mesh: blueCupola, material: domeBlueMat },
      { mesh: cornice, material: terracottaMat },
      { mesh: pergola, material: timberMat }
    ],
    { position: [0, 0, -22], castShadow: false, receiveShadow: true }
  );
}

/** Manila Barangay barrel-vault corrugated steel court canopy on curved bowstring trusses (`"manila-canopy"`). */
export function buildManilaBarangayCanopyNode(): AuraNodeBuilder<AuraSceneNode> {
  const trussSteel = material.brushedMetal({ color: "#5e6670", roughness: 0.38, envMapIntensity: 1.2 });
  const galvRoof = material.studioMetal({ color: "#767e87", roughness: 0.42, envMapIntensity: 1.1 });
  const bannerFabric = material.fabric({ color: "#ffe14d", roughness: 0.78, sheen: 0.45 });

  const archPts: [number, number][] = [];
  for (let i = 0; i <= 18; i++) {
    const u = -1 + (2 * i) / 18;
    archPts.push([u * 16.9, 9.05 + (1 - u * u) * 3.25]);
  }
  const vaultRoof = extrudePolygonMesh(
    [...archPts, ...[...archPts].reverse().map(([x, y]): [number, number] => [x, y - 0.14])],
    36.4
  );
  const trusses: RawMesh[] = [];
  for (const tz of [-13, -6.5, -1, 4.5, 10, 15, 20]) {
    trusses.push(tube(archPts.map(([x, y]): V3 => [x, y - 0.32, tz]), 0.09, 8));
    trusses.push(tube([[-16.4, 8.85, tz], [16.4, 8.85, tz]], 0.065, 6));
  }
  const banners = combineRaw([
    place(box(32.6, 0.58, 0.05, 0.01), [0, 8.75, -17.9]),
    place(box(32.6, 0.58, 0.05, 0.01), [0, 8.75, 17.9])
  ]);

  return multiNode(
    "manila-canopy",
    [
      { mesh: vaultRoof, material: galvRoof },
      { mesh: combineRaw(trusses), material: trussSteel },
      { mesh: banners, material: bannerFabric }
    ],
    { position: [0, 0, 3.5], castShadow: false, receiveShadow: true }
  );
}

/** Manila side corrugated rain-awning pavilions (`corrugated-roof-w/e`, batched across placements). */
export function buildManilaCorrugatedShedNodes(
  placements: readonly { readonly name: string; readonly position: AuraVec3; readonly yaw: number }[]
): AuraNodeBuilder<AuraSceneNode>[] {
  if (placements.length === 0) return [];
  const frameMat = material.brushedMetal({ color: "#555c65", roughness: 0.44 });
  const sheetMat = material.studioMetal({ color: "#6f5d4e", roughness: 0.48, envMapIntensity: 0.95 });
  const wallMat = material.matteClay({ color: "#4b4036", roughness: 0.88 });

  const cols = combineRaw(
    [[-3.8, -1.6], [3.8, -1.6], [-3.8, 1.6], [3.8, 1.6]].map(([cx, cz]) =>
      tube([[cx!, 0, cz!], [cx!, cz! > 0 ? 5.1 : 4.3, cz!]], 0.09, 8)
    )
  );
  const wall = place(box(7.8, 3.1, 0.28, 0.02), [0, 1.55, -1.6]);
  const pitchedSheet = place(box(8.6, 0.12, 4.4, 0.015), [0, 4.78, 0.1], [-0.22, 0, 0]);

  const allCols: RawMesh[] = [];
  const allWalls: RawMesh[] = [];
  const allSheets: RawMesh[] = [];
  for (const p of placements) {
    const pos: V3 = [p.position[0], p.position[1], p.position[2]];
    const rot: V3 = [0, p.yaw, 0];
    allCols.push(place(cols, pos, rot));
    allWalls.push(place(wall, pos, rot));
    allSheets.push(place(pitchedSheet, pos, rot));
  }

  return [
    multiNode(
      "manila-corrugated-sheds",
      [
        { mesh: combineRaw(allCols), material: frameMat },
        { mesh: combineRaw(allWalls), material: wallMat },
        { mesh: combineRaw(allSheets), material: sheetMat }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Manila Barangay warm tungsten festoon lamp strings, ceramic sockets & soft `material.lightBeam` cones. */
export function buildManilaFestoonLampNodes(bulbPositions: readonly AuraVec3[], lampEmissive: number): AuraNodeBuilder<AuraSceneNode>[] {
  const cableMat = material.sneakerRubber({ color: "#1b1a18", roughness: 0.82 });
  const socketMat = material.ceramic({ color: "#ebe6dc", roughness: 0.28 });
  const bulbMat = material.emissive({ color: "#5a3a18", emissive: "#ffb46b", emissiveIntensity: lampEmissive, practical: true });
  const beamMat = pairedLightBeamMaterial({
    color: "#ffb46b",
    intensity: 0.18,
    length: 5.4,
    falloff: 1.45,
    edgeSoftness: 1.7,
    noise: 0.28,
    noiseScale: 2.2,
    noiseSpeed: 0.18
  });

  const cables = combineRaw(
    [-6.4, 6.4].map((x) => {
      const pts: V3[] = [];
      for (let i = 0; i <= 24; i++) {
        const z = -10.5 + (i / 24) * 25.5;
        const sag = -0.14 * Math.abs(Math.sin(((z + 9) / 4.5) * Math.PI));
        pts.push([x, 5.88 + sag, z]);
      }
      return tube(pts, 0.016, 6);
    })
  );
  const sockets = combineRaw(
    bulbPositions.map(([bx, by, bz]) =>
      place(latheMesh([[0, 0], [0.16, 0.01], [0.065, 0.07], [0.05, 0.12], [0, 0.12]], 12), [bx, by + 0.06, bz])
    )
  );
  const globes = combineRaw(
    bulbPositions.map(([bx, by, bz]) =>
      place(latheMesh([[0, -0.1], [0.075, -0.07], [0.088, 0.01], [0.045, 0.09], [0, 0.1]], 12), [bx, by, bz])
    )
  );

  const fixtureNode = multiNode(
    "manila-festoon-rig",
    [
      { mesh: cables, material: cableMat },
      { mesh: sockets, material: socketMat },
      { mesh: globes, material: bulbMat }
    ],
    { castShadow: false, receiveShadow: false }
  );

  const beams: AuraNodeBuilder<AuraSceneNode>[] = [-6.4, 6.4].flatMap((sx) =>
    [-4.5, 9].map((sz, idx) =>
      primitives.cone({
        name: `manila-festoon-beam-${sx < 0 ? "w" : "e"}-${idx}`,
        position: [sx, 5.5 - 2.7, sz],
        params: { radius: 1.85, height: 5.4, radialSegments: 20, heightSegments: 5, openEnded: true },
        castShadow: false,
        receiveShadow: false,
        material: beamMat
      }) as unknown as AuraNodeBuilder<AuraSceneNode>
    )
  );

  return [fixtureNode, ...beams];
}

/** Shanghai Riverside ribbed steel shipping containers with corner castings & twin locking-bar doors (batched across placements). */
export function buildShanghaiContainerNodes(
  placements: readonly { readonly name: string; readonly position: AuraVec3; readonly yaw: number }[]
): AuraNodeBuilder<AuraSceneNode>[] {
  if (placements.length === 0) return [];
  const frameMat = material.brushedMetal({ color: "#8c98a6", roughness: 0.3, envMapIntensity: 1.35 });
  const tealMat = material.clearcoatPaint({ color: "#1a5e7a", roughness: 0.24, clearcoat: 0.76 });
  const crimsonMat = material.clearcoatPaint({ color: "#9e2b25", roughness: 0.24, clearcoat: 0.76 });

  const ribs: RawMesh[] = [place(box(5.2, 2.58, 2.42, 0.03), [0, 1.29, 0])];
  for (let rx = -2.2; rx <= 2.21; rx += 0.36) ribs.push(place(box(0.11, 2.36, 2.48, 0.01), [rx, 1.29, 0]));
  const bodyMesh = combineRaw(ribs);

  const hardware: RawMesh[] = [];
  for (const cx of [-2.56, 2.56]) {
    for (const cy of [0.1, 2.48]) {
      for (const cz of [-1.18, 1.18]) hardware.push(place(box(0.18, 0.18, 0.18, 0.015), [cx, cy, cz]));
    }
  }
  for (const dz of [-0.48, -0.16, 0.16, 0.48]) hardware.push(tube([[2.62, 0.18, dz], [2.62, 2.42, dz]], 0.022, 6));
  const hardwareMesh = combineRaw(hardware);

  const tealBodies: RawMesh[] = [];
  const crimsonBodies: RawMesh[] = [];
  const allHardware: RawMesh[] = [];
  placements.forEach((p, idx) => {
    const pos: V3 = [p.position[0], p.position[1], p.position[2]];
    const rot: V3 = [0, p.yaw, 0];
    (idx % 2 === 0 ? tealBodies : crimsonBodies).push(place(bodyMesh, pos, rot));
    allHardware.push(place(hardwareMesh, pos, rot));
  });

  const parts: { readonly mesh: RawMesh; readonly material: AuraMaterialSpec }[] = [
    { mesh: combineRaw(allHardware), material: frameMat }
  ];
  if (tealBodies.length > 0) parts.push({ mesh: combineRaw(tealBodies), material: tealMat });
  if (crimsonBodies.length > 0) parts.push({ mesh: combineRaw(crimsonBodies), material: crimsonMat });

  return [multiNode("shanghai-containers", parts, { castShadow: false, receiveShadow: true })];
}

/** Shanghai Riverside curved anodized neon streetlamps (`shanghai-neon-lamps`, batched across 6 poles). */
export function buildShanghaiNeonLampNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const poleMat = material.studioMetal({ color: "#222b38", roughness: 0.22, envMapIntensity: 1.4 });
  const cyanNeon = material.neon({ color: "#0b2434", emissive: "#39d7ff", emissiveIntensity: 3.2, practical: true });
  const magentaNeon = material.neon({ color: "#2b0d30", emissive: "#e26bff", emissiveIntensity: 3.0, practical: true });

  const poleCurve = catmullRomSpline3([[0, 0, 0], [0, 2.8, 0], [0, 4.15, 0.25], [0, 4.58, 0.88]], 6);
  const mast = combineRaw([
    latheMesh([[0, 0], [0.22, 0], [0.16, 0.28], [0.09, 0.34], [0, 0.34]], 12),
    tube(poleCurve, 0.062, 10)
  ]);
  const blade = combineRaw([
    place(box(0.1, 0.06, 0.92, 0.012), [0, 4.52, 0.72], [0.18, 0, 0]),
    place(box(0.055, 1.45, 0.055, 0.008), [0, 3.15, 0.07])
  ]);

  const spots: readonly [number, number][] = [[-9, -3.2], [9, -3.2], [-9, 11.5], [9, 11.5], [-12, 4], [12, 4]];
  const allMasts: RawMesh[] = [];
  const cyanBlades: RawMesh[] = [];
  const magentaBlades: RawMesh[] = [];
  spots.forEach(([x, z], idx) => {
    const pos: V3 = [x, 0, z];
    const rot: V3 = [0, Math.atan2(-x, 4 - z), 0];
    allMasts.push(place(mast, pos, rot));
    (idx % 2 === 0 ? cyanBlades : magentaBlades).push(place(blade, pos, rot));
  });

  return [
    multiNode(
      "shanghai-neon-lamps",
      [
        { mesh: combineRaw(allMasts), material: poleMat },
        { mesh: combineRaw(cyanBlades), material: cyanNeon },
        { mesh: combineRaw(magentaBlades), material: magentaNeon }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Shanghai Pudong / Bund landmark towers & riverfront skyline (`skyline`, batched across shared materials). */
export function buildShanghaiBundSkylineNodes(includeTowers: boolean): AuraNodeBuilder<AuraSceneNode>[] {
  const towerGlass = material.physical({ color: "#122036", roughness: 0.14, metalness: 0.55, clearcoat: 0.85, clearcoatRoughness: 0.08 });
  const spireSteel = material.studioMetal({ color: "#aebed0", roughness: 0.22, envMapIntensity: 1.45 });
  const pearlMagenta = material.emissive({ color: "#321038", emissive: "#e26bff", emissiveIntensity: 2.1, practical: true });
  const crownCyan = material.emissive({ color: "#0c2838", emissive: "#39d7ff", emissiveIntensity: 1.9, practical: true });

  const allGlass: RawMesh[] = [];
  const allCyan: RawMesh[] = [];
  for (let i = -3; i <= 3; i++) {
    const bx = i * 4.2;
    const h = 14 + (Math.abs(i * 7 + 3) % 5) * 3.4;
    const zOff = -56 + (i % 2) * 1.4;
    allGlass.push(place(box(3.1, h, 3.2, 0.08), [bx, -0.5 + h * 0.5, zOff]));
    allCyan.push(place(box(2.55, 0.45, 3.3, 0.04), [bx, -0.5 + h - 0.55, zOff]));
  }

  const parts: { readonly mesh: RawMesh; readonly material: AuraMaterialSpec }[] = [];

  if (includeTowers) {
    const pearlStruts = place(
      combineRaw([
        ...[0, 1, 2].map((k) => {
          const a = (k / 3) * Math.PI * 2;
          return tube([[Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2], [Math.cos(a) * 0.7, 9.5, Math.sin(a) * 0.7]], 0.28, 8);
        }),
        place(latticeTrussMesh({ span: [1.15, 22, 1.15], bays: 12, chordRadius: 0.08 }), [0, 18.5, 0]),
        tube([[0, 28, 0], [0, 34.5, 0]], 0.14, 8)
      ]),
      [26, 0, -18]
    );
    const pearlSpheres = place(
      combineRaw([
        place(latheMesh([[0, -2.6], [2.2, -1.5], [2.6, 0], [2.2, 1.5], [0, 2.6]], 20), [0, 11.2, 0]),
        place(latheMesh([[0, -1.7], [1.45, -1.0], [1.7, 0], [1.45, 1.0], [0, 1.7]], 18), [0, 24.4, 0])
      ]),
      [26, 0, -18]
    );

    const westCore = place(
      loftSuper([
        { y: 0, rx: 2.6, rz: 2.6, roundness: 0.15 },
        { y: 9, rx: 2.2, rz: 2.2, roundness: 0.2, twist: 0.22 },
        { y: 18, rx: 1.75, rz: 1.75, roundness: 0.25, twist: 0.48 },
        { y: 25.5, rx: 1.15, rz: 1.15, roundness: 0.3, twist: 0.72 }
      ], 16, true),
      [-26, 0, -14]
    );
    allGlass.push(westCore);
    for (const [idx, by] of [8.8, 17.8, 25.2].entries()) {
      allCyan.push(place(box(4.2 - idx * 0.9, 0.35, 4.2 - idx * 0.9, 0.04), [-26, by, -14], [0, idx * 0.24, 0]));
    }
    parts.push({ mesh: pearlStruts, material: spireSteel }, { mesh: pearlSpheres, material: pearlMagenta });
  }

  parts.unshift({ mesh: combineRaw(allGlass), material: towerGlass }, { mesh: combineRaw(allCyan), material: crownCyan });
  return [multiNode("skyline", parts, { castShadow: false, receiveShadow: false })];
}

/** Orbit Court station ring halo truss (`"orbit-halo"`). */
export function buildOrbitStationHaloNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const titaniumMat = material.studioMetal({ color: "#93a3ba", roughness: 0.22, envMapIntensity: 1.5 });
  const solarPanelMat = material.physical({ color: "#102544", roughness: 0.16, metalness: 0.65, clearcoat: 0.82 });
  const cyanStripMat = material.emissive({ color: "#0b1a2c", emissive: "#7dfcff", emissiveIntensity: 1.65, practical: true });

  const spokes: RawMesh[] = [
    tube(circleRingPts(0, 0, 0, 22.4, 28, "z"), 0.42, 10, false),
    tube(circleRingPts(0, 0, 0, 19.2, 28, "z"), 0.34, 10, false)
  ];
  const panels: RawMesh[] = [];
  const beacons: RawMesh[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    spokes.push(tube([[ca * 19.2, sa * 19.2, 0], [ca * 22.4, sa * 22.4, 0]], 0.2, 6));
    if (i % 3 === 0) panels.push(place(box(5.8, 2.2, 0.12, 0.03), [ca * 26.2, sa * 26.2, 0], [0, 0, a]));
    beacons.push(place(box(0.38, 0.38, 0.9, 0.04), [ca * 20.8, sa * 20.8, 0.48], [0, 0, a]));
  }

  return [
    multiNode(
      "orbit-halo",
      [
        { mesh: combineRaw(spokes), material: titaniumMat },
        { mesh: combineRaw(panels), material: solarPanelMat },
        { mesh: combineRaw(beacons), material: cyanStripMat }
      ],
      { position: [0, 14, -20], rotation: [0.38, 0, 0], castShadow: false, receiveShadow: false }
    )
  ];
}

/** Orbit Court hero Planet Earth (`"planet-earth"`) with `material.planet` ocean, continents & `material.atmosphere` limb shell. */
export function buildOrbitPlanetEarthNode(): AuraNodeBuilder<AuraSceneNode> {
  const oceanMat = material.planet("ice", { color: "#1d5fa8", roughness: 0.22, clearcoat: 1, envMapIntensity: 1.15 });
  const landMat = material.matteClay({ color: "#3d7a4c", roughness: 0.84 });
  const cloudMat = material.ceramic({ color: "#f2f7ff", roughness: 0.38, opacity: 0.42 });
  const atmoMat = material.atmosphere({ color: "#5cb8ff", emissive: "#4ca6ff", emissiveIntensity: 0.72, opacity: 0.26, practical: true });

  const R = 96;
  const oceanSphere = icosphereFacetMesh(R, 2, 0.002, 101);
  const landSphere = icosphereFacetMesh(R, 2, 0.005, 202);
  for (let i = 0; i < landSphere.positions.length; i += 3) {
    const px = landSphere.positions[i]!, py = landSphere.positions[i + 1]!, pz = landSphere.positions[i + 2]!;
    const len = Math.hypot(px, py, pz) || 1;
    const ux = px / len, uy = py / len, uz = pz / len;
    const n = fbm3(ux * 2.6 + 1.4, uy * 2.6 - 0.7, uz * 2.6 + 2.1, 4);
    const rr = n > 0.51 ? R * (1.008 + (n - 0.51) * 0.03) : R * 0.975;
    landSphere.positions[i] = ux * rr;
    landSphere.positions[i + 1] = uy * rr;
    landSphere.positions[i + 2] = uz * rr;
  }
  const atmoShell = icosphereFacetMesh(R * 1.055, 2, 0, 303);
  const cloudBands = place(tube(circleRingPts(0, R * 0.18, 0, R * 0.99, 32, "y"), 2.4, 8, false), undefined, [0.22, 0, -0.15]);

  return multiNode(
    "planet-earth",
    [
      { mesh: oceanSphere, material: oceanMat },
      { mesh: landSphere, material: landMat },
      { mesh: cloudBands, material: cloudMat },
      { mesh: atmoShell, material: atmoMat }
    ],
    { id: "planet-earth", position: [-60, 130, -300], castShadow: false, receiveShadow: false }
  );
}

/** 360° streetball perimeter enclosures per court (zero lollipop cylinder+sphere trees or raw horizon boxes). */
export function buildProceduralEnclosureNodes(courtId: CourtId): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [];

  if (courtId === "rucker") {
    const fenceMat = material.custom(dualChainLinkFenceSpec("#8a9199"));
    const steelMat = material.brushedMetal({ color: "#8a9199", roughness: 0.34 });
    const barkMat = material.matteClay({ color: "#3d2c22", roughness: 0.92 });
    const leafMat = material.physical({ color: "#29402a", roughness: 0.82, sheen: 0.2, sheenColor: "#5a7d4c" });

    const fenceFrameParts: RawMesh[] = [
      tube([[-22.4, 4.1, -21.2], [22.4, 4.1, -21.2]], 0.055, 8),
      tube([[-22.4, 4.1, -21.2], [-22.4, 4.1, 21]], 0.055, 8),
      tube([[22.4, 4.1, -21.2], [22.4, 4.1, 21]], 0.055, 8)
    ];
    for (const x of [-21, -14, -7, 0, 7, 14, 21]) fenceFrameParts.push(tube([[x, 0, -21.2], [x, 4.15, -21.2]], 0.05, 8));
    for (const z of [-18, -10, -2, 6, 14, 21]) {
      fenceFrameParts.push(tube([[-22.4, 0, z], [-22.4, 4.15, z]], 0.05, 8));
      fenceFrameParts.push(tube([[22.4, 0, z], [22.4, 4.15, z]], 0.05, 8));
    }
    out.push(
      primitives.plane({ name: "rucker-fence-north", size: [44.8, 1, 4.1], material: fenceMat }).position(0, 2.05, -21.2).rotate(Math.PI / 2, 0, 0) as unknown as AuraNodeBuilder<AuraSceneNode>,
      primitives.plane({ name: "rucker-fence-west", size: [42.2, 1, 4.1], material: fenceMat }).position(-22.4, 2.05, -0.1).rotate(Math.PI / 2, 0, Math.PI / 2) as unknown as AuraNodeBuilder<AuraSceneNode>,
      primitives.plane({ name: "rucker-fence-east", size: [42.2, 1, 4.1], material: fenceMat }).position(22.4, 2.05, -0.1).rotate(Math.PI / 2, 0, -Math.PI / 2) as unknown as AuraNodeBuilder<AuraSceneNode>,
      singleMeshNode("rucker-fence-posts", fenceFrameParts, steelMat)
    );

    const treeSpots: readonly [number, number, number][] = [
      [-28, -26, 1.05], [-16, -30, 1.18], [16, -30, 1.12], [28, -25, 1.0],
      [-31, -6, 1.15], [31, -5, 1.08], [-29, 18, 1.04], [29, 19, 1.14]
    ];
    const allTrunks: RawMesh[] = [];
    const allCrowns: RawMesh[] = [];
    treeSpots.forEach(([tx, tz, s], idx) => {
      const h = 4.6 * s;
      const lean = (hash01(idx * 17 + 3) - 0.5) * 0.65;
      const trunk = loftSuper([
        { y: 0, rx: 0.36 * s, rz: 0.34 * s, roundness: 0.7 },
        { y: h * 0.35, rx: 0.22 * s, rz: 0.21 * s, roundness: 0.85 },
        { y: h, rx: 0.14 * s, rz: 0.14 * s, roundness: 0.9 }
      ], 10, true);
      const b1 = tube([[0, h * 0.72, 0], [-0.95 * s, h * 1.18, 0.4 * s]], 0.09 * s, 6);
      const b2 = tube([[0, h * 0.76, 0], [0.88 * s, h * 1.22, -0.45 * s]], 0.085 * s, 6);
      allTrunks.push(place(combineRaw([trunk, b1, b2]), [tx, 0, tz], [0, idx * 0.9, lean * 0.08]));
      const canopy = layeredCanopyMesh({ radius: 2.9 * s, height: 3.6 * s, puffs: 8, seed: 41 + idx * 13 });
      allCrowns.push(place(toFlatShaded(canopy), [tx, h * 0.85, tz], [0, idx * 1.3, 0]));
    });
    out.push(
      singleMeshNode("rucker-tree-trunks", allTrunks, barkMat),
      singleMeshNode("rucker-tree-crowns", allCrowns, leafMat)
    );
    return out;
  }

  if (courtId === "venice") {
    const wallMat = material.ceramic({ color: "#dad0ba", roughness: 0.78, clearcoat: 0.08 });
    const bluffMat = material.matteClay({ color: "#786256", roughness: 0.94 });
    const seawall = [
      place(box(86, 0.74, 0.56, 0.05), [0, 0.37, -16.4]),
      place(box(86.3, 0.12, 0.72, 0.03), [0, 0.78, -16.4]),
      place(box(0.48, 0.68, 40, 0.04), [-26, 0.34, 4]),
      place(box(0.48, 0.68, 40, 0.04), [26, 0.34, 4])
    ];
    const cliffs = [
      place(stratifiedCliffMesh({ radiusX: 28, radiusZ: 11, height: 11.5, terraces: 5, seed: 11 }), [-68, 0, -86], [0, 0.25, 0]),
      place(stratifiedCliffMesh({ radiusX: 25, radiusZ: 10, height: 9.2, terraces: 4, seed: 29 }), [74, 0, -92], [0, -0.2, 0])
    ];
    out.push(
      singleMeshNode("venice-boardwalk-wall", seawall, wallMat),
      singleMeshNode("venice-coastal-horizon", cliffs, bluffMat)
    );
    return out;
  }

  if (courtId === "athens") {
    const stuccoMat = material.ceramic({ color: "#eee8dc", roughness: 0.8, clearcoat: 0.06 });
    const copingMat = material.lacquer({ color: "#b66543", roughness: 0.38 });
    const walls = [
      place(box(45, 1.14, 0.48, 0.04), [0, 0.57, -21.5]),
      place(box(0.48, 1.14, 48, 0.04), [-22.5, 0.57, 2.5]),
      place(box(0.48, 1.14, 48, 0.04), [22.5, 0.57, 2.5]),
      place(box(45, 1.14, 0.48, 0.04), [0, 0.57, 26.5])
    ];
    const coping = [
      place(box(45.3, 0.12, 0.64, 0.03), [0, 1.19, -21.5]),
      place(box(0.64, 0.12, 48.3, 0.03), [-22.5, 1.19, 2.5]),
      place(box(0.64, 0.12, 48.3, 0.03), [22.5, 1.19, 2.5]),
      place(box(45.3, 0.12, 0.64, 0.03), [0, 1.19, 26.5])
    ];
    out.push(
      singleMeshNode("athens-parapet-walls", walls, stuccoMat, { castShadow: false, receiveShadow: true }),
      singleMeshNode("athens-parapet-coping", coping, copingMat)
    );
    return out;
  }

  if (courtId === "manila") {
    const colSteel = material.brushedMetal({ color: "#5e656d", roughness: 0.38 });
    const houseWall = material.matteClay({ color: "#3d332a", roughness: 0.88 });
    const houseRoof = material.studioMetal({ color: "#5c3f31", roughness: 0.52 });

    const cols: RawMesh[] = [];
    for (const x of [-16.2, 16.2]) {
      for (const z of [-13, -1, 10, 20]) {
        cols.push(
          place(box(0.64, 0.22, 0.64, 0.02), [x, 0.11, z]),
          place(latticeTrussMesh({ span: [0.36, 9.0, 0.36], bays: 9, chordRadius: 0.022 }), [x, 4.6, z])
        );
      }
    }
    const houses: RawMesh[] = [];
    const roofs: RawMesh[] = [];
    const gableUnit = extrudePolygonMesh([[-6.8, 0], [6.8, 0], [7.3, 0.3], [0, 2.3], [-7.3, 0.3]], 11.4);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 52 + (i % 3) * 6;
      const h = 7.5 + (i % 4) * 2.8;
      const px = Math.sin(a) * r, pz = 4 + Math.cos(a) * r;
      houses.push(place(box(12.8, h, 10.6, 0.08), [px, h * 0.5, pz], [0, a, 0]));
      roofs.push(place(gableUnit, [px, h, pz], [0, a, 0]));
    }
    out.push(
      singleMeshNode("manila-canopy-columns", cols, colSteel, { castShadow: false }),
      singleMeshNode("manila-alley-blocks", houses, houseWall),
      singleMeshNode("manila-gable-roofs", roofs, houseRoof)
    );
    return out;
  }

  if (courtId === "shanghai") {
    const fenceMat = material.custom(dualChainLinkFenceSpec("#6e849c"));
    const railMetal = material.brushedMetal({ color: "#93a8c0", roughness: 0.24, envMapIntensity: 1.4 });
    const towerMat = material.physical({ color: "#121c30", roughness: 0.2, metalness: 0.5, clearcoat: 0.78 });
    const neonMat = material.emissive({ color: "#10283b", emissive: "#39d7ff", emissiveIntensity: 1.4, practical: true });

    const rails: RawMesh[] = [
      tube([[-28, 1.08, 13.6], [28, 1.08, 13.6]], 0.048, 8),
      tube([[-28, 0.58, 13.6], [28, 0.58, 13.6]], 0.032, 6)
    ];
    for (let x = -28; x <= 28; x += 4) rails.push(tube([[x, 0, 13.6], [x, 1.12, 13.6]], 0.045, 8));

    const skyTowers: RawMesh[] = [];
    const skyCrowns: RawMesh[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 84 + (i % 4) * 7;
      const h = 24 + (i % 5) * 8.5;
      const w = 10 + (i % 3) * 2.6;
      const px = Math.sin(a) * r, pz = 4 + Math.cos(a) * r;
      const shaft = loftSuper([
        { y: 0, rx: w * 0.5, rz: w * 0.5, roundness: 0.14 },
        { y: h * 0.72, rx: w * 0.46, rz: w * 0.46, roundness: 0.18, twist: (i % 2) * 0.22 },
        { y: h, rx: w * 0.36, rz: w * 0.36, roundness: 0.24, twist: (i % 2) * 0.38 }
      ], 12, true);
      skyTowers.push(place(shaft, [px, 0, pz], [0, a, 0]));
      skyCrowns.push(place(box(w * 0.76, 0.5, w * 0.76, 0.05), [px, h - 0.8, pz], [0, a, 0]));
    }

    out.push(
      primitives.plane({ name: "shanghai-fence-north", size: [36, 1, 3.8], material: fenceMat }).position(0, 1.9, -20.2).rotate(Math.PI / 2, 0, 0) as unknown as AuraNodeBuilder<AuraSceneNode>,
      singleMeshNode("shanghai-river-rail", rails, railMetal),
      singleMeshNode("shanghai-horizon-towers", skyTowers, towerMat),
      singleMeshNode("shanghai-tower-crowns", skyCrowns, neonMat)
    );
    return out;
  }

  // Orbit Court: machined station deck perimeter stanchions, continuous safety ring & cyan beacons at r = 29.2 m
  const stanchionMetal = material.studioMetal({ color: "#8090ab", roughness: 0.24, envMapIntensity: 1.45 });
  const beaconMat = material.emissive({ color: "#0b1c2c", emissive: "#7dfcff", emissiveIntensity: 1.55, practical: true });
  const stanchions: RawMesh[] = [
    tube(circleRingPts(0, 1.04, 4, 29.2, 48, "y"), 0.048, 8, false),
    tube(circleRingPts(0, 0.54, 4, 29.2, 48, "y"), 0.032, 6, false)
  ];
  const beacons: RawMesh[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const px = Math.sin(a) * 29.2, pz = 4 + Math.cos(a) * 29.2;
    stanchions.push(
      place(
        loftSuper([
          { y: 0, rx: 0.14, rz: 0.18, roundness: 0.25 },
          { y: 1.14, rx: 0.09, rz: 0.13, roundness: 0.35 }
        ], 8, true),
        [px, 0, pz],
        [0, a, 0]
      )
    );
    beacons.push(place(box(0.2, 0.08, 0.24, 0.02), [px, 1.18, pz], [0, a, 0]));
  }
  out.push(
    singleMeshNode("orbit-deck-stanchions", stanchions, stanchionMetal),
    singleMeshNode("orbit-deck-beacons", beacons, beaconMat)
  );
  return out;
}

/** Multi-tier open-frame bleachers with galvanized steel stringers, footboards, contoured seat planks & handrails. */
export function buildProceduralBleacherNodes(
  stands: readonly (readonly [number, number, number])[],
  rows: number,
  colors: { readonly color: AuraColor; readonly seat: AuraColor }
): AuraNodeBuilder<AuraSceneNode>[] {
  const steelMat = material.brushedMetal({ color: colors.color, roughness: 0.36, envMapIntensity: 1.25 });
  const seatMat = material.lacquer({ color: colors.seat, roughness: 0.3 });

  const allSteel: RawMesh[] = [];
  const allSeats: RawMesh[] = [];

  for (const [x, z, yaw] of stands) {
    const localSteel: RawMesh[] = [];
    const localSeats: RawMesh[] = [];
    const backD = (rows - 1) * 0.8 + 0.38;
    const topH = rows * 0.45;
    for (const sx of [-4.6, -1.55, 1.55, 4.6]) {
      localSteel.push(tube([[sx, 0, -0.25], [sx, 0, -backD], [sx, topH, -backD], [sx, 0.35, -0.25]], 0.042, 6));
    }
    for (const sx of [-4.85, 4.85]) {
      localSteel.push(tube([[sx, 0.45, -0.15], [sx, 1.15, -0.15], [sx, topH + 0.72, -backD], [sx, topH, -backD]], 0.034, 6));
    }
    for (let r = 0; r < rows; r++) {
      const h = 0.45 * (r + 1);
      const d = -0.8 * r;
      localSteel.push(place(box(9.8, 0.055, 0.42, 0.01), [0, h - 0.22, d + 0.2]));
      localSteel.push(place(box(9.7, 0.07, 0.08, 0.01), [0, h - 0.02, d - 0.12]));
      localSeats.push(place(box(9.65, 0.08, 0.35, 0.018), [0, h + 0.04, d - 0.12]));
    }
    allSteel.push(place(combineRaw(localSteel), [x, 0, z], [0, yaw, 0]));
    allSeats.push(place(combineRaw(localSeats), [x, 0, z], [0, yaw, 0]));
  }

  return [
    singleMeshNode("bleacher-risers", allSteel, steelMat, { castShadow: false, receiveShadow: true }),
    singleMeshNode("bleacher-planks", allSeats, seatMat, { castShadow: false, receiveShadow: true })
  ];
}

// Re-export `buildGroupedGeometrySpec` so procedural tests or callers can inspect grouped specs directly if needed.
export { buildGroupedGeometrySpec };
