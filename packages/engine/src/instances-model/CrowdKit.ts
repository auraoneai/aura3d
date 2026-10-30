/**
 * GU47 E-H (WP-8) — crowd kit: pose-baked instanced crowds.
 *
 * A skinned `instances.model` cannot instance (each copy needs its own joint palette), so a
 * stadium of rigged spectators used to cost one actor and one draw per spectator, or drew a single
 * copy. The kit bakes a skinned GLB clip into `poses` static meshes on the CPU (linear blend
 * skinning applied once per pose frame), and draws the crowd as one instanced node per pose:
 * 480 spectators with 4 poses are 4 draws.
 *
 * Every spectator has its own transform, colour (instance colour, multiplied into the baked
 * per-part vertex colours), clip phase and optional held pose index. Phases are quantised into
 * `poses` balanced groups; on each frame of the loop every group steps to its next pose, so a
 * group moves from one pose node to the next instead of each spectator re-sorting. An optional
 * per-spectator `bob` (its own phase, smooth between pose frames) adds continuous motion.
 *
 * `update` writes dense instance matrices and colours through `setInstanceMatrices` with no
 * allocation in the kit; counts that divide evenly by `poses` keep every node's count constant,
 * so the node stores are reused too.
 */
import type { AuraCustomGeometrySpec } from "../agent-api/RootGeometry.js";
import type { AuraNodeBuilder } from "../agent-api/nodes/builder.js";
import type { AuraColor, AuraMaterialSpec, AuraPrimitiveNode, AuraTransformSpec, AuraVec3 } from "../agent-api/nodes/types.js";
import { instances } from "../agent-api/nodes/instances.js";
import { material } from "../agent-api/nodes/material.js";
import { colorToLinearRgba } from "../agent-api/colorUtils.js";

type Vec3Tuple = readonly [number, number, number];
type Vec4Tuple = readonly [number, number, number, number];

/* ------------------------------------------------------------------ bake */

/** One mesh primitive of the source GLB (the shapes `GLTFMeshAsset` already carries). */
export interface AuraCrowdBakePrimitive {
  readonly positions: readonly Vec3Tuple[];
  readonly normals?: readonly Vec3Tuple[];
  readonly uvs?: readonly (readonly [number, number])[];
  readonly indices?: readonly number[];
  /** Skin joint indices (into the palette) and weights, four per vertex. */
  readonly joints?: readonly Vec4Tuple[];
  readonly weights?: readonly Vec4Tuple[];
  /** Linear RGBA multiplied into every vertex (the primitive material's base colour factor). */
  readonly color?: Vec4Tuple;
  /** Linear RGBA per vertex (`COLOR_0`). */
  readonly vertexColors?: readonly Vec4Tuple[];
}

/** One sampled pose: per primitive (same order), the mesh node's world matrix and its joint palette. */
export interface AuraCrowdBakePoseFrame {
  readonly primitives: readonly {
    /** Column-major mat4: the mesh node's world matrix in the GLB scene. */
    readonly world: ArrayLike<number>;
    /** Column-major mat4 per skin joint (`inverse(meshWorld) · jointWorld · inverseBind`). */
    readonly palette?: ArrayLike<number>;
  }[];
}

export interface AuraCrowdBakeOptions {
  /** Scale the baked spectator to this height (world units). Default: the GLB's own size. */
  readonly targetHeight?: number;
}

/**
 * Bake pose frames into static meshes. All poses share topology, UVs and colours; positions and
 * normals carry the skinned pose. Baked spectators stand on y = 0, centred on x/z (pose 0 bounds).
 */
