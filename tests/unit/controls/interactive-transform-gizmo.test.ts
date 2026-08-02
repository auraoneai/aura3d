import { Ray, Vector3 } from "@aura3d/math";
import { describe, expect, it } from "vitest";
import { InteractiveTransformGizmo } from "../../../packages/editor-runtime/src";

/**
 * FS-403 coverage for interactive transform gizmos.
 *
 * The previous `TransformControls` compatibility helper applied explicit deltas and had
 * no geometry, no picking, and no drag state, so interactive parity could not be
 * claimed from it. These tests exercise the properties that were missing: rendered
 * handle geometry, ray picking, a pointer drag lifecycle, axis constraints, snapping,
 * and local/world spaces.
 */
describe("interactive transform gizmo geometry", () => {
  it("exposes renderable axis and plane handles for translate", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate" });
    const handles = gizmo.handles();
    expect(handles.map((handle) => handle.handle)).toEqual(["x", "y", "z", "xy", "xz", "yz"]);
    // Every handle must carry real segments, otherwise there is nothing to draw.
    for (const handle of handles) {
      expect(handle.segments.length).toBeGreaterThan(0);
      for (const segment of handle.segments) {
        expect(segment.start.every(Number.isFinite)).toBe(true);
        expect(segment.end.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("exposes three closed rotation rings for rotate", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "rotate" });
    const handles = gizmo.handles();
    expect(handles.map((handle) => handle.handle)).toEqual(["x", "y", "z"]);
    for (const handle of handles) {
      expect(handle.kind).toBe("rotation-ring");
      // A closed ring: enough segments to read as a circle.
      expect(handle.segments.length).toBeGreaterThanOrEqual(24);
    }
  });

  it("adds a uniform handle only in scale mode", () => {
    expect(new InteractiveTransformGizmo({ mode: "scale" }).handles().some((handle) => handle.handle === "uniform")).toBe(true);
    expect(new InteractiveTransformGizmo({ mode: "translate" }).handles().some((handle) => handle.handle === "uniform")).toBe(false);
  });

  it("rotates handle directions into local space", () => {
    // 90 degrees about Z maps local +X onto world +Y.
    const halfAngle = Math.PI / 4;
    const orientation: readonly [number, number, number, number] = [0, 0, Math.sin(halfAngle), Math.cos(halfAngle)];

    const world = new InteractiveTransformGizmo({ mode: "translate", settings: { spaceMode: "world" } });
    world.place([0, 0, 0], orientation);
    const worldX = world.handles().find((handle) => handle.handle === "x")?.direction;
    expect(worldX?.[0]).toBeCloseTo(1, 5);

    const local = new InteractiveTransformGizmo({ mode: "translate", settings: { spaceMode: "local" } });
    local.place([0, 0, 0], orientation);
    const localX = local.handles().find((handle) => handle.handle === "x")?.direction;
    expect(localX?.[0]).toBeCloseTo(0, 5);
    expect(localX?.[1]).toBeCloseTo(1, 5);
  });
});

describe("interactive transform gizmo picking", () => {
  it("picks the axis handle a ray points at", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.12 });
    gizmo.place([0, 0, 0]);
    // Aim down -Z at a point partway along the +X arm.
    const picked = gizmo.pick(new Ray(new Vector3(0.6, 0, 5), new Vector3(0, 0, -1)));
    expect(picked?.handle).toBe("x");
    expect(picked?.distance).toBeGreaterThan(0);
  });

  it("returns nothing when the ray misses every handle", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.1 });
    gizmo.place([0, 0, 0]);
    expect(gizmo.pick(new Ray(new Vector3(9, 9, 5), new Vector3(0, 0, -1)))).toBeUndefined();
  });

  it("keeps the interior of a rotation ring unpickable so scene selection still works", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "rotate", size: 1, pickTolerance: 0.1 });
    gizmo.place([0, 0, 0]);
    // A ray through the middle of the Z ring must not pick it.
    const centre = gizmo.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
    expect(centre).toBeUndefined();
    // A ray near the ring radius must.
    const edge = gizmo.pick(new Ray(new Vector3(1, 0, 5), new Vector3(0, 0, -1)));
    expect(edge?.handle).toBeDefined();
  });

  it("tracks hover state without starting a drag", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.12 });
    gizmo.place([0, 0, 0]);
    expect(gizmo.hover(new Ray(new Vector3(0.6, 0, 5), new Vector3(0, 0, -1)))).toBe("x");
    expect(gizmo.state().dragging).toBe(false);
    expect(gizmo.hover(new Ray(new Vector3(9, 9, 5), new Vector3(0, 0, -1)))).toBeUndefined();
  });
});

