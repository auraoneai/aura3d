/**
 * asset-motion-probe.ts — the "do the embedded clips actually MOVE anything?" gate.
 *
 * Clip COUNT lies as badly as texture metadata: a catalog character can advertise five
 * animations that are all a 2cm idle sway, a jaw-only lip-flap, or a root-bone slide with a
 * frozen body. Those are useless for acting. This probe reads each embedded GLB animation's
 * sampler data straight off the BIN chunk (no synthesis), measures the real motion AMPLITUDE
 * per channel, works out WHICH humanoid bones each clip drives, scores the clip, and maps the
 * useful ones onto the standard performance vocabulary (idle/talk/gesture/point/nod/walk/run/
 * react). It then decides whether the character carries a "minimum viable acting pack" or must
 * fall back to the shared retargeted clip library.
 *
 * Honest by construction: a clip that only animates root + mouth + a tiny idle is REJECTED, and
 * a name-agnostic vocabulary mapping (no keyword in the clip name) is recorded as low confidence.
 */

import {
  HUMANOID_BONES,
  STANDARD_CLIP_IDS,
  inferHumanoidRigDetailed,
  type HumanoidBoneName,
  type StandardClipId
} from "@aura3d/animation";

// ----------------------------------------------------------------------------------------------
// GLB parsing — JSON chunk + BIN chunk, enough to read animation sampler accessors.
// (Self-contained: this probe must run on a raw downloaded Buffer before the GLB is even saved.)
// ----------------------------------------------------------------------------------------------

interface GltfAccessor { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }
interface GltfBufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface GltfChannel { sampler: number; target: { node?: number; path: string } }
interface GltfSampler { input: number; output: number; interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE" }
interface GltfAnimation { name?: string; channels: GltfChannel[]; samplers: GltfSampler[] }
interface GltfJson {
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  nodes?: { name?: string; mesh?: number }[];
  skins?: { joints?: number[] }[];
  meshes?: { primitives?: { targets?: unknown[] }[] }[];
  animations?: GltfAnimation[];
}
interface ParsedGlb { readonly json: GltfJson; readonly bin: Buffer }

function parseGlb(buf: Buffer): ParsedGlb | null {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return null; // "glTF"
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 20;
  let json: GltfJson;
  try { json = JSON.parse(buf.slice(jsonStart, jsonStart + jsonLen).toString("utf8")) as GltfJson; }
  catch { return null; }
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

/** Read a FLOAT accessor as tuples (one per element). Non-float / truncated → honest empty. */
function readAccessor(glb: ParsedGlb, index: number): number[][] {
  const acc = glb.json.accessors?.[index];
  if (!acc || acc.bufferView === undefined || acc.componentType !== 5126) return [];
  const view = glb.json.bufferViews?.[acc.bufferView];
  if (!view) return [];
  const comps = TYPE_COMPONENTS[acc.type] ?? 1;
  const elemBytes = comps * (COMPONENT_BYTES[acc.componentType] ?? 4);
  const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : elemBytes;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out: number[][] = [];
  for (let i = 0; i < acc.count; i += 1) {
    const elemStart = base + i * stride;
    const tuple: number[] = [];
    for (let c = 0; c < comps; c += 1) {
      const off = elemStart + c * 4;
      if (off + 4 > glb.bin.length) return out; // truncated — stop honestly
      tuple.push(glb.bin.readFloatLE(off));
    }
    out.push(tuple);
  }
  return out;
}

// ----------------------------------------------------------------------------------------------
// Amplitude measurement.
// ----------------------------------------------------------------------------------------------

/** Angle (radians) between two unit quaternions [x,y,z,w]. Clamped + finite-safe. */
function quatAngle(a: number[], b: number[]): number {
  const dot = Math.min(1, Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!));
  if (!Number.isFinite(dot)) return 0;
  return 2 * Math.acos(dot);
}

/** Max pairwise angular spread (radians) across a list of quaternion keyframes. */
function rotationAmplitude(keys: number[][]): number {
  if (keys.length < 2) return 0;
  // Spread from the first key is a faithful, cheap proxy for the clip's rotational range.
  let max = 0;
  const ref = keys[0]!;
  for (let i = 1; i < keys.length; i += 1) max = Math.max(max, quatAngle(ref, keys[i]!));
  // Also check spread from the mid key (catches clips that swing symmetrically around rest).
  const mid = keys[Math.floor(keys.length / 2)]!;
  for (let i = 0; i < keys.length; i += 1) max = Math.max(max, quatAngle(mid, keys[i]!));
  return max;
}

/** Max per-axis translation span across vector3 keyframes (world/local units). */
function translationAmplitude(keys: number[][]): number {
  if (keys.length < 2) return 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const k of keys) for (let a = 0; a < 3; a += 1) { min[a] = Math.min(min[a]!, k[a]!); max[a] = Math.max(max[a]!, k[a]!); }
  return Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
}