export function bakeCrowdPoses(
  primitives: readonly AuraCrowdBakePrimitive[],
  frames: readonly AuraCrowdBakePoseFrame[],
  options: AuraCrowdBakeOptions = {}
): AuraCustomGeometrySpec[] {
  if (primitives.length === 0) throw new Error("CROWD_NO_MESH: the crowd source has no triangle mesh to bake.");
  if (frames.length === 0) throw new Error("CROWD_NO_POSE: bakeCrowdPoses needs at least one pose frame.");
  for (const frame of frames) {
    if (frame.primitives.length !== primitives.length) {
      throw new Error(`CROWD_POSE_MISMATCH: a pose frame lists ${frame.primitives.length} primitives, the source has ${primitives.length}.`);
    }
  }
  let vertexCount = 0;
  let indexCount = 0;
  for (const primitive of primitives) {
    vertexCount += primitive.positions.length;
    indexCount += primitive.indices?.length ?? primitive.positions.length;
  }
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const withUvs = primitives.every((primitive) => primitive.uvs !== undefined && primitive.uvs.length === primitive.positions.length);
  const uvs = withUvs ? new Float32Array(vertexCount * 2) : undefined;
  const withColors = primitives.some((primitive) => primitive.color !== undefined || primitive.vertexColors !== undefined);
  const colors = withColors ? new Float32Array(vertexCount * 4) : undefined;
  let vertexBase = 0;
  let indexCursor = 0;
  for (const primitive of primitives) {
    const count = primitive.positions.length;
    if (primitive.indices) {
      for (const index of primitive.indices) indices[indexCursor++] = vertexBase + index;
    } else {
      for (let v = 0; v < count; v += 1) indices[indexCursor++] = vertexBase + v;
    }
    for (let v = 0; v < count; v += 1) {
      if (uvs) {
        const uv = primitive.uvs![v]!;
        uvs[(vertexBase + v) * 2] = uv[0];
        uvs[(vertexBase + v) * 2 + 1] = uv[1];
      }
      if (colors) {
        const factor = primitive.color ?? [1, 1, 1, 1];
        const vertex = primitive.vertexColors?.[v] ?? [1, 1, 1, 1];
        for (let c = 0; c < 4; c += 1) colors[(vertexBase + v) * 4 + c] = factor[c]! * vertex[c]!;
      }
    }
    vertexBase += count;
  }

  const posed = frames.map((frame) => skinFrame(primitives, frame, vertexCount));
  // Ground and centre on pose 0, then scale to the target height; every pose gets the same map.
  const reference = posed[0]!.positions;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexCount; v += 1) {
    for (let a = 0; a < 3; a += 1) {
      const value = reference[v * 3 + a]!;
      if (value < min[a]!) min[a] = value;
      if (value > max[a]!) max[a] = value;
    }
  }
  const height = max[1]! - min[1]!;
  const scale = options.targetHeight !== undefined && options.targetHeight > 0 && height > 0 ? options.targetHeight / height : 1;
  const offset = [-(min[0]! + max[0]!) / 2, -min[1]!, -(min[2]! + max[2]!) / 2];
  return posed.map(({ positions, normals }) => {
    const boundsMin: [number, number, number] = [Infinity, Infinity, Infinity];
    const boundsMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < vertexCount; v += 1) {
      for (let a = 0; a < 3; a += 1) {
        const value = (positions[v * 3 + a]! + offset[a]!) * scale;
        positions[v * 3 + a] = value;
        if (value < boundsMin[a]!) boundsMin[a] = value;
        if (value > boundsMax[a]!) boundsMax[a] = value;
      }
    }
    return {
      kind: "aura-custom-geometry",
      positions,
      normals,
      ...(uvs ? { uvs } : {}),
      ...(colors ? { colors } : {}),
      indices,
      bounds: { min: boundsMin, max: boundsMax }
    } satisfies AuraCustomGeometrySpec;
  });
}

