export type BoneRole =
  | "rightHand" | "leftHand" | "head" | "hips" | "spine" | "rightFoot" | "leftFoot"
  | "rightForearm" | "leftForearm" | "rightLowerArm" | "leftLowerArm"
  | "rightUpperArm" | "leftUpperArm" | "rightShoulder" | "leftShoulder"
  | "rightShin" | "leftShin" | "rightThigh" | "leftThigh";

type Side = "right" | "left" | "none";
type Part = "hand" | "forearm" | "upperArm" | "shoulder" | "thigh" | "shin" | "foot" | "hips" | "spine" | "head";

const ROLE_PARTS: Readonly<Record<BoneRole, { readonly side: Side; readonly part: Part }>> = {
  rightHand: { side: "right", part: "hand" }, leftHand: { side: "left", part: "hand" },
  rightForearm: { side: "right", part: "forearm" }, leftForearm: { side: "left", part: "forearm" },
  rightLowerArm: { side: "right", part: "forearm" }, leftLowerArm: { side: "left", part: "forearm" },
  rightUpperArm: { side: "right", part: "upperArm" }, leftUpperArm: { side: "left", part: "upperArm" },
  rightShoulder: { side: "right", part: "shoulder" }, leftShoulder: { side: "left", part: "shoulder" },
  rightThigh: { side: "right", part: "thigh" }, leftThigh: { side: "left", part: "thigh" },
  rightShin: { side: "right", part: "shin" }, leftShin: { side: "left", part: "shin" },
  rightFoot: { side: "right", part: "foot" }, leftFoot: { side: "left", part: "foot" },
  hips: { side: "none", part: "hips" }, spine: { side: "none", part: "spine" }, head: { side: "none", part: "head" }
};

/** Normalised synonyms per part (lowercase, no punctuation). Mixamo, Meshy, Rigify, Unreal, glTF Avatar (VRM, Ready Player Me), 3ds Max Biped. */
const PART_WORDS: Readonly<Record<Part, readonly string[]>> = {
  hand: ["hand"],
  forearm: ["forearm", "lowerarm", "lowarm"],
  upperArm: ["upperarm", "uparm", "arm"],
  shoulder: ["shoulder", "clavicle"],
  thigh: ["upleg", "upperleg", "thigh"],
  shin: ["leg", "lowerleg", "lowleg", "shin", "calf"],
  foot: ["foot"],
  hips: ["hips", "pelvis", "hip"],
  spine: ["spine", "spine1", "chest"],
  head: ["head"]
};

const RIG_PREFIXES = ["mixamorig", "bip001", "bip01", "def", "org", "tweak", "ctrl"];

/** Written forms tried when probing without a bone list, most common rigs first. */
const PART_WRITTEN: Readonly<Record<Part, readonly string[]>> = {
  hand: ["Hand", "hand"],
  forearm: ["ForeArm", "Forearm", "forearm", "LowerArm", "lowerarm"],
  upperArm: ["Arm", "UpperArm", "upperarm", "arm"],
  shoulder: ["Shoulder", "shoulder", "clavicle"],
  thigh: ["UpLeg", "UpperLeg", "Thigh", "upperleg", "thigh"],
  shin: ["Leg", "LowerLeg", "calf", "shin", "leg"],
  foot: ["Foot", "foot"],
  hips: ["Hips", "hips", "Pelvis", "pelvis"],
  spine: ["Spine", "spine", "Spine1", "Chest"],
  head: ["Head", "head"]
};

const normalize = (name: string): string => {
  const colon = name.lastIndexOf(":");
  let base = (colon >= 0 ? name.slice(colon + 1) : name).toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const prefix of RIG_PREFIXES) {
    if (base.startsWith(prefix) && base.length > prefix.length) {
      base = base.slice(prefix.length);
      break;
    }
  }
  return base;
};

const sideForms = (side: Side): { readonly prefix: readonly string[]; readonly suffix: readonly string[] } =>
  side === "none"
    ? { prefix: [""], suffix: [] }
    : side === "right"
      ? { prefix: ["Right", "right_", "R_", "right", "R"], suffix: [".R", "_R", "_r", ".r", "Right", "_right"] }
      : { prefix: ["Left", "left_", "L_", "left", "L"], suffix: [".L", "_L", "_l", ".l", "Left", "_left"] };

/** Normalised strings that name a role: side+part and part+side forms of every synonym. */
function roleNormals(role: BoneRole): Set<string> {
  const { side, part } = ROLE_PARTS[role];
  const out = new Set<string>();
  const sideWords = side === "none" ? [""] : side === "right" ? ["right", "r"] : ["left", "l"];
  for (const word of PART_WORDS[part]) {
    if (side === "none") out.add(word);
    for (const sw of sideWords) {
      if (side === "none") continue;
      out.add(sw + word);
      out.add(word + sw);
    }
  }
  return out;
}

