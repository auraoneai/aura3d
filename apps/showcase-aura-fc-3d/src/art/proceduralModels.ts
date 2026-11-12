/**
 * WP-09 — Aura FC 3D (`apps/showcase-aura-fc-3d`)
 * Procedural Multi-Material Stadium, Goal, Broadcast & 6-Venue Architectural Art Library.
 *
 * Replaces all 10 static Meshy/CC0 prop & stadium GLBs and raw primitive placeholders
 * with true curved, multi-material `@aura3d/engine` 5.5.1 assemblies built via
 * `proceduralKernel.ts` (zero `three` imports; WebGPU + WebGL2 dual-backend clean)
 * while preserving all 5 rigged `skins=1` athlete & supporter GLBs.
 */
import {
  AuraNodeBuilder,
  geometry,
  group,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraSceneNode
} from "@aura3d/engine";

type AuraGroupNode = ReturnType<typeof group> extends AuraNodeBuilder<infer TNode> ? TNode : AuraSceneNode;
import {
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
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
} from "../../../showcase-port-shared/proceduralKernel";
import {
  WGSL_CLIP,
  WGSL_ENVIRONMENT_FOG,
  WGSL_MATH,
  WGSL_NOISE,
  wgslStage
} from "../../../showcase-port-shared/wgsl-twins";
import {
  BALL_VIS_R,
  GOAL_DEPTH,
  GOAL_H,
  GOAL_HALF_W,
  PITCH_HX,
  PITCH_HZ
} from "../game/dims";
import type { VenueId } from "../game/types";

const TAU = Math.PI * 2;

export interface MaterialSlot {
  readonly mesh: RawMesh;
  readonly material: AuraMaterialSpec;
}

/* -------------------------------------------------------------------------- */
/* Dual GLSL + WGSL Custom Material Twins (`backend: "auto"` clean)           */
/* -------------------------------------------------------------------------- */