/** Linear blend skinning of every primitive for one pose, into GLB scene space. */
function skinFrame(primitives: readonly AuraCrowdBakePrimitive[], frame: AuraCrowdBakePoseFrame, vertexCount: number): { positions: Float32Array; normals: Float32Array } {
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const skin = new Float64Array(16);
  const full = new Float64Array(16);
  let base = 0;
  primitives.forEach((primitive, p) => {
    const { world, palette } = frame.primitives[p]!;
    const skinned = palette !== undefined && primitive.joints !== undefined && primitive.weights !== undefined
      && primitive.joints.length === primitive.positions.length && primitive.weights.length === primitive.positions.length;
    for (let v = 0; v < primitive.positions.length; v += 1) {
      if (skinned) {
        skin.fill(0);
        const joints = primitive.joints![v]!;
        const weights = primitive.weights![v]!;
        let total = 0;
        for (let i = 0; i < 4; i += 1) {
          const weight = weights[i]!;
          if (!(weight > 0)) continue;
          const offset = joints[i]! * 16;
          if (offset + 15 >= palette!.length) continue;
          total += weight;
          for (let e = 0; e < 16; e += 1) skin[e] = skin[e]! + weight * palette![offset + e]!;
        }
        if (total > 0 && Math.abs(total - 1) > 1e-6) for (let e = 0; e < 16; e += 1) skin[e] = skin[e]! / total;
        if (total > 0) multiply(full, world, skin);
        else copyInto(full, world);
      } else {
        copyInto(full, world);
      }
      const position = primitive.positions[v]!;
      const out = (base + v) * 3;
      positions[out] = full[0]! * position[0] + full[4]! * position[1] + full[8]! * position[2] + full[12]!;
      positions[out + 1] = full[1]! * position[0] + full[5]! * position[1] + full[9]! * position[2] + full[13]!;
      positions[out + 2] = full[2]! * position[0] + full[6]! * position[1] + full[10]! * position[2] + full[14]!;
      const normal = primitive.normals?.[v] ?? [0, 1, 0];
      const nx = full[0]! * normal[0] + full[4]! * normal[1] + full[8]! * normal[2];
      const ny = full[1]! * normal[0] + full[5]! * normal[1] + full[9]! * normal[2];
      const nz = full[2]! * normal[0] + full[6]! * normal[1] + full[10]! * normal[2];
      const length = Math.hypot(nx, ny, nz) || 1;
      normals[out] = nx / length;
      normals[out + 1] = ny / length;
      normals[out + 2] = nz / length;
    }
    base += primitive.positions.length;
  });
  return { positions, normals };
}

function copyInto(out: Float64Array, source: ArrayLike<number>): void {
  for (let e = 0; e < 16; e += 1) out[e] = source[e] ?? 0;
}

/** out = a · b (column-major). */
function multiply(out: Float64Array, a: ArrayLike<number>, b: ArrayLike<number>): void {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] = a[row]! * b[column * 4]! + a[4 + row]! * b[column * 4 + 1]! + a[8 + row]! * b[column * 4 + 2]! + a[12 + row]! * b[column * 4 + 3]!;
    }
  }
}

/* ------------------------------------------------------ sample a GLB actor */

/** Baked poses of one clip, ready for `createCrowd`. */
export interface AuraCrowdPoseSet {
  readonly poses: readonly AuraCustomGeometrySpec[];
  /** Loop length of the baked clip in seconds (1 for a static bake). */
  readonly clipSeconds: number;
  /** The clip the poses were sampled from (absent for a static bake). */
  readonly clip?: string;
  /** Triangles per spectator. */
  readonly triangles: number;
}

export interface AuraCrowdSampleOptions extends AuraCrowdBakeOptions {
  /** Clip to bake. Default: the GLB's first clip; a GLB without clips bakes its rest pose. */
  readonly clip?: string;
  /** Pose frames sampled evenly over the clip (1..16, default 4). Each pose is one draw. */
  readonly poses?: number;
}

/** The parts of a loaded `TypedGLBActor` the sampler reads. */
export interface AuraCrowdBakeActor {
  readonly pipeline: {
    readonly asset: {
      readonly meshes: readonly {
        readonly name: string;
        readonly topology: "triangles" | "lines" | "points";
        readonly positions: readonly Vec3Tuple[];
        readonly normals: readonly Vec3Tuple[];
        readonly texcoords: readonly (readonly [number, number])[];
        readonly colors: readonly Vec4Tuple[];
        readonly joints: readonly Vec4Tuple[];
        readonly weights: readonly Vec4Tuple[];
        readonly indices?: readonly number[];
        readonly materialIndex?: number;
      }[];
      readonly materials: readonly { readonly baseColorFactor: Vec4Tuple }[];
      readonly animations: readonly { readonly name: string; readonly duration: number }[];
    };
    readonly resources: {
      readonly scene: {
        updateWorldTransforms(): void;
        collectRenderables(): readonly {
          readonly node: { readonly visible: boolean; readonly transform: { readonly worldMatrix: ArrayLike<number> } };
          readonly renderable: { readonly geometry: string; readonly skinning?: { readonly matrices: Float32Array } };
        }[];
      };
    };
  };
  playClip(name: string, time: number): unknown;
}

