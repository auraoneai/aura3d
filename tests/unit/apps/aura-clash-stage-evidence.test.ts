import { describe, expect, it } from "vitest";
import {
  auraClashArenaStageElements,
  collectAuraClashArenaStageEvidence
} from "../../../apps/aura-clash-showcase/src/playable/arena/AuraClashArenaStage";

/**
 * Regression coverage for defect 48.
 *
 * `collectAuraClashArenaStageEvidence` previously computed `missingElementIds` by comparing
 * `auraClashArenaStageElements` against `auraClashRenderedStageLabels` -- two hardcoded lists in
 * the same source tree. A declared element with zero geometry therefore reported
 * `evidenceBacked: true`. Five of the ten declared elements were in exactly that state
 * (`portal-segments`, `typed-arena-environment`, `side-banners`, `light-pillars`,
 * `atmospheric-motes`), because the renderer emits indexed/side-specific labels such as
 * `portal-segment-0` and `left-banner` rather than the collective names that were declared.
 *
 * Evidence must now be derived from render labels a frame actually submitted.
 */
const stubRoot = { querySelector: () => null } as unknown as ParentNode;

describe("Aura Clash arena stage evidence is derived from rendered items", () => {
  it("is not evidence-backed when no frame has been observed", () => {
    const evidence = collectAuraClashArenaStageEvidence(stubRoot);
    expect(evidence.evidenceBacked).toBe(false);
    expect(evidence.evidenceSource).toBe("declared-only");
    expect(evidence.observedRenderLabelCount).toBe(0);
    // Nothing is proven, so nothing may be reported as present.
    expect(evidence.missingElementIds).toEqual(auraClashArenaStageElements.map((entry) => entry.id));
  });

  /*
   * Defect 58 replaced the void-authored `side-banners` / `light-pillars` / `portal-segments` elements
   * with grounded `stage-practicals`, so this control now withholds the element that exists.
   */
  it("is not evidence-backed when a declared element emits no geometry", () => {
    const labels = auraClashArenaStageElements
      .filter((entry) => entry.id !== "stage-practicals")
      .map((entry) => `aura-clash-rendered-stage:${entry.renderLabel}0`);
    const evidence = collectAuraClashArenaStageEvidence(stubRoot, labels);
    expect(evidence.evidenceSource).toBe("observed-render-items");
    expect(evidence.missingElementIds).toContain("stage-practicals");
    expect(evidence.evidenceBacked).toBe(false);
  });

  it("is evidence-backed only when every declared element has an observed render label", () => {
    const labels = auraClashArenaStageElements.map((entry) => `aura-clash-rendered-stage:${entry.renderLabel}0`);
    const evidence = collectAuraClashArenaStageEvidence(stubRoot, labels);
    expect(evidence.missingElementIds).toEqual([]);
    expect(evidence.evidenceBacked).toBe(true);
    expect(evidence.observedRenderLabelCount).toBeGreaterThan(0);
  });

  it("never reports DOM-authored scene elements", () => {
    const evidence = collectAuraClashArenaStageEvidence(stubRoot, ["aura-clash-rendered-stage:combat-floor"]);
    expect(evidence.domSceneElementCount).toBe(0);
    expect(evidence.rendererOwner).toBe("production-runtime");
  });
});
