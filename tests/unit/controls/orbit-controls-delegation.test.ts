import { InputSnapshot } from "@aura3d/input";
import { describe, expect, it } from "vitest";
import { MapControls, OrbitControls } from "../../../packages/controls/src";

function camera(x = 0, y = 0, z = 5): { position: { x: number; y: number; z: number }; lookAt(target: { x: number; y: number; z: number }): void; lookAtCalls: number } {
  return {
    position: { x, y, z },
    lookAtCalls: 0,
    lookAt(): void {
      this.lookAtCalls += 1;
    }
  };
}

function drag(button: number, deltaX: number, deltaY: number): InputSnapshot {
  return new InputSnapshot({
    pointer: { deltaX, deltaY, buttons: new Map([[button, { down: true, pressed: true, released: false }]]) }
  });
}

// The engine clamps polar into [minPolar, DEFAULT_ORBIT_MAX_POLAR] in its
// constructor and applies immediately, so a camera handed in at (0, 0, d) is
// repositioned onto the clamped sphere before any input arrives.
const CLAMPED_POLAR = Math.PI * 0.37;
const SIN_CLAMPED = Math.sin(CLAMPED_POLAR);

describe("controls OrbitControls camera-attached delegation", () => {
  it("applies the engine polar clamp to the camera on construction", () => {
    const cam = camera(0, 0, 5);
    const orbit = new OrbitControls(cam);

    expect(orbit.getPolarAngle()).toBeCloseTo(CLAMPED_POLAR, 10);
    expect(cam.position.y).toBeCloseTo(5 * Math.cos(CLAMPED_POLAR), 10);
    expect(cam.position.z).toBeCloseTo(5 * SIN_CLAMPED, 10);
    expect(Math.hypot(cam.position.x, cam.position.y, cam.position.z)).toBeCloseTo(5, 10);
  });

  it("keeps the camera on the orbit sphere and preserves distance while rotating", () => {
    const cam = camera(0, 0, 5);
    const orbit = new OrbitControls(cam);

    expect(orbit.isCameraAttached).toBe(true);
    expect(orbit.getDistance()).toBeCloseTo(5, 10);

    orbit.rotate(100, 0);

    const radius = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
    expect(radius).toBeCloseTo(5, 10);
    // rotateSpeed default 0.005, azimuth -= deltaX * 0.005 => -0.5 rad
    expect(orbit.getAzimuthalAngle()).toBeCloseTo(-0.5, 10);
    expect(cam.position.x).toBeCloseTo(5 * SIN_CLAMPED * Math.sin(-0.5), 10);
    expect(cam.position.z).toBeCloseTo(5 * SIN_CLAMPED * Math.cos(-0.5), 10);
    expect(cam.lookAtCalls).toBeGreaterThan(0);
  });

  it("clamps the polar angle to the engine maximum instead of flipping over the pole", () => {
    const cam = camera(0, 0, 5);
    const orbit = new OrbitControls(cam);

    orbit.rotate(0, -10_000);

    // DEFAULT_ORBIT_MAX_POLAR = PI * 0.37
    expect(orbit.getPolarAngle()).toBeCloseTo(Math.PI * 0.37, 10);
    expect(cam.position.y).toBeCloseTo(5 * Math.cos(Math.PI * 0.37), 10);
  });

  it("clamps dolly to the configured distance range", () => {
    const cam = camera(0, 0, 5);
    const orbit = new OrbitControls(cam, { minDistance: 3, maxDistance: 8 });

    for (let i = 0; i < 200; i += 1) orbit.dolly(0.5);
    expect(orbit.getDistance()).toBeCloseTo(3, 10);

    for (let i = 0; i < 400; i += 1) orbit.dolly(2);
    expect(orbit.getDistance()).toBeCloseTo(8, 10);
  });

  it("scales pan by distance and moves both target and camera", () => {
    const cam = camera(0, 0, 10);
    const orbit = new OrbitControls(cam);
    const startX = cam.position.x;

    orbit.pan(100, 0);

    // panSpeed default 0.002, scale = distance * panSpeed = 0.02, target.x -= 100 * 0.02
    expect(orbit.state.target.x).toBeCloseTo(-2, 10);
    expect(cam.position.x).toBeCloseTo(startX - 2, 10);
    expect(orbit.getDistance()).toBeCloseTo(10, 10);
  });

  it("honours enable flags pushed through to the engine", () => {
    const cam = camera(0, 0, 5);
    const orbit = new OrbitControls(cam);
    orbit.enableRotate = false;
    orbit.enablePan = false;
    orbit.enableZoom = false;

    orbit.applyInput(drag(0, 250, 250));
    orbit.applyInput(new InputSnapshot({ pointer: { wheelY: -500 } }));

    expect(orbit.getAzimuthalAngle()).toBeCloseTo(0, 10);
    expect(orbit.state.target.x).toBeCloseTo(0, 10);
    expect(orbit.getDistance()).toBeCloseTo(5, 10);
  });

  it("restores a saved pose through saveState and reset", () => {
    const cam = camera(0, 0, 6);
    const orbit = new OrbitControls(cam);
    orbit.saveState();

    orbit.rotate(120, -40);
    orbit.dolly(0.5);
    expect(orbit.getAzimuthalAngle()).not.toBeCloseTo(0, 6);

    orbit.reset();

    expect(orbit.getAzimuthalAngle()).toBeCloseTo(0, 10);
    expect(orbit.getDistance()).toBeCloseTo(6, 10);
    expect(cam.position.z).toBeCloseTo(6 * SIN_CLAMPED, 10);
    expect(cam.position.y).toBeCloseTo(6 * Math.cos(CLAMPED_POLAR), 10);
  });

  it("stops responding after dispose", () => {
    const cam = camera(0, 0, 5);
    const orbit = new OrbitControls(cam);
    orbit.dispose();
    const before = orbit.getAzimuthalAngle();

    orbit.applyInput(drag(0, 300, 0));

    expect(orbit.getAzimuthalAngle()).toBeCloseTo(before, 10);
  });
});

describe("controls OrbitControls detached placeholder mode", () => {
  it("only accumulates bookkeeping numbers and reports no camera attachment", () => {
    const orbit = new OrbitControls();

    expect(orbit.isCameraAttached).toBe(false);
    orbit.rotate(0.2, 0.1);
    orbit.pan(1, 2);
    orbit.dolly(0.5);

    expect(orbit.state.rotation.x).toBe(0.1);
    expect(orbit.state.rotation.y).toBe(0.2);
    expect(orbit.state.target.x).toBe(1);
    expect(orbit.state.position.z).toBe(2.5);
    expect(orbit.getDistance()).toBe(0);
    expect(orbit.getAzimuthalAngle()).toBe(0);
  });
});

describe("controls MapControls", () => {
  it("trucks the real orbit target on the ground plane when camera-attached", () => {
    const cam = camera(0, 0, 5);
    const map = new MapControls(cam);

    map.truck(3, 4);

    expect(map.state.target.x).toBeCloseTo(3, 10);
    expect(map.state.target.z).toBeCloseTo(4, 10);
    expect(cam.position.x).toBeCloseTo(3, 10);
    expect(cam.position.z).toBeCloseTo(4 + 5 * SIN_CLAMPED, 10);
    expect(map.screenSpacePanning).toBe(false);
  });

  it("keeps detached truck bookkeeping behaviour", () => {
    const map = new MapControls();
    map.truck(3, 4);
    expect(map.state.target.x).toBe(3);
    expect(map.state.target.z).toBe(4);
  });
});
