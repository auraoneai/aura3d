/**
 * Codemod `prd09-capture-branches` (PRD-09 §10 step 3): unwraps
 * `?capture=review`-style branches so the production arm survives and the
 * review arm is dropped. Conservative: only rewrites `cond ? REVIEW : PROD`
 * / `cond ? PROD : REVIEW` ternaries and `if (capture) { ... }` statement
 * blocks it can resolve; everything else is reported as a `none` row.
 */
import type { AuraCodemod } from "../../../contracts/commands.js";

const CAPTURE_COND = /(\w+|\([^)]*\))\s*(?:===?\s*|!==?\s*)\s*["']?(?:capture|review)["']?|(?:searchParams|params)\.get\(["']capture["']\)|["']capture=review["']|\b(?:review|capture|isReview|isCapture|captureMode|reviewCapture)\b/i;

export const captureBranchesCodemod: AuraCodemod = {
  name: "prd09-capture-branches",
  owner: "prd09",
  description: "Remove `?capture=review` branches; keep the production arm (PRD-09 step 3).",
  transform(source, fileName) {
    const rows: { file: string; line: number; construct: string; mapping: "exact" | "approximate" | "none"; target?: string; note?: string }[] = [];
    const lines = source.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ternary = line.match(/(.*)=\s*([^?]+)\?\s*([^:]+):\s*([^;]+)(;.*)$/);
      if (ternary && CAPTURE_COND.test(ternary[2])) {
        const [, lhs, cond, a, b, tail] = ternary;
        // Convention: `captureFlag ? reviewPath : productionPath` — the true
        // arm is entered only when the review flag is set, so the else arm is
        // the shipped behaviour. Textual check is a fallback for inverted
        // conds (`!review ? prod : review`).
        const negated = /^\s*!/.test(cond.trim());
        const aIsReview = /review|capture|preview/i.test(a);
        const bIsReview = /review|capture|preview/i.test(b);
        let keep: string | null;
        let note: string;
        if (aIsReview && !bIsReview) { keep = b; note = "kept production arm (true arm is review-marked)"; }
        else if (bIsReview && !aIsReview) { keep = a; note = "kept production arm (else arm is review-marked)"; }
        else if (!negated) { keep = b; note = "kept else arm as production (capture-flag convention)"; }
        else { keep = a; note = "kept true arm under negated capture condition"; }
        out.push(`${lhs}= ${keep.trim()}${tail}`);
        rows.push({ file: fileName, line: i + 1, construct: cond.trim(), mapping: "approximate", target: keep.trim(), note });
        continue;
      }
      if (CAPTURE_COND.test(line) && /(if|else if)\s*\(/.test(line)) {
        rows.push({ file: fileName, line: i + 1, construct: line.trim(), mapping: "none", note: "capture if-branch — delete review arm manually" });
        out.push(line);
        continue;
      }
      out.push(line);
    }
    return { code: out.join("\n"), rows };
  }
};
