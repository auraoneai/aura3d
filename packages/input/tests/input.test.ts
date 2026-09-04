import assert from "node:assert/strict";
import test from "node:test";
import { Ray, Vector3 } from "@aura3d/math";
import { Scene } from "@aura3d/scene";
import {
  ActionMap,
  ComboDetector,
  InputSnapshot,
  InputSystem,
  InteractionSystem,
  createTouchLayoutPreset,
  pickingRayFromCamera,
  playHaptic,
  probeHaptics
} from "../src/index";

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

test("ActionMap remapping keeps shipped defaults restorable", () => {
  const actions = new ActionMap();
  actions.bind("jump", [{ type: "keyboard", code: "Space" }]);
  assert.equal(actions.resetAction("jump"), false);

  let changes = 0;
  const unsubscribe = actions.onChange(() => {
    changes += 1;
  });
  actions.rebind("jump", [{ type: "keyboard", code: "KeyJ" }]);
  assert.deepEqual(actions.getBindings("jump"), [{ type: "keyboard", code: "KeyJ" }]);
  assert.equal(actions.resetAction("jump"), true);
  assert.deepEqual(actions.getBindings("jump"), [{ type: "keyboard", code: "Space" }]);
  assert.ok(changes >= 2);
  unsubscribe();
  actions.rebind("jump", [{ type: "keyboard", code: "KeyK" }]);
  assert.equal(changes, 2);

  assert.equal(actions.unbind("missing"), false);
  assert.equal(actions.unbind("jump"), true);
  assert.equal(actions.getBindings("jump"), undefined);
  assert.equal(actions.resetAction("jump"), true);
  assert.deepEqual(actions.getBindings("jump"), [{ type: "keyboard", code: "Space" }]);
});

test("ActionMap serialize/restore round-trips and rejects malformed snapshots", () => {
  const actions = new ActionMap();
  actions.bind("jump", [{ type: "keyboard", code: "Space" }]);
  actions.bindAxis("moveX", [{ type: "keyboard-axis", negative: "KeyA", positive: "KeyD" }]);
  const snapshot = actions.serializeBindings();

  const restored = new ActionMap();
  restored.restoreBindings(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored.getBindings("jump"), [{ type: "keyboard", code: "Space" }]);
  assert.deepEqual(restored.getAxisBindings("moveX"), [{ type: "keyboard-axis", negative: "KeyA", positive: "KeyD" }]);

  assert.throws(() => restored.restoreBindings({} as never), /expected \{ actions, axes \}/);
  assert.throws(
    () => restored.restoreBindings({ actions: { jump: [{ type: "keyboard" }] }, axes: {} } as never),
    /Invalid action bindings/
  );
});

test("ActionMap findConflicts flags doubly-claimed codes", () => {
  const actions = new ActionMap();
  actions.bind("jump", [{ type: "keyboard", code: "Space" }]);
  actions.bind("attack", [{ type: "keyboard", code: "KeyJ" }]);
  assert.deepEqual(actions.findConflicts(), []);
  actions.rebind("attack", [{ type: "keyboard", code: "Space" }]);
  const conflicts = actions.findConflicts();
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.code, "key:Space");
  assert.deepEqual(conflicts[0]?.actions, ["attack", "jump"]);
});

test("ComboDetector fires ordered sequences inside the buffer window", () => {
  const detector = new ComboDetector();
  detector.defineCombo({ id: "fireball", steps: ["ArrowDown", "ArrowRight", "KeyP"], bufferMs: 300 });

  assert.deepEqual(detector.update({ pressed: ["ArrowDown"], down: ["ArrowDown"], timeMs: 0 }), []);
  assert.deepEqual(detector.update({ pressed: ["ArrowRight"], down: ["ArrowRight"], timeMs: 100 }), []);
  const fired = detector.update({ pressed: ["KeyP"], down: ["KeyP"], timeMs: 200 });
  assert.deepEqual(fired, [{ comboId: "fireball", timeMs: 200 }]);
});

test("ComboDetector rejects wrong order and expired intervals", () => {
  const detector = new ComboDetector();
  detector.defineCombo({ id: "uppercut", steps: ["ArrowRight", "ArrowDown", "KeyP"], maxIntervalMs: 120, bufferMs: 500 });

  detector.update({ pressed: ["ArrowRight"], down: ["ArrowRight"], timeMs: 0 });
  // Wrong next step breaks the tail match.
  assert.deepEqual(detector.update({ pressed: ["KeyP"], down: ["KeyP"], timeMs: 50 }), []);

  detector.reset();
  detector.update({ pressed: ["ArrowRight"], down: ["ArrowRight"], timeMs: 0 });
  detector.update({ pressed: ["ArrowDown"], down: ["ArrowDown"], timeMs: 50 });
  // Final step arrives after the max interval: no fire.
  assert.deepEqual(detector.update({ pressed: ["KeyP"], down: ["KeyP"], timeMs: 500 }), []);
  assert.equal(detector.removeCombo("uppercut"), true);
  assert.deepEqual(detector.comboIds(), []);
});