// ----------------------------------------------------------------------------------------------
// Node classification: which humanoid bone (if any) does a node drive; is it root/mouth?
// ----------------------------------------------------------------------------------------------

const MOUTH_FACE_HINTS = ["mouth", "jaw", "teeth", "tongue", "lip", "face", "eye", "brow", "blink", "cheek"];
const ROOT_HINTS = ["root", "armature", "scene", "rootnode", "rignode"];

interface NodeRoles {
  /** nodeIndex → humanoid bone it maps to (via inference), if any. */
  readonly boneOf: Map<number, HumanoidBoneName>;
  /** nodeIndex → true when the node name reads as a mouth/face/jaw bone. */
  readonly mouthOf: Set<number>;
  /** nodeIndex → true when the node name reads as a pure root/armature carrier. */
  readonly rootOf: Set<number>;
  /** Count of mapped REQUIRED humanoid bones present in the rig. */
  readonly mappedRequired: number;
  /** Total mapped humanoid bones present in the rig. */
  readonly mappedTotal: number;
}

function classifyNodes(glb: ParsedGlb): NodeRoles {
  const nodes = glb.json.nodes ?? [];
  const jointIdx = glb.json.skins?.[0]?.joints ?? nodes.map((_, i) => i);
  const named = jointIdx
    .map((ni) => ({ ni, name: nodes[ni]?.name }))
    .filter((j): j is { ni: number; name: string } => typeof j.name === "string" && j.name.length > 0);

  const inference = inferHumanoidRigDetailed(named.map((j) => j.name), { id: "probe-source", name: "Probe source rig" });
  const nameToNode = new Map<string, number>();
  for (const j of named) nameToNode.set(j.name, j.ni);

  const boneOf = new Map<number, HumanoidBoneName>();
  for (const bone of HUMANOID_BONES) {
    const binding = inference.rig.bones[bone];
    if (!binding) continue;
    const ni = nameToNode.get(binding.name);
    if (ni !== undefined) boneOf.set(ni, bone);
  }

  const mouthOf = new Set<number>();
  const rootOf = new Set<number>();
  for (let ni = 0; ni < nodes.length; ni += 1) {
    if (boneOf.has(ni)) continue; // a real body bone is never reclassified as mouth/root
    const name = String(nodes[ni]?.name ?? "").toLowerCase();
    if (!name) continue;
    if (MOUTH_FACE_HINTS.some((h) => name.includes(h))) mouthOf.add(ni);
    else if (ROOT_HINTS.some((h) => name.includes(h))) rootOf.add(ni);
  }

  return {
    boneOf,
    mouthOf,
    rootOf,
    mappedRequired: HUMANOID_BONES.length - inference.missingRequired.length,
    mappedTotal: boneOf.size
  };
}

// ----------------------------------------------------------------------------------------------
// Per-clip scoring + vocabulary mapping.
// ----------------------------------------------------------------------------------------------

/** Bones that count as "body acting" (NOT root/hips-translation, NOT mouth/face). */
const BODY_ACTING_BONES = new Set<HumanoidBoneName>(
  HUMANOID_BONES.filter((b) => b !== "hips")
);
const ARM_BONES = new Set<HumanoidBoneName>([
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"
]);
const LEG_BONES = new Set<HumanoidBoneName>([
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot"
]);