/** Sample `poses` frames of a clip from a loaded GLB actor and bake them. */
export function sampleCrowdPoseSet(actor: AuraCrowdBakeActor, options: AuraCrowdSampleOptions = {}): AuraCrowdPoseSet {
  const asset = actor.pipeline.asset;
  if (options.clip !== undefined && !asset.animations.some((clip) => clip.name === options.clip)) {
    throw new Error(`CROWD_CLIP_NOT_FOUND: clip "${options.clip}" is not in the GLB. Available: ${asset.animations.map((clip) => clip.name).join(", ") || "(none)"}.`);
  }
  const clip = options.clip !== undefined ? asset.animations.find((entry) => entry.name === options.clip) : asset.animations[0];
  const requested = Math.floor(options.poses ?? 4);
  const poseCount = clip === undefined ? 1 : Math.max(1, Math.min(16, Number.isFinite(requested) ? requested : 4));
  const meshesByName = new Map(asset.meshes.map((mesh) => [mesh.name, mesh]));
  const scene = actor.pipeline.resources.scene;
  if (clip !== undefined) actor.playClip(clip.name, 0);
  scene.updateWorldTransforms();
  const entries = scene.collectRenderables().flatMap(({ node, renderable }) => {
    const mesh = meshesByName.get(renderable.geometry);
    if (!node.visible || mesh === undefined || mesh.topology !== "triangles" || mesh.positions.length === 0) return [];
    return [{ node, renderable, mesh }];
  });
  const sameLength = <T>(values: readonly T[], count: number): readonly T[] | undefined => (values.length === count ? values : undefined);
  const primitives: AuraCrowdBakePrimitive[] = entries.map(({ mesh }) => {
    const count = mesh.positions.length;
    const normals = sameLength(mesh.normals, count);
    const uvs = sameLength(mesh.texcoords, count);
    const joints = sameLength(mesh.joints, count);
    const weights = sameLength(mesh.weights, count);
    const vertexColors = sameLength(mesh.colors, count);
    const color = mesh.materialIndex !== undefined ? asset.materials[mesh.materialIndex]?.baseColorFactor : undefined;
    return {
      positions: mesh.positions,
      ...(normals ? { normals } : {}),
      ...(uvs ? { uvs } : {}),
      ...(mesh.indices ? { indices: mesh.indices } : {}),
      ...(joints && weights ? { joints, weights } : {}),
      ...(vertexColors ? { vertexColors } : {}),
      ...(color ? { color } : {})
    };
  });
  const frames: AuraCrowdBakePoseFrame[] = [];
  for (let k = 0; k < poseCount; k += 1) {
    if (clip !== undefined) actor.playClip(clip.name, (k / poseCount) * clip.duration);
    scene.updateWorldTransforms();
    frames.push({
      primitives: entries.map(({ node, renderable }) => ({
        world: Float32Array.from(node.transform.worldMatrix),
        ...(renderable.skinning ? { palette: Float32Array.from(renderable.skinning.matrices) } : {})
      }))
    });
  }
  const poses = bakeCrowdPoses(primitives, frames, options);
  return {
    poses,
    clipSeconds: clip !== undefined && clip.duration > 0 ? clip.duration : 1,
    ...(clip !== undefined ? { clip: clip.name } : {}),
    triangles: Math.floor(poses[0]!.indices.length / 3)
  };
}

/** A GLB asset reference (typed asset tables provide `url` and `hash`). */
export interface AuraCrowdAsset {
  readonly url: string;
  readonly hash?: string;
  readonly type?: string;
  readonly format?: string;
  readonly sizeBytes?: number;
}

