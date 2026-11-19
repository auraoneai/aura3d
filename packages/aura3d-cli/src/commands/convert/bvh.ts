/**
 * BVH -> glTF JSON: a joint-node hierarchy, one skin, one animation clip, and a small skinned joint-marker proxy mesh
 * (so the GLB has inspectable bounds and the skin is bound to geometry). Retargeting onto a real rig is
 * `aura3d animation import`, not this command.
 */

import type { BVHAsset } from "@aura3d/assets/importers";

type Json = Record<string, unknown>;

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

class BinaryBuilder {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;
  readonly bufferViews: Json[] = [];
  readonly accessors: Json[] = [];

  add(data: Float32Array | Uint16Array | Uint32Array, type: "SCALAR" | "VEC3" | "VEC4" | "MAT4", componentType: number, bounds = false): number {
    const padding = (4 - (this.length % 4)) % 4;
    if (padding) {
      this.chunks.push(new Uint8Array(padding));
      this.length += padding;
    }
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
    this.bufferViews.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength });
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const accessor: Json = { bufferView: this.bufferViews.length - 1, componentType, count: data.length / width, type };
    if (bounds) {
      const min = new Array<number>(width).fill(Infinity);
      const max = new Array<number>(width).fill(-Infinity);
      for (let i = 0; i < data.length; i++) {
        const axis = i % width;
        min[axis] = Math.min(min[axis]!, data[i]!);
        max[axis] = Math.max(max[axis]!, data[i]!);
      }
      accessor.min = min.map(Math.fround);
      accessor.max = max.map(Math.fround);
    }
    this.accessors.push(accessor);
    return this.accessors.length - 1;
  }

  buffer(): Json {
    const bytes = Buffer.concat(this.chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    return { byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${bytes.toString("base64")}` };
  }
}

/** Build a self-contained glTF document from a parsed BVH asset. */
export function bvhToGltf(asset: BVHAsset, clipName: string): Json {
  const joints = asset.joints;
  if (joints.length === 0) throw new Error("BVH_EMPTY: the hierarchy has no joints");
  const builder = new BinaryBuilder();
  const world: [number, number, number][] = [];
  const children: number[][] = joints.map(() => []);
  joints.forEach((joint, index) => {
    const parent = joint.parentIndex < 0 ? [0, 0, 0] : world[joint.parentIndex]!;
    world.push([parent[0]! + joint.offset[0], parent[1]! + joint.offset[1], parent[2]! + joint.offset[2]]);
    if (joint.parentIndex >= 0) children[joint.parentIndex]!.push(index);
  });
  const nodes: Json[] = joints.map((joint, index) => ({
    name: joint.name,
    translation: [...joint.offset],
    ...(children[index]!.length ? { children: children[index] } : {})
  }));

  // Joint markers: one small octahedron per joint, rigidly weighted to that joint.
  let extent = 0;
  for (const point of world) for (const value of point) extent = Math.max(extent, Math.abs(value));
  const radius = Math.max(extent * 0.02, 1e-3);
  const directions: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  const positions = new Float32Array(joints.length * 18);
  const normals = new Float32Array(joints.length * 18);
  const jointIndices = new Uint16Array(joints.length * 24);
  const weights = new Float32Array(joints.length * 24);
  const indices = new Uint32Array(joints.length * 24);
  world.forEach((center, joint) => {
    directions.forEach((direction, corner) => {
      const vertex = joint * 6 + corner;
      for (let axis = 0; axis < 3; axis++) {
        positions[vertex * 3 + axis] = center[axis]! + direction[axis]! * radius;
        normals[vertex * 3 + axis] = direction[axis]!;
      }
      jointIndices[vertex * 4] = joint;
      weights[vertex * 4] = 1;
    });
    faces.forEach((face, f) => face.forEach((corner, k) => { indices[joint * 24 + f * 3 + k] = joint * 6 + corner; }));
  });
  const inverseBind = new Float32Array(joints.length * 16);
  world.forEach((point, joint) => {
    inverseBind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -point[0], -point[1], -point[2], 1], joint * 16);
  });
  const attributes = {
    POSITION: builder.add(positions, "VEC3", FLOAT, true),
    NORMAL: builder.add(normals, "VEC3", FLOAT),
    JOINTS_0: builder.add(jointIndices, "VEC4", UNSIGNED_SHORT),
    WEIGHTS_0: builder.add(weights, "VEC4", FLOAT)
  };
  const indexAccessor = builder.add(indices, "SCALAR", UNSIGNED_INT);
  const inverseBindAccessor = builder.add(inverseBind, "MAT4", FLOAT);
  const markerNode = nodes.length;
  nodes.push({ name: "bvh-joint-markers", mesh: 0, skin: 0 });

  // One clip: every track shares the BVH frame times.
  const nodeByName = new Map(joints.map((joint, index) => [joint.name, index]));
  const samplers: Json[] = [];
  const channels: Json[] = [];
  let input: number | undefined;
  for (const track of asset.clip.tracks) {
    const dot = track.target.lastIndexOf(".");
    const node = nodeByName.get(track.target.slice(0, dot));
    const path = track.target.slice(dot + 1);
    if (node === undefined || (path !== "translation" && path !== "rotation") || track.keyframes.length === 0) continue;
    if (input === undefined) input = builder.add(new Float32Array(track.keyframes.map((key) => key.time)), "SCALAR", FLOAT, true);
    const width = path === "rotation" ? 4 : 3;
    const values = new Float32Array(track.keyframes.length * width);
    track.keyframes.forEach((key, index) => values.set(key.value as readonly number[], index * width));
    samplers.push({ input, output: builder.add(values, width === 4 ? "VEC4" : "VEC3", FLOAT), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  }

  return {
    asset: { version: "2.0", generator: "Aura3D assets convert (BVH)" },
    buffers: [builder.buffer()],
    bufferViews: builder.bufferViews,
    accessors: builder.accessors,
    materials: [{ name: "bvh-joint-marker", pbrMetallicRoughness: { baseColorFactor: [0.85, 0.55, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    meshes: [{ name: "bvh-joint-markers", primitives: [{ attributes, indices: indexAccessor, material: 0, mode: 4 }] }],
    skins: [{ name: "bvh-skeleton", joints: joints.map((_, index) => index), inverseBindMatrices: inverseBindAccessor, skeleton: 0 }],
    nodes,
    ...(channels.length ? { animations: [{ name: clipName, samplers, channels }] } : {}),
    scenes: [{ name: clipName, nodes: [0, markerNode] }],
    scene: 0
  };
}
