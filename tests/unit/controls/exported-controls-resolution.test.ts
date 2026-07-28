import { InputSnapshot } from "@aura3d/input";
import { describe, expect, it } from "vitest";
import {
  ControlVector3,
  DRAG_CONTROLS_DEPRECATION,
  DragControls,
  FirstPersonControls,
  FlyControls,
  MapControls,
  PointerLockControls,
  SelectionManager,
  TRANSFORM_CONTROLS_DEPRECATION,
  TransformControls,
  type ControlObject3DLike
} from "../../../packages/controls/src";

describe("task 2.23 exported controls resolution", () => {
  it("delegates fly movement, look, lift, enablement, and disposal to the input engine", () => {
    const external = camera(0, 1, 5);
    const controls = new FlyControls(external, { movementSpeed: 2, lookSpeed: 0.01 });

    controls.applyInput(snapshot({
      keys: new Set(["KeyW", "KeyD", "KeyE"])
    }), 0.5);
    controls.applyInput(snapshot({
      pointer: {
        deltaX: 10,
        deltaY: 20,
        buttons: new Map([[2, button()]])
      }
    }), 0.5);

    expect(controls.isDelegated).toBe(true);
    expect(external.position).toEqual(controls.state.position);
    expect(external.position.x).toBeCloseTo(1);
    expect(external.position.y).toBeCloseTo(2);
    expect(external.position.z).toBeCloseTo(6);
    expect(external.rotation.y).toBeCloseTo(-0.1);
    expect(external.rotation.x).toBeCloseTo(-0.2);

    controls.moveForward(2);
    controls.strafe(-0.5);
    controls.lift(0.25);
    expect(external.position).toEqual(controls.state.position);
    expect(external.position.z).not.toBeCloseTo(6);

    const beforeDispose = { ...external.position };
    controls.dispose();
    controls.applyInput(snapshot({ keys: new Set(["KeyW"]) }), 1);
    expect(controls.enabled).toBe(false);
    expect(external.position).toEqual(beforeDispose);
  });

  it("delegates first-person yaw-relative movement and bounded look while preserving inheritance", () => {
    const external = camera(0, 0, 0);
    external.rotation.y = Math.PI / 2;
    const controls = new FirstPersonControls(external, {
      moveSpeed: 2,
      lookSpeed: 0.01,
      minPitch: -0.25,
      maxPitch: 0.25
    });

    controls.applyInput(snapshot({
      keys: new Set(["KeyW"]),
      pointer: {
        deltaY: -100,
        buttons: new Map([[0, button()]])
      }
    }), 0.5);

    expect(controls).toBeInstanceOf(FlyControls);
    expect(external.position.x).toBeCloseTo(1);
    expect(external.position.z).toBeCloseTo(0);
    expect(external.rotation.x).toBeCloseTo(0.25);
    expect(controls.state.rotation.x).toBeCloseTo(0.25);

    controls.look(0.2, -1);
    expect(external.rotation.y).toBeCloseTo(Math.PI / 2 + 0.2);
    expect(external.rotation.x).toBeCloseTo(-0.25);

    const stateBacked = new FirstPersonControls();
    stateBacked.look(0.1, 0.2);
    expect(stateBacked.state.rotation.x).toBeCloseTo(0.2);
    expect(stateBacked.state.rotation.y).toBeCloseTo(0.1);
  });

  it("delegates pointer-lock gating and accepts locked pointer deltas without a mouse button", () => {
    const external = camera(0, 0, 0);
    const controls = new PointerLockControls(external, { moveSpeed: 2, lookSpeed: 0.01 });
    const lockedPointerMotion = snapshot({
      pointer: { deltaX: 10, deltaY: 20 }
    });

    controls.applyInput(lockedPointerMotion, 0.5);
    expect(external.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(external.rotation).toEqual({ x: 0, y: 0, z: 0 });

    controls.lock();
    controls.applyInput(lockedPointerMotion, 0.5);
    expect(controls.locked).toBe(true);
    expect(external.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(external.rotation.x).toBeCloseTo(-0.2);
    expect(external.rotation.y).toBeCloseTo(-0.1);
    expect(controls.state.rotation).toEqual(external.rotation);

    controls.applyInput(snapshot({ keys: new Set(["KeyW"]) }), 0.5);
    expect(Math.hypot(external.position.x, external.position.z)).toBeCloseTo(1);

    controls.unlock();
    const stopped = { position: { ...external.position }, rotation: { ...external.rotation } };
    controls.applyInput(lockedPointerMotion, 0.5);
    expect(external.position).toEqual(stopped.position);
    expect(external.rotation).toEqual(stopped.rotation);
  });

  it("uses delegated MapControls mouse conventions and a delegated state camera", () => {
    const external = camera(0, 0, 5);
    const controls = new MapControls(external);
    const initialDistance = controls.getDistance();

    controls.applyInput(snapshot({
      pointer: {
        deltaX: 100,
        buttons: new Map([[0, button()]])
      }
    }));
    expect(controls.getAzimuthalAngle()).toBeCloseTo(0);
    expect(controls.state.target.x).toBeLessThan(0);

    const targetAfterPan = controls.state.target.clone();
    controls.applyInput(snapshot({
      pointer: {
        deltaX: 100,
        buttons: new Map([[2, button()]])
      }
    }));
    expect(controls.getAzimuthalAngle()).toBeCloseTo(-0.5);
    expect(controls.state.target).toEqual(targetAfterPan);

    controls.applyInput(snapshot({
      pointer: {
        deltaY: 100,
        buttons: new Map([[1, button()]])
      }
    }));
    expect(controls.getDistance()).toBeGreaterThan(initialDistance);

    const stateBacked = new MapControls();
    expect(stateBacked.isCameraAttached).toBe(true);
    expect(stateBacked.hasExternalCamera).toBe(false);
    stateBacked.truck(3, 4);
    expect(stateBacked.state.target).toMatchObject({ x: 3, z: 4 });
    expect(stateBacked.state.position.x).toBeCloseTo(3);
  });

  it("owns observable selection with no-op suppression, toggle, and prune", () => {
    const first = object("first");
    const second = object("second");
    const third = object("third");
    const selection = new SelectionManager();
    const changes: Array<{
      current: readonly ControlObject3DLike[];
      added: readonly ControlObject3DLike[];
      removed: readonly ControlObject3DLike[];
    }> = [];
    const unsubscribe = selection.subscribe(({ current, added, removed }) => {
      changes.push({ current, added, removed });
    });

    selection.select(first);
    selection.select(first);
    selection.select(second, true);
    selection.toggle(first);
    selection.select(third, true);
    selection.prune((candidate) => candidate !== second);

    expect(changes).toHaveLength(5);
    expect(changes[0]).toMatchObject({ current: [first], added: [first], removed: [] });
    expect(changes[2]).toMatchObject({ current: [second], added: [], removed: [first] });
    expect(selection.current()).toEqual([third]);
    expect(Object.isFrozen(selection.current())).toBe(true);
    expect(selection.has(third)).toBe(true);
    expect(selection.selected.has(second)).toBe(false);

    unsubscribe();
    selection.clear();
    expect(changes).toHaveLength(5);
    selection.dispose();
  });

  it("keeps legacy delta shims functional while exposing typed deprecation contracts", () => {
    const target = object("target");
    const transforms = new TransformControls();
    transforms.attach(target);
    transforms.apply(new ControlVector3(1, 2, 3));
    transforms.setMode("rotate");
    transforms.apply(new ControlVector3(0.1, 0.2, 0.3));
    transforms.setMode("scale");
    transforms.apply(new ControlVector3(1, 1, 1));

    expect(target.position).toEqual(new ControlVector3(1, 2, 3));
    expect(target.rotation).toEqual(new ControlVector3(0.1, 0.2, 0.3));
    expect(target.scale).toEqual(new ControlVector3(2, 2, 2));
    expect(TRANSFORM_CONTROLS_DEPRECATION).toMatchObject({
      status: "deprecated",
      replacement: "@aura3d/editor-runtime transform gizmos"
    });

    const dragTarget = object("drag-target");
    const drag = new DragControls();
    drag.start(dragTarget);
    drag.drag(new ControlVector3(2, 0, -1));
    drag.end();
    drag.drag(new ControlVector3(10, 0, 0));
    expect(dragTarget.position).toEqual(new ControlVector3(2, 0, -1));
    expect(drag.dragging).toBeNull();
    expect(DRAG_CONTROLS_DEPRECATION).toMatchObject({
      status: "deprecated",
      replacement: "@aura3d/input InteractionSystem + @aura3d/editor-runtime transform commands"
    });
  });
});

function camera(x: number, y: number, z: number): {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
} {
  return {
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0 }
  };
}

function object(name: string): ControlObject3DLike {
  return {
    name,
    position: new ControlVector3(),
    rotation: new ControlVector3(),
    scale: new ControlVector3(1, 1, 1)
  };
}

function snapshot(options: ConstructorParameters<typeof InputSnapshot>[0] = {}): InputSnapshot {
  return new InputSnapshot(options);
}

function button(): { readonly down: true; readonly pressed: true; readonly released: false } {
  return { down: true, pressed: true, released: false };
}
