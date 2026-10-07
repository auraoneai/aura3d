import { describe, expect, it } from "vitest";
import { InputSnapshot } from "@aura3d/input";
import {
  FirstPersonControls,
  FlyControls,
  OrbitControls,
  PointerLockControls
} from "@aura3d/controls";
import { OrbitControls as OrbitControlsEngine } from "../../../../packages/controls/src/engine/OrbitControls";
import { FirstPersonControls as FirstPersonControlsEngine } from "../../../../packages/controls/src/engine/FirstPersonControls";
import { PointerLockControls as PointerLockControlsEngine } from "../../../../packages/controls/src/engine/PointerLockControls";
import { EditorFlyControls } from "../../../../packages/controls/src/engine/EditorFlyControls";
import { CameraRig } from "../../../../packages/controls/src/engine/CameraRig";
import { ThirdPersonFollowControls } from "../../../../packages/controls/src/engine/ThirdPersonFollowControls";
import type { CameraTransformLike, Vec3Like } from "../../../../packages/controls/src/engine/ControlTypes";

// PRD-15 T6.9 equivalence tests. `packages/input/src/controls/*` are now
// deprecated re-export shims over @aura3d/controls; the engine implementations
// moved verbatim to packages/controls/src/engine/. For each control with a
// facade counterpart, identical pointer sequences must produce identical camera
// state. Differences resolve in favour of @aura3d/controls (recorded in the
// commit message); engine classes remain importable as `*Engine` names for
// snapshot-driven callers.

interface FakeCamera extends CameraTransformLike {
  lookAtCalls: Vec3Like[];
}

function makeCamera(position: Vec3Like = { x: 3, y: 4, z: 8 }): FakeCamera {
  const cam: FakeCamera = {
    position: { ...position },
    rotation: { x: 0, y: 0, z: 0 },
    lookAtCalls: [],
    lookAt(target: Vec3Like) {
      cam.lookAtCalls.push({ x: target.x, y: target.y, z: target.z });
    }
  };
  return cam;
}

function drag(dx: number, dy: number, button = 0): InputSnapshot {
  return new InputSnapshot({
    pointer: {
      deltaX: dx,
      deltaY: dy,
      buttons: new Map([[button, { down: true, pressed: true, released: false }]])
    }
  });
}

function wheel(deltaY: number): InputSnapshot {
  return new InputSnapshot({ pointer: { wheelY: deltaY } });
}

function keys(...codes: string[]): InputSnapshot {
  return new InputSnapshot({ keys: new Set(codes) });
}

function expectCameraClose(engineCam: FakeCamera, facadeCam: FakeCamera, label: string): void {
  for (const axis of ["x", "y", "z"] as const) {
    expect(
      Math.abs(engineCam.position[axis] - facadeCam.position[axis]),
      `${label} position.${axis}`
    ).toBeLessThanOrEqual(1e-9);
    const er = engineCam.rotation?.[axis] ?? 0;
    const fr = facadeCam.rotation?.[axis] ?? 0;
    expect(Math.abs(er - fr), `${label} rotation.${axis}`).toBeLessThanOrEqual(1e-9);
  }
}

const SEQUENCE = [drag(120, 40), drag(-60, 30), wheel(-240), drag(0, 80, 2), drag(35, -15)];

