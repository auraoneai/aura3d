/**
 * Review evidence for an independent rewrite: how much of a current file's
 * token sequence still appears in an earlier, attributed revision of the same
 * file (or in any supplied reference text the reviewer is allowed to hold).
 *
 * Comments are stripped and identifiers, numbers, strings and punctuation are
 * compared as k-token shingles. High containment flags carried-over text for
 * human review; low containment is consistent with a rewrite but cannot prove
 * independent authorship, since shared public API declarations and standard
 * formulas legitimately overlap. Nothing is fetched: the reference is a local
 * Git revision or a supplied file.
 *
 * CLI: node --experimental-strip-types tools/native-runtime-audit/revision-similarity.ts <file> <git-revision> [k]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface RevisionSimilarity {
  readonly schema: "aura3d.revision-similarity/1";
  readonly shingleTokens: number;
  readonly currentShingles: number;
  readonly referenceShingles: number;
  /** Fraction of current shingles that also occur in the reference (0..1). */
  readonly containment: number;
  /** Longest run of consecutive current tokens copied from the reference. */
  readonly longestSharedRun: number;
}

/** Tokenize source text, dropping comments and whitespace. */
export function sourceTokens(text: string): string[] {
  const tokens: string[] = [];
  const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|\d[\w.]*|\S/g;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (token.startsWith("//") || token.startsWith("/*")) continue;
    tokens.push(token);
  }
  return tokens;
}

export function revisionSimilarity(current: string, reference: string, shingleTokens = 8): RevisionSimilarity {
  if (!Number.isSafeInteger(shingleTokens) || shingleTokens < 2 || shingleTokens > 64) throw new RangeError("shingleTokens must be an integer from 2 through 64");
  const a = sourceTokens(current), b = sourceTokens(reference);
  const shingles = (tokens: readonly string[]): string[] => {
    const out: string[] = [];
    for (let i = 0; i + shingleTokens <= tokens.length; i += 1) out.push(tokens.slice(i, i + shingleTokens).join("\u0000"));
    return out;
  };
  const currentShingles = shingles(a);
  const referenceSet = new Set(shingles(b));
  let shared = 0, run = 0, longest = 0;
  for (const shingle of currentShingles) {
    if (referenceSet.has(shingle)) {
      shared += 1;
      run += 1;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  return {
    schema: "aura3d.revision-similarity/1",
    shingleTokens,
    currentShingles: currentShingles.length,
    referenceShingles: referenceSet.size,
    containment: currentShingles.length ? shared / currentShingles.length : 0,
    longestSharedRun: longest ? longest + shingleTokens - 1 : 0
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [file, revision, k] = process.argv.slice(2);
  if (!file || !revision) throw new Error("usage: revision-similarity.ts <file> <git-revision> [k]");
  const reference = execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const result = revisionSimilarity(readFileSync(file, "utf8"), reference, k === undefined ? 8 : Number(k));
  process.stdout.write(`${JSON.stringify({ file, revision, ...result })}\n`);
}
