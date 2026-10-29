import type { BoneMaskSelector, BoneMaskSkeleton, BoneMaskSpec } from "@aura3d/animation/lanes";
import type { AuraBoneMaskSpec } from "../contracts/animation.js";

/**
 * The public `AuraBoneMaskSpec` (`{ include?, exclude?, humanoid? }`) is not the shape the pose mixer's
 * `createBoneMask` reads (`{ include: selector[], weights }`). Handing the public spec over unchanged made
 * `humanoid` and `exclude` silent no-ops, so `mask: { humanoid: "upper-body" }` produced an all-zero mask and
 * the layer did nothing. This maps one onto the other:
 *
 * - `include` entries are exact bone names (or pose selectors, passed through);
 * - `humanoid` adds the matching preset (`"arms"` is both arms);
 * - `exclude` names get weight 0 after the includes, so they win, and take their child bones with them;
 *   with no `include`/`humanoid`, the mask starts from the full body (anim-phys-08).
 */
/**
 * The skeleton a mask is built over: bind-order joint names plus parent indices, so subtree
 * selectors (`upper-body`, `exclude`) reach child bones. Without the mixer's skeleton the parents
 * are unknown and every selector touches only the named joints (anim-phys-08).
 */
export function boneMaskSkeletonFor(runtime: {
  readonly skeletonJointNames?: () => readonly string[];
  readonly mixer?: () => { readonly skeleton?: BoneMaskSkeleton };
}): BoneMaskSkeleton | undefined {
  const skeleton = typeof runtime.mixer === "function" ? runtime.mixer().skeleton : undefined;
  if (skeleton?.parentIndices !== undefined) return { jointNames: skeleton.jointNames, parentIndices: skeleton.parentIndices };
  return typeof runtime.skeletonJointNames === "function" ? { jointNames: runtime.skeletonJointNames() } : undefined;
}

export function toPoseBoneMaskSpec(spec: AuraBoneMaskSpec | BoneMaskSpec): BoneMaskSpec {
  const source = spec as AuraBoneMaskSpec & Partial<BoneMaskSpec>;
  const include: BoneMaskSelector[] = [...((source.include ?? []) as readonly BoneMaskSelector[])];
  if (source.humanoid === "arms") include.push({ humanoid: "left-arm" }, { humanoid: "right-arm" });
  else if (source.humanoid !== undefined) include.push({ humanoid: source.humanoid });
  const weights: Record<string, number> = { ...(source.weights ?? {}) };
  const exclude: BoneMaskSelector[] = [...((source.exclude ?? []) as readonly BoneMaskSelector[])];
  return {
    include,
    ...(Object.keys(weights).length > 0 ? { weights } : {}),
    ...(exclude.length > 0 ? { exclude } : {})
  };
}