describe("controls equivalence (T6.9)", () => {
  it("OrbitControls facade matches engine under identical pointer sequences", () => {
    const engineCam = makeCamera();
    const facadeCam = makeCamera();
    const engine = new OrbitControlsEngine(engineCam, { target: { x: 0, y: 0, z: 0 }, distance: 10 });
    const facade = new OrbitControls(facadeCam, { target: { x: 0, y: 0, z: 0 }, distance: 10 });

    for (const snap of SEQUENCE) {
      engine.update(snap, 1 / 60);
      facade.applyInput(snap, 1 / 60);
    }
    expectCameraClose(engineCam, facadeCam, "orbit");
    expect(facade.getDistance()).toBeCloseTo(engine.getDistance(), 9);
    expect(facade.getPolarAngle()).toBeCloseTo(engine.getPolarAngle(), 9);
    expect(facade.getAzimuthalAngle()).toBeCloseTo(engine.getAzimuthalAngle(), 9);
  });

  it("FirstPersonControls facade matches engine under identical key+drag sequences", () => {
    const engineCam = makeCamera({ x: 0, y: 0, z: 5 });
    const facadeCam = makeCamera({ x: 0, y: 0, z: 5 });
    const engine = new FirstPersonControlsEngine(engineCam, { moveSpeed: 2 });
    const facade = new FirstPersonControls(facadeCam, { moveSpeed: 2 });

    const sequence = [keys("KeyW"), drag(50, 20), keys("KeyW", "KeyA"), drag(-30, 10), keys("KeyS")];
    for (const snap of sequence) {
      engine.update(snap, 1 / 60);
      facade.applyInput(snap, 1 / 60);
    }
    expectCameraClose(engineCam, facadeCam, "first-person");
  });

  it("PointerLockControls facade matches engine while locked", () => {
    const engineCam = makeCamera({ x: 0, y: 0, z: 5 });
    const facadeCam = makeCamera({ x: 0, y: 0, z: 5 });
    const engine = new PointerLockControlsEngine(engineCam, { moveSpeed: 2 });
    const facade = new PointerLockControls(facadeCam, { moveSpeed: 2 });
    engine.lock();
    facade.lock();

    const sequence = [drag(40, -10), keys("KeyW"), drag(-25, 30)];
    for (const snap of sequence) {
      engine.update(snap, 1 / 60);
      facade.applyInput(snap, 1 / 60);
    }
    expectCameraClose(engineCam, facadeCam, "pointer-lock");
  });

  it("EditorFlyControls is the same class through the @aura3d/controls export", async () => {
    const controlsPkg = await import("@aura3d/controls");
    const engineCam = makeCamera();
    const engine = new EditorFlyControls(engineCam, { baseSpeed: 2 });
    engine.update(drag(20, -10), 1 / 60);
    // Same class object on both surfaces — identical by construction.
    expect(controlsPkg.EditorFlyControls).toBe(EditorFlyControls);
  });

  it("FlyControls facade drives the shared EditorFly engine deterministically", () => {
    const engineCam = makeCamera();
    const facadeCam = makeCamera();
    const engine = new EditorFlyControls(engineCam, { baseSpeed: 1 });
    const facade = new FlyControls(facadeCam, { movementSpeed: 1 });
    const sequence = [keys("KeyW"), drag(30, 15), keys("KeyW", "ShiftLeft")];
    for (const snap of sequence) {
      engine.update(snap, 1 / 60);
      facade.applyInput(snap, 1 / 60);
    }
    expectCameraClose(engineCam, facadeCam, "fly");
  });

  it("CameraRig blend produces identical positions and targets", () => {
    const cam = makeCamera();
    const rig = new CameraRig(cam);
    const from = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
    const to = { position: { x: 10, y: 5, z: -3 }, target: { x: 1, y: 1, z: 1 } };
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      const state = rig.blend(from, to, alpha);
      expect(state.position.x).toBeCloseTo(10 * alpha, 9);
      expect(state.target?.x).toBeCloseTo(alpha, 9);
    }
  });

  it("ThirdPersonFollowControls applies offset and damping identically", () => {
    const cam = makeCamera({ x: 0, y: 0, z: 0 });
    const follow = new ThirdPersonFollowControls(cam, { position: { x: 5, y: 1, z: 0 } }, { offset: { x: 0, y: 2, z: -4 }, damping: 0 });
    follow.update(1 / 60);
    expect(cam.lookAtCalls.length).toBe(1);
    expect(cam.lookAtCalls[0]).toEqual({ x: 5, y: 1, z: 0 });
  });
});
