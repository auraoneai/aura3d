import { describe, expect, it } from "vitest";
import { projectScenePoint, resolveCompositionCamera } from "../../browser/showcase-composition-projection";

const crop = { x: 0, y: 0, width: 1000, height: 500 } as const;

describe("showcase composition camera projection", () => {
  it("adds scene-space targetOffset to both the follow target and eye like the renderer", () => {
    const resolved = resolveCompositionCamera({
      mode: "follow",
      target: [0, 0.2, 0],
      offset: [0.25, 3, 4],
      targetOffset: [1.5, 0.3, -0.5],
      offsetMode: "scene",
      fov: 48
    }, { position: [10, 2, 6], rotation: [0, 1.2, 0] });

    expect(resolved.target).toEqual([11.5, 2.3, 5.5]);
    expect(resolved.position).toEqual([11.75, 5.3, 9.5]);
    expect(projectScenePoint(resolved.target, resolved, crop)).toEqual({ x: 500, y: 250 });
  });

  it("rotates both target and eye offsets for target-yaw chase cameras", () => {
    const resolved = resolveCompositionCamera({
      mode: "follow",
      target: [0, 0.2, 0],
      offset: [0, 2, -4],
      targetOffset: [1, 0.2, 0],
      offsetMode: "target-yaw",
      fov: 44
    }, { position: [2, 0.5, 3], rotation: [0, Math.PI / 2, 0] });

    expect(resolved.target[0]).toBeCloseTo(2);
    expect(resolved.target[1]).toBeCloseTo(0.7);
    expect(resolved.target[2]).toBeCloseTo(2);
    expect(resolved.position[0]).toBeCloseTo(-2);
    expect(resolved.position[1]).toBeCloseTo(2.7);
    expect(resolved.position[2]).toBeCloseTo(2);
  });
});
