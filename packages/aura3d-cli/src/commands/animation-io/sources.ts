/**
 * Source readers for `aura3d animation import`: .bvh, .fbx, .glb/.gltf clips and HY-Motion (fal `hunyuan-motion`)
 * motion.json -> canonical humanoid frames (@aura3d/animation smpl module). Also reads the target rig's skeleton.
 * Dependency-free apart from the engine's own BVH/FBX parsers (@aura3d/assets/importers, loaded on demand).
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import {
  isHyMotionDict,
  resampleCanonicalFrames,
  skeletalMotionToFrames,
  smplMotionToFrames,
  type HumanoidDriverOptions,
  type HumanoidFacing,
  type HumanoidPoseInput,
  type IdolBone,
  type IdolSkeleton,
  type RootMotionMode,
  type SkeletalMotionFrame
} from "@aura3d/animation";
import { buildHierarchy, clipDuration, localPose, readGlbFile, restTrs, type GlbData, type GltfJson } from "../../skin/gltf.js";

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

export type SourceFormat = "bvh" | "fbx" | "gltf" | "hy-motion";

export interface SourceReadOptions {
  /** Source clip names to import from a multi-clip file (GLB/FBX). Default: every clip. */
  readonly clips?: readonly string[];
  readonly window?: readonly [number, number];
  readonly loop?: boolean;
  readonly faceForward?: boolean;
  readonly rootMotion?: RootMotionMode;
  /** Output sample rate. */
  readonly fps: number;
  readonly facing?: HumanoidFacing | "auto";
  readonly roles?: HumanoidDriverOptions["roles"];
}

export interface SourceClip {
  /** Clip name inside the source (file stem for single-clip formats). */
  readonly sourceName: string;
  readonly format: SourceFormat;
  readonly fps: number;
  readonly frames: readonly HumanoidPoseInput[];
  readonly meta: Readonly<Record<string, number | string>>;
  /** Source role -> bone mapping (absent for HY-Motion: SMPL joints are fixed). */
  readonly roles?: Readonly<Record<string, string>>;
  readonly facing?: { readonly facing: HumanoidFacing; readonly method: string };
  readonly diagnostics: readonly string[];
}

export function sourceFormatOf(file: string): SourceFormat | undefined {
  const ext = extname(file).toLowerCase();
  if (ext === ".bvh") return "bvh";
  if (ext === ".fbx") return "fbx";
  if (ext === ".glb" || ext === ".gltf") return "gltf";
  if (ext === ".json") return "hy-motion";
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  glTF documents and skeletons                                       */
/* ------------------------------------------------------------------ */

function decodeDataUri(uri: string): Buffer {
  const comma = uri.indexOf(",");
  if (!uri.startsWith("data:") || comma < 0) throw new Error("unsupported data URI");
  const head = uri.slice(5, comma);
  const body = uri.slice(comma + 1);
  return head.endsWith(";base64") ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8");
}

/** A .gltf JSON (data-URI or relative-file buffers) as one GlbData with a single binary buffer. */
export function gltfJsonToGlbData(json: GltfJson, baseDir: string): GlbData {
  const out = JSON.parse(JSON.stringify(json)) as GltfJson;
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  for (const buffer of out.buffers ?? []) {
    let bytes: Buffer;
    if (!buffer.uri) bytes = Buffer.alloc(buffer.byteLength);
    else if (buffer.uri.startsWith("data:")) bytes = decodeDataUri(buffer.uri);
    else {
      const file = resolve(baseDir, decodeURIComponent(buffer.uri));
      if (!existsSync(file)) throw new Error(`glTF buffer ${buffer.uri} not found next to the .gltf`);
      bytes = readFileSync(file);
    }
    const pad = (4 - (length % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); length += pad; }
    offsets.push(length);
    parts.push(bytes);
    length += bytes.length;
  }
  for (const view of out.bufferViews ?? []) {
    view.byteOffset = (view.byteOffset ?? 0) + (offsets[view.buffer] ?? 0);
    view.buffer = 0;
  }
  out.buffers = [{ byteLength: length }];
  out.accessors ??= [];
  out.bufferViews ??= [];
  out.nodes ??= [];
  return { json: out, bin: Buffer.concat(parts) };
}

export function readGltfFile(file: string): GlbData {
  if (extname(file).toLowerCase() === ".glb") return readGlbFile(file);
  const json = JSON.parse(readFileSync(file, "utf8")) as GltfJson;
  return gltfJsonToGlbData(json, dirname(file));
}

export interface GltfSkeleton {
  readonly skeleton: IdolSkeleton;
  /** glTF node index of each bone. */
  readonly nodes: readonly number[];
}

const quat = (r: readonly number[]): Quat => {
  const l = Math.hypot(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 1) || 1;
  return [(r[0] ?? 0) / l, (r[1] ?? 0) / l, (r[2] ?? 0) / l, (r[3] ?? 1) / l];
};
const vec = (v: readonly number[]): Vec3 => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];

