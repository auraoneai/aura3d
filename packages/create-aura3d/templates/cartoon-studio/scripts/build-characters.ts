/**
 * build-characters.ts — Aura3D-authored, procedurally generated rigged cartoon
 * characters as REAL binary glTF 2.0 (.glb).
 *
 * This emits TWO distinct stylized helper robots — "Miko" (rounded, cyan) and
 * "Luma" (taller, warm gold) — as genuine authored, CC0 rigged assets, replacing
 * the reused three.js RobotExpressive + Mixamo Soldier placeholders in the LIVE
 * 3D route. Nothing is sourced; every vertex, joint, clip and morph delta below is
 * generated from code in this file.
 *
 * Each GLB contains:
 *   - a single skinned triangle mesh (POSITION / NORMAL + JOINTS_0 / WEIGHTS_0),
 *     built from low-poly box parts (head, torso, 2 arms, 2 legs, a mouth panel),
 *   - a small skeleton: root -> spine -> head, plus arm.L/arm.R and leg.L/leg.R
 *     (6 joints), with skins[].inverseBindMatrices,
 *   - 3 animation clips — Idle, Wave, Walk — sampling node rotations/translations,
 *   - ONE mouth morph target named `mouthOpen` (POSITION deltas that drop the lower
 *     mouth panel to open a mouth), exposed via the base mesh `targets`, the mesh
 *     `weights`, and `meshes[].extras.targetNames = ["mouthOpen"]`.
 *
 * The buffers are authored by hand (accessors / bufferViews / min-max), little
 * endian, 4-byte aligned, packed into one GLB BIN chunk. No three.js, no glTF
 * exporter dependency — just typed-array math.
 *
 * Run: `npx tsx scripts/build-characters.ts`
 * (also runnable from the monorepo with the same command in this directory).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(TEMPLATE_ROOT, "public/aura-assets");

// ---------------------------------------------------------------------------
// Small math helpers (column-major mat4, glTF/Aura convention).
// ---------------------------------------------------------------------------
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Mat4 = number[]; // length 16, column-major

function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row]! * b[col * 4 + k]!;
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
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
// Geometry builder: accumulate boxes into one skinned mesh.
// ---------------------------------------------------------------------------
interface MeshAccumulator {
  positions: number[]; // xyz triples
  normals: number[]; // xyz triples
  joints: number[]; // 4 per vertex (joint indices)
  weights: number[]; // 4 per vertex
  indices: number[];
  morphDeltas: number[]; // xyz triples, one per vertex (mouthOpen)
}

function makeAccumulator(): MeshAccumulator {
  return { positions: [], normals: [], joints: [], weights: [], indices: [], morphDeltas: [] };
}

const BOX_FACES: { normal: Vec3; corners: [Vec3, Vec3, Vec3, Vec3] }[] = [
  // +X
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  // -X
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  // +Y
  { normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  // -Y
  { normal: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  // +Z
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  // -Z
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
];

interface BoxOptions {
  /** Box center. */
  readonly center: Vec3;
  /** Full box size along each axis. */
  readonly size: Vec3;
  /** Joint index every vertex of this box is rigidly bound to (weight 1). */
  readonly joint: number;
  /**
   * Optional mouthOpen morph delta applied to every vertex of this box (used for
   * the lower-mouth panel so the morph visibly drops the lip open).
   */
  readonly morphDelta?: Vec3;
}

