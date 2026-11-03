// @ts-nocheck
import { describe, expect, it } from "vitest";
import { InputSnapshot } from "@aura3d/input";
import { OrbitControls } from "../../../packages/controls/src/engine/OrbitControls";

describe("OrbitControls", () => {
  it("orbits a camera and dollies in response to pointer and wheel input", () => {
    const camera = createCamera();
    const controls = new OrbitControls(camera, {
      target: { x: 0, y: 0, z: 0 },
      distance: 10,
      minDistance: 0.1,
      maxDistance: 1000,
      minPolar: 0.001,
      maxPolar: Math.PI - 0.001,
      rotateSpeed: 2 * Math.PI / 720,
      zoomSpeed: 1
    });

    controls.update(new InputSnapshot({
      pointer: { deltaX: 60, deltaY: 30, buttons: new Map([[0, { down: true, pressed: true, released: false }]]) }
    }));

    // A 60-by-30 pixel drag at one turn per 720 pixels moves the camera
    // 30 degrees around the target and 15 degrees toward the north pole.
    expect(controls.getAzimuthalAngle()).toBeCloseTo(-Math.PI / 6, 5);
    expect(controls.getPolarAngle()).toBeCloseTo(5 * Math.PI / 12, 5);
    expect(controls.getDistance()).toBeCloseTo(10, 5);

    controls.update(new InputSnapshot({ pointer: { wheelY: 100 } }));

    // A positive 100-unit wheel step scales the distance by 1 / 0.95.
    const distance = 200 / 19;
    const sin75 = (Math.sqrt(6) + Math.sqrt(2)) / 4;
    const cos75 = (Math.sqrt(6) - Math.sqrt(2)) / 4;
    expect(controls.getAzimuthalAngle()).toBeCloseTo(-Math.PI / 6, 5);
    expect(controls.getPolarAngle()).toBeCloseTo(5 * Math.PI / 12, 5);
    expect(controls.getDistance()).toBeCloseTo(distance, 5);
    expect(camera.position.x).toBeCloseTo(-distance * sin75 / 2, 5);
    expect(camera.position.y).toBeCloseTo(distance * cos75, 5);
    expect(camera.position.z).toBeCloseTo(distance * sin75 * Math.sqrt(3) / 2, 5);
    expect(camera.lookAtCalls.at(-1)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("supports pan, saveState, reset, and disable flags through the public A3D API", () => {
    const camera = createCamera();
    const controls = new OrbitControls(camera, {
      distance: 8,
      target: { x: 1, y: 0, z: -1 },
      panSpeed: 0.01,
      enableRotate: false
    });
    const before = { ...camera.position };
    controls.update(new InputSnapshot({
      pointer: { deltaX: 100, buttons: new Map([[0, { down: true, pressed: true, released: false }]]) }
    }));
    expect(camera.position.x).toBeCloseTo(before.x);
    expect(camera.position.y).toBeCloseTo(before.y);
    expect(camera.position.z).toBeCloseTo(before.z);

    controls.update(new InputSnapshot({
      pointer: { deltaX: 10, deltaY: -5, buttons: new Map([[2, { down: true, pressed: true, released: false }]]) }
    }));
    expect(controls.target.x).toBeCloseTo(0.2);
    expect(controls.target.y).toBeCloseTo(-0.4);
    expect(controls.target.z).toBeCloseTo(-1);
    const savedPosition = { ...camera.position };
    controls.saveState();

    controls.update(new InputSnapshot({ pointer: { wheelY: 100 } }));
    expect(controls.getDistance()).toBeCloseTo(8 / 0.95);
    controls.reset();
    expect(controls.target.x).toBeCloseTo(0.2);
    expect(controls.target.y).toBeCloseTo(-0.4);
    expect(controls.target.z).toBeCloseTo(-1);
    expect(controls.getDistance()).toBeCloseTo(8);
    expect(camera.position.x).toBeCloseTo(savedPosition.x);
    expect(camera.position.y).toBeCloseTo(savedPosition.y);
    expect(camera.position.z).toBeCloseTo(savedPosition.z);
  });

  it("ignores subsequent input after disposal", () => {
    const camera = createCamera();
    const controls = new OrbitControls(camera, { maxPolar: Math.PI - 0.001 });
    const position = { ...camera.position };
    const lookAtCount = camera.lookAtCalls.length;

    controls.dispose();
    controls.update(new InputSnapshot({
      pointer: {
        deltaX: 30,
        wheelY: 100,
        buttons: new Map([[0, { down: true, pressed: true, released: false }]])
      }
    }));

    expect(camera.position).toEqual(position);
    expect(camera.lookAtCalls).toHaveLength(lookAtCount);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(0);
    expect(controls.getDistance()).toBeCloseTo(10);
  });
});

function createCamera(): { position: { x: number; y: number; z: number }; lookAtCalls: Array<{ x: number; y: number; z: number }>; lookAt(target: { x: number; y: number; z: number }): void } {
  return {
    position: { x: 0, y: 0, z: 10 },
    lookAtCalls: [],
    lookAt(target) {
      this.lookAtCalls.push({ ...target });
    }
  };
}
