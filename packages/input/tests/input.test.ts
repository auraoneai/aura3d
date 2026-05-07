import assert from "node:assert/strict";
import test from "node:test";
import { Ray, Vector3 } from "@galileo3d/math";
import { Scene } from "@galileo3d/scene";
import { ActionMap, InputSnapshot, InputSystem, InteractionSystem, pickingRayFromCamera } from "../src/index";

test("InputSystem produces stable key transitions across frames", () => {
  const input = new InputSystem();
  input.keyboard.keyDown({ code: "Space" });
  let snapshot = input.update();
  assert.equal(snapshot.key("Space").pressed, true);
  assert.equal(snapshot.key("Space").down, true);

  input.endFrame();
  snapshot = input.update();
  assert.equal(snapshot.key("Space").pressed, false);
  assert.equal(snapshot.key("Space").down, true);

  input.keyboard.keyUp({ code: "Space" });
  snapshot = input.update();
  assert.equal(snapshot.key("Space").released, true);
});

test("ActionMap supports alternatives and axes", () => {
  const input = new InputSystem();
  const actions = new ActionMap();
  actions.bind("jump", [
    { type: "keyboard", code: "Space" },
    { type: "pointer", button: 0 }
  ]);
  actions.bindAxis("moveX", [{ type: "keyboard-axis", negative: "KeyA", positive: "KeyD", scale: 2 }]);

  input.keyboard.keyDown({ code: "KeyD" });
  input.pointer.down({ clientX: 5, clientY: 7, button: 0 });
  const snapshot = input.update();

  assert.equal(actions.pressed("jump", snapshot), true);
  assert.equal(actions.axis("moveX", snapshot), 2);
});

test("pickingRayFromCamera creates a center ray through the camera forward axis", () => {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ aspect: 1 });
  scene.root.addChild(camera);
  camera.setViewport({ x: 0, y: 0, width: 100, height: 100 });

  const ray = pickingRayFromCamera(camera, 50, 50);
  assert.ok(ray.direction.equals(new Vector3(0, 0, -1), 1e-6));
});

test("InteractionSystem picks nearest target and emits click lifecycle", () => {
  const events: string[] = [];
  const interaction = new InteractionSystem(
    () => new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)),
    () => [
      { id: "far", bounds: { min: [-1, -1, -5], max: [1, 1, -4] } },
      { id: "near", bounds: { min: [-1, -1, 0], max: [1, 1, 1] } }
    ]
  );
  interaction.subscribe((event) => events.push(event.type));

  const down = new InputSnapshot({ pointer: { buttons: new Map([[0, { down: true, pressed: false, released: false }]]) } });
  const hit = interaction.update(down);
  const up = new InputSnapshot({ pointer: { buttons: new Map() }, previousPointerButtons: new Set([0]) });
  interaction.update(up);

  assert.equal(hit?.target.id, "near");
  assert.deepEqual(events, ["hover-enter", "pointer-down", "click"]);
});