/** Append an axis-aligned box (24 verts, 12 tris) rigidly skinned to one joint. */
function addBox(mesh: MeshAccumulator, options: BoxOptions): void {
  const { center, size, joint } = options;
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const min: Vec3 = [center[0] - half[0], center[1] - half[1], center[2] - half[2]];
  const morph = options.morphDelta ?? [0, 0, 0];
  for (const face of BOX_FACES) {
    const base = mesh.positions.length / 3;
    for (const corner of face.corners) {
      mesh.positions.push(min[0] + corner[0] * size[0], min[1] + corner[1] * size[1], min[2] + corner[2] * size[2]);
      mesh.normals.push(face.normal[0], face.normal[1], face.normal[2]);
      mesh.joints.push(joint, 0, 0, 0);
      mesh.weights.push(1, 0, 0, 0);
      mesh.morphDeltas.push(morph[0], morph[1], morph[2]);
    }
    // two triangles (CCW)
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// ---------------------------------------------------------------------------
// Skeleton definition. Joint indices are referenced by JOINTS_0 above.
// Bind transforms are pure translations placing each joint in model space.
// ---------------------------------------------------------------------------
interface JointDef {
  readonly name: string;
  readonly parent: number; // -1 for root
  readonly bind: Vec3; // model-space bind translation
}

interface CharacterDesign {
  readonly id: string;
  readonly name: string;
  /** Body color (base color factor of the body material). */
  readonly bodyColor: [number, number, number, number];
  /** Head/accent color. */
  readonly accentColor: [number, number, number, number];
  /** Overall vertical scale multiplier (Luma is taller than Miko). */
  readonly heightScale: number;
  /** Limb girth multiplier (Miko is rounder/chunkier). */
  readonly girth: number;
}

const JOINTS: readonly JointDef[] = [
  { name: "root", parent: -1, bind: [0, 0, 0] },
  { name: "spine", parent: 0, bind: [0, 0.55, 0] },
  { name: "head", parent: 1, bind: [0, 0.45, 0] },
  { name: "armL", parent: 1, bind: [0.28, 0.32, 0] },
  { name: "armR", parent: 1, bind: [-0.28, 0.32, 0] },
  { name: "legL", parent: 0, bind: [0.14, 0, 0] },
  { name: "legR", parent: 0, bind: [-0.14, 0, 0] }
];

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

/**
 * Build a low-poly humanoid robot skinned to JOINTS, with a mouthOpen morph on the
 * lower-mouth panel. Returns the accumulated mesh.
 */
function buildBody(design: CharacterDesign): MeshAccumulator {
  const mesh = makeAccumulator();
  const g = design.girth;
  const h = design.heightScale;

  const headW = jointWorldBind(JOINT_INDEX.head!);
  const spineW = jointWorldBind(JOINT_INDEX.spine!);
  const armLW = jointWorldBind(JOINT_INDEX.armL!);
  const armRW = jointWorldBind(JOINT_INDEX.armR!);
  const legLW = jointWorldBind(JOINT_INDEX.legL!);
  const legRW = jointWorldBind(JOINT_INDEX.legR!);

  // Torso (bound to spine).
  addBox(mesh, {
    center: [spineW[0], spineW[1] + 0.18 * h, spineW[2]],
    size: [0.42 * g, 0.5 * h, 0.3 * g],
    joint: JOINT_INDEX.spine!
  });
  // Head (bound to head).
  addBox(mesh, {
    center: [headW[0], headW[1] + 0.12 * h, headW[2]],
    size: [0.4 * g, 0.36 * h, 0.36 * g],
    joint: JOINT_INDEX.head!
  });
  // Eyes / visor band (small front box bound to head) — purely visual accent.
  addBox(mesh, {
    center: [headW[0], headW[1] + 0.16 * h, headW[2] + 0.19 * g],
    size: [0.3 * g, 0.08 * h, 0.04 * g],
    joint: JOINT_INDEX.head!
  });
  // Upper-mouth panel (static, bound to head): the fixed top lip. A dark mouth box
  // (its own material accent comes from emissive; here it shares the body material).
  addBox(mesh, {
    center: [headW[0], headW[1] + 0.02 * h, headW[2] + 0.19 * g],
    size: [0.22 * g, 0.05 * h, 0.04 * g],
    joint: JOINT_INDEX.head!
  });
  // Lower-mouth panel (bound to head) WITH the mouthOpen morph delta: at weight 1
  // it drops downward a large, clearly visible amount, opening the mouth. This is
  // the real blendshape that drives lip-sync in pixels.
  addBox(mesh, {
    center: [headW[0], headW[1] - 0.05 * h, headW[2] + 0.19 * g],
    size: [0.22 * g, 0.05 * h, 0.04 * g],
    joint: JOINT_INDEX.head!,
    morphDelta: [0, -0.16 * h, 0.02 * g]
  });

  // Arms (bound to armL / armR).
  addBox(mesh, {
    center: [armLW[0] + 0.06 * g, armLW[1] - 0.12 * h, armLW[2]],
    size: [0.12 * g, 0.4 * h, 0.12 * g],
    joint: JOINT_INDEX.armL!
  });
  addBox(mesh, {
    center: [armRW[0] - 0.06 * g, armRW[1] - 0.12 * h, armRW[2]],
    size: [0.12 * g, 0.4 * h, 0.12 * g],
    joint: JOINT_INDEX.armR!
  });

  // Legs (bound to legL / legR).
  addBox(mesh, {
    center: [legLW[0], legLW[1] - 0.26 * h, legLW[2]],
    size: [0.14 * g, 0.5 * h, 0.16 * g],
    joint: JOINT_INDEX.legL!
  });
  addBox(mesh, {
    center: [legRW[0], legRW[1] - 0.26 * h, legRW[2]],
    size: [0.14 * g, 0.5 * h, 0.16 * g],
    joint: JOINT_INDEX.legR!
  });

  return mesh;
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

function buildClips(): Clip[] {
  // Idle: gentle spine sway + head bob (subtle).
  const idle: Clip = {
    name: "Idle",
    channels: [
      rotChannel("spine", [0, 1, 2], [
        quatFromAxisAngle([0, 0, 1], 0.04),
        quatFromAxisAngle([0, 0, 1], -0.04),
        quatFromAxisAngle([0, 0, 1], 0.04)
      ]),
      rotChannel("head", [0, 1, 2], [
        quatFromAxisAngle([1, 0, 0], -0.03),
        quatFromAxisAngle([1, 0, 0], 0.05),
        quatFromAxisAngle([1, 0, 0], -0.03)
      ])
    ]
  };

  // Wave: right arm raises and waves; spine leans slightly.
  const wave: Clip = {
    name: "Wave",
    channels: [
      rotChannel("armR", [0, 0.5, 1, 1.5, 2], [
        quatFromAxisAngle([0, 0, 1], 0),
        quatFromAxisAngle([0, 0, 1], -2.2),
        quatFromAxisAngle([0, 0, 1], -2.5),
        quatFromAxisAngle([0, 0, 1], -2.2),
        quatFromAxisAngle([0, 0, 1], -2.5)
      ]),
      rotChannel("spine", [0, 1, 2], [
        quatFromAxisAngle([0, 0, 1], 0.08),
        quatFromAxisAngle([0, 0, 1], 0.12),
        quatFromAxisAngle([0, 0, 1], 0.08)
      ])
    ]
  };

  // Walk: alternating legs + arms swing, slight body bob in translation.
  const walk: Clip = {
    name: "Walk",
    channels: [
      rotChannel("legL", [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], 0.6),
        quatFromAxisAngle([1, 0, 0], -0.6),
        quatFromAxisAngle([1, 0, 0], 0.6)
      ]),
      rotChannel("legR", [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], -0.6),
        quatFromAxisAngle([1, 0, 0], 0.6),
        quatFromAxisAngle([1, 0, 0], -0.6)
      ]),
      rotChannel("armL", [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], -0.5),
        quatFromAxisAngle([1, 0, 0], 0.5),
        quatFromAxisAngle([1, 0, 0], -0.5)
      ]),
      rotChannel("armR", [0, 0.5, 1], [
        quatFromAxisAngle([1, 0, 0], 0.5),
        quatFromAxisAngle([1, 0, 0], -0.5),
        quatFromAxisAngle([1, 0, 0], 0.5)
      ]),
      transChannel("root", [0, 0.25, 0.5, 0.75, 1], [
        [0, 0, 0],
        [0, 0.05, 0],
        [0, 0, 0],
        [0, 0.05, 0],
        [0, 0, 0]
      ])
    ]
  };

  return [idle, wave, walk];
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

