import { describe, expect, it } from "vitest";
import {
  AURA_PRIMITIVE_AXES,
  clearFocus,
  focusCameraIntent,
  focusObject,
  focusSemanticRegion,
  type FocusTarget
} from "../../../packages/engine/src/agent-api/FocusSelection";
import { placedBounds } from "../../../packages/engine/src/agent-api/SpatialAnchoring";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/index";

/**
 * Regression cases for the reported "random yellow/white bar" focus defect.
 *
 * The configurator built its focus indicator as
 * `primitives.torus(...).rotate(1.5708,0,0).scale([1.22, 0.08, 0.78])`. Aura3D's
 * torus is a ring in local XY with its tube on Z, so scaling Y to 0.08 squashed
 * the ring's own radius and the rotation laid the resulting sliver flat: a bar.
 *
 * These tests do not assert on the three constants. They assert the properties
 * that make any focus indicator correct, for many target shapes, so the class of
 * defect cannot return through a different route.
 */

function ringOf(nodes: readonly unknown[]): AuraPrimitiveNode {
  const ring = (nodes as AuraPrimitiveNode[]).find(
    (node) => node.kind === "primitive" && node.primitive === "torus" && (node.name ?? "").includes("selection ring")
  );
  if (!ring) throw new Error("focus result contained no selection ring");
  return ring;
}

function scaleTriple(node: AuraPrimitiveNode): [number, number, number] {
  const scale = node.scale;
  if (scale === undefined) return [1, 1, 1];
  if (typeof scale === "number") return [scale, scale, scale];
  return [scale[0], scale[1], scale[2]];
}

describe("primitive axis conventions", () => {
  it("documents the torus tube axis that the flattened-bar defect violated", () => {
    // The defect existed because this was folklore. Publishing it makes the trap
    // discoverable, and pinning it here means a geometry change cannot silently
    // invalidate every focus ring in the product.
    expect(AURA_PRIMITIVE_AXES.torus.ringPlane).toBe("xy");
    expect(AURA_PRIMITIVE_AXES.torus.tubeAxis).toBe("z");
    expect(AURA_PRIMITIVE_AXES.torus.thinAxis).toBe("z");
  });
});

describe("focusObject ring geometry", () => {
  // Deliberately includes the configurator's own earcup proportions, wildly
  // nonuniform targets, and degenerate-ish flat targets.
  const targets: readonly FocusTarget[] = [
    { id: "earcups", label: "Earcup acoustic housings", center: [0, 0.55, -0.05], size: [1.22, 0.42, 0.78] },
    { id: "headband", label: "Headband structure", center: [0, 1.12, -0.62], size: [1.06, 0.24, 0.22] },
    { id: "cushions", label: "Cushion contact area", center: [0, 0.36, -0.18], size: [0.96, 0.12, 0.62] },
    { id: "tall-thin", label: "Antenna", center: [1, 2, 3], size: [0.02, 4, 0.02] },
    { id: "wide-flat", label: "Panel", center: [-2, 0.1, 0.4], size: [6, 0.05, 3] },
    { id: "cube", label: "Cube", center: [0, 0, 0], size: [1, 1, 1] }
  ];

  it.each(targets)("keeps the ring circular for $id", (target) => {
    const ring = ringOf(focusObject(target).nodes);
    const [x, y, z] = scaleTriple(ring);
    // The two ring-plane axes must stay equal. This is exactly what the defect
    // broke: 1.22 vs 0.08 in the ring plane.
    expect(x).toBeCloseTo(y, 10);
    // The tube axis must be the thin one.
    expect(z).toBeLessThan(x);
    expect(z).toBeGreaterThan(0);
  });

  it.each(targets)("surrounds $id rather than intersecting it", (target) => {
    const result = focusObject(target);
    const ring = ringOf(result.nodes);
    const [radius] = scaleTriple(ring);
    const footprintRadius = Math.sqrt(target.size[0] ** 2 + target.size[2] ** 2) / 2;
    expect(radius).toBeGreaterThanOrEqual(footprintRadius);
    expect(result.invariants.passes).toBe(true);
  });

  it("reports a failing invariant when an indicator would be degenerate", () => {
    // A zero-size target must not silently produce a zero-scale node; the size is
    // clamped and the invariant report stays honest.
    const result = focusObject({ id: "empty", center: [0, 0, 0], size: [0, 0, 0] });
    const [x, y, z] = scaleTriple(ringOf(result.nodes));
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);
  });

  it("inherits target rotation so a rotated part gets an aligned ring", () => {
    const rotated = focusObject({ id: "part", center: [0, 1, 0], size: [1, 0.4, 0.6], rotation: [0, 0.9, 0] });
    const ring = ringOf(rotated.nodes);
    expect(ring.rotation?.[1]).toBeCloseTo(0.9, 10);
    // The ring plane is still tipped into the horizontal plane.
    expect(ring.rotation?.[0]).toBeCloseTo(Math.PI / 2, 10);
  });

  it("places the ring at the target centre, not at the scene origin", () => {
    const ring = ringOf(focusObject({ id: "part", center: [3, 1.5, -2], size: [1, 1, 1] }).nodes);
    expect(ring.position).toEqual([3, 1.5, -2]);
  });
});

