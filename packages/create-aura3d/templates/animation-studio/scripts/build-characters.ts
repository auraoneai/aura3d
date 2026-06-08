/**
 * build-characters.ts — Aura3D-authored, procedurally generated rigged animation
 * characters as REAL binary glTF 2.0 (.glb).
 *
 * DEFAULT (high-fidelity humanoid cast). By default this emits TWO genuinely
 * better, properly-rigged humanoid characters — "Miko" (cyan) and "Luma" (taller,
 * warm gold) — built on a FULL humanoid bone chain so the standard retargeter and
 * the resolver's rig grader both read them as A-grade:
 *
 *   hips → spine → chest → neck → head
 *   chest → {left,right}Shoulder → UpperArm → LowerArm → Hand
 *   hips  → {left,right}UpperLeg → LowerLeg → Foot → Toes
 *
 * That is 22 standard-named joints (vs. the legacy 7-node mascot), so the limb
 * chains needed for gesture / point / walk / foot-work are all present — the rig is
 * meaningfully higher fidelity, not a stub. Joint NODE NAMES use the canonical
 * Mixamo/VRM-style names ("hips","spine","chest","neck","head","leftShoulder",
 * "leftUpperArm","leftLowerArm","leftHand","leftUpperLeg","leftLowerLeg","leftFoot",
 * "leftToes", …) so `resolve-asset.ts`'s humanoid/arm/leg hint detector and the
 * engine's `inferHumanoidRig` recognise the skeleton.
 *
 * The mesh is built from SMOOTH ELLIPSOID/CAPSULE limb segments (UV-sphere lobes),
 * one segment rigidly skinned per joint plus blended shoulder/hip joins, at higher
 * ring/sector resolution than the legacy mascot, so the silhouette reads as a
 * articulated figure rather than stacked crates. Each character ships FIVE materials
 * (body / skin / dark / glow / accent) for real vertex-colour-like shading variety
 * — emitted as separate glTF primitives that share one skin.
 *
 * Each GLB contains:
 *   - a skinned mesh split into primitives by material (POSITION / NORMAL +
 *     JOINTS_0 / WEIGHTS_0), every primitive carrying the `mouthOpen` morph target
 *     (zero deltas except on the mouth lobe) so the glTF morph constraint holds,
 *   - the 22-joint humanoid skeleton, with skins[].inverseBindMatrices,
 *   - 4 animation clips — Idle, Wave, Walk, Talk — sampling node rotations/translations
 *     across spine/arms/legs (real limb motion, not just a head bob),
 *   - ONE mouth morph target named `mouthOpen` (POSITION deltas that drop the mouth
 *     lobe to open the mouth), exposed via each primitive `targets`, the mesh
 *     `weights`, and `meshes[].extras.targetNames = ["mouthOpen"]`.
 *
 * LOW-FI fallback (`--low-fi`). The legacy 7-node rounded mascots are retained ONLY
 * behind an explicit `--low-fi` flag (previz / smoke-test cast). They are NOT the
 * default any more.
 *
 * The buffers are authored by hand (accessors / bufferViews / min-max), little
 * endian, 4-byte aligned, packed into one GLB BIN chunk. No three.js, no glTF
 * exporter dependency — just typed-array math.
 *
 * Run: `npx tsx scripts/build-characters.ts`          (default: humanoid cast)
 *      `npx tsx scripts/build-characters.ts --low-fi` (legacy 7-node mascots)
 * (also runnable from the monorepo with the same command in this directory.)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATLAS_REGIONS,
  bakeAtlasPNG,
  type AtlasRegion,
  type BakeColors,
  type RegionName
} from "./texture-bake.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(TEMPLATE_ROOT, "public/aura-assets");
const MANIFEST_PATH = resolve(TEMPLATE_ROOT, "aura.assets.json");

// ---------------------------------------------------------------------------
// Small math helpers (column-major mat4, glTF/Aura convention).
// ---------------------------------------------------------------------------
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Mat4 = number[]; // length 16, column-major

function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function invertTranslation(m: Mat4): Mat4 {
  // Our joint binds are pure translations, so the inverse-bind is just a negated
  // translation. (Computed generically would also work; this keeps it exact.)
  return translation(-m[12]!, -m[13]!, -m[14]!);
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  return [(axis[0] / len) * s, (axis[1] / len) * s, (axis[2] / len) * s, Math.cos(half)];
}

// ---------------------------------------------------------------------------
// Geometry builder: accumulate smooth ellipsoid lobes into skinned meshes,
// grouped by material so eyes/mouth get their own colour.
// ---------------------------------------------------------------------------
interface MeshAccumulator {
  positions: number[]; // xyz triples
  normals: number[]; // xyz triples
  joints: number[]; // 4 per vertex (joint indices)
  weights: number[]; // 4 per vertex
  indices: number[];
  morphDeltas: number[]; // xyz triples, one per vertex (mouthOpen)
  uvs: number[]; // uv pairs, one per vertex (TEXCOORD_0; filled by assignAtlasUVs)
}

function makeAccumulator(): MeshAccumulator {
  return { positions: [], normals: [], joints: [], weights: [], indices: [], morphDeltas: [], uvs: [] };
}

interface EllipsoidOptions {
  /** Lobe center in model space. */
  readonly center: Vec3;
  /** Ellipsoid radii along each axis. */
  readonly radii: Vec3;
  /** Joint index every vertex of this lobe is rigidly bound to (weight 1). */
  readonly joint: number;
  /** Optional mouthOpen morph delta applied to every vertex of this lobe. */
  readonly morphDelta?: Vec3;
  readonly rings?: number;
  readonly sectors?: number;
}