function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
function qmul(a: Quat, b: Quat): Quat {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}

/**
 * Skeleton of a glTF document: the largest skin's joints (or, for skinless animation files, the mesh-free subtree of
 * the top-level node above the animated nodes), with intermediate nodes between joints added so parents connect.
 * Matrix transforms are decomposed; the fixed chain above each root joint becomes `rootParents`.
 */
export function readGltfSkeleton(glb: GlbData): GltfSkeleton {
  const json = glb.json;
  const nodes = json.nodes ?? [];
  const h = buildHierarchy(glb);
  const skins = [...(json.skins ?? [])].sort((a, b) => b.joints.length - a.joints.length);
  const set = new Set<number>();
  if (skins[0] && skins[0].joints.length > 0) for (const j of skins[0].joints) set.add(j);
  else {
    // Skinless animation file (e.g. a Mixamo "without skin" FBX or a BVH-style glTF): the mesh-free subtree of the
    // top-level node above each animated node (the FBX unit/axis node or an "Armature" empty becomes a fixed root joint).
    const add = (n: number): void => { if (nodes[n]?.mesh !== undefined || set.has(n)) return; set.add(n); for (const c of nodes[n]?.children ?? []) add(c); };
    for (const anim of json.animations ?? []) for (const ch of anim.channels) {
      let top = ch.target.node;
      if (top === undefined) continue;
      while ((h.parent[top] ?? -1) >= 0) top = h.parent[top]!;
      add(top);
    }
  }
  if (set.size === 0) throw new Error("has no skin and no animated nodes: nothing to read a skeleton from");
  // Fill gaps: a node between two joints is a joint.
  for (const j of [...set]) {
    const chain: number[] = [];
    for (let p = h.parent[j] ?? -1; p >= 0; p = h.parent[p] ?? -1) {
      if (set.has(p)) { for (const c of chain) set.add(c); break; }
      chain.push(p);
    }
  }
  const order = [...set].sort((a, b) => a - b);
  const indexOf = new Map(order.map((n, i) => [n, i]));
  const bones: IdolBone[] = order.map((n) => {
    const trs = restTrs(nodes[n]!);
    const p = h.parent[n] ?? -1;
    return { name: nodes[n]?.name ?? `node_${n}`, parent: p >= 0 && indexOf.has(p) ? indexOf.get(p)! : -1, t: vec(trs.t), r: quat(trs.r), s: vec(trs.s) };
  });
  const names = new Set<string>();
  bones.forEach((b, i) => { if (names.has(b.name)) (bones[i] as { name: string }).name = `${b.name}#${order[i]}`; names.add(bones[i]!.name); });
  const rootParents: Record<number, { t: Vec3; r: Quat; s: number }> = {};
  bones.forEach((b, i) => {
    if (b.parent !== -1) return;
    const chain: number[] = [];
    for (let p = h.parent[order[i]!] ?? -1; p >= 0; p = h.parent[p] ?? -1) chain.unshift(p);
    let w = { t: [0, 0, 0] as Vec3, r: [0, 0, 0, 1] as Quat, s: 1 };
    for (const n of chain) {
      const trs = restTrs(nodes[n]!);
      const v = rotate(w.r, vec(trs.t));
      w = { t: [w.t[0] + v[0] * w.s, w.t[1] + v[1] * w.s, w.t[2] + v[2] * w.s], r: qmul(w.r, quat(trs.r)), s: w.s * (trs.s[0] ?? 1) };
    }
    rootParents[i] = w;
  });
  return { skeleton: { bones, rootParents }, nodes: order };
}