/** Candidate bone names to probe for a role, ordered from most to least common rig naming. */
export function boneAliases(role: BoneRole): readonly string[] {
  const { side, part } = ROLE_PARTS[role];
  const forms = sideForms(side);
  const out: string[] = [];
  const add = (n: string) => {
    if (!out.includes(n)) out.push(n);
  };
  for (const w of PART_WRITTEN[part]) {
    for (const pre of forms.prefix) add(`mixamorig:${pre}${w}`);
    for (const pre of forms.prefix) add(`${pre}${w}`);
  }
  for (const w of PART_WRITTEN[part]) {
    for (const suf of forms.suffix) {
      add(`${w}${suf}`);
      add(`${w.toLowerCase()}${suf}`);
    }
  }
  if (side !== "none") {
    const letter = side === "right" ? "R" : "L";
    for (const w of PART_WRITTEN[part]) add(`Bip01 ${letter} ${w}`);
    for (const w of PART_WRITTEN[part]) for (const suf of forms.suffix) add(`DEF-${w.toLowerCase()}${suf}`);
  } else {
    for (const w of PART_WRITTEN[part]) {
      add(`mixamorig:${w}`);
      add(`Bip01 ${w}`);
    }
  }
  // Exotic casing last, so common rigs hit within the first probes.
  for (const n of [...out]) {
    add(n.toLowerCase());
    add(n.toUpperCase());
  }
  return out;
}

/** Resolve a role or exact bone name against a skeleton's bone names; case-, punctuation- and rig-prefix-insensitive. */
export function resolveBone(boneNames: readonly string[], roleOrName: BoneRole | string): string | undefined {
  const exact = boneNames.find((b) => b === roleOrName);
  if (exact !== undefined) return exact;
  const wanted = new Set<string>([normalize(roleOrName)]);
  if (roleOrName in ROLE_PARTS) for (const n of roleNormals(roleOrName as BoneRole)) wanted.add(n);
  return boneNames.find((b) => wanted.has(normalize(b)));
}

export interface SocketLike {
  readonly valid: boolean;
  worldMatrix(out?: Float32Array): Float32Array;
}

export interface AttachableActor {
  socket(bone: string): SocketLike;
  attach(spec: {
    readonly socket: string;
    readonly target: string | object;
    readonly position?: readonly [number, number, number];
    readonly rotation?: readonly [number, number, number];
    readonly scale?: number;
  }): () => void;
}

export interface AttachToBoneOptions {
  /** A role (for example "rightHand") or an exact bone name. */
  readonly bone: BoneRole | string;
  readonly target: string | object;
  /** Skeleton bone names if known; otherwise aliases are probed with `socket(name).valid`. */
  readonly boneNames?: readonly string[];
  /** Offset in bone space. */
  readonly position?: readonly [number, number, number];
  /** XYZ Euler radians in bone space. */
  readonly rotation?: readonly [number, number, number];
  readonly scale?: number;
}

export interface BoneAttachment {
  readonly bone: string;
  detach(): void;
}

/** Pin a node to a bone (bat to hand, club to hand, ball to hand) with bone-name resolution and a loud failure. */
export function attachToBone(actor: AttachableActor, options: AttachToBoneOptions): BoneAttachment {
  let bone: string | undefined;
  let tried: readonly string[] = [];
  if (options.boneNames !== undefined) {
    bone = resolveBone(options.boneNames, options.bone);
    tried = [String(options.bone), ...(options.bone in ROLE_PARTS ? [...roleNormals(options.bone as BoneRole)] : [])];
  } else {
    const candidates = [options.bone, ...(options.bone in ROLE_PARTS ? boneAliases(options.bone as BoneRole) : [])];
    tried = candidates;
    bone = candidates.find((c) => actor.socket(c).valid);
  }
  if (bone === undefined) {
    const key = normalize(String(options.bone)).slice(0, 4);
    const near = options.boneNames?.filter((b) => normalize(b).includes(key)).slice(0, 8) ?? [];
    const shown = tried.slice(0, 24).join(", ") + (tried.length > 24 ? `, +${tried.length - 24} more` : "");
    throw new Error(
      `ATTACH_BONE_NOT_FOUND: no bone matches "${String(options.bone)}". Tried: ${shown}.${near.length ? ` Similar bones: ${near.join(", ")}.` : ""} Pass boneNames from the skeleton or an exact bone name.`
    );
  }
  const spec: { socket: string; target: string | object; position?: readonly [number, number, number]; rotation?: readonly [number, number, number]; scale?: number } = {
    socket: bone,
    target: options.target
  };
  if (options.position !== undefined) spec.position = options.position;
  if (options.rotation !== undefined) spec.rotation = options.rotation;
  if (options.scale !== undefined) spec.scale = options.scale;
  const detach = actor.attach(spec);
  return { bone, detach };
}

/** World position of a bone (translation of its world matrix). */
export function boneWorldPosition(actor: Pick<AttachableActor, "socket">, bone: string): [number, number, number] {
  const m = actor.socket(bone).worldMatrix();
  return [m[12]!, m[13]!, m[14]!];
}

/** Distance in metres between an attached node and its bone (accounts for no offset: pass the expected offset-free node position). */
export function attachmentDistance(nodePosition: readonly [number, number, number], bonePosition: readonly [number, number, number]): number {
  return Math.hypot(nodePosition[0] - bonePosition[0], nodePosition[1] - bonePosition[1], nodePosition[2] - bonePosition[2]);
}
