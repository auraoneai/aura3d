/**
 * S8 / C-9 regression (Codex review on #911, P1): the camera collision probe
 * must hit ordinary static scene geometry, not only `.runtime(...)` nodes.
 * Before the fix `app.camera.probe` enumerated `app.nodes` only, so a static
 * primitive wall between subject and eye never registered a hit.
 */
import { describe, expect, it } from "vitest";
import { createAuraCameraController } from "../../../../packages/engine/src/agent-api/camera/extension.js";
import { staticSceneProbeBoxes } from "../../../../packages/engine/src/agent-api/camera/staticBounds.js";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index.js";

const wall = { kind: "primitive", primitive: "box", name: "wall", position: [0, 1, 3], size: [6, 2, 0.4], visible: true };

function appWith(nodes: readonly unknown[], runtime: readonly unknown[] = []): AuraApp {
  return {
    scene: { camera: { position: [0, 1, 6], target: [0, 1, 0], fov: 50 }, nodes },
    nodes: { all: () => runtime, get: () => undefined },
    onFrame: () => () => {}
  } as unknown as AuraApp;
}

describe("S8 probe sees static scene nodes", () => {
  it("a static primitive wall between subject and eye is a hit", () => {
    const camera = createAuraCameraController(appWith([wall]));
    camera.probe.beginFrame();
    const r = camera.probe.sphereCast([0, 1, 0], [0, 1, 6], 0.2);
    expect(r.hit).toBe(true);
    // Wall front face at z = 2.8, minus the 0.2 probe radius.
    expect(r.distance).toBeGreaterThan(2.4);
    expect(r.distance).toBeLessThan(2.8);
  });

  it("control: no wall, no hit", () => {
    const camera = createAuraCameraController(appWith([]));
    camera.probe.beginFrame();
    expect(camera.probe.sphereCast([0, 1, 0], [0, 1, 6], 0.2).hit).toBe(false);
  });

  it("groups, scale, rotation and instances map to conservative boxes", () => {
    const boxes = staticSceneProbeBoxes([
      { kind: "group", position: [10, 0, 0], children: [{ kind: "primitive", primitive: "box", size: 2, scale: 2 }] },
      { kind: "primitive", primitive: "box", size: [2, 2, 2], rotation: [0, 0.5, 0] },
      { kind: "primitive", primitive: "sphere", size: 1, instances: [{ position: [5, 0, 0] }, { position: [-5, 0, 0] }] },
      { kind: "model", asset: { id: "x" }, targetHeight: 2, position: [0, 1, 0] },
      { kind: "model", asset: { id: "unsized" } },
      { kind: "primitive", primitive: "box", size: 1, runtime: { id: "live" } },
      { kind: "primitive", primitive: "box", size: 1, visible: false }
    ] as never);
    expect(boxes).toHaveLength(5);
    expect(boxes[0].min).toEqual([8, -2, -2]); // group offset + size 2 × scale 2
    const r = Math.sqrt(3); // rotated unit-half box → bounding sphere
    expect(boxes[1].max[0]).toBeCloseTo(r, 9);
    expect(boxes[2].min[0]).toBeCloseTo(4.5, 9);
    expect(boxes[3].min[0]).toBeCloseTo(-5.5, 9);
    expect(boxes[4].max).toEqual([1, 2, 1]);
  });

  it("static and runtime boxes are both cast against", () => {
    const runtimeWall = { id: "door", visible: true, bounds: () => ({ min: [-3, 0, -3.2], max: [3, 2, -2.8] }) };
    const camera = createAuraCameraController(appWith([wall], [runtimeWall]));
    camera.probe.beginFrame();
    expect(camera.probe.sphereCast([0, 1, 0], [0, 1, 6], 0.2).hit).toBe(true);
    camera.probe.beginFrame();
    expect(camera.probe.sphereCast([0, 1, 0], [0, 1, -6], 0.2).hit).toBe(true);
  });
});