/** Append a smooth ellipsoid (UV sphere scaled by radii) skinned to one joint. */
function addEllipsoid(mesh: MeshAccumulator, options: EllipsoidOptions): void {
  const rings = options.rings ?? 24;
  const sectors = options.sectors ?? 32;
  const morph = options.morphDelta ?? [0, 0, 0];
  const base = mesh.positions.length / 3;
  for (let r = 0; r <= rings; r += 1) {
    const phi = (r / rings) * Math.PI; // 0..pi (top -> bottom)
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    for (let s = 0; s <= sectors; s += 1) {
      const theta = (s / sectors) * Math.PI * 2;
      const nx = sinP * Math.cos(theta);
      const ny = cosP;
      const nz = sinP * Math.sin(theta);
      mesh.positions.push(
        options.center[0] + nx * options.radii[0],
        options.center[1] + ny * options.radii[1],
        options.center[2] + nz * options.radii[2]
      );
      // Ellipsoid normal = normalize(unitDir / radii).
      let mnx = nx / options.radii[0];
      let mny = ny / options.radii[1];
      let mnz = nz / options.radii[2];
      const nl = Math.hypot(mnx, mny, mnz) || 1;
      mnx /= nl;
      mny /= nl;
      mnz /= nl;
      mesh.normals.push(mnx, mny, mnz);
      mesh.joints.push(options.joint, 0, 0, 0);
      mesh.weights.push(1, 0, 0, 0);
      mesh.morphDeltas.push(morph[0], morph[1], morph[2]);
    }
  }
  const stride = sectors + 1;
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < sectors; s += 1) {
      const a = base + r * stride + s;
      const b = base + (r + 1) * stride + s;
      const c = base + (r + 1) * stride + s + 1;
      const d = base + r * stride + s + 1;
      // Wound for outward-facing normals (front +z faces the camera).
      mesh.indices.push(a, d, b, b, d, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Skeleton definition. Joint indices are referenced by JOINTS_0 above.
// Bind transforms are pure translations placing each joint in model space.
// ---------------------------------------------------------------------------
interface JointDef {
  readonly name: string;
  readonly parent: number; // -1 for root
  readonly bind: Vec3; // model-space bind translation (relative to parent)
}

// Material indices (one glTF primitive per material). The humanoid cast uses all five;
// the legacy mascot uses only BODY/DARK/GLOW (the extra two stay empty → no primitive).
const MAT_BODY = 0; // torso / limb cloth
const MAT_DARK = 1; // pupils + mouth + boots/gloves
const MAT_GLOW = 2; // eyes + accent tip
const MAT_SKIN = 3; // head / hands (warmer skin tone) — humanoid only
const MAT_ACCENT = 4; // belt / collar / trim — humanoid only

// Each material primitive samples its OWN region of the shared base-colour atlas. This
// maps a glTF material index to its atlas region (see texture-bake.ts ATLAS_REGIONS).
const REGION_FOR_MATERIAL: Record<number, RegionName> = {
  [MAT_BODY]: "body",
  [MAT_DARK]: "dark",
  [MAT_GLOW]: "glow",
  [MAT_SKIN]: "skin",
  [MAT_ACCENT]: "accent"
};

/**
 * Assign PLANAR UVs for every vertex of a material accumulator into that material's atlas
 * region. We project on the part's dominant plane: front-facing parts (head/body/eyes)
 * unwrap on XY, top/sole-facing parts fall back to XZ if the part is flatter in Y. A small
 * inset keeps UVs off the region's bilinear-bleed gutter. This is a genuine per-part planar
 * unwrap (not a single shared quad), so the baked shading lands consistently across the body.
 */
function assignAtlasUVs(mesh: MeshAccumulator, region: AtlasRegion): void {
  const n = mesh.positions.length / 3;
  if (n === 0) {
    mesh.uvs = [];
    return;
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const x = mesh.positions[i * 3]!;
    const y = mesh.positions[i * 3 + 1]!;
    const z = mesh.positions[i * 3 + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const spanX = maxX - minX || 1e-4;
  const spanY = maxY - minY || 1e-4;
  const spanZ = maxZ - minZ || 1e-4;
  // Project on XY normally; if the part is much flatter vertically than in depth (a sole /
  // belt slab), project on XZ so the top face still receives texel detail.
  const useXZ = spanY < spanX * 0.45 && spanY < spanZ * 0.45;
  const inset = 0.04; // keep UVs inside the region gutter
  const ru = (region.u1 - region.u0) * (1 - inset * 2);
  const rv = (region.v1 - region.v0) * (1 - inset * 2);
  const ou = region.u0 + (region.u1 - region.u0) * inset;
  const ov = region.v0 + (region.v1 - region.v0) * inset;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = mesh.positions[i * 3]!;
    const y = mesh.positions[i * 3 + 1]!;
    const z = mesh.positions[i * 3 + 2]!;
    let lu: number;
    let lv: number;
    if (useXZ) {
      lu = (x - minX) / spanX;
      lv = (z - minZ) / spanZ;
    } else {
      lu = (x - minX) / spanX;
      // Flip V so texture "top" (forehead / region top) aligns with the part's top (+Y).
      lv = 1 - (y - minY) / spanY;
    }
    out.push(ou + lu * ru, ov + lv * rv);
  }
  mesh.uvs = out;
}

type AccessoryStyle = "antenna" | "ears";

interface CharacterDesign {
  readonly id: string;
  readonly name: string;
  /** Body color (base color factor of the body material). */
  readonly bodyColor: [number, number, number, number];
  /** Glow/eye accent color. */
  readonly accentColor: [number, number, number, number];
  /** Skin tone (head + hands) — humanoid cast. */
  readonly skinColor: [number, number, number, number];
  /** Belt / collar / trim — humanoid cast. */
  readonly trimColor: [number, number, number, number];
  /** Overall vertical scale multiplier (Luma is taller than Miko). */
  readonly heightScale: number;
  /** Limb/body girth multiplier (Miko is rounder/chunkier). */
  readonly girth: number;
  /** Head-top accessory that differentiates the silhouettes. */
  readonly accessory: AccessoryStyle;
}

// ---------------------------------------------------------------------------
// HUMANOID skeleton (default) — a FULL 22-joint chain with canonical bone NODE
// NAMES so the resolver's humanoid/arm/leg hint detector and the engine's
// inferHumanoidRig recognise it as a graded-A rig. Binds are pure translations
// relative to the parent, laying the figure out in a standard T/A pose.
// ---------------------------------------------------------------------------
const HUMANOID_JOINTS: readonly JointDef[] = [
  { name: "hips", parent: -1, bind: [0, 0.95, 0] },
  { name: "spine", parent: 0, bind: [0, 0.16, 0] },
  { name: "chest", parent: 1, bind: [0, 0.18, 0] },
  { name: "neck", parent: 2, bind: [0, 0.16, 0] },
  { name: "head", parent: 3, bind: [0, 0.10, 0] },
  // Left arm chain (chest → shoulder → upperArm → lowerArm → hand). Laid out in a
  // relaxed A-pose (down + out) rather than a wide T so the silhouette reads naturally.
  { name: "leftShoulder", parent: 2, bind: [0.07, 0.10, 0] },
  { name: "leftUpperArm", parent: 5, bind: [0.11, -0.02, 0] },
  { name: "leftLowerArm", parent: 6, bind: [0.14, -0.20, 0] },
  { name: "leftHand", parent: 7, bind: [0.10, -0.18, 0] },
  // Right arm chain.
  { name: "rightShoulder", parent: 2, bind: [-0.07, 0.10, 0] },
  { name: "rightUpperArm", parent: 9, bind: [-0.11, -0.02, 0] },
  { name: "rightLowerArm", parent: 10, bind: [-0.14, -0.20, 0] },
  { name: "rightHand", parent: 11, bind: [-0.10, -0.18, 0] },
  // Left leg chain (hips → upperLeg → lowerLeg → foot → toes).
  { name: "leftUpperLeg", parent: 0, bind: [0.11, -0.05, 0] },
  { name: "leftLowerLeg", parent: 13, bind: [0, -0.40, 0] },
  { name: "leftFoot", parent: 14, bind: [0, -0.40, 0] },
  { name: "leftToes", parent: 15, bind: [0, -0.04, 0.10] },
  // Right leg chain.
  { name: "rightUpperLeg", parent: 0, bind: [-0.11, -0.05, 0] },
  { name: "rightLowerLeg", parent: 17, bind: [0, -0.40, 0] },
  { name: "rightFoot", parent: 18, bind: [0, -0.40, 0] },
  { name: "rightToes", parent: 19, bind: [0, -0.04, 0.10] }
];

// ---------------------------------------------------------------------------
// Legacy MASCOT skeleton (low-fi fallback) — the original 7-node rig.
// ---------------------------------------------------------------------------
const MASCOT_JOINTS: readonly JointDef[] = [
  { name: "root", parent: -1, bind: [0, 0, 0] },
  { name: "spine", parent: 0, bind: [0, 0.42, 0] },
  { name: "head", parent: 1, bind: [0, 0.5, 0] },
  { name: "armL", parent: 1, bind: [0.26, 0.16, 0] },
  { name: "armR", parent: 1, bind: [-0.26, 0.16, 0] },
  { name: "legL", parent: 0, bind: [0.13, 0, 0] },
  { name: "legR", parent: 0, bind: [-0.13, 0, 0] }
];

// The active skeleton is selected at startup by the --low-fi flag (see main()).
const LOW_FI = process.argv.includes("--low-fi");
const JOINTS: readonly JointDef[] = LOW_FI ? MASCOT_JOINTS : HUMANOID_JOINTS;

const JOINT_INDEX = Object.fromEntries(JOINTS.map((joint, index) => [joint.name, index])) as Record<string, number>;

/** World-space bind position of a joint (sum of bind translations up the chain). */
function jointWorldBind(index: number): Vec3 {
  let current = index;
  const out: Vec3 = [0, 0, 0];
  while (current >= 0) {
    const joint = JOINTS[current]!;
    out[0] += joint.bind[0];
    out[1] += joint.bind[1];
    out[2] += joint.bind[2];
    current = joint.parent;
  }
  return out;
}

/** Dispatch to the active body builder (humanoid by default, mascot under --low-fi). */
function buildBody(design: CharacterDesign): Map<number, MeshAccumulator> {
  const parts = LOW_FI ? buildMascotBody(design) : buildHumanoidBody(design);
  // Planar-unwrap each material's geometry into its atlas region so every primitive
  // carries TEXCOORD_0 that samples the baked base-colour texture.
  for (const [materialIndex, mesh] of parts) {
    const regionName = REGION_FOR_MATERIAL[materialIndex];
    if (regionName) assignAtlasUVs(mesh, ATLAS_REGIONS[regionName]);
  }
  return parts;
}

/**
 * Build a rounded mascot skinned to the legacy MASCOT_JOINTS, with a mouthOpen morph
 * on the mouth lobe. Returns one MeshAccumulator per material index. (Low-fi fallback.)
 */
function buildMascotBody(design: CharacterDesign): Map<number, MeshAccumulator> {
  const parts = new Map<number, MeshAccumulator>([
    [MAT_BODY, makeAccumulator()],
    [MAT_DARK, makeAccumulator()],
    [MAT_GLOW, makeAccumulator()]
  ]);
  const body = parts.get(MAT_BODY)!;
  const dark = parts.get(MAT_DARK)!;
  const glow = parts.get(MAT_GLOW)!;
  const g = design.girth;
  const h = design.heightScale;

  const headW = jointWorldBind(JOINT_INDEX.head!);
  const spineW = jointWorldBind(JOINT_INDEX.spine!);
  const armLW = jointWorldBind(JOINT_INDEX.armL!);
  const armRW = jointWorldBind(JOINT_INDEX.armR!);
  const legLW = jointWorldBind(JOINT_INDEX.legL!);
  const legRW = jointWorldBind(JOINT_INDEX.legR!);

  // Egg body (bound to spine).
  addEllipsoid(body, {
    center: [spineW[0], spineW[1] + 0.02 * h, spineW[2]],
    radii: [0.32 * g, 0.34 * h, 0.30 * g],
    joint: JOINT_INDEX.spine!
  });
  // Big round head (bound to head) — large head reads "cute mascot".
  addEllipsoid(body, {
    center: [headW[0], headW[1] + 0.06 * h, headW[2]],
    radii: [0.40 * g, 0.38 * h, 0.40 * g],
    joint: JOINT_INDEX.head!
  });

  // Eyes — glowing accent lobes on the front of the face.
  const eyeY = headW[1] + 0.10 * h;
  const eyeZ = headW[2] + 0.32 * g;
  for (const sx of [1, -1]) {
    addEllipsoid(glow, {
      center: [headW[0] + sx * 0.15 * g, eyeY, eyeZ],
      radii: [0.10 * g, 0.12 * h, 0.07 * g],
      joint: JOINT_INDEX.head!,
      rings: 10,
      sectors: 12
    });
    // Dark pupil just in front of each eye.
    addEllipsoid(dark, {
      center: [headW[0] + sx * 0.15 * g, eyeY, eyeZ + 0.04 * g],
      radii: [0.045 * g, 0.06 * h, 0.045 * g],
      joint: JOINT_INDEX.head!,
      rings: 8,
      sectors: 10
    });
  }

  // Mouth — dark lobe below the eyes WITH the mouthOpen morph (drops to open).
  addEllipsoid(dark, {
    center: [headW[0], headW[1] - 0.07 * h, headW[2] + 0.34 * g],
    radii: [0.12 * g, 0.05 * h, 0.05 * g],
    joint: JOINT_INDEX.head!,
    rings: 8,
    sectors: 12,
    morphDelta: [0, -0.14 * h, 0.02 * g]
  });

  // Arms (bound to armL / armR) — rounded, hanging at the sides — with hand nubs.
  for (const [armW, joint, sx] of [
    [armLW, JOINT_INDEX.armL!, 1],
    [armRW, JOINT_INDEX.armR!, -1]
  ] as const) {
    addEllipsoid(body, {
      center: [armW[0] + sx * 0.04 * g, armW[1] - 0.16 * h, armW[2]],
      radii: [0.10 * g, 0.20 * h, 0.10 * g],
      joint,
      rings: 10,
      sectors: 12
    });
    addEllipsoid(body, {
      center: [armW[0] + sx * 0.05 * g, armW[1] - 0.34 * h, armW[2]],
      radii: [0.09 * g, 0.09 * h, 0.09 * g],
      joint,
      rings: 8,
      sectors: 10
    });
  }

  // Feet (bound to legL / legR) — rounded.
  for (const [legW, joint] of [
    [legLW, JOINT_INDEX.legL!],
    [legRW, JOINT_INDEX.legR!]
  ] as const) {
    addEllipsoid(body, {
      center: [legW[0], legW[1] - 0.20 * h, legW[2] + 0.04 * g],
      radii: [0.13 * g, 0.14 * h, 0.17 * g],
      joint,
      rings: 10,
      sectors: 12
    });
  }

  // Per-character head accessory (distinct silhouettes).
  if (design.accessory === "antenna") {
    // Thin stalk + glowing tip ball.
    addEllipsoid(body, {
      center: [headW[0], headW[1] + 0.42 * h, headW[2]],
      radii: [0.03 * g, 0.13 * h, 0.03 * g],
      joint: JOINT_INDEX.head!,
      rings: 8,
      sectors: 8
    });
    addEllipsoid(glow, {
      center: [headW[0], headW[1] + 0.57 * h, headW[2]],
      radii: [0.075 * g, 0.075 * h, 0.075 * g],
      joint: JOINT_INDEX.head!,
      rings: 10,
      sectors: 12
    });
  } else {
    // Two tall ear bumps on top of the head.
    for (const sx of [1, -1]) {
      addEllipsoid(body, {
        center: [headW[0] + sx * 0.22 * g, headW[1] + 0.34 * h, headW[2]],
        radii: [0.10 * g, 0.17 * h, 0.09 * g],
        joint: JOINT_INDEX.head!,
        rings: 10,
        sectors: 12
      });
    }
  }

  return parts;
}

interface LimbOptions {
  /** Cross-section radius at the `from` (parent) end. */
  readonly rFrom: number;
  /** Cross-section radius at the `to` (child) end. Defaults to `rFrom` (no taper). */
  readonly rTo?: number;
  /** Joint that owns the `from` end (weight 1 there). */
  readonly joint: number;
  /**
   * Optional joint that owns the `to` end. When given, vertices blend smoothly from
   * `joint` → `childJoint` along the bone so the limb deforms naturally across the
   * elbow/knee instead of tearing. When omitted the whole segment is rigid to `joint`.
   */
  readonly childJoint?: number;
  readonly rings?: number;
  readonly sectors?: number;
}

/**
 * Append a tapered CAPSULE limb segment along the parent→child axis. The cross-section
 * radius is interpolated from `rFrom` (parent end) to `rTo` (child end) so the arm/leg
 * naturally narrows toward the wrist/ankle, and the surface is closed with smooth round
 * caps. Higher default ring/sector counts than before for a smoother silhouette.
 *
 * Skinning: if `childJoint` is supplied, each vertex's weight is split between the parent
 * and child joints by its position along the bone (a smoothstep centred on the midpoint),
 * so the join at the next joint bends rather than separates. Otherwise the segment is
 * rigidly skinned to `joint` (weight 1).
 */
function addLimbSegment(mesh: MeshAccumulator, from: Vec3, to: Vec3, options: LimbOptions): void {
  const rings = options.rings ?? 24;
  const sectors = options.sectors ?? 28;
  const rFrom = options.rFrom;
  const rTo = options.rTo ?? options.rFrom;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const capR = Math.max(rFrom, rTo);
  const half = len / 2 + capR * 0.5; // slight overlap at the joints for a continuous surface
  const ux = dx / len, uy = dy / len, uz = dz / len; // unit bone direction
  // Orthonormal basis with the bone direction as the local +Y axis.
  let ax = 1, ay = 0, az = 0;
  if (Math.abs(uy) > 0.99) { ax = 1; ay = 0; az = 0; } // arbitrary perpendicular for vertical bones
  // Gram-Schmidt: e1 = normalize(a - (a·u)u)
  const d = ax * ux + ay * uy + az * uz;
  let e1x = ax - d * ux, e1y = ay - d * uy, e1z = az - d * uz;
  const e1l = Math.hypot(e1x, e1y, e1z) || 1; e1x /= e1l; e1y /= e1l; e1z /= e1l;
  // e2 = u × e1
  const e2x = uy * e1z - uz * e1y;
  const e2y = uz * e1x - ux * e1z;
  const e2z = ux * e1y - uy * e1x;
  const base = mesh.positions.length / 3;
  const smoothstep = (t: number): number => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  for (let ri = 0; ri <= rings; ri += 1) {
    const v = ri / rings;            // 0..1 along the bone (0 = parent end)
    const y = (v - 0.5) * 2 * half;  // local Y position (-half..half)
    // Tapered radius parent→child, with rounded end caps (sin envelope near the tips).
    const lerpR = rFrom + (rTo - rFrom) * v;
    const cap = Math.sin(Math.PI * v); // 0 at tips, 1 at middle
    const cr = lerpR * (0.78 + 0.22 * cap);
    // Weight blend along the bone (only meaningful when childJoint is given). The child
    // joint takes over across a band centred on the limb midpoint.
    const wChild = options.childJoint !== undefined ? smoothstep((v - 0.35) / 0.5) : 0;
    const wParent = 1 - wChild;
    for (let si = 0; si <= sectors; si += 1) {
      const theta = (si / sectors) * Math.PI * 2;
      const lx = Math.cos(theta) * cr;
      const lz = Math.sin(theta) * cr;
      // world = mid + lx*e1 + y*u + lz*e2
      const px = mid[0] + lx * e1x + y * ux + lz * e2x;
      const py = mid[1] + lx * e1y + y * uy + lz * e2y;
      const pz = mid[2] + lx * e1z + y * uz + lz * e2z;
      mesh.positions.push(px, py, pz);
      // Normal points radially outward (lx*e1 + lz*e2 direction).
      let nx = lx * e1x + lz * e2x;
      let ny = lx * e1y + lz * e2y;
      let nz = lx * e1z + lz * e2z;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      mesh.normals.push(nx, ny, nz);
      if (options.childJoint !== undefined && wChild > 0) {
        mesh.joints.push(options.joint, options.childJoint, 0, 0);
        mesh.weights.push(wParent, wChild, 0, 0);
      } else {
        mesh.joints.push(options.joint, 0, 0, 0);
        mesh.weights.push(1, 0, 0, 0);
      }
      mesh.morphDeltas.push(0, 0, 0);
    }
  }
  const stride = sectors + 1;
  for (let ri = 0; ri < rings; ri += 1) {
    for (let si = 0; si < sectors; si += 1) {
      const a = base + ri * stride + si;
      const b = base + (ri + 1) * stride + si;
      const c = base + (ri + 1) * stride + si + 1;
      const dd = base + ri * stride + si + 1;
      mesh.indices.push(a, dd, b, b, dd, c);
    }
  }
}

interface HandOptions {
  /** Wrist position (the joint origin the whole hand is skinned to). */
  readonly wrist: Vec3;
  /** Unit vector pointing from the wrist toward the fingertips (the arm axis, away from body). */
  readonly forward: Vec3;
  /** Joint index every vertex of the hand is rigidly bound to (the hand joint). */
  readonly joint: number;
  /** Overall girth multiplier (design.girth). */
  readonly g: number;
  /** Overall vertical scale (design.heightScale). */
  readonly h: number;
}

/**
 * Append a STYLISED CARTOON HAND skinned rigidly to the hand joint: a flattened palm
 * box-ish lobe plus four short finger nubs along the leading edge and a thumb nub off the
 * inner side. It is deliberately low-detail (stubby, merged-looking digits) — a cartoon
 * mitten-hand that reads as a hand rather than a paddle, NOT an anatomically separated set
 * of fingers (separating them risks self-intersection at the knuckles under the dual-bone
 * blend, and we keep the skeleton at 21 joints with no per-finger bones, so every digit is
 * rigid to the single hand joint).
 *
 * The hand is built in a local frame: +F = forward (toward fingertips), +U = world up-ish,
 * +S = side (thumb side). Fingers fan slightly so the silhouette isn't a single slab.
 */
function addHand(mesh: MeshAccumulator, options: HandOptions): void {
  const { wrist, joint, g, h } = options;
  // Orthonormal hand frame. F = forward (down the arm). U = a world-up-ish vector made
  // perpendicular to F. S = F × U (the palm's side axis, toward the thumb on +S).
  const fl = Math.hypot(options.forward[0], options.forward[1], options.forward[2]) || 1;
  const F: Vec3 = [options.forward[0] / fl, options.forward[1] / fl, options.forward[2] / fl];
  let upx = 0, upy = 1, upz = 0;
  const dotFU = F[0] * upx + F[1] * upy + F[2] * upz;
  let Ux = upx - dotFU * F[0], Uy = upy - dotFU * F[1], Uz = upz - dotFU * F[2];
  const ul = Math.hypot(Ux, Uy, Uz) || 1; Ux /= ul; Uy /= ul; Uz /= ul;
  const U: Vec3 = [Ux, Uy, Uz];
  const S: Vec3 = [
    F[1] * U[2] - F[2] * U[1],
    F[2] * U[0] - F[0] * U[2],
    F[0] * U[1] - F[1] * U[0]
  ];
  // Map a local (f,u,s) offset (in metres) to world space from the wrist.
  const at = (f: number, u: number, s: number): Vec3 => [
    wrist[0] + F[0] * f + U[0] * u + S[0] * s,
    wrist[1] + F[1] * f + U[1] * u + S[1] * s,
    wrist[2] + F[2] * f + U[2] * u + S[2] * s
  ];

  // Palm — a flattened ellipsoid (thin along U, wider along S) just past the wrist.
  const palmF = 0.05 * g;       // palm centre distance from wrist along the arm
  const palmHalfLen = 0.055 * g; // palm reach toward the knuckles
  addEllipsoid(mesh, {
    center: at(palmF, -0.01 * h, 0),
    radii: [0.058 * g, 0.026 * h, 0.05 * g],
    joint, rings: 14, sectors: 18
  });

  // Four finger nubs fanned across the leading (knuckle) edge of the palm. Each is a small
  // capsule from a knuckle point out to a fingertip; stubby (cartoon) length.
  const knuckleF = palmF + palmHalfLen * 0.8;
  const fingerLen = 0.045 * g;
  const fingerR = 0.016 * g;
  // Side offsets for the 4 fingers (index→pinky), slightly fanned and shortened toward pinky.
  const fingerSpread: readonly { s: number; len: number }[] = [
    { s: 0.034 * g, len: fingerLen * 0.92 },  // index
    { s: 0.011 * g, len: fingerLen * 1.0 },   // middle (longest)
    { s: -0.012 * g, len: fingerLen * 0.95 }, // ring
    { s: -0.034 * g, len: fingerLen * 0.8 }   // pinky (shortest)
  ];
  for (const finger of fingerSpread) {
    const root = at(knuckleF, -0.005 * h, finger.s);
    // Fan: tips spread a touch further apart in S than the roots.
    const tip = at(knuckleF + finger.len, 0.004 * h, finger.s * 1.18);
    addLimbSegment(mesh, root, tip, {
      rFrom: fingerR, rTo: fingerR * 0.7, joint, rings: 8, sectors: 10
    });
  }

  // Thumb — a stubbier, lower nub off the inner (+S) side of the palm, angled back toward
  // the body and downward so it reads as opposable rather than a 5th finger in the row.
  const thumbRoot = at(palmF * 0.6, -0.012 * h, 0.05 * g);
  const thumbTip = at(palmF * 0.6 + 0.03 * g, -0.022 * h, 0.075 * g);
  addLimbSegment(mesh, thumbRoot, thumbTip, {
    rFrom: 0.018 * g, rTo: 0.013 * g, joint, rings: 8, sectors: 10
  });
}

/**
 * Build a properly-rigged HUMANOID skinned to HUMANOID_JOINTS (default cast). Every
 * limb segment is skinned to its own joint, so the full performance vocabulary
 * (gesture / point / walk / foot-work) drives real geometry. Returns one
 * MeshAccumulator per material index (body/skin/dark/glow/accent).
 */
function buildHumanoidBody(design: CharacterDesign): Map<number, MeshAccumulator> {
  const parts = new Map<number, MeshAccumulator>([
    [MAT_BODY, makeAccumulator()],
    [MAT_DARK, makeAccumulator()],
    [MAT_GLOW, makeAccumulator()],
    [MAT_SKIN, makeAccumulator()],
    [MAT_ACCENT, makeAccumulator()]
  ]);
  const body = parts.get(MAT_BODY)!;
  const dark = parts.get(MAT_DARK)!;
  const glow = parts.get(MAT_GLOW)!;
  const skin = parts.get(MAT_SKIN)!;
  const accent = parts.get(MAT_ACCENT)!;
  const g = design.girth;
  const h = design.heightScale;
  const w = (name: string): Vec3 => jointWorldBind(JOINT_INDEX[name]!);
  const J = (name: string): number => JOINT_INDEX[name]!;

  // ── Torso: hips (pelvis) → spine (narrow waist) → chest (broad ribcage). The radii
  // now taper like a real torso — wide-ish pelvis, pinched waist, broad chest — instead
  // of three near-equal stacked balls, so the silhouette reads as a person, not a snowman.
  // Each lobe is a connecting tapered segment between its joint and the next joint so the
  // torso is one continuous tube; the lobe at each joint blends weight into the next bone.
  addLimbSegment(body, w("hips"), w("spine"), {
    rFrom: 0.165 * g, rTo: 0.125 * g, joint: J("hips"), childJoint: J("spine")
  });
  addLimbSegment(body, w("spine"), w("chest"), {
    rFrom: 0.125 * g, rTo: 0.185 * g, joint: J("spine"), childJoint: J("chest")
  });
  // Chest cap: broad upper ribcage rounding off toward the shoulders/neck.
  addEllipsoid(body, { center: [w("chest")[0], w("chest")[1] + 0.04 * h, w("chest")[2]], radii: [0.195 * g, 0.13 * h, 0.135 * g], joint: J("chest") });
  // Pelvis cap so the bottom of the torso closes smoothly above the legs.
  addEllipsoid(body, { center: [w("hips")[0], w("hips")[1] - 0.02 * h, w("hips")[2]], radii: [0.165 * g, 0.11 * h, 0.13 * g], joint: J("hips") });
  // Belt at the hips + collar at the chest (accent trim).
  addEllipsoid(accent, { center: [w("hips")[0], w("hips")[1] + 0.07 * h, w("hips")[2]], radii: [0.155 * g, 0.035 * h, 0.125 * g], joint: J("hips") });
  addEllipsoid(accent, { center: [w("chest")[0], w("chest")[1] + 0.105 * h, w("chest")[2]], radii: [0.135 * g, 0.04 * h, 0.115 * g], joint: J("neck") });

  // ── Neck (tapered into the chest + head) + head (skin tone). ──
  addLimbSegment(skin, [w("neck")[0], w("neck")[1] - 0.03 * h, w("neck")[2]], [w("neck")[0], w("neck")[1] + 0.06 * h, w("neck")[2]], {
    rFrom: 0.072 * g, rTo: 0.058 * g, joint: J("chest"), childJoint: J("head"), rings: 12, sectors: 20
  });
  const headW = [w("head")[0], w("head")[1] + 0.07 * h, w("head")[2]] as Vec3;
  // Head is slightly egg-shaped (a touch narrower at the jaw) for a more human skull.
  addEllipsoid(skin, { center: headW, radii: [0.145 * g, 0.165 * h, 0.15 * g], joint: J("head"), rings: 28, sectors: 36 });
  // Small jaw/chin lobe so the lower face isn't a perfect sphere.
  addEllipsoid(skin, { center: [headW[0], headW[1] - 0.10 * h, headW[2] + 0.03 * g], radii: [0.095 * g, 0.075 * h, 0.105 * g], joint: J("head"), rings: 16, sectors: 22 });

  // ── Face geometry (skin) that FRAMES the eye spheres so they read as set in sockets,
  // plus a brow ridge, defined nose bridge, and an upper-lip/chin shelf around the mouth.
  // We build the face additively from skin lobes (the head is one sphere; we can't boolean
  // a recess), so "sockets" are formed by a raised brow above + raised cheek/lower-lid
  // below each eye, leaving the eye sitting in the gap between them. This reads as an eye
  // socket in silhouette and shading without changing the skeleton or the eye spheres.
  const eyeY = headW[1] + 0.02 * h;
  const eyeZ = headW[2] + 0.12 * g;
  const eyeDX = 0.055 * g;
  // Brow ridge — one skin bar spanning above both eyes, slightly proud of the face so the
  // forehead overhangs the eyes (the top of each socket).
  addEllipsoid(skin, {
    center: [headW[0], eyeY + 0.05 * h, headW[2] + 0.115 * g],
    radii: [0.115 * g, 0.024 * h, 0.045 * g],
    joint: J("head"), rings: 12, sectors: 22
  });
  for (const sx of [1, -1]) {
    // Lower lid / cheekbone — a small skin ridge just below & outside each eye, forming the
    // bottom of the socket so the eye nestles between brow (above) and cheek (below).
    addEllipsoid(skin, {
      center: [headW[0] + sx * (eyeDX + 0.006 * g), eyeY - 0.042 * h, headW[2] + 0.108 * g],
      radii: [0.046 * g, 0.02 * h, 0.04 * g],
      joint: J("head"), rings: 10, sectors: 16
    });
    // Eyeball (glow) seated slightly back into the socket gap.
    addEllipsoid(glow, { center: [headW[0] + sx * eyeDX, eyeY, eyeZ], radii: [0.04 * g, 0.05 * h, 0.03 * g], joint: J("head"), rings: 14, sectors: 18 });
    // Pupil (dark) on the front of the eyeball.
    addEllipsoid(dark, { center: [headW[0] + sx * eyeDX, eyeY, eyeZ + 0.02 * g], radii: [0.018 * g, 0.024 * h, 0.018 * g], joint: J("head"), rings: 12, sectors: 14 });
  }
  // Nose — a vertical skin bridge from between the brows down to the tip, raised off the
  // face so it casts/reads as a real nose between the two sockets.
  addEllipsoid(skin, { center: [headW[0], eyeY - 0.01 * h, headW[2] + 0.135 * g], radii: [0.018 * g, 0.05 * h, 0.03 * g], joint: J("head"), rings: 12, sectors: 14 });
  addEllipsoid(skin, { center: [headW[0], headW[1] - 0.02 * h, headW[2] + 0.15 * g], radii: [0.026 * g, 0.03 * h, 0.034 * g], joint: J("head"), rings: 12, sectors: 14 });
  // Upper-lip / mouth shelf (skin) — a small raised band above the mouth so the mouth sits
  // in a defined area rather than floating on the jaw.
  addEllipsoid(skin, { center: [headW[0], headW[1] - 0.055 * h, headW[2] + 0.135 * g], radii: [0.055 * g, 0.02 * h, 0.028 * g], joint: J("head"), rings: 10, sectors: 18 });
  // Mouth (dark, with mouthOpen morph) — unchanged drop-to-open morph keeps lip-sync working.
  addEllipsoid(dark, {
    center: [headW[0], headW[1] - 0.08 * h, headW[2] + 0.13 * g],
    radii: [0.05 * g, 0.022 * h, 0.025 * g],
    joint: J("head"),
    rings: 12, sectors: 18,
    morphDelta: [0, -0.06 * h, 0.01 * g]
  });
  // Hair / cap (accent) atop the head differentiates the silhouettes.
  if (design.accessory === "antenna") {
    addEllipsoid(accent, { center: [headW[0], headW[1] + 0.13 * h, headW[2] - 0.01 * g], radii: [0.155 * g, 0.10 * h, 0.155 * g], joint: J("head"), rings: 18, sectors: 24 });
    addEllipsoid(glow, { center: [headW[0], headW[1] + 0.24 * h, headW[2]], radii: [0.03 * g, 0.03 * h, 0.03 * g], joint: J("head"), rings: 12, sectors: 14 });
  } else {
    addEllipsoid(accent, { center: [headW[0], headW[1] + 0.12 * h, headW[2] - 0.02 * g], radii: [0.165 * g, 0.12 * h, 0.16 * g], joint: J("head"), rings: 18, sectors: 24 });
  }

  // ── Arms: shoulder lobe (blends chest→upperArm) + tapered upperArm + lowerArm + hand.
  // Upper arm is thicker at the deltoid and tapers to the elbow; forearm tapers to a
  // slim wrist. Each segment blends its weight into the next joint so elbows/wrists bend.
  for (const side of ["left", "right"] as const) {
    const sh = w(`${side}Shoulder`);
    const ua = w(`${side}UpperArm`);
    const la = w(`${side}LowerArm`);
    const hd = w(`${side}Hand`);
    // Rounded shoulder/deltoid — bound to the shoulder but pulling toward the upper arm.
    addEllipsoid(body, { center: [(sh[0] + ua[0]) / 2, (sh[1] + ua[1]) / 2, sh[2]], radii: [0.078 * g, 0.078 * h, 0.078 * g], joint: J(`${side}Shoulder`), rings: 16, sectors: 20 });
    addLimbSegment(body, ua, la, { rFrom: 0.062 * g, rTo: 0.046 * g, joint: J(`${side}UpperArm`), childJoint: J(`${side}LowerArm`) });
    // Elbow joint sphere blended across upper/lower arm so the bend stays continuous.
    addEllipsoid(body, { center: la, radii: [0.05 * g, 0.05 * h, 0.05 * g], joint: J(`${side}LowerArm`), rings: 14, sectors: 16 });
    addLimbSegment(body, la, hd, { rFrom: 0.046 * g, rTo: 0.036 * g, joint: J(`${side}LowerArm`), childJoint: J(`${side}Hand`) });
    // Hand (skin): a stylised cartoon hand — flattened palm + four short finger nubs + a
    // thumb — skinned rigidly to the hand joint. Forward = wrist→handTip direction (down the
    // arm, away from the body), so the fingers point away from the wrist. The thumb sits on
    // the +S (toward-body) side via the side offset in addHand.
    const forward: Vec3 = [hd[0] - la[0], hd[1] - la[1], hd[2] - la[2]];
    addHand(skin, { wrist: hd, forward, joint: J(`${side}Hand`), g, h });
  }

  // ── Legs: tapered thigh + shin + foot + toes, per side (boots are dark). Thigh is
  // thick at the hip and tapers to the knee; shin tapers to a slim ankle. Weights blend
  // into the next joint so knees and ankles bend.
  for (const side of ["left", "right"] as const) {
    const ul = w(`${side}UpperLeg`);
    const ll = w(`${side}LowerLeg`);
    const ft = w(`${side}Foot`);
    const to = w(`${side}Toes`);
    // Hip/thigh root sphere so the leg joins the pelvis smoothly.
    addEllipsoid(body, { center: [ul[0], ul[1] + 0.02 * h, ul[2]], radii: [0.092 * g, 0.092 * h, 0.092 * g], joint: J(`${side}UpperLeg`), rings: 16, sectors: 20 });
    addLimbSegment(body, ul, ll, { rFrom: 0.088 * g, rTo: 0.058 * g, joint: J(`${side}UpperLeg`), childJoint: J(`${side}LowerLeg`) });
    // Knee sphere blended across thigh/shin.
    addEllipsoid(body, { center: ll, radii: [0.062 * g, 0.062 * h, 0.062 * g], joint: J(`${side}LowerLeg`), rings: 14, sectors: 16 });
    addLimbSegment(body, ll, ft, { rFrom: 0.058 * g, rTo: 0.042 * g, joint: J(`${side}LowerLeg`), childJoint: J(`${side}Foot`) });
    // Foot + toe block (dark boot).
    addEllipsoid(dark, { center: [ft[0], ft[1] + 0.02 * h, ft[2] + 0.03 * g], radii: [0.06 * g, 0.05 * h, 0.10 * g], joint: J(`${side}Foot`), rings: 16, sectors: 18 });
    addEllipsoid(dark, { center: [to[0], to[1] + 0.02 * h, to[2] + 0.02 * g], radii: [0.055 * g, 0.04 * h, 0.06 * g], joint: J(`${side}Toes`), rings: 12, sectors: 14 });
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Animation clips. Each clip is a set of channels; a channel = (node, path,
// times[], values[]). We sample rotations (quaternion) and translations.
// ---------------------------------------------------------------------------
interface Channel {
  readonly jointName: string;
  readonly path: "rotation" | "translation";
  readonly times: number[];
  /** Flat values: 4 per keyframe for rotation, 3 for translation. */
  readonly values: number[];
}

interface Clip {
  readonly name: string;
  readonly channels: Channel[];
}

function rotChannel(jointName: string, times: number[], quats: Quat[]): Channel {
  return { jointName, path: "rotation", times, values: quats.flat() };
}

function transChannel(jointName: string, times: number[], translations: Vec3[]): Channel {
  return { jointName, path: "translation", times, values: translations.flat() };
}

/**
 * Bone-name map so the clip authors target the ACTIVE skeleton. The mascot and the
 * humanoid use different joint names; clips below reference these abstract slots and
 * are emitted only for joints that exist on the active skeleton.
 */
interface ClipBones {
  readonly spine: string;
  readonly head: string;
  readonly armL: string; // the joint a "wave"/"arm swing" rotates (upper arm)
  readonly armR: string;
  readonly legL: string; // the joint a "step" rotates (upper leg)
  readonly legR: string;
  readonly root: string; // the joint a body bob translates
  readonly forearmL?: string;
  readonly forearmR?: string;
}

function activeClipBones(): ClipBones {
  return LOW_FI
    ? { spine: "spine", head: "head", armL: "armL", armR: "armR", legL: "legL", legR: "legR", root: "root" }
    : { spine: "spine", head: "head", armL: "leftUpperArm", armR: "rightUpperArm", legL: "leftUpperLeg", legR: "rightUpperLeg", root: "hips", forearmL: "leftLowerArm", forearmR: "rightLowerArm" };
}

function buildClips(): Clip[] {
  const B = activeClipBones();
  // Idle: gentle spine sway + head bob (subtle).
  const idle: Clip = {
    name: "Idle",
    channels: [
      rotChannel(B.spine, [0, 1, 2], [
        quatFromAxisAngle([0, 0, 1], 0.04),
        quatFromAxisAngle([0, 0, 1], -0.04),
        quatFromAxisAngle([0, 0, 1], 0.04)
      ]),
      rotChannel(B.head, [0, 1, 2], [
        quatFromAxisAngle([1, 0, 0], -0.03),
        quatFromAxisAngle([1, 0, 0], 0.05),
        quatFromAxisAngle([1, 0, 0], -0.03)
      ])
    ]
  };

  // Wave: right arm raises and waves; spine leans slightly. On the humanoid the
  // forearm flexes too (real elbow motion), which the mascot can't do.
  const waveChannels: Channel[] = [
    rotChannel(B.armR, [0, 0.5, 1, 1.5, 2], [
      quatFromAxisAngle([0, 0, 1], 0),
      quatFromAxisAngle([0, 0, 1], -2.2),
      quatFromAxisAngle([0, 0, 1], -2.5),
      quatFromAxisAngle([0, 0, 1], -2.2),
      quatFromAxisAngle([0, 0, 1], -2.5)
    ]),
    rotChannel(B.spine, [0, 1, 2], [
      quatFromAxisAngle([0, 0, 1], 0.08),
      quatFromAxisAngle([0, 0, 1], 0.12),
      quatFromAxisAngle([0, 0, 1], 0.08)
    ])
  ];
  if (B.forearmR) {
    waveChannels.push(rotChannel(B.forearmR, [0, 0.5, 1, 1.5, 2], [
      quatFromAxisAngle([0, 1, 0], 0),
      quatFromAxisAngle([0, 1, 0], 0.6),
      quatFromAxisAngle([0, 1, 0], -0.4),
      quatFromAxisAngle([0, 1, 0], 0.6),
      quatFromAxisAngle([0, 1, 0], -0.4)
    ]));
  }
  const wave: Clip = { name: "Wave", channels: waveChannels };

  // Walk: alternating legs + arms swing, slight body bob in translation.
  const walk: Clip = {
    name: "Walk",
    channels: [
      rotChannel(B.legL, [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], 0.6),
        quatFromAxisAngle([1, 0, 0], -0.6),
        quatFromAxisAngle([1, 0, 0], 0.6)
      ]),
      rotChannel(B.legR, [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], -0.6),
        quatFromAxisAngle([1, 0, 0], 0.6),
        quatFromAxisAngle([1, 0, 0], -0.6)
      ]),
      rotChannel(B.armL, [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], -0.5),
        quatFromAxisAngle([1, 0, 0], 0.5),
        quatFromAxisAngle([1, 0, 0], -0.5)
      ]),
      rotChannel(B.armR, [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], 0.5),
        quatFromAxisAngle([1, 0, 0], -0.5),
        quatFromAxisAngle([1, 0, 0], 0.5)
      ]),
      transChannel(B.root, [0, 0.25, 0.5, 0.75, 1], [
        [0, 0, 0],
        [0, 0.05, 0],
        [0, 0, 0],
        [0, 0.05, 0],
        [0, 0, 0]
      ])
    ]
  };

  // Talk: conversational body life for dialogue scenes — head nods, spine breathes,
  // both forearms make small beat gestures (humanoid). The mascot gets the head/spine
  // version (no forearms), which is still a usable "talking" idle.
  const talkChannels: Channel[] = [
    rotChannel(B.head, [0, 0.6, 1.2, 1.8, 2.4], [
      quatFromAxisAngle([1, 0, 0], 0.06),
      quatFromAxisAngle([1, 0, 0], -0.05),
      quatFromAxisAngle([1, 0, 0], 0.04),
      quatFromAxisAngle([1, 0, 0], -0.06),
      quatFromAxisAngle([1, 0, 0], 0.06)
    ]),
    rotChannel(B.spine, [0, 1.2, 2.4], [
      quatFromAxisAngle([1, 0, 0], 0.02),
      quatFromAxisAngle([1, 0, 0], -0.03),
      quatFromAxisAngle([1, 0, 0], 0.02)
    ])
  ];
  if (B.forearmL && B.forearmR) {
    talkChannels.push(rotChannel(B.forearmL, [0, 0.8, 1.6, 2.4], [
      quatFromAxisAngle([1, 0, 0], -0.2),
      quatFromAxisAngle([1, 0, 0], -0.5),
      quatFromAxisAngle([1, 0, 0], -0.2),
      quatFromAxisAngle([1, 0, 0], -0.5)
    ]));
    talkChannels.push(rotChannel(B.forearmR, [0, 0.8, 1.6, 2.4], [
      quatFromAxisAngle([1, 0, 0], -0.5),
      quatFromAxisAngle([1, 0, 0], -0.2),
      quatFromAxisAngle([1, 0, 0], -0.5),
      quatFromAxisAngle([1, 0, 0], -0.2)
    ]));
  }
  const talk: Clip = { name: "Talk", channels: talkChannels };

  return [idle, wave, walk, talk];
}

