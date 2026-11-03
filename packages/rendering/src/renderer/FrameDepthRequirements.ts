import { isTrustedQrFlags, type QrFlags } from "../contracts/core";
import { hasPotentiallyActiveFrameContributors } from "../contracts/frameGraph";

/**
 * The least restrictive scene-depth representation a frame could use:
 *
 * - `none`: no known consumer needs to sample the scene depth.
 * - `resolved-after-opaque`: every depth consumer needs only the opaque
 *   snapshot published after the opaque pass.
 * - `live-single-sample`: a consumer may need the live, single-sample depth
 *   attachment, or the consumer/stage cannot be proven safe.
 */
export type FrameDepthRequirement = "none" | "resolved-after-opaque" | "live-single-sample";

/**
 * Classify the requirements visible *now*, before choosing a forward target.
 * `postRequirement` must be computed for this renderer, view and frame by the
 * owner of the post route. `"none"` is a positive proof that the entire post
 * route has no scene-depth consumer, including custom or newly registered
 * passes; a false result from a best-effort depth query is not such a proof.
 * Missing, unrecognised or unproven post metadata must be passed as unknown.
 *
 * Registry preflight uses registration-time activation metadata and never
 * reads a provider's properties or calls provider code. At present there are
 * no certified contributor identities or post stages: even a contributor
 * advertising `after-opaque` (or a post route claiming that timing) must use
 * the conservative live mode. A future resolved-mode admission must prove
 * exact provider identity and immutable behavior/metadata for its full scope.
 *
 * This is a snapshot, not a frame-lifetime lease. Callbacks can register or
 * replace providers after this function returns. An MSAA caller must separately
 * prove that registry, device, stage timing and scope cannot change until the
 * depth consumer finishes, or retain the single-sample route.
 */
export function classifyFrameDepthRequirements(flags: QrFlags, postRequirement: unknown): FrameDepthRequirement {
  if (!isTrustedQrFlags(flags) || postRequirement !== "none") return "live-single-sample";
  if (hasPotentiallyActiveFrameContributors(flags)) return "live-single-sample";
  return "none";
}
