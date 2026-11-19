/**
 * PRD-09 1734 pre-flight: every route cue map must already satisfy the C-25
 * rule — each cue carries `asset` (typed, with a `url`) or a `play` callback —
 * BEFORE `GameAudio`'s adapter throws on the default-synth path.
 *
 * The route manifests this file imported (aurora-lander, bank-shot,
 * blockfall-reactor, vault-breakers, aura-clash) were deleted with their apps;
 * the template guard below remains.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

describe("route/template cue maps satisfy C-25 (PRD-09 1734)", () => {
  it("no create-aura3d template ships an audio cue map", () => {
    const templatesDir = join(ROOT, "packages/create-aura3d/templates");
    const cueMapFiles = readdirSync(templatesDir, { recursive: true })
      .map(String)
      .filter((p) => /audio|cue.?map/i.test(p));
    expect(cueMapFiles).toEqual([]);
  });
});
