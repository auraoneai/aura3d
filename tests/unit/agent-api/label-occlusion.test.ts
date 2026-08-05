import { describe, expect, it } from "vitest";
import { projectWorldLabels, type LabelOcclusionTest, type WorldLabel } from "../../../packages/engine/src";

/**
 * WS-2.7 — occlusion-aware annotations.
 *
 * The gap this closes was not "no occlusion code". It was that `occlusionAware` **defaulted to true** on
 * every `labels.billboard()`, `labels.anchor()` and `labels.axisTick()`, was accepted by
 * `AuraLabelOptions`, was set explicitly by `FocusSelection` — and was never read. `WorldLabel` had no
 * field for it, so the renderer had nothing to act on. A developer reading the API saw occlusion-aware
 * labels on by default; a developer watching the screen saw labels drawn through walls.
 *
 * A declared capability that quietly does nothing is the same defect shape as the P1 fabrications and the
 * WS-2.5 gradient, which is why the assertions below are about *behaviour under a known occluder* rather
 * than about the option being present.
 */

/** Identity view-projection: NDC == world, so a point at (0,0,0) lands mid-viewport. */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const VIEWPORT = { width: 400, height: 300 } as const;

function label(overrides: Partial<WorldLabel> = {}): WorldLabel {
  return {
    id: "callout",
    text: "Rear axle",
    anchor: [0, 0, 0],
    ...overrides
  };
}

describe("label occlusion (WS-2.7)", () => {
  it("dims a label whose subject is occluded, and reports it", () => {
    const occludeEverything: LabelOcclusionTest = () => true;
    const [projected] = projectWorldLabels([label()], IDENTITY, VIEWPORT, occludeEverything);
    expect(projected!.occluded).toBe(true);
    // Dim rather than hide by default: an annotation that vanishes is usually worse than one behind glass.
    expect(projected!.visible).toBe(true);
    expect(projected!.occlusionOpacity).toBeLessThan(1);
    expect(projected!.occlusionOpacity).toBeGreaterThan(0);
  });

  it("leaves an unoccluded label at full strength", () => {
    const occludeNothing: LabelOcclusionTest = () => false;
    const [projected] = projectWorldLabels([label()], IDENTITY, VIEWPORT, occludeNothing);
    expect(projected!.occluded).toBe(false);
    expect(projected!.occlusionOpacity).toBe(1);
    expect(projected!.visible).toBe(true);
  });

  it("hides rather than dims when the label asks for it", () => {
    const [projected] = projectWorldLabels(
      [label({ occlusionPolicy: "hide" })],
      IDENTITY,
      VIEWPORT,
      () => true
    );
    expect(projected!.occluded).toBe(true);
    expect(projected!.visible).toBe(false);
  });

  it("respects occlusionAware: false", () => {
    const [projected] = projectWorldLabels(
      [label({ occlusionAware: false })],
      IDENTITY,
      VIEWPORT,
      () => true
    );
    expect(projected!.occluded).toBe(false);
    expect(projected!.occlusionOpacity).toBe(1);
  });

  it("never occludes when no test is supplied", () => {
    /*
     * Absence of an occlusion signal is not evidence of occlusion. Guessing pessimistically would hide
     * labels whenever the test was unavailable — the silent-wrong-result shape this phase removes.
     */
    const [projected] = projectWorldLabels([label()], IDENTITY, VIEWPORT);
    expect(projected!.occluded).toBe(false);
    expect(projected!.occlusionOpacity).toBe(1);
  });

  it("tests the leader anchor, not the label box", () => {
    /*
     * A callout box is deliberately offset beside its subject and often sits over empty space. Testing
     * there would ask about the background rather than about the thing being annotated.
     */
    const seen: (readonly [number, number, number])[] = [];
    projectWorldLabels(
      [label({ anchor: [3, 3, 0], leaderAnchor: [0, 0, 0] })],
      IDENTITY,
      VIEWPORT,
      (anchor) => {
        seen.push(anchor);
        return false;
      }
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([0, 0, 0]);
  });

  it("does not test a label behind the camera, which is already hidden for a stronger reason", () => {
    let called = 0;
    const [projected] = projectWorldLabels(
      // w <= 0 under a projection that flips w; simplest is a label already marked hidden.
      [label({ anchor: [0, 0, 0], hideWhenBehindCamera: true })],
      // A matrix whose last row negates w puts the point behind the camera.
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1],
      VIEWPORT,
      () => {
        called += 1;
        return true;
      }
    );
    expect(projected!.behindCamera).toBe(true);
    expect(projected!.visible).toBe(false);
    expect(called, "no point testing occlusion for a label the viewer cannot see at all").toBe(0);
  });

  it("keeps HUD labels in front of everything", () => {
    const [projected] = projectWorldLabels(
      [label({ screenAnchor: "top-left" })],
      IDENTITY,
      VIEWPORT,
      () => true
    );
    expect(projected!.occluded).toBe(false);
    expect(projected!.occlusionOpacity).toBe(1);
  });
});
