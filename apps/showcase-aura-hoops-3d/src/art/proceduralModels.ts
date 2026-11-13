/**
 * Procedural multi-material 3D art assembly for Aura Hoops 3D (WP-07).
 *
 * Replaces all 22 static clay Meshy prop/backdrop GLBs and raw primitive placeholders
 * with true curved/compound sculptural geometry built exclusively via `@aura3d/engine`
 * and `proceduralKernel.ts` (zero `three` imports; WebGPU + WebGL2 dual-backend clean).
 */
import {
  geometry,
  group,
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
  gripQAxis,
  gripQConj,
  gripQFromTo,
  gripQMul,
  gripQRot,
  gripQToEulerZYX,
  gripUnit,
  type GripQuat
} from "@aura3d/engine/game";
import {
  archwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
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
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptHumanoidLimbMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
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
  const hasColors = meshes.some(
    (m) => m.colors && (m.colors.length === (m.positions.length / 3) * 4 || m.colors.length === m.positions.length)
  );
  const colors: number[] = [];
  for (const m of meshes) {
    const vCount = m.positions.length / 3;
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i++) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i++) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i++) uvs.push(m.uvs[i]!);
    if (hasColors) {
      if (m.colors && m.colors.length === vCount * 4) {
        for (let i = 0; i < m.colors.length; i++) colors.push(m.colors[i]!);
      } else if (m.colors && m.colors.length === vCount * 3) {
        for (let i = 0; i < vCount; i++) {
          colors.push(m.colors[i * 3]!, m.colors[i * 3 + 1]!, m.colors[i * 3 + 2]!, 1);
        }
      } else {
        for (let i = 0; i < vCount; i++) colors.push(1, 1, 1, 1);
      }
    }
    for (let i = 0; i < m.indices.length; i++) indices.push(m.indices[i]! + vOff);
  }
  return hasColors ? { positions, normals, uvs, indices, colors } : { positions, normals, uvs, indices };
}

function paintedSingleMeshNode(
  name: string,
  parts: readonly { readonly mesh: RawMesh; readonly color: string }[],
  mat: AuraMaterialSpec,
  opts: {
    readonly id?: string;
    readonly position?: AuraVec3;
    readonly rotation?: AuraVec3;
    readonly scale?: AuraVec3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
  } = {}
): AuraNodeBuilder<AuraSceneNode> {
  const merged = bakeMeshCavityAO(combineRaw(parts.map((p) => paintMeshColors(p.mesh, p.color))), 0.34);
  const spec = mergeRawMeshes([merged]);
  return geometry.custom(spec, {
    ...(opts.id ? { id: opts.id } : {}),
    name,
    material: mat,
    ...(opts.position ? { position: opts.position } : {}),
    ...(opts.rotation ? { rotation: opts.rotation } : {}),
    ...(opts.scale ? { scale: opts.scale } : {}),
    castShadow: opts.castShadow ?? false,
    receiveShadow: opts.receiveShadow ?? true
  }) as unknown as AuraNodeBuilder<AuraSceneNode>;
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
  const hardwareColor = "#b9c2cc";
  const padColor = lookOriginal ? "#2b3038" : "#1d222b";
  const padSeamColor = "#ff7a1a";
  const padMat = material.fabric({ color: "#fffef9", roughness: 0.78, sheen: 0.28 });

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

  const padMesh = subdivideSmoothMesh(
    loftSuper([
      { y: 0.08, rx: 0.21, rz: 0.23, roundness: 0.35 },
      { y: 0.22, rx: 0.22, rz: 0.24, roundness: 0.35 },
      { y: 1.78, rx: 0.2, rz: 0.22, roundness: 0.4 },
      { y: 1.92, rx: 0.15, rz: 0.16, roundness: 0.5 }
    ], 14, true),
    1,
    0.45
  );
  const seamRibs = combineRaw([0.36, 0.86, 1.36, 1.76].map((y) => tube(circleRingPts(0, y, 0, 0.216, 16, "y"), 0.014, 8, false)));

  const postNode = paintedSingleMeshNode(
    "hoop-stanchion-steel",
    [
      { mesh: combineRaw([...gussets, mainPost, strutL, strutR]), color: postTone },
      { mesh: hFrame, color: hardwareColor }
    ],
    material.brushedMetal({ ...steelMat, color: "#ffffff" } as any),
    { castShadow: true, receiveShadow: true }
  );
  const padNode = paintedSingleMeshNode(
    "hoop-stanchion-pad",
    [
      { mesh: padMesh, color: padColor },
      { mesh: seamRibs, color: padSeamColor }
    ],
    padMat,
    { castShadow: false, receiveShadow: true }
  );

  return group("hoop-stanchion-rig", [postNode, padNode], { position: [0, 0, -1.68] }) as unknown as AuraNodeBuilder<AuraSceneNode>;
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
    tube(circleRingPts(0, 0, 0, ringCenterR, 36, "y"), 0.013, 12, false),
    tube([[-0.14, -0.02, -0.2], [-0.21, -0.01, -0.11]], 0.0095, 8),
    tube([[0.14, -0.02, -0.2], [0.21, -0.01, -0.11]], 0.0095, 8)
  ];
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    const hx = Math.cos(a) * (ringCenterR - 0.004);
    const hz = Math.sin(a) * (ringCenterR - 0.004);
    rimParts.push(tube([[hx * 0.97, -0.008, hz * 0.97], [hx, -0.028, hz], [hx * 1.02, -0.01, hz * 1.02]], 0.004, 6));
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

  return group(
    "hoop-rim",
    [
      singleMeshNode("hoop-rim-collar", [collarMesh], collarMetalMat, { castShadow: false, receiveShadow: true }),
      singleMeshNode("hoop-rim-ring", [combineRaw(rimParts)], rimPaintMat, { castShadow: true, receiveShadow: true })
    ],
    { id: "rim-assembly", position: [opts.rim[0], opts.rim[1], opts.rim[2]] }
  ) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