// ---------------------------------------------------------------------------
// GLB encoder. Builds JSON + BIN chunk from accessors/bufferViews.
// ---------------------------------------------------------------------------
const COMPONENT_FLOAT = 5126;
const COMPONENT_USHORT = 5123;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

interface PendingAccessor {
  readonly bytes: Uint8Array;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly target?: number;
  readonly min?: number[];
  readonly max?: number[];
}

interface GLTFBuild {
  json: Record<string, unknown>;
  accessors: PendingAccessor[];
  /** Raw image blobs (e.g. PNG) appended as extra bufferViews after the accessors. The
   * json's images[].bufferView indices point past accessors.length into these (resolved
   * in encodeGLB, which knows the final bufferView count). */
  imageBlobs: Uint8Array[];
}

function f32(values: number[]): Uint8Array {
  const arr = new Float32Array(values);
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

function u16(values: number[]): Uint8Array {
  const arr = new Uint16Array(values);
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

function minMax(values: number[], components: number): { min: number[]; max: number[] } {
  const min = new Array<number>(components).fill(Infinity);
  const max = new Array<number>(components).fill(-Infinity);
  for (let i = 0; i < values.length; i += components) {
    for (let c = 0; c < components; c += 1) {
      const v = values[i + c]!;
      if (v < min[c]!) min[c] = v;
      if (v > max[c]!) max[c] = v;
    }
  }
  return { min, max };
}

function buildGLTF(design: CharacterDesign, partsByMaterial: Map<number, MeshAccumulator>, clips: Clip[]): GLTFBuild {
  const accessors: PendingAccessor[] = [];
  const pushAccessor = (a: PendingAccessor): number => {
    accessors.push(a);
    return accessors.length - 1;
  };

  // --- One primitive per (non-empty) material group. Every primitive carries the
  // mouthOpen morph target (zeros except the mouth lobe) so all primitives in the
  // mesh declare the same single target, satisfying the glTF morph constraint. ---
  const primitives: Record<string, unknown>[] = [];
  for (const [materialIndex, mesh] of partsByMaterial) {
    if (mesh.positions.length === 0) continue;
    const posMM = minMax(mesh.positions, 3);
    const positionAccessor = pushAccessor({
      bytes: f32(mesh.positions),
      componentType: COMPONENT_FLOAT,
      count: mesh.positions.length / 3,
      type: "VEC3",
      target: TARGET_ARRAY_BUFFER,
      min: posMM.min,
      max: posMM.max
    });
    const normalAccessor = pushAccessor({
      bytes: f32(mesh.normals),
      componentType: COMPONENT_FLOAT,
      count: mesh.normals.length / 3,
      type: "VEC3",
      target: TARGET_ARRAY_BUFFER
    });
    const jointsAccessor = pushAccessor({
      bytes: u16(mesh.joints),
      componentType: COMPONENT_USHORT,
      count: mesh.joints.length / 4,
      type: "VEC4",
      target: TARGET_ARRAY_BUFFER
    });
    const weightsAccessor = pushAccessor({
      bytes: f32(mesh.weights),
      componentType: COMPONENT_FLOAT,
      count: mesh.weights.length / 4,
      type: "VEC4",
      target: TARGET_ARRAY_BUFFER
    });
    const uvMM = minMax(mesh.uvs, 2);
    const uvAccessor = pushAccessor({
      bytes: f32(mesh.uvs),
      componentType: COMPONENT_FLOAT,
      count: mesh.uvs.length / 2,
      type: "VEC2",
      target: TARGET_ARRAY_BUFFER,
      min: uvMM.min,
      max: uvMM.max
    });
    const indexAccessor = pushAccessor({
      bytes: u16(mesh.indices),
      componentType: COMPONENT_USHORT,
      count: mesh.indices.length,
      type: "SCALAR",
      target: TARGET_ELEMENT_ARRAY_BUFFER
    });
    const morphMM = minMax(mesh.morphDeltas, 3);
    const morphAccessor = pushAccessor({
      bytes: f32(mesh.morphDeltas),
      componentType: COMPONENT_FLOAT,
      count: mesh.morphDeltas.length / 3,
      type: "VEC3",
      target: TARGET_ARRAY_BUFFER,
      min: morphMM.min,
      max: morphMM.max
    });
    primitives.push({
      attributes: {
        POSITION: positionAccessor,
        NORMAL: normalAccessor,
        TEXCOORD_0: uvAccessor,
        JOINTS_0: jointsAccessor,
        WEIGHTS_0: weightsAccessor
      },
      indices: indexAccessor,
      material: materialIndex,
      targets: [{ POSITION: morphAccessor }]
    });
  }

  // --- Inverse bind matrices accessor (shared skin) ---
  const ibmValues: number[] = [];
  for (let index = 0; index < JOINTS.length; index += 1) {
    const world = translation(...jointWorldBind(index));
    const inverse = invertTranslation(world);
    ibmValues.push(...inverse);
  }
  const ibmAccessor = pushAccessor({
    bytes: f32(ibmValues),
    componentType: COMPONENT_FLOAT,
    count: JOINTS.length,
    type: "MAT4"
  });

  // --- Animation accessors ---
  const gltfAnimations: Record<string, unknown>[] = [];
  for (const clip of clips) {
    const channels: Record<string, unknown>[] = [];
    const samplers: Record<string, unknown>[] = [];
    for (const channel of clip.channels) {
      const timeMM = minMax(channel.times, 1);
      const inputAccessor = pushAccessor({
        bytes: f32(channel.times),
        componentType: COMPONENT_FLOAT,
        count: channel.times.length,
        type: "SCALAR",
        min: timeMM.min,
        max: timeMM.max
      });
      const components = channel.path === "rotation" ? 4 : 3;
      const outputAccessor = pushAccessor({
        bytes: f32(channel.values),
        componentType: COMPONENT_FLOAT,
        count: channel.values.length / components,
        type: channel.path === "rotation" ? "VEC4" : "VEC3"
      });
      const samplerIndex = samplers.length;
      samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: "LINEAR" });
      channels.push({
        sampler: samplerIndex,
        target: { node: NODE_INDEX_FOR_JOINT[channel.jointName], path: channel.path }
      });
    }
    gltfAnimations.push({ name: clip.name, samplers, channels });
  }

  // --- Nodes ---
  // Node layout: 0 = mesh node (skinned), then one node per joint.
  const MESH_NODE = 0;
  const jointNodeIndices = JOINTS.map((_, index) => index + 1);

  const nodes: Record<string, unknown>[] = [];
  nodes.push({ name: `${design.id}_mesh`, mesh: 0, skin: 0 });
  for (let index = 0; index < JOINTS.length; index += 1) {
    const joint = JOINTS[index]!;
    const node: Record<string, unknown> = {
      name: joint.name,
      translation: joint.bind
    };
    const children = JOINTS
      .map((other, otherIndex) => (other.parent === index ? jointNodeIndices[otherIndex]! : -1))
      .filter((value) => value >= 0);
    if (children.length > 0) node.children = children;
    nodes.push(node);
  }

  const rootJointNode = jointNodeIndices[0]!;
  const sceneNodes = [MESH_NODE, rootJointNode];

  const bc = design.bodyColor;
  const ac = design.accentColor;
  const sc = design.skinColor;
  const tc = design.trimColor;

  // --- Bake the procedural base-colour atlas PNG and embed it as a glTF image. The image's
  // bufferView is appended AFTER all accessor bufferViews, so its index is accessors.length
  // (no more accessors are pushed below). Every material now carries a baseColorTexture
  // sampling its atlas region; baseColorFactor drops to white so the texture shows fully
  // (the prior per-material colour is baked INTO the atlas region instead). ---
  const darkColor = [0.04, 0.05, 0.09, 1] as [number, number, number, number];
  const bakeColors: BakeColors = {
    bodyColor: bc,
    accentColor: ac,
    skinColor: sc,
    trimColor: tc,
    darkColor
  };
  const { png: atlasPNG, size: atlasSize } = bakeAtlasPNG(bakeColors);
  const imageBufferViewIndex = accessors.length; // first image blob's bufferView
  const TEX_INDEX = 0; // single shared atlas texture
  const TEXCOORD = 0;
  const baseColorTexture = { index: TEX_INDEX, texCoord: TEXCOORD };
  const white = [1, 1, 1, 1] as [number, number, number, number];

  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: `Aura3D animation-studio build-characters.ts (CC0 procedural ${LOW_FI ? "mascot" : "humanoid"})` },
    scene: 0,
    scenes: [{ name: `${design.name} scene`, nodes: sceneNodes }],
    nodes,
    meshes: [
      {
        name: `${design.id}_body`,
        primitives,
        weights: [0],
        extras: { targetNames: ["mouthOpen"] }
      }
    ],
    skins: [
      {
        name: `${design.id}_skin`,
        inverseBindMatrices: ibmAccessor,
        joints: jointNodeIndices,
        skeleton: rootJointNode
      }
    ],
    animations: gltfAnimations,
    images: [
      { name: `${design.id}_atlas`, mimeType: "image/png", bufferView: imageBufferViewIndex }
    ],
    samplers: [
      { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 } // linear, mip-linear, clamp
    ],
    textures: [{ name: `${design.id}_atlas_tex`, source: 0, sampler: 0 }],
    materials: [
      {
        // MAT_BODY — clothing fabric region of the atlas.
        name: `${design.id}_body_mat`,
        pbrMetallicRoughness: { baseColorFactor: white, baseColorTexture, metallicFactor: 0.0, roughnessFactor: 0.5 },
        emissiveFactor: [bc[0] * 0.06, bc[1] * 0.06, bc[2] * 0.06]
      },
      {
        // MAT_DARK (pupils + mouth + boots) — dark region of the atlas.
        name: `${design.id}_dark_mat`,
        pbrMetallicRoughness: { baseColorFactor: white, baseColorTexture, metallicFactor: 0.0, roughnessFactor: 0.7 },
        emissiveFactor: [0, 0, 0]
      },
      {
        // MAT_GLOW (eyes + accessory tip) — glow region of the atlas.
        name: `${design.id}_glow_mat`,
        pbrMetallicRoughness: { baseColorFactor: white, baseColorTexture, metallicFactor: 0.0, roughnessFactor: 0.35 },
        emissiveFactor: [ac[0] * 0.85, ac[1] * 0.85, ac[2] * 0.85]
      },
      {
        // MAT_SKIN (head + hands) — skin region of the atlas; humanoid only.
        name: `${design.id}_skin_mat`,
        pbrMetallicRoughness: { baseColorFactor: white, baseColorTexture, metallicFactor: 0.0, roughnessFactor: 0.6 },
        emissiveFactor: [sc[0] * 0.04, sc[1] * 0.04, sc[2] * 0.04]
      },
      {
        // MAT_ACCENT (belt / collar / hair / trim) — accent region; humanoid only.
        name: `${design.id}_accent_mat`,
        pbrMetallicRoughness: { baseColorFactor: white, baseColorTexture, metallicFactor: 0.1, roughnessFactor: 0.45 },
        emissiveFactor: [tc[0] * 0.05, tc[1] * 0.05, tc[2] * 0.05]
      }
    ]
  };

  void atlasSize;
  return { json, accessors, imageBlobs: [atlasPNG] };
}

