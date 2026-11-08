import { describe, expect, test } from "vitest";
import { camera, environments, lights, material, primitives, scene } from "../../../packages/engine/src/index.js";
import { measureFrameFill } from "../../../packages/engine/src/agent-api/camera/frameSubject.js";
import { worldBoundsOfNodes, isGroundLikeNode } from "../../../packages/engine/src/agent-api/camera/frameNodes.js";

const subject = () => primitives.box({ name: "clock case", size: [0.5, 1.8, 0.35], material: material.pbr({ color: "#7a4a2a" }) }).position(2, 0.9, -1);
const ground = () => primitives.plane({ name: "ground", size: [40, 1, 40], material: material.pbr({ color: "#555555" }) });

function fillOf(stage: ReturnType<typeof scene>, aspect = 16 / 9): number {
  const snapshot = stage.toJSON();
  const bounds = worldBoundsOfNodes(snapshot.nodes as never, { exclude: isGroundLikeNode })!;
  const cam = snapshot.camera;
  return measureFrameFill(bounds, { position: cam.position!, target: cam.target!, fov: cam.fov! }, aspect);
}

describe("camera.auto (N4 framing by default)", () => {
  test("frames the scene's subject at the default 0.6 fill in one chain, ground left out", () => {
    const stage = scene().add(lights.directional({ shadow: true })).add(ground()).add(subject()).camera(camera.auto({ aspect: 16 / 9 }));
    const snapshot = stage.toJSON();
    expect(snapshot.camera.mode).toBe("orbit");
    expect(snapshot.camera.target![0]).toBeCloseTo(2, 1);
    expect(fillOf(stage)).toBeCloseTo(0.6, 2);
  });

  test("honours fill, angle and padding like camera.frame", () => {
    const stage = scene().add(subject()).camera(camera.auto({ fill: 0.8, angle: "front", aspect: 16 / 9 }));
    expect(fillOf(stage)).toBeCloseTo(0.8, 2);
    const framed = camera.frameScene(scene().add(subject()), { fill: 0.8, angle: "front", aspect: 16 / 9 });
    expect(stage.toJSON().camera.position![2]).toBeCloseTo(framed.position![2], 6);
  });

  test("a back wall is set dressing: the scene-wide frame leaves it out", () => {
    const withWall = scene().add(primitives.box({ name: "back wall", size: [12, 6, 0.2] }).position(0, 3, -3)).add(subject()).camera(camera.auto({ aspect: 16 / 9 }));
    const without = scene().add(subject()).camera(camera.auto({ aspect: 16 / 9 }));
    expect(withWall.toJSON().camera).toEqual(without.toJSON().camera);
  });

  test("follows nodes added after the camera is set", () => {
    const stage = scene().camera(camera.auto({ aspect: 16 / 9 })).add(subject());
    expect(fillOf(stage)).toBeCloseTo(0.6, 2);
  });

  test("a scene that never chose a camera is framed the same way", () => {
    const unset = scene().add(ground()).add(subject());
    const auto = scene().add(ground()).add(subject()).camera(camera.auto());
    expect(unset.toJSON().camera).toEqual(auto.toJSON().camera);
  });

  test("an authored camera is kept exactly", () => {
    const pinned = camera.perspective({ position: [0, 1.42, 3.8], target: [0, 1, 0], fov: 40 });
    const snapshot = scene().add(subject()).camera(pinned).toJSON();
    expect(snapshot.camera.mode).toBe("perspective");
    expect(snapshot.camera.position).toEqual([0, 1.42, 3.8]);
  });

  test("nothing spatial keeps the default orbit", () => {
    const snapshot = scene().add(environments.neutral({ intensity: 0.6 })).camera(camera.auto()).toJSON();
    expect(snapshot.camera).toMatchObject(camera.orbit());
    expect(scene().toJSON().camera).toMatchObject(camera.orbit());
  });
});

describe("camera.auto subject", () => {
  test("frames only the named subject (inside a positioned group) while props stay in the scene", async () => {
    const { group } = await import("../../../packages/engine/src/index.js");
    const stage = scene()
      .add(primitives.box({ name: "back wall", size: [12, 6, 0.2] }).position(0, 3, -3))
      .add(group("room", [group("clock", [subject()], { position: [-2, 0, 0] })], { position: [0, 0, 1] }))
      .camera(camera.auto({ subject: "clock", aspect: 16 / 9 }));
    const snapshot = stage.toJSON();
    const world = { min: [-0.25, 0, -0.175] as [number, number, number], max: [0.25, 1.8, 0.175] as [number, number, number] };
    // subject() sits at (2, 0.9, -1) inside clock (-2, 0, 0) inside room (0, 0, 1): world centre (0, 0.9, 0).
    expect(snapshot.camera.target![0]).toBeCloseTo(0, 1);
    expect(snapshot.camera.target![2]).toBeCloseTo(0, 1);
    const fill = measureFrameFill(world, { position: snapshot.camera.position!, target: snapshot.camera.target!, fov: snapshot.camera.fov! }, 16 / 9);
    expect(fill).toBeCloseTo(0.6, 2);
  });

  test("an unmatched subject name falls back to the whole scene", () => {
    const named = scene().add(subject()).camera(camera.auto({ subject: "nope", aspect: 16 / 9 })).toJSON().camera;
    const whole = scene().add(subject()).camera(camera.auto({ aspect: 16 / 9 })).toJSON().camera;
    expect(named).toEqual(whole);
  });
});

describe("lights.key (N4 key light casts shadows by default)", () => {
  test("is a shadow-casting directional light aimed at its target from a three-quarter angle above", () => {
    const node = lights.key({ target: [1, 0, -1] }).toJSON();
    expect(node).toMatchObject({ kind: "light", light: "directional", name: "key light", target: [1, 0, -1], intensity: 3, shadow: { bias: 0.002 } });
    expect(node.position![1]).toBeGreaterThan(node.target![1] + 2);
    expect(lights.key({ shadow: true }).toJSON().shadow).toEqual({ bias: 0.002 });
  });

  test("an authored shadow choice wins", () => {
    expect(lights.key({ shadow: false }).toJSON().shadow).toBe(false);
    expect(lights.key({ shadow: { mapSize: 4096 } }).toJSON().shadow).toEqual({ mapSize: 4096 });
  });
});