function parseHexLinearRgb(hex: AuraColor): readonly [number, number, number] {
  if (Array.isArray(hex)) return [hex[0] ?? 0.5, hex[1] ?? 0.5, hex[2] ?? 0.5];
  const raw = String(hex).trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0");
  const n = Number.parseInt(full.slice(0, 6), 16);
  const toLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [toLin(((n >> 16) & 255) / 255), toLin(((n >> 8) & 255) / 255), toLin((n & 255) / 255)];
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

/** Wraps `material.strata` with a complete WebGPU WGSL twin for alpine, Corcovado & Andean peaks. */
export function pairedStrataMaterial(options: Parameters<typeof material.strata>[0] = {}): AuraMaterialSpec {
  const base = material.strata(options);
  const colors = (options?.colors ?? ["#6d7888", "#d8e6f4", "#465160", "#eef5fc", "#333c48"]).map(parseHexLinearRgb);
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

/* -------------------------------------------------------------------------- */
/* Stadium & Broadcast Physical Material Palette (`>= 10` distinct presets)   */
/* -------------------------------------------------------------------------- */

export const FC_MAT = {
  goalPostWhite: material.clearcoatPaint({
    name: "fifa powder-coat white",
    color: "#f6f8fc",
    roughness: 0.12,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.35
  }),
  anodizedSilver: material.studioMetal({
    name: "anodized stadium aluminium",
    color: "#ced8e3",
    metalness: 0.9,
    roughness: 0.22
  }),
  trophySterling: material.studioMetal({
    name: "championship sterling silver",
    color: "#eef3f9",
    metalness: 0.96,
    roughness: 0.12
  }),
  trophyGoldTrim: material.studioMetal({
    name: "championship 24k gold trim",
    color: "#f4c44e",
    metalness: 0.92,
    roughness: 0.18
  }),
  darkSteel: material.brushedMetal({
    name: "galvanized structural steel",
    color: "#222d3b",
    roughness: 0.36
  }),
  stormNavyShell: material.carPaint({
    name: "storm navy dugout shell",
    color: "#18283e",
    roughness: 0.22,
    clearcoat: 0.86,
    clearcoatRoughness: 0.1
  }),
  seatQuiltFabric: material.fabric({
    name: "quilted technical seat upholstery",
    color: "#24364e",
    roughness: 0.84,
    sheen: 0.35,
    sheenColor: "#7ea2cc"
  }),
  tunnelBellowsFabric: material.fabric({
    name: "telescopic tunnel canvas",
    color: "#152338",
    roughness: 0.82,
    sheen: 0.28,
    sheenColor: "#5c7ca6"
  }),
  ballPearl: material.clearcoatPaint({
    name: "thermally bonded match pearl",
    color: "#f9fbff",
    roughness: 0.14,
    clearcoat: 0.94,
    clearcoatRoughness: 0.07
  }),
  ballNavyPanel: material.carPaint({
    name: "match ball star panel",
    color: "#14243b",
    roughness: 0.18,
    clearcoat: 0.88,
    clearcoatRoughness: 0.09
  }),
  ballAccentSeam: material.lacquer({
    name: "match ball speed seam",
    color: "#d8ff3e",
    roughness: 0.18,
    clearcoat: 0.82,
    clearcoatRoughness: 0.1
  }),
  blackRubber: material.blackRubber({
    name: "non-slip vulcanized rubber",
    color: "#171a20",
    roughness: 0.86
  }),
  concreteBase: material.matteClay({
    name: "architectural precast concrete",
    color: "#2a3340",
    roughness: 0.86
  }),
  granitePlinth: material.ceramic({
    name: "honed obsidian granite",
    color: "#181f28",
    roughness: 0.28
  }),
  // WebGPU-safe translucent polycarbonate / ETFE (never studioGlass with opacity < 1)
  polycarbonateRoof: material.physical({
    name: "curved dugout polycarbonate",
    color: "#d6edf8",
    roughness: 0.05,
    opacity: 0.42,
    clearcoat: 1,
    ior: 1.5
  }),
  etfePillow: material.physical({
    name: "inflated etfe stadium cushion",
    color: "#dceefb",
    roughness: 0.06,
    opacity: 0.44,
    clearcoat: 1,
    ior: 1.5
  }),
  nylonCord: material.pbr({
    name: "braided goal tension cord",
    color: "#e2e8f0",
    roughness: 0.72,
    metalness: 0.04
  }),
  supporterKitCloth: material.fabric({
    name: "supporter club jersey micromesh",
    color: "#ffffff",
    roughness: 0.76,
    sheen: 0.42,
    sheenRoughness: 0.64,
    sheenColor: "#eef4fc"
  }),
  supporterScarfCloth: material.felt({
    name: "supporter knit wool scarf",
    color: "#ffffff",
    roughness: 0.82,
    sheen: 0.46,
    sheenColor: "#f4f7fb"
  }),
  supporterDenim: material.sneakerMesh({
    name: "supporter stadium denim slate",
    color: "#1e2736",
    roughness: 0.84,
    sheen: 0.22,
    sheenColor: "#526580"
  }),
  cleatLeather: material.lacquer({
    name: " football cleat kangaroo leather",
    color: "#171a22",
    roughness: 0.32,
    clearcoat: 0.44,
    clearcoatRoughness: 0.24
  })
} as const;

/* -------------------------------------------------------------------------- */
/* Ergonomic Multi-Material & Mesh Helpers                                    */
/* -------------------------------------------------------------------------- */

function combineRaw(meshes: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of meshes) {
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  return { positions, normals, uvs, indices };
}

const place = (src: RawMesh, pos?: V3, rot?: V3, scale?: number | V3): RawMesh =>
  transformMesh(src, { pos, rot, scale });

const box = (wx: number, wy: number, wz: number, bevel = 0.02): RawMesh =>
  bevelBoxMesh(wx, wy, wz, bevel);

function tube(pts: readonly V3[], radii: number | readonly number[], radialSegs = 8, capEnds = true): RawMesh {
  const spine: V4[] = pts.map((p, idx) => [
    p[0],
    p[1],
    p[2],
    typeof radii === "number" ? radii : (radii[Math.min(idx, radii.length - 1)] ?? 0.04)
  ]);
  return tubeSweepMesh(spine, radialSegs, capEnds);
}

const _memoCache = new Map<string, unknown>();
function memo<T>(key: string, compute: () => T): T {
  if (_memoCache.has(key)) return _memoCache.get(key) as T;
  const val = compute();
  _memoCache.set(key, val);
  return val;
}

function assembleSlots(
  name: string,
  slots: readonly MaterialSlot[],
  options: {
    readonly id?: string;
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly visible?: boolean;
  } = {}
): AuraNodeBuilder<AuraGroupNode> {
  const nonEmpty = slots.filter((s) => s.mesh.positions.length > 0 && s.mesh.indices.length > 0);
  if (nonEmpty.length === 0) {
    let empty = group(name, [], {
      ...(options.position ? { position: options.position } : {}),
      ...(options.rotation ? { rotation: options.rotation } : {}),
      ...(options.scale !== undefined ? { scale: options.scale } : {})
    });
    if (options.id) empty = empty.runtime({ id: options.id });
    return empty;
  }
  const materials: AuraMaterialSpec[] = [];
  const multiSlots: MultiMatSlot[] = nonEmpty.map((s) => {
    let matIdx = materials.indexOf(s.material);
    if (matIdx < 0) {
      matIdx = materials.length;
      materials.push(s.material);
    }
    return { mesh: s.mesh, materialIndex: matIdx };
  });
  return assembleMultiMaterialNode(name, multiSlots, materials, options);
}

export function stampNoCastShadow<TNode extends AuraSceneNode>(builder: AuraNodeBuilder<TNode>): AuraNodeBuilder<TNode> {
  return new AuraNodeBuilder<TNode>({ ...builder.toJSON(), castShadow: false } as TNode);
}

function practicalGlow(name: string, hex: string, intensity = 1.1): AuraMaterialSpec {
  return material.emissive({
    name,
    color: hex,
    emissive: hex,
    emissiveIntensity: intensity,
    practical: true
  });
}

function accentCarPaint(name: string, hex: string): AuraMaterialSpec {
  return material.carPaint({
    name,
    color: hex,
    roughness: 0.2,
    clearcoat: 0.88,
    clearcoatRoughness: 0.09
  });
}

/* -------------------------------------------------------------------------- */
/* 1. FIFA Regulation Goalframe + Contoured Net Panels + Match Ball           */
/* -------------------------------------------------------------------------- */

/**
 * Sculpted multi-material FIFA goalframe (`fc-goal-mesh-${sx}`), centered at
 * `[sx * (PITCH_HX + GOAL_DEPTH * 0.5), 0, 0]` with unit scale `[1, 1, 1]` and exact
 * local geometry bounds spanning `[GOAL_DEPTH, GOAL_H, GOAL_HALF_W * 2]` (`2.6 x 2.85 x 7.6 m`).
 */
export function buildFifaGoalFrameNode(sx: -1 | 1, accentHex: string): AuraNodeBuilder<AuraGroupNode> {
  const hx = GOAL_DEPTH * 0.5;
  const postR = 0.064;
  const stanchionR = 0.036;
  const baseR = 0.056;
  const xFront = -sx * (hx - postR);
  const xBack = sx * (hx - baseR);
  const zN = -(GOAL_HALF_W - postR);
  const zS = GOAL_HALF_W - postR;
  const yBar = GOAL_H - postR;

  // Continuous U-portal: left post -> mitered elbow -> crossbar -> mitered elbow -> right post
  const portalPts: V3[] = [
    [xFront, 0, zN],
    [xFront, yBar - 0.14, zN],
    [xFront, yBar - 0.03, zN + 0.04],
    [xFront, yBar, zN + 0.15],
    [xFront, yBar, zS - 0.15],
    [xFront, yBar - 0.03, zS - 0.04],
    [xFront, yBar - 0.14, zS],
    [xFront, 0, zS]
  ];
  const whiteFrame = combineRaw([
    tube(portalPts, postR, 12, true),
    place(box(postR * 2.0, 0.06, postR * 2.0, 0.01), [xFront, 0.03, zN]),
    place(box(postR * 2.0, 0.06, postR * 2.0, 0.01), [xFront, 0.03, zS])
  ]);

  // Anodized recessed net-hook rails along rear of posts & crossbar + ground collars
  const xHook = xFront + sx * (postR * 0.92);
  const netHookHardware = combineRaw([
    place(box(0.028, yBar - 0.18, 0.032, 0.006), [xHook, (yBar - 0.1) * 0.5, zN]),
    place(box(0.028, yBar - 0.18, 0.032, 0.006), [xHook, (yBar - 0.1) * 0.5, zS]),
    place(box(0.028, 0.032, (zS - zN) - 0.24, 0.006), [xHook, yBar - 0.02, 0]),
    place(latheMesh([[0, 0], [postR * 0.98, 0], [postR * 0.95, 0.12], [0, 0.12]], 12), [xFront, 0, zN]),
    place(latheMesh([[0, 0], [postR * 0.98, 0], [postR * 0.95, 0.12], [0, 0.12]], 12), [xFront, 0, zS])
  ]);

  // Curved European D-stanchions + upper support arms + diagonal tension struts
  const stanchions: RawMesh[] = [];
  for (const zSide of [zN, zS]) {
    stanchions.push(
      tube(
        [
          [xFront + sx * 0.05, yBar - 0.06, zSide],
          [xFront + sx * (GOAL_DEPTH * 0.44), yBar - 0.08, zSide],
          [xBack - sx * 0.12, yBar * 0.78, zSide],
          [xBack, 0.08, zSide]
        ],
        stanchionR,
        8,
        true
      ),
      tube(
        [
          [xFront + sx * 0.04, 0.08, zSide],
          [xBack, 0.08, zSide]
        ],
        baseR * 0.72,
        8,
        true
      ),
      tube(
        [
          [xFront + sx * (GOAL_DEPTH * 0.42), yBar - 0.09, zSide],
          [xBack - sx * 0.04, 0.14, zSide]
        ],
        stanchionR * 0.65,
        6,
        true
      )
    );
  }
  // Rear upper tie bar connecting both D-stanchions
  stanchions.push(
    tube(
      [
        [xFront + sx * (GOAL_DEPTH * 0.44), yBar - 0.08, zN],
        [xFront + sx * (GOAL_DEPTH * 0.44), yBar - 0.08, zS]
      ],
      stanchionR * 0.8,
      8,
      true
    )
  );

  // Weighted rubberized rear ground bar + accent corner anchor caps
  const rearGroundBar = combineRaw([
    place(box(baseR * 2, baseR * 1.9, (zS - zN) + postR * 0.6, 0.018), [xBack, baseR * 0.95, 0])
  ]);
  const accentAnchors = combineRaw([
    place(box(baseR * 1.9, 0.12, postR * 2, 0.02), [xBack, 0.07, zN]),
    place(box(baseR * 1.9, 0.12, postR * 2, 0.02), [xBack, 0.07, zS])
  ]);

  // Braided top & rear tension cords
  const tensionCords = combineRaw([
    tube([[xHook, yBar - 0.02, zN * 0.62], [xBack, 0.12, zN * 0.72]], 0.012, 5, true),
    tube([[xHook, yBar - 0.02, zS * 0.62], [xBack, 0.12, zS * 0.72]], 0.012, 5, true)
  ]);

  return assembleSlots(
    `fc-goal-mesh-${sx}`,
    [
      { mesh: whiteFrame, material: FC_MAT.goalPostWhite },
      { mesh: netHookHardware, material: FC_MAT.anodizedSilver },
      { mesh: combineRaw(stanchions), material: FC_MAT.darkSteel },
      { mesh: rearGroundBar, material: FC_MAT.blackRubber },
      { mesh: accentAnchors, material: accentCarPaint("goal anchor accent", accentHex) },
      { mesh: tensionCords, material: FC_MAT.nylonCord }
    ],
    {
      id: `fc-goal-mesh-${sx}`,
      position: [sx * (PITCH_HX + hx), 0, 0],
      scale: [1, 1, 1],
      castShadow: true,
      receiveShadow: true
    }
  );
}

/** Subdivided contoured goal-net panel (`uSegs x vSegs`) with subtle parabolic sag and `[0..1]` UVs. */
function buildSubdividedNetSheet(
  samplePoint: (u: number, v: number) => V3,
  normalHint: V3,
  uSegs = 12,
  vSegs = 8
): AuraCustomGeometrySpec {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let iv = 0; iv <= vSegs; iv += 1) {
    const v = iv / vSegs;
    for (let iu = 0; iu <= uSegs; iu += 1) {
      const u = iu / uSegs;
      const p = samplePoint(u, v);
      positions.push(p[0], p[1], p[2]);
      normals.push(normalHint[0], normalHint[1], normalHint[2]);
      uvs.push(u, v);
    }
  }
  const row = uSegs + 1;
  for (let iv = 0; iv < vSegs; iv += 1) {
    for (let iu = 0; iu < uSegs; iu += 1) {
      const a = iv * row + iu;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return mergeRawMeshes([{ positions, normals, uvs, indices }]);
}

/** Contoured rear goal-net curtain (`net-back-${sx}`), centered around `[backX, GOAL_H / 2, 0]`. */
export function buildGoalNetBackGeometry(sx: -1 | 1): AuraCustomGeometrySpec {
  const halfZ = GOAL_HALF_W - 0.04;
  const halfY = (GOAL_H - 0.08) * 0.5;
  return buildSubdividedNetSheet(
    (u, v) => {
      const z = (u * 2 - 1) * halfZ;
      const y = (v * 2 - 1) * halfY;
      // Natural inward/outward catenary drape toward rear base bar
      const drape = -sx * (1 - v) * 0.14 + sx * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.11;
      return [drape, y, z];
    },
    [sx, 0, 0],
    16,
    10
  );
}

/** Contoured top goal-net canopy (`net-roof-${sx}`), centered around `[gx + sx * GOAL_DEPTH / 2, GOAL_H, 0]`. */
export function buildGoalNetRoofGeometry(sx: -1 | 1): AuraCustomGeometrySpec {
  const halfX = GOAL_DEPTH * 0.46;
  const halfZ = GOAL_HALF_W - 0.05;
  return buildSubdividedNetSheet(
    (u, v) => {
      const x = (u * 2 - 1) * halfX;
      const z = (v * 2 - 1) * halfZ;
      const sag = -Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.09 - (sx > 0 ? u : 1 - u) * 0.05;
      return [x, sag, z];
    },
    [0, 1, 0],
    10,
    14
  );
}

/** Contoured side goal-net cheek panel (`net-n-${sx}` / `net-s-${sx}`). */
export function buildGoalNetSideGeometry(sx: -1 | 1, sideSign: -1 | 1): AuraCustomGeometrySpec {
  const halfX = GOAL_DEPTH * 0.46;
  const halfY = (GOAL_H - 0.08) * 0.5;
  return buildSubdividedNetSheet(
    (u, v) => {
      const x = (u * 2 - 1) * halfX;
      const y = (v * 2 - 1) * halfY;
      const sag = -sideSign * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.06;
      // Taper slightly at upper-rear D-stanchion curve
      const rearFrac = sx > 0 ? u : 1 - u;
      const yClip = v > 0.72 && rearFrac > 0.68 ? -(v - 0.72) * (rearFrac - 0.68) * 0.55 : 0;
      return [x, y + yClip, sag];
    },
    [0, 0, sideSign],
    10,
    10
  );
}

/**
 * Thermally-bonded championship match ball (`fc-ball-mesh` & `fc-spare-ball`).
 * Sphere is centered at local `[0, BALL_VIS_R, 0]` (`minY = 0`, `maxY = BALL_VIS_R * 2 = 0.42 m`)
 * so `main.ts`'s bottom-pivot rolling transform and `fc-spare-ball` at `y = 0` stay exact.
 */
export function buildMatchBallNode(
  name: string,
  position: V3,
  runtimeId?: string
): AuraNodeBuilder<AuraGroupNode> {
  const r = BALL_VIS_R;
  const [carcass, starPatches, speedSeams] = memo("match-ball-meshes", () => {
    const c = place(icosphereFacetMesh(r * 0.985, 2, 0, 7), [0, r, 0]);
    const starPoly: V2[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU;
      const rad = i % 2 === 0 ? r * 0.36 : r * 0.17;
      starPoly.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    const patchProto = extrudePolygonMesh(starPoly, r * 0.09, r * 0.015, true);
    const d = r * 0.945;
    const sp = combineRaw([
      place(patchProto, [0, r, d], [0, 0, 0]),
      place(patchProto, [0, r, -d], [0, Math.PI, 0]),
      place(patchProto, [d, r, 0], [0, Math.PI * 0.5, 0]),
      place(patchProto, [-d, r, 0], [0, -Math.PI * 0.5, 0]),
      place(patchProto, [0, r + d, 0], [-Math.PI * 0.5, 0, 0]),
      place(patchProto, [0, r - d, 0], [Math.PI * 0.5, 0, 0])
    ]);
    const ringPts = 16;
    const mkLoop = (fn: (a: number) => V3): RawMesh => {
      const pts: V3[] = [];
      for (let i = 0; i <= ringPts; i += 1) pts.push(fn((i / ringPts) * TAU));
      return tube(pts, r * 0.032, 5, false);
    };
    const ss = combineRaw([
      mkLoop((a) => [Math.cos(a) * r * 0.992, r + Math.sin(a) * r * 0.992, 0]),
      mkLoop((a) => [0, r + Math.cos(a) * r * 0.992, Math.sin(a) * r * 0.992]),
      mkLoop((a) => [Math.cos(a) * r * 0.992, r, Math.sin(a) * r * 0.992])
    ]);
    return [c, sp, ss] as const;
  });

  const indexed: MultiMatSlot[] = [
    { mesh: carcass, materialIndex: 0 },
    { mesh: starPatches, materialIndex: 1 },
    { mesh: speedSeams, materialIndex: 2 }
  ];
  return assembleMultiMaterialNode(
    name,
    indexed,
    [FC_MAT.ballPearl, FC_MAT.ballNavyPanel, FC_MAT.ballAccentSeam],
    {
      ...(runtimeId ? { id: runtimeId } : {}),
      position,
      castShadow: true,
      receiveShadow: true
    }
  );
}

/** Flexible corner-flag mast (`latheMesh` with spring-flex rubber collar & domed finial, height `1.3 m` centered at `0`). */
export function buildCornerPoleGeometry(): AuraCustomGeometrySpec {
  const profile: V2[] = [
    [0, -0.65],
    [0.032, -0.65],
    [0.032, -0.52],
    [0.018, -0.49],
    [0.017, 0.61],
    [0.025, 0.635],
    [0, 0.655]
  ];
  return mergeRawMeshes([latheMesh(profile, 10)]);
}

/** Rippling S-curved corner pennant (`0.28 x 0.19 m`) for `fc-corner-flags`. */
export function buildCornerPennantGeometry(): AuraCustomGeometrySpec {
  const cols = 6;
  const sections: V3[][] = [];
  for (let i = 0; i <= cols; i += 1) {
    const u = i / cols;
    const x = u * 0.28;
    const taper = 1 - u * 0.38;
    const wave = Math.sin(u * Math.PI * 1.65) * 0.026;
    const hy = 0.095 * taper;
    sections.push([
      [x, -hy, wave - 0.006],
      [x, hy, wave - 0.006],
      [x, hy, wave + 0.006],
      [x, -hy, wave + 0.006]
    ]);
  }
  return mergeRawMeshes([loftSectionsMesh(sections, true, true)]);
}

/**
 * Bevelled perimeter LED hoarding cabinet (`[-0.5, 0.5]^3` unit bounds for `fc-hoardings`).
 * Includes overhanging top rain-hood visor, rear kick-strut base, and `[0..1]` `uv.y` mapping
 * required by `hoardingLedShaderSpec`.
 */
export function buildHoardingCabinetGeometry(): AuraCustomGeometrySpec {
  const raw = combineRaw([
    box(1.0, 0.88, 0.72, 0.03),
    place(box(1.0, 0.1, 1.0, 0.018), [0, 0.45, 0]),
    place(box(1.0, 0.1, 0.96, 0.018), [0, -0.45, 0])
  ]);
  const uvs = raw.uvs.slice();
  for (let i = 0; i < raw.positions.length / 3; i += 1) {
    const py = raw.positions[i * 3 + 1]!;
    uvs[i * 2 + 1] = Math.max(0, Math.min(1, py + 0.5));
  }
  return mergeRawMeshes([{ ...raw, uvs }]);
}

/* -------------------------------------------------------------------------- */
/* 2. Towering Lattice Floodlight Masts, Dugouts, Trophy & Broadcast Rigs     */
/* -------------------------------------------------------------------------- */

/**
 * Sculpted 13.4 m stadium floodlight tower (`flood-0..3`):
 * Concrete foundation plinth, open 4-chord `latticeTrussMesh` steel mast, maintenance catwalk,
 * and tilted 18-hood die-cast LED luminaire bank with `practical: true` emitters.
 */
function floodlightTowerUnitMeshes(headY: number): readonly [RawMesh, RawMesh, RawMesh, RawMesh] {
  const mastH = headY - 1.35;
  return memo(`flood-tower:${headY}`, () => {
    const pl = combineRaw([
      place(box(2.1, 0.55, 2.1, 0.06), [0, 0.275, 0]),
      place(box(1.62, 0.65, 1.62, 0.05), [0, 0.82, 0])
    ]);
    const tm = combineRaw([
      place(
        latticeTrussMesh({ span: [1.28, mastH, 1.28], bays: 4, chordRadius: 0.058, braceRadius: 0.032 }),
        [0, 1.1 + mastH * 0.5, 0]
      ),
      tube([[0, 1.1, -0.18], [0, headY - 0.4, -0.18]], 0.065, 6, true),
      place(box(3.8, 0.14, 1.65, 0.025), [0, headY - 0.82, 0.12]),
      tube([[-1.85, headY - 0.12, 0.9], [1.85, headY - 0.12, 0.9], [1.85, headY - 0.12, -0.65], [-1.85, headY - 0.12, -0.65], [-1.85, headY - 0.12, 0.9]], 0.026, 5, false),
      place(
        latticeTrussMesh({ span: [4.2, 2.15, 0.55], bays: 3, chordRadius: 0.042, braceRadius: 0.024 }),
        [0, headY + 0.45, 0.28],
        [0.34, 0, 0]
      )
    ]);
    const hoods: RawMesh[] = [];
    const lenses: RawMesh[] = [];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        const lx = (col - 2.5) * 0.64;
        const ly = headY - 0.18 + row * 0.64;
        const lz = 0.48 - row * 0.16;
        hoods.push(place(box(0.52, 0.44, 0.34, 0.03), [lx, ly, lz], [0.36, 0, 0]));
        lenses.push(place(box(0.42, 0.32, 0.06, 0.01), [lx, ly - 0.03, lz + 0.16], [0.36, 0, 0]));
      }
    }
    return [pl, tm, combineRaw(hoods), combineRaw(lenses)] as const;
  });
}

export function buildFloodlightTowerNode(
  index: number,
  x: number,
  z: number,
  floodHex: string,
  headY = 12
): AuraNodeBuilder<AuraGroupNode> {
  const yaw = Math.atan2(-x, -z);
  const [plinth, trussMast, hoodMesh, lensMesh] = floodlightTowerUnitMeshes(headY);
  return assembleSlots(
    `flood-${index}`,
    [
      { mesh: plinth, material: FC_MAT.concreteBase },
      { mesh: trussMast, material: FC_MAT.darkSteel },
      { mesh: hoodMesh, material: FC_MAT.anodizedSilver },
      { mesh: lensMesh, material: practicalGlow(`flood-${index}-lamps`, floodHex, 1.45) }
    ],
    {
      position: [x, 0, z],
      rotation: [0, yaw, 0],
      castShadow: false,
      receiveShadow: true
    }
  );
}

/** Batches all 4 stadium corner floodlight towers into one shared multi-material buffer (4 draws vs 16). */
export function buildFloodlightTowersBatchedNode(
  towers: readonly (readonly [number, number])[],
  floodHex: string,
  headY = 12
): AuraNodeBuilder<AuraGroupNode> {
  const [plinth, trussMast, hoodMesh, lensMesh] = floodlightTowerUnitMeshes(headY);
  const plinths: RawMesh[] = [];
  const masts: RawMesh[] = [];
  const hoods: RawMesh[] = [];
  const lenses: RawMesh[] = [];
  for (const [x, z] of towers) {
    const yaw = Math.atan2(-x, -z);
    plinths.push(place(plinth, [x, 0, z], [0, yaw, 0]));
    masts.push(place(trussMast, [x, 0, z], [0, yaw, 0]));
    hoods.push(place(hoodMesh, [x, 0, z], [0, yaw, 0]));
    lenses.push(place(lensMesh, [x, 0, z], [0, yaw, 0]));
  }
  return assembleSlots(
    "fc-flood-towers",
    [
      { mesh: combineRaw(plinths), material: FC_MAT.concreteBase },
      { mesh: combineRaw(masts), material: FC_MAT.darkSteel },
      { mesh: combineRaw(hoods), material: FC_MAT.anodizedSilver },
      { mesh: combineRaw(lenses), material: practicalGlow("fc-flood-lamps", floodHex, 1.45) }
    ],
    { castShadow: false, receiveShadow: true }
  );
}

/**
 * Curved technical-area trainer shelter (`dugout-home`, `dugout-away`):
 * Translucent polycarbonate wraparound canopy (`material.physical`, `castShadow: false`),
 * curved `tubeSweepMesh` C-ribs, rubberized deck, and 6 quilted ergonomic bucket seats.
 */
export function buildTechnicalDugoutNode(
  name: string,
  position: V3,
  rotY: number,
  accentHex: string
): AuraNodeBuilder<AuraGroupNode> {
  const halfW = 2.25;
  const ribArc: readonly V3[] = [
    [0, 0.08, -0.78],
    [0, 0.85, -0.86],
    [0, 1.62, -0.76],
    [0, 2.08, -0.34],
    [0, 2.2, 0.36],
    [0, 2.12, 0.88]
  ];

  // Curved polycarbonate canopy lofted across the width of the shelter
  const canopyRings: V3[][] = [];
  for (let s = 0; s <= 6; s += 1) {
    const x = -halfW + (s / 6) * (halfW * 2);
    const ring: V3[] = [];
    for (const p of ribArc) ring.push([x, p[1], p[2]]);
    for (let k = ribArc.length - 1; k >= 0; k -= 1) {
      const p = ribArc[k]!;
      ring.push([x, p[1] - 0.035, p[2] - 0.035]);
    }
    canopyRings.push(ring);
  }
  const polyCanopy = loftSectionsMesh(canopyRings, true, true);

  // Structural C-ribs + longitudinal purlins
  const ribs: RawMesh[] = [];
  for (const rx of [-halfW, -halfW * 0.34, halfW * 0.34, halfW]) {
    ribs.push(tube(ribArc.map((p) => [rx, p[1], p[2]]), 0.042, 8, true));
  }
  ribs.push(
    tube([[-halfW, 2.12, 0.88], [halfW, 2.12, 0.88]], 0.038, 8, true),
    tube([[-halfW, 1.62, -0.76], [halfW, 1.62, -0.76]], 0.034, 8, true)
  );

  // Non-slip rubber floor deck + brushed aluminium front step sill
  const deckRubber = place(box(halfW * 2 + 0.16, 0.1, 1.78, 0.02), [0, 0.05, 0.04]);
  const sillTrim = place(box(halfW * 2 + 0.2, 0.06, 0.14, 0.015), [0, 0.08, 0.88]);

  // 6 ergonomic bucket seats with side bolsters, quilted cushions & accent headrest trim
  const seatShells: RawMesh[] = [];
  const seatCushions: RawMesh[] = [];
  const seatAccents: RawMesh[] = [];
  for (let i = 0; i < 6; i += 1) {
    const sx = (i - 2.5) * 0.68;
    seatShells.push(
      place(box(0.52, 0.09, 0.48, 0.025), [sx, 0.46, -0.18]),
      place(box(0.5, 0.78, 0.1, 0.03), [sx, 0.86, -0.4], [-0.14, 0, 0]),
      place(tube([[sx, 0.1, -0.22], [sx, 0.44, -0.22]], 0.045, 8, true), [0, 0, 0])
    );
    seatCushions.push(
      place(box(0.42, 0.07, 0.4, 0.02), [sx, 0.51, -0.16]),
      place(box(0.38, 0.52, 0.07, 0.02), [sx, 0.82, -0.35], [-0.14, 0, 0])
    );
    seatAccents.push(place(box(0.28, 0.1, 0.07, 0.018), [sx, 1.18, -0.39], [-0.14, 0, 0]));
  }

  return assembleSlots(
    name,
    [
      { mesh: deckRubber, material: FC_MAT.blackRubber },
      { mesh: sillTrim, material: FC_MAT.anodizedSilver },
      { mesh: combineRaw(ribs), material: FC_MAT.darkSteel },
      { mesh: combineRaw(seatShells), material: FC_MAT.stormNavyShell },
      { mesh: combineRaw(seatCushions), material: FC_MAT.seatQuiltFabric },
      { mesh: combineRaw(seatAccents), material: accentCarPaint(`${name}-accent`, accentHex) },
      { mesh: polyCanopy, material: FC_MAT.polycarbonateRoof }
    ],
    {
      position,
      rotation: [0, rotY, 0],
      castShadow: false,
      receiveShadow: true
    }
  );
}

/** Batches home + away technical dugouts into one grouped multi-material assembly. */
export function buildTechnicalDugoutsBatchedNode(
  placements: readonly { readonly pos: V3; readonly rotY: number }[],
  accentHex: string
): AuraNodeBuilder<AuraGroupNode> {
  const unit = memo("dugout-unit-meshes", () => {
    const halfW = 2.25;
    const ribArc: readonly V3[] = [
      [0, 0.08, -0.78], [0, 0.85, -0.86], [0, 1.62, -0.76],
      [0, 2.08, -0.34], [0, 2.2, 0.36], [0, 2.12, 0.88]
    ];
    const canopyRings: V3[][] = [];
    for (let s = 0; s <= 6; s += 1) {
      const x = -halfW + (s / 6) * (halfW * 2);
      const ring: V3[] = [];
      for (const p of ribArc) ring.push([x, p[1], p[2]]);
      for (let k = ribArc.length - 1; k >= 0; k -= 1) {
        const p = ribArc[k]!;
        ring.push([x, p[1] - 0.035, p[2] - 0.035]);
      }
      canopyRings.push(ring);
    }
    const ribs: RawMesh[] = [];
    for (const rx of [-halfW, -halfW * 0.34, halfW * 0.34, halfW]) {
      ribs.push(tube(ribArc.map((p) => [rx, p[1], p[2]]), 0.042, 8, true));
    }
    ribs.push(
      tube([[-halfW, 2.12, 0.88], [halfW, 2.12, 0.88]], 0.038, 8, true),
      tube([[-halfW, 1.62, -0.76], [halfW, 1.62, -0.76]], 0.034, 8, true)
    );
    const seatShells: RawMesh[] = [];
    const seatCushions: RawMesh[] = [];
    const seatAccents: RawMesh[] = [];
    for (let i = 0; i < 6; i += 1) {
      const sx = (i - 2.5) * 0.68;
      seatShells.push(
        place(box(0.52, 0.09, 0.48, 0.025), [sx, 0.46, -0.18]),
        place(box(0.5, 0.78, 0.1, 0.03), [sx, 0.86, -0.4], [-0.14, 0, 0]),
        tube([[sx, 0.1, -0.22], [sx, 0.44, -0.22]], 0.045, 8, true)
      );
      seatCushions.push(
        place(box(0.42, 0.07, 0.4, 0.02), [sx, 0.51, -0.16]),
        place(box(0.38, 0.52, 0.07, 0.02), [sx, 0.82, -0.35], [-0.14, 0, 0])
      );
      seatAccents.push(place(box(0.28, 0.1, 0.07, 0.018), [sx, 1.18, -0.39], [-0.14, 0, 0]));
    }
    return [
      place(box(halfW * 2 + 0.16, 0.1, 1.78, 0.02), [0, 0.05, 0.04]),
      place(box(halfW * 2 + 0.2, 0.06, 0.14, 0.015), [0, 0.08, 0.88]),
      combineRaw(ribs),
      combineRaw(seatShells),
      combineRaw(seatCushions),
      combineRaw(seatAccents),
      loftSectionsMesh(canopyRings, true, true)
    ] as const;
  });
  const xform = (m: RawMesh) => combineRaw(placements.map(({ pos, rotY }) => place(m, pos, [0, rotY, 0])));
  return assembleSlots(
    "fc-dugouts",
    [
      { mesh: xform(unit[0]), material: FC_MAT.blackRubber },
      { mesh: xform(unit[1]), material: FC_MAT.anodizedSilver },
      { mesh: xform(unit[2]), material: FC_MAT.darkSteel },
      { mesh: xform(unit[3]), material: FC_MAT.stormNavyShell },
      { mesh: xform(unit[4]), material: FC_MAT.seatQuiltFabric },
      { mesh: xform(unit[5]), material: accentCarPaint("dugouts-accent", accentHex) },
      { mesh: xform(unit[6]), material: FC_MAT.polycarbonateRoof }
    ],
    { castShadow: false, receiveShadow: true }
  );
}

/** Wheeled tubular match-ball cage trolley (`fc-ball-cart`) holding 6 spare match balls. */
export function buildBallTrolleyNode(position: V3, accentHex: string): AuraNodeBuilder<AuraGroupNode> {
  const frame: RawMesh[] = [];
  for (const cx of [-0.46, 0.46]) {
    for (const cz of [-0.32, 0.32]) {
      frame.push(tube([[cx, 0.12, cz], [cx, 0.88, cz]], 0.022, 6, true));
    }
  }
  for (const ry of [0.24, 0.54, 0.84]) {
    frame.push(
      tube([[-0.46, ry, -0.32], [0.46, ry, -0.32], [0.46, ry, 0.32], [-0.46, ry, 0.32], [-0.46, ry, -0.32]], 0.018, 6, false)
    );
  }
  // Push handle
  frame.push(tube([[0.46, 0.78, -0.28], [0.62, 0.98, -0.28], [0.62, 0.98, 0.28], [0.46, 0.78, 0.28]], 0.02, 6, true));

  const casters: RawMesh[] = [];
  const wheelProto = latheMesh([[0, -0.02], [0.06, -0.02], [0.06, 0.02], [0, 0.02]], 10);
  for (const cx of [-0.44, 0.44]) {
    for (const cz of [-0.3, 0.3]) {
      casters.push(place(wheelProto, [cx, 0.06, cz], [0, 0, Math.PI * 0.5]));
    }
  }

  const ballsPearl: RawMesh[] = [];
  const ballsTrim: RawMesh[] = [];
  const br = 0.135;
  for (let i = 0; i < 6; i += 1) {
    const bx = ((i % 3) - 1) * 0.27;
    const bz = (i < 3 ? -1 : 1) * 0.14;
    const by = 0.4 + (i % 2) * 0.22;
    ballsPearl.push(place(icosphereFacetMesh(br, 1, 0, 3 + i), [bx, by, bz]));
    ballsTrim.push(place(box(br * 1.3, br * 0.36, br * 1.3, 0.015), [bx, by, bz], [0.4 * i, 0.6 * i, 0]));
  }

  return assembleSlots(
    "fc-ball-cart",
    [
      { mesh: combineRaw(frame), material: accentCarPaint("ball trolley frame", accentHex) },
      { mesh: combineRaw(casters), material: FC_MAT.blackRubber },
      { mesh: combineRaw(ballsPearl), material: FC_MAT.ballPearl },
      { mesh: combineRaw(ballsTrim), material: FC_MAT.ballNavyPanel }
    ],
    { position, castShadow: true, receiveShadow: true }
  );
}

/** Stepped granite-and-brass ceremonial collar around `fc-trophy-plinth` (`y = 0`). */
export function buildTrophyPlinthCollarNode(position: V3, rotY: number): AuraNodeBuilder<AuraGroupNode> {
  const steps = combineRaw([
    place(box(1.68, 0.14, 1.68, 0.03), [0, 0.07, 0]),
    place(box(1.48, 0.16, 1.48, 0.025), [0, 0.2, 0])
  ]);
  const brass = combineRaw([
    place(box(1.52, 0.04, 1.52, 0.01), [0, 0.29, 0]),
    place(box(1.36, 0.05, 1.36, 0.012), [0, 0.88, 0])
  ]);
  return assembleSlots(
    "fc-trophy-plinth-collar",
    [
      { mesh: steps, material: FC_MAT.granitePlinth },
      { mesh: brass, material: FC_MAT.trophyGoldTrim }
    ],
    { position: [position[0], 0, position[2]], rotation: [0, rotY, 0], castShadow: true, receiveShadow: true }
  );
}

/**
 * Monumental 2.2 m European Championship Silver Cup (`fc-trophy-case`), local `minY = 0`
 * so `position[1] === 0.9` sits flush atop `fc-trophy-plinth` (`audit-fixes.test.ts` FC-19).
 */
export function buildChampionshipTrophyNode(position: V3, rotY: number, accentHex: string): AuraNodeBuilder<AuraGroupNode> {
  const basePedestal = latheMesh(
    [
      [0, 0],
      [0.42, 0],
      [0.4, 0.14],
      [0.33, 0.18],
      [0.31, 0.34],
      [0, 0.34]
    ],
    18
  );
  const goldBands = combineRaw([
    latheMesh([[0, 0.34], [0.33, 0.34], [0.33, 0.41], [0, 0.41]], 18),
    latheMesh([[0, 1.72], [0.46, 1.72], [0.48, 1.78], [0, 1.78]], 20),
    latheMesh([[0, 2.04], [0.09, 2.08], [0.07, 2.18], [0, 2.2]], 14)
  ]);
  const silverCup = latheMesh(
    [
      [0, 0.4],
      [0.24, 0.42],
      [0.14, 0.68],
      [0.17, 0.88],
      [0.36, 1.18],
      [0.48, 1.54],
      [0.44, 1.74],
      [0.34, 1.88],
      [0.14, 2.02],
      [0, 2.05]
    ],
    22
  );
  const handles: RawMesh[] = [];
  const ribbons: RawMesh[] = [];
  for (const s of [-1, 1] as const) {
    handles.push(
      tube(
        [
          [s * 0.28, 1.06, 0],
          [s * 0.62, 1.24, 0],
          [s * 0.72, 1.66, 0],
          [s * 0.56, 1.94, 0],
          [s * 0.36, 1.74, 0]
        ],
        [0.036, 0.044, 0.046, 0.04, 0.034],
        10,
        true
      )
    );
    ribbons.push(
      tube(
        [
          [s * 0.64, 1.78, 0.04],
          [s * 0.74, 1.42, 0.12],
          [s * 0.68, 1.04, 0.18]
        ],
        [0.032, 0.038, 0.024],
        6,
        true
      )
    );
  }

  return assembleSlots(
    "fc-trophy-case",
    [
      { mesh: basePedestal, material: FC_MAT.granitePlinth },
      { mesh: silverCup, material: FC_MAT.trophySterling },
      { mesh: goldBands, material: FC_MAT.trophyGoldTrim },
      { mesh: combineRaw(handles), material: FC_MAT.trophySterling },
      { mesh: combineRaw(ribbons), material: accentCarPaint("trophy ribbon", accentHex) }
    ],
    { position, rotation: [0, rotY, 0], castShadow: true, receiveShadow: true }
  );
}

/** Articulated behind-goal TV broadcast camera jib crane (`fc-camera-crane-w` / `fc-camera-crane-e`). */
export function buildBroadcastCraneNode(name: string, position: V3, yaw: number): AuraNodeBuilder<AuraGroupNode> {
  const baseLegs: RawMesh[] = [
    place(latheMesh([[0, 0], [0.44, 0], [0.36, 0.24], [0.22, 1.48], [0, 1.52]], 12), [0, 0, 0])
  ];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * TAU + Math.PI * 0.25;
    baseLegs.push(
      tube([[0, 0.42, 0], [Math.cos(a) * 1.15, 0.08, Math.sin(a) * 1.15]], 0.055, 7, true),
      place(box(0.26, 0.08, 0.26, 0.02), [Math.cos(a) * 1.18, 0.04, Math.sin(a) * 1.18])
    );
  }
  const jibBoom = combineRaw([
    place(
      latticeTrussMesh({ span: [0.34, 0.34, 5.8], bays: 6, chordRadius: 0.026, braceRadius: 0.015 }),
      [0, 2.35, 1.15],
      [-0.28, 0, 0]
    ),
    // Underslung 3-axis gimbal yoke
    tube([[0, 3.08, 3.72], [0, 2.52, 3.72], [0.22, 2.52, 3.72]], 0.03, 7, true)
  ]);
  const counterweights = combineRaw([
    place(box(0.54, 0.48, 0.42, 0.03), [0, 1.62, -1.48], [-0.28, 0, 0]),
    place(box(0.38, 0.3, 0.48, 0.025), [0, 2.52, 3.82])
  ]);
  const lensHood = combineRaw([
    place(box(0.32, 0.26, 0.2, 0.018), [0, 2.52, 4.12]),
    place(latheMesh([[0, 0], [0.11, 0], [0.13, 0.14], [0, 0.14]], 12), [0, 2.52, 4.02], [Math.PI * 0.5, 0, 0])
  ]);
  const tallyLed = place(box(0.08, 0.05, 0.05, 0.01), [0, 2.71, 3.96]);

  return assembleSlots(
    name,
    [
      { mesh: combineRaw(baseLegs), material: FC_MAT.darkSteel },
      { mesh: jibBoom, material: FC_MAT.anodizedSilver },
      { mesh: counterweights, material: FC_MAT.blackRubber },
      { mesh: lensHood, material: FC_MAT.stormNavyShell },
      { mesh: tallyLed, material: practicalGlow(`${name}-tally`, "#ff3b30", 1.5) }
    ],
    { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true }
  );
}

/** Batches west + east behind-goal TV broadcast jib cranes into one multi-material assembly. */
export function buildBroadcastCranesBatchedNode(
  placements: readonly { readonly pos: V3; readonly yaw: number }[]
): AuraNodeBuilder<AuraGroupNode> {
  const unit = memo("crane-unit-meshes", () => {
    const baseLegs: RawMesh[] = [
      place(latheMesh([[0, 0], [0.44, 0], [0.36, 0.24], [0.22, 1.48], [0, 1.52]], 12), [0, 0, 0])
    ];
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU + Math.PI * 0.25;
      baseLegs.push(
        tube([[0, 0.42, 0], [Math.cos(a) * 1.15, 0.08, Math.sin(a) * 1.15]], 0.055, 7, true),
        place(box(0.26, 0.08, 0.26, 0.02), [Math.cos(a) * 1.18, 0.04, Math.sin(a) * 1.18])
      );
    }
    const jibBoom = combineRaw([
      place(latticeTrussMesh({ span: [0.34, 0.34, 5.8], bays: 6, chordRadius: 0.026, braceRadius: 0.015 }), [0, 2.35, 1.15], [-0.28, 0, 0]),
      tube([[0, 3.08, 3.72], [0, 2.52, 3.72], [0.22, 2.52, 3.72]], 0.03, 7, true)
    ]);
    const counterweights = combineRaw([
      place(box(0.54, 0.48, 0.42, 0.03), [0, 1.62, -1.48], [-0.28, 0, 0]),
      place(box(0.38, 0.3, 0.48, 0.025), [0, 2.52, 3.82])
    ]);
    const lensHood = combineRaw([
      place(box(0.32, 0.26, 0.2, 0.018), [0, 2.52, 4.12]),
      place(latheMesh([[0, 0], [0.11, 0], [0.13, 0.14], [0, 0.14]], 12), [0, 2.52, 4.02], [Math.PI * 0.5, 0, 0])
    ]);
    const tallyLed = place(box(0.08, 0.05, 0.05, 0.01), [0, 2.71, 3.96]);
    return [combineRaw(baseLegs), jibBoom, counterweights, lensHood, tallyLed] as const;
  });
  const xform = (m: RawMesh) => combineRaw(placements.map(({ pos, yaw }) => place(m, pos, [0, yaw, 0])));
  return assembleSlots(
    "fc-camera-cranes",
    [
      { mesh: xform(unit[0]), material: FC_MAT.darkSteel },
      { mesh: xform(unit[1]), material: FC_MAT.anodizedSilver },
      { mesh: xform(unit[2]), material: FC_MAT.blackRubber },
      { mesh: xform(unit[3]), material: FC_MAT.stormNavyShell },
      { mesh: xform(unit[4]), material: practicalGlow("cranes-tally", "#ff3b30", 1.5) }
    ],
    { castShadow: false, receiveShadow: true }
  );
}