// Map joint name -> NODE index (joints are nodes 1..N; mesh is node 0).
const NODE_INDEX_FOR_JOINT: Record<string, number> = Object.fromEntries(
  JOINTS.map((joint, index) => [joint.name, index + 1])
);

// ---------------------------------------------------------------------------
// Pack accessors into bufferViews + a single binary buffer, write GLB.
// ---------------------------------------------------------------------------
function align4(n: number): number {
  return (n + 3) & ~3;
}

function encodeGLB(build: GLTFBuild): Uint8Array {
  const { json, accessors, imageBlobs } = build;
  const bufferViews: Record<string, unknown>[] = [];
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;

  const jsonAccessors = accessors.map((accessor, index) => {
    const padded = align4(accessor.bytes.byteLength);
    const view: Record<string, unknown> = {
      buffer: 0,
      byteOffset,
      byteLength: accessor.bytes.byteLength
    };
    if (accessor.target !== undefined) view.target = accessor.target;
    bufferViews.push(view);

    const padding = padded - accessor.bytes.byteLength;
    chunks.push(accessor.bytes);
    if (padding > 0) chunks.push(new Uint8Array(padding));
    byteOffset += padded;

    const out: Record<string, unknown> = {
      bufferView: index,
      componentType: accessor.componentType,
      count: accessor.count,
      type: accessor.type
    };
    if (accessor.min) out.min = accessor.min;
    if (accessor.max) out.max = accessor.max;
    return out;
  });

  // Image blobs (PNG atlas) get their own bufferViews appended after the accessor views,
  // matching the indices buildGLTF assigned to images[].bufferView (accessors.length + i).
  // These carry no `target` (they're not vertex/index data).
  for (const blob of imageBlobs ?? []) {
    const padded = align4(blob.byteLength);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: blob.byteLength });
    chunks.push(blob);
    const padding = padded - blob.byteLength;
    if (padding > 0) chunks.push(new Uint8Array(padding));
    byteOffset += padded;
  }

  const binLength = byteOffset;
  json.bufferViews = bufferViews;
  json.accessors = jsonAccessors;
  json.buffers = [{ byteLength: binLength }];

  // Assemble BIN chunk.
  const bin = new Uint8Array(binLength);
  let cursor = 0;
  for (const chunk of chunks) {
    bin.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  // JSON chunk (4-byte aligned, padded with spaces).
  const jsonText = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPadded = align4(jsonBytes.byteLength);
  const jsonChunk = new Uint8Array(jsonPadded).fill(0x20); // spaces
  jsonChunk.set(jsonBytes, 0);

  const binPadded = align4(bin.byteLength);
  const binChunk = new Uint8Array(binPadded); // zero pad
  binChunk.set(bin, 0);

  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const glb = new Uint8Array(totalLength);
  const dv = new DataView(glb.buffer);
  let o = 0;
  dv.setUint32(o, 0x46546c67, true); // "glTF"
  dv.setUint32(o + 4, 2, true); // version
  dv.setUint32(o + 8, totalLength, true);
  o += 12;
  // JSON chunk
  dv.setUint32(o, jsonChunk.byteLength, true);
  dv.setUint32(o + 4, 0x4e4f534a, true); // "JSON"
  glb.set(jsonChunk, o + 8);
  o += 8 + jsonChunk.byteLength;
  // BIN chunk
  dv.setUint32(o, binChunk.byteLength, true);
  dv.setUint32(o + 4, 0x004e4942, true); // "BIN\0"
  glb.set(binChunk, o + 8);

  return glb;
}