export interface AuraCrowdLoadOptions extends AuraCrowdSampleOptions {
  /** Forwarded to the GLB load (`assets.decoders`) for draco / meshopt sources. */
  readonly decoders?: import("../contracts/assets").AuraAssetDecodersOption;
}

const bakedPoseSets = new Map<string, Promise<AuraCrowdPoseSet>>();
const MAX_BAKED_POSE_SETS = 16;
/** Images are never sampled by the bake: a 1×1 stand-in skips decoding every texture. */
const bakeImageDecoder = () => ({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });

/**
 * Load a skinned GLB once, bake `poses` frames of a clip and dispose the actor. Results are
 * memoised per (asset, clip, poses, targetHeight), so remounting a scene does not bake again; the
 * GLB itself goes through the shared parse cache and the GLB resource cache.
 */
export function loadCrowdPoses(asset: AuraCrowdAsset, options: AuraCrowdLoadOptions = {}): Promise<AuraCrowdPoseSet> {
  const key = [asset.hash ?? "-", asset.url, options.clip ?? "-", options.poses ?? 4, options.targetHeight ?? "-"].join("|");
  const cached = bakedPoseSets.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const { createTypedGLBActor } = await import("../production-runtime/TypedGLBActor.js");
    const actor = await createTypedGLBActor({
      asset,
      id: `aura-crowd-bake:${asset.url}`,
      width: 1,
      height: 1,
      shareTextures: false,
      imageDecoder: bakeImageDecoder,
      ...(options.decoders ? { decoders: options.decoders } : {})
    });
    try {
      return sampleCrowdPoseSet(actor, options);
    } finally {
      actor.dispose();
    }
  })();
  bakedPoseSets.set(key, pending);
  pending.catch(() => {
    if (bakedPoseSets.get(key) === pending) bakedPoseSets.delete(key);
  });
  while (bakedPoseSets.size > MAX_BAKED_POSE_SETS) bakedPoseSets.delete(bakedPoseSets.keys().next().value!);
  return pending;
}

/** Drop the memoised bakes (tests, memory pressure). */
export function clearCrowdPoseCache(): void {
  bakedPoseSets.clear();
}

/* ------------------------------------------------------------- the crowd */

export interface AuraCrowdSpectator {
  readonly position: AuraVec3;
  /** Rotation about +Y in radians (0 faces the GLB's own forward). */
  readonly yaw?: number;
  readonly scale?: number;
  /** Instance colour (multiplied into the baked part colours and the material colour). */
  readonly color?: AuraColor;
  /** Clip phase in [0, 1): spreads spectators over the loop (quantised into `poses` balanced groups). */
  readonly phase?: number;
  /** Hold this pose index instead of playing the loop (for example a seated pose). */
  readonly pose?: number;
}

export interface AuraCrowdOptions {
  /** Runtime id prefix: pose node `k` gets the id `${id}:pose-${k}`. */
  readonly id: string;
  /** Baked poses (`loadCrowdPoses` / `sampleCrowdPoseSet`) or plain pose meshes (loop length 1 s). */
  readonly poses: AuraCrowdPoseSet | readonly AuraCustomGeometrySpec[];
  readonly spectators: readonly AuraCrowdSpectator[];
  /** Shared material. Default: white PBR, roughness 0.85 (part and instance colours show as authored). */
  readonly material?: AuraMaterialSpec;
  /** Loop playback rate for the whole crowd (default 1; 0 holds every spectator on its phase's pose). */
  readonly speed?: number;
  /** Vertical bob amplitude in world units, per spectator on its own phase (default 0). */
  readonly bob?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  /** Node name prefix (default: `id`). */
  readonly name?: string;
}

/** What `setInstanceMatrices` / `setVisible` need from a runtime node handle. */
export interface AuraCrowdNodeHandle {
  setInstanceMatrices(matrices: Float32Array, count: number, rgba?: Float32Array): unknown;
  setVisible(visible: boolean): unknown;
}

/** `app.nodes` (or any registry resolving the crowd's node ids). */
export interface AuraCrowdTarget {
  readonly nodes: { get(id: string): AuraCrowdNodeHandle | undefined };
}