/** Telescopic arched stadium players' tunnel (`fc-player-tunnel`, `5.1 m` deep x `4.4 m` wide x `2.4 m` high). */
export function buildPlayerTunnelNode(position: V3, accentHex: string): AuraNodeBuilder<AuraGroupNode> {
  const halfD = 2.55;
  const archCount = 6;
  const hoops: RawMesh[] = [];
  const bellowsRings: V3[][] = [];

  for (let i = 0; i <= archCount; i += 1) {
    const z = -halfD + (i / archCount) * (halfD * 2);
    const pleat = i % 2 === 0 ? 1.0 : 0.95;
    const archPts: V3[] = [];
    for (let s = 0; s <= 10; s += 1) {
      const u = s / 10;
      const a = Math.PI * (1 - u);
      const rx = 2.15 * pleat;
      const y = s === 0 || s === 10 ? 0 : 1.15 + Math.sin(a) * 1.22 * pleat;
      const x = Math.cos(a) * rx;
      archPts.push([x, y, z]);
    }
    hoops.push(tube(archPts, 0.048, 8, true));

    const closedRing: V3[] = [...archPts];
    for (let k = archPts.length - 1; k >= 0; k -= 1) {
      const p = archPts[k]!;
      closedRing.push([p[0] * 0.94, Math.max(0, p[1] - 0.07), z]);
    }
    bellowsRings.push(closedRing);
  }
  const bellowsShell = loftSectionsMesh(bellowsRings, true, true);
  const floorRunner = place(box(3.9, 0.06, halfD * 2, 0.015), [0, 0.03, 0]);
  const portalFascia = combineRaw([
    place(box(4.56, 0.28, 0.24, 0.03), [0, 2.34, halfD]),
    place(box(0.24, 2.34, 0.24, 0.025), [-2.16, 1.17, halfD]),
    place(box(0.24, 2.34, 0.24, 0.025), [2.16, 1.17, halfD])
  ]);
  const portalGlow = place(box(3.8, 0.08, 0.06, 0.01), [0, 2.34, halfD + 0.11]);

  return assembleSlots(
    "fc-player-tunnel",
    [
      { mesh: bellowsShell, material: FC_MAT.tunnelBellowsFabric },
      { mesh: combineRaw(hoops), material: FC_MAT.anodizedSilver },
      { mesh: floorRunner, material: FC_MAT.blackRubber },
      { mesh: portalFascia, material: FC_MAT.stormNavyShell },
      { mesh: portalGlow, material: practicalGlow("tunnel portal led", accentHex, 1.25) }
    ],
    { position, castShadow: true, receiveShadow: true }
  );
}

/**
 * Twin-leg `latticeTrussMesh` scoreboard portal gantry (`fc-gantry`) positioned at `[0, 5.4, -(PITCH_HZ + 9.5)]`.
 * Frames `fc-scoreboard-screen` (`9.5 x 3.1 m` at `[0, 7.2, -(PITCH_HZ + 9.2)]`) cleanly from behind.
 */
