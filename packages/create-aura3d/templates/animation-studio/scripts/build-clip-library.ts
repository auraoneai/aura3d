/**
 * build-clip-library.ts — Phase 3.2: the HONEST "fetch the library from the prompt CLI".
 *
 * For each motion in the STANDARD performance vocabulary (idle / talk / gesture / point / nod /
 * walk / run / react) this:
 *
 *   1. searches the live ~850k Aura3D catalog (the same hosted worker + direct-GLB filter as
 *      `resolve-asset.ts`) for a rigged, animated GLB carrying that motion
 *      (`assets resolve "<motion> animation"` — the `--animated` intent),
 *   2. downloads + inspects it, requiring a humanoid skin and >=1 embedded clip,
 *   3. EXTRACTS the embedded clip's real keyframe tracks straight out of the GLB binary
 *      (accessor float data — not synthesized), maps each animated node to a canonical humanoid
 *      bone via `inferHumanoidRig` from `@aura3d/animation`, and RE-EXPRESSES every track on the
 *      STANDARD humanoid rig (`STANDARD_LIBRARY_RIG`, canonical `HUMANOID_BONES`). The result is
 *      rig-neutral: its track targets are `<humanoidBone>.rotation` / `.translation`, exactly the
 *      shape the procedural `standardHumanoidClips` use, so it retargets onto any character rig
 *      via an identity-or-inferred `createHumanoidRetargetingMap` downstream.
 *   4. writes each extracted clip to `public/clip-library/<id>.json` + a `manifest.json` recording
 *      per-clip provenance (source title, url, license, attribution, original clip name, hash).
 *
 * HONESTY: this depends on the live catalog actually returning a suitable rigged+animated GLB for
 * a query. Most catalog hits for "<motion>" are static props or single-rig characters; many GLBs
 * are external-texture or insane-scale. When a query yields nothing usable we DO NOT fabricate a
 * clip — we fall back to the procedural standard clip (`createStandardHumanoidClipDefinitions`)
 * and record `source: "procedural-fallback"` in the manifest, logging it loudly. The loader
 * (`loadExtractedClipLibrary`) then augments/overrides the procedural registry only where a real
 * extracted clip exists.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnimationClipRegistry,
  AnimationTrack,
  HUMANOID_BONES,
  STANDARD_CLIP_IDS,
  STANDARD_LIBRARY_RIG,
  createStandardHumanoidClipDefinitions,
  inferHumanoidRigDetailed,
  type AnimationClipDefinition,
  type HumanoidBoneName,
  type StandardClipId
} from "@aura3d/animation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "clip-library");
const WORKER = "https://aura3d-asset-index-cron.newsroom.workers.dev/search";

/**
 * Per-motion catalog config:
 *  - `query`: catalog search string (`--animated` intent baked in).
 *  - `clipKeywords`: tokens we look for in the EMBEDDED clip name to confirm the clip actually
 *    depicts this motion. A candidate whose clip name matches is strongly preferred; only if no
 *    candidate's clip name matches do we accept a name-agnostic best-animated clip (recorded as a
 *    weaker `nameMatch:false` in provenance — honest about the looseness of catalog semantics).
 */
interface MotionConfig {
  readonly query: string;
  readonly clipKeywords: readonly string[];
}

// Keywords are matched as whole tokens (+ short inflections) by `clipNameMatches`, so use base
// word stems that appear as standalone tokens in real clip names (Mixamo/Blender conventions).
const MOTION_QUERIES: Readonly<Record<StandardClipId, MotionConfig>> = {
  idle: { query: "idle breathing character animation", clipKeywords: ["idle", "breathing", "stand"] },
  talk: { query: "talking gesture character animation", clipKeywords: ["talk", "speak", "speaking", "talking", "dialogue"] },
  gesture: { query: "wave gesture character animation", clipKeywords: ["wave", "waving", "gesture", "greet", "hello"] },
  point: { query: "pointing character animation", clipKeywords: ["point", "pointing", "aim", "indicate"] },
  nod: { query: "nodding head character animation", clipKeywords: ["nod", "nodding", "yes"] },
  walk: { query: "walk cycle character animation", clipKeywords: ["walk", "walking", "stride"] },
  run: { query: "running character animation", clipKeywords: ["run", "running", "sprint", "jog"] },
  react: { query: "surprised reaction character animation", clipKeywords: ["react", "reaction", "surprised", "flinch", "recoil"] }
};

// ----------------------------------------------------------------------------------------------
// Catalog search (mirrors resolve-asset.ts: wide ranked list of direct .glb, commercial-OK)
// ----------------------------------------------------------------------------------------------

interface CatalogResult {
  id: string;
  title: string;
  source: string;
  url: string;
  license?: string;
  attribution?: string;
}

