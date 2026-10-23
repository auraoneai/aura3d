import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WS-3.2 — the stated proof: **one `AudioContext` owner.**
 *
 * Constructing a second `AudioContext` is not a style problem. Browsers cap the number of live contexts
 * (Chrome around six per page), each carries its own clock, and cues scheduled on one cannot be mixed,
 * ducked or muted with cues on another. So "one owner" is a correctness property: a mute button that only
 * silences one context is a bug a screenshot cannot reveal.
 */

const ROOT = process.cwd();
const CONSTRUCT_PATTERN = /new\s+AudioContext\s*\(|new\s+AudioCtor\s*\(|webkitAudioContext/;

/**
 * The one legitimate owner.
 */
const LEGITIMATE_CONTEXT_OWNERS: Readonly<Record<string, string>> = {
  "packages/audio/src/AudioContextManager.ts":
    "THE owner. Every other consumer receives a context from here or is handed one explicitly; `createContext` exists so a caller can inject its own rather than construct a second."
};

/**
 * Files that mention the construct as text but never construct a context. The codemod rewrites
 * `new AudioContext(` in user source, so the pattern appears in its comment and report strings.
 */
const REFERENCE_ONLY_FILES: Readonly<Record<string, string>> = {
  "packages/aura3d-cli/src/commands/prd09/codemods/audio-wrapper.ts":
    "Codemod that rewrites user source; it names `new AudioContext(` only in a doc comment and a report-row string."
};

/** True when every matching line is a comment line or the match sits inside a quoted string. */
function isTextOnlyReference(source: string): boolean {
  return source.split("\n").every((line) => {
    if (!CONSTRUCT_PATTERN.test(line)) return true;
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return true;
    const quoted = /(["'`])(?:(?!\1).)*?(?:new\s+AudioContext\s*\(|new\s+AudioCtor\s*\(|webkitAudioContext)(?:(?!\1).)*?\1/;
    return quoted.test(line) && !CONSTRUCT_PATTERN.test(line.replace(quoted, ""));
  });
}

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist" || entry === "tests") continue;
    const child = join(directory, entry);
    if (statSync(child).isDirectory()) walk(child, out);
    else if (/\.tsx?$/.test(entry)) out.push(child);
  }
  return out;
}

describe("AudioContext ownership (WS-3.2)", () => {
  it("only enumerated owners construct an AudioContext", () => {
    const offenders: string[] = [];
    for (const root of ["packages", "apps", "examples"]) {
      const directory = join(ROOT, root);
      for (const file of walk(directory)) {
        const relative = file.slice(ROOT.length + 1);
        const source = readFileSync(file, "utf8");
        if (!CONSTRUCT_PATTERN.test(source)) continue;
        if (LEGITIMATE_CONTEXT_OWNERS[relative] !== undefined) continue;
        if (REFERENCE_ONLY_FILES[relative] !== undefined && isTextOnlyReference(source)) continue;
        offenders.push(relative);
      }
    }
    expect(
      offenders,
      "a new AudioContext must come from AudioContextManager, or be injected. Browsers cap live contexts and cues on separate contexts cannot be mixed or muted together."
    ).toEqual([]);
  });

  it("every enumerated owner still constructs one, so the list cannot rot", () => {
    for (const [relative, justification] of Object.entries(LEGITIMATE_CONTEXT_OWNERS)) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      expect(CONSTRUCT_PATTERN.test(source), `${relative} no longer constructs an AudioContext; remove its entry`).toBe(true);
      expect(justification.length, `${relative} needs a real justification`).toBeGreaterThan(40);
    }
  });

  it("reference-only files still only mention the construct as text", () => {
    for (const [relative, justification] of Object.entries(REFERENCE_ONLY_FILES)) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      expect(isTextOnlyReference(source), `${relative} now constructs an AudioContext; route it through AudioContextManager`).toBe(true);
      expect(justification.length, `${relative} needs a real justification`).toBeGreaterThan(40);
    }
  });

  it("keeps Aura Clash on the shared browser-context owner", () => {
    const source = readFileSync(join(ROOT, "apps/aura-clash-showcase/src/legacy/playable/AuraClashArenaApp.ts"), "utf8");
    // invariant: source must keep `browserContext: true` — only enumerated owners construct an AudioContext
    expect(source).toContain("browserContext: true");
    expect(source).not.toMatch(CONSTRUCT_PATTERN);
  });
});