export function buildScoreboardGantryNode(position: V3, accentHex: string): AuraNodeBuilder<AuraGroupNode> {
  const [footings, trussSteel, bezelTrim, headerAccent] = memo("gantry-meshes", () => {
    const ts = combineRaw([
      place(latticeTrussMesh({ span: [0.85, 9.4, 0.85], bays: 4, chordRadius: 0.048, braceRadius: 0.028 }), [-5.35, -0.7, -0.35]),
      place(latticeTrussMesh({ span: [0.85, 9.4, 0.85], bays: 4, chordRadius: 0.048, braceRadius: 0.028 }), [5.35, -0.7, -0.35]),
      place(latticeTrussMesh({ span: [11.6, 0.82, 0.9], bays: 5, chordRadius: 0.046, braceRadius: 0.026 }), [0, 3.85, -0.25]),
      place(latticeTrussMesh({ span: [10.4, 0.55, 0.72], bays: 4, chordRadius: 0.038, braceRadius: 0.022 }), [0, -0.05, -0.35])
    ]);
    const ft = combineRaw([
      place(box(1.45, 0.65, 1.45, 0.05), [-5.35, -5.075, -0.35]),
      place(box(1.45, 0.65, 1.45, 0.05), [5.35, -5.075, -0.35])
    ]);
    const bz = combineRaw([
      place(box(10.05, 0.22, 0.44, 0.03), [0, 3.42, 0.25]),
      place(box(10.05, 0.22, 0.44, 0.03), [0, 0.18, 0.25]),
      place(box(0.24, 3.46, 0.44, 0.03), [-4.9, 1.8, 0.25]),
      place(box(0.24, 3.46, 0.44, 0.03), [4.9, 1.8, 0.25])
    ]);
    const ha = place(box(6.4, 0.12, 0.08, 0.015), [0, 3.44, 0.48]);
    return [ft, ts, bz, ha] as const;
  });

  return assembleSlots(
    "fc-gantry",
    [
      { mesh: footings, material: FC_MAT.concreteBase },
      { mesh: trussSteel, material: FC_MAT.darkSteel },
      { mesh: bezelTrim, material: FC_MAT.anodizedSilver },
      { mesh: headerAccent, material: practicalGlow("gantry crest strip", accentHex, 1.2) }
    ],
    { position, castShadow: false, receiveShadow: true }
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Stadium Bowl, Instanced Supporter & Glacier Arch Dome Assemblies        */
/* -------------------------------------------------------------------------- */

/** Stepped 3-riser concrete terrace geometry in `[-0.5, 0.5]^3` unit bounds for `fc-stands`. */
export function buildStandTierGeometry(): AuraCustomGeometrySpec {
  return memo("stand-tier-geom", () => {
    const poly: V2[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, -0.14],
      [0.18, -0.14],
      [0.18, 0.18],
      [-0.16, 0.18],
      [-0.16, 0.5],
      [-0.5, 0.5]
    ];
    const stepped = extrudePolygonMesh(poly, 1.0, 0.018, true);
    return mergeRawMeshes([place(stepped, [0, 0, 0], [0, Math.PI * 0.5, 0])]);
  });
}

/** Flanged structural steel I-beam / box-truss member in `[-0.5, 0.5]^3` unit bounds for `fc-roof-trusses`. */
export function buildRoofTrussGeometry(): AuraCustomGeometrySpec {
  return memo("roof-truss-geom", () =>
    mergeRawMeshes([
      box(1.0, 0.16, 1.0, 0.015),
      place(box(1.0, 0.16, 1.0, 0.015), [0, 0.42, 0]),
      place(box(1.0, 0.16, 1.0, 0.015), [0, -0.42, 0]),
      box(0.28, 0.96, 0.28, 0.015)
    ])
  );
}

/**
 * Multi-material upper stadium bowl, grounded steel support columns & cantilevered VIP canopy (`fc-stadium-bowl`),
 * spanning all 4 far-deck bays with integrated roof trusses in one grouped multi-material assembly.
 */
export function buildStadiumBowlUpperNode(standCount: number, accentHex: string): AuraNodeBuilder<AuraGroupNode> {
  const s = 10.5;
  const topTier = Math.max(0, standCount - 1);
  const zCenter = standCount > 0 ? -(PITCH_HZ + 4.6 + topTier * 2.2 + 1 + 0.272 * s) : -(PITCH_HZ + 6 + 0.272 * s);
  const baseY = (standCount > 0 ? 0.9 + topTier * 1.3 - 1.2 : -0.5) + 0.42 * s;
  const deckY = Math.max(2.6, baseY);
  const wBay = 1.9 * s;
  const totalW = wBay * 4;

  const [rakerMesh, roofDeck, vipGlazing, vipWarmStrip, fasciaRibbon] = memo(`stadium-bowl-meshes:${standCount}`, () => {
    const rakerConcrete: RawMesh[] = [
      place(box(totalW, 1.35, 5.2, 0.08), [0, -1.65, -0.4]),
      place(box(totalW, 1.15, 3.8, 0.07), [0, -0.45, -1.0]),
      place(box(totalW, 1.15, 2.4, 0.07), [0, 0.65, -1.65])
    ];
    const vg = place(box(totalW - 1.6, 1.25, 0.22, 0.02), [0, 1.85, -1.25]);
    const vw = place(box(totalW - 2.4, 0.14, 0.35, 0.015), [0, 2.38, -1.45]);
    // Integrate vertical I-beam support columns + concourse fascia beams grounding `y = 0` directly into darkSteel!
    const steelParts: RawMesh[] = [
      place(box(totalW + 1.8, 0.36, 8.6, 0.05), [0, 3.35, 1.35], [0.09, 0, 0]),
      ...[-1.5, -0.5, 0.5, 1.5, 2.0, -2.0].map((k) =>
        place(latticeTrussMesh({ span: [0.48, 0.62, 8.4], bays: 4, chordRadius: 0.04, braceRadius: 0.024 }), [k * wBay * 0.96, 2.95, 1.25], [0.09, 0, 0])
      ),
      ...[-2, -1, 0, 1, 2].flatMap((idx) => [
        place(box(0.55, deckY * 1.04, 0.55, 0.03), [idx * wBay, deckY * 0.52 - baseY, -1.6]),
        place(box(0.42, deckY * 0.88, 0.42, 0.025), [idx * wBay, deckY * 0.44 - baseY, 1.4])
      ]),
      place(box(totalW + 1.2, 0.65, 0.7, 0.04), [0, Math.max(1.1, deckY - 2.3) - baseY, 1.5]),
      place(box(totalW + 2.0, 0.42, 3.6, 0.04), [0, deckY + 2.85 - baseY, -0.3]),
      place(box(totalW + 1.2, deckY, 0.35, 0.03), [0, Math.max(0.7, deckY * 0.5) - baseY, -2.0])
    ];
    const fr = place(box(totalW + 1.8, 0.22, 0.18, 0.02), [0, 3.74, 5.58]);
    return [combineRaw(rakerConcrete), combineRaw(steelParts), vg, vw, fr] as const;
  });

  return assembleSlots(
    "fc-stadium-bowl",
    [
      { mesh: rakerMesh, material: FC_MAT.concreteBase },
      { mesh: roofDeck, material: FC_MAT.darkSteel },
      { mesh: vipGlazing, material: FC_MAT.polycarbonateRoof },
      { mesh: vipWarmStrip, material: practicalGlow("vip lounge warm", "#ffd996", 0.95) },
      { mesh: fasciaRibbon, material: accentCarPaint("bowl roof fascia", accentHex) }
    ],
    {
      id: "fc-stadium-bowl",
      position: [0, baseY, zCenter],
      castShadow: false,
      receiveShadow: true
    }
  );
}

/**
 * Connected 5-slot articulated stadium supporter geometries (`y = 0..1.68 m`) built via `articulatedFolkSlots`
 * and `mergeRawMeshes` — zero detached floating head/shoulder orbs, 1 instanced draw call per material slot!
 */
export interface SupporterCrowdSlotGeometries {
  readonly coat: AuraCustomGeometrySpec;
  readonly scarfTrim: AuraCustomGeometrySpec;
  readonly skin: AuraCustomGeometrySpec;
  readonly hairHat: AuraCustomGeometrySpec;
  readonly lower: AuraCustomGeometrySpec;
}

export function buildSupporterCrowdSlotGeometries(): SupporterCrowdSlotGeometries {
  return memo("supporter-folk-slots", () => {
    const slots = articulatedFolkSlots({
      height: 1.68,
      coatMat: 0,
      trimMat: 1,
      skinMat: 2,
      hairHatMat: 3,
      trouserMat: 4,
      shoeMat: 4,
      wearingHat: true,
      seed: 19
    });
    const bySlot = (idx: number): AuraCustomGeometrySpec =>
      mergeRawMeshes(slots.filter((s) => s.materialIndex === idx).map((s) => s.mesh));
    return {
      coat: bySlot(0),
      scarfTrim: bySlot(1),
      skin: bySlot(2),
      hairHat: bySlot(3),
      lower: bySlot(4)
    };
  });
}

/** Sculpted supporter jersey/coat + sleeves (`articulatedFolkSlots` slot 0) for `fc-crowd`. */
export function buildSupporterTorsoGeometry(): AuraCustomGeometrySpec {
  return buildSupporterCrowdSlotGeometries().coat;
}

/** Connected supporter neck + head + hands (`articulatedFolkSlots` slot 2) for `fc-crowd-heads`. */
export function buildSupporterHeadGeometry(): AuraCustomGeometrySpec {
  return buildSupporterCrowdSlotGeometries().skin;
}

/** Connected supporter club collar scarf + belt trim (`articulatedFolkSlots` slot 1) for `fc-crowd-scarves`. */
export function buildSupporterScarfGeometry(): AuraCustomGeometrySpec {
  return buildSupporterCrowdSlotGeometries().scarfTrim;
}

/**
 * Cheering front-row articulated supporter (`y = 0..1.84 m`) for `fc-wavers`:
 * Built from `articulatedFolkSlots` + seamlessly shoulder-connected raised arms holding an arched club scarf aloft.
 */
export function buildWaverSupporterGeometry(): AuraCustomGeometrySpec {
  return memo("waver-supporter-geom", () => {
    const baseParts = articulatedFolkSlots({
      height: 1.7,
      coatMat: 0,
      trimMat: 0,
      skinMat: 0,
      hairHatMat: 0,
      trouserMat: 0,
      shoeMat: 0,
      wearingHat: false,
      seed: 31
    }).map((s) => s.mesh);
    const scarfSections: V3[][] = [];
    for (let i = 0; i <= 6; i += 1) {
      const u = i / 6;
      const sx = (u - 0.5) * 0.58;
      const sy = 1.74 + Math.sin(u * Math.PI) * 0.1;
      scarfSections.push([
        [sx, sy - 0.045, 0.08],
        [sx, sy + 0.045, 0.08],
        [sx, sy + 0.045, 0.13],
        [sx, sy - 0.045, 0.13]
      ]);
    }
    return mergeRawMeshes([
      ...baseParts,
      tube([[-0.21, 1.27, 0.01], [-0.3, 1.52, 0.06], [-0.27, 1.74, 0.1]], [0.056, 0.05, 0.044], 8, true),
      tube([[0.21, 1.27, 0.01], [0.3, 1.52, 0.06], [0.27, 1.74, 0.1]], [0.056, 0.05, 0.044], 8, true),
      loftSectionsMesh(scarfSections, true, true)
    ]);
  });
}

/** Nordic glulam-and-steel arch arena roof (`fc-dome`), parked hidden until `applyVenue` activates it. */
export function buildGlacierArchDomeNode(hiddenScale = 0.0001): AuraNodeBuilder<AuraGroupNode> {
  const spanX = 44;
  const spanZ = 34;
  const apexY = 26;
  const timberArches: RawMesh[] = [];
  const steelPurlins: RawMesh[] = [];
  const skylightBays: RawMesh[] = [];

  const zBays = [-24, -12, 0, 12, 24];
  for (const bz of zBays) {
    const pts: V3[] = [];
    for (let s = 0; s <= 14; s += 1) {
      const a = (s / 14) * Math.PI;
      pts.push([-Math.cos(a) * spanX, Math.sin(a) * apexY, bz]);
    }
    timberArches.push(tube(pts, 0.42, 8, true));
  }
  for (const angFrac of [0.22, 0.38, 0.5, 0.62, 0.78]) {
    const a = angFrac * Math.PI;
    const px = -Math.cos(a) * spanX;
    const py = Math.sin(a) * apexY;
    steelPurlins.push(tube([[px, py, -spanZ], [px, py, spanZ]], 0.22, 6, true));
  }
  skylightBays.push(place(box(26, 0.18, 46, 0.04), [0, apexY - 0.65, 0]));

  return assembleSlots(
    "fc-dome",
    [
      { mesh: combineRaw(timberArches), material: material.matteClay({ name: "nordic glulam timber", color: "#8c5d38", roughness: 0.72 }) },
      { mesh: combineRaw(steelPurlins), material: FC_MAT.darkSteel },
      { mesh: combineRaw(skylightBays), material: FC_MAT.polycarbonateRoof }
    ],
    {
      id: "fc-dome",
      position: [0, -90, 0],
      scale: [hiddenScale, hiddenScale, hiddenScale],
      castShadow: false,
      receiveShadow: false
    }
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Bespoke Multi-Material Architectural Backdrops for All 6 Venues         */
/* -------------------------------------------------------------------------- */

/** Helper: curved inflated ETFE pillow panel (`loftSectionsMesh` domed diamond/cushion). */
function buildEtfePillowMesh(width: number, height: number, bulge = 0.75): RawMesh {
  const sections: V3[][] = [];
  for (let i = 0; i <= 4; i += 1) {
    const v = i / 4;
    const y = (v - 0.5) * height;
    const vSin = Math.sin(v * Math.PI);
    const wScale = 0.86 + vSin * 0.14;
    const zB = vSin * bulge;
    const hw = width * 0.5 * wScale;
    sections.push([
      [-hw, y, 0],
      [0, y, zB],
      [hw, y, 0],
      [0, y, -zB * 0.35]
    ]);
  }
  return loftSectionsMesh(sections, true, true);
}

/** Munich: Inflated ETFE cushion stadium bowl shell, diagrid steel ribs & illuminated roof ring. */
function buildMunichBackdropNodes(accentHex: string): AuraNodeBuilder<AuraSceneNode>[] {
  const pillows: RawMesh[] = [];
  const diagrid: RawMesh[] = [];
  const innerGlow: RawMesh[] = [];

  // Curved outer bowl arc behind far stand & stadium corners
  const bays = 11;
  for (let i = 0; i < bays; i += 1) {
    const u = i / (bays - 1) - 0.5;
    const bx = u * 82;
    const curveZ = -(PITCH_HZ + 18.5) + u * u * 11;
    const yaw = -u * 0.42;
    for (let tier = 0; tier < 2; tier += 1) {
      const py = 5.4 + tier * 5.2;
      pillows.push(place(buildEtfePillowMesh(7.1, 4.6, 0.85), [bx, py, curveZ - tier * 0.6], [-0.14, yaw, 0]));
      innerGlow.push(place(box(4.8, 0.24, 0.14, 0.02), [bx, py, curveZ - 0.55 - tier * 0.6], [0, yaw, 0]));
    }
    diagrid.push(
      tube([[bx - 3.6, 2.4, curveZ + 0.4], [bx + 3.6, 13.4, curveZ - 1.1]], 0.09, 6, true),
      tube([[bx + 3.6, 2.4, curveZ + 0.4], [bx - 3.6, 13.4, curveZ - 1.1]], 0.09, 6, true)
    );
  }
  // Illuminated upper ETFE roof ring & cantilevered drip beam
  const roofRingPts: V3[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const u = i / 14 - 0.5;
    roofRingPts.push([u * 88, 14.2, -(PITCH_HZ + 15.2) + u * u * 10]);
  }
  diagrid.push(tube(roofRingPts, 0.28, 8, true));
  innerGlow.push(tube(roofRingPts.map((p) => [p[0], p[1] - 0.34, p[2] + 0.32]), 0.11, 6, true));

  return [
    assembleSlots(
      "fc-venue-munich-etfe-bowl",
      [
        { mesh: combineRaw(diagrid), material: FC_MAT.anodizedSilver },
        { mesh: combineRaw(innerGlow), material: practicalGlow("munich etfe ring", "#6ad4ff", 1.15) },
        { mesh: combineRaw(pillows), material: FC_MAT.etfePillow }
      ],
      { castShadow: false, receiveShadow: true }
    ),
    // Accent corner pylons flanking the stadium bowl
    assembleSlots(
      "fc-venue-munich-pylons",
      [
        {
          mesh: combineRaw([
            place(latticeTrussMesh({ span: [1.6, 15.5, 1.6], bays: 8, chordRadius: 0.07, braceRadius: 0.04 }), [-44, 7.75, -(PITCH_HZ + 13.5)]),
            place(latticeTrussMesh({ span: [1.6, 15.5, 1.6], bays: 8, chordRadius: 0.07, braceRadius: 0.04 }), [44, 7.75, -(PITCH_HZ + 13.5)])
          ]),
          material: FC_MAT.darkSteel
        },
        {
          mesh: combineRaw([
            place(box(1.8, 0.4, 1.8, 0.04), [-44, 15.6, -(PITCH_HZ + 13.5)]),
            place(box(1.8, 0.4, 1.8, 0.04), [44, 15.6, -(PITCH_HZ + 13.5)])
          ]),
          material: practicalGlow("munich crest beacon", accentHex, 1.2)
        }
      ],
      { castShadow: false, receiveShadow: false }
    )
  ];
}

/** Glacier: Nordic timber-and-steel ski-jump inrun arena, jagged stratified alpine peaks & snow spruces. */
function buildGlacierBackdropNodes(accentHex: string): AuraNodeBuilder<AuraSceneNode>[] {
  // Sweeping Nordic ski-jump inrun ramp + start house on the northwest ridge
  const rampSections: V3[][] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const rx = -34 + t * 24;
    const ry = 23.5 * Math.pow(1 - t, 1.65) + 3.2;
    const rz = -(PITCH_HZ + 24) + t * 4.5;
    rampSections.push([
      [rx, ry, rz - 1.9],
      [rx, ry + 0.45, rz - 2.05],
      [rx, ry + 0.18, rz],
      [rx, ry + 0.45, rz + 2.05],
      [rx, ry, rz + 1.9],
      [rx, ry - 0.55, rz]
    ]);
  }
  const skiRampSnow = loftSectionsMesh(rampSections, true, true);
  const skiTowerSteel = combineRaw([
    place(latticeTrussMesh({ span: [3.2, 24.5, 3.2], bays: 9, chordRadius: 0.09, braceRadius: 0.05 }), [-34.5, 12.25, -(PITCH_HZ + 24)]),
    place(latticeTrussMesh({ span: [2.2, 12.5, 2.2], bays: 5, chordRadius: 0.07, braceRadius: 0.04 }), [-22, 6.25, -(PITCH_HZ + 21.8)])
  ]);
  const skiTimber = combineRaw([
    place(box(5.4, 3.2, 4.8, 0.08), [-34.5, 25.2, -(PITCH_HZ + 24)]),
    tube([[-34, 22.8, -(PITCH_HZ + 24)], [-22, 11.4, -(PITCH_HZ + 21.8)], [-10, 3.2, -(PITCH_HZ + 19.5)]], 0.34, 8, true)
  ]);
  const skiBeacon = place(box(4.6, 0.45, 0.16, 0.02), [-34.5, 25.4, -(PITCH_HZ + 21.5)]);

  // Jagged alpine peaks across the polar horizon
  const alpineCliffs = combineRaw([
    place(stratifiedCliffMesh({ radiusX: 18, radiusZ: 12, height: 29, terraces: 6, seed: 31 }), [-42, -0.5, -(PITCH_HZ + 38)]),
    place(stratifiedCliffMesh({ radiusX: 22, radiusZ: 14, height: 34, terraces: 7, seed: 47 }), [6, -0.5, -(PITCH_HZ + 42)]),
    place(stratifiedCliffMesh({ radiusX: 19, radiusZ: 13, height: 27, terraces: 6, seed: 63 }), [44, -0.5, -(PITCH_HZ + 37)])
  ]);
  const alpineStrataMat = pairedStrataMaterial({
    colors: ["#2d3a4b", "#516278", "#dce9f7", "#3a495e", "#eef6ff"],
    heightRange: [0, 34],
    bands: 11,
    roughness: 0.76,
    slope: { flatColor: "#eef6ff", angle: 42, blend: 16 }
  });

  // Snow-laden Nordic spruces flanking the arena apron
  const trunks: RawMesh[] = [];
  const boughs: RawMesh[] = [];
  for (const [tx, tz, th, sd] of [
    [-46, -(PITCH_HZ + 16), 8.2, 11],
    [-39, -(PITCH_HZ + 17.5), 7.4, 19],
    [32, -(PITCH_HZ + 19), 8.6, 23],
    [41, -(PITCH_HZ + 16.5), 7.8, 29],
    [48, -(PITCH_HZ + 18.5), 9.1, 37]
  ] as const) {
    trunks.push(tube([[tx, 0, tz], [tx, th * 0.35, tz]], 0.24, 7, true));
    boughs.push(place(coniferBoughTierMesh({ baseRadius: 2.1, height: th, tiers: 5, seed: sd }), [tx, th * 0.16, tz]));
  }

  return [
    geometry.custom(mergeRawMeshes([alpineCliffs]), {
      name: "fc-venue-glacier-peaks",
      material: alpineStrataMat,
      castShadow: false,
      receiveShadow: false
    }),
    assembleSlots(
      "fc-venue-glacier-skijump",
      [
        { mesh: skiTowerSteel, material: FC_MAT.darkSteel },
        { mesh: skiTimber, material: material.matteClay({ name: "glacier larch timber", color: "#8b5a34", roughness: 0.74 }) },
        { mesh: skiRampSnow, material: FC_MAT.goalPostWhite },
        { mesh: skiBeacon, material: practicalGlow("glacier start house glow", accentHex, 1.25) }
      ],
      { castShadow: false, receiveShadow: true }
    ),
    assembleSlots(
      "fc-venue-glacier-spruces",
      [
        { mesh: combineRaw(trunks), material: material.matteClay({ name: "spruce bark", color: "#4a3322", roughness: 0.9 }) },
        { mesh: combineRaw(boughs), material: material.matteClay({ name: "frosted spruce needles", color: "#2c4c48", roughness: 0.82 }) }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Helper: upturned Japanese kawara-tile curved roof eave (`loftSectionsMesh`). */
function buildCurvedKawaraRoofMesh(width: number, depth: number, rise: number): RawMesh {
  const sections: V3[][] = [];
  for (let i = 0; i <= 6; i += 1) {
    const u = i / 6 - 0.5;
    const x = u * width;
    const flare = Math.pow(Math.abs(u) * 2, 2.2) * 0.65;
    const hd = depth * 0.5 + flare * 0.45;
    sections.push([
      [x, flare, -hd],
      [x, rise + flare * 0.35, 0],
      [x, flare, hd],
      [x, flare - 0.16, hd * 0.94],
      [x, rise * 0.72, 0],
      [x, flare - 0.16, -hd * 0.94]
    ]);
  }
  return loftSectionsMesh(sections, true, true);
}

/** Kyoto: Multi-tier curved kawara-tile pavilion stands, 5-tier pagoda, lanterns & sakura/maple trees. */
function buildKyotoBackdropNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const kawaraRoofs: RawMesh[] = [];
  const vermilionTimber: RawMesh[] = [];
  const goldFinials: RawMesh[] = [];
  const lanterns: RawMesh[] = [];

  // 3 sweeping curved kawara pavilion roofs behind the far stand + 5-tier pagoda on the east ridge
  for (const [px, pz, pw] of [[-24, -(PITCH_HZ + 15.5), 22], [0, -(PITCH_HZ + 17.5), 24], [24, -(PITCH_HZ + 15.5), 22]] as const) {
    kawaraRoofs.push(
      place(buildCurvedKawaraRoofMesh(pw, 6.2, 2.1), [px, 7.2, pz]),
      place(buildCurvedKawaraRoofMesh(pw * 0.84, 5.0, 1.8), [px, 10.6, pz - 0.6])
    );
    goldFinials.push(place(box(pw * 0.8, 0.18, 0.22, 0.03), [px, 12.55, pz - 0.6]));
    for (const cx of [-pw * 0.38, -pw * 0.14, pw * 0.14, pw * 0.38]) {
      vermilionTimber.push(tube([[px + cx, 0, pz + 1.4], [px + cx, 10.5, pz + 1.1]], 0.2, 8, true));
    }
    lanterns.push(
      place(latheMesh([[0, 0], [0.24, 0.08], [0.32, 0.42], [0.24, 0.76], [0, 0.84]], 10), [px - pw * 0.26, 6.15, pz + 2.5]),
      place(latheMesh([[0, 0], [0.24, 0.08], [0.32, 0.42], [0.24, 0.76], [0, 0.84]], 10), [px + pw * 0.26, 6.15, pz + 2.5])
    );
  }
  // 5-tier pagoda tower at `[39, 0, -(PITCH_HZ + 22)]`
  const pgX = 39;
  const pgZ = -(PITCH_HZ + 22);
  for (let t = 0; t < 5; t += 1) {
    const s = 1 - t * 0.13;
    const py = 2.8 + t * 3.1;
    vermilionTimber.push(place(box(5.2 * s, 2.7, 5.2 * s, 0.06), [pgX, py - 1.2, pgZ]));
    kawaraRoofs.push(place(buildCurvedKawaraRoofMesh(7.6 * s, 7.6 * s, 1.45), [pgX, py, pgZ]));
  }
  goldFinials.push(tube([[pgX, 16.5, pgZ], [pgX, 20.4, pgZ]], [0.16, 0.05], 8, true));

  // Cherry blossom (sakura) & autumn crimson maple (momiji) trees
  const trunks: RawMesh[] = [];
  const sakuraCanopies: RawMesh[] = [];
  const mapleCanopies: RawMesh[] = [];
  const treeSpots = [
    [-43, -(PITCH_HZ + 13), true, 13],
    [-36, -(PITCH_HZ + 16), false, 21],
    [34, -(PITCH_HZ + 14), true, 33],
    [45, -(PITCH_HZ + 15), false, 41]
  ] as const;
  for (const [tx, tz, isSakura, sd] of treeSpots) {
    trunks.push(
      tube([[tx, 0, tz], [tx + 0.25, 2.1, tz - 0.1], [tx - 0.15, 4.1, tz + 0.15]], [0.34, 0.24, 0.15], 7, true)
    );
    const canopy = place(layeredCanopyMesh({ radius: 3.3, height: 3.4, puffs: 9, seed: sd }), [tx, 3.6, tz]);
    if (isSakura) sakuraCanopies.push(canopy);
    else mapleCanopies.push(canopy);
  }

  return [
    assembleSlots(
      "fc-venue-kyoto-pavilions",
      [
        { mesh: combineRaw(kawaraRoofs), material: material.ceramic({ name: "kawara glazed roof tile", color: "#232a35", roughness: 0.34 }) },
        { mesh: combineRaw(vermilionTimber), material: material.lacquer({ name: "kyoto vermilion pillar", color: "#b63228", roughness: 0.24, clearcoat: 0.72, clearcoatRoughness: 0.14 }) },
        { mesh: combineRaw(goldFinials), material: FC_MAT.trophyGoldTrim },
        { mesh: combineRaw(lanterns), material: practicalGlow("kyoto chochin lantern", "#ffb668", 1.35) }
      ],
      { castShadow: false, receiveShadow: true }
    ),
    assembleSlots(
      "fc-venue-kyoto-trees",
      [
        { mesh: combineRaw(trunks), material: material.matteClay({ name: "kyoto cedar bark", color: "#4d3526", roughness: 0.88 }) },
        { mesh: combineRaw(sakuraCanopies), material: material.matteClay({ name: "sakura blossom crown", color: "#f2b8cc", roughness: 0.78 }) },
        { mesh: combineRaw(mapleCanopies), material: material.matteClay({ name: "momiji crimson crown", color: "#c93b2b", roughness: 0.78 }) }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Lagos: Vibrant angled sun-louvre canopy stands, coastal palm colonnades & Marina skyline towers. */
function buildLagosBackdropNodes(accentHex: string): AuraNodeBuilder<AuraSceneNode>[] {
  const rakerSteel: RawMesh[] = [];
  const louvreGold: RawMesh[] = [];
  const louvreTeal: RawMesh[] = [];
  for (let b = -3; b <= 3; b += 1) {
    const bx = b * 10.5;
    const bz = -(PITCH_HZ + 13.8);
    rakerSteel.push(
      tube([[bx, 0, bz - 2.2], [bx, 9.4, bz - 1.6], [bx, 10.8, bz + 3.2]], [0.22, 0.18, 0.13], 7, true)
    );
    for (let l = 0; l < 6; l += 1) {
      const blade = place(box(9.8, 0.12, 0.72, 0.02), [bx, 9.55 + l * 0.22, bz - 1.1 + l * 0.72], [0.28, 0, 0]);
      if ((b + l) % 2 === 0) louvreGold.push(blade);
      else louvreTeal.push(blade);
    }
  }

  // Coastal palm colonnade + Marina / Victoria Island skyline towers
  const palmTrunks: RawMesh[] = [];
  const palmFronds: RawMesh[] = [];
  for (let i = 0; i < 8; i += 1) {
    const px = -44 + i * 12.6;
    const pz = -(PITCH_HZ + 19.5) - (i % 2) * 2.4;
    const lean = (i % 2 === 0 ? 1 : -1) * 0.85;
    palmTrunks.push(tube([[px, 0, pz], [px + lean * 0.5, 4.6, pz + 0.3], [px + lean, 8.8, pz + 0.5]], [0.3, 0.21, 0.14], 7, true));
    for (let f = 0; f < 7; f += 1) {
      const a = (f / 7) * TAU + i * 0.4;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      palmFronds.push(
        tube(
          [
            [px + lean, 8.8, pz + 0.5],
            [px + lean + cx * 1.9, 9.35, pz + 0.5 + cz * 1.9],
            [px + lean + cx * 3.3, 8.05, pz + 0.5 + cz * 3.3]
          ],
          [0.12, 0.16, 0.04],
          5,
          true
        )
      );
    }
  }

  const towersConcrete: RawMesh[] = [];
  const towersGlass: RawMesh[] = [];
  const towerBeacons: RawMesh[] = [];
  for (const [tx, tz, tw, th] of [
    [-38, -(PITCH_HZ + 34), 6.8, 26],
    [-19, -(PITCH_HZ + 38), 7.6, 33],
    [4, -(PITCH_HZ + 40), 8.4, 38],
    [24, -(PITCH_HZ + 36), 7.2, 29],
    [41, -(PITCH_HZ + 33), 6.4, 24]
  ] as const) {
    towersConcrete.push(place(box(tw, th, tw * 0.78, 0.12), [tx, th * 0.5, tz]));
    towersGlass.push(place(box(tw * 0.86, th * 0.84, tw * 0.82, 0.06), [tx, th * 0.5 + 0.6, tz]));
    towerBeacons.push(place(box(tw * 0.55, 0.35, 0.24, 0.02), [tx, th + 0.2, tz + tw * 0.36]));
  }

  return [
    assembleSlots(
      "fc-venue-lagos-louvres",
      [
        { mesh: combineRaw(rakerSteel), material: FC_MAT.darkSteel },
        { mesh: combineRaw(louvreGold), material: accentCarPaint("lagos sun louvre gold", accentHex) },
        { mesh: combineRaw(louvreTeal), material: material.carPaint({ name: "lagos lagoon louvre", color: "#15857a", roughness: 0.24, clearcoat: 0.78 }) }
      ],
      { castShadow: false, receiveShadow: true }
    ),
    assembleSlots(
      "fc-venue-lagos-palms-skyline",
      [
        { mesh: combineRaw(palmTrunks), material: material.matteClay({ name: "coconut palm trunk", color: "#6f4e36", roughness: 0.86 }) },
        { mesh: combineRaw(palmFronds), material: material.matteClay({ name: "coastal palm frond", color: "#2d6e38", roughness: 0.72 }) },
        { mesh: combineRaw(towersConcrete), material: material.matteClay({ name: "marina limestone tower", color: "#d8cbb8", roughness: 0.68 }) },
        { mesh: combineRaw(towersGlass), material: FC_MAT.polycarbonateRoof },
        { mesh: combineRaw(towerBeacons), material: practicalGlow("marina crown light", "#ffd27d", 1.15) }
      ],
      { castShadow: false, receiveShadow: false }
    )
  ];
}

/**
 * Favela: Terraced pastel hillside houses, blue rooftop water tanks, festoon string lights,
 * and distant Corcovado / Christ-peak granite horizon.
 * Strictly outside pitch bounds and `z` well clear of `[-3.8, 3.8]` goal mouths!
 */
function buildFavelaBackdropNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const stuccoCoral: RawMesh[] = [];
  const stuccoOchre: RawMesh[] = [];
  const stuccoTeal: RawMesh[] = [];
  const tinRoofs: RawMesh[] = [];
  const waterTanks: RawMesh[] = [];
  const warmWindows: RawMesh[] = [];

  const tankProto = latheMesh([[0, 0], [0.62, 0], [0.68, 0.78], [0.72, 0.84], [0.58, 0.96], [0, 0.98]], 12);

  // Stepped hillside rows strictly behind the far north cage (`z <= -(PITCH_HZ + 6.8)`)
  for (let row = 0; row < 3; row += 1) {
    const count = 11;
    for (let i = 0; i < count; i += 1) {
      const seed = row * 31 + i * 17;
      const hx = -34 + i * 6.8 + (hash01(seed) - 0.5) * 1.1;
      const hz = -(PITCH_HZ + 7.4 + row * 5.4) + (hash01(seed + 3) - 0.5) * 0.9;
      const baseY = row * 3.2;
      const h = 3.6 + hash01(seed + 7) * 2.1;
      const w = 4.6 + hash01(seed + 11) * 1.2;
      const d = 4.1;
      const body = place(box(w, h + baseY, d, 0.06), [hx, (h + baseY) * 0.5, hz]);
      const bucket = (i + row) % 3;
      if (bucket === 0) stuccoCoral.push(body);
      else if (bucket === 1) stuccoOchre.push(body);
      else stuccoTeal.push(body);

      tinRoofs.push(place(box(w + 0.36, 0.14, d + 0.42, 0.02), [hx, baseY + h + 0.08, hz], [0.08, 0, 0]));
      warmWindows.push(place(box(0.85, 0.72, 0.08, 0.01), [hx - w * 0.2, baseY + h * 0.62, hz + d * 0.5 + 0.03]));
      if ((i + row) % 2 === 0) {
        waterTanks.push(place(tankProto, [hx + w * 0.2, baseY + h + 0.14, hz - 0.3]));
      }
    }
  }

  // Catenary festoon string lights high above the north street apron (`z = -(PITCH_HZ + 4.8)`)
  const cables: RawMesh[] = [];
  const bulbs: RawMesh[] = [];
  for (let span = -2; span <= 1; span += 1) {
    const x0 = span * 15;
    const x1 = (span + 1) * 15;
    const pts: V3[] = [];
    for (let s = 0; s <= 8; s += 1) {
      const u = s / 8;
      const sag = Math.sin(u * Math.PI) * 0.85;
      const bx = x0 + (x1 - x0) * u;
      const by = 6.2 - sag;
      const bz = -(PITCH_HZ + 4.9);
      pts.push([bx, by, bz]);
      if (s > 0 && s < 8) bulbs.push(place(icosphereFacetMesh(0.11, 0, 0, s), [bx, by - 0.08, bz]));
    }
    cables.push(tube(pts, 0.022, 5, true));
  }

  // Distant Corcovado granite peak + hilltop monument silhouette at `[18, 0, -(PITCH_HZ + 46)]`
  const peakX = 18;
  const peakZ = -(PITCH_HZ + 46);
  const corcovadoPeak = place(stratifiedCliffMesh({ radiusX: 16, radiusZ: 12, height: 32, terraces: 6, seed: 83 }), [peakX, -0.5, peakZ]);
  const monumentStone = combineRaw([
    place(box(2.4, 1.8, 2.4, 0.06), [peakX, 32.1, peakZ]),
    place(box(1.15, 4.8, 0.9, 0.06), [peakX, 35.2, peakZ]),
    place(box(4.4, 0.62, 0.72, 0.05), [peakX, 36.4, peakZ]),
    place(latheMesh([[0.34, 0], [0.3, 0.38], [0.42, 0.72], [0.38, 1.12], [0, 1.24]], 12), [peakX, 37.35, peakZ])
  ]);

  return [
    geometry.custom(mergeRawMeshes([corcovadoPeak]), {
      name: "fc-venue-favela-corcovado",
      material: pairedStrataMaterial({
        colors: ["#3b3f46", "#29382c", "#52555c", "#314533", "#686a70"],
        heightRange: [0, 32],
        bands: 9,
        roughness: 0.84
      }),
      castShadow: false,
      receiveShadow: false
    }),
    assembleSlots(
      "fc-venue-favela-hillside",
      [
        { mesh: combineRaw(stuccoCoral), material: material.matteClay({ name: "favela coral stucco", color: "#d96b52", roughness: 0.84 }) },
        { mesh: combineRaw(stuccoOchre), material: material.matteClay({ name: "favela ochre stucco", color: "#dfb14b", roughness: 0.84 }) },
        { mesh: combineRaw(stuccoTeal), material: material.matteClay({ name: "favela turquoise stucco", color: "#3b9aa8", roughness: 0.84 }) },
        { mesh: combineRaw(tinRoofs), material: FC_MAT.anodizedSilver },
        { mesh: combineRaw(waterTanks), material: material.carPaint({ name: "polyethylene water tank blue", color: "#1d6fd6", roughness: 0.32, clearcoat: 0.55 }) },
        { mesh: monumentStone, material: material.matteClay({ name: "soapstone monument", color: "#d8dad4", roughness: 0.68 }) },
        { mesh: combineRaw(cables), material: FC_MAT.blackRubber },
        { mesh: combineRaw([...warmWindows, ...bulbs]), material: practicalGlow("favela festoon & windows", "#ffbe6b", 1.3) }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Uyuni: Andean Cordillera salt-rimmed volcanic horizon & carved salt-block viewing pavilions. */
function buildUyuniBackdropNodes(accentHex: string): AuraNodeBuilder<AuraSceneNode>[] {
  const andeanPeaks = combineRaw([
    place(stratifiedCliffMesh({ radiusX: 24, radiusZ: 14, height: 22, terraces: 5, seed: 91 }), [-34, -0.4, -(PITCH_HZ + 42)]),
    place(stratifiedCliffMesh({ radiusX: 28, radiusZ: 16, height: 26, terraces: 6, seed: 107 }), [22, -0.4, -(PITCH_HZ + 45)])
  ]);
  const saltBlocks: RawMesh[] = [];
  const beacons: RawMesh[] = [];
  for (const px of [-20, 0, 20]) {
    saltBlocks.push(
      place(box(8.4, 0.9, 3.2, 0.06), [px, 0.45, -(PITCH_HZ + 8.6)]),
      place(box(7.2, 0.32, 3.6, 0.04), [px, 3.2, -(PITCH_HZ + 8.6)]),
      tube([[px - 3.2, 0.9, -(PITCH_HZ + 8.6)], [px - 3.2, 3.1, -(PITCH_HZ + 8.6)]], 0.16, 7, true),
      tube([[px + 3.2, 0.9, -(PITCH_HZ + 8.6)], [px + 3.2, 3.1, -(PITCH_HZ + 8.6)]], 0.16, 7, true)
    );
    beacons.push(place(box(1.8, 0.12, 0.16, 0.02), [px, 3.42, -(PITCH_HZ + 6.9)]));
  }
  return [
    geometry.custom(mergeRawMeshes([andeanPeaks]), {
      name: "fc-venue-uyuni-cordillera",
      material: pairedStrataMaterial({
        colors: ["#8e6d68", "#b5968a", "#e8eef5", "#765a58", "#f3f7fc"],
        heightRange: [0, 26],
        bands: 9,
        roughness: 0.78,
        slope: { flatColor: "#f3f7fc", angle: 40, blend: 18 }
      }),
      castShadow: false,
      receiveShadow: false
    }),
    assembleSlots(
      "fc-venue-uyuni-pavilions",
      [
        { mesh: combineRaw(saltBlocks), material: material.ceramic({ name: "carved halite salt block", color: "#eef4fa", roughness: 0.42 }) },
        { mesh: combineRaw(beacons), material: practicalGlow("uyuni expedition beacon", accentHex, 1.1) }
      ],
      { castShadow: false, receiveShadow: true }
    )
  ];
}

/** Dispatches the bespoke multi-material architectural backdrop for `venue` (memoized per venue + accent). */
export function buildVenueBackdropNodes(venue: VenueId, accentHex: string): AuraNodeBuilder<AuraSceneNode>[] {
  return memo(`venue-backdrop:${venue}:${accentHex}`, () => {
    switch (venue) {
      case "munich":
        return buildMunichBackdropNodes(accentHex);
      case "glacier":
        return buildGlacierBackdropNodes(accentHex);
      case "kyoto":
        return buildKyotoBackdropNodes();
      case "lagos":
        return buildLagosBackdropNodes(accentHex);
      case "favela":
        return buildFavelaBackdropNodes();
      case "uyuni":
        return buildUyuniBackdropNodes(accentHex);
    }
  });
}

/* ========================================================================== */
/* Section 9 — Sculpted Multi-Material Articulated Footballer, Keeper,        */
/*             Referee & Front-Row Supporter Rigs (Zero Meshy GLBs)           */
/* ========================================================================== */

export const FOOTBALLER_CANONICAL_HEIGHT = 1.891;
export const GOALKEEPER_CANONICAL_HEIGHT = 1.899;

export const FOOTBALLER_JOINT_SUFFIXES = [
  "pelvis",
  "chest",
  "head",
  "arm-l",
  "forearm-l",
  "arm-r",
  "forearm-r",
  "leg-l",
  "calf-l",
  "boot-l",
  "leg-r",
  "calf-r",
  "boot-r"
] as const;

export type FootballerJointSuffix = (typeof FOOTBALLER_JOINT_SUFFIXES)[number];

export interface FootballerBuildSpec {
  readonly shirt: string;
  readonly shorts: string;
  readonly socks: string;
  readonly skin: string;
  readonly trim?: string;
  readonly boots?: string;
  readonly targetHeight: number;
  readonly isKeeper?: boolean;
  readonly isReferee?: boolean;
  readonly isCaptain?: boolean;
  readonly powerFrame?: boolean;
  readonly fabricRim?: { readonly color: string; readonly power: number; readonly intensity: number };
}

type Euler3 = readonly [number, number, number];

export interface FootballerJointPose {
  readonly pelvisOffsetY: number;
  readonly pelvisOffsetZ: number;
  readonly pelvis: Euler3;
  readonly chest: Euler3;
  readonly head: Euler3;
  readonly armL: Euler3;
  readonly forearmL: Euler3;
  readonly armR: Euler3;
  readonly forearmR: Euler3;
  readonly legL: Euler3;
  readonly calfL: Euler3;
  readonly bootL: Euler3;
  readonly legR: Euler3;
  readonly calfR: Euler3;
  readonly bootR: Euler3;
}

export interface FootballerPoseInput {
  readonly clip: string;
  readonly phase: number;
  readonly duration: number;
  readonly isKeeper?: boolean;
  readonly celebrateKind?: number;
  readonly celebrateT?: number;
  readonly diveDir?: number;
}

function ovalRing(cx: number, y: number, cz: number, rx: number, rz: number, n = 14): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    pts.push([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz]);
  }
  return pts;
}

function idSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const combineSafe = (parts: readonly RawMesh[]): RawMesh =>
  parts.length === 1 ? parts[0]! : combineRaw(parts);

/** Builds the sculpted athletic shorts + waist + drawstring + hip-joint sockets (`pelvis` pivot at y = 0.96). */
function buildFootballerPelvisParts(power: boolean): { shorts: RawMesh; trim: RawMesh } {
  const wScale = power ? 1.06 : 1.0;
  const waist = loftSectionsMesh(
    [
      ovalRing(0, -0.09, 0, 0.158 * wScale, 0.112 * wScale, 16),
      ovalRing(0, -0.02, 0, 0.154 * wScale, 0.108 * wScale, 16),
      ovalRing(0, 0.055, 0, 0.146 * wScale, 0.101 * wScale, 16),
      ovalRing(0, 0.095, 0, 0.142 * wScale, 0.098 * wScale, 16)
    ],
    true,
    false
  );
  // Hip bridge saddles so upper thighs never show a gap during deep lunges or high kicks
  const hipCapL = place(icosphereFacetMesh(0.088 * wScale, 1, 0, 3), [0.098, -0.035, 0]);
  const hipCapR = place(icosphereFacetMesh(0.088 * wScale, 1, 0, 5), [-0.098, -0.035, 0]);
  const waistband = loftSectionsMesh(
    [
      ovalRing(0, 0.056, 0, 0.149 * wScale, 0.104 * wScale, 16),
      ovalRing(0, 0.092, 0, 0.146 * wScale, 0.102 * wScale, 16)
    ],
    false,
    false
  );
  return {
    shorts: combineSafe([waist, hipCapL, hipCapR]),
    trim: waistband
  };
}

/** Builds the sculpted V-taper match jersey torso, V-neck collar, shoulder yoke & badge/referee detail (`chest` at +0.08 above pelvis). */
function buildFootballerChestParts(opts: {
  power: boolean;
  isKeeper: boolean;
  isReferee: boolean;
  isCaptain: boolean;
}): { jersey: RawMesh; trim: RawMesh; dark: RawMesh; gold: RawMesh } {
  const w = opts.power ? 1.07 : 1.0;
  const torso = loftSectionsMesh(
    [
      ovalRing(0, -0.02, 0, 0.140 * w, 0.096 * w, 16),
      ovalRing(0, 0.11, 0, 0.152 * w, 0.106 * w, 16),
      ovalRing(0, 0.26, 0, 0.178 * w, 0.118 * w, 16),
      ovalRing(0, 0.39, 0, 0.198 * w, 0.114 * w, 16),
      ovalRing(0, 0.455, 0, 0.152 * w, 0.094 * w, 16),
      ovalRing(0, 0.485, 0, 0.072, 0.068, 16)
    ],
    true,
    false
  );
  // Sculpted deltoid shoulder caps bridging torso to arm pivots (`[±0.225, 0.41, 0]`)
  const deltL = place(icosphereFacetMesh(0.078 * w, 1, 0, 7), [0.195 * w, 0.405, 0]);
  const deltR = place(icosphereFacetMesh(0.078 * w, 1, 0, 9), [-0.195 * w, 0.405, 0]);

  // Rib-knit V-neck collar + shoulder racing stripes + hem piping
  const collar = loftSectionsMesh(
    [
      ovalRing(0, 0.455, 0.006, 0.086, 0.082, 14),
      ovalRing(0, 0.495, 0.004, 0.074, 0.072, 14)
    ],
    false,
    false
  );
  const stripeL = tube(
    [
      [0.09, 0.47, 0],
      [0.155 * w, 0.445, 0],
      [0.215 * w, 0.42, 0]
    ],
    0.014,
    6,
    false
  );
  const stripeR = tube(
    [
      [-0.09, 0.47, 0],
      [-0.155 * w, 0.445, 0],
      [-0.215 * w, 0.42, 0]
    ],
    0.014,
    6,
    false
  );
  const crest = place(bevelBoxMesh(0.038, 0.044, 0.012, 0.004, 1), [-0.072 * w, 0.33, 0.114 * w]);

  const trimParts: RawMesh[] = [collar, stripeL, stripeR];
  const darkParts: RawMesh[] = [];
  const goldParts: RawMesh[] = [crest];

  if (opts.isReferee) {
    // Referee breast pocket, card tab & silver whistle lanyard
    darkParts.push(
      place(bevelBoxMesh(0.052, 0.058, 0.012, 0.003, 1), [-0.068, 0.315, 0.114]),
      tube(
        [
          [-0.042, 0.47, 0.055],
          [-0.02, 0.38, 0.108],
          [0, 0.355, 0.116],
          [0.02, 0.38, 0.108],
          [0.042, 0.47, 0.055]
        ],
        0.005,
        5,
        false
      )
    );
    goldParts.push(place(bevelBoxMesh(0.022, 0.018, 0.024, 0.004, 1), [0, 0.348, 0.12]));
  } else if (opts.isKeeper) {
    // Padded chest rib panels on keeper jersey
    trimParts.push(
      place(bevelBoxMesh(0.13 * w, 0.022, 0.012, 0.004, 1), [0, 0.28, 0.114 * w]),
      place(bevelBoxMesh(0.11 * w, 0.022, 0.012, 0.004, 1), [0, 0.23, 0.110 * w])
    );
  }
  if (opts.isCaptain) {
    goldParts.push(place(bevelBoxMesh(0.014, 0.03, 0.014, 0.003, 1), [0.072 * w, 0.33, 0.114 * w]));
  }

  return {
    jersey: combineSafe([torso, deltL, deltR]),
    trim: combineSafe(trimParts),
    dark: darkParts.length > 0 ? combineSafe(darkParts) : place(bevelBoxMesh(0.004, 0.004, 0.004, 0.001, 1), [0, 0.25, 0]),
    gold: combineSafe(goldParts)
  };
}

/** Builds the sculpted neck, cranium, jawline, nose, ears, eyes, brows & varied hairstyle (`head` at +0.50 above chest). */
function buildFootballerHeadParts(hairStyle: number, hasHeadband: boolean): {
  skin: RawMesh;
  hair: RawMesh;
  eyes: RawMesh;
  trim: RawMesh;
} {
  const neck = loftSectionsMesh(
    [
      ovalRing(0, -0.025, -0.006, 0.058, 0.056, 12),
      ovalRing(0, 0.045, -0.002, 0.052, 0.050, 12),
      ovalRing(0, 0.085, 0.004, 0.056, 0.054, 12)
    ],
    true,
    false
  );
  const skull = loftSectionsMesh(
    [
      ovalRing(0, 0.072, 0.014, 0.062, 0.068, 14),
      ovalRing(0, 0.118, 0.012, 0.082, 0.092, 14),
      ovalRing(0, 0.178, 0.004, 0.092, 0.104, 14),
      ovalRing(0, 0.242, -0.004, 0.088, 0.100, 14),
      ovalRing(0, 0.295, -0.008, 0.066, 0.076, 14),
      ovalRing(0, 0.322, -0.010, 0.028, 0.032, 14)
    ],
    true,
    false
  );
  const nose = place(bevelBoxMesh(0.024, 0.042, 0.028, 0.007, 1), [0, 0.172, 0.104], [-0.14, 0, 0]);
  const earL = place(bevelBoxMesh(0.016, 0.038, 0.024, 0.005, 1), [0.091, 0.176, -0.004]);
  const earR = place(bevelBoxMesh(0.016, 0.038, 0.024, 0.005, 1), [-0.091, 0.176, -0.004]);

  // Sculpted hairstyle crown
  const hairBase = loftSectionsMesh(
    [
      ovalRing(0, 0.205, -0.014, 0.094, 0.104, 14),
      ovalRing(0, 0.258, -0.006, 0.095, 0.108, 14),
      ovalRing(0, 0.312, 0.004, 0.076, 0.090, 14),
      ovalRing(0, 0.346 + (hairStyle % 2) * 0.012, 0.010, 0.036, 0.046, 14)
    ],
    true,
    false
  );
  const hairExtras: RawMesh[] = [hairBase];
  if (hairStyle === 1) {
    // Textured forward quiff crest
    hairExtras.push(place(bevelBoxMesh(0.088, 0.036, 0.068, 0.012, 1), [0, 0.326, 0.044], [-0.18, 0, 0]));
  } else if (hairStyle === 2) {
    // Textured curls crown
    for (const [cx, cy, cz] of [[-0.042, 0.318, 0.02], [0.042, 0.318, 0.02], [0, 0.332, -0.02], [0, 0.325, 0.046]] as const) {
      hairExtras.push(place(icosphereFacetMesh(0.038, 1, 0.06, 11), [cx, cy, cz]));
    }
  } else if (hairStyle === 3) {
    // Back nape fade + top knot
    hairExtras.push(place(icosphereFacetMesh(0.036, 1, 0, 13), [0, 0.31, -0.082]));
  }

  const eyeL = place(bevelBoxMesh(0.022, 0.012, 0.012, 0.003, 1), [0.034, 0.194, 0.098]);
  const eyeR = place(bevelBoxMesh(0.022, 0.012, 0.012, 0.003, 1), [-0.034, 0.194, 0.098]);
  const browL = place(bevelBoxMesh(0.030, 0.008, 0.012, 0.002, 1), [0.035, 0.211, 0.100], [0, 0, -0.08]);
  const browR = place(bevelBoxMesh(0.030, 0.008, 0.012, 0.002, 1), [-0.035, 0.211, 0.100], [0, 0, 0.08]);

  const band = hasHeadband
    ? loftSectionsMesh(
        [
          ovalRing(0, 0.222, -0.002, 0.096, 0.107, 14),
          ovalRing(0, 0.246, -0.002, 0.095, 0.106, 14)
        ],
        false,
        false
      )
    : place(bevelBoxMesh(0.004, 0.004, 0.004, 0.001, 1), [0, 0.18, 0]);

  return {
    skin: combineSafe([neck, skull, nose, earL, earR]),
    hair: combineSafe(hairExtras),
    eyes: combineSafe([eyeL, eyeR, browL, browR]),
    trim: band
  };
}

/** Upper arm: jersey sleeve + cuff trim + bicep/tricep + elbow sphere (`arm-l`/`arm-r`, length 0.27 m). */
function buildFootballerUpperArmParts(isKeeper: boolean, isCaptainLeft: boolean): {
  jersey: RawMesh;
  trim: RawMesh;
  skin: RawMesh;
} {
  const shoulderBall = icosphereFacetMesh(0.058, 1, 0, 4);
  const sleeveBottom = isKeeper ? -0.255 : -0.145;
  const sleeve = loftSectionsMesh(
    [
      ovalRing(0, 0.01, 0, 0.058, 0.058, 12),
      ovalRing(0, sleeveBottom * 0.5, 0, 0.054, 0.054, 12),
      ovalRing(0, sleeveBottom, 0, 0.049, 0.049, 12)
    ],
    true,
    false
  );
  const cuff = loftSectionsMesh(
    [
      ovalRing(0, sleeveBottom - 0.016, 0, 0.050, 0.050, 12),
      ovalRing(0, sleeveBottom + 0.004, 0, 0.051, 0.051, 12)
    ],
    false,
    false
  );
  const trimParts: RawMesh[] = [cuff];
  if (isCaptainLeft) {
    trimParts.push(
      loftSectionsMesh(
        [
          ovalRing(0, -0.105, 0, 0.054, 0.054, 12),
          ovalRing(0, -0.068, 0, 0.056, 0.056, 12)
        ],
        false,
        false
      )
    );
  }
  const bicepSkin = isKeeper
    ? place(icosphereFacetMesh(0.044, 1, 0, 6), [0, -0.27, 0])
    : combineSafe([
        loftSectionsMesh(
          [
            ovalRing(0, -0.14, 0, 0.046, 0.046, 12),
            ovalRing(0, -0.21, 0, 0.043, 0.044, 12),
            ovalRing(0, -0.27, 0, 0.039, 0.040, 12)
          ],
          true,
          false
        ),
        place(icosphereFacetMesh(0.042, 1, 0, 6), [0, -0.27, 0])
      ]);
  return {
    jersey: combineSafe([shoulderBall, sleeve]),
    trim: combineSafe(trimParts),
    skin: bicepSkin
  };
}

/** Forearm + wrist tape + sculpted hand or padded goalkeeper glove (`forearm-l`/`forearm-r`, length 0.25 m). */
function buildFootballerForearmParts(sideSign: 1 | -1, isKeeper: boolean): {
  skinOrSleeve: RawMesh;
  wristTape: RawMesh;
  gloveOrHand: RawMesh;
} {
  const forearm = loftSectionsMesh(
    [
      ovalRing(0, 0.01, 0, 0.041, 0.042, 12),
      ovalRing(0, -0.11, 0, 0.037, 0.038, 12),
      ovalRing(0, -0.21, 0, 0.030, 0.032, 12)
    ],
    true,
    false
  );
  const tape = loftSectionsMesh(
    [
      ovalRing(0, -0.225, 0, 0.033, 0.035, 12),
      ovalRing(0, -0.192, 0, 0.034, 0.036, 12)
    ],
    true,
    false
  );
  if (isKeeper) {
    // Chunky pro goalkeeper latex glove + spread thumb
    const glovePalm = place(bevelBoxMesh(0.062, 0.098, 0.038, 0.012, 1), [0, -0.268, 0.008]);
    const gloveThumb = place(bevelBoxMesh(0.024, 0.048, 0.024, 0.007, 1), [-sideSign * 0.034, -0.252, 0.026], [-0.35, 0, sideSign * 0.42]);
    return {
      skinOrSleeve: forearm,
      wristTape: tape,
      gloveOrHand: combineSafe([glovePalm, gloveThumb])
    };
  }
  const palm = place(bevelBoxMesh(0.044, 0.074, 0.026, 0.008, 1), [0, -0.256, 0.006]);
  const thumb = place(bevelBoxMesh(0.018, 0.036, 0.018, 0.005, 1), [-sideSign * 0.024, -0.244, 0.020], [-0.30, 0, sideSign * 0.35]);
  return {
    skinOrSleeve: forearm,
    wristTape: tape,
    gloveOrHand: combineSafe([palm, thumb])
  };
}

/** Upper leg: tailored shorts leg cuff + racing stripe + muscular quadriceps/hamstring + kneecap (`leg`, length 0.43 m). */
function buildFootballerUpperLegParts(sideSign: 1 | -1, power: boolean): {
  shorts: RawMesh;
  trim: RawMesh;
  skin: RawMesh;
} {
  const s = power ? 1.07 : 1.0;
  const shortsLeg = loftSectionsMesh(
    [
      ovalRing(0, 0.03, 0, 0.090 * s, 0.094 * s, 14),
      ovalRing(0, -0.10, 0, 0.086 * s, 0.090 * s, 14),
      ovalRing(0, -0.205, 0, 0.082 * s, 0.084 * s, 14)
    ],
    true,
    false
  );
  const hem = loftSectionsMesh(
    [
      ovalRing(0, -0.218, 0, 0.083 * s, 0.085 * s, 14),
      ovalRing(0, -0.198, 0, 0.084 * s, 0.086 * s, 14)
    ],
    false,
    false
  );
  const sideStripe = tube(
    [
      [sideSign * 0.084 * s, 0.01, 0],
      [sideSign * 0.083 * s, -0.21, 0]
    ],
    0.010,
    5,
    false
  );
  const quad = loftSectionsMesh(
    [
      ovalRing(0, -0.195, 0.003, 0.072 * s, 0.076 * s, 14),
      ovalRing(0, -0.31, 0.004, 0.064 * s, 0.068 * s, 14),
      ovalRing(0, -0.42, 0.002, 0.053 * s, 0.056 * s, 14)
    ],
    true,
    false
  );
  const kneeCap = place(icosphereFacetMesh(0.054 * s, 1, 0, 8), [0, -0.43, 0.006]);
  return {
    shorts: shortsLeg,
    trim: combineSafe([hem, sideStripe]),
    skin: combineSafe([quad, kneeCap])
  };
}

/** Lower leg: upper calf skin + turnover match sock + contoured shin-guard bulge + ankle tape (`calf`, length 0.41 m). */
function buildFootballerLowerLegParts(power: boolean): {
  skin: RawMesh;
  sock: RawMesh;
  trim: RawMesh;
} {
  const s = power ? 1.05 : 1.0;
  const upperCalf = loftSectionsMesh(
    [
      ovalRing(0, 0.01, -0.002, 0.053 * s, 0.056 * s, 14),
      ovalRing(0, -0.085, -0.006, 0.056 * s, 0.060 * s, 14),
      ovalRing(0, -0.135, -0.004, 0.054 * s, 0.058 * s, 14)
    ],
    true,
    false
  );
  const sockTurnover = loftSectionsMesh(
    [
      ovalRing(0, -0.165, -0.003, 0.057 * s, 0.061 * s, 14),
      ovalRing(0, -0.125, -0.003, 0.058 * s, 0.062 * s, 14)
    ],
    true,
    false
  );
  const sockShaft = loftSectionsMesh(
    [
      ovalRing(0, -0.155, -0.003, 0.055 * s, 0.059 * s, 14),
      ovalRing(0, -0.24, 0.005, 0.051 * s, 0.058 * s, 14),
      ovalRing(0, -0.34, 0.002, 0.041 * s, 0.045 * s, 14),
      ovalRing(0, -0.41, 0, 0.038 * s, 0.042 * s, 14)
    ],
    true,
    false
  );
  const ankleTape = loftSectionsMesh(
    [
      ovalRing(0, -0.395, 0, 0.040 * s, 0.044 * s, 12),
      ovalRing(0, -0.358, 0, 0.042 * s, 0.046 * s, 12)
    ],
    false,
    false
  );
  return {
    skin: upperCalf,
    sock: sockShaft,
    trim: combineSafe([sockTurnover, ankleTape])
  };
}

/** Pro football boot: sculpted anatomical last + heel counter + tongue + soleplate + 6 studs grounded at y = -0.10 m. */
function buildFootballerBootParts(): {
  upper: RawMesh;
  accent: RawMesh;
  soleAndStuds: RawMesh;
} {
  const ankleCollar = loftSectionsMesh(
    [
      ovalRing(0, -0.048, -0.004, 0.043, 0.052, 12),
      ovalRing(0, 0.008, -0.002, 0.040, 0.046, 12)
    ],
    true,
    false
  );
  // Sculpted shoe last along +Z from heel (-0.088) to toe (+0.188)
  const bootUpper = loftSectionsMesh(
    [
      [[-0.034, -0.084, -0.088], [0.034, -0.084, -0.088], [0.036, -0.032, -0.082], [-0.036, -0.032, -0.082]],
      [[-0.044, -0.086, -0.020], [0.044, -0.086, -0.020], [0.042, -0.026, -0.015], [-0.042, -0.026, -0.015]],
      [[-0.048, -0.086, 0.065], [0.048, -0.086, 0.065], [0.044, -0.038, 0.065], [-0.044, -0.038, 0.065]],
      [[-0.041, -0.086, 0.142], [0.041, -0.086, 0.142], [0.036, -0.052, 0.140], [-0.036, -0.052, 0.140]],
      [[-0.024, -0.084, 0.188], [0.024, -0.084, 0.188], [0.020, -0.064, 0.184], [-0.020, -0.064, 0.184]]
    ],
    true,
    false
  );
  const heelCounter = place(bevelBoxMesh(0.072, 0.046, 0.034, 0.008, 1), [0, -0.058, -0.076]);
  const sideChevron = place(bevelBoxMesh(0.098, 0.018, 0.072, 0.004, 1), [0, -0.056, 0.042], [0.16, 0, 0]);
  const soleplate = place(bevelBoxMesh(0.088, 0.012, 0.268, 0.004, 1), [0, -0.088, 0.048]);
  const studProto = latheMesh([[0, 0], [0.007, 0], [0.009, 0.012], [0, 0.012]], 6);
  const studs: RawMesh[] = [soleplate];
  for (const [sx, sz] of [
    [-0.026, -0.064], [0.026, -0.064],
    [-0.030, 0.048], [0.030, 0.048],
    [-0.022, 0.138], [0.022, 0.138]
  ] as const) {
    // Stud bottom rests cleanly at y = -0.100 (so 0.96 - 0.02 - 0.43 - 0.41 - 0.10 = 0.000!)
    studs.push(place(studProto, [sx, -0.100, sz]));
  }
  return {
    upper: combineSafe([ankleCollar, bootUpper]),
    accent: combineSafe([heelCounter, sideChevron]),
    soleAndStuds: combineSafe(studs)
  };
}

/**
 * Builds a complete sculpted, multi-material, anatomically articulated footballer / goalkeeper / referee node
 * rooted at `${id}-body` (or `${id}` when `rawName` is true, e.g. `fc-referee`).
 */
export function buildArticulatedFootballerNode(
  id: string,
  spec: FootballerBuildSpec,
  opts: { readonly rawRootName?: boolean; readonly runtimeFactory?: (nodeId: string) => any } = {}
): AuraNodeBuilder<AuraGroupNode> {
  const rootName = opts.rawRootName ? id : `${id}-body`;
  const rt = opts.runtimeFactory;
  const bindRt = <T extends AuraNodeBuilder<any>>(node: T, nodeId: string): T =>
    rt ? node.runtime(rt(nodeId)) : node;

  const isKeeper = spec.isKeeper === true;
  const isReferee = spec.isReferee === true;
  const isCaptain = spec.isCaptain === true;
  const power = spec.powerFrame === true;
  const canonicalH = isKeeper ? GOALKEEPER_CANONICAL_HEIGHT : FOOTBALLER_CANONICAL_HEIGHT;
  const uniformScale = spec.targetHeight / canonicalH;
  const seed = idSeed(id);
  const hairColors = ["#171412", "#2e1f16", "#4b3221", "#12151c", "#634229"] as const;
  const hairColor = hairColors[seed % hairColors.length]!;
  const hairStyle = seed % 4;
  const hasHeadband = !isReferee && !isKeeper && seed % 5 === 0;
  const trimHex = spec.trim ?? (isReferee ? "#15171c" : isKeeper ? "#f4f7fb" : spec.shorts);
  const bootHex = spec.boots ?? (isReferee ? "#14161c" : isKeeper ? "#1f2530" : "#181d26");

  // Multi-material kit, skin, sock, leather boot, latex glove & trim materials
  const jerseyMat = material.fabric({
    name: `${id}-kit`,
    color: spec.shirt,
    roughness: 0.52,
    sheen: 0.48,
    sheenRoughness: 0.62,
    sheenColor: "#eef4fc",
    ...(spec.fabricRim ? { rim: spec.fabricRim } : {})
  } as any);
  const shortsMat = material.fabric({
    name: `${id}-shorts`,
    color: spec.shorts,
    roughness: 0.58,
    sheen: 0.42,
    sheenRoughness: 0.66,
    sheenColor: "#eef4fc",
    ...(spec.fabricRim ? { rim: spec.fabricRim } : {})
  } as any);
  const socksMat = material.fabric({
    name: `${id}-socks`,
    color: spec.socks,
    roughness: 0.66,
    sheen: 0.34,
    sheenRoughness: 0.72,
    sheenColor: "#e4ecf6"
  });
  const trimMat = material.fabric({
    name: `${id}-trim`,
    color: trimHex,
    roughness: 0.50,
    sheen: 0.40,
    sheenRoughness: 0.60,
    sheenColor: "#ffffff"
  });
  const skinMat = material.physical({
    name: `${id}-skin`,
    color: spec.skin,
    roughness: 0.54,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.62
  });
  const hairMat = material.matteClay({
    name: `${id}-hair`,
    color: hairColor,
    roughness: 0.78
  });
  const eyeMat = material.lacquer({
    name: `${id}-eyes`,
    color: "#151820",
    roughness: 0.2,
    clearcoat: 0.8
  });
  const bootUpperMat = material.lacquer({
    name: `${id}-boot`,
    color: bootHex,
    roughness: 0.28,
    clearcoat: 0.68,
    clearcoatRoughness: 0.20
  });
  const bootAccentMat = material.carPaint({
    name: `${id}-boot-accent`,
    color: isReferee ? "#f2f4f8" : spec.shirt,
    roughness: 0.24,
    clearcoat: 0.82
  });
  const studMat = material.studioMetal({
    name: `${id}-studs`,
    color: "#38414e",
    roughness: 0.34,
    metalness: 0.76
  });
  const gloveMat = material.clearcoatPaint({
    name: `${id}-glove`,
    color: "#f3f7fc",
    roughness: 0.36,
    clearcoat: 0.45
  });
  const badgeGoldMat = material.brushedMetal({
    name: `${id}-badge`,
    color: "#e6c35c",
    roughness: 0.28,
    metalness: 0.85
  });

  // Memoized raw part meshes
  const pelvisParts = memo(`fc-ath-pelvis:${power ? 1 : 0}`, () => buildFootballerPelvisParts(power));
  const chestParts = memo(
    `fc-ath-chest:${power ? 1 : 0}:${isKeeper ? 1 : 0}:${isReferee ? 1 : 0}:${isCaptain ? 1 : 0}`,
    () => buildFootballerChestParts({ power, isKeeper, isReferee, isCaptain })
  );
  const headParts = memo(`fc-ath-head:${hairStyle}:${hasHeadband ? 1 : 0}`, () =>
    buildFootballerHeadParts(hairStyle, hasHeadband)
  );
  const uarmL = memo(`fc-ath-uarm:L:${isKeeper ? 1 : 0}:${isCaptain ? 1 : 0}`, () =>
    buildFootballerUpperArmParts(isKeeper, isCaptain)
  );
  const uarmR = memo(`fc-ath-uarm:R:${isKeeper ? 1 : 0}`, () =>
    buildFootballerUpperArmParts(isKeeper, false)
  );
  const farmL = memo(`fc-ath-farm:L:${isKeeper ? 1 : 0}`, () => buildFootballerForearmParts(1, isKeeper));
  const farmR = memo(`fc-ath-farm:R:${isKeeper ? 1 : 0}`, () => buildFootballerForearmParts(-1, isKeeper));
  const ulegL = memo(`fc-ath-uleg:L:${power ? 1 : 0}`, () => buildFootballerUpperLegParts(1, power));
  const ulegR = memo(`fc-ath-uleg:R:${power ? 1 : 0}`, () => buildFootballerUpperLegParts(-1, power));
  const calfGeom = memo(`fc-ath-calf:${power ? 1 : 0}`, () => buildFootballerLowerLegParts(power));
  const bootGeom = memo("fc-ath-boot", () => buildFootballerBootParts());

  const shoulderX = power ? 0.236 : 0.224;
  const hipX = power ? 0.108 : 0.102;

  const headNode = bindRt(
    group(
      `${id}-head`,
      [
        assembleSlots(
          `${id}-head-mesh`,
          [
            { mesh: headParts.skin, material: skinMat },
            { mesh: headParts.hair, material: hairMat },
            { mesh: headParts.eyes, material: eyeMat },
            ...(hasHeadband ? [{ mesh: headParts.trim, material: trimMat }] : [])
          ],
          { castShadow: true, receiveShadow: true }
        )
      ],
      { position: [0, 0.50, 0] }
    ),
    `${id}-head`
  );

  const forearmLNode = bindRt(
    group(
      `${id}-forearm-l`,
      [
        assembleSlots(
          `${id}-forearm-l-mesh`,
          [
            { mesh: farmL.skinOrSleeve, material: isKeeper ? jerseyMat : skinMat },
            { mesh: farmL.wristTape, material: trimMat },
            { mesh: farmL.gloveOrHand, material: isKeeper ? gloveMat : skinMat }
          ],
          { castShadow: true, receiveShadow: true }
        )
      ],
      { position: [0, -0.27, 0] }
    ),
    `${id}-forearm-l`
  );

  const forearmRNode = bindRt(
    group(
      `${id}-forearm-r`,
      [
        assembleSlots(
          `${id}-forearm-r-mesh`,
          [
            { mesh: farmR.skinOrSleeve, material: isKeeper ? jerseyMat : skinMat },
            { mesh: farmR.wristTape, material: trimMat },
            { mesh: farmR.gloveOrHand, material: isKeeper ? gloveMat : skinMat }
          ],
          { castShadow: true, receiveShadow: true }
        )
      ],
      { position: [0, -0.27, 0] }
    ),
    `${id}-forearm-r`
  );

  const armLNode = bindRt(
    group(
      `${id}-arm-l`,
      [
        assembleSlots(
          `${id}-arm-l-mesh`,
          [
            { mesh: uarmL.jersey, material: jerseyMat },
            { mesh: uarmL.trim, material: trimMat },
            { mesh: uarmL.skin, material: skinMat }
          ],
          { castShadow: true, receiveShadow: true }
        ),
        forearmLNode
      ],
      { position: [shoulderX, 0.41, 0] }
    ),
    `${id}-arm-l`
  );

  const armRNode = bindRt(
    group(
      `${id}-arm-r`,
      [
        assembleSlots(
          `${id}-arm-r-mesh`,
          [
            { mesh: uarmR.jersey, material: jerseyMat },
            { mesh: uarmR.trim, material: trimMat },
            { mesh: uarmR.skin, material: skinMat }
          ],
          { castShadow: true, receiveShadow: true }
        ),
        forearmRNode
      ],
      { position: [-shoulderX, 0.41, 0] }
    ),
    `${id}-arm-r`
  );

  const chestSlots: MaterialSlot[] = [
    { mesh: chestParts.jersey, material: jerseyMat },
    { mesh: chestParts.trim, material: trimMat },
    { mesh: chestParts.gold, material: badgeGoldMat }
  ];
  if (isReferee) chestSlots.push({ mesh: chestParts.dark, material: eyeMat });

  const chestNode = bindRt(
    group(
      `${id}-chest`,
      [
        assembleSlots(`${id}-chest-mesh`, chestSlots, { castShadow: true, receiveShadow: true }),
        headNode,
        armLNode,
        armRNode
      ],
      { position: [0, 0.08, 0] }
    ),
    `${id}-chest`
  );

  const bootLNode = bindRt(
    group(
      `${id}-boot-l`,
      [
        assembleSlots(
          `${id}-boot-l-mesh`,
          [
            { mesh: bootGeom.upper, material: bootUpperMat },
            { mesh: bootGeom.accent, material: bootAccentMat },
            { mesh: bootGeom.soleAndStuds, material: studMat }
          ],
          { castShadow: true, receiveShadow: true }
        )
      ],
      { position: [0, -0.41, 0] }
    ),
    `${id}-boot-l`
  );

  const bootRNode = bindRt(
    group(
      `${id}-boot-r`,
      [
        assembleSlots(
          `${id}-boot-r-mesh`,
          [
            { mesh: bootGeom.upper, material: bootUpperMat },
            { mesh: bootGeom.accent, material: bootAccentMat },
            { mesh: bootGeom.soleAndStuds, material: studMat }
          ],
          { castShadow: true, receiveShadow: true }
        )
      ],
      { position: [0, -0.41, 0] }
    ),
    `${id}-boot-r`
  );

  const calfLNode = bindRt(
    group(
      `${id}-calf-l`,
      [
        assembleSlots(
          `${id}-calf-l-mesh`,
          [
            { mesh: calfGeom.skin, material: skinMat },
            { mesh: calfGeom.sock, material: socksMat },
            { mesh: calfGeom.trim, material: trimMat }
          ],
          { castShadow: true, receiveShadow: true }
        ),
        bootLNode
      ],
      { position: [0, -0.43, 0] }
    ),
    `${id}-calf-l`
  );

  const calfRNode = bindRt(
    group(
      `${id}-calf-r`,
      [
        assembleSlots(
          `${id}-calf-r-mesh`,
          [
            { mesh: calfGeom.skin, material: skinMat },
            { mesh: calfGeom.sock, material: socksMat },
            { mesh: calfGeom.trim, material: trimMat }
          ],
          { castShadow: true, receiveShadow: true }
        ),
        bootRNode
      ],
      { position: [0, -0.43, 0] }
    ),
    `${id}-calf-r`
  );

  const legLNode = bindRt(
    group(
      `${id}-leg-l`,
      [
        assembleSlots(
          `${id}-leg-l-mesh`,
          [
            { mesh: ulegL.shorts, material: shortsMat },
            { mesh: ulegL.trim, material: trimMat },
            { mesh: ulegL.skin, material: skinMat }
          ],
          { castShadow: true, receiveShadow: true }
        ),
        calfLNode
      ],
      { position: [hipX, -0.02, 0] }
    ),
    `${id}-leg-l`
  );

  const legRNode = bindRt(
    group(
      `${id}-leg-r`,
      [
        assembleSlots(
          `${id}-leg-r-mesh`,
          [
            { mesh: ulegR.shorts, material: shortsMat },
            { mesh: ulegR.trim, material: trimMat },
            { mesh: ulegR.skin, material: skinMat }
          ],
          { castShadow: true, receiveShadow: true }
        ),
        calfRNode
      ],
      { position: [-hipX, -0.02, 0] }
    ),
    `${id}-leg-r`
  );

  const pelvisNode = bindRt(
    group(
      `${id}-pelvis`,
      [
        assembleSlots(
          `${id}-pelvis-mesh`,
          [
            { mesh: pelvisParts.shorts, material: shortsMat },
            { mesh: pelvisParts.trim, material: trimMat }
          ],
          { castShadow: true, receiveShadow: true }
        ),
        chestNode,
        legLNode,
        legRNode
      ],
      { position: [0, 0.96, 0] }
    ),
    `${id}-pelvis`
  );

  const scaleNode = group(`${id}-scale`, [pelvisNode], { scale: [uniformScale, uniformScale, uniformScale] });
  return bindRt(group(rootName, [scaleNode], { position: [0, 0, 0] }), rootName);
}

/* -------------------------------------------------------------------------- */
/* Stateless Biomechanical `"ZYX"` Euler Kinematics for Footballer Rig        */
/* -------------------------------------------------------------------------- */

const clampRange = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const smooth01 = (x: number): number => {
  const t = clampRange(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Computes one leg's hip, knee, and ankle X-axis angles for a gait cycle where `u in [0, 1)`:
 * - `u in [0, 0.5)`: STANCE phase — `sin(hipRx)` sweeps linearly from `-strideSin` (foot forward `+Z`)
 *   to `+strideSin` (foot back `-Z`) so the planted boot moves backward at exact constant speed
 *   `4 * L_eff * strideSin / cycleSeconds` (`STANCE_SPEED_MODEL`), eliminating foot slide!
 * - `u in [0.5, 1.0)`: SWING phase — knee flexes smoothly backward (`+kneeRx`, never `< 0`!) to clear the turf
 *   while the hip swings forward back to `-strideSin`.
 */
function sampleGaitLeg(uRaw: number, strideSin: number, swingKneePeak: number, stanceKneePeak: number): {
  hipRx: number;
  kneeRx: number;
  bootRx: number;
} {
  const u = ((uRaw % 1) + 1) % 1;
  if (u < 0.5) {
    const s = u / 0.5; // 0..1 over stance
    // Linear horizontal foot sweep from +Z (`hipRx < 0`) to -Z (`hipRx > 0`)
    const sinTheta = -strideSin * (1 - 2 * s);
    const hipRx = Math.asin(clampRange(sinTheta, -0.84, 0.84));
    const kneeRx = Math.sin(s * Math.PI) * stanceKneePeak;
    const bootRx = -(hipRx + kneeRx) * 0.65 + (s > 0.72 ? (s - 0.72) * 0.75 : 0);
    return { hipRx, kneeRx: Math.max(0, kneeRx), bootRx };
  }
  const w = (u - 0.5) / 0.5; // 0..1 over swing
  const ease = 0.5 - 0.5 * Math.cos(w * Math.PI);
  const sinTheta = strideSin * (1 - 2 * ease);
  const hipRx = Math.asin(clampRange(sinTheta, -0.84, 0.84));
  const kneeRx = Math.pow(Math.sin(w * Math.PI), 0.85) * swingKneePeak;
  const bootRx = -0.18 * Math.sin(w * Math.PI);
  return { hipRx, kneeRx: Math.max(0, kneeRx), bootRx };
}

/**
 * Pure, stateless `"ZYX"` Euler joint pose calculator for every `Aura FC 3D` animation state:
 * `Ready`, `Walk_Loop`, `Run`, `Sprint_Loop`, `KickTap`, `KickPass`, `KickShot`,
 * `Attack` (slide tackle / knee-slide celebration), and `Jump_Loop` (keeper dive / spin / leap celebration).
 */
export function computeFootballerJointPose(input: FootballerPoseInput): FootballerJointPose {
  const dur = Math.max(0.05, input.duration || 0.6);
  const u = clampRange(input.phase / dur, 0, 1);
  const cyc = ((input.phase / dur) % 1 + 1) % 1;
  const isKeeper = input.isKeeper === true;

  // 1. Goalkeeper lateral dive (`Jump_Loop` when `isKeeper` and not celebrating)
  if (input.clip === "Jump_Loop" && isKeeper && (input.celebrateT ?? 0) <= 0.2) {
    const ext = Math.sin(clampRange(u * 1.15, 0, 1) * Math.PI * 0.78);
    const dir = input.diveDir && input.diveDir !== 0 ? Math.sign(input.diveDir) : 1;
    return {
      pelvisOffsetY: 0.96 + ext * 0.14,
      pelvisOffsetZ: ext * 0.08,
      pelvis: [0.10 * ext, 0, 0],
      chest: [0.14 * ext, dir * 0.14 * ext, dir * 0.18 * ext],
      head: [-0.22 * ext, dir * 0.26 * ext, 0],
      // Both keeper gloved arms reach overhead toward the top corner!
      armL: [-2.45 * ext - 0.35, 0, 0.22],
      forearmL: [-0.28, 0, 0],
      armR: [-2.45 * ext - 0.35, 0, -0.22],
      forearmR: [-0.28, 0, 0],
      legL: [0.18 * ext, 0, 0.08],
      calfL: [0.52 * ext + 0.12, 0, 0],
      bootL: [0.22 * ext, 0, 0],
      legR: [-0.14 * ext, 0, -0.08],
      calfR: [0.38 * ext + 0.10, 0, 0],
      bootR: [0.18 * ext, 0, 0]
    };
  }

  // 2. Goal celebrations (`Jump_Loop` fist-leap / aircraft spin, or `Ready` heart celebration)
  if (input.clip === "Jump_Loop") {
    const hop = Math.abs(Math.sin(cyc * Math.PI));
    const spinMode = input.celebrateKind === 1;
    return {
      pelvisOffsetY: 0.96 + hop * (spinMode ? 0.08 : 0.24),
      pelvisOffsetZ: 0,
      pelvis: [-0.06 * hop, 0, 0],
      chest: [-0.10 * hop, 0, 0],
      head: [-0.14 * hop, 0, 0],
      armL: spinMode ? [-0.15, 0, 1.32] : [-2.55 * hop - 0.45, 0, 0.28],
      forearmL: spinMode ? [-0.18, 0, 0] : [-0.42, 0, 0],
      armR: spinMode ? [-0.15, 0, -1.32] : [-2.65 * hop - 0.55, 0, -0.24],
      forearmR: spinMode ? [-0.18, 0, 0] : [-0.36, 0, 0],
      legL: [-0.22 * hop, 0, 0.06],
      calfL: [0.58 * hop + 0.08, 0, 0],
      bootL: [0.24 * hop, 0, 0],
      legR: [-0.16 * hop, 0, -0.06],
      calfR: [0.52 * hop + 0.08, 0, 0],
      bootR: [0.24 * hop, 0, 0]
    };
  }

  // 3. Slide tackle & knee-slide celebration (`Attack`)
  if (input.clip === "Attack") {
    const lunge = Math.sin(clampRange(u * 1.25, 0, 1) * Math.PI * 0.65);
    const kneeSlide = (input.celebrateT ?? 0) > 0.2 && input.celebrateKind === 0;
    if (kneeSlide) {
      return {
        pelvisOffsetY: 0.54,
        pelvisOffsetZ: 0.14,
        pelvis: [-0.24, 0, 0],
        chest: [-0.28, 0, 0],
        head: [-0.18, 0, 0],
        armL: [-1.85, 0, 0.55],
        forearmL: [-0.55, 0, 0],
        armR: [-1.85, 0, -0.55],
        forearmR: [-0.55, 0, 0],
        legL: [0.12, 0, 0.08],
        calfL: [1.48, 0, 0],
        bootL: [0.42, 0, 0],
        legR: [0.12, 0, -0.08],
        calfR: [1.48, 0, 0],
        bootR: [0.42, 0, 0]
      };
    }
    return {
      pelvisOffsetY: 0.96 - lunge * 0.56,
      pelvisOffsetZ: lunge * 0.22,
      pelvis: [-0.58 * lunge, -0.18 * lunge, 0],
      chest: [0.22 * lunge, 0.20 * lunge, 0],
      head: [0.18 * lunge, -0.10 * lunge, 0],
      armL: [0.45 * lunge, 0, 0.48],
      forearmL: [-0.52, 0, 0],
      armR: [-0.62 * lunge, 0, -0.44],
      forearmR: [-0.65, 0, 0],
      // Left support leg tucks underneath while right cleated boot sweeps forward along the turf
      legL: [-0.32 * lunge, 0, 0.10],
      calfL: [1.42 * lunge + 0.10, 0, 0],
      bootL: [0.25 * lunge, 0, 0],
      legR: [-0.96 * lunge, 0, -0.06],
      calfR: [0.12 * (1 - lunge) + 0.04, 0, 0],
      bootR: [0.35 * lunge, 0, 0]
    };
  }

  // 4. Kick clips (`KickTap`, `KickPass`, `KickShot`)
  //    Backswing peaks at u ~ 0.34 (`hipRx > 0`, `kneeRx > 0`), whips through ball contact at `u = 0.74` (`CONTACT_FRAC = 0.45..0.74`),
  //    and follows through cleanly (`hipRx < 0`) while Left support leg stays planted on the turf!
  if (input.clip === "KickTap" || input.clip === "KickPass" || input.clip === "KickShot") {
    const intensity = input.clip === "KickTap" ? 0.62 : input.clip === "KickPass" ? 0.84 : 1.0;
    let rHip = 0;
    let rKnee = 0.12;
    let rBoot = 0;
    if (u < 0.36) {
      const k = smooth01(u / 0.36);
      rHip = 0.66 * intensity * k; // backswing (`+rx` = backward `-Z`)
      rKnee = 0.12 + 1.18 * intensity * k; // knee cocks backward (`<= 75°`, never forward)
      rBoot = 0.24 * intensity * k;
    } else if (u < 0.78) {
      // High-velocity strike whip through ball contact (`u ~ 0.45..0.74`)
      const k = (u - 0.36) / 0.42;
      const whip = smooth01(k);
      rHip = 0.66 * intensity * (1 - whip) + (-0.82 * intensity) * whip;
      rKnee = (0.12 + 1.18 * intensity) * (1 - smooth01(Math.min(1, k * 1.22))) + 0.10 * whip;
      rBoot = 0.24 * intensity * (1 - whip) - 0.18 * intensity * whip;
    } else {
      // Balanced follow-through
      const k = smooth01((u - 0.78) / 0.22);
      rHip = -0.82 * intensity * (1 - 0.22 * k);
      rKnee = 0.10 + 0.28 * intensity * k;
      rBoot = -0.18 * intensity * (1 - 0.5 * k);
    }
    const strikeTwist = Math.sin(u * Math.PI) * 0.26 * intensity;
    // Standing left leg stays firmly planted on `[0, 0, 0]` (`hipRx = -0.10`, `kneeRx = +0.20`, `bootRx = -0.10`)
    return {
      pelvisOffsetY: 0.95,
      pelvisOffsetZ: 0,
      pelvis: [-0.08 * Math.sin(u * Math.PI) * intensity, strikeTwist * 0.35, 0.06 * intensity * Math.sin(u * Math.PI)],
      chest: [0.14 * (1 - u) * intensity - 0.08 * u * intensity, -strikeTwist * 0.65, -0.08 * intensity * Math.sin(u * Math.PI)],
      head: [0.16 * (1 - u * 0.6), 0, 0],
      // Left counterbalance arm sweeps wide across/out as right foot strikes
      armL: [-0.68 * intensity * Math.sin(u * Math.PI) - 0.12, 0, 0.42 + 0.28 * intensity * Math.sin(u * Math.PI)],
      forearmL: [-0.62 - 0.25 * Math.sin(u * Math.PI), 0, 0],
      armR: [0.48 * intensity * Math.sin(u * Math.PI), 0, -0.26],
      forearmR: [-0.54, 0, 0],
      legL: [-0.10, 0, 0.04],
      calfL: [0.20, 0, 0],
      bootL: [-0.10, 0, 0],
      legR: [rHip, 0, -0.04],
      calfR: [clampRange(rKnee, 0, 1.85), 0, 0],
      bootR: [rBoot, 0, 0]
    };
  }

  // 5. Distance-locked Gaits (`Walk_Loop`, `Run`, `Sprint_Loop`)
  //    Calibrated to `STANCE_SPEED_MODEL` (`2.3483`, `4.465`, `5.8429`) with `L_eff = 0.96 m`!
  if (input.clip === "Walk_Loop" || input.clip === "Run" || input.clip === "Sprint_Loop") {
    const isWalk = input.clip === "Walk_Loop";
    const isSprint = input.clip === "Sprint_Loop";
    const strideSin = isWalk ? 0.489 : isSprint ? 0.730 : 0.651;
    const swingKnee = isWalk ? 0.66 : isSprint ? 1.52 : 1.24; // all <= 87 deg (1.52 rad < 110 deg!)
    const stanceKnee = isWalk ? 0.12 : isSprint ? 0.24 : 0.20;
    const torsoLean = isWalk ? 0.07 : isSprint ? 0.26 : 0.17;
    const armAmp = isWalk ? 0.36 : isSprint ? 0.88 : 0.68;
    const elbowBase = isWalk ? -0.44 : isSprint ? -1.42 : -1.18;
    const bounceAmp = isWalk ? 0.016 : isSprint ? 0.046 : 0.036;

    const rightLeg = sampleGaitLeg(cyc, strideSin, swingKnee, stanceKnee);
    const leftLeg = sampleGaitLeg(cyc + 0.5, strideSin, swingKnee, stanceKnee);
    const strideWave = Math.sin(cyc * TAU); // >0 during first half (right stance / left swing)
    const bounce = -Math.cos(cyc * TAU * 2) * bounceAmp;
    const hipTwist = -strideWave * (isWalk ? 0.06 : 0.10); // <= 5.7 deg (under 8 deg twist limit!)

    return {
      pelvisOffsetY: 0.955 + bounce,
      pelvisOffsetZ: 0,
      pelvis: [torsoLean * 0.32, hipTwist, strideWave * 0.035],
      chest: [torsoLean * 0.68, -hipTwist * 1.45, -strideWave * 0.04],
      head: [-torsoLean * 0.55, hipTwist * 0.35, 0],
      // Contralateral arm swing: when right leg is back (`cyc ~ 0.5`), right arm swings forward
      armL: [-rightLeg.hipRx * (armAmp / strideSin), 0, 0.16],
      forearmL: [elbowBase - Math.max(0, rightLeg.hipRx) * 0.25, 0, 0],
      armR: [-leftLeg.hipRx * (armAmp / strideSin), 0, -0.16],
      forearmR: [elbowBase - Math.max(0, leftLeg.hipRx) * 0.25, 0, 0],
      legL: [leftLeg.hipRx, 0, 0.03],
      calfL: [leftLeg.kneeRx, 0, 0],
      bootL: [leftLeg.bootRx, 0, 0],
      legR: [rightLeg.hipRx, 0, -0.03],
      calfR: [rightLeg.kneeRx, 0, 0],
      bootR: [rightLeg.bootRx, 0, 0]
    };
  }

  // 6. `Ready` athletic stance (keeper crouched ready stance vs outfielder dynamic ready bounce; or heart celebration)
  const breath = Math.sin(cyc * TAU);
  const heartCeleb = (input.celebrateT ?? 0) > 0.2 && input.celebrateKind === 3;
  if (heartCeleb) {
    return {
      pelvisOffsetY: 0.95 + breath * 0.012,
      pelvisOffsetZ: 0,
      pelvis: [0.02, 0, 0],
      chest: [-0.06, 0, 0],
      head: [-0.08, breath * 0.08, 0],
      armL: [-1.18, -0.42, -0.28],
      forearmL: [-1.35, 0, -0.35],
      armR: [-1.18, 0.42, 0.28],
      forearmR: [-1.35, 0, 0.35],
      legL: [-0.08, 0, 0.06],
      calfL: [0.16, 0, 0],
      bootL: [-0.08, 0, 0],
      legR: [-0.08, 0, -0.06],
      calfR: [0.16, 0, 0],
      bootR: [-0.08, 0, 0]
    };
  }

  const crouch = isKeeper ? 0.065 : 0.022;
  const kneeIdle = isKeeper ? 0.34 : 0.16;
  return {
    pelvisOffsetY: 0.96 - crouch + breath * 0.012,
    pelvisOffsetZ: 0,
    pelvis: [isKeeper ? 0.12 : 0.05, breath * 0.03, 0],
    chest: [isKeeper ? 0.18 : 0.08, -breath * 0.04, 0],
    head: [isKeeper ? -0.18 : -0.06, breath * 0.05, 0],
    armL: [isKeeper ? -0.52 : -0.14 + breath * 0.05, 0, isKeeper ? 0.42 : 0.18],
    forearmL: [isKeeper ? -0.92 : -0.52, 0, 0],
    armR: [isKeeper ? -0.52 : -0.14 - breath * 0.05, 0, isKeeper ? -0.42 : -0.18],
    forearmR: [isKeeper ? -0.92 : -0.52, 0, 0],
    legL: [-kneeIdle * 0.52, 0, isKeeper ? 0.12 : 0.05],
    calfL: [kneeIdle, 0, 0],
    bootL: [-kneeIdle * 0.48, 0, 0],
    legR: [-kneeIdle * 0.52, 0, isKeeper ? -0.12 : -0.05],
    calfR: [kneeIdle, 0, 0],
    bootR: [-kneeIdle * 0.48, 0, 0]
  };
}

/** Applies a stateless `"ZYX"` Euler pose to all 13 articulated joints of a footballer/keeper/referee rig. */
export function poseArticulatedFootballer(
  lookup: ((nodeId: string) => any) | undefined,
  id: string,
  input: FootballerPoseInput
): FootballerJointPose {
  const pose = computeFootballerJointPose(input);
  if (!lookup) return pose;
  const rot = (suffix: FootballerJointSuffix, e: Euler3) => {
    lookup(`${id}-${suffix}`)?.setRotation?.(e[0], e[1], e[2]);
  };
  const pelvis = lookup(`${id}-pelvis`);
  pelvis?.setPosition?.(0, pose.pelvisOffsetY, pose.pelvisOffsetZ);
  pelvis?.setRotation?.(pose.pelvis[0], pose.pelvis[1], pose.pelvis[2]);
  rot("chest", pose.chest);
  rot("head", pose.head);
  rot("arm-l", pose.armL);
  rot("forearm-l", pose.forearmL);
  rot("arm-r", pose.armR);
  rot("forearm-r", pose.forearmR);
  rot("leg-l", pose.legL);
  rot("calf-l", pose.calfL);
  rot("boot-l", pose.bootL);
  rot("leg-r", pose.legR);
  rot("calf-r", pose.calfR);
  rot("boot-r", pose.bootR);
  return pose;
}

/* -------------------------------------------------------------------------- */
/* Front-Row Articulated Supporter Fans (`fc-fan-0..5`)                       */
/* -------------------------------------------------------------------------- */

const FAN_PALETTES = [
  { jacket: "#b2352f", scarf: "#f2f0e2", trousers: "#1f2b3d", skin: "#d09a6a" },
  { jacket: "#1d3557", scarf: "#d8ff3e", trousers: "#252932", skin: "#8a5f42" },
  { jacket: "#d9e8f7", scarf: "#b2352f", trousers: "#16233e", skin: "#e0b48a" }
] as const;

export function buildArticulatedPitchFanNode(
  index: number,
  variant: 0 | 1 | 2,
  targetHeight: number,
  runtimeFactory?: (nodeId: string) => any
): AuraNodeBuilder<AuraGroupNode> {
  const pal = FAN_PALETTES[variant];
  const id = `fc-fan-${index}`;
  return buildArticulatedFootballerNode(
    id,
    {
      shirt: pal.jacket,
      shorts: pal.trousers,
      socks: pal.trousers,
      skin: pal.skin,
      trim: pal.scarf,
      boots: "#22262e",
      targetHeight
    },
    { rawRootName: true, runtimeFactory }
  );
}

/** Statelessly poses front-row supporter `fc-fan-${index}` in `"idle"`, `"cheer"`, or `"pump"`. */
export function poseArticulatedPitchFan(
  lookup: ((nodeId: string) => any) | undefined,
  index: number,
  clip: "idle" | "cheer" | "pump",
  t: number
): void {
  if (!lookup) return;
  const id = `fc-fan-${index}`;
  const ph = t * (clip === "idle" ? 2.1 : 6.4) + index * 0.85;
  const s = Math.sin(ph);
  const bounce = clip === "idle" ? Math.abs(s) * 0.015 : Math.abs(s) * 0.065;
  const pelvis = lookup(`${id}-pelvis`);
  pelvis?.setPosition?.(0, 0.955 + bounce, 0);
  pelvis?.setRotation?.(0, s * 0.06, 0);
  lookup(`${id}-chest`)?.setRotation?.(clip === "idle" ? 0.04 : -0.08 * Math.abs(s), -s * 0.10, s * 0.05);
  lookup(`${id}-head`)?.setRotation?.(clip === "idle" ? -0.04 : -0.14, s * 0.12, 0);
  if (clip === "cheer") {
    lookup(`${id}-arm-l`)?.setRotation?.(-2.55 + s * 0.28, 0, 0.34 + s * 0.12);
    lookup(`${id}-forearm-l`)?.setRotation?.(-0.35, 0, 0);
    lookup(`${id}-arm-r`)?.setRotation?.(-2.55 - s * 0.28, 0, -0.34 + s * 0.12);
    lookup(`${id}-forearm-r`)?.setRotation?.(-0.35, 0, 0);
  } else if (clip === "pump") {
    const pump = Math.max(0, s);
    lookup(`${id}-arm-l`)?.setRotation?.(-0.55, 0, 0.22);
    lookup(`${id}-forearm-l`)?.setRotation?.(-1.05, 0, 0);
    lookup(`${id}-arm-r`)?.setRotation?.(-1.65 - pump * 0.95, 0, -0.22);
    lookup(`${id}-forearm-r`)?.setRotation?.(-0.95 + pump * 0.55, 0, 0);
  } else {
    lookup(`${id}-arm-l`)?.setRotation?.(-0.18 + s * 0.08, 0, 0.18);
    lookup(`${id}-forearm-l`)?.setRotation?.(-0.58, 0, 0);
    lookup(`${id}-arm-r`)?.setRotation?.(-0.18 - s * 0.08, 0, -0.18);
    lookup(`${id}-forearm-r`)?.setRotation?.(-0.58, 0, 0);
  }
}