// ---------------------------------------------------------------------------
// Character designs.
// ---------------------------------------------------------------------------
const DESIGNS: readonly { design: CharacterDesign; file: string }[] = [
  {
    // Written to the catalog name the manifest/typed-assets reference so this is
    // the LIVE cast, not an unreferenced *.authored.glb side-product. This
    // overwrites the previously-polluted miko.catalog.glb.
    file: "miko.catalog.glb",
    design: {
      id: "miko",
      name: "Miko",
      // Cyan-suited humanoid with cyan hair-cap + glowing crest (antenna slot).
      bodyColor: [0.22, 0.55, 0.72, 1],
      accentColor: [0.6, 0.96, 1, 1],
      skinColor: [0.86, 0.66, 0.52, 1],
      trimColor: [0.3, 0.78, 0.88, 1],
      heightScale: 1.0,
      girth: 1.06,
      accessory: "antenna"
    }
  },
  {
    // Written to the catalog name the manifest/typed-assets reference (replaces
    // the prior luma2.catalog.glb astronaut).
    file: "luma2.catalog.glb",
    design: {
      id: "luma",
      name: "Luma",
      // Warm-gold-suited humanoid, slimmer build, rounded hair (ears slot).
      bodyColor: [0.78, 0.56, 0.26, 1],
      accentColor: [1, 0.9, 0.55, 1],
      skinColor: [0.9, 0.72, 0.58, 1],
      trimColor: [0.95, 0.82, 0.45, 1],
      heightScale: 1.08,
      girth: 0.9,
      accessory: "ears"
    }
  }
];