/** Minimum rotation (radians, ~5.7°) for a channel to count as "this bone actually moves". */
const MIN_ROT_AMPLITUDE = 0.1;
/** Minimum root translation (units) for locomotion to count as real travel, not jitter. */
const MIN_ROOT_TRAVEL = 0.15;

/** Token-boundary keyword match (so "nod" doesn't match "RootNodeAction"). Mirrors build-clip-library. */
function clipNameMatches(name: string, keywords: readonly string[]): boolean {
  const tokens = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const inflections = ["", "s", "ing", "ed", "er"];
  return keywords.some((k) => tokens.some((tok) => inflections.some((suf) => tok === k + suf)));
}

const VOCAB_KEYWORDS: Readonly<Record<StandardClipId, readonly string[]>> = {
  idle: ["idle", "breathing", "stand", "breath"],
  talk: ["talk", "speak", "speaking", "talking", "dialogue", "conversation"],
  gesture: ["wave", "waving", "gesture", "greet", "hello", "clap"],
  point: ["point", "pointing", "aim", "indicate"],
  nod: ["nod", "nodding", "yes", "agree"],
  walk: ["walk", "walking", "stride"],
  run: ["run", "running", "sprint", "jog"],
  react: ["react", "reaction", "surprised", "flinch", "recoil", "hit", "damage", "dodge"]
};

export interface ClipMotionScore {
  /** Embedded clip name (or synthetic animation-N). */
  readonly name: string;
  /** Clip duration in seconds. */
  readonly duration: number;
  /** 0–100 usefulness: amplitude across real body bones, breadth of bones, locomotion. */
  readonly score: number;
  /** Largest body-bone rotation in the clip (radians). */
  readonly maxBodyRotation: number;
  /** Largest root/hips travel in the clip (units). */
  readonly rootTravel: number;
  /** Count of distinct body bones (excl. hips) the clip rotates beyond MIN_ROT_AMPLITUDE. */
  readonly movingBodyBones: number;
  /** Count of arm bones that actually move (gesture/talk signal). */
  readonly movingArmBones: number;
  /** Count of leg bones that actually move (locomotion signal). */
  readonly movingLegBones: number;
  /** True when the clip moves the mouth/jaw/face beyond MIN_ROT_AMPLITUDE. */
  readonly movesMouth: boolean;
  /** True when the clip drives meaningful body motion (passes the amplitude gate). */
  readonly useful: boolean;
  /** Reason the clip was rejected (when !useful). */
  readonly rejectReason?: string;
  /** Standard vocabulary slot this clip best fills, if any. */
  readonly mappedIntent?: StandardClipId;
  /** True when the name (token-matched) confirms the intent; false = inferred from motion only. */
  readonly intentConfident: boolean;
}

interface ClipAnalysis {
  readonly name: string;
  duration: number;
  maxBodyRotation: number;
  rootTravel: number;
  readonly movingBody: Set<HumanoidBoneName>;
  movesMouth: boolean;
  /** Total non-body channels (mouth/root/unmapped) that carry motion. */
  noiseChannels: number;
}