export function buildTautNetTopNode(rimY: number, lookOriginal: boolean): AuraNodeBuilder<AuraSceneNode> {
  const ptsA: V3[] = [];
  const ptsB: V3[] = [];
  const segs = 60;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const scallop = -0.013 * Math.abs(Math.sin(a * 6));
    const twist = 0.0035 * Math.cos(a * 24);
    const twistY = 0.0035 * Math.sin(a * 24);
    ptsA.push([Math.cos(a) * (0.236 + twist), scallop + twistY, Math.sin(a) * (0.236 + twist)]);
    ptsB.push([Math.cos(a) * (0.236 - twist), scallop - twistY, Math.sin(a) * (0.236 - twist)]);
  }
  const mat = lookOriginal
    ? material.pbr({ color: "#e8e8e0", roughness: 0.7 })
    : material.fabric({ color: "#eef2f6", roughness: 0.62, sheen: 0.35 });
  return singleMeshNode("net-top", [tube(ptsA, 0.0055, 7, false), tube(ptsB, 0.005, 7, false)], mat, {
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
    ? material.pbr({ color: "#ffffff", roughness: 0.68 })
    : material.physical({
      color: "#ffffff",
      roughness: opts.overrides[0]?.roughness ?? 0.62,
      clearcoat: opts.overrides[0]?.clearcoat ?? 0.18,
      clearcoatRoughness: 0.48,
      sheen: opts.overrides[0]?.sheen ?? 0.2,
      sheenColor: "#ffb076",
      normal: material.proceduralTextures.rubber({ scale: 36, strength: 0.46, contrast: 0.78 })
    });

  return paintedSingleMeshNode(
    "ball-live",
    [
      { mesh: rawSphere, color: opts.lookOriginal ? "#d85d1a" : "#d95b18" },
      { mesh: seamsMesh, color: "#141619" }
    ],
    leatherMat,
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
    // Note: on the new look, `courtOverheadBeamNodes` in `courtRigs.ts` renders the 4 sodium flood shafts,
    // so only `lookOriginal` needs the standalone cone shafts here (avoiding duplicate additive cones).
    if (lookOriginal) {
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

  const hoodSteel = material.brushedMetal({ color: "#2d323a", roughness: 0.34, envMapIntensity: 1.15 });
  return [
    multiNode(
      "rucker-flood-towers",
      [
        { mesh: combineRaw(allMasts), material: towerSteel },
        { mesh: combineRaw(allHoods), material: hoodSteel },
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
    { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true }
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
    const fenceQuad = (w: number, h: number): RawMesh => ({
      positions: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]
    });
    const mergedFences = [
      place(fenceQuad(44.8, 4.1), [0, 2.05, -21.2]),
      place(fenceQuad(42.2, 4.1), [-22.4, 2.05, -0.1], [0, Math.PI / 2, 0]),
      place(fenceQuad(42.2, 4.1), [22.4, 2.05, -0.1], [0, -Math.PI / 2, 0])
    ];
    out.push(
      singleMeshNode("rucker-fences", mergedFences, fenceMat, { castShadow: false, receiveShadow: false }),
      singleMeshNode("rucker-fence-posts", fenceFrameParts, steelMat, { castShadow: false, receiveShadow: true })
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
      const canopy = subdivideSmoothMesh(layeredCanopyMesh({ radius: 2.9 * s, height: 3.6 * s, puffs: 8, seed: 41 + idx * 13 }), 1, 0.52);
      allCrowns.push(place(canopy, [tx, h * 0.85, tz], [0, idx * 1.3, 0]));
    });
    out.push(
      multiNode(
        "rucker-trees",
        [
          { mesh: combineRaw(allTrunks), material: barkMat },
          { mesh: combineRaw(allCrowns), material: leafMat }
        ],
        { castShadow: false, receiveShadow: true }
      )
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
      primitives.plane({ name: "shanghai-fence-north", size: [36, 1, 3.8], castShadow: false, material: fenceMat } as any).position(0, 1.9, -20.2).rotate(Math.PI / 2, 0, 0) as unknown as AuraNodeBuilder<AuraSceneNode>,
      singleMeshNode("shanghai-river-rail", rails, railMetal, { castShadow: false, receiveShadow: true }),
      singleMeshNode("shanghai-horizon-towers", skyTowers, towerMat, { castShadow: false, receiveShadow: false }),
      singleMeshNode("shanghai-tower-crowns", skyCrowns, neonMat, { castShadow: false, receiveShadow: false })
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

/* -------------------------------------------------------------------------- */
/* 4. Articulated Streetball Athlete Rig & Seated Courtside Fan Rig           */
/* -------------------------------------------------------------------------- */

export const HOOPS_GUARD_HEIGHT = 1.92;
export const HOOPS_BIG_HEIGHT = 1.99;

export const HOOPS_ATHLETE_JOINT_SUFFIXES = [
  "hips",
  "spine",
  "chest",
  "head",
  "arm-l",
  "forearm-l",
  "arm-r",
  "forearm-r",
  "leg-l",
  "calf-l",
  "shoe-l",
  "leg-r",
  "calf-r",
  "shoe-r"
] as const;

export type HoopsAthleteJointSuffix = (typeof HOOPS_ATHLETE_JOINT_SUFFIXES)[number];

export interface HoopsAthleteRigOptions {
  readonly kit: { readonly jersey: string; readonly shorts: string; readonly socks: string };
  readonly big?: boolean;
  readonly lookOriginal?: boolean;
  readonly position?: AuraVec3;
  readonly runtimeFactory?: (nodeId: string) => unknown;
}

const HOOPS_SKIN_PALETTE: readonly AuraColor[] = [
  "#8d5534",
  "#b6774d",
  "#6b3d24",
  "#d89c70",
  "#522e1b"
];

function athleteSeedFromId(id = "p0"): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function attachRt<T extends AuraNodeBuilder<AuraSceneNode>>(
  node: T,
  nodeId: string,
  runtimeFactory?: (id: string) => unknown
): T {
  if (!runtimeFactory) return node;
  return (node as unknown as { runtime(ext: unknown): T }).runtime(runtimeFactory(nodeId));
}

function buildHoopsHairMesh(style: number, hs: number): RawMesh {
  if (style === 0) {
    // Sculpted high-top taper fade smoothed organically
    return subdivideSmoothMesh(
      loftSuper(
        [
          { y: 0.138 * hs, rx: 0.09 * hs, rz: 0.1 * hs, roundness: 0.65 },
          { y: 0.212 * hs, rx: 0.096 * hs, rz: 0.106 * hs, roundness: 0.55 },
          { y: 0.272 * hs, rx: 0.088 * hs, rz: 0.096 * hs, roundness: 0.48 }
        ],
        12,
        true
      ),
      1,
      0.48
    );
  }
  if (style === 1) {
    // Sculpted cornrow braids sweeping back over smooth scalp cap
    const rows: RawMesh[] = [];
    for (let r = -2; r <= 2; r++) {
      const bx = r * 0.028 * hs;
      rows.push(
        tube(
          [
            [bx, 0.205 * hs, 0.065 * hs],
            [bx * 1.04, 0.236 * hs, 0.01 * hs],
            [bx * 0.98, 0.205 * hs, -0.072 * hs],
            [bx * 0.9, 0.135 * hs, -0.102 * hs]
          ],
          0.016 * hs,
          7
        )
      );
    }
    return combineRaw([
      place(subdivideSmoothMesh(icosphereFacetMesh(0.09 * hs, 1, 0, 1), 1, 0.56), [0, 0.175 * hs, -0.008 * hs], [0, 0, 0], [0.96, 0.74, 1.05]),
      ...rows
    ]);
  }
  if (style === 2) {
    // Smooth organic streetball afro taper
    return place(
      subdivideSmoothMesh(icosphereFacetMesh(0.116 * hs, 1, 0.055, 17), 1, 0.52),
      [0, 0.206 * hs, -0.012 * hs],
      [0, 0, 0],
      [1.02, 0.9, 1.06]
    );
  }
  // Clean athletic buzz crown
  return subdivideSmoothMesh(
    loftSuper(
      [
        { y: 0.135 * hs, rx: 0.088 * hs, rz: 0.098 * hs, roundness: 0.75 },
        { y: 0.198 * hs, rx: 0.09 * hs, rz: 0.1 * hs, roundness: 0.78 },
        { y: 0.238 * hs, rx: 0.065 * hs, rz: 0.075 * hs, roundness: 0.85 }
      ],
      12,
      true
    ),
    1,
    0.52
  );
}

interface HighTopSneakerParts {
  readonly upperBody: RawMesh;
  readonly overlayTrim: RawMesh;
  readonly midsole: RawMesh;
  readonly outsole: RawMesh;
}

function buildHighTopSneakerParts(hs: number, ws: number, yOffset: number): HighTopSneakerParts {
  // Ground plane is at yOffset - 0.06 * hs so when yOffset = -shinLen, sole bottom sits at y = 0 in actor space!
  const yFloor = yOffset - 0.06 * hs;
  const outsole = place(
    loftSuper(
      [
        { y: yFloor, rx: 0.056 * ws, rz: 0.138 * hs, roundness: 0.45 },
        { y: yFloor + 0.014 * hs, rx: 0.058 * ws, rz: 0.142 * hs, roundness: 0.48 }
      ],
      14,
      true
    ),
    [0, 0, 0.048 * hs]
  );
  const midsole = place(
    loftSuper(
      [
        { y: yFloor + 0.013 * hs, rx: 0.059 * ws, rz: 0.141 * hs, roundness: 0.5 },
        { y: yFloor + 0.035 * hs, rx: 0.055 * ws, rz: 0.134 * hs, roundness: 0.56 }
      ],
      14,
      true
    ),
    [0, 0, 0.046 * hs]
  );
  const sculptedVamp = subdivideSmoothMesh(
    loftSuper(
      [
        { y: yFloor + 0.032 * hs, rx: 0.055 * ws, rz: 0.132 * hs, roundness: 0.58 },
        { y: yFloor + 0.068 * hs, rx: 0.05 * ws, rz: 0.106 * hs, roundness: 0.64 },
        { y: yFloor + 0.092 * hs, rx: 0.044 * ws, rz: 0.064 * hs, roundness: 0.72 }
      ],
      12,
      true
    ),
    1,
    0.5
  );
  const upperBody = combineRaw([
    place(sculptedVamp, [0, 0, 0.038 * hs]),
    // Padded high-top ankle collar wrapping cleanly around calf sock
    loftSuper(
      [
        { y: yFloor + 0.052 * hs, rx: 0.046 * ws, rz: 0.054 * hs, roundness: 0.74 },
        { y: yFloor + 0.108 * hs, rx: 0.048 * ws, rz: 0.055 * hs, roundness: 0.78 },
        { y: yFloor + 0.128 * hs, rx: 0.044 * ws, rz: 0.05 * hs, roundness: 0.8 }
      ],
      12,
      true
    )
  ]);
  const overlayTrim = combineRaw([
    // Molded heel counter, mid-foot lockdown strap & speed-lace bars
    place(
      loftSuper(
        [
          { y: yFloor + 0.03 * hs, rx: 0.054 * ws, rz: 0.052 * hs, roundness: 0.62 },
          { y: yFloor + 0.082 * hs, rx: 0.049 * ws, rz: 0.048 * hs, roundness: 0.68 }
        ],
        10,
        true
      ),
      [0, 0, -0.028 * hs]
    ),
    place(box(0.106 * ws, 0.018 * hs, 0.044 * hs, 0.005 * hs), [0, yFloor + 0.072 * hs, 0.045 * hs], [0.32, 0, 0]),
    place(box(0.068 * ws, 0.01 * hs, 0.018 * hs, 0.003 * hs), [0, yFloor + 0.084 * hs, 0.068 * hs], [0.36, 0, 0])
  ]);
  return { upperBody, overlayTrim, midsole, outsole };
}

/**
 * Builds a sculpted, multi-material, anatomically connected 14-joint Streetball Athlete Rig
 * (`guard` 1.92 m lean vs `big` 1.99 m broad-shouldered power build), grounded cleanly at `y = 0`.
 * Uses `subdivideSmoothMesh` for heads/hair/shoulders, `sculptHumanoidLimbMesh` for muscular limbs,
 * `memoizeGeometry` for shared body blueprints, and vertex-colored coalescing (`11` draws/athlete).
 */
export function buildArticulatedHoopsAthleteNode(
  id: string,
  options: HoopsAthleteRigOptions
): AuraNodeBuilder<AuraSceneNode> {
  const { kit, big = false, lookOriginal = false, position = [0, 0, 6], runtimeFactory } = options;
  const seed = athleteSeedFromId(id);
  const buildTag = big ? "big" : "guard";
  const hs = (big ? HOOPS_BIG_HEIGHT : HOOPS_GUARD_HEIGHT) / 1.748;
  const ws = (big ? 1.095 : 1.0) * hs;
  const skinHex = HOOPS_SKIN_PALETTE[seed % HOOPS_SKIN_PALETTE.length]!;
  const socksHex = kit.socks ?? "#f8fafc";
  const trimHex = "#f8fafc";
  const hairStyle = (seed >>> 3) % 4;
  const wearsHeadband = ((seed >>> 5) & 1) === 0;
  const wearsShootingSleeve = ((seed >>> 6) & 1) === 0;

  const jerseyMat = material.fabric({
    name: `${id}-kit`,
    color: kit.jersey,
    roughness: 0.66,
    ...(lookOriginal ? {} : { sheen: 0.26, sheenColor: kit.jersey, sheenRoughness: 0.56 })
  });
  const shortsMat = material.fabric({
    name: `${id}-shorts`,
    color: kit.shorts,
    roughness: 0.68,
    ...(lookOriginal ? {} : { sheen: 0.22, sheenColor: kit.shorts, sheenRoughness: 0.6 })
  });
  const matteTrimMat = material.matteClay({
    name: `${id}-trim`,
    color: trimHex,
    roughness: 0.44
  });
  const skinMat = material.physical({
    name: `${id}-skin`,
    color: skinHex,
    roughness: 0.52,
    clearcoat: 0.08,
    clearcoatRoughness: 0.62,
    sheen: 0.12,
    sheenColor: "#f5cba7",
    sheenRoughness: 0.75
  });

  const hipsBindY = 0.96 * hs;
  const spineOffY = 0.08 * hs;
  const chestOffY = 0.16 * hs;
  const headOffY = 0.30 * hs;
  const shoulderX = 0.205 * ws;
  const shoulderOffY = 0.23 * hs;
  const upperLen = 0.255 * hs;
  const foreLen = 0.300 * hs;
  const hipX = 0.105 * ws;
  const hipOffY = -0.05 * hs;
  const thighLen = 0.43 * hs;
  const shinLen = 0.42 * hs;

  // 1. HIPS / CONNECTED BASKETBALL SHORTS PELVIS (1 vertex-colored mesh, castShadow: true)
  const hipsGeo = memoizeGeometry(`hoops:hips:${buildTag}:${kit.shorts}:${trimHex}`, () => {
    const pelvisShortsMesh = combineRaw([
      subdivideSmoothMesh(
        loftSuper(
          [
            { y: -0.115 * hs, rx: 0.184 * ws, rz: 0.134 * ws, roundness: 0.62 },
            { y: -0.03 * hs, rx: 0.176 * ws, rz: 0.128 * ws, roundness: 0.68 },
            { y: 0.055 * hs, rx: 0.16 * ws, rz: 0.114 * ws, roundness: 0.72 },
            { y: 0.1 * hs, rx: 0.154 * ws, rz: 0.108 * ws, roundness: 0.74 }
          ],
          14,
          true
        ),
        1,
        0.48
      ),
      place(icosphereFacetMesh(0.082 * ws, 1, 0, 2), [hipX, hipOffY, 0], [0, 0, 0], [1.0, 0.95, 1.0]),
      place(icosphereFacetMesh(0.082 * ws, 1, 0, 3), [-hipX, hipOffY, 0], [0, 0, 0], [1.0, 0.95, 1.0])
    ]);
    const waistbandMesh = combineRaw([
      loftSuper(
        [
          { y: 0.062 * hs, rx: 0.158 * ws, rz: 0.112 * ws, roundness: 0.74 },
          { y: 0.098 * hs, rx: 0.156 * ws, rz: 0.11 * ws, roundness: 0.74 }
        ],
        14,
        false
      ),
      place(box(0.018 * ws, 0.18 * hs, 0.036 * ws, 0.004), [0.174 * ws, -0.02 * hs, 0]),
      place(box(0.018 * ws, 0.18 * hs, 0.036 * ws, 0.004), [-0.174 * ws, -0.02 * hs, 0])
    ]);
    const merged = bakeMeshCavityAO(
      combineRaw([paintMeshColors(pelvisShortsMesh, kit.shorts), paintMeshColors(waistbandMesh, trimHex)]),
      0.34
    );
    return mergeRawMeshes([merged]);
  });
  const hipsMeshNode = geometry.custom(hipsGeo, {
    name: `${id}-hips-mesh`,
    material: material.fabric({ color: "#fffef9", roughness: 0.68, ...(lookOriginal ? {} : { sheen: 0.2 }) }),
    castShadow: true,
    receiveShadow: true
  }) as unknown as AuraNodeBuilder<AuraSceneNode>;

  // 2 & 3. CONTINUOUS WAIST + SCULPTED V-TAPER SLEEVELESS TANK + COLLAR/NUMBERS + TRAPS
  // (`spine` stays a pose-only joint group; `chest` carries the smooth overlapping waist-to-shoulder mesh -> 1 coalesced draw!)
  const chestTankMesh = subdivideSmoothMesh(
    loftSuper(
      [
        { y: -0.195 * hs, rx: 0.15 * ws, rz: 0.106 * ws, roundness: 0.72 },
        { y: -0.08 * hs, rx: 0.162 * ws, rz: 0.114 * ws, roundness: 0.66 },
        { y: 0.05 * hs, rx: 0.176 * ws, rz: 0.122 * ws, roundness: 0.6 },
        { y: 0.145 * hs, rx: 0.194 * ws, rz: 0.132 * ws, roundness: 0.56 },
        { y: 0.23 * hs, rx: 0.182 * ws, rz: 0.12 * ws, roundness: 0.6 },
        { y: 0.28 * hs, rx: 0.148 * ws, rz: 0.098 * ws, roundness: 0.68 }
      ],
      14,
      true
    ),
    1,
    0.48
  );
  const chestTrimMesh = combineRaw([
    // Rib-knit V-neck collar ring
    place(
      latheMesh(
        [
          [0.074 * ws, -0.012 * hs],
          [0.094 * ws, 0.006 * hs],
          [0.09 * ws, 0.024 * hs],
          [0.072 * ws, 0.018 * hs]
        ],
        16
      ),
      [0, 0.272 * hs, 0.012 * ws],
      [0.24, 0, 0]
    ),
    // Sleeveless armhole rib-knit piping + side stripes
    place(tube(circleRingPts(0, 0, 0, 0.068 * hs, 14, "z"), 0.011 * hs, 6, false), [0.174 * ws, 0.212 * hs, 0], [0, Math.PI / 2, -0.18]),
    place(tube(circleRingPts(0, 0, 0, 0.068 * hs, 14, "z"), 0.011 * hs, 6, false), [-0.174 * ws, 0.212 * hs, 0], [0, Math.PI / 2, 0.18]),
    place(box(0.016 * ws, 0.34 * hs, 0.032 * ws, 0.004), [0.168 * ws, -0.01 * hs, 0]),
    place(box(0.016 * ws, 0.34 * hs, 0.032 * ws, 0.004), [-0.168 * ws, -0.01 * hs, 0]),
    // Bold horizontal chest court band + sculpted twin-digit jersey numbers front & back
    place(box(0.28 * ws, 0.038 * hs, 0.018 * ws, 0.005), [0, 0.162 * hs, 0.125 * ws]),
    place(box(0.044 * ws, 0.096 * hs, 0.016 * ws, 0.004), [-0.034 * ws, 0.088 * hs, 0.124 * ws]),
    place(box(0.044 * ws, 0.096 * hs, 0.016 * ws, 0.004), [0.034 * ws, 0.088 * hs, 0.124 * ws]),
    place(box(0.048 * ws, 0.11 * hs, 0.016 * ws, 0.004), [-0.036 * ws, 0.122 * hs, -0.122 * ws]),
    place(box(0.048 * ws, 0.11 * hs, 0.016 * ws, 0.004), [0.036 * ws, 0.122 * hs, -0.122 * ws])
  ]);
  const chestTrapsSkinMesh = subdivideSmoothMesh(
    loftSuper(
      [
        { y: 0.252 * hs, rx: 0.136 * ws, rz: 0.086 * ws, roundness: 0.72 },
        { y: 0.302 * hs, rx: 0.07 * ws, rz: 0.068 * ws, roundness: 0.8 }
      ],
      12,
      true
    ),
    1,
    0.5
  );
  const chestMeshNode = multiNode(
    `${id}-chest-mesh`,
    [
      { mesh: chestTankMesh, material: jerseyMat },
      { mesh: chestTrimMesh, material: matteTrimMat },
      { mesh: chestTrapsSkinMesh, material: skinMat }
    ],
    { castShadow: true, receiveShadow: true }
  );

  // 4. SMOOTH SCULPTED HEAD + JAW/BROW + TERRYCLOTH HEADBAND + HAIRSTYLE (1 vertex-colored mesh)
  const headGeo = memoizeGeometry(
    `hoops:head:${hs.toFixed(3)}:${skinHex}:${hairStyle}:${wearsHeadband ? kit.jersey : "none"}`,
    () => {
      const craniumSculpt = subdivideSmoothMesh(
        loftSuper(
          [
            { y: 0.028 * hs, rx: 0.058 * hs, rz: 0.066 * hs, roundness: 0.68 },
            { y: 0.078 * hs, rx: 0.08 * hs, rz: 0.094 * hs, roundness: 0.64 },
            { y: 0.138 * hs, rx: 0.087 * hs, rz: 0.1 * hs, roundness: 0.72 },
            { y: 0.198 * hs, rx: 0.083 * hs, rz: 0.096 * hs, roundness: 0.78 },
            { y: 0.234 * hs, rx: 0.054 * hs, rz: 0.064 * hs, roundness: 0.85 }
          ],
          14,
          true
        ),
        1,
        0.54
      );
      const headSkinMesh = combineRaw([
        sculptHumanoidLimbMesh(
          [
            [0, -0.028 * hs, 0, 0.055 * ws],
            [0, 0.015 * hs, 0.002 * hs, 0.052 * ws],
            [0, 0.052 * hs, 0.004 * hs, 0.05 * ws]
          ],
          10,
          0.04
        ),
        place(craniumSculpt, [0, 0, 0.006 * hs]),
        place(box(0.022 * hs, 0.038 * hs, 0.028 * hs, 0.007 * hs), [0, 0.115 * hs, 0.098 * hs], [-0.18, 0, 0]),
        place(icosphereFacetMesh(0.018 * hs, 1, 0, 4), [0.082 * hs, 0.118 * hs, -0.004 * hs], [0, 0, 0], [0.55, 1.15, 0.8]),
        place(icosphereFacetMesh(0.018 * hs, 1, 0, 5), [-0.082 * hs, 0.118 * hs, -0.004 * hs], [0, 0, 0], [0.55, 1.15, 0.8])
      ]);
      const headEyesBrowsMesh = combineRaw([
        place(icosphereFacetMesh(0.011 * hs, 1, 0, 6), [0.03 * hs, 0.132 * hs, 0.092 * hs]),
        place(icosphereFacetMesh(0.011 * hs, 1, 0, 7), [-0.03 * hs, 0.132 * hs, 0.092 * hs]),
        place(box(0.028 * hs, 0.007 * hs, 0.01 * hs, 0.002), [0.031 * hs, 0.148 * hs, 0.093 * hs], [0, 0, -0.08]),
        place(box(0.028 * hs, 0.007 * hs, 0.01 * hs, 0.002), [-0.031 * hs, 0.148 * hs, 0.093 * hs], [0, 0, 0.08])
      ]);
      const headHairMesh = buildHoopsHairMesh(hairStyle, hs);
      const coloredParts: RawMesh[] = [
        paintMeshColors(headSkinMesh, skinHex),
        paintMeshColors(headHairMesh, "#1a1512"),
        paintMeshColors(headEyesBrowsMesh, "#141110")
      ];
      if (wearsHeadband) {
        const headbandMesh = place(
          loftSuper(
            [
              { y: 0.148 * hs, rx: 0.089 * hs, rz: 0.102 * hs, roundness: 0.74 },
              { y: 0.174 * hs, rx: 0.09 * hs, rz: 0.103 * hs, roundness: 0.74 }
            ],
            14,
            false
          ),
          [0, 0, 0.005 * hs]
        );
        coloredParts.push(paintMeshColors(headbandMesh, kit.jersey));
      }
      return mergeRawMeshes([bakeMeshCavityAO(combineRaw(coloredParts), 0.34)]);
    }
  );
  const headMeshNode = geometry.custom(headGeo, {
    name: `${id}-head-mesh`,
    material: material.matteClay({ color: "#fffdf8", roughness: 0.62 }),
    castShadow: false,
    receiveShadow: true
  }) as unknown as AuraNodeBuilder<AuraSceneNode>;

  // 5. MUSCULAR ARMS (`sculptHumanoidLimbMesh` deltoid + bicep/tricep + forearm + spread basketball hand)
  const buildUpperArmNode = (side: "l" | "r", sleeved: boolean): AuraNodeBuilder<AuraSceneNode> => {
    const sgn = side === "l" ? 1 : -1;
    if (!sleeved) {
      const bareSpec = memoizeGeometry(`hoops:upperArm:${buildTag}:${side}`, () => {
        const limb = combineRaw([
          place(subdivideSmoothMesh(icosphereFacetMesh(0.066 * ws, 1, 0, side === "l" ? 8 : 9), 1, 0.56), [-sgn * 0.012 * ws, 0.006 * hs, 0], [0, 0, 0], [1.02, 1.08, 0.98]),
          sculptHumanoidLimbMesh(
            [
              [0, 0.008 * hs, 0, 0.056 * ws],
              [-sgn * 0.004 * ws, -upperLen * 0.46, 0.004 * hs, 0.053 * ws],
              [0, -upperLen, 0, 0.043 * ws]
            ],
            12,
            0.16
          )
        ]);
        return mergeRawMeshes([bakeMeshCavityAO(limb, 0.28)]);
      });
      return geometry.custom(bareSpec, {
        name: `${id}-upper-arm-${side}-mesh`,
        material: skinMat,
        castShadow: false,
        receiveShadow: true
      }) as unknown as AuraNodeBuilder<AuraSceneNode>;
    }
    const sleevedSpec = memoizeGeometry(`hoops:upperArmSleeve:${buildTag}:${side}:${skinHex}:${kit.shorts}`, () => {
      const deltoidSkin = combineRaw([
        place(subdivideSmoothMesh(icosphereFacetMesh(0.066 * ws, 1, 0, 10), 1, 0.56), [-sgn * 0.012 * ws, 0.006 * hs, 0], [0, 0, 0], [1.02, 1.08, 0.98]),
        sculptHumanoidLimbMesh(
          [
            [0, 0.008 * hs, 0, 0.056 * ws],
            [0, -upperLen * 0.34, 0.003 * hs, 0.052 * ws]
          ],
          12,
          0.12
        )
      ]);
      const sleeveUpper = sculptHumanoidLimbMesh(
        [
          [0, -upperLen * 0.32, 0.003 * hs, 0.054 * ws],
          [0, -upperLen * 0.68, 0.002 * hs, 0.049 * ws],
          [0, -upperLen, 0, 0.045 * ws]
        ],
        12,
        0.1
      );
      return mergeRawMeshes([
        bakeMeshCavityAO(combineRaw([paintMeshColors(deltoidSkin, skinHex), paintMeshColors(sleeveUpper, kit.shorts)]), 0.3)
      ]);
    });
    return geometry.custom(sleevedSpec, {
      name: `${id}-upper-arm-${side}-mesh`,
      material: material.physical({ color: "#fdfaf6", roughness: 0.56, clearcoat: 0.06 }),
      castShadow: false,
      receiveShadow: true
    }) as unknown as AuraNodeBuilder<AuraSceneNode>;
  };

  const buildForearmAndHandNode = (side: "l" | "r", sleeved: boolean): AuraNodeBuilder<AuraSceneNode> => {
    const sgn = side === "l" ? 1 : -1;
    const wristY = -foreLen + 0.068 * hs;
    const palmY = -foreLen;
    const foreSpec = memoizeGeometry(
      `hoops:forearm:${buildTag}:${side}:${sleeved ? kit.shorts : "bare"}:${skinHex}:${kit.jersey}`,
      () => {
        const forearmShaft = sculptHumanoidLimbMesh(
          [
            [0, 0.008 * hs, 0, 0.044 * ws],
            [0, -foreLen * 0.38, 0.005 * hs, 0.045 * ws],
            [0, wristY, 0.012 * hs, 0.033 * ws]
          ],
          12,
          0.15
        );
        const handSkin = combineRaw([
          place(
            subdivideSmoothMesh(
              loftSuper(
                [
                  { y: palmY - 0.012 * hs, rx: 0.04 * ws, rz: 0.018 * ws, roundness: 0.55 },
                  { y: wristY + 0.006 * hs, rx: 0.034 * ws, rz: 0.022 * ws, roundness: 0.68 }
                ],
                10,
                true
              ),
              1,
              0.45
            ),
            [0, 0, 0.018 * hs]
          ),
          ...[-0.026, -0.009, 0.009, 0.026].map((fx, fi) =>
            tube(
              [
                [fx * ws, palmY - 0.006 * hs, 0.02 * hs],
                [fx * 1.12 * ws, palmY - (0.036 + (fi === 1 || fi === 2 ? 0.008 : 0)) * hs, 0.032 * hs],
                [fx * 1.16 * ws, palmY - (0.058 + (fi === 1 || fi === 2 ? 0.01 : 0)) * hs, 0.044 * hs]
              ],
              0.0075 * ws,
              6
            )
          ),
          tube(
            [
              [-sgn * 0.028 * ws, wristY - 0.015 * hs, 0.022 * hs],
              [-sgn * 0.048 * ws, palmY - 0.004 * hs, 0.038 * hs],
              [-sgn * 0.054 * ws, palmY - 0.024 * hs, 0.048 * hs]
            ],
            0.0085 * ws,
            6
          )
        ]);
        const wristband = loftSuper(
          [
            { y: wristY - 0.004 * hs, rx: 0.037 * ws, rz: 0.04 * ws, roundness: 0.76 },
            { y: wristY + 0.034 * hs, rx: 0.039 * ws, rz: 0.042 * ws, roundness: 0.76 }
          ],
          12,
          true
        );
        const parts = sleeved
          ? [
            paintMeshColors(forearmShaft, kit.shorts),
            paintMeshColors(handSkin, skinHex),
            paintMeshColors(wristband, kit.jersey)
          ]
          : [
            paintMeshColors(combineRaw([forearmShaft, handSkin]), skinHex),
            paintMeshColors(wristband, kit.jersey)
          ];
        return mergeRawMeshes([bakeMeshCavityAO(combineRaw(parts), 0.3)]);
      }
    );
    return geometry.custom(foreSpec, {
      name: `${id}-forearm-${side}-mesh`,
      material: material.fabric({ color: side === "l" ? "#fafcff" : "#ffffff", roughness: 0.58 }),
      castShadow: false,
      receiveShadow: true
    }) as unknown as AuraNodeBuilder<AuraSceneNode>;
  };

  // 6. MUSCULAR LEGS + INTEGRATED SCULPTED HIGH-TOP SNEAKERS (`sculptHumanoidLimbMesh` + `subdivideSmoothMesh`)
  const buildThighNode = (side: "l" | "r"): AuraNodeBuilder<AuraSceneNode> => {
    const sgn = side === "l" ? 1 : -1;
    const shortsLegMesh = loftSuper(
      [
        { y: -thighLen * 0.62, rx: 0.098 * ws, rz: 0.104 * ws, roundness: 0.68 },
        { y: -thighLen * 0.25, rx: 0.095 * ws, rz: 0.102 * ws, roundness: 0.7 },
        { y: 0.028 * hs, rx: 0.088 * ws, rz: 0.095 * ws, roundness: 0.74 }
      ],
      14,
      true
    );
    const shortsSideStripe = place(
      box(0.016 * ws, thighLen * 0.62, 0.032 * ws, 0.003),
      [sgn * 0.094 * ws, -thighLen * 0.3, 0]
    );
    const quadAndKneeSkin = sculptHumanoidLimbMesh(
      [
        [0, -thighLen * 0.54, 0, 0.079 * ws],
        [0, -thighLen * 0.78, 0.006 * hs, 0.072 * ws],
        [0, -thighLen, 0.008 * hs, 0.057 * ws]
      ],
      12,
      0.16
    );
    return multiNode(
      `${id}-thigh-${side}-mesh`,
      [
        { mesh: shortsLegMesh, material: shortsMat },
        { mesh: shortsSideStripe, material: matteTrimMat },
        { mesh: quadAndKneeSkin, material: skinMat }
      ],
      { castShadow: false, receiveShadow: true }
    );
  };

  const buildCalfAndSneakerNode = (side: "l" | "r"): AuraNodeBuilder<AuraSceneNode> => {
    const calfSpec = memoizeGeometry(
      `hoops:calfShoe:${buildTag}:${skinHex}:${socksHex}:${kit.jersey}`,
      () => {
        const sockTopY = -shinLen * 0.52;
        const calfSkin = sculptHumanoidLimbMesh(
          [
            [0, 0.008 * hs, 0, 0.056 * ws],
            [0, -shinLen * 0.28, -0.008 * hs, 0.065 * ws],
            [0, sockTopY - 0.01 * hs, 0, 0.051 * ws]
          ],
          12,
          0.18
        );
        const crewSock = sculptHumanoidLimbMesh(
          [
            [0, sockTopY, 0, 0.054 * ws],
            [0, -shinLen * 0.76, 0, 0.048 * ws],
            [0, -shinLen, 0, 0.044 * ws]
          ],
          12,
          0.06
        );
        const sockStripes = loftSuper(
          [
            { y: sockTopY - 0.028 * hs, rx: 0.055 * ws, rz: 0.06 * ws, roundness: 0.76 },
            { y: sockTopY - 0.008 * hs, rx: 0.055 * ws, rz: 0.06 * ws, roundness: 0.76 }
          ],
          12,
          false
        );
        const shoe = buildHighTopSneakerParts(hs, ws, -shinLen);
        const merged = bakeMeshCavityAO(
          combineRaw([
            paintMeshColors(calfSkin, skinHex),
            paintMeshColors(crewSock, socksHex),
            paintMeshColors(sockStripes, trimHex),
            paintMeshColors(shoe.upperBody, "#eef2f6"),
            paintMeshColors(shoe.overlayTrim, kit.jersey),
            paintMeshColors(shoe.midsole, "#f8fafc"),
            paintMeshColors(shoe.outsole, "#111827")
          ]),
          0.34
        );
        return mergeRawMeshes([merged]);
      }
    );
    return geometry.custom(calfSpec, {
      name: `${id}-calf-${side}-mesh`,
      material: material.lacquer({ color: "#fcfdff", roughness: 0.34, clearcoat: 0.25 }),
      castShadow: false,
      receiveShadow: true
    }) as unknown as AuraNodeBuilder<AuraSceneNode>;
  };

  const forearmL = attachRt(
    group(`${id}-forearm-l`, [buildForearmAndHandNode("l", false)], { position: [0, -upperLen, 0] }),
    `${id}-forearm-l`,
    runtimeFactory
  );
  const forearmR = attachRt(
    group(`${id}-forearm-r`, [buildForearmAndHandNode("r", wearsShootingSleeve)], { position: [0, -upperLen, 0] }),
    `${id}-forearm-r`,
    runtimeFactory
  );
  const armL = attachRt(
    group(`${id}-arm-l`, [buildUpperArmNode("l", false), forearmL], { position: [shoulderX, shoulderOffY, 0] }),
    `${id}-arm-l`,
    runtimeFactory
  );
  const armR = attachRt(
    group(`${id}-arm-r`, [buildUpperArmNode("r", wearsShootingSleeve), forearmR], { position: [-shoulderX, shoulderOffY, 0] }),
    `${id}-arm-r`,
    runtimeFactory
  );
  const headGroup = attachRt(
    group(`${id}-head`, [headMeshNode], { position: [0, headOffY, 0] }),
    `${id}-head`,
    runtimeFactory
  );
  const chestGroup = attachRt(
    group(`${id}-chest`, [chestMeshNode, headGroup, armL, armR], { position: [0, chestOffY, 0] }),
    `${id}-chest`,
    runtimeFactory
  );
  const spineGroup = attachRt(
    group(`${id}-spine`, [chestGroup], { position: [0, spineOffY, 0] }),
    `${id}-spine`,
    runtimeFactory
  );

  // Runtime pose groups `${id}-shoe-l` and `${id}-shoe-r` preserved for full 14-joint rig parity
  const shoeL = attachRt(
    group(`${id}-shoe-l`, [], { position: [0, -shinLen, 0] }),
    `${id}-shoe-l`,
    runtimeFactory
  );
  const shoeR = attachRt(
    group(`${id}-shoe-r`, [], { position: [0, -shinLen, 0] }),
    `${id}-shoe-r`,
    runtimeFactory
  );
  const calfL = attachRt(
    group(`${id}-calf-l`, [buildCalfAndSneakerNode("l"), shoeL], { position: [0, -thighLen, 0] }),
    `${id}-calf-l`,
    runtimeFactory
  );
  const calfR = attachRt(
    group(`${id}-calf-r`, [buildCalfAndSneakerNode("r"), shoeR], { position: [0, -thighLen, 0] }),
    `${id}-calf-r`,
    runtimeFactory
  );
  const legL = attachRt(
    group(`${id}-leg-l`, [buildThighNode("l"), calfL], { position: [hipX, hipOffY, 0] }),
    `${id}-leg-l`,
    runtimeFactory
  );
  const legR = attachRt(
    group(`${id}-leg-r`, [buildThighNode("r"), calfR], { position: [-hipX, hipOffY, 0] }),
    `${id}-leg-r`,
    runtimeFactory
  );

  const hipsGroup = attachRt(
    group(`${id}-hips`, [hipsMeshNode, spineGroup, legL, legR], { position: [0, hipsBindY, 0] }),
    `${id}-hips`,
    runtimeFactory
  );

  return attachRt(
    group(id, [hipsGroup], { position }),
    id,
    runtimeFactory
  );
}

/* -------------------------------------------------------------------------- */
/* Stateless "ZYX" Pose Solver & Forward Kinematics for Hoops Athletes        */
/* -------------------------------------------------------------------------- */

const Q_ID: GripQuat = [0, 0, 0, 1];
const qEulerXYZ = (rx: number, ry: number, rz: number): GripQuat =>
  gripQMul(gripQAxis([0, 0, 1], rz), gripQMul(gripQAxis([0, 1, 0], ry), gripQAxis([1, 0, 0], rx)));

const addV3 = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2]
];

function solveTwoBoneArmQuats(
  chestRot: GripQuat,
  shoulder: readonly [number, number, number],
  palmTarget: readonly [number, number, number],
  upperLen: number,
  foreLen: number,
  forePalmLocal: readonly [number, number, number],
  pole: readonly [number, number, number]
): {
  readonly upperLocal: GripQuat;
  readonly foreLocal: GripQuat;
  readonly elbowActor: [number, number, number];
  readonly palmActor: [number, number, number];
} {
  const dx = palmTarget[0] - shoulder[0];
  const dy = palmTarget[1] - shoulder[1];
  const dz = palmTarget[2] - shoulder[2];
  const raw = Math.hypot(dx, dy, dz) || 1e-6;
  const foreSpan = Math.hypot(forePalmLocal[0], forePalmLocal[1], forePalmLocal[2]) || foreLen;
  const dist = Math.max(1e-4, Math.min(upperLen + foreSpan - 1e-4, raw));
  const ux = dx / raw;
  const uy = dy / raw;
  const uz = dz / raw;
  const a = (upperLen * upperLen - foreSpan * foreSpan + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, upperLen * upperLen - a * a));
  let px = pole[0], py = pole[1], pz = pole[2];
  const pd = px * ux + py * uy + pz * uz;
  px -= ux * pd;
  py -= uy * pd;
  pz -= uz * pd;
  const pl = Math.hypot(px, py, pz) || 1;
  const elbowActor: [number, number, number] = [
    shoulder[0] + ux * a + (px / pl) * h,
    shoulder[1] + uy * a + (py / pl) * h,
    shoulder[2] + uz * a + (pz / pl) * h
  ];
  const clampedTarget: [number, number, number] = [
    shoulder[0] + ux * dist,
    shoulder[1] + uy * dist,
    shoulder[2] + uz * dist
  ];
  const upperDir = gripUnit([elbowActor[0] - shoulder[0], elbowActor[1] - shoulder[1], elbowActor[2] - shoulder[2]]);
  const foreDir = gripUnit([clampedTarget[0] - elbowActor[0], clampedTarget[1] - elbowActor[1], clampedTarget[2] - elbowActor[2]]);
  const foreBindDir = gripUnit([forePalmLocal[0], forePalmLocal[1], forePalmLocal[2]]);
  const upperWorld = gripQFromTo([0, -1, 0], upperDir);
  const foreWorld = gripQFromTo(foreBindDir, foreDir);
  const upperLocal = gripQMul(gripQConj(chestRot), upperWorld);
  const foreLocal = gripQMul(gripQConj(upperWorld), foreWorld);
  const palmActor = addV3(elbowActor, gripQRot(foreWorld, [forePalmLocal[0], forePalmLocal[1], forePalmLocal[2]]));
  return { upperLocal, foreLocal, elbowActor, palmActor };
}

export interface HoopsAthletePoseInput {
  readonly id?: string;
  readonly big?: boolean;
  readonly clip: string;
  readonly time: number;
  readonly speed: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly stanceNow?: boolean;
  readonly dribbleNow?: boolean;
  readonly checkHold?: boolean;
  readonly carryNow?: boolean;
  readonly dribbleCycleT?: number;
  readonly idleHandDrop?: number;
  readonly qaLean?: number;
  readonly shooting?: boolean;
  readonly shotMeterT?: number;
  readonly dunkT?: number;
  readonly dunkKind?: string;
  readonly jumpT?: number;
  readonly stumble?: number;
  /** Optional head-look override quaternion `[x, y, z, w]` in chest-local space. */
  readonly headLookLocalQuat?: GripQuat;
}

export interface HoopsAthletePoseResult {
  readonly hipsPos: [number, number, number];
  readonly rotations: Readonly<Record<HoopsAthleteJointSuffix, [number, number, number]>>;
  readonly shoulderY: number;
  readonly shoulderRWorld: [number, number, number];
  readonly palmRWorld: [number, number, number];
  readonly palmLWorld: [number, number, number];
  readonly checkAimPalmWorld: [number, number, number];
  readonly elbowRWorld: [number, number, number];
  readonly hipsWorld: [number, number, number];
  readonly footLActor: [number, number, number];
  readonly footRActor: [number, number, number];
  readonly footLWorld: [number, number, number];
  readonly footRWorld: [number, number, number];
  /** Head position in `[x, y - 0.96, z]` frame expected by `headLookAngles` + `worldToActor`. */
  readonly headLookSocketPos: [number, number, number];
  readonly chestActorQuat: GripQuat;
}

export interface RuntimePoseNodeLike {
  setPosition?(x: number, y: number, z: number): unknown;
  setRotation?(rx: number, ry: number, rz: number): unknown;
}

/**
 * Pure stateless pose & forward-kinematics solver for an articulated streetball athlete.
 * Computes `"ZYX"` Euler angles for all 14 joints plus exact world/actor hand, shoulder, head, and foot coordinates.
 */
export function computeHoopsAthleteJointPose(rawInput: HoopsAthletePoseInput): HoopsAthletePoseResult {
  const input = {
    id: rawInput.id ?? "p0",
    big: rawInput.big ?? false,
    clip: rawInput.clip,
    time: rawInput.time,
    speed: rawInput.speed,
    x: rawInput.x,
    y: rawInput.y,
    z: rawInput.z,
    yaw: rawInput.yaw,
    stanceNow: rawInput.stanceNow ?? false,
    dribbleNow: rawInput.dribbleNow ?? false,
    checkHold: rawInput.checkHold ?? false,
    carryNow: rawInput.carryNow ?? false,
    dribbleCycleT: rawInput.dribbleCycleT ?? 0,
    idleHandDrop: rawInput.idleHandDrop ?? 0.53,
    qaLean: rawInput.qaLean,
    shooting: rawInput.shooting ?? false,
    shotMeterT: rawInput.shotMeterT ?? 0,
    dunkT: rawInput.dunkT ?? 0,
    dunkKind: rawInput.dunkKind ?? "POWER JAM",
    jumpT: rawInput.jumpT ?? 0,
    stumble: rawInput.stumble ?? 0,
    headLookLocalQuat: rawInput.headLookLocalQuat
  };
  const hs = (input.big ? HOOPS_BIG_HEIGHT : HOOPS_GUARD_HEIGHT) / 1.748;
  const ws = (input.big ? 1.095 : 1.0) * hs;

  const hipsBindY = 0.96 * hs;
  const spineOff: [number, number, number] = [0, 0.08 * hs, 0];
  const chestOff: [number, number, number] = [0, 0.16 * hs, 0];
  const headOff: [number, number, number] = [0, 0.30 * hs, 0];
  const shoulderOffL: [number, number, number] = [0.205 * ws, 0.23 * hs, 0];
  const shoulderOffR: [number, number, number] = [-0.205 * ws, 0.23 * hs, 0];
  const upperLen = 0.255 * hs;
  const foreLen = 0.300 * hs;
  const forePalmLocal: [number, number, number] = [0, -foreLen, 0.03 * hs];
  const hipOffL: [number, number, number] = [0.105 * ws, -0.05 * hs, 0];
  const hipOffR: [number, number, number] = [-0.105 * ws, -0.05 * hs, 0];
  const thighLen = 0.43 * hs;
  const shinLen = 0.42 * hs;

  let hipsPos: [number, number, number] = [0, hipsBindY, 0];
  let qHips: GripQuat = Q_ID;
  let qSpine: GripQuat = Q_ID;
  let qChest: GripQuat = Q_ID;
  let qHead: GripQuat = Q_ID;
  let qArmL: GripQuat = Q_ID;
  let qForeL: GripQuat = Q_ID;
  let qArmR: GripQuat = Q_ID;
  let qForeR: GripQuat = Q_ID;
  let qLegL: GripQuat = Q_ID;
  let qCalfL: GripQuat = Q_ID;
  let qShoeL: GripQuat = Q_ID;
  let qLegR: GripQuat = Q_ID;
  let qCalfR: GripQuat = Q_ID;
  let qShoeR: GripQuat = Q_ID;

  // Helper replicating dribbleCycleY effort & palmY without circular imports
  const dribbleEval = (phaseRaw: number, shoulderWorldY: number, moving: boolean) => {
    const t = ((phaseRaw % 1) + 1) % 1;
    const effort = Math.pow(Math.sin(Math.min(1, t / 0.66) * Math.PI), 1.15);
    const topY = Math.max(0.76, Math.min(1.06, shoulderWorldY - (moving ? 0.46 : 0.42)));
    const lowY = moving ? 0.52 : 0.44;
    let palmY: number;
    if (t < 0.56) {
      const k = t / 0.56;
      const e = k * k * (3 - 2 * k);
      palmY = topY - (topY - lowY) * e;
    } else {
      const k = (t - 0.56) / 0.44;
      const e = k * k * (3 - 2 * k);
      palmY = lowY + (topY - lowY) * e;
    }
    return { effort, palmY };
  };

  if (input.dunkT > 0) {
    // High-flying dunk packages: POWER JAM, WINDMILL, 360, LOB OOP
    const u = Math.max(0, Math.min(1, input.dunkT / 0.62));
    const slam = u < 0.58 ? -u / 0.58 : (u - 0.58) / 0.42; // -1 cocked back -> +1 rim flush
    hipsPos = [0, hipsBindY - 0.04 * hs, 0];
    qSpine = qEulerXYZ(slam * 0.24, 0, 0);
    qChest = qEulerXYZ(slam * 0.22, 0, 0);
    qHead = qEulerXYZ(-0.22 - slam * 0.14, 0, 0);
    qLegL = qEulerXYZ(-0.55 + u * 0.25, 0, 0.08);
    qCalfL = qEulerXYZ(0.95 - u * 0.35, 0, 0);
    qShoeL = qEulerXYZ(0.28, 0, 0);
    qLegR = qEulerXYZ(-0.25 - u * 0.2, 0, -0.08);
    qCalfR = qEulerXYZ(0.62 + u * 0.2, 0, 0);
    qShoeR = qEulerXYZ(0.32, 0, 0);

    if (input.dunkKind === "WINDMILL") {
      const ang = u * Math.PI * 2;
      qArmR = qEulerXYZ(-1.55 - Math.cos(ang) * 1.25, 0, -0.35 - Math.sin(ang) * 0.3);
      qForeR = qEulerXYZ(-0.35, 0, 0);
      qArmL = qEulerXYZ(-0.7, 0, 0.38);
      qForeL = qEulerXYZ(-0.75, 0, 0);
    } else if (input.dunkKind === "360") {
      const flush = Math.max(0, (u - 0.52) / 0.48);
      qArmR = qEulerXYZ(-0.85 - flush * 1.95, 0.25 * (1 - flush), -0.18);
      qForeR = qEulerXYZ(-1.05 * (1 - flush) - 0.25, 0, 0);
      qArmL = qEulerXYZ(-0.75 - flush * 0.5, -0.22, 0.28);
      qForeL = qEulerXYZ(-0.85, 0, 0);
    } else {
      // Two-hand POWER JAM / LOB OOP overhead cock-back -> rim slam
      const reach = -2.35 + slam * 0.55;
      qArmR = qEulerXYZ(reach, 0.18, -0.12);
      qForeR = qEulerXYZ(-0.42 + slam * 0.28, 0, 0);
      qArmL = qEulerXYZ(reach, -0.18, 0.12);
      qForeL = qEulerXYZ(-0.42 + slam * 0.28, 0, 0);
    }
  } else if (input.shooting || input.clip === "Shoot" || input.clip === "Load") {
    // Jump-shot gather -> set-point lift
    const g = Math.max(0, Math.min(1, input.shotMeterT / 0.72));
    const dip = (1 - g) * 0.16;
    hipsPos = [0, hipsBindY - dip * hs, 0];
    qSpine = qEulerXYZ(0.12 * (1 - g) - 0.04 * g, 0, 0);
    qChest = qEulerXYZ(0.08 * (1 - g) - 0.05 * g, -0.12, 0);
    qHead = qEulerXYZ(-0.24 - 0.12 * g, 0.08, 0);
    // Shooting right arm lifts from pocket (-0.95) to forehead set-point (-2.05) with tucked elbow
    qArmR = qEulerXYZ(-0.95 - 1.12 * g, 0.14, -0.06);
    qForeR = qEulerXYZ(-1.35 + 0.35 * g, 0, 0);
    // Guide left hand cradles side of the basketball
    qArmL = qEulerXYZ(-0.88 - 0.92 * g, -0.32, 0.16);
    qForeL = qEulerXYZ(-1.12 + 0.24 * g, 0, 0);
    const knee = (1 - g) * 0.52 + 0.14;
    qLegL = qEulerXYZ(-knee * 0.55, 0, 0.04);
    qCalfL = qEulerXYZ(knee, 0, 0);
    qShoeL = qEulerXYZ(-knee * 0.35 + g * 0.24, 0, 0);
    qLegR = qEulerXYZ(-knee * 0.58, 0, -0.04);
    qCalfR = qEulerXYZ(knee * 1.04, 0, 0);
    qShoeR = qEulerXYZ(-knee * 0.35 + g * 0.26, 0, 0);
  } else if (input.clip === "Release" || input.clip === "FollowThrough") {
    // Classic high gooseneck jump-shot release ("hand in the cookie jar")
    const follow = input.clip === "FollowThrough" ? 1 : 0.65;
    hipsPos = [0, hipsBindY, 0];
    qSpine = qEulerXYZ(-0.04, 0, 0);
    qChest = qEulerXYZ(-0.05, -0.1, 0);
    qHead = qEulerXYZ(-0.28, 0.06, 0);
    qArmR = qEulerXYZ(-2.48 - 0.12 * follow, 0.08, -0.06);
    qForeR = qEulerXYZ(-0.22 + 0.14 * follow, 0, 0);
    qArmL = qEulerXYZ(-1.62 + 0.25 * follow, -0.24, 0.22);
    qForeL = qEulerXYZ(-0.48, 0, 0);
    qLegL = qEulerXYZ(-0.1, 0, 0.04);
    qCalfL = qEulerXYZ(0.18, 0, 0);
    qShoeL = qEulerXYZ(0.16, 0, 0);
    qLegR = qEulerXYZ(-0.06, 0, -0.04);
    qCalfR = qEulerXYZ(0.14, 0, 0);
    qShoeR = qEulerXYZ(0.18, 0, 0);
  } else if (input.clip === "Contest") {
    // Vertical shot-block contest: right arm fully extended skyward, left arm guarding chest
    hipsPos = [0, hipsBindY, 0];
    qSpine = qEulerXYZ(-0.06, 0, 0);
    qChest = qEulerXYZ(-0.08, 0.12, 0);
    qHead = qEulerXYZ(-0.32, -0.08, 0);
    qArmR = qEulerXYZ(-2.82, 0.06, -0.08);
    qForeR = qEulerXYZ(-0.1, 0, 0);
    qArmL = qEulerXYZ(-0.72, -0.18, 0.3);
    qForeL = qEulerXYZ(-0.85, 0, 0);
    qLegL = qEulerXYZ(-0.22, 0, 0.07);
    qCalfL = qEulerXYZ(0.42, 0, 0);
    qShoeL = qEulerXYZ(0.24, 0, 0);
    qLegR = qEulerXYZ(-0.14, 0, -0.07);
    qCalfR = qEulerXYZ(0.32, 0, 0);
    qShoeR = qEulerXYZ(0.24, 0, 0);
  } else if (input.clip === "Punch_Jab" || input.clip === "Attack") {
    // Quick perimeter steal swipe / poke check
    hipsPos = [0, hipsBindY - 0.14 * hs, 0.06 * hs];
    qSpine = qEulerXYZ(0.24, -0.18, 0);
    qChest = qEulerXYZ(0.18, -0.24, 0);
    qHead = qEulerXYZ(-0.28, 0.32, 0);
    qArmR = qEulerXYZ(-1.38, 0.22, -0.14);
    qForeR = qEulerXYZ(-0.24, 0, 0);
    qArmL = qEulerXYZ(-0.42, -0.12, 0.34);
    qForeL = qEulerXYZ(-0.78, 0, 0);
    qLegL = qEulerXYZ(-0.54, 0, 0.1);
    qCalfL = qEulerXYZ(0.92, 0, 0);
    qShoeL = qEulerXYZ(-0.38, 0, 0);
    qLegR = qEulerXYZ(-0.28, 0, -0.1);
    qCalfR = qEulerXYZ(0.64, 0, 0);
    qShoeR = qEulerXYZ(-0.32, 0, 0);
  } else if (input.stumble > 0) {
    // Ankle-breaker crossover stumble wobble
    const wob = Math.sin(input.time * 16) * Math.min(1, input.stumble * 1.8);
    hipsPos = [wob * 0.06, hipsBindY - 0.18 * hs, -0.04 * hs];
    qHips = qEulerXYZ(0.08, wob * 0.18, wob * 0.12);
    qSpine = qEulerXYZ(0.22, -wob * 0.15, -wob * 0.18);
    qChest = qEulerXYZ(0.16, 0, -wob * 0.14);
    qHead = qEulerXYZ(-0.2, 0, wob * 0.1);
    qArmL = qEulerXYZ(-0.45, 0, 0.58 + wob * 0.25);
    qForeL = qEulerXYZ(-0.55, 0, 0);
    qArmR = qEulerXYZ(-0.45, 0, -0.58 + wob * 0.25);
    qForeR = qEulerXYZ(-0.55, 0, 0);
    qLegL = qEulerXYZ(-0.58, 0, 0.14);
    qCalfL = qEulerXYZ(1.06, 0, 0);
    qShoeL = qEulerXYZ(-0.48, 0, 0);
    qLegR = qEulerXYZ(-0.52, 0, -0.14);
    qCalfR = qEulerXYZ(0.98, 0, 0);
    qShoeR = qEulerXYZ(-0.46, 0, 0);
  } else if (input.stanceNow) {
    // Stationary athletic triple-threat / defensive ready / live pound dribble stance
    // First compute approximate shoulder height so pound-dribble crouch matches bounce effort
    const approxShoulderY = input.y + 1.39 * hs;
    const cyc0 = dribbleEval(input.dribbleCycleT, approxShoulderY, false);
    const crouch = input.dribbleNow && !input.checkHold ? cyc0.effort * 0.62 : 0.12;
    const breathe = Math.sin(input.time * 2.6 + (athleteSeedFromId(input.id) % 11)) * 0.012;
    hipsPos = [0, hipsBindY - 0.30 * crouch * hs + breathe, 0];
    qLegL = qEulerXYZ(-(0.208 + 0.78 * crouch), 0, 0.06);
    qCalfL = qEulerXYZ(0.276 + 1.44 * crouch, 0, 0);
    qShoeL = qEulerXYZ(-(0.07 + 0.66 * crouch), 0, 0);
    qLegR = qEulerXYZ(-(0.208 + 0.78 * crouch), 0, -0.06);
    qCalfR = qEulerXYZ(0.276 + 1.44 * crouch, 0, 0);
    qShoeR = qEulerXYZ(-(0.07 + 0.66 * crouch), 0, 0);

    if (input.dribbleNow) {
      const effort = input.checkHold ? 0 : cyc0.effort;
      const spineLean = input.checkHold ? 0.16 : 0.18 + 0.24 * effort;
      const chestLean = input.checkHold ? 0.10 : 0.14 + 0.20 * effort;
      qSpine = qEulerXYZ(spineLean, 0, 0);
      qChest = qEulerXYZ(chestLean, 0, 0);
      qHead = qEulerXYZ(-(spineLean + chestLean) * 0.58, 0, 0);
    } else {
      qSpine = qEulerXYZ(0.105, 0, 0);
      qChest = qEulerXYZ(0.07 + breathe * 0.8, 0, 0);
      qHead = qEulerXYZ(-0.122, 0, 0);
    }
  } else {
    // Locomotion gait (Walk_Loop / Run / Sprint_Loop), with optional driving carry dribble overlay
    const sprinting = input.clip === "Sprint_Loop" || input.speed > 5.4;
    const running = sprinting || input.clip === "Run" || input.speed > 2.2;
    const freq = sprinting ? 3.35 : running ? 2.65 : 1.75;
    const phase = input.time * freq * Math.PI * 2 + (athleteSeedFromId(input.id) % 7) * 0.45;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const strideAmp = sprinting ? 0.76 : running ? 0.58 : 0.34;
    const liftAmp = sprinting ? 0.048 : running ? 0.036 : 0.018;
    const fwdLean = sprinting ? 0.22 : running ? 0.15 : 0.07;

    hipsPos = [0, hipsBindY - (running ? 0.045 : 0.015) * hs + Math.abs(c) * liftAmp * hs, 0];
    qHips = qEulerXYZ(0.04, -s * 0.09, c * 0.03);

    const kneeL = Math.max(0, -c) * (sprinting ? 1.22 : running ? 0.96 : 0.54) + 0.16;
    const kneeR = Math.max(0, c) * (sprinting ? 1.22 : running ? 0.96 : 0.54) + 0.16;
    qLegL = qEulerXYZ(s * strideAmp - 0.12, 0, 0.03);
    qCalfL = qEulerXYZ(kneeL, 0, 0);
    qShoeL = qEulerXYZ(-s * 0.24 - kneeL * 0.25, 0, 0);
    qLegR = qEulerXYZ(-s * strideAmp - 0.12, 0, -0.03);
    qCalfR = qEulerXYZ(kneeR, 0, 0);
    qShoeR = qEulerXYZ(s * 0.24 - kneeR * 0.25, 0, 0);

    if (input.carryNow) {
      const approxShoulderY = input.y + 1.36 * hs;
      const cycCarry = dribbleEval(input.dribbleCycleT, approxShoulderY, true);
      const leanScale = input.qaLean ?? 1;
      const spLean = (0.20 + 0.22 * cycCarry.effort) * leanScale;
      const chLean = (0.15 + 0.18 * cycCarry.effort) * leanScale;
      qSpine = qEulerXYZ(spLean, s * 0.07, 0);
      qChest = qEulerXYZ(chLean, s * 0.08, 0);
      qHead = qEulerXYZ(-(spLean + chLean) * 0.62, 0, 0);
    } else {
      qSpine = qEulerXYZ(fwdLean * 0.55, s * 0.1, 0);
      qChest = qEulerXYZ(fwdLean * 0.45, s * 0.12, 0);
      qHead = qEulerXYZ(-fwdLean * 0.75, -s * 0.08, 0);
      const armSwing = sprinting ? 0.78 : running ? 0.58 : 0.32;
      const elbowBend = sprinting ? -1.42 : running ? -1.16 : -0.52;
      qArmL = qEulerXYZ(-s * armSwing - 0.08, 0, 0.09);
      qForeL = qEulerXYZ(elbowBend - Math.max(0, s) * 0.25, 0, 0);
      qArmR = qEulerXYZ(s * armSwing - 0.08, 0, -0.09);
      qForeR = qEulerXYZ(elbowBend - Math.max(0, -s) * 0.25, 0, 0);
    }
  }

  // Forward kinematics up to Chest & Shoulders in actor-local space (actor origin at floor y = 0)
  const rHips = qHips;
  const pSpine = addV3(hipsPos, gripQRot(rHips, spineOff));
  const rSpine = gripQMul(rHips, qSpine);
  const pChest = addV3(pSpine, gripQRot(rSpine, chestOff));
  const rChest = gripQMul(rSpine, qChest);
  const pHead = addV3(pChest, gripQRot(rChest, headOff));
  const pShoulderL = addV3(pChest, gripQRot(rChest, shoulderOffL));
  const pShoulderR = addV3(pChest, gripQRot(rChest, shoulderOffR));
  const shoulderY = input.y + pShoulderR[1];

  let elbowRActor: [number, number, number];
  let palmRActor: [number, number, number];
  let palmLActor: [number, number, number];
  let checkAimPalmActor: [number, number, number];

  // Two-bone IK for stationary stance (idle relaxed arms, check hold, live pound dribble) and driving carry dribble
  if (input.stanceNow || input.carryNow) {
    const cyc = dribbleEval(input.dribbleCycleT, shoulderY, input.carryNow);
    const flare = input.dribbleNow || input.carryNow ? 0.22 : 0.06;
    const idleDropScaled = input.idleHandDrop * hs;
    const targetPalmR: [number, number, number] = input.checkHold
      ? [pShoulderR[0] - 0.06, pShoulderR[1] - 0.46 * hs, pShoulderR[2] + 0.20 * hs]
      : input.dribbleNow
        ? [pShoulderR[0] - 0.06, cyc.palmY - input.y, pShoulderR[2] + 0.14 * hs]
        : input.carryNow
          ? [pShoulderR[0] - 0.06, cyc.palmY - input.y, pShoulderR[2] + 0.12 * hs]
          : [pShoulderR[0] - 0.03, pShoulderR[1] - idleDropScaled, pShoulderR[2] + 0.03 * hs];
    const targetPalmL: [number, number, number] = input.checkHold
      ? [pShoulderL[0] - 0.04, pShoulderL[1] - 0.42 * hs, pShoulderL[2] + 0.10 * hs]
      : input.dribbleNow
        ? [pShoulderL[0] - 0.04, pShoulderL[1] - 0.34 * hs, pShoulderL[2] + 0.16 * hs]
        : input.carryNow
          ? [pShoulderL[0] + 0.04, pShoulderL[1] - 0.30 * hs, pShoulderL[2] + 0.22 * hs]
          : [pShoulderL[0] + 0.03, pShoulderL[1] - idleDropScaled, pShoulderL[2] + 0.03 * hs];

    const solvedR = solveTwoBoneArmQuats(
      rChest,
      pShoulderR,
      targetPalmR,
      upperLen,
      foreLen,
      forePalmLocal,
      [-flare, -1, input.dribbleNow || input.carryNow ? 0.06 : 0]
    );
    const solvedL = solveTwoBoneArmQuats(
      rChest,
      pShoulderL,
      targetPalmL,
      upperLen,
      foreLen,
      forePalmLocal,
      [input.carryNow ? 0.18 : flare, -1, 0]
    );
    qArmR = solvedR.upperLocal;
    qForeR = solvedR.foreLocal;
    qArmL = solvedL.upperLocal;
    qForeL = solvedL.foreLocal;
    elbowRActor = solvedR.elbowActor;
    palmRActor = solvedR.palmActor;
    palmLActor = solvedL.palmActor;
    checkAimPalmActor = input.checkHold
      ? [targetPalmR[0] - 0.05, targetPalmR[1] + 0.04, targetPalmR[2] + 0.02]
      : palmRActor;
  } else {
    const rUpperR = gripQMul(rChest, qArmR);
    elbowRActor = addV3(pShoulderR, gripQRot(rUpperR, [0, -upperLen, 0]));
    const rForeR = gripQMul(rUpperR, qForeR);
    palmRActor = addV3(elbowRActor, gripQRot(rForeR, forePalmLocal));

    const rUpperL = gripQMul(rChest, qArmL);
    const elbowLActor = addV3(pShoulderL, gripQRot(rUpperL, [0, -upperLen, 0]));
    const rForeL = gripQMul(rUpperL, qForeL);
    palmLActor = addV3(elbowLActor, gripQRot(rForeL, forePalmLocal));
    checkAimPalmActor = palmRActor;
  }

  if (input.headLookLocalQuat) {
    qHead = input.headLookLocalQuat;
  }

  // Foot forward kinematics in actor-local space (planted feet at y = 0)
  const pHipL = addV3(hipsPos, gripQRot(rHips, hipOffL));
  const rLegL = gripQMul(rHips, qLegL);
  const pKneeL = addV3(pHipL, gripQRot(rLegL, [0, -thighLen, 0]));
  const rCalfL = gripQMul(rLegL, qCalfL);
  const pAnkleL = addV3(pKneeL, gripQRot(rCalfL, [0, -shinLen, 0]));
  const rShoeL = gripQMul(rCalfL, qShoeL);
  const footLActor = addV3(pAnkleL, gripQRot(rShoeL, [0, -0.06 * hs, 0.04 * hs]));

  const pHipR = addV3(hipsPos, gripQRot(rHips, hipOffR));
  const rLegR = gripQMul(rHips, qLegR);
  const pKneeR = addV3(pHipR, gripQRot(rLegR, [0, -thighLen, 0]));
  const rCalfR = gripQMul(rLegR, qCalfR);
  const pAnkleR = addV3(pKneeR, gripQRot(rCalfR, [0, -shinLen, 0]));
  const rShoeR = gripQMul(rCalfR, qShoeR);
  const footRActor = addV3(pAnkleR, gripQRot(rShoeR, [0, -0.06 * hs, 0.04 * hs]));

  const cy = Math.cos(input.yaw);
  const sn = Math.sin(input.yaw);
  const toWorld = (p: readonly [number, number, number]): [number, number, number] => [
    input.x + cy * p[0] + sn * p[2],
    input.y + p[1],
    input.z - sn * p[0] + cy * p[2]
  ];

  const rotations: Record<HoopsAthleteJointSuffix, [number, number, number]> = {
    hips: gripQToEulerZYX(qHips),
    spine: gripQToEulerZYX(qSpine),
    chest: gripQToEulerZYX(qChest),
    head: gripQToEulerZYX(qHead),
    "arm-l": gripQToEulerZYX(qArmL),
    "forearm-l": gripQToEulerZYX(qForeL),
    "arm-r": gripQToEulerZYX(qArmR),
    "forearm-r": gripQToEulerZYX(qForeR),
    "leg-l": gripQToEulerZYX(qLegL),
    "calf-l": gripQToEulerZYX(qCalfL),
    "shoe-l": gripQToEulerZYX(qShoeL),
    "leg-r": gripQToEulerZYX(qLegR),
    "calf-r": gripQToEulerZYX(qCalfR),
    "shoe-r": gripQToEulerZYX(qShoeR)
  };

  return {
    hipsPos,
    rotations,
    shoulderY,
    shoulderRWorld: toWorld(pShoulderR),
    palmRWorld: toWorld(palmRActor),
    palmLWorld: toWorld(palmLActor),
    checkAimPalmWorld: toWorld(checkAimPalmActor),
    elbowRWorld: toWorld(elbowRActor),
    hipsWorld: toWorld(hipsPos),
    footLActor,
    footRActor,
    footLWorld: toWorld(footLActor),
    footRWorld: toWorld(footRActor),
    headLookSocketPos: [pHead[0], pHead[1] - 0.96, pHead[2]],
    chestActorQuat: rChest
  };
}

/**
 * Statelessly applies `"ZYX"` Euler joint rotations and hip height to a mounted Hoops Athlete rig,
 * returning exact forward-kinematics palm, shoulder, head, and foot coordinates for dribble & head-look.
 */
export function poseArticulatedHoopsAthlete(
  lookup: (nodeId: string) => RuntimePoseNodeLike | undefined,
  input: HoopsAthletePoseInput
): HoopsAthletePoseResult {
  const solved = computeHoopsAthleteJointPose(input);
  const hipsHandle = lookup(`${input.id}-hips`);
  hipsHandle?.setPosition?.(solved.hipsPos[0], solved.hipsPos[1], solved.hipsPos[2]);
  for (const suffix of HOOPS_ATHLETE_JOINT_SUFFIXES) {
    const handle = suffix === "hips" ? hipsHandle : lookup(`${input.id}-${suffix}`);
    const [rx, ry, rz] = solved.rotations[suffix];
    handle?.setRotation?.(rx, ry, rz);
  }
  return solved;
}

/* -------------------------------------------------------------------------- */
/* Seated Animated Courtside Fans (`crowd-live-0` .. `crowd-live-5`)          */
/* -------------------------------------------------------------------------- */

const SEATED_FAN_TOPS: readonly AuraColor[] = [
  "#e85d1a",
  "#1f7ab8",
  "#eab308",
  "#d63649",
  "#1f9d6b",
  "#6d4aff"
];
const SEATED_FAN_PANTS: readonly AuraColor[] = [
  "#1e293b",
  "#27272a",
  "#334155",
  "#1f2937",
  "#3b302a",
  "#1e3a5f"
];
const SEATED_FAN_CAPS: readonly AuraColor[] = [
  "#18181b",
  "#b91c1c",
  "#1d4ed8",
  "#d97706",
  "#0f766e",
  "#4338ca"
];

export interface SeatedFanBuildOptions {
  readonly id: string;
  readonly index: number;
  readonly variant: 0 | 1 | 2;
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly scale?: number;
  readonly omitLowerBody?: boolean;
  readonly runtimeFactory?: (nodeId: string) => unknown;
}

function buildSeatedFanLowerRaw(seatY: number): {
  readonly pelvAndLegs: RawMesh;
  readonly shoesUpper: RawMesh;
  readonly shoesSole: RawMesh;
} {
  const pelvAndLegs = combineRaw([
    loftSuper(
      [
        { y: seatY - 0.04, rx: 0.16, rz: 0.13, roundness: 0.65 },
        { y: seatY + 0.07, rx: 0.15, rz: 0.11, roundness: 0.7 }
      ],
      10,
      true
    ),
    ...([-0.095, 0.095] as const).map((lx) =>
      sculptHumanoidLimbMesh(
        [
          [lx, seatY + 0.01, 0.02, 0.064],
          [lx * 1.05, seatY - 0.01, 0.38, 0.056],
          [lx * 1.06, 0.05, 0.42, 0.046]
        ],
        8,
        0.08
      )
    )
  ]);
  const shoesUpper = combineRaw(
    ([-0.1, 0.1] as const).map((lx) => place(box(0.092, 0.062, 0.21, 0.018), [lx, 0.042, 0.47]))
  );
  const shoesSole = combineRaw(
    ([-0.1, 0.1] as const).map((lx) => place(box(0.096, 0.018, 0.22, 0.006), [lx, 0.009, 0.47]))
  );
  return { pelvAndLegs, shoesUpper, shoesSole };
}

/**
 * Batches all 6 seated live fans' static lower bodies (pelvis + seated thighs + shins + sneakers)
 * into a single coalesced `multiNode` group (`kind: "group"` -> 1 draw instead of 6!).
 */
export function buildBatchedSeatedFanLowerNode(
  transforms: readonly { readonly position: AuraVec3; readonly rotation: AuraVec3; readonly scale: number }[]
): AuraNodeBuilder<AuraSceneNode> {
  const seatY = 0.44;
  const unitLower = buildSeatedFanLowerRaw(seatY);
  const parts: { readonly mesh: RawMesh; readonly material: AuraMaterialSpec }[] = [];
  const shoeMat = material.sneakerMesh({ color: "#f1f5f9", roughness: 0.82 });
  const soleMat = material.blackRubber({ color: "#111827", roughness: 0.9 });
  const allShoes: RawMesh[] = [];
  const allSoles: RawMesh[] = [];

  transforms.forEach((t, index) => {
    const pos: V3 = [t.position[0], t.position[1], t.position[2]];
    const rot: V3 = [t.rotation[0], t.rotation[1], t.rotation[2]];
    const pantsColor = SEATED_FAN_PANTS[index % SEATED_FAN_PANTS.length]!;
    parts.push({
      mesh: place(unitLower.pelvAndLegs, pos, rot, t.scale),
      material: material.fabric({ color: pantsColor, roughness: 0.82, sheen: 0.1 })
    });
    allShoes.push(place(unitLower.shoesUpper, pos, rot, t.scale));
    allSoles.push(place(unitLower.shoesSole, pos, rot, t.scale));
  });
  parts.push({ mesh: combineRaw(allShoes), material: shoeMat });
  parts.push({ mesh: combineRaw(allSoles), material: soleMat });

  return multiNode("crowd-live-lower", parts, { castShadow: false, receiveShadow: true });
}

/**
 * Builds an articulated, multi-material seated front-row streetball spectator (`crowd-live-0..5`),
 * coalescing torso+head into 1 draw and each curved cheering arm into 1 draw (`3` draws/fan).
 */
export function buildArticulatedSeatedFanNode(
  options: SeatedFanBuildOptions
): AuraNodeBuilder<AuraSceneNode> {
  const { id, index, variant, position, rotation, scale = 1.0, omitLowerBody = false, runtimeFactory } = options;
  const topColor = SEATED_FAN_TOPS[index % SEATED_FAN_TOPS.length]!;
  const pantsColor = SEATED_FAN_PANTS[index % SEATED_FAN_PANTS.length]!;
  const capColor = SEATED_FAN_CAPS[index % SEATED_FAN_CAPS.length]!;
  const skinColor = HOOPS_SKIN_PALETTE[(index + variant) % HOOPS_SKIN_PALETTE.length]!;

  const hoodieMat = material.fabric({ color: topColor, roughness: 0.72, sheen: 0.22, sheenColor: topColor });
  const denimMat = material.fabric({ color: pantsColor, roughness: 0.82, sheen: 0.1 });
  const capMat = material.fabric({ color: capColor, roughness: 0.7, sheen: 0.18 });
  const skinMat = material.physical({ color: skinColor, roughness: 0.55, clearcoat: 0.06 });
  const shoeMat = material.sneakerMesh({ color: "#f1f5f9", roughness: 0.82 });
  const soleMat = material.blackRubber({ color: "#111827", roughness: 0.9 });

  const seatY = 0.44;
  const lowerChildren: AuraNodeBuilder<AuraSceneNode>[] = [];
  if (!omitLowerBody) {
    const unitLower = buildSeatedFanLowerRaw(seatY);
    lowerChildren.push(
      multiNode(
        `${id}-lower-mesh`,
        [
          { mesh: unitLower.pelvAndLegs, material: denimMat },
          { mesh: unitLower.shoesUpper, material: shoeMat },
          { mesh: unitLower.shoesSole, material: soleMat }
        ],
        { castShadow: false, receiveShadow: true }
      )
    );
  }

  const torsoMesh = combineRaw([
    subdivideSmoothMesh(
      loftSuper(
        [
          { y: -0.02, rx: 0.145, rz: 0.105, roundness: 0.68 },
          { y: 0.22, rx: 0.175, rz: 0.118, roundness: 0.6 },
          { y: 0.38, rx: 0.155, rz: 0.102, roundness: 0.66 }
        ],
        12,
        true
      ),
      1,
      0.48
    ),
    place(latheMesh([[0.065, 0], [0.105, 0.015], [0.098, 0.055], [0.065, 0.05]], 10), [0, 0.365, -0.01])
  ]);

  const headOffY = 0.39;
  const headSkin = place(
    combineRaw([
      loftSuper(
        [
          { y: -0.02, rx: 0.048, rz: 0.05, roundness: 0.8 },
          { y: 0.045, rx: 0.046, rz: 0.048, roundness: 0.8 }
        ],
        8,
        true
      ),
      place(subdivideSmoothMesh(icosphereFacetMesh(0.085, 1, 0, 14 + index), 1, 0.56), [0, 0.118, 0.006], [0, 0, 0], [0.92, 1.06, 1.0])
    ]),
    [0, headOffY, 0]
  );
  const headCap = place(
    combineRaw([
      place(
        loftSuper(
          [
            { y: 0.132, rx: 0.086, rz: 0.092, roundness: 0.76 },
            { y: 0.195, rx: 0.072, rz: 0.078, roundness: 0.82 }
          ],
          10,
          true
        ),
        [0, 0, 0.004]
      ),
      ...(variant !== 2 ? [place(box(0.13, 0.012, 0.075, 0.005), [0, 0.138, 0.095], [0.12, 0, 0])] : [])
    ]),
    [0, headOffY, 0]
  );

  // Coalesce chest + head + cap into 1 single vertex-colored mesh (`castShadow: false`)
  const chestAndHeadMeshNode = multiNode(
    `${id}-chest-mesh`,
    [
      { mesh: torsoMesh, material: hoodieMat },
      { mesh: headSkin, material: skinMat },
      { mesh: headCap, material: capMat }
    ],
    { castShadow: false, receiveShadow: true }
  );

  const buildFanArm = (side: "l" | "r") => {
    const sgn = side === "l" ? -1 : 1;
    // Smooth pre-bent cheering/clapping arm + hand in 1 coalesced mesh!
    const armSleeve = sculptHumanoidLimbMesh(
      [
        [0, 0.01, 0, 0.045],
        [0, -0.22, 0.02, 0.039],
        [sgn * 0.02, -0.35, 0.15, 0.033]
      ],
      9,
      0.12
    );
    const hand = place(icosphereFacetMesh(0.036, 1, 0, 20 + index), [sgn * 0.024, -0.37, 0.18], [0, 0, 0], [0.9, 1.15, 0.68]);
    const armMeshNode = multiNode(
      `${id}-upper-${side}-mesh`,
      [
        { mesh: armSleeve, material: hoodieMat },
        { mesh: hand, material: skinMat }
      ],
      { castShadow: false, receiveShadow: true }
    );
    const foreGroup = attachRt(group(`${id}-forearm-${side}`, [], { position: [0, -0.23, 0] }), `${id}-forearm-${side}`, runtimeFactory);
    return attachRt(
      group(`${id}-arm-${side}`, [armMeshNode, foreGroup], { position: [side === "l" ? 0.18 : -0.18, 0.32, 0] }),
      `${id}-arm-${side}`,
      runtimeFactory
    );
  };

  const fanHeadGroup = attachRt(group(`${id}-head`, [], { position: [0, headOffY, 0] }), `${id}-head`, runtimeFactory);
  const fanChestGroup = attachRt(
    group(`${id}-chest`, [chestAndHeadMeshNode, fanHeadGroup, buildFanArm("l"), buildFanArm("r")], { position: [0, seatY + 0.05, 0] }),
    `${id}-chest`,
    runtimeFactory
  );

  return attachRt(
    group(id, [...lowerChildren, fanChestGroup], { position, rotation, scale }),
    id,
    runtimeFactory
  );
}

/**
 * Statelessly animates a seated courtside fan (`sitClap`, `sitCheer`, `sitPump`) using `"ZYX"` Euler angles.
 */
export function poseArticulatedSeatedFan(
  lookup: (nodeId: string) => RuntimePoseNodeLike | undefined,
  id: string,
  index: number,
  clip: "sitClap" | "sitCheer" | "sitPump",
  time: number,
  speed = 1.0
): void {
  const t = time * speed + index * 1.17;
  let chestRot: [number, number, number];
  let headRot: [number, number, number];
  let armLRot: [number, number, number];
  let foreLRot: [number, number, number];
  let armRRot: [number, number, number];
  let foreRRot: [number, number, number];

  if (clip === "sitPump") {
    const pump = Math.sin(t * 7.2);
    chestRot = gripQToEulerZYX(qEulerXYZ(0.12 - Math.max(0, pump) * 0.08, Math.sin(t * 3.6) * 0.08, 0));
    headRot = gripQToEulerZYX(qEulerXYZ(-0.18 + pump * 0.08, Math.sin(t * 3.6) * 0.1, 0));
    armLRot = gripQToEulerZYX(qEulerXYZ(-2.35 - pump * 0.38, -0.14, 0.18));
    foreLRot = gripQToEulerZYX(qEulerXYZ(-0.45 + pump * 0.25, 0, 0));
    armRRot = gripQToEulerZYX(qEulerXYZ(-2.35 + pump * 0.38, 0.14, -0.18));
    foreRRot = gripQToEulerZYX(qEulerXYZ(-0.45 - pump * 0.25, 0, 0));
  } else if (clip === "sitCheer") {
    const wave = Math.sin(t * 4.4);
    chestRot = gripQToEulerZYX(qEulerXYZ(0.10 + Math.sin(t * 2.2) * 0.05, wave * 0.07, 0));
    headRot = gripQToEulerZYX(qEulerXYZ(-0.12, -wave * 0.12, 0));
    armLRot = gripQToEulerZYX(qEulerXYZ(-1.75 - wave * 0.28, -0.18, 0.24 + wave * 0.12));
    foreLRot = gripQToEulerZYX(qEulerXYZ(-0.55, 0, 0));
    armRRot = gripQToEulerZYX(qEulerXYZ(-1.75 + wave * 0.28, 0.18, -0.24 + wave * 0.12));
    foreRRot = gripQToEulerZYX(qEulerXYZ(-0.55, 0, 0));
  } else {
    // sitClap: rhythmic clapping in front of chest
    const clap = Math.abs(Math.sin(t * 5.6));
    chestRot = gripQToEulerZYX(qEulerXYZ(0.14 + clap * 0.03, 0, 0));
    headRot = gripQToEulerZYX(qEulerXYZ(-0.1 + clap * 0.06, Math.sin(t * 1.8) * 0.08, 0));
    armLRot = gripQToEulerZYX(qEulerXYZ(-0.92, -0.32 - (1 - clap) * 0.26, 0.12));
    foreLRot = gripQToEulerZYX(qEulerXYZ(-0.88, 0, -0.22));
    armRRot = gripQToEulerZYX(qEulerXYZ(-0.92, 0.32 + (1 - clap) * 0.26, -0.12));
    foreRRot = gripQToEulerZYX(qEulerXYZ(-0.88, 0, 0.22));
  }

  lookup(`${id}-chest`)?.setRotation?.(...chestRot);
  lookup(`${id}-head`)?.setRotation?.(...headRot);
  lookup(`${id}-arm-l`)?.setRotation?.(...armLRot);
  lookup(`${id}-forearm-l`)?.setRotation?.(...foreLRot);
  lookup(`${id}-arm-r`)?.setRotation?.(...armRRot);
  lookup(`${id}-forearm-r`)?.setRotation?.(...foreRRot);
}

