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
 * The one legitimate owner, plus the exception this test exists to hold visible.
 */
const LEGITIMATE_CONTEXT_OWNERS: Readonly<Record<string, string>> = {
  "packages/audio/src/AudioContextManager.ts":
    "THE owner. Every other consumer receives a context from here or is handed one explicitly; `createContext` exists so a caller can inject its own rather than construct a second.",
  "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts":
    "KNOWN VIOLATION, retained deliberately and tracked. This route imports createGameAudio and ALSO hand-rolls createAudioRuntime() with its own raw AudioContext, buffer cache and fetch loop. Fixing it is P5 route work (WS-5.3), not P3 library work: the route is one of the reported-defect set and must be rebuilt through the shared runtime rather than patched here, per R3."
};

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
        if (!CONSTRUCT_PATTERN.test(readFileSync(file, "utf8"))) continue;
        if (LEGITIMATE_CONTEXT_OWNERS[relative] === undefined) offenders.push(relative);
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

  it("records the aura-clash violation as a P5 obligation rather than closing over it", () => {
    /*
     * Deliberately asserted, so the exception cannot quietly become permanent. If someone fixes the route,
     * this test fails and forces the allowlist entry to be removed — which is the outcome we want. If nobody
     * does, the entry stays visible in a passing test rather than dissolving into a TODO.
     */
    const justification = LEGITIMATE_CONTEXT_OWNERS["apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts"];
    expect(justification).toContain("KNOWN VIOLATION");
    expect(justification).toContain("WS-5.3");
    const source = readFileSync(join(ROOT, "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts"), "utf8");
    // It imports the shared runtime AND hand-rolls its own: that combination is the violation.
    expect(source).toContain("createGameAudio");
    expect(source).toContain("createAudioRuntime");
  });
});