/** Analyse one GLB animation: amplitude per channel, bucketed by node role. */
function analyzeAnimation(glb: ParsedGlb, anim: GltfAnimation, roles: NodeRoles, idx: number): ClipAnalysis {
  const out: ClipAnalysis = {
    name: anim.name ?? `animation-${idx}`,
    duration: 0,
    maxBodyRotation: 0,
    rootTravel: 0,
    movingBody: new Set(),
    movesMouth: false,
    noiseChannels: 0
  };
  for (const ch of anim.channels) {
    const node = ch.target.node;
    if (node === undefined) continue;
    const path = ch.target.path;
    if (path !== "rotation" && path !== "translation" && path !== "weights") continue;
    const sampler = anim.samplers[ch.sampler];
    if (!sampler) continue;
    const times = readAccessor(glb, sampler.input);
    if (times.length) out.duration = Math.max(out.duration, times[times.length - 1]![0]!);
    const raw = readAccessor(glb, sampler.output);
    if (raw.length < 2) continue;
    // CUBICSPLINE packs 3 values per key (in-tan, value, out-tan); sample the middle value.
    const cubic = sampler.interpolation === "CUBICSPLINE";
    const comps = path === "rotation" ? 4 : path === "translation" ? 3 : (raw[0]?.length ?? 1);
    const flat = raw.flat();
    const keys: number[][] = [];
    const per = cubic ? comps * 3 : comps;
    for (let k = 0; k * per + (cubic ? comps : 0) + comps <= flat.length; k += 1) {
      keys.push(flat.slice(k * per + (cubic ? comps : 0), k * per + (cubic ? comps : 0) + comps));
    }
    if (keys.length < 2) continue;

    const bone = roles.boneOf.get(node);
    if (path === "rotation") {
      const amp = rotationAmplitude(keys);
      if (amp < MIN_ROT_AMPLITUDE) continue;
      if (bone && bone !== "hips") { out.movingBody.add(bone); out.maxBodyRotation = Math.max(out.maxBodyRotation, amp); }
      else if (roles.mouthOf.has(node)) out.movesMouth = true;
      else out.noiseChannels += 1; // root/unmapped rotation = idle noise
    } else if (path === "translation") {
      const amp = translationAmplitude(keys);
      // Translation only matters on the root/hips (locomotion); limb translation doesn't retarget.
      if ((bone === "hips" || roles.rootOf.has(node)) && amp >= MIN_ROOT_TRAVEL) out.rootTravel = Math.max(out.rootTravel, amp);
      else if (amp >= MIN_ROOT_TRAVEL) out.noiseChannels += 1;
    } else {
      // morph weights = mouth/blendshape; treat as mouth motion if it actually changes.
      const amp = translationAmplitude(keys.map((k) => [k[0] ?? 0, 0, 0]));
      if (amp > 0.05) out.movesMouth = true;
    }
  }
  return out;
}

/** Score + classify one analysed clip into the standard vocabulary. */
function scoreClip(a: ClipAnalysis): ClipMotionScore {
  const movingBodyBones = a.movingBody.size;
  const movingArmBones = [...a.movingBody].filter((b) => ARM_BONES.has(b)).length;
  const movingLegBones = [...a.movingBody].filter((b) => LEG_BONES.has(b)).length;
  const hasLocomotion = a.rootTravel >= MIN_ROOT_TRAVEL && movingLegBones >= 2;

  // Usefulness gate: a clip that only animates root/mouth/tiny-idle is NOT acting motion.
  let useful = true;
  let rejectReason: string | undefined;
  if (movingBodyBones === 0 && !hasLocomotion) {
    useful = false;
    rejectReason = a.movesMouth
      ? "mouth/face only — no body bones move"
      : a.noiseChannels > 0
        ? "root/idle noise only — no body bones move beyond threshold"
        : "no bone moves beyond amplitude threshold";
  } else if (movingBodyBones === 1 && a.maxBodyRotation < 0.25 && !hasLocomotion) {
    useful = false;
    rejectReason = "tiny single-bone idle — below acting amplitude";
  }

  // Score (0–100): breadth of body bones + amplitude + locomotion bonus.
  const score = useful
    ? Math.min(100, Math.round(
        movingBodyBones * 8 +
        Math.min(a.maxBodyRotation, Math.PI) * 12 +
        movingArmBones * 4 +
        (hasLocomotion ? 25 : 0)
      ))
    : 0;

  // Vocabulary mapping: name keyword wins (confident); else infer from the motion shape.
  let mappedIntent: StandardClipId | undefined;
  let intentConfident = false;
  for (const id of STANDARD_CLIP_IDS) {
    if (clipNameMatches(a.name, VOCAB_KEYWORDS[id])) { mappedIntent = id; intentConfident = true; break; }
  }
  if (!mappedIntent && useful) {
    if (hasLocomotion) mappedIntent = a.rootTravel > 1.2 ? "run" : "walk";
    else if (movingArmBones >= 2 && a.maxBodyRotation >= 0.6) mappedIntent = "gesture";
    else if (movingArmBones >= 1) mappedIntent = "talk";
    else if (a.movingBody.has("head") && movingBodyBones <= 2) mappedIntent = "nod";
    else if (a.maxBodyRotation >= 1.0) mappedIntent = "react";
    else mappedIntent = "idle";
  }

  return {
    name: a.name,
    duration: +a.duration.toFixed(2),
    score,
    maxBodyRotation: +a.maxBodyRotation.toFixed(3),
    rootTravel: +a.rootTravel.toFixed(3),
    movingBodyBones,
    movingArmBones,
    movingLegBones,
    movesMouth: a.movesMouth,
    useful,
    rejectReason,
    mappedIntent,
    intentConfident
  };
}