function meshBounds(parts: Map<number, MeshAccumulator>): { extents: Vec3; min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of parts.values()) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let c = 0; c < 3; c += 1) {
        const v = mesh.positions[i + c]!;
        if (v < min[c]!) min[c] = v;
        if (v > max[c]!) max[c] = v;
      }
    }
  }
  return { extents: [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!], min, max };
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(
    LOW_FI
      ? `[build-characters] LOW-FI mode (--low-fi): legacy ${MASCOT_JOINTS.length}-node mascots.`
      : `[build-characters] DEFAULT mode: high-fidelity ${HUMANOID_JOINTS.length}-joint humanoid cast (full limb chains, graded-A rig).`
  );
  const clips = buildClips();
  const emitted = new Map<string, string>(); // file -> sha256 hex
  for (const { design, file } of DESIGNS) {
    const parts = buildBody(design);
    const build = buildGLTF(design, parts, clips);
    const glb = encodeGLB(build);
    const outPath = resolve(OUTPUT_DIR, file);
    writeFileSync(outPath, glb);
    const vertexCount = Array.from(parts.values()).reduce((sum, m) => sum + m.positions.length / 3, 0);
    const triCount = Array.from(parts.values()).reduce((sum, m) => sum + m.indices.length / 3, 0);
    const bounds = meshBounds(parts);
    const hash = createHash("sha256").update(glb).digest("hex");
    emitted.set(file, hash);
    console.log(
      `${file}: ${glb.byteLength} bytes | ${vertexCount} verts / ${triCount} tris | ` +
        `joints=${JOINTS.length} clips=${clips.length} (${clips.map((c) => c.name).join(",")}) morph=mouthOpen\n` +
        `  bounds=[${bounds.extents.map((v) => v.toFixed(3)).join(", ")}]  sha256-${hash}`
    );
  }
  // The generator binds prompt casts to NEUTRAL copies (cast-a/cast-b) of the two leads
  // (see src/director/prompt-to-scene.ts). Re-copy them byte-for-byte from the freshly
  // textured leads so the default generated cast picks up the new bitmap textures too.
  if (!LOW_FI) {
    const COPIES: readonly { from: string; to: string }[] = [
      { from: "miko.catalog.glb", to: "cast-a.catalog.glb" },
      { from: "luma2.catalog.glb", to: "cast-b.catalog.glb" }
    ];
    for (const { from, to } of COPIES) {
      const bytes = readFileSync(resolve(OUTPUT_DIR, from));
      writeFileSync(resolve(OUTPUT_DIR, to), bytes);
      const hash = createHash("sha256").update(bytes).digest("hex");
      emitted.set(to, hash);
      console.log(`${to}: copied from ${from} | ${bytes.byteLength} bytes  sha256-${hash}`);
    }
  }

  console.log(`\nWrote authored GLBs to ${OUTPUT_DIR}`);
  verifyManifestHashes(emitted);
}