test("ComboDetector hold combos fire once per press after the threshold", () => {
  const detector = new ComboDetector();
  detector.defineCombo({ id: "charge", steps: ["KeyC"], holdMs: 400 });
  assert.deepEqual(detector.update({ pressed: ["KeyC"], down: ["KeyC"], timeMs: 0 }), []);
  assert.deepEqual(detector.update({ pressed: [], down: ["KeyC"], timeMs: 399 }), []);
  assert.deepEqual(detector.update({ pressed: [], down: ["KeyC"], timeMs: 400 }), [{ comboId: "charge", timeMs: 400 }]);
  // No repeat while still held.
  assert.deepEqual(detector.update({ pressed: [], down: ["KeyC"], timeMs: 800 }), []);
  assert.equal(detector.held("KeyC", 400, 800), true);
  // Release + re-press re-arms.
  detector.update({ pressed: [], down: [], timeMs: 900 });
  assert.equal(detector.held("KeyC", 1, 900), false);
  assert.deepEqual(detector.update({ pressed: ["KeyC"], down: ["KeyC"], timeMs: 1000 }), []);
});

test("haptics probe reports capability and play refuses fake success", async () => {
  const none = probeHaptics({});
  assert.equal(none.vibrate, false);
  assert.equal(none.gamepadRumble, false);

  const denied = await playHaptic({ durationMs: 50 }, none, {});
  assert.equal(denied.played, false);
  assert.equal(denied.via, "none");

  const vibe = probeHaptics({ navigatorLike: { vibrate: () => true } });
  assert.equal(vibe.vibrate, true);
  const calls: Array<number | readonly number[]> = [];
  const ok = await playHaptic({ pattern: [30, 40, 30] }, vibe, {
    navigatorLike: {
      vibrate: (pattern) => {
        calls.push(pattern);
        return true;
      }
    }
  });
  assert.equal(ok.played, true);
  assert.equal(ok.via, "navigator-vibrate");
  assert.deepEqual(calls, [[30, 40, 30]]);

  const refused = await playHaptic({ durationMs: 30 }, vibe, { navigatorLike: { vibrate: () => false } });
  assert.equal(refused.played, false);

  const bad = await playHaptic({ intensity: 2 }, vibe, { navigatorLike: { vibrate: () => true } });
  assert.equal(bad.played, false);
  assert.match(bad.reason, /intensity/);
});

test("haptics prefers gamepad rumble and surfaces rejections", async () => {
  const capability = probeHaptics({
    navigatorLike: { vibrate: () => true },
    actuators: [{ playEffect: async () => "complete" }]
  });
  assert.equal(capability.gamepadRumble, true);
  const rumbled = await playHaptic({ intensity: 0.7, durationMs: 80 }, capability, {
    navigatorLike: { vibrate: () => true },
    actuator: { playEffect: async () => "complete" }
  });
  assert.equal(rumbled.played, true);
  assert.equal(rumbled.via, "gamepad-rumble");

  const rejected = await playHaptic({ intensity: 0.5 }, capability, {
    actuator: {
      playEffect: () => {
        throw new Error("effect busy");
      }
    }
  });
  assert.equal(rejected.played, false);
  assert.match(rejected.reason, /effect busy/);
});

test("touch layout presets cover fight, race, and platform with analog sticks", () => {
  const fight = createTouchLayoutPreset("fight");
  const race = createTouchLayoutPreset("race");
  const platform = createTouchLayoutPreset("platform", { elementIdPrefix: "custom", width: 1280, height: 720 });

  for (const preset of [fight, race, platform]) {
    assert.equal(preset.kind, "touch-layout-preset");
    assert.ok(preset.leftStick.radius > 0);
    assert.ok(preset.hold.length > 0);
    assert.ok(preset.pulse.length > 0);
  }
  assert.ok(fight.rightStick);
  assert.ok(platform.rightStick);
  assert.equal(race.rightStick, undefined);

  assert.ok(race.hold.some((binding) => binding.elementId === "touch-race:throttle" && binding.code === "ArrowUp"));
  assert.ok(race.pulse.some((binding) => binding.elementId === "touch-race:boost"));
  assert.ok(fight.pulse.some((binding) => binding.code === "Space"));
  assert.ok(platform.pulse.some((binding) => binding.elementId === "custom:jump" && binding.code === "Space"));
});
