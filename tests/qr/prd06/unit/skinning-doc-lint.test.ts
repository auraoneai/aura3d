/**
 * T4.7 — docs/rendering/skinning-and-morphs.md certification wording lint:
 * "changed px" pixel counts are not a certification criterion; certification
 * is §17.3 motion-quality metrics (continuity C, foot slide, shadow IoU,
 * tracksApplied precondition).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC = resolve(__dirname, "../../../../docs/rendering/skinning-and-morphs.md");

describe("T4.7 skinning-and-morphs certification doc", () => {
  const text = readFileSync(DOC, "utf8");

  it("uses no 'changed px' certification criterion", () => {
    expect(text).not.toMatch(/changed px/i);
    expect(text).not.toMatch(/Certified \d{4}-\d{2}-\d{2}/);
  });

  it("grounds certification in §17.3 metrics, not pixel diffs", () => {
    expect(text).toMatch(/17\.3/);
    expect(text).toMatch(/continuity/i);
    expect(text).toMatch(/foot slide/i);
    expect(text).toMatch(/tracksApplied/);
    expect(text).toMatch(/MotionMetrics/);
  });
});
