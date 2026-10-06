// PR 0b-2 seam (CONTRACTS.md §3.4, C-28) — identity stub.
// PRD 04 implements real texture budgeting (downscale/evict/re-encode policy).
import type { Texture } from "../Texture";

export interface TextureBudgetPolicy {
  readonly textureBudgetBytes?: number;
  readonly maxTextureSize?: number;
}

export const DEFAULT_TEXTURE_BUDGET_POLICY: TextureBudgetPolicy = {};

/**
 * Identity: returns `desc` unchanged. Kept as a function (not an inline no-op)
 * so PRD 04 can grow real budgeting at this call site without touching the
 * upload path again.
 */
export function applyTextureBudget<T>(desc: T, policy: TextureBudgetPolicy = DEFAULT_TEXTURE_BUDGET_POLICY): T {
  void policy;
  return desc;
}
