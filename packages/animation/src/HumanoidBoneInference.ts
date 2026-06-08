import {
  HUMANOID_BONES,
  REQUIRED_HUMANOID_BONES,
  type HumanoidBoneBinding,
  type HumanoidBoneName,
  type HumanoidRigDefinition
} from "./HumanoidRetargeting.js";

/**
 * Options for {@link inferHumanoidRig}. All optional — sensible defaults match the
 * conventions found across the free GLB/glTF catalog (Mixamo, Sketchfab/Blender, UE-ish).
 */
export interface InferHumanoidRigOptions {
  /** Id assigned to the produced {@link HumanoidRigDefinition}. Defaults to `"inferred-humanoid"`. */
  readonly id?: string;
  /** Human-readable rig name copied onto the definition. */
  readonly name?: string;
  /**
   * Extra alias entries merged on top of the built-in table. Use this for one-off rigs whose
   * node names don't follow any common convention. Keys are {@link HumanoidBoneName}s; values are
   * additional name fragments (compared case-insensitively after normalization).
   */
  readonly extraAliases?: Partial<Record<HumanoidBoneName, readonly string[]>>;
  /** Forwarded onto the resulting rig definition. */
  readonly units?: HumanoidRigDefinition["units"];
  /** Forwarded onto the resulting rig definition. */
  readonly facingAxis?: HumanoidRigDefinition["facingAxis"];
  /** Forwarded onto the resulting rig definition. */
  readonly scale?: number;
}

/**
 * Detail about a single resolved (or unresolved) humanoid slot — exposed via
 * {@link HumanoidRigInference.matches} so callers can debug ambiguous skeletons.
 */
export interface HumanoidBoneMatch {
  readonly bone: HumanoidBoneName;
  /** Resolved source node name, when one was found. */
  readonly node?: string;
  /** Score of the winning candidate (higher is a more confident match). */
  readonly score: number;
  /** Every node name that the alias table considered a plausible candidate for this slot. */
  readonly candidates: readonly string[];
}

export interface HumanoidRigInference {
  readonly rig: HumanoidRigDefinition;
  readonly matches: readonly HumanoidBoneMatch[];
  /** Required bones (see {@link REQUIRED_HUMANOID_BONES}) that could not be mapped. */
  readonly missingRequired: readonly HumanoidBoneName[];
}

type Side = "left" | "right" | null;

/**
 * Per-logical-group "core" tokens. These are matched against normalized node names. Side-bearing
 * groups omit the side here — sidedness is detected separately (`L_`, `Left`, `_l`, `.R`, etc.) so
 * a single table serves both sides. Keys are *logical groups* (`shoulder`, `upperArm`, …), not
 * {@link HumanoidBoneName}s; the side-resolved slots are derived below in {@link SLOT_SPECS}.
 */
const ALIAS_BY_KEY: Record<string, readonly string[]> = {
  hips: ["hips", "hip", "pelvis", "root", "cog", "bip01pelvis"],
  spine: ["spine", "spine0", "spine00", "spine1", "spine01", "abdomen", "lowerback", "torso"],
  chest: ["chest", "spine2", "spine02", "spine3", "ribcage", "upperback"],
  upperChest: ["upperchest", "spine3", "spine03", "spine4", "upperchestspine"],
  neck: ["neck", "neck0", "neck01", "neck1"],
  head: ["head"],
  shoulder: ["shoulder", "clavicle", "collar", "scapula"],
  upperArm: ["upperarm", "armupper", "arm", "uparm", "shoulderarm", "humerus", "armupper01"],
  lowerArm: ["lowerarm", "armlower", "forearm", "loarm", "elbow", "ulna", "armlower01"],
  hand: ["hand", "wrist", "palm"],
  upperLeg: ["upperleg", "legupper", "thigh", "upleg", "legupper01", "femur"],
  lowerLeg: ["lowerleg", "leglower", "calf", "shin", "leg", "loleg", "knee", "leglower01", "tibia"],
  foot: ["foot", "ankle"],
  toes: ["toe", "toes", "toebase", "ball"]
};