/* ------------------------------------------------------------------ */
/*  Readers                                                            */
/* ------------------------------------------------------------------ */

function finish(sourceName: string, format: SourceFormat, fps: number, frames: readonly HumanoidPoseInput[], meta: Record<string, number | string>, opts: SourceReadOptions, extra: Partial<SourceClip> = {}): SourceClip {
  return {
    sourceName, format, fps: opts.fps,
    frames: resampleCanonicalFrames(frames, fps, opts.fps),
    meta: { ...meta, sourceFps: +fps.toFixed(3) },
    diagnostics: [], ...extra
  };
}

function canonicalOptions(opts: SourceReadOptions) {
  return {
    ...(opts.window ? { window: opts.window } : {}),
    ...(opts.loop ? { loop: true } : {}),
    ...(opts.faceForward === false ? { faceForward: false } : {}),
    ...(opts.rootMotion ? { rootMotion: opts.rootMotion } : {}),
    ...(opts.facing ? { facing: opts.facing } : {}),
    ...(opts.roles ? { roles: opts.roles } : {})
  };
}

function fromSkeletal(sourceName: string, format: SourceFormat, skeleton: IdolSkeleton, fps: number, frames: SkeletalMotionFrame[], opts: SourceReadOptions, diagnostics: string[]): SourceClip {
  let motion;
  try {
    motion = skeletalMotionToFrames({ skeleton, fps, frames }, canonicalOptions(opts));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${sourceName}: ${message}. The source skeleton must be a Y-up humanoid; pass --map map.json with a "source" role map, or --source-facing.`);
  }
  return finish(sourceName, format, fps, motion.frames, { ...motion.meta }, opts, {
    roles: motion.map.roles as Record<string, string>,
    facing: { facing: motion.facing, method: motion.facingMethod },
    diagnostics
  });
}

function readHyMotion(file: string, opts: SourceReadOptions): SourceClip[] {
  let dict: unknown;
  try { dict = JSON.parse(readFileSync(file, "utf8")); } catch (error) { throw new Error(`${file}: not valid JSON (${error instanceof Error ? error.message : String(error)})`); }
  if (!isHyMotionDict(dict)) {
    throw new Error(`${file}: not a HY-Motion motion.json (expected rot6d [1][F][22][6], transl [1][F][3], keypoints3d [1][F][J][3]; download the fal hunyuan-motion "motion_json" file).`);
  }
  const r = smplMotionToFrames(dict, {
    ...(opts.window ? { window: opts.window } : {}),
    ...(opts.loop ? { loop: true } : {}),
    ...(opts.faceForward === false ? { faceForward: false } : {}),
    ...(opts.rootMotion ? { rootMotion: opts.rootMotion } : {})
  });
  return [finish(basename(file, extname(file)), "hy-motion", r.fps, r.frames, { ...r.meta }, opts, { facing: { facing: "+z", method: "smpl" } })];
}

async function readBvh(file: string, opts: SourceReadOptions): Promise<SourceClip[]> {
  const { parseBVH } = await import("@aura3d/assets/importers");
  const asset = parseBVH(readFileSync(file, "utf8"), { clipName: basename(file, extname(file)) });
  const joints = asset.joints;
  const skeleton: IdolSkeleton = {
    bones: joints.map((j) => ({ name: j.name, parent: j.parentIndex, t: [j.offset[0], j.offset[1], j.offset[2]] as Vec3, r: [0, 0, 0, 1] as Quat, s: [1, 1, 1] as Vec3 })),
    rootParents: {}
  };
  const rot = new Map<string, readonly { value: unknown }[]>();
  const pos = new Map<string, readonly { value: unknown }[]>();
  for (const track of asset.clip.tracks) {
    const dot = track.target.lastIndexOf(".");
    const joint = track.target.slice(0, dot), path = track.target.slice(dot + 1);
    (path === "rotation" ? rot : pos).set(joint, track.keyframes as readonly { value: unknown }[]);
  }
  const frames: SkeletalMotionFrame[] = [];
  for (let f = 0; f < asset.frameCount; f++) {
    frames.push({
      r: joints.map((j) => (rot.get(j.name)?.[f]?.value as Quat | undefined) ?? [0, 0, 0, 1]),
      t: joints.map((j) => (pos.get(j.name)?.[f]?.value as Vec3 | undefined) ?? j.offset)
    });
  }
  return [fromSkeletal(basename(file, extname(file)), "bvh", skeleton, 1 / asset.frameTime, frames, opts, asset.diagnostics.map((d) => `${d.code}: ${d.message}`))];
}

function readGltfClips(glb: GlbData, file: string, format: SourceFormat, opts: SourceReadOptions, diagnostics: string[]): SourceClip[] {
  const animations = glb.json.animations ?? [];
  if (animations.length === 0) throw new Error(`${file}: has no animation clips to import.`);
  const named = animations.map((a, i) => ({ anim: a, name: a.name?.trim() || `clip${i}` }));
  const wanted = opts.clips?.length ? named.filter((c) => opts.clips!.includes(c.name)) : named;
  if (wanted.length === 0) throw new Error(`${file}: no clip named ${opts.clips!.join(", ")} (clips: ${named.map((c) => c.name).join(", ")}).`);
  let sk: GltfSkeleton;
  try { sk = readGltfSkeleton(glb); } catch (error) { throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`); }
  const h = buildHierarchy(glb);
  return wanted.map(({ anim, name }) => {
    const duration = clipDuration(glb, anim);
    if (!(duration > 0)) throw new Error(`${file}: clip "${name}" has zero duration.`);
    const n = Math.max(2, Math.round(duration * opts.fps) + 1);
    const frames: SkeletalMotionFrame[] = [];
    for (let f = 0; f < n; f++) {
      const trs = localPose(glb, anim, Math.min(duration, f / opts.fps), h);
      frames.push({ r: sk.nodes.map((node) => quat(trs[node]!.r)), t: sk.nodes.map((node) => vec(trs[node]!.t)) });
    }
    return fromSkeletal(name, format, sk.skeleton, opts.fps, frames, opts, diagnostics);
  });
}

async function readFbx(file: string, opts: SourceReadOptions): Promise<SourceClip[]> {
  const { parseFBX } = await import("@aura3d/assets/importers");
  const result = await parseFBX(new Uint8Array(readFileSync(file)));
  const glb = gltfJsonToGlbData(result.gltf as unknown as GltfJson, dirname(file));
  return readGltfClips(glb, file, "fbx", opts, result.diagnostics.map((d) => `${d.code}: ${d.message}`));
}

/** Read every requested clip of one source file as canonical frames at `opts.fps`. */
export async function readSourceClips(file: string, opts: SourceReadOptions): Promise<SourceClip[]> {
  if (!existsSync(file)) throw new Error(`Source not found: ${file}`);
  const format = sourceFormatOf(file);
  if (format === "bvh") return readBvh(file, opts);
  if (format === "fbx") return readFbx(file, opts);
  if (format === "gltf") return readGltfClips(readGltfFile(file), file, "gltf", opts, []);
  if (format === "hy-motion") return readHyMotion(file, opts);
  throw new Error(`${file}: unsupported source format "${extname(file)}". Use .bvh, .fbx, .glb/.gltf (with clips) or a HY-Motion motion.json.`);
}
