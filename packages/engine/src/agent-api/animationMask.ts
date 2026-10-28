import type { BoneMaskSelector, BoneMaskSpec } from "@aura3d/animation/lanes";
import type { AuraBoneMaskSpec } from "../contracts/animation.js";

/**
 * The public `AuraBoneMaskSpec` (`{ include?, exclude?, humanoid? }`) is not the shape the pose mixer's
 * `createBoneMask` reads (`{ include: selector[], weights }`). Handing the public spec over unchanged made
 * `humanoid` and `exclude` silent no-ops, so `mask: { humanoid: "upper-body" }` produced an all-zero mask and
 * the layer did nothing. This maps one onto the other:
 *
 * - `include` entries are exact bone names (or pose selectors, passed through);
 * - `humanoid` adds the matching preset (`"arms"` is both arms);
 * - `exclude` names get weight 0 after the includes, so they win.
 */
export function toPoseBoneMaskSpec(spec: AuraBoneMaskSpec | BoneMaskSpec): BoneMaskSpec {
  const source = spec as AuraBoneMaskSpec & Partial<BoneMaskSpec>;
  const include: BoneMaskSelector[] = [...((source.include ?? []) as readonly BoneMaskSelector[])];
  if (source.humanoid === "arms") include.push({ humanoid: "left-arm" }, { humanoid: "right-arm" });
  else if (source.humanoid !== undefined) include.push({ humanoid: source.humanoid });
  const weights: Record<string, number> = { ...(source.weights ?? {}) };
  for (const bone of source.exclude ?? []) weights[bone] = 0;
  return Object.keys(weights).length > 0 ? { include, weights } : { include };
}
