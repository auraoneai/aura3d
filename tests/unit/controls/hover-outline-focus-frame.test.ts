import { describe, expect, it } from "vitest";
import {
  ControlVector3,
  HoverOutline,
  frameSelection,
  frameTarget,
  type ControlObject3DLike
} from "../../../packages/controls/src";

function sceneObject(name: string, position: readonly [number, number, number]): ControlObject3DLike {
  return {
    type: "Mesh",
    name,
    position: new ControlVector3(position[0], position[1], position[2]),
    scale: new ControlVector3(1, 1, 1)
  };
}

describe("F4 hover outline state", () => {
  it("reports hover, selected, and hover-selected tones with distinct styles", () => {
    const outline = new HoverOutline();
    const hovered = sceneObject("hovered", [0, 0, -3]);
    const selected = sceneObject("selected", [2, 0, -3]);

    outline.setHovered(hovered);
    expect(outline.entries()).toHaveLength(1);
    expect(outline.entries()[0]).toMatchObject({ object: hovered, tone: "hover" });

    outline.setSelected([selected]);
    const tones = new Map(outline.entries().map((entry) => [entry.object.name, entry.tone]));
    expect(tones.get("hovered")).toBe("hover");
    expect(tones.get("selected")).toBe("selected");

    outline.setSelected([hovered, selected]);
    expect(outline.entries().find((entry) => entry.object === hovered)?.tone).toBe("hover-selected");
    // Hover + selected styles must be visually distinct.
    const styles = outline.entries().map((entry) => entry.style.color.join(","));
    expect(new Set(styles).size).toBeGreaterThanOrEqual(2);

    outline.clear();
    expect(outline.entries()).toEqual([]);
  });

  it("honors custom styles and disposes without leaking references", () => {
    const outline = new HoverOutline({ hover: { width: 5 } });
    const target = sceneObject("target", [0, 0, -3]);
    outline.setHovered(target);
    expect(outline.entries()[0]).toMatchObject({ tone: "hover", style: { width: 5 } });
    outline.setSelected([target]);
    expect(outline.entries()[0]?.tone).toBe("hover-selected");
    outline.dispose();
    expect(outline.isDisposed).toBe(true);
    expect(outline.entries()).toEqual([]);
    outline.setHovered(target);
    outline.setSelected([target]);
    expect(outline.entries()).toEqual([]);
    expect(() => outline.dispose()).not.toThrow();
  });
});

describe("F4 focus framing", () => {
  it("frames a single object ahead of the camera at the expected distance", () => {
    const target = sceneObject("focus-target", [0, 0, -6]);
    const result = frameSelection([target], { fovDegrees: 45, margin: 1 });
    expect(result).toBeDefined();
    // radius 0.5 (unit scale), distance = 0.5 / tan(22.5deg) ≈ 1.207.
    expect(result?.target).toMatchObject({ x: 0, y: 0, z: -6 });
    expect(result?.distance).toBeCloseTo(0.5 / Math.tan((45 * Math.PI) / 360), 10);
    expect(result?.objectCount).toBe(1);
  });

  it("frames multiple objects on their shared bounding sphere", () => {
    const left = sceneObject("left", [-2, 0, -6]);
    const right = sceneObject("right", [2, 0, -6]);
    const result = frameSelection([left, right], { fovDegrees: 60, margin: 1 });
    expect(result?.target).toMatchObject({ x: 0, y: 0, z: -6 });
    // Half-extent 2 + 0.5 radius = 2.5 sphere radius.
    expect(result?.radius).toBeCloseTo(2.5, 10);
    expect(result?.distance).toBeCloseTo(2.5 / Math.tan((60 * Math.PI) / 360), 10);
  });

  it("supports explicit center/radius targets and clamps distance", () => {
    const near = frameTarget({ center: { x: 0, y: 0, z: 0 }, radius: 0.01 }, { minDistance: 1 });
    expect(near.distance).toBe(1);
    const far = frameTarget({ center: { x: 0, y: 0, z: 0 }, radius: 500 }, { maxDistance: 50 });
    expect(far.distance).toBe(50);
  });

  it("returns undefined for empty selections and rejects bad options", () => {
    expect(frameSelection([])).toBeUndefined();
    expect(() => frameSelection([sceneObject("x", [0, 0, 0])], { fovDegrees: 0 })).toThrow("fovDegrees");
    expect(() => frameSelection([sceneObject("x", [0, 0, 0])], { margin: 0.5 })).toThrow("margin");
    expect(() => frameTarget({ center: { x: 0, y: 0, z: 0 }, radius: -1 })).toThrow("pickRadius");
  });
});