function buildGLTF(design: CharacterDesign, mesh: MeshAccumulator, clips: Clip[]): GLTFBuild {
  const accessors: PendingAccessor[] = [];
  const pushAccessor = (a: PendingAccessor): number => {
    accessors.push(a);
    return accessors.length - 1;
  };

  // --- Mesh attribute accessors ---
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
  const indexAccessor = pushAccessor({
    bytes: u16(mesh.indices),
    componentType: COMPONENT_USHORT,
    count: mesh.indices.length,
    type: "SCALAR",
    target: TARGET_ELEMENT_ARRAY_BUFFER
  });
  // Morph target POSITION deltas (mouthOpen).
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

  // --- Inverse bind matrices accessor ---
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
  const animationSamplers: { input: number; output: number; interpolation: string }[] = [];
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
  void animationSamplers;

  // --- Nodes ---
  // Node layout: 0 = mesh node (skinned), then one node per joint.
  // We place the skeleton joints as nodes too (the skin references them).
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

  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "Aura3D cartoon-studio build-characters.ts (CC0 procedural)" },
    scene: 0,
    scenes: [{ name: `${design.name} scene`, nodes: sceneNodes }],
    nodes,
    meshes: [
      {
        name: `${design.id}_body`,
        primitives: [
          {
            attributes: {
              POSITION: positionAccessor,
              NORMAL: normalAccessor,
              JOINTS_0: jointsAccessor,
              WEIGHTS_0: weightsAccessor
            },
            indices: indexAccessor,
            material: 0,
            targets: [{ POSITION: morphAccessor }]
          }
        ],
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
    materials: [
      {
        name: `${design.id}_body_mat`,
        pbrMetallicRoughness: {
          baseColorFactor: design.bodyColor,
          metallicFactor: 0.1,
          roughnessFactor: 0.6
        },
        emissiveFactor: [design.accentColor[0] * 0.15, design.accentColor[1] * 0.15, design.accentColor[2] * 0.15]
      }
    ]
  };

  return { json, accessors };
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
  const { json, accessors } = build;
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
    file: "miko.authored.glb",
    design: {
      id: "miko",
      name: "Miko",
      // Rounded, cyan helper robot.
      bodyColor: [0.36, 0.82, 0.92, 1],
      accentColor: [0.6, 0.95, 1, 1],
      heightScale: 1.0,
      girth: 1.18
    }
  },
  {
    file: "luma.authored.glb",
    design: {
      id: "luma",
      name: "Luma",
      // Taller, warm-gold helper robot.
      bodyColor: [0.96, 0.74, 0.34, 1],
      accentColor: [1, 0.88, 0.55, 1],
      heightScale: 1.32,
      girth: 0.92
    }
  }
];

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const clips = buildClips();
  for (const { design, file } of DESIGNS) {
    const mesh = buildBody(design);
    const build = buildGLTF(design, mesh, clips);
    const glb = encodeGLB(build);
    const outPath = resolve(OUTPUT_DIR, file);
    writeFileSync(outPath, glb);
    const vertexCount = mesh.positions.length / 3;
    const triCount = mesh.indices.length / 3;
    console.log(
      `${file}: ${glb.byteLength} bytes | ${vertexCount} verts / ${triCount} tris | ` +
        `joints=${JOINTS.length} clips=${clips.length} (${clips.map((c) => c.name).join(",")}) morph=mouthOpen`
    );
  }
  console.log(`\nWrote authored GLBs to ${OUTPUT_DIR}`);
}

main();
