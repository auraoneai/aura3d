export type BoneRole =
  | "rightHand" | "leftHand" | "head" | "hips" | "spine" | "rightFoot" | "leftFoot"
  | "rightLowerArm" | "leftLowerArm" | "rightShoulder" | "leftShoulder";

const ROLE_ALIASES: Readonly<Record<BoneRole, readonly string[]>> = {
  rightHand: ["RightHand", "Hand_R", "hand_r", "Hand.R", "R_Hand", "right_hand", "Bip01 R Hand", "mixamorig:RightHand", "RightHandMiddle1"],
  leftHand: ["LeftHand", "Hand_L", "hand_l", "Hand.L", "L_Hand", "left_hand", "Bip01 L Hand", "mixamorig:LeftHand"],
  head: ["Head", "head", "mixamorig:Head", "Bip01 Head"],
  hips: ["Hips", "hips", "Pelvis", "pelvis", "mixamorig:Hips", "Bip01 Pelvis"],
  spine: ["Spine", "spine", "Spine1", "mixamorig:Spine", "Chest"],
  rightFoot: ["RightFoot", "Foot_R", "foot_r", "Foot.R", "R_Foot", "mixamorig:RightFoot", "Bip01 R Foot"],
  leftFoot: ["LeftFoot", "Foot_L", "foot_l", "Foot.L", "L_Foot", "mixamorig:LeftFoot", "Bip01 L Foot"],
  rightLowerArm: ["RightForeArm", "RightLowerArm", "ForeArm_R", "lowerarm_r", "mixamorig:RightForeArm"],
  leftLowerArm: ["LeftForeArm", "LeftLowerArm", "ForeArm_L", "lowerarm_l", "mixamorig:LeftForeArm"],
  rightShoulder: ["RightShoulder", "Shoulder_R", "clavicle_r", "mixamorig:RightShoulder"],
  leftShoulder: ["LeftShoulder", "Shoulder_L", "clavicle_l", "mixamorig:LeftShoulder"]
};

const normalize = (name: string): string => {
  const colon = name.lastIndexOf(":");
  const base = colon >= 0 ? name.slice(colon + 1) : name;
  return base.toLowerCase().replace(/[^a-z0-9]/g, "");
};

/** Names a role may go by across Mixamo, Blender and Meshy rigs. */
export function boneAliases(role: BoneRole): readonly string[] {
  return ROLE_ALIASES[role];
}

/** Resolve a role or exact bone name against a skeleton's bone names; undefined when nothing matches. */
export function resolveBone(boneNames: readonly string[], roleOrName: BoneRole | string): string | undefined {
  const exact = boneNames.find((b) => b === roleOrName);
  if (exact !== undefined) return exact;
  const wanted = new Set<string>([normalize(roleOrName)]);
  const aliases = ROLE_ALIASES[roleOrName as BoneRole];
  if (aliases !== undefined) for (const a of aliases) wanted.add(normalize(a));
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
  if (options.boneNames !== undefined) {
    bone = resolveBone(options.boneNames, options.bone);
  } else {
    const candidates = [options.bone, ...(ROLE_ALIASES[options.bone as BoneRole] ?? [])];
    bone = candidates.find((c) => actor.socket(c).valid);
  }
  if (bone === undefined) {
    const near = options.boneNames?.filter((b) => normalize(b).includes(normalize(String(options.bone)).slice(0, 4))).slice(0, 8) ?? [];
    throw new Error(
      `ATTACH_BONE_NOT_FOUND: no bone matches "${String(options.bone)}"${near.length ? ` (similar: ${near.join(", ")})` : ""}. Pass boneNames from the skeleton or an exact bone name.`
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
