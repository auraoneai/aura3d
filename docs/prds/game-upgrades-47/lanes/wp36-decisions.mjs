// GU47 WP-36 pipeline decision rules (pure, unit-tested by wp36-decisions.test.mjs).
//
// Meshy task ids only work on the account that created them. Kiro Prism (84ff65c) resubmits rigging, retexture and
// remesh by model_url on a funded key, but animations (rig_task_id) and refines (preview_task_id) must run on the
// account that holds their parent and answer HTTP 402 `parent_key_exhausted` when it is drained (older Prism builds:
// bare 503 quota_exhausted). Such per-account failures restart the chain on a funded account; only a whole-pool
// exhaustion may park the queue until the next key reset.

/** Upper bound on chain restarts (new rig or new preview) per row, so a bad parent cannot loop. */
export const MAX_CHAIN_RESTARTS = 2;

/** Smallest balance a usable key needs before new unpinned work of each op is started. */
export const NEW_COST = { "text-to-3d": 30, retexture: 10, rig: 5, animate: 8 };

/** Detail strings Prism returns before any Meshy task exists (no charge). */
export const PRISM_REFUSAL = /"detail":"(parent_key_exhausted|quota_exhausted|all_keys_invalid|not_configured|busy)\b/;

/**
 * Kind of a failed `meshy <resource> create`.
 * pinned: the call names a parent task (refine, animate), so Prism must use the parent's account.
 */
export function classifyCreateFailure(code, err, pinned) {
  const e = String(err ?? "");
  if (/parent_key_exhausted/.test(e)) return "pinned-exhausted";
  if (code === 9 || /\b402\b/.test(e) || /quota_exhausted/.test(e)) return pinned ? "pinned-exhausted" : "credits";
  if (code === 3 || /all_keys_invalid|not_configured|\b401\b|\b403\b/.test(e)) return "auth";
  if (code === 6 || /\b429\b|rate_limited|"detail":"busy"/.test(e)) return "rate";
  if (code === 4) return "invalid";
  if (code === 2) return "usage";
  return "transient";
}

/**
 * What to do when a pinned follow-up fails because its parent's account is drained.
 * step: "refine" | "animate"; restarts: chain restarts already made for this row.
 * -> "new-preview" (start a new preview, then refine), "rerig" (new rig on a funded account, then animate with it),
 *    or "defer" (restart budget used up; retried on a later pass).
 */
export function followUpRecovery(step, restarts) {
  if ((restarts ?? 0) >= MAX_CHAIN_RESTARTS) return "defer";
  if (step === "refine") return "new-preview";
  if (step === "animate") return "rerig";
  return "defer";
}

/** Largest balance on a usable key (state ok), minus in-flight reservations. */
export function maxUsable(pool) {
  return Math.max(0, ...((pool?.keys ?? []).filter((k) => k.state === "ok").map((k) => (k.remaining ?? 0) - (k.inflight ?? 0))));
}

/**
 * True only for a genuine whole-pool exhaustion: no usable key can pay the cheapest new op.
 * An unreadable pool is not exhaustion (the caller retries the read).
 */
export function poolExhausted(pool, cheapest = Math.min(...Object.values(NEW_COST))) {
  if (!pool || !Array.isArray(pool.keys)) return false;
  return maxUsable(pool) < cheapest;
}

/**
 * Idle scheduler decision when nothing is active and no row has a retry time pending.
 * stopNew: an unpinned create was refused while the pool showed no capacity.
 * -> "wait-reset" (park until the next key reset, re-checking the pool), "recheck" (refresh the pool soon and retry
 *    held rows), or "end".
 */
export function idleDecision({ remaining, stopNew, pool, waitForCredits }) {
  if (remaining === 0) return "end";
  if (!waitForCredits) return "end";
  if (stopNew && poolExhausted(pool)) return "wait-reset";
  return "recheck";
}