/** Logical (side-stripped) classification for each humanoid slot. */
interface SlotSpec {
  readonly bone: HumanoidBoneName;
  readonly aliasKey: string;
  readonly side: Side;
  /** Bones that are required for a usable rig (used to compute `missingRequired`). */
  readonly required: boolean;
}

const REQUIRED_SET = new Set<HumanoidBoneName>(REQUIRED_HUMANOID_BONES);

const SLOT_SPECS: readonly SlotSpec[] = ([
  { bone: "hips", aliasKey: "hips", side: null },
  { bone: "spine", aliasKey: "spine", side: null },
  { bone: "chest", aliasKey: "chest", side: null },
  { bone: "upperChest", aliasKey: "upperChest", side: null },
  { bone: "neck", aliasKey: "neck", side: null },
  { bone: "head", aliasKey: "head", side: null },
  { bone: "leftShoulder", aliasKey: "shoulder", side: "left" },
  { bone: "leftUpperArm", aliasKey: "upperArm", side: "left" },
  { bone: "leftLowerArm", aliasKey: "lowerArm", side: "left" },
  { bone: "leftHand", aliasKey: "hand", side: "left" },
  { bone: "rightShoulder", aliasKey: "shoulder", side: "right" },
  { bone: "rightUpperArm", aliasKey: "upperArm", side: "right" },
  { bone: "rightLowerArm", aliasKey: "lowerArm", side: "right" },
  { bone: "rightHand", aliasKey: "hand", side: "right" },
  { bone: "leftUpperLeg", aliasKey: "upperLeg", side: "left" },
  { bone: "leftLowerLeg", aliasKey: "lowerLeg", side: "left" },
  { bone: "leftFoot", aliasKey: "foot", side: "left" },
  { bone: "leftToes", aliasKey: "toes", side: "left" },
  { bone: "rightUpperLeg", aliasKey: "upperLeg", side: "right" },
  { bone: "rightLowerLeg", aliasKey: "lowerLeg", side: "right" },
  { bone: "rightFoot", aliasKey: "foot", side: "right" },
  { bone: "rightToes", aliasKey: "toes", side: "right" }
] as ReadonlyArray<{ bone: HumanoidBoneName; aliasKey: string; side: Side }>).map(
  (spec): SlotSpec => ({ ...spec, required: REQUIRED_SET.has(spec.bone) })
);

interface NormalizedNode {
  readonly raw: string;
  /** Lowercased, namespace-stripped (`mixamorig:`), separator-collapsed. */
  readonly canon: string;
  /** Side detected from prefixes/suffixes/tokens. */
  readonly side: Side;
}

const NAMESPACE_RE = /^(?:mixamorig\d*:|mixamorig\d*|bip\d*\s*|biped\s*|armature[|:_]?)/i;

function stripNamespace(name: string): string {
  let out = name;
  // Blender/glTF skinned hierarchies often prefix `Armature|` or `Armature/`.
  out = out.replace(/^armature[|/]/i, "");
  out = out.replace(NAMESPACE_RE, "");
  return out;
}