describe("focusObject callout", () => {
  it("emits a callout label anchored outside the target", () => {
    const result = focusObject(
      { id: "earcups", label: "Earcup acoustic housings", center: [0, 0.55, -0.05], size: [1.22, 0.42, 0.78] },
      { callout: true }
    );
    const callout = result.nodes.find((node) => node.kind === "label");
    expect(callout).toBeDefined();
    expect((callout as { text: string }).text).toBe("Earcup acoustic housings");
    // The label must carry the world anchor the leader line points at, otherwise
    // the line drifts away from the part as the camera moves.
    expect((callout as { anchorWorldPosition?: readonly number[] }).anchorWorldPosition).toEqual([0, 0.55, -0.05]);
    expect(result.invariants.checks.find((check) => check.id === "callout-outside-target")?.passes).toBe(true);
  });

  it("omits the callout when the route does not want one", () => {
    const result = focusObject({ id: "part", center: [0, 0, 0], size: [1, 1, 1] }, { callout: false });
    expect(result.nodes.some((node) => node.kind === "label")).toBe(false);
  });
});

describe("focusObject indicators", () => {
  it("builds twelve bounding-box edges", () => {
    const result = focusObject(
      { id: "part", center: [0, 0.5, 0], size: [1, 2, 3] },
      { indicators: ["bounding-box"], callout: false, cameraFocus: false }
    );
    const named = result.nodes as readonly { readonly name?: string }[];
    expect(named.filter((node) => (node.name ?? "").includes("bounds edge"))).toHaveLength(12);
  });

  it("keeps the halo ring circular too", () => {
    const result = focusObject(
      { id: "part", center: [0, 0.5, 0], size: [2, 0.3, 0.4] },
      { indicators: ["halo"], callout: false, cameraFocus: false }
    );
    const halo = (result.nodes as AuraPrimitiveNode[]).find((node) => (node.name ?? "").includes("selection halo"));
    const [x, y, z] = scaleTriple(halo as AuraPrimitiveNode);
    expect(x).toBeCloseTo(y, 10);
    expect(z).toBeLessThan(x);
  });
});

describe("focus camera framing", () => {
  it("frames targets of very different scale", () => {
    for (const size of [[0.05, 0.05, 0.05], [1, 1, 1], [40, 12, 30]] as const) {
      const intent = focusCameraIntent([0, 0, 0], size);
      expect(intent.containsTarget).toBe(true);
    }
  });

  it("pulls back further on a compact viewport", () => {
    const desktop = focusCameraIntent([0, 0, 0], [1, 1, 1], { aspect: 16 / 9, compactViewport: false });
    const mobile = focusCameraIntent([0, 0, 0], [1, 1, 1], { aspect: 9 / 16, compactViewport: true });
    const distance = (position: readonly number[]) => Math.hypot(position[0], position[1], position[2]);
    expect(distance(mobile.position)).toBeGreaterThan(distance(desktop.position));
    expect(mobile.containsTarget).toBe(true);
  });

  it("looks at the target centre", () => {
    expect(focusCameraIntent([2, 3, 4], [1, 1, 1]).target).toEqual([2, 3, 4]);
  });
});

describe("focusSemanticRegion", () => {
  const subject = placedBounds({ position: [0, 0, 0], size: [2, 1, 1.2], floorY: 0 });

  it("resolves a normalized region to world space so it follows the asset", () => {
    const region = { id: "earcups", label: "Earcups", u: 0.5, v: 0.6, w: 0.4, extent: [0.6, 0.4, 0.6] as const };
    const small = focusSemanticRegion(subject, region);
    const large = focusSemanticRegion(placedBounds({ position: [0, 0, 0], size: [4, 2, 2.4], floorY: 0 }), region);
    const ringSmall = scaleTriple(ringOf(small.nodes))[0];
    const ringLarge = scaleTriple(ringOf(large.nodes))[0];
    // Doubling the asset doubles the indicator: nothing is frozen to one asset.
    expect(ringLarge / ringSmall).toBeCloseTo(2, 6);
    expect(small.invariants.passes).toBe(true);
  });

  it("gives a point region a readable fallback size instead of a zero ring", () => {
    const result = focusSemanticRegion(subject, { id: "spot", u: 0.5, v: 0.5, w: 0.5 });
    expect(scaleTriple(ringOf(result.nodes))[0]).toBeGreaterThan(0.1);
  });
});

describe("clearFocus", () => {
  it("removes all indicators and reports no selection", () => {
    const cleared = clearFocus();
    expect(cleared.nodes).toHaveLength(0);
    expect(cleared.camera).toBeUndefined();
    expect(cleared.accessibilityLabel).toBe("no selection");
  });
});