export interface AuraCrowdDrawPlan {
  readonly kind: "aura-crowd-draw-plan";
  readonly spectators: number;
  readonly poseNodes: number;
  /** Loop frame (pose step) the plan was computed for. */
  readonly frame: number;
  /** Instanced draws this frame: pose nodes holding at least one spectator. */
  readonly draws: number;
  readonly perNode: readonly { readonly id: string; readonly pose: number; readonly count: number; readonly capacity: number }[];
  readonly trianglesPerSpectator: number;
  readonly triangles: number;
}

export interface AuraCrowd {
  readonly id: string;
  /** Spectator count. */
  readonly count: number;
  /** Pose nodes (one instanced draw each). */
  readonly poseCount: number;
  /** Scene nodes to add (`scene.add(...crowd.nodes)`). */
  readonly nodes: readonly AuraNodeBuilder<AuraPrimitiveNode>[];
  readonly nodeIds: readonly string[];
  /** Live per-spectator state (xyz per spectator); edit in place, then `markDirty()`. */
  readonly positions: Float32Array;
  readonly yaws: Float32Array;
  readonly scales: Float32Array;
  /** Linear RGBA per spectator. */
  readonly colors: Float32Array;
  setYaw(index: number, yaw: number): void;
  setPosition(index: number, x: number, y: number, z: number): void;
  setColor(index: number, color: AuraColor): void;
  /** Rewrite instance data on the next `update` even if the loop frame did not change. */
  markDirty(): void;
  /** Loop frame (0..poseCount-1) at `timeSeconds`. */
  frameAt(timeSeconds: number): number;
  /**
   * Bucket spectators into their pose nodes for `timeSeconds` and write the dense instance data.
   * Allocation-free; returns the instanced draw count this frame.
   */
  update(target: AuraCrowdTarget, timeSeconds: number): number;
  /** Counts per pose node for `timeSeconds` (diagnostics, receipts). */
  drawPlan(timeSeconds?: number): AuraCrowdDrawPlan;
}

