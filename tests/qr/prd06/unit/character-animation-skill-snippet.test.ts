/**
 * PRD-06 T0.16 — the C-40 reference snippet `fixtures/skill-snippet.ts`
 * compiles against `@aura3d/engine` public types (tsconfig.build.json covers
 * `tests/qr/**`), only ever passes clip names that exist in
 * `assets.hero.metadata.animations`, and contains no `poseBakedFallback` /
 * `applyPose` in its code.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assets } from "../fixtures/aura-assets";

const SNIPPET_PATH = new URL("../fixtures/skill-snippet.ts", import.meta.url);

function snippetCode(): string {
  return readFileSync(SNIPPET_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/** Clip-name string literals the snippet hands to the engine. */
function clipLiterals(code: string): readonly string[] {
  const literals: string[] = [];
  const captureQuotedList = (body: string) => {
    for (const m of body.matchAll(/"([^"]+)"/g)) literals.push(m[1]!);
  };
  for (const m of code.matchAll(/requiredClips:\s*\[([^\]]*)\]/g)) captureQuotedList(m[1]!);
  for (const m of code.matchAll(/defaultClipId:\s*"([^"]+)"/g)) literals.push(m[1]!);
  for (const m of code.matchAll(/\.(?:play|crossFade|queue|fadeTo)\(\s*"([^"]+)"/g)) literals.push(m[1]!);
  return literals;
}

describe("character-animation skill snippet (T0.16, C-40)", () => {
  it("every clip name it passes exists in assets.hero.metadata.animations", () => {
    const known = new Set(assets.hero.metadata.animations as readonly string[]);
    expect(known).toEqual(new Set(["Idle", "Walk", "Run"]));
    const literals = clipLiterals(snippetCode());
    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) {
      expect(known.has(literal), `clip literal "${literal}" must exist on assets.hero.metadata.animations`).toBe(true);
    }
  });

  it("contains no poseBakedFallback and no applyPose", () => {
    const code = snippetCode();
    expect(code).not.toContain("poseBakedFallback");
    expect(code).not.toContain("applyPose");
  });

  it("uses only the @aura3d/engine public surface the skill teaches", () => {
    const code = snippetCode();
    // Clip drive via bindRuntimeNode + defaultClipId (F-06-01), strict app
    // animation options (F-06-03), clip names from metadata.animations
    // (F-06-02) — the three import/option shapes that must stay public.
    expect(code).toContain("bindRuntimeNode");
    expect(code).toContain("defaultClipId");
    expect(code).toContain("metadata.animations");
    expect(code).toMatch(/animation:\s*\{[^}]*strict:\s*true/s);
  });
});