// ----------------------------------------------------------------------------------------------
// Public API.
// ----------------------------------------------------------------------------------------------

/** The four roles a usable acting character must be able to perform from its OWN clips. */
export const MINIMUM_ACTING_PACK: readonly StandardClipId[] = ["idle", "talk", "walk", "react"];

export interface MotionProbeReport {
  /** Per-clip scores, useful first. */
  readonly clips: readonly ClipMotionScore[];
  /** Useful clips count (passed the amplitude gate). */
  readonly usefulClips: number;
  /** Vocabulary slots the embedded clips cover (deduped). */
  readonly coveredIntents: readonly StandardClipId[];
  /** True when the embedded clips alone cover the minimum viable acting pack. */
  readonly hasViableActingPack: boolean;
  /** Acting-pack slots NOT covered by embedded clips (filled by the shared library). */
  readonly missingActingSlots: readonly StandardClipId[];
  /** True when motion must come from the shared retargeted library, not the GLB. */
  readonly libraryFallback: boolean;
  /** True when at least one useful clip drives real body motion (the motionPass gate). */
  readonly motionPass: boolean;
  /** Whether the rig animates a mouth/face at all (dialogue capability signal). */
  readonly hasMouth: boolean;
  /** Plain-language reason when motionPass is false. */
  readonly reason: string;
}

/**
 * Inspect a downloaded character GLB's embedded clips and produce a motion report.
 * `requireMouth` (dialogue scenes) makes a missing mouth/face a hard reason in the summary text,
 * though the caller decides the final accept/reject (it also weighs the rig grade + render probe).
 */
export function probeEmbeddedMotion(buf: Buffer): MotionProbeReport {
  const glb = parseGlb(buf);
  if (!glb || !glb.json.animations?.length) {
    return {
      clips: [], usefulClips: 0, coveredIntents: [], hasViableActingPack: false,
      missingActingSlots: [...MINIMUM_ACTING_PACK], libraryFallback: true, motionPass: false,
      hasMouth: false, reason: glb ? "no embedded animations" : "unparseable GLB"
    };
  }
  const roles = classifyNodes(glb);
  const analyses = glb.json.animations.map((anim, i) => analyzeAnimation(glb, anim, roles, i));
  const clips = analyses.map(scoreClip).sort((x, y) => y.score - x.score);

  const useful = clips.filter((c) => c.useful);
  const hasMouth = analyses.some((a) => a.movesMouth);
  const covered = new Set<StandardClipId>();
  for (const c of useful) if (c.mappedIntent) covered.add(c.mappedIntent);
  // talk and gesture are interchangeable for the "talk/gesture" acting-pack slot.
  const coversTalkOrGesture = covered.has("talk") || covered.has("gesture");
  const missingActingSlots = MINIMUM_ACTING_PACK.filter((slot) =>
    slot === "talk" ? !coversTalkOrGesture : !covered.has(slot)
  );
  const hasViableActingPack = missingActingSlots.length === 0;
  const motionPass = useful.length > 0;

  return {
    clips,
    usefulClips: useful.length,
    coveredIntents: [...covered],
    hasViableActingPack,
    missingActingSlots,
    libraryFallback: !hasViableActingPack,
    motionPass,
    hasMouth,
    reason: motionPass
      ? hasViableActingPack
        ? "embedded clips cover a viable acting pack"
        : `embedded clips usable but incomplete (missing ${missingActingSlots.join("/")}) — shared library fallback`
      : "no embedded clip drives real body motion (root/mouth/tiny-idle only) — shared library fallback"
  };
}