/** Build a pose-baked instanced crowd: one instanced node per pose, spectators bucketed per frame. */
export function createCrowd(options: AuraCrowdOptions): AuraCrowd {
  const poseSet: AuraCrowdPoseSet = isPoseSet(options.poses)
    ? options.poses
    : { poses: options.poses, clipSeconds: 1, triangles: options.poses[0] ? Math.floor(options.poses[0].indices.length / 3) : 0 };
  const poses = poseSet.poses;
  const poseCount = poses.length;
  if (poseCount === 0) throw new Error("CROWD_NO_POSE: createCrowd needs at least one pose mesh.");
  const count = options.spectators.length;
  const clipSeconds = poseSet.clipSeconds > 0 ? poseSet.clipSeconds : 1;
  const speed = Number.isFinite(options.speed) ? options.speed! : 1;
  const bob = Number.isFinite(options.bob) && options.bob! > 0 ? options.bob! : 0;

  const positions = new Float32Array(count * 3);
  const yaws = new Float32Array(count);
  const scales = new Float32Array(count);
  const colors = new Float32Array(count * 4);
  const phases = new Float32Array(count);
  const heldPose = new Int16Array(count).fill(-1);
  options.spectators.forEach((spectator, i) => {
    positions.set([spectator.position[0], spectator.position[1], spectator.position[2]], i * 3);
    yaws[i] = spectator.yaw ?? 0;
    scales[i] = spectator.scale ?? 1;
    colors.set(colorToLinearRgba(spectator.color ?? "#ffffff"), i * 4);
    const phase = spectator.phase ?? 0;
    phases[i] = Number.isFinite(phase) ? phase - Math.floor(phase) : 0;
    if (spectator.pose !== undefined && Number.isFinite(spectator.pose)) heldPose[i] = ((Math.floor(spectator.pose) % poseCount) + poseCount) % poseCount;
  });

  // Held spectators live on their pose node; looping spectators form `poseCount` balanced groups by phase.
  const looping = [...Array(count).keys()].filter((i) => heldPose[i]! < 0).sort((a, b) => phases[a]! - phases[b]! || a - b);
  const groupStart = new Int32Array(poseCount + 1);
  const groupMembers = new Int32Array(looping.length);
  const groupOf = (rank: number): number => Math.min(poseCount - 1, Math.floor((rank * poseCount) / Math.max(1, looping.length)));
  for (let rank = 0; rank < looping.length; rank += 1) groupStart[groupOf(rank) + 1] = groupStart[groupOf(rank) + 1]! + 1;
  for (let g = 0; g < poseCount; g += 1) groupStart[g + 1] = groupStart[g + 1]! + groupStart[g]!;
  looping.forEach((spectator, rank) => { groupMembers[rank] = spectator; });
  const heldStart = new Int32Array(poseCount + 1);
  for (let i = 0; i < count; i += 1) if (heldPose[i]! >= 0) heldStart[heldPose[i]! + 1] = heldStart[heldPose[i]! + 1]! + 1;
  for (let k = 0; k < poseCount; k += 1) heldStart[k + 1] = heldStart[k + 1]! + heldStart[k]!;
  const heldMembers = new Int32Array(heldStart[poseCount]!);
  const heldCursor = heldStart.slice(0, poseCount);
  for (let i = 0; i < count; i += 1) if (heldPose[i]! >= 0) heldMembers[heldCursor[heldPose[i]!]!++] = i;
  let maxGroup = 0;
  for (let g = 0; g < poseCount; g += 1) maxGroup = Math.max(maxGroup, groupStart[g + 1]! - groupStart[g]!);

  const nodeIds = Array.from({ length: poseCount }, (_, k) => `${options.id}:pose-${k}`);
  const capacity = Array.from({ length: poseCount }, (_, k) => heldStart[k + 1]! - heldStart[k]! + maxGroup);
  const nodeMatrices = capacity.map((slots) => new Float32Array(Math.max(1, slots) * 16));
  const nodeRgba = capacity.map((slots) => new Float32Array(Math.max(1, slots) * 4));
  const nodeVisible = new Uint8Array(poseCount).fill(1);

  const frameAt = (timeSeconds: number): number => {
    const u = (timeSeconds * speed) / clipSeconds;
    if (!Number.isFinite(u)) return 0;
    return Math.min(poseCount - 1, Math.floor((u - Math.floor(u)) * poseCount));
  };
  const groupForNode = (node: number, frame: number): number => (((node - frame) % poseCount) + poseCount) % poseCount;

  const writeInstance = (node: number, slot: number, spectator: number, timeSeconds: number): void => {
    const m = nodeMatrices[node]!;
    const o = slot * 16;
    const s = scales[spectator]!;
    const yaw = yaws[spectator]!;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    let y = positions[spectator * 3 + 1]!;
    if (bob > 0) {
      const u = (timeSeconds * speed) / clipSeconds + phases[spectator]!;
      y += bob * 0.5 * (1 - Math.cos(2 * Math.PI * u));
    }
    m[o] = c * s; m[o + 1] = 0; m[o + 2] = -sn * s; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = sn * s; m[o + 9] = 0; m[o + 10] = c * s; m[o + 11] = 0;
    m[o + 12] = positions[spectator * 3]!; m[o + 13] = y; m[o + 14] = positions[spectator * 3 + 2]!; m[o + 15] = 1;
    const rgba = nodeRgba[node]!;
    const r = slot * 4;
    rgba[r] = colors[spectator * 4]!;
    rgba[r + 1] = colors[spectator * 4 + 1]!;
    rgba[r + 2] = colors[spectator * 4 + 2]!;
    rgba[r + 3] = colors[spectator * 4 + 3]!;
  };

  /** Fill node `k` for `frame`; returns its spectator count. */
  const fillNode = (node: number, frame: number, timeSeconds: number): number => {
    let slot = 0;
    for (let h = heldStart[node]!; h < heldStart[node + 1]!; h += 1) writeInstance(node, slot++, heldMembers[h]!, timeSeconds);
    const group = groupForNode(node, frame);
    for (let g = groupStart[group]!; g < groupStart[group + 1]!; g += 1) writeInstance(node, slot++, groupMembers[g]!, timeSeconds);
    return slot;
  };
  const nodeCount = (node: number, frame: number): number => {
    const group = groupForNode(node, frame);
    return heldStart[node + 1]! - heldStart[node]! + groupStart[group + 1]! - groupStart[group]!;
  };

  // Static spec at frame 0 (what draws before the first update), padded to each node's capacity.
  const nodeMaterial = options.material ?? material.pbr({ color: "#ffffff", roughness: 0.85 });
  const nodes = poses.map((pose, k) => {
    const members: number[] = [];
    for (let h = heldStart[k]!; h < heldStart[k + 1]!; h += 1) members.push(heldMembers[h]!);
    for (let g = groupStart[k]!; g < groupStart[k + 1]!; g += 1) members.push(groupMembers[g]!);
    const fill = members.length > 0 ? members[members.length - 1]! : 0;
    while (count > 0 && members.length < capacity[k]!) members.push(fill);
    const transforms: AuraTransformSpec[] = members.map((i) => ({
      position: [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!],
      rotation: [0, yaws[i]!, 0],
      scale: scales[i]!
    }));
    const spectatorColors: AuraColor[] = members.map((i) => options.spectators[i]?.color ?? "#ffffff");
    return instances.custom(pose, {
      name: `${options.name ?? options.id}-pose-${k}`,
      material: nodeMaterial,
      transforms,
      colors: spectatorColors,
      castShadow: options.castShadow ?? true,
      receiveShadow: options.receiveShadow ?? true
    }).runtime({ id: nodeIds[k]! }) as unknown as AuraNodeBuilder<AuraPrimitiveNode>;
  });

  let lastFrame = -1;
  let lastDraws = 0;
  let dirty = true;
  const crowd: AuraCrowd = {
    id: options.id,
    count,
    poseCount,
    nodes,
    nodeIds,
    positions,
    yaws,
    scales,
    colors,
    setYaw(index, yaw) {
      if (index < 0 || index >= count) return;
      yaws[index] = yaw;
      dirty = true;
    },
    setPosition(index, x, y, z) {
      if (index < 0 || index >= count) return;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      dirty = true;
    },
    setColor(index, color) {
      if (index < 0 || index >= count) return;
      colors.set(colorToLinearRgba(color), index * 4);
      dirty = true;
    },
    markDirty() {
      dirty = true;
    },
    frameAt,
    update(target, timeSeconds) {
      const frame = frameAt(timeSeconds);
      if (bob === 0 && !dirty && frame === lastFrame) return lastDraws;
      let draws = 0;
      for (let k = 0; k < poseCount; k += 1) {
        const handle = target.nodes.get(nodeIds[k]!);
        if (handle === undefined) continue;
        const filled = fillNode(k, frame, timeSeconds);
        if (filled > 0) {
          handle.setInstanceMatrices(nodeMatrices[k]!, filled, nodeRgba[k]!);
          if (nodeVisible[k] === 0) {
            handle.setVisible(true);
            nodeVisible[k] = 1;
          }
          draws += 1;
        } else if (nodeVisible[k] === 1) {
          handle.setVisible(false);
          nodeVisible[k] = 0;
        }
      }
      lastFrame = frame;
      lastDraws = draws;
      dirty = false;
      return draws;
    },
    drawPlan(timeSeconds = 0) {
      const frame = frameAt(timeSeconds);
      const perNode = nodeIds.map((id, k) => ({ id, pose: k, count: nodeCount(k, frame), capacity: capacity[k]! }));
      const draws = perNode.filter((node) => node.count > 0).length;
      return {
        kind: "aura-crowd-draw-plan",
        spectators: count,
        poseNodes: poseCount,
        frame,
        draws,
        perNode,
        trianglesPerSpectator: poseSet.triangles,
        triangles: poseSet.triangles * count
      };
    }
  };
  return crowd;
}

function isPoseSet(value: AuraCrowdPoseSet | readonly AuraCustomGeometrySpec[]): value is AuraCrowdPoseSet {
  return !Array.isArray(value);
}