describe("interactive transform gizmo drag lifecycle", () => {
  it("constrains translate drags to the picked axis", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.2 });
    gizmo.place([0, 0, 0]);
    expect(gizmo.pointerDown(new Ray(new Vector3(0.6, 0, 5), new Vector3(0, 0, -1)))).toBe(true);
    expect(gizmo.state().dragging).toBe(true);

    // Move the pointer +0.4 along X and also along Y. Only the X component may count.
    const update = gizmo.pointerMove(new Ray(new Vector3(1.0, 0.75, 5), new Vector3(0, 0, -1)));
    expect(update?.handle).toBe("x");
    expect(update?.axisDelta).toBeCloseTo(0.4, 5);
    expect(update?.rotationDelta).toBe(0);

    const committed = gizmo.pointerUp();
    expect(committed?.handle).toBe("x");
    expect(committed?.totalDelta).toBeCloseTo(0.4, 5);
    expect(gizmo.state().dragging).toBe(false);
  });

  it("reports rotation rather than translation for ring drags", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "rotate", size: 1, pickTolerance: 0.2 });
    gizmo.place([0, 0, 0]);
    expect(gizmo.pointerDown(new Ray(new Vector3(1, 0, 5), new Vector3(0, 0, -1)))).toBe(true);
    const update = gizmo.pointerMove(new Ray(new Vector3(0, 1, 5), new Vector3(0, 0, -1)));
    expect(update?.mode).toBe("rotate");
    expect(update?.axisDelta).toBe(0);
    expect(Math.abs(update?.rotationDelta ?? 0)).toBeGreaterThan(0.1);
  });

  it("refuses to start a drag when nothing is picked so the viewport can select instead", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.1 });
    gizmo.place([0, 0, 0]);
    expect(gizmo.pointerDown(new Ray(new Vector3(9, 9, 5), new Vector3(0, 0, -1)))).toBe(false);
    expect(gizmo.state().dragging).toBe(false);
    expect(gizmo.pointerMove(new Ray(new Vector3(9, 9, 5), new Vector3(0, 0, -1)))).toBeUndefined();
  });

  it("discards an in-flight drag when cancelled", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.2 });
    gizmo.place([0, 0, 0]);
    gizmo.pointerDown(new Ray(new Vector3(0.6, 0, 5), new Vector3(0, 0, -1)));
    gizmo.pointerMove(new Ray(new Vector3(1.2, 0, 5), new Vector3(0, 0, -1)));
    gizmo.cancelDrag();
    expect(gizmo.state().dragging).toBe(false);
    expect(gizmo.pointerUp()).toBeUndefined();
  });

  it("quantizes translate drags to the configured position snap", () => {
    const gizmo = new InteractiveTransformGizmo({
      mode: "translate",
      size: 1,
      pickTolerance: 0.3,
      settings: { snapEnabled: true, positionSnap: 0.5 }
    });
    gizmo.place([0, 0, 0]);
    gizmo.pointerDown(new Ray(new Vector3(0.6, 0, 5), new Vector3(0, 0, -1)));
    // Raw movement of 0.68 must snap to 0.5.
    const update = gizmo.pointerMove(new Ray(new Vector3(1.28, 0, 5), new Vector3(0, 0, -1)));
    expect(update?.snapped).toBe(true);
    expect(update?.totalDelta).toBeCloseTo(0.5, 5);
  });

  it("quantizes rotate drags to the configured rotation snap", () => {
    const gizmo = new InteractiveTransformGizmo({
      mode: "rotate",
      size: 1,
      pickTolerance: 0.3,
      settings: { snapEnabled: true, rotationSnapDegrees: 45 }
    });
    gizmo.place([0, 0, 0]);
    gizmo.pointerDown(new Ray(new Vector3(1, 0, 5), new Vector3(0, 0, -1)));
    const update = gizmo.pointerMove(new Ray(new Vector3(0, 1, 5), new Vector3(0, 0, -1)));
    // A quarter turn is exactly two 45-degree steps.
    expect(Math.abs(update?.totalDelta ?? 0)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("moves the gizmo with its target", () => {
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.15 });
    gizmo.place([5, 0, 0]);
    expect(gizmo.state().origin).toEqual([5, 0, 0]);
    // The old origin is no longer pickable; the new one is.
    expect(gizmo.pick(new Ray(new Vector3(0.6, 0, 5), new Vector3(0, 0, -1)))).toBeUndefined();
    expect(gizmo.pick(new Ray(new Vector3(5.6, 0, 5), new Vector3(0, 0, -1)))?.handle).toBe("x");
  });

  it("rejects non-finite placement", () => {
    const gizmo = new InteractiveTransformGizmo();
    expect(() => gizmo.place([Number.NaN, 0, 0])).toThrow(/finite/);
  });
});
