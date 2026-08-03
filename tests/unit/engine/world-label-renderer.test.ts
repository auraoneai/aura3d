import { describe, expect, it } from "vitest";
import {
  ndcToScreen,
  projectWorldLabels,
  projectWorldPoint,
  resolveLabelCollisions,
  type WorldLabel
} from "../../../packages/engine/src/agent-api/WorldLabelRenderer";

/**
 * Regression cases for the missing-callout defect.
 *
 * `labels.callout(...)` produced a valid node, evidence counted it, and nothing
 * drew it: label rendering lived only in the canvas2d fallback while every public
 * route with a typed GLB takes the production WebGL2 path. The API was implemented
 * in the wrong render path.
 *
 * These tests cover the projection layer that replaces it. They assert placement
 * arithmetically -- a label lands where its anchor projects, tracks a moving
 * camera, and applies a documented offscreen policy -- so label correctness is
 * provable without a screenshot.
 */

/** Column-major view-projection for a camera looking down -Z from `eye`. */
function lookDownNegativeZ(eyeZ: number, fovDegrees = 45, aspect = 1): Float32Array {
  const f = 1 / Math.tan((fovDegrees * Math.PI) / 360);
  const near = 0.1;
  const far = 100;
  const nf = 1 / (near - far);
  // Projection (column-major).
  const p = new Float32Array(16);
  p[0] = f / aspect;
  p[5] = f;
  p[10] = (far + near) * nf;
  p[11] = -1;
  p[14] = 2 * far * near * nf;
  // View: translate by -eye along Z.
  const v = new Float32Array(16);
  v[0] = 1; v[5] = 1; v[10] = 1; v[15] = 1;
  v[14] = -eyeZ;
  // p * v, column-major.
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += (p[k * 4 + row] as number) * (v[col * 4 + k] as number);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

const VIEWPORT = { width: 800, height: 600 };

describe("projectWorldPoint", () => {
  it("puts a point on the view axis at the centre of the screen", () => {
    const vp = lookDownNegativeZ(5);
    const projected = projectWorldPoint(vp, [0, 0, 0]);
    expect(projected.w).toBeGreaterThan(0);
    const [x, y] = ndcToScreen(projected.ndc, VIEWPORT);
    expect(x).toBeCloseTo(400, 6);
    expect(y).toBeCloseTo(300, 6);
  });

  it("reports a non-positive w for points behind the camera", () => {
    // The camera sits at z = 5 looking toward -Z, so z = 10 is behind it.
    expect(projectWorldPoint(lookDownNegativeZ(5), [0, 0, 10]).w).toBeLessThanOrEqual(0);
  });

  it("moves a point right when it is to the camera's right", () => {
    const [x] = ndcToScreen(projectWorldPoint(lookDownNegativeZ(5), [1, 0, 0]).ndc, VIEWPORT);
    expect(x).toBeGreaterThan(400);
  });
});

describe("projectWorldLabels", () => {
  const label: WorldLabel = { id: "callout", text: "Earcups", anchor: [0, 0, 0], leader: true };

  it("places a label at its projected anchor plus the requested screen offset", () => {
    const [projected] = projectWorldLabels([label], lookDownNegativeZ(5), VIEWPORT);
    expect(projected.visible).toBe(true);
    expect(projected.anchorX).toBeCloseTo(400, 4);
    expect(projected.anchorY).toBeCloseTo(300, 4);
    // Default offset lifts the box above the anchor so the leader line is visible.
    expect(projected.y).toBeLessThan(projected.anchorY);
  });

  it("tracks the anchor when the camera moves", () => {
    const near = projectWorldLabels([{ ...label, anchor: [1, 0, 0] }], lookDownNegativeZ(3), VIEWPORT)[0];
    const far = projectWorldLabels([{ ...label, anchor: [1, 0, 0] }], lookDownNegativeZ(12), VIEWPORT)[0];
    // Same world anchor, different camera distance: the label must move on screen.
    expect(near.anchorX).not.toBeCloseTo(far.anchorX, 1);
    // Pulling back moves the off-axis anchor toward the screen centre.
    expect(Math.abs(far.anchorX - 400)).toBeLessThan(Math.abs(near.anchorX - 400));
  });

  it("hides a label whose anchor is behind the camera", () => {
    const [projected] = projectWorldLabels([{ ...label, anchor: [0, 0, 20] }], lookDownNegativeZ(5), VIEWPORT);
    expect(projected.behindCamera).toBe(true);
    expect(projected.visible).toBe(false);
  });

  it("applies the documented offscreen policies", () => {
    const offscreen: WorldLabel = { ...label, anchor: [40, 0, 0] };
    const clamped = projectWorldLabels([{ ...offscreen, offscreenPolicy: "clamp" }], lookDownNegativeZ(5), VIEWPORT)[0];
    expect(clamped.visible).toBe(true);
    expect(clamped.clamped).toBe(true);
    expect(clamped.x).toBeLessThanOrEqual(VIEWPORT.width);

    const hidden = projectWorldLabels([{ ...offscreen, offscreenPolicy: "hide" }], lookDownNegativeZ(5), VIEWPORT)[0];
    expect(hidden.visible).toBe(false);

    const drawn = projectWorldLabels([{ ...offscreen, offscreenPolicy: "draw" }], lookDownNegativeZ(5), VIEWPORT)[0];
    expect(drawn.visible).toBe(true);
    expect(drawn.clamped).toBe(false);
    expect(drawn.x).toBeGreaterThan(VIEWPORT.width);
  });

  it("projects the leader endpoint separately from the label box", () => {
    const [projected] = projectWorldLabels(
      [{ id: "callout", text: "Part", anchor: [2, 0, 0], leaderAnchor: [0, 0, 0], leader: true, screenOffset: [0, 0] }],
      lookDownNegativeZ(5),
      VIEWPORT
    );
    // The box follows `anchor`; the leader points at `leaderAnchor`.
    expect(projected.x).toBeGreaterThan(400);
    expect(projected.anchorX).toBeCloseTo(400, 4);
  });

  it("shrinks type on a compact viewport but keeps it legible", () => {
    const desktop = projectWorldLabels([label], lookDownNegativeZ(5), { width: 1200, height: 800 })[0];
    const mobile = projectWorldLabels([label], lookDownNegativeZ(5), { width: 390, height: 780, compact: true })[0];
    expect(mobile.fontSize).toBeLessThan(desktop.fontSize);
    expect(mobile.fontSize).toBeGreaterThanOrEqual(11);
  });

  it("places screen-anchored HUD labels without projecting them", () => {
    const [projected] = projectWorldLabels(
      [{ id: "hud", text: "Score 0", anchor: [999, 999, 999], screenAnchor: "top-left" }],
      lookDownNegativeZ(5),
      VIEWPORT
    );
    expect(projected.visible).toBe(true);
    expect(projected.behindCamera).toBe(false);
    expect(projected.x).toBeLessThan(VIEWPORT.width / 2);
    expect(projected.y).toBeLessThan(VIEWPORT.height / 2);
  });
});

describe("resolveLabelCollisions", () => {
  it("separates overlapping labels so both stay readable", () => {
    const labels: readonly WorldLabel[] = [
      { id: "a", text: "Assembly zone", anchor: [0, 0, 0] },
      { id: "b", text: "Assembly zone", anchor: [0, 0.02, 0] }
    ];
    const projected = projectWorldLabels(labels, lookDownNegativeZ(5), VIEWPORT);
    const resolved = resolveLabelCollisions(projected);
    const [a, b] = resolved;
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(a.fontSize);
  });

  it("preserves the caller's ordering and ids", () => {
    const labels: readonly WorldLabel[] = [
      { id: "first", text: "One", anchor: [0, 0, 0] },
      { id: "second", text: "Two", anchor: [0, 0.01, 0] },
      { id: "third", text: "Three", anchor: [0, 0.02, 0] }
    ];
    const resolved = resolveLabelCollisions(projectWorldLabels(labels, lookDownNegativeZ(5), VIEWPORT));
    expect(resolved.map((label) => label.id)).toEqual(["first", "second", "third"]);
  });

  it("leaves well-separated labels untouched", () => {
    const labels: readonly WorldLabel[] = [
      { id: "a", text: "Left", anchor: [-2, 0, 0] },
      { id: "b", text: "Right", anchor: [2, 0, 0] }
    ];
    const projected = projectWorldLabels(labels, lookDownNegativeZ(5), VIEWPORT);
    const resolved = resolveLabelCollisions(projected);
    expect(resolved[0].y).toBe(projected[0].y);
    expect(resolved[1].y).toBe(projected[1].y);
  });
});