/** Collapse to alphanumerics only, lowercased — `L_Arm_Upper.01` -> `larmupper01`. */
function canonicalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function detectSide(raw: string): Side {
  const lower = raw.toLowerCase();
  // Explicit word boundaries first (left/right) — these are unambiguous.
  if (/(^|[^a-z])left([^a-z]|$)|leftarm|leftleg|lefthand|leftfoot|leftshoulder|leftupleg/.test(lower)) return "left";
  if (/(^|[^a-z])right([^a-z]|$)|rightarm|rightleg|righthand|rightfoot|rightshoulder|rightupleg/.test(lower)) return "right";
  // Side prefixes: L_, R_, l., r.  and suffixes: _l, _r, .l, .r, _L, name ends in L/R
  if (/(^|[^a-z])l[_.\- ]/.test(lower) || /[_.\- ]l($|[^a-z])/.test(lower)) return "left";
  if (/(^|[^a-z])r[_.\- ]/.test(lower) || /[_.\- ]r($|[^a-z])/.test(lower)) return "right";
  // Leading single side letter directly glued to a part: "LShoulder", "RArm", "L_Leg".
  if (/^l(?=[a-z0-9])/.test(lower) && !/^le(?!ft)/.test(lower) && !/^lo/.test(lower) && !/^la(?!rm)/.test(lower)) {
    // crude: only treat leading "l" as side when followed by a known limb-ish token.
    if (/^l(shoulder|arm|upperarm|lowerarm|forearm|hand|wrist|leg|upperleg|lowerleg|thigh|calf|shin|foot|ankle|toe|clav|coll)/.test(lower)) {
      return "left";
    }
  }
  if (/^r(?=[a-z0-9])/.test(lower)) {
    if (/^r(shoulder|arm|upperarm|lowerarm|forearm|hand|wrist|leg|upperleg|lowerleg|thigh|calf|shin|foot|ankle|toe|clav|coll)/.test(lower)) {
      return "right";
    }
  }
  return null;
}

function normalizeNode(raw: string): NormalizedNode {
  const stripped = stripNamespace(raw);
  return {
    raw,
    canon: canonicalize(stripped),
    side: detectSide(stripped) ?? detectSide(raw)
  };
}

/**
 * Score how well `node` fits `aliasKey`. Returns 0 for no match. Higher = better.
 * The score rewards: exact-token equality, longer alias fragments (more specific), and earlier
 * occurrence in the name. This lets `spine2`/`chest` win the chest slot over a generic `spine`.
 */
function scoreCandidate(node: NormalizedNode, aliasKey: string, aliases: readonly string[]): number {
  let best = 0;
  for (const alias of aliases) {
    const a = canonicalize(alias);
    if (a.length === 0) continue;
    const idx = node.canon.indexOf(a);
    if (idx < 0) continue;
    // Base: specificity by alias length.
    let score = 10 + a.length * 2;
    // Exact match (whole canon equals alias) is the strongest signal.
    if (node.canon === a) score += 40;
    // Side bones: a side-stripped exact-ish match where the remainder is only side tokens.
    const remainder = node.canon.replace(a, "");
    if (remainder.length <= 2) score += 15;
    // Prefer matches that appear toward the end (the "leaf" semantic token) for limb parts,
    // but prefer earlier for spine/hips where the root token leads.
    score += Math.max(0, 6 - idx);
    if (score > best) best = score;
  }
  // De-emphasize generic "spine" matching when the name clearly carries a chest/upperchest digit.
  if (aliasKey === "spine" && /(spine[2-9]|spine0[2-9])/.test(node.canon)) {
    best = Math.max(0, best - 12);
  }
  return best;
}

/**
 * Infer a {@link HumanoidRigDefinition} from a flat list of skeleton node names.
 *
 * Strategy: each humanoid slot has a side-agnostic alias table plus an L/R/Left/Right side tag.
 * For every slot we score all candidate nodes (filtered by detected side when the slot is sided),
 * pick the highest-scoring one, and forbid reusing a node across slots. Conventions covered:
 * Mixamo (`mixamorig:Hips`/`LeftArm`), Sketchfab/Blender (`Hip_00`, `Spine1..3`, `L_Shoulder`,
 * `L_Arm_Upper_01`, `L_Leg_Upper_01`, `L_Hand`, `L_Foot`), and UE-ish (`pelvis`, `upperarm_l`,
 * `thigh_r`, `calf_l`).
 *
 * Each produced {@link HumanoidBoneBinding} carries `name` (the resolved node) and `aliases`
 * (the other plausible candidates for that slot), wiring the previously-unread `aliases` field.
 */