/**
 * Gate: fail if the asset manifest records a hash that does not match the actual
 * bytes of the file on disk. This catches the exact class of bug that polluted
 * miko.catalog.glb (a file overwritten without re-syncing its manifest hash).
 * Runs across EVERY manifest asset whose output file exists, not just the two we
 * just emitted, so a stale hash anywhere in aura.assets.json is reported.
 */
function verifyManifestHashes(emitted: ReadonlyMap<string, string>): void {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`\n[hash-gate] skipped: ${MANIFEST_PATH} not found`);
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    assets?: { id?: string; outputPath?: string; hash?: string }[];
  };
  const mismatches: string[] = [];
  for (const asset of manifest.assets ?? []) {
    if (!asset.outputPath || !asset.hash) continue;
    const filePath = resolve(TEMPLATE_ROOT, asset.outputPath);
    if (!existsSync(filePath)) {
      mismatches.push(`${asset.id ?? asset.outputPath}: file missing (${asset.outputPath})`);
      continue;
    }
    const actual = `sha256-${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
    if (actual !== asset.hash) {
      mismatches.push(`${asset.id ?? asset.outputPath}: manifest ${asset.hash} != file ${actual}`);
    }
  }
  if (mismatches.length > 0) {
    console.error(
      `\n[hash-gate] FAILED — manifest hashes are out of sync with the files:\n  ${mismatches.join("\n  ")}\n` +
        `  Regenerate aura.assets.json + src/aura-assets.ts from the actual GLB bytes ` +
        `(the freshly emitted hashes are: ${[...emitted].map(([f, h]) => `${f}=sha256-${h}`).join(", ")}).`
    );
    process.exitCode = 1;
    return;
  }
  console.log("[hash-gate] OK — every manifest hash matches its file on disk.");
}

main();
