/**
 * PRD-06 T1.5 — per-bone blend weights in a flat `Float32Array`.
 *
 * Selectors:
 *  - `"Spine"` — exact joint name (a duplicated name weights *all* its joints).
 *  - `{ bone: "Spine", descendants: true }` — the joint plus its subtree via
 *    the skeleton's parent indices.
 *  - `{ humanoid: "upper-body" }` — preset resolved through
 *    `HumanoidBoneInference` (§6.4): `upper-body` = Spine and descendants
 *    excluding the leg chains; `lower-body` = Hips + the leg chains; the
 *    sided presets pick one limb chain (plus its subtree).
 *  - `{ substring: "mixamorig" }` — deprecated name-fragment match, kept only
 *    for callers migrating off the old substring path.
 *
 * `spec.weights` supplies a falloff: `{ "Spine": 0.3, "Spine1": 0.6,
 * "Spine2": 1.0 }` or preset keys like `{ "upper-body": 0.5 }`.
 */

import { inferHumanoidRig } from "../HumanoidBoneInference.js";
import type { HumanoidBoneName } from "../HumanoidRetargeting.js";

export type BoneMaskPreset =
  | "upper-body"
  | "lower-body"
  | "left-arm"
  | "right-arm"
  | "left-leg"
  | "right-leg"
  | "head";

export type BoneMaskSelector =
  | string
  | { readonly bone: string; readonly descendants?: boolean }
  | { readonly humanoid: BoneMaskPreset }
  | { readonly substring: string };

export interface BoneMaskSpec {
  /** Selectors that set weight 1 (overridable per-bone by `weights`). */
  readonly include?: readonly BoneMaskSelector[];
  /** Per-bone-name or per-preset weight falloff. */
  readonly weights?: Readonly<Record<string, number>>;
}

export interface BoneMaskSkeleton {
  readonly jointNames: readonly string[];
  /** Parent joint index per joint (-1 for roots). */
  readonly parentIndices?: readonly number[];
}

/** Slots whose chains make up a leg (used to exclude them from `upper-body`). */
const LEG_SLOTS: readonly HumanoidBoneName[] = [
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"
];
const LEFT_ARM_SLOTS: readonly HumanoidBoneName[] = ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"];
const RIGHT_ARM_SLOTS: readonly HumanoidBoneName[] = ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"];
const LEFT_LEG_SLOTS: readonly HumanoidBoneName[] = ["leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes"];
const RIGHT_LEG_SLOTS: readonly HumanoidBoneName[] = ["rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"];
const UPPER_BODY_SLOTS: readonly HumanoidBoneName[] = [
  "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"
];

export function createBoneMask(spec: BoneMaskSpec, skeleton: BoneMaskSkeleton): Float32Array {
  const count = skeleton.jointNames.length;
  const mask = new Float32Array(count);
  const indicesByName = new Map<string, number[]>();
  skeleton.jointNames.forEach((name, index) => {
    const bucket = indicesByName.get(name);
    if (bucket) bucket.push(index);
    else indicesByName.set(name, [index]);
  });
  const parents = skeleton.parentIndices ?? new Array<number>(count).fill(-1);
  const childrenOf = new Map<number, number[]>();
  parents.forEach((parent, index) => {
    if (parent < 0 || parent >= count) return;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(index);
    else childrenOf.set(parent, [index]);
  });

  const mark = (index: number, weight: number): void => {
    if (index >= 0 && index < count) mask[index] = weight;
  };
  const markSubtree = (index: number, weight: number): void => {
    mark(index, weight);
    for (const child of childrenOf.get(index) ?? []) markSubtree(child, weight);
  };
  const markNames = (names: readonly (string | undefined)[], weight: number, includeDescendants: boolean): void => {
    for (const name of names) {
      if (name === undefined) continue;
      for (const index of indicesByName.get(name) ?? []) {
        if (includeDescendants) markSubtree(index, weight);
        else mark(index, weight);
      }
    }
  };

  const rig = inferHumanoidRig(skeleton.jointNames);
  const slotName = (slot: HumanoidBoneName): string | undefined => rig.bones[slot]?.name;
  const slotChainNames = (slots: readonly HumanoidBoneName[]): string[] =>
    slots.map((slot) => slotName(slot)).filter((name): name is string => name !== undefined);
  const legNames = new Set(slotChainNames(LEG_SLOTS));

  const applyPreset = (preset: BoneMaskPreset, weight: number): void => {
    switch (preset) {
      case "upper-body": {
        // Spine and descendants, excluding legs (§6.4).
        const spine = slotName("spine");
        for (const index of indicesByName.get(spine ?? "") ?? []) markSubtree(index, weight);
        markNames(slotChainNames(UPPER_BODY_SLOTS), weight, false);
        for (const legName of legNames) {
          for (const index of indicesByName.get(legName) ?? []) markSubtree(index, 0);
        }
        break;
      }
      case "lower-body":
        // Hips + legs (§6.4).
        markNames([slotName("hips")], weight, false);
        markNames(slotChainNames(LEG_SLOTS), weight, true);
        break;
      case "left-arm":
        markNames(slotChainNames(LEFT_ARM_SLOTS), weight, true);
        break;
      case "right-arm":
        markNames(slotChainNames(RIGHT_ARM_SLOTS), weight, true);
        break;
      case "left-leg":
        markNames(slotChainNames(LEFT_LEG_SLOTS), weight, true);
        break;
      case "right-leg":
        markNames(slotChainNames(RIGHT_LEG_SLOTS), weight, true);
        break;
      case "head":
        markNames([slotName("head"), slotName("neck")], weight, true);
        break;
    }
  };

  const applySelector = (selector: BoneMaskSelector, weight: number): void => {
    if (typeof selector === "string") {
      markNames([selector], weight, false);
      return;
    }
    if ("bone" in selector) {
      for (const index of indicesByName.get(selector.bone) ?? []) {
        if (selector.descendants) markSubtree(index, weight);
        else mark(index, weight);
      }
      return;
    }
    if ("humanoid" in selector) {
      applyPreset(selector.humanoid, weight);
      return;
    }
    if ("substring" in selector) {
      const needle = selector.substring.toLowerCase();
      skeleton.jointNames.forEach((name, index) => {
        if (name.toLowerCase().includes(needle)) mark(index, weight);
      });
    }
  };

  for (const selector of spec.include ?? []) applySelector(selector, 1);

  if (spec.weights) {
    for (const [key, weight] of Object.entries(spec.weights)) {
      if (isBoneMaskPreset(key)) applyPreset(key, weight);
      else markNames([key], weight, false);
    }
  }

  return mask;
}

const PRESETS: ReadonlySet<string> = new Set([
  "upper-body", "lower-body", "left-arm", "right-arm", "left-leg", "right-leg", "head"
]);
function isBoneMaskPreset(key: string): key is BoneMaskPreset {
  return PRESETS.has(key);
}
