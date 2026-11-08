import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../../examples/shared/runner-kit/index";
import { HUD_PAIRS, auditHudContrast } from "../../../apps/showcase-number-surge/src/hud";

describe("number-surge HUD contrast", () => {
  it("every ink/paper pair meets WCAG AA (≥ 4.5:1)", () => {
    const results = auditHudContrast();
    expect(results).toHaveLength(HUD_PAIRS.length);
    for (const r of results) {
      expect(r.ratio, `${r.name} contrast ${r.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the audit uses the kit's WCAG ratio", () => {
    for (const p of HUD_PAIRS) {
      expect(contrastRatio(p.ink, p.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.ink, p.paper)).toBeCloseTo(contrastRatio(p.paper, p.ink), 10);
    }
  });
});