export function inferHumanoidRigDetailed(
  nodeNames: readonly string[],
  options: InferHumanoidRigOptions = {}
): HumanoidRigInference {
  const nodes = nodeNames.map(normalizeNode);
  const used = new Set<string>();
  const bones: Partial<Record<HumanoidBoneName, HumanoidBoneBinding>> = {};
  const matches: HumanoidBoneMatch[] = [];

  // Process required + more-specific slots first so generic "spine"/"leg" don't steal nodes that a
  // more specific slot (chest/upperChest/lowerLeg) wants. We sort by a static priority.
  const ordered = [...SLOT_SPECS].sort((a, b) => slotPriority(a.bone) - slotPriority(b.bone));

  for (const spec of ordered) {
    const aliasList = mergeAliases(spec, options.extraAliases);
    const candidates: { node: NormalizedNode; score: number }[] = [];

    for (const node of nodes) {
      if (used.has(node.raw)) continue;
      if (spec.side && node.side && node.side !== spec.side) continue;
      // For sided slots, skip nodes with no detectable side only if a sided alternative exists.
      const score = scoreCandidate(node, spec.aliasKey, aliasList);
      if (score <= 0) continue;
      // Penalize sided slot matching a side-less node (ambiguous).
      const adjusted = spec.side && !node.side ? score - 8 : score;
      if (adjusted <= 0) continue;
      candidates.push({ node, score: adjusted });
    }

    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    const candidateNames = candidates.map((c) => c.node.raw);

    if (winner) {
      used.add(winner.node.raw);
      bones[spec.bone] = {
        name: winner.node.raw,
        aliases: candidateNames.slice(1)
      };
      matches.push({ bone: spec.bone, node: winner.node.raw, score: winner.score, candidates: candidateNames });
    } else {
      matches.push({ bone: spec.bone, score: 0, candidates: [] });
    }
  }

  const missingRequired = REQUIRED_HUMANOID_BONES.filter((bone) => !bones[bone]);

  const rig: HumanoidRigDefinition = {
    id: options.id ?? "inferred-humanoid",
    ...(options.name !== undefined ? { name: options.name } : {}),
    bones,
    ...(options.scale !== undefined ? { scale: options.scale } : {}),
    ...(options.units !== undefined ? { units: options.units } : {}),
    ...(options.facingAxis !== undefined ? { facingAxis: options.facingAxis } : {}),
    metadata: { inferred: true, inferredFromNodeCount: nodeNames.length }
  };

  return { rig, matches, missingRequired };
}

/** Convenience wrapper returning just the rig definition. */
export function inferHumanoidRig(
  nodeNames: readonly string[],
  options: InferHumanoidRigOptions = {}
): HumanoidRigDefinition {
  return inferHumanoidRigDetailed(nodeNames, options).rig;
}

function mergeAliases(spec: SlotSpec, extra?: Partial<Record<HumanoidBoneName, readonly string[]>>): readonly string[] {
  const base = ALIAS_BY_KEY[spec.aliasKey] ?? [];
  const extraForBone = extra?.[spec.bone] ?? [];
  return extraForBone.length > 0 ? [...extraForBone, ...base] : base;
}

/**
 * Lower number = resolved earlier. More-specific slots resolve first so they claim their nodes
 * before generic siblings (e.g. `chest` before `spine`, `lowerLeg` before `upperLeg` before the
 * generic `leg` token shared by both).
 */
function slotPriority(bone: HumanoidBoneName): number {
  const table: Partial<Record<HumanoidBoneName, number>> = {
    hips: 0,
    head: 1,
    upperChest: 2,
    chest: 3,
    neck: 4,
    leftHand: 5,
    rightHand: 5,
    leftFoot: 6,
    rightFoot: 6,
    leftToes: 7,
    rightToes: 7,
    leftShoulder: 8,
    rightShoulder: 8,
    leftLowerArm: 9,
    rightLowerArm: 9,
    leftUpperArm: 10,
    rightUpperArm: 10,
    leftLowerLeg: 11,
    rightLowerLeg: 11,
    leftUpperLeg: 12,
    rightUpperLeg: 12,
    spine: 13
  };
  return table[bone] ?? 20;
}

/** Re-exported for callers wanting to enumerate which slots inference targets. */
export const INFERABLE_HUMANOID_BONES: readonly HumanoidBoneName[] = HUMANOID_BONES;