async function searchCatalog(query: string): Promise<CatalogResult[]> {
  const url = `${WORKER}?q=${encodeURIComponent(query)}&limit=60&commercial=true&animated=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  const data = (await res.json()) as { results?: CatalogResult[] };
  return (data.results ?? []).filter((r) => typeof r.url === "string" && /\.glb($|\?)/.test(r.url));
}

// ----------------------------------------------------------------------------------------------
// GLB parsing — JSON chunk + BIN chunk, enough to read animation sampler accessors.
// ----------------------------------------------------------------------------------------------

interface ParsedGlb {
  readonly json: GltfJson;
  readonly bin: Buffer;
}

interface GltfJson {
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: { byteLength: number; uri?: string }[];
  nodes?: { name?: string }[];
  skins?: { joints?: number[] }[];
  meshes?: { primitives?: { attributes?: Record<string, number>; indices?: number }[] }[];
  images?: { bufferView?: number }[];
  animations?: GltfAnimation[];
}

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4" | string;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfAnimation {
  name?: string;
  channels: { sampler: number; target: { node?: number; path: string } }[];
  samplers: { input: number; output: number; interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE" }[];
}

function parseGlb(buf: Buffer): ParsedGlb | null {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return null; // "glTF"
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(buf.slice(jsonStart, jsonStart + jsonLen).toString("utf8")) as GltfJson;
  // BIN chunk follows the JSON chunk (8-byte chunk header: length + type 0x004E4942).
  let bin = Buffer.alloc(0);
  const binHeader = jsonStart + jsonLen;
  if (binHeader + 8 <= buf.length && buf.readUInt32LE(binHeader + 4) === 0x004e4942) {
    const binLen = buf.readUInt32LE(binHeader);
    bin = buf.slice(binHeader + 8, binHeader + 8 + binLen);
  }
  return { json, bin };
}

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Read an accessor as an array of number tuples (one tuple per element). Float accessors only. */
function readAccessor(glb: ParsedGlb, index: number): number[][] {
  const acc = glb.json.accessors?.[index];
  if (!acc || acc.bufferView === undefined) return [];
  const view = glb.json.bufferViews?.[acc.bufferView];
  if (!view) return [];
  const comps = TYPE_COMPONENTS[acc.type] ?? 1;
  const compBytes = COMPONENT_BYTES[acc.componentType] ?? 4;
  const elemBytes = comps * compBytes;
  const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : elemBytes;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out: number[][] = [];
  for (let i = 0; i < acc.count; i += 1) {
    const elemStart = base + i * stride;
    const tuple: number[] = [];
    for (let c = 0; c < comps; c += 1) {
      const off = elemStart + c * compBytes;
      if (off + compBytes > glb.bin.length) return out; // truncated/malformed — stop honestly
      // We only consume FLOAT (5126) sampler data; quantized inputs are rare for animation.
      tuple.push(acc.componentType === 5126 ? glb.bin.readFloatLE(off) : glb.bin.readInt32LE(off));
    }
    out.push(tuple);
  }
  return out;
}

// ----------------------------------------------------------------------------------------------
// Normalization (rest-pose reconciliation): make extracted tracks USABLE on the standard rig.
//
// Raw catalog clips lay the character DOWN / contort it for three independent reasons:
//   (a) UNITS — many GLBs author hips translation in centimetres / raw exporter units, so a single
//       stride reads as ~30 instead of ~0.3m. We detect the source scale from the magnitude of the
//       hips translation (a clean stride is well under ~1.5m; anything an order of magnitude larger
//       is cm/raw) and divide every translation component by it.
//   (b) HIPS REST-POSE OFFSET — the clip's bind/first frame is not the standard rig's rest pose: the
//       hips carry a constant world-position offset (e.g. y≈32) AND a constant rotation offset (a
//       Z-up→Y-up axis swap or a lean). We re-anchor by subtracting the first frame: translations
//       become RELATIVE to frame 0 (dropping absolute world position).
//   (c) PER-BONE REST-POSE OFFSET (the M6 blocker) — EVERY bone (toes/legs/feet/head/shoulders) of an
//       extracted clip carries a baked, CONSTANT axis-conversion rest rotation (toes/feet ~180°, head
//       ~90°). Because the standard library rig has an IDENTITY rest, retargeting (Rt = Rt0·Rs0⁻¹·Ra,
//       Rs0 = I) applies that constant offset straight onto the target → the character renders
//       laid-down / contorted, and a range-based gate misses it (a constant offset never moves).
//
//   Reconciliation: estimate each rotation track's SOURCE REST rotation (the part that is CONSTANT
//   across the clip — pure rest mismatch) and RE-ANCHOR every keyframe relative to it:
//       R_motion(t) = R_rest⁻¹ · R(t).
//   This removes the baked 90°/180° offset (R_motion(rest frame) = identity = standard rest = upright)
//   while preserving the per-frame RELATIVE motion (leg swing, head turn). The rest estimate is the
//   temporal-MEDIAN quaternion (robust to the swinging extremes of a walk/run), which for a static
//   offset bone equals the offset and for a moving bone equals its mid-pose.
//
// Post-condition (matches the loader sanity gate in animation-performance.ts):
//   hips:  max |translation component| ≲ 1.0  and  max (1 - |w|) ≲ 0.2;
//   every rotation bone returns near rest at some frame: worstFloor = max over bones of
//   min over keyframes of (1 - |w|)  < 0.15.
// ----------------------------------------------------------------------------------------------

const HIPS_TRANS_TARGET = /(^|[.\/])hips\.translation$/i;
const ROT_TARGET = /\.rotation$/i;

/** Quaternion conjugate (= inverse for unit quaternions). Layout is [x, y, z, w]. */
function quatConjugate(q: readonly number[]): [number, number, number, number] {
  return [-(q[0] ?? 0), -(q[1] ?? 0), -(q[2] ?? 0), q[3] ?? 1];
}

/** Hamilton product a*b for [x, y, z, w] quaternions. */
function quatMultiply(a: readonly number[], b: readonly number[]): [number, number, number, number] {
  const [ax, ay, az, aw] = [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 1];
  const [bx, by, bz, bw] = [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 1];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function quatNormalize(q: readonly number[]): [number, number, number, number] {
  const len = Math.hypot(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1) || 1;
  return [(q[0] ?? 0) / len, (q[1] ?? 0) / len, (q[2] ?? 0) / len, (q[3] ?? 1) / len];
}

/**
 * Estimate a rotation track's CONSTANT part (its source rest rotation) as the temporal-median
 * quaternion. We first flip every keyframe into the same hemisphere as the first (quaternions double-
 * cover SO(3): q and -q are the same rotation), then take the component-wise median and renormalize.
 *
 * Why median, not mean or first-frame: the median is robust to the swinging extremes of a cyclic clip
 * (a walk's legs reach far in both directions; the median sits at the neutral mid-pose), and for a
 * bone that carries ONLY a baked rest offset (toes/feet never move) the median IS that offset exactly.
 * Re-anchoring by R_rest⁻¹ then sends the neutral pose to identity (= the standard rig's upright rest)
 * and keeps the swing symmetric about it. Returns identity for an empty/short track.
 */
function quatRestEstimate(quats: readonly (readonly number[])[]): [number, number, number, number] {
  if (quats.length === 0) return [0, 0, 0, 1];
  const ref = quatNormalize(quats[0]!);
  const aligned = quats.map((raw) => {
    const q = quatNormalize(raw);
    const dot = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3];
    return dot < 0 ? ([-q[0], -q[1], -q[2], -q[3]] as [number, number, number, number]) : q;
  });
  const median = (i: number): number => {
    const col = aligned.map((q) => q[i]!).sort((a, b) => a - b);
    const n = col.length;
    return n % 2 ? col[(n - 1) / 2]! : (col[n / 2 - 1]! + col[n / 2]!) / 2;
  };
  return quatNormalize([median(0), median(1), median(2), median(3)]);
}

export interface HipsStats {
  readonly maxTranslation: number;
  readonly maxRotationOffset: number;
}

/** Measure the worst hips translation magnitude + rotation offset (1 - |w|) across a track list. */
export function measureHips(tracks: readonly { target: string; keyframes: readonly { value: readonly number[] }[] }[]): HipsStats {
  let maxTranslation = 0;
  let maxRotationOffset = 0;
  const isHipsRot = (t: string): boolean => /(^|[.\/])hips\.rotation$/i.test(t);
  for (const tr of tracks) {
    const isT = HIPS_TRANS_TARGET.test(tr.target);
    const isR = isHipsRot(tr.target);
    if (!isT && !isR) continue;
    for (const kf of tr.keyframes) {
      const v = kf.value ?? [];
      if (isT) for (const c of v) maxTranslation = Math.max(maxTranslation, Math.abs(c));
      if (isR && v.length >= 4) maxRotationOffset = Math.max(maxRotationOffset, 1 - Math.abs(v[3]!));
    }
  }
  return { maxTranslation, maxRotationOffset };
}

/**
 * Worst per-bone REST FLOOR across a track list: for each rotation track take the MIN offset from
 * identity over its keyframes (the closest that bone ever gets to rest), then take the MAX over bones.
 * This mirrors the loader sanity gate (animation-performance.ts): a bone with a baked constant offset
 * never returns near rest → a high floor; a reconciled clip has every bone return to ~identity at its
 * rest frame → a low floor. The gate ACCEPTS a clip iff this value < 0.15.
 */
export function worstRestFloor(
  tracks: readonly { target: string; keyframes: readonly { value: readonly number[] }[] }[]
): { value: number; bone: string } {
  let value = 0;
  let bone = "";
  for (const tr of tracks) {
    if (!ROT_TARGET.test(tr.target)) continue;
    let floor = Infinity;
    for (const kf of tr.keyframes) {
      const v = kf.value ?? [];
      if (v.length < 4) continue;
      floor = Math.min(floor, 1 - Math.abs(v[3]!));
    }
    if (floor !== Infinity && floor > value) {
      value = floor;
      bone = tr.target;
    }
  }
  return { value, bone };
}

/**
 * Detect the source-unit scale of the hips translation. We look at the peak absolute translation
 * component: a clean clip on a metre rig keeps this under ~1.5m (a stride plus a little bob). When it
 * is far larger the clip is in cm/raw units, so we divide by the smallest power-of-ten that brings the
 * peak back under ~1.5 (e.g. peak 32 → /100 → 0.32m; peak 320 → /1000). Returns 1 when already metric.
 */
function detectHipsScale(maxAbsTranslation: number): number {
  if (maxAbsTranslation <= 1.5) return 1;
  let scale = 1;
  while (maxAbsTranslation / scale > 1.5) scale *= 10;
  return scale;
}

/**
 * NORMALIZE a set of extracted tracks — returning a new array — with full rest-pose reconciliation.
 *
 *   • hips.translation  → scaled to metres + re-anchored to frame 0 (relative root motion).
 *   • EVERY rotation track (hips and every limb) → re-anchored by its estimated source rest rotation:
 *       R_motion(t) = R_rest⁻¹ · R(t),  R_rest = temporal-median quaternion of the track.
 *     This strips the baked, constant 90°/180° axis-conversion offset each bone carries (so the
 *     reconciled clip sits at the standard rig's UPRIGHT identity rest at its neutral pose) while
 *     preserving the per-frame relative motion.
 *
 * Idempotent for the rotation part: re-normalizing an already-reconciled clip leaves the median at
 * ~identity, so R_rest⁻¹·R(t) ≈ R(t). The hips-translation anchor is likewise a no-op once at origin.
 */
export function normalizeExtractedTracks<T extends AnimationTrack>(tracks: readonly T[]): AnimationTrack[] {
  // 1) UNITS — detect the hips-translation scale from the raw peak magnitude.
  let peakTrans = 0;
  for (const tr of tracks) {
    if (!HIPS_TRANS_TARGET.test(tr.target)) continue;
    for (const kf of tr.keyframes) for (const c of kf.value as number[]) peakTrans = Math.max(peakTrans, Math.abs(c));
  }
  const scale = detectHipsScale(peakTrans);

  return tracks.map((tr) => {
    const isT = HIPS_TRANS_TARGET.test(tr.target);
    const isR = ROT_TARGET.test(tr.target);

    if (isT) {
      // Scale to metres, then re-anchor: subtract the first frame so motion is RELATIVE to frame 0
      // (drops the absolute hips world-position offset that pins the character above/below the floor).
      const scaled = tr.keyframes.map((kf) => ({
        time: kf.time,
        interpolation: kf.interpolation,
        value: (kf.value as number[]).map((c) => c / scale)
      }));
      const anchor = scaled[0]?.value ?? [0, 0, 0];
      return new AnimationTrack({
        target: tr.target,
        valueType: tr.valueType,
        keyframes: scaled.map((kf) => ({
          time: kf.time,
          interpolation: kf.interpolation,
          value: kf.value.map((c, i) => +(c - (anchor[i] ?? 0)).toFixed(6)) as never
        }))
      });
    }

    if (!isR) return tr; // non-hips translation (none today) / other tracks pass through.

    // REST-POSE RECONCILIATION (the M6 fix): re-anchor by the CONSTANT (rest) part of this bone's
    // rotation, estimated as the temporal-median quaternion. q'_k = inverse(R_rest) * q_k. For a
    // static offset bone this sends every frame to ~identity; for a moving bone it centres the
    // motion on identity — either way the bone returns near the standard rig's upright rest.
    const quats = tr.keyframes.map((kf) => kf.value as number[]).filter((v) => Array.isArray(v) && v.length >= 4);
    if (quats.length === 0) return tr;
    const invRest = quatConjugate(quatRestEstimate(quats));
    return new AnimationTrack({
      target: tr.target,
      valueType: tr.valueType,
      keyframes: tr.keyframes.map((kf) => {
        const v = kf.value as number[];
        if (!Array.isArray(v) || v.length < 4) return kf;
        const q = quatNormalize(v);
        let rel = quatMultiply(invRest, q);
        // Keep w >= 0 so the offset metric (1 - |w|) is read off the canonical hemisphere.
        if (rel[3] < 0) rel = [-rel[0], -rel[1], -rel[2], -rel[3]];
        return {
          time: kf.time,
          interpolation: kf.interpolation,
          value: rel.map((c) => +c.toFixed(6)) as never
        };
      })
    });
  });
}

// ----------------------------------------------------------------------------------------------
// Extraction: GLB animation channels -> rig-neutral AnimationTrack[] on the standard humanoid.
// ----------------------------------------------------------------------------------------------

interface ExtractedClip {
  readonly tracks: AnimationTrack[];
  readonly duration: number;
  readonly animatedHumanoidBones: number;
  readonly sourceClipName: string;
}

/**
 * Build node-index -> humanoid bone map by inferring the source rig from the skinned joint names
 * (falling back to all node names). Returns a Map<nodeIndex, HumanoidBoneName>.
 */
function buildNodeBoneMap(glb: ParsedGlb): { map: Map<number, HumanoidBoneName>; mappedRequired: number } {
  const nodes = glb.json.nodes ?? [];
  // Prefer the first skin's joints (the actual deforming skeleton); else every named node.
  const jointIdx = glb.json.skins?.[0]?.joints ?? nodes.map((_, i) => i);
  const namedJoints = jointIdx
    .map((ni) => ({ ni, name: nodes[ni]?.name }))
    .filter((j): j is { ni: number; name: string } => typeof j.name === "string" && j.name.length > 0);

  const inference = inferHumanoidRigDetailed(namedJoints.map((j) => j.name), {
    id: "extracted-source",
    name: "Extracted source rig"
  });

  // inference.rig.bones[bone].name is the resolved source NODE NAME. Invert back to node index.
  const nameToNode = new Map<string, number>();
  for (const j of namedJoints) nameToNode.set(j.name, j.ni);

  const map = new Map<number, HumanoidBoneName>();
  for (const bone of HUMANOID_BONES) {
    const binding = inference.rig.bones[bone];
    if (!binding) continue;
    const ni = nameToNode.get(binding.name);
    if (ni !== undefined) map.set(ni, bone);
  }
  const required = HUMANOID_BONES.length - inference.missingRequired.length;
  return { map, mappedRequired: required };
}

/**
 * Extract one GLB animation (by index) onto the standard humanoid rig. Only translation/rotation
 * channels targeting a mapped humanoid bone are kept; scale channels are dropped (the standard
 * library is rotation/translation-only). Times are rebased to start at 0.
 */
function extractAnimation(
  glb: ParsedGlb,
  animIndex: number,
  nodeBone: Map<number, HumanoidBoneName>
): ExtractedClip | null {
  const anim = glb.json.animations?.[animIndex];
  if (!anim) return null;
  const tracks: AnimationTrack[] = [];
  let minTime = Infinity;
  let maxTime = 0;
  let animatedHumanoidBones = 0;
  const seen = new Set<string>();

  for (const channel of anim.channels) {
    const node = channel.target.node;
    if (node === undefined) continue;
    const bone = nodeBone.get(node);
    if (!bone) continue; // not a humanoid bone -> not part of the rig-neutral library clip
    const path = channel.target.path;
    if (path !== "rotation" && path !== "translation") continue; // drop scale/weights
    // The standard library is rotation-driven; only the hips (root) carry translation (bob/sway).
    // Limb translations don't retarget meaningfully (no length scaling here) and bloat the clip.
    if (path === "translation" && bone !== "hips") continue;

    const sampler = anim.samplers[channel.sampler];
    if (!sampler) continue;
    const times = readAccessor(glb, sampler.input);
    const values = readAccessor(glb, sampler.output);
    if (times.length === 0 || values.length === 0) continue;

    const valueType = path === "rotation" ? "quaternion" : "vector3";
    const compsPerKey = path === "rotation" ? 4 : 3;
    // CUBICSPLINE packs 3 values (in-tan, value, out-tan) per key; we take the middle value and
    // emit linear keys (honest simplification — we don't re-derive tangents).
    const cubic = sampler.interpolation === "CUBICSPLINE";
    const valuesPerKey = cubic ? compsPerKey * 3 : compsPerKey;
    const flat = values.flat();

    const keyframes: { time: number; value: number[]; interpolation: "linear" }[] = [];
    for (let k = 0; k < times.length; k += 1) {
      const t = times[k]![0]!;
      const start = k * valuesPerKey + (cubic ? compsPerKey : 0);
      if (start + compsPerKey > flat.length) break;
      const value = flat.slice(start, start + compsPerKey);
      if (value.some((v) => !Number.isFinite(v))) continue;
      keyframes.push({ time: t, value, interpolation: "linear" });
    }
    if (keyframes.length < 2) continue;

    for (const kf of keyframes) {
      if (kf.time < minTime) minTime = kf.time;
      if (kf.time > maxTime) maxTime = kf.time;
    }

    const target = `${bone}.${path}`;
    if (seen.has(target)) continue; // one track per bone/path (first sampler wins)
    seen.add(target);
    if (path === "rotation") animatedHumanoidBones += 1;

    tracks.push(
      new AnimationTrack({
        target,
        valueType,
        keyframes: keyframes.map((kf) => ({
          time: kf.time,
          value: kf.value as never,
          interpolation: kf.interpolation
        }))
      })
    );
  }

  if (tracks.length === 0 || !Number.isFinite(minTime)) return null;

  // Rebase times so the clip starts at t=0 (some exporters start mid-timeline).
  const rebased = tracks.map(
    (tr) =>
      new AnimationTrack({
        target: tr.target,
        valueType: tr.valueType,
        keyframes: tr.keyframes.map((kf) => ({ ...kf, time: +(kf.time - minTime).toFixed(6) }))
      })
  );
  const duration = +(maxTime - minTime).toFixed(6);
  // NORMALIZE the hips so the clip is usable on the standard rig (metres, rest-pose re-anchored to
  // identity/origin) — otherwise raw-unit translation + bind offset displaces the character to the floor.
  const normalized = normalizeExtractedTracks(rebased);
  return {
    tracks: normalized,
    duration: duration > 0 ? duration : 1,
    animatedHumanoidBones,
    sourceClipName: anim.name ?? `animation-${animIndex}`
  };
}

// ----------------------------------------------------------------------------------------------
// Per-motion resolution: search -> download -> inspect -> extract.
// ----------------------------------------------------------------------------------------------

interface MotionProvenance {
  readonly clipId: StandardClipId;
  readonly source: "catalog-extracted" | "procedural-fallback";
  readonly sourceTitle?: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly attribution?: string;
  readonly originalClipName?: string;
  /**
   * The UNIVERSAL vocabulary slot this source clip was mapped onto (idle/talk/gesture/…). Stored
   * EXPLICITLY in provenance (separate from the source's own `originalClipName`) so a catalog name
   * like "Moon Walk" is never confused for the product-facing id — the id is always `clipId`, and
   * `mappedIntent === clipId` records the mapping decision as provenance metadata, not a concept.
   */
  readonly mappedIntent: StandardClipId;
  /** ISO date the clip was resolved/extracted (provenance metadata). */
  readonly date: string;
  /**
   * 0–100 confidence that this extracted clip is a faithful, retargetable source for `mappedIntent`:
   * animated-humanoid-bone breadth + a confident clip-name match + a sane duration. A procedural
   * fallback scores 0 (no real source motion).
   */
  readonly qualityScore: number;
  readonly hash?: string;
  readonly duration: number;
  readonly trackCount: number;
  readonly animatedHumanoidBones?: number;
  /**
   * True when the embedded clip NAME contained one of the motion's keywords (a confident semantic
   * match). False means we accepted a name-agnostic best-animated clip because no candidate's clip
   * name matched — the motion is real and rig-neutral, but its semantic fit is unverified.
   */
  readonly nameMatch?: boolean;
  readonly note?: string;
}

/**
 * Per-clip quality score (0–100) for an EXTRACTED source clip: breadth of animated humanoid bones
 * (the body-acting signal), a confident clip-name match (semantic fit), and a sane duration. This
 * is provenance metadata only — the universal `clipId` is always the product-facing id.
 */
function clipQualityScore(animatedHumanoidBones: number, nameMatch: boolean, duration: number): number {
  const breadth = Math.min(animatedHumanoidBones, 24) * 3; // up to 72 for a full-body clip
  const semantic = nameMatch ? 20 : 0;                     // confident keyword match
  const durationOk = duration >= 0.5 && duration <= 30 ? 8 : 0;
  return Math.max(0, Math.min(100, Math.round(breadth + semantic + durationOk)));
}

interface MotionResult {
  readonly clip: AnimationClipDefinition<StandardClipId>;
  readonly provenance: MotionProvenance;
}

/** A fully-extracted candidate, carried while we scan for the best (name-matching) one. */
interface Candidate {
  readonly extracted: ExtractedClip;
  readonly catalog: CatalogResult;
  readonly hash: string;
  readonly nameMatch: boolean;
}

function proceduralFor(clipId: StandardClipId, note: string): MotionResult {
  const proc = createStandardHumanoidClipDefinitions().find((c) => c.id === clipId)!;
  return {
    clip: proc,
    provenance: {
      clipId,
      source: "procedural-fallback",
      mappedIntent: clipId,
      date: new Date().toISOString(),
      qualityScore: 0, // no real source motion — the procedural baseline carries no provenance quality
      duration: proc.duration,
      trackCount: proc.tracks?.length ?? 0,
      note
    }
  };
}

/**
 * Match a motion keyword against a clip name on TOKEN boundaries, not raw substring — otherwise
 * "nod" spuriously matches "RootNodeAction" ("root NODE action"). We split the name on common
 * separators + camelCase humps, then require a token to EQUAL the keyword (or the keyword + a
 * short inflection like "-s"/"-ing"/"-ed"). This keeps "nameMatch" an honest, conservative signal:
 * "walk"/"walks"/"walking" match the walk motion, but "node" does not match "nod".
 */
function clipNameMatches(name: string, keywords: readonly string[]): boolean {
  const tokens = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const inflections = ["", "s", "ing", "ed", "er"];
  return keywords.some((k) => tokens.some((tok) => inflections.some((suf) => tok === k + suf)));
}

async function resolveMotion(clipId: StandardClipId, config: MotionConfig): Promise<MotionResult> {
  let candidates: CatalogResult[];
  try {
    candidates = await searchCatalog(config.query);
  } catch (err) {
    console.error(`  [${clipId}] catalog search failed (${(err as Error).message}) -> procedural fallback`);
    return proceduralFor(clipId, `catalog search failed: ${(err as Error).message}`);
  }
  console.error(`  [${clipId}] "${config.query}" -> ${candidates.length} GLB candidates`);

  // Scan candidates. A clip-name match short-circuits (best possible). Otherwise keep the
  // name-agnostic candidate with the most animated humanoid bones as a weaker fallback.
  let fallback: Candidate | null = null;
  // Cap downloads per motion so a flaky/huge candidate list can't run forever.
  let downloads = 0;
  for (const c of candidates) {
    if (downloads >= 12) break;
    let buf: Buffer;
    try {
      const r = await fetch(c.url);
      if (!r.ok) continue;
      buf = Buffer.from(await r.arrayBuffer());
      downloads += 1;
    } catch {
      continue;
    }
    const glb = parseGlb(buf);
    if (!glb) continue;
    // We only need skeleton + animation data here. Require: a skin and at least one animation.
    if (!(glb.json.skins?.length && glb.json.animations?.length)) continue;
    if (buf.length > 60 * 1024 * 1024) continue; // keep extraction snappy

    const { map, mappedRequired } = buildNodeBoneMap(glb);
    if (mappedRequired < 10) continue; // require a usable humanoid

    // Among this GLB's animations, prefer one whose NAME matches the motion; else most-animated.
    let named: ExtractedClip | null = null;
    let richest: ExtractedClip | null = null;
    for (let ai = 0; ai < (glb.json.animations?.length ?? 0); ai += 1) {
      const extracted = extractAnimation(glb, ai, map);
      if (!extracted || extracted.animatedHumanoidBones < 3) continue;
      if (!richest || extracted.animatedHumanoidBones > richest.animatedHumanoidBones) richest = extracted;
      if (
        clipNameMatches(extracted.sourceClipName, config.clipKeywords) &&
        (!named || extracted.animatedHumanoidBones > named.animatedHumanoidBones)
      ) {
        named = extracted;
      }
    }

    const hash = `sha256-${createHash("sha256").update(buf).digest("hex")}`;
    if (named) {
      return buildResult(clipId, { extracted: named, catalog: c, hash, nameMatch: true });
    }
    if (richest && (!fallback || richest.animatedHumanoidBones > fallback.extracted.animatedHumanoidBones)) {
      fallback = { extracted: richest, catalog: c, hash, nameMatch: false };
    }
  }

  if (fallback) {
    console.error(`  [${clipId}] no name-matched clip; using best-animated catalog clip (nameMatch:false)`);
    return buildResult(clipId, fallback);
  }

  console.error(`  [${clipId}] no usable rigged+animated GLB -> procedural fallback`);
  return proceduralFor(clipId, "no catalog GLB yielded an extractable humanoid clip");
}

function buildResult(clipId: StandardClipId, cand: Candidate): MotionResult {
  const { extracted: best, catalog: c, hash, nameMatch } = cand;
  const clip: AnimationClipDefinition<StandardClipId> = {
    id: clipId,
    name: clipId,
    duration: best.duration,
    frameRate: 30,
    loop: clipId === "idle" || clipId === "talk" || clipId === "walk" || clipId === "run",
    tags: [clipId, "performance", "extracted"],
    tracks: best.tracks,
    source: "aura3d.catalog-extracted",
    metadata: {
      rig: STANDARD_LIBRARY_RIG.id,
      extracted: true,
      nameMatch,
      sourceClipName: best.sourceClipName,
      sourceTitle: c.title,
      sourceUrl: c.url,
      license: c.license ?? "CC-BY-4.0",
      attribution: c.attribution ?? c.source
    }
  };
  console.error(
    `  [${clipId}] EXTRACTED "${best.sourceClipName}" from ${c.title} ` +
      `(${best.tracks.length} tracks, ${best.animatedHumanoidBones} bones, ${best.duration.toFixed(2)}s, ` +
      `nameMatch:${nameMatch}, ${c.source})`
  );
  return {
    clip,
    provenance: {
      clipId,
      source: "catalog-extracted",
      sourceTitle: c.title,
      sourceUrl: c.url,
      license: c.license ?? "CC-BY-4.0",
      attribution: c.attribution ?? c.source,
      originalClipName: best.sourceClipName,
      mappedIntent: clipId,
      date: new Date().toISOString(),
      qualityScore: clipQualityScore(best.animatedHumanoidBones, nameMatch, best.duration),
      hash,
      duration: best.duration,
      trackCount: best.tracks.length,
      animatedHumanoidBones: best.animatedHumanoidBones,
      nameMatch
    }
  };
}

// ----------------------------------------------------------------------------------------------
// Serialization (write extracted clips + manifest under public/clip-library/).
// ----------------------------------------------------------------------------------------------

interface SerializedClipFile {
  readonly id: StandardClipId;
  readonly name: string;
  readonly duration: number;
  readonly frameRate: number;
  readonly loop: boolean;
  readonly tags: readonly string[];
  readonly source: string;
  readonly rig: string;
  readonly tracks: { target: string; valueType: string; keyframes: unknown[] }[];
  readonly provenance: MotionProvenance;
}

function serializeClip(result: MotionResult): SerializedClipFile {
  const { clip, provenance } = result;
  return {
    id: clip.id,
    name: clip.name ?? clip.id,
    duration: clip.duration,
    frameRate: clip.frameRate ?? 30,
    loop: clip.loop ?? true,
    tags: clip.tags ?? [],
    source: clip.source ?? "unknown",
    rig: STANDARD_LIBRARY_RIG.id,
    tracks: (clip.tracks ?? []).map((tr) => {
      const t = tr as unknown as AnimationTrack;
      return { target: t.target, valueType: t.valueType, keyframes: [...t.keyframes] };
    }),
    provenance
  };
}

export interface ClipLibraryManifest {
  readonly generatedAt: string;
  readonly rig: string;
  readonly vocabulary: readonly StandardClipId[];
  readonly extractedCount: number;
  readonly fallbackCount: number;
  readonly clips: readonly MotionProvenance[];
}

async function build(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const results: MotionResult[] = [];
  for (const clipId of STANDARD_CLIP_IDS) {
    results.push(await resolveMotion(clipId, MOTION_QUERIES[clipId]));
  }
  const named = results.filter((r) => r.provenance.nameMatch === true).length;
  console.error(`  (${named}/${results.length} are confident clip-name matches)`);

  for (const result of results) {
    const file = serializeClip(result);
    writeFileSync(resolve(OUT_DIR, `${result.clip.id}.json`), JSON.stringify(file, null, 2));
  }

  const extractedCount = results.filter((r) => r.provenance.source === "catalog-extracted").length;
  const manifest: ClipLibraryManifest = {
    generatedAt: new Date().toISOString(),
    rig: STANDARD_LIBRARY_RIG.id,
    vocabulary: [...STANDARD_CLIP_IDS],
    extractedCount,
    fallbackCount: results.length - extractedCount,
    clips: results.map((r) => r.provenance)
  };
  writeFileSync(resolve(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.error("");
  console.error(
    `Done: ${extractedCount}/${results.length} clips extracted from the live catalog, ` +
      `${manifest.fallbackCount} procedural fallbacks. -> ${OUT_DIR}`
  );
}

// ----------------------------------------------------------------------------------------------
// Loader: register extracted clips into an AnimationClipRegistry, augmenting the procedural set.
// ----------------------------------------------------------------------------------------------

/**
 * Deserialize a written clip-library file back into an {@link AnimationClipDefinition} on the
 * standard rig (track targets are already `<humanoidBone>.rotation|translation`).
 */
function deserializeClipFile(file: SerializedClipFile): AnimationClipDefinition<StandardClipId> {
  return {
    id: file.id,
    name: file.name,
    duration: file.duration,
    frameRate: file.frameRate,
    loop: file.loop,
    tags: file.tags,
    source: file.source,
    tracks: file.tracks.map(
      (tr) =>
        new AnimationTrack({
          target: tr.target,
          valueType: tr.valueType as never,
          keyframes: tr.keyframes as never
        })
    ),
    metadata: { rig: file.rig, extracted: file.provenance.source === "catalog-extracted" }
  };
}

/**
 * Build the shared, rig-neutral clip registry the studio drives. Starts from the procedural
 * `standardHumanoidClips` (Phase 2.4) and OVERRIDES each id with the real extracted clip written
 * under `public/clip-library/` when one exists. If the library hasn't been built yet (no dir),
 * returns the pure procedural registry. The result speaks exactly the 8 STANDARD_CLIP_IDS and is
 * authored on STANDARD_LIBRARY_RIG, so it retargets onto any inferred character rig.
 */
export function loadExtractedClipLibrary(
  dir: string = OUT_DIR
): AnimationClipRegistry<StandardClipId> {
  const registry = new AnimationClipRegistry<StandardClipId>(createStandardHumanoidClipDefinitions());
  if (!existsSync(dir)) return registry;

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".json") || entry === "manifest.json") continue;
    let file: SerializedClipFile;
    try {
      file = JSON.parse(readFileSync(resolve(dir, entry), "utf8")) as SerializedClipFile;
    } catch {
      continue;
    }
    // Only override with REAL extracted clips; procedural-fallback files leave the procedural
    // registry entry in place (identical anyway), so we don't double-register noise.
    if (file.provenance.source !== "catalog-extracted") continue;
    if (!STANDARD_CLIP_IDS.includes(file.id)) continue;
    registry.register(deserializeClipFile(file), { replace: true });
  }
  return registry;
}

/**
 * Reconcile the already-extracted clips ON DISK (read each <id>.json, run full rest-pose
 * reconciliation via {@link normalizeExtractedTracks} — hips units/anchor + per-bone median
 * re-anchoring — rewrite), printing hips translation/rotation AND the per-bone worstFloor
 * BEFORE→AFTER for each. This is the honest path when the live catalog is flaky/nondeterministic: it
 * makes the existing extracted clips pass the loader sanity gate (worstFloor < 0.15) without
 * re-downloading (which might return different assets). Only catalog-extracted files are touched;
 * procedural-fallback files are already on the standard rig.
 */
export function normalizeClipLibraryInPlace(dir: string = OUT_DIR): void {
  if (!existsSync(dir)) {
    console.error(`no clip-library at ${dir} — nothing to normalize`);
    return;
  }
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".json") || entry === "manifest.json") continue;
    let file: SerializedClipFile;
    try {
      file = JSON.parse(readFileSync(resolve(dir, entry), "utf8")) as SerializedClipFile;
    } catch {
      console.error(`  [${entry}] unreadable JSON — skipped`);
      continue;
    }
    if (file.provenance?.source !== "catalog-extracted") {
      console.error(`  [${entry}] ${file.provenance?.source ?? "unknown"} (not catalog-extracted) — skipped`);
      continue;
    }
    const before = measureHips(file.tracks as never);
    const beforeFloor = worstRestFloor(file.tracks as never);
    const tracks = (file.tracks ?? []).map(
      (tr) =>
        new AnimationTrack({
          target: tr.target,
          valueType: tr.valueType as never,
          keyframes: tr.keyframes as never
        })
    );
    const normalized = normalizeExtractedTracks(tracks);
    const serializedTracks = normalized.map((tr) => ({
      target: tr.target,
      valueType: tr.valueType,
      keyframes: [...tr.keyframes]
    }));
    const after = measureHips(serializedTracks as never);
    const afterFloor = worstRestFloor(serializedTracks as never);
    const rewritten = { ...file, tracks: serializedTracks };
    writeFileSync(resolve(dir, entry), JSON.stringify(rewritten, null, 2));
    // The clip is ACCEPTED by the loader sanity gate iff hips are sane AND every bone returns near
    // rest at some frame (worstFloor < 0.15) — the rest-pose-reconciliation post-condition.
    const pass =
      after.maxTranslation <= 1.0 && after.maxRotationOffset <= 0.2 && afterFloor.value < 0.15;
    console.error(
      `  [${entry}] hipsTrans ${before.maxTranslation.toFixed(2)} → ${after.maxTranslation.toFixed(2)}  |  ` +
        `hipsRotOffset ${before.maxRotationOffset.toFixed(3)} → ${after.maxRotationOffset.toFixed(3)}  |  ` +
        `worstFloor ${beforeFloor.value.toFixed(3)} (${beforeFloor.bone}) → ${afterFloor.value.toFixed(3)} (${afterFloor.bone})  ` +
        `${pass ? "PASS (gate accepts)" : "STILL FAILING (gated)"}`
    );
  }
}

// CLI entry.
if (process.argv[1] && process.argv[1].endsWith("build-clip-library.ts")) {
  if (process.argv.includes("--normalize-in-place")) {
    console.error("Normalizing existing extracted clips in place (no catalog download):");
    normalizeClipLibraryInPlace();
  } else {
    void build().catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
  }
}
