import { createRequire } from "node:module";

export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Non-blank, non-comment lines. */
export function countLoc(source) {
  return stripComments(source)
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

let tokenizer;
/** o200k_base tokens when gpt-tokenizer resolves (AGENT_EVAL_TOKENIZER_DIR), else chars/4 flagged as an estimate. */
export function countTokens(source, dir = process.env.AGENT_EVAL_TOKENIZER_DIR ?? "/tmp/agent-eval-base/tok") {
  if (tokenizer === undefined) {
    try {
      tokenizer = createRequire(`${dir}/package.json`)("gpt-tokenizer");
    } catch {
      tokenizer = null;
    }
  }
  const text = stripComments(source);
  if (tokenizer) return { tokens: tokenizer.encode(text).length, estimate: false };
  return { tokens: Math.ceil(text.length / 4), estimate: true };
}

export function median(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function spread(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return { min: null, max: null };
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

/**
 * events: [{ type: "write" | "typecheck" | "read" | ..., pass?: boolean }] in order.
 * Draft = first typecheck. Green = last passing typecheck with no write after it.
 * editsToGreen = writes after the first typecheck and before that green check (0 when the first check is green).
 * null when the work never reached a green check.
 */
export function editsToGreen(events) {
  const checks = events.map((e, i) => ({ e, i })).filter((x) => x.e.type === "typecheck");
  if (!checks.length) return { typechecked: false, firstTryTypecheck: null, editsToGreen: null };
  const firstTryTypecheck = checks[0].e.pass === true;
  let greenIndex = -1;
  for (let k = checks.length - 1; k >= 0; k -= 1) {
    const { e, i } = checks[k];
    if (e.pass === true && !events.slice(i + 1).some((x) => x.type === "write")) {
      greenIndex = i;
      break;
    }
  }
  if (greenIndex < 0) return { typechecked: true, firstTryTypecheck, editsToGreen: null };
  const writes = events.slice(checks[0].i + 1, greenIndex).filter((x) => x.type === "write").length;
  return { typechecked: true, firstTryTypecheck, editsToGreen: writes };
}

/** Rates and summaries over runs for a boolean/number field; invalid runs are excluded by the caller and counted separately. */
export function summarize(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  const bools = values.filter((v) => typeof v === "boolean");
  return {
    n: values.length,
    median: median(nums),
    ...spread(nums),
    trueCount: bools.length ? bools.filter(Boolean).length : null,
    boolN: bools.length || null,
    missing: values.length - nums.length - bools.length
  };
}
