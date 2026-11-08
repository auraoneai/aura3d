// Billed cost of one run from provider usage fields.
// Order of truth: a provider-reported USD cost (usage.cost_usd) > provider credits (usage.kiro_credits) times a declared
// USD-per-credit rate > list price applied to the token split (uncached input, cache read, cache write, output).
// The source is always recorded so a report never mixes estimates with billed numbers silently.

/** USD per million tokens. Anthropic first-party list prices (claude-api skill table, cached 2026-10-06); cache write = 1.25x input. */
export const LIST_PRICES = {
  "claude-sonnet-5.5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5.5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-5.5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  stub: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
};

export function priceFor(model, env = process.env) {
  const override = env.AGENT_EVAL_PRICES ? JSON.parse(env.AGENT_EVAL_PRICES)[model] : null;
  const key = String(model).replace(/^acct\//, "").replace(/-(\d)-(\d)$/, "-$1.$2");
  return override ?? LIST_PRICES[key] ?? null;
}

const round = (v) => (v == null ? null : Math.round(v * 1e6) / 1e6);

/**
 * usage: the loop's usage totals ({ uncachedInput, cacheRead, cacheWrite, output, providerCredits, providerCostUsd }).
 * usdPerCredit: the account's credit price when Prism bills in Kiro credits (AGENT_EVAL_USD_PER_CREDIT); null if unknown.
 */
export function costOf(usage, model, { usdPerCredit = null, env = process.env } = {}) {
  if (!usage) return { billedUsd: null, listUsd: null, providerUsd: null, providerCredits: null, source: "none" };
  const p = priceFor(model, env);
  const listUsd = p
    ? ((usage.uncachedInput ?? 0) * p.input + (usage.cacheRead ?? 0) * p.cacheRead + (usage.cacheWrite ?? 0) * p.cacheWrite + (usage.output ?? 0) * p.output) / 1e6
    : null;
  const providerUsd = usage.providerCostUsd ?? null;
  const providerCredits = usage.providerCredits ?? null;
  let billedUsd = listUsd;
  let source = p ? "list-price-estimate" : "unpriced";
  if (providerUsd != null) {
    billedUsd = providerUsd;
    source = "provider-usd";
  } else if (providerCredits != null && usdPerCredit != null) {
    billedUsd = providerCredits * usdPerCredit;
    source = "provider-credits";
  }
  return { billedUsd: round(billedUsd), listUsd: round(listUsd), providerUsd: round(providerUsd), providerCredits: round(providerCredits), source };
}

/** Pre-run budget: runs x mean tokens per run at list price. Used by run-c1.mjs --estimate and the README. */
export function estimateBatch({ runs, model, perRun }) {
  const p = priceFor(model);
  if (!p) return null;
  const one = (perRun.uncachedInput * p.input + perRun.cacheRead * p.cacheRead + perRun.cacheWrite * p.cacheWrite + perRun.output * p.output) / 1e6;
  return { perRunUsd: round(one), totalUsd: round(one * runs) };
}
